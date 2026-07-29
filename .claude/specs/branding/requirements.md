# requirements.md — Branding Configuration

> Baca saat: implement fitur F-11 (Branding Config), F-12 (Logo Upload), F-13 (Capture Preview with Branding)

---

## F-11 · Konfigurasi Branding (Nama Perusahaan)

**User Story:**
Sebagai **user**, saya ingin **mengatur nama perusahaan saya**,
supaya **setiap gambar capture yang dihasilkan mencantumkan identitas perusahaan saya secara profesional**.

**Acceptance Criteria:**
- [ ] Halaman `/branding` menampilkan form dengan field: nama perusahaan (text input)
- [ ] Nama perusahaan maksimal 60 karakter
- [ ] Perubahan disimpan via `PUT /branding`
- [ ] Setelah save, tampilkan toast "Branding berhasil disimpan"
- [ ] Preview watermark ditampilkan di halaman yang menunjukkan bagaimana nama akan muncul di capture
- [ ] Jika branding belum pernah diisi, form tampil kosong (bukan error) — capture tetap bisa dilakukan

**Edge Cases:**
- Nama perusahaan dikosongi → field boleh kosong, capture akan berjalan tanpa nama (hanya timestamp + zone name)
- Nama > 60 karakter → inline error, tidak bisa save
- Save gagal (network error) → tampilkan toast error, data di form tidak direset

**Out of Scope (fase ini):**
- Custom font untuk watermark
- Custom warna teks / background watermark
- Multiple branding profile

---

## F-12 · Upload Logo Perusahaan

**User Story:**
Sebagai **user**, saya ingin **mengupload logo perusahaan saya**,
supaya **logo tampil di sudut gambar capture sebagai identitas visual**.

**Acceptance Criteria:**
- [ ] Upload logo via drag-and-drop atau klik tombol pilih file
- [ ] Format yang diterima: PNG, JPG, SVG — maksimal 2MB
- [ ] Setelah upload berhasil, logo preview ditampilkan di halaman branding
- [ ] Logo disimpan ke Cloudflare R2, path disimpan di `branding_configs.logo_path`
- [ ] User bisa mengganti logo (upload baru akan menggantikan yang lama)
- [ ] User bisa menghapus logo (capture akan berjalan tanpa logo)

**Edge Cases:**
- File bukan PNG/JPG/SVG → reject dengan pesan "Format tidak didukung. Gunakan PNG, JPG, atau SVG"
- File > 2MB → reject dengan pesan "Ukuran file melebihi 2MB"
- Upload gagal di tengah jalan (network) → tampilkan error, logo lama tetap aktif (tidak dihapus)
- Logo lama di R2 saat ganti logo baru → hapus logo lama dari R2 untuk menghindari orphan files
- SVG dengan script embed (XSS) → sanitize atau tolak file SVG yang mengandung `<script>` tag

**Out of Scope (fase ini):**
- Crop / resize logo di browser
- Logo berbeda per zona atau per schedule

---

## F-13 · Preview Capture dengan Branding

**User Story:**
Sebagai **user**, saya ingin **melihat preview bagaimana gambar capture akan terlihat** sebelum menyimpan branding,
supaya **saya bisa memastikan tampilan watermark sudah sesuai sebelum capture benar-benar dijalankan**.

**Acceptance Criteria:**
- [ ] Halaman branding menampilkan preview card yang mensimulasikan layout gambar capture
- [ ] Preview menunjukkan posisi: logo (kiri bawah), nama perusahaan (kiri bawah, di bawah logo), zone name placeholder, timestamp placeholder, legend (kanan bawah)
- [ ] Preview update secara real-time saat user mengetik nama perusahaan atau upload logo baru
- [ ] Preview menggunakan dark background (sama dengan tema peta — BR-016)
- [ ] Preview bersifat static / mock — bukan render HERE Maps sungguhan

**Edge Cases:**
- Belum ada logo → preview menampilkan placeholder icon
- Nama perusahaan kosong → preview hanya tampilkan zone name + timestamp
- Logo SVG yang valid → render di preview (gunakan `<img>` tag biasa)

**Out of Scope (fase ini):**
- Preview dengan peta HERE Maps sungguhan
- Preview per zona atau per jam tertentu
