import { memo } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { track } from '../analytics/analytics';
import Field from '../components/Field';
import SwipeRow from '../components/SwipeRow';
import {
  C, formatCurrency, fmtp, getMargeColor, getCatBorder,
  getTypeStyle, typeLabel, marqueLabel, parseLocDesc, detectType,
  getRotatingExamples, SKELETON_ITEMS, SKELETON_SOLD,
  CURRENCY_SYMBOLS, VOICE_FREE_LIMIT,
} from '../utils/shared';

const StockTab = memo(function StockTab({
  // Config
  lang, currency, isPremium, isNative, items, user, voiceUsedToday,
  iapProduct, iapLoading,
  // Computed lists
  stock, sold, stockFiltre, soldFiltre, stockVisible, soldVisible, stockVal, stockQty, soldQty,
  // Voice/AI state
  voiceStep, setVoiceStep, voiceParsed, setVoiceParsed,
  voiceText, setVoiceText, voiceLoading, voicePlaceholderIdx, voiceError,
  // Manual form state
  showManualForm, setShowManualForm, manualMode, setManualMode,
  iTitle, setITitle, iQuantite, setIQuantite, iMarque, setIMarque,
  iType, setIType, iBuy, setIBuy, iPurchaseCosts, setIPurchaseCosts,
  iAlreadySold, setIAlreadySold, iSell, setISell,
  iSellingFees, setISellingFees, iRememberSellingFees, setIRememberSellingFees,
  iDesc, setIDesc, iEmplacement, setIEmplacement, iSaved, firstItemAdded,
  // Lot state
  lotManualTotal, setLotManualTotal, lotManualItems, setLotManualItems,
  lotDistributed, setLotDistributed, lotDistributing,
  // Filter state
  filterType, setFilterType, filterMarque, setFilterMarque,
  filterMarqueSold, setFilterMarqueSold,
  search, setSearch, soldShowAll, setSoldShowAll,
  showAllStock, setShowAllStock, expandedStockId, setExpandedStockId,
  pillsExpandedSold, setPillsExpandedSold, pillsExpandedStock, setPillsExpandedStock,
  importMsg,
  // Handlers
  addItemsFromVoice, resetVoiceFlow, callVoiceParse, addItem,
  handleLotDistribute, addLotToInventory, delItem, markSold, setEditItem,
  handleImportFile, handleExport, handleIAPPurchase, handleIAPRestore,
  triggerCheckout,
  // Refs
  importRef, listRef, scrollRef,
  // Injected components (defined in App.jsx)
  PremiumBanner, IAPUpgradeBlock, VoiceZone,
  slotsRemaining, openUpgradeModal,
}) {
  const { t, tpl } = useTranslation(lang);
  const fmt = (amount, dec=null) => formatCurrency(amount, currency, dec);

  return (
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
                    🛍️ {lang==='fr'?`Lot — ${fmt(voiceParsed.lotTotal||0)} au total`:`Lot — ${fmt(voiceParsed.lotTotal||0)} total`}
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
                            🛒 <input type="number" value={item.prix_estime_lot??""} onChange={e=>{const v=parseFloat(e.target.value)||0;setVoiceParsed(prev=>({...prev,items:prev.items.map((it,idx)=>idx===i?{...it,prix_estime_lot:v}:it)}));}} style={{width:60,border:"1px solid #CBD5E0",borderRadius:6,padding:"2px 6px",fontSize:16,fontFamily:"inherit",outline:"none"}}/>{CURRENCY_SYMBOLS[currency]||'€'}
                            <span style={{fontSize:10,color:"#9CA3AF",fontStyle:"italic"}}>{lang==='fr'?"Répartition estimée":"Estimated split"}</span>
                          </span>
                        ):(
                          <>
                            {item.prix_achat!==null&&<span>🛒 {fmt(item.prix_achat)}</span>}
                            {item.prix_vente!==null&&<span>💰 {fmt(item.prix_vente)}</span>}
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
                placeholder={getRotatingExamples(currency,lang)[voicePlaceholderIdx]?.text}
                rows={3} style={{width:"100%",padding:"10px 14px",borderRadius:12,border:`1.5px solid ${voiceText?C.teal:"rgba(0,0,0,0.1)"}`,fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",background:"#fff",transition:"border-color 0.15s",boxSizing:"border-box",lineHeight:1.5,color:C.text}}/>
              <div style={{width:"100%",fontSize:11,color:"#9CA3AF",lineHeight:1.5,padding:"0 2px"}}>
                {t('stockIaHint')}
              </div>
              {!isPremium&&(()=>{const r=VOICE_FREE_LIMIT-voiceUsedToday;return r<=2&&r>0?(<div style={{textAlign:'center',padding:'4px 10px',borderRadius:20,fontSize:12,fontWeight:700,background:r===1?'#FEE2E2':'#FEF3C7',color:r===1?'#DC2626':'#D97706',marginBottom:4}}>{r===1?(lang==='fr'?'⚠️ Dernière analyse vocale du jour !':'⚠️ Last voice analysis today!'):(lang==='fr'?`🎙️ Il vous reste ${r} analyses vocales`:`🎙️ ${r} voice analyses left`)}</div>):r===0?(<div style={{textAlign:'center',padding:'4px 10px',borderRadius:20,fontSize:12,fontWeight:700,background:'#FEE2E2',color:'#DC2626',marginBottom:4}}>{lang==='fr'?'🔒 Limite atteinte · Passer Premium':'🔒 Limit reached · Go Premium'}</div>):null;})()}
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
            <div style={{textAlign:"center",padding:"6px 0 10px",animation:"fadeIn 0.4s ease"}}>
              <div style={{width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#0E7C5F,#34D399)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 12px",boxShadow:"0 4px 16px rgba(29,158,117,0.3)"}}>📦</div>
              <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>{lang==='en'?'Add your first item':'Ajoute ton premier article'}</div>
              <div style={{fontSize:12,color:C.sub,lineHeight:1.6,maxWidth:220,margin:"0 auto"}}>{lang==='en'?'Name + buy price is enough to start tracking your profit.':'Nom + prix d\'achat suffit pour commencer à suivre tes marges.'}</div>
            </div>
          ):(
            <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:4}}>{t('ajouterTitre')}</div>
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
                <Field label={lang==='fr'?"Prix de vente":"Sell price"} value={iSell} set={setISell} placeholder="0,00" type="number" icon="💰" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
              </div>
              <div>
                <Field label={lang==='fr'?"Frais de vente (optionnel)":"Selling fees (optional)"} value={iSellingFees} set={setISellingFees} placeholder={lang==='fr'?"Commission Vinted, livraison client...":"Vinted fee, shipping to buyer..."} type="number" icon="📬" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
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
          <div>
            <Field label={lang==='fr'?"Emplacement (optionnel)":"Storage location (optional)"} value={iEmplacement} set={setIEmplacement} placeholder={lang==='fr'?"Ex: Tiroir 45A, Portant 3, Étagère B...":"Ex: Drawer 45A, Rack 3, Shelf B..."} icon="📦"/>
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
            ? <PremiumBanner userEmail={user?.email} slotsRemaining={slotsRemaining} onOpenModal={openUpgradeModal}/>
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
                        <button onClick={()=>{setLotManualItems(prev=>prev.filter((_,idx)=>idx!==i));setLotDistributed(null);}} style={{background:"#FEF2F2",color:"#E53E3E",border:"1px solid #FCA5A5",borderRadius:8,padding:"8px 10px",fontSize:13,cursor:"pointer",fontFamily:"inherit",flexShrink:0,lineHeight:1}}>×</button>
                      )}
                    </div>
                    {lotDistributed?.items?.[i]&&(
                      <div style={{display:"flex",alignItems:"center",gap:8,paddingLeft:4,animation:"fadeIn 0.3s ease"}}>
                        <input type="number" value={lotDistributed.items[i].prix_estime_lot} onChange={e=>{const v=parseFloat(e.target.value)||0;setLotDistributed(prev=>({...prev,items:prev.items.map((it,idx)=>idx===i?{...it,prix_estime_lot:v}:it)}));}} style={{width:64,border:"1px solid #CBD5E0",borderRadius:6,padding:"2px 6px",fontSize:16,fontFamily:"inherit",outline:"none",fontWeight:700,color:C.green}}/>
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

          <VoiceZone lang={lang} currency={currency}/>

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
            const presentTypes=["Tous","Mode","Luxe","High-Tech","Maison","Électroménager","Jouets","Livres","Sport","Auto-Moto","Beauté","Musique","Collection","Multimédia","Jardin","Bricolage","Autre"].filter(tp=>tp==="Tous"||allItems.some(i=>i.type===tp));
            return presentTypes.length>1&&(
              <div className="filter-row">
                {presentTypes.map(tp=>{
                  const ts=tp==="Tous"?{bg:"#F0FDF4",color:"#1D9E75",border:"#6EE7B7",emoji:""}:getTypeStyle(tp);
                  const isActive=filterType===tp;
                  return(
                    <button key={tp} onClick={()=>setFilterType(tp)}
                      style={{padding:"4px 10px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:`1px solid ${isActive?ts.color:ts.border}`,background:isActive?ts.color:ts.bg,color:isActive?"#fff":ts.color,whiteSpace:"nowrap",flexShrink:0,transition:"all 0.15s",fontFamily:"inherit"}}>
                      {tp==="Tous"?(lang==='en'?'All':tp):`${ts.emoji} ${typeLabel(tp,lang)}`}
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
                <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D"}}>{t('vendus')}</div>
                {window.innerWidth<768&&(()=>{const _b=[...new Set(sold.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];return _b.length>0&&(<button onClick={()=>setPillsExpandedSold(v=>!v)} style={{padding:"3px 9px",borderRadius:99,fontSize:10,fontWeight:700,cursor:"pointer",border:"1px solid rgba(0,0,0,0.1)",background:"transparent",color:"#6B7280",lineHeight:1.4,fontFamily:"inherit"}}>{pillsExpandedSold?`‹ ${lang==='en'?'Close':'Fermer'}`:`${lang==='en'?'Brands':'Marques'} (${_b.length}) ›`}</button>);})()}
              </div>
              <div style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{tpl('venteLabel',{n:soldQty??sold.length})}</div>
            </div>
            {(()=>{
              const _slAll=[...new Set(sold.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];
              const marquesFiltreesParType=["Toutes",..._slAll.filter(b=>b.toLowerCase()!=="sans marque"),..._slAll.filter(b=>b.toLowerCase()==="sans marque")];
              if(marquesFiltreesParType.length<=1) return null;
              const _mob=window.innerWidth<768;
              const _open=!_mob||pillsExpandedSold;
              return(
                <div style={{marginBottom:12}}>
                  {!_open&&(
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>setFilterMarqueSold("Toutes")} style={{padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",background:filterMarqueSold==="Toutes"?"#1D9E75":"#F3F4F6",color:filterMarqueSold==="Toutes"?"#fff":"#6B7280"}}>
                        {filterMarqueSold==="Toutes"?(lang==='en'?'All':'Toutes'):marqueLabel(filterMarqueSold,lang)}
                      </button>
                    </div>
                  )}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",maxHeight:_open?"300px":"0",overflow:"hidden",opacity:_open?1:0,transition:"max-height 0.25s ease, opacity 0.2s ease"}}>
                    {marquesFiltreesParType.map(m=>(
                      <button key={m} onClick={()=>setFilterMarqueSold(m)}
                        style={{padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",transition:"all 0.15s",
                          background:filterMarqueSold===m?"#1D9E75":"#F3F4F6",
                          color:filterMarqueSold===m?"#fff":"#6B7280"}}>
                        {m==="Toutes"?(lang==='en'?'All':'Toutes'):marqueLabel(m,lang)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {sold.length===0?(
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",top:-6,right:0,background:"#F3F4F6",color:"#9CA3AF",fontSize:9,fontWeight:800,borderRadius:99,padding:"2px 8px",letterSpacing:"0.06em",textTransform:"uppercase",zIndex:2,border:"1px solid #E5E7EB"}}>
                  {lang==='en'?'Preview':'Exemple'}
                </span>
                <div style={{display:"flex",flexDirection:"column",gap:8,opacity:0.55,pointerEvents:"none",userSelect:"none"}}>
                  {SKELETON_SOLD.map((sk,i)=>{
                    const ts=getTypeStyle(sk.type);
                    return(
                      <div key={i} className="skeleton-item-row" style={{background:"#fff",borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",borderLeft:`3px solid ${getCatBorder(sk.type)}`}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <div style={{fontWeight:700,fontSize:14,color:"#0D0D0D"}}>{sk.title}</div>
                            <span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{sk.marque}</span>
                            <span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(sk.type,lang)}</span>
                          </div>
                          <div style={{fontSize:11,color:"#A3A9A6",marginTop:2}}>{t('skeletonAchat')} {fmt(sk.buy)} → {t('skeletonVente')} {fmt(sk.sell)}</div>
                        </div>
                        <div style={{textAlign:"right",minWidth:90,flexShrink:0}}>
                          <div style={{fontWeight:900,fontSize:18,color:getMargeColor(sk.marginPct)}}>+{fmt(sk.margin)}</div>
                          <div style={{fontSize:11,color:"#6B7280",marginTop:1}}>{Math.round(sk.marginPct)}%</div>
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
                          <div style={{fontWeight:700,fontSize:14,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                          {qty>1&&<span style={{background:"#1D9E75",color:"#fff",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:800,flexShrink:0}}>×{qty}</span>}
                          {item.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #9FE1CB"}}>{marqueLabel(item.marque,lang)}</span>}
                          {item.type&&item.type!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(item.type,lang)}</span>}
                        </div>
                        <div style={{fontSize:11,color:"#A3A9A6",marginTop:4}}>{lang==='fr'?'Achat':'Bought'} {fmt(item.buy+(item.purchaseCosts||0))} → {lang==='fr'?'Vente':'Sold'} {fmt((item.sell||0)*qty)}</div>
                      </div>
                      <div style={{textAlign:"right",minWidth:90,flexShrink:0}}>
                        <div style={{fontWeight:900,fontSize:18,color:mc}}>{fmt((item.margin||0)*qty)}</div>
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
          </div>}

          {/* ── EN STOCK ── */}
          <div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0D0D0D"}}>{t('enStockLabel')}</div>
                {!isPremium&&items.length>=20&&<span style={{fontSize:10,fontWeight:700,background:"#FFF4EE",color:"#F9A26C",borderRadius:99,padding:"2px 8px",border:"1px solid #F9A26C44"}}>{lang==='fr'?'Plan gratuit':'Free plan'}</span>}
                {(()=>{const _b=[...new Set(stock.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];if(!_b.length)return null;return(<>{!pillsExpandedStock&&(<button onClick={()=>setFilterMarque("Toutes")} style={{padding:"4px 10px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",background:filterMarque==="Toutes"?"#1D9E75":"#F3F4F6",color:filterMarque==="Toutes"?"#fff":"#6B7280"}}>{lang==='en'?'All':'Toutes'}</button>)}<button onClick={()=>setPillsExpandedStock(v=>!v)} style={{padding:"3px 9px",borderRadius:99,fontSize:10,fontWeight:700,cursor:"pointer",border:"1px solid rgba(0,0,0,0.1)",background:"transparent",color:"#6B7280",lineHeight:1.4,fontFamily:"inherit"}}>{pillsExpandedStock?`‹ ${lang==='en'?'Close':'Fermer'}`:`${lang==='en'?'Brands':'Marques'} (${_b.length}) ›`}</button></>);})()}
              </div>
              <div style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{stockQty??stock.length} {lang==='fr'?'art.':'items'} · {fmt(stockVal)}</div>
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
                          background:filterMarque===m?"#1D9E75":"#F3F4F6",
                          color:filterMarque===m?"#fff":"#6B7280"}}>
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
                      <div style={{fontSize:10,fontWeight:800,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>
                        {lang==='fr'?'APERÇU DE TON FUTUR STOCK':'PREVIEW OF YOUR FUTURE STOCK'}
                      </div>
                      <div style={{fontSize:13,fontWeight:600,color:"#0D0D0D",lineHeight:1.3,fontFamily:"inherit"}}>
                        {lang==='fr'?"L'IA classe tout automatiquement":"AI classifies everything automatically"}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,flexShrink:0}}>
                      <div style={{background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:10,padding:"8px 12px",textAlign:"center"}}>
                        <div style={{fontSize:17,fontWeight:900,color:"#0D0D0D",lineHeight:1}}>{SKELETON_ITEMS.length}</div>
                        <div style={{fontSize:9,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.05em",marginTop:3}}>{lang==='fr'?'articles':'items'}</div>
                      </div>
                      <div style={{background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:10,padding:"8px 12px",textAlign:"center"}}>
                        <div style={{fontSize:17,fontWeight:900,color:"#F9A26C",lineHeight:1}}>{fmt(SKELETON_ITEMS.reduce((a,s)=>a+s.buy,0))}</div>
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
                  <span style={{position:"absolute",top:-6,right:0,background:"#F3F4F6",color:"#9CA3AF",fontSize:9,fontWeight:800,borderRadius:99,padding:"2px 8px",letterSpacing:"0.06em",textTransform:"uppercase",zIndex:2,border:"1px solid #E5E7EB"}}>
                    {lang==='en'?'Preview':'Exemple'}
                  </span>
                  <div style={{display:"flex",flexDirection:"column",gap:8,opacity:0.72,pointerEvents:"none",userSelect:"none"}}>
                    {[
                      {nom:"Veste Zara oversize",  marque:"Zara",    categorie:"Mode",       buy:12,  quantite:1,  description:"Taille M, noir, très bon état, acheté à Vide-grenier",                       emplacement:"Étagère salon"},
                      {nom:"Lot Pokémon",          marque:"Pokémon", categorie:"Collection", buy:8,   quantite:20, description:"Cartes communes + 2 rares, sous pochette, acheté à Brocante",                emplacement:"Boîte à cartes"},
                      {nom:"iPhone 12 64Go",       marque:"Apple",   categorie:"High-Tech",  buy:180, quantite:1,  description:"Écran fissuré, fonctionne parfaitement, acheté à Leboncoin",                  emplacement:"Portant 1"},
                      {nom:"Sac Kelly Hermès",     marque:"Hermès",  categorie:"Luxe",       buy:125, quantite:1,  description:"Authentique, sangles légèrement usées, acheté à Dépôt-vente",                emplacement:"Vitrine luxe"},
                      {nom:"Jean Levis 501",       marque:"Levis",   categorie:"Mode",       buy:15,  quantite:1,  description:"Taille 32, bleu délavé, vintage 90s, acheté à Facebook Marketplace",          emplacement:"Étagère bureau"},
                    ].map((it,i)=>{
                      const ts=getTypeStyle(it.categorie);
                      const {loc:_loc,rest:_desc}=parseLocDesc(it.description);
                      return(
                        <div key={i} style={{background:"#fff",borderRadius:12,padding:"10px 14px",border:"1px solid rgba(0,0,0,0.06)",borderLeft:`3px solid ${ts.border}`,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <div style={{fontWeight:700,fontSize:14,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.nom}</div>
                            {it.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #9FE1CB"}}>{it.marque}</span>}
                            {it.categorie&&it.categorie!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(it.categorie,lang)}</span>}
                            {it.quantite>1&&<span style={{background:"#FFF4EE",color:"#F9A26C",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid rgba(249,162,108,0.3)"}}>×{it.quantite}</span>}
                          </div>
                          {(_desc||_loc)&&<div style={{fontSize:11,color:"#A3A9A6",marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>{_desc}{_desc&&_loc?" · ":""}{_loc&&`📍 ${_loc}`}</div>}
                          {it.emplacement&&<span style={{display:"inline-block",marginTop:4,background:"#F3F4F6",color:"#6B7280",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,border:"1px solid #E5E7EB"}}>📦 {it.emplacement}</span>}
                          <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",marginTop:4}}>{lang==='fr'?'Investi':'Invested'} <span style={{color:"#F9A26C",fontWeight:700}}>{fmt(it.buy*(it.quantite||1))}</span></div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. CTA */}
                <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:4}}>
                  <button
                    onClick={()=>scrollRef.current?.scrollTo({top:0,behavior:"smooth"})}
                    style={{width:"100%",padding:"13px",background:"#0F6E56",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit",boxShadow:"0 4px 14px rgba(15,110,86,0.3)"}}
                    onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
                    onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
                    onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
                  >
                    🎙️ {lang==='fr'?'Ajouter avec la voix':'Add with voice'}
                  </button>
                  <button
                    onClick={()=>{setShowManualForm(true);scrollRef.current?.scrollTo({top:0,behavior:"smooth"});}}
                    style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#6B7280",padding:"4px",fontFamily:"inherit",textDecoration:"underline",textDecorationColor:"rgba(107,114,128,0.35)"}}
                  >
                    + {lang==='fr'?'Ajouter manuellement':'Add manually'}
                  </button>
                </div>

              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {stockVisible.map(item=>{
                  const ts=getTypeStyle(item.type);
                  const isExpanded=expandedStockId===item.id;
                  const {loc:_itemLoc,rest:_itemDesc}=parseLocDesc(item.description);
                  return(
                  <div key={item.id}>
                    <SwipeRow onDelete={()=>delItem(item.id)} onEdit={()=>setEditItem({...item,frais:0,sell:item.sell??""})} style={{borderLeft:`3px solid ${getCatBorder(item.type)}`,borderBottomLeftRadius:isExpanded?0:12,borderBottomRightRadius:isExpanded?0:12}}>
                      <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setExpandedStockId(isExpanded?null:item.id)}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <div style={{fontWeight:700,fontSize:14,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                          {item.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #9FE1CB"}}>{marqueLabel(item.marque,lang)}</span>}
                          {item.type&&item.type!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(item.type,lang)}</span>}
                          {item.quantite>1&&<span style={{background:"#FFF4EE",color:"#F9A26C",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid rgba(249,162,108,0.3)"}}>×{item.quantite}</span>}
                        </div>
                        {!isExpanded&&(_itemDesc||_itemLoc)&&<div style={{fontSize:11,color:"#A3A9A6",marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>{_itemDesc}{_itemDesc&&_itemLoc?" · ":""}{_itemLoc&&`📍 ${_itemLoc}`}</div>}
                        {item.emplacement&&<span style={{display:"inline-block",marginTop:4,background:"#F3F4F6",color:"#6B7280",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,border:"1px solid #E5E7EB"}}>📦 {item.emplacement}</span>}
                        <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",marginTop:4}}>{lang==='fr'?'Investi':'Invested'} <span style={{color:"#F9A26C",fontWeight:700}}>{fmt(item.buy*(item.quantite||1)+(item.purchaseCosts||0))}</span></div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        <button onClick={(e)=>{e.stopPropagation();markSold(item);}} style={{background:"#E8F5F0",color:"#1D9E75",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{lang==='fr'?'Vendu':'Sold'}</button>
                        <span onClick={e=>{e.stopPropagation();setExpandedStockId(isExpanded?null:item.id);}} style={{color:"#D1D5DB",fontSize:16,cursor:"pointer",userSelect:"none",display:"inline-block",transition:"transform 0.2s ease",transform:isExpanded?"rotate(90deg)":"rotate(0deg)"}}>›</span>
                      </div>
                    </SwipeRow>
                    <div style={{maxHeight:isExpanded?"200px":"0",overflow:"hidden",transition:"max-height 0.25s ease"}}>
                      <div style={{padding:"10px 14px 12px",background:"#F9FAFB",borderLeft:`3px solid ${getCatBorder(item.type)}`,borderRight:"1px solid rgba(0,0,0,0.06)",borderBottom:"1px solid rgba(0,0,0,0.06)",borderRadius:"0 0 12px 12px"}}>
                        {_itemDesc&&<div style={{fontSize:12,color:"#4B5563",lineHeight:1.5,marginBottom:(_itemLoc||item.emplacement||item.date)?4:0}}>{_itemDesc}</div>}
                        {_itemLoc&&<div style={{fontSize:12,color:"#6B7280",lineHeight:1.4,marginBottom:(item.emplacement||item.date)?4:0}}>📍 {_itemLoc}</div>}
                        {item.emplacement&&<div style={{fontSize:12,color:"#6B7280",lineHeight:1.4,marginBottom:item.date?4:0}}>📦 {item.emplacement}</div>}
                        {item.date&&<div style={{fontSize:11,color:"#A3A9A6"}}>{lang==='fr'?'Ajouté le':'Added'} {new Date(item.date).toLocaleDateString(lang==='fr'?'fr-FR':'en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>}
                        {!_itemDesc&&!_itemLoc&&!item.emplacement&&!item.date&&<div style={{fontSize:12,color:"#A3A9A6",fontStyle:"italic"}}>{lang==='fr'?'Aucun détail supplémentaire':'No additional details'}</div>}
                      </div>
                    </div>
                  </div>
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
  );
});

export default StockTab;
