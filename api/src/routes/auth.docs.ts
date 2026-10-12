/**
 * Swagger for the Better Auth routes this app depends on (ADR-009). Better Auth mounts
 * its own handler under /api/auth/*, so there is no Express route here to annotate:
 * this file only documents the contract. No code.
 */

/**
 * @swagger
 * /api/auth/sign-up/email:
 *   post:
 *     summary: Daftar akun dengan email (F-08), wajib menyetujui Terms & Privacy (H4)
 *     description: >
 *       Ditangani Better Auth. Dari browser, `acceptTerms` harus `true` dan
 *       `consentVersion` harus sama dengan versi teks saat ini (LEGAL_VERSION, mis.
 *       `2026-10-12`); selain itu 400 `TERMS_NOT_ACCEPTED` dan tidak ada akun dibuat.
 *       Bila diterima, `user.terms_accepted_at` (timestamptz) dan `user.terms_version`
 *       disimpan sebagai bukti. Akun buatan staf (POST /internal/users) tidak lewat
 *       pemeriksaan ini dan tidak diberi stempel. Tidak ada sesi sampai email
 *       diverifikasi dengan kode OTP.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name, acceptTerms, consentVersion]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8, maxLength: 128 }
 *               name: { type: string, description: Nama lengkap }
 *               acceptTerms: { type: boolean, enum: [true], description: Kotak persetujuan dicentang }
 *               consentVersion: { type: string, example: '2026-10-12', description: Versi Terms/Privacy yang ditampilkan form }
 *     responses:
 *       200: { description: Akun dibuat; kode verifikasi dikirim ke email }
 *       400:
 *         description: Persetujuan tidak ada atau versi lama (`TERMS_NOT_ACCEPTED`), atau input tidak valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: string, example: TERMS_NOT_ACCEPTED }
 *                 message: { type: string }
 */
export {}
