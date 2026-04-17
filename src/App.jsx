import { supabase } from './supabase.js'
import { useState, useEffect, useCallback, useRef } from "react";

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
    const desc = description || "Wello is the wellness pass for island living. Book studio classes, gym access, hotel pools, spa treatments and outdoor adventures wherever you are.";
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
      "description":"Mallorca\'s first wellness credit pass",
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
// 1 credit = €5 face value. Service fee: €2.50 per booking.
// Bundles sold at a discount — larger bundles = better value per credit.
// Credits expire 6 months from purchase.
const BUNDLES = [
  { id:"wellolife", name:"Wello Life", cr:50, price:237.50, fullPrice:250, desc:"For those who make wellness part of island life.", badge:"5% off", popular:true },
];
const BOOKING_FEE = 2.50; // 10% of session value, max €5, charged per booking

// Credit pricing — 1 credit = €5 face value.
// Venues price sessions in €5 increments, converted to credits.
// Market reference: Yoga €20 = 4cr · Gym day pass €15 = 3cr · Spa 60min €60 = 12cr
const CREDIT_PRICING = [
  { cat:"Yoga class",        offPeak:"3 credits (€15)",  peak:"4 credits (€20)",  example:"Drop-in classes, studios" },
  { cat:"Pilates class",     offPeak:"3 credits (€15)",  peak:"4 credits (€20)",  example:"Reformer & mat classes" },
  { cat:"Fitness class",     offPeak:"3 credits (€15)",  peak:"3 credits (€15)",  example:"HIIT, circuits, bootcamp" },
  { cat:"Gym day pass",      offPeak:"3 credits (€15)",  peak:"4 credits (€20)",  example:"Independent gyms" },
  { cat:"Hotel gym & pool",  offPeak:"5 credits (€25)",  peak:"8 credits (€40)",  example:"5-star hotel access" },
  { cat:"Pool day pass",     offPeak:"5 credits (€25)",  peak:"8 credits (€40)",  example:"Resort & rooftop pools" },
  { cat:"Outdoor adventure", offPeak:"6 credits (€30)",  peak:"8 credits (€40)",  example:"Guided hikes, kayaking" },
  { cat:"Spa treatment",     offPeak:"12 credits (€60)", peak:"16 credits (€80)", example:"60-min massage & wellness" },
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
const CATS = ["All","Yoga","Pilates","Surfing","Paddle Surfing","Kayaking","Cycling","Running","Hiking","Hotel Gym","Pool Access","Fitness Class","HIIT","Crossfit","Tennis","Padel","Horse Riding","Meditation","Sound Healing","Massage & Spa","Cold Water Therapy","Breathwork","Nutrition & Wellness","Dance","Martial Arts","Other"];
const LOCS = ["All Mallorca","Palma","Sóller","Deià","Pollença","Alcúdia","Santanyí","Valldemossa"];
const SYNC = {1:"Mindbody",2:"Acuity",3:"Acuity",4:"FareHarbor",5:"Custom API",6:"Mindbody",7:"Gympass",8:"iCal",9:"Custom API"};

const LISTINGS = [
  { id:1, name:"Sol & Alma Yoga", cat:"Yoga", loc:"Sóller", rating:4.9, reviews:127, cr:4,
    desc:"Rooftop yoga overlooking the Tramuntana mountains. Sunrise & sunset sessions with certified instructors.",
    img:"https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80",
    tags:["Rooftop","All Levels","Mountain Views"],
    slots:[{id:"s1",date:"2026-03-22",time:"07:00",dur:"75 min",spots:8,booked:3,name:"Sunrise Flow"},{id:"s2",date:"2026-03-22",time:"18:30",dur:"90 min",spots:10,booked:7,name:"Sunset Vinyasa"},{id:"s3",date:"2026-03-23",time:"07:00",dur:"75 min",spots:8,booked:1,name:"Sunrise Flow"}] },
  { id:2, name:"Hospes Maricel", cat:"Hotel Gym", loc:"Palma", rating:4.8, reviews:64, cr:8,
    desc:"Five-star hotel fitness centre with heated infinity pool and panoramic sea views. Day passes available.",
    img:"https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=600&q=80",
    tags:["5-Star","Infinity Pool","Sea Views"],
    slots:[{id:"s5",date:"2026-03-22",time:"06:30",dur:"Open",spots:15,booked:5,name:"Gym & Pool Pass"},{id:"s6",date:"2026-03-22",time:"16:00",dur:"Open",spots:15,booked:9,name:"Afternoon Access"},{id:"s7",date:"2026-03-23",time:"06:30",dur:"Open",spots:15,booked:2,name:"Gym & Pool Pass"}] },
  { id:3, name:"Tramuntana Flow", cat:"Pilates", loc:"Valldemossa", rating:5.0, reviews:43, cr:4,
    desc:"Reformer and mat Pilates inside a restored 18th-century farmhouse. Small groups, meticulous attention.",
    img:"https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&q=80",
    tags:["Reformer","Small Groups","Historic"],
    slots:[{id:"s8",date:"2026-03-22",time:"09:00",dur:"55 min",spots:6,booked:6,name:"Reformer"},{id:"s9",date:"2026-03-22",time:"11:00",dur:"55 min",spots:6,booked:2,name:"Mat Pilates"},{id:"s10",date:"2026-03-23",time:"09:00",dur:"55 min",spots:6,booked:0,name:"Intro Reformer"}] },
  { id:4, name:"Olas Surf & Yoga", cat:"Surfing", loc:"Alcúdia", rating:4.7, reviews:89, cr:8,
    desc:"North coast beach packages — paddle out at dawn, practice yoga as the sun rises over the bay.",
    img:"https://images.unsplash.com/photo-1515016886654-94c06b8a8c7d?w=600&q=80",
    tags:["Beach","Surf","Full Experience"],
    slots:[{id:"s12",date:"2026-03-22",time:"08:00",dur:"Half Day",spots:8,booked:5,name:"Surf + Yoga"},{id:"s13",date:"2026-03-23",time:"08:00",dur:"Half Day",spots:8,booked:1,name:"Surf + Yoga"}] },
  { id:5, name:"Cap Rocat Wellness", cat:"Pool Access", loc:"Palma", rating:4.9, reviews:52, cr:8,
    desc:"Fortress hotel — infinity pool carved into the cliffs, spa circuit and breathwork sessions. Extraordinary luxury.",
    img:"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=80",
    tags:["Luxury","Cliff Pool","Spa"],
    slots:[{id:"s15",date:"2026-03-22",time:"10:00",dur:"Full Day",spots:6,booked:2,name:"Pool & Spa Day"},{id:"s16",date:"2026-03-23",time:"10:00",dur:"Full Day",spots:6,booked:0,name:"Pool & Spa Day"}] },
  { id:6, name:"Deià Mountain Yoga", cat:"Yoga", loc:"Deià", rating:4.8, reviews:71, cr:4,
    desc:"Open-air platform in the artist village of Deià. Iyengar practice surrounded by ancient olive groves.",
    img:"https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=600&q=80",
    tags:["Outdoor","Iyengar","Olive Groves"],
    slots:[{id:"s18",date:"2026-03-22",time:"08:30",dur:"90 min",spots:10,booked:8,name:"Iyengar Morning"},{id:"s19",date:"2026-03-22",time:"17:00",dur:"90 min",spots:10,booked:4,name:"Restorative Evening"}] },
  { id:7, name:"Pollença HIIT Lab", cat:"Fitness Class", loc:"Pollença", rating:4.6, reviews:110, cr:3,
    desc:"High-intensity training in a converted mill. 45-minute sessions, expert coaching, maximum results.",
    img:"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=80",
    tags:["HIIT","Small Groups","Expert Coaches"],
    slots:[{id:"s21",date:"2026-03-22",time:"07:30",dur:"45 min",spots:14,booked:10,name:"HIIT Express"},{id:"s22",date:"2026-03-22",time:"12:00",dur:"45 min",spots:14,booked:6,name:"Lunchtime"},{id:"s24",date:"2026-03-23",time:"07:30",dur:"45 min",spots:14,booked:4,name:"HIIT Express"}] },
  { id:8, name:"Santanyí Sea Meditation", cat:"Meditation", loc:"Santanyí", rating:5.0, reviews:38, cr:3,
    desc:"Cliffside meditation and breathwork with the Mediterranean as your backdrop. Intimate and transformative.",
    img:"https://images.unsplash.com/photo-1593811167562-9cef47bfc4d7?w=600&q=80",
    tags:["Cliffside","Breathwork","Sea Views"],
    slots:[{id:"s25",date:"2026-03-22",time:"06:00",dur:"60 min",spots:8,booked:5,name:"Dawn Breathwork"},{id:"s26",date:"2026-03-22",time:"19:30",dur:"60 min",spots:8,booked:2,name:"Sunset Meditation"}] },
  { id:9, name:"Pure Palma Pool Club", cat:"Pool Access", loc:"Palma", rating:4.7, reviews:93, cr:5,
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
  const [step,setSt]=useState(1);
  const [form,setForm]=useState({name:"",email:"",guests:1});
  const cost = biz.cr * form.guests, canAfford = credits >= cost, avail = slot.spots - slot.booked;
  return (
    <div style={{position:"fixed",inset:0,zIndex:1200,background:"rgba(30,27,21,.72)",backdropFilter:"blur(5px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div style={{background:T.paper,borderRadius:5,maxWidth:430,width:"100%",overflow:"hidden",boxShadow:"0 28px 70px rgba(0,0,0,.22)",animation:"su .28s ease"}} onClick={e=>e.stopPropagation()}>
        <div style={{background:T.sage,padding:"18px 22px"}}>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <div><Label><span style={{color:"rgba(255,255,255,.5)"}}>Reserve</span></Label>
              <h2 style={{color:"#fff",margin:0,fontFamily:F.display,fontSize:19,fontWeight:400}}>{slot.name}</h2>
              <p style={{color:"rgba(255,255,255,.65)",margin:"2px 0 0",fontSize:11,fontFamily:F.body,fontWeight:300}}>{biz.name} · {fd(slot.date)} · {slot.time}</p>
            </div>
            <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",color:"#fff",width:28,height:28,borderRadius:3,cursor:"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
          <div style={{display:"flex",gap:16,marginTop:12}}>
            {[["Cost",null],["Available",`${avail} spots`],["Duration",slot.dur]].map(([k,v])=>(
              <div key={k}><div style={{color:"rgba(255,255,255,.45)",fontSize:8,textTransform:"uppercase",letterSpacing:"1.5px",fontFamily:F.body,marginBottom:3}}>{k}</div>
              {k==="Cost"?<Cr n={biz.cr} size="sm"/>:<div style={{color:"#fff",fontSize:12,fontWeight:600,fontFamily:F.body}}>{v}</div>}</div>
            ))}
          </div>
        </div>
        {step===1?(
          <div style={{padding:"16px 22px"}}>
            <div style={{background:canAfford?T.sageXL:T.clayXL,border:`1px solid ${canAfford?T.sageL:T.clayL}`,borderRadius:2,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:13}}>
              <div><div style={{fontFamily:F.body,fontSize:8,letterSpacing:"1.5px",textTransform:"uppercase",color:canAfford?T.sage:T.clay,marginBottom:2}}>Balance</div>
              <div style={{fontFamily:F.display,fontSize:17,color:T.ink,fontWeight:400}}>◈ {credits}</div></div>
              {!canAfford&&<button onClick={onBuyCredits} style={{padding:"5px 12px",background:T.ochre,color:"#fff",border:"none",borderRadius:2,fontSize:10,fontFamily:F.body,fontWeight:600,cursor:"pointer"}}>Add Credits</button>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[{l:"Name",k:"name",t:"text",p:"Your full name"},{l:"Email",k:"email",t:"email",p:"you@example.com"}].map(f=>(
                <div key={f.k}><FieldLabel>{f.l}</FieldLabel><input type={f.t} placeholder={f.p} value={form[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} style={INP} onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=T.border}/></div>
              ))}
              <div><FieldLabel>Guests</FieldLabel><select value={form.guests} onChange={e=>setForm(p=>({...p,guests:+e.target.value}))} style={{...INP}}>{Array.from({length:Math.min(avail,4)},(_,i)=>i+1).map(n=><option key={n} value={n}>{n} person{n>1?"s":""}</option>)}</select></div>
            </div>
            <div style={{marginTop:11,background:T.bg,borderRadius:2,padding:"9px 12px",border:`1px solid ${T.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}><span style={{fontFamily:F.body,fontSize:11,color:T.stone}}>{form.guests} × ◈ {biz.cr}</span><span style={{fontFamily:F.display,fontSize:17,color:T.ink,fontWeight:400}}>◈ {cost}</span></div>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontFamily:F.body,fontSize:10,color:T.stone}}>Remaining</span><span style={{fontFamily:F.body,fontSize:11,color:canAfford?T.sage:T.clay,fontWeight:600}}>{canAfford?`◈ ${credits-cost}`:"Insufficient"}</span></div>
            </div>
            <button onClick={()=>{onConfirm({biz,slot,form,cost});setSt(2);}} disabled={!form.name||!form.email||!canAfford}
              style={{width:"100%",marginTop:11,padding:11,background:!form.name||!form.email||!canAfford?T.border:T.sage,color:!form.name||!form.email||!canAfford?T.stone:"#fff",border:"none",borderRadius:3,fontSize:12,fontFamily:F.body,fontWeight:600,cursor:!form.name||!form.email||!canAfford?"not-allowed":"pointer",letterSpacing:".4px"}}>
              {!canAfford?"Insufficient Credits":"Confirm · ◈ "+cost}
            </button>
          </div>
        ):(
          <div style={{padding:"42px 22px",textAlign:"center"}}>
            <div style={{width:48,height:48,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:20,color:T.sage}}>✓</div>
            <h2 style={{fontFamily:F.display,fontSize:19,color:T.ink,margin:"0 0 4px",fontWeight:400}}>Booking confirmed</h2>
            <p style={{fontFamily:F.body,color:T.stone,fontSize:12,fontWeight:300}}>{slot.name} · {biz.name}</p>
            <div style={{marginTop:11,background:T.bg,borderRadius:2,padding:"7px 13px",display:"inline-block",border:`1px solid ${T.border}`}}><span style={{fontFamily:F.body,fontSize:11,color:T.stone}}>◈ {cost} used · balance ◈ {credits-cost}</span></div>
            <br/><button onClick={onClose} style={{marginTop:16,padding:"8px 22px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontSize:11,fontFamily:F.body,fontWeight:600,cursor:"pointer"}}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Business Panel ───────────────────────────────────────────────────────────
function BizPanel({ biz, onClose, onBook }) {
  const [selDate,setSel]=useState(null);
  const dates=[...new Set(biz.slots.map(s=>s.date))].sort();
  const slots=selDate?biz.slots.filter(s=>s.date===selDate):biz.slots;
  const sys=SYNC[biz.id];
  return (
    <div style={{position:"fixed",inset:0,zIndex:900,background:"rgba(30,27,21,.58)",backdropFilter:"blur(4px)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"28px 20px",overflowY:"auto"}} onClick={onClose}>
      <div style={{background:T.paper,borderRadius:5,maxWidth:620,width:"100%",overflow:"hidden",boxShadow:"0 28px 68px rgba(0,0,0,.18)",animation:"su .24s ease",marginBottom:40}} onClick={e=>e.stopPropagation()}>
        <div style={{position:"relative",height:216}}>
          <img src={biz.img} alt={biz.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(30,27,21,.85) 0%,rgba(30,27,21,.04) 60%)"}}/>
          <button onClick={onClose} style={{position:"absolute",top:12,right:12,background:"rgba(250,248,244,.15)",backdropFilter:"blur(8px)",border:"none",color:"#fff",width:28,height:28,borderRadius:3,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          {sys&&<div style={{position:"absolute",top:12,left:12,background:"rgba(30,27,21,.55)",backdropFilter:"blur(8px)",borderRadius:2,padding:"3px 8px",display:"flex",alignItems:"center",gap:4}}><span style={{width:4,height:4,borderRadius:"50%",background:"#9dd4a0",display:"inline-block"}}/><span style={{fontFamily:F.body,fontSize:8,color:"rgba(255,255,255,.8)"}}>Live · {sys}</span></div>}
          <div style={{position:"absolute",bottom:14,left:18,right:18}}>
            <div style={{display:"flex",gap:4,marginBottom:5,flexWrap:"wrap"}}>
              <span style={{background:T.sage,color:"#fff",fontSize:8,padding:"2px 7px",borderRadius:2,fontFamily:F.body,letterSpacing:"1px",textTransform:"uppercase"}}>{biz.cat}</span>
              {biz.tags.map(t=><span key={t} style={{background:"rgba(250,248,244,.18)",color:"rgba(255,255,255,.85)",fontSize:8,padding:"2px 7px",borderRadius:2,fontFamily:F.body}}>{t}</span>)}
            </div>
            <h2 style={{color:"#fff",fontFamily:F.display,fontSize:21,margin:"0 0 4px",fontWeight:400}}>{biz.name}</h2>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}><Stars n={biz.rating}/><span style={{color:"rgba(255,255,255,.5)",fontSize:10,fontFamily:F.body}}>({biz.reviews}) · 📍 {biz.loc}</span><Cr n={biz.cr} size="sm"/></div>
          </div>
        </div>
        <div style={{padding:"16px 20px 0"}}>
          <p style={{fontFamily:F.body,color:T.stone,lineHeight:1.7,margin:"0 0 13px",fontSize:12,fontWeight:300}}>{biz.desc}</p>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:13}}>
            <Pill label="All" active={!selDate} onClick={()=>setSel(null)}/>
            {dates.map(d=><Pill key={d} label={fd(d)} active={selDate===d} onClick={()=>setSel(d)}/>)}
          </div>
        </div>
        <div style={{padding:"0 20px 20px",display:"flex",flexDirection:"column",gap:7}}>
          {slots.map(sl=>{
            const avail=sl.spots-sl.booked,full=avail===0,pct=(sl.booked/sl.spots)*100;
            return (
              <div key={sl.id} style={{border:`1px solid ${full?T.border2:T.border}`,borderRadius:3,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,background:full?T.bg2:T.paper,opacity:full?.6:1,transition:"box-shadow .14s"}}
                onMouseEnter={e=>{if(!full)e.currentTarget.style.boxShadow="0 3px 14px rgba(0,0,0,.07)"}} onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                <div style={{textAlign:"center",minWidth:40}}><div style={{fontFamily:F.display,fontSize:15,color:T.ink,lineHeight:1,fontWeight:400}}>{sl.time}</div><div style={{fontSize:8,color:T.stone2,fontFamily:F.body,marginTop:1}}>{sl.dur}</div></div>
                <div style={{width:1,height:26,background:T.border}}/>
                <div style={{flex:1}}>
                  <div style={{fontFamily:F.body,fontWeight:600,fontSize:11,color:T.ink,marginBottom:3}}>{sl.name} <span style={{color:T.stone,fontWeight:300}}>· {fd(sl.date)}</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:68,height:3,background:T.border,borderRadius:2}}><div style={{width:`${pct}%`,height:"100%",background:pct>80?T.clay:T.moss,borderRadius:2}}/></div><span style={{fontSize:9,color:full?T.clay:T.stone,fontFamily:F.body}}>{full?"Full":`${avail} left`}</span></div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <Cr n={biz.cr} size="sm"/>
                  <button onClick={()=>!full&&onBook(biz,sl)} disabled={full}
                    style={{padding:"5px 12px",background:full?T.border:T.sage,color:full?T.stone:"#fff",border:"none",borderRadius:2,fontSize:10,fontFamily:F.body,fontWeight:600,cursor:full?"not-allowed":"pointer",transition:"background .14s",whiteSpace:"nowrap"}}
                    onMouseEnter={e=>{if(!full)e.target.style.background=T.sage2}} onMouseLeave={e=>{if(!full)e.target.style.background=T.sage}}>
                    {full?"Full":"Book"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Listing Card ─────────────────────────────────────────────────────────────
function Card({ biz, onSelect, syncing, saved, onToggleSave }) {
  const next=biz.slots.find(s=>s.booked<s.spots);
  return (
    <div className="group cursor-pointer" onClick={()=>onSelect(biz)}>
      <div className="relative aspect-[4/5] rounded-xl overflow-hidden mb-4 bg-surface-container-highest">
        <img src={biz.img} alt={biz.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"/>
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"/>
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm">
          <span className="text-xs font-extrabold text-primary">◈ {biz.cr}</span>
        </div>
        <button onClick={e=>{e.stopPropagation();onToggleSave(biz.id);}}
          className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-sm transition-transform hover:scale-110"
          style={{color:saved?"#e05c5c":"#74796e"}}>
          {saved?"♥":"♡"}
        </button>
        {syncing&&(
          <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
            <span className="text-white text-[9px] font-medium">Live</span>
          </div>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between items-start">
          <h3 className="text-base font-bold text-primary tracking-tight">{biz.name}</h3>
          <div className="flex items-center gap-1">
            <span className="text-secondary text-sm">★</span>
            <span className="text-sm font-bold">{biz.rating}</span>
          </div>
        </div>
        <p className="text-on-surface-variant text-sm flex items-center gap-1">
          <span className="text-xs">📍</span> {biz.loc} · {biz.cat}
        </p>
        {next
          ? <p className="text-xs text-primary font-medium">{next.spots-next.booked} spots left · {next.time}</p>
          : <p className="text-xs text-outline">Fully booked · check back soon</p>}
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
      <div onClick={()=>setOpen(o=>!o)} style={{position:"fixed",bottom:24,right:24,zIndex:500,cursor:"pointer",transition:"transform .18s"}}
        onMouseEnter={e=>e.currentTarget.style.transform="scale(1.05)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
        <div style={{display:"flex",alignItems:"center",gap:8,background:T.sage,borderRadius:50,padding:"10px 18px",boxShadow:"0 5px 20px rgba(78,107,67,.35)"}}>
          <span style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:15,fontWeight:700,color:"#fff",letterSpacing:"-0.5px"}}>wello</span>
          <span style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:11,color:"rgba(255,255,255,.6)",fontWeight:300}}>{open?"close":"ask"}</span>
        </div>
        <div style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:T.ochre,display:"flex",alignItems:"center",justifyContent:"center",border:`2px solid ${T.paper}`,fontSize:9,color:"#fff",fontWeight:700,fontFamily:"'Jost',system-ui,sans-serif"}}>◈</div>
      </div>
      {open&&(
        <div style={{position:"fixed",bottom:82,right:24,zIndex:500,width:306,background:T.paper,borderRadius:4,boxShadow:"0 14px 42px rgba(0,0,0,.16)",overflow:"hidden",animation:"su .22s ease",display:"flex",flexDirection:"column",maxHeight:440,border:`1px solid ${T.border}`}}>
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
function HomePage({ listings, bookings, onSelect, savedIds, onToggleSave, onSetView, syncingIds }) {
  const [aiQ,setAiQ]=useState(""); const [aiLoading,setAiLoading]=useState(false);
  const [aiNote,setAiNote]=useState(""); const [aiResults,setAiResults]=useState(null);

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
      {/* ── IMMERSIVE HERO ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-20 px-6 overflow-hidden bg-gradient-to-b from-surface via-surface to-secondary-container/20">
        {/* Background blobs */}
        <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
          <div className="absolute top-[20%] left-[10%] w-96 h-96 rounded-full bg-primary-container/10 blur-[120px]"/>
          <div className="absolute bottom-[20%] right-[10%] w-[500px] h-[500px] rounded-full bg-secondary-container/20 blur-[150px]"/>
        </div>
        <div className="relative z-10 max-w-4xl w-full text-center space-y-12">
          <div className="space-y-6">
            <h1 className="text-[clamp(80px,15vw,180px)] font-extrabold tracking-tighter text-primary leading-none select-none">wello</h1>
            <p className="text-on-surface-variant max-w-xl mx-auto font-medium leading-relaxed tracking-tight text-lg">
              Your curated pass for wellness and movement. Studios, gyms, spas and outdoor adventures.
            </p>
          </div>
          {/* AI Search */}
          <div className="relative max-w-2xl mx-auto group">
            <div className="flex items-center bg-white rounded-full p-2 pl-6 shadow-sm border border-outline-variant/10 focus-within:border-primary/20 transition-all duration-500">
              <span className="text-outline text-sm mr-2">✦</span>
              <input value={aiQ} onChange={e=>setAiQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&runAI()}
                className="w-full bg-transparent border-none focus:ring-0 text-on-surface placeholder:text-outline/60 py-3 font-medium text-sm"
                placeholder="Where do you want to find balance today?"/>
              {aiResults&&<button onClick={()=>{setAiResults(null);setAiQ("");setAiNote("");}} className="px-3 text-outline text-sm bg-transparent border-none cursor-pointer">✕</button>}
              <button onClick={runAI} disabled={aiLoading||!aiQ.trim()}
                className="bg-primary text-on-primary px-8 py-3 rounded-full font-bold hover:scale-[1.02] active:scale-95 transition-all text-sm disabled:opacity-50">
                {aiLoading?"…":"Search"}
              </button>
            </div>
            {aiNote&&<p className="text-on-surface-variant text-xs mt-3 italic">✦ {aiNote}</p>}
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4">
            <button onClick={()=>onSetView("credits")}
              className="group flex items-center gap-2 px-10 py-4 rounded-full bg-primary text-on-primary font-bold transition-all duration-300 hover:opacity-95 hover:scale-[1.02]">
              Buy Credits <span className="transition-transform group-hover:translate-x-1">→</span>
            </button>
            <button onClick={()=>onSetView("explore")}
              className="px-10 py-4 rounded-full border-2 border-primary text-primary font-bold transition-all duration-300 hover:bg-primary/5">
              Explore all
            </button>
          </div>
        </div>
      </section>

      {/* ── FEATURED SECTION ── */}
      <section className="py-20 px-8 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div className="space-y-3">
            <span className="text-primary font-bold tracking-widest text-xs uppercase">Curated Collections</span>
            <h2 className="text-5xl font-bold tracking-tighter text-on-background">Featured on Wello</h2>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-on-surface-variant max-w-xs text-base leading-relaxed hidden md:block">
              Hand-picked spaces and experiences for your wellbeing.
            </p>
            <button onClick={()=>onSetView("explore")} className="bg-transparent border-none text-primary font-bold text-sm cursor-pointer whitespace-nowrap hover:underline">See all →</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {featured.slice(0,4).map((biz,i)=>(
            <div key={biz.id} className={i===1?"md:mt-12":""}>
              <Card biz={biz} onSelect={onSelect} syncing={!!syncingIds[biz.id]} saved={savedIds.includes(biz.id)} onToggleSave={onToggleSave}/>
            </div>
          ))}
        </div>
      </section>

      {/* ── VALUES SECTION ── */}
      <section className="bg-surface-container-low py-24">
        <div className="max-w-7xl mx-auto px-8 grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
          <div className="relative">
            <div className="aspect-square rounded-full overflow-hidden border-8 border-white/50 shadow-2xl">
              <img src="https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80" alt="Wellness" className="w-full h-full object-cover"/>
            </div>
            <div className="absolute -bottom-8 -right-8 bg-white p-6 rounded-2xl shadow-xl max-w-[220px] space-y-2">
              <span className="text-3xl">🌿</span>
              <h4 className="font-bold text-lg text-primary">Sustainably Minded</h4>
              <p className="text-sm text-on-surface-variant">We partner with venues that prioritise ethical practices and ecological balance.</p>
            </div>
          </div>
          <div className="space-y-8">
            <h2 className="text-5xl font-bold tracking-tighter text-primary">The Wellness Pass for Island Living</h2>
            <div className="space-y-6">
              {[
                {icon:"🔓",title:"Unlimited Access",desc:"No memberships required. Pure, flexible access to the best wellness venues."},
                {icon:"⭐",title:"Vetted Quality",desc:"Every venue on Wello is personally visited and verified for quality and experience."},
                {icon:"🌊",title:"Rooted in Community",desc:"We give back to the places we operate — coastlines, communities and natural environments."},
              ].map(({icon,title,desc})=>(
                <div key={title} className="flex gap-5 items-start">
                  <div className="w-12 h-12 rounded-full bg-secondary-container flex items-center justify-center flex-shrink-0 text-xl">{icon}</div>
                  <div>
                    <h4 className="font-bold text-lg mb-1">{title}</h4>
                    <p className="text-on-surface-variant leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
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
  const filtered=listings.filter(b=>{
    const mC=activeCat==="All"||b.cat===activeCat;
    const mL=activeLoc==="All Mallorca"||b.loc===activeLoc;
    const mS=!search||b.name.toLowerCase().includes(search.toLowerCase())||b.loc.toLowerCase().includes(search.toLowerCase())||b.cat.toLowerCase().includes(search.toLowerCase());
    return mC&&mL&&mS;
  });
  return (
    <div className="pt-8 pb-24 px-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div className="max-w-2xl">
          <span className="text-secondary font-semibold tracking-widest text-xs uppercase mb-2 block">Curated Sanctuary</span>
          <h1 className="text-4xl font-extrabold tracking-tighter text-primary leading-tight">Find your flow.</h1>
        </div>
        <div className="flex items-center gap-2 text-on-surface-variant text-sm">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/>
          <span className="font-medium">{filtered.length} experiences · Live sync</span>
        </div>
      </header>

      {/* Filter bar — sticky */}
      <div className="sticky top-[76px] z-40 bg-surface/95 backdrop-blur-sm py-4 -mx-8 px-8">
        <div className="flex items-center gap-3 overflow-x-auto pb-1" style={{scrollbarWidth:"none"}}>
          {CATS.slice(0,12).map(c=>(
            <button key={c} onClick={()=>setActiveCat(c)}
              className={`px-5 py-2.5 rounded-full font-semibold text-sm whitespace-nowrap transition-colors ${activeCat===c?"bg-primary text-on-primary":"bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"}`}>
              {c}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 pl-4 border-l border-outline-variant/30">
            <div className="flex items-center bg-surface-container rounded-full px-4 py-2 gap-2">
              <span className="text-outline text-sm">⌕</span>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
                className="bg-transparent border-none focus:ring-0 text-sm w-32 outline-none text-on-surface placeholder:text-outline/60"/>
            </div>
          </div>
        </div>
        {/* Location pills */}
        <div className="flex items-center gap-2 overflow-x-auto pt-3" style={{scrollbarWidth:"none"}}>
          {LOCS.map(l=>(
            <button key={l} onClick={()=>setActiveLoc(l)}
              className={`px-4 py-1.5 rounded-full font-medium text-xs whitespace-nowrap transition-colors border ${activeLoc===l?"bg-primary text-on-primary border-primary":"border-outline-variant/30 text-on-surface-variant hover:border-primary/40"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length===0
        ? <div className="text-center py-24">
            <div className="text-4xl mb-4 text-outline">∅</div>
            <h3 className="text-xl font-bold text-primary mb-2">No results</h3>
            <p className="text-on-surface-variant">Try adjusting your filters</p>
          </div>
        : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mt-6">
            {filtered.map(b=><Card key={b.id} biz={b} onSelect={onSelect} syncing={!!syncingIds[b.id]} saved={savedIds.includes(b.id)} onToggleSave={onToggleSave}/>)}
          </div>
      }

      {filtered.length>8&&(
        <div className="mt-16 flex justify-center">
          <button className="px-10 py-4 rounded-full border border-primary text-primary font-bold hover:bg-primary hover:text-on-primary transition-all duration-300">
            Load more experiences
          </button>
        </div>
      )}
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

  return (
    <div className="pt-8 pb-24 px-6 max-w-7xl mx-auto">

      {/* Hero profile header */}
      <header className="flex flex-col md:flex-row items-end gap-8 mb-12 pt-4">
        <div className="relative group">
          <div className="w-28 h-28 md:w-36 md:h-36 rounded-xl overflow-hidden bg-surface-container-high flex items-center justify-center bg-primary">
            <span className="text-white text-5xl font-bold">J</span>
          </div>
          <button className="absolute -bottom-3 -right-3 bg-primary text-on-primary p-2 rounded-full shadow-lg hover:scale-105 transition-transform">
            <span className="text-xs">✏</span>
          </button>
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-4xl font-extrabold tracking-tight text-primary">Jane Smith</h1>
            <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase">Member</span>
          </div>
          <p className="text-on-surface-variant max-w-md leading-relaxed">Exploring wellness across the island.</p>
          <div className="flex gap-6 pt-2 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <span>📍</span><span>Mallorca</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <span>◈</span><span>{credits} credits</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <span>📅</span><span>{bookings.length} bookings</span>
            </div>
          </div>
        </div>
        <button onClick={()=>onSetView("credits")}
          className="bg-primary text-on-primary px-6 py-3 rounded-full font-bold hover:scale-[1.02] transition-transform shadow-lg">
          + Add Credits
        </button>
      </header>

      {/* Navigation tabs */}
      <div className="flex items-center gap-8 border-b border-outline-variant/20 mb-10 overflow-x-auto whitespace-nowrap">
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={`pb-4 px-1 font-medium transition-all border-b-2 -mb-px ${tab===k?"text-primary border-primary font-bold":"text-on-surface-variant border-transparent hover:text-primary"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Reservations */}
      {tab==="reservations"&&(
        bookings.length===0
          ? <div className="bg-surface-container-low rounded-2xl p-16 text-center">
              <div className="text-4xl mb-4">📅</div>
              <h3 className="text-xl font-bold text-primary mb-3">No reservations yet</h3>
              <button onClick={()=>onSetView("explore")}
                className="bg-primary text-on-primary px-8 py-3 rounded-full font-bold hover:scale-[1.02] transition-transform">
                Explore Classes
              </button>
            </div>
          : <div className="space-y-4">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-primary tracking-tight">Upcoming Bookings</h2>
              </div>
              {bookings.map(bk=>(
                <div key={bk.id} className="group bg-surface-container-low rounded-xl overflow-hidden flex flex-col md:flex-row hover:bg-surface-container-high transition-colors duration-300">
                  <div className="w-full md:w-48 h-36 md:h-auto overflow-hidden flex-shrink-0">
                    <img src={bk.biz.img} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"/>
                  </div>
                  <div className="flex-1 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-secondary uppercase tracking-widest">{bk.biz.cat}</span>
                      <h3 className="text-xl font-bold text-primary">{bk.slot.name}</h3>
                      <p className="text-on-surface-variant font-medium text-sm">📅 {fd(bk.slot.date)} · {bk.slot.time}</p>
                      <p className="text-on-surface-variant font-medium text-sm">📍 {bk.biz.name}, {bk.biz.loc}</p>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <span className="bg-primary-container text-on-primary-container px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse"/>Confirmed
                      </span>
                      <span className="text-sm font-bold text-primary">◈ {bk.cost} credits</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
      )}

      {/* Saved */}
      {tab==="saved"&&(
        saved.length===0
          ? <div className="bg-surface-container-low rounded-2xl p-16 text-center">
              <div className="text-4xl mb-4">♡</div>
              <h3 className="text-xl font-bold text-primary mb-3">Nothing saved yet</h3>
              <p className="text-on-surface-variant mb-6">Tap ♡ on any listing to save it</p>
              <button onClick={()=>onSetView("explore")} className="bg-primary text-on-primary px-8 py-3 rounded-full font-bold">Explore</button>
            </div>
          : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {saved.map(b=>(
                <div key={b.id} className="group cursor-pointer" onClick={()=>onSelect(b)}>
                  <div className="relative aspect-[4/5] rounded-xl overflow-hidden mb-3 bg-surface-container-highest">
                    <img src={b.img} alt={b.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"/>
                  </div>
                  <h3 className="font-bold text-primary text-sm">{b.name}</h3>
                  <p className="text-on-surface-variant text-xs">📍 {b.loc}</p>
                </div>
              ))}
            </div>
      )}

      {/* Friends */}
      {tab==="friends"&&(
        <div>
          <div className="flex justify-between items-center mb-6">
            <span className="text-on-surface-variant text-sm">{friends.length} friends</span>
            <button className="bg-primary text-on-primary px-5 py-2 rounded-full text-xs font-bold">+ Invite</button>
          </div>
          <div className="space-y-3">
            {friends.map(f=>(
              <div key={f.id} className="flex items-center gap-4 p-5 bg-surface-container-low rounded-xl hover:bg-surface-container transition-colors">
                <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center font-bold text-sm text-on-surface-variant flex-shrink-0">{f.init}</div>
                <div className="flex-1">
                  <p className="font-bold text-sm text-on-background">{f.name}</p>
                  <p className="text-on-surface-variant text-xs">📍 {f.loc} · {f.bio}</p>
                </div>
                <button className="border border-outline-variant/30 text-primary px-4 py-1.5 rounded-full text-xs font-bold hover:bg-surface transition-colors">View</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings */}
      {tab==="settings"&&(
        <div className="space-y-4 max-w-lg">
          <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-outline-variant/10">
            <h3 className="font-bold text-primary mb-4">Account Details</h3>
            <div className="space-y-4">
              {[{l:"Full Name",v:"Jane Smith"},{l:"Email",v:"jane@example.com"},{l:"Location",v:"Mallorca"}].map(f=>(
                <div key={f.l}>
                  <label className="text-xs font-bold uppercase tracking-widest text-outline mb-1 block">{f.l}</label>
                  <input defaultValue={f.v} className="w-full border border-outline-variant/30 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors bg-surface"/>
                </div>
              ))}
              <button className="bg-primary text-on-primary px-6 py-2.5 rounded-full font-bold text-sm hover:scale-[1.02] transition-transform">Save changes</button>
            </div>
          </div>
          <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-outline-variant/10">
            <h3 className="font-bold text-primary mb-4">Account Type</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm text-on-background mb-1">Business Account</p>
                <p className="text-on-surface-variant text-xs">List your venue and manage integrations.</p>
              </div>
              <div onClick={onToggleBiz} className={`w-12 h-6 rounded-full cursor-pointer relative transition-colors ${isBiz?"bg-primary":"bg-surface-container-highest"}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${isBiz?"left-7":"left-1"}`}/>
              </div>
            </div>
            {isBiz&&<button onClick={()=>onSetView("business")} className="mt-4 bg-secondary-container text-on-secondary-container px-5 py-2 rounded-full font-bold text-xs hover:scale-[1.02] transition-transform">Manage Business →</button>}
          </div>
          <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-outline-variant/10">
            <h3 className="font-bold text-primary mb-4">Notifications</h3>
            <div className="space-y-4">
              {["Booking confirmations","Availability reminders","Weekly recommendations","New venues nearby"].map(l=>(
                <div key={l} className="flex justify-between items-center">
                  <span className="text-sm text-on-background">{l}</span>
                  <div className="w-10 h-6 rounded-full bg-primary relative cursor-pointer flex-shrink-0">
                    <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-white shadow"/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Insights section */}
      <section className="mt-16 grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-4 bg-primary text-on-primary p-10 rounded-2xl flex flex-col justify-between">
          <div className="space-y-2">
            <span className="text-4xl opacity-50">✦</span>
            <h4 className="text-3xl font-bold leading-tight">Your Wellness Journey</h4>
            <p className="text-on-primary/70">Keep exploring to build your wellness habit.</p>
          </div>
          <div className="pt-8">
            <div className="text-5xl font-black">{bookings.length > 0 ? `${bookings.length}` : "0"}</div>
            <div className="text-sm font-bold uppercase tracking-widest opacity-60">Sessions booked</div>
          </div>
        </div>
        <div className="md:col-span-8 bg-surface-container-highest p-10 rounded-2xl relative overflow-hidden">
          <div className="relative z-10 space-y-4">
            <h4 className="text-2xl font-bold text-primary">Recommended for you</h4>
            <p className="text-on-surface-variant max-w-sm">Discover new experiences based on what you've enjoyed so far.</p>
            <button onClick={()=>onSetView("explore")} className="bg-white text-primary px-8 py-3 rounded-full font-bold shadow-sm hover:shadow-md transition-shadow">Explore Matches</button>
          </div>
          <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-primary/5 rounded-full blur-3xl"/>
        </div>
      </section>
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
    less the agreed Wello platform commission. Credit value is calculated at €5.00 per credit. If you have any queries regarding this
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

    function handleSubmit() {
      supabase.from('businesses').insert({
        name: listing.name,
        category: listing.category,
        location: listing.location,
        email: listing.email,
        phone: listing.phone,
        notes: listing.notes || '',
        status: 'pending',
      });
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
              <input placeholder="e.g. Sol & Alma Yoga" value={listing.name}
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
function CreditsPage({ credits, onPurchase }) {
  const [customCr, setCustomCr] = useState(10);
  const [pay, setPay]   = useState("card");
  const [step, setStep] = useState(1);
  const [card, setCard] = useState({number:"",expiry:"",cvc:"",name:""});
  const [showPricing, setShowPricing] = useState(false);

  const fmtCard=v=>v.replace(/\D/g,"").slice(0,16).replace(/(.{4})/g,"$1 ").trim();
  const fmtExp=v=>{const d=v.replace(/\D/g,"").slice(0,4);return d.length>2?d.slice(0,2)+"/"+d.slice(2):d;};
  const expiryDate=()=>{const d=new Date();d.setMonth(d.getMonth()+6);return d.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});};
  const totalPrice = +(customCr * 5).toFixed(2);
  const serviceFee = +(Math.min(totalPrice * 0.1, 5)).toFixed(2);

  // Step indicator
  const StepBar = () => (
    <div className="flex items-center gap-2 mb-8">
      {[["1","Choose credits"],["2","Payment"],["3","Done"]].map(([n,l],i)=>(
        <div key={n} className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step>i?"bg-primary text-white":step===i+1?"bg-primary text-white":"bg-surface-container text-outline"}`}>{step>i+1?"✓":n}</div>
          <span className={`text-xs font-medium ${step===i+1?"text-primary":"text-outline"}`}>{l}</span>
          {i<2&&<div className={`w-8 h-px ${step>i+1?"bg-primary":"bg-outline-variant"}`}/>}
        </div>
      ))}
    </div>
  );

  return (
    <div className="pt-8 pb-24 px-6 max-w-5xl mx-auto">
      {step===1&&(
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Left column */}
          <div className="lg:col-span-7 space-y-6">
            <header className="space-y-2">
              <span className="text-xs font-bold tracking-widest uppercase text-primary">Wellness Wallet</span>
              <h1 className="text-4xl font-extrabold tracking-tighter text-primary leading-none">Add Wello Credits</h1>
              <p className="text-on-surface-variant text-base max-w-md leading-relaxed">Credits can be used for any class, gym, spa or adventure in the Wello marketplace. 1 credit = €5 value.</p>
            </header>

            {/* Current balance */}
            <div className="bg-primary rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -mr-16 -mt-16"/>
              <div className="relative z-10">
                <p className="text-white/50 text-xs font-semibold tracking-widest uppercase mb-2">Your balance</p>
                <p className="text-white text-5xl font-extrabold tracking-tighter leading-none">◈ {credits}</p>
                <p className="text-white/40 text-xs mt-3">10% service fee per booking · max €5</p>
              </div>
            </div>

            {/* Credit counter */}
            <div className="bg-surface-container-low p-8 rounded-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl"/>
              <div className="relative z-10 flex flex-col items-center text-center">
                <label className="text-on-surface-variant font-medium text-sm mb-6">How many credits?</label>
                <div className="flex items-center gap-6 mb-8">
                  <button onClick={()=>setCustomCr(c=>Math.max(1,c-1))}
                    className="w-14 h-14 rounded-full bg-white flex items-center justify-center text-primary hover:scale-105 transition-transform shadow-sm text-2xl font-light border border-outline-variant/20">−</button>
                  <div className="flex flex-col items-center">
                    <input
                      type="number" min="1" max="200" value={customCr}
                      onChange={e=>{const v=parseInt(e.target.value);if(!isNaN(v))setCustomCr(Math.min(200,Math.max(1,v)));}}
                      className="text-7xl font-extrabold text-primary tracking-tighter leading-none text-center w-32 bg-transparent border-none outline-none"/>
                    <span className="text-primary/60 font-semibold tracking-widest uppercase text-xs mt-1">Credits</span>
                  </div>
                  <button onClick={()=>setCustomCr(c=>Math.min(200,c+1))}
                    className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-white hover:scale-105 transition-transform shadow-lg text-2xl font-light">+</button>
                </div>
                {/* Quick add pills */}
                <div className="flex flex-wrap justify-center gap-2">
                  {[1,5,10,25].map(n=>(
                    <button key={n} onClick={()=>setCustomCr(c=>Math.min(200,c+n))}
                      className="px-5 py-2 rounded-full border border-outline-variant/30 text-on-surface-variant text-sm font-medium hover:bg-primary hover:text-white hover:border-primary transition-all">+{n}</button>
                  ))}
                  <button onClick={()=>setCustomCr(1)}
                    className="px-5 py-2 rounded-full border border-outline-variant/20 text-outline text-sm hover:bg-surface-container transition-all">Reset</button>
                </div>
              </div>
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-container-highest/50 p-5 rounded-xl">
                <div className="text-primary text-xl mb-2">⏱</div>
                <h4 className="font-bold text-primary text-sm mb-1">6 Month Validity</h4>
                <p className="text-xs text-on-surface-variant">Credits expire 6 months from purchase date.</p>
              </div>
              <div className="bg-surface-container-highest/50 p-5 rounded-xl">
                <div className="text-primary text-xl mb-2">◈</div>
                <h4 className="font-bold text-primary text-sm mb-1">Flexible Booking</h4>
                <p className="text-xs text-on-surface-variant">Use across any venue, class or experience.</p>
              </div>
            </div>

            {/* How credits work — collapsible */}
            <div className="bg-secondary-container/40 rounded-xl p-4">
              <button onClick={()=>setShowPricing(p=>!p)} className="w-full flex justify-between items-center bg-transparent border-none cursor-pointer">
                <span className="text-sm font-semibold text-on-secondary-container">How credits work · 1 credit = €5 value</span>
                <span className="text-on-secondary-container text-sm">{showPricing?"↑":"↓"}</span>
              </button>
              {showPricing&&(
                <div className="mt-4 pt-4 border-t border-outline-variant/20 space-y-2">
                  {CREDIT_PRICING.map(r=>(
                    <div key={r.cat} className="grid grid-cols-3 gap-2 py-2 border-b border-outline-variant/10 last:border-0">
                      <div>
                        <div className="text-xs font-semibold text-on-background">{r.cat}</div>
                        <div className="text-xs text-outline">{r.example}</div>
                      </div>
                      <div className="text-xs font-semibold text-primary">{r.offPeak}</div>
                      <div className="text-xs text-on-surface-variant">{r.peak}</div>
                    </div>
                  ))}
                  <p className="text-xs text-outline mt-2">A 10% service fee (max €5) is charged per booking. Credits expire 6 months from purchase.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right column — sticky order summary */}
          <div className="lg:col-span-5 lg:sticky lg:top-28">
            <div className="bg-white rounded-2xl p-8 shadow-[0_12px_32px_rgba(27,28,25,0.06)] border border-outline-variant/10">
              <h3 className="text-xl font-bold text-primary mb-6 tracking-tight">Order Summary</h3>
              <div className="space-y-5">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-on-surface-variant text-sm">Credits</p>
                    <p className="text-primary font-semibold">{customCr} Wello Credits</p>
                  </div>
                  <p className="text-primary font-bold">€{totalPrice}</p>
                </div>
                <div className="flex justify-between items-center py-4 border-y border-outline-variant/10">
                  <div>
                    <p className="text-on-surface-variant text-sm">Unit price</p>
                    <p className="text-primary text-sm italic">1 Credit = €5.00</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-on-surface-variant">Service fee (10%, max €5)</span>
                    <span className="text-primary font-medium">charged per booking</span>
                  </div>
                </div>
                <div className="pt-5 border-t-2 border-primary/5">
                  <div className="flex justify-between items-baseline mb-6">
                    <span className="text-xl font-bold text-primary tracking-tight">Total</span>
                    <div className="text-right">
                      <span className="text-4xl font-extrabold text-primary tracking-tighter">€{totalPrice}</span>
                      <p className="text-xs uppercase tracking-widest text-on-surface-variant mt-1">{customCr} credits</p>
                    </div>
                  </div>
                  <button onClick={()=>setStep(2)}
                    className="w-full bg-primary text-white py-4 rounded-full font-bold text-base hover:scale-[1.02] active:scale-95 transition-transform shadow-lg flex items-center justify-center gap-2">
                    <span>Continue to Payment</span>
                    <span>→</span>
                  </button>
                  <div className="mt-4 flex items-center justify-center gap-2 text-on-surface-variant text-xs">
                    <span>🔒</span>
                    <span>Secure encrypted checkout</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-5 px-2">
              <p className="text-xs text-on-surface-variant text-center">Credits expire on <strong className="text-primary">{expiryDate()}</strong></p>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 — Payment */}
      {step===2&&(
        <div className="max-w-lg mx-auto">
          <StepBar/>
          <button onClick={()=>setStep(1)} className="flex items-center gap-1 text-outline text-sm mb-6 bg-transparent border-none cursor-pointer hover:text-primary transition-colors">← Back</button>
          <div className="bg-primary rounded-2xl p-5 mb-6 flex justify-between items-center relative overflow-hidden">
            <div className="absolute right-4 top-3 text-white/5 text-5xl font-bold">◈</div>
            <div>
              <p className="text-white/50 text-xs uppercase tracking-widest">Order summary</p>
              <p className="text-white font-bold text-base mt-1">◈ {customCr} credits · Expires {expiryDate()}</p>
            </div>
            <p className="text-white text-2xl font-extrabold tracking-tighter">€{totalPrice}</p>
          </div>
          <h2 className="text-sm font-bold text-primary uppercase tracking-widest mb-4">Payment method</h2>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {PAY.map(pm=>(
              <div key={pm.id} onClick={()=>setPay(pm.id)}
                className={`border rounded-xl p-4 cursor-pointer flex items-center gap-3 transition-all ${pay===pm.id?"border-primary bg-primary-fixed/30":"border-outline-variant/30 hover:border-primary/40"}`}>
                <span className={`text-base font-bold ${pay===pm.id?"text-primary":"text-outline"}`}>{pm.id==="card"?"▬":pm.id==="apple"?"⌘":pm.id==="google"?"G":"₱"}</span>
                <div>
                  <p className={`text-sm font-semibold ${pay===pm.id?"text-primary":"text-on-background"}`}>{pm.label}</p>
                  <p className="text-xs text-outline">{pm.sub}</p>
                </div>
              </div>
            ))}
          </div>
          {pay==="card"&&(
            <div className="bg-white rounded-2xl border border-outline-variant/20 p-6 space-y-4 mb-5">
              {[{l:"Cardholder Name",k:"name",p:"Jane Smith",tf:v=>v},{l:"Card Number",k:"number",p:"4242 4242 4242 4242",tf:fmtCard}].map(f=>(
                <div key={f.k}>
                  <label className="text-xs font-bold uppercase tracking-widest text-outline mb-1 block">{f.l}</label>
                  <input placeholder={f.p} value={card[f.k]} onChange={e=>setCard(p=>({...p,[f.k]:f.tf(e.target.value)}))}
                    className="w-full border border-outline-variant/30 rounded-lg px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary transition-colors bg-surface"/>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                {[{l:"Expiry",k:"expiry",p:"MM/YY",tf:fmtExp},{l:"CVC",k:"cvc",p:"123",tf:v=>v.replace(/\D/g,"").slice(0,3)}].map(f=>(
                  <div key={f.k}>
                    <label className="text-xs font-bold uppercase tracking-widest text-outline mb-1 block">{f.l}</label>
                    <input placeholder={f.p} value={card[f.k]} onChange={e=>setCard(p=>({...p,[f.k]:f.tf(e.target.value)}))}
                      className="w-full border border-outline-variant/30 rounded-lg px-4 py-3 text-sm font-medium focus:outline-none focus:border-primary transition-colors bg-surface"/>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={()=>{onPurchase({cr:customCr,price:totalPrice});setStep(3);}}
            className="w-full bg-primary text-white py-4 rounded-full font-bold text-base hover:scale-[1.02] active:scale-95 transition-transform shadow-lg">
            Pay €{totalPrice} →
          </button>
        </div>
      )}

      {/* Step 3 — Confirmation */}
      {step===3&&(
        <div className="max-w-md mx-auto text-center py-16">
          <div className="w-16 h-16 bg-primary-fixed rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">✓</div>
          <h1 className="text-3xl font-extrabold tracking-tighter text-primary mb-3">Credits added!</h1>
          <p className="text-on-surface-variant mb-1">◈ {customCr} credits added to your account.</p>
          <p className="text-outline text-sm mb-8">They expire on {expiryDate()}.</p>
          <button onClick={()=>setStep(1)}
            className="bg-primary text-white px-8 py-3 rounded-full font-bold hover:scale-105 transition-transform">
            Buy more credits
          </button>
        </div>
      )}
    </div>
  );
}



function BusinessPortalDashboard({ onExit }) {
  const bizData = { name:"Sol & Alma Yoga", cat:"Yoga", loc:"Soller", monthlyBookings:24, monthlyCredits:86 };
  const [tab, setTab] = useState("calendar");
  const [calWeek, setCalWeek] = useState(0);
  const TABS = [["calendar","Calendar"],["bookings","Bookings"],["analytics","Analytics"],["statements","Payout Statements"],["listing","My Listing"],["settings","Settings"]];
  const INP3={width:"100%",padding:"9px 11px",border:`1px solid ${T.border}`,borderRadius:2,fontSize:11,fontFamily:F.body,background:T.paper,color:T.ink,outline:"none",boxSizing:"border-box"};
  const WEEK_DAYS  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const WD0 = ["31 Mar","1 Apr","2 Apr","3 Apr","4 Apr","5 Apr","6 Apr"];
  const WD1 = ["7 Apr","8 Apr","9 Apr","10 Apr","11 Apr","12 Apr","13 Apr"];
  const WEEK_DATES = calWeek===0 ? WD0 : WD1;
  const TIMES = ["07:00","09:00","11:00","12:00","18:30"];
  const CLS = [
    {day:0,time:"07:00",name:"Sunrise Flow",   spots:8, booked:6, credits:2},
    {day:0,time:"18:30",name:"Sunset Vinyasa", spots:10,booked:8, credits:3},
    {day:1,time:"09:00",name:"Morning Yin",    spots:8, booked:3, credits:2},
    {day:2,time:"07:00",name:"Sunrise Flow",   spots:8, booked:8, credits:2},
    {day:2,time:"18:30",name:"Sunset Vinyasa", spots:10,booked:5, credits:3},
    {day:3,time:"07:00",name:"Sunrise Flow",   spots:8, booked:2, credits:2},
    {day:3,time:"12:00",name:"Lunchtime Flow", spots:6, booked:6, credits:2},
    {day:4,time:"07:00",name:"Sunrise Flow",   spots:8, booked:7, credits:2},
    {day:4,time:"18:30",name:"Sunset Vinyasa", spots:10,booked:4, credits:3},
    {day:5,time:"09:00",name:"Weekend Flow",   spots:12,booked:10,credits:3},
    {day:5,time:"11:00",name:"Deep Yin",       spots:10,booked:6, credits:2},
    {day:6,time:"09:00",name:"Weekend Flow",   spots:12,booked:12,credits:3},
    {day:6,time:"11:00",name:"Restorative",    spots:8, booked:3, credits:2},
  ];
  const RECENT = [
    {initials:"SM",name:"Sarah M.",  cls:"Sunrise Flow",   when:"Today 07:00",     cr:2,status:"Confirmed"},
    {initials:"JT",name:"James T.",  cls:"Sunset Vinyasa", when:"Today 18:30",     cr:3,status:"Confirmed"},
    {initials:"AK",name:"Anna K.",   cls:"Weekend Flow",   when:"Sat 5 Apr 09:00", cr:3,status:"Confirmed"},
    {initials:"MW",name:"Marcus W.", cls:"Sunrise Flow",   when:"Wed 2 Apr 07:00", cr:2,status:"Confirmed"},
    {initials:"LM",name:"Lea M.",    cls:"Deep Yin",       when:"Sat 5 Apr 11:00", cr:2,status:"Pending"},
    {initials:"TR",name:"Tom R.",    cls:"Morning Yin",    when:"Tue 1 Apr 09:00", cr:2,status:"Confirmed"},
  ];
  function occ(booked,spots){
    const p=booked/spots;
    if(booked>=spots) return {bg:"#1E1B15",text:"#fff"};
    if(p>=0.75) return {bg:T.sageXL,text:T.sage};
    if(p>=0.4)  return {bg:T.ochreXL,text:T.ochre};
    return {bg:T.bg,text:T.stone2};
  }
  return (
    <div style={{minHeight:"calc(100vh - 100px)"}}>
      <div style={{background:T.sage,padding:"28px 28px 0"}}>
        <div style={{maxWidth:980,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12,marginBottom:28}}>
            <div>
              <div style={{fontFamily:F.body,fontSize:8,color:"rgba(255,255,255,.45)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:8}}>Business Dashboard</div>
              <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:26,fontWeight:700,color:"#fff",letterSpacing:"-0.5px",margin:"0 0 6px"}}>{bizData.name}</h1>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:"#a3d9a0",display:"inline-block",animation:"pulse 2s infinite"}}/>
                <span style={{fontFamily:F.body,fontSize:10,color:"rgba(255,255,255,.65)"}}>Live on marketplace</span>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <a href="#" style={{padding:"8px 16px",background:"rgba(255,255,255,.15)",color:"#fff",border:"1px solid rgba(255,255,255,.25)",borderRadius:2,fontFamily:F.body,fontSize:10,fontWeight:600,textDecoration:"none"}}>View listing</a>
              <button onClick={onExit} style={{padding:"8px 16px",background:"transparent",color:"rgba(255,255,255,.5)",border:"1px solid rgba(255,255,255,.15)",borderRadius:2,fontFamily:F.body,fontSize:10,cursor:"pointer",fontWeight:300}}>Close preview</button>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            {[
              {label:"Bookings this month",value:"24",      sub:"March 2026",       accent:T.ochreL},
              {label:"Credits redeemed",   value:"◈ 86",   sub:"this month",       accent:"rgba(255,255,255,.35)"},
              {label:"Payout due",         value:"€619.20",sub:"paid this Friday", accent:"#a3d9a0"},
              {label:"Avg rating",         value:"4.9",    sub:"38 reviews",       accent:T.ochreL},
            ].map(({label,value,sub,accent})=>(
              <div key={label} style={{background:"rgba(0,0,0,.18)",borderRadius:"4px 4px 0 0",padding:"16px 18px",borderTop:`3px solid ${accent}`}}>
                <div style={{fontFamily:F.body,fontSize:8,color:"rgba(255,255,255,.45)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:8}}>{label}</div>
                <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:28,fontWeight:700,color:"#fff",letterSpacing:"-1px",lineHeight:1,marginBottom:5}}>{value}</div>
                <div style={{fontFamily:F.body,fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:300}}>{sub}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",marginTop:4}}>
            {TABS.map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} style={{padding:"11px 18px",border:"none",borderBottom:`3px solid ${tab===k?"#fff":"transparent"}`,background:tab===k?"rgba(255,255,255,.12)":"transparent",color:tab===k?"#fff":"rgba(255,255,255,.5)",fontFamily:F.body,fontSize:11,fontWeight:tab===k?600:300,cursor:"pointer",transition:"all .13s"}}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{maxWidth:980,margin:"0 auto",padding:"28px 28px 58px"}}>

        {tab==="calendar"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <div>
                <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:15,fontWeight:700,color:T.ink,letterSpacing:"-0.3px"}}>{calWeek===0?"This week":"Next week"}</div>
                <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,marginTop:2}}>{WEEK_DATES[0]} to {WEEK_DATES[6]}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{display:"flex",gap:10,marginRight:4}}>
                  {[["Full","#1E1B15"],["75%+ booked",T.sageXL],["40%+ booked",T.ochreXL],["Available",T.bg]].map(([l,bg])=>(
                    <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                      <div style={{width:9,height:9,borderRadius:1,background:bg,border:`1px solid ${T.border}`}}/>
                      <span style={{fontFamily:F.body,fontSize:9,color:T.stone2}}>{l}</span>
                    </div>
                  ))}
                </div>
                <button onClick={()=>setCalWeek(0)} style={{padding:"5px 12px",background:calWeek===0?T.sage:"transparent",color:calWeek===0?"#fff":T.stone,border:`1px solid ${calWeek===0?T.sage:T.border}`,borderRadius:2,fontFamily:F.body,fontSize:10,cursor:"pointer",fontWeight:calWeek===0?600:300}}>This week</button>
                <button onClick={()=>setCalWeek(1)} style={{padding:"5px 12px",background:calWeek===1?T.sage:"transparent",color:calWeek===1?"#fff":T.stone,border:`1px solid ${calWeek===1?T.sage:T.border}`,borderRadius:2,fontFamily:F.body,fontSize:10,cursor:"pointer",fontWeight:calWeek===1?600:300}}>Next week</button>
              </div>
            </div>
            <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:4,overflow:"hidden",marginBottom:18}}>
              <div style={{display:"grid",gridTemplateColumns:"56px repeat(7,1fr)",background:T.bg,borderBottom:`1px solid ${T.border}`}}>
                <div style={{padding:"10px 8px"}}/>
                {WEEK_DAYS.map((d,i)=>(
                  <div key={d} style={{padding:"10px 6px",textAlign:"center",borderLeft:`1px solid ${T.border}`}}>
                    <div style={{fontFamily:F.body,fontSize:10,fontWeight:700,color:T.ink}}>{d}</div>
                    <div style={{fontFamily:F.body,fontSize:9,color:T.stone2,fontWeight:300,marginTop:1}}>{WEEK_DATES[i]}</div>
                  </div>
                ))}
              </div>
              {TIMES.map(time=>{
                if(!CLS.some(c=>c.time===time)) return null;
                return (
                  <div key={time} style={{display:"grid",gridTemplateColumns:"56px repeat(7,1fr)",borderBottom:`1px solid ${T.border}`}}>
                    <div style={{padding:"8px 6px",display:"flex",alignItems:"center",justifyContent:"center",borderRight:`1px solid ${T.border}`}}>
                      <span style={{fontFamily:F.body,fontSize:9,color:T.stone2,fontWeight:300}}>{time}</span>
                    </div>
                    {WEEK_DAYS.map((_,di)=>{
                      const c=CLS.find(x=>x.day===di&&x.time===time);
                      const o=c?occ(c.booked,c.spots):null;
                      return (
                        <div key={di} style={{borderLeft:`1px solid ${T.border}`,padding:"5px 4px",minHeight:58,display:"flex"}}>
                          {c?(
                            <div style={{flex:1,background:o.bg,borderRadius:3,padding:"6px 7px",cursor:"pointer",display:"flex",flexDirection:"column",justifyContent:"space-between"}}
                              onMouseEnter={e=>e.currentTarget.style.opacity=".78"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                              <div style={{fontFamily:F.body,fontSize:9,fontWeight:600,color:o.text,lineHeight:1.3}}>{c.name}</div>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                                <span style={{fontFamily:F.body,fontSize:8,color:o.text,opacity:.65}}>◈{c.credits}</span>
                                <span style={{fontFamily:F.body,fontSize:9,fontWeight:700,color:o.text}}>{c.booked===c.spots?"Full":`${c.booked}/${c.spots}`}</span>
                              </div>
                            </div>
                          ):<div style={{flex:1}}/>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:8,marginBottom:24}}>
              {WEEK_DAYS.map((d,i)=>{
                const dc=CLS.filter(c=>c.day===i);
                const b=dc.reduce((s,c)=>s+c.booked,0);
                const sp=dc.reduce((s,c)=>s+c.spots,0);
                const cr=dc.reduce((s,c)=>s+c.booked*c.credits,0);
                return (
                  <div key={d} style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,padding:"10px 11px"}}>
                    <div style={{fontFamily:F.body,fontSize:9,color:T.stone,fontWeight:600,marginBottom:4}}>{d}<br/><span style={{fontWeight:300,color:T.stone2,fontSize:8}}>{WEEK_DATES[i]}</span></div>
                    <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:17,fontWeight:700,color:b===sp?T.sage:T.ink,letterSpacing:"-0.3px"}}>{b}<span style={{fontSize:10,color:T.stone2,fontWeight:300}}>/{sp}</span></div>
                    <div style={{fontFamily:F.body,fontSize:8,color:T.stone2,fontWeight:300,marginTop:3}}>◈{cr}</div>
                  </div>
                );
              })}
            </div>
            <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:4,overflow:"hidden"}}>
              <div style={{padding:"13px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontFamily:F.body,fontSize:12,color:T.ink,fontWeight:600}}>Recent bookings</div>
                  <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,marginTop:2}}>Latest reservations across all your sessions</div>
                </div>
                <span style={{background:T.sageXL,color:T.sage,fontSize:9,padding:"3px 10px",borderRadius:2,fontFamily:F.body,fontWeight:600}}>{RECENT.length} this week</span>
              </div>
              <div style={{padding:"0 16px"}}>
                {RECENT.map((b,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 0",borderBottom:i<RECENT.length-1?`1px solid ${T.border}`:"none"}}>
                    <div style={{width:36,height:36,borderRadius:"50%",background:b.status==="Confirmed"?T.sageXL:T.ochreXL,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F.body,fontSize:10,color:b.status==="Confirmed"?T.sage:T.ochre,fontWeight:700,flexShrink:0}}>{b.initials}</div>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:600}}>{b.name}</div>
                      <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>{b.cls} · {b.when}</div>
                    </div>
                    <span style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,marginRight:8}}>◈ {b.cr}</span>
                    <span style={{background:b.status==="Confirmed"?T.sageXL:T.ochreXL,color:b.status==="Confirmed"?T.sage:T.ochre,fontSize:8,padding:"3px 9px",borderRadius:2,fontFamily:F.body,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px"}}>{b.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab==="bookings"&&(
          <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,overflow:"hidden"}}>
            <div style={{padding:"13px 16px",borderBottom:`1px solid ${T.border}`}}><div style={{fontFamily:F.body,fontSize:12,color:T.ink,fontWeight:600}}>All bookings</div></div>
            <div style={{padding:"0 16px"}}>
              {RECENT.map((b,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 0",borderBottom:i<RECENT.length-1?`1px solid ${T.border}`:"none"}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:b.status==="Confirmed"?T.sageXL:T.ochreXL,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F.body,fontSize:10,color:b.status==="Confirmed"?T.sage:T.ochre,fontWeight:700,flexShrink:0}}>{b.initials}</div>
                  <div style={{flex:1}}><div style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:600}}>{b.name}</div><div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>{b.cls} · {b.when}</div></div>
                  <span style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>◈ {b.cr}</span>
                  <span style={{background:b.status==="Confirmed"?T.sageXL:T.ochreXL,color:b.status==="Confirmed"?T.sage:T.ochre,fontSize:8,padding:"3px 9px",borderRadius:2,fontFamily:F.body,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px"}}>{b.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab==="statements"&&(
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,overflow:"hidden"}}>
              <div style={{padding:"13px 16px",borderBottom:`1px solid ${T.border}`}}>
                <div style={{fontFamily:F.body,fontSize:12,color:T.ink,fontWeight:600}}>Payout statements</div>
                <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,marginTop:2}}>Download for your monthly accounting records</div>
              </div>
              <div style={{padding:"0 16px"}}>
                {[
                  {date:"14 Mar 2026",credits:34,bookings:4,gross:306,commission:20,invNo:"WLO-2026-014"},
                  {date:"07 Mar 2026",credits:28,bookings:3,gross:252,commission:20,invNo:"WLO-2026-013"},
                  {date:"28 Feb 2026",credits:24,bookings:3,gross:216,commission:20,invNo:"WLO-2026-012"},
                  {date:"21 Feb 2026",credits:20,bookings:2,gross:180,commission:20,invNo:"WLO-2026-011"},
                ].map((row,i,arr)=>{
                  const net=(row.gross*(1-row.commission/100)).toFixed(2);
                  return (
                    <div key={row.date} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 0",borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
                      <div style={{flex:1}}>
                        <div style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:600,marginBottom:2}}>{row.invNo}</div>
                        <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>{row.date} · {row.credits} credits · {row.bookings} bookings</div>
                      </div>
                      <div style={{textAlign:"right",marginRight:12}}>
                        <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:16,fontWeight:700,color:T.ink,letterSpacing:"-0.3px"}}>€{net}</div>
                        <span style={{background:T.sageXL,color:T.sage,fontSize:8,padding:"2px 7px",borderRadius:2,fontFamily:F.body,fontWeight:700}}>Paid</span>
                      </div>
                      <button onClick={()=>printInvoice({
                        invoiceNo:row.invNo,date:row.date,businessName:bizData.name,businessAddress:"Mallorca",
                        vatNo:"—",iban:"On file",credits:row.credits,bookings:row.bookings,
                        grossValue:row.gross,commissionRate:row.commission,
                        commissionAmt:(row.gross*row.commission/100).toFixed(2),netPayout:net,
                      })} style={{padding:"8px 16px",background:T.ink,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:10,fontWeight:600,cursor:"pointer",flexShrink:0}}>Download PDF</button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:3,padding:"12px 14px"}}>
              <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,lineHeight:1.6}}>Payouts every Friday · 5.00 per credit · Contact hola@wello.es</div>
            </div>
          </div>
        )}

        {tab==="listing"&&(
          <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,padding:"20px"}}>
            <div style={{display:"flex",gap:16,marginBottom:18}}>
              <img src="https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=200&q=80" style={{width:120,height:90,objectFit:"cover",borderRadius:3,flexShrink:0}} alt=""/>
              <div>
                <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:16,fontWeight:700,color:T.ink,letterSpacing:"-0.3px",marginBottom:4}}>Sol and Alma Yoga</div>
                <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,lineHeight:1.6,marginBottom:10}}>Rooftop yoga overlooking the Tramuntana mountains.</div>
              </div>
            </div>
            <button style={{padding:"8px 18px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:11,fontWeight:600,cursor:"pointer"}}>Edit listing</button>
          </div>
        )}

        {tab==="analytics"&&(
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            {/* Summary cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
              {[
                {label:"Total sessions",value:"142",sub:"Last 6 months",color:T.sage},
                {label:"Customer loyalty",value:"68%",sub:"Return booking rate",color:T.sage},
                {label:"Avg credits/booking",value:"◈ 2.8",sub:"March 2026",color:T.ochre},
                {label:"Revenue this month",value:"€619",sub:"Paid this Friday",color:T.sage},
              ].map(({label,value,sub,color})=>(
                <div key={label} style={{background:T.paper,borderRadius:12,padding:"18px 20px",borderTop:`3px solid ${color}`}}>
                  <div style={{fontFamily:F.body,fontSize:9,color:T.stone,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:8,fontWeight:500}}>{label}</div>
                  <div style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:28,fontWeight:800,color:T.ink,letterSpacing:"-1px",lineHeight:1,marginBottom:4}}>{value}</div>
                  <div style={{fontFamily:F.body,fontSize:10,color:T.stone2,fontWeight:300}}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Monthly revenue bar chart */}
            <div style={{background:T.paper,borderRadius:12,padding:"22px 24px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:20}}>
                <div>
                  <div style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:14,fontWeight:700,color:T.ink,letterSpacing:"-0.3px"}}>Monthly revenue</div>
                  <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,marginTop:2}}>Credits redeemed × €5 · less commission</div>
                </div>
                <div style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:20,fontWeight:800,color:T.sage,letterSpacing:"-0.5px"}}>€619</div>
              </div>
              {(()=>{
                const months = [
                  {m:"Oct",v:280},{m:"Nov",v:340},{m:"Dec",v:290},{m:"Jan",v:410},
                  {m:"Feb",v:520},{m:"Mar",v:619},
                ];
                const max = Math.max(...months.map(x=>x.v));
                return (
                  <div style={{display:"flex",alignItems:"flex-end",gap:8,height:140}}>
                    {months.map(({m,v},i)=>{
                      const isLast = i===months.length-1;
                      const h = Math.round((v/max)*120);
                      return (
                        <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                          <div style={{fontFamily:F.body,fontSize:9,color:isLast?T.sage:T.stone2,fontWeight:isLast?700:300}}>€{v}</div>
                          <div style={{width:"100%",height:h,background:isLast?T.sage:T.bg3,borderRadius:"4px 4px 0 0",transition:"height .3s"}}/>
                          <div style={{fontFamily:F.body,fontSize:9,color:isLast?T.ink:T.stone2,fontWeight:isLast?700:300}}>{m}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Live bookings feed */}
            <div style={{background:T.paper,borderRadius:12,overflow:"hidden"}}>
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:14,fontWeight:700,color:T.ink,letterSpacing:"-0.3px"}}>Live bookings</div>
                  <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,marginTop:2}}>Real-time activity feed</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:"#4caf50",display:"inline-block",animation:"pulse 2s infinite"}}/>
                  <span style={{fontFamily:F.body,fontSize:9,color:T.sage,fontWeight:600}}>Live</span>
                </div>
              </div>
              <div style={{padding:"0 20px"}}>
                {RECENT.map((b,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 0",borderBottom:i<RECENT.length-1?`1px solid ${T.border}`:"none"}}>
                    <div style={{width:38,height:38,borderRadius:"50%",background:b.status==="Confirmed"?T.sageXL:T.ochreXL,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F.body,fontSize:11,color:b.status==="Confirmed"?T.sage:T.ochre,fontWeight:700,flexShrink:0}}>{b.initials}</div>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:F.body,fontSize:12,color:T.ink,fontWeight:600}}>{b.name}</div>
                      <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>{b.cls} · {b.when}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:F.body,fontSize:10,color:T.stone,marginBottom:3}}>◈ {b.cr}</div>
                      <span style={{background:b.status==="Confirmed"?T.sageXL:T.ochreXL,color:b.status==="Confirmed"?T.sage:T.ochre,fontSize:8,padding:"2px 8px",borderRadius:20,fontFamily:F.body,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px"}}>{b.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}


        {tab==="analytics"&&(
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
              {[
                {label:"Total sessions",value:"142",sub:"Last 6 months",color:T.sage},
                {label:"Customer loyalty",value:"68%",sub:"Return booking rate",color:T.sage},
                {label:"Avg credits/booking",value:"◈ 2.8",sub:"March 2026",color:T.ochre},
                {label:"Revenue this month",value:"€619",sub:"Paid this Friday",color:T.sage},
              ].map(({label,value,sub,color})=>(
                <div key={label} style={{background:T.paper,borderRadius:12,padding:"18px 20px",borderTop:`3px solid ${color}`}}>
                  <div style={{fontFamily:F.body,fontSize:9,color:T.stone,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:8,fontWeight:500}}>{label}</div>
                  <div style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:28,fontWeight:800,color:T.ink,letterSpacing:"-1px",lineHeight:1,marginBottom:4}}>{value}</div>
                  <div style={{fontFamily:F.body,fontSize:10,color:T.stone2,fontWeight:300}}>{sub}</div>
                </div>
              ))}
            </div>
            <div style={{background:T.paper,borderRadius:12,padding:"22px 24px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:20}}>
                <div>
                  <div style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:14,fontWeight:700,color:T.ink,letterSpacing:"-0.3px"}}>Monthly revenue</div>
                  <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,marginTop:2}}>Credits redeemed × €5 · less commission</div>
                </div>
                <div style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:20,fontWeight:800,color:T.sage,letterSpacing:"-0.5px"}}>€619</div>
              </div>
              {(()=>{
                const months=[{m:"Oct",v:280},{m:"Nov",v:340},{m:"Dec",v:290},{m:"Jan",v:410},{m:"Feb",v:520},{m:"Mar",v:619}];
                const max=Math.max(...months.map(x=>x.v));
                return (
                  <div style={{display:"flex",alignItems:"flex-end",gap:8,height:140}}>
                    {months.map(({m,v},i)=>{
                      const isLast=i===months.length-1;
                      const h=Math.round((v/max)*120);
                      return (
                        <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                          <div style={{fontFamily:F.body,fontSize:9,color:isLast?T.sage:T.stone2,fontWeight:isLast?700:300}}>€{v}</div>
                          <div style={{width:"100%",height:h,background:isLast?T.sage:T.bg3,borderRadius:"4px 4px 0 0"}}/>
                          <div style={{fontFamily:F.body,fontSize:9,color:isLast?T.ink:T.stone2,fontWeight:isLast?700:300}}>{m}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            <div style={{background:T.paper,borderRadius:12,overflow:"hidden"}}>
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontFamily:"'Manrope',system-ui,sans-serif",fontSize:14,fontWeight:700,color:T.ink,letterSpacing:"-0.3px"}}>Live bookings</div>
                  <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,marginTop:2}}>Real-time activity feed</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:"#4caf50",display:"inline-block",animation:"pulse 2s infinite"}}/>
                  <span style={{fontFamily:F.body,fontSize:9,color:T.sage,fontWeight:600}}>Live</span>
                </div>
              </div>
              <div style={{padding:"0 20px"}}>
                {RECENT.map((b,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 0",borderBottom:i<RECENT.length-1?`1px solid ${T.border}`:"none"}}>
                    <div style={{width:38,height:38,borderRadius:"50%",background:b.status==="Confirmed"?T.sageXL:T.ochreXL,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F.body,fontSize:11,color:b.status==="Confirmed"?T.sage:T.ochre,fontWeight:700,flexShrink:0}}>{b.initials}</div>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:F.body,fontSize:12,color:T.ink,fontWeight:600}}>{b.name}</div>
                      <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>{b.cls} · {b.when}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:F.body,fontSize:10,color:T.stone,marginBottom:3}}>◈ {b.cr}</div>
                      <span style={{background:b.status==="Confirmed"?T.sageXL:T.ochreXL,color:b.status==="Confirmed"?T.sage:T.ochre,fontSize:8,padding:"2px 8px",borderRadius:20,fontFamily:F.body,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px"}}>{b.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab==="settings"&&(
          <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,padding:"20px",display:"flex",flexDirection:"column",gap:14}}>
            {[["Contact email","hello@solyalmayoga.com"],["Phone","+34 971 234 567"],["IBAN","ES12 3456 7890 1234 5678"]].map(([l,v])=>(
              <div key={l}><FieldLabel>{l}</FieldLabel><input defaultValue={v} style={INP3} onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=T.border}/></div>
            ))}
            <button style={{alignSelf:"flex-start",padding:"8px 18px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:11,fontWeight:600,cursor:"pointer"}}>Save changes</button>
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// PAGE: BUSINESS PORTAL  (separate login/register entry point)
// ═══════════════════════════════════════════════════════════════
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
      setScreen(data.status==="approved" ? "dashboard" : "pending");
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
    <div style={{minHeight:"calc(100vh - 58px)",display:"flex",alignItems:"stretch",flexWrap:"wrap"}}>
      {/* Left — pitch */}
      <div style={{flex:"1 1 420px",background:T.sage,padding:"64px 52px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
        <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:11,fontWeight:400,color:T.ochreL,letterSpacing:"5px",textTransform:"uppercase",marginBottom:20}}>For businesses</div>
        <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:"clamp(28px,3.5vw,44px)",fontWeight:700,color:"#fff",lineHeight:1.1,letterSpacing:"-1px",margin:"0 0 18px"}}>Fill your off-peak slots.<br/>Reach more people.</h1>
        <p style={{fontFamily:F.body,fontSize:13,color:"rgba(255,255,255,.65)",lineHeight:1.75,margin:"0 0 32px",fontWeight:300,maxWidth:380}}>Wello connects your studio, gym or pool to local fitness enthusiasts, expats and tourists who want flexibility while on the island.</p>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {[["Access a ready market","Locals, expats and tourists actively searching"],["Fill your off-peak slots","Turn quieter sessions into real revenue"],["Built here, for here","A Mallorca-first platform that gets the island"]].map(([t,d])=>(
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
      <div style={{flex:"1 1 340px",background:T.paper,padding:"64px 52px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
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
            {date:"14 Mar 2026",credits:34,bookings:4,gross:306,commission:20,invNo:"WLO-2026-014"},
            {date:"07 Mar 2026",credits:28,bookings:3,gross:252,commission:20,invNo:"WLO-2026-013"},
            {date:"28 Feb 2026",credits:24,bookings:3,gross:216,commission:20,invNo:"WLO-2026-012"},
          ].map((row,i,arr)=>{
            const net=(row.gross*(1-row.commission/100)).toFixed(2);
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
  const [listings,setListings] = useState(LISTINGS);
  const [syncingIds,setSyncing]= useState({});
  const [selBiz,setSelBiz]     = useState(null);
  const [bkData,setBkData]     = useState(null);
  const [credits,setCredits]   = useState(6);
  const [bookings,setBookings] = useState([]);
  const [saved,setSaved]       = useState([1,5,9]);
  const [isBiz,setIsBiz]       = useState(false);
  const [toast,setToast]       = useState(null);
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

  const NAV=[{id:"home",l:"Home"},{id:"explore",l:"Explore"},{id:"credits",l:"Credits"},{id:"profile",l:"Profile"},{id:"biz-portal",l:"For Business"}];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Jost:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${T.bg};color:${T.ink};font-family:'Manrope','Jost',system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
        @keyframes su{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fi{from{opacity:0}to{opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
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

      {/* PROTOTYPE PREVIEW BAR — remove before public launch */}
      {!bizPreview&&<div style={{background:T.ink2,padding:"6px 20px",display:"flex",gap:10,alignItems:"center",justifyContent:"center",flexWrap:"wrap"}}>
        <span style={{fontFamily:F.body,fontSize:9,color:T.stone2,letterSpacing:"1px",textTransform:"uppercase"}}>Demo</span>
        <button onClick={()=>setBizPreview(true)} style={{padding:"4px 12px",background:"transparent",color:T.ochreL,border:`1px solid ${T.ochre}`,borderRadius:2,fontFamily:F.body,fontSize:9,cursor:"pointer",fontWeight:600,letterSpacing:".3px"}}>
          👁 Preview business console
        </button>
      </div>}
      {bizPreview&&<div style={{background:T.ink,padding:"5px 16px",display:"flex",gap:8,alignItems:"center",justifyContent:"flex-end"}}>
        <span style={{fontFamily:F.body,fontSize:9,color:T.stone2}}>Business console preview</span>
        <button onClick={()=>setBizPreview(false)} style={{padding:"3px 10px",background:"transparent",color:T.stone2,border:`1px solid ${T.border2}`,borderRadius:2,fontFamily:F.body,fontSize:9,cursor:"pointer"}}>✕ Exit preview</button>
      </div>}
      {bizPreview&&<BusinessPortalDashboard onExit={()=>setBizPreview(false)}/>}

      <div className={`min-h-screen bg-surface${bizPreview?" hidden":""}`}>

        {/* NAV — Stitch glassmorphism */}
        <nav className="fixed top-0 w-full z-50 bg-[#FBF9F4]/80 backdrop-blur-xl transition-all duration-300" style={{borderBottom:"1px solid rgba(195,200,188,0.2)"}}>
          <div className="flex justify-between items-center px-8 py-4 max-w-7xl mx-auto">
            <div className="flex items-center gap-12">
              <a onClick={()=>setView("home")} className="text-2xl font-bold tracking-tighter text-primary cursor-pointer select-none">wello</a>
              <div className="hidden md:flex items-center gap-8">
                {[{id:"explore",l:"Explore"},{id:"credits",l:"Credits"},{id:"biz-portal",l:"For Business"}].map(n=>(
                  <a key={n.id} onClick={()=>setView(n.id)}
                    className={`font-medium tracking-tight cursor-pointer transition-colors duration-300 ${view===n.id?"text-primary font-bold border-b-2 border-primary pb-1":"text-on-surface-variant hover:text-primary"}`}>
                    {n.l}
                  </a>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-5">
              <div className="hidden lg:flex items-center bg-surface-container rounded-full px-4 py-2 gap-2 text-on-surface-variant">
                <span className="text-sm">🔍</span>
                <span className="text-sm font-medium">Search</span>
              </div>
              <button onClick={()=>setView("profile")} className="text-primary hover:opacity-80 transition-opacity text-xl">🔔</button>
              <div onClick={()=>setView("credits")} className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-full cursor-pointer hover:opacity-90 transition-opacity">
                <span className="font-bold text-sm">◈ {credits}</span>
              </div>
              <div onClick={()=>setView("profile")} className="w-9 h-9 rounded-full bg-surface-container-highest flex items-center justify-center cursor-pointer font-bold text-sm text-primary">J</div>
            </div>
          </div>
        </nav>

        {/* PAGES */}
        {view==="home"       &&<HomePage listings={listings} bookings={bookings} onSelect={onSelect} savedIds={saved} onToggleSave={toggleSave} onSetView={setView} syncingIds={syncingIds}/>}
        {view==="explore"    &&<ExplorePage listings={listings} onSelect={onSelect} savedIds={saved} onToggleSave={toggleSave} syncingIds={syncingIds}/>}
        {view==="profile"    &&<ProfilePage bookings={bookings} savedIds={saved} listings={listings} credits={credits} onSelect={onSelect} onSetView={setView} isBiz={isBiz} onToggleBiz={()=>setIsBiz(v=>!v)}/>}
        {view==="biz-portal" &&<BusinessPortal onSetView={setView}/>}
        {view==="business"   &&<BusinessPage isBiz={true} onSetView={setView} onToggleBiz={()=>setIsBiz(v=>!v)}/>}
        {view==="credits"    &&<CreditsPage credits={credits} onPurchase={onPurchase}/>}

        {/* FOOTER — Stitch style */}
        <footer className="w-full py-12 bg-[#F5F3EE] border-t border-[#C3C8BC]/20">
          <div className="flex flex-col md:flex-row justify-between items-start px-12 max-w-7xl mx-auto gap-8">
            <div className="flex flex-col gap-3">
              <span className="font-bold text-[#213C18] text-xl tracking-tighter">wello</span>
              <p className="text-[#43483F] text-sm leading-relaxed max-w-xs">© 2026 Wello. Our Sustainability Commitment.</p>
            </div>
            <div className="flex flex-wrap gap-8">
              {["Privacy","Terms","Marketplace","Our Mission","Contact"].map(l=>(
                <a key={l} className="text-[#43483F] text-sm hover:underline decoration-2 underline-offset-4 opacity-80 hover:opacity-100 transition-opacity cursor-pointer">{l}</a>
              ))}
            </div>
            <div className="flex gap-4">
              <button className="w-10 h-10 rounded-full border border-outline-variant/30 flex items-center justify-center hover:bg-surface-container transition-colors text-sm">🌐</button>
            </div>
          </div>
        </footer>
      </div>

      {selBiz   &&<BizPanel biz={selBiz}        onClose={()=>setSelBiz(null)}  onBook={onBook}/>}
      {bkData   &&<BookingModal biz={bkData.biz} slot={bkData.slot} onClose={()=>setBkData(null)} onConfirm={onConfirm} credits={credits} onBuyCredits={()=>{setBkData(null);setView("credits");}}/>}
      <SyncEngine listings={listings} onUpdate={onSyncUpdate}/>
      <Chatbot listings={listings} credits={credits} bookings={bookings} onSelectBiz={onSelect}/>

      {/* Mobile bottom nav — Stitch Destination Rule */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-lg border-t border-outline-variant/10 px-6 py-3 z-50">
        <div className="flex justify-between items-center">
          {[{id:"home",icon:"🏠",l:"Home"},{id:"explore",icon:"🧭",l:"Explore"},{id:"credits",icon:"◈",l:"Credits"},{id:"profile",icon:"👤",l:"Profile"}].map(({id,icon,l})=>(
            <button key={id} onClick={()=>setView(id)} className={`flex flex-col items-center gap-1 bg-transparent border-none cursor-pointer ${view===id?"text-primary":"text-on-surface-variant"}`}>
              <span className="text-xl">{icon}</span>
              <span className={`text-[10px] font-medium ${view===id?"font-bold":""}`}>{l}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
