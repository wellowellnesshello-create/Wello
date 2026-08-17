import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// /cancel/:token — branded proxy to the studio-cancel-booking edge function
// (which handles both studio and private-instructor bookings). We intercept
// before React mounts so the partner sees no app flash between tap and the
// edge function's own confirmation page. Skips React entirely on match.
const cancelMatch = window.location.pathname.match(/^\/cancel\/([^/?#]+)/)
if (cancelMatch && import.meta.env.VITE_SUPABASE_URL) {
  const token = cancelMatch[1]
  const base  = import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')
  window.location.replace(`${base}/functions/v1/studio-cancel-booking?t=${token}`)
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
