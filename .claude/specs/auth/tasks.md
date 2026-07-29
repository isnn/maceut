# tasks.md — Auth & Onboarding Implementation

> Update checklist ini saat mengerjakan task.
> Tambahkan catatan di bawah item jika ada keputusan teknis yang dibuat.

---

## Phase 1: Database & Schema

- [ ] **Verifikasi tabel `users`** sudah ada dari spec zone-management
  - [ ] id, email (UNIQUE), password_hash, created_at, updated_at

- [ ] **Verifikasi tabel `user_plans`** sudah ada
  - [ ] Pastikan trigger / default insert plan `free` saat user baru dibuat

---

## Phase 2: Backend / API

> Setiap route wajib: Swagger JSDoc annotation + unit test di `auth.controller.test.ts`
> Config dari `.env` via `src/config/env.ts` (validasi zod) — jangan hardcode secret.

- [ ] **Setup Better Auth** — `src/lib/auth.ts`
  - [ ] Konfigurasi Better Auth dengan adapter PostgreSQL/Drizzle
  - [ ] Set HttpOnly cookie, Secure, SameSite=strict
  - [ ] Set JWT expiry (rekomendasi: 7 hari)

- [ ] **Service: auth.service.ts** — `src/services/auth.service.ts`
  - [ ] `register(input)` — validasi email uniqueness, hash password (`bcrypt`), insert user + user_plan (plan=free)
  - [ ] `login(email, password)` — cari user, compare hash, throw `InvalidCredentialsError` jika salah satu gagal (jangan bedakan pesan)
  - [ ] `getMe(userId)` — return user + plan

- [ ] **Controller + Routes: auth** — `src/controllers/auth.controller.ts`, `src/routes/auth.routes.ts`
  - [ ] `POST /auth/register` — panggil service, set HttpOnly JWT cookie, return 201 (tanpa passwordHash)
  - [ ] `POST /auth/login` — panggil service, set HttpOnly JWT cookie, return 200
  - [ ] `POST /auth/logout` — clear cookie, return 200
  - [ ] `GET /auth/me` — return user data dari `req.userId` + `req.plan` (di-inject middleware)
  - [ ] Swagger JSDoc annotation lengkap per route

- [ ] **Middleware: auth.middleware.ts** — `src/middlewares/auth.middleware.ts`
  - [ ] Parse JWT dari HttpOnly cookie
  - [ ] Inject `req.userId` dan `req.plan`
  - [ ] Return 401 `UNAUTHORIZED` jika cookie tidak ada atau JWT invalid/expired

- [ ] **Route protection** — semua route selain `/auth/*` wajib pakai `authMiddleware`

- [ ] **Swagger setup** — `src/lib/swagger.ts` + `src/app.ts`
  - [ ] Install `swagger-jsdoc` + `swagger-ui-express`
  - [ ] Config dasar: title "Maceut API", version, `components.securitySchemes.cookieAuth`
  - [ ] Mount `app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))`
  - [ ] Aktif hanya jika `SWAGGER_ENABLED=true` di .env

- [ ] **Unit Test: auth.controller.test.ts** — `src/controllers/auth.controller.test.ts`
  - [ ] `POST /auth/register` success → 201 + cookie set
  - [ ] `POST /auth/register` email duplicate → 422 EMAIL_ALREADY_TAKEN
  - [ ] `POST /auth/register` invalid email format → 422
  - [ ] `POST /auth/login` success → 200 + cookie set
  - [ ] `POST /auth/login` wrong password → 401 INVALID_CREDENTIALS
  - [ ] `POST /auth/login` email not found → 401 INVALID_CREDENTIALS (sama, tidak boleh beda)
  - [ ] `POST /auth/logout` → 200 + cookie cleared
  - [ ] `GET /auth/me` authenticated → 200 + user data
  - [ ] `GET /auth/me` unauthenticated → 401

---

## Phase 3: Frontend

- [ ] **Login Page** — `app/(public)/login/page.tsx`
  - [ ] Form: email, password
  - [ ] Form-level error untuk `INVALID_CREDENTIALS` (bukan inline per field)
  - [ ] Loading state saat submit
  - [ ] Redirect ke dashboard (atau `?redirect=` param) setelah berhasil
  - [ ] Redirect ke `/zones` jika sudah login

- [ ] **Register Page** — `app/(public)/register/page.tsx`
  - [ ] Form: email, password, konfirmasi password
  - [ ] Inline validation: email format, password min 8 char, konfirmasi cocok (client-side)
  - [ ] Inline error untuk `EMAIL_ALREADY_TAKEN`
  - [ ] Disable submit button setelah klik pertama
  - [ ] Auto-redirect ke `/zones` setelah berhasil

- [ ] **Auth Hook** — `features/auth/hooks/useAuth.ts`
  - [ ] `useCurrentUser()` — fetch `GET /auth/me`, cache di state
  - [ ] `useLogout()` — hit `POST /auth/logout`, clear state, redirect ke login

- [ ] **Route Guard** — `app/(dashboard)/layout.tsx`
  - [ ] Cek session via `GET /auth/me` (server-side preferred)
  - [ ] Redirect ke `/login` jika tidak ada session
  - [ ] Inject user data ke layout context

- [ ] **Logout Button** — di sidebar / header layout dashboard
  - [ ] Tampilkan email user yang login
  - [ ] Konfirmasi dialog sebelum logout (opsional, bisa langsung)

---

## Phase 4: Integration & Edge Cases

- [ ] Test: register → auto login → redirect ke /zones ✓
- [ ] Test: login dengan email tidak terdaftar → INVALID_CREDENTIALS (bukan email not found)
- [ ] Test: login dengan password salah → INVALID_CREDENTIALS
- [ ] Test: akses `/zones` tanpa login → redirect ke `/login?redirect=/zones`
- [ ] Test: akses `/login` saat sudah login → redirect ke dashboard
- [ ] Test: logout → cookie terhapus → akses dashboard → redirect login

---

## Decisions Made

```
[YYYY-MM-DD] Keputusan: ...
  Alasan: ...
```
