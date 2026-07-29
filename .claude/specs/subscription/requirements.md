# requirements.md — Subscription & Usage

> Baca saat: implement fitur F-14 (Usage Dashboard), F-15 (Plan Display & Upgrade CTA), F-16 (Usage Enforcement)

---

## F-14 · Usage Dashboard

**User Story:**
Sebagai **user**, saya ingin **melihat penggunaan saya hari ini** (captures dan schedules aktif),
supaya **saya tahu seberapa dekat dengan batas limit sebelum terkena throttle**.

**Acceptance Criteria:**
- [ ] Widget usage tampil di halaman dashboard utama (`/`)
- [ ] Menampilkan: captures hari ini (X / 10), schedules aktif (X / 10), dan nama plan saat ini
- [ ] Progress bar ditampilkan untuk masing-masing limit
- [ ] Warning state ditampilkan (warna oranye) saat usage ≥ 80% dari limit
- [ ] Critical state ditampilkan (warna merah) saat usage ≥ 100% (limit tercapai)
- [ ] Data di-refresh setiap 30 detik atau saat user kembali ke tab

**Edge Cases:**
- Captures hari ini = 0 → progress bar kosong, bukan error
- Limit tercapai (100 captures) → tampilkan "Batas tercapai. Reset pukul 00:00 WIB" dengan estimasi waktu reset
- API `GET /usage` gagal → tampilkan data terakhir yang di-cache, bukan crash widget

**Out of Scope (fase ini):**
- Grafik historis penggunaan (per hari/minggu/bulan)
- Notifikasi push saat limit hampir tercapai
- Breakdown captures per zona atau per schedule

---

## F-15 · Plan Display & Upgrade CTA

**User Story:**
Sebagai **user Free atau Standard**, saya ingin **melihat plan saya saat ini dan cara upgrade**,
supaya **saya tahu apa yang saya dapatkan dan bisa upgrade jika butuh akses lebih**.

**Acceptance Criteria:**
- [ ] Halaman `/settings` atau `/plans` menampilkan plan aktif user dengan badge (Free / Standard / Premium)
- [ ] Perbandingan fitur antar plan ditampilkan dalam tabel (National / Provincial / City zones, limits)
- [ ] Tombol "Upgrade ke Standard" tampil untuk user Free
- [ ] Tombol "Upgrade ke Premium" tampil untuk user Free dan Standard
- [ ] User Premium hanya melihat badge konfirmasi "Anda sudah di plan tertinggi"
- [ ] Halaman `/zones` menampilkan road class **maksimal** yang bisa dipilih user saat ini (mis. "Plan Free: bisa pilih road class Nasional saat buat zona baru") dengan link upgrade — ini berbeda dari road class yang tersimpan di masing-masing zona (lihat F-17 di zone-management)

**Edge Cases:**
- User sudah Premium → semua tombol upgrade disembunyikan, bukan disabled
- User mengklik upgrade → untuk MVP, arahkan ke halaman kontak / waitlist (payment gateway belum terintegrasi)
- Plan `expires_at` sudah lewat → tampilkan plan sebagai Free (downgrade otomatis harus di-handle di backend)

**Out of Scope (fase ini):**
- Integrasi payment gateway (Stripe, Midtrans, dll)
- Billing & invoice history
- Promo code / discount
- Trial period
- Downgrade plan

---

## F-16 · Usage Enforcement (Backend)

**User Story:**
Sebagai **sistem**, saya perlu **memastikan user tidak melampaui batas limit plan mereka**,
supaya **business rules ditegakkan secara konsisten di semua entry point**.

**Acceptance Criteria:**
- [ ] Daily capture limit (10/hari) di-enforce di `CaptureService.TriggerManual` dan `CaptureService.TriggerScheduled` (BR-006, BR-007)
- [ ] Active schedule limit (10) di-enforce di `ScheduleService.CreateSchedule` dan `ScheduleService.ResumeSchedule` (BR-005, BR-007)
- [ ] Road class filter di-enforce di `ZoneService.GetRoadClassFilter(plan)` — hasil filter dikirim ke Playwright sebagai konfigurasi layer HERE Maps (BR-001..003)
- [ ] Capture yang di-skip karena limit dicatat dengan status `skipped_limit` (BR-008)
- [ ] Semua enforcement dilakukan di service layer, bukan handler atau middleware (BR-007)

**Edge Cases:**
- Dua request manual capture bersamaan saat limit = 99 → race condition: gunakan DB transaction + SELECT FOR UPDATE atau atomic counter untuk count harian
- Schedule trigger tepat tengah malam (00:00 WIB) saat reset harian → pastikan timezone calculation benar (WIB = UTC+7, jangan pakai UTC murni)
- User downgrade dari Premium ke Standard → zona yang sudah ada tidak berubah, tapi capture berikutnya akan otomatis hanya menampilkan road class sesuai plan baru (Standard: FC1-FC3 saja)

**Out of Scope (fase ini):**
- Rate limiting per menit (hanya per hari untuk MVP)
- Notifikasi otomatis saat limit mendekati
- Burst allowance (sementara melewati limit)
