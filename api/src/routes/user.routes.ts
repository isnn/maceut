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
