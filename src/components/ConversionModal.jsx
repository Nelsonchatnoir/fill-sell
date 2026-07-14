import { useEffect } from 'react';
import PepiteIcon from './PepiteIcon';
import PlanBadge from './PlanBadge';

// ConversionModal — modale de conversion unique (fusion de l'ex-UpgradeModal).
// Vend Premium et/ou Pro selon le tier courant, avec contexte réel (jauge de
// quota, solde de Pépites) et, quand l'action bloquée se paie en Pépites, un
// chemin secondaire "Utiliser mes Pépites" vers le store de packs — jamais de
// blocage forcé vers l'abonnement. Le tier Founder n'existe plus.

const C = {
  canvas: '#EDEAE0',
  paper:  '#F6F5F1',
  ink:    '#10201B',
  teal:   '#2F9E90',
  tealDeep: '#1B6E62',
  amber:  '#E8956D',
  mute:   '#8A8578',
  border: '#E7E3D8',
};

const ANIM = `
@keyframes fsSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes fsFadeIn  { from { opacity: 0; } to { opacity: 1; } }
`;

// ── Copy ─────────────────────────────────────────────────────────────────────

const FEATURES = {
  premium: {
    fr: ['Stock illimité', '150 Pépites incluses/mois', 'Publie sur Vinted, Leboncoin, eBay…', 'Import & export Excel de ton stock', 'Commandes vocales illimitées'],
    en: ['Unlimited stock', '150 Nuggets included/mo', 'Publish on Vinted, Leboncoin, eBay…', 'Excel import & export of your stock', 'Unlimited voice commands'],
  },
  pro: {
    fr: ['Stock illimité', '600 Pépites incluses/mois', 'Publie sur Vinted, Leboncoin, eBay…', 'Import & export Excel de ton stock', 'Commandes vocales illimitées'],
    en: ['Unlimited stock', '600 Nuggets included/mo', 'Publish on Vinted, Leboncoin, eBay…', 'Excel import & export of your stock', 'Unlimited voice commands'],
  },
};

function triggerCopy(trigger, lang, { itemCount, stockLimit, coinPrice }) {
  const fr = lang !== 'en';
  switch (trigger) {
    case 'voice':
      return {
        eyebrow: fr ? "🎙️ Limite vocale atteinte · 5/5 aujourd'hui" : '🎙️ Voice limit reached · 5/5 today',
        title:   fr ? 'Passe en vocal illimité.' : 'Go unlimited on voice.',
      };
    case 'stock':
      return {
        eyebrow: fr
          ? `📦 Stock plein · ${itemCount ?? stockLimit}/${stockLimit} articles`
          : `📦 Stock full · ${itemCount ?? stockLimit}/${stockLimit} items`,
        title: fr ? 'Ton stock est plein.' : 'Your stock is full.',
      };
    case 'lens':
      return {
        eyebrow: fr
          ? (coinPrice != null ? '📸 Plus assez de Pépites pour cette analyse' : '📸 Limite Lens atteinte')
          : (coinPrice != null ? '📸 Not enough Nuggets for this scan' : '📸 Lens limit reached'),
        title: fr ? 'Recharge ou passe au niveau supérieur.' : 'Top up or level up.',
      };
    case 'publish':
      return {
        eyebrow: fr ? '📤 Plus assez de Pépites pour publier' : '📤 Not enough Nuggets to publish',
        title:   fr ? 'Recharge ou passe au niveau supérieur.' : 'Top up or level up.',
      };
    default: // generic
      return {
        eyebrow: '✨ FillSell',
        title: fr ? 'Passe au niveau supérieur.' : 'Level up.',
      };
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Check({ dark = false }) {
  return (
    <span style={{
      flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 16, height: 16, borderRadius: '50%', marginTop: 1, fontSize: 9, fontWeight: 700,
      background: dark ? 'rgba(232,149,109,0.22)' : 'rgba(47,158,144,0.14)',
      color: dark ? C.amber : C.tealDeep,
    }}>✓</span>
  );
}

// Jauge de quota — reflète la vraie donnée (articles ou Pépites), jamais décorative.
function QuotaGauge({ label, value, max, danger }) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: danger ? '#C2410C' : C.mute }}>
          {value}/{max}
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: C.paper, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div style={{
          width: `${pct * 100}%`, height: '100%', borderRadius: 99,
          background: danger ? C.amber : `linear-gradient(90deg, ${C.teal}, ${C.amber})`,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

function PremiumCard({ lang, onUpgrade, compactGrid }) {
  const fr = lang !== 'en';
  return (
    <div style={{
      position: 'relative', display: 'flex', flexDirection: 'column',
      background: C.paper, border: `1.5px solid ${C.teal}`, borderRadius: 18,
      padding: compactGrid ? '24px 12px 14px' : '24px 16px 16px',
    }}>
      <div style={{
        position: 'absolute', top: -1, left: '50%', transform: 'translate(-50%,-50%)',
        background: C.teal, color: '#fff', borderRadius: 99, padding: '3px 10px',
        fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', whiteSpace: 'nowrap',
      }}>
        {fr ? 'Le plus choisi' : 'Most popular'}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.tealDeep, marginBottom: 4 }}>
        Premium
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 2 }}>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', color: C.ink }}>12,99 €</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.mute }}>{fr ? '/mois' : '/mo'}</span>
      </div>
      <div style={{
        alignSelf: 'flex-start', fontSize: 10, fontWeight: 700, color: C.tealDeep,
        background: 'rgba(47,158,144,0.10)', border: '1px solid rgba(47,158,144,0.25)',
        borderRadius: 99, padding: '2px 8px', marginBottom: 10,
      }}>
        🎁 {fr ? '7 jours gratuits' : '7 days free'}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
        {FEATURES.premium[fr ? 'fr' : 'en'].map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11, fontWeight: 600, lineHeight: 1.35, color: C.ink }}>
            <Check />{f}
          </li>
        ))}
      </ul>
      <button
        onClick={() => onUpgrade('premium')}
        style={{
          width: '100%', padding: '12px 8px', borderRadius: 13, border: 'none',
          background: C.teal, color: '#fff', fontWeight: 700, fontSize: 13.5,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {fr ? 'Passer Premium' : 'Go Premium'}
      </button>
    </div>
  );
}

function ProCard({ lang, onUpgrade, compactGrid }) {
  const fr = lang !== 'en';
  return (
    <div style={{
      position: 'relative', display: 'flex', flexDirection: 'column',
      background: `radial-gradient(130% 120% at 100% 0%, rgba(232,149,109,0.30), transparent 60%), ${C.ink}`,
      border: `1.5px solid ${C.amber}`, borderRadius: 18,
      padding: compactGrid ? '24px 12px 14px' : '24px 16px 16px',
      transform: 'translateY(-4px)',
      boxShadow: '0 10px 30px rgba(16,32,27,0.25)',
    }}>
      <div style={{
        position: 'absolute', top: -1, left: '50%', transform: 'translate(-50%,-50%)',
        background: C.amber, color: C.ink, borderRadius: 99, padding: '3px 10px',
        fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', whiteSpace: 'nowrap',
      }}>
        ★ {fr ? 'Volume max' : 'Max volume'}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.amber, marginBottom: 4 }}>
        Pro
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
        <span style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-0.7px', color: C.paper }}>29,99 €</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(246,245,241,0.65)' }}>{fr ? '/mois' : '/mo'}</span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
        {FEATURES.pro[fr ? 'fr' : 'en'].map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11, fontWeight: 600, lineHeight: 1.35, color: C.paper }}>
            <Check dark />{f}
          </li>
        ))}
      </ul>
      <button
        onClick={() => onUpgrade('pro')}
        style={{
          width: '100%', padding: '12px 8px', borderRadius: 13, border: 'none',
          background: `linear-gradient(120deg, ${C.amber}, #F2B48C)`, color: C.ink,
          fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {fr ? 'Passer Pro' : 'Go Pro'}
      </button>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function ConversionModal({
  isOpen,
  onClose,
  onUpgrade,
  trigger      = 'generic',        // 'voice' | 'lens' | 'publish' | 'stock' | 'generic'
  targetTiers  = ['premium', 'pro'],
  lang         = 'fr',
  // Tier courant de l'utilisateur (pilote les cartes affichées)
  isPremium    = false,
  isPro        = false,
  // Contexte réel : jauge + pastille + bloc Pépites
  itemCount    = null,
  stockLimit   = 20,
  coinBalance  = null,
  coinPrice    = null,             // prix en Pépites de l'action bloquée (null = pas de bloc Pépites)
  onUseCoins   = null,             // ouvre le store de packs (CoinStoreModal)
}) {
  const fr = lang !== 'en';

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Tiers réellement vendables : jamais 'founder' ; un Premium ne se voit
  // proposer que Pro ; un Pro n'a plus rien à acheter (bloc Pépites seul).
  const sellable = isPro ? [] : isPremium ? ['pro'] : targetTiers.filter(t => t === 'premium' || t === 'pro');
  const showGrid = sellable.includes('premium') && sellable.includes('pro');
  const copy = triggerCopy(trigger, lang, { itemCount, stockLimit, coinPrice });
  const showCoins = coinPrice != null && typeof onUseCoins === 'function';

  // Jauge — donnée réelle selon le trigger
  let gauge = null;
  if (trigger === 'stock' && itemCount != null) {
    gauge = { label: fr ? '📦 Articles en stock' : '📦 Items in stock', value: itemCount, max: stockLimit, danger: itemCount >= stockLimit };
  } else if (trigger === 'voice') {
    gauge = { label: fr ? '🎙️ Commandes vocales aujourd\'hui' : '🎙️ Voice commands today', value: 5, max: 5, danger: true };
  } else if (showCoins && coinBalance != null) {
    gauge = { label: fr ? '🪙 Pépites disponibles' : '🪙 Nuggets available', value: coinBalance, max: coinPrice, danger: coinBalance < coinPrice };
  }

  const actionWord = trigger === 'publish'
    ? (fr ? 'cette publication' : 'this publication')
    : (fr ? 'cette analyse' : 'this scan');

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
            background: C.canvas, borderRadius: '24px 24px 0 0',
            maxHeight: '92vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
            padding: '14px 18px calc(env(safe-area-inset-bottom, 0px) + 26px)',
            animation: 'fsSheetUp 0.3s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          <div style={{ width: 40, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 16px' }} />

          {/* Header */}
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.tealDeep, letterSpacing: '0.02em', marginBottom: 4 }}>
            {copy.eyebrow}
          </div>
          <div style={{ fontSize: 23, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.6px', color: C.ink, marginBottom: 12 }}>
            {copy.title}
          </div>

          {/* Pastille tier courant (Free uniquement — discrète, pas une carte) */}
          {!isPremium && !isPro && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
              background: C.paper, border: `1px solid ${C.border}`, borderRadius: 99,
              padding: '5px 12px', fontSize: 11, fontWeight: 600, color: C.mute,
            }}>
              {fr ? 'Tu es en Free' : "You're on Free"}
              {itemCount != null && <> · {itemCount} {fr ? 'article' : 'item'}{itemCount > 1 ? 's' : ''}</>}
              {coinBalance != null && <> · <PepiteIcon size={12} /> {coinBalance}</>}
            </div>
          )}

          {/* Jauge de quota (donnée réelle) */}
          {gauge && <QuotaGauge {...gauge} />}

          {/* Carte "plan actuel" collapsée — Premium ET Pro (le Pro n'avait rien
              avant : plus rien à lui vendre, donc aucun rappel de son palier). */}
          {isPremium && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              background: C.paper, border: `1px solid ${C.border}`, borderRadius: 13,
              padding: '10px 14px',
            }}>
              <PlanBadge isPremium={isPremium} isPro={isPro} />
              <span style={{ fontSize: 11, fontWeight: 600, color: C.mute }}>
                — {fr ? 'ton plan actuel' : 'your current plan'}
              </span>
            </div>
          )}

          {/* Cartes vendables */}
          {showGrid ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 8 }}>
              <PremiumCard lang={lang} onUpgrade={onUpgrade} compactGrid />
              <ProCard lang={lang} onUpgrade={onUpgrade} compactGrid />
            </div>
          ) : sellable.includes('pro') ? (
            <div style={{ paddingTop: 8 }}>
              <ProCard lang={lang} onUpgrade={onUpgrade} />
            </div>
          ) : sellable.includes('premium') ? (
            <div style={{ paddingTop: 8 }}>
              <PremiumCard lang={lang} onUpgrade={onUpgrade} />
            </div>
          ) : null}

          {/* Bloc Pépites — chemin secondaire, jamais un blocage forcé vers l'abo */}
          {showCoins && (
            <>
              {sellable.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 12px' }}>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.mute, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {fr ? 'ou' : 'or'}
                  </span>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                </div>
              )}
              <div style={{
                background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14,
                padding: '13px 14px', marginTop: sellable.length > 0 ? 0 : 8,
              }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PepiteIcon size={15} /> {fr ? 'Continuer avec tes Pépites' : 'Continue with your Nuggets'}
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: C.mute, marginBottom: 10 }}>
                  {fr
                    ? <>{coinPrice} Pépites pour {actionWord}{coinBalance != null && <> · il t'en reste {coinBalance}</>}</>
                    : <>{coinPrice} Nuggets for {actionWord}{coinBalance != null && <> · you have {coinBalance} left</>}</>}
                </div>
                <button
                  onClick={onUseCoins}
                  style={{
                    width: '100%', padding: '11px', borderRadius: 12,
                    border: `1.5px solid ${C.tealDeep}`, background: 'none',
                    color: C.tealDeep, fontWeight: 700, fontSize: 13,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {fr ? 'Utiliser mes Pépites' : 'Use my Nuggets'}
                </button>
              </div>
            </>
          )}

          {/* Dismiss */}
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <span onClick={onClose} style={{ fontSize: 12.5, color: C.mute, cursor: 'pointer', fontWeight: 600 }}>
              {fr ? 'Non merci' : 'No thanks'}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
