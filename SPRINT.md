# SPRINT.md — Active Sprint

> Baca file ini di SETIAP sesi kerja sebelum mulai apapun.
> Update saat ada task selesai, dimulai, atau keputusan baru dibuat.

---

## Development Flow (WAJIB)

```
1. Pilih task → tandai 🟡 In Progress di tabel bawah
2. Kerjakan: route → controller → service → repository → unit test → swagger annotation
3. Jalankan: cd api && pnpm test (semua harus pass)
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
| 🔴 | Setup api/: init TypeScript + Express + package.json + tsconfig.json | structure.md |
| 🔴 | Setup api/: Dockerfile.dev + Dockerfile | deployment.md |
| 🔴 | Setup api/.env dari .env.example | api/.env.example |
| ✅ | Setup web/: Next.js + Tailwind (token dari design.md) + Base UI | design.md |
| 🔴 | Setup web/: Dockerfile.dev + Dockerfile | deployment.md |
| ✅ | Setup web/.env.local dari .env.example | web/.env.example |
| 🔴 | Jalankan `docker compose up` — pastikan semua service start | deployment.md |
| 🔴 | Setup Drizzle: drizzle.config.ts + schema.ts dasar (users, user_plans) | zone-management/tasks.md Phase 1 |
| 🔴 | Setup PostGIS extension + generate & jalankan migration awal | zone-management/tasks.md Phase 1 |
| 🔴 | Setup Swagger: swagger-jsdoc + swagger-ui-express di /api-docs | auth/tasks.md Phase 2 |
| 🔴 | Migration: zones, branding_configs, captures | zone-management/tasks.md Phase 1, 3 |
| 🔴 | Auth: POST /auth/register + unit test + swagger | auth/tasks.md Phase 2 |
| 🔴 | Auth: POST /auth/login + POST /auth/logout + unit test | auth/tasks.md Phase 2 |
| 🔴 | Middleware: auth (JWT cookie) + plan-check + error-handler | auth/tasks.md Phase 2 |
| 🔴 | API: GET /zones + POST /zones (Drizzle + PostGIS raw) + unit test + swagger | zone-management/tasks.md Phase 2 |
| 🔴 | API: DELETE /zones/:id + unit test + swagger | zone-management/tasks.md Phase 2 |
| 🔴 | Lib: RabbitMQ client + R2 client + Playwright client | zone-management/tasks.md Phase 3 |
| 🔴 | API: POST /captures/manual + GET /captures/:id + unit test + swagger | zone-management/tasks.md Phase 3 |
| 🔴 | Worker: capture.worker.ts (consume → road class filter → screenshot → upload) | zone-management/tasks.md Phase 3 |
| ✅ | Frontend: tailwind.config.ts dengan token dari design.md | design.md |
| 🟡 | Frontend: Login + Register pages | auth/tasks.md Phase 3 |
| 🟡 | Frontend: Dashboard page (zone count, schedule count, CTA) | zone-management/tasks.md Phase 4 |
| 🟡 | Frontend: Zone List Page + road class badge | zone-management/tasks.md Phase 4 |
| 🟡 | Frontend: ZoneCreateStepper shell + progress indicator | zone-management/tasks.md Phase 4 |
| 🟡 | Frontend: Step 1 — Pilih Area (Map Editor HERE Maps) | zone-management/tasks.md Phase 4 |
| 🟡 | Frontend: Step 2 — Pilih Road Class + UpgradeModal | zone-management/tasks.md Phase 4, subscription/tasks.md |
| 🔴 | Backend: HERE Traffic client + GET /traffic/preview | zone-management/tasks.md Phase 3 |
| 🟡 | Frontend: MapCanvas (Leaflet + OSM) + TrafficPreviewPanel + StyleSelector | zone-management/tasks.md Phase 4 |
| 🔴 | Backend: internal render page (Playwright target) + update playwright-client.ts | zone-management/tasks.md Phase 3 |
| 🟡 | Frontend: Step 3 — Review & Konfirmasi | zone-management/tasks.md Phase 4 |
| 🟡 | Frontend: Manual Capture Button + StyleSelector modal + polling status | zone-management/tasks.md Phase 4 |

Status: 🔴 Not started · 🟡 In progress · ✅ Done

---

## NOT This Sprint

Jangan implement meskipun ada di spec:
- Schedule management (create, pause, resume, delete) → Sprint 2
- Capture history page + filter → Sprint 2
- Subscription + payment flow → Sprint 3
- Branding config (logo upload) → Sprint 2
- Usage dashboard widget → Sprint 2
- Production docker-compose.prod.yml deploy nyata → setelah MVP stabil di lokal

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
