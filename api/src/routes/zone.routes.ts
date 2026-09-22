import { Router } from 'express'
import * as zoneController from '../controllers/zone.controller'
import * as trafficController from '../controllers/traffic.controller'
import { authMiddleware, planCheck } from '../middlewares/auth.middleware'

const router = Router()

// Every route below needs both the user and their plan: limits are enforced in the
// service layer (BR-007) and the service is given the plan, never asked to look it up.
router.use(['/zones', '/zones/:id', '/traffic'], authMiddleware, planCheck)

/**
 * @swagger
 * components:
 *   schemas:
 *     Zone:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         name: { type: string, example: Zona Malioboro }
 *         geometry:
 *           type: object
 *           description: GeoJSON Polygon, WGS84 (BR-013). Positions are [longitude, latitude].
 *           properties:
 *             type: { type: string, example: Polygon }
 *             coordinates: { type: array, items: { type: array, items: { type: array, items: { type: number } } } }
 *         roadClass: { type: string, enum: [nasional, nasional_provinsi, semua] }
 *         status: { type: string, enum: [collecting, paused] }
 *         areaKm2: { type: number, example: 2.41, description: Dihitung dari batas via PostGIS }
 *         roadsCount:
 *           type: integer
 *           nullable: true
 *           description: Null jika HERE belum dikonfigurasi — artinya "belum diketahui", bukan nol.
 *         lengthKm: { type: number, nullable: true }
 *         cadence: { type: string, example: Belum dijadwalkan }
 *         createdAt: { type: string, format: date-time }
 */

/**
 * @swagger
 * /zones:
 *   get:
 *     summary: Daftar zona milik user
 *     tags: [Zones]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200:
 *         description: Daftar zona, terbaru dulu
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Zone' } }
 *       401: { description: UNAUTHORIZED }
 */
router.get('/zones', zoneController.list)

/**
 * @swagger
 * /zones:
 *   post:
 *     summary: Buat zona baru (step 3 wizard — Review & Konfirmasi)
 *     description: >
 *       Menegakkan BR-015 (nama unik per user), BR-021 (kelas jalan tidak melebihi
 *       paket), dan batas jumlah zona per paket. `roadsCount`/`lengthKm` diturunkan
 *       dari HERE saat pembuatan; jika HERE belum dikonfigurasi keduanya null —
 *       zona tetap dibuat, karena batas wilayah adalah hasil kerja user sedangkan
 *       angka ruas hanya pelengkap.
 *     tags: [Zones]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, geometry, roadClass]
 *             properties:
 *               name: { type: string, maxLength: 120 }
 *               geometry: { type: object }
 *               roadClass: { type: string, enum: [nasional, nasional_provinsi, semua] }
 *     responses:
 *       201:
 *         description: Zona dibuat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Zone' }
 *       401: { description: UNAUTHORIZED }
 *       403: { description: ROAD_CLASS_NOT_ALLOWED — kelas jalan melebihi paket (BR-021) }
 *       422: { description: ZONE_NAME_TAKEN (BR-015), batas zona tercapai, atau VALIDATION_ERROR }
 */
router.post('/zones', zoneController.create)

/**
 * @swagger
 * /zones/{id}:
 *   get:
 *     summary: Detail satu zona (F-24)
 *     tags: [Zones]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Data zona
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Zone' }
 *       403: { description: FORBIDDEN — zona milik user lain }
 *       404: { description: NOT_FOUND }
 */
router.get('/zones/:id', zoneController.detail)

/**
 * @swagger
 * /zones/{id}:
 *   patch:
 *     summary: Ubah nama, kelas jalan, atau status zona (F-24, BR-028..030)
 *     description: >
 *       Batas wilayah TIDAK bisa diubah — menggambar ulang batas efektifnya zona yang
 *       berbeda, dan capture lama tidak lagi menggambarkan apa yang diklaimnya
 *       (BR-028). Mengubah kelas jalan menurunkan ulang roadsCount/lengthKm, karena
 *       membiarkannya basi membuat zona mengklaim mengumpulkan ruas yang sudah tidak
 *       dikumpulkan.
 *     tags: [Zones]
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
 *             properties:
 *               name: { type: string, maxLength: 120 }
 *               roadClass: { type: string, enum: [nasional, nasional_provinsi, semua] }
 *               status: { type: string, enum: [collecting, paused] }
 *     responses:
 *       200:
 *         description: Zona diperbarui
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Zone' }
 *       403: { description: FORBIDDEN atau ROAD_CLASS_NOT_ALLOWED }
 *       404: { description: NOT_FOUND }
 *       422: { description: ZONE_NAME_TAKEN atau VALIDATION_ERROR }
 */
router.patch('/zones/:id', zoneController.update)

/**
 * @swagger
 * /zones/{id}:
 *   delete:
 *     summary: Hapus zona
 *     tags: [Zones]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Zona dihapus }
 *       403: { description: FORBIDDEN — zona milik user lain }
 *       404: { description: NOT_FOUND }
 */
router.delete('/zones/:id', zoneController.remove)

/**
 * @swagger
 * /traffic/preview:
 *   get:
 *     summary: Proxy HERE Traffic Flow untuk preview di browser
 *     description: >
 *       Ada supaya HERE_API_KEY tidak pernah sampai ke browser (ADR-010), dan supaya
 *       batas kelas jalan diterapkan di server — tidak bisa diakali lewat devtools.
 *       Kelas yang diminta otomatis dipersempit ke batas paket (BR-022) alih-alih
 *       ditolak, karena ini preview dan menolaknya akan memblokir layar upgrade.
 *       Bbox dibatasi 0.5° per sisi: HERE dibayar per request dan area sebesar benua
 *       menghasilkan respons yang cukup besar untuk menghambat API.
 *     tags: [Zones]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: bbox
 *         required: true
 *         schema: { type: string }
 *         example: 110.360,-7.800,110.370,-7.790
 *         description: west,south,east,north (WGS84)
 *       - in: query
 *         name: roadClass
 *         schema: { type: string, enum: [nasional, nasional_provinsi, semua] }
 *     responses:
 *       200:
 *         description: GeoJSON FeatureCollection berisi LineString per ruas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     type: { type: string, example: FeatureCollection }
 *                     features: { type: array, items: { type: object } }
 *       401: { description: UNAUTHORIZED }
 *       422: { description: VALIDATION_ERROR — bbox tidak valid atau terlalu luas }
 *       502: { description: UPSTREAM_ERROR — HERE gagal, quota habis, atau key salah }
 */
router.get('/traffic/preview', trafficController.preview)

/**
 * @swagger
 * /traffic/road-class-counts:
 *   get:
 *     summary: Berapa ruas & km yang didapat tiap kelas jalan di sebuah bbox (BR-022)
 *     description: >
 *       Dibaca oleh langkah pemilihan kelas jalan di wizard zona. Menggantikan katalog
 *       lokal yang mengabaikan geometri dan mengembalikan angka karangan yang sama di
 *       mana pun zona digambar — padahal angka itulah yang seharusnya menjelaskan beda
 *       antar paket.
 *
 *       ⚠️ Hitungan untuk kelas DI ATAS paket pemanggil tetap dikembalikan, berbeda dari
 *       /traffic/preview yang memotong hasilnya. Menghitung bukan melihat: pemanggil tahu
 *       zona Premium di sini akan mencakup 8.684 ruas dan bukan 1.043, tanpa mendapat satu
 *       pun geometri-nya. Menyembunyikan angkanya justru membuat ajakan upgrade tidak
 *       punya apa-apa untuk dikatakan.
 *
 *       Biayanya tiga request HERE, satu per tingkat, dijalankan paralel. Tidak bisa satu:
 *       respons flow tidak memuat functional class, jadi pemisahannya hanya bisa dilakukan
 *       dengan menanyakan tiga pertanyaan berbeda ke HERE.
 *     tags: [Zones]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: bbox
 *         required: true
 *         schema: { type: string }
 *         example: 110.330,-7.820,110.430,-7.740
 *         description: west,south,east,north (WGS84)
 *     responses:
 *       200:
 *         description: Jumlah ruas & panjang per kelas jalan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     counts:
 *                       type: object
 *                       properties:
 *                         nasional: { type: object, properties: { roads: { type: integer }, lengthKm: { type: number } } }
 *                         nasional_provinsi: { type: object, properties: { roads: { type: integer }, lengthKm: { type: number } } }
 *                         semua: { type: object, properties: { roads: { type: integer }, lengthKm: { type: number } } }
 *                     maxRoadClass:
 *                       type: string
 *                       enum: [nasional, nasional_provinsi, semua]
 *                       description: Kelas tertinggi yang boleh dipakai paket pemanggil
 *       401: { description: UNAUTHORIZED }
 *       422: { description: VALIDATION_ERROR — bbox tidak valid atau terlalu luas }
 *       502: { description: UPSTREAM_ERROR — HERE gagal atau quota habis }
 */
router.get('/traffic/road-class-counts', trafficController.roadClassCounts)

export default router
