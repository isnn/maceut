# tasks.md — Schedule Management & Capture History Implementation

> Update checklist ini saat mengerjakan task.
> Tambahkan catatan di bawah item jika ada keputusan teknis yang dibuat.

---

## Phase 1: Database & Schema

- [ ] **Schema: `schedules`** — `drizzle/schema.ts`
  - [ ] id, userId (FK), zoneId (FK), name, cronExpr, status (pgEnum: active/paused/deleted), createdAt, updatedAt
  - [ ] Index (userId, status) untuk count active schedules (BR-005)

- [ ] **Verifikasi index captures** dari spec zone-management sudah ada:
  - [ ] (userId, createdAt DESC) untuk history query
  - [ ] Query daily count pakai `AT TIME ZONE 'Asia/Jakarta'` (BR-006)

---

## Phase 2: Backend / API

> Setiap route wajib: Swagger JSDoc annotation + unit test di file `*.controller.test.ts`
> Jalankan `pnpm test` sebelum tandai task selesai.

- [ ] **Types** — `src/types/schedule.ts`
  - [ ] `Schedule`, `ScheduleStatus` (union type), `CreateScheduleInput`, `UpdateScheduleInput`
  - [ ] Zod schema `createScheduleSchema`

- [ ] **Repository: schedule.repository.ts** — `src/repositories/schedule.repository.ts`
  - [ ] `create`
  - [ ] `findById`
  - [ ] `findByUserId` — exclude deleted
  - [ ] `findAllActive` — untuk scheduler load (ALL users)
  - [ ] `countActiveByUserId` — untuk BR-005
  - [ ] `updateStatus` (pause/resume/delete)
  - [ ] `updateCronExpr`

- [ ] **Service: schedule.service.ts** — `src/services/schedule.service.ts`
  - [ ] `createSchedule` — check BR-005 sebelum insert
  - [ ] `pauseSchedule` — verify ownership → update status
  - [ ] `resumeSchedule` — check BR-005 (hitung apakah masih ada slot) → update status
  - [ ] `deleteSchedule` — soft delete (status = deleted)
  - [ ] `updateSchedule` — hanya nama dan cronExpr

- [ ] **Controller + Routes: schedule** — `src/controllers/schedule.controller.ts`, `src/routes/schedule.routes.ts`
  - [ ] `GET /schedules`
  - [ ] `POST /schedules`
  - [ ] `PATCH /schedules/:id`
  - [ ] `DELETE /schedules/:id`
  - [ ] `POST /schedules/:id/pause`
  - [ ] `POST /schedules/:id/resume`
  - [ ] Swagger JSDoc annotation lengkap per route

---

## Phase 3: Backend — Scheduler & Worker Integration

- [ ] **Scheduler** — `src/schedulers/cron-scheduler.ts`
  - [ ] Saat startup (di proses worker atau proses terpisah): load semua active schedule via `scheduleRepository.findAllActive()`
  - [ ] Daftarkan cron job per schedule menggunakan `node-cron`
  - [ ] Simpan referensi task node-cron dalam `Map<scheduleId, ScheduledTask>` untuk hot-reload
  - [ ] Saat cron trigger: `captureService.triggerScheduled(scheduleId)` → create capture record → publish ke RabbitMQ
  - [ ] Hot-reload: expose `addSchedule(schedule)`, `removeSchedule(scheduleId)`, `updateSchedule(schedule)` — stop task lama via `.stop()`, buat task baru
  - [ ] `schedule.service.ts` memanggil fungsi hot-reload scheduler setelah create/pause/resume/delete

- [ ] **Capture Worker — extend untuk scheduled capture** — `src/workers/capture.worker.ts`
  - [ ] Payload job sudah punya `scheduleId` (nullable) — pastikan di-set saat trigger scheduled
  - [ ] Sama dengan manual capture flow tapi set `scheduleId` di capture record

- [ ] **Usage Controller + Route** — `src/controllers/usage.controller.ts`, `src/routes/usage.routes.ts`
  - [ ] `GET /usage` → return: activeSchedulesCount, dailyCapturesCount, dailyCapturesLimit, plan
  - [ ] Swagger annotation

---

## Phase 4: Frontend

- [ ] **Schedule List Page** — `app/(dashboard)/schedules/page.tsx`
  - [ ] Fetch via `features/schedules/api.ts`
  - [ ] Schedule card: nama, zona, cron expression (human-readable), status badge, total captures
  - [ ] Tombol Pause / Resume per card
  - [ ] Tombol Hapus dengan confirmation dialog (Base UI Dialog)
  - [ ] Empty state + CTA buat schedule pertama
  - [ ] Tombol "Buat Schedule" disabled + tooltip jika sudah 10 active (BR-005)

- [ ] **Create Schedule Drawer** — `features/schedules/components/ScheduleCreateDrawer.tsx`
  - [ ] Field: nama schedule, pilih zona (Select dari daftar zones user), cron input
  - [ ] Cron helper: preset dropdown (setiap jam, setiap hari jam 7, setiap hari jam 18, dll)
  - [ ] Tampilkan preview "jadwal berikutnya" berdasarkan cron expression yang diinput
  - [ ] Inline validation cron expression

- [ ] **Capture History Page** — `app/(dashboard)/captures/page.tsx`
  - [ ] Fetch via `features/captures/api.ts` dengan pagination
  - [ ] Filter bar: zona, status, date range
  - [ ] Capture item: zona, waktu, trigger, status badge, ukuran file
  - [ ] Preview thumbnail untuk status `done`
  - [ ] Download button → hit `GET /captures/:id/download` (presigned URL R2)
  - [ ] "Coba Lagi" button untuk status `failed`
  - [ ] Info text untuk status `skipped_limit`
  - [ ] Empty state

- [ ] **Usage Summary di Dashboard** — `app/(dashboard)/page.tsx`
  - [ ] Fetch `GET /usage`
  - [ ] Tampilkan: captures hari ini (X/100), schedules aktif (X/10), plan badge

---

## Phase 5: Integration & Edge Cases

- [ ] Test: buat 10 schedule aktif → schedule ke-11 ditolak dengan SCHEDULE_LIMIT_EXCEEDED
- [ ] Test: pause schedule ke-10 → buat schedule baru → berhasil
- [ ] Test: resume schedule saat sudah 10 active → ditolak
- [ ] Test: cron trigger → capture record dibuat → worker proses → status `done`
- [ ] Test: zona dihapus → scheduled capture berstatus `failed` dengan error "Zone not found"
- [ ] Test: download capture → presigned URL R2 berfungsi
- [ ] Test: filter capture history by zona + status

---

## Decisions Made

*(Catat keputusan teknis yang dibuat saat implementasi)*

```
[YYYY-MM-DD] Keputusan: Gunakan node-cron untuk scheduler in-process
  Alasan: Library ringan, simple API, cukup untuk MVP dengan 10 schedules/user
  Trade-off: Tidak fault-tolerant jika server restart — schedules perlu reload dari DB saat startup
```
