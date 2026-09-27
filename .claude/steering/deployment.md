# deployment.md — Docker & Deployment

> Baca saat: setup environment lokal, menambah service baru, atau menyiapkan deployment produksi.

---

## Philosophy

Semua service (API, worker, web, database, queue) berjalan via **Docker Compose**. Tujuannya:
- Satu command (`docker compose up`) untuk menjalankan seluruh stack — tidak perlu install PostgreSQL/RabbitMQ/Node manual di mesin lokal
- Environment lokal dan produksi identik — mengurangi bug "works on my machine"
- Onboarding developer baru cepat

---

## Services

| Service | Image / Build | Port | Deskripsi |
|---------|---------------|------|-----------|
| `postgres` | `postgis/postgis:16-3.4` | 5432 | PostgreSQL dengan PostGIS extension pre-installed |
| `rabbitmq` | `rabbitmq:3-management` | 5672, 15672 | Queue + management UI di :15672 |
| `api` | Build dari `api/Dockerfile.dev` | 8080 | Express server, hot reload via `tsx watch` |
| `worker` | Build dari `api/Dockerfile.dev` (command berbeda) | — | Capture worker, consume RabbitMQ |
| `web` | Build dari `web/Dockerfile.dev` | 3000 | Next.js dev server |

---

## docker-compose.yml (Local Development)

```yaml
version: '3.9'

services:
  postgres:
    image: postgis/postgis:16-3.4
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:3-management
    restart: unless-stopped
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "check_port_connectivity"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: ./api
      dockerfile: Dockerfile.dev
    restart: unless-stopped
    ports:
      - "8080:8080"
    env_file:
      - ./api/.env
    volumes:
      - ./api:/app
      - /app/node_modules
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    command: npm run dev

  worker:
    build:
      context: ./api
      dockerfile: Dockerfile.dev
    restart: unless-stopped
    env_file:
      - ./api/.env
    volumes:
      - ./api:/app
      - /app/node_modules
    depends_on:
      postgres:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    command: npm run worker

  web:
    build:
      context: ./web
      dockerfile: Dockerfile.dev
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - ./web/.env.local
    volumes:
      - ./web:/app
      - /app/node_modules
      - /app/.next
    depends_on:
      - api
    command: npm run dev

volumes:
  postgres_data:
```

---

## Dockerfile.dev (Backend — Hot Reload)

```dockerfile
# api/Dockerfile.dev
FROM node:20-alpine

WORKDIR /app

# Playwright butuh dependency Chromium
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 8080
CMD ["npm", "run", "dev"]
```

## Dockerfile (Backend — Production, Multi-stage)

```dockerfile
# api/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle ./drizzle
COPY package.json ./

EXPOSE 8080
CMD ["node", "dist/server.js"]
```

## Dockerfile (Frontend — Production)

```dockerfile
# web/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
```

*Catatan: `web/next.config.ts` perlu `output: 'standalone'` agar build production ringkas.*

---

## docker-compose.prod.yml (Production Override)

```yaml
version: '3.9'

services:
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    volumes: []          # tidak mount source code di production
    command: node dist/src/server.js
    restart: always

  worker:
    build:
      context: ./api
      dockerfile: Dockerfile
    volumes: []
    command: node dist/src/workers/index.js
    restart: always

  web:
    build:
      context: ./web
      dockerfile: Dockerfile
    volumes: []
    restart: always

  # postgres & rabbitmq: gunakan managed service di production (rekomendasi)
  # jika self-host, tambahkan restart: always dan volume backup strategy
```

Deploy command:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## Environment Variables per Service

Setiap service membaca env dari file `.env` masing-masing (`api/.env`, `web/.env.local`), di-mount via `env_file` di `docker-compose.yml`. Untuk variabel yang perlu dibagi ke semua service (jarang), gunakan `.env` di root dan referensikan di `docker-compose.yml` dengan `${VAR_NAME}`.

Lihat `api/.env.example` dan `web/.env.example` untuk daftar lengkap variabel.

---

## Development Workflow dengan Docker

```bash
# Pertama kali setup
cp api/.env.example api/.env      # isi nilai .env
cp web/.env.example web/.env.local

# Jalankan semua service
docker compose up

# Jalankan migration Drizzle (di dalam container api)
docker compose exec api npx drizzle-kit migrate

# Lihat log service tertentu
docker compose logs -f api
docker compose logs -f worker

# Masuk ke container untuk debug
docker compose exec api sh

# Restart satu service saja
docker compose restart api

# Stop semua
docker compose down

# Stop + hapus volume (reset database)
docker compose down -v
```

---

## Health Checks & Dependency Order

Startup order dijamin lewat `depends_on` + `condition: service_healthy`:
```
postgres (healthy) ─┐
                     ├─→ api → worker
rabbitmq (healthy) ─┘
                     
api (running) ─→ web
```

---

## CI/CD Notes (Rencana, belum diimplementasi)

- Build image `api` dan `web` di CI, push ke registry (Docker Hub / GHCR)
- Deploy target kandidat: VPS dengan Docker Compose, Railway, atau Fly.io
- Migration Drizzle dijalankan sebagai step terpisah sebelum deploy service baru (`npx drizzle-kit migrate`), bukan otomatis saat container start
- Detail CI/CD pipeline akan didetailkan saat mendekati waktu deploy pertama

---

## Do's and Don'ts

### ✅ Do
- Selalu tambahkan healthcheck untuk service yang jadi dependency (postgres, rabbitmq)
- Gunakan multi-stage build untuk image production (kecilkan ukuran image)
- Mount `node_modules` sebagai anonymous volume di dev agar tidak konflik dengan host
- Pisahkan `docker-compose.yml` (dev) dan `docker-compose.prod.yml` (override production)

### ❌ Don't
- Jangan commit `.env` ke git — hanya `.env.example`
- Jangan mount source code di production (`volumes: []` di prod override)
- Jangan jalankan migration otomatis saat container start di production — jalankan manual sebagai step terpisah
- Jangan gunakan `latest` tag untuk image production — pin versi (`node:20-alpine`, bukan `node:alpine`)
