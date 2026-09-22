# SPRINT.md — Active Sprint

> Baca file ini di SETIAP sesi kerja sebelum mulai apapun.
> Update saat ada task selesai, dimulai, atau keputusan baru dibuat.

---

## Development Flow (WAJIB)

```
1. Pilih task → tandai 🟡 In Progress di tabel bawah
2. Kerjakan: route → controller → service → repository → unit test → swagger annotation
3. Jalankan: cd api && npm test (semua harus pass)
4. Verifikasi Swagger UI ter-update di /api-docs
5. Tandai ✅ Done di tabel
6. Catat di Progress Log: tanggal + ringkasan singkat
7. Update spec/steering jika ada keputusan teknis baru
```

Jangan pindah ke task berikutnya sebelum task aktif sudah ✅ dan test pass.

---

## Sprint 1 · Jun 2026

**Goal:** Docker environment jalan, auth berjalan, user bisa buat zona pertama dan trigger manual capture end-to-end.

---

## Active Tasks

| Status | Task | Spec Reference |
|--------|------|---------------|
| ✅ | Setup docker-compose.yml (postgres, rabbitmq, api, worker, web) | deployment.md |
| ✅ | Setup root .env dari .env.example | .env.example |
| ✅ | Setup api/: init TypeScript + Express + package.json + tsconfig.json | structure.md |
| ✅ | Setup api/: Dockerfile.dev + Dockerfile | deployment.md |
| 🟡 | Setup api/.env dari .env.example (HERE + R2 masih kosong, menunggu kredensial) | api/.env.example |
| ✅ | Setup web/: Next.js + Tailwind (token dari design.md) + Base UI | design.md |
| 🟡 | Setup web/: Dockerfile.dev ✅ + Dockerfile (production) 🔴 | deployment.md |
| ✅ | Setup web/.env.local dari .env.example | web/.env.example |
| ✅ | Jalankan `docker compose up` — pastikan semua service start | deployment.md |
| ✅ | Setup Drizzle: drizzle.config.ts + schema.ts dasar (user, user_plans) | zone-management/tasks.md Phase 1 |
| ✅ | Setup PostGIS extension + generate & jalankan migration awal | zone-management/tasks.md Phase 1 |
| ✅ | Setup Swagger: swagger-jsdoc + swagger-ui-express di /api-docs | auth/tasks.md Phase 2 |
| 🟡 | Migration: zones ✅ · captures ✅ (0007) · branding_configs 🔴 | zone-management/tasks.md Phase 1, 3 |
| ✅ | Auth: register via Better Auth `/api/auth/sign-up/email` + GET /me + unit test + swagger | auth/tasks.md Phase 2 |
| ✅ | Auth: login/logout via Better Auth `/api/auth/sign-in\|sign-out` + unit test | auth/tasks.md Phase 2 |
| ✅ | Middleware: auth (sesi Better Auth) + plan-check + internalOnly + error-handler | auth/tasks.md Phase 2 |
| ✅ | Backend: GET /me + POST /me/onboarding (plan + onboardingDone) | auth/tasks.md Phase 2 |
| ✅ | Backend: /internal/users + /internal/stats (F-21, F-22) + guard role | specs/internal/requirements.md |
| ✅ | Konvensi DB: semua kolom waktu `timestamptz` + guard test | CLAUDE.md |
| ✅ | docs/database/schema.dbml — ERD wajib ikut ter-update saat schema berubah | CLAUDE.md |
| 🔴 | Produksi: ganti kredensial RabbitMQ `guest:guest` di docker-compose.prod.yml | deployment.md |
| 🔴 | Middleware: rate-limit (belum ada; /internal tanpa proteksi, Better Auth hanya melindungi route-nya sendiri) | structure.md |
| 🔴 | **BE-12** Frontend: /internal Config jadi read-only sesuai ADR-018 | specs/internal/requirements.md |
| ✅ | Frontend: ganti mock `features/auth/api.ts` → `/api/auth/*` + GET /me (fetch langsung, tanpa dependency baru) | auth/tasks.md Phase 3 |
| ✅ | Frontend: ganti mock `features/internal/api.ts` → GET /internal/users, /internal/stats | specs/internal/requirements.md |
| 🟡 | **BE-13** Gate pembayaran `PATCH /me/plan` — lubang self-serve sudah ditutup (403, ADR-021) ✅ · payment intent + webhook 🔴 | Sprint 3 billing |
| 🔴 | Backend: kirim flag `roleLockedByConfig` per user supaya UI tidak perlu NEXT_PUBLIC_INTERNAL_EMAILS | specs/internal/requirements.md |
| ✅ | API: GET /zones + POST /zones (Drizzle + PostGIS raw) + unit test + swagger | zone-management/tasks.md Phase 2 |
| ✅ | API: GET/PATCH/DELETE /zones/:id + unit test + swagger (F-24, BR-028..030) | zone-management/tasks.md Phase 2 |
| ✅ | Lib: RabbitMQ client (connect, assert queue + dead-letter, publish) | zone-management/tasks.md Phase 3 |
| ✅ | **BE-07** Lib: R2 client (upload/download/presign/delete, path BR-011) | zone-management/tasks.md Phase 3 |
| ✅ | **BE-08** Lib: HERE Traffic client (getTrafficFlow → GeoJSON, BR-017/BR-022) | zone-management/tasks.md Phase 3 |
| ✅ | **BE-09** Script: `npm run env:check` — bukti Postgres/MQ/R2/HERE tersambung | plan BE-09 |
| ✅ | **BE-10** Verifikasi kredensial live — R2 ✅ round-trip penuh · HERE ✅ 268 ruas, filter functionalClasses diterima | plan BE-10 |
| 🔴 | **CAP-02** Playwright: render page + screenshot → PNG ke R2, isi `captures.file_path` (BR-009/BR-018) | zone-management/tasks.md Phase 3 |
| ✅ | API: POST /zones/:id/captures · GET /zones/:id/captures · GET /captures/:id + test + swagger | zone-management/tasks.md Phase 3 |
| 🟡 | Worker: capture.worker.ts — consume ✅ · filter kelas jalan ✅ · simpan GeoJSON ✅ · screenshot & upload 🔴 (CAP-02) | zone-management/tasks.md Phase 3 |
| ✅ | Frontend: tailwind.config.ts dengan token dari design.md | design.md |
| ✅ | Frontend: Login + Register pages | auth/tasks.md Phase 3 |
| ✅ | Frontend: Dashboard page (zone count, schedule count, CTA) | zone-management/tasks.md Phase 4 |
| ✅ | Frontend: Zone List Page + road class badge | zone-management/tasks.md Phase 4 |
| ✅ | Frontend: ZoneCreateStepper shell + progress indicator | zone-management/tasks.md Phase 4 |
| ✅ | Frontend: Step 1 — Pilih Area (Map Editor HERE Maps) | zone-management/tasks.md Phase 4 |
| ✅ | Frontend: Step 2 — Pilih Road Class + UpgradeModal | zone-management/tasks.md Phase 4, subscription/tasks.md |
| ✅ | Backend: HERE Traffic client + GET /traffic/preview | zone-management/tasks.md Phase 3 |
| ✅ | Backend: /schedules CRUD (F-05, F-06) — jendela, cron diturunkan (ADR-019) + BR-005 + anggaran frame BR-006 | capture-schedule/requirements.md |
| ✅ | Backend: grandfather-and-block saat ganti paket + `GET /plan/impact` (ADR-020) | product.md BR-005/BR-006 |
| ✅ | Backend: akun internal tidak dihitung sebagai user/pendapatan di /internal/stats | keputusan user |
| ✅ | Frontend: Halaman Jadwal pakai API asli | mockup turn 3 |
| ❌ | Frontend: Halaman Tim — DIHAPUS, out of scope MVP (product.md) | product.md |
| ✅ | Backend: GET /usage — angka dashboard nyata, `null` untuk yang belum terukur | zone-management F-19 |
| ✅ | Frontend: Dashboard pakai API asli (tidak ada lagi angka karangan) | zone-management F-19 |
| ✅ | Fix: filter functional class dikirim ke HERE, bukan difilter lokal | docs HERE v7 |
| ✅ | HERE API key aktif (dibetulkan user 22 Sep) — BR-022 tiering terbukti nyata di 4 bbox | BE-10 |
| ✅ | Hapus kolom `organisation` dari user — migrasi 0006 + semua UI | ADR-022 |
| ✅ | Alur daftar: form register tanpa organisation, onboarding bukan pemilih paket | ADR-021 |
| ✅ | Tutup upgrade self-serve — `PATCH /me/plan` tolak kenaikan paket (403) | ADR-021 |
| ✅ | Admin dashboard: jumlah zona & jendela per akun dan platform-wide, bukan "—" | F-21/F-22 |
| ✅ | Admin bisa membuat akun baru — `POST /internal/users` + dialog Add user | F-21 |
| 🔴 | **BE-14** Lupa/ganti password — tautan "Forgot password?" di login mati (`href="#lupa-password"`), dan akun buatan admin tak bisa mengganti password generated | auth/requirements.md |
| ✅ | **BE-15** `DELETE /internal/users/:id` + `PATCH /internal/users/:id` — hapus & ubah akun (nama, email, password, paket, role) | F-22 |
| ✅ | **FE-02** Semua tabel: sorting + pagination + search lewat `useTableControls` bersama | permintaan user |
| ✅ | **FE-03** Zona: panel Snapshots — panah antar siklus, peta per siklus, daftar file | permintaan user |
| ✅ | **BE-16** Scheduler: jendela aktif mem-publish job tiap menit (tanpa dependency baru, ADR-023) | capture-schedule/requirements.md |
| 🟡 | **BE-17** Bersihkan akun uji `*@maceut.test` dari DB dev — sekarang bisa lewat /internal/users | housekeeping |
| 🔴 | Frontend: tampilkan state "X zona/jendela Anda di-pause" + dialog dampak downgrade | ADR-020 |
| ✅ | Frontend: ganti mock `features/zones/api.ts` → /zones + /traffic/preview | zone-management/tasks.md Phase 4 |
| ✅ | Frontend: RoadClassPicker pakai `GET /traffic/road-class-counts` — katalog lokal dihapus | zone-management/tasks.md Phase 4 |
| 🔴 | **FE-01** Zona kecil di pusat kota bisa sah-sah saja dapat 0 ruas di paket Free — butuh penjelasan di wizard, bukan angka 0 telanjang | temuan 22 Sep |
| ✅ | Frontend: MapCanvas (Leaflet + OSM) + TrafficPreviewPanel + StyleSelector | zone-management/tasks.md Phase 4 |
| 🔴 | Backend: internal render page (Playwright target) + update playwright-client.ts | zone-management/tasks.md Phase 3 |
| ✅ | Frontend: Step 3 — Review & Konfirmasi | zone-management/tasks.md Phase 4 |
| ✅ | Frontend: Manual Capture Button + StyleSelector modal + polling status | zone-management/tasks.md Phase 4 |
| ✅ | Frontend: Landing page publik (mockup 4a) | mockup turn 4 |
| ✅ | Frontend: AppHeader top-nav + notification & profile dropdown (3g-3i) | mockup turn 3 |
| ✅ | Frontend: Onboarding pilih paket (3p) | mockup turn 3 |
| ✅ | Frontend: Halaman Jadwal + dialog tambah/ubah jendela (3j-3l) | mockup turn 3 |
| ✅ | Frontend: Halaman Studio — pemutar frame + builder animasi (3m) | mockup turn 3 |
| ✅ | Frontend: Halaman Tim — anggota + matriks peran (3n) | mockup turn 3 |
| ✅ | Frontend: Halaman Profil & penggunaan (3o) | mockup turn 3 |
| ✅ | Frontend: Alur daftar 2 langkah (detail → pilih paket → dashboard) | mockup 4c + 3p, revisi user |
| ✅ | Frontend: Foto panel di halaman login (Unsplash, di-vendor ke public/) | permintaan user |
| ✅ | Frontend: Platform role (`user`/`internal`) + guard BR-024/BR-025 | specs/internal/requirements.md |
| ✅ | Frontend: /internal Overview — statistik platform (F-21) | specs/internal/requirements.md |
| ✅ | Frontend: /internal Users — kelola plan & role + usage per akun (F-22) | specs/internal/requirements.md |
| ✅ | Frontend: /internal Config — env sistem, secret write-only (F-23) | specs/internal/requirements.md |
| ✅ | Frontend: Halaman detail zona + edit nama & kelas jalan (F-24) | specs/zone-management/requirements.md |
| ✅ | Frontend: /internal jadi aplikasi terpisah (staf tidak punya halaman tenant) | specs/internal/requirements.md |
| ✅ | Frontend: rework halaman login & register (tanpa header, show/hide password) | permintaan user |

Status: 🔴 Not started · 🟡 In progress · ✅ Done

---

## NOT This Sprint

Jangan implement meskipun ada di spec:
- Capture history page + filter → Sprint 2
- Branding config (logo upload) → Sprint 2
- Payment gateway / billing nyata → Sprint 3 (halaman Tagihan sekarang hanya simulasi ganti paket)
- Production docker-compose.prod.yml deploy nyata → setelah MVP stabil di lokal

⚠️ Diupdate 2026-09-07 — implementasi mockup turn 3/4 sudah membuat UI untuk beberapa item yang tadinya
ditunda (schedule management, usage widget, plan display). Yang ada sekarang **hanya frontend dengan data
dummy**; backend-nya (schedules API, /usage, enforcement BR-005/006) tetap belum dikerjakan dan masih 🔴.
Layar Studio dan Tim bahkan belum punya spec sama sekali — lihat Decisions This Sprint.

---

## Progress Log

Catat setiap task yang selesai.

Format: [YYYY-MM-DD] nama-task — catatan jika ada keputusan

[2026-07-29] Frontend-first pass (web/) — scaffolded Next.js 16 (App Router, TS, Tailwind v4) + tailwind.config.ts
  tokens from design.md (loaded via @config directive, Tailwind v4). Installed @base-ui/react, leaflet, react-leaflet.
  Built: components/ui (Button, Card, Input, Alert, Badge, ProgressBar, UpgradeModal, StyleSelector), auth pages
  (Login/Register + route guard), dashboard page, zones list + ZoneCard, full ZoneCreateStepper (3 steps: map
  polygon draw, road class + upgrade modal, traffic preview + style selector, review & submit), ManualCaptureButton
  with simulated pending→processing→done polling. All features/*/api.ts are mocked (localStorage-backed fake
  DB + session) with `// TODO: replace with real fetch once api/ exists` markers — no backend exists yet this pass.
  Verified: all routes compile (200, no server errors) via `npm run dev` + curl, `tsc --noEmit` clean. NOT verified:
  interactive browser flows (polygon drawing clicks, dialog open/close, full stepper submit) — no browser tool
  available this session; needs a manual click-through before considering Phase 4 frontend tickets fully done.

[2026-07-29] web/Dockerfile.dev dibuat (node:20-alpine, npm install, npm run dev) — dev server sekarang bisa dijalankan
  via `docker compose up --no-deps -d --build web` tanpa perlu service `api` (belum ada Dockerfile-nya). Ditambahkan
  `allowedDevOrigins` di next.config.ts untuk fix HMR websocket yang diblokir saat akses lewat IP publik VPS.
  Verified: container up, curl / → 200. NOT done: web/Dockerfile (production, multi-stage) — masih 🔴, ditunda.

[2026-07-29] Bug kritis ditemukan & diperbaiki: `max-w-sm`/`max-w-md` compile ke 12px/8px (bukan 24rem/28rem),
  menyebabkan SEMUA card/dialog centered (login/register layout, UpgradeModal, ZoneCreateStepper step dialogs,
  ManualCaptureButton dialog) collapse jadi sangat sempit (teks wrap per-kata, input jadi kotak kecil).
  Root cause: custom spacing scale di tailwind.config.ts pakai nama key yang sama dengan reserved size-scale
  Tailwind (xs/sm/md/lg/xl) — Tailwind v4 @config compat layer memprioritaskan --spacing-{key} di atas
  --container-{key} untuk resolusi max-w-*, dan ini TIDAK bisa di-override lewat theme.maxWidth (sudah dicoba
  extend & full replace, keduanya gagal). Fix: ganti 4 titik pakai ke arbitrary value (`max-w-[24rem]`,
  `max-w-[28rem]`) yang bypass theme lookup — tidak mengubah spacing token design.md.
  Juga fix bug terpisah: MapCanvas menerapkan filter dark-mode (invert/hue-rotate) per-tile ke TileLayer,
  bentrok dengan mix-blend-mode Leaflet di .leaflet-tile → terlihat seperti tile map saling overlap. Dipindah
  ke class .maceut-map-dark yang scoped ke .leaflet-tile-pane.
  ⚠️ Perlu diingat untuk task Sprint berikutnya: JANGAN pakai key sm/md/lg/xl/2xl/xs untuk scale APAPUN selain
  yang sudah ada (spacing, borderRadius — keduanya aman karena tidak collide dengan max-w-*/w-*/h-* resolution),
  gunakan arbitrary value jika perlu named-size Tailwind bawaan (max-w, w, h) berdampingan dengan custom spacing.

[2026-07-29] Bug kritis kedua ditemukan & diperbaiki: Register selalu gagal dengan pesan generik "Terjadi
  kesalahan, coba lagi." di SEMUA percobaan. Root cause: `crypto.randomUUID()` dipakai di 3 file mock API
  (auth/api.ts, zones/api.ts, captures/api.ts) untuk generate id, tapi method ini HANYA tersedia di secure
  context (HTTPS atau localhost) — app di-serve lewat HTTP plain via public IP VPS, jadi `crypto.randomUUID`
  undefined di browser, throw TypeError yang bukan instance ApiError → jatuh ke pesan error generik.
  Fix: tambah `generateId()` di lib/utils.ts (pakai `crypto.getRandomValues` yang tidak ada batasan secure
  context, fallback ke Math.random jika crypto sama sekali tidak ada), ganti semua 3 pemanggilan
  `crypto.randomUUID()` ke `generateId()`. Ini juga akan mempengaruhi create zone & manual capture (sama-sama
  pakai crypto.randomUUID) kalau belum di-test — sudah diperbaiki sekaligus.
  ⚠️ Kalau nanti pindah ke domain dengan HTTPS asli, `crypto.randomUUID()` native akan tersedia lagi — helper
  ini tetap aman dipakai (langsung pakai randomUUID native kalau ada, tidak perlu diubah lagi).

[2026-09-07] Implementasi mockup turn 3 + turn 4 (19 layar) di web/ — semua jalan dengan data dummy.
  Turn 4 (PR #2): landing page publik `/`, login split-panel + opsi SSO (disabled, di luar scope F-09),
  sign up dengan nama/instansi/kekuatan password/pilih paket, onboarding pilih paket (3p).
  Turn 3 (PR #3): AppHeader top-nav + dropdown notifikasi/profil, dashboard (kuota, zona, strip capture,
  render, kesehatan koleksi), manajemen zona (filter/search/pause/hapus + paywall batas zona),
  wizard zona full-page 3 langkah (gambar batas → kelas jalan + preview traffic → review), halaman Jadwal
  (papan jendela per zona + dialog tambah/ubah/hapus), Studio (pemutar frame + scrubber + builder animasi),
  Tim (anggota + matriks peran), Profil & penggunaan (meter kuota + ganti paket).
  Mock API baru: schedules, studio (frame + render), team, notifications. Zona demo di-seed sesuai paket.
  Routing berubah: `/` sekarang landing page, dashboard pindah ke `/dashboard`, route group `(dashboard)` → `(app)`.
  Verified: `tsc --noEmit` bersih, `eslint` bersih, 11 route balas 200 di dev container.
  NOT verified: klik-through interaktif di browser (belum ada tooling browser di sesi ini) — perlu review manual.

[2026-09-09] Area /internal (manajemen SaaS) + rework alur daftar + foto login — semua masih data dummy.
  Alur daftar dipecah jadi 2 langkah nyata: /register (nama, instansi, email, password) → /onboarding
  (pilih paket) → /dashboard. Plan picker dihapus dari form daftar, step "First zone" yang tidak melakukan
  apa-apa dihapus dari onboarding, dan kedua halaman memakai indikator langkah yang sama (SignupSteps).
  Halaman /login memakai foto udara jalan tol (Ed 259, Unsplash License) yang di-vendor ke web/public/
  supaya tidak bergantung host pihak ketiga saat runtime.
  Area /internal: role platform baru `user`/`internal` di record user (beda dari team role workspace),
  gate + header sendiri, Overview (statistik, plan mix, estimasi MRR), Users (search/filter, ubah plan &
  role inline, konfirmasi downgrade, drawer usage), Config (katalog env, secret write-only, grup
  infrastruktur read-only). 24 demo tenant di-seed ke tabel user yang sama, ditandai chip "demo";
  hanya akun yang sedang login yang usage-nya live.
  Verified: `tsc --noEmit` bersih, `eslint` bersih, 14 route balas 200 di dev container.
  NOT verified: klik-through interaktif di browser — perlu review manual.

[2026-09-09] Pemisahan aplikasi staf & pelanggan + rework halaman auth.
  Akun internal sekarang TIDAK punya Dashboard/Zones/Schedule/Studio/Team — semuanya redirect ke
  `/internal`, yang jadi home mereka setelah login. Onboarding dilewati (tidak ada paket untuk staf).
  Profil staf pindah ke `/internal/profile` (tab Account + Notifications saja) lewat ekstraksi
  `features/profile/components/ProfileView.tsx` yang dipakai dua shell. Cross-link dua arah dihapus:
  "Internal tools" di AppHeader dan "Back to workspace" di InternalHeader.
  Enam titik redirect yang tadinya hardcode `/dashboard` diganti satu helper `homePathFor(user)` —
  ini persis sumber bug redirect di ronde sebelumnya.
  Halaman auth: header dihapus total (wordmark duduk di atas foto pada login, di atas kolom form pada
  register), kolom foto dipersempit ke 38% dan full-bleed, form masuk card, `PasswordInput` baru dengan
  toggle show/hide (tetap bisa diakses keyboard), indikator langkah (SignupSteps) dihapus dari kedua
  halaman lalu filenya dihapus.
  Verified: `tsc --noEmit` bersih, `eslint` bersih, 15 route balas 200.
  NOT verified: klik-through interaktif di browser — perlu review manual.

[2026-09-18] Halaman detail zona `/zones/[id]` + edit inline (F-24) — route dinamis pertama di app ini.
  Menampilkan peta batas (read-only), kelas jalan, status, luas, jumlah ruas, panjang, cadence, tanggal dibuat;
  tombol Edit mengubah nama + kelas jalan di tempat, plus Pause/Resume dan Delete. Nama zona & aksi "Edit" di
  tabel `/zones` sekarang menuju halaman ini — sebelumnya "Edit" mengarah ke `/schedule` tanpa id sama sekali.
  Tiga bug di `updateZone` diperbaiki sekalian, karena edit-lah yang membuatnya bisa dijangkau user:
  (1) ganti kelas jalan tidak meng-update `roadsCount`/`lengthKm` — zona mengklaim mengumpulkan ruas yang
  sudah tidak dikumpulkan, (2) tidak ada cek BR-015 saat update (padahal create punya, dan schema asli
  UNIQUE(user_id,name)), (3) tidak ada cek BR-021 saat update — edit jadi jalan pintas melewati batas plan.
  `RoadClassPicker` diekstrak dari ZoneWizard supaya wizard dan form edit memakai kontrol yang sama persis.
  Verified: `tsc --noEmit` bersih, `eslint` bersih, route `/zones/[id]` balas 200.
  NOT verified: klik-through interaktif di browser — perlu review manual.

[2026-09-19] Backend berdiri (BE-01..BE-06) + modul auth & user management.
  api/ sebelumnya hanya berisi .env — tidak ada package.json, src/, maupun Dockerfile.dev,
  padahal docker-compose membangun service api & worker darinya, jadi `docker compose up`
  memang tidak pernah bisa jalan. Sekarang kelima service naik semua.
  Scaffold: package.json (npm), tsconfig CommonJS, config zod (src/config/env.ts), src/errors/,
  error-handler terpusat, Swagger di /api-docs, GET /health (lapor Postgres+PostGIS, RabbitMQ,
  dan status konfigurasi R2/HERE), klien Drizzle & RabbitMQ, entry worker idle, Dockerfile.dev +
  Dockerfile produksi.
  Tiga masalah environment ditemukan & diperbaiki:
  (1) root .env TIDAK ADA padahal ditandai ✅ — postgres diminta init dengan user/password kosong.
      Sekarang root .env dan api/.env dibuat sekaligus dari satu DB_PASSWORD supaya tidak bisa beda;
      kalau beda, postgres tetap healthy dan hanya API yang gagal tanpa petunjuk jelas.
  (2) FRONTEND_URL dipakai untuk dua alamat berbeda (origin CORS vs target Playwright) — dipecah
      jadi FRONTEND_URL + RENDER_BASE_URL (ADR-017).
  (3) DATABASE_URL duplikat dengan DB_* — sekarang diturunkan dari DB_*, var-nya jadi override saja.
  Jebakan tambahan: docker compose env_file hanya membuang inline comment kalau ADA nilai di
  depannya. `R2_ACCOUNT_ID=   # <-- FILL ME` sampai ke container sebagai string "# <-- FILL ME"
  dan terbaca sebagai "sudah dikonfigurasi". Placeholder dipindah ke baris komentar sendiri, dan
  config menganggap nilai berawalan '#' sebagai kosong supaya tidak terulang.
  Auth: dikerjakan dulu dengan jsonwebtoken+bcryptjs, lalu DIGANTI ke Better Auth atas permintaan
  user sesuai ADR-009 (lihat Decisions). Better Auth memegang /api/auth/* dengan format responsnya
  sendiri; modul lain tetap `{ success, data }`.
  User management: GET /me, POST /me/onboarding, GET /internal/users (search/filter/sort/paginate),
  GET /internal/users/:id, PATCH .../plan, PATCH .../role, GET /internal/stats — semua staff-only.
  Dua bug ditemukan lewat pengujian live, bukan lewat test:
  (a) param id divalidasi `.uuid()` padahal id Better Auth berupa text (mis.
      "V1DXkN6XVpTK20lUZCK3wbRU97Jz4IAE") — SEMUA endpoint PATCH balas 422.
  (b) resolveRole menurunkan siapa pun yang tidak ada di INTERNAL_EMAILS, membuat jalur promote di
      changeRole jadi dead code. Sekarang config adalah lantai, bukan plafon (lihat Decisions).
  Verified live: sign-up/sign-in/sign-out lewat Better Auth, sign-out benar-benar mencabut sesi
  (GET /me langsung 401), origin tak dipercaya ditolak (INVALID_ORIGIN), percobaan kirim
  role:"internal" saat sign-up diabaikan (input:false), promosi/demosi role berjalan, akun yang
  dikunci INTERNAL_EMAILS tidak bisa diturunkan, non-staf dapat 403. 46 unit test hijau,
  tsc & eslint bersih, /health 200 dengan PostgreSQL 16.4 + PostGIS 3.4.3 + 2 queue.
  BELUM: klien R2 & HERE (BE-07/BE-08), env:check (BE-09), verifikasi kredensial live (BE-10).

[2026-09-19] Review modul auth & user management terhadap stack yang berjalan — 4 bug ditemukan & diperbaiki.
  Yang utama: `/internal/users` memfilter berdasarkan KOLOM `role`, padahal setiap baris menampilkan role
  hasil resolve dari INTERNAL_EMAILS. Keduanya berbeda untuk email yang baru ditambahkan ke config dan
  akunnya belum sign-in lagi — tidak ada yang menulis kolom itu sampai saat itu. Direproduksi: baris
  tampil `internal`, tapi HILANG dari `?role=internal` dan MUNCUL di `?role=user` dengan label internal.
  `/internal/stats` salah hitung internalUsers dengan sebab yang sama, dan guard "akun internal terakhir"
  bergantung pada angka itu — jadi secara prinsip bisa mengizinkan demosi yang seharusnya ditolak.
  Perbaikan: daftar email config didorong ke query, filter jadi "kolom OR config" persis seperti
  resolveRole(). Dilakukan di SQL, bukan setelah fetch, supaya pagination & total tetap benar.
  Tiga lainnya: (1) search tidak meng-escape wildcard LIKE — cari `%` mengembalikan SEMUA akun, `_`
  cocok dengan karakter apa pun; (2) maxPasswordLength 72 dengan komentar menyebut batas bcrypt, padahal
  Better Auth memakai scrypt yang tidak punya batas itu — dinaikkan ke 128 dan komentarnya diperbaiki;
  (3) cache channel RabbitMQ sekarang dibersihkan saat channel close, bukan hanya connection close.
  bcryptjs & jsonwebtoken dihapus (tidak terpakai sejak pindah ke Better Auth).
  Diperiksa dan ternyata SUDAH benar, jadi tidak diubah: email case-insensitive (Better Auth
  menormalkan, index lower() menjawab 422 bukan 500), akun dihapus tapi sesi masih hidup (401, baris
  session ikut cascade), id tidak dikenal (404). Dugaan awal bahwa klien RabbitMQ akan macet permanen
  setelah queue dihapus TERBANTAH saat diuji — sudah pulih sendiri karena error channel merambat ke
  connection close.
  BELUM diperbaiki, dicatat saja: tidak ada rate-limit di route /internal (structure.md menyebutnya).
  47 test hijau, tsc & eslint bersih di api/ dan web/.

[2026-09-19] Frontend disambungkan ke API asli — modul auth & /internal tidak lagi memakai mock.
  `features/auth/api.ts`: register/login/logout memanggil Better Auth di `/api/auth/*`, lalu `GET /me`
  untuk mengambil pandangan aplikasi atas user (plan, role, onboarding) — dua panggilan, karena Better
  Auth tidak tahu soal tabel kita. Dipanggil dengan fetch biasa, BUKAN package client `better-auth`:
  cuma empat POST JSON, dan menambah dependency di web/ butuh persetujuan (aturan CLAUDE.md).
  `features/internal/api.ts`: memanggil GET /internal/users (paginated) + GET /internal/stats.
  24 demo tenant DIHAPUS. Dulu ada supaya layar /internal tidak kosong sebelum backend ada; sekarang
  direktori menampilkan akun yang benar-benar ada. Layar jadi sepi, tapi itu kenyataannya.
  Angka usage per akun juga dihapus, bukan diganti 0: tabel zones/captures/storage belum ada, jadi
  hitungannya `null` dan dirender "—". `0` akan terbaca sebagai "belum dipakai" — klaim yang tidak
  bisa kita buat. `AccountUsage`/`PlatformStats` counts jadi `number | null`, `UsageMeter` menerima null.
  Ini sekaligus menutup dua "Known limitations" di CHANGELOG (backend tidak ada; angka agregat dikarang).
  Endpoint baru: PATCH /me/plan untuk tombol ganti paket di halaman Profil.
  ⚠️ BELUM ada gate pembayaran — akun mana pun bisa memberi dirinya batas premium gratis. Di mock hal
  ini tidak berarti apa-apa; dengan backend asli ini jadi celah nyata. Ditandai di service, controller,
  Swagger, dan ditambahkan sebagai task Sprint 3.
  Env: NEXT_PUBLIC_API_BASE_URL + APP_BASE_URL dipindah dari localhost ke IP publik VPS — `localhost`
  di browser pengunjung menunjuk ke mesin mereka sendiri, bukan server.
  Verified: preflight CORS lolos untuk origin tepercaya (dengan credentials) dan tidak cocok untuk
  origin lain; alur penuh register → /me → onboarding → ganti paket → 403 di /internal → logout → 401;
  direktori staf menampilkan 3 akun asli; 15 route web balas 200; tsc bersih di api/ dan web/.
  Mock yang MASIH mock: zones, captures, schedules, studio, team, dashboard — keduanya yang memanggil
  `getMe()` (dashboard, captures) sekarang justru memakai plan asli, jadi batas paketnya ikut nyata.
  PR: #34 (feat/api-scaffold-env) — mencakup BE-01..BE-06, modul auth, user management, dan integrasi FE.

[2026-09-19] BE-07/08/09: klien R2, klien HERE Traffic, dan `npm run env:check`.
  R2 (`src/lib/r2-client.ts`): upload/download/presign/delete + headBucket, path BR-011
  `captures/{user_id}/{YYYY}/{MM}/{id}.png` memakai UTC supaya key tidak bergeser mengikuti
  timezone server. Tiga setelan WAJIB untuk R2 dan masing-masing gagal tanpa menyebut dirinya:
  `region:'auto'` (SDK menolak menandatangani tanpa region), `forcePathStyle:true` (gaya
  virtual-host default menuju {bucket}.{account}.r2... yang tidak dilayani R2 — gejalanya 404
  seolah bucket salah), dan `requestChecksumCalculation:'WHEN_REQUIRED'` (SDK baru menambah header
  flexible-checksum yang ditolak R2 — gejalanya HANYA PUT yang gagal, semua baca normal).
  Error SDK dipetakan ke tindakan: AccessDenied → token kemungkinan Object Read only.
  HERE (`src/lib/here-traffic-client.ts`): output persis GeoJSON yang sudah dirender peta
  (`{ trafficState, color }`) dengan warna identik dengan web/src/lib/constants.ts, jadi menukar
  mock frontend nanti tidak mengubah komponen apa pun. Ambang jamFactor: <4 normal, 4-6 slow,
  6-8 heavy, >=8 congested — ⚠️ BR-017 hanya menyebut empat state + warna, TIDAK mendefinisikan
  titik potongnya; angka ini keputusan teknis dan perlu konfirmasi produk.
  Filter functional class dilakukan LOKAL secara default, bukan lewat parameter HERE: parameter
  yang tidak didukung menggagalkan seluruh request (400) alih-alih menurun anggun, dan memfilter
  lokal memungkinkan responsnya diperiksa. Segmen yang FC-nya tidak dilaporkan TETAP disertakan —
  membuangnya akan mengosongkan peta untuk semua akun Free/Standard kalau HERE berhenti mengirim
  field itu (gagal jadi "tanpa tiering", bukan "tanpa traffic").
  env:check (`scripts/env-check.ts`): satu perintah membuktikan Config/Postgres+PostGIS/RabbitMQ/
  R2/HERE. TIDAK PERNAH mencetak nilai secret — hanya `set (…4 karakter terakhir)`. R2 diuji
  round-trip penuh put→get→presign→delete, karena headBucket saja LOLOS dengan token Object Read
  only lalu gagal saat upload. Integrasi yang belum dikonfigurasi dilaporkan SKIP, bukan FAIL.
  Saat kunci HERE masuk, script ini sekaligus menjawab pertanyaan terbuka BR-022: apakah respons
  v7 membawa functional class per segmen (dasar tiering Free/Standard/Premium), dan apakah
  parameter filter upstream diterima.
  Bug ditemukan saat menguji jalur gagal: `checkDb` melaporkan pembungkus Drizzle
  ("Failed query: SELECT version()") bukan sebab sebenarnya, sehingga /health dan env:check
  menampilkan error yang tidak bisa ditindaklanjuti dan semua hint tidak pernah cocok. Sekarang
  `.cause` di-unwrap dan newline diratakan.
  Verified: 74 test hijau, tsc & eslint bersih; env:check keluar 0 dengan R2+HERE SKIP; jalur gagal
  diuji dengan DB_HOST salah dan DB_PASSWORD salah — keduanya memunculkan hint yang tepat, exit 1.
  BELUM: BE-10 (verifikasi kredensial live) menunggu 6 nilai di api/.env.

[2026-09-19] Zone management backend + frontend disambungkan. Modul zona tidak lagi memakai mock.
  Schema: tabel `zones` (migration 0002) + kolom PostGIS `geometry(Polygon,4326)` & index GIST
  lewat SQL mentah (0003) — tidak dideklarasikan di drizzle/schema.ts karena tidak ada tipe
  Drizzle-nya, dan mendeklarasikannya sebagai tipe lain akan membuat `drizzle-kit generate`
  berikutnya mencoba meng-alter/menghapusnya (ADR-011).
  `areaKm2` TIDAK disimpan — dihitung saat dibaca dengan ST_Area(geography(geometry))/1e6.
  Cast ke `geography` itu yang membuat hasilnya meter persegi, bukan derajat persegi yang tidak
  bermakna sebagai luas. Diverifikasi live: 0.01°×0.01° di 7.8°LS = 1.22 km² (cocok dengan hitungan
  manual 1.11 × 1.10 km).
  `roadsCount`/`lengthKm` NULLABLE dan diturunkan dari HERE saat create/ganti kelas jalan. Null =
  "belum diketahui" (HERE belum dikonfigurasi), dirender "—". Nol akan berarti "tidak ada ruas yang
  cocok" — pernyataan berbeda. Kegagalan HERE TIDAK memblokir pembuatan zona: batas wilayah adalah
  hasil kerja user, angka ruas hanya pelengkap.
  Endpoint: GET/POST /zones, GET/PATCH/DELETE /zones/:id, GET /traffic/preview (proxy HERE supaya
  key tidak pernah sampai ke browser, dan cap kelas jalan diterapkan di server sehingga tidak bisa
  diakali lewat devtools).
  Bug ditemukan saat menulis test: `getTrafficFlow` memeriksa konfigurasi HERE SEBELUM memvalidasi
  bbox, jadi bbox ngawur dijawab "HERE belum dikonfigurasi" — melaporkan masalah deployment kita
  alih-alih masalah request mereka. Urutannya dibalik.
  Frontend: `features/zones/api.ts` memanggil API asli. Parameter `plan` dihapus dari getZones/
  createZone/updateZone/getWindows — server membaca plan dari sesi, satu-satunya salinan yang bisa
  dipercaya; mengirimnya dari client hanya dekoratif dan bisa dipalsukan.
  ⚠️ SATU data karangan tersisa di modul ini: `matchRoads` di RoadClassPicker masih katalog lokal
  yang MENGABAIKAN geometry — nama jalan yang sama di mana pun zonanya. Dipertahankan karena
  menghapusnya membuat picker tidak punya apa pun untuk ditampilkan saat user memilih. Angka
  TERSIMPAN pada zona sudah nyata (dari server, null kalau belum diketahui). Ditandai sebagai task.
  Verified live: create zona (PostGIS insert, area 1.22 km²), BR-015 nama duplikat termasuk beda
  kapitalisasi, BR-013 polygon tidak tertutup, rename ke nama sendiri berhasil, pause, patch kosong
  ditolak, zona milik user lain 403, batas zona paket free, BR-021 saat create DAN saat edit
  (menaikkan nasional→semua di akun free ditolak), BR-022 zona `semua` SELAMAT saat paket
  diturunkan (kelas tersimpan tidak berubah), delete. 102 unit test hijau, tsc & eslint bersih,
  11 route web balas 200.

[2026-09-19] Alur pengisian kredensial: `npm run env:set` + instruksi konkret di api/.env.example.
  `env:set` menulis SATU nilai ke api/.env dengan input tersembunyi, supaya secret tidak masuk
  ~/.bash_history (yang terjadi kalau pakai `export KEY=...` atau `sed -i "s/.../secret/"`) dan
  tidak muncul di scrollback/screen share. Hanya baris yang cocok yang ditulis ulang — komentar
  penjelas di api/.env dipertahankan byte-per-byte, tidak di-round-trip lewat parser dotenv.
  Menolak: key tidak dikenal, nilai kosong, nilai mengandung newline, dan paste `KEY=value`
  (kesalahan umum yang akan menghasilkan `KEY=KEY=value`). Secret ditampilkan balik ter-mask.
  api/.env.example sekarang memuat langkah konkret untuk mendapatkan tiap kunci, termasuk dua
  jebakan yang gejalanya menyesatkan: token R2 WAJIB "Object Read & Write" (yang read-only tetap
  LOLOS cek bucket lalu gagal di setiap upload), dan app HERE wajib punya produk Traffic aktif
  (key valid tanpa Traffic membalas 401 — persis seperti key salah).
  ⚠️ Bug ditemukan saat menguji alurnya: mengedit api/.env lalu menjalankan env:check di dalam
  container TIDAK terlihat perubahannya — dilaporkan MISSING padahal file sudah benar. Sebabnya
  `env_file` docker compose menyuntikkan KEY='' untuk setiap key yang masih kosong, dan dotenv
  menolak menimpa entri yang sudah ada di process.env meskipun nilainya string kosong. Jadi blank
  dari docker menutupi nilai asli di file. Diperbaiki dengan membuang entri kosong dari process.env
  sebelum dotenv.config(); override sungguhan (`docker compose exec -e KEY=value`, secret CI) tetap
  menang karena nilainya tidak kosong. `override: true` akan jadi solusi tumpul yang merusak itu.
  Verified: env:set lewat prompt & --stdin, komentar tetap utuh, key berawalan sama tidak saling
  menimpa, semua penolakan bekerja; env:check membaca nilai baru TANPA restart container dan
  melaporkan key HERE palsu sebagai "HTTP 401 — wrong, or Traffic not enabled"; override -e tetap
  berfungsi. 111 test hijau, tsc & eslint bersih.

[2026-09-19] BE-10 dijalankan dengan kredensial asli. R2 LULUS, HERE masih 401.
  R2: `bucket "maceut" · put → get → presign → delete OK`. Round-trip penuh berhasil, artinya token
  benar-benar "Object Read & Write" — jebakan yang paling dikhawatirkan (token read-only LOLOS cek
  bucket lalu gagal di setiap upload) tidak terjadi.
  Temuan yang menjawab pertanyaan terbuka ADR-008: bucket bersifat PRIVATE (public URL tidak
  menyajikan objek) sementara presigned URL BERFUNGSI. Jadi capture akan dikirim ke browser lewat
  presigned URL, bukan URL publik/CDN. R2_PUBLIC_URL dibiarkan kosong.
  HERE: 401 `"The request is not from an authorized source."` Diprobe dengan produk HERE lain
  (Geocode v1) memakai key yang sama → 401 IDENTIK. Ini MENYINGKIRKAN dugaan "produk Traffic belum
  aktif": kalau itu penyebabnya, Geocode akan berhasil. Jadi masalahnya di key/app-nya sendiri.
  Panjang key 43 karakter (format HERE benar), jadi bukan salah paste.
  Dugaan utama: key punya pembatasan domain/referrer. Request dari server tidak mengirim header
  Referer sama sekali, sehingga key yang dibatasi ke sebuah website TIDAK AKAN PERNAH bisa dipakai
  dari backend. Urutan periksa: app Active → key tanpa pembatasan domain/IP → produk Traffic aktif →
  key baru butuh beberapa menit untuk propagasi.
  Pesan error diperbaiki: sebelumnya berbunyi "wrong, or Traffic is not enabled" — yang justru
  mengarahkan orang memeriksa satu-satunya hal yang terbukti BUKAN penyebabnya. Sekarang
  `error_description` milik HERE ikut ditampilkan beserta urutan pemeriksaan di atas.
  MASIH TERBUKA sampai HERE jalan: apakah respons flow v7 membawa functional class per segmen —
  dasar tiering kelas jalan Free/Standard/Premium (BR-022). env:check akan melaporkannya otomatis.
  Catatan lain: AWS SDK memperingatkan Node >=22 mulai Januari 2027; image kita node:20-alpine.
  Belum mendesak, satu baris di Dockerfile.

[2026-09-19] Dua aturan proyek baru + perbaikan yang diperlukan untuk memenuhinya.
  Aturan 1 — SEMUA kolom waktu wajib `timestamptz`. Saat diperiksa, 12 dari 17 kolom waktu
  ternyata `timestamp WITHOUT time zone`: seluruh tabel Better Auth (user, session, account,
  verification). CLI Better Auth memang meng-emit `timestamp(...)` polos. Tabel buatan sendiri
  (user_plans, zones) sudah benar.
  Kenapa ini penting: nilai tanpa offset berarti apa pun yang diasumsikan proses pembaca. Selama
  semua container UTC hasilnya kebetulan benar; begitu ada satu yang tidak, jamnya meleset TANPA
  error — dan `session.expires_at` yang menentukan kapan login berakhir adalah tempat terburuk
  untuk menemukannya.
  Migration 0004 mengonversi ke-12 kolom. ⚠️ Klausa `USING x AT TIME ZONE 'UTC'` ditambahkan
  MANUAL — drizzle-kit meng-generate ALTER tanpa USING, yang membuat Postgres menafsirkan nilai
  naif memakai TimeZone SESI. Jadi migration yang sama menghasilkan data berbeda tergantung siapa
  yang menjalankan: benar di Etc/UTC, meleset 7 jam di Asia/Jakarta. Diverifikasi sebelum & sesudah:
  instant-nya identik (01:03:45.676 → 01:03:45.676+00, WIB 08:03) dan sesi lama tetap valid.
  Guard: `src/config/schema-timezone.test.ts` memindai sumber schema dan GAGAL kalau ada
  `timestamp(...)` tanpa withTimezone. Sengaja memindai SUMBER, bukan database — cara aturan ini
  jebol dalam praktik adalah menjalankan ulang `@better-auth/cli generate`, yang menulis ulang
  auth-schema.ts dan membuang withTimezone setiap kali. Test ini menangkapnya sebelum migration
  sempat dibuat. Ada juga test yang menguji regex-nya sendiri supaya tidak diam-diam berhenti cocok.
  Aturan 2 — `docs/database/schema.dbml` (folder baru) wajib ikut ter-update di commit yang SAMA
  saat schema berubah. Alasannya: ERD basi lebih buruk daripada tidak ada ERD, karena tidak ada
  yang curiga pada diagram — orang pertama yang merencanakan berdasarkan itu merencanakan untuk
  schema yang tidak ada. DBML ditulis tangan; `drizzle-dbml-generator` bisa menghilangkan risiko
  drift tapi butuh dependency baru DAN tetap tidak bisa mengekspresikan kolom PostGIS maupun
  functional unique index pada lower(email) — keduanya tetap harus ditambahkan manual. Dicatat di
  docs/database/README.md untuk ditinjau ulang kalau schema tumbuh lebih cepat dari disiplinnya.
  Verified: 0 kolom naif tersisa (17/17 timestamptz), 115 test hijau, tsc & eslint bersih,
  /health ok, sesi lama masih valid dan sign-in baru berhasil.

[2026-09-19] `api/..env.swp` dihapus dari riwayat git + audit kredensial menyeluruh.
  File itu adalah swap file NANO untuk `api/.env`, ikut ter-commit oleh `git add -A` milik saya
  saat user sedang mengedit .env untuk memasukkan kunci. Blob-nya diperiksa lebih dulu: 1024 byte,
  HANYA header nano (versi editor, username, hostname, nama file) — tidak ada isi buffer, tidak ada
  kredensial. Jadi tidak ada yang bocor. Tetap dihapus atas permintaan user.
  Cara menghapus: `git filter-branch --index-filter` pada rentang feat/api-r2-here-clients..
  feat/api-zones, lalu feat/db-conventions di-rebase ke atasnya. Diverifikasi ketat:
  (1) diff antara tip lama dan baru feat/api-zones HANYA `D api/..env.swp` — tidak ada perubahan isi;
  (2) tree hash tip feat/db-conventions IDENTIK sebelum & sesudah (985bd259...), membuktikan tidak
      ada konten yang berubah sama sekali;
  (3) tiga commit pertama mempertahankan SHA aslinya (ff68eb1, da40ab3, 5c765dc) — hanya dua commit
      yang memang memuat blob itu yang ditulis ulang;
  (4) 115 test tetap hijau, tsc & eslint bersih setelah rewrite.
  Force-push memakai `--force-with-lease` (menolak kalau remote bergerak tak terduga). Keempat PR
  (#34-#37) tetap utuh dengan base yang benar. Blob hilang dari 6 remote branch dan dari object
  store lokal setelah tag backup dihapus + gc.
  Audit: `scripts/audit-secrets.sh` (baru) membaca nilai asli dari file env lalu mencari SETIAP
  nilai di seluruh commit di semua ref. Nilainya TIDAK PERNAH dicetak — hanya nama key, panjang,
  4 karakter terakhir, dan verdict. Hasil: HERE_API_KEY, keempat R2_*, JWT_SECRET, DB_PASSWORD
  semuanya CLEAN; .env/api/.env/web/.env.local tidak pernah ter-commit sama sekali.
  Satu false positive diperbaiki di script: RABBITMQ_URL cocok karena namanya mengandung "URL",
  padahal nilainya `amqp://guest:guest@rabbitmq:5672/` — persis sama dengan .env.example. Script
  sekarang membandingkan dengan .env.example dan menandainya sebagai default, bukan rahasia.
  ⚠️ Catatan terpisah yang ditemukan dari situ: `guest:guest` adalah kredensial RabbitMQ sungguhan
  di docker-compose. Aman untuk dev (RabbitMQ menolak `guest` dari non-loopback) tapi TIDAK boleh
  ikut ke produksi. Ditambahkan sebagai task.
  Pencegahan: pola swap/backup editor (*.swp, .*.swp, *.swo, *~, *.bak, .#*) masuk .gitignore.

[2026-09-19] Aturan penamaan branch & judul PR: `<type>/<nama-kebab-case>`.
  Type-nya SAMA PERSIS dengan type commit yang sudah ada di structure.md:
  feat · fix · refactor · docs · test · chore · perf. Contoh `feat/schedule-management`.
  (Versi pertama aturan ini sempat membatasi ke tiga type saja — feat/fix/chore — lalu diluruskan:
  dua daftar berbeda berarti setiap orang harus mengingat mana yang berlaku di mana, biaya tanpa
  manfaat. Satu kosakata untuk branch, PR, dan commit.)
  Dicatat di CLAUDE.md (Key Conventions + AI Rules) dan structure.md.
  Semua branch aktif sudah patuh. Yang tidak patuh hanya sisa mati dari pemulihan squash-merge
  September lalu (`land/*`, `final-state`) — sudah ter-merge ke main, aman dihapus.

[2026-09-20] Paradigma workspace DIBATALKAN — kembali ke product.md: satu akun = satu paket.
  Kemarin saya membangun multi-tenancy penuh setelah bertanya apakah fitur Tim harus nyata.
  product.md sejak awal menyatakan sebaliknya: "MVP menggunakan single workspace — tidak ada
  multi-tenant atau team role." User memutuskan dokumennya yang benar. Dua jenis akun: `user`
  (pelanggan berbayar) dan `internal` (staf Maceut — superadmin, nanti customer service).
  Cara membatalkan: PR #38 ditutup, branch baru dari #37. Workspace TIDAK PERNAH muncul di
  riwayat migrasi — tidak ada tabel yang dibuat di 0005 lalu dihapus di 0008 untuk dibaca orang
  nanti. Pekerjaan schedules dibawa menyeberang lalu di-rescope ke user; migrasi tunggal
  0005_schedules.sql. Database di-reset (`down -v`), akun uji dibuat ulang.
  Dua dari tiga bug di assessment kemarin hilang dengan sendirinya: plan targeting (viewer
  menurunkan paket workspace lain) mustahil kalau cuma ada satu paket per akun, dan kebingungan
  kata benda di /internal hilang saat kata bendanya kembali jadi user.
  Yang TIDAK hilang sendiri, dan ini yang penting secara komersial: downgrade tidak menegakkan
  apa pun. Terbukti live — Budi turun premium→free dan tetap memegang jendela `hourly`, interval
  yang paket free tidak bisa buat. Sekarang GRANDFATHER AND BLOCK (ADR-020): tidak ada yang
  dihapus, yang melebihi batas di-pause, pembuatan baru ditolak.
  Urutan pause disengaja: interval di luar paket dulu (absolut — hourly memang tidak bisa jalan
  di free), lalu jumlah jendela aktif, lalu anggaran frame/hari, lalu jumlah zona. Menyelesaikan
  interval lebih dulu sering sudah menurunkan hitungan, jadi yang ter-pause lebih sedikit daripada
  kalau diproses asal urut. Yang di-pause: yang TERBARU dulu — zona yang sudah lama dipegang lebih
  mungkin jadi yang benar-benar diandalkan.
  Perubahan penghitungan yang membuat aturannya berfungsi: `zonesLimit` dulu menghitung SEMUA
  baris zona. Kalau dibiarkan, mem-pause zona saat downgrade jadi percuma — hitungannya tidak
  turun, jadi user tidak akan pernah bisa membuat lagi meski sudah merapikan. Sekarang hanya
  menghitung zona ber-status `collecting`, sama seperti BR-005 menghitung jendela aktif. Satu
  aturan hitung untuk dua resource, dan pause jadi obat sungguhan, bukan label.
  `GET /plan/impact?plan=X` menjalankan FUNGSI YANG SAMA dengan perubahan sungguhan, jadi yang
  diperingatkan ke user dan yang benar-benar terjadi tidak bisa berbeda — itu cara dialog
  peringatan biasanya rusak. Dialog downgrade di /internal/users:85-94 sudah ada sejak dulu tapi
  TIDAK PERNAH bisa menyala karena angka yang dibacanya selalu null; sekarang ada isinya.
  Upgrade TIDAK otomatis melanjutkan yang ter-pause — melanjutkan itu keputusan user; menyalakan
  ulang capture yang sudah mereka hentikan akan menghabiskan kuota harian tanpa bertanya.
  Akun internal dikecualikan dari `totalUsers`, `planMix` dan `estimatedSeats` (filter
  `role: 'user'`). Diverifikasi dengan kasus terburuk: akun staf di paket premium — DB berisi dua
  akun premium, laporan menunjukkan totalUsers=1 dan premium=1, MRR tidak bergerak.
  Fitur Tim DIHAPUS seluruhnya: 6 file backend, features/team/, capabilities.ts, halaman /team
  (273 baris), dua entri nav, dan field workspace di tipe User. Copy yang menjanjikan hal yang
  tidak ada juga diperbaiki — halaman daftar dulu berbunyi "invite your team afterwards", dan ada
  notifikasi contoh "Dewi joined the workspace as Editor".
  Verified live: preview menamai persis apa yang akan di-pause → apply mem-pause persis itu →
  jendela hourly `active=false`, 2 zona `paused`, TIDAK ADA yang terhapus → membuat zona ke-2
  ditolak → mem-pause satu zona membebaskan slot dan pembuatan berhasil → upgrade kembali ke
  premium membiarkan yang ter-pause tetap ter-pause. 160 test hijau, tsc & eslint bersih,
  10 route web balas 200, /team balas 404.

[2026-09-20] Dashboard pakai data nyata + perbaikan filter functional class HERE.
  DASHBOARD. `GET /usage` baru: setiap angka diukur atau `null`, tidak ada yang diperkirakan.
  Versi lama melaporkan `rendersThisMonth: 7`, storage `zones.length * 1.37`, dan seats
  `plan === 'free' ? 1 : 3` — tidak satu pun mengukur apa pun. Dashboard dibaca sekilas dan
  dipercaya, jadi angka yang kelihatan masuk akal tapi dikarang lebih buruk daripada tanda "—":
  tidak ada yang terpikir memeriksanya.
  Yang sekarang nyata: jumlah zona collecting, jendela aktif, frame/hari pada HARI TERSIBUK
  (bukan jumlah seminggu), dan `nextCaptureAt` yang DITURUNKAN dari jendela aktif — dihitung
  dalam WIB, bukan UTC. Diverifikasi live: Minggu 18:52 WIB dengan jendela Senin-Jumat 07:00-09:00
  menghasilkan "07:00 (besok · 1 zona)". Ada test yang mengunci kasus batasnya, termasuk 23:00 UTC
  Minggu yang di Jakarta sudah Senin 06:00 — membacanya sebagai UTC akan memundurkan capture
  berikutnya satu hari penuh.
  `pausedByPlan` ditambahkan: berapa zona/jendela yang di-pause karena melebihi paket (ADR-020).
  Ini potongan yang membuat grandfathering terlihat — tanpanya akun yang baru turun paket cuma
  melihat pengumpulan berhenti tanpa penjelasan di mana pun. Badge "Collection health" yang dulu
  hardcoded "Healthy" sekarang healthy/degraded/idle. `idle` sengaja bukan kegagalan: akun yang
  belum menjadwalkan apa pun bekerja persis seperti yang diatur, menyebutnya "degraded" itu
  membunyikan alarm palsu.
  HERE. Membaca docs yang dikirim user (docs.here.com/traffic-api/docs/flow-filter-functional-
  class-flow-1) menemukan BUG NYATA: `functionalClasses` adalah parameter REQUEST, dan functional
  class TIDAK dikembalikan di respons flow. Kode kita memfilter LOKAL pada field yang tidak pernah
  ada — artinya filternya no-op diam-diam, dan SETIAP paket akan menerima SEMUA kelas jalan. BR-022
  (pembeda berbayar utama Free/Standard/Premium) tidak akan menjual apa pun.
  Diperbaiki: `functionalClasses` selalu dikirim ke HERE; filter lokal tinggal sebagai pertahanan
  kalau suatu saat HERE menambah field-nya. Ini sekaligus lebih murah — HERE mengembalikan lebih
  sedikit segmen.
  Korelasi FC ↔ kelas jalan Indonesia didokumentasikan di types/plan.ts, memakai definisi HERE
  sendiri: FC1 (akses terkontrol, antar metropolitan) + FC2 (menyalurkan ke FC1, antar kota tercepat)
  ≈ Jalan Nasional; FC3 (volume tinggi mobilitas lebih rendah) ≈ Jalan Provinsi; FC4+FC5 ≈ Jalan
  Kabupaten/Kota dan lingkungan. Pemetaan yang ada sudah benar dan tidak diubah.
  ⚠️ Dicatat jujur: ini APROKSIMASI. Indonesia mengklasifikasi jalan berdasarkan status administratif
  (UU 38/2004 — siapa yang memiliki dan mendanai), HERE berdasarkan FUNGSI lalu lintas. Umumnya
  sejalan, tapi tidak selalu: Jalan Nasional yang melewati kecamatan sepi bisa jadi FC3, dan Jalan
  Jenderal Sudirman bisa FC2 meski jalan kota. Jadi tier menjual "kedalaman data jalan", bukan
  "berstatus nasional secara hukum" — dan memang begitu produk menjelaskannya.
  ⚠️ HERE MASIH 401. Semua bentuk request diuji — bbox, circle sesuai contoh docs, dengan dan tanpa
  filter, locationReferencing shape dan olr — SEMUA memberi "not from an authorized source" yang
  sama. Jadi formatnya BUKAN masalahnya; kuncinya yang ditolak. Variasi Bearer memberi error
  berbeda ("unrecognized kid null"), mengonfirmasi ini API key, bukan OAuth token. Dugaan utama
  tetap restriksi domain/referrer pada key: request dari server tidak mengirim header Referer sama
  sekali, jadi key yang dibatasi ke sebuah website tidak akan pernah bisa dipakai dari backend.
  180 test hijau, tsc & eslint bersih di api/ dan web/, 8 route web balas 200.

[2026-09-21] Organisation dihapus, alur daftar diperbaiki, admin dashboard pakai angka nyata.

  ORGANISATION. Dihapus sepenuhnya — kolom, migrasi 0006, dan setiap tempat ia tampil.
  Ini BUKAN paradigma multi-tenant yang sudah dibuang; ini label teks bebas pada user
  ("Dinas Bina Marga"). Tapi di formulir pendaftaran ia duduk bersebelahan dengan nama
  lengkap sebagai kolom setara, sehingga membaca seolah bergabung ke sebuah organisasi
  adalah bagian dari membuat akun — dan tidak ada satu pun logika yang pernah membacanya.
  ⚠️ Destruktif dan disengaja: nama organisasi yang sudah masuk ikut hilang. Kolom yang
  tidak dibaca siapa pun adalah cara sebuah schema mengumpulkan field yang tujuannya tak
  bisa direkonstruksi setahun kemudian. Kalau kontak pelanggan ternyata perlu, tempatnya
  tabel customer-record yang menyatakan itu. Direktori internal kehilangan satu dimensi
  pencarian — diganti kolom jumlah zona, yang lebih berguna untuk operator.
  Dicatat sebagai ADR-022; schema.dbml diperbarui di commit yang sama (aturan #37).

  ALUR DAFTAR. Tiga bug nyata, ditemukan saat menelusuri alurnya dari awal:
  1. `choosePlan` di onboarding menelan kegagalan — kalau `completeOnboarding` melempar,
     tombolnya tinggal di keadaan pending selamanya tanpa satu kata pun di layar. Sekarang
     kegagalannya muncul. Hal yang sama di tombol ganti paket Profil.
  2. "Back to details" mendorong ke /register padahal akunnya SUDAH ada dan sesi sudah
     jalan — jalan buntu. Dihapus bersama langkah pemilih paketnya.
  3. Overview internal masih berbunyi "not scoped to your own workspace".

  PLAN PICKER = LUBANG PENDAPATAN. Ini temuan yang paling penting. Tanpa billing, memilih
  "Premium" di onboarding bukan penjualan — itu formulir yang membagikan batas Premium ke
  siapa pun yang membaca halaman harga. Ada DUA jalur terbuka: langkah onboarding dan
  tombol ganti paket di Profil. Keduanya ditutup.
  Onboarding sekarang langkah sambutan: menandai onboardingDone, dan menjelaskan apa yang
  Free sebenarnya berikan plus apa yang harus dikerjakan pertama — dua hal yang tidak
  dijawab kalau orang langsung dilempar ke dashboard kosong. `POST /me/onboarding` tidak
  lagi menerima body sama sekali.
  `PATCH /me/plan` menolak kenaikan paket dengan 403 UPGRADE_NOT_SELF_SERVE. PENURUNAN
  sengaja tetap self-serve: melepas kapasitas tidak merugikan bisnis, dan memaksa orang
  membuka tiket untuk berhemat itu tidak masuk akal — penurunan tetap menjalankan
  grandfather-and-block penuh (ADR-020). 403 dipilih, bukan 402: 402 mengumumkan "bayar
  lalu ini berhasil", yang belum benar — belum ada alat bayarnya. Dicatat sebagai ADR-021.
  Diverifikasi langsung di deployment: akun baru → plan=free; POST /me/onboarding dengan
  body {"plan":"premium"} tetap menghasilkan plan=free (jalur penyelundupan lama mati);
  PATCH /me/plan ke premium → 403; ke free → 200.

  ADMIN DASHBOARD. Perbaikan yang sama seperti dashboard user, dipakaikan ke sisi operator.
  Zona dan jendela capture SEKARANG DIHITUNG sungguhan — per akun di direktori, dan
  platform-wide di overview — lewat dua query GROUP BY, bukan satu query per baris. Yang
  terakhir itu penting: direktori menampilkan setiap akun, jadi menghitung per baris akan
  membuat halamannya makin lambat setiap ada pendaftar.
  Captures dan storage TETAP `null` → "—". Belum ada tabel yang menghitungnya (CAP-01), dan
  di perkakas operator angka karangan lebih berbahaya daripada di mana pun: itulah angka
  yang dipakai orang saat menangani keluhan pelanggan.
  Drawer akun sekarang menampilkan lebih dulu berapa zona/jendela yang di-pause karena
  melebihi paket. Itu potongan yang dibutuhkan operator sebelum hal lain ketika ada yang
  mengeluh "pengumpulan saya berhenti".

  194 test hijau (14 baru untuk gate paket & penghitungan usage), tsc + eslint bersih di
  kedua paket, production build lolos, 11 route web balas 200.

[2026-09-21b] Admin bisa membuat akun baru (F-21).

  `POST /internal/users` — staff-only lewat guard `/internal` yang sudah ada. Akun dibuat
  lewat jalur sign-up Better Auth sendiri, BUKAN INSERT manual. Alasannya bukan kerapian:
  menulis baris user + credential + kaitannya dengan tangan adalah cara sebuah akun jadi
  ADA tapi tidak bisa login, dan itu baru ketahuan saat orangnya mencoba masuk. Lewat
  jalur yang sama dengan pendaftaran mandiri, password di-hash scrypt yang sama.

  PASSWORD. Opsional. Kalau dikosongkan server membuat 18 byte acak (24 karakter base64url)
  dan mengembalikannya SEKALI di `temporaryPassword`. Default-nya sengaja begitu: admin yang
  mengarang password untuk orang lain menghasilkan password lemah dan berulang. Tapi tetap
  bisa diisi, karena belum ada pengiriman email — admin yang sedang mendampingi orangnya
  perlu sesuatu yang bisa diucapkan. Password pilihan admin TIDAK dikembalikan di respons:
  dia sudah tahu, jadi mengembalikannya cuma menaruh password di log dan response tanpa
  manfaat.

  Dua detail yang disengaja:
  1. `autoSignIn` Better Auth mencetak sesi untuk akun baru. Token itu dibuang, tidak
     diteruskan ke mana pun — sesi admin yang memanggil TIDAK berubah. Diverifikasi.
  2. `onboardingDone` = true. Akunnya sudah disiapkan manusia, dan layar onboarding akan
     memberi tahu pemegang Premium hasil grant bahwa dia di paket Free — satu-satunya hal
     yang layar itu ada untuk benar.

  UI. Dialog dua keadaan, bukan satu layar yang mencoba jadi keduanya: formulir, lalu
  serah-terima. Pemisahan itu ada karena batasannya nyata — tanpa email, apa pun yang
  dipakai akun baru untuk login harus berpindah dari layar ini ke seorang manusia. Password
  generated muncul sekali dan tidak bisa dibaca ulang, jadi dialognya harus BERHENTI dan
  memaksa admin mengurusnya, bukan menutup diri lalu lanjut.

  DIVERIFIKASI LANGSUNG (bukan hanya unit test): 401 tanpa sesi · 403 untuk akun customer ·
  201 untuk staff · akun baru benar-benar bisa sign-in dengan password generated · password
  salah tetap 401 · duplikat email 422 EMAIL_ALREADY_TAKEN · email & password invalid 422
  dengan field error · sesi admin utuh setelah membuat akun.

  Sekalian: /internal/stats dan direktori akhirnya diverifikasi di deployment (giliran
  sebelumnya cuma lewat unit test karena tidak ada sesi staf). `zonesCollecting: 2`,
  `schedulesActive: 1` — angka nyata di tempat yang dulu "—". `totalUsers: 12` sementara
  total baris 14: dua akun internal memang tidak dihitung sebagai pelanggan.

  DUA BUG DITEMUKAN SAAT MELIHAT HALAMANNYA DI BROWSER, keduanya lolos dari tsc dan test:
  1. Sel Usage menampilkan "/10 captures" — `capturesToday` null di-render jadi string
     kosong, jadi pembilangnya hilang sama sekali. Sekarang "—/10", plus kolom windows.
  2. Alert di drawer akun masih berbunyi "Usage is not tracked yet" — penggantian teks di
     commit sebelumnya MELESET diam-diam (aku tidak assert hasilnya, jadi tidak ketahuan).
     Sekarang benar, dan peringatan "X zona di-pause" yang dijanjikan commit itu baru
     benar-benar ada sekarang.
  Keduanya hanya bisa ketahuan dengan membuka halamannya sebagai staf — HTTP 200 dan tsc
  bersih tidak menyentuh keduanya.

  202 test (8 baru untuk createUser), tsc + eslint bersih, production build lolos, 11 route
  balas 200, Swagger menampilkan get+post di /internal/users.

[2026-09-22] HERE hidup. Wizard zona berhenti mengarang angka.

  KEY-nya jalan (dibetulkan user). `env:check` lulus: 268 ruas di bbox uji, filter
  functionalClasses diterima. Tapi baris keduanya berbunyi "0 FC1-2 dari 268", yang harus
  diperiksa dulu sebelum dipakai — kalau FC1-2 benar-benar selalu 0, pengguna Free akan
  melihat peta kosong dan BR-022 tidak menjual apa pun.
  Diuji di 4 bbox: Malioboro 1 km → 268 total, FC1-2 = 0 · Ring road Yogya → 8.684 / 1.043 ·
  Sudirman Jakarta → 5.653 / 164 · Tol Cikampek → 5.191 / 1.434. Jadi filternya BENAR dan
  tiering-nya nyata; bbox uji di env-check kebetulan area pejalan kaki tanpa arteri sama
  sekali. Bukan bug.
  ⚠️ TAPI itu temuan produk (FE-01): zona kecil di pusat kota di paket Free bisa sah-sah
  saja menghasilkan 0 ruas. "0 roads" telanjang akan terbaca sebagai kerusakan, padahal
  jawabannya benar. Wizard perlu menjelaskannya, bukan menampilkan angka 0 saja.

  ZONA. `roadsCount`/`lengthKm` langsung terisi begitu key hidup — kodenya sudah ada sejak
  BE-08, cuma selalu mengembalikan null. Zona uji ring road: 8.684 ruas · 356,06 km.

  PEMILIH KELAS JALAN. Ini pekerjaan sebenarnya hari ini. `matchRoads` MENGABAIKAN geometri
  sepenuhnya dan mengembalikan katalog hardcoded 7 nama jalan Jakarta — jadi angka yang
  seharusnya menjelaskan beda antar paket IDENTIK untuk setiap zona di seluruh Indonesia,
  termasuk zona di Yogyakarta yang "berisi" Jl. Casablanca Raya. Katalognya dihapus, begitu
  juga tipe `MatchedRoad`: tidak ada lagi yang mencocokkan jalan di sisi klien.
  Gantinya `GET /traffic/road-class-counts?bbox=` — tiga request HERE paralel, satu per
  tingkat. Tidak bisa satu: respons flow tidak memuat functional class, jadi pemisahannya
  hanya ada kalau kita bertanya tiga kali.

  KEPUTUSAN YANG PERLU DICATAT: endpoint ini MENGEMBALIKAN hitungan untuk kelas DI ATAS
  paket pemanggil, berbeda dari /traffic/preview yang memotong hasilnya. Menghitung bukan
  melihat — akun Free tahu Premium di sini mencakup 8.684 ruas dan bukan 1.043, tanpa
  mendapat satu pun geometri-nya. Menyembunyikan angkanya justru membuat ajakan upgrade
  tidak punya apa-apa untuk dikatakan. Diverifikasi keduanya: akun Free melihat ketiga
  hitungan, DAN /traffic/preview tetap mengembalikan 1.043 fitur walau diminta `semua`.

  Haversine yang tadinya cuma ada di zone.service dipindah ke here-traffic-client sebagai
  `totalLengthMetres` + `toKm`, dipakai kedua pemanggil. Dua salinan haversine akan
  melenceng diam-diam: radius bumi yang salah menghasilkan kilometer yang masuk akal,
  bukan error. Ada test yang mengunci satu derajat lintang = 111 km.

  Dua error lint nyata muncul saat ini: setState sinkron di dalam useEffect pada kedua
  komponen. Diperbaiki dengan menyimpan hasil ber-KUNCI bbox, bukan me-reset state dulu —
  hasil yang kuncinya tidak cocok memang bukan milik boundary ini, jadi barisnya kembali ke
  "Counting roads…" dengan sendirinya. Tidak ada reset, tidak ada cascading render.

  Diverifikasi di browser sungguhan sebagai akun Free: "Nasional 1.043 roads · 58,2 km ·
  Nasional + Provinsi [Standard] 4.777 roads · 195,28 km · All roads [Premium] 8.684 roads ·
  356,06 km", tanpa error klien.

  216 test (15 baru), tsc + eslint bersih, production build lolos.

[2026-09-22b] Admin bisa menghapus dan mengubah akun (F-22).

  DUA ENDPOINT BARU. `PATCH /internal/users/:id` (nama, email, password, paket, role
  sekaligus) dan `DELETE /internal/users/:id`. Paket dan role diterapkan lewat
  `changePlan`/`changeRole` yang sudah ada, bukan ditulis ulang — satu tempat yang tahu
  penjaganya dan aturan grandfather. Salinan kedua akan benar di hari ia ditulis dan
  salah pertama kali aturannya berubah.

  PASSWORD. Ini bagian yang paling berisiko salah. Hash-nya milik Better Auth di tabel
  `account`, dan kita tidak punya sesi user target. Menulis baris itu manual akan
  menghasilkan row yang KELIHATAN benar tapi gagal verify — dan baru ketahuan waktu
  orangnya mencoba login. Jalan yang benar ternyata ada di `auth.$context`:
  `password.hash` + `internalAdapter.updatePassword`, kode Better Auth sendiri. Diprobe
  dulu sebelum dipakai (password lama → 401, baru → 200).
  Mengganti password MENGAKHIRI semua sesi akun itu (`deleteUserSessions`). Alasan staf
  memutar password biasanya karena bocor; membiarkan sesi lama hidup berarti memberi
  password baru ke pemiliknya sambil membiarkan pihak lain tetap masuk. Diverifikasi:
  cookie target 200 sebelum rotate, 401 sesudah.

  HAPUS. Satu `DELETE FROM "user"` sudah cukup — SEMUA tabel yang mereferensikan
  `user.id` sudah `ON DELETE CASCADE` (user_plans, zones, schedules, session, account).
  Dicek ke schema, bukan diasumsikan. Responsnya melaporkan APA yang ikut terhapus
  (dihitung sebelum delete, karena sesudahnya tidak ada yang bisa dihitung), supaya
  operator tidak menebak-nebak apa yang baru saja ia musnahkan. Diverifikasi: akun dengan
  1 zona + 2 jendela → `{"zones":1,"schedules":2}`, sesi korban langsung 401.

  ⚠️ Catatan jujur soal penjaga: `deleteUser` menolak menghapus akun internal terakhir,
  TAPI cabang itu praktis tak terjangkau — kalau hanya ada 1 internal, pelakunya pasti
  akun itu sendiri, dan penjaga "tidak boleh menghapus akun sendiri" sudah menolak lebih
  dulu. Dibiarkan sebagai pertahanan berlapis, bukan karena ia yang bekerja. Yang
  benar-benar menjaga adalah larangan hapus-diri-sendiri.

  SATU BUG DICEGAH SEBELUM ADA. Dialog mengirim seluruh objek, jadi `role` yang TIDAK
  diubah akan menabrak penjaga "tidak boleh mengubah role sendiri" dan mem-403 admin yang
  cuma memperbaiki salah ketik namanya. Server sekarang hanya memanggil `changeRole`
  kalau rolenya benar-benar bergeser, dan dialog hanya mengirim field yang berubah. Dua
  lapis, karena keduanya masuk akal sendiri-sendiri.

  Email yang berganti ikut menghitung ulang platform role — INTERNAL_EMAILS dikunci ke
  alamat, jadi tanpa itu direktori menampilkan role basi sampai akun itu sign-in lagi.
  Mengubah email akun SENDIRI yang terdaftar di INTERNAL_EMAILS ditolak: itu mencabut
  akses staf sendiri secara diam-diam pada sign-in berikutnya.

  Lint menangkap lagi setState sinkron di dalam effect (reset form saat baris berganti).
  Diperbaiki dengan me-remount form lewat `key={row.id}`, bukan effect — effect melakukan
  hal yang sama satu render terlambat, dan sempat menampilkan data akun sebelumnya.

  Diverifikasi lewat HTTP sungguhan: edit nama+email+paket sekaligus · rotate password ·
  hapus-diri-sendiri 403 · turunkan-role-sendiri 403 · body kosong 422 · email duplikat
  422 · id tak dikenal 404. Dialog di-render di browser, terisi penuh, "Nothing changed
  yet" dengan Save nonaktif.

  232 test (16 baru), tsc + eslint bersih, production build lolos.

[2026-09-22c] Semua tabel dapat sorting, pagination, dan search.

  Sebelumnya tiap tabel punya subsetnya sendiri: /zones punya sort + search tanpa paging,
  direktori user cuma search, overview internal dan daftar jendela di detail zona tidak
  punya apa-apa. Tiga implementasi "filter lalu sort" adalah tiga kesempatan untuk tidak
  sepakat soal arti search kosong atau nilai null.
  Sekarang satu hook `useTableControls` + komponen `Pagination`, dipakai keempat tabel.

  DETAIL YANG DIPERTAHANKAN, bukan diseragamkan begitu saja: tabel /zones punya arah
  default per kolom — teks menanjak, kuantitas terbesar-dulu. "Urutkan berdasarkan luas"
  yang berarti "terkecil dulu" hampir selalu salah menebak maksud orangnya. Itu diangkat
  ke hook (`defaultDirection`) supaya semua tabel ikut dapat, bukan dibuang.
  Klik ketiga pada kolom yang sama MENGHAPUS sorting, jadi urutan aslinya bisa dicapai
  lagi tanpa reload.
  Nilai null selalu di urutan terakhir, ke arah mana pun kolomnya menunjuk — null itu
  "tidak tahu", bukan "nol", jadi membiarkannya naik ke puncak sorting menurun akan
  menaruh baris paling tidak informatif di paling atas.
  Ganti search atau sort mengembalikan ke halaman 1; nomor halaman juga di-clamp, supaya
  menghapus baris terakhir di halaman terakhir tidak meninggalkan tabel di halaman yang
  sudah tidak ada.

  ADMIN. Kolom "Usage" yang menumpuk tiga angka jadi satu string dipecah menjadi tiga
  kolom terpisah — Zones, Windows, Captures — masing-masing bisa di-sort. Windows
  dipertahankan (bukan cuma zona & captures seperti yang diminta) karena itu data terukur
  yang kalau dibuang berarti hilang dari layar.
  Aksi per baris jadi dropdown `ActionMenu`, sama seperti tabel zona. "Delete account"
  dinonaktifkan untuk akun sendiri — servernya juga menolak, tapi menonaktifkannya
  menjelaskan lebih dulu alih-alih setelah 403.

  Overview internal: "Recent signups" (8 terbaru, mati) jadi tabel "Accounts" penuh
  dengan ketiga kontrol. Daftar tetap 8 per halaman, tapi sekarang bisa dicari dan
  diurutkan — overview jadi bisa dipakai mencari akun tanpa pindah halaman.

  ⚠️ Filternya di browser, atas baris yang sudah ter-load. Itu trade yang benar di skala
  ini (zona maksimal 25; direktori user sudah mem-paging API sampai dapat semua) dan
  membuat sorting instan. Berhenti benar begitu direktori tidak muat sekali fetch —
  saat itu bentuk hook inilah yang harus ditiru panggilan servernya, dan itu sebabnya
  kunci sortnya string biasa.

  DUA HAL YANG HAMPIR LOLOS: `Pagination` sempat meng-hardcode 10 di baris "Showing X–Y",
  yang akan berbohong begitu ada tabel dengan ukuran halaman lain (overview & daftar
  jendela pakai 8) — sekarang pageSize dioper dan di-echo balik oleh hook supaya keduanya
  tidak bisa berbeda. Dan `rows ?? []` inline mengalokasikan array baru tiap render saat
  masih loading, membatalkan memo filter & sort; ditangkap lint, dibungkus useMemo.

  Sempat menjalankan prettier pada satu file untuk merapikan indentasi — menghasilkan
  diff 318 baris pada file yang tidak ada kaitannya dengan fitur ini, dan repo ini tidak
  punya konfigurasi prettier. Di-revert, diulang manual: 123 baris.

  Diverifikasi di browser sebagai staf dan sebagai pelanggan: /internal "Showing 1–8 of
  20 accounts" · /internal/users "Showing 1–10 of 20 accounts" · /zones "Showing 1–10 of
  12 zones" dengan 10 baris ter-render · detail zona "Showing 1–4 of 4 windows". Kotak
  search ada di keempatnya. Tidak ada error klien.

  232 test tetap hijau, tsc + eslint bersih, production build lolos.

[2026-09-22d] Jendela capture akhirnya menembak. Zona punya riwayat siklus.

  SEBELUMNYA jendela capture adalah baris yang tidak pernah dibaca siapa pun: disimpan,
  ditampilkan, dihitung terhadap batas paket, dan dipakai memprediksi "capture berikutnya
  07:00" — dan tidak ada yang pernah menembak. Prediksi yang benar tentang peristiwa yang
  tidak mungkin terjadi.

  RANTAINYA SEKARANG UTUH: jendela → scheduler → RabbitMQ → worker → HERE → tersimpan.
  Dibuktikan langsung, bukan cuma unit test: jendela 19:27 WIB menembak tepat 12:27 UTC,
  worker mengumpulkan 8.684 ruas, rata-rata jam factor 1,91, barisnya `done` dengan
  `trigger: scheduled`.

  TANPA DEPENDENCY BARU (ADR-023). CLAUDE.md menyebut node-cron, tapi ADR-019 menyimpan
  JENDELA, bukan cron. Pustaka cron berarti menurunkan ekspresi per jendela, menyerahkan
  ke parser, lalu memercayai perjalanan bolak-baliknya — padahal pertanyaan tiap menit
  cuma "apakah menit ini salah satu waktu tembak jendela ini?", yang dijawab jendelanya
  sendiri. Ticknya menyelaraskan ke puncak menit, jadi 19:27 terjadi di 19:27.
  ⚠️ Mengasumsikan SATU instance API. Dua replika menembak dobel; obatnya advisory lock
  Postgres, bukan komentar yang lebih panjang. Sudah ditulis di kodenya.

  BUG LAMA YANG BARU JADI BERBAHAYA HARI INI. `framesPerDay` membulatkan jendela ke jam
  penuh: `floor((end - start) / 60) * per_jam`. Jendela di bawah satu jam hasilnya NOL.
  Jendela 30 menit interval 15 menit menembak dua kali dan dihitung GRATIS terhadap
  anggaran harian BR-006 — jalan memutari batas capture. Tak terlihat selama tidak ada
  yang menembak; hidup sejak menit scheduler jalan.
  Versi frontend lebih parah: cuma membaca digit JAM, jadi 07:30–09:00 dihitung dua jam
  penuh. Keduanya kini memakai rumus yang sama dengan `firesAt`: `ceil((end-start)/step)`.
  Keduanya setuju pada jendela jam bulat — itu sebabnya selama ini lolos. Enam kasus
  dikunci test.

  KEPUTUSAN PENYIMPANAN. Tiap siklus menyimpan GeoJSON dari HERE, bukan hanya PNG. Itu
  yang membuat halaman zona bisa MENGGAMBAR ULANG siklus lama di peta sungguhan — bisa
  di-pan dan di-zoom — bukan gambar datar, dan bentuknya sama dengan preview langsung
  sehingga satu komponen menggambar keduanya. `file_path` tetap null sampai renderer
  Playwright datang (CAP-02); null berarti "belum ada gambar", TIDAK PERNAH "tidak ada
  data".

  BARIS DITULIS UNTUK SETIAP HASIL, bukan hanya yang berhasil. Ditolak batas harian
  (BR-008) maupun gagal, keduanya riwayat yang layak disimpan — zona yang diam-diam
  berhenti mengumpulkan hanya bisa didiagnosis kalau berhentinya dicatat.

  ACK SETELAH HASILNYA DICATAT, gagal sekalipun. Nack balik ke antrean berarti mengulang
  capture yang momennya sudah lewat: nilai frame 07:00 adalah bahwa ia dari 07:00, dan
  ulangan di 07:04 jawaban lain yang juga menghitung dobel ke batas harian.

  BUG YANG KUPERKENALKAN DAN KUTANGKAP: `router.use([...paths])` di zone.routes ADALAH
  penjaganya, dan `/captures` tidak ada di daftar — jadi `GET /captures/:id` TIDAK
  terautentikasi. Terbaca aman karena saudaranya `/zones/:id/captures` terjaga. Hanya
  request sungguhan yang mengungkapnya. Diperbaiki, dan bahayanya ditulis di daftar itu.

  PANEL SNAPSHOTS di halaman zona: panah maju-mundur antar siklus, semuanya ikut — peta,
  angka, daftar file. Hanya traffic siklus terpilih yang diambil; zona yang mengumpulkan
  tiap jam punya ratusan siklus seminggu, masing-masing membawa satu FeatureCollection.

  Dashboard user, direktori internal, dan overview internal menampilkan `capturesToday`
  SUNGGUHAN — bukan "—" lagi. Storage tetap null sampai ada gambar.

  262 test (26 baru), tsc + eslint bersih, production build lolos, tanpa error klien.

---

## Decisions This Sprint

Catat keputusan teknis yang dibuat selama sprint ini.

Format:
[YYYY-MM-DD] Keputusan: ...
  Alasan: ...
  Impact: file yang perlu diupdate

```
[2026-06-XX] Keputusan: Ganti backend dari Golang+Fiber+GORM ke Express+TypeScript+Drizzle
  Alasan: Satu bahasa (TypeScript) dengan frontend, ekosistem lebih familiar untuk solo dev
  Impact: CLAUDE.md, tech.md, structure.md, seluruh specs/*/tasks.md, .env.example

[2026-06-XX] Keputusan: Tambah Docker + Docker Compose untuk dev dan produksi
  Alasan: Environment konsisten, satu command untuk semua service
  Impact: docker-compose.yml, docker-compose.prod.yml, deployment.md (baru), Dockerfile per service

[2026-06-XX] Keputusan: Road class dipindah dari "global per user (dihitung saat capture)" menjadi "per zona (dipilih saat create, disimpan permanen)"
  Alasan: User perlu kontrol eksplisit per zona; alur pembuatan zona sekarang 3-step stepper (area → road class → review)
  Impact: BR-001..004 diupdate + BR-020/021/022 baru, zones.roadClass column baru, POST /zones payload berubah,
          zone-management requirements.md & tasks.md, subscription plan.service.ts (getMaxRoadClass, isRoadClassAllowed),
          capture flow pakai effectiveRoadClass = MIN(zone.roadClass, plan max)

[2026-06-XX] Keputusan: Basemap ganti dari HERE Maps tile ke OpenStreetMap (Leaflet). HERE dipakai hanya untuk data Traffic Flow (overlay).
  Alasan: OSM gratis untuk basemap; traffic tetap butuh HERE karena data granular untuk Indonesia
  Impact: ADR-010b/c baru, zones/captures render pipeline (Playwright screenshot internal render page yang sama dengan preview browser),
          web/.env.example (hapus HERE frontend key, tambah OSM tile url), api/.env.example (HERE_API_KEY hanya untuk traffic, tambah OSM_TILE_URL)

[2026-06-XX] Keputusan: Style (warna overlay + title + timestamp) bersifat ephemeral — dipilih setiap kali sebelum preview/manual capture, tidak disimpan sebagai profil
  Alasan: Fleksibilitas user tanpa perlu maintain banyak setting tersimpan; scheduled capture otomatis pakai preset "Default"
  Impact: BR-023 baru, F-20 Style Selector (fitur baru, dipakai di F-17 dan F-04), captures.styleUsed (jsonb, snapshot histori saja)

[2026-07-29] Keputusan: Urutan kerja dibalik — frontend (web/) dibangun lebih dulu dengan data mock, backend (api/) ditunda ke sesi berikutnya
  Alasan: Prioritas user untuk melihat/demo UI dulu; postgres akan dijalankan terpisah oleh user (bukan via `docker compose up` penuh
    di sesi ini) sebelum pindah ke VPS untuk pengembangan backend
  Impact: features/*/api.ts di web/ berisi mock (localStorage) menggantikan panggilan API asli sampai api/ dibangun — lihat marker
    `// TODO: replace with real fetch` di tiap file; web/Dockerfile* ditunda; api/ (seluruh Phase 0-3 zone-management/tasks.md
    dan Phase 2 auth/tasks.md) belum dikerjakan sama sekali

[2026-07-29] Keputusan: npm dipakai untuk web/ (bukan pnpm seperti disebut CLAUDE.md), package manager global lain ditunda
  Alasan: `corepack enable pnpm` gagal (EPERM, butuh admin rights di environment lokal ini); user mengonfirmasi npm untuk web
  Impact: web/package.json scripts pakai npm; docker-compose.yml service `web` command diubah ke `npm run dev`; keputusan ini
    perlu ditinjau ulang saat setup di VPS (pnpm mungkin tersedia di sana)

[2026-07-29] Keputusan: Tailwind v4 dipakai (bukan v3 seperti contoh literal di design.md), tailwind.config.ts tetap dipertahankan
  sebagai single source of truth via directive `@config` di globals.css
  Alasan: `create-next-app` versi terbaru menginstall Tailwind v4 secara default; v4 mendukung config JS/TS lama lewat `@config`
    untuk migrasi bertahap, jadi token di design.md tidak perlu ditulis ulang ke sintaks `@theme` CSS-native
  Impact: web/src/app/globals.css menambahkan `@config "../../tailwind.config.ts";`, tailwind.config.ts tetap persis seperti
    struktur di design.md

[2026-07-29] Keputusan: Port host untuk service `web` di docker-compose.yml diubah dari "3000:3000" menjadi "3001:3000"
  Alasan: Port 3000 di VPS dev sudah dipakai proses lain (project tidak terkait, di luar Maceut) — bukan konflik dari Maceut sendiri
  Impact: docker-compose.yml (web.ports), akses dev via docker sekarang di :3001 bukan :3000; port container tetap 3000

[2026-07-29] Keputusan: allowedDevOrigins ditambahkan ke web/next.config.ts (berisi IP publik VPS)
  Alasan: Next.js 16 dev server memblokir cross-origin request ke resource dev (termasuk webpack-hmr WebSocket) secara default;
    tanpa ini HMR gagal connect saat diakses lewat IP publik meskipun halaman utama tetap ter-load normal
  Impact: web/next.config.ts — perlu ditinjau ulang/dihapus saat pindah ke domain tetap atau reverse proxy di production

[2026-09-05] Keputusan: Max Active Schedules dan Daily Capture Limit tidak lagi flat 10/100 di semua tier — sekarang
  per plan: Max Active Schedules Free/Standard/Premium = 10/20/50, Daily Capture Limit Free/Standard/Premium = 10/50/100
  Alasan: Volume limit sebelumnya identik di semua tier (hanya road class yang membedakan plan Free/Standard/Premium),
    sekarang jadi diferensiator upgrade yang nyata
  Impact: BR-005/BR-006 (product.md), tech.md (error contract examples), subscription/requirements.md + tasks.md
    (getLimitsForPlan values), capture-schedule & zone-management spec text, web/src/lib/constants.ts PLAN_LIMITS,
    web/src/features/captures/api.ts (limit sekarang dihitung per-plan, bukan konstanta flat)

[2026-09-07] Keputusan: Navigasi aplikasi pakai top-nav header (Dashboard · Zona · Jadwal · Studio · Tim),
  bukan sidebar kiri w-64 seperti di design.md; Sidebar.tsx dihapus
  Alasan: Semua artboard turn 3 memakai header horizontal; mengikuti mockup lebih penting daripada
    mempertahankan pola sidebar yang belum pernah direview
  Impact: design.md section Layout perlu diupdate (masih menyebut sidebar + `ml-64`), structure.md
    folder frontend, components/shared/AppHeader.tsx menggantikan Sidebar.tsx

[2026-09-07] Keputusan: Layar Studio (builder animasi dari frame) dan Tim (anggota + peran) diimplementasi
  di frontend meskipun BELUM ada spec-nya
  Alasan: Keduanya bagian dari mockup turn 3 yang diminta diimplementasi; dibangun dengan data dummy
  Impact: product.md masih menandai team/role management sebagai out of scope MVP, dan tidak ada spec
    sama sekali untuk Studio — keduanya butuh requirements + BR sebelum jadi fitur nyata. Sampai itu ada,
    dua layar ini adalah prototipe UI, bukan fitur yang di-back backend.

[2026-09-09] Keputusan: Area manajemen SaaS ada di `/internal` dengan role platform `user` | `internal`,
  terpisah dari workspace/team role (owner/editor/viewer) yang tetap out of scope MVP
  Alasan: `internal` adalah operator platform lintas akun, bukan kolaborasi dalam satu workspace —
    dua model izin yang berbeda; field di record user juga memetakan langsung ke kolom `users.role`
    saat backend dibangun, tidak seperti daftar email hardcoded
  Impact: product.md (section Platform Administration baru + Feature Status), specs/internal/ baru
    (F-21..F-23, BR-024..BR-026), features/auth + features/internal di web/
  ⚠️ Gate di frontend HANYA UI-gating, bukan authorization — role bisa diubah lewat devtools.
    Enforcement asli wajib di middleware backend saat api/ dibangun.

[2026-09-09] Keputusan: Secret di layar konfigurasi bersifat write-only, termasuk di mock
  Alasan: menyimpan plaintext di localStorage akan membuat kontrak UI salah sejak awal; menyimpan hanya
    { isSet, last4, updatedAt, updatedBy } membuat mock dan backend punya bentuk data identik
  Impact: features/internal/config-api.ts, BR-026 di specs/internal/requirements.md
  ⚠️ Belum ada keputusan arsitektur soal config lewat UI (override DB vs read-only mirror) —
    butuh ADR di tech.md sebelum backend dibuat

[2026-09-09] Keputusan: aplikasi staf (`/internal`) dan aplikasi pelanggan terpisah total —
  satu akun hanya melihat salah satunya, tanpa cross-link
  Alasan: staf Maceut bukan pelanggan; memberi mereka Dashboard/Zones/Schedule/Studio/Team milik
    workspace sendiri membuat dua peran tercampur dan tidak jelas mana yang sedang dipakai
  Impact: `(app)/layout.tsx` menolak role internal, `homePathFor()` jadi satu-satunya penentu tujuan
    setelah login, ProfileView diekstrak agar dipakai dua shell, kedua header kehilangan cross-link
  ⚠️ Konsekuensi: staf tidak bisa lagi melihat tampilan pelanggan sama sekali. Kalau nanti dibutuhkan
    untuk support/QA, jawabannya impersonation read-only, bukan mengembalikan link-nya

[2026-09-18] Keputusan: kelas jalan boleh diubah setelah zona dibuat (BR-029), memperluas BR-020 yang hanya
  menyebut pemilihan saat pembuatan
  Alasan: satu-satunya alternatif adalah menghapus lalu membuat ulang zona — kehilangan riwayat capture hanya
    karena ingin kedalaman data berbeda; batas area tetap tidak bisa diubah karena menggambar ulang batas
    efektifnya zona yang berbeda
  Impact: BR-028..BR-030 baru di specs/zone-management/requirements.md (F-24), `updateZone` sekarang
    meng-enforce BR-015 & BR-021 dan meng-derive ulang roadsCount/lengthKm, product.md Feature Status diperluas
    dari "Edit nama zona" ke nama + kelas jalan
  Catatan: frame yang sudah ter-capture TIDAK berubah — hasilnya tetap sesuai kelas saat capture berjalan
[2026-09-19] Keputusan: api/ memakai npm, bukan pnpm — menutup review yang ditunda 2026-07-29
  Alasan: pnpm dan corepack tidak tersedia di VPS ini; perintah pnpm di CLAUDE.md/SPRINT.md/
    deployment.md selama ini mendeskripsikan perintah yang tidak bisa dijalankan. web/ sudah npm.
  Impact: api/package.json, Dockerfile & Dockerfile.dev (tanpa corepack), docker-compose command,
    CLAUDE.md, deployment.md, structure.md

[2026-09-19] Keputusan: Better Auth dipakai untuk modul auth (menegakkan ADR-009), dengan format
  respons Better Auth di /api/auth/* dan `{ success, data }` di semua modul lain (ADR-016)
  Alasan: implementasi awal sesi ini hand-rolled (jsonwebtoken+bcryptjs) dan menyimpang dari ADR-009;
    user memilih menegakkan ADR. Membungkus respons Better Auth akan memaksa maintain adapter per
    endpoint dan membuat client library resminya tidak bisa dipakai apa adanya. Keuntungan konkret
    yang langsung terbukti: sesi tersimpan di tabel, jadi sign-out benar-benar mencabut akses —
    persis trade-off yang dicatat ADR-009 versi lama.
  Impact: ADR-009 ditulis ulang + ADR-016 baru, src/lib/auth.ts, drizzle/auth-schema.ts (di-generate
    `@better-auth/cli`, JANGAN diedit tangan), app.ts (handler dipasang SEBELUM express.json —
    Better Auth membaca stream mentah), auth.middleware.ts, GET /me menggantikan GET /auth/me.
  Catatan: kolom `user.id` bertipe text (id Better Auth), bukan uuid — user_plans.user_id ikut text.
    `fullName` di frontend dipetakan dari `name` milik Better Auth di satu tempat (user.service.ts).
    Field tambahan `role` & `onboardingDone` memakai `input: false` supaya client tidak bisa
    mengirimnya saat sign-up — tanpa itu siapa pun bisa mendaftar sebagai staf.

[2026-09-19] Keputusan: INTERNAL_EMAILS adalah LANTAI, bukan plafon (memperjelas BR-027)
  Alasan: versi pertama menurunkan siapa pun yang tidak terdaftar, yang membuat tombol promote di
    /internal/users jadi dead code — role yang baru diberikan akan dicabut lagi pada pembacaan
    berikutnya. Email yang terdaftar selalu internal dan tidak bisa diturunkan lewat API; email
    yang tidak terdaftar memakai nilai di database, sehingga staf bisa dipromosikan tanpa redeploy.
  Impact: src/lib/internal-access.ts + test-nya, auth.middleware.ts, user.service.ts
  ⚠️ Konsekuensi yang harus diketahui: menghapus email dari INTERNAL_EMAILS SAJA tidak mencabut
    akses kalau akun itu juga dipromosikan di database. Mencabut butuh keduanya.

[2026-09-19] Keputusan: layar /internal/config jadi read-only mirror dari .env (ADR-018) —
  menutup ⚠️ yang tercatat 2026-09-09
  Alasan: config dibaca saat container start; membuatnya editable berarti menyimpan secret di
    database dan membuat satu salah-edit bisa menjatuhkan platform. Belum ada kebutuhan runtime.
  Impact: ADR-018 baru di tech.md; features/internal/config-api.ts + halaman Config masih perlu
    dimatikan jalur tulisnya (belum dikerjakan — masuk BE-12)
```

---

## How to Request Tasks from AI

TASK: [nama task persis seperti di tabel atas]
READ: CLAUDE.md, steering/tech.md, steering/structure.md, specs/[feature]/tasks.md
OUTPUT: [yang dihasilkan]
CONSTRAINT: [referensikan BR-NNN atau ADR-NNN jika relevan]

Contoh:
TASK: API: GET /zones + POST /zones + unit test + swagger
READ: CLAUDE.md, steering/tech.md, steering/structure.md, specs/zone-management/tasks.md
OUTPUT: types + repository (Drizzle + sql\`\` raw untuk PostGIS) + service + controller + route + *.controller.test.ts + swagger JSDoc annotations
CONSTRAINT:
  - Drizzle query builder untuk CRUD, sql\`\` template hanya untuk ST_GeomFromGeoJSON dan ST_AsGeoJSON (ADR-011)
  - Geometry WGS84 SRID 4326 (BR-013)
  - Validasi nama duplikat di service layer (BR-015, BR-007)
  - Express controller pattern dari structure.md (thin, next() untuk error)
  - Swagger JSDoc annotation lengkap
  - Unit test cover: success + 422 duplicate name + 401 unauthorized
