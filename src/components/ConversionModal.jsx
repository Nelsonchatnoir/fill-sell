import { useEffect, useRef, useState } from 'react';
import PepiteIcon from './PepiteIcon';
import PepiteAmount from './PepiteAmount';
import PlanBadge, { PremiumBadge, ProBadge, BusinessBadge } from './PlanBadge';
import { PACKS } from './coinPacks';
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

// Coût Pépites d'UN article publié partout : génération d'annonce + 4
// plateformes (Vinted, Leboncoin, eBay, Beebs). CALCULÉ depuis coin_config,
// jamais écrit en dur — c'est ce qui permet d'annoncer « ≈ N articles » sans
// que la promesse mente le jour où un prix bouge.
const PLATEFORMES = 4;
const coutArticleComplet = (K) => K.price_generate + PLATEFORMES * K.price_per_platform;
const articlesParMois = (grant, K) => {
  const unit = coutArticleComplet(K);
  return unit > 0 ? Math.floor(grant / unit) : 0;
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
                <PepiteAmount value={p.coins} size={17} />
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

// ── Bloc commun « Dans tous les forfaits » (2026-09-02) ──────────────────────
// Restructuration de lisibilité : les SEPT lignes quasi identiques répétées
// sur les trois cartes en sortent — ce qui est COMMUN s'affiche UNE fois ici,
// les cartes ne gardent que ce qui les distingue (grant, republication,
// support). Le détail du tarif à la Pépite sort aussi des cartes : une seule
// ligne, ici, lue dans coin_config comme tout le reste (jamais en dur).
// Exporté pour un éventuel réemploi (PlanDetailsModal) — même source unique
// que les cartes.
export function ToutesOffresBlock({ fr, K }) {
  const items = [
    fr ? 'Stock illimité' : 'Unlimited stock',
    fr ? 'Publication sur Vinted, Leboncoin, eBay & Beebs' : 'Publishing on Vinted, Leboncoin, eBay & Beebs',
    fr ? 'Analyses Lens (photo → prix, plateforme, deal)' : 'Lens scans (photo → price, platform, deal)',
    fr ? 'Import & export Excel de ton stock' : 'Excel import & export of your stock',
    fr ? 'Commandes vocales illimitées' : 'Unlimited voice commands',
  ];
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 14px', marginTop: 12 }}>
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
      {/* Tarif unitaire de la Pépite — identique sur TOUS les paliers depuis la
          grille du 08/08, donc dit UNE fois, jamais trois. Valeurs lues en
          base (K), le repli COIN_CONFIG_FALLBACK jouant comme partout. */}
      <div style={{ fontSize: 10.5, fontWeight: 600, color: C.mute, marginTop: 9, lineHeight: 1.5, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
        {fr
          ? <>La Pépite paie tout, au même prix sur tous les forfaits : génération IA {K.price_generate} · publication {K.price_per_platform}/plateforme · republication {K.price_republish} · analyse Lens {K.price_lens_overflow}.</>
          : <>Nuggets pay for everything, same price on every plan: AI listing {K.price_generate} · publishing {K.price_per_platform}/platform · reposting {K.price_republish} · Lens scan {K.price_lens_overflow}.</>}
      </div>
    </div>
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
// ── Équivalences Pépites (2026-08-27, correction de cohérence Nico) ──────────
// Le grant est UNE réserve unique : « ≈ N articles » et « ≈ M analyses » sont
// des EXEMPLES ALTERNATIFS de la même réserve (3000 = 300 articles OU 500
// analyses, PAS les deux). Les deux chiffres vivaient l'un dans le bandeau de
// grant, l'autre dans la liste — lus comme deux quotas cumulables. Désormais :
// une sous-ligne UNIQUE sous le grant les donne ensemble, reliés par « OU »,
// et la ligne Lens de la liste ne porte plus que le prix unitaire.
function PremiumPlanCard({ fr, grantPrem, lensCost, lensScans, articles, genPrice, pubUnit, repubPrice, onUpgrade }) {
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
        background: 'rgba(47,158,144,0.10)',
        border: '1px solid rgba(47,158,144,0.22)', borderRadius: 12, padding: '9px 12px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <PepiteIcon size={18} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.tealDeep }}>
            {/* Même formulation que Pro/Business (uniformisation 27/08 soir,
                décision Nico : « N Pépites/mois » partout — plus jamais
                « offertes chaque mois » sur une carte et « /mois » sur
                l'autre). */}
            {fr ? `${grantPrem} Pépites/mois` : `${grantPrem} Nuggets/mo`}
          </span>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: C.tealDeep, opacity: 0.85, marginTop: 4, lineHeight: 1.45 }}>
          {fr ? `Une seule réserve pour tout — par exemple ≈ ${articles} articles publiés partout OU ≈ ${lensScans} analyses Lens.`
              : `One single pool for everything — e.g. ≈ ${articles} items listed everywhere OR ≈ ${lensScans} Lens scans.`}
        </div>
      </div>
      {/* ── CARTES COURTES (2026-09-02) ─────────────────────────────────────
          Restructuration de lisibilité : le socle commun (stock, publication,
          Lens, Excel, voix) et le tarif à la Pépite vivent désormais dans
          ToutesOffresBlock, affiché UNE fois sous les cartes. Chaque carte ne
          porte plus que ce qui la DISTINGUE : le grant (bandeau au-dessus),
          la republication et sa cadence — LA différence entre paliers — et
          le support. MÊME ordre, MÊME gabarit sur les trois cartes : on
          compare en balayant une colonne. Toute retouche d'un libellé se
          fait dans les TROIS cartes (et PlanDetailsModal + FAQ landing,
          mêmes mots).
          ⚠️ Republication Premium = EN UN CLIC (manuelle). L'automatique
          reste Pro/Business tant que l'extension coupe elle-même l'auto des
          comptes non-Pro (background.js, arret_motif 'plan_non_pro') — ne
          promettre l'auto en Premium QUE lorsque ce verrou extension sera
          levé en production (passage CWS requis, constat du 02/09). */}
      <Features
        items={[
          fr ? 'Republication Vinted en un clic, annonce par annonce — sans plafond quotidien'
             : 'One-tap Vinted reposting, listing by listing — no daily cap',
          fr ? 'Support par email' : 'Email support',
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
      </button>
    </div>
  );
}

// Carte Pro (CAS 4) — fond sombre, badge ProBadge.
// ⚠️ Aucune promesse « Lens illimité » : Lens est payant en Pépites sur TOUS les
// paliers. On annonce ce que le grant permet réellement (calculé).
// Exportée pour PlanDetailsModal (2026-07-24) : la modale du badge la réutilise
// comme upsell Pro pour les Premium — source UNIQUE de ce que Pro promet.
export function ProPlanCard({ fr, grantPro, lensCost, lensScans, articles, proFactor, showFactor, genPrice, pubUnit, repubPrice, onUpgrade }) {
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
        background: 'rgba(232,149,109,0.14)',
        border: '1px solid rgba(214,178,96,0.3)', borderRadius: 12, padding: '9px 12px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <PepiteIcon size={18} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#F2C98A' }}>
            {fr ? `${grantPro} Pépites/mois` : `${grantPro} Nuggets/mo`}
            {showFactor && proFactor ? (fr ? ` — ${proFactor}× plus` : ` — ${proFactor}× more`) : ''}
          </span>
        </div>
        {/* Traduction concrète du grant (2026-08-27, point 4 Nico) — même
            phrase-équivalence que les autres cartes : une réserve UNIQUE,
            exemples alternatifs reliés par OU, jamais deux quotas. */}
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(242,201,138,0.85)', marginTop: 4, lineHeight: 1.45 }}>
          {fr ? `Une seule réserve pour tout — par exemple ≈ ${articles} articles publiés partout OU ≈ ${lensScans} analyses Lens.`
              : `One single pool for everything — e.g. ≈ ${articles} items listed everywhere OR ≈ ${lensScans} Lens scans.`}
        </div>
      </div>
      {/* ── CARTE COURTE (2026-09-02, cf. le commentaire de PremiumPlanCard) —
          socle commun et tarif Pépite dans ToutesOffresBlock. Les différences
          Pro, et rien d'autre : le grant (au-dessus), la republication
          AUTOMATIQUE (un choix — toggle + plafond/jour — jamais un
          comportement imposé ; « jusqu'à 45/jour » = le plafond réellement
          servi par le serveur, get-pending-jobs), le support prioritaire. */}
      <Features
        dark
        items={[
          fr ? "Republication Vinted automatique si tu l'actives — tes annonces remontent seules, jusqu'à 45 par jour"
             : 'Automatic Vinted reposting if you turn it on — your listings bump themselves, up to 45 a day',
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
export function BusinessPlanCard({ fr, grantBusiness, lensCost, lensScans, articles, genPrice, pubUnit, repubPrice, onUpgrade }) {
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
      <div style={{
        background: 'rgba(155,232,220,0.10)',
        border: '1px solid rgba(174,233,223,0.28)', borderRadius: 12, padding: '9px 12px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <PepiteIcon size={18} />
          <span style={{
            fontSize: 12.5, fontWeight: 700,
            background: 'linear-gradient(120deg,#F4FFFD,#9BE8DC 55%,#F2C98A)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>
            {fr ? `${grantBusiness} Pépites/mois` : `${grantBusiness} Nuggets/mo`}
          </span>
        </div>
        {/* Équivalences ALTERNATIVES d'une réserve unique (27/08) — plus
            jamais « 300 articles » ici ET « 500 analyses » dans la liste,
            lus comme deux quotas cumulables. */}
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(246,245,241,0.75)', marginTop: 4, lineHeight: 1.45 }}>
          {fr ? `Une seule réserve pour tout — par exemple ≈ ${articles} articles publiés partout OU ≈ ${lensScans} analyses Lens.`
              : `One single pool for everything — e.g. ≈ ${articles} items listed everywhere OR ≈ ${lensScans} Lens scans.`}
        </div>
      </div>
      {/* ── CARTE COURTE (2026-09-02, cf. PremiumPlanCard) — socle commun et
          tarif Pépite dans ToutesOffresBlock. Différences Business : le grant
          (au-dessus), la republication automatique (même moteur et même
          plafond servi que Pro : 45/jour), le support prioritaire renforcé
          (promesse de PRIORITÉ seulement — garde-fou du 09/08 inchangé). */}
      <Features
        dark
        items={[
          fr ? "Republication Vinted automatique — tes annonces remontent seules, jusqu'à 45 par jour"
             : 'Automatic Vinted reposting — your listings bump themselves, up to 45 a day',
          fr ? 'Support prioritaire — tes demandes passent en premier' : 'Priority support — your requests come first',
        ]}
      />
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
function PlansStack({ fr, tiers, grantPrem, grantPro, grantBusiness, lensCost, lensPerMonth, proFactor, K, onUpgrade }) {
  const showPremium = tiers.includes('premium');
  const showPro = tiers.includes('pro');
  const showBusiness = tiers.includes('business');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {showPremium && (
        <PremiumPlanCard
          fr={fr} grantPrem={grantPrem} lensCost={lensCost} lensScans={lensPerMonth(grantPrem)}
          articles={articlesParMois(grantPrem, K)} repubPrice={K.price_republish}
          genPrice={K.price_generate} pubUnit={K.price_per_platform}
          onUpgrade={onUpgrade}
        />
      )}
      {showPro && (
        <ProPlanCard
          fr={fr} grantPro={grantPro} lensCost={lensCost} lensScans={lensPerMonth(grantPro)}
          articles={articlesParMois(grantPro, K)} repubPrice={K.price_republish}
          proFactor={proFactor} showFactor
          pubUnit={K.price_per_platform} retouchMax={K.price_ia_advanced} genPrice={K.price_generate}
          onUpgrade={onUpgrade}
        />
      )}
      {showBusiness && (
        <BusinessPlanCard
          fr={fr} grantBusiness={grantBusiness} lensCost={lensCost} lensScans={lensPerMonth(grantBusiness)}
          articles={articlesParMois(grantBusiness, K)} repubPrice={K.price_republish}
          pubUnit={K.price_per_platform} genPrice={K.price_generate}
          onUpgrade={onUpgrade}
        />
      )}
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
  // trigger 'republish_cap' UNIQUEMENT : { plafond, faites } renvoyés par le
  // refus serveur plafond_republication_free (spend_coins_and_republish).
  plafondRepub = null,
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
  const lensCost  = K.price_lens_overflow;
  const grantPrem = K.monthly_grant_premium;      // lu en base (400)
  const grantPro  = K.monthly_grant_pro;          // lu en base (1200)
  const grantBusiness = K.monthly_grant_business; // lu en base (3000)
  // Estimation d'analyses Lens permises par le grant mensuel — CALCULÉE, jamais
  // écrite en dur : à 1200 Pépites et 6 par analyse, cela fait 200 analyses.
  const lensPerMonth = (grant) => (lensCost > 0 ? Math.floor(grant / lensCost) : 0);
  const proFactor = grantPrem > 0 ? Math.round((grantPro / grantPrem) * 10) / 10 : null;

  // Libellé du coût affiché. Grille 2 axes (2026-08-04) : le serveur renvoie
  // un TOTAL (photos + 3 × plateformes) — le confronter aux prix d'OPTION
  // produirait de faux libellés (photos perso × 3 plateformes = 9 = l'ancien
  // match « Retouche légère »). Libellé générique, toujours vrai.
  const tierLabel = () => (fr ? 'Cette publication' : 'This publication');

  const isCoinCase = coinPrice != null;                    // CAS 1 et CAS 2
  const missing = isCoinCase && coinBalance != null ? Math.max(0, coinPrice - coinBalance) : null;

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
  const canBuyCoins = typeof onUseCoins === 'function';

  // ══ Vue comparative demandée depuis les CAS 1/2 (bouton d'upsell) ═══════════
  // Mêmes cartes que le CAS 3, avec retour vers l'écran Pépites.
  if (isCoinCase && view === 'plans') {
    return (
      <Sheet onClose={fermer}>
        <div
          onClick={() => setView('entry')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: C.mute2, cursor: 'pointer', marginBottom: 12 }}
        >
          ← {fr ? 'Retour' : 'Back'}
        </div>
        <Title>{fr ? 'Compare les plans.' : 'Compare the plans.'}</Title>
        <PlansStack
          fr={fr} tiers={sellable}
          grantPrem={grantPrem} grantPro={grantPro} grantBusiness={grantBusiness} lensCost={lensCost}
          lensPerMonth={lensPerMonth} proFactor={proFactor} K={K}
          onUpgrade={choisirPalier}
        />
        <ToutesOffresBlock fr={fr} K={K} />
        <Dismiss onClose={fermer} label={fr ? 'Non merci' : 'No thanks'} />
      </Sheet>
    );
  }

  // ══ CAS 1 & 2 — Pépites insuffisantes (publier / Lens) ══════════════════════
  if (isCoinCase) {
    const isLens = trigger === 'lens';
    // Palier poussé en second rideau : le PROCHAIN cran au-dessus du sien (un
    // Free voit Premium, un Premium voit Pro, un Pro voit Business). Au sommet,
    // ou offre Business masquée : plus rien à pousser, packs seuls.
    const upTier = sellable[0] ?? null;

    return (
      <Sheet onClose={fermer}>
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
            {/* BASCULE vers la vue comparative — plus jamais de checkout direct
                depuis cette ligne : l'utilisateur n'a pas encore vu la carte
                complète du plan (fix 2026-07-22). */}
            <button
              onClick={() => setView('plans')}
              style={{
                width: '100%', padding: 13, borderRadius: 14, border: `1.5px solid ${C.tealDeep}`,
                background: 'none', color: C.tealDeep, fontSize: 13, fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {upTier === 'business'
                ? (fr ? `Passe Business — ${grantBusiness} Pépites/mois (≈ ${articlesParMois(grantBusiness, K)} articles publiés partout)`
                      : `Go Business — ${grantBusiness} Nuggets/mo (≈ ${articlesParMois(grantBusiness, K)} items listed everywhere)`)
                : upTier === 'pro'
                  /* Même traduction concrète que Business (27/08, point 4) :
                     le grant se dit en articles publiés partout — UNE
                     équivalence, jamais deux quotas dans la même phrase. */
                  ? (fr ? `Passe Pro — ${grantPro} Pépites/mois (≈ ${articlesParMois(grantPro, K)} articles publiés partout)`
                        : `Go Pro — ${grantPro} Nuggets/mo (≈ ${articlesParMois(grantPro, K)} items listed everywhere)`)
                  : (fr ? `Passe Premium — ${grantPrem} Pépites/mois (≈ ${articlesParMois(grantPrem, K)} articles publiés partout)`
                        : `Go Premium — ${grantPrem} Nuggets/mo (≈ ${articlesParMois(grantPrem, K)} items listed everywhere)`)}
            </button>
          </>
        )}

        <Dismiss onClose={fermer} label={fr ? 'Non merci' : 'No thanks'} />
      </Sheet>
    );
  }

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
        <BusinessPlanCard
          fr={fr} grantBusiness={grantBusiness} lensCost={lensCost} lensScans={lensPerMonth(grantBusiness)}
          articles={articlesParMois(grantBusiness, K)} repubPrice={K.price_republish}
          pubUnit={K.price_per_platform} genPrice={K.price_generate}
          onUpgrade={choisirPalier}
        />
        <ToutesOffresBlock fr={fr} K={K} />
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
        <PlansStack
          fr={fr} tiers={sellable}
          grantPrem={grantPrem} grantPro={grantPro} grantBusiness={grantBusiness} lensCost={lensCost}
          lensPerMonth={lensPerMonth} proFactor={proFactor} K={K}
          onUpgrade={choisirPalier}
        />
        <ToutesOffresBlock fr={fr} K={K} />
        <Dismiss onClose={fermer} label={fr ? 'Rester en Premium' : 'Stay on Premium'} />
      </Sheet>
    );
  }

  // ══ Plus rien à vendre : packs seuls ═══════════════════════════════════════
  // Ne se dit QUE d'un utilisateur sans palier au-dessus — c'est-à-dire un
  // Business, ou un Pro tant que l'offre Business est masquée.
  if (sellable.length === 0) {
    return (
      <Sheet onClose={fermer}>
        <Title>{fr ? 'Tu es déjà au maximum.' : "You're already on the top plan."}</Title>
        {canBuyCoins && <PackList fr={fr} onUseCoins={onUseCoins} />}
        <Dismiss onClose={fermer} label={fr ? 'Fermer' : 'Close'} />
      </Sheet>
    );
  }

  // ══ CAS 3 — Free → Premium ═════════════════════════════════════════════════
  // Variante 'republish_cap' (2026-09-02) : le serveur a refusé une
  // republication manuelle avec plafond_republication_free (3/jour en Free).
  // Ce n'est PAS un message d'erreur : la modale dit le FAIT (limite du jour
  // atteinte), puis ce que débloque le palier au-dessus, puis les cartes —
  // dont les CTA partent en checkout. Ton informatif, aucun compte à rebours,
  // aucune « offre limitée ». L'anti-harcèlement (une ouverture/jour) vit chez
  // l'appelant (StockTab), pas ici. Ne s'ouvre QUE sur ce code de refus.
  const stockFull = trigger === 'stock' && itemCount != null;
  const repubCap = trigger === 'republish_cap';
  return (
    <Sheet onClose={fermer}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12,
        background: C.paper, border: `1px solid ${C.border}`, borderRadius: 999,
        padding: '5px 11px', fontSize: 11, fontWeight: 600, color: C.mute,
      }}>
        {fr ? 'Tu es en Free' : "You're on Free"}
        {stockFull && <> · {itemCount}/{stockLimit} {fr ? 'articles' : 'items'}</>}
        {coinBalance != null && <> · <PepiteAmount value={coinBalance} size={12} /></>}
      </div>

      <Title>
        {trigger === 'voice'
          ? (fr ? 'Passe en vocal illimité.' : 'Go unlimited on voice.')
          : repubCap
            ? (fr ? 'Tes republications du jour sont faites.' : "Today's reposts are done.")
            : stockFull
              ? (fr ? 'Ton stock est plein.' : 'Your stock is full.')
              : (fr ? 'Débloque tout FillSell.' : 'Unlock all of FillSell.')}
      </Title>

      {repubCap && (
        <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: C.ink }}>
            {fr
              ? <>Le plan Free permet {plafondRepub?.plafond ?? 3} republications par jour — tu les as utilisées aujourd'hui. Rien n'a été débité.</>
              : <>The Free plan allows {plafondRepub?.plafond ?? 3} reposts a day — you've used them today. Nothing was charged.</>}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: C.mute2, marginTop: 6 }}>
            {fr
              ? <>En Premium, la republication n'a pas de limite quotidienne : tu remontes tes annonces une à une, autant de fois que tu veux.</>
              : <>On Premium, reposting has no daily limit: bump your listings one by one, as often as you like.</>}
          </div>
        </div>
      )}

      {/* Vue comparative (2026-07-22) : les DEUX cartes d'emblée, empilées.
          Remplace l'ancienne carte Premium seule + lien « Découvre Pro → » qui
          partait DIRECT en checkout Stripe sans présentation de l'offre Pro. */}
      <PlansStack
        fr={fr} tiers={sellable}
        grantPrem={grantPrem} grantPro={grantPro} grantBusiness={grantBusiness} lensCost={lensCost}
        lensPerMonth={lensPerMonth} proFactor={proFactor} K={K}
        onUpgrade={choisirPalier}
      />

      <ToutesOffresBlock fr={fr} K={K} />
      <Dismiss onClose={fermer} label={fr ? 'Non merci' : 'No thanks'} />
    </Sheet>
  );
}
