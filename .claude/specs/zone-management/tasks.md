# tasks.md — Zone Management & Manual Capture Implementation

> Update checklist ini saat mengerjakan task.
> Tambahkan catatan di bawah item jika ada keputusan teknis yang dibuat.

---

## Phase 0: Docker & Project Setup

- [ ] **Root:** buat `docker-compose.yml` dengan service postgres, rabbitmq, api, worker, web
- [ ] **Root:** buat `.env` dari `.env.example`
- [ ] **api/:** init project TypeScript + Express (`pnpm init`, `tsconfig.json`, `package.json`)
- [ ] **api/:** install dependencies inti: `express`, `drizzle-orm`, `pg`, `zod`, `amqplib`, `playwright`, `swagger-jsdoc`, `swagger-ui-express`
- [ ] **api/:** buat `Dockerfile.dev` dan `Dockerfile` (lihat `deployment.md`)
- [ ] **api/:** buat `.env` dari `.env.example`
- [ ] **api/:** setup `src/app.ts` (Express app + middleware dasar) dan `src/server.ts` (entry point listen)
- [ ] **api/:** setup `src/config/env.ts` — load + validasi env via zod
- [ ] Jalankan `docker compose up` → pastikan semua service start tanpa error

---

## Phase 1: Database & Schema (Drizzle)

- [ ] **Setup PostgreSQL + PostGIS extension**
  - [ ] `CREATE EXTENSION postgis;` (via migration pertama)
  - [ ] Verifikasi `ST_GeomFromGeoJSON` dan `ST_AsGeoJSON` available

- [ ] **Drizzle config** — `drizzle.config.ts` di root `api/`
  - [ ] Set `schema: './drizzle/schema.ts'`, `out: './drizzle/migrations'`, dialect `postgresql`

- [ ] **Schema: `users`** — `drizzle/schema.ts`
  - [ ] id (uuid, default random), email (unique), passwordHash, createdAt, updatedAt

- [ ] **Schema: `user_plans`** — `drizzle/schema.ts`
  - [ ] id, userId (FK unique), plan (pgEnum: free/standard/premium), startedAt, expiresAt, createdAt

- [ ] **Schema: `zones`** — `drizzle/schema.ts`
  - [ ] id, userId (FK NOT NULL), name, roadClass (pgEnum: `nasional` / `nasional_provinsi` / `semua`, NOT NULL, BR-020), createdAt, updatedAt
  - [ ] Kolom `geometry` **tidak** didefinisikan lewat Drizzle schema (tidak ada native type) — tambahkan via raw SQL migration setelah `drizzle-kit generate`:
    ```sql
    ALTER TABLE zones ADD COLUMN geometry geometry(Polygon, 4326) NOT NULL;
    CREATE INDEX zones_geometry_idx ON zones USING GIST (geometry);
    ```
  - [ ] UNIQUE constraint (userId, name) — via Drizzle `unique()` di schema

- [ ] **Schema: `branding_configs`** — `drizzle/schema.ts`
  - [ ] id, userId (FK unique), companyName, logoPath, createdAt, updatedAt

- [ ] Generate migration: `pnpm drizzle-kit generate`
- [ ] Jalankan migration: `pnpm drizzle-kit migrate` (di dalam container: `docker compose exec api pnpm drizzle-kit migrate`)

---

## Phase 2: Backend / API

> Setiap route wajib: Swagger JSDoc annotation + unit test di file `*.controller.test.ts`
> Jalankan `pnpm test` sebelum tandai selesai.

- [ ] **Types** — `src/types/zone.ts`
  - [ ] `Zone`, `RoadClass` (union type: `'nasional' | 'nasional_provinsi' | 'semua'`), `CreateZoneInput`, `UpdateZoneInput`
  - [ ] Zod schema `createZoneSchema` untuk validasi request body (termasuk `roadClass`)

- [ ] **Repository: zone.repository.ts** — `src/repositories/zone.repository.ts`
  - [ ] `create(userId, name, geojson, roadClass)` — `sql\`\`` template dengan ST_GeomFromGeoJSON (ADR-011)
  - [ ] `findById(id)` — `sql\`\`` template dengan ST_AsGeoJSON untuk geometry, include `roadClass`
  - [ ] `findByUserId(userId)` — Drizzle query builder biasa, include `roadClass`
  - [ ] `deleteById(id)` — Drizzle query builder biasa
  - [ ] `existsByNameAndUserId(userId, name)` — untuk cek BR-015

- [ ] **Service: zone.service.ts** — `src/services/zone.service.ts`
  - [ ] `createZone(userId, input)`:
    - [ ] Validasi nama duplikat (BR-015)
    - [ ] Validasi `roadClass` tidak melebihi batas plan user — panggil `planService.getMaxRoadClass(plan)`, bandingkan urutan `nasional < nasional_provinsi < semua` (BR-021)
    - [ ] Jika melebihi → throw `RoadClassNotAllowedError` (403 ROAD_CLASS_NOT_ALLOWED)
    - [ ] Panggil repo untuk insert
  - [ ] `getZonesForUser(userId)` — return semua zona milik user (termasuk `roadClass`)
  - [ ] `deleteZone(userId, zoneId)` — hanya bisa hapus zona milik user sendiri
  - [ ] `getEffectiveRoadClassFilter(zone, plan)` — return HERE FC classes = MIN(zone.roadClass, plan max) (BR-022)
    - `nasional`: `['FC1','FC2']`
    - `nasional_provinsi`: `['FC1','FC2','FC3']`
    - `semua`: `['FC1','FC2','FC3','FC4','FC5']`

- [ ] **Controller: zone.controller.ts** — `src/controllers/zone.controller.ts`
  - [ ] `create` — parse body via zod, panggil service, return 201; tangkap `RoadClassNotAllowedError` → 403
  - [ ] `list` — return semua zona user, 200
  - [ ] `remove` — delete zona, 200

- [ ] **Routes: zone.routes.ts** — `src/routes/zone.routes.ts`
  - [ ] `GET /zones` — list semua zona user
  - [ ] `POST /zones` — create zona baru (dipanggil di step 3 stepper — Review & Konfirmasi)
  - [ ] `DELETE /zones/:id`
  - [ ] Swagger JSDoc annotation lengkap per route
  - [ ] Daftarkan router di `src/routes/index.ts`

- [ ] **Unit Test: zone.controller.test.ts** — `src/controllers/zone.controller.test.ts`
  - [ ] `POST /zones` success → 201
  - [ ] `POST /zones` duplicate name → 422 ZONE_NAME_TAKEN
  - [ ] `POST /zones` roadClass melebihi plan → 403 ROAD_CLASS_NOT_ALLOWED
  - [ ] `POST /zones` unauthenticated → 401
  - [ ] `GET /zones` success → 200 + list (termasuk roadClass per zona)
  - [ ] `DELETE /zones/:id` success → 200
  - [ ] `DELETE /zones/:id` not own zone → 403

- [ ] **Middleware: auth.middleware.ts** — `src/middlewares/auth.middleware.ts`
  - [ ] Parse HttpOnly JWT dari cookie
  - [ ] Inject `req.userId`
  - [ ] Return 401 jika invalid

- [ ] **Middleware: plan-check.middleware.ts** — `src/middlewares/plan-check.middleware.ts`
  - [ ] Load user plan dari DB
  - [ ] Inject `req.plan`

- [ ] **Middleware: error-handler.middleware.ts** — `src/middlewares/error-handler.middleware.ts`
  - [ ] Central error formatter → `{ success: false, error: { code, message } }`
  - [ ] Didaftarkan sebagai middleware terakhir di `app.ts`

---

## Phase 3: Capture Backend

- [ ] **Schema: `captures`** — `drizzle/schema.ts`
  - [ ] id, userId, zoneId, scheduleId (nullable), status (pgEnum), filePath, fileSize, errorMessage, styleUsed (jsonb — snapshot style dipakai, BR-023), createdAt, completedAt
  - [ ] Index (userId, createdAt DESC)
  - [ ] Index (userId, createdAt) untuk daily limit check — filter tanggal WIB di query, bukan di index

- [ ] **Types: style.ts** — `src/types/style.ts`
  - [ ] `StylePreset` interface: `id`, `name`, `colors` (overlay bg/text/accent), thumbnail meta
  - [ ] `STYLE_PRESETS` konstanta — minimal 4 preset ("default", "minimal", "bold", "corporate")
  - [ ] `CaptureStyleInput` — `{ presetId, title, showTimestamp }` (dipakai di request body, BR-023)
  - [ ] `DEFAULT_STYLE` konstanta — dipakai untuk scheduled capture otomatis (BR-023)

- [ ] **Repository: capture.repository.ts** — `src/repositories/capture.repository.ts`
  - [ ] `create` (status = pending, simpan `styleUsed`)
  - [ ] `findById`
  - [ ] `findByUserId` dengan pagination
  - [ ] `countTodayByUserId` — untuk BR-006, gunakan `AT TIME ZONE 'Asia/Jakarta'` di query
  - [ ] `updateStatus`

- [ ] **Lib: rabbitmq-client.ts** — `src/lib/rabbitmq-client.ts`
  - [ ] Connect via `amqplib`, declare queue `capture-jobs`, declare dead-letter queue
  - [ ] `publishCaptureJob(captureId: string)`

- [ ] **Internal render page (untuk Playwright)** — `web/src/app/internal/render/capture/page.tsx`
  - [ ] Route khusus, tidak untuk publik (bisa dibatasi via header token internal atau IP allowlist di reverse proxy)
  - [ ] Terima query params: `zoneId`, `roadClass` (effective), `stylePresetId`, `title`, `showTimestamp`
  - [ ] Render komponen sama dengan preview browser: `MapCanvas` (Leaflet + OSM basemap, ADR-010b/c) + `TrafficOverlay` (fetch data HERE Traffic Flow server-side atau lewat `GET /traffic/preview`) + `CaptureStyleOverlay` (title/timestamp/legend sesuai style)
  - [ ] Halaman ini murni untuk discreenshot Playwright — tidak ada interaksi user di sini

- [ ] **Lib: playwright-client.ts** — `src/lib/playwright-client.ts`
  - [ ] Launch Chromium headless (`playwright.chromium.launch()`)
  - [ ] `screenshotCapture(zone, brandingConfig, effectiveRoadClass, style): Promise<Buffer>`
  - [ ] Navigate ke internal render page (`{FRONTEND_URL}/internal/render/capture?...`) dengan query params di atas
  - [ ] Tunggu network idle (basemap OSM tile + traffic overlay selesai load) sebelum screenshot
  - [ ] Screenshot sebagai PNG buffer

- [ ] **Lib: r2-client.ts** — `src/lib/r2-client.ts`
  - [ ] S3-compatible client (`@aws-sdk/client-s3`) ke Cloudflare R2
  - [ ] `upload(path: string, data: Buffer, contentType: string): Promise<void>`
  - [ ] `getPresignedUrl(path: string): Promise<string>`

- [ ] **Lib: here-traffic-client.ts** — `src/lib/here-traffic-client.ts`
  - [ ] `getTrafficFlow(bbox, fcList): Promise<GeoJSON>` — panggil HERE Traffic Flow API, mapping response ke GeoJSON LineString per segment dengan `trafficState` dan `color` (BR-017)
  - [ ] Dipakai oleh endpoint `GET /traffic/preview` DAN oleh internal render page saat capture asli

- [ ] **Service: capture.service.ts** — `src/services/capture.service.ts`
  - [ ] `triggerManual(userId, zoneId, style)` — check BR-006 → create capture record (simpan `styleUsed`) → publish ke RabbitMQ
  - [ ] `triggerScheduled(scheduleId)` — sama, tapi `styleUsed` = `DEFAULT_STYLE` (BR-023)

- [ ] **Worker: capture.worker.ts** — `src/workers/capture.worker.ts`
  - [ ] Consume dari queue `capture-jobs`
  - [ ] Update status ke `processing`
  - [ ] Panggil `zoneService.getEffectiveRoadClassFilter(zone, currentPlan)` (BR-022) → screenshot dengan road class filter hasil MIN
  - [ ] Pass `styleUsed` dari capture record ke `screenshotCapture`
  - [ ] Upload ke R2 (path: BR-011)
  - [ ] Update status ke `done` atau `failed`
  - [ ] Entry point terpisah: `src/workers/index.ts` (dijalankan via `pnpm worker`)

- [ ] **Controller + Routes: capture** — `src/controllers/capture.controller.ts`, `src/routes/capture.routes.ts`
  - [ ] `POST /captures/manual` — body: `{ zoneId, style }`
  - [ ] `GET /captures/:id` — untuk polling status
  - [ ] `GET /captures` — history dengan pagination
  - [ ] Swagger annotation lengkap

- [ ] **Controller + Routes: traffic preview** — `src/controllers/traffic.controller.ts`, `src/routes/traffic.routes.ts`
  - [ ] `GET /traffic/preview?bbox=&roadClass=` — proxy `hereTrafficClient.getTrafficFlow`, batasi luas bbox maksimum (edge case: polygon terlalu besar)
  - [ ] Swagger annotation

- [ ] **Unit Test: capture.controller.test.ts**
  - [ ] `POST /captures/manual` success → 202 pending
  - [ ] `POST /captures/manual` limit exceeded → 429 PLAN_LIMIT_EXCEEDED
  - [ ] `GET /captures/:id` success → 200
  - [ ] `GET /captures/:id` not found → 404

- [ ] **Unit Test: traffic.controller.test.ts**
  - [ ] `GET /traffic/preview` success → 200 + GeoJSON
  - [ ] `GET /traffic/preview` bbox terlalu besar → 422
  - [ ] `GET /traffic/preview` HERE API gagal → 502 dengan pesan jelas (bukan crash)

---

## Phase 4: Frontend

- [ ] **Dashboard Page** — `app/(dashboard)/page.tsx`
  - [ ] Fetch `GET /usage` via `features/dashboard/api.ts`
  - [ ] Card ringkasan: jumlah zona (`zonesCount`)
  - [ ] Card ringkasan: schedule aktif (`schedulesActiveCount`)
  - [ ] Section CTA menonjol "Buat Zona Baru" → buka `ZoneCreateStepper`
  - [ ] Loading skeleton saat fetch pertama
  - [ ] Login berhasil → redirect ke `/` (dashboard ini), bukan `/zones`

- [ ] **Zone List Page** — `app/(dashboard)/zones/page.tsx`
  - [ ] Fetch zones via `features/zones/api.ts`
  - [ ] Tampilkan semua zona user + badge road class (Nasional / Nasional+Provinsi / Semua Jalan)
  - [ ] Empty state dengan CTA "Buat Zona Pertama" jika belum ada zona → buka `ZoneCreateStepper`
  - [ ] Loading skeleton

- [ ] **Zone Create Stepper (Shell)** — `features/zones/components/ZoneCreateStepper.tsx`
  - [ ] Progress indicator 3 step (mengikuti pola `Progress Navigation` di `design.md`) — step aktif ungu, selesai checkmark, belum dicapai netral
  - [ ] State lokal (`useState`/`useReducer`) menyimpan: `{ name, geometry, roadClass }` — tidak dikirim ke server sampai step 3
  - [ ] Navigasi antar step: "Lanjut" (validasi step aktif dulu), "Kembali" (data tetap ada)
  - [ ] Konfirmasi "Yakin keluar? Progress akan hilang" saat modal/drawer ditutup sebelum submit
  - [ ] Submit `POST /zones` hanya di step 3

- [ ] **Step 1: Pilih Area** — `features/zones/components/steps/StepAreaSelect.tsx`
  - [ ] Field nama zona dengan inline validation (BR-015)
  - [ ] Embed `ZoneMapEditor` (Leaflet + basemap OSM, dark filter, BR-016/017, ADR-010b/c)
  - [ ] Click-to-add-point polygon drawing, live preview, Undo & Reset
  - [ ] Export GeoJSON polygon (BR-013)
  - [ ] Tombol "Lanjut" aktif hanya jika nama valid + polygon ≥ 3 titik dan tertutup

- [ ] **Step 2: Pilih Road Class** — `features/zones/components/steps/StepRoadClass.tsx`
  - [ ] Dropdown/radio 3 opsi: Nasional, Nasional + Provinsi, Semua Jalan — dengan deskripsi singkat
  - [ ] Cek plan user vs opsi yang diklik — jika melebihi, tampilkan `UpgradeModal` (BR-021), jangan simpan pilihan
  - [ ] `UpgradeModal`: tombol "Lihat Plan" (→ `/settings/plans`) dan "Tutup"
  - [ ] Tombol "Preview" — buka `TrafficPreviewPanel` (lihat komponen di bawah)
  - [ ] Tombol "Lanjut" aktif hanya jika road class valid terpilih
  - [ ] Tombol "Kembali" ke step 1 tanpa hilang data

- [ ] **Traffic Preview Panel** — `features/zones/components/TrafficPreviewPanel.tsx`
  - [ ] Fetch `GET /traffic/preview?bbox=&roadClass=` berdasarkan polygon dari step 1 + road class dari step 2
  - [ ] Render `MapCanvas` (Leaflet + react-leaflet, basemap OSM, ADR-010b/c) + layer GeoJSON traffic hasil fetch
  - [ ] Embed `StyleSelector` (lihat komponen di bawah) di dalam panel ini
  - [ ] State style di panel ini ephemeral — reset setiap panel dibuka ulang (BR-023)
  - [ ] Handle error/timeout `GET /traffic/preview` — tampilkan pesan, jangan blokir tombol "Lanjut" di step 2

- [ ] **Map Canvas (shared)** — `features/zones/components/MapCanvas.tsx`
  - [ ] Wrapper `react-leaflet` dengan tile layer OpenStreetMap
  - [ ] Dark theme filter (CSS filter pada tile layer, BR-016) — dipakai konsisten di ZoneMapEditor DAN TrafficPreviewPanel
  - [ ] Props: `polygon`, `trafficGeoJSON` (opsional), `interactive` (boolean — false untuk preview/review)

- [ ] **Style Selector (shared)** — `components/ui/StyleSelector.tsx`
  - [ ] Galeri card untuk tiap `StylePreset` dari `STYLE_PRESETS` (backend types di-share/duplicate ke frontend constants)
  - [ ] Input Title (default = nama zona dari step 1, editable)
  - [ ] Toggle "Tampilkan Timestamp"
  - [ ] Emit `CaptureStyleInput` ke parent (TrafficPreviewPanel atau ManualCaptureButton) secara reaktif
  - [ ] Tidak ada tombol simpan — state ephemeral sepenuhnya dikontrol parent

- [ ] **Step 3: Review & Konfirmasi** — `features/zones/components/steps/StepReview.tsx`
  - [ ] Ringkasan: nama zona, preview polygon (peta kecil, read-only), badge road class
  - [ ] Tombol "Buat Zona" → submit `POST /zones { name, geometry, roadClass }`
  - [ ] Loading state saat submit, disabled untuk cegah double-submit
  - [ ] Sukses → toast + tutup stepper + redirect `/zones`
  - [ ] Error `ZONE_NAME_TAKEN` → alert + tombol "Kembali ke Step 1"
  - [ ] Error `ROAD_CLASS_NOT_ALLOWED` → alert + tombol "Kembali ke Step 2"

- [ ] **Manual Capture Flow** — `features/captures/components/ManualCaptureButton.tsx`
  - [ ] Klik tombol "Capture Sekarang" → buka `StyleSelector` di dalam modal/drawer konfirmasi (bukan langsung trigger)
  - [ ] Modal punya tombol final "Capture Sekarang" (konfirmasi) dan "Batal"
  - [ ] Konfirmasi → panggil `POST /captures/manual` dengan body `{ zoneId, style }`
  - [ ] Loading state saat request berjalan
  - [ ] Polling `GET /captures/:id` setiap 3 detik
  - [ ] Tampilkan preview gambar + tombol download setelah done
  - [ ] Handle error & limit exceeded state
  - [ ] Retry ("Coba Lagi") membuka lagi modal Style Selector, tidak reuse style sebelumnya secara otomatis

---

## Phase 5: Integration & Edge Cases

- [ ] Test manual: `docker compose up` → create zone → capture sekarang → download PNG
- [ ] Test daily limit: trigger captures hingga limit plan aktif (Free=10) → verify capture berikutnya di-skip dengan status `skipped_limit`
- [ ] Test plan restriction: login sebagai user Free → capture hanya menampilkan jalan nasional (FC1-FC2)
- [ ] Test plan restriction: user Standard → capture menampilkan nasional + provinsi (FC1-FC3)
- [ ] Test stepper: user Free pilih road class "Semua Jalan" di step 2 → upgrade popup muncul, tidak bisa lanjut ke step 3
- [ ] Test BR-022: buat zona dengan roadClass=semua saat plan Premium → downgrade ke Free → capture berikutnya hanya render FC1-FC2 (efektif capped), zona tidak berubah di DB
- [ ] Test dashboard: `GET /usage` return zonesCount dan schedulesActiveCount sesuai data aktual
- [ ] Test preview: buka Step 2 → klik Preview → traffic overlay muncul di atas basemap OSM sesuai road class terpilih
- [ ] Test style: ganti preset di StyleSelector → area preview update warna tanpa reload
- [ ] Test style: edit title lalu ganti preset → title tetap (tidak reset ke nama zona)
- [ ] Test manual capture: konfirmasi via StyleSelector → `styleUsed` di capture record sesuai yang dipilih
- [ ] Test scheduled capture: `styleUsed` otomatis = DEFAULT_STYLE (BR-023), tidak ada interaksi user
- [ ] Test Playwright: internal render page menghasilkan gambar identik komposisinya dengan preview browser (basemap OSM + traffic overlay + style)
- [ ] Test duplikat nama zone (case-insensitive)
- [ ] Test polygon tidak menutup → frontend validasi sebelum submit
- [ ] Verify branding overlay: logo, zone name, timestamp, legend muncul di gambar
- [ ] Verify: semua service tetap jalan setelah `docker compose restart api`

---

## Decisions Made

*(Catat keputusan teknis yang dibuat saat implementasi)*

```
[YYYY-MM-DD] Keputusan: ...
  Alasan: ...
```
