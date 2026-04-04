import { supabase } from './supabase.js'
import { useState, useEffect, useCallback, useRef } from "react";

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

// Copenhagen café palette: warm linen + dusty sage + aged clay + antique ochre
const T = {
  bg:      "#F5F0E8",
  bg2:     "#EDE8DF",
  bg3:     "#E4DDD0",
  paper:   "#FAF8F4",
  ink:     "#1E1B15",
  ink2:    "#3C3828",
  stone:   "#7C7260",
  stone2:  "#A89E8C",
  sage:    "#4E6B43",
  sage2:   "#3C5233",
  sageL:   "#C4D9BD",
  sageXL:  "#ECF3E9",
  moss:    "#89AB80",
  clay:    "#8C5D4A",
  clayL:   "#C49A86",
  clayXL:  "#F2E8E3",
  ochre:   "#B8925C",
  ochreL:  "#D6B47C",
  ochreXL: "#F7EDD8",
  border:  "#DDD6C8",
  border2: "#C9C1B0",
};

// ─── Credit system ────────────────────────────────────────────────────────────
// Credits expire 6 months from purchase. Booking fee: €2.99 per transaction.
// 1 credit ≈ €8–10 real-world value based on Mallorca market research.
const BUNDLES = [
  { id:"taster",   name:"Taster",    cr:10, price:29,  desc:"New to Wello? Try a handful of classes",         badge:null,         popular:false },
  { id:"explorer", name:"Explorer",  cr:24, price:59,  desc:"A week or two of varied island activity",        badge:"Most Popular",popular:true  },
  { id:"local",    name:"Local",     cr:52, price:119, desc:"A full month of regular wellness",               badge:"Best Value",  popular:false },
  { id:"islander", name:"Islander",  cr:110,price:229, desc:"Commit to the island lifestyle all season",      badge:null,         popular:false },
];
const BOOKING_FEE = 2.99;

// Market-researched Mallorca pricing (2025):
// Yoga drop-in: €18–20 · Pilates drop-in: €18–22 · Gym day pass: €15–20
// Hotel spa+gym day pass: €25–80 · Guided hike: €30–50pp · Spa treatment (60min): €60–90
// Pool day pass (resort): €30–60 · Fitness class drop-in: €15–18
// At ~€9/credit, credit costs are calibrated to give venues fair value
const CREDIT_PRICING = [
  { cat:"Yoga class",         offPeak:"2 credits  (≈€18)",  peak:"3 credits (≈€27)", example:"Drop-in classes, studios" },
  { cat:"Pilates class",      offPeak:"2 credits  (≈€18)",  peak:"3 credits (≈€27)", example:"Reformer & mat classes" },
  { cat:"Fitness class",      offPeak:"2 credits  (≈€18)",  peak:"2 credits (≈€18)", example:"HIIT, circuits, bootcamp" },
  { cat:"Gym day pass",       offPeak:"2 credits  (≈€18)",  peak:"3 credits (≈€27)", example:"Independent gyms" },
  { cat:"Hotel gym & pool",   offPeak:"3 credits  (≈€27)",  peak:"5 credits (≈€45)", example:"5-star hotel access" },
  { cat:"Pool day pass",      offPeak:"3 credits  (≈€27)",  peak:"5 credits (≈€45)", example:"Resort & rooftop pools" },
  { cat:"Outdoor adventure",  offPeak:"4 credits  (≈€36)",  peak:"5 credits (≈€45)", example:"Guided hikes, kayaking" },
  { cat:"Spa treatment",      offPeak:"7 credits  (≈€63)",  peak:"9 credits (≈€81)", example:"60-min massage & wellness" },
];

// Commission — admin-set only, never visible to businesses during registration
const COMMISSION_TIERS = [
  { id:"standard", label:"Standard",  rate:20, desc:"Default for new venues" },
  { id:"premium",  label:"Premium",   rate:18, desc:"Higher-volume venues" },
  { id:"partner",  label:"Partner",   rate:15, desc:"Strategic partners" },
];

// Admin panel — mock registered businesses
const ADMIN_BUSINESSES = [
  { id:"b1", name:"Sol & Alma Yoga",      cat:"Yoga",         loc:"Sóller",   commission:"standard", status:"live",    monthlyBookings:24, monthlyCredits:86  },
  { id:"b2", name:"Hospes Maricel",       cat:"Hotel Gym",    loc:"Palma",    commission:"partner",  status:"live",    monthlyBookings:18, monthlyCredits:90  },
  { id:"b3", name:"Deià Mountain Yoga",   cat:"Yoga",         loc:"Deià",     commission:"standard", status:"live",    monthlyBookings:12, monthlyCredits:36  },
  { id:"b4", name:"Olas Surf & Yoga",     cat:"Surfing",      loc:"Alcúdia",  commission:"premium",  status:"live",    monthlyBookings:9,  monthlyCredits:45  },
  { id:"b5", name:"Pollença HIIT Lab",    cat:"Fitness Class",loc:"Pollença", commission:"standard", status:"pending", monthlyBookings:0,  monthlyCredits:0   },
  { id:"b6", name:"Pure Palma Pool Club", cat:"Pool Access",  loc:"Palma",    commission:"premium",  status:"live",    monthlyBookings:31, monthlyCredits:155 },
];
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
  { id:1, name:"Sol & Alma Yoga", cat:"Yoga", loc:"Sóller", rating:4.9, reviews:127, cr:2,
    desc:"Rooftop yoga overlooking the Tramuntana mountains. Sunrise & sunset sessions with certified instructors.",
    img:"https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80",
    tags:["Rooftop","All Levels","Mountain Views"],
    slots:[{id:"s1",date:"2026-03-22",time:"07:00",dur:"75 min",spots:8,booked:3,name:"Sunrise Flow"},{id:"s2",date:"2026-03-22",time:"18:30",dur:"90 min",spots:10,booked:7,name:"Sunset Vinyasa"},{id:"s3",date:"2026-03-23",time:"07:00",dur:"75 min",spots:8,booked:1,name:"Sunrise Flow"}] },
  { id:2, name:"Hospes Maricel", cat:"Hotel Gym", loc:"Palma", rating:4.8, reviews:64, cr:3,
    desc:"Five-star hotel fitness centre with heated infinity pool and panoramic sea views. Day passes available.",
    img:"https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=600&q=80",
    tags:["5-Star","Infinity Pool","Sea Views"],
    slots:[{id:"s5",date:"2026-03-22",time:"06:30",dur:"Open",spots:15,booked:5,name:"Gym & Pool Pass"},{id:"s6",date:"2026-03-22",time:"16:00",dur:"Open",spots:15,booked:9,name:"Afternoon Access"},{id:"s7",date:"2026-03-23",time:"06:30",dur:"Open",spots:15,booked:2,name:"Gym & Pool Pass"}] },
  { id:3, name:"Tramuntana Flow", cat:"Pilates", loc:"Valldemossa", rating:5.0, reviews:43, cr:2,
    desc:"Reformer and mat Pilates inside a restored 18th-century farmhouse. Small groups, meticulous attention.",
    img:"https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&q=80",
    tags:["Reformer","Small Groups","Historic"],
    slots:[{id:"s8",date:"2026-03-22",time:"09:00",dur:"55 min",spots:6,booked:6,name:"Reformer"},{id:"s9",date:"2026-03-22",time:"11:00",dur:"55 min",spots:6,booked:2,name:"Mat Pilates"},{id:"s10",date:"2026-03-23",time:"09:00",dur:"55 min",spots:6,booked:0,name:"Intro Reformer"}] },
  { id:4, name:"Olas Surf & Yoga", cat:"Surfing", loc:"Alcúdia", rating:4.7, reviews:89, cr:4,
    desc:"North coast beach packages — paddle out at dawn, practice yoga as the sun rises over the bay.",
    img:"https://images.unsplash.com/photo-1515016886654-94c06b8a8c7d?w=600&q=80",
    tags:["Beach","Surf","Full Experience"],
    slots:[{id:"s12",date:"2026-03-22",time:"08:00",dur:"Half Day",spots:8,booked:5,name:"Surf + Yoga"},{id:"s13",date:"2026-03-23",time:"08:00",dur:"Half Day",spots:8,booked:1,name:"Surf + Yoga"}] },
  { id:5, name:"Cap Rocat Wellness", cat:"Pool Access", loc:"Palma", rating:4.9, reviews:52, cr:3,
    desc:"Fortress hotel — infinity pool carved into the cliffs, spa circuit and breathwork sessions. Extraordinary luxury.",
    img:"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=80",
    tags:["Luxury","Cliff Pool","Spa"],
    slots:[{id:"s15",date:"2026-03-22",time:"10:00",dur:"Full Day",spots:6,booked:2,name:"Pool & Spa Day"},{id:"s16",date:"2026-03-23",time:"10:00",dur:"Full Day",spots:6,booked:0,name:"Pool & Spa Day"}] },
  { id:6, name:"Deià Mountain Yoga", cat:"Yoga", loc:"Deià", rating:4.8, reviews:71, cr:2,
    desc:"Open-air platform in the artist village of Deià. Iyengar practice surrounded by ancient olive groves.",
    img:"https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=600&q=80",
    tags:["Outdoor","Iyengar","Olive Groves"],
    slots:[{id:"s18",date:"2026-03-22",time:"08:30",dur:"90 min",spots:10,booked:8,name:"Iyengar Morning"},{id:"s19",date:"2026-03-22",time:"17:00",dur:"90 min",spots:10,booked:4,name:"Restorative Evening"}] },
  { id:7, name:"Pollença HIIT Lab", cat:"Fitness Class", loc:"Pollença", rating:4.6, reviews:110, cr:1,
    desc:"High-intensity training in a converted mill. 45-minute sessions, expert coaching, maximum results.",
    img:"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=80",
    tags:["HIIT","Small Groups","Expert Coaches"],
    slots:[{id:"s21",date:"2026-03-22",time:"07:30",dur:"45 min",spots:14,booked:10,name:"HIIT Express"},{id:"s22",date:"2026-03-22",time:"12:00",dur:"45 min",spots:14,booked:6,name:"Lunchtime"},{id:"s24",date:"2026-03-23",time:"07:30",dur:"45 min",spots:14,booked:4,name:"HIIT Express"}] },
  { id:8, name:"Santanyí Sea Meditation", cat:"Meditation", loc:"Santanyí", rating:5.0, reviews:38, cr:2,
    desc:"Cliffside meditation and breathwork with the Mediterranean as your backdrop. Intimate and transformative.",
    img:"https://images.unsplash.com/photo-1593811167562-9cef47bfc4d7?w=600&q=80",
    tags:["Cliffside","Breathwork","Sea Views"],
    slots:[{id:"s25",date:"2026-03-22",time:"06:00",dur:"60 min",spots:8,booked:5,name:"Dawn Breathwork"},{id:"s26",date:"2026-03-22",time:"19:30",dur:"60 min",spots:8,booked:2,name:"Sunset Meditation"}] },
  { id:9, name:"Pure Palma Pool Club", cat:"Pool Access", loc:"Palma", rating:4.7, reviews:93, cr:2,
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
const F = { display:"'Jost',system-ui,sans-serif", body:"'Jost',system-ui,sans-serif" };

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
    <div style={{background:T.paper,borderRadius:4,overflow:"hidden",cursor:"pointer",transition:"transform .18s,box-shadow .18s",boxShadow:"0 1px 8px rgba(0,0,0,.06)",border:`1px solid ${T.border}`}}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 26px rgba(0,0,0,.1)"}}
      onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="0 1px 8px rgba(0,0,0,.06)"}}>
      <div style={{position:"relative",height:178}} onClick={()=>onSelect(biz)}>
        <img src={biz.img} alt={biz.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(30,27,21,.62) 0%,transparent 55%)"}}/>
        <div style={{position:"absolute",top:8,left:8}}><span style={{background:T.sage,color:"#fff",fontSize:8,padding:"2px 7px",borderRadius:2,fontFamily:F.body,letterSpacing:"1px",textTransform:"uppercase"}}>{biz.cat}</span></div>
        <button onClick={e=>{e.stopPropagation();onToggleSave(biz.id);}} style={{position:"absolute",top:7,right:7,background:"rgba(250,248,244,.88)",border:"none",width:24,height:24,borderRadius:2,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:saved?T.clay:T.stone2}}>
          {saved?"♥":"♡"}
        </button>
        <div style={{position:"absolute",bottom:7,left:8,right:8,display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          {syncing&&<div style={{display:"flex",alignItems:"center",gap:3,background:"rgba(30,27,21,.5)",borderRadius:2,padding:"2px 5px"}}><span style={{width:4,height:4,borderRadius:"50%",background:"#9dd4a0",display:"inline-block"}}/><span style={{fontFamily:F.body,fontSize:8,color:"#fff"}}>Live</span></div>}
          <div style={{marginLeft:"auto"}}><Cr n={biz.cr} size="sm"/></div>
        </div>
      </div>
      <div style={{padding:"10px 12px"}} onClick={()=>onSelect(biz)}>
        <h3 style={{fontFamily:F.display,fontSize:14,color:T.ink,margin:"0 0 3px",fontWeight:400,lineHeight:1.2}}>{biz.name}</h3>
        <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}><Stars n={biz.rating}/><span style={{color:T.stone2,fontSize:9,fontFamily:F.body}}>({biz.reviews}) · 📍 {biz.loc}</span></div>
        <p style={{fontFamily:F.body,color:T.stone,fontSize:10,lineHeight:1.5,margin:"0 0 7px",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",fontWeight:300}}>{biz.desc}</p>
        {next?<div style={{background:T.bg,borderRadius:2,padding:"4px 7px",display:"flex",justifyContent:"space-between",border:`1px solid ${T.border}`}}><span style={{fontSize:9,color:T.stone,fontFamily:F.body}}>{fd(next.date)} {next.time}</span><span style={{fontSize:9,color:T.sage,fontFamily:F.body,fontWeight:600}}>{next.spots-next.booked} left</span></div>
        :<div style={{background:T.clayXL,borderRadius:2,padding:"4px 7px",textAlign:"center",border:`1px solid ${T.clayL}`}}><span style={{fontSize:9,color:T.clay,fontFamily:F.body}}>All full · check back soon</span></div>}
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
  const [recs,setRecs]=useState([]); const [recsLoading,setRecsLoading]=useState(true);
  const [aiQ,setAiQ]=useState(""); const [aiLoading,setAiLoading]=useState(false);
  const [aiNote,setAiNote]=useState(""); const [aiResults,setAiResults]=useState(null);

  useEffect(()=>{
    (async()=>{
      const hist=bookings.length>0?bookings.map(b=>`${b.slot.name} at ${b.biz.name}`).join(", "):"New user";
      const ls=listings.map(b=>`ID:${b.id} "${b.name}" ${b.cat} ${b.loc} ◈${b.cr}`).join("\n");
      const r=await aiJSON(`Mallorca wellness concierge. Return ONLY JSON: {"recommendations":[{"id":1,"reason":"max 9 words"}]} — 3 items.`,`History:${hist}\nListings:\n${ls}`);
      if(r?.recommendations) setRecs(r.recommendations.map(x=>({biz:listings.find(b=>b.id===x.id),reason:x.reason})).filter(x=>x.biz));
      setRecsLoading(false);
    })();
  },[]);

  async function runAI() {
    if (!aiQ.trim()) return; setAiLoading(true);
    const ls=listings.map(b=>`ID:${b.id} "${b.name}" ${b.cat} ${b.loc} ◈${b.cr} tags:${b.tags.join(",")}`).join("\n");
    const r=await aiJSON(`Mallorca wellness search. Return ONLY JSON: {"ids":[1,2],"explanation":"short sentence max 12 words"}`,`Query:"${aiQ}"\nListings:\n${ls}`);
    if(r?.ids){setAiResults(listings.filter(b=>r.ids.includes(b.id)));setAiNote(r.explanation||"");}
    setAiLoading(false);
  }

  const poolGym=listings.filter(b=>["Hotel Gym","Pool Access"].includes(b.cat)); // kept for explore page reference

  return (
    <div>
      {/* ─ GREEN HERO ─ */}
      <div style={{background:`linear-gradient(155deg,${T.sage2} 0%,${T.sage} 55%,#5a7a51 100%)`,minHeight:460,position:"relative",overflow:"hidden",display:"flex",flexDirection:"column",justifyContent:"flex-end",padding:"0 0 44px"}}>
        <div style={{position:"absolute",inset:0,backgroundImage:"url('https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1400&q=65')",backgroundSize:"cover",backgroundPosition:"center top",opacity:.18}}/>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,rgba(60,82,51,.2) 0%,rgba(60,82,51,.82) 100%)"}}/>
        <div style={{maxWidth:1140,margin:"0 auto",padding:"0 28px",position:"relative",width:"100%"}}>
          {/* F1 hero wordmark — white name on sage, ochre descriptor */}
          <div style={{marginBottom:20}}>
            <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:"clamp(52px,7vw,88px)",fontWeight:700,color:"#fff",lineHeight:1,letterSpacing:"-3px"}}>wello</div>
            <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:11,fontWeight:400,color:T.ochreL,letterSpacing:"6px",marginTop:6,textTransform:"uppercase"}}>the wellness pass</div>
          </div>
          <p style={{fontFamily:F.body,color:"rgba(255,255,255,.6)",fontSize:13,lineHeight:1.7,margin:"0 0 22px",maxWidth:360,fontWeight:300}}>
            Your pass to studios, gyms, hotels, spas and outdoor adventures across Mallorca.
          </p>
          {/* AI Search */}
          <div style={{display:"flex",maxWidth:490,background:"rgba(250,248,244,.12)",backdropFilter:"blur(10px)",border:"1px solid rgba(255,255,255,.2)",borderRadius:3,overflow:"hidden",marginBottom:7}}>
            <span style={{padding:"0 12px",display:"flex",alignItems:"center",color:"rgba(255,255,255,.55)",fontSize:12,flexShrink:0}}>✦</span>
            <input value={aiQ} onChange={e=>setAiQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&runAI()}
              placeholder='Try "outdoor yoga under 2 credits" or "pool access Palma"…'
              style={{flex:1,padding:"11px 0",border:"none",outline:"none",fontFamily:F.body,fontSize:11,background:"transparent",color:"#fff"}}/>
            {aiResults&&<button onClick={()=>{setAiResults(null);setAiQ("");setAiNote("");}} style={{padding:"0 10px",background:"transparent",color:"rgba(255,255,255,.6)",border:"none",cursor:"pointer",fontSize:11,fontFamily:F.body}}>✕</button>}
            <button onClick={runAI} disabled={aiLoading||!aiQ.trim()} style={{padding:"0 16px",background:aiLoading?"rgba(255,255,255,.08)":"rgba(255,255,255,.22)",color:"#fff",border:"none",cursor:aiLoading||!aiQ.trim()?"not-allowed":"pointer",fontFamily:F.body,fontSize:11,fontWeight:600,flexShrink:0}}>
              {aiLoading?"…":"Search"}
            </button>
          </div>
          {aiNote&&<div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}><span style={{fontSize:9,color:T.ochreL}}>✦</span><span style={{fontFamily:F.body,fontSize:10,color:"rgba(255,255,255,.65)",fontStyle:"italic"}}>{aiNote}</span></div>}
          <div style={{display:"flex",gap:8,marginTop:22,flexWrap:"wrap"}}>
            <button onClick={()=>onSetView("explore")} style={{padding:"10px 20px",background:"#fff",color:T.sage,border:"none",borderRadius:2,fontFamily:F.body,fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:".4px"}} onMouseEnter={e=>e.target.style.opacity=".88"} onMouseLeave={e=>e.target.style.opacity="1"}>Explore all →</button>
            <button onClick={()=>onSetView("credits")} style={{padding:"10px 20px",background:"transparent",color:"#fff",border:"1px solid rgba(255,255,255,.35)",borderRadius:2,fontFamily:F.body,fontSize:11,cursor:"pointer",fontWeight:300}}>◈ Buy Credits</button>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1140,margin:"0 auto",padding:"34px 28px 0"}}>
        {/* ─ AI RECS ─ */}
        <div style={{marginBottom:30}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:13}}>
            <div style={{width:20,height:20,background:T.ochreXL,border:`1px solid ${T.ochreL}`,borderRadius:2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:T.ochre}}>✦</div>
            <span style={{fontFamily:F.body,fontSize:14,fontWeight:600,color:T.ink,letterSpacing:"-0.3px"}}>For you</span>
            <span style={{fontFamily:F.body,fontSize:8,color:T.stone2,letterSpacing:"1.5px",textTransform:"uppercase"}}>AI-powered</span>
          </div>
          {recsLoading?(
            <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,padding:"12px 14px",display:"flex",alignItems:"center",gap:7}}>
              <span style={{width:4,height:4,borderRadius:"50%",background:T.sage,display:"inline-block",animation:"pulse 1.2s infinite"}}/>
              <span style={{fontFamily:F.body,fontSize:11,color:T.stone}}>Finding your perfect classes…</span>
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(244px,1fr))",gap:10}}>
              {recs.map(({biz,reason})=>(
                <div key={biz.id} onClick={()=>onSelect(biz)} style={{background:T.paper,borderRadius:3,overflow:"hidden",cursor:"pointer",border:`1.5px solid ${T.ochreL}`,display:"flex",transition:"all .15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=T.ochre;e.currentTarget.style.boxShadow=`0 4px 16px rgba(184,146,92,.13)`}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=T.ochreL;e.currentTarget.style.boxShadow="none"}}>
                  <img src={biz.img} style={{width:80,objectFit:"cover",flexShrink:0}} alt=""/>
                  <div style={{padding:"9px 11px",flex:1}}>
                    <div style={{fontFamily:F.body,fontSize:8,color:T.ochre,letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:700,marginBottom:3}}>✦ AI Pick</div>
                    <div style={{fontFamily:F.body,fontSize:13,fontWeight:600,color:T.ink,marginBottom:2,letterSpacing:"-0.3px"}}>{biz.name}</div>
                    <div style={{fontFamily:F.body,fontSize:10,color:T.stone,lineHeight:1.4,marginBottom:5,fontWeight:300}}>{reason}</div>
                    <Cr n={biz.cr} size="sm"/>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─ BUSINESS CTA BANNER ─ */}
        <div style={{marginBottom:48,background:T.paper,borderRadius:4,border:`1px solid ${T.border}`,overflow:"hidden",display:"flex",flexWrap:"wrap"}}>
          {/* Left: pitch */}
          <div style={{flex:"1 1 300px",padding:"32px 32px"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:6,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:2,padding:"3px 9px",marginBottom:16}}>
              <span style={{width:4,height:4,borderRadius:"50%",background:T.sage,display:"inline-block"}}/>
              <span style={{fontFamily:F.body,fontSize:8,color:T.sage,letterSpacing:"2px",textTransform:"uppercase",fontWeight:600}}>Built for Mallorca businesses</span>
            </div>
            <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:24,color:T.ink,fontWeight:700,margin:"0 0 4px",lineHeight:1.15,letterSpacing:"-0.5px"}}>Fill your quiet hours.<br/>Reach more people.</h2>
            <p style={{fontFamily:F.body,fontSize:11,color:T.ochre,letterSpacing:"3px",textTransform:"uppercase",margin:"8px 0 14px",fontWeight:400}}>the wellness pass</p>
            <p style={{fontFamily:F.body,fontSize:13,color:T.stone,lineHeight:1.75,margin:"0 0 24px",fontWeight:300,maxWidth:360}}>Wello connects your studio, gym or pool to local fitness enthusiasts, expats and tourists who want flexibility while they're on the island — and can help fill some of your quieter hours.</p>
            <div style={{display:"flex",flexDirection:"column",gap:13,marginBottom:26}}>
              {[
                ["Access a ready market","Locals, expats and tourists actively searching for classes and experiences across the island."],
                ["Fill your off-peak slots","List your quieter sessions and turn empty spaces into real revenue without reducing your prices."],
                ["Built here, for here","Wello is a Mallorca-first platform, built to connect the island's best wellness businesses with the people who want them."],
              ].map(([title,desc])=>(
                <div key={title} style={{display:"flex",alignItems:"flex-start",gap:10}}>
                  <div style={{width:17,height:17,borderRadius:"50%",background:T.sageXL,border:`1px solid ${T.sageL}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
                    <span style={{fontSize:8,color:T.sage,fontWeight:700}}>✓</span>
                  </div>
                  <div>
                    <div style={{fontFamily:F.body,fontSize:12,color:T.ink,fontWeight:600,marginBottom:2}}>{title}</div>
                    <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,lineHeight:1.5}}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
              <button onClick={()=>onSetView("biz-portal")} style={{padding:"11px 22px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:"pointer",letterSpacing:".4px",transition:"background .15s"}} onMouseEnter={e=>e.target.style.background=T.sage2} onMouseLeave={e=>e.target.style.background=T.sage}>
                Register your interest →
              </button>
            </div>
          </div>
          {/* Right: social proof panel */}
          <div style={{flex:"0 1 240px",background:T.sage,padding:"32px 28px",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
            <div>
              <div style={{fontFamily:F.body,fontSize:8,letterSpacing:"2px",textTransform:"uppercase",color:"rgba(255,255,255,.45)",marginBottom:16}}>Perfect for</div>
              <div style={{display:"flex",flexDirection:"column",gap:11}}>
                {[["Studios","Yoga, pilates, meditation & more"],["Gyms","Independent gyms & day passes"],["Hotels","Gym access, pool days & spa"],["Outdoor adventures","Guided activities & experiences"],["Fitness classes","HIIT, circuits & group sessions"],["Pool days","Lap lanes, leisure & clubs"],["Spa treatments","Massage, recovery & wellness"]].map(([cat,sub])=>(
                  <div key={cat} style={{display:"flex",alignItems:"center",gap:9}}>
                    <div style={{width:5,height:5,borderRadius:"50%",background:T.ochreL,flexShrink:0}}/>
                    <div>
                      <div style={{fontFamily:F.body,fontSize:11,color:"rgba(255,255,255,.85)",fontWeight:500}}>{cat}</div>
                      <div style={{fontFamily:F.body,fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:300}}>{sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
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
    <div style={{maxWidth:1140,margin:"0 auto",padding:"32px 28px 58px"}}>
      <h1 style={{fontFamily:F.display,fontSize:24,color:T.ink,fontWeight:400,margin:"0 0 18px"}}>Explore</h1>
      <div style={{display:"flex",gap:0,background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,padding:"8px 12px",alignItems:"center",marginBottom:14,boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
        <span style={{color:T.stone2,fontSize:11,marginRight:9}}>⌕</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, location or category…"
          style={{flex:1,border:"none",outline:"none",fontFamily:F.body,fontSize:12,background:"transparent",color:T.ink,fontWeight:300}}/>
        {search&&<button onClick={()=>setSearch("")} style={{background:"transparent",border:"none",color:T.stone2,cursor:"pointer",fontSize:11,fontFamily:F.body}}>✕</button>}
      </div>
      <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:7,marginBottom:5,scrollbarWidth:"none"}}>
        {CATS.map(c=><Pill key={c} label={c} active={activeCat===c} onClick={()=>setActiveCat(c)}/>)}
      </div>
      <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:13,marginBottom:16,scrollbarWidth:"none"}}>
        {LOCS.map(l=><Pill key={l} label={l} active={activeLoc===l} onClick={()=>setActiveLoc(l)} color={T.clay}/>)}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <span style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300}}>{filtered.length} listing{filtered.length!==1?"s":""}</span>
        <div style={{display:"flex",alignItems:"center",gap:4,fontFamily:F.body,fontSize:9,color:T.stone2}}><span style={{width:4,height:4,borderRadius:"50%",background:T.moss,display:"inline-block",animation:"pulse 2s infinite"}}/>Live sync</div>
      </div>
      {filtered.length===0
        ?<div style={{textAlign:"center",padding:"78px 20px"}}><div style={{fontSize:24,marginBottom:10,color:T.stone2}}>∅</div><h3 style={{fontFamily:F.display,fontSize:17,color:T.ink,fontWeight:400,marginBottom:6}}>No results</h3><p style={{fontFamily:F.body,color:T.stone,fontSize:11,fontWeight:300}}>Try adjusting your filters</p></div>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(258px,1fr))",gap:14}}>{filtered.map(b=><Card key={b.id} biz={b} onSelect={onSelect} syncing={!!syncingIds[b.id]} saved={savedIds.includes(b.id)} onToggleSave={onToggleSave}/>)}</div>}
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
    <div style={{maxWidth:760,margin:"0 auto",padding:"32px 28px 58px"}}>
      {/* Account header */}
      <div style={{display:"flex",alignItems:"center",gap:15,marginBottom:24,padding:"19px 20px",background:T.paper,borderRadius:4,border:`1px solid ${T.border}`}}>
        <div style={{width:52,height:52,borderRadius:"50%",background:T.sage,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,color:"#fff",fontFamily:F.display,flexShrink:0}}>J</div>
        <div style={{flex:1}}>
          <h2 style={{fontFamily:F.display,fontSize:18,color:T.ink,margin:"0 0 2px",fontWeight:400}}>Jane Smith</h2>
          <p style={{fontFamily:F.body,fontSize:11,color:T.stone,margin:"0 0 7px",fontWeight:300}}>jane@example.com · Member since 2026</p>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <span style={{background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:2,padding:"3px 8px",fontSize:10,color:T.sage,fontFamily:F.body,fontWeight:600}}>◈ {credits}</span>
            <span style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:2,padding:"3px 8px",fontSize:10,color:T.stone,fontFamily:F.body}}>{bookings.length} booking{bookings.length!==1?"s":""}</span>
            {isBiz&&<span style={{background:T.ochreXL,border:`1px solid ${T.ochreL}`,borderRadius:2,padding:"3px 8px",fontSize:10,color:T.ochre,fontFamily:F.body,fontWeight:600}}>Business</span>}
          </div>
        </div>
        <button onClick={()=>onSetView("credits")} style={{padding:"6px 13px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:10,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>+ Credits</button>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,marginBottom:19}}>
        {TABS.map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={{padding:"7px 14px",border:"none",borderBottom:`2px solid ${tab===k?T.sage:"transparent"}`,background:"transparent",color:tab===k?T.sage:T.stone,fontFamily:F.body,fontSize:11,fontWeight:tab===k?600:300,cursor:"pointer",marginBottom:-1,transition:"all .13s"}}>{l}</button>)}
      </div>

      {/* Reservations */}
      {tab==="reservations"&&(bookings.length===0
        ?<div style={{textAlign:"center",padding:"55px",background:T.paper,borderRadius:3,border:`1px solid ${T.border}`}}><div style={{fontSize:24,marginBottom:9,color:T.stone2}}>📅</div><h3 style={{fontFamily:F.display,fontSize:17,color:T.ink,fontWeight:400,marginBottom:6}}>No reservations yet</h3><button onClick={()=>onSetView("explore")} style={{padding:"6px 17px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontWeight:600,cursor:"pointer",fontSize:10}}>Explore Classes</button></div>
        :<div style={{display:"flex",flexDirection:"column",gap:7}}>{bookings.map(bk=>(
          <div key={bk.id} style={{background:T.paper,borderRadius:3,border:`1px solid ${T.border}`,display:"flex",overflow:"hidden"}}>
            <div style={{width:78,flexShrink:0}}><img src={bk.biz.img} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>
            <div style={{padding:"11px 13px",flex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:5}}>
                <div><div style={{fontFamily:F.display,fontSize:13,color:T.ink,fontWeight:400,marginBottom:1}}>{bk.slot.name}</div><div style={{fontFamily:F.body,color:T.stone,fontSize:10,fontWeight:300}}>{bk.biz.name} · {bk.biz.loc}</div></div>
                <span style={{background:T.sageXL,color:T.sage,fontSize:8,padding:"2px 7px",borderRadius:2,fontFamily:F.body,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",alignSelf:"flex-start"}}>Confirmed</span>
              </div>
              <div style={{display:"flex",gap:10,marginTop:8,flexWrap:"wrap"}}>{[["📅",fd(bk.slot.date)],["⏰",bk.slot.time],["👤",`${bk.form.guests} guest${bk.form.guests>1?"s":""}`],["◈",`${bk.cost} credits`]].map(([ic,v])=><span key={v} style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>{ic} {v}</span>)}</div>
            </div>
          </div>
        ))}</div>
      )}

      {/* Saved */}
      {tab==="saved"&&(saved.length===0
        ?<div style={{textAlign:"center",padding:"55px",background:T.paper,borderRadius:3,border:`1px solid ${T.border}`}}><div style={{fontSize:24,marginBottom:9,color:T.stone2}}>♡</div><h3 style={{fontFamily:F.display,fontSize:17,color:T.ink,fontWeight:400,marginBottom:5}}>Nothing saved yet</h3><p style={{fontFamily:F.body,color:T.stone,fontSize:11,marginBottom:12,fontWeight:300}}>Tap ♡ on any listing</p><button onClick={()=>onSetView("explore")} style={{padding:"6px 17px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontWeight:600,cursor:"pointer",fontSize:10}}>Explore</button></div>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>{saved.map(b=>(
          <div key={b.id} onClick={()=>onSelect(b)} style={{background:T.paper,borderRadius:3,overflow:"hidden",cursor:"pointer",border:`1px solid ${T.border}`,transition:"all .14s"}} onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.08)"} onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
            <img src={b.img} style={{width:"100%",height:112,objectFit:"cover"}} alt=""/>
            <div style={{padding:"8px 10px"}}><div style={{fontFamily:F.display,fontSize:12,color:T.ink,fontWeight:400,marginBottom:1}}>{b.name}</div><div style={{fontFamily:F.body,fontSize:9,color:T.stone,fontWeight:300}}>📍 {b.loc}</div></div>
          </div>
        ))}</div>
      )}

      {/* Friends */}
      {tab==="friends"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300}}>{friends.length} friends</span><button style={{padding:"4px 11px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontSize:9,fontFamily:F.body,fontWeight:600,cursor:"pointer"}}>+ Invite</button></div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>{friends.map(f=>(
            <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 13px",background:T.paper,borderRadius:3,border:`1px solid ${T.border}`}}>
              <div style={{width:34,height:34,borderRadius:"50%",background:T.bg3,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:600,flexShrink:0}}>{f.init}</div>
              <div style={{flex:1}}><div style={{fontFamily:F.body,fontSize:12,color:T.ink,fontWeight:600}}>{f.name}</div><div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>📍 {f.loc} · {f.bio}</div></div>
              <button style={{padding:"4px 10px",background:"transparent",color:T.stone,border:`1px solid ${T.border}`,borderRadius:2,fontSize:9,fontFamily:F.body,cursor:"pointer"}}>View</button>
            </div>
          ))}</div>
        </div>
      )}

      {/* Settings */}
      {tab==="settings"&&(
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          {[{title:"Account Details",body:(
            <div style={{padding:"15px"}}>
              <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:12}}>
                {[{l:"Full Name",v:"Jane Smith"},{l:"Email",v:"jane@example.com"},{l:"Location",v:"Palma, Mallorca"}].map(f=>(
                  <div key={f.l}><FieldLabel>{f.l}</FieldLabel><input defaultValue={f.v} style={INP} onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=T.border}/></div>
                ))}
              </div>
              <button style={{padding:"6px 16px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:10,fontWeight:600,cursor:"pointer"}}>Save</button>
            </div>
          )},{title:"Account Type",body:(
            <div style={{padding:"15px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:9}}>
                <div><div style={{fontFamily:F.body,fontSize:12,color:T.ink,fontWeight:600,marginBottom:2}}>Business Account</div><div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300}}>List your venue and manage integrations.</div></div>
                <div onClick={onToggleBiz} style={{width:36,height:20,borderRadius:10,background:isBiz?T.sage:T.border2,cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
                  <div style={{position:"absolute",top:2,left:isBiz?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.18)"}}/>
                </div>
              </div>
              {isBiz&&<button onClick={()=>onSetView("business")} style={{padding:"6px 13px",background:T.ochreXL,color:T.ochre,border:`1px solid ${T.ochreL}`,borderRadius:2,fontFamily:F.body,fontSize:10,fontWeight:600,cursor:"pointer"}}>Manage Business →</button>}
            </div>
          )},{title:"Notifications",body:(
            <div style={{padding:"15px",display:"flex",flexDirection:"column",gap:9}}>
              {["Booking confirmations","Availability reminders","Weekly recommendations","New venues nearby"].map(l=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:300}}>{l}</span>
                  <div style={{width:30,height:17,borderRadius:9,background:T.sage,cursor:"pointer",position:"relative",flexShrink:0}}><div style={{position:"absolute",top:1.5,right:1.5,width:14,height:14,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,.18)"}}/></div>
                </div>
              ))}
            </div>
          )}].map(s=>(
            <div key={s.title} style={{background:T.paper,borderRadius:3,border:`1px solid ${T.border}`,overflow:"hidden"}}>
              <div style={{padding:"10px 15px",borderBottom:`1px solid ${T.border}`}}><Label>{s.title}</Label></div>
              {s.body}
            </div>
          ))}
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
    less the agreed Wello platform commission. Credit value is calculated at €9.00 per credit. If you have any queries regarding this
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
      const { data, error } = await supabase.from('businesses').insert({
        name: listing.name,
        category: listing.category,
        location: listing.location,
        email: listing.email,
        phone: listing.phone,
        notes: listing.notes || '',
        status: 'pending',
      });
      console.log('result:', data, error);
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
                <FieldLabel>Location *</FieldLabel>
                <select value={listing.location} onChange={e=>setListing(p=>({...p,location:e.target.value}))} style={INP3}>
                  {LOCS.filter(l=>l!=="All Mallorca").map(l=><option key={l}>{l}</option>)}
                </select>
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
        {["We review your registration","We call or email to discuss your venue and how Wello works","We agree a commission rate together","You receive login details and can set up your full listing","Your listing goes live on the marketplace"].map((s,i)=>(
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
// PAGE: ADD CREDITS
// ═══════════════════════════════════════════════════════════════
function CreditsPage({ credits, onPurchase }) {
  const [sel,setSel]=useState("explorer");
  const [pay,setPay]=useState("card");
  const [step,setStep]=useState(1);
  const [card,setCard]=useState({number:"",expiry:"",cvc:"",name:""});
  const [showPricing,setShowPricing]=useState(false);
  const bundle=BUNDLES.find(b=>b.id===sel);
  const fmtCard=v=>v.replace(/\D/g,"").slice(0,16).replace(/(.{4})/g,"$1 ").trim();
  const fmtExp=v=>{const d=v.replace(/\D/g,"").slice(0,4);return d.length>2?d.slice(0,2)+"/"+d.slice(2):d;};
  const expiryDate=()=>{const d=new Date();d.setMonth(d.getMonth()+6);return d.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});};

  const StepBar=()=>(
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:24}}>
      {[["1","Choose bundle"],["2","Payment"],["3","Done"]].map(([n,l],i)=>(
        <div key={n} style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:20,height:20,borderRadius:"50%",background:step>i?T.sage:step===i+1?T.sage:T.border,color:step>=i+1?"#fff":T.stone2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontFamily:F.body,fontWeight:600,transition:"background .2s"}}>{step>i+1?"✓":n}</div>
            <span style={{fontFamily:F.body,fontSize:10,color:step===i+1?T.sage:T.stone2,fontWeight:step===i+1?600:300}}>{l}</span>
          </div>
          {i<2&&<div style={{width:24,height:1,background:step>i+1?T.sage:T.border,transition:"background .2s"}}/>}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{maxWidth:660,margin:"0 auto",padding:"32px 28px 58px"}}>

      {/* ── STEP 1: Choose bundle ── */}
      {step===1&&(<>
        <StepBar/>

        {/* Balance card */}
        <div style={{background:`linear-gradient(138deg,${T.sage2},${T.sage})`,borderRadius:4,padding:"18px 22px",marginBottom:22,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",right:-10,top:-10,width:90,height:90,borderRadius:"50%",background:"rgba(255,255,255,.05)"}}/>
          <Label><span style={{color:"rgba(255,255,255,.5)"}}>Your balance</span></Label>
          <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:38,fontWeight:700,color:"#fff",lineHeight:1,letterSpacing:"-1px"}}>◈ {credits}</div>
          <div style={{display:"flex",gap:16,marginTop:5,flexWrap:"wrap"}}>
            <span style={{fontFamily:F.body,fontSize:10,color:"rgba(255,255,255,.5)",fontWeight:300}}>Credits expire 6 months from purchase</span>
            <span style={{fontFamily:F.body,fontSize:10,color:"rgba(255,255,255,.5)",fontWeight:300}}>€{BOOKING_FEE.toFixed(2)} booking fee per session</span>
          </div>
        </div>

        {/* How credits work — collapsible pricing table */}
        <div style={{background:T.ochreXL,border:`1px solid ${T.ochreL}`,borderRadius:3,padding:"12px 14px",marginBottom:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontFamily:F.body,fontSize:10,color:T.ochre,fontWeight:600}}>How credits work · different sessions cost different amounts</span>
            <button onClick={()=>setShowPricing(p=>!p)} style={{background:"transparent",border:"none",color:T.ochre,fontFamily:F.body,fontSize:10,fontWeight:600,cursor:"pointer",padding:0,flexShrink:0,marginLeft:8}}>{showPricing?"Hide ↑":"See pricing ↓"}</button>
          </div>
          {showPricing&&(
            <div style={{borderTop:`1px solid ${T.ochreL}`,marginTop:10,paddingTop:10}}>
              <div style={{display:"grid",gridTemplateColumns:"1.4fr .8fr .8fr",gap:0,marginBottom:6}}>
                {["","Off-peak","Peak"].map((h,i)=><div key={i} style={{fontFamily:F.body,fontSize:8,color:T.ochre,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",padding:"2px 0"}}>{h}</div>)}
              </div>
              {CREDIT_PRICING.map(r=>(
                <div key={r.cat} style={{display:"grid",gridTemplateColumns:"1.4fr .8fr .8fr",gap:0,padding:"6px 0",borderTop:`1px solid rgba(184,146,92,.15)`}}>
                  <div><div style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:600}}>{r.cat}</div><div style={{fontFamily:F.body,fontSize:9,color:T.stone2,fontWeight:300}}>{r.example}</div></div>
                  <div style={{fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:600,alignSelf:"center"}}>{r.offPeak}</div>
                  <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:400,alignSelf:"center"}}>{r.peak}</div>
                </div>
              ))}
              <div style={{marginTop:9,fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,lineHeight:1.5}}>Off-peak = before 9am or after 6pm on weekdays, or less popular slots set by the venue. A €{BOOKING_FEE.toFixed(2)} booking fee is charged per session booked, not per credit purchase.</div>
            </div>
          )}
        </div>

        {/* Bundle grid */}
        <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:15,fontWeight:600,color:T.ink,margin:"0 0 12px",letterSpacing:"-0.3px"}}>Choose a bundle</h2>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:9,marginBottom:18}}>
          {BUNDLES.map(b=>{
            const perCredit=(b.price/b.cr).toFixed(2);
            return (
              <div key={b.id} onClick={()=>setSel(b.id)} style={{border:`1.5px solid ${sel===b.id?T.sage:T.border}`,borderRadius:3,padding:"14px 13px",cursor:"pointer",background:sel===b.id?T.sageXL:T.paper,position:"relative",transition:"all .13s"}}
                onMouseEnter={e=>{if(sel!==b.id)e.currentTarget.style.borderColor=T.border2;}}
                onMouseLeave={e=>{if(sel!==b.id)e.currentTarget.style.borderColor=T.border;}}>
                {b.badge&&<div style={{position:"absolute",top:-8,right:10,background:sel===b.id?T.sage:b.popular?T.ochre:T.stone2,color:"#fff",fontSize:7,fontFamily:F.body,fontWeight:700,padding:"2px 7px",borderRadius:2,letterSpacing:"1px",textTransform:"uppercase",transition:"background .13s"}}>{b.badge}</div>}
                <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:14,fontWeight:600,color:T.ink,marginBottom:1,letterSpacing:"-0.3px"}}>{b.name}</div>
                <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:22,fontWeight:700,color:sel===b.id?T.sage:T.stone,marginBottom:3,letterSpacing:"-0.5px"}}>◈ {b.cr}</div>
                <div style={{fontFamily:F.body,fontSize:9,color:T.stone,marginBottom:8,lineHeight:1.4,fontWeight:300}}>{b.desc}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:17,fontWeight:700,color:T.ink,letterSpacing:"-0.3px"}}>€{b.price}</span>
                  <span style={{fontFamily:F.body,fontSize:8,color:T.stone2}}>€{perCredit}/credit</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary + expiry */}
        <div style={{background:T.bg,borderRadius:3,padding:"12px 14px",marginBottom:18,border:`1px solid ${T.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div><div style={{fontFamily:F.body,fontSize:9,color:T.stone,marginBottom:1,fontWeight:300}}>Credits after purchase</div><div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:16,fontWeight:700,color:T.ink,letterSpacing:"-0.3px"}}>◈ {credits+bundle.cr}</div></div>
            <div style={{textAlign:"right"}}><div style={{fontFamily:F.body,fontSize:9,color:T.stone,marginBottom:1,fontWeight:300}}>Total</div><div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:20,fontWeight:700,color:T.ink,letterSpacing:"-0.5px"}}>€{bundle.price}</div></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,borderTop:`1px solid ${T.border}`,paddingTop:8}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:T.ochre,display:"inline-block",flexShrink:0}}/>
            <span style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>These credits expire on <strong style={{fontWeight:600,color:T.ink}}>{expiryDate()}</strong></span>
          </div>
        </div>

        <button onClick={()=>setStep(2)} style={{width:"100%",padding:12,background:T.sage,color:"#fff",border:"none",borderRadius:3,fontSize:12,fontFamily:F.body,fontWeight:600,cursor:"pointer",letterSpacing:".4px",transition:"background .15s"}}
          onMouseEnter={e=>e.target.style.background=T.sage2} onMouseLeave={e=>e.target.style.background=T.sage}>
          Choose payment method →
        </button>
      </>)}

      {/* ── STEP 2: Payment ── */}
      {step===2&&(<>
        <StepBar/>
        <button onClick={()=>setStep(1)} style={{display:"flex",alignItems:"center",gap:4,background:"transparent",border:"none",color:T.stone,fontFamily:F.body,fontSize:11,cursor:"pointer",marginBottom:18,padding:0,fontWeight:300}}>← Back</button>
        <div style={{background:`linear-gradient(138deg,${T.sage2},${T.sage})`,borderRadius:3,padding:"13px 16px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",right:12,top:8,opacity:.08,fontSize:40,color:"#fff"}}>◈</div>
          <div><Label><span style={{color:"rgba(255,255,255,.5)"}}>Order summary</span></Label>
          <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:15,fontWeight:600,color:"#fff",letterSpacing:"-0.3px"}}>{bundle.name} · ◈ {bundle.cr} credits</div>
          <div style={{fontFamily:F.body,fontSize:10,color:"rgba(255,255,255,.5)",marginTop:2,fontWeight:300}}>Expires {expiryDate()}</div></div>
          <div style={{textAlign:"right",flexShrink:0}}><div style={{fontFamily:F.body,fontSize:9,color:"rgba(255,255,255,.5)",marginBottom:2,fontWeight:300}}>Total</div><div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:20,fontWeight:700,color:"#fff",letterSpacing:"-0.5px"}}>€{bundle.price}</div></div>
        </div>
        <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:14,fontWeight:600,color:T.ink,margin:"0 0 11px",letterSpacing:"-0.3px"}}>Payment method</h2>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:18}}>
          {PAY.map(pm=>(
            <div key={pm.id} onClick={()=>setPay(pm.id)} style={{border:`1.5px solid ${pay===pm.id?T.sage:T.border}`,borderRadius:3,padding:"11px 13px",cursor:"pointer",background:pay===pm.id?T.sageXL:T.paper,display:"flex",alignItems:"center",gap:9,transition:"all .13s"}}>
              <div style={{width:18,textAlign:"center",fontFamily:F.body,fontSize:pm.id==="google"?12:14,color:pay===pm.id?T.sage:T.stone,fontWeight:600,flexShrink:0}}>{pm.id==="card"?"▬":pm.id==="apple"?"⌘":pm.id==="google"?"G":"₱"}</div>
              <div><div style={{fontFamily:F.body,fontSize:11,color:pay===pm.id?T.sage:T.ink,fontWeight:pay===pm.id?600:400}}>{pm.label}</div><div style={{fontFamily:F.body,fontSize:9,color:T.stone2,fontWeight:300}}>{pm.sub}</div></div>
            </div>
          ))}
        </div>
        {pay==="card"?(
          <div style={{background:T.paper,borderRadius:3,border:`1px solid ${T.border}`,padding:"15px",display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
            {[{l:"Cardholder Name",k:"name",p:"Jane Smith",tf:v=>v},{l:"Card Number",k:"number",p:"4242 4242 4242 4242",tf:fmtCard}].map(f=>(
              <div key={f.k}><FieldLabel>{f.l}</FieldLabel><input placeholder={f.p} value={card[f.k]} onChange={e=>setCard(p=>({...p,[f.k]:f.tf(e.target.value)}))} style={INP} onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=T.border}/></div>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[{l:"Expiry",k:"expiry",p:"MM/YY",tf:fmtExp},{l:"CVC",k:"cvc",p:"123",tf:v=>v.replace(/\D/g,"").slice(0,3)}].map(f=>(
                <div key={f.k}><FieldLabel>{f.l}</FieldLabel><input placeholder={f.p} value={card[f.k]} onChange={e=>setCard(p=>({...p,[f.k]:f.tf(e.target.value)}))} style={INP} onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=T.border}/></div>
              ))}
            </div>
          </div>
        ):(
          <div style={{background:T.paper,borderRadius:3,border:`1px solid ${T.border}`,padding:"16px",marginBottom:14,textAlign:"center"}}>
            <div style={{fontSize:22,marginBottom:6}}>{pay==="apple"?"🍎":pay==="google"?"G":"🅿"}</div>
            <div style={{fontFamily:F.body,fontSize:12,color:T.stone,fontWeight:300}}>You'll be redirected to {PAY.find(p=>p.id===pay)?.label} to complete payment</div>
          </div>
        )}
        <button onClick={()=>{onPurchase(bundle);setStep(3);}} style={{width:"100%",padding:12,background:T.sage,color:"#fff",border:"none",borderRadius:3,fontSize:12,fontFamily:F.body,fontWeight:600,cursor:"pointer",letterSpacing:".4px",marginBottom:8,transition:"background .15s"}}
          onMouseEnter={e=>e.target.style.background=T.sage2} onMouseLeave={e=>e.target.style.background=T.sage}>
          Pay €{bundle.price} · Get ◈ {bundle.cr} credits
        </button>
        <div style={{textAlign:"center"}}><span style={{fontSize:9,color:T.stone2,fontFamily:F.body,fontWeight:300}}>🔒 Secured by Stripe · Credits expire in 6 months · €{BOOKING_FEE.toFixed(2)} booking fee per session</span></div>
      </>)}

      {/* ── STEP 3: Confirmation ── */}
      {step===3&&(
        <div style={{textAlign:"center",padding:"52px 20px"}}>
          <div style={{width:52,height:52,background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:20,color:T.sage}}>✓</div>
          <h2 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:20,fontWeight:700,color:T.ink,margin:"0 0 6px",letterSpacing:"-0.5px"}}>Credits added</h2>
          <p style={{fontFamily:F.body,color:T.stone,fontSize:12,marginBottom:2,fontWeight:300}}>◈ {bundle.cr} {bundle.name} credits added to your wallet</p>
          <p style={{fontFamily:F.body,color:T.stone2,fontSize:11,marginBottom:2,fontWeight:300}}>New balance: <strong style={{color:T.ink,fontWeight:600}}>◈ {credits+bundle.cr}</strong></p>
          <p style={{fontFamily:F.body,color:T.stone2,fontSize:10,fontWeight:300}}>These credits expire on {expiryDate()}</p>
          <div style={{marginTop:18,background:T.ochreXL,border:`1px solid ${T.ochreL}`,borderRadius:3,padding:"10px 14px",display:"inline-block",textAlign:"left"}}>
            <div style={{fontFamily:F.body,fontSize:10,color:T.ochre,fontWeight:600,marginBottom:2}}>Remember</div>
            <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>A €{BOOKING_FEE.toFixed(2)} booking fee applies each time you reserve a session.</div>
          </div>
          <br/><button onClick={()=>setStep(1)} style={{marginTop:20,padding:"8px 22px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontSize:11,fontFamily:F.body,fontWeight:600,cursor:"pointer"}}>Buy More</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN PANEL — password protected, not in public nav
// Access via: add ?admin=true to the URL, then enter password
// ═══════════════════════════════════════════════════════════════
const ADMIN_PASSWORD = "wello2026";

function AdminPanel({ onExit, skipAuth=false }) {
  const [auth, setAuth]           = useState(skipAuth);
  const [pw, setPw]               = useState("");
  const [pwErr, setPwErr]         = useState(false);
  const [businesses, setBusinesses] = useState(ADMIN_BUSINESSES.map(b=>({...b})));
  const [tab, setTab]             = useState("businesses");
  const [editingId, setEditingId] = useState(null);
  const [saved, setSaved]         = useState({});

  function login() {
    if (pw === ADMIN_PASSWORD) { setAuth(true); setPwErr(false); }
    else { setPwErr(true); }
  }

  function setCommission(id, tier) {
    setBusinesses(prev => prev.map(b => b.id===id ? {...b, commission:tier} : b));
    setSaved(p=>({...p,[id]:true}));
    setTimeout(()=>setSaved(p=>{const n={...p};delete n[id];return n;}), 1800);
  }

  function setStatus(id, status) {
    setBusinesses(prev => prev.map(b => b.id===id ? {...b, status} : b));
  }

  const totalCredits = businesses.reduce((s,b)=>s+b.monthlyCredits,0);
  const totalBookings = businesses.reduce((s,b)=>s+b.monthlyBookings,0);
  const liveCount = businesses.filter(b=>b.status==="live").length;

  const INP3={width:"100%",padding:"8px 10px",border:`1px solid ${T.border}`,borderRadius:2,fontSize:11,fontFamily:F.body,background:T.paper,color:T.ink,outline:"none",boxSizing:"border-box"};

  if (!auth) return (
    <div style={{minHeight:"100vh",background:T.ink,display:"flex",alignItems:"center",justifyContent:"center",padding:28}}>
      <div style={{background:T.paper,borderRadius:4,padding:"36px 32px",maxWidth:360,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}>
        <div style={{marginBottom:24}}>
          <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:22,fontWeight:700,color:T.sage,letterSpacing:"-0.5px"}}>wello</div>
          <div style={{fontFamily:F.body,fontSize:8,color:T.ochre,letterSpacing:"4px",textTransform:"uppercase",marginTop:2}}>admin panel</div>
        </div>
        <FieldLabel>Password</FieldLabel>
        <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setPwErr(false);}}
          onKeyDown={e=>e.key==="Enter"&&login()}
          placeholder="Enter admin password"
          style={{...INP3,marginBottom:pwErr?6:14,borderColor:pwErr?T.clay:T.border}}/>
        {pwErr&&<div style={{fontFamily:F.body,fontSize:10,color:T.clay,marginBottom:12}}>Incorrect password.</div>}
        <button onClick={login} style={{width:"100%",padding:"10px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:"pointer"}}>Sign in →</button>
        <button onClick={onExit} style={{width:"100%",marginTop:8,padding:"8px",background:"transparent",color:T.stone,border:`1px solid ${T.border}`,borderRadius:2,fontFamily:F.body,fontSize:11,cursor:"pointer",fontWeight:300}}>← Back to wello</button>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:T.bg}}>
      {/* Admin header */}
      <header style={{background:T.ink,padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",height:54}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:18,fontWeight:700,color:T.sage,letterSpacing:"-0.5px"}}>wello</div>
          <div style={{width:1,height:18,background:T.ink2}}/>
          <div style={{fontFamily:F.body,fontSize:9,color:T.stone2,letterSpacing:"2px",textTransform:"uppercase"}}>Admin Panel</div>
          <div style={{background:"rgba(184,146,92,.15)",border:`1px solid ${T.ochre}`,borderRadius:2,padding:"2px 8px"}}>
            <span style={{fontFamily:F.body,fontSize:8,color:T.ochre,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase"}}>Private</span>
          </div>
        </div>
        <button onClick={onExit} style={{background:"transparent",border:`1px solid ${T.ink2}`,color:T.stone2,fontFamily:F.body,fontSize:10,cursor:"pointer",padding:"5px 12px",borderRadius:2}}>← Exit admin</button>
      </header>

      <div style={{maxWidth:960,margin:"0 auto",padding:"28px 28px 58px"}}>

        {/* Stats row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:24}}>
          {[["Live venues",liveCount],["Total bookings",totalBookings+" this month"],["Credits redeemed",totalCredits+" ◈ this month"],["Pending review",businesses.filter(b=>b.status==="pending").length]].map(([l,v])=>(
            <div key={l} style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,padding:"12px 14px"}}>
              <Label>{l}</Label>
              <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:20,fontWeight:700,color:T.ink,letterSpacing:"-0.3px"}}>{v}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,marginBottom:22}}>
          {[["businesses","Businesses & Commission"],["applications","Applications"],["pricing","Credit Pricing"],["payouts","Payouts"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{padding:"7px 16px",border:"none",borderBottom:`2px solid ${tab===k?T.sage:"transparent"}`,background:"transparent",color:tab===k?T.sage:T.stone,fontFamily:F.body,fontSize:11,fontWeight:tab===k?600:300,cursor:"pointer",marginBottom:-1,transition:"all .13s",display:"flex",alignItems:"center",gap:5}}>
              {l}
              {k==="applications"&&MOCK_APPLICATIONS.filter(a=>a.status==="pending").length>0&&(
                <span style={{background:T.ochre,color:"#fff",fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:10,fontFamily:F.body}}>{MOCK_APPLICATIONS.filter(a=>a.status==="pending").length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Applications tab */}
        {tab==="applications"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,marginBottom:4}}>New business registrations waiting for your review. Approve to give them dashboard access and agree their commission rate.</div>
            {MOCK_APPLICATIONS.length===0&&<div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,padding:"28px",textAlign:"center",fontFamily:F.body,fontSize:12,color:T.stone2}}>No applications yet.</div>}
            {MOCK_APPLICATIONS.map(app=>(
              <div key={app.id} style={{background:T.paper,border:`1px solid ${app.status==="approved"?T.sageL:app.status==="rejected"?T.clayL:T.border}`,borderRadius:3,overflow:"hidden",transition:"border-color .2s"}}>
                <div style={{padding:"14px 16px",display:"flex",alignItems:"flex-start",gap:14,flexWrap:"wrap"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                      <div style={{fontFamily:F.body,fontSize:12,color:T.ink,fontWeight:600}}>{app.name}</div>
                      <span style={{
                        background:app.status==="approved"?T.sageXL:app.status==="rejected"?T.clayXL:T.ochreXL,
                        color:app.status==="approved"?T.sage:app.status==="rejected"?T.clay:T.ochre,
                        fontSize:8,padding:"2px 7px",borderRadius:2,fontFamily:F.body,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px"
                      }}>{app.status}</span>
                    </div>
                    <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                      {[[app.cat,null],[app.loc,null],[app.email,"📧"],[app.phone,"📞"]].map(([v,icon],i)=>v&&(
                        <span key={i} style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>{icon&&icon+" "}{v}</span>
                      ))}
                    </div>
                    <div style={{fontFamily:F.body,fontSize:9,color:T.stone2,marginTop:5,fontWeight:300}}>Submitted {app.submittedAt}</div>
                  </div>
                  {app.status==="pending"&&(
                    <div style={{display:"flex",gap:7,flexShrink:0}}>
                      <button style={{padding:"8px 16px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:11,fontWeight:600,cursor:"pointer",transition:"background .15s"}}
                        onMouseEnter={e=>e.target.style.background=T.sage2} onMouseLeave={e=>e.target.style.background=T.sage}>
                        ✓ Approve
                      </button>
                      <button style={{padding:"8px 14px",background:"transparent",color:T.clay,border:`1px solid ${T.clayL}`,borderRadius:2,fontFamily:F.body,fontSize:11,cursor:"pointer",fontWeight:300}}>
                        Reject
                      </button>
                    </div>
                  )}
                  {app.status==="approved"&&(
                    <span style={{fontFamily:F.body,fontSize:10,color:T.sage,fontWeight:600,alignSelf:"center"}}>✓ Approved — live on marketplace</span>
                  )}
                </div>
                {app.status==="pending"&&(
                  <div style={{padding:"9px 16px",borderTop:`1px solid ${T.border}`,background:T.bg,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                    <span style={{fontFamily:F.body,fontSize:9,color:T.stone,fontWeight:300}}>Set commission before approving:</span>
                    <div style={{display:"flex",gap:6}}>
                      {COMMISSION_TIERS.map(t=>(
                        <button key={t.id} style={{padding:"4px 10px",background:T.paper,color:T.stone,border:`1px solid ${T.border}`,borderRadius:2,fontFamily:F.body,fontSize:9,cursor:"pointer",fontWeight:300}}>
                          {t.rate}% {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Businesses & Commission tab */}
        {tab==="businesses"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,marginBottom:4}}>Set the commission rate for each registered business. Businesses cannot see or change this value.</div>
            {businesses.map(biz=>{
              const tier = COMMISSION_TIERS.find(t=>t.id===biz.commission);
              const monthlyPayout = biz.monthlyCredits * 9 * (1 - tier.rate/100);
              const monthlyCommission = biz.monthlyCredits * 9 * (tier.rate/100);
              return (
                <div key={biz.id} style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,overflow:"hidden",transition:"border-color .15s"}}>
                  <div style={{padding:"14px 16px",display:"flex",alignItems:"flex-start",gap:14,flexWrap:"wrap"}}>
                    {/* Business info */}
                    <div style={{flex:"1 1 200px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <div style={{fontFamily:F.body,fontSize:12,color:T.ink,fontWeight:600}}>{biz.name}</div>
                        <span style={{background:biz.status==="live"?T.sageXL:T.ochreXL,color:biz.status==="live"?T.sage:T.ochre,fontSize:8,padding:"1px 6px",borderRadius:2,fontFamily:F.body,fontWeight:700,textTransform:"uppercase",letterSpacing:"1px"}}>{biz.status}</span>
                      </div>
                      <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300}}>{biz.cat} · {biz.loc}</div>
                      {biz.status==="live"&&<div style={{fontFamily:F.body,fontSize:10,color:T.stone2,marginTop:3,fontWeight:300}}>{biz.monthlyBookings} bookings · ◈ {biz.monthlyCredits} credits this month</div>}
                    </div>

                    {/* Commission selector */}
                    <div style={{flex:"0 1 340px"}}>
                      <FieldLabel>Commission rate</FieldLabel>
                      <div style={{display:"flex",gap:6}}>
                        {COMMISSION_TIERS.map(t=>(
                          <div key={t.id} onClick={()=>setCommission(biz.id, t.id)}
                            style={{flex:1,padding:"7px 8px",borderRadius:2,border:`1.5px solid ${biz.commission===t.id?T.sage:T.border}`,background:biz.commission===t.id?T.sageXL:T.bg,cursor:"pointer",textAlign:"center",transition:"all .13s"}}>
                            <div style={{fontFamily:F.body,fontSize:11,color:biz.commission===t.id?T.sage:T.ink,fontWeight:biz.commission===t.id?700:400}}>{t.rate}%</div>
                            <div style={{fontFamily:F.body,fontSize:8,color:T.stone2,fontWeight:300}}>{t.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Payout calc */}
                    <div style={{flex:"0 1 160px",textAlign:"right"}}>
                      <div style={{fontFamily:F.body,fontSize:9,color:T.stone,fontWeight:300,marginBottom:2}}>Est. monthly payout</div>
                      <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:16,fontWeight:700,color:T.ink,letterSpacing:"-0.3px"}}>€{monthlyPayout.toFixed(0)}</div>
                      <div style={{fontFamily:F.body,fontSize:9,color:T.sage,fontWeight:300}}>Wello earns €{monthlyCommission.toFixed(0)}</div>
                      {saved[biz.id]&&<div style={{fontFamily:F.body,fontSize:9,color:T.sage,fontWeight:600,marginTop:4}}>✓ Saved</div>}
                    </div>
                  </div>

                  {/* Status controls */}
                  <div style={{padding:"8px 16px",borderTop:`1px solid ${T.border}`,background:T.bg,display:"flex",gap:7,alignItems:"center"}}>
                    <span style={{fontFamily:F.body,fontSize:9,color:T.stone,fontWeight:300}}>Status:</span>
                    {["pending","live","suspended"].map(s=>(
                      <button key={s} onClick={()=>setStatus(biz.id,s)} style={{padding:"3px 9px",background:biz.status===s?T.ink:T.paper,color:biz.status===s?"#fff":T.stone,border:`1px solid ${biz.status===s?T.ink:T.border}`,borderRadius:2,fontFamily:F.body,fontSize:9,cursor:"pointer",fontWeight:biz.status===s?600:300,textTransform:"capitalize"}}>{s}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Credit pricing tab */}
        {tab==="pricing"&&(
          <div>
            <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,marginBottom:16,lineHeight:1.6}}>Credit pricing is based on Mallorca market research (2025). 1 credit ≈ €9 real-world value. Off-peak = before 9am or after 6pm weekdays.</div>
            <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"1.2fr 1.3fr 1.3fr 1.4fr",padding:"10px 16px",borderBottom:`1px solid ${T.border}`,background:T.bg}}>
                {["Category","Off-peak","Peak","Market rate reference"].map(h=><div key={h} style={{fontFamily:F.body,fontSize:8,color:T.stone,letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:600}}>{h}</div>)}
              </div>
              {CREDIT_PRICING.map((r,i)=>(
                <div key={r.cat} style={{display:"grid",gridTemplateColumns:"1.2fr 1.3fr 1.3fr 1.4fr",padding:"12px 16px",borderBottom:i<CREDIT_PRICING.length-1?`1px solid ${T.border}`:"none",alignItems:"center"}}>
                  <div><div style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:600}}>{r.cat}</div><div style={{fontFamily:F.body,fontSize:9,color:T.stone2,fontWeight:300}}>{r.example}</div></div>
                  <div style={{fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:600}}>{r.offPeak}</div>
                  <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:400}}>{r.peak}</div>
                  <div style={{fontFamily:F.body,fontSize:10,color:T.stone2,fontWeight:300,lineHeight:1.4}}>
                    {[
                      "€18–20 drop-in (Sóller/Palma)",
                      "€18–22 drop-in (Palma)",
                      "€15–18 drop-in",
                      "€15–20 day pass",
                      "€25–80 hotel day pass",
                      "€30–60 resort pool",
                      "€30–50pp guided",
                      "€60–90 per 60-min treatment",
                    ][i]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payouts tab */}
        {tab==="payouts"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300,marginBottom:4}}>Estimated payouts based on this month's credit redemptions at €9/credit.</div>
            <div style={{background:T.paper,border:`1px solid ${T.border}`,borderRadius:3,overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"1.4fr .8fr .8fr .8fr .8fr .8fr auto",padding:"10px 16px",borderBottom:`1px solid ${T.border}`,background:T.bg,gap:8}}>
                {["Business","Bookings","Credits","Gross","Commission","Payout",""].map(h=><div key={h} style={{fontFamily:F.body,fontSize:8,color:T.stone,letterSpacing:"1.5px",textTransform:"uppercase",fontWeight:600}}>{h}</div>)}
              </div>
              {businesses.filter(b=>b.status==="live").map((biz,i,arr)=>{
                const tier=COMMISSION_TIERS.find(t=>t.id===biz.commission);
                const gross=biz.monthlyCredits*9;
                const commission=gross*(tier.rate/100);
                const payout=gross-commission;
                const invNo=`WLO-2026-ADM-${biz.id.toUpperCase()}`;
                return (
                  <div key={biz.id} style={{display:"grid",gridTemplateColumns:"1.4fr .8fr .8fr .8fr .8fr .8fr auto",padding:"11px 16px",borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none",alignItems:"center",gap:8}}>
                    <div><div style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:600}}>{biz.name}</div><div style={{fontFamily:F.body,fontSize:9,color:T.stone2,fontWeight:300}}>{tier.rate}% commission</div></div>
                    <div style={{fontFamily:F.body,fontSize:11,color:T.stone}}>{biz.monthlyBookings}</div>
                    <div style={{fontFamily:F.body,fontSize:11,color:T.stone}}>◈ {biz.monthlyCredits}</div>
                    <div style={{fontFamily:F.body,fontSize:11,color:T.stone}}>€{gross}</div>
                    <div style={{fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:600}}>€{commission.toFixed(0)}</div>
                    <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:12,color:T.ink,fontWeight:700,letterSpacing:"-0.3px"}}>€{payout.toFixed(0)}</div>
                    <button onClick={()=>printInvoice({
                      invoiceNo:invNo, date:"31 Mar 2026",
                      businessName:biz.name, businessAddress:`${biz.loc}, Mallorca`,
                      vatNo:"—", iban:"On file",
                      credits:biz.monthlyCredits, bookings:biz.monthlyBookings,
                      grossValue:gross, commissionRate:tier.rate,
                      commissionAmt:commission.toFixed(2), netPayout:payout.toFixed(2),
                    })} style={{padding:"5px 10px",background:T.ink,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:9,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>↓ PDF</button>
                  </div>
                );
              })}
              {/* Totals row */}
              <div style={{display:"grid",gridTemplateColumns:"1.4fr .8fr .8fr .8fr .8fr .8fr",padding:"11px 16px",background:T.bg,borderTop:`2px solid ${T.border}`}}>
                <div style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:700}}>Total</div>
                <div style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:700}}>{totalBookings}</div>
                <div style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:700}}>◈ {totalCredits}</div>
                <div style={{fontFamily:F.body,fontSize:11,color:T.ink,fontWeight:700}}>€{totalCredits*9}</div>
                <div style={{fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:700}}>€{businesses.filter(b=>b.status==="live").reduce((s,b)=>{const t=COMMISSION_TIERS.find(x=>x.id===b.commission);return s+b.monthlyCredits*9*(t.rate/100);},0).toFixed(0)}</div>
                <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:12,color:T.ink,fontWeight:700}}>€{businesses.filter(b=>b.status==="live").reduce((s,b)=>{const t=COMMISSION_TIERS.find(x=>x.id===b.commission);return s+b.monthlyCredits*9*(1-t.rate/100);},0).toFixed(0)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mock applications store (shared across admin + portal) ──────────────────
const MOCK_APPLICATIONS = [
  { id:"app1", name:"Tramuntana Flow Yoga",  cat:"Yoga",         loc:"Valldemossa", email:"hola@tramuntanaflow.com", phone:"+34 971 123 456", submittedAt:"28 Mar 2026", status:"pending" },
  { id:"app2", name:"Alcúdia Surf School",   cat:"Surfing",      loc:"Alcúdia",     email:"info@alcudiasurf.com",   phone:"+34 971 234 567", submittedAt:"29 Mar 2026", status:"pending" },
  { id:"app3", name:"Palma Hot Yoga",        cat:"Yoga",         loc:"Palma",       email:"hello@palmhotyoga.com",  phone:"+34 971 345 678", submittedAt:"25 Mar 2026", status:"approved" },
];

// ─── Standalone business console preview (demo only) ─────────────────────────
function BusinessPortalDashboard({ onExit }) {
  const bizData = { name:"Sol & Alma Yoga", cat:"Yoga", loc:"Soller", monthlyBookings:24, monthlyCredits:86 };
  const [tab, setTab] = useState("calendar");
  const [calWeek, setCalWeek] = useState(0);
  const TABS = [["calendar","Calendar"],["bookings","Bookings"],["statements","Payout Statements"],["listing","My Listing"],["settings","Settings"]];
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
              <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,lineHeight:1.6}}>Payouts every Friday · 9.00 per credit · Contact hola@wello.es</div>
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
  const [screen, setScreen]   = useState("landing"); // landing | login | pending | dashboard
  const [email,  setEmail]    = useState("");
  const [pw,     setPw]       = useState("");
  const [loginErr, setLoginErr] = useState(false);
  const [bizData, setBizData] = useState(null);

  // Simulate login — in reality this hits your auth backend
  function doLogin() {
    setLoginErr(false);
    // Demo: "approved@wello.es" / "demo" → approved dashboard
    // "pending@wello.es" / "demo" → pending screen
    if (email==="approved@wello.es" && pw==="demo") {
      setBizData({ name:"Palma Hot Yoga", cat:"Yoga", loc:"Palma", status:"approved", commission:"standard", monthlyBookings:24, monthlyCredits:86 });
      setScreen("dashboard");
    } else if (email==="pending@wello.es" && pw==="demo") {
      setBizData({ name:"Tramuntana Flow Yoga", submittedAt:"28 Mar 2026" });
      setScreen("pending");
    } else {
      setLoginErr(true);
    }
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
        <div style={{marginTop:24,padding:"12px 14px",background:T.ochreXL,border:`1px solid ${T.ochreL}`,borderRadius:2}}>
          <div style={{fontFamily:F.body,fontSize:10,color:T.ochre,fontWeight:600,marginBottom:2}}>Demo credentials</div>
          <div style={{fontFamily:F.body,fontSize:10,color:T.stone,fontWeight:300,lineHeight:1.6}}>Approved: approved@wello.es / demo<br/>Pending: pending@wello.es / demo</div>
        </div>
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
      <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setLoginErr(false);}} placeholder="hello@yourstudio.com"
        style={{...INP3,borderColor:loginErr?T.clay:T.border}} onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=loginErr?T.clay:T.border}/>
      <FieldLabel>Password</FieldLabel>
      <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setLoginErr(false);}} placeholder="••••••••"
        style={{...INP3,borderColor:loginErr?T.clay:T.border}} onFocus={e=>e.target.style.borderColor=T.sage} onBlur={e=>e.target.style.borderColor=loginErr?T.clay:T.border}
        onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
      {loginErr&&<div style={{fontFamily:F.body,fontSize:11,color:T.clay,marginTop:-8,marginBottom:12}}>Email or password not recognised.</div>}
      <button onClick={doLogin} style={{width:"100%",padding:"11px",background:T.sage,color:"#fff",border:"none",borderRadius:2,fontFamily:F.body,fontSize:12,fontWeight:600,cursor:"pointer",marginBottom:14,transition:"background .15s"}}
        onMouseEnter={e=>e.target.style.background=T.sage2} onMouseLeave={e=>e.target.style.background=T.sage}>
        Sign in →
      </button>
      <div style={{textAlign:"center"}}><span style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300}}>Don't have an account? </span><button onClick={()=>onSetView("business")} style={{background:"transparent",border:"none",color:T.sage,fontFamily:F.body,fontSize:11,fontWeight:600,cursor:"pointer",padding:0}}>Register your business</button></div>
    </div>
  );

  // ── Pending ───────────────────────────────────────────────────
  if (screen==="pending") return (
    <div style={{maxWidth:520,margin:"80px auto",padding:"0 28px",textAlign:"center"}}>
      <div style={{width:56,height:56,background:T.ochreXL,border:`1px solid ${T.ochreL}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:22}}>⏳</div>
      <h1 style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:22,fontWeight:700,color:T.ink,letterSpacing:"-0.5px",margin:"0 0 10px"}}>Application under review</h1>
      <p style={{fontFamily:F.body,fontSize:13,color:T.stone,fontWeight:300,lineHeight:1.75,margin:"0 0 6px"}}>Thanks for registering <strong style={{fontWeight:600,color:T.ink}}>{bizData?.name}</strong>.</p>
      <p style={{fontFamily:F.body,fontSize:13,color:T.stone,fontWeight:300,lineHeight:1.75,margin:"0 0 24px"}}>Your application was submitted on {bizData?.submittedAt}. The Wello team will review it and be in touch within 2 working days.</p>
      <div style={{background:T.sageXL,border:`1px solid ${T.sageL}`,borderRadius:3,padding:"14px 18px",textAlign:"left",marginBottom:24}}>
        <div style={{fontFamily:F.body,fontSize:11,color:T.sage,fontWeight:600,marginBottom:6}}>What happens next</div>
        {["We review your venue details and listing","We agree your commission rate with you directly","You receive an approval email and can log in to your dashboard","Your listing goes live on the marketplace"].map((s,i)=>(
          <div key={i} style={{display:"flex",gap:9,marginBottom:6}}>
            <div style={{width:16,height:16,borderRadius:"50%",background:T.sage,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,flexShrink:0,marginTop:1}}>{i+1}</div>
            <span style={{fontFamily:F.body,fontSize:11,color:T.stone,fontWeight:300}}>{s}</span>
          </div>
        ))}
      </div>
      <button onClick={()=>setScreen("landing")} style={{padding:"9px 22px",background:"transparent",color:T.stone,border:`1px solid ${T.border}`,borderRadius:2,fontFamily:F.body,fontSize:11,cursor:"pointer",fontWeight:300}}>← Back to login</button>
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
          <button onClick={()=>setScreen("landing")} style={{padding:"7px 14px",background:"transparent",color:T.stone,border:`1px solid ${T.border}`,borderRadius:2,fontFamily:F.body,fontSize:10,cursor:"pointer",fontWeight:300}}>Sign out</button>
        </div>
      </div>
      {/* Quick stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:10,marginBottom:24}}>
        {[["Bookings this month",bizData.monthlyBookings],["Credits redeemed","◈ "+bizData.monthlyCredits],["Payout due","€"+(bizData.monthlyCredits*9*0.8).toFixed(0)],["Avg rating","4.8 ★"]].map(([l,v])=>(
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
  const [listings,setListings] = useState(LISTINGS);
  const [syncingIds,setSyncing]= useState({});
  const [selBiz,setSelBiz]     = useState(null);
  const [bkData,setBkData]     = useState(null);
  const [credits,setCredits]   = useState(6);
  const [bookings,setBookings] = useState([]);
  const [saved,setSaved]       = useState([1,5,9]);
  const [isBiz,setIsBiz]       = useState(false);
  const [toast,setToast]       = useState(null);
  const [adminMode,setAdminMode]= useState(()=>typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("admin")==="true");

  // Admin panel intercepts the whole app
  if (adminMode) return <AdminPanel onExit={()=>setAdminMode(false)}/>;

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
  function onPurchase(bundle){ setCredits(c=>c+bundle.cr); showToast(`◈ ${bundle.cr} credits added!`,"gold"); }
  function toggleSave(id){ setSaved(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]); showToast(saved.includes(id)?"Removed from saved":"Saved!","success"); }

  const NAV=[{id:"home",l:"Home"},{id:"explore",l:"Explore"},{id:"credits",l:"Credits"},{id:"profile",l:"Profile"},{id:"biz-portal",l:"For Business"}];

  // Demo shortcut state — lets you preview biz dashboard & admin without login
  const [bizPreview, setBizPreview]   = useState(false);
  const [adminPreview, setAdminPreview] = useState(false);

  // Preview intercepts — show full pages without auth
  if (adminPreview) return <AdminPanel onExit={()=>setAdminPreview(false)} skipAuth={true}/>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${T.bg};color:${T.ink};}
        @keyframes su{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fi{from{opacity:0}to{opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:${T.border2};border-radius:2px}
        input,select,textarea,button{font-family:'Jost',system-ui,sans-serif;}
      `}</style>

      <Toast t={toast}/>

      {/* ── DEMO PREVIEW BAR ── only shown in prototype, remove before launch */}
      <div style={{background:T.ink,padding:"7px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <span style={{fontFamily:F.body,fontSize:9,color:T.stone2,letterSpacing:"1px"}}>PROTOTYPE PREVIEW — demo shortcuts</span>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setBizPreview(v=>!v)}
            style={{padding:"4px 12px",background:bizPreview?T.sage:"transparent",color:bizPreview?"#fff":T.stone,border:`1px solid ${bizPreview?T.sage:T.stone2}`,borderRadius:2,fontFamily:F.body,fontSize:9,fontWeight:600,cursor:"pointer",letterSpacing:".5px"}}>
            {bizPreview?"✓ Viewing business console":"👁 Preview business console"}
          </button>
          <button onClick={()=>setAdminPreview(true)}
            style={{padding:"4px 12px",background:"transparent",color:T.ochre,border:`1px solid ${T.ochre}`,borderRadius:2,fontFamily:F.body,fontSize:9,fontWeight:600,cursor:"pointer",letterSpacing:".5px"}}>
            👁 Preview admin panel
          </button>
        </div>
      </div>

      <div style={{minHeight:"100vh",background:T.bg}}>
        {/* NAV — Wello brand identity */}
        <header style={{background:T.paper,borderBottom:`1px solid ${T.border}`,position:"sticky",top:0,zIndex:200,boxShadow:"0 1px 12px rgba(0,0,0,.06)"}}>
          <div style={{maxWidth:1140,margin:"0 auto",padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",height:58}}>

            {/* F1 wordmark — sage name, ochre descriptor */}
            <div onClick={()=>setView("home")} style={{cursor:"pointer",userSelect:"none",flexShrink:0}}>
              <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:26,fontWeight:700,color:T.sage,lineHeight:1,letterSpacing:"-1px"}}>wello</div>
              <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:7,fontWeight:400,color:T.ochre,letterSpacing:"4px",marginTop:1,textTransform:"uppercase"}}>the wellness pass</div>
            </div>

            {/* Nav links */}
            <nav style={{display:"flex",alignItems:"center",gap:2}}>
              {NAV.map(n=>(
                <button key={n.id} onClick={()=>setView(n.id)}
                  style={{padding:"5px 13px",border:"none",background:view===n.id?T.sageXL:"transparent",color:view===n.id?T.sage:T.stone,borderRadius:2,fontFamily:"'Jost',system-ui,sans-serif",fontSize:11,cursor:"pointer",fontWeight:view===n.id?600:300,letterSpacing:".3px",transition:"all .13s",outline:view===n.id?`1px solid ${T.sageL}`:"1px solid transparent"}}>
                  {n.l}
                </button>
              ))}

              {/* G1 pill credit chip — sage pill, ochre token badge */}
              <div onClick={()=>setView("credits")} style={{position:"relative",marginLeft:8,cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",gap:5,background:T.sage,borderRadius:50,padding:"6px 14px 6px 12px",transition:"background .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.background=T.sage2}
                  onMouseLeave={e=>e.currentTarget.style.background=T.sage}>
                  <span style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:12,color:"#fff",fontWeight:700}}>◈ {credits}</span>
                </div>
                {/* ochre token badge */}
                <div style={{position:"absolute",top:-5,right:-5,width:16,height:16,borderRadius:"50%",background:T.ochre,display:"flex",alignItems:"center",justifyContent:"center",border:`1.5px solid ${T.paper}`}}>
                  <span style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:7,fontWeight:700,color:"#fff"}}>+</span>
                </div>
              </div>
            </nav>
          </div>
        </header>

        {/* PAGES */}
        {bizPreview          &&<BusinessPortalDashboard onExit={()=>setBizPreview(false)}/>}
        {!bizPreview && view==="home"       &&<HomePage listings={listings} bookings={bookings} onSelect={onSelect} savedIds={saved} onToggleSave={toggleSave} onSetView={setView} syncingIds={syncingIds}/>}
        {!bizPreview && view==="explore"    &&<ExplorePage listings={listings} onSelect={onSelect} savedIds={saved} onToggleSave={toggleSave} syncingIds={syncingIds}/>}
        {!bizPreview && view==="profile"    &&<ProfilePage bookings={bookings} savedIds={saved} listings={listings} credits={credits} onSelect={onSelect} onSetView={setView} isBiz={isBiz} onToggleBiz={()=>setIsBiz(v=>!v)}/>}
        {!bizPreview && view==="biz-portal" &&<BusinessPortal onSetView={setView}/>}
        {!bizPreview && view==="business"   &&<BusinessPage isBiz={true} onSetView={setView} onToggleBiz={()=>setIsBiz(v=>!v)}/>}
        {!bizPreview && view==="credits"    &&<CreditsPage credits={credits} onPurchase={onPurchase}/>}

        <footer style={{background:T.ink,padding:"28px"}}>
          <div style={{maxWidth:1140,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
            {/* F1 reversed — sage name, ochre descriptor on ink */}
            <div>
              <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:20,fontWeight:700,color:T.sage,lineHeight:1,letterSpacing:"-0.5px"}}>wello</div>
              <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:7,fontWeight:400,color:T.ochre,letterSpacing:"4px",marginTop:3,textTransform:"uppercase"}}>the wellness pass</div>
            </div>
            <div style={{display:"flex",gap:20}}>
              {["About","For Business","Privacy","Contact"].map(l=>(
                <span key={l} style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:10,color:T.stone,cursor:"pointer",fontWeight:300,letterSpacing:".3px"}}>{l}</span>
              ))}
            </div>
            <div style={{fontFamily:"'Jost',system-ui,sans-serif",fontSize:9,color:T.stone2,fontWeight:300,letterSpacing:".5px"}}>© 2026 Wello · Mallorca</div>
          </div>
        </footer>
      </div>

      {selBiz   &&<BizPanel biz={selBiz}        onClose={()=>setSelBiz(null)}  onBook={onBook}/>}
      {bkData   &&<BookingModal biz={bkData.biz} slot={bkData.slot} onClose={()=>setBkData(null)} onConfirm={onConfirm} credits={credits} onBuyCredits={()=>{setBkData(null);setView("credits");}}/>}
      <SyncEngine listings={listings} onUpdate={onSyncUpdate}/>
      <Chatbot listings={listings} credits={credits} bookings={bookings} onSelectBiz={onSelect}/>
    </>
  );
}
