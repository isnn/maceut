# Deploy

Two public hosts, one server, Cloudflare in front.

| Host | Serves | Container port |
|---|---|---|
| `maceut.com` | Web app (Next.js, `next start`) | web `3000` |
| `api.maceut.com` | API (Express + Better Auth) | api `8080` |

Fallback while `maceut.com` is not ready: `maceut.hokya.dev` + `maceut-api.hokya.dev`
(not `api.maceut.hokya.dev`: Cloudflare's free certificate covers one level under the
zone only). Nothing in the code changes between the two, only env values; see
[Moving domains](#moving-domains).

Why two hosts and not `maceut.com/api`: the API's routes sit at the root (`/zones`, `/me`,
…) and collide with web pages of the same name. Why not a sub-path (`hokya.dev/maceut`):
every link, redirect and asset path is written from the root.

## 0. Same server as dev?

The dev stack (`docker-compose.yml` alone) uses project name `maceut`. A production stack
started from the same checkout with the same name **replaces the dev containers and takes
over the dev database volume**. So:

- Check out production separately: `git clone … /srv/maceut && cd /srv/maceut && git checkout <tag>`.
- In `/srv/maceut/.env`: `COMPOSE_PROJECT_NAME=maceut-prod`.
- Stop the dev stack while prod runs, or keep its memory limits in mind (below).

## 1. DNS and Cloudflare

1. DNS: **A** records for both hosts → the server IP, **Proxied** (orange cloud).
2. SSL/TLS → **Full (strict)**. Edge Certificates → **Always Use HTTPS** on, **HSTS** on
   (max-age 6 months, include subdomains only once every subdomain serves HTTPS).
3. Check **Redirect Rules, Page Rules, Bulk Redirects** for any rule matching the parent
   zone broadly (`*hokya.dev/*`, `/login`). A rule written for the main site catches the
   subdomain too. Scope those rules to the exact hostname.

## 2. Reverse proxy: the host's Traefik

This server already runs Traefik (docker provider, network `proxy`, Let's Encrypt resolver
`myresolver`). `docker-compose.traefik.yml` adds the labels; set the hosts in `.env`:

```bash
WEB_HOST=maceut.com
API_HOST=api.maceut.com
```

and include the file in every command (alias it):

```bash
alias dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.traefik.yml'
```

If the certificate isn't issued (HTTP challenge blocked by a Cloudflare redirect), grey-cloud
the record until Traefik has it, then switch it back to Proxied.

Without Traefik: any proxy that maps the two hosts to `127.0.0.1:3000` / `127.0.0.1:8080`
(the prod compose binds them to loopback). It must send `X-Forwarded-Proto: https`, allow
20 MB request bodies on the API host (zone imports), and not rewrite `Location` headers.

## 3. Firewall

Docker publishes ports **past ufw**: a `ports: "5432:5432"` line is on the internet whatever
ufw says. Production publishes nothing but loopback; keep it that way.

- 22: from your IP or Tailscale only.
- 80/443: from [Cloudflare's IP ranges](https://www.cloudflare.com/ips/) only. This is what
  makes `CF-Connecting-IP` trustworthy: the sign-in and OTP rate limits key on it
  (`api/src/lib/auth.ts`), and anyone reaching the origin directly could forge it.
- Check: `ss -ltn` shows nothing on `0.0.0.0` except 22/80/443.

## 4. Environment

```bash
cp .env.example .env                                   # DB_*, RABBITMQ_*, WEB_HOST/API_HOST, COMPOSE_PROJECT_NAME
cp api/.env.production.example api/.env                # fill every <...>
cp web/.env.production.example web/.env.production
```

- `DB_NAME`/`DB_USER`/`DB_PASSWORD` must match in `.env` and `api/.env`; so must
  `RABBITMQ_USER`/`RABBITMQ_PASS` and the user:password in `RABBITMQ_URL`.
- New secrets for production, never the dev ones: `JWT_SECRET` (`openssl rand -hex 32`),
  DB and RabbitMQ passwords.
- `NEXT_PUBLIC_*` in `web/.env.production` are compiled into the browser bundle: change
  one, rebuild `web`.

## 5. Build, migrate, start

```bash
dc up -d --build postgres rabbitmq

# Migrations need drizzle-kit, which the production image does not carry: run them once
# from the dev image against the same database.
docker compose run --rm --no-deps api npx drizzle-kit migrate

dc up -d --build
```

Release = a git tag. Deploy: `git fetch --tags && git checkout vX.Y.Z`, migrate, `dc up -d --build`.
Rollback: check out the previous tag and `dc up -d --build` (migrations are additive).

### Memory

Every production service has a ceiling (`docker-compose.prod.yml`), sized for a shared
8 GB host:

| postgres | rabbitmq | api | worker | web |
|---|---|---|---|---|
| 1 GB | 512 MB | 512 MB | 2 GB, 2 CPUs | 768 MB |

An OOM-killed container restarts by itself; an export resumes from its last frame. If
`docker stats` shows the worker living near 2 GB during exports, raise it there first.

## 6. Backups

```bash
crontab -e
30 2 * * * cd /srv/maceut && scripts/backup-db.sh >> /var/log/maceut-backup.log 2>&1
```

Nightly `pg_dump` to `/var/backups/maceut`, 14 days kept. That survives a bad migration or
a `down -v`, not a lost server: copy the folder off the host too (rclone to an R2 bucket).
Restore steps are in the script's header. **Do one test restore before launch.**

## 7. Check

- `https://api.maceut.com/health` → `env: production`, db and queue connected, R2 and HERE configured.
- `https://api.maceut.com/api-docs` → 404 (`SWAGGER_ENABLED=false`).
- `https://maceut.com/login` loads and stays on `maceut.com` after Log in. DevTools →
  Network: login calls go to `https://api.maceut.com/api/auth/...`, 200, `Set-Cookie`
  `Secure; HttpOnly`.
- Page source has no `next-devtools`; response headers include `X-Frame-Options: DENY`
  and `Strict-Transport-Security`.
- A verification email arrives from the verified sender and links to `https://maceut.com`.

Retention: before setting `RETENTION_SWEEPER_ENABLED=true`, run the dry run from the dev
image the same way as migrations: `docker compose run --rm --no-deps api npm run retention:dry-run`.

## 8. Launch checklist

**Infra**
- [ ] DNS proxied, SSL Full (strict), Always Use HTTPS, HSTS
- [ ] No parent-zone redirect rule catches the hosts
- [ ] Firewall: 22 restricted, 80/443 Cloudflare-only, `ss -ltn` clean
- [ ] Separate checkout + `COMPOSE_PROJECT_NAME=maceut-prod` if sharing the dev host

**Config**
- [ ] Fresh `JWT_SECRET`, DB and RabbitMQ passwords; `INTERNAL_EMAILS` set
- [ ] `SWAGGER_ENABLED=false`, `RETENTION_SWEEPER_ENABLED=false`, `MAILTRAP_INBOX_ID` empty
- [ ] R2 bucket private (`R2_PUBLIC_URL` empty), R2 token scoped to that bucket
- [ ] HERE daily budget set in Internal → HERE
- [ ] Sender domain verified in Mailtrap **and** Resend; SPF, DKIM, DMARC published

**Data**
- [ ] Fresh production database (no dev test accounts)
- [ ] Backup cron installed, off-host copy, one restore tested

**Smoke test**
- [ ] Register → code email → verified → onboarding → dashboard
- [ ] Log out / log in; forgot password → code → reset
- [ ] Zone: search, draw, preview, save; manual capture; image in History
- [ ] Studio export PNG / ZIP / video, download
- [ ] Schedule fires at least once
- [ ] Internal: user shows Verified; plan change; HERE usage counts

**Operations**
- [ ] Uptime monitor on `/health` and the home page
- [ ] Watch `dc logs -f api worker` the first day
- [ ] Weekly: HERE usage, disk, backup files

## Moving domains

Change `APP_BASE_URL`, `FRONTEND_URL`, `COOKIE_DOMAIN` in `api/.env`, both URLs in
`web/.env.production`, `WEB_HOST`/`API_HOST` in `.env`, and `EMAIL_FROM` if the sender
domain changes (verify it first); rebuild. Existing sessions end (the cookie belongs to
the old API host); users log in again. Keep the old hosts redirecting to the new ones.
