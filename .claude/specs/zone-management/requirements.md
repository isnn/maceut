# requirements.md — Zone Management & Manual Capture

> Baca saat: implement fitur F-19 (Dashboard), F-01 (Zone List), F-02 (Create Zone Stepper), F-03 (Step 1: Pilih Area), F-17 (Step 2: Pilih Road Class), F-18 (Step 3: Review), F-04 (Manual Capture)

---

## F-19 · Dashboard (Halaman Utama Setelah Login)

**User Story:**
Sebagai **user yang baru login**, saya ingin **melihat ringkasan zona dan schedule saya di satu halaman**,
supaya **saya langsung tahu status akun saya dan bisa mulai membuat zona baru dengan cepat**.

**Acceptance Criteria:**
- [ ] Setelah login berhasil, user diarahkan ke halaman dashboard (`/`), bukan langsung ke `/zones`
- [ ] Dashboard menampilkan card ringkasan: **jumlah zona yang dibuat** (total, bukan filter status)
- [ ] Dashboard menampilkan card ringkasan: **jumlah schedule yang sedang berjalan** (status `active` saja, tidak termasuk `paused`/`deleted`)
- [ ] Section CTA "Buat Zona Baru" ditampilkan menonjol (card dengan `button-primary`) yang membuka alur stepper (F-02)
- [ ] Data diambil dari `GET /usage` (field `zonesCount`, `schedulesActiveCount`)
- [ ] Loading skeleton saat fetch data pertama kali

**Edge Cases:**
- User baru belum punya zona/schedule sama sekali → tampilkan angka 0, CTA tetap menonjol sebagai ajakan utama
- API `GET /usage` gagal → tampilkan card dengan state error kecil, CTA tetap bisa diklik (tidak bergantung pada data usage)

**Out of Scope (fase ini):**
- Grafik tren zona/schedule dari waktu ke waktu
- Aktivitas terbaru (recent activity feed)
- Widget captures hari ini di halaman ini (sudah dicakup terpisah di F-14 subscription)

---

## F-01 · Zone List

**User Story:**
Sebagai **user yang sudah login**, saya ingin **melihat semua zona yang sudah saya buat**,
supaya **saya bisa memilih zona untuk capture atau membuat schedule baru**.

**Acceptance Criteria:**
- [ ] Halaman `/zones` menampilkan semua zona milik user
- [ ] Setiap zone card menampilkan: nama zona, road class badge (Nasional / Nasional+Provinsi / Semua Jalan), tanggal dibuat, dan tombol "Capture Sekarang"
- [ ] Empty state ditampilkan jika belum ada zona dengan CTA "Buat Zona Pertama" (membuka stepper F-02)
- [ ] Loading skeleton ditampilkan saat fetch data

**Edge Cases:**
- User belum punya zona sama sekali → tampilkan empty state, bukan error
- API gagal → tampilkan toast error, jangan crash halaman

**Out of Scope (fase ini):**
- Search / filter zona by name
- Sort zona
- Bulk delete zona

---

## F-02 · Buat Zona Baru — Alur Stepper (3 Langkah)

**User Story:**
Sebagai **user**, saya ingin **dipandu lewat alur bertahap yang jelas saat membuat zona**,
supaya **saya paham setiap keputusan yang saya buat (area, kedalaman data, konfirmasi) sebelum zona benar-benar tersimpan**.

**Acceptance Criteria:**
- [ ] Alur dibuka dari CTA di Dashboard (F-19) atau tombol "Buat Zona Baru" di halaman `/zones` (F-01)
- [ ] Terdiri dari **3 langkah** dengan progress indicator di bagian atas (mengikuti pola `Progress Navigation` di `design.md`):
  1. **Pilih Area** (F-03) — gambar polygon di peta
  2. **Pilih Road Class** (F-17) — pilih kedalaman data jalan
  3. **Review & Konfirmasi** (F-18) — tinjau ulang sebelum submit
- [ ] Step aktif ditandai dengan warna primary (ungu), step selesai dengan checkmark, step belum dicapai netral/abu-abu
- [ ] Data dari setiap step disimpan di state lokal (belum dikirim ke server) sampai user submit di step 3
- [ ] User bisa kembali ke step sebelumnya (tombol "Kembali") tanpa kehilangan data yang sudah diisi
- [ ] User **tidak bisa** lanjut ke step berikutnya jika step saat ini belum valid (misal: step 1 belum ada polygon, step 2 belum pilih road class)
- [ ] Menutup alur stepper sebelum submit menampilkan konfirmasi "Yakin keluar? Progress akan hilang"
- [ ] Request `POST /zones` hanya dikirim **sekali**, di step 3 (Review), bukan di setiap step

**Edge Cases:**
- User reload halaman di tengah stepper → progress hilang (state lokal, tidak dipersist) — tampilkan dari step 1 lagi
- Koneksi terputus saat submit di step 3 → tampilkan error, tetap di step 3 dengan data lengkap (jangan reset ke step 1)

**Out of Scope (fase ini):**
- Simpan progress stepper ke server (draft zone)
- Skip step / lompat langsung ke step tertentu
- Multi-zona sekaligus dalam satu alur stepper

---

## F-03 · Step 1: Pilih Area (Map Editor)

**User Story:**
Sebagai **user**, saya ingin **menggambar polygon langsung di peta interaktif dan memberi nama zona**,
supaya **saya bisa mendefinisikan area dengan presisi visual tanpa harus input koordinat manual**.

**Acceptance Criteria:**
- [ ] Map editor menggunakan HERE Maps dengan dark theme (BR-016, BR-017)
- [ ] Field nama zona (required) ditampilkan di step ini, dengan validasi duplikat (BR-015) saat blur/submit
- [ ] User bisa klik peta untuk menambah titik polygon, dan klik titik pertama untuk menutup
- [ ] Polygon yang sedang digambar ditampilkan secara live (garis + area fill semi-transparan)
- [ ] Tombol "Undo titik terakhir" dan "Reset / Mulai Ulang" tersedia
- [ ] Koordinat polygon yang selesai di-export sebagai GeoJSON Polygon (BR-013)
- [ ] Map editor bisa di-pan dan zoom selama menggambar
- [ ] Tombol "Lanjut" ke step 2 aktif hanya jika: nama zona terisi valid DAN polygon punya minimal 3 titik dan sudah tertutup

**Edge Cases:**
- Nama zona sudah ada (case-insensitive) → inline error di field nama, tombol "Lanjut" tetap disabled sampai diperbaiki
- Polygon tidak menutup (koordinat terakhir ≠ pertama) → tombol "Lanjut" disabled, tampilkan hint
- Polygon terlalu kecil (< 0.001 km²) → tampilkan warning (bukan error), tetap boleh lanjut
- Mobile: polygon drawing sulit dengan touch → scope MVP hanya desktop (tambahkan note di UI)

**Out of Scope (fase ini):**
- Edit titik yang sudah ada (drag vertex)
- Multiple polygon per zone
- Snapping / alignment tools
- Import polygon dari GeoJSON / KML file

---

## F-17 · Step 2: Pilih Road Class

**User Story:**
Sebagai **user**, saya ingin **memilih seberapa detail data jalan yang ingin dilihat di zona ini**,
supaya **saya mendapat data yang sesuai kebutuhan saya (dan sesuai plan yang saya miliki)**.

**Acceptance Criteria:**
- [ ] Dropdown menampilkan 3 opsi, semuanya bisa diklik: **Nasional**, **Nasional + Provinsi**, **Semua Jalan (Nasional + Provinsi + Kota/Lokal)**
- [ ] Deskripsi singkat per opsi ditampilkan (contoh: "Nasional — jalan besar antar kota/provinsi")
- [ ] Jika user memilih opsi yang **melebihi batas plan aktifnya** (BR-001..003):
  - [ ] Sistem menampilkan **popup upgrade** ("Fitur ini butuh plan Standard/Premium")
  - [ ] Pilihan tersebut **tidak** tersimpan sebagai state step ini — dropdown kembali ke opsi sebelumnya atau kosong
  - [ ] User **tidak bisa** lanjut ke step 3 dengan road class yang terkunci
- [ ] Popup upgrade punya tombol "Lihat Plan" (arahkan ke `/settings/plans`) dan "Tutup"
- [ ] Setelah memilih opsi yang valid (sesuai plan), tombol "Lanjut" ke step 3 aktif
- [ ] Tombol "Kembali" ke step 1 tersedia, data step 1 tetap ada
- [ ] Tombol **"Preview"** ditampilkan di step ini — membuka panel preview traffic untuk area & road class yang sedang dipilih
- [ ] Panel preview menampilkan peta (Leaflet + basemap OpenStreetMap, BR-024) dengan traffic layer di-overlay dari `GET /traffic/preview` (data HERE Traffic Flow, difilter sesuai road class yang dipilih)
- [ ] Preview di-render **langsung di browser** (client-side, tanpa Playwright) — hasil muncul dalam hitungan detik
- [ ] Di dalam panel preview terdapat **section Style** (lihat F-20) — user bisa ganti preset warna dan edit title/timestamp, preview area ter-update langsung sesuai style yang dipilih
- [ ] Pilihan style di panel preview ini **tidak disimpan** — murni untuk melihat hasil sebelum lanjut (BR-023)

**Edge Cases:**
- User plan Free mencoba pilih "Semua Jalan" → popup upgrade muncul, dropdown tidak berubah dari state sebelumnya
- User buka popup upgrade lalu klik "Tutup" → kembali ke dropdown, tidak ada opsi terpilih (harus pilih ulang yang valid)
- Plan user berubah (upgrade) di tab lain saat stepper masih terbuka → validasi tetap pakai data plan yang di-fetch saat komponen dimuat (tidak real-time), kemungkinan out-of-sync ini diterima untuk MVP
- `GET /traffic/preview` gagal/timeout (HERE API down) → tampilkan pesan "Preview tidak tersedia saat ini", tombol "Lanjut" ke step 3 **tetap bisa diklik** (preview bukan syarat wajib)
- Polygon terlalu besar (bbox luas) → batasi request `GET /traffic/preview` dengan area maksimum, tampilkan pesan jika melebihi batas

**Out of Scope (fase ini):**
- Custom road class (pilih kelas jalan spesifik selain 3 preset)
- Preview hasil akhir dengan branding logo asli (preview hanya traffic + style, tanpa logo — logo hanya muncul di capture asli)

---

## F-20 · Style Selector (Komponen Bersama)

**User Story:**
Sebagai **user**, saya ingin **memilih tampilan warna dan teks untuk hasil capture setiap kali saya preview atau capture**,
supaya **saya bisa menyesuaikan gaya visual sesuai kebutuhan saat itu, tanpa terikat satu gaya tetap**.

**Digunakan di:** F-17 (Step 2 — panel preview) dan F-04 (Manual Capture — sebelum trigger)

**Acceptance Criteria:**
- [ ] Menampilkan galeri/list beberapa **style preset** (minimal 3-4 versi, contoh: "Default", "Minimal", "Bold", "Korporat") — masing-masing preset punya kombinasi warna berbeda untuk overlay (kotak title, timestamp, legend)
- [ ] User memilih 1 preset dengan mengklik card/thumbnail preset
- [ ] Field **Title** dapat diedit bebas (default terisi otomatis dengan nama zona, tapi user boleh mengubahnya)
- [ ] Toggle **Tampilkan Timestamp** (on/off) — jika off, timestamp tidak muncul di overlay
- [ ] Perubahan preset/title/timestamp langsung memperbarui area preview (reaktif, tanpa perlu tombol "terapkan" terpisah)
- [ ] State style ini **ephemeral** — hilang begitu user menutup panel preview atau menyelesaikan aksi (tidak ada tombol "Simpan sebagai default")

**Edge Cases:**
- Title dikosongkan oleh user → capture tetap berjalan tanpa title (area title kosong, bukan error)
- Title sangat panjang (>40 karakter) → truncate dengan ellipsis di overlay, tidak menolak input
- User pilih preset lalu edit title lalu ganti preset lain → title yang sudah diedit **tetap dipertahankan** (tidak reset ke default nama zona)

**Out of Scope (fase ini):**
- Custom warna manual (color picker bebas) — hanya dari preset yang tersedia
- Menyimpan style sebagai favorit/default per user atau per zona
- Upload font kustom

---

## F-18 · Step 3: Review & Konfirmasi

**User Story:**
Sebagai **user**, saya ingin **meninjau ulang semua pilihan saya sebelum zona benar-benar dibuat**,
supaya **saya yakin tidak ada kesalahan sebelum data tersimpan**.

**Acceptance Criteria:**
- [ ] Menampilkan ringkasan: nama zona, thumbnail/preview polygon di peta kecil, road class yang dipilih (dengan badge)
- [ ] Tombol "Kembali" ke step 2 tersedia — data tidak hilang
- [ ] Tombol utama "Buat Zona" (button-primary) men-submit `POST /zones` dengan payload `{ name, geometry, roadClass }`
- [ ] Saat submit: tombol menampilkan loading state, disabled untuk mencegah double-submit
- [ ] Setelah sukses (201): tampilkan toast sukses, tutup stepper, redirect ke `/zones` (zona baru terlihat di list)
- [ ] Error dari server (mis. `ZONE_NAME_TAKEN` — race condition nama diambil user lain di tab berbeda, atau `ROAD_CLASS_NOT_ALLOWED`) ditampilkan sebagai alert di step ini, user tetap di step 3 dengan data utuh

**Edge Cases:**
- Submit gagal karena koneksi terputus → tampilkan alert error, tombol submit kembali aktif untuk retry
- `ZONE_NAME_TAKEN` muncul di step 3 (bukan step 1, karena race condition) → tampilkan alert dengan tombol "Kembali ke Step 1" untuk ganti nama
- `ROAD_CLASS_NOT_ALLOWED` muncul di step 3 (defense in depth, seharusnya sudah dicegah di step 2) → tampilkan alert dengan tombol "Kembali ke Step 2"

**Out of Scope (fase ini):**
- Edit langsung dari step review (harus kembali ke step terkait)
- Simpan sebagai draft tanpa submit

---

## F-04 · Manual Capture

**User Story:**
Sebagai **user**, saya ingin **men-trigger capture gambar kondisi lalu lintas sekarang** untuk zona tertentu,
supaya **saya bisa mendapatkan snapshot traffic terkini tanpa harus menunggu schedule**.

**Acceptance Criteria:**
- [ ] Tombol "Capture Sekarang" tersedia di zone card dan halaman detail zone
- [ ] Klik tombol membuka panel **Style Selector** (F-20) terlebih dahulu — user pilih preset warna, opsional edit title/timestamp
- [ ] Panel Style Selector punya tombol konfirmasi "Capture Sekarang" (final) untuk benar-benar trigger, dan opsi batal
- [ ] Setelah konfirmasi, tampilkan status "Memproses..." dan `captureId` dikembalikan (async, status `pending`)
- [ ] Polling status capture setiap 3 detik sampai status berubah ke `done` atau `failed`
- [ ] Gambar capture menampilkan: basemap OpenStreetMap + traffic layer HERE Traffic overlay (BR-024), company logo, title & timestamp sesuai style yang dipilih (BR-018, BR-023)
- [ ] Legend traffic (green/yellow/orange/red) tampil di sudut gambar (BR-019)
- [ ] Setelah `done`, tampilkan preview gambar dan tombol download PNG
- [ ] Gambar capture menampilkan road class **efektif** = MIN(road class tersimpan di zona, batas plan aktif user saat ini) (BR-022)
- [ ] Jika daily limit tercapai (BR-006), tampilkan pesan "Batas captures harian plan Anda tercapai. Reset pukul 00:00 WIB"

**Edge Cases:**
- Capture gagal (Playwright error / R2 error) → status `failed`, tampilkan pesan error dari `error_message`, sediakan tombol "Coba Lagi" (membuka lagi Style Selector, tidak otomatis pakai style sebelumnya)
- User klik "Capture Sekarang" berkali-kali cepat → disable tombol setelah konfirmasi pertama sampai ada respons
- Daily limit `skipped_limit` → tidak ada retry, langsung tampilkan pesan limit (BR-008)
- Branding config belum diisi → capture tetap berjalan, logo kosong / nama perusahaan kosong
- User downgrade plan setelah zona dibuat dengan road class lebih tinggi → capture tetap jalan tapi road class efektif otomatis diturunkan (BR-022), tidak ada pesan error ke user (silent cap)
- Scheduled capture (via cron, F-05) tidak melalui Style Selector — otomatis pakai style preset "Default" (BR-023)

**Out of Scope (fase ini):**
- Capture multiple zona sekaligus (batch)
- Pilih waktu capture di masa lalu (historical)
- Pilih resolusi output
