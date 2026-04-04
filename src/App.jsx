import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from './lib/supabase';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

const C = {
  teal:"#3EACA0", tealLight:"#E8F7F6",
  peach:"#E8956D",
  white:"#FFFFFF",
  text:"#111827", sub:"#6B7280", label:"#9CA3AF",
  border:"rgba(0,0,0,0.06)",
  red:"#E53E3E", redLight:"#FFF5F5",
  green:"#38A169", greenLight:"#F0FFF4",
  orange:"#DD6B20", orangeLight:"#FFFAF0",
  rowBg:"#F9FAFB", rowHover:"#F3F4F6",
};

const css = `
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{width:100%;max-width:100%;overflow-x:hidden;}*::-webkit-scrollbar{display:none;}*{-ms-overflow-style:none;scrollbar-width:none;}body{background:linear-gradient(180deg,#F8F7F4 0%,#E8E3DA 100%);min-height:100vh;overscroll-behavior-x:none;touch-action:pan-y;}
  input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
  input[type=number]{-moz-appearance:textfield;}
  .inp{transition:all 0.2s ease;}
  .inp:focus-within{border-color:${C.teal}!important;box-shadow:0 0 0 3px ${C.teal}22!important;}
  .btn{transition:all 0.2s ease;cursor:pointer;}
  .btn:hover:not(:disabled){opacity:0.92;transform:translateY(-2px);}
  .dtab{transition:all 0.15s;cursor:pointer;}
  .dtab:hover{color:${C.teal}!important;}
  .card{background:#fff;border-radius:16px;border:1px solid rgba(0,0,0,0.05);box-shadow:0 10px 30px rgba(0,0,0,0.08);transition:all 0.2s ease;}
  .kpi{transition:all 0.2s ease;}
  .kpi:hover{transform:translateY(-4px);box-shadow:0 16px 40px rgba(0,0,0,0.12)!important;}
  .wrap{width:100%;max-width:1280px;margin:0 auto;padding:0 20px;}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
  .grid-inv{display:grid;grid-template-columns:300px 1fr;gap:20px;align-items:start;width:100%;}
  .desktop-nav{display:flex;}
  .mobile-nav{display:none;}
  .header-stats{display:flex;}
  @media(max-width:1024px){.grid4{grid-template-columns:repeat(2,1fr);}}
  @media(max-width:768px){
    .grid4{grid-template-columns:repeat(2,1fr);}
    .grid2{grid-template-columns:1fr;}
    .grid-inv{grid-template-columns:1fr;width:100%;overflow:hidden;box-sizing:border-box;}
    .wrap{padding:0 16px;overflow-x:hidden;}
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

function PremiumBanner({ userEmail }){
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

  return(
    <div style={{background:"linear-gradient(135deg,#3EACA008,#E8956D0D)",border:"1.5px solid #E8956D55",borderRadius:16,padding:"20px 22px",display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
        <div style={{fontSize:26,flexShrink:0}}>🔒</div>
        <div>
          <div style={{fontSize:14,fontWeight:800,color:"#111827",marginBottom:4}}>Limite du plan gratuit atteinte</div>
          <div style={{fontSize:12,color:"#6B7280",lineHeight:1.6}}>Tu as atteint 20 articles. Passe au plan premium pour un inventaire illimité et continuer à développer ton business.</div>
        </div>
      </div>
      <button
        onClick={handleCheckout}
        disabled={loading}
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
  <div className="kpi card" style={{padding:"18px"}}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
      <div style={{width:38,height:38,background:color+"20",borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19}}>{icon}</div>
      <span style={{fontSize:10,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:0.8}}>{label}</span>
    </div>
    <div style={{fontSize:26,fontWeight:900,color,letterSpacing:"-0.5px",lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:C.sub,marginTop:8}}>{sub}</div>}
  </div>
);

const Field=({label,value,set,placeholder,type="text",icon,suffix})=>(
  <div className="inp" style={{background:C.white,borderRadius:14,padding:"14px 16px",border:`1px solid rgba(0,0,0,0.08)`,display:"flex",alignItems:"center",gap:12,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
    <span style={{fontSize:22,flexShrink:0}}>{icon}</span>
    <div style={{flex:1}}>
      <div style={{fontSize:10,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        <input type={type} value={value} onChange={e=>set(e.target.value)} placeholder={placeholder}
          inputMode={type==="number"?"decimal":undefined}
          style={{background:"transparent",border:"none",outline:"none",color:C.text,fontSize:17,fontWeight:700,width:"100%",fontFamily:"inherit"}}/>
        {suffix&&<span style={{color:C.sub,fontSize:14,fontWeight:500}}>{suffix}</span>}
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
  }}>{children}</button>
);

function mapItem(v){return{id:v.id,title:v.titre,buy:v.prix_achat,sell:v.prix_vente,margin:v.margin,marginPct:v.margin_pct,statut:v.statut,date:v.date};}
function mapSale(v){return{id:v.id,title:v.titre,buy:v.prix_achat,sell:v.prix_vente,ship:0,margin:v.benefice,marginPct:v.prix_vente>0?(v.benefice/v.prix_vente)*100:0,date:v.date};}

export default function App({ loginOnly = false }){
  const navigate = useNavigate();
  const [tab,setTab]=useState(0);
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

  async function fetchAll(uid){
    setLoading(true);
    const [v,i,p]=await Promise.all([
      supabase.from('ventes').select('*').eq('user_id',uid).order('created_at',{ascending:false}),
      supabase.from('inventaire').select('*').eq('user_id',uid).order('created_at',{ascending:false}),
      supabase.from('profiles').select('is_premium').eq('id',uid).single(),
    ]);
    if(!v.error) setSales((v.data||[]).map(mapSale));
    if(!i.error) setItems((i.data||[]).map(mapItem));
    if(!p.error) setIsPremium(p.data?.is_premium||false);
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
    setISaved(true);setTimeout(()=>setISaved(false),1600);
    setITitle("");setIBuy("");setISell("");
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

  async function handleLogin(){
    if(!email||!password){alert("Remplis email et mot de passe");return;}
    const{error}=await supabase.auth.signInWithPassword({email,password});
    if(error)alert(error.message);
  }

  async function handleSignup(){
    if(!email||!password){alert("Remplis email et mot de passe");return;}
    const{error}=await supabase.auth.signUp({email,password});
    if(error)alert(error.message);
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
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:`linear-gradient(135deg,${C.teal} 0%,${C.peach} 100%)`}}>
      <div style={{background:"#fff",borderRadius:20,padding:"40px 32px",width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <img src="/logo.png" style={{height:52,marginBottom:12}} alt="Fill & Sell"/>
          <div style={{fontSize:15,color:C.sub}}>Connecte-toi pour continuer</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} style={{padding:"13px 16px",borderRadius:12,border:"1px solid rgba(0,0,0,0.12)",fontSize:15,outline:"none",fontFamily:"inherit"}}/>
          <input type="password" placeholder="Mot de passe" value={password} onChange={e=>setPassword(e.target.value)} style={{padding:"13px 16px",borderRadius:12,border:"1px solid rgba(0,0,0,0.12)",fontSize:15,outline:"none",fontFamily:"inherit"}}/>
          <button onClick={handleLogin} style={{padding:"14px",background:C.teal,color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer"}}>Se connecter</button>
          <button onClick={handleSignup} style={{padding:"14px",background:"transparent",color:C.teal,border:`1px solid ${C.teal}`,borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer"}}>Créer un compte</button>
        </div>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",overflowX:"hidden",width:"100%",maxWidth:"100vw"}}>
      <style>{css}</style>

      <div style={{background:`linear-gradient(135deg,${C.teal}ee 0%,${C.peach}dd 100%)`,boxShadow:"0 6px 24px rgba(0,0,0,0.12)",backdropFilter:"blur(8px)"}}>
        <div className="wrap" style={{display:"flex",alignItems:"center",justifyContent:"space-between",height:72,padding:"0 24px"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <img src="/logo.png" style={{height:42,objectFit:"contain",filter:"drop-shadow(0 2px 8px rgba(0,0,0,0.2))"}} alt="Fill & Sell"/>
            <div style={{fontSize:13.5,color:"rgba(255,255,255,0.95)",fontWeight:600,letterSpacing:"0.3px",fontStyle:"italic"}}>Ton assistant Vinted 🏷️</div>
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
            <button onClick={handleLogout} style={{background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:10,padding:"6px 14px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>Déconnexion</button>
          </div>
        </div>
      </div>

      <div className="desktop-nav" style={{background:"rgba(255,255,255,0.85)",backdropFilter:"blur(12px)",borderBottom:`1px solid rgba(0,0,0,0.06)`,boxShadow:"0 1px 8px rgba(0,0,0,0.04)"}}>
        <div className="wrap">
          <div style={{display:"flex",overflowX:"auto"}}>
            {["📊 Dashboard","📦 Inventaire","🧮 Calculer","📋 Historique"].map((t,i)=>(
              <button key={i} className="dtab" onClick={()=>setTab(i)} style={{padding:"15px 20px",background:"transparent",border:"none",borderBottom:tab===i?`2px solid ${C.teal}`:"2px solid transparent",color:tab===i?C.teal:C.sub,fontSize:13,fontWeight:tab===i?700:400,marginBottom:-1,whiteSpace:"nowrap"}}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="wrap page-pad" style={{padding:"24px 20px 64px"}}>

        {tab===0&&(
          <div style={{display:"flex",flexDirection:"column",gap:28}}>
            {loading?(
              <div style={{textAlign:"center",padding:"60px 0",color:C.sub,fontSize:14,fontWeight:600}}>Chargement des données...</div>
            ):(
              <>
                <div className="grid4">
                  <div className="kpi card" style={{padding:"22px",boxShadow:"0 16px 40px rgba(0,0,0,0.12)",transform:"scale(1.02)",transformOrigin:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                      <div style={{width:42,height:42,background:C.teal+"20",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:21}}>💰</div>
                      <span style={{fontSize:10,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:0.8}}>Bénéfice ce mois</span>
                    </div>
                    <div style={{fontSize:30,fontWeight:900,color:C.teal,letterSpacing:"-0.5px",lineHeight:1}}>{fmt(tm?.profit||0)}</div>
                    <div style={{fontSize:11,color:C.sub,marginTop:8}}>{tm?.count||0} vente(s)</div>
                  </div>
                  <Kpi label="Marge moyenne" value={fmtp(avgM)} sub="toutes ventes" color={C.peach} icon="📊"/>
                  <Kpi label="Revenu brut" value={fmt(totalR)} sub="total encaissé" color={C.teal} icon="🏆"/>
                  <Kpi label="Capital investi" value={fmt(invested)} sub={<span><span style={{display:"block",color:C.green}}>{fmt(recovered)} récupérés</span><span style={{display:"block",color:C.sub,marginTop:2}}>{stock.length} en stock</span></span>} color={C.orange} icon="💸"/>
                </div>

                <div className="grid2">
                  <div className="card" style={{padding:"20px"}}>
                    <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:6}}>Bénéfices mensuels</div>
                    <div style={{fontSize:11,color:C.sub,marginBottom:16}}>6 derniers mois</div>
                    {hasData?(<ResponsiveContainer width="100%" height={175}><BarChart data={mData} barSize={26}><CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false}/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:C.sub,fontSize:11}}/><YAxis axisLine={false} tickLine={false} tick={{fill:C.sub,fontSize:11}} tickFormatter={v=>v+"€"}/><Tooltip content={<Tip/>}/><Bar dataKey="profit" name="Bénéfice" fill={C.teal} radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>):<Empty/>}
                  </div>
                  <div className="card" style={{padding:"20px"}}>
                    <div style={{fontSize:14,fontWeight:800,color:C.text,marginBottom:6}}>Évolution marge %</div>
                    <div style={{fontSize:11,color:C.sub,marginBottom:16}}>6 derniers mois</div>
                    {hasData?(<ResponsiveContainer width="100%" height={175}><LineChart data={mData}><CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false}/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill:C.sub,fontSize:11}}/><YAxis axisLine={false} tickLine={false} tick={{fill:C.sub,fontSize:11}} tickFormatter={v=>v+"%"}/><Tooltip content={<Tip/>}/><Line type="monotone" dataKey="Marge %" stroke={C.peach} strokeWidth={2.5} dot={{fill:C.peach,r:3,strokeWidth:0}} activeDot={{r:5}}/></LineChart></ResponsiveContainer>):<Empty/>}
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

                <div className="card" style={{padding:"20px",border:`1px solid ${C.red}22`,background:C.redLight}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.red,marginBottom:8}}>⚠️ Zone dangereuse</div>
                  <div style={{fontSize:12,color:C.sub,marginBottom:14}}>Supprime toutes tes ventes et ton inventaire de façon irréversible.</div>
                  {resetStep===0&&(
                    <button onClick={handleReset} style={{padding:"10px 20px",background:"transparent",border:`1px solid ${C.red}`,borderRadius:10,color:C.red,fontSize:13,fontWeight:700,cursor:"pointer"}}>🗑️ Tout remettre à zéro</button>
                  )}
                  {resetStep===1&&(
                    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.red}}>Tu es sûr ? Action irréversible.</div>
                      <button onClick={handleReset} style={{padding:"10px 20px",background:C.red,border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Oui, tout supprimer</button>
                      <button onClick={()=>setResetStep(0)} style={{padding:"10px 20px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:C.sub,fontSize:13,fontWeight:700,cursor:"pointer"}}>Annuler</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab===1&&(
          <div className="grid-inv">
            <div className="card" style={{padding:"20px",display:"flex",flexDirection:"column",gap:12}}>
              <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:4}}>Ajouter un article</div>
              <Field label="Nom" value={iTitle} set={setITitle} placeholder="Nike Air Max 90" icon="🏷️"/>
              <Field label="Prix d'achat" value={iBuy} set={setIBuy} placeholder="0,00" type="number" icon="🛒" suffix="€"/>
              <Field label="Prix de vente (optionnel)" value={iSell} set={setISell} placeholder="Vide = en stock" type="number" icon="📦" suffix="€"/>
              <div style={{background:C.rowBg,borderRadius:10,padding:"10px 14px",fontSize:11,color:C.sub,border:"1px solid rgba(0,0,0,0.06)",lineHeight:1.6}}>
                💡 Sans prix → <strong>stock</strong>. Avec prix → <strong>vendu</strong>.
              </div>
              {!isPremium&&items.length>=18&&items.length<20&&(
                <div style={{background:"#FFFBEB",borderRadius:10,padding:"10px 14px",fontSize:11,color:"#92400E",border:"1px solid #FDE68A",fontWeight:600}}>
                  ⚠️ {20-items.length} article{20-items.length>1?"s":""} restant{20-items.length>1?"s":""} sur ton plan gratuit
                </div>
              )}
              {!isPremium&&items.length>=20
                ? <PremiumBanner userEmail={user?.email}/>
                : <Btn onClick={addItem} disabled={!iTitle||!iBuy} color={iSaved?"#38A169":C.teal} full>
                    {iSaved?"✓ Ajouté !":"Ajouter à l'inventaire"}
                  </Btn>
              }
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div className="card" style={{padding:"20px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontSize:14,fontWeight:700,color:C.text}}>📦 En stock</div>
                    {!isPremium&&items.length>=20&&<span style={{fontSize:10,fontWeight:700,background:"#E8956D22",color:"#E8956D",borderRadius:99,padding:"2px 8px",border:"1px solid #E8956D44"}}>Plan gratuit</span>}
                  </div>
                  <div style={{background:C.orangeLight,color:C.orange,borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{stock.length} art. · {fmt(stockVal)}</div>
                </div>
                {stock.length===0?<Empty text="Aucun article en stock"/>:(
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
            <div style={{background:isValid?(margin>=0?C.greenLight:C.redLight):C.white,borderRadius:18,padding:"24px",border:`1px solid ${isValid?(margin>=0?C.green:C.red)+"44":"rgba(0,0,0,0.06)"}`,boxShadow:"0 10px 30px rgba(0,0,0,0.08)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>Marge nette</div>
                  <div style={{fontSize:48,fontWeight:900,color:isValid?mc:"#D1D5DB",letterSpacing:"-2px",lineHeight:1}}>{isValid?fmt(margin):"—"}</div>
                </div>
                <div style={{background:C.white,borderRadius:14,padding:"16px 22px",textAlign:"center",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 4px 12px rgba(0,0,0,0.06)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>Taux</div>
                  <div style={{fontSize:30,fontWeight:900,color:isValid?mc:"#D1D5DB",letterSpacing:"-1px"}}>{isValid?fmtp(marginPct):"—"}</div>
                </div>
              </div>
              {isValid&&sell>0&&(
                <div style={{marginTop:18,height:5,background:"rgba(0,0,0,0.06)",borderRadius:99}}>
                  <div style={{width:`${Math.min(100,Math.max(0,marginPct))}%`,height:"100%",background:margin<0?C.red:C.teal,borderRadius:99,transition:"width 0.4s ease"}}/>
                </div>
              )}
            </div>
            <Field label="Nom de l'article" value={cTitle} set={setCTitle} placeholder="Ex: Nike Air Max 90" icon="🏷️"/>
            <Field label="Prix d'achat" value={cBuy} set={setCBuy} placeholder="0,00" type="number" icon="🛒" suffix="€"/>
            <Field label="Prix de vente Vinted" value={cSell} set={setCSell} placeholder="0,00" type="number" icon="📦" suffix="€"/>
            <Field label="Frais annexes" value={cShip} set={setCShip} placeholder="0,00" type="number" icon="➕" suffix="€"/>
            {isValid&&(
              <div className="card" style={{padding:"16px 22px",display:"flex",justifyContent:"space-around"}}>
                {[{label:"Coût total",value:fmt(buy+ship),color:C.sub},{label:"Revenu brut",value:fmt(sell),color:C.teal},{label:"Bénéfice",value:fmt(margin),color:mc}].map((item,i)=>(
                  <div key={i} style={{textAlign:"center"}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>{item.label}</div>
                    <div style={{fontSize:16,fontWeight:800,color:item.color}}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}
            <Btn onClick={addSale} disabled={!isValid} color={cSaved?"#38A169":C.teal} full>
              {cSaved?"✓ Vente enregistrée !":"Enregistrer la vente"}
            </Btn>
          </div>
        )}

        {tab===3&&(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {sales.length===0?(
              <div style={{textAlign:"center",padding:"80px 20px"}}>
                <div style={{fontSize:56,marginBottom:16}}>📭</div>
                <div style={{fontSize:17,fontWeight:700,color:C.text,marginBottom:8}}>Aucune vente encore</div>
                <div style={{fontSize:13,color:C.sub}}>Utilise le calculateur ou l'inventaire</div>
              </div>
            ):sales.map(s=>{
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
          </div>
        )}
      </div>

      <div className="mobile-nav" style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(255,255,255,0.95)",backdropFilter:"blur(16px)",borderTop:"1px solid rgba(0,0,0,0.08)",boxShadow:"0 -4px 24px rgba(0,0,0,0.1)",zIndex:100,paddingBottom:"env(safe-area-inset-bottom)"}}>
        {TABS_MOBILE.map(t=>(
          <button key={t.idx} onClick={()=>setTab(t.idx)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"10px 0 12px",background:"transparent",border:"none",cursor:"pointer",color:tab===t.idx?C.teal:C.label,transition:"all 0.15s"}}>
            <div style={{fontSize:22,marginBottom:3,transform:tab===t.idx?"scale(1.15)":"scale(1)",transition:"transform 0.15s"}}>{t.icon}</div>
            <div style={{fontSize:10,fontWeight:tab===t.idx?700:500,letterSpacing:0.3}}>{t.label}</div>
            {tab===t.idx&&<div style={{width:4,height:4,borderRadius:99,background:C.teal,marginTop:3}}/>}
          </button>
        ))}
      </div>
    </div>
  );
}
