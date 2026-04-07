import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler);
ChartJS.defaults.font.family = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

const C = {
  teal:"#3EACA0", tealLight:"#E8F7F6",
  peach:"#E8956D",
  white:"#FFFFFF",
  text:"#0F172A", sub:"#475569", label:"#94A3B8",
  border:"rgba(0,0,0,0.06)",
  red:"#E53E3E", redLight:"#FFF5F5",
  green:"#38A169", greenLight:"#F0FFF4",
  orange:"#DD6B20", orangeLight:"#FFFAF0",
  rowBg:"#F8FAFC", rowHover:"#F1F5F9",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{margin:0;padding:0;width:100%;max-width:100vw;overflow-x:hidden !important;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-x:none;}
  body{font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;background:#F4F6F9;min-height:100vh;touch-action:pan-y;}
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
      <div style={{position:"relative",display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:"#F9FAFB",borderRadius:12,transition:"background 0.15s"}}
        onMouseEnter={e=>{e.currentTarget.style.background="#F3F4F6";e.currentTarget.querySelector('.delx').style.opacity='1';}}
        onMouseLeave={e=>{e.currentTarget.style.background="#F9FAFB";e.currentTarget.querySelector('.delx').style.opacity='0';}}
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
    <div style={{position:"relative",borderRadius:12,overflow:"hidden",maxWidth:"100%"}}>
      <div ref={bgRef} onClick={handleDelClick} style={{position:"absolute",right:-80,top:0,bottom:0,width:80,background:"linear-gradient(135deg,#FF6B6B,#E53E3E)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:0,pointerEvents:"none"}}>
        <span style={{fontSize:22}}>🗑️</span>
      </div>
      <div ref={innerRef} style={{position:"relative",zIndex:1,width:"100%",display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:"#F9FAFB",borderRadius:12}}
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
        style={{padding:"7px 14px",background:loading?"#E5E7EB":"linear-gradient(135deg,#3EACA0,#E8956D)",color:loading?"#9CA3AF":"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:loading?"not-allowed":"pointer",boxShadow:loading?"none":"0 4px 14px rgba(62,172,160,0.3)",transition:"all 0.2s",whiteSpace:"nowrap",flexShrink:0}}
        onMouseEnter={e=>{if(!loading)e.currentTarget.style.transform="translateY(-2px)";}}
        onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";}}
      >
        {loading ? "..." : "Passer au premium 🚀"}
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

const Kpi=({label,value,sub,color,icon})=>(
  <div className="kpi card" style={{padding:"20px 20px 16px"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
      <span style={{fontSize:10,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:1}}>{label}</span>
      <div style={{width:34,height:34,background:color+"18",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{icon}</div>
    </div>
    <div style={{fontSize:30,fontWeight:900,color:color,letterSpacing:"-1px",lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:C.label,marginTop:8,fontWeight:500}}>{sub}</div>}
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
  const [isPremium,setIsPremium]=useState(false);
  const [firstItemAdded,setFirstItemAdded]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
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
  const mc=margin<0?C.red:C.teal;

  const now=new Date();
  const mData=Array.from({length:6},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);
    const m=d.getMonth();const y=d.getFullYear();
    const ms=sales.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===m&&sd.getFullYear()===y;});
    return{name:MONTHS_FR[m],profit:ms.reduce((a,s)=>a+s.margin,0),"Marge %":ms.length?ms.reduce((a,s)=>a+s.marginPct,0)/ms.length:0,count:ms.length};
  });

  const hasData=sales.length>0;
  const tm=mData[mData.length-1];

  const _f={family:"'Plus Jakarta Sans', -apple-system, sans-serif",size:11};
  const _tip={backgroundColor:'#ffffff',titleColor:'#94A3B8',borderColor:'rgba(0,0,0,0.09)',borderWidth:1,padding:12,cornerRadius:12,displayColors:false,titleFont:{..._f,size:11,weight:'600'},bodyFont:{..._f,size:14,weight:'800'}};
  const _scales=(unit)=>({
    x:{grid:{display:false},border:{display:false},ticks:{color:'#94A3B8',font:_f}},
    y:{grid:{color:'#F1F5F9',drawTicks:false},border:{display:false},ticks:{color:'#94A3B8',font:_f,padding:8,callback:v=>v+unit}},
  });
  const barChartData={
    labels:mData.map(d=>d.name),
    datasets:[{
      data:mData.map(d=>d.profit),
      backgroundColor:'#3EACA0',
      hoverBackgroundColor:'#35958a',
      borderRadius:8,
      borderSkipped:false,
    }],
  };
  const lineChartData={
    labels:mData.map(d=>d.name),
    datasets:[{
      data:mData.map(d=>d['Marge %']),
      borderColor:'#E8956D',
      backgroundColor:'rgba(232,149,109,0.10)',
      borderWidth:3,
      tension:0.4,
      pointBackgroundColor:'#E8956D',
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
    plugins:{legend:{display:false},tooltip:{..._tip,bodyColor:'#3EACA0',callbacks:{title:([i])=>i.label,label:ctx=>`${(ctx.raw||0).toFixed(2).replace('.',',')} €`}}},
    scales:_scales('€'),
  };
  const lineOpts={
    responsive:true,maintainAspectRatio:false,
    animation:{duration:700,easing:'easeOutQuart'},
    plugins:{legend:{display:false},tooltip:{..._tip,bodyColor:'#E8956D',callbacks:{title:([i])=>i.label,label:ctx=>`${(ctx.raw||0).toFixed(1)} %`}}},
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
        const ws=wb.Sheets[wb.SheetNames[0]];
        const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
        console.log('[Import] Raw matrix (first 10 rows):',matrix.slice(0,10));

        // ÉTAPE 1 : Trouver la ligne headers
        const KEYWORDS=/nom|titre|article|marque|produit|achat|vente|prix|libell[eé]|d[eé]sign|item|brand|statut/i;
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
        console.log('[Import] Header row index:',headerRowIdx,'score:',bestScore);

        if(headerRowIdx<0){
          setImportMsg("Impossible de détecter les en-têtes. Vérifiez que le fichier contient des noms de colonnes.");
          return;
        }

        const headerRow=matrix[headerRowIdx].map(c=>String(c??'').trim());
        console.log('[Import] Header row:',headerRow);

        // Convertit les lignes de données en objets clé→valeur
        const rows=matrix.slice(headerRowIdx+1)
          .filter(r=>r.some(c=>String(c??'').trim()!==''))
          .map(r=>{
            const obj={};
            headerRow.forEach((h,ci)=>{if(h) obj[h]=r[ci]??'';});
            return obj;
          });

        if(!rows.length){setImportMsg("Aucune donnée trouvée sous les en-têtes.");return;}

        const mapping=detectColumns(headerRow.filter(h=>h!==''),rows);

        // Calcule le nombre de lignes valides pour l'affichage
        const validCount=rows.filter(r=>{
          const buy=parseFloat(String(r[mapping.prix_achat]??0).replace(',','.'))||0;
          const nom=buildTitre(r,mapping.titres);
          return buy>0||nom!=="Article importé";
        }).length;

        setImportModal({rows,mapping,preview:rows.slice(0,3),headers:headerRow.filter(h=>h!==''),validCount});
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
      return{
        id:Date.now()+idx,
        user_id:user.id,
        titre,
        prix_achat:buy,
        prix_vente:hasSell?sell:null,
        margin,
        margin_pct:marginPct,
        statut,
        date:now,
        created_at:now,
      };
    }).filter(r=>r.prix_achat>0||r.titre!=="Article importé");
    console.log('[Import] Inserting',toInsert.length,'rows — sample:',toInsert[0]);

    const{data,error}=await supabase.from('inventaire').insert(toInsert).select();
    setImportLoading(false);
    if(error){setImportMsg("Erreur import : "+error.message);return;}
    setItems(prev=>[...(data||[]).map(mapItem),...prev]);
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
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:`linear-gradient(135deg,${C.teal} 0%,${C.peach} 100%)`}}>
      <div style={{color:"#fff",fontSize:18,fontWeight:700}}>Chargement...</div>
    </div>
  );

  if(!user||loginOnly)return(
    <div style={{position:"fixed",inset:0,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",background:`linear-gradient(135deg,${C.teal} 0%,${C.peach} 100%)`,overflow:"hidden",boxSizing:"border-box"}}>
      <div style={{background:"#fff",borderRadius:24,padding:"36px 28px",width:"100%",maxWidth:400,boxShadow:"0 24px 64px rgba(0,0,0,0.2)",boxSizing:"border-box"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <img src="/logo.png" style={{height:52,marginBottom:12,objectFit:"contain"}} alt="Fill & Sell"/>
          <div style={{fontSize:15,color:C.sub,fontWeight:500}}>Connecte-toi pour continuer</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}
            style={{padding:"13px 16px",borderRadius:12,border:"1px solid rgba(0,0,0,0.12)",fontSize:15,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"}}/>
          <input type="password" placeholder="Mot de passe" value={password} onChange={e=>setPassword(e.target.value)}
            style={{padding:"13px 16px",borderRadius:12,border:"1px solid rgba(0,0,0,0.12)",fontSize:15,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"}}/>
          <button onClick={handleLogin}
            style={{padding:"14px",background:`linear-gradient(135deg,${C.teal},${C.peach})`,color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",width:"100%",boxShadow:"0 4px 16px rgba(62,172,160,0.35)"}}>
            Se connecter
          </button>
          <button onClick={handleSignup}
            style={{padding:"14px",background:"transparent",color:C.teal,border:`1px solid ${C.teal}`,borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",width:"100%"}}>
            Créer un compte
          </button>
        </div>
      </div>
    </div>
  );

  return(
    <div className="app-root" style={{overflowX:"hidden",maxWidth:"100vw",position:"relative"}}>
      <style>{css}</style>

      <div style={{background:"linear-gradient(135deg,#3EACA0ee 0%,#E8956Ddd 100%)",boxShadow:"0 6px 24px rgba(0,0,0,0.12)",backdropFilter:"blur(8px)"}}>
        <div className="wrap" style={{display:"flex",alignItems:"center",justifyContent:"space-between",height:72,padding:"0 24px"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <img src="/logo.png" style={{height:42,objectFit:"contain",filter:"drop-shadow(0 2px 8px rgba(0,0,0,0.2))"}} alt="Fill & Sell"/>
            <div style={{fontSize:13.5,color:"rgba(255,255,255,0.95)",fontWeight:600,letterSpacing:"0.3px",fontStyle:"italic"}}>Maximise tes profits 📈</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div className="header-stats" style={{gap:12}}>
              {headerStats.map((b,i)=>(
                <div key={i} style={{background:"rgba(255,255,255,0.18)",backdropFilter:"blur(16px)",borderRadius:14,padding:"7px 18px",textAlign:"center",border:"1px solid rgba(255,255,255,0.28)",transition:"all 0.2s ease",cursor:"default"}}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.28)";e.currentTarget.style.transform="translateY(-3px)";}}
                onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.18)";e.currentTarget.style.transform="translateY(0)";}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.75)",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{b.label}</div>
                  <div style={{fontSize:15,fontWeight:900,color:"#fff"}}>{b.value}</div>
                </div>
              ))}
            </div>
            {isPremium&&(
              <div style={{background:"rgba(255,255,255,0.2)",borderRadius:99,padding:"5px 12px",fontSize:11,fontWeight:700,color:"#fff",border:"1px solid rgba(255,255,255,0.35)",whiteSpace:"nowrap"}}>⭐ Premium</div>
            )}
            <button onClick={()=>{setShowSettings(true);setCancelStep(0);setCancelMsg("");}} title="Paramètres" style={{background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:10,padding:"6px 11px",color:"#fff",fontSize:18,cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.32)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
            >⚙️</button>
          </div>
        </div>
      </div>

      <div className="desktop-nav" style={{background:"rgba(255,255,255,0.96)",backdropFilter:"blur(16px)",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
        <div className="wrap">
          <div style={{display:"flex",justifyContent:"center",padding:"10px 0",gap:4}}>
            {["📊 Dashboard","📦 Inventaire","🧮 Calculer","📋 Historique"].map((t,i)=>(
              <button key={i} onClick={()=>{setTab(i);localStorage.setItem('tab',i);}}
                style={{padding:"9px 20px",background:tab===i?"#fff":"transparent",border:"none",borderRadius:10,color:tab===i?C.teal:C.sub,fontSize:13,fontWeight:tab===i?700:500,whiteSpace:"nowrap",cursor:"pointer",transition:"all 0.15s ease",boxShadow:tab===i?"0 1px 6px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)":"none"}}
                onMouseEnter={e=>{if(i!==tab){e.currentTarget.style.background="rgba(0,0,0,0.04)";e.currentTarget.style.color=C.text;}}}
                onMouseLeave={e=>{if(i!==tab){e.currentTarget.style.background="transparent";e.currentTarget.style.color=C.sub;}}}
              >{t}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="wrap page-pad" style={{padding:"28px 20px 72px"}}>

        {tab===0&&(
          <div style={{display:"flex",flexDirection:"column",gap:28,width:"100%",overflow:"hidden"}}>
            {!isPremium&&!loading&&(
              <div style={{background:20-items.length<=5?"#FFFBEB":C.tealLight,border:`1px solid ${20-items.length<=5?"#FDE68A":C.teal+"33"}`,borderRadius:12,padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",overflow:"hidden"}}>
                <div style={{fontSize:13,fontWeight:600,color:items.length>=14?"#C05621":items.length>=10?"#D97706":C.teal}}>
                  {items.length>=14
                    ? `🔴 Plus que ${20-items.length} article${20-items.length>1?"s":""} avant la limite !`
                    : items.length>=10
                    ? `⚠️ Plus que ${20-items.length} article${20-items.length>1?"s":""} avant de passer au premium`
                    : `Il te reste ${20-items.length} article${20-items.length>1?"s":""} gratuit${20-items.length>1?"s":""}`
                  }
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{fontSize:12,fontWeight:800,color:20-items.length<=5?"#92400E":C.teal}}>{items.length}/20</div>
                  <PremiumBanner userEmail={user?.email} compact/>
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
                <div className="grid4">
                  <Kpi label="Bénéfice ce mois" value={fmt(tm?.profit||0)} sub={`${tm?.count||0} vente(s)`} color={C.teal} icon="💰"/>
                  <Kpi label="Marge moyenne" value={fmtp(avgM)} sub="toutes ventes" color={C.peach} icon="📊"/>
                  <Kpi label="Revenu brut" value={fmt(totalR)} sub="total encaissé" color={C.teal} icon="🏆"/>
                  <Kpi label="Capital investi" value={fmt(invested)} sub={<span><span style={{display:"block",color:C.green}}>{fmt(recovered)} récupérés</span><span style={{display:"block",color:C.sub,marginTop:2}}>{stock.length} en stock</span></span>} color={C.orange} icon="💸"/>
                </div>

                <div className="grid2">
                  <div className="card" style={{padding:"20px"}}>
                    <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:4,letterSpacing:"-0.2px"}}>Bénéfices mensuels</div>
                    <div style={{fontSize:11,color:C.label,marginBottom:14,fontWeight:500}}>6 derniers mois</div>
                    <div style={{position:"relative",height:"200px",width:"100%"}}>
                      <Bar data={barChartData} options={barOpts}/>
                    </div>
                  </div>
                  <div className="card" style={{padding:"20px"}}>
                    <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:4,letterSpacing:"-0.2px"}}>Évolution marge %</div>
                    <div style={{fontSize:11,color:C.label,marginBottom:14,fontWeight:500}}>6 derniers mois</div>
                    <div style={{position:"relative",height:"200px",width:"100%"}}>
                      <Line data={lineChartData} options={lineOpts}/>
                    </div>
                  </div>
                </div>

                {hasData&&(
                  <div className="card" style={{padding:"20px"}}>
                    <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:16}}>Dernières ventes</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {sales.slice(0,5).map(s=>{
                        const d=new Date(s.date);const smc=s.margin<0?C.red:C.green;
                        return(
                          <SwipeRow key={s.id} onDelete={()=>delSale(s.id)}>
                            <div style={{width:36,height:36,background:smc+"18",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{s.margin>=0?"📈":"📉"}</div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:600,fontSize:13,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                              <div style={{fontSize:11,color:C.sub,marginTop:2}}>{d.getDate()} {MONTHS_FR[d.getMonth()]}</div>
                            </div>
                            <div style={{textAlign:"right",paddingRight:36}}>
                              <div style={{fontWeight:800,fontSize:14,color:smc}}>{fmt(s.margin)}</div>
                              <div style={{fontSize:11,color:C.sub}}>{fmtp(s.marginPct)}</div>
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
            <div className="card" style={{padding:"20px",display:"flex",flexDirection:"column",gap:12,border:items.length===0?`1.5px solid ${C.teal}44`:"1px solid rgba(0,0,0,0.05)",boxShadow:items.length===0?"0 0 0 4px "+C.teal+"11, 0 10px 30px rgba(0,0,0,0.08)":"0 10px 30px rgba(0,0,0,0.08)"}}>
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
                : <Btn onClick={addItem} disabled={!iTitle||!iBuy} color={iSaved?"#38A169":C.teal} full>
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
                <div className="card" style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
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
                <div className="card" style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:12,background:"linear-gradient(135deg,#3EACA008,#E8956D08)",border:"1px solid #E8956D33"}}>
                  <span style={{fontSize:18}}>🔒</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.text}}>Import / Export Excel</div>
                    <div style={{fontSize:11,color:C.sub}}>Fonctionnalité Premium — importe et exporte tes données</div>
                  </div>
                  <PremiumBanner userEmail={user?.email} compact/>
                </div>
              )}

              <div className="card" style={{padding:"20px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.text}}>📦 En stock</div>
                    {!isPremium&&items.length>=20&&<span style={{fontSize:10,fontWeight:700,background:"#E8956D22",color:"#E8956D",borderRadius:99,padding:"2px 8px",border:"1px solid #E8956D44"}}>Plan gratuit</span>}
                  </div>
                  <div style={{background:C.orangeLight,color:C.orange,borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{stock.length} art. · {fmt(stockVal)}</div>
                </div>
                {stock.length===0?<Empty text="Ton inventaire apparaîtra ici"/>:(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {stock.map(item=>(
                      <SwipeRow key={item.id} onDelete={()=>delItem(item.id)}>
                        <div style={{width:36,height:36,background:C.orangeLight,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>📦</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:13,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                          <div style={{fontSize:11,color:C.sub,marginTop:2}}>Investi {fmt(item.buy)}</div>
                        </div>
                        <button onClick={(e)=>{e.stopPropagation();markSold(item);}} style={{background:C.tealLight,color:C.teal,border:"none",borderRadius:8,padding:"7px 12px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>Vendu</button>
                      </SwipeRow>
                    ))}
                  </div>
                )}
              </div>

              <div className="card" style={{padding:"20px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.text}}>✅ Vendus</div>
                  <div style={{background:C.greenLight,color:C.green,borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{sold.length} vente{sold.length>1?"s":""}</div>
                </div>
                {sold.length===0?<Empty text="Aucune vente encore"/>:(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {sold.map(item=>{
                      const smc=item.margin<0?C.red:C.green;
                      return(
                        <SwipeRow key={item.id} onDelete={()=>delItem(item.id)}>
                          <div style={{width:36,height:36,background:smc+"18",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>📈</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:600,fontSize:13,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                            <div style={{fontSize:11,color:C.sub,marginTop:2}}>{fmt(item.buy)} → {fmt(item.sell)}</div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0,paddingRight:36}}>
                            <div style={{fontWeight:800,fontSize:14,color:smc}}>{fmt(item.margin)}</div>
                            <div style={{fontSize:11,color:C.sub}}>{fmtp(item.marginPct)}</div>
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
              background:isValid?(margin>=0?"linear-gradient(135deg,#F0FFF4,#E6FFFA)":"linear-gradient(135deg,#FFF5F5,#FED7D7)"):"#fff",
              borderRadius:20,padding:"28px 24px",
              border:`1.5px solid ${isValid?(margin>=0?C.green:C.red)+"44":"#E2E8F0"}`,
              boxShadow:"0 4px 20px rgba(0,0,0,0.06)",
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
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Profit estimé</div>
                      <div style={{fontSize:52,fontWeight:900,color:mc,letterSpacing:"-2.5px",lineHeight:1,transition:"color 0.3s"}}>{fmt(margin)}</div>
                    </div>
                    <div style={{background:"rgba(255,255,255,0.8)",borderRadius:16,padding:"14px 20px",textAlign:"center",border:"1px solid rgba(0,0,0,0.06)",backdropFilter:"blur(8px)"}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Rentabilité</div>
                      <div style={{fontSize:32,fontWeight:900,color:mc,letterSpacing:"-1px"}}>{fmtp(marginPct)}</div>
                    </div>
                  </div>
                  {/* Barre de progression */}
                  <div style={{height:6,background:"rgba(0,0,0,0.06)",borderRadius:99,marginBottom:14}}>
                    <div style={{width:`${Math.min(100,Math.max(0,marginPct))}%`,height:"100%",background:margin<0?C.red:`linear-gradient(90deg,${C.teal},${C.peach})`,borderRadius:99,transition:"width 0.4s ease"}}/>
                  </div>
                  {/* Insight automatique */}
                  <div style={{
                    display:"inline-flex",alignItems:"center",gap:6,
                    background:"rgba(255,255,255,0.7)",borderRadius:99,
                    padding:"5px 14px",fontSize:12,fontWeight:700,
                    color:margin<0?C.red:marginPct>=30?C.green:marginPct>=15?C.orange:C.sub,
                    border:"1px solid rgba(0,0,0,0.06)"
                  }}>
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
              <div className="card" style={{padding:"16px 22px",display:"flex",justifyContent:"space-around"}}>
                {[{label:"Coût total",value:fmt(buy+ship),color:C.sub},{label:"Revenu brut",value:fmt(sell),color:C.teal},{label:"Bénéfice net",value:fmt(margin),color:mc}].map((item,i)=>(
                  <div key={i} style={{textAlign:"center"}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>{item.label}</div>
                    <div style={{fontSize:16,fontWeight:800,color:item.color}}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── CTA ── */}
            <Btn onClick={addSale} disabled={!isValid} color={cSaved?"#38A169":`linear-gradient(135deg,${C.teal},${C.peach})`} full>
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
                  {label:"Profit total",value:fmt(totalM),color:totalM>=0?C.green:C.red,icon:"💰"},
                  {label:"Nb de ventes",value:sales.length,color:C.teal,icon:"📦"},
                  {label:"Profit moyen",value:fmt(sales.length?totalM/sales.length:0),color:C.peach,icon:"📊"},
                ].map((s,i)=>(
                  <div key={i} className="card" style={{padding:"14px 12px",textAlign:"center"}}>
                    <div style={{fontSize:18,marginBottom:4}}>{s.icon}</div>
                    <div style={{fontSize:11,color:C.label,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>{s.label}</div>
                    <div style={{fontSize:16,fontWeight:900,color:s.color}}>{s.value}</div>
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
                      <div style={{width:38,height:38,background:smc+"18",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{s.margin>=0?"📈":"📉"}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:13,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
                        <div style={{fontSize:11,color:C.sub,marginTop:2}}>{d.getDate()} {MONTHS_FR[d.getMonth()]} {d.getFullYear()} · {fmt(s.buy)} → {fmt(s.sell)}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,paddingRight:36}}>
                        <div style={{fontWeight:800,fontSize:14,color:smc}}>{fmt(s.margin)}</div>
                        <div style={{fontSize:11,color:C.sub,marginTop:2}}>{fmtp(s.marginPct)}</div>
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
                Correspondance — <span style={{color:C.teal}}>{importModal.validCount} ligne{importModal.validCount>1?"s":""} valide{importModal.validCount>1?"s":""}</span>
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

      <div className="mobile-nav" style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(255,255,255,0.96)",backdropFilter:"blur(16px)",boxShadow:"0 -4px 24px rgba(0,0,0,0.08)",zIndex:100,paddingBottom:"env(safe-area-inset-bottom)",padding:"8px 12px",gap:4}}>
        {TABS_MOBILE.map(t=>(
          <button key={t.idx} onClick={()=>{setTab(t.idx);localStorage.setItem('tab',t.idx);}} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"8px 0 10px",background:tab===t.idx?"#fff":"transparent",border:"none",borderRadius:10,cursor:"pointer",color:tab===t.idx?C.teal:C.label,transition:"all 0.15s",boxShadow:tab===t.idx?"0 1px 6px rgba(0,0,0,0.08),0 0 0 1px rgba(0,0,0,0.04)":"none"}}>
            <div style={{fontSize:21,marginBottom:2,transform:tab===t.idx?"scale(1.12)":"scale(1)",transition:"transform 0.15s"}}>{t.icon}</div>
            <div style={{fontSize:10,fontWeight:tab===t.idx?700:500,letterSpacing:0.3}}>{t.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
