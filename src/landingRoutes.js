// Landing pages for SEO. Every entry becomes a pre-rendered HTML file
// at dist/<path>/index.html and a matching path-sniff route in main.jsx.
//
// Single source of truth for:
//   - The prerender script (scripts/prerender.mjs)
//   - Client-side routing in src/main.jsx
//   - The sitemap regeneration (Phase 4)

export const LANDING_ROUTES = [
  {
    path: "/yoga-mallorca",
    // Client-side filter used when the logged-in-redirect fires and when
    // the "See all yoga in Mallorca" CTA takes the visitor into Explore.
    cat: "Yoga",
    location: "Mallorca",
    // SEO head
    title: "Yoga Mallorca — Drop-in Classes & Studio Passes | Wello",
    metaDescription: "Book yoga classes across Mallorca on one pass. Palma, Deià, Sóller and beyond — one membership, credits at every partner studio. No lock-in.",
    // Landing content
    eyebrow: "The Wellness Pass · Mallorca",
    h1: "Yoga in Mallorca",
    subhead: "Drop into a class in Palma, a beachfront flow in Deià or a slow morning in Sóller. One pass. Every studio worth going to.",
    heroImage: "https://images.unsplash.com/photo-1588286840104-8957b019727f?w=1600&q=80",
    // FAQ — 5-6 category-specific answers. Rendered both as visible
    // accordion (for humans) and as JSON-LD FAQPage schema (for Google).
    faq: [
      {
        q: "Where can I do yoga in Mallorca with a Wello pass?",
        a: "Wello partners with studios across Palma, Deià, Sóller, Portals, Santa Ponsa and Alcúdia. You pick the class and pay with credits — the same pass works at every partner studio, so you can flow through half the island on one membership.",
      },
      {
        q: "How much does a yoga class cost on Wello?",
        a: "Yoga drop-ins are typically 20 credits (€20) off-peak and 25 credits (€25) peak. Credits are 1:1 with euros. Studios set their own prices, so a few specialist classes may be more or less — the credit cost is always shown before you book.",
      },
      {
        q: "Do I need a monthly membership?",
        a: "No. Wello is credit-based, not a monthly subscription. Buy a pass when you want it, use the credits when it suits you. No auto-renew, no lock-in.",
      },
      {
        q: "Can I try yoga even if I've never done it before?",
        a: "Yes — most studios on Wello offer beginner-friendly classes clearly marked in the timetable. Filter by class name or ask the studio directly through the app before booking.",
      },
      {
        q: "Can I book yoga classes on the same day?",
        a: "Yes. Most classes on Wello are instant-book right up to the start time, subject to studio availability. A few venues require 12 hours' notice — this is shown on each class before you confirm.",
      },
      {
        q: "What if I need to cancel a yoga class?",
        a: "Cancellation windows are set by each studio and shown before you book. Cancel within the window and your credits are refunded automatically. Outside the window, the class holds.",
      },
    ],
  },
];
