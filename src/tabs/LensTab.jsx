import { memo, useState } from 'react';
import { Camera, Mic, Sparkles, Plus } from 'lucide-react';
import ListingPreviewScreen, { PLATFORM_LABELS } from '../components/ListingPreviewScreen';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { getRotatingLensPlaceholders, formatCurrency, getTypeStyle, typeLabel } from '../utils/shared';
import { useTranslation } from '../i18n/useTranslation';
import { UI, Loader, PrimaryButton, PremiumButton } from '../components/ui';

const CANVAS    = '#F6F5F1';
const INK       = '#10201B';
const TEAL      = '#2F9E90';
const TEAL_DEEP = '#1B6E62';
const MUTE      = '#6B7A75';

const LENS_PLATFORMS = Object.keys(PLATFORM_LABELS);

function PlatformMarquee() {
  const list = [...LENS_PLATFORMS, ...LENS_PLATFORMS];
  return (
    <div style={{ position:'relative', width:'100%', overflow:'hidden', padding:'4px 0', WebkitMaskImage:'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)', maskImage:'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)' }}>
      <div className="lens-marquee-track" style={{ display:'flex', gap:12, width:'max-content' }}>
        {list.map((p, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:999, flexShrink:0, background:'#FFFFFF', border:'1px solid #E7E3D8', boxShadow:'0 1px 2px rgba(16,32,27,0.04)' }}>
            <PlatformLogo platform={p} size={24} />
            <span style={{ fontSize:13, fontWeight:500, color:'#3A443F' }}>{PLATFORM_LABELS[p]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LensScanHome({
  lang, currency, isPremium, isNative, isPro,
  lensPhotos, setLensPhotos, setLensResult, setLensAdded,
  lensDesc, setLensDesc, lensMicActive, lensMicLoading, toggleLensMic,
  lensPlaceholderFade, lensPlaceholderIdx,
  lensFileRef, handleLensPhoto, handleLensPhotoNative,
  analyzeLens, lensLoading, lensPremiumLimitReached,
  lensUsedToday, LENS_FREE_LIMIT,
}) {
  const { t, tpl } = useTranslation(lang);
  const maxPhotos = isPro ? 8 : 5;
  const photoCount = lensPhotos.length;

  const triggerPhotoPicker = () => (isNative && handleLensPhotoNative ? handleLensPhotoNative() : lensFileRef.current?.click());
  const removePhoto = (i) => { setLensPhotos(prev => prev.filter((_, j) => j !== i)); setLensResult(null); setLensAdded(false); };

  const analyzeDisabled = !lensPhotos.length || lensLoading || lensPremiumLimitReached;

  return (
    <div style={{ width:'100%', maxWidth:520, margin:'0 auto' }}>
      <style>{`
        @keyframes lensMarqueeScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .lens-marquee-track { animation: lensMarqueeScroll 24s linear infinite; }
        @keyframes lensRingPulse {
          0% { transform: scale(0.9); opacity: 0.5; }
          70% { transform: scale(1.35); opacity: 0; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        .lens-ring-pulse { animation: lensRingPulse 2.8s cubic-bezier(0.2,0.6,0.4,1) infinite; }
        .lens-ring-pulse-delay { animation-delay: 0.9s; }
      `}</style>

      <input ref={lensFileRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={handleLensPhoto} />

      <div style={{ position:'relative', overflow:'hidden', borderRadius:28, background:CANVAS, border:'1px solid #E7E3D8', boxShadow:'0 1px 4px rgba(16,32,27,0.05)' }}>
        {/* ambient teal glow */}
        <div style={{ position:'absolute', pointerEvents:'none', top:'-8%', left:'50%', transform:'translateX(-50%)', width:460, height:320, background:'radial-gradient(ellipse, rgba(47,158,144,0.14) 0%, rgba(47,158,144,0) 70%)' }} />

        {/* Hero copy */}
        <div style={{ position:'relative', padding:'24px 24px 4px', textAlign:'center', zIndex:10 }}>
          <h1 style={{ margin:0, fontSize:31, fontWeight:600, lineHeight:1.1, letterSpacing:'-0.02em', color:INK }}>
            {t('lensHeroTitleLine1')}<br />{t('lensHeroTitleLine2')}
          </h1>
          <p style={{ fontSize:14, marginTop:12, marginBottom:0, lineHeight:1.375, padding:'0 16px', color:MUTE }}>
            {t('lensHeroSubtitle')}
          </p>
        </div>

        {/* Viewfinder hero CTA */}
        <div style={{ position:'relative', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px 0', zIndex:10 }}>
          <button onClick={triggerPhotoPicker} style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center', width:210, height:210, background:'none', border:'none', cursor:'pointer', padding:0 }}>
            <span className="lens-ring-pulse" style={{ position:'absolute', inset:0, borderRadius:'50%', border:`1.5px solid ${TEAL}` }} />
            <span className="lens-ring-pulse lens-ring-pulse-delay" style={{ position:'absolute', inset:0, borderRadius:'50%', border:`1.5px solid ${TEAL}` }} />
            <span style={{ position:'absolute', inset:26, borderRadius:'50%', border:'1px solid rgba(47,158,144,0.25)' }} />
            <span style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center', width:124, height:124, borderRadius:'50%', background:`linear-gradient(155deg,${TEAL},${TEAL_DEEP})`, boxShadow:'0 14px 34px rgba(47,158,144,0.32)' }}>
              <Camera size={38} color="#FFFFFF" strokeWidth={1.6} />
            </span>
          </button>

          <span style={{ fontSize:13, fontWeight:500, marginTop:20, letterSpacing:'0.02em', color:'#8A8578' }}>
            {photoCount === 0 ? t('lensViewfinderEmpty') : tpl('lensViewfinderPhotos', { n:photoCount })}
          </span>

          {photoCount > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:16, flexWrap:'wrap', justifyContent:'center', padding:'0 24px' }}>
              {lensPhotos.map((p, i) => (
                <div key={i} style={{ position:'relative', width:44, height:44, borderRadius:12, overflow:'hidden', flexShrink:0, background:'#E7F3F0', border:'1px solid #BFE0D9' }}>
                  <img src={p.preview} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                  <button onClick={() => removePhoto(i)} style={{ position:'absolute', top:2, right:2, width:16, height:16, borderRadius:'50%', border:'none', background:'rgba(16,32,27,0.65)', color:'#FFFFFF', fontSize:10, lineHeight:1, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>×</button>
                </div>
              ))}
              {photoCount < maxPhotos && (
                <button onClick={triggerPhotoPicker} style={{ width:44, height:44, borderRadius:12, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'none', border:'1px dashed #D8D2C4', cursor:'pointer' }}>
                  <Plus size={15} color="#8A8578" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Note input + CTA */}
        <div style={{ position:'relative', padding:'0 24px', zIndex:10 }}>
          <div style={{ position:'relative' }}>
            {!lensDesc && (
              <div style={{ position:'absolute', top:'50%', left:20, right:48, transform:'translateY(-50%)', pointerEvents:'none', zIndex:1, fontSize:14, color:MUTE, fontFamily:'inherit', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', opacity:lensPlaceholderFade?1:0, transition:'opacity 0.3s ease' }}>
                {getRotatingLensPlaceholders(currency,lang)[lensPlaceholderIdx]}
              </div>
            )}
            <input
              value={lensDesc}
              onChange={e => setLensDesc(e.target.value)}
              placeholder=""
              style={{ width:'100%', boxSizing:'border-box', borderRadius:999, padding:'14px 48px 14px 20px', fontSize:14, outline:'none', background:'#FFFFFF', border:`1px solid ${lensMicActive ? '#EF4444' : '#E7E3D8'}`, color:INK, fontFamily:'inherit' }}
            />
            <button
              onClick={toggleLensMic}
              disabled={lensMicLoading}
              style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', width:36, height:36, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background: lensMicActive ? 'rgba(239,68,68,0.12)' : '#F2F0E9', border:'none', cursor: lensMicLoading ? 'not-allowed' : 'pointer', opacity: lensMicLoading ? 0.6 : 1 }}
            >
              <Mic size={14} color={lensMicActive ? '#EF4444' : MUTE} />
            </button>
          </div>

          <button
            onClick={analyzeLens}
            disabled={analyzeDisabled}
            style={{ width:'100%', boxSizing:'border-box', marginTop:12, borderRadius:999, padding:'16px 0', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontSize:15, fontWeight:600, border:'none', cursor: analyzeDisabled ? 'not-allowed' : 'pointer', fontFamily:'inherit', background: photoCount === 0 ? '#DCEEEA' : `linear-gradient(120deg,${TEAL},${TEAL_DEEP})`, color: photoCount === 0 ? '#8FB5AE' : '#FFFFFF', boxShadow: photoCount === 0 ? 'none' : '0 10px 24px rgba(47,158,144,0.28)' }}
          >
            <Sparkles size={16} strokeWidth={2.2} />
            {lensLoading ? t('lensAnalyzing') : t('lensAnalyzeCta')}
          </button>

          {isPremium && lensPremiumLimitReached && (
            <div style={{ textAlign:'center', fontSize:11.5, marginTop:10, color:'#A6A192' }}>
              {t('lensQuotaPremiumLimitReached')}
            </div>
          )}
          {!isPremium && (
            <div style={{ textAlign:'center', fontSize:11.5, marginTop:10, color:'#A6A192' }}>
              {lensUsedToday >= LENS_FREE_LIMIT ? t('lensQuotaFreeLimitReached') : tpl('lensQuotaFree', { used:lensUsedToday, limit:LENS_FREE_LIMIT })}
            </div>
          )}
        </div>

        {/* Platform marquee */}
        <div style={{ position:'relative', marginTop:28, paddingBottom:36, zIndex:10 }}>
          <p style={{ textAlign:'center', fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:12, color:'#A6A192' }}>
            {t('lensMarqueeCaption')}
          </p>
          <PlatformMarquee />
        </div>
      </div>
    </div>
  );
}

const scoreColor = s => s>=6.5?'#16A34A':s>=4?'#D97706':'#DC2626';
const scoreBg    = s => s>=6.5?'#F0FDF4':s>=4?'#FFFBEB':'#FFF5F5';
const scoreBd    = s => s>=6.5?'rgba(22,163,74,0.2)':s>=4?'rgba(217,119,6,0.2)':'rgba(220,38,38,0.2)';
const scoreLabel = (s,lang) => s>=6.5?(lang==='en'?'Good deal':'Bon deal'):s>=4?(lang==='en'?'Average':'Mitigé'):(lang==='en'?'Avoid':'Éviter');

const VERDICT_INFO = {
  excellent:{ icon:'🔥', fr:'Excellent', en:'Excellent', bg:'#F0FDF4', color:'#1B6E62', border:'#BFE0D9' },
  bon:      { icon:'✅', fr:'Bon deal',  en:'Good deal', bg:'#EFF6FF', color:'#2563EB', border:'#BFDBFE' },
  moyen:    { icon:'⚠️', fr:'Moyen',    en:'Average',   bg:'#FFFBEB', color:'#D97706', border:'#FCD34D' },
  eviter:   { icon:'❌', fr:'À éviter', en:'Avoid',     bg:'#FFF5F5', color:'#DC2626', border:'#FED7D7' },
};
const VITESSE_INFO = {
  rapide:{ icon:'⚡', fr:'Vente rapide',  en:'Fast sale',    color:'#1B6E62' },
  moyen: { icon:'🕐', fr:'Vente moyenne', en:'Average sale', color:'#D97706' },
  lent:  { icon:'🐢', fr:'Vente lente',   en:'Slow sale',    color:'#DC2626' },
};

// Qualité d'analyse unifiée (2026-07) : plus de gating par tier — chaque bloc
// s'affiche si le champ est présent dans la réponse, identique pour tous.
function LensAnalysisResult({ result, lensBuy, lang, currency, lensAdded, addLensItem, openLensEditModal, onReset }) {
  if (result.error) {
    return (
      <>
        <div style={{background:'#FFF5F5',borderRadius:14,padding:'16px',border:'1px solid #FED7D7',marginBottom:10}}>
          <div style={{fontSize:14,color:'#C53030',fontWeight:600}}>{result.error}</div>
        </div>
        <button onClick={onReset} style={{width:'100%',padding:'9px',background:'transparent',border:'1px solid rgba(0,0,0,0.12)',borderRadius:10,fontSize:13,fontWeight:600,color:'#6B7A75',cursor:'pointer',fontFamily:'inherit'}}>
          🔄 {lang==='en'?'New analysis':'Nouvelle analyse'}
        </button>
      </>
    );
  }

  const hasBuy = parseFloat(lensBuy) > 0;
  const v = VERDICT_INFO[result.verdict] || VERDICT_INFO.moyen;
  const sc = result.score != null ? scoreColor(result.score) : '#6B7A75';
  const vi = result.vitesse_vente ? (VITESSE_INFO[result.vitesse_vente] || VITESSE_INFO.moyen) : null;

  return (
    <div style={{animation:'vrFadeSlide 0.35s cubic-bezier(0.22,1,0.36,1) both'}}>
      <div style={{background:'#fff',borderRadius:14,padding:'16px',border:'1px solid rgba(0,0,0,0.08)',marginBottom:10,boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>

        {/* Titre + verdict badge */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12,gap:8}}>
          <div style={{fontWeight:700,fontSize:16,color:'#10201B',flex:1,lineHeight:1.3}}>{result.titre||'Article'}</div>
          {result.verdict&&(
            <div style={{flexShrink:0,padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:700,background:v.bg,color:v.color,border:`1px solid ${v.border}`}}>
              {v.icon} {lang==='en'?v.en:v.fr}
            </div>
          )}
        </div>

        {/* 🏷️ Identification pills */}
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
          {result.marque&&<span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:'#F0FDF4',color:'#1B6E62',border:'1px solid #BFE0D9'}}>{result.marque}</span>}
          {result.modele&&<span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:'#F8FAFC',color:'#475569',border:'1px solid #E2E8F0'}}>{result.modele}</span>}
          {result.etat_estime&&<span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:'#F5F3FF',color:'#7C3AED',border:'1px solid #DDD6FE'}}>{result.etat_estime}</span>}
          {result.matiere&&<span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:'#FFF7ED',color:'#C2410C',border:'1px solid #FED7AA'}}>{result.matiere}</span>}
          {result.categorie&&(()=>{const s=getTypeStyle(result.categorie);return(
            <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:s.bg,color:s.color,border:`1px solid ${s.border}`}}>{s.emoji} {typeLabel(result.categorie,lang)}</span>
          );})()}
          {result.confiance&&(
            <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,
              background:result.confiance==='haute'?'#F0FDF4':result.confiance==='moyenne'?'#FFFBEB':'#FFF5F5',
              color:result.confiance==='haute'?'#1B6E62':result.confiance==='moyenne'?'#D97706':'#DC2626'}}>
              {result.confiance==='haute'?(lang==='en'?'High confidence':'Confiance haute'):result.confiance==='moyenne'?(lang==='en'?'Medium confidence':'Confiance moyenne'):(lang==='en'?'Low confidence':'Confiance basse')}
            </span>
          )}
        </div>

        {/* 💰 Prix de vente conseillé */}
        <div style={{background:'#F8FFFE',borderRadius:12,padding:'12px 14px',marginBottom:12,border:'1px solid rgba(29,158,117,0.15)'}}>
          <div style={{fontSize:11,fontWeight:700,color:'#6B7A75',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>
            💰 {lang==='en'?'Suggested sell price':'Prix de vente conseillé'}
          </div>
          <div style={{display:'flex',alignItems:'baseline',gap:8}}>
            <div style={{fontSize:32,fontWeight:700,color:'#1B6E62',letterSpacing:'-0.02em'}}>{formatCurrency(result.prix_vente_suggere??0,currency)}</div>
            {(result.fourchette_min!=null||result.fourchette_max!=null)&&(
              <div style={{fontSize:12,color:'#8A8578',fontWeight:600}}>({formatCurrency(result.fourchette_min??0,currency)} – {formatCurrency(result.fourchette_max??0,currency)})</div>
            )}
          </div>
          {hasBuy?(
            <div style={{fontSize:12,color:'#6B7A75',marginTop:6}}>
              {lang==='en'?'Your purchase price:':'Ton prix d\'achat :'}{' '}
              <strong style={{color:'#F59E0B'}}>{formatCurrency(parseFloat(lensBuy),currency)}</strong>
            </div>
          ):result.prix_achat_suggere!=null&&(
            <div style={{fontSize:12,color:'#6B7A75',marginTop:6}}>
              {lang==='en'?'Suggested buy price:':'Prix d\'achat conseillé :'}{' '}
              <strong style={{color:'#F59E0B'}}>{formatCurrency(result.prix_achat_suggere,currency)}</strong>
            </div>
          )}
        </div>

        {/* 📊 Fourchette marché */}
        {result.fourchette_marche&&(
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:'#6B7A75',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>
              📊 {lang==='en'?'Market range':'Fourchette marché'}
            </div>
            <div style={{display:'flex',gap:8}}>
              {[
                {key:'bas',  fr:'Bas',   en:'Low',  bg:'#FFF5F5',color:'#DC2626',border:'#FED7D7'},
                {key:'moyen',fr:'Moyen', en:'Mid',  bg:'#FFFBEB',color:'#D97706',border:'#FCD34D'},
                {key:'haut', fr:'Haut',  en:'High', bg:'#F0FDF4',color:'#1B6E62',border:'#BFE0D9'},
              ].map(({key,fr,en,bg,color,border})=>(
                <div key={key} style={{flex:1,background:bg,border:`1px solid ${border}`,borderRadius:8,padding:'8px',textAlign:'center'}}>
                  <div style={{fontSize:9,fontWeight:700,color,textTransform:'uppercase',marginBottom:2}}>{lang==='en'?en:fr}</div>
                  <div style={{fontSize:15,fontWeight:700,color}}>{formatCurrency(result.fourchette_marche[key],currency)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ⚡ Vitesse de vente */}
        {vi&&(
          <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:12,background:'#F9FAFB',borderRadius:10,padding:'10px 12px'}}>
            <span style={{fontSize:18}}>{vi.icon}</span>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:vi.color}}>{lang==='en'?vi.en:vi.fr}</div>
              {result.vitesse_vente_explication&&<div style={{fontSize:12,color:'#4B5563',marginTop:2,lineHeight:1.4}}>{result.vitesse_vente_explication}</div>}
            </div>
          </div>
        )}

        {/* 🛍️ Plateformes */}
        {result.plateformes?.length>0&&(
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:'#6B7A75',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>
              🛍️ {lang==='en'?'Best platforms':'Meilleures plateformes'}
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {result.plateformes.map((p,i)=>(
                <span key={i} style={{padding:'4px 10px',borderRadius:20,fontSize:11,fontWeight:700,
                  background:i===0?'#E7F3F0':'#F2F0E9',color:i===0?'#1B6E62':'#4B5563',
                  border:`1px solid ${i===0?'#BFE0D9':'rgba(0,0,0,0.08)'}`}}>
                  {i===0?'⭐ ':''}{p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 💡 Conseils */}
        {result.conseils?.length>0&&(
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:'#6B7A75',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>
              💡 {lang==='en'?'Tips to sell faster':'Conseils pour vendre mieux'}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {result.conseils.map((c,i)=>(
                <div key={i} style={{display:'flex',gap:8,background:'#F9FAFB',borderRadius:8,padding:'8px 12px'}}>
                  <span style={{color:'#1B6E62',fontWeight:700,flexShrink:0}}>{i+1}.</span>
                  <span style={{fontSize:12,color:'#374151',lineHeight:1.45}}>{c}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🎯 Score */}
        {result.score!=null&&(
          <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
            <div style={{flexShrink:0}}>
              <div style={{fontSize:9,fontWeight:700,color:'#6B7A75',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>DEAL SCORE</div>
              <div style={{fontSize:24,fontWeight:700,color:sc,letterSpacing:'-0.02em',lineHeight:1}}>
                {Number(result.score).toFixed(1)}<span style={{fontSize:11,fontWeight:600,color:'#A3A9A6'}}>/10</span>
              </div>
            </div>
            <div style={{flex:1}}>
              <div style={{height:8,background:'#F2F0E9',borderRadius:4,overflow:'hidden'}}>
                <div style={{height:'100%',background:sc,width:`${(result.score/10)*100}%`,borderRadius:4}}/>
              </div>
              <div style={{fontSize:10,fontWeight:700,color:sc,marginTop:2}}>{scoreLabel(result.score,lang)}</div>
            </div>
          </div>
        )}

        {/* Notes source */}
        {result.notes&&(
          <div style={{fontSize:11,color:'#8A8578',marginTop:8,fontStyle:'italic'}}>{result.notes}</div>
        )}

        {/* Description */}
        {result.description&&(
          <div style={{fontSize:13,color:'#374151',lineHeight:1.6,marginTop:8}}>{result.description}</div>
        )}
      </div>

      {result.titre&&(
        lensAdded ? (
          <button disabled
            style={{width:'100%',padding:'13px',background:'#E7F3F0',color:'#1B6E62',border:'1px solid #BFE0D9',borderRadius:999,fontSize:14,fontWeight:600,cursor:'default',fontFamily:'inherit',marginBottom:6}}>
            {result.est_vendu?(lang==='en'?'✅ Sale recorded!':'✅ Vente enregistrée !'):(lang==='en'?'✅ Added to stock!':'✅ Ajouté au stock !')}
          </button>
        ) : (
          <PrimaryButton onClick={result.est_vendu?addLensItem:openLensEditModal} style={{marginBottom:6}}>
            {result.est_vendu?(lang==='en'?'💰 Record sale':'💰 Enregistrer la vente'):(lang==='en'?'✏️ Edit & add to stock':'✏️ Modifier & ajouter au stock')}
          </PrimaryButton>
        )
      )}
      <button onClick={onReset}
        style={{width:'100%',padding:'9px',background:'transparent',border:'1px solid rgba(0,0,0,0.12)',borderRadius:10,fontSize:13,fontWeight:600,color:'#6B7A75',cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',marginTop:4}}>
        🔄 {lang==='en'?'New analysis':'Nouvelle analyse'}
      </button>
    </div>
  );
}

const LensTab = memo(function LensTab({
  lang, currency, userCountry, isPremium, isPro, isNative, user,
  lensPhotos, setLensPhotos, lensResult, setLensResult,
  lensAdded, setLensAdded, lensDesc, setLensDesc,
  lensBuy, setLensBuy, lensLoading, lensMicActive, lensMicLoading,
  lensPlaceholderFade, lensPlaceholderIdx,
  lensFileRef, toggleLensMic, handleLensPhoto, handleLensPhotoNative, analyzeLens, addLensItem, openLensEditModal,
  openUpgradeModal, slotsRemaining, lensUsedToday, LENS_FREE_LIMIT, lensPremiumLimitReached,
  supabase, saveLensItemForListing, lensInventaireId, onStepperOpenChange,
}) {
  const [generatingListing,setGeneratingListing]=useState(false);
  const [lensListingPhotos,setLensListingPhotos]=useState([]);
  const [showListingPreview,setShowListingPreview]=useState(false);
  const [listingError,setListingError]=useState('');

  function compressImage(file, maxWidth = 1024, quality = 0.85) {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleCreateListing(){
    setGeneratingListing(true);
    setListingError('');
    try{
      // L'ajout au stock est décidé plus tard (switch "Ajouter au stock" à l'étape
      // Publier) : on ne crée pas la ligne inventaire ici, on upload juste les photos.
      const uploadedUrls=[];
      const ts=Date.now();
      for(let i=0;i<lensPhotos.length;i++){
        const photo=lensPhotos[i];
        const res=await fetch(photo.preview);
        const rawBlob=await res.blob();
        const blob=await compressImage(rawBlob);
        const path=`${user.id}/raw/${ts}_${i}.jpg`;
        const{error:upErr}=await supabase.storage.from('listing-photos').upload(path,blob,{contentType:'image/jpeg',upsert:true});
        if(!upErr)uploadedUrls.push(supabase.storage.from('listing-photos').getPublicUrl(path).data.publicUrl);
      }
      if(!uploadedUrls.length)throw new Error(lang==='en'?'Photo upload failed.':'Échec upload des photos.');

      setLensListingPhotos(uploadedUrls);
      setShowListingPreview(true);
      onStepperOpenChange?.(true);
    }catch(e){
      setListingError(e.message||'Erreur inattendue');
    }finally{
      setGeneratingListing(false);
    }
  }

  if (showListingPreview) {
    return (
      <div style={{ width:"100%" }}>
        <ListingPreviewScreen
          inventaireId={lensInventaireId}
          userId={user.id}
          initialPhotos={lensListingPhotos}
          initialListing={lensResult}
          onClose={()=>{setShowListingPreview(false);setLensListingPhotos([]);onStepperOpenChange?.(false);}}
          supabase={supabase}
          lang={lang}
          isPremium={isPremium}
          isPro={isPro}
          founderSpotsLeft={slotsRemaining}
          onUpgrade={openUpgradeModal}
          createStockItem={saveLensItemForListing}
          alreadyInStock={!!lensInventaireId}
        />
      </div>
    );
  }

  if (!lensResult) {
    return (
      <LensScanHome
        lang={lang} currency={currency} isPremium={isPremium} isNative={isNative} isPro={isPro}
        lensPhotos={lensPhotos} setLensPhotos={setLensPhotos} setLensResult={setLensResult} setLensAdded={setLensAdded}
        lensDesc={lensDesc} setLensDesc={setLensDesc} lensMicActive={lensMicActive} lensMicLoading={lensMicLoading} toggleLensMic={toggleLensMic}
        lensPlaceholderFade={lensPlaceholderFade} lensPlaceholderIdx={lensPlaceholderIdx}
        lensFileRef={lensFileRef} handleLensPhoto={handleLensPhoto} handleLensPhotoNative={handleLensPhotoNative}
        analyzeLens={analyzeLens} lensLoading={lensLoading} lensPremiumLimitReached={lensPremiumLimitReached}
        lensUsedToday={lensUsedToday} LENS_FREE_LIMIT={LENS_FREE_LIMIT}
      />
    );
  }

  return (
    <div style={{maxWidth:520,margin:"0 auto",display:"flex",flexDirection:"column",gap:16}}>

      {/* ── Header ── */}
      <div style={{paddingTop:4}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
          <div style={{fontSize:28,fontWeight:700,color:"#10201B"}}>Lens</div>
          <span style={{background:"#0D9488",color:"#fff",borderRadius:99,padding:"4px 10px",fontSize:11,fontWeight:700,letterSpacing:"0.03em"}}>IA</span>
        </div>
        <div style={{fontSize:14,color:"#6B7A75",fontWeight:500,lineHeight:1.5}}>
          {lang==="en"?"The AI that analyses if it's a good deal":"L'IA qui analyse si c'est un bon deal"}
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
            {isPro?(
              /* ── Carrousel horizontal Pro (max 8) ── */
              <>
                <div style={{display:"flex",overflowX:"auto",gap:10,paddingBottom:8,scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch"}}>
                  {lensPhotos.map((p,i)=>(
                    <div key={i} style={{position:"relative",flexShrink:0,width:140,height:140,scrollSnapAlign:"start"}}>
                      <img src={p.preview} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:10,display:"block"}}/>
                      <button
                        onClick={()=>{setLensPhotos(prev=>prev.filter((_,j)=>j!==i));setLensResult(null);setLensAdded(false);}}
                        style={{position:"absolute",top:4,right:4,width:22,height:22,borderRadius:"50%",border:"none",background:"rgba(0,0,0,0.6)",color:"#fff",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}
                      >×</button>
                    </div>
                  ))}
                  {lensPhotos.length<8&&(
                    <button
                      onClick={()=>isNative&&handleLensPhotoNative?handleLensPhotoNative():lensFileRef.current?.click()}
                      style={{flexShrink:0,width:140,height:140,background:"#F9FAFB",border:"2px dashed rgba(0,0,0,0.15)",borderRadius:10,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,color:"#8A8578",fontSize:11,fontWeight:700,fontFamily:"inherit",scrollSnapAlign:"start"}}
                    >
                      <span style={{fontSize:22}}>➕</span>
                      {lang==="en"?"Add":"Ajouter"}
                    </button>
                  )}
                </div>
                <div style={{fontSize:11,color:"#A3A9A6",textAlign:"right"}}>{lensPhotos.length}/8 {lang==="en"?"photos":"photos"}</div>
              </>
            ):(
              /* ── Grille existante non-Pro (max 5, inchangé) ── */
              <>
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
                      onClick={()=>isNative&&handleLensPhotoNative?handleLensPhotoNative():lensFileRef.current?.click()}
                      style={{width:"calc(33.33% - 6px)",aspectRatio:"1",background:"#F9FAFB",border:"2px dashed rgba(0,0,0,0.15)",borderRadius:10,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,color:"#8A8578",fontSize:11,fontWeight:700,flexShrink:0,fontFamily:"inherit"}}
                    >
                      <span style={{fontSize:22}}>➕</span>
                      {lang==="en"?"Add":"Ajouter"}
                    </button>
                  )}
                </div>
                <div style={{fontSize:11,color:"#A3A9A6",textAlign:"right"}}>{lensPhotos.length}/5 {lang==="en"?"photos":"photos"}</div>
              </>
            )}
          </div>
        ):(
          <button
            onClick={()=>isNative&&handleLensPhotoNative?handleLensPhotoNative():lensFileRef.current?.click()}
            style={{width:"100%",padding:"32px 20px",background:"#F9FAFB",border:"2px dashed rgba(0,0,0,0.12)",borderRadius:14,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:10,transition:"all 0.15s",marginBottom:12}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#1B6E62";e.currentTarget.style.background="#F0FDF4";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(0,0,0,0.12)";e.currentTarget.style.background="#F9FAFB";}}
          >
            <span style={{fontSize:40}}>📸</span>
            <div style={{fontSize:14,fontWeight:700,color:"#6B7A75"}}>
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
            <div style={{position:"absolute",top:10,left:14,right:44,pointerEvents:"none",zIndex:1,fontSize:13,color:"#8A8578",lineHeight:1.5,fontFamily:"inherit",opacity:lensPlaceholderFade?1:0,transition:"opacity 0.3s ease"}}>
              {getRotatingLensPlaceholders(currency,lang)[lensPlaceholderIdx]}
            </div>
          )}
          <textarea
            value={lensDesc}
            onChange={e=>setLensDesc(e.target.value)}
            placeholder=""
            rows={2}
            style={{width:"100%",padding:"10px 44px 10px 14px",borderRadius:12,border:`1.5px solid ${lensMicActive?"#EF4444":"rgba(0,0,0,0.1)"}`,fontSize:16,fontFamily:"inherit",resize:"none",outline:"none",background:"#F9FAFB",boxSizing:"border-box",lineHeight:1.5,color:"#10201B",transition:"border-color 0.15s"}}
          />
          <button
            onClick={toggleLensMic}
            disabled={lensMicLoading}
            style={{position:"absolute",right:8,bottom:8,width:30,height:30,borderRadius:"50%",border:"none",background:lensMicActive?"#EF4444":lensMicLoading?"#E5E7EB":"rgba(0,0,0,0.07)",color:lensMicActive?"#fff":lensMicLoading?"#8A8578":"#6B7A75",fontSize:15,cursor:lensMicLoading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",boxShadow:lensMicActive?"0 0 0 3px rgba(239,68,68,0.2)":"none"}}
          >
            {lensMicLoading?"⏳":lensMicActive?"⏹":"🎙️"}
          </button>
        </div>

        {/* Bouton Analyser */}
        <PrimaryButton
          onClick={analyzeLens}
          disabled={!lensPhotos.length||lensLoading||lensPremiumLimitReached}
        >
          {lensLoading
            ?(lang==="en"?"🧠 Analyzing...":"🧠 Analyse en cours...")
            :(lang==="en"?"✨ Analyze with AI":"✨ Analyser avec l'IA")}
        </PrimaryButton>

        {/* Bandeau premium : limite mensuelle atteinte */}
        {isPremium&&lensPremiumLimitReached&&(
          <div style={{textAlign:"center",fontSize:11,marginTop:6,color:"#8A8578"}}>
            📸 {lang==="en"?"Monthly limit reached for this month":"Limite atteinte pour ce mois"}
          </div>
        )}

        {/* Bandeau free : compteur mensuel — même analyse complète que Premium,
            seul le nombre inclus diffère ; au-delà, 6 pièces par analyse */}
        {!isPremium&&(
          <div style={{textAlign:"center",fontSize:11,marginTop:6,lineHeight:1.5,color:lensUsedToday>=LENS_FREE_LIMIT?"#C2410C":"#8A8578"}}>
            {lensUsedToday>=LENS_FREE_LIMIT
              ?(lang==="en"
                ?<>📸 Monthly scans used · 🪙 6 coins per extra scan · <button onClick={openUpgradeModal} style={{background:"none",border:"none",padding:0,color:"#1B6E62",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>Upgrade for 120/mo →</button></>
                :<>📸 Analyses du mois épuisées · 🪙 6 pièces l'analyse · <button onClick={openUpgradeModal} style={{background:"none",border:"none",padding:0,color:"#1B6E62",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>Passer Premium (120/mois) →</button></>
              )
              :(lang==="en"
                ?<>📸 {lensUsedToday}/{LENS_FREE_LIMIT} scans this month · <button onClick={openUpgradeModal} style={{background:"none",border:"none",padding:0,color:"#1B6E62",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>Upgrade for 120/mo →</button></>
                :<>📸 {lensUsedToday}/{LENS_FREE_LIMIT} analyses ce mois-ci · <button onClick={openUpgradeModal} style={{background:"none",border:"none",padding:0,color:"#1B6E62",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>Passer Premium (120/mois) →</button></>
              )
            }
          </div>
        )}

        {/* Résultat */}
        {lensResult&&(
          <div style={{marginTop:14}}>
            <LensAnalysisResult
              result={lensResult}
              lensBuy={lensBuy}
              lang={lang}
              currency={currency}
              isPremium={isPremium}
              lensAdded={lensAdded}
              addLensItem={addLensItem}
              openLensEditModal={openLensEditModal}
              onReset={()=>{setLensPhotos([]);setLensResult(null);setLensAdded(false);setLensDesc("");setLensBuy("");}}
              openUpgradeModal={openUpgradeModal}
            />
            {isPro&&!lensResult.error&&(
              <>
                <PrimaryButton
                  onClick={handleCreateListing}
                  disabled={generatingListing}
                  style={{marginTop:8}}
                >
                  ✨ {lang==="en"?"Create a listing":"Créer une annonce"}
                </PrimaryButton>
                {listingError&&(
                  <div style={{marginTop:8,padding:"8px 12px",background:"#F3E6E3",border:"1px solid #D9A69C",borderRadius:8,fontSize:12,color:"#B0645A",fontWeight:500}}>
                    {listingError}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {generatingListing&&(
        <div style={{position:"fixed",inset:0,background:UI.canvas,zIndex:9998,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:18,padding:"0 40px"}}>
          <Loader size={40} thickness={3} />
          <div style={{color:UI.ink,fontWeight:600,fontSize:17,textAlign:"center"}}>
            {lang==="en"?"Generating your listing...":"Génération de ton annonce..."}
          </div>
          <div style={{color:UI.mute2,fontSize:13,textAlign:"center",lineHeight:1.6}}>
            {lang==="en"?"Uploading photos · generating listing\n~10-20 sec":"Upload photos · génération annonce\n~10-20 sec"}
          </div>
        </div>
      )}

    </div>
  );
});

export default LensTab;
