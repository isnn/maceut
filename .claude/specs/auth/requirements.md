# requirements.md — Auth & Onboarding

> Baca saat: implement fitur F-08 (Register), F-09 (Login), F-10 (Logout & Session)

---

## F-08 · Register Akun Baru

**User Story:**
Sebagai **pengunjung baru**, saya ingin **mendaftar dengan email dan password**,
supaya **saya bisa mulai menggunakan Maceut**.

**Acceptance Criteria:**
- [ ] Form register memiliki field: email, password, konfirmasi password
- [ ] Validasi email: format valid, belum terdaftar di sistem
- [ ] Validasi password: minimal 8 karakter
- [ ] Validasi konfirmasi password: harus sama dengan password
- [ ] Setelah berhasil register, user otomatis login dan diarahkan ke `/zones`
- [ ] User baru otomatis mendapat plan `free` (BR-001)
- [ ] Error `EMAIL_ALREADY_TAKEN` ditampilkan sebagai inline error di field email

**Edge Cases:**
- Email sudah terdaftar → 422 `EMAIL_ALREADY_TAKEN`, inline error di field, jangan redirect
- Password < 8 karakter → inline error, jangan submit ke server
- Konfirmasi password tidak cocok → inline error client-side, jangan submit
- Submit form dua kali cepat (double click) → disable tombol setelah submit pertama
- Email dengan karakter unicode atau subdomain panjang → tetap valid selama format RFC-5322

**Out of Scope (fase ini):**
- Register via Google / OAuth
- Verifikasi email (email confirmation link)
- Invite-based registration
- CAPTCHA

---

## F-09 · Login

**User Story:**
Sebagai **user yang sudah punya akun**, saya ingin **login dengan email dan password**,
supaya **saya bisa mengakses dashboard dan fitur Maceut**.

**Acceptance Criteria:**
- [ ] Form login memiliki field: email, password
- [ ] Setelah berhasil login, HttpOnly JWT di-set di cookie (ADR-008)
- [ ] User diarahkan ke `/zones` (atau halaman yang dituju sebelum redirect ke login)
- [ ] Error `INVALID_CREDENTIALS` ditampilkan sebagai form-level error (bukan inline per field — hindari info leaking email mana yang salah)
- [ ] Halaman login tidak bisa diakses jika sudah login (redirect ke dashboard)

**Edge Cases:**
- Email tidak terdaftar → sama dengan password salah: tampilkan `INVALID_CREDENTIALS` (jangan beri tahu mana yang salah)
- Password salah → tampilkan `INVALID_CREDENTIALS`
- User mencoba akses `/zones` tanpa login → redirect ke `/login?redirect=/zones`
- JWT expired saat session aktif → middleware return 401, frontend redirect ke login dengan pesan "Sesi Anda berakhir, silakan login kembali"

**Out of Scope (fase ini):**
- Login via Google / OAuth
- Remember me / extended session
- Two-factor authentication
- Login throttle / lockout (bisa ditambah post-MVP)

---

## F-10 · Logout & Proteksi Route

**User Story:**
Sebagai **user yang sudah login**, saya ingin **bisa logout dengan aman**,
supaya **sesi saya berakhir dan akun terlindungi di perangkat bersama**.

**Acceptance Criteria:**
- [ ] Tombol logout tersedia di sidebar / header dashboard
- [ ] Setelah logout, HttpOnly JWT cookie dihapus (di-clear dari server)
- [ ] Setelah logout, user diarahkan ke `/login`
- [ ] Semua route di `(dashboard)` group terlindungi — redirect ke `/login` jika tidak ada session valid
- [ ] Route di `(public)` group (login, register) tidak bisa diakses saat sudah login

**Edge Cases:**
- User logout di satu tab → tab lain yang masih buka tidak otomatis logout (acceptable untuk MVP, cookie akan expired)
- User hapus cookie manual → middleware return 401, frontend redirect ke login
- Logout saat ada capture sedang diproses → capture tetap diproses di worker, tidak terganggu

**Out of Scope (fase ini):**
- Forgot password / reset password
- Session management (list active sessions, revoke specific session)
- Logout dari semua device
