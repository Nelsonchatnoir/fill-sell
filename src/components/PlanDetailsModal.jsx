// ── Modale « mon plan » — clic sur le badge Premium/Pro du header ────────────
// Explique à l'utilisateur ce que SON plan souscrit inclut réellement. Ce n'est
// PAS une modale de conversion (ça, c'est ConversionModal) : pas de CTA d'achat,
// et pas de prix affiché — les ~100 comptes Founder paient un tarif legacy
// (9,99 €), afficher le prix courant serait faux pour eux.
//
// Chiffres : mêmes sources que les cartes de ConversionModal — grants et coûts
// lus dans coin_config à l'ouverture (repli COIN_CONFIG_FALLBACK), sauf le
// grant Pro affiché : DISPLAY_GRANT_PRO (600) tant que la migration 800→600
// n'est pas appliquée (exception documentée dans ConversionModal).
import { useEffect, useState } from 'react';
import { PremiumBadge, ProBadge } from './PlanBadge';
import PepiteIcon from './PepiteIcon';
import { COIN_CONFIG_FALLBACK, DISPLAY_GRANT_PRO } from './ConversionModal';

const C = {
  canvas: '#EDEAE0',
  paper:  '#F6F5F1',
  ink:    '#10201B',
  teal:   '#2F9E90',
  tealDeep: '#1B6E62',
  mute:   '#8A8578',
  mute2:  '#5C6560',
  border: '#E7E3D8',
};

const ANIM = `
@keyframes fsSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes fsFadeIn  { from { opacity: 0; } to { opacity: 1; } }
`;

function Features({ items, dark }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {items.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <span style={{
            flexShrink: 0, width: 17, height: 17, borderRadius: '50%', marginTop: 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: dark ? 'rgba(232,149,109,0.22)' : 'rgba(47,158,144,0.15)',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={dark ? '#F2C98A' : C.tealDeep} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, color: dark ? C.paper : C.ink }}>{f}</span>
        </div>
      ))}
    </div>
  );
}

export default function PlanDetailsModal({ isPro, lang, onClose, supabase }) {
  const fr = lang !== 'en';
  const [cfg, setCfg] = useState(null);

  useEffect(() => {
    let annule = false;
    supabase.from('coin_config').select('key, value').then(({ data, error }) => {
      if (annule) return;
      if (error || !data?.length) { setCfg(COIN_CONFIG_FALLBACK); return; }
      const map = {};
      for (const row of data) map[row.key] = row.value;
      setCfg({ ...COIN_CONFIG_FALLBACK, ...map });
    });
    return () => { annule = true; };
  }, [supabase]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const K = cfg || COIN_CONFIG_FALLBACK;
  const lensCost = K.price_lens_overflow;
  const grant = isPro ? DISPLAY_GRANT_PRO : K.monthly_grant_premium;
  const lensScans = lensCost > 0 ? Math.floor(grant / lensCost) : 0;
  const pubMin = K.price_original;
  const pubMax = K.price_ia_advanced;

  // Avantages RÉELS — mêmes libellés que les cartes de vente de ConversionModal
  // (source unique de ce qui est promis) ; le Pro cumule tout le Premium.
  const features = [
    fr ? 'Stock illimité' : 'Unlimited stock',
    fr ? 'Publie sur Vinted, Leboncoin, eBay & Beebs' : 'Publish on Vinted, Leboncoin, eBay & Beebs',
    fr ? `Environ ${lensScans} analyses Lens par mois (${lensCost} Pépites l'analyse)`
       : `About ${lensScans} Lens scans a month (${lensCost} Nuggets each)`,
    ...(isPro ? [
      fr ? `De quoi publier bien plus d'annonces (${pubMin} à ${pubMax} Pépites l'annonce)`
         : `Room for many more listings (${pubMin} to ${pubMax} Nuggets each)`,
    ] : []),
    fr ? 'Commandes vocales illimitées' : 'Unlimited voice commands',
    fr ? 'Import & export Excel de ton stock' : 'Excel import & export of your stock',
    ...(isPro ? [fr ? 'Support prioritaire' : 'Priority support'] : []),
  ];

  return (
    <>
      <style>{ANIM}</style>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9990,
          background: 'rgba(16,32,27,0.55)',
          backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          animation: 'fsFadeIn 0.2s ease',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 480,
            background: C.canvas, borderRadius: '26px 26px 0 0',
            maxHeight: '92vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
            padding: '14px 18px calc(env(safe-area-inset-bottom, 0px) + 26px)',
            animation: 'fsSheetUp 0.3s cubic-bezier(0.22,1,0.36,1)',
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 99, background: C.border, margin: '0 auto 16px' }} />

          <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.mute, marginBottom: 12 }}>
            {fr ? 'Ton plan actuel' : 'Your current plan'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            {isPro ? <ProBadge size="md" /> : <PremiumBadge size="md" />}
          </div>

          {/* Carte des avantages — Premium = paper/teal, Pro = dark/gold (même
              rendu que la carte Pro de ConversionModal). */}
          <div style={isPro ? {
            background: `radial-gradient(130% 120% at 100% 0%, rgba(232,149,109,0.28), transparent 58%), ${C.ink}`,
            border: '1.5px solid rgba(214,178,96,0.55)', borderRadius: 22,
            padding: '18px 18px 20px', boxShadow: '0 14px 34px -14px rgba(16,32,27,0.5)',
          } : {
            background: C.paper, border: `1.5px solid ${C.teal}`, borderRadius: 22,
            padding: '18px 18px 20px', boxShadow: '0 12px 30px -16px rgba(27,110,98,0.4)',
          }}>
            <div style={isPro ? {
              display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(232,149,109,0.14)',
              border: '1px solid rgba(214,178,96,0.3)', borderRadius: 12, padding: '9px 12px', marginBottom: 14,
            } : {
              display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(47,158,144,0.10)',
              border: '1px solid rgba(47,158,144,0.22)', borderRadius: 12, padding: '9px 12px', marginBottom: 14,
            }}>
              <PepiteIcon size={18} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: isPro ? '#F2C98A' : C.tealDeep }}>
                {fr ? `${grant} Pépites offertes chaque mois` : `${grant} Nuggets included every month`}
              </span>
            </div>
            <Features dark={isPro} items={features} />
          </div>

          <button
            onClick={onClose}
            style={{
              width: '100%', marginTop: 16, padding: '13px 0', borderRadius: 999,
              background: 'none', border: `1px solid ${C.border}`, cursor: 'pointer',
              fontSize: 13.5, fontWeight: 700, color: C.mute2, fontFamily: 'inherit',
            }}
          >
            {fr ? 'Fermer' : 'Close'}
          </button>
        </div>
      </div>
    </>
  );
}
