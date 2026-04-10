import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler);
ChartJS.defaults.font.family = "'Nunito', -apple-system, BlinkMacSystemFont, sans-serif";

const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

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

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{margin:0;padding:0;width:100%;max-width:100vw;overflow-x:hidden !important;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-x:none;}
  body{font-family:'Nunito',-apple-system,BlinkMacSystemFont,sans-serif;background:#F5F6F5;min-height:100vh;touch-action:pan-y;}
  *{box-sizing:border-box;max-width:100%;}
  svg,svg *{max-width:none!important;overflow:visible;}
  *::-webkit-scrollbar{display:none;}
  *{-ms-overflow-style:none;scrollbar-width:none;}
  input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
  input[type=number]{-moz-appearance:textfield;}
  .inp{transition:all 0.2s ease;}
  .inp:focus-within{border-color:${C.teal}!important;box-shadow:0 0 0 3px ${C.teal}18!important;}
  .btn{transition:all 0.2s ease;cursor:pointer;}
  .btn:hover:not(:disabled){opacity:0.92;transform:translateY(-2px);}
  .card{background:#fff;border-radius:16px;border:1px solid #ECF0F4;box-shadow:0 1px 4px rgba(0,0,0,0.05),0 4px 16px rgba(0,0,0,0.04);transition:box-shadow 0.2s ease,transform 0.2s ease;}
  .kpi{transition:transform 0.18s ease,box-shadow 0.18s ease;}
  .kpi:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,0.09)!important;}
  .wrap{width:100%;max-width:1280px;margin:0 auto;padding:0 24px;}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
  .grid-inv{display:grid;grid-template-columns:300px 1fr;gap:20px;align-items:start;width:100%;}
  .desktop-nav{display:flex;}
  .mobile-nav{display:none;}
  .header-stats{display:flex;}
  .header-centre{display:flex;flex-direction:column;align-items:center;}
  .header-brand-text{display:inline;}
  .logo-desktop{display:block;}
  .logo-mobile{display:none;}
  .premium-full{display:inline;}
  .premium-short{display:none;}
  .app-root{min-height:100vh;width:100%;max-width:100vw;overflow-x:hidden;position:relative;}
  @media(max-width:1024px){.grid4{grid-template-columns:repeat(2,1fr);}}
  @media(max-width:768px){
    .grid4{grid-template-columns:repeat(2,1fr);gap:12px;}
    .grid2{grid-template-columns:1fr;gap:12px;}
    .grid-inv{grid-template-columns:1fr;width:100%;overflow:hidden;box-sizing:border-box;}
    .wrap{padding:0 16px;overflow-x:hidden;}
    .card{border-radius:14px;}
    .desktop-nav{display:none!important;}
    .mobile-nav{display:flex!important;}
    .header-stats{display:none!important;}
    .header-centre{display:none!important;}
    .header-brand-text{display:none!important;}
    .logo-desktop{display:none!important;}
    .logo-mobile{display:block!important;}
    .premium-full{display:none!important;}
    .premium-short{display:inline!important;}
    .page-pad{padding-bottom:90px!important;}
  }
  @media(max-width:480px){.grid4{grid-template-columns:1fr;}}
`;

const fmt = n=>(Math.round(n*100)/100).toFixed(2).replace(".",",")+' €';
const fmtp = n=>(Math.round(n*10)/10).toFixed(1)+"%";

function SwipeRow({onDelete, children}){
  const isMobile = window.innerWidth < 768;
  const innerRef=useRef(null);
  const bgRef=useRef(null);
  const startX=useRef(0);
  const isDragging=useRef(false);
  const THRESHOLD=70;

  if(!isMobile){
    return(
      <div style={{position:"relative",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"#fff",borderRadius:12,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",transition:"background 0.15s",marginBottom:0}}
        onMouseEnter={e=>{e.currentTarget.style.background="#F5F6F5";e.currentTarget.querySelector('.delx').style.opacity='1';}}
        onMouseLeave={e=>{e.currentTarget.style.background="#fff";e.currentTarget.querySelector('.delx').style.opacity='0';}}
      >
        {children}
        <button className="delx" onClick={onDelete}
          style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",opacity:0,background:"transparent",border:"none",cursor:"pointer",fontSize:15,color:"#9CA3AF",padding:"4px 8px",borderRadius:6,transition:"all 0.15s",flexShrink:0}}
          onMouseEnter={e=>{e.currentTarget.style.background="#FEE2E2";e.currentTarget.style.color="#E53E3E";}}
          onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#9CA3AF";}}
        >✕</button>
      </div>
    );
  }

  function onTouchStart(e){startX.current=e.touches[0].clientX;isDragging.current=true;innerRef.current.style.transition='none';}
  function onTouchMove(e){
    if(!isDragging.current)return;
    const dx=e.touches[0].clientX-startX.current;
    if(dx>=0){innerRef.current.style.transform='translateX(0)';bgRef.current.style.opacity='0';bgRef.current.style.pointerEvents='none';return;}
    innerRef.current.style.transform=`translateX(${Math.max(dx,-(THRESHOLD+30))}px)`;
    bgRef.current.style.right='0px';bgRef.current.style.opacity='1';bgRef.current.style.pointerEvents='auto';
  }
  function onTouchEnd(){
    isDragging.current=false;
    innerRef.current.style.transition='transform 0.25s ease';
    const cur=new DOMMatrix(getComputedStyle(innerRef.current).transform).m41;
    if(cur<=-THRESHOLD){innerRef.current.style.transform=`translateX(-${THRESHOLD}px)`;bgRef.current.style.right='0px';bgRef.current.style.opacity='1';bgRef.current.style.pointerEvents='auto';}
    else{innerRef.current.style.transform='translateX(0)';bgRef.current.style.opacity='0';bgRef.current.style.pointerEvents='none';bgRef.current.style.right='-80px';}
  }
  function handleDelClick(){
    innerRef.current.style.transition='transform 0.2s ease,opacity 0.2s ease';
    innerRef.current.style.transform='translateX(-120%)';innerRef.current.style.opacity='0';
    setTimeout(()=>onDelete(),200);
  }
  return(
    <div style={{position:"relative",borderRadius:12,overflow:"hidden",maxWidth:"100%",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
      <div ref={bgRef} onClick={handleDelClick} style={{position:"absolute",right:-80,top:0,bottom:0,width:80,background:"linear-gradient(135deg,#FF6B6B,#E53E3E)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:0,pointerEvents:"none"}}>
        <span style={{fontSize:22}}>🗑️</span>
      </div>
      <div ref={innerRef} style={{position:"relative",zIndex:1,width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"#fff",borderRadius:12}}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {children}
      </div>
    </div>
  );
}

function PremiumBanner({ userEmail, compact=false }){
  const [loading, setLoading] = useState(false);

  async function handleCheckout(){
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
    return(
      <button onClick={handleCheckout} disabled={loading}
        style={{padding:"6px 12px",background:loading?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.2)",color:"#fff",border:"1px solid rgba(255,255,255,0.4)",borderRadius:99,fontSize:11,fontWeight:800,cursor:loading?"not-allowed":"pointer",transition:"all 0.15s",whiteSpace:"nowrap",flexShrink:0}}
        onMouseEnter={e=>{if(!loading)e.currentTarget.style.background="rgba(255,255,255,0.3)";}}
        onMouseLeave={e=>{e.currentTarget.style.background=loading?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.2)";}}
      >
        {loading ? "..." : <><span className="premium-short">✨</span><span className="premium-full">Passer au premium ✨</span></>}
      </button>
    );
  }

  return(
    <div style={{background:"linear-gradient(135deg,#3EACA008,#E8956D0D)",border:"1.5px solid #E8956D55",borderRadius:16,padding:"20px 22px",display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
        <div style={{fontSize:26,flexShrink:0}}>🔒</div>
        <div>
          <div style={{fontSize:14,fontWeight:800,color:"#111827",marginBottom:4}}>Limite du plan gratuit atteinte</div>
          <div style={{fontSize:12,color:"#6B7280",lineHeight:1.6}}>Tu as atteint 20 articles. Passe au plan premium pour un inventaire illimité.</div>
        </div>
      </div>
      <button onClick={handleCheckout} disabled={loading}
        style={{padding:"11px 20px",background:loading?"#E5E7EB":"linear-gradient(135deg,#3EACA0,#E8956D)",color:loading?"#9CA3AF":"#fff",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:loading?"not-allowed":"pointer",boxShadow:loading?"none":"0 4px 14px rgba(62,172,160,0.35)",transition:"all 0.2s",alignSelf:"flex-start"}}
        onMouseEnter={e=>{if(!loading)e.currentTarget.style.transform="translateY(-2px)";}}
        onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";}}
      >
        {loading ? "Redirection..." : "✨ Passer au premium"}
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

const Kpi=({label,value,sub,color})=>(
  <div style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
    <div style={{fontSize:10,fontWeight:800,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{label}</div>
    <div style={{fontSize:22,fontWeight:900,color:"#0D0D0D",letterSpacing:"-0.03em",lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:10,fontWeight:700,color:color||"#A3A9A6",marginTop:4}}>{sub}</div>}
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

function mapItem(v){return{id:v.id,title:v.titre,buy:v.prix_achat,sell:v.prix_vente,margin:v.margin,marginPct:v.margin_pct,statut:v.statut,date:v.date};}
function mapSale(v){return{id:v.id,title:v.titre,buy:v.prix_achat,sell:v.prix_vente,ship:0,margin:v.benefice,marginPct:v.prix_vente>0?(v.benefice/v.prix_vente)*100:0,date:v.date};}

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

export default function App({ loginOnly = false }){
  const navigate = useNavigate();
  const [tab,setTab]=useState(()=>parseInt(localStorage.getItem('tab')||'0'));
  const [items,setItems]=useState([]);
  const [sales,setSales]=useState([]);
  const [loading,setLoading]=useState(true);
  const [iTitle,setITitle]=useState("");
  const [iBuy,setIBuy]=useState("");
  const [iSell,setISell]=useState("");
  const [iSaved,setISaved]=useState(false);
  const [cTitle,setCTitle]=useState("");
  const [cBuy,setCBuy]=useState("");
  const [cSell,setCSell]=useState("");
  const [cShip,setCShip]=useState("");
  const [cSaved,setCSaved]=useState(false);
  const [user,setUser]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [resetStep,setResetStep]=useState(0);
  const [forgotMode,setForgotMode]=useState(false);
  const [forgotMsg,setForgotMsg]=useState("");
  const [isPremium,setIsPremium]=useState(false);
  const [firstItemAdded,setFirstItemAdded]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [selectedRange,setSelectedRange]=useState('6M');
  const [cancelStep,setCancelStep]=useState(0);
  const [cancelLoading,setCancelLoading]=useState(false);
  const [cancelMsg,setCancelMsg]=useState("");
  const [importModal,setImportModal]=useState(null); // {rows, mapping, preview}
  const [importLoading,setImportLoading]=useState(false);
  const [importMsg,setImportMsg]=useState("");
  const importRef=useRef(null);
  const titleInputRef=useRef(null);
  const listRef=useRef(null);

  async function fetchAll(uid){
    setLoading(true);
    const [v,i,p]=await Promise.all([
      supabase.from('ventes').select('*').eq('user_id',uid).order('created_at',{ascending:false}),
      supabase.from('inventaire').select('*').eq('user_id',uid).order('created_at',{ascending:false}),
      supabase.from('profiles').select('is_premium').eq('id',uid).single(),
    ]);
    if(!v.error) setSales((v.data||[]).map(mapSale));
    if(!i.error) setItems((i.data||[]).map(mapItem));
    const premiumValue=p.data?.is_premium===true;
    console.log('[fetchAll] is_premium from Supabase:', p.data?.is_premium, '→ resolved:', premiumValue, p.error?'ERROR:'+p.error.message:'');
    if(!p.error) setIsPremium(premiumValue);
    setLoading(false);
  }

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      const u=session?.user??null;
      setUser(u);
      if(u) fetchAll(u.id);
      else setLoading(false);
      setAuthLoading(false);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      const u=session?.user??null;
      setUser(u);
      if(u) fetchAll(u.id);
      else{setSales([]);setItems([]);setLoading(false);}
    });
    return()=>subscription.unsubscribe();
  },[]);


  const buy=parseFloat(cBuy)||0;
  const sell=parseFloat(cSell)||0;
  const ship=parseFloat(cShip)||0;
  const margin=sell-buy-ship;
  const marginPct=sell>0?(margin/sell)*100:0;
  const isValid=sell>0&&buy>=0;
  const mc=margin<0?C.red:C.green;

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
      return{name:MONTHS_FR[m],profit:ms.reduce((a,s)=>a+s.margin,0),"Marge %":ms.length?ms.reduce((a,s)=>a+s.marginPct,0)/ms.length:0};
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
    y:{grid:{color:'#E5E7EB',drawTicks:false},border:{display:false},ticks:{color:'#A3A9A6',font:_f,padding:8,callback:v=>v+unit}},
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
    plugins:{legend:{display:false},tooltip:{..._tip,bodyColor:'#1D9E75',callbacks:{title:([i])=>i.label,label:ctx=>`${(ctx.raw||0).toFixed(2).replace('.',',')} €`}}},
    scales:_scales('€'),
  };
  const lineOpts={
    responsive:true,maintainAspectRatio:false,
    animation:{duration:700,easing:'easeOutQuart'},
    plugins:{legend:{display:false},tooltip:{..._tip,bodyColor:'#F9A26C',callbacks:{title:([i])=>i.label,label:ctx=>`${(ctx.raw||0).toFixed(1)} %`}}},
    scales:_scales('%'),
  };
  const totalM=sales.reduce((a,s)=>a+s.margin,0);
  const totalR=sales.reduce((a,s)=>a+s.sell,0);
  const avgM=sales.length?sales.reduce((a,s)=>a+s.marginPct,0)/sales.length:0;
  const stock=items.filter(i=>i.statut==="stock");
  const sold=items.filter(i=>i.statut==="vendu");
  const invested=items.reduce((a,i)=>a+i.buy,0);
  const stockVal=stock.reduce((a,i)=>a+i.buy,0);
  const recovered=sales.reduce((a,s)=>a+s.sell,0);

  async function addItem(){
    if(!iTitle||!iBuy)return;
    if(!isPremium&&items.length>=20){alert("⚠️ Limite du plan gratuit atteinte (20 articles max).\nPasse au plan supérieur pour continuer.");return;}
    const b=parseFloat(iBuy)||0;const s=parseFloat(iSell)||0;const hasS=s>0;
    const mg=hasS?s-b:0;const mgp=hasS?(mg/s)*100:0;
    const row={id:Date.now(),user_id:user.id,titre:iTitle,prix_achat:b,prix_vente:hasS?s:null,margin:hasS?mg:null,margin_pct:hasS?mgp:null,statut:hasS?"vendu":"stock",date:new Date().toISOString()};
    const{data,error}=await supabase.from('inventaire').insert([row]).select().single();
    if(!error){
      setItems(prev=>[mapItem(data),...prev]);
      if(hasS){
        const srow={id:Date.now()+1,user_id:user.id,titre:iTitle,prix_achat:b,prix_vente:s,benefice:mg,date:new Date().toISOString().split('T')[0]};
        const{data:sd}=await supabase.from('ventes').insert([srow]).select().single();
        if(sd) setSales(prev=>[mapSale(sd),...prev]);
      }
    }
    if(items.length===0) setFirstItemAdded(true);
    setISaved(true);setTimeout(()=>setISaved(false),1600);
    setITitle("");setIBuy("");setISell("");
    setTimeout(()=>{if(listRef.current)listRef.current.scrollIntoView({behavior:"smooth"});},300);
  }

  async function markSold(item){
    const sv=parseFloat(prompt(`Prix de vente pour "${item.title}" ?`)||"0");
    if(!sv||sv<=0)return;
    const mg=sv-item.buy;const mgp=(mg/sv)*100;
    await supabase.from('inventaire').update({prix_vente:sv,margin:mg,margin_pct:mgp,statut:"vendu"}).eq('id',item.id);
    setItems(prev=>prev.map(i=>i.id===item.id?{...i,sell:sv,margin:mg,marginPct:mgp,statut:"vendu"}:i));
    const srow={id:Date.now(),user_id:user.id,titre:item.title,prix_achat:item.buy,prix_vente:sv,benefice:mg,date:new Date().toISOString().split('T')[0]};
    const{data:sd}=await supabase.from('ventes').insert([srow]).select().single();
    if(sd) setSales(prev=>[mapSale(sd),...prev]);
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
      // Optimistic update immédiat
      setIsPremium(false);
      // Resync depuis Supabase pour garantir la cohérence
      await new Promise(r=>setTimeout(r,600));
      await fetchAll(user.id);
      const msg=json.period_end
        ? `Abonnement annulé. Tu garderas l'accès jusqu'au ${json.period_end}.`
        : "Abonnement annulé. Tu garderas l'accès jusqu'à la fin de la période.";
      setCancelMsg(msg);
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
    const TITRE_RE=/nom|titre|article|marque|produit|désign|libell[eé]|description|objet|item|brand/i;
    const ACHAT_RE=/achat|achet[eé]|PA\b|prix.?achat|co[uû]t|cost|invest|d[eé]pense|d[eé]bours/i;
    const VENTE_RE=/vente|vendu|PV\b|prix.?vente|revente|cession|recette|encaiss/i;
    const STATUT_RE=/statut|status|[eé]tat|state/i;
    const mapping={titres:[],prix_achat:null,prix_vente:null,statut:null};

    for(const h of headers){
      const s=String(h).trim();
      if(TITRE_RE.test(s)) mapping.titres.push(h);
      else if(!mapping.prix_achat && ACHAT_RE.test(s)) mapping.prix_achat=h;
      else if(!mapping.prix_vente && VENTE_RE.test(s)) mapping.prix_vente=h;
      else if(!mapping.statut && STATUT_RE.test(s)) mapping.statut=h;
    }
    console.log('[Import] detectColumns — headers:',headers,'→',mapping);

    // ÉTAPE 3 : Fallback numérique 80% sur 20 premières lignes
    const sample=rows.slice(0,20);
    const assigned=new Set([...mapping.titres,mapping.prix_achat,mapping.prix_vente,mapping.statut].filter(Boolean));
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
    const PARASITE_RE=/total|sous.?total|somme|bilan|virement|re[cç]u|comptabilis|r[eé]sum[eé]|r[eé]cap|moyenne|average|\bnote\b|\binfo\b|NaN/i;
    const buyStr=String(row[mapping.prix_achat]??'').replace(',','.').trim();
    const buy=parseFloat(buyStr);
    // Prix achat invalide ou nul
    if(!mapping.prix_achat||!buyStr||isNaN(buy)||buy<=0) return 'prix manquant';
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
        const IGNORE_RE=/^(listes?|config|param[eè]tres?|r[eé]sum[eé]|summary|dashboard|feuil\d+|sheet\d+)$/i;
        const KEYWORDS=/nom|titre|article|marque|produit|achat|vente|prix|libell[eé]|d[eé]sign|item|brand|statut/i;

        const allRows=[];
        const seenHeaders=new Set();
        let sheetsRead=0;

        for(const sheetName of wb.SheetNames){
          if(IGNORE_RE.test(sheetName.trim())){
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
      const rowDate=r.__sheetDate||now;
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
        created_at:now,
      };
    }).filter(r=>r.prix_achat>0&&r.titre!=="Article importé");
    console.log('[Import] Inserting',toInsert.length,'rows — sample:',toInsert[0]);

    const{data,error}=await supabase.from('inventaire').insert(toInsert).select();
    if(error){setImportLoading(false);setImportMsg("Erreur import : "+error.message);return;}

    // Insère aussi dans ventes les lignes "vendu"
    const ventesRows=(data||[])
      .filter(row=>row.statut==='vendu'&&row.prix_vente)
      .map(row=>({
        id:row.id+1000000,
        user_id:user.id,
        titre:row.titre,
        prix_achat:row.prix_achat,
        prix_vente:row.prix_vente,
        benefice:row.margin,
        date:(row.date||now).split('T')[0],
      }));
    if(ventesRows.length){
      const{error:ve}=await supabase.from('ventes').insert(ventesRows);
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
  function handleExport(){
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

    XLSX.writeFile(wb,`fillsell-export-${today}.xlsx`);
  }

  async function handleLogin(){
    if(!email||!password){alert("Remplis email et mot de passe");return;}
    const{error}=await supabase.auth.signInWithPassword({email,password});
    if(error){alert(error.message);return;}
    navigate("/app");
  }

  async function handleForgot(){
    if(!email){setForgotMsg("Saisis ton email ci-dessus.");return;}
    setForgotMsg("");
    const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:"https://fillsell.app/reset-password"});
    if(error){setForgotMsg("Erreur : "+error.message);return;}
    setForgotMsg("📧 Email envoyé ! Vérifie ta boîte mail.");
  }

  async function handleSignup(){
    if(!email||!password){alert("Remplis email et mot de passe");return;}
    const{data,error}=await supabase.auth.signUp({email,password});
    if(error){alert(error.message);return;}
    if(data?.session) navigate("/app");
    else alert("Vérifie ton email pour confirmer ton compte !");
  }

  async function handleLogout(){
    await supabase.auth.signOut();
    setUser(null);setSales([]);setItems([]);setResetStep(0);
    navigate("/");
  }

  const TABS_MOBILE=[
    {icon:"📊",label:"Dashboard",idx:0},
    {icon:"📦",label:"Stock",idx:1},
    {icon:"🧮",label:"Calculer",idx:2},
    {icon:"📋",label:"Historique",idx:3},
  ];

  const headerStats=[
    {label:"Bénéfices",value:fmt(totalM)},
    {label:"Capital investi",value:fmt(invested)},
    {label:"En stock",value:`${stock.length} art. · ${fmt(stockVal)}`},
  ];

  if(authLoading)return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#4ECDC4 0%,#F9A26C 100%)"}}>
      <div style={{color:"#fff",fontSize:18,fontWeight:700}}>Chargement...</div>
    </div>
  );

  if(!user||loginOnly)return(
    <div style={{position:"fixed",inset:0,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",background:"linear-gradient(135deg,#4ECDC4 0%,#F9A26C 100%)",overflow:"hidden",boxSizing:"border-box"}}>
      <div style={{background:"#fff",borderRadius:24,padding:"36px 28px",width:"100%",maxWidth:400,boxShadow:"0 24px 64px rgba(0,0,0,0.2)",boxSizing:"border-box"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <img src="/logo.png" style={{height:52,marginBottom:12,objectFit:"contain"}} alt="Fill & Sell"/>
          <div style={{fontSize:15,color:C.sub,fontWeight:500}}>Connecte-toi pour continuer</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}
            style={{padding:"13px 16px",borderRadius:12,border:"1px solid rgba(0,0,0,0.12)",fontSize:15,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"}}/>
          {!forgotMode&&(
            <>
              <input type="password" placeholder="Mot de passe" value={password} onChange={e=>setPassword(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                style={{padding:"13px 16px",borderRadius:12,border:"1px solid rgba(0,0,0,0.12)",fontSize:15,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"}}/>
              <button onClick={handleLogin}
                style={{padding:"14px",background:`linear-gradient(135deg,${C.teal},${C.peach})`,color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",width:"100%",boxShadow:"0 4px 16px rgba(62,172,160,0.35)"}}>
                Se connecter
              </button>
              <button onClick={handleSignup}
                style={{padding:"14px",background:"transparent",color:C.teal,border:`1px solid ${C.teal}`,borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",width:"100%"}}>
                Créer un compte
              </button>
              <div style={{textAlign:"center"}}>
                <span onClick={()=>{setForgotMode(true);setForgotMsg("");}} style={{fontSize:13,color:C.teal,cursor:"pointer",textDecoration:"underline"}}>
                  Mot de passe oublié ?
                </span>
              </div>
            </>
          )}
          {forgotMode&&(
            <>
              <button onClick={handleForgot}
                style={{padding:"14px",background:`linear-gradient(135deg,${C.teal},${C.peach})`,color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",width:"100%",boxShadow:"0 4px 16px rgba(62,172,160,0.35)"}}>
                Envoyer le lien de réinitialisation
              </button>
              {forgotMsg&&(
                <div style={{fontSize:13,textAlign:"center",color:forgotMsg.startsWith("📧")?C.teal:C.red,fontWeight:600}}>
                  {forgotMsg}
                </div>
              )}
              <div style={{textAlign:"center"}}>
                <span onClick={()=>{setForgotMode(false);setForgotMsg("");}} style={{fontSize:13,color:C.sub,cursor:"pointer"}}>
                  ← Retour
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return(
    <div className="app-root" style={{overflowX:"hidden",maxWidth:"100vw",position:"relative"}}>
      <style>{css}</style>

      <div style={{background:"linear-gradient(135deg,#4ECDC4,#F9A26C)",padding:"10px 16px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,maxWidth:1280,margin:"0 auto",width:"100%"}}>
          {/* Gauche : logo cliquable → dashboard */}
          <button onClick={()=>{setTab(0);localStorage.setItem('tab','0');}} style={{display:"flex",alignItems:"center",gap:8,background:"transparent",border:"none",padding:0,cursor:"pointer",flexShrink:0}}>
            <img src="/logo.png" alt="Fill & Sell" className="logo-desktop" style={{height:32,width:"auto",objectFit:"contain",flexShrink:0}}/>
            <img src="/favicon-32x32.png" alt="Fill & Sell" className="logo-mobile" style={{width:32,height:32,borderRadius:11,objectFit:"cover",flexShrink:0}}/>
            <span style={{fontSize:15,fontWeight:900,color:"#fff",fontStyle:"italic",letterSpacing:"-0.02em",lineHeight:1,whiteSpace:"nowrap"}}>Fill & Sell</span>
          </button>
          {/* Centre : stats dynamiques (masquées sur mobile) */}
          <div className="header-centre" style={{textAlign:"center",flex:1}}>
            <div style={{fontSize:14,fontWeight:900,color:"#fff",letterSpacing:"-0.02em",lineHeight:1}}>
              {fmt(tm.profit)}<span style={{opacity:0.65,fontSize:12,fontWeight:700}}> profit</span>
            </div>
            <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.55)",marginTop:2,whiteSpace:"nowrap"}}>
              {tm.count} vente{tm.count!==1?"s":""} ce mois
            </div>
          </div>
          {/* Droite : premium + settings — toujours collé à droite */}
          <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto",flexShrink:0}}>
            {!isPremium?(
              <PremiumBanner userEmail={user?.email} compact/>
            ):(
              <div style={{background:"rgba(255,255,255,0.18)",border:"1px solid rgba(255,255,255,0.32)",borderRadius:99,padding:"4px 10px",fontSize:10,fontWeight:800,color:"#fff",whiteSpace:"nowrap"}}>⭐ Premium</div>
            )}
            <button onClick={()=>{setShowSettings(true);setCancelStep(0);setCancelMsg("");}} title="Paramètres" style={{background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:8,padding:"5px 9px",color:"#fff",fontSize:16,cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",flexShrink:0}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.32)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
            >⚙️</button>
          </div>
        </div>
      </div>

      <div className="desktop-nav" style={{background:"#fff",borderBottom:"1px solid rgba(0,0,0,0.06)"}}>
        <div className="wrap">
          <div style={{display:"flex",padding:"0 14px",gap:0,overflowX:"auto"}}>
            {["Dashboard","Inventaire","Calculer","Historique"].map((t,i)=>(
              <button key={i} onClick={()=>{setTab(i);localStorage.setItem('tab',i);}}
                style={{flex:1,textAlign:"center",padding:"10px 8px",background:"transparent",border:"none",borderBottom:`2px solid ${tab===i?"#1D9E75":"transparent"}`,color:tab===i?"#1D9E75":"#A3A9A6",fontSize:13,fontWeight:700,whiteSpace:"nowrap",cursor:"pointer",transition:"all 0.15s ease"}}
                onMouseEnter={e=>{if(i!==tab)e.currentTarget.style.color="#5DCAA5";}}
                onMouseLeave={e=>{if(i!==tab)e.currentTarget.style.color="#A3A9A6";}}
              >{t}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="wrap page-pad" style={{padding:"18px 14px 80px",background:"#F5F6F5",minHeight:"calc(100vh - 90px)"}}>

        {tab===0&&(
          <div style={{display:"flex",flexDirection:"column",gap:28,width:"100%",overflow:"hidden"}}>
            {!isPremium&&!loading&&(
              <div style={{background:20-items.length<=5?"#FFFBEB":C.tealLight,border:`1px solid ${20-items.length<=5?"#FDE68A":C.teal+"33"}`,borderRadius:12,padding:"12px 18px",textAlign:"center",cursor:"pointer",overflow:"hidden"}}>
                <div style={{fontSize:13,fontWeight:600,color:items.length>=14?"#C05621":items.length>=10?"#D97706":C.teal}}>
                  {items.length>=14
                    ? `🔴 Plus que ${20-items.length} article${20-items.length>1?"s":""} avant la limite !`
                    : items.length>=10
                    ? `⚠️ Plus que ${20-items.length} article${20-items.length>1?"s":""} avant de passer au premium`
                    : `Il te reste ${20-items.length} article${20-items.length>1?"s":""} gratuit${20-items.length>1?"s":""}`
                  }
                </div>
              </div>
            )}
            {loading?(
              <div style={{textAlign:"center",padding:"60px 0",color:C.sub,fontSize:14,fontWeight:600}}>Chargement des données...</div>
            ):items.length===0&&sales.length===0?(
              <div style={{maxWidth:520,margin:"40px auto 0",animation:"fadeIn 0.4s ease",width:"100%"}}>
                <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
                <div className="card" style={{padding:"40px 32px",textAlign:"center"}}>
                  <div style={{fontSize:48,marginBottom:16}}>👋</div>
                  <div style={{fontSize:22,fontWeight:900,color:C.text,letterSpacing:"-0.5px",marginBottom:12}}>Bienvenue sur Fill & Sell</div>
                  <div style={{fontSize:14,color:C.sub,lineHeight:1.7,marginBottom:32,maxWidth:380,margin:"0 auto 32px"}}>
                    Suis tes profits de revente en quelques secondes.<br/>Commence par ajouter ton premier article.
                  </div>
                  <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:36,flexWrap:"wrap"}}>
                    {[{icon:"📦",label:"Ajoute un article"},{icon:"💰",label:"Enregistre une vente"},{icon:"📊",label:"Analyse tes profits"}].map((step,i)=>(
                      <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"14px 18px",background:C.rowBg,borderRadius:14,border:"1px solid rgba(0,0,0,0.06)",minWidth:100}}>
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
                    {MONTHS_FR[now.getMonth()]} {now.getFullYear()}
                  </div>
                  <div style={{fontSize:32,fontWeight:900,color:"#0D0D0D",letterSpacing:"-0.04em",lineHeight:1,marginBottom:18}}>
                    T'as vendu <span style={{color:"#1D9E75"}}>quoi</span> ?
                  </div>
                </div>

                {/* Hero card profit net */}
                <div style={{background:"linear-gradient(135deg,#1D9E75 0%,#0A5A44 100%)",borderRadius:14,padding:18,marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{fontSize:10,fontWeight:800,textTransform:"uppercase",color:"rgba(255,255,255,0.5)",letterSpacing:"0.07em"}}>Profit net</div>
                    <div style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:99,padding:"3px 8px",fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.85)"}}>{tm.profit>=0?"+":""}{fmt(tm.profit)} ce mois</div>
                  </div>
                  <div style={{fontSize:42,fontWeight:900,color:"#fff",letterSpacing:"-0.04em",lineHeight:1}}>{fmt(totalM)}</div>
                  <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.4)",marginTop:6}}>{sales.length} vente{sales.length!==1?"s":""} · marge moy. {fmt(sales.length?totalM/sales.length:0)}</div>
                </div>

                {/* KPIs 2 colonnes */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <Kpi label="Ce mois" value={fmt(tm?.profit||0)} sub={`${tm?.count||0} vente${(tm?.count||0)!==1?"s":""}`} color="#1D9E75"/>
                  <Kpi label="Marge moy." value={fmtp(avgM)} sub="toutes ventes" color="#5DCAA5"/>
                  <Kpi label="Revenu brut" value={fmt(totalR)} sub="total encaissé" color="#1D9E75"/>
                  <Kpi label="En stock" value={`${stock.length}`} sub={`${fmt(stockVal)} investi`} color="#A3A9A6"/>
                </div>

                {/* Sélecteur de période */}
                <div style={{display:"flex",justifyContent:"flex-end",gap:6,flexWrap:"wrap"}}>
                  {['7j','1M','6M','1A','YTD'].map(r=>(
                    <button key={r} onClick={()=>setSelectedRange(r)} style={{padding:"5px 12px",borderRadius:8,border:"none",fontSize:12,fontWeight:700,cursor:"pointer",transition:"all 0.15s",background:selectedRange===r?"#1D9E75":"#fff",color:selectedRange===r?"#fff":"#A3A9A6",boxShadow:selectedRange===r?"none":"0 1px 3px rgba(0,0,0,0.06)"}}>
                      {r}
                    </button>
                  ))}
                </div>

                <div className="grid2">
                  <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D",marginBottom:2}}>Bénéfices</div>
                    <div style={{fontSize:11,color:"#A3A9A6",marginBottom:14,fontWeight:600}}>
                      {selectedRange==='7j'?"7 derniers jours":selectedRange==='1M'?"30 derniers jours":selectedRange==='1A'?"12 derniers mois":selectedRange==='YTD'?"Depuis le 1er janvier":"6 derniers mois"}
                    </div>
                    <div style={{position:"relative",height:"200px",width:"100%"}}>
                      <Bar data={barChartData} options={barOpts}/>
                    </div>
                  </div>
                  <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D",marginBottom:2}}>Évolution marge %</div>
                    <div style={{fontSize:11,color:"#A3A9A6",marginBottom:14,fontWeight:600}}>
                      {selectedRange==='7j'?"7 derniers jours":selectedRange==='1M'?"30 derniers jours":selectedRange==='1A'?"12 derniers mois":selectedRange==='YTD'?"Depuis le 1er janvier":"6 derniers mois"}
                    </div>
                    <div style={{position:"relative",height:"200px",width:"100%"}}>
                      <Line data={lineChartData} options={lineOpts}/>
                    </div>
                  </div>
                </div>

                {hasData&&(
                  <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D",marginBottom:14}}>Dernières ventes</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {sales.slice(0,5).map(s=>{
                        const d=new Date(s.date);const smc=s.margin<0?C.red:C.green;
                        return(
                          <SwipeRow key={s.id} onDelete={()=>delSale(s.id)}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:800,fontSize:13,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                              <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",marginTop:2}}>{d.getDate()} {MONTHS_FR[d.getMonth()]}</div>
                            </div>
                            <div style={{textAlign:"right",paddingRight:36}}>
                              <div style={{fontWeight:900,fontSize:14,color:smc}}>{smc===C.green?"+":""}{fmt(s.margin)}</div>
                              <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6"}}>{fmtp(s.marginPct)}</div>
                            </div>
                          </SwipeRow>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{display:"flex",justifyContent:"center"}}>
                  <div className="card" style={{padding:"28px 32px",border:`1px solid ${C.red}30`,background:"rgba(254,242,242,0.6)",borderRadius:20,maxWidth:480,width:"100%",textAlign:"center"}}>
                    <div style={{fontSize:14,fontWeight:700,color:"#C53030",marginBottom:6}}>⚠️ Zone dangereuse</div>
                    <div style={{fontSize:13,color:C.sub,marginBottom:20,lineHeight:1.6}}>Cette action supprime définitivement toutes tes ventes et ton inventaire. Elle est irréversible.</div>
                    {resetStep===0&&(
                      <button onClick={handleReset} style={{padding:"10px 22px",background:"transparent",border:`1.5px solid ${C.red}99`,borderRadius:12,color:C.red,fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.2s",display:"block",margin:"0 auto"}}
                        onMouseEnter={e=>{e.currentTarget.style.background="rgba(229,62,62,0.08)";}}
                        onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}
                      >🗑️ Tout remettre à zéro</button>
                    )}
                    {resetStep===1&&(
                      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",justifyContent:"center"}}>
                        <div style={{fontSize:13,fontWeight:600,color:C.red}}>Confirme-tu ? Action irréversible.</div>
                        <button onClick={handleReset} style={{padding:"10px 20px",background:C.red,border:"none",borderRadius:12,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.2s"}}>Oui, tout supprimer</button>
                        <button onClick={()=>setResetStep(0)} style={{padding:"10px 20px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:12,color:C.sub,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.2s"}}>Annuler</button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab===1&&(
          <div className="grid-inv">
            <div style={{background:"#fff",borderRadius:12,padding:20,display:"flex",flexDirection:"column",gap:12,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              {items.length===0?(
                <div style={{textAlign:"center",paddingBottom:4,animation:"fadeIn 0.4s ease"}}>
                  <div style={{fontSize:28,marginBottom:8}}>🧩</div>
                  <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:6}}>Ajoute ton premier article</div>
                  <div style={{fontSize:13,color:C.sub,lineHeight:1.6}}>Entre le nom et ton prix d'achat. Tu pourras ajouter le prix de vente plus tard.</div>
                </div>
              ):(
                <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:4}}>Ajouter un article</div>
              )}
              <div>
                <Field label="Nom" value={iTitle} set={setITitle} placeholder="Ex: Nike Air Max, Zara jean..." icon="🏷️"/>
                {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>Le nom de l'article que tu veux suivre</div>}
              </div>
              <div>
                <Field label="Prix d'achat" value={iBuy} set={setIBuy} placeholder="0,00" type="number" icon="🛒" suffix="€"/>
                {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>Prix auquel tu as acheté l'article</div>}
              </div>
              <div>
                <Field label="Prix de vente (optionnel)" value={iSell} set={setISell} placeholder="Vide = en stock" type="number" icon="📦" suffix="€"/>
                {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>Optionnel — à remplir quand tu vends</div>}
              </div>
              {items.length>0&&(
                <div style={{background:C.rowBg,borderRadius:10,padding:"10px 14px",fontSize:11,color:C.sub,border:"1px solid rgba(0,0,0,0.06)",lineHeight:1.6}}>
                  💡 Sans prix → <strong>stock</strong>. Avec prix → <strong>vendu</strong>.
                </div>
              )}
              {!isPremium&&items.length>=18&&items.length<20&&(
                <div style={{background:"#FFFBEB",borderRadius:10,padding:"10px 14px",fontSize:11,color:"#92400E",border:"1px solid #FDE68A",fontWeight:600}}>
                  ⚠️ {20-items.length} article{20-items.length>1?"s":""} restant{20-items.length>1?"s":""} sur ton plan gratuit
                </div>
              )}
              {!isPremium&&items.length>=20
                ? <PremiumBanner userEmail={user?.email}/>
                : <Btn onClick={addItem} disabled={!iTitle||!iBuy} color={iSaved?"#38A169":"#1D9E75"} full>
                    {iSaved?"✓ Ajouté !":items.length===0?"Ajoute ton premier article → vois ton bénéfice 🚀":"Ajouter à l'inventaire"}
                  </Btn>
              }
              {items.length===0&&!iSaved&&!(iTitle&&iBuy)&&(
                <div style={{textAlign:"center",fontSize:12,color:C.label,marginTop:-4}}>
                  Tu es à 1 étape de voir tes premiers profits 💰
                </div>
              )}
              {items.length===0&&!iSaved&&iTitle&&iBuy&&(
                <div style={{textAlign:"center",fontSize:12,color:C.teal,fontWeight:600,marginTop:-4}}>
                  ✓ Prêt ! Clique pour ajouter et voir ton bénéfice instantanément
                </div>
              )}
              {firstItemAdded&&(
                <div style={{background:C.greenLight,borderRadius:10,padding:"10px 14px",fontSize:12,color:C.green,border:"1px solid #C6F6D5",fontWeight:600,textAlign:"center"}}>
                  ✅ Article ajouté ! Tu peux maintenant enregistrer une vente.
                </div>
              )}
            </div>

            <div ref={listRef} style={{display:"flex",flexDirection:"column",gap:16}}>

              {/* ── Barre Import / Export ── */}
              {isPremium?(
                <div style={{background:"#fff",borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                  <div style={{flex:1,fontSize:13,fontWeight:700,color:C.text}}>Outils Premium</div>
                  <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={handleImportFile}/>
                  <button onClick={()=>importRef.current?.click()} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:C.tealLight,color:C.teal,border:`1px solid ${C.teal}44`,borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#C6EBE9"}
                    onMouseLeave={e=>e.currentTarget.style.background=C.tealLight}
                  >📥 Importer</button>
                  <button onClick={handleExport} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:"#EDF2F7",color:C.sub,border:"1px solid rgba(0,0,0,0.1)",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#E2E8F0"}
                    onMouseLeave={e=>e.currentTarget.style.background="#EDF2F7"}
                  >📤 Exporter</button>
                  {importMsg&&<div style={{width:"100%",fontSize:12,color:C.green,fontWeight:600,marginTop:2}}>{importMsg}</div>}
                </div>
              ):(
                <div style={{background:"#fff",borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",gap:12,border:"1px solid rgba(249,162,108,0.3)"}}>
                  <span style={{fontSize:18}}>🔒</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D"}}>Import / Export Excel</div>
                    <div style={{fontSize:11,fontWeight:600,color:"#A3A9A6"}}>Fonctionnalité Premium — importe et exporte tes données</div>
                  </div>
                  <PremiumBanner userEmail={user?.email} compact/>
                </div>
              )}

              <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D"}}>En stock</div>
                    {!isPremium&&items.length>=20&&<span style={{fontSize:10,fontWeight:700,background:"#FFF4EE",color:"#F9A26C",borderRadius:99,padding:"2px 8px",border:"1px solid #F9A26C44"}}>Plan gratuit</span>}
                  </div>
                  <div style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{stock.length} art. · {fmt(stockVal)}</div>
                </div>
                {stock.length===0?<Empty text="Ton inventaire apparaîtra ici"/>:(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {stock.map(item=>(
                      <SwipeRow key={item.id} onDelete={()=>delItem(item.id)}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:800,fontSize:13,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                          <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",marginTop:2}}>Investi {fmt(item.buy)}</div>
                        </div>
                        <button onClick={(e)=>{e.stopPropagation();markSold(item);}} style={{background:"#E8F5F0",color:"#1D9E75",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>Vendu</button>
                      </SwipeRow>
                    ))}
                  </div>
                )}
              </div>

              <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D"}}>Vendus</div>
                  <div style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{sold.length} vente{sold.length>1?"s":""}</div>
                </div>
                {sold.length===0?<Empty text="Aucune vente encore"/>:(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {sold.map(item=>{
                      const smc=item.margin<0?C.red:C.green;
                      return(
                        <SwipeRow key={item.id} onDelete={()=>delItem(item.id)}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:800,fontSize:13,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                            <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",marginTop:2}}>{fmt(item.buy)} → {fmt(item.sell)}</div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0,paddingRight:36}}>
                            <div style={{fontWeight:900,fontSize:14,color:smc}}>{fmt(item.margin)}</div>
                            <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6"}}>{fmtp(item.marginPct)}</div>
                          </div>
                        </SwipeRow>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab===2&&(
          <div style={{maxWidth:520,margin:"0 auto",display:"flex",flexDirection:"column",gap:14}}>

            {/* ── Bloc résultat principal ── */}
            <div style={{
              background:isValid?(margin>=0?"#0F6E56":"#fff"):"#fff",
              borderRadius:12,padding:"14px 16px",
              border:isValid?"none":`1px solid rgba(0,0,0,0.06)`,
              boxShadow:"0 1px 3px rgba(0,0,0,0.04)",
              transition:"all 0.3s ease"
            }}>
              {!isValid?(
                <div style={{textAlign:"center",padding:"8px 0"}}>
                  <div style={{fontSize:36,marginBottom:10}}>🧮</div>
                  <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>Calcule ta marge instantanément</div>
                  <div style={{fontSize:13,color:C.sub}}>Entre le prix d'achat et de vente ci-dessous</div>
                </div>
              ):(
                <>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:800,textTransform:"uppercase",color:"rgba(255,255,255,0.55)",letterSpacing:"0.07em",marginBottom:4}}>Profit estimé</div>
                      <div style={{fontSize:28,fontWeight:900,color:"#fff",letterSpacing:"-0.03em",lineHeight:1,transition:"color 0.3s"}}>{fmt(margin)}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:11,fontWeight:800,textTransform:"uppercase",color:"rgba(255,255,255,0.55)",letterSpacing:"0.07em",marginBottom:4}}>Rentabilité</div>
                      <div style={{fontSize:28,fontWeight:900,color:"#fff",letterSpacing:"-0.03em"}}>{fmtp(marginPct)}</div>
                    </div>
                  </div>
                  <div style={{marginTop:10,height:4,background:"rgba(255,255,255,0.15)",borderRadius:99}}>
                    <div style={{width:`${Math.min(100,Math.max(0,marginPct))}%`,height:"100%",background:"rgba(255,255,255,0.7)",borderRadius:99,transition:"width 0.4s ease"}}/>
                  </div>
                  <div style={{marginTop:8,fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.6)"}}>
                    {margin<0?"❌ Vente à perte":marginPct>=30?"🔥 Excellent deal !":marginPct>=20?"👍 Bon deal":marginPct>=10?"📊 Marge correcte":"⚠️ Rentabilité faible"}
                  </div>
                </>
              )}
            </div>

            {/* ── Inputs ── */}
            <div>
              <Field label="Nom de l'article" value={cTitle} set={setCTitle} placeholder="Ex: Nike Air Max 90" icon="🏷️"/>
            </div>
            <div>
              <Field label="Prix d'achat" value={cBuy} set={setCBuy} placeholder="0,00" type="number" icon="🛒" suffix="€"/>
              <div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>Prix auquel tu as acheté l'article</div>
            </div>
            <div>
              <Field label="Prix de vente" value={cSell} set={setCSell} placeholder="0,00" type="number" icon="💰" suffix="€"/>
              <div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>Prix de vente sur ta plateforme de revente</div>
            </div>
            <div>
              <Field label="Frais annexes" value={cShip} set={setCShip} placeholder="0,00" type="number" icon="➕" suffix="€"/>
              <div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>Livraison, emballage, commissions...</div>
            </div>

            {/* ── Récap rapide ── */}
            {isValid&&(
              <div style={{background:"#fff",borderRadius:12,padding:"14px 18px",display:"flex",justifyContent:"space-around",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                {[{label:"Coût total",value:fmt(buy+ship),color:C.sub},{label:"Revenu brut",value:fmt(sell),color:C.teal},{label:"Bénéfice net",value:fmt(margin),color:mc}].map((item,i)=>(
                  <div key={i} style={{textAlign:"center"}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>{item.label}</div>
                    <div style={{fontSize:16,fontWeight:800,color:item.color}}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── CTA ── */}
            <Btn onClick={addSale} disabled={!isValid} color={cSaved?"#38A169":"#1D9E75"} full>
              {cSaved?"✓ Ajouté à ton suivi !":"💾 Ajouter à mon suivi"}
            </Btn>

            {!isPremium&&(
              <div style={{textAlign:"center",fontSize:11,color:C.label,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                🔓 <PremiumBanner userEmail={user?.email} compact/>
              </div>
            )}
          </div>
        )}

        {tab===3&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>

            {/* ── Header stats ── */}
            {sales.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:4}}>
                {[
                  {label:"Profit total",value:fmt(totalM),color:totalM>=0?"#1D9E75":C.red},
                  {label:"Ventes",value:sales.length,color:"#4ECDC4"},
                  {label:"Profit moyen",value:fmt(sales.length?totalM/sales.length:0),color:"#5DCAA5"},
                ].map((s,i)=>(
                  <div key={i} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",textAlign:"center"}}>
                    <div style={{fontSize:10,fontWeight:800,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{s.label}</div>
                    <div style={{fontSize:18,fontWeight:900,color:s.color,letterSpacing:"-0.03em"}}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {sales.length===0?(
              <div>
                {/* Empty state amélioré */}
                <div className="card" style={{padding:"36px 28px",textAlign:"center",marginBottom:12}}>
                  <div style={{fontSize:48,marginBottom:16}}>📊</div>
                  <div style={{fontSize:18,fontWeight:800,color:C.text,marginBottom:10}}>Ton suivi de performance</div>
                  <div style={{fontSize:14,color:C.sub,lineHeight:1.7,marginBottom:28,maxWidth:340,margin:"0 auto 28px"}}>
                    Chaque vente enregistrée te donnera une vision claire de tes profits et de ta progression.
                  </div>
                  <button onClick={()=>{setTab(1);localStorage.setItem('tab',1);}} style={{padding:"13px 28px",background:`linear-gradient(135deg,${C.teal},${C.peach})`,color:"#fff",border:"none",borderRadius:14,fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 16px rgba(62,172,160,0.3)",marginBottom:16}}>
                    ➕ Ajouter un article
                  </button>

                  {/* Mock data grisée */}
                  <div style={{marginTop:24,opacity:0.35,pointerEvents:"none"}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Aperçu de l'historique</div>
                    {[
                      {title:"Nike Air Max 90",buy:45,sell:80,margin:35,pct:43.8},
                      {title:"Zara Veste cuir",buy:22,sell:38,margin:16,pct:42.1},
                      {title:"Adidas Stan Smith",buy:30,sell:52,margin:22,pct:42.3},
                    ].map((ex,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#F8FAFC",borderRadius:10,marginBottom:6,filter:"blur(0.5px)"}}>
                        <div style={{width:32,height:32,background:"#C6F6D5",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>📈</div>
                        <div style={{flex:1,minWidth:0,textAlign:"left"}}>
                          <div style={{fontWeight:600,fontSize:12,color:C.text}}>{ex.title}</div>
                          <div style={{fontSize:10,color:C.sub}}>{fmt(ex.buy)} → {fmt(ex.sell)}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:13,fontWeight:800,color:C.green}}>+{fmt(ex.margin)}</div>
                          <div style={{fontSize:10,color:C.sub}}>{fmtp(ex.pct)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {!isPremium&&(
                  <div className="card" style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:12,background:"linear-gradient(135deg,#3EACA008,#E8956D08)",border:"1px solid #E8956D33"}}>
                    <div style={{fontSize:20}}>⭐</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:700,color:C.text}}>Analyse avancée disponible en Premium</div>
                      <div style={{fontSize:11,color:C.sub}}>Graphiques, tendances et statistiques détaillées</div>
                    </div>
                    <PremiumBanner userEmail={user?.email} compact/>
                  </div>
                )}
              </div>
            ):(
              <>
                {sales.map(s=>{
                  const d=new Date(s.date);const smc=s.margin<0?C.red:C.green;
                  return(
                    <SwipeRow key={s.id} onDelete={()=>delSale(s.id)}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:800,fontSize:13,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                        <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",marginTop:2}}>{d.getDate()} {MONTHS_FR[d.getMonth()]} {d.getFullYear()}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,paddingRight:36}}>
                        <div style={{fontWeight:900,fontSize:14,color:"#0D0D0D"}}>{fmt(s.sell)}</div>
                        <div style={{fontSize:11,fontWeight:700,color:smc,marginTop:2}}>{smc===C.green?"+":""}{fmt(s.margin)}</div>
                      </div>
                    </SwipeRow>
                  );
                })}
                {!isPremium&&(
                  <div className="card" style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:12,background:"linear-gradient(135deg,#3EACA008,#E8956D08)",border:"1px solid #E8956D33",marginTop:4}}>
                    <div style={{fontSize:20}}>⭐</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:700,color:C.text}}>Analyse avancée disponible en Premium</div>
                      <div style={{fontSize:11,color:C.sub}}>Graphiques, tendances et statistiques détaillées</div>
                    </div>
                    <PremiumBanner userEmail={user?.email} compact/>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── IMPORT MODAL ── */}
      {importModal&&(
        <>
          <div onClick={()=>setImportModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",zIndex:200}}/>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:201,background:"#fff",borderRadius:20,padding:"28px",width:"min(90vw,540px)",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:800,color:C.text}}>📥 Confirmer l'import</div>
              <button onClick={()=>setImportModal(null)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",color:C.sub}}>✕</button>
            </div>

            {/* ÉTAPE 6 : Mapping détecté */}
            <div style={{background:C.rowBg,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
                Correspondance — <span style={{color:C.teal}}>{importModal.sheetsRead} feuille{importModal.sheetsRead>1?"s":""} lue{importModal.sheetsRead>1?"s":""}, {importModal.validCount} ligne{importModal.validCount>1?"s":""} valide{importModal.validCount>1?"s":""} trouvée{importModal.validCount>1?"s":""}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {/* Titre (peut être multiple) */}
                <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,flexWrap:"wrap"}}>
                  <span style={{fontSize:14,flexShrink:0}}>🏷️</span>
                  <span style={{color:C.sub,minWidth:106,flexShrink:0}}>Titre / Nom * :</span>
                  {importModal.mapping.titres.length>0
                    ? <span style={{fontWeight:700,color:C.teal,flex:1}}>{importModal.mapping.titres.map(h=>`« ${h} »`).join(' + ')}</span>
                    : <select value="" onChange={e=>setImportModal(m=>({...m,mapping:{...m.mapping,titres:e.target.value?[e.target.value]:[]}}))}
                        style={{flex:1,fontSize:12,padding:"4px 8px",borderRadius:8,border:"1px solid #CBD5E0",background:"#fff",color:C.text,cursor:"pointer"}}>
                        <option value="">— Choisir une colonne —</option>
                        {importModal.headers.map(h=><option key={h} value={h}>{h}</option>)}
                      </select>
                  }
                </div>
                {/* Prix achat */}
                {[
                  {key:"prix_achat",label:"Prix d'achat",icon:"🛒",required:true},
                  {key:"prix_vente",label:"Prix de vente",icon:"💰",required:false},
                  {key:"statut",label:"Statut",icon:"📌",required:false},
                ].map(({key,label,icon})=>(
                  <div key={key} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,flexWrap:"wrap"}}>
                    <span style={{fontSize:14,flexShrink:0}}>{icon}</span>
                    <span style={{color:C.sub,minWidth:106,flexShrink:0}}>{label} :</span>
                    {importModal.mapping[key]
                      ? <span style={{fontWeight:700,color:C.teal,flex:1}}>✓ « {importModal.mapping[key]} »</span>
                      : <select value="" onChange={e=>setImportModal(m=>({...m,mapping:{...m.mapping,[key]:e.target.value||null}}))}
                          style={{flex:1,fontSize:12,padding:"4px 8px",borderRadius:8,border:"1px solid #CBD5E0",background:"#fff",color:C.text,cursor:"pointer"}}>
                          <option value="">— Choisir —</option>
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
                {importModal.rows.length>3&&<div style={{fontSize:11,color:C.label,textAlign:"center"}}>+ {importModal.rows.length-3} autre(s)</div>}
              </div>
            </div>

            {importModal.mapping.titres.length===0&&(
              <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#92400E",marginBottom:12}}>
                ⚠️ Colonne titre non détectée. Sélectionne-la ci-dessus ou les articles seront importés sans nom.
              </div>
            )}

            {importMsg&&<div style={{fontSize:12,color:C.red,marginBottom:12}}>{importMsg}</div>}

            <div style={{display:"flex",gap:10}}>
              <button onClick={handleImportConfirm} disabled={importLoading} style={{flex:1,padding:"13px",background:`linear-gradient(135deg,${C.teal},${C.peach})`,color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:importLoading?"not-allowed":"pointer",opacity:importLoading?0.7:1,transition:"all 0.2s"}}>
                {importLoading?"Import en cours...":"Importer les données →"}
              </button>
              <button onClick={()=>setImportModal(null)} style={{padding:"13px 20px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:12,color:C.sub,fontSize:14,fontWeight:600,cursor:"pointer"}}>
                Annuler
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── SETTINGS DRAWER ── */}
      {showSettings&&(
        <>
          <div onClick={()=>setShowSettings(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",backdropFilter:"blur(4px)",zIndex:200,animation:"fadeInBd 0.2s ease"}}/>
          <div style={{
            position:"fixed",zIndex:201,background:"#fff",
            boxShadow:"0 24px 80px rgba(0,0,0,0.2)",
            ...(window.innerWidth<768
              ? {bottom:0,left:"50%",transform:"translateX(-50%)",width:"min(85vw,480px)",borderRadius:"20px 20px 0 0",padding:"28px 24px 40px",animation:"slideUp 0.25s cubic-bezier(0.32,0.72,0,1)"}
              : {top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:380,borderRadius:20,padding:"32px 28px",animation:"fadeInBd 0.2s ease"}
            )
          }}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
              <div style={{fontSize:16,fontWeight:800,color:C.text}}>Paramètres</div>
              <button onClick={()=>setShowSettings(false)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",color:C.sub,flexShrink:0}}>✕</button>
            </div>

            {/* Profil */}
            <div style={{background:C.rowBg,borderRadius:14,padding:"14px 16px",marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Mon compte</div>
              <div style={{fontSize:13,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📧 {user?.email}</div>
              {isPremium&&<div style={{fontSize:12,color:C.teal,fontWeight:600,marginTop:5}}>⭐ Abonnement Premium actif</div>}
            </div>

            {/* Désabonnement — visible uniquement si premium */}
            {isPremium&&(
              <div style={{marginBottom:12}}>
                {cancelMsg?(
                  <div style={{background:"#F0FFF4",border:"1px solid #9AE6B4",borderRadius:12,padding:"12px 14px",fontSize:13,color:"#276749",fontWeight:600,lineHeight:1.5}}>
                    ✅ {cancelMsg}
                  </div>
                ):cancelStep===0?(
                  <button onClick={()=>setCancelStep(1)} style={{width:"100%",padding:"11px",background:"transparent",border:"1.5px solid rgba(232,149,109,0.6)",borderRadius:12,color:C.peach,fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.2s",textAlign:"left",display:"flex",alignItems:"center",gap:8}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(232,149,109,0.06)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                  >
                    <span>📭</span> Se désabonner
                  </button>
                ):(
                  <div style={{background:"rgba(232,149,109,0.08)",border:"1.5px solid rgba(232,149,109,0.4)",borderRadius:12,padding:"14px"}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:10}}>Confirmer la résiliation ?</div>
                    <div style={{fontSize:12,color:C.sub,marginBottom:12,lineHeight:1.5}}>Tu conserveras l'accès Premium jusqu'à la fin de ta période en cours. Aucun remboursement au prorata.</div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={handleCancelSubscription} disabled={cancelLoading} style={{flex:1,padding:"9px",background:C.peach,border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:cancelLoading?"not-allowed":"pointer",opacity:cancelLoading?0.7:1,transition:"all 0.2s"}}>
                        {cancelLoading?"...":"Confirmer"}
                      </button>
                      <button onClick={()=>setCancelStep(0)} disabled={cancelLoading} style={{flex:1,padding:"9px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:C.sub,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.2s"}}>
                        Annuler
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
                <div style={{fontSize:14,fontWeight:600}}>Support</div>
                <div style={{fontSize:12,color:C.sub}}>support@fillsell.app</div>
              </div>
            </a>

            {/* Mentions légales */}
            <a href="/legal" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,textDecoration:"none",color:C.text,transition:"background 0.15s",marginBottom:20,cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background=C.rowBg}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >
              <span style={{fontSize:18,flexShrink:0}}>📄</span>
              <div style={{fontSize:14,fontWeight:600}}>Mentions légales</div>
            </a>

            {/* Déconnexion */}
            <button onClick={()=>{handleLogout();setShowSettings(false);}} style={{width:"100%",padding:"13px",background:"transparent",border:`1.5px solid ${C.red}88`,borderRadius:12,color:C.red,fontSize:14,fontWeight:700,cursor:"pointer",transition:"all 0.2s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(229,62,62,0.06)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >Se déconnecter</button>
          </div>
          <style>{`
            @keyframes slideUp{from{transform:translateX(-50%) translateY(100%)}to{transform:translateX(-50%) translateY(0)}}
            @keyframes fadeInBd{from{opacity:0}to{opacity:1}}
          `}</style>
        </>
      )}

      <div className="mobile-nav" style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 -2px 12px rgba(0,0,0,0.06)",zIndex:100,padding:"8px 12px",gap:4,paddingBottom:"calc(8px + env(safe-area-inset-bottom))"}}>
        {TABS_MOBILE.map(t=>(
          <button key={t.idx} onClick={()=>{setTab(t.idx);localStorage.setItem('tab',t.idx);}} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"6px 0 8px",background:"transparent",border:"none",cursor:"pointer",color:tab===t.idx?"#1D9E75":"#A3A9A6",transition:"all 0.15s"}}>
            <div style={{fontSize:20,marginBottom:2,transform:tab===t.idx?"scale(1.1)":"scale(1)",transition:"transform 0.15s"}}>{t.icon}</div>
            <div style={{fontSize:10,fontWeight:tab===t.idx?800:600,letterSpacing:0.2}}>{t.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
