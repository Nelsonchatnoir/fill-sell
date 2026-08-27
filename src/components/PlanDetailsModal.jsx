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
import PepiteIcon from './PepiteIcon';
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
  const lensCost = K.price_lens_overflow;
  const grant = isBusiness ? K.monthly_grant_business : isPro ? K.monthly_grant_pro : K.monthly_grant_premium;
  const lensScans = lensCost > 0 ? Math.floor(grant / lensCost) : 0;
  // Carte sombre pour les deux paliers hauts (Pro or, Business platine) ; la
  // carte Premium reste claire. Une seule variable pour toutes les bascules de
  // style, au lieu de répéter `isPro || isBusiness` à chaque propriété.
  const sombre = isPro || isBusiness;
  // Grille 2 axes (2026-08-04, prix 2026-08-08) : publication
  // price_per_platform Pépites/plateforme — MÊME PRIX POUR TOUS LES PALIERS —
  // retouche photos en option (0/9/32, une fois par article).
  const pubUnit = K.price_per_platform;
  const retouchMax = K.price_ia_advanced;
  // Coût de la republication — identique pour TOUS les paliers (coin_config,
  // vérifié en base le 27/08 : price_republish = 1). Affiché sur les trois.
  const repubPrice = K.price_republish;
  // Équivalence « articles publiés partout » du grant courant — même formule
  // que articlesParMois (ConversionModal) : génération + 4 plateformes.
  const coutArticle = K.price_generate + 4 * pubUnit;
  const articles = coutArticle > 0 ? Math.floor(grant / coutArticle) : 0;
  // Upsell Pro (Premium uniquement) — mêmes formules que ConversionModal.
  const grantPro = K.monthly_grant_pro;
  const grantPrem = K.monthly_grant_premium;
  const proFactor = grantPrem > 0 ? Math.round((grantPro / grantPrem) * 10) / 10 : null;
  const lensScansPro = lensCost > 0 ? Math.floor(grantPro / lensCost) : 0;

  // ── SQUELETTE COMMUN (07/08 soir, validé Nico) — mêmes rubriques, même
  // ordre, mêmes tournures que les cartes de ConversionModal :
  // stock · publication · republication · Lens · Excel · voix · support
  // (support : Business dit « Support prioritaire — tes demandes passent en
  // premier » depuis le 2026-08-27, cf. le commentaire en bas de liste).
  // Seule la VALEUR change selon le plan affiché. Toute retouche d'un
  // libellé se répercute dans les trois endroits (+ FAQ landing).
  const features = [
    fr ? 'Stock illimité' : 'Unlimited stock',
    // Grille 2026-08-08 : plus AUCUN prix conditionné au palier — la ligne
    // tarifaire est UNIQUE (coin_config), la branche isPro « publication
    // OFFERTE » est morte le jour même de sa naissance. Seule
    // l'automatisation de la republication reste un avantage Pro
    // (fonctionnalité, pas prix).
    fr ? `Publie sur Vinted, Leboncoin, eBay & Beebs (annonce générée par IA ${K.price_generate} Pépite${K.price_generate > 1 ? 's' : ''}, publication ${pubUnit} Pépite${pubUnit > 1 ? 's' : ''}/plateforme)`
       : `Publish on Vinted, Leboncoin, eBay & Beebs (AI-generated listing ${K.price_generate} Nugget${K.price_generate > 1 ? 's' : ''}, publishing ${pubUnit} Nugget${pubUnit > 1 ? 's' : ''}/platform)`,
    // Coût de la republication AFFICHÉ sur les trois paliers (2026-08-27) :
    // price_republish est identique pour tous — le taire sur Business
    // laissait croire à une republication gratuite ou illimitée. Seule
    // l'AUTOMATISATION distingue les paliers (Pro : opt-in ; Business :
    // automatique — même moteur É6, réel en prod), jamais le prix.
    // Squelette UNIFORME (27/08 soir, décision Nico) : « Republication Vinted
    // <mode> — N Pépite(s) par annonce » sur les trois paliers, queues
    // supprimées — seul le MODE change, car c'est la vraie différence.
    isBusiness
      ? (fr ? `Republication Vinted automatique — ${repubPrice} Pépite${repubPrice > 1 ? 's' : ''} par annonce`
            : `Automatic Vinted reposting — ${repubPrice} Nugget${repubPrice > 1 ? 's' : ''} per listing`)
      : isPro
        ? (fr ? `Republication Vinted automatique si tu l'actives — ${repubPrice} Pépite${repubPrice > 1 ? 's' : ''} par annonce`
              : `Automatic Vinted reposting if you turn it on — ${repubPrice} Nugget${repubPrice > 1 ? 's' : ''} per listing`)
        : (fr ? `Republication Vinted en un clic — ${repubPrice} Pépite${repubPrice > 1 ? 's' : ''} par annonce`
              : `One-tap Vinted reposting — ${repubPrice} Nugget${repubPrice > 1 ? 's' : ''} per listing`),
    // Prix unitaire SEUL (2026-08-27) : « Environ N analyses par mois » ici,
    // face aux « ≈ N articles » du bandeau de grant, se lisait comme DEUX
    // quotas cumulables. Les équivalences vivent ENSEMBLE sous le grant,
    // reliées par OU — une réserve unique, des exemples alternatifs.
    fr ? `Analyses Lens — ${lensCost} Pépites l'analyse`
       : `Lens scans — ${lensCost} Nuggets each`,
    fr ? 'Import & export Excel de ton stock' : 'Excel import & export of your stock',
    fr ? 'Commandes vocales illimitées' : 'Unlimited voice commands',
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
            <div style={isBusiness ? {
              background: 'rgba(155,232,220,0.10)',
              border: '1px solid rgba(174,233,223,0.28)', borderRadius: 12, padding: '9px 12px', marginBottom: 14,
            } : isPro ? {
              background: 'rgba(232,149,109,0.14)',
              border: '1px solid rgba(214,178,96,0.3)', borderRadius: 12, padding: '9px 12px', marginBottom: 14,
            } : {
              background: 'rgba(47,158,144,0.10)',
              border: '1px solid rgba(47,158,144,0.22)', borderRadius: 12, padding: '9px 12px', marginBottom: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <PepiteIcon size={18} />
                <span style={isBusiness ? {
                  fontSize: 12.5, fontWeight: 700,
                  background: 'linear-gradient(120deg,#F4FFFD,#9BE8DC 55%,#F2C98A)',
                  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                } : { fontSize: 12.5, fontWeight: 700, color: isPro ? '#F2C98A' : C.tealDeep }}>
                  {/* « N Pépites/mois » — même formulation que les cartes de
                      ConversionModal (uniformisation 27/08 soir). */}
                  {fr ? `${grant} Pépites/mois` : `${grant} Nuggets/mo`}
                </span>
              </div>
              {/* Équivalences ALTERNATIVES d'une réserve unique (27/08) —
                  mêmes mots que les cartes de ConversionModal. */}
              <div style={{
                fontSize: 10.5, fontWeight: 600, marginTop: 4, lineHeight: 1.45,
                color: isBusiness ? 'rgba(246,245,241,0.75)' : isPro ? 'rgba(242,201,138,0.85)' : C.tealDeep,
                ...(sombre || isBusiness ? {} : { opacity: 0.85 }),
              }}>
                {fr ? `Une seule réserve pour tout — par exemple ≈ ${articles} articles publiés partout OU ≈ ${lensScans} analyses Lens.`
                    : `One single pool for everything — e.g. ≈ ${articles} items listed everywhere OR ≈ ${lensScans} Lens scans.`}
              </div>
            </div>
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
              <BusinessPlanCard
                fr={fr} grantBusiness={K.monthly_grant_business} lensCost={lensCost}
                lensScans={lensCost > 0 ? Math.floor(K.monthly_grant_business / lensCost) : 0}
                articles={coutArticle > 0 ? Math.floor(K.monthly_grant_business / coutArticle) : 0}
                repubPrice={repubPrice}
                pubUnit={pubUnit} genPrice={K.price_generate}
                onUpgrade={() => onUpgradeBusiness()}
              />
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
              {/* pubUnit/retouchMax/genPrice = la signature RÉELLE de
                  ProPlanCard. L'appel passait pubMin/pubMax, variables
                  inexistantes ici depuis la grille 2 axes → ReferenceError au
                  rendu : la modale « mon plan » CRASHAIT pour tout Premium
                  non-Pro (bug embarqué dans l'OTA 2.4.6, corrigé 08/08). */}
              <ProPlanCard
                fr={fr} grantPro={grantPro} lensCost={lensCost} lensScans={lensScansPro}
                articles={coutArticle > 0 ? Math.floor(grantPro / coutArticle) : 0}
                repubPrice={repubPrice}
                proFactor={proFactor} showFactor
                pubUnit={pubUnit} retouchMax={retouchMax} genPrice={K.price_generate}
                onUpgrade={() => onUpgradePro()}
              />
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
