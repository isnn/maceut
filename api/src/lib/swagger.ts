import path from 'node:path'
import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'
import type { Express } from 'express'
import { config } from '../config/env'

/**
 * Swagger is generated from the `@swagger` JSDoc blocks above each route (ADR-012),
 * so the docs live with the code and cannot drift from it silently.
 *
 * Both .ts and .js are scanned: under `tsx watch` the sources are .ts, in the built
 * image they are .js in dist/. Scanning only one means an empty spec in the other.
 */
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Maceut API',
      version: '0.1.0',
      description:
        'Traffic monitoring and scheduled capture platform. All responses follow ' +
        '`{ success, data }` or `{ success, error: { code, message } }`.',
    },
    servers: [{ url: config.appBaseUrl }],
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'token' },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', example: 'Input tidak valid.' },
                details: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, '../routes/*.ts'), path.join(__dirname, '../routes/*.js')],
}

export const swaggerSpec = swaggerJsdoc(options)

export function mountSwagger(app: Express) {
  if (!config.swaggerEnabled) return
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'Maceut API' }))
  app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec))
}
