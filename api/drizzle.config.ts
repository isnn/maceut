import { defineConfig } from 'drizzle-kit'
import { config } from './src/config/env'

// The connection string comes from the same derived config the app uses, so
// drizzle-kit can never point at a different database than the running API.
export default defineConfig({
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: config.databaseUrl },
  verbose: true,
  strict: true,
})
