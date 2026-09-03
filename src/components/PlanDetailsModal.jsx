// ── Modale « mon plan » — clic sur le badge Premium/Pro du header ────────────
// Explique à l'utilisateur ce que SON plan souscrit inclut réellement. Le plan
// ACTUEL reste sans prix affiché — les ~100 comptes Founder paient un tarif
// legacy (9,99 €), afficher le prix courant serait faux pour eux.
//
// Upsell Pro (2026-07-24) : pour un Premium non-Pro, la carte Pro de
// ConversionModal (prix 29,99 + CTA « Passer Pro ») s'affiche SOUS sa carte —
// c'était le seul point d'entrée manquant vers l'upgrade depuis que stock et
// vocal sont illimités en Premium (plus aucun trigger de conversion ne les
// atteignait). Le prix affiché est celui du plan PRO courant, jamais celui du
// plan souscrit : la règle Founder est préservée. Un Pro garde la modale
// d'info telle quelle.
//
// Chiffres : mêmes sources que les cartes de ConversionModal — grants et coûts
// lus dans coin_config à l'ouverture (repli COIN_CONFIG_FALLBACK), grant Pro
// compris depuis le 2026-07-23 (l'ex-exception d'affichage DISPLAY_GRANT_PRO
// est retirée). Rien n'est écrit en dur ici : le passage à 300/800 du
// 2026-07-28 PUIS le retour à 150/600 le soir même se sont faits sans toucher
// ce fichier — seule coin_config a bougé.
import { useEffect, useState } from 'react';
import { PremiumBadge, ProBadge, BusinessBadge } from './PlanBadge';
// (import PepiteIcon retiré au nettoyage unités du 02/09 soir — plus une
// unité dans cette modale.)
import { COIN_CONFIG_FALLBACK, ProPlanCard, BusinessPlanCard } from './ConversionModal';
import { businessOfferVisible } from '../config/businessOffer';

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

// ⚠️ isBusiness AVANT isPro partout dans ce fichier — flags cumulatifs : un
// abonné Business porte aussi is_pro. L'ordre inverse lui affichait « Pro », le
// grant Pro et les avantages Pro, sur l'écran même censé récapituler SON plan
// (2026-08-09). onUpgradeBusiness = upsell des Pro, sous drapeau d'offre.
// userId : id du compte courant, uniquement pour la liste blanche de l'offre
// Business (businessOfferVisible). App le tient déjà (`user`) — rien de neuf
// n'est câblé ; absent, l'offre reste masquée.
export default function PlanDetailsModal({ isPro, isBusiness, lang, onClose, supabase, userId = null, onUpgradePro, onUpgradeBusiness }) {
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
  // Bascule quotas (02/09) : le plan se décrit en GESTES RÉELS lus dans
  // coin_config — plus une unité à l'écran. Le palier courant pilote les clés.
  const palierCourant = isBusiness ? 'business' : isPro ? 'pro' : 'premium';
  const qAnnonces = K[`quota_annonces_${palierCourant}`];
  const qRetouches = K[`quota_retouche_${palierCourant}`] ?? 0;
  const qRepub = K[`quota_republication_${palierCourant}`];
  const lensCost = K.price_lens_overflow;
  // Carte sombre pour les deux paliers hauts (Pro or, Business platine) ; la
  // carte Premium reste claire. Une seule variable pour toutes les bascules de
  // style, au lieu de répéter `isPro || isBusiness` à chaque propriété.
  const sombre = isPro || isBusiness;
  // ── LISTE DU PLAN COURANT (bascule quotas 02/09) — mêmes registres que les
  // cartes de ConversionModal : gestes réels, volumes lus dans coin_config,
  // le mot « plafond » banni, la cadence 45/j de l'auto jamais affichée.
  const features = [
    fr ? `${qAnnonces} annonces créées et publiées sur les 4 plateformes par mois`
       : `${qAnnonces} listings created and published on all 4 platforms a month`,
    isBusiness
      ? (fr ? 'Republications Vinted illimitées — tu republies quand tu veux, autant que tu veux'
            : 'Unlimited Vinted repostings — repost whenever you want, as much as you want')
      : (fr ? `${(qRepub ?? 0).toLocaleString('fr-FR')} republications Vinted par mois`
            : `${(qRepub ?? 0).toLocaleString('en-US')} Vinted repostings a month`),
    ...(isPro || isBusiness
      ? [fr ? 'Republication automatique — tes annonces remontent toutes seules, sans que tu y touches'
            : 'Automatic reposting — your listings bump themselves, without you touching anything']
      : []),
    ...(qRetouches > 0
      ? [fr ? `Retouche IA — ${qRetouches} photos embellies par mois` : `AI touch-up — ${qRetouches} enhanced photos a month`]
      : []),
    fr ? 'Import & export Excel de ton stock' : 'Excel import & export of your stock',
    fr ? 'Commandes vocales' : 'Voice commands',
    // Support — « Support dédié » reste RETIRÉ (09/08 : on ne vend pas ce que
    // l'app ne fait pas — aucun canal dédié, aucun interlocuteur nommé).
    // RÉVISÉ le 2026-08-27 (décision Nico) : Business à 59,99 € ne peut pas
    // afficher MOINS que le Pro à 29,99 € — il porte désormais « Support
    // prioritaire — tes demandes passent en premier ». Promesse de PRIORITÉ
    // seulement, tenable par simple tri de la boîte mail : jamais de délai
    // chiffré, de canal, de téléphone. Test isBusiness AVANT isPro : flags
    // cumulatifs, un Business porte aussi is_pro.
    isBusiness
      ? (fr ? 'Support prioritaire — tes demandes passent en premier' : 'Priority support — your requests come first')
      : isPro
        ? (fr ? 'Support prioritaire' : 'Priority support')
        : (fr ? 'Support par email' : 'Email support'),
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
            {isBusiness ? <BusinessBadge size="md" /> : isPro ? <ProBadge size="md" /> : <PremiumBadge size="md" />}
          </div>

          {/* Carte des avantages — Premium = paper/teal, Pro = dark/gold,
              Business = noir/platine (mêmes matières que les cartes de
              ConversionModal). */}
          <div style={isBusiness ? {
            background: `radial-gradient(140% 110% at 0% 0%, rgba(155,232,220,0.16), transparent 55%), radial-gradient(130% 120% at 100% 100%, rgba(242,201,138,0.14), transparent 55%), #060B09`,
            border: '1.5px solid rgba(174,233,223,0.5)', borderRadius: 22,
            padding: '18px 18px 20px', boxShadow: '0 16px 40px -14px rgba(0,0,0,0.65), 0 0 30px -8px rgba(174,233,223,0.35)',
          } : isPro ? {
            background: `radial-gradient(130% 120% at 100% 0%, rgba(232,149,109,0.28), transparent 58%), ${C.ink}`,
            border: '1.5px solid rgba(214,178,96,0.55)', borderRadius: 22,
            padding: '18px 18px 20px', boxShadow: '0 14px 34px -14px rgba(16,32,27,0.5)',
          } : {
            background: C.paper, border: `1.5px solid ${C.teal}`, borderRadius: 22,
            padding: '18px 18px 20px', boxShadow: '0 12px 30px -16px rgba(27,110,98,0.4)',
          }}>
            {/* (Le bandeau « N unités/mois » et ses équivalences sont MORTS
                le 02/09 avec la bascule quotas — la liste dit les volumes.) */}
            <Features dark={sombre} items={features} />
          </div>

          {/* Upsell Business (2026-08-09) — pour un Pro non-Business, et
              seulement si l'offre est ouverte (Apple doit avoir approuvé). */}
          {isPro && !isBusiness && businessOfferVisible(userId) && onUpgradeBusiness && (
            <>
              <div style={{
                textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: C.mute, margin: '20px 0 12px',
              }}>
                {fr ? 'Le palier ultime' : 'The ultimate tier'}
              </div>
              {/* Bascule quotas (02/09) : signature minimale fr/K/onUpgrade —
                  les anciennes props de grant n'existent plus (le crash
                  ReferenceError de la 2.4.6 ne se rejoue pas). */}
              <BusinessPlanCard fr={fr} K={K} onUpgrade={() => onUpgradeBusiness()} />
            </>
          )}

          {!isPro && onUpgradePro && (
            <>
              <div style={{
                textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: C.mute, margin: '20px 0 12px',
              }}>
                {fr ? 'Passe au niveau supérieur' : 'Take it further'}
              </div>
              {/* Bascule quotas (02/09) : signature minimale fr/K/onUpgrade —
                  les variables de grant sont mortes, et la leçon de la 2.4.6
                  (ReferenceError au rendu sur des props fantômes) tient. */}
              <ProPlanCard fr={fr} K={K} onUpgrade={() => onUpgradePro()} />
            </>
          )}

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
