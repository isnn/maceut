import { Router } from 'express'
import * as userController from '../controllers/user.controller'
import { authMiddleware, internalOnly } from '../middlewares/auth.middleware'

const router = Router()

// Every route below is staff-only. Applied once here rather than repeated per route,
// so a route added later cannot be left unguarded by omission.
router.use('/internal', authMiddleware, internalOnly)

/**
 * @swagger
 * /internal/stats:
 *   get:
 *     summary: Statistik platform (F-21)
 *     description: Hanya untuk akun dengan platform role `internal`.
 *     tags: [Internal]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Agregat akun dan paket
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalUsers: { type: integer, example: 24 }
 *                     internalUsers: { type: integer, example: 2 }
 *                     planMix:
 *                       type: object
 *                       properties:
 *                         free: { type: integer }
 *                         standard: { type: integer }
 *                         premium: { type: integer }
 *       401: { description: UNAUTHORIZED }
 *       403: { description: FORBIDDEN — bukan akun internal }
 */
router.get('/internal/stats', userController.stats)

/**
 * @swagger
 * /internal/users:
 *   get:
 *     summary: Daftar semua akun (F-22)
 *     tags: [Internal]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Cocokkan email, nama, atau instansi
 *       - in: query
 *         name: plan
 *         schema: { type: string, enum: [free, standard, premium] }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [user, internal] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [created_desc, created_asc, email_asc], default: created_desc }
 *     responses:
 *       200:
 *         description: Daftar akun dengan pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/User' }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     total_pages: { type: integer }
 *       403: { description: FORBIDDEN — bukan akun internal }
 */
router.get('/internal/users', userController.list)

/**
 * @swagger
 * /internal/users/{id}:
 *   get:
 *     summary: Detail satu akun
 *     tags: [Internal]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Data akun
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/User' }
 *       404: { description: NOT_FOUND }
 */
router.get('/internal/users/:id', userController.detail)

/**
 * @swagger
 * /internal/users:
 *   post:
 *     summary: Buat akun baru untuk seseorang (F-21)
 *     description: >
 *       Akun dibuat lewat jalur sign-up Better Auth sendiri, bukan INSERT manual,
 *       supaya password di-hash oleh scrypt yang sama dengan pendaftaran mandiri dan
 *       baris user/credential-nya terbentuk dengan benar. Menulis itu manual adalah
 *       cara sebuah akun jadi ada tapi tidak bisa login.
 *
 *       `password` opsional. Kalau dikosongkan server membuatkan yang kuat dan
 *       mengembalikannya SEKALI di `temporaryPassword` — setelah itu tidak bisa dibaca
 *       lagi karena sudah di-hash. Kalau diisi, dipakai apa adanya; ini untuk admin
 *       yang sedang mendampingi orangnya langsung, karena belum ada pengiriman email.
 *
 *       `onboardingDone` otomatis true: akunnya sudah disiapkan orang, dan layar
 *       onboarding akan memberi tahu pemegang paket Premium bahwa ia di paket Free.
 *
 *       Sesi admin yang memanggil TIDAK berubah.
 *     tags: [Internal]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, fullName]
 *             properties:
 *               email: { type: string, format: email }
 *               fullName: { type: string, example: Siti Aminah }
 *               plan: { type: string, enum: [free, standard, premium], default: free }
 *               role: { type: string, enum: [user, internal], default: user }
 *               password: { type: string, minLength: 8, description: Kosongkan agar dibuatkan }
 *     responses:
 *       201:
 *         description: Akun dibuat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/User' }
 *                     temporaryPassword:
 *                       type: string
 *                       description: Hanya ada kalau server yang membuatnya. Ditampilkan sekali.
 *       401: { description: UNAUTHORIZED }
 *       403: { description: FORBIDDEN — bukan akun internal }
 *       422: { description: VALIDATION_ERROR atau EMAIL_ALREADY_TAKEN }
 */
router.post('/internal/users', userController.create)

/**
 * @swagger
 * /internal/users/{id}:
 *   patch:
 *     summary: Ubah data akun — nama, email, password, paket, role (F-22)
 *     description: >
 *       Semua field opsional; kirim yang berubah saja. Body kosong ditolak, bukan
 *       dianggap no-op: itu selalu berarti pemanggilnya salah membentuk request, dan
 *       menjawab 200 hanya menyembunyikan kesalahannya.
 *
 *       Paket dan role diterapkan lewat jalur yang sama dengan endpoint `/plan` dan
 *       `/role`, jadi aturannya tidak bisa berbeda: role tetap tunduk pada tiga penjaga
 *       (tidak boleh mengubah role sendiri, INTERNAL_EMAILS menang, akun internal
 *       terakhir tidak boleh diturunkan), dan penurunan paket tetap menjalankan
 *       grandfather-and-block (ADR-020).
 *
 *       Mengganti password akan MENGAKHIRI semua sesi akun itu. Alasan staf memutar
 *       password biasanya karena bocor — membiarkan sesi lama hidup berarti memberi
 *       password baru ke pemiliknya sambil membiarkan pihak lain tetap masuk.
 *
 *       Mengganti email ikut menghitung ulang platform role, karena INTERNAL_EMAILS
 *       dikunci ke alamat: tanpa itu direktori akan menampilkan role basi sampai akun
 *       tersebut sign-in berikutnya.
 *     tags: [Internal]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               fullName: { type: string }
 *               email: { type: string, format: email }
 *               plan: { type: string, enum: [free, standard, premium] }
 *               role: { type: string, enum: [user, internal] }
 *               password: { type: string, minLength: 8, description: Mengakhiri semua sesi akun itu }
 *     responses:
 *       200:
 *         description: Akun diperbarui
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/User' }
 *                     impact:
 *                       type: object
 *                       nullable: true
 *                       description: Hanya terisi kalau paketnya benar-benar berpindah (ADR-020)
 *       401: { description: UNAUTHORIZED }
 *       403: { description: FORBIDDEN — bukan staf, atau mengubah role sendiri }
 *       404: { description: NOT_FOUND }
 *       422: { description: VALIDATION_ERROR atau EMAIL_ALREADY_TAKEN }
 */
router.patch('/internal/users/:id', userController.update)

/**
 * @swagger
 * /internal/users/{id}:
 *   delete:
 *     summary: Hapus akun beserta seluruh isinya (F-22)
 *     description: >
 *       ⚠️ TIDAK BISA DIBATALKAN. Zona, jendela capture, dan baris paket milik akun itu
 *       ikut terhapus lewat ON DELETE CASCADE. Tidak ada undo dan tidak ada soft-delete:
 *       pemanggilnya staf yang bertindak sengaja, dan akun setengah terhapus yang masih
 *       memiliki zona lebih buruk daripada kedua hasilnya.
 *
 *       Dua penjaga yang sama dengan perubahan role, karena alasan yang sama — keduanya
 *       tidak bisa dipulihkan lewat API: tidak boleh menghapus akun sendiri, dan tidak
 *       boleh menghapus akun internal terakhir.
 *
 *       Mengembalikan apa yang ikut terhapus, bukan 204 kosong, supaya layarnya bisa
 *       menyebutkan angkanya alih-alih membiarkan operator menebak.
 *     tags: [Internal]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Akun terhapus
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     deleted:
 *                       type: object
 *                       properties: { id: { type: string }, email: { type: string } }
 *                     removed:
 *                       type: object
 *                       properties: { zones: { type: integer }, schedules: { type: integer } }
 *       401: { description: UNAUTHORIZED }
 *       403: { description: FORBIDDEN — bukan staf, atau menghapus akun sendiri }
 *       404: { description: NOT_FOUND }
 *       422: { description: VALIDATION_ERROR — akun internal terakhir }
 */
router.delete('/internal/users/:id', userController.remove)

/**
 * @swagger
 * /internal/users/{id}/plan:
 *   patch:
 *     summary: Ubah paket sebuah akun
 *     description: >
 *       Downgrade tidak menghapus data apa pun. Zona yang kelas jalannya melebihi
 *       batas paket baru tetap tersimpan; hanya capture-nya yang dibatasi (BR-022).
 *     tags: [Internal]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plan]
 *             properties:
 *               plan: { type: string, enum: [free, standard, premium] }
 *     responses:
 *       200:
 *         description: Paket diubah
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/User' }
 *       404: { description: NOT_FOUND }
 */
router.patch('/internal/users/:id/plan', userController.changePlan)

/**
 * @swagger
 * /internal/users/{id}/role:
 *   patch:
 *     summary: Ubah platform role sebuah akun
 *     description: >
 *       Tiga aturan ditegakkan: tidak bisa mengubah role akun sendiri, akun yang
 *       terdaftar di INTERNAL_EMAILS tidak bisa diturunkan lewat API (BR-027), dan
 *       akun internal terakhir tidak boleh diturunkan.
 *     tags: [Internal]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [user, internal] }
 *     responses:
 *       200:
 *         description: Role diubah
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/User' }
 *       403: { description: FORBIDDEN — mencoba mengubah role sendiri }
 *       404: { description: NOT_FOUND }
 *       422: { description: VALIDATION_ERROR — role dikunci config, atau akun internal terakhir }
 */
router.patch('/internal/users/:id/role', userController.changeRole)

export default router
