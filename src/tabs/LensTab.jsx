import { memo, useState, useEffect } from 'react';
import { getRotatingLensPlaceholders, formatCurrency, getTypeStyle, typeLabel } from '../utils/shared';

const LENS_EXAMPLES = [
  {
    title:'Air Jordan 1 Retro High', marque:'Nike', type:'Sport', typeDisplay:'Sneakers',
    score:8.2, priceMin:145, priceMax:180,
    analyse:"✅ Excellente opportunité. Les Jordan 1 Retro High s'écoulent très bien sur Vinted et StockX. Délai moyen : 4 à 6 jours. Vends entre 155€ et 165€ pour maximiser ta marge. Inclure la boîte originale augmente la valeur perçue de ~15%.",
    analyseEn:"✅ Great opportunity. Air Jordan 1 Retro Highs sell fast on StockX & Vinted. Avg. time: 4–6 days. Sell at €155–165 to maximise margin. Including the original box boosts perceived value by ~15%.",
  },
  {
    title:'Sac Louis Vuitton Speedy', marque:'Louis Vuitton', type:'Luxe', typeDisplay:null,
    score:5.1, priceMin:420, priceMax:550,
    analyse:"⚠️ Score mitigé. Des signaux visuels alertent : coutures asymétriques et logo légèrement décalé. Risque contrefaçon modéré — fais authentifier avant d'acheter. Si authentique, potentiel de revente solide à 480–520€.",
    analyseEn:"⚠️ Mixed score. Visual warnings: asymmetric stitching and slightly off-centre logo. Moderate counterfeit risk — get it authenticated first. If genuine, solid resale potential at €480–520.",
  },
  {
    title:'iPhone 14 Pro écran fissuré', marque:'Apple', type:'High-Tech', typeDisplay:null,
    score:3.4, priceMin:280, priceMax:320,
    analyse:"❌ Mauvaise affaire au prix actuel. L'écran fissuré réduit la valeur de revente de 35–40%. Réparation : 80–120€ en SAV agréé. Marge nette quasi nulle. Négocie fortement sous 150€ ou passe ton tour.",
    analyseEn:"❌ Bad deal at current price. Cracked screen cuts resale value by 35–40%. Repair: €80–120 at an authorised centre. Net margin nearly zero. Negotiate hard below €150 or walk away.",
  },
];

const scoreColor = s => s>=6.5?'#16A34A':s>=4?'#D97706':'#DC2626';
const scoreBg    = s => s>=6.5?'#F0FDF4':s>=4?'#FFFBEB':'#FFF5F5';
const scoreBd    = s => s>=6.5?'rgba(22,163,74,0.2)':s>=4?'rgba(217,119,6,0.2)':'rgba(220,38,38,0.2)';
const scoreLabel = (s,lang) => s>=6.5?(lang==='en'?'Good deal':'Bon deal'):s>=4?(lang==='en'?'Average':'Mitigé'):(lang==='en'?'Avoid':'Éviter');

function LensTicker({ lang, onScan }) {
  const [idx, setIdx]           = useState(0);
  const [visible, setVisible]   = useState(true);
  const [progress, setProgress] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [gaugeW, setGaugeW]     = useState(0);
  const [dotOn, setDotOn]       = useState(true);

  const DURATION = 5500;
  const ex = LENS_EXAMPLES[idx];
  const sc = scoreColor(ex.score);
  const ts = getTypeStyle(ex.type);
  const analyseText = lang==='en' ? ex.analyseEn : ex.analyse;

  useEffect(() => {
    let raf, timeout=null, startTs=null, cancelled=false;
    function tick(ts) {
      if (cancelled) return;
      if (!startTs) startTs=ts;
      const p=Math.min((ts-startTs)/DURATION,1);
      setProgress(p);
      if (p<1) { raf=requestAnimationFrame(tick); }
      else {
        setVisible(false);
        timeout=setTimeout(()=>{
          if (cancelled) return;
          setIdx(i=>(i+1)%LENS_EXAMPLES.length);
          setProgress(0);
          setVisible(true);
        },450);
      }
    }
    raf=requestAnimationFrame(tick);
    return ()=>{ cancelled=true; cancelAnimationFrame(raf); if(timeout) clearTimeout(timeout); };
  },[idx]);

  useEffect(()=>{
    const text=lang==='en'?LENS_EXAMPLES[idx].analyseEn:LENS_EXAMPLES[idx].analyse;
    setDisplayed('');
    let charIdx=0, timer;
    const startDelay=setTimeout(()=>{
      timer=setInterval(()=>{
        charIdx++;
        setDisplayed(text.slice(0,charIdx));
        if(charIdx>=text.length) clearInterval(timer);
      },22);
    },500);
    return ()=>{ clearTimeout(startDelay); if(timer) clearInterval(timer); };
  },[idx,lang]);

  useEffect(()=>{
    setGaugeW(0);
    const t=setTimeout(()=>setGaugeW(LENS_EXAMPLES[idx].score*10),80);
    return ()=>clearTimeout(t);
  },[idx]);

  useEffect(()=>{
    const interval=setInterval(()=>setDotOn(p=>!p),800);
    return ()=>clearInterval(interval);
  },[]);

  const featurePills = lang==='en'
    ?['📸 Photo analysis','💰 Market price','⚠️ Risk detection']
    :['📸 Analyse photo','💰 Prix marché','⚠️ Détection risques'];

  return (
    <div style={{marginBottom:8}}>
      <div style={{fontSize:11,fontWeight:800,color:'#A3A9A6',textTransform:'uppercase',letterSpacing:'0.08em',textAlign:'center',marginBottom:10}}>
        {lang==='fr'?"EXEMPLE D'ANALYSE LENS":"LENS ANALYSIS EXAMPLE"}
      </div>

      <div style={{background:'#fff',borderRadius:12,border:'1px solid rgba(0,0,0,0.06)',borderLeft:`3px solid ${sc}`,boxShadow:'0 1px 3px rgba(0,0,0,0.04)',overflow:'hidden',marginBottom:10}}>
        <div style={{padding:'12px 14px',opacity:visible?1:0,transform:visible?'translateY(0)':'translateY(6px)',transition:'opacity 0.45s ease,transform 0.45s ease'}}>

          <div style={{fontWeight:700,fontSize:14,color:'#0D0D0D',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:6}}>
            {ex.title}
          </div>

          <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginBottom:10}}>
            <span style={{background:'#E8F5F0',color:'#1D9E75',borderRadius:99,padding:'2px 8px',fontSize:10,fontWeight:700,border:'1px solid #9FE1CB'}}>
              {ex.marque}
            </span>
            <span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:'2px 8px',fontSize:10,fontWeight:700,border:`1px solid ${ts.border}`}}>
              {ts.emoji} {ex.typeDisplay||typeLabel(ex.type,lang)}
            </span>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
            <div style={{flexShrink:0}}>
              <div style={{fontSize:9,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>DEAL SCORE</div>
              <div style={{fontSize:26,fontWeight:900,color:sc,letterSpacing:'-0.03em',lineHeight:1}}>
                {ex.score.toFixed(1)}<span style={{fontSize:12,fontWeight:600,color:'#A3A9A6'}}>/10</span>
              </div>
            </div>
            <div style={{flex:1}}>
              <div style={{height:8,background:'#F3F4F6',borderRadius:4,overflow:'hidden'}}>
                <div style={{height:'100%',background:sc,width:`${gaugeW}%`,transition:'width 1.1s cubic-bezier(0.22,1,0.36,1)',borderRadius:4}}/>
              </div>
              <div style={{fontSize:10,fontWeight:700,color:sc,marginTop:3}}>{scoreLabel(ex.score,lang)}</div>
            </div>
          </div>

          <div style={{fontSize:12,color:'#6B7280',fontWeight:600,marginBottom:8}}>
            {lang==='fr'?'Prix marché estimé : ':'Est. market price: '}
            <span style={{color:'#0D0D0D',fontWeight:800}}>{ex.priceMin}–{ex.priceMax}€</span>
          </div>

          <div style={{background:scoreBg(ex.score),border:`1px solid ${scoreBd(ex.score)}`,borderRadius:10,padding:'10px 12px',minHeight:110}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:sc,opacity:dotOn?1:0.2,transition:'opacity 0.3s ease',flexShrink:0}}/>
              <span style={{fontSize:9,fontWeight:800,color:sc,textTransform:'uppercase',letterSpacing:'0.06em'}}>
                {lang==='fr'?'Analyse IA':'AI Analysis'}
              </span>
            </div>
            <div style={{fontSize:12,color:'#374151',lineHeight:1.55,fontWeight:500}}>
              {displayed}{displayed.length<analyseText.length&&<span style={{opacity:0.4}}>|</span>}
            </div>
          </div>

          <div style={{marginTop:10,height:2,background:'#F3F4F6',borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',background:sc,width:`${progress*100}%`}}/>
          </div>
        </div>
      </div>

      <div style={{display:'flex',justifyContent:'center',gap:6,marginBottom:16}}>
        {LENS_EXAMPLES.map((_,i)=>(
          <div key={i} style={{width:6,height:6,borderRadius:'50%',background:i===idx?scoreColor(LENS_EXAMPLES[i].score):'#E5E7EB',transition:'background 0.3s ease'}}/>
        ))}
      </div>

      <div style={{display:'flex',justifyContent:'center',gap:8,flexWrap:'wrap',marginBottom:16}}>
        {featurePills.map((f,i)=>(
          <span key={i} style={{background:'#F9FAFB',border:'1px solid rgba(0,0,0,0.1)',borderRadius:99,padding:'5px 12px',fontSize:11,fontWeight:700,color:'#4B5563'}}>{f}</span>
        ))}
      </div>

      <button
        onClick={onScan}
        style={{width:'100%',padding:'14px',background:'#0F6E56',color:'#fff',border:'none',borderRadius:12,fontSize:14,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontFamily:'inherit',boxShadow:'0 4px 14px rgba(15,110,86,0.3)'}}
        onMouseDown={e=>e.currentTarget.style.transform='scale(0.97)'}
        onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}
        onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}
      >
        📷 {lang==='fr'?'Scanner mon premier article':'Scan my first item'}
      </button>

      <div style={{textAlign:'center',marginTop:8,fontSize:11,color:'#A3A9A6',fontWeight:500}}>
        {lang==='fr'?'3 analyses offertes · Sans engagement':'3 free analyses · No commitment'}
      </div>
    </div>
  );
}

const LensTab = memo(function LensTab({
  lang, currency, userCountry, isPremium, isNative, user,
  iapProduct, iapLoading,
  lensPhotos, setLensPhotos, lensResult, setLensResult,
  lensAdded, setLensAdded, lensDesc, setLensDesc,
  lensBuy, setLensBuy, lensLoading, lensMicActive, lensMicLoading,
  lensPlaceholderFade, lensPlaceholderIdx,
  lensFileRef, toggleLensMic, handleLensPhoto, analyzeLens, addLensItem,
  handleIAPPurchase, handleIAPRestore,
  PremiumBanner, IAPUpgradeBlock,
}) {
  return (
    <div style={{maxWidth:520,margin:"0 auto",display:"flex",flexDirection:"column",gap:16}}>

      {/* ── Header ── */}
      <div style={{paddingTop:4}}>
        <div style={{fontSize:20,fontWeight:900,color:"#0D0D0D",letterSpacing:"-0.02em",marginBottom:4}}>Fill &amp; Sell Lens 📸</div>
        <div style={{fontSize:13,color:"#6B7280",fontWeight:600,lineHeight:1.5}}>
          {lang==="en"
            ?"Take a photo of an item — AI analyzes the price and tells you if it's a good deal"
            :"Prends en photo un article, l'IA analyse le prix et te dit si c'est un bon deal"}
        </div>
        {userCountry&&<div style={{fontSize:11,color:"#A3A9A6",marginTop:4}}>📍 {userCountry.name}</div>}
      </div>

      {/* ── Zone photo ── */}
      <div style={{background:"#fff",borderRadius:16,padding:"20px",border:"1px solid rgba(0,0,0,0.07)",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
        <input
          ref={lensFileRef}
          type="file"
          accept="image/*"
          multiple
          style={{display:"none"}}
          onChange={handleLensPhoto}
        />
        {lensPhotos.length>0?(
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:lensPhotos.length<5?8:0}}>
              {lensPhotos.map((p,i)=>(
                <div key={i} style={{position:"relative",width:"calc(33.33% - 6px)",aspectRatio:"1",flexShrink:0}}>
                  <img src={p.preview} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:10,display:"block"}}/>
                  <button
                    onClick={()=>{setLensPhotos(prev=>prev.filter((_,j)=>j!==i));setLensResult(null);setLensAdded(false);}}
                    style={{position:"absolute",top:4,right:4,width:22,height:22,borderRadius:"50%",border:"none",background:"rgba(0,0,0,0.6)",color:"#fff",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}
                  >×</button>
                </div>
              ))}
              {lensPhotos.length<5&&(
                <button
                  onClick={()=>lensFileRef.current?.click()}
                  style={{width:"calc(33.33% - 6px)",aspectRatio:"1",background:"#F9FAFB",border:"2px dashed rgba(0,0,0,0.15)",borderRadius:10,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,color:"#9CA3AF",fontSize:11,fontWeight:700,flexShrink:0,fontFamily:"inherit"}}
                >
                  <span style={{fontSize:22}}>➕</span>
                  {lang==="en"?"Add":"Ajouter"}
                </button>
              )}
            </div>
            <div style={{fontSize:11,color:"#A3A9A6",textAlign:"right"}}>{lensPhotos.length}/5 {lang==="en"?"photos":"photos"}</div>
          </div>
        ):(
          <button
            onClick={()=>lensFileRef.current?.click()}
            style={{width:"100%",padding:"32px 20px",background:"#F9FAFB",border:"2px dashed rgba(0,0,0,0.12)",borderRadius:14,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:10,transition:"all 0.15s",marginBottom:12}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#1D9E75";e.currentTarget.style.background="#F0FDF4";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,0,0,0.12)";e.currentTarget.style.background="#F9FAFB";}}
          >
            <span style={{fontSize:40}}>📸</span>
            <div style={{fontSize:14,fontWeight:700,color:"#6B7280"}}>
              {lang==="en"?"Add photos (up to 5)":"Ajouter des photos (jusqu'à 5)"}
            </div>
            <div style={{fontSize:12,color:"#A3A9A6"}}>
              {lang==="en"?"Tap to open camera or gallery":"Appuie pour ouvrir l'appareil photo ou la galerie"}
            </div>
          </button>
        )}

        {/* Champ description optionnel + mic */}
        <div style={{position:"relative",marginBottom:10}}>
          {!lensDesc&&(
            <div style={{position:"absolute",top:10,left:14,right:44,pointerEvents:"none",zIndex:1,fontSize:13,color:"#9CA3AF",lineHeight:1.5,fontFamily:"inherit",opacity:lensPlaceholderFade?1:0,transition:"opacity 0.3s ease"}}>
              {getRotatingLensPlaceholders(currency,lang)[lensPlaceholderIdx]}
            </div>
          )}
          <textarea
            value={lensDesc}
            onChange={e=>setLensDesc(e.target.value)}
            placeholder=""
            rows={2}
            style={{width:"100%",padding:"10px 44px 10px 14px",borderRadius:12,border:`1.5px solid ${lensMicActive?"#EF4444":"rgba(0,0,0,0.1)"}`,fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",background:"#F9FAFB",boxSizing:"border-box",lineHeight:1.5,color:"#0D0D0D",transition:"border-color 0.15s"}}
          />
          <button
            onClick={toggleLensMic}
            disabled={lensMicLoading}
            style={{position:"absolute",right:8,bottom:8,width:30,height:30,borderRadius:"50%",border:"none",background:lensMicActive?"#EF4444":lensMicLoading?"#E5E7EB":"rgba(0,0,0,0.07)",color:lensMicActive?"#fff":lensMicLoading?"#9CA3AF":"#6B7280",fontSize:15,cursor:lensMicLoading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",boxShadow:lensMicActive?"0 0 0 3px rgba(239,68,68,0.2)":"none"}}
          >
            {lensMicLoading?"⏳":lensMicActive?"⏹":"🎙️"}
          </button>
        </div>

        {/* Bouton Analyser */}
        <button
          onClick={analyzeLens}
          disabled={!lensPhotos.length||lensLoading}
          style={{width:"100%",padding:"13px",background:!lensPhotos.length||lensLoading?"#E5E7EB":"linear-gradient(135deg,#4ECDC4,#1D9E75)",color:!lensPhotos.length||lensLoading?"#9CA3AF":"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:800,cursor:!lensPhotos.length||lensLoading?"not-allowed":"pointer",fontFamily:"inherit",transition:"all 0.2s",boxShadow:!lensPhotos.length||lensLoading?"none":"0 4px 14px rgba(29,158,117,0.3)"}}
        >
          {lensLoading
            ?(lang==="en"?"🧠 Analyzing...":"🧠 Analyse en cours...")
            :(lang==="en"?"✨ Analyze with AI":"✨ Analyser avec l'IA")}
        </button>

        {/* Résultat */}
        {lensResult&&(
          <div style={{marginTop:14,animation:"vrFadeSlide 0.35s cubic-bezier(0.22,1,0.36,1) both"}}>
            {lensResult.error?(
              <div style={{background:"#FFF5F5",borderRadius:14,padding:"16px",border:"1px solid #FED7D7",marginBottom:10}}>
                <div style={{fontSize:14,color:"#C53030",fontWeight:600}}>{lensResult.error}</div>
              </div>
            ):(
              <div style={{background:"#fff",borderRadius:14,padding:"16px",border:"1px solid rgba(0,0,0,0.08)",marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
                {/* Titre + verdict badge */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:8}}>
                  <div style={{fontWeight:800,fontSize:16,color:"#0D0D0D",flex:1,lineHeight:1.3}}>{lensResult.titre||"Article"}</div>
                  {lensResult.verdict&&(
                    <div style={{flexShrink:0,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                      background:lensResult.verdict==="excellent"?"#F0FDF4":lensResult.verdict==="bon"?"#EFF6FF":lensResult.verdict==="moyen"?"#FFFBEB":"#FFF5F5",
                      color:lensResult.verdict==="excellent"?"#1D9E75":lensResult.verdict==="bon"?"#2563EB":lensResult.verdict==="moyen"?"#D97706":"#DC2626",
                    }}>
                      {lensResult.verdict==="excellent"?"🔥 Excellent":lensResult.verdict==="bon"?"✅ Bon deal":lensResult.verdict==="moyen"?"⚠️ Moyen":"❌ Éviter"}
                    </div>
                  )}
                </div>

                {/* Pills: marque, catégorie, confiance */}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  {lensResult.marque&&(
                    <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:"#F0FDF4",color:"#1D9E75",border:"1px solid #9FE1CB"}}>{lensResult.marque}</span>
                  )}
                  {lensResult.categorie&&(()=>{const s=getTypeStyle(lensResult.categorie);return(
                    <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:s.bg,color:s.color,border:`1px solid ${s.border}`}}>{s.emoji} {typeLabel(lensResult.categorie,lang)}</span>
                  );})()}
                  {lensResult.confiance&&(
                    <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                      background:lensResult.confiance==="haute"?"#F0FDF4":lensResult.confiance==="moyenne"?"#FFFBEB":"#FFF5F5",
                      color:lensResult.confiance==="haute"?"#1D9E75":lensResult.confiance==="moyenne"?"#D97706":"#DC2626",
                    }}>
                      {lensResult.confiance==="haute"?(lang==="en"?"High confidence":"Confiance haute"):lensResult.confiance==="moyenne"?(lang==="en"?"Medium confidence":"Confiance moyenne"):(lang==="en"?"Low confidence":"Confiance basse")}
                    </span>
                  )}
                </div>

                {/* Prix suggéré + fourchette */}
                <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:8}}>
                  <div style={{fontSize:30,fontWeight:900,color:"#1D9E75",letterSpacing:"-0.02em"}}>{formatCurrency(lensResult.prix_vente_suggere??0,currency)}</div>
                  {(lensResult.fourchette_min!=null||lensResult.fourchette_max!=null)&&(
                    <div style={{fontSize:12,color:"#9CA3AF",fontWeight:600}}>
                      ({formatCurrency(lensResult.fourchette_min??0,currency)} – {formatCurrency(lensResult.fourchette_max??0,currency)})
                    </div>
                  )}
                </div>

                {/* Prix d'achat conseillé */}
                {lensResult.prix_achat_suggere!=null&&(
                  <div style={{fontSize:12,color:"#6B7280",marginBottom:8}}>
                    {lang==="en"?"Suggested buy price:":"Prix d'achat conseillé :"}{" "}
                    <strong style={{color:"#F59E0B"}}>{formatCurrency(lensResult.prix_achat_suggere,currency)}</strong>
                  </div>
                )}

                {/* Description */}
                {lensResult.description&&(
                  <div style={{fontSize:13,color:"#374151",lineHeight:1.6,marginBottom:8}}>{lensResult.description}</div>
                )}

                {/* Plateformes */}
                {lensResult.plateformes?.length>0&&(
                  <div style={{fontSize:12,color:"#6B7280",marginBottom:8}}>📦 {lensResult.plateformes.join(" · ")}</div>
                )}

                {/* Notes */}
                {lensResult.notes&&(
                  <div style={{background:"#F9FAFB",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#4B5563",borderLeft:"3px solid #1D9E75",marginTop:4}}>
                    💡 {lensResult.notes}
                  </div>
                )}
              </div>
            )}

            {/* Utiliser cette analyse */}
            {lensResult.titre&&(
              <button
                onClick={addLensItem}
                disabled={lensAdded}
                style={{width:"100%",padding:"12px",background:lensAdded?"#E8F5F0":"linear-gradient(135deg,#1D9E75,#0F6E56)",color:lensAdded?"#1D9E75":"#fff",border:lensAdded?"1px solid #9FE1CB":"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:lensAdded?"default":"pointer",fontFamily:"inherit",transition:"all 0.2s",marginBottom:6}}
              >
                {lensAdded?(lang==="en"?"✅ Added to stock!":"✅ Ajouté au stock !"):(lang==="en"?"➕ Use this analysis":"➕ Utiliser cette analyse")}
              </button>
            )}

            <button
              onClick={()=>{setLensPhotos([]);setLensResult(null);setLensAdded(false);setLensDesc("");setLensBuy("");}}
              style={{width:"100%",padding:"9px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,fontSize:13,fontWeight:600,color:"#6B7280",cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",marginTop:4}}
            >
              🔄 {lang==="en"?"New analysis":"Nouvelle analyse"}
            </button>
          </div>
        )}
      </div>

      {!lensPhotos.length&&!lensResult&&(
        <LensTicker lang={lang} onScan={()=>lensFileRef.current?.click()}/>
      )}
      {!isPremium&&!isNative&&(<PremiumBanner userEmail={user?.email}/>)}
      {isNative&&!isPremium&&(<IAPUpgradeBlock lang={lang} iapProduct={iapProduct} iapLoading={iapLoading} onPurchase={handleIAPPurchase} onRestore={handleIAPRestore}/>)}
    </div>
  );
});

export default LensTab;
