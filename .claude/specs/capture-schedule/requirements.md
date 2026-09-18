# requirements.md — Schedule Management & Capture History

> Baca saat: implement fitur F-05 (Create Schedule), F-06 (Manage Schedule), F-07 (Capture History)

---

## F-05 · Buat Schedule Capture Otomatis

**User Story:**
Sebagai **user**, saya ingin **membuat jadwal capture otomatis untuk zona tertentu dengan ekspresi cron**,
supaya **sistem bisa mengambil snapshot kemacetan secara rutin tanpa saya harus trigger manual**.

**Acceptance Criteria:**
- [ ] Form buat schedule memiliki field: nama schedule (required), pilih zona (required), cron expression (required)
- [ ] Tersedia cron helper (pilihan preset: setiap jam, setiap pagi jam 7, dsb.) dan input cron manual
- [ ] Validasi: user tidak boleh melebihi batas active schedule sesuai plan (BR-005) — Free 10, Standard 20, Premium 50
- [ ] Error `SCHEDULE_LIMIT_EXCEEDED` ditampilkan sebagai toast jika limit tercapai
- [ ] Schedule langsung berstatus `active` setelah dibuat
- [ ] Scheduler backend me-load schedule baru tanpa perlu restart server

**Edge Cases:**
- User sudah mencapai batas active schedule plan aktif → tombol "Buat Schedule" disabled + tooltip "Batas schedule aktif plan Anda tercapai"
- Cron expression tidak valid (e.g., `99 * * * *`) → inline validation error sebelum submit
- Zona yang dipilih dihapus setelah schedule dibuat → schedule tetap ada, tapi job capture akan gagal dengan error "Zone not found" (logged ke capture history)
- Schedule dibuat tepat saat cron seharusnya trigger → tidak auto-trigger retroaktif, tunggu jadwal berikutnya

**Out of Scope (fase ini):**
- Schedule dengan kondisi (hanya capture jika macet)
- Notifikasi email setelah capture
- One-time schedule (bukan recurring)
- Schedule berbasis interval menit (< 15 menit)

---

## F-06 · Kelola Schedule (Edit, Pause, Hapus)

**User Story:**
Sebagai **user**, saya ingin **bisa pause, resume, edit, dan hapus schedule saya**,
supaya **saya punya kontrol penuh atas kapan dan bagaimana capture berjalan**.

**Acceptance Criteria:**
- [ ] Halaman `/schedules` menampilkan semua schedule user (active + paused)
- [ ] Setiap schedule card menampilkan: nama, zona, cron expression, status badge, dan total captures
- [ ] Tombol "Pause" tersedia untuk schedule `active` → status berubah ke `paused`, scheduler stop trigger job ini
- [ ] Tombol "Resume" tersedia untuk schedule `paused` → status berubah ke `active`, scheduler mulai trigger lagi
- [ ] Schedule yang di-pause tidak dihitung dalam limit active schedule plan aktif (BR-005)
- [ ] Tombol "Hapus" dengan konfirmasi dialog → status berubah ke `deleted` (soft delete), tidak muncul lagi di list
- [ ] Edit hanya bisa mengubah nama dan cron expression (tidak bisa ganti zona)

**Edge Cases:**
- User pause schedule ke-10 → slot kosong 1, user sekarang bisa buat schedule baru
- Resume schedule saat sudah mencapai batas active schedule plan aktif → return 422 SCHEDULE_LIMIT_EXCEEDED
- Edit cron expression ke nilai invalid → inline error, tidak disimpan
- Hapus schedule yang sedang memproses capture → capture tetap selesai, schedule tidak akan trigger lagi

**Out of Scope (fase ini):**
- Archive / restore schedule yang dihapus
- Duplicate schedule
- Bulk action (pause all, delete all)

---

## F-07 · Capture History & Download

**User Story:**
Sebagai **user**, saya ingin **melihat riwayat semua capture saya (manual dan scheduled)** dengan status dan preview,
supaya **saya bisa memantau performa system dan mengunduh gambar yang saya butuhkan**.

**Acceptance Criteria:**
- [ ] Halaman `/captures` menampilkan semua capture user dengan pagination (20 per halaman)
- [ ] Setiap capture item menampilkan: zona, waktu, status badge, trigger (manual / nama schedule), ukuran file
- [ ] Filter tersedia: by zona, by status (done/failed/skipped_limit), by date range
- [ ] Capture berstatus `done` bisa di-preview (thumbnail) dan di-download (PNG)
- [ ] Capture berstatus `failed` menampilkan pesan error dan tombol "Coba Lagi" (trigger manual capture ulang)
- [ ] Capture berstatus `skipped_limit` menampilkan info "Dilewati — batas harian tercapai"

**Edge Cases:**
- User tidak punya capture sama sekali → tampilkan empty state dengan CTA "Buat Schedule atau Capture Manual"
- Filter menghasilkan 0 hasil → tampilkan "Tidak ada capture yang cocok" bukan error page
- File di R2 dihapus manual (corrupt) tapi record di DB ada → tampilkan "File tidak tersedia" tanpa crash
- Unduhan file besar (>10MB) → gunakan presigned URL R2, bukan stream melalui API

**Out of Scope (fase ini):**
- Bulk download (ZIP)
- Share capture via link publik
- Perbandingan dua capture side-by-side
- Auto-delete capture lama
