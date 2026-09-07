// SEO landing page. Rendered *both* server-side (scripts/prerender.mjs)
// and client-side (main.jsx via hydrateRoot). Everything above the fold
// must be pure, deterministic JSX so the SSR output matches what React
// hydrates — no window/document access at render time. Interactive
// extras (logged-in redirect, listings fetch) live inside useEffects
// and only run in the browser.
//
// This file must NOT statically import supabase — the prerender script
// executes it in Node where import.meta.env is unset, which would
// throw at import time. Use dynamic import() inside effects.

import { useEffect, useState } from 'react';

const T = {
  bg:     "#FBF9F4",
  ink:    "#1B1C19",
  ink2:   "#43483F",
  stone:  "#54584F",
  sage:   "#213C18",
  sageL:  "#A3B18A",
  sageXL: "#CAECBA",
  clay:   "#D6B47C",
  clayXL: "#F7EDD8",
  paper:  "#FFFFFF",
  border: "#E4E2DD",
};
const F = "'Manrope','Jost',system-ui,sans-serif";

export default function CategoryLanding({ route }) {
  // Logged-in visitors skip the landing and drop straight into Explore
  // with the matching category pre-selected. We key off the supabase
  // auth token in localStorage — no need to spin up the full client
  // for a read that just decides whether to redirect.
  useEffect(() => {
    try {
      const hasAuth = Object.keys(localStorage).some(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (hasAuth) window.location.replace(`/?view=explore&cat=${encodeURIComponent(route.cat)}`);
    } catch { /* localStorage blocked — treat as logged-out */ }
  }, [route.cat]);

  // Live venues for this category, fetched after hydration. Dynamic
  // import so this file stays SSR-safe (supabase.js reads Vite env vars
  // that don't exist in Node). Empty result -> hide the section.
  const [venues, setVenues] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { supabase } = await import('./supabase.js');
        const todayIso = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from('listings')
          .select('id, name, cat, loc, img, cr, rating, reviews, businesses(name, slug, gallery, email)')
          .eq('status', 'active')
          .or(`cat.eq.${route.cat},session_categories.cs.{${route.cat}}`)
          .gte('slots.date', todayIso)
          .limit(8);
        if (error) throw error;
        if (!alive) return;
        // Hide the seed demo rows (demo- email prefix) on public landings
        // so a Google visitor doesn't see fake partners as their first
        // impression of the marketplace.
        const real = (data || []).filter(r => !/^demo-/i.test(r.businesses?.email || ''));
        setVenues(real);
      } catch { if (alive) setVenues([]); }
    })();
    return () => { alive = false; };
  }, [route.cat]);

  const [openFaq, setOpenFaq] = useState(null);

  const exploreHref = `/?view=explore&cat=${encodeURIComponent(route.cat)}`;
  const creditsHref = `/?view=credits`;

  // FAQ structured data — indexed as an FAQ rich result on Google.
  // Serialised as JSON so it survives escaping in both SSR and hydration.
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": route.faq.map(({ q, a }) => ({
      "@type": "Question",
      "name": q,
      "acceptedAnswer": { "@type": "Answer", "text": a },
    })),
  };

  return (
    <div style={{ background: T.bg, color: T.ink, fontFamily: F, minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* ── HERO ── */}
      <header style={{
        position: 'relative',
        minHeight: '100svh',
        display: 'flex', flexDirection: 'column',
        padding: 'clamp(20px,4vw,32px)',
        background: `linear-gradient(180deg, rgba(251,249,244,0.72) 0%, rgba(251,249,244,0.55) 60%, rgba(251,249,244,0.92) 100%), url(${route.heroImage}) center/cover no-repeat`,
      }}>
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
          <a href="/" style={{ fontFamily: F, fontSize: 22, fontWeight: 800, color: T.sage, letterSpacing: '-0.8px', textDecoration: 'none' }}>wello</a>
          <a href={creditsHref} style={{ fontFamily: F, fontSize: 13, fontWeight: 700, color: T.sage, textDecoration: 'none', letterSpacing: '-0.2px' }}>Buy pass →</a>
        </nav>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(40px,6vw,96px) 0' }}>
          <div style={{ maxWidth: 820, width: '100%', textAlign: 'center' }}>
            <p style={{ fontFamily: F, fontSize: 11, fontWeight: 700, color: T.sage, letterSpacing: '3px', textTransform: 'uppercase', margin: '0 0 14px', opacity: 0.85 }}>{route.eyebrow}</p>
            <h1 style={{ fontFamily: F, fontWeight: 800, fontSize: 'clamp(44px,9vw,112px)', color: T.sage, lineHeight: 1.02, letterSpacing: 'clamp(-2px,-0.04em,-5px)', margin: '0 0 clamp(16px,3vw,28px)' }}>{route.h1}</h1>
            <p style={{ fontFamily: F, fontSize: 'clamp(16px,2vw,20px)', color: T.ink2, fontWeight: 500, lineHeight: 1.5, maxWidth: 560, margin: '0 auto clamp(24px,4vw,40px)', letterSpacing: '-0.2px' }}>{route.subhead}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href={exploreHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 30px', borderRadius: 999, background: T.sage, color: T.bg, border: `2px solid ${T.sage}`, fontFamily: F, fontSize: 14, fontWeight: 700, textDecoration: 'none', boxShadow: '0 6px 16px rgba(33,60,24,0.18)' }}>Browse {route.cat.toLowerCase()} studios →</a>
              <a href={creditsHref} style={{ padding: '14px 30px', borderRadius: 999, background: 'transparent', color: T.sage, border: `2px solid ${T.sage}`, fontFamily: F, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>Get your pass</a>
            </div>
          </div>
        </div>
      </header>

      {/* ── STATEMENT STRIP ── */}
      <div style={{ background: T.sage, padding: '14px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          {['No membership', 'One pass', 'Every studio'].map((s, i, arr) => (
            <span key={s} style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontFamily: F, fontSize: 11, fontWeight: 600, color: T.sageXL, letterSpacing: '-0.2px', padding: '4px 12px', whiteSpace: 'nowrap' }}>{s}</span>
              {i < arr.length - 1 && <span style={{ color: 'rgba(163,177,138,0.4)' }}>·</span>}
            </span>
          ))}
        </div>
      </div>

      {/* ── LIVE VENUES (hydrated) ── */}
      {venues && venues.length > 0 && (
        <section style={{ padding: 'clamp(48px,6vw,88px) clamp(16px,4vw,32px)', maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 'clamp(24px,4vw,40px)', gap: 12 }}>
            <div>
              <p style={{ fontFamily: F, fontSize: 10, fontWeight: 700, color: T.sageL, letterSpacing: '3px', textTransform: 'uppercase', margin: '0 0 6px' }}>Live on Wello</p>
              <h2 style={{ fontFamily: F, fontSize: 'clamp(26px,4.5vw,44px)', fontWeight: 800, color: T.ink, letterSpacing: '-1.5px', margin: 0, lineHeight: 1.05 }}>{route.cat} studios in {route.location}</h2>
            </div>
            <a href={exploreHref} style={{ fontFamily: F, fontSize: 13, fontWeight: 700, color: T.sage, textDecoration: 'none' }}>See all →</a>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,240px),1fr))', gap: 16 }}>
            {venues.slice(0, 8).map(v => {
              const gallery = Array.isArray(v.businesses?.gallery) ? v.businesses.gallery : [];
              const img = v.img || gallery[0] || 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80';
              const name = v.businesses?.name || v.name;
              const href = v.businesses?.slug ? `/venue/${v.businesses.slug}` : exploreHref;
              return (
                <a key={v.id} href={href} style={{ textDecoration: 'none', color: T.ink, background: T.paper, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', display: 'block' }}>
                  <div style={{ aspectRatio: '4 / 3', background: `url(${img}) center/cover no-repeat`, borderBottom: `1px solid ${T.border}` }} />
                  <div style={{ padding: '14px 16px 16px' }}>
                    <p style={{ fontFamily: F, fontSize: 15, fontWeight: 700, color: T.ink, margin: '0 0 4px', letterSpacing: '-0.3px' }}>{name}</p>
                    <p style={{ fontFamily: F, fontSize: 12, color: T.stone, margin: '0 0 10px' }}>📍 {v.loc}</p>
                    <p style={{ fontFamily: F, fontSize: 12, fontWeight: 600, color: T.sage, margin: 0 }}>◈ {v.cr} per session</p>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* ── HOW IT WORKS ── */}
      <section style={{ padding: 'clamp(48px,6vw,88px) clamp(16px,4vw,32px)', background: T.clayXL }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={{ fontFamily: F, fontSize: 10, fontWeight: 700, color: T.clay, letterSpacing: '3px', textTransform: 'uppercase', margin: '0 0 8px', textAlign: 'center' }}>How Wello works</p>
          <h2 style={{ fontFamily: F, fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800, color: T.sage, letterSpacing: '-1.2px', textAlign: 'center', margin: '0 0 clamp(32px,5vw,56px)', lineHeight: 1.1 }}>Three steps. No lock-in.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 'clamp(20px,3vw,40px)' }}>
            {[
              { n: '01', t: 'Buy credits', d: 'One pass, top up when you need it. Credits are 1:1 with euros. Never expire.' },
              { n: '02', t: `Book ${route.cat.toLowerCase()}`, d: `Filter by studio, town or class. Book the slot you want in a couple of taps — most classes confirm instantly.` },
              { n: '03', t: 'Show up', d: 'Your booking, your credits, your class. Cancel within the studio\'s window if plans change and credits come back.' },
            ].map(step => (
              <div key={step.n}>
                <p style={{ fontFamily: F, fontSize: 40, fontWeight: 800, color: T.sage, letterSpacing: '-1.5px', margin: '0 0 8px', opacity: 0.35 }}>{step.n}</p>
                <h3 style={{ fontFamily: F, fontSize: 18, fontWeight: 700, color: T.sage, letterSpacing: '-0.5px', margin: '0 0 8px' }}>{step.t}</h3>
                <p style={{ fontFamily: F, fontSize: 14, color: T.ink2, lineHeight: 1.6, margin: 0 }}>{step.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ padding: 'clamp(48px,6vw,88px) clamp(16px,4vw,32px)' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <p style={{ fontFamily: F, fontSize: 10, fontWeight: 700, color: T.sageL, letterSpacing: '3px', textTransform: 'uppercase', margin: '0 0 8px', textAlign: 'center' }}>Frequently asked</p>
          <h2 style={{ fontFamily: F, fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800, color: T.sage, letterSpacing: '-1.2px', textAlign: 'center', margin: '0 0 clamp(32px,5vw,48px)', lineHeight: 1.1 }}>{route.cat} in {route.location} — questions</h2>
          <div>
            {route.faq.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={i} style={{ borderTop: `1px solid ${T.border}`, borderBottom: i === route.faq.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                  <button onClick={() => setOpenFaq(open ? null : i)}
                    style={{ width: '100%', background: 'transparent', border: 'none', padding: '20px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left', fontFamily: F, fontSize: 16, fontWeight: 600, color: T.ink, letterSpacing: '-0.3px' }}>
                    <span>{item.q}</span>
                    <span style={{ fontSize: 20, color: T.sage, flexShrink: 0, marginLeft: 12, transition: 'transform .18s ease', transform: open ? 'rotate(45deg)' : 'rotate(0)' }}>+</span>
                  </button>
                  {open && (
                    <div style={{ padding: '0 4px 20px', fontFamily: F, fontSize: 15, color: T.ink2, lineHeight: 1.65 }}>{item.a}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ padding: 'clamp(48px,6vw,88px) clamp(16px,4vw,32px)', background: T.sage, textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ fontFamily: F, fontSize: 'clamp(28px,5vw,52px)', fontWeight: 800, color: T.bg, letterSpacing: '-1.5px', lineHeight: 1.05, margin: '0 0 16px' }}>Ready to start {route.cat.toLowerCase()} in {route.location}?</h2>
          <p style={{ fontFamily: F, fontSize: 'clamp(15px,1.8vw,18px)', color: 'rgba(251,249,244,0.75)', fontWeight: 500, lineHeight: 1.55, margin: '0 0 clamp(24px,3vw,32px)' }}>One pass. Every studio worth going to. No monthly lock-in.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={creditsHref} style={{ display: 'inline-block', padding: '14px 32px', borderRadius: 999, background: T.bg, color: T.sage, fontFamily: F, fontSize: 14, fontWeight: 800, textDecoration: 'none' }}>Get your pass →</a>
            <a href={exploreHref} style={{ padding: '14px 32px', borderRadius: 999, background: 'transparent', color: T.bg, border: `2px solid ${T.bg}`, fontFamily: F, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>Browse studios</a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: '32px 24px', textAlign: 'center', background: T.bg, borderTop: `1px solid ${T.border}` }}>
        <p style={{ fontFamily: F, fontSize: 12, color: T.stone, margin: 0, letterSpacing: '-0.1px' }}>
          <a href="/" style={{ color: T.stone, textDecoration: 'none' }}>wello</a> · one wellness pass for Mallorca · <a href="/privacy" style={{ color: T.stone, textDecoration: 'none' }}>Privacy</a> · <a href="/terms" style={{ color: T.stone, textDecoration: 'none' }}>Terms</a>
        </p>
      </footer>
    </div>
  );
}
