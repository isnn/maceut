# CLAUDE.md

## Project
**Maceut** — Platform SaaS untuk monitoring dan visualisasi kemacetan lalu lintas berbasis peta, dengan fitur scheduled capture otomatis dan export gambar bermerek.
Single-workspace SaaS dengan model langganan Free / Standard / Premium.

## Stack
**Frontend:** Next.js · Tailwind CSS · Base UI (component library)
**Backend:** Node.js · Express · TypeScript · Drizzle ORM · Repository Pattern · RabbitMQ (queue)
**Docs:** Swagger UI (swagger-jsdoc + swagger-ui-express) — auto-generated dari JSDoc annotation
**Database:** PostgreSQL + PostGIS · Better Auth · HttpOnly JWT
**Maps:** Leaflet + react-leaflet, basemap OpenStreetMap · HERE Traffic Flow API (data traffic saja, bukan tile)
**Storage:** Cloudflare R2 (PNG/JPG captures)
**Capture Engine:** Playwright (headless browser screenshot HERE Maps)
**Scheduler:** node-cron in-process → publish job ke RabbitMQ
**Deployment:** Docker + Docker Compose (local dev & production)

## Commands
```bash
# Semua service via Docker (rekomendasi utama)
docker compose up                    # Start semua service (db, rabbitmq, api, worker, web)
docker compose up -d                 # Start di background
docker compose down                  # Stop semua service
docker compose logs -f api           # Lihat log service tertentu
docker compose exec api sh           # Masuk ke container api

# Frontend (jika run manual di luar Docker)
cd web && npm run dev                   # Dev server (port 3000)
cd web && npm run build                 # Production build
cd web && npm run lint                  # ESLint

# Backend (jika run manual di luar Docker)
cd api && npm run dev                   # Express dev server dengan hot reload (tsx watch)
cd api && npm run build                 # Compile TypeScript
cd api && npm run start                 # Run compiled server
cd api && npm run worker                # Jalankan capture worker
cd api && npm run test                  # Run semua unit test (vitest/jest)
cd api && npm run test:coverage         # Test dengan coverage report
cd api && npm run lint                  # ESLint

# Drizzle ORM
cd api && npx drizzle-kit generate  # Generate migration dari schema
cd api && npx drizzle-kit migrate   # Jalankan migration
cd api && npx drizzle-kit studio    # Buka Drizzle Studio (GUI DB browser)

# Swagger
# Swagger UI tersedia otomatis di: http://localhost:8080/api-docs

# Env
cp api/.env.example api/.env         # Setup backend env
cp web/.env.example web/.env.local   # Setup frontend env
```

## Key Conventions
- Semua API response format: `{ success, data }` atau `{ success, error: { code, message } }`
- Error code pakai SCREAMING_SNAKE: `PLAN_LIMIT_EXCEEDED`, `ZONE_NOT_FOUND`
- Limit enforce di service layer, bukan controller (BR-007)
- Capture file path di R2: `captures/{user_id}/{YYYY}/{MM}/{capture_id}.png`
- PostGIS polygon zone disimpan sebagai `geometry(Polygon, 4326)` — selalu WGS84
- **Semua kolom waktu WAJIB `timestamptz`** (`timestamp('x', { withTimezone: true })` di Drizzle).
  `timestamp` polos tidak menyimpan offset, jadi nilainya berarti apa pun yang diasumsikan proses
  pembaca — aman selama semua container UTC, diam-diam salah begitu ada satu yang tidak, dan
  gagalnya tak terlihat: tidak ada error, cuma jam yang meleset. Simpan instant; WIB adalah urusan
  query/tampilan (`AT TIME ZONE 'Asia/Jakarta'`), bukan urusan penyimpanan.
  Dijaga otomatis oleh `api/src/config/schema-timezone.test.ts`.
  ⚠️ `npx @better-auth/cli generate` MENGHAPUS `withTimezone` setiap kali dijalankan — pasang lagi.
- **Setiap perubahan schema WAJIB ikut meng-update `docs/database/schema.dbml` di commit yang sama.**
  Bukan commit berikutnya. ERD yang basi lebih buruk daripada tidak ada ERD: tidak ada yang curiga
  pada diagram, jadi orang pertama yang merencanakan berdasarkan itu merencanakan untuk schema yang
  tidak ada. Sertakan tabel/kolom baru & terhapus, perubahan tipe/nullability, index & constraint
  baru, dan baris `Last updated`. Lihat `docs/database/README.md`.
- Subscription tier check wajib ada di setiap endpoint yang berkaitan zona & schedule
- UI components wajib berbasis Base UI — jangan buat custom dari scratch
- Dark theme HANYA untuk halaman map visualization & export — dashboard tetap white-first
- Drizzle digunakan untuk semua operasi DB — jangan raw SQL kecuali PostGIS spatial function (`sql` template Drizzle diperbolehkan untuk itu)
- Setiap route Express wajib punya JSDoc Swagger annotation (`@swagger` block) di atas definisinya
- Setiap endpoint baru wajib punya unit test di `*.test.ts` yang folder sama
- Semua secret & config dari `.env` — jangan hardcode di source code, load via `zod`-validated config object
- Styling frontend wajib pakai token Tailwind dari `tailwind.config.ts` — jangan hardcode hex
- Semua service (api, worker, web, db, rabbitmq) wajib bisa jalan lewat `docker compose up` tanpa setup manual tambahan
- **Nama branch & judul PR pakai `<type>/<nama-kebab-case>`** dengan type yang SAMA seperti commit:
  `feat` · `fix` · `refactor` · `docs` · `test` · `chore` · `perf`. Contoh `feat/schedule-management`,
  `fix/session-expiry-timezone`, `chore/db-conventions`. Satu kosakata untuk branch, PR, dan commit —
  lihat structure.md.

## Project Structure
```
web/                        # Next.js frontend
  src/
    app/
      (public)/             # Unauthenticated: login, register
      (dashboard)/          # Authenticated: dashboard, zones, captures
    components/
      ui/                   # Base UI wrappers & design system tokens
      shared/               # Reusable component lintas fitur
    features/               # Satu folder per fitur
      zones/
      captures/
      schedules/
      branding/
    lib/                    # api-client, utils
    types/                  # Global TypeScript types
  Dockerfile
  Dockerfile.dev

api/                        # Express backend (TypeScript)
  src/
    routes/                 # Definisi endpoint per fitur
    controllers/            # Terima request, panggil service, return response (thin)
    services/               # Business logic — enforce semua BR
    repositories/           # Akses data — Drizzle query + raw SQL untuk PostGIS
    middlewares/            # Auth, plan-check, rate-limit, error-handler
    workers/                # RabbitMQ consumer (capture)
    schedulers/             # node-cron trigger → publish ke queue
    lib/                    # r2-client, playwright, here-maps-client, drizzle-client
    config/                 # Env loading + validation (zod)
    types/                  # Shared TypeScript types
  drizzle/
    schema.ts               # Definisi semua tabel
    migrations/              # Auto-generated oleh drizzle-kit
  Dockerfile
  Dockerfile.dev

docker-compose.yml           # Local development — semua service
docker-compose.prod.yml      # Production overrides
```

## Steering Docs
- `@.claude/steering/product.md`   → personas, business rules, fitur & status
- `@.claude/steering/tech.md`      → ADR, data model, API contract, lifecycle
- `@.claude/steering/structure.md` → folder detail, naming, code patterns
- `@.claude/steering/design.md`    → design system, Tailwind tokens, component patterns
- `@.claude/steering/deployment.md` → Docker setup, environment, deploy flow

## Specs
- `@.claude/specs/auth/requirements.md`             → F-08 Register · F-09 Login · F-10 Logout & route guard
- `@.claude/specs/auth/tasks.md`
- `@.claude/specs/zone-management/requirements.md`  → F-19 Dashboard · F-01 Zone List · F-02 Create Zone Stepper · F-03 Step 1 (Area) · F-17 Step 2 (Road Class + Preview) · F-20 Style Selector · F-18 Step 3 (Review) · F-04 Manual Capture
- `@.claude/specs/zone-management/tasks.md`
- `@.claude/specs/capture-schedule/requirements.md` → F-05 Create Schedule · F-06 Manage Schedule · F-07 Capture History
- `@.claude/specs/capture-schedule/tasks.md`
- `@.claude/specs/branding/requirements.md`         → F-11 Company Name · F-12 Logo Upload · F-13 Capture Preview
- `@.claude/specs/branding/tasks.md`
- `@.claude/specs/subscription/requirements.md`     → F-14 Usage Dashboard · F-15 Plan Display · F-16 Enforcement
- `@.claude/specs/subscription/tasks.md`

## Active Work
Baca `@SPRINT.md` di setiap sesi kerja sebelum mulai apapun.

## Development Flow

Setiap task mengikuti flow ini — wajib dipatuhi:

```
1. TANDAI task sebagai 🟡 In Progress di SPRINT.md sebelum mulai coding
2. KERJAKAN implementasi (route → controller → service → repository → test → swagger)
3. TULIS unit test untuk setiap endpoint baru di file *.test.ts
4. JALANKAN test: npm test — pastikan pass sebelum selesai
5. VERIFIKASI Swagger annotation lengkap dan ter-render di /api-docs
6. TANDAI task sebagai ✅ Done di SPRINT.md
7. CATAT log singkat di SPRINT.md section "Progress Log" (tanggal + apa yang dilakukan)
8. UPDATE dokumentasi di spec atau steering jika ada keputusan teknis baru
```

Jangan pindah ke task berikutnya sebelum task aktif di-tandai ✅ dan test pass.

## AI Rules
```
DO   → Baca SPRINT.md sebelum mulai. Tanya jika ada ambiguitas.
DO   → Enforce plan limit di service layer, referensikan BR-007.
DO   → Simpan polygon sebagai PostGIS geometry, bukan JSON biasa.
DO   → Pakai `timestamptz` untuk SEMUA kolom waktu — tidak pernah `timestamp` polos.
DO   → Update docs/database/schema.dbml di commit yang sama saat schema berubah.
DO   → Nama branch & PR: <type>/<kebab-case>, type sama dengan commit (feat/schedule-management).
DO   → Tulis Swagger JSDoc annotation di setiap route baru.
DO   → Tulis unit test untuk setiap endpoint baru.
DO   → Baca .env.example sebelum menggunakan config value.
DO   → Gunakan token Tailwind dari design.md, bukan hardcode hex.
DO   → Pastikan service baru terdaftar di docker-compose.yml jika perlu container terpisah.
DON'T → Install library baru tanpa persetujuan eksplisit.
DON'T → Tambahkan POI, store, restaurant ke map layer — fokus road + traffic saja.
DON'T → Implement fitur yang tidak ada di SPRINT.md aktif.
DON'T → Pindah task sebelum yang aktif di-tandai ✅ dan test pass.
```
