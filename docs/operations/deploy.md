# Deploy: maceut.hokya.dev

Two public hosts, one server, Cloudflare in front.

| Host | Serves | On the server |
|---|---|---|
| `maceut.hokya.dev` | Web app (Next.js, `next start`) | `127.0.0.1:3000` |
| `maceut-api.hokya.dev` | API (Express + Better Auth) | `127.0.0.1:8080` |

Why two hosts and not `maceut.hokya.dev/api`: the API's routes sit at the root (`/zones`,
`/me`, …) and collide with web pages of the same name. Why `maceut-api.` and not
`api.maceut.`: Cloudflare's free certificate covers `*.hokya.dev`, one level deep only;
`api.maceut.hokya.dev` would have no valid HTTPS.

Why not `hokya.dev/maceut`: every link, redirect and asset path in the app is written from
the root (`/login`, `/_next/…`). A sub-path needs `basePath` and a change in every one of
them. Use a (sub)domain.

## 1. DNS and Cloudflare (hokya.dev zone)

1. DNS → add two **A** records to the server IP, **Proxied** (orange cloud): `maceut` and
   `maceut-api`.
2. SSL/TLS → mode **Full (strict)** with an origin certificate on the server, or **Full** if
   the proxy below serves a self-signed one. Never **Flexible**: the cookie is `Secure`.
3. **Check Rules → Redirect Rules, Page Rules and Bulk Redirects** for any rule that
   matches `*hokya.dev/*` or `/login`. A rule written for the main site catches the
   subdomain too, and sends `maceut.hokya.dev/login` to `hokya.dev/login`. Scope those rules
   to `hokya.dev` exactly (hostname equals), or exclude `maceut.hokya.dev` and
   `maceut-api.hokya.dev`.

## 2. Reverse proxy on the server

Anything that maps hostnames to the two local ports. nginx example:

```nginx
server {
  listen 443 ssl;
  server_name maceut.hokya.dev;
  # ssl_certificate / ssl_certificate_key: Cloudflare origin certificate
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}

server {
  listen 443 ssl;
  server_name maceut-api.hokya.dev;
  client_max_body_size 20m;   # zone imports (GeoJSON / SHP)
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

The proxy must **not** rewrite `Location` headers to another host.

## 3. Environment

```bash
cp .env.example .env                                   # DB_NAME / DB_USER / DB_PASSWORD for the postgres container
cp api/.env.production.example api/.env                # fill every <...>
cp web/.env.production.example web/.env.production
```

`DB_NAME`, `DB_USER`, `DB_PASSWORD` must match in `.env` and `api/.env`.

`NEXT_PUBLIC_*` in `web/.env.production` are compiled into the browser bundle: change one,
rebuild `web`.

## 4. Build, migrate, start

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build postgres rabbitmq

# Migrations need drizzle-kit, which the production image does not carry: run them once
# from the dev image against the same database.
docker compose run --rm --no-deps api npx drizzle-kit migrate

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The production overrides (`docker-compose.prod.yml`) run the built code, not the source
tree, bind web and API to `127.0.0.1` only, and keep Postgres and RabbitMQ off the
internet.

## 5. Check

- `https://maceut.hokya.dev/login` loads and stays on `maceut.hokya.dev` after clicking
  Log in.
- DevTools → Network: login calls go to `https://maceut-api.hokya.dev/api/auth/...` and
  return 200, with a `Set-Cookie` that is `Secure`.
- The page source has no `next-devtools` (a dev server in production shows it).
- `https://maceut-api.hokya.dev/health` returns `{ success: true, ... }`.
- A verification email links to `https://maceut.hokya.dev/...`.

Retention: before setting `RETENTION_SWEEPER_ENABLED=true`, run the dry run from the dev
image the same way as migrations: `docker compose run --rm --no-deps api npm run retention:dry-run`.

## Moving to maceut.com later

Hosts `maceut.com` and `api.maceut.com` (one level under maceut.com, so its certificate
covers it). Change `APP_BASE_URL`, `FRONTEND_URL`, `COOKIE_DOMAIN` in `api/.env`, and both
URLs in `web/.env.production`; rebuild. Existing sessions end (the cookie belongs to the
old host); users log in again. Keep the old hosts redirecting to the new ones.
