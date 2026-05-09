import { memo } from 'react';
import { getRotatingLensPlaceholders } from '../utils/shared';

const LensTab = memo(function LensTab({
  lang, currency, userCountry, isPremium, isNative, user,
  iapProduct, iapLoading,
  lensPhotos, setLensPhotos, lensResult, setLensResult,
  lensAdded, setLensAdded, lensDesc, setLensDesc,
  lensBuy, setLensBuy, lensLoading, lensMicActive,
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
            style={{position:"absolute",right:8,bottom:8,width:30,height:30,borderRadius:"50%",border:"none",background:lensMicActive?"#EF4444":"rgba(0,0,0,0.07)",color:lensMicActive?"#fff":"#6B7280",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",boxShadow:lensMicActive?"0 0 0 3px rgba(239,68,68,0.2)":"none"}}
          >
            {lensMicActive?"⏹":"🎙️"}
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
          <div style={{marginTop:14}}>
            <div style={{background:"linear-gradient(135deg,#F0FDF4,#E8F5F0)",borderRadius:14,padding:"16px",border:"1px solid #9FE1CB",marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:800,color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>
                🤖 {lang==="en"?"AI Analysis":"Analyse IA"}
              </div>
              <div style={{fontSize:14,fontWeight:600,color:"#0D0D0D",lineHeight:1.8,whiteSpace:"pre-wrap"}}>
                {lensResult.analysis}
              </div>
            </div>
            {lensResult.itemData&&(
              <button
                onClick={addLensItem}
                disabled={lensAdded}
                style={{width:"100%",padding:"12px",background:lensAdded?"#E8F5F0":"linear-gradient(135deg,#1D9E75,#0F6E56)",color:lensAdded?"#1D9E75":"#fff",border:lensAdded?"1px solid #9FE1CB":"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:lensAdded?"default":"pointer",fontFamily:"inherit",transition:"all 0.2s"}}
              >
                {lensAdded
                  ?(lang==="en"?"✅ Added to stock!":"✅ Ajouté au stock !")
                  :(lang==="en"?"➕ Add to my stock":"➕ Ajouter à mon stock")}
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
