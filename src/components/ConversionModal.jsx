import { useEffect, useState } from 'react';
import PepiteIcon from './PepiteIcon';
import PlanBadge, { PremiumBadge, ProBadge } from './PlanBadge';
import { PACKS } from './coinPacks';
import { supabase } from '../lib/supabase';

// ConversionModal — modale de conversion unique (upsell Pépites / Premium / Pro).
// Design « Conversion Modals » (Claude Design, projet e47b36df) intégré le
// 2026-07-14, avec CORRECTION des valeurs : la BASE fait autorité, jamais le
// design. Divergences relevées et corrigées (vérifiées le 2026-07-14) :
//   • le design annonçait 600 Pépites/mois pour Pro → la base en donne 800
//     (coin_config.monthly_grant_pro ; la migration qui abaisse à 600 est
//     volontairement NON appliquée, cf. 20260707100000_lens_coins_config.sql).
//   • le design étiquetait « Annonce avancée : 12 Pépites » → 12 est le coût de
//     la retouche LÉGÈRE (price_ia_light). Origine = 3, avancée = 35.
//   • le design promettait « Lens illimité » en Pro → FAUX : Lens coûte des
//     Pépites sur TOUS les paliers (price_lens_overflow = 6). Pro n'a pas de
//     Lens gratuit, il a plus de Pépites — on affiche donc une ESTIMATION
//     d'analyses (grant ÷ coût Lens), calculée, jamais « illimité ».
//
// Les quatre cas du design :
//   CAS 1 · Pépites insuffisantes — Publier  (trigger 'publish', coinPrice ≠ null)
//   CAS 2 · Pépites insuffisantes — Lens     (trigger 'lens',    coinPrice ≠ null)
//   CAS 3 · Free → Premium                   (utilisateur non premium)
//   CAS 4 · Premium → Pro                    (isPremium && !isPro)

const C = {
  canvas: '#EDEAE0',
  paper:  '#F6F5F1',
  ink:    '#10201B',
  teal:   '#2F9E90',
  tealDeep: '#1B6E62',
  amber:  '#E8956D',
  amberInk: '#C2410C',
  mute:   '#8A8578',
  mute2:  '#5C6560',
  faint:  '#A39D8E',
  border: '#E7E3D8',
};

const ANIM = `
@keyframes fsSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes fsFadeIn  { from { opacity: 0; } to { opacity: 1; } }
`;

// ⚠️ REPLI UNIQUEMENT — utilisé si la lecture de coin_config échoue (réseau).
// Le chemin normal lit TOUJOURS la table. Ces valeurs sont celles constatées en
// base le 2026-07-14 ; si elles divergent un jour, c'est la base qui a raison.
const COIN_CONFIG_FALLBACK = {
  price_original: 3,
  price_ia_light: 12,
  price_ia_advanced: 35,
  price_lens_overflow: 6,
  monthly_grant_premium: 150,
  monthly_grant_pro: 800,
};

// Prix des abonnements — ils vivent chez Stripe / Apple / Google, pas en base.
// Vérifiés côté Stripe le 2026-07-14 : « Standard Plan » 1299 c, « FillSell Pro
// Mensuel » 2999 c. L'essai de 7 jours est posé par create-checkout-session
// (trial_period_days: 7) pour les nouveaux clients Premium ; le Pro n'en a pas.
const PLAN_PRICES = {
  premium: { price: '12,99 €', trialDays: 7 },
  pro:     { price: '29,99 €', trialDays: 0 },
};

// ── Blocs (au niveau module : jamais recréés à chaque rendu) ─────────────────

function Handle() {
  return <div style={{ width: 40, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 16px' }} />;
}

function Eyebrow({ icon, children }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(47,158,144,0.12)',
      borderRadius: 999, padding: '5px 11px', marginBottom: 12,
    }}>
      {icon}
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', color: C.tealDeep, whiteSpace: 'nowrap' }}>
        {children}
      </span>
    </div>
  );
}

function Title({ children }) {
  return (
    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', color: C.ink, marginBottom: 14 }}>
      {children}
    </div>
  );
}

function Features({ items, dark }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 18 }}>
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

// Jauge « ton solde » — solde réel (coin_wallets) / coût réel de l'action.
function BalanceCard({ fr, balance, cost, missing, explain }) {
  const pct = Math.max(0, Math.min(1, cost > 0 ? (balance ?? 0) / cost : 0)) * 100;
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: C.mute2 }}>
          <PepiteIcon size={16} /> {fr ? 'Ton solde' : 'Your balance'}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.amberInk }}>{balance ?? 0} / {cost}</span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: C.canvas, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: C.amber, borderRadius: 99, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.5, color: C.mute, marginTop: 9 }}>
        {explain}
        {missing != null && (
          <> · {fr ? "il t'en manque" : 'you need'} <b style={{ color: C.amberInk, fontWeight: 700 }}>{missing}</b>.</>
        )}
      </div>
    </div>
  );
}

// Les 4 packs — même source que CoinStoreModal (PACKS), qui reste le SEUL chemin
// d'achat : un clic ouvre le store, qui gère l'IAP natif et le checkout Stripe.
function PackList({ fr, onUseCoins }) {
  return (
    <>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.faint, marginBottom: 10 }}>
        {fr ? 'Recharge tes Pépites' : 'Top up your Nuggets'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {PACKS.map(p => (
          <button
            key={p.id}
            onClick={onUseCoins}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px',
              cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 15, fontWeight: 700, color: C.ink }}>
                <PepiteIcon size={17} /> {p.coins}
              </span>
              {p.bonus && (
                <span style={{ fontSize: 10, fontWeight: 700, color: C.tealDeep, background: '#E7F3F0', border: '1px solid #CBE5DF', borderRadius: 999, padding: '2px 7px' }}>
                  {p.bonus}
                </span>
              )}
            </span>
            <span style={{
              fontSize: 13, fontWeight: 700, color: '#fff', minWidth: 74, textAlign: 'center',
              background: `linear-gradient(120deg,${C.teal},${C.tealDeep})`, padding: '8px 15px', borderRadius: 999,
            }}>
              {p.price}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function OrDivider({ fr }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      <span style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, letterSpacing: '0.06em' }}>{fr ? 'OU' : 'OR'}</span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

function Dismiss({ onClose, label }) {
  return (
    <div style={{ textAlign: 'center', marginTop: 14 }}>
      <span onClick={onClose} style={{ fontSize: 12.5, fontWeight: 600, color: C.mute, cursor: 'pointer' }}>
        {label}
      </span>
    </div>
  );
}

// Carte Premium (CAS 3) — badge repris de PlanBadge, jamais recréé.
function PremiumPlanCard({ fr, grantPrem, lensCost, lensScans, onUpgrade }) {
  return (
    <div style={{
      background: C.paper, border: `1.5px solid ${C.teal}`, borderRadius: 22,
      padding: '20px 18px 18px', boxShadow: '0 12px 30px -16px rgba(27,110,98,0.4)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <PremiumBadge />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: C.ink, lineHeight: 1 }}>{PLAN_PRICES.premium.price}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.mute, marginTop: 2 }}>{fr ? '/mois' : '/mo'}</div>
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(47,158,144,0.10)',
        border: '1px solid rgba(47,158,144,0.22)', borderRadius: 12, padding: '9px 12px', marginBottom: 14,
      }}>
        <PepiteIcon size={18} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.tealDeep }}>
          {fr ? `${grantPrem} Pépites offertes chaque mois` : `${grantPrem} Nuggets included every month`}
        </span>
      </div>
      <Features
        items={[
          fr ? 'Stock illimité' : 'Unlimited stock',
          fr ? 'Publie sur Vinted, Leboncoin, eBay & Beebs' : 'Publish on Vinted, Leboncoin, eBay & Beebs',
          fr ? `Environ ${lensScans} analyses Lens par mois (${lensCost} Pépites l'analyse)`
             : `About ${lensScans} Lens scans a month (${lensCost} Nuggets each)`,
          fr ? 'Import & export Excel de ton stock' : 'Excel import & export of your stock',
          fr ? 'Commandes vocales illimitées' : 'Unlimited voice commands',
        ]}
      />
      <button
        onClick={() => onUpgrade('premium')}
        style={{
          width: '100%', padding: 15, border: 'none', borderRadius: 14,
          background: `linear-gradient(120deg,${C.teal},${C.tealDeep})`, color: '#fff',
          fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          boxShadow: '0 10px 22px -8px rgba(47,158,144,0.5)',
        }}
      >
        {fr ? 'Passer Premium' : 'Go Premium'}
        {PLAN_PRICES.premium.trialDays > 0 && (fr
          ? ` · ${PLAN_PRICES.premium.trialDays} jours offerts`
          : ` · ${PLAN_PRICES.premium.trialDays} days free`)}
      </button>
    </div>
  );
}

// Carte Pro (CAS 4) — fond sombre, badge ProBadge.
// ⚠️ Aucune promesse « Lens illimité » : Lens est payant en Pépites sur TOUS les
// paliers. On annonce ce que le grant permet réellement (calculé).
function ProPlanCard({ fr, grantPro, lensCost, lensScans, proFactor, showFactor, pubMin, pubMax, onUpgrade }) {
  return (
    <div style={{
      position: 'relative',
      background: `radial-gradient(130% 120% at 100% 0%, rgba(232,149,109,0.28), transparent 58%), ${C.ink}`,
      border: '1.5px solid rgba(214,178,96,0.55)', borderRadius: 22,
      padding: '20px 18px 18px', boxShadow: '0 14px 34px -14px rgba(16,32,27,0.5)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <ProBadge />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: C.paper, lineHeight: 1 }}>{PLAN_PRICES.pro.price}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(246,245,241,0.6)', marginTop: 2 }}>{fr ? '/mois' : '/mo'}</div>
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(232,149,109,0.14)',
        border: '1px solid rgba(214,178,96,0.3)', borderRadius: 12, padding: '9px 12px', marginBottom: 14,
      }}>
        <PepiteIcon size={18} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#F2C98A' }}>
          {fr ? `${grantPro} Pépites/mois` : `${grantPro} Nuggets/mo`}
          {showFactor && proFactor ? (fr ? ` — ${proFactor}× plus` : ` — ${proFactor}× more`) : ''}
        </span>
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(246,245,241,0.5)', marginBottom: 10 }}>
        {fr ? 'Tout Premium, et en plus' : 'Everything in Premium, plus'}
      </div>
      <Features
        dark
        items={[
          fr ? `Environ ${lensScans} analyses Lens par mois (${lensCost} Pépites l'analyse)`
             : `About ${lensScans} Lens scans a month (${lensCost} Nuggets each)`,
          fr ? `De quoi publier bien plus d'annonces (${pubMin} à ${pubMax} Pépites l'annonce)`
             : `Room for many more listings (${pubMin} to ${pubMax} Nuggets each)`,
          fr ? 'Import & export Excel de ton stock' : 'Excel import & export of your stock',
          fr ? 'Support prioritaire' : 'Priority support',
        ]}
      />
      <button
        onClick={() => onUpgrade('pro')}
        style={{
          width: '100%', padding: 15, border: 'none', borderRadius: 14,
          background: `linear-gradient(120deg,${C.amber},#F2B48C)`, color: C.ink,
          fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          boxShadow: '0 10px 22px -8px rgba(232,149,109,0.5)',
        }}
      >
        {fr ? 'Passer Pro' : 'Go Pro'}
      </button>
    </div>
  );
}

function Sheet({ onClose, children }) {
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
          <Handle />
          {children}
        </div>
      </div>
    </>
  );
}

// ── Modale ───────────────────────────────────────────────────────────────────

export default function ConversionModal({
  isOpen,
  onClose,
  onUpgrade,
  trigger      = 'generic',        // 'voice' | 'lens' | 'publish' | 'stock' | 'generic'
  targetTiers  = ['premium', 'pro'],
  lang         = 'fr',
  isPremium    = false,
  isPro        = false,
  itemCount    = null,
  stockLimit   = 20,
  coinBalance  = null,             // solde réel (coin_wallets), fourni par l'appelant
  coinPrice    = null,             // coût réel de l'action bloquée (réponse serveur)
  onUseCoins   = null,             // ouvre CoinStoreModal (chemin d'achat existant)
}) {
  const fr = lang !== 'en';
  const [cfg, setCfg] = useState(null);

  // Coûts et grants : lus en base à chaque ouverture. Aucune valeur en dur.
  useEffect(() => {
    if (!isOpen) return;
    let annule = false;
    supabase.from('coin_config').select('key, value').then(({ data, error }) => {
      if (annule) return;
      if (error || !data?.length) { setCfg(COIN_CONFIG_FALLBACK); return; }
      const map = {};
      for (const row of data) map[row.key] = row.value;
      setCfg({ ...COIN_CONFIG_FALLBACK, ...map });
    });
    return () => { annule = true; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const K = cfg || COIN_CONFIG_FALLBACK;
  const lensCost  = K.price_lens_overflow;
  const grantPrem = K.monthly_grant_premium;
  const grantPro  = K.monthly_grant_pro;
  // Estimation d'analyses Lens permises par le grant mensuel — CALCULÉE.
  const lensPerMonth = (grant) => (lensCost > 0 ? Math.floor(grant / lensCost) : 0);
  const proFactor = grantPrem > 0 ? Math.round((grantPro / grantPrem) * 10) / 10 : null;

  // Libellé du tier de publication : déduit du COÛT renvoyé par le serveur,
  // confronté aux trois prix de coin_config. Aucun mapping supposé — c'est la
  // correction de l'erreur du design (12 = légère, pas avancée).
  const tierLabel = (cost) => {
    if (cost === K.price_original)    return fr ? "Photos d'origine" : 'Original photos';
    if (cost === K.price_ia_light)    return fr ? 'Retouche légère'  : 'Light editing';
    if (cost === K.price_ia_advanced) return fr ? 'Retouche avancée' : 'Advanced editing';
    return fr ? 'Cette publication' : 'This publication';
  };

  const isCoinCase = coinPrice != null;                    // CAS 1 et CAS 2
  const missing = isCoinCase && coinBalance != null ? Math.max(0, coinPrice - coinBalance) : null;
  const sellable = isPro ? [] : isPremium ? ['pro'] : targetTiers.filter(t => t === 'premium' || t === 'pro');
  const canBuyCoins = typeof onUseCoins === 'function';

  // ══ CAS 1 & 2 — Pépites insuffisantes (publier / Lens) ══════════════════════
  if (isCoinCase) {
    const isLens = trigger === 'lens';
    // Palier poussé en second rideau : un Free voit Premium, un Premium voit Pro,
    // un Pro n'a plus rien à acheter (packs seuls).
    const upTier = !isPremium ? 'premium' : (!isPro ? 'pro' : null);

    return (
      <Sheet onClose={onClose}>
        <Eyebrow
          icon={isLens
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.tealDeep} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="14.31" y1="8" x2="20.05" y2="17.94"/><line x1="9.69" y1="8" x2="21.17" y2="8"/><line x1="7.38" y1="12" x2="13.12" y2="2.06"/><line x1="9.69" y1="16" x2="3.95" y2="6.06"/><line x1="14.31" y1="16" x2="2.83" y2="16"/><line x1="16.62" y1="12" x2="10.88" y2="21.94"/></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.tealDeep} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v13"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/></svg>}
        >
          {isLens ? (fr ? 'ANALYSE LENS' : 'LENS SCAN') : (fr ? 'PUBLIER UNE ANNONCE' : 'PUBLISH A LISTING')}
        </Eyebrow>

        <Title>
          {isLens
            ? (fr ? 'Plus assez de Pépites pour cette analyse.' : 'Not enough Nuggets for this scan.')
            : (fr ? 'Il te manque des Pépites pour publier.' : 'You need more Nuggets to publish.')}
        </Title>

        <BalanceCard
          fr={fr}
          balance={coinBalance}
          cost={coinPrice}
          missing={missing}
          explain={isLens
            ? (fr
                ? <>Une analyse Lens (photo → prix, plateforme, deal) coûte <b style={{ color: C.mute2, fontWeight: 700 }}>{coinPrice} Pépites</b></>
                : <>A Lens scan (photo → price, platform, deal) costs <b style={{ color: C.mute2, fontWeight: 700 }}>{coinPrice} Nuggets</b></>)
            : (fr
                ? <>{tierLabel(coinPrice)} : <b style={{ color: C.mute2, fontWeight: 700 }}>{coinPrice} Pépites</b></>
                : <>{tierLabel(coinPrice)}: <b style={{ color: C.mute2, fontWeight: 700 }}>{coinPrice} Nuggets</b></>)}
        />

        {canBuyCoins && <PackList fr={fr} onUseCoins={onUseCoins} />}

        {upTier && (
          <>
            <OrDivider fr={fr} />
            <button
              onClick={() => onUpgrade(upTier)}
              style={{
                width: '100%', padding: 13, borderRadius: 14, border: `1.5px solid ${C.tealDeep}`,
                background: 'none', color: C.tealDeep, fontSize: 13, fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {upTier === 'pro'
                ? (fr ? `Passe Pro — ${grantPro} Pépites/mois (≈ ${lensPerMonth(grantPro)} analyses Lens)`
                      : `Go Pro — ${grantPro} Nuggets/mo (≈ ${lensPerMonth(grantPro)} Lens scans)`)
                : (fr ? `Passe Premium — ${grantPrem} Pépites/mois incluses`
                      : `Go Premium — ${grantPrem} Nuggets/mo included`)}
            </button>
          </>
        )}

        <Dismiss onClose={onClose} label={fr ? 'Non merci' : 'No thanks'} />
      </Sheet>
    );
  }

  // ══ CAS 4 — Premium → Pro (garde stricte : Premium réel et non-Pro) ════════
  if (isPremium && !isPro) {
    return (
      <Sheet onClose={onClose}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12,
          background: C.paper, border: `1px solid ${C.border}`, borderRadius: 999,
          padding: '5px 10px 5px 5px',
        }}>
          <PlanBadge isPremium isPro={false} />
          <span style={{ fontSize: 11, fontWeight: 600, color: C.mute }}>
            {fr ? 'ton plan actuel' : 'your current plan'}
          </span>
        </div>
        <Title>{fr ? 'Passe au volume supérieur.' : 'Move up a gear.'}</Title>
        <ProPlanCard
          fr={fr} grantPro={grantPro} lensCost={lensCost} lensScans={lensPerMonth(grantPro)}
          proFactor={proFactor} showFactor
          pubMin={K.price_original} pubMax={K.price_ia_advanced}
          onUpgrade={onUpgrade}
        />
        <Dismiss onClose={onClose} label={fr ? 'Rester en Premium' : 'Stay on Premium'} />
      </Sheet>
    );
  }

  // ══ Pro : plus rien à vendre (packs seuls) ═════════════════════════════════
  if (isPro || sellable.length === 0) {
    return (
      <Sheet onClose={onClose}>
        <Title>{fr ? 'Tu es déjà au maximum.' : "You're already on the top plan."}</Title>
        {canBuyCoins && <PackList fr={fr} onUseCoins={onUseCoins} />}
        <Dismiss onClose={onClose} label={fr ? 'Fermer' : 'Close'} />
      </Sheet>
    );
  }

  // ══ CAS 3 — Free → Premium ═════════════════════════════════════════════════
  const stockFull = trigger === 'stock' && itemCount != null;
  return (
    <Sheet onClose={onClose}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12,
        background: C.paper, border: `1px solid ${C.border}`, borderRadius: 999,
        padding: '5px 11px', fontSize: 11, fontWeight: 600, color: C.mute,
      }}>
        {fr ? 'Tu es en Free' : "You're on Free"}
        {stockFull && <> · {itemCount}/{stockLimit} {fr ? 'articles' : 'items'}</>}
        {coinBalance != null && <> · <PepiteIcon size={12} /> {coinBalance} {fr ? 'Pépites' : 'Nuggets'}</>}
      </div>

      <Title>
        {trigger === 'voice'
          ? (fr ? 'Passe en vocal illimité.' : 'Go unlimited on voice.')
          : stockFull
            ? (fr ? 'Ton stock est plein.' : 'Your stock is full.')
            : (fr ? 'Débloque tout FillSell.' : 'Unlock all of FillSell.')}
      </Title>

      <PremiumPlanCard
        fr={fr} grantPrem={grantPrem} lensCost={lensCost} lensScans={lensPerMonth(grantPrem)}
        onUpgrade={onUpgrade}
      />

      {targetTiers.includes('pro') && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.mute }}>
            {fr ? 'Gros volume ? ' : 'High volume? '}
            <span onClick={() => onUpgrade('pro')} style={{ color: C.tealDeep, fontWeight: 700, cursor: 'pointer' }}>
              {fr ? 'Découvre Pro →' : 'Discover Pro →'}
            </span>
          </span>
        </div>
      )}

      <Dismiss onClose={onClose} label={fr ? 'Non merci' : 'No thanks'} />
    </Sheet>
  );
}
