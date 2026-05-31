import { supabase } from './supabase.js'
import { useState, useEffect, useCallback, useRef } from "react";

function useScrollable() {
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    function check() {
      setScrollable(document.documentElement.scrollHeight > window.innerHeight + 50);
    }
    check();
    window.addEventListener('resize', check);
    window.addEventListener('scroll', check);
    return () => { window.removeEventListener('resize', check); window.removeEventListener('scroll', check); };
  }, []);
  return scrollable;
}

function ScrollDownBtn() {
  const scrollable = useScrollable();
  if (!scrollable) return null;
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

async function ai(sys, usr, tok = 900) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: tok, system: sys, messages: [{ role: "user", content: usr }] }),
    });
    const d = await r.json();
    return d.content?.map(b => b.text || "").join("") || "";
  } catch { return ""; }
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
  stone:   "#74796E",   // Outline
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
const CATS = ["All","Yoga","Pilates","Surfing","Paddle Boarding","Kayaking","Cycling","Running","Hiking","Hotel Gym","Pool Access","Fitness Class","HIIT","Crossfit","Tennis","Padel","Horse Riding","Meditation","Sound Healing","Massage & Spa","Cold Water Therapy","Breathwork","Nutrition & Wellness","Dance","Martial Arts","Other"];
const LOCS = ["All Mallorca","Palma","Sóller","Deià","Pollença","Alcúdia","Santanyí","Valldemossa"];
const SYNC = {1:"Mindbody",2:"Acuity",3:"Acuity",4:"FareHarbor",5:"Custom API",6:"Mindbody",7:"Gympass",8:"iCal",9:"Custom API"};

const LISTINGS = [
  { id:1, name:"Calma Studio", cat:"Yoga", loc:"Sóller", rating:4.9, reviews:127, cr:20,
    desc:"Rooftop yoga overlooking the Tramuntana mountains. Sunrise & sunset sessions with certified instructors.",
    img:"https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80",
    tags:["Rooftop","All Levels","Mountain Views"],
    slots:[{id:"s1",date:"2026-03-22",time:"07:00",dur:"75 min",spots:8,booked:3,name:"Sunrise Flow"},{id:"s2",date:"2026-03-22",time:"18:30",dur:"90 min",spots:10,booked:7,name:"Sunset Vinyasa"},{id:"s3",date:"2026-03-23",time:"07:00",dur:"75 min",spots:8,booked:1,name:"Sunrise Flow"}] },
  { id:2, name:"Casa Blava Wellness", cat:"Hotel Gym", loc:"Palma", rating:4.8, reviews:64, cr:40,
    desc:"Five-star hotel fitness centre with heated infinity pool and panoramic sea views. Day passes available.",
    img:"https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=600&q=80",
    tags:["5-Star","Infinity Pool","Sea Views"],
    slots:[{id:"s5",date:"2026-03-22",time:"06:30",dur:"Open",spots:15,booked:5,name:"Gym & Pool Pass"},{id:"s6",date:"2026-03-22",time:"16:00",dur:"Open",spots:15,booked:9,name:"Afternoon Access"},{id:"s7",date:"2026-03-23",time:"06:30",dur:"Open",spots:15,booked:2,name:"Gym & Pool Pass"}] },
  { id:3, name:"Serra Pilates", cat:"Pilates", loc:"Valldemossa", rating:5.0, reviews:43, cr:20,
    desc:"Reformer and mat Pilates inside a restored 18th-century farmhouse. Small groups, meticulous attention.",
    img:"https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&q=80",
    tags:["Reformer","Small Groups","Historic"],
    slots:[{id:"s8",date:"2026-03-22",time:"09:00",dur:"55 min",spots:6,booked:6,name:"Reformer"},{id:"s9",date:"2026-03-22",time:"11:00",dur:"55 min",spots:6,booked:2,name:"Mat Pilates"},{id:"s10",date:"2026-03-23",time:"09:00",dur:"55 min",spots:6,booked:0,name:"Intro Reformer"}] },
  { id:4, name:"Marea Surf & Yoga", cat:"Surfing", loc:"Alcúdia", rating:4.7, reviews:89, cr:40,
    desc:"North coast beach packages — paddle out at dawn, practice yoga as the sun rises over the bay.",
    img:"https://images.unsplash.com/photo-1515016886654-94c06b8a8c7d?w=600&q=80",
    tags:["Beach","Surf","Full Experience"],
    slots:[{id:"s12",date:"2026-03-22",time:"08:00",dur:"Half Day",spots:8,booked:5,name:"Surf + Yoga"},{id:"s13",date:"2026-03-23",time:"08:00",dur:"Half Day",spots:8,booked:1,name:"Surf + Yoga"}] },
  { id:5, name:"Mirador Pool Club", cat:"Pool Access", loc:"Palma", rating:4.9, reviews:52, cr:40,
    desc:"Fortress hotel — infinity pool carved into the cliffs, spa circuit and breathwork sessions. Extraordinary luxury.",
    img:"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=80",
    tags:["Luxury","Cliff Pool","Spa"],
    slots:[{id:"s15",date:"2026-03-22",time:"10:00",dur:"Full Day",spots:6,booked:2,name:"Pool & Spa Day"},{id:"s16",date:"2026-03-23",time:"10:00",dur:"Full Day",spots:6,booked:0,name:"Pool & Spa Day"}] },
  { id:6, name:"Olivera Yoga", cat:"Yoga", loc:"Deià", rating:4.8, reviews:71, cr:20,
    desc:"Open-air platform in the artist village of Deià. Iyengar practice surrounded by ancient olive groves.",
    img:"https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=600&q=80",
    tags:["Outdoor","Iyengar","Olive Groves"],
    slots:[{id:"s18",date:"2026-03-22",time:"08:30",dur:"90 min",spots:10,booked:8,name:"Iyengar Morning"},{id:"s19",date:"2026-03-22",time:"17:00",dur:"90 min",spots:10,booked:4,name:"Restorative Evening"}] },
  { id:7, name:"Nord Fitness", cat:"Fitness Class", loc:"Pollença", rating:4.6, reviews:110, cr:15,
    desc:"High-intensity training in a converted mill. 45-minute sessions, expert coaching, maximum results.",
    img:"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=80",
    tags:["HIIT","Small Groups","Expert Coaches"],
    slots:[{id:"s21",date:"2026-03-22",time:"07:30",dur:"45 min",spots:14,booked:10,name:"HIIT Express"},{id:"s22",date:"2026-03-22",time:"12:00",dur:"45 min",spots:14,booked:6,name:"Lunchtime"},{id:"s24",date:"2026-03-23",time:"07:30",dur:"45 min",spots:14,booked:4,name:"HIIT Express"}] },
  { id:8, name:"Caleta Meditation", cat:"Meditation", loc:"Santanyí", rating:5.0, reviews:38, cr:15,
    desc:"Cliffside meditation and breathwork with the Mediterranean as your backdrop. Intimate and transformative.",
    img:"https://images.unsplash.com/photo-1593811167562-9cef47bfc4d7?w=600&q=80",
    tags:["Cliffside","Breathwork","Sea Views"],
    slots:[{id:"s25",date:"2026-03-22",time:"06:00",dur:"60 min",spots:8,booked:5,name:"Dawn Breathwork"},{id:"s26",date:"2026-03-22",time:"19:30",dur:"60 min",spots:8,booked:2,name:"Sunset Meditation"}] },
  { id:9, name:"Palau Pool Club", cat:"Pool Access", loc:"Palma", rating:4.7, reviews:93, cr:25,
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

// ─── Booking Modal ────────────────────────────────────────────────────────────
function BookingModal({ biz, slot, onClose, onConfirm, credits, onBuyCredits }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  const [step, setSt] = useState(1);
  const [myName, setMyName] = useState("");
  const [myEmail, setMyEmail] = useState("");
  const [guests, setGuests] = useState([]); // [{type:"friend"|"new", id, name, email}]
  const [newEmail, setNewEmail] = useState("");
  const avail = slot.spots - slot.booked;
  const totalPeople = 1 + guests.length;
  const cost = biz.cr * totalPeople;
  const canAfford = credits >= cost;
  const canAddMore = totalPeople < avail;

  const FRIENDS_LIST = [
    { id:1, init:"AK", name:"Anna K.",   email:"anna@example.com" },
    { id:2, init:"MT", name:"Marcus T.", email:"marcus@example.com" },
    { id:3, init:"LM", name:"Léa M.",    email:"lea@example.com" },
  ];

  function addFriend(f) {
    if (guests.find(g=>g.id===f.id)) return;
    if (!canAddMore) return;
    setGuests(p=>[...p, {type:"friend", id:f.id, name:f.name, email:f.email}]);
  }

  function addNewGuest() {
    if (!newEmail.trim() || !canAddMore) return;
    setGuests(p=>[...p, {type:"new", id:Date.now(), name:newEmail, email:newEmail}]);
    setNewEmail("");
  }

  function removeGuest(id) {
    setGuests(p=>p.filter(g=>g.id!==id));
  }

  return (
    <div style={{position:"fixed",inset:0,zIndex:1200,background:"rgba(27,28,25,0.75)",backdropFilter:"blur(6px)",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:0}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",maxWidth:480,width:"100%",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 -8px 40px rgba(0,0,0,0.22)",animation:"slideUp .3s ease"}} onClick={e=>e.stopPropagation()}>

        {step===1&&(
          <>
            {/* Header */}
            <div style={{background:"#213C18",padding:"20px 24px",position:"relative"}}>
              <button onClick={onClose} style={{position:"absolute",top:14,right:14,background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",width:28,height:28,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
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
                  <p style={{fontFamily:F2,fontSize:9,color:"#74796E",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 2px"}}>Your balance</p>
                  <p style={{fontFamily:F2,fontSize:18,fontWeight:800,color:"#213C18",margin:0,letterSpacing:"-0.5px"}}>◈ {credits}</p>
                </div>
                {!canAfford
                  ? <button onClick={onBuyCredits} style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"8px 16px",fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer"}}>Add Credits</button>
                  : <p style={{fontFamily:F2,fontSize:12,color:"#74796E",margin:0}}>◈ {credits-cost} remaining</p>
                }
              </div>

              {/* Your details */}
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1px",textTransform:"uppercase",margin:"0 0 10px"}}>Your details</p>
              <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
                {[{l:"Name",v:myName,set:setMyName,p:"Your full name"},{l:"Email",v:myEmail,set:setMyEmail,p:"you@example.com",t:"email"}].map(f=>(
                  <div key={f.l}>
                    <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#74796E",display:"block",marginBottom:4}}>{f.l}</label>
                    <input type={f.t||"text"} placeholder={f.p} value={f.v} onChange={e=>f.set(e.target.value)}
                      style={{width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"10px 14px",fontFamily:F2,fontSize:14,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",transition:"border-color .15s"}}
                      onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                  </div>
                ))}
              </div>

              {/* Add friends */}
              <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1px",textTransform:"uppercase",margin:"0 0 10px"}}>Bring friends <span style={{fontFamily:F2,fontSize:10,color:"#74796E",fontWeight:400,letterSpacing:0,textTransform:"none"}}>— optional</span></p>

              {/* Friends list */}
              <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                {FRIENDS_LIST.map(f=>{
                  const added = guests.find(g=>g.id===f.id);
                  return (
                    <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:added?"rgba(33,60,24,0.06)":"#F5F3EE",borderRadius:10,border:added?"1px solid rgba(33,60,24,0.15)":"1px solid transparent",transition:"all .15s"}}>
                      <div style={{width:32,height:32,borderRadius:"50%",background:"#213C18",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F2,fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}}>{f.init}</div>
                      <div style={{flex:1}}>
                        <p style={{fontFamily:F2,fontSize:13,fontWeight:600,color:"#1B1C19",margin:0}}>{f.name}</p>
                        <p style={{fontFamily:F2,fontSize:11,color:"#74796E",margin:0}}>{f.email}</p>
                      </div>
                      <button onClick={()=>added?removeGuest(f.id):addFriend(f)}
                        style={{width:28,height:28,borderRadius:"50%",border:"none",background:added?"#213C18":"rgba(33,60,24,0.1)",color:added?"#fff":"#213C18",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,transition:"all .15s"}}>
                        {added?"−":"+"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add by email */}
              <div style={{display:"flex",gap:8,marginBottom:20}}>
                <input type="email" placeholder="Friend's email address" value={newEmail} onChange={e=>setNewEmail(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addNewGuest()}
                  style={{flex:1,border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"10px 14px",fontFamily:F2,fontSize:13,color:"#1B1C19",outline:"none",background:"#FBF9F4",transition:"border-color .15s"}}
                  onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                <button onClick={addNewGuest} disabled={!newEmail.trim()||!canAddMore}
                  style={{padding:"10px 16px",background:newEmail.trim()&&canAddMore?"#213C18":"#E4E2DD",color:newEmail.trim()&&canAddMore?"#fff":"#74796E",border:"none",borderRadius:8,fontFamily:F2,fontSize:13,fontWeight:700,cursor:newEmail.trim()&&canAddMore?"pointer":"not-allowed",transition:"all .15s",whiteSpace:"nowrap"}}>
                  + Add
                </button>
              </div>

              {/* Added guests list */}
              {guests.length>0&&(
                <div style={{background:"#F5F3EE",borderRadius:10,padding:"10px 14px",marginBottom:16}}>
                  <p style={{fontFamily:F2,fontSize:10,color:"#74796E",fontWeight:600,margin:"0 0 8px",letterSpacing:"1px",textTransform:"uppercase"}}>Booking for {totalPeople} people</p>
                  {guests.filter(g=>g.type==="new").map(g=>(
                    <div key={g.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <p style={{fontFamily:F2,fontSize:12,color:"#1B1C19",margin:0}}>📧 {g.email} <span style={{color:"#74796E",fontSize:11}}>(invite will be sent)</span></p>
                      <button onClick={()=>removeGuest(g.id)} style={{background:"transparent",border:"none",color:"#74796E",cursor:"pointer",fontSize:16}}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Order summary */}
              <div style={{background:"#F5F3EE",borderRadius:10,padding:"12px 14px",marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontFamily:F2,fontSize:13,color:"#74796E"}}>{totalPeople} × ◈ {biz.cr} credits</span>
                  <span style={{fontFamily:F2,fontSize:13,fontWeight:700,color:"#213C18"}}>◈ {cost}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid rgba(195,200,188,0.3)",paddingTop:6}}>
                  <span style={{fontFamily:F2,fontSize:13,color:"#74796E"}}>Balance after</span>
                  <span style={{fontFamily:F2,fontSize:13,fontWeight:700,color:canAfford?"#213C18":"#e05c5c"}}>{canAfford?`◈ ${credits-cost}`:"Insufficient credits"}</span>
                </div>
              </div>

              <button onClick={()=>{if(myName&&myEmail&&canAfford){onConfirm({biz,slot,form:{name:myName,email:myEmail,guests:totalPeople},cost});setSt(2);}}}
                disabled={!myName||!myEmail||!canAfford}
                style={{width:"100%",padding:"16px 0",borderRadius:999,background:myName&&myEmail&&canAfford?"#213C18":"#E4E2DD",color:myName&&myEmail&&canAfford?"#fff":"#74796E",border:"none",fontFamily:F2,fontSize:15,fontWeight:700,cursor:myName&&myEmail&&canAfford?"pointer":"not-allowed",transition:"all .15s",boxShadow:myName&&myEmail&&canAfford?"0 4px 14px rgba(33,60,24,0.2)":"none"}}>
                {!canAfford?"Insufficient Credits":`Confirm · ◈ ${cost} credits`}
              </button>
            </div>
          </>
        )}

        {step===2&&(
          <div style={{padding:"48px 32px",textAlign:"center"}}>
            <div style={{width:64,height:64,background:"#CAECBA",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:28}}>✓</div>
            <h2 style={{fontFamily:F2,fontSize:22,fontWeight:700,color:"#213C18",margin:"0 0 8px",letterSpacing:"-0.5px"}}>Booking confirmed!</h2>
            <p style={{fontFamily:F2,fontSize:14,color:"#74796E",margin:"0 0 4px"}}>{slot.name} · {biz.name}</p>
            <p style={{fontFamily:F2,fontSize:13,color:"#74796E",margin:"0 0 20px"}}>{fd(slot.date)} · {slot.time}</p>
            {guests.filter(g=>g.type==="new").length>0&&(
              <div style={{background:"#F5F3EE",borderRadius:10,padding:"12px 16px",marginBottom:20,textAlign:"left"}}>
                <p style={{fontFamily:F2,fontSize:12,fontWeight:600,color:"#213C18",margin:"0 0 6px"}}>📧 Invite emails sent to:</p>
                {guests.filter(g=>g.type==="new").map(g=>(
                  <p key={g.id} style={{fontFamily:F2,fontSize:12,color:"#74796E",margin:"0 0 2px"}}>{g.email}</p>
                ))}
              </div>
            )}
            <div style={{background:"#F5F3EE",borderRadius:10,padding:"10px 16px",marginBottom:24,display:"inline-block"}}>
              <span style={{fontFamily:F2,fontSize:13,color:"#74796E"}}>◈ {cost} used · balance ◈ {credits-cost}</span>
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
  const dates = [...new Set(biz.slots.map(s=>s.date))].sort();
  const [selDate, setSel] = useState(dates[0]||null);
  const sys = SYNC[biz.id];
  const slotsForDate = biz.slots.filter(s=>s.date===selDate);

  // Build calendar — show 7 days starting from first slot date
  const allDates = dates;

  return (
    <div style={{position:"fixed",inset:0,zIndex:900,background:"rgba(27,28,25,0.6)",backdropFilter:"blur(6px)",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:"0"}} onClick={onClose}>
      <div style={{background:"#fff",borderRadius:"20px 20px 0 0",maxWidth:640,width:"100%",maxHeight:"92vh",overflow:"hidden",overflowY:"auto",boxShadow:"0 -8px 40px rgba(0,0,0,0.2)",animation:"slideUp .3s ease"}} onClick={e=>e.stopPropagation()}>

        {/* Drag handle */}
        <div style={{display:"flex",justifyContent:"center",padding:"12px 0 0"}}>
          <div style={{width:40,height:4,borderRadius:999,background:"rgba(195,200,188,0.5)"}}/>
        </div>
        {/* Hero image */}
        <div style={{position:"relative",height:200}}>
          <img src={biz.img} alt={biz.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(27,28,25,0.88) 0%,rgba(27,28,25,0.05) 55%)"}}/>
          <button onClick={onClose} style={{position:"absolute",top:14,right:14,background:"rgba(255,255,255,0.15)",backdropFilter:"blur(8px)",border:"none",color:"#fff",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
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
          <p style={{fontFamily:F2,fontSize:14,color:"#74796E",lineHeight:1.7,margin:"0 0 20px"}}>{biz.desc}</p>

          {/* Calendar date pills */}
          <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 10px"}}>Available dates</p>
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4,marginBottom:20,scrollbarWidth:"none"}}>
            {allDates.map(d=>{
              const hasSlots = biz.slots.filter(s=>s.date===d&&s.booked<s.spots).length>0;
              const isSelected = selDate===d;
              return (
                <button key={d} onClick={()=>setSel(d)}
                  style={{flexShrink:0,padding:"10px 16px",borderRadius:12,border:"none",cursor:"pointer",textAlign:"center",transition:"all .15s",
                    background:isSelected?"#213C18":hasSlots?"#F5F3EE":"#F0EDEA",
                    opacity:hasSlots?1:0.5}}>
                  <p style={{fontFamily:F2,fontSize:10,fontWeight:600,color:isSelected?"rgba(255,255,255,0.7)":"#74796E",margin:"0 0 2px",letterSpacing:"0.5px",textTransform:"uppercase"}}>
                    {new Date(d+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short"})}
                  </p>
                  <p style={{fontFamily:F2,fontSize:16,fontWeight:800,color:isSelected?"#fff":"#213C18",margin:"0 0 2px",letterSpacing:"-0.5px"}}>
                    {new Date(d+"T00:00:00").getDate()}
                  </p>
                  <p style={{fontFamily:F2,fontSize:10,color:isSelected?"rgba(255,255,255,0.6)":"#74796E",margin:0}}>
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
                  ? <p style={{fontFamily:F2,fontSize:13,color:"#74796E",padding:"20px 0",textAlign:"center"}}>No classes on this day</p>
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
                            <p style={{fontFamily:F2,fontSize:10,color:"#74796E",margin:0}}>{sl.dur}</p>
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
                              style={{padding:"10px 20px",background:full?"#E4E2DD":"#213C18",color:full?"#74796E":"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:full?"not-allowed":"pointer",transition:"all .15s",whiteSpace:"nowrap"}}
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
function Card({ biz, onSelect, syncing, saved, onToggleSave }) {
  const next = biz.slots.find(s => s.booked < s.spots);
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  return (
    <div onClick={()=>onSelect(biz)} style={{cursor:"pointer"}}>
      {/* 4:5 image */}
      <div style={{position:"relative",paddingBottom:"clamp(60%,25vw,125%)",borderRadius:12,overflow:"hidden",marginBottom:16,background:"#E4E2DD"}}>
        <img src={biz.img} alt={biz.name}
          style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",transition:"transform .7s ease"}}
          onMouseEnter={e=>e.target.style.transform="scale(1.05)"}
          onMouseLeave={e=>e.target.style.transform="scale(1)"}/>
        {/* Credit badge */}
        <div style={{position:"absolute",top:14,right:14,background:"rgba(255,255,255,0.92)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",borderRadius:999,padding:"4px 12px"}}>
          <span style={{fontFamily:F2,fontSize:11,fontWeight:800,color:"#213C18"}}>◈ {biz.cr}</span>
        </div>
        {/* Save button */}
        <button onClick={e=>{e.stopPropagation();onToggleSave(biz.id);}}
          style={{position:"absolute",top:12,left:12,width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,0.92)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:saved?"#e05c5c":"#74796e"}}>
          {saved ? "♥" : "♡"}
        </button>
        {syncing&&(
          <div style={{position:"absolute",bottom:10,left:10,display:"flex",alignItems:"center",gap:4,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(6px)",borderRadius:999,padding:"3px 8px"}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:"#4ade80",display:"inline-block"}}/>
            <span style={{fontFamily:F2,fontSize:9,color:"#fff",fontWeight:500}}>Live</span>
          </div>
        )}
      </div>
      {/* Card info */}
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
          <h3 style={{fontFamily:F2,fontSize:16,fontWeight:700,color:"#1B1C19",letterSpacing:"-0.3px",margin:0,flex:1,paddingRight:8}}>{biz.name}</h3>
          <div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
            <span style={{color:"#6F5B44",fontSize:12}}>★</span>
            <span style={{fontFamily:F2,fontSize:13,fontWeight:700}}>{biz.rating}</span>
          </div>
        </div>
        <p style={{fontFamily:F2,fontSize:13,color:"#74796E",margin:"0 0 8px",display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:11}}>📍</span> {biz.loc}
        </p>
        {/* Category tag pills */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
          <span style={{fontFamily:F2,fontSize:11,fontWeight:600,color:"#766149",background:"rgba(250,222,192,0.5)",padding:"3px 10px",borderRadius:999}}>{biz.cat}</span>
          {biz.tags?.slice(0,2).map(t=>(
            <span key={t} style={{fontFamily:F2,fontSize:11,fontWeight:500,color:"#74796E",background:"rgba(228,226,221,0.6)",padding:"3px 10px",borderRadius:999}}>{t}</span>
          ))}
        </div>
        {next
          ? <p style={{fontFamily:F2,fontSize:11,color:"#213C18",fontWeight:600,margin:0}}>{next.spots-next.booked} spots left · {next.time}</p>
          : <p style={{fontFamily:F2,fontSize:11,color:"#74796E",margin:0}}>Fully booked · check back soon</p>
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
      const sl=b.slots[Math.floor(Math.random()*b.slots.length)];
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
function HomePage({ listings, listingsLoading, bookings, onSelect, savedIds, onToggleSave, onSetView, syncingIds }) {
  const [aiQ,setAiQ]=useState(""); const [aiLoading,setAiLoading]=useState(false);
  const [aiNote,setAiNote]=useState(""); const [aiResults,setAiResults]=useState(null);
  const F2 = "'Manrope','Jost',system-ui,sans-serif";

  async function runAI() {
    if (!aiQ.trim()) return; setAiLoading(true);
    const ls=listings.map(b=>`ID:${b.id} "${b.name}" ${b.cat} ${b.loc} ◈${b.cr} tags:${b.tags.join(",")}`).join("\n");
    const r=await aiJSON(`Wellness search. Return ONLY JSON: {"ids":[1,2],"explanation":"short sentence max 12 words"}`,`Query:"${aiQ}"\nListings:\n${ls}`);
    if(r?.ids){setAiResults(listings.filter(b=>r.ids.includes(b.id)));setAiNote(r.explanation||"");}
    setAiLoading(false);
  }

  const featured = aiResults || listings.slice(0,4);

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
          <p style={{fontFamily:F2,fontSize:"clamp(12px,2vw,18px)",color:"#74796E",fontWeight:500,lineHeight:1.5,maxWidth:480,margin:"0 auto clamp(10px,2.5vw,32px)",letterSpacing:"-0.2px",padding:"0 8px"}}>
            Book yoga classes, gym access, hotel pools, spa treatments and outdoor adventures — all with one pass. No membership needed.
          </p>
          {/* AI Search bar */}
          <div style={{maxWidth:560,margin:"0 auto 8px",background:"#fff",borderRadius:999,padding:"4px 4px 4px 16px",display:"flex",alignItems:"center",boxShadow:"0 1px 12px rgba(27,28,25,0.06)",border:"1px solid rgba(195,200,188,0.3)"}}>
            <span style={{color:"#74796E",fontSize:13,marginRight:6,flexShrink:0}}>✦</span>
            <input value={aiQ} onChange={e=>setAiQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&runAI()}
              style={{flex:1,border:"none",outline:"none",fontFamily:F2,fontSize:13,background:"transparent",color:"#1B1C19",fontWeight:500,minWidth:0}}
              placeholder="Find a class, spa, gym or adventure..."/>
            {aiResults&&<button onClick={()=>{setAiResults(null);setAiQ("");setAiNote("");}}
              style={{background:"transparent",border:"none",color:"#74796E",cursor:"pointer",fontSize:13,padding:"0 6px",flexShrink:0}}>✕</button>}
            <button onClick={runAI} disabled={aiLoading||!aiQ.trim()}
              style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"10px clamp(12px,3vw,20px)",fontFamily:F2,fontSize:13,fontWeight:700,cursor:aiLoading||!aiQ.trim()?"not-allowed":"pointer",opacity:aiLoading||!aiQ.trim()?0.5:1,flexShrink:0}}>
              {aiLoading?"…":"Search"}
            </button>
          </div>
          {aiNote&&<p style={{fontFamily:F2,fontSize:11,color:"#74796E",fontStyle:"italic",margin:"0 0 16px"}}>✦ {aiNote}</p>}
          {/* CTAs */}
          <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap",marginTop:"clamp(16px,3vw,28px)"}}>
            <button onClick={()=>onSetView("credits")}
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
          {["Get your pass","Book any venue","No membership needed"].map((s,i)=>(
            <div key={s} style={{display:"flex",alignItems:"center",gap:0}}>
              <span style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,fontWeight:600,color:"#CAECBA",letterSpacing:"-0.2px",padding:"4px 10px",whiteSpace:"nowrap"}}>{s}</span>
              {i<2&&<span style={{color:"rgba(163,177,138,0.4)",fontSize:14}}>·</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURED SECTION ── */}
      <section id="featured" style={{padding:"clamp(40px,6vw,80px) clamp(16px,4vw,32px)",maxWidth:1200,margin:"0 auto"}}>
        <div style={{display:"flex",flexWrap:"wrap",alignItems:"flex-end",justifyContent:"space-between",marginBottom:"clamp(24px,4vw,48px)",gap:12}}>
          <h2 style={{fontFamily:F2,fontSize:"clamp(28px,5vw,56px)",fontWeight:700,color:"#1B1C19",letterSpacing:"-2px",margin:0,lineHeight:1}}>Featured on Wello</h2>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <p style={{fontFamily:F2,fontSize:14,color:"#74796E",maxWidth:280,lineHeight:1.6,margin:0,display:"none"}}>Hand-picked spaces and experiences.</p>
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
                  <div style={{paddingBottom:"125%",borderRadius:12,background:"linear-gradient(90deg,#E4E2DD 25%,#EAE8E3 50%,#E4E2DD 75%)",backgroundSize:"200% 100%",animation:"shimmer 1.5s infinite",marginBottom:12}}/>
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

      {/* ── LOCAL FIRST · TRANSPARENT TRUST STRIP ── */}
      <section style={{padding:"clamp(32px,5vw,64px) clamp(16px,4vw,32px)",background:"#F5F3EE",borderBottom:"1px solid rgba(195,200,188,0.3)"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:"clamp(24px,3vw,40px)"}}>
            <span style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:10,fontWeight:700,letterSpacing:"4px",textTransform:"uppercase",color:"#74796E",display:"block",marginBottom:10}}>Why Wello</span>
            <h2 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:"clamp(22px,3.5vw,38px)",fontWeight:800,color:"#213C18",letterSpacing:"-1.5px",margin:"0 0 10px",lineHeight:1.1}}>Mallorca's wellness community.</h2>
            <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:14,color:"#74796E",margin:"0 auto",maxWidth:520,lineHeight:1.7}}>We're a local platform built for Mallorca's wellness & fitness community.</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:16}}>
            {[

              {icon:"📍",title:"Mallorca first",body:"Every venue on Wello is handpicked and locally verified. Quality over quantity."},
              {icon:"🤝",title:"Built with venues in mind",body:"We strive to be fair in our practice with venues and welcome two-way feedback on how Wello can best serve the island's wellness community."},
              {icon:"📊",title:"Transparent earnings",body:"Venues see exactly what they earn per booking. No surprises, no hidden calculations."},
            ].map(({icon,title,body})=>(
              <div key={title} style={{background:"#fff",borderRadius:16,padding:"clamp(18px,2.5vw,28px)"}}>
                <div style={{width:40,height:40,background:"rgba(33,60,24,0.07)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,marginBottom:14}}>{icon}</div>
                <h3 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:15,fontWeight:700,color:"#213C18",margin:"0 0 8px",letterSpacing:"-0.3px"}}>{title}</h3>
                <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#74796E",margin:0,lineHeight:1.7}}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{padding:"clamp(40px,6vw,80px) clamp(16px,4vw,32px) clamp(80px,10vw,80px)",background:"#F5F3EE"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:"clamp(28px,4vw,48px)"}}>
            <h2 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:"clamp(24px,4vw,44px)",fontWeight:700,color:"#213C18",letterSpacing:"-1.5px",margin:"0 0 10px",lineHeight:1.1}}>How Wello works</h2>
            <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:15,color:"#74796E",margin:0}}>Three steps to your next wellness experience.</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))",gap:16}}>
            {[
              {n:"01",icon:"◈",title:"Buy your pass",desc:"Choose how many credits you want. Load them onto your Wello pass — no subscription, no commitment."},
              {n:"02",icon:"⊞",title:"Browse & book",desc:"Explore studios, gyms, hotel pools, spas and outdoor adventures. Book any slot in seconds."},
              {n:"03",icon:"✓",title:"Walk in ready",desc:"Show your booking confirmation at the venue and enjoy. Credits are deducted automatically."},
            ].map(({n,icon,title,desc})=>(
              <div key={n} style={{background:"#fff",borderRadius:16,padding:"clamp(20px,3vw,32px)",position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:16,right:20,fontFamily:"'Manrope',system-ui,sans-serif",fontSize:40,fontWeight:800,color:"rgba(33,60,24,0.05)",lineHeight:1}}>{n}</div>
                <div style={{width:44,height:44,background:"rgba(33,60,24,0.08)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,marginBottom:16,color:"#213C18"}}>{icon}</div>
                <h3 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:17,fontWeight:700,color:"#213C18",margin:"0 0 8px",letterSpacing:"-0.3px"}}>{title}</h3>
                <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#74796E",margin:0,lineHeight:1.7}}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE: EXPLORE
// ═══════════════════════════════════════════════════════════════
function ExplorePage({ listings, onSelect, savedIds, onToggleSave, syncingIds }) {
  const [search,setSearch]=useState("");
  const [activeCat,setActiveCat]=useState("All");
  const [activeLoc,setActiveLoc]=useState("All Mallorca");
  const [viewMode,setViewMode]=useState("grid");
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  
  // Venue coordinates for map
  const COORDS = {
    "Calma Studio":         [39.7697, 2.7149],
    "Casa Blava Wellness":       [39.5697, 2.6200],
    "Serra Pilates":      [39.7079, 2.6151],
    "Marea Surf & Yoga":     [39.8567, 3.1201],
    "Mirador Pool Club":   [39.5201, 2.6891],
    "Olivera Yoga":   [39.7482, 2.6489],
    "Nord Fitness":    [39.8782, 3.0162],
    "Caleta Meditation":[39.3574, 3.1287],
    "Palau Pool Club": [39.5697, 2.6501],
  };
  const filtered=listings.filter(b=>{
    const mC=activeCat==="All"||b.cat===activeCat;
    const mL=activeLoc==="All Mallorca"||b.loc===activeLoc;
    const mS=!search||b.name.toLowerCase().includes(search.toLowerCase())||b.loc.toLowerCase().includes(search.toLowerCase())||b.cat.toLowerCase().includes(search.toLowerCase());
    return mC&&mL&&mS;
  });

  return (
    <div style={{paddingTop:24,paddingBottom:"calc(100px + env(safe-area-inset-bottom))"}}>
      {/* Header */}
      <div style={{maxWidth:1200,margin:"0 auto",padding:"0 clamp(16px,4vw,32px) 0"}}>
        <div style={{display:"flex",flexWrap:"wrap",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20,gap:10}}>
          <div>
            <span style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#6F5B44",letterSpacing:"4px",textTransform:"uppercase",display:"block",marginBottom:8}}>Curated Sanctuary</span>
            <h1 style={{fontFamily:F2,fontSize:"clamp(28px,4vw,44px)",fontWeight:800,color:"#213C18",letterSpacing:"-2px",margin:0,lineHeight:1}}>Find your flow.</h1>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:"#4ade80",display:"inline-block"}}/>
              <span style={{fontFamily:F2,fontSize:13,color:"#74796E",fontWeight:500}}>{filtered.length} experiences · Live sync</span>
            </div>
            <div style={{display:"flex",background:"#EAE8E3",borderRadius:999,padding:3,gap:2}}>
              {[["grid","⊞ Grid"],["map","📍 Map"]].map(([mode,label])=>(
                <button key={mode} onClick={()=>setViewMode(mode)}
                  style={{padding:"5px 12px",borderRadius:999,border:"none",fontFamily:F2,fontSize:11,fontWeight:600,cursor:"pointer",transition:"all .15s",
                    background:viewMode===mode?"#213C18":"transparent",
                    color:viewMode===mode?"#fff":"#74796E"}}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky filter bar */}
      <div style={{position:"sticky",top:91,zIndex:40,background:"rgba(251,249,244,0.97)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderBottom:"1px solid rgba(195,200,188,0.2)",padding:"10px clamp(12px,3vw,32px)"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          {/* Category pills */}
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:8,scrollbarWidth:"none",alignItems:"center"}}>
            {CATS.slice(0,14).map(c=>(
              <button key={c} onClick={()=>setActiveCat(c)}
                style={{padding:"8px 18px",borderRadius:999,border:"none",fontFamily:F2,fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s",flexShrink:0,
                  background:activeCat===c?"#213C18":"#EAE8E3",
                  color:activeCat===c?"#fff":"#43483F"}}>
                {c}
              </button>
            ))}
            <div style={{marginLeft:"auto",flexShrink:0,display:"flex",alignItems:"center",gap:8,background:"#F0EEE9",borderRadius:999,padding:"8px 16px"}}>
              <span style={{color:"#74796E",fontSize:14}}>⌕</span>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                style={{border:"none",outline:"none",fontFamily:F2,fontSize:13,background:"transparent",color:"#1B1C19",width:"clamp(60px,20vw,140px)"}}
                placeholder="Search..."/>
              {search&&<button onClick={()=>setSearch("")} style={{background:"transparent",border:"none",cursor:"pointer",color:"#74796E",fontSize:12}}>✕</button>}
            </div>
          </div>
          {/* Location pills */}
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingTop:8,scrollbarWidth:"none"}}>
            {LOCS.map(l=>(
              <button key={l} onClick={()=>setActiveLoc(l)}
                style={{padding:"5px 14px",borderRadius:999,fontFamily:F2,fontSize:11,fontWeight:500,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s",flexShrink:0,
                  background:activeLoc===l?"#213C18":"transparent",
                  color:activeLoc===l?"#fff":"#74796E",
                  border:activeLoc===l?"1px solid #213C18":"1px solid rgba(195,200,188,0.5)"}}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{maxWidth:1200,margin:"24px auto 0",padding:"0 clamp(16px,4vw,32px)"}}>
        {viewMode==="grid"&&filtered.length===0
          ? <div style={{textAlign:"center",padding:"96px 20px"}}>
              <div style={{fontSize:36,marginBottom:12,color:"#C3C8BC"}}>∅</div>
              <h3 style={{fontFamily:F2,fontSize:20,color:"#213C18",fontWeight:700,marginBottom:8}}>No results</h3>
              <p style={{fontFamily:F2,color:"#74796E",fontSize:14}}>Try adjusting your filters</p>
            </div>
          : viewMode==="grid"
            ? <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,200px),1fr))",gap:"clamp(12px,2vw,24px)"}}>
                {filtered.map(b=><Card key={b.id} biz={b} onSelect={onSelect} syncing={!!syncingIds[b.id]} saved={savedIds.includes(b.id)} onToggleSave={onToggleSave}/>)}
              </div>
            : null
        }
        {filtered.length>8&&viewMode==="grid"&&(
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
                      <p style={{fontFamily:F2,fontSize:10,color:"#74796E",margin:0}}>📍 {b.loc} · ◈ {b.cr}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE: PROFILE
// ═══════════════════════════════════════════════════════════════
function ProfilePage({ bookings, savedIds, listings, credits, onSelect, onSetView, isBiz, onToggleBiz }) {
  const [tab,setTab]=useState("reservations");
  const saved=listings.filter(b=>savedIds.includes(b.id));
  const [friends]=useState(FRIENDS);
  const TABS=[["reservations","Reservations"],["saved","Saved"],["friends","Friends"],["settings","Settings"]];
  const F2="'Manrope','Jost',system-ui,sans-serif";

  return (
    <div style={{paddingTop:24,paddingBottom:"calc(100px + env(safe-area-inset-bottom))"}}>
      <div style={{maxWidth:1200,margin:"0 auto",padding:"0 clamp(16px,4vw,32px)"}}>

        {/* Hero profile header — mobile-first layout */}
        <header style={{marginBottom:32,paddingTop:12}}>
          {/* Top row: avatar + name + button */}
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
            <div style={{position:"relative",flexShrink:0}}>
              <div style={{width:64,height:64,borderRadius:12,overflow:"hidden",background:"#213C18",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontFamily:F2,fontSize:28,fontWeight:800,color:"#fff"}}>J</span>
              </div>
              <button style={{position:"absolute",bottom:-8,right:-8,background:"#213C18",color:"#fff",border:"none",width:24,height:24,borderRadius:"50%",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,boxShadow:"0 4px 12px rgba(0,0,0,0.15)"}}>✏</button>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                <h1 style={{fontFamily:F2,fontSize:"clamp(20px,4vw,44px)",fontWeight:800,color:"#213C18",letterSpacing:"-1px",margin:0,whiteSpace:"nowrap"}}>Jane Smith</h1>
                <span style={{background:"#FADEC0",color:"#766149",padding:"3px 10px",borderRadius:999,fontSize:10,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",flexShrink:0}}>Member</span>
              </div>
              <p style={{fontFamily:F2,fontSize:13,color:"#74796E",margin:0,lineHeight:1.4}}>Exploring wellness across the island.</p>
            </div>
            <button onClick={()=>onSetView("credits")}
              style={{flexShrink:0,background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"10px 16px",fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 14px rgba(33,60,24,0.25)",whiteSpace:"nowrap"}}>
              + Credits
            </button>
          </div>
          {/* Stats row */}
          <div style={{display:"flex",gap:16,flexWrap:"wrap",background:"#F5F3EE",borderRadius:12,padding:"12px 16px"}}>
            {[["📍","Mallorca"],["◈",`${credits} credits`],["📅",`${bookings.length} bookings`]].map(([icon,val])=>(
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
              style={{fontFamily:F2,fontSize:14,fontWeight:tab===k?700:500,color:tab===k?"#213C18":"#74796E",background:"transparent",border:"none",borderBottom:tab===k?"2px solid #213C18":"2px solid transparent",padding:"0 4px 16px",cursor:"pointer",marginRight:32,marginBottom:-1,whiteSpace:"nowrap",transition:"all .15s"}}>
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
                          <p style={{fontFamily:F2,fontSize:13,color:"#74796E",margin:"0 0 4px"}}>📅 {fd(bk.slot.date)} · {bk.slot.time}</p>
                          <p style={{fontFamily:F2,fontSize:13,color:"#74796E",margin:0}}>📍 {bk.biz.name}, {bk.biz.loc}</p>
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
                <p style={{fontFamily:F2,color:"#74796E",marginBottom:20,fontSize:14}}>Tap ♡ on any listing to save it</p>
                <button onClick={()=>onSetView("explore")} style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"12px 28px",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer"}}>Explore</button>
              </div>
            : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(45%,200px),1fr))",gap:16}}>
                {saved.map(b=>(
                  <div key={b.id} style={{cursor:"pointer"}} onClick={()=>onSelect(b)}>
                    <div style={{borderRadius:12,overflow:"hidden",marginBottom:12,aspectRatio:"4/5",background:"#E4E2DD"}}>
                      <img src={b.img} alt={b.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    </div>
                    <h3 style={{fontFamily:F2,fontSize:14,fontWeight:700,color:"#213C18",margin:"0 0 4px"}}>{b.name}</h3>
                    <p style={{fontFamily:F2,fontSize:12,color:"#74796E",margin:0}}>📍 {b.loc}</p>
                  </div>
                ))}
              </div>
        )}

        {/* Friends */}
        {tab==="friends"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <span style={{fontFamily:F2,fontSize:14,color:"#74796E"}}>{friends.length} friends</span>
              <button style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"8px 18px",fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Invite</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {friends.map(f=>(
                <div key={f.id} style={{display:"flex",alignItems:"center",gap:14,padding:"16px 20px",background:"#F5F3EE",borderRadius:12,transition:"background .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#EAE8E3"}
                  onMouseLeave={e=>e.currentTarget.style.background="#F5F3EE"}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:"#E4E2DD",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F2,fontSize:12,fontWeight:700,color:"#74796E",flexShrink:0}}>{f.init}</div>
                  <div style={{flex:1}}>
                    <p style={{fontFamily:F2,fontSize:14,fontWeight:600,color:"#1B1C19",margin:"0 0 2px"}}>{f.name}</p>
                    <p style={{fontFamily:F2,fontSize:12,color:"#74796E",margin:0}}>📍 {f.loc} · {f.bio}</p>
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
                      <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#74796E",display:"block",marginBottom:6}}>{f.l}</label>
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
                    <p style={{fontFamily:F2,fontSize:12,color:"#74796E",margin:0}}>Enable to list your venue, manage bookings and access your business dashboard.</p>
                  </div>
                  <div onClick={onToggleBiz} style={{width:44,height:24,borderRadius:999,background:isBiz?"#213C18":"#E4E2DD",cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
                    <div style={{position:"absolute",top:2,left:isBiz?22:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
                  </div>
                </div>
                {isBiz&&<button onClick={()=>onSetView("business")} style={{background:"#FADEC0",color:"#766149",border:"none",borderRadius:999,padding:"8px 18px",fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer"}}>Manage Business →</button>}
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
                <div style={{padding:"14px 20px",borderBottom:"1px solid rgba(195,200,188,0.2)"}}><span style={{fontFamily:F2,fontSize:11,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#74796E"}}>{s.title}</span></div>
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
              <div style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"3px",textTransform:"uppercase",color:"#74796E",marginBottom:12}}>Discover more</div>
              <h4 style={{fontFamily:F2,fontSize:"clamp(18px,3vw,22px)",fontWeight:700,color:"#213C18",margin:"0 0 10px"}}>Recommended for you</h4>
              <p style={{fontFamily:F2,fontSize:13,color:"#74796E",maxWidth:320,margin:"0 0 20px",lineHeight:1.6}}>Discover new experiences based on what you've enjoyed.</p>
              <button onClick={()=>onSetView("explore")}
                style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"12px 24px",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
                Explore →
              </button>
            </div>
            <div style={{position:"absolute",right:-40,bottom:-40,width:200,height:200,borderRadius:"50%",background:"rgba(33,60,24,0.06)"}}/>
          </div>
        </div>
      </div>
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
        Wello Marketplace S.L.<br>Palma de Mallorca, Balearic Islands<br>hola@wello.es
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
    invoice please contact hola@wello.es quoting invoice number ${invoiceNo}.
  </div>

  <button onclick="window.print()" style="padding:10px 22px;background:#4E6B43;color:#fff;border:none;border-radius:2px;font-family:'Jost',system-ui,sans-serif;font-size:12px;font-weight:600;cursor:pointer;letter-spacing:.4px;">
    Save as PDF (Print → Save as PDF)
  </button>
  </body></html>`);
  win.document.close();
}

// ═══════════════════════════════════════════════════════════════
// PAGE: BUSINESS  (full registration + dashboard)
// ═══════════════════════════════════════════════════════════════
// ── Extracted to avoid re-mount on every keystroke ──────────────
function RegStepBar({ regStep, steps }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:0,marginBottom:28,overflowX:"auto",paddingBottom:2}}>
      {steps.map((label,i)=>{
        const n=i+1, done=regStep>n, active=regStep===n;
        return (
          <div key={n} style={{display:"flex",alignItems:"center",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:22,height:22,borderRadius:"50%",background:done?T.sage:active?T.sage:T.border,color:done||active?"#fff":T.stone2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontFamily:F.body,fontWeight:600,flexShrink:0,transition:"background .2s"}}>{done?"✓":n}</div>
              <span style={{fontFamily:F.body,fontSize:10,color:active?T.sage:done?T.stone:T.stone2,fontWeight:active?600:300,whiteSpace:"nowrap"}}>{label}</span>
            </div>
            {i<steps.length-1&&<div style={{width:20,height:1,background:done?T.sage:T.border,margin:"0 8px",transition:"background .2s",flexShrink:0}}/>}
          </div>
        );
      })}
    </div>
  );
}

function RegCard({ children, title, subtitle }) {
  return (
    <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,overflow:"hidden",marginBottom:14}}>
      {title&&<div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
        <div style={{fontFamily:F.body,fontSize:12,color:T.ink,fontWeight:600}}>{title}</div>
        {subtitle&&<div style={{fontFamily:F.body,fontSize:10,color:T.stone2,fontWeight:300}}>{subtitle}</div>}
      </div>}
      <div style={{padding:"16px"}}>{children}</div>
    </div>
  );
}

function BusinessPage({ isBiz, onSetView, onToggleBiz }) {
  // Registration wizard state
  const [registered, setRegistered] = useState(false);
  const [regStep, setRegStep] = useState(1); // 1–5
  const REG_STEPS = ["Your venue","Classes & photos","Availability","Calendar & integration","Payment & launch"];

  // Listing form
  const [listing, setListing] = useState({
    name:"", category:"Yoga Studio", location:"Palma", description:"", shortDesc:"",
    address:"", website:"", instagram:"", phone:"", email:"", notes:"",
    creditPrice:"2", cancellationPolicy:"24h", languages:"English, Spanish",
  });
  const [photos, setPhotos] = useState([]); // simulated photo slots
  const [photoAdded, setPhotoAdded] = useState(false);

  // Classes / slots
  const [classes, setClasses] = useState([
    { id:1, name:"", type:"", duration:"60", maxSpots:"10", credits:"2", description:"" }
  ]);

  // Availability
  const [slots, setSlots] = useState([
    { id:1, day:"Monday", time:"09:00", recurring:true, spots:"10" }
  ]);

  // Integrations
  const [connected, setConn] = useState({});
  const [keys, setKeys] = useState({});
  const [connecting, setConnecting] = useState(null);
  const [skipIntegration, setSkipIntegration] = useState(false);

  // Payment
  const [payout, setPayout] = useState({ accountName:"", iban:"", bic:"", vatNumber:"", commissionTier:"standard", commissionAccepted:false });

  // Dashboard tab (post-registration)
  const [tab, setTab] = useState("overview");
  const DASH_TABS = [["overview","Overview"],["listing","Listing"],["classes","Classes"],["availability","Availability"],["integrations","Integrations"],["payments","Payments"],["analytics","Analytics"]];

  const INP3 = {width:"100%",padding:"9px 11px",border:`1px solid ${T.border}`,borderRadius:2,fontSize:11,fontFamily:F.body,background:T.paper,color:T.ink,outline:"none",boxSizing:"border-box",transition:"border-color .18s"};
  const onF = e => e.target.style.borderColor = T.sage;
  const onB = e => e.target.style.borderColor = T.border;

  // ── Not a business account: gate ──────────────────────────────
  if (!isBiz) return (
    <div style={{maxWidth:560,margin:"0 auto",padding:"60px 28px",textAlign:"center"}}>
      <div style={{width:72,height:72,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:28}}>🏢</div>
      <h1 style={{fontFamily:F.display,fontSize:26,color:T.ink,fontWeight:400,margin:"0 0 10px"}}>List your business</h1>
      <p style={{fontFamily:F.body,color:T.stone,fontSize:13,lineHeight:1.75,margin:"0 0 8px",fontWeight:300}}>Join the island's premier wellness marketplace. Reach thousands of travellers and locals looking for exactly what you offer.</p>
      <p style={{fontFamily:F.body,color:T.stone2,fontSize:11,marginBottom:28,fontWeight:300}}>You'll need to enable a Business account first — it only takes a moment.</p>
      <div style={{display:"flex",gap:14,justifyContent:"center",flexWrap:"wrap",marginBottom:36}}>
        {[["◈","Credit-based, no monthly fee"],["⟳","Live sync with your booking system"],["✦","AI-powered listing optimisation"],["★","Reach 10,000+ monthly visitors"]].map(([icon,text])=>(
          <div key={text} style={{display:"flex",alignItems:"center",gap:8,background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,padding:"9px 13px",flex:"1 1 180px"}}>
            <span style={{fontSize:14,color:T.sage,flexShrink:0}}>{icon}</span>
            <span style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,lineHeight:1.4}}>{text}</span>
          </div>
        ))}
      </div>
      <button onClick={()=>{onToggleBiz();}} style={{padding:"11px 28px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontWeight:600,cursor:"pointer",fontSize:13,letterSpacing:".4px",display:"block",width:"100%",marginBottom:10,transition:"background .15s"}} onMouseEnter={e=>e.target.style.background=T.sage2} onMouseLeave={e=>e.target.style.background=T.sage}>
        Enable Business Account & Get Started →
      </button>
      <button onClick={()=>onSetView("home")} style={{background:"transparent",border:"none",color:T.stone2,fontFamily:F.body,fontSize:11,cursor:"pointer",fontWeight:300}}>← Back to home</button>
    </div>
  );

  // Integration connect helper
  async function connect(intg) {
    if (!keys[intg.id]?.trim()) return;
    setConnecting(intg.id);
    await new Promise(r=>setTimeout(r,1400));
    setConn(p=>({...p,[intg.id]:true}));
    setConnecting(null);
  }

  // ── Registration Interest Form ──────────────────────────────
  if (!registered) {
    const canSubmit = listing.name.trim() && listing.email.trim() && listing.phone.trim();

    async function handleSubmit() {
      const { error } = await supabase.from('businesses').insert({
        name: listing.name,
        category: listing.category,
        location: listing.location,
        email: listing.email,
        phone: listing.phone,
        notes: listing.notes || '',
        status: 'pending',
      });
      if (error) {
        console.error('Registration error:', error);
        alert('Something went wrong. Please try again or email hello@wello-wellness.com');
        return;
      }
      setRegistered(true);
    }

    return (
      <div style={{maxWidth:560,margin:"0 auto",padding:"52px 28px 80px"}}>

        {/* Header */}
        <div style={{marginBottom:32}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:2,padding:"4px 10px",marginBottom:16}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:T.sage,display:"inline-block"}}/>
            <span style={{fontFamily:F.body,fontSize:9,color:T.sage,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase"}}>For Mallorca businesses</span>
          </div>
          <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:26,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 12px"}}>Register your interest</h1>
          <p style={{fontFamily:F.body,fontSize:13,color:T.stone,fontWeight:300,lineHeight:1.75,margin:0}}>Tell us about your venue and we'll be in touch within 2 working days to discuss how Wello works and agree the right setup for you. No commitment required.</p>
        </div>

        {/* Form */}
        <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:4,padding:"24px"}}>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            <div>
              <FieldLabel>Business name *</FieldLabel>
              <input placeholder="e.g. Calma Studio" value={listing.name}
                onChange={e=>setListing(p=>({...p,name:e.target.value}))}
                style={INP3} onFocus={onF} onBlur={onB}/>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <FieldLabel>Category *</FieldLabel>
                <select value={listing.category} onChange={e=>setListing(p=>({...p,category:e.target.value}))} style={INP3}>
                  {CATS.filter(c=>c!=="All").map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Address *</FieldLabel>
                <input placeholder="e.g. Carrer de la Rosa 12, 07001 Palma" value={listing.location}
                  onChange={e=>setListing(p=>({...p,location:e.target.value}))}
                  style={INP3} onFocus={onF} onBlur={onB}/>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <FieldLabel>Email address *</FieldLabel>
                <input type="email" placeholder="hello@yourstudio.com" value={listing.email}
                  onChange={e=>setListing(p=>({...p,email:e.target.value}))}
                  style={INP3} onFocus={onF} onBlur={onB}/>
              </div>
              <div>
                <FieldLabel>Phone number *</FieldLabel>
                <input type="tel" placeholder="+34 971 000 000" value={listing.phone}
                  onChange={e=>setListing(p=>({...p,phone:e.target.value}))}
                  style={INP3} onFocus={onF} onBlur={onB}/>
              </div>
            </div>

            <div>
              <FieldLabel>Anything else you'd like us to know? <span style={{color:T.stone2,fontWeight:300}}>(optional)</span></FieldLabel>
              <textarea placeholder="e.g. we run 6 classes a week, have 20 spots per class, and would love help filling our quieter Monday mornings..."
                value={listing.notes||""}
                onChange={e=>setListing(p=>({...p,notes:e.target.value}))}
                style={{...INP3,minHeight:90,resize:"vertical"}} onFocus={onF} onBlur={onB}/>
            </div>

            <button onClick={handleSubmit} disabled={!canSubmit}
              style={{padding:"12px",background:canSubmit?T.sage:T.border,color:canSubmit?"#fff":T.stone,border:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:canSubmit?"pointer":"not-allowed",letterSpacing:".4px",transition:"background .15s",marginTop:4}}
              onMouseEnter={e=>{if(canSubmit)e.target.style.background=T.sage2}} onMouseLeave={e=>{if(canSubmit)e.target.style.background=T.sage}}>
              Register interest →
            </button>
          </div>
        </div>

        {/* Reassurance */}
        <div style={{marginTop:16,display:"flex",gap:16,flexWrap:"wrap"}}>
          {["No monthly fee","No commitment","We'll be in touch within 2 working days"].map(t=>(
            <div key={t} style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{fontSize:10,color:T.sage}}>✓</span>
              <span style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }


  // ── Post-registration: Confirmation ──────────────────────────
  return (
    <div style={{maxWidth:520,margin:"80px auto",padding:"0 28px",textAlign:"center"}}>
      <div style={{width:56,height:56,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:24}}>✓</div>
      <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:24,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 12px"}}>Thanks, we'll be in touch!</h1>
      <p style={{fontFamily:F.body,fontSize:13,color:T.stone,fontWeight:300,lineHeight:1.75,margin:"0 0 6px"}}>We've received your interest for <strong style={{color:T.ink,fontWeight:600}}>{listing.name}</strong>.</p>
      <p style={{fontFamily:F.body,fontSize:13,color:T.stone,fontWeight:300,lineHeight:1.75,margin:"0 0 28px"}}>Someone from the Wello team will be in touch within 2 working days to have a conversation about how it all works and agree the right setup for your venue.</p>
      <div style={{background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:3,padding:"16px 20px",textAlign:"left",marginBottom:24}}>
        <div style={{fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:600,marginBottom:10}}>What happens next</div>
        {["We review your registration","We call or email to introduce Wello and walk you through how it works","You receive your onboarding details and set up your full listing","Your listing goes live on the marketplace"].map((s,i)=>(
          <div key={i} style={{display:"flex",gap:10,marginBottom:8}}>
            <div style={{width:18,height:18,borderRadius:"50%",background:T.sage,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,flexShrink:0,marginTop:1}}>{i+1}</div>
            <span style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,lineHeight:1.5}}>{s}</span>
          </div>
        ))}
      </div>
      <p style={{fontFamily:F.body,fontSize:11,color:T.stone2,fontWeight:300}}>Questions? Email us at <span style={{color:T.sage}}>hola@wello.es</span></p>
    </div>
  );

}

// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// PAGE: ADD CREDITS
// ═══════════════════════════════════════════════════════════════
function CreditsPage({ credits, onPurchase, listings=[] }) {
  const [customCr, setCustomCr] = useState(10);
  const [pay, setPay]   = useState("card");
  const [step, setStep] = useState(1);
  const [card, setCard] = useState({number:"",expiry:"",cvc:"",name:""});
  const [showPricing, setShowPricing] = useState(false);
  const F2 = "'Manrope','Jost',system-ui,sans-serif";

  const fmtCard=v=>v.replace(/\D/g,"").slice(0,16).replace(/(.{4})/g,"$1 ").trim();
  const fmtExp=v=>{const d=v.replace(/\D/g,"").slice(0,4);return d.length>2?d.slice(0,2)+"/"+d.slice(2):d;};
  const expiryDate=()=>{const d=new Date();d.setMonth(d.getMonth()+6);return d.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});};
  const totalPrice = +(customCr * 1).toFixed(2);
  const serviceFee = +Math.min(totalPrice * 0.10, 5).toFixed(2);
  const grandTotal = +(totalPrice + serviceFee).toFixed(2);

  const StepBar = () => (
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:32}}>
      {[["1","Choose credits"],["2","Payment"],["3","Done"]].map(([n,l],i)=>(
        <div key={n} style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:step>=i+1?"#213C18":"#E4E2DD",color:step>=i+1?"#fff":"#74796E",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F2,fontSize:10,fontWeight:700,transition:"background .2s"}}>{step>i+1?"✓":n}</div>
            <span style={{fontFamily:F2,fontSize:12,color:step===i+1?"#213C18":"#74796E",fontWeight:step===i+1?700:400}}>{l}</span>
          </div>
          {i<2&&<div style={{width:32,height:1,background:step>i+1?"#213C18":"#E4E2DD",transition:"background .2s"}}/>}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{paddingTop:"clamp(24px,4vw,48px)",paddingBottom:"calc(100px + env(safe-area-inset-bottom))"}}>
      {step===1&&(
        <div style={{maxWidth:1100,margin:"0 auto",padding:"0 clamp(16px,4vw,32px)",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))",gap:"clamp(20px,4vw,40px)",alignItems:"start"}}>

          {/* Left column */}
          <div>
            {/* Header */}
            <div style={{marginBottom:36}}>
              <span style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"4px",textTransform:"uppercase",display:"block",marginBottom:12}}>Your Pass</span>
              <h1 style={{fontFamily:F2,fontSize:"clamp(28px,4vw,48px)",fontWeight:800,color:"#213C18",letterSpacing:"-2px",margin:"0 0 12px",lineHeight:1}}>Top Up Your Pass</h1>
              <p style={{fontFamily:F2,fontSize:16,color:"#74796E",maxWidth:440,lineHeight:1.6,margin:0}}>Load your Wello pass and use it across any studio, gym, spa or outdoor adventure.</p>
            </div>

            {/* Balance card */}
            <div style={{background:"#213C18",borderRadius:16,padding:"24px 28px",marginBottom:24,position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,borderRadius:"50%",background:"rgba(255,255,255,0.05)"}}/>
              <p style={{fontFamily:F2,fontSize:10,color:"rgba(255,255,255,0.5)",letterSpacing:"3px",textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Your balance</p>
              <p style={{fontFamily:F2,fontSize:"clamp(28px,8vw,48px)",fontWeight:800,color:"#fff",letterSpacing:"-2px",margin:"0 0 6px",lineHeight:1}}>◈ {credits}</p>
              <p style={{fontFamily:F2,fontSize:11,color:"rgba(255,255,255,0.4)",margin:0}}>10% fee included at checkout · no charges per booking</p>
            </div>

            {/* Credit counter */}
            <div style={{background:"#F5F3EE",borderRadius:16,padding:"36px",marginBottom:20,position:"relative",overflow:"hidden",textAlign:"center"}}>
              <div style={{position:"absolute",top:-30,right:-30,width:180,height:180,borderRadius:"50%",background:"rgba(33,60,24,0.04)",filter:"blur(40px)"}}/>
              <p style={{fontFamily:F2,fontSize:12,color:"#74796E",fontWeight:500,marginBottom:24,position:"relative"}}>How many credits?</p>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:28,marginBottom:28,position:"relative"}}>
                <button onClick={()=>setCustomCr(c=>Math.max(1,c-1))}
                  style={{width:"clamp(40px,10vw,52px)",height:"clamp(40px,10vw,52px)",borderRadius:"50%",background:"#fff",border:"1px solid rgba(195,200,188,0.3)",color:"#213C18",fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",transition:"transform .15s"}}
                  onMouseEnter={e=>e.target.style.transform="scale(1.05)"}
                  onMouseLeave={e=>e.target.style.transform="scale(1)"}>−</button>
                <div style={{textAlign:"center"}}>
                  <input type="number" min="1" max="200" value={customCr}
                    onChange={e=>{const v=parseInt(e.target.value);if(!isNaN(v))setCustomCr(Math.min(200,Math.max(1,v)));}}
                    style={{fontFamily:F2,fontSize:"clamp(48px,15vw,80px)",fontWeight:800,color:"#213C18",letterSpacing:"-2px",lineHeight:1,textAlign:"center",width:"clamp(100px,30vw,160px)",background:"transparent",border:"none",outline:"none"}}/>
                  <p style={{fontFamily:F2,fontSize:12,color:"rgba(33,60,24,0.5)",fontWeight:600,letterSpacing:"3px",textTransform:"uppercase",margin:0}}>Credits</p>
                </div>
                <button onClick={()=>setCustomCr(c=>Math.min(200,c+1))}
                  style={{width:"clamp(40px,10vw,52px)",height:"clamp(40px,10vw,52px)",borderRadius:"50%",background:"#213C18",border:"none",color:"#fff",fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 14px rgba(33,60,24,0.3)",transition:"transform .15s"}}
                  onMouseEnter={e=>e.target.style.transform="scale(1.05)"}
                  onMouseLeave={e=>e.target.style.transform="scale(1)"}>+</button>
              </div>
              {/* Quick add pills */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8,position:"relative"}}>
                {[1,5,10,25].map(n=>(
                  <button key={n} onClick={()=>setCustomCr(c=>Math.min(200,c+n))}
                    style={{padding:"12px 8px",borderRadius:12,border:"1px solid rgba(195,200,188,0.3)",background:n===10?"#FADEC0":"#fff",color:n===10?"#766149":"#43483F",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer",transition:"all .15s"}}
                    onMouseEnter={e=>{if(n!==10){e.target.style.background="#213C18";e.target.style.color="#fff";e.target.style.borderColor="#213C18";}}}
                    onMouseLeave={e=>{if(n!==10){e.target.style.background="#fff";e.target.style.color="#43483F";e.target.style.borderColor="rgba(195,200,188,0.3)";}}}
                  >+{n}</button>
                ))}
              </div>
            </div>

            {/* Info cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,160px),1fr))",gap:10,marginBottom:16}}>
              {[{icon:"⏱",title:"6 Month Validity",desc:"Your pass is valid for 6 months from top-up."},{icon:"◈",title:"Use Anywhere",desc:"Use across any venue, class or experience."}].map(({icon,title,desc})=>(
                <div key={title} style={{background:"rgba(228,226,221,0.5)",borderRadius:12,padding:"20px"}}>
                  <div style={{fontSize:20,marginBottom:8}}>{icon}</div>
                  <h4 style={{fontFamily:F2,fontSize:13,fontWeight:700,color:"#213C18",margin:"0 0 4px"}}>{title}</h4>
                  <p style={{fontFamily:F2,fontSize:12,color:"#74796E",margin:0,lineHeight:1.5}}>{desc}</p>
                </div>
              ))}
            </div>

            {/* Pricing toggle */}
            <div style={{background:"rgba(250,222,192,0.3)",borderRadius:12,padding:"14px 18px"}}>
              <button onClick={()=>setShowPricing(p=>!p)}
                style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",background:"transparent",border:"none",cursor:"pointer",fontFamily:F2,fontSize:13,fontWeight:600,color:"#766149",padding:0}}>
                <span>How credits work</span>
                <span>{showPricing?"↑":"↓"}</span>
              </button>
              {showPricing&&(
                <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid rgba(182,142,92,0.2)"}}>
                  {/* Three key facts */}
                  {[
                    ["◈","Credits are used to book sessions","Each listing shows its credit price upfront. No surprises at checkout."],
                    ["→","10% service fee, max £5","Added once when you purchase credits — never charged again per booking."],
                    ["◷","Valid for 6 months","Credits don't expire for 6 months from the date of purchase."],
                  ].map(([icon,title,body])=>(
                    <div key={title} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:"1px solid rgba(182,142,92,0.1)"}}>
                      <span style={{fontSize:16,flexShrink:0,marginTop:1,color:"#213C18"}}>{icon}</span>
                      <div style={{textAlign:"left"}}>
                        <p style={{fontFamily:F2,fontSize:12,fontWeight:700,color:"#1B1C19",margin:"0 0 2px"}}>{title}</p>
                        <p style={{fontFamily:F2,fontSize:11,color:"#74796E",margin:0,lineHeight:1.5}}>{body}</p>
                      </div>
                    </div>
                  ))}

                  {/* Live category price ranges from listings */}
                  {listings.length > 0 && (()=>{
                    const cats = {};
                    listings.forEach(l=>{
                      if(!cats[l.cat]) cats[l.cat] = [];
                      cats[l.cat].push(l.cr);
                    });
                    return (
                      <div style={{marginTop:12}}>
                        <p style={{fontFamily:F2,fontSize:10,fontWeight:700,color:"#74796E",textTransform:"uppercase",letterSpacing:"1.5px",margin:"0 0 8px"}}>Live prices on Wello</p>
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          {Object.entries(cats).map(([cat,crs])=>{
                            const min=Math.min(...crs), max=Math.max(...crs);
                            return (
                              <div key={cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid rgba(182,142,92,0.08)"}}>
                                <p style={{fontFamily:F2,fontSize:11,color:"#74796E",margin:0}}>{cat}</p>
                                <p style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",margin:0}}>◈{min}{min!==max?`–◈${max}`:""}</p>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{marginTop:8,display:"flex",alignItems:"center",gap:5}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:"#4ade80",display:"inline-block",flexShrink:0}}/>
                          <p style={{fontFamily:F2,fontSize:10,color:"#74796E",margin:0}}>Prices set by venues · updated in real time</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* Right — sticky order summary */}
          <div style={{position:"sticky",top:80}}>
            <div style={{background:"#fff",borderRadius:16,padding:"32px",boxShadow:"0 12px 32px rgba(27,28,25,0.06)",border:"1px solid rgba(195,200,188,0.2)"}}>
              <h3 style={{fontFamily:F2,fontSize:20,fontWeight:700,color:"#213C18",margin:"0 0 24px",letterSpacing:"-0.5px"}}>Order Summary</h3>
              <div style={{display:"flex",flexDirection:"column",gap:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",paddingBottom:12}}>
                  <div>
                    <p style={{fontFamily:F2,fontSize:13,color:"#74796E",margin:"0 0 4px"}}>Credits</p>
                    <p style={{fontFamily:F2,fontSize:14,fontWeight:600,color:"#213C18",margin:0}}>{customCr} credits</p>
                  </div>
                  <p style={{fontFamily:F2,fontSize:15,fontWeight:600,color:"#213C18",margin:0}}>€{totalPrice}</p>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:"1px solid rgba(195,200,188,0.2)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <p style={{fontFamily:F2,fontSize:13,color:"#74796E",margin:0}}>Service fee</p>
                    <span style={{fontFamily:F2,fontSize:10,color:"#A3B18A",background:"rgba(163,177,138,0.15)",padding:"2px 7px",borderRadius:999}}>10% · max €5</span>
                  </div>
                  <p style={{fontFamily:F2,fontSize:15,fontWeight:600,color:"#213C18",margin:0}}>€{serviceFee}</p>
                </div>
                <div style={{padding:"12px 0 24px",borderTop:"1px solid rgba(195,200,188,0.2)",borderBottom:"2px solid rgba(33,60,24,0.05)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                    <span style={{fontFamily:F2,fontSize:18,fontWeight:700,color:"#213C18"}}>Total due</span>
                    <div style={{textAlign:"right"}}>
                      <span style={{fontFamily:F2,fontSize:40,fontWeight:800,color:"#213C18",letterSpacing:"-2px"}}>€{grandTotal}</span>
                      <p style={{fontFamily:F2,fontSize:10,letterSpacing:"2px",textTransform:"uppercase",color:"#74796E",margin:"4px 0 0"}}>{customCr} credits · no booking fees</p>
                    </div>
                  </div>
                </div>
                <div style={{paddingTop:24}}>
                  <button onClick={()=>setStep(2)}
                    style={{width:"100%",padding:"18px 0",borderRadius:999,background:"#213C18",color:"#fff",border:"none",fontFamily:F2,fontSize:16,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:"0 4px 14px rgba(33,60,24,0.2)",transition:"transform .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.transform="scale(1.02)"}
                    onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
                    <span>Continue to Payment</span><span>→</span>
                  </button>
                  <p style={{fontFamily:F2,fontSize:12,color:"#74796E",textAlign:"center",margin:"16px 0 0",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    <span>🔒</span> Secure encrypted checkout
                  </p>
                </div>
              </div>
            </div>
            <p style={{fontFamily:F2,fontSize:12,color:"#74796E",textAlign:"center",marginTop:16}}>Credits expire on <strong style={{color:"#213C18"}}>{expiryDate()}</strong></p>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step===2&&(
        <div style={{maxWidth:520,margin:"0 auto",padding:"0 32px"}}>
          <StepBar/>
          <button onClick={()=>setStep(1)} style={{display:"flex",alignItems:"center",gap:6,background:"transparent",border:"none",color:"#74796E",fontFamily:F2,fontSize:13,cursor:"pointer",marginBottom:24,padding:0}}
            onMouseEnter={e=>e.currentTarget.style.color="#213C18"} onMouseLeave={e=>e.currentTarget.style.color="#74796E"}>← Back</button>
          <div style={{background:"#213C18",borderRadius:16,padding:"20px 24px",marginBottom:24,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",right:16,top:8,opacity:0.06,fontSize:60,color:"#fff"}}>◈</div>
            <div>
              <p style={{fontFamily:F2,fontSize:10,color:"rgba(255,255,255,0.5)",letterSpacing:"3px",textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Order summary</p>
              <p style={{fontFamily:F2,fontSize:15,fontWeight:700,color:"#fff",margin:"0 0 2px"}}>◈ {customCr} credits · Expires {expiryDate()}</p>
            </div>
            <p style={{fontFamily:F2,fontSize:24,fontWeight:800,color:"#fff",letterSpacing:"-1px",margin:0}}>€{totalPrice}</p>
          </div>
          <h2 style={{fontFamily:F2,fontSize:11,fontWeight:700,color:"#213C18",letterSpacing:"3px",textTransform:"uppercase",margin:"0 0 14px"}}>Payment method</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,160px),1fr))",gap:8,marginBottom:16}}>
            {PAY.map(pm=>(
              <div key={pm.id} onClick={()=>setPay(pm.id)}
                style={{border:`2px solid ${pay===pm.id?"#213C18":"rgba(195,200,188,0.3)"}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",background:pay===pm.id?"rgba(33,60,24,0.04)":"#fff",display:"flex",alignItems:"center",gap:10,transition:"all .15s"}}>
                <span style={{fontSize:16,fontWeight:700,color:pay===pm.id?"#213C18":"#74796E"}}>{pm.id==="card"?"▬":pm.id==="apple"?"⌘":pm.id==="google"?"G":"₱"}</span>
                <div>
                  <p style={{fontFamily:F2,fontSize:12,fontWeight:600,color:pay===pm.id?"#213C18":"#1B1C19",margin:"0 0 2px"}}>{pm.label}</p>
                  <p style={{fontFamily:F2,fontSize:10,color:"#74796E",margin:0}}>{pm.sub}</p>
                </div>
              </div>
            ))}
          </div>
          {pay==="card"&&(
            <div style={{background:"#fff",borderRadius:12,border:"1px solid rgba(195,200,188,0.3)",padding:"20px",marginBottom:16,display:"flex",flexDirection:"column",gap:14}}>
              {[{l:"Cardholder Name",k:"name",p:"Jane Smith",tf:v=>v},{l:"Card Number",k:"number",p:"4242 4242 4242 4242",tf:fmtCard}].map(f=>(
                <div key={f.k}>
                  <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#74796E",display:"block",marginBottom:6}}>{f.l}</label>
                  <input placeholder={f.p} value={card[f.k]} onChange={e=>setCard(p=>({...p,[f.k]:f.tf(e.target.value)}))}
                    style={{width:"100%",border:"1px solid rgba(195,200,188,0.4)",borderRadius:8,padding:"12px 16px",fontFamily:F2,fontSize:14,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",transition:"border-color .15s"}}
                    onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.4)"}/>
                </div>
              ))}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[{l:"Expiry",k:"expiry",p:"MM/YY",tf:fmtExp},{l:"CVC",k:"cvc",p:"123",tf:v=>v.replace(/\D/g,"").slice(0,3)}].map(f=>(
                  <div key={f.k}>
                    <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#74796E",display:"block",marginBottom:6}}>{f.l}</label>
                    <input placeholder={f.p} value={card[f.k]} onChange={e=>setCard(p=>({...p,[f.k]:f.tf(e.target.value)}))}
                      style={{width:"100%",border:"1px solid rgba(195,200,188,0.4)",borderRadius:8,padding:"12px 16px",fontFamily:F2,fontSize:14,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",transition:"border-color .15s"}}
                      onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.4)"}/>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={()=>{onPurchase({cr:customCr,price:totalPrice});setStep(3);}}
            style={{width:"100%",padding:"18px 0",borderRadius:999,background:"#213C18",color:"#fff",border:"none",fontFamily:F2,fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 14px rgba(33,60,24,0.2)",transition:"transform .15s"}}
            onMouseEnter={e=>e.currentTarget.style.transform="scale(1.02)"}
            onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
            Pay €{totalPrice} →
          </button>
        </div>
      )}

      {/* Step 3 */}
      {step===3&&(
        <div style={{maxWidth:420,margin:"0 auto",padding:"0 32px",textAlign:"center",paddingTop:40}}>
          <div style={{width:64,height:64,background:"#CAECBA",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 24px",fontSize:28}}>✓</div>
          <h1 style={{fontFamily:F2,fontSize:32,fontWeight:800,color:"#213C18",letterSpacing:"-1.5px",margin:"0 0 12px"}}>Credits added!</h1>
          <p style={{fontFamily:F2,fontSize:15,color:"#74796E",margin:"0 0 4px"}}>◈ {customCr} added to your pass.</p>
          <p style={{fontFamily:F2,fontSize:13,color:"#C3C8BC",margin:"0 0 32px"}}>They expire on {expiryDate()}.</p>
          <button onClick={()=>setStep(1)}
            style={{background:"#213C18",color:"#fff",border:"none",borderRadius:999,padding:"14px 32px",fontFamily:F2,fontSize:14,fontWeight:700,cursor:"pointer"}}>
            Top up again
          </button>
        </div>
      )}
    </div>
  );
}

function BusinessPortalDashboard({ onExit }) {
  const F2 = "'Manrope','Jost',system-ui,sans-serif";
  const bizData = { name:"Calma Studio", cat:"Yoga", loc:"Sóller", monthlyBookings:24, monthlyCredits:86 };
  const [tab, setTab] = useState("overview");
  const [selDay, setSelDay] = useState(0);
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [newSlot, setNewSlot] = useState({name:"",time:"09:00",spots:10,credits:3,dur:"60 min"});
  const [editListing, setEditListing] = useState(false);
  const [listing, setListing] = useState({name:"Calma Studio",cat:"Yoga",cat2:"Meditation",loc:"Sóller",desc:"Rooftop yoga overlooking the Tramuntana mountains. All levels welcome.",credits:3,tags:"Rooftop, All Levels, Mountain Views"});
  const [integration, setIntegration] = useState(null);

  const TABS = [["overview","Overview"],["schedule","Schedule"],["payouts","Payouts"],["listing","My Listing"],["settings","Settings"]];

  const WEEK_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const WEEK_DATES = ["14 Apr","15 Apr","16 Apr","17 Apr","18 Apr","19 Apr","20 Apr"];

  const [CLS, setCLS] = useState([
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
  ]);

  const RECENT = [
    {initials:"SM",name:"Sarah M.",  cls:"Sunrise Flow",   when:"Today 07:00",     cr:15,status:"Confirmed"},
    {initials:"JT",name:"James T.",  cls:"Sunset Vinyasa", when:"Today 18:30",     cr:15,status:"Confirmed"},
    {initials:"AK",name:"Anna K.",   cls:"Weekend Flow",   when:"Sat 19 Apr 09:00",cr:15,status:"Confirmed"},
    {initials:"MW",name:"Marcus W.", cls:"Sunrise Flow",   when:"Wed 16 Apr 07:00",cr:15,status:"Confirmed"},
    {initials:"LM",name:"Léa M.",    cls:"Morning Yin",    when:"Tue 15 Apr 09:00",cr:12,status:"Pending"},
  ];

  const INP = {width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"10px 14px",fontFamily:F2,fontSize:13,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4"};

  const dayCLS = CLS.filter(c=>c.day===selDay);

  return (
    <div style={{minHeight:"100vh",background:"#FBF9F4",fontFamily:F2}}>

      {/* Header */}
      <div style={{background:"#213C18",padding:"clamp(16px,3vw,28px) clamp(16px,3vw,32px) 0"}}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
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
              <button onClick={onExit} style={{padding:"8px 16px",background:"transparent",color:"rgba(255,255,255,0.45)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:999,fontFamily:F2,fontSize:11,cursor:"pointer"}}>✕ Exit preview</button>
            </div>
          </div>
          {/* Stats row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(140px,1fr))",gap:8,marginBottom:0,overflowX:"auto"}}>
            {[
              {label:"Bookings this month",value:"24",sub:"April 2026",accent:"#CAECBA"},
              {label:"Credits redeemed",value:"◈ 86",sub:"this month",accent:"rgba(255,255,255,0.25)"},
              {label:"Payout due",value:"€619",sub:"paid this Friday",accent:"#4ade80"},
              {label:"Avg rating",value:"4.9",sub:"38 reviews",accent:"#D6B47C"},
            ].map(({label,value,sub,accent})=>(
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
            {/* Summary cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(45%,200px),1fr))",gap:10}}>
              {[
                {label:"Total sessions",value:"142",sub:"Last 6 months",color:"#213C18"},
                {label:"Customer return rate",value:"68%",sub:"booked more than once",color:"#213C18"},
                {label:"Avg credits/booking",value:"◈ 18",sub:"April 2026",color:"#B8925C"},
                {label:"Revenue this month",value:"€619",sub:"paid this Friday",color:"#213C18"},
              ].map(({label,value,sub,color})=>(
                <div key={label} style={{background:"#fff",borderRadius:12,padding:"18px 20px",borderTop:`3px solid ${color}`,boxShadow:"0 1px 8px rgba(0,0,0,0.04)"}}>
                  <p style={{fontFamily:F2,fontSize:9,color:"#74796E",letterSpacing:"1.5px",textTransform:"uppercase",margin:"0 0 8px"}}>{label}</p>
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
                    <p style={{fontFamily:F2,fontSize:11,color:"#74796E",margin:0}}>Credits redeemed × €1 · less commission</p>
                  </div>
                  <p style={{fontFamily:F2,fontSize:20,fontWeight:800,color:"#213C18",letterSpacing:"-0.5px",margin:0}}>€619</p>
                </div>
                {(()=>{
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
                            <p style={{fontFamily:F2,fontSize:9,color:isLast?"#213C18":"#74796E",fontWeight:isLast?700:400,margin:0}}>{m}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Live bookings */}
              <div style={{background:"#fff",borderRadius:12,padding:"22px 24px",boxShadow:"0 1px 8px rgba(0,0,0,0.04)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <p style={{fontFamily:F2,fontSize:14,fontWeight:700,color:"#213C18",margin:0,letterSpacing:"-0.3px"}}>Live bookings</p>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:"#4ade80",display:"inline-block"}}/>
                    <span style={{fontFamily:F2,fontSize:10,color:"#213C18",fontWeight:600}}>Live</span>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:0}}>
                  {RECENT.map((b,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:i<RECENT.length-1?"1px solid rgba(195,200,188,0.2)":"none"}}>
                      <div style={{width:32,height:32,borderRadius:"50%",background:b.status==="Confirmed"?"#CAECBA":"#FADEC0",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F2,fontSize:10,color:b.status==="Confirmed"?"#213C18":"#766149",fontWeight:700,flexShrink:0}}>{b.initials}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontFamily:F2,fontSize:12,color:"#1B1C19",fontWeight:600,margin:"0 0 1px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.name}</p>
                        <p style={{fontFamily:F2,fontSize:10,color:"#74796E",margin:0}}>{b.cls} · {b.when}</p>
                      </div>
                      <span style={{fontFamily:F2,fontSize:10,color:b.status==="Confirmed"?"#213C18":"#B8925C",fontWeight:700,flexShrink:0,background:b.status==="Confirmed"?"#CAECBA":"#FADEC0",padding:"2px 8px",borderRadius:999}}>{b.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SCHEDULE ── */}
        {tab==="schedule"&&(
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
                      <p style={{fontFamily:F2,fontSize:10,color:selDay===i?"rgba(255,255,255,0.6)":"#74796E",margin:"0 0 2px",textTransform:"uppercase",letterSpacing:"0.5px"}}>{d}</p>
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
                    <p style={{fontFamily:F2,fontSize:16,color:"#74796E",margin:"0 0 12px"}}>No classes on {WEEK_DAYS[selDay]}</p>
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
                            <p style={{fontFamily:F2,fontSize:10,color:"#74796E",margin:0}}>{cl.dur}</p>
                          </div>
                          <div style={{width:1,height:40,background:"rgba(195,200,188,0.4)",flexShrink:0,marginTop:4}}/>
                          {/* Details */}
                          <div style={{flex:1}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                              <p style={{fontFamily:F2,fontSize:15,fontWeight:700,color:"#1B1C19",margin:0}}>{cl.name}</p>
                              <span style={{fontFamily:F2,fontSize:10,fontWeight:700,color:cl.live?"#213C18":"#74796E",background:cl.live?"#CAECBA":"#E4E2DD",padding:"2px 8px",borderRadius:999}}>{cl.live?"Live":"Paused"}</span>
                              <span style={{fontFamily:F2,fontSize:10,color:"#74796E",background:"#F5F3EE",padding:"2px 8px",borderRadius:999}}>◈ {cl.credits} per person</span>
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
                                  <span key={b.initials} style={{fontFamily:F2,fontSize:10,color:"#74796E",background:"#F5F3EE",padding:"2px 8px",borderRadius:999}}>{b.name}</span>
                                ))}
                                {cl.booked>slotBookings.length&&<span style={{fontFamily:F2,fontSize:10,color:"#A3B18A",padding:"2px 0"}}>+{cl.booked-slotBookings.length} more</span>}
                              </div>
                            )}
                          </div>
                          {/* Actions */}
                          <div style={{display:"flex",gap:6,flexShrink:0}}>
                            <button onClick={()=>setCLS(p=>p.map(c=>c.id===cl.id?{...c,live:!c.live}:c))}
                              style={{padding:"6px 12px",background:cl.live?"#FADEC0":"#CAECBA",color:cl.live?"#766149":"#213C18",border:"none",borderRadius:999,fontFamily:F2,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                              {cl.live?"Pause":"Go live"}
                            </button>
                            <button onClick={()=>setCLS(p=>p.filter(c=>c.id!==cl.id))}
                              style={{padding:"6px 12px",background:"transparent",color:"#74796E",border:"1px solid rgba(195,200,188,0.4)",borderRadius:999,fontFamily:F2,fontSize:11,cursor:"pointer"}}>
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
                      <button onClick={()=>setShowAddSlot(false)} style={{background:"transparent",border:"none",fontSize:18,cursor:"pointer",color:"#74796E"}}>×</button>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      {[{l:"Class name",k:"name",p:"e.g. Sunrise Flow"},{l:"Time",k:"time",p:"09:00",t:"time"},{l:"Duration",k:"dur",p:"e.g. 60 min"},{l:"Available spots",k:"spots",p:"10",t:"number"}].map(f=>(
                        <div key={f.k}>
                          <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#74796E",display:"block",marginBottom:5}}>{f.l}</label>
                          <input type={f.t||"text"} placeholder={f.p} value={newSlot[f.k]} onChange={e=>setNewSlot(p=>({...p,[f.k]:e.target.value}))} style={{...INP}}
                            onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                        </div>
                      ))}
                      <div style={{background:"#F5F3EE",borderRadius:10,padding:"14px"}}>
                        <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#74796E",display:"block",marginBottom:4}}>Your normal class price</label>
<p style={{fontFamily:F2,fontSize:11,color:"#74796E",margin:"0 0 10px",lineHeight:1.5}}>1 credit = £1. Enter your normal class price and we'll set the credit price to match.</p>
                        <div style={{position:"relative"}}>
                          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontFamily:F2,fontSize:13,fontWeight:600,color:"#74796E",pointerEvents:"none"}}>£</span>
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
                            <label style={{fontFamily:F2,fontSize:10,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#74796E",display:"block",marginBottom:8}}>Choose credit price</label>
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
                                    <p style={{fontFamily:F2,fontSize:10,color:sel?"rgba(255,255,255,0.65)":"#74796E",margin:"0 0 8px"}}>{valueNote}</p>
                                    <div style={{height:3,borderRadius:999,background:sel?"rgba(255,255,255,0.2)":"#E4E2DD",overflow:"hidden",margin:"0 0 5px"}}>
                                      <div style={{width:`${demand}%`,height:"100%",background:sel?"rgba(255,255,255,0.7)":isLower?"#4ade80":"#A3B18A",borderRadius:999}}/>
                                    </div>
                                    <p style={{fontFamily:F2,fontSize:10,fontWeight:700,color:sel?"rgba(255,255,255,0.8)":isLower?"#213C18":"#74796E",margin:0}}>{demand}% fill rate</p>
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
                      <button onClick={()=>{
                        if(!newSlot.name||!newSlot.time) return;
                        setCLS(p=>[...p,{id:Date.now(),day:selDay,time:newSlot.time,name:newSlot.name,spots:+newSlot.spots||10,booked:0,credits:+newSlot.credits||3,dur:newSlot.dur||"60 min",live:true}]);
                        setShowAddSlot(false);
                        setNewSlot({name:"",time:"09:00",spots:10,credits:15,dur:"60 min",priceGBP:""});
                      }}
                        disabled={!newSlot.name||!newSlot.time}
                        style={{marginTop:4,padding:"13px 0",background:newSlot.name&&newSlot.time?"#213C18":"#E4E2DD",color:newSlot.name&&newSlot.time?"#fff":"#74796E",border:"none",borderRadius:999,fontFamily:F2,fontSize:14,fontWeight:700,cursor:newSlot.name&&newSlot.time?"pointer":"not-allowed",transition:"all .15s"}}>
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
                <p style={{fontFamily:F2,fontSize:28,fontWeight:800,color:"#fff",letterSpacing:"-1px",margin:"0 0 2px"}}>€619.20</p>
                <p style={{fontFamily:F2,fontSize:12,color:"rgba(255,255,255,0.5)",margin:0}}>Processed this Friday · direct to your IBAN</p>
              </div>
              <div style={{background:"rgba(255,255,255,0.1)",borderRadius:10,padding:"12px 16px",textAlign:"right"}}>
                <p style={{fontFamily:F2,fontSize:10,color:"rgba(255,255,255,0.5)",margin:"0 0 2px"}}>Commission rate</p>
                <p style={{fontFamily:F2,fontSize:16,fontWeight:700,color:"#CAECBA",margin:0}}>Agreed with Wello</p>
              </div>
            </div>
            {[
              {date:"14 Mar 2026",credits:170,bookings:4,gross:306,commission:null,invNo:"WLO-2026-014"},
              {date:"07 Mar 2026",credits:140,bookings:3,gross:252,commission:null,invNo:"WLO-2026-013"},
              {date:"28 Feb 2026",credits:120,bookings:3,gross:216,commission:null,invNo:"WLO-2026-012"},
            ].map((row,i)=>{
              // Net shown only when commission is explicitly set for this venue
              const net = row.commission ? +(row.gross*(1-row.commission/100)).toFixed(2) : null;
              return (
                <div key={row.date} style={{background:"#fff",borderRadius:12,padding:"16px 20px",display:"flex",alignItems:"center",gap:14,boxShadow:"0 1px 6px rgba(0,0,0,0.04)"}}>
                  <div style={{flex:1}}>
                    <p style={{fontFamily:F2,fontSize:12,fontWeight:600,color:"#1B1C19",margin:"0 0 2px"}}>{row.invNo}</p>
                    <p style={{fontFamily:F2,fontSize:11,color:"#74796E",margin:0}}>{row.date} · {row.credits} credits · {row.bookings} bookings</p>
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
            <p style={{fontFamily:F2,fontSize:11,color:"#A3B18A",textAlign:"center",marginTop:4}}>Payouts every Friday · questions? hello@wello-wellness.com</p>
          </div>
        )}

        {/* ── MY LISTING ── */}
        {tab==="listing"&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,300px),1fr))",gap:16,alignItems:"start"}}>
            {/* Listing preview */}
            <div style={{background:"#fff",borderRadius:12,overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
              <div style={{position:"relative",height:180}}>
                <img src="https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400&q=80" alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
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
                <p style={{fontFamily:F2,fontSize:13,color:"#74796E",margin:"0 0 8px",lineHeight:1.6}}>{listing.desc}</p>
                <p style={{fontFamily:F2,fontSize:12,color:"#213C18",fontWeight:600,margin:0}}>📍 {listing.loc} · ◈ {listing.credits} per person</p>
              </div>
            </div>
            {/* Edit form */}
            <div style={{background:"#fff",borderRadius:12,padding:"20px",boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
              <h3 style={{fontFamily:F2,fontSize:15,fontWeight:700,color:"#213C18",margin:"0 0 16px"}}>Edit listing details</h3>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {[{l:"Venue name",k:"name"},{l:"Location",k:"loc"},{l:"Primary category",k:"cat"},{l:"Secondary category",k:"cat2"},{l:"Credits per person",k:"credits",t:"number"},{l:"Tags (comma separated)",k:"tags"}].map(f=>(
                  <div key={f.k}>
                    <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#74796E",display:"block",marginBottom:5}}>{f.l}</label>
                    <input type={f.t||"text"} value={listing[f.k]||""} onChange={e=>setListing(p=>({...p,[f.k]:e.target.value}))}
                      style={{...INP}} onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                  </div>
                ))}
                <div>
                  <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#74796E",display:"block",marginBottom:5}}>Description</label>
                  <textarea value={listing.desc} onChange={e=>setListing(p=>({...p,desc:e.target.value}))} rows={3}
                    style={{...INP,resize:"vertical"}} onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                </div>
                <button style={{padding:"12px 0",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:13,fontWeight:700,cursor:"pointer"}}>Save changes</button>
              </div>
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab==="settings"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:560}}>
            {/* Contact details */}
            <div style={{background:"#fff",borderRadius:12,padding:"20px",boxShadow:"0 1px 6px rgba(0,0,0,0.04)"}}>
              <h3 style={{fontFamily:F2,fontSize:14,fontWeight:700,color:"#213C18",margin:"0 0 14px"}}>Contact & payment</h3>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[{l:"Contact email",v:"hello@solyalmayoga.com"},{l:"Phone",v:"+34 971 234 567"},{l:"IBAN",v:"ES12 3456 7890 1234 5678"}].map(f=>(
                  <div key={f.l}>
                    <label style={{fontFamily:F2,fontSize:9,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#74796E",display:"block",marginBottom:5}}>{f.l}</label>
                    <input defaultValue={f.v} style={{...INP}} onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                  </div>
                ))}
                <button style={{alignSelf:"flex-start",padding:"10px 20px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer",marginTop:4}}>Save changes</button>
              </div>
            </div>

            {/* Integrations */}
            <div style={{background:"#fff",borderRadius:12,padding:"20px",boxShadow:"0 1px 6px rgba(0,0,0,0.04)"}}>
              <h3 style={{fontFamily:F2,fontSize:14,fontWeight:700,color:"#213C18",margin:"0 0 4px"}}>Booking system integration</h3>
              <p style={{fontFamily:F2,fontSize:12,color:"#74796E",margin:"0 0 16px",lineHeight:1.6}}>Connect your existing booking system so your schedule stays in sync automatically.</p>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[
                  {id:"mindbody",name:"Mindbody",desc:"Most yoga & pilates studios",status:"coming_soon",icon:"🧘"},
                  {id:"fresha",name:"Fresha",desc:"Spas, massage & beauty",status:"available",icon:"💆"},
                  {id:"google",name:"Google Calendar",desc:"iCal feed · works with anything",status:"available",icon:"📅"},
                  {id:"manual",name:"Manage manually",desc:"Add & edit slots directly in Wello",status:"active",icon:"✏️"},
                ].map(item=>(
                  <div key={item.id} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",background:integration===item.id?"rgba(33,60,24,0.05)":"#F5F3EE",borderRadius:10,border:integration===item.id?"1px solid rgba(33,60,24,0.2)":"1px solid transparent",transition:"all .15s",cursor:item.status==="coming_soon"?"default":"pointer"}}
                    onClick={()=>item.status!=="coming_soon"&&setIntegration(item.id)}>
                    <span style={{fontSize:22,flexShrink:0}}>{item.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                        <p style={{fontFamily:F2,fontSize:13,fontWeight:700,color:"#1B1C19",margin:0}}>{item.name}</p>
                        {item.status==="coming_soon"&&<span style={{fontFamily:F2,fontSize:9,fontWeight:700,color:"#B8925C",background:"#FADEC0",padding:"2px 6px",borderRadius:999}}>Coming soon</span>}
                        {item.status==="active"&&<span style={{fontFamily:F2,fontSize:9,fontWeight:700,color:"#213C18",background:"#CAECBA",padding:"2px 6px",borderRadius:999}}>Active</span>}
                      </div>
                      <p style={{fontFamily:F2,fontSize:11,color:"#74796E",margin:0}}>{item.desc}</p>
                    </div>
                    {item.status!=="coming_soon"&&(
                      <span style={{fontFamily:F2,fontSize:12,color:"#213C18",fontWeight:600}}>{integration===item.id?"✓ Selected":"Select →"}</span>
                    )}
                  </div>
                ))}
              </div>
              {integration==="google"&&(
                <div style={{marginTop:14,padding:"14px 16px",background:"#F5F3EE",borderRadius:10}}>
                  <p style={{fontFamily:F2,fontSize:12,fontWeight:700,color:"#213C18",margin:"0 0 6px"}}>Connect Google Calendar</p>
                  <p style={{fontFamily:F2,fontSize:11,color:"#74796E",margin:"0 0 10px",lineHeight:1.6}}>1. Open Google Calendar → Settings → your calendar → Integrate calendar<br/>2. Copy the iCal URL and paste below</p>
                  <input placeholder="Paste your iCal URL here..." style={{...INP,marginBottom:8}} onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                  <button style={{padding:"8px 16px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer"}}>Connect</button>
                </div>
              )}
              {integration==="fresha"&&(
                <div style={{marginTop:14,padding:"14px 16px",background:"#F5F3EE",borderRadius:10}}>
                  <p style={{fontFamily:F2,fontSize:12,fontWeight:700,color:"#213C18",margin:"0 0 6px"}}>Connect Fresha</p>
                  <p style={{fontFamily:F2,fontSize:11,color:"#74796E",margin:"0 0 10px",lineHeight:1.6}}>1. Log into Fresha → Settings → Integrations<br/>2. Copy your API key and paste below</p>
                  <input placeholder="Paste your Fresha API key here..." style={{...INP,marginBottom:8}} onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                  <button style={{padding:"8px 16px",background:"#213C18",color:"#fff",border:"none",borderRadius:999,fontFamily:F2,fontSize:12,fontWeight:700,cursor:"pointer"}}>Connect</button>
                </div>
              )}
              {integration==="manual"&&(
                <div style={{marginTop:14,padding:"14px 16px",background:"#CAECBA",borderRadius:10}}>
                  <p style={{fontFamily:F2,fontSize:12,fontWeight:700,color:"#213C18",margin:"0 0 4px"}}>✓ Manual mode active</p>
                  <p style={{fontFamily:F2,fontSize:11,color:"#213C18",margin:0,opacity:0.7}}>Manage your schedule directly in the Schedule tab.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function cropToSquare(file) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const min = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 800;
      canvas.getContext('2d').drawImage(img, (img.width-min)/2, (img.height-min)/2, min, min, 0, 0, 800, 800);
      URL.revokeObjectURL(img.src);
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    };
    img.src = URL.createObjectURL(file);
  });
}

function PartnerOnboarding({ bizData, onSubmitted, doSignOut }) {
  const TOTAL = 6;
  const [step, setStep] = useState(bizData.onboarding_step > 0 ? Math.min(bizData.onboarding_step, TOTAL) : 1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [desc, setDesc] = useState(bizData.description || "");
  const [address, setAddress] = useState(bizData.address || "");
  const [website, setWebsite] = useState(bizData.website || "");
  const [instagram, setInstagram] = useState(bizData.instagram || "");
  const [img, setImg] = useState(bizData.img || null);
  const [gallery, setGallery] = useState(bizData.gallery || []);
  const [availType, setAvailType] = useState(bizData.acuity_key ? "acuity" : "manual");
  const [acuityKey, setAcuityKey] = useState(bizData.acuity_key || "");
  const [slots, setSlots] = useState(bizData.slots || []);
  const [cr, setCr] = useState(bizData.cr ? String(bizData.cr) : "");
  const [newSlot, setNewSlot] = useState({ name:"", days:[], time:"09:00", dur:"60 min", spots:10 });

  const firstName = bizData.name.split(' ')[0];
  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const DURS = ["30 min","45 min","60 min","75 min","90 min","2 hours","Open"];
  const catAvg = {Yoga:20,Pilates:20,Surfing:40,"Paddle Boarding":30,Kayaking:30,Cycling:20,"Hotel Gym":25,"Pool Access":25,"Fitness Class":15,HIIT:15,Tennis:25,Padel:25,Pickleball:20,"Massage & Spa":60,Meditation:15,"Sound Healing":20,Breathwork:15,Dance:15,"Martial Arts":20,"Outdoor adventure":30}[bizData.category] ?? 20;
  const INP = {width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:2,fontSize:12,fontFamily:F.body,background:T.paper,color:T.ink,outline:"none",boxSizing:"border-box",transition:"border-color .18s"};
  const FL = {display:"block",fontSize:9,letterSpacing:"1.5px",textTransform:"uppercase",color:T.stone,fontFamily:F.body,marginBottom:4};
  const onFi = e => e.target.style.borderColor = T.sage;
  const onBl = e => e.target.style.borderColor = T.border;

  async function saveProgress(updates) {
    setSaving(true);
    await supabase.from('businesses').update(updates).eq('id', bizData.id);
    setSaving(false);
  }

  async function uploadPhoto(file, slot) {
    setUploading(true);
    try {
      const blob = await cropToSquare(file);
      const path = `${bizData.id}/${slot}-${Date.now()}.jpg`;
      await supabase.storage.from('venue-photos').upload(path, blob, { contentType:'image/jpeg', upsert:true });
      return supabase.storage.from('venue-photos').getPublicUrl(path).data.publicUrl;
    } finally { setUploading(false); }
  }

  async function goNext(updates={}) {
    await saveProgress({ ...updates, onboarding_step: step + 1 });
    setStep(s => s + 1);
    window.scrollTo(0, 0);
  }

  async function handleSubmit() {
    setSaving(true);
    await supabase.from('businesses').update({ status:'submitted', onboarding_step:6 }).eq('id', bizData.id);
    setSaving(false);
    onSubmitted();
  }

  function addSlot() {
    if (!newSlot.name.trim() || !newSlot.days.length) return;
    setSlots(s => [...s, { id:`sl${Date.now()}`, ...newSlot }]);
    setNewSlot({ name:"", days:[], time:"09:00", dur:"60 min", spots:10 });
  }

  const progressBar = (
    <div style={{position:"sticky",top:0,zIndex:10,background:T.bg,borderBottom:`1px solid ${T.border}`,padding:"14px 28px"}}>
      <div style={{maxWidth:640,margin:"0 auto",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,whiteSpace:"nowrap"}}>Step {step} of {TOTAL}</span>
        <div style={{flex:1,height:3,background:T.border,borderRadius:999}}>
          <div style={{height:3,background:T.sage,borderRadius:999,width:`${(step/TOTAL)*100}%`,transition:"width .35s"}}/>
        </div>
        <button onClick={doSignOut} style={{background:"none",border:"none",color:T.stone,fontFamily:F.body,fontSize:10,cursor:"pointer",fontWeight:300,padding:0}}>Sign out</button>
      </div>
    </div>
  );

  const OBtn = ({onClick,label,disabled,variant="primary"}) => (
    <button onClick={onClick} disabled={disabled||saving}
      style={{padding:"11px 24px",background:variant==="primary"&&!disabled&&!saving?T.sage:variant==="secondary"?"transparent":T.border,color:variant==="secondary"?T.stone:"#fff",border:variant==="secondary"?`1px solid ${T.border}`:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:variant==="secondary"?300:600,cursor:disabled||saving?"not-allowed":"pointer",transition:"background .15s"}}
      onMouseEnter={e=>{if(!disabled&&!saving&&variant==="primary")e.target.style.background=T.sage2;}}
      onMouseLeave={e=>{if(!disabled&&!saving&&variant==="primary")e.target.style.background=T.sage;}}>
      {saving&&variant==="primary"?"Saving…":label}
    </button>
  );

  const Wrap = ({title,sub,children,footer}) => (
    <>{progressBar}
      <div style={{maxWidth:600,margin:"0 auto",padding:"40px 28px 80px"}}>
        <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:22,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 6px"}}>{title}</h1>
        {sub&&<p style={{fontFamily:F.body,fontSize:13,color:T.stone,fontWeight:300,margin:"0 0 28px",lineHeight:1.6}}>{sub}</p>}
        {children}
        {footer&&<div style={{display:"flex",gap:10,marginTop:32}}>{footer}</div>}
      </div>
    </>
  );

  if (step===1) return (
    <>{progressBar}
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

  if (step===2) return (
    <Wrap title="Tell us about your venue" sub="This is what guests will see when they find you on Wello."
      footer={[<OBtn key="b" onClick={()=>setStep(1)} label="← Back" variant="secondary"/>,
               <OBtn key="n" onClick={()=>goNext({description:desc,address,website,instagram})} label="Save & continue →" disabled={!desc.trim()}/>]}>
      <label style={FL}>Description</label>
      <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={4} placeholder="Describe your venue, what makes it special, and what guests can expect…"
        style={{...INP,resize:"vertical",lineHeight:1.6,marginBottom:16}} onFocus={onFi} onBlur={onBl}/>
      <label style={FL}>Address</label>
      <input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Street address, Mallorca"
        style={{...INP,marginBottom:16}} onFocus={onFi} onBlur={onBl}/>
      <label style={FL}>Website (optional)</label>
      <input value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://yourstudio.com"
        style={{...INP,marginBottom:16}} onFocus={onFi} onBlur={onBl}/>
      <label style={FL}>Instagram (optional)</label>
      <input value={instagram} onChange={e=>setInstagram(e.target.value)} placeholder="@yourstudio"
        style={{...INP}} onFocus={onFi} onBlur={onBl}/>
    </Wrap>
  );

  if (step===3) {
    async function handlePrimary(e) {
      const file=e.target.files?.[0]; if(!file) return;
      const url=await uploadPhoto(file,'primary'); setImg(url);
    }
    async function handleGallery(e) {
      const files=Array.from(e.target.files||[]).slice(0,4-gallery.length);
      const urls=await Promise.all(files.map((f,i)=>uploadPhoto(f,`gallery-${gallery.length+i}`)));
      setGallery(prev=>[...prev,...urls]);
    }
    return (
      <Wrap title="Add photos" sub="Square (1:1) photos work best — we crop automatically. A great primary photo makes a real difference."
        footer={[<OBtn key="b" onClick={()=>setStep(2)} label="← Back" variant="secondary"/>,
                 <OBtn key="n" onClick={()=>goNext({img,gallery})} label="Save & continue →" disabled={!img||uploading}/>]}>
        <label style={FL}>Primary photo</label>
        <div onClick={()=>!uploading&&document.getElementById('wph-primary').click()}
          style={{width:"100%",maxWidth:240,aspectRatio:"1",background:img?"transparent":T.bg2,border:img?"none":`2px dashed ${T.border}`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",cursor:uploading?"wait":"pointer",marginBottom:24,overflow:"hidden",position:"relative"}}>
          {img ? <>
            <img src={img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            <div onClick={e=>{e.stopPropagation();setImg(null);}} style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,0.55)",borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              <span style={{color:"#fff",fontSize:11,lineHeight:1}}>×</span>
            </div>
          </> : <div style={{textAlign:"center",padding:16}}>
            <div style={{fontSize:24,marginBottom:4}}>📷</div>
            <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300}}>{uploading?"Uploading…":"Click to upload"}</div>
          </div>}
        </div>
        <input id="wph-primary" type="file" accept="image/*" style={{display:"none"}} onChange={handlePrimary}/>
        <label style={FL}>Gallery photos (up to 4)</label>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:8}}>
          {gallery.map((url,i)=>(
            <div key={i} style={{aspectRatio:"1",borderRadius:6,overflow:"hidden",position:"relative"}}>
              <img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              <div onClick={()=>setGallery(g=>g.filter((_,gi)=>gi!==i))} style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,0.55)",borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                <span style={{color:"#fff",fontSize:10,lineHeight:1}}>×</span>
              </div>
            </div>
          ))}
          {gallery.length<4&&(
            <div onClick={()=>!uploading&&document.getElementById('wph-gallery').click()} style={{aspectRatio:"1",background:T.bg2,border:`2px dashed ${T.border}`,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",cursor:uploading?"wait":"pointer"}}>
              <span style={{fontSize:20,color:T.stone2}}>+</span>
            </div>
          )}
        </div>
        <input id="wph-gallery" type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleGallery}/>
        {uploading&&<p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,margin:"8px 0 0"}}>Uploading…</p>}
      </Wrap>
    );
  }

  if (step===4) return (
    <Wrap title="How do you manage bookings?" sub="Connect your existing system or add your sessions manually — you can always change this later."
      footer={[<OBtn key="b" onClick={()=>setStep(3)} label="← Back" variant="secondary"/>,
               <OBtn key="n" onClick={()=>goNext(availType==="acuity"?{acuity_key:acuityKey}:{slots})} label="Save & continue →"/>]}>
      <div style={{display:"flex",background:T.bg2,borderRadius:3,padding:3,marginBottom:24}}>
        {[["acuity","Connect Acuity"],["manual","Add manually"]].map(([mode,label])=>(
          <button key={mode} onClick={()=>setAvailType(mode)} style={{flex:1,padding:"9px 0",background:availType===mode?T.paper:"transparent",color:availType===mode?T.ink:T.stone,border:"none",borderRadius:2,fontFamily:F.body,fontSize:11,fontWeight:availType===mode?600:300,cursor:"pointer",transition:"all .15s",boxShadow:availType===mode?"0 1px 3px rgba(0,0,0,0.08)":"none"}}>
            {label}
          </button>
        ))}
      </div>
      {availType==="acuity" ? (
        <>
          <label style={FL}>Acuity API key</label>
          <input value={acuityKey} onChange={e=>setAcuityKey(e.target.value)} placeholder="Your Acuity API key"
            style={{...INP,marginBottom:10}} onFocus={onFi} onBlur={onBl}/>
          <p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,lineHeight:1.6,margin:0}}>Find your API key in Acuity → Integrations → API. Your schedule will sync automatically.</p>
        </>
      ) : (
        <>
          <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:8,padding:16,marginBottom:16}}>
            <div style={{fontFamily:F.body,fontSize:11,fontWeight:600,color:T.ink,marginBottom:12}}>Add a session</div>
            <label style={FL}>Session name</label>
            <input value={newSlot.name} onChange={e=>setNewSlot(p=>({...p,name:e.target.value}))} placeholder="e.g. Morning Yoga"
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
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
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
              <div>
                <label style={FL}>Max spots</label>
                <input type="number" min="1" value={newSlot.spots} onChange={e=>setNewSlot(p=>({...p,spots:parseInt(e.target.value)||1}))} style={{...INP}} onFocus={onFi} onBlur={onBl}/>
              </div>
            </div>
            <button onClick={addSlot} disabled={!newSlot.name.trim()||!newSlot.days.length}
              style={{padding:"8px 18px",background:newSlot.name.trim()&&newSlot.days.length?T.sage:T.border,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:11,fontWeight:600,cursor:newSlot.name.trim()&&newSlot.days.length?"pointer":"not-allowed"}}>
              Add session
            </button>
          </div>
          {slots.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {slots.map(sl=>(
                <div key={sl.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:T.paper,border:`1px solid ${T.border}`,borderRadius:6}}>
                  <div>
                    <span style={{fontFamily:F.body,fontSize:12,fontWeight:600,color:T.ink}}>{sl.name}</span>
                    <span style={{fontFamily:F.body,fontSize:10,color:T.stone,marginLeft:8,fontWeight:300}}>{sl.days.join(", ")} · {sl.time} · {sl.dur} · {sl.spots} spots</span>
                  </div>
                  <button onClick={()=>setSlots(s=>s.filter(x=>x.id!==sl.id))} style={{background:"none",border:"none",color:T.stone2,cursor:"pointer",fontSize:16,padding:"0 4px",lineHeight:1}}>×</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Wrap>
  );

  if (step===5) return (
    <Wrap title="Set your credit price" sub="Guests pay using Wello credits. 1 credit = €1. You decide what to charge per session."
      footer={[<OBtn key="b" onClick={()=>setStep(4)} label="← Back" variant="secondary"/>,
               <OBtn key="n" onClick={()=>goNext({cr:parseInt(cr)||catAvg})} label="Save & continue →" disabled={!cr}/>]}>
      <div style={{background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:6,padding:"12px 16px",marginBottom:20}}>
        <span style={{fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:600}}>Platform average for {bizData.category||"your category"}: </span>
        <span style={{fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:300}}>{catAvg} credits (€{catAvg})</span>
      </div>
      <label style={FL}>Credits per session</label>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <span style={{fontFamily:F.body,fontSize:22,color:T.ochre}}>◈</span>
        <input type="number" min="1" value={cr} onChange={e=>setCr(e.target.value)} placeholder={String(catAvg)}
          style={{...INP,maxWidth:100,fontSize:18,fontWeight:700}} onFocus={onFi} onBlur={onBl}/>
        {cr&&<span style={{fontFamily:F.body,fontSize:13,color:T.stone,fontWeight:300}}>= €{cr} per session</span>}
      </div>
      <p style={{fontFamily:F.body,fontSize:11,color:T.stone2,fontWeight:300,margin:0,lineHeight:1.6}}>You can adjust this at any time from your dashboard once you're live.</p>
    </Wrap>
  );

  if (step===6) return (
    <Wrap title="Review your listing" sub="Here's how you'll appear on Wello. You can edit anything from your dashboard after you go live."
      footer={[<OBtn key="b" onClick={()=>setStep(5)} label="← Back" variant="secondary"/>,
               <button key="s" onClick={handleSubmit} disabled={saving}
                 style={{padding:"11px 28px",background:saving?T.border:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:saving?"not-allowed":"pointer"}}
                 onMouseEnter={e=>{if(!saving)e.target.style.background=T.sage2;}}
                 onMouseLeave={e=>{if(!saving)e.target.style.background=T.sage;}}>
                 {saving?"Submitting…":"Submit for review →"}
               </button>]}>
      <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden",marginBottom:24}}>
        {img&&<img src={img} alt="" style={{width:"100%",aspectRatio:"4/3",objectFit:"cover",display:"block"}}/>}
        <div style={{padding:"16px 18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
            <div>
              <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:16,fontWeight:700,color:T.ink,marginBottom:2}}>{bizData.name}</div>
              <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>{bizData.category} · {bizData.location}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:F.body,fontSize:13,color:T.ochre,fontWeight:700}}>◈ {cr||catAvg}</div>
              <div style={{fontFamily:F.body,fontSize:9,color:T.stone2,fontWeight:300}}>per session</div>
            </div>
          </div>
          {desc&&<p style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,lineHeight:1.65,margin:"8px 0 0"}}>{desc.slice(0,140)}{desc.length>140?"…":""}</p>}
        </div>
      </div>
      <div style={{background:T.ochreXL,border:`1px solid ${T.ochreL}`,borderRadius:6,padding:"13px 16px"}}>
        <div style={{fontFamily:F.body,fontSize:11,color:T.clay,fontWeight:600,marginBottom:3}}>What happens next?</div>
        <div style={{fontFamily:F.body,fontSize:11,color:T.clay,fontWeight:300,lineHeight:1.6}}>We'll review your listing and get back to you within 2 working days. We may suggest a few small tweaks before you go live.</div>
      </div>
    </Wrap>
  );

  return null;
}

function BusinessPortal({ onSetView }) {
  const [screen, setScreen]     = useState("landing");
  const [email,  setEmail]      = useState("");
  const [pw,     setPw]         = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loading, setLoading]   = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [bizData, setBizData]   = useState(null);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      if(session) loadBizData(session.user.email);
    });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event, session)=>{
      if(session) loadBizData(session.user.email);
    });
    return ()=>subscription.unsubscribe();
  },[]);

  async function loadBizData(userEmail) {
    const {data} = await supabase.from("businesses").select("*").eq("email", userEmail).single();
    if(data) {
      setBizData(data);
      setScreen(data.status==="approved" ? "dashboard" : data.status==="setting_up" ? "onboarding" : data.status==="submitted" ? "submitted" : "pending");
    } else {
      setScreen("pending");
    }
  }

  async function doLogin() {
    setLoginErr(""); setLoading(true);
    const {error} = await supabase.auth.signInWithPassword({email, password:pw});
    setLoading(false);
    if(error) setLoginErr("Email or password not recognised.");
  }

  async function doSignOut() {
    await supabase.auth.signOut();
    setScreen("landing"); setBizData(null); setEmail(""); setPw("");
  }

  async function doPasswordReset() {
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://wello-seven.vercel.app"
    });
    setLoading(false); setResetSent(true);
  }

  const INP3={width:"100%",padding:"10px 12px",border:`1px solid ${T.border}`,borderRadius:2,fontSize:12,fontFamily:F.body,background:T.paper,color:T.ink,outline:"none",marginBottom:12,transition:"border-color .18s"};

  // ── Landing ───────────────────────────────────────────────────
  if (screen==="landing") return (
    <div style={{minHeight:"calc(100vh - 60px)",display:"flex",alignItems:"stretch",flexWrap:"wrap"}}>
      {/* Left — pitch */}
      <div style={{flex:"1 1 300px",background:T.sage,padding:"clamp(32px,5vw,64px) clamp(24px,5vw,52px)",display:"flex",flexDirection:"column",justifyContent:"center"}}>
        <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:11,fontWeight:400,color:T.ochreL,letterSpacing:"5px",textTransform:"uppercase",marginBottom:20}}>For businesses</div>
        <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:"clamp(28px,3.5vw,44px)",fontWeight:700,color:"#fff",lineHeight:1.1,letterSpacing:"-1px",margin:"0 0 18px"}}>Fill your off-peak slots.<br/>Reach more people.</h1>
        <p style={{fontFamily:F.body,fontSize:13,color:"rgba(255,255,255,.65)",lineHeight:1.75,margin:"0 0 32px",fontWeight:300,maxWidth:380}}>Wello connects your studio, gym or pool to local fitness enthusiasts, expats and tourists who want flexibility while on the island.</p>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {[["Grow your customer base","Reach people actively searching for new wellness experiences who haven't discovered you yet"],["Fill your quieter sessions","Turn off-peak slots into bookings and real revenue"],["Built here, for here","A Mallorca-first platform that understands the island"]].map(([t,d])=>(
            <div key={t} style={{display:"flex",gap:10}}>
              <div style={{width:16,height:16,borderRadius:"50%",background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
                <span style={{fontSize:8,color:"#fff"}}>✓</span>
              </div>
              <div><div style={{fontFamily:F.body,fontSize:12,color:"#fff",fontWeight:600}}>{t}</div><div style={{fontFamily:F.body,fontSize:11,color:"rgba(255,255,255,.5)",fontWeight:300}}>{d}</div></div>
            </div>
          ))}
        </div>
      </div>
      {/* Right — actions */}
      <div style={{flex:"1 1 280px",background:T.paper,padding:"clamp(32px,5vw,64px) clamp(24px,5vw,52px)",display:"flex",flexDirection:"column",justifyContent:"center"}}>
        <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:22,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 6px"}}>Welcome back</h2>
        <p style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300,margin:"0 0 28px"}}>Already have a business account? Sign in to your dashboard.</p>
        <button onClick={()=>setScreen("login")} style={{width:"100%",padding:"12px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:13,fontWeight:600,cursor:"pointer",marginBottom:12,letterSpacing:".3px",transition:"background .15s"}}
          onMouseEnter={e=>e.target.style.background=T.sage2} onMouseLeave={e=>e.target.style.background=T.sage}>
          Sign in to your dashboard →
        </button>
        <div style={{display:"flex",alignItems:"center",gap:10,margin:"18px 0"}}>
          <div style={{flex:1,height:1,background:T.border}}/>
          <span style={{fontFamily:F.body,fontSize:10,color:T.stone2}}>or</span>
          <div style={{flex:1,height:1,background:T.border}}/>
        </div>
        <p style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300,margin:"0 0 12px"}}>New to Wello? Register your business and we'll review your application.</p>
        <button onClick={()=>onSetView("business")} style={{width:"100%",padding:"12px",background:"transparent",color:T.sage,border:`1.5px solid ${T.sage}`,borderRadius:2,fontFamily:F.body,fontSize:13,fontWeight:600,cursor:"pointer",letterSpacing:".3px",transition:"all .15s"}}
          onMouseEnter={e=>{e.target.style.background=T.sageXL;}} onMouseLeave={e=>{e.target.style.background="transparent";}}>
          Register your business
        </button>

      </div>
    </div>
  );

  // ── Login ─────────────────────────────────────────────────────
  if (screen==="login") return (
    <div style={{maxWidth:420,margin:"80px auto",padding:"0 28px"}}>
      <button onClick={()=>setScreen("landing")} style={{background:"transparent",border:"none",color:T.stone,fontFamily:F.body,fontSize:11,cursor:"pointer",marginBottom:24,padding:0,fontWeight:300}}>← Back</button>
      <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:24,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 6px"}}>Business sign in</h1>
      <p style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300,margin:"0 0 28px"}}>Sign in to your Wello business dashboard.</p>
      <FieldLabel>Email address</FieldLabel>
      <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setLoginErr("");}} placeholder="hello@yourstudio.com"
        style={{...INP3,borderColor:loginErr?T.clay:T.border}} onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=loginErr?T.clay:T.border}/>
      <FieldLabel>Password</FieldLabel>
      <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setLoginErr("");}} placeholder="••••••••"
        style={{...INP3,borderColor:loginErr?T.clay:T.border}} onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=loginErr?T.clay:T.border}
        onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
      {loginErr&&<div style={{fontFamily:F.body,fontSize:11,color:T.clay,marginTop:-8,marginBottom:12}}>{loginErr}</div>}
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
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="hello@yourstudio.com"
            style={INP3} onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=T.border}/>
          <button onClick={doPasswordReset} disabled={loading||!email.trim()} style={{width:"100%",padding:"11px",background:email.trim()&&!loading?T.sage:T.border,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:email.trim()&&!loading?"pointer":"not-allowed",transition:"background .15s"}}>
            {loading?"Sending…":"Send reset link →"}
          </button>
        </>
      )}
    </div>
  );

  // ── Onboarding wizard ─────────────────────────────────────────
  if (screen==="onboarding") return (
    <PartnerOnboarding bizData={bizData} onSubmitted={()=>setScreen("submitted")} doSignOut={doSignOut}/>
  );

  // ── Submitted ─────────────────────────────────────────────────
  if (screen==="submitted") return (
    <div style={{maxWidth:520,margin:"80px auto",padding:"0 28px",textAlign:"center"}}>
      <div style={{width:56,height:56,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:22}}>✓</div>
      <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:22,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 10px"}}>Listing submitted</h1>
      <p style={{fontFamily:F.body,fontSize:13,color:T.stone,fontWeight:300,lineHeight:1.75,margin:"0 0 24px"}}>We've received your listing for <strong style={{fontWeight:600,color:T.ink}}>{bizData?.name}</strong>. We'll review it and be in touch within 2 working days.</p>
      <button onClick={doSignOut} style={{padding:"9px 22px",background:"transparent",color:T.stone,border:`1px solid ${T.border}`,borderRadius:2,fontFamily:F.body,fontSize:11,cursor:"pointer",fontWeight:300}}>Sign out</button>
    </div>
  );

  // ── Pending ───────────────────────────────────────────────────
  if (screen==="pending") return (
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
    </div>
  );

  // ── Approved dashboard ────────────────────────────────────────
  if (screen==="dashboard") return (
    <div style={{maxWidth:880,margin:"0 auto",padding:"32px 28px 58px"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12}}>
        <div>
          <Label>Business Dashboard</Label>
          <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:22,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 3px"}}>{bizData.name}</h1>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:T.sage,display:"inline-block",animation:"pulse 2s infinite"}}/>
            <span style={{fontFamily:F.body,fontSize:10,color:T.sage,fontWeight:600}}>Live on marketplace</span>
            <span style={{fontFamily:F.body,fontSize:10,color:T.stone2}}>· {bizData.cat} · {bizData.loc}</span>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <a href="#" style={{padding:"7px 14px",background:T.sageXL,color:T.sage,border:`1px solid ${T.sageL}`,borderRadius:2,fontFamily:F.body,fontSize:10,fontWeight:600,textDecoration:"none"}}>View listing ↗</a>
          <button onClick={doSignOut} style={{padding:"7px 14px",background:"transparent",color:T.stone,border:`1px solid ${T.border}`,borderRadius:2,fontFamily:F.body,fontSize:10,cursor:"pointer",fontWeight:300}}>Sign out</button>
        </div>
      </div>
      {/* Quick stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:10,marginBottom:24}}>
        {[["Bookings this month",bizData.monthlyBookings],["Credits redeemed","◈ "+bizData.monthlyCredits],["Payout due","€"+(bizData.monthlyCredits*5*0.8).toFixed(0)],["Avg rating","4.8 ★"]].map(([l,v])=>(
          <div key={l} style={{background:T.paper,borderRadius:3,border:`1px solid ${T.border}`,padding:"12px 14px"}}>
            <Label>{l}</Label><div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:20,fontWeight:700,color:T.ink,letterSpacing:"-0.3px"}}>{v}</div>
          </div>
        ))}
      </div>
      {/* Payout statements */}
      <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,overflow:"hidden",marginBottom:14}}>
        <div style={{padding:"11px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:600}}>Payout statements</div>
          <span style={{fontFamily:F.body,fontSize:9,color:T.stone2,fontWeight:300}}>Click to download as PDF</span>
        </div>
        <div style={{padding:"0 16px"}}>
          {[
            {date:"14 Mar 2026",credits:170,bookings:4,gross:306,commission:null,invNo:"WLO-2026-014"},
            {date:"07 Mar 2026",credits:140,bookings:3,gross:252,commission:null,invNo:"WLO-2026-013"},
            {date:"28 Feb 2026",credits:120,bookings:3,gross:216,commission:null,invNo:"WLO-2026-012"},
          ].map((row,i,arr)=>{
            const net=row.commission?+(row.gross*(1-row.commission/100)).toFixed(2):+(row.gross*0.75).toFixed(2);
            return (
              <div key={row.date} style={{display:"flex",alignItems:"center",gap:14,padding:"11px 0",borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                <div style={{flex:1}}>
                  <div style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:600}}>{row.date}</div>
                  <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>◈ {row.credits} credits · {row.bookings} bookings</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:15,fontWeight:700,color:T.ink,letterSpacing:"-0.3px"}}>€{net}</div>
                  <span style={{background:T.sageXL,color:T.sage,fontSize:8,padding:"2px 7px",borderRadius:2,fontFamily:F.body,fontWeight:700}}>Paid</span>
                </div>
                <button onClick={()=>printInvoice({
                  invoiceNo:row.invNo, date:row.date,
                  businessName:bizData.name, businessAddress:`${bizData.loc}, Mallorca`,
                  vatNo:"—", iban:"On file",
                  credits:row.credits, bookings:row.bookings,
                  grossValue:row.gross, commissionRate:row.commission,
                  commissionAmt:(row.gross*row.commission/100).toFixed(2), netPayout:net,
                })} style={{padding:"7px 14px",background:T.ink,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:10,fontWeight:600,cursor:"pointer",flexShrink:0}}>
                  ↓ Download
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:3,padding:"11px 14px"}}>
        <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,lineHeight:1.6}}>Payouts processed every Friday · Your commission rate is agreed with the Wello team · Contact hola@wello.es for any payout queries</div>
      </div>
    </div>
  );

  return null;
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [view,setView]         = useState("home");
  const [bizPreview,setBizPreview] = useState(false);
  const [cookieConsent,setCookieConsent] = useState(()=>localStorage.getItem("wello_cookie_consent")||null);
  const [showContact,setShowContact] = useState(false);
  const [showPrivacy,setShowPrivacy] = useState(false);
  const [showTerms,setShowTerms] = useState(false);
  const [contactForm,setContactForm] = useState({name:"",email:"",message:""});
  const [contactSent,setContactSent] = useState(false);
  const [recovering,setRecovering] = useState(false);
  const [newPw,setNewPw]       = useState("");
  const [newPwErr,setNewPwErr] = useState("");
  const [newPwDone,setNewPwDone] = useState(false);

  // Detect Supabase password recovery or invite redirect
  useEffect(()=>{
    const hash = window.location.hash;
    if(hash.includes("type=recovery") || hash.includes("type=invite") || hash.includes("type=signup")) {
      setRecovering(true);
      setView("biz-portal");
    }
    // Also handle Supabase auth via onAuthStateChange for invite flow
    const {data:{subscription}} = supabase.auth.onAuthStateChange((event, session)=>{
      if(event==="PASSWORD_RECOVERY" || event==="SIGNED_IN") {
        if(window.location.hash.includes("type=invite") || window.location.hash.includes("type=recovery")) {
          setRecovering(true);
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
  const [credits,setCredits]   = useState(6);
  const [bookings,setBookings] = useState([]);
  const [saved,setSaved]       = useState([]);
  const [isBiz,setIsBiz]       = useState(false);
  const [toast,setToast]       = useState(null);

  // Fetch listings + slots from Supabase (with localStorage cache for instant load)
  useEffect(()=>{
    function transformRows(listingRows) {
      return listingRows.map(row => ({
        id: row.id,
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
        slots: (row.slots || []).map(s => ({
          id: s.id.toString(),
          name: s.name,
          date: s.date,
          time: s.time,
          dur: s.dur,
          spots: s.spots,
          booked: s.booked,
          credits: s.credits,
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
      } catch(e) {}

      // Fetch fresh data from Supabase in background
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
        try { localStorage.setItem("wello_listings", JSON.stringify(transformed)); } catch(e) {}
      } else {
        if (!localStorage.getItem("wello_listings")) setListings(LISTINGS);
      }
      setListingsLoading(false);
    }
    fetchListings();
  }, []);
  const showToast=(msg,type="info")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2600); };

  const onSyncUpdate=useCallback((bizId,slotId,delta)=>{
    setSyncing(p=>({...p,[bizId]:true}));
    setTimeout(()=>setSyncing(p=>{const n={...p};delete n[bizId];return n;}),900);
    setListings(p=>p.map(b=>b.id!==bizId?b:{...b,slots:b.slots.map(s=>s.id!==slotId?s:{...s,booked:Math.max(0,Math.min(s.spots,s.booked+delta))})}));
  },[]);

  function onSelect(biz){ setSelBiz(biz); }
  function onBook(biz,slot){ setBkData({biz,slot}); setSelBiz(null); }
  function onConfirm({biz,slot,form,cost}){
    setCredits(c=>c-cost);
    setBookings(p=>[{id:Date.now(),biz,slot,form,cost},...p]);
    setListings(p=>p.map(b=>b.id!==biz.id?b:{...b,slots:b.slots.map(s=>s.id!==slot.id?s:{...s,booked:s.booked+form.guests})}));
    showToast(`Booked! ◈ ${cost} credits used.`,"success");
  }
  function onPurchase(purchase){ setCredits(c=>c+purchase.cr); showToast(`◈ ${purchase.cr} credits added!`,"gold"); }
  function toggleSave(id){ setSaved(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]); showToast(saved.includes(id)?"Removed from saved":"Saved!","success"); }

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

      {bizPreview&&<BusinessPortalDashboard onExit={()=>setBizPreview(false)}/>}

      <div style={{minHeight:"100vh",background:"#FBF9F4",display:bizPreview?"none":"block",overflowX:"hidden"}}>

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
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:1000,display:"flex",flexDirection:"column"}}>
          <div style={{background:"#213C18",padding:"8px 16px",display:"flex",alignItems:"center",justifyContent:"center",gap:8,overflow:"hidden"}}>
            <span style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,color:"rgba(255,255,255,0.7)",whiteSpace:"nowrap"}}>Early demo — not yet live.</span>
            <span style={{width:1,height:12,background:"rgba(255,255,255,0.2)",display:"inline-block",flexShrink:0}}/>
            <a href="mailto:hello@wello-wellness.com" style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,fontWeight:700,color:"#CAECBA",textDecoration:"none",whiteSpace:"nowrap"}}>hello@wello-wellness.com</a>
          </div>
        <nav style={{background:"rgba(251,249,244,0.96)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderBottom:"1px solid rgba(195,200,188,0.2)"}}>
          <style>{`body{overflow-x:hidden;} @media(max-width:640px){.wello-nav-links{display:none!important}.wello-footer{display:none!important}} .wello-nav-links{display:flex;} .scroll-indicator{display:flex;} @media(max-width:767px){.scroll-indicator{display:none!important}}`}</style>
          <div style={{maxWidth:1200,margin:"0 auto",padding:"0 clamp(16px,4vw,32px)",display:"flex",alignItems:"center",height:60,gap:16}}>
            {/* Wordmark — left */}
            <a onClick={()=>setView("home")} style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:20,fontWeight:800,color:"#213C18",letterSpacing:"-1px",cursor:"pointer",userSelect:"none",textDecoration:"none",flexShrink:0}}>wello</a>
            {/* Links — centred */}
            <div className="wello-nav-links" style={{flex:1,justifyContent:"center",gap:6,alignItems:"center"}}>
              {[{id:"explore",l:"Explore"},{id:"credits",l:"Pass"},{id:"biz-portal",l:"Business"}].map(n=>(
                <button key={n.id} onClick={()=>setView(n.id)}
                  style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,fontWeight:view===n.id?700:500,color:view===n.id?"#213C18":"#43483F",background:"transparent",border:"none",borderBottom:view===n.id?"2px solid #213C18":"2px solid transparent",padding:"4px 10px 8px",cursor:"pointer",transition:"color .15s",outline:"none"}}>
                  {n.l}
                </button>
              ))}
            </div>
            {/* Right — credits + avatar */}
            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,marginLeft:"auto"}}>
              <div onClick={()=>setView("credits")}
                style={{display:"flex",alignItems:"center",gap:5,background:"#213C18",color:"#fff",borderRadius:999,padding:"7px 14px",cursor:"pointer"}}>
                <span style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,fontWeight:700}}>◈ {credits}</span>
              </div>
              <div onClick={()=>setView("profile")}
                style={{width:32,height:32,borderRadius:"50%",background:"#213C18",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,fontWeight:800,color:"#fff",flexShrink:0}}>J</div>
            </div>
          </div>
        </nav>
        </div>{/* end banner+nav wrapper */}

        {/* PAGES — padded for fixed banner+nav */}
        <div style={{paddingTop:91}}>
          {view==="home"       &&<HomePage listings={listings} listingsLoading={listingsLoading} bookings={bookings} onSelect={onSelect} savedIds={saved} onToggleSave={toggleSave} onSetView={setView} syncingIds={syncingIds}/>}
          {view==="explore"    &&<ExplorePage listings={listings} onSelect={onSelect} savedIds={saved} onToggleSave={toggleSave} syncingIds={syncingIds}/>}
          {view==="profile"    &&<ProfilePage bookings={bookings} savedIds={saved} listings={listings} credits={credits} onSelect={onSelect} onSetView={setView} isBiz={isBiz} onToggleBiz={()=>setIsBiz(v=>!v)}/>}
          {view==="biz-portal" &&<BusinessPortal onSetView={setView}/>}
          {view==="business"   &&<BusinessPage isBiz={true} onSetView={setView} onToggleBiz={()=>setIsBiz(v=>!v)}/>}
          {view==="credits"    &&<CreditsPage credits={credits} onPurchase={onPurchase} listings={listings}/>}
        </div>

        {/* FOOTER — Stitch linen style */}
        <footer className="wello-footer" style={{background:"#F5F3EE",borderTop:"1px solid rgba(195,200,188,0.2)",padding:"clamp(32px,5vw,48px) clamp(16px,4vw,32px)"}}>
          <div style={{maxWidth:1200,margin:"0 auto",display:"flex",flexWrap:"wrap",justifyContent:"space-between",alignItems:"flex-start",gap:32}}>
            <div>
              <span style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:20,fontWeight:800,color:"#213C18",letterSpacing:"-0.5px",display:"block",marginBottom:8}}>wello</span>
              <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#43483F",maxWidth:280,lineHeight:1.6,margin:0}}>© 2026 Wello. Our Sustainability Commitment.</p>
            </div>
            <div style={{display:"flex",gap:32,flexWrap:"wrap"}}>
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

      <ScrollDownBtn/>

      {/* CONTACT MODAL */}
      {showContact&&(
        <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(27,28,25,0.75)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowContact(false)}>
          <div style={{background:"#fff",borderRadius:20,maxWidth:480,width:"100%",padding:"36px 32px",boxShadow:"0 32px 80px rgba(0,0,0,0.22)"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
              <div>
                <h2 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:22,fontWeight:700,color:"#213C18",margin:"0 0 4px",letterSpacing:"-0.5px"}}>Get in touch</h2>
                <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:14,color:"#74796E",margin:0}}>We'd love to hear from you.</p>
              </div>
              <button onClick={()=>{setShowContact(false);setContactSent(false);setContactForm({name:"",email:"",message:""}); }} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:"#74796E",padding:4}}>×</button>
            </div>
            {contactSent?(
              <div style={{textAlign:"center",padding:"20px 0"}}>
                <div style={{fontSize:40,marginBottom:12}}>✓</div>
                <h3 style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:18,fontWeight:700,color:"#213C18",margin:"0 0 8px"}}>Message sent!</h3>
                <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:14,color:"#74796E",margin:0}}>We'll get back to you at {contactForm.email}.</p>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {[{l:"Name",k:"name",t:"text",p:"Your name"},{l:"Email",k:"email",t:"email",p:"your@email.com"}].map(f=>(
                  <div key={f.k}>
                    <label style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#74796E",display:"block",marginBottom:6}}>{f.l}</label>
                    <input type={f.t} placeholder={f.p} value={contactForm[f.k]} onChange={e=>setContactForm(p=>({...p,[f.k]:e.target.value}))}
                      style={{width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"10px 14px",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:14,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",transition:"border-color .15s"}}
                      onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                  </div>
                ))}
                <div>
                  <label style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:10,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"#74796E",display:"block",marginBottom:6}}>Message</label>
                  <textarea placeholder="How can we help?" value={contactForm.message} onChange={e=>setContactForm(p=>({...p,message:e.target.value}))} rows={4}
                    style={{width:"100%",border:"1px solid rgba(195,200,188,0.5)",borderRadius:8,padding:"10px 14px",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:14,color:"#1B1C19",outline:"none",boxSizing:"border-box",background:"#FBF9F4",resize:"vertical",transition:"border-color .15s"}}
                    onFocus={e=>e.target.style.borderColor="#213C18"} onBlur={e=>e.target.style.borderColor="rgba(195,200,188,0.5)"}/>
                </div>
                <a href={`mailto:hello@wello-wellness.com?subject=Wello enquiry from ${contactForm.name}&body=${encodeURIComponent(contactForm.message + "%0A%0AFrom: " + contactForm.name + "%0AEmail: " + contactForm.email)}`}
                  onClick={()=>setContactSent(true)}
                  style={{display:"block",width:"100%",padding:"14px 0",borderRadius:999,background:contactForm.name&&contactForm.email&&contactForm.message?"#213C18":"#E4E2DD",color:contactForm.name&&contactForm.email&&contactForm.message?"#fff":"#74796E",border:"none",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:15,fontWeight:700,cursor:contactForm.name&&contactForm.email&&contactForm.message?"pointer":"not-allowed",textAlign:"center",textDecoration:"none",transition:"all .15s",boxSizing:"border-box"}}>
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
              <button onClick={()=>setShowPrivacy(false)} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:"#74796E"}}>×</button>
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
                <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#74796E",margin:0,lineHeight:1.75}}>{body}</p>
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
              <button onClick={()=>setShowTerms(false)} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:"#74796E"}}>×</button>
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
                <p style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:13,color:"#74796E",margin:0,lineHeight:1.75}}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {selBiz   &&<BizPanel biz={selBiz}        onClose={()=>setSelBiz(null)}  onBook={onBook}/>}
      {bkData   &&<BookingModal biz={bkData.biz} slot={bkData.slot} onClose={()=>setBkData(null)} onConfirm={onConfirm} credits={credits} onBuyCredits={()=>{setBkData(null);setView("credits");}}/>}
      <SyncEngine listings={listings} onUpdate={onSyncUpdate}/>
      <Chatbot listings={listings} credits={credits} bookings={bookings} onSelectBiz={onSelect}/>

      {/* Prototype preview — goes straight to dashboard demo */}
      {!bizPreview&&(
        <div style={{position:"fixed",bottom:148,right:12,zIndex:1050}}>
          <button onClick={()=>setBizPreview(true)}
            style={{background:"#1B1C19",color:"#D6B47C",border:"1px solid #B8925C",borderRadius:999,padding:"8px 16px",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.3)",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"}}>
            👁 Business dashboard
          </button>
        </div>
      )}
      {bizPreview&&(
        <div style={{position:"fixed",bottom:148,right:12,zIndex:1050}}>
          <button onClick={()=>setBizPreview(false)}
            style={{background:"#1B1C19",color:"#A89E8C",border:"1px solid #43483F",borderRadius:999,padding:"8px 16px",fontFamily:"'Manrope',system-ui,sans-serif",fontSize:11,cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.3)"}}>
            ✕ Exit preview
          </button>
        </div>
      )}

      {/* Mobile bottom nav */}
      <div className="mob-nav" style={{position:"fixed",bottom:0,left:0,right:0,zIndex:999,background:"rgba(251,249,244,0.97)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:"1px solid rgba(195,200,188,0.25)",padding:"8px 16px calc(8px + env(safe-area-inset-bottom))"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {[{id:"explore",l:"Explore"},{id:"credits",l:"Pass"},{id:"biz-portal",l:"Business"},{id:"profile",l:"Profile"}].map(({id,l})=>(
            <button key={id} onClick={()=>setView(id)}
              style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"transparent",border:"none",cursor:"pointer",padding:"4px 12px",fontFamily:"'Manrope',system-ui,sans-serif",borderBottom:view===id?"2px solid #213C18":"2px solid transparent"}}>
              <span style={{fontSize:13,fontWeight:view===id?700:500,color:view===id?"#213C18":"#74796E"}}>{l}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
