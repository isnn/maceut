# requirements.md — Internal (Platform Administration)

> Baca saat: implement fitur F-21 (Internal Overview), F-22 (User Role & Plan Management),
> F-23 (System Configuration)
>
> ⚠️ **Status: prototipe frontend.** Ketiga fitur ini sudah ada layarnya di `/internal` dengan
> data mock (localStorage), tapi **belum ada backend sama sekali**. Gate role di frontend adalah
> UI-gating, BUKAN authorization. Lihat "Catatan Keamanan" di bawah.

---

## Konsep Role

`role: 'user' | 'internal'` adalah field **platform-level** di record user — terpisah dari
workspace/team role (`owner`/`editor`/`viewer`) yang masih out of scope MVP.

- `user` — pelanggan biasa, hanya punya akses ke workspace-nya sendiri.
- `internal` — staf Maceut, bisa membuka `/internal` untuk mengelola semua akun & konfigurasi sistem.

**Siapa yang dapat role `internal`** ditentukan lewat env `NEXT_PUBLIC_INTERNAL_EMAILS` di
`web/.env.local` — daftar email dipisah koma. Setiap akun yang emailnya ada di daftar itu otomatis
ber-role `internal` saat dibaca; akun lain bisa dipromosikan lewat `/internal/users` dan tersimpan
di record user.

- Akun yang di-grant lewat env **tidak bisa** diturunkan dari UI (`ROLE_SET_BY_CONFIG`) — sumber
  kebenarannya file env, bukan tabel. Hapus emailnya dari env untuk mencabut akses.
- Daftar kosong = tidak ada yang bisa membuka `/internal`.
- Mengubah env butuh restart dev server / container agar Next memuat ulang `.env.local`.

⚠️ `NEXT_PUBLIC_` berarti nilainya ikut ter-bundle ke browser — daftar ini **bukan rahasia dan bukan
pengaman**, hanya konfigurasi prototipe. Saat `api/` ada, penentuan role pindah ke kolom `users.role`
+ middleware server.

---

## F-21 · Internal Overview

**User Story:**
Sebagai **staf Maceut**, saya ingin **melihat kondisi seluruh platform dalam satu halaman**,
supaya **saya tahu berapa akun yang aktif, sebaran paket, dan apakah ada konfigurasi yang belum diisi**.

**Acceptance Criteria:**
- [ ] Halaman `/internal` hanya bisa diakses akun ber-role `internal`; user biasa di-redirect ke `/dashboard`, yang belum login ke `/login?redirect=`
- [ ] Stat tile: total akun, jumlah user internal, zona yang mengumpulkan, estimasi MRR
- [ ] Plan mix: bar proporsi Free/Standard/Premium + jumlah per tier
- [ ] Daftar 8 signup terbaru dengan plan, role, dan tanggal daftar
- [ ] Banner eksplisit bahwa angka agregat mencakup demo tenant hasil seeding
- [ ] Baris demo tenant diberi chip "demo" agar tidak tertukar dengan akun nyata

**Edge Cases:**
- Baru ada 1 akun (instalasi baru) → seeding demo tenant tetap jalan, akun asli tidak tersentuh
- Jumlah akun 0 pada suatu filter → tampilkan empty state, bukan error

**Out of Scope (fase ini):**
- Grafik tren signup per hari/minggu
- Drill-down ke aktivitas per akun (audit log)
- Ekspor data platform

---

## F-22 · User Role & Plan Management

**User Story:**
Sebagai **staf Maceut**, saya ingin **mengubah paket dan role sebuah akun serta melihat pemakaiannya**,
supaya **saya bisa menangani permintaan upgrade/downgrade dan memberi akses internal tanpa akses database**.

**Acceptance Criteria:**
- [ ] Tabel `/internal/users` menampilkan: person, instansi, plan, role, ringkasan usage, tanggal daftar
- [ ] Pencarian berdasarkan nama/email/instansi + filter plan dan filter role
- [ ] Plan diubah lewat `Select` inline dan langsung tersimpan
- [ ] Role diubah lewat `Select` inline dan langsung tersimpan
- [ ] Menurunkan plan memunculkan konfirmasi berisi daftar kuota yang akan terlampaui
- [ ] Drawer usage per akun: zona, capture hari ini, jendela aktif, storage + atribut paket
- [ ] Usage akun yang sedang login diambil live; akun demo memakai snapshot statis dan ditandai

**Business Rules:**
- BR-024: User tidak bisa mengubah role dirinya sendiri (`CANNOT_CHANGE_OWN_ROLE`) — mencegah mengunci diri sendiri keluar.
- BR-027: Akun yang di-grant lewat `NEXT_PUBLIC_INTERNAL_EMAILS` tidak bisa diubah rolenya dari UI (`ROLE_SET_BY_CONFIG`). Konfigurasi menang atas tabel, supaya UI tidak pernah bertentangan dengan file env.
- BR-025: Akun `internal` terakhir tidak boleh diturunkan ke `user` (`LAST_INTERNAL`) — selalu harus ada minimal satu staf yang bisa masuk.
- Kedua aturan di atas di-enforce di **service layer** (mengikuti BR-007), bukan di halaman. Kontrol yang di-disable di UI hanya lapis kedua.

**Edge Cases:**
- Dua tab membuka halaman yang sama lalu sama-sama menurunkan role internal terakhir → request kedua ditolak `LAST_INTERNAL`
- Akun dihapus/hilang saat aksi berjalan → `NOT_FOUND`, tabel di-refetch
- Menurunkan plan akun yang zonanya melebihi kuota baru → zona lama tetap ada, hanya kuota yang mengikat aksi berikutnya (konsisten dengan BR-022)

**Out of Scope (fase ini):**
- Suspend / hapus akun
- Impersonate user untuk keperluan support
- Mengubah nama/email akun dari sisi internal

---

## F-23 · System Configuration

**User Story:**
Sebagai **staf Maceut**, saya ingin **melihat dan memutar (rotate) konfigurasi sistem seperti HERE API key**,
supaya **saya bisa mengganti kredensial tanpa menyunting file `.env` di server**.

**Acceptance Criteria:**
- [ ] Halaman `/internal/config` mengelompokkan variabel sesuai grup di `api/.env.example`
- [ ] Setiap baris menampilkan nama variabel (persis nama env-nya), label, bantuan singkat, dan badge "restart required" bila perlu
- [ ] Nilai non-secret bisa diedit; commit terjadi saat blur, bukan tiap ketikan
- [ ] Secret ditampilkan sebagai `••••••••last4` + status Set/Not set + kapan & oleh siapa terakhir diputar
- [ ] Secret **tidak pernah** bisa dibaca kembali — dialog rotate hanya menerima nilai baru
- [ ] `JWT_SECRET` memberi peringatan eksplisit bahwa rotate akan mengeluarkan semua user dari sesinya
- [ ] Grup infrastruktur (server, database, RabbitMQ, CORS) tampil **read-only** dengan penjelasan bahwa nilainya diset saat deploy
- [ ] Banner peringatan bila masih ada secret yang belum diisi

**Business Rules:**
- BR-026: Secret bersifat write-only. Yang boleh disimpan/dikembalikan API hanya `{ isSet, last4, updatedAt, updatedBy }` — nilai aslinya tidak pernah dikirim ke browser. `HERE_API_KEY` khususnya wajib tetap server-side (ADR-010, konsisten dengan proxy `GET /traffic/preview`).

**Edge Cases:**
- Secret belum pernah diisi → status "Not set", capture/upload memang akan gagal dan itu ditampilkan sebagai peringatan
- Nilai numerik diisi non-angka → dikonversi lewat `Number()`, validasi ketat menyusul saat backend ada
- Variabel infrastruktur → tidak punya aksi rotate sama sekali, bukan sekadar disabled

**Out of Scope (fase ini):**
- Riwayat perubahan konfigurasi / audit log
- Validasi kredensial ke penyedia (test HERE key, test koneksi R2)
- Kuota & pemakaian HERE API
- Reload konfigurasi tanpa restart service

---

## Catatan Keamanan (wajib dibaca sebelum backend dibangun)

1. **Gate frontend bukan authorization.** `role` disimpan di localStorage pada prototipe ini; siapa pun
   bisa mengubahnya lewat devtools. Saat `api/` dibangun, role wajib divalidasi di auth middleware dan
   setiap endpoint `/internal/*` harus mengecek ulang di server.
2. **Konfigurasi lewat UI belum punya keputusan arsitektur.** Saat ini config dibaca dari `.env` waktu
   container start (`env_file` di docker-compose.yml). Mengedit lewat UI berarti memilih antara override
   di database yang menimpa env, atau UI read-only. Ini perlu ADR di `tech.md` sebelum backend dibuat —
   prototipe ini tidak memutuskannya.
3. **Angka agregat di overview adalah data seeding**, bukan pemakaian nyata.
