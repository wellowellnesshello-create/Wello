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
const INTEGRATIONS = [
  { id:"mindbody",   name:"Mindbody",    desc:"Most yoga & fitness studios",  auth:"OAuth 2.0",   col:"#4f46e5" },
  { id:"acuity",     name:"Acuity",      desc:"Independent studios",          auth:"API Key",     col:"#0ea5e9" },
  { id:"fareharbor", name:"FareHarbor",  desc:"Activity operators",           auth:"API Key",     col:"#16a34a" },
  { id:"gympass",    name:"Gympass",     desc:"Hotel & corporate gyms",       auth:"Partner API", col:"#e11d48" },
  { id:"ical",       name:"iCal Feed",   desc:"Any calendar, 15-min sync",    auth:"Feed URL",    col:T.ochre },
  { id:"custom",     name:"Custom API",  desc:"Your own booking system",      auth:"Bearer Token",col:T.stone },
];
const CATS = ["All","Yoga","Pilates","Surfing","Paddle Boarding","Kayaking","Cycling","Running","Hiking","Hotel Gym","Pool Access","Fitness Class","Meditation","Padel","Tennis","Pickleball","Private Instructor"];

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
  { id:"spa",               icon:"💆",   label:"Spa or wellness",      desc:"Treatments, massage, sound healing",                    defaultCategory:"Meditation",  suggestedCats:["Meditation"] },
  { id:"other",             icon:"❓",   label:"Something else",       desc:"Doesn't fit the categories above — tell us more",       defaultCategory:"Yoga",        suggestedCats: CATS.filter(c=>c!=="All") },
];
function businessTypeFor(typeId) { return BUSINESS_TYPES.find(t=>t.id===typeId) ?? BUSINESS_TYPES[0]; }
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
  { name: "Pools & Spa",    cats: ["Pool Access"],                                                     blurb: "Resort-style days"       },
  { name: "Gym & Fitness",  cats: ["Hotel Gym","Fitness Class"],                                       blurb: "Train your way"          },
  { name: "Outdoor",        cats: ["Surfing","Paddle Boarding","Kayaking","Cycling","Running","Hiking"], blurb: "Sea and mountains"     },
  { name: "Meditation",     cats: ["Meditation"],                                                      blurb: "Stillness and breath"    },
];
const SYNC = {1:"Mindbody",2:"Acuity",3:"Acuity",4:"FareHarbor",5:"Custom API",6:"Mindbody",7:"Gympass",8:"iCal",9:"Custom API"};

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
  return <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",zIndex:4000,background:bg,color:"#fff",padding:"9px 20px",borderRadius:3,fontFamily:F.body,fontSize:12,fontWeight:600,boxShadow:"0 6px 22px rgba(0,0,0,.18)",animation:"toastIn .28s ease",whiteSpace:"nowrap"}}>{t.msg}</div>;
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
function AuthModal({ initialMode = "signin", onClose, onSuccess }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  const [mode, setMode] = useState(initialMode); // signin | signup | magic | magic_sent | signup_check
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
        data: { full_name: fullName.trim() },
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
        <div style={{width:56,height:56,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:22}}>✓</div>
        <h2 style={{fontFamily:F2,fontSize:20,fontWeight:700,color:T.sage,letterSpacing:"-0.4px",margin:"0 0 8px"}}>Check your email</h2>
        <p style={{fontFamily:F2,fontSize:13,color:T.stone,lineHeight:1.6,margin:0}}>We sent a magic link to <strong style={{color:T.ink,fontWeight:600}}>{email}</strong>. Click it to sign in.</p>
      </div>
    </ModalShell>
  );

  if (mode === "signup_check") return (
    <ModalShell onClose={onClose}>
      <div style={{textAlign:"center",padding:"32px 8px"}}>
        <div style={{width:56,height:56,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:22}}>✓</div>
        <h2 style={{fontFamily:F2,fontSize:20,fontWeight:700,color:T.sage,letterSpacing:"-0.4px",margin:"0 0 8px"}}>Welcome to Wello</h2>
        <p style={{fontFamily:F2,fontSize:13,color:T.stone,lineHeight:1.6,margin:0}}>Confirm your email at <strong style={{color:T.ink,fontWeight:600}}>{email}</strong> to activate your account, then sign in.</p>
      </div>
    </ModalShell>
  );

  return (
    <ModalShell onClose={onClose}>
      <div style={{padding:"28px 28px 24px"}}>
        <div style={{fontFamily:F2,fontSize:22,fontWeight:800,color:T.sage,letterSpacing:"-0.8px",marginBottom:4}}>wello</div>
        <h2 style={{fontFamily:F2,fontSize:18,fontWeight:700,color:T.ink,letterSpacing:"-0.4px",margin:"0 0 4px"}}>
          {mode==="signin" ? "Sign in" : mode==="signup" ? "Create your account" : "Email me a magic link"}
        </h2>
        <p style={{fontFamily:F2,fontSize:12,color:T.stone,fontWeight:400,margin:"0 0 22px"}}>
          {mode==="signin" ? "Welcome back." : mode==="signup" ? "Wello members buy credits and book wellness across Mallorca." : "We'll send a one-tap sign-in link."}
        </p>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {mode==="signup" && (
            <div>
              <label style={{fontFamily:F2,fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",color:T.stone,display:"block",marginBottom:5}}>Full name</label>
              <input value={fullName} onChange={e=>{setFullName(e.target.value);clearErr();}} placeholder="Your name"
                style={{...INP3, borderColor: err ? T.clay : T.border}} onFocus={onF} onBlur={onB}/>
            </div>
          )}

          <div>
            <label style={{fontFamily:F2,fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",color:T.stone,display:"block",marginBottom:5}}>Email address</label>
            <input type="email" value={email} onChange={e=>{setEmail(e.target.value);clearErr();}} placeholder="you@email.com"
              style={{...INP3, borderColor: err ? T.clay : T.border}} onFocus={onF} onBlur={onB}/>
          </div>

          {mode !== "magic" && (
            <div>
              <label style={{fontFamily:F2,fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",color:T.stone,display:"block",marginBottom:5}}>Password</label>
              <input type="password" value={password} onChange={e=>{setPassword(e.target.value);clearErr();}}
                placeholder={mode==="signup" ? "At least 8 characters" : "••••••••"}
                style={{...INP3, borderColor: err ? T.clay : T.border}} onFocus={onF} onBlur={onB}
                onKeyDown={e=>{ if(e.key==="Enter") mode==="signin" ? doSignIn() : doSignUp(); }}/>
            </div>
          )}

          {err && <div style={{fontFamily:F2,fontSize:11,color:T.clay}}>{err}</div>}

          <button
            onClick={mode==="signin" ? doSignIn : mode==="signup" ? doSignUp : doMagic}
            disabled={busy || !email.trim() || (mode==="signup" && (!fullName.trim() || password.length<8)) || (mode==="signin" && !password)}
            style={{
              padding:"12px",
              background: busy ? T.border : T.sage,
              color: busy ? T.stone : "#fff",
              border:"none", borderRadius:4, fontFamily:F2, fontSize:13, fontWeight:700,
              cursor: busy ? "not-allowed" : "pointer", marginTop:4, letterSpacing:"0.2px",
            }}>
            {busy ? "Please wait…"
              : mode==="signin" ? "Sign in →"
              : mode==="signup" ? "Create account →"
              : "Send magic link →"}
          </button>

          {mode==="signin" && (
            <button onClick={()=>{setMode("magic");setErr("");}} style={{background:"transparent",border:"none",color:T.sage,fontFamily:F2,fontSize:12,fontWeight:600,cursor:"pointer",padding:"4px 0",marginTop:2}}>
              Or email me a magic link
            </button>
          )}
          {mode==="magic" && (
            <button onClick={()=>{setMode("signin");setErr("");}} style={{background:"transparent",border:"none",color:T.sage,fontFamily:F2,fontSize:12,fontWeight:600,cursor:"pointer",padding:"4px 0",marginTop:2}}>
              ← Back to password sign-in
            </button>
          )}
        </div>

        {/* Mode switch footer */}
        <div style={{marginTop:18,paddingTop:14,borderTop:`1px solid ${T.border}`,textAlign:"center"}}>
          {mode==="signup"
            ? <span style={{fontFamily:F2,fontSize:12,color:T.stone}}>Already a member? <button onClick={()=>{setMode("signin");setErr("");}} style={{background:"transparent",border:"none",color:T.sage,fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer",padding:0}}>Sign in</button></span>
            : <span style={{fontFamily:F2,fontSize:12,color:T.stone}}>New to Wello? <button onClick={()=>{setMode("signup");setErr("");}} style={{background:"transparent",border:"none",color:T.sage,fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer",padding:0}}>Create your account</button></span>
          }
        </div>
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
  const avail = isPrivateBooking ? 1 : slot.spots - slot.booked;
  const totalPeople = isPrivateBooking ? 1 : (1 + guests.length);
  const cost = biz.cr * totalPeople;
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
                  <span style={{fontFamily:F2,fontSize:13,color:"#54584F"}}>{totalPeople} × ◈ {biz.cr} credits</span>
                  <span style={{fontFamily:F2,fontSize:13,fontWeight:700,color:"#213C18"}}>◈ {cost}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid rgba(195,200,188,0.3)",paddingTop:6}}>
                  <span style={{fontFamily:F2,fontSize:13,color:"#54584F"}}>Balance after</span>
                  <span style={{fontFamily:F2,fontSize:13,fontWeight:700,color:canAfford?"#213C18":"#e05c5c"}}>{canAfford?`◈ ${credits-cost}`:"Insufficient credits"}</span>
                </div>
              </div>

              {(() => {
                const ok = myName && myEmail && canAfford && locationOk && phoneOk;
                const cta = !canAfford ? "Insufficient Credits"
                  : !phoneOk           ? "Add your mobile number to continue"
                  : !locationOk        ? "Add the session address to continue"
                  : isPrivateBooking   ? `Request booking · ◈ ${cost} held`
                  : `Confirm · ◈ ${cost} credits`;
                return (
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
                          },
                        });
                        setSt(2);
                      }
                    }}
                    disabled={!ok}
                    style={{width:"100%",padding:"16px 0",borderRadius:999,background:ok?"#213C18":"#E4E2DD",color:ok?"#fff":"#54584F",border:"none",fontFamily:F2,fontSize:15,fontWeight:700,cursor:ok?"pointer":"not-allowed",transition:"all .15s",boxShadow:ok?"0 4px 14px rgba(33,60,24,0.2)":"none"}}>
                    {cta}
                  </button>
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
function BizPanel({ biz, onClose, onBook }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";

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

  const dates = [...new Set(bookableSlots.map(s=>s.date))].sort();
  const [selDate, setSel] = useState(dates[0]||null);
  const sys = SYNC[biz.id];
  const slotsForDate = bookableSlots.filter(s=>s.date===selDate);

  // Build calendar — show 7 days starting from first slot date
  const allDates = dates;

  return (
    <div style={{position:"fixed",inset:0,zIndex:1100,background:"rgba(27,28,25,0.6)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px"}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:16,maxWidth:640,width:"100%",maxHeight:"88vh",overflow:"hidden",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.25)",animation:"su .25s ease"}} onClick={e=>e.stopPropagation()}>

        {/* Hero image */}
        <div style={{position:"relative",height:200}}>
          <img src={biz.img} alt={biz.name} style={{width:"100%",height:"100%",objectFit:"cover"}}
            onError={e=>{e.target.src="https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80";}}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(27,28,25,0.88) 0%,rgba(27,28,25,0.05) 55%)"}}/>
          <button onClick={onClose} aria-label="Close" style={{position:"absolute",top:12,right:12,zIndex:10,background:"rgba(255,255,255,0.95)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",border:"1px solid rgba(195,200,188,0.4)",color:"#1B1C19",width:40,height:40,borderRadius:"50%",cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,boxShadow:"0 4px 12px rgba(0,0,0,0.18)"}}>×</button>
          {sys&&<div style={{position:"absolute",top:14,left:14,background:"rgba(27,28,25,0.6)",backdropFilter:"blur(8px)",borderRadius:999,padding:"4px 10px",display:"flex",alignItems:"center",gap:5}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"#4ade80",display:"inline-block"}}/>
            <span style={{fontFamily:F2,fontSize:10,color:"#fff",fontWeight:500}}>Live · {sys}</span>
          </div>}
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
            </div>
          )}

          {/* Calendar date pills */}
          <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 10px"}}>Available dates</p>
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4,marginBottom:20,scrollbarWidth:"none"}}>
            {allDates.map(d=>{
              const hasSlots = bookableSlots.filter(s=>s.date===d).length>0;
              const isSelected = selDate===d;
              return (
                <button key={d} onClick={()=>setSel(d)}
                  style={{flexShrink:0,padding:"10px 16px",borderRadius:12,border:"none",cursor:"pointer",textAlign:"center",transition:"all .15s",
                    background:isSelected?"#213C18":hasSlots?"#F5F3EE":"#F0EDEA",
                    opacity:hasSlots?1:0.5}}>
                  <p style={{fontFamily:F2,fontSize:10,fontWeight:600,color:isSelected?"rgba(255,255,255,0.7)":"#54584F",margin:"0 0 2px",letterSpacing:"0.5px",textTransform:"uppercase"}}>
                    {new Date(d+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short"})}
                  </p>
                  <p style={{fontFamily:F2,fontSize:16,fontWeight:800,color:isSelected?"#fff":"#213C18",margin:"0 0 2px",letterSpacing:"-0.5px"}}>
                    {new Date(d+"T00:00:00").getDate()}
                  </p>
                  <p style={{fontFamily:F2,fontSize:10,color:isSelected?"rgba(255,255,255,0.6)":"#54584F",margin:0}}>
                    {new Date(d+"T00:00:00").toLocaleDateString("en-GB",{month:"short"})}
                  </p>
                  {hasSlots&&!isSelected&&<div style={{width:4,height:4,borderRadius:"50%",background:"#213C18",margin:"4px auto 0"}}/>}
                </button>
              );
            })}
          </div>

          {/* Slots for selected date */}
          {selDate&&(
            <>
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 10px"}}>
                Classes on {fd(selDate)}
              </p>
              <div style={{display:"flex",flexDirection:"column",gap:8,paddingBottom:8}}>
                {slotsForDate.length===0
                  ? <p style={{fontFamily:F2,fontSize:13,color:"#54584F",padding:"20px 0",textAlign:"center"}}>No classes on this day</p>
                  : slotsForDate.map(sl=>{
                      const avail = sl.spots - sl.booked;
                      const full = avail===0;
                      const pct = (sl.booked/sl.spots)*100;
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
                          <div style={{flex:1}}>
                            <p style={{fontFamily:F2,fontSize:14,fontWeight:600,color:"#1B1C19",margin:"0 0 4px"}}>{sl.name}</p>
                            {/* Capacity bar */}
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <div style={{width:80,height:4,background:"#E4E2DD",borderRadius:999}}>
                                <div style={{width:`${pct}%`,height:"100%",background:pct>80?"#B8925C":"#213C18",borderRadius:999,transition:"width .3s"}}/>
                              </div>
                              <span style={{fontFamily:F2,fontSize:11,color:full?"#e05c5c":pct>80?"#B8925C":"#213C18",fontWeight:600}}>
                                {full?"Full":`${avail} of ${sl.spots} left`}
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
                              {full?"Full":"Book →"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                }
              </div>
            </>
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
            <span style={{width:5,height:5,borderRadius:"50%",background:"#4ade80",display:"inline-block"}}/>
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
          <span style={{fontFamily:F2,fontSize:s.pillFont,fontWeight:600,color:"#766149",background:"rgba(250,222,192,0.5)",padding:s.pillPad,borderRadius:999}}>{biz.cat}</span>
          {biz.cat === "Private Instructor" && (
            <span style={{fontFamily:F2,fontSize:s.pillFont,fontWeight:700,color:"#fff",background:"#213C18",padding:s.pillPad,borderRadius:999}}>Private</span>
          )}
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
            Book yoga classes, gym access, hotel pools, spa treatments and outdoor adventures — or a private instructor who comes to you. All with one pass. No membership needed.
          </p>
          {/* CTAs — the home page used to host an AI search bar here, but
              it filtered the Featured strip in place rather than navigating,
              which felt broken. The semantic search lives on /explore now;
              the Explore CTA below sends guests straight to it. */}
          <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap",marginTop:"clamp(16px,3vw,28px)"}}>
            <button onClick={onGotoCredits || (()=>onSetView("credits"))}
              style={{display:"flex",alignItems:"center",gap:8,padding:"12px clamp(16px,4vw,36px)",borderRadius:999,background:"#213C18",color:"#fff",border:"none",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer"}}>
              Get Your Pass →
            </button>
            <button onClick={()=>onSetView("explore")}
              style={{padding:"12px clamp(16px,4vw,36px)",borderRadius:999,background:"transparent",color:"#213C18",border:"2px solid #213C18",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer"}}>
              Explore all
            </button>
          </div>
        </div>

      </section>

      

      {/* ── STATEMENT STRIP ── */}
      <div id="statement-strip" style={{background:"#213C18",padding:"14px 24px"}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"flex",justifyContent:"center",alignItems:"center",gap:0,flexWrap:"wrap"}}>
          {["Get your pass","Book any venue","Or a private instructor","No membership needed"].map((s,i,arr)=>(
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
                <div key={biz.id} style={{minWidth:"clamp(200px,60vw,260px)",flexShrink:0}}>
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
    const mC = activeCat === "All" || b.cat === activeCat;
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

          // Score within the candidate set for ordering only.
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
            return s;
          }
          let forYouItems = candidates
            .map(b => ({ b, s: scoreFor(b) }))
            .sort((a,b) => b.s - a.s)
            .map(x => x.b)
            .slice(0, 10);

          // No signals at all? Top-rated fallback so first-timers still see
          // something curated. We only hit this branch when the customer
          // has no interests AND no saves AND no saved-category siblings.
          if (forYouItems.length === 0) {
            forYouItems = [...pool]
              .sort((a,b) => (b.rating||0) - (a.rating||0))
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
          const dynamicSections = Object.entries(catCounts)
            .sort((a,b) => b[1] - a[1])
            .map(([cat]) => ({
              key: cat,
              name: catLabel(cat),
              cat,
              blurb: BLURBS[cat] || "Discover local picks",
              items: pool.filter(b => b.cat === cat),
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
                      <div key={b.id} style={{minWidth:"clamp(140px,20vw,170px)",maxWidth:170,flexShrink:0}}>
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
function ProfilePage({ bookings, savedIds, listings, credits, onSelect, onSetView, isBiz, onToggleBiz, onPreviewDashboard, profile, authSession, onSignOut, onOpenSignIn, bookingsVersion = 0, onSaveInterests }) {
  const [tab,setTab]=useState("reservations");
  const saved=listings.filter(b=>savedIds.includes(b.id));
  const [friends]=useState(FRIENDS);
  const TABS=[["reservations","Reservations"],["saved","Saved"],["friends","Friends"],["settings","Settings"]];
  const F2="'Manrope','Jost',system-ui,sans-serif";
  // Interests editor (Settings tab → Your preferences card)
  const [editingInterests, setEditingInterests] = useState(false);
  const [savingInterests, setSavingInterests] = useState(false);

  // Source-of-truth bookings: Supabase rows for signed-in members; in-memory
  // prop for the anonymous demo state (used only when this page is reached
  // without auth, which we now redirect away from below).
  const [remoteBookings, setRemoteBookings] = useState(null);
  useEffect(() => {
    if (!authSession?.user?.id) { setRemoteBookings(null); return; }
    let cancelled = false;
    supabase.from('bookings')
      .select('id, business_id, slot_id, booking_date, start_time, duration, credits_used, status, acuity_appointment_id, created_at')
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
        {tab==="reservations"&&(
          bookings.length===0
            ? <div style={{background:"#F5F3EE",borderRadius:16,padding:"80px 20px",textAlign:"center"}}>
                <div style={{fontSize:40,marginBottom:16}}>📅</div>
                <h3 style={{fontFamily:F2,fontSize:20,fontWeight:700,color:"#213C18",marginBottom:12}}>No reservations yet</h3>
                <button onClick={()=>onSetView("explore")}
                  style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"12px 28px",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer"}}>
                  Explore Classes
                </button>
              </div>
            : <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
                  <h2 style={{fontFamily:F2,fontSize:22,fontWeight:700,color:"#213C18",letterSpacing:"-0.5px",margin:0}}>Upcoming Bookings</h2>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {bookings.map(bk=>(
                    <div key={bk.id} style={{display:"flex",flexWrap:"wrap",background:"#F5F3EE",borderRadius:12,overflow:"hidden",transition:"background .2s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#EAE8E3"}
                      onMouseLeave={e=>e.currentTarget.style.background="#F5F3EE"}>
                      <div style={{width:"clamp(80px,30vw,160px)",minHeight:100,flexShrink:0,overflow:"hidden"}}>
                        <img src={bk.biz.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      </div>
                      <div style={{flex:1,padding:"20px 24px",display:"flex",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",gap:16}}>
                        <div>
                          <span style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#6F5B44",letterSpacing:"2px",textTransform:"uppercase",display:"block",marginBottom:6}}>{bk.biz.cat}</span>
                          <h3 style={{fontFamily:F2,fontSize:18,fontWeight:700,color:"#213C18",margin:"0 0 6px"}}>{bk.slot.name}</h3>
                          <p style={{fontFamily:F2,fontSize:13,color:"#54584F",margin:"0 0 4px"}}>📅 {fd(bk.slot.date)} · {bk.slot.time}</p>
                          <p style={{fontFamily:F2,fontSize:13,color:"#54584F",margin:0}}>📍 {bk.biz.name}, {bk.biz.loc}</p>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:10}}>
                          <span style={{display:"flex",alignItems:"center",gap:6,background:"#CAECBA",color:"#213C18",padding:"6px 14px",borderRadius:999,fontSize:11,fontWeight:700}}>
                            <span style={{width:6,height:6,borderRadius:"50%",background:"#213C18",display:"inline-block"}}/>Confirmed
                          </span>
                          <span style={{fontFamily:F2,fontSize:14,fontWeight:700,color:"#213C18"}}>◈ {bk.cost} credits</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
        )}

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

        {/* Settings */}
        {tab==="settings"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:520}}>
            {[{title:"Account Details",content:(
              <div style={{padding:"20px"}}>
                <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:16}}>
                  {[{l:"Full Name",v:"Jane Smith"},{l:"Email",v:"jane@example.com"},{l:"Location",v:"Mallorca"}].map(f=>(
                    <div key={f.l}>
                      <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#54584F",display:"block",marginBottom:6}}>{f.l}</label>
                      <input defaultValue={f.v} style={{width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"12px 16px",fontFamily:F2,fontSize:14,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",transition:"border-color .15s"}}
                        onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                    </div>
                  ))}
                </div>
                <button style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"10px 24px",fontFamily:F2,fontSize:13,fontWeight:700,cursor:"pointer"}}>Save changes</button>
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
      body:  "You set your own credit price. We agree payout terms with each partner individually so they fit how your venue works. No long contracts and no monthly fee.",
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
      a: "You set your credit price. We agree the payout terms with each partner individually on the call before you go live, based on your category and price point. Members redeem credits at your venue, we settle every Friday.",
    },
    {
      q: "What booking systems do you integrate with?",
      a: "Today we integrate directly with Acuity Scheduling and any calendar that exports an iCal feed, which includes Google Calendar, Apple Calendar and Outlook. Mindbody, Glofox, Eversports, Fresha and Momoyoga are next on the roadmap. If you're on something else, you can list manually and we'll prioritise integrations based on what partners are using.",
    },
    {
      q: "When do I get paid?",
      a: "Payouts go out every Friday, direct to the IBAN you set in your dashboard. Each payout covers credits redeemed at your venue in the prior week, net of the agreed payout terms. You can download a statement for each payout from your dashboard.",
    },
    {
      q: "Is there a contract?",
      a: "No long contracts and no exit fees. You can pause your listing or leave at any time. We're building a marketplace that works for partners over the long term, not locking you in.",
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
          <p style={{fontFamily:F2,fontSize:"clamp(15px,1.9vw,19px)",color:"#43483F",lineHeight:1.6,margin:"0 0 32px",maxWidth:620,fontWeight:400}}>Join a growing network of wellness venues and reach visitors and locals who are actively looking for new experiences in Mallorca.</p>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            <button onClick={goRegister}
              style={{padding:"14px 30px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer",letterSpacing:"0.3px",boxShadow:"0 4px 14px rgba(33,60,24,0.2)"}}>
              Register your venue
            </button>
            <button onClick={()=>{ const f = document.getElementById('partners-faq'); if (f) f.scrollIntoView({behavior:"smooth",block:"start"}); }}
              style={{padding:"14px 24px",background:"transparent",color:"#213C18",border:"1px solid #213C18",borderRadius:999,fontFamily:F2,fontSize:14,fontWeight:600,cursor:"pointer"}}>
              Read the FAQ
            </button>
          </div>
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


function CreditsPage({ credits, listings=[] }) {
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
  const serviceFee      = Math.min(creditsSubtotal * 0.10, 50);
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
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { quantity: qtyNum, origin: window.location.origin },
      });
      if (error || !data?.url) {
        console.error('create-checkout-session failed:', error?.message || data?.error);
        setBuyLoading(false);
        alert("Sorry, we could not open checkout. Please try again, or sign in if you have not yet.");
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      console.error('startCheckout error:', e);
      setBuyLoading(false);
      alert("Sorry, we could not open checkout. Please try again.");
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
                  <span style={{fontFamily:F2,fontSize:12,color:"#54584F"}}>Service fee (10%, capped at €50)</span>
                  <span style={{fontFamily:F2,fontSize:13,color:"#43483F",fontWeight:600}}>€{serviceFee.toFixed(2)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span style={{fontFamily:F2,fontSize:13,color:"#213C18",fontWeight:700}}>Total</span>
                  <span style={{fontFamily:F2,fontSize:22,fontWeight:800,color:"#213C18",letterSpacing:"-0.5px"}}>€{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <button onClick={startCheckout} disabled={buyLoading || qtyNum < 1}
                style={primaryBtn(qtyNum>=1 && !buyLoading)}>
                {buyLoading ? "Opening checkout" : `Buy credits · €${grandTotal.toFixed(2)}`}
              </button>

              <p style={{fontFamily:F2,fontSize:11,color:"rgba(33,60,24,0.55)",textAlign:"center",margin:"14px 0 0"}}>Secure card payment. Credits valid 6 months. 1 credit = €{PRICE_PER_CREDIT}.</p>
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

function BusinessPortalDashboard({ onExit, bizData: bizDataProp, isPreview = true, venues = [], activeVenueId = null, onSwitchVenue, onAddVenue, addingVenue = false, onDeleteVenue, onChangeType }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  const bizData = bizDataProp || { name:"Demo Studio", cat:"Yoga", loc:"Sóller", monthlyBookings:24, monthlyCredits:86 };
  // Persist the active tab across remounts (navigate-away-and-back snaps the
  // dashboard back to overview otherwise). Stored per-tab not per-venue so a
  // partner who likes the Schedule tab can come back to it on any venue.
  const [tab, setTab] = useState(() => {
    try {
      const saved = localStorage.getItem("wello_dash_tab");
      if (!saved) return "overview";
      const allowed = ["overview","requests","schedule","payouts","listing","settings"];
      return allowed.includes(saved) ? saved : "overview";
    } catch { return "overview"; }
  });
  useEffect(() => {
    try { localStorage.setItem("wello_dash_tab", tab); } catch { /* non-critical */ }
  }, [tab]);
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
  // Listing edit form: category, location, credit price, price_mode.
  const [listingForm, setListingForm] = useState({
    category:   bizData.category || bizData.cat || "",
    location:   bizData.location || bizData.loc || "",
    cr:         bizData.cr != null ? String(bizData.cr) : "",
    price_mode: bizData.price_mode || "flat",
  });
  // Settings edit form: profile / contact fields.
  const [settingsForm, setSettingsForm] = useState({
    name:        bizData.name || "",
    description: bizData.description || "",
    address:     bizData.address || "",
    website:     bizData.website || "",
    instagram:   bizData.instagram || "",
    phone:       bizData.phone || "",
    email:       bizData.email || "",
  });
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState({ kind:"", text:"" }); // { kind:"settings"|"listing"|"golive"|"err", text }
  const [linkedListingId, setLinkedListingId] = useState(null);
  const [dbSlots, setDbSlots]     = useState(null); // null = loading | [] = empty | [...] = loaded
  const [statusLive, setStatusLive] = useState(bizData.status === 'approved' || bizData.status === 'submitted');
  // Private-instructor dashboards behave a bit differently — declared up here
  // (and not later beside the TABS array) so the pendingRequests useEffect
  // below doesn't trip over a TDZ when it reads it on initial render.
  const dashIsPrivate = bizData?.business_type === 'private_instructor'
    || (!bizData?.business_type && bizData?.category === 'Private Instructor');

  // Private-instructor specific editable state. We hydrate from bizData on
  // mount and the dashboard's key={activeVenueId} prop ensures these reset
  // when the partner switches venues.
  const [coverageAreas, setCoverageAreas] = useState(
    Array.isArray(bizData?.coverage_areas) ? bizData.coverage_areas : []
  );
  const [availabilityWindows, setAvailabilityWindows] = useState(
    Array.isArray(bizData?.availability_windows) ? bizData.availability_windows : []
  );
  const [sessionDurationMin, setSessionDurationMin] = useState(
    Number.isFinite(bizData?.session_duration_min) && bizData?.session_duration_min > 0
      ? bizData.session_duration_min : 60
  );
  // Mirror of session_offerings — see wizard equivalent for the shape.
  const [dashSessionOfferings, setDashSessionOfferings] = useState(
    Array.isArray(bizData?.session_offerings) && bizData.session_offerings.length > 0
      ? bizData.session_offerings.map(o => ({
          type: o?.type || (bizData?.category || ""),
          length_min: Number.isFinite(o?.length_min) && o.length_min > 0 ? o.length_min : 60,
          price_eur:  Number.isFinite(o?.price_eur)  && o.price_eur  > 0 ? o.price_eur  : (bizData?.cr || 50),
        }))
      : []
  );
  const DASH_LENGTH_OPTIONS = [30, 45, 60, 75, 90, 120];
  // Inline "add new offering" form state — opens under the chip row when
  // partner taps "+ Add offering". Avoids the dense table layout entirely.
  const [newOff, setNewOff] = useState({ type: "", length_min: 60, price_eur: 50 });
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
  }
  function commitNewOffering() {
    const type = (newOff.type || "").trim();
    if (!type) return;
    const length_min = parseInt(newOff.length_min, 10) || 60;
    const price_eur  = parseInt(newOff.price_eur, 10)  || 0;
    if (price_eur <= 0) return;
    setDashSessionOfferings(prev => [...prev, { type, length_min, price_eur }]);
    setNewOff({ type: "", length_min: 60, price_eur: 50 });
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
    if (isPreview || !bizData?.id || !dashIsPrivate) { setPendingRequests([]); return; }
    let cancelled = false;
    (async () => {
      const { data: rows, error } = await supabase
        .from('bookings')
        .select('id, user_id, slot_id, booking_date, start_time, duration, credits_used, notes, status, created_at')
        .eq('business_id', bizData.id)
        .eq('status', 'pending_instructor')
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
  }, [isPreview, bizData?.id, dashIsPrivate, requestsTick]);

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

  async function respondToRequest(bookingId, action) {
    if (!bookingId || respondingId) return;
    setRespondingId(bookingId);
    const { data, error } = await supabase.functions.invoke('instructor-booking-response', {
      body: { booking_id: bookingId, action },
    });
    setRespondingId(null);
    if (error) {
      console.error('instructor-booking-response error:', error.message);
      flashSaveMsg('err', "Couldn't send your response. " + error.message);
      return;
    }
    if (data?.error) {
      console.error('instructor-booking-response server error:', data.error);
      flashSaveMsg('err', data.error);
      return;
    }
    flashSaveMsg(action === 'confirm' ? 'golive' : 'settings', action === 'confirm' ? 'Booking confirmed.' : 'Booking declined.');
    setRequestsTick(t => t + 1);
  }

  async function saveSettings() {
    if (isPreview || !bizData?.id) return;
    setSaving(true);
    const { error } = await supabase.from('businesses').update({
      name:        settingsForm.name.trim() || null,
      description: settingsForm.description || null,
      address:     settingsForm.address || null,
      website:     settingsForm.website || null,
      instagram:   settingsForm.instagram || null,
      phone:       settingsForm.phone || null,
      email:       settingsForm.email.trim() || bizData.email, // keep email if cleared
    }).eq('id', bizData.id);
    setSaving(false);
    if (error) flashSaveMsg("err", "Couldn't save. " + error.message);
    else flashSaveMsg("settings", "Settings saved.");
  }

  async function saveListing() {
    if (isPreview || !bizData?.id) return;
    setSaving(true);
    const crNum = parseInt(listingForm.cr);
    const { error } = await supabase.from('businesses').update({
      category:   listingForm.category || null,
      location:   listingForm.location || null,
      cr:         Number.isFinite(crNum) && crNum > 0 ? crNum : null,
      price_mode: listingForm.price_mode || 'flat',
    }).eq('id', bizData.id);
    // Mirror cr onto the live listings row so the marketplace card updates
    // immediately (rather than waiting for the next approval cycle).
    if (!error && Number.isFinite(crNum) && crNum > 0) {
      await supabase.from('listings').update({ cr: crNum }).eq('business_id', bizData.id);
    }
    setSaving(false);
    if (error) flashSaveMsg("err", "Couldn't save. " + error.message);
    else flashSaveMsg("listing", "Listing saved.");
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
    const { error: bizErr } = await supabase.from('businesses')
      .update({ coverage_areas: coverageAreas })
      .eq('id', bizData.id);
    if (!bizErr) {
      await supabase.from('listings')
        .update({ coverage_areas: coverageAreas, loc: displayLoc })
        .eq('business_id', bizData.id);
    }
    setSaving(false);
    if (bizErr) flashSaveMsg("err", "Couldn't save coverage areas. " + bizErr.message);
    else flashSaveMsg("listing", "Coverage areas updated.");
  }

  // Private-instructor only. Saves windows + session length, then re-expands
  // them into concrete slot rows for the next 4 weeks. Mirrors the logic in
  // notify-partner-status so the partner sees changes reflected immediately
  // without waiting for an admin re-approval.
  async function saveAvailability() {
    if (isPreview || !bizData?.id) return;
    setSaving(true);
    const { error: bizErr } = await supabase.from('businesses').update({
      availability_windows: availabilityWindows,
      session_duration_min: sessionDurationMin,
      session_offerings: dashSessionOfferings,
    }).eq('id', bizData.id);
    if (bizErr) {
      setSaving(false);
      flashSaveMsg("err", "Couldn't save availability. " + bizErr.message);
      return;
    }
    // Regenerate slot rows: delete old, expand new windows × offerings.
    if (linkedListingId) {
      await supabase.from('slots').delete().eq('listing_id', linkedListingId);
      const DAY_IDX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
      const today = new Date();
      const LEAD_MS = 4 * 24 * 60 * 60 * 1000;
      const minBookable = new Date(Date.now() + LEAD_MS);
      const fallbackCr = listingForm.cr ? (parseInt(listingForm.cr) || (bizData.cr ?? 60)) : (bizData.cr ?? 60);
      // If the partner hasn't filled in any offerings yet, fall back to a
      // single offering built from the legacy duration + price pair so we
      // still generate something they can preview.
      const offerings = (dashSessionOfferings && dashSessionOfferings.length > 0)
        ? dashSessionOfferings
        : [{ type: bizData?.category || 'Private session', length_min: sessionDurationMin, price_eur: fallbackCr }];
      const slotRows = [];
      for (const w of availabilityWindows) {
        const dayIdx = DAY_IDX[w.day];
        if (dayIdx === undefined) continue;
        const [sH, sM] = String(w.start || '09:00').split(':').map(x => parseInt(x, 10));
        const [eH, eM] = String(w.end   || '18:00').split(':').map(x => parseInt(x, 10));
        const startMin = sH * 60 + sM;
        const endMin   = eH * 60 + eM;
        if (endMin <= startMin) continue;
        const curr = today.getDay();
        const daysAhead = (dayIdx - curr + 7) % 7 || 7;
        for (let week = 0; week < 4; week++) {
          const d = new Date(today);
          d.setDate(today.getDate() + daysAhead + week * 7);
          d.setHours(0, 0, 0, 0);
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
    if (!confirm("Submit your listing for review? The Wello team will email you within 2 working days.")) return;
    setSaving(true);
    const { error } = await supabase.from('businesses').update({ status: 'submitted' }).eq('id', bizData.id);
    setSaving(false);
    if (error) flashSaveMsg("err", "Couldn't submit. " + error.message);
    else { setStatusLive(true); flashSaveMsg("golive", "Submitted for review. Watch your inbox."); }
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

  // Private-instructor dashboards get an extra "Requests" tab for pending
  // booking requests (where they have 48 hours to confirm or decline).
  // Confirmed bookings appear inline in the Schedule tab (Live bookings panel).
  const TABS = dashIsPrivate
    ? [["overview","Overview"],["requests","Requests"],["schedule","Schedule"],["payouts","Payouts"],["listing","My Listing"],["settings","Settings"]]
    : [["overview","Overview"],["schedule","Schedule"],["payouts","Payouts"],["listing","My Listing"],["settings","Settings"]];

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
  const CLS = isPreview
    ? previewCLS
    : (dbSlots || []).map(s => ({
        id:      s.id,
        day:     weekdayIdxFromDate(s.date),
        time:    s.time,
        name:    s.name,
        spots:   s.spots,
        booked:  s.booked,
        credits: s.credits,
        dur:     s.dur,
        live:    !s.paused,
      }));
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
    {label:"Payout due",         value:"€619", sub:"paid this Friday", accent:"#4ade80"},
    {label:"Avg rating",         value:"4.9",  sub:"38 reviews",       accent:"#D6B47C"},
  ] : [
    {label:"Bookings this month",value:String(monthlyBookings),       sub:monthLabel,                                                accent:"#CAECBA"},
    {label:"Credits redeemed",   value:"◈ "+monthlyCredits,           sub:"this month",                                              accent:"rgba(255,255,255,0.25)"},
    {label:"Payout due",         value:payoutAmt,                     sub:monthlyCredits>0?"paid this Friday":"no payout yet",       accent:"#4ade80"},
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
                const dot = v.status === 'approved' ? '#4ade80'
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
                <span style={{width:6,height:6,borderRadius:"50%",background:"#4ade80",display:"inline-block"}}/>
                <span style={{fontFamily:F2,fontSize:11,color:"rgba(255,255,255,0.6)"}}>Live on marketplace</span>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setTab("listing")} style={{padding:"8px 16px",background:"rgba(255,255,255,0.12)",color:"#fff",border:"1px solid rgba(255,255,255,0.2)",borderRadius:999,fontFamily:F2,fontSize:11,fontWeight:600,cursor:"pointer"}}>Edit listing</button>
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
            {TABS.map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)}
                style={{padding:"12px 20px",border:"none",borderBottom:`3px solid ${tab===k?"#fff":"transparent"}`,background:tab===k?"rgba(255,255,255,0.1)":"transparent",color:tab===k?"#fff":"rgba(255,255,255,0.45)",fontFamily:F2,fontSize:12,fontWeight:tab===k?700:400,cursor:"pointer",transition:"all .15s"}}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{maxWidth:1100,margin:"0 auto",padding:"clamp(16px,3vw,28px) clamp(16px,3vw,32px) 80px"}}>

        {/* ── OVERVIEW ── */}
        {tab==="overview"&&(
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
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
                    <span style={{width:7,height:7,borderRadius:"50%",background:"#4ade80",display:"inline-block"}}/>
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
                            const customerLocation = locLine.replace(/^Customer location:\s*/i, "").trim();
                            const customerNote = noteLine.replace(/^Notes:\s*/i, "").trim();
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
                                  <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:"0 0 2px"}}>{sessionName}</p>
                                  {customerLocation && (
                                    <p style={{fontFamily:F2,fontSize:11,color:"#766149",margin:0}}>📍 {customerLocation}</p>
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

        {/* ── REQUESTS (private instructors only) ── */}
        {tab==="requests"&&(
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
                  const customerLocation = locLine.replace(/^Customer location:\s*/i, '').trim() || 'Not provided';
                  const customerNote = noteLine.replace(/^Notes:\s*/i, '').trim();
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
                      </div>
                      <div style={{marginBottom:14}}>
                        <p style={{fontFamily:F2,fontSize:9,color:"#54584F",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 3px"}}>Session address</p>
                        <p style={{fontFamily:F2,fontSize:12,color:"#1B1C19",margin:0,lineHeight:1.5}}>{customerLocation}</p>
                        {customerNote && (
                          <>
                            <p style={{fontFamily:F2,fontSize:9,color:"#54584F",letterSpacing:"1.5px",textTransform:"uppercase",margin:"10px 0 3px"}}>Arrival notes</p>
                            <p style={{fontFamily:F2,fontSize:12,color:"#1B1C19",margin:0,lineHeight:1.5,fontStyle:"italic"}}>{customerNote}</p>
                          </>
                        )}
                      </div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        <button onClick={()=>respondToRequest(req.id,'confirm')} disabled={!!respondingId}
                          style={{flex:"1 1 140px",padding:"10px 14px",background:respondingId===req.id?"#A3A89E":"#213C18",color:"#fff",border:"none",borderRadius:6,fontFamily:F2,fontSize:12,fontWeight:700,cursor:respondingId?"wait":"pointer"}}>
                          {respondingId===req.id ? 'Sending…' : '✓ Confirm booking'}
                        </button>
                        <button onClick={()=>respondToRequest(req.id,'decline')} disabled={!!respondingId}
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
        {tab==="schedule" && dashIsPrivate && (
          <div>
            <div style={{marginBottom:18}}>
              <h2 style={{fontFamily:F2,fontSize:18,fontWeight:700,color:"#1B1C19",margin:"0 0 4px"}}>Your weekly availability</h2>
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:0,lineHeight:1.6}}>Block out time windows + the session types you offer. We generate bookable slots for each offering inside every window. Guests pick the slot they want.</p>
            </div>

            {/* What you offer — chip-based. Each offering is a tappable
                pill. Inline add form lives below; no dense table. */}
            <div style={{background:"#fff",borderRadius:12,padding:"18px 20px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)",marginBottom:14}}>
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 6px"}}>What you offer</p>
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 12px",lineHeight:1.6}}>One pill per session type. Tap × to remove. Add a new one below.</p>

              {dashSessionOfferings.length > 0 && (
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                  {dashSessionOfferings.map((off, idx) => (
                    <span key={idx} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"7px 10px 7px 14px",borderRadius:999,background:"rgba(33,60,24,0.06)",border:"1px solid rgba(33,60,24,0.18)",fontFamily:F2,fontSize:12,color:"#213C18",fontWeight:600}}>
                      <span>{off.type}</span>
                      <span style={{color:"#54584F",fontWeight:400}}>·</span>
                      <span style={{color:"#54584F",fontWeight:400}}>{off.length_min} min</span>
                      <span style={{color:"#54584F",fontWeight:400}}>·</span>
                      <span style={{color:"#766149"}}>€{off.price_eur}</span>
                      <button type="button" onClick={()=>dashRemoveOffering(idx)} aria-label={`Remove ${off.type}`}
                        style={{background:"transparent",border:"none",color:"#213C18",fontSize:14,cursor:"pointer",padding:"0 2px 0 4px",lineHeight:1,fontWeight:700}}>×</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Inline add form — three compact inputs + Add button */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 110px 110px 92px",gap:8,alignItems:"center",padding:"10px 12px",background:"#F5F3EE",borderRadius:8}}>
                <input value={newOff.type}
                  onChange={e=>setNewOff(p=>({...p,type:e.target.value}))}
                  onKeyDown={e=>{ if (e.key === 'Enter') commitNewOffering(); }}
                  placeholder="Class type (e.g. Yoga)"
                  style={{...INP,marginBottom:0}}/>
                <select value={newOff.length_min}
                  onChange={e=>setNewOff(p=>({...p,length_min:parseInt(e.target.value,10)}))}
                  style={{...INP,marginBottom:0}}>
                  {DASH_LENGTH_OPTIONS.map(m => <option key={m} value={m}>{m} min</option>)}
                </select>
                <div style={{position:"relative"}}>
                  <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#54584F",fontFamily:F2,fontSize:13,fontWeight:600,pointerEvents:"none"}}>€</span>
                  <input type="number" min="1" value={newOff.price_eur}
                    onChange={e=>setNewOff(p=>({...p,price_eur:parseInt(e.target.value,10)||0}))}
                    onKeyDown={e=>{ if (e.key === 'Enter') commitNewOffering(); }}
                    style={{...INP,paddingLeft:22,marginBottom:0}}/>
                </div>
                <button type="button" onClick={commitNewOffering}
                  disabled={!newOff.type.trim() || !newOff.price_eur}
                  style={{padding:"10px 0",background:(!newOff.type.trim()||!newOff.price_eur)?"#E4E2DD":"#213C18",color:(!newOff.type.trim()||!newOff.price_eur)?"#54584F":"#fff",border:"none",borderRadius:6,fontFamily:F2,fontSize:12,fontWeight:700,cursor:(!newOff.type.trim()||!newOff.price_eur)?"not-allowed":"pointer"}}>
                  + Add
                </button>
              </div>
            </div>

            {/* Weekly availability — multi-day picker. Each existing window
                shows as a row with day, time range, and remove. The add form
                lets the partner bulk-pick days ("Mon Wed Fri") + one time
                range, creating those windows in a single action. */}
            <div style={{background:"#fff",borderRadius:12,padding:"18px 20px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)",marginBottom:18}}>
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#54584F",margin:"0 0 6px"}}>When you're available</p>
              <p style={{fontFamily:F2,fontSize:12,color:"#54584F",margin:"0 0 14px",lineHeight:1.6}}>Pick the days, then set a time range. Add several rows for varied schedules.</p>

              {availabilityWindows.length === 0 && (
                <p style={{fontFamily:F2,fontSize:12,color:"#54584F",fontStyle:"italic",margin:"0 0 12px"}}>No availability yet. Add at least one window below.</p>
              )}

              {/* Existing windows — one row per window */}
              {availabilityWindows.length > 0 && (
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
                  {availabilityWindows.map((w, idx) => (
                    <div key={idx} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#F5F3EE",borderRadius:8}}>
                      <span style={{fontFamily:F2,fontSize:12,fontWeight:700,color:"#213C18",minWidth:36}}>{w.day}</span>
                      <span style={{flex:1,fontFamily:F2,fontSize:12,color:"#1B1C19",fontWeight:500}}>{w.start} → {w.end}</span>
                      <button type="button" onClick={()=>removeAvailabilityWindow(idx)} aria-label="Remove window"
                        style={{background:"transparent",border:"none",color:"#54584F",fontSize:16,cursor:"pointer",padding:"0 4px",lineHeight:1}}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Multi-day inline add form */}
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

                {/* Time pickers + Add button */}
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontFamily:F2,fontSize:11,color:"#54584F",fontWeight:600}}>From</span>
                  <input type="time" value={newWindow.start} onChange={e=>setNewWindow(p=>({...p,start:e.target.value}))}
                    style={{...INP,flex:"0 0 110px",marginBottom:0}}/>
                  <span style={{fontFamily:F2,fontSize:11,color:"#54584F",fontWeight:600}}>to</span>
                  <input type="time" value={newWindow.end} onChange={e=>setNewWindow(p=>({...p,end:e.target.value}))}
                    style={{...INP,flex:"0 0 110px",marginBottom:0}}/>
                  <button type="button" onClick={commitNewWindow}
                    disabled={newWindow.days.length===0 || newWindow.end <= newWindow.start}
                    style={{flex:"0 0 auto",padding:"10px 18px",background:(newWindow.days.length===0||newWindow.end<=newWindow.start)?"#E4E2DD":"#213C18",color:(newWindow.days.length===0||newWindow.end<=newWindow.start)?"#54584F":"#fff",border:"none",borderRadius:6,fontFamily:F2,fontSize:12,fontWeight:700,cursor:(newWindow.days.length===0||newWindow.end<=newWindow.start)?"not-allowed":"pointer"}}>
                    {newWindow.days.length === 0 ? "Pick days first" : `+ Add to ${newWindow.days.length} day${newWindow.days.length===1?"":"s"}`}
                  </button>
                </div>
              </div>
            </div>

            {/* Save bar — primary action lives here */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",padding:"12px 0 18px"}}>
              <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:0,flex:1,minWidth:200,lineHeight:1.5}}>Saving regenerates your bookable slots for the next 4 weeks. Slots inside the 4-day lead window are skipped.</p>
              <button onClick={saveAvailability} disabled={saving||isPreview}
                style={{padding:"11px 26px",background:(saving||isPreview)?"#E4E2DD":"#213C18",color:(saving||isPreview)?"#54584F":"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:(saving||isPreview)?"not-allowed":"pointer"}}>
                {saving ? "Saving" : "Save availability"}
              </button>
            </div>

            {/* Save toast — large, sage success or clay error so it's hard to
                miss after pressing Save. */}
            {saveMsg.kind === "settings" && (
              <div style={{padding:"12px 16px",background:"#CAECBA",border:"1px solid #A3B18A",borderRadius:8,marginBottom:18,display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:18,lineHeight:1}}>✓</span>
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
                    <span style={{width:7,height:7,borderRadius:"50%",background:"#4ade80",display:"inline-block"}}/>
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
          </div>
        )}

        {tab==="schedule" && !dashIsPrivate && (
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
                                    {isLower&&<div style={{position:"absolute",top:-8,left:"50%",transform:"translateX(-50%)",background:"#4ade80",color:"#1B1C19",fontFamily:F2,fontSize:7,fontWeight:700,letterSpacing:"0.5px",padding:"2px 8px",borderRadius:999,whiteSpace:"nowrap"}}>RECOMMENDED</div>}
                                    <p style={{fontFamily:F2,fontSize:20,fontWeight:800,color:sel?"#fff":"#213C18",margin:"4px 0 2px",letterSpacing:"-0.5px"}}>◈ {cr}</p>
                                    <p style={{fontFamily:F2,fontSize:10,color:sel?"rgba(255,255,255,0.65)":"#54584F",margin:"0 0 8px"}}>{valueNote}</p>
                                    <div style={{height:3,borderRadius:999,background:sel?"rgba(255,255,255,0.2)":"#E4E2DD",overflow:"hidden",margin:"0 0 5px"}}>
                                      <div style={{width:`${demand}%`,height:"100%",background:sel?"rgba(255,255,255,0.7)":isLower?"#4ade80":"#A3B18A",borderRadius:999}}/>
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
              <div style={{background:"rgba(255,255,255,0.1)",borderRadius:10,padding:"12px 16px",textAlign:"right"}}>
                <p style={{fontFamily:F2,fontSize:10,color:"rgba(255,255,255,0.5)",margin:"0 0 2px"}}>Commission rate</p>
                <p style={{fontFamily:F2,fontSize:16,fontWeight:700,color:"#CAECBA",margin:0}}>Agreed with Wello</p>
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
        {tab==="listing"&&(
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
                <button onClick={saveListing} disabled={saving||isPreview}
                  style={{padding:"12px 0",background:(saving||isPreview)?"#E4E2DD":"#213C18",color:(saving||isPreview)?"#54584F":"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:(saving||isPreview)?"not-allowed":"pointer"}}>
                  {saving ? "Saving" : "Save changes"}
                </button>
                {saveMsg.kind === "listing" && <p style={{fontFamily:F2,fontSize:12,color:"#213C18",margin:0,textAlign:"center"}}>{saveMsg.text}</p>}
                {saveMsg.kind === "err"     && <p style={{fontFamily:F2,fontSize:12,color:"#6F5B44",margin:0,textAlign:"center"}}>{saveMsg.text}</p>}
              </div>
            </div>

            {/* Coverage areas — private instructors only. Spans both columns. */}
            {dashIsPrivate && (
              <div style={{background:"#fff",borderRadius:12,padding:"20px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)",gridColumn:"1 / -1"}}>
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
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                  <p style={{fontFamily:F2,fontSize:11,color:coverageAreas.length>0?"#213C18":"#6F5B44",fontWeight:600,margin:0}}>
                    {coverageAreas.length > 0 ? `${coverageAreas.length} area${coverageAreas.length===1?"":"s"} selected` : "At least one area is required"}
                  </p>
                  <button onClick={saveCoverageAreas} disabled={saving||isPreview||coverageAreas.length===0}
                    style={{padding:"10px 22px",background:(saving||isPreview||coverageAreas.length===0)?"#E4E2DD":"#213C18",color:(saving||isPreview||coverageAreas.length===0)?"#54584F":"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:(saving||isPreview||coverageAreas.length===0)?"not-allowed":"pointer"}}>
                    {saving ? "Saving" : "Save coverage areas"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab==="settings"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:560}}>
            {/* Listing status + Go-live CTA */}
            {!isPreview && (
              <div style={{background:statusLive?"#CAECBA":"#FADEC0",border:`1px solid ${statusLive?"#A3B18A":"#DCC2A6"}`,borderRadius:12,padding:"16px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                <div>
                  <p style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#213C18",margin:"0 0 4px"}}>Listing status</p>
                  <p style={{fontFamily:F2,fontSize:14,fontWeight:600,color:"#213C18",margin:0,lineHeight:1.5}}>
                    {bizData.status === 'approved' ? "Live on marketplace" :
                     bizData.status === 'submitted' ? "Submitted for review. We'll be in touch within 2 working days." :
                     "Draft. Submit when you're ready and we'll review."}
                  </p>
                </div>
                {(bizData.status !== 'approved' && bizData.status !== 'submitted') && (
                  <button onClick={goLive} disabled={saving}
                    style={{padding:"10px 20px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:saving?"not-allowed":"pointer",whiteSpace:"nowrap"}}>
                    {saving ? "Submitting" : "Submit for review"}
                  </button>
                )}
              </div>
            )}
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
                  {id:"acuity",  name:"Acuity Scheduling",desc:"Auto-sync your classes from Acuity",  status:"available",  icon:"📅"},
                  {id:"manual",  name:"Manage manually",   desc:"Add & edit slots directly in Wello",  status:"available",  icon:"✏️"},
                  {id:"mindbody",name:"Mindbody",          desc:"Most yoga & pilates studios",         status:"coming_soon",icon:"🧘"},
                  {id:"glofox",  name:"Glofox",            desc:"Gym & boutique fitness",              status:"coming_soon",icon:"🏋️"},
                  {id:"eversports",name:"Eversports",      desc:"Studios across Europe",               status:"coming_soon",icon:"⚡"},
                  {id:"fresha",  name:"Fresha",            desc:"Spas, massage & beauty",              status:"coming_soon",icon:"💆"},
                  {id:"momoyoga",name:"Momoyoga",          desc:"Yoga studios",                        status:"coming_soon",icon:"🧘‍♀️"},
                ].map(item=>(
                  <div key={item.id} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",background:integration===item.id?"rgba(33,60,24,0.05)":"#F5F3EE",borderRadius:10,border:integration===item.id?"1px solid rgba(33,60,24,0.2)":"1px solid transparent",transition:"all .15s",cursor:item.status==="coming_soon"?"default":"pointer"}}
                    onClick={()=>item.status!=="coming_soon"&&setIntegration(item.id)}>
                    <span style={{fontSize:22,flexShrink:0}}>{item.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                        <p style={{fontFamily:F2,fontSize:13,fontWeight:700,color:"#1B1C19",margin:0}}>{item.name}</p>
                        {item.status==="coming_soon"&&<span style={{fontFamily:F2,fontSize:9,fontWeight:700,color:"#B8925C",background:"#FADEC0",padding:"2px 6px",borderRadius:999}}>Coming soon</span>}
                      </div>
                      <p style={{fontFamily:F2,fontSize:11,color:"#54584F",margin:0}}>{item.desc}</p>
                    </div>
                    {item.status!=="coming_soon"&&(
                      <span style={{fontFamily:F2,fontSize:12,color:"#213C18",fontWeight:600}}>{integration===item.id?"✓ Selected":"Select →"}</span>
                    )}
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
  // Default to Acuity tab (the primary integration option). Partners with manual
  // slots already saved (no acuity_key, slots present) will still default to
  // Acuity — they can click Manual to see their existing slots.
  // Private instructors are solo and don't sync external schedules — we lock
  // them to the manual tab via the effect below.
  const [availType, setAvailType] = useState(isPrivateInstructorCat(bizData.category) ? "manual" : "acuity");
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
  const [newSlot, setNewSlot] = useState({ name:"", days:[], time:"09:00", dur:"60 min", spots:10, cr:"" });

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
        }))
      : []
  );
  const LENGTH_OPTIONS = [30, 45, 60, 75, 90, 120];
  function addOffering() {
    setSessionOfferings(prev => [...prev, {
      type: bizData.category || "Yoga",
      length_min: 60,
      price_eur: bizData.cr || 50,
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
  const [intgRequest, setIntgRequest] = useState(bizData.integration_request || "");
  const [priceMode, setPriceMode] = useState(bizData.price_mode || "flat");
  const [previewOpen, setPreviewOpen] = useState(false);

  // Safe even when bizData.name is empty (e.g. a venue just created via
  // "+ Add another venue" before the partner has typed its name yet).
  const firstName = (bizData.name || 'there').split(' ')[0] || 'there';
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
    setSlots(s => [...s, { id:`sl${Date.now()}`, ...newSlot, spots, cr }]);
    setNewSlot({ name:"", days:[], time:"09:00", dur:"60 min", spots: isPrivateInstructor ? 1 : 10, cr:"" });
  }

  if (step===1) return (
    <><OnboardingProgressBar step={step} total={TOTAL} doSignOut={doSignOut} onBackToDashboard={onBackToDashboard} onRemoveVenue={onRemoveVenue} stepLabels={stepLabels} onJumpToStep={onJumpToStep}/>
      <div style={{maxWidth:520,margin:"0 auto",padding:"80px 28px",textAlign:"center"}}>
        <div style={{width:64,height:64,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 24px",fontSize:28}}>👋</div>
        <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:26,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 12px"}}>Welcome to Wello, {firstName}.</h1>
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
        <OBtn key="n" saving={saving} onClick={()=>goNext({name:venueName,category:venueCategory,location:venueLocation,description:desc,address,website,instagram,tags,bio,phone,coverage_areas:coverageAreas})} label="Save & continue →" disabled={!step2CanContinue}/>,
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
                     integration_request: intgRequest,
                   });
                 } else if (availType === "ical") {
                   goNext({ ical_url: icalUrl.trim(), integration_request: intgRequest });
                 } else if (isPrivateInstructor) {
                   // Private instructor: save weekly windows + session offerings.
                   // notify-partner-status iterates over windows × offerings to
                   // build the bookable slot rows on approval. session_duration_min
                   // and cr still saved as fallbacks for any legacy paths.
                   goNext({
                     availability_windows: availabilityWindows,
                     session_offerings: sessionOfferings,
                     session_duration_min: sessionDurationMin,
                     cr: parseInt(cr) || (sessionOfferings[0]?.price_eur ?? catAvg),
                     integration_request: intgRequest,
                   });
                 } else {
                   goNext({ slots, integration_request: intgRequest });
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
          {id:"acuity",    name:"Acuity Scheduling",desc:"Auto-sync your classes from Acuity",   status:"available",   icon:"📅"},
          {id:"ical",      name:"iCal Feed",        desc:"One-way sync from any calendar (Google, Apple, Outlook…)", status:"available", icon:"🔗"},
          {id:"manual",    name:"Manage manually",  desc:"Add & edit slots directly in Wello",   status:"available",   icon:"✏️"},
          {id:"mindbody",  name:"Mindbody",         desc:"Most yoga & pilates studios",          status:"coming_soon", icon:"🧘"},
          {id:"glofox",    name:"Glofox",           desc:"Gym & boutique fitness",               status:"coming_soon", icon:"🏋️"},
          {id:"eversports",name:"Eversports",       desc:"Studios across Europe",                status:"coming_soon", icon:"⚡"},
          {id:"fresha",    name:"Fresha",           desc:"Spas, massage & beauty",               status:"coming_soon", icon:"💆"},
          {id:"momoyoga",  name:"Momoyoga",         desc:"Yoga studios",                         status:"coming_soon", icon:"🧘‍♀️"},
        ].map(item => {
          const selected = availType === item.id;
          const disabled = item.status === "coming_soon";
          return (
            <div key={item.id}
              onClick={() => !disabled && setAvailType(item.id)}
              style={{
                display:"flex",alignItems:"center",gap:12,padding:"12px 14px",
                background: selected ? "rgba(33,60,24,0.06)" : T.bg2,
                border: `1px solid ${selected ? T.sage : T.border}`,
                borderRadius:8,
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.7 : 1,
                transition:"all .15s",
              }}>
              <span style={{fontSize:20,flexShrink:0}}>{item.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontFamily:F.body,fontSize:12,fontWeight:700,color:T.ink}}>{item.name}</span>
                  {disabled && (
                    <span style={{fontFamily:F.body,fontSize:9,fontWeight:700,color:T.clay,background:T.ochreXL,padding:"2px 6px",borderRadius:999}}>Coming soon</span>
                  )}
                </div>
                <p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,margin:"2px 0 0"}}>{item.desc}</p>
              </div>
              {!disabled && (
                <span style={{fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:600,flexShrink:0}}>
                  {selected ? "✓ Selected" : "Select →"}
                </span>
              )}
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
              <div key={idx} style={{display:"grid",gridTemplateColumns:"1fr 110px 110px 32px",gap:8,alignItems:"center",marginBottom:8}}>
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
                <div key={sl.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:T.paper,border:`1px solid ${T.border}`,borderRadius:6}}>
                  <div>
                    <span style={{fontFamily:F.body,fontSize:12,fontWeight:600,color:T.ink}}>{sl.name}</span>
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
        <label style={FL}>Using a different system? Let us know</label>
        <input value={intgRequest} onChange={e=>setIntgRequest(e.target.value)} placeholder="e.g. Trafft, SimplyBook, custom website…"
          style={{...INP,marginBottom:6}} onFocus={onFi} onBlur={onBl}/>
        <p style={{fontFamily:F.body,fontSize:10,color:T.stone2,fontWeight:300,margin:0}}>We'll prioritise integrations based on what partners are using.</p>
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

  if (step===6) return (
    <OWrap title="Payout details" sub="Enter your bank details so we can pay you for bookings made through Wello." step={step} total={TOTAL} doSignOut={doSignOut} onBackToDashboard={onBackToDashboard} onRemoveVenue={onRemoveVenue} stepLabels={stepLabels} onJumpToStep={onJumpToStep} listingTypeLabel={listingTypeLabel} onChangeType={onChangeType} onPreview={()=>setPreviewOpen(true)}
      footer={[<OBtn key="b" saving={saving} onClick={()=>setStep(5)} label="← Back" variant="secondary"/>,
               <OBtn key="n" saving={saving} onClick={()=>goNext({})} label="Save & continue →"/>]}>
      <div style={{pointerEvents:"none",opacity:1}}>
        {[{l:"Account name",p:"e.g. My Studio SL"},{l:"IBAN",p:"e.g. ES12 3456 7890 1234 5678 9012"},{l:"BIC / SWIFT",p:"e.g. CAIXESBBXXX"}].map(({l,p})=>(
          <div key={l} style={{marginBottom:14}}>
            <label style={FL}>{l}</label>
            <input disabled placeholder={p}
              style={{...INP,background:T.bg2,color:T.stone2,cursor:"not-allowed",borderColor:T.border}}/>
          </div>
        ))}
      </div>
      <div style={{background:T.ochreXL,border:`1px solid ${T.ochreL}`,borderRadius:6,padding:"12px 14px",marginTop:4}}>
        <p style={{fontFamily:F.body,fontSize:11,color:T.clay,fontWeight:300,lineHeight:1.65,margin:0}}>Payout details will be activated once we're fully operational — we'll be in touch when this is ready.</p>
      </div>
    </OWrap>
  );

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
    if (status === 'approved')   return 'dashboard';
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
    // .select() so we can detect the silent-zero-rows case (RLS blocking
    // the DELETE without throwing). Without it, Supabase returns success
    // even when no rows match the policy — and the venue stays in the DB.
    const { data: deletedRows, error: bizErr } = await supabase
      .from('businesses').delete().eq('id', id).select('id');
    if (bizErr) {
      console.error('deleteVenue error:', bizErr.message);
      const msg = /foreign key|fkey|referenced/i.test(bizErr.message)
        ? "This venue has linked data (listings or bookings) that can't be removed yet. Make sure ON DELETE CASCADE is set on listings.business_id and slots.listing_id, and bookings.business_id is ON DELETE SET NULL."
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
                const dot = v.status === 'approved' ? '#4ade80'
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
          <div style={{width:56,height:56,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:22}}>✓</div>
          <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:22,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 10px"}}>Listing submitted</h1>
          <p style={{fontFamily:F.body,fontSize:13,color:T.stone,fontWeight:300,lineHeight:1.75,margin:"0 0 24px"}}>We've received your listing for <strong style={{fontWeight:600,color:T.ink}}>{bizData?.name}</strong>. We'll review it and be in touch within 2 working days.</p>
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
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [view,setView]         = useState(()=>{
    const params = new URLSearchParams(window.location.search);
    if(params.get("portal")==="business") return "biz-portal";
    return "home";
  });
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
  const [showTerms,setShowTerms] = useState(false);
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
      const payload = {
        id: uid,
        email: u.email ?? null,
        full_name: u.user_metadata?.full_name || (u.email?.split('@')[0] ?? 'Member'),
      };
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

    // Partner-specific signals: explicit ?portal=business, or Supabase invite
    // / recovery URL hashes (used only by the partner setting-up + reset flow).
    // type=signup and type=magiclink are NOT partner-specific — customers also
    // use them, so we route only on the truly partner-specific markers.
    if (hash.includes("type=recovery") || hash.includes("type=invite")) {
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
      if(event==="PASSWORD_RECOVERY") {
        if(h.includes("type=invite") || h.includes("type=recovery")) {
          setRecovering(true);
          setView("biz-portal");
        }
      } else if (event === "SIGNED_IN") {
        if (h.includes("type=invite") || h.includes("type=recovery")) {
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
    const {error} = await supabase.auth.updateUser({password: newPw});
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

  // Fetch listings + slots from Supabase (with localStorage cache for instant load)
  useEffect(()=>{
    function transformRows(listingRows) {
      return listingRows.map(row => ({
        id: row.id,
        business_id: row.business_id || null,
        name: row.name,
        cat: row.category || row.cat || "Other",
        cat2: row.cat2 || null,
        loc: row.location || row.loc || "",
        desc: row.description || "",
        img: row.img || "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80",
        rating: parseFloat(row.rating) || 4.5,
        reviews: row.reviews || 0,
        cr: row.cr || row.credits_per_session || 3,
        tags: row.tags || [],
        coverage_areas: Array.isArray(row.coverage_areas) ? row.coverage_areas : [],
        slots: (row.slots || []).map(s => ({
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
    }

    async function fetchListings() {
      // Show cached data instantly if available
      try {
        const cached = localStorage.getItem("wello_listings");
        if (cached) {
          setListings(JSON.parse(cached));
          setListingsLoading(false);
        }
      } catch { /* non-critical: ignore */ }

      // Approved businesses are synced into the listings table by the
      // notify-partner-status Edge Function when status changes to 'approved'.
      const { data: listingRows, error } = await supabase
        .from("listings")
        .select("*, slots(*)")
        .eq("status","active")
        .order("id");

      if (error) {
        console.error("Error fetching listings:", error);
        if (!localStorage.getItem("wello_listings")) setListings(LISTINGS);
      } else if (listingRows && listingRows.length > 0) {
        const transformed = transformRows(listingRows);
        setListings(transformed);
        try { localStorage.setItem("wello_listings", JSON.stringify(transformed)); } catch { /* non-critical: ignore */ }
      } else {
        if (!localStorage.getItem("wello_listings")) setListings(LISTINGS);
      }
      setListingsLoading(false);
    }
    fetchListings();
  }, []);

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
  // Wrapper used by the nav Pass icon, the HomePage 'Get Your Pass' CTA, and
  // anywhere else that should require auth before reaching the credits page.
  function gotoCredits(){
    if (!authSession) { setAuthModal({ mode: "signup" }); return; }
    setView("credits");
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
    // - private requests: leave credits alone, leave slot capacity alone (the
    //   slot row will be confirmed/declined later)
    if (!isPrivateBooking) {
      setCredits(c=>c-cost);
      setListings(p=>p.map(b=>b.id!==biz.id?b:{...b,slots:b.slots.map(s=>s.id!==slot.id?s:{...s,booked:s.booked+form.guests})}));
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
      // SMS. We also append the optional arrival notes underneath when
      // present (gate code, parking, etc.).
      const notes = isPrivateBooking
        ? [
            form?.location ? `Customer location: ${form.location}` : null,
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

  const NAV=[{id:"home",l:"Home"},{id:"explore",l:"Explore"},{id:"credits",l:"Pass"},{id:"profile",l:"Profile"},{id:"biz-portal",l:"Business"}];

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
              {[{id:"explore",l:"Explore"},{id:"credits",l:"Pass"},{id:"biz-portal",l:"Business"},{id:"profile",l:"Profile"},{id:"partners",l:"For partners"}].map(n=>(
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
          {view==="profile"    &&<ProfilePage bookings={bookings} savedIds={saved} listings={listings} credits={credits} onSelect={onSelect} onSetView={setView} isBiz={isBiz} onToggleBiz={()=>setIsBiz(v=>!v)} onPreviewDashboard={()=>setBizPreview(true)} profile={profile} authSession={authSession} onSignOut={doSignOut} onOpenSignIn={()=>setAuthModal({mode:"signin"})} bookingsVersion={bookingsVersion} onSaveInterests={saveInterests}/>}
          {view==="biz-portal" &&<BusinessPortal onSetView={setView}/>}
          {view==="credits"    &&<CreditsPage credits={credits} listings={listings}/>}
          {view==="about"      &&<AboutPage onSetView={setView}/>}
          {view==="partners"   &&<PartnersPage onSetView={setView}/>}
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
              <a onClick={()=>setShowTerms(true)} style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#43483F",cursor:"pointer",opacity:0.8,textDecoration:"none",transition:"opacity .15s"}} onMouseEnter={e=>e.target.style.opacity="1"} onMouseLeave={e=>e.target.style.opacity="0.8"}>Terms</a>
              <a onClick={()=>setShowContact(true)} style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#43483F",cursor:"pointer",opacity:0.8,textDecoration:"none",transition:"opacity .15s"}} onMouseEnter={e=>e.target.style.opacity="1"} onMouseLeave={e=>e.target.style.opacity="0.8"}>Contact</a>
            </div>
            <div>
              <button style={{width:40,height:40,borderRadius:"50%",border:"1px solid rgba(195,200,188,0.4)",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,transition:"background .15s"}}
                onMouseEnter={e=>e.target.style.background="#F0EEE9"} onMouseLeave={e=>e.target.style.background="transparent"}>🌐</button>
            </div>
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

      {/* TERMS MODAL */}
      {showTerms&&(
        <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(27,28,25,0.75)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowTerms(false)}>
          <div style={{background:"#fff",borderRadius:20,maxWidth:600,width:"100%",padding:"36px 32px",boxShadow:"0 32px 80px rgba(0,0,0,0.22)",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <h2 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:22,fontWeight:700,color:"#213C18",margin:0}}>Terms of Use</h2>
              <button onClick={()=>setShowTerms(false)} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:"#54584F"}}>×</button>
            </div>
            <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,color:"#A3B18A",margin:"0 0 24px"}}>Last updated: April 2026 · Wello (wello-wellness.com)</p>
            {[
              ["About Wello", "Wello is a wellness marketplace that allows members to purchase credits and use them to book classes, gym access, spa treatments and outdoor experiences with partner venues in Mallorca. By using Wello you agree to these terms."],
              ["Credits", "Wello credits are purchased in advance at a rate of 1 credit = £1/€1. Credits are valid for 6 months from the date of purchase. Credits are non-refundable once purchased except in the case of platform error. Credits have no cash value and cannot be transferred between accounts."],
              ["Bookings", "Bookings are confirmed immediately upon credit redemption. Your credits are deducted at the time of booking, not at the time of attendance. This means credits are used whether or not you attend — please cancel in advance if you cannot make a session."],
              ["Cancellations & no-shows", "Cancellations made more than 24 hours before a session will receive a full credit refund. Cancellations within 24 hours of a session are non-refundable. No-shows forfeit the credits used. Venue partners are paid regardless of attendance."],
              ["Venue partners", "Wello acts as a marketplace connecting members with independent venue partners. Wello is not responsible for the quality, safety, availability or conduct of individual venues or their staff. Any disputes regarding a specific experience should be raised directly with the venue in the first instance, and then with Wello at hello@wello-wellness.com."],
              ["Payments", "All payments are processed securely by Stripe. Wello does not store your card details. By purchasing credits you authorise Wello to charge your payment method for the stated amount."],
              ["Account responsibility", "You are responsible for maintaining the confidentiality of your account credentials. You must not share your account with others. Wello reserves the right to suspend accounts that are used fraudulently or in breach of these terms."],
              ["Acceptable use", "Wello may only be used for personal wellness bookings. Commercial use, resale of credits, or any fraudulent use is strictly prohibited and will result in immediate account suspension."],
              ["Changes to the platform", "Wello reserves the right to modify, suspend or discontinue any part of the platform at any time. We will provide reasonable notice of material changes where possible."],
              ["Governing law", "These terms are governed by the laws of England and Wales. Any disputes will be subject to the exclusive jurisdiction of the courts of England and Wales."],
              ["Contact", "For any questions about these terms: hello@wello-wellness.com"],
            ].map(([title,body])=>(
              <div key={title} style={{marginBottom:20,paddingBottom:20,borderBottom:"1px solid #F5F3EE"}}>
                <h3 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,fontWeight:700,color:"#213C18",margin:"0 0 6px",textTransform:"uppercase",letterSpacing:"0.5px"}}>{title}</h3>
                <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#54584F",margin:0,lineHeight:1.75}}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {selBiz   &&<BizPanel biz={selBiz}        onClose={()=>setSelBiz(null)}  onBook={onBook}/>}
      {bkData   &&<BookingModal biz={bkData.biz} slot={bkData.slot} onClose={()=>setBkData(null)} onConfirm={onConfirm} credits={credits} onBuyCredits={()=>{setBkData(null);setView("credits");}} profile={profile} authSession={authSession} onOpenSignIn={()=>{setBkData(null);setAuthModal({mode:"signin"});}}/>}
      {authModal&&<AuthModal initialMode={authModal.mode} onClose={()=>setAuthModal(null)} onSuccess={()=>setAuthModal(null)}/>}
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
