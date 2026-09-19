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
| 🟡 | Migration: zones ✅ · branding_configs 🔴 · captures 🔴 | zone-management/tasks.md Phase 1, 3 |
| ✅ | Auth: register via Better Auth `/api/auth/sign-up/email` + GET /me + unit test + swagger | auth/tasks.md Phase 2 |
| ✅ | Auth: login/logout via Better Auth `/api/auth/sign-in\|sign-out` + unit test | auth/tasks.md Phase 2 |
| ✅ | Middleware: auth (sesi Better Auth) + plan-check + internalOnly + error-handler | auth/tasks.md Phase 2 |
| ✅ | Backend: GET /me + POST /me/onboarding (plan + onboardingDone) | auth/tasks.md Phase 2 |
| ✅ | Backend: /internal/users + /internal/stats (F-21, F-22) + guard role | specs/internal/requirements.md |
| 🔴 | Middleware: rate-limit (belum ada; /internal tanpa proteksi, Better Auth hanya melindungi route-nya sendiri) | structure.md |
| 🔴 | **BE-12** Frontend: /internal Config jadi read-only sesuai ADR-018 | specs/internal/requirements.md |
| ✅ | Frontend: ganti mock `features/auth/api.ts` → `/api/auth/*` + GET /me (fetch langsung, tanpa dependency baru) | auth/tasks.md Phase 3 |
| ✅ | Frontend: ganti mock `features/internal/api.ts` → GET /internal/users, /internal/stats | specs/internal/requirements.md |
| 🔴 | Backend: gate pembayaran untuk PATCH /me/plan (sekarang siapa pun bisa naik paket gratis) | Sprint 3 billing |
| 🔴 | Backend: kirim flag `roleLockedByConfig` per user supaya UI tidak perlu NEXT_PUBLIC_INTERNAL_EMAILS | specs/internal/requirements.md |
| ✅ | API: GET /zones + POST /zones (Drizzle + PostGIS raw) + unit test + swagger | zone-management/tasks.md Phase 2 |
| ✅ | API: GET/PATCH/DELETE /zones/:id + unit test + swagger (F-24, BR-028..030) | zone-management/tasks.md Phase 2 |
| ✅ | Lib: RabbitMQ client (connect, assert queue + dead-letter, publish) | zone-management/tasks.md Phase 3 |
| ✅ | **BE-07** Lib: R2 client (upload/download/presign/delete, path BR-011) | zone-management/tasks.md Phase 3 |
| ✅ | **BE-08** Lib: HERE Traffic client (getTrafficFlow → GeoJSON, BR-017/BR-022) | zone-management/tasks.md Phase 3 |
| ✅ | **BE-09** Script: `npm run env:check` — bukti Postgres/MQ/R2/HERE tersambung | plan BE-09 |
| 🔴 | **BE-10** Verifikasi kredensial HERE + R2 live (menunggu 6 nilai di api/.env) | plan BE-10 |
| 🔴 | Lib: Playwright client (screenshot internal render page) | zone-management/tasks.md Phase 3 |
| 🔴 | API: POST /captures/manual + GET /captures/:id + unit test + swagger | zone-management/tasks.md Phase 3 |
| 🔴 | Worker: capture.worker.ts (consume → road class filter → screenshot → upload) | zone-management/tasks.md Phase 3 |
| ✅ | Frontend: tailwind.config.ts dengan token dari design.md | design.md |
| ✅ | Frontend: Login + Register pages | auth/tasks.md Phase 3 |
| ✅ | Frontend: Dashboard page (zone count, schedule count, CTA) | zone-management/tasks.md Phase 4 |
| ✅ | Frontend: Zone List Page + road class badge | zone-management/tasks.md Phase 4 |
| ✅ | Frontend: ZoneCreateStepper shell + progress indicator | zone-management/tasks.md Phase 4 |
| ✅ | Frontend: Step 1 — Pilih Area (Map Editor HERE Maps) | zone-management/tasks.md Phase 4 |
| ✅ | Frontend: Step 2 — Pilih Road Class + UpgradeModal | zone-management/tasks.md Phase 4, subscription/tasks.md |
| ✅ | Backend: HERE Traffic client + GET /traffic/preview | zone-management/tasks.md Phase 3 |
| ✅ | Frontend: ganti mock `features/zones/api.ts` → /zones + /traffic/preview | zone-management/tasks.md Phase 4 |
| 🔴 | Frontend: hitung ruas per kelas di RoadClassPicker dari /traffic/preview (kini masih katalog lokal) | zone-management/tasks.md Phase 4 |
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
