import { useState, useEffect, useRef, useMemo } from "react";
import { Capacitor, registerPlugin } from '@capacitor/core';
const AppleSignIn = registerPlugin('AppleSignIn');
import { initIAP, purchasePremium, restorePurchases } from './lib/iap';
import { track } from './analytics/analytics';
import { useNavigate, useSearchParams } from "react-router-dom";
const isNative = Capacitor.isNativePlatform();
import { supabase } from './lib/supabase';
import Toast from './components/Toast';
import StatsPage from './pages/StatsPage';
import { useTranslation } from './i18n/useTranslation';
import * as XLSX from 'xlsx';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { calculateDealScore } from './utils/dealScore';
import { generateDealAnalysis } from './utils/dealAnalysis';
import { executeVoiceTasks } from './utils/voiceEngine';
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler);
ChartJS.defaults.font.family = "'Nunito', -apple-system, BlinkMacSystemFont, sans-serif";
import './App.css';

const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const C = {
  // Design tokens Fill & Sell
  primary:"#1D9E75",
  dark:"#0F6E56",
  soft:"#5DCAA5",
  muted:"#A3A9A6",
  bg:"#F5F6F5",
  // Couleurs d'UI
  teal:"#4ECDC4", tealLight:"#E8F5F0",
  peach:"#F9A26C",
  white:"#FFFFFF",
  text:"#0D0D0D", sub:"#6B7280", label:"#A3A9A6",
  border:"rgba(0,0,0,0.06)",
  red:"#E53E3E", redLight:"#FFF5F5",
  green:"#1D9E75", greenLight:"#E8F5F0",
  orange:"#F9A26C", orangeLight:"#FFF4EE",
  rowBg:"#F5F6F5", rowHover:"#EAEBEA",
};

function useCounter(target, duration = 1200, deps = []) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf, start;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, deps);
  return val;
}

function Sparkline({ data, color = '#2DB89A', width = 80, height = 28 }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (width * i) / (data.length - 1);
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  const last = data.map((v, i) => [(width * i) / (data.length - 1), height - ((v - min) / range) * height]).pop();
  return (
    <svg width={width} height={height} style={{display:'block'}}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}

const EUR_TO_USD = 1.08;
const fmt = n=>(Math.round(n*100)/100).toFixed(2).replace(".",",")+' €';
// Capitalize after spaces and apostrophes to handle "L'Oréal", "Louis Vuitton", etc.
const normalizeMarque = m => m?.trim() ? m.trim().toLowerCase().replace(/(^|\s|')(\S)/g,(_,sep,c)=>sep+c.toUpperCase()) : null;
const fmtp = n=>(Math.round(n*10)/10).toFixed(1)+"%";
const getMargeColor = pct => pct>=40?"#1D9E75":pct>=20?"#5DCAA5":pct>=5?"#F9A26C":"#E53E3E";
const getCatBorder = type => ({Mode:"#DB2777","High-Tech":"#2563EB",Luxe:"#D97706",Maison:"#16A34A",Sport:"#7C3AED"})[type]||"#6B7280";

function SwipeRow({onDelete, onEdit, children, style}){
  const isMobile = window.innerWidth < 768;
  const innerRef=useRef(null);
  const bgRef=useRef(null);
  const startX=useRef(0);
  const isDragging=useRef(false);
  const THRESHOLD=70;

  if(!isMobile){
    return(
      <div style={{position:"relative",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"#fff",borderRadius:12,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",transition:"background 0.15s",marginBottom:0,...style}}
        onMouseEnter={e=>{e.currentTarget.style.background="#F9FAFB";e.currentTarget.querySelector('.delx').style.opacity='1';if(onEdit)e.currentTarget.querySelector('.editx').style.opacity='1';}}
        onMouseLeave={e=>{e.currentTarget.style.background="#fff";e.currentTarget.querySelector('.delx').style.opacity='0';if(onEdit)e.currentTarget.querySelector('.editx').style.opacity='0';}}
      >
        {children}
        {onEdit&&(
          <button className="editx" onClick={()=>onEdit()}
            style={{opacity:0,background:"transparent",border:"none",cursor:"pointer",fontSize:14,color:"#9CA3AF",padding:"4px 8px",borderRadius:6,transition:"all 0.15s",flexShrink:0,marginLeft:4}}
            onMouseEnter={e=>{e.currentTarget.style.background="#EBF8FF";e.currentTarget.style.color="#3B82F6";}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#9CA3AF";}}
          >✏️</button>
        )}
        <button className="delx" onClick={onDelete}
          style={{opacity:0,background:"transparent",border:"none",cursor:"pointer",fontSize:15,color:"#9CA3AF",padding:"4px 8px",borderRadius:6,transition:"all 0.15s",flexShrink:0,marginLeft:4}}
          onMouseEnter={e=>{e.currentTarget.style.background="#FEE2E2";e.currentTarget.style.color="#E53E3E";}}
          onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#9CA3AF";}}
        >✕</button>
      </div>
    );
  }

  const startY=useRef(0);
  const currentDx=useRef(0);
  const isScrolling=useRef(false);
  useEffect(()=>{
    if(window.innerWidth>=768||!innerRef.current)return;
    const el=innerRef.current;
    function handleTouchStart(e){
      startX.current=e.touches[0].clientX;
      startY.current=e.touches[0].clientY;
      isDragging.current=true;
      isScrolling.current=false;
      currentDx.current=0;
      el.style.transition='none';
    }
    function handleTouchMove(e){
      if(!isDragging.current)return;
      const dx=e.touches[0].clientX-startX.current;
      const dy=e.touches[0].clientY-startY.current;
      if(!isScrolling.current&&Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>5){
        isScrolling.current=true;
        isDragging.current=false;
        currentDx.current=0;
        el.style.transform='translateX(0)';
        bgRef.current.style.opacity='0';
        bgRef.current.style.pointerEvents='none';
        return;
      }
      if(isScrolling.current)return;
      if(dx>=0){currentDx.current=0;el.style.transform='translateX(0)';bgRef.current.style.opacity='0';bgRef.current.style.pointerEvents='none';return;}
      currentDx.current=dx;
      el.style.transform=`translateX(${Math.max(dx,-(THRESHOLD+30))}px)`;
      bgRef.current.style.right='0px';bgRef.current.style.opacity='1';bgRef.current.style.pointerEvents='auto';
    }
    function handleTouchEnd(){
      isDragging.current=false;
      el.style.transition='transform 0.25s ease';
      if(currentDx.current<=-THRESHOLD){el.style.transform=`translateX(-${THRESHOLD}px)`;bgRef.current.style.right='0px';bgRef.current.style.opacity='1';bgRef.current.style.pointerEvents='auto';}
      else{el.style.transform='translateX(0)';bgRef.current.style.opacity='0';bgRef.current.style.pointerEvents='none';bgRef.current.style.right='-80px';}
      currentDx.current=0;
    }
    el.addEventListener('touchstart',handleTouchStart,{passive:true});
    el.addEventListener('touchmove',handleTouchMove,{passive:true});
    el.addEventListener('touchend',handleTouchEnd,{passive:true});
    return()=>{
      el.removeEventListener('touchstart',handleTouchStart);
      el.removeEventListener('touchmove',handleTouchMove);
      el.removeEventListener('touchend',handleTouchEnd);
    };
  },[]);
  function handleDelClick(){
    innerRef.current.style.transition='transform 0.2s ease,opacity 0.2s ease';
    innerRef.current.style.transform='translateX(-120%)';innerRef.current.style.opacity='0';
    setTimeout(()=>onDelete(),200);
  }
  return(
    <div style={{position:"relative",borderRadius:12,overflow:"hidden",maxWidth:"100%",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",touchAction:"pan-y",...style}}>
      <div ref={bgRef} onClick={handleDelClick} style={{position:"absolute",right:-80,top:0,bottom:0,width:80,background:"linear-gradient(135deg,#FF6B6B,#E53E3E)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:0,pointerEvents:"none"}}>
        <span style={{fontSize:22}}>🗑️</span>
      </div>
      <div ref={innerRef} style={{position:"relative",zIndex:1,width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"#fff",borderRadius:12,touchAction:"pan-y"}}>
        {onEdit&&(
          <button onClick={e=>{e.stopPropagation();onEdit();}}
            style={{background:"#EBF8FF",color:"#3B82F6",border:"none",borderRadius:6,padding:"5px 7px",fontSize:12,cursor:"pointer",flexShrink:0,lineHeight:1}}>
            ✏️
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

function PremiumBanner({ userEmail, compact=false, onDark=false, source='banner' }){
  const [loading, setLoading] = useState(false);
  const { t: tb } = useTranslation(localStorage.getItem('fs_lang') || 'fr');

  async function handleCheckout(){
    track('premium_click', { source });
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ email: userEmail }),
        }
      );
      const { url, error } = await res.json();
      if(error) throw new Error(error);
      window.location.href = url;
    } catch(e) {
      alert("Erreur : " + e.message);
      setLoading(false);
    }
  }

  if(compact){
    const bg=onDark?(loading?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.2)"):(loading?"#E5E7EB":"#1D9E75");
    const bgHover=onDark?"rgba(255,255,255,0.3)":"#0F6E56";
    const bgLeave=onDark?(loading?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.2)"):(loading?"#E5E7EB":"#1D9E75");
    const col=onDark?"#fff":"#fff";
    const brd=onDark?"1px solid rgba(255,255,255,0.4)":"none";
    return(
      <button onClick={handleCheckout} disabled={loading}
        style={{padding:"6px 12px",background:bg,color:col,border:brd,borderRadius:99,fontSize:11,fontWeight:800,cursor:loading?"not-allowed":"pointer",transition:"all 0.15s",whiteSpace:"nowrap",flexShrink:0}}
        onMouseEnter={e=>{if(!loading)e.currentTarget.style.background=bgHover;}}
        onMouseLeave={e=>{e.currentTarget.style.background=bgLeave;}}
      >
        {loading ? "..." : <><span className="premium-short">✨</span><span className="premium-full">{tb('unlockPremium')}</span></>}
      </button>
    );
  }

  return(
    <div style={{background:"linear-gradient(135deg,#1D9E7508,#E8956D08)",border:"1px solid rgba(232,149,109,0.22)",borderRadius:14,padding:"16px 18px",display:"flex",flexDirection:"column",gap:10,alignItems:"center",textAlign:"center",boxShadow:"0 2px 10px rgba(0,0,0,0.05)"}}>
      <div style={{fontSize:14,fontWeight:800,color:"#111827"}}>{tb('limiteGratuit')}</div>
      <div style={{fontSize:11,color:"#6B7280",opacity:0.8,lineHeight:1.5}}>{tb('limiteGratuitDesc')}</div>
      <button onClick={handleCheckout} disabled={loading}
        style={{padding:"10px 22px",background:loading?"#E5E7EB":"linear-gradient(135deg,#3EACA0,#E8956D)",color:loading?"#9CA3AF":"#fff",border:"none",borderRadius:99,fontSize:13,fontWeight:700,cursor:loading?"not-allowed":"pointer",boxShadow:loading?"none":"0 4px 14px rgba(62,172,160,0.3)",transition:"all 0.2s",marginTop:2}}
        onMouseEnter={e=>{if(!loading)e.currentTarget.style.transform="translateY(-2px)";}}
        onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";}}
      >
        {loading ? tb('redirection') : `✨ ${tb('debloquer')}`}
      </button>
    </div>
  );
}

function IAPUpgradeBlock({ lang, iapProduct, iapLoading, onPurchase, onRestore }) {
  return (
    <div style={{background:"linear-gradient(135deg,#1D9E7508,#E8956D08)",border:"1px solid rgba(232,149,109,0.22)",borderRadius:14,padding:"16px 18px",display:"flex",flexDirection:"column",gap:10,alignItems:"center",textAlign:"center",boxShadow:"0 2px 10px rgba(0,0,0,0.05)"}}>
      <div style={{fontSize:14,fontWeight:800,color:"#111827"}}>
        {lang==='fr'?'Passe à l\'illimité ✨':'Go unlimited ✨'}
      </div>
      <div style={{fontSize:11,color:"#6B7280",opacity:0.8,lineHeight:1.5}}>
        {lang==='fr'?'Inventaire illimité · Export Excel · Stats pro':'Unlimited inventory · Excel export · Pro stats'}
      </div>
      {iapProduct&&(
        <div style={{fontSize:11,color:"#9CA3AF",fontWeight:600}}>
          {iapProduct.priceString} / {lang==='fr'?'mois':'month'}
        </div>
      )}
      <button
        onClick={onPurchase}
        disabled={iapLoading}
        style={{padding:"10px 22px",background:iapLoading?"#E5E7EB":"linear-gradient(135deg,#3EACA0,#E8956D)",color:iapLoading?"#9CA3AF":"#fff",border:"none",borderRadius:99,fontSize:13,fontWeight:700,cursor:iapLoading?"not-allowed":"pointer",boxShadow:iapLoading?"none":"0 4px 14px rgba(62,172,160,0.3)",transition:"all 0.2s",marginTop:2,fontFamily:"inherit"}}
      >
        {iapLoading?(lang==='fr'?'Chargement...':'Loading...'):(lang==='fr'?'✨ Débloquer':'✨ Unlock')}
      </button>
      <button
        onClick={onRestore}
        disabled={iapLoading}
        style={{background:"transparent",border:"none",color:"#9CA3AF",fontSize:12,cursor:"pointer",textDecoration:"underline",fontFamily:"inherit"}}
      >
        {lang==='fr'?'Restaurer mes achats':'Restore purchases'}
      </button>
    </div>
  );
}

const Tip=({active,payload,label})=>active&&payload?.length?(
  <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 14px",fontSize:12,boxShadow:"0 10px 30px rgba(0,0,0,0.1)"}}>
    <div style={{color:C.sub,marginBottom:4,fontWeight:600}}>{label}</div>
    {payload.map((p,i)=><div key={i} style={{color:p.color,fontWeight:700}}>{p.name}: {p.name==="Marge %"?fmtp(p.value):fmt(p.value)}</div>)}
  </div>
):null;

const Empty=({text="Aucune donnée"})=>(
  <div style={{height:130,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:C.label,gap:8}}>
    <div style={{fontSize:28}}>📭</div>
    <div style={{fontSize:12,fontWeight:500}}>{text}</div>
  </div>
);

const Kpi=({label,value,sub,color,icon})=>(
  <div className="kpi" style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
    {icon&&<div style={{fontSize:18,marginBottom:4}}>{icon}</div>}
    <div style={{fontSize:10,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{label}</div>
    <div style={{fontSize:22,fontWeight:900,color:"#0D0D0D",letterSpacing:"-0.03em",lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:10,fontWeight:700,color:color||"#6B7280",marginTop:4}}>{sub}</div>}
  </div>
);

const Field=({label,value,set,placeholder,type="text",icon,suffix})=>(
  <div className="inp" style={{
    background:C.white,borderRadius:14,
    padding:"0 16px",height:58,
    border:value?`1px solid ${C.teal}55`:`1px solid rgba(0,0,0,0.08)`,
    display:"flex",alignItems:"center",gap:12,
    boxShadow:value?`0 0 0 3px ${C.teal}11`:"0 2px 8px rgba(0,0,0,0.04)",
    transition:"all 0.2s"
  }}>
    <span style={{fontSize:20,flexShrink:0,opacity:0.7}}>{icon}</span>
    <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",gap:2}}>
      <div style={{fontSize:10,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:1}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        <input type={type} value={value} onChange={e=>set(e.target.value)} placeholder={placeholder}
          inputMode={type==="number"?"decimal":undefined}
          style={{background:"transparent",border:"none",outline:"none",color:C.text,fontSize:15,fontWeight:600,width:"100%",fontFamily:"inherit"}}/>
        {suffix&&<span style={{color:C.label,fontSize:13,fontWeight:600,flexShrink:0}}>{suffix}</span>}
      </div>
    </div>
  </div>
);

const Btn=({onClick,disabled,children,color,full=false})=>(
  <button className="btn" onClick={onClick} disabled={disabled} style={{
    width:full?"100%":"auto",padding:"15px 20px",
    background:disabled?"#E5E7EB":color,
    color:disabled?C.sub:C.white,
    border:"none",borderRadius:14,fontSize:15,fontWeight:700,
    boxShadow:disabled?"none":`0 4px 16px rgba(0,0,0,0.14)`,
    opacity:disabled?0.6:1,
    cursor:disabled?"not-allowed":"pointer",
    transition:"all 0.3s ease",
    transform:"scale(1)",
  }}
    onMouseEnter={e=>{if(!disabled){e.currentTarget.style.transform="scale(1.03)";e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.18)";}}}
    onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow=disabled?"none":"0 4px 16px rgba(0,0,0,0.14)";}}
    onMouseDown={e=>{if(!disabled)e.currentTarget.style.transform="scale(0.97)";}}
    onMouseUp={e=>{if(!disabled)e.currentTarget.style.transform="scale(1.03)";}}
  >{children}</button>
);

function getMargeMessage(marginPct,marginEur,lang='fr'){
  const msgs={
    fr:[
      {msg:"Jackpot 💎",color:"#1D9E75"},{msg:"Grosse affaire 🤑",color:"#1D9E75"},
      {msg:"Très belle vente 🚀",color:"#1D9E75"},{msg:"Belle marge 💪",color:"#1D9E75"},
      {msg:"Affaire en or 🏆",color:"#1D9E75"},{msg:"Excellent deal 🔥",color:"#1D9E75"},
      {msg:"Très bon deal ✅",color:"#1D9E75"},{msg:"Pas mal 👍",color:"#5DCAA5"},
      {msg:"Moyen, à toi de voir 🤔",color:"#F9A26C"},{msg:"Marge très faible ⚠️",color:"#F9A26C"},
      {msg:"Aucun bénéfice",color:"#6B7280"},{msg:"Légère perte 😬",color:"#E53E3E"},
      {msg:"Perte significative ❌",color:"#E53E3E"},{msg:"Grosse perte, évite 🚨",color:"#E53E3E"},
    ],
    en:[
      {msg:"Jackpot 💎",color:"#1D9E75"},{msg:"Big win 🤑",color:"#1D9E75"},
      {msg:"Great sale 🚀",color:"#1D9E75"},{msg:"Nice margin 💪",color:"#1D9E75"},
      {msg:"Golden deal 🏆",color:"#1D9E75"},{msg:"Excellent deal 🔥",color:"#1D9E75"},
      {msg:"Very good deal ✅",color:"#1D9E75"},{msg:"Not bad 👍",color:"#5DCAA5"},
      {msg:"Average, up to you 🤔",color:"#F9A26C"},{msg:"Very low margin ⚠️",color:"#F9A26C"},
      {msg:"No profit",color:"#6B7280"},{msg:"Slight loss 😬",color:"#E53E3E"},
      {msg:"Significant loss ❌",color:"#E53E3E"},{msg:"Big loss, avoid 🚨",color:"#E53E3E"},
    ]
  };
  const m=msgs[lang]||msgs.fr;
  if(marginEur>=500) return m[0];
  if(marginEur>=200) return m[1];
  if(marginEur>=100) return m[2];
  if(marginEur>=50)  return m[3];
  if(marginPct>=50)  return m[4];
  if(marginPct>=35)  return m[5];
  if(marginPct>=25)  return m[6];
  if(marginPct>=15)  return m[7];
  if(marginPct>=8)   return m[8];
  if(marginPct>=1)   return m[9];
  if(marginPct===0)  return m[10];
  if(marginPct>=-10) return m[11];
  if(marginPct>=-30) return m[12];
  return m[13];
}
function mapItem(v){return{id:v.id,title:v.titre,prix_achat:v.prix_achat,buy:v.prix_achat,sell:v.prix_vente,margin:v.margin,marginPct:v.margin_pct,statut:v.statut,date:v.date,date_ajout:v.created_at||v.date_achat||v.date,marque:v.marque||"",description:v.description||"",type:v.type||"Autre",purchaseCosts:v.purchase_costs||0,sellingFees:v.selling_fees||0,quantite:v.quantite||1};}

function detectType(titre,marque){
  const t=((titre||'')+' '+(marque||'')).toLowerCase();
  // Luxury brands always take absolute priority over article type
  if(/louis.?vuitton|\blv\b|gucci|hermès|hermes|chanel|dior|prada|balenciaga|givenchy|saint.?laurent|\bysl\b|burberry|versace|fendi|celine|céline|bottega.?veneta|valentino|moncler|off.?white|alexander.?mcqueen|vivienne.?westwood|rolex|omega|cartier|tag.?heuer|breitling|patek|audemars|richard.?mille|\biwc\b|birkin|kelly|speedy|neverfull|louboutin|jimmy.?choo|manolo|stone.?island|canada.?goose|ralph.?lauren|lacoste|tommy|boss|armani/i.test(t)) return 'Luxe';
  if(/robe|jupe|pull|jean|veste|manteau|chemise|blouse|short|legging|pantalon|top|t-shirt|cardigan|blouson|parka|doudoune|sweat|hoodie|débardeur|tunique|combinaison|kimono|salopette|bermuda|jogging|survêtement|maillot|bikini|lingerie|soutien|culotte|boxer|chaussette|collant|chaussure|basket|botte|sandale|espadrille|mocassin|sneaker|talon|ballerine|sac|pochette|portefeuille|ceinture|écharpe|foulard|casquette|chapeau|bonnet|gant|lunette|bijou|collier|bracelet|bague|montre|boucle|accessoire|imperméable|pyjama|nuisette|robe.?chambre|maillot.?bain|cap|bob|beret|turban|snood|mitaine|manchette|cravate|noeud.?papillon|bretelle|jarretelle|chaussure.?sport|derby|oxford|loafer|chelsea|compensée|plateforme|slip|string|monokini|playsuit|body|bustier|corset/i.test(t)) return 'Mode';
  if(/guitare|\bpiano\b|violon|\bbatterie\b(?!.{0,12}voiture)|\bsynthé\b|synthétiseur|ukulélé|trompette|saxophone|accordéon|contrebasse|clavier.?midi|pédale.?(?:effet|guitare|basse)|table.?(?:mix|mixage)|\bampli\b(?!.{0,10}voiture|.{0,10}\bauto\b)|\bvinyle\b|vinyl|platine.?(?:vinyle|disque|dj)|\bpartition\b|solfège|\bgibson\b|\bfender\b|\bmarshall\b|\bibanez\b|\bepiphone\b|les.?paul|stratocaster|telecaster|\bstrat\b|\bbasse\b|micro.?(?:studio|chant|enregistrement)|enceinte.?studio|moniteur.?studio/i.test(t)) return 'Musique';
  if(/iphone|samsung|huawei|xiaomi|oneplus|pixel|macbook|laptop|ordinateur|pc|computer|tablette|ipad|téléphone|smartphone|airpods|écouteur|casque|enceinte|jbl|bose|sony|beats|playstation|ps4|ps5|xbox|nintendo|switch|console|jeu.?video|manette|clavier|souris|écran|moniteur|imprimante|disque|ssd|ram|processeur|gopro|appareil.?photo|camera|objectif|drone|fitbit|garmin|apple.?watch|smartwatch|montre.?connect|tv|télévision|projecteur|home.?cinema|ampli|chargeur|cable|adaptateur|batterie.?externe|airpod|earbud|tws|true.?wireless|powerbank|hub|dock|station|chargeur.?sans.?fil|disque.?dur|clé.?usb|carte.?sd|webcam|micro|ring.?light|green.?screen|smart.?tv|android.?tv|chromecast|firestick|apple.?tv|box.?internet|routeur|répéteur.?wifi|alarme|camera.?surveillance|sonnette|imprimante.?3d|scanner|tablette.?graphique/i.test(t)) return 'High-Tech';
  if(/canapé|sofa|table|chaise|bureau|armoire|commode|lit|matelas|étagère|bibliothèque|meuble|lampe|luminaire|miroir|tableau|cadre|tapis|rideau|coussin|plaid|couette|drap|serviette|vase|bougie|déco|cuisine|assiette|bol|verre|tasse|cafetière|machine.?café|grille.?pain|mixeur|robot|poêle|casserole|ustensile|réfrigérateur|micro.?onde|pouf|banquette|ottomane|tabouret|bar|console|desserte|vaisselier|bahut|buffet|vitrine|applique|suspension|guirlande|led|ampoule|parure|jeté|store|voilage|portant|cintre|organisateur|boite|panier|corbeille|plante|pot|jardinage|arrosoir/i.test(t)) return 'Maison';
  if(/lego|playmobil|hasbro|mattel|jouet|jeu|puzzle|peluche|figurine|poupée|voiture.?miniature|construction|kapla|duplo|hot.?wheels|barbie/i.test(t)) return 'Jouets';
  if(/livre|bd|bande.?dessinée|manga|roman|magazine|comics|guide|encyclopédie|atlas|dictionnaire/i.test(t)) return 'Livres';
  if(/vélo|trottinette|skateboard|ski|snowboard|raquette|ballon|football|basketball|tennis|badminton|golf|rugby|natation|plongée|surf|kayak|randonnée|camping|sport|fitness|musculation|haltère|kettlebell|yoga|pilates|course|running|trail|cyclisme|équitation|boxe|arts.?martiaux|tapis.?course|vélo.?appartement|rameur|elliptique|corde.?sauter|élastique.?musculation|bande.?résistance|gant.?boxe|protège|casque.?vélo|genouillère|spike|crampon|patin|roller|tente|sac.?dos.?rando|gourde|frontale|bâton.?marche|canne.?pêche|moulinet|waders/i.test(t)) return 'Sport';
  if(/voiture|auto|moto|scooter|véhicule|pneu|jante|casque.?moto|pièce.?auto|autoradio|gps/i.test(t)) return 'Auto-Moto';
  if(/parfum|crème|sérum|mascara|rouge.?lèvre|palette|correcteur|dissolvant|vernis|shampooing|après-shampooing|masque.?cheveux|huile|lotion|gel.?douche|savon|rasoir|fond.?teint|bb.?cream|cc.?cream|cushion|anticernes|poudre|blush|bronzer|highlighter|fard.?paupières|eyeliner|crayon|kajal|extension.?cils|faux.?cils|sourcil|gloss|baume|exfoliant|gommage|peeling|autobronzant|spray.?solaire|after.?sun|déodorant|roll.?on|stick|eau.?de.?cologne|brosse|peigne|lisseur|boucleur|bigoudi|coton|lingette|démaquillant|tonique|brume/i.test(t)) return 'Beauté';  if(/collectionn|carte|timbre|monnaie|pièce|funko|vintage|antique|brocante/i.test(t)) return 'Collection';
  if(/aspirateur|robot.?aspirateur|roomba|dyson|lave.?linge|lave.?vaisselle|congélateur|four|hotte|plaque|induction|gazinière|sèche.?linge|sèche.?cheveux|fer.?repasser|climatiseur|ventilateur|radiateur|chauffage|chauffe.?eau|nespresso|dolce.?gusto|blender|robot.?cuisine|thermomix|friteuse|yaourtière|extracteur.?jus|centrifugeuse|bouilloire|épilateur|rasoir.?électrique|brosse.?dents/i.test(t)) return 'Électroménager';
  return 'Autre';
}
function getTypeStyle(type){
  const s={
    'Mode':          {bg:'#FDF2F8',color:'#9D174D',border:'#F9A8D4',emoji:'👗'},
    'High-Tech':     {bg:'#EFF6FF',color:'#1D4ED8',border:'#93C5FD',emoji:'📱'},
    'Maison':        {bg:'#F0FDF4',color:'#166534',border:'#86EFAC',emoji:'🏠'},
    'Jouets':        {bg:'#FFFBEB',color:'#92400E',border:'#FCD34D',emoji:'🧸'},
    'Livres':        {bg:'#FFF7ED',color:'#9A3412',border:'#FDBA74',emoji:'📚'},
    'Sport':         {bg:'#F0F9FF',color:'#0C4A6E',border:'#7DD3FC',emoji:'⚽'},
    'Auto-Moto':     {bg:'#F8FAFC',color:'#334155',border:'#94A3B8',emoji:'🚗'},
    'Beauté':        {bg:'#FFF1F2',color:'#9F1239',border:'#FDA4AF',emoji:'💄'},
    'Musique':       {bg:'#F5F3FF',color:'#5B21B6',border:'#C4B5FD',emoji:'🎵'},
    'Collection':    {bg:'#FEFCE8',color:'#854D0E',border:'#FDE047',emoji:'🏆'},
    'Électroménager':{bg:'#ECFDF5',color:'#065F46',border:'#6EE7B7',emoji:'⚡'},
    'Luxe':          {bg:'#FDF8F0',color:'#92400E',border:'#F59E0B',emoji:'💎'},
    'Autre':         {bg:'#F9FAFB',color:'#6B7280',border:'#D1D5DB',emoji:'📦'},
  };
  return s[type]||s['Autre'];
}
const TYPE_LABELS_EN={'Mode':'Fashion','Luxe':'Luxury','Maison':'Home','Électroménager':'Appliances','Jouets':'Toys','Livres':'Books','Sport':'Sport','Auto-Moto':'Vehicles','Beauté':'Beauty','Musique':'Music','Collection':'Collection','Autre':'Other'};
function typeLabel(type,lang){return lang==='en'?(TYPE_LABELS_EN[type]||type):type;}
function marqueLabel(m,lang){return(lang==='en'&&m?.toLowerCase()==='sans marque')?'Unbranded':m;}
function mapSale(v){return{id:v.id,title:v.titre,prix_vente:v.prix_vente,buy:v.prix_achat,sell:v.prix_vente,ship:0,margin:v.benefice,marginPct:v.prix_vente>0?(v.benefice/v.prix_vente)*100:0,date:v.date,date_vente:v.date||v.created_at,marque:v.marque||"",type:v.type||"",purchaseCosts:v.purchase_costs||0,sellingFees:v.selling_fees||0};}

// Groups consecutive rows with same title+date+sell price into one display row
function groupSales(arr){
  const groups=[];
  for(const s of arr){
    const last=groups[groups.length-1];
    if(last&&last.title===s.title&&last.date===s.date&&Math.abs((last.sell||0)-(s.sell||0))<0.01){
      last._qty=(last._qty||1)+1;
      last.margin=(last.margin||0)+(s.margin||0);
      last.marginPct=(last.sell||0)>0?(last.margin/(last.sell*last._qty))*100:0;
    }else{
      groups.push({...s,_qty:1});
    }
  }
  return groups;
}

function getFilteredData_unused(range, salesData){
  const now=new Date();
  const hasSales=salesData.length>0;

  // ── helpers réels ──
  function dayBucket(days){
    return Array.from({length:days},(_,i)=>{
      const d=new Date(now); d.setDate(now.getDate()-days+1+i);
      const dayStr=d.toISOString().split('T')[0];
      const ds=salesData.filter(s=>(s.date||'').startsWith(dayStr));
      return{name:`${d.getDate()}/${d.getMonth()+1}`,profit:ds.reduce((a,s)=>a+s.margin,0),'Marge %':ds.length?ds.reduce((a,s)=>a+s.marginPct,0)/ds.length:null,count:ds.length};
    });
  }
  function weekBucket(totalDays,numWeeks){
    const cutoff=new Date(now); cutoff.setDate(now.getDate()-totalDays+1);
    const filtered=salesData.filter(s=>new Date(s.date)>=cutoff);
    return Array.from({length:numWeeks},(_,i)=>{
      const start=new Date(cutoff); start.setDate(cutoff.getDate()+i*7);
      const end=new Date(start); end.setDate(start.getDate()+6);
      const ws=filtered.filter(s=>{const sd=new Date(s.date);return sd>=start&&sd<=end;});
      return{name:`S${i+1}`,profit:ws.reduce((a,s)=>a+s.margin,0),'Marge %':ws.length?ws.reduce((a,s)=>a+s.marginPct,0)/ws.length:null,count:ws.length};
    });
  }
  function monthBucket(pts){
    return Array.from({length:pts},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-(pts-1-i),1);
      const m=d.getMonth(); const y=d.getFullYear();
      const ms=salesData.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===m&&sd.getFullYear()===y;});
      return{name:MONTHS_FR[m],profit:ms.reduce((a,s)=>a+s.margin,0),'Marge %':ms.length?ms.reduce((a,s)=>a+s.marginPct,0)/ms.length:null,count:ms.length};
    });
  }
  function ytdBucket(){
    const n=now.getMonth()+1;
    return Array.from({length:n},(_,i)=>{
      const ms=salesData.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===i&&sd.getFullYear()===now.getFullYear();});
      return{name:MONTHS_FR[i],profit:ms.reduce((a,s)=>a+s.margin,0),'Marge %':ms.length?ms.reduce((a,s)=>a+s.marginPct,0)/ms.length:null,count:ms.length};
    });
  }

  // ── données réelles ──
  if(hasSales){
    switch(range){
      case '7j':  return dayBucket(7);
      case '1M':  return dayBucket(30);
      case '3M':  return weekBucket(91,13);
      case '6M':  return monthBucket(6);
      case 'YTD': return ytdBucket();
      default:    return monthBucket(6);
    }
  }

  // ── mock réaliste si aucune vente ──
  const sin=(i,a,b,p)=>Math.round((a+Math.sin(i/p*Math.PI*2)*b)*10)/10;
  switch(range){
    case '7j': return Array.from({length:7},(_,i)=>{
      const d=new Date(now); d.setDate(now.getDate()-6+i);
      const p=[0,4.5,0,6.8,2.5,0,9.2][i];
      return{name:`${d.getDate()}/${d.getMonth()+1}`,profit:p,'Marge %':p?[null,34,null,30,38,null,43][i]:null,count:p?1:0};
    });
    case '1M': return Array.from({length:30},(_,i)=>{
      const d=new Date(now); d.setDate(now.getDate()-29+i);
      const p=i%4===0?0:Math.max(0,sin(i,12,9,30)+i*0.4);
      return{name:`${d.getDate()}/${d.getMonth()+1}`,profit:Math.round(p*10)/10,'Marge %':p?Math.round(32+Math.sin(i/5)*8):null,count:p?1:0};
    });
    case '3M': return Array.from({length:13},(_,i)=>({
      name:`S${i+1}`,
      profit:Math.round((14+Math.sin(i/3)*10+i*2.2)*10)/10,
      'Marge %':Math.round(31+Math.sin(i/2.5)*9+i*0.8),
      count:Math.ceil((i+1)/3),
    }));
    case '6M': return Array.from({length:6},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);
      return{name:MONTHS_FR[d.getMonth()],profit:[22,18,35,28,44,52][i],'Marge %':[33,29,38,35,42,47][i],count:[3,2,4,3,5,6][i]};
    });
    case 'YTD': {
      const n=now.getMonth()+1;
      const ps=[18,25,32,28,41,35,48,38,55,44,60,52];
      const ms=[30,34,38,35,42,39,45,41,48,44,51,47];
      return Array.from({length:n},(_,i)=>({name:MONTHS_FR[i],profit:ps[i],'Marge %':ms[i],count:i+2}));
    }
    default: return Array.from({length:6},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);
      return{name:MONTHS_FR[d.getMonth()],profit:[22,18,35,28,44,52][i],'Marge %':[33,29,38,35,42,47][i],count:[3,2,4,3,5,6][i]};
    });
  }
}

function DealScoreCard({result,analysis,analysisLoading,lang}){
  const [barsAnim,setBarsAnim]=useState(false);
  useEffect(()=>{
    if(!result) return;
    setBarsAnim(false);
    const t=setTimeout(()=>setBarsAnim(true),80);
    return()=>clearTimeout(t);
  },[result?.score]);
  if(!result) return null;
  const {score,label,confidence,dataQuality,dimensions,pills}=result;
  const scoreClass=score>=7?'#1D9E75':score>=4?'#F9A26C':'#E53E3E';
  const dimLabels=lang==='en'
    ?{profitPotentiel:'Profit potential',liquidite:'Liquidity',safety:'Safety',upside:'Upside'}
    :{profitPotentiel:'Potentiel profit',liquidite:'Liquidité',safety:'Sécurité',upside:'Upside'};
  return(
    <div style={{background:'#fff',borderRadius:16,border:'1px solid #ECF0F4',boxShadow:'0 1px 4px rgba(0,0,0,0.05),0 4px 16px rgba(0,0,0,0.04)',padding:'16px 18px',display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:10,fontWeight:800,color:'#A3A9A6',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:4}}>Deal Score</div>
          <div style={{display:'flex',alignItems:'baseline',gap:6}}>
            <span className="score-num" style={{color:scoreClass}}>{score.toFixed(1)}</span>
            <span style={{fontSize:13,color:'#A3A9A6',fontWeight:600}}>/10</span>
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <div className="score-tag" style={{background:scoreClass+'18',color:scoreClass,border:`1px solid ${scoreClass}33`}}>{label}</div>
          <div style={{fontSize:10,color:'#A3A9A6',fontWeight:600,marginTop:6}}>{lang==='en'?`${confidence}% confidence`:`${confidence}% confiance`}</div>
        </div>
      </div>
      <div className="bar-block">
        {Object.entries(dimensions).map(([key,val])=>(
          <div key={key} className="bar-row">
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
              <span style={{fontSize:11,fontWeight:700,color:'#6B7280'}}>{dimLabels[key]}</span>
              <span style={{fontSize:11,fontWeight:800,color:'#0D0D0D'}}>{val}/10</span>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{width:barsAnim?`${val*10}%`:'0%'}}/>
            </div>
          </div>
        ))}
      </div>
      {pills.length>0&&(
        <div className="tag-row">
          {pills.map((pill,i)=>(
            <span key={i} style={{background:'#E8F5F0',color:'#1D9E75',borderRadius:99,padding:'4px 10px',fontSize:11,fontWeight:700,border:'1px solid #C6E8DF'}}>{pill}</span>
          ))}
        </div>
      )}
      <div className="ai-insight">
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
          <span style={{width:7,height:7,borderRadius:'50%',background:'#4ECDC4',display:'inline-block',flexShrink:0}}/>
          <span style={{fontSize:10,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.07em'}}>{lang==='en'?'AI Analysis':'Analyse IA'}</span>
        </div>
        {analysisLoading?(
          <div style={{display:'flex',gap:6,alignItems:'center',paddingTop:2}}>
            {[60,90,50].map((w,i)=><span key={i} style={{width:w,height:10,background:'#E5E7EB',borderRadius:4,display:'inline-block'}}/>)}
          </div>
        ):analysis?(
          <div style={{fontSize:12,fontWeight:600,color:'#374151',lineHeight:1.6}}>{analysis}</div>
        ):(
          <div style={{fontSize:11,color:'#A3A9A6',fontStyle:'italic'}}>{lang==='en'?'Analysis not available':'Analyse non disponible'}</div>
        )}
      </div>
      {dataQuality==='low'&&(
        <div style={{fontSize:10,color:'#A3A9A6',fontWeight:600}}>
          {lang==='en'?'Limited precision — add more sales to improve':'Précision limitée — ajoute des ventes pour améliorer'}
        </div>
      )}
    </div>
  );
}

function DonutChart({segments}){
  const r=54,cx=60,cy=60,circ=2*Math.PI*r;
  let offset=0;
  return(
    <svg width={120} height={120} viewBox="0 0 120 120">
      <g transform="rotate(-90 60 60)">
        {segments.map((s,i)=>{
          const dash=(s.pct/100)*circ;
          const gap=circ-dash;
          const el=<circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={12} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset}/>;
          offset+=dash;
          return el;
        })}
      </g>
    </svg>
  );
}

function normalizeCat(raw){
  if(!raw) return 'Autre';
  const v=raw.toLowerCase()
    .replace(/[éèêë]/g,'e').replace(/[àâ]/g,'a').replace(/[ùû]/g,'u').replace(/[îï]/g,'i').replace(/[ôö]/g,'o')
    .replace(/[^a-z]/g,'');
  if(v==='mode'||v==='fashion') return 'Mode';
  if(v==='hightech'||v==='tech'||v==='hitech') return 'High-Tech';
  if(v==='luxe'||v==='luxury') return 'Luxe';
  if(v==='maison'||v==='home') return 'Maison';
  if(v==='sport') return 'Sport';
  if(v==='musique'||v==='music') return 'Musique';
  if(v==='beaute'||v==='beauty') return 'Beauté';
  if(v==='collection') return 'Collection';
  if(v==='livres'||v==='books') return 'Livres';
  if(v==='automoto'||v==='auto') return 'Auto-Moto';
  if(v==='electromenager'||v==='electro') return 'Électroménager';
  if(v==='jouets'||v==='toys') return 'Jouets';
  return 'Autre';
}

const CAT_COLORS_MAP={
  'Mode':'#DB2777','High-Tech':'#2563EB','Luxe':'#D97706','Maison':'#16A34A',
  'Sport':'#7C3AED','Musique':'#9333EA','Beauté':'#EC4899','Collection':'#F59E0B',
  'Livres':'#84CC16','Auto-Moto':'#EF4444','Électroménager':'#06B6D4','Jouets':'#F97316',
  'Autre':'#6B7280',
};

function StatsTab({sales,items,lang}){
  const RANGES=lang==='en'?['1M','3M','6M','1Y','All']:['1M','3M','6M','1A','Tout'];
  const [range,setRange]=useState('6M');
  const [aiText,setAiText]=useState('');
  const [aiLoading,setAiLoading]=useState(false);

  const now=new Date();
  const cutoff=useMemo(()=>{
    const d=new Date();
    if(range==='1M'){d.setMonth(d.getMonth()-1);}
    else if(range==='3M'){d.setMonth(d.getMonth()-3);}
    else if(range==='6M'){d.setMonth(d.getMonth()-6);}
    else if(range==='1A'||range==='1Y'){d.setFullYear(d.getFullYear()-1);}
    else d.setFullYear(2000);
    return d;
  },[range]);

  const filtered=useMemo(()=>sales.filter(s=>{
    const d=new Date(s.created_at||s.date||0);
    return d>=cutoff;
  }),[sales,cutoff]);

  const totalProfit=filtered.reduce((a,s)=>a+(s.margin||0),0);
  const totalRev=filtered.reduce((a,s)=>a+(s.sell||0),0);
  const avgMargin=filtered.length?Math.round(filtered.reduce((a,s)=>a+(s.marginPct||0),0)/filtered.length*10)/10:0;

  // Table ventes n'a pas de colonne type → lookup depuis inventaire (items)
  const titleToType=useMemo(()=>{
    const m={};
    items.forEach(i=>{if(i.title)m[i.title.toLowerCase().trim()]=i.type;});
    return m;
  },[items]);

  const catMap={};
  filtered.forEach(s=>{
    const raw=s.type||s.categorie||titleToType[s.title?.toLowerCase()?.trim()]||'';
    const c=normalizeCat(raw);
    catMap[c]=(catMap[c]||0)+(s.margin||0);
  });
  const catEntries=Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  const bestCategory=catEntries[0]?.[0]||null;
  const bestCatProfit=catEntries[0]?.[1]||0;
  const bestCategoryPct=totalProfit>0?Math.round((bestCatProfit/totalProfit)*100):0;
  const bestItem=[...filtered].sort((a,b)=>(b.margin||0)-(a.margin||0))[0];
  const bestItemName=bestItem?.title||null;
  const bestItemProfit=bestItem?.margin||0;

  const totalCatProfit=catEntries.reduce((a,[,v])=>a+(v>0?v:0),0)||1;
  const donutSegs=catEntries.filter(([,v])=>v>0).map(([c,v])=>({color:CAT_COLORS_MAP[c]||'#6B7280',pct:(v/totalCatProfit)*100,label:c}));

  const monthlyMap={};
  filtered.forEach(s=>{
    const d=new Date(s.created_at||s.date||0);
    const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthlyMap[k]=(monthlyMap[k]||0)+(s.margin||0);
  });
  const monthKeys=Object.keys(monthlyMap).sort();
  const chartData=monthKeys.map(k=>({name:k.slice(5),profit:Math.round(monthlyMap[k]*100)/100}));

  const topSellers=[...filtered].sort((a,b)=>(b.margin||0)-(a.margin||0)).slice(0,3);

  const slowStock=[...items].filter(i=>i.statut!=='vendu').sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0)).slice(0,3);
  const slowCount=[...items].filter(i=>{
    if(i.statut==='vendu') return false;
    return (now-new Date(i.created_at||0))>30*24*3600*1000;
  }).length;

  const cells=Array.from({length:84},(_,i)=>{
    const d=new Date(now);
    d.setDate(d.getDate()-i);
    const k=d.toISOString().slice(0,10);
    const count=sales.filter(s=>(s.created_at||s.date||'').slice(0,10)===k).length;
    const lvl=count===0?'':count===1?'l1':count===2?'l2':count<=4?'l3':'l4';
    return lvl;
  }).reverse();

  useEffect(()=>{
    if(filtered.length===0){setAiText('');return;}
    const SURL=import.meta.env.VITE_SUPABASE_URL;
    if(!SURL){setAiText('');return;}
    setAiLoading(true);
    setAiText('');
    fetch(`${SURL}/functions/v1/stats-analysis`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        periode:range,
        profit:Math.round(totalProfit),
        ventes:filtered.length,
        marge:avgMargin,
        meilleure_cat:bestCategory||'',
        meilleure_cat_pct:bestCategoryPct,
        meilleur_article:bestItemName||'',
        meilleur_article_profit:Math.round(bestItemProfit),
        articles_lents:slowCount,
        lang,
      }),
    })
      .then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();})
      .then(d=>{setAiText(d?.analysis||'');setAiLoading(false);})
      .catch(err=>{console.error('[StatsTab] stats-analysis error:',err);setAiLoading(false);});
  },[range,filtered.length]);

  const fmt2=n=>(Math.round(n*100)/100).toFixed(2).replace('.',',')+' €';
  const fmtp2=n=>(Math.round(n*10)/10).toFixed(1)+'%';

  return(
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      {/* Range pills */}
      <div className="range-row">
        {RANGES.map(r=>(
          <button key={r} className={`range-pill${range===r?' on':''}`} onClick={()=>setRange(r)}>{r}</button>
        ))}
      </div>

      {/* Hero KPIs */}
      <div className="kpi-hero-row">
        <div className="kpi-hero" style={{background:'linear-gradient(135deg,#0F6E56,#1D9E75)',color:'#fff'}}>
          <div style={{fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.07em',opacity:0.7,marginBottom:4}}>{lang==='en'?'Total profit':'Profit total'}</div>
          <div style={{fontSize:28,fontWeight:900,letterSpacing:'-0.03em',lineHeight:1}}>{fmt2(totalProfit)}</div>
        </div>
        <div className="kpi-hero" style={{background:'#fff',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
          <div style={{fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.07em',color:'#6B7280',marginBottom:4}}>{lang==='en'?'Revenue':'Revenu'}</div>
          <div style={{fontSize:28,fontWeight:900,letterSpacing:'-0.03em',color:'#0D0D0D',lineHeight:1}}>{fmt2(totalRev)}</div>
        </div>
      </div>

      {/* Spark cards */}
      <div className="spark-row">
        <div className="spark-card">
          <div style={{fontSize:10,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:4}}>{lang==='en'?'Sales':'Ventes'}</div>
          <div style={{fontSize:22,fontWeight:900,color:'#0D0D0D',letterSpacing:'-0.03em'}}>{filtered.length}</div>
          <Sparkline data={chartData.length?chartData.map(d=>d.profit):[0]} color="#1D9E75"/>
        </div>
        <div className="spark-card">
          <div style={{fontSize:10,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:4}}>{lang==='en'?'Avg margin':'Marge moy.'}</div>
          <div style={{fontSize:22,fontWeight:900,color:'#0D0D0D',letterSpacing:'-0.03em'}}>{fmtp2(avgMargin)}</div>
          <Sparkline data={chartData.length?chartData.map(d=>d.profit):[0]} color="#4ECDC4"/>
        </div>
      </div>

      {/* AI Analysis card */}
      <div style={{background:'#F0FAF7',borderRadius:14,padding:'16px',borderLeft:'3px solid #1D9E75',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <span style={{fontSize:16}}>🤖</span>
          <span style={{fontSize:12,fontWeight:800,color:'#0D0D0D'}}>{lang==='en'?'AI Analysis':'Analyse IA'}</span>
          <span style={{marginLeft:'auto',background:'#1D9E75',color:'#fff',borderRadius:99,padding:'2px 9px',fontSize:10,fontWeight:800,letterSpacing:'0.04em'}}>{lang==='en'?'Predictive':'Prédictif'}</span>
        </div>
        {aiLoading?(
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {[100,80,60].map((w,i)=><div key={i} style={{height:10,background:'#C6E8DF',borderRadius:4,width:`${w}%`}}/>)}
          </div>
        ):aiText?(
          <div style={{fontSize:13,color:'#1A4A3A',lineHeight:1.65,fontWeight:500}}>{aiText}</div>
        ):(
          <div style={{fontSize:12,color:'#5DCAA5',fontStyle:'italic'}}>{filtered.length===0?(lang==='en'?'No sales in this period':'Aucune vente sur cette période'):(lang==='en'?'Analysis unavailable':'Analyse non disponible')}</div>
        )}
      </div>

      {/* Donut by category */}
      {donutSegs.length>0&&(
        <div style={{background:'#fff',borderRadius:14,padding:'16px',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
          <div style={{fontSize:12,fontWeight:800,color:'#0D0D0D',marginBottom:12}}>{lang==='en'?'Profit by category':'Profit par catégorie'}</div>
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <DonutChart segments={donutSegs}/>
            <div style={{display:'flex',flexDirection:'column',gap:6,flex:1}}>
              {donutSegs.map((s,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{width:10,height:10,borderRadius:3,background:s.color,flexShrink:0}}/>
                  <span style={{fontSize:11,fontWeight:700,color:'#374151',flex:1}}>{s.label}</span>
                  <span style={{fontSize:11,fontWeight:800,color:'#0D0D0D'}}>{Math.round(s.pct)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Evolution chart placeholder */}
      {chartData.length>1&&(
        <div style={{background:'#fff',borderRadius:14,padding:'16px',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
          <div style={{fontSize:12,fontWeight:800,color:'#0D0D0D',marginBottom:10}}>{lang==='en'?'📊 Profit evolution':'📊 Évolution du profit'}</div>
          <div style={{display:'flex',gap:4,alignItems:'flex-end',height:60}}>
            {chartData.map((d,i)=>{
              const maxP=Math.max(...chartData.map(x=>x.profit),1);
              const h=Math.max(4,Math.round((d.profit/maxP)*56));
              return(
                <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                  <div style={{width:'100%',height:h,background:'linear-gradient(180deg,#4ECDC4,#1D9E75)',borderRadius:'3px 3px 0 0'}}/>
                  <span style={{fontSize:9,color:'#A3A9A6',fontWeight:600}}>{d.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Heatmap */}
      <div style={{background:'#fff',borderRadius:14,padding:'16px',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
        <div style={{fontSize:12,fontWeight:800,color:'#0D0D0D',marginBottom:10}}>{lang==='en'?'Activity (84 days)':'Activité (84 jours)'}</div>
        <div className="heatmap-grid">
          {cells.map((lvl,i)=><div key={i} className={`heatmap-cell${lvl?' '+lvl:''}`}/>)}
        </div>
      </div>

      {/* Top sellers */}
      {topSellers.length>0&&(
        <div style={{background:'#fff',borderRadius:14,padding:'16px',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
          <div style={{fontSize:12,fontWeight:800,color:'#0D0D0D',marginBottom:10}}>{lang==='en'?'🏆 Top sellers':'🏆 Meilleurs vendeurs'}</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {topSellers.map((s,i)=>(
              <div key={i} className="leader-row">
                <span style={{fontSize:14,fontWeight:900,color:'#4ECDC4',width:20,flexShrink:0}}>#{i+1}</span>
                <span style={{flex:1,fontSize:13,fontWeight:700,color:'#0D0D0D',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.title}</span>
                <span style={{fontSize:13,fontWeight:900,color:'#1D9E75',flexShrink:0}}>{fmt2(s.margin||0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Slow movers */}
      {slowStock.length>0&&(
        <div style={{background:'#fff',borderRadius:14,padding:'16px',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
          <div style={{fontSize:12,fontWeight:800,color:'#0D0D0D',marginBottom:10}}>{lang==='en'?'🐌 Slow movers':'🐌 Articles lents'}</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {slowStock.map((s,i)=>(
              <div key={i} className="leader-row">
                <span style={{flex:1,fontSize:13,fontWeight:700,color:'#0D0D0D',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.title}</span>
                <span style={{fontSize:11,color:'#F9A26C',fontWeight:700,flexShrink:0}}>{lang==='en'?'In stock':'En stock'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{height:16}}/>
    </div>
  );
}

function VoiceAssistant({items,sales,lang,actions,vaStep,setVaStep,vaResults,setVaResults,vaError,setVaError,markSold,deleteItem}){
  const vaMediaRef=useRef(null);
  const vaChunksRef=useRef([]);
  const autoCloseRef=useRef(null);
  const drawerRef=useRef(null);
  const swipeRef=useRef({startY:0,active:false});
  const [vaEdits,setVaEdits]=useState({});
  const SURL=import.meta.env.VITE_SUPABASE_URL;

  function resetVA(){
    clearTimeout(autoCloseRef.current);
    try{if(vaMediaRef.current&&vaMediaRef.current.state!=="inactive")vaMediaRef.current.stop();}catch{}
    vaMediaRef.current=null;vaChunksRef.current=[];
    setVaStep("");setVaResults([]);setVaError(null);setVaEdits({});
  }

  async function handleFabClick(){
    if(vaStep==="thinking")return;
    if(vaStep==="recording"){vaMediaRef.current?.stop();return;}
    if(vaStep==="results"){resetVA();return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const recorder=new MediaRecorder(stream);
      vaChunksRef.current=[];
      recorder.ondataavailable=e=>{if(e.data.size>0)vaChunksRef.current.push(e.data);};
      recorder.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());
        const mimeType=(recorder.mimeType||"audio/webm").split(";")[0];
        const blob=new Blob(vaChunksRef.current,{type:mimeType});
        setVaStep("thinking");
        try{
          const fd=new FormData();
          const ext=mimeType.includes("mp4")?"mp4":mimeType.includes("aac")?"aac":"webm";
          fd.append("audio",blob,`audio.${ext}`);fd.append("lang",lang);
          const tRes=await fetch(`${SURL}/functions/v1/voice-transcribe`,{method:"POST",body:fd});
          if(!tRes.ok)throw new Error(lang==="en"?"Transcription failed":"Transcription échouée");
          const{text,error:tErr}=await tRes.json();
          if(tErr)throw new Error(tErr);
          if(!text?.trim())throw new Error(lang==="en"?"No speech detected":"Aucune parole détectée");
          const iRes=await fetch(`${SURL}/functions/v1/voice-intent`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,lang})});
          if(!iRes.ok)throw new Error(lang==="en"?"Intent failed":"Erreur intention");
          const{tasks,error:iErr}=await iRes.json();
          if(iErr)throw new Error(iErr);
          if(!Array.isArray(tasks)||!tasks.length)throw new Error(lang==="en"?"Nothing understood":"Rien compris");
          const{results}=await executeVoiceTasks(tasks,{items,sales,lang,actions});
          setVaResults(results);setVaStep("results");
          const noActionNeeded=results.every(r=>r.status==="success"&&r.intent!=="inventory_search"&&!(r.intent==="query_stats"&&r.data?.metric==="stock_by_period"));
          if(noActionNeeded){
            const blocs=results.reduce((n,r)=>{
              if(!r||r.status!=="success")return n;
              if(r.intent==="query_stats"&&(r.data?.metric==="best_sales"||r.data?.metric==="worst_sales"))return n+(r.data?.items?.length||0);
              if(r.intent==="analytics_best")return n+(r.data?.byCategory?Object.keys(r.data.byCategory).length:(r.data?.items?.length||0));
              if(r.intent==="analytics_dormant")return n+Math.min(r.data?.items?.length||0,6);
              if(r.intent==="analytics_date")return n+Math.min(r.data?.items?.length||0,5);
              return n+1;
            },0);
            const delay=Math.min(2000+blocs*1500,12000);
            autoCloseRef.current=setTimeout(()=>resetVA(),delay);
          }
        }catch(e){setVaError(e.message||"Error");setVaStep("");}
      };
      vaMediaRef.current=recorder;recorder.start();setVaStep("recording");
    }catch(e){setVaError(e.message||(lang==="en"?"Microphone unavailable":"Micro non disponible"));setVaStep("");}
  }

  function replaceResult(idx,patch){setVaResults(prev=>prev.map((r,i)=>i===idx?{...r,...patch}:r));}

  const fabSize=56;
  const isIdle=vaStep==="";
  const isRec=vaStep==="recording";
  const isThink=vaStep==="thinking";
  const isRes=vaStep==="results";

  return(
    <>
      <style>{`
        @keyframes va-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
        @keyframes va-pulse{0%,100%{box-shadow:0 0 0 0 rgba(229,62,62,0.5),0 4px 20px rgba(229,62,62,0.35)}50%{box-shadow:0 0 0 12px rgba(229,62,62,0),0 4px 20px rgba(229,62,62,0.35)}}
        @keyframes va-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes va-w1{0%,100%{height:4px}50%{height:16px}}
        @keyframes va-w2{0%,100%{height:8px}50%{height:24px}}
        @keyframes va-w3{0%,100%{height:12px}50%{height:32px}}
        @keyframes va-w4{0%,100%{height:6px}50%{height:20px}}
        @keyframes va-w5{0%,100%{height:10px}50%{height:28px}}
        @keyframes va-w6{0%,100%{height:5px}50%{height:18px}}
        @keyframes va-w7{0%,100%{height:9px}50%{height:22px}}
        @keyframes va-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes va-slidein{from{transform:translateY(100%)}to{transform:translateY(0)}}
      `}</style>

      {/* FAB */}
      <button
        onClick={handleFabClick}
        disabled={isThink}
        className={"fab-vocal"+(isRec?" listening":"")+(isThink?" thinking":"")}
        style={{
          display: isRes ? "none" : "flex",
          animation: isIdle ? "va-breathe 3s ease-in-out infinite" : isRec ? "va-pulse 1.2s ease-in-out infinite" : "none",
        }}
      >
        {isThink?(
          <div style={{position:"relative",width:fabSize,height:fabSize,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"3px solid rgba(0,0,0,0.08)",borderTopColor:"#1D9E75",borderRightColor:"#E8956D",animation:"va-spin 0.8s linear infinite"}}/>
            <span style={{fontSize:22,position:"relative",zIndex:1}}>🎤</span>
          </div>
        ):(
          <span style={{fontSize:22,lineHeight:1}}>🎤</span>
        )}
      </button>

      {/* Listening overlay card */}
      {isRec&&(
        <div style={{position:"fixed",bottom:"calc(env(safe-area-inset-bottom,0px) + 140px)",right:16,width:220,background:"#fff",borderRadius:16,border:"0.5px solid rgba(0,0,0,0.08)",padding:"12px 14px",boxShadow:"0 8px 32px rgba(0,0,0,0.12)",zIndex:999,animation:"va-fadein 0.2s ease"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#E53E3E",marginBottom:10,textAlign:"center"}}>{lang==="en"?"Listening…":"Je t'écoute…"}</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,height:36,marginBottom:10}}>
            {[1,2,3,4,5,6,7].map(n=>(
              <div key={n} style={{width:4,height:8,background:"linear-gradient(to top,#1D9E75,#E8956D)",borderRadius:99,animation:`va-w${n} ${0.7+n*0.1}s ease-in-out ${n*0.07}s infinite`}}/>
            ))}
          </div>
          <div style={{fontSize:10,fontWeight:600,color:"#A3A9A6",textAlign:"center"}}>{lang==="en"?"Tap to stop":"Appuie pour arrêter"}</div>
        </div>
      )}

      {/* Thinking indicator */}
      {isThink&&(
        <div style={{position:"fixed",bottom:"calc(env(safe-area-inset-bottom,0px) + 140px)",right:16,background:"#fff",borderRadius:16,border:"0.5px solid rgba(0,0,0,0.08)",padding:"10px 16px",boxShadow:"0 8px 32px rgba(0,0,0,0.12)",zIndex:999,fontSize:12,fontWeight:700,color:"#1D9E75",animation:"va-fadein 0.2s ease"}}>
          {lang==="en"?"Thinking…":"Je réfléchis…"}
        </div>
      )}

      {/* Error bubble */}
      {vaError&&vaStep===""&&(
        <div style={{position:"fixed",bottom:"calc(env(safe-area-inset-bottom,0px) + 140px)",right:16,background:"#FEF2F2",borderRadius:16,border:"1px solid #FCA5A5",padding:"10px 14px",boxShadow:"0 4px 16px rgba(0,0,0,0.08)",zIndex:999,fontSize:12,fontWeight:600,color:"#E53E3E",maxWidth:240,display:"flex",gap:8,alignItems:"center",animation:"va-fadein 0.2s ease"}}>
          <span style={{flex:1}}>{vaError}</span>
          <button onClick={()=>setVaError(null)} style={{background:"none",border:"none",cursor:"pointer",color:"#E53E3E",fontSize:14,padding:0,lineHeight:1,flexShrink:0}}>✕</button>
        </div>
      )}

      {/* Results drawer */}
      {vaResults.length>0&&(
        <div ref={drawerRef}
          onTouchStart={e=>{
            swipeRef.current.startY=e.touches[0].clientY;
            swipeRef.current.active=(drawerRef.current?.scrollTop??0)===0;
          }}
          onTouchMove={e=>{
            if(!swipeRef.current.active)return;
            const dy=e.touches[0].clientY-swipeRef.current.startY;
            if(dy>0&&drawerRef.current){drawerRef.current.style.transition="none";drawerRef.current.style.transform=`translateY(${dy}px)`;}
          }}
          onTouchEnd={e=>{
            if(!swipeRef.current.active)return;
            const dy=e.changedTouches[0].clientY-swipeRef.current.startY;
            if(dy>60){resetVA();}
            else if(drawerRef.current){drawerRef.current.style.transition="transform 0.2s ease";drawerRef.current.style.transform="translateY(0)";}
          }}
          style={{position:"fixed",bottom:0,left:0,right:0,maxHeight:"min(70vh,700px)",overflowY:"auto",background:"#fff",borderRadius:"20px 20px 0 0",borderTop:"0.5px solid rgba(0,0,0,0.08)",padding:"16px 16px calc(env(safe-area-inset-bottom,0px) + 16px)",zIndex:999,boxShadow:"0 -8px 40px rgba(0,0,0,0.12)",animation:"va-slidein 0.3s ease"}}>
          {/* Header */}
          <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
            <div style={{flex:1,display:"flex",justifyContent:"center"}}>
              <div style={{width:36,height:4,background:"rgba(0,0,0,0.12)",borderRadius:99}}/>
            </div>
            <button onClick={resetVA} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:28,height:28,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",color:"#6B7280",flexShrink:0}}>✕</button>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {vaResults.map((result,idx)=>{
              const{intent,status,data,message,taskData}=result||{};

              if(intent==="deal_score"&&!taskData?.prix_vente) return null;

              if(status==="error"||intent==="unknown"){
                return(<div key={idx} style={{background:"#F9FAFB",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.06)"}}><div style={{fontSize:13,color:"#6B7280",fontWeight:600}}>{message||(lang==="en"?"Didn't understand, try again":"Je n'ai pas compris, réessaie")}</div></div>);
              }

              if(status==="success"&&intent==="inventory_add"){
                const cat=data?.type||taskData?.categorie||taskData?.type;
                const ts=cat?getTypeStyle(cat):null;
                const qAdded=(data?.quantite||taskData?.quantite)>1?(data?.quantite||taskData?.quantite):null;
                const marque=data?.marque||taskData?.marque;
                const nom=data?.title||data?.nom||taskData?.nom;
                const prix=data?.buy??data?.prix_achat??taskData?.prix_achat;
                const desc=data?.description||taskData?.description||null;
                return(
                  <div key={idx} style={{background:"#E8F5F0",borderRadius:12,padding:"12px 14px",border:"1px solid #9FE1CB",display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>✅</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#0F6E56"}}>{nom} {lang==="en"?"added":"ajouté"}{prix?` · ${prix}€`:""}{qAdded?` · ×${qAdded}`:""}</div>
                      {desc&&<div style={{fontSize:11,color:"#1D9E75",fontWeight:500,marginTop:2,opacity:0.85}}>{desc}</div>}
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
                        {marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{marque}</span>}
                        {ts&&cat!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(cat,lang)}</span>}
                      </div>
                    </div>
                  </div>
                );
              }

              if(status==="success"&&intent==="inventory_search"){
                const found=data?.items||[];
                const anyFormOpen=vaEdits[idx]?.sellOpen!=null||vaEdits[idx]?.deleteOpen!=null||vaEdits[idx]?.editOpen!=null;
                const CATS=["Mode","High-Tech","Maison","Électroménager","Luxe","Jouets","Livres","Sport","Auto-Moto","Beauté","Musique","Collection","Autre"];
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>{lang==="en"?"Search":"Résultats"} ({found.length})</div>
                    {found.length===0?(<div style={{fontSize:13,color:"#A3A9A6",fontStyle:"italic"}}>{lang==="en"?"No items found":"Aucun article trouvé"}</div>):(
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {found.map((item,i)=>{
                          const isSellOpen=vaEdits[idx]?.sellOpen===i;
                          const sellPrice=vaEdits[idx]?.sellPrice??"";
                          const sellFees=vaEdits[idx]?.sellFees??"";
                          const sellQty=vaEdits[idx]?.sellQty??1;
                          const sellPrixMode=vaEdits[idx]?.sellPrixMode??"total";
                          const sellFeesMode=vaEdits[idx]?.sellFeesMode??"total";
                          const isDeleteOpen=vaEdits[idx]?.deleteOpen===i;
                          const isEditOpen=vaEdits[idx]?.editOpen===i;
                          const ef=vaEdits[idx]?.editFields||{};
                          const isSold=item.statut==="vendu"||item.statut==="sold";
                          const nom=item.titre||item.title||item.nom||"";
                          const inputSt={fontSize:12,fontWeight:600,border:"1px solid rgba(0,0,0,0.15)",borderRadius:7,padding:"5px 8px",fontFamily:"inherit",color:"#0D0D0D",background:"#fff",width:"100%"};
                          return(
                            <div key={i} style={{paddingBottom:6,borderBottom:i<found.length-1?"1px solid rgba(0,0,0,0.04)":"none"}}>
                              {/* Item row */}
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0"}}>
                                <div style={{minWidth:0,flex:1}}>
                                  <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nom}</div>
                                  <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:2}}>
                                    {item.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{item.marque}</span>}
                                    {(item.type||item.categorie)&&(item.type||item.categorie)!=="Autre"&&(()=>{const ts2=getTypeStyle(item.type||item.categorie);return<span style={{background:ts2.bg,color:ts2.color,borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,border:`1px solid ${ts2.border}`}}>{ts2.emoji} {typeLabel(item.type||item.categorie,lang)}</span>;})()}
                                    {(item.quantite||item.qty)>1&&<span style={{background:"#F3F4F6",color:"#6B7280",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,border:"1px solid #E5E7EB"}}>×{item.quantite||item.qty}</span>}
                                  </div>
                                  {(item.description||item.desc)&&<div style={{fontSize:11,color:"#6B7280",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.description||item.desc}</div>}
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,marginLeft:8}}>
                                  <div style={{textAlign:"right"}}>
                                    {isSold?(()=>{
                                      const fmtDate=d=>d?new Date(d).toLocaleDateString(lang==="en"?"en-GB":"fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}):"";
                                      return(
                                        <>
                                          <div style={{fontSize:11,color:"#A3A9A6",textDecoration:"line-through"}}>{item.buy||item.prix_achat}€</div>
                                          <div style={{fontSize:13,fontWeight:700,color:"#1D9E75"}}>{item.sell||item.prix_vente||"?"}€</div>
                                          {item.date_vente&&<div style={{fontSize:10,color:"#1D9E75",marginTop:1}}>{lang==="en"?"sold on ":"vendu le "}{fmtDate(item.date_vente)}</div>}
                                        </>
                                      );
                                    })():(()=>{
                                      const days=item.date_ajout?Math.floor((Date.now()-new Date(item.date_ajout))/86400000):null;
                                      const fmtDate=d=>d?new Date(d).toLocaleDateString(lang==="en"?"en-GB":"fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}):"";
                                      return(
                                        <>
                                          <div style={{fontSize:13,fontWeight:700,color:"#F9A26C"}}>{item.buy||item.prix_achat}€</div>
                                          {item.date_ajout&&<div style={{fontSize:10,color:"#A3A9A6",marginTop:1}}>{lang==="en"?`in stock since `:`en stock depuis le `}{fmtDate(item.date_ajout)}{days!==null?` (${days}${lang==="en"?"d":"j"})`:""}</div>}
                                        </>
                                      );
                                    })()}
                                  </div>
                                  {!anyFormOpen&&!isSold&&(
                                    <button onClick={()=>setVaEdits(prev=>({...prev,[idx]:{sellOpen:i,sellPrice:"",sellFees:"",sellQty:1,sellPrixMode:"total",sellFeesMode:"total"}}))}
                                      style={{fontSize:10,fontWeight:700,color:"#1D9E75",border:"1px solid #1D9E75",borderRadius:6,padding:"3px 7px",background:"transparent",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                                      {lang==="en"?"Mark as sold":"Marquer vendu"}
                                    </button>
                                  )}
                                  {isSold&&!anyFormOpen&&<span style={{fontSize:10,fontWeight:700,color:"#1D9E75"}}>{lang==="en"?"✓ sold":"✓ vendu"}</span>}
                                  {!anyFormOpen&&(
                                    <>
                                      <button onClick={()=>setVaEdits(prev=>({...prev,[idx]:{editOpen:i,editFields:{nom,prix_achat:item.prix_achat||item.buy||"",marque:item.marque||item.brand||"",type:item.type||item.categorie||""}}}))}
                                        style={{fontSize:10,fontWeight:700,color:"#1D9E75",border:"1px solid #1D9E75",borderRadius:6,padding:"3px 7px",background:"transparent",cursor:"pointer",fontFamily:"inherit"}}>
                                        ✏️
                                      </button>
                                      <button onClick={()=>setVaEdits(prev=>({...prev,[idx]:{deleteOpen:i}}))}
                                        style={{fontSize:10,fontWeight:700,color:"#E53E3E",border:"1px solid #E53E3E",borderRadius:6,padding:"3px 7px",background:"transparent",cursor:"pointer",fontFamily:"inherit"}}>
                                        ✕
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Sell form */}
                              {isSellOpen&&(
                                <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:6}}>
                                  {(item.quantite||1)>1&&(
                                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                                      <span style={{fontSize:11,color:"#6B7280",flex:1}}>{lang==="en"?"Qty to sell":"Qté à vendre"}</span>
                                      <input type="number" min={1} max={item.quantite} value={sellQty}
                                        onFocus={e=>e.target.select()}
                                        onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],sellQty:Math.max(1,Math.min(parseInt(e.target.value)||1,item.quantite))}}))}
                                        style={{width:60,fontSize:12,fontWeight:600,border:"1px solid rgba(0,0,0,0.15)",borderRadius:7,padding:"5px 8px",textAlign:"center",fontFamily:"inherit"}}/>
                                      <span style={{fontSize:11,color:"#A3A9A6"}}>/ {item.quantite}</span>
                                    </div>
                                  )}
                                  {sellQty>1&&(
                                    <>
                                      <div style={{display:"flex",gap:4}}>
                                        {["total","unit"].map(m=>(
                                          <button key={m} onClick={()=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],sellPrixMode:m}}))}
                                            style={{flex:1,padding:"3px 0",fontSize:10,fontWeight:700,borderRadius:6,border:"1px solid #1D9E75",background:sellPrixMode===m?"#1D9E75":"transparent",color:sellPrixMode===m?"#fff":"#1D9E75",cursor:"pointer",fontFamily:"inherit"}}>
                                            {m==="total"?(lang==="en"?"Total price":"Prix total"):(lang==="en"?"Per unit":"Par unité")}
                                          </button>
                                        ))}
                                      </div>
                                      <div style={{display:"flex",gap:4}}>
                                        {["total","unit"].map(m=>(
                                          <button key={m} onClick={()=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],sellFeesMode:m}}))}
                                            style={{flex:1,padding:"3px 0",fontSize:10,fontWeight:700,borderRadius:6,border:"1px solid #F9A26C",background:sellFeesMode===m?"#F9A26C":"transparent",color:sellFeesMode===m?"#fff":"#F9A26C",cursor:"pointer",fontFamily:"inherit"}}>
                                            {m==="total"?(lang==="en"?"Fees on total":"Frais total"):(lang==="en"?"Fees/unit":"Frais/unité")}
                                          </button>
                                        ))}
                                      </div>
                                      {parseFloat(sellPrice)>0&&<div style={{fontSize:10,color:"#6B7280",textAlign:"center"}}>{sellPrixMode==="total"?`= ${(parseFloat(sellPrice)/sellQty).toFixed(2)}€/unité`:`= ${(parseFloat(sellPrice)*sellQty).toFixed(2)}€ total`}</div>}
                                    </>
                                  )}
                                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                                    <div style={{display:"flex",gap:6,flex:1}}>
                                      <input type="number" value={sellPrice} autoFocus
                                        onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],sellPrice:e.target.value}}))}
                                        placeholder={lang==="en"?"Sale price (€)":"Prix de vente (€)"}
                                        style={{flex:2,fontSize:12,fontWeight:600,border:"1px solid #1D9E75",borderRadius:7,padding:"5px 8px",fontFamily:"inherit",color:"#0D0D0D",background:"#fff"}}/>
                                      <input type="number" value={sellFees}
                                        onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],sellFees:e.target.value}}))}
                                        placeholder={lang==="en"?"Fees (€)":"Frais (€)"}
                                        style={{flex:1,fontSize:12,fontWeight:600,border:"1px solid rgba(0,0,0,0.15)",borderRadius:7,padding:"5px 8px",fontFamily:"inherit",color:"#0D0D0D",background:"#fff"}}/>
                                    </div>
                                    <button onClick={async()=>{
                                      const pv=parseFloat(sellPrice)||0;
                                      const pf=parseFloat(sellFees)||0;
                                      const qty=Math.max(1,Math.min(parseInt(sellQty)||1,item.quantite||1));
                                      const svUnit=sellPrixMode==="total"&&qty>1?pv/qty:pv;
                                      const sfUnit=sellFeesMode==="total"&&qty>1?pf/qty:pf;
                                      if(svUnit>0){
                                        await actions.confirmSellDirect(item,svUnit,sfUnit,qty);
                                        await actions.fetchAll();
                                      }
                                      setVaEdits(prev=>({...prev,[idx]:{sellOpen:null,sellPrice:"",sellFees:"",sellQty:1,sellPrixMode:"total",sellFeesMode:"total"}}));
                                    }} style={{fontSize:11,fontWeight:800,color:"#fff",background:"#1D9E75",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                      {lang==="en"?"✓ Sold":"✓ Vendu"}
                                    </button>
                                    <button onClick={()=>setVaEdits(prev=>({...prev,[idx]:{sellOpen:null,sellPrice:"",sellFees:"",sellQty:1,sellPrixMode:"total",sellFeesMode:"total"}}))}
                                      style={{fontSize:11,color:"#6B7280",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:7,padding:"5px 8px",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Delete confirm */}
                              {isDeleteOpen&&(
                                <div style={{background:"#FFF5F5",borderRadius:8,padding:"10px 12px",marginTop:6,border:"1px solid #FCA5A5"}}>
                                  <div style={{fontSize:12,fontWeight:700,color:"#0D0D0D",marginBottom:8}}>
                                    {lang==="en"?`Delete "${nom}"?`:`Supprimer "${nom}" ?`}
                                  </div>
                                  <div style={{display:"flex",gap:6}}>
                                    <button onClick={()=>{
                                      actions.deleteItem(item.id);
                                      replaceResult(idx,{...result,data:{...data,items:data.items.filter((_,j)=>j!==i)}});
                                      setVaEdits(prev=>({...prev,[idx]:{deleteOpen:null}}));
                                    }} style={{flex:1,padding:"6px",background:"#E53E3E",color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                                      {lang==="en"?"Delete":"Supprimer"}
                                    </button>
                                    <button onClick={()=>setVaEdits(prev=>({...prev,[idx]:{deleteOpen:null}}))}
                                      style={{flex:1,padding:"6px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:7,fontSize:12,fontWeight:600,color:"#6B7280",cursor:"pointer",fontFamily:"inherit"}}>
                                      {lang==="en"?"Cancel":"Annuler"}
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Edit form */}
                              {isEditOpen&&(
                                <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:6}}>
                                  <div style={{display:"flex",gap:6}}>
                                    <input value={ef.nom??nom}
                                      onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],editFields:{...ef,nom:e.target.value}}}))}
                                      placeholder={lang==="en"?"Name":"Nom"}
                                      style={{...inputSt,flex:2}}/>
                                    <input type="number" value={ef.prix_achat??item.prix_achat??item.buy??""}
                                      onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],editFields:{...ef,prix_achat:e.target.value}}}))}
                                      placeholder="Prix €"
                                      style={{...inputSt,flex:1}}/>
                                  </div>
                                  <div style={{display:"flex",gap:6}}>
                                    <input value={ef.marque??item.marque??item.brand??""}
                                      onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],editFields:{...ef,marque:e.target.value}}}))}
                                      placeholder={lang==="en"?"Brand":"Marque"}
                                      style={{...inputSt,flex:1}}/>
                                    <select value={ef.type??item.type??item.categorie??""}
                                      onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],editFields:{...ef,type:e.target.value}}}))}
                                      style={{...inputSt,flex:1}}>
                                      <option value="">{lang==="en"?"Category":"Catégorie"}</option>
                                      {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                                    </select>
                                  </div>
                                  <div style={{display:"flex",gap:6}}>
                                    <button onClick={async()=>{
                                      try{
                                        const fields={
                                          titre:ef.nom!=null?ef.nom:nom,
                                          prix_achat:parseFloat(ef.prix_achat)||item.prix_achat||0,
                                          marque:ef.marque!=null?ef.marque||null:item.marque||null,
                                          type:ef.type||item.type||null,
                                        };
                                        await actions.updateItem(item.id,fields);
                                        replaceResult(idx,{...result,data:{...data,items:data.items.map((it,j)=>j===i?{...it,...fields}:it)}});
                                        actions.fetchAll();
                                        setVaEdits(prev=>({...prev,[idx]:{editOpen:null,editFields:{}}}));
                                      }catch(e){setVaEdits(prev=>({...prev,[idx]:{...prev[idx],editError:e.message}}));}
                                    }} style={{flex:1,padding:"6px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                                      ✓ {lang==="en"?"Save":"Sauvegarder"}
                                    </button>
                                    <button onClick={()=>setVaEdits(prev=>({...prev,[idx]:{editOpen:null,editFields:{}}}))}
                                      style={{flex:1,padding:"6px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:7,fontSize:12,fontWeight:600,color:"#6B7280",cursor:"pointer",fontFamily:"inherit"}}>
                                      {lang==="en"?"Cancel":"Annuler"}
                                    </button>
                                  </div>
                                  {vaEdits[idx]?.editError&&<div style={{fontSize:11,color:"#E53E3E"}}>{vaEdits[idx].editError}</div>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              if(status==="success"&&intent==="analytics_query"){
                return(<div key={idx} style={{background:"#fff",borderRadius:12,padding:"16px",border:"1px solid rgba(0,0,0,0.08)",textAlign:"center"}}><div style={{fontSize:28,fontWeight:900,color:"#1D9E75",letterSpacing:"-0.03em"}}>{data.value}</div><div style={{fontSize:12,fontWeight:600,color:"#A3A9A6",marginTop:4}}>{data.label}</div>{data.periode&&data.periode!=="all"&&<div style={{fontSize:10,color:"#D1D5DB",marginTop:2}}>{data.periode}</div>}</div>);
              }

              if(status==="success"&&intent==="analytics_best"&&data?.byCategory){
                const entries=Object.entries(data.byCategory);
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>{lang==="en"?"Best by category":"Meilleur par catégorie"}</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      {entries.map(([cat,s],i)=>(
                        <div key={i} style={{background:"#F5F6F5",borderRadius:10,padding:"10px 12px"}}>
                          <div style={{fontSize:10,fontWeight:800,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>{cat}</div>
                          <div style={{fontSize:12,fontWeight:700,color:"#0D0D0D",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title||s.titre}</div>
                          <div style={{fontSize:13,fontWeight:800,color:"#1D9E75"}}>+{Math.round((s.margin??s.benefice??s.prix_vente-s.prix_achat)*100)/100}€</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              if(status==="success"&&intent==="analytics_best"){
                const top=data?.items||[];
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Top</div>
                    {top.map((s,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:i<top.length-1?"1px solid rgba(0,0,0,0.04)":"none"}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D"}}>{i+1}. {s.title||s.titre}</div>
                        <div style={{textAlign:"right"}}><div style={{fontSize:12,fontWeight:700,color:"#1D9E75"}}>{Math.round((s.margin||s.benefice||0)*100)/100}€</div><div style={{fontSize:10,color:"#A3A9A6"}}>{Math.round((s.marginPct||s.margin_pct||0)*10)/10}%</div></div>
                      </div>
                    ))}
                  </div>
                );
              }

              if(status==="success"&&intent==="analytics_dormant"){
                const dormant=data?.items||[];
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>{lang==="en"?"Dormant":"Dormants"} ({dormant.length})</div>
                    {dormant.slice(0,6).map((item,i)=>{
                      const d=Math.floor((Date.now()-new Date(item.date_achat||item.created_at||item.date))/86400000);
                      return(<div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:i<Math.min(dormant.length,6)-1?"1px solid rgba(0,0,0,0.04)":"none"}}><div style={{fontSize:13,fontWeight:700,color:"#0D0D0D"}}>{item.title||item.titre}</div><span style={{background:"#FFF4EE",color:"#F9A26C",border:"1px solid #FDDCB5",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0}}>{d}j</span></div>);
                    })}
                    {dormant.length>6&&<div style={{fontSize:11,color:"#A3A9A6",textAlign:"center",marginTop:4}}>+{dormant.length-6} {lang==="en"?"more":"autres"}</div>}
                  </div>
                );
              }

              if(status==="success"&&intent==="analytics_date"){
                const dateItems=data?.items||[];const summary=data?.summary||{};
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{display:"flex",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                      <div style={{fontSize:12,color:"#6B7280"}}><span style={{fontWeight:700,color:"#0D0D0D"}}>{summary.count||0}</span> {lang==="en"?"item(s)":"article(s)"}</div>
                      {summary.totalSpend>0&&<div style={{fontSize:12,color:"#6B7280"}}>{lang==="en"?"Spent":"Dépensé"}: <span style={{fontWeight:700,color:"#F9A26C"}}>{summary.totalSpend}€</span></div>}
                      {summary.totalRevenue>0&&<div style={{fontSize:12,color:"#6B7280"}}>{lang==="en"?"Revenue":"Revenu"}: <span style={{fontWeight:700,color:"#1D9E75"}}>{summary.totalRevenue}€</span></div>}
                    </div>
                    {dateItems.slice(0,5).map((item,i)=>(
                      <div key={i} style={{fontSize:13,fontWeight:600,color:"#0D0D0D",padding:"4px 0"}}>{item.title||item.titre} <span style={{fontSize:11,color:item._type==="sold"?"#1D9E75":"#F9A26C"}}>{item._type}</span></div>
                    ))}
                  </div>
                );
              }

              if(status==="pending_confirmation"&&intent==="inventory_sell"){
                const sellPv=vaEdits[idx]?.prix_vente??taskData?.prix_vente??null;
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D",marginBottom:12}}>
                      {lang==="en"
                        ?`Sell ${taskData?.nom||"item"}${taskData?.quantite_vendue>1?` ×${taskData.quantite_vendue}`:""} at ${sellPv||"?"}€?`
                        :`Vendre ${taskData?.nom||"l'article"}${taskData?.quantite_vendue>1?` ×${taskData.quantite_vendue}`:""} à ${sellPv||"?"}€ ?`}
                    </div>
                    {!taskData?.prix_vente&&(
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
                        <input type="number" value={vaEdits[idx]?.prix_vente??""}
                          onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],prix_vente:parseFloat(e.target.value)||0}}))}
                          placeholder={lang==="en"?"Sell price":"Prix vente"}
                          style={{flex:1,fontSize:13,fontWeight:700,border:"1px solid rgba(0,0,0,0.12)",borderRadius:8,padding:"8px 10px",fontFamily:"inherit",color:"#0D0D0D",background:"#fff"}}/>
                        <span style={{fontSize:13,color:"#6B7280",fontWeight:600,flexShrink:0}}>€</span>
                      </div>
                    )}
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>{
                        const q=(taskData?.nom||"").toLowerCase().trim();
                        const found=items.find(i=>{const t=(i.title||"").toLowerCase().trim();return q&&(t.includes(q)||q.includes(t));});
                        if(found){
                          actions.confirmSellDirect(found,sellPv,taskData?.frais||0,taskData?.quantite_vendue||1)
                            .then(()=>replaceResult(idx,{...result,status:"success",message:lang==="en"?"Sale registered":"Vente enregistrée"}))
                            .catch(e=>replaceResult(idx,{...result,status:"error",message:e.message}));
                        }else replaceResult(idx,{...result,status:"error",message:lang==="en"?"Item not found":"Article non trouvé"});
                      }} style={{flex:1,padding:"10px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        ✓ {lang==="en"?"Confirm":"Confirmer"}
                      </button>
                      <button onClick={()=>replaceResult(idx,{...result,status:"error",message:lang==="en"?"Cancelled":"Annulé"})} style={{padding:"10px 14px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:"#6B7280",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{lang==="en"?"Cancel":"Annuler"}</button>
                    </div>
                  </div>
                );
              }

              if(status==="pending_confirmation"&&intent==="inventory_delete"){
                return(
                  <div key={idx} style={{background:"#FFF5F5",borderRadius:12,padding:"14px",border:"1px solid #FCA5A5"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D",marginBottom:12}}>
                      {lang==="en"?`Delete ${taskData?.nom||"item"}?`:`Supprimer ${taskData?.nom||"l'article"} ?`}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>{
                        const q=(taskData?.nom||"").toLowerCase();
                        const found=items.find(i=>(i.title||"").toLowerCase().includes(q)&&q);
                        if(found){deleteItem(found.id);replaceResult(idx,{...result,status:"success",message:lang==="en"?"Deleted":"Supprimé"});}
                        else replaceResult(idx,{...result,status:"error",message:lang==="en"?"Item not found":"Article non trouvé"});
                      }} style={{flex:1,padding:"10px",background:"#E53E3E",color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        {lang==="en"?"Delete":"Supprimer"}
                      </button>
                      <button onClick={()=>replaceResult(idx,{...result,status:"error",message:lang==="en"?"Cancelled":"Annulé"})} style={{padding:"10px 14px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:"#6B7280",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{lang==="en"?"Cancel":"Annuler"}</button>
                    </div>
                  </div>
                );
              }

              if(status==="pending_confirmation"&&intent==="inventory_add"){
                const editNom=vaEdits[idx]?.nom??taskData?.nom??"";
                const editPrix=vaEdits[idx]?.prix??taskData?.prix_achat??"";
                return(
                  <div key={idx} style={{background:"#F0FDF4",borderRadius:12,padding:"14px",border:"1px solid #86EFAC"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#15803D",marginBottom:10}}>➕ {lang==="en"?"New item":"Nouvel article"}</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                      <input value={editNom}
                        onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],nom:e.target.value}}))}
                        placeholder={lang==="en"?"Name":"Nom"}
                        style={{fontSize:13,fontWeight:600,border:"1px solid rgba(0,0,0,0.12)",borderRadius:8,padding:"8px 10px",fontFamily:"inherit",color:"#0D0D0D",background:"#fff",width:"100%"}}/>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <input type="number" value={editPrix}
                          onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],prix:parseFloat(e.target.value)||0}}))}
                          placeholder={lang==="en"?"Buy price":"Prix achat"}
                          style={{flex:1,fontSize:13,fontWeight:700,border:"1px solid rgba(0,0,0,0.12)",borderRadius:8,padding:"8px 10px",fontFamily:"inherit",color:"#0D0D0D",background:"#fff"}}/>
                        <span style={{fontSize:13,color:"#6B7280",fontWeight:600,flexShrink:0}}>€</span>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={async()=>{
                        try{
                          await actions.addItem({...taskData,nom:editNom,prix_achat:editPrix||taskData?.prix_achat});
                          replaceResult(idx,{...result,status:"success",data:{nom:editNom,prix_achat:editPrix},message:lang==="en"?"Item added":"Article ajouté"});
                        }catch(e){replaceResult(idx,{...result,status:"error",message:e.message});}
                      }} style={{flex:1,padding:"10px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        ✓ {lang==="en"?"Confirm":"Confirmer"}
                      </button>
                      <button onClick={()=>replaceResult(idx,{...result,status:"error",message:lang==="en"?"Cancelled":"Annulé"})} style={{padding:"10px 14px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:"#6B7280",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{lang==="en"?"Cancel":"Annuler"}</button>
                    </div>
                  </div>
                );
              }

              if(status==="pending_confirmation"&&intent==="inventory_lot"){
                const lotItems=data?.items||[];
                return(
                  <div key={idx} style={{background:"#EFF6FF",borderRadius:12,padding:"14px",border:"1px solid #93C5FD"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#1D4ED8",marginBottom:10}}>🛍️ Lot — {data?.lotTotal}€</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                      {lotItems.map((item,i)=>{
                        const editNom=vaEdits[idx]?.[i]?.nom??item.nom;
                        const editPrix=vaEdits[idx]?.[i]?.prix??item.prix_estime_lot;
                        return(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
                            <input value={editNom}
                              onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],[i]:{...prev[idx]?.[i],nom:e.target.value}}}))}
                              style={{flex:1,fontSize:12,fontWeight:600,border:"1px solid rgba(0,0,0,0.12)",borderRadius:7,padding:"5px 8px",fontFamily:"inherit",color:"#0D0D0D",background:"#fff"}}/>
                            <input type="number" value={editPrix}
                              onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],[i]:{...prev[idx]?.[i],prix:parseFloat(e.target.value)||0}}}))}
                              style={{width:60,fontSize:12,fontWeight:700,border:"1px solid rgba(0,0,0,0.12)",borderRadius:7,padding:"5px 6px",fontFamily:"inherit",color:"#1D4ED8",background:"#fff",textAlign:"right"}}/>
                            <span style={{fontSize:12,color:"#1D4ED8",fontWeight:700,flexShrink:0}}>€</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={async()=>{
                        try{
                          const toAdd=lotItems.map((item,i)=>({
                            ...item,
                            nom:vaEdits[idx]?.[i]?.nom??item.nom,
                            prix_achat:vaEdits[idx]?.[i]?.prix??item.prix_estime_lot,
                          }));
                          for(const item of toAdd) await actions.addItem(item);
                          replaceResult(idx,{...result,status:"success",message:lang==="en"?`${toAdd.length} items added`:`${toAdd.length} articles ajoutés`});
                        }catch(e){replaceResult(idx,{...result,status:"error",message:e.message});}
                      }} style={{flex:1,padding:"10px",background:"#1D4ED8",color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        ✓ {lang==="en"?"Confirm add":"Confirmer ajout"}
                      </button>
                      <button onClick={()=>replaceResult(idx,{...result,status:"error",message:lang==="en"?"Cancelled":"Annulé"})} style={{padding:"10px 14px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:"#6B7280",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{lang==="en"?"Cancel":"Annuler"}</button>
                    </div>
                  </div>
                );
              }

              if(status==="pending_confirmation"&&intent==="inventory_update"){
                return(<div key={idx} style={{background:"#FFFBEB",borderRadius:12,padding:"14px",border:"1px solid #FDE68A"}}><div style={{fontSize:13,fontWeight:700,color:"#0D0D0D",marginBottom:4}}>{lang==="en"?"Update:":"Mise à jour :"} {taskData?.nom} · {taskData?.field} → {taskData?.value}</div><div style={{fontSize:11,color:"#A3A9A6"}}>{lang==="en"?"Manual update required":"Mise à jour manuelle requise"}</div></div>);
              }

              if(status==="success"&&intent==="deal_score"){
                const{score,label,profitNet,margePercent,pills,dataQuality}=data||{};
                const sc=score>=8?"#1D9E75":score>=6.5?"#4ECDC4":score>=5?"#F9A26C":"#E53E3E";
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"16px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                      <div style={{fontSize:36,fontWeight:900,color:sc,letterSpacing:"-0.04em",lineHeight:1}}>{score}</div>
                      <div>
                        <div style={{fontSize:13,fontWeight:800,color:sc}}>{label}</div>
                        <div style={{fontSize:11,color:"#A3A9A6"}}>{lang==="en"?"out of 10":"sur 10"}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:20,marginBottom:10}}>
                      <div>
                        <div style={{fontSize:20,fontWeight:900,color:profitNet>=0?"#1D9E75":"#E53E3E"}}>{profitNet>=0?"+":""}{profitNet}€</div>
                        <div style={{fontSize:10,color:"#A3A9A6",fontWeight:600}}>{lang==="en"?"Net profit":"Bénéfice net"}</div>
                      </div>
                      <div>
                        <div style={{fontSize:20,fontWeight:900,color:"#0D0D0D"}}>{margePercent}%</div>
                        <div style={{fontSize:10,color:"#A3A9A6",fontWeight:600}}>{lang==="en"?"Margin":"Marge"}</div>
                      </div>
                    </div>
                    {pills?.length>0&&(
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                        {pills.slice(0,2).map((p,i)=>(
                          <span key={i} style={{background:"#E8F5F0",color:"#0F6E56",border:"1px solid #9FE1CB",borderRadius:99,padding:"2px 10px",fontSize:10,fontWeight:700}}>{p}</span>
                        ))}
                      </div>
                    )}
                    {dataQuality==="low"&&(
                      <div style={{fontSize:10,color:"#A3A9A6",fontStyle:"italic"}}>{lang==="en"?"Based on limited data":"Basé sur peu de données"}</div>
                    )}
                  </div>
                );
              }

              if(status==="success"&&intent==="inventory_sell"){
                const pv=parseFloat(String(data?.prix_vente??taskData?.prix_vente??0).replace(",","."))||null;
                const qv=(data?.quantite_vendue||taskData?.quantite_vendue)>1?(data?.quantite_vendue||taskData?.quantite_vendue):null;
                const nom=data?.nom||taskData?.nom;
                return(
                  <div key={idx} style={{background:"#E8F5F0",borderRadius:12,padding:"12px 14px",border:"1px solid #9FE1CB",display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>✅</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#0F6E56"}}>{lang==="en"?"Sale registered":"Vente enregistrée"}{pv?` · ${pv}€`:""}{qv?` · ×${qv}`:""}</div>
                      {nom&&<div style={{fontSize:11,color:"#1D9E75",fontWeight:600,marginTop:2}}>{nom}</div>}
                    </div>
                  </div>
                );
              }

              if(status==="success"&&intent==="query_stats"&&(data?.metric==="best_sales"||data?.metric==="worst_sales")){
                const sItems=data?.items||[];
                const isWorst=data?.metric==="worst_sales";
                const lim=data?.limit??sItems.length;
                const title=isWorst
                  ?(lim===1?(lang==="en"?"Worst sale":"Pire vente"):(lang==="en"?`${lim} worst sales`:`${lim} pires ventes`))
                  :(lim===1?(lang==="en"?"Best sale":"Meilleure vente"):(lang==="en"?`Top ${lim} sales`:`Top ${lim} ventes`));
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>{isWorst?"📉":"🏆"} {title}</div>
                    {sItems.length===0
                      ?<div style={{fontSize:13,color:"#A3A9A6",fontStyle:"italic"}}>{lang==="en"?"No sales yet":"Aucune vente"}</div>
                      :sItems.map((s,i)=>{
                        const profit=Math.round((s._sortVal??s.margin??s.benefice??0)*100)/100;
                        return(
                          <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:i<sItems.length-1?"1px solid rgba(0,0,0,0.04)":"none"}}>
                            <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D"}}>{lim>1?`${i+1}. `:""}{s.title||s.titre||s.nom}</div>
                            <div style={{fontSize:12,fontWeight:700,color:profit>=0?"#1D9E75":"#E53E3E"}}>{profit>=0?"+":""}{profit}€</div>
                          </div>
                        );
                      })
                    }
                  </div>
                );
              }

              if(status==="success"&&intent==="query_stats"&&data?.metric==="stock_by_period"){
                const sbpItems=data?.items||[];
                const fmtDate=d=>d?new Date(d).toLocaleDateString(lang==="en"?"en-GB":"fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}):"";
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>📦 {lang==="en"?"In stock":"En stock"} ({data?.count??sbpItems.length})</div>
                    {sbpItems.length===0
                      ?<div style={{fontSize:13,color:"#A3A9A6",fontStyle:"italic"}}>{lang==="en"?"No items":"Aucun article"}</div>
                      :sbpItems.map((item,i)=>{
                        const days=item.date_ajout?Math.floor((Date.now()-new Date(item.date_ajout))/86400000):null;
                        return(
                          <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:i<sbpItems.length-1?"1px solid rgba(0,0,0,0.04)":"none"}}>
                            <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title||item.titre}</div>
                            <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                              <div style={{fontSize:12,fontWeight:700,color:"#F9A26C"}}>{item.buy||item.prix_achat}€</div>
                              {item.date_ajout&&<div style={{fontSize:10,color:"#A3A9A6"}}>{lang==="en"?"since ":"depuis le "}{fmtDate(item.date_ajout)}{days!==null?` (${days}${lang==="en"?"d":"j"})`:""}</div>}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              }

              if(status==="success"&&intent==="query_stats"&&(data?.metric==="profit_mois"||data?.metric==="marge_moyenne"||data?.metric==="stock_immobilise"||data?.metric==="stock_count")){
                const metricEmoji={profit_mois:"💰",marge_moyenne:"📊",stock_immobilise:"🔒",stock_count:"📦"};
                const metricTitle={
                  profit_mois:lang==="en"?`Profit – ${data?.monthName}`:`Bénéfice – ${data?.monthName}`,
                  marge_moyenne:lang==="en"?"Avg margin":"Marge moyenne",
                  stock_immobilise:lang==="en"?"Locked capital":"Stock immobilisé",
                  stock_count:lang==="en"?"Items in stock":"Articles en stock",
                };
                const isCurrency=data?.metric!=="marge_moyenne"&&data?.metric!=="stock_count";
                const suffix=isCurrency?"€":data?.metric==="stock_count"?"":"%";
                const val=data?.value??0;
                const valColor=data?.metric==="stock_immobilise"?"#F9A26C":val>=0?"#1D9E75":"#E53E3E";
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"16px",border:"1px solid rgba(0,0,0,0.08)",textAlign:"center"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",marginBottom:8}}>{metricEmoji[data?.metric]} {metricTitle[data?.metric]}</div>
                    <div style={{fontSize:28,fontWeight:900,color:valColor,letterSpacing:"-0.03em"}}>{isCurrency&&val>0?"+":""}{val}{suffix}</div>
                    {data?.metric==="stock_immobilise"&&<div style={{fontSize:11,color:"#A3A9A6",marginTop:4}}>{data?.count} {lang==="en"?"item(s) in stock":"article(s) en stock"}</div>}
                  </div>
                );
              }

              if(status==="success"){
                return(<div key={idx} style={{background:"#E8F5F0",borderRadius:12,padding:"12px 14px",border:"1px solid #9FE1CB"}}><div style={{fontSize:13,fontWeight:600,color:"#0F6E56"}}>✅ {message}</div></div>);
              }

              return null;
            })}
          </div>
        </div>
      )}
    </>
  );
}

export default function App({ loginOnly = false }){
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [authMode, setAuthMode] = useState(() => searchParams.get('mode') === 'signup' ? 'signup' : 'login');
  const [tab,setTab]=useState(()=>{const s=parseInt(localStorage.getItem('tab')||'0');return s===4?0:s;});
  const [items,setItems]=useState([]);
  const [sales,setSales]=useState([]);
  const [loading,setLoading]=useState(true);
  const [appLoading,setAppLoading]=useState(true);
  const [iTitle,setITitle]=useState("");
  const [iBuy,setIBuy]=useState("");
  const [iSell,setISell]=useState("");
  const [iMarque,setIMarque]=useState("");
  const [iType,setIType]=useState("");
  const [iDesc,setIDesc]=useState("");
  const [iPurchaseCosts,setIPurchaseCosts]=useState("");
  const [iSellingFees,setISellingFees]=useState(()=>localStorage.getItem('savedFees')||"");
  const [iRememberSellingFees,setIRememberSellingFees]=useState(()=>!!localStorage.getItem('savedFees'));
  const [iAlreadySold,setIAlreadySold]=useState(false);
  const [iQuantite,setIQuantite]=useState(1);
  const [iSaved,setISaved]=useState(false);
  const [filterMarque,setFilterMarque]=useState("Toutes");
  const [filterMarqueSold,setFilterMarqueSold]=useState("Toutes");
  const [filterType,setFilterType]=useState("Tous");
  const [soldShowAll,setSoldShowAll]=useState(false);
  const [showAllStock,setShowAllStock]=useState(false);
  const [showAllSales,setShowAllSales]=useState(false);
  const [search,setSearch]=useState("");
  const [searchHistory,setSearchHistory]=useState("");
  const [toast,setToast]=useState({visible:false,message:""});
  const [cTitle,setCTitle]=useState("");
  const [cBuy,setCBuy]=useState("");
  const [cSell,setCSell]=useState("");
  const [cShip,setCShip]=useState("");
  const [cSaved,setCSaved]=useState(false);
  const [user,setUser]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const emailRef=useRef(null);
  const passwordRef=useRef(null);
  const [isSigningIn,setIsSigningIn]=useState(false);
  const [loginError,setLoginError]=useState("");
  const [resetStep,setResetStep]=useState(0);
  const [forgotMode,setForgotMode]=useState(false);
  const [forgotMsg,setForgotMsg]=useState("");
  const [isPremium,setIsPremium]=useState(false);
  const [iapProduct,setIapProduct]=useState(null);
  const [iapLoading,setIapLoading]=useState(false);
  const [lang,setLang]=useState(()=>{
    const saved=localStorage.getItem('fs_lang');
    if(saved) return saved;
    const bl=(navigator.language||navigator.userLanguage||'fr').toLowerCase().split('-')[0];
    return bl==='fr'?'fr':'en';
  });
  const [firstItemAdded,setFirstItemAdded]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [selectedRange,setSelectedRange]=useState('6M');
  const [cancelStep,setCancelStep]=useState(0);
  const [cancelLoading,setCancelLoading]=useState(false);
  const [cancelMsg,setCancelMsg]=useState("");
  const [cancelAtPeriodEnd,setCancelAtPeriodEnd]=useState(false);
  const [cancelPeriodEnd,setCancelPeriodEnd]=useState(null);
  const [deleteStep,setDeleteStep]=useState(0);
  const [deleteLoading,setDeleteLoading]=useState(false);
  const [importModal,setImportModal]=useState(null); // {rows, mapping, preview}
  const [importLoading,setImportLoading]=useState(false);
  const [importMsg,setImportMsg]=useState("");
  const importRef=useRef(null);
  const titleInputRef=useRef(null);
  const listRef=useRef(null);
  const scrollRef=useRef(null);
  const [editItem,setEditItem]=useState(null);
  const [sellModal,setSellModal]=useState(null); // {item,sellPrice:'',sellingFees:'',rememberFees:false}
  const [dealScore,setDealScore]=useState(null);
  const [dealAnalysis,setDealAnalysis]=useState(null);
  const [dealAnalysisLoading,setDealAnalysisLoading]=useState(false);
  const dealAnalysisTimer=useRef(null);
  const [isRecording,setIsRecording]=useState(false);
  const [voiceText,setVoiceText]=useState("");
  const [voiceLoading,setVoiceLoading]=useState(false);
  const [voiceStep,setVoiceStep]=useState("");
  const [voiceParsed,setVoiceParsed]=useState(null);
  const [voiceError,setVoiceError]=useState(null);
  const [showManualForm,setShowManualForm]=useState(false);
  const mediaRecorderRef=useRef(null);
  const audioChunksRef=useRef([]);
  const [manualMode,setManualMode]=useState("single");
  const [lotManualTotal,setLotManualTotal]=useState("");
  const [lotManualItems,setLotManualItems]=useState([{nom:""},{nom:""}]);
  const [lotDistributed,setLotDistributed]=useState(null);
  const [lotDistributing,setLotDistributing]=useState(false);
  const [vaStep,setVaStep]=useState("");
  const [vaResults,setVaResults]=useState([]);
  const [vaError,setVaError]=useState(null);

  const {t,tpl}=useTranslation(lang);
  const formatCurrency = (amount) => lang === 'en' ? '$' + (amount * EUR_TO_USD).toFixed(2) : (Math.round(amount*100)/100).toFixed(2).replace(".",",") + ' €';
  // eslint-disable-next-line no-shadow
  const fmt = formatCurrency;
  useEffect(()=>{localStorage.setItem('fs_lang',lang);},[lang]);
  useEffect(()=>{if(!localStorage.getItem('fs_lang'))localStorage.setItem('fs_lang',lang);},[]);
  async function triggerCheckout(){
    console.log('[checkout] start — email:', user?.email);
    try{
      const url_called=`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`;
      console.log('[checkout] calling:', url_called);
      const{data:{session}}=await supabase.auth.getSession();
      const token=session?.access_token;
      console.log('[checkout] token:', token?'present':'MISSING');
      const res=await fetch(url_called,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({email:user.email})});
      console.log('[checkout] response status:', res.status);
      const body=await res.json();
      console.log('[checkout] response body:', body);
      const{url,error}=body;
      if(error)throw new Error(error);
      track('begin_checkout', { currency: 'EUR', value: 4.99 });
      console.log('[checkout] redirecting to:', url);
      window.location.href=url;
    }catch(e){
      console.error('[checkout] error:', e);
      alert("Erreur : "+e.message);
    }
  }

  async function handleIAPPurchase(){
    setIapLoading(true);
    try{
      const hasPremium=await purchasePremium();
      if(hasPremium){
        await supabase.from('profiles').update({is_premium:true}).eq('id',user.id);
        setIsPremium(true);
        setToast({visible:true,message:lang==='fr'?'✅ Premium activé !':'✅ Premium activated!'});
        setTimeout(()=>setToast({visible:false,message:''}),3000);
      }
    }catch(e){console.error('[IAP] purchase failed:',e);}
    finally{setIapLoading(false);}
  }

  async function handleIAPRestore(){
    setIapLoading(true);
    try{
      const hasPremium=await restorePurchases('button');
      if(hasPremium){
        await supabase.from('profiles').update({is_premium:true}).eq('id',user.id);
        setIsPremium(true);
        setToast({visible:true,message:lang==='fr'?'✅ Achat restauré !':'✅ Purchase restored!'});
        setTimeout(()=>setToast({visible:false,message:''}),3000);
      }
    }catch(e){console.error('[IAP] restore failed:',e);}
    finally{setIapLoading(false);}
  }

  async function fetchAll(uid){
    setLoading(true);
    const [v,i,p]=await Promise.all([
      supabase.from('ventes').select('*').eq('user_id',uid).order('created_at',{ascending:false}),
      supabase.from('inventaire').select('*').eq('user_id',uid).order('created_at',{ascending:false}),
      supabase.from('profiles').select('is_premium,subscription_cancel_at_period_end,subscription_period_end').eq('id',uid).single(),
    ]);
    if(!v.error) setSales((v.data||[]).map(mapSale));
    if(!i.error) setItems((i.data||[]).map(mapItem));
    let premiumValue=p.data?.is_premium===true;
    console.log('[fetchAll] is_premium from Supabase:', p.data?.is_premium, '→ resolved:', premiumValue, p.error?'ERROR:'+p.error.message:'');
    if(!p.error){
      setIsPremium(premiumValue);
      setCancelAtPeriodEnd(p.data?.subscription_cancel_at_period_end===true);
      setCancelPeriodEnd(p.data?.subscription_period_end||null);
    }
    setLoading(false);
    setAppLoading(false);
  }

  useEffect(()=>{
    let mounted=true;
    supabase.auth.getSession().then(({data:{session}})=>{
      const u=session?.user??null;
      if(u){ setUser(u); fetchAll(u.id); setAuthLoading(false); }
      else setLoading(false);
    });
    if(isNative){
      initIAP().then(product=>{ if(mounted) setIapProduct(product); });
    }
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      const u=session?.user??null;
      setUser(u);
      if(event==='INITIAL_SESSION') setAuthLoading(false);
      if(u){
        if(event==='SIGNED_IN'){ setIsSigningIn(false); setTab(0); localStorage.setItem('tab','0'); }
        fetchAll(u.id);
      }else{setSales([]);setItems([]);setLoading(false);setAppLoading(false);}
    });
    return()=>{ mounted=false; subscription.unsubscribe(); };
  },[]);


  const buy=parseFloat(cBuy)||0;
  const sell=parseFloat(cSell)||0;
  const ship=parseFloat(cShip)||0;
  const margin=sell-buy-ship;
  const marginPct=sell>0?(margin/sell)*100:0;
  const isValid=sell>0&&buy>=0;
  const mc=margin<0?C.red:C.green;

  const calcWasComplete = useRef(false);
  useEffect(()=>{
    const complete = Boolean(cBuy && cSell && cShip);
    if(complete && !calcWasComplete.current){
      track('use_calculator', { has_result: true, is_positive: margin > 0 });
    }
    calcWasComplete.current = complete;
  },[cBuy, cSell, cShip, margin]);

  useEffect(()=>{
    const prixAchat=parseFloat(cBuy)||0;
    const prixVente=parseFloat(cSell)||0;
    const frais=parseFloat(cShip)||0;
    if(prixAchat>0&&prixVente>0){
      const historique=sales.map(s=>({
        prix_achat:s.buy,
        prix_vente:s.sell,
        frais:(s.sellingFees||0)+(s.purchaseCosts||0),
        date_vente:s.date,
      }));
      const scoreResult=calculateDealScore({prixAchat,prixVente,frais,lang,historique});
      setDealScore(scoreResult);
      setDealAnalysisLoading(true);
      clearTimeout(dealAnalysisTimer.current);
      dealAnalysisTimer.current=setTimeout(async()=>{
        const analysis=await generateDealAnalysis(scoreResult,lang);
        setDealAnalysis(analysis);
        setDealAnalysisLoading(false);
      },1500);
    }else{
      setDealScore(null);
      setDealAnalysis(null);
      clearTimeout(dealAnalysisTimer.current);
      setDealAnalysisLoading(false);
    }
  },[cBuy,cSell,cShip,lang,sales]);

  const now=new Date();

  // KPI mois courant — indépendant du filtre
  const currentMonthSales=sales.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===now.getMonth()&&sd.getFullYear()===now.getFullYear();});
  const tm={profit:currentMonthSales.reduce((a,s)=>a+s.margin,0),count:currentMonthSales.length};

  // Filtre par période pour les graphiques
  function filterSalesByRange(salesArr,range){
    const cutoffs={'7j':7,'1M':30,'6M':180,'1A':365};
    if(range==='YTD') return salesArr.filter(s=>new Date(s.date)>=new Date(now.getFullYear(),0,1));
    const ms=cutoffs[range]||180;
    const cutoff=new Date(now.getTime()-ms*86400000);
    return salesArr.filter(s=>new Date(s.date)>=cutoff);
  }

  function buildChartData(salesArr,range){
    const byMonth=(n)=>Array.from({length:n},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-(n-1)+i,1);
      const m=d.getMonth();const y=d.getFullYear();
      const ms=salesArr.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===m&&sd.getFullYear()===y;});
      const MONTHS=lang==='en'?MONTHS_EN:MONTHS_FR;
      return{name:MONTHS[m],profit:ms.reduce((a,s)=>a+s.margin,0),"Marge %":ms.length?ms.reduce((a,s)=>a+s.marginPct,0)/ms.length:0};
    });
    if(range==='7j'){
      return Array.from({length:7},(_,i)=>{
        const d=new Date(now);d.setDate(d.getDate()-6+i);
        const ds=salesArr.filter(s=>{const sd=new Date(s.date);return sd.toDateString()===d.toDateString();});
        return{name:`${d.getDate()}/${d.getMonth()+1}`,profit:ds.reduce((a,s)=>a+s.margin,0),"Marge %":ds.length?ds.reduce((a,s)=>a+s.marginPct,0)/ds.length:0};
      });
    }
    if(range==='1M'){
      return Array.from({length:4},(_,i)=>{
        const end=new Date(now);end.setDate(end.getDate()-i*7);
        const start=new Date(end);start.setDate(start.getDate()-6);
        const ds=salesArr.filter(s=>{const sd=new Date(s.date);return sd>=start&&sd<=end;});
        return{name:`S${4-i}`,profit:ds.reduce((a,s)=>a+s.margin,0),"Marge %":ds.length?ds.reduce((a,s)=>a+s.marginPct,0)/ds.length:0};
      }).reverse();
    }
    if(range==='1A') return byMonth(12);
    if(range==='YTD') return byMonth(now.getMonth()+1);
    return byMonth(6); // 6M default
  }

  const mData=buildChartData(sales,selectedRange);
  const hasData=sales.length>0;

  const _f={family:"'Nunito', -apple-system, sans-serif",size:11};
  const _tip={backgroundColor:'#ffffff',titleColor:'#A3A9A6',borderColor:'rgba(0,0,0,0.08)',borderWidth:1,padding:12,cornerRadius:10,displayColors:false,titleFont:{..._f,size:11,weight:'700'},bodyFont:{..._f,size:14,weight:'800'}};
  const _scales=(unit)=>({
    x:{grid:{display:false},border:{display:false},ticks:{color:'#A3A9A6',font:_f}},
    y:{grid:{color:'#E5E7EB',drawTicks:false},border:{display:false},ticks:{color:'#A3A9A6',font:_f,padding:8,callback:unit==='€'&&lang==='en'?v=>'$'+(v*EUR_TO_USD).toFixed(0):v=>v+unit}},
  });
  const barChartData={
    labels:mData.map(d=>d.name),
    datasets:[{
      data:mData.map(d=>d.profit),
      backgroundColor:'#1D9E75',
      hoverBackgroundColor:'#0F6E56',
      borderRadius:8,
      borderSkipped:false,
    }],
  };
  const lineChartData={
    labels:mData.map(d=>d.name),
    datasets:[{
      data:mData.map(d=>d['Marge %']),
      borderColor:'#F9A26C',
      backgroundColor:'rgba(249,162,108,0.10)',
      borderWidth:3,
      tension:0.4,
      pointBackgroundColor:'#F9A26C',
      pointBorderColor:'#ffffff',
      pointBorderWidth:2,
      pointRadius:4,
      pointHoverRadius:6,
      fill:true,
    }],
  };
  const barOpts={
    responsive:true,maintainAspectRatio:false,
    animation:{duration:700,easing:'easeOutQuart'},
    plugins:{legend:{display:false},tooltip:{..._tip,bodyColor:'#1D9E75',callbacks:{title:([i])=>i.label,label:ctx=>fmt(ctx.raw||0)}}},
    scales:_scales('€'),
  };
  const lineOpts={
    responsive:true,maintainAspectRatio:false,
    animation:{duration:700,easing:'easeOutQuart'},
    plugins:{legend:{display:false},tooltip:{..._tip,bodyColor:'#F9A26C',callbacks:{title:([i])=>i.label,label:ctx=>`${(ctx.raw||0).toFixed(1)} %`}}},
    scales:_scales('%'),
  };
  const salesForKpis=filterSalesByRange(sales,selectedRange);
  const totalM=salesForKpis.reduce((a,s)=>a+s.margin,0);
  const totalR=salesForKpis.reduce((a,s)=>a+s.sell,0);
  const avgM=totalR>0?(totalM/totalR)*100:0;
  const stock=items.filter(i=>i.statut==="stock");
  const sold=items.filter(i=>i.statut==="vendu");
  function searchMatch(item,query){
    if(!query.trim())return true;
    const q=query.toLowerCase().trim();
    return item.title?.toLowerCase().includes(q)||item.marque?.toLowerCase().includes(q)||item.description?.toLowerCase().includes(q)||item.type?.toLowerCase().includes(q);
  }
  const stockFiltre=stock
    .filter(i=>filterType==="Tous"||i.type===filterType)
    .filter(i=>filterMarque==="Toutes"||(i.marque?.toLowerCase()===filterMarque.toLowerCase()))
    .filter(i=>searchMatch(i,search));
  const soldFiltre=sold
    .filter(i=>filterType==="Tous"||i.type===filterType)
    .filter(i=>filterMarqueSold==="Toutes"||(i.marque?.toLowerCase()===filterMarqueSold.toLowerCase()))
    .filter(i=>searchMatch(i,search));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{if(filterMarque!=="Toutes"&&!stock.some(i=>i.marque===filterMarque))setFilterMarque("Toutes");},[stock,filterMarque]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{if(filterMarqueSold!=="Toutes"&&!sold.some(i=>i.marque===filterMarqueSold))setFilterMarqueSold("Toutes");},[sold,filterMarqueSold]);
  useEffect(()=>{setSoldShowAll(false);},[filterMarqueSold]);
  useEffect(()=>{setShowAllStock(false);},[filterMarque]);
  useEffect(()=>{setSoldShowAll(false);setShowAllStock(false);},[search]);
  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=0;},[tab]);
  useEffect(()=>{setSoldShowAll(false);setShowAllStock(false);setFilterMarque("Toutes");setFilterMarqueSold("Toutes");},[filterType]);
  const soldVisible=soldShowAll?soldFiltre:soldFiltre.slice(0,10);
  const stockVisible=showAllStock?stockFiltre:stockFiltre.slice(0,10);
  const groupedSales=groupSales(sales);
  const visibleSales=(showAllSales?groupedSales:groupedSales.slice(0,10)).filter(s=>searchMatch(s,searchHistory));
  const invested=items.reduce((a,i)=>a+i.buy*(i.quantite||1),0);
  const stockVal=stock.reduce((a,i)=>a+i.buy*(i.quantite||1),0);
  const recovered=sales.reduce((a,s)=>a+s.sell,0);

  function resetVoiceFlow(){
    setVoiceText("");setVoiceLoading(false);setVoiceStep("");
    setVoiceParsed(null);setVoiceError(null);setIsRecording(false);
  }

  async function callVoiceParse(text){
    setVoiceStep("parsing");setVoiceLoading(true);
    try{
      const res=await fetch("https://tojihnuawsoohlolangc.supabase.co/functions/v1/voice-parse",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({text,lang}),
      });
      if(!res.ok)throw new Error("Parse failed");
      const result=await res.json();
      if(result.error)throw new Error(result.error);
      setVoiceParsed(result);setVoiceStep("done");
    }catch(e){
      setVoiceError(e.message||"Erreur analyse");setVoiceStep("error");
    }
    setVoiceLoading(false);
  }

  async function handleVoiceToggle(){
    if(isRecording){mediaRecorderRef.current?.stop();setIsRecording(false);return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mimeType=MediaRecorder.isTypeSupported("audio/webm")?"audio/webm":"audio/mp4";
      const recorder=new MediaRecorder(stream,{mimeType});
      audioChunksRef.current=[];
      recorder.ondataavailable=e=>{if(e.data.size>0)audioChunksRef.current.push(e.data);};
      recorder.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());
        const blob=new Blob(audioChunksRef.current,{type:mimeType});
        setVoiceStep("transcribing");setVoiceLoading(true);
        try{
          const fd=new FormData();
          fd.append("audio",blob,"audio."+mimeType.split("/")[1]);
          fd.append("lang",lang);
          const res=await fetch("https://tojihnuawsoohlolangc.supabase.co/functions/v1/voice-transcribe",{method:"POST",body:fd});
          if(!res.ok)throw new Error("Transcription failed");
          const{text,error:err}=await res.json();
          if(err)throw new Error(err);
          setVoiceText(text);
          await callVoiceParse(text);
        }catch(e){
          setVoiceError(e.message||"Erreur transcription");setVoiceStep("error");setVoiceLoading(false);
        }
      };
      mediaRecorderRef.current=recorder;
      recorder.start();
      setIsRecording(true);setVoiceStep("recording");
    }catch(e){
      setVoiceError(e.message||"Micro non disponible");setVoiceStep("error");
    }
  }

  async function addItemsFromVoice(){
    if(!voiceParsed?.items?.length)return;
    let idBase=Date.now();
    for(const item of voiceParsed.items){
      const qty=Math.max(1,item.quantite||1);
      const fraisG=parseFloat(item.frais_global)||0;
      const fraisU=fraisG>0?fraisG/qty:(parseFloat(item.frais_unitaire)||0);
      const b=voiceParsed.isLot?(parseFloat(item.prix_estime_lot)||0)/qty+fraisU:(parseFloat(item.prix_achat)||0);
      const pc=0;
      const s=voiceParsed.isLot?0:(parseFloat(item.prix_vente)||0);
      const sf=0;
      const hasS=s>0;
      const cogs=b+pc;
      const mg=hasS?s-cogs-sf:0;
      const mgp=hasS?(mg/s)*100:0;
      const marqueNorm=normalizeMarque(item.marque);
      const _td1=detectType(item.nom||"",marqueNorm);const typeAuto=_td1==='Luxe'?'Luxe':(item.categorie||_td1);
      if(!isPremium&&items.length>=20)continue;
      const row={id:idBase++,user_id:user.id,titre:item.nom||"Article",prix_achat:b,prix_vente:hasS?s:null,margin:hasS?mg:null,margin_pct:hasS?mgp:null,statut:hasS?"vendu":"stock",date:item.date?new Date(item.date).toISOString():new Date().toISOString(),marque:marqueNorm,description:null,type:typeAuto,purchase_costs:pc,selling_fees:hasS?sf:0,quantite:qty};
      const{data,error}=await supabase.from('inventaire').insert([row]).select().single();
      if(!error){
        setItems(prev=>[mapItem(data),...prev]);
        if(hasS){
          const srow={id:idBase++,user_id:user.id,titre:item.nom||"Article",prix_achat:b,prix_vente:s,benefice:mg,date:item.date||new Date().toISOString().split('T')[0]};
          const{data:sd}=await supabase.from('ventes').insert([srow]).select().single();
          if(sd)setSales(prev=>[mapSale(sd),...prev]);
        }
      }
    }
    const n=voiceParsed.items.length;
    setToast({visible:true,message:lang==='fr'?`✅ ${n} article${n>1?"s":""} ajouté${n>1?"s":""} !`:`✅ ${n} item${n>1?"s":""} added!`});
    setTimeout(()=>setToast({visible:false,message:""}),3000);
    resetVoiceFlow();
  }

  async function handleLotDistribute(){
    if(!lotManualTotal||lotManualItems.some(i=>!i.nom.trim()))return;
    setLotDistributing(true);
    try{
      const res=await fetch("https://tojihnuawsoohlolangc.supabase.co/functions/v1/lot-distribute",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({lotTotal:parseFloat(lotManualTotal),items:lotManualItems.filter(i=>i.nom.trim()),lang}),
      });
      if(!res.ok)throw new Error("Distribution failed");
      const result=await res.json();
      if(result.error)throw new Error(result.error);
      setLotDistributed(result);
    }catch(e){
      setToast({visible:true,message:"❌ "+(e.message||"Erreur répartition")});
      setTimeout(()=>setToast({visible:false,message:""}),3000);
    }
    setLotDistributing(false);
  }

  async function addLotToInventory(){
    if(!lotDistributed?.items?.length)return;
    let idBase=Date.now();
    for(const item of lotDistributed.items){
      if(!isPremium&&items.length>=20)break;
      const b=parseFloat(item.prix_estime_lot)||0;
      const marqueNorm=normalizeMarque(item.marque);
      const _td2=detectType(item.nom||"",marqueNorm);const typeAuto=_td2==='Luxe'?'Luxe':(item.categorie||_td2);
      const row={id:idBase++,user_id:user.id,titre:item.nom||"Article",prix_achat:b,prix_vente:null,margin:null,margin_pct:null,statut:"stock",date:new Date().toISOString(),marque:marqueNorm,description:null,type:typeAuto,purchase_costs:0,selling_fees:0,quantite:1};
      const{data,error}=await supabase.from('inventaire').insert([row]).select().single();
      if(!error)setItems(prev=>[mapItem(data),...prev]);
    }
    const n=lotDistributed.items.length;
    setToast({visible:true,message:lang==='fr'?`✅ ${n} article${n>1?"s":""} ajouté${n>1?"s":""} !`:`✅ ${n} item${n>1?"s":""} added!`});
    setTimeout(()=>setToast({visible:false,message:""}),3000);
    setLotDistributed(null);setLotManualItems([{nom:""},{nom:""}]);setLotManualTotal("");setManualMode("single");
  }

  async function addItem(){
    if(!iTitle||!iBuy)return;
    if(!isPremium&&items.length>=20){alert(lang==='en'?"⚠️ Free plan limit reached (20 items max).\nUpgrade to add unlimited items.":"⚠️ Limite du plan gratuit atteinte (20 articles max).\nPasse au plan supérieur pour ajouter des articles illimités.");return;}
    const b=parseFloat(iBuy)||0;const pc=parseFloat(iPurchaseCosts)||0;const s=iAlreadySold?(parseFloat(iSell)||0):0;const sf=iAlreadySold?(parseFloat(iSellingFees)||0):0;const hasS=iAlreadySold&&s>0;
    const cogs=b+pc;const mg=hasS?s-cogs-sf:0;const mgp=hasS?(mg/s)*100:0;
    const marqueNormalized=normalizeMarque(iMarque);
    const typeAuto=iType||detectType(iTitle,marqueNormalized);
    const row={id:Date.now(),user_id:user.id,titre:iTitle,prix_achat:b,prix_vente:hasS?s:null,margin:hasS?mg:null,margin_pct:hasS?mgp:null,statut:hasS?"vendu":"stock",date:new Date().toISOString(),marque:marqueNormalized,description:iDesc||null,type:typeAuto,purchase_costs:pc,selling_fees:hasS?sf:0,quantite:iQuantite||1};
    const{data,error}=await supabase.from('inventaire').insert([row]).select().single();
    if(!error){
      track('add_item', { purchase_price: b, has_sell_price: hasS });
      setItems(prev=>[mapItem(data),...prev]);
      if(hasS){
        const srow={id:Date.now()+1,user_id:user.id,titre:iTitle,prix_achat:b,prix_vente:s,benefice:mg,date:new Date().toISOString().split('T')[0]};
        const{data:sd}=await supabase.from('ventes').insert([srow]).select().single();
        if(sd) setSales(prev=>[mapSale(sd),...prev]);
      }
    }
    if(items.length===0) setFirstItemAdded(true);
    setISaved(true);setTimeout(()=>setISaved(false),1600);
    setToast({visible:true,message:hasS?`${t('articleAjoute')} · +${fmt(mg)} ${t('dansTonSuivi')}`:`${t('articleAjoute')} · ${lang==='fr'?'Investi':'Invested'} ${fmt(cogs)}`});
    setTimeout(()=>setToast({visible:false,message:""}),3000);
    if(hasS&&iRememberSellingFees) localStorage.setItem('savedFees',String(sf));
    setITitle("");setIBuy("");setIPurchaseCosts("");setISell("");if(!iRememberSellingFees)setISellingFees("");setIAlreadySold(false);setIMarque("");setIType("");setIDesc("");setIQuantite(1);
    setTimeout(()=>{if(listRef.current)listRef.current.scrollIntoView({behavior:"smooth"});},300);
  }

  function markSold(item){
    const saved=localStorage.getItem('savedFees')||'';
    setSellModal({item,sellPrice:'',sellingFees:saved,rememberFees:!!saved,sellQty:1,prixMode:'total',feesMode:'total'});
  }

  async function confirmSell(){
    if(!sellModal)return;
    const sv=parseFloat(sellModal.sellPrice)||0;
    if(!sv||sv<=0)return;
    const sf=parseFloat(sellModal.sellingFees)||0;
    if(sellModal.rememberFees)localStorage.setItem('savedFees',String(sf));
    const{item}=sellModal;
    const qTotal=item.quantite||1;
    const qVendue=Math.max(1,Math.min(parseInt(sellModal.sellQty)||1,qTotal));
    // Compute per-unit values based on selected price/fees mode
    const svUnit=sellModal.prixMode==="unit"||qVendue<=1?sv:sv/qVendue;
    const sfUnit=sellModal.feesMode==="unit"||qVendue<=1?sf:sf/qVendue;
    const cogsUnit=item.buy+(item.purchaseCosts||0);
    const mgUnit=svUnit-cogsUnit-sfUnit;
    const mgpUnit=svUnit>0?(mgUnit/svUnit)*100:0;
    const remaining=qTotal-qVendue;
    if(remaining>0){
      // Partial sell: decrement quantity only — prix_achat is never touched
      await supabase.from('inventaire').update({quantite:remaining}).eq('id',item.id);
      setItems(prev=>prev.map(i=>i.id===item.id?{...i,quantite:remaining}:i));
    }else{
      await supabase.from('inventaire').update({prix_vente:svUnit,margin:mgUnit,margin_pct:mgpUnit,statut:"vendu",selling_fees:sfUnit}).eq('id',item.id);
      setItems(prev=>prev.map(i=>i.id===item.id?{...i,sell:svUnit,margin:mgUnit,marginPct:mgpUnit,statut:"vendu"}:i));
    }
    for(let q=0;q<qVendue;q++){
      const srow={user_id:user.id,titre:item.title,prix_achat:item.buy,prix_vente:svUnit,benefice:mgUnit,marque:item.marque||null,type:item.type||null,date:new Date().toISOString().split('T')[0]};
      const{data:sd}=await supabase.from('ventes').insert([srow]).select().single();
      if(sd){
        if(q===0)track('mark_sold',{profit:mgUnit*qVendue,margin_pct:Math.round(mgpUnit*10)/10});
        setSales(prev=>[mapSale(sd),...prev]);
      }
    }
    setSellModal(null);
    await fetchAll(user.id);
  }

  async function delItem(id){
    await supabase.from('inventaire').delete().eq('id',id);
    setItems(prev=>prev.filter(i=>i.id!==id));
  }

  async function addSale(){
    if(!isValid)return;
    const saleDate=new Date();
    const row={id:Date.now(),user_id:user.id,titre:cTitle||"Article",prix_achat:buy,prix_vente:sell,benefice:margin,date:saleDate.toISOString().split('T')[0]};
    const{data,error}=await supabase.from('ventes').insert([row]).select().single();
    if(!error) setSales(prev=>[mapSale(data),...prev]);
    else console.error('[Supabase] Erreur insert:',error.message);
    setCSaved(true);setTimeout(()=>setCSaved(false),1600);
    setCTitle("");setCBuy("");setCSell("");setCShip("");
  }

  async function delSale(id){
    await supabase.from('ventes').delete().eq('id',id);
    setSales(prev=>prev.filter(s=>s.id!==id));
  }

  async function handleReset(){
    if(resetStep===0){setResetStep(1);return;}
    if(resetStep===1){
      await Promise.all([
        supabase.from('ventes').delete().eq('user_id',user.id),
        supabase.from('inventaire').delete().eq('user_id',user.id),
      ]);
      setSales([]);setItems([]);setResetStep(0);
    }
  }

  async function handleEditSave(){
    if(!editItem) return;
    const b=parseFloat(editItem.buy)||0;
    const s=parseFloat(editItem.sell)||0;
    const f=parseFloat(editItem.frais)||0;
    const hasS=s>0;
    const mg=hasS?s-b-f:null;
    const mgp=hasS?(mg/s)*100:null;
    const typeAuto=editItem.type||detectType(editItem.title,editItem.marque);
    const{error}=await supabase.from('inventaire').update({
      titre:editItem.title,
      marque:editItem.marque?.trim()?editItem.marque.trim().charAt(0).toUpperCase()+editItem.marque.trim().slice(1).toLowerCase():null,
      type:typeAuto,
      prix_achat:b,
      prix_vente:hasS?s:null,
      margin:mg,
      margin_pct:mgp,
      description:editItem.description||null,
    }).eq('id',editItem.id);
    if(!error){
      setItems(prev=>prev.map(i=>i.id===editItem.id?{...i,title:editItem.title,marque:editItem.marque,type:typeAuto,buy:b,sell:s,margin:mg,marginPct:mgp,description:editItem.description}:i));
      setEditItem(null);
      setToast({visible:true,message:lang==='fr'?'✓ Article modifié':'✓ Item updated'});
      setTimeout(()=>setToast({visible:false,message:''}),3000);
    }
  }

  async function handleCancelSubscription(){
    setCancelLoading(true);
    try{
      const{data:{session}}=await supabase.auth.getSession();
      const res=await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-subscription`,
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "Authorization":`Bearer ${session?.access_token}`,
            "apikey":import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      );
      const json=await res.json();
      if(json.error) throw new Error(json.error);
      // is_premium reste true jusqu'à la fin de la période — le webhook customer.subscription.deleted le passera à false
      const msg=json.period_end
        ? (lang==='fr'
            ? `Abonnement annulé. Tu gardes l'accès premium jusqu'au ${json.period_end}.`
            : `Subscription cancelled. You keep premium access until ${json.period_end}.`)
        : (lang==='fr'
            ? "Abonnement annulé. Tu gardes l'accès premium jusqu'à la fin de la période."
            : "Subscription cancelled. You keep premium access until the end of the period.");
      setCancelMsg(msg);
      setCancelAtPeriodEnd(true);
      setCancelPeriodEnd(json.period_end||null);
      setCancelStep(0);
    }catch(e){
      setCancelMsg("Erreur : "+e.message);
    }finally{
      setCancelLoading(false);
    }
  }

  // ── Détection automatique des colonnes (v2) ─────────────────────────────
  // ── ÉTAPE 2 : Détection des colonnes ────────────────────────────────────
  function detectColumns(headers, rows){
    const TITRE_RE=/nom|titre|article|produit|désign|libell[eé]|description|objet|item|cat[eé]gorie|notes?|taille|name|title|product|label|object/i;
    const ACHAT_RE=/achat|achet[eé]|PA\b|prix.?achat|co[uû]t|invest|d[eé]pense|d[eé]bours|purchase|bought|buy\b|paid|spend/i;
    const VENTE_RE=/PV\b|prix.?vente|prix.?de.?vente|revente|cession|recette|encaiss|sale\b|sold\b|sell\b|revenue|income|receipt/i;
    const STATUT_RE=/statut|status|[eé]tat|available|listed/i;
    const DATE_VENTE_RE=/date.?vente|date.?de.?vente|vendu.?le|sold.?at|sold.?on|sale.?date|date.?sold/i;
    const DATE_RE=/\bdate\b|jour|day|purchase.?date|bought.?on/i;
    const MARQUE_RE=/marque|brand|make|fabricant/i;
    const mapping={titres:[],prix_achat:null,prix_vente:null,statut:null,date:null,marque_col:null};

    for(const h of headers){
      const s=String(h).trim();
      if(MARQUE_RE.test(s)&&!mapping.marque_col) mapping.marque_col=h;
      else if(TITRE_RE.test(s)) mapping.titres.push(h);
      if(!mapping.prix_achat && ACHAT_RE.test(s)) mapping.prix_achat=h;
      else if(!mapping.prix_vente && VENTE_RE.test(s)) mapping.prix_vente=h;
      else if(!mapping.statut && STATUT_RE.test(s)) mapping.statut=h;
      if(DATE_VENTE_RE.test(s)) mapping.date=h;
      else if(!mapping.date && DATE_RE.test(s)) mapping.date=h;
    }
    console.log('[Import] detectColumns — headers:',headers,'→',mapping);

    // ÉTAPE 3 : Fallback numérique 80% sur 20 premières lignes
    const sample=rows.slice(0,20);
    const assigned=new Set([...mapping.titres,mapping.prix_achat,mapping.prix_vente,mapping.statut,mapping.date,mapping.marque_col].filter(Boolean));
    const numCols=headers.filter(h=>{
      if(assigned.has(h)) return false;
      const vals=sample.map(r=>String(r[h]??'').replace(',','.').trim()).filter(v=>v!=='');
      if(!vals.length) return false;
      return vals.filter(v=>!isNaN(parseFloat(v))).length/vals.length>=0.8;
    });
    if(!mapping.prix_achat && numCols[0]){mapping.prix_achat=numCols[0];assigned.add(numCols[0]);}
    if(!mapping.prix_vente && numCols[1]) mapping.prix_vente=numCols[1];
    console.log('[Import] after numeric fallback:',mapping);

    return mapping;
  }

  // ── Filtre lignes parasites ───────────────────────────────────────────────
  // Retourne null si la ligne est valide, sinon la catégorie de raison
  function classifyParasite(row, mapping){
    const PARASITE_RE=/total|sous.?total|somme|bilan|virement|re[cç]u|comptabilis|r[eé]sum[eé]|r[eé]cap|moyenne|average|\bnote\b|\binfo\b|NaN|subtotal|sum\b|shipping|refund|return/i;
    const buyStr=String(row[mapping.prix_achat]??'').replace(',','.').trim();
    const buy=parseFloat(buyStr);
    // Prix achat invalide ou nul
    if(!mapping.prix_achat||!buyStr||isNaN(buy)||buy<0) return 'prix manquant';
    // Titre invalide : vide, chiffre pur, trop court, symbole
    const titre=buildTitre(row,mapping.titres);
    if(!titre||titre==='Article importé'||titre.length<2||/^[\d\s.,#*\-=]+$/.test(titre)) return 'titre invalide';
    // Ligne parasite (totaux, résumés, virements…)
    if(PARASITE_RE.test(titre)) return 'totaux/résumés';
    return null;
  }

  // Helper : construit le titre depuis mapping.titres (ÉTAPE 4)
  function buildTitre(r, titresCols){
    if(!titresCols.length) return "Article importé";
    const parts=titresCols.map(col=>String(r[col]??'').trim()).filter(p=>p!=='');
    const nom=parts.join(' - ');
    // Filtre les valeurs invalides
    if(!nom||/^[#\d.,\s]+$/.test(nom)) return "Article importé";
    return nom;
  }

  const MARQUES_CONNUES=["Nike","Adidas","Zara","H&M","Mango","Shein","Primark","Levi's","Levis","Ralph Lauren","Tommy Hilfiger","Lacoste","New Balance","Puma","Reebok","Under Armour","The North Face","Stone Island","Carhartt","Stussy","Supreme","Off-White","Balenciaga","Gucci","Louis Vuitton","Hermès","Hermes","Chanel","Dior","Givenchy","Burberry","Versace","Armani","Boss","Calvin Klein","Diesel","Guess","Michael Kors","Vans","Converse","Jordan","Timberland","UGG","Crocs","Uniqlo","Cos","Sandro","Maje","Ba&sh","Isabel Marant","Kiabi","Jules","Celio","Bershka","Pull&Bear","Stradivarius"];
  const MARQUE_KEEP_CASE=new Set(["H&M","BA&SH","Ba&sh"]);
  function detectMarque(titre,row,mapping){
    if(mapping.marque_col){
      const v=String(row[mapping.marque_col]??'').trim();
      if(v){const n=MARQUE_KEEP_CASE.has(v)?v:v.charAt(0).toUpperCase()+v.slice(1).toLowerCase();return n.trim();}
    }
    const t=String(titre||'');
    for(const m of MARQUES_CONNUES){
      if(new RegExp('\\b'+m.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(t)){
        const n=MARQUE_KEEP_CASE.has(m)?m:m.charAt(0).toUpperCase()+m.slice(1).toLowerCase();
        return n.trim();
      }
    }
    return null;
  }

  function parseDate(val){
    if(!val) return null;
    if(!isNaN(val)&&Number(val)>1000){
      const d=new Date((Number(val)-25569)*86400000);
      return isNaN(d)?null:d.toISOString().split('T')[0];
    }
    const s=String(val).trim();
    const m1=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if(m1){const y=m1[3].length===2?"20"+m1[3]:m1[3];return `${y}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;}
    const m2=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
    const d=new Date(s);
    return isNaN(d)?null:d.toISOString().split('T')[0];
  }

  // ── Import Excel / CSV ───────────────────────────────────────────────────
  function handleImportFile(e){
    const file=e.target.files?.[0];
    if(!file) return;
    e.target.value="";
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const wb=XLSX.read(ev.target.result,{type:"array"});

        const MOIS={janvier:1,février:2,fevrier:2,mars:3,avril:4,mai:5,juin:6,juillet:7,août:8,aout:8,septembre:9,octobre:10,novembre:11,décembre:12,decembre:12};
        const IGNORE_RE=/^(listes?|liste|config|param[eè]tres?|r[eé]sum[eé]|summary|dashboard|feuil\d+|sheet\d+)$/i;
        const KEYWORDS=/nom|titre|article|marque|brand|achat|vente|prix|libell[eé]|d[eé]sign|item|statut|cat[eé]gorie|plateforme|b[eé]n[eé]fice|benefice|reception|date|taille|notes?/i;

        const allRows=[];
        const seenHeaders=new Set();
        let sheetsRead=0;

        for(const sheetName of wb.SheetNames){
          const cleanName=sheetName.replace(/\p{Emoji}/gu,'').trim();
          if(IGNORE_RE.test(cleanName)){
            console.log(`[Import] Sheet "${sheetName}" — ignored (config/list sheet)`);
            continue;
          }

          const ws=wb.Sheets[sheetName];
          const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
          console.log(`[Import] Sheet "${sheetName}" — ${matrix.length} rows`);

          // Date déduite du nom de feuille (ex: "Janvier" → 2026-01-01)
          const monthNum=MOIS[sheetName.trim().toLowerCase()];
          const sheetDate=monthNum
            ? new Date(new Date().getFullYear(),monthNum-1,1).toISOString()
            : null;

          // ÉTAPE 1 : Trouver la ligne headers
          let bestRowIdx=-1, bestScore=-1, fallbackIdx=-1;
          for(let i=0;i<Math.min(15,matrix.length);i++){
            const row=matrix[i].map(c=>String(c??'').trim());
            const nonEmpty=row.filter(c=>c!=='');
            const nonNumeric=nonEmpty.filter(c=>isNaN(parseFloat(c.replace(',','.'))));
            if(nonNumeric.length<2) continue;
            if(fallbackIdx<0&&nonEmpty.length>=3) fallbackIdx=i;
            const score=nonNumeric.filter(c=>KEYWORDS.test(c)).length;
            if(score>bestScore){bestScore=score;bestRowIdx=i;}
          }
          const headerRowIdx=bestRowIdx>=0?bestRowIdx:fallbackIdx;
          if(headerRowIdx<0){
            console.log(`[Import] Sheet "${sheetName}" — no headers found, skipping`);
            continue;
          }

          const headerRow=matrix[headerRowIdx].map(c=>String(c??'').trim());
          const rows=matrix.slice(headerRowIdx+1)
            .filter(r=>r.some(c=>String(c??'').trim()!==''))
            .map(r=>{
              const obj={};
              headerRow.forEach((h,ci)=>{if(h) obj[h]=r[ci]??'';});
              if(sheetDate) obj.__sheetDate=sheetDate;
              return obj;
            });

          if(!rows.length){
            console.log(`[Import] Sheet "${sheetName}" — no data rows, skipping`);
            continue;
          }

          // Vérifie que la feuille a au moins une colonne prix
          const sheetHeaders=headerRow.filter(h=>h!=='');
          const sheetMapping=detectColumns(sheetHeaders,rows);
          if(!sheetMapping.prix_achat){
            console.log(`[Import] Sheet "${sheetName}" — no price column detected, skipping`);
            continue;
          }

          sheetsRead++;
          allRows.push(...rows);
          sheetHeaders.forEach(h=>seenHeaders.add(h));
          console.log(`[Import] Sheet "${sheetName}" — added ${rows.length} rows`);
        }

        if(!allRows.length){
          setImportMsg("Aucune donnée valide trouvée dans le fichier.");
          return;
        }

        const allHeaders=[...seenHeaders];
        const mapping=detectColumns(allHeaders,allRows);

        // Filtre lignes parasites et compte par catégorie
        const skipCounts={};
        const cleanRows=allRows.filter(r=>{
          const reason=classifyParasite(r,mapping);
          if(reason){skipCounts[reason]=(skipCounts[reason]||0)+1;return false;}
          return true;
        });
        const ignoredCount=Object.values(skipCounts).reduce((a,b)=>a+b,0);
        console.log('[Import] Filtered:',cleanRows.length,'kept,',ignoredCount,'skipped',skipCounts);

        if(!cleanRows.length){
          const detail=Object.entries(skipCounts).map(([k,v])=>`${v} ${k}`).join(', ');
          setImportMsg(`Aucune ligne valide après filtrage (${detail}).`);
          return;
        }

        setImportModal({rows:cleanRows,mapping,preview:cleanRows.slice(0,3),headers:allHeaders,validCount:cleanRows.length,sheetsRead,ignoredCount,skipCounts});
        setImportMsg("");
      }catch(err){
        console.error('[Import] Error:',err);
        setImportMsg("Erreur lecture fichier : "+err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleImportConfirm(){
    if(!importModal) return;
    setImportLoading(true);
    const{rows,mapping}=importModal;
    const now=new Date().toISOString();
    const toInsert=rows.map((r,idx)=>{
      const titre=buildTitre(r,mapping.titres);
      const buy=parseFloat(String(r[mapping.prix_achat]??0).replace(",","."))||0;
      const sell=mapping.prix_vente?parseFloat(String(r[mapping.prix_vente]??0).replace(",","."))||0:0;
      // ÉTAPE 5 : Statut
      const statut=mapping.statut
        ? (/vendu|sold|vend/i.test(String(r[mapping.statut]))?'vendu':'stock')
        : (sell>0?'vendu':'stock');
      const hasSell=sell>0;
      const margin=hasSell?sell-buy:null;
      const marginPct=hasSell?(margin/sell)*100:null;
      const parsedDate=mapping.date?parseDate(r[mapping.date]):null;
      const rowDate=parsedDate?(parsedDate+'T00:00:00.000Z'):(r.__sheetDate||now);
      let marque=null;
      if(mapping.marque_col){
        const v=String(r[mapping.marque_col]??'').trim();
        if(v) marque=MARQUE_KEEP_CASE.has(v)?v:v.charAt(0).toUpperCase()+v.slice(1).toLowerCase();
      } else {
        marque=detectMarque(titre,r,{marque_col:null});
      }
      const typeAuto=detectType(titre,marque);
      return{
        id:Date.now()+idx,
        user_id:user.id,
        titre,
        prix_achat:buy,
        prix_vente:hasSell?sell:null,
        margin,
        margin_pct:marginPct,
        statut,
        date:rowDate,
        marque,
        type:typeAuto,
        created_at:now,
      };
    }).filter(r=>r.prix_achat>=0&&r.titre!=="Article importé");
    console.log('[Import] Inserting',toInsert.length,'rows — sample:',toInsert[0]);

    const{data,error}=await supabase.from('inventaire').insert(toInsert).select();
    if(error){setImportLoading(false);setImportMsg("Erreur import : "+error.message);return;}

    // Insère aussi dans ventes les lignes "vendu" (depuis data = retour Supabase avec vrais ids)
    const ventesRows=(data||[])
      .filter(row=>row.statut==='vendu'&&row.prix_vente>0)
      .map(row=>({
        user_id:user.id,
        titre:row.titre,
        prix_achat:parseFloat(row.prix_achat)||0,
        prix_vente:parseFloat(row.prix_vente)||0,
        benefice:parseFloat(row.margin)||0,
        date:(row.date?String(row.date):now.toString()).slice(0,10),
        marque:row.marque||null,
      }));
    console.log('[Import] ventesRows à insérer:',ventesRows);
    if(ventesRows.length){
      const{error:ve}=await supabase.from('ventes').insert(ventesRows);
      console.log('[Import] erreur ventes:',ve);
      if(ve) console.warn('[Import] ventes insert error:',ve.message);
    }

    // Resync complet depuis Supabase
    await fetchAll(user.id);
    setImportLoading(false);
    setImportModal(null);
    setImportMsg(`✅ ${data?.length||0} article(s) importé(s) avec succès.`);
    setTimeout(()=>setImportMsg(""),4000);
  }

  // ── Export Excel ─────────────────────────────────────────────────────────
  async function handleExport(){
    const today=new Date().toISOString().split("T")[0];
    const wb=XLSX.utils.book_new();

    // Onglet Ventes
    const ventesData=sales.map(s=>({
      "Date":s.date,
      "Article":s.title,
      "Prix achat":s.buy,
      "Prix vente":s.sell,
      "Bénéfice":parseFloat(s.margin.toFixed(2)),
      "Marge %":parseFloat(s.marginPct.toFixed(1)),
    }));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(ventesData),"Ventes");

    // Onglet Inventaire
    const invData=items.map(i=>({
      "Article":i.title,
      "Prix achat":i.buy,
      "Prix vente":i.sell||"",
      "Statut":i.statut==="stock"?"En stock":"Vendu",
      "Date":i.date?new Date(i.date).toLocaleDateString("fr-FR"):"",
    }));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(invData),"Inventaire");

    const filename=`fillsell-export-${today}.xlsx`;

    if(isNative){
      try{
        const wbout=XLSX.write(wb,{bookType:"xlsx",type:"array"});
        const blob=new Blob([wbout],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
        const file=new File([blob],filename,{type:blob.type});
        if(navigator.canShare&&navigator.canShare({files:[file]})){
          await navigator.share({files:[file],title:"Export Fill & Sell"});
        } else {
          alert("Export disponible sur la version web : fillsell.app");
        }
      } catch(e){
        if(e?.name!=="AbortError") alert("Export disponible sur la version web : fillsell.app");
      }
    } else {
      XLSX.writeFile(wb,filename);
    }
  }

  const handleAppleSignIn = async () => {
    // FIX 1 : ne pas re-déclencher si session déjà active
    const { data: { session: existingSession } } = await supabase.auth.getSession();
    if (existingSession) { navigate('/app'); return; }
    try {
      const { identityToken } = await AppleSignIn.signIn();
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: identityToken,
      });
      if (error) throw error;
      if (data?.session) {
        const u = data.session.user;
        setUser(u);
        await fetchAll(u.id);
        navigate('/app');
      }
    } catch (e) {
      // FIX 2 : annulation silencieuse (code 1001 iOS ou USER_CANCELLED)
      const isCancelled =
        e?.code === 1001 ||
        e?.code === '1001' ||
        e?.message === 'USER_CANCELLED' ||
        e?.message?.includes('1001') ||
        e?.message?.includes('cancel') ||
        e?.message?.includes('Cancel');
      if (!isCancelled) {
        console.error('Apple Sign In error:', e);
        alert('Erreur Sign in with Apple: ' + e.message);
      }
    }
  };

  async function handleLogin(){
    setLoginError("");
    if(!emailRef.current?.value||!passwordRef.current?.value){setLoginError("Remplis email et mot de passe");return;}
    setIsSigningIn(true);
    try{
      const{error}=await supabase.auth.signInWithPassword({email:emailRef.current?.value,password:passwordRef.current?.value});
      if(error){setLoginError(error.message);return;}
      track('login', { method: 'email' });
      navigate("/app");
    }catch(e){setLoginError(e.message);}finally{setIsSigningIn(false);}
  }

  async function handleForgot(){
    const _lt=localStorage.getItem('fs_lang')||((navigator.language||'fr').startsWith('fr')?'fr':'en');
    if(!email){setForgotMsg(_lt==='en'?"Enter your email above.":"Saisis ton email ci-dessus.");return;}
    setForgotMsg("");
    const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:"https://fillsell.app/reset-password"});
    if(error){setForgotMsg("Erreur : "+error.message);return;}
    setForgotMsg("📧 Email envoyé ! Vérifie ta boîte mail.");
  }

  async function handleSignup(){
    if(!email||!password){alert("Remplis email et mot de passe");return;}
    const{data,error}=await supabase.auth.signUp({email,password});
    if(error){alert(error.message);return;}
    track('sign_up', { method: 'email' });
    if(data?.session) navigate("/app");
    else alert("Vérifie ton email pour confirmer ton compte !");
  }

  async function handleLogout(){
    await supabase.auth.signOut();
    setUser(null);setSales([]);setItems([]);setResetStep(0);
    navigate("/");
  }

  async function handleDeleteAccount(){
    if(!user) return;
    setDeleteLoading(true);
    try {
      console.log("step 1 - delete inventaire");
      await supabase.from("inventaire").delete().eq("user_id",user.id);
      console.log("step 2 - delete ventes");
      await supabase.from("ventes").delete().eq("user_id",user.id);
      console.log("step 3 - delete profiles");
      await supabase.from("profiles").delete().eq("id",user.id);
      const { data: { session } } = await supabase.auth.getSession();
      const jwt = session?.access_token;
      console.log("step 4 - fetch", import.meta.env.VITE_SUPABASE_URL, jwt ? "jwt ok" : "jwt null");
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`,
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "Authorization":`Bearer ${jwt}`,
            "apikey":import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      );
      console.log("step 5 - res.ok:", res.ok);
      if(!res.ok){ const e=await res.json(); throw new Error(e.error||"Erreur suppression compte"); }
      await supabase.auth.signOut();
      setUser(null);setSales([]);setItems([]);
      navigate("/");
    } catch(err){
      alert(lang==='fr'?`Erreur : ${err.message}`:`Error: ${err.message}`);
    } finally {
      setDeleteLoading(false);
      setDeleteStep(0);
    }
  }

  const TABS_MOBILE=[
    {icon:"📊",label:lang==='fr'?"Tableau":"Board",idx:0},
    {icon:"🤖",label:lang==='fr'?"Stock IA":"AI Stock",idx:1},
    {icon:"🎯",label:"Deal Score",idx:2},
    {icon:"📋",label:lang==='fr'?"Ventes":"Sales",idx:3},
    {icon:"📈",label:"Stats",idx:4},
  ];

  const headerStats=[
    {label:t('benefices'),value:fmt(totalM)},
    {label:t('totalInvesti'),value:fmt(invested)},
    {label:t('enStockLabel'),value:`${stock.length} ${lang==='fr'?'art.':'items'} · ${fmt(stockVal)}`},
  ];

  if(authLoading||appLoading)return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#4ECDC4 0%,#F9A26C 100%)",flexDirection:"column",gap:24}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
        <img src="/icon_1024x1024.png" alt="Fill & Sell" style={{width:72,height:72,borderRadius:18,objectFit:"cover",boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}}/>
        <div style={{fontSize:22,fontWeight:900,color:"#fff",letterSpacing:"-0.02em"}}>Fill & Sell</div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {[0,1,2].map(i=>(
          <span key={i} style={{width:8,height:8,borderRadius:"50%",background:"rgba(255,255,255,0.9)",display:"inline-block",animation:`fs-dot 1.2s ease-in-out ${i*0.2}s infinite`}}/>
        ))}
      </div>
    </div>
  );

  const loginLang=localStorage.getItem('fs_lang')||((navigator.language||'fr').startsWith('fr')?'fr':'en');
  const loginTexts=loginLang==='en'?{
    subtitle:"Sign in to continue",login:"Sign in",signup:"Create my account",
    forgot:"Forgot your password?",forgotBtn:"Send reset link",
    forgotMsg:"Enter your email above.",back:"← Back"
  }:{
    subtitle:"Connecte-toi pour continuer",login:"Se connecter",signup:"Créer mon compte",
    forgot:"Mot de passe oublié ?",forgotBtn:"Envoyer le lien de réinitialisation",
    forgotMsg:"Saisis ton email ci-dessus.",back:"← Retour"
  };

  if(!authLoading&&!isSigningIn&&(!user||loginOnly))return(
    <div style={{position:"fixed",inset:0,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",background:"linear-gradient(135deg,#4ECDC4 0%,#F9A26C 100%)",overflow:"hidden",boxSizing:"border-box"}}>
      <button onClick={()=>navigate("/")} style={{position:"absolute",top:"max(50px, calc(16px + env(safe-area-inset-top)))",left:16,background:"none",border:"none",color:"rgba(255,255,255,0.85)",fontSize:22,cursor:"pointer",padding:"4px 8px",lineHeight:1}}>←</button>
      <div style={{background:"#fff",borderRadius:24,padding:"36px 28px",width:"100%",maxWidth:400,boxShadow:"0 24px 64px rgba(0,0,0,0.2)",boxSizing:"border-box"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <img src="/logo.png" style={{height:52,marginBottom:12,objectFit:"contain"}} alt="Fill & Sell"/>
          <div style={{fontSize:15,color:C.sub,fontWeight:500}}>{loginTexts.subtitle}</div>
        </div>
        <div style={{display:"flex",background:"rgba(0,0,0,0.05)",borderRadius:99,padding:3,marginBottom:18}}>
          <button onClick={()=>setAuthMode('login')} style={{flex:1,padding:"9px 12px",borderRadius:99,border:"none",fontSize:14,fontWeight:700,cursor:"pointer",background:authMode==='login'?"#3EACA0":"transparent",color:authMode==='login'?"#fff":"#6B7280",transition:"all 0.15s"}}>
            {loginTexts.login}
          </button>
          <button onClick={()=>setAuthMode('signup')} style={{flex:1,padding:"9px 12px",borderRadius:99,border:"none",fontSize:14,fontWeight:700,cursor:"pointer",background:authMode==='signup'?"#3EACA0":"transparent",color:authMode==='signup'?"#fff":"#6B7280",transition:"all 0.15s"}}>
            {loginTexts.signup}
          </button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {isNative&&(
            <div style={{marginBottom:16}}>
              <button onClick={handleAppleSignIn} style={{width:"100%",backgroundColor:"#000",color:"#fff",border:"none",borderRadius:12,padding:"14px 16px",fontSize:16,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",fontFamily:"inherit"}}>
                <span style={{fontSize:20}}>&#63743;</span>
                {lang==='fr'?'Continuer avec Apple':'Continue with Apple'}
              </button>
              <div style={{textAlign:"center",color:"#999",fontSize:13,marginTop:12}}>
                {lang==='fr'?'— ou —':'— or —'}
              </div>
            </div>
          )}
          <input type="email" placeholder="Email" ref={emailRef} defaultValue=""
            style={{padding:"13px 16px",borderRadius:12,border:"1px solid rgba(0,0,0,0.12)",fontSize:15,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"}}/>
          {!forgotMode&&(
            <>
              <input type="password" placeholder="Mot de passe" ref={passwordRef} defaultValue=""
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                style={{padding:"13px 16px",borderRadius:12,border:"1px solid rgba(0,0,0,0.12)",fontSize:15,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"}}/>
              <button onClick={authMode==='login'?handleLogin:handleSignup}
                style={{padding:"14px",background:`linear-gradient(135deg,${C.teal},${C.peach})`,color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",width:"100%",boxShadow:"0 4px 16px rgba(62,172,160,0.35)"}}>
                {authMode==='login'?loginTexts.login:loginTexts.signup}
              </button>
              {loginError&&<div style={{fontSize:13,textAlign:"center",color:C.red,fontWeight:600}}>{loginError}</div>}
              <div style={{textAlign:"center"}}>
                <span onClick={()=>{setForgotMode(true);setForgotMsg("");}} style={{fontSize:13,color:C.teal,cursor:"pointer",textDecoration:"underline"}}>
                  {loginTexts.forgot}
                </span>
              </div>
            </>
          )}
          {forgotMode&&(
            <>
              <button onClick={handleForgot}
                style={{padding:"14px",background:`linear-gradient(135deg,${C.teal},${C.peach})`,color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",width:"100%",boxShadow:"0 4px 16px rgba(62,172,160,0.35)"}}>
                {loginTexts.forgotBtn}
              </button>
              {forgotMsg&&(
                <div style={{fontSize:13,textAlign:"center",color:forgotMsg.startsWith("📧")?C.teal:C.red,fontWeight:600}}>
                  {forgotMsg}
                </div>
              )}
              <div style={{textAlign:"center"}}>
                <span onClick={()=>{setForgotMode(false);setForgotMsg("");}} style={{fontSize:13,color:C.sub,cursor:"pointer"}}>
                  {loginTexts.back}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const vaActions={
    addItem:async(data)=>{
      if(!isPremium&&items.length>=20)throw new Error(lang==='fr'?"Limite gratuite atteinte":"Free plan limit reached");
      const b=parseFloat(String(data.prix_achat??data.prix_estime_lot??0).replace(",","."))||0;
      const marqueNorm=normalizeMarque(data.marque);
      const _td3=detectType(data.nom||"",marqueNorm);const typeAuto=_td3==='Luxe'?'Luxe':(data.categorie||_td3);
      const row={id:Date.now()+Math.floor(Math.random()*10000),user_id:user.id,titre:data.nom||"Article",prix_achat:b,prix_vente:null,margin:null,margin_pct:null,statut:"stock",date:new Date().toISOString(),marque:marqueNorm,description:data.description||null,type:typeAuto,purchase_costs:0,selling_fees:0,quantite:data.quantite||1};
      console.log("[addItem] data reçu:", JSON.stringify(data), "row.quantite:", row.quantite);
      const{data:d,error}=await supabase.from('inventaire').insert([row]).select().single();
      if(error)throw new Error(error.message);
      const mapped=mapItem({...d,quantite:d.quantite??row.quantite});
      setItems(prev=>[mapped,...prev]);
      return mapped;
    },
    markSold:(item)=>markSold(item),
    confirmSellDirect:async(item,prix_vente,frais=0,quantite_vendue=1)=>{
      const sv=parseFloat(String(prix_vente??0).replace(",","."))||0;
      if(!sv||sv<=0)throw new Error("Prix vente invalide");
      const sf=parseFloat(String(frais??0).replace(",","."))||0;
      const cogs=item.buy+(item.purchaseCosts||0);
      const mg=sv-cogs-sf;const mgp=(mg/sv)*100;
      const qTotal=item.quantite||1;
      const qVendue=Math.min(quantite_vendue||1,qTotal);
      const remaining=qTotal-qVendue;
      if(remaining>0){
        // Partial sell: decrement quantity only — prix_achat is never touched
        await supabase.from('inventaire').update({quantite:remaining}).eq('id',item.id);
        setItems(prev=>prev.map(i=>i.id===item.id?{...i,quantite:remaining}:i));
      }else{
        await supabase.from('inventaire').update({prix_vente:sv,margin:mg,margin_pct:mgp,statut:"vendu",selling_fees:sf}).eq('id',item.id);
        setItems(prev=>prev.map(i=>i.id===item.id?{...i,sell:sv,margin:mg,marginPct:mgp,statut:"vendu"}:i));
      }
      for(let q=0;q<qVendue;q++){
        const srow={user_id:user.id,titre:item.title,prix_achat:item.buy,prix_vente:sv,benefice:mg,marque:item.marque||null,type:item.type||null,date:new Date().toISOString().split('T')[0]};
        const{data:sd}=await supabase.from('ventes').insert([srow]).select().single();
        if(sd)setSales(prev=>[mapSale(sd),...prev]);
      }
    },
    deleteItem:(id)=>delItem(id),
    fetchAll:()=>fetchAll(user.id),
    updateItem:async(id,fields)=>{
      const{error}=await supabase.from('inventaire').update(fields).eq('id',id);
      if(error)throw new Error(error.message);
    },
  };

  return(
    <div className="app-root" style={{height:"100dvh",overflowY:"hidden",display:"flex",flexDirection:"column",overflowX:"hidden",maxWidth:"100vw",position:"relative"}}>

      <div className="topbar">
        <button onClick={()=>{setTab(0);localStorage.setItem('tab','0');}} className="tb-logo">
          <img src="/icon_1024x1024.png" alt="Fill & Sell" className="logo-mobile" style={{width:30,height:30,borderRadius:9,objectFit:"cover",flexShrink:0}}/>
          <img src="/logo.png" alt="Fill & Sell" className="logo-desktop" style={{height:34,width:"auto",objectFit:"contain",flexShrink:0}}/>
          <span className="name">Fill &amp; Sell</span>
        </button>
        <div className="header-centre" style={{flex:1,textAlign:"center"}}>
          <div style={{fontSize:13,fontWeight:900,color:"#0D0D0D",letterSpacing:"-0.02em",lineHeight:1}}>
            {fmt(tm.profit)}<span style={{opacity:0.55,fontSize:11,fontWeight:700}}> {t('profit')}</span>
          </div>
          <div style={{fontSize:10,fontWeight:700,color:"#A3A9A6",marginTop:2,whiteSpace:"nowrap"}}>
            {tm.count} {t('ventesMonth')}
          </div>
        </div>
        <div className="tb-right">
          {!isPremium&&!isNative?(
            <PremiumBanner userEmail={user?.email} compact onDark={false} source="topbar"/>
          ):isPremium?(
            <div className="tb-premium">⭐ Premium</div>
          ):null}
          <button onClick={()=>{setShowSettings(true);setCancelStep(0);setCancelMsg("");}} title="Paramètres" className="tb-icon-btn-light">⚙️</button>
        </div>
      </div>

      <div className="desktop-nav" style={{background:"#fff",borderBottom:"1px solid rgba(0,0,0,0.06)"}}>
        <div className="wrap">
          <div style={{display:"flex",padding:"0 14px",gap:0,overflowX:"auto"}}>
            {[
              lang==='fr'?"Tableau":"Board",
              lang==='fr'?"Stock IA":"AI Stock",
              "Deal Score",
              lang==='fr'?"Ventes":"Sales",
              "Stats"
            ].map((tabLabel,i)=>(
              <button key={i} onClick={()=>{setTab(i);localStorage.setItem('tab',i);}}
                style={{flex:1,textAlign:"center",padding:"10px 8px",background:"transparent",border:"none",borderBottom:`2px solid ${tab===i?"#1D9E75":"transparent"}`,color:tab===i?"#1D9E75":"#A3A9A6",fontSize:13,fontWeight:700,whiteSpace:"nowrap",cursor:"pointer",transition:"all 0.15s ease"}}
                onMouseEnter={e=>{if(i!==tab)e.currentTarget.style.color="#5DCAA5";}}
                onMouseLeave={e=>{if(i!==tab)e.currentTarget.style.color="#A3A9A6";}}
              >{tabLabel}</button>
            ))}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="wrap page-pad" style={{padding:"18px 14px 16px",background:"var(--bg)",flex:"1",overflowY:"auto",WebkitOverflowScrolling:"touch",minHeight:0}}>

        {tab===0&&(
          <div style={{display:"flex",flexDirection:"column",gap:28,width:"100%",overflow:"hidden"}}>
            {!isPremium&&!loading&&items.length>0&&items.length<18&&(
              <div style={{background:C.tealLight,border:`1px solid ${C.teal}33`,borderRadius:12,padding:"12px 18px",textAlign:"center",overflow:"hidden"}}>
                <div style={{fontSize:13,fontWeight:600,color:20-items.length<=2?"#C05621":C.teal}}>
                  {20-items.length<=2
                    ? tpl('urgenceArticles',{n:20-items.length})
                    : tpl('articlesGratuits',{n:20-items.length})
                  }
                </div>
              </div>
            )}
            {!isNative&&!isPremium&&!loading&&items.length>=18&&(
              <div onClick={()=>{track('premium_click',{source:'banner'});triggerCheckout();}} style={{background:"#FEF9E7",border:"1px solid rgba(249,162,108,0.4)",borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,cursor:"pointer"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D"}}>{lang==='en'?`⚠️ Only ${20-items.length} item${20-items.length>1?"s":""} left on your free plan`:`⚠️ Plus que ${20-items.length} article${20-items.length>1?"s":""} disponible${20-items.length>1?"s":""}`}</div>
                <button onClick={e=>{e.stopPropagation();track('premium_click',{source:'banner'});triggerCheckout();}} style={{background:"#1D9E75",color:"#fff",border:"none",borderRadius:99,padding:"6px 12px",fontSize:11,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{t('debloquer')}</button>
              </div>
            )}
            {loading?(
              <div style={{textAlign:"center",padding:"60px 0",color:C.sub,fontSize:14,fontWeight:600}}>{lang==='en'?"Loading data...":"Chargement des données..."}</div>
            ):items.length===0&&sales.length===0?(
              <div style={{maxWidth:520,margin:"40px auto 0",animation:"fadeIn 0.4s ease",width:"100%"}}>
                <div className="card" style={{padding:"40px 32px",textAlign:"center"}}>
                  <div style={{fontSize:48,marginBottom:16}}>👋</div>
                  <div style={{fontSize:22,fontWeight:900,color:C.text,letterSpacing:"-0.5px",marginBottom:12}}>{lang==='en'?"Welcome to Fill & Sell":"Bienvenue sur Fill & Sell"}</div>
                  <div style={{fontSize:14,color:C.sub,lineHeight:1.7,marginBottom:32,maxWidth:380,margin:"0 auto 32px"}}>
                    {lang==='en'?"Track your resale profits in seconds.":"Suis tes profits de revente en quelques secondes."}<br/>{lang==='en'?"Start by adding your first item.":"Commence par ajouter ton premier article."}
                  </div>
                  <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:36,flexWrap:"wrap"}}>
                    {[{icon:"📦",label:"Ajoute un article",tab:1},{icon:"💰",label:"Enregistre une vente",tab:1},{icon:"📊",label:"Analyse tes profits",tab:3}].map((step,i)=>(
                      <div key={i} onClick={()=>{setTab(step.tab);localStorage.setItem('tab',step.tab);}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"14px 18px",background:C.rowBg,borderRadius:14,border:"1px solid rgba(0,0,0,0.06)",minWidth:100,cursor:"pointer",transition:"transform 0.15s,box-shadow 0.15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.08)";}}
                        onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}}
                        onMouseDown={e=>e.currentTarget.style.transform="scale(0.95)"}
                        onMouseUp={e=>e.currentTarget.style.transform="translateY(-2px)"}
                      >
                        <div style={{fontSize:26}}>{step.icon}</div>
                        <div style={{fontSize:11,fontWeight:700,color:C.sub,textAlign:"center"}}>{step.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    <button onClick={()=>{setTab(1);localStorage.setItem('tab',1);}} style={{padding:"14px 24px",background:`linear-gradient(135deg,${C.teal},${C.peach})`,color:"#fff",border:"none",borderRadius:14,fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 16px rgba(62,172,160,0.35)",transition:"all 0.2s"}}
                      onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
                      onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}
                    >➕ Ajouter mon premier article</button>
                    <button onClick={()=>{setTab(2);localStorage.setItem('tab',2);}} style={{padding:"14px 24px",background:"transparent",color:C.teal,border:`1.5px solid ${C.teal}`,borderRadius:14,fontSize:15,fontWeight:700,cursor:"pointer",transition:"all 0.2s"}}
                      onMouseEnter={e=>{e.currentTarget.style.background=C.tealLight;}}
                      onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}
                    >🧮 Tester le calculateur</button>
                  </div>
                </div>
              </div>
            ):(
              <>
                {/* Badge mois */}
                <div>
                  <div style={{display:"inline-flex",alignItems:"center",gap:4,background:"#E8F5F0",color:"#0F6E56",border:"1px solid #9FE1CB",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:10}}>
                    <div style={{width:4,height:4,borderRadius:"50%",background:"#1D9E75",flexShrink:0}}/>
                    {(lang==='en'?MONTHS_EN:MONTHS_FR)[now.getMonth()]} {now.getFullYear()}
                  </div>
                  <div style={{fontSize:32,fontWeight:900,color:"#0D0D0D",letterSpacing:"-0.04em",lineHeight:1,marginBottom:18}}>
                    {(()=>{const title=t('dashTitle');const hi=t('dashTitleHighlight');const idx=title.lastIndexOf(hi);return idx<0?<span style={{color:"#1D9E75"}}>{title}</span>:<>{title.slice(0,idx)}<span style={{color:"#1D9E75"}}>{hi}</span></>;})()}
                  </div>
                </div>

                {/* Hero card profit net */}
                <div onClick={()=>{if(!isPremium&&isNative){handleIAPPurchase();}else if(!isPremium&&!isNative){track('premium_click',{source:'hero_card'});triggerCheckout();}else if(isPremium){setTab(4);localStorage.setItem('tab',4);}}}
                  className="profit-hero card-enter"
                  onMouseEnter={e=>{e.currentTarget.style.filter="brightness(1.08)";}}
                  onMouseLeave={e=>{e.currentTarget.style.filter="brightness(1)";}}
                >
                  <div className="lbl" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span>{t('profitNet')}</span>
                    <span style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:99,padding:"3px 8px",fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.85)"}}>{tm.profit>=0?"+":""}{fmt(tm.profit)} {t('ceNoisPill')}</span>
                  </div>
                  <div className="amt">{fmt(totalM)}</div>
                  <div className="meta">
                    <span>{tpl('venteLabel',{n:salesForKpis.length})} · {t('margeMoyDash')} {fmt(salesForKpis.length?totalM/salesForKpis.length:0)}</span>
                  </div>
                  {!isPremium&&<div className="sub-text">{t('unlocAnalyse')}</div>}
                  {isPremium&&<div className="sub-text">{t('analyseComplete')}</div>}
                </div>

                {/* KPIs 2 colonnes */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <Kpi label={t('ceMois')} value={fmt(tm?.profit||0)} sub={tpl('venteLabel',{n:tm?.count||0})} color="#1D9E75" icon="📊"/>
                  <Kpi label={t('margeMoy')} value={fmtp(avgM)} sub={t('toutesVentes')} color="#5DCAA5" icon="📈"/>
                  <Kpi label={t('revenuBrutLabel')} value={fmt(totalR)} sub={t('totalEncaisse')} color="#1D9E75" icon="💎"/>
                  <Kpi label={t('enStock')} value={`${stock.length}`} sub={`${fmt(stockVal)} ${t('investi')}`} color="#A3A9A6" icon="📦"/>
                </div>

                {/* Sélecteur de période */}
                <div style={{display:"flex",justifyContent:"flex-end",gap:6,flexWrap:"wrap"}}>
                  {['7j','1M','6M','1A','YTD'].map(r=>(
                    <button key={r} onClick={()=>setSelectedRange(r)} style={{padding:"5px 12px",borderRadius:8,border:"none",fontSize:12,fontWeight:700,cursor:"pointer",transition:"all 0.15s",background:selectedRange===r?"#1D9E75":"#fff",color:selectedRange===r?"#fff":"#A3A9A6",boxShadow:selectedRange===r?"none":"0 1px 3px rgba(0,0,0,0.06)"}}>
                      {lang==='en'?({'7j':'7d','1A':'1Y'}[r]||r):r}
                    </button>
                  ))}
                </div>

                <div className="grid2">
                  <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D",marginBottom:2}}>{t('benefices')}</div>
                    <div style={{fontSize:11,color:"#A3A9A6",marginBottom:14,fontWeight:600}}>
                      {selectedRange==='7j'?t('dernierNJours'):selectedRange==='1M'?t('trente'):selectedRange==='1A'?t('douze'):selectedRange==='YTD'?t('depuisJanvier'):t('sixMois')}
                    </div>
                    <div style={{position:"relative",height:"200px",width:"100%"}}>
                      <Bar data={barChartData} options={barOpts}/>
                      {!isPremium&&(
                        <div onClick={()=>{if(isNative){handleIAPPurchase();}else{track('premium_click',{source:'chart'});triggerCheckout();}}} style={{position:"absolute",inset:0,zIndex:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,background:"rgba(255,255,255,0.75)",backdropFilter:"blur(2px)",borderRadius:8,cursor:"pointer"}}>
                          <span style={{fontSize:20}}>🔒</span>
                          <div style={{fontSize:12,fontWeight:800,color:"#0D0D0D",textAlign:"center",lineHeight:1.3}}>{t('debloquerAnalyse')}</div>
                          <button style={{background:"#1D9E75",color:"#fff",border:"none",borderRadius:99,padding:"7px 16px",fontSize:12,fontWeight:800,cursor:"pointer"}}>{t('unlockPremium')}</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D",marginBottom:2}}>{t('evolutionMarge')}</div>
                    <div style={{fontSize:11,color:"#A3A9A6",marginBottom:14,fontWeight:600}}>
                      {selectedRange==='7j'?t('dernierNJours'):selectedRange==='1M'?t('trente'):selectedRange==='1A'?t('douze'):selectedRange==='YTD'?t('depuisJanvier'):t('sixMois')}
                    </div>
                    <div style={{position:"relative",height:"200px",width:"100%"}}>
                      <Line data={lineChartData} options={lineOpts}/>
                      {!isPremium&&(
                        <div onClick={()=>{if(isNative){handleIAPPurchase();}else{track('premium_click',{source:'chart'});triggerCheckout();}}} style={{position:"absolute",inset:0,zIndex:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,background:"rgba(255,255,255,0.75)",backdropFilter:"blur(2px)",borderRadius:8,cursor:"pointer"}}>
                          <span style={{fontSize:20}}>🔒</span>
                          <div style={{fontSize:12,fontWeight:800,color:"#0D0D0D",textAlign:"center",lineHeight:1.3}}>{t('debloquerAnalyse')}</div>
                          <button style={{background:"#1D9E75",color:"#fff",border:"none",borderRadius:99,padding:"7px 16px",fontSize:12,fontWeight:800,cursor:"pointer"}}>{t('unlockPremium')}</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {hasData&&(
                  <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D",marginBottom:14}}>{t('dernieresventes')}</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {groupSales(sales).slice(0,5).map(s=>{
                        const d=new Date(s.date);const mc=!s.marginPct||s.marginPct<5?"#E53E3E":s.marginPct<20?"#F9A26C":s.marginPct<40?"#5DCAA5":"#1D9E75";
                        return(
                          <SwipeRow key={s.id} onDelete={()=>delSale(s.id)} style={{borderLeft:`4px solid ${mc}`}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:800,fontSize:13,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
                                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</span>
                                {(s._qty||1)>1&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 6px",fontSize:10,fontWeight:800,flexShrink:0,border:"1px solid #9FE1CB"}}>×{s._qty}</span>}
                              </div>
                              <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",marginTop:2}}>
                                <span style={{fontSize:11,fontWeight:700,color:"#A3A9A6"}}>{d.getDate()} {MONTHS_FR[d.getMonth()]}</span>
                                {s.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 6px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{marqueLabel(s.marque,lang)}</span>}
                                {s.type&&s.type!=="Autre"&&(()=>{const ts2=getTypeStyle(s.type);return<span style={{background:ts2.bg,color:ts2.color,borderRadius:99,padding:"1px 6px",fontSize:10,fontWeight:700,border:`1px solid ${ts2.border}`}}>{ts2.emoji}</span>;})()}
                              </div>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontWeight:900,fontSize:16,color:mc}}>{s.margin>=0?"+":""}{fmt(s.margin)}</div>
                              <div style={{fontSize:11,color:"#6B7280",marginTop:1}}>{fmtp(s.marginPct)}</div>
                            </div>
                          </SwipeRow>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{display:"flex",justifyContent:"center"}}>
                  <div className="card" style={{padding:"28px 32px",border:`1px solid ${C.red}30`,background:"rgba(254,242,242,0.6)",borderRadius:20,maxWidth:480,width:"100%",textAlign:"center"}}>
                    <div style={{fontSize:14,fontWeight:700,color:"#C53030",marginBottom:6}}>⚠️ {t('zoneDangereuse')}</div>
                    <div style={{fontSize:13,color:C.sub,marginBottom:20,lineHeight:1.6}}>{t('zoneDesc')}</div>
                    {resetStep===0&&(
                      <button onClick={handleReset} style={{padding:"10px 22px",background:"transparent",border:`1.5px solid ${C.red}99`,borderRadius:12,color:C.red,fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.2s",display:"block",margin:"0 auto"}}
                        onMouseEnter={e=>{e.currentTarget.style.background="rgba(229,62,62,0.08)";}}
                        onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}
                      >🗑️ {t('toutRemettre')}</button>
                    )}
                    {resetStep===1&&(
                      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"center"}}>
                        <div style={{fontSize:13,fontWeight:600,color:C.red}}>{t('confirmeAction')}</div>
                        <button onClick={handleReset} style={{padding:"10px 20px",background:C.red,border:"none",borderRadius:12,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.2s"}}>{t('ouiToutSupprimer')}</button>
                        <button onClick={()=>setResetStep(0)} style={{padding:"10px 20px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:12,color:C.sub,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.2s"}}>{t('annuler')}</button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab===1&&(
          <>
          <div className="ai-zone-header">
            <div className="ico-wrap">🤖</div>
            <div><div className="t">{lang==='en'?'AI Stock':'Stock IA'}</div><div className="d">{lang==='en'?'Manage your inventory with AI':'Gérez votre inventaire avec l\'IA'}</div></div>
          </div>
          <div style={window.innerWidth>=768?{display:"grid",gridTemplateColumns:"300px 1fr",gap:20,alignItems:"start",width:"100%"}:{display:"flex",flexDirection:"column",gap:16,width:"100%",boxSizing:"border-box"}}>
            <div style={{background:"#fff",borderRadius:12,padding:20,display:"flex",flexDirection:"column",gap:12,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              {/* ── Voice Capture ── */}
              {voiceStep==="done"&&voiceParsed?(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{background:voiceParsed.action==="achat"?"#E8F5F0":"#FFF4EE",color:voiceParsed.action==="achat"?"#1D9E75":"#F9A26C",borderRadius:99,padding:"4px 12px",fontSize:12,fontWeight:700,border:`1px solid ${voiceParsed.action==="achat"?"#C6E8DF":"#FDDCB5"}`}}>
                      {voiceParsed.action==="achat"?(lang==='fr'?"Achat":"Purchase"):(lang==='fr'?"Vente":"Sale")}
                    </span>
                    <span style={{fontSize:12,color:"#6B7280"}}>{voiceParsed.items.length} {lang==='fr'?`article${voiceParsed.items.length>1?"s":""}`:voiceParsed.items.length>1?"items":"item"} {lang==='fr'?"détecté(s)":"detected"}</span>
                    {voiceParsed.isLot&&(
                      <span style={{background:"#EFF6FF",color:"#1D4ED8",border:"1px solid #93C5FD",borderRadius:99,padding:"4px 12px",fontSize:12,fontWeight:700}}>
                        🛍️ {lang==='fr'?`Lot — ${voiceParsed.lotTotal}€ au total`:`Lot — €${voiceParsed.lotTotal} total`}
                      </span>
                    )}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {voiceParsed.items.map((item,i)=>{
                      const ts=getTypeStyle(item.categorie);
                      return(
                        <div key={i} style={{background:item.confidence<0.7?"#FFF4EE":"#F9FAFB",borderRadius:10,padding:"10px 12px",border:`1px solid ${item.confidence<0.7?"#FDDCB5":"rgba(0,0,0,0.06)"}`,display:"flex",flexDirection:"column",gap:4}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
                            <div style={{fontWeight:700,fontSize:13,color:C.text}}>
                              {item.nom}{item.marque&&<span style={{color:"#6B7280",fontWeight:600}}> · {item.marque}</span>}{item.type&&<span style={{color:"#A3A9A6",fontWeight:500}}> {item.type}</span>}
                            </div>
                            <span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:`1px solid ${ts.border}`,flexShrink:0}}>{ts.emoji} {typeLabel(item.categorie,lang)}</span>
                          </div>
                          <div style={{display:"flex",gap:12,fontSize:11,color:"#6B7280",flexWrap:"wrap",alignItems:"center"}}>
                            {voiceParsed.isLot?(
                              <span style={{display:"flex",alignItems:"center",gap:4}}>
                                🛒 <input type="number" value={item.prix_estime_lot??""} onChange={e=>{const v=parseFloat(e.target.value)||0;setVoiceParsed(prev=>({...prev,items:prev.items.map((it,idx)=>idx===i?{...it,prix_estime_lot:v}:it)}));}} style={{width:60,border:"1px solid #CBD5E0",borderRadius:6,padding:"2px 6px",fontSize:11,fontFamily:"inherit",outline:"none"}}/>€
                                <span style={{fontSize:10,color:"#9CA3AF",fontStyle:"italic"}}>{lang==='fr'?"Répartition estimée":"Estimated split"}</span>
                              </span>
                            ):(
                              <>
                                {item.prix_achat!==null&&<span>🛒 {item.prix_achat}€</span>}
                                {item.prix_vente!==null&&<span>💰 {item.prix_vente}€</span>}
                              </>
                            )}
                            {item.quantite>1&&<span>×{item.quantite}</span>}
                            {item.date&&<span>📅 {item.date}</span>}
                          </div>
                          {item.confidence<0.7&&<div style={{fontSize:11,color:"#F9A26C",fontWeight:700}}>{lang==='fr'?"⚠️ À vérifier":"⚠️ To verify"}</div>}
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={addItemsFromVoice} style={{width:"100%",padding:"12px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    {lang==='fr'?"✓ Ajouter à l'inventaire":"✓ Add to inventory"}
                  </button>
                  <button onClick={resetVoiceFlow} style={{width:"100%",padding:"12px",background:"transparent",color:"#6B7280",border:"1px solid rgba(0,0,0,0.1)",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    {lang==='fr'?"✗ Recommencer":"✗ Start over"}
                  </button>
                </div>
              ):voiceStep==="error"?(
                <div style={{display:"flex",flexDirection:"column",gap:10,alignItems:"center",padding:"8px 0"}}>
                  <div style={{fontSize:13,color:"#E53E3E",fontWeight:600,textAlign:"center"}}>{voiceError}</div>
                  <button onClick={resetVoiceFlow} style={{padding:"10px 20px",background:"#FEF2F2",color:"#E53E3E",border:"1px solid #FCA5A5",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    {lang==='fr'?"Réessayer":"Try again"}
                  </button>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:10,alignItems:"center"}}>
                  {voiceStep==="parsing"&&<div style={{fontSize:12,fontWeight:700,color:"#6B7280",textAlign:"center",lineHeight:1.4}}>{lang==='fr'?"🧠 Analyse en cours...":"🧠 Analyzing..."}</div>}
                  <textarea value={voiceText} onChange={e=>setVoiceText(e.target.value)} disabled={voiceLoading}
                    placeholder={lang==='fr'?"Ou tape : j'ai acheté une veste Zara 8€, des Nike 15€...":"Or type: I bought a Zara jacket 8€, Nike sneakers 15€..."}
                    rows={3} style={{width:"100%",padding:"10px 14px",borderRadius:12,border:`1.5px solid ${voiceText?C.teal:"rgba(0,0,0,0.1)"}`,fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",background:"#fff",transition:"border-color 0.15s",boxSizing:"border-box",lineHeight:1.5,color:C.text}}/>
                  <button onClick={()=>callVoiceParse(voiceText)} disabled={!voiceText.trim()||voiceLoading}
                    style={{width:"100%",padding:"12px",background:!voiceText.trim()||voiceLoading?"#E5E7EB":"linear-gradient(135deg,#4ECDC4,#1D9E75)",color:!voiceText.trim()||voiceLoading?"#9CA3AF":"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:!voiceText.trim()||voiceLoading?"not-allowed":"pointer",transition:"all 0.2s",fontFamily:"inherit"}}>
                    {lang==='fr'?"✨ Analyser":"✨ Analyze"}
                  </button>
                </div>
              )}
              {/* ── Toggle formulaire manuel ── */}
              <button onClick={()=>setShowManualForm(v=>!v)}
                style={{width:"100%",padding:"10px 14px",background:"transparent",border:"1px solid rgba(0,0,0,0.1)",borderRadius:10,fontSize:13,fontWeight:700,color:"#6B7280",cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="#F9FAFB"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}
              >
                {showManualForm?(lang==='fr'?"− Fermer le formulaire ▴":"− Close form ▴"):(lang==='fr'?"+ Ajouter manuellement ▾":"+ Add manually ▾")}
              </button>
              {showManualForm&&(<>
              {/* ── Mode toggle ── */}
              <div style={{display:"flex",background:"rgba(0,0,0,0.05)",borderRadius:99,padding:3}}>
                <button onClick={()=>{setManualMode("single");setLotDistributed(null);}} style={{flex:1,padding:"7px 12px",borderRadius:99,border:"none",fontSize:13,fontWeight:700,cursor:"pointer",background:manualMode==="single"?"#1D9E75":"transparent",color:manualMode==="single"?"#fff":"#6B7280",transition:"all 0.15s",fontFamily:"inherit"}}>
                  {lang==='fr'?"Article seul":"Single item"}
                </button>
                <button onClick={()=>setManualMode("lot")} style={{flex:1,padding:"7px 12px",borderRadius:99,border:"none",fontSize:13,fontWeight:700,cursor:"pointer",background:manualMode==="lot"?"#1D9E75":"transparent",color:manualMode==="lot"?"#fff":"#6B7280",transition:"all 0.15s",fontFamily:"inherit"}}>
                  Lot
                </button>
              </div>
              {manualMode==="single"&&(<>
              {items.length===0?(
                <div style={{textAlign:"center",paddingBottom:4,animation:"fadeIn 0.4s ease"}}>
                  <div style={{fontSize:28,marginBottom:8}}>🧩</div>
                  <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:6}}>{t('premierArticle')}</div>
                  <div style={{fontSize:13,color:C.sub,lineHeight:1.6}}>Entre le nom et ton prix d'achat. Tu pourras ajouter le prix de vente plus tard.</div>
                </div>
              ):(
                <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:4}}>{t('ajouterTitre')}</div>
              )}
              <div>
                <Field label="Nom" value={iTitle} set={setITitle} placeholder="Ex: Air Max 90, Jean slim, Lot vêtements..." icon="🏷️"/>
                {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>Le nom de l'article que tu veux suivre</div>}
              </div>
              <div>
                <Field label={lang==='fr'?"Quantité":"Quantity"} value={String(iQuantite)} set={v=>setIQuantite(Math.max(1,parseInt(v)||1))} placeholder="1" type="number" icon="🔢"/>
              </div>
              <div>
                <Field label={lang==='fr'?"Marque (optionnel)":"Brand (optional)"} value={iMarque} set={setIMarque} placeholder={lang==='en'?"Ex: Nike, Zara, H&M, Unbranded...":"Ex: Nike, Zara, H&M, Sans marque..."} icon="✏️"/>
              </div>
              <div>
                <select value={iType} onChange={e=>setIType(e.target.value)}
                  style={{background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:14,padding:"0 16px",height:58,fontSize:15,fontWeight:600,color:iType?"#0D0D0D":"#A3A9A6",width:"100%",cursor:"pointer",fontFamily:"inherit",outline:"none",appearance:"auto"}}>
                  <option value="">{(iTitle||iMarque)?(lang==='fr'?`🤖 Détecté : ${detectType(iTitle,iMarque)}`:`🤖 Detected: ${typeLabel(detectType(iTitle,iMarque),lang)}`):(lang==='fr'?'🤖 Détection automatique':'🤖 Auto-detection')}</option>
                  <option value="Mode">👗 {typeLabel('Mode',lang)}</option>
                  <option value="High-Tech">📱 High-Tech</option>
                  <option value="Maison">🏠 {typeLabel('Maison',lang)}</option>
                  <option value="Électroménager">⚡ {typeLabel('Électroménager',lang)}</option>
                  <option value="Luxe">💎 {typeLabel('Luxe',lang)}</option>
                  <option value="Jouets">🧸 {typeLabel('Jouets',lang)}</option>
                  <option value="Livres">📚 {typeLabel('Livres',lang)}</option>
                  <option value="Sport">⚽ Sport</option>
                  <option value="Auto-Moto">🚗 {typeLabel('Auto-Moto',lang)}</option>
                  <option value="Beauté">💄 {typeLabel('Beauté',lang)}</option>
                  <option value="Musique">🎵 Musique</option>
                  <option value="Collection">🏆 Collection</option>
                  <option value="Autre">📦 {typeLabel('Autre',lang)}</option>
                </select>
              </div>
              <div>
                <Field label={lang==='fr'?"Prix d'achat":"Purchase price"} value={iBuy} set={setIBuy} placeholder="0,00" type="number" icon="🛒" suffix="€"/>
                {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>{lang==='fr'?"Prix auquel tu as acheté l'article":"Price you paid for the item"}</div>}
              </div>
              <div>
                <Field label={lang==='fr'?"Frais d'achat (optionnel)":"Purchase fees (optional)"} value={iPurchaseCosts} set={setIPurchaseCosts} placeholder={lang==='fr'?"Livraison fournisseur, réparation...":"Supplier shipping, repair..."} type="number" icon="🛍️" suffix="€"/>
                {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>{lang==='fr'?"Frais liés à l'achat : livraison, réparation...":"Purchase-side costs: shipping, repair..."}</div>}
              </div>
              <div>
                <label onClick={()=>setIAlreadySold(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"12px 14px",background:iAlreadySold?"#E8F5F0":"#F9FAFB",borderRadius:12,border:`1.5px solid ${iAlreadySold?"#1D9E75":"rgba(0,0,0,0.1)"}`,transition:"all 0.2s",userSelect:"none"}}>
                  <div style={{width:36,height:20,borderRadius:10,background:iAlreadySold?"#1D9E75":"#D1D5DB",transition:"background 0.2s",position:"relative",flexShrink:0}}>
                    <div style={{position:"absolute",top:2,left:iAlreadySold?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
                  </div>
                  <span style={{fontSize:13,fontWeight:700,color:iAlreadySold?"#1D9E75":"#6B7280"}}>{lang==='fr'?'Déjà vendu ?':'Already sold?'}</span>
                </label>
              </div>
              {iAlreadySold&&(
                <>
                  <div>
                    <Field label={lang==='fr'?"Prix de vente":"Sell price"} value={iSell} set={setISell} placeholder="0,00" type="number" icon="💰" suffix="€"/>
                  </div>
                  <div>
                    <Field label={lang==='fr'?"Frais de vente (optionnel)":"Selling fees (optional)"} value={iSellingFees} set={setISellingFees} placeholder={lang==='fr'?"Commission Vinted, livraison client...":"Vinted fee, shipping to buyer..."} type="number" icon="📬" suffix="€"/>
                    <label style={{display:"flex",alignItems:"center",gap:8,marginTop:8,cursor:"pointer"}}>
                      <input type="checkbox" checked={iRememberSellingFees} onChange={e=>setIRememberSellingFees(e.target.checked)} style={{width:14,height:14,accentColor:C.teal,cursor:"pointer"}}/>
                      <span style={{fontSize:12,color:"#6B7280",userSelect:"none"}}>{lang==='fr'?'Mémoriser ces frais de vente':'Remember selling fees'}</span>
                    </label>
                  </div>
                </>
              )}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:6}}>📝 {lang==='fr'?"Description (optionnel)":"Description (optional)"}</div>
                <textarea
                  value={iDesc}
                  onChange={e=>setIDesc(e.target.value.slice(0,200))}
                  placeholder={lang==='fr'?"Ex: Lot de 3 pièces, taille M, état neuf...":"Ex: Bundle of 3, size M, brand new..."}
                  maxLength={200}
                  rows={2}
                  style={{width:"100%",padding:"10px 14px",borderRadius:14,border:`1.5px solid ${iDesc?C.teal:"rgba(0,0,0,0.12)"}`,fontSize:13,color:C.text,fontFamily:"inherit",resize:"none",outline:"none",background:"#fff",transition:"border-color 0.15s",boxSizing:"border-box",lineHeight:1.5}}
                  onFocus={e=>e.currentTarget.style.borderColor=C.teal}
                  onBlur={e=>e.currentTarget.style.borderColor=iDesc?C.teal:"rgba(0,0,0,0.12)"}
                />
                <div style={{fontSize:10,color:C.label,textAlign:"right",marginTop:2}}>{iDesc.length}/200</div>
              </div>
              {items.length>0&&(
                <div style={{background:C.rowBg,borderRadius:10,padding:"10px 14px",fontSize:11,color:C.sub,border:"1px solid rgba(0,0,0,0.06)",lineHeight:1.6}}>
                  💡 {t('prixHint')}
                </div>
              )}
              {!isPremium&&items.length>=18&&items.length<20&&(
                <div style={{background:"#FFFBEB",borderRadius:10,padding:"10px 14px",fontSize:11,color:"#92400E",border:"1px solid #FDE68A",fontWeight:600}}>
                  ⚠️ {lang==='fr'?`${20-items.length} article${20-items.length>1?"s":""} restant${20-items.length>1?"s":""} sur ton plan gratuit`:`${20-items.length} item${20-items.length>1?"s":""} remaining on your free plan`}
                </div>
              )}
              {!isPremium&&items.length>=20&&!isNative
                ? <PremiumBanner userEmail={user?.email}/>
                : !isPremium&&items.length>=20&&isNative
                ? null
                : <button className="btn-pill-primary" onClick={addItem} disabled={!iTitle||!iBuy||(iAlreadySold&&!iSell)} style={{opacity:(!iTitle||!iBuy||(iAlreadySold&&!iSell))?0.5:1}}>
                    {iSaved?(lang==='fr'?"✓ Ajouté !":"✓ Added!"):items.length===0?(lang==='fr'?"Ajoute ton premier article → vois ton bénéfice 🚀":"Add your first item → see your profit 🚀"):t('ajouterArticle')}
                  </button>
              }
              {isNative&&!isPremium&&items.length>=20&&(
                <IAPUpgradeBlock lang={lang} iapProduct={iapProduct} iapLoading={iapLoading} onPurchase={handleIAPPurchase} onRestore={handleIAPRestore}/>
              )}
              {items.length===0&&!iSaved&&!(iTitle&&iBuy)&&(
                <div style={{textAlign:"center",fontSize:12,color:C.label,marginTop:-4}}>
                  {lang==='fr'?'Tu es à 1 étape de voir tes premiers profits 💰':'You are 1 step away from seeing your first profits 💰'}
                </div>
              )}
              {items.length===0&&!iSaved&&iTitle&&iBuy&&(
                <div style={{textAlign:"center",fontSize:12,color:C.teal,fontWeight:600,marginTop:-4}}>
                  {lang==='fr'?'✓ Prêt ! Clique pour ajouter et voir ton bénéfice instantanément':'✓ Ready! Click to add and see your profit instantly'}
                </div>
              )}
              {firstItemAdded&&(
                <div style={{background:C.greenLight,borderRadius:10,padding:"10px 14px",fontSize:12,color:C.green,border:"1px solid #C6F6D5",fontWeight:600,textAlign:"center"}}>
                  {lang==='fr'?'✅ Article ajouté ! Tu peux maintenant enregistrer une vente.':'✅ Item added! You can now record a sale.'}
                </div>
              )}
              </>)}
              {manualMode==="lot"&&(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:6}}>🛍️ {lang==='fr'?"Prix total du lot (€)":"Total lot price (€)"}</div>
                    <div className="inp" style={{background:"#fff",borderRadius:14,padding:"0 16px",height:58,border:lotManualTotal?`1px solid ${C.teal}55`:"1px solid rgba(0,0,0,0.08)",display:"flex",alignItems:"center",gap:12,boxShadow:lotManualTotal?`0 0 0 3px ${C.teal}11`:"0 2px 8px rgba(0,0,0,0.04)"}}>
                      <span style={{fontSize:20,flexShrink:0,opacity:0.7}}>💰</span>
                      <input type="number" value={lotManualTotal} onChange={e=>setLotManualTotal(e.target.value)} placeholder="0,00" inputMode="decimal" style={{background:"transparent",border:"none",outline:"none",color:C.text,fontSize:15,fontWeight:600,flex:1,fontFamily:"inherit"}}/>
                      <span style={{color:C.label,fontSize:13,fontWeight:600}}>€</span>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {lotManualItems.map((lotItem,i)=>(
                      <div key={i} style={{display:"flex",flexDirection:"column",gap:4}}>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <input value={lotItem.nom} onChange={e=>{const v=e.target.value;setLotManualItems(prev=>prev.map((it,idx)=>idx===i?{...it,nom:v}:it));setLotDistributed(null);}}
                            placeholder={lang==='fr'?`Article ${i+1}`:`Item ${i+1}`}
                            style={{flex:1,padding:"10px 14px",borderRadius:10,border:"1px solid rgba(0,0,0,0.1)",fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff",color:C.text,transition:"border-color 0.15s"}}
                            onFocus={e=>e.currentTarget.style.borderColor=C.teal}
                            onBlur={e=>e.currentTarget.style.borderColor="rgba(0,0,0,0.1)"}
                          />
                          {lotManualItems.length>2&&(
                            <button onClick={()=>{setLotManualItems(prev=>prev.filter((_,idx)=>idx!==i));setLotDistributed(null);}} style={{background:"#FEF2F2",color:"#E53E3E",border:"1px solid #FCA5A5",borderRadius:8,padding:"8px 10px",fontSize:13,cursor:"pointer",fontFamily:"inherit",flexShrink:0,lineHeight:1}}>×</button>
                          )}
                        </div>
                        {lotDistributed?.items?.[i]&&(
                          <div style={{display:"flex",alignItems:"center",gap:8,paddingLeft:4,animation:"fadeIn 0.3s ease"}}>
                            <input type="number" value={lotDistributed.items[i].prix_estime_lot} onChange={e=>{const v=parseFloat(e.target.value)||0;setLotDistributed(prev=>({...prev,items:prev.items.map((it,idx)=>idx===i?{...it,prix_estime_lot:v}:it)}));}} style={{width:64,border:"1px solid #CBD5E0",borderRadius:6,padding:"2px 6px",fontSize:12,fontFamily:"inherit",outline:"none",fontWeight:700,color:C.green}}/>
                            <span style={{fontSize:12,color:C.label}}>€</span>
                            {lotDistributed.items[i].categorie&&(()=>{const ts=getTypeStyle(lotDistributed.items[i].categorie);return <span style={{background:ts.bg,color:ts.color,border:`1px solid ${ts.border}`,borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700}}>{ts.emoji} {typeLabel(lotDistributed.items[i].categorie,lang)}</span>;})()}
                            {lotDistributed.items[i].marque&&<span style={{fontSize:11,color:"#6B7280",fontWeight:600}}>{lotDistributed.items[i].marque}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>{setLotManualItems(prev=>[...prev,{nom:""}]);setLotDistributed(null);}} style={{padding:"8px",background:"transparent",border:"1px dashed rgba(0,0,0,0.2)",borderRadius:10,fontSize:13,fontWeight:700,color:"#6B7280",cursor:"pointer",fontFamily:"inherit",width:"100%",transition:"all 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#F9FAFB"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                  >+ {lang==='fr'?"Ajouter un article":"Add item"}</button>
                  <button onClick={handleLotDistribute} disabled={lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())}
                    style={{width:"100%",padding:"13px",background:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"#E5E7EB":"linear-gradient(135deg,#4ECDC4,#1D9E75)",color:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"#9CA3AF":"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"not-allowed":"pointer",transition:"all 0.2s",fontFamily:"inherit"}}>
                    {lotDistributing?(lang==='fr'?"⏳ Répartition en cours...":"⏳ Distributing..."):(lang==='fr'?"✨ Répartir automatiquement":"✨ Auto distribute")}
                  </button>
                  {lotDistributed&&(
                    <>
                      <div style={{fontSize:12,color:"#6B7280",textAlign:"center",fontStyle:"italic"}}>{lang==='fr'?"Répartition estimée — modifiable":"Estimated split — editable"}</div>
                      <button onClick={addLotToInventory} style={{width:"100%",padding:"13px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{lang==='fr'?"✓ Ajouter le lot à l'inventaire":"✓ Add lot to inventory"}</button>
                    </>
                  )}
                </div>
              )}
              </>)}
            </div>

            <div ref={listRef} style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:16}}>

              {/* ── Barre Import / Export ── */}
              {isPremium?(
                <div style={{background:"#fff",borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                  <div style={{flex:1,fontSize:13,fontWeight:700,color:C.text}}>{t('outilsPremium')}</div>
                  <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={handleImportFile}/>
                  <button onClick={()=>importRef.current?.click()} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:C.tealLight,color:C.teal,border:`1px solid ${C.teal}44`,borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#C6EBE9"}
                    onMouseLeave={e=>e.currentTarget.style.background=C.tealLight}
                  >📥 {t('importer')}</button>
                  <button onClick={handleExport} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:"#EDF2F7",color:C.sub,border:"1px solid rgba(0,0,0,0.1)",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#E2E8F0"}
                    onMouseLeave={e=>e.currentTarget.style.background="#EDF2F7"}
                  >📤 {t('exporter')}</button>
                  {importMsg&&<div style={{width:"100%",fontSize:12,color:C.green,fontWeight:600,marginTop:2}}>{importMsg}</div>}
                </div>
              ):(
                <div onClick={()=>{if(!isNative){track('premium_click',{source:'import_export'});triggerCheckout();}}}
                  style={{background:"linear-gradient(135deg,#1D9E7508,#E8956D08)",borderRadius:14,padding:"16px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:10,textAlign:"center",border:"1px solid rgba(232,149,109,0.22)",boxShadow:"0 2px 10px rgba(0,0,0,0.05)",cursor:!isNative?"pointer":"default"}}>
                  <div style={{fontSize:14,fontWeight:800,color:"#111827"}}>{t('importExcel')}</div>
                  <div style={{fontSize:11,color:"#6B7280",opacity:0.8,lineHeight:1.5}}>{t('importDesc')}</div>
                  {!isNative&&<PremiumBanner userEmail={user?.email} compact/>}
                </div>
              )}

              {/* ── Barre de recherche + Filtres type ── */}
              <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"10px 16px"}}>
                <span style={{fontSize:14,flexShrink:0}}>🔍</span>
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder={lang==='fr'?"Rechercher...":"Search..."}
                  style={{flex:1,border:"none",outline:"none",fontSize:14,background:"transparent",fontFamily:"inherit",color:"#0D0D0D"}}/>
                {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#A3A9A6",flexShrink:0,padding:0,lineHeight:1}}>✕</button>}
              </div>
              {(()=>{
                const allItems=[...stock,...sold];
                const presentTypes=["Tous","Mode","Luxe","High-Tech","Maison","Électroménager","Jouets","Livres","Sport","Auto-Moto","Beauté","Musique","Collection","Autre"].filter(t=>t==="Tous"||allItems.some(i=>i.type===t));
                const cpClass=tp=>tp==="Tous"?"cp-all":tp==="Mode"?"cp-mode":tp==="High-Tech"?"cp-tech":tp==="Luxe"?"cp-luxe":tp==="Maison"?"cp-maison":tp==="Sport"?"cp-sport":"cp-autre";
                return presentTypes.length>1&&(
                  <div className="filter-row">
                    {presentTypes.map(tp=>{
                      const ts=tp==="Tous"?{emoji:""}:getTypeStyle(tp);
                      return(
                        <button key={tp} onClick={()=>setFilterType(tp)}
                          className={`cat-pill ${cpClass(tp)}${filterType===tp?' on':''}`}>
                          {tp==="Tous"?(lang==='en'?'All':tp):`${ts.emoji} ${typeLabel(tp,lang)}`}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ── VENDUS (en premier) ── */}
              <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D"}}>{t('vendus')}</div>
                  <div style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{tpl('venteLabel',{n:sold.length})}</div>
                </div>
                {(()=>{const marquesFiltreesParType=["Toutes",...new Set(sold.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];return marquesFiltreesParType.length>1&&(
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                    {marquesFiltreesParType.map(m=>(
                      <button key={m} onClick={()=>setFilterMarqueSold(m)}
                        style={{padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",transition:"all 0.15s",
                          background:filterMarqueSold===m?"#1D9E75":"#F3F4F6",
                          color:filterMarqueSold===m?"#fff":"#6B7280"}}>
                        {m==="Toutes"?(lang==='en'?'All':'Toutes'):marqueLabel(m,lang)}
                      </button>
                    ))}
                  </div>
                );})()}
                {sold.length===0?<Empty text={lang==='fr'?"Aucune vente encore":"No sales yet"}/>:(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {soldVisible.map(item=>{
                      const mc=getMargeColor(item.marginPct);
                      const ts=getTypeStyle(item.type);
                      return(
                        <SwipeRow key={item.id} onDelete={()=>delItem(item.id)} onEdit={()=>setEditItem({...item,frais:0,sell:item.sell??""})} style={{borderLeft:`3px solid ${getCatBorder(item.type)}`}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                              <div style={{fontWeight:700,fontSize:14,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                              {item.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #9FE1CB"}}>{marqueLabel(item.marque,lang)}</span>}
                              {item.type&&item.type!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(item.type,lang)}</span>}
                            </div>
                            <div style={{fontSize:11,color:"#A3A9A6",marginTop:2}}>{lang==='fr'?'Achat':'Bought'} {fmt(item.buy+(item.purchaseCosts||0))} → {lang==='fr'?'Vente':'Sold'} {fmt(item.sell)}</div>
                          </div>
                          <div style={{textAlign:"right",minWidth:90,flexShrink:0}}>
                            <div style={{fontWeight:900,fontSize:18,color:mc}}>{fmt(item.margin)}</div>
                            <div style={{fontSize:11,color:"#6B7280",marginTop:1}}>{fmtp(item.marginPct)}</div>
                          </div>
                        </SwipeRow>
                      );
                    })}
                    {soldFiltre.length>10&&!soldShowAll&&(
                      <button onClick={()=>setSoldShowAll(true)} style={{width:"100%",padding:"10px",background:"#F3F4F6",border:"none",borderRadius:10,fontSize:12,fontWeight:700,color:"#6B7280",cursor:"pointer",marginTop:4}}>
                        {lang==='fr'?`Voir plus (${soldFiltre.length-10} articles)`:`Show more (${soldFiltre.length-10} items)`}
                      </button>
                    )}
                  <div style={{height:24}}/>
                  </div>
                )}
              </div>

              {/* ── EN STOCK ── */}
              <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D"}}>{t('enStockLabel')}</div>
                    {!isPremium&&items.length>=20&&<span style={{fontSize:10,fontWeight:700,background:"#FFF4EE",color:"#F9A26C",borderRadius:99,padding:"2px 8px",border:"1px solid #F9A26C44"}}>{lang==='fr'?'Plan gratuit':'Free plan'}</span>}
                  </div>
                  <div style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{stock.length} {lang==='fr'?'art.':'items'} · {fmt(stockVal)}</div>
                </div>
                {(()=>{const marquesStockFiltreesParType=["Toutes",...new Set(stock.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];return marquesStockFiltreesParType.length>1&&(
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                    {marquesStockFiltreesParType.map(m=>(
                      <button key={m} onClick={()=>setFilterMarque(m)}
                        style={{padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",transition:"all 0.15s",
                          background:filterMarque===m?"#1D9E75":"#F3F4F6",
                          color:filterMarque===m?"#fff":"#6B7280"}}>
                        {m==="Toutes"?(lang==='en'?'All':'Toutes'):marqueLabel(m,lang)}
                      </button>
                    ))}
                  </div>
                );})()}
                {stock.length===0?(
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 16px",gap:12}}>
                    <span style={{fontSize:40}}>📦</span>
                    <div style={{fontSize:18,fontWeight:900,color:"#0D0D0D",letterSpacing:"-0.02em",textAlign:"center"}}>{t('premierArticle')}</div>
                    <div style={{fontSize:13,fontWeight:700,color:"#A3A9A6",textAlign:"center",maxWidth:200,lineHeight:1.5}}>{t('commenceSuivi')}</div>
                    <button onClick={()=>{scrollRef.current?.scrollTo({top:0,behavior:"smooth"});setTimeout(()=>document.querySelector('.inp input')?.focus(),300);}}
                      style={{background:"#1D9E75",color:"#fff",border:"none",borderRadius:12,fontWeight:800,fontSize:14,padding:"12px 24px",marginTop:8,cursor:"pointer",transition:"all 0.15s",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(29,158,117,0.3)"}}
                      onMouseDown={e=>e.currentTarget.style.transform="scale(0.95)"}
                      onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
                      onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
                    >{t('ajouterArticle')} 🚀</button>
                  </div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {stockVisible.map(item=>{
                      const ts=getTypeStyle(item.type);
                      return(
                      <SwipeRow key={item.id} onDelete={()=>delItem(item.id)} onEdit={()=>setEditItem({...item,frais:0,sell:item.sell??""})} style={{borderLeft:`3px solid ${getCatBorder(item.type)}`}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <div style={{fontWeight:700,fontSize:14,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                            {item.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #9FE1CB"}}>{marqueLabel(item.marque,lang)}</span>}
                            {item.type&&item.type!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(item.type,lang)}</span>}
                            {item.quantite>1&&<span style={{background:"#FFF4EE",color:"#F9A26C",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid rgba(249,162,108,0.3)"}}>×{item.quantite}</span>}
                          </div>
                          {item.description&&<div style={{fontSize:11,color:"#A3A9A6",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>{item.description}</div>}
                          <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",marginTop:2}}>{lang==='fr'?'Investi':'Invested'} <span style={{color:"#F9A26C",fontWeight:700}}>{fmt(item.buy*(item.quantite||1)+(item.purchaseCosts||0))}</span></div>
                        </div>
                        <div style={{paddingRight:36,flexShrink:0}}>
                          <button onClick={(e)=>{e.stopPropagation();markSold(item);}} style={{background:"#E8F5F0",color:"#1D9E75",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{lang==='fr'?'Vendu':'Sold'}</button>
                        </div>
                      </SwipeRow>
                    );})}
                    {stockFiltre.length>10&&!showAllStock&&(
                      <button onClick={()=>setShowAllStock(true)} style={{width:"100%",padding:"10px",background:"#F3F4F6",border:"none",borderRadius:10,fontSize:12,fontWeight:700,color:"#6B7280",cursor:"pointer",marginTop:4}}>
                        {lang==='fr'?`Voir plus (${stockFiltre.length-10} articles)`:`Show more (${stockFiltre.length-10} items)`}
                      </button>
                    )}
                  <div style={{height:24}}/>
                  </div>
                )}
              </div>
            </div>
          </div>
          </>
        )}

        {tab===2&&(
          <div style={{maxWidth:520,margin:"0 auto",display:"flex",flexDirection:"column",gap:14}}>

            {/* ── Badge header ── */}
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:18}}>🎯</span>
              <span style={{fontSize:13,fontWeight:800,color:'#1D9E75'}}>{lang==='en'?'Analyzed by AI':'Analysé par l\'IA'}</span>
            </div>

            {/* ── Profit hero ── */}
            {isValid?(
              <div className="profit-hero">
                <div className="lbl">{margin>=0?t('profitEstime'):t('perteEstimee')}</div>
                <div className="amt" style={{color:margin>=0?'#fff':'#FCA5A5'}}>{fmt(margin)}</div>
                <div className="meta">
                  <span>{fmtp(marginPct)}</span>
                  <span className="delta">{getMargeMessage(marginPct,margin,lang).msg}</span>
                </div>
              </div>
            ):(
              <div style={{background:'#fff',borderRadius:14,padding:'20px',textAlign:'center',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
                <div style={{fontSize:36,marginBottom:10}}>🧮</div>
                <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>{t('calculerHero')}</div>
                <div style={{fontSize:13,color:C.sub}}>{t('calculerSub')}</div>
              </div>
            )}

            {/* ── Deal Score ── */}
            <DealScoreCard result={dealScore} analysis={dealAnalysis} analysisLoading={dealAnalysisLoading} lang={lang}/>

            {/* ── field-card inputs ── */}
            <div className="field-card">
              <div className="row">
                <div className="ico">🏷️</div>
                <div className="meta">
                  <div className="lbl">{t('nomArticle')}</div>
                  <input value={cTitle} onChange={e=>setCTitle(e.target.value)} placeholder="Ex: Nike Air Max 90"/>
                </div>
              </div>
            </div>
            <div className="field-card">
              <div className="row">
                <div className="ico">🛒</div>
                <div className="meta">
                  <div className="lbl">{t('prixAchat')}</div>
                  <input type="number" inputMode="decimal" value={cBuy} onChange={e=>setCBuy(e.target.value)} placeholder="0,00"/>
                </div>
                <div className="suf">€</div>
              </div>
            </div>
            <div className="field-card">
              <div className="row">
                <div className="ico">💰</div>
                <div className="meta">
                  <div className="lbl">{t('prixVente')}</div>
                  <input type="number" inputMode="decimal" value={cSell} onChange={e=>setCSell(e.target.value)} placeholder="0,00"/>
                </div>
                <div className="suf">€</div>
              </div>
            </div>
            <div className="field-card">
              <div className="row">
                <div className="ico">➕</div>
                <div className="meta">
                  <div className="lbl">{t('fraisAnnexes')}</div>
                  <input type="number" inputMode="decimal" value={cShip} onChange={e=>setCShip(e.target.value)} placeholder="0,00"/>
                </div>
                <div className="suf">€</div>
              </div>
            </div>
            <div style={{fontSize:11,color:C.label,marginTop:-4,paddingLeft:4}}>{t('fraisHint')}</div>

            {/* ── CTA ── */}
            <Btn onClick={addSale} disabled={!isValid} color={cSaved?"#38A169":"#1D9E75"} full>
              {cSaved?(lang==='fr'?"✓ Ajouté à ton suivi !":"✓ Added to your tracker!"):t('ajouterSuivi')}
            </Btn>

            {!isPremium&&!isNative&&(
              <PremiumBanner userEmail={user?.email}/>
            )}
            {isNative&&!isPremium&&(
              <IAPUpgradeBlock lang={lang} iapProduct={iapProduct} iapLoading={iapLoading} onPurchase={handleIAPPurchase} onRestore={handleIAPRestore}/>
            )}
          </div>
        )}

        {tab===3&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>

            {/* ── Header stats ── */}
            {sales.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:4}}>
                {[
                  {label:t('profitTotal'),value:fmt(totalM),color:totalM>=0?"#1D9E75":C.red},
                  {label:t('ventes'),value:salesForKpis.length,color:"#4ECDC4"},
                  {label:t('profitMoyen'),value:fmt(salesForKpis.length?totalM/salesForKpis.length:0),color:"#5DCAA5"},
                ].map((s,i)=>(
                  <div key={i} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",textAlign:"center"}}>
                    <div style={{fontSize:10,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{s.label}</div>
                    <div style={{fontSize:18,fontWeight:900,color:s.color,letterSpacing:"-0.03em"}}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {sales.length>0&&(
              <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"10px 16px",marginBottom:4}}>
                <span style={{fontSize:14,flexShrink:0}}>🔍</span>
                <input value={searchHistory} onChange={e=>setSearchHistory(e.target.value)}
                  placeholder={lang==='fr'?"Rechercher par nom, marque, description...":"Search by name, brand, description..."}
                  style={{flex:1,border:"none",outline:"none",fontSize:14,background:"transparent",fontFamily:"inherit",color:"#0D0D0D"}}/>
                {searchHistory&&<button onClick={()=>setSearchHistory("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#A3A9A6",flexShrink:0,padding:0,lineHeight:1}}>✕</button>}
              </div>
            )}

            {sales.length===0?(
              <div>
                <div className="card" style={{padding:"48px 28px",textAlign:"center",marginBottom:12,display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
                  <span style={{fontSize:40}}>💸</span>
                  <div style={{fontSize:18,fontWeight:900,color:"#0D0D0D",letterSpacing:"-0.02em"}}>{t('premiereVente')}</div>
                  <div style={{fontSize:13,fontWeight:700,color:"#A3A9A6",maxWidth:200,lineHeight:1.5}}>{t('profitsApparaitront')}</div>
                </div>

                {!isPremium&&!isNative&&(
                  <PremiumBanner userEmail={user?.email}/>
                )}
                {isNative&&!isPremium&&(
                  <IAPUpgradeBlock lang={lang} iapProduct={iapProduct} iapLoading={iapLoading} onPurchase={handleIAPPurchase} onRestore={handleIAPRestore}/>
                )}
              </div>
            ):(
              <>
                {visibleSales.map(s=>{
                  const d=new Date(s.date);const mc=getMargeColor(s.marginPct);const ts=getTypeStyle(s.type);
                  return(
                    <SwipeRow key={s.id} onDelete={()=>delSale(s.id)} style={{borderLeft:`4px solid ${mc}`}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:14,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
                          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</span>
                          {(s._qty||1)>1&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 6px",fontSize:10,fontWeight:800,flexShrink:0,border:"1px solid #9FE1CB"}}>×{s._qty}</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginTop:2}}>
                          <span style={{fontSize:11,color:"#A3A9A6"}}>{d.getDate()} {(lang==='en'?MONTHS_EN:MONTHS_FR)[d.getMonth()]} {d.getFullYear()}</span>
                          {s.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{marqueLabel(s.marque,lang)}</span>}
                          {s.type&&s.type!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(s.type,lang)}</span>}
                        </div>
                      </div>
                      <div style={{flex:1,textAlign:"center",display:window.innerWidth>=768?"block":"none",padding:"0 8px"}}>
                        <div style={{fontSize:12,color:"#A3A9A6"}}>{fmt(s.buy)} → {fmt(s.sell)}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontWeight:700,fontSize:14,color:"#0D0D0D"}}>{fmt(s.sell)}</div>
                        <div style={{fontWeight:800,fontSize:13,color:mc,marginTop:1}}>{s.margin>=0?"+":""}{fmt(s.margin)}</div>
                        <div style={{fontSize:11,color:"#6B7280",marginTop:1}}>{fmtp(s.marginPct)}</div>
                      </div>
                    </SwipeRow>
                  );
                })}
                {!showAllSales&&groupedSales.length>10&&(
                  <button onClick={()=>setShowAllSales(true)}
                    style={{width:"100%",padding:"12px",background:"transparent",border:"1px solid rgba(0,0,0,0.1)",borderRadius:12,color:"#6B7280",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    {lang==='fr'?`Voir plus (${groupedSales.length-10} autres)`:`Show more (${groupedSales.length-10} more)`}
                  </button>
                )}
                {!isPremium&&!isNative&&(
                  <PremiumBanner userEmail={user?.email}/>
                )}
                {isNative&&!isPremium&&(
                  <IAPUpgradeBlock lang={lang} iapProduct={iapProduct} iapLoading={iapLoading} onPurchase={handleIAPPurchase} onRestore={handleIAPRestore}/>
                )}
              </>
            )}

            {/* ── Bouton stats avancées ── */}
            {isPremium&&(
              <button onClick={()=>{setTab(4);localStorage.setItem('tab',4);}}
                style={{width:"100%",marginTop:4,padding:"14px",background:"#0F6E56",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit",transition:"all 0.15s",boxShadow:"0 4px 14px rgba(15,110,86,0.3)"}}
                onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
                onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
                onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
              >{t('statsAvancees')}</button>
            )}
          </div>
        )}

        {tab===4&&(
          <StatsTab sales={sales} items={items} lang={lang}/>
        )}
      </div>

      {/* ── EDIT MODAL ── */}
      {editItem&&(
        <>
          <div onClick={()=>setEditItem(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",zIndex:200}}/>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:201,background:"#fff",borderRadius:20,padding:"28px",width:"min(92vw,480px)",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",maxHeight:"88vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:800,color:C.text}}>✏️ {lang==='fr'?"Modifier l'article":"Edit item"}</div>
              <button onClick={()=>setEditItem(null)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",color:C.sub}}>✕</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <Field label={lang==='fr'?"Nom":"Name"} value={editItem.title} set={v=>setEditItem(p=>({...p,title:v}))} placeholder="Ex: Air Max 90..." icon="🏷️"/>
              <Field label={lang==='fr'?"Marque (optionnel)":"Brand (optional)"} value={editItem.marque||""} set={v=>setEditItem(p=>({...p,marque:v}))} placeholder="Ex: Nike, Zara..." icon="✏️"/>
              <select value={editItem.type||""} onChange={e=>setEditItem(p=>({...p,type:e.target.value}))}
                style={{background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:14,padding:"0 16px",height:58,fontSize:15,fontWeight:600,color:editItem.type?"#0D0D0D":"#A3A9A6",width:"100%",cursor:"pointer",fontFamily:"inherit",outline:"none",appearance:"auto"}}>
                <option value="">{(editItem.title||editItem.marque)?(lang==='fr'?`🤖 Détecté : ${detectType(editItem.title,editItem.marque)}`:`🤖 Detected: ${typeLabel(detectType(editItem.title,editItem.marque),lang)}`):(lang==='fr'?'🤖 Détection automatique':'🤖 Auto-detection')}</option>
                <option value="Luxe">💎 {typeLabel('Luxe',lang)}</option>
                <option value="Mode">👗 {typeLabel('Mode',lang)}</option>
                <option value="High-Tech">📱 High-Tech</option>
                <option value="Maison">🏠 {typeLabel('Maison',lang)}</option>
                <option value="Électroménager">⚡ {typeLabel('Électroménager',lang)}</option>
                <option value="Jouets">🧸 {typeLabel('Jouets',lang)}</option>
                <option value="Livres">📚 {typeLabel('Livres',lang)}</option>
                <option value="Sport">⚽ Sport</option>
                <option value="Auto-Moto">🚗 {typeLabel('Auto-Moto',lang)}</option>
                <option value="Beauté">💄 {typeLabel('Beauté',lang)}</option>
                <option value="Musique">🎵 Musique</option>
                <option value="Collection">🏆 Collection</option>
                <option value="Autre">📦 {typeLabel('Autre',lang)}</option>
              </select>
              <Field label={lang==='fr'?"Prix d'achat":"Purchase price"} value={String(editItem.buy??"")} set={v=>setEditItem(p=>({...p,buy:v}))} placeholder="0,00" type="number" icon="🛒" suffix="€"/>
              <Field label={lang==='fr'?"Prix de vente (optionnel)":"Sell price (optional)"} value={String(editItem.sell??"")} set={v=>setEditItem(p=>({...p,sell:v}))} placeholder={lang==='fr'?"Vide = en stock":"Empty = in stock"} type="number" icon="💰" suffix="€"/>
              <Field label={lang==='fr'?"Frais (optionnel)":"Fees (optional)"} value={String(editItem.frais??"")} set={v=>setEditItem(p=>({...p,frais:v}))} placeholder="0,00" type="number" icon="📬" suffix="€"/>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:6}}>📝 {lang==='fr'?"Description (optionnel)":"Description (optional)"}</div>
                <textarea value={editItem.description||""} onChange={e=>setEditItem(p=>({...p,description:e.target.value.slice(0,200)}))}
                  placeholder={lang==='fr'?"Ex: Lot de 3 pièces, taille M...":"Ex: Bundle of 3, size M..."}
                  maxLength={200} rows={2}
                  style={{width:"100%",padding:"10px 14px",borderRadius:14,border:`1.5px solid ${editItem.description?C.teal:"rgba(0,0,0,0.12)"}`,fontSize:13,color:C.text,fontFamily:"inherit",resize:"none",outline:"none",background:"#fff",transition:"border-color 0.15s",boxSizing:"border-box",lineHeight:1.5}}
                  onFocus={e=>e.currentTarget.style.borderColor=C.teal}
                  onBlur={e=>e.currentTarget.style.borderColor=editItem.description?C.teal:"rgba(0,0,0,0.12)"}
                />
                <div style={{fontSize:10,color:C.label,textAlign:"right",marginTop:2}}>{(editItem.description||"").length}/200</div>
              </div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button onClick={handleEditSave} style={{flex:1,padding:"13px",background:`linear-gradient(135deg,${C.teal},${C.peach})`,color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",transition:"all 0.2s"}}>
                {lang==='fr'?"💾 Enregistrer":"💾 Save"}
              </button>
              <button onClick={()=>setEditItem(null)} style={{padding:"13px 20px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:12,color:C.sub,fontSize:14,fontWeight:600,cursor:"pointer"}}>
                {t('annuler')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── SELL MODAL ── */}
      {sellModal&&(
        <>
          <div onClick={()=>setSellModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",zIndex:200}}/>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:201,background:"#fff",borderRadius:20,padding:"28px",width:"min(92vw,400px)",boxShadow:"0 24px 80px rgba(0,0,0,0.2)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:800,color:C.text}}>💰 {t('marquerVendu')}</div>
              <button onClick={()=>setSellModal(null)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",color:C.sub}}>✕</button>
            </div>
            <div style={{fontSize:13,fontWeight:600,color:C.sub,marginBottom:16,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sellModal.item.title}</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <Field label={t('prixDeVente')} value={sellModal.sellPrice} set={v=>setSellModal(p=>({...p,sellPrice:v}))} placeholder="0,00" type="number" icon="💰" suffix="€"/>
              {(sellModal.item.quantite||1)>1&&(
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:13,fontWeight:600,color:C.sub,flex:1}}>{lang==='fr'?'Quantité à vendre':'Quantity to sell'}</span>
                  <input type="number" min={1} max={sellModal.item.quantite} value={sellModal.sellQty??1}
                    onFocus={e=>e.target.select()}
                    onChange={e=>setSellModal(p=>({...p,sellQty:Math.max(1,Math.min(parseInt(e.target.value)||1,p.item.quantite))}))}
                    style={{width:70,fontSize:13,fontWeight:700,border:"1px solid rgba(0,0,0,0.15)",borderRadius:8,padding:"8px 10px",textAlign:"center",fontFamily:"inherit"}}/>
                  <span style={{fontSize:12,color:C.sub}}>/ {sellModal.item.quantite}</span>
                </div>
              )}
              {(sellModal.sellQty||1)>1&&(
                <>
                  <div style={{display:"flex",gap:6}}>
                    {["total","unit"].map(m=>(
                      <button key={m} onClick={()=>setSellModal(p=>({...p,prixMode:m}))}
                        style={{flex:1,padding:"7px 0",fontSize:11,fontWeight:700,borderRadius:8,border:`1px solid ${C.teal}`,background:sellModal.prixMode===m?C.teal:"transparent",color:sellModal.prixMode===m?"#fff":C.teal,cursor:"pointer",fontFamily:"inherit"}}>
                        {m==="total"?(lang==='fr'?'Prix total lot':'Total lot price'):(lang==='fr'?'Prix par unité':'Price per unit')}
                      </button>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {["total","unit"].map(m=>(
                      <button key={m} onClick={()=>setSellModal(p=>({...p,feesMode:m}))}
                        style={{flex:1,padding:"7px 0",fontSize:11,fontWeight:700,borderRadius:8,border:"1px solid #F9A26C",background:sellModal.feesMode===m?"#F9A26C":"transparent",color:sellModal.feesMode===m?"#fff":"#F9A26C",cursor:"pointer",fontFamily:"inherit"}}>
                        {m==="total"?(lang==='fr'?'Frais sur le total':'Fees on total'):(lang==='fr'?'Frais par unité':'Fees per unit')}
                      </button>
                    ))}
                  </div>
                  {parseFloat(sellModal.sellPrice)>0&&(
                    <div style={{fontSize:11,color:"#6B7280",textAlign:"center",background:"#F9FAFB",borderRadius:6,padding:"4px 0"}}>
                      {sellModal.prixMode==="total"
                        ?`= ${(parseFloat(sellModal.sellPrice)/(sellModal.sellQty||1)).toFixed(2)}€ ${lang==='fr'?'/ unité':'/ unit'}`
                        :`= ${(parseFloat(sellModal.sellPrice)*(sellModal.sellQty||1)).toFixed(2)}€ total`}
                    </div>
                  )}
                </>
              )}
              <Field label={`${lang==='fr'?'Frais de vente':'Selling fees'} (${lang==='fr'?'optionnel':'optional'})`} value={sellModal.sellingFees} set={v=>setSellModal(p=>({...p,sellingFees:v}))} placeholder={lang==='fr'?"Commission Vinted, livraison client...":"Vinted fee, shipping to buyer..."} type="number" icon="📬" suffix="€"/>
              <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
                <input type="checkbox" checked={sellModal.rememberFees} onChange={e=>setSellModal(p=>({...p,rememberFees:e.target.checked}))} style={{width:16,height:16,accentColor:C.teal,cursor:"pointer",flexShrink:0}}/>
                <span style={{fontSize:12,fontWeight:600,color:C.sub}}>{t('memoriserFrais')}</span>
              </label>
            </div>
            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button onClick={confirmSell} disabled={!sellModal.sellPrice||parseFloat(sellModal.sellPrice)<=0} style={{flex:1,padding:"13px",background:!sellModal.sellPrice||parseFloat(sellModal.sellPrice)<=0?"#E5E7EB":`linear-gradient(135deg,${C.teal},${C.peach})`,color:!sellModal.sellPrice||parseFloat(sellModal.sellPrice)<=0?"#9CA3AF":"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:!sellModal.sellPrice||parseFloat(sellModal.sellPrice)<=0?"not-allowed":"pointer",transition:"all 0.2s"}}>
                {t('confirmer')} ✓
              </button>
              <button onClick={()=>setSellModal(null)} style={{padding:"13px 20px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:12,color:C.sub,fontSize:14,fontWeight:600,cursor:"pointer"}}>
                {t('annuler')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── IMPORT MODAL ── */}
      {importModal&&(
        <>
          <div onClick={()=>setImportModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",zIndex:200}}/>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:201,background:"#fff",borderRadius:20,padding:"28px",width:"min(90vw,540px)",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:800,color:C.text}}>📥 {lang==='fr'?"Confirmer l'import":"Confirm import"}</div>
              <button onClick={()=>setImportModal(null)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",color:C.sub}}>✕</button>
            </div>

            {/* ÉTAPE 6 : Mapping détecté */}
            <div style={{background:C.rowBg,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
                {lang==='fr'?'Correspondance':'Mapping'} — <span style={{color:C.teal}}>{lang==='fr'?`${importModal.sheetsRead} feuille${importModal.sheetsRead>1?"s":""} lue${importModal.sheetsRead>1?"s":""}, ${importModal.validCount} ligne${importModal.validCount>1?"s":""} valide${importModal.validCount>1?"s":""} trouvée${importModal.validCount>1?"s":""}`:`${importModal.sheetsRead} sheet${importModal.sheetsRead>1?"s":""} read, ${importModal.validCount} valid row${importModal.validCount>1?"s":""} found`}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {/* Titre (peut être multiple) */}
                <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,flexWrap:"wrap"}}>
                  <span style={{fontSize:14,flexShrink:0}}>🏷️</span>
                  <span style={{color:C.sub,minWidth:106,flexShrink:0}}>{lang==='fr'?'Titre / Nom * :':'Title / Name * :'}</span>
                  {importModal.mapping.titres.length>0
                    ? <span style={{fontWeight:700,color:C.teal,flex:1}}>{importModal.mapping.titres.map(h=>`« ${h} »`).join(' + ')}</span>
                    : <select value="" onChange={e=>setImportModal(m=>({...m,mapping:{...m.mapping,titres:e.target.value?[e.target.value]:[]}}))}
                        style={{flex:1,fontSize:12,padding:"4px 8px",borderRadius:8,border:"1px solid #CBD5E0",background:"#fff",color:C.text,cursor:"pointer"}}>
                        <option value="">{lang==='fr'?'— Choisir une colonne —':'— Choose a column —'}</option>
                        {importModal.headers.map(h=><option key={h} value={h}>{h}</option>)}
                      </select>
                  }
                </div>
                {/* Prix achat */}
                {/* Date + Marque — lignes fixes */}
                <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,flexWrap:"wrap"}}>
                  <span style={{fontSize:14,flexShrink:0}}>📅</span>
                  <span style={{color:C.sub,minWidth:106,flexShrink:0}}>{lang==='fr'?'Date :':'Date:'}</span>
                  <span style={{fontWeight:700,color:importModal.mapping.date?C.teal:"#A3A9A6",flex:1}}>
                    {importModal.mapping.date?`✓ « ${importModal.mapping.date} »`:(lang==='fr'?"— non détectée —":"— not detected —")}
                  </span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,flexWrap:"wrap"}}>
                  <span style={{fontSize:14,flexShrink:0}}>🏷️</span>
                  <span style={{color:C.sub,minWidth:106,flexShrink:0}}>{lang==='fr'?'Marque :':'Brand:'}</span>
                  <span style={{fontWeight:700,color:"#A3A9A6",flex:1}}>
                    {importModal.mapping.marque_col?(lang==='fr'?`✓ colonne « ${importModal.mapping.marque_col} »`:`✓ column « ${importModal.mapping.marque_col} »`):(lang==='fr'?"détection automatique par nom":"auto-detection by name")}
                  </span>
                </div>
                {[
                  {key:"prix_achat",labelFr:"Prix d'achat",labelEn:"Purchase price",icon:"🛒",required:true},
                  {key:"prix_vente",labelFr:"Prix de vente",labelEn:"Sell price",icon:"💰",required:false},
                  {key:"statut",labelFr:"Statut",labelEn:"Status",icon:"📌",required:false},
                ].map(({key,labelFr,labelEn,icon})=>(
                  <div key={key} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,flexWrap:"wrap"}}>
                    <span style={{fontSize:14,flexShrink:0}}>{icon}</span>
                    <span style={{color:C.sub,minWidth:106,flexShrink:0}}>{lang==='fr'?labelFr:labelEn} :</span>
                    {importModal.mapping[key]
                      ? <span style={{fontWeight:700,color:C.teal,flex:1}}>✓ « {importModal.mapping[key]} »</span>
                      : <select value="" onChange={e=>setImportModal(m=>({...m,mapping:{...m.mapping,[key]:e.target.value||null}}))}
                          style={{flex:1,fontSize:12,padding:"4px 8px",borderRadius:8,border:"1px solid #CBD5E0",background:"#fff",color:C.text,cursor:"pointer"}}>
                          <option value="">{lang==='fr'?'— Choisir —':'— Choose —'}</option>
                          {importModal.headers.map(h=><option key={h} value={h}>{h}</option>)}
                        </select>
                    }
                  </div>
                ))}
              </div>
            </div>

            {/* Lignes ignorées */}
            {importModal.ignoredCount>0&&(
              <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#92400E",marginBottom:12,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontWeight:700}}>⚠️ {importModal.ignoredCount} ligne{importModal.ignoredCount>1?"s":""} ignorée{importModal.ignoredCount>1?"s":""} :</span>
                {Object.entries(importModal.skipCounts).map(([reason,count])=>(
                  <span key={reason} style={{background:"#FEF3C7",borderRadius:6,padding:"2px 8px",fontWeight:600}}>{count} {reason}</span>
                ))}
              </div>
            )}

            {/* Aperçu 3 premières lignes avec valeurs calculées */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>
                Aperçu ({importModal.rows.length} ligne{importModal.rows.length>1?"s":""} au total)
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {importModal.preview.map((row,i)=>{
                  const nom=buildTitre(row,importModal.mapping.titres);
                  const buy=importModal.mapping.prix_achat?String(row[importModal.mapping.prix_achat]):"—";
                  const sell=importModal.mapping.prix_vente?String(row[importModal.mapping.prix_vente]):"—";
                  const statVal=importModal.mapping.statut?String(row[importModal.mapping.statut]):(parseFloat(sell)>0?"vendu":"stock");
                  return(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8,padding:"8px 12px",background:C.rowBg,borderRadius:10,fontSize:11,alignItems:"center"}}>
                      <span style={{fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nom}</span>
                      <span style={{color:C.sub,whiteSpace:"nowrap"}}>Achat : {buy}</span>
                      <span style={{color:C.sub,whiteSpace:"nowrap"}}>Vente : {sell}</span>
                      <span style={{color:statVal==="vendu"?C.green:C.orange,fontWeight:600,whiteSpace:"nowrap"}}>{statVal}</span>
                    </div>
                  );
                })}
                {importModal.rows.length>3&&<div style={{fontSize:11,color:C.label,textAlign:"center"}}>+ {importModal.rows.length-3} {lang==='fr'?'autre(s)':'more'}</div>}
              </div>
            </div>

            {importModal.mapping.titres.length===0&&(
              <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#92400E",marginBottom:12}}>
                {lang==='fr'?'⚠️ Colonne titre non détectée. Sélectionne-la ci-dessus ou les articles seront importés sans nom.':'⚠️ Title column not detected. Select it above or items will be imported without a name.'}
              </div>
            )}

            {importMsg&&<div style={{fontSize:12,color:C.red,marginBottom:12}}>{importMsg}</div>}

            <div style={{display:"flex",gap:10}}>
              <button onClick={handleImportConfirm} disabled={importLoading} style={{flex:1,padding:"13px",background:`linear-gradient(135deg,${C.teal},${C.peach})`,color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:importLoading?"not-allowed":"pointer",opacity:importLoading?0.7:1,transition:"all 0.2s"}}>
                {importLoading?(lang==='fr'?"Import en cours...":"Importing..."):(lang==='fr'?"Importer les données →":"Import data →")}
              </button>
              <button onClick={()=>setImportModal(null)} style={{padding:"13px 20px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:12,color:C.sub,fontSize:14,fontWeight:600,cursor:"pointer"}}>
                {lang==='fr'?'Annuler':'Cancel'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── SETTINGS DRAWER ── */}
      {showSettings&&(
        <>
          <div onClick={()=>{setShowSettings(false);setDeleteStep(0);}} style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 16px",background:"rgba(0,0,0,0.4)",backdropFilter:"blur(2px)",animation:"fadeInBd 0.2s ease"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:384,padding:24,boxShadow:"0 24px 80px rgba(0,0,0,0.2)",maxHeight:"90vh",overflowY:"auto",animation:"fadeInBd 0.2s ease"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
              <div style={{fontSize:16,fontWeight:800,color:C.text}}>{t('parametres')}</div>
              <button onClick={()=>{setShowSettings(false);setDeleteStep(0);}} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",color:C.sub,flexShrink:0}}>✕</button>
            </div>

            {/* Profil */}
            <div style={{background:C.rowBg,borderRadius:14,padding:"14px 16px",marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{t('monCompte')}</div>
              <div style={{fontSize:13,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📧 {user?.email}</div>
              {isPremium&&<div style={{fontSize:12,color:C.teal,fontWeight:600,marginTop:5}}>⭐ {t('abonnementPremium')}</div>}
            </div>

            {/* Désabonnement — visible uniquement si premium */}
            {isPremium&&(
              <div style={{marginBottom:12}}>
                {isNative?(
                  /* iOS IAP : géré par Apple, pas Stripe */
                  <div style={{background:"#F0FFF4",border:"1px solid #9AE6B4",borderRadius:12,padding:"12px 14px",fontSize:13,color:"#276749",fontWeight:600,lineHeight:1.6}}>
                    ⭐ {lang==='fr'
                      ? 'Pour gérer votre abonnement, allez dans Réglages → Apple ID → Abonnements.'
                      : 'To manage your subscription, go to Settings → Apple ID → Subscriptions.'}
                  </div>
                ):(cancelAtPeriodEnd||cancelMsg)?(
                  <div style={{background:"#F0FFF4",border:"1px solid #9AE6B4",borderRadius:12,padding:"12px 14px",fontSize:13,color:"#276749",fontWeight:600,lineHeight:1.5}}>
                    ✅ {cancelMsg||(lang==='fr'
                      ? `Abonnement annulé. Tu gardes l'accès premium jusqu'au${cancelPeriodEnd?` ${cancelPeriodEnd}`:" la fin de la période"}.`
                      : `Subscription cancelled. You keep premium access until${cancelPeriodEnd?` ${cancelPeriodEnd}`:" the end of the period"}.`)}
                  </div>
                ):cancelStep===0?(
                  <button onClick={()=>setCancelStep(1)} style={{width:"100%",padding:"11px",background:"transparent",border:"1.5px solid rgba(232,149,109,0.6)",borderRadius:12,color:C.peach,fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.2s",textAlign:"left",display:"flex",alignItems:"center",gap:8}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(232,149,109,0.06)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                  >
                    <span>📭</span> {t('seDesabonner')}
                  </button>
                ):(
                  <div style={{background:"rgba(232,149,109,0.08)",border:"1.5px solid rgba(232,149,109,0.4)",borderRadius:12,padding:"14px"}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:10}}>{lang==='fr'?'Confirmer la résiliation ?':'Confirm cancellation?'}</div>
                    <div style={{fontSize:12,color:C.sub,marginBottom:12,lineHeight:1.5}}>{lang==='fr'?'Tu conserveras l\'accès Premium jusqu\'à la fin de ta période en cours. Aucun remboursement au prorata.':'You will keep Premium access until the end of your current period. No prorated refund.'}</div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={handleCancelSubscription} disabled={cancelLoading} style={{flex:1,padding:"9px",background:C.peach,border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:cancelLoading?"not-allowed":"pointer",opacity:cancelLoading?0.7:1,transition:"all 0.2s"}}>
                        {cancelLoading?"...":(lang==='fr'?'Confirmer':'Confirm')}
                      </button>
                      <button onClick={()=>setCancelStep(0)} disabled={cancelLoading} style={{flex:1,padding:"9px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:C.sub,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.2s"}}>
                        {lang==='fr'?'Annuler':'Cancel'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Support */}
            <a href="mailto:support@fillsell.app" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,textDecoration:"none",color:C.text,transition:"background 0.15s",marginBottom:2,cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background=C.rowBg}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >
              <span style={{fontSize:18,flexShrink:0}}>💬</span>
              <div>
                <div style={{fontSize:14,fontWeight:600}}>{t('support')}</div>
                <div style={{fontSize:12,color:C.sub}}>support@fillsell.app</div>
              </div>
            </a>

            {/* Mentions légales */}
            <a href="/legal" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,textDecoration:"none",color:C.text,transition:"background 0.15s",marginBottom:20,cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background=C.rowBg}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >
              <span style={{fontSize:18,flexShrink:0}}>📄</span>
              <div style={{fontSize:14,fontWeight:600}}>{t('mentionsLegales')}</div>
            </a>

            {/* Langue */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",background:C.rowBg,borderRadius:12,marginBottom:12}}>
              <span style={{fontWeight:700,fontSize:14,color:C.text}}>{t('langue')}</span>
              <div style={{display:"flex",gap:6}}>
                {['fr','en'].map(l=>(
                  <button key={l} onClick={()=>{track('change_language',{language:l});setLang(l);}}
                    style={{padding:"5px 12px",borderRadius:99,border:"none",fontSize:12,fontWeight:800,cursor:"pointer",transition:"all 0.15s",background:lang===l?"#1D9E75":"rgba(0,0,0,0.06)",color:lang===l?"#fff":"#6B7280"}}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Déconnexion */}
            <button onClick={()=>{handleLogout();setShowSettings(false);}} style={{width:"100%",padding:"13px",background:"transparent",border:`1.5px solid ${C.red}88`,borderRadius:12,color:C.red,fontSize:14,fontWeight:700,cursor:"pointer",transition:"all 0.2s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(229,62,62,0.06)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >{t('seDeconnecter')}</button>

            {/* Suppression de compte */}
            <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid rgba(0,0,0,0.07)"}}>
              {deleteStep===0&&(
                <button onClick={()=>setDeleteStep(1)}
                  style={{width:"100%",padding:"11px",background:"transparent",border:"none",borderRadius:12,color:"#9CA3AF",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.2s",textAlign:"center"}}
                  onMouseEnter={e=>e.currentTarget.style.color=C.red}
                  onMouseLeave={e=>e.currentTarget.style.color="#9CA3AF"}
                >
                  {lang==='fr'?'Supprimer mon compte':'Delete my account'}
                </button>
              )}
              {deleteStep===1&&(
                <div style={{background:C.redLight,border:`1.5px solid ${C.red}44`,borderRadius:12,padding:"14px"}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.red,marginBottom:6}}>
                    {lang==='fr'?'Êtes-vous sûr ?':'Are you sure?'}
                  </div>
                  <div style={{fontSize:12,color:C.sub,marginBottom:12,lineHeight:1.5}}>
                    {lang==='fr'?'Cette action est irréversible.':'This action is irreversible.'}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setDeleteStep(2)} style={{flex:1,padding:"9px",background:C.red,border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                      {lang==='fr'?'Continuer':'Continue'}
                    </button>
                    <button onClick={()=>setDeleteStep(0)} style={{flex:1,padding:"9px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:C.sub,fontSize:13,fontWeight:600,cursor:"pointer"}}>
                      {lang==='fr'?'Annuler':'Cancel'}
                    </button>
                  </div>
                </div>
              )}
              {deleteStep===2&&(
                <div style={{background:C.redLight,border:`2px solid ${C.red}`,borderRadius:12,padding:"14px"}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.red,marginBottom:6}}>
                    {lang==='fr'?'Confirmation finale':'Final confirmation'}
                  </div>
                  <div style={{fontSize:12,color:C.sub,marginBottom:12,lineHeight:1.5}}>
                    {lang==='fr'
                      ?'Toutes vos données seront supprimées définitivement. Cette action ne peut pas être annulée.'
                      :'All your data will be permanently deleted. This action cannot be undone.'}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={handleDeleteAccount} disabled={deleteLoading}
                      style={{flex:1,padding:"9px",background:C.red,border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:deleteLoading?"not-allowed":"pointer",opacity:deleteLoading?0.7:1}}>
                      {deleteLoading?"...":(lang==='fr'?'Supprimer définitivement':'Delete permanently')}
                    </button>
                    <button onClick={()=>setDeleteStep(0)} disabled={deleteLoading} style={{flex:1,padding:"9px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:C.sub,fontSize:13,fontWeight:600,cursor:"pointer"}}>
                      {lang==='fr'?'Annuler':'Cancel'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
          <style>{`
            @keyframes fadeInBd{from{opacity:0}to{opacity:1}}
          `}</style>
        </>
      )}

      <Toast message={toast.message} visible={toast.visible}/>

      <div className="bnav">
        {TABS_MOBILE.map(tm=>(
          <button key={tm.idx} onClick={()=>{setTab(tm.idx);localStorage.setItem('tab',tm.idx);}} className={"bnav-item "+(tab===tm.idx?"on":"")}>
            <span className="ic">{tm.icon}</span>
            <span className="lbl">{tm.label}</span>
            <span className="ind"/>
          </button>
        ))}
      </div>

      <VoiceAssistant
        items={items} sales={sales} lang={lang}
        actions={vaActions}
        vaStep={vaStep} setVaStep={setVaStep}
        vaResults={vaResults} setVaResults={setVaResults}
        vaError={vaError} setVaError={setVaError}
        markSold={markSold}
        deleteItem={delItem}
      />
    </div>
  );
}
