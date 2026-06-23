import { useEffect } from 'react';

const ANIM = `
@keyframes fsPop {
  from { opacity: 0; transform: translateY(14px) scale(0.965); }
  to   { opacity: 1; transform: none; }
}
@keyframes fsPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.3; transform: scale(0.6); }
}
@keyframes fsShimmer {
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
@keyframes fsGlow {
  0%, 100% { box-shadow: 0 12px 34px rgba(45,184,154,0.45), 0 4px 12px rgba(45,184,154,0.25); }
  50%       { box-shadow: 0 16px 46px rgba(232,132,90,0.5), 0 4px 14px rgba(45,184,154,0.3); }
}
`;

const T = {
  eyebrow: {
    lens:  { fr: '📸 Limite Lens atteinte · 3/3 aujourd\'hui', en: '📸 Lens limit reached · 3/3 today' },
    voice: { fr: '🎙️ Limite vocale atteinte · 5/5 aujourd\'hui', en: '🎙️ Voice limit reached · 5/5 today' },
  },
  hl1: {
    lens:  { fr: 'Tu enchaînais les scans.', en: 'You were on a roll.' },
    voice: { fr: 'En plein ajout vocal.', en: 'You were adding fast.' },
  },
  hl2: {
    lens:  { fr: 'Lens s\'arrête à 3/jour.', en: 'Lens stops at 3/day.' },
    voice: { fr: 'Stop à 5 commandes/jour.', en: 'Stop at 5 commands/day.' },
  },
  founderBadge: {
    fr: (n) => `🔥 Plus que ${n} places Founder`,
    en: (n) => `🔥 Only ${n} Founder spots left`,
  },
  sectionLabel: { fr: 'Ce que débloque Founder', en: 'What Founder unlocks' },
  voiceLabel:   { fr: 'IA vocale', en: 'Voice AI' },
  voiceSub:     { fr: 'ajoute à la voix, sans compter', en: 'add by voice, no cap' },
  lensLabel:    { fr: 'Lens Pro', en: 'Lens Pro' },
  lensSub:      { fr: '+ prix marché en direct', en: '+ live market prices' },
  stockLabel:   { fr: 'Stock', en: 'Stock' },
  stockSub:     { fr: 'articles suivis', en: 'tracked items' },
  unlimited:    { fr: 'illimité', en: 'unlimited' },
  lensNew:      { fr: ['10', '/j'], en: ['10', '/day'] },
  perMonth:     { fr: '/mois', en: '/mo' },
  trial:        { fr: '7 jours gratuits', en: '7-day free trial' },
  priceNote:    { fr: 'soit 0,33€/jour · prix réservé aux premiers utilisateurs', en: 'i.e. €0.33/day · early adopter price' },
  cta:          { fr: 'Débloquer maintenant', en: 'Unlock now' },
  subNote:      { fr: 'Sans engagement · Résiliable en 1 clic', en: 'No commitment · Cancel anytime' },
  dismiss:      { fr: 'Non merci, je reste limité', en: 'No thanks, I\'ll stay limited' },
};

export default function ConversionModal({ isOpen, onClose, onUpgrade, trigger = 'lens', founderSpotsLeft = 7, lang = 'fr' }) {
  const trig = trigger === 'voice' ? 'voice' : 'lens';
  const l = (key) => T[key]?.[lang] ?? T[key]?.fr;

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
          }}
        >
          {/* Gradient header */}
          <div style={{ position: 'relative', padding: '22px 22px 20px', background: 'linear-gradient(135deg,#1D9E75,#2DB89A)', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -40, right: -30, width: 160, height: 160, borderRadius: 99, background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 100, background: 'rgba(255,255,255,0.18)', marginBottom: 14 }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: '#fff', display: 'inline-block', animation: 'fsPulse 1.6s ease-in-out infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>{T.founderBadge[lang](founderSpotsLeft)}</span>
            </div>
            <div style={{ position: 'relative', fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.02em', marginBottom: 6 }}>
              {T.eyebrow[trig][lang]}
            </div>
            <div style={{ position: 'relative', fontSize: 25, fontWeight: 900, lineHeight: 1.14, letterSpacing: '-0.8px', color: '#fff' }}>
              {T.hl1[trig][lang]}{' '}{T.hl2[trig][lang]}
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 22px 22px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#999', marginBottom: 12 }}>
              {l('sectionLabel')}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
              <FeatureRow emoji="🎙️" label={l('voiceLabel')} sub={l('voiceSub')}>
                <QuotaJump from="5" to={l('unlimited')} />
              </FeatureRow>
              <FeatureRow emoji="📸" label={l('lensLabel')} sub={l('lensSub')}>
                <QuotaJump from="3" toNum={T.lensNew[lang][0]} toSuffix={T.lensNew[lang][1]} />
              </FeatureRow>
              <FeatureRow emoji="📦" label={l('stockLabel')} sub={l('stockSub')}>
                <QuotaJump from="20" to={l('unlimited')} />
              </FeatureRow>
            </div>

            {/* Price block */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#999', textDecoration: 'line-through' }}>14,99€</span>
              <span style={{ fontSize: 32, fontWeight: 900, color: '#1D9E75', letterSpacing: '-1px' }}>9,99€</span>
              <span style={{ fontSize: 14, color: '#666', fontWeight: 700 }}>{l('perMonth')}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: '#1A6B4A', background: '#E8F5F0', padding: '4px 10px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                {l('trial')}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 4, marginBottom: 14 }}>
              {l('priceNote')}
            </div>

            <button
              onClick={onUpgrade}
              style={{
                width: '100%', padding: 16, border: 'none', borderRadius: 14,
                background: 'linear-gradient(90deg,#1D9E75,#E8845A,#1D9E75)',
                backgroundSize: '200% 100%',
                color: '#fff', fontFamily: 'inherit', fontSize: 16, fontWeight: 900,
                letterSpacing: '-0.2px', cursor: 'pointer',
                animation: 'fsGlow 2.8s ease-in-out infinite, fsShimmer 4.5s linear infinite',
              }}
            >
              {l('cta')}
            </button>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#999', marginTop: 9 }}>
              {l('subNote')}
            </div>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <span
                onClick={onClose}
                style={{ fontSize: 13, color: '#999', cursor: 'pointer', fontWeight: 500 }}
              >
                {l('dismiss')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

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
      <div style={{ flex: 1, fontSize: 13.5, fontWeight: 800, color: '#1A1A1A' }}>
        {label}
        <div style={{ fontSize: 11, fontWeight: 600, color: '#666' }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

function QuotaJump({ from, to, toNum, toSuffix }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 14, fontWeight: 800, color: '#999', textDecoration: 'line-through' }}>{from}</span>
      <span style={{ color: '#E8845A', fontWeight: 900 }}>→</span>
      {to
        ? <span style={{ fontSize: 16, fontWeight: 900, color: '#1D9E75', letterSpacing: '-0.3px' }}>{to}</span>
        : <>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#1D9E75', letterSpacing: '-0.5px' }}>{toNum}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#666' }}>{toSuffix}</span>
          </>
      }
    </div>
  );
}
