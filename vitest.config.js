import { defineConfig } from 'vitest/config'

// Ledger tests hit a running local Supabase (`supabase start`). The
// setup file (test/setup.js) reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// from the environment and skips the suite if they're not set, so
// `npm test` won't blow up on machines without a local stack.
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    setupFiles: ['test/setup.js'],
    testTimeout: 20000,
  },
})
