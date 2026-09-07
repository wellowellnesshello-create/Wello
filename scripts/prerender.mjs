// Post-build step: renders each landing route to a static HTML file at
// dist/<path>/index.html. Google indexes the pre-rendered content; React
// hydrates on visitor load. Run automatically via `npm run build`.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LANDING_ROUTES } from '../src/landingRoutes.js';
import CategoryLanding from '../src/CategoryLanding.jsx';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(rootDir, 'dist');
const canonicalOrigin = 'https://www.wello-wellness.com';

const templateHtml = await readFile(join(distDir, 'index.html'), 'utf8');

// Sanity check: the SPA template must have exactly one <div id="root"></div>
// so we know where to inject SSR output. Any change to index.html that
// breaks this marker will surface here with a clear error instead of
// silently producing empty landing pages.
const rootMarker = '<div id="root"></div>';
if (!templateHtml.includes(rootMarker)) {
  throw new Error(`prerender: could not find "${rootMarker}" in dist/index.html — SPA template shape changed?`);
}

function withMeta(html, { title, metaDescription, canonicalPath }) {
  // Replace <title>, <meta name="description">, and <link rel="canonical">
  // with landing-specific values. Falls back to a hard error if any tag
  // is missing so a template drift can't silently ship a landing with
  // the site-wide (wrong) title.
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
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

for (const route of LANDING_ROUTES) {
  const rendered = renderToString(createElement(CategoryLanding, { route }));
  const injected = templateHtml.replace(rootMarker, `<div id="root">${rendered}</div>`);
  const withHead = withMeta(injected, {
    title: route.title,
    metaDescription: route.metaDescription,
    canonicalPath: route.path,
  });
  const outDir = join(distDir, route.path);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'index.html'), withHead, 'utf8');
  console.log(`prerender: wrote ${route.path}/index.html`);
}
