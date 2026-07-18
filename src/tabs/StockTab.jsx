import { memo, useState, useEffect, useRef } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { useIsMobile } from '../hooks/useIsMobile';
import { track } from '../analytics/analytics';
import Field from '../components/Field';
import SwipeRow from '../components/SwipeRow';
import ListingPreviewScreen, { PLATFORM_LABELS, clearStepperPersistence, readStepperHost, writeStepperHost } from '../components/ListingPreviewScreen';
import ExtensionReminderModal, { shouldShowExtensionReminder } from '../components/ExtensionReminderModal';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import VoiceResultCard from '../components/voice/VoiceResultCard';
import { Btn } from '../components/voice/VoiceKit';
import { VOICE_KIT_CSS } from '../components/voice/tokens';
import { supabase } from '../lib/supabase';
import {
  C, formatCurrency, fmtp, getMargeColor, getCatBorder,
  getTypeStyle, typeLabel, marqueLabel, parseLocDesc, detectType,
  getRotatingExamples, SKELETON_ITEMS, SKELETON_SOLD,
  CURRENCY_SYMBOLS, VOICE_FREE_LIMIT,
  getCatTileColor, catClass, detectObjectIcon, buildCardCss,
} from '../utils/shared';

// ── Design 2026 (Lens / navbar) — liste des articles en stock ──
// Maquette validée : row grid [tuile | infos | prix+actions], palette canvas/paper.
// CSS partagé avec VentesTab via buildCardCss (src/utils/shared.js).
const STOCK_CSS = buildCardCss('stock-v2');

// ── Redesign zone de saisie IA (haut StockTab) — eyebrow + toggle Écrire/Parler ──
const STOCK_TOP_CSS = `
.stock-top-v2{
  --canvas:#EDEAE0;
  --paper:#F6F5F1;
  --ink:#10201B;
  --teal:#2F9E90;
  --teal-deep:#1B6E62;
  --amber:#E8956D;
  --mute:#8A8578;
  --border:#E7E3D8;
  font-family:'Space Grotesk',sans-serif;
}
.stock-top-v2 .eyebrow{
  font-size:11px;
  font-weight:600;
  letter-spacing:0.08em;
  text-transform:uppercase;
  color:var(--mute);
}
.stock-top-v2 .eyebrow-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:2px 4px 14px;
}
.stock-top-v2 .eyebrow-status{
  display:flex;
  align-items:center;
  gap:6px;
  font-size:12px;
  font-weight:600;
  color:var(--teal-deep);
  white-space:nowrap;
}
.stock-top-v2 .status-dot{
  width:6px; height:6px;
  border-radius:50%;
  background:var(--amber);
  box-shadow:0 0 0 3px rgba(232,149,109,0.18);
  flex-shrink:0;
}
.stock-top-v2 .mode-toggle{
  display:flex;
  background:var(--canvas);
  border-radius:11px;
  padding:3px;
  margin-bottom:14px;
}
.stock-top-v2 .mode-btn{
  flex:1;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  padding:9px;
  border-radius:9px;
  border:none;
  background:transparent;
  font-family:inherit;
  font-size:12.5px;
  font-weight:600;
  color:var(--mute);
  cursor:pointer;
}
.stock-top-v2 .mode-btn.active{
  background:var(--paper);
  color:var(--ink);
  box-shadow:0 2px 6px -2px rgba(16,32,27,0.15);
}
.stock-top-v2 .voice-state{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:26px 0 18px;
  gap:14px;
}
.stock-top-v2 .voice-orb-wrap{
  position:relative;
  width:72px; height:72px;
  display:flex; align-items:center; justify-content:center;
  margin:0 auto;
}
.stock-top-v2 .pulse-ring{
  position:absolute;
  inset:0;
  border-radius:50%;
  border:1.5px solid var(--teal);
  opacity:0;
  animation:stvPulseRing 2.2s cubic-bezier(0.2,0.6,0.35,1) infinite;
  pointer-events:none;
}
.stock-top-v2 .pulse-ring:nth-child(2){ animation-delay:0.7s; }
.stock-top-v2 .pulse-ring:nth-child(3){ animation-delay:1.4s; }
@keyframes stvPulseRing{
  0%{ transform:scale(0.72); opacity:0.55; }
  100%{ transform:scale(1.55); opacity:0; }
}
.stock-top-v2 .voice-orb{
  position:relative;
  z-index:2;
  width:60px; height:60px;
  border-radius:50%;
  background:linear-gradient(155deg, var(--teal) 0%, var(--teal-deep) 100%);
  display:flex; align-items:center; justify-content:center;
  color:#fff;
  font-size:22px;
  box-shadow:0 8px 20px -6px rgba(27,110,98,0.5), inset 0 1px 1px rgba(255,255,255,0.25);
  border:none;
  cursor:pointer;
  transition:transform 0.15s ease;
}
.stock-top-v2 .voice-orb:active{ transform:scale(0.94); }
.stock-top-v2 .voice-orb.thinking{ opacity:0.85; cursor:not-allowed; }
@media (prefers-reduced-motion: reduce){
  .stock-top-v2 .pulse-ring{ animation:none !important; opacity:0; }
}
.stock-top-v2 .voice-hint{
  font-size:12.5px;
  color:var(--mute);
  font-weight:500;
}
.stock-top-v2 .hint-row{
  display:flex;
  align-items:flex-start;
  gap:7px;
  margin-bottom:16px;
}
.stock-top-v2 .hint-icon{
  color:var(--teal);
  font-size:13px;
  line-height:1.5;
  flex-shrink:0;
}
.stock-top-v2 .hint-text{
  font-size:12.5px;
  color:var(--mute);
  line-height:1.5;
}
.stock-top-v2 .cta{
  width:100%;
  padding:14px;
  border-radius:13px;
  border:none;
  font-family:inherit;
  font-weight:700;
  font-size:14.5px;
  letter-spacing:-0.005em;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  transition:all 0.15s ease;
  background:#D8D4C6;
  color:#A19C8C;
  cursor:not-allowed;
}
.stock-top-v2 .cta.active{
  background:var(--teal-deep);
  color:#fff;
  box-shadow:0 8px 20px -8px rgba(27,110,98,0.55);
  cursor:pointer;
}
.stock-top-v2 .examples-toggle{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:5px;
  padding:14px 0 2px;
  font-size:12px;
  font-weight:600;
  color:var(--mute);
  cursor:pointer;
  background:none;
  border:none;
  width:100%;
  font-family:inherit;
}
.stock-top-v2 .examples-toggle svg{ transition:transform 0.15s ease; }
.stock-top-v2 .examples-panel{
  margin-top:10px;
  display:flex;
  flex-direction:column;
  gap:6px;
}
.stock-top-v2 .example-chip{
  display:flex;
  align-items:center;
  gap:9px;
  padding:10px 12px;
  border-radius:11px;
  background:var(--canvas);
  font-size:12.5px;
  color:var(--ink);
  opacity:0.85;
  border:none;
  font-family:inherit;
  cursor:pointer;
  text-align:left;
  width:100%;
}
`;

const StockTab = memo(function StockTab({
  // Config
  lang, currency, isPremium, isNative, isPro, items, user, voiceUsedToday,
  iapProduct, iapLoading,
  // Computed lists
  stock, sold, stockFiltre, soldFiltre, stockVisible, soldVisible, stockVal, stockQty, soldQty,
  // Voice/AI state
  voiceStep, setVoiceStep, voiceParsed, setVoiceParsed,
  voiceZoneResults, setVoiceZoneResults, voiceZoneOpen, setVoiceZoneOpen,
  vaActions, vaStep,
  voiceText, setVoiceText, voiceLoading, voicePlaceholderIdx, voiceError,
  // Manual form state
  showManualForm, setShowManualForm, manualMode, setManualMode,
  iTitle, setITitle, iQuantite, setIQuantite, iMarque, setIMarque,
  iType, setIType, iBuy, setIBuy, iPurchaseCosts, setIPurchaseCosts,
  iAlreadySold, setIAlreadySold, iSell, setISell,
  iSellingFees, setISellingFees, iRememberSellingFees, setIRememberSellingFees,
  iDesc, setIDesc, iEmplacement, setIEmplacement, iPlateforme, setIPlateforme, iSaved, firstItemAdded,
  // Lot state
  lotManualTotal, setLotManualTotal, lotManualItems, setLotManualItems,
  lotDistributed, setLotDistributed, lotDistributing,
  // Filter state
  filterType, setFilterType, filterMarque, setFilterMarque,
  filterMarqueSold, setFilterMarqueSold,
  search, setSearch, soldShowAll, setSoldShowAll,
  showAllStock, setShowAllStock,
  pillsExpandedSold, setPillsExpandedSold, pillsExpandedStock, setPillsExpandedStock,
  importMsg,
  // Handlers
  addItemsFromVoice, resetVoiceFlow, callVoiceParse, addItem,
  handleLotDistribute, addLotToInventory, delItem, markSold, setEditItem,
  handleImportFile, handleExport, handleIAPPurchase, handleIAPRestore,
  triggerCheckout,
  // Refs
  importRef, listRef, scrollRef, fabTriggerRef,
  // Injected components (defined in App.jsx)
  PremiumBanner, IAPUpgradeBlock,
  openUpgradeModal, onStepperOpenChange,
}) {
  const { t, tpl } = useTranslation(lang);
  const isMobile = useIsMobile(); // P4 : réactif (grille desktop ↔ liste mobile)
  const fmt = (amount, dec=null) => formatCurrency(amount, currency, dec);
  const [zoneEdits, setZoneEdits] = useState({});
  const [publishItem, setPublishItem] = useState(null);
  // Ouverture du stepper : purge tout brouillon précédent puis pose le blob
  // hôte (sessionStorage) qui permettra de le REMONTER après un remount
  // (reload d'onglet Chrome ou navigation interne).
  const ouvrirStepper = (item) => {
    clearStepperPersistence();
    writeStepperHost({ source: 'stock', itemId: item.id });
    setPublishItem(item);
    onStepperOpenChange?.(true);
  };
  // Reprise après remount : on retrouve la ligne inventaire dans items (chargés
  // en async par App) et on rouvre le stepper — son état interne revient du
  // brouillon sessionStorage propre au stepper.
  const stepperRestaureRef = useRef(false);
  useEffect(() => {
    if (stepperRestaureRef.current || publishItem) return;
    const h = readStepperHost('stock');
    if (!h) return;
    const item = (items || []).find(i => i.id === h.itemId);
    if (!item) return;
    stepperRestaureRef.current = true;
    setPublishItem(item);
    onStepperOpenChange?.(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  // Article en attente derrière le rappel extension : le clic « Publier » passe
  // d'abord par le modal, l'ouverture du stepper n'a lieu qu'au « Continuer ».
  const [extReminderItem, setExtReminderItem] = useState(null);
  const [jobsByInventaire, setJobsByInventaire] = useState({});
  const [voiceInputMode, setVoiceInputMode] = useState('write');
  const [examplesOpen, setExamplesOpen] = useState(false);

  // ⚠️ RAFRAÎCHISSEMENT (2026-07-13) — sans lui, le Stock MENTAIT.
  // La publication est faite par l'EXTENSION, dans son coin, plusieurs minutes
  // après le clic : elle passe les jobs en "published" en base, mais cette liste
  // n'était lue QU'UNE FOIS, au montage (deps [user?.id]). Rien ne la relisait
  // jamais — l'article restait affiché comme non publié jusqu'au prochain
  // rechargement complet de l'app (bug remonté par Nico : « Publier » toujours
  // actif alors que les 4 plateformes étaient en ligne).
  // On relit donc : au retour sur l'onglet (le cas réel — on part surveiller la
  // publication ailleurs, on revient), et à intervalle régulier tant que l'app
  // est visible. Pas de realtime : le projet n'en utilise nulle part, et une
  // relecture de quelques lignes toutes les 20 s est sans effet mesurable.
  //
  // "processing" est dans le filtre, et ce n'est pas un détail : c'est le statut
  // porté PENDANT la publication. Sans lui, l'article ne montrait NI « En
  // cours… » ni ses plateformes tant que l'extension travaillait — il avait
  // simplement l'air de n'avoir jamais été publié.
  useEffect(() => {
    if (!user?.id) return;
    let annule = false;

    const relire = async () => {
      const { data } = await supabase
        .from("cross_post_jobs")
        .select("id, inventaire_id, platform, status")
        .eq("user_id", user.id)
        .eq("action", "publish")
        .in("status", ["pending", "processing", "published"]);
      if (annule || !data) return;
      const map = {};
      for (const job of data) {
        if (!map[job.inventaire_id]) map[job.inventaire_id] = [];
        map[job.inventaire_id].push(job);
      }
      setJobsByInventaire(map);
    };

    relire();
    const onVisible = () => { if (document.visibilityState === "visible") relire(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") relire();
    }, 20000);

    return () => {
      annule = true;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [user?.id]);

  // Mode dégradé (Phase B) : plateformes en pause → badge « En pause » sur les
  // jobs en attente concernés. Lecture TOLÉRANTE, jamais bloquante.
  const [pausedPlatforms, setPausedPlatforms] = useState([]);
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const lire = async () => {
      try {
        const { data } = await supabase.from("platform_health").select("platform").eq("paused", true);
        if (alive) setPausedPlatforms((data ?? []).map(h => h.platform));
      } catch { /* jamais bloquant */ }
    };
    lire();
    const timer = setInterval(() => { if (document.visibilityState === "visible") lire(); }, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [user?.id]);
  const pausedSet = new Set(pausedPlatforms);

  const pendingTotal = Object.values(jobsByInventaire).flat()
    .filter(j => j.status === "pending").length;

  function replaceZoneResult(idx, patch) {
    setVoiceZoneResults(prev => prev.map((r, i) => i === idx ? {...r, ...patch} : r));
  }

  return (
    <>
      <style>{STOCK_TOP_CSS}</style>
      <style>{VOICE_KIT_CSS}</style>
      <div className="stock-top-v2">
        <div className="eyebrow-row">
          <div className="eyebrow">{lang==='en'?'AI Stock':'Stock IA'}</div>
          {pendingTotal>0&&(
            <div className="eyebrow-status">
              <span className="status-dot"/>
              {lang==='en'?`${pendingTotal} being posted`:`${pendingTotal} en cours de dépôt`}
            </div>
          )}
        </div>
      </div>
      <div style={!isMobile?{display:"grid",gridTemplateColumns:"300px 1fr",gap:20,alignItems:"start",width:"100%"}:{display:"flex",flexDirection:"column",gap:16,width:"100%",boxSizing:"border-box"}}>
        <div className="stock-top-v2" style={{background:"#fff",borderRadius:12,padding:20,display:"flex",flexDirection:"column",gap:12,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
          {/* ── Voice Capture (collapsible) ── */}
          {voiceZoneOpen&&(<>
          {voiceStep==="done"&&voiceZoneResults.length>0?(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* ⚠️ Ces cartes étaient dupliquées ici (~570 lignes) avec des styles
                  divergents de celles du drawer. Elles montent désormais LE composant
                  partagé VoiceResultCard — même rendu, même logique, une seule source
                  de vérité (unification du 2026-07-14). */}
              {voiceZoneResults.map((r,idx)=>(
                <VoiceResultCard
                  key={idx}
                  result={r}
                  idx={idx}
                  allResults={voiceZoneResults}
                  ctx={{
                    lang, currency, items,
                    actions:vaActions,
                    replaceResult:replaceZoneResult,
                    edits:zoneEdits,
                    setEdits:setZoneEdits,
                  }}
                />
              ))}
              <Btn kind="ghost" onClick={resetVoiceFlow} style={{width:"100%"}}>
                {lang==='fr'?"Recommencer":"Start over"}
              </Btn>
            </div>
          ):voiceStep==="error"?(
            <div style={{display:"flex",flexDirection:"column",gap:10,alignItems:"center",padding:"8px 0"}}>
              <div style={{fontSize:13,color:"#B0645A",fontWeight:600,textAlign:"center"}}>{voiceError}</div>
              <button onClick={resetVoiceFlow} style={{padding:"10px 20px",background:"#F3E6E3",color:"#B0645A",border:"1px solid #D9A69C",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {lang==='fr'?"Réessayer":"Try again"}
              </button>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column"}}>
              <div className="mode-toggle">
                <button type="button" className={"mode-btn"+(voiceInputMode==="write"?" active":"")} onClick={()=>setVoiceInputMode("write")}>
                  ✎ {lang==='fr'?"Écrire":"Write"}
                </button>
                <button type="button" className={"mode-btn"+(voiceInputMode==="speak"?" active":"")} onClick={()=>setVoiceInputMode("speak")}>
                  🎙 {lang==='fr'?"Parler":"Speak"}
                </button>
              </div>

              {voiceInputMode==="write"?(<>
                {voiceStep==="parsing"&&<div style={{fontSize:12,fontWeight:700,color:"#6B7A75",textAlign:"center",lineHeight:1.4,marginBottom:8}}>{lang==='fr'?"🧠 Analyse en cours...":"🧠 Analyzing..."}</div>}
                <textarea value={voiceText} onChange={e=>setVoiceText(e.target.value)} disabled={voiceLoading}
                  placeholder={getRotatingExamples(currency,lang)[voicePlaceholderIdx]?.text}
                  rows={3} style={{width:"100%",padding:"10px 14px",borderRadius:12,border:`1.5px solid ${voiceText?C.teal:"rgba(0,0,0,0.1)"}`,fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",background:"#fff",transition:"border-color 0.15s",boxSizing:"border-box",lineHeight:1.5,color:C.text}}/>
              </>):(
                <div className="voice-state">
                  <div className="voice-orb-wrap">
                    <span className="pulse-ring"/>
                    <span className="pulse-ring"/>
                    <span className="pulse-ring"/>
                    <button type="button"
                      className={"voice-orb"+(vaStep==="thinking"?" thinking":"")}
                      onClick={()=>fabTriggerRef?.current?.()}
                      disabled={vaStep==="thinking"}
                    >
                      {vaStep==="thinking"?"⏳":"🎙"}
                    </button>
                  </div>
                  <div className="voice-hint">
                    {vaStep==="recording"?(lang==='fr'?"Je t'écoute…":"Listening…")
                      :vaStep==="thinking"?(lang==='fr'?"Je réfléchis…":"Thinking…")
                      :(lang==='fr'?"Appuie et parle":"Tap and speak")}
                  </div>
                </div>
              )}

              <div className="hint-row">
                <span className="hint-icon">✦</span>
                <span className="hint-text">{lang==='fr'?"Plus tu détailles, plus l'IA est précise.":"The more you detail, the more accurate the AI is."}</span>
              </div>

              {voiceInputMode==="write"&&!isPremium&&(()=>{const r=VOICE_FREE_LIMIT-voiceUsedToday;return r<=2&&r>0?(<div style={{textAlign:'center',padding:'4px 10px',borderRadius:20,fontSize:12,fontWeight:700,background:r===1?'#FEE2E2':'#FEF3C7',color:r===1?'#DC2626':'#D97706',marginBottom:12}}>{r===1?(lang==='fr'?'⚠️ Dernière analyse vocale du jour !':'⚠️ Last voice analysis today!'):(lang==='fr'?`🎙️ Il vous reste ${r} analyses vocales`:`🎙️ ${r} voice analyses left`)}</div>):r===0?(<div style={{textAlign:'center',padding:'4px 10px',borderRadius:20,fontSize:12,fontWeight:700,background:'#FEE2E2',color:'#DC2626',marginBottom:12}}>{lang==='fr'?'🔒 Limite atteinte · Passer Premium':'🔒 Limit reached · Go Premium'}</div>):null;})()}

              {voiceInputMode==="write"&&(
                <button className={"cta"+((!voiceText.trim()||voiceLoading)?"":" active")} onClick={()=>callVoiceParse(voiceText)} disabled={!voiceText.trim()||voiceLoading}>
                  ✦ {lang==='fr'?"Analyser":"Analyze"}
                </button>
              )}

              <div className="examples-toggle" onClick={()=>setExamplesOpen(v=>!v)}>
                {lang==='fr'?"Voir des exemples":"See examples"}
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{transform:examplesOpen?"rotate(180deg)":"rotate(0deg)"}}>
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              {examplesOpen&&(()=>{
                const FIXED_EX=lang==='fr'?[
                  {text:"Veste Zara M, 8€",icon:"➕"},
                  {text:"Vendu mes Air Max 90, 45€",icon:"💰"},
                  {text:"Mes articles les plus rentables ?",icon:"📊"},
                ]:[
                  {text:"Zara jacket M, £8",icon:"➕"},
                  {text:"Sold my Air Max 90, £45",icon:"💰"},
                  {text:"My most profitable items?",icon:"📊"},
                ];
                return(
                  <div className="examples-panel">
                    {FIXED_EX.map((ex,i)=>(
                      <button key={i} type="button" className="example-chip" onClick={()=>{setVoiceText(ex.text);setVoiceInputMode("write");setExamplesOpen(false);}}>
                        <span>{ex.icon}</span>
                        <span>{ex.text}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
          </>)}
          {/* ── Toggle formulaire manuel ── */}
          <button onClick={()=>setShowManualForm(v=>!v)}
            style={{width:"100%",padding:"10px 14px",background:"transparent",border:"1px solid rgba(0,0,0,0.1)",borderRadius:10,fontSize:13,fontWeight:700,color:"#6B7A75",cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="#F9FAFB"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}
          >
            {showManualForm?(lang==='fr'?"− Fermer le formulaire ▴":"− Close form ▴"):(lang==='fr'?"+ Ajouter manuellement ▾":"+ Add manually ▾")}
          </button>
          {showManualForm&&(<>
          {/* ── Mode toggle ── */}
          <div style={{display:"flex",background:"rgba(0,0,0,0.05)",borderRadius:99,padding:3}}>
            <button onClick={()=>{setManualMode("single");setLotDistributed(null);}} style={{flex:1,padding:"7px 12px",borderRadius:99,border:"none",fontSize:13,fontWeight:700,cursor:"pointer",background:manualMode==="single"?"#1B6E62":"transparent",color:manualMode==="single"?"#fff":"#6B7A75",transition:"all 0.15s",fontFamily:"inherit"}}>
              {lang==='fr'?"Article seul":"Single item"}
            </button>
            <button onClick={()=>setManualMode("lot")} style={{flex:1,padding:"7px 12px",borderRadius:99,border:"none",fontSize:13,fontWeight:700,cursor:"pointer",background:manualMode==="lot"?"#1B6E62":"transparent",color:manualMode==="lot"?"#fff":"#6B7A75",transition:"all 0.15s",fontFamily:"inherit"}}>
              Lot
            </button>
          </div>
          {manualMode==="single"&&(<>
          {items.length===0?(
            <div style={{textAlign:"center",padding:"6px 0 10px",animation:"fadeIn 0.4s ease"}}>
              <div style={{width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#0E7C5F,#34D399)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 12px",boxShadow:"0 4px 16px rgba(29,158,117,0.3)"}}>📦</div>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>{lang==='en'?'Add your first item':'Ajoute ton premier article'}</div>
              <div style={{fontSize:12,color:C.sub,lineHeight:1.6,maxWidth:220,margin:"0 auto"}}>{lang==='en'?'Name + buy price is enough to start tracking your profit.':'Nom + prix d\'achat suffit pour commencer à suivre tes marges.'}</div>
            </div>
          ):(
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>{t('ajouterTitre')}</div>
          )}
          <div>
            <Field label={t('fieldNom')} value={iTitle} set={setITitle} placeholder="Ex: Air Max 90, Jean slim, Lot vêtements..." icon="🏷️"/>
            {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>{t('fieldNomHint')}</div>}
          </div>
          <div>
            <Field label={lang==='fr'?"Quantité":"Quantity"} value={String(iQuantite)} set={v=>setIQuantite(Math.max(1,parseInt(v)||1))} placeholder="1" type="number" icon="🔢"/>
          </div>
          <div>
            <Field label={lang==='fr'?"Marque (optionnel)":"Brand (optional)"} value={iMarque} set={setIMarque} placeholder={lang==='en'?"Ex: Nike, Zara, H&M, Unbranded...":"Ex: Nike, Zara, H&M, Sans marque..."} icon="✏️"/>
          </div>
          <div>
            <select value={iType} onChange={e=>setIType(e.target.value)}
              style={{background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:14,padding:"0 16px",height:58,fontSize:15,fontWeight:600,color:iType?"#10201B":"#A3A9A6",width:"100%",cursor:"pointer",fontFamily:"inherit",outline:"none",appearance:"auto"}}>
              <option value="">{(iTitle||iMarque)?(lang==='fr'?`🤖 Détecté : ${detectType(iTitle,iMarque)}`:`🤖 Detected: ${typeLabel(detectType(iTitle,iMarque),lang)}`):(lang==='fr'?'🤖 Détection automatique':'🤖 Auto-detection')}</option>
              <option value="Mode">👗 {typeLabel('Mode',lang)}</option>
              <option value="High-Tech">📱 High-Tech</option>
              <option value="Maison">🏠 {typeLabel('Maison',lang)}</option>
              <option value="Électroménager">⚡ {typeLabel('Électroménager',lang)}</option>
              <option value="Jouets">🧸 {typeLabel('Jouets',lang)}</option>
              <option value="Livres">📚 {typeLabel('Livres',lang)}</option>
              <option value="Sport">⚽ Sport</option>
              <option value="Auto-Moto">🚗 {typeLabel('Auto-Moto',lang)}</option>
              <option value="Beauté">💄 {typeLabel('Beauté',lang)}</option>
              <option value="Musique">🎵 {typeLabel('Musique',lang)}</option>
              <option value="Collection">🏆 Collection</option>
              <option value="Multimédia">📺 {typeLabel('Multimédia',lang)}</option>
              <option value="Jardin">🌿 {typeLabel('Jardin',lang)}</option>
              <option value="Bricolage">🔧 {typeLabel('Bricolage',lang)}</option>
              <option value="Autre">📦 {typeLabel('Autre',lang)}</option>
            </select>
          </div>
          <div>
            <Field label={lang==='fr'?"Prix d'achat":"Purchase price"} value={iBuy} set={setIBuy} placeholder="0,00" type="number" icon="🛒" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
            {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>{lang==='fr'?"Prix auquel tu as acheté l'article":"Price you paid for the item"}</div>}
          </div>
          <div>
            <Field label={lang==='fr'?"Frais d'achat (optionnel)":"Purchase fees (optional)"} value={iPurchaseCosts} set={setIPurchaseCosts} placeholder={lang==='fr'?"Livraison fournisseur, réparation...":"Supplier shipping, repair..."} type="number" icon="🛍️" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
            {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>{lang==='fr'?"Frais liés à l'achat : livraison, réparation...":"Purchase-side costs: shipping, repair..."}</div>}
          </div>
          <div>
            <label onClick={()=>setIAlreadySold(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"12px 14px",background:iAlreadySold?"#E7F3F0":"#F9FAFB",borderRadius:12,border:`1.5px solid ${iAlreadySold?"#1B6E62":"rgba(0,0,0,0.1)"}`,transition:"all 0.2s",userSelect:"none"}}>
              <div style={{width:36,height:20,borderRadius:10,background:iAlreadySold?"#1B6E62":"#D1D5DB",transition:"background 0.2s",position:"relative",flexShrink:0}}>
                <div style={{position:"absolute",top:2,left:iAlreadySold?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
              </div>
              <span style={{fontSize:13,fontWeight:700,color:iAlreadySold?"#1B6E62":"#6B7A75"}}>{lang==='fr'?'Déjà vendu ?':'Already sold?'}</span>
            </label>
          </div>
          {iAlreadySold&&(
            <>
              <div>
                <Field label={lang==='fr'?"Prix de vente":"Sell price"} value={iSell} set={setISell} placeholder="0,00" type="number" icon="💰" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
              </div>
              <div>
                <Field label={lang==='fr'?"Frais de vente (optionnel)":"Selling fees (optional)"} value={iSellingFees} set={setISellingFees} placeholder={lang==='fr'?"Commission Vinted, livraison client...":"Vinted fee, shipping to buyer..."} type="number" icon="📬" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
                <label style={{display:"flex",alignItems:"center",gap:8,marginTop:8,cursor:"pointer"}}>
                  <input type="checkbox" checked={iRememberSellingFees} onChange={e=>setIRememberSellingFees(e.target.checked)} style={{width:14,height:14,accentColor:C.teal,cursor:"pointer"}}/>
                  <span style={{fontSize:12,color:"#6B7A75",userSelect:"none"}}>{lang==='fr'?'Mémoriser ces frais de vente':'Remember selling fees'}</span>
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
          <div>
            <Field label={lang==='fr'?"Emplacement (optionnel)":"Storage location (optional)"} value={iEmplacement} set={setIEmplacement} placeholder={lang==='fr'?"Ex: Tiroir 45A, Portant 3, Étagère B...":"Ex: Drawer 45A, Rack 3, Shelf B..."} icon="📦"/>
          </div>
          <div>
            <Field label={lang==='fr'?"Plateforme de vente (optionnel)":"Resale platform (optional)"} value={iPlateforme} set={setIPlateforme} placeholder={lang==='fr'?"Ex: Vinted, eBay, Depop, Leboncoin...":"Ex: Vinted, eBay, Depop, Leboncoin..."} icon="🏪"/>
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
            ? <PremiumBanner userEmail={user?.email} onOpenModal={openUpgradeModal}/>
            : !isPremium&&items.length>=20&&isNative
            ? null
            : <button className="btn-pill-primary" onClick={addItem} disabled={!iTitle||!iBuy||(iAlreadySold&&!iSell)} style={{opacity:(!iTitle||!iBuy||(iAlreadySold&&!iSell))?0.5:1}}>
                {iSaved?(lang==='fr'?"✓ Ajouté !":"✓ Added!"):items.length===0?(lang==='fr'?"Ajoute ton premier article → vois ton bénéfice 🚀":"Add your first item → see your profit 🚀"):t('ajouterArticle')}
              </button>
          }
          {isNative&&!isPremium&&items.length>=20&&(
            <IAPUpgradeBlock lang={lang} iapProduct={iapProduct} iapLoading={iapLoading} onPurchase={openUpgradeModal} onRestore={handleIAPRestore}/>
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
                  <input type="number" value={lotManualTotal} onChange={e=>setLotManualTotal(e.target.value)} placeholder="0,00" inputMode="decimal" style={{background:"transparent",border:"none",outline:"none",color:C.text,fontSize:16,fontWeight:600,flex:1,fontFamily:"inherit"}}/>
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
                        <button onClick={()=>{setLotManualItems(prev=>prev.filter((_,idx)=>idx!==i));setLotDistributed(null);}} style={{background:"#F3E6E3",color:"#B0645A",border:"1px solid #D9A69C",borderRadius:8,padding:"8px 10px",fontSize:13,cursor:"pointer",fontFamily:"inherit",flexShrink:0,lineHeight:1}}>×</button>
                      )}
                    </div>
                    {lotDistributed?.items?.[i]&&(
                      <div style={{display:"flex",alignItems:"center",gap:8,paddingLeft:4,animation:"fadeIn 0.3s ease"}}>
                        <input type="number" value={lotDistributed.items[i].prix_estime_lot} onChange={e=>{const v=parseFloat(e.target.value)||0;setLotDistributed(prev=>({...prev,items:prev.items.map((it,idx)=>idx===i?{...it,prix_estime_lot:v}:it)}));}} style={{width:64,border:"1px solid #CBD5E0",borderRadius:6,padding:"2px 6px",fontSize:16,fontFamily:"inherit",outline:"none",fontWeight:700,color:C.green}}/>
                        <span style={{fontSize:12,color:C.label}}>€</span>
                        {lotDistributed.items[i].categorie&&(()=>{const ts=getTypeStyle(lotDistributed.items[i].categorie);return <span style={{background:ts.bg,color:ts.color,border:`1px solid ${ts.border}`,borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700}}>{ts.emoji} {typeLabel(lotDistributed.items[i].categorie,lang)}</span>;})()}
                        {lotDistributed.items[i].marque&&<span style={{fontSize:11,color:"#6B7A75",fontWeight:600}}>{lotDistributed.items[i].marque}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={()=>{setLotManualItems(prev=>[...prev,{nom:""}]);setLotDistributed(null);}} style={{padding:"8px",background:"transparent",border:"1px dashed rgba(0,0,0,0.2)",borderRadius:10,fontSize:13,fontWeight:700,color:"#6B7A75",cursor:"pointer",fontFamily:"inherit",width:"100%",transition:"all 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="#F9FAFB"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}
              >+ {lang==='fr'?"Ajouter un article":"Add item"}</button>
              <button onClick={handleLotDistribute} disabled={lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())}
                style={{width:"100%",padding:"14px",background:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"#DCEEEA":"linear-gradient(120deg,#2F9E90,#1B6E62)",color:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"#8FB5AE":"#fff",border:"none",borderRadius:999,fontSize:14,fontWeight:600,cursor:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"not-allowed":"pointer",boxShadow:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"none":"0 10px 24px -8px rgba(47,158,144,0.28)",transition:"all 0.2s",fontFamily:"inherit"}}>
                {lotDistributing?(lang==='fr'?"⏳ Répartition en cours...":"⏳ Distributing..."):(lang==='fr'?"✨ Répartir automatiquement":"✨ Auto distribute")}
              </button>
              {lotDistributed&&(
                <>
                  <div style={{fontSize:12,color:"#6B7A75",textAlign:"center",fontStyle:"italic"}}>{lang==='fr'?"Répartition estimée — modifiable":"Estimated split — editable"}</div>
                  <button onClick={addLotToInventory} style={{width:"100%",padding:"14px",background:"linear-gradient(120deg,#2F9E90,#1B6E62)",color:"#fff",border:"none",borderRadius:999,fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 10px 24px -8px rgba(47,158,144,0.28)",fontFamily:"inherit"}}>{lang==='fr'?"✓ Ajouter le lot à l'inventaire":"✓ Add lot to inventory"}</button>
                </>
              )}
            </div>
          )}
          </>)}
        </div>

        <div ref={listRef} className="stock-v2" style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:16}}>
          <style>{STOCK_CSS}</style>

          {/* ── Barre Import / Export ── */}
          {isPremium?(
            <div style={{background:"#fff",borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{flex:1,fontSize:13,fontWeight:700,color:C.text}}>{t('outilsPremium')}</div>
              <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={handleImportFile}/>
              <button onClick={()=>importRef.current?.click()} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:"#E7F3F0",color:"#1B6E62",border:"1px solid #2F9E9044",borderRadius:99,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap"}}
                onMouseEnter={e=>e.currentTarget.style.background="#DCEEEA"}
                onMouseLeave={e=>e.currentTarget.style.background="#E7F3F0"}
              >📥 {t('importer')}</button>
              <button onClick={handleExport} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:"#F2F0E9",color:"#6B7A75",border:"1px solid #E7E3D8",borderRadius:99,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap"}}
                onMouseEnter={e=>e.currentTarget.style.background="#EAE7DD"}
                onMouseLeave={e=>e.currentTarget.style.background="#F2F0E9"}
              >📤 {t('exporter')}</button>
              {importMsg&&<div style={{width:"100%",fontSize:12,color:C.green,fontWeight:600,marginTop:2}}>{importMsg}</div>}
            </div>
          ):(
            <div onClick={()=>{if(!isNative){track('premium_click',{source:'import_export'});openUpgradeModal();}}}
              style={{background:"linear-gradient(135deg,#1B6E6208,#E8956D08)",borderRadius:14,padding:"16px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:10,textAlign:"center",border:"1px solid rgba(232,149,109,0.22)",boxShadow:"0 2px 10px rgba(0,0,0,0.05)",cursor:!isNative?"pointer":"default"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#111827"}}>{t('importExcel')}</div>
              <div style={{fontSize:11,color:"#6B7A75",opacity:0.8,lineHeight:1.5}}>{t('importDesc')}</div>
              {!isNative&&<PremiumBanner userEmail={user?.email} compact/>}
            </div>
          )}

          {/* ── Barre de recherche + Filtres type ── */}
          <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"10px 16px"}}>
            <span style={{fontSize:14,flexShrink:0}}>🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder={lang==='fr'?"Rechercher...":"Search..."}
              style={{flex:1,border:"none",outline:"none",fontSize:14,background:"transparent",fontFamily:"inherit",color:"#10201B"}}/>
            {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#A3A9A6",flexShrink:0,padding:0,lineHeight:1}}>✕</button>}
          </div>
          {(()=>{
            // Basé uniquement sur stock (pas sold) : les pills de catégorie filtrent la
            // section EN STOCK ci-dessous (VENDUS est masqué dans Stock IA) — une catégorie
            // sans article en stock ne doit plus s'afficher, même si elle a des ventes passées.
            const presentTypes=["Tous","Mode","High-Tech","Maison","Électroménager","Jouets","Livres","Sport","Auto-Moto","Beauté","Musique","Collection","Multimédia","Jardin","Bricolage","Autre"].filter(tp=>tp==="Tous"||stock.some(i=>i.type===tp));
            return presentTypes.length>1&&(
              <div className="cat-filters">
                {presentTypes.map(tp=>{
                  const isActive=filterType===tp;
                  return(
                    <button key={tp} className={`fpill${isActive?" active":""}`} onClick={()=>setFilterType(tp)}>
                      <span className="fdot" style={{background:tp==="Tous"?"linear-gradient(155deg,#2F9E90,#1B6E62)":getCatTileColor(tp)}}/>
                      {tp==="Tous"?(lang==='en'?'All':'Tous'):typeLabel(tp,lang)}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* ── VENDUS — masqués dans Stock IA (visible dans Ventes) ── */}
          {false&&<div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{fontSize:13,fontWeight:700,color:"#10201B"}}>{t('vendus')}</div>
                {isMobile&&(()=>{const _b=[...new Set(sold.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];return _b.length>0&&(<button onClick={()=>setPillsExpandedSold(v=>!v)} style={{padding:"3px 9px",borderRadius:99,fontSize:10,fontWeight:700,cursor:"pointer",border:"1px solid rgba(0,0,0,0.1)",background:"transparent",color:"#6B7A75",lineHeight:1.4,fontFamily:"inherit"}}>{pillsExpandedSold?`‹ ${lang==='en'?'Close':'Fermer'}`:`${lang==='en'?'Brands':'Marques'} (${_b.length}) ›`}</button>);})()}
              </div>
              <div style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{tpl('venteLabel',{n:soldQty??sold.length})}</div>
            </div>
            {(()=>{
              const _slAll=[...new Set(sold.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];
              const marquesFiltreesParType=["Toutes",..._slAll.filter(b=>b.toLowerCase()!=="sans marque"),..._slAll.filter(b=>b.toLowerCase()==="sans marque")];
              if(marquesFiltreesParType.length<=1) return null;
              const _mob=isMobile;
              const _open=!_mob||pillsExpandedSold;
              return(
                <div style={{marginBottom:12}}>
                  {!_open&&(
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>setFilterMarqueSold("Toutes")} style={{padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",background:filterMarqueSold==="Toutes"?"#1B6E62":"#F2F0E9",color:filterMarqueSold==="Toutes"?"#fff":"#6B7A75"}}>
                        {filterMarqueSold==="Toutes"?(lang==='en'?'All':'Toutes'):marqueLabel(filterMarqueSold,lang)}
                      </button>
                    </div>
                  )}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",maxHeight:_open?"300px":"0",overflow:"hidden",opacity:_open?1:0,transition:"max-height 0.25s ease, opacity 0.2s ease"}}>
                    {marquesFiltreesParType.map(m=>(
                      <button key={m} onClick={()=>setFilterMarqueSold(m)}
                        style={{padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",transition:"all 0.15s",
                          background:filterMarqueSold===m?"#1B6E62":"#F2F0E9",
                          color:filterMarqueSold===m?"#fff":"#6B7A75"}}>
                        {m==="Toutes"?(lang==='en'?'All':'Toutes'):marqueLabel(m,lang)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {sold.length===0?(
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",top:-6,right:0,background:"#F2F0E9",color:"#8A8578",fontSize:9,fontWeight:700,borderRadius:99,padding:"2px 8px",letterSpacing:"0.06em",textTransform:"uppercase",zIndex:2,border:"1px solid #E7E3D8"}}>
                  {lang==='en'?'Preview':'Exemple'}
                </span>
                <div style={{display:"flex",flexDirection:"column",gap:8,opacity:0.55,pointerEvents:"none",userSelect:"none"}}>
                  {SKELETON_SOLD.map((sk,i)=>{
                    const ts=getTypeStyle(sk.type);
                    return(
                      <div key={i} className="skeleton-item-row" style={{background:"#fff",borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",borderLeft:`3px solid ${getCatBorder(sk.type)}`}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <div style={{fontWeight:700,fontSize:14,color:"#10201B"}}>{sk.title}</div>
                            <span style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,border:"1px solid #BFE0D9"}}>{sk.marque}</span>
                            <span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(sk.type,lang)}</span>
                          </div>
                          <div style={{fontSize:11,color:"#A3A9A6",marginTop:2}}>{t('skeletonAchat')} {fmt(sk.buy)} → {t('skeletonVente')} {fmt(sk.sell)}</div>
                        </div>
                        <div style={{textAlign:"right",minWidth:90,flexShrink:0}}>
                          <div style={{fontWeight:700,fontSize:18,color:getMargeColor(sk.marginPct)}}>+{fmt(sk.margin)}</div>
                          <div style={{fontSize:11,color:"#6B7A75",marginTop:1}}>{Math.round(sk.marginPct)}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {soldVisible.map(item=>{
                  const mc=getMargeColor(item.marginPct);
                  const ts=getTypeStyle(item.type);
                  const qty=item.quantite||1;
                  return(
                    <SwipeRow key={item.id} onDelete={()=>delItem(item.id)} onEdit={()=>setEditItem({...item,frais:0,sell:item.sell??""})} style={{borderLeft:`3px solid ${getCatBorder(item.type)}`}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <div style={{fontWeight:700,fontSize:14,color:"#10201B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                          {qty>1&&<span style={{background:"#1B6E62",color:"#fff",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,flexShrink:0}}>×{qty}</span>}
                          {item.marque&&<span style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #BFE0D9"}}>{marqueLabel(item.marque,lang)}</span>}
                          {item.type&&item.type!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(item.type,lang)}</span>}
                          {item.plateforme&&<span style={{background:"#EDE9FE",color:"#7C3AED",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #C4B5FD"}}>🏪 {item.plateforme}</span>}
                        </div>
                        <div style={{fontSize:11,color:"#A3A9A6",marginTop:4}}>{lang==='fr'?'Achat':'Bought'} {fmt(item.buy+(item.purchaseCosts||0))} → {lang==='fr'?'Vente':'Sold'} {fmt((item.sell||0)*qty)}</div>
                      </div>
                      <div style={{textAlign:"right",minWidth:90,flexShrink:0}}>
                        <div style={{fontWeight:700,fontSize:18,color:mc}}>{fmt((item.margin||0)*qty)}</div>
                        <div style={{fontSize:11,color:"#6B7A75",marginTop:1}}>{fmtp(item.marginPct)}</div>
                      </div>
                    </SwipeRow>
                  );
                })}
                {soldFiltre.length>10&&!soldShowAll&&(
                  <button onClick={()=>setSoldShowAll(true)} style={{width:"100%",padding:"10px",background:"#F2F0E9",border:"none",borderRadius:10,fontSize:12,fontWeight:700,color:"#6B7A75",cursor:"pointer",marginTop:4}}>
                    {lang==='fr'?`Voir plus (${soldFiltre.length-10} articles)`:`Show more (${soldFiltre.length-10} items)`}
                  </button>
                )}
                <div style={{height:24}}/>
              </div>
            )}
          </div>}

          {/* ── EN STOCK ── */}
          <div style={{background:"#F6F5F1",borderRadius:16,padding:16,border:"1px solid #E7E3D8"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{fontSize:13,fontWeight:700,color:"#10201B"}}>{t('enStockLabel')}</div>
                {!isPremium&&items.length>=20&&<span style={{fontSize:10,fontWeight:700,background:"#FFF4EE",color:"#F9A26C",borderRadius:99,padding:"2px 8px",border:"1px solid #F9A26C44"}}>{lang==='fr'?'Plan gratuit':'Free plan'}</span>}
                {(()=>{const _b=[...new Set(stock.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];if(!_b.length)return null;return(<>{!pillsExpandedStock&&(<button onClick={()=>setFilterMarque("Toutes")} style={{padding:"4px 10px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",background:filterMarque==="Toutes"?"#1B6E62":"#F2F0E9",color:filterMarque==="Toutes"?"#fff":"#6B7A75"}}>{lang==='en'?'All':'Toutes'}</button>)}<button onClick={()=>setPillsExpandedStock(v=>!v)} style={{padding:"3px 9px",borderRadius:99,fontSize:10,fontWeight:700,cursor:"pointer",border:"1px solid rgba(0,0,0,0.1)",background:"transparent",color:"#6B7A75",lineHeight:1.4,fontFamily:"inherit"}}>{pillsExpandedStock?`‹ ${lang==='en'?'Close':'Fermer'}`:`${lang==='en'?'Brands':'Marques'} (${_b.length}) ›`}</button></>);})()}
              </div>
              {(()=>{
                // Reflète le filtre actif (catégorie/marque/recherche) au lieu du total global :
                // même formule que stockQty/stockVal (App.jsx) mais appliquée à stockFiltre.
                const _fQty=stockFiltre.reduce((a,i)=>a+(i.quantite||1),0);
                const _fVal=stockFiltre.reduce((a,i)=>a+i.buy*(i.quantite||1),0);
                return <div style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{_fQty} {lang==='fr'?'art.':'items'} · {fmt(_fVal)}</div>;
              })()}
            </div>
            {(()=>{
              const _sbAll=[...new Set(stock.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];
              const marquesStockFiltreesParType=["Toutes",..._sbAll.filter(b=>b.toLowerCase()!=="sans marque"),..._sbAll.filter(b=>b.toLowerCase()==="sans marque")];
              if(marquesStockFiltreesParType.length<=1) return null;
              const _open=pillsExpandedStock;
              return(
                <div style={{marginBottom:12}}>

                  <div style={{display:"flex",gap:6,flexWrap:"wrap",maxHeight:_open?"2000px":"0",overflow:"hidden",opacity:_open?1:0,transition:"max-height 0.3s ease, opacity 0.2s ease"}}>
                    {marquesStockFiltreesParType.map(m=>(
                      <button key={m} onClick={()=>setFilterMarque(m)}
                        style={{padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",transition:"all 0.15s",
                          background:filterMarque===m?"#1B6E62":"#F2F0E9",
                          color:filterMarque===m?"#fff":"#6B7A75"}}>
                        {m==="Toutes"?(lang==='en'?'All':'Toutes'):marqueLabel(m,lang)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {stock.length===0?(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>

                {/* 1. Bannière */}
                <div style={{background:"#F0FDFB",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(13,148,136,0.15)"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>
                        {lang==='fr'?'APERÇU DE TON FUTUR STOCK':'PREVIEW OF YOUR FUTURE STOCK'}
                      </div>
                      <div style={{fontSize:13,fontWeight:600,color:"#10201B",lineHeight:1.3,fontFamily:"inherit"}}>
                        {lang==='fr'?"L'IA classe tout automatiquement":"AI classifies everything automatically"}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,flexShrink:0}}>
                      <div style={{background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:10,padding:"8px 12px",textAlign:"center"}}>
                        <div style={{fontSize:17,fontWeight:700,color:"#10201B",lineHeight:1}}>{SKELETON_ITEMS.length}</div>
                        <div style={{fontSize:9,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.05em",marginTop:3}}>{lang==='fr'?'articles':'items'}</div>
                      </div>
                      <div style={{background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:10,padding:"8px 12px",textAlign:"center"}}>
                        <div style={{fontSize:17,fontWeight:700,color:"#F9A26C",lineHeight:1}}>{fmt(SKELETON_ITEMS.reduce((a,s)=>a+s.buy,0))}</div>
                        <div style={{fontSize:9,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.05em",marginTop:3}}>{lang==='fr'?'investi':'invested'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Séparateur */}
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,height:1,background:"rgba(0,0,0,0.08)"}}/>
                  <span style={{fontSize:11,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.07em",whiteSpace:"nowrap",flexShrink:0}}>
                    {lang==='fr'?"EXEMPLES D'ARTICLES EN STOCK":"EXAMPLE STOCK ITEMS"}
                  </span>
                  <div style={{flex:1,height:1,background:"rgba(0,0,0,0.08)"}}/>
                </div>

                {/* 3. Liste enrichie — badge EXEMPLE conservé */}
                <div style={{position:"relative"}}>
                  <span style={{position:"absolute",top:-6,right:0,background:"#F2F0E9",color:"#8A8578",fontSize:9,fontWeight:700,borderRadius:99,padding:"2px 8px",letterSpacing:"0.06em",textTransform:"uppercase",zIndex:2,border:"1px solid #E7E3D8"}}>
                    {lang==='en'?'Preview':'Exemple'}
                  </span>
                  <div style={{display:"flex",flexDirection:"column",gap:8,opacity:0.72,pointerEvents:"none",userSelect:"none"}}>
                    {[
                      {nom:"Veste Zara oversize",  marque:"Zara",    categorie:"Mode",       buy:12,  quantite:1,  description:"Taille M, noir, très bon état, acheté à Vide-grenier",                       emplacement:"Étagère salon"},
                      {nom:"Lot Pokémon",          marque:"Pokémon", categorie:"Collection", buy:8,   quantite:20, description:"Cartes communes + 2 rares, sous pochette, acheté à Brocante",                emplacement:"Boîte à cartes"},
                      {nom:"iPhone 12 64Go",       marque:"Apple",   categorie:"High-Tech",  buy:180, quantite:1,  description:"Écran fissuré, fonctionne parfaitement, acheté à Leboncoin",                  emplacement:"Portant 1"},
                      {nom:"Sac Kelly Hermès",     marque:"Hermès",  categorie:"Mode",       buy:125, quantite:1,  description:"Authentique, sangles légèrement usées, acheté à Dépôt-vente",                emplacement:"Vitrine luxe"},
                      {nom:"Jean Levis 501",       marque:"Levis",   categorie:"Mode",       buy:15,  quantite:1,  description:"Taille 32, bleu délavé, vintage 90s, acheté à Facebook Marketplace",          emplacement:"Étagère bureau"},
                    ].map((it,i)=>{
                      const {loc:_loc,rest:_desc}=parseLocDesc(it.description);
                      return(
                        <div key={i} className="row">
                          <div className={`cat-tile ${catClass(it.categorie)}`}>{detectObjectIcon(it.nom,it.description,it.categorie)}</div>
                          <div className="left">
                            <div className="title-line">
                              <span className="title">{it.nom}</span>
                              {it.marque&&(<><span className="brand-dot"/><span className="brandname">{it.marque}</span></>)}
                              {it.quantite>1&&<span className="qty-badge">×{it.quantite}</span>}
                            </div>
                            <div className="meta">
                              {(_desc||_loc)&&(<><span className="hl">{_desc||_loc}</span>{" · "}</>)}
                              {typeLabel(it.categorie,lang)}
                            </div>
                            {it.emplacement&&(
                              <div className="icons">
                                <div className="micon ic-loc">📦 {it.emplacement}</div>
                              </div>
                            )}
                          </div>
                          <div className="right">
                            <div className="price">{fmt(it.buy*(it.quantite||1))}<span className="lbl">{lang==='fr'?'investi':'invested'}</span></div>
                            <div className="btn-stack">
                              <div className="btn-publier">{lang==='fr'?'Publier':'Publish'}</div>
                              <div className="btn-vendre">{lang==='fr'?'Vendre':'Sell'}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. CTA */}
                <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:4}}>
                  <button
                    onClick={()=>scrollRef.current?.scrollTo({top:0,behavior:"smooth"})}
                    style={{width:"100%",padding:"14px",background:"linear-gradient(120deg,#2F9E90,#1B6E62)",color:"#fff",border:"none",borderRadius:999,fontSize:14,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit",boxShadow:"0 10px 24px -8px rgba(47,158,144,0.28)"}}
                    onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
                    onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
                    onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
                  >
                    🎙️ {lang==='fr'?'Ajouter avec la voix':'Add with voice'}
                  </button>
                  <button
                    onClick={()=>{setShowManualForm(true);scrollRef.current?.scrollTo({top:0,behavior:"smooth"});}}
                    style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#6B7A75",padding:"4px",fontFamily:"inherit",textDecoration:"underline",textDecorationColor:"rgba(107,114,128,0.35)"}}
                  >
                    + {lang==='fr'?'Ajouter manuellement':'Add manually'}
                  </button>
                </div>

              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {stockVisible.map(item=>{
                  const {loc:_itemLoc,rest:_itemDesc}=parseLocDesc(item.description);
                  const invested=item.buy*(item.quantite||1)+(item.purchaseCosts||0);
                  const jobs=jobsByInventaire[item.id]||[];
                  // ⚠️ dédoublonnage (2026-07-13) : un article REPUBLIÉ crée un
                  // NOUVEAU job pour la même plateforme, sans clore l'ancien —
                  // deux jobs "published" leboncoin coexistent donc en base pour
                  // la même et unique annonce (même listing_url, vérifié). Sans
                  // ce Set, la pastille Leboncoin s'affichait DEUX FOIS.
                  const published=[...new Set(jobs.filter(j=>j.status==="published").map(j=>j.platform))];
                  // "processing" = publication en cours côté extension : même
                  // affichage « En cours… » que pending (pour le vendeur, c'est
                  // le même moment ; la nuance est purement interne).
                  const hasPending=jobs.some(j=>j.status==="pending"||j.status==="processing");
                  // Job en attente sur une plateforme EN PAUSE (maintenance) :
                  // badge dédié « reprise auto » plutôt que le simple « En cours ».
                  const hasPausedPending=jobs.some(j=>(j.status==="pending"||j.status==="processing")&&pausedSet.has(j.platform));
                  const enLigne=published.length>0;
                  const openEdit=()=>setEditItem({...item,frais:0,sell:item.sell??""});
                  return(
                    // Swipe gauche = supprimer (conservé) ; tap sur la carte = éditer.
                    <SwipeRow key={item.id} onDelete={()=>delItem(item.id)} style={{borderRadius:16,border:"1px solid #E7E3D8",boxShadow:"none"}}>
                      {/* Tap sur la carte = éditer (l'icône crayon a été retirée le
                          2026-07-14 : toute la ligne est cliquable, l'affordance
                          était redondante et venait coller le prix). */}
                      <div className="row in-swipe" onClick={openEdit}>
                        <div className={`cat-tile ${catClass(item.type)}`}>{detectObjectIcon(item.title,item.description,item.type)}</div>
                        <div className="left">
                          <div className="title-line">
                            <span className="title">{item.title}</span>
                            {item.marque&&(<><span className="brand-dot"/><span className="brandname">{marqueLabel(item.marque,lang)}</span></>)}
                            {(item.quantite||1)>1&&<span className="qty-badge">×{item.quantite}</span>}
                          </div>
                          <div className="meta">
                            {(_itemDesc||_itemLoc)&&(<><span className="hl">{_itemDesc||_itemLoc}</span>{" · "}</>)}
                            {typeLabel(item.type||"Autre",lang)}
                          </div>
                          {(enLigne||hasPending||item.plateforme||item.emplacement)&&(
                            <div className="icons">
                              {/* Statut explicite : les pastilles de plateformes disaient OÙ,
                                  jamais QUE l'article est en ligne — d'où la confusion avec
                                  un article jamais publié. */}
                              {enLigne&&<div className="micon ic-online"><span className="dot"/>{lang==="en"?"Live":"En ligne"}</div>}
                              {/* LOGOS, pas les noms écrits : « Leboncoin » + « Beebs » en
                                  toutes lettres débordaient la carte en largeur mobile, quel
                                  que soit le CSS. Un logo carré de 18 px règle le problème à
                                  la racine. title= garde le nom accessible au survol/lecteur
                                  d'écran. */}
                              {published.map(p=>(
                                <span key={p} className="plogo" title={PLATFORM_LABELS[p]||p}>
                                  <PlatformLogo platform={p} size={18}/>
                                </span>
                              ))}
                              {hasPending&&!hasPausedPending&&<div className="micon ic-pending">⏳ {lang==="en"?"Posting…":"En cours…"}</div>}
                              {/* Maintenance (Phase B) : plateforme en pause,
                                  ton neutre, rassurant, aucune action requise. */}
                              {hasPausedPending&&<div className="micon" style={{background:"#EFF3F8",border:"1px solid #C7D6E5",color:"#334155"}}>⏸ {t("stockJobPausedBadge")}</div>}
                              {!enLigne&&!hasPending&&item.plateforme&&<div className="micon ic-plateforme">🏪 {item.plateforme}</div>}
                              {item.emplacement&&<div className="micon ic-loc">📦 {item.emplacement}</div>}
                            </div>
                          )}
                        </div>
                        <div className="right">
                          <div className="price">{fmt(invested)}<span className="lbl">{lang==='fr'?'investi':'invested'}</span></div>
                          <div className="btn-stack">
                            {/* Déjà en ligne : le bouton reste (on peut vouloir ajouter une
                                plateforme) mais il ne dit plus « Publier » — il disait à
                                l'utilisateur qu'il RESTAIT quelque chose à faire, alors que
                                l'annonce était en ligne. */}
                            {isPro&&(
                              <button className={enLigne?"btn-publier is-online":"btn-publier"} onClick={e=>{e.stopPropagation();if(shouldShowExtensionReminder()){setExtReminderItem(item);}else{ouvrirStepper(item);}}}>
                                {enLigne?(lang==='fr'?'Republier':'Republish'):(lang==='fr'?'Publier':'Publish')}
                              </button>
                            )}
                            <button className="btn-vendre" onClick={e=>{e.stopPropagation();markSold(item);}}>
                              {lang==='fr'?'Vendre':'Sell'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </SwipeRow>
                  );})}
                {stockFiltre.length>10&&!showAllStock&&(
                  <button onClick={()=>setShowAllStock(true)} style={{width:"100%",padding:"10px",background:"#F2F0E9",border:"none",borderRadius:10,fontSize:12,fontWeight:700,color:"#6B7A75",cursor:"pointer",marginTop:4}}>
                    {lang==='fr'?`Voir plus (${stockFiltre.length-10} articles)`:`Show more (${stockFiltre.length-10} items)`}
                  </button>
                )}
                <div style={{height:24}}/>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* initialListing depuis la ligne inventaire : sans lui, platformSupport
          calculait detectObjectIcon(undefined) → 📦 → 4 plateformes "unmapped",
          chips grisées et CTA "Générer" mort (bug du 2026-07-11). Mêmes clés que
          le lensResult du flux Lens ; les champs Lens absents (prix_vente_suggere,
          taille_estimee, etat_estime…) restent undefined → les fallbacks invId du
          stepper (prix DB…) s'appliquent comme avant. initialPhotos : photos déjà
          connues de l'article (format inventaire.photos [{type,url}], mêmes
          fallbacks que la relecture cross_post_jobs du stepper) — vide → étape
          upload comme avant. */}
      {extReminderItem&&(
        <ExtensionReminderModal
          lang={lang}
          onClose={()=>setExtReminderItem(null)}
          onContinue={()=>{const it=extReminderItem;setExtReminderItem(null);ouvrirStepper(it);}}
        />
      )}
      {publishItem&&(
        <ListingPreviewScreen
          inventaireId={publishItem.id}
          userId={user.id}
          initialPhotos={(Array.isArray(publishItem.photos)?publishItem.photos:[])
            .map(p=>p?.url||p?.original||p?.enhanced||p?.bg_removed)
            .filter(Boolean)}
          initialListing={{
            titre:       publishItem.titre       ?? null,
            description: publishItem.description ?? null,
            categorie:   publishItem.type        ?? null,
            marque:      publishItem.marque      ?? null,
            // Prix connu de la ligne inventaire (2026-07-13, job 3d194668) :
            // pré-remplissage SYNCHRONE de la carte — le fallback DB du
            // stepper existe mais arrive en async, et surtout il ne couvre
            // pas ce que la ligne sait déjà. prix_vente est désormais tenu à
            // jour à chaque publication (fix bd9a516).
            prix_vente_suggere: publishItem.prix_vente ?? publishItem.prix_achat ?? null,
          }}
          onClose={()=>{clearStepperPersistence();setPublishItem(null);onStepperOpenChange?.(false);}}
          supabase={supabase}
          lang={lang}
          isPremium={isPremium}
          isPro={isPro}
          onUpgrade={openUpgradeModal}
        />
      )}
    </>
  );
});

export default StockTab;
