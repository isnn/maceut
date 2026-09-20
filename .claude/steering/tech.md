# tech.md — Technical Reference

> Baca saat: membuat keputusan arsitektur, desain schema baru, atau menulis endpoint baru.

---

## Architecture Decisions

| ADR | Keputusan | Alasan | Trade-off |
|-----|-----------|--------|-----------|
| ADR-001 | Node.js + Express untuk backend | Ekosistem matang, satu bahasa (TypeScript) dengan frontend, cepat untuk MVP solo dev, banyak library siap pakai | Single-threaded — perlu hati-hati dengan operasi CPU-intensive (Playwright dijalankan di proses worker terpisah untuk isolasi) |
| ADR-002 | TypeScript untuk seluruh backend | Type safety, konsisten dengan Next.js frontend, mengurangi bug runtime | Build step tambahan (`tsc`); perlu disiplin tipe di boundary (request/response) |
| ADR-003 | Repository Pattern di Express | Memisahkan business logic dari query DB; mudah mock untuk testing; konsisten dengan arsitektur berlapis | Sedikit lebih verbose dibanding akses DB langsung di controller |
| ADR-004 | PostGIS untuk polygon zone | Query spasial native (ST_Contains, ST_Intersects, bounding box); lebih robust dari JSON polygon | Perlu install extension PostGIS; tambah kompleksitas setup DB |
| ADR-005 | RabbitMQ sebagai job queue | Decoupling scheduler dari capture worker; retry & dead-letter queue built-in; durable message | Infra tambahan; overhead operasional dibanding in-process queue |
| ADR-006 | Playwright untuk capture engine | Render HERE Maps yang akurat dengan tile + traffic layer; support screenshot PNG full-quality | Butuh Chromium headless di server; startup time lebih lambat dari static image API; lebih reliable dari HERE Static Maps untuk kompleksitas layer |
| ADR-007 | node-cron in-process sebagai scheduler | Simple untuk MVP solo dev; tidak perlu distributed scheduler; cukup untuk 10 schedules/user | Tidak fault-tolerant jika server restart; perlu migrasi ke distributed scheduler (e.g., BullMQ repeatable jobs) saat scale |
| ADR-008 | Cloudflare R2 untuk file storage | Zero egress cost; S3-compatible API; terintegrasi dengan CDN Cloudflare | Vendor lock-in Cloudflare; fitur presigned URL ada namun lebih terbatas dari S3 |
| ADR-009 | Better Auth + HttpOnly cookie, session disimpan di DB | HttpOnly cookie mencegah XSS; Better Auth menangani hashing, sesi, CSRF origin check, dan rate limit tanpa kode sendiri; sesi berupa baris di tabel `session` sehingga logout benar-benar mencabut akses — ini justru menyelesaikan trade-off yang dicatat versi awal ADR ini | Skema `user`/`session`/`account`/`verification` milik Better Auth, bukan milik kita (di-generate CLI-nya); satu DB lookup per request; modul auth memakai format respons Better Auth, bukan `{ success, data }` (lihat ADR-016) |
| ADR-010 | HERE Traffic Flow API (data only, bukan tile) | Data traffic real-time terpercaya untuk Indonesia; flow data granular per road segment | Berbayar per request; perlu fallback jika quota habis |
| ADR-010b | OpenStreetMap sebagai basemap tile (via Leaflet) | Gratis, tidak ada biaya per-tile; cukup untuk kebutuhan tampilan road network dasar; konsisten dipakai baik di preview browser maupun render Playwright | Kualitas visual tile lebih sederhana dibanding HERE Maps tile; styling dark theme perlu custom CSS filter pada tile OSM |
| ADR-010c | Leaflet + react-leaflet untuk komponen peta | Ringan, matang, mudah dipakai untuk polygon drawing dan render layer custom (traffic overlay sebagai GeoJSON) | Tidak sekaya fitur HERE Maps JS SDK (3D, indoor maps, dll — tidak dibutuhkan untuk kasus ini) |
| ADR-011 | Drizzle ORM | Type-safe query builder dengan skema TypeScript-first; performa mendekati raw SQL; migration ringan; dukungan `sql` template untuk raw query PostGIS | Ekosistem lebih baru dibanding Prisma/TypeORM; sedikit lebih manual untuk relasi kompleks |
| ADR-012 | swagger-jsdoc + swagger-ui-express | Auto-generate dari JSDoc comment di atas route; UI langsung tersedia di `/api-docs`; ringan, tanpa build step tambahan | Annotation JSDoc verbose; tidak type-checked terhadap route asli (perlu disiplin manual) |
| ADR-013 | Next.js App Router | SSR untuk SEO halaman publik; Server Component untuk data fetching efisien; route grouping untuk auth | App Router masih ada breaking change; lebih kompleks dari Pages Router untuk tim kecil |
| ADR-014 | Base UI sebagai component foundation | Headless component; accessibility built-in; tidak opinionated soal styling; kompatibel dengan Tailwind | Tidak sekaya shadcn/ui out-of-the-box; perlu styling manual semua component |
| ADR-015 | Docker + Docker Compose untuk dev & deploy | Environment konsisten lokal dan produksi; satu command (`docker compose up`) untuk semua service; mempermudah onboarding | Overhead resource lokal (Docker Desktop); perlu maintain Dockerfile per service |
| ADR-016 | Dua format respons: `/api/auth/*` memakai format Better Auth, sisanya `{ success, data }` | Membungkus respons Better Auth berarti memelihara adapter untuk setiap endpoint-nya dan membuat client library resminya tidak bisa dipakai apa adanya; keduanya tidak pernah bertabrakan karena berada di subtree route yang terpisah | Ada dua bentuk respons dalam satu API — frontend perlu tahu modul auth berbeda; endpoint aplikasi untuk data user (`GET /me`) tetap disediakan terpisah agar layar non-auth tidak perlu memahami bentuk Better Auth |
| ADR-017 | `FRONTEND_URL` dipecah menjadi `FRONTEND_URL` + `RENDER_BASE_URL` | Satu variabel dipakai untuk dua hal yang alamatnya berbeda: origin CORS harus sama persis dengan yang ada di address bar browser, sedangkan Playwright membuka render page dari DALAM container api sehingga harus memakai nama service (`http://web:3000`) — `localhost` di sana menunjuk ke container api sendiri | Satu variabel env tambahan; keduanya wajib benar atau gejalanya membingungkan (CORS gagal, atau capture menghasilkan halaman kosong) |
| ADR-018 | Layar `/internal/config` bersifat read-only mirror dari `.env` | Config dibaca dari `.env` saat container start; membuatnya bisa diedit dari UI berarti menyimpan secret di database (perlu enkripsi at-rest) dan membuat satu salah-edit bisa menjatuhkan platform; belum ada kebutuhan mengubah config saat runtime | Mengganti nilai tetap perlu edit `.env` + restart service; layar tersebut hanya menampilkan state dan mask secret, tombol tulisnya dinonaktifkan |
| ADR-019 | Jadwal disimpan sebagai JENDELA (jam mulai/selesai, interval, hari), cron diturunkan saat dibaca | Jendela → cron itu total: setiap jendela punya tepat satu bentuk cron. Cron → jendela TIDAK: `0 3,17 * * *` tidak punya bentuk jendela sama sekali. Menyimpan cron berarti UI tidak bisa menampilkan ulang apa yang user simpan | Menyimpang dari `schedules.cron_expr` di data model; konversi lossy terjadi di memori, tidak pernah di database |
| ADR-020 | Perubahan paket memakai GRANDFATHER AND BLOCK: tidak ada yang dihapus, yang melebihi batas di-pause, pembuatan baru ditolak | Menghapus data saat downgrade berisiko memusnahkan satu-satunya rekaman kemacetan yang dibutuhkan pelanggan; tidak melakukan apa-apa (perilaku sebelumnya) membuat tier jadi dekoratif — beli premium sebulan, bangun semuanya, turun ke free, kapabilitasnya tetap selamanya. Memperluas preseden BR-022 yang sudah meng-grandfather kelas jalan | Butuh state "X zona Anda di-pause" yang jelas di UI; `zonesLimit` sekarang menghitung zona ber-status `collecting` saja, supaya pause benar-benar membebaskan slot — sebuah pelonggaran yang disengaja |

---

## Drizzle ORM Usage Rules

```ts
// drizzle/schema.ts — definisi tabel
import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const planEnum = pgEnum('plan', ['free', 'standard', 'premium'])

export const zones = pgTable('zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  // geometry PostGIS tidak punya native Drizzle type — didefinisikan via raw SQL migration,
  // dan diakses lewat sql`` template di query
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at'),
})
```

```ts
// ✅ CORRECT — gunakan Drizzle query builder untuk operasi CRUD standar
// src/repositories/zone.repository.ts
import { db } from '../lib/drizzle-client'
import { zones } from '../../drizzle/schema'
import { eq, and } from 'drizzle-orm'

export async function findByUserId(userId: string) {
  return db.select().from(zones).where(eq(zones.userId, userId))
}

export async function existsByNameAndUserId(userId: string, name: string) {
  const result = await db.select().from(zones)
    .where(and(eq(zones.userId, userId), eq(zones.name, name)))
  return result.length > 0
}

// ✅ CORRECT — gunakan sql`` template HANYA untuk PostGIS spatial function
import { sql } from 'drizzle-orm'

export async function create(userId: string, name: string, geojson: object) {
  const result = await db.execute(sql`
    INSERT INTO zones (id, user_id, name, geometry, created_at, updated_at)
    VALUES (gen_random_uuid(), ${userId}, ${name}, ST_GeomFromGeoJSON(${JSON.stringify(geojson)}), NOW(), NOW())
    RETURNING id, user_id, name, ST_AsGeoJSON(geometry)::json AS geometry, created_at
  `)
  return result.rows[0]
}

export async function findById(id: string) {
  const result = await db.execute(sql`
    SELECT id, user_id, name, ST_AsGeoJSON(geometry)::json AS geometry, created_at, updated_at
    FROM zones WHERE id = ${id}
  `)
  return result.rows[0]
}

// ❌ WRONG — raw SQL untuk query yang bisa pakai Drizzle query builder biasa
db.execute(sql`SELECT * FROM zones WHERE user_id = ${userId}`)
```

## Swagger (JSDoc) Annotation Pattern

```ts
// ✅ CORRECT — setiap route wajib punya JSDoc @swagger block lengkap
// src/routes/zone.routes.ts

/**
 * @swagger
 * /zones:
 *   post:
 *     summary: Buat zona baru
 *     description: Membuat zona polygon baru milik user yang sedang login
 *     tags: [Zones]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateZoneInput'
 *     responses:
 *       201:
 *         description: Zona berhasil dibuat
 *       422:
 *         description: Validasi gagal atau nama duplikat
 *       401:
 *         description: Tidak terautentikasi
 */
router.post('/zones', authMiddleware, zoneController.create)
```

## Unit Test Pattern

```ts
// ✅ CORRECT — setiap controller/route punya test file di folder yang sama
// src/controllers/zone.controller.test.ts
import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app } from '../app'
import * as zoneService from '../services/zone.service'

describe('POST /zones', () => {
  it('returns 201 on success', async () => {
    vi.spyOn(zoneService, 'createZone').mockResolvedValue({
      id: 'zone-1', name: 'Zona Malioboro', geometry: {}, createdAt: new Date(),
    })

    const res = await request(app)
      .post('/zones')
      .set('Cookie', 'token=valid-jwt')
      .send({ name: 'Zona Malioboro', geometry: { type: 'Polygon', coordinates: [[]] } })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
  })

  it('returns 422 on duplicate name', async () => {
    vi.spyOn(zoneService, 'createZone').mockRejectedValue(new ZoneNameTakenError())

    const res = await request(app)
      .post('/zones')
      .set('Cookie', 'token=valid-jwt')
      .send({ name: 'Zona Malioboro', geometry: {} })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('ZONE_NAME_TAKEN')
  })

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).post('/zones').send({ name: 'Zona Malioboro' })
    expect(res.status).toBe(401)
  })
})
```

## Request Lifecycle

```
HTTP Request
  → Rate Limiter (IP-based, per endpoint)
  → Auth Middleware (validate HttpOnly JWT, extract user_id)
  → Plan Checker Middleware (inject user plan ke context)
  → Route Handler (thin: parse request, call service, return response)
    → Service Layer (business logic, enforce BR-001..BR-019)
      → Road Class Resolver (effectiveRoadClass = MIN(zone.roadClass, plan.maxRoadClass) → inject FC classes ke Playwright config, BR-022)
      → Repository Layer (PostgreSQL query, PostGIS operations)
    → Response formatter { success, data } | { success, error }

Capture Job Flow:
  Scheduler (cron) → RabbitMQ publish CaptureJob { zoneId, scheduleId?, style }
    → Capture Worker consume
      → Plan Limit Check (BR-006, BR-007)
      → Road Class Resolver (BR-022) → effectiveRoadClass
      → Playwright navigate ke internal render page (`/internal/render/capture?zoneId=&roadClass=&style=`)
        → Halaman render pakai komponen sama dengan preview browser: Leaflet + OSM basemap + HERE Traffic overlay (ADR-010b/c)
      → Overlay branding (logo + timestamp + legend) + style yang dipilih (warna, title, format timestamp) (BR-023)
      → Screenshot halaman → PNG
      → Upload ke R2 (BR-011)
      → Simpan metadata PostgreSQL, termasuk `style_used` (JSON, untuk histori — BR-010)
      → Update capture status

Style Resolution:
  - Manual capture / preview → user pilih style tiap kali dari StyleSelector (ephemeral, tidak disimpan sebagai profil) — BR-023
  - Scheduled capture (cron trigger otomatis, tanpa interaksi user) → gunakan style "Default" preset (BR-023)
```

---

## Data Model

### Entity Relationships
```
users ──── user_plans (1:1 aktif)
users ──── zones (1:N)
users ──── schedules (1:N)
users ──── branding_configs (1:1)
users ──── captures (1:N)

zones ──── schedules (1:N)
schedules ──── captures (1:N)
```

### Key Tables

**`users`** — Akun pengguna
```
id            uuid PK
email         text UNIQUE NOT NULL
password_hash text NOT NULL
created_at    timestamptz DEFAULT now()
updated_at    timestamptz
```

**`user_plans`** — Plan aktif user (1:1 dengan users)
```
id            uuid PK
user_id       uuid FK → users.id UNIQUE
plan          enum('free','standard','premium') NOT NULL DEFAULT 'free'
started_at    timestamptz NOT NULL
expires_at    timestamptz   ← NULL = aktif selamanya (manual assign)
created_at    timestamptz DEFAULT now()
```

**`zones`** — Zone polygon buatan user
```
id            uuid PK
user_id       uuid FK → users.id NOT NULL
name          text NOT NULL
geometry      geometry(Polygon, 4326) NOT NULL  ← PostGIS (BR-013)
road_class    enum('nasional','nasional_provinsi','semua') NOT NULL  ← dipilih saat create (BR-020)
created_at    timestamptz DEFAULT now()
updated_at    timestamptz

INDEX: GIST(geometry) untuk spatial query
UNIQUE: (user_id, name)  ← BR-015

⚠️ road_class disimpan per zona. Saat capture, road class efektif = MIN(zones.road_class, batas plan aktif user) — BR-022
```

**`schedules`** — Konfigurasi capture terjadwal
```
id            uuid PK
user_id       uuid FK → users.id
zone_id       uuid FK → zones.id
name          text NOT NULL
cron_expr     text NOT NULL       ← cron expression, e.g. "0 7 * * *"
status        enum('active','paused','deleted') DEFAULT 'active'
created_at    timestamptz DEFAULT now()
updated_at    timestamptz

⚠️ Count active schedules: WHERE user_id = ? AND status = 'active' (BR-005)
```

**`captures`** — Rekaman hasil capture
```
id            uuid PK
user_id       uuid FK → users.id
zone_id       uuid FK → zones.id
schedule_id   uuid FK → schedules.id  ← NULL jika manual capture
status        enum('pending','processing','done','failed','skipped_limit') NOT NULL
file_path     text                    ← R2 path, NULL jika gagal (BR-011)
file_size     bigint                  ← bytes
error_message text                    ← NULL jika sukses
style_used    jsonb                   ← snapshot style yang dipakai capture ini: { presetId, title, showTimestamp } (BR-023, hanya untuk histori — bukan profil tersimpan)
created_at    timestamptz DEFAULT now()
completed_at  timestamptz

INDEX: (user_id, created_at DESC) untuk history query
INDEX: (user_id, created_at::date) untuk daily limit check (BR-006)
```

**`branding_configs`** — Konfigurasi watermark per user
```
id            uuid PK
user_id       uuid FK → users.id UNIQUE
company_name  text
logo_path     text   ← R2 path logo
created_at    timestamptz DEFAULT now()
updated_at    timestamptz
```

---

## API Contract

### Response Format
```json
// Sukses
{ "success": true, "data": { ... } }

// Sukses + pagination
{ "success": true, "data": [...], "meta": { "total": 100, "page": 1, "limit": 20, "total_pages": 5 } }

// Error
{ "success": false, "error": { "code": "PLAN_LIMIT_EXCEEDED", "message": "Anda telah mencapai batas 10 captures hari ini.", "details": {} } }
```

### Error Codes
| Code | HTTP | When |
|------|------|------|
| `UNAUTHORIZED` | 401 | JWT tidak valid atau expired |
| `FORBIDDEN` | 403 | Plan tidak support road class yang diminta (BR-001..003) |
| `ROAD_CLASS_NOT_ALLOWED` | 403 | Road class yang dipilih saat create zona melebihi batas plan (BR-021) |
| `NOT_FOUND` | 404 | Zone / Schedule / Capture tidak ditemukan |
| `VALIDATION_ERROR` | 422 | Input tidak valid (field, format) |
| `PLAN_LIMIT_EXCEEDED` | 429 | Daily capture limit plan aktif tercapai (BR-006) |
| `SCHEDULE_LIMIT_EXCEEDED` | 422 | Max active schedules plan aktif tercapai (BR-005) |
| `ZONE_NAME_TAKEN` | 422 | Nama zone sudah digunakan user ini (BR-015) |
| `CAPTURE_FAILED` | 500 | Playwright render error atau R2 upload error |

### Endpoints Overview
```
POST   /auth/register         POST   /auth/login
POST   /auth/logout           GET    /auth/me

GET    /zones                 POST   /zones
GET    /zones/:id             PATCH  /zones/:id        DELETE /zones/:id

GET    /schedules             POST   /schedules
GET    /schedules/:id         PATCH  /schedules/:id    DELETE /schedules/:id
POST   /schedules/:id/pause   POST   /schedules/:id/resume

GET    /captures              POST   /captures/manual
GET    /captures/:id          GET    /captures/:id/download

GET    /traffic/preview       ← proxy HERE Traffic Flow, dipakai preview browser (bukan Playwright)

GET    /branding              PUT    /branding
POST   /branding/logo

GET    /usage                 GET    /plans
```

### Key Examples

**`POST /zones`** — Buat zona baru (dipanggil di step 3 — Review & Konfirmasi)
```json
// Request
{
  "name": "Zona Malioboro",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[110.364, -7.792], [110.368, -7.792], [110.368, -7.796], [110.364, -7.796], [110.364, -7.792]]]
  },
  "roadClass": "nasional_provinsi"
}

// Response 201
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Zona Malioboro",
    "geometry": { "type": "Polygon", "coordinates": [[...]] },
    "roadClass": "nasional_provinsi",
    "createdAt": "2026-05-31T07:00:00Z"
  }
}

// Error jika roadClass melebihi plan → 403 ROAD_CLASS_NOT_ALLOWED
{
  "success": false,
  "error": { "code": "ROAD_CLASS_NOT_ALLOWED", "message": "Road class ini memerlukan upgrade plan.", "details": { "requiredPlan": "standard" } }
}
```

**`GET /usage`** — Dashboard summary (dipanggil di halaman dashboard)
```json
// Response 200
{
  "success": true,
  "data": {
    "plan": "free",
    "zonesCount": 3,
    "schedulesActiveCount": 2,
    "capturesToday": 7,
    "capturesLimit": 10,
    "schedulesLimit": 10
  }
}
```

**`POST /captures/manual`** — Trigger capture sekarang
```json
// Request
{
  "zoneId": "uuid",
  "style": {
    "presetId": "default",
    "title": "Zona Malioboro",
    "showTimestamp": true
  }
}

// Response 202 (async, capture diproses di worker)
{
  "success": true,
  "data": {
    "captureId": "uuid",
    "status": "pending",
    "message": "Capture sedang diproses."
  }
}

// Error jika limit tercapai → 429 PLAN_LIMIT_EXCEEDED
```

**`GET /traffic/preview`** — Preview traffic ringan di browser (dipanggil dari Step 2 stepper, klien-side saja)
```json
// Request (query params)
// GET /traffic/preview?bbox=110.360,-7.800,110.370,-7.790&roadClass=nasional_provinsi

// Response 200 — GeoJSON segments dengan warna sesuai traffic state (BR-017)
{
  "success": true,
  "data": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": { "type": "LineString", "coordinates": [[110.365, -7.795], [110.366, -7.794]] },
        "properties": { "trafficState": "congested", "color": "#EF4444" }
      }
    ]
  }
}

// Digunakan bersama Leaflet basemap OSM untuk render preview instan tanpa memanggil Playwright
```

**`POST /schedules`** — Buat schedule baru
```json
// Request
{
  "zone_id": "uuid",
  "name": "Pantau Pagi Malioboro",
  "cron_expr": "0 7 * * *"
}

// Response 201
{
  "success": true,
  "data": {
    "id": "uuid",
    "zone_id": "uuid",
    "name": "Pantau Pagi Malioboro",
    "cron_expr": "0 7 * * *",
    "status": "active",
    "created_at": "2026-05-31T07:00:00Z"
  }
}
```
