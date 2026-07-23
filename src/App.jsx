import { supabase } from './supabase.js'
import { useState, useEffect, useCallback, useRef } from "react";

function useHasMoreBelow() {
  // True only while the user has meaningful content still below the viewport.
  // Was previously "is the page scrollable at all" which kept the button stuck
  // on screen even after the user reached the bottom.
  const [more, setMore] = useState(false);
  useEffect(() => {
    function check() {
      const total = document.documentElement.scrollHeight;
      const view  = window.innerHeight;
      const y     = window.scrollY || document.documentElement.scrollTop || 0;
      const distanceFromBottom = total - (y + view);
      setMore(distanceFromBottom > 240); // hide once user is within ~one section of the bottom
    }
    check();
    window.addEventListener('resize', check);
    window.addEventListener('scroll', check, { passive: true });
    return () => { window.removeEventListener('resize', check); window.removeEventListener('scroll', check); };
  }, []);
  return more;
}

function ScrollDownBtn({ enabled = true }) {
  const hasMore = useHasMoreBelow();
  if (!enabled || !hasMore) return null;
  function handleScroll() {
    const featured = document.getElementById("statement-strip");
    if (featured) {
      featured.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollBy({ top: window.innerHeight * 0.8, behavior: "smooth" });
    }
  }
  return (
    <div className="scroll-indicator" style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",zIndex:490,cursor:"pointer"}}
      onClick={handleScroll}>
      <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(33,60,24,0.85)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 14px rgba(33,60,24,0.25)",animation:"bounce 2s ease-in-out infinite"}}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 6L8 11L13 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
    </div>
  );
}

function useWindowWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => {
    const handle = () => setW(window.innerWidth);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return w;
}

// ── SEO Meta Tags ─────────────────────────────────────────────
function SEO({ title, description, path="" }) {
  useEffect(()=>{
    document.title = title || "Wello — The Wellness Pass";
    const setMeta = (name, content, prop=false) => {
      const sel = prop ? `meta[property="${name}"]` : `meta[name="${name}"]`;
      let el = document.querySelector(sel);
      if(!el){ el=document.createElement("meta"); prop?el.setAttribute("property",name):el.setAttribute("name",name); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    const desc = description || "Wello is your wellness pass. Book studio classes, gym access, hotel pools, spa treatments and outdoor adventures wherever you are.";
    const url = "https://wello-seven.vercel.app" + path;
    setMeta("description", desc);
    setMeta("keywords", "wellness pass, studio classes, yoga, pilates, gym day pass, spa, outdoor adventures, hotel pool, island wellness, ClassPass alternative");
    setMeta("og:title", title || "Wello — The Wellness Pass", true);
    setMeta("og:description", desc, true);
    setMeta("og:url", url, true);
    setMeta("og:type", "website", true);
    setMeta("og:site_name", "Wello", true);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", title || "Wello — The Wellness Pass");
    setMeta("twitter:description", desc);
    // Structured data — WebSite schema
    let sd = document.getElementById("wello-schema");
    if(!sd){ sd=document.createElement("script"); sd.id="wello-schema"; sd.type="application/ld+json"; document.head.appendChild(sd); }
    sd.textContent = JSON.stringify({
      "@context":"https://schema.org",
      "@type":"WebSite",
      "name":"Wello",
      "description":"Your wellness pass for the good life",
      "url":"https://wello-seven.vercel.app",
      "potentialAction":{ "@type":"SearchAction", "target":"https://wello-seven.vercel.app/?q={search_term_string}", "query-input":"required name=search_term_string" }
    });
  },[title, description, path]);
  return null;
}

// Calls the ai-chat Supabase Edge Function (which proxies to Anthropic
// server-side). Used to call api.anthropic.com directly from the browser,
// which CORS-blocked every request and exposed the API contract.
async function ai(sys, usr, tok = 900) {
  try {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: { system: sys, messages: [{ role: 'user', content: usr }], max_tokens: tok },
    });
    if (error) { console.warn('ai-chat invoke failed:', error.message); return ""; }
    return data?.content?.map(b => b.text || "").join("") || "";
  } catch (e) { console.warn('ai-chat exception:', e); return ""; }
}
async function aiJSON(sys, usr, tok = 900) {
  const t = await ai(sys, usr, tok);
  try { return JSON.parse(t.replace(/```json|```/g, "").trim()); } catch { return null; }
}

// Wello "Breathe" palette — Stitch-refined Mediterranean Noir
const T = {
  bg:      "#FBF9F4",   // Alabaster — warm off-white surface
  bg2:     "#F5F3EE",   // Surface container low
  bg3:     "#EAE8E3",   // Surface container high
  paper:   "#FFFFFF",   // Surface container lowest
  ink:     "#1B1C19",   // Obsidian — near-black with green undertone
  ink2:    "#43483F",   // On-surface variant
  stone:   "#54584F",   // Outline (darkened from #54584F for AA contrast — readable as body text on alabaster/paper)
  stone2:  "#C3C8BC",   // Outline variant
  sage:    "#213C18",   // Forest Green — primary brand
  sage2:   "#37532D",   // Primary container
  sageL:   "#A3B18A",   // Luminous Sage — accent
  sageXL:  "#CAECBA",   // Primary fixed
  moss:    "#49663E",   // Surface tint
  clay:    "#6F5B44",   // Secondary (warm sand)
  clayL:   "#DCC2A6",   // Secondary fixed dim
  clayXL:  "#FADEC0",   // Secondary container
  ochre:   "#B8925C",   // Kept for credit badges & accents
  ochreL:  "#D6B47C",
  ochreXL: "#F7EDD8",
  border:  "#E4E2DD",   // Surface variant
  border2: "#C3C8BC",   // Outline variant
};

// ─── Credit system ────────────────────────────────────────────────────────────
// 1 credit = €1 face value. Service fee: 10% at credit purchase, max €5.
// Credits are 1:1 with £/€. Venues set their own price.
// Your pass is valid for 6 months from top-up.
const BUNDLES = [
  { id:"wellolife", name:"Wello Life", cr:250, price:237.50, fullPrice:250, desc:"For those who make wellness part of island life.", badge:"5% off", popular:true },
];
const BOOKING_FEE_PCT = 0.10; // 10% of credit purchase value, max €5, charged at purchase not per booking

// Credit pricing — 1 credit = €1 face value.
// Venues set their own £ price. Credits = price in £ (1:1).
// Market reference: Yoga €20 = 20cr · Gym day pass €15 = 15cr · Spa 60min €60 = 60cr
const CREDIT_PRICING = [
  { cat:"Yoga class",        offPeak:"20 credits (€20)", peak:"25 credits (€25)", example:"Drop-in classes, studios" },
  { cat:"Pilates class",     offPeak:"20 credits (€20)", peak:"25 credits (€25)", example:"Reformer & mat classes" },
  { cat:"Fitness class",     offPeak:"15 credits (€15)", peak:"20 credits (€20)", example:"HIIT, circuits, bootcamp" },
  { cat:"Gym day pass",      offPeak:"15 credits (€15)", peak:"20 credits (€20)", example:"Independent gyms" },
  { cat:"Hotel gym & pool",  offPeak:"25 credits (€25)", peak:"40 credits (€40)", example:"5-star hotel access" },
  { cat:"Pool day pass",     offPeak:"25 credits (€25)", peak:"40 credits (€40)", example:"Resort & rooftop pools" },
  { cat:"Outdoor adventure", offPeak:"30 credits (€30)", peak:"40 credits (€40)", example:"Guided hikes, kayaking" },
  { cat:"Spa treatment",     offPeak:"60 credits (€60)", peak:"80 credits (€80)", example:"60-min massage & wellness" },
];

// Commission — admin-set only, never visible to businesses during registration

const PAY = [
  { id:"card",   label:"Credit / Debit Card", sub:"Visa, Mastercard, Amex" },
  { id:"apple",  label:"Apple Pay",           sub:"Touch ID or Face ID" },
  { id:"google", label:"Google Pay",          sub:"Google Account" },
  { id:"paypal", label:"PayPal",              sub:"Balance or linked card" },
];
const CATS = ["All","Yoga","Pilates","Surfing","Paddle Boarding","Kayaking","Cycling","Running","Hiking","Hotel Gym","Pool Access","Fitness Class","Meditation","Spa","Massage","Sound Bath","Padel","Tennis","Pickleball","Private Instructor"];

// Business-type decision drives the onboarding flow flavor. Stored in
// businesses.business_type (a fixed enum-ish string). isPrivateInstructor —
// used throughout the wizard, dashboard, and customer side — keys off
// business_type so it can't drift when a partner edits the free-text
// "specialty" category later.
const BUSINESS_TYPES = [
  { id:"studio",            icon:"🧘‍♀️", label:"Studio or class",     desc:"Yoga, pilates, fitness studios with scheduled classes", defaultCategory:"Yoga",        suggestedCats:["Yoga","Pilates","Fitness Class","Meditation","Padel","Tennis","Pickleball"] },
  { id:"hotel_gym",         icon:"🏨",   label:"Hotel or gym",         desc:"Day passes, pool access, gym membership",               defaultCategory:"Hotel Gym",   suggestedCats:["Hotel Gym","Pool Access","Fitness Class"] },
  { id:"private_instructor", icon:"👋",  label:"Private instructor",   desc:"1-to-1 sessions, you travel to clients",                defaultCategory:"Private Instructor", suggestedCats:["Yoga","Pilates","Fitness Class","Meditation","Surfing","Paddle Boarding"] },
  { id:"outdoor",           icon:"🌊",   label:"Outdoor adventure",    desc:"Surf, kayak, hike, bike, sail",                         defaultCategory:"Surfing",     suggestedCats:["Surfing","Paddle Boarding","Kayaking","Cycling","Hiking","Running"] },
  { id:"spa",               icon:"💆",   label:"Spa or wellness",      desc:"Treatments, massage, sound healing",                    defaultCategory:"Spa",         suggestedCats:["Spa","Massage","Sound Bath","Meditation"] },
  { id:"other",             icon:"❓",   label:"Something else",       desc:"Doesn't fit the categories above — tell us more",       defaultCategory:"Yoga",        suggestedCats: CATS.filter(c=>c!=="All") },
];
function businessTypeFor(typeId) { return BUSINESS_TYPES.find(t=>t.id===typeId) ?? BUSINESS_TYPES[0]; }

// ─── Cancellation policy ──────────────────────────────────────────────────
// Windows apply to confirmed bookings only. Private-instructor sessions get
// a longer 48-hour window because the instructor's slot is exclusively held
// for one member. Group / venue sessions use the standard 24-hour window.
const CANCEL_WINDOW_STANDARD_HOURS = 24;
const CANCEL_WINDOW_PRIVATE_HOURS  = 48;
function cancelWindowHoursFor(cat) {
  return cat === 'Private Instructor' ? CANCEL_WINDOW_PRIVATE_HOURS : CANCEL_WINDOW_STANDARD_HOURS;
}
// Combines booking_date (YYYY-MM-DD) + start_time (HH:MM) into a Date.
function sessionDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const t = (timeStr || '00:00').slice(0, 5);
  return new Date(`${dateStr}T${t}:00`);
}
// Whether the member can still cancel this booking under the cancellation
// policy. Returns { canCancel: bool, hoursLeft: number, windowHours: number }.
function cancelStatusFor(booking, cat) {
  const windowHours = cancelWindowHoursFor(cat);
  const sessionStart = sessionDateTime(booking?.booking_date, booking?.start_time);
  if (!sessionStart) return { canCancel: false, hoursLeft: 0, windowHours };
  const msLeft = sessionStart.getTime() - Date.now();
  const hoursLeft = msLeft / (1000 * 60 * 60);
  return { canCancel: hoursLeft >= windowHours, hoursLeft, windowHours };
}

// ─── Partner Agreement ────────────────────────────────────────────────────
// Bump this string whenever the agreement body changes. Partners keep the
// version they accepted on their businesses row so we can tell if they need
// to re-accept an updated document.
const TERMS_VERSION = 'v1.1-2026-07';

// Consumer-facing Terms of Use version stamped on profiles.consumer_terms_version
// at signup. Bump this string when the customer TOU materially changes; the
// upsert path in App.jsx will then record a new acceptance on next
// authenticated session for anyone whose stored version is older or null.
const CONSUMER_TERMS_VERSION = 'v1.0-2026-07';

// Feature flag: when true, partners must complete Stripe Connect onboarding
// before their venue can be submitted for review, and the "Payouts" step
// shows the Stripe hosted flow. When false, the step shows a "coming soon"
// note and submission goes through as before. Kept off at merge time so the
// gate doesn't strand any partner who registers before Stripe Connect is
// enabled on the platform account. Flip to true (redeploy) once Connect is
// live in the Stripe Dashboard and the account.updated webhook is wired up.
const STRIPE_GATE_ENABLED = false;
// Body of the Wello Partner Agreement. Placeholder sections below — paste the
// approved copy into each `body` (array of paragraphs). Schedule 1 is rendered
// separately from live partner data and does not live in this array.
const AGREEMENT_SECTIONS = [
  {
    id: '1',
    title: 'Definitions',
    body: [
      '1.1  "Wello", "we", "us" means Wello-Wellness Ltd, a company registered in England and Wales (company number 17318025), operating the Wello platform at wello-wellness.com and associated applications.',
      '1.2  "Partner", "you" means the venue, business or individual instructor named in Schedule 1.',
      '1.3  "Platform" means the Wello website, web application, and any associated booking, payment and communication systems operated by Wello.',
      '1.4  "Member" means a customer who holds a Wello account and uses credits to book Sessions.',
      '1.5  "Session" means any class, treatment, activity, access period or one-to-one appointment listed by the Partner on the Platform.',
      '1.6  "Booking" means a confirmed reservation of a Session made by a Member through the Platform.',
      '1.7  "Completed Booking" means a Booking where the Session took place, or where the Member failed to attend without cancelling in accordance with the cancellation policy (a "no-show").',
      '1.8  "Session Value" means the price of the Session in euros, as set by the Partner. Members pay using Wello credits, purchased at a fixed rate of one credit per euro, so the Session Value in euros and its price in credits are always numerically identical. Commission is calculated on the Session Value.',
      '1.9  "Commission" means the percentage of the Session Value payable to Wello for each Completed Booking, as individually agreed and stated in Schedule 1.',
      '1.10  "Founding Partner" means a Partner identified as such in Schedule 1, being one of the early partners who joined the Platform before or shortly after public launch.',
    ],
  },
  {
    id: '2',
    title: 'Appointment and Scope',
    body: [
      '2.1  Wello operates a marketplace that connects Members with wellness venues and instructors in Mallorca. Wello acts as a booking intermediary and commercial agent for the limited purpose of concluding Bookings and collecting payment on the Partner\'s behalf.',
      '2.2  The Partner appoints Wello as its non-exclusive agent for the purposes of marketing the Partner\'s Sessions on the Platform, accepting Bookings, and collecting payment from Members.',
      '2.3  This Agreement is non-exclusive. The Partner remains free to sell its services through its own channels and through any other platform, and Wello remains free to list any other venue or instructor.',
      '2.4  The Partner at all times remains the provider of the Sessions. Nothing in this Agreement creates an employment relationship, joint venture or partnership between the parties. Wello does not deliver, supervise or control the Sessions.',
    ],
  },
  {
    id: '3',
    title: 'Listings and Content',
    body: [
      '3.1  The Partner will provide accurate, complete and up-to-date information for its listing, including venue details, Session descriptions, schedules, capacity, pricing, amenities and photographs.',
      '3.2  The Partner is responsible for keeping its availability accurate, whether managed through an integrated booking system (such as Acuity or an iCal feed), or manually through the Wello partner portal.',
      '3.3  The Partner grants Wello a non-exclusive, royalty-free licence to use the Partner\'s name, logo, photographs and listing content on the Platform and in Wello\'s marketing materials (including social media and email) for the purpose of promoting the Partner\'s Sessions and the Platform, for the duration of this Agreement.',
      '3.4  The Partner warrants that it owns or has the right to license all content it provides, and that such content does not infringe any third party rights.',
      '3.5  Wello may edit listing content for formatting, clarity and consistency with the Platform\'s style, and may remove content that it reasonably considers inaccurate, misleading or inappropriate.',
    ],
  },
  {
    id: '4',
    title: 'Bookings, Pricing and Credits',
    body: [
      '4.1  The Partner sets its own Session prices. Wello will not alter the Partner\'s pricing without agreement. Prices are displayed to Members in Wello credits at a rate of one credit per euro of Session Value.',
      '4.2  Members pay for Sessions using credits purchased from Wello. Wello is solely responsible for the sale of credits to Members, including any service fee Wello charges Members on credit purchases. No such Member-facing fee reduces the amount payable to the Partner.',
      '4.3  A Booking is confirmed when the Member completes the booking flow on the Platform and, where relevant, when it is accepted by the Partner\'s integrated booking system. For private instructor Sessions, a Booking is confirmed when the instructor accepts the request or when the acceptance window expires in accordance with clause 4.4.',
      '4.4  Private instructor booking requests must be accepted or declined by the Partner within 48 hours. If the Partner does not respond within 48 hours, the request is automatically declined and the Member\'s credits are returned in full, in accordance with clause 5.2. Accepting promptly gives the Partner the best chance of retaining the Booking.',
      '4.5  The Partner will honour every confirmed Booking on the same basis as a booking made through its own channels, and will not treat Members less favourably than its direct customers.',
    ],
  },
  {
    id: '5',
    title: 'Cancellations and No-Shows',
    body: [
      '5.1  Members may cancel a confirmed Booking through the Platform up to 24 hours before the scheduled Session start time. For private instructor Sessions, the cancellation window is 48 hours before the scheduled Session start time, reflecting that the instructor holds the slot exclusively for one Member. Cancellations made within these windows result in the Member\'s credits being returned in full, and no Commission or payout arises. Cancellations made after these windows have closed are not permitted through the Platform, and the Booking is treated as a Completed Booking under clause 5.2.',
      '5.2  Where a Member fails to attend a confirmed Session without cancelling within the applicable window (a no-show), the Booking is treated as a Completed Booking. The Member\'s credits are deducted and the Partner is paid in full for that Booking. The Partner does not bear the cost of Member no-shows. This clause applies to confirmed Bookings only, and does not apply to private instructor requests that are automatically declined under clause 4.4, for which credits are returned to the Member.',
      '5.3  If the Partner cancels a confirmed Booking other than through the safety window described in clause 5.4, the Member\'s credits are returned in full. Repeated Partner cancellations of this kind may result in reduced visibility on the Platform or suspension under clause 11.',
      '5.4  Where the Partner has opted into the booking safety window feature, the Partner may cancel a newly confirmed Booking within the window communicated in the booking alert (currently 2 hours, counted within the hours of 9:00 to 19:00 Spanish time) where it has a genuine scheduling conflict. On such a cancellation the Member\'s credits are returned in full and Wello may suggest alternative Sessions to the Member. A cancellation made properly within the safety window is not a breach of this Agreement and does not of itself trigger the consequences described in clause 5.3, although Wello may review persistent use of the safety window with the Partner.',
      '5.5  If the Partner needs to cancel a Session, it will give Wello and affected Members as much notice as reasonably possible through the partner portal or by contacting Wello directly.',
    ],
  },
  {
    id: '6',
    title: 'Commission and Payments',
    body: [
      '6.1  In consideration of Wello\'s services, the Partner will pay Wello the Commission stated in Schedule 1 on the Session Value of each Completed Booking. The Commission rate is agreed individually with each Partner and is not a standard or published rate.',
      '6.2  Where Schedule 1 records a Founding Partner incentive, no Commission is payable on the Partner\'s first 100 Completed Bookings. Commission applies from the 101st Completed Booking at the rate stated in Schedule 1.',
      '6.3  Wello collects payment from Members on the Partner\'s behalf. Wello will pay the Partner the Session Value of each Completed Booking, less the applicable Commission, in euros, to the Partner\'s nominated bank account.',
      '6.4  Payouts are made weekly, covering all Completed Bookings settled in the preceding period, whether processed automatically via Stripe Connect or manually by Wello. Wello may adjust the payout day with reasonable notice, but will not reduce the frequency below weekly without the Partner\'s agreement.',
      '6.5  Receipt of payment by Wello from a Member discharges the Member\'s payment obligation to the Partner for that Booking. Wello bears the risk of Member payment failure once a Booking is confirmed as a Completed Booking.',
      '6.6  Wello will make available to the Partner, through the partner portal, a record of Bookings, Completed Bookings, Commission deducted and payouts made.',
      '6.7  Amounts payable under this Agreement are stated exclusive of VAT or Spanish IVA, which shall be added where applicable. Each party is responsible for its own tax affairs. The Partner is responsible for accounting for tax on its Session revenue, and Wello is responsible for accounting for tax on its Commission.',
      '6.8  If a Booking is refunded to a Member after payout (for example following a legitimate complaint), Wello may deduct the corresponding amount from the Partner\'s next payout, provided Wello has consulted the Partner first.',
    ],
  },
  {
    id: '7',
    title: 'Partner Obligations',
    body: [
      '7.1  The Partner will:',
      '(a)  deliver Sessions with reasonable skill and care and to the standard described in its listing;',
      '(b)  hold and maintain all licences, registrations, permits and insurance required to operate its business and deliver the Sessions lawfully in Spain, including appropriate public liability insurance;',
      '(c)  ensure that any staff or instructors delivering Sessions are appropriately qualified and, where legally required, certified;',
      '(d)  comply with all applicable health, safety and hygiene requirements at its premises or session locations;',
      '(e)  treat Members with courtesy and deal with complaints promptly and professionally; and',
      '(f)  comply with all applicable laws, including Spanish consumer protection law, in its dealings with Members.',
      '7.2  For private instructors: the Partner confirms it is entitled to work in Spain, is registered as required for self-employment (autónomo) or equivalent, and holds insurance appropriate to delivering one-to-one sessions at third party or outdoor locations.',
      '7.3  The Partner will not solicit Members to book directly with the Partner for the purpose of avoiding Commission on Sessions initiated through the Platform. Members who independently choose to become direct customers of the Partner are not restricted.',
    ],
  },
  {
    id: '8',
    title: 'Wello Obligations',
    body: [
      '8.1  Wello will:',
      '(a)  operate and maintain the Platform with reasonable skill and care;',
      '(b)  collect payment from Members and pay the Partner in accordance with clause 6;',
      '(c)  provide the Partner with access to a partner portal to manage its listing, schedule and bookings;',
      '(d)  provide first-line customer support to Members in relation to the Platform, credits and bookings; and',
      '(e)  handle Member payment data securely through its payment provider. Card details are processed by Stripe and are not stored by Wello.',
      '8.2  Wello does not guarantee any volume of Bookings, revenue or Platform availability. The Platform may be unavailable during maintenance or due to events outside Wello\'s control.',
    ],
  },
  {
    id: '9',
    title: 'Data Protection',
    body: [
      '9.1  Each party will comply with applicable data protection law, including the UK GDPR and the EU GDPR as applicable, in respect of personal data processed under this Agreement.',
      '9.2  Wello shares with the Partner only the Member personal data necessary to deliver a booked Session (such as the Member\'s name, and for private instructor Sessions, the Member\'s stated location). The Partner will use that data solely to deliver the Session, will keep it secure, and will not use it for marketing without the Member\'s separate consent.',
      '9.3  Each party acts as an independent controller of the personal data it processes. If the parties\' processing arrangement changes such that a processor relationship arises, the parties will enter into appropriate data processing terms.',
      '9.4  Each party will notify the other without undue delay on becoming aware of a personal data breach affecting data shared under this Agreement.',
    ],
  },
  {
    id: '10',
    title: 'Liability',
    body: [
      '10.1  The Partner is solely responsible for the delivery of Sessions and for the safety of Members while attending Sessions. The Partner will indemnify Wello against claims arising from personal injury, property damage or other direct loss suffered by a Member as a result of the Partner\'s delivery of a Session, or the Partner\'s breach of clause 7, except to the extent caused by Wello\'s negligence.',
      '10.2  Wello is responsible for the operation of the Platform and the handling of payments. Wello\'s total liability to the Partner under this Agreement in any 12 month period is limited to the greater of EUR 500 and the total Commission received by Wello from the Partner in that period.',
      '10.3  Neither party excludes or limits liability for death or personal injury caused by its negligence, for fraud, or for any liability that cannot lawfully be excluded or limited.',
      '10.4  Neither party is liable for indirect or consequential loss, loss of profit or loss of anticipated savings, save that this clause does not limit the Partner\'s payment obligations or the indemnity in clause 10.1.',
    ],
  },
  {
    id: '11',
    title: 'Term, Suspension and Termination',
    body: [
      '11.1  This Agreement starts on the date in Schedule 1 and continues until terminated. There is no minimum term and no long-term commitment.',
      '11.2  Either party may terminate this Agreement at any time by giving 30 days\' written notice (email is sufficient).',
      '11.3  Wello may suspend the Partner\'s listing immediately where it reasonably suspects: a serious risk to Member safety; fraud; repeated failure to honour Bookings; or material breach of this Agreement. Wello will notify the Partner of the reason and, where the issue can be remedied, give the Partner a reasonable opportunity to remedy it.',
      '11.4  Either party may terminate immediately on written notice if the other commits a material breach which is not remedied within 14 days of notice, or becomes insolvent.',
      '11.5  On termination: confirmed future Bookings will either be honoured by the Partner or cancelled with credits returned to Members, as agreed between the parties; Wello will pay all outstanding amounts due for Completed Bookings in the next payout cycle; and each party will stop using the other\'s branding, except that Wello may retain records as required by law.',
    ],
  },
  {
    id: '12',
    title: 'General',
    body: [
      '12.1  Changes to these terms. Wello may update the general terms of this Agreement by giving the Partner at least 30 days\' notice by email. If the Partner does not accept the change, it may terminate under clause 11.2 before the change takes effect. Changes to the individually agreed Commercial Terms in Schedule 1 require the written agreement of both parties.',
      '12.2  Assignment. Wello may assign this Agreement to a successor entity, including a Spanish company within the same ownership, on notice to the Partner. The Partner may not assign this Agreement without Wello\'s consent, not to be unreasonably withheld.',
      '12.3  Entire agreement. This Agreement, including Schedule 1, is the entire agreement between the parties in relation to its subject matter.',
      '12.4  Notices. Notices may be given by email to the addresses in Schedule 1 (for the Partner) and hello@wello-wellness.com (for Wello).',
      '12.5  Confidentiality. Each party will keep confidential the individually agreed Commercial Terms in Schedule 1, including the Commission rate and any Founding Partner incentive, and will not disclose them to any third party except to its professional advisers, as required by law, or with the other party\'s prior written consent.',
      '12.6  Execution and electronic acceptance. This Agreement may be executed by signature or by electronic acceptance through the Wello partner portal. Acceptance recorded through the partner portal, including the date and time of acceptance, the version of the terms accepted and the Commercial Terms in Schedule 1 as displayed at the time of acceptance, constitutes valid execution of this Agreement by the Partner and has the same effect as a signature.',
      '12.7  Governing law and jurisdiction. This Agreement is governed by the laws of England and Wales, and the parties submit to the non-exclusive jurisdiction of the English courts.',
    ],
  },
];
// Customer-facing label override. Most chips render their category name as-is,
// but "Private Instructor" reads more naturally as "Private Classes" on the
// explore filter. The underlying DB value stays "Private Instructor".
const CAT_LABELS = { "Private Instructor": "Private Classes" };
function catLabel(c) { return CAT_LABELS[c] || c; }
const PRIVATE_CAT = "Private Instructor";
const isPrivateInstructorCat = (c) => c === PRIVATE_CAT;
// LOCS is the explore-page location filter chip list. We seed it with the
// canonical Mallorca place list below so any town a private instructor adds
// to coverage_areas is filterable. "All Mallorca" stays first.
// Canonical Mallorca place list used by:
// - private-instructor onboarding (coverage_areas multi-select)
// - listing display (covers: X, Y, Z pills)
// - explore page location filter (extends LOCS via union with these)
// Kept alphabetical so the chip grid reads predictably for both partners and
// customers. Edit here if you need to add or rename a location anywhere on
// the site so the surfaces stay in sync.
const MALLORCA_LOCATIONS = [
  "Alcúdia","Andratx","Artà","Banyalbufar","Cala Bona","Cala d'Or","Cala Millor","Cala Ratjada",
  "Calvià","Deià","Es Trenc","Felanitx","Inca","Llucmajor","Magaluf","Manacor",
  "Palma","Palmanova","Pollença","Port d'Andratx","Port de Pollença","Sant Elm","Santanyí","Ses Salines",
  "Sóller","Valldemossa",
];
const LOCS = ["All Mallorca", ...MALLORCA_LOCATIONS];

// Themed groups for the Explore-page carousels. Each section is hidden if it has
// zero matching listings under the active location/search filter.
const THEMES = [
  { name: "Yoga",           cats: ["Yoga"],                                                            blurb: "Find your flow"          },
  { name: "Pilates",        cats: ["Pilates"],                                                         blurb: "Reformer and mat"        },
  { name: "Racquet sports", cats: ["Padel","Tennis","Pickleball"],                                     blurb: "Court time on the island"},
  { name: "Pools & Spa",    cats: ["Pool Access","Spa","Massage","Sound Bath"],                        blurb: "Resort-style days"       },
  { name: "Gym & Fitness",  cats: ["Hotel Gym","Fitness Class"],                                       blurb: "Train your way"          },
  { name: "Outdoor",        cats: ["Surfing","Paddle Boarding","Kayaking","Cycling","Running","Hiking"], blurb: "Sea and mountains"     },
  { name: "Meditation",     cats: ["Meditation"],                                                      blurb: "Stillness and breath"    },
];

const LISTINGS = [
  { id:1, name:"Sol Yoga", cat:"Yoga", loc:"Sóller", rating:4.9, reviews:127, cr:20,
    desc:"Rooftop yoga overlooking the Tramuntana mountains. Sunrise & sunset sessions with certified instructors.",
    img:"https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80",
    tags:["Rooftop","All Levels","Mountain Views"],
    slots:[{id:"s1",date:"2026-03-22",time:"07:00",dur:"75 min",spots:8,booked:3,name:"Morning Flow"},{id:"s2",date:"2026-03-22",time:"18:30",dur:"90 min",spots:10,booked:7,name:"Evening Flow"},{id:"s3",date:"2026-03-23",time:"07:00",dur:"75 min",spots:8,booked:1,name:"Morning Flow"}] },
  { id:2, name:"Bay Hotel Gym", cat:"Hotel Gym", loc:"Palma", rating:4.8, reviews:64, cr:40,
    desc:"Five-star hotel fitness centre with heated infinity pool and panoramic sea views. Day passes available.",
    img:"https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=600&q=80",
    tags:["5-Star","Infinity Pool","Sea Views"],
    slots:[{id:"s5",date:"2026-03-22",time:"06:30",dur:"Open",spots:15,booked:5,name:"Gym & Pool Pass"},{id:"s6",date:"2026-03-22",time:"16:00",dur:"Open",spots:15,booked:9,name:"Afternoon Access"},{id:"s7",date:"2026-03-23",time:"06:30",dur:"Open",spots:15,booked:2,name:"Gym & Pool Pass"}] },
  { id:3, name:"Mountain Pilates", cat:"Pilates", loc:"Valldemossa", rating:5.0, reviews:43, cr:20,
    desc:"Reformer and mat Pilates inside a restored 18th-century farmhouse. Small groups, meticulous attention.",
    img:"https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&q=80",
    tags:["Reformer","Small Groups","Historic"],
    slots:[{id:"s8",date:"2026-03-22",time:"09:00",dur:"55 min",spots:6,booked:6,name:"Reformer"},{id:"s9",date:"2026-03-22",time:"11:00",dur:"55 min",spots:6,booked:2,name:"Mat Pilates"},{id:"s10",date:"2026-03-23",time:"09:00",dur:"55 min",spots:6,booked:0,name:"Intro Reformer"}] },
  { id:4, name:"Bay Surf School", cat:"Surfing", loc:"Alcúdia", rating:4.7, reviews:89, cr:40,
    desc:"North coast beach packages — paddle out at dawn, practice yoga as the sun rises over the bay.",
    img:"https://images.unsplash.com/photo-1515016886654-94c06b8a8c7d?w=600&q=80",
    tags:["Beach","Surf","Full Experience"],
    slots:[{id:"s12",date:"2026-03-22",time:"08:00",dur:"Half Day",spots:8,booked:5,name:"Surf + Yoga"},{id:"s13",date:"2026-03-23",time:"08:00",dur:"Half Day",spots:8,booked:1,name:"Surf + Yoga"}] },
  { id:5, name:"Clifftop Pool Club", cat:"Pool Access", loc:"Palma", rating:4.9, reviews:52, cr:40,
    desc:"Fortress hotel — infinity pool carved into the cliffs, spa circuit and breathwork sessions. Extraordinary luxury.",
    img:"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=80",
    tags:["Luxury","Cliff Pool","Spa"],
    slots:[{id:"s15",date:"2026-03-22",time:"10:00",dur:"Full Day",spots:6,booked:2,name:"Pool & Spa Day"},{id:"s16",date:"2026-03-23",time:"10:00",dur:"Full Day",spots:6,booked:0,name:"Pool & Spa Day"}] },
  { id:6, name:"Garden Yoga Deià", cat:"Yoga", loc:"Deià", rating:4.8, reviews:71, cr:20,
    desc:"Open-air platform in the artist village of Deià. Iyengar practice surrounded by ancient olive groves.",
    img:"https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=600&q=80",
    tags:["Outdoor","Iyengar","Olive Groves"],
    slots:[{id:"s18",date:"2026-03-22",time:"08:30",dur:"90 min",spots:10,booked:8,name:"Morning Session"},{id:"s19",date:"2026-03-22",time:"17:00",dur:"90 min",spots:10,booked:4,name:"Evening Session"}] },
  { id:7, name:"Peak Fitness", cat:"Fitness Class", loc:"Pollença", rating:4.6, reviews:110, cr:15,
    desc:"High-intensity training in a converted mill. 45-minute sessions, expert coaching, maximum results.",
    img:"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=80",
    tags:["HIIT","Small Groups","Expert Coaches"],
    slots:[{id:"s21",date:"2026-03-22",time:"07:30",dur:"45 min",spots:14,booked:10,name:"HIIT Class"},{id:"s22",date:"2026-03-22",time:"12:00",dur:"45 min",spots:14,booked:6,name:"Lunchtime"},{id:"s24",date:"2026-03-23",time:"07:30",dur:"45 min",spots:14,booked:4,name:"HIIT Class"}] },
  { id:8, name:"Coast Meditation", cat:"Meditation", loc:"Santanyí", rating:5.0, reviews:38, cr:15,
    desc:"Cliffside meditation and breathwork with the Mediterranean as your backdrop. Intimate and transformative.",
    img:"https://images.unsplash.com/photo-1593811167562-9cef47bfc4d7?w=600&q=80",
    tags:["Cliffside","Breathwork","Sea Views"],
    slots:[{id:"s25",date:"2026-03-22",time:"06:00",dur:"60 min",spots:8,booked:5,name:"Dawn Breathwork"},{id:"s26",date:"2026-03-22",time:"19:30",dur:"60 min",spots:8,booked:2,name:"Evening Meditation"}] },
  { id:9, name:"Rooftop Pool Club", cat:"Pool Access", loc:"Palma", rating:4.7, reviews:93, cr:25,
    desc:"Rooftop pool at the heart of Palma. Lap lanes from 8am, day club all afternoon. Hotel gym access included.",
    img:"https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&q=80",
    tags:["Rooftop Pool","Lap Lanes","Day Pass"],
    slots:[{id:"s28",date:"2026-03-22",time:"08:00",dur:"Full Day",spots:20,booked:8,name:"Pool Day Pass"},{id:"s29",date:"2026-03-23",time:"08:00",dur:"Full Day",spots:20,booked:3,name:"Pool Day Pass"}] },
];

const FRIENDS = [
  { id:1, init:"AK", name:"Anna K.",   bio:"6 bookings this month", loc:"Palma" },
  { id:2, init:"MT", name:"Marcus T.", bio:"Just joined",           loc:"London" },
  { id:3, init:"LM", name:"Léa M.",    bio:"12 bookings this month",loc:"Deià" },
];

const fd = d => new Date(d+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});

// ─── Company details ─────────────────────────────────────────────────────────
// Single source of truth for the footer legal line + any customer-facing
// contact surface. If any of these change (rebrand, moved to a new
// registration, new mobile), edit here and every surface picks it up.
const COMPANY_NAME    = "Wello-Wellness Ltd";
const COMPANY_NUMBER  = "17318025";
const COMPANY_ADDRESS = "9 Colville Gardens, GU18 5QQ, UK";
const COMPANY_PHONE   = "+44 7775 868695";
const COMPANY_EMAIL   = "hello@wello-wellness.com";

// ─── Atoms ────────────────────────────────────────────────────────────────────
const F = { display:"'Manrope','Jost',system-ui,sans-serif", body:"'Manrope','Jost',system-ui,sans-serif" };

function Stars({ n }) {
  return <span style={{color:T.ochre,fontSize:12,letterSpacing:1}}>{Array(Math.floor(n)).fill("★").join("")}<span style={{color:T.stone2,marginLeft:4,fontSize:11,letterSpacing:"normal"}}>{n}</span></span>;
}
function Cr({ n, size="md" }) {
  const p = {sm:"2px 7px",md:"4px 10px",lg:"7px 14px"}[size];
  const f = {sm:9,md:11,lg:14}[size];
  return <span style={{display:"inline-flex",alignItems:"center",gap:3,background:T.sage,color:"#fff",borderRadius:3,padding:p,fontSize:f,fontFamily:F.body,fontWeight:600}}>◈ {n}</span>;
}
function Pill({ label, active, onClick, color }) {
  return <button onClick={onClick} style={{padding:"5px 12px",border:`1px solid ${active?(color||T.sage):T.border}`,borderRadius:2,background:active?(color?T.clayXL:T.sageXL):"transparent",color:active?(color?T.clay:T.sage):T.stone,fontFamily:F.body,fontSize:10,fontWeight:active?600:400,cursor:"pointer",whiteSpace:"nowrap",transition:"all .13s"}}>{label}</button>;
}
// Brand checkmark — consistent across browsers (unicode ✓ renders very
// differently across OSes and weights). Pass size + stroke color.
function Check({ size = 18, stroke = T.sage, strokeWidth = 2.5 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function Toast({ t }) {
  if (!t) return null;
  // Welcome variant — full-screen centred celebration overlay. Forest Green on
  // Alabaster, champagne pop emoji on top. Used by the customer email-confirmation
  // landing (?confirmed=true).
  if (t.type === "welcome") {
    return (
      <div style={{
        position:"fixed",inset:0,zIndex:4000,
        display:"flex",alignItems:"center",justifyContent:"center",
        padding:"clamp(16px,4vw,32px)",
        background:"rgba(27,28,25,0.45)",
        backdropFilter:"blur(4px)",
        WebkitBackdropFilter:"blur(4px)",
        animation:"fi .25s ease",
      }}>
        <div style={{
          background:T.sage,color:T.bg,
          padding:"clamp(28px,5vw,44px) clamp(24px,5vw,40px)",
          borderRadius:20,
          maxWidth:480,width:"100%",
          textAlign:"center",
          boxShadow:"0 24px 64px rgba(33,60,24,0.45)",
          animation:"su .35s ease",
        }}>
          <div style={{fontSize:"clamp(48px,9vw,64px)",marginBottom:14,lineHeight:1}}>🍾</div>
          <p style={{fontFamily:F.body,fontSize:"clamp(15px,2vw,17px)",fontWeight:500,lineHeight:1.55,margin:0,color:T.bg,letterSpacing:"-0.1px"}}>{t.msg}</p>
        </div>
      </div>
    );
  }
  const bg = t.type==="gold"?T.ochre:t.type==="success"?T.sage:T.clay;
  // Brand toast — soft pill, generous padding, brand inline tick on success.
  // maxWidth + wrapping so longer messages don't fall off mobile screens.
  const showTick = t.type === "success" || t.type === "gold";
  return (
    <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",zIndex:4000,background:bg,color:"#FBF9F4",padding:"12px 20px",borderRadius:999,fontFamily:F.body,fontSize:13,fontWeight:600,boxShadow:"0 12px 28px rgba(33,60,24,0.22)",animation:"toastIn .28s ease",display:"inline-flex",alignItems:"center",gap:10,maxWidth:"min(92vw,420px)",lineHeight:1.45,letterSpacing:"-0.1px"}}>
      {showTick && <Check size={16} stroke="#FBF9F4" strokeWidth={2.6}/>}
      <span>{t.msg}</span>
    </div>
  );
}
function Label({ children }) {
  return <div style={{fontFamily:F.body,fontSize:8,letterSpacing:"2.5px",textTransform:"uppercase",color:T.stone2,marginBottom:6,fontWeight:400}}>{children}</div>;
}
function FieldLabel({ children }) {
  return <label style={{display:"block",fontSize:8,letterSpacing:"1.5px",textTransform:"uppercase",color:T.stone,fontFamily:F.body,marginBottom:4}}>{children}</label>;
}
const INP = {width:"100%",padding:"9px 11px",border:`1px solid ${T.border}`,borderRadius:2,fontSize:12,fontFamily:F.body,background:T.paper,color:T.ink,outline:"none",boxSizing:"border-box",transition:"border-color .18s"};

// ─── Auth Modal (Member sign-in / sign-up / magic link) ──────────────────────
// Centered modal, brand-token styling, matches BizPanel/BookingModal pattern.
// Customers only — partner sign-in lives inside the Business tab and stays
// separate (no shared UI). The Supabase auth session itself is shared per
// browser, but only customers with a row in `profiles` see the member
// experience; only partners with a row in `businesses` see the portal.
function AuthModal({ initialMode = "signin", onClose, onSuccess, onOpenTerms }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  // signin | signup | magic | magic_sent | signup_check | forgot | forgot_sent | set_password | set_password_done
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function clearErr(){ if(err) setErr(""); }

  async function doSignIn() {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setErr("Email or password not recognised."); return; }
    onSuccess?.();
  }

  async function doSignUp() {
    if (!fullName.trim()) { setErr("Please enter your name."); return; }
    if (password.length < 8) { setErr("Password must be at least 8 characters."); return; }
    setBusy(true); setErr("");
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // full_name from the signup form + password_set flag so partner
        // onboarding (which reads user_metadata.password_set) skips the
        // "set a password" prompt for customers who already have one.
        data: { full_name: fullName.trim(), password_set: true },
        // Send customers back to the main app with a flag so App.jsx knows
        // this is a customer confirmation, not a partner invite/recovery flow.
        emailRedirectTo: `${window.location.origin}/?confirmed=true`,
      },
    });
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't create account."); return; }
    // If email confirmations are on, session is null and user must confirm.
    if (!data.session) { setMode("signup_check"); return; }
    // Auto-confirmed (e.g. dev mode) — onSuccess handler picks up the session.
    onSuccess?.();
  }

  async function doMagic() {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Customer magic link returns to the main app (no portal flag).
      options: { emailRedirectTo: `${window.location.origin}/?signed_in=true` },
    });
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't send magic link."); return; }
    setMode("magic_sent");
  }

  async function doForgot() {
    if (!email.trim()) { setErr("Please enter your email."); return; }
    setBusy(true); setErr("");
    // ?customer_reset=true flag lets the app know to open this modal in
    // set_password mode after the recovery hash redirects them back.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/?customer_reset=true`,
    });
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't send reset email."); return; }
    setMode("forgot_sent");
  }

  async function doSetPassword() {
    if (password.length < 8) { setErr("Password must be at least 8 characters."); return; }
    setBusy(true); setErr("");
    // Stamp password_set on user_metadata so downstream flows (partner
    // onboarding's "set a password" prompt) know this account has one.
    const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } });
    setBusy(false);
    if (error) { setErr(error.message || "Couldn't set password."); return; }
    setMode("set_password_done");
    // Strip the recovery hash + flag from the URL so a refresh doesn't reopen
    // the modal in set_password mode.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("customer_reset");
      window.history.replaceState({}, "", url.pathname + url.search);
    } catch { /* non-critical */ }
    setTimeout(() => { onSuccess?.(); onClose?.(); }, 1400);
  }

  const INP3 = {
    width:"100%", padding:"11px 13px", border:`1px solid ${T.border}`, borderRadius:4,
    fontSize:13, fontFamily:F2, background:T.paper, color:T.ink, outline:"none",
    boxSizing:"border-box", transition:"border-color .18s",
  };

  const onF = e => e.target.style.borderColor = T.sage;
  const onB = e => e.target.style.borderColor = err ? T.clay : T.border;

  // Success-state body for magic link / signup confirmation screens
  if (mode === "magic_sent") return (
    <ModalShell onClose={onClose}>
      <div style={{textAlign:"center",padding:"32px 8px"}}>
        <div style={{width:56,height:56,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><Check size={26} stroke={T.sage} strokeWidth={2.5}/></div>
        <h2 style={{fontFamily:F2,fontSize:20,fontWeight:700,color:T.sage,letterSpacing:"-0.4px",margin:"0 0 8px"}}>Check your email</h2>
        <p style={{fontFamily:F2,fontSize:13,color:T.stone,lineHeight:1.6,margin:0}}>We sent a magic link to <strong style={{color:T.ink,fontWeight:600}}>{email}</strong>. Click it to sign in.</p>
      </div>
    </ModalShell>
  );

  if (mode === "signup_check") return (
    <ModalShell onClose={onClose}>
      <div style={{textAlign:"center",padding:"32px 8px"}}>
        <div style={{width:56,height:56,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><Check size={26} stroke={T.sage} strokeWidth={2.5}/></div>
        <h2 style={{fontFamily:F2,fontSize:20,fontWeight:700,color:T.sage,letterSpacing:"-0.4px",margin:"0 0 8px"}}>Welcome to Wello</h2>
        <p style={{fontFamily:F2,fontSize:13,color:T.stone,lineHeight:1.6,margin:0}}>Confirm your email at <strong style={{color:T.ink,fontWeight:600}}>{email}</strong> to activate your account, then sign in.</p>
      </div>
    </ModalShell>
  );

  if (mode === "forgot_sent") return (
    <ModalShell onClose={onClose}>
      <div style={{textAlign:"center",padding:"32px 8px"}}>
        <div style={{width:56,height:56,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><Check size={26} stroke={T.sage} strokeWidth={2.5}/></div>
        <h2 style={{fontFamily:F2,fontSize:20,fontWeight:700,color:T.sage,letterSpacing:"-0.4px",margin:"0 0 8px"}}>Check your email</h2>
        <p style={{fontFamily:F2,fontSize:13,color:T.stone,lineHeight:1.6,margin:0}}>We sent a reset link to <strong style={{color:T.ink,fontWeight:600}}>{email}</strong>. Click it to set a new password.</p>
      </div>
    </ModalShell>
  );

  if (mode === "set_password_done") return (
    <ModalShell onClose={onClose}>
      <div style={{textAlign:"center",padding:"32px 8px"}}>
        <div style={{width:56,height:56,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><Check size={26} stroke={T.sage} strokeWidth={2.5}/></div>
        <h2 style={{fontFamily:F2,fontSize:20,fontWeight:700,color:T.sage,letterSpacing:"-0.4px",margin:"0 0 8px"}}>Password updated</h2>
        <p style={{fontFamily:F2,fontSize:13,color:T.stone,lineHeight:1.6,margin:0}}>You're signed in. Welcome back to Wello.</p>
      </div>
    </ModalShell>
  );

  const heading = mode==="signin" ? "Sign in"
    : mode==="signup" ? "Create your account"
    : mode==="magic"  ? "Email me a magic link"
    : mode==="forgot" ? "Reset your password"
    : mode==="set_password" ? "Set a new password"
    : "Sign in";
  const subhead = mode==="signin" ? "Welcome back."
    : mode==="signup" ? "Wello members buy credits and book wellness across Mallorca."
    : mode==="magic"  ? "We'll send a one-tap sign-in link."
    : mode==="forgot" ? "Enter your email and we'll send a reset link."
    : mode==="set_password" ? "Choose a new password for your account."
    : "";
  // The primary button label varies per mode.
  const primaryLabel = mode==="signin" ? "Sign in →"
    : mode==="signup" ? "Create account →"
    : mode==="magic"  ? "Send magic link →"
    : mode==="forgot" ? "Send reset link →"
    : mode==="set_password" ? "Set password →"
    : "Sign in →";
  const primaryAction = mode==="signin" ? doSignIn
    : mode==="signup" ? doSignUp
    : mode==="magic"  ? doMagic
    : mode==="forgot" ? doForgot
    : mode==="set_password" ? doSetPassword
    : doSignIn;
  // Email input shown for everything except set_password (already authenticated by then).
  const showEmail    = mode !== "set_password";
  // Password input shown when we need a password (signin / signup / set_password).
  const showPassword = mode==="signin" || mode==="signup" || mode==="set_password";
  const primaryDisabled = busy
    || (showEmail && !email.trim())
    || (mode==="signup" && (!fullName.trim() || password.length<8))
    || (mode==="signin" && !password)
    || (mode==="set_password" && password.length<8);

  return (
    <ModalShell onClose={onClose}>
      <div style={{padding:"28px 28px 24px"}}>
        <div style={{fontFamily:F2,fontSize:22,fontWeight:800,color:T.sage,letterSpacing:"-0.8px",marginBottom:4}}>wello</div>
        <h2 style={{fontFamily:F2,fontSize:18,fontWeight:700,color:T.ink,letterSpacing:"-0.4px",margin:"0 0 4px"}}>{heading}</h2>
        <p style={{fontFamily:F2,fontSize:12,color:T.stone,fontWeight:400,margin:"0 0 22px"}}>{subhead}</p>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {mode==="signup" && (
            <div>
              <label style={{fontFamily:F2,fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",color:T.stone,display:"block",marginBottom:5}}>Full name</label>
              <input value={fullName} onChange={e=>{setFullName(e.target.value);clearErr();}} placeholder="Your name"
                style={{...INP3, borderColor: err ? T.clay : T.border}} onFocus={onF} onBlur={onB}/>
            </div>
          )}

          {showEmail && (
            <div>
              <label style={{fontFamily:F2,fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",color:T.stone,display:"block",marginBottom:5}}>Email address</label>
              <input type="email" value={email} onChange={e=>{setEmail(e.target.value);clearErr();}} placeholder="you@email.com"
                style={{...INP3, borderColor: err ? T.clay : T.border}} onFocus={onF} onBlur={onB}
                onKeyDown={e=>{ if(e.key==="Enter" && mode==="forgot") doForgot(); }}/>
            </div>
          )}

          {showPassword && (
            <div>
              <label style={{fontFamily:F2,fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",color:T.stone,display:"block",marginBottom:5}}>
                {mode==="set_password" ? "New password" : "Password"}
              </label>
              <input type="password" value={password} onChange={e=>{setPassword(e.target.value);clearErr();}}
                placeholder={mode==="signup" || mode==="set_password" ? "At least 8 characters" : "••••••••"}
                style={{...INP3, borderColor: err ? T.clay : T.border}} onFocus={onF} onBlur={onB}
                onKeyDown={e=>{ if(e.key==="Enter") primaryAction(); }}/>
            </div>
          )}

          {err && <div style={{fontFamily:F2,fontSize:11,color:T.clay}}>{err}</div>}

          <button onClick={primaryAction} disabled={primaryDisabled}
            style={{padding:"12px",background:busy?T.border:T.sage,color:busy?T.stone:"#fff",border:"none",borderRadius:4,fontFamily:F2,fontSize:13,fontWeight:700,cursor:busy?"not-allowed":"pointer",marginTop:4,letterSpacing:"0.2px"}}>
            {busy ? "Please wait…" : primaryLabel}
          </button>

          {mode==="signup" && (
            <p style={{fontFamily:F2,fontSize:11,color:T.stone,margin:"6px 0 0",lineHeight:1.55,textAlign:"center"}}>
              By creating an account you agree to the{" "}
              <button type="button" onClick={()=>onOpenTerms?.()} style={{background:"transparent",border:"none",color:T.sage,fontFamily:F2,fontSize:11,fontWeight:700,cursor:"pointer",padding:0,textDecoration:"underline"}}>
                Wello Terms of Use
              </button>.
            </p>
          )}

          {mode==="signin" && (
            <>
              <button onClick={()=>{setMode("forgot");setErr("");}} style={{background:"transparent",border:"none",color:T.sage,fontFamily:F2,fontSize:12,fontWeight:600,cursor:"pointer",padding:"4px 0",marginTop:2,textAlign:"left"}}>
                Forgot password?
              </button>
              <button onClick={()=>{setMode("magic");setErr("");}} style={{background:"transparent",border:"none",color:T.sage,fontFamily:F2,fontSize:12,fontWeight:600,cursor:"pointer",padding:"4px 0",textAlign:"left"}}>
                Or email me a magic link
              </button>
            </>
          )}
          {mode==="magic" && (
            <button onClick={()=>{setMode("signin");setErr("");}} style={{background:"transparent",border:"none",color:T.sage,fontFamily:F2,fontSize:12,fontWeight:600,cursor:"pointer",padding:"4px 0",marginTop:2}}>
              ← Back to password sign-in
            </button>
          )}
          {mode==="forgot" && (
            <button onClick={()=>{setMode("signin");setErr("");}} style={{background:"transparent",border:"none",color:T.sage,fontFamily:F2,fontSize:12,fontWeight:600,cursor:"pointer",padding:"4px 0",marginTop:2}}>
              ← Back to sign-in
            </button>
          )}
        </div>

        {/* Mode switch footer — hidden during set_password since the user is already signed in via the recovery link */}
        {mode !== "set_password" && (
          <div style={{marginTop:18,paddingTop:14,borderTop:`1px solid ${T.border}`,textAlign:"center"}}>
            {mode==="signup"
              ? <span style={{fontFamily:F2,fontSize:12,color:T.stone}}>Already a member? <button onClick={()=>{setMode("signin");setErr("");}} style={{background:"transparent",border:"none",color:T.sage,fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer",padding:0}}>Sign in</button></span>
              : <span style={{fontFamily:F2,fontSize:12,color:T.stone}}>New to Wello? <button onClick={()=>{setMode("signup");setErr("");}} style={{background:"transparent",border:"none",color:T.sage,fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer",padding:0}}>Create your account</button></span>
            }
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// Shared modal shell (centered, padded, brand-token close button) — used by AuthModal
function ModalShell({ onClose, children }) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:1300,background:"rgba(27,28,25,0.7)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px"}} onClick={onClose}>
      <div style={{position:"relative",background:T.paper,borderRadius:16,maxWidth:420,width:"100%",maxHeight:"calc(100vh - 48px)",overflow:"hidden",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.25)",animation:"su .25s ease"}} onClick={e=>e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close"
          style={{position:"absolute",top:12,right:12,zIndex:10,background:"rgba(255,255,255,0.92)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",border:`1px solid rgba(195,200,188,0.35)`,color:T.ink,width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.12)"}}>×</button>
        {children}
      </div>
    </div>
  );
}

// Business-type picker — used for both "+ Add another venue" and for an
// existing partner who wants to change their listing type after the fact.
// title, subtitle, and currentType (highlighted with a sage ring) are
// optional so the caller can phrase it appropriately.
function AddVenueTypeModal({ onCancel, onPick, busy = false, title, subtitle, currentType }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  return (
    <ModalShell onClose={busy ? () => {} : onCancel}>
      <div style={{padding:"clamp(22px,4vw,28px)"}}>
        <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:20,fontWeight:700,color:T.ink,letterSpacing:"-0.4px",margin:"0 0 6px"}}>
          {title || "What kind of venue?"}
        </h2>
        <p style={{fontFamily:F2,fontSize:12,color:T.stone,lineHeight:1.65,margin:"0 0 18px",fontWeight:300}}>
          {subtitle || "Pick the option that best describes the new venue you're adding. This shapes the rest of the setup wizard."}
        </p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:8,marginBottom:14}}>
          {BUSINESS_TYPES.map(bt => {
            const isCurrent = currentType === bt.id;
            return (
              <button key={bt.id} type="button" disabled={busy} onClick={()=>onPick(bt.id)}
                style={{padding:"12px 14px",border:`1px solid ${isCurrent?T.sage:T.border}`,background:isCurrent?"rgba(33,60,24,0.06)":T.paper,borderRadius:8,fontFamily:F2,fontSize:12,fontWeight:600,color:T.ink,cursor:busy?"wait":"pointer",textAlign:"left",display:"flex",flexDirection:"column",gap:4,transition:"all .12s",position:"relative"}}
                onMouseEnter={e=>{if(!busy && !isCurrent){e.currentTarget.style.borderColor=T.sage;e.currentTarget.style.background="rgba(33,60,24,0.04)";}}}
                onMouseLeave={e=>{if(!busy && !isCurrent){e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.paper;}}}>
                <span style={{fontSize:18,lineHeight:1}}>{bt.icon}</span>
                <span style={{fontWeight:700,marginTop:2}}>{bt.label}</span>
                <span style={{fontSize:10,fontWeight:300,color:T.stone,lineHeight:1.4}}>{bt.desc}</span>
                {isCurrent && <span style={{position:"absolute",top:8,right:8,fontFamily:F2,fontSize:9,fontWeight:700,color:T.sage,letterSpacing:"0.5px",textTransform:"uppercase"}}>Current</span>}
              </button>
            );
          })}
        </div>
        <div style={{textAlign:"right"}}>
          <button onClick={onCancel} disabled={busy}
            style={{padding:"10px 18px",background:"transparent",color:T.stone,border:`1px solid ${T.border}`,borderRadius:2,fontFamily:F2,fontSize:12,fontWeight:300,cursor:busy?"wait":"pointer"}}>
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// Brand-aligned "are you sure?" modal for permanent venue removal. Replaces
// the native window.prompt flow which felt off-brand. Uses ModalShell + a
// "type DELETE to confirm" inline input so the destructive action still
// requires deliberate intent. Submit is disabled until the input matches.
function DeleteVenueModal({ venueName, onCancel, onConfirm, busy = false }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  const [typed, setTyped] = useState("");
  const matches = typed === "DELETE";
  return (
    <ModalShell onClose={busy ? () => {} : onCancel}>
      <div style={{padding:"clamp(22px,4vw,28px) clamp(20px,4vw,28px) clamp(20px,4vw,28px)"}}>
        <div style={{width:42,height:42,borderRadius:"50%",background:"#FFF0EA",border:"1px solid #E8B8A8",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14,fontSize:18,color:"#C46A4D"}}>!</div>
        <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:20,fontWeight:700,color:T.ink,letterSpacing:"-0.4px",margin:"0 0 10px"}}>
          Remove this venue?
        </h2>
        <p style={{fontFamily:F2,fontSize:13,color:T.stone,lineHeight:1.65,margin:"0 0 6px",fontWeight:300}}>
          You're about to permanently remove <strong style={{color:T.ink,fontWeight:600}}>{venueName || "this venue"}</strong>. We'll delete its listing on the marketplace, every slot, and your onboarding progress.
        </p>
        <p style={{fontFamily:F2,fontSize:13,color:T.stone,lineHeight:1.65,margin:"0 0 18px",fontWeight:300}}>
          This can't be undone. If you just want to take it offline, change its status in Settings instead.
        </p>
        <label style={{display:"block",fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:T.stone,marginBottom:6}}>
          Type <span style={{color:"#C46A4D"}}>DELETE</span> to confirm
        </label>
        <input value={typed} onChange={e => setTyped(e.target.value)} autoFocus
          placeholder="DELETE"
          style={{width:"100%",padding:"11px 14px",border:`1px solid ${matches ? "#C46A4D" : T.border}`,borderRadius:6,fontSize:13,fontFamily:F2,background:T.paper,color:T.ink,outline:"none",boxSizing:"border-box",letterSpacing:"0.5px",marginBottom:18,transition:"border-color .15s"}}
          onKeyDown={e => { if (e.key === "Enter" && matches && !busy) onConfirm(); }}
        />
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
          <button onClick={onCancel} disabled={busy}
            style={{padding:"10px 18px",background:"transparent",color:T.stone,border:`1px solid ${T.border}`,borderRadius:2,fontFamily:F2,fontSize:12,fontWeight:300,cursor:busy?"wait":"pointer"}}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={!matches || busy}
            style={{padding:"10px 18px",background:matches&&!busy?"#C46A4D":"#E4E2DD",color:matches&&!busy?"#fff":T.stone2,border:"none",borderRadius:2,fontFamily:F2,fontSize:12,fontWeight:600,cursor:matches&&!busy?"pointer":"not-allowed",transition:"background .15s"}}>
            {busy ? "Removing…" : "Remove venue"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Booking Modal ────────────────────────────────────────────────────────────
function BookingModal({ biz, slot, onClose, onConfirm, credits, onBuyCredits, profile, authSession, onOpenSignIn }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  const [step, setSt] = useState(1);
  const signedIn = !!authSession?.user;
  const profileName  = profile?.full_name || authSession?.user?.user_metadata?.full_name || "";
  const profileEmail = authSession?.user?.email || profile?.email || "";
  const [myName, setMyName] = useState(profileName);
  const [myEmail, setMyEmail] = useState(profileEmail);
  const [guests, setGuests] = useState([]); // [{type:"new", id, name, email}]
  const [newEmail, setNewEmail] = useState("");
  // Private-instructor only: collected at booking, both fields saved into
  // bookings.notes so the instructor knows where to travel to AND any
  // special instructions (gate codes, parking, what to bring, etc.).
  const [myLocation, setMyLocation] = useState("");
  const [myLocationNote, setMyLocationNote] = useState("");
  // Phone number for the partner to reach the customer. Pre-filled from
  // profiles.phone so a returning customer doesn't have to re-type it,
  // saved back on confirm. Required for private bookings, optional for
  // venue group classes (where the studio can fall back to email).
  const [myPhone, setMyPhone] = useState(profile?.phone || "");
  const isPrivateBooking = biz.cat === "Private Instructor";
  // Extra guests requested for a private session (separate from the studio
  // guest chip list). Only visible when the matched offering allows it.
  const [privateExtras, setPrivateExtras] = useState(0);
  // Look up the offering behind this slot so we can apply group-pricing
  // (extra_person_eur, max_people). We match on the slot name pattern used
  // during generation: "${type} · ${length_min} min".
  const matchedOffering = (() => {
    if (!isPrivateBooking) return null;
    const offs = Array.isArray(biz.session_offerings) ? biz.session_offerings : [];
    if (offs.length === 0) return null;
    const target = String(slot.name || "").toLowerCase();
    return offs.find(o => {
      const label = `${o.type || ""} · ${o.length_min || ""} min`.toLowerCase();
      return label === target;
    }) || null;
  })();
  const extraPersonPrice = matchedOffering && Number.isFinite(matchedOffering.extra_person_eur) && matchedOffering.extra_person_eur > 0
    ? matchedOffering.extra_person_eur : 0;
  const offeringMax = matchedOffering && Number.isFinite(matchedOffering.max_people) && matchedOffering.max_people > 1
    ? matchedOffering.max_people : (extraPersonPrice > 0 ? 8 : 1);
  // Extended travel surcharge — case-insensitive substring match of the
  // customer's typed address against the instructor's travel_areas list.
  // Core-coverage matches skip the fee. Falls through to no fee (and a
  // "may be outside coverage" warning) if nothing matches.
  const travelFee = Number(biz.travel_fee_eur) || 0;
  const travelAreas = Array.isArray(biz.travel_areas) ? biz.travel_areas : [];
  const coverageAreasList = Array.isArray(biz.coverage_areas) ? biz.coverage_areas : [];
  const addr = (myLocation || "").toLowerCase().trim();
  const inCore     = isPrivateBooking && addr.length > 0 && coverageAreasList.some(a => a && addr.includes(String(a).toLowerCase()));
  const inExtended = isPrivateBooking && !inCore && addr.length > 0 && travelAreas.some(a => a && addr.includes(String(a).toLowerCase())) && travelFee > 0;
  const outsideCoverage = isPrivateBooking && addr.length >= 6 && !inCore && !inExtended;
  const appliedTravelFee = inExtended ? travelFee : 0;
  const avail = isPrivateBooking ? 1 : slot.spots - slot.booked;
  const totalPeople = isPrivateBooking ? (1 + privateExtras) : (1 + guests.length);
  const cost = isPrivateBooking
    ? (biz.cr + privateExtras * extraPersonPrice + appliedTravelFee)
    : biz.cr * totalPeople;
  const canAfford = credits >= cost;
  const canAddMore = !isPrivateBooking && totalPeople < avail;
  // Require a usable address for private bookings — at least 6 chars so
  // a typo like 'p' doesn't pass. Notes are optional.
  const locationOk = !isPrivateBooking || myLocation.trim().length >= 6;
  // Required for private bookings (instructor needs to be able to call
  // the customer). Loose pattern — just enough digits to be plausible.
  const phoneOk = !isPrivateBooking || myPhone.replace(/[^\d]/g, '').length >= 7;

  // If the profile loads after the modal opens (rare race), pull the prefilled
  // values in. Won't clobber user edits because anon flow doesn't have a profile.
  useEffect(() => {
    if (signedIn) {
      if (!myName  && profileName)  setMyName(profileName);
      if (!myEmail && profileEmail) setMyEmail(profileEmail);
      if (!myPhone && profile?.phone) setMyPhone(profile.phone);
    }
  }, [signedIn, profileName, profileEmail, profile?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  function addNewGuest() {
    if (!newEmail.trim() || !canAddMore) return;
    setGuests(p=>[...p, {type:"new", id:Date.now(), name:newEmail, email:newEmail}]);
    setNewEmail("");
  }

  function removeGuest(id) {
    setGuests(p=>p.filter(g=>g.id!==id));
  }

  return (
    <div style={{position:"fixed",inset:0,zIndex:1200,background:"rgba(27,28,25,0.75)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px"}} onClick={onClose}>
      <div style={{position:"relative",background:"#fff",borderRadius:16,maxWidth:480,width:"100%",maxHeight:"calc(100vh - 48px)",overflow:"hidden",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.25)",animation:"su .25s ease"}} onClick={e=>e.stopPropagation()}>

        {/* Universal close button — frosted, visible on both dark header and white success view */}
        <button onClick={onClose} aria-label="Close"
          style={{position:"absolute",top:12,right:12,zIndex:10,background:"rgba(255,255,255,0.92)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",border:"1px solid rgba(195,200,188,0.35)",color:"#1B1C19",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.12)"}}>×</button>

        {step===1&&(
          <>
            {/* Header */}
            <div style={{background:"#213C18",padding:"clamp(18px,4vw,22px) clamp(18px,4vw,24px)",position:"relative"}}>
              <p style={{fontFamily:F2,fontSize:10,color:"rgba(255,255,255,0.5)",letterSpacing:"2px",textTransform:"uppercase",margin:"0 0 6px",fontWeight:600}}>Reserve your spot</p>
              <h2 style={{fontFamily:F2,fontSize:20,fontWeight:700,color:"#fff",margin:"0 0 4px",letterSpacing:"-0.5px"}}>{slot.name}</h2>
              <p style={{fontFamily:F2,fontSize:13,color:"rgba(255,255,255,0.65)",margin:"0 0 14px"}}>{biz.name} · {fd(slot.date)} · {slot.time} · {slot.dur}</p>
              <div style={{display:"flex",gap:16}}>
                {[["Pass",`◈ ${biz.cr} per person`],["Available",`${avail} spots`]].map(([k,v])=>(
                  <div key={k}>
                    <p style={{fontFamily:F2,fontSize:9,color:"rgba(255,255,255,0.45)",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 2px"}}>{k}</p>
                    <p style={{fontFamily:F2,fontSize:13,fontWeight:600,color:"#fff",margin:0}}>{v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{padding:"clamp(14px,3vw,20px) clamp(16px,3vw,24px)",maxHeight:"70vh",overflowY:"auto"}}>
              {/* Balance */}
              <div style={{background:canAfford?"#F5F3EE":"#FFF5F5",borderRadius:10,padding:"10px 14px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <p style={{fontFamily:F2,fontSize:9,color:"#54584F",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 2px"}}>Your balance</p>
                  <p style={{fontFamily:F2,fontSize:18,fontWeight:800,color:"#213C18",margin:0,letterSpacing:"-0.5px"}}>◈ {credits}</p>
                </div>
                {!canAfford
                  ? <button onClick={onBuyCredits} style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"8px 16px",fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer"}}>Add Credits</button>
                  : <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0}}>◈ {credits-cost} remaining</p>
                }
              </div>

              {/* Your details — chip when signed in, fields + sign-in link when not */}
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1px",textTransform:"uppercase",margin:"0 0 10px"}}>Booking as</p>
              {signedIn ? (
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"#F5F3EE",borderRadius:10,border:"1px solid rgba(195,200,188,0.4)",marginBottom:20}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:"#213C18",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F2,fontSize:14,fontWeight:800,color:"#fff",flexShrink:0}}>
                    {(profileName || profileEmail || "M").trim().charAt(0).toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontFamily:F2,fontSize:13,fontWeight:700,color:"#1B1C19",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profileName || "Member"}</p>
                    <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profileEmail}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:6}}>
                    {[{l:"Name",v:myName,set:setMyName,p:"Your full name"},{l:"Email",v:myEmail,set:setMyEmail,p:"you@example.com",t:"email"}].map(f=>(
                      <div key={f.l}>
                        <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:4}}>{f.l}</label>
                        <input type={f.t||"text"} placeholder={f.p} value={f.v} onChange={e=>f.set(e.target.value)}
                          style={{width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"10px 14px",fontFamily:F2,fontSize:14,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",transition:"border-color .15s"}}
                          onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                      </div>
                    ))}
                  </div>
                  {onOpenSignIn && (
                    <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 20px"}}>
                      Already a member? <button onClick={onOpenSignIn} style={{background:"transparent",border:"none",color:"#213C18",fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer",padding:0,textDecoration:"underline"}}>Log in</button>
                    </p>
                  )}
                </>
              )}

              {/* Private-instructor only: phone number — so the instructor
                  can reach the customer with logistics questions. Required
                  for private; optional for venue group classes. */}
              {isPrivateBooking && (
                <>
                  <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1px",textTransform:"uppercase",margin:"0 0 10px"}}>
                    Your mobile <span style={{color:"#C46A4D"}}>*</span>
                  </p>
                  <input type="tel"
                    placeholder="+34 600 000 000"
                    value={myPhone} onChange={e=>setMyPhone(e.target.value)}
                    style={{width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"10px 14px",fontFamily:F2,fontSize:13,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",marginBottom:6,transition:"border-color .15s"}}
                    onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                  <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:"0 0 18px"}}>
                    Stays private from other Wello members. Your instructor can call or text if they need clarification on the day.
                  </p>
                </>
              )}

              {/* Private-instructor only: exact session address + optional
                  arrival notes. Both fields composed into bookings.notes so
                  the instructor sees everything in one place. */}
              {isPrivateBooking && (
                <>
                  <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1px",textTransform:"uppercase",margin:"0 0 10px"}}>
                    Exact session address <span style={{color:"#C46A4D"}}>*</span>
                  </p>
                  <input type="text"
                    placeholder="Street, number, town · e.g. Carrer del Born 14, 07012 Palma"
                    value={myLocation} onChange={e=>setMyLocation(e.target.value)}
                    style={{width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"10px 14px",fontFamily:F2,fontSize:13,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",marginBottom:6,transition:"border-color .15s"}}
                    onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                  <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:"0 0 14px"}}>
                    Give a precise street + town so your instructor can navigate. Hotel names work too if you're a visitor.
                  </p>

                  <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1px",textTransform:"uppercase",margin:"0 0 8px"}}>
                    Arrival notes <span style={{color:"#54584F",fontWeight:500,fontSize:10,letterSpacing:0,textTransform:"none"}}>· optional</span>
                  </p>
                  <textarea
                    placeholder="Gate code, where to park, which floor, what to bring (mat, towel)…"
                    rows={2}
                    value={myLocationNote} onChange={e=>setMyLocationNote(e.target.value)}
                    style={{width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"10px 14px",fontFamily:F2,fontSize:13,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",marginBottom:18,resize:"vertical",lineHeight:1.5,transition:"border-color .15s"}}
                    onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>

                  <div style={{background:"#FFF7EA",border:"1px solid #E8C9A4",borderRadius:10,padding:"10px 14px",marginBottom:20}}>
                    <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#7A5C32",margin:"0 0 2px",letterSpacing:"0.3px"}}>This is a booking request</p>
                    <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:0,lineHeight:1.55}}>Your instructor has 48 hours to confirm. Credits are reserved but only deducted on confirmation. If declined or unanswered, we'll suggest alternative instructors and return your credits.</p>
                  </div>
                </>
              )}

              {/* Private group pricing — shown only when the instructor's
                  offering allows more than 1 person (extra_person_eur > 0). */}
              {isPrivateBooking && extraPersonPrice > 0 && (
                <div style={{marginBottom:16}}>
                  <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1px",textTransform:"uppercase",margin:"0 0 10px"}}>Number of people</p>
                  <div style={{background:"#F5F3EE",borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                    <div>
                      <p style={{fontFamily:F2,fontSize:13,color:"#1B1C19",fontWeight:600,margin:"0 0 3px"}}>{1 + privateExtras} {1 + privateExtras === 1 ? "person" : "people"}</p>
                      <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:0}}>◈ {biz.cr} for you{privateExtras > 0 ? ` + ${privateExtras} × ◈ ${extraPersonPrice} extra` : ""}</p>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <button type="button" onClick={()=>setPrivateExtras(p=>Math.max(0, p-1))} disabled={privateExtras <= 0}
                        style={{width:32,height:32,borderRadius:"50%",border:"1px solid rgba(33,60,24,0.3)",background:"#fff",color:"#213C18",fontFamily:F2,fontSize:16,fontWeight:700,cursor:privateExtras<=0?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,opacity:privateExtras<=0?0.4:1}}>−</button>
                      <span style={{fontFamily:F2,fontSize:14,fontWeight:700,color:"#213C18",minWidth:26,textAlign:"center"}}>{1 + privateExtras}</span>
                      <button type="button" onClick={()=>setPrivateExtras(p=>Math.min(offeringMax - 1, p+1))} disabled={1 + privateExtras >= offeringMax}
                        style={{width:32,height:32,borderRadius:"50%",border:"1px solid rgba(33,60,24,0.3)",background:"#fff",color:"#213C18",fontFamily:F2,fontSize:16,fontWeight:700,cursor:(1+privateExtras>=offeringMax)?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,opacity:(1+privateExtras>=offeringMax)?0.4:1}}>+</button>
                    </div>
                  </div>
                  <p style={{fontFamily:F2,fontSize:11,color:"#A3B18A",margin:"6px 0 0",lineHeight:1.5}}>Up to {offeringMax} people. The instructor adjusts the session for the group.</p>
                </div>
              )}

              {/* Bring friends — group classes only; private sessions are 1-to-1 */}
              {!isPrivateBooking && (
                <>
                  <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1px",textTransform:"uppercase",margin:"0 0 10px"}}>Bring friends <span style={{fontFamily:F2,fontSize:10,color:"#54584F",fontWeight:400,letterSpacing:0,textTransform:"none"}}>— optional</span></p>
                  <div style={{display:"flex",gap:8,marginBottom:20}}>
                    <input type="email" placeholder="Friend's email address" value={newEmail} onChange={e=>setNewEmail(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&addNewGuest()}
                      style={{flex:1,border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"10px 14px",fontFamily:F2,fontSize:13,color:"#1B1C19",outline:"none",background:"#FBF9F4",transition:"border-color .15s"}}
                      onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                    <button onClick={addNewGuest} disabled={!newEmail.trim()||!canAddMore}
                      style={{padding:"10px 16px",background:newEmail.trim()&&canAddMore?"#213C18":"#E4E2DD",color:newEmail.trim()&&canAddMore?"#fff":"#54584F",border:"none",borderRadius:8,fontFamily:F2,fontSize:13,fontWeight:700,cursor:newEmail.trim()&&newEmail.trim()&&canAddMore?"pointer":"not-allowed",transition:"all .15s",whiteSpace:"nowrap"}}>
                      + Add
                    </button>
                  </div>
                </>
              )}

              {/* Added guests list */}
              {guests.length>0&&(
                <div style={{background:"#F5F3EE",borderRadius:10,padding:"10px 14px",marginBottom:16}}>
                  <p style={{fontFamily:F2,fontSize:10,color:"#54584F",fontWeight:600,margin:"0 0 8px",letterSpacing:"1px",textTransform:"uppercase"}}>Booking for {totalPeople} people</p>
                  {guests.filter(g=>g.type==="new").map(g=>(
                    <div key={g.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <p style={{fontFamily:F2,fontSize:12,color:"#1B1C19",margin:0}}>📧 {g.email} <span style={{color:"#54584F",fontSize:11}}>(invite will be sent)</span></p>
                      <button onClick={()=>removeGuest(g.id)} style={{background:"transparent",border:"none",color:"#54584F",cursor:"pointer",fontSize:16}}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Order summary */}
              <div style={{background:"#F5F3EE",borderRadius:10,padding:"12px 14px",marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontFamily:F2,fontSize:13,color:"#54584F"}}>
                    {isPrivateBooking && privateExtras > 0
                      ? `◈ ${biz.cr} + ${privateExtras} × ◈ ${extraPersonPrice}`
                      : `${totalPeople} × ◈ ${biz.cr} credits`}
                  </span>
                  <span style={{fontFamily:F2,fontSize:13,fontWeight:700,color:"#213C18"}}>◈ {isPrivateBooking ? (biz.cr + privateExtras * extraPersonPrice) : cost}</span>
                </div>
                {appliedTravelFee > 0 && (
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontFamily:F2,fontSize:13,color:"#54584F"}}>Extended travel fee</span>
                    <span style={{fontFamily:F2,fontSize:13,fontWeight:700,color:"#B8925C"}}>+ ◈ {appliedTravelFee}</span>
                  </div>
                )}
                <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid rgba(195,200,188,0.3)",paddingTop:6}}>
                  <span style={{fontFamily:F2,fontSize:13,color:"#54584F"}}>Total</span>
                  <span style={{fontFamily:F2,fontSize:13,fontWeight:800,color:"#213C18"}}>◈ {cost}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",paddingTop:4}}>
                  <span style={{fontFamily:F2,fontSize:12,color:"#54584F"}}>Balance after</span>
                  <span style={{fontFamily:F2,fontSize:12,fontWeight:700,color:canAfford?"#213C18":"#e05c5c"}}>{canAfford?`◈ ${credits-cost}`:"Insufficient credits"}</span>
                </div>
              </div>
              {outsideCoverage && (
                <div style={{background:"#FFE6D9",border:"1px solid #DCC2A6",borderRadius:10,padding:"10px 14px",marginBottom:16}}>
                  <p style={{fontFamily:F2,fontSize:12,color:"#6F5B44",margin:0,lineHeight:1.55}}>
                    Your address may be outside the instructor's usual coverage. They'll review the request and let you know if they can travel there.
                  </p>
                </div>
              )}

              {(() => {
                const ok = myName && myEmail && canAfford && locationOk && phoneOk;
                const cta = !canAfford ? "Insufficient Credits"
                  : !phoneOk           ? "Add your mobile number to continue"
                  : !locationOk        ? "Add the session address to continue"
                  : isPrivateBooking   ? `Request booking · ◈ ${cost} held`
                  : `Confirm · ◈ ${cost} credits`;
                const cancelWindow = cancelWindowHoursFor(biz.cat);
                // Detect "late booking" — slot start is within 24h of now.
                // Copy mirrors clause 6.1 of the consumer terms so customers
                // see it before confirming a booking that can't be
                // cancelled.
                const slotStart = sessionDateTime(slot?.date, slot?.time);
                const isLateBooking = slotStart && (slotStart.getTime() - Date.now()) < 24 * 60 * 60 * 1000;
                return (
                  <>
                  <div style={{background:"#F5F3EE",border:"1px solid rgba(195,200,188,0.5)",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
                    <p style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 3px"}}>Cancellation policy</p>
                    <p style={{fontFamily:F2,fontSize:12,color:"#1B1C19",margin:0,lineHeight:1.55}}>
                      Cancel up to <strong>{cancelWindow} hours before</strong> the session and your credits come back in full. Cancellations after that aren't refundable.
                    </p>
                  </div>
                  {isLateBooking && !isPrivateBooking && (
                    <p style={{fontFamily:F2,fontSize:12,color:"#54584F",lineHeight:1.55,margin:"0 0 12px",fontStyle:"italic"}}>
                      This session starts in under 24 hours, so this booking is final once confirmed.
                    </p>
                  )}
                  <button onClick={()=>{
                      if (ok) {
                        onConfirm({
                          biz, slot, cost,
                          form: {
                            name: myName,
                            email: myEmail,
                            guests: totalPeople,
                            phone: isPrivateBooking ? myPhone.trim() : undefined,
                            location: isPrivateBooking ? myLocation.trim() : undefined,
                            locationNote: isPrivateBooking ? myLocationNote.trim() : undefined,
                            travelFee: appliedTravelFee || 0,
                          },
                        });
                        setSt(2);
                      }
                    }}
                    disabled={!ok}
                    style={{width:"100%",padding:"16px 0",borderRadius:999,background:ok?"#213C18":"#E4E2DD",color:ok?"#fff":"#54584F",border:"none",fontFamily:F2,fontSize:15,fontWeight:700,cursor:ok?"pointer":"not-allowed",transition:"all .15s",boxShadow:ok?"0 4px 14px rgba(33,60,24,0.2)":"none"}}>
                    {cta}
                  </button>
                  </>
                );
              })()}
            </div>
          </>
        )}

        {step===2&&(
          <div style={{padding:"48px 32px",textAlign:"center"}}>
            <div style={{width:64,height:64,background:isPrivateBooking?"#FFE6C7":"#CAECBA",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:28}}>{isPrivateBooking?"⏳":"✓"}</div>
            <h2 style={{fontFamily:F2,fontSize:22,fontWeight:700,color:"#213C18",margin:"0 0 8px",letterSpacing:"-0.5px"}}>{isPrivateBooking?"Booking requested":"Booking confirmed!"}</h2>
            <p style={{fontFamily:F2,fontSize:14,color:"#54584F",margin:"0 0 4px"}}>{slot.name} · {biz.name}</p>
            <p style={{fontFamily:F2,fontSize:13,color:"#54584F",margin:"0 0 20px"}}>{fd(slot.date)} · {slot.time}</p>
            {isPrivateBooking && (
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 20px",lineHeight:1.6}}>Your instructor has been notified by SMS. They have 48 hours to confirm. We'll email you the moment they do — credits stay on your account until then.</p>
            )}
            {guests.filter(g=>g.type==="new").length>0&&(
              <div style={{background:"#F5F3EE",borderRadius:10,padding:"12px 16px",marginBottom:20,textAlign:"left"}}>
                <p style={{fontFamily:F2,fontSize:12,fontWeight:600,color:"#213C18",margin:"0 0 6px"}}>📧 Invite emails sent to:</p>
                {guests.filter(g=>g.type==="new").map(g=>(
                  <p key={g.id} style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 2px"}}>{g.email}</p>
                ))}
              </div>
            )}
            <div style={{background:"#F5F3EE",borderRadius:10,padding:"10px 16px",marginBottom:24,display:"inline-block"}}>
              <span style={{fontFamily:F2,fontSize:13,color:"#54584F"}}>◈ {cost} used · balance ◈ {credits-cost}</span>
            </div>
            <br/>
            <button onClick={onClose} style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"12px 32px",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer"}}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Business Panel ───────────────────────────────────────────────────────────
function BizPanel({ biz, onClose, onBook, authSession, credits, onOpenSignIn, onGotoCredits, onBookingsChanged, showToast }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";

  // Photo carousel — primary img + gallery, deduped and blank-filtered.
  // Falls back to a stock image if the venue has nothing.
  const FALLBACK_IMG = "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80";
  const photoList = (() => {
    const raw = [biz.img, ...(Array.isArray(biz.gallery) ? biz.gallery : [])].filter(Boolean);
    const deduped = Array.from(new Set(raw));
    return deduped.length > 0 ? deduped : [FALLBACK_IMG];
  })();
  const photoTrackRef = useRef(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  function scrollToPhoto(i) {
    const el = photoTrackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }
  // Update the active dot as the user swipes.
  function onPhotoScroll(e) {
    const el = e.currentTarget;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== photoIdx) setPhotoIdx(i);
  }

  // Compute effective availability — a slot is unavailable if it's directly
  // booked OR if its time range overlaps with another booked slot on the
  // same date (e.g. 10:00 Pilates 90-min booked → 10:00 Yoga 60-min and
  // 11:00 Yoga 60-min also become unavailable, since the instructor is
  // busy through 11:30). Lets a single 1-to-1 booking sweep every
  // overlapping offering off the marketplace in one go.
  function parseDur(d) {
    const n = parseInt(d, 10);
    return Number.isFinite(n) && n > 0 ? n : 60;
  }
  function slotRange(s) {
    const [h, m] = (s.time || "00:00").split(":").map(Number);
    const start = (h || 0) * 60 + (m || 0);
    return [start, start + parseDur(s.dur)];
  }
  const fullySlots = (biz.slots || []).filter(s => (s.booked || 0) >= (s.spots || 1));
  function isEffectivelyBlocked(slot) {
    if ((slot.booked || 0) >= (slot.spots || 1)) return true;
    const [aStart, aEnd] = slotRange(slot);
    for (const t of fullySlots) {
      if (t.date !== slot.date) continue;
      if (t.id === slot.id) continue;
      const [bStart, bEnd] = slotRange(t);
      if (aStart < bEnd && bStart < aEnd) return true; // overlaps
    }
    return false;
  }
  // Slots filtered to ones that are still bookable. Used for the date
  // pills, the slot list, and the "next slot" preview at the bottom.
  const bookableSlots = (biz.slots || []).filter(s => !isEffectivelyBlocked(s));

  // ─── Multi-modality routing ─────────────────────────────────────────────
  // Businesses now come in three shapes:
  //   - Classes only (traditional studios, gyms, hotels)
  //   - Private sessions only (private instructors: their session_offerings
  //     are already expanded into slots so we render as timetable)
  //   - Both (studio with treatments, e.g. Yoga Del Mar with 11 classes + a
  //     private session offering) — needs a segment control
  //
  // Private-instructor businesses always route into classes-view because
  // their offerings are surfaced via slots. Only non-private venues with
  // separate session_offerings entries get the split UI.
  const rawOfferings = Array.isArray(biz.session_offerings) ? biz.session_offerings : [];
  const isPrivateInstructor = biz.cat === "Private Instructor";
  const offerings = isPrivateInstructor ? [] : rawOfferings;
  const hasClasses = bookableSlots.length > 0;
  const hasOfferings = offerings.length > 0;
  const showSegments = hasClasses && hasOfferings;
  // Treatment / spa detection — if every offering type reads like a treatment,
  // label the segment "Treatments"; otherwise "Private sessions". Keeps the
  // language honest for spa-type venues without hard-coding categories.
  const TREATMENT_RE = /(massage|treatment|therapy|reflexolog|facial|reiki|shiatsu|deep tissue|swedish|thai|hot stone|acupuncture)/i;
  const allTreatments = offerings.length > 0 && offerings.every(o => TREATMENT_RE.test(String(o.type || "")));
  const privateSegLabel = allTreatments ? "Treatments" : "Private sessions";
  const [segment, setSegment] = useState(hasClasses ? "classes" : "private");

  // ─── Classes segment: filter chips + 7-day chips ────────────────────────
  const distinctSessionNames = Array.from(new Set(bookableSlots.map(s => s.name).filter(Boolean))).sort();
  const [filterNames, setFilterNames] = useState(() => new Set());
  function toggleFilter(name) {
    setFilterNames(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }
  // After filters are applied — slots that survive both the availability
  // check and the session-name filter.
  const filteredSlots = filterNames.size === 0
    ? bookableSlots
    : bookableSlots.filter(s => filterNames.has(s.name));

  // Build the 7-day chip array: Today, Tomorrow, then five more dated chips.
  // Labels: "Today", "Tomorrow", then dow + day-of-month (e.g. "Thu 16").
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayChips = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    let label;
    if (i === 0) label = "Today";
    else if (i === 1) label = "Tomorrow";
    else label = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
    const count = filteredSlots.filter(s => s.date === iso).length;
    return { iso, label, count };
  });
  // Default the selection to the first day in the chip range with matching
  // slots. Falls back to today so the user still sees the empty-state copy.
  const firstDayWithSlots = dayChips.find(c => c.count > 0)?.iso || dayChips[0].iso;
  const [selDate, setSel] = useState(firstDayWithSlots);
  // If the filter reshuffles which days have content, snap to the first
  // still-available day so the user is not stuck on an empty tab.
  useEffect(() => {
    const stillHas = dayChips.find(c => c.iso === selDate)?.count > 0;
    if (!stillHas) {
      const next = dayChips.find(c => c.count > 0)?.iso;
      if (next) setSel(next);
    }
    // Intentionally not tracking dayChips in deps — it rebuilds every render.
    // We only care about the filter changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterNames]);
  const slotsForDate = filteredSlots
    .filter(s => s.date === selDate)
    .slice()
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));

  // ─── Offering contact panel state ──────────────────────────────────────
  // ── Offering request panel state ──────────────────────────────────────
  // Reveal-per-offering pattern: only one panel open at a time so the
  // modal stays compact. Each panel wraps a request form that hits the
  // request-treatment-booking edge function, mirroring the private
  // instructor pending flow with a 48h window.
  const [openOfferingIdx, setOpenOfferingIdx] = useState(null);
  const _todayIso = new Date().toISOString().slice(0, 10);
  const _tomorrow = new Date(); _tomorrow.setDate(_tomorrow.getDate() + 1);
  const _plus30   = new Date(); _plus30.setDate(_plus30.getDate() + 30);
  const _minReqDate = _tomorrow.toISOString().slice(0, 10);
  const _maxReqDate = _plus30.toISOString().slice(0, 10);
  const [reqDate, setReqDate]           = useState(_minReqDate);
  const [reqTimePref, setReqTimePref]   = useState("morning");
  const [reqSpecificTime, setReqSpecificTime] = useState("18:00");
  const [reqNote, setReqNote]           = useState("");
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqError, setReqError]         = useState("");
  const [reqSuccessFor, setReqSuccessFor] = useState(null); // offering index of last successful submit
  function resetRequestForm() {
    setReqDate(_minReqDate);
    setReqTimePref("morning");
    setReqSpecificTime("18:00");
    setReqNote("");
    setReqError("");
    setReqSubmitting(false);
  }
  function openOffering(idx) {
    if (openOfferingIdx === idx) { setOpenOfferingIdx(null); return; }
    resetRequestForm();
    setReqSuccessFor(null);
    setOpenOfferingIdx(idx);
  }
  async function submitOfferingRequest(offering) {
    setReqError("");
    if (!authSession) { onOpenSignIn?.(); return; }
    const priceEur = Number.isFinite(Number(offering?.price_eur)) ? Number(offering.price_eur) : 0;
    if (priceEur <= 0) { setReqError("This offering has no price set. Contact the venue directly."); return; }
    if (Number(credits) < priceEur) {
      onGotoCredits?.();
      return;
    }
    setReqSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('request-treatment-booking', {
        body: {
          business_id: biz.id,
          offering_type: offering?.type || null,
          preferred_date: reqDate,
          time_pref: reqTimePref,
          specific_time: reqTimePref === 'specific' ? reqSpecificTime : undefined,
          note: reqNote || undefined,
        },
      });
      if (error) { setReqError(error.message || 'Could not send request.'); return; }
      if (data?.error === 'insufficient_credits') {
        onGotoCredits?.();
        return;
      }
      if (data?.error) { setReqError(data.error); return; }
      setReqSuccessFor(openOfferingIdx);
      onBookingsChanged?.();
      showToast?.("Request sent. The venue has 48 hours to confirm.", "info", 4200);
    } catch (e) {
      setReqError(e?.message || 'Could not send request.');
    } finally {
      setReqSubmitting(false);
    }
  }
  function humanDuration(mins) {
    const n = Number(mins);
    if (!Number.isFinite(n) || n <= 0) return "";
    if (n % 60 === 0) return `${n / 60} hour${n === 60 ? "" : "s"}`;
    return `${n} min`;
  }

  return (
    <div style={{position:"fixed",inset:0,zIndex:1100,background:"rgba(27,28,25,0.6)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px"}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:16,maxWidth:640,width:"100%",maxHeight:"88vh",overflow:"hidden",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.25)",animation:"su .25s ease"}} onClick={e=>e.stopPropagation()}>

        {/* Hero image carousel — primary + gallery in a horizontal scroll.
            Scroll-snap makes it swipeable on mobile; prev/next arrows appear
            on hover for desktop. Dots at the bottom indicate position. */}
        {/* aspect-ratio scales the height with modal width, so mobile stays
            in a compact 16:9 (~200px tall) and desktop opens up to a
            landscape 5:3 (~380px tall) where object-fit: cover no longer
            crops the top and bottom off portrait-ish photos. Clamp above
            keeps it from getting absurdly tall on huge screens. */}
        <div style={{position:"relative",aspectRatio:"5 / 3",maxHeight:420}}>
          <div
            ref={photoTrackRef}
            onScroll={onPhotoScroll}
            style={{
              display:"flex",width:"100%",height:"100%",
              overflowX:"auto",overflowY:"hidden",
              scrollSnapType:"x mandatory",
              WebkitOverflowScrolling:"touch",
              scrollbarWidth:"none",
            }}>
            {photoList.map((src, i) => (
              <div key={i} style={{flex:"0 0 100%",height:"100%",scrollSnapAlign:"start",position:"relative"}}>
                <img src={src} alt={`${biz.name} photo ${i+1}`} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
                  onError={e=>{e.target.src=FALLBACK_IMG;}}/>
              </div>
            ))}
          </div>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(27,28,25,0.88) 0%,rgba(27,28,25,0.05) 55%)",pointerEvents:"none"}}/>
          {photoList.length > 1 && (
            <>
              {/* Prev / next arrows — hidden on the extremes */}
              {photoIdx > 0 && (
                <button aria-label="Previous photo" onClick={()=>scrollToPhoto(photoIdx-1)}
                  style={{position:"absolute",top:"50%",left:12,transform:"translateY(-50%)",background:"rgba(27,28,25,0.55)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",border:"none",color:"#FBF9F4",width:34,height:34,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,fontFamily:F2}}>
                  ‹
                </button>
              )}
              {photoIdx < photoList.length - 1 && (
                <button aria-label="Next photo" onClick={()=>scrollToPhoto(photoIdx+1)}
                  style={{position:"absolute",top:"50%",right:12,transform:"translateY(-50%)",background:"rgba(27,28,25,0.55)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",border:"none",color:"#FBF9F4",width:34,height:34,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,fontFamily:F2}}>
                  ›
                </button>
              )}
              {/* Dot indicators */}
              <div style={{position:"absolute",top:14,left:"50%",transform:"translateX(-50%)",display:"flex",gap:6,padding:"5px 10px",background:"rgba(27,28,25,0.5)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",borderRadius:999}}>
                {photoList.map((_, i) => (
                  <button key={i} aria-label={`Go to photo ${i+1}`} onClick={()=>scrollToPhoto(i)}
                    style={{width:6,height:6,borderRadius:"50%",background:i===photoIdx?"#FBF9F4":"rgba(251,249,244,0.4)",border:"none",padding:0,cursor:"pointer"}}/>
                ))}
              </div>
              {/* Photo counter bottom-right */}
              <div style={{position:"absolute",bottom:16,right:16,background:"rgba(27,28,25,0.6)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",borderRadius:999,padding:"3px 10px",fontFamily:F2,fontSize:10,fontWeight:600,color:"#FBF9F4"}}>
                {photoIdx+1}/{photoList.length}
              </div>
            </>
          )}
          <button onClick={onClose} aria-label="Close" style={{position:"absolute",top:12,right:12,zIndex:10,background:"rgba(255,255,255,0.95)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",border:"1px solid rgba(195,200,188,0.4)",color:"#1B1C19",width:40,height:40,borderRadius:"50%",cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,boxShadow:"0 4px 12px rgba(0,0,0,0.18)"}}>×</button>
          <div style={{position:"absolute",bottom:16,left:20,right:20}}>
            {/* Category pills */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              <span style={{fontFamily:F2,fontSize:10,fontWeight:700,color:"#fff",background:"#213C18",padding:"3px 10px",borderRadius:999}}>{biz.cat}</span>
              {biz.tags?.slice(0,3).map(t=>(
                <span key={t} style={{fontFamily:F2,fontSize:10,color:"rgba(255,255,255,0.85)",background:"rgba(255,255,255,0.15)",backdropFilter:"blur(4px)",padding:"3px 10px",borderRadius:999}}>{t}</span>
              ))}
            </div>
            <h2 style={{fontFamily:F2,fontSize:22,fontWeight:700,color:"#fff",margin:"0 0 6px",letterSpacing:"-0.5px"}}>{biz.name}</h2>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <Stars n={biz.rating}/>
              <span style={{fontFamily:F2,fontSize:12,color:"rgba(255,255,255,0.6)"}}>({biz.reviews} reviews)</span>
              <span style={{fontFamily:F2,fontSize:12,color:"rgba(255,255,255,0.6)"}}>📍 {biz.loc}</span>
              <span style={{background:"rgba(255,255,255,0.15)",backdropFilter:"blur(4px)",borderRadius:999,padding:"3px 10px",fontFamily:F2,fontSize:11,fontWeight:700,color:"#fff"}}>◈ {biz.cr} per person</span>
            </div>
          </div>
        </div>

        <div style={{padding:"clamp(14px,3vw,20px) clamp(16px,3vw,24px)"}}>
          <p style={{fontFamily:F2,fontSize:14,color:"#54584F",lineHeight:1.7,margin:"0 0 20px"}}>{biz.desc}</p>

          {/* Full postal address — non-private venues only. Private instructors
              come to the customer so we show their coverage areas below instead. */}
          {biz.cat !== "Private Instructor" && biz.address && (
            <div style={{background:"#F5F3EE",border:"1px solid rgba(195,200,188,0.4)",borderRadius:10,padding:"14px 16px",marginBottom:20,display:"flex",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:"1 1 220px",minWidth:0}}>
                <p style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 6px"}}>Where to find us</p>
                <p style={{fontFamily:F2,fontSize:14,fontWeight:600,color:"#213C18",margin:"0 0 4px",lineHeight:1.5}}>📍 {biz.address}</p>
                {biz.loc && <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0}}>{biz.loc}, Mallorca</p>}
              </div>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(biz.address + ", Mallorca")}`} target="_blank" rel="noopener noreferrer"
                style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",background:"#fff",border:"1px solid rgba(33,60,24,0.3)",padding:"7px 14px",borderRadius:999,textDecoration:"none",whiteSpace:"nowrap",letterSpacing:"0.3px"}}>
                Open in Maps →
              </a>
            </div>
          )}

          {/* Private instructors: surface coverage areas as pills so guests
              know exactly where the instructor travels to */}
          {biz.cat === "Private Instructor" && Array.isArray(biz.coverage_areas) && biz.coverage_areas.length > 0 && (
            <div style={{marginBottom:20}}>
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 8px"}}>Travels to</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {biz.coverage_areas.map(loc => (
                  <span key={loc} style={{fontFamily:F2,fontSize:11,fontWeight:500,color:"#54584F",background:"rgba(228,226,221,0.6)",padding:"4px 10px",borderRadius:999}}>{loc}</span>
                ))}
              </div>
              {Array.isArray(biz.travel_areas) && biz.travel_areas.length > 0 && Number(biz.travel_fee_eur) > 0 && (
                <>
                  <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#B8925C",letterSpacing:"1.5px",textTransform:"uppercase",margin:"14px 0 8px"}}>Also travels for +◈ {Number(biz.travel_fee_eur)}</p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {biz.travel_areas.map(loc => (
                      <span key={loc} style={{fontFamily:F2,fontSize:11,fontWeight:500,color:"#766149",background:"rgba(214,180,124,0.2)",border:"1px solid rgba(184,146,92,0.4)",padding:"4px 10px",borderRadius:999}}>{loc}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Cancellation policy — shown before slot selection so members
              know the refund window before they pick a session. */}
          <div style={{background:"#F5F3EE",border:"1px solid rgba(195,200,188,0.4)",borderRadius:10,padding:"10px 14px",marginBottom:20,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:15,lineHeight:1}}>↻</span>
            <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0,lineHeight:1.55,flex:"1 1 200px"}}>
              Free cancellation up to <strong style={{color:"#213C18"}}>{cancelWindowHoursFor(biz.cat)} hours</strong> before the session. Credits are returned in full.
            </p>
          </div>

          {/* ─── Segment control ────────────────────────────────────────────
              Shown only when the venue has both a class timetable AND
              appointment-style offerings. Simple venues (private
              instructors, class-only studios) render their single kind
              directly to preserve the current experience. */}
          {showSegments && (
            <div style={{display:"flex",gap:6,padding:4,background:"#F0EDEA",borderRadius:999,marginBottom:20}}>
              {[
                { id: "classes", label: "Classes" },
                { id: "private", label: privateSegLabel },
              ].map(seg => {
                const on = segment === seg.id;
                return (
                  <button key={seg.id} onClick={() => setSegment(seg.id)}
                    style={{
                      flex:1,padding:"9px 16px",borderRadius:999,border:"none",cursor:"pointer",
                      background:on ? "#213C18" : "transparent",
                      color:on ? "#fff" : "#213C18",
                      fontFamily:F2,fontSize:13,fontWeight:700,letterSpacing:"-0.2px",transition:"all .15s",
                    }}>
                    {seg.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* ─── Classes segment ─────────────────────────────────────────── */}
          {(segment === "classes" || !showSegments) && hasClasses && (
            <>
              {/* Session-type filter chips. Only surface when there is more
                  than one distinct class name, otherwise chips add clutter
                  without helping the user narrow anything down. */}
              {distinctSessionNames.length > 1 && (
                <>
                  <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 10px"}}>Filter by class</p>
                  <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:6,marginBottom:16,scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
                    {distinctSessionNames.map(name => {
                      const on = filterNames.has(name);
                      return (
                        <button key={name} onClick={() => toggleFilter(name)}
                          style={{
                            flexShrink:0,padding:"7px 14px",borderRadius:999,
                            background:on ? "#213C18" : "#F5F3EE",
                            color:on ? "#fff" : "#213C18",
                            border:"1px solid " + (on ? "#213C18" : "rgba(195,200,188,0.5)"),
                            fontFamily:F2,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s",
                          }}>
                          {name}
                        </button>
                      );
                    })}
                    {filterNames.size > 0 && (
                      <button onClick={() => setFilterNames(new Set())}
                        style={{flexShrink:0,padding:"7px 12px",borderRadius:999,background:"transparent",color:"#54584F",border:"none",fontFamily:F2,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
                        Clear
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* 7-day chip strip: Today, Tomorrow, then five more dated
                  chips. Chips with zero matching slots after filters render
                  disabled but still visible so the strip stays predictable. */}
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 10px"}}>Pick a day</p>
              <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4,marginBottom:20,scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
                {dayChips.map(c => {
                  const isSelected = selDate === c.iso;
                  const enabled = c.count > 0;
                  return (
                    <button key={c.iso} onClick={() => enabled && setSel(c.iso)} disabled={!enabled}
                      style={{
                        flexShrink:0,padding:"10px 16px",borderRadius:12,border:"none",cursor:enabled?"pointer":"not-allowed",textAlign:"center",transition:"all .15s",minWidth:78,
                        background:isSelected ? "#213C18" : enabled ? "#F5F3EE" : "#F0EDEA",
                        opacity:enabled ? 1 : 0.45,
                      }}>
                      <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:isSelected?"rgba(255,255,255,0.85)":"#213C18",margin:"0 0 3px",letterSpacing:"0.3px"}}>
                        {c.label}
                      </p>
                      <p style={{fontFamily:F2,fontSize:10,color:isSelected?"rgba(255,255,255,0.6)":"#54584F",margin:0}}>
                        {enabled ? `${c.count} class${c.count === 1 ? "" : "es"}` : "None"}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Timetable rows for selected day, sorted by start time. */}
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 10px"}}>
                {slotsForDate.length > 0 ? `${slotsForDate.length} class${slotsForDate.length === 1 ? "" : "es"} on ${fd(selDate)}` : `Nothing on ${fd(selDate)}`}
              </p>
              <div style={{display:"flex",flexDirection:"column",gap:8,paddingBottom:8}}>
                {slotsForDate.length === 0
                  ? <p style={{fontFamily:F2,fontSize:13,color:"#54584F",padding:"20px 0",textAlign:"center"}}>Try a different day or clear filters.</p>
                  : slotsForDate.map(sl => {
                      const avail = sl.spots - sl.booked;
                      const full = avail === 0;
                      const pct = (sl.booked / sl.spots) * 100;
                      return (
                        <div key={sl.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",flexWrap:"wrap",background:full?"#F5F3EE":"#FBF9F4",borderRadius:12,border:`1px solid ${full?"rgba(195,200,188,0.3)":"rgba(195,200,188,0.5)"}`,opacity:full?0.6:1,transition:"all .15s"}}
                          onMouseEnter={e=>{if(!full)e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.06)"}}
                          onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                          {/* Time */}
                          <div style={{textAlign:"center",minWidth:48,flexShrink:0}}>
                            <p style={{fontFamily:F2,fontSize:16,fontWeight:800,color:"#213C18",margin:0,letterSpacing:"-0.5px"}}>{sl.time}</p>
                            <p style={{fontFamily:F2,fontSize:10,color:"#54584F",margin:0}}>{sl.dur}</p>
                          </div>
                          <div style={{width:1,height:32,background:"rgba(195,200,188,0.5)",flexShrink:0}}/>
                          {/* Info */}
                          <div style={{flex:1,minWidth:120}}>
                            <p style={{fontFamily:F2,fontSize:14,fontWeight:600,color:"#1B1C19",margin:"0 0 4px"}}>{sl.name}</p>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <div style={{width:80,height:4,background:"#E4E2DD",borderRadius:999}}>
                                <div style={{width:`${pct}%`,height:"100%",background:pct>80?"#B8925C":"#213C18",borderRadius:999,transition:"width .3s"}}/>
                              </div>
                              <span style={{fontFamily:F2,fontSize:11,color:full?"#e05c5c":pct>80?"#B8925C":"#213C18",fontWeight:600}}>
                                {full ? "Full" : `${avail} of ${sl.spots} left`}
                              </span>
                            </div>
                          </div>
                          {/* Book button */}
                          <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                            <span style={{fontFamily:F2,fontSize:12,fontWeight:700,color:"#213C18"}}>◈ {biz.cr}</span>
                            <button onClick={()=>!full&&onBook(biz,sl)} disabled={full}
                              style={{padding:"10px 20px",background:full?"#E4E2DD":"#213C18",color:full?"#54584F":"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:full?"not-allowed":"pointer",transition:"all .15s",whiteSpace:"nowrap"}}
                              onMouseEnter={e=>{if(!full)e.currentTarget.style.opacity="0.85"}}
                              onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                              {full ? "Full" : "Book →"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                }
              </div>
            </>
          )}

          {/* ─── Private sessions / Treatments segment ─────────────────── */}
          {(segment === "private" || (!showSegments && hasOfferings)) && hasOfferings && (
            <>
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 10px"}}>
                {privateSegLabel}
              </p>
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",lineHeight:1.55,margin:"0 0 16px"}}>
                Not on the timetable. Pick an offering and request a booking. The venue will confirm within 48 hours.
              </p>
              <div style={{display:"flex",flexDirection:"column",gap:10,paddingBottom:8}}>
                {offerings.map((o, i) => {
                  const price = Number.isFinite(Number(o?.price_eur)) ? Number(o.price_eur) : biz.cr;
                  const durLabel = humanDuration(o?.length_min);
                  const open = openOfferingIdx === i;
                  return (
                    <div key={i} style={{padding:"14px 16px",background:"#FBF9F4",borderRadius:12,border:"1px solid rgba(195,200,188,0.5)",transition:"all .15s"}}>
                      <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                        <div style={{flex:"1 1 200px",minWidth:0}}>
                          <p style={{fontFamily:F2,fontSize:15,fontWeight:700,color:"#1B1C19",margin:"0 0 4px",letterSpacing:"-0.2px"}}>{o?.type || "Session"}</p>
                          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                            {durLabel && <span style={{fontFamily:F2,fontSize:12,color:"#54584F"}}>{durLabel}</span>}
                            <span style={{fontFamily:F2,fontSize:12,fontWeight:700,color:"#213C18"}}>◈ {price}</span>
                          </div>
                          {o?.description && (
                            <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"6px 0 0",lineHeight:1.55}}>{o.description}</p>
                          )}
                        </div>
                        <button onClick={() => openOffering(i)}
                          style={{padding:"10px 18px",background:open ? "#F5F3EE" : "#213C18",color:open ? "#213C18" : "#fff",border:open ? "1px solid rgba(195,200,188,0.5)" : "none",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s"}}>
                          {open ? "Close" : "Request booking"}
                        </button>
                      </div>

                      {/* Inline request form. Posts to request-treatment-booking,
                          which mints HMAC accept/decline tokens and emails the
                          venue. Credits are held (not deducted) until the venue
                          accepts, mirroring pending_instructor. */}
                      {open && reqSuccessFor === i && (
                        <div style={{marginTop:14,padding:"12px 14px",background:"#F5F3EE",border:"1px solid rgba(163,177,138,0.6)",borderRadius:10}}>
                          <p style={{fontFamily:F2,fontSize:12,fontWeight:700,color:"#213C18",margin:"0 0 6px",letterSpacing:"-0.1px"}}>Request sent</p>
                          <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0,lineHeight:1.55}}>
                            The venue will confirm within 48 hours. If they cannot host you, your credits are returned in full. You can cancel the request from your bookings at any time.
                          </p>
                        </div>
                      )}
                      {open && reqSuccessFor !== i && (
                        <div style={{marginTop:14,padding:"14px 14px",background:"#fff",border:"1px solid rgba(195,200,188,0.5)",borderRadius:10}}>
                          <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1.2px",textTransform:"uppercase",margin:"0 0 4px"}}>Request booking</p>
                          <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 12px",lineHeight:1.55}}>
                            Pick a date and time preference. The venue has 48 hours to confirm. Your credits are held from your balance while the request is pending and returned in full if the venue cannot host you.
                          </p>

                          <div style={{display:"flex",flexDirection:"column",gap:10}}>
                            <label style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"0.5px",textTransform:"uppercase"}}>
                              Preferred date
                              <input type="date" value={reqDate} min={_minReqDate} max={_maxReqDate}
                                onChange={e => setReqDate(e.target.value)}
                                style={{display:"block",marginTop:4,padding:"9px 12px",border:"1px solid rgba(195,200,188,0.6)",borderRadius:8,fontFamily:F2,fontSize:13,background:"#fff",color:"#1B1C19",width:"100%",boxSizing:"border-box"}}/>
                            </label>

                            <div>
                              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"0.5px",textTransform:"uppercase",margin:"0 0 4px"}}>Time preference</p>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                {[
                                  { id: "morning",   label: "Morning" },
                                  { id: "afternoon", label: "Afternoon" },
                                  { id: "evening",   label: "Evening" },
                                  { id: "specific",  label: "Specific time" },
                                ].map(p => {
                                  const on = reqTimePref === p.id;
                                  return (
                                    <button key={p.id} type="button" onClick={() => setReqTimePref(p.id)}
                                      style={{padding:"7px 12px",borderRadius:999,border:"1px solid " + (on ? "#213C18" : "rgba(195,200,188,0.6)"),background:on ? "#213C18" : "#fff",color:on ? "#fff" : "#213C18",fontFamily:F2,fontSize:12,fontWeight:600,cursor:"pointer"}}>
                                      {p.label}
                                    </button>
                                  );
                                })}
                              </div>
                              {reqTimePref === "specific" && (
                                <input type="time" value={reqSpecificTime}
                                  onChange={e => setReqSpecificTime(e.target.value)}
                                  style={{display:"block",marginTop:8,padding:"9px 12px",border:"1px solid rgba(195,200,188,0.6)",borderRadius:8,fontFamily:F2,fontSize:13,background:"#fff",color:"#1B1C19",width:130}}/>
                              )}
                            </div>

                            <label style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"0.5px",textTransform:"uppercase"}}>
                              Note (optional)
                              <textarea rows={2} value={reqNote} maxLength={500}
                                onChange={e => setReqNote(e.target.value)}
                                placeholder="Anything the venue should know, or a range of times that suit you."
                                style={{display:"block",marginTop:4,padding:"9px 12px",border:"1px solid rgba(195,200,188,0.6)",borderRadius:8,fontFamily:F2,fontSize:13,background:"#fff",color:"#1B1C19",width:"100%",boxSizing:"border-box",resize:"vertical"}}/>
                            </label>

                            {reqError && (
                              <div style={{padding:"8px 12px",background:"#F8E4D9",border:"1px solid rgba(139,47,0,0.2)",borderRadius:8,fontFamily:F2,fontSize:12,color:"#8B2F00"}}>{reqError}</div>
                            )}

                            <div style={{display:"flex",justifyContent:"flex-end"}}>
                              <button type="button" onClick={() => submitOfferingRequest(o)} disabled={reqSubmitting}
                                style={{padding:"10px 20px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:reqSubmitting?"not-allowed":"pointer",opacity:reqSubmitting?0.6:1}}>
                                {reqSubmitting ? "Sending..." : `Send request · ◈ ${price} held`}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Empty state safety net — venue with no slots and no offerings
              (shouldn't reach the marketplace, but handle gracefully). */}
          {!hasClasses && !hasOfferings && (
            <p style={{fontFamily:F2,fontSize:13,color:"#54584F",padding:"20px 0",textAlign:"center"}}>
              No sessions available yet. Please check back soon.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Listing Card ─────────────────────────────────────────────────────────────
function Card({ biz, onSelect, syncing, saved, onToggleSave, compact = false }) {
  // Defensive: a fresh listing with no slots yet would crash this find().
  const next = (biz.slots || []).find(s => s.booked < s.spots);
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  // Compact = denser cards for the carousel rows; standard = full-bleed grid cards.
  const s = compact ? {
    imgPad:"100%", imgMargin:8, imgRadius:10,
    badgeT:8, badgeR:8, badgePad:"2px 8px", badgeFont:10,
    saveT:8, saveL:8, saveSize:26, saveFont:12,
    nameFont:13, ratingFont:11, ratingIcon:10,
    locFont:11, locMargin:4, locIcon:9,
    pillFont:9, pillPad:"2px 7px", pillGap:4, pillMargin:4,
    slotFont:10, tagsToShow:1,
  } : {
    imgPad:"100%", imgMargin:16, imgRadius:12,
    badgeT:14, badgeR:14, badgePad:"4px 12px", badgeFont:11,
    saveT:12, saveL:12, saveSize:32, saveFont:14,
    nameFont:16, ratingFont:13, ratingIcon:12,
    locFont:13, locMargin:8, locIcon:11,
    pillFont:11, pillPad:"3px 10px", pillGap:6, pillMargin:6,
    slotFont:11, tagsToShow:2,
  };
  return (
    <div onClick={()=>onSelect(biz)} style={{cursor:"pointer"}}>
      <div style={{position:"relative",paddingBottom:s.imgPad,borderRadius:s.imgRadius,overflow:"hidden",marginBottom:s.imgMargin,background:"#E4E2DD"}}>
        <img src={biz.img} alt={biz.name}
          style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",transition:"transform .7s ease"}}
          onMouseEnter={e=>e.target.style.transform="scale(1.05)"}
          onMouseLeave={e=>e.target.style.transform="scale(1)"}/>
        <div style={{position:"absolute",top:s.badgeT,right:s.badgeR,background:"rgba(255,255,255,0.92)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",borderRadius:999,padding:s.badgePad}}>
          <span style={{fontFamily:F2,fontSize:s.badgeFont,fontWeight:800,color:"#213C18"}}>◈ {biz.cr}</span>
        </div>
        <button onClick={e=>{e.stopPropagation();onToggleSave(biz.id);}}
          style={{position:"absolute",top:s.saveT,left:s.saveL,width:s.saveSize,height:s.saveSize,borderRadius:"50%",background:"rgba(255,255,255,0.92)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:s.saveFont,color:saved?"#e05c5c":"#54584F"}}>
          {saved ? "♥" : "♡"}
        </button>
        {syncing&&(
          <div style={{position:"absolute",bottom:10,left:10,display:"flex",alignItems:"center",gap:4,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(6px)",borderRadius:999,padding:"3px 8px"}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:"#A3B18A",display:"inline-block"}}/>
            <span style={{fontFamily:F2,fontSize:9,color:"#fff",fontWeight:500}}>Live</span>
          </div>
        )}
      </div>
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:2}}>
          <h3 style={{fontFamily:F2,fontSize:s.nameFont,fontWeight:700,color:"#1B1C19",letterSpacing:"-0.3px",margin:0,flex:1,paddingRight:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{biz.name}</h3>
          <div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
            <span style={{color:"#6F5B44",fontSize:s.ratingIcon}}>★</span>
            <span style={{fontFamily:F2,fontSize:s.ratingFont,fontWeight:700}}>{biz.rating}</span>
          </div>
        </div>
        <p style={{fontFamily:F2,fontSize:s.locFont,color:"#54584F",margin:`0 0 ${s.locMargin}px`,display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:s.locIcon}}>📍</span> {biz.loc}
        </p>
        <div style={{display:"flex",gap:s.pillGap,flexWrap:"wrap",marginBottom:s.pillMargin}}>
          {/* Category pill uses the customer-facing label ("Private Classes"
              instead of the technical "Private Instructor"). The old extra
              "Private" badge next to it was redundant and pushed the pill
              row onto a second line on narrower columns, which cascaded to
              make private-tile rows taller than everything else. */}
          <span style={{fontFamily:F2,fontSize:s.pillFont,fontWeight:600,color:"#766149",background:"rgba(250,222,192,0.5)",padding:s.pillPad,borderRadius:999}}>{catLabel(biz.cat)}</span>
          {biz.tags?.slice(0,s.tagsToShow).map(t=>(
            <span key={t} style={{fontFamily:F2,fontSize:s.pillFont,fontWeight:500,color:"#54584F",background:"rgba(228,226,221,0.6)",padding:s.pillPad,borderRadius:999}}>{t}</span>
          ))}
        </div>
        {next
          ? <p style={{fontFamily:F2,fontSize:s.slotFont,color:"#213C18",fontWeight:600,margin:0}}>{next.spots-next.booked} spots left · {next.time}</p>
          : <p style={{fontFamily:F2,fontSize:s.slotFont,color:"#54584F",margin:0}}>Fully booked · check back soon</p>
        }
      </div>
    </div>
  );
}

// ─── AI Chatbot ───────────────────────────────────────────────────────────────
function Chatbot({ listings, credits, bookings, onSelectBiz }) {
  const [open,setOpen]=useState(false);
  const [msgs,setMsgs]=useState([{r:"ai",t:"Hola! I'm your Mallorca wellness concierge. Ask me to find classes, recommend experiences, or help with anything. 🌿"}]);
  const [inp,setInp]=useState(""); const [loading,setLoading]=useState(false); const [sugBiz,setSugBiz]=useState(null);
  const btm=useRef(null);
  useEffect(()=>{btm.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  async function send() {
    if (!inp.trim()||loading) return;
    const u=inp.trim(); setInp(""); setSugBiz(null);
    setMsgs(p=>[...p,{r:"user",t:u}]); setLoading(true);
    const ls=listings.map(b=>`ID:${b.id} "${b.name}" ${b.cat} ${b.loc} ◈${b.cr}`).join("\n");
    const convo=msgs.map(m=>`${m.r==="user"?"User":"AI"}: ${m.t}`).join("\n");
    const res=await aiJSON(`Warm Mallorca wellness concierge. Under 55 words. Return ONLY JSON: {"message":"response","suggestedId":null}`,`Listings:\n${ls}\nCredits:◈${credits}\nConvo:\n${convo}\nUser:${u}`);
    if(res){setMsgs(p=>[...p,{r:"ai",t:res.message}]);if(res.suggestedId)setSugBiz(listings.find(b=>b.id===res.suggestedId)||null);}
    else setMsgs(p=>[...p,{r:"ai",t:"Sorry, could you try again?"}]);
    setLoading(false);
  }
  return (
    <>
      {/* Wello G1 pill FAB — sage pill, ochre token */}
      <div onClick={()=>setOpen(o=>!o)} style={{position:"fixed",bottom:90,right:16,zIndex:1100,cursor:"pointer",transition:"transform .18s"}}
        onMouseEnter={e=>e.currentTarget.style.transform="scale(1.05)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
        <div style={{display:"flex",alignItems:"center",gap:8,background:T.sage,borderRadius:50,padding:"10px 18px",boxShadow:"0 5px 20px rgba(78,107,67,.35)"}}>
          <span style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:15,fontWeight:700,color:"#fff",letterSpacing:"-0.5px"}}>wello</span>
          <span style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:11,color:"rgba(255,255,255,.6)",fontWeight:300}}>{open?"close":"ask"}</span>
        </div>
        <div style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:T.ochre,display:"flex",alignItems:"center",justifyContent:"center",border:`2px solid ${T.paper}`,fontSize:9,color:"#fff",fontWeight:700,fontFamily:"'Jost',system-ui,sans-serif"}}>◈</div>
      </div>
      {open&&(
        <div style={{position:"fixed",bottom:164,right:16,zIndex:1100,width:"min(306px,calc(100vw - 32px))",background:T.paper,borderRadius:4,boxShadow:"0 14px 42px rgba(0,0,0,.16)",overflow:"hidden",animation:"su .22s ease",display:"flex",flexDirection:"column",maxHeight:440,border:`1px solid ${T.border}`}}>
          {/* C1 header — white wordmark on sage, ochre rule */}
          <div style={{background:T.sage,padding:"13px 15px",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:16,fontWeight:700,color:"#fff",letterSpacing:"-0.5px",lineHeight:1}}>wello</div>
                <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:7,fontWeight:400,color:T.ochreL,letterSpacing:"3px",marginTop:2,textTransform:"uppercase"}}>the wellness pass</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{width:4,height:4,borderRadius:"50%",background:"#a3d9a0",display:"inline-block",animation:"pulse 2s infinite"}}/>
                <span style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:8,color:"rgba(255,255,255,.45)"}}>AI concierge</span>
              </div>
            </div>
            <div style={{height:1.5,background:T.ochre,opacity:0.5,marginTop:10,borderRadius:1}}/>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"9px",display:"flex",flexDirection:"column",gap:6}}>
            {msgs.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.r==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"82%",padding:"6px 9px",borderRadius:m.r==="user"?"8px 8px 2px 8px":"8px 8px 8px 2px",background:m.r==="user"?T.sage:T.bg,color:m.r==="user"?"#fff":T.ink,fontFamily:F.body,fontSize:11,lineHeight:1.5,fontWeight:m.r==="user"?400:300}}>{m.t}</div>
              </div>
            ))}
            {loading&&<div style={{display:"flex"}}><div style={{padding:"6px 10px",borderRadius:"8px 8px 8px 2px",background:T.bg,display:"flex",gap:3}}>{[0,1,2].map(i=><span key={i} style={{width:4,height:4,borderRadius:"50%",background:T.border2,display:"inline-block",animation:`pulse 1.2s infinite ${i*.2}s`}}/>)}</div></div>}
            {sugBiz&&(
              <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:3,padding:"7px 9px",animation:"fi .24s"}}>
                <div style={{display:"flex",gap:7,alignItems:"center"}}>
                  <img src={sugBiz.img} style={{width:32,height:32,borderRadius:2,objectFit:"cover"}} alt=""/>
                  <div style={{flex:1}}><div style={{fontFamily:F.body,fontSize:12,color:T.ink,fontWeight:600}}>{sugBiz.name}</div><div style={{fontFamily:F.body,fontSize:9,color:T.stone,fontWeight:300}}>📍 {sugBiz.loc}</div></div>
                </div>
                <button onClick={()=>{onSelectBiz(sugBiz);setOpen(false);}} style={{width:"100%",marginTop:5,padding:"5px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontSize:10,fontFamily:F.body,fontWeight:600,cursor:"pointer"}}>View & Book →</button>
              </div>
            )}
            <div ref={btm}/>
          </div>
          <div style={{padding:"6px 8px",borderTop:`1px solid ${T.border}`,display:"flex",gap:5,flexShrink:0}}>
            <input value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Ask anything…"
              style={{flex:1,padding:"6px 9px",border:`1px solid ${T.border}`,borderRadius:2,fontSize:11,fontFamily:F.body,background:T.bg,color:T.ink,outline:"none"}}
              onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=T.border}/>
            <button onClick={send} disabled={loading||!inp.trim()} style={{padding:"6px 11px",background:loading||!inp.trim()?T.border:T.sage,color:loading||!inp.trim()?T.stone:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontWeight:600,fontSize:11,cursor:loading||!inp.trim()?"not-allowed":"pointer"}}>↑</button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Sync Engine ──────────────────────────────────────────────────────────────
function SyncEngine({ listings, onUpdate }) {
  useEffect(()=>{
    const fire=()=>{
      const b=listings[Math.floor(Math.random()*listings.length)]; if(!b) return;
      // Defensive: a private-instructor listing (or any new listing) may not
      // have any slots populated yet — skip the tick rather than crashing on
      // sl being undefined.
      const bookable = (b.slots || []).filter(s => s && typeof s.spots === 'number');
      if (bookable.length === 0) return;
      const sl=bookable[Math.floor(Math.random()*bookable.length)];
      const avail=sl.spots-sl.booked;
      const t=avail===0?(Math.random()>.5?"cancel":null):(Math.random()>.6?"book":null);
      if(!t) return;
      setTimeout(()=>onUpdate(b.id,sl.id,t==="book"?1:-1),500+Math.random()*500);
    };
    const iv=setInterval(fire,5000+Math.random()*3000); return()=>clearInterval(iv);
  },[listings.length]);
  return null;
}

// ═══════════════════════════════════════════════════════════════
// PAGE: HOME
// ═══════════════════════════════════════════════════════════════
function HomePage({ listings, listingsLoading, bookings, onSelect, savedIds, onToggleSave, onSetView, syncingIds, onGotoCredits }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";

  // Featured strip is a static 4-up of the first listings. Used to host an
  // AI search that filtered this strip in place (no navigation) — removed
  // because the better-positioned search lives on /explore now.
  const featured = listings.slice(0,4);

  return (
    <div>
      {/* ── IMMERSIVE HERO — giant wordmark, gradient, AI search ── */}
      <section style={{position:"relative",minHeight:"calc(100svh - 91px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"clamp(24px,6vw,80px) clamp(16px,4vw,24px) 80px",background:"linear-gradient(to bottom, #FBF9F4 0%, #FBF9F4 60%, rgba(250,222,192,0.2) 100%)",overflow:"hidden"}}>
        {/* Blur blobs */}
        <div style={{position:"absolute",top:"10%",left:"-10%",width:"60%",height:"60%",borderRadius:"50%",background:"rgba(202,236,186,0.12)",filter:"blur(120px)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:"10%",right:"-10%",width:"70%",height:"70%",borderRadius:"50%",background:"rgba(250,222,192,0.15)",filter:"blur(150px)",pointerEvents:"none"}}/>

        <div style={{position:"relative",zIndex:1,maxWidth:840,width:"100%",textAlign:"center",padding:"0 4px"}}>
          <p style={{fontFamily:F2,fontSize:10,fontWeight:700,color:"#A3B18A",letterSpacing:"4px",textTransform:"uppercase",margin:"0 0 8px"}}>The Wellness Pass</p>
          <h1 style={{fontFamily:F2,fontWeight:800,fontSize:"clamp(40px,11vw,160px)",color:"#213C18",lineHeight:1,letterSpacing:"clamp(-2px,-0.04em,-6px)",margin:"0 0 clamp(6px,2vw,20px)",userSelect:"none"}}>wello</h1>
          <p style={{fontFamily:F2,fontSize:"clamp(12px,2vw,18px)",color:"#54584F",fontWeight:500,lineHeight:1.5,maxWidth:520,margin:"0 auto clamp(10px,2.5vw,32px)",letterSpacing:"-0.2px",padding:"0 8px"}}>
            No membership. Just one pass. Book yoga, gyms, hotel pools, spa treatments, outdoor adventures or a private instructor who comes to you, all across Mallorca. Cancel any time.
          </p>
          {/* CTAs — the home page used to host an AI search bar here, but
              it filtered the Featured strip in place rather than navigating,
              which felt broken. The semantic search lives on /explore now;
              the Explore CTA below sends guests straight to it. */}
          <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap",marginTop:"clamp(16px,3vw,28px)"}}>
            {/* Explore is the primary CTA — filled forest green — because
                browsing is the natural first click. Credits is the secondary
                outlined action, shown to the right. */}
            <button onClick={()=>onSetView("explore")}
              style={{display:"inline-flex",alignItems:"center",gap:8,padding:"12px clamp(16px,4vw,36px)",borderRadius:999,background:"#213C18",color:"#FBF9F4",border:"2px solid #213C18",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 6px 16px rgba(33,60,24,0.18)"}}>
              Explore Wello →
            </button>
            <button onClick={onGotoCredits || (()=>onSetView("credits"))}
              style={{padding:"12px clamp(16px,4vw,36px)",borderRadius:999,background:"transparent",color:"#213C18",border:"2px solid #213C18",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer"}}>
              Buy credits
            </button>
          </div>
        </div>

      </section>

      

      {/* ── STATEMENT STRIP — leads with the no-membership differentiator ── */}
      <div id="statement-strip" style={{background:"#213C18",padding:"14px 24px"}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"flex",justifyContent:"center",alignItems:"center",gap:0,flexWrap:"wrap"}}>
          {["No membership","One pass","Any venue"].map((s,i,arr)=>(
            <div key={s} style={{display:"flex",alignItems:"center",gap:0}}>
              <span style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,fontWeight:600,color:"#CAECBA",letterSpacing:"-0.2px",padding:"4px 10px",whiteSpace:"nowrap"}}>{s}</span>
              {i<arr.length-1&&<span style={{color:"rgba(163,177,138,0.4)",fontSize:14}}>·</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURED SECTION ── */}
      <section id="featured" style={{padding:"clamp(40px,6vw,80px) clamp(16px,4vw,32px)",maxWidth:1200,margin:"0 auto"}}>
        <div style={{display:"flex",flexWrap:"wrap",alignItems:"flex-end",justifyContent:"space-between",marginBottom:"clamp(24px,4vw,48px)",gap:12}}>
          <h2 style={{fontFamily:F2,fontSize:"clamp(28px,5vw,56px)",fontWeight:700,color:"#1B1C19",letterSpacing:"-2px",margin:0,lineHeight:1}}>Featured on Wello</h2>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <p style={{fontFamily:F2,fontSize:14,color:"#54584F",maxWidth:280,lineHeight:1.6,margin:0,display:"none"}}>Hand-picked spaces and experiences.</p>
            <button onClick={()=>onSetView("explore")}
              style={{background:"transparent",border:"none",fontFamily:F2,fontSize:13,fontWeight:700,color:"#213C18",cursor:"pointer",whiteSpace:"nowrap",padding:0}}>
              See all →
            </button>
          </div>
        </div>
        {/* Responsive card grid — 1 col mobile, 2 col tablet, 4 col desktop */}
        {listingsLoading
          ? <div style={{display:"flex",gap:16,overflowX:"hidden"}}>
              {[1,2,3,4].map(i=>(
                <div key={i} style={{minWidth:"clamp(200px,60vw,260px)",flexShrink:0}}>
                  <div style={{paddingBottom:"100%",borderRadius:12,background:"linear-gradient(90deg,#E4E2DD 25%,#EAE8E3 50%,#E4E2DD 75%)",backgroundSize:"200% 100%",animation:"shimmer 1.5s infinite",marginBottom:12}}/>
                  <div style={{height:16,borderRadius:8,background:"#E4E2DD",marginBottom:8,width:"70%"}}/>
                  <div style={{height:12,borderRadius:8,background:"#E4E2DD",width:"50%"}}/>
                </div>
              ))}
            </div>
          : <div style={{display:"flex",overflowX:"auto",gap:16,paddingBottom:12,scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
              {featured.slice(0,4).map((biz,i)=>(
                // width (not just minWidth) so long venue names or wrapped
                // pill rows can't push some cards wider than others. Without
                // a fixed width, each card grows to its content-size and the
                // image containers end up different sizes on mobile.
                <div key={biz.id} style={{width:"clamp(200px,60vw,260px)",flexShrink:0}}>
                  <Card biz={biz} onSelect={onSelect} syncing={!!syncingIds[biz.id]} saved={savedIds.includes(biz.id)} onToggleSave={onToggleSave}/>
                </div>
              ))}
            </div>
        }
      </section>

      {/* ── PRIVATE INSTRUCTORS HIGHLIGHT ──
          Surfaces the private-instructor capability so it isn't buried below
          the studio-led featured grid. One row, brand colors, clear CTA. */}
      <section style={{padding:"clamp(28px,5vw,56px) clamp(16px,4vw,32px)",background:"#FBF9F4"}}>
        <div style={{maxWidth:1100,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"clamp(20px,4vw,48px)",flexWrap:"wrap",padding:"clamp(20px,4vw,40px)",background:"#213C18",borderRadius:16,position:"relative",overflow:"hidden"}}>
          {/* subtle gold accent */}
          <div style={{position:"absolute",top:-40,right:-40,width:240,height:240,borderRadius:"50%",background:"rgba(214,180,124,0.10)",pointerEvents:"none"}}/>
          <div style={{flex:"1 1 360px",minWidth:0,position:"relative",zIndex:1}}>
            <p style={{fontFamily:F2,fontSize:10,fontWeight:700,color:"#D6B47C",letterSpacing:"3px",textTransform:"uppercase",margin:"0 0 10px"}}>New on Wello</p>
            <h3 style={{fontFamily:F2,fontSize:"clamp(24px,3.5vw,36px)",fontWeight:700,color:"#fff",letterSpacing:"-1px",margin:"0 0 12px",lineHeight:1.1}}>Book a private instructor</h3>
            <p style={{fontFamily:F2,fontSize:"clamp(13px,1.5vw,15px)",color:"rgba(255,255,255,0.7)",fontWeight:400,lineHeight:1.65,margin:"0 0 18px",maxWidth:520}}>
              Yoga, pilates, surf, fitness — request a 1-to-1 session and our local instructors come to you. Same pass. Same credits. Pick a slot, tell us where you're based, and your instructor confirms within 48 hours.
            </p>
            <button onClick={()=>{ onSetView("explore"); setTimeout(()=>{ const evt=new CustomEvent('wello-set-cat',{detail:'Private Instructor'}); window.dispatchEvent(evt); },50); }}
              style={{padding:"11px 22px",background:"#D6B47C",color:"#213C18",border:"none",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:"pointer",letterSpacing:"-0.2px"}}
              onMouseEnter={e=>e.currentTarget.style.background="#E8C798"} onMouseLeave={e=>e.currentTarget.style.background="#D6B47C"}>
              Browse private instructors →
            </button>
          </div>
          {/* Right-side stats column */}
          <div style={{display:"flex",gap:24,flexWrap:"wrap",position:"relative",zIndex:1}}>
            {[
              ["1-to-1","Always private"],
              ["48h","Instructor confirms"],
              ["Comes to you","Beach, home, park"],
            ].map(([k,v])=>(
              <div key={k}>
                <p style={{fontFamily:F2,fontSize:18,fontWeight:800,color:"#fff",margin:"0 0 2px",letterSpacing:"-0.5px"}}>{k}</p>
                <p style={{fontFamily:F2,fontSize:11,color:"rgba(255,255,255,0.55)",margin:0}}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PARTNER OF THE WEEK ── */}
      {listings.length > 0 && (()=>{
        const partner = listings[0]; // swap index to change featured partner
        const photos = [
          "https://images.unsplash.com/photo-1588286840104-8957b019727f?w=800&q=80", // yoga class action
          "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80",  // serene outdoor/detail
          "https://images.unsplash.com/photo-1545389336-cf090694435e?w=600&q=80",     // close-up texture/person
        ];
        return (
          <section style={{padding:"clamp(40px,6vw,72px) clamp(16px,4vw,32px)",background:"#1B1C19"}}>
            <div style={{maxWidth:1200,margin:"0 auto"}}>
              {/* Label row */}
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:"clamp(24px,3vw,36px)"}}>
                <div style={{display:"inline-flex",alignItems:"center",gap:7,background:"rgba(184,146,92,0.15)",border:"1px solid rgba(184,146,92,0.35)",borderRadius:999,padding:"5px 14px"}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:"#B8925C",display:"inline-block",flexShrink:0}}/>
                  <span style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:10,fontWeight:700,color:"#B8925C",letterSpacing:"2px",textTransform:"uppercase"}}>Partner of the week</span>
                </div>
                <div style={{flex:1,height:"1px",background:"rgba(255,255,255,0.07)"}}/>
                <span style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:10,color:"rgba(255,255,255,0.2)",letterSpacing:"1px"}}>April 2026</span>
              </div>

              {/* Two-column: collage left, identity right — stacks on mobile */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,320px),1fr))",gap:"clamp(24px,4vw,56px)",alignItems:"center"}}>

                {/* ── 3-photo collage ── */}
                <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gridTemplateRows:"1fr 1fr",gap:8,height:"clamp(220px,50vw,460px)"}}>
                  {/* Large portrait — spans both rows */}
                  <div style={{gridRow:"1 / 3",borderRadius:12,overflow:"hidden",background:"#2A2B27"}}>
                    <img src={photos[0]} alt={partner.name}
                      style={{width:"100%",height:"100%",objectFit:"cover",filter:"saturate(0.9) contrast(1.05)",transition:"transform .8s ease"}}
                      onMouseEnter={e=>e.target.style.transform="scale(1.04)"}
                      onMouseLeave={e=>e.target.style.transform="scale(1)"}/>
                  </div>
                  {/* Top-right smaller */}
                  <div style={{borderRadius:12,overflow:"hidden",background:"#2A2B27"}}>
                    <img src={photos[1]} alt=""
                      style={{width:"100%",height:"100%",objectFit:"cover",filter:"saturate(0.85) contrast(1.05)",transition:"transform .8s ease"}}
                      onMouseEnter={e=>e.target.style.transform="scale(1.05)"}
                      onMouseLeave={e=>e.target.style.transform="scale(1)"}/>
                  </div>
                  {/* Bottom-right */}
                  <div style={{borderRadius:12,overflow:"hidden",background:"#2A2B27"}}>
                    <img src={photos[2]} alt=""
                      style={{width:"100%",height:"100%",objectFit:"cover",filter:"saturate(0.8) contrast(1.08)",transition:"transform .8s ease"}}
                      onMouseEnter={e=>e.target.style.transform="scale(1.06)"}
                      onMouseLeave={e=>e.target.style.transform="scale(1)"}/>
                  </div>
                </div>

                {/* ── Identity panel ── */}
                <div style={{display:"flex",flexDirection:"column",justifyContent:"center",gap:0}}>
                  <span style={{display:"inline-block",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:10,fontWeight:700,color:"#A3B18A",letterSpacing:"2px",textTransform:"uppercase",marginBottom:12}}>{partner.cat}</span>
                  <h2 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:"clamp(24px,4vw,52px)",fontWeight:800,color:"#fff",letterSpacing:"-1.5px",margin:"0 0 10px",lineHeight:1.0}}>{partner.name}</h2>
                  <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"rgba(255,255,255,0.4)",margin:"0 0 20px",fontWeight:500}}>📍 {partner.loc}, Mallorca</p>
                  <div style={{width:40,height:1,background:"rgba(255,255,255,0.15)",marginBottom:20}}/>
                  <div style={{display:"flex",gap:24,marginBottom:28}}>
                    <div>
                      <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:"clamp(18px,2.5vw,28px)",fontWeight:800,color:"#fff",margin:"0 0 3px",letterSpacing:"-0.5px"}}>◈ {partner.cr}</p>
                      <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:10,color:"rgba(255,255,255,0.3)",margin:0,textTransform:"uppercase",letterSpacing:"1.5px"}}>Per session</p>
                    </div>
                    <div style={{width:1,background:"rgba(255,255,255,0.08)"}}/>
                    <div>
                      <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:"clamp(18px,2.5vw,28px)",fontWeight:800,color:"#fff",margin:"0 0 3px",letterSpacing:"-0.5px"}}>{partner.rating} ★</p>
                      <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:10,color:"rgba(255,255,255,0.3)",margin:0,textTransform:"uppercase",letterSpacing:"1.5px"}}>{partner.reviews} reviews</p>
                    </div>
                  </div>
                  <button onClick={()=>onSelect(partner)}
                    style={{alignSelf:"flex-start",padding:"13px 28px",background:"#fff",color:"#1B1C19",border:"none",borderRadius:999,fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,fontWeight:800,cursor:"pointer",letterSpacing:"-0.2px"}}>
                    Explore partner →
                  </button>
                </div>
              </div>
            </div>
          </section>
        );
      })()}

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE: CONSUMER TERMS OF USE
// ═══════════════════════════════════════════════════════════════
// Public, static, always accessible via /terms (view === "terms"). Rendered
// from the CONSUMER_TERMS_SECTIONS array below so the text lives in one
// place and can be reused (e.g. for an emailable PDF later) without
// duplicating the copy.
const CONSUMER_TERMS_SECTIONS = [
  {
    title: 'Who we are and what these terms cover',
    body: [
      '1.1  Wello is operated by Wello-Wellness Ltd, a company registered in England and Wales ("Wello", "we", "us"). Our contact email is hello@wello-wellness.com.',
      '1.2  These terms apply when you create a Wello account, purchase or receive Wello credits, or book a session with a venue or instructor listed on the Wello platform (each a "Partner").',
      '1.3  Wello is a marketplace. We list sessions offered by independent Partners, take bookings and collect payment on their behalf. The Partner, not Wello, delivers your session and is responsible for the session itself. Wello is responsible for the platform, your credits and the booking process.',
      '1.4  If you are a consumer in Spain or elsewhere in the EU, nothing in these terms affects the mandatory consumer rights you have under the law of the country you live in.',
    ],
  },
  {
    title: 'Your account',
    body: [
      '2.1  You must be at least 18 years old to create an account and book sessions.',
      '2.2  You are responsible for keeping your login details secure and for activity on your account. Tell us promptly at hello@wello-wellness.com if you believe your account has been used without your permission.',
      '2.3  The information on your account must be accurate. For sessions delivered at your location (private instructors), you must provide an accurate meeting location within the instructor\'s stated coverage area.',
    ],
  },
  {
    title: 'Credits',
    body: [
      '3.1  Wello credits are the currency of the platform. One credit always equals one euro of session value. Session prices are set by Partners and shown in credits.',
      '3.2  Credits are purchased through the platform. Payment is processed by Stripe. We may charge a service fee on credit purchases; any service fee is shown clearly before you pay.',
      '3.3  Credits do not expire and remain available on your account until used or refunded under these terms.',
      '3.4  Credits are personal to your account and cannot be transferred to another account, except by using the gifting feature described in clause 8 or where we agree otherwise.',
      '3.5  Credits are available to spend immediately after purchase. By purchasing credits you acknowledge and agree that credits you have spent on bookings are deducted at full value from any refund of your purchase.',
    ],
  },
  {
    title: 'Your right of withdrawal on credit purchases',
    body: [
      '4.1  If you are a consumer, you have a legal right to withdraw from a purchase of credits within 14 days of the purchase, without giving a reason.',
      '4.2  To exercise this right, email hello@wello-wellness.com from the email address on your account within 14 days of the purchase, stating that you wish to withdraw from the purchase.',
      '4.3  If you withdraw, we will refund the amount you paid for the purchase, less the full value of any credits from that purchase you have already spent on bookings (in line with your acknowledgment in clause 3.5), using the original payment method, within 14 days of your request.',
      '4.4  The right of withdrawal applies to the purchase of credits. It does not apply to individual bookings, which are services related to leisure activities with a specific date or period of performance and are instead governed by the cancellation policy in clause 6.',
    ],
  },
  {
    title: 'Bookings',
    body: [
      '5.1  A booking is confirmed when you complete the booking flow and receive a confirmation on the platform or by email. Credits equal to the session price are deducted from your balance when the booking is made.',
      '5.2  Private instructor sessions work by request. The instructor has up to 48 hours to accept. If the instructor does not accept within 48 hours, the request is automatically declined and your credits are returned in full.',
      '5.3  Some venues use a short safety window after a booking is confirmed, during which the venue may cancel if it has a genuine scheduling conflict. If this happens your credits are returned in full and we will suggest alternative sessions. This is rare and exists to prevent double bookings.',
      '5.4  Session details, including what is included, duration, location and any requirements (such as fitness level or equipment), are set out in the Partner\'s listing. Check the listing before booking.',
      '5.5  You are expected to arrive on time and to follow the Partner\'s reasonable rules at the venue, including health and safety instructions.',
    ],
  },
  {
    title: 'Cancellations, no-shows and refunds',
    body: [
      '6.1  You can cancel a booking through the platform. The cancellation window is shown at the time of booking. Unless the listing states otherwise, bookings can be cancelled up to 24 hours before the session start time for a full credit refund. Bookings made within 24 hours of the session start time are final once confirmed and cannot be cancelled; this is made clear before you confirm such a booking.',
      '6.2  If you cancel within the cancellation window, your credits are returned to your account in full.',
      '6.3  If you do not attend a booked session and have not cancelled within the window (a no-show), the credits for that session are not refunded. The Partner has reserved that time and capacity for you and is paid for the booking.',
      '6.4  If a Partner cancels your booking (including under the safety window in clause 5.3), your credits are returned in full.',
      '6.5  If a session materially fails to match its listing or is not delivered, contact us at hello@wello-wellness.com within 7 days. Where we agree the session was not delivered as described, we will refund the credits for that booking. This does not limit your statutory rights.',
      '6.6  Refunds under these terms are made in credits to your Wello account, except refunds under clause 4 (withdrawal from a credit purchase), which are made to your original payment method.',
    ],
  },
  {
    title: 'Prices and payment',
    body: [
      '7.1  Session prices in credits are set by Partners and may change, but the price you pay is the price shown when you book.',
      '7.2  Credit purchase prices and any service fee are shown before you pay. Payment is taken immediately at purchase by our payment provider, Stripe. We do not store your card details.',
      '7.3  Prices shown include applicable VAT or IVA unless stated otherwise.',
    ],
  },
  {
    title: 'Gifting',
    body: [
      '8.1  You can purchase credits as a gift for another person. Gifted credits are delivered to the recipient as described in the gifting flow and are subject to these terms once accepted.',
      '8.2  The right of withdrawal in clause 4 applies to gift purchases and belongs to the purchaser, but ends once the recipient has accepted or begun to spend the gifted credits.',
    ],
  },
  {
    title: 'Health and safety',
    body: [
      '9.1  Wellness and fitness activities carry inherent physical risk. You are responsible for ensuring you are physically able to take part in a session, and for informing the Partner of any relevant health condition, injury or limitation before the session begins.',
      '9.2  If in doubt about your fitness to participate, seek medical advice before booking. Partners may decline participation where they reasonably consider it unsafe.',
    ],
  },
  {
    title: 'Our responsibility to you',
    body: [
      '10.1  Wello is responsible for operating the platform with reasonable skill and care, for handling your credits and payments correctly, and for the booking process.',
      '10.2  The Partner is responsible for delivering the session safely and as described. Wello does not deliver, supervise or control sessions. Claims relating to the delivery of a session, including personal injury at a session, should be addressed to the Partner. We will provide reasonable assistance in connecting you with the Partner.',
      '10.3  Nothing in these terms excludes or limits our liability for death or personal injury caused by our negligence, for fraud, or for any liability that cannot be excluded or limited by law, and nothing in these terms affects your statutory consumer rights.',
      '10.4  We are not responsible for losses that are not caused by our breach of these terms, or that were not reasonably foreseeable to both parties when these terms applied to you.',
    ],
  },
  {
    title: 'Fair use and account suspension',
    body: [
      '11.1  You agree not to misuse the platform, including by making fraudulent bookings, abusing refund or withdrawal processes, harassing Partners or their staff, or attempting to interfere with the operation or security of the platform.',
      '11.2  We may suspend or close your account where we reasonably believe these terms have been seriously or repeatedly breached. If we do, any unspent purchased credits will be refunded to your original payment method, less amounts we are legally entitled to withhold.',
    ],
  },
  {
    title: 'Changes and general',
    body: [
      '12.1  We may update these terms from time to time. If we make a material change, we will give you reasonable notice by email or through the platform. Changes do not affect bookings already made.',
      '12.2  We may transfer our rights and obligations under these terms to a successor business, including a Spanish company within the same ownership, on notice to you. This will not reduce your rights.',
      '12.3  These terms are governed by the laws of England and Wales. If you are a consumer, you also benefit from any mandatory protections of the law of the country where you live, and you may bring proceedings in the courts of that country.',
      '12.4  If you have a complaint, contact hello@wello-wellness.com and we will do our best to resolve it. The EU online dispute resolution platform is also available to EU consumers.',
    ],
  },
];

function TermsPage() {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  return (
    <div style={{background:"#FBF9F4",paddingTop:24,paddingBottom:"calc(80px + env(safe-area-inset-bottom))"}}>
      <div style={{maxWidth:800,margin:"0 auto",padding:"clamp(24px,5vw,48px) clamp(20px,4vw,32px)"}}>
        <header style={{marginBottom:"clamp(28px,4vw,44px)"}}>
          <p style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"4px",textTransform:"uppercase",color:"#54584F",margin:"0 0 10px"}}>Legal</p>
          <h1 style={{fontFamily:F2,fontSize:"clamp(28px,4vw,42px)",fontWeight:800,color:"#213C18",letterSpacing:"-1.4px",margin:"0 0 8px",lineHeight:1.1}}>Wello Terms of Use</h1>
          <p style={{fontFamily:F2,fontSize:14,color:"#54584F",margin:0,fontWeight:500}}>Version 1.0, July 2026</p>
        </header>

        {CONSUMER_TERMS_SECTIONS.map((section, i) => (
          <section key={section.title} style={{marginBottom:"clamp(28px,3.5vw,40px)"}}>
            <h2 style={{fontFamily:F2,fontSize:"clamp(18px,2.4vw,22px)",fontWeight:700,color:"#213C18",letterSpacing:"-0.4px",margin:"0 0 14px",lineHeight:1.3}}>
              {i + 1}. {section.title}
            </h2>
            {section.body.map((clause, ci) => (
              <p key={ci} style={{fontFamily:F2,fontSize:15,color:"#1B1C19",lineHeight:1.75,margin:"0 0 12px",fontWeight:400}}>
                {clause}
              </p>
            ))}
          </section>
        ))}

        <p style={{fontFamily:F2,fontSize:12,color:"#54584F",lineHeight:1.6,margin:"32px 0 0",paddingTop:20,borderTop:"1px solid rgba(195,200,188,0.4)"}}>
          Questions about these terms? Email <a href="mailto:hello@wello-wellness.com" style={{color:"#213C18",fontWeight:600,textDecoration:"underline"}}>hello@wello-wellness.com</a>.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE: ABOUT
// ═══════════════════════════════════════════════════════════════
function AboutPage({ onSetView }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  return (
    <div style={{paddingTop:24,paddingBottom:"calc(80px + env(safe-area-inset-bottom))"}}>
      <div style={{maxWidth:1200,margin:"0 auto",padding:"0 clamp(16px,4vw,32px)"}}>

        {/* Hero */}
        <div style={{textAlign:"center",padding:"clamp(48px,8vw,96px) 0 clamp(32px,5vw,64px)"}}>
          <span style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"4px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:12}}>About Wello</span>
          <h1 style={{fontFamily:F2,fontSize:"clamp(32px,5vw,60px)",fontWeight:800,color:"#213C18",letterSpacing:"-2px",margin:"0 0 16px",lineHeight:1.05}}>Our wellness community.</h1>
          <p style={{fontFamily:F2,fontSize:"clamp(14px,1.8vw,17px)",color:"#54584F",margin:"0 auto",maxWidth:560,lineHeight:1.75}}>We're a local platform built for Mallorca's wellness and fitness community - connecting people with the best studios, gyms, pools and outdoor experiences on the island.</p>
        </div>

        {/* Why Wello cards */}
        <section style={{marginBottom:"clamp(48px,7vw,80px)"}}>
          <h2 style={{fontFamily:F2,fontSize:"clamp(20px,3vw,28px)",fontWeight:700,color:"#213C18",letterSpacing:"-0.8px",margin:"0 0 clamp(20px,3vw,32px)"}}>Why Wello</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:16}}>
            {[
              {icon:"📍",title:"Locally verified",body:"Every venue on Wello is handpicked and locally verified. Quality over quantity."},
              {icon:"🤝",title:"Built with venues in mind",body:"We strive to be fair in our practice with venues and welcome two-way feedback on how Wello can best serve the island's wellness community."},
              {icon:"📊",title:"Transparent earnings",body:"Venues see exactly what they earn per booking. No surprises, no hidden calculations."},
              {icon:"🌿",title:"No commitment",body:"Buy credits when you need them. No monthly fees, no subscriptions, no lock-in."},
            ].map(({icon,title,body})=>(
              <div key={title} style={{background:"#fff",borderRadius:16,padding:"clamp(18px,2.5vw,28px)",border:"1px solid rgba(195,200,188,0.3)"}}>
                <div style={{width:40,height:40,background:"rgba(33,60,24,0.07)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,marginBottom:14}}>{icon}</div>
                <h3 style={{fontFamily:F2,fontSize:15,fontWeight:700,color:"#213C18",margin:"0 0 8px",letterSpacing:"-0.3px"}}>{title}</h3>
                <p style={{fontFamily:F2,fontSize:13,color:"#54584F",margin:0,lineHeight:1.7}}>{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section style={{background:"#F5F3EE",borderRadius:20,padding:"clamp(28px,4vw,48px)",marginBottom:"clamp(48px,7vw,80px)"}}>
          <h2 style={{fontFamily:F2,fontSize:"clamp(20px,3vw,28px)",fontWeight:700,color:"#213C18",letterSpacing:"-0.8px",margin:"0 0 6px"}}>How Wello works</h2>
          <p style={{fontFamily:F2,fontSize:14,color:"#54584F",margin:"0 0 clamp(20px,3vw,32px)"}}>Three steps to your next wellness experience.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:16}}>
            {[
              {n:"01",icon:"◈",title:"Buy your pass",desc:"Choose how many credits you want. Load them onto your Wello pass - no subscription, no commitment."},
              {n:"02",icon:"⊞",title:"Browse and book",desc:"Explore studios, gyms, hotel pools, spas and outdoor adventures. Book any slot in seconds."},
              {n:"03",icon:"✓",title:"Walk in ready",desc:"Show your booking confirmation at the venue and enjoy. Credits are deducted automatically."},
            ].map(({n,icon,title,desc})=>(
              <div key={n} style={{background:"#fff",borderRadius:16,padding:"clamp(20px,3vw,32px)",position:"relative",overflow:"hidden",border:"1px solid rgba(195,200,188,0.3)"}}>
                <div style={{position:"absolute",top:16,right:20,fontFamily:F2,fontSize:40,fontWeight:800,color:"rgba(33,60,24,0.05)",lineHeight:1}}>{n}</div>
                <div style={{width:44,height:44,background:"rgba(33,60,24,0.08)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,marginBottom:16,color:"#213C18"}}>{icon}</div>
                <h3 style={{fontFamily:F2,fontSize:17,fontWeight:700,color:"#213C18",margin:"0 0 8px",letterSpacing:"-0.3px"}}>{title}</h3>
                <p style={{fontFamily:F2,fontSize:13,color:"#54584F",margin:0,lineHeight:1.7}}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Gift teaser — the "reward your favourite people" angle. Kept
            above the final Explore CTA so the offer is visible without
            competing with the primary browse action. */}
        <section style={{background:"#213C18",borderRadius:20,padding:"clamp(28px,5vw,52px)",marginBottom:"clamp(40px,6vw,72px)",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,260px),1fr))",gap:28,alignItems:"center"}}>
          <div>
            <p style={{fontFamily:F2,fontSize:10,fontWeight:700,color:"#A3B18A",letterSpacing:"3px",textTransform:"uppercase",margin:"0 0 12px"}}>Gift Wello</p>
            <h2 style={{fontFamily:F2,fontSize:"clamp(22px,3vw,32px)",fontWeight:800,color:"#FBF9F4",letterSpacing:"-0.8px",margin:"0 0 12px",lineHeight:1.1}}>Reward your favourite people with wellness on the island.</h2>
            <p style={{fontFamily:F2,fontSize:14,color:"rgba(251,249,244,0.75)",lineHeight:1.65,margin:0,maxWidth:520}}>Send credits to a friend, a partner, or your team. Redeemable across all Wello partners. No membership, no expiry.</p>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",flexWrap:"wrap",gap:12}}>
            <button onClick={()=>onSetView("gift")}
              style={{padding:"14px clamp(20px,3vw,32px)",borderRadius:999,background:"#FBF9F4",color:"#213C18",border:"none",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 8px 20px rgba(0,0,0,0.18)"}}>
              Send a gift →
            </button>
          </div>
        </section>

        {/* CTA */}
        <div style={{textAlign:"center",paddingBottom:"clamp(32px,5vw,64px)"}}>
          <button onClick={()=>onSetView("explore")}
            style={{padding:"14px clamp(24px,4vw,44px)",borderRadius:999,background:"#213C18",color:"#fff",border:"none",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer"}}>
            Explore all venues
          </button>
        </div>

      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE: EXPLORE
// ═══════════════════════════════════════════════════════════════
// Customer-facing wellness preferences. Each chip maps to a set of category
// names + tag fragments so the For You algorithm can match listings whose
// cat / tags overlap. Keeping the user-facing label friendly while the
// underlying matchers stay flexible means we can re-tune relevance without
// migrating customers' saved interests.
const INTEREST_OPTIONS = [
  { id:"yoga_pilates",  icon:"🧘",  label:"Yoga & Pilates",       cats:["Yoga","Pilates"],                                    tags:["yoga","pilates","reformer","mat"] },
  { id:"surf_paddle",   icon:"🌊",  label:"Surf & paddle",        cats:["Surfing","Paddle Boarding","Kayaking"],              tags:["surf","beach","ocean","sea"] },
  { id:"cycling",       icon:"🚴",  label:"Cycling",              cats:["Cycling"],                                           tags:["cycle","bike","road","trail"] },
  { id:"hiking",        icon:"🥾",  label:"Hiking & trails",      cats:["Hiking","Running"],                                  tags:["hike","trail","mountain","tramuntana"] },
  { id:"gym_strength",  icon:"🏋️",  label:"Gym & strength",       cats:["Hotel Gym","Fitness Class"],                         tags:["gym","strength","hiit","crossfit"] },
  { id:"spa_wellness",  icon:"💆",  label:"Spa & wellness",       cats:["Meditation"],                                        tags:["spa","sauna","massage","wellness"] },
  { id:"pool",          icon:"🏊",  label:"Pool & swim",          cats:["Pool Access"],                                       tags:["pool","swim","infinity","laps"] },
  { id:"racquet",       icon:"🎾",  label:"Racquet sports",       cats:["Padel","Tennis","Pickleball"],                       tags:["padel","tennis","pickleball","court"] },
  { id:"meditation",    icon:"🧘‍♂️", label:"Meditation & breathwork", cats:["Meditation"],                                    tags:["meditation","breathwork","mindfulness"] },
  { id:"private",       icon:"👋",  label:"1-to-1 sessions",       cats:["Private Instructor"],                                tags:["private","1-to-1","personal"] },
  { id:"morning",       icon:"🌅",  label:"Morning energy",        cats:[],                                                    tags:["morning","sunrise","energy"] },
  { id:"evening",       icon:"🌙",  label:"Evening winddown",     cats:[],                                                    tags:["evening","sunset","restorative"] },
];

// Branded preferences picker. Re-used by the soft Explore banner + the
// profile page edit button.
function InterestsModal({ initial = [], onCancel, onSave, busy = false }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  const [picked, setPicked] = useState(initial);
  const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const canSave = picked.length >= 2;
  return (
    <ModalShell onClose={busy ? () => {} : onCancel}>
      <div style={{padding:"clamp(22px,4vw,28px)"}}>
        <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:20,fontWeight:700,color:T.ink,letterSpacing:"-0.4px",margin:"0 0 6px"}}>
          What kind of wellness lights you up?
        </h2>
        <p style={{fontFamily:F2,fontSize:12,color:T.stone,lineHeight:1.65,margin:"0 0 18px",fontWeight:300}}>
          Pick at least two. We use these to personalize your For You rail and surface venues you'll actually love.
        </p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))",gap:8,marginBottom:18}}>
          {INTEREST_OPTIONS.map(opt => {
            const on = picked.includes(opt.id);
            return (
              <button key={opt.id} type="button" onClick={()=>toggle(opt.id)} disabled={busy}
                style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:8,border:`1px solid ${on?T.sage:T.border}`,background:on?"rgba(33,60,24,0.06)":T.paper,color:T.ink,fontFamily:F2,fontSize:12,fontWeight:on?700:500,cursor:busy?"wait":"pointer",textAlign:"left",transition:"all .12s"}}>
                <span style={{fontSize:16,lineHeight:1}}>{opt.icon}</span>
                <span style={{flex:1}}>{opt.label}</span>
                {on && <span style={{color:T.sage,fontWeight:700}}>✓</span>}
              </button>
            );
          })}
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
          <p style={{fontFamily:F2,fontSize:11,color:canSave?T.sage:T.stone,fontWeight:600,margin:0}}>
            {picked.length === 0 ? "Pick a couple to continue" : `${picked.length} selected`}
          </p>
          <div style={{display:"flex",gap:10}}>
            <button onClick={onCancel} disabled={busy}
              style={{padding:"10px 18px",background:"transparent",color:T.stone,border:`1px solid ${T.border}`,borderRadius:2,fontFamily:F2,fontSize:12,fontWeight:300,cursor:busy?"wait":"pointer"}}>
              Maybe later
            </button>
            <button onClick={()=>onSave(picked)} disabled={!canSave || busy}
              style={{padding:"10px 22px",background:canSave&&!busy?T.sage:T.border,color:"#fff",border:"none",borderRadius:2,fontFamily:F2,fontSize:12,fontWeight:600,cursor:canSave&&!busy?"pointer":"not-allowed"}}>
              {busy ? "Saving…" : "Save preferences"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function ExplorePage({ listings, onSelect, savedIds, onToggleSave, syncingIds, profile, authSession, onSaveInterests }) {
  const [search,setSearch]=useState("");
  const [activeCat,setActiveCat]=useState("All");
  const [activeLoc,setActiveLoc]=useState("All Mallorca");
  const [viewMode,setViewMode]=useState("grid");
  const F2 = "'Manrope','Jost',system-ui,sans-serif";

  // Preferences UX state. We auto-open the modal once per session if the
  // customer is signed in but has no interests stored — and stash a
  // localStorage flag so dismissing it doesn't re-prompt forever.
  const [showInterestsModal, setShowInterestsModal] = useState(false);
  const [savingInterests, setSavingInterests] = useState(false);
  const interests = Array.isArray(profile?.interests) ? profile.interests : [];
  const signedIn = !!authSession?.user?.id;
  useEffect(() => {
    if (!signedIn) return;
    if (interests.length > 0) return;
    try {
      if (localStorage.getItem("wello_interests_dismissed") === "1") return;
    } catch { /* ignore */ }
    // Small delay so it doesn't fire the instant they hit the page.
    const t = setTimeout(() => setShowInterestsModal(true), 1200);
    return () => clearTimeout(t);
  }, [signedIn, interests.length]);
  function dismissInterestsPrompt() {
    setShowInterestsModal(false);
    try { localStorage.setItem("wello_interests_dismissed", "1"); } catch { /* ignore */ }
  }
  async function handleSaveInterests(picked) {
    if (!onSaveInterests) return;
    setSavingInterests(true);
    try {
      await onSaveInterests(picked);
      try { localStorage.removeItem("wello_interests_dismissed"); } catch { /* ignore */ }
      setShowInterestsModal(false);
    } finally {
      setSavingInterests(false);
    }
  }


  // Cross-page deep links (home page "Browse private instructors" CTA, etc.)
  // can fire a window-level CustomEvent('wello-set-cat', { detail: <CAT> })
  // and we apply it here as the active filter chip.
  useEffect(() => {
    function handler(e) {
      const cat = e?.detail;
      if (typeof cat === 'string' && cat.length) setActiveCat(cat);
    }
    window.addEventListener('wello-set-cat', handler);
    return () => window.removeEventListener('wello-set-cat', handler);
  }, []);
  
  // Venue coordinates for map
  const COORDS = {
    "Sol Yoga":           [39.7697, 2.7149],
    "Bay Hotel Gym":      [39.5697, 2.6200],
    "Mountain Pilates":   [39.7079, 2.6151],
    "Bay Surf School":    [39.8567, 3.1201],
    "Clifftop Pool Club": [39.5201, 2.6891],
    "Garden Yoga Deià":   [39.7482, 2.6489],
    "Peak Fitness":       [39.8782, 3.0162],
    "Coast Meditation":   [39.3574, 3.1287],
    "Rooftop Pool Club":  [39.5697, 2.6501],
  };
  // Substring filter across name / category / location / tags / coverage
  // areas. Lower-cased once per listing for efficiency.
  const q = search.trim().toLowerCase();
  const filtered = listings.filter(b => {
    // Category filter: match the venue's primary category OR any of its
    // per-session categories (populated on approval by notify-partner-
    // status). This lets a multi-modality studio like Yoga Del Mar show
    // up on both the Yoga filter (primary) and the Sound Bath filter
    // (per-session override) without changing the marketplace card's
    // theme.
    const mC = activeCat === "All"
      || b.cat === activeCat
      || (Array.isArray(b.session_categories) && b.session_categories.includes(activeCat));
    const isPrivate = b.cat === "Private Instructor";
    const mL = activeLoc === "All Mallorca"
      || (isPrivate && Array.isArray(b.coverage_areas) && b.coverage_areas.includes(activeLoc))
      || (!isPrivate && b.loc === activeLoc)
      || (isPrivate && (!b.coverage_areas?.length) && b.loc === activeLoc);
    if (!q) return mC && mL;
    const blob = (`${b.name || ''} ${b.cat || ''} ${b.loc || ''} ${(b.tags || []).join(' ')} ${(b.coverage_areas || []).join(' ')}`).toLowerCase();
    return mC && mL && blob.includes(q);
  });

  return (
    <div style={{paddingTop:16,paddingBottom:"calc(100px + env(safe-area-inset-bottom))"}}>

      {/* Simple live-filter search. Matches against name, category, location,
          tags, and (for private instructors) coverage areas. No API call —
          instant, no credit cost, no CORS. */}
      <div style={{maxWidth:720,margin:"0 auto 14px",padding:"0 clamp(16px,4vw,32px)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",borderRadius:999,padding:"8px 14px",boxShadow:"0 2px 10px rgba(27,28,25,0.05)",border:"1px solid rgba(195,200,188,0.4)"}}>
          <span style={{color:"#A3B18A",fontSize:16,flexShrink:0}}>⌕</span>
          <input value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Search by activity, venue, or area…"
            style={{flex:1,minWidth:0,border:"none",outline:"none",fontFamily:F2,fontSize:14,background:"transparent",color:"#1B1C19",fontWeight:500,padding:"4px 0"}}/>
          {search && (
            <button onClick={()=>setSearch("")} aria-label="Clear search"
              style={{background:"transparent",border:"none",color:"#54584F",fontFamily:F2,fontSize:14,cursor:"pointer",fontWeight:500,padding:"4px 6px",lineHeight:1,flexShrink:0}}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Compact private-classes chip pinned in the filter row carries the
          same message — the previous fat promo banner doubled with it. */}

      {/* Slim single-line personalize prompt — only for signed-in customers
          who haven't picked interests yet. */}
      {signedIn && interests.length === 0 && (
        <div style={{maxWidth:920,margin:"0 auto 12px",padding:"0 clamp(16px,4vw,32px)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"8px 14px",background:"rgba(202,236,186,0.22)",borderRadius:999,flexWrap:"wrap"}}>
            <span style={{fontFamily:F2,fontSize:12,color:"#213C18",fontWeight:500}}>
              <span style={{marginRight:6}}>✦</span>
              Want a personalized For You rail?
            </span>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button onClick={dismissInterestsPrompt}
                style={{padding:"5px 10px",background:"transparent",color:"#54584F",border:"none",fontFamily:F2,fontSize:11,fontWeight:500,cursor:"pointer"}}>
                Dismiss
              </button>
              <button onClick={()=>setShowInterestsModal(true)}
                style={{padding:"5px 14px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                Pick your vibes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky filter bar */}
      <div style={{position:"sticky",top:91,zIndex:40,background:"#FBF9F4",borderBottom:"1px solid rgba(195,200,188,0.4)",padding:"10px clamp(12px,3vw,32px)"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          {/* Category pills — Private Classes pinned to position 2 (after All)
              with a "New" sparkle so it's the first thing the eye lands on. */}
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:8,scrollbarWidth:"none",alignItems:"center"}}>
            {[
              "All",
              "Private Instructor",
              ...CATS.filter(c => c !== "All" && c !== "Private Instructor"),
            ].map(c => {
              const isPrivate = c === "Private Instructor";
              const active = activeCat === c;
              return (
                <button key={c} onClick={()=>setActiveCat(c)}
                  style={{padding:"8px 18px",borderRadius:999,border:isPrivate&&!active?"1px solid #D6B47C":"none",fontFamily:F2,fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s",flexShrink:0,display:"inline-flex",alignItems:"center",gap:6,
                    background:active?"#213C18":(isPrivate?"#FFF7EA":"#EAE8E3"),
                    color:active?"#fff":(isPrivate?"#7A5C32":"#43483F")}}>
                  {isPrivate && <span style={{fontSize:11}}>✦</span>}
                  {catLabel(c)}
                </button>
              );
            })}
          </div>
          {/* Location pills */}
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingTop:8,scrollbarWidth:"none"}}>
            {LOCS.map(l=>(
              <button key={l} onClick={()=>setActiveLoc(l)}
                style={{padding:"5px 14px",borderRadius:999,fontFamily:F2,fontSize:11,fontWeight:500,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s",flexShrink:0,
                  background:activeLoc===l?"#213C18":"transparent",
                  color:activeLoc===l?"#fff":"#54584F",
                  border:activeLoc===l?"1px solid #213C18":"1px solid rgba(195,200,188,0.5)"}}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{maxWidth:1200,margin:"16px auto 0",padding:"0 clamp(16px,4vw,32px)"}}>
        {/* Grid/Map toggle — sits right above the For You rail (or the
            single-category grid when a chip is active). Right-aligned so
            it doesn't compete with the section header on the left. */}
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
          <div style={{display:"flex",background:"#EAE8E3",borderRadius:999,padding:3,gap:2}}>
            {[["grid","⊞ Grid"],["map","📍 Map"]].map(([mode,label])=>(
              <button key={mode} onClick={()=>setViewMode(mode)}
                style={{padding:"4px 11px",borderRadius:999,border:"none",fontFamily:F2,fontSize:11,fontWeight:600,cursor:"pointer",transition:"all .15s",
                  background:viewMode===mode?"#213C18":"transparent",
                  color:viewMode===mode?"#fff":"#54584F"}}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {viewMode==="grid" && activeCat==="All" && (()=>{
          // Carousel source = everything matching the live filters (location
          // chip + text search). The text query reuses the same blob match
          // computed for `filtered` above.
          const matchLocSearch = b => {
            const isPrivate = b.cat === "Private Instructor";
            const mL = activeLoc === "All Mallorca"
              || (isPrivate && Array.isArray(b.coverage_areas) && b.coverage_areas.includes(activeLoc))
              || (!isPrivate && b.loc === activeLoc)
              || (isPrivate && (!b.coverage_areas?.length) && b.loc === activeLoc);
            if (!mL) return false;
            if (!q) return true;
            const blob = (`${b.name || ''} ${b.cat || ''} ${b.loc || ''} ${(b.tags || []).join(' ')} ${(b.coverage_areas || []).join(' ')}`).toLowerCase();
            return blob.includes(q);
          };
          const pool = listings.filter(matchLocSearch);

          // ── For You ── Strict personalisation.
          //   1. If the customer has interests: only consider listings whose
          //      category OR tags overlap an interest. No rating bleed-in.
          //   2. Always include their saved venues + venues sharing a category
          //      with what they've saved.
          //   3. If neither signal yields anything, fall back to top-rated
          //      so first-time guests still see a curated rail.
          const interestCats = new Set();
          const interestTags = new Set();
          for (const id of interests) {
            const opt = INTEREST_OPTIONS.find(o => o.id === id);
            if (!opt) continue;
            opt.cats.forEach(c => interestCats.add(c));
            opt.tags.forEach(t => interestTags.add(t.toLowerCase()));
          }
          const savedListings = pool.filter(b => savedIds.includes(b.id));
          const savedCats = new Set(savedListings.map(b => b.cat));

          function matchesInterest(b) {
            if (interestCats.has(b.cat)) return true;
            const tags = (b.tags || []).map(t => String(t).toLowerCase());
            for (const t of tags) {
              if (interestTags.has(t)) return true;
              for (const it of interestTags) {
                if (t.includes(it) || it.includes(t)) return true;
              }
            }
            return false;
          }

          // Build a candidate set rather than scoring everything.
          const candidateIds = new Set();
          const candidates = [];
          function addCandidate(b) {
            if (candidateIds.has(b.id)) return;
            candidateIds.add(b.id);
            candidates.push(b);
          }
          // Tier A: saved venues themselves (always)
          for (const b of savedListings) addCandidate(b);
          // Tier B: interest-matching venues (only when interests are set)
          if (interests.length > 0) {
            for (const b of pool) {
              if (matchesInterest(b)) addCandidate(b);
            }
          }
          // Tier C: same-category as saved
          if (savedCats.size > 0) {
            for (const b of pool) {
              if (savedCats.has(b.cat)) addCandidate(b);
            }
          }

          // Score within the candidate set for ordering only. Demo seeds
          // take a large penalty so real partners always beat them on the
          // For You rail — demos still appear when no real listing matches
          // the customer's interests, but they never lead the rail.
          function scoreFor(b) {
            let s = 0;
            if (savedIds.includes(b.id)) s += 30;
            if (interestCats.has(b.cat)) s += 15;
            if (savedCats.has(b.cat))    s += 6;
            const tags = (b.tags || []).map(t => String(t).toLowerCase());
            for (const t of tags) {
              if (interestTags.has(t)) { s += 4; break; }
              for (const it of interestTags) { if (t.includes(it) || it.includes(t)) { s += 2; break; } }
            }
            s += (b.rating || 0) * 0.4;
            if (b._isDemo) s -= 100;
            return s;
          }
          let forYouItems = candidates
            .map(b => ({ b, s: scoreFor(b) }))
            .sort((a,b) => b.s - a.s)
            .map(x => x.b)
            .slice(0, 10);

          // No signals at all? Top-rated fallback so first-timers still see
          // something curated. Real partners rank above demos here too.
          if (forYouItems.length === 0) {
            forYouItems = [...pool]
              .sort((a,b) => {
                if (a._isDemo !== b._isDemo) return a._isDemo ? 1 : -1;
                return (b.rating||0) - (a.rating||0);
              })
              .slice(0, 8);
          }

          // ── Dynamic category sections from live data ──
          // Build a section per unique active category in the pool. Order
          // by number of venues (densest categories first). Each section
          // contains all of that category's matching venues.
          const catCounts = {};
          for (const b of pool) {
            if (!b.cat) continue;
            catCounts[b.cat] = (catCounts[b.cat] || 0) + 1;
          }
          // Pre-canned per-category blurbs; fall back to a generic line
          // for categories Wello hasn't curated copy for yet.
          const BLURBS = {
            "Yoga":           "Find your flow",
            "Pilates":        "Reformer and mat",
            "Private Instructor": "1-to-1 with a local pro",
            "Padel":          "Court time on the island",
            "Tennis":         "Court time on the island",
            "Pickleball":     "Court time on the island",
            "Pool Access":    "Resort-style days",
            "Hotel Gym":      "Train your way",
            "Fitness Class":  "Train your way",
            "Surfing":        "Catch a wave",
            "Paddle Boarding":"Glide the bay",
            "Kayaking":       "Sea and coves",
            "Cycling":        "Spin the island",
            "Hiking":         "Tramuntana trails",
            "Running":        "Path and shoreline",
            "Meditation":     "Stillness and breath",
          };
          // Every category rail uses the same scoring pass as For You. That
          // way a saved venue floats to the top of its category rail (not
          // just the personalized rail), and demo seeds always rank below
          // real partners within any category. Falls back to rating + newness
          // gracefully when no personal signals exist.
          function sortWithinCategory(items) {
            return items
              .map(b => ({ b, s: scoreFor(b) }))
              .sort((a, z) => {
                if (z.s !== a.s) return z.s - a.s;
                return (z.b.id || 0) - (a.b.id || 0); // newer wins ties
              })
              .map(x => x.b);
          }
          const dynamicSections = Object.entries(catCounts)
            .sort((a,b) => b[1] - a[1])
            .map(([cat]) => ({
              key: cat,
              name: catLabel(cat),
              cat,
              blurb: BLURBS[cat] || "Discover local picks",
              items: sortWithinCategory(pool.filter(b => b.cat === cat)),
            }));

          // Final ordered rail list — For You first, then dynamic categories.
          const sections = [];
          if (forYouItems.length > 0) {
            let blurb;
            if (interests.length > 0 && savedListings.length > 0) blurb = `Tuned to your interests + what you've saved`;
            else if (interests.length > 0)                         blurb = `Tuned to the activities you picked`;
            else if (savedListings.length > 0)                     blurb = `Similar to what you've already saved`;
            else                                                   blurb = `Hand-picked to get you started`;
            sections.push({
              key: "__for_you",
              name: "For You",
              cat: null,
              blurb,
              items: forYouItems,
            });
          }
          for (const s of dynamicSections) sections.push(s);

          if (sections.length === 0) {
            return (
              <div style={{textAlign:"center",padding:"96px 20px"}}>
                <div style={{fontSize:36,marginBottom:12,color:"#C3C8BC"}}>∅</div>
                <h3 style={{fontFamily:F2,fontSize:20,color:"#213C18",fontWeight:700,marginBottom:8}}>No results</h3>
                <p style={{fontFamily:F2,color:"#54584F",fontSize:14}}>Try adjusting your filters</p>
              </div>
            );
          }
          return (
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {sections.map(({key, name, cat, blurb, items}) => (
                <section key={key}>
                  <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:6,gap:12}}>
                    <div>
                      <h2 style={{fontFamily:F2,fontSize:"clamp(15px,1.8vw,18px)",fontWeight:800,color:"#213C18",letterSpacing:"-0.5px",margin:"0 0 1px",lineHeight:1.1}}>
                        {key === "__for_you" ? "✦ " : ""}{name}
                      </h2>
                      <p style={{fontFamily:F2,fontSize:11,color:"#54584F",fontWeight:400,margin:0}}>{blurb} · {items.length} {items.length===1?"venue":"venues"}</p>
                    </div>
                    {cat && (
                      <button onClick={()=>setActiveCat(cat)}
                        style={{background:"transparent",border:"none",color:"#213C18",fontFamily:F2,fontSize:11,fontWeight:600,cursor:"pointer",padding:0,whiteSpace:"nowrap"}}>
                        View all →
                      </button>
                    )}
                  </div>
                  <div style={{display:"flex",gap:8,overflowX:"auto",scrollbarWidth:"none",paddingBottom:4}}>
                    {items.map(b=>(
                      <div key={b.id} style={{width:"clamp(140px,20vw,170px)",flexShrink:0}}>
                        <Card biz={b} onSelect={onSelect} syncing={!!syncingIds[b.id]} saved={savedIds.includes(b.id)} onToggleSave={onToggleSave} compact/>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          );
        })()}

        {viewMode==="grid" && activeCat!=="All" && (filtered.length===0
          ? (activeCat === "Private Instructor"
              ? <div style={{textAlign:"center",padding:"80px 20px",maxWidth:520,margin:"0 auto"}}>
                  <div style={{fontSize:36,marginBottom:12}}>🌱</div>
                  <h3 style={{fontFamily:F2,fontSize:20,color:"#213C18",fontWeight:700,marginBottom:8}}>No private instructors live yet</h3>
                  <p style={{fontFamily:F2,color:"#54584F",fontSize:14,lineHeight:1.6,marginBottom:18}}>We're rolling out private 1-to-1 sessions with local instructors who come to you. Be one of the first when they go live — or, if you're an instructor, apply to join.</p>
                  <button onClick={()=>{ window.location.href = "/?portal=business"; }}
                    style={{padding:"12px 24px",borderRadius:999,border:"none",background:"#213C18",color:"#fff",fontFamily:F2,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    Apply as an instructor →
                  </button>
                </div>
              : <div style={{textAlign:"center",padding:"96px 20px"}}>
                  <div style={{fontSize:36,marginBottom:12,color:"#C3C8BC"}}>∅</div>
                  <h3 style={{fontFamily:F2,fontSize:20,color:"#213C18",fontWeight:700,marginBottom:8}}>No results</h3>
                  <p style={{fontFamily:F2,color:"#54584F",fontSize:14}}>Try adjusting your filters</p>
                </div>)
          : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,200px),1fr))",columnGap:"clamp(12px,2vw,24px)",rowGap:12}}>
              {filtered.map(b=><Card key={b.id} biz={b} onSelect={onSelect} syncing={!!syncingIds[b.id]} saved={savedIds.includes(b.id)} onToggleSave={onToggleSave}/>)}
            </div>
        )}
        {activeCat!=="All"&&filtered.length>8&&viewMode==="grid"&&(
          <div style={{textAlign:"center",marginTop:60}}>
            <button style={{padding:"14px 36px",borderRadius:999,border:"2px solid #213C18",background:"transparent",color:"#213C18",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer",transition:"all .2s"}}
              onMouseEnter={e=>{e.target.style.background="#213C18";e.target.style.color="#fff"}}
              onMouseLeave={e=>{e.target.style.background="transparent";e.target.style.color="#213C18"}}>
              Load more experiences
            </button>
          </div>
        )}

        {/* MAP VIEW */}
        {viewMode==="map"&&(
          <div style={{borderRadius:16,overflow:"hidden",height:520,position:"relative",marginTop:8}}>
            <iframe
              title="Wello venues map"
              width="100%" height="100%" frameBorder="0" scrolling="no"
              style={{borderRadius:16}}
              src={`https://www.openstreetmap.org/export/embed.html?bbox=2.3%2C39.2%2C3.4%2C40.1&layer=mapnik&marker=39.6945%2C2.9217`}
            />
            {/* Venue pins overlay */}
            <div style={{position:"absolute",top:12,left:12,background:"rgba(255,255,255,0.95)",backdropFilter:"blur(8px)",borderRadius:12,padding:"12px 16px",maxHeight:480,overflowY:"auto",width:220,boxShadow:"0 4px 20px rgba(0,0,0,0.1)"}}>
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1px",textTransform:"uppercase",margin:"0 0 10px"}}>{filtered.length} venues</p>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {filtered.map(b=>(
                  <div key={b.id} onClick={()=>onSelect(b)}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:"#F5F3EE",cursor:"pointer",transition:"background .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#EAE8E3"}
                    onMouseLeave={e=>e.currentTarget.style.background="#F5F3EE"}>
                    <div style={{width:32,height:32,borderRadius:6,overflow:"hidden",flexShrink:0}}>
                      <img src={b.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{fontFamily:F2,fontSize:11,fontWeight:600,color:"#1B1C19",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</p>
                      <p style={{fontFamily:F2,fontSize:10,color:"#54584F",margin:0}}>📍 {b.loc} · ◈ {b.cr}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preferences picker — opens from the soft sage banner above OR the
          auto-open useEffect for first-time signed-in customers. */}
      {showInterestsModal && (
        <InterestsModal
          initial={interests}
          busy={savingInterests}
          onCancel={dismissInterestsPrompt}
          onSave={handleSaveInterests}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE: PROFILE
// ═══════════════════════════════════════════════════════════════
function ProfilePage({ bookings, savedIds, listings, credits, onSelect, onSetView, isBiz, onToggleBiz, onPreviewDashboard, profile, authSession, onSignOut, onOpenSignIn, bookingsVersion = 0, onSaveInterests, onProfilePatch, onCancelBooking }) {
  const [tab,setTab]=useState("reservations");
  const [resTab,setResTab] = useState("upcoming"); // "upcoming" | "past"
  const saved=listings.filter(b=>savedIds.includes(b.id));
  const [friends]=useState(FRIENDS);
  const TABS=[["reservations","Reservations"],["saved","Saved"],["friends","Friends"],["settings","Settings"]];
  const F2="'Manrope','Jost',system-ui,sans-serif";
  // Interests editor (Settings tab → Your preferences card)
  const [editingInterests, setEditingInterests] = useState(false);
  const [savingInterests, setSavingInterests] = useState(false);

  // Account Details form — hydrated from the profile prop and the auth user.
  // Email is read-only here because changing it goes through Supabase auth.
  const [acctForm, setAcctForm] = useState({ full_name: "", phone: "" });
  const [acctSaving, setAcctSaving] = useState(false);
  const [acctMsg, setAcctMsg] = useState(""); // "" | "saved" | "error"
  useEffect(() => {
    setAcctForm({
      full_name: profile?.full_name || authSession?.user?.user_metadata?.full_name || "",
      phone:     profile?.phone     || "",
    });
  }, [profile?.full_name, profile?.phone, authSession?.user?.user_metadata?.full_name]);
  async function saveAccount() {
    if (!authSession?.user?.id) return;
    setAcctSaving(true); setAcctMsg("");
    const patch = {
      full_name: acctForm.full_name.trim() || null,
      phone:     acctForm.phone.trim()     || null,
    };
    const { error } = await supabase.from('profiles').update(patch).eq('id', authSession.user.id);
    setAcctSaving(false);
    if (error) {
      setAcctMsg("error");
    } else {
      // Propagate to the parent so every other surface that reads from
      // `profile` (greeting, avatar initial, booking flow defaults) updates
      // immediately, not just on next page-reload.
      onProfilePatch?.(patch);
      setAcctMsg("saved");
    }
    setTimeout(() => setAcctMsg(""), 2600);
  }

  // Delete-my-account flow. Auth verifies inside the edge function; on
  // success we sign out locally so the app state clears cleanly.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount,   setDeletingAccount]   = useState(false);
  const [deleteErr,         setDeleteErr]         = useState("");
  async function confirmDeleteAccount() {
    if (!authSession) return;
    setDeletingAccount(true); setDeleteErr("");
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
      if (error || !data?.success) {
        setDeleteErr(data?.error || error?.message || "We couldn't delete your account. Please try again.");
        setDeletingAccount(false);
        return;
      }
      // Auth is already gone server-side, but call signOut so the local
      // session clears and the app rehydrates to a signed-out state.
      await supabase.auth.signOut();
      onSignOut?.();
      onSetView?.("home");
    } catch (e) {
      setDeleteErr(e.message || "Something went wrong.");
      setDeletingAccount(false);
    }
  }

  // Source-of-truth bookings: Supabase rows for signed-in members; in-memory
  // prop for the anonymous demo state (used only when this page is reached
  // without auth, which we now redirect away from below).
  const [remoteBookings, setRemoteBookings] = useState(null);
  useEffect(() => {
    if (!authSession?.user?.id) { setRemoteBookings(null); return; }
    let cancelled = false;
    supabase.from('bookings')
      .select('id, business_id, slot_id, booking_date, start_time, duration, credits_used, status, offering_type, acuity_appointment_id, created_at')
      .eq('user_id', authSession.user.id)
      .order('booking_date', { ascending: false })
      .then(({ data }) => { if (!cancelled) setRemoteBookings(data || []); });
    return () => { cancelled = true; };
  }, [authSession?.user?.id, bookingsVersion]);

  // Anonymous landing on /profile: show a clean sign-in prompt instead of
  // fake member content. Partner sign-in stays inside the Business tab.
  if (!authSession) return (
    <div style={{paddingTop:24,paddingBottom:"calc(100px + env(safe-area-inset-bottom))"}}>
      <div style={{maxWidth:520,margin:"0 auto",padding:"60px clamp(16px,4vw,32px)",textAlign:"center"}}>
        <div style={{width:64,height:64,background:"#CAECBA",border:"1px solid #A3B18A",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontFamily:F2,fontSize:26,fontWeight:800,color:"#213C18"}}>◈</div>
        <h1 style={{fontFamily:F2,fontSize:24,fontWeight:800,color:"#213C18",letterSpacing:"-0.8px",margin:"0 0 8px"}}>Sign in to your Wello</h1>
        <p style={{fontFamily:F2,fontSize:13,color:"#54584F",lineHeight:1.6,margin:"0 0 22px"}}>Your bookings, credit balance and saved venues all live here.</p>
        <button onClick={onOpenSignIn}
          style={{padding:"12px 28px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:"pointer"}}>
          Sign in or create your account →
        </button>
      </div>
    </div>
  );

  const displayName = profile?.full_name || authSession.user?.email?.split('@')[0] || "Member";
  const initial = displayName.trim().charAt(0).toUpperCase();
  const shownBookings = remoteBookings ?? bookings;

  return (
    <div style={{paddingTop:24,paddingBottom:"calc(100px + env(safe-area-inset-bottom))"}}>
      <div style={{maxWidth:1200,margin:"0 auto",padding:"0 clamp(16px,4vw,32px)"}}>

        {/* Hero profile header — mobile-first layout */}
        <header style={{marginBottom:32,paddingTop:12}}>
          {/* Top row: avatar + name + button */}
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
            <div style={{position:"relative",flexShrink:0}}>
              <div style={{width:64,height:64,borderRadius:12,overflow:"hidden",background:"#213C18",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontFamily:F2,fontSize:28,fontWeight:800,color:"#fff"}}>{initial}</span>
              </div>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                <h1 style={{fontFamily:F2,fontSize:"clamp(20px,4vw,44px)",fontWeight:800,color:"#213C18",letterSpacing:"-1px",margin:0,overflow:"hidden",textOverflow:"ellipsis"}}>{displayName}</h1>
                <span style={{background:"#FADEC0",color:"#766149",padding:"3px 10px",borderRadius:999,fontSize:10,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",flexShrink:0}}>Member</span>
              </div>
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0,lineHeight:1.4}}>{authSession.user?.email}</p>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0,flexWrap:"wrap"}}>
              <button onClick={()=>onSetView("credits")}
                style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"10px 16px",fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 14px rgba(33,60,24,0.25)",whiteSpace:"nowrap"}}>
                + Credits
              </button>
              <button onClick={onSignOut}
                style={{background:"transparent",color:"#54584F",border:"1px solid rgba(195,200,188,0.5)",borderRadius:999,padding:"10px 14px",fontFamily:F2,fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
                Sign out
              </button>
            </div>
          </div>
          {/* Stats row */}
          <div style={{display:"flex",gap:16,flexWrap:"wrap",background:"#F5F3EE",borderRadius:12,padding:"12px 16px"}}>
            {[["📍","Mallorca"],["◈",`${credits} credits`],["📅",`${shownBookings.length} bookings`]].map(([icon,val])=>(
              <div key={val} style={{display:"flex",alignItems:"center",gap:6,fontFamily:F2,fontSize:13,fontWeight:600,color:"#213C18"}}>
                <span>{icon}</span><span>{val}</span>
              </div>
            ))}
          </div>
        </header>

        {/* Tabs */}
        <div style={{display:"flex",borderBottom:"1px solid rgba(195,200,188,0.3)",marginBottom:24,gap:0,overflowX:"auto",scrollbarWidth:"none"}}>
          {TABS.map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)}
              style={{fontFamily:F2,fontSize:14,fontWeight:tab===k?700:500,color:tab===k?"#213C18":"#54584F",background:"transparent",border:"none",borderBottom:tab===k?"2px solid #213C18":"2px solid transparent",padding:"0 4px 16px",cursor:"pointer",marginRight:32,marginBottom:-1,whiteSpace:"nowrap",transition:"all .15s"}}>
              {l}
            </button>
          ))}
        </div>

        {/* Reservations */}
        {tab==="reservations"&&(() => {
          // Normalise either the local in-memory bookings shape ({biz, slot, cost, ...})
          // OR the remote Supabase shape ({business_id, booking_date, credits_used, ...})
          // into one common form so the render loop stays simple.
          const listById = new Map(listings.map(l => [String(l.business_id ?? l.id), l]));
          function normalize(bk) {
            if (bk?.biz && bk?.slot) {
              // Already in local shape — just carry through.
              return {
                key: `local-${bk.id}`,
                dbId: bk.dbId || null,
                biz:  bk.biz,
                sessionName: bk.slot.name,
                date: bk.slot.date,
                time: bk.slot.time,
                cost: bk.cost,
                status: bk.status,
              };
            }
            // Remote shape — look up the listing so we can render the venue name/photo.
            const l = listById.get(String(bk.business_id)) || {};
            return {
              key: `remote-${bk.id}`,
              dbId: bk.id,
              biz:  l,
              // For studio/spa offering requests we surface the offering
              // name (e.g. "Deep tissue massage") rather than the venue
              // name so the customer immediately recognises what they
              // asked for.
              sessionName: bk.offering_type || l.name || "Session",
              date: bk.booking_date,
              time: bk.start_time,
              cost: bk.credits_used ?? 0,
              status: bk.status,
            };
          }
          // Sort every booking by session time, then split into upcoming
          // (today onwards) vs past (everything before today, including
          // completed sessions and any old cancellations). Cutoff is
          // today's midnight so same-day sessions stay in Upcoming until
          // the clock rolls past midnight.
          const cutoff = new Date();
          cutoff.setHours(0, 0, 0, 0);
          const normalised = shownBookings.map(normalize);
          const upcomingItems = normalised
            .filter(b => b.status !== 'cancelled' && b.status !== 'declined')
            .filter(b => {
              const dt = sessionDateTime(b.date, b.time);
              return dt ? dt >= cutoff : true;
            })
            .sort((a, z) => (sessionDateTime(a.date, a.time)?.getTime() || 0) - (sessionDateTime(z.date, z.time)?.getTime() || 0));
          const pastItems = normalised
            .filter(b => {
              const dt = sessionDateTime(b.date, b.time);
              const isPast = dt ? dt < cutoff : false;
              const isCancelled = b.status === 'cancelled' || b.status === 'declined';
              return isPast || isCancelled;
            })
            .sort((a, z) => (sessionDateTime(z.date, z.time)?.getTime() || 0) - (sessionDateTime(a.date, a.time)?.getTime() || 0));
          const items = resTab === "upcoming" ? upcomingItems : pastItems;
          const subTabs = [["upcoming", "Upcoming", upcomingItems.length], ["past", "Past", pastItems.length]];
          const subTabNav = (
            <div style={{display:"inline-flex",gap:4,padding:4,background:"rgba(33,60,24,0.06)",border:"1px solid rgba(33,60,24,0.08)",borderRadius:14,marginBottom:20}}>
              {subTabs.map(([id,label,count])=>{
                const active = resTab===id;
                return (
                  <button key={id} onClick={()=>setResTab(id)} style={{padding:"8px 16px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:F2,fontSize:13,fontWeight:600,background:active?"#213C18":"transparent",color:active?"#FBF9F4":"#213C18",transition:"background 120ms ease",display:"inline-flex",alignItems:"center",gap:6}}>
                    {label}<span style={{fontSize:11,opacity:0.7}}>({count})</span>
                  </button>
                );
              })}
            </div>
          );
          if (items.length === 0) {
            return (
              <div>
                {subTabNav}
                <div style={{background:"#F5F3EE",borderRadius:16,padding:"80px 20px",textAlign:"center"}}>
                  <div style={{fontSize:40,marginBottom:16}}>📅</div>
                  <h3 style={{fontFamily:F2,fontSize:20,fontWeight:700,color:"#213C18",marginBottom:12}}>{resTab==="upcoming" ? "No upcoming reservations" : "No past reservations yet"}</h3>
                  {resTab === "upcoming" && (
                    <button onClick={()=>onSetView("explore")}
                      style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"12px 28px",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer"}}>
                      Explore Classes
                    </button>
                  )}
                </div>
              </div>
            );
          }
          return (
            <div>
              {subTabNav}
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {items.map(bk=>{
                  const cancelState = cancelStatusFor({ booking_date: bk.date, start_time: bk.time }, bk.biz?.cat);
                  // Pending requests (instructor or venue) can be cancelled
                  // by the customer at any time for a full credit return —
                  // no window enforcement here, credits were never
                  // deducted so nothing to refund on cancel.
                  const isPendingReq = bk.status === 'pending_instructor' || bk.status === 'pending_venue';
                  const canCancel = resTab === "upcoming" && bk.dbId && bk.status !== 'cancelled' && (isPendingReq || cancelState.canCancel);
                  // Status label + colour differs for past bookings and
                  // pending requests.
                  const isCancelled = bk.status === 'cancelled' || bk.status === 'declined';
                  const isPastDate  = (sessionDateTime(bk.date, bk.time)?.getTime() || 0) < Date.now();
                  const statusLabel = isCancelled
                    ? "Cancelled"
                    : isPendingReq
                      ? "Awaiting venue confirmation"
                      : (resTab === "past" ? "Completed" : "Confirmed");
                  const statusBg    = isCancelled ? "#FADEC0" : isPendingReq ? "#FADEC0" : (resTab === "past" ? "#E4E2DD" : "#CAECBA");
                  const statusFg    = isCancelled ? "#6F5B44" : isPendingReq ? "#6F5B44" : "#213C18";
                  return (
                    <div key={bk.key} style={{display:"flex",flexWrap:"wrap",background:"#F5F3EE",borderRadius:12,overflow:"hidden",transition:"background .2s",opacity:isPastDate?0.88:1}}>
                      <div style={{width:"clamp(80px,30vw,160px)",minHeight:100,flexShrink:0,overflow:"hidden"}}>
                        <img src={bk.biz?.img || "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&q=80"} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      </div>
                      <div style={{flex:1,padding:"20px 24px",display:"flex",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",gap:16}}>
                        <div>
                          <span style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#6F5B44",letterSpacing:"2px",textTransform:"uppercase",display:"block",marginBottom:6}}>{bk.biz?.cat}</span>
                          <h3 style={{fontFamily:F2,fontSize:18,fontWeight:700,color:"#213C18",margin:"0 0 6px"}}>{bk.sessionName}</h3>
                          <p style={{fontFamily:F2,fontSize:13,color:"#54584F",margin:"0 0 4px"}}>📅 {fd(bk.date)} · {bk.time}</p>
                          <p style={{fontFamily:F2,fontSize:13,color:"#54584F",margin:0}}>📍 {bk.biz?.name}{bk.biz?.loc ? `, ${bk.biz.loc}` : ""}</p>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:10}}>
                          <span style={{display:"flex",alignItems:"center",gap:6,background:statusBg,color:statusFg,padding:"6px 14px",borderRadius:999,fontSize:11,fontWeight:700}}>
                            <span style={{width:6,height:6,borderRadius:"50%",background:statusFg,display:"inline-block"}}/>{statusLabel}
                          </span>
                          <span style={{fontFamily:F2,fontSize:14,fontWeight:700,color:"#213C18"}}>◈ {bk.cost} credits</span>
                          {resTab === "upcoming" && bk.dbId && (
                            canCancel ? (
                              <button onClick={async () => {
                                // Both pending flavours hold credits at request time now,
                                // so cancel is always a real refund.
                                const promptText = isPendingReq
                                  ? `Cancel this request? Your ${bk.cost} held credits are returned to your balance.`
                                  : `Cancel this booking? Your ${bk.cost} credits will be refunded.`;
                                if (!confirm(promptText)) return;
                                await onCancelBooking?.(bk.dbId);
                              }}
                                style={{background:"transparent",border:"1px solid rgba(196,106,77,0.6)",color:"#C46A4D",padding:"6px 14px",borderRadius:999,fontFamily:F2,fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:"0.3px"}}>
                                {isPendingReq ? "Cancel request" : "Cancel booking"}
                              </button>
                            ) : (
                              <span style={{fontFamily:F2,fontSize:10,color:"#A3B18A",fontStyle:"italic"}}>Cancellation window closed</span>
                            )
                          )}
                          {isPendingReq && (
                            <span style={{fontFamily:F2,fontSize:10,color:"#54584F",fontStyle:"italic",textAlign:"right",maxWidth:220,lineHeight:1.4}}>
                              The venue will confirm within 48 hours. If they cannot host you, your credits are returned in full.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Saved */}
        {tab==="saved"&&(
          saved.length===0
            ? <div style={{background:"#F5F3EE",borderRadius:16,padding:"80px 20px",textAlign:"center"}}>
                <div style={{fontSize:40,marginBottom:16}}>♡</div>
                <h3 style={{fontFamily:F2,fontSize:20,fontWeight:700,color:"#213C18",marginBottom:8}}>Nothing saved yet</h3>
                <p style={{fontFamily:F2,color:"#54584F",marginBottom:20,fontSize:14}}>Tap ♡ on any listing to save it</p>
                <button onClick={()=>onSetView("explore")} style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"12px 28px",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer"}}>Explore</button>
              </div>
            : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(45%,200px),1fr))",gap:16}}>
                {saved.map(b=>(
                  <div key={b.id} style={{cursor:"pointer"}} onClick={()=>onSelect(b)}>
                    <div style={{borderRadius:12,overflow:"hidden",marginBottom:12,aspectRatio:"4/5",background:"#E4E2DD"}}>
                      <img src={b.img} alt={b.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    </div>
                    <h3 style={{fontFamily:F2,fontSize:14,fontWeight:700,color:"#213C18",margin:"0 0 4px"}}>{b.name}</h3>
                    <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0}}>📍 {b.loc}</p>
                  </div>
                ))}
              </div>
        )}

        {/* Friends */}
        {tab==="friends"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <span style={{fontFamily:F2,fontSize:14,color:"#54584F"}}>{friends.length} friends</span>
              <button style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"8px 18px",fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Invite</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {friends.map(f=>(
                <div key={f.id} style={{display:"flex",alignItems:"center",gap:14,padding:"16px 20px",background:"#F5F3EE",borderRadius:12,transition:"background .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#EAE8E3"}
                  onMouseLeave={e=>e.currentTarget.style.background="#F5F3EE"}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:"#E4E2DD",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F2,fontSize:12,fontWeight:700,color:"#54584F",flexShrink:0}}>{f.init}</div>
                  <div style={{flex:1}}>
                    <p style={{fontFamily:F2,fontSize:14,fontWeight:600,color:"#1B1C19",margin:"0 0 2px"}}>{f.name}</p>
                    <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0}}>📍 {f.loc} · {f.bio}</p>
                  </div>
                  <button style={{border:"1px solid rgba(195,200,188,0.5)",borderRadius:999,padding:"6px 16px",background:"transparent",color:"#213C18",fontFamily:F2,fontSize:11,fontWeight:700,cursor:"pointer"}}>View</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings — two-column grid on desktop so cards aren't squeezed into a thin left rail. */}
        {tab==="settings"&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,320px),1fr))",gap:16,alignItems:"start"}}>
            {[{title:"Account Details",content:(
              <div style={{padding:"20px"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,200px),1fr))",gap:14,marginBottom:16}}>
                  <div>
                    <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:6}}>Full name</label>
                    <input value={acctForm.full_name} onChange={e=>setAcctForm(f=>({...f,full_name:e.target.value}))} placeholder="Your name"
                      style={{width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"12px 16px",fontFamily:F2,fontSize:14,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",transition:"border-color .15s"}}
                      onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                  </div>
                  <div>
                    <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:6}}>Phone</label>
                    <input value={acctForm.phone} onChange={e=>setAcctForm(f=>({...f,phone:e.target.value}))} placeholder="+34 ..." type="tel"
                      style={{width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"12px 16px",fontFamily:F2,fontSize:14,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",transition:"border-color .15s"}}
                      onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                  </div>
                </div>
                <div style={{marginBottom:16}}>
                  <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:6}}>Email</label>
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <input value={authSession?.user?.email || ""} readOnly
                      style={{flex:"1 1 220px",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"12px 16px",fontFamily:F2,fontSize:14,color:"#54584F",outline:"none",boxSizing:"border-box",background:"#F5F3EE",cursor:"not-allowed"}}/>
                    <span style={{fontFamily:F2,fontSize:11,color:"#54584F"}}>Contact us to change your sign-in email.</span>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
                  <button onClick={saveAccount} disabled={acctSaving}
                    style={{background:acctSaving?"#E4E2DD":"#213C18",color:acctSaving?"#54584F":"#fff",border:"none",borderRadius:999,padding:"10px 24px",fontFamily:F2,fontSize:13,fontWeight:700,cursor:acctSaving?"not-allowed":"pointer"}}>
                    {acctSaving ? "Saving" : "Save changes"}
                  </button>
                  {acctMsg === "saved" && (
                    <span style={{display:"inline-flex",alignItems:"center",gap:6,fontFamily:F2,fontSize:12,color:"#213C18",fontWeight:600}}>
                      <Check size={14} stroke="#213C18" strokeWidth={2.6}/> Saved.
                    </span>
                  )}
                  {acctMsg === "error" && (
                    <span style={{fontFamily:F2,fontSize:12,color:"#C46A4D",fontWeight:600}}>Couldn't save. Please try again.</span>
                  )}
                </div>
              </div>
            )},{title:"Account Type",content:(
              <div style={{padding:"20px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div>
                    <p style={{fontFamily:F2,fontSize:14,fontWeight:600,color:"#1B1C19",margin:"0 0 4px"}}>Business Account</p>
                    <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0}}>Enable to list your venue, manage bookings and access your business dashboard.</p>
                  </div>
                  <div onClick={onToggleBiz} style={{width:44,height:24,borderRadius:999,background:isBiz?"#213C18":"#E4E2DD",cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
                    <div style={{position:"absolute",top:2,left:isBiz?22:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
                  </div>
                </div>
                {isBiz&&<button onClick={()=>onSetView("biz-portal")} style={{background:"#FADEC0",color:"#766149",border:"none",borderRadius:999,padding:"8px 18px",fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer",marginRight:8}}>Manage Business →</button>}
                {isBiz&&<button onClick={onPreviewDashboard} style={{background:"transparent",color:"#54584F",border:"1px solid rgba(195,200,188,0.6)",borderRadius:999,padding:"8px 18px",fontFamily:F2,fontSize:12,fontWeight:600,cursor:"pointer"}}>Preview dashboard →</button>}
              </div>
            )},{title:"Your preferences",content:(
              <div style={{padding:"20px"}}>
                {(() => {
                  const interests = Array.isArray(profile?.interests) ? profile.interests : [];
                  if (interests.length === 0) {
                    return (
                      <>
                        <p style={{fontFamily:F2,fontSize:13,color:"#54584F",margin:"0 0 12px",lineHeight:1.6}}>
                          Tell us what kind of wellness you love and we'll personalize your For You rail on Explore.
                        </p>
                        <button onClick={()=>setEditingInterests(true)}
                          style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"10px 22px",fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                          ✦ Pick your vibes
                        </button>
                      </>
                    );
                  }
                  return (
                    <>
                      <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 10px"}}>You picked</p>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                        {interests.map(id => {
                          const opt = INTEREST_OPTIONS.find(o => o.id === id);
                          if (!opt) return null;
                          return (
                            <span key={id} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 11px",borderRadius:999,background:"rgba(33,60,24,0.08)",border:"1px solid rgba(33,60,24,0.18)",fontFamily:F2,fontSize:12,color:"#213C18",fontWeight:600}}>
                              <span style={{fontSize:13,lineHeight:1}}>{opt.icon}</span>
                              {opt.label}
                            </span>
                          );
                        })}
                      </div>
                      <button onClick={()=>setEditingInterests(true)}
                        style={{background:"transparent",color:"#213C18",border:"1px solid #213C18",borderRadius:999,padding:"8px 18px",fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                        Edit preferences
                      </button>
                    </>
                  );
                })()}
              </div>
            )},{title:"Notifications",content:(
              <div style={{padding:"20px",display:"flex",flexDirection:"column",gap:14}}>
                {["Booking confirmations","Availability reminders","Weekly recommendations","New venues nearby"].map(l=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontFamily:F2,fontSize:14,color:"#1B1C19"}}>{l}</span>
                    <div style={{width:44,height:24,borderRadius:999,background:"#213C18",cursor:"pointer",position:"relative",flexShrink:0}}>
                      <div style={{position:"absolute",top:2,right:2,width:20,height:20,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
                    </div>
                  </div>
                ))}
              </div>
            )},{title:"Danger zone",content:(
              <div style={{padding:"20px"}}>
                <p style={{fontFamily:F2,fontSize:13,color:"#1B1C19",fontWeight:600,margin:"0 0 6px"}}>Delete your Wello account</p>
                <p style={{fontFamily:F2,fontSize:12,color:"#54584F",lineHeight:1.65,margin:"0 0 14px"}}>Removes your profile, credit balance, saved preferences and sign-in. Past bookings stay on partner dashboards but with your name removed. This can't be undone.</p>
                {deleteErr && <p style={{fontFamily:F2,fontSize:12,color:"#C46A4D",margin:"0 0 12px"}}>{deleteErr}</p>}
                <button onClick={()=>{ setDeleteErr(""); setShowDeleteConfirm(true); }} disabled={deletingAccount || !authSession}
                  style={{background:"transparent",color:"#C46A4D",border:"1px solid #C46A4D",borderRadius:999,padding:"10px 20px",fontFamily:F2,fontSize:12,fontWeight:700,cursor:deletingAccount?"not-allowed":"pointer",letterSpacing:"0.2px"}}>
                  Delete my account
                </button>
              </div>
            )}].map(s=>(
              <div key={s.title} style={{background:"#fff",borderRadius:12,overflow:"hidden",boxShadow:"0 1px 12px rgba(27,28,25,0.04)",border:"1px solid rgba(195,200,188,0.2)"}}>
                <div style={{padding:"14px 20px",borderBottom:"1px solid rgba(195,200,188,0.2)"}}><span style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#54584F"}}>{s.title}</span></div>
                {s.content}
              </div>
            ))}
          </div>
        )}

        {/* Insights */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,280px),1fr))",gap:16,marginTop:40}}>
          <div style={{background:"#213C18",color:"#fff",padding:"clamp(24px,4vw,40px)",borderRadius:16,display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:"clamp(200px,40vw,240px)"}}>
            <div>
              <div style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"3px",textTransform:"uppercase",color:"rgba(255,255,255,0.4)",marginBottom:12}}>Your progress</div>
              <h4 style={{fontFamily:F2,fontSize:"clamp(20px,3vw,24px)",fontWeight:700,lineHeight:1.2,margin:"0 0 6px"}}>Wellness Journey</h4>
              <p style={{fontFamily:F2,fontSize:13,opacity:0.6,margin:0}}>Keep exploring to build your habit.</p>
            </div>
            <div style={{paddingTop:20,display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
              <div>
                <div style={{fontFamily:F2,fontSize:"clamp(40px,10vw,52px)",fontWeight:900,lineHeight:1}}>{bookings.length}</div>
                <div style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"3px",textTransform:"uppercase",opacity:0.5,marginTop:4}}>Sessions booked</div>
              </div>
              <div style={{fontFamily:F2,fontSize:40,opacity:0.15}}>✦</div>
            </div>
          </div>
          <div style={{background:"#E4E2DD",padding:"clamp(24px,4vw,40px)",borderRadius:16,position:"relative",overflow:"hidden"}}>
            <div style={{position:"relative",zIndex:1}}>
              <div style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"3px",textTransform:"uppercase",color:"#54584F",marginBottom:12}}>Discover more</div>
              <h4 style={{fontFamily:F2,fontSize:"clamp(18px,3vw,22px)",fontWeight:700,color:"#213C18",margin:"0 0 10px"}}>Recommended for you</h4>
              <p style={{fontFamily:F2,fontSize:13,color:"#54584F",maxWidth:320,margin:"0 0 20px",lineHeight:1.6}}>Discover new experiences based on what you've enjoyed.</p>
              <button onClick={()=>onSetView("explore")}
                style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"12px 24px",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
                Explore →
              </button>
            </div>
            <div style={{position:"absolute",right:-40,bottom:-40,width:200,height:200,borderRadius:"50%",background:"rgba(33,60,24,0.06)"}}/>
          </div>
        </div>
      </div>
      {/* Preferences editor — opens from Settings tab → Your preferences */}
      {editingInterests && (
        <InterestsModal
          initial={Array.isArray(profile?.interests) ? profile.interests : []}
          busy={savingInterests}
          onCancel={()=>setEditingInterests(false)}
          onSave={async (picked) => {
            if (!onSaveInterests) { setEditingInterests(false); return; }
            setSavingInterests(true);
            try { await onSaveInterests(picked); setEditingInterests(false); }
            finally { setSavingInterests(false); }
          }}
        />
      )}
      {showDeleteConfirm && (
        <div style={{position:"fixed",inset:0,zIndex:1400,background:"rgba(27,28,25,0.7)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px"}} onClick={()=>!deletingAccount && setShowDeleteConfirm(false)}>
          <div style={{background:"#FBF9F4",borderRadius:16,maxWidth:420,width:"100%",padding:"28px 28px 24px",boxShadow:"0 24px 60px rgba(0,0,0,0.25)"}} onClick={e=>e.stopPropagation()}>
            <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#C46A4D",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 8px"}}>Delete account</p>
            <h2 style={{fontFamily:F2,fontSize:20,fontWeight:800,color:"#213C18",letterSpacing:"-0.4px",margin:"0 0 10px"}}>Are you sure?</h2>
            <p style={{fontFamily:F2,fontSize:13,color:"#54584F",lineHeight:1.65,margin:"0 0 20px"}}>Your profile, credit balance, saved preferences and sign-in will be permanently removed. Any credits on your account will not be refunded. This can't be undone.</p>
            {deleteErr && <p style={{fontFamily:F2,fontSize:12,color:"#C46A4D",margin:"0 0 12px"}}>{deleteErr}</p>}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button onClick={()=>setShowDeleteConfirm(false)} disabled={deletingAccount}
                style={{background:"transparent",color:"#54584F",border:"none",padding:"10px 18px",fontFamily:F2,fontSize:13,fontWeight:600,cursor:deletingAccount?"not-allowed":"pointer"}}>
                Cancel
              </button>
              <button onClick={confirmDeleteAccount} disabled={deletingAccount}
                style={{background:deletingAccount?"#E4E2DD":"#C46A4D",color:deletingAccount?"#54584F":"#FBF9F4",border:"none",borderRadius:999,padding:"10px 22px",fontFamily:F2,fontSize:13,fontWeight:700,cursor:deletingAccount?"not-allowed":"pointer"}}>
                {deletingAccount ? "Deleting…" : "Yes, delete my account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Invoice generator ────────────────────────────────────────────────────────
function printInvoice({ invoiceNo, date, businessName, businessAddress, vatNo, iban, credits, bookings, grossValue, commissionRate, commissionAmt, netPayout }) {
  const win = window.open("","_blank","width=800,height=900");
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Invoice ${invoiceNo}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Jost',system-ui,sans-serif;color:#1E1B15;background:#fff;padding:48px;}
    .sage{color:#4E6B43;} .stone{color:#7C7260;} .ochre{color:#B8925C;}
    h1{font-size:32px;font-weight:700;color:#4E6B43;letter-spacing:-1px;line-height:1;}
    .label{font-size:8px;letter-spacing:2px;text-transform:uppercase;color:#7C7260;margin-bottom:4px;}
    .rule{border:none;border-top:1px solid #DDD6C8;margin:20px 0;}
    .row{display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid #F0EDE6;}
    .total-row{display:flex;justify-content:space-between;align-items:baseline;padding:14px 0;background:#ECF3E9;padding:14px 16px;border-radius:3px;margin-top:6px;}
    .mono{font-size:13px;font-weight:600;}
    @media print{body{padding:24px;}button{display:none!important;}}
  </style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;">
    <div>
      <h1>wello</h1>
      <div style="font-size:8px;letter-spacing:4px;text-transform:uppercase;color:#B8925C;margin-top:4px;">the wellness pass</div>
      <div style="margin-top:16px;font-size:11px;color:#7C7260;line-height:1.8;">
        Wello Marketplace S.L.<br>Palma de Mallorca, Balearic Islands<br>hello@wello-wellness.com
      </div>
    </div>
    <div style="text-align:right;">
      <div class="label">Payout Invoice</div>
      <div style="font-size:22px;font-weight:700;letter-spacing:-0.5px;">${invoiceNo}</div>
      <div style="font-size:12px;color:#7C7260;margin-top:4px;">${date}</div>
      <div style="margin-top:12px;font-size:11px;color:#7C7260;line-height:1.8;text-align:right;">
        ${businessName}<br>${businessAddress}${vatNo !== "—" ? "<br>VAT: "+vatNo : ""}
      </div>
    </div>
  </div>

  <hr class="rule">

  <div class="label" style="margin-bottom:12px;">Payout breakdown</div>

  <div class="row"><span style="font-size:12px;">Credits redeemed</span><span class="mono">◈ ${credits}</span></div>
  <div class="row"><span style="font-size:12px;">Total bookings processed</span><span class="mono">${bookings}</span></div>
  <div class="row"><span style="font-size:12px;">Gross credit value (◈ ${credits} × €9.00)</span><span class="mono">€${grossValue}.00</span></div>
  <div class="row" style="color:#4E6B43;"><span style="font-size:12px;">Wello commission (${commissionRate}%)</span><span class="mono" style="color:#4E6B43;">− €${commissionAmt}</span></div>

  <div class="total-row">
    <div>
      <div class="label" style="color:#4E6B43;">Net payout to ${businessName}</div>
      <div style="font-size:11px;color:#7C7260;margin-top:2px;">To be transferred to ${iban !== "—" ? iban : "registered bank account"}</div>
    </div>
    <div style="font-size:26px;font-weight:700;color:#1E1B15;letter-spacing:-0.5px;">€${netPayout}</div>
  </div>

  <hr class="rule">
  <div style="font-size:10px;color:#A89E8C;line-height:1.7;margin-bottom:24px;">
    Payouts are processed every Friday. This invoice serves as confirmation of credits redeemed at your venue during the stated period,
    less the agreed Wello platform commission. Credit value is calculated at €1.00 per credit. If you have any queries regarding this
    invoice please contact hello@wello-wellness.com quoting invoice number ${invoiceNo}.
  </div>

  <button onclick="window.print()" style="padding:10px 22px;background:#4E6B43;color:#fff;border:none;border-radius:2px;font-family:'Jost',system-ui,sans-serif;font-size:12px;font-weight:600;cursor:pointer;letter-spacing:.4px;">
    Save as PDF (Print → Save as PDF)
  </button>
  </body></html>`);
  win.document.close();
}

// ═══════════════════════════════════════════════════════════════
// PAGE: PARTNERS  (public partner landing)
// ═══════════════════════════════════════════════════════════════
// Note: a much larger legacy BUSINESS page (registration wizard + dashboard)
// used to live here, along with the unused RegStepBar + RegCard helpers
// that supported it. All removed when BusinessPortal + PartnerOnboarding
// replaced that flow.
function PartnersPage({ onSetView }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  const [openFaq, setOpenFaq] = useState(0);

  const BENEFITS = [
    {
      title: "Reach new customers",
      body:  "The Airbnb guest staying two weeks. Yacht crew in port for the night. The expat who just arrived. People actively searching for somewhere new to practice, sweat or unwind on the island.",
      icon:  "✧",
    },
    {
      title: "Fill your quieter sessions",
      body:  "You control which slots you list. Drop in the mornings you have space, the afternoons that never quite fill. No conflict with your existing regulars and their booking system.",
      icon:  "⌗",
    },
    {
      title: "On your terms",
      body:  "You set your own credit price. Members redeem credits at your venue, and we settle every Friday. No monthly fee, no upfront cost.",
      icon:  "◈",
    },
  ];

  const STEPS = [
    { n: "01", title: "Register your venue",      body: "Two minutes. Tell us your name, email and what kind of venue you run. We'll be in touch within two working days." },
    { n: "02", title: "Complete your listing",    body: "We guide you through photos, classes, availability and pricing. Connect Acuity, paste an iCal feed, or manage your slots manually." },
    { n: "03", title: "Go live and start booking",body: "Once we've reviewed your listing, it appears on the marketplace and members can start booking. Payouts go out every Friday." },
  ];

  const FAQ = [
    {
      q: "How does payment work?",
      a: "You set your credit price. Members redeem credits at your venue and we settle every Friday.",
    },
    {
      q: "What booking systems do you integrate with?",
      a: "Today we support Acuity Scheduling and any calendar that exports an iCal feed (Google Calendar, Apple Calendar, Outlook). If you're not on either, you can add and edit your slots manually in the partner portal, or paste a WhatsApp number and we'll notify you on WhatsApp when a booking comes in — most partners launching with us are using WhatsApp.",
    },
    {
      q: "When do I get paid?",
      a: "Payouts go out every Friday, direct to the IBAN you set in your dashboard. Each payout covers credits redeemed at your venue in the prior week. You can download a statement for each payout from your dashboard.",
    },
  ];

  const card     = { background:"#fff", border:"1px solid rgba(195,200,188,0.3)", borderRadius:16, padding:"clamp(22px,3.5vw,32px)", boxShadow:"0 1px 8px rgba(0,0,0,0.04)" };
  const sectionH = { fontFamily:F2, fontSize:"clamp(22px,3vw,32px)", fontWeight:800, color:"#213C18", letterSpacing:"-1px", margin:"0 0 12px" };
  const sectionLead = { fontFamily:F2, fontSize:"clamp(14px,1.6vw,16px)", color:"#43483F", lineHeight:1.65, margin:"0 0 32px", maxWidth:560 };

  const goRegister = () => onSetView("biz-portal");

  return (
    <div style={{paddingTop:"clamp(24px,4vw,48px)",paddingBottom:"calc(120px + env(safe-area-inset-bottom))",background:"#FBF9F4"}}>

      {/* ── HERO ───────────────────────────────────────── */}
      <section style={{maxWidth:1100,margin:"0 auto",padding:"clamp(24px,5vw,56px) clamp(16px,4vw,32px)"}}>
        <div style={{maxWidth:760}}>
          <span style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#6F5B44",letterSpacing:"4px",textTransform:"uppercase",display:"block",marginBottom:18}}>For wellness venues</span>
          <h1 style={{fontFamily:F2,fontSize:"clamp(34px,6vw,56px)",fontWeight:800,color:"#213C18",letterSpacing:"-2px",margin:"0 0 18px",lineHeight:1.02}}>Partner with Wello.</h1>
          <p style={{fontFamily:F2,fontSize:"clamp(15px,1.9vw,19px)",color:"#43483F",lineHeight:1.6,margin:"0 0 12px",maxWidth:620,fontWeight:400}}>Join a growing network of wellness venues and reach visitors and locals who are actively looking for new experiences in Mallorca.</p>
          <p style={{fontFamily:F2,fontSize:"clamp(14px,1.7vw,17px)",color:"#54584F",lineHeight:1.6,margin:"0 0 32px",maxWidth:620,fontWeight:400}}>Register your interest and we'll be in touch within two working days to walk through Wello together and get you set up.</p>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            <button onClick={goRegister}
              style={{padding:"14px 30px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer",letterSpacing:"0.3px",boxShadow:"0 4px 14px rgba(33,60,24,0.2)"}}>
              Register your interest →
            </button>
          </div>
          <button onClick={()=>{ const f = document.getElementById('partners-faq'); if (f) f.scrollIntoView({behavior:"smooth",block:"start"}); }}
            style={{marginTop:14,background:"transparent",border:"none",color:"#54584F",fontFamily:F2,fontSize:12,fontWeight:600,cursor:"pointer",padding:0,textDecoration:"underline"}}>
            Or read the FAQ
          </button>
        </div>
      </section>

      {/* ── BENEFITS (3 cards) ─────────────────────────── */}
      <section style={{maxWidth:1100,margin:"0 auto",padding:"clamp(8px,2vw,16px) clamp(16px,4vw,32px) clamp(40px,6vw,72px)"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,260px),1fr))",gap:16}}>
          {BENEFITS.map(b => (
            <div key={b.title} style={card}>
              <div style={{width:44,height:44,borderRadius:12,background:"#CAECBA",color:"#213C18",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F2,fontSize:20,fontWeight:800,marginBottom:18}}>{b.icon}</div>
              <h3 style={{fontFamily:F2,fontSize:"clamp(16px,2vw,19px)",fontWeight:700,color:"#213C18",letterSpacing:"-0.4px",margin:"0 0 10px"}}>{b.title}</h3>
              <p style={{fontFamily:F2,fontSize:14,color:"#43483F",margin:0,lineHeight:1.65}}>{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS (3 steps) ─────────────────────── */}
      <section style={{background:"#fff",borderTop:"1px solid rgba(195,200,188,0.3)",borderBottom:"1px solid rgba(195,200,188,0.3)",padding:"clamp(48px,7vw,88px) 0"}}>
        <div style={{maxWidth:1100,margin:"0 auto",padding:"0 clamp(16px,4vw,32px)"}}>
          <span style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#6F5B44",letterSpacing:"4px",textTransform:"uppercase",display:"block",marginBottom:14}}>How it works</span>
          <h2 style={sectionH}>Three steps from sign-up to live.</h2>
          <p style={sectionLead}>We've kept it deliberately simple. Most partners are listed within a week of registering.</p>

          <ol style={{listStyle:"none",margin:0,padding:0,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,260px),1fr))",gap:16}}>
            {STEPS.map(s => (
              <li key={s.n} style={{...card, position:"relative"}}>
                <span style={{fontFamily:F2,fontSize:32,fontWeight:800,color:"#CAECBA",letterSpacing:"-1px",lineHeight:1,display:"block",marginBottom:14}}>{s.n}</span>
                <h3 style={{fontFamily:F2,fontSize:"clamp(16px,2vw,19px)",fontWeight:700,color:"#213C18",letterSpacing:"-0.4px",margin:"0 0 10px"}}>{s.title}</h3>
                <p style={{fontFamily:F2,fontSize:14,color:"#43483F",margin:0,lineHeight:1.65}}>{s.body}</p>
              </li>
            ))}
          </ol>

          <div style={{textAlign:"center",marginTop:36}}>
            <button onClick={goRegister}
              style={{padding:"14px 30px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer",letterSpacing:"0.3px",boxShadow:"0 4px 14px rgba(33,60,24,0.2)"}}>
              Register your venue
            </button>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────── */}
      <section id="partners-faq" style={{maxWidth:760,margin:"0 auto",padding:"clamp(48px,7vw,88px) clamp(16px,4vw,32px) 0"}}>
        <span style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#6F5B44",letterSpacing:"4px",textTransform:"uppercase",display:"block",marginBottom:14}}>Common questions</span>
        <h2 style={sectionH}>FAQ.</h2>
        <p style={sectionLead}>Anything we haven't covered, email us at <a href="mailto:hello@wello-wellness.com" style={{color:"#213C18",fontWeight:600,textDecoration:"underline"}}>hello@wello-wellness.com</a>.</p>

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {FAQ.map((item, i) => {
            const open = openFaq === i;
            return (
              <div key={i} style={{background:"#fff",border:"1px solid rgba(195,200,188,0.3)",borderRadius:14,overflow:"hidden",boxShadow:open?"0 4px 14px rgba(33,60,24,0.06)":"0 1px 4px rgba(0,0,0,0.03)",transition:"box-shadow .18s"}}>
                <button onClick={()=>setOpenFaq(open ? -1 : i)}
                  style={{width:"100%",textAlign:"left",background:"transparent",border:"none",padding:"18px 20px",fontFamily:F2,fontSize:"clamp(14px,1.7vw,16px)",fontWeight:700,color:"#213C18",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,letterSpacing:"-0.2px"}}>
                  <span>{item.q}</span>
                  <span style={{flexShrink:0,fontSize:18,color:"#54584F",transform:open?"rotate(180deg)":"none",transition:"transform .2s"}}>⌄</span>
                </button>
                {open && (
                  <div style={{padding:"0 20px 20px"}}>
                    <p style={{fontFamily:F2,fontSize:14,color:"#43483F",margin:0,lineHeight:1.7}}>{item.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── FOOT CTA ──────────────────────────────────── */}
      <section style={{maxWidth:760,margin:"0 auto",padding:"clamp(36px,6vw,72px) clamp(16px,4vw,32px) 0",textAlign:"center"}}>
        <h2 style={{fontFamily:F2,fontSize:"clamp(22px,3vw,30px)",fontWeight:800,color:"#213C18",letterSpacing:"-0.8px",margin:"0 0 12px"}}>Ready to list your venue?</h2>
        <p style={{fontFamily:F2,fontSize:15,color:"#43483F",lineHeight:1.6,margin:"0 0 24px"}}>Two minutes to register. We'll be in touch within two working days.</p>
        <button onClick={goRegister}
          style={{padding:"14px 32px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer",letterSpacing:"0.3px",boxShadow:"0 4px 14px rgba(33,60,24,0.2)"}}>
          Register your venue
        </button>
      </section>

    </div>
  );
}


function CreditsPage({ credits, listings=[], authSession, onCheckout, onSetView }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  const PRICE_PER_CREDIT = 1; // EUR. 1 credit equals one euro of credit value.

  // Phases:
  //   select     default landing. Clean selector. Concierge link below.
  //   opener     concierge screen 1.
  //   followup   concierge screen 2 (Claude has asked a question).
  //   building   loading screen while Claude builds the itinerary.
  //   recommend  concierge screen 3 (itinerary shown).
  const [phase, setPhase]                 = useState("select");
  const [tripAnswer, setTripAnswer]       = useState("");
  const [followupQuestion, setFollowupQuestion] = useState("");
  const [followupAnswer, setFollowupAnswer] = useState("");
  const [reco, setReco]                   = useState(null);
  const [loading, setLoading]             = useState(false);
  const [wizardErr, setWizardErr]         = useState("");
  // Quantity stored as string so the user can clear it and type freely.
  const [quantity, setQuantity]           = useState("0");
  const [buyLoading, setBuyLoading]       = useState(false);

  const qtyNum          = Math.max(0, parseInt(quantity) || 0);
  const creditsSubtotal = qtyNum * PRICE_PER_CREDIT;
  const serviceFee      = Math.min(creditsSubtotal * 0.10, 3.99);
  const grandTotal      = creditsSubtotal + serviceFee;

  // Resolve a real Mallorca venue photo for each itinerary card.
  // Prefers an approved-listing photo whose category matches the activity
  // keyword. Falls back to a category-appropriate Unsplash placeholder.
  const ACTIVITY_PLACEHOLDERS = {
    pilates:   "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=900&q=80",
    yoga:      "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=900&q=80",
    meditation:"https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=900&q=80",
    spa:       "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=900&q=80",
    pool:      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=900&q=80",
    gym:       "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=900&q=80",
    fitness:   "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=900&q=80",
    surf:      "https://images.unsplash.com/photo-1515016886654-94c06b8a8c7d?w=900&q=80",
    paddle:    "https://images.unsplash.com/photo-1517438476312-10d79c077509?w=900&q=80",
    kayak:     "https://images.unsplash.com/photo-1463694579291-3bb6c1ddd23a?w=900&q=80",
    sail:      "https://images.unsplash.com/photo-1500627965408-b5f2c8793f8c?w=900&q=80",
    hike:      "https://images.unsplash.com/photo-1551632811-561732d1e306?w=900&q=80",
    walk:      "https://images.unsplash.com/photo-1551632811-561732d1e306?w=900&q=80",
    cycle:     "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=900&q=80",
    bike:      "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=900&q=80",
    run:       "https://images.unsplash.com/photo-1486218119243-13883505764c?w=900&q=80",
    tennis:    "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=900&q=80",
    padel:     "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=900&q=80",
    massage:   "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=900&q=80",
    breath:    "https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=900&q=80",
  };
  const DEFAULT_IMG = "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=900&q=80";

  function imgForActivity(activityName) {
    const lower = (activityName || '').toLowerCase();
    if (!lower) return DEFAULT_IMG;
    const match = listings.find(l => {
      const cat  = (l.cat  || '').toLowerCase();
      const name = (l.name || '').toLowerCase();
      return (cat && (lower.includes(cat) || cat.includes(lower.split(/[\s(,/]/)[0]))) ||
             (name && lower.includes(name));
    });
    if (match?.img) return match.img;
    for (const [key, url] of Object.entries(ACTIVITY_PLACEHOLDERS)) {
      if (lower.includes(key)) return url;
    }
    return DEFAULT_IMG;
  }

  // Wizard screen 1 to screen 2: ask Claude for one warm follow-up question.
  async function sendOpener() {
    if (!tripAnswer.trim()) return;
    setLoading(true); setWizardErr("");
    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          system: `You are Wello's wellness concierge for Mallorca, Spain. The user has just told you a bit about their time on the island. Ask ONE warm, specific follow-up question that surfaces either (a) their main wellness goal for the trip (recover, build strength, gain flexibility, clear the head, sleep better, try something new) OR (b) a specific adventure they might want to try (sunrise hike up Cap Formentor, paddleboarding in Pollença bay, sunset yoga in Deià, padel under the lights, a thermal spa morning). Mention Mallorca naturally. Maximum 2 sentences. Just the question, no preamble. No exclamation marks. No em dashes.`,
          messages: [{ role: 'user', content: tripAnswer.trim() }],
          max_tokens: 220,
        },
      });
      if (error) throw new Error(error.message);
      const text = (data?.content || []).map(b => b.text || '').join('').trim();
      if (!text) throw new Error('Empty follow-up');
      setFollowupQuestion(text);
      setPhase("followup");
    } catch (e) {
      console.error('opener to followup failed:', e);
      setWizardErr("Sorry, the concierge is taking a moment. Try again or choose credits manually.");
    } finally {
      setLoading(false);
    }
  }

  // Wizard screen 2 to screen 3: ask Claude for a single personalised itinerary.
  async function sendFollowup() {
    if (!followupAnswer.trim()) return;
    setLoading(true); setWizardErr("");
    setPhase("building");
    try {
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          system: `You are Wello's wellness concierge for Mallorca, Spain. Wello is a wellness pass that lets people book yoga, pilates, spa, paddleboarding, gym, meditation and other wellness experiences across Mallorca using credits. Each credit costs one euro. Based on the user's two answers, build ONE personalised wellness itinerary for their time in Mallorca.

STRICT OUTPUT RULES (read carefully):
- Respond with raw JSON only. No prose before or after.
- No "Perfect", no "Here is your itinerary", no greeting outside the JSON, no markdown code fences.
- The first character of your response must be a curly brace and the last character must be a curly brace.
- The warmth lives inside the "greeting" field, not before the JSON.
- No exclamation marks anywhere. No em dashes anywhere.

JSON shape:
{
  "greeting": "one warm, personalised sentence addressing what they told you",
  "itinerary": [
    {
      "day": "e.g. Tuesday morning",
      "activity": "e.g. Reformer Pilates",
      "description": "one sentence on why this suits them specifically",
      "credits": 20
    }
  ],
  "total_credits": 80,
  "reasoning": "one short sentence on the overall thinking",
  "membership_nudge": true or false based on whether they seem long-stay or resident
}

Keep itinerary to 3 to 5 activities. Credit costs (1 credit equals 1 euro): yoga or pilates 15 to 25 credits, spa 50 to 80 credits, hotel pool day 30 to 50 credits, water sports 30 to 40 credits, gym day pass 12 to 18 credits, meditation 10 to 15 credits, private instructor 40 to 60 credits. Be specific to Mallorca: mention the coast, the light, the Tramuntana, the pace of the island naturally.

CRITICAL: every "credits" value and "total_credits" MUST be a single positive integer (for example 20, 80). Never an object, array, or breakdown like {per_week, per_month}. For long stays, pick a sensible weekly or monthly starting pack and set membership_nudge to true. Keep credits as plain integers.`,
          messages: [
            { role: 'user',      content: tripAnswer.trim() },
            { role: 'assistant', content: followupQuestion },
            { role: 'user',      content: followupAnswer.trim() },
          ],
          max_tokens: 900,
        },
      });
      if (error) throw new Error(error.message);
      const text = (data?.content || []).map(b => b.text || '').join('').trim();
      // Defensively extract the JSON in case Claude prefaces with prose.
      const stripped = text.replace(/```json|```/g, '').trim();
      const start = stripped.indexOf('{');
      const end   = stripped.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) {
        console.error('followup: no JSON found in response:', text.slice(0, 300));
        throw new Error('No JSON in recommender response');
      }
      const parsed = JSON.parse(stripped.slice(start, end + 1));
      if (!parsed?.itinerary || !Array.isArray(parsed.itinerary)) {
        throw new Error('Bad itinerary shape');
      }
      // Defensive coercion so React never tries to render a non-string field.
      const toInt = (v, fallback = 0) => {
        if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.round(v));
        if (typeof v === 'string') {
          const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
          return Number.isFinite(n) ? Math.max(0, n) : fallback;
        }
        if (v && typeof v === 'object') {
          for (const leaf of Object.values(v)) {
            const n = toInt(leaf, NaN);
            if (Number.isFinite(n) && n > 0) return n;
          }
        }
        return fallback;
      };
      const safeItinerary = parsed.itinerary.map(it => ({
        day:         typeof it?.day === 'string'         ? it.day         : '',
        activity:    typeof it?.activity === 'string'    ? it.activity    : 'Wellness session',
        description: typeof it?.description === 'string' ? it.description : '',
        credits:     toInt(it?.credits, 0),
      }));
      const safeTotal = toInt(parsed.total_credits, safeItinerary.reduce((s, x) => s + x.credits, 0)) || 1;
      const safeReco = {
        greeting:         typeof parsed.greeting === 'string' ? parsed.greeting : '',
        itinerary:        safeItinerary,
        total_credits:    safeTotal,
        reasoning:        typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
        membership_nudge: parsed.membership_nudge === true,
      };
      setReco(safeReco);
      setPhase("recommend");
    } catch (e) {
      console.error('followup to recommendation failed:', e);
      setWizardErr("Sorry, the concierge could not build your plan. Try again or choose credits manually.");
      setPhase("followup");
    } finally {
      setLoading(false);
    }
  }

  function acceptRecommendation() {
    if (reco?.total_credits) setQuantity(String(reco.total_credits));
    setPhase("select");
  }

  function skipToSelector() {
    setPhase("select");
  }

  function resetWizard() {
    setTripAnswer(""); setFollowupQuestion(""); setFollowupAnswer("");
    setReco(null); setWizardErr(""); setPhase("opener");
  }

  async function startCheckout() {
    if (qtyNum < 1) return;
    setBuyLoading(true);
    try {
      // Auth gate lives on the App-level handler now: guests get the sign-up
      // modal + auto-resumed checkout, signed-in users go straight to Stripe.
      if (onCheckout) {
        await onCheckout(qtyNum);
      }
    } catch (e) {
      console.error('startCheckout error:', e);
    } finally {
      setBuyLoading(false);
    }
  }

  // Shared styles
  const card        = { background:"#fff", border:"1px solid rgba(195,200,188,0.3)", borderRadius:16, padding:"clamp(20px,4vw,32px)", boxShadow:"0 1px 8px rgba(0,0,0,0.04)" };
  const textareaSt  = { width:"100%", minHeight:120, padding:"14px 16px", borderRadius:12, border:"1px solid rgba(195,200,188,0.5)", fontFamily:F2, fontSize:15, color:"#1B1C19", background:"#FBF9F4", outline:"none", boxSizing:"border-box", lineHeight:1.55, resize:"vertical" };
  const primaryBtn  = (enabled) => ({ width:"100%", padding:"14px", background:enabled?"#213C18":"#E4E2DD", color:enabled?"#fff":"#54584F", border:"none", borderRadius:999, fontFamily:F2, fontSize:14, fontWeight:700, cursor:enabled?"pointer":"not-allowed", letterSpacing:"0.3px", boxShadow:enabled?"0 4px 14px rgba(33,60,24,0.2)":"none", transition:"all .15s" });
  const subtleLink  = { width:"100%", marginTop:10, padding:"10px", background:"transparent", border:"none", color:"#54584F", fontFamily:F2, fontSize:12, fontWeight:500, cursor:"pointer", textDecoration:"underline" };
  const skipLinkSt  = { display:"block", margin:"16px auto 0", padding:"8px 14px", background:"transparent", border:"none", color:"#54584F", fontFamily:F2, fontSize:12, fontWeight:500, cursor:"pointer", textDecoration:"underline", textAlign:"center" };

  return (
    <div style={{paddingTop:"clamp(24px,4vw,48px)",paddingBottom:"calc(100px + env(safe-area-inset-bottom))"}}>
      <div style={{maxWidth:720,margin:"0 auto",padding:"0 clamp(16px,4vw,32px)"}}>

        {/* Header (shown on every phase) */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12}}>
          <div>
            <span style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"4px",textTransform:"uppercase",display:"block",marginBottom:8}}>Your Pass</span>
            <h1 style={{fontFamily:F2,fontSize:"clamp(26px,4vw,38px)",fontWeight:800,color:"#213C18",letterSpacing:"-1.3px",margin:0,lineHeight:1}}>
              {phase === "select" ? "Choose your credits" : "Plan your time"}
            </h1>
          </div>
          <div style={{background:"#213C18",borderRadius:999,padding:"10px 18px",color:"#fff"}}>
            <span style={{fontFamily:F2,fontSize:10,letterSpacing:"2px",textTransform:"uppercase",color:"rgba(255,255,255,0.55)",marginRight:8}}>Balance</span>
            <span style={{fontFamily:F2,fontSize:14,fontWeight:800}}>◈ {credits}</span>
          </div>
        </div>

        {/* ════════ ENTRY POINT 1: SELECTOR ════════ */}
        {phase === "select" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Optional itinerary recap if the user just came out of the concierge */}
            {reco && (() => {
              if (!reco.itinerary?.length) return null;
              return (
                <div style={card}>
                  <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:10,gap:8,flexWrap:"wrap"}}>
                    <span style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#213C18"}}>Wello's suggested plan</span>
                    <button onClick={resetWizard} style={{background:"transparent",border:"none",color:"#54584F",fontFamily:F2,fontSize:12,fontWeight:500,cursor:"pointer",textDecoration:"underline"}}>Re-run the concierge</button>
                  </div>
                  {reco.greeting && <p style={{fontFamily:F2,fontSize:13,color:"#54584F",margin:"0 0 12px",fontStyle:"italic"}}>{reco.greeting}</p>}
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {reco.itinerary.map((it, i) => (
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:12,padding:"6px 0",borderBottom:i<reco.itinerary.length-1?"1px solid rgba(195,200,188,0.25)":"none"}}>
                        <div style={{flex:1,minWidth:0}}>
                          <p style={{fontFamily:F2,fontSize:10,color:"#54584F",letterSpacing:"1px",textTransform:"uppercase",margin:"0 0 2px"}}>{it.day}</p>
                          <p style={{fontFamily:F2,fontSize:13,fontWeight:700,color:"#1B1C19",margin:0}}>{it.activity}</p>
                        </div>
                        <span style={{fontFamily:F2,fontSize:13,fontWeight:700,color:"#213C18",whiteSpace:"nowrap"}}>◈ {it.credits}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Selector card */}
            <div style={card}>
              <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:14,textAlign:"center"}}>How many credits?</label>

              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:20,marginBottom:10}}>
                <button onClick={()=>setQuantity(String(Math.max(1, qtyNum - 1)))}
                  style={{width:48,height:48,borderRadius:"50%",background:"#fff",border:"1px solid rgba(195,200,188,0.4)",color:"#213C18",fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 6px rgba(0,0,0,0.06)"}}>−</button>
                <input type="text" inputMode="numeric" value={quantity}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                    setQuantity(raw);
                  }}
                  onBlur={() => {
                    const n = parseInt(quantity) || 0;
                    if (n < 1) setQuantity("1");
                    else if (n > 5000) setQuantity("5000");
                    else setQuantity(String(n));
                  }}
                  style={{fontFamily:F2,fontSize:"clamp(40px,12vw,64px)",fontWeight:800,color:"#213C18",letterSpacing:"-1.5px",lineHeight:1,textAlign:"center",width:"clamp(110px,30vw,170px)",background:"transparent",border:"none",outline:"none"}}/>
                <button onClick={()=>setQuantity(String(Math.min(5000, qtyNum + 1)))}
                  style={{width:48,height:48,borderRadius:"50%",background:"#213C18",color:"#fff",border:"none",fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 12px rgba(33,60,24,0.3)"}}>+</button>
              </div>

              {/* Live equation */}
              <p style={{fontFamily:F2,fontSize:14,color:"#43483F",fontWeight:500,textAlign:"center",margin:"0 0 18px"}}>
                {qtyNum} credits = €{creditsSubtotal.toFixed(0)}
              </p>

              {/* Quick-add pills */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8,marginBottom:20}}>
                {[5, 10, 20, 50].map(n => (
                  <button key={n} onClick={()=>setQuantity(String(Math.min(5000, Math.max(1, qtyNum) + n)))}
                    style={{padding:"10px 8px",borderRadius:10,border:"1px solid rgba(195,200,188,0.4)",background:"#fff",color:"#43483F",fontFamily:F2,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    +{n}
                  </button>
                ))}
              </div>

              {/* Total breakdown */}
              <div style={{background:"#F5F3EE",borderRadius:12,padding:"14px 16px",marginBottom:18}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                  <span style={{fontFamily:F2,fontSize:13,color:"#43483F"}}>{qtyNum} credits × €{PRICE_PER_CREDIT}</span>
                  <span style={{fontFamily:F2,fontSize:13,color:"#43483F",fontWeight:600}}>€{creditsSubtotal.toFixed(2)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10,paddingBottom:10,borderBottom:"1px solid rgba(195,200,188,0.4)"}}>
                  <span style={{fontFamily:F2,fontSize:12,color:"#54584F"}}>Service fee (10%, capped at €3.99)</span>
                  <span style={{fontFamily:F2,fontSize:13,color:"#43483F",fontWeight:600}}>€{serviceFee.toFixed(2)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span style={{fontFamily:F2,fontSize:13,color:"#213C18",fontWeight:700}}>Total</span>
                  <span style={{fontFamily:F2,fontSize:22,fontWeight:800,color:"#213C18",letterSpacing:"-0.5px"}}>€{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Withdrawal-right acknowledgment. Sits directly above the
                  pay button so the customer sees it in the moment of
                  purchase; text mirrors clause 3.5 of the consumer terms. */}
              <p style={{fontFamily:F2,fontSize:11,color:"#54584F",lineHeight:1.6,margin:"0 0 10px"}}>
                Credits are available to spend immediately. Credits you have spent are deducted at full value from any refund. Booked sessions follow the cancellation policy shown at booking.
              </p>

              <button onClick={startCheckout} disabled={buyLoading || qtyNum < 1}
                style={primaryBtn(qtyNum>=1 && !buyLoading)}>
                {buyLoading ? "Opening checkout" : `Buy credits · €${grandTotal.toFixed(2)}`}
              </button>

              <p style={{fontFamily:F2,fontSize:11,color:"rgba(33,60,24,0.55)",textAlign:"center",margin:"14px 0 0"}}>Secure card payment. Credits do not expire. 1 credit = €{PRICE_PER_CREDIT}.</p>

              {onSetView && (
                <button type="button" onClick={()=>onSetView("gift")}
                  style={{marginTop:14,width:"100%",padding:"13px 22px",background:"#213C18",color:"#FBF9F4",border:"1px solid #213C18",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:"pointer",letterSpacing:"0.2px",boxShadow:"0 8px 20px rgba(33,60,24,0.18)",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  Or gift credits to someone →
                </button>
              )}
            </div>

            {/* AI concierge entry — visually prominent card so first-time
                guests notice the help, but deliberately below the buy CTA so
                the credit-buying flow stays the primary path. */}
            <button onClick={()=>setPhase("opener")}
              style={{display:"flex",alignItems:"center",gap:14,width:"100%",padding:"clamp(14px,3vw,18px) clamp(16px,3vw,20px)",background:"#fff",border:"1px solid rgba(33,60,24,0.18)",borderRadius:12,cursor:"pointer",textAlign:"left",fontFamily:F2,transition:"all .15s",boxShadow:"0 2px 12px rgba(33,60,24,0.06)"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#213C18";e.currentTarget.style.boxShadow="0 6px 24px rgba(33,60,24,0.12)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(33,60,24,0.18)";e.currentTarget.style.boxShadow="0 2px 12px rgba(33,60,24,0.06)";}}>
              <div style={{flexShrink:0,width:42,height:42,borderRadius:"50%",background:"rgba(202,236,186,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>✦</div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontFamily:F2,fontSize:9,fontWeight:700,color:"#A3B18A",letterSpacing:"2px",textTransform:"uppercase",margin:"0 0 3px"}}>AI concierge</p>
                <p style={{fontFamily:F2,fontSize:"clamp(13px,1.6vw,15px)",fontWeight:700,color:"#213C18",margin:"0 0 2px",letterSpacing:"-0.2px",lineHeight:1.25}}>Not sure how many credits you need?</p>
                <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0,lineHeight:1.5}}>Tell us about your trip and we'll build a personalised wellness itinerary with the right credit amount.</p>
              </div>
              <span style={{flexShrink:0,fontFamily:F2,fontSize:13,fontWeight:700,color:"#213C18",whiteSpace:"nowrap"}}>Plan it →</span>
            </button>
          </div>
        )}

        {/* ════════ CONCIERGE SCREEN 1: OPENER ════════ */}
        {phase === "opener" && (
          <div style={card}>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"#FADEC0",color:"#766149",padding:"5px 12px",borderRadius:999,marginBottom:18}}>
              <span style={{fontSize:11}}>✦</span>
              <span style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase"}}>Wello Concierge</span>
            </div>
            <h2 style={{fontFamily:F2,fontSize:"clamp(20px,3vw,26px)",fontWeight:700,color:"#213C18",letterSpacing:"-0.5px",margin:"0 0 12px",lineHeight:1.25}}>Let's plan your Mallorca wellness.</h2>
            <p style={{fontFamily:F2,fontSize:15,color:"#43483F",lineHeight:1.55,margin:"0 0 22px"}}>Tell me about your time in Mallorca. Are you here for a few days, a longer stay, or do you live here? And what does wellness mean to you on this trip?</p>

            <textarea value={tripAnswer} onChange={e => setTripAnswer(e.target.value)}
              placeholder="e.g. five days with my partner. Mostly want to recover from a busy quarter, but would love to feel a bit stronger by the end too. Curious about paddleboarding."
              style={textareaSt}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) sendOpener(); }}/>

            {wizardErr && <p style={{fontFamily:F2,fontSize:12,color:"#6F5B44",margin:"10px 0 0"}}>{wizardErr}</p>}

            <button onClick={sendOpener} disabled={!tripAnswer.trim() || loading}
              style={{...primaryBtn(!!tripAnswer.trim() && !loading), marginTop:14}}>
              {loading ? "Listening" : "Continue"}
            </button>

            <button onClick={skipToSelector} style={skipLinkSt}>Skip and choose manually</button>
          </div>
        )}

        {/* ════════ CONCIERGE SCREEN 2: FOLLOWUP ════════ */}
        {phase === "followup" && (
          <div style={card}>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"#FADEC0",color:"#766149",padding:"5px 12px",borderRadius:999,marginBottom:18}}>
              <span style={{fontSize:11}}>✦</span>
              <span style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase"}}>Wello Concierge</span>
            </div>

            <div style={{background:"#F5F3EE",borderRadius:12,padding:"12px 14px",marginBottom:16,fontFamily:F2,fontSize:13,color:"#43483F",fontStyle:"italic",lineHeight:1.5}}>
              "{tripAnswer.trim()}"
            </div>

            <h2 style={{fontFamily:F2,fontSize:"clamp(18px,2.6vw,22px)",fontWeight:700,color:"#213C18",letterSpacing:"-0.4px",margin:"0 0 18px",lineHeight:1.35}}>{followupQuestion}</h2>

            <textarea value={followupAnswer} onChange={e => setFollowupAnswer(e.target.value)}
              placeholder="Type your answer."
              style={textareaSt}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) sendFollowup(); }}/>

            {wizardErr && <p style={{fontFamily:F2,fontSize:12,color:"#6F5B44",margin:"10px 0 0"}}>{wizardErr}</p>}

            <button onClick={sendFollowup} disabled={!followupAnswer.trim() || loading}
              style={{...primaryBtn(!!followupAnswer.trim() && !loading), marginTop:14}}>
              {loading ? "Building your plan" : "Continue"}
            </button>

            <button onClick={()=>setPhase("opener")} style={subtleLink}>← Back</button>
            <button onClick={skipToSelector} style={skipLinkSt}>Skip and choose manually</button>
          </div>
        )}

        {/* ════════ LOADING SCREEN ════════ */}
        {phase === "building" && (
          <div style={card}>
            <div style={{textAlign:"center",padding:"clamp(24px,4vw,40px) 12px"}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"14px 22px",background:"#F5F3EE",borderRadius:999,marginBottom:24}}>
                {[0,1,2].map(i => (
                  <span key={i} style={{width:9,height:9,borderRadius:"50%",background:"#213C18",display:"inline-block",animation:`pulse 1.2s ease-in-out infinite ${i*0.2}s`}}/>
                ))}
              </div>
              <h2 style={{fontFamily:F2,fontSize:"clamp(20px,3vw,24px)",fontWeight:700,color:"#213C18",letterSpacing:"-0.4px",margin:"0 0 8px"}}>Building your itinerary</h2>
              <p style={{fontFamily:F2,fontSize:13,color:"#54584F",margin:"0 auto",maxWidth:360,lineHeight:1.55}}>The concierge is reading your answers and picking the right mix of activities, venues and pacing for Mallorca. Usually about ten seconds.</p>
              <div style={{padding:"12px 16px",background:"#FBF9F4",border:"1px solid rgba(195,200,188,0.4)",borderRadius:10,textAlign:"left",maxWidth:440,margin:"24px auto 0"}}>
                <p style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 6px"}}>You said</p>
                <p style={{fontFamily:F2,fontSize:12,color:"#43483F",margin:"0 0 4px",lineHeight:1.5,fontStyle:"italic"}}>"{tripAnswer.trim()}"</p>
                <p style={{fontFamily:F2,fontSize:12,color:"#43483F",margin:0,lineHeight:1.5,fontStyle:"italic"}}>"{followupAnswer.trim()}"</p>
              </div>
              <button onClick={skipToSelector} style={skipLinkSt}>Skip and choose manually</button>
            </div>
          </div>
        )}

        {/* ════════ CONCIERGE SCREEN 3: RECOMMENDATION ════════ */}
        {phase === "recommend" && reco && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={card}>
              <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"#FADEC0",color:"#766149",padding:"5px 12px",borderRadius:999,marginBottom:14}}>
                <span style={{fontSize:11}}>✦</span>
                <span style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase"}}>Your suggested itinerary</span>
              </div>
              <p style={{fontFamily:F2,fontSize:15,color:"#213C18",lineHeight:1.55,margin:"0 0 22px",fontWeight:500}}>{reco.greeting}</p>

              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {reco.itinerary.map((item, i) => (
                  <div key={i} style={{background:"#fff",border:"1px solid rgba(195,200,188,0.3)",borderRadius:14,overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,0.04)"}}>
                    <div style={{position:"relative",paddingBottom:"42%",background:"#E4E2DD"}}>
                      <img src={imgForActivity(item.activity)} alt={item.activity}
                        loading="lazy"
                        onError={e => { e.target.src = DEFAULT_IMG; }}
                        style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
                      <div style={{position:"absolute",top:10,left:10,background:"rgba(255,255,255,0.92)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",color:"#213C18",borderRadius:999,padding:"4px 10px",border:"1px solid rgba(195,200,188,0.4)"}}>
                        <span style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase"}}>{item.day}</span>
                      </div>
                      <div style={{position:"absolute",top:10,right:10,background:"rgba(33,60,24,0.95)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",color:"#fff",borderRadius:999,padding:"4px 12px",boxShadow:"0 2px 6px rgba(0,0,0,0.15)"}}>
                        <span style={{fontFamily:F2,fontSize:13,fontWeight:800,whiteSpace:"nowrap"}}>◈ {item.credits}</span>
                      </div>
                    </div>
                    <div style={{padding:"14px 16px"}}>
                      <p style={{fontFamily:F2,fontSize:15,fontWeight:700,color:"#1B1C19",margin:"0 0 4px",letterSpacing:"-0.2px"}}>{item.activity}</p>
                      <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0,lineHeight:1.55}}>{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginTop:18,paddingTop:16,borderTop:"1px solid rgba(195,200,188,0.3)",flexWrap:"wrap",gap:8}}>
                <span style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#54584F"}}>Suggested total</span>
                <div style={{textAlign:"right"}}>
                  <p style={{fontFamily:F2,fontSize:30,fontWeight:800,color:"#213C18",letterSpacing:"-1px",margin:0,lineHeight:1}}>◈ {reco.total_credits}</p>
                  <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"4px 0 0"}}>€{(reco.total_credits * PRICE_PER_CREDIT).toFixed(0)}</p>
                </div>
              </div>

              {reco.reasoning && (
                <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"14px 0 0",lineHeight:1.55,fontStyle:"italic"}}>{reco.reasoning}</p>
              )}
            </div>

            {/* Membership nudge for long-stay folks */}
            {reco.membership_nudge && (
              <div style={{background:"#FFF5E6",border:"1px solid #DCC2A6",borderRadius:14,padding:"16px 18px"}}>
                <p style={{fontFamily:F2,fontSize:14,color:"#766149",margin:"0 0 10px",lineHeight:1.5,fontWeight:600}}>Sounds like you're here for a while. A monthly membership might work out better.</p>
                <a href="mailto:hello@wello-wellness.com?subject=Tell%20me%20about%20Wello%20membership&body=Hi%20Wello%20team%2C%0A%0AI'd%20love%20to%20hear%20more%20about%20the%20monthly%20membership%20option.%0A%0AThanks%21"
                  style={{display:"inline-block",background:"transparent",border:"1px solid #6F5B44",color:"#6F5B44",borderRadius:999,padding:"7px 16px",fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer",textDecoration:"none"}}>
                  Tell me more →
                </a>
              </div>
            )}

            <button onClick={acceptRecommendation} style={primaryBtn(true)}>
              Looks good
            </button>
            <button onClick={()=>setPhase("followup")} style={subtleLink}>Adjust my answers</button>
            <button onClick={skipToSelector} style={skipLinkSt}>Skip and choose manually</button>
          </div>
        )}

      </div>
    </div>
  );
}

function GiftPage({ authSession, profile, onSetView, onGiftCreated }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  // Prefill sender info if the user is signed in — one less thing to type.
  const [senderName,  setSenderName]     = useState(profile?.full_name || authSession?.user?.user_metadata?.full_name || "");
  const [senderEmail, setSenderEmail]    = useState(authSession?.user?.email || "");
  const [recipientName,  setRecipientName]  = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [credits, setCredits] = useState(50);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!senderName && (profile?.full_name || authSession?.user?.user_metadata?.full_name)) {
      setSenderName(profile?.full_name || authSession?.user?.user_metadata?.full_name || "");
    }
    if (!senderEmail && authSession?.user?.email) {
      setSenderEmail(authSession.user.email);
    }
  }, [profile?.full_name, authSession?.user?.email, authSession?.user?.user_metadata?.full_name, senderName, senderEmail]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail.trim());
  const recipientOK = !recipientEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim());
  const canSubmit = credits >= 5 && emailValid && recipientOK && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true); setErr("");
    try {
      const { data, error } = await supabase.functions.invoke('create-gift', {
        body: {
          credits,
          sender_email:    senderEmail.trim(),
          sender_name:     senderName.trim() || null,
          recipient_email: recipientEmail.trim() || null,
          recipient_name:  recipientName.trim() || null,
          message:         message.trim() || null,
          origin:          window.location.origin,
        },
      });
      if (error || !data?.success || !data?.url) {
        setErr(data?.error || error?.message || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      // Stash recipient email so the return page can show "we emailed X"
      // without another network round-trip.
      try {
        sessionStorage.setItem("wello_pending_gift", JSON.stringify({
          code: data.code,
          credits,
          recipient_email: recipientEmail.trim() || null,
        }));
      } catch { /* non-critical */ }
      window.location.href = data.url; // to Stripe Checkout
    } catch (e) {
      setErr(e.message || "Something went wrong.");
      setSubmitting(false);
    }
  }

  const cardSt   = { background:"#fff", border:"1px solid rgba(195,200,188,0.3)", borderRadius:16, padding:"clamp(20px,3.5vw,32px)", boxShadow:"0 1px 8px rgba(0,0,0,0.04)" };
  const labelSt  = { fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:6 };
  const inputSt  = { width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"12px 16px",fontFamily:F2,fontSize:14,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",transition:"border-color .15s" };

  const presets = [25, 50, 100, 200];

  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"clamp(20px,4vw,40px) clamp(16px,4vw,24px) 80px"}}>
      <div style={{marginBottom:24}}>
        <p style={{fontFamily:F2,fontSize:10,fontWeight:700,color:"#A3B18A",letterSpacing:"3px",textTransform:"uppercase",margin:"0 0 10px"}}>Gift Wello</p>
        <h1 style={{fontFamily:F2,fontSize:"clamp(28px,4vw,44px)",fontWeight:800,color:"#213C18",letterSpacing:"-1.2px",margin:"0 0 10px",lineHeight:1.05}}>Reward your favourite people with wellness on the island.</h1>
        <p style={{fontFamily:F2,fontSize:"clamp(13px,1.6vw,15px)",color:"#54584F",lineHeight:1.6,margin:0,maxWidth:640}}>
          Send someone credits to book across all Wello partners on the island. They pick what they love, whenever suits them. No membership. Cancel any time.
        </p>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,320px),1fr))",gap:20,alignItems:"start"}}>
        {/* Left column — gift form */}
        <div style={cardSt}>
          <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 14px"}}>How much</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
            {presets.map(p => (
              <button key={p} type="button" onClick={()=>setCredits(p)}
                style={{padding:"10px 18px",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:"pointer",border:`1px solid ${credits===p?"#213C18":"rgba(195,200,188,0.6)"}`,background:credits===p?"#213C18":"transparent",color:credits===p?"#FBF9F4":"#213C18",transition:"all .13s"}}>
                {p} credits
              </button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
            <label style={{fontFamily:F2,fontSize:12,color:"#54584F"}}>Or enter a custom amount</label>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
            <input type="number" min="5" max="5000" value={credits}
              onChange={e=>{ const n = parseInt(e.target.value,10); setCredits(Number.isFinite(n)?n:0); }}
              style={{...inputSt,flex:"0 1 140px"}}/>
            <span style={{fontFamily:F2,fontSize:13,color:"#54584F"}}>credits</span>
          </div>
          <p style={{fontFamily:F2,fontSize:11,color:"#A3B18A",margin:"0 0 22px"}}>Minimum 5 credits.</p>

          <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 14px"}}>Recipient</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,180px),1fr))",gap:14,marginBottom:14}}>
            <div>
              <label style={labelSt}>Their name</label>
              <input value={recipientName} onChange={e=>setRecipientName(e.target.value)} placeholder="Optional"
                style={inputSt}/>
            </div>
            <div>
              <label style={labelSt}>Their email</label>
              <input type="email" value={recipientEmail} onChange={e=>setRecipientEmail(e.target.value)} placeholder="Optional if you'd rather share the code yourself"
                style={inputSt}/>
            </div>
          </div>
          <div style={{marginBottom:22}}>
            <label style={labelSt}>Message</label>
            <textarea value={message} onChange={e=>setMessage(e.target.value.slice(0,400))} placeholder="Optional — a note they'll see with the gift."
              style={{...inputSt,resize:"vertical",minHeight:80,fontFamily:F2}}/>
            <p style={{fontFamily:F2,fontSize:11,color:"#A3B18A",margin:"6px 0 0",textAlign:"right"}}>{message.length}/400</p>
          </div>

          <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 14px"}}>From</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,180px),1fr))",gap:14,marginBottom:6}}>
            <div>
              <label style={labelSt}>Your name</label>
              <input value={senderName} onChange={e=>setSenderName(e.target.value)} placeholder="Your name"
                style={inputSt}/>
            </div>
            <div>
              <label style={labelSt}>Your email</label>
              <input type="email" value={senderEmail} onChange={e=>setSenderEmail(e.target.value)} placeholder="you@email.com"
                style={{...inputSt,borderColor:senderEmail && !emailValid ? "#C46A4D" : "rgba(195,200,188,0.5)"}}/>
            </div>
          </div>
        </div>

        {/* Right column — review + submit */}
        <div style={{...cardSt,position:"sticky",top:120}}>
          <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 14px"}}>Your gift</p>
          <div style={{padding:"18px 20px",background:"#F5F3EE",borderRadius:12,marginBottom:16}}>
            <p style={{fontFamily:F2,fontSize:32,fontWeight:800,color:"#213C18",letterSpacing:"-1px",margin:0,lineHeight:1.05}}>{credits}<span style={{fontSize:14,color:"#54584F",fontWeight:600,marginLeft:8}}>credits</span></p>
            <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"6px 0 0"}}>to {recipientName || recipientEmail || "your recipient"}</p>
          </div>
          <ul style={{listStyle:"none",padding:0,margin:"0 0 18px",display:"flex",flexDirection:"column",gap:8}}>
            <li style={{fontFamily:F2,fontSize:12,color:"#54584F",display:"flex",alignItems:"flex-start",gap:8}}>
              <Check size={14} stroke="#213C18" strokeWidth={2.6}/>
              <span>Redeemable across all Wello partners.</span>
            </li>
            <li style={{fontFamily:F2,fontSize:12,color:"#54584F",display:"flex",alignItems:"flex-start",gap:8}}>
              <Check size={14} stroke="#213C18" strokeWidth={2.6}/>
              <span>No membership required for them.</span>
            </li>
            <li style={{fontFamily:F2,fontSize:12,color:"#54584F",display:"flex",alignItems:"flex-start",gap:8}}>
              <Check size={14} stroke="#213C18" strokeWidth={2.6}/>
              <span>They get a claim code and, if you gave their email, an invite link.</span>
            </li>
          </ul>
          {err && <p style={{fontFamily:F2,fontSize:12,color:"#C46A4D",margin:"0 0 12px"}}>{err}</p>}
          <button onClick={submit} disabled={!canSubmit}
            style={{width:"100%",padding:"14px 24px",background:!canSubmit?"#E4E2DD":"#213C18",color:!canSubmit?"#54584F":"#FBF9F4",border:"none",borderRadius:999,fontFamily:F2,fontSize:14,fontWeight:700,cursor:!canSubmit?"not-allowed":"pointer",boxShadow:!canSubmit?"none":"0 8px 20px rgba(33,60,24,0.18)"}}>
            {submitting ? "Opening checkout…" : `Continue to checkout · €${(credits * 1 + Math.min(credits * 0.10, 3.99)).toFixed(2)}`}
          </button>
          <p style={{fontFamily:F2,fontSize:11,color:"#A3B18A",margin:"12px 0 0",lineHeight:1.5,textAlign:"center"}}>Secure card payment via Stripe. Credit + 10% service fee (capped at €3.99). Recipient claims by email link or code.</p>
        </div>
      </div>
    </div>
  );
}

function GiftSentPage({ gift, onSetView }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  const [copied, setCopied] = useState("");
  async function copy(text, id) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(()=>setCopied(""), 1600); }
    catch { /* clipboard blocked, nothing to do */ }
  }
  return (
    <div style={{maxWidth:640,margin:"0 auto",padding:"clamp(28px,5vw,60px) clamp(16px,4vw,24px) 80px",textAlign:"center"}}>
      <div style={{width:72,height:72,margin:"0 auto 20px",borderRadius:"50%",background:"#CAECBA",border:"1px solid #A3B18A",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <Check size={34} stroke="#213C18" strokeWidth={2.6}/>
      </div>
      <h1 style={{fontFamily:F2,fontSize:"clamp(24px,3.5vw,36px)",fontWeight:800,color:"#213C18",letterSpacing:"-1px",margin:"0 0 10px",lineHeight:1.1}}>Your gift is on its way.</h1>
      <p style={{fontFamily:F2,fontSize:14,color:"#54584F",lineHeight:1.6,margin:"0 0 26px"}}>
        {gift.recipient_email
          ? <>We emailed <strong style={{color:"#213C18"}}>{gift.recipient_email}</strong> with the claim link. You also have a copy in your inbox.</>
          : <>Share the claim code or link below. Your copy is also in your inbox.</>}
      </p>

      <div style={{background:"#fff",border:"1px solid rgba(195,200,188,0.3)",borderRadius:16,padding:"20px 22px",boxShadow:"0 1px 8px rgba(0,0,0,0.04)",textAlign:"left"}}>
        <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 6px"}}>Claim code</p>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 14px",background:"#F5F3EE",borderRadius:8,marginBottom:16}}>
          <span style={{fontFamily:"'SF Mono',ui-monospace,monospace",fontSize:16,fontWeight:700,color:"#213C18",letterSpacing:"0.5px"}}>{gift.code}</span>
          <button type="button" onClick={()=>copy(gift.code, "code")}
            style={{background:"transparent",border:"1px solid rgba(33,60,24,0.4)",color:"#213C18",fontFamily:F2,fontSize:10,fontWeight:700,padding:"5px 12px",borderRadius:999,cursor:"pointer",letterSpacing:"0.5px",textTransform:"uppercase"}}>
            {copied === "code" ? "Copied" : "Copy"}
          </button>
        </div>
        <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 6px"}}>Claim link</p>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 14px",background:"#F5F3EE",borderRadius:8}}>
          <span style={{fontFamily:F2,fontSize:12,color:"#54584F",wordBreak:"break-all"}}>{gift.claim_url}</span>
          <button type="button" onClick={()=>copy(gift.claim_url, "url")}
            style={{background:"transparent",border:"1px solid rgba(33,60,24,0.4)",color:"#213C18",fontFamily:F2,fontSize:10,fontWeight:700,padding:"5px 12px",borderRadius:999,cursor:"pointer",letterSpacing:"0.5px",textTransform:"uppercase",flexShrink:0}}>
            {copied === "url" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap",marginTop:24}}>
        <button onClick={()=>onSetView("gift")}
          style={{padding:"12px 24px",background:"transparent",color:"#213C18",border:"2px solid #213C18",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:"pointer"}}>
          Send another gift
        </button>
        <button onClick={()=>onSetView("home")}
          style={{padding:"12px 24px",background:"#213C18",color:"#FBF9F4",border:"none",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:"pointer"}}>
          Back to Wello
        </button>
      </div>
    </div>
  );
}

function RedeemPage({ authSession, prefilledCode = "", onSetView, onOpenSignIn, onCreditsAdded }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  const [code, setCode] = useState(prefilledCode);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { credits_added, new_balance, sender_name, sender_email }
  const [err, setErr] = useState("");

  async function submit() {
    if (!authSession) { onOpenSignIn?.(); return; }
    const clean = code.trim().toUpperCase();
    if (!clean) { setErr("Enter a claim code."); return; }
    setBusy(true); setErr("");
    try {
      const { data, error } = await supabase.functions.invoke('redeem-gift', { body: { code: clean } });
      if (error || !data?.success) {
        setErr(data?.error || error?.message || "Could not redeem this code.");
        setBusy(false);
        return;
      }
      setResult(data);
      onCreditsAdded?.(data.new_balance);
      setBusy(false);
    } catch (e) {
      setErr(e.message || "Something went wrong.");
      setBusy(false);
    }
  }

  const cardSt   = { background:"#fff", border:"1px solid rgba(195,200,188,0.3)", borderRadius:16, padding:"clamp(24px,4vw,36px)", boxShadow:"0 1px 8px rgba(0,0,0,0.04)" };
  const inputSt  = { width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"14px 18px",fontFamily:"'SF Mono',ui-monospace,monospace",fontSize:16,color:"#213C18",outline:"none",boxSizing:"border-box",background:"#FBF9F4",transition:"border-color .15s",letterSpacing:"0.5px",textTransform:"uppercase" };

  if (result) {
    const senderLabel = result.sender_name || result.sender_email || "Someone";
    return (
      <div style={{maxWidth:560,margin:"0 auto",padding:"clamp(28px,5vw,60px) clamp(16px,4vw,24px) 80px",textAlign:"center"}}>
        <div style={{width:72,height:72,margin:"0 auto 20px",borderRadius:"50%",background:"#CAECBA",border:"1px solid #A3B18A",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <Check size={34} stroke="#213C18" strokeWidth={2.6}/>
        </div>
        <h1 style={{fontFamily:F2,fontSize:"clamp(24px,3.5vw,32px)",fontWeight:800,color:"#213C18",letterSpacing:"-1px",margin:"0 0 10px",lineHeight:1.1}}>{result.credits_added} credits added.</h1>
        <p style={{fontFamily:F2,fontSize:14,color:"#54584F",lineHeight:1.6,margin:"0 0 26px"}}>{senderLabel} gifted you {result.credits_added} credits. Your new balance is <strong style={{color:"#213C18"}}>{result.new_balance}</strong>.</p>
        <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
          <button onClick={()=>onSetView("explore")}
            style={{padding:"12px 24px",background:"#213C18",color:"#FBF9F4",border:"none",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:"pointer"}}>
            Explore Wello →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{maxWidth:520,margin:"0 auto",padding:"clamp(28px,5vw,60px) clamp(16px,4vw,24px) 80px"}}>
      <p style={{fontFamily:F2,fontSize:10,fontWeight:700,color:"#A3B18A",letterSpacing:"3px",textTransform:"uppercase",margin:"0 0 10px",textAlign:"center"}}>Redeem</p>
      <h1 style={{fontFamily:F2,fontSize:"clamp(24px,3.5vw,32px)",fontWeight:800,color:"#213C18",letterSpacing:"-1px",margin:"0 0 8px",lineHeight:1.1,textAlign:"center"}}>Claim your gift</h1>
      <p style={{fontFamily:F2,fontSize:13,color:"#54584F",lineHeight:1.6,margin:"0 0 24px",textAlign:"center"}}>Enter the claim code someone sent you. Credits land on your account instantly.</p>
      <div style={cardSt}>
        <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:8}}>Claim code</label>
        <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())}
          placeholder="WELLO-XXXX-XXXX" autoFocus
          onKeyDown={e=>{ if(e.key==="Enter") submit(); }}
          style={inputSt}/>
        {err && <p style={{fontFamily:F2,fontSize:12,color:"#C46A4D",margin:"12px 0 0"}}>{err}</p>}
        {!authSession && !err && <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"12px 0 0"}}>You'll be asked to sign in before we can add the credits to your account.</p>}
        <button onClick={submit} disabled={busy}
          style={{width:"100%",padding:"14px 24px",marginTop:16,background:busy?"#E4E2DD":"#213C18",color:busy?"#54584F":"#FBF9F4",border:"none",borderRadius:999,fontFamily:F2,fontSize:14,fontWeight:700,cursor:busy?"not-allowed":"pointer"}}>
          {busy ? "Checking…" : authSession ? "Redeem" : "Sign in to redeem"}
        </button>
      </div>
    </div>
  );
}

function BusinessPortalDashboard({ onExit, bizData: bizDataProp, isPreview = true, venues = [], activeVenueId = null, onSwitchVenue, onAddVenue, addingVenue = false, onDeleteVenue, onChangeType }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  // Local mirror of the prop so in-place edits (Settings save) can update the
  // dashboard header immediately. Synced from the prop when the parent
  // re-fetches or switches venues.
  const [bizData, setBizData] = useState(() => bizDataProp || { name:"Demo Studio", cat:"Yoga", loc:"Sóller", monthlyBookings:24, monthlyCredits:86 });
  useEffect(() => { if (bizDataProp) setBizData(bizDataProp); }, [bizDataProp]);
  // Persist the active tab across remounts (navigate-away-and-back snaps the
  // dashboard back to overview otherwise). Stored per-tab not per-venue so a
  // partner who likes the Manage tab can come back to it on any venue.
  // Also migrates the legacy flat tab values (requests/schedule/listing) onto
  // the new Manage sub-tab structure so partners coming back after this
  // refactor land where they expect to.
  const [tab, setTab] = useState(() => {
    try {
      const saved = localStorage.getItem("wello_dash_tab");
      if (!saved) return "overview";
      const allowed = ["overview","manage","payouts","agreement","settings"];
      if (allowed.includes(saved)) return saved;
      if (["requests","schedule","listing"].includes(saved)) return "manage";
      return "overview";
    } catch { return "overview"; }
  });
  useEffect(() => {
    try { localStorage.setItem("wello_dash_tab", tab); } catch { /* non-critical */ }
  }, [tab]);
  // Derived: is this dashboard a private-instructor venue? Read by the
  // manageSubTab init below + the pendingRequests effect further down, so it
  // has to live above both to avoid TDZ when React runs the lazy initializer.
  const dashIsPrivate = bizData?.business_type === 'private_instructor'
    || (!bizData?.business_type && bizData?.category === 'Private Instructor');
  // Studios and spas with appointment offerings receive pending_venue
  // requests via the same request panel. Broaden the request-tab gate so
  // those venues can accept/decline without needing the private_instructor
  // classification.
  const dashHasOfferings = Array.isArray(bizData?.session_offerings) && bizData.session_offerings.length > 0;
  const dashSupportsRequests = dashIsPrivate || dashHasOfferings;
  // Sub-tab within Manage. Defaults to Requests for private instructors
  // (most actionable), Schedule for everyone else.
  const [manageSubTab, setManageSubTab] = useState(() => {
    try {
      const saved = localStorage.getItem("wello_dash_subtab");
      const allowed = ["requests","schedule","listing"];
      if (saved && allowed.includes(saved)) return saved;
      // Migrate the legacy main-tab value to a sub-tab
      const legacy = localStorage.getItem("wello_dash_tab");
      if (legacy && allowed.includes(legacy)) return legacy;
    } catch { /* fall through */ }
    return dashSupportsRequests ? "requests" : "schedule";
  });
  useEffect(() => {
    try { localStorage.setItem("wello_dash_subtab", manageSubTab); } catch { /* non-critical */ }
  }, [manageSubTab]);
  const [selDay, setSelDay] = useState(0);
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [newSlot, setNewSlot] = useState({name:"",time:"09:00",spots:10,credits:3,dur:"60 min"});
  const [editListing, setEditListing] = useState(false);
  const [listing, setListing] = useState(isPreview
    ? {name:"Demo Studio",cat:"Yoga",cat2:"Meditation",loc:"Sóller",desc:"Your venue description here.",credits:3,tags:""}
    : {
        name: bizData.name || "",
        cat:  bizData.category || bizData.cat || "",
        cat2: bizData.cat2 || "",
        loc:  bizData.location || bizData.loc || "",
        desc: bizData.description || bizData.desc || "",
        credits: bizData.cr || 3,
        tags: Array.isArray(bizData.tags) ? bizData.tags.join(", ") : (bizData.tags || ""),
      });
  const [integration, setIntegration] = useState(null);

  // ─── Real-data persistence (non-preview only) ───────────────────────────
  // Listing edit form: everything customer-facing lives here now so partners
  // have one place to change how their listing looks on the marketplace.
  const [listingForm, setListingForm] = useState({
    category:    bizData.category || bizData.cat || "",
    location:    bizData.location || bizData.loc || "",
    cr:          bizData.cr != null ? String(bizData.cr) : "",
    price_mode:  bizData.price_mode || "flat",
    description: bizData.description || bizData.desc || "",
    bio:         bizData.bio || "",
    tags:        Array.isArray(bizData.tags) ? bizData.tags.join(", ") : (bizData.tags || ""),
  });
  // Photos live separately because they need upload state to render optimistic
  // previews (localBlobUrl → remote url) and per-slot busy flags.
  const [primaryImg,        setPrimaryImg]        = useState(bizData.img || "");
  const [galleryImgs,       setGalleryImgs]       = useState(Array.isArray(bizData.gallery) ? bizData.gallery.filter(Boolean) : []);
  const [uploadingPrimary,  setUploadingPrimary]  = useState(false);
  const [uploadingGallery,  setUploadingGallery]  = useState(false);
  const [photoErr,          setPhotoErr]          = useState("");
  // Settings edit form: profile / contact fields.
  const [settingsForm, setSettingsForm] = useState({
    name:              bizData.name || "",
    description:       bizData.description || "",
    address:           bizData.address || "",
    website:           bizData.website || "",
    instagram:         bizData.instagram || "",
    phone:             bizData.phone || "",
    email:             bizData.email || "",
    bookings_whatsapp: bizData.bookings_whatsapp || "",
  });
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState({ kind:"", text:"" }); // { kind:"settings"|"listing"|"golive"|"err", text }
  const [linkedListingId, setLinkedListingId] = useState(null);
  const [dbSlots, setDbSlots]     = useState(null); // null = loading | [] = empty | [...] = loaded
  const [statusLive, setStatusLive] = useState(bizData.status === 'approved' || bizData.status === 'submitted');

  // Keep the Manage sub-tab valid when the venue type flips. Requests only
  // exists for private instructors, so a non-private venue stuck on Requests
  // would render an empty pane.
  useEffect(() => {
    if (!dashSupportsRequests && manageSubTab === "requests") setManageSubTab("schedule");
  }, [dashSupportsRequests, manageSubTab]);

  // Private-instructor specific editable state. We hydrate from bizData on
  // mount and the dashboard's key={activeVenueId} prop ensures these reset
  // when the partner switches venues.
  const [coverageAreas, setCoverageAreas] = useState(
    Array.isArray(bizData?.coverage_areas) ? bizData.coverage_areas : []
  );
  // Extended travel — places the instructor will also travel to for an
  // additional surcharge on top of the base session price.
  const [travelAreas, setTravelAreas] = useState(
    Array.isArray(bizData?.travel_areas) ? bizData.travel_areas : []
  );
  const [travelFeeEur, setTravelFeeEur] = useState(
    bizData?.travel_fee_eur != null && bizData.travel_fee_eur !== "" ? String(bizData.travel_fee_eur) : ""
  );
  const [availabilityWindows, setAvailabilityWindows] = useState(
    Array.isArray(bizData?.availability_windows) ? bizData.availability_windows : []
  );
  // Optional "I'm only taking bookings between these dates" range for
  // private instructors. Empty strings mean no bound — fall back to the
  // rolling 4-week window. Stored as YYYY-MM-DD on the businesses row.
  const [availabilityFrom, setAvailabilityFrom] = useState(bizData?.availability_from || "");
  const [availabilityTo,   setAvailabilityTo]   = useState(bizData?.availability_to   || "");
  const [sessionDurationMin, setSessionDurationMin] = useState(
    Number.isFinite(bizData?.session_duration_min) && bizData?.session_duration_min > 0
      ? bizData.session_duration_min : 60
  );
  // Mirror of session_offerings — see wizard equivalent for the shape.
  // extra_person_eur is the additional cost per extra guest beyond the first
  // person. Nullable: offerings without a value are strictly 1-to-1.
  const [dashSessionOfferings, setDashSessionOfferings] = useState(
    Array.isArray(bizData?.session_offerings) && bizData.session_offerings.length > 0
      ? bizData.session_offerings.map(o => ({
          type: o?.type || (bizData?.category || ""),
          length_min: Number.isFinite(o?.length_min) && o.length_min > 0 ? o.length_min : 60,
          price_eur:  Number.isFinite(o?.price_eur)  && o.price_eur  > 0 ? o.price_eur  : (bizData?.cr || 50),
          extra_person_eur: Number.isFinite(o?.extra_person_eur) && o.extra_person_eur > 0 ? o.extra_person_eur : null,
          max_people:       Number.isFinite(o?.max_people)       && o.max_people       > 0 ? o.max_people       : null,
        }))
      : []
  );
  const DASH_LENGTH_OPTIONS = [30, 45, 60, 75, 90, 120];
  // Inline "add new offering" form state — opens under the chip row when
  // partner taps "+ Add offering". Avoids the dense table layout entirely.
  // Whether the inline add forms are open. Default closed so the Schedule
  // tab leads with current state, not empty input fields. Open via the
  // dashed "+ Add offering" / "+ Add availability window" buttons.
  const [showAddOffering, setShowAddOffering] = useState(false);
  const [showAddWindow,   setShowAddWindow]   = useState(false);
  const [newOff, setNewOff] = useState({ type: "", length_min: 60, price_eur: 50, extra_person_eur: "", max_people: "" });
  // Inline "add new window" form state — supports multi-day in one go
  // ("Mon Wed Fri 09:00 → 12:00" creates 3 windows in one action).
  const [newWindow, setNewWindow] = useState({ days: [], start: "09:00", end: "12:00" });
  function toggleNewWindowDay(day) {
    setNewWindow(prev => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day],
    }));
  }
  function commitNewWindow() {
    if (newWindow.days.length === 0) return;
    if (newWindow.end <= newWindow.start) return;
    setAvailabilityWindows(prev => [
      ...prev,
      ...newWindow.days.map(d => ({ day: d, start: newWindow.start, end: newWindow.end })),
    ]);
    setNewWindow({ days: [], start: "09:00", end: "12:00" });
    setShowAddWindow(false);
  }
  function commitNewOffering() {
    const type = (newOff.type || "").trim();
    if (!type) return;
    const length_min = parseInt(newOff.length_min, 10) || 60;
    const price_eur  = parseInt(newOff.price_eur, 10)  || 0;
    if (price_eur <= 0) return;
    const extraRaw = parseInt(newOff.extra_person_eur, 10);
    const extra_person_eur = Number.isFinite(extraRaw) && extraRaw > 0 ? extraRaw : null;
    const maxRaw   = parseInt(newOff.max_people, 10);
    const max_people       = Number.isFinite(maxRaw)   && maxRaw   > 1 ? maxRaw   : null;
    setDashSessionOfferings(prev => [...prev, { type, length_min, price_eur, extra_person_eur, max_people }]);
    setNewOff({ type: "", length_min: 60, price_eur: 50, extra_person_eur: "", max_people: "" });
    setShowAddOffering(false);
  }
  function dashAddOffering() {
    setDashSessionOfferings(prev => [...prev, {
      type: bizData?.category || "Yoga",
      length_min: 60,
      price_eur: bizData?.cr || 50,
    }]);
  }
  function dashUpdateOffering(idx, patch) {
    setDashSessionOfferings(prev => prev.map((o, i) => i === idx ? { ...o, ...patch } : o));
  }
  function dashRemoveOffering(idx) {
    setDashSessionOfferings(prev => prev.filter((_, i) => i !== idx));
  }

  function toggleCoverageArea(loc) {
    setCoverageAreas(prev => prev.includes(loc) ? prev.filter(x => x !== loc) : [...prev, loc]);
    // If they add a place to core coverage, drop it from extended-travel so
    // the two lists never overlap.
    setTravelAreas(prev => prev.filter(x => x !== loc));
  }
  function toggleTravelArea(loc) {
    if (coverageAreas.includes(loc)) return;
    setTravelAreas(prev => prev.includes(loc) ? prev.filter(x => x !== loc) : [...prev, loc]);
  }
  function addAvailabilityWindow(day) {
    setAvailabilityWindows(prev => [...prev, { day, start: '09:00', end: '12:00' }]);
  }
  function updateAvailabilityWindow(idx, patch) {
    setAvailabilityWindows(prev => prev.map((w, i) => i === idx ? { ...w, ...patch } : w));
  }
  function removeAvailabilityWindow(idx) {
    setAvailabilityWindows(prev => prev.filter((_, i) => i !== idx));
  }

  // Private-instructor: pending booking requests awaiting confirm/decline.
  // null = loading | [] = empty | [...] = loaded. Each item is the booking
  // row joined with a minimal customer-profile blob for display.
  const [pendingRequests, setPendingRequests] = useState(null);
  const [requestsTick, setRequestsTick] = useState(0);
  // Confirmed bookings for the new Upcoming tab. Sorted by date+time so the
  // soonest session is on top. null while loading, [] when empty.
  const [upcomingBookings, setUpcomingBookings] = useState(null);
  const [respondingId, setRespondingId] = useState(null); // booking id currently being confirmed/declined

  // Map of which address has just been copied to clipboard. Booking id →
  // timestamp; we briefly flip the button from "Copy" → "Copied" so partners
  // get visual confirmation. Times out automatically after 2s.
  const [copiedBookingId, setCopiedBookingId] = useState(null);
  async function copyAddress(bookingId, text) {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers / non-https environments
        const el = document.createElement('textarea');
        el.value = text; document.body.appendChild(el);
        el.select(); document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopiedBookingId(bookingId);
      setTimeout(() => setCopiedBookingId(id => id === bookingId ? null : id), 2000);
    } catch (e) {
      console.warn('copyAddress failed:', e?.message);
    }
  }

  function flashSaveMsg(kind, text) {
    setSaveMsg({ kind, text });
    setTimeout(() => setSaveMsg(m => (m.kind === kind ? { kind:"", text:"" } : m)), 3000);
  }

  // Load the partner's linked listing_id and its slot rows on mount.
  useEffect(() => {
    if (isPreview || !bizData?.id) return;
    let cancelled = false;
    (async () => {
      const { data: linked } = await supabase
        .from('listings').select('id').eq('business_id', bizData.id).limit(1).maybeSingle();
      if (cancelled) return;
      const lid = linked?.id ?? null;
      setLinkedListingId(lid);
      if (lid) {
        const { data: rows } = await supabase
          .from('slots').select('*').eq('listing_id', lid).order('date').order('time');
        if (!cancelled) setDbSlots(rows || []);
      } else {
        setDbSlots([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isPreview, bizData?.id]);

  // Private-instructor only: load pending booking requests for this venue so
  // the Requests tab has something to render. Re-runs whenever requestsTick
  // bumps (after a confirm/decline).
  useEffect(() => {
    if (isPreview || !bizData?.id || !dashSupportsRequests) { setPendingRequests([]); return; }
    let cancelled = false;
    (async () => {
      const { data: rows, error } = await supabase
        .from('bookings')
        .select('id, user_id, slot_id, booking_date, start_time, duration, credits_used, notes, status, offering_type, created_at')
        .eq('business_id', bizData.id)
        .in('status', ['pending_instructor', 'pending_venue'])
        .order('created_at', { ascending: true });
      if (error) {
        console.error('pendingRequests query error:', error.message);
        if (!cancelled) setPendingRequests([]);
        return;
      }
      // Fetch the customer profile names for display in one batch.
      const uids = [...new Set((rows || []).map(r => r.user_id).filter(Boolean))];
      let profileMap = {};
      if (uids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles').select('id, full_name, email, phone').in('id', uids);
        for (const p of (profs || [])) profileMap[p.id] = p;
      }
      const enriched = (rows || []).map(r => ({ ...r, _customer: profileMap[r.user_id] || null }));
      if (!cancelled) setPendingRequests(enriched);
    })();
    return () => { cancelled = true; };
  }, [isPreview, bizData?.id, dashSupportsRequests, requestsTick]);

  // Confirmed-and-upcoming bookings for this venue. Re-runs on requestsTick
  // bumps so a just-confirmed request flows straight into the Upcoming list.
  useEffect(() => {
    if (isPreview || !bizData?.id) { setUpcomingBookings([]); return; }
    let cancelled = false;
    (async () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: rows, error } = await supabase
        .from('bookings')
        .select('id, user_id, slot_id, booking_date, start_time, duration, credits_used, notes, status, created_at')
        .eq('business_id', bizData.id)
        .eq('status', 'confirmed')
        .gte('booking_date', todayStr)
        .order('booking_date', { ascending: true })
        .order('start_time',  { ascending: true });
      if (error) {
        console.error('upcomingBookings query error:', error.message);
        if (!cancelled) setUpcomingBookings([]);
        return;
      }
      // Customer name lookup so we can show "Maria" instead of a uuid.
      const uids = [...new Set((rows || []).map(r => r.user_id).filter(Boolean))];
      let profileMap = {};
      if (uids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles').select('id, full_name, email, phone').in('id', uids);
        for (const p of (profs || [])) profileMap[p.id] = p;
      }
      // Also pull the slot names so we can show "Yoga · 60 min" alongside the time.
      const slotIds = [...new Set((rows || []).map(r => r.slot_id).filter(Boolean))];
      let slotMap = {};
      if (slotIds.length > 0) {
        const { data: slotRows } = await supabase
          .from('slots').select('id, name').in('id', slotIds);
        for (const s of (slotRows || [])) slotMap[String(s.id)] = s.name;
      }
      const enriched = (rows || []).map(r => ({
        ...r,
        _customer: profileMap[r.user_id] || null,
        _slot_name: slotMap[String(r.slot_id)] || null,
      }));
      if (!cancelled) setUpcomingBookings(enriched);
    })();
    return () => { cancelled = true; };
  }, [isPreview, bizData?.id, requestsTick]);

  async function respondToRequest(bookingId, action, status) {
    if (!bookingId || respondingId) return;
    setRespondingId(bookingId);
    // Route to the per-status handler. pending_instructor stays with
    // instructor-booking-response; pending_venue (studio/spa appointment
    // requests) go through venue-booking-response, which has the same
    // {action, booking_id} JSON contract.
    const fn = status === 'pending_venue' ? 'venue-booking-response' : 'instructor-booking-response';
    const { data, error } = await supabase.functions.invoke(fn, {
      body: { booking_id: bookingId, action },
    });
    setRespondingId(null);
    if (error) {
      console.error(fn + ' error:', error.message);
      flashSaveMsg('err', "Couldn't send your response. " + error.message);
      return;
    }
    if (data?.error) {
      console.error(fn + ' server error:', data.error);
      flashSaveMsg('err', data.error);
      return;
    }
    flashSaveMsg(action === 'confirm' ? 'golive' : 'settings', action === 'confirm' ? 'Booking confirmed.' : 'Booking declined.');
    setRequestsTick(t => t + 1);
  }

  async function saveSettings() {
    if (isPreview || !bizData?.id) return;
    setSaving(true);
    const payload = {
      name:              settingsForm.name.trim() || null,
      description:       settingsForm.description || null,
      address:           settingsForm.address || null,
      website:           settingsForm.website || null,
      instagram:         settingsForm.instagram || null,
      phone:             settingsForm.phone || null,
      email:             settingsForm.email.trim() || bizData.email, // keep email if cleared
      bookings_whatsapp: settingsForm.bookings_whatsapp.trim() || null,
    };
    const { error } = await supabase.from('businesses').update(payload).eq('id', bizData.id);
    if (!error) {
      // Mirror customer-visible fields onto the live listings row so the
      // marketplace card / search / venue page pick up the rename without
      // waiting for the next approval cycle.
      await supabase.from('listings')
        .update({ name: payload.name, description: payload.description })
        .eq('business_id', bizData.id);
      // Refresh local state so the dashboard header reflects the new name
      // immediately (rather than only after a reload).
      setBizData(prev => ({ ...prev, ...payload }));
    }
    setSaving(false);
    if (error) flashSaveMsg("err", "Couldn't save. " + error.message);
    else flashSaveMsg("settings", "Settings saved.");
  }

  async function saveListing() {
    if (isPreview || !bizData?.id) return;
    setSaving(true);
    const crNum = parseInt(listingForm.cr);
    const tagsArr = (listingForm.tags || "")
      .split(",").map(t => t.trim()).filter(Boolean).slice(0, 8);
    const { error } = await supabase.from('businesses').update({
      category:    listingForm.category    || null,
      location:    listingForm.location    || null,
      cr:          Number.isFinite(crNum) && crNum > 0 ? crNum : null,
      price_mode:  listingForm.price_mode  || 'flat',
      description: listingForm.description || null,
      bio:         listingForm.bio         || null,
      tags:        tagsArr.length > 0 ? tagsArr : null,
      img:         primaryImg || null,
      gallery:     galleryImgs.length > 0 ? galleryImgs : null,
    }).eq('id', bizData.id);
    // Mirror customer-visible fields onto the live listings row so the
    // marketplace card + Explore filters update immediately rather than
    // waiting for the next admin approval cycle.
    if (!error) {
      const listingPatch = {};
      if (listingForm.category)    listingPatch.category    = listingForm.category;
      if (listingForm.location)    listingPatch.location    = listingForm.location;
      if (listingForm.description) listingPatch.description = listingForm.description;
      if (tagsArr.length > 0)      listingPatch.tags        = tagsArr;
      if (primaryImg)              listingPatch.img         = primaryImg;
      if (Number.isFinite(crNum) && crNum > 0) listingPatch.cr = crNum;
      if (Object.keys(listingPatch).length > 0) {
        await supabase.from('listings').update(listingPatch).eq('business_id', bizData.id);
      }
    }
    setSaving(false);
    if (error) flashSaveMsg("err", "Couldn't save. " + error.message);
    else flashSaveMsg("listing", "Listing saved.");
  }

  // Photo upload helpers reused by the My Listing photo editor. Storage
  // path convention matches the wizard so the delete-venue cleanup in
  // deleteVenue continues to find and remove these files.
  async function uploadPhotoFile(file, slot) {
    if (isPreview || !bizData?.id) return { url: null, error: "Preview mode" };
    if (!/^image\//.test(file.type)) return { url: null, error: "That's not an image file." };
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return { url: null, error: "Not signed in." };
    const path = `${uid}/${bizData.id}-${slot}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('venue-photos').upload(path, file, { contentType: file.type, upsert: true });
    if (error) return { url: null, error: error.message };
    const url = supabase.storage.from('venue-photos').getPublicUrl(path).data.publicUrl;
    return { url, error: null };
  }
  async function handlePrimaryPhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoErr(""); setUploadingPrimary(true);
    const { url, error } = await uploadPhotoFile(file, 'primary');
    setUploadingPrimary(false);
    if (error) { setPhotoErr("Couldn't upload primary photo. " + error); return; }
    setPrimaryImg(url);
    // Persist immediately so a partner who edits then navigates away doesn't
    // lose the upload. Also mirror to listings so Explore updates.
    await supabase.from('businesses').update({ img: url }).eq('id', bizData.id);
    await supabase.from('listings').update({ img: url }).eq('business_id', bizData.id);
    setBizData(prev => ({ ...prev, img: url }));
  }
  async function handleAddGalleryPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (galleryImgs.length >= 4) { setPhotoErr("Up to 4 gallery photos."); return; }
    setPhotoErr(""); setUploadingGallery(true);
    const { url, error } = await uploadPhotoFile(file, `gallery-${galleryImgs.length}`);
    setUploadingGallery(false);
    if (error) { setPhotoErr("Couldn't upload gallery photo. " + error); return; }
    const next = [...galleryImgs, url];
    setGalleryImgs(next);
    await supabase.from('businesses').update({ gallery: next }).eq('id', bizData.id);
    setBizData(prev => ({ ...prev, gallery: next }));
  }
  async function removeGalleryPhoto(idx) {
    const url = galleryImgs[idx];
    const next = galleryImgs.filter((_, i) => i !== idx);
    setGalleryImgs(next);
    // Save the change to DB immediately so the removal persists.
    await supabase.from('businesses').update({ gallery: next }).eq('id', bizData.id);
    setBizData(prev => ({ ...prev, gallery: next }));
    // Best-effort storage cleanup — don't block on failure.
    try {
      const marker = "/venue-photos/";
      const idxMark = url.indexOf(marker);
      if (idxMark >= 0) {
        const path = url.slice(idxMark + marker.length);
        await supabase.storage.from('venue-photos').remove([path]);
      }
    } catch { /* non-critical */ }
  }

  // Private-instructor only. Saves coverage areas to businesses and mirrors
  // them onto the live listings row + recomputes the listings.loc display
  // string (used by the explore card "📍 Palma, Sóller +2" line).
  async function saveCoverageAreas() {
    if (isPreview || !bizData?.id) return;
    setSaving(true);
    const displayLoc = coverageAreas.length === 0
      ? (bizData.location ?? null)
      : (coverageAreas.length <= 3
          ? coverageAreas.join(', ')
          : `${coverageAreas.slice(0,3).join(', ')} +${coverageAreas.length - 3}`);
    const feeParsed = parseInt(travelFeeEur, 10);
    const feePayload = Number.isFinite(feeParsed) && feeParsed > 0 ? feeParsed : null;
    const { error: bizErr } = await supabase.from('businesses')
      .update({
        coverage_areas: coverageAreas,
        travel_areas:   travelAreas,
        travel_fee_eur: feePayload,
      })
      .eq('id', bizData.id);
    if (!bizErr) {
      // Mirror onto listings so the customer-facing card + BizPanel show
      // the extended-travel note without waiting for a re-approval cycle.
      await supabase.from('listings')
        .update({
          coverage_areas: coverageAreas,
          loc: displayLoc,
          travel_areas:   travelAreas,
          travel_fee_eur: feePayload,
        })
        .eq('business_id', bizData.id);
      setBizData(prev => ({ ...prev, coverage_areas: coverageAreas, travel_areas: travelAreas, travel_fee_eur: feePayload }));
    }
    setSaving(false);
    if (bizErr) flashSaveMsg("err", "Couldn't save coverage areas. " + bizErr.message);
    else flashSaveMsg("listing", "Coverage and travel updated.");
  }

  // Private-instructor only. Saves windows + session length, then re-expands
  // them into concrete slot rows for the next 4 weeks. Mirrors the logic in
  // notify-partner-status so the partner sees changes reflected immediately
  // without waiting for an admin re-approval.
  async function saveAvailability() {
    if (isPreview || !bizData?.id) return;
    setSaving(true);
    // .select() so we can detect the silent-zero-rows case (Supabase RLS
    // blocking the UPDATE without throwing). Without it a policy mismatch
    // returns error=null and we'd regenerate slots + tell the partner
    // everything saved, but businesses.session_offerings would still be empty
    // → offerings vanish from Manage Schedule on next mount.
    const { data: bizUpdated, error: bizErr } = await supabase.from('businesses').update({
      availability_windows: availabilityWindows,
      session_duration_min: sessionDurationMin,
      session_offerings: dashSessionOfferings,
      availability_from: availabilityFrom || null,
      availability_to:   availabilityTo   || null,
    }).eq('id', bizData.id).select('id');
    if (bizErr) {
      setSaving(false);
      flashSaveMsg("err", "Couldn't save availability. " + bizErr.message);
      return;
    }
    if (!bizUpdated || bizUpdated.length === 0) {
      setSaving(false);
      console.warn('saveAvailability: 0 rows updated on businesses. Check RLS policy: create policy "Partners can update own venue" on businesses for update to authenticated using (user_id = auth.uid());');
      flashSaveMsg("err", "Your availability couldn't be saved — an RLS policy on the businesses table is blocking the update. Contact hello@wello-wellness.com.");
      return;
    }
    // Regenerate slot rows: delete old, expand new windows × offerings.
    if (linkedListingId) {
      await supabase.from('slots').delete().eq('listing_id', linkedListingId);
      const DAY_IDX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
      const today = new Date();
      const LEAD_MS = 4 * 24 * 60 * 60 * 1000;
      const minBookable = new Date(Date.now() + LEAD_MS);
      // Resolve the expansion horizon. No range = rolling 4 weeks (today's
      // behaviour). Range set = honour it, capped at 26 weeks (6 months) to
      // keep slot counts sane.
      const HARD_CAP_MS = 26 * 7 * 24 * 60 * 60 * 1000;
      const rangeFrom = availabilityFrom ? new Date(availabilityFrom + "T00:00:00") : null;
      const rangeTo   = availabilityTo   ? new Date(availabilityTo   + "T23:59:59") : null;
      const horizonStart = rangeFrom && rangeFrom > minBookable ? rangeFrom : minBookable;
      const defaultEnd   = new Date(Date.now() + 4 * 7 * 24 * 60 * 60 * 1000);
      const hardCap      = new Date(Date.now() + HARD_CAP_MS);
      const horizonEnd   = rangeTo ? (rangeTo < hardCap ? rangeTo : hardCap) : defaultEnd;
      const fallbackCr = listingForm.cr ? (parseInt(listingForm.cr) || (bizData.cr ?? 60)) : (bizData.cr ?? 60);
      // If the partner hasn't filled in any offerings yet, fall back to a
      // single offering built from the legacy duration + price pair so we
      // still generate something they can preview.
      const offerings = (dashSessionOfferings && dashSessionOfferings.length > 0)
        ? dashSessionOfferings
        : [{ type: bizData?.category || 'Private session', length_min: sessionDurationMin, price_eur: fallbackCr }];
      const slotRows = [];
      // Walk every day from horizonStart through horizonEnd. For each day,
      // check every availability window whose weekday matches and emit slots.
      // This is O(days × windows × offerings) rather than the old fixed
      // 4-week-rolling loop so a partner-defined range "just works".
      const dayCursor = new Date(horizonStart);
      dayCursor.setHours(0, 0, 0, 0);
      const horizonEndDay = new Date(horizonEnd);
      horizonEndDay.setHours(0, 0, 0, 0);
      while (dayCursor <= horizonEndDay) {
        const dow = dayCursor.getDay();
        for (const w of availabilityWindows) {
          const dayIdx = DAY_IDX[w.day];
          if (dayIdx === undefined || dayIdx !== dow) continue;
          const [sH, sM] = String(w.start || '09:00').split(':').map(x => parseInt(x, 10));
          const [eH, eM] = String(w.end   || '18:00').split(':').map(x => parseInt(x, 10));
          const startMin = sH * 60 + sM;
          const endMin   = eH * 60 + eM;
          if (endMin <= startMin) continue;
          const d = new Date(dayCursor);
          for (const off of offerings) {
            const dur = off.length_min;
            for (let mins = startMin; mins + dur <= endMin; mins += dur) {
              const slotDateTime = new Date(d);
              slotDateTime.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
              if (slotDateTime < minBookable) continue;
              const hh = String(Math.floor(mins / 60)).padStart(2, '0');
              const mm = String(mins % 60).padStart(2, '0');
              slotRows.push({
                listing_id: linkedListingId,
                name: `${off.type} · ${dur} min`,
                date: d.toISOString().slice(0, 10),
                time: `${hh}:${mm}`,
                dur: `${dur} min`,
                spots: 1,
                booked: 0,
                credits: off.price_eur,
                acuity_type_id: null,
              });
            }
          }
        }
        dayCursor.setDate(dayCursor.getDate() + 1);
      }
      if (slotRows.length > 0) {
        // .select() returns the inserted rows so we can detect the
        // RLS-silent-zero-rows case (insert succeeds but blocked → 0 rows).
        const { data: insertedRows, error: insErr } = await supabase
          .from('slots').insert(slotRows).select('id');
        if (insErr) {
          console.error('saveAvailability: slot insert failed', insErr.message);
          setSaving(false);
          flashSaveMsg("err", "Couldn't insert slots — " + insErr.message);
          return;
        }
        if (!insertedRows || insertedRows.length === 0) {
          console.warn('saveAvailability: 0 slot rows inserted — likely RLS blocking. Check the "Partners can insert own slots" policy on slots.');
          setSaving(false);
          flashSaveMsg("err", "Slots couldn't be saved — your DB needs the slots INSERT policy keyed to user_id.");
          return;
        }
        // Re-pull dbSlots so the UI reflects the new state without a refresh.
        const { data: rows } = await supabase
          .from('slots').select('*').eq('listing_id', linkedListingId).order('date').order('time');
        setDbSlots(rows || []);
      } else {
        setDbSlots([]);
      }
    }
    setSaving(false);
    const slotCount = (dbSlots && dbSlots.length) || 0;
    flashSaveMsg("settings", `Availability saved. ${availabilityWindows.length} window${availabilityWindows.length === 1 ? '' : 's'} live · ${slotCount} bookable slot${slotCount === 1 ? '' : 's'} generated.`);
  }

  async function goLive() {
    if (isPreview || !bizData?.id) return;
    // Gate 1: partner has to accept the current Partner Agreement before we
    // let their venue go live. Force-open the agreement modal so they can.
    if (!bizData?.terms_accepted_at) {
      setShowAgreementRef(true);
      return;
    }
    // Gate 2: Stripe Connect onboarding must be active before submission.
    // Without an active connected account we have nowhere to send the
    // partner's payouts, and the Partner Agreement commits us to weekly
    // Stripe payouts (clause 6.4). Show a clear toast + jump the wizard
    // back to step 6 so the fix is one click away. Guarded by
    // STRIPE_GATE_ENABLED so we can merge this feature without stranding
    // partners who register before Connect is live on the platform account.
    if (STRIPE_GATE_ENABLED && bizData?.stripe_account_status !== 'active') {
      flashSaveMsg('err', "Complete Stripe payout setup before submitting your listing.");
      setStep(6);
      window.scrollTo(0, 0);
      return;
    }
    if (!confirm("Submit your listing for review? The Wello team will email you within 2 working days.")) return;
    setSaving(true);
    const { error } = await supabase.from('businesses').update({ status: 'submitted' }).eq('id', bizData.id);
    setSaving(false);
    if (error) flashSaveMsg("err", "Couldn't submit. " + error.message);
    else { setStatusLive(true); flashSaveMsg("golive", "Submitted for review. Watch your inbox."); }
  }

  // Pause a live listing — hides it from the marketplace but keeps the
  // dashboard fully accessible. Resume flips it back to approved which
  // triggers notify-partner-status to reactivate + regenerate slots.
  async function pauseListing() {
    if (isPreview || !bizData?.id) return;
    if (!confirm("Pause your listing? Customers will no longer see it or book new sessions until you resume. Existing confirmed bookings are unaffected.")) return;
    setSaving(true);
    const { error } = await supabase.from('businesses').update({ status: 'paused' }).eq('id', bizData.id);
    if (!error) {
      // Belt-and-braces: also flip the listing to inactive from the client so
      // Explore hides the venue immediately even if the notify-partner-status
      // webhook hasn't fired yet. Non-fatal if RLS blocks — the webhook will
      // catch up on its own.
      await supabase.from('listings').update({ status: 'inactive' }).eq('business_id', bizData.id);
      setBizData(prev => ({ ...prev, status: 'paused' }));
    }
    setSaving(false);
    if (error) flashSaveMsg("err", "Couldn't pause. " + error.message);
    else { setStatusLive(false); flashSaveMsg("settings", "Listing paused. Resume any time from Settings."); }
  }
  async function resumeListing() {
    if (isPreview || !bizData?.id) return;
    setSaving(true);
    const { error } = await supabase.from('businesses').update({ status: 'approved' }).eq('id', bizData.id);
    if (!error) {
      // Reactivate the listing on the marketplace immediately too, mirroring
      // the pause path so we don't wait on the webhook.
      await supabase.from('listings').update({ status: 'active' }).eq('business_id', bizData.id);
      setBizData(prev => ({ ...prev, status: 'approved' }));
    }
    setSaving(false);
    if (error) flashSaveMsg("err", "Couldn't resume. " + error.message);
    else { setStatusLive(true); flashSaveMsg("golive", "Listing resumed. Back live on the marketplace."); }
  }

  // ─── Partner Agreement handlers ─────────────────────────────────────
  // Derived agreement state — computed from bizData so it stays in sync.
  // Fall back to the older `commission` column (integer) so partners that
  // were configured before the commission_rate migration still render a
  // rate here without needing a data backfill.
  const commissionRaw = (bizData?.commission_rate != null && bizData?.commission_rate !== "")
    ? bizData.commission_rate
    : bizData?.commission;
  const hasCommission          = commissionRaw != null && commissionRaw !== "";
  const commissionRateNum      = Number(commissionRaw);
  const commissionRateDisplay  = hasCommission && Number.isFinite(commissionRateNum)
    ? (Number.isInteger(commissionRateNum) ? `${commissionRateNum}%` : `${commissionRateNum}%`)
    : null;
  const agreementAccepted      = !!bizData?.terms_accepted_at;
  const acceptedCommission     = bizData?.terms_accepted_commission == null ? null : Number(bizData.terms_accepted_commission);
  const acceptedVersion        = bizData?.terms_version || null;
  // Needs re-acceptance when either (a) the commission rate has changed since
  // acceptance or (b) the version recorded on the row does not match the
  // current TERMS_VERSION. A null acceptedVersion also counts as outdated:
  // those rows accepted before the version-write path was reliable and have
  // no audit trail tying them to a specific terms version, so the safe legal
  // default is to prompt them to re-accept the current text.
  const versionOutdated        = agreementAccepted && acceptedVersion !== TERMS_VERSION;
  const commissionChanged      = agreementAccepted && hasCommission && Number.isFinite(acceptedCommission)
    && Number(commissionRateNum) !== Number(acceptedCommission);
  const needsReacceptance      = commissionChanged || versionOutdated;
  const [agreementSaving, setAgreementSaving] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [agreementErr,     setAgreementErr]     = useState("");
  // Blocker fires whenever an approved venue hasn't accepted the current
  // agreement yet — modal is non-dismissible. Reference-mode is opened from
  // Settings ("View partner agreement") and IS dismissible.
  const [showAgreementRef, setShowAgreementRef] = useState(false);
  const agreementBlocker = !isPreview
    && bizData?.status === 'approved'
    && (!agreementAccepted || needsReacceptance);
  const agreementModalOpen = agreementBlocker || showAgreementRef;
  const agreementCanDismiss = !agreementBlocker && agreementAccepted && !needsReacceptance;
  async function acceptAgreement() {
    if (isPreview || !bizData?.id) return;
    if (!hasCommission) { setAgreementErr("Your commercial terms haven't been set yet. Please wait for the Wello team to confirm your commission rate."); return; }
    if (!agreementChecked) { setAgreementErr("Please tick the box to confirm you've read the agreement."); return; }
    // Guard: commissionRateNum can be NaN if commissionRaw was something like
    // "" or 'null'. Saving NaN would poison terms_accepted_commission and force
    // a re-acceptance on next login even though the user really did accept.
    if (!Number.isFinite(commissionRateNum)) {
      setAgreementErr("Your commission rate isn't a valid number yet. Please contact Wello.");
      return;
    }
    setAgreementSaving(true); setAgreementErr("");
    const payload = {
      terms_accepted_at:         new Date().toISOString(),
      terms_version:             TERMS_VERSION,
      terms_accepted_commission: commissionRateNum,
    };
    // .select() so we can detect the silent-zero-rows case (Supabase RLS
    // blocking the UPDATE without throwing). Without it a policy mismatch
    // returns error=null and we'd optimistically flip local state — the modal
    // vanishes for this session and pops up again on next login because
    // nothing persisted to the DB.
    const { data: updated, error } = await supabase
      .from('businesses').update(payload).eq('id', bizData.id).select('id, terms_accepted_at');
    setAgreementSaving(false);
    if (error) { setAgreementErr("Couldn't save your acceptance. " + error.message); return; }
    if (!updated || updated.length === 0) {
      setAgreementErr("Your acceptance couldn't be saved. This usually means an RLS policy on the businesses table is blocking the update. Contact hello@wello-wellness.com.");
      console.warn('acceptAgreement: 0 rows updated. Check RLS policy: create policy "Partners can update own venue" on businesses for update to authenticated using (user_id = auth.uid());');
      return;
    }
    // Now that the agreement is accepted, activate the marketplace listing.
    // (notify-partner-status intentionally leaves it inactive on approval
    // until acceptance lands, so this is where the venue actually goes live.)
    await supabase.from('listings').update({ status: 'active' }).eq('business_id', bizData.id);
    setBizData(prev => ({ ...prev, ...payload }));
    setAgreementChecked(false);
    setShowAgreementRef(false);
  }
  function printAgreement() {
    if (!bizData) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const legalName = bizData.legal_name || bizData.name || "";
    const tradingName = bizData.name || "";
    const businessType = bizData.business_type || bizData.category || "";
    const address = bizData.address || "";
    const email = bizData.email || "";
    const phone = bizData.phone || "";
    const foundingLine = bizData.founding_partner
      ? `Yes${bizData.founding_incentive_bookings ? ` — no commission payable on your first ${bizData.founding_incentive_bookings} completed bookings` : ''}`
      : 'No';
    const coverageLine = Array.isArray(bizData.coverage_areas) && bizData.coverage_areas.length > 0
      ? bizData.coverage_areas.join(', ')
      : '—';
    const acceptedAt = bizData.terms_accepted_at
      ? new Date(bizData.terms_accepted_at).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })
      : 'Not yet accepted';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Wello Partner Agreement — ${tradingName}</title>
      <style>
        @page { margin: 20mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Manrope', system-ui, sans-serif; color: #1B1C19; line-height: 1.65; font-size: 13px; max-width: 720px; margin: 0 auto; padding: 24px; }
        h1 { font-size: 22px; color: #213C18; letter-spacing: -0.5px; margin: 0 0 6px; }
        h2 { font-size: 16px; color: #213C18; margin: 26px 0 10px; letter-spacing: -0.2px; }
        h3 { font-size: 13px; color: #54584F; text-transform: uppercase; letter-spacing: 1.5px; margin: 20px 0 8px; }
        p  { margin: 0 0 10px; }
        table { width: 100%; border-collapse: collapse; margin: 6px 0 18px; }
        td { padding: 6px 10px; font-size: 12px; border-bottom: 1px solid #E4E2DD; vertical-align: top; }
        td.k { color: #54584F; width: 42%; }
        .meta { color: #54584F; font-size: 11px; margin-bottom: 20px; }
        .accepted { padding: 12px 14px; background: #F5F3EE; border: 1px solid #A3B18A; border-radius: 6px; margin: 20px 0; font-size: 12px; }
      </style></head><body>
      <h1>Wello Partner Agreement</h1>
      <p class="meta">Version ${TERMS_VERSION} · Rendered ${new Date().toLocaleString('en-GB')}</p>
      <h3>Schedule 1 — Commercial terms</h3>
      <table>
        <tr><td class="k">Partner legal name</td><td>${legalName}</td></tr>
        <tr><td class="k">Trading name</td><td>${tradingName}</td></tr>
        <tr><td class="k">Business type</td><td>${businessType}</td></tr>
        <tr><td class="k">Address</td><td>${address}</td></tr>
        <tr><td class="k">Email</td><td>${email}</td></tr>
        <tr><td class="k">Phone</td><td>${phone}</td></tr>
        <tr><td class="k">Commission rate</td><td>${commissionRateDisplay ? `${commissionRateDisplay} of the Session Value of each completed Booking` : 'To be confirmed by Wello before you go live'}</td></tr>
        <tr><td class="k">Founding Partner</td><td>${foundingLine}</td></tr>
        <tr><td class="k">Payout method</td><td>Stripe Connect transfer in EUR</td></tr>
        <tr><td class="k">Payout frequency</td><td>Weekly</td></tr>
        <tr><td class="k">Coverage areas</td><td>${coverageLine}</td></tr>
      </table>
      ${AGREEMENT_SECTIONS.map(s => `<h2>${s.id}. ${s.title}</h2>${s.body.map(p => `<p>${p.replace(/</g,'&lt;')}</p>`).join('')}`).join('')}
      <div class="accepted"><strong>Accepted:</strong> ${acceptedAt}${bizData.terms_version ? ` · Version ${bizData.terms_version}` : ''}${acceptedCommission != null ? ` · Commission ${acceptedCommission}%` : ''}</div>
    </body></html>`;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { try { win.print(); } catch { /* ignore */ } }, 200);
  }

  // For Add slot: convert a 0-6 weekday index (Mon=0) to an ISO date string for THIS week.
  function dateForWeekday(dayIdx) {
    const today  = new Date();
    const dow    = today.getDay(); // 0=Sun..6=Sat
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    const target = new Date(monday);
    target.setDate(monday.getDate() + dayIdx);
    return target.toISOString().slice(0, 10);
  }

  async function addSlotDb(slotData) {
    if (isPreview || !linkedListingId) {
      flashSaveMsg("err", "Your listing isn't live yet — slot management opens after approval.");
      return false;
    }
    const payload = {
      listing_id: linkedListingId,
      name:       slotData.name || "",
      date:       slotData.date || dateForWeekday(selDay),
      time:       slotData.time || "09:00",
      dur:        slotData.dur || "60 min",
      spots:      +slotData.spots || 10,
      booked:     0,
      credits:    +slotData.credits || (parseInt(listingForm.cr) || 3),
    };
    const { data, error } = await supabase.from('slots').insert(payload).select().single();
    if (error) { flashSaveMsg("err", "Couldn't add slot. " + error.message); return false; }
    setDbSlots(s => [...(s || []), data]);
    return true;
  }

  async function togglePausedDb(slotId, isCurrentlyLive) {
    if (isPreview) return;
    const { data, error } = await supabase.from('slots').update({ paused: isCurrentlyLive }).eq('id', slotId).select().single();
    if (error) { flashSaveMsg("err", "Couldn't update slot. " + error.message); return; }
    setDbSlots(s => (s || []).map(x => (x.id === slotId ? data : x)));
  }

  async function removeSlotDb(slotId) {
    if (isPreview) return;
    if (!confirm("Remove this slot? Bookings on it would need to be cancelled separately.")) return;
    const { error } = await supabase.from('slots').delete().eq('id', slotId);
    if (error) { flashSaveMsg("err", "Couldn't remove slot. " + error.message); return; }
    setDbSlots(s => (s || []).filter(x => x.id !== slotId));
  }

  // Manage groups Requests (private only), Schedule and My Listing so partners
  // see one place for all day-to-day operations. Confirmed bookings still show
  // inline on Overview in the Live bookings panel.
  const TABS = [["overview","Overview"],["manage","Manage"],["payouts","Payouts"],["settings","Settings"]];
  // Sub-tabs inside Manage. Private instructors + venues with appointment
  // offerings get the Requests tab (they receive pending_venue requests
  // through the same panel).
  const MANAGE_SUBTABS = dashSupportsRequests
    ? [["requests","Requests"],["schedule","Schedule"],["listing","My Listing"]]
    : [["schedule","Schedule"],["listing","My Listing"]];

  const WEEK_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  // Compute the current Mon→Sun week as "14 Apr"-style labels — always live so dates never go stale.
  const WEEK_DATES = (()=>{
    const today = new Date();
    const dow = today.getDay(); // 0=Sun..6=Sat
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    const fmt = new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'short' });
    return Array.from({length:7}, (_,i)=>{
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return fmt.format(d);
    });
  })();

  // Preview: curated demo schedule. Real partners: derive from dbSlots (the
  // slots table) so add/pause/remove operate on persisted rows.
  const PREVIEW_CLS = [
    {id:1,day:0,time:"07:00",name:"Sunrise Flow",   spots:8, booked:6, credits:3, dur:"60 min", live:true},
    {id:2,day:0,time:"18:30",name:"Sunset Vinyasa", spots:10,booked:8, credits:15, dur:"75 min", live:true},
    {id:3,day:1,time:"09:00",name:"Morning Yin",    spots:8, booked:3, credits:2, dur:"60 min", live:true},
    {id:4,day:2,time:"07:00",name:"Sunrise Flow",   spots:8, booked:8, credits:3, dur:"60 min", live:true},
    {id:5,day:2,time:"18:30",name:"Sunset Vinyasa", spots:10,booked:5, credits:15, dur:"75 min", live:true},
    {id:6,day:3,time:"07:00",name:"Sunrise Flow",   spots:8, booked:2, credits:3, dur:"60 min", live:true},
    {id:7,day:3,time:"12:00",name:"Lunchtime Flow", spots:6, booked:6, credits:12, dur:"45 min", live:false},
    {id:8,day:4,time:"07:00",name:"Sunrise Flow",   spots:8, booked:7, credits:3, dur:"60 min", live:true},
    {id:9,day:5,time:"09:00",name:"Weekend Flow",   spots:12,booked:10,credits:15, dur:"90 min", live:true},
    {id:10,day:6,time:"09:00",name:"Weekend Flow",  spots:12,booked:12,credits:3, dur:"90 min", live:true},
  ];
  const [previewCLS, setPreviewCLS] = useState(PREVIEW_CLS);
  // Map a date string YYYY-MM-DD to a Mon=0..Sun=6 weekday index.
  function weekdayIdxFromDate(d) {
    const dow = new Date(d + "T00:00:00").getDay(); // Sun=0..Sat=6
    return dow === 0 ? 6 : dow - 1; // Mon=0..Sun=6
  }
  // Group recurring classes so the Schedule tab shows one card per
  // (day, time, name) instead of 52 copies (once per calendar week of the
  // 52-week expansion horizon). The card carries the NEXT upcoming
  // instance's spots/booked so the partner sees how full their next
  // class is, not a stale row from months ago.
  const CLS = isPreview
    ? previewCLS
    : (() => {
        const rows = dbSlots || [];
        const todayIso = new Date().toISOString().slice(0, 10);
        // Only consider today-or-later instances so a partner mid-week
        // does not see a "Mon" card showing last Monday's booked count.
        // Sort ascending so the first-seen row per key is the earliest.
        const upcoming = rows
          .filter(s => (s.date || '') >= todayIso)
          .sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const seen = new Set();
        const grouped = [];
        for (const s of upcoming) {
          const day = weekdayIdxFromDate(s.date);
          const key = `${day}_${s.time}_${s.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          grouped.push({
            id:      s.id,
            day,
            time:    s.time,
            name:    s.name,
            spots:   s.spots,
            booked:  s.booked,
            credits: s.credits,
            dur:     s.dur,
            live:    !s.paused,
          });
        }
        return grouped;
      })();
  // Preview-mode local mutation helpers (no DB writes; demo only).
  function setCLS(updater) {
    if (!isPreview) return; // real-partner CRUD goes through DB helpers
    setPreviewCLS(typeof updater === 'function' ? updater : () => updater);
  }

  const RECENT = isPreview ? [
    {initials:"SM",name:"Sarah M.",  cls:"Sunrise Flow",   when:"Today 07:00",     cr:15,status:"Confirmed"},
    {initials:"JT",name:"James T.",  cls:"Sunset Vinyasa", when:"Today 18:30",     cr:15,status:"Confirmed"},
    {initials:"AK",name:"Anna K.",   cls:"Weekend Flow",   when:"Sat 19 Apr 09:00",cr:15,status:"Confirmed"},
    {initials:"MW",name:"Marcus W.", cls:"Sunrise Flow",   when:"Wed 16 Apr 07:00",cr:15,status:"Confirmed"},
    {initials:"LM",name:"Léa M.",    cls:"Morning Yin",    when:"Tue 15 Apr 09:00",cr:12,status:"Pending"},
  ] : [];

  // Header + Overview stats. Live partners pull from businesses-table fields; missing
  // values render as "0" / "—" rather than fake demo numbers.
  const monthLabel = new Date().toLocaleDateString('en-GB', { month:'long', year:'numeric' });
  const monthlyBookings = +bizData.monthly_bookings || 0;
  const monthlyCredits  = +bizData.monthly_credits  || 0;
  const payoutAmt = monthlyCredits > 0 ? "€"+(monthlyCredits*0.8).toFixed(0) : "€0";
  const stats = isPreview ? [
    {label:"Bookings this month",value:"24",   sub:"April 2026",       accent:"#CAECBA"},
    {label:"Credits redeemed",   value:"◈ 86", sub:"this month",       accent:"rgba(255,255,255,0.25)"},
    {label:"Payout due",         value:"€619", sub:"paid this Friday", accent:"#A3B18A"},
    {label:"Avg rating",         value:"4.9",  sub:"38 reviews",       accent:"#D6B47C"},
  ] : [
    {label:"Bookings this month",value:String(monthlyBookings),       sub:monthLabel,                                                accent:"#CAECBA"},
    {label:"Credits redeemed",   value:"◈ "+monthlyCredits,           sub:"this month",                                              accent:"rgba(255,255,255,0.25)"},
    {label:"Payout due",         value:payoutAmt,                     sub:monthlyCredits>0?"paid this Friday":"no payout yet",       accent:"#A3B18A"},
    {label:"Avg rating",         value:bizData.rating?String(bizData.rating):"—", sub:bizData.reviews?`${bizData.reviews} reviews`:"no reviews yet", accent:"#D6B47C"},
  ];
  const overviewCards = isPreview ? [
    {label:"Total sessions",       value:"142",  sub:"Last 6 months",          color:"#213C18"},
    {label:"Customer return rate", value:"68%",  sub:"booked more than once",  color:"#213C18"},
    {label:"Avg credits/booking",  value:"◈ 18", sub:"April 2026",             color:"#B8925C"},
    {label:"Revenue this month",   value:"€619", sub:"paid this Friday",       color:"#213C18"},
  ] : [
    {label:"Total sessions",       value:String(monthlyBookings),    sub:"all time",                                                color:"#213C18"},
    {label:"Customer return rate", value:"—",                        sub:"no bookings yet",                                         color:"#213C18"},
    {label:"Avg credits/booking",  value:monthlyBookings>0?"◈ "+Math.round(monthlyCredits/monthlyBookings):"◈ —", sub:monthLabel,    color:"#B8925C"},
    {label:"Revenue this month",   value:payoutAmt,                  sub:monthlyCredits>0?"paid this Friday":"no revenue yet",      color:"#213C18"},
  ];

  const INP = {width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"10px 14px",fontFamily:F2,fontSize:13,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4"};

  const dayCLS = CLS.filter(c=>c.day===selDay);

  return (
    <div style={{minHeight:"100vh",background:"#FBF9F4",fontFamily:F2}}>

      {/* Header */}
      <div style={{background:"#213C18",padding:"clamp(16px,3vw,28px) clamp(16px,3vw,32px) 0"}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          {/* Venue selector strip — only shown when a partner owns more than one
              venue, or when the "Add another venue" affordance is available. */}
          {!isPreview && (venues.length > 1 || onAddVenue) && (
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:14}}>
              <span style={{fontFamily:F2,fontSize:9,color:"rgba(255,255,255,0.4)",letterSpacing:"1.5px",textTransform:"uppercase",marginRight:4}}>Venues</span>
              {venues.map(v => {
                const active = v.id === activeVenueId;
                const dot = v.status === 'approved' ? '#A3B18A'
                          : v.status === 'submitted' ? '#D6B47C'
                          : v.status === 'setting_up' ? '#FFB07A'
                          : 'rgba(255,255,255,0.4)';
                return (
                  <button key={v.id} onClick={() => !active && onSwitchVenue && onSwitchVenue(v.id)}
                    title={v.status === 'approved' ? 'Live' : v.status === 'submitted' ? 'Pending review' : v.status === 'setting_up' ? 'Setting up' : v.status}
                    style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:999,border:`1px solid ${active?"rgba(255,255,255,0.4)":"rgba(255,255,255,0.12)"}`,background:active?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.04)",color:"#fff",fontFamily:F2,fontSize:11,fontWeight:active?700:400,cursor:active?"default":"pointer",transition:"all .12s",whiteSpace:"nowrap"}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:dot,display:"inline-block",flexShrink:0}}/>
                    {v.name || 'Untitled venue'}
                  </button>
                );
              })}
              {onAddVenue && (
                <button onClick={onAddVenue} disabled={addingVenue}
                  style={{padding:"6px 12px",borderRadius:999,border:"1px dashed rgba(255,255,255,0.3)",background:"transparent",color:addingVenue?"rgba(255,255,255,0.35)":"rgba(255,255,255,0.7)",fontFamily:F2,fontSize:11,fontWeight:500,cursor:addingVenue?"wait":"pointer",whiteSpace:"nowrap"}}
                  onMouseEnter={e=>{if(!addingVenue){e.currentTarget.style.background="rgba(255,255,255,0.08)";e.currentTarget.style.color="#fff";}}}
                  onMouseLeave={e=>{if(!addingVenue){e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(255,255,255,0.7)";}}}>
                  {addingVenue ? 'Adding…' : '+ Add another venue'}
                </button>
              )}
            </div>
          )}

          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12,marginBottom:24}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <span onClick={onExit} style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:16,fontWeight:800,color:"#CAECBA",letterSpacing:"-0.5px",cursor:"pointer",opacity:0.8}} onMouseEnter={e=>e.target.style.opacity="1"} onMouseLeave={e=>e.target.style.opacity="0.8"}>wello</span>
                <span style={{fontFamily:F2,fontSize:9,color:"rgba(255,255,255,0.3)",letterSpacing:"2px",textTransform:"uppercase"}}>/ Business Dashboard</span>
              </div>
              <h1 style={{fontFamily:F2,fontSize:24,fontWeight:700,color:"#fff",letterSpacing:"-0.5px",margin:"0 0 6px"}}>{bizData.name}</h1>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:bizData.status==='paused'?'#B8925C':'#A3B18A',display:"inline-block"}}/>
                <span style={{fontFamily:F2,fontSize:11,color:"rgba(255,255,255,0.6)"}}>
                  {bizData.status==='paused' ? 'Paused — hidden from marketplace' : 'Live on marketplace'}
                </span>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{ setTab("manage"); setManageSubTab("listing"); }} style={{padding:"8px 16px",background:"rgba(255,255,255,0.12)",color:"#fff",border:"1px solid rgba(255,255,255,0.2)",borderRadius:999,fontFamily:F2,fontSize:11,fontWeight:600,cursor:"pointer"}}>Edit listing</button>
              <button onClick={onExit} style={{padding:"8px 16px",background:"transparent",color:"rgba(255,255,255,0.45)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:999,fontFamily:F2,fontSize:11,cursor:"pointer"}}>{isPreview ? "✕ Exit preview" : "Sign out →"}</button>
            </div>
          </div>
          {/* Stats row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(140px,1fr))",gap:8,marginBottom:0,overflowX:"auto"}}>
            {stats.map(({label,value,sub,accent})=>(
              <div key={label} style={{background:"rgba(0,0,0,0.15)",borderRadius:"8px 8px 0 0",padding:"14px 16px",borderTop:`3px solid ${accent}`}}>
                <p style={{fontFamily:F2,fontSize:9,color:"rgba(255,255,255,0.4)",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 6px"}}>{label}</p>
                <p style={{fontFamily:F2,fontSize:24,fontWeight:800,color:"#fff",letterSpacing:"-1px",margin:"0 0 3px",lineHeight:1}}>{value}</p>
                <p style={{fontFamily:F2,fontSize:10,color:"rgba(255,255,255,0.35)",margin:0}}>{sub}</p>
              </div>
            ))}
          </div>
          {/* Tabs */}
          <div style={{display:"flex",marginTop:4,gap:0,overflowX:"auto",scrollbarWidth:"none"}}>
            {TABS.map(([k,l])=>{
              // Show a pill badge on Manage with the count of pending booking
              // requests so partners see "you've got work" the moment they sign in.
              const showBadge = k === "manage" && dashSupportsRequests
                && Array.isArray(pendingRequests) && pendingRequests.length > 0;
              return (
                <button key={k} onClick={()=>{ setTab(k); if (k==="manage" && showBadge) setManageSubTab("requests"); }}
                  style={{position:"relative",padding:"12px 20px",border:"none",borderBottom:`3px solid ${tab===k?"#fff":"transparent"}`,background:tab===k?"rgba(255,255,255,0.1)":"transparent",color:tab===k?"#fff":"rgba(255,255,255,0.45)",fontFamily:F2,fontSize:12,fontWeight:tab===k?700:400,cursor:"pointer",transition:"all .15s",display:"inline-flex",alignItems:"center",gap:8}}>
                  {l}
                  {showBadge && (
                    <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:18,height:18,padding:"0 6px",borderRadius:999,background:"#C46A4D",color:"#fff",fontSize:10,fontWeight:800,lineHeight:1}}>
                      {pendingRequests.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{maxWidth:1100,margin:"0 auto",padding:"clamp(16px,3vw,28px) clamp(16px,3vw,32px) 80px"}}>

        {/* ── OVERVIEW ── */}
        {tab==="overview"&&(
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            {/* Agreement banner — surfaces at the top of Overview when the
                partner needs to accept or re-accept the Partner Agreement.
                Clicking jumps them straight to the Agreement tab. */}
            {!isPreview && (!agreementAccepted || needsReacceptance) && (
              <div onClick={()=>setShowAgreementRef(true)}
                style={{background:needsReacceptance?"#FFE6D9":"#F7EDD8",border:`1px solid ${needsReacceptance?"#C46A4D":"#D6B47C"}`,borderRadius:12,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",cursor:"pointer"}}>
                <div>
                  <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:needsReacceptance?"#C46A4D":"#6F5B44",margin:"0 0 4px"}}>
                    {needsReacceptance ? "Re-acceptance required" : "Partner agreement pending"}
                  </p>
                  <p style={{fontFamily:F2,fontSize:13,color:"#1B1C19",margin:0,lineHeight:1.55}}>
                    {needsReacceptance
                      ? "Your commission rate has changed since you last accepted. Review and re-accept the updated agreement to keep your listing live."
                      : "Please review and accept the Wello Partner Agreement before your venue can go live."}
                  </p>
                </div>
                <span style={{fontFamily:F2,fontSize:12,fontWeight:700,color:"#213C18",whiteSpace:"nowrap"}}>Open agreement →</span>
              </div>
            )}

            {/* Live bookings panel — confirmed sessions sorted soonest first.
                Pinned at the top of Overview so it's the first thing partners
                see when they open the dashboard. */}
            <div style={{background:"#fff",borderRadius:12,padding:"18px 20px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:14}}>
                <div>
                  <h3 style={{fontFamily:F2,fontSize:15,fontWeight:700,color:"#213C18",margin:"0 0 4px"}}>Your live bookings</h3>
                  <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0,lineHeight:1.55}}>
                    {upcomingBookings === null
                      ? "Loading…"
                      : upcomingBookings.length === 0
                        ? "No confirmed sessions yet. Once a booking is confirmed, it'll appear here."
                        : `${upcomingBookings.length} confirmed session${upcomingBookings.length===1?"":"s"} ahead.`}
                  </p>
                </div>
                {upcomingBookings && upcomingBookings.length > 0 && (
                  <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:999,background:"#CAECBA",border:"1px solid #A3B18A",fontFamily:F2,fontSize:11,fontWeight:600,color:"#213C18"}}>
                    <span style={{width:7,height:7,borderRadius:"50%",background:"#A3B18A",display:"inline-block"}}/>
                    Confirmed
                  </span>
                )}
              </div>

              {upcomingBookings && upcomingBookings.length > 0 && (() => {
                const byDate = {};
                for (const b of upcomingBookings) {
                  if (!byDate[b.booking_date]) byDate[b.booking_date] = [];
                  byDate[b.booking_date].push(b);
                }
                const dates = Object.keys(byDate).sort();
                return (
                  <div style={{maxHeight:340,overflowY:"auto",borderTop:"1px solid #E4E2DD"}}>
                    {dates.map(date => (
                      <div key={date} style={{padding:"10px 0",borderBottom:"1px solid #E4E2DD"}}>
                        <p style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 8px"}}>
                          {new Date(date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}
                          <span style={{marginLeft:8,fontWeight:400,color:"#A3B18A"}}>{byDate[date].length} session{byDate[date].length===1?"":"s"}</span>
                        </p>
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          {byDate[date].sort((a,b)=>(a.start_time||"").localeCompare(b.start_time||"")).map(b => {
                            const customerName = b._customer?.full_name || b._customer?.email || "Customer";
                            const customerEmail = b._customer?.email || "";
                            const sessionName = b._slot_name || b.duration || "Session";
                            // Parse the two-line composite notes string the
                            // booking modal builds ("Customer location: …\nNotes: …").
                            const notesBlob = b.notes || "";
                            const locLine = notesBlob.split('\n').find(l => /^Customer location:/i.test(l)) || "";
                            const noteLine = notesBlob.split('\n').find(l => /^Notes:/i.test(l)) || "";
                            const peopleLine = notesBlob.split('\n').find(l => /^People:/i.test(l)) || "";
                            const travelLine = notesBlob.split('\n').find(l => /^Travel fee:/i.test(l)) || "";
                            const customerLocation = locLine.replace(/^Customer location:\s*/i, "").trim();
                            const customerNote = noteLine.replace(/^Notes:\s*/i, "").trim();
                            const peopleCount = parseInt(peopleLine.replace(/^People:\s*/i, "").trim(), 10) || 0;
                            const travelFeePaid = parseInt(travelLine.replace(/^Travel fee:\s*€?/i, "").trim(), 10) || 0;
                            return (
                              <div key={b.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"8px 10px",borderRadius:6,background:"#F5F3EE"}}>
                                <div style={{textAlign:"center",minWidth:44,paddingTop:2}}>
                                  <div style={{fontFamily:F2,fontSize:13,fontWeight:700,color:"#213C18"}}>{(b.start_time||"").slice(0,5)}</div>
                                  <div style={{fontFamily:F2,fontSize:9,color:"#A3B18A",fontWeight:300}}>{b.duration || ""}</div>
                                </div>
                                <div style={{width:1,background:"#E4E2DD",alignSelf:"stretch"}}/>
                                <div style={{flex:1,minWidth:0}}>
                                  <p style={{fontFamily:F2,fontSize:13,fontWeight:600,color:"#1B1C19",margin:"0 0 2px"}}>
                                    {customerName}
                                    {customerEmail && <span style={{color:"#54584F",fontWeight:400,fontSize:11,marginLeft:6}}>· {customerEmail}</span>}
                                  </p>
                                  {b._customer?.phone && (
                                    <p style={{fontFamily:F2,fontSize:11,margin:"0 0 2px"}}>
                                      <a href={`tel:${b._customer.phone.replace(/\s+/g,'')}`} style={{color:"#213C18",fontWeight:600,textDecoration:"none"}}>📞 {b._customer.phone}</a>
                                    </p>
                                  )}
                                  <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:"0 0 2px"}}>{sessionName}{peopleCount > 1 ? ` · 👥 ${peopleCount} people` : ""}{travelFeePaid > 0 ? ` · 🚗 +€${travelFeePaid} travel` : ""}</p>
                                  {customerLocation && (
                                    <p style={{fontFamily:F2,fontSize:11,color:"#766149",margin:0,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                      <span>📍 {customerLocation}</span>
                                      <button type="button" onClick={()=>copyAddress(b.id, customerLocation)}
                                        style={{background:"transparent",border:"1px solid rgba(118,97,73,0.4)",color:"#766149",fontFamily:F2,fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:999,cursor:"pointer",letterSpacing:"0.5px",textTransform:"uppercase"}}>
                                        {copiedBookingId === b.id ? "✓ Copied" : "Copy"}
                                      </button>
                                    </p>
                                  )}
                                  {customerNote && (
                                    <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:"3px 0 0",fontStyle:"italic"}}>📝 {customerNote}</p>
                                  )}
                                </div>
                                <span style={{fontFamily:F2,fontSize:12,color:"#213C18",fontWeight:700,whiteSpace:"nowrap",alignSelf:"center"}}>◈ {b.credits_used}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {upcomingBookings && upcomingBookings.length === 0 && (
                <div style={{padding:"20px 16px",background:"#F5F3EE",borderRadius:8,textAlign:"center"}}>
                  <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0,lineHeight:1.55}}>Once a request is confirmed (Requests tab) or a customer books a slot directly, it'll land here.</p>
                </div>
              )}
            </div>

            {/* Summary cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(45%,200px),1fr))",gap:10}}>
              {overviewCards.map(({label,value,sub,color})=>(
                <div key={label} style={{background:"#fff",borderRadius:12,padding:"18px 20px",borderTop:`3px solid ${color}`,boxShadow:"0 1px 8px rgba(0,0,0,0.04)"}}>
                  <p style={{fontFamily:F2,fontSize:9,color:"#54584F",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 8px"}}>{label}</p>
                  <p style={{fontFamily:F2,fontSize:28,fontWeight:800,color:"#213C18",letterSpacing:"-1px",margin:"0 0 4px",lineHeight:1}}>{value}</p>
                  <p style={{fontFamily:F2,fontSize:10,color:"#A3B18A",margin:0}}>{sub}</p>
                </div>
              ))}
            </div>

            {/* Revenue chart + live feed */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,300px),1fr))",gap:14}}>
              {/* Bar chart */}
              <div style={{background:"#fff",borderRadius:12,padding:"22px 24px",boxShadow:"0 1px 8px rgba(0,0,0,0.04)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:20}}>
                  <div>
                    <p style={{fontFamily:F2,fontSize:14,fontWeight:700,color:"#213C18",margin:"0 0 2px",letterSpacing:"-0.3px"}}>Monthly revenue</p>
                    <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:0}}>Credits redeemed × €1 · less commission</p>
                  </div>
                  <p style={{fontFamily:F2,fontSize:20,fontWeight:800,color:"#213C18",letterSpacing:"-0.5px",margin:0}}>{isPreview?"€619":payoutAmt}</p>
                </div>
                {isPreview ? (()=>{
                  const months=[{m:"Nov",v:280},{m:"Dec",v:310},{m:"Jan",v:390},{m:"Feb",v:480},{m:"Mar",v:530},{m:"Apr",v:619}];
                  const max=Math.max(...months.map(x=>x.v));
                  return (
                    <div style={{display:"flex",alignItems:"flex-end",gap:8,height:120}}>
                      {months.map(({m,v},i)=>{
                        const isLast=i===months.length-1;
                        const h=Math.round((v/max)*100);
                        return (
                          <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                            <p style={{fontFamily:F2,fontSize:9,color:isLast?"#213C18":"#A3B18A",fontWeight:isLast?700:400,margin:0}}>€{v}</p>
                            <div style={{width:"100%",height:h,background:isLast?"#213C18":"#E4E2DD",borderRadius:"4px 4px 0 0",transition:"height .3s"}}/>
                            <p style={{fontFamily:F2,fontSize:9,color:isLast?"#213C18":"#54584F",fontWeight:isLast?700:400,margin:0}}>{m}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })() : (
                  <div style={{height:120,display:"flex",alignItems:"center",justifyContent:"center",borderTop:"1px dashed #E4E2DD",borderBottom:"1px dashed #E4E2DD"}}>
                    <p style={{fontFamily:F2,fontSize:12,color:"#A3B18A",margin:0,textAlign:"center"}}>No revenue yet — your monthly chart will appear here once bookings start coming in.</p>
                  </div>
                )}
              </div>

              {/* The old hardcoded "Live bookings" panel that lived here was
                  removed when the real-data "Your live bookings" panel got
                  pinned to the top of Overview. RECENT is preview-only mock
                  data and no longer rendered. */}
            </div>
          </div>
        )}

        {/* ── MANAGE sub-tab navigation ── */}
        {tab==="manage" && (
          <div style={{marginBottom:18,padding:4,background:"rgba(33,60,24,0.06)",border:"1px solid rgba(33,60,24,0.08)",borderRadius:14,display:"flex",gap:4,overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            {MANAGE_SUBTABS.map(([id,label])=>{
              const active = manageSubTab===id;
              const requestCount = id === "requests" && Array.isArray(pendingRequests) ? pendingRequests.length : 0;
              return (
                <button key={id} onClick={()=>setManageSubTab(id)} style={{flex:"1 1 auto",minWidth:96,padding:"10px 14px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:F2,fontSize:13,fontWeight:600,whiteSpace:"nowrap",background:active?"#213C18":"transparent",color:active?"#FBF9F4":"#213C18",transition:"background 120ms ease",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  <span>{label}</span>
                  {requestCount > 0 && (
                    <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:18,height:18,padding:"0 6px",borderRadius:999,background:active?"#FBF9F4":"#C46A4D",color:active?"#213C18":"#fff",fontSize:10,fontWeight:800,lineHeight:1}}>
                      {requestCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── REQUESTS (private instructors + venues with offerings) ── */}
        {tab==="manage" && manageSubTab==="requests" && dashSupportsRequests && (
          <div>
            <div style={{marginBottom:18}}>
              <h2 style={{fontFamily:F2,fontSize:18,fontWeight:700,color:"#1B1C19",margin:"0 0 4px"}}>Pending requests</h2>
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0}}>Bookings waiting for your response. You have 48 hours to confirm or decline before the system declines on your behalf.</p>
            </div>
            {pendingRequests === null && (
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",fontWeight:300}}>Loading…</p>
            )}
            {pendingRequests && pendingRequests.length === 0 && (
              <div style={{padding:"40px 24px",background:"#fff",border:"1px solid #E4E2DD",borderRadius:8,textAlign:"center"}}>
                <p style={{fontFamily:F2,fontSize:13,color:"#54584F",fontWeight:300,margin:0}}>No pending requests right now. New booking requests will appear here.</p>
              </div>
            )}
            {pendingRequests && pendingRequests.length > 0 && (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {pendingRequests.map(req => {
                  const expiresAt = new Date(new Date(req.created_at).getTime() + 48*60*60*1000);
                  const hoursLeft = Math.max(0, Math.round((expiresAt - new Date()) / 3600000));
                  const expired = hoursLeft <= 0;
                  const customerName = req._customer?.full_name || req._customer?.email || 'Customer';
                  const customerEmail = req._customer?.email || '';
                  // Parse the two-line composite notes the booking modal
                  // builds ("Customer location: …\nNotes: …").
                  const notesBlob = req.notes || '';
                  const locLine = notesBlob.split('\n').find(l => /^Customer location:/i.test(l)) || '';
                  const noteLine = notesBlob.split('\n').find(l => /^Notes:/i.test(l)) || '';
                  const peopleLine = notesBlob.split('\n').find(l => /^People:/i.test(l)) || '';
                  const travelLine = notesBlob.split('\n').find(l => /^Travel fee:/i.test(l)) || '';
                  const customerLocation = locLine.replace(/^Customer location:\s*/i, '').trim() || 'Not provided';
                  const customerNote = noteLine.replace(/^Notes:\s*/i, '').trim();
                  const peopleCount = parseInt(peopleLine.replace(/^People:\s*/i, '').trim(), 10) || 0;
                  const travelFeePaid = parseInt(travelLine.replace(/^Travel fee:\s*€?/i, '').trim(), 10) || 0;
                  return (
                    <div key={req.id} style={{padding:"16px 18px",background:"#fff",border:"1px solid #E4E2DD",borderRadius:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:10,flexWrap:"wrap"}}>
                        <div>
                          <p style={{fontFamily:F2,fontSize:14,fontWeight:700,color:"#1B1C19",margin:"0 0 3px"}}>{customerName}</p>
                          {customerEmail && <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:"0 0 2px"}}>{customerEmail}</p>}
                          {req._customer?.phone && (
                            <p style={{fontFamily:F2,fontSize:11,margin:0}}>
                              <a href={`tel:${req._customer.phone.replace(/\s+/g,'')}`} style={{color:"#213C18",fontWeight:600,textDecoration:"none"}}>📞 {req._customer.phone}</a>
                            </p>
                          )}
                        </div>
                        <span style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"0.3px",padding:"4px 10px",borderRadius:999,background:expired?"#FFE1D6":"#FFF7EA",color:expired?"#C46A4D":"#7A5C32"}}>
                          {expired ? 'Expiring now' : `${hoursLeft}h to respond`}
                        </span>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:14,padding:"10px 12px",background:"#F5F3EE",borderRadius:6}}>
                        <div>
                          <p style={{fontFamily:F2,fontSize:9,color:"#54584F",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 2px"}}>Date</p>
                          <p style={{fontFamily:F2,fontSize:12,fontWeight:600,color:"#1B1C19",margin:0}}>{new Date(req.booking_date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</p>
                        </div>
                        <div>
                          <p style={{fontFamily:F2,fontSize:9,color:"#54584F",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 2px"}}>Time</p>
                          <p style={{fontFamily:F2,fontSize:12,fontWeight:600,color:"#1B1C19",margin:0}}>{(req.start_time||'').slice(0,5)} · {req.duration||'-'}</p>
                        </div>
                        <div>
                          <p style={{fontFamily:F2,fontSize:9,color:"#54584F",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 2px"}}>Credits</p>
                          <p style={{fontFamily:F2,fontSize:12,fontWeight:600,color:"#766149",margin:0}}>◈ {req.credits_used||'-'}</p>
                        </div>
                        {peopleCount > 1 && (
                          <div>
                            <p style={{fontFamily:F2,fontSize:9,color:"#54584F",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 2px"}}>People</p>
                            <p style={{fontFamily:F2,fontSize:12,fontWeight:600,color:"#213C18",margin:0}}>👥 {peopleCount}</p>
                          </div>
                        )}
                        {travelFeePaid > 0 && (
                          <div>
                            <p style={{fontFamily:F2,fontSize:9,color:"#54584F",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 2px"}}>Travel fee</p>
                            <p style={{fontFamily:F2,fontSize:12,fontWeight:600,color:"#B8925C",margin:0}}>🚗 +€{travelFeePaid}</p>
                          </div>
                        )}
                      </div>
                      <div style={{marginBottom:14}}>
                        <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:8,marginBottom:3}}>
                          <p style={{fontFamily:F2,fontSize:9,color:"#54584F",letterSpacing:"1.5px",textTransform:"uppercase",margin:0}}>Session address</p>
                          {customerLocation && customerLocation !== 'Not provided' && (
                            <button type="button" onClick={()=>copyAddress(req.id, customerLocation)}
                              style={{background:"transparent",border:"1px solid #213C18",color:"#213C18",fontFamily:F2,fontSize:9,fontWeight:700,padding:"2px 10px",borderRadius:999,cursor:"pointer",letterSpacing:"0.5px",textTransform:"uppercase"}}>
                              {copiedBookingId === req.id ? "✓ Copied" : "Copy"}
                            </button>
                          )}
                        </div>
                        <p style={{fontFamily:F2,fontSize:12,color:"#1B1C19",margin:0,lineHeight:1.5}}>{customerLocation}</p>
                        {customerNote && (
                          <>
                            <p style={{fontFamily:F2,fontSize:9,color:"#54584F",letterSpacing:"1.5px",textTransform:"uppercase",margin:"10px 0 3px"}}>Arrival notes</p>
                            <p style={{fontFamily:F2,fontSize:12,color:"#1B1C19",margin:0,lineHeight:1.5,fontStyle:"italic"}}>{customerNote}</p>
                          </>
                        )}
                      </div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        <button onClick={()=>respondToRequest(req.id,'confirm',req.status)} disabled={!!respondingId}
                          style={{flex:"1 1 140px",padding:"10px 14px",background:respondingId===req.id?"#A3A89E":"#213C18",color:"#fff",border:"none",borderRadius:6,fontFamily:F2,fontSize:12,fontWeight:700,cursor:respondingId?"wait":"pointer"}}>
                          {respondingId===req.id ? 'Sending…' : '✓ Confirm booking'}
                        </button>
                        <button onClick={()=>respondToRequest(req.id,'decline',req.status)} disabled={!!respondingId}
                          style={{flex:"1 1 140px",padding:"10px 14px",background:"transparent",color:"#C46A4D",border:"1px solid #C46A4D",borderRadius:6,fontFamily:F2,fontSize:12,fontWeight:600,cursor:respondingId?"wait":"pointer"}}>
                          Decline
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SCHEDULE ── */}
        {tab==="manage" && manageSubTab==="schedule" && dashIsPrivate && (
          <div>
            <div style={{marginBottom:18}}>
              <h2 style={{fontFamily:F2,fontSize:18,fontWeight:700,color:"#1B1C19",margin:"0 0 4px"}}>Your weekly availability</h2>
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0,lineHeight:1.6}}>Block out time windows + the session types you offer. We generate bookable slots for each offering inside every window. Guests pick the slot they want.</p>
            </div>

            {/* Optional booking-window range. Useful for seasonal pop-ups
                ("I'm only here Jul 1 – Sep 30"). Empty = rolling 4 weeks. */}
            <div style={{background:"#fff",borderRadius:12,padding:"18px 20px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)",marginBottom:14}}>
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 6px"}}>When you're taking bookings</p>
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 12px",lineHeight:1.6}}>Optional. Leave blank to keep a rolling 4-week window. Set a range if you only take bookings between specific dates (e.g. a summer season). Capped at 6 months.</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"flex-end"}}>
                <div style={{flex:"1 1 160px",minWidth:140}}>
                  <label style={{display:"block",fontFamily:F2,fontSize:11,fontWeight:600,color:"#54584F",margin:"0 0 4px"}}>From</label>
                  <input type="date" value={availabilityFrom}
                    onChange={e=>setAvailabilityFrom(e.target.value)}
                    style={{...INP,marginBottom:0,width:"100%"}}/>
                </div>
                <div style={{flex:"1 1 160px",minWidth:140}}>
                  <label style={{display:"block",fontFamily:F2,fontSize:11,fontWeight:600,color:"#54584F",margin:"0 0 4px"}}>To</label>
                  <input type="date" value={availabilityTo}
                    onChange={e=>setAvailabilityTo(e.target.value)}
                    min={availabilityFrom || undefined}
                    style={{...INP,marginBottom:0,width:"100%"}}/>
                </div>
                {(availabilityFrom || availabilityTo) && (
                  <button type="button" onClick={()=>{setAvailabilityFrom("");setAvailabilityTo("");}}
                    style={{background:"transparent",border:"none",color:"#54584F",fontFamily:F2,fontSize:11,fontWeight:500,cursor:"pointer",padding:"10px 12px",textDecoration:"underline"}}>
                    Clear range
                  </button>
                )}
              </div>
              {availabilityFrom && availabilityTo && availabilityTo < availabilityFrom && (
                <p style={{fontFamily:F2,fontSize:11,color:"#C46A4D",margin:"8px 0 0"}}>End date must be on or after the start date.</p>
              )}
            </div>

            {/* What you offer — chip-based. Each offering is a tappable
                pill with a clear "Remove" button. Add form is hidden by
                default and opens via the dashed Add button. */}
            <div style={{background:"#fff",borderRadius:12,padding:"18px 20px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)",marginBottom:14}}>
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 6px"}}>What you offer</p>
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 12px",lineHeight:1.6}}>One pill per session type. Click Remove to delete one, or add a new one below.</p>

              {dashSessionOfferings.length > 0 && (
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                  {dashSessionOfferings.map((off, idx) => (
                    <span key={idx} style={{display:"inline-flex",alignItems:"center",gap:10,padding:"7px 6px 7px 14px",borderRadius:999,background:"rgba(33,60,24,0.06)",border:"1px solid rgba(33,60,24,0.18)",fontFamily:F2,fontSize:12,color:"#213C18",fontWeight:600}}>
                      <span>{off.type}</span>
                      <span style={{color:"#54584F",fontWeight:400}}>·</span>
                      <span style={{color:"#54584F",fontWeight:400}}>{off.length_min} min</span>
                      <span style={{color:"#54584F",fontWeight:400}}>·</span>
                      <span style={{color:"#766149"}}>€{off.price_eur}</span>
                      {off.extra_person_eur > 0 && (
                        <>
                          <span style={{color:"#54584F",fontWeight:400}}>·</span>
                          <span style={{color:"#54584F",fontWeight:500}}>+€{off.extra_person_eur}/extra</span>
                        </>
                      )}
                      <button type="button" onClick={()=>dashRemoveOffering(idx)} aria-label={`Remove ${off.type}`}
                        style={{background:"#fff",border:"1px solid #C46A4D",color:"#C46A4D",fontFamily:F2,fontSize:9,fontWeight:700,padding:"3px 9px",borderRadius:999,cursor:"pointer",letterSpacing:"0.5px",textTransform:"uppercase",marginLeft:4}}>
                        Remove
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Add button OR inline add form. Collapsed by default so the
                  panel stays compact when the partner is just reviewing. */}
              {!showAddOffering && (
                <button type="button" onClick={()=>setShowAddOffering(true)}
                  style={{background:"transparent",border:"1px dashed rgba(33,60,24,0.4)",color:"#213C18",fontFamily:F2,fontSize:12,fontWeight:600,padding:"9px 16px",borderRadius:999,cursor:"pointer"}}>
                  + Add offering
                </button>
              )}

              {showAddOffering && (
                <div style={{padding:"12px 14px",background:"#F5F3EE",borderRadius:8}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginBottom:10}}>
                    <input value={newOff.type}
                      onChange={e=>setNewOff(p=>({...p,type:e.target.value}))}
                      onKeyDown={e=>{ if (e.key === 'Enter') commitNewOffering(); }}
                      placeholder="Class type (e.g. Yoga)"
                      autoFocus
                      style={{...INP,marginBottom:0,flex:"2 1 180px",minWidth:0}}/>
                    <select value={newOff.length_min}
                      onChange={e=>setNewOff(p=>({...p,length_min:parseInt(e.target.value,10)}))}
                      style={{...INP,marginBottom:0,flex:"1 1 110px",minWidth:90}}>
                      {DASH_LENGTH_OPTIONS.map(m => <option key={m} value={m}>{m} min</option>)}
                    </select>
                    <div style={{position:"relative",flex:"1 1 110px",minWidth:90}}>
                      <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#54584F",fontFamily:F2,fontSize:13,fontWeight:600,pointerEvents:"none"}}>€</span>
                      <input type="number" min="1" value={newOff.price_eur}
                        onChange={e=>setNewOff(p=>({...p,price_eur:parseInt(e.target.value,10)||0}))}
                        onKeyDown={e=>{ if (e.key === 'Enter') commitNewOffering(); }}
                        placeholder="base"
                        style={{...INP,paddingLeft:22,marginBottom:0,width:"100%"}}/>
                    </div>
                  </div>
                  {/* Optional group-pricing row. Leave both blank for a strict
                      1-to-1 session. Set "Extra per person" to charge more per
                      additional guest; set "Max people" to cap the group size. */}
                  <p style={{fontFamily:F2,fontSize:11,fontWeight:600,color:"#54584F",margin:"6px 0 8px"}}>Group pricing (optional)</p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginBottom:10}}>
                    <div style={{position:"relative",flex:"1 1 160px",minWidth:120}}>
                      <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#54584F",fontFamily:F2,fontSize:13,fontWeight:600,pointerEvents:"none"}}>€</span>
                      <input type="number" min="0" value={newOff.extra_person_eur}
                        onChange={e=>setNewOff(p=>({...p,extra_person_eur:e.target.value}))}
                        placeholder="Extra per person"
                        style={{...INP,paddingLeft:22,marginBottom:0,width:"100%"}}/>
                    </div>
                    <input type="number" min="2" value={newOff.max_people}
                      onChange={e=>setNewOff(p=>({...p,max_people:e.target.value}))}
                      placeholder="Max people"
                      style={{...INP,marginBottom:0,flex:"1 1 120px",minWidth:100}}/>
                  </div>
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button type="button" onClick={()=>{setShowAddOffering(false);setNewOff({type:"",length_min:60,price_eur:50,extra_person_eur:"",max_people:""});}}
                      style={{background:"transparent",border:"none",color:"#54584F",fontFamily:F2,fontSize:11,fontWeight:500,cursor:"pointer",padding:"6px 12px"}}>
                      Cancel
                    </button>
                    <button type="button" onClick={commitNewOffering}
                      disabled={!newOff.type.trim() || !newOff.price_eur}
                      style={{padding:"8px 18px",background:(!newOff.type.trim()||!newOff.price_eur)?"#E4E2DD":"#213C18",color:(!newOff.type.trim()||!newOff.price_eur)?"#54584F":"#fff",border:"none",borderRadius:6,fontFamily:F2,fontSize:12,fontWeight:700,cursor:(!newOff.type.trim()||!newOff.price_eur)?"not-allowed":"pointer"}}>
                      Add offering
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Weekly availability — multi-day picker. Each existing window
                shows as a row with day, time range, and a clear Remove button.
                Add form is hidden by default and opens via the dashed button. */}
            <div style={{background:"#fff",borderRadius:12,padding:"18px 20px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)",marginBottom:18}}>
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 6px"}}>When you're available</p>
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 14px",lineHeight:1.6}}>Click Remove to delete a window, or add a new one below covering multiple days at once.</p>

              {availabilityWindows.length === 0 && (
                <p style={{fontFamily:F2,fontSize:12,color:"#54584F",fontStyle:"italic",margin:"0 0 12px"}}>No availability yet. Add at least one window below.</p>
              )}

              {/* Existing windows — one row per window with explicit Remove */}
              {availabilityWindows.length > 0 && (
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
                  {availabilityWindows.map((w, idx) => (
                    <div key={idx} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#F5F3EE",borderRadius:8}}>
                      <span style={{fontFamily:F2,fontSize:12,fontWeight:700,color:"#213C18",minWidth:36}}>{w.day}</span>
                      <span style={{flex:1,fontFamily:F2,fontSize:12,color:"#1B1C19",fontWeight:500}}>{w.start} → {w.end}</span>
                      <button type="button" onClick={()=>removeAvailabilityWindow(idx)} aria-label="Remove window"
                        style={{background:"#fff",border:"1px solid #C46A4D",color:"#C46A4D",fontFamily:F2,fontSize:9,fontWeight:700,padding:"3px 10px",borderRadius:999,cursor:"pointer",letterSpacing:"0.5px",textTransform:"uppercase"}}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add button OR multi-day inline form. Collapsed by default. */}
              {!showAddWindow && (
                <button type="button" onClick={()=>setShowAddWindow(true)}
                  style={{background:"transparent",border:"1px dashed rgba(33,60,24,0.4)",color:"#213C18",fontFamily:F2,fontSize:12,fontWeight:600,padding:"9px 16px",borderRadius:999,cursor:"pointer"}}>
                  + Add availability window
                </button>
              )}

              {showAddWindow && (
                <div style={{padding:"14px 16px",background:"#F5F3EE",borderRadius:8}}>
                  <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",margin:"0 0 8px"}}>Add a new window</p>

                  {/* Day chips */}
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}}>
                    {WEEK_DAYS.map(day => {
                      const on = newWindow.days.includes(day);
                      return (
                        <button key={day} type="button" onClick={()=>toggleNewWindowDay(day)}
                          style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${on?"#213C18":"rgba(195,200,188,0.6)"}`,background:on?"#213C18":"#fff",color:on?"#fff":"#1B1C19",fontFamily:F2,fontSize:11,fontWeight:on?700:500,cursor:"pointer",transition:"all .12s"}}>
                          {day}
                        </button>
                      );
                    })}
                  </div>

                  {/* Quick presets */}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                    <button type="button" onClick={()=>setNewWindow(p=>({...p,days:["Mon","Tue","Wed","Thu","Fri"]}))}
                      style={{background:"transparent",border:"1px dashed rgba(33,60,24,0.4)",color:"#213C18",fontFamily:F2,fontSize:10,fontWeight:600,padding:"4px 10px",borderRadius:999,cursor:"pointer"}}>
                      Weekdays
                    </button>
                    <button type="button" onClick={()=>setNewWindow(p=>({...p,days:["Sat","Sun"]}))}
                      style={{background:"transparent",border:"1px dashed rgba(33,60,24,0.4)",color:"#213C18",fontFamily:F2,fontSize:10,fontWeight:600,padding:"4px 10px",borderRadius:999,cursor:"pointer"}}>
                      Weekend
                    </button>
                    <button type="button" onClick={()=>setNewWindow(p=>({...p,days:[...WEEK_DAYS]}))}
                      style={{background:"transparent",border:"1px dashed rgba(33,60,24,0.4)",color:"#213C18",fontFamily:F2,fontSize:10,fontWeight:600,padding:"4px 10px",borderRadius:999,cursor:"pointer"}}>
                      Every day
                    </button>
                    {newWindow.days.length > 0 && (
                      <button type="button" onClick={()=>setNewWindow(p=>({...p,days:[]}))}
                        style={{background:"transparent",border:"none",color:"#54584F",fontFamily:F2,fontSize:10,fontWeight:500,padding:"4px 10px",borderRadius:999,cursor:"pointer",textDecoration:"underline"}}>
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Time pickers + Cancel/Add */}
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:10}}>
                    <span style={{fontFamily:F2,fontSize:11,color:"#54584F",fontWeight:600}}>From</span>
                    <input type="time" value={newWindow.start} onChange={e=>setNewWindow(p=>({...p,start:e.target.value}))}
                      style={{...INP,flex:"0 0 110px",marginBottom:0}}/>
                    <span style={{fontFamily:F2,fontSize:11,color:"#54584F",fontWeight:600}}>to</span>
                    <input type="time" value={newWindow.end} onChange={e=>setNewWindow(p=>({...p,end:e.target.value}))}
                      style={{...INP,flex:"0 0 110px",marginBottom:0}}/>
                  </div>
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button type="button" onClick={()=>{setShowAddWindow(false);setNewWindow({days:[],start:"09:00",end:"12:00"});}}
                      style={{background:"transparent",border:"none",color:"#54584F",fontFamily:F2,fontSize:11,fontWeight:500,cursor:"pointer",padding:"6px 12px"}}>
                      Cancel
                    </button>
                    <button type="button" onClick={commitNewWindow}
                      disabled={newWindow.days.length===0 || newWindow.end <= newWindow.start}
                      style={{padding:"8px 18px",background:(newWindow.days.length===0||newWindow.end<=newWindow.start)?"#E4E2DD":"#213C18",color:(newWindow.days.length===0||newWindow.end<=newWindow.start)?"#54584F":"#fff",border:"none",borderRadius:6,fontFamily:F2,fontSize:12,fontWeight:700,cursor:(newWindow.days.length===0||newWindow.end<=newWindow.start)?"not-allowed":"pointer"}}>
                      {newWindow.days.length === 0 ? "Pick days first" : `Add to ${newWindow.days.length} day${newWindow.days.length===1?"":"s"}`}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Save bar — primary action lives here */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",padding:"12px 0 18px"}}>
              <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:0,flex:1,minWidth:200,lineHeight:1.5}}>
                Saving regenerates your bookable slots
                {availabilityFrom || availabilityTo
                  ? ` for the dates you've set (${availabilityFrom || "today"} → ${availabilityTo || "+4 weeks"})`
                  : " for the next 4 weeks"}.
                Slots inside the 4-day lead window are skipped.
              </p>
              {(() => {
                const badRange = availabilityFrom && availabilityTo && availabilityTo < availabilityFrom;
                const blocked = saving || isPreview || badRange;
                return (
                  <button onClick={saveAvailability} disabled={blocked}
                    style={{padding:"11px 26px",background:blocked?"#E4E2DD":"#213C18",color:blocked?"#54584F":"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:blocked?"not-allowed":"pointer"}}>
                    {saving ? "Saving" : "Save availability"}
                  </button>
                );
              })()}
            </div>

            {/* Save toast — large, sage success or clay error so it's hard to
                miss after pressing Save. */}
            {saveMsg.kind === "settings" && (
              <div style={{padding:"12px 16px",background:"#CAECBA",border:"1px solid #A3B18A",borderRadius:8,marginBottom:18,display:"flex",alignItems:"center",gap:10}}>
                <Check size={18} stroke="#213C18" strokeWidth={2.6}/>
                <p style={{fontFamily:F2,fontSize:13,color:"#213C18",fontWeight:600,margin:0}}>{saveMsg.text}</p>
              </div>
            )}
            {saveMsg.kind === "err" && (
              <div style={{padding:"12px 16px",background:"#FFE6D9",border:"1px solid #DCC2A6",borderRadius:8,marginBottom:18}}>
                <p style={{fontFamily:F2,fontSize:13,color:"#6F5B44",fontWeight:600,margin:0}}>{saveMsg.text}</p>
              </div>
            )}

            {/* Live bookable slots panel — front-and-centre so the partner can
                immediately see what got generated, when, and how customers
                will see it. Groups by date, shows offering name + price. */}
            <div style={{background:"#fff",borderRadius:12,padding:"18px 20px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:14}}>
                <div>
                  <h3 style={{fontFamily:F2,fontSize:15,fontWeight:700,color:"#213C18",margin:"0 0 4px"}}>What customers can book</h3>
                  <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0,lineHeight:1.55}}>
                    {dbSlots && dbSlots.length > 0
                      ? `${dbSlots.length} slot${dbSlots.length===1?"":"s"} live on the marketplace. Edit your offerings or windows above and Save to regenerate.`
                      : "No slots yet. Add at least one offering + one window above, then click Save availability."}
                  </p>
                </div>
                {dbSlots && dbSlots.length > 0 && (
                  <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:999,background:"#CAECBA",border:"1px solid #A3B18A",fontFamily:F2,fontSize:11,fontWeight:600,color:"#213C18"}}>
                    <span style={{width:7,height:7,borderRadius:"50%",background:"#A3B18A",display:"inline-block"}}/>
                    Live
                  </span>
                )}
              </div>

              {dbSlots === null && (
                <p style={{fontFamily:F2,fontSize:12,color:"#54584F",fontStyle:"italic",margin:0}}>Loading slots…</p>
              )}

              {dbSlots && dbSlots.length === 0 && (
                <div style={{padding:"22px 16px",background:"#F5F3EE",borderRadius:8,textAlign:"center"}}>
                  <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 6px",lineHeight:1.6}}>
                    Either your offerings list is empty, your windows are entirely inside the 4-day lead buffer, or you haven't saved yet.
                  </p>
                  <p style={{fontFamily:F2,fontSize:11,color:"#A3B18A",margin:0,fontWeight:600}}>Add at least one offering AND one window above → Save availability.</p>
                </div>
              )}

              {dbSlots && dbSlots.length > 0 && (() => {
                // Summary chips per offering: "12 × Yoga 60 min", "8 × Pilates 90 min"
                const byOffering = {};
                for (const s of dbSlots) {
                  const key = s.name || "Session";
                  byOffering[key] = (byOffering[key] || 0) + 1;
                }
                // Group by date for the scrollable list
                const byDate = {};
                for (const s of dbSlots) {
                  if (!byDate[s.date]) byDate[s.date] = [];
                  byDate[s.date].push(s);
                }
                const dates = Object.keys(byDate).sort();
                return (
                  <>
                    {/* Offering breakdown chips */}
                    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                      {Object.entries(byOffering).sort((a,b)=>b[1]-a[1]).map(([name, count]) => (
                        <span key={name} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:999,background:"#F5F3EE",border:"1px solid rgba(195,200,188,0.5)",fontFamily:F2,fontSize:11,color:"#1B1C19"}}>
                          <strong style={{fontWeight:700,color:"#213C18"}}>{count}</strong>
                          <span style={{color:"#54584F"}}>×</span>
                          {name}
                        </span>
                      ))}
                    </div>

                    {/* Date-grouped list, scrollable */}
                    <div style={{maxHeight:340,overflowY:"auto",borderTop:"1px solid #E4E2DD"}}>
                      {dates.map(date => (
                        <div key={date} style={{padding:"10px 0",borderBottom:"1px solid #E4E2DD"}}>
                          <p style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 6px"}}>
                            {new Date(date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}
                            <span style={{marginLeft:8,fontWeight:400,color:"#A3B18A"}}>{byDate[date].length} slot{byDate[date].length===1?"":"s"}</span>
                          </p>
                          <div style={{display:"flex",flexDirection:"column",gap:3}}>
                            {byDate[date].sort((a,b)=>(a.time||"").localeCompare(b.time||"")).map(s => {
                              const isBooked = (s.booked || 0) > 0;
                              return (
                                <div key={s.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 8px",borderRadius:6,background:isBooked?"#F0EEE9":"transparent",fontFamily:F2,fontSize:12,color:"#1B1C19"}}>
                                  <span style={{fontWeight:600}}>
                                    {(s.time||"").slice(0,5)}
                                    <span style={{color:"#54584F",fontWeight:400,marginLeft:8}}>{s.name || ""}</span>
                                  </span>
                                  <span style={{display:"flex",alignItems:"center",gap:10}}>
                                    {isBooked && (
                                      <span style={{fontSize:10,fontWeight:700,color:"#766149",letterSpacing:"0.5px",textTransform:"uppercase"}}>Booked</span>
                                    )}
                                    <span style={{color:"#766149",fontWeight:600}}>€{s.credits}</span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:"14px 0 0",lineHeight:1.6}}>
                      <strong style={{color:"#213C18",fontWeight:700}}>To change a slot:</strong> edit the offerings or windows above and click Save availability — slots regenerate from your latest setup.
                      <strong style={{color:"#213C18",fontWeight:700,marginLeft:6}}>To temporarily go offline:</strong> remove all your windows and Save.
                    </p>
                  </>
                );
              })()}
            </div>

            {/* Coverage areas — sits on the Schedule tab so partners set
                where they travel to at the same time as when they're
                available. Extended-travel picker sits underneath. */}
            <div style={{background:"#fff",borderRadius:12,padding:"20px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)",marginBottom:18}}>
              <h3 style={{fontFamily:F2,fontSize:15,fontWeight:700,color:"#213C18",margin:"0 0 6px"}}>Coverage areas</h3>
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 14px",lineHeight:1.6}}>The Mallorca areas you travel to. Guests filter by location, so update this whenever your radius changes.</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                {MALLORCA_LOCATIONS.map(loc => {
                  const on = coverageAreas.includes(loc);
                  return (
                    <button key={loc} type="button" onClick={()=>toggleCoverageArea(loc)}
                      style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${on?"#213C18":"rgba(195,200,188,0.5)"}`,background:on?"#213C18":"#fff",color:on?"#fff":"#1B1C19",fontFamily:F2,fontSize:11,fontWeight:on?600:400,cursor:"pointer",transition:"all .12s"}}>
                      {on?"✓ ":""}{loc}
                    </button>
                  );
                })}
              </div>
              {/* Extended travel — optional. Places the instructor will also
                  travel to for an additional surcharge on top of the session
                  price. The surcharge is added automatically to the customer's
                  booking when their address matches one of these areas. */}
              <div style={{marginTop:20,paddingTop:18,borderTop:"1px solid #E4E2DD"}}>
                <h4 style={{fontFamily:F2,fontSize:13,fontWeight:700,color:"#213C18",margin:"0 0 4px"}}>Extended travel (optional)</h4>
                <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 12px",lineHeight:1.6}}>Add places outside your usual coverage that you'll travel to for a fee. Guests booking to one of these areas pay the surcharge automatically on top of the session price.</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                  {MALLORCA_LOCATIONS.map(loc => {
                    const isCore   = coverageAreas.includes(loc);
                    const isExtra  = travelAreas.includes(loc);
                    const disabled = isCore;
                    return (
                      <button key={loc} type="button" onClick={()=>toggleTravelArea(loc)} disabled={disabled}
                        style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${isExtra?"#B8925C":"rgba(195,200,188,0.5)"}`,background:isExtra?"#B8925C":"#fff",color:isExtra?"#fff":(disabled?"#A3B18A":"#1B1C19"),fontFamily:F2,fontSize:11,fontWeight:isExtra?600:400,cursor:disabled?"not-allowed":"pointer",transition:"all .12s",opacity:disabled?0.5:1}}>
                        {isExtra?"✓ ":""}{loc}
                      </button>
                    );
                  })}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                  <label style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F"}}>Travel surcharge</label>
                  <div style={{position:"relative",width:120}}>
                    <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#54584F",fontFamily:F2,fontSize:13,fontWeight:600,pointerEvents:"none"}}>€</span>
                    <input type="number" min="0" step="1" value={travelFeeEur}
                      onChange={e=>setTravelFeeEur(e.target.value)}
                      placeholder="0"
                      style={{...INP,paddingLeft:22,marginBottom:0,width:"100%"}}/>
                  </div>
                  <p style={{fontFamily:F2,fontSize:11,color:"#A3B18A",margin:0,flex:"1 1 200px"}}>Applied per booking. Leave blank if you don't charge extra.</p>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginTop:18}}>
                <p style={{fontFamily:F2,fontSize:11,color:coverageAreas.length>0?"#213C18":"#6F5B44",fontWeight:600,margin:0}}>
                  {coverageAreas.length > 0
                    ? `${coverageAreas.length} core area${coverageAreas.length===1?"":"s"}${travelAreas.length>0?` · ${travelAreas.length} extended`:""}`
                    : "At least one area is required"}
                </p>
                <button onClick={saveCoverageAreas} disabled={saving||isPreview||coverageAreas.length===0}
                  style={{padding:"10px 22px",background:(saving||isPreview||coverageAreas.length===0)?"#E4E2DD":"#213C18",color:(saving||isPreview||coverageAreas.length===0)?"#54584F":"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:(saving||isPreview||coverageAreas.length===0)?"not-allowed":"pointer"}}>
                  {saving ? "Saving" : "Save coverage and travel"}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab==="manage" && manageSubTab==="schedule" && !dashIsPrivate && (
          <div>
            {/* Day selector */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <div style={{display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none"}}>
                {WEEK_DAYS.map((d,i)=>{
                  const count = CLS.filter(c=>c.day===i).length;
                  return (
                    <button key={d} onClick={()=>setSelDay(i)}
                      style={{padding:"10px 14px",borderRadius:10,border:"none",cursor:"pointer",textAlign:"center",transition:"all .15s",flexShrink:0,
                        background:selDay===i?"#213C18":"#fff",
                        boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
                      <p style={{fontFamily:F2,fontSize:10,color:selDay===i?"rgba(255,255,255,0.6)":"#54584F",margin:"0 0 2px",textTransform:"uppercase",letterSpacing:"0.5px"}}>{d}</p>
                      <p style={{fontFamily:F2,fontSize:15,fontWeight:800,color:selDay===i?"#fff":"#213C18",margin:"0 0 2px",letterSpacing:"-0.5px"}}>{WEEK_DATES[i].split(" ")[0]}</p>
                      {count>0&&<div style={{width:4,height:4,borderRadius:"50%",background:selDay===i?"rgba(255,255,255,0.5)":"#213C18",margin:"0 auto"}}/>}
                    </button>
                  );
                })}
              </div>
              <button onClick={()=>setShowAddSlot(true)}
                style={{padding:"10px 18px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                + Add slot
              </button>
            </div>

            {/* Slots for day */}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {dayCLS.length===0
                ? <div style={{background:"#fff",borderRadius:12,padding:"40px",textAlign:"center",boxShadow:"0 1px 6px rgba(0,0,0,0.04)"}}>
                    <p style={{fontFamily:F2,fontSize:16,color:"#54584F",margin:"0 0 12px"}}>No classes on {WEEK_DAYS[selDay]}</p>
                    <button onClick={()=>setShowAddSlot(true)} style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"10px 20px",fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Add a class</button>
                  </div>
                : dayCLS.map(cl=>{
                    const avail=cl.spots-cl.booked;
                    const pct=(cl.booked/cl.spots)*100;
                    // Bookings for this slot
                    const slotBookings = RECENT.filter(b=>b.cls===cl.name).slice(0,3);
                    return (
                      <div key={cl.id} style={{background:"#fff",borderRadius:12,padding:"16px 20px",boxShadow:"0 1px 6px rgba(0,0,0,0.04)",border:cl.live?"1px solid rgba(195,200,188,0.3)":"1px dashed rgba(195,200,188,0.5)",opacity:cl.live?1:0.7}}>
                        <div style={{display:"flex",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
                          {/* Time */}
                          <div style={{textAlign:"center",minWidth:52,flexShrink:0}}>
                            <p style={{fontFamily:F2,fontSize:18,fontWeight:800,color:"#213C18",margin:0,letterSpacing:"-0.5px"}}>{cl.time}</p>
                            <p style={{fontFamily:F2,fontSize:10,color:"#54584F",margin:0}}>{cl.dur}</p>
                          </div>
                          <div style={{width:1,height:40,background:"rgba(195,200,188,0.4)",flexShrink:0,marginTop:4}}/>
                          {/* Details */}
                          <div style={{flex:1}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                              <p style={{fontFamily:F2,fontSize:15,fontWeight:700,color:"#1B1C19",margin:0}}>{cl.name}</p>
                              <span style={{fontFamily:F2,fontSize:10,fontWeight:700,color:cl.live?"#213C18":"#54584F",background:cl.live?"#CAECBA":"#E4E2DD",padding:"2px 8px",borderRadius:999}}>{cl.live?"Live":"Paused"}</span>
                              <span style={{fontFamily:F2,fontSize:10,color:"#54584F",background:"#F5F3EE",padding:"2px 8px",borderRadius:999}}>◈ {cl.credits} per person</span>
                            </div>
                            {/* Capacity */}
                            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                              <div style={{width:120,height:4,background:"#E4E2DD",borderRadius:999}}>
                                <div style={{width:`${pct}%`,height:"100%",background:pct>=100?"#1B1C19":pct>75?"#B8925C":"#213C18",borderRadius:999}}/>
                              </div>
                              <p style={{fontFamily:F2,fontSize:11,color:pct>=100?"#e05c5c":"#213C18",fontWeight:600,margin:0}}>{cl.booked}/{cl.spots} booked · {avail} left</p>
                            </div>
                            {/* Booked names */}
                            {slotBookings.length>0&&(
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                {slotBookings.map(b=>(
                                  <span key={b.initials} style={{fontFamily:F2,fontSize:10,color:"#54584F",background:"#F5F3EE",padding:"2px 8px",borderRadius:999}}>{b.name}</span>
                                ))}
                                {cl.booked>slotBookings.length&&<span style={{fontFamily:F2,fontSize:10,color:"#A3B18A",padding:"2px 0"}}>+{cl.booked-slotBookings.length} more</span>}
                              </div>
                            )}
                          </div>
                          {/* Actions */}
                          <div style={{display:"flex",gap:6,flexShrink:0}}>
                            <button onClick={()=>{
                                if (isPreview) setCLS(p=>p.map(c=>c.id===cl.id?{...c,live:!c.live}:c));
                                else togglePausedDb(cl.id, cl.live);
                              }}
                              style={{padding:"6px 12px",background:cl.live?"#FADEC0":"#CAECBA",color:cl.live?"#766149":"#213C18",border:"none",borderRadius:999,fontFamily:F2,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                              {cl.live?"Pause":"Go live"}
                            </button>
                            <button onClick={()=>{
                                if (isPreview) setCLS(p=>p.filter(c=>c.id!==cl.id));
                                else removeSlotDb(cl.id);
                              }}
                              style={{padding:"6px 12px",background:"transparent",color:"#54584F",border:"1px solid rgba(195,200,188,0.4)",borderRadius:999,fontFamily:F2,fontSize:11,cursor:"pointer"}}>
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
              }
            </div>

            {/* Add slot modal */}
            {showAddSlot&&(()=>{
              const rawPrice = +newSlot.priceGBP || 0;
              const exactCr  = rawPrice > 0 ? rawPrice / 1 : null;
              const floorCr  = exactCr ? Math.max(1, Math.floor(exactCr)) : null;
              const ceilCr   = exactCr ? Math.ceil(exactCr) : null;
              const sameRound = floorCr === ceilCr;
              const DEMAND = {1:94,2:88,3:81,4:72,5:61,6:52,7:44,8:35,9:28,10:22};
              const getDemand = cr => DEMAND[cr] || (cr > 10 ? Math.max(8, 22 - (cr-10)*4) : 94);
              return (
                <div style={{position:"fixed",inset:0,zIndex:1200,background:"rgba(27,28,25,0.7)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowAddSlot(false)}>
                  <div style={{background:"#fff",borderRadius:16,maxWidth:440,width:"100%",padding:"28px",boxShadow:"0 24px 60px rgba(0,0,0,0.2)",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                      <h3 style={{fontFamily:F2,fontSize:18,fontWeight:700,color:"#213C18",margin:0}}>Add a class slot</h3>
                      <button onClick={()=>setShowAddSlot(false)} style={{background:"transparent",border:"none",fontSize:18,cursor:"pointer",color:"#54584F"}}>×</button>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      {[{l:"Class name",k:"name",p:"e.g. Sunrise Flow"},{l:"Time",k:"time",p:"09:00",t:"time"},{l:"Duration",k:"dur",p:"e.g. 60 min"},{l:"Available spots",k:"spots",p:"10",t:"number"}].map(f=>(
                        <div key={f.k}>
                          <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:5}}>{f.l}</label>
                          <input type={f.t||"text"} placeholder={f.p} value={newSlot[f.k]} onChange={e=>setNewSlot(p=>({...p,[f.k]:e.target.value}))} style={{...INP}}
                            onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                        </div>
                      ))}
                      <div style={{background:"#F5F3EE",borderRadius:10,padding:"14px"}}>
                        <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:4}}>Your normal class price</label>
<p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:"0 0 10px",lineHeight:1.5}}>1 credit = £1. Enter your normal class price and we'll set the credit price to match.</p>
                        <div style={{position:"relative"}}>
                          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontFamily:F2,fontSize:13,fontWeight:600,color:"#54584F",pointerEvents:"none"}}>£</span>
                          <input type="number" min="1" placeholder="e.g. 20" value={newSlot.priceGBP||""}
                            onChange={e=>{
                              const p = +e.target.value;
                              const cr = p > 0 ? Math.max(1, Math.round(p)) : 15;
                              setNewSlot(prev=>({...prev, priceGBP:e.target.value, credits:Math.round(cr)}));
                            }}
                            style={{...INP, paddingLeft:28}}
                            onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                        </div>
                        {exactCr && !sameRound && (
                          <div style={{marginTop:12}}>
                            <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:8}}>Choose credit price</label>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                              {[
                                { cr: floorCr, rounded: "Round down", valueNote: `£${floorCr} on Wello` },
                                { cr: ceilCr,  rounded: "Round up",   valueNote: `£${ceilCr} on Wello` },
                              ].map(({cr, rounded, valueNote})=>{
                                const sel = newSlot.credits === cr;
                                const demand = getDemand(cr);
                                const isLower = cr === floorCr;
                                return (
                                  <div key={cr} onClick={()=>setNewSlot(s=>({...s,credits:cr}))}
                                    style={{borderRadius:10,border:sel?"2px solid #213C18":"1px solid rgba(195,200,188,0.5)",background:sel?"#213C18":"#fff",cursor:"pointer",padding:"12px 10px",textAlign:"center",transition:"all .15s",position:"relative"}}>
                                    {isLower&&<div style={{position:"absolute",top:-8,left:"50%",transform:"translateX(-50%)",background:"#A3B18A",color:"#1B1C19",fontFamily:F2,fontSize:7,fontWeight:700,letterSpacing:"0.5px",padding:"2px 8px",borderRadius:999,whiteSpace:"nowrap"}}>RECOMMENDED</div>}
                                    <p style={{fontFamily:F2,fontSize:20,fontWeight:800,color:sel?"#fff":"#213C18",margin:"4px 0 2px",letterSpacing:"-0.5px"}}>◈ {cr}</p>
                                    <p style={{fontFamily:F2,fontSize:10,color:sel?"rgba(255,255,255,0.65)":"#54584F",margin:"0 0 8px"}}>{valueNote}</p>
                                    <div style={{height:3,borderRadius:999,background:sel?"rgba(255,255,255,0.2)":"#E4E2DD",overflow:"hidden",margin:"0 0 5px"}}>
                                      <div style={{width:`${demand}%`,height:"100%",background:sel?"rgba(255,255,255,0.7)":isLower?"#A3B18A":"#A3B18A",borderRadius:999}}/>
                                    </div>
                                    <p style={{fontFamily:F2,fontSize:10,fontWeight:700,color:sel?"rgba(255,255,255,0.8)":isLower?"#213C18":"#54584F",margin:0}}>{demand}% fill rate</p>
                                    <p style={{fontFamily:F2,fontSize:8,color:sel?"rgba(255,255,255,0.5)":"#A3B18A",margin:"2px 0 0"}}>{rounded} · platform avg</p>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{marginTop:10,padding:"10px 12px",background:"rgba(74,222,128,0.08)",border:"1px solid rgba(74,222,128,0.3)",borderRadius:8,display:"flex",gap:8,alignItems:"flex-start"}}>
                              <span style={{fontSize:13,flexShrink:0}}>📊</span>
                              <p style={{fontFamily:F2,fontSize:11,color:"#213C18",margin:0,lineHeight:1.5}}>
                                Classes at <strong>◈ {floorCr}</strong> fill <strong>{getDemand(floorCr) - getDemand(ceilCr)}% faster</strong> on average than ◈ {ceilCr}. More bookings = more revenue, even at a slightly lower rate.
                              </p>
                            </div>
                          </div>
                        )}
                        {exactCr && sameRound && (
                          <div style={{marginTop:10,display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#CAECBA",borderRadius:8}}>
                            <p style={{fontFamily:F2,fontSize:20,fontWeight:800,color:"#213C18",margin:0}}>◈ {floorCr}</p>
                            <div>
                              <p style={{fontFamily:F2,fontSize:12,fontWeight:700,color:"#213C18",margin:"0 0 1px"}}>Clean match</p>
                              <p style={{fontFamily:F2,fontSize:11,color:"#43483F",margin:0}}>£{rawPrice} = exactly ◈ {floorCr} · {getDemand(floorCr)}% avg fill rate</p>
                            </div>
                          </div>
                        )}
                      </div>
                      <button onClick={async ()=>{
                        if(!newSlot.name||!newSlot.time) return;
                        if (isPreview) {
                          // Demo only — local mutation.
                          setCLS(p=>[...p,{id:Date.now(),day:selDay,time:newSlot.time,name:newSlot.name,spots:+newSlot.spots||10,booked:0,credits:+newSlot.credits||3,dur:newSlot.dur||"60 min",live:true}]);
                        } else {
                          // Live partner — persist to the slots table for this week's selDay.
                          const ok = await addSlotDb({
                            name:    newSlot.name,
                            date:    dateForWeekday(selDay),
                            time:    newSlot.time,
                            dur:     newSlot.dur || "60 min",
                            spots:   +newSlot.spots || 10,
                            credits: +newSlot.credits || 3,
                          });
                          if (!ok) return; // DB failed; keep modal open so the partner can retry
                        }
                        setShowAddSlot(false);
                        setNewSlot({name:"",time:"09:00",spots:10,credits:15,dur:"60 min",priceGBP:""});
                      }}
                        disabled={!newSlot.name||!newSlot.time}
                        style={{marginTop:4,padding:"13px 0",background:newSlot.name&&newSlot.time?"#213C18":"#E4E2DD",color:newSlot.name&&newSlot.time?"#fff":"#54584F",border:"none",borderRadius:999,fontFamily:F2,fontSize:14,fontWeight:700,cursor:newSlot.name&&newSlot.time?"pointer":"not-allowed",transition:"all .15s"}}>
                        Add slot
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── PAYOUTS ── */}
        {tab==="payouts"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#213C18",borderRadius:12,padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
              <div>
                <p style={{fontFamily:F2,fontSize:10,color:"rgba(255,255,255,0.5)",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 4px"}}>Next payout</p>
                <p style={{fontFamily:F2,fontSize:28,fontWeight:800,color:"#fff",letterSpacing:"-1px",margin:"0 0 2px"}}>{isPreview?"€619.20":payoutAmt}</p>
                <p style={{fontFamily:F2,fontSize:12,color:"rgba(255,255,255,0.5)",margin:0}}>{isPreview||monthlyCredits>0?"Processed this Friday · direct to your IBAN":"No payout this week"}</p>
              </div>
              {/* Commission — real value comes from businesses.commission
                  (percentage as an integer, e.g. 15 means 15%). Falls back
                  to "Agreed with Wello" if the admin hasn't set one yet so
                  it never shows a scary "0%" for founding partners still
                  being onboarded. */}
              <div style={{background:"rgba(255,255,255,0.1)",borderRadius:10,padding:"12px 16px",textAlign:"right"}}>
                <p style={{fontFamily:F2,fontSize:10,color:"rgba(255,255,255,0.5)",margin:"0 0 2px"}}>Commission rate</p>
                <p style={{fontFamily:F2,fontSize:16,fontWeight:700,color:"#CAECBA",margin:0}}>
                  {(() => {
                    // Prefer commission_rate (numeric, allows decimals). Fall
                    // back to the older commission column so pre-migration
                    // partners still render correctly.
                    const c = bizData?.commission_rate != null && bizData?.commission_rate !== ""
                      ? bizData.commission_rate
                      : bizData?.commission;
                    if (c === null || c === undefined || c === "") return "To be confirmed";
                    const n = Number(c);
                    if (!Number.isFinite(n) || n < 0) return "To be confirmed";
                    return `${n}%`;
                  })()}
                </p>
              </div>
            </div>
            {(isPreview ? [
              {date:"14 Mar 2026",credits:170,bookings:4,gross:306,commission:null,invNo:"WLO-2026-014"},
              {date:"07 Mar 2026",credits:140,bookings:3,gross:252,commission:null,invNo:"WLO-2026-013"},
              {date:"28 Feb 2026",credits:120,bookings:3,gross:216,commission:null,invNo:"WLO-2026-012"},
            ] : []).map((row,i)=>{
              // Net shown only when commission is explicitly set for this venue
              const net = row.commission ? +(row.gross*(1-row.commission/100)).toFixed(2) : null;
              return (
                <div key={row.date} style={{background:"#fff",borderRadius:12,padding:"16px 20px",display:"flex",alignItems:"center",gap:14,boxShadow:"0 1px 6px rgba(0,0,0,0.04)"}}>
                  <div style={{flex:1}}>
                    <p style={{fontFamily:F2,fontSize:12,fontWeight:600,color:"#1B1C19",margin:"0 0 2px"}}>{row.invNo}</p>
                    <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:0}}>{row.date} · {row.credits} credits · {row.bookings} bookings</p>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <p style={{fontFamily:F2,fontSize:16,fontWeight:800,color:"#213C18",margin:"0 0 2px",letterSpacing:"-0.5px"}}>€{net ?? row.gross}</p>
                    <span style={{fontFamily:F2,fontSize:9,fontWeight:700,color:net?"#213C18":"#B8925C",background:net?"#CAECBA":"#FADEC0",padding:"2px 7px",borderRadius:999}}>
                      {net ? "Paid" : "Pending rate"}
                    </span>
                  </div>
                  <button style={{padding:"7px 14px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:11,fontWeight:600,cursor:"pointer",flexShrink:0}}>↓ Download</button>
                </div>
              );
            })}
            {!isPreview && (
              <div style={{background:"#fff",borderRadius:12,padding:"32px 20px",textAlign:"center",boxShadow:"0 1px 6px rgba(0,0,0,0.04)"}}>
                <p style={{fontFamily:F2,fontSize:14,color:"#54584F",fontWeight:600,margin:"0 0 4px"}}>No payouts yet</p>
                <p style={{fontFamily:F2,fontSize:12,color:"#A3B18A",margin:0,lineHeight:1.6}}>Your first payout statement will appear here once bookings have been processed.</p>
              </div>
            )}
            <p style={{fontFamily:F2,fontSize:11,color:"#A3B18A",textAlign:"center",marginTop:4}}>Payouts every Friday · questions? hello@wello-wellness.com</p>
          </div>
        )}

        {/* ── MY LISTING ── */}
        {tab==="manage" && manageSubTab==="listing" && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,300px),1fr))",gap:16,alignItems:"start"}}>
            {/* Listing preview */}
            <div style={{background:"#fff",borderRadius:12,overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
              <div style={{position:"relative",aspectRatio:"1"}}>
                <img src={bizData.img || "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&q=80"} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
                <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(27,28,25,0.7) 0%,transparent 60%)"}}/>
                <div style={{position:"absolute",bottom:12,left:14,right:14}}>
                  <p style={{fontFamily:F2,fontSize:16,fontWeight:700,color:"#fff",margin:"0 0 4px"}}>{listing.name}</p>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontFamily:F2,fontSize:10,color:"#fff",background:"#213C18",padding:"2px 8px",borderRadius:999}}>{listing.cat}</span>
                    {listing.cat2&&<span style={{fontFamily:F2,fontSize:10,color:"rgba(255,255,255,0.8)",background:"rgba(255,255,255,0.15)",padding:"2px 8px",borderRadius:999}}>{listing.cat2}</span>}
                  </div>
                </div>
              </div>
              <div style={{padding:"14px 16px"}}>
                <p style={{fontFamily:F2,fontSize:13,color:"#54584F",margin:"0 0 8px",lineHeight:1.6}}>{listing.desc}</p>
                <p style={{fontFamily:F2,fontSize:12,color:"#213C18",fontWeight:600,margin:0}}>📍 {listing.loc} · ◈ {listing.credits} per person</p>
              </div>
            </div>
            {/* Edit form — Listing-level fields per spec: category, location, credit price, price_mode */}
            <div style={{background:"#fff",borderRadius:12,padding:"20px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
              <h3 style={{fontFamily:F2,fontSize:15,fontWeight:700,color:"#213C18",margin:"0 0 16px"}}>Listing details</h3>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div>
                  <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:5}}>Category</label>
                  <select value={listingForm.category} onChange={e=>setListingForm(p=>({...p,category:e.target.value}))}
                    style={{...INP}}>
                    {(() => {
                      const bt = bizData?.business_type
                        ? BUSINESS_TYPES.find(t => t.id === bizData.business_type)
                        : null;
                      const opts = bt?.suggestedCats?.length ? bt.suggestedCats : CATS.filter(c => c !== "All");
                      const list = listingForm.category && !opts.includes(listingForm.category) ? [listingForm.category, ...opts] : opts;
                      return list.map(c => <option key={c} value={c}>{catLabel(c)}</option>);
                    })()}
                  </select>
                </div>
                <div>
                  <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:5}}>Location</label>
                  <input type="text" value={listingForm.location} onChange={e=>setListingForm(p=>({...p,location:e.target.value}))}
                    style={{...INP}} onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                </div>
                <div>
                  <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:5}}>Credit price (default per session)</label>
                  <input type="text" inputMode="numeric" value={listingForm.cr}
                    onChange={e=>setListingForm(p=>({...p,cr:e.target.value.replace(/[^0-9]/g,'').slice(0,4)}))}
                    style={{...INP}} onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                </div>
                <div>
                  <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:5}}>Pricing mode</label>
                  <select value={listingForm.price_mode} onChange={e=>setListingForm(p=>({...p,price_mode:e.target.value}))}
                    style={{...INP}}>
                    <option value="flat">Flat price across all sessions</option>
                    <option value="per_slot">Different price per slot</option>
                  </select>
                </div>
                <div>
                  <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:5}}>Description</label>
                  <textarea value={listingForm.description}
                    onChange={e=>setListingForm(p=>({...p,description:e.target.value.slice(0,600)}))}
                    placeholder="What guests should know about your venue, atmosphere and style."
                    style={{...INP,resize:"vertical",minHeight:90,fontFamily:F2}}/>
                  <p style={{fontFamily:F2,fontSize:10,color:"#A3B18A",margin:"4px 0 0",textAlign:"right"}}>{(listingForm.description || "").length}/600</p>
                </div>
                {dashIsPrivate && (
                  <div>
                    <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:5}}>Instructor bio</label>
                    <textarea value={listingForm.bio}
                      onChange={e=>setListingForm(p=>({...p,bio:e.target.value.slice(0,600)}))}
                      placeholder="Your background, style and what guests can expect from a session with you."
                      style={{...INP,resize:"vertical",minHeight:90,fontFamily:F2}}/>
                    <p style={{fontFamily:F2,fontSize:10,color:"#A3B18A",margin:"4px 0 0",textAlign:"right"}}>{(listingForm.bio || "").length}/600</p>
                  </div>
                )}
                <div>
                  <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:5}}>Tags</label>
                  <input type="text" value={listingForm.tags}
                    onChange={e=>setListingForm(p=>({...p,tags:e.target.value}))}
                    placeholder="e.g. Luxury, Sea View, Beginner Friendly"
                    style={{...INP}}
                    onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                  <p style={{fontFamily:F2,fontSize:10,color:"#A3B18A",margin:"4px 0 0"}}>Comma-separated, up to 8. Shown as pills on your venue popup.</p>
                </div>
                <button onClick={saveListing} disabled={saving||isPreview}
                  style={{padding:"12px 0",background:(saving||isPreview)?"#E4E2DD":"#213C18",color:(saving||isPreview)?"#54584F":"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:(saving||isPreview)?"not-allowed":"pointer"}}>
                  {saving ? "Saving" : "Save changes"}
                </button>
                {saveMsg.kind === "listing" && <p style={{fontFamily:F2,fontSize:12,color:"#213C18",margin:0,textAlign:"center"}}>{saveMsg.text}</p>}
                {saveMsg.kind === "err"     && <p style={{fontFamily:F2,fontSize:12,color:"#6F5B44",margin:0,textAlign:"center"}}>{saveMsg.text}</p>}
              </div>
            </div>

            {/* Photos card — spans both columns so partners have room to
                manage the primary hero and up to 4 gallery photos here.
                Uploads persist immediately (no need to click Save first). */}
            {!isPreview && (
              <div style={{background:"#fff",borderRadius:12,padding:"20px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)",gridColumn:"1 / -1"}}>
                <h3 style={{fontFamily:F2,fontSize:15,fontWeight:700,color:"#213C18",margin:"0 0 6px"}}>Photos</h3>
                <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 16px",lineHeight:1.6}}>Your primary photo shows on the marketplace card. Add up to 4 gallery photos and guests can swipe through them on your venue popup.</p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,180px),1fr))",gap:14}}>
                  {/* Primary */}
                  <label style={{position:"relative",aspectRatio:"1",borderRadius:12,overflow:"hidden",cursor:"pointer",border:"2px solid #213C18",display:"block"}}>
                    {primaryImg
                      ? <img src={primaryImg} alt="Primary" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
                      : <div style={{position:"absolute",inset:0,background:"#F5F3EE",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F2,fontSize:11,color:"#54584F",fontWeight:600}}>Add primary photo</div>
                    }
                    <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"6px 10px",background:"linear-gradient(to top,rgba(27,28,25,0.7),transparent)",fontFamily:F2,fontSize:10,fontWeight:700,color:"#fff",letterSpacing:"1px",textTransform:"uppercase"}}>{uploadingPrimary?"Uploading…":"Primary · click to change"}</div>
                    <input type="file" accept="image/*" onChange={handlePrimaryPhotoChange} style={{display:"none"}} disabled={uploadingPrimary}/>
                  </label>
                  {/* Gallery slots */}
                  {galleryImgs.map((url, i) => (
                    <div key={i} style={{position:"relative",aspectRatio:"1",borderRadius:12,overflow:"hidden",border:"1px solid rgba(195,200,188,0.5)"}}>
                      <img src={url} alt={`Gallery ${i+1}`} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
                      <button onClick={()=>removeGalleryPhoto(i)}
                        style={{position:"absolute",top:6,right:6,background:"rgba(196,106,77,0.95)",border:"none",color:"#fff",width:26,height:26,borderRadius:"50%",cursor:"pointer",fontFamily:F2,fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>×</button>
                    </div>
                  ))}
                  {/* Add gallery button */}
                  {galleryImgs.length < 4 && (
                    <label style={{position:"relative",aspectRatio:"1",borderRadius:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"#F5F3EE",border:"1px dashed rgba(33,60,24,0.35)",fontFamily:F2,fontSize:11,color:"#54584F",fontWeight:600,textAlign:"center",padding:12}}>
                      {uploadingGallery ? "Uploading…" : `+ Add photo (${galleryImgs.length}/4)`}
                      <input type="file" accept="image/*" onChange={handleAddGalleryPhoto} style={{display:"none"}} disabled={uploadingGallery}/>
                    </label>
                  )}
                </div>
                {photoErr && <p style={{fontFamily:F2,fontSize:12,color:"#C46A4D",margin:"12px 0 0"}}>{photoErr}</p>}
              </div>
            )}

            {/* Coverage areas + extended travel now live on the Schedule
                sub-tab so partners set where they go alongside when they're
                free. */}
          </div>
        )}

        {/* ── AGREEMENT MODAL ── Blocks the dashboard when acceptance is
             needed, or opens as a dismissible reference from Settings. */}
        {agreementModalOpen && (
          <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(27,28,25,0.72)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"clamp(12px,3vw,32px)",overflowY:"auto"}}>
          <div style={{background:"#FBF9F4",borderRadius:16,maxWidth:820,width:"100%",padding:"clamp(20px,3.5vw,32px)",boxShadow:"0 24px 60px rgba(0,0,0,0.35)",position:"relative"}}>
          {agreementCanDismiss && (
            <button onClick={()=>setShowAgreementRef(false)} aria-label="Close"
              style={{position:"absolute",top:14,right:14,background:"#fff",border:"1px solid rgba(195,200,188,0.4)",width:34,height:34,borderRadius:"50%",cursor:"pointer",fontSize:18,color:"#1B1C19",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>×</button>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* Status banner */}
            {!hasCommission ? (
              <div style={{background:"#F7EDD8",border:"1px solid #D6B47C",borderRadius:12,padding:"14px 18px"}}>
                <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#6F5B44",margin:"0 0 4px"}}>Pending — commercial terms</p>
                <p style={{fontFamily:F2,fontSize:13,color:"#1B1C19",margin:0,lineHeight:1.6}}>Your commission rate will be confirmed by Wello before you go live. You can review the agreement below, but acceptance is disabled until your Schedule 1 is complete.</p>
              </div>
            ) : agreementAccepted && !needsReacceptance ? (
              <div style={{background:"#CAECBA",border:"1px solid #A3B18A",borderRadius:12,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                <div>
                  <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#213C18",margin:"0 0 4px"}}>Accepted</p>
                  <p style={{fontFamily:F2,fontSize:13,color:"#213C18",margin:0,lineHeight:1.6}}>You accepted this agreement on <strong>{new Date(bizData.terms_accepted_at).toLocaleString('en-GB',{dateStyle:'long',timeStyle:'short'})}</strong>{bizData.terms_version ? <> (version {bizData.terms_version})</> : null}.</p>
                </div>
                <button onClick={printAgreement}
                  style={{background:"#213C18",color:"#FBF9F4",border:"none",borderRadius:999,padding:"10px 20px",fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                  Download agreement
                </button>
              </div>
            ) : needsReacceptance ? (
              <div style={{background:"#FFE6D9",border:"1px solid #C46A4D",borderRadius:12,padding:"14px 18px"}}>
                <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#C46A4D",margin:"0 0 4px"}}>Re-acceptance required</p>
                <p style={{fontFamily:F2,fontSize:13,color:"#1B1C19",margin:0,lineHeight:1.6}}>Your commission rate has changed since you last accepted this agreement (accepted at {acceptedCommission != null ? `${acceptedCommission}%` : "—"}, now {commissionRateDisplay}). Please review Schedule 1 below and re-accept the updated terms.</p>
              </div>
            ) : (
              <div style={{background:"#F5F3EE",border:"1px solid rgba(195,200,188,0.5)",borderRadius:12,padding:"14px 18px"}}>
                <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 4px"}}>Ready to review</p>
                <p style={{fontFamily:F2,fontSize:13,color:"#1B1C19",margin:0,lineHeight:1.6}}>Your commercial terms are set out in Schedule 1 below. Please read the full agreement, then tick the confirmation box and accept.</p>
              </div>
            )}

            {/* Schedule 1 — live partner data */}
            <div style={{background:"#fff",borderRadius:12,padding:"20px 22px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#54584F",margin:"0 0 4px"}}>Schedule 1</p>
              <h2 style={{fontFamily:F2,fontSize:20,fontWeight:800,color:"#213C18",letterSpacing:"-0.4px",margin:"0 0 16px"}}>Commercial terms</h2>
              {(() => {
                const rows = [
                  ["Partner legal name",    bizData?.legal_name || bizData?.name || "—"],
                  ["Trading name",          bizData?.name || "—"],
                  ["Business type",         (bizData?.business_type ? (businessTypeFor(bizData.business_type)?.label || bizData.business_type) : null) || bizData?.category || "—"],
                  ["Address",               bizData?.address || "—"],
                  ["Email",                 bizData?.email || "—"],
                  ["Phone",                 bizData?.phone || "—"],
                  ["Commission rate",       hasCommission
                    ? <span>{commissionRateDisplay} of the Session Value of each completed Booking</span>
                    : <span style={{color:"#6F5B44"}}>Your commission rate will be confirmed by Wello before you go live</span>],
                  ["Founding Partner",      bizData?.founding_partner ? "Yes" : "No"],
                  ...(bizData?.founding_partner && bizData?.founding_incentive_bookings ? [["Founding incentive", `No commission payable on your first ${bizData.founding_incentive_bookings} completed bookings`]] : []),
                  ["Payout method",         "Stripe Connect transfer in EUR"],
                  ["Payout frequency",      "Weekly"],
                  ...(dashIsPrivate ? [["Coverage areas",   Array.isArray(bizData?.coverage_areas) && bizData.coverage_areas.length > 0 ? bizData.coverage_areas.join(", ") : "—"]] : []),
                ];
                return (
                  <div style={{display:"flex",flexDirection:"column"}}>
                    {rows.map(([k, v], i) => (
                      <div key={i} style={{display:"grid",gridTemplateColumns:"minmax(140px,220px) 1fr",gap:14,padding:"10px 0",borderTop:i===0?"none":"1px solid #E4E2DD"}}>
                        <span style={{fontFamily:F2,fontSize:12,color:"#54584F"}}>{k}</span>
                        <span style={{fontFamily:F2,fontSize:13,color:"#1B1C19",fontWeight:500,lineHeight:1.55}}>{v}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Agreement body — reads from AGREEMENT_SECTIONS constant */}
            <div style={{background:"#fff",borderRadius:12,padding:"20px 22px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#54584F",margin:"0 0 4px"}}>Full agreement</p>
              <h2 style={{fontFamily:F2,fontSize:20,fontWeight:800,color:"#213C18",letterSpacing:"-0.4px",margin:"0 0 16px"}}>Wello Partner Agreement</h2>
              <p style={{fontFamily:F2,fontSize:11,color:"#A3B18A",margin:"0 0 20px",fontWeight:600}}>Version {TERMS_VERSION}</p>
              {AGREEMENT_SECTIONS.map(sec => (
                <div key={sec.id} style={{marginBottom:20}}>
                  <h3 style={{fontFamily:F2,fontSize:14,fontWeight:700,color:"#213C18",margin:"0 0 8px"}}>{sec.id}. {sec.title}</h3>
                  {sec.body.map((para, i) => (
                    <p key={i} style={{fontFamily:F2,fontSize:13,color:"#1B1C19",lineHeight:1.7,margin:"0 0 8px"}}>{para}</p>
                  ))}
                </div>
              ))}
            </div>

            {/* Accept card — hidden once accepted and no re-acceptance needed */}
            {!isPreview && (!agreementAccepted || needsReacceptance) && (
              <div style={{background:"#fff",borderRadius:12,padding:"20px 22px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
                <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:hasCommission?"pointer":"not-allowed"}}>
                  <input type="checkbox" checked={agreementChecked} onChange={e=>setAgreementChecked(e.target.checked)} disabled={!hasCommission}
                    style={{marginTop:3,width:16,height:16,accentColor:"#213C18",cursor:hasCommission?"pointer":"not-allowed"}}/>
                  <span style={{fontFamily:F2,fontSize:13,color:"#1B1C19",lineHeight:1.6}}>I have read and agree to the Wello Partner Agreement including the commercial terms in Schedule 1.</span>
                </label>
                {agreementErr && <p style={{fontFamily:F2,fontSize:12,color:"#C46A4D",margin:"12px 0 0"}}>{agreementErr}</p>}
                <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
                  <button onClick={acceptAgreement} disabled={!hasCommission || !agreementChecked || agreementSaving}
                    style={{padding:"12px 24px",background:(!hasCommission||!agreementChecked||agreementSaving)?"#E4E2DD":"#213C18",color:(!hasCommission||!agreementChecked||agreementSaving)?"#54584F":"#FBF9F4",border:"none",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:(!hasCommission||!agreementChecked||agreementSaving)?"not-allowed":"pointer",letterSpacing:"0.2px"}}>
                    {agreementSaving ? "Saving" : needsReacceptance ? "Re-accept agreement" : "Accept agreement"}
                  </button>
                  <button onClick={printAgreement}
                    style={{padding:"12px 20px",background:"transparent",color:"#213C18",border:"1px solid #213C18",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    Print / preview
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab==="settings"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:560}}>
            {/* Listing status + Go-live / Pause / Resume CTA */}
            {!isPreview && (() => {
              const s = bizData.status;
              const isPausedNow = s === 'paused';
              const isLive      = s === 'approved';
              const bg     = isLive ? "#CAECBA" : isPausedNow ? "#F7EDD8" : "#FADEC0";
              const border = isLive ? "#A3B18A" : isPausedNow ? "#D6B47C" : "#DCC2A6";
              const label  =
                isLive        ? "Live on marketplace" :
                isPausedNow   ? "Paused — hidden from the marketplace. Resume any time." :
                s === 'submitted' ? "Submitted for review. We'll be in touch within 2 working days." :
                "Draft. Submit when you're ready and we'll review.";
              return (
                <div style={{background:bg,border:`1px solid ${border}`,borderRadius:12,padding:"16px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                  <div>
                    <p style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#213C18",margin:"0 0 4px"}}>Listing status</p>
                    <p style={{fontFamily:F2,fontSize:14,fontWeight:600,color:"#213C18",margin:0,lineHeight:1.5}}>{label}</p>
                  </div>
                  {s !== 'approved' && s !== 'submitted' && s !== 'paused' && (
                    <button onClick={goLive} disabled={saving}
                      style={{padding:"10px 20px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:saving?"not-allowed":"pointer",whiteSpace:"nowrap"}}>
                      {saving ? "Submitting" : "Submit for review"}
                    </button>
                  )}
                  {isLive && (
                    <button onClick={pauseListing} disabled={saving}
                      style={{padding:"10px 20px",background:"transparent",color:"#213C18",border:"1px solid #213C18",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:saving?"not-allowed":"pointer",whiteSpace:"nowrap"}}>
                      {saving ? "…" : "Pause listing"}
                    </button>
                  )}
                  {isPausedNow && (
                    <button onClick={resumeListing} disabled={saving}
                      style={{padding:"10px 20px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:saving?"not-allowed":"pointer",whiteSpace:"nowrap"}}>
                      {saving ? "…" : "Resume listing"}
                    </button>
                  )}
                </div>
              );
            })()}
            {saveMsg.kind === "golive" && <p style={{fontFamily:F2,fontSize:12,color:"#213C18",margin:0,textAlign:"center"}}>{saveMsg.text}</p>}

            {/* Profile + contact — Settings tab per spec: name, description, address, website, instagram, phone, email */}
            <div style={{background:"#fff",borderRadius:12,padding:"20px",boxShadow:"0 1px 6px rgba(0,0,0,0.04)"}}>
              <h3 style={{fontFamily:F2,fontSize:14,fontWeight:700,color:"#213C18",margin:"0 0 14px"}}>Business profile</h3>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[
                  { k:"name",      l:"Venue name",     ph:"e.g. Sol Yoga Mallorca" },
                  { k:"address",   l:"Address",        ph:"Street, town, postcode" },
                  { k:"website",   l:"Website",        ph:"https://" },
                  { k:"instagram", l:"Instagram",      ph:"@yourhandle" },
                  { k:"phone",     l:"Phone",          ph:"+34 …" },
                  { k:"email",     l:"Contact email",  ph:"hello@…" },
                ].map(f => (
                  <div key={f.k}>
                    <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:5}}>{f.l}</label>
                    <input value={isPreview ? (f.k==="email"?"hello@solyalmayoga.com":f.k==="phone"?"+34 971 234 567":"") : (settingsForm[f.k] || "")}
                      onChange={e=>!isPreview && setSettingsForm(p=>({...p,[f.k]:e.target.value}))}
                      placeholder={f.ph}
                      style={{...INP}}
                      onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                  </div>
                ))}
                <div>
                  <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:5}}>Description</label>
                  <textarea value={isPreview ? "Your venue description here." : (settingsForm.description || "")}
                    onChange={e=>!isPreview && setSettingsForm(p=>({...p,description:e.target.value}))}
                    rows={3}
                    placeholder="What makes your venue special. Two or three sentences."
                    style={{...INP,resize:"vertical"}}
                    onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                </div>
                <button onClick={saveSettings} disabled={saving||isPreview}
                  style={{alignSelf:"flex-start",padding:"10px 20px",background:(saving||isPreview)?"#E4E2DD":"#213C18",color:(saving||isPreview)?"#54584F":"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:(saving||isPreview)?"not-allowed":"pointer",marginTop:4}}>
                  {saving ? "Saving" : "Save changes"}
                </button>
                {saveMsg.kind === "settings" && <p style={{fontFamily:F2,fontSize:12,color:"#213C18",margin:"4px 0 0"}}>{saveMsg.text}</p>}
                {saveMsg.kind === "err"      && <p style={{fontFamily:F2,fontSize:12,color:"#6F5B44",margin:"4px 0 0"}}>{saveMsg.text}</p>}
              </div>
            </div>

            {/* Integrations */}
            <div style={{background:"#fff",borderRadius:12,padding:"20px",boxShadow:"0 1px 6px rgba(0,0,0,0.04)"}}>
              <h3 style={{fontFamily:F2,fontSize:14,fontWeight:700,color:"#213C18",margin:"0 0 4px"}}>Booking system integration</h3>
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 16px",lineHeight:1.6}}>Connect your existing booking system so your schedule stays in sync automatically.</p>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[
                  {id:"acuity", name:"Acuity Scheduling",desc:"Auto-sync your classes from Acuity", icon:"📅"},
                  {id:"manual", name:"Manage manually",  desc:"Add & edit slots directly in Wello", icon:"✏️"},
                ].map(item=>(
                  <div key={item.id} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",background:integration===item.id?"rgba(33,60,24,0.05)":"#F5F3EE",borderRadius:10,border:integration===item.id?"1px solid rgba(33,60,24,0.2)":"1px solid transparent",transition:"all .15s",cursor:"pointer"}}
                    onClick={()=>setIntegration(item.id)}>
                    <span style={{fontSize:22,flexShrink:0}}>{item.icon}</span>
                    <div style={{flex:1}}>
                      <p style={{fontFamily:F2,fontSize:13,fontWeight:700,color:"#1B1C19",margin:"0 0 2px"}}>{item.name}</p>
                      <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:0}}>{item.desc}</p>
                    </div>
                    <span style={{fontFamily:F2,fontSize:12,color:"#213C18",fontWeight:600}}>{integration===item.id?"✓ Selected":"Select →"}</span>
                  </div>
                ))}
              </div>
              {integration==="acuity"&&(
                <div style={{marginTop:14,padding:"14px 16px",background:"#F5F3EE",borderRadius:10}}>
                  <p style={{fontFamily:F2,fontSize:12,fontWeight:700,color:"#213C18",margin:"0 0 6px"}}>Acuity Scheduling</p>
                  <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:"0 0 10px",lineHeight:1.6}}>Your Acuity credentials and selected appointment types were saved during onboarding. To change them, head back to the onboarding wizard.</p>
                </div>
              )}
              {integration==="manual"&&(
                <div style={{marginTop:14,padding:"14px 16px",background:"#F5F3EE",borderRadius:10}}>
                  <p style={{fontFamily:F2,fontSize:12,fontWeight:700,color:"#213C18",margin:"0 0 4px"}}>Manual mode</p>
                  <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:0,lineHeight:1.6}}>Add & edit slots directly in the Schedule tab.</p>
                </div>
              )}
            </div>

            {/* WhatsApp bookings — pragmatic alternative for partners who
                don't run Acuity. New bookings ping this number and the
                partner can confirm or reschedule right from WhatsApp. */}
            <div style={{background:"#fff",borderRadius:12,padding:"20px",boxShadow:"0 1px 6px rgba(0,0,0,0.04)"}}>
              <h3 style={{fontFamily:F2,fontSize:14,fontWeight:700,color:"#213C18",margin:"0 0 4px"}}>Receive & manage bookings on WhatsApp</h3>
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 14px",lineHeight:1.6}}>Insert your number below and we'll message you on WhatsApp whenever a new booking comes in. You can confirm, reschedule or cancel straight from the chat.</p>
              <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:5}}>WhatsApp number</label>
              <input value={isPreview ? "+34 971 234 567" : (settingsForm.bookings_whatsapp || "")}
                onChange={e=>!isPreview && setSettingsForm(p=>({...p,bookings_whatsapp:e.target.value}))}
                placeholder="+34 6…"
                style={{...INP}}
                onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
              <p style={{fontFamily:F2,fontSize:11,color:"#54584F",fontWeight:300,margin:"6px 0 12px",lineHeight:1.5}}>Include the country code. This stays private and is only used for booking alerts, never shown on your public listing.</p>
              <button onClick={saveSettings} disabled={saving||isPreview}
                style={{padding:"10px 20px",background:(saving||isPreview)?"#E4E2DD":"#213C18",color:(saving||isPreview)?"#54584F":"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:(saving||isPreview)?"not-allowed":"pointer"}}>
                {saving ? "Saving" : "Save WhatsApp number"}
              </button>
            </div>

            {/* Change listing type — surfaces the same picker the partner
                used at registration so they can amend their original choice
                without contacting support. */}
            {!isPreview && onChangeType && (
              <div style={{padding:"16px 18px",border:"1px solid #E4E2DD",borderRadius:12,background:"#fff"}}>
                <p style={{fontFamily:F2,fontSize:10,fontWeight:700,color:"#54584F",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 6px"}}>Listing type</p>
                <p style={{fontFamily:F2,fontSize:13,fontWeight:600,color:"#1B1C19",margin:"0 0 4px"}}>
                  {BUSINESS_TYPES.find(t => t.id === bizData?.business_type)?.label || "Not set"}
                </p>
                <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:"0 0 12px",lineHeight:1.6}}>
                  Switching changes the wizard, dashboard tabs, and customer-facing card to match. Your fields stay intact.
                </p>
                <button onClick={onChangeType}
                  style={{padding:"8px 14px",background:"transparent",color:"#213C18",border:"1px solid #213C18",borderRadius:999,fontFamily:F2,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  Change listing type
                </button>
              </div>
            )}

            {/* Partner agreement — post-acceptance reference. Opens the
                agreement modal in dismissible mode. */}
            {!isPreview && (
              <div style={{marginTop:8,background:"#fff",borderRadius:12,padding:"18px 20px",boxShadow:"0 1px 6px rgba(0,0,0,0.04)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                <div>
                  <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 4px"}}>Partner agreement</p>
                  <p style={{fontFamily:F2,fontSize:13,color:"#1B1C19",margin:0,lineHeight:1.55}}>
                    {agreementAccepted
                      ? <>Accepted on {new Date(bizData.terms_accepted_at).toLocaleDateString('en-GB',{dateStyle:'long'})} · Version {bizData.terms_version || TERMS_VERSION}</>
                      : "Not yet accepted"}
                  </p>
                </div>
                <button onClick={()=>setShowAgreementRef(true)}
                  style={{padding:"9px 18px",background:"transparent",color:"#213C18",border:"1px solid #213C18",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                  View agreement
                </button>
              </div>
            )}

            {/* Danger zone — remove this venue. Only shown to authenticated
                partners (not preview), behind a strong confirm so it's hard
                to fire by accident. */}
            {!isPreview && onDeleteVenue && (
              <div style={{marginTop:32,padding:"18px 20px",border:"1px solid #E8B8A8",borderRadius:12,background:"#FFF5F2"}}>
                <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#C46A4D",letterSpacing:"1px",textTransform:"uppercase",margin:"0 0 6px"}}>Danger zone</p>
                <p style={{fontFamily:F2,fontSize:13,fontWeight:700,color:"#1B1C19",margin:"0 0 4px"}}>Remove this venue</p>
                <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 14px",lineHeight:1.6}}>
                  Permanently deletes <strong>{bizData?.name || "this venue"}</strong> along with its listing, slots, and onboarding progress. This can't be undone. {venues.length > 1 ? "Your other venues are not affected." : "You'll be returned to the application screen — your account stays signed in."}
                </p>
                <button onClick={() => onDeleteVenue(bizData.id)}
                  style={{padding:"10px 18px",background:"#C46A4D",color:"#fff",border:"none",borderRadius:6,fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                  Remove venue
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Interactive 1:1 crop tool. Loads a file, lets the partner pan and zoom
// inside a fixed square viewport, returns the cropped 800x800 blob.
function SquareCropModal({ file, onCancel, onConfirm }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  const VIEWPORT = 320; // CSS pixels for the crop viewport
  const [imgUrl, setImgUrl]           = useState(null);
  const [naturalSize, setNaturalSize] = useState(null); // { w, h }
  const [scale, setScale]             = useState(1);
  const [offset, setOffset]           = useState({ x: 0, y: 0 });
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState("");
  const containerRef                  = useRef(null);

  // Load the picked file into an Image, measure it, compute the minimum scale
  // (cover) so the image always fills the viewport.
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const probe = new Image();
    probe.onload = () => {
      if (!probe.width || !probe.height) {
        setError("Couldn't read that image. Try a JPEG or PNG.");
        return;
      }
      setNaturalSize({ w: probe.width, h: probe.height });
      const init = Math.max(VIEWPORT / probe.width, VIEWPORT / probe.height);
      setScale(init);
      setOffset({ x: 0, y: 0 });
    };
    probe.onerror = () => setError("Couldn't read that image. Try a JPEG or PNG.");
    probe.src = url;
    return () => { URL.revokeObjectURL(url); };
  }, [file]);

  const minScale = naturalSize ? Math.max(VIEWPORT / naturalSize.w, VIEWPORT / naturalSize.h) : 1;
  const maxScale = minScale * 4;

  function clampOffset(off, sc) {
    if (!naturalSize) return off;
    const dispW = naturalSize.w * sc;
    const dispH = naturalSize.h * sc;
    const maxX = (dispW - VIEWPORT) / 2;
    const maxY = (dispH - VIEWPORT) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, off.x)),
      y: Math.max(-maxY, Math.min(maxY, off.y)),
    };
  }

  function handlePointerDown(e) {
    e.preventDefault();
    const startX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const startY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const startOff = { ...offset };
    function move(ev) {
      const cx = ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
      const cy = ev.clientY ?? ev.touches?.[0]?.clientY ?? 0;
      setOffset(clampOffset({ x: startOff.x + (cx - startX), y: startOff.y + (cy - startY) }, scale));
    }
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  }

  function onScaleChange(e) {
    const next = +e.target.value;
    setScale(next);
    setOffset(o => clampOffset(o, next));
  }

  async function confirm() {
    if (!naturalSize || !imgUrl) return;
    setBusy(true); setError("");
    try {
      // Map the viewport (fixed at the centre of the container) back to source
      // pixel coordinates. The image is rendered at naturalSize × scale and
      // translated by offset from the container centre.
      const cropPx = VIEWPORT / scale; // size in source pixels
      const cropX  = naturalSize.w / 2 - offset.x / scale - cropPx / 2;
      const cropY  = naturalSize.h / 2 - offset.y / scale - cropPx / 2;

      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 800;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imgUrl;
      });
      ctx.drawImage(img, cropX, cropY, cropPx, cropPx, 0, 0, 800, 800);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      setBusy(false);
      if (blob) onConfirm(blob);
      else { setError("Couldn't process that crop. Try again."); }
    } catch (e) {
      console.error('SquareCropModal confirm error:', e);
      setError("Something went wrong while cropping. Try a different image.");
      setBusy(false);
    }
  }

  return (
    <div style={{position:"fixed",inset:0,zIndex:5000,background:"rgba(27,28,25,0.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:"clamp(16px,4vw,24px)"}}>
      <div style={{background:T.paper,borderRadius:16,padding:"clamp(20px,3vw,28px)",maxWidth:380,width:"100%",boxShadow:"0 24px 60px rgba(0,0,0,0.4)"}}>
        <h3 style={{fontFamily:F2,fontSize:16,fontWeight:700,color:T.ink,letterSpacing:"-0.3px",margin:"0 0 4px"}}>Position your photo</h3>
        <p style={{fontFamily:F2,fontSize:12,color:T.stone,margin:"0 0 18px",lineHeight:1.5}}>Drag to reposition, slide to zoom. Photos display as 1:1 squares across Wello.</p>

        <div ref={containerRef}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
          style={{position:"relative",width:VIEWPORT,height:VIEWPORT,margin:"0 auto",overflow:"hidden",borderRadius:8,background:"#000",cursor:"grab",userSelect:"none",touchAction:"none"}}>
          {imgUrl && naturalSize && (
            <img src={imgUrl} draggable={false} alt=""
              style={{
                position:"absolute", left: "50%", top: "50%",
                width: naturalSize.w * scale,
                height: naturalSize.h * scale,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                pointerEvents:"none", maxWidth:"none", maxHeight:"none",
              }}/>
          )}
          {/* subtle inset border to suggest the crop frame */}
          <div style={{position:"absolute",inset:0,boxShadow:"inset 0 0 0 1px rgba(255,255,255,0.35)",borderRadius:8,pointerEvents:"none"}}/>
        </div>

        <div style={{margin:"18px 4px 0",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:13,color:T.stone}}>−</span>
          <input type="range" min={minScale} max={maxScale} step={0.01} value={scale} onChange={onScaleChange}
            style={{flex:1,accentColor:T.sage,cursor:"pointer"}}/>
          <span style={{fontSize:15,color:T.stone}}>＋</span>
        </div>

        {error && <p style={{fontFamily:F2,fontSize:12,color:T.clay,margin:"12px 0 0"}}>{error}</p>}

        <div style={{display:"flex",gap:10,marginTop:18}}>
          <button onClick={onCancel} disabled={busy}
            style={{flex:1,padding:"11px",background:"transparent",border:`1px solid ${T.border}`,color:T.stone,borderRadius:8,fontFamily:F2,fontSize:13,fontWeight:600,cursor:busy?"not-allowed":"pointer"}}>
            Cancel
          </button>
          <button onClick={confirm} disabled={busy || !naturalSize}
            style={{flex:1,padding:"11px",background:(busy||!naturalSize)?T.border:T.sage,color:(busy||!naturalSize)?T.stone:"#fff",border:"none",borderRadius:8,fontFamily:F2,fontSize:13,fontWeight:700,cursor:(busy||!naturalSize)?"not-allowed":"pointer"}}>
            {busy ? "Cropping" : "Use this crop"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardingProgressBar({ step, total, doSignOut, onPreview, onBackToDashboard, onRemoveVenue, stepLabels, onJumpToStep }) {
  // Default labels match the seven-step wizard. Caller can override per-flavor
  // (e.g. instructor variants of step 2/4 labels).
  const labels = stepLabels || ["Welcome","Details","Photos","Availability","Pricing","Payout","Review"];
  return (
    <div style={{position:"sticky",top:91,zIndex:40,background:T.bg,borderBottom:`1px solid ${T.border}`,padding:"clamp(10px,2vw,14px) clamp(16px,4vw,28px)"}}>
      <div style={{maxWidth:880,margin:"0 auto"}}>
        {/* Top row: utility buttons (Sign out, Preview, Dashboard, Remove). On
            mobile the row wraps; Preview stays full-width if it's the only
            item on its line so it doesn't end up squished beside Sign out. */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"clamp(8px,2vw,14px)",marginBottom:"clamp(12px,2.5vw,16px)",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:"clamp(8px,2vw,14px)",flexWrap:"wrap"}}>
            {onBackToDashboard&&(
              <button onClick={onBackToDashboard} style={{background:"none",border:"none",color:T.sage,fontFamily:F.body,fontSize:12,cursor:"pointer",fontWeight:600,padding:0,whiteSpace:"nowrap"}}>← Dashboard</button>
            )}
            {onRemoveVenue&&(
              <button onClick={onRemoveVenue} title="Remove this venue and start over"
                style={{background:"none",border:"none",color:T.clay,fontFamily:F.body,fontSize:11,cursor:"pointer",fontWeight:500,padding:0,whiteSpace:"nowrap",textDecoration:"underline"}}>
                Remove venue
              </button>
            )}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"clamp(10px,2vw,14px)",flexWrap:"wrap"}}>
            {step>1&&onPreview&&(
              <button onClick={onPreview}
                style={{display:"inline-flex",alignItems:"center",gap:6,background:T.sage,border:"none",borderRadius:999,color:"#fff",fontFamily:F.body,fontSize:"clamp(12px,1.4vw,13px)",cursor:"pointer",fontWeight:700,padding:"clamp(8px,1.6vw,10px) clamp(14px,2.6vw,18px)",whiteSpace:"nowrap",boxShadow:"0 2px 8px rgba(33,60,24,0.18)",letterSpacing:"-0.2px"}}
                onMouseEnter={e=>e.currentTarget.style.background=T.sage2}
                onMouseLeave={e=>e.currentTarget.style.background=T.sage}>
                👁 Preview my listing
              </button>
            )}
            <button onClick={doSignOut} style={{background:"none",border:"none",color:T.stone,fontFamily:F.body,fontSize:12,cursor:"pointer",fontWeight:300,padding:0}}>Sign out</button>
          </div>
        </div>

        {/* Named step timeline. Each label is clickable IFF the partner has
            already reached or passed that step (jumping forward isn't allowed
            because data on those steps hasn't been entered yet). */}
        <div style={{display:"flex",alignItems:"flex-end",gap:0,overflowX:"auto",scrollbarWidth:"none",paddingBottom:2}}>
          {labels.slice(0, total).map((label, i) => {
            const num = i + 1;
            const isCurrent = num === step;
            const isPast    = num < step;
            const clickable = (isPast || isCurrent) && onJumpToStep;
            return (
              <div key={num} style={{flex:"1 1 0",minWidth:56,display:"flex",flexDirection:"column",alignItems:"center",gap:6,cursor:clickable?"pointer":"default"}}
                onClick={clickable ? () => onJumpToStep(num) : undefined}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:"50%",background:isPast?T.sage:(isCurrent?T.sage:T.bg2),color:isPast||isCurrent?"#fff":T.stone2,fontFamily:F.body,fontSize:11,fontWeight:700,border:isCurrent?`2px solid ${T.sage}`:`1px solid ${T.border}`,transition:"all .15s",boxShadow:isCurrent?"0 0 0 4px rgba(33,60,24,0.08)":"none"}}>
                  {isPast ? "✓" : num}
                </div>
                <span style={{fontFamily:F.body,fontSize:"clamp(9px,1.2vw,10px)",fontWeight:isCurrent?700:400,color:isCurrent?T.ink:isPast?T.sage:T.stone2,letterSpacing:"0.2px",textAlign:"center",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OBtn({ onClick, label, disabled, variant="primary", saving }) {
  return (
    <button onClick={onClick} disabled={disabled||saving}
      style={{padding:"11px 24px",background:variant==="primary"&&!disabled&&!saving?T.sage:variant==="secondary"?"transparent":T.border,color:variant==="secondary"?T.stone:"#fff",border:variant==="secondary"?`1px solid ${T.border}`:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:variant==="secondary"?300:600,cursor:disabled||saving?"not-allowed":"pointer",transition:"background .15s"}}
      onMouseEnter={e=>{if(!disabled&&!saving&&variant==="primary")e.target.style.background=T.sage2;}}
      onMouseLeave={e=>{if(!disabled&&!saving&&variant==="primary")e.target.style.background=T.sage;}}>
      {saving&&variant==="primary"?"Saving…":label}
    </button>
  );
}

function OWrap({ title, sub, children, footer, step, total, doSignOut, onPreview, onBackToDashboard, onRemoveVenue, stepLabels, onJumpToStep, listingTypeLabel, onChangeType }) {
  return (
    <>
      <OnboardingProgressBar step={step} total={total} doSignOut={doSignOut} onPreview={onPreview} onBackToDashboard={onBackToDashboard} onRemoveVenue={onRemoveVenue} stepLabels={stepLabels} onJumpToStep={onJumpToStep}/>
      <div style={{maxWidth:960,margin:"0 auto",padding:"clamp(28px,4vw,48px) clamp(20px,4vw,40px) 100px"}}>
        {/* Listing-type breadcrumb chip — always visible so the partner can
            amend their original choice without hunting through the dashboard. */}
        {listingTypeLabel && (
          <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"5px 10px 5px 12px",background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:999,marginBottom:14}}>
            <span style={{fontFamily:F.body,fontSize:10,fontWeight:600,color:T.sage,letterSpacing:"0.3px"}}>Listing type: <strong style={{fontWeight:700}}>{listingTypeLabel}</strong></span>
            {onChangeType && (
              <button onClick={onChangeType}
                style={{background:"transparent",border:"none",padding:"2px 6px",margin:"-2px -4px -2px 0",fontFamily:F.body,fontSize:10,fontWeight:700,color:T.sage,cursor:"pointer",textDecoration:"underline"}}>
                Change
              </button>
            )}
          </div>
        )}
        <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:"clamp(24px,3vw,32px)",fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 8px"}}>{title}</h1>
        {sub&&<p style={{fontFamily:F.body,fontSize:"clamp(13px,1.5vw,15px)",color:T.stone,fontWeight:300,margin:"0 0 32px",lineHeight:1.7}}>{sub}</p>}
        {children}
        {footer&&<div style={{display:"flex",gap:12,marginTop:40,flexWrap:"wrap"}}>{footer}</div>}
      </div>
    </>
  );
}

function PartnerOnboarding({ bizData, onSubmitted, doSignOut, onBackToDashboard, onRemoveVenue, onChangeType }) {
  const TOTAL = 7;
  const [step, setStep] = useState(bizData.onboarding_step > 0 ? Math.min(bizData.onboarding_step, TOTAL) : 1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [venueName, setVenueName] = useState(bizData.name || "");
  const [venueCategory, setVenueCategory] = useState(bizData.category || "");
  const [venueLocation, setVenueLocation] = useState(bizData.location || "");
  const [desc, setDesc] = useState(bizData.description || "");
  const [address, setAddress] = useState(bizData.address || "");
  const [website, setWebsite] = useState(bizData.website || "");
  const [instagram, setInstagram] = useState(bizData.instagram || "");
  // Private-instructor only: short personal bio + required phone number for
  // SMS booking-request notifications. bio reuses businesses.description's
  // intent but keeps the wording personal; phone is required so the
  // notify-instructor-sms function can reach them.
  const [bio, setBio]   = useState(bizData.bio || "");
  const [phone, setPhone] = useState(bizData.phone || "");
  // Coverage areas: which Mallorca locations the instructor travels to.
  // Replaces the free-text "address" field for private instructors. Saved as
  // a string[] to businesses.coverage_areas; copied into listings.coverage_areas
  // on approval; used by the explore page location filter.
  const [coverageAreas, setCoverageAreas] = useState(
    Array.isArray(bizData.coverage_areas) ? bizData.coverage_areas : []
  );
  function toggleCoverageArea(loc) {
    setCoverageAreas(prev => prev.includes(loc) ? prev.filter(x => x !== loc) : [...prev, loc]);
  }
  // tags = "amenities & offerings" — what the venue advertises. Stored as a
  // string[] in businesses.tags and surfaced as pills on the listing.
  const [tags, setTags] = useState(Array.isArray(bizData.tags) ? bizData.tags : []);
  const [customTag, setCustomTag] = useState("");
  // Opt-in safety window (studio/hotel/spa only; instructors already have
  // their own 48h pending_instructor flow). When on, bookings under 2 hours
  // from now stop appearing on Explore, and every confirmed booking fires a
  // WhatsApp alert with a one-time cancel link valid for 2 hours of 9-19
  // Madrid business time.
  const [safetyWindow, setSafetyWindow] = useState(!!bizData.cancellation_safety_window);
  // Locked to the DB row's business_type (set at registration) so the
  // wizard's flavor can't drift if the partner edits the free-text Category
  // input later. Legacy fallback: rows without business_type fall back to
  // category match for the brief window between this change shipping and the
  // backfill running.
  const isPrivateInstructor = bizData.business_type === 'private_instructor'
    || (!bizData.business_type && isPrivateInstructorCat(bizData.category));
  // Strip any stale blob: URLs that may have leaked into the DB on previous
  // failed uploads — those only exist in the tab that created them and would
  // render as broken images for the partner.
  const isRealUrl = u => typeof u === 'string' && u.length > 0 && !u.startsWith('blob:');
  const [img, setImg] = useState(isRealUrl(bizData.img) ? bizData.img : null);
  const [gallery, setGallery] = useState(
    Array.isArray(bizData.gallery) ? bizData.gallery.filter(isRealUrl) : []
  );
  // Crop modal state — { kind: 'primary'|'gallery', file }
  const [cropTarget, setCropTarget] = useState(null);
  const [photoErr, setPhotoErr]     = useState("");
  const [primaryUploading, setPrimaryUploading] = useState(false);
  const [galleryUploadCount, setGalleryUploadCount] = useState(0);
  // Availability tab default. Priorities:
  //   - Private instructors: locked to manual (they don't sync external
  //     schedules; the effect below re-enforces this).
  //   - Partners who already have slots on file (populated by the admin
  //     tool or a previous manual session) with no Acuity credentials:
  //     default to manual so those slots are visible immediately. This
  //     was the "I filled it out via admin, why is nothing here?" bug.
  //   - Everyone else: Acuity (the primary integration option).
  const [availType, setAvailType] = useState(() => {
    if (isPrivateInstructorCat(bizData.category)) return "manual";
    const hasSlots  = Array.isArray(bizData.slots) && bizData.slots.length > 0;
    const hasAcuity = !!bizData.acuity_key;
    if (hasSlots && !hasAcuity) return "manual";
    return "acuity";
  });
  const [acuityKey, setAcuityKey] = useState(bizData.acuity_key || "");
  const [acuityUserId, setAcuityUserId] = useState(bizData.acuity_user_id || "");
  const [acuityTypes, setAcuityTypes] = useState(bizData.acuity_appointment_types || []);
  const [selectedAcuityIds, setSelectedAcuityIds] = useState(
    new Set((bizData.acuity_appointment_types || []).map(t => t.id))
  );
  const [acuityStatus, setAcuityStatus] = useState(
    (bizData.acuity_appointment_types || []).length ? "success" : "idle"
  ); // idle | loading | success | error
  const [acuityError, setAcuityError] = useState("");
  const [icalUrl, setIcalUrl] = useState(bizData.ical_url || "");

  async function fetchAcuityTypes() {
    if (!acuityUserId.trim() || !acuityKey.trim()) {
      setAcuityError("Enter both your Acuity User ID and API key.");
      setAcuityStatus("error");
      return;
    }
    setAcuityStatus("loading"); setAcuityError("");
    try {
      const { data, error } = await supabase.functions.invoke('acuity-proxy', {
        body: { userId: acuityUserId.trim(), apiKey: acuityKey.trim(), endpoint: 'appointment-types' }
      });
      if (error) {
        setAcuityError("Couldn't reach the Acuity proxy. Check your connection and try again.");
        setAcuityStatus("error"); return;
      }
      if (data?.error) {
        setAcuityError(
          data.status === 401
            ? "Invalid User ID or API key. Find both in Acuity → Business Settings → Integrations → API."
            : `Acuity: ${data.error}`
        );
        setAcuityStatus("error"); return;
      }
      if (!Array.isArray(data)) {
        setAcuityError("Unexpected response from Acuity. Please try again.");
        setAcuityStatus("error"); return;
      }
      setAcuityTypes(data);
      setSelectedAcuityIds(new Set(data.map(t => t.id))); // default: all selected
      setAcuityStatus("success");
    } catch (e) {
      setAcuityError(e?.message || "Couldn't connect to Acuity.");
      setAcuityStatus("error");
    }
  }

  function toggleAcuityType(id) {
    setSelectedAcuityIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const [slots, setSlots] = useState(bizData.slots || []);
  const [cr, setCr] = useState(bizData.cr ? String(bizData.cr) : "");
  const [newSlot, setNewSlot] = useState({ name:"", days:[], time:"09:00", dur:"60 min", spots:10, cr:"", category:"" });

  // Private-instructor availability — kept separate from `slots` so the two
  // models don't tangle. Shape: [{ day: 'Mon', start: '09:00', end: '12:00' }, …]
  // notify-partner-status expands these into hourly request slots on approval.
  const [availabilityWindows, setAvailabilityWindows] = useState(
    Array.isArray(bizData.availability_windows) ? bizData.availability_windows : []
  );
  const [sessionDurationMin, setSessionDurationMin] = useState(
    Number.isFinite(bizData.session_duration_min) && bizData.session_duration_min > 0
      ? bizData.session_duration_min : 60
  );
  // Private-instructor session offerings — each row is one (type, length,
  // price) combo. The expander multiplies offerings × time slots to build
  // the bookable slot rows on approval. Replaces the old single
  // session_duration_min + cr pair so an instructor can offer Yoga 60 min
  // for €50 + Pilates 90 min for €70 from the same windows.
  const [sessionOfferings, setSessionOfferings] = useState(
    Array.isArray(bizData.session_offerings) && bizData.session_offerings.length > 0
      ? bizData.session_offerings.map(o => ({
          type: o?.type || (bizData.category || ""),
          length_min: Number.isFinite(o?.length_min) && o.length_min > 0 ? o.length_min : 60,
          price_eur:  Number.isFinite(o?.price_eur)  && o.price_eur  > 0 ? o.price_eur  : (bizData.cr || 50),
          // Optional per-offering category. Null / empty means inherit the
          // venue's primary category (bizData.category).
          category:   o?.category || '',
        }))
      : []
  );
  const LENGTH_OPTIONS = [30, 45, 60, 75, 90, 120];
  function addOffering() {
    setSessionOfferings(prev => [...prev, {
      type: bizData.category || "Yoga",
      length_min: 60,
      price_eur: bizData.cr || 50,
      category: '',
    }]);
  }
  function updateOffering(idx, patch) {
    setSessionOfferings(prev => prev.map((o, i) => i === idx ? { ...o, ...patch } : o));
  }
  function removeOffering(idx) {
    setSessionOfferings(prev => prev.filter((_, i) => i !== idx));
  }
  function addWindow(day) {
    setAvailabilityWindows(prev => [...prev, { day, start: '09:00', end: '12:00' }]);
  }
  function updateWindow(idx, patch) {
    setAvailabilityWindows(prev => prev.map((w, i) => i === idx ? { ...w, ...patch } : w));
  }
  function removeWindow(idx) {
    setAvailabilityWindows(prev => prev.filter((_, i) => i !== idx));
  }
  const [bookingsWa, setBookingsWa] = useState(bizData.bookings_whatsapp || "");
  const [priceMode, setPriceMode] = useState(bizData.price_mode || "flat");
  const [previewOpen, setPreviewOpen] = useState(false);

  // Prefer the explicit contact_name (populated by the admin tool for
  // studios / spas where bizData.name is a business name). For private
  // instructors, bizData.name IS the person's name so the first word is
  // fair game. If neither is set, greetingName stays null and callers
  // drop the "," Name portion entirely — cleaner than "Welcome to Wello,
  // there." for anonymous rows.
  const greetingName = (bizData.contact_name && bizData.contact_name.trim().split(' ')[0])
    || (isPrivateInstructor && bizData.name ? bizData.name.trim().split(' ')[0] : null);
  // Named step labels surfaced in the new progress timeline.
  const stepLabels = isPrivateInstructor
    ? ["Welcome","Profile","Photos","Availability","Pricing","Payout","Review"]
    : ["Welcome","Details","Photos","Availability","Pricing","Payout","Review"];
  // Allow clicking a past step in the timeline to jump back.
  const onJumpToStep = (n) => {
    if (n >= 1 && n <= step) { setStep(n); window.scrollTo(0, 0); }
  };
  // Human-readable listing type for the breadcrumb chip in OWrap.
  const listingTypeLabel = bizData.business_type
    ? (BUSINESS_TYPES.find(t => t.id === bizData.business_type)?.label || null)
    : null;
  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const DURS = ["30 min","45 min","60 min","75 min","90 min","2 hours","Open"];
  // Common amenities & offerings partners can tick to advertise their venue.
  // Grouped by category so the long flat list isn't overwhelming. The search
  // box on the wizard step filters across every group.
  const AMENITY_GROUPS = [
    { name: "Facilities",        items: ["Showers","Changing rooms","Lockers","Cafe","Wifi","Parking","Air conditioning","Wheelchair access"] },
    { name: "Equipment provided", items: ["Towels provided","Mats provided","Equipment provided"] },
    { name: "Pools & wellness",   items: ["Outdoor pool","Indoor pool","Sauna","Steam room","Hot tub","Jacuzzi"] },
    { name: "Setting",            items: ["Sea views","Mountain views","Beachfront","Rooftop","Olive groves","Garden"] },
    { name: "Suitable for",       items: ["Kids welcome","Beginner friendly","All levels","Advanced","Small groups","Private sessions"] },
    { name: "Languages",          items: ["Multilingual instructors","English spoken","Spanish spoken","German spoken"] },
  ];
  // Flat lookup of every preset value — used to decide which selected tags
  // count as "custom" and need rendering in the bottom chip list.
  const AMENITY_OPTIONS = AMENITY_GROUPS.flatMap(g => g.items);
  const [amenitySearch, setAmenitySearch] = useState("");
  function toggleTag(t) {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }
  function addCustomTag() {
    const t = customTag.trim();
    if (!t) return;
    if (tags.includes(t)) { setCustomTag(""); return; }
    setTags(prev => [...prev, t]);
    setCustomTag("");
  }
  const catAvg = {Yoga:20,Pilates:20,Surfing:40,"Paddle Boarding":30,Kayaking:30,Cycling:20,"Hotel Gym":25,"Pool Access":25,"Fitness Class":15,HIIT:15,Tennis:25,Padel:25,Pickleball:20,"Massage & Spa":60,Meditation:15,"Sound Healing":20,Breathwork:15,Dance:15,"Martial Arts":20,"Outdoor adventure":30,"Private Instructor":60}[bizData.category] ?? 20;
  const INP = {width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:2,fontSize:12,fontFamily:F.body,background:T.paper,color:T.ink,outline:"none",boxSizing:"border-box",transition:"border-color .18s"};
  const FL = {display:"block",fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",color:T.stone,fontFamily:F.body,marginBottom:4};
  const onFi = e => e.target.style.borderColor = T.sage;
  const onBl = e => e.target.style.borderColor = T.border;

  async function saveProgress(updates) {
    setSaving(true);
    // Scope every update to THIS specific business by id. The wizard used to
    // filter by email which silently sprayed updates across every venue
    // owned by the same partner — submitting one venue submitted all of
    // them, etc.
    const { data, error } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', bizData.id)
      .select('id');
    if (error) console.error('saveProgress error:', error.message);
    else if (!data?.length) console.warn('saveProgress: 0 rows updated — check RLS allows partner to update own row');
    else console.log('saveProgress ok, fields saved:', Object.keys(updates).join(', '));
    setSaving(false);
  }

  // Pre-cropped blob upload (used after the SquareCropModal returns a blob).
  // Path layout: <auth-uid>/<bizId>-<slot>-<timestamp>.jpg
  // The storage RLS policy on venue-photos only allows writes where the first
  // folder segment matches auth.uid()::text, so the auth-uid prefix is what
  // makes the write authorized. The business id stays in the filename so we
  // can still tell at a glance which venue a file belongs to.
  async function uploadBlob(blob, slot) {
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) {
        return { url: null, error: 'Not signed in. Please refresh and log back in.' };
      }
      const path = `${uid}/${bizData.id}-${slot}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('venue-photos').upload(path, blob, { contentType:'image/jpeg', upsert:true });
      if (error) {
        console.error('Photo upload error:', error.message);
        return { url: null, error: error.message };
      }
      const url = supabase.storage.from('venue-photos').getPublicUrl(path).data.publicUrl;
      return { url, error: null };
    } catch (e) {
      console.error('Upload exception:', e);
      return { url: null, error: e.message || 'Upload failed.' };
    } finally {
      setUploading(false);
    }
  }
  async function goNext(updates={}) {
    await saveProgress({ ...updates, onboarding_step: step + 1 });
    setStep(s => s + 1);
    window.scrollTo(0, 0);
  }

  async function handleSubmit() {
    setSaving(true);
    const payload = { status: 'submitted', onboarding_step: 7 };
    console.log('handleSubmit: attempting update', { id: bizData.id });

    // Filter by id (NOT email) — multi-venue partners have several rows that
    // share an email and we only want to submit THIS one.
    const { data: d1, error: e1 } = await supabase
      .from('businesses')
      .update(payload)
      .eq('id', bizData.id)
      .select('id, status, email');

    console.log('handleSubmit result:', { data: d1, error: e1 });

    setSaving(false);

    if (e1) {
      console.error('handleSubmit error:', e1.message, e1.code);
      alert('Something went wrong. Please contact hello@wello-wellness.com');
      return;
    }
    if (!d1 || d1.length === 0) {
      console.warn('handleSubmit: update matched 0 rows — check RLS policies allow partner to update their own row');
      alert('Something went wrong. Please contact hello@wello-wellness.com');
      return;
    }
    console.log('handleSubmit: success, status now =', d1[0]?.status);
    onSubmitted();
  }

  function addSlot() {
    if (!newSlot.name.trim() || !newSlot.days.length) return;
    const cr = newSlot.cr === "" ? null : Math.max(1, parseInt(newSlot.cr) || catAvg);
    // Private instructors are always 1-to-1 — force spots to 1 regardless of
    // whatever was in the (disabled) input.
    const spots = isPrivateInstructor ? 1 : newSlot.spots;
    // Category defaults to venue category — only persisted when the partner
    // explicitly overrides so we can distinguish "no override" from "same
    // as venue" and the marketplace filter picks up multi-cat studios.
    const cleanCat = String(newSlot.category || '').trim();
    const category = cleanCat && cleanCat !== bizData.category ? cleanCat : null;
    setSlots(s => [...s, { id:`sl${Date.now()}`, ...newSlot, spots, cr, category }]);
    setNewSlot({ name:"", days:[], time:"09:00", dur:"60 min", spots: isPrivateInstructor ? 1 : 10, cr:"", category:"" });
  }

  if (step===1) return (
    <><OnboardingProgressBar step={step} total={TOTAL} doSignOut={doSignOut} onBackToDashboard={onBackToDashboard} onRemoveVenue={onRemoveVenue} stepLabels={stepLabels} onJumpToStep={onJumpToStep}/>
      <div style={{maxWidth:520,margin:"0 auto",padding:"80px 28px",textAlign:"center"}}>
        <div style={{width:64,height:64,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 24px",fontSize:28}}>👋</div>
        <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:26,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 12px"}}>Welcome to Wello{greetingName ? `, ${greetingName}` : ''}.</h1>
        <p style={{fontFamily:F.body,fontSize:14,color:T.stone,fontWeight:300,lineHeight:1.75,margin:"0 0 8px"}}>Let's get <strong style={{color:T.ink,fontWeight:600}}>{bizData.name}</strong> set up.</p>
        <p style={{fontFamily:F.body,fontSize:13,color:T.stone2,fontWeight:300,margin:"0 0 36px",lineHeight:1.6}}>This takes about 5 minutes. We'll save your progress as you go.</p>
        <button onClick={()=>goNext()} style={{padding:"13px 36px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:13,fontWeight:600,cursor:"pointer"}}
          onMouseEnter={e=>e.target.style.background=T.sage2} onMouseLeave={e=>e.target.style.background=T.sage}>
          Let's start →
        </button>
      </div>
    </>
  );

  // Build BizPanel-compatible preview object (used for both preview button and step 6 review)
  const _DAY_IDX = {Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:0};
  const previewSlots = slots.flatMap(sl=>
    sl.days.map(day=>{
      const target=_DAY_IDX[day]; const curr=new Date().getDay();
      const ahead=(target-curr+7)%7||7;
      const d=new Date(); d.setDate(d.getDate()+ahead);
      return {id:`${sl.id}_${day}`,name:sl.name,date:d.toISOString().slice(0,10),time:sl.time,dur:sl.dur,spots:sl.spots,booked:0,cr:sl.cr||parseInt(cr)||catAvg};
    })
  );
  const previewBiz = {
    id:bizData.id, name:venueName||bizData.name, cat:venueCategory||bizData.category,
    loc:address||venueLocation||bizData.location, img:img||'', desc:desc||'Your description will appear here.',
    cr:parseInt(cr)||catAvg, rating:0, reviews:0, tags, slots:previewSlots,
  };

  if (previewOpen) {
    // Surface every field a guest would see — including private-instructor
    // specifics like coverage areas. Empty states use helpful copy so the
    // partner knows what's missing.
    const checklist = [
      { label: "Photo",        ok: !!img,                          hint: "Add a primary photo in step 3" },
      { label: "Name",         ok: !!(venueName||bizData.name),    hint: "Add your name in step 2" },
      { label: "Description",  ok: !!desc?.trim(),                 hint: "Add a description in step 2" },
      ...(isPrivateInstructor
        ? [
            { label: "Coverage areas", ok: coverageAreas.length > 0,           hint: "Pick at least one Mallorca area in step 2" },
            { label: "Availability",   ok: availabilityWindows.length > 0,     hint: "Add weekly windows in step 4" },
          ]
        : [
            { label: "Address",        ok: !!address?.trim(),                  hint: "Add an address in step 2" },
            { label: "Availability",   ok: slots.length > 0,                   hint: "Add at least one slot in step 4" },
          ]),
    ];
    const allGood = checklist.every(c => c.ok);
    return (
    <div style={{position:"fixed",inset:0,zIndex:3200,background:"rgba(27,28,25,0.78)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",alignItems:"stretch",justifyContent:"flex-start",overflowY:"auto",padding:0}}>
      {/* Header strip — clearly labels this as a preview and gives a big,
          obvious way back to the wizard */}
      <div style={{position:"sticky",top:0,zIndex:1,background:T.ink,padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{maxWidth:720,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <div>
            <p style={{fontFamily:F.body,fontSize:9,fontWeight:700,color:"#D6B47C",letterSpacing:"2px",textTransform:"uppercase",margin:"0 0 2px"}}>Member preview</p>
            <p style={{fontFamily:F.body,fontSize:13,color:"#fff",fontWeight:600,margin:0,letterSpacing:"-0.2px"}}>This is how guests will see your listing on Wello</p>
          </div>
          <button onClick={()=>setPreviewOpen(false)}
            style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",background:"#D6B47C",color:T.ink,border:"none",borderRadius:999,fontFamily:F.body,fontSize:12,fontWeight:700,cursor:"pointer"}}>
            ← Back to setup
          </button>
        </div>
      </div>

      {/* Two-column on wide screens: the listing card on the left, the
          completeness checklist on the right. Stacks vertically on mobile. */}
      <div className="__wp-grid" style={{maxWidth:1000,margin:"24px auto 60px",padding:"0 clamp(16px,4vw,24px)",display:"grid",gridTemplateColumns:"minmax(0, 1fr) minmax(0, 280px)",gap:"clamp(16px,3vw,24px)",width:"100%",alignItems:"start",boxSizing:"border-box"}}>

        {/* ── The listing card itself ── */}
        <div style={{background:T.bg,borderRadius:16,overflow:"hidden",boxShadow:"0 24px 64px rgba(0,0,0,0.28)"}}>
          {/* Hero */}
          <div style={{position:"relative",height:280,background:T.bg2}}>
            {img
              ? <img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
              : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8}}>
                  <span style={{fontSize:32}}>📷</span>
                  <span style={{fontFamily:F.body,fontSize:12,color:T.stone2,fontWeight:300}}>No photo added yet</span>
                </div>}
            <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(27,28,25,0.85) 0%,transparent 55%)"}}/>
            <div style={{position:"absolute",bottom:18,left:20,right:20}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                <span style={{fontFamily:F.body,fontSize:10,fontWeight:700,color:"#fff",background:T.sage,padding:"4px 11px",borderRadius:999}}>{catLabel(venueCategory||bizData.category)}</span>
                {isPrivateInstructor && (
                  <span style={{fontFamily:F.body,fontSize:10,fontWeight:700,color:"#fff",background:"#213C18",padding:"4px 11px",borderRadius:999}}>Private</span>
                )}
                {tags.slice(0,3).map(t=>(
                  <span key={t} style={{fontFamily:F.body,fontSize:10,color:"rgba(255,255,255,0.9)",background:"rgba(255,255,255,0.18)",backdropFilter:"blur(4px)",padding:"4px 11px",borderRadius:999}}>{t}</span>
                ))}
              </div>
              <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:26,fontWeight:700,color:"#fff",margin:0,letterSpacing:"-0.5px"}}>{venueName||bizData.name||(isPrivateInstructor?"Your name appears here":"Your venue name appears here")}</h2>
            </div>
          </div>
          {/* Body */}
          <div style={{padding:"22px 24px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:8}}>
              <span style={{fontFamily:F.body,fontSize:13,color:T.stone,fontWeight:400}}>
                📍 {isPrivateInstructor
                      ? (coverageAreas.length > 0 ? coverageAreas.join(", ") : "Coverage areas will show here")
                      : (address||venueLocation||bizData.location||"Address will show here")}
              </span>
              <span style={{fontFamily:F.body,fontSize:15,color:T.ochre,fontWeight:700}}>◈ {parseInt(cr)||catAvg} <span style={{fontSize:11,color:T.stone2,fontWeight:300}}>per {isPrivateInstructor?"session":"booking"}</span></span>
            </div>
            <p style={{fontFamily:F.body,fontSize:13,color:desc?T.ink:T.stone2,lineHeight:1.7,margin:"0 0 18px",fontWeight:300,fontStyle:desc?"normal":"italic"}}>
              {desc || (isPrivateInstructor ? "Your session description will appear here." : "Your venue description will appear here.")}
            </p>

            {/* Coverage areas (private instructors) */}
            {isPrivateInstructor && coverageAreas.length > 0 && (
              <>
                <div style={{fontFamily:F.body,fontSize:10,fontWeight:700,color:T.sage,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:8}}>Travels to</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:18}}>
                  {coverageAreas.map(loc => (
                    <span key={loc} style={{fontFamily:F.body,fontSize:11,color:T.ink,background:T.bg2,border:`1px solid ${T.border}`,padding:"4px 10px",borderRadius:999,fontWeight:500}}>{loc}</span>
                  ))}
                </div>
              </>
            )}

            {/* Bio (private instructors) */}
            {isPrivateInstructor && bio && (
              <div style={{padding:"14px 16px",background:T.bg2,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:18}}>
                <div style={{fontFamily:F.body,fontSize:10,fontWeight:700,color:T.sage,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:6}}>About</div>
                <p style={{fontFamily:F.body,fontSize:12,color:T.stone,lineHeight:1.7,margin:0,fontWeight:300}}>{bio}</p>
              </div>
            )}

            {/* Amenities pills */}
            {tags.length > 0 && (
              <>
                <div style={{fontFamily:F.body,fontSize:10,fontWeight:700,color:T.sage,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:8}}>Amenities & offerings</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:18}}>
                  {tags.map(t=>(
                    <span key={t} style={{fontFamily:F.body,fontSize:11,color:T.ink,background:T.bg2,border:`1px solid ${T.border}`,padding:"4px 10px",borderRadius:999,fontWeight:500}}>{t}</span>
                  ))}
                </div>
              </>
            )}

            {/* Upcoming slots / availability windows */}
            {previewSlots.length > 0 ? (
              <>
                <div style={{fontFamily:F.body,fontSize:10,fontWeight:700,color:T.sage,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:10}}>{isPrivateInstructor ? "Upcoming request slots" : "Available sessions"}</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {[...new Map(previewSlots.map(s=>[`${s.date}-${s.time}`,s])).values()].slice(0,4).map(sl=>(
                    <div key={sl.id} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 14px",background:T.paper,border:`1px solid ${T.border}`,borderRadius:8}}>
                      <div style={{textAlign:"center",minWidth:44}}>
                        <div style={{fontFamily:F.body,fontSize:15,fontWeight:700,color:T.sage}}>{sl.time}</div>
                        <div style={{fontFamily:F.body,fontSize:9,color:T.stone,fontWeight:300}}>{sl.dur}</div>
                      </div>
                      <div style={{width:1,height:32,background:T.border}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:F.body,fontSize:13,fontWeight:600,color:T.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sl.name}</div>
                        <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>{new Date(sl.date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>
                      </div>
                      <span style={{fontFamily:F.body,fontSize:12,color:T.ochre,fontWeight:700}}>◈ {sl.cr||parseInt(cr)||catAvg}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{padding:"14px 16px",background:T.bg2,border:`1px dashed ${T.border}`,borderRadius:8,textAlign:"center"}}>
                <p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,margin:0,lineHeight:1.6}}>
                  {isPrivateInstructor ? "Set weekly availability windows in step 4 — guests pick a request slot." : "Add at least one slot in step 4 so guests have something to book."}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Completeness checklist ── */}
        <div className="__wp-checklist" style={{background:T.bg,borderRadius:12,padding:"18px 20px",boxShadow:"0 12px 28px rgba(0,0,0,0.15)",position:"sticky",top:90,maxHeight:"calc(100vh - 130px)",overflowY:"auto"}}>
          <p style={{fontFamily:F.body,fontSize:10,fontWeight:700,color:T.stone,letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 12px"}}>Ready to submit?</p>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
            {checklist.map(c => (
              <div key={c.label} style={{display:"flex",alignItems:"flex-start",gap:8}}>
                <span style={{flexShrink:0,width:16,height:16,borderRadius:"50%",background:c.ok?T.sage:T.bg2,color:c.ok?"#fff":T.stone2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,marginTop:1}}>{c.ok?"✓":"·"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontFamily:F.body,fontSize:12,fontWeight:600,color:c.ok?T.ink:T.stone,margin:0}}>{c.label}</p>
                  {!c.ok && (
                    <p style={{fontFamily:F.body,fontSize:10,color:T.stone2,fontWeight:300,margin:"2px 0 0",lineHeight:1.5}}>{c.hint}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{padding:"10px 12px",background:allGood?T.sageXL:T.ochreXL,border:`1px solid ${allGood?T.sageL:T.ochreL}`,borderRadius:6}}>
            <p style={{fontFamily:F.body,fontSize:11,color:allGood?T.sage:T.clay,fontWeight:600,margin:0,lineHeight:1.5}}>
              {allGood ? "Looking good — you're ready to submit on step 7." : "Fill out the highlighted items so your listing is ready to go live."}
            </p>
          </div>
        </div>

      </div>

      {/* Mobile-friendly responsive override */}
      <style>{`
        @media (max-width: 720px) {
          .__wp-grid { grid-template-columns: 1fr !important; }
          .__wp-checklist { position: static !important; max-height: none !important; }
        }
      `}</style>
    </div>
    );
  }

  if (step===2) {
    // Private instructors must provide phone (for SMS booking requests).
    // address is repurposed as "coverage area" — they travel to clients.
    const missing = [];
    if (!desc.trim()) missing.push(isPrivateInstructor ? "about your sessions" : "description");
    if (isPrivateInstructor && !bio.trim())             missing.push("short bio");
    if (isPrivateInstructor && coverageAreas.length===0) missing.push("at least one coverage area");
    if (isPrivateInstructor && !phone.trim())           missing.push("phone number");
    const step2CanContinue = missing.length === 0;
    const missingHint = missing.length === 0 ? null
      : missing.length === 1 ? `Add your ${missing[0]} to continue.`
      : `Still needed: ${missing.join(", ")}.`;
    return (
    <OWrap title={isPrivateInstructor ? "Your instructor profile" : "Your venue details"} sub={isPrivateInstructor ? "Tell guests who you are and where you travel. Your phone number stays private — we use it to text you booking requests." : "Confirm and complete your listing details — this is what guests will see on Wello."} step={step} total={TOTAL} doSignOut={doSignOut} onBackToDashboard={onBackToDashboard} onRemoveVenue={onRemoveVenue} stepLabels={stepLabels} onJumpToStep={onJumpToStep} listingTypeLabel={listingTypeLabel} onChangeType={onChangeType} onPreview={()=>setPreviewOpen(true)}
      footer={[
        <OBtn key="b" saving={saving} onClick={()=>setStep(1)} label="← Back" variant="secondary"/>,
        <OBtn key="n" saving={saving} onClick={()=>goNext({name:venueName,category:venueCategory,location:venueLocation,description:desc,address,website,instagram,tags,bio,phone,coverage_areas:coverageAreas,cancellation_safety_window: isPrivateInstructor ? false : safetyWindow})} label="Save & continue →" disabled={!step2CanContinue}/>,
        missingHint && <span key="h" style={{fontFamily:F.body,fontSize:11,color:T.clay,fontWeight:500,alignSelf:"center"}}>{missingHint}</span>,
      ]}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div style={{gridColumn:"1/-1"}}>
          <label style={FL}>{isPrivateInstructor ? "Your name" : "Venue name"}</label>
          <input value={venueName} onChange={e=>setVenueName(e.target.value)} placeholder={isPrivateInstructor ? "e.g. Maria López" : "Your venue name"}
            style={{...INP}} onFocus={onFi} onBlur={onBl}/>
        </div>
        <div>
          <label style={FL}>Category</label>
          <select value={venueCategory} onChange={e=>setVenueCategory(e.target.value)}
            style={{...INP}} onFocus={onFi} onBlur={onBl}>
            {(() => {
              // Filter to the categories that fit the partner's chosen
              // business type, but ensure the currently saved value remains
              // selectable even if it's outside that set (e.g. admin set it).
              const bt = bizData?.business_type
                ? BUSINESS_TYPES.find(t => t.id === bizData.business_type)
                : null;
              const opts = bt?.suggestedCats?.length ? bt.suggestedCats : CATS.filter(c => c !== "All");
              const list = venueCategory && !opts.includes(venueCategory) ? [venueCategory, ...opts] : opts;
              return list.map(c => <option key={c} value={c}>{catLabel(c)}</option>);
            })()}
          </select>
        </div>
        <div>
          <label style={FL}>{isPrivateInstructor ? "Town / area" : "Location"}</label>
          <input value={venueLocation} onChange={e=>setVenueLocation(e.target.value)} placeholder="e.g. Palma"
            style={{...INP}} onFocus={onFi} onBlur={onBl}/>
        </div>
      </div>
      <label style={FL}>{isPrivateInstructor ? "About your sessions" : "Description"} <span style={{color:T.clay,fontWeight:600}}>*</span></label>
      <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={4} placeholder={isPrivateInstructor ? "What kind of sessions you offer, who they're for, what guests bring or wear…" : "Describe your venue, what makes it special, and what guests can expect…"}
        style={{...INP,resize:"vertical",lineHeight:1.6,marginBottom:16}} onFocus={onFi} onBlur={onBl}/>

      {isPrivateInstructor && (
        <>
          <label style={FL}>Short bio <span style={{color:T.clay,fontWeight:600}}>*</span></label>
          <textarea value={bio} onChange={e=>setBio(e.target.value)} rows={3} placeholder="Your training, qualifications, why you teach. Keep it brief — 2-3 sentences works well."
            style={{...INP,resize:"vertical",lineHeight:1.6,marginBottom:16}} onFocus={onFi} onBlur={onBl}/>
        </>
      )}

      {isPrivateInstructor ? (
        <>
          <label style={FL}>Coverage areas <span style={{color:T.clay,fontWeight:600}}>*</span></label>
          <p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,margin:"0 0 8px",lineHeight:1.6}}>
            Tick every Mallorca location you're willing to travel to. Guests filter by area, so this is how they find you.
          </p>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
            {MALLORCA_LOCATIONS.map(loc => {
              const on = coverageAreas.includes(loc);
              return (
                <button key={loc} type="button" onClick={()=>toggleCoverageArea(loc)}
                  style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${on?T.sage:T.border}`,background:on?T.sage:T.paper,color:on?"#fff":T.ink,fontFamily:F.body,fontSize:11,fontWeight:on?600:400,cursor:"pointer",transition:"all .12s"}}>
                  {on?"✓ ":""}{loc}
                </button>
              );
            })}
          </div>
          {coverageAreas.length > 0 && (
            <p style={{fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:600,margin:"0 0 16px"}}>
              {coverageAreas.length} area{coverageAreas.length!==1?"s":""} selected
            </p>
          )}
        </>
      ) : (
        <>
          <label style={FL}>Address</label>
          <input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Street address, Mallorca"
            style={{...INP,marginBottom:16}} onFocus={onFi} onBlur={onBl}/>
        </>
      )}

      {isPrivateInstructor && (
        <>
          <label style={FL}>Phone number (for booking requests) <span style={{color:T.clay,fontWeight:600}}>*</span></label>
          <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+34 600 000 000"
            style={{...INP,marginBottom:6}} onFocus={onFi} onBlur={onBl}/>
          <p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,margin:"0 0 16px",lineHeight:1.6}}>We text you when someone books. You have 48 hours to confirm or decline. Guests never see your number.</p>
        </>
      )}

      <label style={FL}>Website (optional)</label>
      <input value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://yourwebsite.com"
        style={{...INP,marginBottom:16}} onFocus={onFi} onBlur={onBl}/>
      <label style={FL}>Instagram (optional)</label>
      <input value={instagram} onChange={e=>setInstagram(e.target.value)} placeholder="@yourhandle"
        style={{...INP,marginBottom:24}} onFocus={onFi} onBlur={onBl}/>

      {/* ── Booking safety window (non-instructor only) ─────────
          Optional insurance for genuine conflicts. When on, Explore
          hides slots under 2 hours from now, and every confirmed
          booking sends a WhatsApp alert with a one-time cancel link
          valid for 2 hours of 9-19 Madrid business time. Default off. */}
      {!isPrivateInstructor && (
        <div style={{borderTop:`1px solid ${T.border}`,paddingTop:20,marginTop:4,marginBottom:24}}>
          <label style={{...FL,marginBottom:6}}>Booking safety window (optional)</label>
          <p style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:400,lineHeight:1.6,margin:"0 0 12px"}}>
            Would you like a short window to review new bookings before they are locked in? Bookings are shown as confirmed to customers right away. You will get a WhatsApp alert with the option to cancel within 2 hours if there is a genuine conflict. If you do not respond, the booking simply stands, no action needed in the normal case.
          </p>
          <button type="button" onClick={()=>setSafetyWindow(v=>!v)}
            style={{display:"inline-flex",alignItems:"center",gap:10,padding:"10px 14px",background:safetyWindow?T.sage:T.paper,color:safetyWindow?"#fff":T.ink,border:`1px solid ${safetyWindow?T.sage:T.border}`,borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:"pointer",transition:"all .12s"}}>
            <span style={{width:14,height:14,borderRadius:2,background:safetyWindow?"#fff":T.paper,border:`1px solid ${safetyWindow?"#fff":T.border2}`,display:"inline-flex",alignItems:"center",justifyContent:"center",color:T.sage,fontSize:11,fontWeight:800}}>{safetyWindow?"✓":""}</span>
            {safetyWindow ? "Safety window is on" : "Turn on safety window"}
          </button>
          {safetyWindow && (
            <p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,margin:"10px 0 0",lineHeight:1.6}}>
              Slots less than 2 hours from now will not appear as bookable on Explore. Alerts go to the phone number on file for this venue.
            </p>
          )}
        </div>
      )}

      {/* ── Amenities & offerings ──────────────────────────────── */}
      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:20,marginTop:4}}>
        <label style={{...FL,marginBottom:6}}>Amenities & offerings</label>
        <p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,margin:"0 0 12px",lineHeight:1.6}}>
          Pick what you offer. These show as pills on your listing so guests know what to expect.
        </p>

        {/* Live filter — narrows the visible options as you type */}
        <div style={{position:"relative",marginBottom:14}}>
          <input value={amenitySearch} onChange={e=>setAmenitySearch(e.target.value)}
            placeholder="Search amenities (e.g. sauna, wifi, sea views)…"
            style={{...INP,paddingLeft:32}} onFocus={onFi} onBlur={onBl}/>
          <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:T.stone2,fontSize:13,pointerEvents:"none"}}>⌕</span>
          {amenitySearch && (
            <button type="button" onClick={()=>setAmenitySearch("")} aria-label="Clear search"
              style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",color:T.stone,fontSize:14,cursor:"pointer",padding:"4px 8px",lineHeight:1}}>×</button>
          )}
        </div>

        {/* Selected-count summary */}
        {tags.length > 0 && (
          <p style={{fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:600,margin:"0 0 12px"}}>
            {tags.length} selected
          </p>
        )}

        {/* Grouped pills — each group shows a header, then only the items that
            still match the search term. Groups with zero matches are hidden. */}
        {(()=>{
          const q = amenitySearch.trim().toLowerCase();
          const matches = (s) => !q || s.toLowerCase().includes(q);
          const visibleGroups = AMENITY_GROUPS
            .map(g => ({ ...g, items: g.items.filter(matches) }))
            .filter(g => g.items.length > 0);
          if (visibleGroups.length === 0) {
            return (
              <p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,margin:"0 0 14px"}}>
                No preset match. Use <strong style={{color:T.ink,fontWeight:600}}>Add another</strong> below to add it as a custom tag.
              </p>
            );
          }
          return visibleGroups.map(g => (
            <div key={g.name} style={{marginBottom:14}}>
              <p style={{fontFamily:F.body,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:T.stone,margin:"0 0 6px"}}>{g.name}</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {g.items.map(opt => {
                  const on = tags.includes(opt);
                  return (
                    <button key={opt} type="button" onClick={()=>toggleTag(opt)}
                      style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${on?T.sage:T.border}`,background:on?T.sage:T.paper,color:on?"#fff":T.ink,fontFamily:F.body,fontSize:11,fontWeight:on?600:400,cursor:"pointer",transition:"all .12s"}}>
                      {on?"✓ ":""}{opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ));
        })()}

        {/* Custom tag input */}
        <label style={{...FL,marginBottom:6,marginTop:6}}>Add another</label>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input value={customTag} onChange={e=>setCustomTag(e.target.value)} placeholder="e.g. Heated pool, Cold plunge"
            onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); addCustomTag(); } }}
            style={{...INP,flex:1,marginBottom:0}} onFocus={onFi} onBlur={onBl}/>
          <button type="button" onClick={addCustomTag} disabled={!customTag.trim()}
            style={{padding:"10px 16px",background:customTag.trim()?T.sage:T.bg2,color:customTag.trim()?"#fff":T.stone2,border:"none",borderRadius:2,fontFamily:F.body,fontSize:11,fontWeight:600,cursor:customTag.trim()?"pointer":"not-allowed",whiteSpace:"nowrap"}}>
            Add
          </button>
        </div>
        {/* Custom-added tags (those not in the preset list) shown removable */}
        {tags.filter(t=>!AMENITY_OPTIONS.includes(t)).length>0 && (
          <>
            <label style={{...FL,marginBottom:6}}>Your custom tags</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {tags.filter(t=>!AMENITY_OPTIONS.includes(t)).map(t=>(
                <span key={t} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 8px 6px 12px",borderRadius:999,background:T.sageXL,border:`1px solid ${T.sageL}`,fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:600}}>
                  {t}
                  <button type="button" onClick={()=>toggleTag(t)} aria-label={`Remove ${t}`}
                    style={{background:"transparent",border:"none",cursor:"pointer",color:T.sage,fontSize:14,lineHeight:1,padding:0,marginLeft:2}}>×</button>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </OWrap>
  );
  }

  if (step===3) {
    // Open crop modal for whichever slot the partner just picked a file for.
    function pickPrimary(e) {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-picking the same file later
      if (!file) return;
      if (!/^image\//.test(file.type)) { setPhotoErr("That doesn't look like an image. Pick a JPEG or PNG."); return; }
      setPhotoErr("");
      setCropTarget({ kind: 'primary', file });
    }
    function pickGallery(e) {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (gallery.length >= 4) { setPhotoErr("Up to 4 gallery photos."); return; }
      if (!/^image\//.test(file.type)) { setPhotoErr("That doesn't look like an image. Pick a JPEG or PNG."); return; }
      setPhotoErr("");
      setCropTarget({ kind: 'gallery', file });
    }

    async function onCropConfirmed(blob) {
      const target = cropTarget;
      setCropTarget(null);
      if (!target) return;
      const localUrl = URL.createObjectURL(blob);

      if (target.kind === 'primary') {
        setImg(localUrl);
        setPrimaryUploading(true);
        const { url, error } = await uploadBlob(blob, 'primary');
        setPrimaryUploading(false);
        if (error) {
          setPhotoErr("Couldn't upload your primary photo. " + error);
          setImg(null);
        } else if (url) {
          setImg(url);
          // Save img to DB immediately so it's not lost if the partner closes.
          await saveProgress({ img: url });
        }
      } else {
        // Gallery — append the local preview, swap to remote URL once uploaded.
        const tempIdx = gallery.length;
        setGallery(g => [...g, localUrl]);
        setGalleryUploadCount(c => c + 1);
        const { url, error } = await uploadBlob(blob, `gallery-${tempIdx}-${Date.now()}`);
        setGalleryUploadCount(c => c - 1);
        if (error) {
          setPhotoErr("Couldn't upload that gallery photo. " + error);
          setGallery(g => g.filter(u => u !== localUrl));
        } else if (url) {
          setGallery(g => {
            const next = g.map(u => (u === localUrl ? url : u));
            saveProgress({ gallery: next });
            return next;
          });
        }
      }
    }

    function removePrimary() { setImg(null); }
    function removeGalleryAt(i) {
      setGallery(g => {
        const next = g.filter((_, gi) => gi !== i);
        saveProgress({ gallery: next });
        return next;
      });
    }

    const totalUploading = primaryUploading || galleryUploadCount > 0;

    return (
      <OWrap title="Add photos" sub="A square primary photo is required. Drag and zoom to set the crop. Up to four extras for your gallery." step={step} total={TOTAL} doSignOut={doSignOut} onBackToDashboard={onBackToDashboard} onRemoveVenue={onRemoveVenue} stepLabels={stepLabels} onJumpToStep={onJumpToStep} listingTypeLabel={listingTypeLabel} onChangeType={onChangeType} onPreview={()=>setPreviewOpen(true)}
        footer={[<OBtn key="b" saving={saving} onClick={()=>setStep(2)} label="← Back" variant="secondary"/>,
                 <OBtn key="n" saving={saving} onClick={()=>goNext({img,gallery})} label="Save & continue →" disabled={!img||totalUploading}/>]}>
        <label style={FL}>Primary photo <span style={{color:T.clay,fontWeight:600}}>*</span></label>
        <div onClick={()=>!totalUploading&&document.getElementById('wph-primary').click()}
          style={{width:"100%",maxWidth:240,aspectRatio:"1",background:img?"transparent":T.bg2,border:img?"none":`2px dashed ${T.border}`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",cursor:totalUploading?"wait":"pointer",marginBottom:8,overflow:"hidden",position:"relative"}}>
          {img ? <>
            <img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            {primaryUploading && (
              <div style={{position:"absolute",inset:0,background:"rgba(27,28,25,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <div style={{display:"inline-flex",alignItems:"center",gap:5,padding:"8px 14px",background:"rgba(255,255,255,0.95)",borderRadius:999}}>
                  {[0,1,2].map(i=>(<span key={i} style={{width:6,height:6,borderRadius:"50%",background:T.sage,animation:`pulse 1.2s ease-in-out infinite ${i*0.2}s`}}/>))}
                  <span style={{fontFamily:F.body,fontSize:10,fontWeight:700,color:T.sage,letterSpacing:"0.5px"}}>Uploading</span>
                </div>
              </div>
            )}
            {!primaryUploading && (
              <div onClick={e=>{e.stopPropagation();removePrimary();}} style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,0.55)",borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                <span style={{color:"#fff",fontSize:11,lineHeight:1}}>×</span>
              </div>
            )}
          </> : <div style={{textAlign:"center",padding:16}}>
            <div style={{fontSize:24,marginBottom:4}}>📷</div>
            <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300}}>Click to pick a photo</div>
          </div>}
        </div>
        {!img && <p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,margin:"0 0 18px"}}>A square primary photo is required to continue.</p>}
        {img && <p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,margin:"0 0 18px"}}>Want a different crop or photo? Tap × and pick again.</p>}
        <input id="wph-primary" type="file" accept="image/*" style={{display:"none"}} onChange={pickPrimary}/>

        <label style={FL}>Gallery photos (up to 4)</label>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:8}}>
          {gallery.map((url,i)=>{
            const isLocal = url.startsWith('blob:');
            return (
              <div key={i} style={{aspectRatio:"1",borderRadius:6,overflow:"hidden",position:"relative",background:T.bg2}}>
                <img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                {isLocal && (
                  <div style={{position:"absolute",inset:0,background:"rgba(27,28,25,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <div style={{display:"inline-flex",alignItems:"center",gap:3,padding:"4px 8px",background:"rgba(255,255,255,0.95)",borderRadius:999}}>
                      {[0,1,2].map(i=>(<span key={i} style={{width:4,height:4,borderRadius:"50%",background:T.sage,animation:`pulse 1.2s ease-in-out infinite ${i*0.2}s`}}/>))}
                    </div>
                  </div>
                )}
                {!isLocal && (
                  <div onClick={()=>removeGalleryAt(i)} style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,0.55)",borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                    <span style={{color:"#fff",fontSize:10,lineHeight:1}}>×</span>
                  </div>
                )}
              </div>
            );
          })}
          {gallery.length<4&&(
            <div onClick={()=>!totalUploading&&document.getElementById('wph-gallery').click()} style={{aspectRatio:"1",background:T.bg2,border:`2px dashed ${T.border}`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",cursor:totalUploading?"wait":"pointer"}}>
              <span style={{fontSize:20,color:T.stone2}}>+</span>
            </div>
          )}
        </div>
        <input id="wph-gallery" type="file" accept="image/*" style={{display:"none"}} onChange={pickGallery}/>

        {photoErr && (
          <div style={{background:"#FFF5F5",border:`1px solid ${T.clay}`,borderRadius:6,padding:"10px 12px",marginTop:14}}>
            <p style={{fontFamily:F.body,fontSize:11,color:T.clay,fontWeight:600,margin:"0 0 2px"}}>Couldn't add that photo</p>
            <p style={{fontFamily:F.body,fontSize:11,color:T.stone,margin:0,lineHeight:1.5}}>{photoErr}</p>
          </div>
        )}

        {/* Crop modal — opens whenever a file is picked */}
        {cropTarget && (
          <SquareCropModal
            file={cropTarget.file}
            onCancel={()=>setCropTarget(null)}
            onConfirm={onCropConfirmed}
          />
        )}
      </OWrap>
    );
  }

  if (step===4) return (
    <OWrap title={isPrivateInstructor ? "Your availability" : "List your availabilities"} sub={isPrivateInstructor ? "Set when you're available for 1-to-1 sessions. Each booking is a single private session." : "Connect Acuity Scheduling to sync your classes automatically, or add slots manually — you can always update this later."} step={step} total={TOTAL} doSignOut={doSignOut} onBackToDashboard={onBackToDashboard} onRemoveVenue={onRemoveVenue} stepLabels={stepLabels} onJumpToStep={onJumpToStep} listingTypeLabel={listingTypeLabel} onChangeType={onChangeType} onPreview={()=>setPreviewOpen(true)}
      footer={[<OBtn key="b" saving={saving} onClick={()=>setStep(3)} label="← Back" variant="secondary"/>,
               <OBtn key="n" saving={saving} onClick={()=>{
                 if (availType === "acuity") {
                   const selected = acuityTypes.filter(t => selectedAcuityIds.has(t.id));
                   // Mirror each selected Acuity type as a businesses.slots entry so it
                   // expands into concrete slot rows on approval. acuity_type_id carries
                   // through so bookings-sync can pass it as appointmentTypeID to Acuity.
                   const slotsFromAcuity = selected.map(t => ({
                     id: `acuity-${t.id}`,
                     name: t.name || "",
                     days: [],
                     time: "09:00",
                     dur: t.duration ? `${t.duration} min` : "60 min",
                     spots: 10,
                     cr: Math.max(1, Math.round(parseFloat(t.price) || (+cr || catAvg))),
                     acuity_type_id: t.id,
                   }));
                   goNext({
                     acuity_key: acuityKey.trim(),
                     acuity_user_id: acuityUserId.trim(),
                     acuity_appointment_types: selected,
                     slots: slotsFromAcuity,
                     bookings_whatsapp: bookingsWa.trim() || null,
                   });
                 } else if (availType === "ical") {
                   goNext({ ical_url: icalUrl.trim(), bookings_whatsapp: bookingsWa.trim() || null });
                 } else if (isPrivateInstructor) {
                   // Private instructor: save weekly windows + session offerings.
                   // notify-partner-status iterates over windows × offerings to
                   // build the bookable slot rows on approval. session_duration_min
                   // and cr still saved as fallbacks for any legacy paths.
                   // Empty category strings map to null so "inherit venue"
                   // is stored as absence rather than an empty override.
                   const offeringsClean = sessionOfferings.map(o => ({
                     type: o.type,
                     length_min: o.length_min,
                     price_eur: o.price_eur,
                     category: (o.category && String(o.category).trim()) || null,
                   }));
                   goNext({
                     availability_windows: availabilityWindows,
                     session_offerings: offeringsClean,
                     session_duration_min: sessionDurationMin,
                     cr: parseInt(cr) || (sessionOfferings[0]?.price_eur ?? catAvg),
                     bookings_whatsapp: bookingsWa.trim() || null,
                   });
                 } else {
                   // Same normalisation for the studio slot path — strip
                   // empty category strings to null.
                   const slotsClean = slots.map(sl => ({
                     ...sl,
                     category: (sl.category && String(sl.category).trim()) || null,
                   }));
                   goNext({ slots: slotsClean, bookings_whatsapp: bookingsWa.trim() || null });
                 }
               }} label="Save & continue →"/>]}>
      {isPrivateInstructor && (
        <div style={{background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:6,padding:"12px 14px",marginBottom:20}}>
          <div style={{fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:700,marginBottom:3,letterSpacing:"0.3px"}}>Each slot is a 1-to-1 private session</div>
          <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,lineHeight:1.55}}>Bookings request your time — you have 48 hours to confirm or decline by SMS or in your dashboard. Slots must be at least 4 days out.</div>
        </div>
      )}
      {!isPrivateInstructor && <label style={FL}>Connect to booking system</label>}
      {!isPrivateInstructor && <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
        {[
          {id:"acuity", name:"Acuity Scheduling", desc:"Auto-sync your classes from Acuity",                                    icon:"📅"},
          {id:"ical",   name:"iCal Feed",         desc:"One-way sync from any calendar (Google, Apple, Outlook…)",              icon:"🔗"},
          {id:"manual", name:"Manage manually",   desc:"Add & edit slots directly in Wello",                                    icon:"✏️"},
        ].map(item => {
          const selected = availType === item.id;
          return (
            <div key={item.id}
              onClick={() => setAvailType(item.id)}
              style={{
                display:"flex",alignItems:"center",gap:12,padding:"12px 14px",
                background: selected ? "rgba(33,60,24,0.06)" : T.bg2,
                border: `1px solid ${selected ? T.sage : T.border}`,
                borderRadius:8,cursor:"pointer",transition:"all .15s",
              }}>
              <span style={{fontSize:20,flexShrink:0}}>{item.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <span style={{fontFamily:F.body,fontSize:12,fontWeight:700,color:T.ink}}>{item.name}</span>
                <p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,margin:"2px 0 0"}}>{item.desc}</p>
              </div>
              <span style={{fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:600,flexShrink:0}}>
                {selected ? "✓ Selected" : "Select →"}
              </span>
            </div>
          );
        })}
      </div>}
      {availType==="acuity" ? (
        <>
          <div style={{background:T.ochreXL,border:`1px solid ${T.ochreL}`,borderRadius:6,padding:"10px 12px",marginBottom:16}}>
            <div style={{fontFamily:F.body,fontSize:11,color:T.clay,fontWeight:600,marginBottom:2}}>Heads up — Acuity API access requires a paid plan</div>
            <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,lineHeight:1.5}}>Acuity charges ~$16/month for API access. Find your User ID and API key in Acuity → Business Settings → Integrations → API.</div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div>
              <label style={FL}>Acuity User ID</label>
              <input value={acuityUserId} onChange={e=>{setAcuityUserId(e.target.value);if(acuityStatus==="error")setAcuityStatus("idle");}} placeholder="e.g. 12345678"
                style={{...INP}} onFocus={onFi} onBlur={onBl}/>
              <p style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,margin:"4px 0 0"}}>Find this in your Acuity account under Integrations → API</p>
            </div>
            <div>
              <label style={FL}>Acuity API key</label>
              <input value={acuityKey} onChange={e=>{setAcuityKey(e.target.value);if(acuityStatus==="error")setAcuityStatus("idle");}} placeholder="Your Acuity API key" type="password"
                style={{...INP}} onFocus={onFi} onBlur={onBl}/>
            </div>
          </div>

          <button onClick={fetchAcuityTypes} disabled={acuityStatus==="loading"||!acuityUserId.trim()||!acuityKey.trim()}
            style={{padding:"10px 18px",background:acuityStatus==="loading"||!acuityUserId.trim()||!acuityKey.trim()?T.border:T.sage,color:acuityStatus==="loading"||!acuityUserId.trim()||!acuityKey.trim()?T.stone:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:11,fontWeight:600,cursor:acuityStatus==="loading"||!acuityUserId.trim()||!acuityKey.trim()?"not-allowed":"pointer",marginBottom:14}}>
            {acuityStatus==="loading" ? "Connecting…" : acuityStatus==="success" ? "↻ Refresh classes from Acuity" : "Connect & fetch classes"}
          </button>

          {acuityStatus==="error" && (
            <div style={{background:"#FFF5F5",border:`1px solid ${T.clay}`,borderRadius:6,padding:"10px 12px",marginBottom:14}}>
              <div style={{fontFamily:F.body,fontSize:11,color:T.clay,fontWeight:600,marginBottom:2}}>Couldn't connect</div>
              <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,lineHeight:1.5}}>{acuityError}</div>
            </div>
          )}

          {acuityStatus==="success" && acuityTypes.length>0 && (
            <div style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <label style={{...FL,marginBottom:0}}>Pick which classes to list on Wello</label>
                <span style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>{selectedAcuityIds.size} of {acuityTypes.length} selected</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:280,overflowY:"auto",border:`1px solid ${T.border}`,borderRadius:6,padding:6,background:T.paper}}>
                {acuityTypes.map(t => {
                  const checked = selectedAcuityIds.has(t.id);
                  return (
                    <label key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:checked?T.sageXL:T.bg2,border:`1px solid ${checked?T.sageL:T.border}`,borderRadius:4,cursor:"pointer",transition:"all .12s"}}>
                      <input type="checkbox" checked={checked} onChange={()=>toggleAcuityType(t.id)}
                        style={{accentColor:T.sage,cursor:"pointer",flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:F.body,fontSize:12,color:T.ink,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name || "Untitled class"}</div>
                        <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>
                          {t.duration ? `${t.duration} min` : "—"}
                          {t.price ? ` · ${t.price}${typeof t.price === "string" && !t.price.match(/[€$£]/) ? "" : ""}` : ""}
                          {t.category ? ` · ${t.category}` : ""}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <p style={{fontFamily:F.body,fontSize:10,color:T.stone2,fontWeight:300,margin:"8px 0 0"}}>We'll save the selected classes with your listing. Live calendar sync (concrete dates) ships with the customer launch.</p>
            </div>
          )}

          {acuityStatus==="success" && acuityTypes.length===0 && (
            <div style={{background:T.bg2,borderRadius:6,padding:"10px 12px",marginBottom:8}}>
              <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,lineHeight:1.5}}>Connected, but no appointment types were returned by Acuity. Create some in your Acuity dashboard then click Refresh.</div>
            </div>
          )}
        </>
      ) : availType==="ical" ? (
        <>
          <div style={{background:T.bg2,border:`1px solid ${T.border}`,borderRadius:6,padding:"10px 12px",marginBottom:16}}>
            <div style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:600,marginBottom:2}}>One-way sync from any iCal feed</div>
            <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,lineHeight:1.5}}>Works with Google Calendar, Apple Calendar, Outlook, or any tool that exports an iCal URL. Wello reads your feed periodically to pull availability; bookings made on Wello don't write back to your calendar.</div>
          </div>
          <div>
            <label style={FL}>iCal feed URL</label>
            <input value={icalUrl} onChange={e=>setIcalUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
              style={{...INP}} onFocus={onFi} onBlur={onBl}/>
            <p style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,margin:"4px 0 0"}}>
              In Google Calendar: Settings → your calendar → Integrate calendar → "Secret address in iCal format".
              In Apple Calendar: right-click the calendar → Share Calendar → Public Calendar → copy URL.
            </p>
          </div>
        </>
      ) : isPrivateInstructor ? (
        <>
          {/* What you offer — define one row per (type, length, price). Each
              row generates its own slot variants inside your weekly windows. */}
          <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:8,padding:16,marginBottom:16}}>
            <div style={{fontFamily:F.body,fontSize:11,fontWeight:600,color:T.ink,marginBottom:6}}>What you offer</div>
            <p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,margin:"0 0 12px",lineHeight:1.55}}>
              Add one row per session type. Different types and lengths can have different prices. Guests pick the one they want when they book.
            </p>
            {sessionOfferings.length === 0 && (
              <p style={{fontFamily:F.body,fontSize:11,color:T.stone2,fontWeight:300,fontStyle:"italic",margin:"0 0 10px"}}>No offerings yet. Add at least one below.</p>
            )}
            {sessionOfferings.map((off, idx) => (
              <div key={idx} style={{display:"grid",gridTemplateColumns:"1fr 110px 110px 130px 32px",gap:8,alignItems:"center",marginBottom:8}}>
                <input value={off.type} onChange={e=>updateOffering(idx,{type:e.target.value})}
                  placeholder="e.g. Yoga"
                  style={{...INP,marginBottom:0}} onFocus={onFi} onBlur={onBl}/>
                <select value={off.length_min} onChange={e=>updateOffering(idx,{length_min:parseInt(e.target.value,10)})}
                  style={{...INP,marginBottom:0}} onFocus={onFi} onBlur={onBl}>
                  {LENGTH_OPTIONS.map(m => <option key={m} value={m}>{m} min</option>)}
                </select>
                <div style={{position:"relative"}}>
                  <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.stone,fontFamily:F.body,fontSize:12,fontWeight:600,pointerEvents:"none"}}>€</span>
                  <input type="number" min="1" value={off.price_eur}
                    onChange={e=>updateOffering(idx,{price_eur:parseInt(e.target.value,10)||0})}
                    style={{...INP,paddingLeft:22,marginBottom:0}} onFocus={onFi} onBlur={onBl}/>
                </div>
                {/* Per-offering category. Empty = inherit venue category
                    (bizData.category). Used to surface a "Massage" offering
                    on a Yoga studio in the Massage filter. */}
                <select value={off.category || ''} onChange={e=>updateOffering(idx,{category:e.target.value})}
                  style={{...INP,marginBottom:0}} onFocus={onFi} onBlur={onBl}>
                  <option value="">Venue category</option>
                  {CATS.filter(c => c !== 'All' && c !== bizData.category).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button type="button" onClick={()=>removeOffering(idx)} aria-label="Remove offering"
                  style={{background:"transparent",border:"none",color:T.stone,fontSize:18,cursor:"pointer",padding:"0 4px",lineHeight:1}}>×</button>
              </div>
            ))}
            <button type="button" onClick={addOffering}
              style={{background:"transparent",border:`1px dashed ${T.border}`,color:T.sage,fontFamily:F.body,fontSize:11,fontWeight:600,padding:"6px 14px",borderRadius:999,cursor:"pointer",marginTop:4}}>
              + Add offering
            </button>
          </div>

          {/* Weekly availability — when you're free to teach. */}
          <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:8,padding:16,marginBottom:16}}>
            <div style={{fontFamily:F.body,fontSize:11,fontWeight:600,color:T.ink,marginBottom:6}}>Your weekly availability</div>
            <p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,margin:"0 0 12px",lineHeight:1.55}}>
              Block out the time windows when you're free to teach. We'll generate bookable slots for each offering inside every window.
            </p>

            {DAYS.map(day => {
              const dayWindows = availabilityWindows
                .map((w, idx) => ({ ...w, idx }))
                .filter(w => w.day === day);
              const enabled = dayWindows.length > 0;
              return (
                <div key={day} style={{borderTop:`1px solid ${T.border}`,padding:"12px 0"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:dayWindows.length?10:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontFamily:F.body,fontSize:12,fontWeight:600,color:enabled?T.ink:T.stone2,minWidth:40}}>{day}</span>
                      {!enabled && (
                        <span style={{fontFamily:F.body,fontSize:10,color:T.stone2,fontWeight:300}}>Not available</span>
                      )}
                    </div>
                    <button type="button" onClick={()=>addWindow(day)}
                      style={{background:"transparent",border:`1px dashed ${T.border}`,color:T.sage,fontFamily:F.body,fontSize:10,fontWeight:600,padding:"4px 10px",borderRadius:999,cursor:"pointer"}}>
                      + Add window
                    </button>
                  </div>
                  {dayWindows.map(w => (
                    <div key={w.idx} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <input type="time" value={w.start} onChange={e=>updateWindow(w.idx,{start:e.target.value})}
                        style={{...INP,flex:"0 0 110px",marginBottom:0}} onFocus={onFi} onBlur={onBl}/>
                      <span style={{fontFamily:F.body,fontSize:11,color:T.stone}}>to</span>
                      <input type="time" value={w.end} onChange={e=>updateWindow(w.idx,{end:e.target.value})}
                        style={{...INP,flex:"0 0 110px",marginBottom:0}} onFocus={onFi} onBlur={onBl}/>
                      <button type="button" onClick={()=>removeWindow(w.idx)} aria-label="Remove window"
                        style={{background:"transparent",border:"none",color:T.stone,fontSize:16,cursor:"pointer",padding:"0 6px",lineHeight:1}}>×</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

        </>
      ) : (
        <>
          <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:8,padding:16,marginBottom:16}}>
            <div style={{fontFamily:F.body,fontSize:11,fontWeight:600,color:T.ink,marginBottom:12}}>Add an availability</div>
            <label style={FL}>Name</label>
            <input value={newSlot.name} onChange={e=>setNewSlot(p=>({...p,name:e.target.value}))} placeholder="e.g. Morning class, Court hire, Open swim…"
              style={{...INP,marginBottom:12}} onFocus={onFi} onBlur={onBl}/>
            {/* Per-session category. Studios that run multiple modalities
                (yoga + sound healing + breathwork) use this so each
                session surfaces in the correct marketplace filter without
                changing the venue's primary theme. Empty = inherit venue
                category. */}
            <label style={FL}>Category</label>
            <select value={newSlot.category || ''} onChange={e=>setNewSlot(p=>({...p,category:e.target.value}))} style={{...INP,marginBottom:4}} onFocus={onFi} onBlur={onBl}>
              <option value="">Same as venue ({bizData.category || 'unset'})</option>
              {CATS.filter(c => c !== 'All' && c !== bizData.category).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <p style={{fontFamily:F.body,fontSize:10,color:T.stone2,margin:'0 0 12px',lineHeight:1.4}}>
              Pick a different category if this session is not the same as your venue's primary theme. Members filtering by this category will see this session.
            </p>
            <label style={FL}>Days</label>
            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
              {DAYS.map(d=>(
                <button key={d} onClick={()=>setNewSlot(p=>({...p,days:p.days.includes(d)?p.days.filter(x=>x!==d):[...p.days,d]}))}
                  style={{padding:"5px 10px",background:newSlot.days.includes(d)?T.sage:T.bg2,color:newSlot.days.includes(d)?"#fff":T.stone,border:"none",borderRadius:2,fontFamily:F.body,fontSize:10,fontWeight:newSlot.days.includes(d)?600:300,cursor:"pointer"}}>
                  {d}
                </button>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div>
                <label style={FL}>Start time</label>
                <input type="time" value={newSlot.time} onChange={e=>setNewSlot(p=>({...p,time:e.target.value}))} style={{...INP}} onFocus={onFi} onBlur={onBl}/>
              </div>
              <div>
                <label style={FL}>Duration</label>
                <select value={newSlot.dur} onChange={e=>setNewSlot(p=>({...p,dur:e.target.value}))} style={{...INP}} onFocus={onFi} onBlur={onBl}>
                  {DURS.map(d=><option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div>
                <label style={FL}>Max spots (capacity)</label>
                {isPrivateInstructor ? (
                  <input type="text" value="1 (private)" disabled
                    style={{...INP,background:T.bg2,color:T.stone2,cursor:"not-allowed"}}/>
                ) : (
                  <input type="number" min="1" value={newSlot.spots} onChange={e=>setNewSlot(p=>({...p,spots:parseInt(e.target.value)||1}))} style={{...INP}} onFocus={onFi} onBlur={onBl}/>
                )}
              </div>
              <div>
                <label style={FL}>Price per booking (€)</label>
                <div style={{position:"relative"}}>
                  <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:T.stone,fontFamily:F.body,fontSize:13,fontWeight:600,pointerEvents:"none"}}>€</span>
                  <input type="number" min="1" value={newSlot.cr} onChange={e=>setNewSlot(p=>({...p,cr:e.target.value}))} placeholder={String(catAvg)} style={{...INP,paddingLeft:24}} onFocus={onFi} onBlur={onBl}/>
                </div>
              </div>
            </div>
            <button onClick={addSlot} disabled={!newSlot.name.trim()||!newSlot.days.length}
              style={{padding:"8px 18px",background:newSlot.name.trim()&&newSlot.days.length?T.sage:T.border,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:11,fontWeight:600,cursor:newSlot.name.trim()&&newSlot.days.length?"pointer":"not-allowed"}}>
              Add availability
            </button>
          </div>
          {slots.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {slots.map(sl=>(
                <div key={sl.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:T.paper,border:`1px solid ${T.border}`,borderRadius:6,gap:8,flexWrap:"wrap"}}>
                  <div style={{minWidth:0,flex:"1 1 200px"}}>
                    <span style={{fontFamily:F.body,fontSize:12,fontWeight:600,color:T.ink}}>{sl.name}</span>
                    {sl.category && sl.category !== bizData.category && (
                      <span style={{marginLeft:8,padding:"1px 7px",background:T.sageXL,color:T.sage,borderRadius:999,fontFamily:F.body,fontSize:9,fontWeight:700,letterSpacing:0.4,textTransform:"uppercase"}}>{sl.category}</span>
                    )}
                    <span style={{fontFamily:F.body,fontSize:10,color:T.stone,marginLeft:8,fontWeight:300}}>{sl.days.join(", ")} · {sl.time} · {sl.dur} · {sl.spots} spots{sl.cr ? ` · ◈ ${sl.cr}` : ""}</span>
                  </div>
                  <button onClick={()=>setSlots(s=>s.filter(x=>x.id!==sl.id))} style={{background:"none",border:"none",color:T.stone2,cursor:"pointer",fontSize:16,padding:"0 4px",lineHeight:1}}>×</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <div style={{marginTop:24,paddingTop:20,borderTop:`1px solid ${T.border}`}}>
        <label style={FL}>Receive & manage bookings on WhatsApp</label>
        <input value={bookingsWa} onChange={e=>setBookingsWa(e.target.value)} placeholder="+34 6…"
          style={{...INP,marginBottom:6}} onFocus={onFi} onBlur={onBl}/>
        <p style={{fontFamily:F.body,fontSize:10,color:T.stone2,fontWeight:300,margin:0,lineHeight:1.5}}>Insert a WhatsApp number and we'll message you the moment a new booking comes in. You can confirm, reschedule or cancel straight from the chat. Include the country code — this stays private and never appears on your listing.</p>
      </div>
    </OWrap>
  );

  if (step===5) {
    const canAdvance = priceMode==="flat" ? !!cr : slots.every(sl=>sl.cr);
    return (
      <OWrap title="Set your price" sub="Tell us what guests pay in euros. We charge them in Wello credits (1 credit = €1) so they see a single balance across every partner." step={step} total={TOTAL} doSignOut={doSignOut} onBackToDashboard={onBackToDashboard} onRemoveVenue={onRemoveVenue} stepLabels={stepLabels} onJumpToStep={onJumpToStep} listingTypeLabel={listingTypeLabel} onChangeType={onChangeType} onPreview={()=>setPreviewOpen(true)}
        footer={[<OBtn key="b" saving={saving} onClick={()=>setStep(4)} label="← Back" variant="secondary"/>,
                 <OBtn key="n" saving={saving} onClick={()=>goNext(priceMode==="flat"?{cr:parseInt(cr)||catAvg,price_mode:"flat"}:{price_mode:"per_slot",slots,cr:null})} label="Save & continue →" disabled={!canAdvance}/>]}>
        {/* Toggle */}
        <div style={{display:"flex",background:T.bg2,borderRadius:3,padding:3,marginBottom:24}}>
          {[["flat","Same price for all"],["per_slot","Different price per slot"]].map(([mode,label])=>(
            <button key={mode} onClick={()=>setPriceMode(mode)} style={{flex:1,padding:"9px 0",background:priceMode===mode?T.paper:"transparent",color:priceMode===mode?T.ink:T.stone,border:"none",borderRadius:2,fontFamily:F.body,fontSize:11,fontWeight:priceMode===mode?600:300,cursor:"pointer",transition:"all .15s",boxShadow:priceMode===mode?"0 1px 3px rgba(0,0,0,0.08)":"none"}}>
              {label}
            </button>
          ))}
        </div>
        {priceMode==="flat" ? (
          <>
            <label style={FL}>Price per booking</label>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <span style={{fontFamily:F.body,fontSize:22,color:T.ochre,fontWeight:700}}>€</span>
              <input type="number" min="1" value={cr} onChange={e=>setCr(e.target.value)} placeholder={String(catAvg)}
                style={{...INP,maxWidth:120,fontSize:18,fontWeight:700}} onFocus={onFi} onBlur={onBl}/>
              {cr&&<span style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300}}>guests redeem ◈ {cr} credits</span>}
            </div>
            <p style={{fontFamily:F.body,fontSize:11,color:T.stone2,fontWeight:300,margin:0,lineHeight:1.6}}>Similar venues typically charge around €{catAvg}. You can adjust this any time.</p>
          </>
        ) : slots.length===0 ? (
          <p style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300,lineHeight:1.6,padding:"16px 0"}}>Go back to step 4 and add your availabilities first — you'll set a price for each one here.</p>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {slots.map(sl=>(
              <div key={sl.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"12px 14px",background:T.paper,border:`1px solid ${T.border}`,borderRadius:6}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:F.body,fontSize:12,fontWeight:600,color:T.ink,marginBottom:2}}>{sl.name}</div>
                  <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>{sl.days.join(", ")} · {sl.time} · {sl.dur}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                  <span style={{fontFamily:F.body,fontSize:14,color:T.ochre,fontWeight:700}}>€</span>
                  <input type="number" min="1" value={sl.cr||""} onChange={e=>setSlots(s=>s.map(x=>x.id===sl.id?{...x,cr:e.target.value}:x))}
                    placeholder={String(catAvg)} style={{...INP,width:70,fontSize:14,fontWeight:700,padding:"8px 10px"}} onFocus={onFi} onBlur={onBl}/>
                </div>
              </div>
            ))}
            <p style={{fontFamily:F.body,fontSize:11,color:T.stone2,fontWeight:300,margin:"4px 0 0",lineHeight:1.6}}>Set the euro price for each slot — we charge guests in credits at 1:1.</p>
          </div>
        )}
      </OWrap>
    );
  }

  if (step===6) {
    // Feature-flagged. STRIPE_GATE_ENABLED off = show a "coming soon" panel
    // and let the wizard continue. On = live Stripe Connect onboarding, plus
    // the goLive gate above. Kept off at merge time; flip to true once
    // Connect is enabled on the platform account.
    if (!STRIPE_GATE_ENABLED) {
      return (
        <OWrap title="Payout details" sub="Payouts will be handled through Stripe. We are finishing the setup on our side." step={step} total={TOTAL} doSignOut={doSignOut} onBackToDashboard={onBackToDashboard} onRemoveVenue={onRemoveVenue} stepLabels={stepLabels} onJumpToStep={onJumpToStep} listingTypeLabel={listingTypeLabel} onChangeType={onChangeType} onPreview={()=>setPreviewOpen(true)}
          footer={[<OBtn key="b" saving={saving} onClick={()=>setStep(5)} label="← Back" variant="secondary"/>,
                   <OBtn key="n" saving={saving} onClick={()=>goNext({})} label="Save & continue →"/>]}>
          <div style={{background:T.ochreXL,border:`1px solid ${T.ochreL}`,borderRadius:6,padding:"14px 16px"}}>
            <p style={{fontFamily:F.body,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:T.clay,margin:"0 0 4px"}}>Coming soon</p>
            <p style={{fontFamily:F.body,fontSize:12,color:T.clay,fontWeight:400,lineHeight:1.65,margin:0}}>Payouts run through Stripe. We will email you when payouts setup is ready and you can complete it in a couple of minutes. In the meantime you can carry on and submit your venue for review.</p>
          </div>
        </OWrap>
      );
    }

    // Stripe Connect onboarding (flag on). Status lives on
    // bizData.stripe_account_status (null / 'pending' / 'active' /
    // 'restricted') and is updated by the account.updated webhook when
    // Stripe reports progress. The button here just hands the partner off
    // to Stripe's hosted flow.
    const stripeStatus = bizData?.stripe_account_status || null;
    const stripeActive = stripeStatus === 'active';
    const stripeRestricted = stripeStatus === 'restricted';
    async function startStripeOnboarding() {
      setSaving(true);
      try {
        const { data, error } = await supabase.functions.invoke('create-connect-onboarding', {
          body: { business_id: bizData.id },
        });
        if (error || !data?.url) throw new Error(error?.message || 'Could not start Stripe onboarding');
        window.location.href = data.url;
      } catch (e) {
        console.error('startStripeOnboarding failed:', e);
        flashSaveMsg('err', "Couldn't open Stripe onboarding. " + (e?.message || ''));
        setSaving(false);
      }
    }
    return (
      <OWrap title="Set up payouts" sub="We pay every Friday for the previous week's bookings, straight to your bank via Stripe. Complete Stripe's short onboarding to enable payouts on your venue." step={step} total={TOTAL} doSignOut={doSignOut} onBackToDashboard={onBackToDashboard} onRemoveVenue={onRemoveVenue} stepLabels={stepLabels} onJumpToStep={onJumpToStep} listingTypeLabel={listingTypeLabel} onChangeType={onChangeType} onPreview={()=>setPreviewOpen(true)}
        footer={[<OBtn key="b" saving={saving} onClick={()=>setStep(5)} label="← Back" variant="secondary"/>,
                 <OBtn key="n" saving={saving} onClick={()=>goNext({})} label={stripeActive ? "Save & continue →" : "Skip for now →"} variant={stripeActive ? "primary" : "secondary"}/>]}>
        <div style={{background:T.bg2,border:`1px solid ${T.border}`,borderRadius:10,padding:"18px 20px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
          <div style={{minWidth:0,flex:"1 1 220px"}}>
            <p style={{fontFamily:F.body,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:T.stone,margin:"0 0 4px"}}>Payout status</p>
            {stripeActive ? (
              <p style={{fontFamily:F.body,fontSize:13,color:T.sage,fontWeight:700,margin:0}}>✓ Active. Bank details on file with Stripe.</p>
            ) : stripeRestricted ? (
              <p style={{fontFamily:F.body,fontSize:13,color:T.clay,fontWeight:700,margin:0}}>Restricted. Stripe needs more information to enable payouts.</p>
            ) : stripeStatus === 'pending' ? (
              <p style={{fontFamily:F.body,fontSize:13,color:T.ochre,fontWeight:700,margin:0}}>In progress. Continue where you left off with Stripe.</p>
            ) : (
              <p style={{fontFamily:F.body,fontSize:13,color:T.ink,fontWeight:600,margin:0}}>Not started yet.</p>
            )}
          </div>
          <button onClick={startStripeOnboarding} disabled={saving}
            style={{padding:"11px 22px",background:saving?T.border:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:saving?"wait":"pointer",whiteSpace:"nowrap",flexShrink:0}}
            onMouseEnter={e=>{if(!saving)e.target.style.background=T.sage2;}}
            onMouseLeave={e=>{if(!saving)e.target.style.background=T.sage;}}>
            {stripeActive ? "Manage on Stripe →" : stripeStatus ? "Continue on Stripe →" : "Set up on Stripe →"}
          </button>
        </div>
        <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,lineHeight:1.7}}>
          <p style={{margin:"0 0 8px"}}>Stripe is our payment partner. On their site you will confirm your business or personal details, upload one ID document, and enter the bank account you want payouts sent to. It takes about 5 minutes.</p>
          <p style={{margin:0}}>Your venue can be submitted for review without this, but payouts will not run until Stripe onboarding is complete.</p>
        </div>
      </OWrap>
    );
  }

  if (step===7) return (
    <>
      <OWrap title="Review your listing" sub="Here's how you'll appear on Wello. Tap 'Preview' above for the full member view." step={step} total={TOTAL} doSignOut={doSignOut} onBackToDashboard={onBackToDashboard} onRemoveVenue={onRemoveVenue} stepLabels={stepLabels} onJumpToStep={onJumpToStep} listingTypeLabel={listingTypeLabel} onChangeType={onChangeType} onPreview={()=>setPreviewOpen(true)}
        footer={[<OBtn key="b" saving={saving} onClick={()=>setStep(6)} label="← Back" variant="secondary"/>,
                 <button key="s" onClick={handleSubmit} disabled={saving}
                   style={{padding:"11px 28px",background:saving?T.border:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:saving?"not-allowed":"pointer"}}
                   onMouseEnter={e=>{if(!saving)e.target.style.background=T.sage2;}}
                   onMouseLeave={e=>{if(!saving)e.target.style.background=T.sage;}}>
                   {saving?"Submitting…":"Submit for review →"}
                 </button>]}>
        {/* Inline preview card — same look as the full preview overlay, scaled down */}
        <div style={{border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden",marginBottom:22,background:T.paper,boxShadow:"0 4px 20px rgba(27,28,25,0.06)"}}>
          {/* Hero with photo, category, tags, name */}
          <div style={{position:"relative",height:170,background:T.bg2}}>
            {img
              ? <img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
              : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6}}>
                  <span style={{fontSize:24}}>📷</span>
                  <span style={{fontFamily:F.body,fontSize:11,color:T.stone2,fontWeight:300}}>No photo added yet</span>
                </div>}
            <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(27,28,25,0.85) 0%,transparent 55%)"}}/>
            <div style={{position:"absolute",bottom:12,left:14,right:14}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6}}>
                <span style={{fontFamily:F.body,fontSize:10,fontWeight:700,color:"#fff",background:T.sage,padding:"3px 10px",borderRadius:999}}>{venueCategory||bizData.category}</span>
                {tags.slice(0,3).map(t=>(
                  <span key={t} style={{fontFamily:F.body,fontSize:10,color:"rgba(255,255,255,0.9)",background:"rgba(255,255,255,0.18)",backdropFilter:"blur(4px)",padding:"3px 10px",borderRadius:999}}>{t}</span>
                ))}
              </div>
              <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:18,fontWeight:700,color:"#fff",margin:0,letterSpacing:"-0.3px"}}>{venueName||bizData.name}</h2>
            </div>
          </div>
          {/* Body */}
          <div style={{padding:"14px 16px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:6}}>
              <span style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300}}>📍 {address||venueLocation||bizData.location||"Mallorca"}</span>
              <span style={{fontFamily:F.body,fontSize:12,color:T.ochre,fontWeight:700}}>◈ {parseInt(cr)||catAvg} <span style={{fontSize:9,color:T.stone2,fontWeight:300}}>per booking</span></span>
            </div>
            <p style={{fontFamily:F.body,fontSize:11,color:T.stone,lineHeight:1.7,margin:"0 0 12px",fontWeight:300}}>{desc||"Your description will appear here."}</p>
            {tags.length>0&&(
              <>
                <div style={{fontFamily:F.body,fontSize:9,fontWeight:700,color:T.sage,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:6}}>Amenities & offerings</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:14}}>
                  {tags.map(t=>(
                    <span key={t} style={{fontFamily:F.body,fontSize:10,color:T.ink,background:T.bg2,border:`1px solid ${T.border}`,padding:"3px 9px",borderRadius:999,fontWeight:500}}>{t}</span>
                  ))}
                </div>
              </>
            )}
            {previewSlots.length>0&&(
              <>
                <div style={{fontFamily:F.body,fontSize:9,fontWeight:700,color:T.sage,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:8}}>Upcoming sessions</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {[...new Map(previewSlots.map(s=>[s.date,s])).values()].slice(0,2).map(sl=>(
                    <div key={sl.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:6}}>
                      <div style={{textAlign:"center",minWidth:36}}>
                        <div style={{fontFamily:F.body,fontSize:12,fontWeight:700,color:T.sage}}>{sl.time}</div>
                        <div style={{fontFamily:F.body,fontSize:9,color:T.stone,fontWeight:300}}>{sl.dur}</div>
                      </div>
                      <div style={{width:1,height:24,background:T.border}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:F.body,fontSize:11,fontWeight:600,color:T.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sl.name||"Session"}</div>
                        <div style={{fontFamily:F.body,fontSize:9,color:T.stone,fontWeight:300}}>{new Date(sl.date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</div>
                      </div>
                      <span style={{fontFamily:F.body,fontSize:10,color:T.ochre,fontWeight:700}}>◈ {sl.cr||parseInt(cr)||catAvg}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Summary rows */}
        {[
          {l:isPrivateInstructor?"Instructor":"Venue",v:venueName||bizData.name},
          {l:"Category",v:venueCategory||bizData.category},
          ...(isPrivateInstructor
            ? [
                {l:"Town", v:venueLocation||bizData.location||"—"},
                {l:"Coverage areas", v:coverageAreas.length?coverageAreas.join(", ").slice(0,80)+(coverageAreas.join(", ").length>80?"…":""):"—"},
                {l:"Bio",   v:bio?bio.slice(0,80)+(bio.length>80?"…":""):"—"},
                {l:"Phone", v:phone||"—"},
              ]
            : [
                {l:"Location",v:address||venueLocation||bizData.location||"—"},
              ]),
          {l:isPrivateInstructor?"About sessions":"Description",v:desc?desc.slice(0,80)+(desc.length>80?"…":""):"—"},
          {l:"Amenities",v:tags.length?`${tags.length} selected`:"None added"},
          {l:"Website",v:website||"—"},
          {l:"Instagram",v:instagram||"—"},
          {l:"Photo",v:img?"Added ✓":"Not added"},
          {l:"Availabilities",v:
            isPrivateInstructor
              ? (availabilityWindows.length ? `${availabilityWindows.length} window${availabilityWindows.length!==1?"s":""} (${sessionDurationMin}-min sessions)` : "None added")
              : (slots.length ? `${slots.length} slot${slots.length!==1?"s":""} added` : "None added")
          },
          {l:"Pricing",v:isPrivateInstructor?`€${cr||catAvg} per session`:(priceMode==="flat"?`€${cr||catAvg} per booking`:`Per slot pricing (${slots.filter(s=>s.cr).length}/${slots.length} set)`)},
        ].map(({l,v})=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"11px 0",borderBottom:`1px solid ${T.border}`}}>
            <span style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,minWidth:110}}>{l}</span>
            <span style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:400,textAlign:"right",flex:1}}>{v}</span>
          </div>
        ))}
        <div style={{background:T.ochreXL,border:`1px solid ${T.ochreL}`,borderRadius:6,padding:"13px 16px",marginTop:24}}>
          <div style={{fontFamily:F.body,fontSize:11,color:T.clay,fontWeight:600,marginBottom:3}}>What happens next?</div>
          <div style={{fontFamily:F.body,fontSize:11,color:T.clay,fontWeight:300,lineHeight:1.6}}>We'll review your listing and be in touch within 2 working days. We may suggest a few small tweaks before you go live.</div>
        </div>
      </OWrap>
    </>
  );

  return null;
}

function BusinessPortal({ onSetView }) {
  const [screen, setScreen]     = useState("loading");
  const [email,  setEmail]      = useState("");
  const [pw,     setPw]         = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loading, setLoading]   = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // Post-submit password prompt state. Shown once on the "submitted"
  // screen so a partner who signed in via magic-link only can set a
  // password without needing to go through Forgot Password later. The
  // user_metadata.password_set flag is our persistence: once set, the
  // card stops appearing across sessions.
  const [pwSetupPw1, setPwSetupPw1] = useState("");
  const [pwSetupPw2, setPwSetupPw2] = useState("");
  const [pwSetupSaving, setPwSetupSaving] = useState(false);
  const [pwSetupErr, setPwSetupErr] = useState("");
  const [pwSetupDone, setPwSetupDone] = useState(false);
  const [pwSetupSkipped, setPwSetupSkipped] = useState(false);
  const [pwSetupAlreadySet, setPwSetupAlreadySet] = useState(false);
  // Multi-venue state: a partner can own more than one businesses row, linked
  // via auth user_id. activeVenueId is which one the dashboard / wizard is
  // currently looking at. bizData below is computed from venues + activeVenueId.
  const [venues, setVenues]     = useState([]);
  // Init from localStorage so that navigating away and back (BusinessPortal
  // unmounts/remounts) preserves whichever venue the partner was working on,
  // rather than snapping back to the highest-priority (usually approved) one.
  const [activeVenueId, setActiveVenueId] = useState(() => {
    try {
      const raw = localStorage.getItem("wello_active_venue_id");
      if (!raw) return null;
      // We store as a string; UUIDs stay strings, integer ids parse back.
      const asNum = Number(raw);
      return Number.isFinite(asNum) && String(asNum) === raw ? asNum : raw;
    } catch { return null; }
  });
  // Keep localStorage in sync. Clears on sign-out (handled in doSignOut).
  useEffect(() => {
    try {
      if (activeVenueId == null) localStorage.removeItem("wello_active_venue_id");
      else localStorage.setItem("wello_active_venue_id", String(activeVenueId));
    } catch { /* non-critical: ignore */ }
  }, [activeVenueId]);
  const [authUser, setAuthUser] = useState(null);
  // Read user_metadata.password_set on the signed-in user so partners who
  // already set a password on a previous session don't get re-prompted.
  useEffect(() => {
    if (!authUser) { setPwSetupAlreadySet(false); return; }
    const flagged = !!authUser.user_metadata?.password_set;
    setPwSetupAlreadySet(flagged);
  }, [authUser]);
  // Guards double-fires on the "+ Add another venue" button so a fast double-
  // click can't insert two rows.
  const [addingVenue, setAddingVenue] = useState(false);
  // Whether the business-type picker is open. Shown when partner clicks
  // "+ Add another venue" so we know which flavor of wizard to launch.
  const [showAddTypeModal, setShowAddTypeModal] = useState(false);
  // When a partner wants to amend the business_type they originally picked.
  // Holds the venue id being edited, or null if the modal isn't showing.
  const [changingTypeForId, setChangingTypeForId] = useState(null);
  const [changingType, setChangingType] = useState(false);
  // ID of the venue the partner is being asked to confirm deletion of (null
  // = no modal). Kept in BusinessPortal so both the dashboard and the
  // submitted screen can mount the same branded DeleteVenueModal.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [deletingVenue, setDeletingVenue] = useState(false);
  const didLoad = useRef(false);
  const [regForm, setRegForm]   = useState({business_type:"",name:"",category:"Yoga",location:"",email:"",phone:"",notes:""});
  const [regLoading, setRegLoading] = useState(false);
  const [regDone, setRegDone]   = useState(false);
  const [regDuplicate, setRegDuplicate] = useState(false);

  // Currently active venue row. Used by every downstream screen (onboarding,
  // dashboard, submitted, pending) so they can read fields like name / status.
  const bizData = venues.find(v => v.id === activeVenueId) ?? null;

  // Order a list of venues by lifecycle stage. Approved wins so a partner who
  // already has a live venue lands on its dashboard even if they have another
  // venue mid-setup or pending review. setting_up beats submitted because a
  // half-finished wizard is still actionable; submitted is a wait-state.
  function pickBizRow(rows) {
    if (!rows || rows.length === 0) return null;
    const priority = (s) =>
      s === 'approved'   ? 0 :
      s === 'setting_up' ? 1 :
      s === 'submitted'  ? 2 :
      3; // pending / null / anything else
    const sorted = [...rows].sort((a, b) => {
      const pa = priority(a.status), pb = priority(b.status);
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    return sorted[0];
  }

  // Status → screen mapping. Reused on initial load and whenever the active
  // venue switches, so all routing decisions stay consistent.
  function screenForStatus(status) {
    // 'paused' is a soft-hide of the listing — partner still owns their
    // dashboard, they just aren't visible on the marketplace. So we route
    // them to the dashboard the same as an approved partner; the dashboard
    // itself shows a "listing paused" banner to make the state obvious.
    if (status === 'approved' || status === 'paused') return 'dashboard';
    if (status === 'setting_up') return 'onboarding';
    if (status === 'submitted')  return 'submitted';
    return 'pending';
  }

  // Returns a sorted venue list for display (priority by stage, name fallback).
  function sortedVenues(list) {
    return pickBizRow(list) ? [...list].sort((a, b) => {
      const pri = s => s === 'approved' ? 0 : s === 'setting_up' ? 1 : s === 'submitted' ? 2 : 3;
      const d = pri(a.status) - pri(b.status);
      if (d !== 0) return d;
      return (a.name || '').localeCompare(b.name || '');
    }) : list;
  }

  // Fetch every businesses row the signed-in partner owns. Backfills user_id
  // on any historical row that matches by email so older venues (created
  // before the user_id column existed) join the same multi-venue group.
  async function loadVenues(session, opts = {}) {
    setScreen("loading");
    const uid = session.user.id;
    const userEmail = session.user.email;

    // 1. Rows already linked to this user.
    const { data: ownedRows, error: ownedErr } = await supabase
      .from('businesses').select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    if (ownedErr) {
      console.error('loadVenues (by user_id) error:', ownedErr.message);
    }

    // 2. Rows that match by email but have no user_id yet — these are
    // legacy rows that need backfilling.
    const { data: orphanRows, error: orphanErr } = await supabase
      .from('businesses').select('*')
      .is('user_id', null)
      .ilike('email', userEmail)
      .order('created_at', { ascending: false });
    if (orphanErr) {
      console.error('loadVenues (orphan backfill query) error:', orphanErr.message);
    }

    let backfilled = [];
    if (orphanRows && orphanRows.length > 0) {
      const ids = orphanRows.map(r => r.id);
      const { data: updated, error: updErr } = await supabase
        .from('businesses').update({ user_id: uid })
        .in('id', ids)
        .select('*');
      if (updErr) {
        console.error('loadVenues backfill update error:', updErr.message);
      } else {
        backfilled = updated || [];
        console.log(`loadVenues: backfilled user_id on ${backfilled.length} legacy row(s)`);
      }
    }

    const all = [...(ownedRows || []), ...backfilled];
    if (all.length === 0) {
      console.warn('loadVenues: no businesses for', userEmail);
      setVenues([]); setActiveVenueId(null);
      setScreen('pending');
      return;
    }

    const ordered = sortedVenues(all);
    setVenues(ordered);

    // Pick active venue: keep the caller's preference if they pinned one,
    // else keep the previously active venue if it's still in the list,
    // else fall back to highest-priority via pickBizRow.
    const preferredId = opts.activate ?? activeVenueId;
    const next = ordered.find(v => v.id === preferredId) ?? pickBizRow(ordered);
    setActiveVenueId(next.id);
    setScreen(screenForStatus(next.status));
    console.log('loadVenues:', ordered.length, 'venue(s) | active:', { id: next.id, status: next.status, name: next.name });
  }

  // Switch the dashboard / wizard to a different venue the partner owns.
  function switchVenue(id) {
    const v = venues.find(x => x.id === id);
    if (!v) return;
    setActiveVenueId(id);
    setScreen(screenForStatus(v.status));
  }

  // Opens the branded DeleteVenueModal for the given venue id. Both screens
  // (dashboard Settings tab + submitted screen) use this single entry point.
  function requestDeleteVenue(id) {
    setConfirmingDeleteId(id);
  }

  // Open the business-type picker for an existing venue. Used by the wizard
  // and the dashboard's Settings tab so the partner can amend the choice they
  // made at registration.
  function requestChangeVenueType(id) {
    setChangingTypeForId(id);
  }

  // Persist a new business_type on an existing venue. We also stamp a fresh
  // default category for that type so the wizard step 2 has something to
  // load. Reloads venues afterwards so every downstream surface (wizard
  // flavor, dashboard tabs, customer-facing listing) picks up the new value.
  async function changeVenueType(id, typeId) {
    if (!id || !typeId) return;
    setChangingType(true);
    try {
      const bt = businessTypeFor(typeId);
      const { error } = await supabase.from('businesses').update({
        business_type: typeId,
        category: bt.defaultCategory,
      }).eq('id', id);
      if (error) {
        console.error('changeVenueType error:', error.message);
        alert("Couldn't change the listing type. " + error.message);
        return;
      }
      // Mirror the category onto the live listings row so the marketplace
      // chip + filter reflect the change immediately.
      await supabase.from('listings')
        .update({ cat: bt.defaultCategory })
        .eq('business_id', id);
      // Reload so the wizard re-mounts with the new bizData.business_type.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await loadVenues(session, { activate: id });
    } finally {
      setChangingType(false);
      setChangingTypeForId(null);
    }
  }

  // Permanently remove a venue the partner owns. We rely on ON DELETE CASCADE
  // FKs (set on listings.business_id → businesses.id, slots.listing_id →
  // listings.id) so deleting the businesses row sweeps the child rows in one
  // atomic DB operation. Refuses if there are non-cancelled bookings.
  async function deleteVenue(id) {
    const v = venues.find(x => x.id === id);
    if (!v) return;
    // Block delete if active bookings exist — losing live bookings silently
    // would be the worst kind of bug.
    const { count: bookingCount } = await supabase
      .from('bookings').select('id', { head: true, count: 'exact' })
      .eq('business_id', id)
      .not('status', 'in', '("cancelled","declined")');
    if ((bookingCount ?? 0) > 0) {
      alert(`Can't remove "${v.name || 'this venue'}" — it has ${bookingCount} active booking${bookingCount === 1 ? '' : 's'}. Cancel them first, then try again.`);
      return;
    }
    // Explicit cascade — belt-and-braces so this works whether or not the DB
    // has ON DELETE CASCADE set on listings.business_id and slots.listing_id.
    // Order matters: slots refer to listings, listings refer to businesses.
    // Any failure below just logs and continues so the businesses row still
    // gets deleted at the end (worst case leaves an orphan listings row we
    // can clean up with a nightly job).
    const { data: linkedListings } = await supabase
      .from('listings').select('id').eq('business_id', id);
    const listingIds = (linkedListings || []).map(l => l.id);
    if (listingIds.length > 0) {
      const { error: slotsDelErr } = await supabase
        .from('slots').delete().in('listing_id', listingIds);
      if (slotsDelErr) console.warn('deleteVenue: slot cleanup failed', slotsDelErr.message);
      // .select() so a silent RLS block on listings DELETE gets surfaced
      // rather than leaving orphaned listing rows on the marketplace after
      // the businesses row disappears.
      const { data: listingsDeleted, error: listingsDelErr } = await supabase
        .from('listings').delete().eq('business_id', id).select('id');
      if (listingsDelErr) console.warn('deleteVenue: listing cleanup failed', listingsDelErr.message);
      else if (!listingsDeleted || listingsDeleted.length === 0) {
        console.warn('deleteVenue: 0 listings deleted for business', id, '— RLS likely blocked the DELETE. Check the "Partners can delete own listings" policy on listings.');
      }
    }
    // .select() so we can detect the silent-zero-rows case (RLS blocking
    // the DELETE without throwing). Without it, Supabase returns success
    // even when no rows match the policy — and the venue stays in the DB.
    const { data: deletedRows, error: bizErr } = await supabase
      .from('businesses').delete().eq('id', id).select('id');
    if (bizErr) {
      console.error('deleteVenue error:', bizErr.message);
      const msg = /foreign key|fkey|referenced/i.test(bizErr.message)
        ? "This venue has linked data that can't be removed yet. Check your ON DELETE CASCADE / SET NULL setup on listings, slots and bookings."
        : "Couldn't remove the venue. " + bizErr.message;
      alert(msg);
      return;
    }
    if (!deletedRows || deletedRows.length === 0) {
      console.warn('deleteVenue: 0 rows affected — Supabase RLS likely blocked the delete on businesses.');
      alert("Looks like the venue wasn't actually removed. Your DELETE policy on the businesses table is missing. Add a Supabase RLS policy:\n\ncreate policy \"Partners can delete own venue\" on businesses for delete to authenticated using (user_id = auth.uid());");
      return;
    }
    // Clean up orphaned photos from storage. Uploads use the path
    // `<auth-uid>/<bizId>-<slot>-<ts>.jpg` so we can list the user's folder
    // and remove only the files whose name starts with this venue's id.
    if (authUser?.id) {
      try {
        const { data: files } = await supabase.storage.from('venue-photos').list(String(authUser.id), { limit: 200 });
        const toRemove = (files || [])
          .filter(f => f.name.startsWith(`${id}-`))
          .map(f => `${authUser.id}/${f.name}`);
        if (toRemove.length > 0) {
          const { error: storageErr } = await supabase.storage.from('venue-photos').remove(toRemove);
          if (storageErr) console.warn('Storage cleanup partial:', storageErr.message);
          else console.log(`Removed ${toRemove.length} photo(s) from storage`);
        }
      } catch (e) {
        // Non-fatal — the DB row is already gone. Photos becoming orphans is
        // worse than the user thinking the delete didn't work, so we swallow.
        console.warn('Storage cleanup failed (DB delete still succeeded):', e?.message);
      }
    }
    // Reload venues from scratch — let pickBizRow pick the next active one.
    const remaining = venues.filter(v => v.id !== id);
    setVenues(remaining);
    if (remaining.length === 0) {
      setActiveVenueId(null);
      setScreen('pending');
      return;
    }
    const next = pickBizRow(remaining);
    setActiveVenueId(next.id);
    setScreen(screenForStatus(next.status));
  }

  // Start a fresh onboarding flow for a brand-new venue under the same user.
  // typeId comes from the AddVenueTypeModal so the new row carries the right
  // business_type and the wizard branches correctly from step 2.
  async function addVenue(typeId) {
    if (!authUser || addingVenue || !typeId) return;
    setAddingVenue(true);
    try {
      const bt = businessTypeFor(typeId);
      const { data, error } = await supabase.from('businesses').insert({
        user_id: authUser.id,
        email:   authUser.email,
        status:  'setting_up',
        onboarding_step: 2,
        name:    '',
        business_type: typeId,
        category: bt.defaultCategory,
      }).select('*').single();
      if (error) {
        console.error('addVenue error:', error.message);
        alert("Couldn't create a new venue. " + error.message);
        return;
      }
      const next = [data, ...venues];
      setVenues(sortedVenues(next));
      setActiveVenueId(data.id);
      setScreen('onboarding');
    } finally {
      setAddingVenue(false);
    }
  }

  useEffect(()=>{
    // Check for an existing session immediately so authenticated partners
    // skip the landing screen and go straight to their dashboard/onboarding.
    supabase.auth.getSession().then(({data:{session}})=>{
      if(session && !didLoad.current) {
        didLoad.current = true;
        setAuthUser(session.user);
        loadVenues(session);
      } else if(!session) {
        setScreen("landing");
      }
    });

    const {data:{subscription}} = supabase.auth.onAuthStateChange((event, session)=>{
      if(event==="SIGNED_IN" && session) {
        if(!didLoad.current) {
          didLoad.current = true;
          setAuthUser(session.user);
          loadVenues(session);
        }
      } else if(event==="SIGNED_OUT") {
        didLoad.current = false;
        try { localStorage.removeItem("wello_active_venue_id"); } catch { /* non-critical: ignore */ }
        setScreen("landing"); setVenues([]); setActiveVenueId(null); setAuthUser(null); setEmail(""); setPw("");
      }
    });

    // Refetch on tab focus so admin-side status changes in Supabase propagate
    // without forcing the partner to hard-refresh. We pass the live
    // localStorage value as activate=, NOT the closure-captured activeVenueId
    // — otherwise switching venues mid-session would cause this handler to
    // snap us back to whichever venue was active when BusinessPortal first
    // mounted (which kicked partners out of wizards they were working in).
    function onVisibility() {
      if (document.visibilityState !== 'visible') return;
      if (!didLoad.current) return;
      let pinned = null;
      try {
        const raw = localStorage.getItem("wello_active_venue_id");
        if (raw) {
          const asNum = Number(raw);
          pinned = Number.isFinite(asNum) && String(asNum) === raw ? asNum : raw;
        }
      } catch { /* non-critical: ignore */ }
      supabase.auth.getSession().then(({data:{session}})=>{
        if (session) loadVenues(session, pinned ? { activate: pinned } : {});
      });
    }
    document.addEventListener('visibilitychange', onVisibility);

    return ()=>{
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  },[]);

  async function doLogin() {
    setLoginErr(""); setLoading(true);
    const {error} = await supabase.auth.signInWithPassword({email, password:pw});
    setLoading(false);
    if(error) setLoginErr("Email or password not recognised.");
  }

  async function doSignOut() {
    await supabase.auth.signOut();
    try { localStorage.removeItem("wello_active_venue_id"); } catch { /* non-critical: ignore */ }
    setScreen("landing"); setVenues([]); setActiveVenueId(null); setAuthUser(null); setEmail(""); setPw("");
  }

  // Set a password on the currently-signed-in partner account. Called from
  // the submitted-listing screen so partners who signed in via magic-link
  // only get a persistent credential without needing to go through Forgot
  // Password later. Persists a user_metadata flag so we don't re-prompt.
  async function saveInitialPassword() {
    setPwSetupErr("");
    const p1 = pwSetupPw1;
    const p2 = pwSetupPw2;
    if (p1.length < 8) { setPwSetupErr("Use at least 8 characters."); return; }
    if (p1 !== p2)      { setPwSetupErr("The two passwords do not match."); return; }
    setPwSetupSaving(true);
    const { data, error } = await supabase.auth.updateUser({
      password: p1,
      data: { ...(authUser?.user_metadata || {}), password_set: true },
    });
    setPwSetupSaving(false);
    if (error) { setPwSetupErr(error.message || "Could not set password."); return; }
    if (data?.user) setAuthUser(data.user);
    setPwSetupDone(true);
    setPwSetupPw1(""); setPwSetupPw2("");
  }
  function dismissPasswordSetup() {
    setPwSetupSkipped(true);
  }

  async function doPasswordReset() {
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://wello-seven.vercel.app"
    });
    setLoading(false); setResetSent(true);
  }

  const INP3={width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:2,fontSize:12,fontFamily:F.body,background:T.paper,color:T.ink,outline:"none",marginBottom:0,transition:"border-color .18s"};
  const onF3=e=>e.target.style.borderColor=T.sage;
  const onB3=e=>e.target.style.borderColor=T.border;

  async function handleRegSubmit() {
    if(!regForm.business_type||!regForm.name.trim()||!regForm.email.trim()||!regForm.phone.trim()) return;
    setRegLoading(true);
    const {data:existing} = await supabase.from('businesses').select('id').ilike('email',regForm.email.trim()).limit(1);
    if(existing&&existing.length>0){ setRegLoading(false); setRegDuplicate(true); return; }
    const {error} = await supabase.from('businesses').insert({
      business_type: regForm.business_type,
      name:regForm.name, category:regForm.category, location:regForm.location,
      email:regForm.email, phone:regForm.phone, notes:regForm.notes||'', status:'pending',
    });
    setRegLoading(false);
    if(error){ console.error('Registration error:',error); return; }
    setRegDone(true);
  }

  // ── Landing ───────────────────────────────────────────────────
  if (screen==="landing") {
  const canReg = !!regForm.business_type && regForm.name.trim()&&regForm.email.trim()&&regForm.phone.trim();
  return (
    <div style={{background:T.bg}}>
      {/* Hero split */}
      <div style={{display:"flex",alignItems:"stretch",flexWrap:"wrap",minHeight:"calc(100vh - 60px)"}}>
        {/* Left — pitch */}
        <div style={{flex:"1 1 300px",background:T.sage,padding:"clamp(40px,6vw,72px) clamp(28px,5vw,56px)",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:11,fontWeight:400,color:T.ochreL,letterSpacing:"5px",textTransform:"uppercase",marginBottom:20}}>For businesses</div>
          <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:"clamp(26px,3.5vw,42px)",fontWeight:700,color:"#fff",lineHeight:1.1,letterSpacing:"-1px",margin:"0 0 18px"}}>Fill your off-peak slots.<br/>Reach more people.</h1>
          <p style={{fontFamily:F.body,fontSize:13,color:"rgba(255,255,255,.65)",lineHeight:1.75,margin:"0 0 32px",fontWeight:300,maxWidth:380}}>Wello connects your studio, gym or pool to local fitness enthusiasts, expats and tourists who want flexibility on the island.</p>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {[
              ["Grow your customer base","Reach people actively searching for new wellness experiences who haven't discovered you yet"],
              ["Fill your quieter sessions","Turn off-peak slots into bookings and real revenue"],
              ["Built here, for here","A platform that understands the island and the people who live and visit here"],
            ].map(([t,d])=>(
              <div key={t} style={{display:"flex",gap:12}}>
                <div style={{width:18,height:18,borderRadius:"50%",background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
                  <span style={{fontSize:9,color:"#fff"}}>✓</span>
                </div>
                <div>
                  <div style={{fontFamily:F.body,fontSize:12,color:"#fff",fontWeight:600,marginBottom:2}}>{t}</div>
                  <div style={{fontFamily:F.body,fontSize:11,color:"rgba(255,255,255,.5)",fontWeight:300}}>{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Right — registration form */}
        <div style={{flex:"1 1 300px",background:T.paper,padding:"clamp(32px,5vw,56px) clamp(24px,5vw,48px) calc(clamp(32px,5vw,56px) + env(safe-area-inset-bottom))",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:24}}>
            <button onClick={()=>setScreen("login")} style={{background:"transparent",border:"none",color:T.sage,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:"pointer",padding:0}}>Already a partner? Sign in →</button>
          </div>
          {regDone ? (
            <div style={{textAlign:"center",padding:"24px 0"}}>
              <div style={{width:48,height:48,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:20}}>✓</div>
              <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:20,fontWeight:700,color:T.ink,margin:"0 0 10px"}}>Thanks, we'll be in touch!</h2>
              <p style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300,lineHeight:1.75,margin:"0 0 6px"}}>We've received your interest for <strong style={{color:T.ink,fontWeight:600}}>{regForm.name}</strong>.</p>
              <p style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300,lineHeight:1.75}}>The Wello team will be in touch within 2 working days.</p>
            </div>
          ) : regDuplicate ? (
            <div style={{textAlign:"center",padding:"24px 0"}}>
              <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:20,fontWeight:700,color:T.ink,margin:"0 0 10px"}}>Already registered</h2>
              <p style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300,lineHeight:1.75,margin:"0 0 20px"}}>There's already a Wello listing registered to <strong style={{color:T.ink}}>{regForm.email}</strong>. Sign in to access your dashboard.</p>
              <button onClick={()=>{setRegDuplicate(false);setScreen("login");}} style={{padding:"11px 24px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:"pointer"}}>Sign in to your dashboard →</button>
            </div>
          ) : (
            <>
              <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:22,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 6px"}}>Register your interest</h2>
              <p style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300,margin:"0 0 14px",lineHeight:1.6}}>Tell us about your venue and we'll be in touch within 2 working days. No commitment required.</p>

              {/* Business-type selector — drives the rest of the form labels,
                  pre-selects a sensible specialty, and is the single source of
                  truth for whether the partner gets the private-instructor
                  wizard variant. Required to continue. */}
              <FieldLabel>What kind of business are you? *</FieldLabel>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:8,marginBottom:18}}>
                {BUSINESS_TYPES.map(bt => {
                  const on = regForm.business_type === bt.id;
                  return (
                    <button key={bt.id} type="button"
                      onClick={()=>setRegForm(p=>({...p, business_type: bt.id, category: bt.defaultCategory}))}
                      style={{padding:"12px 14px",border:`1px solid ${on?T.sage:T.border}`,background:on?"rgba(33,60,24,0.06)":T.paper,borderRadius:8,fontFamily:F.body,fontSize:12,fontWeight:600,color:T.ink,cursor:"pointer",textAlign:"left",transition:"all .12s",display:"flex",flexDirection:"column",gap:4,position:"relative"}}>
                      <span style={{fontSize:18,lineHeight:1}}>{bt.icon}</span>
                      <span style={{fontWeight:700,color:on?T.sage:T.ink,marginTop:2}}>{bt.label}</span>
                      <span style={{fontSize:10,fontWeight:300,color:T.stone,lineHeight:1.4}}>{bt.desc}</span>
                      {on && <span style={{position:"absolute",top:8,right:8,width:16,height:16,borderRadius:"50%",background:T.sage,color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>✓</span>}
                    </button>
                  );
                })}
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div>
                  <FieldLabel>{regForm.business_type==="private_instructor" ? "Your name *" : "Business name *"}</FieldLabel>
                  <input placeholder={regForm.business_type==="private_instructor" ? "e.g. Maria López" : "e.g. My Wellness Studio"} value={regForm.name} onChange={e=>setRegForm(p=>({...p,name:e.target.value}))} style={INP3} onFocus={onF3} onBlur={onB3}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <FieldLabel>{regForm.business_type==="private_instructor" ? "Specialty" : "Category"}</FieldLabel>
                    <select value={regForm.category} onChange={e=>setRegForm(p=>({...p,category:e.target.value}))} style={INP3}>
                      {(regForm.business_type ? businessTypeFor(regForm.business_type).suggestedCats : CATS.filter(c=>c!=="All")).map(c=><option key={c} value={c}>{catLabel(c)}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Location</FieldLabel>
                    <input placeholder="e.g. Palma" value={regForm.location} onChange={e=>setRegForm(p=>({...p,location:e.target.value}))} style={INP3} onFocus={onF3} onBlur={onB3}/>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <FieldLabel>Email address *</FieldLabel>
                    <input type="email" placeholder="hello@yourbusiness.com" value={regForm.email} onChange={e=>setRegForm(p=>({...p,email:e.target.value}))} style={INP3} onFocus={onF3} onBlur={onB3}/>
                  </div>
                  <div>
                    <FieldLabel>Phone number *</FieldLabel>
                    <input type="tel" placeholder="+34 971 000 000" value={regForm.phone} onChange={e=>setRegForm(p=>({...p,phone:e.target.value}))} style={INP3} onFocus={onF3} onBlur={onB3}/>
                  </div>
                </div>
                <div>
                  <FieldLabel>Anything else? <span style={{color:T.stone2,fontWeight:300}}>(optional)</span></FieldLabel>
                  <textarea placeholder="e.g. we run 6 yoga classes a week with 15 spots each, and would love help filling our quieter sessions..." value={regForm.notes} onChange={e=>setRegForm(p=>({...p,notes:e.target.value}))} style={{...INP3,minHeight:72,resize:"vertical"}} onFocus={onF3} onBlur={onB3}/>
                </div>
                <button onClick={handleRegSubmit} disabled={!canReg||regLoading}
                  style={{padding:"12px",background:canReg&&!regLoading?T.sage:T.border,color:canReg&&!regLoading?"#fff":T.stone,border:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:canReg&&!regLoading?"pointer":"not-allowed",letterSpacing:".3px",transition:"background .15s",marginTop:2}}
                  onMouseEnter={e=>{if(canReg&&!regLoading)e.target.style.background=T.sage2;}} onMouseLeave={e=>{if(canReg&&!regLoading)e.target.style.background=T.sage;}}>
                  {regLoading?"Sending…":"Register interest →"}
                </button>
              </div>
              <div style={{marginTop:14,display:"flex",gap:14,flexWrap:"wrap"}}>
                {["No monthly fee","No commitment","We'll reply within 2 working days"].map(t=>(
                  <div key={t} style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:9,color:T.sage}}>✓</span>
                    <span style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>{t}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
  }

  // ── Login ─────────────────────────────────────────────────────
  if (screen==="login") return (
    <div style={{maxWidth:420,margin:"80px auto",padding:"0 28px"}}>
      <button onClick={()=>setScreen("landing")} style={{background:"transparent",border:"none",color:T.stone,fontFamily:F.body,fontSize:11,cursor:"pointer",marginBottom:24,padding:0,fontWeight:300}}>← Back</button>
      <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:24,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 6px"}}>Business sign in</h1>
      <p style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300,margin:"0 0 28px"}}>Sign in to your Wello business dashboard.</p>
      <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:14}}>
        <div>
          <FieldLabel>Email address</FieldLabel>
          <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setLoginErr("");}} placeholder="hello@yourbusiness.com"
            style={{...INP3,borderColor:loginErr?T.clay:T.border}} onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=loginErr?T.clay:T.border}/>
        </div>
        <div>
          <FieldLabel>Password</FieldLabel>
          <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setLoginErr("");}} placeholder="••••••••"
            style={{...INP3,borderColor:loginErr?T.clay:T.border}} onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=loginErr?T.clay:T.border}
            onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
        </div>
        {loginErr&&<div style={{fontFamily:F.body,fontSize:11,color:T.clay}}>{loginErr}</div>}
      </div>
      <button onClick={doLogin} disabled={loading} style={{width:"100%",padding:"11px",background:loading?T.border:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:loading?"not-allowed":"pointer",marginBottom:14,transition:"background .15s"}}
        onMouseEnter={e=>{if(!loading)e.target.style.background=T.sage2;}} onMouseLeave={e=>{if(!loading)e.target.style.background=T.sage;}}>
        {loading?"Signing in…":"Sign in →"}
      </button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><span style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300}}>New to Wello? </span><button onClick={()=>onSetView("business")} style={{background:"transparent",border:"none",color:T.sage,fontFamily:F.body,fontSize:11,fontWeight:600,cursor:"pointer",padding:0}}>Register interest</button></div>
        <button onClick={()=>setScreen("reset")} style={{background:"transparent",border:"none",color:T.stone,fontFamily:F.body,fontSize:11,cursor:"pointer",padding:0,fontWeight:300}}>Forgot password?</button>
      </div>
    </div>
  );

  // ── Password reset ────────────────────────────────────────────
  if (screen==="reset") return (
    <div style={{maxWidth:420,margin:"80px auto",padding:"0 28px"}}>
      <button onClick={()=>setScreen("login")} style={{background:"transparent",border:"none",color:T.stone,fontFamily:F.body,fontSize:11,cursor:"pointer",marginBottom:24,padding:0,fontWeight:300}}>← Back to sign in</button>
      <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:22,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 6px"}}>Reset your password</h1>
      <p style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300,margin:"0 0 24px"}}>Enter the email address for your Wello business account and we'll send you a reset link.</p>
      {resetSent ? (
        <div style={{background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:3,padding:"16px",textAlign:"center"}}>
          <div style={{fontSize:24,marginBottom:8}}>✓</div>
          <div style={{fontFamily:F.body,fontSize:13,color:T.sage,fontWeight:600,marginBottom:4}}>Reset link sent</div>
          <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300}}>Check your email and follow the link to set a new password.</div>
        </div>
      ) : (
        <>
          <FieldLabel>Email address</FieldLabel>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="hello@yourbusiness.com"
            style={INP3} onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=T.border}/>
          <button onClick={doPasswordReset} disabled={loading||!email.trim()} style={{width:"100%",padding:"11px",background:email.trim()&&!loading?T.sage:T.border,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:email.trim()&&!loading?"pointer":"not-allowed",transition:"background .15s"}}>
            {loading?"Sending…":"Send reset link →"}
          </button>
        </>
      )}
    </div>
  );

  // ── Loading ───────────────────────────────────────────────────
  if (screen==="loading") return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"60vh"}}>
      <span style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300}}>Loading…</span>
    </div>
  );

  // ── Onboarding wizard ─────────────────────────────────────────
  if (screen==="onboarding") {
    // If the partner already has at least one approved venue, offer a "Back
    // to dashboard" escape from the wizard. Used after they hit "+ Add
    // another venue" but want to bail out before finishing.
    const hasApproved = venues.some(v => v.status === 'approved');
    const backToDashboard = hasApproved
      ? () => {
          const approved = venues.find(v => v.status === 'approved');
          setActiveVenueId(approved.id);
          setScreen('dashboard');
        }
      : null;
    return (
      <>
        <PartnerOnboarding
          key={`${activeVenueId}-${bizData?.business_type || 'unknown'}`}
          bizData={bizData}
          onSubmitted={async ()=>{
            // Refresh venues so the just-submitted row reflects status='submitted'.
            // Don't pin the active venue — pickBizRow will float an approved
            // sibling (if one exists) to the top so the partner lands on their
            // working dashboard instead of getting stuck on a "submitted" wall.
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              setActiveVenueId(null);
              await loadVenues(session);
            } else {
              setScreen("submitted");
            }
          }}
          doSignOut={doSignOut}
          onBackToDashboard={backToDashboard}
          onRemoveVenue={bizData?.id ? () => requestDeleteVenue(bizData.id) : null}
          onChangeType={bizData?.id ? () => requestChangeVenueType(bizData.id) : null}
        />
        {confirmingDeleteId !== null && (
          <DeleteVenueModal
            venueName={venues.find(v => v.id === confirmingDeleteId)?.name}
            busy={deletingVenue}
            onCancel={() => setConfirmingDeleteId(null)}
            onConfirm={async () => {
              setDeletingVenue(true);
              try { await deleteVenue(confirmingDeleteId); }
              finally { setDeletingVenue(false); setConfirmingDeleteId(null); }
            }}
          />
        )}
        {changingTypeForId !== null && (
          <AddVenueTypeModal
            title="Change listing type"
            subtitle="Pick a different category for this venue. The wizard will reflow to match."
            currentType={venues.find(v => v.id === changingTypeForId)?.business_type}
            busy={changingType}
            onCancel={() => setChangingTypeForId(null)}
            onPick={(typeId) => changeVenueType(changingTypeForId, typeId)}
          />
        )}
      </>
    );
  }

  // ── Submitted ─────────────────────────────────────────────────
  if (screen==="submitted") {
    const approvedVenue = venues.find(v => v.status === 'approved');
    return (
      <div>
        {/* Venue selector strip — only meaningful when the partner owns more
            than one venue. Lets them switch back to a live dashboard without
            signing out. */}
        {venues.length > 1 && (
          <div style={{background:T.ink,padding:"12px 28px"}}>
            <div style={{maxWidth:960,margin:"0 auto",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              <span style={{fontFamily:F.body,fontSize:9,color:"rgba(255,255,255,0.4)",letterSpacing:"1.5px",textTransform:"uppercase",marginRight:4}}>Venues</span>
              {venues.map(v => {
                const active = v.id === activeVenueId;
                const dot = v.status === 'approved' ? '#A3B18A'
                          : v.status === 'submitted' ? '#D6B47C'
                          : v.status === 'setting_up' ? '#FFB07A'
                          : 'rgba(255,255,255,0.4)';
                return (
                  <button key={v.id} onClick={() => !active && switchVenue(v.id)}
                    style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:999,border:`1px solid ${active?"rgba(255,255,255,0.4)":"rgba(255,255,255,0.12)"}`,background:active?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.04)",color:"#fff",fontFamily:F.body,fontSize:11,fontWeight:active?700:400,cursor:active?"default":"pointer",whiteSpace:"nowrap"}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:dot,display:"inline-block",flexShrink:0}}/>
                    {v.name || 'Untitled venue'}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div style={{maxWidth:520,margin:"80px auto",padding:"0 28px",textAlign:"center"}}>
          <div style={{width:56,height:56,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px"}}><Check size={26} stroke={T.sage} strokeWidth={2.5}/></div>
          <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:22,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 10px"}}>Listing submitted</h1>
          <p style={{fontFamily:F.body,fontSize:13,color:T.stone,fontWeight:300,lineHeight:1.75,margin:"0 0 24px"}}>We've received your listing for <strong style={{fontWeight:600,color:T.ink}}>{bizData?.name}</strong>. We'll review it and be in touch within 2 working days.</p>

          {/* ── Set a password ────────────────────────────────────────
              Shown once, right after the partner submits. Skippable.
              Persists via user_metadata.password_set so we don't
              re-prompt on future submissions. If the partner reached
              here via a magic link, they currently have no password —
              this step gives them one so future logins don't need
              another magic link email. */}
          {!pwSetupAlreadySet && !pwSetupSkipped && !pwSetupDone && (
            <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:10,padding:"18px 20px",margin:"0 0 20px",textAlign:"left"}}>
              <p style={{fontFamily:F.body,fontSize:10,fontWeight:700,color:T.sage,letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 6px"}}>One more thing</p>
              <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:16,fontWeight:700,color:T.ink,margin:"0 0 6px",letterSpacing:"-0.3px"}}>Set or update your password</h2>
              <p style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300,lineHeight:1.6,margin:"0 0 12px"}}>If you signed in via a magic link, set one now so you can log back in with your email and password. If you already have a password on Wello, this replaces it.</p>
              <input type="password" value={pwSetupPw1} onChange={e=>setPwSetupPw1(e.target.value)} placeholder="New password (min 8 chars)" autoComplete="new-password"
                style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:6,fontFamily:F.body,fontSize:13,background:T.bg2,color:T.ink,boxSizing:"border-box",marginBottom:8}}/>
              <input type="password" value={pwSetupPw2} onChange={e=>setPwSetupPw2(e.target.value)} placeholder="Confirm password" autoComplete="new-password"
                style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:6,fontFamily:F.body,fontSize:13,background:T.bg2,color:T.ink,boxSizing:"border-box"}}/>
              {pwSetupErr && <p style={{fontFamily:F.body,fontSize:12,color:"#8B2F00",margin:"8px 0 0"}}>{pwSetupErr}</p>}
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button onClick={saveInitialPassword} disabled={pwSetupSaving || !pwSetupPw1 || !pwSetupPw2}
                  style={{flex:1,padding:"10px 16px",background:pwSetupSaving||!pwSetupPw1||!pwSetupPw2?T.border:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:pwSetupSaving||!pwSetupPw1||!pwSetupPw2?"not-allowed":"pointer"}}>
                  {pwSetupSaving ? "Saving..." : "Set password"}
                </button>
                <button onClick={dismissPasswordSetup}
                  style={{padding:"10px 16px",background:"transparent",color:T.stone,border:`1px solid ${T.border}`,borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:400,cursor:"pointer"}}>
                  Skip for now
                </button>
              </div>
              <p style={{fontFamily:F.body,fontSize:10,color:T.stone2,margin:"10px 0 0",lineHeight:1.55}}>If you skip, you can set one later from the sign-in page using Forgot Password.</p>
            </div>
          )}
          {pwSetupDone && (
            <div style={{background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:10,padding:"12px 16px",margin:"0 0 20px",textAlign:"left"}}>
              <p style={{fontFamily:F.body,fontSize:12,fontWeight:600,color:T.sage,margin:0}}>Password set. You can now sign in with your email and password anytime.</p>
            </div>
          )}
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            {approvedVenue && (
              <button onClick={()=>switchVenue(approvedVenue.id)}
                style={{padding:"9px 22px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:11,cursor:"pointer",fontWeight:600}}>
                ← Back to {approvedVenue.name || 'your dashboard'}
              </button>
            )}
            <button onClick={doSignOut} style={{padding:"9px 22px",background:"transparent",color:T.stone,border:`1px solid ${T.border}`,borderRadius:2,fontFamily:F.body,fontSize:11,cursor:"pointer",fontWeight:300}}>Sign out</button>
          </div>

          {/* Escape hatch: if a partner submitted by accident or wants to
              start over, surface a delete option here too. Opens the same
              branded DeleteVenueModal that the dashboard uses. */}
          {bizData?.id && (
            <button onClick={() => requestDeleteVenue(bizData.id)}
              style={{display:"block",margin:"28px auto 0",background:"transparent",border:"none",color:T.clay,fontFamily:F.body,fontSize:11,fontWeight:500,cursor:"pointer",textDecoration:"underline"}}>
              Remove this venue instead
            </button>
          )}
        </div>
        {confirmingDeleteId !== null && (
          <DeleteVenueModal
            venueName={venues.find(v => v.id === confirmingDeleteId)?.name}
            busy={deletingVenue}
            onCancel={() => setConfirmingDeleteId(null)}
            onConfirm={async () => {
              setDeletingVenue(true);
              try { await deleteVenue(confirmingDeleteId); }
              finally { setDeletingVenue(false); setConfirmingDeleteId(null); }
            }}
          />
        )}
      </div>
    );
  }

  // ── Pending ───────────────────────────────────────────────────
  if (screen==="pending") return (
    <div>
      <div style={{maxWidth:520,margin:"80px auto",padding:"0 28px",textAlign:"center"}}>
        <div style={{width:56,height:56,background:T.ochreXL,border:`1px solid ${T.ochreL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:22}}>⏳</div>
        <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:22,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 10px"}}>Application under review</h1>
        <p style={{fontFamily:F.body,fontSize:13,color:T.stone,fontWeight:300,lineHeight:1.75,margin:"0 0 6px"}}>Thanks for registering <strong style={{fontWeight:600,color:T.ink}}>{bizData?.name}</strong>.</p>
        <p style={{fontFamily:F.body,fontSize:13,color:T.stone,fontWeight:300,lineHeight:1.75,margin:"0 0 24px"}}>The Wello team will review your application and be in touch within 2 working days.</p>
        <div style={{background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:3,padding:"14px 18px",textAlign:"left",marginBottom:24}}>
          <div style={{fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:600,marginBottom:6}}>What happens next</div>
          {["We review your venue details and listing","We agree your commission rate with you directly","You receive an approval email and can log in to your dashboard","Your listing goes live on the marketplace"].map((s,i)=>(
            <div key={i} style={{display:"flex",gap:9,marginBottom:6}}>
              <div style={{width:16,height:16,borderRadius:"50%",background:T.sage,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,flexShrink:0,marginTop:1}}>{i+1}</div>
              <span style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300}}>{s}</span>
            </div>
          ))}
        </div>
        <button onClick={doSignOut} style={{padding:"9px 22px",background:"transparent",color:T.stone,border:`1px solid ${T.border}`,borderRadius:2,fontFamily:F.body,fontSize:11,cursor:"pointer",fontWeight:300}}>Sign out</button>
        {bizData?.id && (
          <button onClick={() => requestDeleteVenue(bizData.id)}
            style={{display:"block",margin:"22px auto 0",background:"transparent",border:"none",color:T.clay,fontFamily:F.body,fontSize:11,fontWeight:500,cursor:"pointer",textDecoration:"underline"}}>
            Cancel this application
          </button>
        )}
      </div>
      {confirmingDeleteId !== null && (
        <DeleteVenueModal
          venueName={venues.find(v => v.id === confirmingDeleteId)?.name}
          busy={deletingVenue}
          onCancel={() => setConfirmingDeleteId(null)}
          onConfirm={async () => {
            setDeletingVenue(true);
            try { await deleteVenue(confirmingDeleteId); }
            finally { setDeletingVenue(false); setConfirmingDeleteId(null); }
          }}
        />
      )}
    </div>
  );

  // ── Approved dashboard ────────────────────────────────────────
  if (screen==="dashboard") return (
    <>
      <BusinessPortalDashboard
        key={`${activeVenueId}-${bizData?.business_type || 'unknown'}`}
        onExit={doSignOut}
        bizData={bizData}
        isPreview={false}
        venues={venues}
        activeVenueId={activeVenueId}
        onSwitchVenue={switchVenue}
        onAddVenue={() => setShowAddTypeModal(true)}
        addingVenue={addingVenue}
        onDeleteVenue={requestDeleteVenue}
        onChangeType={bizData?.id ? () => requestChangeVenueType(bizData.id) : null}
      />
      {showAddTypeModal && (
        <AddVenueTypeModal
          busy={addingVenue}
          onCancel={() => setShowAddTypeModal(false)}
          onPick={async (typeId) => {
            setShowAddTypeModal(false);
            await addVenue(typeId);
          }}
        />
      )}
      {changingTypeForId !== null && (
        <AddVenueTypeModal
          title="Change listing type"
          subtitle="Pick a different category for this venue. The dashboard tabs and customer-facing card will refresh to match."
          currentType={venues.find(v => v.id === changingTypeForId)?.business_type}
          busy={changingType}
          onCancel={() => setChangingTypeForId(null)}
          onPick={(typeId) => changeVenueType(changingTypeForId, typeId)}
        />
      )}
      {confirmingDeleteId !== null && (
        <DeleteVenueModal
          venueName={venues.find(v => v.id === confirmingDeleteId)?.name}
          busy={deletingVenue}
          onCancel={() => setConfirmingDeleteId(null)}
          onConfirm={async () => {
            setDeletingVenue(true);
            try { await deleteVenue(confirmingDeleteId); }
            finally { setDeletingVenue(false); setConfirmingDeleteId(null); }
          }}
        />
      )}
    </>
  );

  return null;
}

// ═══════════════════════════════════════════════════════════════
// ADMIN SETUP — internal AI-assisted partner setup tool
// ═══════════════════════════════════════════════════════════════
//
// Not linked anywhere in the public UI. Reached via ?admin=setup and
// gated by VITE_ADMIN_SETUP_ENABLED. Uploads (image/PDF/text) go to the
// extract-sessions edge function, which returns structured session JSON
// for review and optional bulk creation into businesses.slots +
// businesses.session_offerings (and 4 weeks of slot rows if a listing
// is already active).

const DAY_CODE_TO_SHORT = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };
const DAY_SHORT_TO_CODE = { Mon:'mon', Tue:'tue', Wed:'wed', Thu:'thu', Fri:'fri', Sat:'sat', Sun:'sun' };
const DAY_IDX_ADMIN = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:0 };

// Parse "60 min", "90 min", "2 hours", "Open" into a duration in minutes or
// null if we can't interpret it (e.g. "Open" for gym passes).
function parseDurationString(dur) {
  if (dur == null) return null;
  const s = String(dur).trim();
  const min = s.match(/^(\d+)\s*min/i);
  if (min) return parseInt(min[1], 10);
  const hr = s.match(/^(\d+)\s*hour/i);
  if (hr) return parseInt(hr[1], 10) * 60;
  return null;
}

// Convert one businesses.slots entry (which may cover multiple days at one
// time) into a class-kind review row.
function slotEntryToRow(sl, idx) {
  const days = Array.isArray(sl?.days) ? sl.days : [];
  const time = String(sl?.time || '09:00');
  return {
    _rid: `existing_slot_${idx}_${Date.now()}`,
    _origin: 'existing',
    name: String(sl?.name || ''),
    kind: 'class',
    duration_minutes: parseDurationString(sl?.dur) ?? 60,
    price_eur: Number.isFinite(Number(sl?.cr)) ? Number(sl.cr) : null,
    capacity: Number.isFinite(Number(sl?.spots)) ? Number(sl.spots) : null,
    // Empty string on the row so the select's "inherit venue" option shows
    // as selected by default; on save we map empty back to null.
    category: sl?.category || '',
    description: null,
    schedule: days.map(d => ({ day: DAY_SHORT_TO_CODE[d] || 'mon', time })),
    confidence_flags: [],
  };
}

// Convert one businesses.session_offerings entry into an appointment-kind row.
function offeringToRow(o, idx) {
  return {
    _rid: `existing_offering_${idx}_${Date.now()}`,
    _origin: 'existing',
    name: String(o?.type || ''),
    kind: 'appointment',
    duration_minutes: Number.isFinite(Number(o?.length_min)) ? Number(o.length_min) : 60,
    price_eur: Number.isFinite(Number(o?.price_eur)) ? Number(o.price_eur) : null,
    capacity: 1,
    category: o?.category || '',
    description: null,
    schedule: null,
    confidence_flags: [],
  };
}

// Mirrors AMENITY_GROUPS inside the partner wizard (PartnerOnboarding). Kept
// duplicated on purpose: the admin tool is internal and shouldn't share
// scope with a wizard-local constant. If the wizard's list changes, update
// this one too so the tags admin picks stay meaningful in the partner UI.
const ADMIN_AMENITY_GROUPS = [
  { name: "Facilities",         items: ["Showers","Changing rooms","Lockers","Cafe","Wifi","Parking","Air conditioning","Wheelchair access"] },
  { name: "Equipment provided", items: ["Towels provided","Mats provided","Equipment provided"] },
  { name: "Pools & wellness",   items: ["Outdoor pool","Indoor pool","Sauna","Steam room","Hot tub","Jacuzzi"] },
  { name: "Setting",            items: ["Sea views","Mountain views","Beachfront","Rooftop","Olive groves","Garden"] },
  { name: "Suitable for",       items: ["Kids welcome","Beginner friendly","All levels","Advanced","Small groups","Private sessions"] },
  { name: "Languages",          items: ["Multilingual instructors","English spoken","Spanish spoken","German spoken"] },
];
const ADMIN_AMENITY_OPTIONS = ADMIN_AMENITY_GROUPS.flatMap(g => g.items);

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      // Strip the "data:mime;base64," prefix so the edge function receives raw base64.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Aggregates identical (day, HH:MM) rows into { day, time } list matching the
// businesses.slots schema. Also collapses days that share the same time so the
// slot rows look sensible on the review table.
function normaliseSchedule(schedule) {
  if (!Array.isArray(schedule)) return [];
  const out = [];
  for (const s of schedule) {
    const day = DAY_CODE_TO_SHORT[String(s?.day || '').toLowerCase()];
    const time = String(s?.time || '').trim();
    if (!day || !/^\d{2}:\d{2}$/.test(time)) continue;
    if (!out.some(o => o.day === day && o.time === time)) out.push({ day, time });
  }
  return out;
}

function scheduleSummary(schedule) {
  const norm = normaliseSchedule(schedule);
  if (norm.length === 0) return '—';
  // Group by time so "Mon,Wed,Fri @ 07:00" reads clearly.
  const byTime = {};
  for (const { day, time } of norm) {
    if (!byTime[time]) byTime[time] = [];
    if (!byTime[time].includes(day)) byTime[time].push(day);
  }
  const order = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return Object.entries(byTime)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([time, days]) => `${days.sort((a,b)=>order.indexOf(a)-order.indexOf(b)).join(', ')} @ ${time}`)
    .join(' · ');
}

function AdminSetupPage() {
  // Server-side edge functions enforce the ADMIN_USER_IDS allowlist. Client
  // side only checks "is there any auth session" so we can show a helpful
  // sign-in prompt instead of letting extract-sessions and generate-magic-link
  // 403 without context.
  const [authReady, setAuthReady] = useState(false);
  const [authUserId, setAuthUserId] = useState(null);
  const [authEmail, setAuthEmail] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      setAuthUserId(session?.user?.id || null);
      setAuthEmail(session?.user?.email || null);
      setAuthReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const [businesses, setBusinesses] = useState([]);
  const [businessId, setBusinessId] = useState('');
  const [bizRow, setBizRow] = useState(null);
  const [inputMode, setInputMode] = useState('file'); // 'file' | 'text'
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [rows, setRows] = useState([]); // editable sessions
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState(null);

  // ── Enrichment state (description, address, tags, photos) ──
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [tags, setTags] = useState([]);
  const [customTag, setCustomTag] = useState('');
  const [primaryImg, setPrimaryImg] = useState(null);
  const [gallery, setGallery] = useState([]);
  const [enrichmentSaving, setEnrichmentSaving] = useState(false);
  const [enrichmentMsg, setEnrichmentMsg] = useState('');
  const [uploadingPrimary, setUploadingPrimary] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [photoErr, setPhotoErr] = useState('');

  // ── Ownership handoff state ──
  const [partnerEmail, setPartnerEmail] = useState('');
  // Contact person's first name (or full name — we use split on space when
  // greeting). Populated by the admin so the wizard's "Welcome to Wello,
  // Maria" copy is a real person rather than the business name.
  const [partnerContactName, setPartnerContactName] = useState('');
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferMsg, setTransferMsg] = useState('');

  // ── Magic link state ──
  const [linkGenerating, setLinkGenerating] = useState(false);
  const [linkResult, setLinkResult] = useState(null); // { magic_link, email, business_name }
  const [linkError, setLinkError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  // ── Weekly payouts state ──
  // Response from the run-weekly-payouts function (dry-run or real). Rendered
  // as JSON so the admin can eyeball the per-business plan / outcome.
  const [payoutRunning, setPayoutRunning] = useState(false);
  const [payoutResult,  setPayoutResult]  = useState(null);
  const [payoutError,   setPayoutError]   = useState('');
  async function invokePayouts(dryRun) {
    setPayoutRunning(true); setPayoutError(''); setPayoutResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('run-weekly-payouts', {
        body: { dry_run: !!dryRun },
      });
      if (error) throw new Error(error.message || 'invoke failed');
      if (data?.error) throw new Error(data.error);
      setPayoutResult(data);
    } catch (e) {
      setPayoutError(e?.message || 'Unexpected error');
    } finally {
      setPayoutRunning(false);
    }
  }

  // ── Connect onboarding link state ──
  // Admins can re-issue a Stripe Connect onboarding link for any selected
  // business (support: partner lost their link / needs a fresh one). Uses
  // the admin bypass in create-connect-onboarding — a partner calling their
  // own function still passes; an admin calling on behalf now also passes.
  const [onboardLoading, setOnboardLoading] = useState(false);
  const [onboardResult,  setOnboardResult]  = useState(null);
  const [onboardError,   setOnboardError]   = useState('');
  async function invokeOnboarding() {
    if (!bizRow?.id) { setOnboardError('Select a business in step 1 first.'); return; }
    setOnboardLoading(true); setOnboardError(''); setOnboardResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('create-connect-onboarding', {
        body: { business_id: bizRow.id },
      });
      if (error) throw new Error(error.message || 'invoke failed');
      if (data?.error) throw new Error(data.error);
      setOnboardResult(data);
    } catch (e) {
      setOnboardError(e?.message || 'Unexpected error');
    } finally {
      setOnboardLoading(false);
    }
  }

  // ── Payout test seeder state ──
  // Seeds one backdated confirmed booking + ensures commission fields are
  // populated on the selected business. Test-only; the booking is tagged in
  // its notes column so it's easy to spot / clean up later.
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedResult,  setSeedResult]  = useState(null);
  const [seedError,   setSeedError]   = useState('');
  const [seedCredits, setSeedCredits] = useState(25);
  const [seedDaysAgo, setSeedDaysAgo] = useState(4);
  const [seedForceBypass, setSeedForceBypass] = useState(false);
  async function invokeSeed() {
    if (!bizRow?.id) { setSeedError('Select a business in step 1 first.'); return; }
    setSeedLoading(true); setSeedError(''); setSeedResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('seed-payout-test-booking', {
        body: {
          business_id: bizRow.id,
          credits: Number(seedCredits),
          days_ago: Number(seedDaysAgo),
          force_bypass_safety_window: seedForceBypass,
        },
      });
      if (error) throw new Error(error.message || 'invoke failed');
      if (data?.error) throw new Error(data.error);
      setSeedResult(data);
    } catch (e) {
      setSeedError(e?.message || 'Unexpected error');
    } finally {
      setSeedLoading(false);
    }
  }

  useEffect(() => {
    // Wait until the auth check has finished so we don't fire this with
    // no session (would 403 at the edge). Refetch whenever the signed-in
    // user changes so switching accounts refreshes the dropdown without
    // needing a page reload.
    if (!authReady || !authUserId) return;
    (async () => {
      const { data, error } = await supabase.functions.invoke('admin-businesses', {
        body: { op: 'list' },
      });
      if (error) { console.error('admin-businesses list invoke failed:', error.message); return; }
      if (data?.error) { console.error('admin-businesses list returned error:', data.error); return; }
      setBusinesses(Array.isArray(data?.businesses) ? data.businesses : []);
    })();
  }, [authReady, authUserId]);

  useEffect(() => {
    const row = businesses.find(b => String(b.id) === String(businessId)) || null;
    setBizRow(row);
    // Populate enrichment fields AND session review rows from the row so the
    // admin sees the current state of the business immediately. Rows loaded
    // this way carry _origin='existing' so the save path knows not to
    // slot-expand them a second time.
    if (row) {
      setDescription(row.description || '');
      setAddress(row.address || '');
      setTags(Array.isArray(row.tags) ? row.tags : []);
      setPrimaryImg(row.img || null);
      setGallery(Array.isArray(row.gallery) ? row.gallery.filter(u => typeof u === 'string' && !u.startsWith('blob:')) : []);
      setPartnerEmail(row.email || '');
      setPartnerContactName(row.contact_name || '');
      const existingSlots = Array.isArray(row.slots) ? row.slots : [];
      const existingOfferings = Array.isArray(row.session_offerings) ? row.session_offerings : [];
      const rowsFromDb = [
        ...existingSlots.map((sl, i) => slotEntryToRow(sl, i)),
        ...existingOfferings.map((o, i) => offeringToRow(o, i)),
      ];
      setRows(rowsFromDb);
    } else {
      setDescription(''); setAddress(''); setTags([]); setPrimaryImg(null); setGallery([]);
      setPartnerEmail('');
      setPartnerContactName('');
      setRows([]);
    }
    setEnrichmentMsg('');
    setTransferMsg('');
    setPhotoErr('');
    setCreateResult(null);
    setLinkResult(null); setLinkError(''); setLinkCopied(false);
  }, [businessId, businesses]);

  // ── Photo upload (matches wizard: bucket=venue-photos, path={uid}/{bizId}-...) ──
  async function uploadPhotoFile(fileObj, slot) {
    if (!bizRow?.id) return { url: null, error: 'Pick a business first.' };
    if (!/^image\//.test(fileObj.type)) return { url: null, error: 'That is not an image file.' };
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return { url: null, error: 'You need to be signed in to upload photos.' };
    const path = `${uid}/${bizRow.id}-admin-${slot}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('venue-photos').upload(path, fileObj, { contentType: fileObj.type, upsert: true });
    if (error) return { url: null, error: error.message };
    const url = supabase.storage.from('venue-photos').getPublicUrl(path).data.publicUrl;
    return { url, error: null };
  }
  // All businesses writes go through the admin-businesses edge function so
  // we bypass the businesses-table RLS that restricts authenticated users
  // to their own row. Server-side requireAdmin + column whitelist.
  async function adminPatchBusiness(patch, opts = {}) {
    const { data, error } = await supabase.functions.invoke('admin-businesses', {
      body: {
        op: 'update',
        business_id: bizRow.id,
        patch,
        mirror_img_to_listing: !!opts.mirror_img_to_listing,
      },
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return { ok: true };
  }

  async function handlePrimaryPhotoChange(e) {
    const f = e.target.files?.[0];
    if (!f || !bizRow?.id) return;
    setPhotoErr(''); setUploadingPrimary(true);
    const { url, error } = await uploadPhotoFile(f, 'primary');
    setUploadingPrimary(false);
    if (error) { setPhotoErr('Primary photo upload failed. ' + error); return; }
    setPrimaryImg(url);
    const res = await adminPatchBusiness({ img: url }, { mirror_img_to_listing: true });
    if (res.error) setPhotoErr('Saved to storage but businesses update failed: ' + res.error);
  }
  async function handleAddGalleryPhoto(e) {
    const f = e.target.files?.[0];
    if (!f || !bizRow?.id) return;
    if (gallery.length >= 4) { setPhotoErr('Up to 4 gallery photos.'); return; }
    setPhotoErr(''); setUploadingGallery(true);
    const { url, error } = await uploadPhotoFile(f, `gallery-${gallery.length}`);
    setUploadingGallery(false);
    if (error) { setPhotoErr('Gallery photo upload failed. ' + error); return; }
    const next = [...gallery, url];
    setGallery(next);
    const res = await adminPatchBusiness({ gallery: next });
    if (res.error) setPhotoErr('Uploaded but businesses gallery update failed: ' + res.error);
  }
  async function removeGalleryPhoto(idx) {
    if (!bizRow?.id) return;
    const next = gallery.filter((_, i) => i !== idx);
    setGallery(next);
    const res = await adminPatchBusiness({ gallery: next });
    if (res.error) setPhotoErr('Gallery update failed: ' + res.error);
  }

  function toggleTag(t) {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }
  function addCustomTag() {
    const t = customTag.trim();
    if (!t) return;
    if (!tags.includes(t)) setTags(prev => [...prev, t]);
    setCustomTag('');
  }

  async function saveEnrichment() {
    if (!bizRow?.id) return;
    setEnrichmentSaving(true);
    setEnrichmentMsg('');
    const res = await adminPatchBusiness({
      description: description || null,
      address: address || null,
      tags: Array.isArray(tags) ? tags : [],
    });
    setEnrichmentSaving(false);
    setEnrichmentMsg(res.error ? `Save failed: ${res.error}` : 'Saved.');
  }

  async function saveOwnershipTransfer() {
    if (!bizRow?.id) return;
    const nextEmail = String(partnerEmail || '').trim().toLowerCase();
    const currentEmail = String(bizRow.email || '').trim().toLowerCase();

    if (!nextEmail) {
      setTransferMsg('Partner email cannot be blank.');
      return;
    }
    // Trivial email shape check — anything reaching the auth layer will get
    // Supabase's validation on top. Just catch obvious typos here.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setTransferMsg('That does not look like a valid email address.');
      return;
    }
    const cleanContact = String(partnerContactName || '').trim();
    const contactChanged = cleanContact !== String(bizRow.contact_name || '').trim();
    const emailChanged   = nextEmail !== currentEmail;
    if (!emailChanged && !contactChanged) {
      setTransferMsg('Nothing to save — email and contact name are unchanged.');
      return;
    }

    // Only show the ownership-transfer scare dialog when the email is
    // actually changing. Contact-name-only saves are low-risk and should
    // land without a confirm-are-you-sure step.
    if (emailChanged) {
      const ok = window.confirm(
        `Transfer ownership of this listing to ${nextEmail}?\n\n` +
        `You will lose access to it in the partner portal and the magic link will go to this address.\n\n` +
        `Current owner: ${currentEmail || '(none)'}\n` +
        `New owner:     ${nextEmail}`
      );
      if (!ok) return;
    }

    setTransferSaving(true);
    setTransferMsg('');
    // Bundle whichever fields changed. adminPatchBusiness whitelists both.
    const patch = {};
    if (emailChanged)   patch.email = nextEmail;
    if (contactChanged) patch.contact_name = cleanContact || null;
    const res = await adminPatchBusiness(patch);
    setTransferSaving(false);

    if (res.error) { setTransferMsg(`Transfer failed: ${res.error}`); return; }

    // Reflect the new email locally so the magic link section immediately
    // uses it, and refetch the businesses list so the dropdown label + a
    // future reload stay in sync.
    setBizRow(prev => prev ? { ...prev, email: nextEmail, user_id: null, contact_name: cleanContact || null } : prev);
    setBusinesses(prev => prev.map(b => b.id === bizRow.id ? { ...b, email: nextEmail, user_id: null, contact_name: cleanContact || null } : b));
    // Wipe any previously-generated link since it was for the old email.
    setLinkResult(null); setLinkError(''); setLinkCopied(false);
    setTransferMsg(`Ownership transferred to ${nextEmail}. Generate a magic link below to hand off.`);
  }

  async function generateMagicLink() {
    if (!bizRow?.id) return;
    setLinkGenerating(true);
    setLinkError('');
    setLinkResult(null);
    setLinkCopied(false);
    try {
      const { data, error } = await supabase.functions.invoke('generate-magic-link', {
        body: { business_id: bizRow.id },
      });
      if (error) { setLinkError(error.message || 'Function invoke failed.'); return; }
      if (data?.error) { setLinkError(data.error); return; }
      if (!data?.magic_link) { setLinkError('No link returned.'); return; }
      setLinkResult(data);
    } catch (e) {
      setLinkError(e?.message || 'Failed to generate link.');
    } finally {
      setLinkGenerating(false);
    }
  }

  async function copyLink() {
    if (!linkResult?.magic_link) return;
    try { await navigator.clipboard.writeText(linkResult.magic_link); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }
    catch { /* clipboard blocked — user can copy manually */ }
  }

  async function runExtraction() {
    setExtractError('');
    setCreateResult(null);
    if (!businessId) { setExtractError('Pick a business first.'); return; }
    if (inputMode === 'text' && !text.trim()) { setExtractError('Paste some text.'); return; }
    if (inputMode === 'file' && !file) { setExtractError('Choose a file.'); return; }

    setExtracting(true);
    try {
      let payload = { business_id: businessId, business_type: bizRow?.business_type || bizRow?.category || null };
      if (inputMode === 'text') {
        payload = { ...payload, input_kind: 'text', text };
      } else {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const b64 = await fileToBase64(file);
        payload = {
          ...payload,
          input_kind: isPdf ? 'pdf' : 'image',
          file_media_type: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
          file_base64: b64,
        };
      }
      const { data, error } = await supabase.functions.invoke('extract-sessions', { body: payload });
      if (error) { setExtractError(error.message || 'Extraction failed.'); return; }
      if (data?.error) { setExtractError(data.error); return; }
      const sessions = Array.isArray(data?.result?.sessions) ? data.result.sessions : [];
      // Append to whatever is already in the review table so existing
      // sessions loaded from the DB stay visible. Extracted rows are tagged
      // _origin='extracted' so the save path knows they are new and need
      // to be slot-expanded on a listing that is already active.
      const newRows = sessions.map((s, i) => ({
        ...s,
        _rid: `extracted_${Date.now()}_${i}`,
        _origin: 'extracted',
      }));
      setRows(prev => [...prev, ...newRows]);
    } catch (e) {
      setExtractError(e?.message || 'Extraction failed.');
    } finally {
      setExtracting(false);
    }
  }

  function updateRow(rid, patch) {
    setRows(prev => prev.map(r => r._rid === rid ? { ...r, ...patch } : r));
  }
  function updateRowSchedule(rid, idx, patch) {
    setRows(prev => prev.map(r => {
      if (r._rid !== rid) return r;
      const sched = Array.isArray(r.schedule) ? r.schedule.slice() : [];
      sched[idx] = { ...sched[idx], ...patch };
      return { ...r, schedule: sched };
    }));
  }
  function addScheduleEntry(rid) {
    setRows(prev => prev.map(r => {
      if (r._rid !== rid) return r;
      const sched = Array.isArray(r.schedule) ? r.schedule.slice() : [];
      sched.push({ day: 'mon', time: '09:00' });
      return { ...r, schedule: sched };
    }));
  }
  function removeScheduleEntry(rid, idx) {
    setRows(prev => prev.map(r => {
      if (r._rid !== rid) return r;
      const sched = Array.isArray(r.schedule) ? r.schedule.slice() : [];
      sched.splice(idx, 1);
      return { ...r, schedule: sched };
    }));
  }
  function deleteRow(rid) { setRows(prev => prev.filter(r => r._rid !== rid)); }
  function addBlankRow(kind) {
    setRows(prev => [...prev, {
      _rid: `manual_${Date.now()}_${prev.length}`,
      _origin: 'new',
      name: '',
      kind,
      duration_minutes: 60,
      price_eur: null,
      capacity: kind === 'class' ? 10 : 1,
      category: '',
      description: null,
      schedule: kind === 'class' ? [{ day:'mon', time:'09:00' }] : null,
      confidence_flags: [],
    }]);
  }

  // A row blocks submission if it has no name, no price, or (for class kind)
  // no capacity / no valid schedule entry.
  function blockingIssues(r) {
    const issues = [];
    if (!String(r.name || '').trim()) issues.push('name');
    if (r.price_eur == null || Number(r.price_eur) <= 0) issues.push('price');
    if (r.kind === 'class') {
      if (r.capacity == null || Number(r.capacity) < 1) issues.push('capacity');
      const sched = normaliseSchedule(r.schedule);
      if (sched.length === 0) issues.push('schedule');
    }
    return issues;
  }

  const canSubmit = rows.length > 0 && rows.every(r => blockingIssues(r).length === 0);

  async function runCreation() {
    if (!canSubmit || !bizRow) return;
    setCreating(true);
    setCreateResult(null);
    const errors = [];
    let classSessionsTotal = 0;
    let appointmentOfferingsTotal = 0;
    let slotRowsInserted = 0;

    try {
      // The review table is the source of truth. On save we REPLACE
      // businesses.slots and session_offerings with what the admin sees,
      // then slot-expand only rows tagged _origin !== 'existing'
      // (extracted or manually added) so the admin can't accidentally
      // double-book weeks of slot rows when editing.
      const { data: getData, error: getErr } = await supabase.functions.invoke('admin-businesses', {
        body: { op: 'get', business_id: bizRow.id },
      });
      if (getErr) throw new Error(`admin-businesses get invoke failed: ${getErr.message}`);
      if (getData?.error) throw new Error(getData.error);
      const activeListingId = getData?.listing_id ?? null;

      const nextSlots = [];
      const nextOfferings = [];
      const newSlotEntriesForExpansion = [];

      for (const r of rows) {
        try {
          const price = Math.max(1, Math.round(Number(r.price_eur)));
          const dur = Number.isFinite(Number(r.duration_minutes)) && Number(r.duration_minutes) > 0
            ? Math.round(Number(r.duration_minutes)) : null;
          const name = String(r.name).trim();
          const isNew = r._origin !== 'existing';

          if (r.kind === 'class') {
            const sched = normaliseSchedule(r.schedule);
            // Group by time so one slot entry covers all days sharing that
            // time, matching how the wizard writes rows and how
            // notify-partner-status expects to read them.
            const byTime = {};
            for (const { day, time } of sched) {
              if (!byTime[time]) byTime[time] = [];
              if (!byTime[time].includes(day)) byTime[time].push(day);
            }
            // Per-slot category. Empty string on the row means "inherit
            // venue category" so we persist null. A non-empty override is
            // what feeds notify-partner-status's session_categories union
            // + the mirrored slots.category column on expansion.
            const catOverride = (r.category && String(r.category).trim()) || null;
            for (const [time, days] of Object.entries(byTime)) {
              const entry = {
                id: `admsl${Date.now()}_${nextSlots.length}`,
                name,
                days,
                time,
                dur: dur ? `${dur} min` : '60 min',
                spots: Math.max(1, Math.round(Number(r.capacity) || 1)),
                cr: price,
                category: catOverride,
              };
              nextSlots.push(entry);
              if (isNew) newSlotEntriesForExpansion.push(entry);
            }
            classSessionsTotal += 1;
          } else {
            const catOverride = (r.category && String(r.category).trim()) || null;
            nextOfferings.push({
              type: name,
              length_min: dur || 60,
              price_eur: price,
              category: catOverride,
            });
            appointmentOfferingsTotal += 1;
          }
        } catch (e) {
          errors.push({ name: r.name, error: e?.message || 'Row failed.' });
        }
      }

      const upd = await adminPatchBusiness({
        slots: nextSlots,
        session_offerings: nextOfferings,
      });
      if (upd.error) throw new Error(`businesses update failed: ${upd.error}`);

      // Only expand NEW class rows into concrete slots-table rows for the
      // next 4 weeks. Existing rows already have slot-table rows from a
      // prior save or from notify-partner-status.
      if (newSlotEntriesForExpansion.length > 0 && activeListingId) {
        const today = new Date();
        const slotRows = [];
        for (const sl of newSlotEntriesForExpansion) {
          for (const day of sl.days) {
            const target = DAY_IDX_ADMIN[day];
            const curr = today.getDay();
            const daysAhead = (target - curr + 7) % 7 || 7;
            for (let week = 0; week < 4; week++) {
              const d = new Date(today);
              d.setDate(today.getDate() + daysAhead + week * 7);
              slotRows.push({
                name: sl.name,
                date: d.toISOString().slice(0, 10),
                time: sl.time,
                dur: sl.dur,
                spots: sl.spots,
                credits: sl.cr,
                acuity_type_id: null,
                // Mirror the per-slot category down to slots.category so
                // the marketplace explore filter + Explore Schedule view
                // can hit an index instead of scanning JSONB. Null falls
                // back to the venue's primary category via the filter
                // predicate.
                category: sl.category || null,
              });
            }
          }
        }
        if (slotRows.length > 0) {
          const { data: insData, error: insErr } = await supabase.functions.invoke('admin-businesses', {
            body: { op: 'insert_slots', listing_id: activeListingId, slot_rows: slotRows },
          });
          if (insErr) errors.push({ name: '(slots insert)', error: insErr.message });
          else if (insData?.error) errors.push({ name: '(slots insert)', error: insData.error });
          else slotRowsInserted = insData?.inserted || slotRows.length;
        }
      }

      // Re-tag every row as _origin='existing' now that it has been saved,
      // so a subsequent Save doesn't slot-expand it again. Also rebuild
      // stable _rid values so the review table stays in sync.
      setRows(prev => prev.map((r, i) => ({
        ...r,
        _origin: 'existing',
        _rid: r._rid?.startsWith('existing_') ? r._rid : `existing_saved_${Date.now()}_${i}`,
      })));

      setCreateResult({
        classSessionsAdded: classSessionsTotal,
        appointmentOfferingsAdded: appointmentOfferingsTotal,
        slotRowsInserted,
        listingActive: !!activeListingId,
        errors,
      });
    } catch (e) {
      setCreateResult({ classSessionsAdded: classSessionsTotal, appointmentOfferingsAdded: appointmentOfferingsTotal, slotRowsInserted, errors: [...errors, { name: '(fatal)', error: e?.message || String(e) }] });
    } finally {
      setCreating(false);
    }
  }

  // ── Styles: plain, functional, no brand ──
  const S = {
    page: { maxWidth: 1100, margin: '32px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif', color: '#111' },
    h1: { fontSize: 22, fontWeight: 700, margin: '0 0 4px' },
    sub: { fontSize: 13, color: '#555', margin: '0 0 20px' },
    card: { border: '1px solid #ddd', borderRadius: 6, padding: 16, marginBottom: 20, background: '#fff' },
    label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#333', margin: '0 0 6px' },
    input: { width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' },
    btn: { padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
    btnGhost: { padding: '8px 16px', background: '#fff', color: '#111', border: '1px solid #ccc', borderRadius: 4, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
    btnDanger: { padding: '4px 8px', background: '#fff', color: '#a00', border: '1px solid #a00', borderRadius: 4, fontSize: 11, cursor: 'pointer' },
    flag: { display: 'inline-block', padding: '2px 6px', background: '#fff3cd', color: '#856404', border: '1px solid #ffeaa7', borderRadius: 3, fontSize: 11, marginRight: 4, marginBottom: 2 },
    blockingChip: { display: 'inline-block', padding: '2px 6px', background: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb', borderRadius: 3, fontSize: 11, marginRight: 4 },
    err: { padding: 10, background: '#fee', border: '1px solid #fbb', borderRadius: 4, fontSize: 13, color: '#a00', margin: '10px 0' },
    ok: { padding: 10, background: '#e7f5e7', border: '1px solid #a3d3a3', borderRadius: 4, fontSize: 13, color: '#155724', margin: '10px 0' },
    tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
    th: { textAlign: 'left', padding: 6, borderBottom: '2px solid #333', fontSize: 11, fontWeight: 700, background: '#f5f5f5' },
    td: { padding: 6, borderBottom: '1px solid #eee', verticalAlign: 'top' },
  };

  // ── Sign-in gate ──
  // The tool is unusable without a signed-in session because the edge
  // functions reject calls from anon-key JWTs. Show a clear prompt here so
  // the user doesn't get generic 403s in DevTools.
  if (!authReady) {
    return (
      <div style={{ maxWidth: 500, margin: '80px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif', color: '#555', fontSize: 13 }}>Loading...</div>
    );
  }
  if (!authUserId) {
    return (
      <div style={{ maxWidth: 600, margin: '80px auto', padding: '32px', fontFamily: 'system-ui, sans-serif', color: '#111', border: '1px solid #ddd', borderRadius: 6, background: '#fff' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>Admin: sign in required</h1>
        <p style={{ fontSize: 13, color: '#555', margin: '0 0 12px', lineHeight: 1.5 }}>The admin tool needs an authenticated session. The edge functions match your auth uid against an allowlist server-side and reject anon-key JWTs.</p>
        <p style={{ fontSize: 13, color: '#555', margin: '0 0 12px', lineHeight: 1.5 }}>Sign in via your usual customer or partner flow (open <code>/</code> or <code>/?portal=business</code> in another tab), then return here.</p>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Admin: AI-assisted partner setup</h1>
      <p style={S.sub}>Signed in as <strong>{authEmail || authUserId}</strong>. Upload a studio timetable or price list. Extract sessions with Claude. Review, edit, and write into the selected business.</p>

      {/* ── Step 1: Input ── */}
      <div style={S.card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>1. Input</h2>

        <div style={{ marginBottom: 12 }}>
          <label style={S.label}>Target business</label>
          <select value={businessId} onChange={e => setBusinessId(e.target.value)} style={S.input}>
            <option value="">— pick a business —</option>
            {businesses.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} (id {b.id}, {b.business_type || b.category || 'unknown type'}, {b.status})
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={S.label}>Input mode</label>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ fontSize: 13 }}>
              <input type="radio" name="inputMode" checked={inputMode === 'file'} onChange={() => setInputMode('file')} /> File (image or PDF)
            </label>
            <label style={{ fontSize: 13 }}>
              <input type="radio" name="inputMode" checked={inputMode === 'text'} onChange={() => setInputMode('text')} /> Pasted text
            </label>
          </div>
        </div>

        {inputMode === 'file' ? (
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>File</label>
            <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
            {file && <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{file.name} ({Math.round(file.size / 1024)} KB)</div>}
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Timetable text</label>
            <textarea rows={8} value={text} onChange={e => setText(e.target.value)} style={{ ...S.input, fontFamily: 'ui-monospace, monospace', resize: 'vertical' }} placeholder="Paste the studio's timetable or price list here."/>
          </div>
        )}

        <button onClick={runExtraction} disabled={extracting} style={{ ...S.btn, opacity: extracting ? 0.6 : 1 }}>
          {extracting ? 'Extracting...' : 'Extract sessions'}
        </button>

        {extractError && <div style={S.err}>{extractError}</div>}
      </div>

      {/* ── Step 2: Review ── */}
      {rows.length > 0 && (
        <div style={S.card}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>2. Review and edit</h2>
          {(() => {
            const existingCount = rows.filter(r => r._origin === 'existing').length;
            const newCount = rows.length - existingCount;
            return (
              <p style={{ fontSize: 12, color: '#555', margin: '0 0 12px' }}>
                {existingCount} already saved on this business{newCount > 0 ? `, ${newCount} new to save` : ''}. Amber flags are model uncertainty. Red chips block save until filled. Save REPLACES the business slots and offerings with what is shown here.
              </p>
            );
          })()}

          <table style={S.tbl}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>Kind</th>
                <th style={S.th}>Category</th>
                <th style={S.th}>Duration (min)</th>
                <th style={S.th}>Credits (EUR)</th>
                <th style={S.th}>Capacity</th>
                <th style={S.th}>Schedule</th>
                <th style={S.th}>Flags</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const issues = blockingIssues(r);
                return (
                  <tr key={r._rid} style={{ background: issues.length > 0 ? '#fdf4f4' : (r._origin === 'existing' ? '#f7f9f7' : '#fff') }}>
                    <td style={S.td}>
                      <input value={r.name || ''} onChange={e => updateRow(r._rid, { name: e.target.value })} style={S.input}/>
                      <div style={{ fontSize: 10, color: r._origin === 'existing' ? '#155724' : '#856404', marginTop: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {r._origin === 'existing' ? 'saved' : r._origin === 'extracted' ? 'extracted' : 'new'}
                      </div>
                      {r.description && <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{r.description}</div>}
                    </td>
                    <td style={S.td}>
                      <select value={r.kind} onChange={e => updateRow(r._rid, { kind: e.target.value, schedule: e.target.value === 'appointment' ? null : (r.schedule || [{ day:'mon', time:'09:00' }]) })} style={S.input}>
                        <option value="class">class</option>
                        <option value="appointment">appointment</option>
                      </select>
                    </td>
                    <td style={S.td}>
                      <select value={r.category || ''} onChange={e => updateRow(r._rid, { category: e.target.value })} style={{ ...S.input, minWidth: 130 }}>
                        <option value="">Venue default</option>
                        {['Yoga','Pilates','Meditation','Sound Bath','Massage','Spa','Fitness Class','Hotel Gym','Pool Access','Surfing','Paddle Boarding','Kayaking','Cycling','Running','Hiking','Padel','Tennis','Pickleball','Private Instructor'].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td style={S.td}>
                      <input type="number" min="1" value={r.duration_minutes ?? ''} onChange={e => updateRow(r._rid, { duration_minutes: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...S.input, width: 70 }}/>
                    </td>
                    <td style={S.td}>
                      <input type="number" min="1" value={r.price_eur ?? ''} onChange={e => updateRow(r._rid, { price_eur: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...S.input, width: 70 }}/>
                    </td>
                    <td style={S.td}>
                      {r.kind === 'class' ? (
                        <input type="number" min="1" value={r.capacity ?? ''} onChange={e => updateRow(r._rid, { capacity: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...S.input, width: 60 }}/>
                      ) : (
                        <span style={{ fontSize: 11, color: '#666' }}>n/a (1-to-1)</span>
                      )}
                    </td>
                    <td style={S.td}>
                      {r.kind === 'class' ? (
                        <div>
                          {(Array.isArray(r.schedule) ? r.schedule : []).map((s, i) => (
                            <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                              <select value={s?.day || 'mon'} onChange={e => updateRowSchedule(r._rid, i, { day: e.target.value })} style={{ ...S.input, width: 60 }}>
                                {['mon','tue','wed','thu','fri','sat','sun'].map(d => <option key={d} value={d}>{d}</option>)}
                              </select>
                              <input type="time" value={s?.time || '09:00'} onChange={e => updateRowSchedule(r._rid, i, { time: e.target.value })} style={{ ...S.input, width: 90 }}/>
                              <button onClick={() => removeScheduleEntry(r._rid, i)} style={{ ...S.btnDanger, padding: '2px 6px' }}>x</button>
                            </div>
                          ))}
                          <button onClick={() => addScheduleEntry(r._rid)} style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11 }}>+ time</button>
                          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{scheduleSummary(r.schedule)}</div>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: '#666' }}>on request</span>
                      )}
                    </td>
                    <td style={S.td}>
                      {(r.confidence_flags || []).map((f, i) => <span key={i} style={S.flag}>{f}</span>)}
                      {issues.length > 0 && <div style={{ marginTop: 4 }}>{issues.map(x => <span key={x} style={S.blockingChip}>missing {x}</span>)}</div>}
                    </td>
                    <td style={S.td}>
                      <button onClick={() => deleteRow(r._rid)} style={S.btnDanger}>delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={() => addBlankRow('class')} style={S.btnGhost}>+ Add class row</button>
            <button onClick={() => addBlankRow('appointment')} style={S.btnGhost}>+ Add appointment row</button>
          </div>

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #eee', display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={runCreation} disabled={!canSubmit || creating} style={{ ...S.btn, opacity: (!canSubmit || creating) ? 0.4 : 1, cursor: (!canSubmit || creating) ? 'not-allowed' : 'pointer' }}>
              {creating ? 'Saving...' : 'Save sessions'}
            </button>
            {!canSubmit && <span style={{ fontSize: 12, color: '#a00' }}>Resolve every red chip before saving.</span>}
          </div>
        </div>
      )}

      {/* ── Step 3: Result ── */}
      {createResult && (
        <div style={S.card}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>3. Sessions result</h2>
          <div style={S.ok}>
            Business now has {createResult.classSessionsAdded} class session type(s) and {createResult.appointmentOfferingsAdded} appointment offering(s).{' '}
            {createResult.listingActive
              ? (createResult.slotRowsInserted > 0
                  ? `Inserted ${createResult.slotRowsInserted} new slot rows for the next 4 weeks. Edits to already-saved rows do not touch the slots table until the next approval cycle.`
                  : 'No new rows to slot-expand; existing bookable slots left untouched.')
              : 'Listing not active yet, so no slot rows were inserted. Slot expansion will run on first approval.'}
          </div>
          {createResult.errors.length > 0 && (
            <div style={S.err}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Errors:</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {createResult.errors.map((e, i) => <li key={i}>{e.name}: {e.error}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Enrich business ── */}
      {bizRow && (
        <div style={S.card}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>4. Enrich business</h2>
          <p style={{ fontSize: 12, color: '#555', margin: '0 0 12px' }}>Description, address, tags, and photos. Terms acceptance and payout details are deliberately excluded and remain the partner's job in the wizard.</p>

          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Description</label>
            <textarea rows={5} value={description} onChange={e => setDescription(e.target.value)} style={{ ...S.input, resize: 'vertical' }} placeholder="What the studio offers, atmosphere, unique selling points."/>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)} style={S.input} placeholder="Street, town, postcode."/>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Tags (amenities and offerings)</label>
            {ADMIN_AMENITY_GROUPS.map(g => (
              <div key={g.name} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#666', margin: '0 0 4px' }}>{g.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {g.items.map(item => {
                    const on = tags.includes(item);
                    return (
                      <button key={item} onClick={() => toggleTag(item)} style={{ padding: '3px 8px', fontSize: 11, border: '1px solid ' + (on ? '#111' : '#ccc'), background: on ? '#111' : '#fff', color: on ? '#fff' : '#111', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={customTag} onChange={e => setCustomTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }} placeholder="Custom tag" style={{ ...S.input, width: 200 }}/>
              <button onClick={addCustomTag} style={S.btnGhost}>Add</button>
            </div>
            {tags.some(t => !ADMIN_AMENITY_OPTIONS.includes(t)) && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#666', margin: '0 0 4px' }}>Custom tags on this row</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {tags.filter(t => !ADMIN_AMENITY_OPTIONS.includes(t)).map(t => (
                    <span key={t} style={{ padding: '3px 8px', fontSize: 11, background: '#f5f5f5', border: '1px solid #ccc', borderRadius: 3 }}>
                      {t} <button onClick={() => toggleTag(t)} style={{ background: 'none', border: 'none', color: '#a00', cursor: 'pointer', padding: 0, marginLeft: 4 }}>x</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Primary photo</label>
            {primaryImg && <div style={{ marginBottom: 6 }}><img src={primaryImg} alt="Primary" style={{ maxWidth: 220, maxHeight: 160, border: '1px solid #ddd', borderRadius: 4 }}/></div>}
            <input type="file" accept="image/jpeg,image/png" onChange={handlePrimaryPhotoChange} disabled={uploadingPrimary}/>
            {uploadingPrimary && <span style={{ marginLeft: 8, fontSize: 12, color: '#555' }}>uploading...</span>}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Gallery ({gallery.length}/4)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
              {gallery.map((url, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={url} alt={`Gallery ${i+1}`} style={{ width: 120, height: 90, objectFit: 'cover', border: '1px solid #ddd', borderRadius: 4 }}/>
                  <button onClick={() => removeGalleryPhoto(i)} style={{ position: 'absolute', top: 2, right: 2, background: '#fff', color: '#a00', border: '1px solid #a00', borderRadius: 3, fontSize: 10, padding: '1px 4px', cursor: 'pointer' }}>x</button>
                </div>
              ))}
            </div>
            {gallery.length < 4 && (
              <input type="file" accept="image/jpeg,image/png" onChange={handleAddGalleryPhoto} disabled={uploadingGallery}/>
            )}
            {uploadingGallery && <span style={{ marginLeft: 8, fontSize: 12, color: '#555' }}>uploading...</span>}
          </div>

          {photoErr && <div style={S.err}>{photoErr}</div>}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
            <button onClick={saveEnrichment} disabled={enrichmentSaving} style={{ ...S.btn, opacity: enrichmentSaving ? 0.6 : 1 }}>
              {enrichmentSaving ? 'Saving...' : 'Save description, address, tags'}
            </button>
            {enrichmentMsg && <span style={{ fontSize: 12, color: enrichmentMsg.startsWith('Save failed') ? '#a00' : '#155724' }}>{enrichmentMsg}</span>}
          </div>
          <p style={{ fontSize: 11, color: '#888', margin: '8px 0 0' }}>Photos save immediately on upload/remove. The button above persists description, address and tags in one shot.</p>
        </div>
      )}

      {/* ── Step 5: Ownership handoff ── */}
      {bizRow && (() => {
        const currentEmail = String(bizRow.email || '').trim().toLowerCase();
        const isYours = !!authEmail && currentEmail === String(authEmail).toLowerCase();
        const nextEmail = String(partnerEmail || '').trim().toLowerCase();
        const emailDirty = !!nextEmail && nextEmail !== currentEmail;
        // Email change is what triggers the ownership transfer confirm
        // dialog, but the button also needs to be enabled if only the
        // contact_name changed (so admins can add a name without having
        // to first change the email).
        const contactDirty = String(partnerContactName || '').trim() !== String(bizRow.contact_name || '').trim();
        const isDirty = emailDirty || contactDirty;
        return (
          <div style={S.card}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>5. Ownership handoff</h2>
            <p style={{ fontSize: 12, color: '#555', margin: '0 0 12px' }}>Change the partner email BEFORE generating the magic link. Rows created via this tool default to the admin email, so without a handoff the magic link would sign you into your own portfolio instead of the partner.</p>

            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Current owner on file</label>
              <div style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: 4, background: '#f5f5f5', fontSize: 13, fontFamily: 'ui-monospace, monospace' }}>
                {bizRow.email || '(none set)'}
                {isYours && (
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#856404', letterSpacing: 0.5, textTransform: 'uppercase' }}>this is your email</span>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Partner contact name</label>
              <input
                type="text"
                value={partnerContactName}
                onChange={e => setPartnerContactName(e.target.value)}
                placeholder="Maria (used in Welcome to Wello, Maria)"
                style={S.input}
                autoComplete="off"
                spellCheck={false}
              />
              <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>First name is fine. Falls into every "hello X" copy the partner sees.</p>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Partner email</label>
              <input
                type="email"
                value={partnerEmail}
                onChange={e => setPartnerEmail(e.target.value)}
                placeholder="owner@studioname.com"
                style={S.input}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                onClick={saveOwnershipTransfer}
                disabled={!isDirty || transferSaving}
                style={{ ...S.btn, opacity: (!isDirty || transferSaving) ? 0.4 : 1, cursor: (!isDirty || transferSaving) ? 'not-allowed' : 'pointer' }}
              >
                {transferSaving
                  ? (emailDirty ? 'Transferring...' : 'Saving...')
                  : (emailDirty ? 'Transfer ownership' : 'Save contact name')}
              </button>
              {!isDirty && !transferMsg && <span style={{ fontSize: 12, color: '#888' }}>Change the email or contact name to enable saving.</span>}
              {transferMsg && (
                <span style={{ fontSize: 12, color: transferMsg.startsWith('Transfer failed') || transferMsg.startsWith('Partner email') || transferMsg.startsWith('That') ? '#a00' : '#155724' }}>
                  {transferMsg}
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: '#888', margin: '8px 0 0' }}>Confirmation dialog runs before the write lands. On success the current owner loses SELECT/UPDATE access (RLS matches on email) and the previously-linked user_id is cleared so the outgoing owner cannot delete the row either.</p>
          </div>
        );
      })()}

      {/* ── Step 6: Handoff link ── */}
      {bizRow && (() => {
        const destinationEmail = String(bizRow.email || '').trim().toLowerCase();
        const authEmailLc = String(authEmail || '').toLowerCase();
        const linkStillGoesToYou = !!destinationEmail && destinationEmail === authEmailLc;
        return (
          <div style={S.card}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>6. Handoff link</h2>
            <p style={{ fontSize: 12, color: '#555', margin: '0 0 12px' }}>Generates a Supabase magic link that redirects to /?portal=business. Valid for 24 hours per Supabase defaults.</p>

            <div style={{ marginBottom: 12, padding: 10, background: linkStillGoesToYou ? '#fff3cd' : '#f5f5f5', border: '1px solid ' + (linkStillGoesToYou ? '#ffeaa7' : '#ddd'), borderRadius: 4, fontSize: 13 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Link will be for</div>
              <div style={{ fontFamily: 'ui-monospace, monospace' }}>{destinationEmail || '(no email on file)'}</div>
              {linkStillGoesToYou && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#856404' }}>Warning: this is your own email. The link will sign you into your portfolio, not hand off to a partner. Transfer ownership in step 5 first.</div>
              )}
            </div>

            <button
              onClick={generateMagicLink}
              disabled={linkGenerating || !destinationEmail}
              style={{ ...S.btn, opacity: (linkGenerating || !destinationEmail) ? 0.4 : 1, cursor: (linkGenerating || !destinationEmail) ? 'not-allowed' : 'pointer' }}
            >
              {linkGenerating ? 'Generating...' : 'Generate magic link'}
            </button>

            {linkError && <div style={S.err}>{linkError}</div>}

            {linkResult && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>
                  For <strong>{linkResult.business_name}</strong> at <strong>{linkResult.email}</strong>
                </div>
                <textarea readOnly value={linkResult.magic_link} rows={3} style={{ ...S.input, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}/>
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={copyLink} style={S.btnGhost}>Copy link</button>
                  {linkCopied && <span style={{ fontSize: 12, color: '#155724' }}>Copied.</span>}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Step 7: Weekly payouts ──
          Batch operation over all active connected accounts, not scoped to
          the selected business. Dry run returns the plan (per-business
          gross/commission/net + reason for skips) without touching Stripe.
          Real run creates Transfers, stamps bookings, generates statements,
          emails partners. Same function; pg_cron will call it weekly once
          the first admin-triggered runs pass. */}
      <div style={S.card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>7. Weekly payouts</h2>
        <p style={{ fontSize: 12, color: '#555', margin: '0 0 12px' }}>Dry run first to see the planned batch (gross / commission / net per partner, skip reasons for anyone who won't be paid this week). Real run creates Stripe Transfers and emails statements — irreversible from this UI.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={() => invokePayouts(true)} disabled={payoutRunning}
            style={{ ...S.btnGhost, opacity: payoutRunning ? 0.4 : 1, cursor: payoutRunning ? 'not-allowed' : 'pointer' }}>
            {payoutRunning ? 'Running…' : 'Dry run (plan only)'}
          </button>
          <button
            onClick={() => {
              if (!confirm('Create Stripe Transfers for every active partner with delivered bookings? This will move real money.')) return;
              invokePayouts(false);
            }}
            disabled={payoutRunning}
            style={{ ...S.btn, opacity: payoutRunning ? 0.4 : 1, cursor: payoutRunning ? 'not-allowed' : 'pointer' }}>
            {payoutRunning ? 'Running…' : 'Run payouts for real'}
          </button>
        </div>
        {payoutError && <div style={S.err}>{payoutError}</div>}
        {payoutResult && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>
              run_id: <code>{payoutResult.run_id}</code> · cutoff: <strong>{payoutResult.cutoff_date}</strong> · {payoutResult.dry_run ? 'DRY RUN' : `paid €${(payoutResult.total_paid_cents / 100).toFixed(2)} to ${payoutResult.results?.filter(r => r.status === 'paid').length || 0} partner(s)`}
            </div>
            <textarea readOnly value={JSON.stringify(payoutResult, null, 2)} rows={16}
              style={{ ...S.input, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}/>
          </div>
        )}
      </div>

      {/* ── Step 8: Stripe Connect onboarding link ──
          Admin re-issue of a partner's onboarding link. Uses the ADMIN_USER_IDS
          bypass added to create-connect-onboarding — a partner's own JWT still
          works for their own venue; an admin JWT works for any venue. Also
          confirms the deployed Stripe secret's mode (livemode true/false). */}
      {bizRow && (
        <div style={S.card}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>8. Stripe Connect onboarding link</h2>
          <p style={{ fontSize: 12, color: '#555', margin: '0 0 12px' }}>Creates or reuses a connected Express account for <strong>{bizRow.name}</strong> and returns a fresh hosted onboarding URL. Link is single-use and short-lived — send it directly to the partner, don't cache. Response also reports livemode so you can eyeball whether the function is on sandbox or live keys.</p>
          <button onClick={invokeOnboarding} disabled={onboardLoading}
            style={{ ...S.btn, opacity: onboardLoading ? 0.4 : 1, cursor: onboardLoading ? 'not-allowed' : 'pointer' }}>
            {onboardLoading ? 'Generating…' : 'Generate onboarding link'}
          </button>
          {onboardError && <div style={S.err}>{onboardError}</div>}
          {onboardResult && (() => {
            const acct = onboardResult.account || {};
            const req  = acct.requirements || {};
            const stripeStatus =
              acct.charges_enabled && acct.payouts_enabled ? 'active'
              : req.disabled_reason ? 'restricted'
              : 'pending';
            const dbStatus = onboardResult.db_status || '(null)';
            const drift = stripeStatus !== (onboardResult.db_status || null) && !(stripeStatus === 'pending' && !onboardResult.db_status);
            return (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>
                  Stripe mode: <strong style={{ color: onboardResult.livemode ? '#a00' : '#155724' }}>{onboardResult.livemode ? 'LIVE ⚠︎' : 'TEST (sandbox)'}</strong> · account: <code>{onboardResult.account_id}</code>
                </div>
                <div style={{ fontSize: 12, color: '#333', marginBottom: 6, padding: 8, background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 4 }}>
                  Stripe says: <strong>{stripeStatus}</strong> (charges_enabled: {String(!!acct.charges_enabled)}, payouts_enabled: {String(!!acct.payouts_enabled)})
                  {' · '}
                  DB mirror: <strong>{dbStatus}</strong>
                  {drift && <span style={{ marginLeft: 8, color: '#856404' }}>⚠ mirror is drifting — check that account.updated is on the webhook endpoint</span>}
                </div>
                {req.disabled_reason && (
                  <div style={{ fontSize: 12, color: '#721c24', marginBottom: 6, padding: 8, background: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: 4 }}>
                    disabled_reason: <code>{req.disabled_reason}</code>
                  </div>
                )}
                {(req.currently_due?.length > 0 || req.past_due?.length > 0) && (
                  <div style={{ fontSize: 12, color: '#333', marginBottom: 6 }}>
                    {req.past_due?.length > 0 && (
                      <div style={{ marginBottom: 4 }}>past_due: <code>{req.past_due.join(', ')}</code></div>
                    )}
                    {req.currently_due?.length > 0 && (
                      <div>currently_due: <code>{req.currently_due.join(', ')}</code></div>
                    )}
                  </div>
                )}
                <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginTop: 8, marginBottom: 4 }}>Fresh onboarding URL (send to partner)</label>
                <textarea readOnly value={onboardResult.url} rows={3}
                  style={{ ...S.input, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}/>
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 11, color: '#555', cursor: 'pointer' }}>Full response</summary>
                  <textarea readOnly value={JSON.stringify(onboardResult, null, 2)} rows={14}
                    style={{ ...S.input, fontFamily: 'ui-monospace, monospace', fontSize: 11, marginTop: 6 }}/>
                </details>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Step 9: Seed a payout-test booking ──
          Test-data helper for the run-weekly-payouts flow. Ensures the
          selected business has commission_rate + terms_accepted_commission
          + founding_incentive_bookings set (defaults 15% + 15% + 20),
          then inserts one backdated confirmed booking with the admin as
          the "member". Returns the expected shape of the next dry-run's
          entry for this business. Only use on throwaway rows. */}
      {bizRow && (
        <div style={S.card}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>9. Seed payout-test booking</h2>
          <p style={{ fontSize: 12, color: '#555', margin: '0 0 12px' }}>Only for throwaway test rows. Inserts one confirmed booking backdated by N days at 18:00 for 60 minutes, sets missing commission fields (15% / 20 incentive), and reports what the next payout dry-run should say for this business.</p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ ...S.label, fontSize: 11 }}>Credits</label>
              <input type="number" min="1" value={seedCredits}
                onChange={e => setSeedCredits(e.target.value)}
                style={{ ...S.input, width: 90 }}/>
            </div>
            <div>
              <label style={{ ...S.label, fontSize: 11 }}>Days ago</label>
              <input type="number" min="1" value={seedDaysAgo}
                onChange={e => setSeedDaysAgo(e.target.value)}
                style={{ ...S.input, width: 90 }}/>
            </div>
            <button onClick={invokeSeed} disabled={seedLoading}
              style={{ ...S.btn, opacity: seedLoading ? 0.4 : 1, cursor: seedLoading ? 'not-allowed' : 'pointer' }}>
              {seedLoading ? 'Seeding…' : 'Seed test booking'}
            </button>
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: '#555', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={seedForceBypass}
              onChange={e => setSeedForceBypass(e.target.checked)}/>
            Force through safety window — temporarily flip cancellation_safety_window off around the insert, then restore. Use only on throwaway test rows.
          </label>
          {seedError && <div style={S.err}>{seedError}</div>}
          {seedResult && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: '#155724', marginBottom: 6, padding: 8, background: '#e7f5e7', border: '1px solid #a3d3a3', borderRadius: 4 }}>
                Inserted booking #{seedResult.booking?.id} · {seedResult.booking?.booking_date} {seedResult.booking?.start_time} · {seedResult.booking?.credits_used} credits · status <strong>{seedResult.booking?.status}</strong>
              </div>
              <textarea readOnly value={JSON.stringify(seedResult, null, 2)} rows={16}
                style={{ ...S.input, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}/>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Partner-invite redirect. Called when a partner clicks the wello-domain
// invite URL. Exchanges the ?invite=CODE for a fresh Supabase magic link,
// then redirects the browser to it. Shows a brief branded loading state so
// the partner does not see a blank page mid-redirect.
// ═══════════════════════════════════════════════════════════════
function PartnerInviteRedirect() {
  const [status, setStatus] = useState("redirecting"); // redirecting | error
  const [errorMsg, setErrorMsg] = useState("");
  const [businessName, setBusinessName] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("invite") || "";
    if (!code) { setStatus("error"); setErrorMsg("This invite link is missing its code."); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('redeem-partner-invite', {
          body: { code },
        });
        if (cancelled) return;
        if (error) { setStatus("error"); setErrorMsg(error.message || "We couldn't verify this invite. Ask your Wello contact for a fresh link."); return; }
        if (data?.error) { setStatus("error"); setErrorMsg(data.error); return; }
        const magicLink = data?.magic_link;
        if (!magicLink) { setStatus("error"); setErrorMsg("We couldn't finish signing you in. Ask your Wello contact for a fresh link."); return; }
        if (data?.business_name) setBusinessName(data.business_name);
        // Small delay so the loading UI is visible for at least a beat —
        // otherwise a fast redirect looks like a page flash.
        setTimeout(() => { window.location.href = magicLink; }, 250);
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg((e && e.message) || "We couldn't verify this invite.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{minHeight:"100vh",background:"#FBF9F4",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 20px"}}>
      <div style={{maxWidth:480,width:"100%",background:"#fff",border:"1px solid rgba(195,200,188,0.5)",borderRadius:14,padding:"36px 28px",boxShadow:"0 6px 24px rgba(33,60,24,0.08)",textAlign:"center"}}>
        <div style={{width:56,height:56,borderRadius:"50%",background:"#CAECBA",display:"inline-flex",alignItems:"center",justifyContent:"center",margin:"0 auto 18px",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:22,fontWeight:800,color:"#213C18"}}>◈</div>
        {status === "redirecting" ? (
          <>
            <h1 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:20,fontWeight:700,color:"#213C18",margin:"0 0 8px",letterSpacing:"-0.4px"}}>
              {businessName ? `Signing you in as ${businessName}` : "Signing you in"}
            </h1>
            <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#54584F",lineHeight:1.6,margin:"0 0 8px"}}>Just a moment while we verify your invite.</p>
            <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,color:"#A3B18A",margin:0}}>You will land on your Wello partner dashboard.</p>
          </>
        ) : (
          <>
            <h1 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:20,fontWeight:700,color:"#213C18",margin:"0 0 8px",letterSpacing:"-0.4px"}}>Invite link problem</h1>
            <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#54584F",lineHeight:1.6,margin:"0 0 14px"}}>{errorMsg}</p>
            <a href="https://www.wello-wellness.com" style={{display:"inline-block",padding:"11px 22px",background:"#213C18",color:"#fff",textDecoration:"none",borderRadius:999,fontFamily:"'Manrope',system-ui,sans-serif",fontSize:12,fontWeight:700}}>Back to Wello</a>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [view,setView]         = useState(()=>{
    const params = new URLSearchParams(window.location.search);
    if(params.get("portal")==="business") return "biz-portal";
    // ?claim=WELLO-XXXX-XXXX arrives from the recipient email link. We open
    // the Redeem page directly with the code prefilled.
    if(params.get("claim")) return "redeem";
    // ?gift=sent&code=WELLO-... — Stripe returned the sender to the app after
    // a successful gift checkout. Open the gift page which will render the
    // success state from URL params + sessionStorage.
    if(params.get("gift")) return "gift";
    // ?admin=setup opens the internal AI-assisted partner setup tool. Gated
    // by VITE_ADMIN_SETUP_ENABLED so it can't render in prod builds where
    // the flag is off. Not linked anywhere in the public UI.
    if(params.get("admin")==="setup" && import.meta.env.VITE_ADMIN_SETUP_ENABLED === "true") return "adminSetup";
    // ?invite=<code> — partner-onboarding invite link generated by the
    // admin tool. The code is exchanged for a fresh Supabase magic link
    // via redeem-partner-invite, then the browser is redirected. Loading
    // UI lives in PartnerInviteRedirect.
    if(params.get("invite")) return "partnerInvite";
    return "home";
  });
  // ?claim=WELLO-XXXX-XXXX from the recipient email — read once so RedeemPage
  // can prefill the input. Left in URL until the user submits so a mid-flow
  // sign-in doesn't lose the code.
  const [prefilledClaimCode, setPrefilledClaimCode] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("claim") || ""; }
    catch { return ""; }
  });
  // Rehydrate the gift-just-sent state from the URL + sessionStorage so the
  // success page renders correctly after the Stripe redirect. sessionStorage
  // survives the redirect, URL params tell us to look there.
  const [lastGift, setLastGift] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("gift") !== "sent") return null;
      const code = params.get("code") || "";
      const stashed = JSON.parse(sessionStorage.getItem("wello_pending_gift") || "null");
      const claim_url = code ? `${window.location.origin}/?claim=${encodeURIComponent(code)}` : "";
      return {
        code,
        credits: stashed?.credits || 0,
        recipient_email: stashed?.recipient_email || null,
        claim_url,
      };
    } catch { return null; }
  });
  // Once the success page is mounted, strip the ?gift=sent params + stashed
  // pending record so a refresh doesn't bounce them back onto the page.
  useEffect(() => {
    if (!lastGift) return;
    try { sessionStorage.removeItem("wello_pending_gift"); } catch { /* noop */ }
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("gift")) {
        url.searchParams.delete("gift");
        url.searchParams.delete("code");
        window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
      }
    } catch { /* noop */ }
  }, [lastGift]);
  const headerRef = useRef(null);
  const [headerH, setHeaderH] = useState(91);
  useEffect(()=>{
    const el = headerRef.current;
    if(!el) return;
    const obs = new ResizeObserver(([entry])=>setHeaderH(entry.contentRect.height));
    obs.observe(el);
    return ()=>obs.disconnect();
  },[]);
  const [cookieConsent,setCookieConsent] = useState(()=>localStorage.getItem("wello_cookie_consent")||null);
  const [showContact,setShowContact] = useState(false);
  const [showPrivacy,setShowPrivacy] = useState(false);
  const [contactForm,setContactForm] = useState({name:"",email:"",message:""});
  const [contactSent,setContactSent] = useState(false);
  const [recovering,setRecovering] = useState(false);
  // Tracks whether we've already routed the user to the partner portal via
  // the ?portal=business URL signal. Supabase fires SIGNED_IN repeatedly
  // (mount, token refresh, tab focus); without this ref every tab-back
  // would snap the partner back to /business no matter where they'd
  // navigated to in the meantime.
  const portalRouted = useRef(false);
  const [newPw,setNewPw]       = useState("");
  const [newPwErr,setNewPwErr] = useState("");
  const [newPwDone,setNewPwDone] = useState(false);

  // Customer auth, profile + bookings state — declared up here so the effects
  // below and the credits derivation can reference them without hitting the
  // const TDZ on each render. (Was the cause of the "Cannot access 'profile'
  // before initialization" crash on the previous deploy.)
  const [authSession,setAuthSession] = useState(null);
  const [profile,setProfile] = useState(null);
  const [authModal,setAuthModal] = useState(null);
  const [bookingsVersion,setBookingsVersion] = useState(0);
  const [mobileMenuOpen,setMobileMenuOpen] = useState(false);
  const [localCredits,setLocalCredits] = useState(0);
  const [bookings,setBookings] = useState([]);
  const [toast,setToast] = useState(null);

  function showToast(msg, type="info", duration=2600) { setToast({msg,type}); setTimeout(()=>setToast(null),duration); }

  // Signs the customer out of Supabase and clears local profile/bookings/session state.
  async function doSignOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setAuthSession(null);
    setBookings([]);
    showToast("Signed out.","info");
  }

  // Load (or create) the customer profile row whenever the auth session changes.
  // Uses upsert so it works atomically whether the row exists or not — no race
  // between two simultaneous mounts and no "duplicate key" errors. credits and
  // created_at are intentionally NOT in the payload so an existing row's
  // balance isn't wiped on every sign-in.
  useEffect(()=>{
    const uid = authSession?.user?.id;
    if (!uid) { setProfile(null); return; }
    let cancelled = false;
    (async () => {
      const u = authSession.user;
      // Check whether we've already recorded a consumer terms acceptance
      // for this profile. If not (first sign-in, or the row predates the
      // consumer_terms_version column), stamp the current version + now on
      // this write. Otherwise leave the existing values alone so the audit
      // trail keeps the original acceptance timestamp — the upsert path
      // runs on every authSession change, and blindly rewriting these
      // would clobber that.
      const { data: existingProfile } = await supabase
        .from('profiles').select('consumer_terms_version').eq('id', uid).maybeSingle();
      const payload = {
        id: uid,
        email: u.email ?? null,
        full_name: u.user_metadata?.full_name || (u.email?.split('@')[0] ?? 'Member'),
      };
      if (!existingProfile?.consumer_terms_version) {
        payload.consumer_terms_version     = CONSUMER_TERMS_VERSION;
        payload.consumer_terms_accepted_at = new Date().toISOString();
      }
      const { data: row, error: upsertErr } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('*')
        .single();
      if (cancelled) return;
      if (upsertErr) {
        // Common causes: missing INSERT/UPDATE RLS policy, missing profiles
        // table, schema mismatch. Log loudly so we can see in DevTools.
        console.error('profiles upsert failed:', { code: upsertErr.code, message: upsertErr.message, details: upsertErr.details, hint: upsertErr.hint });
        // Best-effort fallback: maybe the row exists and only the write failed
        // (e.g. UPDATE blocked by RLS) — try reading what's there.
        const { data: fallback, error: readErr } = await supabase
          .from('profiles').select('*').eq('id', uid).maybeSingle();
        if (readErr) console.error('profiles read fallback failed:', readErr.message);
        if (fallback) setProfile(fallback);
        return;
      }
      setProfile(row);
    })();
    return () => { cancelled = true; };
  }, [authSession?.user?.id]);

  // Detect Supabase password recovery or invite redirect; track auth session
  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setAuthSession(session);
    });

    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const portalParam = params.get("portal") === "business";
    const customerConfirmed = params.get("confirmed") === "true";
    const creditsAdded      = params.get("credits") === "added";
    const customerReset     = params.get("customer_reset") === "true";

    // Partner-specific signals: explicit ?portal=business, or Supabase invite
    // / recovery URL hashes (used only by the partner setting-up + reset flow).
    // type=signup and type=magiclink are NOT partner-specific — customers also
    // use them, so we route only on the truly partner-specific markers.
    // ?customer_reset=true wins over portal-routing: the customer-side Forgot
    // Password flow tags its redirectTo with that flag so we open the new
    // password modal instead of bouncing them into the partner portal.
    if (customerReset && hash.includes("type=recovery")) {
      // Open the AuthModal in set_password mode. The hash carries a valid
      // session, so supabase.auth.updateUser({password}) will succeed.
      setAuthModal({ mode: "set_password" });
    } else if (hash.includes("type=recovery") || hash.includes("type=invite")) {
      setRecovering(true);
      setView("biz-portal");
      portalRouted.current = true;
    } else if (portalParam) {
      setView("biz-portal");
      portalRouted.current = true;
      // Strip the param now that we've consumed it — otherwise the URL stays
      // ?portal=business after the partner navigates to a different view,
      // and any later refresh / token-refresh SIGNED_IN snaps them back.
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("portal");
        window.history.replaceState({}, "", url.toString());
      } catch { /* non-critical: ignore */ }
    }

    // Customer email-confirmation landing: clear the flag from the URL and toast.
    if (customerConfirmed) {
      try { window.history.replaceState({}, "", window.location.pathname); } catch { /* non-critical: ignore */ }
      // Defer toast slightly so it shows after the layout settles. 5s duration
      // because the welcome message is longer than a standard confirmation toast.
      setTimeout(() => showToast(
        "Welcome to Wello. Thanks for giving us a go and supporting our local partners in Mallorca.",
        "welcome",
        5000,
      ), 200);
    }

    // Stripe success landing: clear the flag, toast, and re-fetch profile to
    // pick up the webhook-incremented credits balance.
    if (creditsAdded) {
      try { window.history.replaceState({}, "", window.location.pathname); } catch { /* non-critical: ignore */ }
      setTimeout(() => showToast("Credits added to your account.", "success", 4000), 200);
      // Re-fetch profile after a short delay (gives the Stripe webhook time
      // to land — typically <2s). Retries once if the balance hasn't changed
      // yet, which can happen if the webhook is still processing.
      setTimeout(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (!uid) return;
        const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
        if (data) setProfile(data);
      }, 1500);
    }

    const {data:{subscription}} = supabase.auth.onAuthStateChange((event, session)=>{
      if(event==="SIGNED_IN") setAuthSession(session);
      if(event==="SIGNED_OUT") setAuthSession(null);
      const h = window.location.hash;
      const p = new URLSearchParams(window.location.search).get("portal") === "business";
      // Recovery / invite hashes always force the partner-portal view because
      // those flows are partner-specific. The plain ?portal=business URL
      // param, however, is only honored the FIRST time we see it — Supabase
      // fires SIGNED_IN again on tab focus / token refresh, and we don't
      // want every refocus to snap the customer back to the portal if
      // they've navigated away to a different view since.
      const customerResetFlag = new URLSearchParams(window.location.search).get("customer_reset") === "true";
      if(event==="PASSWORD_RECOVERY") {
        if (customerResetFlag) {
          setAuthModal({ mode: "set_password" });
        } else if(h.includes("type=invite") || h.includes("type=recovery")) {
          setRecovering(true);
          setView("biz-portal");
        }
      } else if (event === "SIGNED_IN") {
        if (customerResetFlag && h.includes("type=recovery")) {
          setAuthModal({ mode: "set_password" });
        } else if (h.includes("type=invite") || h.includes("type=recovery")) {
          setRecovering(true);
          setView("biz-portal");
        } else if (p && !portalRouted.current) {
          portalRouted.current = true;
          setView("biz-portal");
        }
      }
    });
    return ()=>subscription.unsubscribe();
  },[]);

  async function doSetNewPassword() {
    if(newPw.length < 8) { setNewPwErr("Password must be at least 8 characters."); return; }
    // Stamp password_set so partner onboarding's "set a password" prompt
    // knows this account already has one after a partner-side recovery.
    const {error} = await supabase.auth.updateUser({password: newPw, data: { password_set: true }});
    if(error) { setNewPwErr("Something went wrong. Please try again."); return; }
    setNewPwDone(true);
    window.location.hash = "";
    setTimeout(()=>{ setRecovering(false); setNewPw(""); setNewPwDone(false); }, 2000);
  }
  const [listings,setListings] = useState([]);
  const [listingsLoading,setListingsLoading] = useState(true);
  const [syncingIds,setSyncing]= useState({});
  const [selBiz,setSelBiz]     = useState(null);
  const [bkData,setBkData]     = useState(null);
  // Credit derivation lives here because it reads `profile` and `localCredits`,
  // both declared at the top of the component.
  const credits = profile ? profile.credits : localCredits;
  function setCredits(updater) {
    if (profile) {
      const next = typeof updater === 'function' ? updater(profile.credits) : updater;
      setProfile(p => p ? { ...p, credits: next } : p);
      supabase.from('profiles').update({ credits: next }).eq('id', profile.id)
        .then(({ error }) => { if (error) console.warn('credits persist failed:', error.message); });
    } else {
      setLocalCredits(updater);
    }
  }
  const [saved,setSaved]       = useState([]);
  const [isBiz,setIsBiz]       = useState(false);
  const [bizPreview,setBizPreview] = useState(false);

  // Fetch listings + slots from Supabase. No localStorage cache — the
  // "instant paint from cache, then refresh" pattern caused too many stale
  // -data bugs (deleted listings kept showing up for anyone who'd loaded
  // the page before the delete). We always fetch fresh instead; Supabase
  // is fast enough that the skeleton state is barely perceptible.
  //
  // Also runs a best-effort cleanup on any legacy caches sitting in
  // localStorage so returning users get a clean slate.
  const fetchListings = useCallback(async () => {
    try {
      localStorage.removeItem("wello_listings");
      localStorage.removeItem("wello_listings_v2");
    } catch { /* non-critical */ }
    // Pull parent business fields (address, contact, email) via the
    // business_id FK so the customer venue-details page can show the full
    // address without needing us to mirror every column into listings.
    // Also lets us tell demo seed rows apart from real partner signups
    // (real partners never have a demo- prefixed email).
    const { data: listingRows, error } = await supabase
      .from("listings")
      .select("*, slots(*), businesses(address, phone, website, instagram, email, gallery, session_offerings, travel_areas, travel_fee_eur, cancellation_safety_window)")
      .eq("status","active")
      .order("id");
    if (error) {
      console.error("Error fetching listings:", error);
      setListings(LISTINGS);
    } else if (listingRows && listingRows.length > 0) {
      const transformed = listingRows.map(row => ({
        id: row.id,
        business_id: row.business_id || null,
        name: row.name,
        cat: row.category || row.cat || "Other",
        cat2: row.cat2 || null,
        loc: row.location || row.loc || "",
        // Full postal address + contact fields for the venue details page.
        // Sourced live from the businesses row so partner edits in Settings
        // propagate immediately without needing to mirror every column.
        address:   row.businesses?.address   || row.address   || "",
        phone:     row.businesses?.phone     || row.phone     || "",
        website:   row.businesses?.website   || row.website   || "",
        instagram: row.businesses?.instagram || row.instagram || "",
        // Gallery photos pulled from the parent business row (partners upload
        // up to 4 during onboarding). Kept as an array so BizPanel can render
        // them as a swipeable carousel alongside the primary img.
        gallery:   Array.isArray(row.businesses?.gallery) ? row.businesses.gallery.filter(Boolean) : (Array.isArray(row.gallery) ? row.gallery.filter(Boolean) : []),
        // Private-instructor session offerings — used by BookingModal to
        // look up group-pricing (extra_person_eur, max_people) from the slot.
        session_offerings: Array.isArray(row.businesses?.session_offerings) ? row.businesses.session_offerings : [],
        // Extended travel: areas the instructor will travel to for an extra
        // fee. BookingModal applies the surcharge when the customer's typed
        // address matches one of these areas.
        travel_areas:   Array.isArray(row.businesses?.travel_areas) ? row.businesses.travel_areas : (Array.isArray(row.travel_areas) ? row.travel_areas : []),
        travel_fee_eur: row.businesses?.travel_fee_eur != null ? Number(row.businesses.travel_fee_eur) : (row.travel_fee_eur != null ? Number(row.travel_fee_eur) : 0),
        _isDemo:   /^demo-/i.test(row.businesses?.email || ""),
        desc: row.description || "",
        img: row.img || "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80",
        rating: parseFloat(row.rating) || 4.5,
        reviews: row.reviews || 0,
        cr: row.cr || row.credits_per_session || 3,
        tags: row.tags || [],
        coverage_areas: Array.isArray(row.coverage_areas) ? row.coverage_areas : [],
        // Denormalised category union (venue category + per-session
        // overrides). Powers the Explore category filter so a multi-
        // modality studio surfaces on every category it actually runs.
        session_categories: Array.isArray(row.session_categories) ? row.session_categories : [],
        // Studio-side safety window: when true, we hide slots starting less
        // than 2 hours from now so the studio always has time to review a
        // new booking before it starts. The Postgres BEFORE INSERT trigger
        // on bookings is the authoritative check; this is the UX layer.
        cancellation_safety_window: !!row.businesses?.cancellation_safety_window,
        slots: (row.slots || [])
          .filter(s => {
            if (!row.businesses?.cancellation_safety_window) return true;
            const start = new Date(`${s.date}T${(s.time || '00:00').slice(0,5)}:00`);
            return start.getTime() - Date.now() >= 2 * 60 * 60 * 1000;
          })
          .map(s => ({
            id: s.id.toString(),
            name: s.name,
            date: s.date,
            time: s.time,
            dur: s.dur,
            spots: s.spots,
            booked: s.booked,
            credits: s.credits,
            acuity_type_id: s.acuity_type_id ?? null,
          }))
      }));
      // Ordering: real partners first, demo seeds last. Real partners are
      // anyone whose parent business email doesn't start with "demo-" (the
      // convention used by the seed script). Tiebreak by id DESC — the
      // newest real signup rises to the top so recently-onboarded partners
      // get prominence. If the businesses join was blocked by RLS we still
      // end up with newest-first ordering across the board, which is a
      // sensible fallback until the anon read policy is in place.
      const sorted = transformed.slice().sort((a, b) => {
        if (a._isDemo !== b._isDemo) return a._isDemo ? 1 : -1;
        return (b.id || 0) - (a.id || 0);
      });
      setListings(sorted);
    } else {
      setListings(LISTINGS);
    }
    setListingsLoading(false);
  }, []);
  // Initial mount fetch.
  useEffect(() => { fetchListings(); }, [fetchListings]);
  // Refetch (skipping the stale cache paint) when the customer opens Explore
  // or Home — this is the moment partner-side availability changes need to
  // land in the UI without a manual reload.
  useEffect(() => {
    if (view === "explore" || view === "home") fetchListings();
  }, [view, fetchListings]);

  const onSyncUpdate=useCallback((bizId,slotId,delta)=>{
    setSyncing(p=>({...p,[bizId]:true}));
    setTimeout(()=>setSyncing(p=>{const n={...p};delete n[bizId];return n;}),900);
    setListings(p=>p.map(b=>b.id!==bizId?b:{...b,slots:b.slots.map(s=>s.id!==slotId?s:{...s,booked:Math.max(0,Math.min(s.spots,s.booked+delta))})}));
  },[]);

  function onSelect(biz){ setSelBiz(biz); }
  function onBook(biz,slot){
    // Auth gate: anonymous customers cannot book. Open the AuthModal so they
    // can sign in or sign up in-flow.
    if (!authSession) {
      setSelBiz(null);
      setAuthModal({ mode: "signin" });
      return;
    }
    setBkData({biz,slot}); setSelBiz(null);
  }
  // Anyone can browse Credits — auth is gated at checkout, not at page view.
  // Lets guests see prices and pick a pack before deciding to sign up.
  function gotoCredits(){ setView("credits"); }
  // Stashed intent for the "clicked Buy while signed-out" flow — after auth
  // completes we auto-invoke checkout with the quantity they picked.
  const [pendingCheckoutQty, setPendingCheckoutQty] = useState(null);
  function requireAuthForCheckout(qty) {
    setPendingCheckoutQty(qty);
    setAuthModal({ mode: "signup" });
  }
  // Runs checkout once. Uses the origin so Stripe redirects back to this app.
  const doCheckout = useCallback(async (qty) => {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { quantity: qty, origin: window.location.origin },
    });
    if (error || !data?.url) {
      console.error('create-checkout-session failed:', error?.message || data?.error);
      showToast("Sorry, we couldn't open checkout. Please try again.", "error", 4000);
      return;
    }
    window.location.href = data.url;
  }, []);
  // If a guest clicked Buy, we stashed their quantity and opened the sign-up
  // modal. As soon as the session lands, resume the checkout automatically
  // so they never have to click Buy twice.
  useEffect(() => {
    if (authSession && pendingCheckoutQty != null) {
      const q = pendingCheckoutQty;
      setPendingCheckoutQty(null);
      doCheckout(q);
    }
  }, [authSession, pendingCheckoutQty, doCheckout]);

  // Customer-initiated booking cancellation. Enforces the 24h/48h window on
  // the server side; here we just fire the call and update local state on
  // success. Bumps bookingsVersion so ProfilePage refetches the reservation
  // list, and credits balance so the refund shows immediately.
  async function cancelBooking(bookingId) {
    if (!authSession?.user?.id) {
      showToast("Please sign in to cancel a booking.", "info");
      return { ok: false, error: "not signed in" };
    }
    const { data, error } = await supabase.functions.invoke('cancel-booking', { body: { booking_id: bookingId } });
    if (error || !data?.success) {
      const msg = data?.error || error?.message || "Couldn't cancel this booking.";
      showToast(msg, "error", 4200);
      return { ok: false, error: msg };
    }
    if (data.credits_refunded > 0) {
      setCredits(c => c + data.credits_refunded);
    }
    setBookingsVersion(v => v + 1);
    showToast(`Booking cancelled. ${data.credits_refunded || 0} credits refunded.`, "success", 3200);
    return { ok: true, refund: data.credits_refunded };
  }

  // Shared interests-save handler — used by both the Explore modal and the
  // Profile Settings tab's Edit preferences button. Persists to
  // profiles.interests, detects the RLS silent-zero-rows case, and surfaces
  // clear feedback toasts.
  async function saveInterests(interests) {
    if (!authSession?.user?.id) {
      showToast("Please sign in to save your preferences.", "info");
      throw new Error("not signed in");
    }
    const { data, error } = await supabase
      .from('profiles')
      .update({ interests })
      .eq('id', authSession.user.id)
      .select('id, interests');
    if (error) {
      console.error('save interests failed:', error.message);
      showToast("Couldn't save preferences. " + error.message, "error");
      throw error;
    }
    if (!data || data.length === 0) {
      console.warn('save interests: 0 rows updated — RLS probably blocking. Add an UPDATE policy on profiles.');
      showToast("Saved locally, but your account didn't accept the update — check your profile RLS policy.", "error");
      setProfile(p => p ? { ...p, interests } : { id: authSession.user.id, interests });
      return;
    }
    setProfile(p => p ? { ...p, interests } : { ...data[0] });
    showToast("Preferences saved. Refreshing For You…", "success");
  }
  async function onConfirm({biz,slot,form,cost}){
    console.log('[onConfirm] start', {
      listing_id: biz.id,
      business_id: biz.business_id,
      biz_name: biz.name,
      slot_id: slot.id,
      slot_date: slot.date,
      slot_time: slot.time,
      cost,
      guests: form?.guests,
    });

    // Defensive auth re-check in case the session expired between opening the
    // modal and confirming. Bail before touching any local state so the user
    // doesn't see fake "Booked!" feedback they can't actually have.
    const { data: sess, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) console.error('[onConfirm] getSession error:', sessErr);
    const uid = sess?.session?.user?.id;
    console.log('[onConfirm] auth check', { uid, hasSession: !!sess?.session, email: sess?.session?.user?.email });
    if (!uid) {
      console.warn('[onConfirm] no auth uid — bailing with sign-in prompt');
      showToast("Please sign in to book.","info");
      return;
    }
    if (!biz.business_id) {
      console.error('[onConfirm] listing has NO business_id — booking cannot be saved. Listing may predate the listings.business_id migration or the backfill missed it.', {
        listing_id: biz.id,
        listing_name: biz.name,
        fix_hint: "Run: update listings set business_id = b.id from businesses b where listings.name = b.name and listings.id = '" + biz.id + "';",
      });
      showToast("This venue isn't fully set up yet. We've logged it — please try another.","error");
      return;
    }

    // Private-instructor bookings are requests, not immediate confirmations.
    // We hold the slot visually but DO NOT deduct credits until the instructor
    // confirms (or auto-confirm hits at the 48h deadline).
    const isPrivateBooking = biz.cat === "Private Instructor";

    // Persist the phone the customer typed into the booking modal onto their
    // profile so a returning customer won't have to retype it next time, and
    // so the partner-side queries (which already join profiles for name)
    // pick up the number for free.
    if (form?.phone) {
      try {
        const { error: phoneErr } = await supabase
          .from('profiles').update({ phone: form.phone }).eq('id', uid);
        if (phoneErr) console.warn('[onConfirm] profiles.phone update failed:', phoneErr.message);
        else setProfile(p => p ? { ...p, phone: form.phone } : { id: uid, phone: form.phone });
      } catch (e) {
        console.warn('[onConfirm] profiles.phone update exception:', e?.message);
      }
    }

    // 1. Instant UI:
    // - regular bookings: deduct credits immediately, mark slot booked
    // - private requests: HOLD credits (deduct now, refund on decline).
    //   Matches the pending_venue flow so a customer cannot double-spend
    //   credits during the 48h instructor confirmation window. Slot
    //   capacity is not incremented yet — the request has not yet been
    //   accepted.
    if (!isPrivateBooking) {
      setCredits(c=>c-cost);
      setListings(p=>p.map(b=>b.id!==biz.id?b:{...b,slots:b.slots.map(s=>s.id!==slot.id?s:{...s,booked:s.booked+form.guests})}));
    } else {
      setCredits(c=>c-cost);
    }
    setBookings(p=>[{id:Date.now(),biz,slot,form,cost,status:isPrivateBooking?'pending_instructor':'confirmed'},...p]);
    showToast(
      isPrivateBooking ? "Request sent. Instructor has 48 hours to confirm." : `Booked! ◈ ${cost} credits used.`,
      "success"
    );

    // 2. Persist to Supabase + fire Acuity sync (Acuity only for non-private).
    try {
      // Peak window: 07:00–09:00 (inclusive of 07:00, exclusive of 09:00).
      const t = (slot.time || '').slice(0,5);
      const peak_flag = t >= '07:00' && t < '09:00';

      // For private bookings the customer's location is required and saved to
      // bookings.notes so the instructor sees it on their dashboard + in the
      // SMS. Group size + extended-travel fee land here too when applicable;
      // single-person / core-area bookings skip those lines so it stays clean.
      // Arrival notes get appended underneath when present (gate code, parking).
      const peopleCount = Number(form?.guests) || 1;
      const travelFeeApplied = Number(form?.travelFee) || 0;
      const notes = isPrivateBooking
        ? [
            form?.location ? `Customer location: ${form.location}` : null,
            peopleCount > 1 ? `People: ${peopleCount}` : null,
            travelFeeApplied > 0 ? `Travel fee: €${travelFeeApplied}` : null,
            form?.locationNote ? `Notes: ${form.locationNote}` : null,
          ].filter(Boolean).join('\n') || null
        : (form?.note || null);

      const payload = {
        user_id: uid,
        business_id: biz.business_id,
        venue_id: biz.business_id, // placeholder until a venues table exists
        slot_id: String(slot.id),
        booking_date: slot.date,
        start_time: t,
        duration: slot.dur,
        credits_used: cost,
        peak_flag,
        status: isPrivateBooking ? 'pending_instructor' : 'confirmed',
        notes,
      };
      console.log('[onConfirm] inserting bookings row', payload);

      const { data: inserted, error: insErr } = await supabase
        .from('bookings')
        .insert(payload)
        .select('id')
        .single();

      if (insErr) {
        console.error('[onConfirm] bookings INSERT FAILED', {
          code: insErr.code,
          message: insErr.message,
          details: insErr.details,
          hint: insErr.hint,
          payload,
        });
        // Common error codes:
        //   42501 — RLS denied (insert policy missing or wrong)
        //   23503 — foreign-key violation (business_id not in businesses, or user_id not in auth.users)
        //   23514 — check-constraint violation (bookings_status_check)
        //   23502 — not-null violation (required column was null)
        const hint = insErr.code === '42501'
          ? "RLS rejected the insert. Add: create policy \"Users can insert own bookings\" on bookings for insert to authenticated with check (user_id = auth.uid());"
          : insErr.code === '23503'
          ? "Foreign-key violation — business_id or user_id doesn't exist. Check listings.business_id is populated for this listing."
          : null;
        if (hint) console.error('[onConfirm] hint:', hint);
        showToast("Couldn't save your booking. Check the console for details.","error");
        return;
      }

      console.log('[onConfirm] bookings INSERT OK', { booking_id: inserted.id });

      // Tick the bookings refresh counter so ProfilePage refetches and the
      // new row shows up immediately (it was rendered from a fetched list).
      setBookingsVersion(v => v + 1);

      // Bump slots.booked so the slot disappears from the marketplace for
      // everyone else. For private instructors with spots=1 this means once
      // one customer requests a time, no one else can request the same one.
      // If the instructor later declines, instructor-booking-response
      // decrements this back so the slot reopens.
      try {
        const newBooked = (slot.booked || 0) + (form.guests || 1);
        const { error: slotUpdErr } = await supabase
          .from('slots').update({ booked: newBooked }).eq('id', slot.id);
        if (slotUpdErr) console.warn('[onConfirm] slots.booked bump failed:', slotUpdErr.message);
      } catch (e) {
        console.warn('[onConfirm] slots.booked bump exception:', e?.message);
      }

      // 3. Fire-and-forget downstream signals:
      // - Private instructor bookings → SMS the instructor via Twilio.
      // - Everything else → Acuity sync (writes appointment_id back).
      if (isPrivateBooking) {
        supabase.functions.invoke('notify-instructor-sms', {
          body: { booking_id: inserted.id },
        }).then(({ data, error }) => {
          if (error) console.warn('[notify-instructor-sms] invoke failed:', error.message);
          else console.log('[notify-instructor-sms] result:', data);
        });
      } else {
        supabase.functions.invoke('bookings-sync', {
          body: {
            booking_id: inserted.id,
            acuity_type_id: slot.acuity_type_id ?? null,
          },
        }).then(({ data, error }) => {
          if (error) console.warn('[bookings-sync] invoke failed:', error.message);
          else if (data?.acuity_error) console.warn('[bookings-sync] Acuity issue:', data.acuity_error);
          else console.log('[bookings-sync] result:', data);
          // Acuity sync writes acuity_appointment_id (or sets acuity_sync_failed
          // status) on the row. Tick again so ProfilePage shows the latest.
          setBookingsVersion(v => v + 1);
        });
        // Studio safety-window alert. No-op server-side if the business has
        // not opted in — cheap enough to always invoke and let the function
        // decide, which keeps this callsite ignorant of the feature flag.
        if (biz.cancellation_safety_window) {
          supabase.functions.invoke('booking-safety-alert', {
            body: { booking_id: inserted.id },
          }).then(({ data, error }) => {
            if (error) console.warn('[booking-safety-alert] invoke failed:', error.message);
            else console.log('[booking-safety-alert] result:', data);
          });
        }
      }
    } catch (e) {
      console.error('[onConfirm] unexpected exception:', e);
      showToast("Something went wrong. Please try again.","error");
    }
  }
  function onPurchase(purchase){ setCredits(c=>c+purchase.cr); showToast(`◈ ${purchase.cr} credits added!`,"gold"); }
  function toggleSave(id){ setSaved(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]); showToast(saved.includes(id)?"Removed from saved":"Saved!","success"); }
  function handleNavClick(id){
    // Unauthenticated visitors clicking Business see the /partners landing,
    // not the biz-portal sign-in form. Authenticated partners go straight
    // to their portal (BusinessPortal handles dashboard / onboarding / etc).
    if (id === "biz-portal" && !authSession) { setView("partners"); return; }
    setView(id);
  }

  const NAV=[{id:"home",l:"Home"},{id:"explore",l:"Explore"},{id:"credits",l:"Pass"},{id:"profile",l:"Profile"},{id:"biz-portal",l:"For Business"}];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Jost:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${T.bg};color:${T.ink};font-family:'Manrope','Jost',system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
        @media(min-width:768px){.mob-nav{display:none!important}}
        @keyframes su{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fi{from{opacity:0}to{opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}} @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}} @keyframes bounce{0%,100%{transform:translateY(0);opacity:0.5}50%{transform:translateY(8px);opacity:1}} @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:${T.border2};border-radius:2px}
        input,select,textarea,button{font-family:'Jost',system-ui,sans-serif;}
      `}</style>

      <SEO title="Wello — The Wellness Pass" />
      <Toast t={toast}/>

      {/* PASSWORD RECOVERY SCREEN */}
      {recovering&&(
        <div style={{position:"fixed",inset:0,background:T.bg,zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:28}}>
          <div style={{maxWidth:400,width:"100%",background:T.paper,border:`1px solid ${T.border}`,borderRadius:4,padding:"36px 32px"}}>
            <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:22,fontWeight:700,color:T.sage,letterSpacing:"-0.5px",marginBottom:4}}>wello</div>
            <div style={{fontFamily:F.body,fontSize:8,color:T.ochre,letterSpacing:"4px",textTransform:"uppercase",marginBottom:24}}>business portal</div>
            {newPwDone ? (
              <div style={{textAlign:"center",padding:"12px 0"}}>
                <div style={{fontSize:32,marginBottom:12}}>✓</div>
                <div style={{fontFamily:F.body,fontSize:14,color:T.sage,fontWeight:600}}>Password updated! Signing you in…</div>
              </div>
            ) : (
              <>
                <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:18,fontWeight:700,color:T.ink,margin:"0 0 6px"}}>Set your password</h2>
                <p style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300,margin:"0 0 20px"}}>Choose a password for your Wello business account.</p>
                <FieldLabel>New password</FieldLabel>
                <input type="password" value={newPw} onChange={e=>{setNewPw(e.target.value);setNewPwErr("");}}
                  placeholder="Minimum 8 characters"
                  style={{width:"100%",padding:"10px 12px",border:`1px solid ${newPwErr?T.clay:T.border}`,borderRadius:2,fontSize:12,fontFamily:F.body,background:T.paper,color:T.ink,outline:"none",marginBottom:8}}
                  onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=newPwErr?T.clay:T.border}
                  onKeyDown={e=>e.key==="Enter"&&doSetNewPassword()}/>
                {newPwErr&&<div style={{fontFamily:F.body,fontSize:11,color:T.clay,marginBottom:10}}>{newPwErr}</div>}
                <button onClick={doSetNewPassword} style={{width:"100%",padding:"11px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:"pointer",marginTop:4}}>
                  Set password & sign in →
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{minHeight:"100vh",background:"#FBF9F4",overflowX:"hidden"}}>

        {/* ── COOKIE CONSENT BANNER ── */}
      {!cookieConsent&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:3000,background:"#1B1C19",borderTop:"1px solid rgba(255,255,255,0.08)",padding:"14px clamp(16px,4vw,32px)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
          <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:12,color:"rgba(255,255,255,0.65)",margin:0,lineHeight:1.6,flex:1,minWidth:200}}>
            We use essential cookies to keep you signed in, and analytics cookies to improve Wello. <button onClick={()=>setShowPrivacy(true)} style={{background:"none",border:"none",color:"#A3B18A",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:12,cursor:"pointer",textDecoration:"underline",padding:0}}>Privacy Policy</button>
          </p>
          <div style={{display:"flex",gap:8,flexShrink:0}}>
            <button onClick={()=>{localStorage.setItem("wello_cookie_consent","essential");setCookieConsent("essential");}}
              style={{padding:"8px 16px",background:"transparent",border:"1px solid rgba(255,255,255,0.2)",borderRadius:999,fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.6)",cursor:"pointer"}}>
              Essential only
            </button>
            <button onClick={()=>{localStorage.setItem("wello_cookie_consent","all");setCookieConsent("all");}}
              style={{padding:"8px 16px",background:"#213C18",border:"1px solid #213C18",borderRadius:999,fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,fontWeight:600,color:"#fff",cursor:"pointer"}}>
              Accept all
            </button>
          </div>
        </div>
      )}

      {/* ── DEMO BANNER + NAV wrapper ── */}
        <div ref={headerRef} style={{position:"fixed",top:0,left:0,right:0,zIndex:1000,display:"flex",flexDirection:"column"}}>
          <div style={{background:"#213C18",padding:"8px 16px",display:"flex",alignItems:"center",justifyContent:"center",gap:8,overflow:"hidden"}}>
            <span style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,color:"rgba(255,255,255,0.7)",whiteSpace:"nowrap"}}>Partner registration open · Customer preview</span>
            <span style={{width:1,height:12,background:"rgba(255,255,255,0.2)",display:"inline-block",flexShrink:0}}/>
            <a href="mailto:hello@wello-wellness.com" style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,fontWeight:700,color:"#CAECBA",textDecoration:"none",whiteSpace:"nowrap"}}>hello@wello-wellness.com</a>
          </div>
        <nav style={{background:"#FBF9F4",borderBottom:"1px solid rgba(195,200,188,0.35)"}}>
          <style>{`body{overflow-x:hidden;} @media(max-width:640px){.wello-nav-links{display:none!important}} .wello-nav-links{display:flex;} .scroll-indicator{display:flex;} @media(max-width:767px){.scroll-indicator{display:none!important}} .mob-menu-btn{display:none;} @media(max-width:640px){.mob-menu-btn{display:flex!important;}}`}</style>
          <div style={{maxWidth:1200,margin:"0 auto",padding:"0 clamp(16px,4vw,32px)",display:"flex",alignItems:"center",height:60,gap:16}}>
            {/* Wordmark — left */}
            <a onClick={()=>setView("home")} style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:20,fontWeight:800,color:"#213C18",letterSpacing:"-1px",cursor:"pointer",userSelect:"none",textDecoration:"none",flexShrink:0}}>wello</a>
            {/* Mobile menu trigger — three-line hamburger */}
            <button className="mob-menu-btn" aria-label="Menu" aria-expanded={mobileMenuOpen}
              onClick={()=>setMobileMenuOpen(v=>!v)}
              style={{background:"transparent",border:"none",padding:8,cursor:"pointer",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <svg width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="#213C18" strokeWidth="2" strokeLinecap="round" style={{display:"block"}}>
                <line x1="2" y1="3"  x2="20" y2="3"/>
                <line x1="2" y1="8"  x2="20" y2="8"/>
                <line x1="2" y1="13" x2="20" y2="13"/>
              </svg>
            </button>
            {/* Links — centred */}
            <div className="wello-nav-links" style={{flex:1,justifyContent:"center",gap:6,alignItems:"center"}}>
              {[{id:"explore",l:"Explore"},{id:"credits",l:"Pass"},{id:"biz-portal",l:"Business"}].map(n=>(
                <button key={n.id} onClick={()=>handleNavClick(n.id)}
                  style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,fontWeight:view===n.id?700:500,color:view===n.id?"#213C18":"#43483F",background:"transparent",border:"none",borderBottom:view===n.id?"2px solid #213C18":"2px solid transparent",padding:"4px 10px 8px",cursor:"pointer",transition:"color .15s",outline:"none"}}>
                  {n.l}
                </button>
              ))}
            </div>
            {/* Right — credits + avatar */}
            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,marginLeft:"auto"}}>
              <div onClick={gotoCredits}
                style={{display:"flex",alignItems:"center",gap:5,background:"#213C18",color:"#fff",borderRadius:999,padding:"7px 14px",cursor:"pointer"}}>
                <span style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,fontWeight:700}}>◈ {credits}</span>
              </div>
              {authSession ? (
                <div onClick={()=>setView("profile")}
                  style={{width:32,height:32,borderRadius:"50%",background:"#213C18",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,fontWeight:800,color:"#fff",flexShrink:0}}>
                  {(profile?.full_name || authSession.user?.email || "M").trim().charAt(0).toUpperCase()}
                </div>
              ) : (
                <button onClick={()=>setAuthModal({mode:"signin"})}
                  style={{background:"transparent",border:"1px solid #213C18",color:"#213C18",borderRadius:999,padding:"6px 14px",cursor:"pointer",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:12,fontWeight:700}}>
                  Sign in
                </button>
              )}
            </div>
          </div>
        </nav>
        {/* Mobile dropdown menu — anchored under the nav, opened by the Mallorca trigger */}
        {mobileMenuOpen && (
          <>
            <div onClick={()=>setMobileMenuOpen(false)}
              style={{position:"fixed",inset:0,top:headerH,background:"rgba(27,28,25,0.35)",zIndex:990}}/>
            <div style={{position:"absolute",top:"100%",left:0,right:0,background:"rgba(251,249,244,0.98)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderBottom:"1px solid rgba(195,200,188,0.3)",boxShadow:"0 10px 30px rgba(33,60,24,0.12)",zIndex:1001,padding:"6px 0"}}>
              {[{id:"explore",l:"Explore"},{id:"credits",l:"Pass"},{id:"profile",l:"Profile"},{id:"biz-portal",l:"For Business"}].map(n=>(
                <button key={n.id}
                  onClick={()=>{handleNavClick(n.id);setMobileMenuOpen(false);}}
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"14px clamp(16px,4vw,32px)",background:view===n.id?"rgba(33,60,24,0.06)":"transparent",border:"none",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:15,fontWeight:view===n.id?700:500,color:view===n.id?"#213C18":"#43483F",cursor:"pointer",borderBottom:"1px solid rgba(195,200,188,0.18)",textAlign:"left"}}>
                  <span>{n.l}</span>
                  {view===n.id && <span style={{color:"#213C18",fontSize:14}}>•</span>}
                </button>
              ))}
            </div>
          </>
        )}
        </div>{/* end banner+nav wrapper */}

        {/* PAGES — padded for fixed banner+nav */}
        <div style={{paddingTop:headerH}}>
          {view==="home"       &&<HomePage listings={listings} listingsLoading={listingsLoading} bookings={bookings} onSelect={onSelect} savedIds={saved} onToggleSave={toggleSave} onSetView={setView} syncingIds={syncingIds} onGotoCredits={gotoCredits}/>}
          {view==="explore"    &&<ExplorePage listings={listings} onSelect={onSelect} savedIds={saved} onToggleSave={toggleSave} syncingIds={syncingIds} profile={profile} authSession={authSession} onSaveInterests={saveInterests}/>}
          {view==="profile"    &&<ProfilePage bookings={bookings} savedIds={saved} listings={listings} credits={credits} onSelect={onSelect} onSetView={setView} isBiz={isBiz} onToggleBiz={()=>setIsBiz(v=>!v)} onPreviewDashboard={()=>setBizPreview(true)} profile={profile} authSession={authSession} onSignOut={doSignOut} onOpenSignIn={()=>setAuthModal({mode:"signin"})} bookingsVersion={bookingsVersion} onSaveInterests={saveInterests} onCancelBooking={cancelBooking} onProfilePatch={(patch)=>setProfile(p => p ? { ...p, ...patch } : { id: authSession?.user?.id, ...patch })}/>}
          {view==="biz-portal" &&<BusinessPortal onSetView={setView}/>}
          {view==="credits"    &&<CreditsPage credits={credits} listings={listings} authSession={authSession} onCheckout={(qty)=>{ if (!authSession) requireAuthForCheckout(qty); else doCheckout(qty); }} onSetView={setView}/>}
          {view==="about"      &&<AboutPage onSetView={setView}/>}
          {view==="terms"      &&<TermsPage/>}
          {view==="partners"   &&<PartnersPage onSetView={setView}/>}
          {view==="gift"       &&(lastGift
            ? <GiftSentPage gift={lastGift} onSetView={(v)=>{ setLastGift(null); setView(v); }}/>
            : <GiftPage authSession={authSession} profile={profile} onSetView={setView} onGiftCreated={(g)=>setLastGift(g)}/>
          )}
          {view==="redeem"     &&<RedeemPage authSession={authSession} prefilledCode={prefilledClaimCode} onSetView={setView} onOpenSignIn={()=>setAuthModal({mode:"signin"})} onCreditsAdded={(newBal)=>{ setCredits(newBal); try { const url = new URL(window.location.href); url.searchParams.delete("claim"); window.history.replaceState({}, "", url.toString()); } catch { /* noop */ } setPrefilledClaimCode(""); }}/>}
          {view==="adminSetup" &&<AdminSetupPage/>}
          {view==="partnerInvite" &&<PartnerInviteRedirect/>}
        </div>

        {/* FOOTER — Stitch linen style */}
        <footer className="wello-footer" style={{background:"#F5F3EE",borderTop:"1px solid rgba(195,200,188,0.2)",padding:"clamp(32px,5vw,48px) clamp(16px,4vw,32px)"}}>
          <div style={{maxWidth:1200,margin:"0 auto",display:"flex",flexWrap:"wrap",justifyContent:"space-between",alignItems:"flex-start",gap:32}}>
            <div>
              <span style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:20,fontWeight:800,color:"#213C18",letterSpacing:"-0.5px",display:"block",marginBottom:8}}>wello</span>
              <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#43483F",maxWidth:280,lineHeight:1.6,margin:0}}>© 2026 Wello. Our Sustainability Commitment.</p>
            </div>
            <div style={{display:"flex",gap:32,flexWrap:"wrap"}}>
              <a onClick={()=>setView("about")} style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#43483F",cursor:"pointer",opacity:0.8,textDecoration:"none",transition:"opacity .15s"}} onMouseEnter={e=>e.target.style.opacity="1"} onMouseLeave={e=>e.target.style.opacity="0.8"}>About</a>
              <a onClick={()=>setView("partners")} style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#43483F",cursor:"pointer",opacity:0.8,textDecoration:"none",transition:"opacity .15s"}} onMouseEnter={e=>e.target.style.opacity="1"} onMouseLeave={e=>e.target.style.opacity="0.8"}>For partners</a>
              <a onClick={()=>setShowPrivacy(true)} style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#43483F",cursor:"pointer",opacity:0.8,textDecoration:"none",transition:"opacity .15s"}} onMouseEnter={e=>e.target.style.opacity="1"} onMouseLeave={e=>e.target.style.opacity="0.8"}>Privacy</a>
              <a onClick={()=>setView("terms")} style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#43483F",cursor:"pointer",opacity:0.8,textDecoration:"none",transition:"opacity .15s"}} onMouseEnter={e=>e.target.style.opacity="1"} onMouseLeave={e=>e.target.style.opacity="0.8"}>Terms of Use</a>
              <a onClick={()=>setShowContact(true)} style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#43483F",cursor:"pointer",opacity:0.8,textDecoration:"none",transition:"opacity .15s"}} onMouseEnter={e=>e.target.style.opacity="1"} onMouseLeave={e=>e.target.style.opacity="0.8"}>Contact</a>
            </div>
            <div>
              <button style={{width:40,height:40,borderRadius:"50%",border:"1px solid rgba(195,200,188,0.4)",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,transition:"background .15s"}}
                onMouseEnter={e=>e.target.style.background="#F0EEE9"} onMouseLeave={e=>e.target.style.background="transparent"}>🌐</button>
            </div>
          </div>
          <div style={{maxWidth:1200,margin:"clamp(24px,4vw,40px) auto 0",paddingTop:16,borderTop:"1px solid rgba(195,200,188,0.25)"}}>
            <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,color:"#7A7E74",lineHeight:1.6,margin:0}}>
              {COMPANY_NAME} · Registered in England and Wales · Company No. {COMPANY_NUMBER} · Registered office: {COMPANY_ADDRESS} · <a href={`mailto:${COMPANY_EMAIL}`} style={{color:"#7A7E74",textDecoration:"none"}}>{COMPANY_EMAIL}</a>
            </p>
          </div>
        </footer>
      </div>

      <ScrollDownBtn enabled={view==="home"}/>

      {/* CONTACT MODAL */}
      {showContact&&(
        <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(27,28,25,0.75)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowContact(false)}>
          <div style={{background:"#fff",borderRadius:20,maxWidth:480,width:"100%",padding:"36px 32px",boxShadow:"0 32px 80px rgba(0,0,0,0.22)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
              <div>
                <h2 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:22,fontWeight:700,color:"#213C18",margin:"0 0 4px",letterSpacing:"-0.5px"}}>Get in touch</h2>
                <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:14,color:"#54584F",margin:0}}>We'd love to hear from you.</p>
              </div>
              <button onClick={()=>{setShowContact(false);setContactSent(false);setContactForm({name:"",email:"",message:""}); }} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:"#54584F",padding:4}}>×</button>
            </div>
            {contactSent?(
              <div style={{textAlign:"center",padding:"20px 0"}}>
                <div style={{fontSize:40,marginBottom:12}}>✓</div>
                <h3 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:18,fontWeight:700,color:"#213C18",margin:"0 0 8px"}}>Message sent!</h3>
                <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:14,color:"#54584F",margin:0}}>We'll get back to you at {contactForm.email}.</p>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {[{l:"Name",k:"name",t:"text",p:"Your name"},{l:"Email",k:"email",t:"email",p:"your@email.com"}].map(f=>(
                  <div key={f.k}>
                    <label style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:6}}>{f.l}</label>
                    <input type={f.t} placeholder={f.p} value={contactForm[f.k]} onChange={e=>setContactForm(p=>({...p,[f.k]:e.target.value}))}
                      style={{width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"10px 14px",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:14,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",transition:"border-color .15s"}}
                      onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                  </div>
                ))}
                <div>
                  <label style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:6}}>Message</label>
                  <textarea placeholder="How can we help?" value={contactForm.message} onChange={e=>setContactForm(p=>({...p,message:e.target.value}))} rows={4}
                    style={{width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"10px 14px",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:14,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",resize:"vertical",transition:"border-color .15s"}}
                    onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                </div>
                <a href={`mailto:hello@wello-wellness.com?subject=Wello enquiry from ${contactForm.name}&body=${encodeURIComponent(contactForm.message + "%0A%0AFrom: " + contactForm.name + "%0AEmail: " + contactForm.email)}`}
                  onClick={()=>setContactSent(true)}
                  style={{display:"block",width:"100%",padding:"14px 0",borderRadius:999,background:contactForm.name&&contactForm.email&&contactForm.message?"#213C18":"#E4E2DD",color:contactForm.name&&contactForm.email&&contactForm.message?"#fff":"#54584F",border:"none",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:15,fontWeight:700,cursor:contactForm.name&&contactForm.email&&contactForm.message?"pointer":"not-allowed",textAlign:"center",textDecoration:"none",transition:"all .15s",boxSizing:"border-box"}}>
                  Send message →
                </a>
                <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,color:"#A3B18A",textAlign:"center",margin:0}}>Or email us directly: hello@wello-wellness.com</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PRIVACY MODAL */}
      {showPrivacy&&(
        <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(27,28,25,0.75)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowPrivacy(false)}>
          <div style={{background:"#fff",borderRadius:20,maxWidth:600,width:"100%",padding:"36px 32px",boxShadow:"0 32px 80px rgba(0,0,0,0.22)",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <h2 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:22,fontWeight:700,color:"#213C18",margin:0}}>Privacy Policy</h2>
              <button onClick={()=>setShowPrivacy(false)} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:"#54584F"}}>×</button>
            </div>
            <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,color:"#A3B18A",margin:"0 0 24px"}}>Last updated: April 2026 · Wello (wello-wellness.com)</p>
            {[
              ["Who we are", "Wello is a wellness marketplace based in Mallorca, Spain. We connect members with local wellness venues including yoga studios, gyms, spas and outdoor experiences. Our contact email is hello@wello-wellness.com."],
              ["What data we collect", "We collect the following personal data when you use Wello: your name and email address when you register or make an enquiry; payment information processed securely by Stripe (we never store your card details); booking history including which venues you visit and credits used; and device and usage data collected via PostHog analytics to help us improve the platform."],
              ["How we use your data", "Your data is used to: process and confirm bookings; send transactional emails via Resend (booking confirmations, receipts); manage your credit balance and account; improve platform performance through anonymised analytics; and comply with legal obligations. We never sell your personal data to third parties, and we never use it for advertising."],
              ["Third-party services", "Wello uses the following third-party services which may process your data: Supabase (database and authentication — hosted in EU); Stripe (payment processing — PCI DSS compliant); Resend (transactional email); PostHog (product analytics — data anonymised where possible). Each service operates under its own privacy policy and data processing agreement."],
              ["Venue partners", "When you book a class or experience, your first name and booking reference are shared with the relevant venue partner so they can confirm your attendance. Venues are not permitted to use this data for any other purpose."],
              ["Data retention", "We retain your account data for as long as your account is active. Booking records are kept for 7 years for financial compliance. You can request deletion of your account at any time."],
              ["Your rights (GDPR)", "Under GDPR you have the right to: access the personal data we hold about you; correct inaccurate data; request deletion of your data; object to or restrict processing; and data portability. To exercise any of these rights, contact hello@wello-wellness.com. You also have the right to lodge a complaint with the relevant supervisory authority."],
              ["Cookies", "Wello uses essential cookies to keep you signed in and maintain your session. We use PostHog analytics cookies to understand how the platform is used — these can be declined via our cookie banner. We do not use advertising cookies or sell cookie data."],
              ["Changes to this policy", "We may update this policy from time to time. Material changes will be communicated by email or via a notice on the platform. Continued use after changes constitutes acceptance."],
              ["Contact", "For any privacy questions or data requests: hello@wello-wellness.com"],
            ].map(([title,body])=>(
              <div key={title} style={{marginBottom:20,paddingBottom:20,borderBottom:"1px solid #F5F3EE"}}>
                <h3 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,fontWeight:700,color:"#213C18",margin:"0 0 6px",textTransform:"uppercase",letterSpacing:"0.5px"}}>{title}</h3>
                <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#54584F",margin:0,lineHeight:1.75}}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {selBiz   &&<BizPanel biz={selBiz}        onClose={()=>setSelBiz(null)}  onBook={onBook}
                     authSession={authSession} credits={credits}
                     onOpenSignIn={()=>{setSelBiz(null);setAuthModal({mode:"signin"});}}
                     onGotoCredits={()=>{setSelBiz(null);setView("credits");}}
                     onBookingsChanged={()=>setBookingsVersion(v=>v+1)}
                     showToast={showToast}/>}
      {bkData   &&<BookingModal biz={bkData.biz} slot={bkData.slot} onClose={()=>setBkData(null)} onConfirm={onConfirm} credits={credits} onBuyCredits={()=>{setBkData(null);setView("credits");}} profile={profile} authSession={authSession} onOpenSignIn={()=>{setBkData(null);setAuthModal({mode:"signin"});}}/>}
      {authModal&&<AuthModal initialMode={authModal.mode} onClose={()=>setAuthModal(null)} onSuccess={()=>setAuthModal(null)} onOpenTerms={()=>{setAuthModal(null);setView("terms");}}/>}
      <SyncEngine listings={listings} onUpdate={onSyncUpdate}/>
      <Chatbot listings={listings} credits={credits} bookings={bookings} onSelectBiz={onSelect}/>

      {bizPreview&&(
        <div style={{position:"fixed",inset:0,zIndex:2000,overflowY:"auto",background:"#FBF9F4"}}>
          <BusinessPortalDashboard onExit={()=>setBizPreview(false)}/>
        </div>
      )}
      {!bizPreview&&(
        <div style={{position:"fixed",bottom:148,right:12,zIndex:1050}}>
          <button onClick={()=>setBizPreview(true)}
            style={{background:"#1B1C19",color:"#D6B47C",border:"1px solid #B8925C",borderRadius:999,padding:"8px 16px",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.3)",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"}}>
            👁 Business portal
          </button>
        </div>
      )}
      {bizPreview&&(
        <div style={{position:"fixed",bottom:148,right:12,zIndex:2100}}>
          <button onClick={()=>setBizPreview(false)}
            style={{background:"#1B1C19",color:"#A89E8C",border:"1px solid #43483F",borderRadius:999,padding:"8px 16px",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.3)"}}>
            ✕ Exit preview
          </button>
        </div>
      )}


    </>
  );
}
