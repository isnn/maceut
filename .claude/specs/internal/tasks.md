# tasks.md — Internal (Platform Administration) Implementation

> Update checklist ini saat mengerjakan task.
>
> ⚠️ Frontend prototipe sudah selesai; **backend belum dimulai sama sekali**.

---

## Phase 1: Frontend (mock) — ✅ selesai 2026-09-09

- [x] `role: 'user' | 'internal'` di `User` + backfill & promosi akun terawal (`features/auth/api.ts`)
- [x] `listUsers`, `setUserRole`, `setUserPlan`, `seedUsers` dengan guard BR-024 & BR-025 di service layer
- [x] Gate `/internal` (`app/internal/layout.tsx`) + `InternalHeader` + entry point di profile dropdown `AppHeader`
- [x] F-21 Overview — stat tile, plan mix, signup terbaru, banner data demo
- [x] F-22 Users — search, filter plan/role, edit plan & role inline, konfirmasi downgrade, drawer usage
- [x] F-23 Config — katalog variabel dari `api/.env.example`, edit non-secret (commit on blur), rotate secret write-only, grup infrastruktur read-only
- [x] Seeding 24 demo tenant ke tabel user yang sama + snapshot usage statis

---

## Phase 2: Backend — 🔴 belum dimulai

> Semua di bawah ini menunggu `api/` ada. Setiap route wajib Swagger JSDoc + unit test.

- [ ] **Schema**: kolom `role` di tabel `users` (enum `user`/`internal`, default `user`) + migration
- [ ] **Middleware**: `internal-only.middleware.ts` — tolak 403 `FORBIDDEN` jika `req.role !== 'internal'`
- [ ] **Service: internal.service.ts** — enforce BR-024 (tidak bisa ubah role sendiri) dan BR-025 (internal terakhir tidak bisa diturunkan) di service layer
- [ ] `GET /internal/users` — daftar akun + usage agregat (paginated)
- [ ] `GET /internal/stats` — statistik platform
- [ ] `PATCH /internal/users/:id` — ubah plan / role
- [ ] **Keputusan arsitektur (ADR) dulu**: config lewat UI = override di DB yang menimpa env, atau read-only mirror? Belum diputuskan — lihat Catatan Keamanan di requirements.md
- [ ] `GET /internal/config` — kembalikan nilai non-secret + `{ isSet, last4, updatedAt, updatedBy }` untuk secret. **Nilai secret tidak pernah dikirim** (BR-026)
- [ ] `POST /internal/config/:key/rotate` — terima nilai baru, simpan terenkripsi/di secret manager, kembalikan metadata saja
- [ ] Unit test: 403 untuk non-internal di semua route, BR-024, BR-025, dan test yang memastikan response `GET /internal/config` tidak pernah memuat nilai secret

---

## Decisions Made

```
[2026-09-09] Keputusan: platform role dipisah dari workspace/team role
  Alasan: `internal` adalah operator platform (lintas akun), sedangkan owner/editor/viewer adalah
    kolaborasi di dalam satu workspace — menggabungkannya akan mencampur dua model izin yang berbeda
  Trade-off: satu field tambahan di tabel users; product.md perlu penjelasan agar tidak terbaca
    sebagai pembatalan keputusan "team role out of scope"

[2026-09-09] Keputusan: secret bersifat write-only, bahkan di mock
  Alasan: kalau prototipe menyimpan plaintext di localStorage, kontrak UI-nya salah sejak awal dan
    harus dibongkar saat backend datang; menyimpan hanya { isSet, last4 } membuat mock dan backend
    punya bentuk data yang sama persis
  Trade-off: tidak ada cara melihat kembali nilai yang sudah diisi — memang disengaja

[2026-09-09] Keputusan: grup konfigurasi infrastruktur (server, database, RabbitMQ, CORS) read-only
  Alasan: nilai-nilai itu dibaca saat container start; kontrol yang terlihat bisa diedit tapi
    sebenarnya tidak berefek lebih menyesatkan daripada menampilkannya apa adanya
  Trade-off: mengubahnya tetap butuh akses server + restart
```
