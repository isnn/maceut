# structure.md — Code Structure & Conventions

> Baca saat: membuat file baru, menentukan lokasi kode, atau perlu memahami pattern yang digunakan.

---

## Folder Structure

### Frontend (`web/`)
```
web/
  src/
    app/
      (public)/             # Unauthenticated routes
        login/
        register/
      (dashboard)/          # Authenticated routes (layout dengan sidebar)
        page.tsx            # Dashboard home — usage summary
        zones/              # Zone list & create
        captures/           # Capture history
        schedules/          # Schedule management
        branding/           # Branding config
        settings/           # Account & plan
    components/
      ui/                   # Base UI wrappers + design token components
                            # Jangan edit langsung — extend via composition
                            # Termasuk: UpgradeModal.tsx (plan tidak cukup), StyleSelector.tsx (dipilih setiap capture/preview, ephemeral)
      shared/               # Cross-feature components (PageHeader, DataTable, EmptyState)
    features/               # Satu folder per fitur domain
      dashboard/
        components/         # DashboardSummaryCard, ZoneCTACard
        api.ts               # fetch /usage
      zones/
        components/
          ZoneCard.tsx
          MapCanvas.tsx               # Wrapper react-leaflet + OSM tile + dark filter (shared, ADR-010b/c)
          ZoneMapEditor.tsx           # Polygon drawing di atas MapCanvas (Step 1)
          TrafficPreviewPanel.tsx     # Preview traffic ringan (MapCanvas + traffic overlay + StyleSelector, Step 2)
          ZoneCreateStepper.tsx       # Shell stepper 3-step + progress indicator
          steps/
            StepAreaSelect.tsx        # Step 1: nama zona + gambar polygon
            StepRoadClass.tsx         # Step 2: pilih road class + tombol Preview
            StepReview.tsx            # Step 3: review & submit
        hooks/              # useZones, useZoneCreate, useTrafficPreview
        api.ts              # fetch /zones + /traffic/preview
        types.ts            # Zone, ZoneGeometry, RoadClass, StylePreset, CaptureStyleInput
      captures/
        components/         # CaptureCard, CaptureViewer, CaptureStatusBadge
        hooks/              # useCaptures, useCapturePolling
        api.ts
        types.ts
      schedules/
        components/         # ScheduleCard, ScheduleForm, CronInput
        hooks/              # useSchedules
        api.ts
        types.ts
      branding/
        components/         # BrandingForm, LogoUploader, CapturePreview
        hooks/              # useBranding
        api.ts
        types.ts
      auth/
        components/         # LoginForm, RegisterForm
        hooks/              # useAuth, useCurrentUser
        api.ts
        types.ts
    lib/
      api-client.ts         # Axios/fetch wrapper dengan auth header & error parser
      utils.ts              # Helper functions (date format, file size, dll)
      constants.ts          # APP constants (PLAN_LIMITS, TRAFFIC_COLORS, dll)
    types/
      api.ts                # Global API response types { success, data, error, meta }

  public/                   # Static assets
  tailwind.config.ts
  next.config.ts
```

### Backend (`api/`)
```
api/
  src/
    routes/                 # Definisi endpoint + Swagger JSDoc annotation
      auth.routes.ts
      zone.routes.ts
      schedule.routes.ts
      capture.routes.ts
      branding.routes.ts
      usage.routes.ts
      traffic.routes.ts       # GET /traffic/preview
      index.ts               # Gabungkan semua route ke satu router utama
    controllers/             # Terima request, panggil service, return response (thin)
      auth.controller.ts     + auth.controller.test.ts
      zone.controller.ts     + zone.controller.test.ts
      schedule.controller.ts + schedule.controller.test.ts
      capture.controller.ts  + capture.controller.test.ts
      branding.controller.ts + branding.controller.test.ts
      usage.controller.ts    + usage.controller.test.ts
      traffic.controller.ts  + traffic.controller.test.ts
    services/                # Business logic — enforce semua BR di sini
      auth.service.ts
      zone.service.ts
      schedule.service.ts
      capture.service.ts
      branding.service.ts
      plan.service.ts        # Enforce BR-001..007
    repositories/            # Akses data — Drizzle query builder + raw SQL untuk PostGIS
      user.repository.ts
      zone.repository.ts
      schedule.repository.ts
      capture.repository.ts
      branding.repository.ts
    middlewares/
      auth.middleware.ts     # JWT parse dari cookie + inject req.userId
      plan-check.middleware.ts # Inject req.plan
      rate-limit.middleware.ts # IP-based rate limiter
      error-handler.middleware.ts # Central error → { success:false, error } formatter
    workers/
      capture.worker.ts      # RabbitMQ consumer — orchestrate capture job
      index.ts                # Entry point proses worker (dijalankan terpisah dari api)
    schedulers/
      cron-scheduler.ts       # Load schedules dari DB, run node-cron, publish ke RabbitMQ
    lib/
      drizzle-client.ts        # Drizzle DB connection
      rabbitmq-client.ts       # RabbitMQ connection + channel
      r2-client.ts              # Cloudflare R2 S3-compatible client
      playwright-client.ts      # Playwright browser instance management — screenshot internal render page
      here-traffic-client.ts    # HERE Traffic Flow API client (data only, bukan tile/basemap — ADR-010)
      swagger.ts                 # swagger-jsdoc config + setup
    config/
      env.ts                   # Load + validasi .env via zod
    types/
      express.d.ts              # Extend Express Request type (req.userId, req.plan)
      api.ts                     # SuccessResponse<T>, ErrorResponse types
    app.ts                       # Setup Express app, middleware, routes (tanpa listen)
    server.ts                    # Entry point: app.listen()
  drizzle/
    schema.ts                    # Definisi semua tabel (Drizzle)
    migrations/                   # Auto-generated oleh drizzle-kit generate
      0000_init.sql
      0001_add_postgis.sql
  drizzle.config.ts
  .env.example
  .env                            # gitignored
  package.json
  tsconfig.json
  Dockerfile                      # Production build (multi-stage)
  Dockerfile.dev                  # Development (hot reload via tsx watch)
```

### Docker (Root)
```
maceut/
  docker-compose.yml           # Local dev — semua service (db, rabbitmq, api, worker, web)
  docker-compose.prod.yml      # Override untuk production (image dari registry, tanpa volume mount source)
  .env                         # Shared env untuk docker-compose (gitignored)
  .env.example
```

---

## Naming Conventions

| What | Convention | Example |
|------|-----------|---------|
| Backend TS file | kebab-case | `zone.repository.ts`, `plan.service.ts` |
| Backend class / interface | PascalCase | `class ZoneService`, `interface CreateZoneInput` |
| Backend function / variable | camelCase | `async function createZone(...)` |
| Backend constant | SCREAMING_SNAKE | `const MAX_LOGO_SIZE_MB = 2` |
| Next.js component file | PascalCase | `ZoneCard.tsx` |
| Next.js hook | camelCase + use prefix | `useZones.ts` |
| Next.js non-component | kebab-case | `api-client.ts` |
| TypeScript type/interface | PascalCase | `type CaptureStatus` |
| DB table (Drizzle) | snake_case plural | `captures`, `user_plans` |
| DB column | snake_case | `created_at`, `file_path` |
| Drizzle schema field | camelCase (maps ke snake_case column) | `userId` → `user_id` |
| API endpoint path | kebab-case | `/captures/manual` |
| Env variable | SCREAMING_SNAKE | `HERE_API_KEY`, `R2_BUCKET_NAME` |
| Config object field | camelCase | `config.hereApiKey` |
| Test file | same name + `.test.ts` suffix | `zone.controller.test.ts` |
| RabbitMQ queue | kebab-case | `capture-jobs`, `capture-dead-letter` |
| R2 file path | `captures/{user_id}/{YYYY}/{MM}/{id}.png` | `captures/abc/2026/05/xyz.png` |
| Docker service name | kebab-case | `api`, `worker`, `web`, `postgres`, `rabbitmq` |

---

## Key Code Patterns

### Controller Pattern (Express)
```ts
// ✅ CORRECT — controller thin, tidak ada business logic
// src/controllers/zone.controller.ts
import { Request, Response, NextFunction } from 'express'
import * as zoneService from '../services/zone.service'
import { createZoneSchema } from '../schemas/zone.schema'

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createZoneSchema.parse(req.body)   // validasi via zod
    const zone = await zoneService.createZone(req.userId!, input)
    return res.status(201).json({ success: true, data: zone })
  } catch (err) {
    next(err)  // diteruskan ke error-handler.middleware.ts
  }
}

// ❌ WRONG — query DB langsung di controller
export async function create(req: Request, res: Response) {
  const zone = await db.insert(zones).values(req.body)  // jangan — harus lewat service
  res.json(zone)
}
```

### Route + Swagger Registration
```ts
// src/routes/zone.routes.ts
import { Router } from 'express'
import * as zoneController from '../controllers/zone.controller'
import { authMiddleware } from '../middlewares/auth.middleware'

const router = Router()

/**
 * @swagger
 * /zones:
 *   post:
 *     summary: Buat zona baru
 *     tags: [Zones]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       201: { description: Zona berhasil dibuat }
 */
router.post('/zones', authMiddleware, zoneController.create)

export default router
```

### Repository Pattern (Drizzle)
```ts
// ✅ CORRECT — repository sebagai kumpulan fungsi, bukan class/interface
// src/repositories/zone.repository.ts
import { db } from '../lib/drizzle-client'
import { zones } from '../../drizzle/schema'
import { eq } from 'drizzle-orm'

export async function findByUserId(userId: string) {
  return db.select().from(zones).where(eq(zones.userId, userId))
}

export async function deleteById(id: string) {
  return db.delete(zones).where(eq(zones.id, id))
}

// ❌ WRONG — query langsung di service
// src/services/zone.service.ts
export async function createZone(...) {
  await db.insert(zones).values(...)  // jangan — harus lewat repository
}
```

### Plan Limit Enforcement (Service Layer)
```ts
// ✅ CORRECT — enforce di service layer (BR-007)
// src/services/capture.service.ts
import * as captureRepo from '../repositories/capture.repository'
import * as planService from './plan.service'
import { PlanLimitExceededError } from '../errors'

export async function triggerManual(userId: string, zoneId: string) {
  const { current, limit, exceeded } = await planService.checkDailyCaptureLimit(userId) // limit varies by plan (BR-006)
  if (exceeded) {
    throw new PlanLimitExceededError()  // ditangkap error-handler → 429 PLAN_LIMIT_EXCEEDED
  }
  // ... lanjut buat capture record
}

// ❌ WRONG — enforce di controller
// src/controllers/capture.controller.ts
export async function manual(req: Request, res: Response) {
  const count = await db.select().from(captures)...  // jangan enforce limit di controller
}
```

### Central Error Handler
```ts
// src/middlewares/error-handler.middleware.ts
import { Request, Response, NextFunction } from 'express'
import { AppError } from '../errors'

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    })
  }
  console.error(err)
  return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan.' } })
}
```

### API Call dari Frontend
```typescript
// ✅ CORRECT — semua API call via api-client, error di-parse terpusat
// features/zones/api.ts
import { apiClient } from '@/lib/api-client'
export const createZone = (payload: CreateZoneInput) =>
  apiClient.post<Zone>('/zones', payload)

// ❌ WRONG — fetch langsung di component
const res = await fetch('/api/zones', { method: 'POST', body: ... }) // jangan
```

### PostGIS Zone Query (Drizzle raw)
```ts
// ✅ CORRECT — gunakan sql`` template + ST_AsGeoJSON untuk serialize geometry
import { sql } from 'drizzle-orm'

const result = await db.execute(sql`
  SELECT id, name, ST_AsGeoJSON(geometry)::json AS geometry, created_at
  FROM zones
  WHERE user_id = ${userId}
`)

// ✅ CORRECT — insert geometry dari GeoJSON
await db.execute(sql`
  INSERT INTO zones (id, user_id, name, geometry)
  VALUES (gen_random_uuid(), ${userId}, ${name}, ST_GeomFromGeoJSON(${JSON.stringify(geojson)}))
`)
```

### Dark Theme — Hanya untuk Capture View
```typescript
// ✅ CORRECT — dark theme di-scope hanya ke map/capture page
// app/(dashboard)/captures/[id]/page.tsx
<div className="bg-gray-950 text-white">  {/* dark hanya di sini */}
  <MapVisualization />
</div>

// ❌ WRONG — global dark mode di layout utama
// app/(dashboard)/layout.tsx
<html className="dark">  {/* jangan — dashboard harus white-first */}
```

---

## Git Branch & PR Naming

```
<type>/<nama-kebab-case>

Types: feat · fix · refactor · docs · test · chore · perf   (sama persis dengan type commit)

Contoh:
feat/schedule-management
feat/capture-pipeline
fix/session-expiry-timezone
refactor/zone-repository
docs/api-contract
chore/db-conventions
```

Daftar type-nya sengaja SAMA dengan type commit di bawah — satu kosakata untuk branch,
PR, dan commit. Menggunakan dua daftar berbeda berarti setiap orang harus mengingat
mana yang berlaku di mana, dan itu biaya tanpa manfaat.

## Git Commit Format

```
<type>(<scope>): short description

Types: feat · fix · refactor · docs · test · chore · perf
Scope: auth · zone · capture · schedule · branding · worker · scheduler · infra · ui

Contoh:
feat(zone): add PostGIS polygon create endpoint
feat(capture): implement Playwright screenshot with branding overlay
fix(scheduler): handle cron job not loading after server restart
chore(infra): add R2 client with presigned URL support
```

Catatan: daftar type COMMIT tetap tujuh. Commit dibaca satu per satu saat menelusuri
riwayat sebuah file, di mana membedakan `docs` dari `refactor` dari `test` memang
berguna. Branch dibaca sebagai daftar. Dua audiens berbeda, dua tingkat kedetailan.
