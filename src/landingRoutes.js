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
    title: "Yoga Mallorca | Drop-in Classes & Studio Passes | Wello",
    metaDescription: "Book yoga classes across Mallorca on one pass. One membership, credits at every partner studio. No lock-in, no auto-renew.",
    // Landing content
    eyebrow: "The Wellness Pass · Mallorca",
    h1: "Yoga in Mallorca",
    subhead: "One pass, credits that work at every partner studio. Book a drop-in class, a private session or a whole week — no monthly lock-in.",
    heroImage: "https://images.unsplash.com/photo-1588286840104-8957b019727f?w=1600&q=80",
    // FAQ — 5-6 category-specific answers. Rendered both as visible
    // accordion (for humans) and as JSON-LD FAQPage schema (for Google).
    faq: [
      {
        q: "Where can I do yoga in Mallorca with a Wello pass?",
        a: "Every partner studio is listed above with its town on the card. You pick the class and pay with credits — the same pass works at every partner studio, so one membership covers the island.",
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
  // Pilates entry is drafted and template-verified, but withheld from
  // LANDING_ROUTES until we have a live pilates partner — shipping now
  // means a Google visitor lands on a page whose CTA dumps them into an
  // empty Explore filter. Uncomment the object below (and drop the /*
  // */ wrapping) once the first pilates studio is live.
  /*
  {
    path: "/pilates-mallorca",
    cat: "Pilates",
    location: "Mallorca",
    title: "Pilates Mallorca | Reformer & Mat Classes | Wello",
    metaDescription: "Book pilates in Mallorca on one pass. Reformer and mat classes — one membership, credits at every partner studio. No lock-in.",
    eyebrow: "The Wellness Pass · Mallorca",
    h1: "Pilates in Mallorca",
    subhead: "Reformer or mat, drop-in or private. One pass, credits that work at every partner studio — no monthly lock-in.",
    heroImage: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1600&q=80",
    faq: [
      {
        q: "Where can I do pilates in Mallorca with a Wello pass?",
        a: "Every partner studio is listed above with its town on the card. Book any class and pay in credits — the same pass works at every partner studio.",
      },
      {
        q: "What's the difference between reformer and mat pilates?",
        a: "Mat pilates uses your bodyweight on the floor — most yoga studios can teach it. Reformer uses a spring-loaded carriage that adds resistance and support; it's a smaller class, usually in a specialist studio, and tends to cost a little more per session.",
      },
      {
        q: "How much does a pilates class cost on Wello?",
        a: "Mat pilates is typically 20 credits (€20) off-peak, 25 credits (€25) peak. Reformer classes are usually 25–35 credits depending on the studio. Credits are 1:1 with euros and the cost is shown before you book.",
      },
      {
        q: "Do I need pilates experience to start?",
        a: "Most studios on Wello run beginner-friendly classes clearly labelled in the timetable. Reformer studios usually ask new students to take an intro session first — this is noted on the class listing.",
      },
      {
        q: "Can I book pilates classes on the same day?",
        a: "Yes. Most classes on Wello are instant-book right up to the start time. A few studios (mostly reformer) require 12 hours' notice so they can set the equipment for the right participants — this is shown before you confirm.",
      },
      {
        q: "What if I need to cancel a pilates class?",
        a: "Cancellation windows are set by each studio. Cancel within the window and your credits are refunded automatically. Outside the window (common for reformer classes because of equipment prep), the credits hold on the booking.",
      },
    ],
  },
  */
];
