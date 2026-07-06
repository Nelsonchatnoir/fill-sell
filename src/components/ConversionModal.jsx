import { useEffect } from 'react';
import { PremiumButton } from './ui';
import PepiteIcon from './PepiteIcon';

const ANIM = `
@keyframes fsPop {
  from { opacity: 0; transform: translateY(14px) scale(0.965); }
  to   { opacity: 1; transform: none; }
}
@keyframes fsPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.3; transform: scale(0.6); }
}
`;

// ── Copie i18n ────────────────────────────────────────────────────────────────

const T = {
  eyebrow: {
    lens:    { fr: '📸 Limite Lens atteinte · 3/3 aujourd\'hui', en: '📸 Lens limit reached · 3/3 today' },
    voice:   { fr: '🎙️ Limite vocale atteinte · 5/5 aujourd\'hui', en: '🎙️ Voice limit reached · 5/5 today' },
    publish: { fr: 'Plus assez de Pépites pour publier', en: 'Not enough Nuggets to publish' },
    style:   { fr: '✨ Option de retouche verrouillée', en: '✨ Photo enhancement locked' },
  },
  hl1: {
    lens:    { fr: 'Tu enchaînais les scans.', en: 'You were on a roll.' },
    voice:   { fr: 'En plein ajout vocal.', en: 'You were adding fast.' },
    publish: { fr: 'Ta réserve de Pépites est à sec.', en: 'Your Nugget stash ran dry.' },
    style:   { fr: 'La retouche IA avancée', en: 'Advanced AI retouching' },
  },
  hl2: {
    lens:    { fr: 'Lens s\'arrête à 3/jour.', en: 'Lens stops at 3/day.' },
    voice:   { fr: 'Stop à 5 commandes/jour.', en: 'Stop at 5 commands/day.' },
    publish: { fr: 'Les abonnements incluent des Pépites chaque mois.', en: 'Subscriptions include Nuggets every month.' },
    style:   { fr: 'est réservée aux abonnés supérieurs.', en: 'is for higher-tier subscribers.' },
  },
  // Premium section
  premiumLabel:  { fr: 'Premium', en: 'Premium' },
  voiceLabel:    { fr: 'IA vocale', en: 'Voice AI' },
  voiceSub:      { fr: 'ajoute à la voix, sans compter', en: 'add by voice, no cap' },
  lensLabel:     { fr: 'Lens Pro', en: 'Lens Pro' },
  lensSub:       { fr: '+ prix marché en direct', en: '+ live market prices' },
  stockLabel:    { fr: 'Stock', en: 'Stock' },
  stockSub:      { fr: 'articles suivis', en: 'tracked items' },
  unlimited:     { fr: 'illimité', en: 'unlimited' },
  lensNew:       { fr: ['10', '/j'], en: ['10', '/day'] },
  perMonth:      { fr: '/mois', en: '/mo' },
  trial:         { fr: '7 jours gratuits', en: '7-day free trial' },
  priceNote:     { fr: 'soit 0,43€/jour', en: 'i.e. €0.43/day' },
  premiumCta:    { fr: 'Débloquer maintenant', en: 'Unlock now' },
  subNote:       { fr: 'Sans engagement · Résiliable en 1 clic', en: 'No commitment · Cancel anytime' },
  // Pro section
  proLabel:      { fr: 'Pro', en: 'Pro' },
  publishLabel:  { fr: 'Publication illimitée', en: 'Unlimited publishing' },
  publishSub:    { fr: 'multi-plateformes, Vinted · Leboncoin · eBay…', en: 'multi-platform, Vinted · Leboncoin · eBay…' },
  proCoinsLabel: { fr: '800 Pépites incluses chaque mois', en: '800 Nuggets included every month' },
  proCoinsSub:   { fr: '≈ 23 annonces en retouche avancée / mois', en: '≈ 23 listings with advanced retouching / mo' },
  premCoinsLabel:{ fr: 'Pépites de publication', en: 'Publishing Nuggets' },
  premCoinsSub:  { fr: '150 incluses/mois ≈ 12 annonces retouche légère', en: '150 included/mo ≈ 12 light-retouch listings' },
  proPrice:      { fr: '29,99€', en: '€29.99' },
  ficheLabel:    { fr: 'Fiches IA par plateforme', en: 'AI listings per platform' },
  ficheSub:      { fr: 'titres & descriptions adaptés à chaque site', en: 'tailored titles & descriptions per site' },
  retoucheLabel: { fr: 'Retouche IA avancée', en: 'Advanced AI retouching' },
  retoucheSub:   { fr: 'fond nettoyé, lumière corrigée, angles optimisés', en: 'clean background, corrected light, optimised angles' },
  proCta:        { fr: 'Passer Pro · 29,99€/mois', en: 'Go Pro · €29.99/mo' },
  // Divider
  orLabel:       { fr: 'ou passer directement à Pro', en: 'or jump straight to Pro' },
  // Dismiss
  dismiss:       { fr: 'Non merci, je reste limité', en: 'No thanks, I\'ll stay limited' },
};

const l = (key, lang) => T[key]?.[lang] ?? T[key]?.fr;

// ── Sub-components ────────────────────────────────────────────────────────────

function FeatureRow({ emoji, label, sub, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16,
      background: 'linear-gradient(135deg, rgba(45,184,154,0.06), rgba(232,132,90,0.06))',
      border: '1px solid rgba(45,184,154,0.18)',
    }}>
      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 11, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {emoji}
      </span>
      <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: '#1A1A1A' }}>
        {label}
        <div style={{ fontSize: 11, fontWeight: 600, color: '#666' }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

function ProFeatureRow({ emoji, label, sub }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16,
      background: 'linear-gradient(135deg, rgba(79,70,229,0.06), rgba(124,58,237,0.06))',
      border: '1px solid rgba(124,58,237,0.18)',
    }}>
      <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 11, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {emoji}
      </span>
      <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: '#1A1A1A' }}>
        {label}
        <div style={{ fontSize: 11, fontWeight: 600, color: '#666' }}>{sub}</div>
      </div>
    </div>
  );
}

function QuotaJump({ from, to, toNum, toSuffix }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#999', textDecoration: 'line-through' }}>{from}</span>
      <span style={{ color: '#E8845A', fontWeight: 700 }}>→</span>
      {to
        ? <span style={{ fontSize: 16, fontWeight: 700, color: '#1B6E62', letterSpacing: '-0.3px' }}>{to}</span>
        : <>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#1B6E62', letterSpacing: '-0.5px' }}>{toNum}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#666' }}>{toSuffix}</span>
          </>
      }
    </div>
  );
}

function PremiumSection({ onUpgrade, lang, compact }) {
  return (
    <div>
      {!compact && (
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#999', marginBottom: 12 }}>
          {l('premiumLabel', lang)}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <FeatureRow emoji="🎙️" label={l('voiceLabel', lang)} sub={l('voiceSub', lang)}>
          <QuotaJump from="5" to={l('unlimited', lang)} />
        </FeatureRow>
        <FeatureRow emoji="📸" label={l('lensLabel', lang)} sub={l('lensSub', lang)}>
          <QuotaJump from="3" toNum={T.lensNew[lang]?.[0] ?? '10'} toSuffix={T.lensNew[lang]?.[1] ?? '/j'} />
        </FeatureRow>
        <FeatureRow emoji="📦" label={l('stockLabel', lang)} sub={l('stockSub', lang)}>
          <QuotaJump from="20" to={l('unlimited', lang)} />
        </FeatureRow>
        <FeatureRow emoji={<PepiteIcon size={20} />} label={l('premCoinsLabel', lang)} sub={l('premCoinsSub', lang)}>
          <QuotaJump from="0" toNum="150" toSuffix={l('perMonth', lang)} />
        </FeatureRow>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: '#1B6E62', letterSpacing: '-1px' }}>12,99€</span>
        <span style={{ fontSize: 14, color: '#666', fontWeight: 700 }}>{l('perMonth', lang)}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#1B6E62', background: '#E7F3F0', padding: '4px 10px', borderRadius: 99, whiteSpace: 'nowrap' }}>
          {l('trial', lang)}
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#999', marginTop: 4, marginBottom: 14 }}>
        {l('priceNote', lang)}
      </div>

      <PremiumButton onClick={() => onUpgrade('premium')} style={{ fontSize: 16 }}>
        {l('premiumCta', lang)}
      </PremiumButton>
      <div style={{ textAlign: 'center', fontSize: 11, color: '#999', marginTop: 9 }}>
        {l('subNote', lang)}
      </div>
    </div>
  );
}

function ProSection({ onUpgrade, lang, compact }) {
  return (
    <div>
      {!compact && (
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#7C3AED', marginBottom: 12 }}>
          {l('proLabel', lang)}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <ProFeatureRow emoji={<PepiteIcon size={20} />} label={l('proCoinsLabel', lang)} sub={l('proCoinsSub', lang)} />
        <ProFeatureRow emoji="📤" label={l('publishLabel', lang)} sub={l('publishSub', lang)} />
        <ProFeatureRow emoji="🤖" label={l('ficheLabel', lang)}   sub={l('ficheSub', lang)} />
        <ProFeatureRow emoji="✨" label={l('retoucheLabel', lang)} sub={l('retoucheSub', lang)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: '#7C3AED', letterSpacing: '-1px' }}>{l('proPrice', lang)}</span>
        <span style={{ fontSize: 14, color: '#666', fontWeight: 700 }}>{l('perMonth', lang)}</span>
      </div>

      <PremiumButton onClick={() => onUpgrade('pro')} style={{ fontSize: 16 }}>
        {l('proCta', lang)}
      </PremiumButton>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ConversionModal({
  isOpen,
  onClose,
  onUpgrade,
  trigger        = 'lens',
  targetTiers    = ['premium'],
  founderSpotsLeft = 7,
  lang           = 'fr',
}) {
  const trig       = ['lens','voice','publish','style'].includes(trigger) ? trigger : 'lens';
  const showPremium = targetTiers.includes('premium');
  const showPro     = targetTiers.includes('pro');

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <style>{ANIM}</style>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9990,
          background: 'rgba(20,18,16,0.62)',
          backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 22,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 340,
            background: '#fff', borderRadius: 24, overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
            animation: 'fsPop 0.5s cubic-bezier(0.4,0,0.2,1) both',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Gradient header */}
          <div style={{ position: 'relative', padding: '22px 22px 20px', background: 'linear-gradient(135deg,#1B6E62,#2F9E90)', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: -40, right: -30, width: 160, height: 160, borderRadius: 99, background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.02em', marginBottom: 6 }}>
              {T.eyebrow[trig][lang]}
            </div>
            <div style={{ position: 'relative', fontSize: 25, fontWeight: 700, lineHeight: 1.14, letterSpacing: '-0.8px', color: '#fff' }}>
              {T.hl1[trig][lang]}{' '}{T.hl2[trig][lang]}
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ padding: '20px 22px 22px', overflowY: 'auto', flex: 1 }}>
            {showPremium && (
              <PremiumSection
                onUpgrade={onUpgrade}
                lang={lang}
                compact={showPremium && showPro}
              />
            )}

            {showPremium && showPro && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 16px' }}>
                <div style={{ flex: 1, height: 1, background: '#ECEAE3' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9B9890', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                  {l('orLabel', lang)}
                </span>
                <div style={{ flex: 1, height: 1, background: '#ECEAE3' }} />
              </div>
            )}

            {showPro && (
              <ProSection
                onUpgrade={onUpgrade}
                lang={lang}
                compact={showPremium && showPro}
              />
            )}

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <span
                onClick={onClose}
                style={{ fontSize: 13, color: '#999', cursor: 'pointer', fontWeight: 500 }}
              >
                {l('dismiss', lang)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
