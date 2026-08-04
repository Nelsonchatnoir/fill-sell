import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { formatCurrency, fmtp, MONTHS_FR, MONTHS_EN, groupSales } from '../utils/shared';
import { UI, Loader, SegmentedPills, StatTile } from '../components/ui';
import { comptabilisable, comptabilisables, prixAchatNum, totalCA } from '../utils/comptabilite';
import { FREE_STOCK_LIMIT_FALLBACK, compteArticlesQuota } from '../utils/stockLimit';

// ── Design « Dashboard » (Claude Design, projet e47b36df — intégré 2026-07-14) ──
// Hero en verre dépoli, KPI 2×2, sélecteur de période, graphes SVG (bénéfices +
// évolution de marge) et activité récente. Aucune logique de calcul nouvelle :
// tout vient des données déjà agrégées par App.jsx (tm, totalM, salesForKpis…)
// et de buildChartData, qui pilote AUSSI le sélecteur de période.

// Un point de graphe = une somme de marges. Une vente sans prix d'achat n'a pas
// de marge : `reduce((a,s)=>a+s.margin,0)` lisait son null comme 0 (barre juste)
// et surtout la comptait au dénominateur de « Marge % », qui plongeait sans
// qu'aucune vente n'ait été mauvaise. On écarte la vente des DEUX agrégats.
const agregats=(liste)=>{
  const ms=comptabilisables(liste).filter(s=>s.margin!=null&&Number.isFinite(Number(s.margin)));
  return{profit:ms.reduce((a,s)=>a+Number(s.margin),0),"Marge %":ms.length?ms.reduce((a,s)=>a+(Number(s.marginPct)||0),0)/ms.length:0};
};

function buildChartData(salesArr, range, now, lang){
  const MONTHS=lang==='en'?MONTHS_EN:MONTHS_FR;
  const byMonth=(n)=>Array.from({length:n},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()-(n-1)+i,1);
    const m=d.getMonth();const y=d.getFullYear();
    const ms=salesArr.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===m&&sd.getFullYear()===y;});
    return{name:MONTHS[m],...agregats(ms)};
  });
  if(range==='7j'){
    return Array.from({length:7},(_,i)=>{
      const d=new Date(now);d.setDate(d.getDate()-6+i);
      const ds=salesArr.filter(s=>{const sd=new Date(s.date);return sd.toDateString()===d.toDateString();});
      return{name:`${d.getDate()}/${d.getMonth()+1}`,...agregats(ds)};
    });
  }
  if(range==='1M'){
    return Array.from({length:4},(_,i)=>{
      const end=new Date(now);end.setDate(end.getDate()-i*7);
      const start=new Date(end);start.setDate(start.getDate()-6);
      const ds=salesArr.filter(s=>{const sd=new Date(s.date);return sd>=start&&sd<=end;});
      return{name:`S${4-i}`,...agregats(ds)};
    }).reverse();
  }
  if(range==='1A') return byMonth(12);
  if(range==='YTD') return byMonth(now.getMonth()+1);
  return byMonth(6);
}

const CHART_CSS = `
@keyframes db-wipe{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes db-draw{to{stroke-dashoffset:0}}
@keyframes db-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes db-fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){
  .db-anim,.db-wipe,.db-draw,.db-fade{animation:none !important;stroke-dashoffset:0 !important;opacity:1 !important;transform:none !important}
}
.db-charts{display:grid;grid-template-columns:1fr;gap:18px}
@media (min-width:900px){.db-charts{grid-template-columns:1fr 1fr}}
`;

// Géométrie commune aux deux graphes (identique au design).
const W=330, H=182, PAD_L=30, PAD_R=6, PAD_T=10, PAD_B=26;
const PLOT_H = H-PAD_T-PAD_B;

// Largeur réelle du conteneur : le viewBox s'y cale (1 unité SVG = 1 px CSS),
// hauteur fixe H. Sans ça, width:100% + ratio d'aspect fixe faisait zoomer tout
// le graphe ×3-4 sur desktop (barre géante, textes énormes) ; mobile ≈ 1:1.
function useContainerWidth(){
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(()=>{
    const el = ref.current;
    if(!el || typeof ResizeObserver==='undefined') return;
    const ro = new ResizeObserver(en=>setW(en[0].contentRect.width));
    ro.observe(el);
    return ()=>ro.disconnect();
  },[]);
  return [ref, w];
}

// Mini-courbe du hero — tendance du profit sur la période sélectionnée.
function HeroSparkline({ data, width=104, height=38 }) {
  const vals = data.length ? data : [0,0];
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const range = (max-min) || 1;
  const pts = vals.map((v,i)=>({
    x: vals.length>1 ? (128*i)/(vals.length-1) : 64,
    y: height - ((v-min)/range)*height,
  }));
  const line = pts.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `M0,${height} ${pts.map(p=>`L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} L128,${height} Z`;
  const last = pts[pts.length-1];
  return (
    <svg viewBox="0 0 128 38" style={{ width, height, display:'block', overflow:'visible', flexShrink:0 }}>
      <defs>
        <linearGradient id="db-hero-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(47,158,144,0.28)"/>
          <stop offset="1" stopColor="rgba(47,158,144,0)"/>
        </linearGradient>
      </defs>
      <path d={area} fill="url(#db-hero-grad)" />
      <path className="db-draw" d={line} fill="none" stroke={UI.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray:300, strokeDashoffset:300, animation:'db-draw 1.1s ease 0.2s forwards' }} />
      {last && <circle cx={last.x.toFixed(1)} cy={last.y.toFixed(1)} r="2.6" fill={UI.tealDeep} />}
    </svg>
  );
}

// « Bénéfices » — barres, wipe à l'apparition. Tap/clic sur un mois → pastille
// avec le montant exact (toggle) ; fmtValue = format complet, fmtShort = ticks.
function ProfitBars({ data, fmtShort, fmtValue }) {
  const [wrapRef, cw] = useContainerWidth();
  const [active, setActive] = useState(null);
  useEffect(()=>{ setActive(null); }, [data]);
  const vw = Math.max(W, Math.round(cw) || W);
  const plotW = vw-PAD_L-PAD_R;
  const values = data.map(d=>d.profit);
  const max = Math.max(...values, 1);
  const nice = max*1.18;
  const n = values.length || 1;
  const band = plotW/n;
  const bw = Math.min(26, band*0.5);
  const yTicks = [0,1,2,3].map(k=>{
    const y = +(PAD_T + PLOT_H - PLOT_H*k/3).toFixed(1);
    return { y, ty:+(y+3).toFixed(1), label: fmtShort(nice*k/3) };
  });
  // 2.5px de plancher : un mois à 0 € reste visible (barre plate).
  const bars = values.map((v,i)=>{
    const h = Math.max(PLOT_H*(Math.max(v,0)/nice), 2.5);
    return { cx: PAD_L + band*(i+0.5), h, y: PAD_T+PLOT_H-h };
  });
  const tip = active==null ? null : (()=>{
    const b = bars[active];
    const label = fmtValue(values[active]);
    const tw = Math.max(34, label.length*5.8+14);
    const tx = Math.min(Math.max(b.cx, PAD_L+tw/2), vw-PAD_R-tw/2);
    const ty = Math.max(b.y-22, 2);
    return { label, tw, tx, ty };
  })();
  return (
    <div ref={wrapRef} style={{ width:'100%' }}>
    <svg viewBox={`0 0 ${vw} ${H}`} style={{ width:'100%', height:H, display:'block' }}>
      <defs>
        <linearGradient id="db-bar-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3FB0A0"/>
          <stop offset="1" stopColor={UI.tealDeep}/>
        </linearGradient>
        <clipPath id="db-bar-clip">
          <rect className="db-wipe" x="0" y="0" width={vw} height={H}
            style={{ transformOrigin:'left', transformBox:'fill-box', animation:'db-wipe 0.9s cubic-bezier(0.2,0.7,0.3,1) forwards' }} />
        </clipPath>
      </defs>
      {yTicks.map((t,i)=>(
        <g key={i}>
          <line x1={PAD_L} y1={t.y} x2={vw-PAD_R} y2={t.y} stroke={UI.border} strokeWidth="1" />
          <text x={PAD_L-6} y={t.ty} textAnchor="end" style={{ font:"500 9px 'Space Grotesk',sans-serif", fill:'#A6A192' }}>{t.label}</text>
        </g>
      ))}
      <g clipPath="url(#db-bar-clip)">
        {bars.map((b,i)=>(
          <rect key={i} x={+(b.cx-bw/2).toFixed(1)} y={+b.y.toFixed(1)} width={+bw.toFixed(1)} height={+b.h.toFixed(1)} rx="5"
            fill="url(#db-bar-grad)" opacity={active==null||active===i?1:0.45} />
        ))}
      </g>
      {data.map((d,i)=>(
        <text key={i} x={+(PAD_L+band*(i+0.5)).toFixed(1)} y={H-6} textAnchor="middle"
          style={{ font:"500 9.5px 'Space Grotesk',sans-serif", fill:active===i?UI.ink:UI.mute, fontWeight:active===i?700:500 }}>{d.name}</text>
      ))}
      {/* Zones de tap pleine-bande (invisibles) — le onClick SVG répond au tap iOS. */}
      {bars.map((b,i)=>(
        <rect key={`hit-${i}`} x={+(PAD_L+band*i).toFixed(1)} y={PAD_T} width={+band.toFixed(1)} height={H-PAD_T}
          fill="rgba(0,0,0,0)" style={{ cursor:'pointer' }}
          onClick={()=>setActive(a=>a===i?null:i)} />
      ))}
      {tip && (
        <g style={{ pointerEvents:'none' }}>
          <rect x={+(tip.tx-tip.tw/2).toFixed(1)} y={tip.ty} width={+tip.tw.toFixed(1)} height="17" rx="8.5"
            fill={UI.ink} opacity="0.92" />
          <text x={+tip.tx.toFixed(1)} y={tip.ty+11.5} textAnchor="middle"
            style={{ font:"600 9.5px 'Space Grotesk',sans-serif", fill:'#fff' }}>{tip.label}</text>
        </g>
      )}
    </svg>
    </div>
  );
}

// « Évolution marge % » — courbe lissée, tracé progressif.
function MarginLine({ data }) {
  const [wrapRef, cw] = useContainerWidth();
  const vw = Math.max(W, Math.round(cw) || W);
  const plotW = vw-PAD_L-PAD_R;
  const values = data.map(d=>d['Marge %']);
  const max = Math.max(...values, 1);
  const nice = max*1.18;
  const n = values.length || 1;
  const band = plotW/n;
  const pts = values.map((v,i)=>({ x: PAD_L+band*(i+0.5), y: PAD_T+PLOT_H*(1 - Math.max(v,0)/nice) }));
  const smooth = (a) => {
    if (a.length < 2) return a.length ? `M${a[0].x.toFixed(1)},${a[0].y.toFixed(1)}` : '';
    let d = `M${a[0].x.toFixed(1)},${a[0].y.toFixed(1)}`;
    for (let i=0;i<a.length-1;i++){
      const p0=a[i-1]||a[i], p1=a[i], p2=a[i+1], p3=a[i+2]||p2;
      const c1x=p1.x+(p2.x-p0.x)/6, c1y=p1.y+(p2.y-p0.y)/6;
      const c2x=p2.x-(p3.x-p1.x)/6, c2y=p2.y-(p3.y-p1.y)/6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  };
  const linePath = smooth(pts);
  const baseY = PAD_T+PLOT_H;
  const areaPath = pts.length ? `${linePath} L${pts[pts.length-1].x.toFixed(1)},${baseY} L${pts[0].x.toFixed(1)},${baseY} Z` : '';
  const yTicks = [0,1,2,3].map(k=>{
    const y = +(PAD_T + PLOT_H - PLOT_H*k/3).toFixed(1);
    return { y, ty:+(y+3).toFixed(1), label: `${(Math.round(nice*k/3*10)/10).toString().replace('.',',')}%` };
  });
  // dasharray ≥ longueur max du tracé élargi, sinon la courbe se tronque.
  const dash = Math.max(900, vw*2);
  return (
    <div ref={wrapRef} style={{ width:'100%' }}>
    <svg viewBox={`0 0 ${vw} ${H}`} style={{ width:'100%', height:H, display:'block' }}>
      <defs>
        <linearGradient id="db-line-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(232,149,109,0.32)"/>
          <stop offset="1" stopColor="rgba(232,149,109,0)"/>
        </linearGradient>
      </defs>
      {yTicks.map((t,i)=>(
        <g key={i}>
          <line x1={PAD_L} y1={t.y} x2={vw-PAD_R} y2={t.y} stroke={UI.border} strokeWidth="1" />
          <text x={PAD_L-6} y={t.ty} textAnchor="end" style={{ font:"500 9px 'Space Grotesk',sans-serif", fill:'#A6A192' }}>{t.label}</text>
        </g>
      ))}
      <path className="db-fade" d={areaPath} fill="url(#db-line-grad)" style={{ opacity:0, animation:'db-fade 0.8s ease 0.5s forwards' }} />
      <path className="db-draw" d={linePath} fill="none" stroke={UI.amber} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray:dash, strokeDashoffset:dash, animation:'db-draw 1.2s ease 0.15s forwards' }} />
      {pts.map((p,i)=>(
        <circle key={i} className="db-fade" cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="3" fill="#fff" stroke={UI.amber} strokeWidth="2"
          style={{ opacity:0, animation:'db-fade 0.4s ease 1s forwards' }} />
      ))}
      {data.map((d,i)=>(
        <text key={i} x={+(PAD_L+band*(i+0.5)).toFixed(1)} y={H-6} textAnchor="middle"
          style={{ font:"500 9.5px 'Space Grotesk',sans-serif", fill:UI.mute }}>{d.name}</text>
      ))}
    </svg>
    </div>
  );
}

// Carte de section (graphes, activité) — paper + border, radius 22 (design).
function PanelCard({ title, subtitle, children, style }) {
  return (
    <div className="db-anim" style={{
      background:UI.paper, border:`1px solid ${UI.border}`, borderRadius:22, padding:18,
      boxShadow:'0 1px 3px rgba(16,32,27,0.04)', animation:'db-rise 0.5s ease both', ...style,
    }}>
      <div style={{ fontSize:14, fontWeight:700, color:UI.ink }}>{title}</div>
      {subtitle && <div style={{ fontSize:11.5, fontWeight:500, color:UI.mute, marginBottom:12 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

// Icônes des tuiles KPI (design) — SVG, pas d'emoji.
const IcoBars = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>;
const IcoTrend = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/></svg>;
const IcoGem = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12l4 6-10 12L2 9Z"/><path d="M11 3 8 9l4 12 4-12-3-6"/><path d="M2 9h20"/></svg>;
const IcoBox = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>;

const DashboardTab = memo(function DashboardTab({
  lang, currency, isPremium, isNative, username, loading,
  items, sales, stock, stockVal, stockQty,
  tm, salesForKpis, totalM,
  selectedRange, setSelectedRange,
  fabTriggerRef, openUpgradeModal, setTab,
  EmptyStateDashboard,
}) {
  const { t, tpl } = useTranslation(lang);
  const fmt = (amount, dec=null) => formatCurrency(amount, currency, dec);
  // Abrégé pour les graduations du graphe (1,2k € plutôt que 1 200,00 €).
  const fmtShort = (n) => n >= 1000
    ? `${(n/1000).toFixed(1).replace('.',',')}k ${currency==='EUR'?'€':''}`.trim()
    : fmt(Math.round(n), 0);
  const now = new Date();

  const mData = buildChartData(sales, selectedRange, now, lang);
  // totalM (prop) exclut déjà les ventes sans prix d'achat. Le diviser par le CA
  // de TOUTES les ventes revenait à comparer un bénéfice partiel à un chiffre
  // d'affaires complet : la marge moyenne s'écrasait à chaque vente non
  // renseignée. Le CA affiché, lui, reste complet — il est vrai sans prix d'achat.
  const kpiComptables = comptabilisables(salesForKpis);
  const totalR = totalCA(salesForKpis);
  const caComptabilise = totalCA(kpiComptables);
  const avgM = caComptabilise>0?(totalM/caComptabilise)*100:0;
  const ventesSansAchat = salesForKpis.length-kpiComptables.length;
  const hasData = sales.length>0;

  const rangeLabel = selectedRange==='7j'?t('dernierNJours')
    :selectedRange==='1M'?t('trente')
    :selectedRange==='1A'?t('douze')
    :selectedRange==='YTD'?t('depuisJanvier')
    :t('sixMois');

  // ── Activité récente : fusion ventes + ajouts stock, déjà chargés côté client ──
  const recentActivity = (()=>{
    if(!hasData && (!stock || stock.length===0)) return [];
    // amount = null quand le montant n'existe pas (pas de prix d'achat → pas de
    // marge) : `s.margin` valait null et l'affichage, qui teste `>=0`, sortait
    // un « +0,00 € » qu'on lisait comme une vente à marge nulle.
    // date_vente (date || created_at, cf. mapSale) : une vente enregistrée SANS
    // date (« je ne sais plus », import dressing) doit apparaître ici comme une
    // activité récente — c'est son enregistrement qui est récent. Trier sur
    // s.date seul l'envoyait en 1970, donc hors du top 5. `noDate` pilote le
    // libellé : on affiche « date inconnue », jamais un faux « 1 jan ».
    const soldRows = groupSales(sales).slice(0,5).map(s=>({
      kind:'sale', id:`s-${s.id}`, date:s.date_vente||s.date, noDate:!s.date, title:s.title, marque:s.marque, type:s.type,
      amount:comptabilisable(s)&&s.margin!=null&&Number.isFinite(Number(s.margin))?Number(s.margin):null, qty:s._qty||1,
    }));
    const addRows = (stock||[])
      .filter(i=>i.date_ajout||i.created_at)
      .slice()
      .sort((a,b)=>new Date(b.date_ajout||b.created_at)-new Date(a.date_ajout||a.created_at))
      .slice(0,5)
      .map(i=>({
        // `i.buy` brut affichait « 0,00 € » pour un article dont on ignore le
        // prix d'achat : prixAchatNum rend null, jamais un zéro inventé.
        kind:'add', id:`a-${i.id}`, date:i.date_ajout||i.created_at, title:i.title, marque:i.marque, type:i.type,
        amount:prixAchatNum(i), qty:i.quantite||1,
      }));
    return [...soldRows, ...addRows]
      .sort((a,b)=>new Date(b.date)-new Date(a.date))
      .slice(0,5);
  })();

  // Miroir de check_inventory_limit (migration 20260725180000) : la limite
  // Quota Free : même assiette que le trigger serveur (non vendus, HORS
  // dressing Vinted synchronisé — compteArticlesQuota, bug « X/20 » qui
  // comptait la sync corrigé le 05/08) ; limite 200 (miroir de
  // coin_config.free_stock_limit). Un ex-Premium redevenu Free peut dépasser
  // la limite (articles hérités, le trigger ne bloque que les NOUVEAUX
  // ajouts) : compteur borné à 0 et libellé dédié une fois la limite
  // atteinte (« Plus que -21 article » vu en prod le 26/07).
  const freeActive=compteArticlesQuota(items);
  const freeLeft=Math.max(0,FREE_STOCK_LIMIT_FALLBACK-freeActive);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:18,width:"100%",overflow:"hidden"}}>
      <style>{CHART_CSS}</style>

      {!isPremium&&!loading&&freeActive>0&&freeActive<FREE_STOCK_LIMIT_FALLBACK-2&&(
        <div style={{background:UI.chip,border:`1px solid ${UI.border}`,borderRadius:14,padding:"12px 18px",textAlign:"center",overflow:"hidden"}}>
          <div style={{fontSize:13,fontWeight:600,color:freeLeft<=2?UI.amber:UI.tealDeep}}>
            {freeLeft<=2
              ? tpl('urgenceArticles',{n:freeLeft})
              : tpl('articlesGratuits',{n:freeLeft})
            }
          </div>
        </div>
      )}
      {!isNative&&!isPremium&&!loading&&freeActive>=FREE_STOCK_LIMIT_FALLBACK-2&&(
        <div onClick={()=>openUpgradeModal()} style={{background:UI.card,border:`1px solid ${UI.border}`,borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,cursor:"pointer"}}>
          <div style={{fontSize:13,fontWeight:600,color:UI.ink}}>
            {freeLeft===0
              ?(lang==='en'?`⚠️ Free plan limit reached (${FREE_STOCK_LIMIT_FALLBACK} active items)`:`⚠️ Limite du plan gratuit atteinte (${FREE_STOCK_LIMIT_FALLBACK} articles actifs)`)
              :(lang==='en'?`⚠️ Only ${freeLeft} item${freeLeft>1?"s":""} left on your free plan`:`⚠️ Plus que ${freeLeft} article${freeLeft>1?"s":""} disponible${freeLeft>1?"s":""}`)}
          </div>
          <button onClick={e=>{e.stopPropagation();openUpgradeModal();}} style={{background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,color:"#fff",border:"none",borderRadius:99,padding:"7px 14px",fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{t('debloquer')}</button>
        </div>
      )}

      {loading?(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"70px 0"}}>
          <Loader size={38} />
          <div style={{fontSize:13.5,fontWeight:500,color:UI.mute2}}>{lang==='en'?"Loading data...":"Chargement des données..."}</div>
        </div>
      ):items.length===0&&sales.length===0?(
        <div style={{maxWidth:520,margin:"40px auto 0",animation:"fadeIn 0.4s ease",width:"100%"}}>
          <EmptyStateDashboard
            lang={lang}
            onTryVoice={()=>fabTriggerRef.current?.()}
            onOpenLens={()=>{setTab(2); localStorage.setItem('tab',2);}}
          />
        </div>
      ):(
        <>
          {/* Badge période + salutation */}
          <div className="db-anim" style={{animation:"db-rise 0.5s ease both"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:7,background:UI.paper,border:`1px solid ${UI.border}`,color:UI.mute,borderRadius:999,padding:"5px 11px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12}}>
              <span style={{width:6,height:6,borderRadius:99,background:UI.teal,flexShrink:0}}/>
              {(lang==='en'?MONTHS_EN:MONTHS_FR)[now.getMonth()]} {now.getFullYear()}
            </div>
            <div style={{fontSize:30,fontWeight:700,color:UI.ink,letterSpacing:"-0.03em",lineHeight:1.1}}>
              {username
                ?<>{lang==='en'?'Hello':'Bonjour'} <span style={{color:UI.teal}}>{username}</span> 👋</>
                :lang==='en'?'Hello 👋':'Bonjour 👋'}
            </div>
          </div>

          {/* Hero « Profit net » — verre dépoli sur halos teal/amber */}
          <div
            onClick={()=>{setTab(4);localStorage.setItem('tab',4);}}
            className="db-anim"
            style={{position:"relative",overflow:"hidden",borderRadius:26,cursor:"pointer",animation:"db-rise 0.55s ease both"}}
          >
            <div style={{position:"absolute",pointerEvents:"none",top:-40,right:-30,width:200,height:190,borderRadius:"50%",background:"radial-gradient(circle,rgba(47,158,144,0.55),transparent 68%)",filter:"blur(24px)"}}/>
            <div style={{position:"absolute",pointerEvents:"none",bottom:-60,left:-30,width:180,height:180,borderRadius:"50%",background:"radial-gradient(circle,rgba(232,149,109,0.5),transparent 68%)",filter:"blur(26px)"}}/>
            <div style={{position:"absolute",pointerEvents:"none",top:20,left:"40%",width:150,height:120,borderRadius:"50%",background:"radial-gradient(circle,rgba(47,158,144,0.28),transparent 70%)",filter:"blur(30px)"}}/>
            <div style={{
              position:"relative",padding:"22px 22px 20px",
              background:"rgba(255,255,255,0.44)",
              backdropFilter:"blur(20px) saturate(165%)",WebkitBackdropFilter:"blur(20px) saturate(165%)",
              border:"1px solid rgba(255,255,255,0.7)",borderRadius:26,
              boxShadow:"0 14px 36px -16px rgba(16,32,27,0.28), inset 0 1px 0 rgba(255,255,255,0.7)",
            }}>
              {/* « depuis le début » (2026-08-03 soir) : ces chiffres sont
                  GLOBAUX — le sélecteur de période ne pilote que les graphes.
                  Sans cette mention, un changement de période qui ne les fait
                  pas bouger ressemble à un bug. */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:10}}>
                <span style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.12em",color:UI.mute2}}>{t('profitNet')} · {lang==='en'?'all-time':'depuis le début'}</span>
                <span style={{background:"rgba(47,158,144,0.14)",border:"1px solid rgba(47,158,144,0.28)",borderRadius:999,padding:"4px 10px",fontSize:10.5,fontWeight:600,color:UI.tealDeep,whiteSpace:"nowrap"}}>
                  {tm.profit>=0?"+":""}{fmt(tm.profit)} {t('ceNoisPill')}
                </span>
              </div>
              <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:12}}>
                <div style={{fontSize:34,fontWeight:700,color:UI.ink,letterSpacing:"-0.03em",lineHeight:1,whiteSpace:"nowrap"}}>{fmt(totalM)}</div>
                <HeroSparkline data={mData.map(d=>d.profit)} />
              </div>
              {/* La marge moyenne se divise par les ventes RETENUES : totalM ne
                  contient plus les ventes sans prix d'achat, les diviser par le
                  total des ventes rabotait le montant à chaque fiche incomplète.
                  Le nombre de ventes affiché, lui, reste le vrai total. */}
              <div style={{fontSize:12.5,fontWeight:500,color:UI.mute2,marginTop:10}}>
                {tpl('venteLabel',{n:salesForKpis.length})} {lang==='en'?'all-time':'depuis le début'} · {t('margeMoyDash')} {fmt(kpiComptables.length?totalM/kpiComptables.length:0)}
              </div>
              <div style={{fontSize:12,fontWeight:600,color:UI.tealDeep,marginTop:10,display:"flex",alignItems:"center",gap:5}}>
                {t('analyseComplete')}
              </div>
            </div>
          </div>

          {/* KPIs 2×2 */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <StatTile icon={IcoBars}  tileColor={UI.teal}     label={t('ceMois')}          value={fmt(tm?.profit||0)}         sub={tpl('venteLabel',{n:tm?.count||0})} />
            {/* Un total devenu partiel doit le dire : sinon « marge moy. » passe
                pour une moyenne sur tout alors qu'elle ignore les ventes sans
                prix d'achat. Compteur affiché seulement s'il y en a. */}
            <StatTile icon={IcoTrend} tileColor={UI.tealDeep} label={t('margeMoy')}        value={fmtp(avgM)}                 sub={ventesSansAchat>0?(lang==='en'?`all-time · excl. ${ventesSansAchat} sale${ventesSansAchat>1?'s':''} without buy price`:`depuis le début · hors ${ventesSansAchat} sans prix d'achat`):(lang==='en'?'all-time':'depuis le début')} />
            <StatTile icon={IcoGem}   tileColor={UI.amber}    label={t('revenuBrutLabel')} value={fmt(totalR)}                sub={`${t('totalEncaisse')} · ${lang==='en'?'all-time':'depuis le début'}`} />
            <StatTile icon={IcoBox}   tileColor={UI.mute}     label={t('enStock')}         value={`${stockQty??stock.length}`} sub={`${fmt(stockVal)} ${t('investi')}`} />
          </div>

          {/* Sélecteur de période — il ne pilote QUE les graphes (les KPI
              ci-dessus sont globaux, « depuis le début ») : il est donc rendu
              comme l'EN-TÊTE du bloc graphes, avec son libellé, collé aux
              cartes qu'il commande — pas comme un contrôle flottant qu'on
              croirait maître de toute la page. */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:-8}}>
            <span style={{fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",color:UI.mute2}}>
              {lang==='en'?'Charts period':'Période des graphes'}
            </span>
            <div style={{display:"inline-flex",background:UI.paper,border:`1px solid ${UI.border}`,borderRadius:999,padding:3}}>
              <SegmentedPills
                options={['7j','1M','6M','1A','YTD']}
                value={selectedRange}
                onChange={setSelectedRange}
                labelFn={r=>lang==='en'?({'7j':'7d','1A':'1Y'}[r]||r):r}
              />
            </div>
          </div>

          {/* Bénéfices + Évolution marge : empilés sur mobile, côte à côte sur
              desktop (≥900px) pour rester alignés sur la grille KPI 2 colonnes. */}
          <div className="db-charts">
            <PanelCard title={t('benefices')} subtitle={rangeLabel}>
              <ProfitBars data={mData} fmtShort={fmtShort} fmtValue={fmt} />
            </PanelCard>

            <PanelCard title={t('evolutionMarge')} subtitle={rangeLabel}>
              <MarginLine data={mData} />
            </PanelCard>
          </div>

          {/* Activité récente — ventes + ajouts stock fusionnés, triés par date */}
          {recentActivity.length>0&&(
            <PanelCard title={lang==='en'?'Recent activity':'Activité récente'}>
              <div style={{display:"flex",flexDirection:"column"}}>
                {recentActivity.map((a,i)=>{
                  const d=new Date(a.date);
                  const isSale=a.kind==='sale';
                  return(
                    <div key={a.id} style={{display:"flex",alignItems:"center",gap:11,padding:"10px 0",borderTop:i>0?`1px solid ${UI.border}`:"none"}}>
                      {/* Pastille ILLUSTRATIVE, jamais un contrôle (2026-07-30) : l'ancien
                          « ➕ » sur carré gris était pris pour un bouton d'ajout. Même style
                          de pastille teintée que « Vendu » (💰 sur teal), avec un 📦 sur
                          ambre doux pour « Ajouté ». */}
                      <div style={{width:34,height:34,borderRadius:11,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,background:isSale?"rgba(47,158,144,0.14)":"rgba(217,119,6,0.12)"}}>
                        {isSale?"💰":"📦"}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:13,color:UI.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
                          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</span>
                          {a.qty>1&&<span style={{background:UI.chip,color:UI.mute2,borderRadius:99,padding:"1px 6px",fontSize:10,fontWeight:600,flexShrink:0}}>×{a.qty}</span>}
                        </div>
                        <div style={{fontSize:11,fontWeight:500,color:UI.mute,marginTop:1}}>
                          {a.noDate?(lang==='en'?'Unknown date':'Date inconnue'):`${d.getDate()} ${(lang==='en'?MONTHS_EN:MONTHS_FR)[d.getMonth()]}`} · {isSale?(lang==='en'?'Sold':'Vendu'):(lang==='en'?'Added':'Ajouté')}
                        </div>
                      </div>
                      {/* Montant inconnu = tiret. Sans ce test, `a.amount>=0` était
                          vrai pour null et la ligne affichait un « +0,00 € » faux. */}
                      <div style={{fontWeight:700,fontSize:14,flexShrink:0,color:a.amount==null?UI.mute:isSale?(a.amount>=0?UI.tealDeep:UI.negative):UI.mute}}>
                        {a.amount==null?"—":isSale?`${a.amount>=0?"+":""}${fmt(a.amount)}`:fmt(a.amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </PanelCard>
          )}
        </>
      )}
    </div>
  );
});

export default DashboardTab;
