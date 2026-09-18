# tasks.md — Subscription & Usage Implementation

> Update checklist ini saat mengerjakan task.
> Tambahkan catatan di bawah item jika ada keputusan teknis yang dibuat.

---

## Phase 1: Database & Schema

- [ ] **Verifikasi tabel `user_plans`** sudah ada
  - [ ] Pastikan enum plan: `free`, `standard`, `premium`
  - [ ] Pastikan index pada `user_id` untuk lookup cepat

- [ ] **Verifikasi index harian di `captures`**
  - [ ] Index `(user_id, DATE(created_at AT TIME ZONE 'Asia/Jakarta'))` untuk daily count WIB
  - [ ] Atau computed column jika PostgreSQL version support

---

## Phase 2: Backend / API

> Setiap route wajib: Swagger JSDoc annotation + unit test di file `*.controller.test.ts`
> Jalankan `pnpm test` sebelum tandai task selesai.

- [ ] **Types** — `src/types/plan.ts`
  - [ ] `Plan` union type (`'free' | 'standard' | 'premium'`)
  - [ ] `RoadClass` union type (`'nasional' | 'nasional_provinsi' | 'semua'`)
  - [ ] `PlanLimits` interface: `maxActiveSchedules`, `maxDailyCaptures`, `maxRoadClass`
  - [ ] `getLimitsForPlan(plan: Plan): PlanLimits` — single source of truth untuk semua limit (konstanta, bukan DB)
    - Free → `{ maxActiveSchedules: 10, maxDailyCaptures: 10 }`
    - Standard → `{ maxActiveSchedules: 20, maxDailyCaptures: 50 }`
    - Premium → `{ maxActiveSchedules: 50, maxDailyCaptures: 100 }`
  - [ ] `ROAD_CLASS_ORDER: RoadClass[]` — `['nasional', 'nasional_provinsi', 'semua']` untuk perbandingan urutan (dipakai BR-021, BR-022)

- [ ] **Service: plan.service.ts** — `src/services/plan.service.ts`
  - [ ] `getUserPlan(userId): Promise<Plan>`
  - [ ] `getMaxRoadClass(plan: Plan): RoadClass` — road class **maksimal** yang boleh dipilih user saat create zona (BR-001..003)
    - Free → `'nasional'`
    - Standard → `'nasional_provinsi'`
    - Premium → `'semua'`
  - [ ] `isRoadClassAllowed(requested: RoadClass, plan: Plan): boolean` — bandingkan index di `ROAD_CLASS_ORDER` (dipakai zone.service saat create, BR-021)
  - [ ] `roadClassToFcList(roadClass: RoadClass): string[]` — mapping ke HERE FC classes
    - `nasional` → `['FC1','FC2']`
    - `nasional_provinsi` → `['FC1','FC2','FC3']`
    - `semua` → `['FC1','FC2','FC3','FC4','FC5']`
  - [ ] `checkDailyCaptureLimit(userId): Promise<{ current, limit, exceeded }>` — pakai timezone WIB
  - [ ] `checkActiveScheduleLimit(userId): Promise<{ current, limit, exceeded }>`

- [ ] **Enforcement di capture.service.ts** — `src/services/capture.service.ts`
  - [ ] `triggerManual`: panggil `planService.checkDailyCaptureLimit` sebelum buat capture record
  - [ ] `triggerScheduled`: sama, tapi jika exceeded → update capture status ke `skipped_limit` (BR-008), jangan throw ke worker
  - [ ] Gunakan Drizzle transaction (`db.transaction()`) dengan row lock untuk hindari race condition saat count

- [ ] **Enforcement di schedule.service.ts** — `src/services/schedule.service.ts`
  - [ ] `createSchedule`: panggil `planService.checkActiveScheduleLimit` sebelum insert
  - [ ] `resumeSchedule`: sama sebelum update status ke active

- [ ] **Road Class Efektif di capture.service.ts / Playwright** — `src/services/capture.service.ts`
  - [ ] Saat trigger capture: ambil `zone.roadClass` (tersimpan) dan `planService.getMaxRoadClass(currentPlan)`
  - [ ] Hitung `effectiveRoadClass = MIN keduanya` berdasarkan index `ROAD_CLASS_ORDER` (BR-022)
  - [ ] Convert ke FC list via `planService.roadClassToFcList(effectiveRoadClass)` → pass ke Playwright config
  - [ ] Playwright menggunakan FC filter saat render HERE Maps layer (jalan di luar FC yang diizinkan tidak di-render)

- [ ] **Controller + Routes: usage** — `src/controllers/usage.controller.ts`, `src/routes/usage.routes.ts`
  - [ ] `GET /usage`:
    - [ ] Count captures hari ini (WIB) via `captureRepository.countTodayByUserId`
    - [ ] Count active schedules via `scheduleRepository.countActiveByUserId`
    - [ ] Return plan, capturesToday, capturesLimit, schedulesActive, schedulesLimit
  - [ ] `GET /plans` → return daftar plan dengan fitur dan limit masing-masing (static data dari `getLimitsForPlan`, tidak dari DB)
  - [ ] Swagger annotation untuk kedua route

---

## Phase 3: Frontend

- [ ] **Usage Widget** — `features/subscription/components/UsageWidget.tsx`
  - [ ] Fetch `GET /usage` via `features/subscription/api.ts`
  - [ ] Progress bar: captures hari ini (X/capturesLimit sesuai plan)
  - [ ] Progress bar: schedules aktif (X/schedulesLimit sesuai plan)
  - [ ] Plan badge (Free / Standard / Premium)
  - [ ] Warning state ≥ 80%, critical state = 100%
  - [ ] Auto-refresh setiap 30 detik (`setInterval` + `clearInterval` on unmount)
  - [ ] Fallback ke data terakhir jika fetch gagal (jangan crash)

- [ ] **Plans Page** — `app/(dashboard)/settings/plans/page.tsx`
  - [ ] Fetch `GET /plans`
  - [ ] Tabel perbandingan: Free / Standard / Premium
  - [ ] Highlight plan aktif user
  - [ ] Tombol upgrade (untuk MVP: link ke halaman kontak / waitlist)
  - [ ] User Premium: tampilkan konfirmasi "Anda di plan tertinggi"

- [ ] **Road Class Indicator** — `features/zones/components/ZoneCard.tsx`
  - [ ] Tampilkan badge di zone card sesuai `zone.roadClass` yang tersimpan (bukan lagi dihitung dari plan user saat ini)
  - [ ] Jika `zone.roadClass` melebihi batas plan aktif user (kasus downgrade, BR-022), tampilkan badge dengan indikator kecil "(disesuaikan ke plan saat ini)" di samping badge

- [ ] **Upgrade Modal (shared)** — `components/ui/UpgradeModal.tsx`
  - [ ] Dipakai di Step 2 stepper zona (`StepRoadClass.tsx`) saat user pilih road class melebihi plan
  - [ ] Isi: judul "Fitur ini butuh plan lebih tinggi", deskripsi singkat, tombol "Lihat Plan" (→ `/settings/plans`) dan "Tutup"

- [ ] **Limit Exceeded State** — di ManualCaptureButton dan ScheduleCreateDrawer
  - [ ] ManualCapture: jika `captures_today >= capturesLimit` (plan aktif) → disable tombol + pesan "Batas hari ini tercapai. Reset 00:00 WIB"
  - [ ] ScheduleCreate: jika `schedules_active >= schedulesLimit` (plan aktif) → disable tombol "Buat Schedule" + tooltip

---

## Phase 4: Integration & Edge Cases

- [ ] Test: capture ke-101 → `skipped_limit`, tidak di-retry
- [ ] Test: schedule ke-11 → SCHEDULE_LIMIT_EXCEEDED
- [ ] Test: daily count reset di 00:00 WIB (bukan UTC) — manual test dengan mock time atau test di momen pergantian hari
- [ ] Test: user Free trigger capture → Playwright hanya render FC1-FC2 (nasional), FC3+ tidak muncul di gambar
- [ ] Test: race condition — 2 request manual capture bersamaan saat count = 99 → hanya 1 yang berhasil, 1 `skipped_limit`
- [ ] Test: `GET /usage` → angka konsisten dengan jumlah aktual di DB

---

## Decisions Made

```
[2026-05-31] Keputusan: Daily limit dihitung per kalender hari WIB (Asia/Jakarta), bukan per 24 jam rolling
  Alasan: Lebih intuitif bagi user — "N captures per hari" (sesuai plan) berarti reset tengah malam WIB
  Trade-off: Query perlu konversi timezone di PostgreSQL: DATE(created_at AT TIME ZONE 'Asia/Jakarta')

[2026-09-05] Keputusan: Limit tidak lagi flat di semua tier — Max Active Schedules Free/Standard/Premium = 10/20/50,
  Daily Capture Limit Free/Standard/Premium = 10/50/100
  Alasan: Sebelumnya limit identik di semua tier (hanya road class yang membedakan plan) — volume limit sekarang jadi
    diferensiator upgrade yang nyata
  Impact: BR-005, BR-006 (product.md), `getLimitsForPlan` (plan.service.ts spec di atas), semua contoh teks/angka di
    zone-management & capture-schedule spec, `web/src/lib/constants.ts` PLAN_LIMITS, `web/src/features/captures/api.ts`
    (limit sekarang per-plan bukan konstanta flat)
```
