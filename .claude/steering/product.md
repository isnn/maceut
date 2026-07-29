# product.md — Product Context

> Baca saat: membuat fitur baru, menambah business rule, atau perlu memahami konteks produk.

---

## Problem & Vision

**Problem:** Tim operasional, logistik, dan analis kota tidak punya cara mudah untuk merekam kondisi lalu lintas secara terjadwal di zona tertentu. Solusi yang ada (screenshot manual, CCTV) tidak terstruktur, tidak bermerek, dan tidak bisa diotomatisasi.

**Vision:** "Maceut memungkinkan siapa saja memantau dan mendokumentasikan kondisi kemacetan di zona pilihannya secara otomatis — cukup definisikan zona, atur jadwal, dan sistem akan menghasilkan capture visual bermerek yang siap digunakan."

---

## Users & Personas

| Persona | Profil | Pain Point | Goal |
|---------|--------|-----------|------|
| **Rizal** — Analis Operasional Logistik | Bekerja di perusahaan ekspedisi, memantau rute pengiriman harian | Harus screenshot peta manual setiap pagi untuk laporan kemacetan | Dapat laporan visual kemacetan otomatis tiap hari tanpa intervensi manual |
| **Dewi** — Urban Planner Pemda | Menganalisis pola kemacetan kota untuk kebijakan transportasi | Data kemacetan tersebar, tidak ada rekaman historis visual yang terstruktur | Akses ke rekaman visual kemacetan per zona per waktu untuk analisis tren |
| **Budi** — Manager Fleet Transportasi | Mengelola armada kendaraan lintas kota, butuh info kondisi jalan | Tidak tahu kondisi jalan di zona tertentu sebelum dispatch kendaraan | Capture otomatis zona kritis setiap jam untuk keputusan dispatch lebih baik |

---

## Roles & Permissions

MVP menggunakan **single workspace** — tidak ada multi-tenant atau team role. Satu akun = satu workspace.

| Permission | Free | Standard | Premium |
|-----------|:----:|:--------:|:-------:|
| Buat & kelola zona (polygon) | ✅ | ✅ | ✅ |
| Road class: Nasional | ✅ | ✅ | ✅ |
| Road class: Provinsi | ❌ | ✅ | ✅ |
| Road class: Kota / Lokal | ❌ | ❌ | ✅ |
| Max Active Schedules | 10 | 10 | 10 |
| Daily Capture Limit | 100 | 100 | 100 |
| Export PNG/JPG | ✅ | ✅ | ✅ |
| Custom Branding (logo + nama) | ✅ | ✅ | ✅ |

*Semua user bisa membuat zona polygon di area mana saja. Perbedaan tier hanya pada kedalaman data jalan yang di-render di dalam zona tersebut.*

### Road Class Mapping (HERE Maps → OSM)

| Tier | HERE Functional Class | OSM Highway Tag |
|------|----------------------|-----------------|
| Nasional | FC1, FC2 | motorway, trunk, primary |
| Provinsi | FC3 | secondary |
| Kota / Lokal | FC4, FC5 | tertiary, residential, unclassified |

*Referensi: HERE Maps Functional Class (FC) mengikuti klasifikasi hierarki jalan. OSM highway tag digunakan sebagai acuan identifikasi kelas jalan di Indonesia.*

---

## Business Rules

**Plan & Road Class Access**
- BR-001: Plan Free maksimal dapat memilih road class Nasional saja (HERE FC1-FC2 / OSM: motorway, trunk, primary) saat membuat zona.
- BR-002: Plan Standard maksimal dapat memilih road class Nasional + Provinsi (HERE FC3 / OSM: secondary).
- BR-003: Plan Premium dapat memilih semua road class: Nasional + Provinsi + Kota/Lokal (HERE FC4-FC5 / OSM: tertiary, residential, unclassified).
- BR-004: Semua user (semua plan) dapat membuat zona polygon di area mana saja tanpa batasan geografis. Perbedaan plan membatasi road class **maksimal** yang bisa dipilih saat membuat zona.
- BR-020: Road class dipilih **per zona** saat proses pembuatan (bukan lagi setting global per user) dan disimpan sebagai atribut zona tersebut.
- BR-021: Saat user memilih road class yang melebihi batas plan aktifnya di step "Pilih Road Class", sistem menampilkan popup upgrade dan **tidak** melanjutkan ke step berikutnya. Backend tetap memvalidasi ulang saat submit (defense in depth) dan menolak dengan `ROAD_CLASS_NOT_ALLOWED` jika somehow lolos dari validasi frontend.
- BR-022: Jika user melakukan downgrade plan setelah zona dibuat dengan road class yang lebih tinggi, road class efektif saat capture adalah **nilai terendah antara road class tersimpan di zona dan batas maksimal plan aktif user** (`effectiveRoadClass = MIN(zone.roadClass, planMaxRoadClass)`). Zona itu sendiri tidak diubah atau dihapus — hanya hasil capture yang menyesuaikan.

**Basemap & Traffic Rendering**
- BR-024: Basemap tile menggunakan **OpenStreetMap** (bukan HERE Maps tile). Data traffic flow tetap bersumber dari **HERE Traffic Flow API**, di-overlay sebagai layer terpisah di atas basemap OSM (ADR-010b/c).

**Style (Warna & Teks Capture)**
- BR-023: Style (skema warna overlay + teks title + tampilan timestamp) dipilih **setiap kali** sebelum preview atau trigger manual capture — bersifat ephemeral, **tidak disimpan** sebagai profil per zona maupun per user. Untuk **scheduled capture** (trigger otomatis tanpa interaksi user), sistem menggunakan style preset **"Default"**. Setiap record capture tetap menyimpan snapshot style yang dipakai (`style_used`) untuk keperluan histori, bukan untuk dipakai ulang otomatis.

**Schedule & Capture Limits**
- BR-005: Setiap user maksimal memiliki 10 active schedule secara bersamaan. Schedule `paused` atau `deleted` tidak dihitung.
- BR-006: Daily capture limit per user adalah 100 captures/hari. Dihitung per kalender hari (WIB UTC+7).
- BR-007: Enforcement limit dilakukan di **service layer** — handler tidak boleh melakukan validasi limit sendiri.
- BR-008: Jika capture gagal karena limit tercapai, job di-drop (bukan di-retry) dan dicatat di capture history dengan status `skipped_limit`.

**Capture & Storage**
- BR-009: Setiap capture menghasilkan file PNG (untuk display) dan opsional JPG (untuk download). Keduanya disimpan di Cloudflare R2.
- BR-010: Metadata capture (capture_id, user_id, zone_id, schedule_id, file_path, file_size, status, created_at) disimpan di PostgreSQL.
- BR-011: File path R2 menggunakan format: `captures/{user_id}/{YYYY}/{MM}/{capture_id}.png`
- BR-012: Capture yang gagal (error render) disimpan di history dengan status `failed` dan pesan error. Tidak di-retry otomatis di MVP.

**Zone & Geometry**
- BR-013: Zone disimpan sebagai PostGIS Polygon dalam CRS WGS84 (SRID 4326).
- BR-014: User menggambar polygon zone secara manual di peta. Tidak ada import dari file eksternal di MVP.
- BR-015: Nama zone bersifat unik per user (case-insensitive).

**Map Visualization**
- BR-016: Layer peta hanya menampilkan road network dan traffic state. POI, toko, restoran, dan hotel tidak ditampilkan.
- BR-017: Color mapping traffic: `normal=green`, `slow=yellow`, `heavy=orange`, `congested=red`. Mengikuti data HERE Traffic Flow.
- BR-018: Setiap gambar capture wajib menyertakan: company logo, zone name, dan timestamp (format: `DD MMM YYYY HH:mm WIB`).
- BR-019: Legend traffic wajib tampil di setiap gambar capture.

---

## Feature Status

✅ Done · 🚧 In Progress · 📋 Backlog · ❌ Out of scope (MVP)

**Auth & Onboarding**
- Register & Login (Better Auth + HttpOnly JWT) `📋`
- Forgot Password `📋`
- Onboarding wizard `❌`

**Dashboard**
- Halaman utama setelah login: ringkasan jumlah zona + schedule aktif + CTA buat zona `📋`

**Zone Management**
- Buat zona — alur 3-step stepper (pilih area → pilih road class → review) `📋`
- Step 1: Gambar polygon di peta (Leaflet + OSM basemap) `📋`
- Step 2: Pilih road class dengan validasi plan + upgrade popup `📋`
- Step 2: Preview traffic ringan di browser (Leaflet + HERE Traffic overlay) `📋`
- Step 2: Style selector — pilih preset warna + edit title + toggle timestamp `📋`
- Step 3: Review & konfirmasi sebelum submit `📋`
- Edit nama zona `📋`
- Hapus zona `📋`
- Import zone dari file (GeoJSON, KML) `❌`

**Capture**
- Manual capture (trigger langsung dari dashboard) `📋`
- Capture via scheduled job (otomatis) `📋`
- Download capture PNG/JPG `📋`
- Capture history & filter `📋`

**Schedule**
- Buat schedule (zone + interval/cron + aktif/nonaktif) `📋`
- Edit & hapus schedule `📋`
- Pause & resume schedule `📋`
- Schedule dengan kondisi (cuaca, jam tertentu) `❌`

**Branding**
- Upload company logo `📋`
- Konfigurasi nama perusahaan untuk watermark `📋`
- Custom color watermark `❌`

**Subscription**
- Free / Standard / Premium plan `📋`
- Upgrade plan (Stripe atau payment gateway lokal) `📋`
- Usage dashboard (captures hari ini, schedules aktif) `📋`
- Invoice & billing history `❌`

**Out of scope MVP:**
- Multi-tenant / organization workspace
- Team member & role management
- Import zone dari file eksternal (GeoJSON, KML)
- Schedule dengan kondisi dinamis
- Custom color watermark
- Multiple branding profile per user
- Mobile native app
- Public API / webhook
- Invoice & billing history
- Notifikasi email per capture
