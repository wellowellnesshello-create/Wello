// Post-build step: renders each landing route to a static HTML file at
// dist/<path>/index.html and regenerates dist/sitemap.xml so Google can
// discover the new URLs. Runs automatically via `npm run build`.
//
// Runs with `tsx --env-file=.env.local` locally (Node --env-file support
// via tsx) so process.env has the Vite variables. On Vercel, env vars
// are populated from project settings — the --env-file flag is ignored
// gracefully when the file is missing.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createClient } from '@supabase/supabase-js';
import { LANDING_ROUTES } from '../src/landingRoutes.js';
import CategoryLanding from '../src/CategoryLanding.jsx';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(rootDir, 'dist');
const canonicalOrigin = 'https://www.wello-wellness.com';

const supaUrl = process.env.VITE_SUPABASE_URL;
const supaKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!supaUrl || !supaKey) {
  throw new Error('prerender: missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Locally run with `tsx --env-file=.env.local`; on Vercel set them in project env vars.');
}
const supa = createClient(supaUrl, supaKey);

const templateHtml = await readFile(join(distDir, 'index.html'), 'utf8');
const rootMarker = '<div id="root"></div>';
if (!templateHtml.includes(rootMarker)) {
  throw new Error(`prerender: could not find "${rootMarker}" in dist/index.html — SPA template shape changed?`);
}

// Fetches the live venues for a category. Result is embedded directly
// in the SSR HTML so Google indexes real partner names (the critique
// item: JS-injected content ≠ crawlable). Filters out demo seed rows
// so public pages don't advertise fake partners as first impressions.
async function fetchVenuesForCategory(cat) {
  const { data, error } = await supa
    .from('listings')
    .select('id, name, cat, loc, img, cr, rating, reviews, businesses(name, slug, gallery, email)')
    .eq('status', 'active')
    .or(`cat.eq.${cat},session_categories.cs.{${cat}}`)
    .limit(8);
  if (error) { console.warn(`prerender: fetch for ${cat} failed:`, error.message); return []; }
  // Filter demo seed rows on BOTH email and name — some seeds use a
  // `demo-` email prefix, others use a `DEMO` name prefix. Either
  // pattern indicates a row that shouldn't reach a Google visitor.
  return (data || []).filter(r => {
    const email = String(r.businesses?.email || '').toLowerCase();
    const name = String(r.businesses?.name || r.name || '').toLowerCase();
    return !email.startsWith('demo-') && !name.startsWith('demo');
  });
}

function withMeta(html, { title, metaDescription, canonicalPath, venuesGlobal }) {
  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
  out = out.replace(
    /<meta name="description"[^>]*>/,
    `<meta name="description" content="${escapeHtml(metaDescription)}" />`
  );
  out = out.replace(
    /<link rel="canonical"[^>]*>/,
    `<link rel="canonical" href="${canonicalOrigin}${canonicalPath}" />`
  );
  // Inject the venues payload BEFORE the SPA <script> tag so main.jsx
  // can read window.__WELLO_LANDING__ at initial state time (before
  // hydrateRoot runs) — otherwise the initial state would be null and
  // hydration would mismatch the SSR HTML that includes the grid.
  out = out.replace(
    /<script type="module"/,
    `<script>window.__WELLO_LANDING__=${JSON.stringify(venuesGlobal)};</script>\n    <script type="module"`
  );
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

for (const route of LANDING_ROUTES) {
  const venues = await fetchVenuesForCategory(route.cat);
  const rendered = renderToString(createElement(CategoryLanding, { route, initialVenues: venues }));
  const injected = templateHtml.replace(rootMarker, `<div id="root">${rendered}</div>`);
  const withHead = withMeta(injected, {
    title: route.title,
    metaDescription: route.metaDescription,
    canonicalPath: route.path,
    venuesGlobal: { venues, path: route.path },
  });
  const outDir = join(distDir, route.path);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'index.html'), withHead, 'utf8');
  console.log(`prerender: wrote ${route.path}/index.html (${venues.length} live venues baked in)`);
}

// Regenerate sitemap.xml with every canonical URL. Overwrites what
// Vite copied from public/ so a stale hand-maintained sitemap can't
// drift out of sync with the routes actually shipped.
const staticUrls = [
  { loc: '/',        changefreq: 'daily',   priority: '1.0' },
  { loc: '/privacy', changefreq: 'monthly', priority: '0.3' },
  { loc: '/terms',   changefreq: 'monthly', priority: '0.3' },
];
const landingUrls = LANDING_ROUTES.map(r => ({ loc: r.path, changefreq: 'weekly', priority: '0.8' }));
const allUrls = [...staticUrls, ...landingUrls];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${canonicalOrigin}${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
await writeFile(join(distDir, 'sitemap.xml'), sitemap, 'utf8');
console.log(`prerender: wrote sitemap.xml (${allUrls.length} URLs)`);
