import { useEffect, useRef, useState } from 'react';
// (PepiteIcon / PepiteAmount / PACKS : imports morts le 02/09 soir — plus une
// Pépite ne s'affiche dans cette modale.)
import PlanBadge, { PremiumBadge, ProBadge, BusinessBadge } from './PlanBadge';
import { supabase } from '../lib/supabase';
import { businessOfferVisible } from '../config/businessOffer';

// ConversionModal — modale de conversion unique (upsell Pépites / Premium / Pro).
// Design « Conversion Modals » (Claude Design, projet e47b36df) intégré le
// 2026-07-14, avec CORRECTION des valeurs : la BASE fait autorité, jamais le
// design. Divergences relevées et corrigées (vérifiées le 2026-07-14) :
//   • Pépites/mois Pro : écart affichage/base résolu le 2026-07-23 — tout se
//     lit en base désormais. Éprouvé le 2026-07-28 : les grants sont passés à
//     300/800 puis SONT REVENUS à 150/600 le même jour, sans qu'une seule
//     ligne d'affichage ait besoin de changer — seule coin_config a bougé.
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
//   CAS 3 · Free → Premium + Pro             (vue comparative, cartes empilées)
//   CAS 4 · Premium → Pro                    (isPremium && !isPro, carte Pro seule)
// Depuis 2026-07-22 : le CAS 3 montre les DEUX cartes d'emblée (PlansStack), et
// le bouton d'upsell des CAS 1/2 bascule vers cette même vue (état `view`) au
// lieu de partir en checkout — un checkout ne part QUE d'un CTA de carte, après
// présentation complète du plan.

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
// base le 2026-07-28 ; si elles divergent un jour, c'est la base qui a raison.
// Exporté pour PlanDetailsModal (modale « mon plan » du badge header), qui lit
// coin_config avec le même repli.
export const COIN_CONFIG_FALLBACK = {
  // ── Bascule quotas (02/09 soir) : les cartes lisent les QUOTAS par geste,
  // plus les prix en Pépites. Même contrat que toujours : coin_config fait
  // autorité, ces valeurs ne servent qu'en cas d'échec réseau.
  quota_annonces_free: 5, quota_annonces_premium: 40,
  quota_annonces_pro: 120, quota_annonces_business: 300,
  // (quota_scan_* retirés le 02/09 soir — fusion scans+annonces : les clés
  // restent en base à 0 pour le retour arrière, plus rien ne les lit ici.)
  quota_republication_premium: 1500, quota_republication_pro: 5000,
  republication_avie_free: 50,
  quota_retouche_free: 0, quota_retouche_premium: 5,
  quota_retouche_pro: 20, quota_retouche_business: 50,
  // Grille du 2026-08-08 — MÊME PRIX POUR TOUS LES PALIERS : photos (par
  // article) + 1 Pépite/plateforme + 6 Pépites la génération d'annonce.
  price_original: 0,
  price_ia_light: 9,
  price_ia_advanced: 32,
  price_per_platform: 1,
  price_generate: 6,
  // Repli d'AFFICHAGE (2026-08-27) : coin_config.price_republish fait
  // autorité (vérifié en base = 1, identique pour tous les paliers) — cette
  // valeur ne sert qu'en cas d'échec réseau, comme les autres.
  price_republish: 1,
  price_lens_overflow: 6,
  monthly_grant_free: 50,
  monthly_grant_premium: 400,
  monthly_grant_pro: 1200,
  // Business (2026-08-08, migration 20260808213500) — même statut de REPLI que
  // les deux autres : coin_config fait autorité, cette valeur ne sert qu'en cas
  // d'échec réseau de la lecture.
  monthly_grant_business: 3000,
};

// L'ex-DISPLAY_GRANT_PRO (un grant Pro affiché en avance sur la base) est mort
// le 2026-07-23 : le grant Pro se lit en base comme le Premium. Les valeurs
// ci-dessus ne sont qu'un REPLI réseau — la base fait toujours autorité, et
// c'est ce qui a permis de passer à 300/800 le 2026-07-28 (20260728180000)
// PUIS de revenir à 150/600 le soir même (20260728230000) par simple migration
// de coin_config, sans redéployer une ligne de front.
//
// POURQUOI 150/600 et pas plus — logique à ne pas remettre en cause : un pack
// de 100 Pépites se vend 5 €, donc une Pépite vaut 5 centimes. À 300, un
// Premium à 12,99 € offrirait 15 € de Pépites, soit plus que l'abonnement
// lui-même, et l'inventaire illimité deviendrait un cadeau. Les Pépites
// incluses doivent valoir MOINS que l'abonnement : la différence, c'est le
// prix de la fonctionnalité. À 300, Pro n'avait de surcroît plus rien à
// vendre face à Premium.

// Prix des abonnements — ils vivent chez Stripe / Apple / Google, pas en base.
// Vérifiés côté Stripe le 2026-07-14 : « Standard Plan » 1299 c, « FillSell Pro
// Mensuel » 2999 c. Plus AUCUN essai gratuit (2026-07-22) : trial_period_days
// retiré de create-checkout-session ; les offres d'introduction Apple / Google
// éventuelles se désactivent à la main dans ASC / Play Console, pas par code.
// Business 59,99 €/mois. ⚠️ Ce montant est EN DUR et vu par tout le monde : il
// n'est vrai que si les trois canaux facturent bien 59,99 €. Stripe : oui
// (price_1U2Wh0QZRA77vrWJyWLOy6iB, vérifié le 10/08). Apple : oui. Google :
// PAS ENCORE — relevé du 10/08 sur le base plan business-monthly, Irlande et
// Italie sont à 74,99 EUR (France re-corrigée à 59,99 € le soir même). Tant
// que ces deux lignes ne sont pas alignées, l'offre reste masquée — cf.
// src/config/businessOffer.js, qui porte le relevé complet et les conditions.
const PLAN_PRICES = {
  premium:  { price: '12,99 €' },
  pro:      { price: '29,99 €' },
  business: { price: '59,99 €' },
};

// (Bascule quotas 02/09 : articlesParMois / coutArticleComplet — les
// équivalences « ≈ N articles » calculées depuis les prix en Pépites — sont
// MORTS avec les CAS 1/2 et les bandeaux de grant. Eyebrow aussi : il ne
// servait qu'aux écrans « Pépites insuffisantes ».)

// ── Blocs (au niveau module : jamais recréés à chaque rendu) ─────────────────

function Handle() {
  return <div style={{ width: 40, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 16px' }} />;
}

function Title({ children }) {
  return (
    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', color: C.ink, marginBottom: 14 }}>
      {children}
    </div>
  );
}

// (Features — la liste à coches générique — est morte le 02/09 soir :
// les cartes portent désormais LignesDiff, trois lignes fixes coche/croix.
// Son style de rangée vit dans LignesDiff, à l'identique pour les coches.)

// (BalanceCard — la jauge de solde — et PackList — les 4 packs de Pépites —
// sont MORTS le 02/09 soir avec la bascule quotas : plus de solde à jauger,
// plus de packs à vendre. CoinStoreModal/coinPacks restent en place côté
// fichiers, DÉBRANCHÉS — un achat en vol doit encore aboutir côté webhooks.)

// ── Bloc commun « Dans tous les forfaits » (2026-09-02) ──────────────────────
// Restructuration de lisibilité : les SEPT lignes quasi identiques répétées
// sur les trois cartes en sortent — ce qui est COMMUN s'affiche UNE fois ici,
// les cartes ne gardent que ce qui les distingue (grant, republication,
// support). Le détail du tarif à la Pépite sort aussi des cartes : une seule
// ligne, ici, lue dans coin_config comme tout le reste (jamais en dur).
// Exporté pour un éventuel réemploi (PlanDetailsModal) — même source unique
// que les cartes.
export function ToutesOffresBlock({ fr }) {
  // Bascule quotas (02/09 soir) : la ligne de tarif en Pépites est MORTE, et
  // le bloc dit ce que TOUS les forfaits font (liste de la décision Nico) —
  // import du dressing, 4 plateformes, voix, retrait auto après vente.
  // Il vit AU-DESSUS des cartes : ce que fait le produit se lit avant les prix.
  const items = [
    fr ? 'Import de ton dressing Vinted' : 'Import your Vinted wardrobe',
    fr ? 'Publication sur Vinted, Leboncoin, eBay & Beebs' : 'Publishing on Vinted, Leboncoin, eBay & Beebs',
    fr ? 'Commandes vocales' : 'Voice commands',
    fr ? 'Retrait automatique partout après une vente' : 'Automatic removal everywhere after a sale',
  ];
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.faint, marginBottom: 8 }}>
        {fr ? 'Dans tous les forfaits' : 'In every plan'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 12px' }}>
        {items.map((t, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: C.mute2 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.tealDeep} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            {t}
          </span>
        ))}
      </div>
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

// ── Les TROIS lignes différenciantes (2026-09-02 soir) ──────────────────────
// Chaque carte porte les MÊMES trois lignes, dans le MÊME ordre, avec coche
// ou croix : republication manuelle · republication automatique · support.
// C'est la comparaison en balayant une colonne qui doit sauter aux yeux.
// 🚨 RÈGLES DE FORMULATION (décision Nico, 02/09 soir) :
//   · le seul axe à comprendre est TOI-MÊME contre TOUT SEUL ;
//   · le mot « plafond » est BANNI de la carte Premium (l'ancienne ligne
//     « sans plafond quotidien » faisait lire Premium comme MOINS limité que
//     le Pro « jusqu'à 45/jour » — sens inversé) ;
//   · Pro et Business portent EXACTEMENT la même phrase de republication —
//     jamais « si tu l'actives » sur l'un et pas sur l'autre ;
//   · les croix n'existent QUE sur ces trois lignes (pas de mur de croix) :
//     la croix informe — c'est elle qui rend visible ce qui MANQUE, dont la
//     republication automatique sur la carte Premium, le levier de
//     conversion principal.
// L'automatique reste Pro/Business : verrou extension plan_non_pro
// (background.js) aligné avec la décision — ne pas promettre au-delà.
// ── BASCULE QUOTAS (02/09 soir) : les cartes parlent en GESTES RÉELS ────────
// Plus une Pépite nulle part. Cinq lignes par carte, même ordre, coches
// d'abord et croix en bas (tri STABLE — l'ordre relatif dans chaque groupe ne
// bouge pas). Les volumes se lisent dans coin_config (K), jamais en dur — les
// quotas sont ajustables sans OTA. Le mot « plafond » reste banni des cartes ;
// registre « toi-même vs tout seul » conservé sur la republication. La
// cadence technique 45/jour de l'auto (anti-bannissement) n'est PLUS affichée
// nulle part : les cartes annoncent le volume mensuel, pas la cadence.
function lignesDiff(fr, palier, K) {
  const paye = palier !== 'free';
  const auto = palier === 'pro' || palier === 'business';
  const annonces = K[`quota_annonces_${palier}`];
  const retouches = K[`quota_retouche_${palier}`] ?? 0;
  const repubTexte = palier === 'free'
    ? (fr ? `${K.republication_avie_free ?? 50} republications Vinted offertes, à vie`
          : `${K.republication_avie_free ?? 50} Vinted repostings included, for life`)
    : palier === 'business'
      ? (fr ? 'Republications Vinted illimitées — tu republies quand tu veux, autant que tu veux'
            : 'Unlimited Vinted repostings — repost whenever you want, as much as you want')
      : (fr ? `${(K[`quota_republication_${palier}`] ?? 0).toLocaleString('fr-FR')} republications Vinted par mois`
            : `${(K[`quota_republication_${palier}`] ?? 0).toLocaleString('en-US')} Vinted repostings a month`);
  return [
    {
      ok: true,
      texte: fr
        ? `${annonces} annonces créées et publiées sur les 4 plateformes par mois`
        : `${annonces} listings created and published on all 4 platforms a month`,
    },
    { ok: true, texte: repubTexte },
    {
      ok: auto,
      texte: auto
        ? (fr ? 'Republication automatique — tes annonces remontent toutes seules, sans que tu y touches'
              : 'Automatic reposting — your listings bump themselves, without you touching anything')
        : (fr ? 'Republication automatique' : 'Automatic reposting'),
    },
    {
      ok: retouches > 0,
      texte: retouches > 0
        ? (fr ? `Retouche IA — ${retouches} photos embellies par mois` : `AI touch-up — ${retouches} enhanced photos a month`)
        : (fr ? 'Retouche IA' : 'AI touch-up'),
    },
    {
      ok: paye,
      texte: palier === 'premium'
        ? (fr ? 'Support par email' : 'Email support')
        : paye
          ? (fr ? 'Support prioritaire' : 'Priority support')
          : (fr ? 'Support' : 'Support'),
    },
  ].sort((a, b) => Number(b.ok) - Number(a.ok));
}

function LignesDiff({ fr, palier, dark, K = COIN_CONFIG_FALLBACK }) {
  const okBg   = dark ? 'rgba(232,149,109,0.22)' : 'rgba(47,158,144,0.15)';
  const okInk  = dark ? '#F2C98A' : C.tealDeep;
  const koBg   = dark ? 'rgba(246,245,241,0.10)' : 'rgba(163,157,142,0.14)';
  const koInk  = dark ? 'rgba(246,245,241,0.45)' : C.faint;
  const okTxt  = dark ? C.paper : C.ink;
  const koTxt  = dark ? 'rgba(246,245,241,0.55)' : C.mute;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 18 }}>
      {lignesDiff(fr, palier, K).map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <span style={{
            flexShrink: 0, width: 17, height: 17, borderRadius: '50%', marginTop: 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: l.ok ? okBg : koBg,
          }}>
            {l.ok ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={okInk} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            ) : (
              /* Croix informative, jamais punitive : trait fin, couleur muette. */
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={koInk} strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            )}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, color: l.ok ? okTxt : koTxt }}>{l.texte}</span>
        </div>
      ))}
    </div>
  );
}

// Carte Free (2026-09-02 soir) — le POINT DE DÉPART, pas une offre : fond
// sobre, pas de CTA d'achat. Bascule quotas : plus de bandeau de grant, les
// cinq lignes de gestes disent tout (5 annonces, 50 republications à vie…).
function FreePlanCard({ fr, estMonPlan, K }) {
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 22, padding: '20px 18px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: C.mute2,
            background: C.canvas, border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 10px',
          }}>
            Free
          </span>
          {estMonPlan && (
            <span style={{ fontSize: 11, fontWeight: 600, color: C.mute }}>
              {fr ? 'ton forfait actuel' : 'your current plan'}
            </span>
          )}
        </span>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: C.mute2, lineHeight: 1 }}>0 €</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.mute, marginTop: 2 }}>{fr ? '/mois' : '/mo'}</div>
        </div>
      </div>
      <LignesDiff fr={fr} palier="free" K={K} />
    </div>
  );
}

// Carte Premium (CAS 3) — badge repris de PlanBadge, jamais recréé.
// Bascule quotas (02/09 soir) : le bandeau de grant et ses équivalences
// « ≈ N articles OU M analyses » (27/08) sont MORTS — les Pépites ont disparu
// de l'expérience, les cinq lignes de gestes portent tous les volumes.
// (Props historiques conservées pour les hôtes — seules fr/K/onUpgrade servent.)
function PremiumPlanCard({ fr, K, grantPrem, lensCost, lensScans, articles, genPrice, pubUnit, repubPrice, onUpgrade }) {
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
      {/* Les cinq lignes de gestes (bascule 02/09) — cf. lignesDiff : mêmes
          lignes, même ordre sur les QUATRE cartes ; la croix « Republication
          automatique » reste le levier visible vers Pro. */}
      <LignesDiff fr={fr} palier="premium" K={K} />
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
      </button>
    </div>
  );
}

// Carte Pro (CAS 4) — fond sombre, badge ProBadge.
// ⚠️ Aucune promesse « Lens illimité » : Lens est payant en Pépites sur TOUS les
// paliers. On annonce ce que le grant permet réellement (calculé).
// Exportée pour PlanDetailsModal (2026-07-24) : la modale du badge la réutilise
// comme upsell Pro pour les Premium — source UNIQUE de ce que Pro promet.
export function ProPlanCard({ fr, K, grantPro, lensCost, lensScans, articles, proFactor, showFactor, genPrice, pubUnit, repubPrice, onUpgrade }) {
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
      {/* Bascule quotas (02/09 soir) : bandeau de grant et équivalences MORTS
          — les cinq lignes de gestes portent les volumes. La phrase de
          republication automatique reste STRICTEMENT identique à Business. */}
      <LignesDiff fr={fr} palier="pro" dark K={K} />
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

// Carte Business (CAS 5 du design « Conversion Modals ») — fond noir, matière
// platine, badge BusinessBadge. Le palier ultime.
// ⚠️ MÊME SQUELETTE que les deux autres cartes (stock · publication ·
// republication · Lens · Excel · voix) : l'utilisateur lit les trois cartes
// ligne à ligne. Ce qui CHANGE réellement en Business, et rien d'autre :
//   · le grant (3000, affiché au-dessus, avec ses équivalences ALTERNATIVES :
//     ≈ 300 articles publiés partout OU ≈ 500 analyses Lens — jamais les deux,
//     cf. le commentaire d'équivalences sur PremiumPlanCard) ;
//   · la republication Vinted AUTOMATIQUE — livrée, pas une promesse : c'est
//     le même moteur É6 que Pro (background.js), déjà en production. Son COÛT
//     est affiché comme partout (2026-08-27) : price_republish est identique
//     pour tous les paliers, le taire ici laissait croire à de l'illimité.
// ⚠️ RETIRÉ le 2026-08-09 (décision Nico : on ne vend pas ce que l'app ne fait
// pas) — ne PAS réécrire tant que ce n'est pas codé ET en prod :
//   · « File de publication prioritaire » : les jobs sortent FIFO, aucun tri
//     par palier nulle part (cross_post_jobs, background.js) ;
//   · « Support dédié — un interlocuteur » : aucun canal dédié n'existe.
// Support (RÉVISÉ 2026-08-27, décision Nico) : Business à 59,99 € ne peut pas
// afficher MOINS que le Pro à 29,99 € — il porte « Support prioritaire — tes
// demandes passent en premier ». Promesse de PRIORITÉ seulement, tenable par
// simple tri de la boîte mail : JAMAIS de délai chiffré, de canal dédié, de
// téléphone ni d'interlocuteur nommé (le garde-fou du 09/08 reste vrai).
// ⚠️ AUCUNE mention de « 8 photos par scan » : l'idée est abandonnée depuis le
// 2026-08-09, tous les paliers sont identiques sur ce point.
// Exportée pour PlanDetailsModal (upsell des Pro), comme ProPlanCard.
export function BusinessPlanCard({ fr, K, grantBusiness, lensCost, lensScans, articles, genPrice, pubUnit, repubPrice, onUpgrade }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: `radial-gradient(140% 110% at 0% 0%, rgba(155,232,220,0.16), transparent 55%), radial-gradient(130% 120% at 100% 100%, rgba(242,201,138,0.14), transparent 55%), #060B09`,
      border: '1.5px solid rgba(174,233,223,0.5)', borderRadius: 22,
      padding: '20px 18px 18px',
      boxShadow: '0 16px 40px -14px rgba(0,0,0,0.65), 0 0 30px -8px rgba(174,233,223,0.35)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <BusinessBadge />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: C.paper, lineHeight: 1 }}>{PLAN_PRICES.business.price}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(246,245,241,0.6)', marginTop: 2 }}>{fr ? '/mois' : '/mo'}</div>
        </div>
      </div>
      {/* Bascule quotas (02/09 soir) : bandeau de grant et équivalences MORTS
          — les cinq lignes de gestes portent les volumes, dont la
          republication ILLIMITÉE, le vrai différenciateur Business. */}
      {/* Lignes différenciantes (02/09 soir, cf. lignesDiff) — MÊMES phrases
          que Pro sur les trois lignes, y compris le support (« prioritaire »,
          promesse de priorité seulement, garde-fou du 09/08 inchangé) : seul
          le volume de Pépites distingue Business, et il est au-dessus. */}
      <LignesDiff fr={fr} palier="business" dark K={K} />
      <button
        onClick={() => onUpgrade('business')}
        style={{
          width: '100%', padding: 15, border: 'none', borderRadius: 14,
          background: 'linear-gradient(120deg,#F4FFFD,#9BE8DC 55%,#F2C98A)', color: '#060B09',
          fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          boxShadow: '0 10px 26px -8px rgba(174,233,223,0.55)',
        }}
      >
        {fr ? 'Passer Business' : 'Go Business'}
      </button>
    </div>
  );
}

// Vue comparative (2026-07-22) — les cartes des plans achetables, EMPILÉES
// (la Sheet fait maxWidth 480, mobile-first : pas de côte-à-côte). Un Free voit
// Premium PUIS Pro ; un Premium n'y voit que Pro (sa propre carte ne vend
// rien). Chaque CTA de carte part en checkout : c'est légitime ICI SEULEMENT,
// parce que le détail complet du plan est affiché au-dessus du bouton — l'ancien
// lien « Découvre Pro → » qui partait en checkout sans présentation est mort
// avec cette vue.
// `tiers` = les paliers RÉELLEMENT vendables à CET utilisateur, déjà filtrés
// par la modale (cf. `sellable`) : plus aucun recoupement isPremium/isPro ici,
// c'était la porte ouverte à deux vérités divergentes sur « qui voit quoi ».
function PlansStack({ fr, tiers, K, onUpgrade, showFree = false }) {
  const showPremium = tiers.includes('premium');
  const showPro = tiers.includes('pro');
  const showBusiness = tiers.includes('business');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Le Free ouvre la pile QUAND le lecteur est en Free (02/09 soir) :
          c'est son point de départ — il voit ce qu'il a, puis ce que payer
          change, ligne à ligne. Jamais montré aux payants (rien à y lire). */}
      {showFree && <FreePlanCard fr={fr} K={K} estMonPlan />}
      {showPremium && <PremiumPlanCard fr={fr} K={K} onUpgrade={onUpgrade} />}
      {showPro && <ProPlanCard fr={fr} K={K} onUpgrade={onUpgrade} />}
      {showBusiness && <BusinessPlanCard fr={fr} K={K} onUpgrade={onUpgrade} />}
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
  isBusiness   = false,
  // Id du compte courant — SEUL usage : la liste blanche de l'offre Business
  // (businessOfferVisible). Les deux hôtes le tiennent déjà (App : `user`,
  // ListingPreviewScreen : prop `userId`), aucun nouveau chemin de données.
  // Absent → l'offre reste masquée, cf. src/config/businessOffer.js.
  userId       = null,
  itemCount    = null,
  // Repli seulement — l'hôte passe la valeur lue dans coin_config
  // (free_stock_limit, source unique de la limite Free depuis le 05/08).
  stockLimit   = 200,
  coinBalance  = null,             // solde réel (coin_wallets), fourni par l'appelant
  coinPrice    = null,             // coût réel de l'action bloquée (réponse serveur)
  onUseCoins   = null,             // ouvre CoinStoreModal (chemin d'achat existant)
  // Point d'entrée EXACT (même vocabulaire que le tunnel d'App.jsx) — sert la
  // télémétrie de la modale elle-même, jamais l'affichage.
  origine      = null,
  // trigger 'republish_cap' UNIQUEMENT : { plafond, restantes } renvoyés par
  // le refus serveur plafond_republication_free (50 à vie, bascule 02/09).
  plafondRepub = null,
  // trigger 'quota_geste' UNIQUEMENT : { geste: 'annonces'|'retouches',
  // plafond, consommes } — le refus serveur quota_*_atteint relayé par l'hôte.
  // ('scans' a disparu le 02/09 soir — fusion scans+annonces, un seul geste.)
  quotaInfo    = null,
}) {
  const fr = lang !== 'en';
  const [cfg, setCfg] = useState(null);
  // Vue interne : 'entry' = écran du cas d'entrée (packs de Pépites en CAS 1/2) ;
  // 'plans' = vue comparative des abonnements. Depuis les CAS 1/2, le bouton
  // d'upsell BASCULE ici au lieu de partir en checkout — jamais de checkout
  // sans avoir vu la carte complète du plan (bug « Découvre Pro » 2026-07-22).
  const [view, setView] = useState('entry');
  useEffect(() => { if (isOpen) setView('entry'); }, [isOpen]);

  // ══ Télémétrie de la modale (2026-09-02) — le trou CTA → checkout ══════════
  // Mesuré (audit 02/09) : 617 comptes ont cliqué un CTA premium, 30 seulement
  // ont un checkout_open — et AUCUN event entre les deux. Ces trois events
  // rendent la fuite visible : ouverture (avec origine), choix d'un palier,
  // fermeture sans checkout. Même mécanique best-effort qu'onboarding_choice :
  // try/catch, jamais bloquant, zéro changement visuel. Un échec d'écriture ne
  // doit JAMAIS gêner le parcours de paiement.
  const paliersRef = useRef([]);        // derniers paliers affichés (pour l'abandon)
  const palierCliqueRef = useRef(false); // un CTA de carte a-t-il été cliqué ?
  const logModale = (feature, metadata = {}) => {
    if (!userId) return;
    try {
      supabase.from('usage_logs')
        .insert({ user_id: userId, feature, metadata })
        .then(({ error }) => { if (error) console.warn(`[offres] ${feature} non journalisé :`, error.message); });
    } catch (e) { console.warn(`[offres] ${feature} non journalisé :`, e?.message ?? e); }
  };
  useEffect(() => {
    if (!isOpen) return;
    palierCliqueRef.current = false;
    logModale('offers_modal_open', { origine: origine ?? 'non_precisee', trigger });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  // Choix d'un palier : trace posée AVANT de passer la main au checkout — le
  // canal (Stripe/IAP) et checkout_open restent journalisés par l'hôte.
  const choisirPalier = (tier) => {
    palierCliqueRef.current = true;
    logModale('offers_modal_tier_click', { tier, origine: origine ?? 'non_precisee', trigger, view });
    onUpgrade(tier);
  };
  // TOUTES les sorties (backdrop, Escape, « Non merci ») passent ici : une
  // fermeture sans checkout est un abandon — avec les paliers qui étaient
  // affichés, pour savoir DEVANT QUOI l'utilisateur est parti.
  const fermer = () => {
    if (!palierCliqueRef.current) {
      logModale('offers_modal_abandon', {
        origine: origine ?? 'non_precisee', trigger, view,
        paliers: paliersRef.current.join(','),
      });
    }
    onClose();
  };

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
    const onKey = (e) => { if (e.key === 'Escape') fermer(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const K = cfg || COIN_CONFIG_FALLBACK;
  // Bascule quotas (02/09 soir) : les CAS 1/2 « Pépites insuffisantes » sont
  // MORTS — le serveur ne peut plus émettre insufficient_coins (prix à 0), les
  // props coinBalance/coinPrice/onUseCoins ne sont plus lues (conservées pour
  // les hôtes pas encore nettoyés). La jauge de solde, la liste de packs et
  // les grants n'existent plus dans cette modale.

  // ── Échelle des paliers (2026-08-09) ──────────────────────────────────────
  // Remplace l'ancien `isPro ? [] : isPremium ? ['pro'] : …`, qui codait en dur
  // « Pro = sommet » : un Pro s'y voyait dire « tu es déjà au maximum » et
  // Business n'était vendable NULLE PART dans l'UI.
  // Les flags étant CUMULATIFS (un Business porte aussi is_pro et is_premium),
  // le rang courant se lit du HAUT vers le bas, et n'est vendable que ce qui
  // est STRICTEMENT au-dessus.
  const RANG = { premium: 1, pro: 2, business: 3 };
  const rangCourant = isBusiness ? 3 : isPro ? 2 : isPremium ? 1 : 0;
  // 'business' n'est dans les targetTiers d'aucun appelant (ils sont tous
  // antérieurs au palier) : on l'ajoute ICI, sous drapeau, plutôt que de
  // toucher les 6 sites d'appel de ListingPreviewScreen — et le drapeau baissé
  // le retire, d'où qu'il vienne. Cf. src/config/businessOffer.js.
  const proposables = businessOfferVisible(userId)
    ? [...new Set([...targetTiers, 'business'])]
    : targetTiers.filter(t => t !== 'business');
  const sellable = proposables
    .filter(t => RANG[t] > rangCourant)
    .sort((a, b) => RANG[a] - RANG[b]);
  paliersRef.current = sellable; // pour l'event d'abandon (paliers affichés)

  // (CAS 1/2 « Pépites insuffisantes » et leur vue 'plans' : SUPPRIMÉS le
  // 02/09 soir — insufficient_coins ne peut plus exister, cf. bascule quotas.)

  // ══ CAS 5 — Pro → Business (2026-08-09) ════════════════════════════════════
  // Placé AVANT le CAS 4 : un Pro porte aussi is_premium (flags cumulatifs), il
  // faut donc trancher du haut vers le bas. La garde `sellable.includes` porte
  // le drapeau de masquage — offre coupée, un Pro retombe sur « au maximum ».
  if (isPro && sellable.includes('business')) {
    return (
      <Sheet onClose={fermer}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12,
          background: C.paper, border: `1px solid ${C.border}`, borderRadius: 999,
          padding: '5px 10px 5px 5px',
        }}>
          <PlanBadge isPremium={isPremium} isPro={isPro} isBusiness={isBusiness} />
          <span style={{ fontSize: 11, fontWeight: 600, color: C.mute }}>
            {fr ? 'ton plan actuel' : 'your current plan'}
          </span>
        </div>
        <Title>{fr ? 'Le sommet. Zéro limite.' : 'The top. No limits.'}</Title>
        <ToutesOffresBlock fr={fr} />
        <BusinessPlanCard fr={fr} K={K} onUpgrade={choisirPalier} />
        <Dismiss onClose={fermer} label={fr ? 'Rester en Pro' : 'Stay on Pro'} />
      </Sheet>
    );
  }

  // ══ CAS 4 — Premium → Pro (garde stricte : Premium réel et non-Pro) ════════
  // PlansStack et non plus la carte Pro seule : quand l'offre Business est
  // ouverte, un Premium voit Pro PUIS Business — le palier ultime ne doit pas
  // être invisible à qui a le plus de chances de le prendre.
  if (isPremium && !isPro && sellable.length > 0) {
    return (
      <Sheet onClose={fermer}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12,
          background: C.paper, border: `1px solid ${C.border}`, borderRadius: 999,
          padding: '5px 10px 5px 5px',
        }}>
          <PlanBadge isPremium={isPremium} isPro={isPro} isBusiness={isBusiness} />
          <span style={{ fontSize: 11, fontWeight: 600, color: C.mute }}>
            {fr ? 'ton plan actuel' : 'your current plan'}
          </span>
        </div>
        <Title>{fr ? 'Passe au volume supérieur.' : 'Move up a gear.'}</Title>
        <ToutesOffresBlock fr={fr} />
        <PlansStack fr={fr} tiers={sellable} K={K} onUpgrade={choisirPalier} />
        <Dismiss onClose={fermer} label={fr ? 'Rester en Premium' : 'Stay on Premium'} />
      </Sheet>
    );
  }

  // ══ Plus rien à vendre ═════════════════════════════════════════════════════
  // Ne se dit QUE d'un utilisateur sans palier au-dessus — c'est-à-dire un
  // Business, ou un Pro tant que l'offre Business est masquée. (Les packs de
  // Pépites ne se vendent plus — bascule 02/09.)
  if (sellable.length === 0) {
    return (
      <Sheet onClose={fermer}>
        <Title>{fr ? 'Tu es déjà au maximum.' : "You're already on the top plan."}</Title>
        <Dismiss onClose={fermer} label={fr ? 'Fermer' : 'Close'} />
      </Sheet>
    );
  }

  // ══ CAS 3 — Free → Premium ═════════════════════════════════════════════════
  // Variante 'republish_cap' (bascule 02/09) : le serveur a refusé une
  // republication avec plafond_republication_free — en Free les 50
  // republications OFFERTES À VIE sont épuisées. La modale dit le FAIT, puis
  // ce que Premium change, puis les cartes. Ton informatif, aucun compte à
  // rebours ; elle s'ouvre à CHAQUE tentative refusée.
  // Variante 'republish_lot' : un Free a tapé « Republier en lot » — geste
  // réservé aux payants, rien consommé. Même structure, même registre.
  // Variante 'quota_geste' (bascule 02/09) : un quota du cycle est atteint
  // (annonces / retouches, prop quotaInfo {geste, plafond, consommes}) — le
  // fait, le déblocage, les cartes. Le geste 'scans' n'existe plus (fusion
  // scans+annonces du 02/09 soir : UN compteur, UN chiffre) — un scan refusé
  // arrive en geste 'annonces'.
  const stockFull = trigger === 'stock' && itemCount != null;
  const repubCap = trigger === 'republish_cap';
  const repubLot = trigger === 'republish_lot';
  const quotaCas = trigger === 'quota_geste' ? (quotaInfo ?? {}) : null;
  const repubPremium = (K.quota_republication_premium ?? 1500).toLocaleString(fr ? 'fr-FR' : 'en-US');
  return (
    <Sheet onClose={fermer}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12,
        background: C.paper, border: `1px solid ${C.border}`, borderRadius: 999,
        padding: '5px 11px', fontSize: 11, fontWeight: 600, color: C.mute,
      }}>
        {fr ? 'Tu es en Free' : "You're on Free"}
        {stockFull && <> · {itemCount}/{stockLimit} {fr ? 'articles' : 'items'}</>}
      </div>

      <Title>
        {trigger === 'voice'
          ? (fr ? 'Passe en vocal illimité.' : 'Go unlimited on voice.')
          : repubCap
            ? (fr ? 'Tes republications offertes sont épuisées.' : 'Your included repostings are used up.')
            : repubLot
              ? (fr ? 'Republie ton stock en un geste.' : 'Repost your stock in one move.')
              : quotaCas
                ? (quotaCas.geste === 'retouches'
                    ? (fr ? 'Tes retouches du mois sont faites.' : "This month's touch-ups are done.")
                    : (fr ? 'Tes annonces du mois sont créées.' : "This month's listings are created."))
                : stockFull
                  ? (fr ? 'Ton stock est plein.' : 'Your stock is full.')
                  : (fr ? 'Débloque tout FillSell.' : 'Unlock all of FillSell.')}
      </Title>

      {repubCap && (
        /* Registre des cartes : le Free A eu quelque chose (50 offertes, à
           vie) et le Premium change le VOLUME. Jamais le mot « plafond ».
           Déclenchement (exclusif au code plafond_republication_free) et
           télémétrie portés par StockTab. */
        <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: C.ink }}>
            {fr
              ? <>Tes {plafondRepub?.plafond ?? 50} republications offertes ont toutes été utilisées. Rien n'a été décompté aujourd'hui.</>
              : <>Your {plafondRepub?.plafond ?? 50} included repostings have all been used. Nothing was deducted today.</>}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: C.mute2, marginTop: 6 }}>
            {fr
              ? <>En Premium, tu repars avec {repubPremium} republications par mois — tu republies toi-même, quand tu veux.</>
              : <>On Premium you get {repubPremium} repostings a month — you repost yourself, whenever you want.</>}
          </div>
        </div>
      )}

      {quotaCas && (
        /* Même gabarit que les encarts republication : le FAIT (quota du
           cycle atteint, rien décompté au-delà), puis ce que le palier
           au-dessus change. Textes par geste, volumes lus dans K. */
        <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: C.ink }}>
            {quotaCas.geste === 'retouches'
              ? (fr ? <>Ton forfait comprend {quotaCas.plafond ?? 0} retouches IA par mois — elles sont toutes utilisées. Rien n'a été décompté.</>
                    : <>Your plan includes {quotaCas.plafond ?? 0} AI touch-ups a month — they are all used. Nothing was deducted.</>)
              : (fr ? <>Ton forfait comprend {quotaCas.plafond ?? K.quota_annonces_free} annonces créées par mois — elles le sont toutes. Rien n'a été décompté.</>
                    : <>Your plan includes {quotaCas.plafond ?? K.quota_annonces_free} created listings a month — they are all used. Nothing was deducted.</>)}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: C.mute2, marginTop: 6 }}>
            {quotaCas.geste === 'retouches'
              ? (fr ? <>En Premium, tu passes à {K.quota_retouche_premium} retouches IA par mois.</>
                    : <>On Premium you get {K.quota_retouche_premium} AI touch-ups a month.</>)
              : (fr ? <>En Premium, tu passes à {K.quota_annonces_premium} annonces par mois, publiées sur les 4 plateformes.</>
                    : <>On Premium you get {K.quota_annonces_premium} listings a month, published on all 4 platforms.</>)}
          </div>
        </div>
      )}

      {repubLot && (
        /* Même structure que l'encart du plafond : le FAIT (geste réservé,
           rien lancé, rien débité), puis ce que Premium change — phrase
           STRICTEMENT identique à celle du plafond, même registre toi-même. */
        <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: C.ink }}>
            {fr
              ? <>La republication en lot est réservée aux forfaits payants — rien n'a été lancé, rien n'a été débité.</>
              : <>Bulk reposting is for paid plans — nothing was launched, nothing was charged.</>}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: C.mute2, marginTop: 6 }}>
            {fr
              ? <>En Premium, tu republies jusqu'à {repubPremium} annonces par mois — toi-même, quand tu veux.</>
              : <>On Premium you repost up to {repubPremium} listings a month — yourself, whenever you want.</>}
          </div>
        </div>
      )}

      {/* Bloc commun AU-DESSUS des cartes (02/09 soir) : ce que fait le
          produit se lit avant de comparer les prix. */}
      <ToutesOffresBlock fr={fr} />

      {/* Vue comparative (2026-07-22) : les cartes d'emblée, empilées —
          ouvertes par la carte Free (le point de départ du lecteur). */}
      <PlansStack fr={fr} tiers={sellable} showFree K={K} onUpgrade={choisirPalier} />

      <Dismiss onClose={fermer} label={fr ? 'Non merci' : 'No thanks'} />
    </Sheet>
  );
}
