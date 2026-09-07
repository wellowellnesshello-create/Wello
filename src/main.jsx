import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App, { PrivacyPage, TermsPage } from './App.jsx'

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
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
      <Analytics debug={import.meta.env.DEV} />
    </StrictMode>,
  )
}
