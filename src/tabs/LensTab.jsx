import { memo } from 'react';
import { getRotatingLensPlaceholders, formatCurrency, getTypeStyle, typeLabel } from '../utils/shared';

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

      {!isPremium&&!isNative&&(<PremiumBanner userEmail={user?.email}/>)}
      {isNative&&!isPremium&&(<IAPUpgradeBlock lang={lang} iapProduct={iapProduct} iapLoading={iapLoading} onPurchase={handleIAPPurchase} onRestore={handleIAPRestore}/>)}
    </div>
  );
});

export default LensTab;
