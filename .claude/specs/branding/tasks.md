# tasks.md — Branding Configuration Implementation

> Update checklist ini saat mengerjakan task.
> Tambahkan catatan di bawah item jika ada keputusan teknis yang dibuat.

---

## Phase 1: Database & Schema

- [ ] **Verifikasi tabel `branding_configs`** sudah ada dari spec zone-management
  - [ ] id, user_id (FK, UNIQUE), company_name, logo_path, created_at, updated_at
  - [ ] Pastikan row auto-created saat user register (kosong), atau di-upsert saat pertama kali save

---

## Phase 2: Backend / API

> Setiap route wajib: Swagger JSDoc annotation + unit test di file `*.controller.test.ts`
> Jalankan `pnpm test` sebelum tandai task selesai.

- [ ] **Types** — `src/types/branding.ts`
  - [ ] `BrandingConfig` interface
  - [ ] Zod schema `updateBrandingSchema`

- [ ] **Repository: branding.repository.ts** — `src/repositories/branding.repository.ts`
  - [ ] `findByUserId` — return `undefined` (bukan throw) jika belum ada konfigurasi
  - [ ] `upsert` — Drizzle `.insert().onConflictDoUpdate()` pada `userId`

- [ ] **Lib: r2-client.ts — extend** — `src/lib/r2-client.ts`
  - [ ] `uploadLogo(userId: string, data: Buffer, contentType: string): Promise<string>` (return path)
  - [ ] Path format: `logos/{user_id}/{uuid}.{ext}`
  - [ ] `deleteFile(path: string): Promise<void>` — untuk hapus logo lama

- [ ] **Service: branding.service.ts** — `src/services/branding.service.ts`
  - [ ] `getBranding(userId)` — return config atau object kosong (tidak error)
  - [ ] `updateBranding(userId, companyName)` — upsert
  - [ ] `uploadLogo(userId, fileBuffer, contentType)`:
    - [ ] Validasi content type (PNG/JPG/SVG only)
    - [ ] Validasi ukuran ≤ 2MB
    - [ ] Upload ke R2
    - [ ] Hapus logo lama dari R2 jika ada
    - [ ] Update `logoPath` di DB
  - [ ] `deleteLogo(userId)` — hapus dari R2 + set `logoPath` = NULL

- [ ] **Controller + Routes: branding** — `src/controllers/branding.controller.ts`, `src/routes/branding.routes.ts`
  - [ ] `GET /branding` — return current config
  - [ ] `PUT /branding` — update companyName
  - [ ] `POST /branding/logo` — upload logo (multipart/form-data via `multer`)
  - [ ] `DELETE /branding/logo` — hapus logo
  - [ ] Swagger JSDoc annotation lengkap per route

- [ ] **Middleware: multer config** — `src/middlewares/upload.middleware.ts`
  - [ ] Gunakan `multer.memoryStorage()` (bukan disk) agar buffer langsung diteruskan ke R2
  - [ ] Limit file size 2MB di level multer sebagai lapis pertama

---

## Phase 3: Frontend

- [ ] **Branding Page** — `app/(dashboard)/branding/page.tsx`
  - [ ] Fetch `GET /branding` saat load
  - [ ] Section nama perusahaan: input field + save button
  - [ ] Section logo: drag-and-drop upload area + preview logo saat ini + tombol hapus
  - [ ] Section preview: `BrandingPreviewCard` component

- [ ] **Logo Uploader** — `features/branding/components/LogoUploader.tsx`
  - [ ] Drag-and-drop area (gunakan native HTML atau Base UI)
  - [ ] Validasi client-side: format (PNG/JPG/SVG) + ukuran (≤ 2MB) sebelum upload
  - [ ] Progress indicator saat upload
  - [ ] Preview logo setelah upload berhasil
  - [ ] Tombol "Hapus Logo" dengan konfirmasi

- [ ] **Branding Preview Card** — `features/branding/components/BrandingPreviewCard.tsx`
  - [ ] Dark background card mensimulasikan area peta
  - [ ] Layout overlay: logo + company_name (kiri bawah), "Zona Contoh · 31 Mei 2026 07:00 WIB" (kiri bawah), legend mock (kanan bawah)
  - [ ] Update real-time via props dari form state
  - [ ] Gunakan placeholder jika logo atau nama belum diisi

- [ ] **Branding Hook** — `features/branding/hooks/useBranding.ts`
  - [ ] `useBranding()` — fetch + cache config
  - [ ] `useUpdateBranding()` — PUT request
  - [ ] `useUploadLogo()` — POST multipart request

---

## Phase 4: Integration & Edge Cases

- [ ] Test: upload PNG → logo muncul di preview ✓
- [ ] Test: upload file > 2MB → ditolak client-side
- [ ] Test: upload format tidak valid (PDF) → ditolak client-side
- [ ] Test: ganti logo → logo lama terhapus dari R2
- [ ] Test: hapus logo → capture berjalan tanpa logo (overlay kosong di posisi logo)
- [ ] Test: nama perusahaan kosong → capture tetap berjalan, nama tidak muncul di overlay
- [ ] Test: nama perusahaan 60 karakter → berhasil save
- [ ] Test: nama perusahaan 61 karakter → inline error

---

## Decisions Made

```
[YYYY-MM-DD] Keputusan: ...
  Alasan: ...
```
