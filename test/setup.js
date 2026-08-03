import { beforeAll } from 'vitest'

// Shared setup for ledger tests. Reads the local Supabase env values
// once and re-exports a service-role client factory. Tests that need a
// running stack should call ensureSupabase() at the top of their
// describe block — it will skip cleanly with a warning if the env
// values aren't present rather than making the whole run red on a
// machine without `supabase start`.

let announced = false

export const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ''
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ''

export function hasLocalSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
}

beforeAll(() => {
  if (!announced) {
    announced = true
    if (!hasLocalSupabase()) {
      // eslint-disable-next-line no-console
      console.warn(
        '[test/setup] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — ledger tests will skip. ' +
        'Run: supabase start && export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...'
      )
    }
  }
})
