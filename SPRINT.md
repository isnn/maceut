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
| ✅ | Setup api/.env dari .env.example (HERE + R2 terkonfigurasi & terverifikasi — /health: r2 configured, here configured) | api/.env.example |
| ✅ | Setup web/: Next.js + Tailwind (token dari design.md) + Base UI | design.md |
| 🟡 | Setup web/: Dockerfile.dev ✅ + Dockerfile (production) 🔴 | deployment.md |
| ✅ | Setup web/.env.local dari .env.example | web/.env.example |
| ✅ | Jalankan `docker compose up` — pastikan semua service start | deployment.md |
| ✅ | Setup Drizzle: drizzle.config.ts + schema.ts dasar (user, user_plans) | zone-management/tasks.md Phase 1 |
| ✅ | Setup PostGIS extension + generate & jalankan migration awal | zone-management/tasks.md Phase 1 |
| ✅ | Setup Swagger: swagger-jsdoc + swagger-ui-express di /api-docs | auth/tasks.md Phase 2 |
| ✅ | Migration: zones ✅ · captures ✅ (0007) · exports ✅ (0009) | zone-management/tasks.md Phase 1, 3 |
| ✅ | Auth: register via Better Auth `/api/auth/sign-up/email` + GET /me + unit test + swagger | auth/tasks.md Phase 2 |
| ✅ | Auth: login/logout via Better Auth `/api/auth/sign-in\|sign-out` + unit test | auth/tasks.md Phase 2 |
| ✅ | Middleware: auth (sesi Better Auth) + plan-check + internalOnly + error-handler | auth/tasks.md Phase 2 |
| ✅ | Backend: GET /me + POST /me/onboarding (plan + onboardingDone) | auth/tasks.md Phase 2 |
| ✅ | Backend: /internal/users + /internal/stats (F-21, F-22) + guard role | specs/internal/requirements.md |
| ✅ | Konvensi DB: semua kolom waktu `timestamptz` + guard test | CLAUDE.md |
| ✅ | docs/database/schema.dbml — ERD wajib ikut ter-update saat schema berubah | CLAUDE.md |
| 🔴 | Produksi: ganti kredensial RabbitMQ `guest:guest` di docker-compose.prod.yml | deployment.md |
| 🔴 | Middleware: rate-limit (belum ada; /internal tanpa proteksi, Better Auth hanya melindungi route-nya sendiri) | structure.md |
| ✅ | **BE-12** /internal/config jadi cermin read-only dari `.env` server (ADR-018) — `GET /internal/config`, secret hanya set/tidak, password di URL disamarkan | specs/internal/requirements.md |
| ✅ | Frontend: ganti mock `features/auth/api.ts` → `/api/auth/*` + GET /me (fetch langsung, tanpa dependency baru) | auth/tasks.md Phase 3 |
| ✅ | Frontend: ganti mock `features/internal/api.ts` → GET /internal/users, /internal/stats | specs/internal/requirements.md |
| 🟡 | **BE-13** Gate pembayaran `PATCH /me/plan` — lubang self-serve sudah ditutup (403, ADR-021) ✅ · payment intent + webhook 🔴 | Sprint 3 billing |
| ✅ | Backend kirim `roleLockedByConfig` per user (+ `internalByConfig` di stats); `NEXT_PUBLIC_INTERNAL_EMAILS` dihapus dari web | specs/internal/requirements.md |
| ✅ | API: GET /zones + POST /zones (Drizzle + PostGIS raw) + unit test + swagger | zone-management/tasks.md Phase 2 |
| ✅ | API: GET/PATCH/DELETE /zones/:id + unit test + swagger (F-24, BR-028..030) | zone-management/tasks.md Phase 2 |
| ✅ | Lib: RabbitMQ client (connect, assert queue + dead-letter, publish) | zone-management/tasks.md Phase 3 |
| ✅ | **BE-07** Lib: R2 client (upload/download/presign/delete, path BR-011) | zone-management/tasks.md Phase 3 |
| ✅ | **BE-08** Lib: HERE Traffic client (getTrafficFlow → GeoJSON, BR-017/BR-022) | zone-management/tasks.md Phase 3 |
| ✅ | **BE-09** Script: `npm run env:check` — bukti Postgres/MQ/R2/HERE tersambung | plan BE-09 |
| ✅ | **BE-10** Verifikasi kredensial live — R2 ✅ round-trip penuh · HERE ✅ 268 ruas, filter functionalClasses diterima | plan BE-10 |
| ✅ | **CAP-02** Playwright: render page + screenshot → PNG ke R2, isi `captures.file_path` (BR-009/BR-018) | zone-management/tasks.md Phase 3 |
| ✅ | API: POST /zones/:id/captures · GET /zones/:id/captures · GET /captures/:id + test + swagger | zone-management/tasks.md Phase 3 |
| ✅ | Worker: capture.worker.ts — consume ✅ · filter kelas jalan ✅ · simpan GeoJSON ✅ · screenshot & upload ✅ (CAP-02, render.worker) | zone-management/tasks.md Phase 3 |
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
| ✅ | **FE-04** Dashboard: Latest captures dari `GET /captures`; Recent renders berhenti mengarang | permintaan user |
| ✅ | **FE-05** Traffic dipotong ke polygon zona — bbox HERE selalu lebih besar dari zonanya | permintaan user |
| ✅ | **FE-06** Peta auto-fit ke boundary + `isolate` supaya pane Leaflet tidak menimpa komponen lain | permintaan user |
| ✅ | **FE-07** Schedule: jendela bertumpuk di-lane; tabel Capture windows di bawah ruler | permintaan user |
| ✅ | **FE-08** Dashboard: rail tidak lagi terdorong keluar layar; cadence nyata; angka seragam | permintaan user |
| ✅ | **FE-09** Zona: peringatan hapus pindah ke dialog; panel "Snapshots" jadi "Captures" + tabel planned vs actual | permintaan user |
| ✅ | **FE-10** Studio: playback frame nyata dari capture tersimpan (peta, transport, scrubber) | mockup 3m |
| ✅ | **FE-11** Detail zona: legenda jam factor, Trigger jadi Auto/Manual, kolom Time diisi | permintaan user |
| ✅ | **FE-12** Studio: renderer canvas — PNG per frame, WebM animasi, 5 style, toggle layer | permintaan user |
| ✅ | **FE-13** Studio: rentang waktu (start/end), ekspor banyak gambar (ZIP), viewer capture lebih cepat | permintaan user |
| ✅ | **FE-20** Studio: judul panjang terbungkus, teks tanpa outline (90% opasitas), modal Export, UI output size, swatch tema berbeda, Default → Charcoal | permintaan user |
| ✅ | **ADM-01** Admin: pantau pemakaian HERE (per hari & sumber) + batas harian/bulanan untuk mencegah over-budget; tidak terlihat oleh user | permintaan user |
| ✅ | **FE-22** Detail zona: capture windows naik ke bawah detail, peta captures gelap, header tabel sejajar, pagination baru, help tip boundary, gaya konsisten | permintaan user |
| ✅ | **FE-21** Export async di server: tabel `exports`, antrian RabbitMQ, worker Playwright + halaman render internal, riwayat & progres di detail zona, retry, sweeper | permintaan user |
| ✅ | **FE-19** Studio: rentang waktu lintas hari; animasi 1:1 dengan preview (timing tepat, framing tak tergantung ukuran, bitrate sesuai resolusi) | permintaan user |
| ✅ | **FE-18** Studio: panel satu kartu, menu Export, alignment teks, efek vignette opsional, modal ukuran; ringkasan hari pindah ke detail zona | permintaan user |
| ✅ | **FE-17** Studio: UI panel zoom/overlay/output baru, judul bisa diubah, peta & teks dua lapis, halaman lebih lebar | permintaan user |
| ✅ | **FE-16** Studio: zoom halus + roda mouse, pan bebas di semua zoom, jalan kecil dinamis, palet MapToPoster persis, congestion theme kartu, ukuran & drag teks | permintaan user |
| ✅ | **FE-15** Studio: basemap vektor bergaya (OpenFreeMap, gaya MapToPoster), kartu tema swatch, preview di resolusi ekspor | permintaan user |
| ✅ | **FE-14** Studio: panel style dipecah 5 bagian (map theme, congestion theme, zoom position, overlay, output size); tema satelit + artistik, pan/zoom manual | permintaan user |
| ✅ | **CAP-02** Playwright: render otomatis PNG per capture ke R2 (BR-009/BR-018) — canvas renderer siap dipakai ulang | zone-management Phase 3 |
| ✅ | **BE-16** Scheduler: jendela aktif mem-publish job tiap menit (tanpa dependency baru, ADR-023) | capture-schedule/requirements.md |
| ✅ | **BE-17** Akun uji `*@maceut.test` yang KOSONG dihapus (17); 8 yang punya zona/capture/export dipertahankan atas keputusan user (termasuk sched@ — zona YOG) | housekeeping |
| ✅ | Notifikasi downgrade (ADR-020): dialog pratinjau dampak (pelanggan & staf, dari server) + tanda "Paused · plan limit" + banner "di-pause oleh perubahan paket" | ADR-020 |
| ✅ | Frontend: ganti mock `features/zones/api.ts` → /zones + /traffic/preview | zone-management/tasks.md Phase 4 |
| ✅ | Frontend: RoadClassPicker pakai `GET /traffic/road-class-counts` — katalog lokal dihapus | zone-management/tasks.md Phase 4 |
| ✅ | **FE-01** Zona kecil di pusat kota bisa sah-sah saja dapat 0 ruas di paket Free — butuh penjelasan di wizard, bukan angka 0 telanjang | temuan 22 Sep |
| ✅ | Frontend: MapCanvas (Leaflet + OSM) + TrafficPreviewPanel + StyleSelector | zone-management/tasks.md Phase 4 |
| ✅ | Backend: internal render page (Playwright target) — `/render/export` + `lib/render-page.ts` | zone-management/tasks.md Phase 3 |
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
| ✅ | **AUTH-OTP** Abstraksi provider email (console · Resend · Mailtrap) + kode OTP untuk verifikasi email (wajib) & lupa password | ADR-026, permintaan user |
| ✅ | **NOTIF** Notifikasi berjalan: bell in-app + banner/toast, email hemat (capture gagal >2 jam, ringkas 1/hari; perubahan paket oleh staf; alert HERE ke satu alamat) + batas kirim OTP | permintaan user |
| ✅ | **FE-23** Halaman zona: label & tabel konsisten, pill status tunggal, tombol terisi warna brand (Capture now / Open in Studio), peta Captures lebih gelap dengan nama tempat tetap terbaca | permintaan user |
| ✅ | **FE-24** Label konsisten di seluruh tabel (daftar zona, admin, jadwal, dashboard): satu bentuk pill untuk status & kategori; kartu Zone details baru; ikon Lucide; paginasi selalu tampil; format tanggal tunggal | permintaan user |
| ✅ | **FE-25** Dashboard: semua metrik data nyata (storage, export bulan ini, zona gagal, masalah hari ini, puncak kemacetan), copy baru, thumbnail kecil di Latest captures | permintaan user |
| ✅ | **FE-26** Pill tanpa titik, tombol tandai-dibaca per notifikasi, error teknis diterjemahkan, kartu Next collection & frame terkumpul dari data nyata | permintaan user |
| ✅ | **FE-27** Kelas jalan berwarna (teal/biru/ungu), kolom Interval & Hours terpisah, pesan gagal export berupa aksi (Retry), subjudul zona dihapus + peta capture lebih tinggi, kartu Next collection baru | permintaan user |
| ✅ | **FE-28** Lebar header = lebar halaman, Collection health ringkas, notifikasi warna brand & copy singkat, judul seksi sejajar ikon, "Retry" | permintaan user |
| ✅ | **FE-29** Semua halaman & header 1600px, Profil: ganti paket di Usage (popup), Billing = info pembayaran, Notifikasi satu toggle; tandai-dibaca andal; link dashboard gaya brand | permintaan user |
| ✅ | **EXP-A1** Export: ZIP di-stream ke R2 (multipart, ZIP64), lanjut setelah crash, satu browser per worker, log waktu per frame (fix #58, #63, #67) | rencana optimasi export |
| ✅ | **EXP-A2** Export: proses browser lebih ringan, data slim disimpan per capture, pakai ulang frame yang sudah dirender | rencana optimasi export |
| ✅ | **EXP-B** Export video lewat ffmpeg (tanpa merekam real-time) | rencana optimasi export |
| ✅ | **EXP-C** Batas frame × piksel per paket, antrian bergiliran, opsi WebP | rencana optimasi export |
| ✅ | **ZONE-PERF** Create zone: jalan dimuat per kelas & bertahap, cache HERE dipakai bersama hitungan, peta canvas berlapis (tanpa lag) | rencana optimasi part 2 |
| ✅ | **FE-30** Dialog jendela capture (copy Inggris, error interaktif, mahkota upgrade, menu ⋮), next capture & export CSV di detail zona, sesi kedaluwarsa → login, login tanpa Agency SSO & link warna brand | review user |

Status: 🔴 Not started · 🟡 In progress · ✅ Done

---

## NOT This Sprint

Jangan implement meskipun ada di spec:
- Capture history page + filter → Sprint 2
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

[2026-10-07] FE-30 — dialog jendela capture, detail zona, sesi kedaluwarsa, login.

  - Dialog jendela (WindowDialog, kini komponen sendiri): copy Inggris; error per field saat blur
    dengan satu tombol perbaikan (Swap times, Weekdays/Every day, ide nama); opsi di atas paket tetap
    bisa dipilih dengan ikon mahkota + panel upgrade (Use hourly / Pause one / Collect hourly /
    Trim to … + Upgrade, draf disimpan di sessionStorage); tanpa kata "budget".
  - API: pesan schedule ke Inggris; kode stabil INTERVAL_NOT_IN_PLAN & CAPTURE_LIMIT_EXCEEDED
    (detail day/frames/dailyLimit); NOT_FOUND membawa `resource`. Web memetakan per kode.
  - Tabel jendela (Schedule & detail zona): menu ⋮ Edit / Pause·Resume / Delete.
  - Detail zona: kartu Next collection (dipindah ke features/schedules) + kartu Capture data dengan
    Export CSV — GET /zones/:id/captures.csv, satu baris per capture dari kolom ringkasan, jangkauan
    per paket (historyDays 7/90/semua, BR-007), maks 50.000 baris, BOM UTF-8.
  - Sesi berakhir: api-client mengarahkan sekali ke /login?redirect=…&expired=1 (tanpa kilasan
    error); login menampilkan "Your session ended…". Pesan API default ke Inggris.
  - Login tanpa Agency SSO; link auth & landing pakai linkClass (ungu brand).
  VERIFIKASI: 472 test API (CSV + kode error baru), tsc + eslint bersih kedua paket.

[2026-10-05f] ZONE-PERF — Create zone tanpa lag (part 2 rencana optimasi).

  - API: cache flow HERE 5 menit (`traffic-cache.service`) dipakai bersama road-class-counts
    & preview → preview tak lagi memanggil HERE ke-4. `/traffic/preview` + `tier` (hanya ruas
    baru di kelas itu; di atas paket = kosong tanpa HERE) + `format=slim`.
  - Web: wizard memuat tier satu per satu sampai kelas terpilih (Nasional dulu), cache per
    ring; efek dikunci ke string ring (dulu `geometry` objek baru tiap render → fetch ulang).
    MapCanvas: `preferCanvas`, satu layer per warna, 2.000 ruas per frame.
  VERIFIKASI: 426 test API (3 baru: selisih tier, tier terkunci, tanpa HERE ekstra), tsc + eslint bersih.

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

[2026-09-23] Data nyata di dashboard, traffic dipotong ke zona, jendela bertumpuk.

  TRAFFIC MELUBER — INI BUG NYATA, bukan soal tampilan. HERE hanya menerima BOUNDING BOX,
  dan kotak selalu lebih besar dari polygon di dalamnya. Tidak ada satu pun pemotongan di
  seluruh kode. Jadi setiap zona yang bukan persegi menampilkan jalan DI LUAR batasnya
  sendiri — dan capture yang tersimpan ikut merekamnya, permanen, karena GeoJSON itulah
  yang digambar ulang panel Snapshots.
  `clipToPolygon` (ray casting) dipasang di TIGA tempat sekaligus, karena satu saja akan
  membuat preview dan capture berbeda isi: preview langsung, worker, dan `deriveRoadStats`
  — yang terakhir penting karena `roadsCount` adalah angka yang dijual wizard; kalau
  menghitung isi kotak, yang dijanjikan bukan yang dikumpulkan.
  Segmen disimpan kalau ADA SATU titiknya di dalam. Memotong persis akan memutus jalan di
  tengah dan menyiratkan jalan itu berhenti di tepi zona — lebih buruk daripada sedikit
  menjulur. Diverifikasi: segitiga setengah luas bbox → 4.809 dari 8.684 fitur.

  DASHBOARD.
  "Latest captures" dulunya `const captureTimes: string[] = []` dengan komentar bahwa
  captures belum ada. Sekarang `GET /captures` lintas semua zona milik akun.
  "Recent renders" MENGARANG. `studioApi.getRenders()` membuat dua render job "selesai"
  dari nama zona akun setiap kali local storage kosong. Itu terlihat seperti riwayat dan
  sebenarnya fiksi — lebih buruk daripada kartu kosong, karena tidak ada yang memeriksa
  ulang angka yang kelihatan masuk akal. Render animasi memang belum punya backend sama
  sekali; kartunya sekarang mengatakan itu. Ditiketkan CAP-03.
  "Next capture" sekarang dibaca dari `schedules.next_fire_at` — kolom yang BENAR-BENAR
  di-claim scheduler — bukan diturunkan ulang. Yang diturunkan terpisah adalah PREDIKSI
  tentang apa yang seharusnya terjadi; ini apa yang AKAN terjadi. Keduanya sepakat selama
  sama-sama dari satu aturan, tapi hanya satu yang menembak.

  PETA. Dulu center-nya `coordinates[0]` — SUDUT zona di tengah layar, jadi zona besar
  keluar dari semua sisi dan zona kecil tenggelam di kota. Sekarang `fitBounds` dengan
  padding dan batas zoom. Dan `isolate`: Leaflet memberi pane serta kontrolnya z-index
  sampai 1000, yang tanpa stacking context sendiri mengambang di atas dialog dan dropdown
  — itulah "peta menimpa komponen lain". Satu kelas, semua instance beres.

  SCHEDULE. Setiap jendela diposisikan absolut di SATU ruler 44px, jadi dua jendela yang
  beririsan jam duduk bertumpuk — zona dengan jendela pagi dan jendela seharian
  menampilkan satu bar dan diam-diam menghilangkan yang lain. Sekarang first-fit lanes:
  tiap jendela mengambil lane pertama yang sudah selesai, diurutkan jam mulai supaya
  jumlah lane-nya minimum.
  Tabel "Capture windows" ditambahkan di bawah ruler, lengkap dengan sort/search/paging.
  Ruler menjawab "kapan zona ini mengumpulkan?"; tabel menjawab "apa persisnya yang
  disetel, dan ada yang di-pause?" — pertanyaan yang muncul justru saat ada yang berhenti.

  278 test (6 baru untuk clipping), tsc + eslint bersih, production build lolos, tiga
  halaman diverifikasi di browser tanpa error klien.

[2026-09-23b] Dashboard: rail terdorong keluar layar, cadence bohong, angka tidak seragam.

  RAIL KELUAR LAYAR — penyebabnya spesifik, bukan sekadar CSS berantakan. Item grid
  default-nya `min-width: auto`, artinya MENOLAK menyusut di bawah lebar kontennya. Strip
  "Latest captures" di kolom kiri adalah delapan kartu 144px berdampingan, jadi kolom 1fr
  melebar melewati containernya dan mendorong rail 340px keluar dari layar — membawa
  serta semua NILAI di Collection health, yang rata-kanan. Labelnya kelihatan, angkanya
  tidak. Perbaikannya `minmax(0,1fr)` + `min-w-0`.

  CADENCE BOHONG, bukan cuma salah bahasa. `cadence` adalah konstanta
  'Belum dijadwalkan' — teks Indonesia di antarmuka Inggris, DAN permanen salah: zona
  yang sudah mengumpulkan tiap jam berhari-hari tetap melaporkan tidak ada jadwal.
  Sekarang diturunkan dari jendela aktif yang sungguhan, satu query GROUP BY untuk
  seluruh daftar: "Every 15 min · 19:27–19:57", "Hourly · 4 windows", atau `null` —
  dan `null` berarti tidak ada jendela aktif, satu-satunya kasus di mana "not scheduled"
  memang benar.
  Kalimatnya dikembalikan ke UI. Catatan Collection health juga mengirim prosa Indonesia
  ("5 hari lagi · 13 zona") ke antarmuka Inggris; API sekarang mengirim `nextCaptureInDays`
  dan `zonesCollecting`, UI yang merangkainya. Menyusun kalimat bukan tugas API.

  ANGKA TIDAK SERAGAM, dan itu betul-betul membingungkan. Satu layar menampilkan
  `11652 roads` (tanpa pemisah), `9.645 roads` (id-ID), dan `501.69 km` — jadi TITIK
  berarti "ribuan" sekaligus "koma desimal" di layar yang sama, dan "9.645" terbaca
  sembilan-koma-enam. Satu helper `formatNumber`/`formatKm` dipakai di semua tempat;
  empat call site berarti empat kesempatan memilih locale berbeda, dan begitulah ini
  terjadi.

  Dua lagi dari screenshot: JSX menelan spasi sebelum em-dash sehingga sapaannya berbunyi
  "Hi Table— here's" (diperbaiki dengan `{' — '}` eksplisit), dan daftar zona tidak
  dibatasi — akun dengan 13 zona mendorong "Latest captures" keluar halaman dan
  meninggalkan rail mengambang di samping kolom baris yang nyaris sama semua. Dibatasi 5
  dengan "8 more zones"; daftar lengkapnya sudah punya halaman sendiri.

  284 test (6 baru untuk cadence), tsc + eslint bersih, build lolos, diverifikasi dengan
  screenshot di viewport yang sama dengan laporan user.

[2026-09-23c] Peringatan hapus pindah ke dialognya. Panel Captures dapat tabel.

  ZONA. Baris "Deleting a zone keeps its captures…" berdiri permanen di bawah tabel,
  padahal dialog konfirmasinya SUDAH mengatakan hal yang sama. Jadi itu duplikasi yang
  terbaca di setiap kunjungan ke halaman zona, termasuk saat tidak ada yang mau dihapus.
  Barisnya dihapus; karena kini dialog itu satu-satunya tempat, kalimatnya dilengkapi:
  jendela capture berhenti SEKETIKA, yang sudah terkumpul disimpan 30 hari, dan ini tidak
  bisa dibatalkan.

  DETAIL ZONA. "Snapshots" jadi "Captures" — satu kata untuk satu hal, sama dengan yang
  dipakai API, database, dan sisa antarmuka.
  Ditambah tabel seluruh riwayat dengan kolom TIME PLANNED dan TIME ACTUAL bersebelahan.
  Itu inti tabelnya: `capturedAt` sendirian tidak bisa membedakan frame tepat waktu dari
  frame yang diambil setelah sistem mati, dan untuk data lalu lintas perbedaan itulah
  seluruh nilai frame-nya. Yang terlewat berbunyi "never ran" di kolom actual, bukan
  waktu palsu. Capture manual menampilkan "—" di kolom planned — memang tidak ada jadwal
  yang dilanggar.
  Stepper menjawab "jam 07:00 tadi kelihatan seperti apa?"; tabel menjawab "apakah semua
  yang seharusnya jalan benar-benar jalan?" — pertanyaan yang muncul justru saat zona
  mendadak sepi, dan tidak bisa dijawab tampilan satu-per-satu. Baris tabel mengklik ke
  stepper, jadi keduanya satu tampilan bukan dua.

  ⚠️ Capture LAMA tetap menyimpan traffic yang belum terpotong — pemotongan baru berlaku
  sejak commit sebelumnya, dan GeoJSON tersimpan tidak ditulis ulang. Segmen yang
  melintasi tepi zona juga sengaja disimpan utuh; memotongnya pas akan memutus jalan di
  tengah.

  284 test hijau, eslint bersih, build lolos, diverifikasi lewat screenshot.

[2026-09-23d] Studio memutar capture sungguhan. Penolakan API akhirnya menyebut rutenya.

  STUDIO DULU MENGARANG TRAFFIC-NYA SENDIRI. `getFrames` membangkitkan kurva Gaussian —
  puncak pagi 07:36, puncak sore lebih landai, dasar 18 semalaman — lalu scrubber-nya
  bergerak melewati angka yang tidak pernah menyentuh jalan. Terbaca meyakinkan, dan
  itulah yang membuatnya lebih buruk daripada layar kosong. Tombol "Render animation"
  menulis job palsu ke localStorage dan melaporkan sukses.
  Sekarang setiap frame adalah satu capture `done` milik zona itu, diputar di peta yang
  sama dengan halaman zona.

  UKURAN PAYLOAD MEMAKSA DESAINNYA. Satu capture ~2 MB; sehari 20 frame = 41 MB kalau
  dikirim di muka. Ditambah proyeksi `?slim=1` yang membuang semua yang bukan garis dan
  warna — nama jalan, jam factor per ruas, functional class — dan memotong koordinat ke
  5 desimal (~1 meter, jauh lebih halus daripada garis setebal 4 piksel). 2,07 MB → 575 KB,
  3,6×. Frame diambil satu per satu saat playback sampai ke sana, frame berikutnya
  di-prefetch, yang sudah dimuat di-cache.

  EKSPOR TIDAK DIBANGUN, dan kartunya mengatakan itu. Mengubah frame jadi file butuh
  render pipeline yang sama dengan gambar capture bermerek (CAP-02). Lebih baik satu
  kalimat jujur daripada tombol yang menulis job palsu lalu bilang berhasil.

  PENOLAKAN API DULU SENYAP. `errorHandler` mengembalikan 4xx tanpa mencatat apa pun,
  jadi "Input tidak valid" yang sampai ke browser tidak menyebut rute mana pun dan tidak
  ada apa-apa di log untuk dicocokkan. Sekarang satu baris per penolakan: kode, method,
  path, pesan. Cukup untuk menemukan, tidak cukup untuk mengubur crash sungguhan. Itu
  juga yang akhirnya membuktikan error di atas BUKAN dari API — melainkan bundle basi
  hasil hot-reload saat penulisan ulang, hilang setelah `.next` dibersihkan.

  Dua pelanggaran React ditangkap lint saat menulis player-nya: membaca `ref` saat render
  (nilai yang dibaca belum tentu yang dipakai React menggambar) dan `setState` sinkron di
  dalam effect. Keduanya diperbaiki dengan cara yang sama seperti sebelumnya — state
  ber-kunci, bukan reset.

  284 test, tsc + eslint bersih, build lolos, diverifikasi lewat screenshot.

[2026-09-23e] Detail zona: legenda, kata yang dimengerti, dan kolom yang tidak kosong.

  LEGENDA JAM FACTOR di bawah peta. Peta menggambar garis berwarna dan tidak ada yang
  menjelaskan artinya — hijau dan oranye bisa ditebak, tapi batas antara "slow" dan
  "heavy" tidak, dan bahwa 10 berarti jalan tertutup juga tidak. Rentangnya memakai
  konstanta warna yang sama dengan yang dipakai server mewarnai ruas, jadi legendanya
  tidak bisa melenceng dari petanya. BR-019 mewajibkan legenda di setiap gambar capture;
  ini membuatnya konsisten sejak sekarang.

  "WINDOW" JADI "AUTO". "Window" itu kosakata kita untuk jadwal; yang ingin diketahui
  pembaca adalah apakah ini jalan sendiri atau karena seseorang menekan tombol.

  "FILES COLLECTED" DIHAPUS. Belum ada yang menulis file, jadi bloknya adalah paragraf
  yang menjelaskan kekosongannya sendiri di setiap siklus. Kalau renderer datang
  (CAP-02), tempatnya kembali dengan isi.

  BADGE "COLLECTED" DI ATAS PETA DIHAPUS — untuk siklus yang berhasil, petanya sendiri
  sudah mengatakan itu, dan tabel membawa status untuk setiap baris. Badge-nya tetap
  muncul kalau ada yang SALAH, karena di situ ia baru memberi informasi.

  KOLOM "TIME PLANNED" JADI "TIME", dan capture manual mengisinya dengan waktunya sendiri
  alih-alih "—". Capture manual memang tidak punya jadwal untuk diukur, tapi bukan berarti
  tanpa waktu: ia jatuh tempo saat orangnya meminta. Tanda "—" terbaca seperti data
  hilang. Kolom kedua jadi "Collected at". Kunci sortir ikut aturan yang sama, kalau tidak
  kolomnya akan diurutkan berdasarkan nilai yang tidak lagi ditampilkan.

  ⚠️ Catatan proses: dua suntingan pertama SEMPAT HILANG karena skrip-nya melempar di
  assertion berikutnya sebelum menulis file — pola yang sama sudah menggigit dua kali
  sebelumnya. Ketahuan hanya karena screenshot masih menampilkan "Window".

  284 test, tsc + eslint bersih, build lolos.

[2026-09-23f] Studio bisa menggambar dan mengekspor. Tanpa dependency baru.

  RENDERER CANVAS SENDIRI, bukan screenshot DOM. Dua alasan: screenshot butuh pustaka yang
  belum ada, dan canvas Leaflet ter-taint begitu ada satu sumber tanpa header CORS —
  `toBlob` gagal di langkah TERAKHIR, setelah semua kerjanya selesai. Menggambar tile
  sendiri membuat canvas-nya bersih. Dicek dulu sebelum menulis apa pun: tile OSM
  mengirim `access-control-allow-origin: *`, itu yang membuat semuanya mungkin.

  PREVIEW-NYA ADALAH RENDERER-NYA. Bukan Leaflet dengan filter CSS di atasnya. Preview
  terpisah akan terlihat mirip dan mengekspor berbeda, dan bedanya baru ketahuan setelah
  seseorang mengirimkan filenya. Pan/zoom tetap ada di halaman zona; di sini kesetiaan
  lebih berharga.

  URUTAN FILTER MENIPU, dan sempat salah. `brightness` SEBELUM `invert` menggelapkan peta
  terang, lalu invert membuatnya terang lagi — hasilnya abu-abu pucat, kebalikan dari yang
  dimaksud. Ketahuan dari screenshot, bukan dari kode. Sekarang invert dulu untuk membalik
  petanya jadi gelap, baru diredupkan.
  Filter hanya dipakai pada BASEMAP. Kalau global, warna traffic ikut lewat filter, dan
  merah "congested" yang sudah di-hue-rotate bukan lagi merah yang dijanjikan legenda.

  ANIMASI pakai `captureStream(0)` + `requestFrame()` — perekam mengambil frame hanya saat
  disuruh, jadi tile yang lambat tidak meregangkan apa pun dan yang cepat tidak
  menghasilkan belasan frame nyaris identik. Merekam real-time akan membuat hasilnya
  bergantung pada jaringan, dan itu bukan sifat yang diinginkan siapa pun dari sebuah
  ekspor. WebM karena itu yang bisa direkam browser tanpa pustaka; MP4 butuh encoder,
  pertanyaan dependency yang sama dengan render server-side.

  LIMA STYLE dan empat toggle layer (basemap, timestamp, legend, batas zona). Dua gambar
  rujukan user berbeda tepat pada sakelar itu — satu membawa blok timestamp, satu tidak.

  ⚠️ INI TIDAK MENGGANTIKAN CAP-02. Render hanya terjadi saat seseorang membuka Studio dan
  menekan ekspor. Capture terjadwal tetap belum menghasilkan PNG otomatis di R2 (BR-009).
  Saat renderer server-side dibangun, ia harus MENJALANKAN kode ini di halaman internal,
  bukan menulis ulang gambarnya — kalau tidak, keduanya perlahan berhenti mirip.

  284 test, tsc + eslint bersih, build lolos, diverifikasi lewat screenshot.

[2026-09-24] Studio: rentang waktu, ekspor banyak gambar, viewer capture lebih cepat.

  VIEWER CAPTURE (stepper di halaman zona) SELAMA INI LAMBAN — bukan perasaan, terukur.
  Setiap panah memanggil `getCapture` (bentuk PENUH: nama jalan, jam factor per ruas,
  functional class) — 2,07 MB — TANPA prefetch, jadi setiap langkah menunggu satu
  request multi-megabyte baru. Studio sudah memecahkan masalah yang sama persis musim
  lalu dengan proyeksi `?slim=1` (575 KB) plus cache; perbaikan ini cuma memakai solusi
  yang sama di tempat kedua. `SlimTraffic` dan fetcher-nya dipindah ke `zones/api.ts`
  supaya kedua pemanggil berbagi SATU sumber, bukan dua salinan yang bisa melenceng.
  Prefetch-nya dua arah (tetangga lebih tua DAN lebih baru), beda dari Studio yang cuma
  prefetch maju — stepper di sini dipakai bolak-balik, bukan diputar satu arah.

  RENTANG WAKTU diikat ke ID capture SUNGGUHAN, bukan jam bebas. Capture jatuh di waktu
  tidak beraturan — manual jam 19:33, jadwal berikutnya 19:42 — jadi rentang berbasis jam
  bebas harus menebak capture mana yang "termasuk" pada batasnya. Mengikat ke frame nyata
  berarti setiap pilihan di dropdown adalah sesuatu yang benar-benar ada.
  Disimpan sebagai {day, startId, endId} dan di-kunci ke hari — bukan di-reset lewat
  effect. Rentang yang hari-nya tidak cocok lagi bukan rentang hari ini, jadi pembacaan
  jatuh balik ke hari penuh dengan sendirinya. Pola yang sama dengan `loadedFrames` untuk
  ganti zona sebelumnya. Menghindari peringatan lint "setState sinkron dalam effect" yang
  sudah tiga kali muncul sesi ini — kali ini dihindari dari awal, bukan diperbaiki
  belakangan.

  BAGAN "CONGESTION THROUGH THE DAY" tetap menampilkan SELURUH hari, bukan cuma rentang
  terpilih — batang di luar rentang diredupkan dan tidak bisa diklik. Itulah preview-nya:
  menyempitkan rentang adalah pilihan yang terlihat DIBANDINGKAN hari penuh, bukan operasi
  pada data yang hilang dari pandangan.

  EKSPOR BANYAK GAMBAR = SATU FILE ZIP, bukan banyak download terpisah. Memicu N download
  berturut-turut persis yang dihentikan pemblokir pop-up, dan orangnya harus menyetujui
  satu-satu. Ditulis penulis ZIP sendiri (`studio/zip.ts`, metode STORE, tanpa kompresi,
  tanpa dependency baru) — PNG sudah terkompresi, mengompres ulang byte terkompresi tidak
  memberi apa-apa. DIUJI dengan `unzip` sungguhan (file teks) DAN dengan modul `zipfile`
  Python yang independen atas hasil ekspor SUNGGUHAN (3 capture nyata → basemap nyata →
  traffic nyata → PNG nyata): `testzip()` bersih, tiga PNG ~228 KB dengan signature yang
  benar. Bukan cuma "kode-nya terlihat benar" — jalur render-ke-zip lengkap dijalankan
  dan hasilnya diperiksa byte demi byte.

  GAYA (STYLE) YANG DIPILIH SUDAH IKUT SETIAP EKSPOR sejak sesi sebelumnya (`renderInputFor`
  membawa `style` ke ketiganya: PNG, ZIP, animasi) — dicek ulang, masih benar, tidak ada
  kerja tambahan diperlukan untuk permintaan itu.

  "LIHAT HASIL AKHIR SEBELUM EKSPOR" tidak dibuat sebagai layar preview terpisah. Yang
  diputar dan yang diekspor adalah SATU set frame yang sama (`frames`, hasil irisan
  rentang) — men-scrub atau menekan Play SUDAH ADALAH preview-nya, karena preview itu
  sendiri adalah renderer yang sama persis yang dipakai ekspor (keputusan dari sesi
  sebelumnya, dipertahankan). Layar preview kedua akan berisiko menunjukkan sesuatu yang
  tidak benar-benar dihasilkan ekspor.

  284 test, tsc + eslint bersih, production build lolos.

[2026-09-24b] Studio: panel style dipecah 5 bagian — map theme, congestion theme, zoom position, overlay, output size.

  PARADIGMA STYLE BERUBAH dari satu daftar preset datar (`STYLE_PRESETS`) menjadi lima
  konsep terpisah, mengikuti pola panel Map Style di maptoposter.tarmizi.id yang dijadikan
  acuan: Map theme (Standard: Dark/Daylight/Satellite, Artistic: Default/Cyber Glitch/
  Midnight Neon/Sakura Bloom), Congestion theme, Zoom position, Overlay, Output size.
  `render.ts` ditulis ulang total di sekitar bentuk ini — lihat `MAP_THEMES`,
  `CONGESTION_THEMES`, `OUTPUT_SIZES`, `RenderView`, `RenderOverlay`.

  MAP THEME DAN CONGESTION THEME SENGAJA DIPISAH. BR-017 memberi arti sungguhan pada
  empat warna traffic (hijau=lancar, merah=macet); tema kosmetik peta yang menyentuh
  warna itu diam-diam akan merusak arti itu. Congestion theme "Standard" adalah pemetaan
  identitas hex→hex — itu BUKAN placeholder, itu intinya: hanya map theme yang diganti
  tidak mengubah arti macet, mengubah congestion theme adalah pilihan eksplisit terpisah
  untuk menukar arti demi tampilan.

  SATELIT PAKAI ESRI WORLD IMAGERY GRATIS (server.arcgisonline.com), bukan HERE atau
  sumber berbayar — tanpa API key, CORS `Access-Control-Allow-Origin: *` dicek dengan
  curl SEBELUM dipasang, sama seperti OSM dicek dulu waktu Studio pertama dibangun.
  Urutan path-nya `{z}/{y}/{x}`, TERBALIK dari OSM yang `{z}/{x}/{y}` — kalau tertukar,
  bukan error, tapi diam-diam menggambar tile belahan bumi yang salah.

  ZOOM DAN PAN DISIMPAN RELATIF, bukan absolut — zoom sebagai offset dari zoom auto-fit,
  pan sebagai fraksi lebar/tinggi canvas, bukan pixel. Alasannya menjaga aturan yang
  sudah ada sejak Studio pertama: preview ADALAH renderer yang sama persis dengan
  ekspor. Pan dalam pixel yang diset sambil melihat preview 960 lebar akan mendarat di
  tempat lain sama sekali di ekspor 1920 lebar; fraksi tidak tergantung resolusi.
  Drag-to-pan di canvas preview pakai Pointer Events native, tanpa dependency baru.

  BUG DITEMUKAN SAAT VERIFIKASI (dan langsung diperbaiki): `renderCapture` menggambar
  tile basemap satu per satu begitu tiap `loadTile()` selesai, jadi dua render yang
  tumpang tindih (ganti tema cepat sementara tile lama masih di-fetch) bisa saling
  menimpa canvas yang sama — tile dari render lama mendarat SETELAH render baru selesai.
  Diperbaiki dengan buffer offscreen: preview digambar ke canvas terpisah dulu, baru
  di-blit ke canvas yang terlihat hanya kalau effect-nya masih berlaku (bukan stale).

  DIVERIFIKASI lewat browser sungguhan (akun + zona + 4 capture nyata lewat API):
  5 section render berurutan, tema Midnight Neon terlihat berbeda dari Dark biasa,
  tile satelit sungguhan termuat (bukan blank/tainted canvas), Output size Square
  mengubah aspect ratio canvas (738×461 → 738×738), drag-to-pan menggeser peta dan
  memunculkan tombol Reset, nol error console. tsc + eslint bersih.

[2026-09-24c] Studio: kolom kanan jadi drawer terkunci, readout pindah ke bawah peta.

  Peta DIKUNCI seperti sidebar drawer. Di laptop ke atas, kolom kanan `sticky` dengan
  `max-h-[calc(100vh-2rem)]` dan bagian kontrolnya (Timeframe, Map theme, Congestion
  theme, Zoom position, Overlay, Output size) `overflow-y-auto` menggulir sendiri —
  peta tetap di tempat saat rail digulir. Kartu Export `shrink-0` di luar area gulir,
  jadi tersemat di bawah drawer dan selalu terjangkau tanpa harus melewati semua
  kontrol dulu.

  "THIS FRAME" DAN "DAY SUMMARY" PINDAH KE BAWAH PETA (kolom kiri, berdampingan di
  tablet+). Keduanya adalah readout dari apa yang ada di layar; kolom kanan sekarang
  murni laci kontrol style, jadi readout tidak seharusnya di sana.

  ZOOM diperluas dari maksimal +3 jadi +10. `computeViewport` sudah meng-clamp zoom
  absolut ke 18, jadi offset besar aman.

  DIVERIFIKASI browser (viewport 1400×900): rail bagian dalam menggulir sendiri
  (scrollHeight 1331 > clientHeight 628) sementara canvas peta diam; sticky drawer
  aktif saat halaman digulir; Export tetap di bawah; slider zoom `max=10` menampilkan
  "+10" dan memperbesar peta. Nol error console. tsc + eslint bersih.

[2026-09-27] Studio: basemap vektor bergaya — tampilan MapToPoster, jalan kecil terlihat.

  RISET maptoposter.tarmizi.id (MIT, github.com/dimartarmizi/map-to-poster). Rahasianya
  lebih kecil dari kelihatannya: BUKAN gambar tile, tapi TILE VEKTOR OSM dari OpenFreeMap
  (gratis, tanpa key, `Access-Control-Allow-Origin: *` — dicek dengan curl sebelum
  dipakai), dan style-nya minimal: latar, air, taman, dan jaringan jalan dipecah per
  kelas (motorway → minor), tiap kelas satu warna. Tanpa label, tanpa gedung. Tema = palet.
  Tile raster tidak bisa begitu — warnanya sudah terpanggang di gambar — itu sebabnya
  tema lama harus memaksa tile OSM lewat filter CSS dan jalan kecilnya hilang.

  DIBANGUN SENDIRI, BUKAN MAPLIBRE (keputusan user). `studio/vector-tiles.ts`: pembaca
  protobuf (~150 baris) + decoder Mapbox Vector Tile yang hanya membuka layer `water`,
  `park`, `transportation` — gedung/label/POI dilewati per byte-range tanpa di-decode.
  Digambar ke canvas yang sama dengan semua hal lain, jadi preview tetap persis ekspor
  dan tidak ada dependency baru. DIUJI pada tile Jakarta z14 sungguhan (460 KB): decode
  19 ms, 1.737 jalan minor, 359 primary, 31 badan air, nol koordinat di luar buffer.
  Catatan skema: OpenMapTiles memakai kelas `minor`, bukan `residential` — style
  MapToPoster sendiri memfilter `residential` yang tidak pernah cocok.

  SEMUA TEMA KECUALI SATELIT kini peta vektor dengan paletnya sendiri (Dark, Daylight,
  Default, Cyber Glitch, Midnight Neon, Sakura Bloom — nama dari user). Ini MEMBALIK
  keputusan sesi sebelumnya ("Artistic tanpa basemap") atas permintaan user. Percobaan
  glow/wash/gradient dibuang seluruhnya — user menilai pendekatannya buruk, dan ukurannya
  juga: blur menambah ~60 ms per frame. Satelit tetap citra Esri.

  TRAFFIC HARUS TETAP MEMIMPIN. Tiap jalan traffic digambar di atas casing warna latar
  (cara MapToPoster menggambar rute-nya), casing semua jalan dulu baru warnanya, dibatch
  per warna (4 stroke, bukan ribuan). Palet Cyber Glitch & Sakura Bloom DIREDUPKAN
  setelah verifikasi: arteri cyan terang mengalahkan garis traffic. Warna traffic tetap
  milik Congestion theme (BR-017).

  CAPTION diberi halo "knock-out" warna latar (jalan berhenti tepat sebelum huruf, seperti
  peta cetak), bukan drop shadow; satelit tetap shadow. Tebal halo diberi batas bawah dari
  unit caption — halo proporsional ke baris tanggal yang kecil terlalu tipis dan jalan
  utama masih memotong di antara kata.

  ATRIBUSI ditambahkan di setiap gambar ("© OpenStreetMap contributors · OpenFreeMap" /
  "Imagery © Esri, Maxar, Earthstar Geographics"). Wajib menurut lisensi ODbL OSM —
  ekspor sebelumnya TIDAK punya atribusi sama sekali. Terbaca di file ekspor; di preview
  (gambar yang sama diperkecil ~46%) terlalu kecil untuk dibaca — itu konsekuensi preview
  = ekspor, bukan bug.

  PERFORMA: cache layer basemap per (tema, viewport, ukuran) — basemap sama di setiap
  frame, hanya traffic yang berubah. Tanpa cache, Dark versi filter lama makan ~700 ms per
  frame di 4× (preview kini di ukuran ekspor). Dengan cache + vektor: 4× playback 17 frame
  dalam 5 detik, NOL long task di Daylight & Cyber Glitch.

  JUGA DI RONDE INI: kartu tema gaya gambar referensi user (segmented control, lingkaran
  swatch dari palet, caption miring); preview dirender di ukuran ekspor (maks 2400px) —
  preview 960px sebelumnya memilih zoom tile lebih rendah dari ekspor, jadi menampilkan
  detail lebih sedikit dari file yang diunduh; bug tile-sobek diperbaiki tuntas (canvas
  scratch BARU per render — perbaikan pertama berbagi satu canvas dan tile basi masih
  mendarat tanpa filter); satu gaya heading (`SectionLabel`); Select tanpa lebar kini
  `w-full`; input ukuran custom pakai `Input` bersama; label Start/End kini benar
  terhubung; "Congestion through the day" pindah ke paling bawah.

  Diverifikasi di headless Chrome berulang kali (akun + zona Sudirman Wide, capture
  nyata): 7 tema, tanpa seam antar tile, ekspor 1600×1000, nol error console dari Studio,
  nol request gagal ke openfreemap.org. tsc + eslint bersih.

[2026-09-27b] Studio: zoom halus, pan bebas, jalan dinamis, teks gaya MapToPoster yang bisa digeser.

  PAN "TERKUNCI" DI ZOOM TINGGI — BUG. Pan disimpan sebagai fraksi dari view SAAT INI dan
  di-clamp ±0,6; di +4 itu hanya secuil zona. Kini pan disimpan dalam satuan view hasil
  auto-fit (jarak geografis tetap di semua zoom), batas ±1,5 zona, dan drag dibagi faktor
  zoom sehingga peta mengikuti pointer 1:1. Zoom setelah pan tidak lagi melompat.

  TAB BROWSER BISA CRASH saat menggeser peta — ditemukan verifikasi, bukan user. Setiap
  pointermove memulai render penuh 1600×1000 yang tidak pernah dibatalkan; drag cepat
  menumpuk puluhan render sampai memori habis. Dua perbaikan: (1) selama drag, gambar
  terakhir cuma digeser lewat CSS transform, render sungguhan sekali saat dilepas (dan
  geseran bertahan sampai render baru tampil, jadi tidak ada snap-back); (2) antrian
  render preview: satu berjalan, hanya permintaan TERBARU yang menyusul. User
  mengonfirmasi drag di +4 ke atas lancar.

  ZOOM: batas absolut 18 membuat separuh atas slider mati. Vektor kini sampai z22
  (geometri di-overzoom tanpa blur), satelit z19 (lewat itu Esri memberi placeholder).
  Rentang slider dihitung dari zona & ukuran (`zoomLimits`) — tidak ada langkah mati.
  Zoom kini PECAHAN: slider ¼ langkah dan roda mouse (menuju kursor — titik di bawah
  pointer tetap di bawahnya). Tile tetap di zoom bulat; sisanya ditanggung skala
  (vektor tajam, satelit diskalakan maksimal 2×).

  JALAN KECIL DINAMIS: tiap kelas punya zoom minimum (jalan kecil z13, path/service z14)
  dengan fade kontinu satu langkah di bawahnya; tebal garis tumbuh ×~1,6 per langkah
  (versi pertama ×1,27, dicap 2,4× — terlihat seperti kerangka kawat saat zoom in).
  Garis traffic ikut menebal separuh laju, jadi saat dekat terbaca sebagai garis tengah.

  CYBER GLITCH & SAKURA BLOOM = palet MapToPoster PERSIS (`cyber_glitch`, `sakura_bloom`
  dari bundle mereka, MIT). Satu detail: style mereka mewarnai kelas `residential` yang
  tidak pernah ada di OpenMapTiles, jadi di situs mereka jalan kecil tergambar dengan
  warna `road_default` — itu yang disalin, bukan konfigurasinya. Sakura Bloom kini tema
  TERANG, seperti aslinya. Ditambah VIGNETTE mereka (default `overlayBgType`): warna latar
  memudar di atas & bawah (solid 3%, bening di 20%, balik dari 80%) — di bawah traffic,
  jadi tidak ada kemacetan yang ikut pudar.

  CONGESTION THEME kini kartu swatch seperti map theme (komponen `SwatchCard` bersama).

  TEKS mengikuti sistem MapToPoster: nama zona serif tebal ber-tracking 0,25em, garis
  tipis 128px, lalu "HH:MM WIB" dan "HARI · TANGGAL" ber-tracking 0,4em; skala dari
  1080px sisi pendek, jarak 12px antar baris, 48px dari tepi. Ukuran None/S/M/L
  (0,75/1/1,35 — preset mereka; None = sembunyi). Blok bisa DIGESER bebas (hit-test
  memakai layout yang sama dengan gambar, jadi area pegangan = teks persis), tertahan di
  margin tepi; preset posisi tetap ada. Halo diperlebar sesuai tracking — halo lama
  membiarkan jalan tampak di sela huruf tanggal.

  TEKS PANDUAN DIHAPUS dari panel (caption tema, penjelasan congestion, "Drag the
  preview…", "N of M frames selected"). Yang tersisa hanya nilai (1600 × 1000, zoom).

  Diverifikasi: headless Chrome (pan 1:1 terukur, zoom +2→+3 tetap di pusat yang sama,
  ekspor = preview 0 pixel beda, caption di posisi yang ditaruh) + uji manual user (drag
  di zoom tinggi, halo tanggal). tsc + eslint bersih. Roda mouse & slider ¼ langkah
  ditambahkan setelah uji user — belum diuji ulang di browser.

[2026-09-27c] Studio: panel yang lebih rapi, judul bisa diubah, teks diam saat peta digeser.

  PREVIEW JADI DUA KANVAS BERTUMPUK: peta di bawah (render lewat antrian, digeser CSS
  saat drag), overlay (teks, legenda, atribusi) di atas dan digambar ulang seketika.
  `renderCapture` untuk ekspor tetap satu gambar, dari dua fungsi yang sama
  (`renderMap` + `renderOverlays`) — preview tetap = ekspor. Hasilnya: teks tidak ikut
  bergeser saat peta di-drag (keluhan user), dan menggeser teks atau mengetik judul
  hanya menggambar ulang lapisan kecil, bukan seluruh peta.

  HALO TEKS DIGANTI "SCRIM": verifikasi menemukan jalan masih terlihat di sela huruf
  tanggal yang ber-tracking lebar, dan halo yang dilebarkan membuat judul besar jadi
  kotak padat bersisi keras. Kini satu bidang lembut warna latar di belakang seluruh
  blok (bayangan kabur dari persegi yang digambar di luar kanvas — tanpa tepi keras),
  plus garis tepi tipis di huruf.

  UI: kartu Zoom & position — tombol reset berikon (nonaktif di posisi awal), tombol −/+
  mengapit slider, nilai zoom di header. Overlay — kolom Title (default nama zona),
  pemilih posisi berupa miniatur poster berwarna tema dengan 5 titik + penanda posisi
  teks sebenarnya, petunjuk "drag the text" berikon, Legend & Zone boundary jadi switch
  (komponen baru `ui/Switch.tsx` di atas Base UI Switch). Output size — kartu Square/
  Portrait/Landscape + Other (Classic, Social 4:5, A4 300dpi, 4K) sesuai gambar user,
  kotak W × H putus-putus yang bisa diketik (otomatis jadi custom). Halaman Studio kini
  maks 1600px (halaman lain tetap 1180px), laci 360px, preview portrait dibatasi tinggi
  layar.

  VERIFIKASI: tsc + eslint bersih. Ronde B (pan 1:1, tanpa crash, lebar jalan, perataan
  teks) LULUS di headless Chrome. Ronde C (UI baru ini) TIDAK BISA dijalankan — host
  kehabisan memori (OOM killer mematikan tab browser berulang, ~500MB bebas dari 7,7GB,
  tanpa swap). UI baru ini BELUM dilihat di browser selain oleh user.

[2026-09-27d] Studio: satu kartu alat, Export jadi menu, alignment teks eksplisit.

  RINGKASAN HARI PINDAH KE DETAIL ZONA. "This frame", "Day summary" dan "Congestion
  through the day" kini di bawah tabel Captures (`zones/components/CaptureDay.tsx`),
  untuk hari dari capture yang dipilih di stepper; klik batang memilih capture itu.
  Studio untuk membuat gambar — "bagaimana hari zona ini" adalah pertanyaan tentang zona.

  PANEL ALAT JADI SATU KARTU: bagian-bagian dipisah garis, badan menggulir tanpa
  scrollbar (utility `scrollbar-none` di globals.css), Export jadi footer tetap. Tiga
  tombol export diganti SATU tombol "Export" dengan menu Base UI (This frame · PNG,
  All frames · ZIP, Animation · WebM) — tiap item menyebut ukuran/jumlah frame, dan
  alasan bila nonaktif.

  SCRIM DIBUANG atas permintaan user (terbaca sebagai bayangan); halo huruf sebelumnya
  kembali.

  POSISI → ALIGNMENT (keputusan user): baris 1 kiri/tengah/kanan menaruh teks di sisi itu
  DAN meratakan barisnya; baris 2 atas/tengah/bawah menaruh vertikal. Drag menggeser
  bebas tapi TIDAK lagi mengubah alignment (versi sebelumnya menebak alignment dari posisi
  jatuh — user tidak mau).

  EFEK OVERLAY: None / Vignette (default Vignette, tampilan sebelumnya), kini berlaku untuk
  semua tema termasuk satelit. Tab selector jadi ungu (warna primary aplikasi). Kartu
  "Other" di Output size membuka modal berisi semua ukuran (Poster + More sizes).

  VERIFIKASI: tsc + eslint bersih; /studio dan /zones 200. Browser headless TIDAK
  dijalankan — host ~850MB tersedia, load 16 (OOM killer mematikan tab di ronde
  sebelumnya). Satu error sesaat di log (import TEXT_PRESETS) terjadi di tengah edit dan
  hilang setelah edit selesai.

[2026-09-27e] Studio: rentang lintas hari, animasi 1:1 dengan preview.

  RENTANG LINTAS HARI. Pemilih Day di header dihapus; Timeframe kini From/To, masing-masing
  (hari + jam capture di hari itu), plus pilihan cepat Newest day / Last 7 days / All dan
  pil jumlah frame. Rentang disimpan sebagai dua id capture di seluruh riwayat zona,
  di-kunci ke zona (bukan di-reset effect). Default tetap hari terbaru — zona dengan
  riwayat berminggu-minggu tidak membuka ratusan frame. Nama file ekspor memakai rentang
  (`…_to_…`).

  ANIMASI TIDAK SAMA DENGAN PREVIEW — tiga sebab, tiga perbaikan:
  1. TIMING: MediaRecorder merekam real-time, jadi tiap frame tertahan hold + waktu render
     frame berikutnya (detik, di ukuran poster) — video lebih lambat & tidak rata dari
     preview. Kini recorder di-PAUSE selama render dan RESUME hanya selama hold; waktu
     pause tidak masuk file. Satu salinan frame terakhir ditambahkan supaya pemutar tidak
     memotong frame terakhir.
  2. FRAMING TERGANTUNG UKURAN: fit zoom dulu dibulatkan ke zoom bulat berdasarkan jumlah
     pixel, jadi 1080 vs 1920 vs 4K menunjukkan area berbeda, dan ukuran di atas cap
     preview 2400px tidak pernah sama dengan preview-nya. Kini fit zoom EKSAK (pecahan), dan
     detail (tile mana, kelas jalan mana, tebal garis) mengikuti "detail zoom" yang
     dinormalisasi ke gambar 1000px. Ukuran apa pun = peta yang sama, hanya resolusinya.
  3. KUALITAS: bitrate tetap 8 Mbps lembek di ≥1920px; kini ~12 bit/pixel/detik, 8–60 Mbps.

  VERIFIKASI: tsc + eslint bersih, /studio 200. Browser TIDAK terverifikasi — tab
  headless kembali di-OOM-kill host saat /studio dimuat (oom_kill 115→116). Rentang lintas
  hari juga tidak bisa diuji lewat app: capture selalu dicap waktu saat dijalankan, jadi
  hari kedua baru ada setelah jadwal berjalan lintas hari. Skrip uji siap diulang:
  /tmp/studio-verify/Dr.mjs.

[2026-09-28] Studio: perbaikan kecil; rancangan export async.

  - Deskripsi header dihapus. Detail jam di bawah scrubber dihapus; pembacaan frame pindah
    ke baris transport sebagai "Frame 3 of 50 · Sat 27 Sep · 06:00 WIB" — tanggal perlu
    sejak rentang bisa lintas hari.
  - JUDUL PANJANG TERBUNGKUS hingga 3 baris (leading judul), bukan mengecil jadi satu
    baris; hanya mengecil bila 3 baris belum cukup atau satu kata terlalu lebar. Kotak
    hit-test drag ikut tumbuh karena memakai layout yang sama.
  - Outline teks dihapus; caption digambar 90% opasitas (keputusan user: transparansi
    tetap, bukan kontrol baru). Satelit tetap berbayang lembut.
  - Export dari menu dropdown jadi MODAL berisi tiga kartu opsi (PNG / ZIP / WebM) dengan
    detail ukuran & jumlah frame dan alasan bila nonaktif.
  - Output size: kartu dengan glyph proporsi (persegi/potret/lanskap; "Other" dua kotak
    bertumpuk), hierarki teks lebih jelas; kolom W/H berlabel dengan "px".
  - Swatch kartu tema DIHITUNG: latar dulu, lalu warna palet terjauh (jarak RGB) dari
    yang sudah dipilih — dulu pilihan tetap (latar, motorway, primary, air) membuat
    lingkaran pertama & terakhir nyaris sama di Default/Midnight Neon, dan dua kuning di
    Cyber Glitch. Tema "Default" diganti nama "Charcoal".

  EXPORT ASYNC (FE-21, BELUM DIKERJAKAN — ronde berikutnya, keputusan user): render di
  worker server (playwright-core + Chromium yang sudah ada di image worker) lewat halaman
  render internal yang menjalankan renderer yang SAMA; hasil ke R2; tabel `exports`
  (status queued/rendering/uploading/done/failed/expired, frames_done, heartbeat
  updated_at); progres dari halaman → worker via exposeFunction → UPDATE baris (maks
  1×/detik) → API menurunkan progress/antrian/ETA saat dibaca → browser polling 2 detik
  selama aktif. Modal export jadi tampilan progres (bukan toast), chip di footer Studio,
  riwayat di bagian terakhir detail zona. Risiko: host ini berulang kali OOM-kill
  Chromium — worker harus satu export sekaligus.

  VERIFIKASI: tsc + eslint bersih, /studio 200, tanpa error di log. Browser tidak
  dijalankan (host kekurangan memori).

[2026-09-28b] Export Studio dikerjakan server (FE-21). Aturan baru: PR, bukan commit ke develop.

  ATURAN BARU (user): pekerjaan selesai TIDAK di-commit langsung ke `develop`. Kerjakan di
  branch `<type>/<nama>` dari develop, buka PR ke develop, dan tunggu review user sebelum
  merge. Dicatat di CLAUDE.md (AI Rules). Branch ini: `feat/async-export`.

  ALIRAN: Studio → POST /zones/:id/exports (format zip|webm, capture awal & akhir,
  pengaturan render per id) → service memeriksa kepemilikan, satu export aktif per akun
  (409 EXPORT_IN_PROGRESS), batas frame per paket (free 60 / standard 240 / premium 720,
  422 EXPORT_LIMIT_EXCEEDED), R2 terkonfigurasi → baris `exports` (frame DIBEKUKAN saat
  permintaan) → antrian `export-jobs` → worker (prefetch 1) meluncurkan Chromium yang
  sudah ada di image worker lewat `playwright-core` (dependency baru, disetujui user) →
  membuka halaman render internal web `/render/export` → halaman itu menjalankan
  `renderCapture`/`recordAnimation` YANG SAMA dengan preview Studio → hasil ke R2
  `exports/{user}/{id}.{zip|webm}` → baris `done` + link unduh bertanda tangan 15 menit
  (dengan nama file yang manusiawi via Content-Disposition). PNG tunggal tetap di browser.

  JEMBATAN HALAMAN ↔ WORKER: fungsi yang di-expose Playwright (in-process), bukan API —
  `__exportFrame(i)` (traffic slim per frame, dibaca satu-satu dari DB), `__exportProgress`
  (juga memberi tahu bila dibatalkan), `__exportPng`/`__exportChunk` (keluaran base64
  per 4 MB). Halaman render tidak punya data & tidak memanggil API, jadi aman di luar area
  login.

  PROGRES: worker menulis `frames_done` maks 1×/detik (+ selalu frame terakhir);
  `updated_at` = heartbeat (juga setiap 30 detik saat langkah panjang). API menurunkan
  `progress`, `queuePosition`, `etaSeconds`, `downloadUrl` saat dibaca — tidak ada status
  yang disimpan dua kali. Browser polling tiap 2 detik selama aktif & tab terlihat.
  SWEEPER (proses API, tiap menit): render yang heartbeat-nya berhenti >2 menit → failed
  (worker di-OOM-kill); file lewat masa simpan (EXPORT_RETENTION_DAYS, default 7) dihapus
  dari R2, baris tetap sebagai `expired`.

  UX: dialog Export tidak menutup setelah memulai — berubah jadi tampilan progres
  ("Making your animation", pill + bar + keterangan, penjelasan bahwa ini berjalan di
  server dan file menunggu di halaman zona), tombol Keep editing / Open zone page →.
  Chip di footer Studio menjaga export yang berjalan tetap terlihat (klik = buka lagi),
  dan muncul juga bila export zona itu sudah berjalan sebelumnya. Halaman zona: bagian
  "Exports" paling bawah — tabel dengan pill/bar/keterangan per status, Download, Retry
  (baris baru, riwayat gagal tetap), Cancel/Delete; datang dari Studio menyorot barisnya.

  DITEMUKAN SAAT UJI END-TO-END (worker sungguhan, R2 sungguhan, zona YOG ~9.600 jalan):
  - Chromium headless tidak bisa hydrate halaman dev: Next 16 menolak socket HMR dari
    origin `web` → `allowedDevOrigins` + "web" (dev saja).
  - Frame terakhir animasi terpotong (2 frame × 500 ms = 0,53 s): Chrome mengabaikan
    `requestFrame` pada canvas yang tidak berubah → satu pixel ditulis ulang dulu. Kini
    3 × 500 ms = 1,45 s (frame di 0 / 0,53 / 1,03 / 1,45 s).
  - FONT: caption memakai font sistem, dan Chromium Alpine hampir tak punya font — file
    server akan beda tipografi dari preview. Kini web font self-hosted (Inter + Playfair
    Display via next/font) dan renderer menunggu font dimuat sebelum menggambar.
  - ERD (schema.dbml) tertinggal sejak 0006 — `captures` (0007) dan `next_fire_at` (0008)
    tidak pernah masuk. Diperbaiki bersama 0009.
  Hasil nyata: ZIP 2 PNG 800×500 valid (zipfile Python: testzip bersih), WebM VP9 800×500
  dengan traffic tergambar penuh, keduanya diunduh dari R2 lewat link bertanda tangan.

  TEMUAN REVIEW USER: nama file ZIP (dan nama PNG di dalamnya, juga unduhan PNG tunggal)
  diambil dari string ISO UTC, jadi tidak cocok dengan jam WIB di gambar — tujuh jam
  meleset, dan setelah 17:00 WIB memakai tanggal kemarin. Kini semua nama memakai WIB dan
  menyebut rentang waktunya: `YOG-2026-09-23_0600-1900.zip`, lintas hari
  `YOG-2026-09-22_1900_to_2026-09-23_0600.webm`. Diuji (termasuk kasus lewat 17:00 WIB).

  VERIFIKASI: 307 test API (18 export controller, 3 sweeper, 2 zip), tsc + eslint bersih
  di kedua paket, Swagger memuat 3 path export, semua route export 401 tanpa sesi.
  UI (dialog progres, chip, bagian Exports) BELUM dilihat di browser — host kekurangan
  memori untuk browser uji di sisi host; pipeline server-nya yang diuji end-to-end.

[2026-09-28c] Halaman detail zona dirapikan (FE-22). Branch `feat/zone-page-polish`, PR
  bertumpuk di atas #41 (base `feat/async-export`, pindah ke develop otomatis saat #41
  di-merge) — ZoneDetail.tsx juga diubah #41, jadi branch terpisah dari develop akan konflik.

  - URUTAN: Capture windows kini tepat di bawah Boundary/Zone details, lalu Captures,
    lalu Exports paling bawah. Keterangan "Capture times are set on the Schedule page"
    dihapus — bagian windows tepat di bawahnya kini membawa tombol Manage on Schedule.
  - PETA CAPTURES GELAP: MapCanvas punya `tone` ('dim' default, 'dark'). Filter "dark"
    lama menaruh brightness SEBELUM invert, jadi invert mencerahkannya lagi → abu-abu,
    bukan gelap (bug urutan yang sama yang pernah terjadi di renderer). `maceut-map-night`
    memakai rantai tema Dark Studio: invert dulu, baru diredupkan.
  - HEADER TABEL TIDAK SEJAJAR: di kolom rata kanan (Roads, Avg jam), slot panah sort
    12px ada SETELAH label, jadi label berhenti ~16px sebelum angka di bawahnya. Kini
    slotnya di depan label pada kolom rata kanan. Berlaku untuk semua tabel aplikasi.
  - PAGINATION baru (semua tabel): "Showing 1–10 of 34 captures" dengan angka ditebalkan,
    tombol halaman bernomor (1 … 4 5 6 … 12) dengan halaman aktif ungu, panah prev/next.
  - BOUNDARY: paragraf peringatan diganti ikon bantuan di samping judul peta — deskripsi
    muncul saat hover/fokus (komponen baru `ui/HelpTip.tsx`, Base UI Tooltip).
  - KONSISTENSI: `SectionHeader` (judul + deskripsi satu baris + aksi kanan) dipakai
    Capture windows, Captures, Exports; `CardTitle` untuk judul kartu (Boundary, Zone
    details, This frame, Day summary, Congestion through the day). Tombol stepper
    captures kini 44px/rounded-md seperti Button; aksi baris Exports memakai ukuran `sm`
    (ukuran aksi baris); chip hari di tabel windows memakai token `text-primary`, bukan
    hex `#5A35F3` (aturan CLAUDE.md).

  VERIFIKASI: tsc + eslint bersih, /zones 200, tanpa error di log. Belum dilihat di browser.

[2026-09-28d] Company branding (F-11/F-12/F-13) DIHAPUS dari scope — keputusan user.

  Dihapus: spec `.claude/specs/branding/` (requirements + tasks), baris "Custom Branding"
  di tabel paket & bagian Branding di product.md, tabel `branding_configs` + endpoint
  `/branding` + relasi di tech.md, folder/route/service/repository branding di
  structure.md, daftar spec di CLAUDE.md, task & acceptance criteria logo di spec
  zone-management, baris "belum dibangun" di schema.dbml, `logoPath()` di r2-client (+
  test-nya). BR-018 tetap, TANPA logo: gambar capture wajib memuat nama zona + timestamp.
  Tidak ada tabel/migrasi yang perlu di-drop — `branding_configs` tidak pernah dibuat.

[2026-09-28e] Admin: pemakaian HERE & batas anggaran (ADM-01, ADR-025).

  SATU TITIK: semua panggilan HERE (capture worker, preview wizard, hitungan kelas jalan,
  statistik zona) kini lewat `meteredTrafficFlow` di `here-usage.service.ts`; tidak ada
  lagi pemanggil `getTrafficFlow` langsung. Setiap panggilan dicatat di `here_usage`
  (per hari WIB × sumber: requests, failed, refused — migrasi 0010).
  BATAS: staf mengatur batas harian dan/atau bulanan (+ harga per 1.000 request untuk
  estimasi biaya) di `/internal/here`, disimpan di `platform_settings` (bukan .env —
  harus bisa diubah tanpa restart; bukan secret, jadi tidak bertentangan dengan ADR-018).
  Saat tercapai: panggilan DITOLAK sebelum dikirim (tidak ditagih) dan dicatat `refused`;
  pelanggan hanya melihat "Data lalu lintas sedang tidak tersedia" (503
  TRAFFIC_UNAVAILABLE) — HERE/anggaran tidak pernah disebut di sisi pelanggan.
  HALAMAN ADMIN: pemakaian hari ini & bulan ini dengan bar persen batas, estimasi biaya,
  jumlah ditolak, grafik 30 hari bertumpuk per sumber dengan garis batas harian, form
  batas. Peringatan di 80%, status "blocked" di 100%.

  DIUJI LANGSUNG: batas harian 1 → capture pertama sukses (9.645 jalan) & tercatat,
  capture kedua ditolak tanpa memanggil HERE, gagal dengan pesan generik, `refused` 1,
  ringkasan admin "blocked". Batas dikosongkan lagi setelahnya.
  Catatan: pengujian pertama controller menunjukkan "user biasa" dapat 200 — ternyata
  email uji `ops@maceut.id` ada di INTERNAL_EMAILS (jadi memang staf); tes diperbaiki
  memakai email pelanggan. Aplikasinya benar.

  VERIFIKASI: 324 test API (10 service, 6 controller baru), tsc + eslint bersih kedua paket,
  /internal/here 200. Halaman admin belum dilihat di browser.

[2026-09-28f] Backlog admin: config read-only, role lock dari server, akun uji dibersihkan.

  BE-12: halaman /internal/config dulunya PROTOTIPE — "config" disimpan di localStorage
  browser, dengan kolom edit dan dialog "rotate secret" yang tidak mengubah apa pun di
  server mana pun. Kini cermin read-only dari env server yang sedang berjalan lewat
  `GET /internal/config` (config.service.ts, 41 key). Secret (JWT_SECRET, HERE_API_KEY,
  R2 keys, DB_PASSWORD) TIDAK pernah dikirim, hanya set/belum; password di DATABASE_URL
  & RABBITMQ_URL disamarkan (`****` — ASCII, karena `URL` meng-encode karakter bullet).
  Diuji dengan env sungguhan: 36 key terisi, nol secret bocor. `config-api.ts` (mock
  localStorage) dihapus; catalog kini hanya label/bantuan, nilainya dari API.

  roleLockedByConfig: API kini mengirim flag per user dan jumlah `internalByConfig` di
  stats. Web tidak lagi membawa salinan daftar staf di `NEXT_PUBLIC_INTERNAL_EMAILS`
  (ikut ter-bundle ke setiap browser dan bisa berbeda dari daftar server) —
  `features/auth/internal-access.ts` dihapus, env-nya dihapus dari web/.env.example.
  Boleh dihapus dari web/.env.local.

  BE-17: 17 akun uji KOSONG (tanpa zona/capture/export) dihapus lewat jalur hapus aplikasi
  sendiri (`userService.deleteUser`), bukan SQL mentah. 8 yang punya data dipertahankan
  atas keputusan user — sched@ (zona YOG, 154 capture), tbl@ (13 zona), pw@, herecheck@,
  studioverify×3, layoutverify@.

  VERIFIKASI: 331 test API, tsc + eslint bersih kedua paket.

[2026-09-28g] Notifikasi downgrade (ADR-020).

  SEBELUMNYA: pelanggan menurunkan paket di Profil TANPA pratinjau — langsung diterapkan
  di balik peringatan generik. Staf di /internal/users melihat dialog yang MENEBAK di
  browser dari jumlah zona/jendela, tanpa bisa melihat interval atau anggaran frame
  harian. Dan setelahnya, zona yang di-pause oleh paket tampak persis seperti yang
  di-pause pengguna — zona yang "mati sendiri".

  SEKARANG:
  - `paused_by_plan` di zones & schedules (migrasi 0011). Di-set HANYA oleh
    `applyPlanChange`; perubahan status lain apa pun (pause/resume manual) menghapusnya —
    dijaga di `update()` repository, jadi tidak ada pemanggil yang bisa lupa. Baris
    lama default false: siapa yang mem-pause dulu tidak pernah tercatat, dan menebaknya
    sekarang tidak jujur.
  - Dialog `PlanChangeDialog` (bersama): daftar zona & jendela yang AKAN di-pause beserta
    alasannya, dari `previewPlanChange` server — fungsi yang sama dengan perubahannya,
    jadi konfirmasi dan hasil tidak bisa berbeda. Dipakai di Profil (GET /plan/impact) dan
    /internal/users (endpoint staf baru GET /internal/users/:id/plan-impact).
  - Tanda "Paused · plan limit" (kuning) di pill zona & chip jendela; banner
    `PlanPausedNotice` di Dashboard, Zones, Schedule: berapa & apa yang di-pause, bahwa
    tidak ada yang dihapus, dan cara melanjutkannya.

  DIUJI LANGSUNG (akun uji sekali pakai, dihapus setelahnya): pratinjau ke Free menyebut
  "Probe new (over_zone_limit)" → setelah downgrade persis zona itu yang di-pause
  [by plan]; resume manual → flag hilang; pause oleh user → bukan "by plan".
  VERIFIKASI: 333 test API, tsc + eslint bersih kedua paket. UI belum dilihat di browser.

[2026-09-28h] CAP-02 — gambar PNG otomatis per capture · FE-01 — penjelasan 0 ruas.

  CAP-02: capture worker, setelah `complete`, mem-publish job ke antrean baru `render-jobs`
  (RABBITMQ_QUEUE_RENDER). `render.worker.ts` merender PNG lewat halaman `/render/export`
  yang sama dengan export Studio (format baru `png` = satu frame), upload ke
  `captures/{user}/{YYYY}/{MM}/{id}.png`, isi `file_path`, `file_size`, `style_used`.
  Keputusan:
  - ANTREAN TERPISAH, bukan di dalam capture worker: capture jalan 4 sekaligus; empat
    Chromium bersamaan = OOM di host ini. Render prefetch 1, SATU browser bersama yang
    ditutup 60 detik setelah gambar terakhir.
  - Gagal render ≠ capture gagal: capture tetap `done` tanpa gambar (di-log, di-ack, tidak
    di-retry) — peta tetap menggambar ulang dari traffic yang tersimpan.
  - Gaya default: tema Dark, kongesti standar, vignette, legenda WAJIB (BR-019), nama zona +
    jam WIB (BR-018), ukuran PLAYWRIGHT_SCREENSHOT_WIDTH×HEIGHT (1280×720).
  - `lib/render-page.ts`: launch + page driver dipindah dari export.worker, dipakai bersama.
  - GET /captures/:id/image → signed URL 5 menit, nama `{ZONA}-{YYYY-MM-DD}_{HHMM}.png` (WIB).
    Tombol "Download image" di halaman zona, hanya bila capture punya gambar.
  - Capture lama tidak di-backfill (tidak diminta; bisa dengan publish job per id).
  FE-01: RoadClassPicker menulis "No roads of this class in this area" dan, bila kelas yang
    dipilih kosong, catatan kuning: kenapa (wajar untuk zona kecil di pusat kota), akibatnya
    (capture kosong), dan kelas lebih luas mana yang punya ruas di sini (+ paketnya).
  DIUJI LANGSUNG: job render untuk capture YOG yang ada → PNG 1,07 MB di R2, baris terisi
    (themeId dark); unduh via service → 200, `attachment; filename="YOG-2026-09-28_1445.png"`,
    gambar dicek visual. Export ZIP/WebM belum di-e2e ulang setelah refactor (tsc + test hijau).
  VERIFIKASI: 344 test API, tsc + eslint bersih kedua paket.

[2026-09-28i] AUTH-OTP — abstraksi provider email + kode OTP (ADR-026).

  PERMINTAAN: provider email yang bisa diganti gampang (Mailtrap atau Resend), dipakai
  untuk verifikasi email dan OTP. Dipilih user: verifikasi saat daftar + lupa password;
  akun yang belum verifikasi DIBLOKIR; default dev = console.

  - `api/src/lib/email/`: interface `EmailProvider.send(EmailMessage)` + adapter
    console / resend / mailtrap (fetch biasa, tanpa SDK baru). Mailtrap: isi
    MAILTRAP_INBOX_ID → sandbox inbox, kosong → kirim sungguhan. Ganti provider =
    EMAIL_PROVIDER + kredensialnya saja.
  - Validasi config: provider tanpa kredensial → gagal start; console di production → ditolak.
  - `services/email.service.ts`: template email kode (html + text), `sendOtpEmail` tidak
    melempar error (Better Auth menjawab sama untuk alamat ada/tidak ada).
  - Better Auth: `requireEmailVerification`, plugin `emailOTP` (6 digit, 10 menit,
    5 percobaan, disimpan ter-hash), `sendOnSignIn`, `autoSignInAfterVerification`.
  - Migrasi 0012: semua user lama ditandai `email_verified = true` (11 akun di dev).
    Tanpa perubahan schema → DBML tidak berubah.
  - Web: `/verify-email` (OtpInput dari Base UI OTP Field, auto-submit saat terisi,
    kirim ulang dengan jeda 30 detik), `/forgot-password` (email → kode + password baru →
    login dengan pesan sukses). Register → layar kode; login akun belum verifikasi →
    layar kode (kode baru sudah terkirim). Link "Forgot password?" sekarang hidup.
  - Konfigurasi baru tampil di /internal/config (RESEND_API_KEY & MAILTRAP_API_TOKEN secret).

  DIUJI LANGSUNG (akun uji sekali pakai, dihapus): sign-up → token null + kode di log;
    login belum verifikasi → 403 EMAIL_NOT_VERIFIED + kode baru; kode lama → INVALID_OTP;
    kode benar → sesi + /me 200; kode yang sama lagi → ditolak; lupa password → kode,
    reset → password baru 200, lama 401; alamat tak dikenal → jawaban sama.
  BELUM DIUJI: kirim sungguhan via Resend/Mailtrap (belum ada key) — adapter diuji dengan
    fetch palsu terhadap bentuk request dokumentasi masing-masing. UI belum dilihat di browser.
  VERIFIKASI: 362 test API, tsc + eslint bersih kedua paket.

[2026-09-28j] NOTIF — notifikasi berjalan, email hemat (ADR-027).

  SEBELUMNYA: bell berisi 3 contoh hardcode (localStorage), toggle email di Profil tidak
  menyimpan apa pun dan halaman sendiri bilang email "tidak dikirim di MVP".

  KEPUTUSAN USER: user-centric + tekan biaya email. HERE alert → satu alamat khusus;
  export selesai → in-app saja; ringkasan mingguan → nanti. Default yang dipakai (user
  bilang "start now" tanpa menjawab): alamat alert di halaman HERE, jeda 2 jam, batas
  OTP ikut di task ini.

  API:
  - Migrasi 0013: `notifications` (dedupe_key unik per user, email_status/due/attempts),
    `notification_preferences` (satu kolom), `email_log` (meteran biaya, batas OTP,
    dedupe alert). DBML ikut di commit yang sama.
  - `notification.service`: onCaptureFailed/Done (hanya saat MULAI/SELESAI rentetan gagal,
    capture terjadwal saja), onCapturesMissed (satu per user per outage, dikumpulkan di
    tick scheduler), onLimitReached, onCaptureQueued (80%), onExportFinished,
    onPlanChanged (email hanya bila oleh staf), onHereBudget (bell semua staf + satu email
    ke alamat alert; memo per proses karena dipanggil tiap request HERE).
  - Sweeper 10 menit (proses API): email yang jatuh tempo — lewati bila sudah dibaca di
    app / zona pulih / toggle mati / sudah dikirim hari ini (WIB); sisanya SATU email
    berisi semua zona yang masih gagal. Retensi bell 90 hari.
  - Endpoint: GET /notifications, POST /notifications/:id/read, POST /notifications/read-all,
    GET/PATCH /me/notification-preferences. PUT /internal/here-usage menerima `alertEmail`.
  - OTP: maks. 3 kode/10 menit & 10/hari per alamat (lewat batas: `suppressed`, respons
    tetap 200); resendStrategy `reuse` + storeOTP `encrypted`.
  Web: NotificationBell (header pelanggan & staf) — polling 60 dt + saat tab aktif lagi,
    pengelompokan "3 zones stopped collecting", badge "(n)" di judul tab, toast untuk export
    & zona pulih (Base UI Toast); banner "gagal sejak …" di halaman zona; Profil →
    Notifications jadi satu toggle nyata + daftar yang selalu in-app; staf: penjelasan +
    link ke halaman HERE; field "Alert email" di /internal/here.

  DIUJI LANGSUNG (akun uji lewat sign-up + OTP sungguhan, dihapus setelahnya):
    OTP: 3 terkirim, ke-4 `suppressed`, API tetap 200; kirim ulang memakai kode yang sama.
    Skenario DB nyata: dua zona gagal → 2 notifikasi, gagal kedua di zona yang sama diam;
    sweep → SATU email berisi 2 zona; sweep lagi → tidak ada; zona pulih → "collecting
    again"; kegagalan baru dibaca di app → email dilewati (read_in_app); perubahan paket
    oleh staf → email. HTTP: list/read/read-all/prefs dengan cookie sesi asli, 401 tanpa.
    HERE alert: 1 email ke alamat alert, dicatat SEKALI di email_log.
    Bug ditemukan & diperbaiki: email menulis "gagal sejak" = waktu baris dibuat, bukan
    waktu capture gagal (sekarang `data.failedAt`).
  BELUM: UI belum dilihat di browser; email sungguhan via Resend/Mailtrap.

[2026-09-29] FE-23 — halaman zona: konsisten, berwarna, tombol brand, peta gelap.

  - Tombol: varian baru `ink` (hitam brand) & `tint` (ungu lembut), semua dengan ikon.
    Header: Capture now (ungu, pindah dari seksi Captures, konfirmasi lewat toast NOTIF)
    · Open in Studio (ink, `/studio?zone=<id>` — Studio kini memilih zona dari URL)
    · Edit / Pause·Resume (tint) · Delete (destructive).
  - `StatusPill` (satu bentuk + titik warna) untuk status zona, jendela, capture, export.
  - `Stat` (ikon dalam chip ungu + label kecil + nilai tebal) untuk Zone details dan angka
    di bawah peta capture; Avg jam factor diberi titik warna pita kemacetan.
  - Judul seksi/kartu diberi chip ikon brand (SectionHeader/CardTitle `icon`).
  - Kosakata tunggal: Scheduled/Manual (bukan "Auto"), Avg jam factor, Roads.
  - Tabel (atas permintaan user): kolom waktu "… (WIB)", urutan identitas → waktu →
    detail → angka (rata kanan) → Status → Actions; satu format waktu `formatWibShort`
    ("23 Sep 10:27") untuk ketiga tabel (sebelumnya "23 Sep 10.27" vs "23 Sept, 10:27").
  - Peta Captures: filter `.maceut-map-night` lebih gelap, nama tempat tetap terbaca
    (dicek sekali lewat screenshot tile OSM). Peta Boundary tidak berubah.
  VERIFIKASI: tsc + eslint web bersih, halaman 200. UI belum dilihat di browser.

[2026-09-29b] FE-24 — label konsisten di semua tabel, Zone details baru, ikon Lucide.

  - Satu bentuk label: `StatusPill` (pill + titik). Kategori memakai biru/ungu/abu SAJA —
    hijau/kuning/merah khusus status, supaya label tidak terbaca sebagai status:
    RoadClassBadge (Nasional abu · Nasional + Provinsi biru · All roads ungu), PlanPill
    (Free abu · Standard biru · Premium ungu), RolePill (Customer abu · Internal ungu).
    Dipakai di daftar zona, admin (overview, config, HERE), jadwal, dashboard.
    "User" → "Customer" di pemilih peran admin (sama dengan Profil).
  - Zone details: kelas jalan sebagai pill, tiga tile angka (Area · Roads · Length,
    angka berformat 11,652), baris Capture cadence (atau link "set a window") & Created.
  - Ikon dari Lucide (ISC, dicatat di icons.tsx): map (Boundary), clipboard-list (Zone
    details), route (Road class), car-front (Avg jam factor), zap (Trigger).
  - Paginasi: kontrol selalu tampil (satu halaman = ‹ 1 › nonaktif) — daftar zona dulu
    tidak menampilkannya karena ≤10 zona.
  - `formatDate` jadi "23 Sep 2026" (en, dengan tahun) di seluruh aplikasi; sebelumnya
    id-ID tanpa tahun ("5 Agu", "12 Mei" di UI berbahasa Inggris).
  VERIFIKASI: tsc + eslint web bersih, halaman 200. UI belum dilihat di browser.

[2026-09-29c] FE-25 — dashboard dengan data nyata, copy baru, thumbnail kecil.

  - `/usage`: `exportsThisMonth` (export selesai sejak awal bulan WIB), `storageUsedBytes`
    (gambar capture + file export yang masih di R2), health: `zonesFailing` (capture
    terjadwal terakhir gagal — aturan sama dengan notifikasi & banner zona),
    `problemsToday` {failed, missed}, puncak hari ini (`peakIndex` jam factor, jam WIB,
    zona). `rendersThisMonth`/`missedCaptures` dihapus. Status "degraded" kini hanya bila
    ada zona gagal atau yang di-pause OLEH PAKET — zona yang di-pause user sendiri bukan
    masalah.
  - `GET /exports?limit=` — export terbaru lintas zona (kartu Recent exports); export kini
    membawa `zoneName`.
  - Thumbnail: render worker membuat JPEG 320 px dari kanvas yang sama (~9 KB vs ~1 MB),
    `…/{id}.thumb.jpg` (diturunkan dari path gambar, tanpa kolom baru). `/captures`
    mengembalikan `thumbnailUrl` (signed 30 menit). Capture lama tanpa thumbnail → 404 →
    tile biasa.
  - Web: sapaan menurut jam WIB + satu kalimat status, tombol Open Studio, tile metrik dengan
    catatan jelas, kartu Collection health & Recent exports nyata, strip capture bergambar
    dengan titik warna jam factor. `formatFileSize` kini sampai GB.
  DIUJI LANGSUNG: render ulang capture terbaru → thumbnail 9.298 B, diunduh lewat link
    signed (200 image/jpeg) & dicek visual; capture lama → 404 (fallback). /usage nyata:
    44 capture hari ini, 4 export bulan ini, 61,6 MB, puncak 2,6 pukul 16:45 di YOG.
  VERIFIKASI: 409 test API, tsc + eslint bersih kedua paket. UI belum dilihat di browser.

[2026-09-29d] FE-26 — pill tanpa titik, tandai-dibaca, error ramah, Next collection nyata.

  - `StatusPill` tanpa titik (warna sudah dibawa tint-nya; titik di setiap label memenuhi
    tabel & tidak rata di sel sempit). Status yang sedang berjalan berdenyut pelan.
  - Bell: tombol centang per notifikasi belum dibaca → tandai dibaca tanpa pindah halaman;
    yang sudah dibaca menampilkan centang abu.
  - Error teknis tidak lagi sampai ke user: `user-facing-errors.ts` menerjemahkan error
    export ("page.evaluate: Target crashed" → "The render ran out of memory partway
    through…") dan capture (limit, missed, HERE mati) ke bahasa Inggris yang jelas. Error
    mentah tetap di database untuk debugging.
  - Jadwal: kartu "Next collection" (dulu hardcode "10:00 · in 21 minutes") kini dari
    `nextFireAt` tiap jendela — kolom yang dipakai scheduler sendiri — dengan hitung mundur
    30 detik, zona & jumlah jendela yang menembak bersamaan, dan jadwal berikutnya.
    `capturedFrames` (dulu selalu 0) kini hitungan capture selesai per jendela.
  DIUJI LANGSUNG: jendela NOON → next 2026-09-29T23:00Z (06:00 WIB), 194 frame terkumpul;
    export gagal → pesan ramah.
  VERIFIKASI: 421 test API, tsc + eslint bersih kedua paket. UI belum dilihat di browser.

[2026-09-30] FE-27 — warna kelas jalan, kolom jadwal terpisah, gagal export = aksi.

  - Kelas jalan tanpa abu: Nasional teal · Nasional + Provinsi biru · All roads ungu.
    Token baru `teal-bg`/`teal-text` (tailwind.config.ts + design.md, bagian "Category").
  - Daftar zona: "Capture cadence" dipecah jadi **Interval** (Every 15 min / Hourly /
    Daily) dan **Hours (WIB)** ("06:00–17:00", atau "N windows" bila lebih dari satu —
    satu rentang akan menyiratkan koleksi terus-menerus). API: `schedule` {interval,
    start, end, windows} di samping `cadence`.
  - Gagal export: pesan tidak lagi menyebut sebab ("out of memory" pun teknis bagi user) —
    "This export couldn’t be finished. Retry to render it again." Sebab tetap di log
    worker/sweeper dan kolom `error`. Tombol "Retry export" kini tombol utama di tabel
    Exports, dan dialog Studio untuk export gagal punya tombol Retry (dulu hanya Close).
  - Halaman zona: deskripsi di bawah judul seksi dihapus; peta Captures 26rem/32rem.
  - Jadwal: kartu Next collection baru — chip ikon, pill hitung mundur, jam besar,
    hari/tanggal, daftar jendela yang menembak (zona · label · interval), "After that".
  VERIFIKASI: 423 test API, tsc + eslint bersih kedua paket, halaman 200. UI belum dilihat
    di browser.

[2026-10-01] FE-28 — header sejajar, health ringkas, notifikasi brand & singkat.

  - `page-width.ts`: satu aturan lebar untuk header DAN halaman (Studio 1600, lainnya
    1180). Dulu header selalu 1180 sementara Studio 1600 → tidak sejajar di layar besar.
  - Collection health: satu baris per metrik dengan ikon brand, tanpa catatan kecil di
    bawah tiap nilai (detail pindah ke tooltip); nilai nol yang baik berwarna hijau, masalah
    kuning. "Peak today" menampilkan nilai + jam.
  - Recent exports: "ZIP · 28 frames" (dulu "Frames · ZIP · 28 frames").
  - Notifikasi: tanpa panah, tanpa biru (aksi, "Mark all read", ikon info, link toast →
    ungu brand); tombol tandai-dibaca pindah ke baris meta (kanan bawah), ikon Lucide
    check-check, hanya pada yang belum dibaca. Copy dipersingkat — apa yang terjadi + apa
    yang dilakukan ("We’re retrying — no action needed.", "Retry it from the zone page.").
    Notifikasi lama di DB tetap dengan teks lamanya.
  - Judul seksi tanpa deskripsi kini rata tengah dengan chip ikonnya.
  - Tombol "Retry export" → "Retry".
  VERIFIKASI: 423 test API, tsc + eslint bersih kedua paket, halaman 200. UI belum dilihat
    di browser.

[2026-10-05] FE-29 — halaman lebar, profil & billing dirapikan, header, link brand.

  - `PAGE_WIDTH` = 1600px untuk SEMUA halaman & header (app, staf, publik, onboarding);
    Studio jadi acuan. Jarak nav header gap-xl.
  - Profil:
    · Account: baris "Platform role" dihapus; kartu staf → "Staff tools".
    · Usage → kartu Current plan: tombol "Change plan" → popup pilihan paket (PlanCards);
      turun paket → popup peringatan (PlanChangeDialog) seperti sebelumnya. Teks "renews
      1 Oct" (karangan — belum ada billing) dihapus.
    · Popup peringatan: tanpa paragraf penjelasan — daftar yang akan di-pause + "Nothing is
      deleted."
    · Billing: kini info pembayaran saja — Billing history (tabel, kosong "No invoices
      yet"), Plan & harga, Payment method ("No card on file"), Billing contact. Tidak ada
      data karangan.
    · Notifications: satu toggle "Email me if a zone stops collecting · At most once a day."
  - Header: dropdown akun menampilkan pill "Premium" (bukan "Premium plan"). Tandai-dibaca:
    tombol 32px selalu tampil di yang belum dibaca; gagal di server → kembali belum dibaca
    + toast; setelahnya daftar disegarkan supaya badge cocok dengan server. Mark all read
    juga dikembalikan bila gagal.
  - Dashboard: link seksi pakai `linkClass()` (ungu, semibold) — "See all", "Open Studio",
    "3 more".
  VERIFIKASI: 423 test API, tsc + eslint bersih, 7 halaman 200. UI belum dilihat di browser.

[2026-10-05b] EXP-A1 — export di-stream, lanjut setelah crash, satu browser per worker (ADR-028).

  - `lib/zip-stream.ts`: ZIP ditulis selagi frame datang (STORE, ZIP64 otomatis > 4 GB /
    > 65.535 entri). Output kecil identik byte-per-byte dengan `buildZip` lama.
  - `MultipartUpload` (r2-client): unggah ke R2 per part 16 MiB berukuran SAMA (syarat R2),
    `abort()` aman di jalur gagal. Memori ≈ 1 part + 1 frame, berapa pun jumlah frame (#63).
  - Worker: frame PNG di-stream (`bridge.png`) → ZIP → R2; bila Chromium crash, browser
    baru melanjutkan dari frame berikutnya (`startFrame`, maks 2×). Batal / gagal → upload
    dibatalkan. `markUploading`/`complete` kini dijaga status → export yang dibatalkan tidak
    pernah jadi "done" (#58).
  - `lib/browser-slot.ts`: satu Chromium per proses worker — gambar capture menunggu saat
    export berjalan, browser idle-nya ditutup dulu (#67).
  - Step 0: log ringkasan per export — waktu per frame (data, draw, encode, write), RSS puncak
    Chromium & worker, jumlah restart.
  - Migrasi 0014: `exports.upload_id`, `exports.file_size` → bigint (ZIP > 2,1 GB). Sweeper
    membatalkan upload milik export yang macet. DBML ikut.
  - Halaman render: `startFrame`, statistik draw/encode per frame.
  - Tes: zip-stream (termasuk ZIP64 dibaca balik oleh Python zipfile), multipart (part sama
    besar), browser-slot (tak pernah dua sekaligus), export.worker (stream, resume setelah
    crash, menyerah setelah 2×, error non-crash tidak diulang, batal, #58), sweeper.
  BELUM: export sungguhan tidak dijalankan sendiri (CLAUDE.md: Studio = dry run) — daftar uji
    diserahkan ke user. Aturan lifecycle R2 perlu dipasang di dashboard (deployment.md).
  VERIFIKASI: 445 test API, tsc + eslint bersih kedua paket, worker boot normal.

[2026-10-05c] EXP-A2 — proses browser ringan, data slim tersimpan, pakai ulang frame (ADR-029).

  - Chromium: --disable-gpu, --renderer-process-limit=1, --disable-extensions, --mute-audio,
    --js-flags=--expose-gc; halaman memanggil gc() setelah tiap frame dikirim.
  - `captures.traffic_slim` (migrasi 0015): ditulis saat capture; capture lama diisi saat
    pertama dibaca (`slimFor`). Export, playback Studio & gambar capture membaca versi slim
    lewat `findLiteById/findLiteByIds` — kolom traffic 2 MB tidak disentuh lagi.
  - Pakai ulang frame: rencana per frame → `image` (gambar capture, gaya & ukuran sama,
    `renderVersion` cocok) · `cache` (frame dari export sebelumnya) · `render`. Browser hanya
    menggambar rentang yang perlu (`endFrame`), dan tidak diluncurkan sama sekali bila semua
    frame dipakai ulang. Frame yang digambar disimpan ke `render_cache` (R2 `render-cache/`,
    7 hari, ikut storage akun; sweeper membersihkan). File cache hilang → frame digambar.
  - Gambar capture kini menyimpan `renderVersion` di `style_used`.
  - `frameFileName` = penamaan halaman render persis (diuji termasuk tengah malam WIB).
  - Tes: worker (gambar capture dipakai, cache dibaca & ditulis, tanpa browser bila semua
    dipakai ulang, cache hilang → render), nama frame, sweeper, usage, render worker.
  VERIFIKASI: 450 test API, tsc + eslint bersih kedua paket.

[2026-10-05d] EXP-B — video lewat ffmpeg, plus MP4 (ADR-030).

  - Image worker/api: `apk add ffmpeg` (layer setelah npm install). ffmpeg 8.0.1 dengan
    libvpx-vp9 & libx264 terverifikasi di kedua container.
  - `lib/video-encoder.ts`: PNG → stdin ffmpeg (backpressure), frame rate = 1000/holdMs,
    pad ke dimensi genap, WebM VP9 CRF 32 / MP4 H.264 stillimage CRF 20 + faststart.
  - Worker: satu `produceFrames` untuk semua format (pakai ulang, cache, lanjut setelah
    crash); video → file di `EXPORT_TMP_DIR/{id}/` (cek ruang disk) → upload multipart →
    folder dihapus. Folder sisa worker mati dibersihkan saat start. Browser ditutup begitu
    frame terakhir selesai, sebelum upload.
  - Format `mp4` (migrasi 0016, schema, validasi, nama file). Studio: opsi "Animation · MP4"
    (main di HP, slide, aplikasi chat). Label format di Studio, zona, dashboard.
  - Jalur MediaRecorder dihapus: cabang webm di halaman render, `recordAnimation`,
    `__exportChunk`, output `video` di driver.
  - Config: FFMPEG_PATH, EXPORT_TMP_DIR (+ .env.example, halaman config staf).
  - Tes: encoder dengan ffmpeg SUNGGUHAN (VP9 & H.264: 3 frame, 1,5 dtk, pad genap, gagal
    dilaporkan bukan menggantung), worker video (webm & mp4, lanjut setelah crash, batal →
    ffmpeg dihentikan & folder dihapus).
  VERIFIKASI: 459 test API, tsc + eslint bersih kedua paket, worker boot dengan kode baru.

[2026-10-05e] EXP-C — anggaran export, antrean kerja-terkecil, WebP (ADR-031).

  - `exportBudgetMpFrames` per paket (120 / 500 / 2.900) di samping batas frame; error
    EXPORT_BUDGET_EXCEEDED menyebut maksimal frame pada ukuran itu. Berlaku juga di retry.
    `createExport` kini memakai `findLiteById` (tidak memuat 2 × 2 MB traffic).
  - Antrean: `pickNextQueued` (kerja ÷ (1 + menit menunggu/10)); `chooseNext` menjalankan yang
    termurah dan menerbitkan ulang pesan yang diterima. Diuji di DB nyata: kecil-baru → besar
    yang menunggu 2 jam → besar-baru. Export yang sedang berjalan tidak dijeda (alasan di ADR-031).
  - WebP q90 untuk ZIP (`spec.imageFormat`): nama & cache .webp, tak pernah memakai gambar
    capture PNG; video selalu PNG.
  - Studio: tiap opsi export menampilkan % anggaran atau alasan dinonaktifkan; sakelar
    "Smaller ZIP (WebP)"; pesan error anggaran dalam bahasa Inggris.
  VERIFIKASI: 465 test API, tsc + eslint bersih kedua paket.

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
