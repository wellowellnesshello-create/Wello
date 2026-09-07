import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App, { PrivacyPage, TermsPage } from './App.jsx'
import CategoryLanding from './CategoryLanding.jsx'
import { LANDING_ROUTES } from './landingRoutes.js'

// /cancel/:token — branded proxy to the studio-cancel-booking edge function
// (which handles both studio and private-instructor bookings). We intercept
// before React mounts so the partner sees no app flash between tap and the
// edge function's own confirmation page. Skips React entirely on match.
const cancelMatch = window.location.pathname.match(/^\/cancel\/([^/?#]+)/)

// /privacy and /terms — standalone legal pages served at their own URLs
// (EU GDPR requires the privacy notice be reachable via a stable URL, not
// only via an in-app modal). Render just the legal page, no app chrome.
const path = window.location.pathname.replace(/\/+$/, '') || '/'
const legalPage = path === '/privacy' ? <PrivacyPage />
                : path === '/terms'   ? <TermsPage />
                : null

// SEO landing pages (/yoga-mallorca etc). Pre-rendered to static HTML
// by scripts/prerender.mjs at build time so Google indexes the content;
// on visitor load React hydrates the same tree so the CTA is interactive
// and the logged-in redirect can fire. Route match is exact so we don't
// accidentally hijack SPA URLs that happen to share a prefix.
const landingRoute = LANDING_ROUTES.find(r => r.path === path) || null

if (cancelMatch && import.meta.env.VITE_SUPABASE_URL) {
  const token = cancelMatch[1]
  const base  = import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')
  window.location.replace(`${base}/functions/v1/studio-cancel-booking?t=${token}`)
} else if (legalPage) {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      {legalPage}
      <Analytics debug={import.meta.env.DEV} />
    </StrictMode>,
  )
} else if (landingRoute) {
  // hydrateRoot (not createRoot) so React attaches to the pre-rendered
  // DOM instead of replacing it — visitors on a cold link see no flash.
  // window.__WELLO_LANDING__.venues is injected by scripts/prerender.mjs
  // so the initial render on the client matches the SSR HTML exactly
  // (no hydration mismatch). Falls back to null on the dev server where
  // there's no prerender output; the useEffect fetch then populates.
  const injected = (typeof window !== 'undefined' && window.__WELLO_LANDING__ && window.__WELLO_LANDING__.path === landingRoute.path)
    ? window.__WELLO_LANDING__.venues
    : null;
  hydrateRoot(document.getElementById('root'),
    <StrictMode>
      <CategoryLanding route={landingRoute} initialVenues={injected} />
      <Analytics debug={import.meta.env.DEV} />
    </StrictMode>,
  )
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
      <Analytics debug={import.meta.env.DEV} />
    </StrictMode>,
  )
}
