import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Prisma 7 separates the database URL from the schema file.
// This file configures the URL used by Prisma CLI commands (migrate, studio, db push).
// The runtime connection is configured via the PrismaPg adapter in src/lib/prisma.ts.
//
// dotenv/config is imported here so `prisma migrate` and `prisma studio` can read
// DATABASE_URL from apps/api/.env without needing it set in the shell environment.
export default defineConfig({
  migrate: {
    url: process.env.DATABASE_URL!,
  },
})
