import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
// (PepiteIcon / PepiteAmount / PACKS : imports morts le 02/09 soir — plus une
// unité ne s'affiche dans cette modale.)
import PlanBadge, { PremiumBadge, ProBadge, BusinessBadge } from './PlanBadge';
import { supabase } from '../lib/supabase';
import { businessOfferVisible } from '../config/businessOffer';
import { PALIERS, palierDesDrapeaux, nomDuPalier } from '../utils/palier';
// Option « Sans ordinateur » (Cloud, conception du 04/10/2026) — derrière
// cloudOfferVisible() : drapeau baissé, rien de ce qui suit n'est rendu et
// onUpgrade(tier) part exactement comme avant (un seul argument).
import { cloudOffreVendable } from '../config/cloudOffer';
import { LigneCloudModale, PrixAvecCloud } from '../cloud/InterrupteurCloud';
import CarteCloudOffres from '../cloud/CarteCloudOffres';
import { useCloudProfil } from '../cloud/useCloudProfil';
import { offreCloudPourModale } from '../cloud/regles';
import { textesCloud } from '../cloud/textes';
// (06/10) « Bientôt : FillSell Cloud » — encart informatif SOUS les cartes ;
// à retirer à la sortie du Cloud (interrupteur ENCART_CLOUD_BIENTOT).
import EncartCloudBientot from '../cloud/EncartCloudBientot';
import { jourRemise, jourRemiseCourt } from '../utils/jourRemise';
// (04/11) La grille à 3 jauges (annonces · publications · remontées) — règle d'affichage unique, derrière
// l'interrupteur coin_config.grille_trois_jauges. À 0 (ou config illisible), rien de ce qui suit ne se rend.
import { JAUGES, grilleActiveConfig, grilleDuPalier, nombre, motJauge, palierQuiDebloque } from '../utils/jauges';
// (09/11, maquette « les carrés au tap » validée par Nico) Chaque carré ouvre « qu'est-ce que ça compte ? » ; les
// plateformes de la ligne commune portent leur logo.
import { nomAccessibleCarre } from '../utils/jaugesExplications';
import ExplicationJauge, { IconeInfoJauge } from './ExplicationJauge';
import TexteAvecLogos from './TexteAvecLogos';
import { lireDernierGeste, canalDeLApp } from '../utils/dernierGeste';
import { Capacitor } from '@capacitor/core';
// (05/11 soir, décision l de Nico) Les mentions d'abonnement et les liens EULA / conditions / confidentialité, au pied.
import { texteMontee } from '../utils/texteMontee';
import MentionsAbonnement from './MentionsAbonnement';
import { prixOuChargement, prixPret, prixGratuit, etatEssaiBoutique, zeroAffiche } from '../lib/prixBoutique';
import { usePrixBoutique } from '../lib/usePrixBoutique';
// (11/11/2026, décisions de Nico) LES FORMULES AVEC CLOUD — l'interrupteur « Sans Cloud | Avec Cloud » et les trois cartes,
// derrière formulesCloudVendables (interrupteur serveur du canal + témoins) ET un hôte qui sait les acheter
// (onFormuleCloud). Fermé : aucun de ces imports n'est rendu ni lu, la feuille est celle d'avant octet pour octet
// (scripts/formules-cloud-ferme-selftest.mjs).
import { formulesCloudVendables, formulesCloudOuvertes, canalDeVente } from '../config/cloudOffer';
import OffresAvecCloud, { BasculeCloud } from '../cloud/OffresAvecCloud';
import { cartesFormulesCloud, vueOffresParDefaut, lireVueOffres, essaiPermisDuCompte, canalDuCloudSeul, formulesMasqueesPourLaVoie } from '../cloud/formulesCloud';
import { useProfilFormules } from '../cloud/useProfilFormules';
import { useDisponibiliteCloud, venteFermee } from '../cloud/useDisponibiliteCloud';
import { textesFormules } from '../cloud/textesFormules';
import { demanderPrixFormules } from '../lib/chargerPrixBoutique';
import { dateLongue, finEssaiSiOnCommence } from '../cloud/regles';

// ConversionModal — modale de conversion unique (upsell unités / Premium / Pro).
// Design « Conversion Modals » (Claude Design, projet e47b36df) intégré le
// 2026-07-14, avec CORRECTION des valeurs : la BASE fait autorité, jamais le
// design. Divergences relevées et corrigées (vérifiées le 2026-07-14) :
//   • unités/mois Pro : écart affichage/base résolu le 2026-07-23 — tout se
//     lit en base désormais. Éprouvé le 2026-07-28 : les grants sont passés à
//     300/800 puis SONT REVENUS à 150/600 le même jour, sans qu'une seule
//     ligne d'affichage ait besoin de changer — seule coin_config a bougé.
//   • le design étiquetait « Annonce avancée : 12 unités » → 12 est le coût de
//     la retouche LÉGÈRE (price_ia_light). Origine = 3, avancée = 35.
//   • le design promettait « Lens illimité » en Pro → FAUX : Lens coûte des
//     unités sur TOUS les paliers (price_lens_overflow = 6). Pro n'a pas de
//     Lens gratuit, il a plus d'unités — on affiche donc une ESTIMATION
//     d'analyses (grant ÷ coût Lens), calculée, jamais « illimité ».
//
// Les quatre cas du design :
//   CAS 1 · unités insuffisantes — Publier  (trigger 'publish', coinPrice ≠ null)
//   CAS 2 · unités insuffisantes — Lens     (trigger 'lens',    coinPrice ≠ null)
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
  // plus les prix en unités. Même contrat que toujours : coin_config fait
  // autorité, ces valeurs ne servent qu'en cas d'échec réseau.
  quota_annonces_free: 5, quota_annonces_premium: 40,
  quota_annonces_pro: 120, quota_annonces_business: 300,
  // (quota_scan_* retirés le 02/09 soir — fusion scans+annonces : les clés
  // restent en base à 0 pour le retour arrière, plus rien ne les lit ici.)
  // (05/10) Le gratuit a 50 republications PAR MOIS, réglables comme les
  // autres (quota_republication_free) ; l'ancienne règle (50 une fois pour
  // toutes) est retirée.
  quota_republication_free: 50,
  quota_republication_premium: 1500, quota_republication_pro: 5000,
  quota_retouche_free: 0, quota_retouche_premium: 5,
  quota_retouche_pro: 20, quota_retouche_business: 50,
  // Grille du 2026-08-08 — MÊME PRIX POUR TOUS LES PALIERS : photos (par
  // article) + 1 unité/plateforme + 6 unités la génération d'annonce.
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
// de 100 unités se vend 5 €, donc une unité vaut 5 centimes. À 300, un
// Premium à 12,99 € offrirait 15 € d'unités, soit plus que l'abonnement
// lui-même, et l'inventaire illimité deviendrait un cadeau. Les unités
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
// (07/11, décision de Nico) `priceEn` : le MÊME montant écrit à l'anglaise pour l'écran anglais (« €12.99 »).
// (08/11, refus Google Play de la vc36) Plus AUCUN prix écrit ici : web = prix Stripe en euros, iPhone/Android = prix
// formaté par la boutique (« … » tant qu'il charge, bouton inactif) — lib/prixBoutique.js.
const prixPlan = (palier, fr) => prixOuChargement(palier, fr ? 'fr' : 'en');
// Le bouton d'achat d'une carte : inactif tant que son prix n'est pas affiché (mobile).
const boutonAchat = (formule, onUpgrade, style) => {
  const pret = prixPret(formule);
  return {
    disabled: !pret, 'aria-disabled': !pret, 'data-prix-pret': pret ? '1' : '0',
    onClick: () => { if (prixPret(formule)) onUpgrade(formule); },
    style: pret ? style : { ...style, opacity: 0.55, cursor: 'default' },
  };
};

// (Bascule quotas 02/09 : articlesParMois / coutArticleComplet — les
// équivalences « ≈ N articles » calculées depuis les prix en unités — sont
// MORTS avec les CAS 1/2 et les bandeaux de grant. Eyebrow aussi : il ne
// servait qu'aux écrans « unités insuffisantes ».)

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

// (BalanceCard — la jauge de solde — et PackList — les 4 packs d'unités —
// sont MORTS le 02/09 soir avec la bascule quotas : plus de solde à jauger,
// plus de packs à vendre. CoinStoreModal/coinPacks SUPPRIMÉS le 03/09 côté
// fichiers, DÉBRANCHÉS — un achat en vol doit encore aboutir côté webhooks.)

// ── Bloc commun « Dans tous les forfaits » (2026-09-02) ──────────────────────
// Restructuration de lisibilité : les SEPT lignes quasi identiques répétées
// sur les trois cartes en sortent — ce qui est COMMUN s'affiche UNE fois ici,
// les cartes ne gardent que ce qui les distingue (grant, republication,
// support). Le détail du tarif à l'unité sort aussi des cartes : une seule
// ligne, ici, lue dans coin_config comme tout le reste (jamais en dur).
// Exporté pour un éventuel réemploi (PlanDetailsModal) — même source unique
// que les cartes.
export function ToutesOffresBlock({ fr, grille = false }) {
  // (04/11) Grille à 3 jauges : la liste des maquettes (Depop comprise) et la légende « Comment on compte ».
  // Sans la grille, le bloc d'avant, au balisage près.
  if (grille) return <ToutesOffresGrille fr={fr} />;
  // Bascule quotas (02/09 soir) : la ligne de tarif en unités est MORTE, et
  // le bloc dit ce que TOUS les forfaits font (liste de la décision Nico) —
  // import du dressing, 4 plateformes, voix, retrait auto après vente.
  // Il vit AU-DESSUS des cartes : ce que fait le produit se lit avant les prix.
  const items = [
    // (06/10 soir, Nico) L'import marche depuis TOUTES les plateformes, pas seulement Vinted.
    fr ? 'Import de tes annonces depuis toutes tes plateformes' : 'Import your listings from all your platforms',
    // (06/11) Depop, ouverte à tous depuis le 10/10, manquait à la liste.
    // (09/11, demande de Nico) Le logo de chaque plateforme devant son nom (TexteAvecLogos).
    <TexteAvecLogos key="plateformes" texte={fr ? 'Publication sur Vinted, Leboncoin, eBay, Beebs & Depop' : 'Publishing on Vinted, Leboncoin, eBay, Beebs & Depop'} />,
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

// (04/11) Un bloc « liste à coches » au style de « Dans tous les forfaits » : la grille l'emploie pour ce bloc
// et PlanDetailsModal pour « Aussi dans ton plan » (une seule source de style). `children` = ce qui suit la liste.
export function BlocCoches({ titre, items, style = null, children = null }) {
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 14px', marginBottom: 12, ...style }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.faint, marginBottom: 8 }}>
        {titre}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 12px' }}>
        {items.map((t, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: C.mute2 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.tealDeep} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            {t}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

// (04/11) « Dans tous les forfaits » de la grille (maquette 2.1) : Depop nommée avec les autres, puis la légende
// « Comment on compte » — elle répond à la question avant qu'elle se pose ; « l'import ne compte jamais » rassure
// celui qui a 300 annonces.
// (09/11, maquette « les carrés au tap » validée par Nico) La ligne des plateformes : le logo de chaque plateforme
// devant son nom, insécable (TexteAvecLogos).
function ToutesOffresGrille({ fr }) {
  const plateformes = <TexteAvecLogos key="plateformes" texte={fr ? 'Vinted, Leboncoin, eBay, Beebs et Depop' : 'Vinted, Leboncoin, eBay, Beebs and Depop'} />;
  const items = fr
    ? ['Import de tout ton stock, depuis toutes tes plateformes', plateformes, 'Retrait automatique partout après une vente', 'Commandes vocales']
    : ['Import your whole stock, from all your platforms', plateformes, 'Automatic removal everywhere after a sale', 'Voice commands'];
  const compte = fr
    ? [['1 annonce', "une rédaction par l'IA ou un scan Lens"], ['1 publication', 'une mise en ligne sur une plateforme'], ['1 remontée', 'une republication sur une plateforme']]
    : [['1 listing', 'one AI write-up or one Lens scan'], ['1 publication', 'one listing put online on one platform'], ['1 bump', 'one repost on one platform']];
  return (
    <BlocCoches titre={fr ? 'Dans tous les forfaits' : 'In every plan'} items={items}>
      <div data-comment-on-compte="" style={{ borderTop: `1px solid ${C.border}`, marginTop: 11, paddingTop: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.faint, marginBottom: 6 }}>
          {fr ? 'Comment on compte' : 'How we count'}
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {compte.map(([quoi, def]) => (
            <li key={quoi} style={{ fontSize: 11.5, fontWeight: 600, color: C.mute2 }}>
              <b style={{ color: C.ink }}>{quoi}</b>{fr ? ' : ' : ': '}{def}
            </li>
          ))}
        </ul>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.tealDeep, marginTop: 5 }}>
          {fr ? "L'import, la synchro et les retraits ne comptent jamais." : 'Imports, syncs and removals never count.'}
        </div>
      </div>
    </BlocCoches>
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
// Plus une unité nulle part. Cinq lignes par carte, même ordre, coches
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
  // (05/10) Free compris : « N republications par mois », même phrase que
  // Premium et Pro, chiffre lu dans quota_republication_free.
  const repubTexte = palier === 'business'
      ? (fr ? 'Republications illimitées — tu republies quand tu veux, autant que tu veux'
            : 'Unlimited repostings — repost whenever you want, as much as you want')
      : (fr ? `${(K[`quota_republication_${palier}`] ?? 0).toLocaleString('fr-FR')} republications par mois`
            : `${(K[`quota_republication_${palier}`] ?? 0).toLocaleString('en-US')} repostings a month`);
  return [
    {
      ok: true,
      texte: fr
        ? `${annonces} annonces créées et publiées sur toutes tes plateformes par mois`
        : `${annonces} listings created and published on all your platforms a month`,
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
        ? (fr ? `Retouche IA — ${retouches} annonces retouchées par mois (jusqu'à 5 photos chacune)` : `AI touch-up — ${retouches} listings retouched a month (up to 5 photos each)`)
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
  return <LignesRendu lignes={lignesDiff(fr, palier, K)} dark={dark} />;
}

// Le RENDU d'une liste de lignes coche/croix — commun à LignesDiff (sans la grille, balisage inchangé) et aux
// cartes de la grille (04/11). `l.bientot` (grille seulement) : une petite mention collée au texte
// (« Leboncoin, eBay : bientôt »).
function LignesRendu({ lignes, dark, margeBas = 18 }) {
  const okBg   = dark ? 'rgba(232,149,109,0.22)' : 'rgba(47,158,144,0.15)';
  const okInk  = dark ? '#F2C98A' : C.tealDeep;
  const koBg   = dark ? 'rgba(246,245,241,0.10)' : 'rgba(163,157,142,0.14)';
  const koInk  = dark ? 'rgba(246,245,241,0.45)' : C.faint;
  const okTxt  = dark ? C.paper : C.ink;
  const koTxt  = dark ? 'rgba(246,245,241,0.55)' : C.mute;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: margeBas }}>
      {lignes.map((l, i) => (
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
          <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, color: l.ok ? okTxt : koTxt }}>{l.texte}{l.bientot ? (
            <span style={{ display: 'inline-block', marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: dark ? 'rgba(246,245,241,0.6)' : C.mute }}>{l.bientot}</span>
          ) : null}</span>
        </div>
      ))}
    </div>
  );
}

// ══ LA GRILLE À 3 JAUGES SUR LES CARTES (04/11/2026, maquettes validées par Nico le 03/11) ═══════════════════
// Derrière l'interrupteur : chaque carte teste grilleActiveConfig(K) ELLE-MÊME — à 0 (ou config de repli, qui
// ne porte pas grille_trois_jauges), elle rend la carte d'avant, au balisage près. Avec la grille :
//   en-tête (badge + prix, inchangé) · une phrase d'accroche · 3 tuiles (annonces / publications / remontées,
//   « illimitées » en mot) · « par mois » · les lignes coche/croix de la maquette · le bouton.
// ⛔ Les volumes viennent de grilleDuPalier(K, palier) — jamais en dur. Le mot « plafond » reste banni des cartes,
//    et les garde-fous par jour ne s'affichent nulle part. Les retouches IA restent une ligne de chaque carte,
//    hors des 3 jauges. Bordereaux Vinted : Pro et Business seulement (« Leboncoin, eBay : bientôt »).
const ACCROCHES = {
  free:     ['Pour démarrer, sans payer.', 'To get started, for free.'],
  premium:  ['Pour vendre plus, toi-même.', 'To sell more, yourself.'],
  pro:      ['Pour que ça tourne tout seul.', 'So it all runs on its own.'],
  business: ['Pour publier sans compter.', 'To publish without counting.'],
};
const NOMS_PALIERS = { free: 'Free', premium: 'Premium', pro: 'Pro', business: 'Business' };
const palierCarte = (p) => (p === 'gratuit' || !NOMS_PALIERS[p] ? 'free' : p);

// Les lignes coche/croix d'une carte de la grille (maquette lignesDe), dans l'ordre de la maquette, coches d'abord
// (tri stable, comme lignesDiff).
function lignesGrille(fr, palier, K) {
  const lang = fr ? 'fr' : 'en';
  const g = grilleDuPalier(K, palier);
  const nRet = Number(g.retouches) || 0;
  const retouche = nRet > 0
    ? { ok: true, texte: fr ? `Retouche IA : ${nombre(nRet, lang)} ${nRet > 1 ? 'annonces retouchées' : 'annonce retouchée'} par mois`
                            : `AI touch-up: ${nombre(nRet, lang)} ${nRet === 1 ? 'listing' : 'listings'} retouched a month` }
    : { ok: false, texte: fr ? 'Retouche IA' : 'AI touch-up' };
  const autoKo = { ok: false, texte: fr ? 'Republication automatique' : 'Automatic reposting' };
  const bordereauxKo = { ok: false, texte: fr ? 'Bordereaux Vinted' : 'Vinted shipping labels' };
  let lignes;
  if (palier === 'business') {
    const toutIllimite = JAUGES.every((j) => g[j] === Infinity);
    const lens = g.lens != null ? nombre(g.lens, lang) : null;
    const ret = nombre(nRet, lang);
    lignes = [
      { ok: true, texte: toutIllimite
        ? (fr ? `Tout illimité, sauf ${lens ? `Lens (${lens} scans par mois) et ` : ''}retouches IA (${ret} par mois)`
              : `Everything unlimited, except ${lens ? `Lens (${lens} scans a month) and ` : ''}AI touch-ups (${ret} a month)`)
        : (fr ? `${lens ? `Lens : ${lens} scans par mois · ` : ''}retouches IA : ${ret} par mois`
              : `${lens ? `Lens: ${lens} scans a month · ` : ''}AI touch-ups: ${ret} a month`) },
      { ok: true, texte: fr ? 'Tout le Pro : republication automatique, bordereaux Vinted' : 'Everything in Pro: automatic reposting, Vinted shipping labels' },
      { ok: true, texte: fr ? 'Support prioritaire : tes demandes passent en premier' : 'Priority support: your requests come first' },
    ];
  } else if (palier === 'pro') {
    lignes = [
      { ok: true, texte: fr ? 'Republication automatique : tes annonces remontent toutes seules, au créneau que tu choisis'
                            : 'Automatic reposting: your listings bump themselves, at the time slot you choose' },
      { ok: true, texte: fr ? 'Bordereaux Vinted inclus, prêts dès la vente' : 'Vinted shipping labels included, ready as soon as you sell',
        bientot: fr ? 'Leboncoin, eBay : bientôt' : 'Leboncoin, eBay: coming soon' },
      retouche,
      { ok: true, texte: fr ? 'Support prioritaire' : 'Priority support' },
    ];
  } else if (palier === 'premium') {
    lignes = [retouche, { ok: true, texte: fr ? 'Support par e-mail' : 'Email support' }, autoKo, bordereauxKo];
  } else {
    lignes = [autoKo, bordereauxKo, retouche];
  }
  return lignes.sort((a, b) => Number(b.ok) - Number(a.ok));
}

// Les 3 tuiles d'une carte (maquette jauges3) puis « par mois ».
// (09/11/2026, maquette « les carrés au tap » validée par Nico) Chaque carré est un BOUTON : un tap ou un appui long
// ouvre « qu'est-ce que ça compte ? » (ExplicationJauge, textes de utils/jaugesExplications.js). Libellés inchangés.
// Le « i » a sa propre bande en haut du carré, à droite : il ne passe jamais sur le chiffre ni sur le mot, quelle que
// soit la largeur. Le carré entier est la cible (44 px de haut au moins). Il suit le style de sa carte : clair sur
// Free et Premium, sombre sur Pro et Business. Le même composant sert « Ton plan » et la fenêtre de bienvenue
// (CorpsCarteGrille) : la feuille se monte au-dessus de chacun (ExplicationJauge, Z_EXPLICATION_JAUGE).
// Fond, bordure et états (survol, appui, focus, ouvert) vivent dans la feuille de style : un style en ligne les
// écraserait.
const STYLE_CARRES = `
.fs-carre-jauge{appearance:none;-webkit-appearance:none;margin:0;font:inherit;color:inherit;text-align:left;cursor:pointer;box-sizing:border-box;width:100%;min-width:0;min-height:44px;border-radius:12px;padding:4px 6px 7px 9px;display:flex;flex-direction:column;align-items:stretch;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation;transition:transform .12s ease,border-color .15s ease,background-color .15s ease}
.fs-carre-jauge.fs-clair{background:#FFFFFF;border:1px solid ${C.border}}
.fs-carre-jauge.fs-sombre{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)}
@media (hover:hover){.fs-carre-jauge.fs-clair:hover{border-color:${C.teal}}.fs-carre-jauge.fs-sombre:hover{background:rgba(255,255,255,.1)}}
.fs-carre-jauge:active{transform:scale(.97)}
.fs-carre-jauge.fs-clair:focus-visible{outline:2px solid ${C.tealDeep};outline-offset:2px}
.fs-carre-jauge.fs-sombre:focus-visible{outline:2px solid #4ECDC4;outline-offset:2px}
.fs-carre-jauge.fs-clair[aria-expanded="true"]{border-color:${C.teal};background:#F1F8F6}
.fs-carre-jauge.fs-sombre[aria-expanded="true"]{border-color:#4ECDC4;background:rgba(78,205,196,.12)}
.fs-carre-jauge .fs-carre-info{align-self:flex-end;display:flex;height:13px;line-height:0}
.fs-carre-jauge .fs-carre-mot{font-size:10.5px;margin-top:1px}
@media (prefers-reduced-motion: reduce){.fs-carre-jauge{transition:none}.fs-carre-jauge:active{transform:none}}
@media (max-width: 359px){.fs-carre-jauge{padding-left:7px;padding-right:5px}.fs-carre-jauge .fs-carre-mot{font-size:9.5px;letter-spacing:-0.01em}}
`;
// ↑ (09/11) Sous 360 px de large (iPhone SE 1re génération, 320 px), un carré n'a plus que ~61 px pour son mot :
// « publications » se coupait en « publication / s » (déjà avant les carrés au tap). Le mot passe à 9,5 px et le
// carré rend 3 px de marge : tout tient sur une ligne (capture-jauges-offres.mjs, Chrome 320).
const APPUI_LONG_MS = 450;
// Le mot, le « i » et « par mois » d'une carte sombre : 0,72 d'opacité (0,6 et 0,55 avant le 09/11) — sous le reflet
// ambré de la carte Pro, 0,6 tombait à 3,9:1 ; 0,72 tient 4,5:1 partout (scripts/apercu/capture-jauges-offres.mjs).
const ENCRE_SOMBRE_CARRE = 'rgba(246,245,241,0.72)';
function TuilesGrille({ fr, palier, K, dark }) {
  const lang = fr ? 'fr' : 'en';
  const g = grilleDuPalier(K, palier);
  const encreIllimite = palier === 'business' ? '#9BE8DC' : dark ? '#F2C98A' : C.tealDeep;
  // { cle, carre } : la jauge expliquée et le carré qui l'a ouverte (le focus y revient à la fermeture).
  const [ouverte, setOuverte] = useState(null);
  const minuteur = useRef(null);
  const longFait = useRef(false);
  const lacher = () => { if (minuteur.current) { clearTimeout(minuteur.current); minuteur.current = null; } };
  useEffect(() => lacher, []);
  // Un tap ouvre ; un appui long aussi (APPUI_LONG_MS) — le clic qui suit le relâcher est alors ignoré.
  const surClic = (cle) => (e) => {
    if (longFait.current) { longFait.current = false; return; }
    setOuverte({ cle, carre: e.currentTarget });
  };
  const surAppui = (cle) => (e) => {
    longFait.current = false;
    lacher();
    if (e.button !== 0) return;
    const carre = e.currentTarget;
    minuteur.current = setTimeout(() => { minuteur.current = null; longFait.current = true; setOuverte({ cle, carre }); }, APPUI_LONG_MS);
  };
  return (
    <div data-jauges-carte={palier}>
      <style>{STYLE_CARRES}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
        {JAUGES.map((cle) => {
          const illimite = g[cle] === Infinity;
          const valeur = illimite ? (fr ? 'illimitées' : 'unlimited') : nombre(g[cle], lang);
          const mot = motJauge(cle, 2, lang);
          return (
            <button
              key={cle}
              type="button"
              data-carre-jauge={cle}
              className={`fs-carre-jauge ${dark ? 'fs-sombre' : 'fs-clair'}`}
              aria-haspopup="dialog"
              aria-expanded={ouverte?.cle === cle}
              aria-label={nomAccessibleCarre(valeur, mot, lang)}
              onClick={surClic(cle)}
              onPointerDown={surAppui(cle)}
              onPointerUp={lacher}
              onPointerLeave={lacher}
              onPointerCancel={lacher}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span aria-hidden="true" data-carre-info="" className="fs-carre-info" style={{ color: dark ? ENCRE_SOMBRE_CARRE : C.mute2 }}>
                <IconeInfoJauge />
              </span>
              <span data-carre-chiffre="" style={{
                fontSize: illimite ? 13 : 17, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15,
                marginTop: 1, paddingTop: illimite ? 3 : 0, color: illimite ? encreIllimite : dark ? C.paper : C.ink,
              }}>
                {valeur}
              </span>
              <span style={{ fontWeight: 600, color: dark ? ENCRE_SOMBRE_CARRE : C.mute2, overflowWrap: 'anywhere' }} className="fs-carre-mot" data-carre-mot="">
                {mot}
              </span>
            </button>
          );
        })}
      </div>
      {ouverte && (
        <ExplicationJauge key={ouverte.cle} cle={ouverte.cle} lang={lang} ouvreur={ouverte.carre} onFermer={() => { longFait.current = false; setOuverte(null); }} />
      )}
      <div style={{ fontSize: 10.5, fontWeight: 600, color: dark ? ENCRE_SOMBRE_CARRE : C.mute2, textAlign: 'right', margin: '4px 2px 12px' }}>
        {fr ? 'par mois' : 'a month'}
      </div>
    </div>
  );
}

// Le CORPS d'une carte de la grille : accroche (si demandée), 3 tuiles, lignes. Exporté pour PlanDetailsModal
// (« Ton plan ») : mêmes tuiles et mêmes lignes que la carte des offres — une seule source, plus de liste à
// part qui dérive. Aucun prix ici (règle Founder : le prix vit dans l'en-tête des cartes d'offre seulement).
export function CorpsCarteGrille({ fr, palier, K, dark = false, accroche = false, margeBas = 18 }) {
  const p = palierCarte(palier);
  return (
    <>
      {accroche && (
        <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, color: dark ? 'rgba(246,245,241,0.72)' : C.mute2, marginBottom: 12 }}>
          {ACCROCHES[p][fr ? 0 : 1]}
        </div>
      )}
      <TuilesGrille fr={fr} palier={p} K={K} dark={dark} />
      <LignesRendu lignes={lignesGrille(fr, p, K)} dark={dark} margeBas={margeBas} />
    </>
  );
}

// Carte Free (2026-09-02 soir) — le POINT DE DÉPART, pas une offre : fond
// sobre, pas de CTA d'achat. Bascule quotas : plus de bandeau de grant, les
// cinq lignes de gestes disent tout (5 annonces, 50 republications par mois…).
// (04/10 soir, option « Sans ordinateur ») SEULE exception au « pas de CTA » :
// interrupteur coché et hôte qui sait le faire (`voieCloud`), la carte porte
// la voie « Free + FillSell Cloud » et son prix « 0 € + 24,99 € ». Sinon, la
// carte d'avant, au balisage près.
function FreePlanCard({ fr, estMonPlan, K, cloud = null, voieCloud = null }) {
  // (04/11) Grille à 3 jauges : accroche, tuiles et lignes de la maquette ; sinon la carte d'avant.
  const grille = grilleActiveConfig(K);
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 22, padding: '20px 18px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: grille ? 6 : 14 }}>
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
        {cloud && voieCloud ? <PrixAvecCloud prix={prixGratuit(fr ? 'fr' : 'en')} cloud={cloud} encreClaire={C.mute2} lang={fr ? 'fr' : 'en'} /> : (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: C.mute2, lineHeight: 1 }}>{prixGratuit(fr ? 'fr' : 'en')}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.mute, marginTop: 2 }}>{fr ? '/mois' : '/mo'}</div>
        </div>
        )}
      </div>
      {grille ? <CorpsCarteGrille fr={fr} palier="free" K={K} accroche /> : <LignesDiff fr={fr} palier="free" K={K} />}
      {voieCloud}
    </div>
  );
}

// Carte Premium (CAS 3) — badge repris de PlanBadge, jamais recréé.
// Bascule quotas (02/09 soir) : le bandeau de grant et ses équivalences
// « ≈ N articles OU M analyses » (27/08) sont MORTS — les unités ont disparu
// de l'expérience, les cinq lignes de gestes portent tous les volumes.
// (Props historiques de la monnaie interne — grantPrem, lensCost, lensScans,
// articles, genPrice, pubUnit, repubPrice — RETIRÉES de la signature le
// 2026-09-04 : aucun corps ne les lisait depuis la bascule du 02/09. Les hôtes
// peuvent continuer de les passer, une prop non destructurée est ignorée.
// Seules fr/K/onUpgrade servent.)
// `cloud` (option « Sans ordinateur », 04/10) : null = la carte d'avant, au
// balisage près ; { essai } = l'interrupteur commun est coché — le prix dit
// « 12,99 € + 24,99 € » et le bouton nomme l'option. Même prop sur les trois cartes.
const suffixeCloud = (fr, cloud) => (cloud ? textesCloud(fr ? 'fr' : 'en').ctaSuffixe : '');

function PremiumPlanCard({ fr, K, onUpgrade, cloud = null }) {
  const grille = grilleActiveConfig(K);
  return (
    <div style={{
      background: C.paper, border: `1.5px solid ${C.teal}`, borderRadius: 22,
      padding: '20px 18px 18px', boxShadow: '0 12px 30px -16px rgba(27,110,98,0.4)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: grille ? 6 : 14 }}>
        <PremiumBadge />
        {cloud ? <PrixAvecCloud prix={prixPlan('premium', fr)} cloud={cloud} lang={fr ? 'fr' : 'en'} /> : (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: C.ink, lineHeight: 1 }}>{prixPlan('premium', fr)}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.mute, marginTop: 2 }}>{fr ? '/mois' : '/mo'}</div>
        </div>
        )}
      </div>
      {/* Les cinq lignes de gestes (bascule 02/09) — cf. lignesDiff : mêmes
          lignes, même ordre sur les QUATRE cartes ; la croix « Republication
          automatique » reste le levier visible vers Pro. */}
      {grille ? <CorpsCarteGrille fr={fr} palier="premium" K={K} accroche /> : <LignesDiff fr={fr} palier="premium" K={K} />}
      <button
        {...boutonAchat('premium', onUpgrade, {
          width: '100%', padding: 15, border: 'none', borderRadius: 14,
          background: `linear-gradient(120deg,${C.teal},${C.tealDeep})`, color: '#fff',
          fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          boxShadow: '0 10px 22px -8px rgba(47,158,144,0.5)',
        })}
      >
        {fr ? 'Passer Premium' : 'Go Premium'}{suffixeCloud(fr, cloud)}
      </button>
    </div>
  );
}

// Carte Pro (CAS 4) — fond sombre, badge ProBadge.
// ⚠️ Aucune promesse « Lens illimité » : Lens est payant en unités sur TOUS les
// paliers. On annonce ce que le grant permet réellement (calculé).
// Exportée pour PlanDetailsModal (2026-07-24) : la modale du badge la réutilise
// comme upsell Pro pour les Premium — source UNIQUE de ce que Pro promet.
// Mêmes props mortes retirées qu'au-dessus (+ proFactor / showFactor).
export function ProPlanCard({ fr, K, onUpgrade, cloud = null }) {
  const grille = grilleActiveConfig(K);
  return (
    <div style={{
      position: 'relative',
      background: `radial-gradient(130% 120% at 100% 0%, rgba(232,149,109,0.28), transparent 58%), ${C.ink}`,
      border: '1.5px solid rgba(214,178,96,0.55)', borderRadius: 22,
      padding: '20px 18px 18px', boxShadow: '0 14px 34px -14px rgba(16,32,27,0.5)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: grille ? 6 : 14 }}>
        <ProBadge />
        {cloud ? <PrixAvecCloud prix={prixPlan('pro', fr)} cloud={cloud} sombre taille={24} lang={fr ? 'fr' : 'en'} /> : (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: C.paper, lineHeight: 1 }}>{prixPlan('pro', fr)}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(246,245,241,0.6)', marginTop: 2 }}>{fr ? '/mois' : '/mo'}</div>
        </div>
        )}
      </div>
      {/* Bascule quotas (02/09 soir) : bandeau de grant et équivalences MORTS
          — les cinq lignes de gestes portent les volumes. La phrase de
          republication automatique reste STRICTEMENT identique à Business. */}
      {grille ? <CorpsCarteGrille fr={fr} palier="pro" K={K} dark accroche /> : <LignesDiff fr={fr} palier="pro" dark K={K} />}
      <button
        {...boutonAchat('pro', onUpgrade, {
          width: '100%', padding: 15, border: 'none', borderRadius: 14,
          background: `linear-gradient(120deg,${C.amber},#F2B48C)`, color: C.ink,
          fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          boxShadow: '0 10px 22px -8px rgba(232,149,109,0.5)',
        })}
      >
        {fr ? 'Passer Pro' : 'Go Pro'}{suffixeCloud(fr, cloud)}
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
// Mêmes props mortes retirées qu'au-dessus.
export function BusinessPlanCard({ fr, K, onUpgrade, cloud = null }) {
  const grille = grilleActiveConfig(K);
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: `radial-gradient(140% 110% at 0% 0%, rgba(155,232,220,0.16), transparent 55%), radial-gradient(130% 120% at 100% 100%, rgba(242,201,138,0.14), transparent 55%), #060B09`,
      border: '1.5px solid rgba(174,233,223,0.5)', borderRadius: 22,
      padding: '20px 18px 18px',
      boxShadow: '0 16px 40px -14px rgba(0,0,0,0.65), 0 0 30px -8px rgba(174,233,223,0.35)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: grille ? 6 : 14 }}>
        <BusinessBadge />
        {cloud ? <PrixAvecCloud prix={prixPlan('business', fr)} cloud={cloud} sombre taille={24} lang={fr ? 'fr' : 'en'} /> : (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: C.paper, lineHeight: 1 }}>{prixPlan('business', fr)}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(246,245,241,0.6)', marginTop: 2 }}>{fr ? '/mois' : '/mo'}</div>
        </div>
        )}
      </div>
      {/* Bascule quotas (02/09 soir) : bandeau de grant et équivalences MORTS
          — les cinq lignes de gestes portent les volumes, dont la
          republication ILLIMITÉE, le vrai différenciateur Business. */}
      {/* Lignes différenciantes (02/09 soir, cf. lignesDiff) — MÊMES phrases
          que Pro sur les trois lignes, y compris le support (« prioritaire »,
          promesse de priorité seulement, garde-fou du 09/08 inchangé) : seul
          le volume d'unités distingue Business, et il est au-dessus. */}
      {grille ? <CorpsCarteGrille fr={fr} palier="business" K={K} dark accroche /> : <LignesDiff fr={fr} palier="business" dark K={K} />}
      <button
        {...boutonAchat('business', onUpgrade, {
          width: '100%', padding: 15, border: 'none', borderRadius: 14,
          background: 'linear-gradient(120deg,#F4FFFD,#9BE8DC 55%,#F2C98A)', color: '#060B09',
          fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          boxShadow: '0 10px 26px -8px rgba(174,233,223,0.55)',
        })}
      >
        {fr ? 'Passer Business' : 'Go Business'}{suffixeCloud(fr, cloud)}
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
// (Option « Sans ordinateur », 04/10 soir) `avant` : l'interrupteur commun,
// posé AU-DESSUS de toutes les cartes (Free comprise : l'option se prend
// aussi seule). `cloud` passe aux cartes payantes ; `voieCloudFree` est la
// voie « Free + Sans ordinateur » de la carte Free (null = carte d'avant).
function PlansStack({ fr, tiers, K, onUpgrade, showFree = false, avant = null, cloud = null, voieCloudFree = null }) {
  const showPremium = tiers.includes('premium');
  const showPro = tiers.includes('pro');
  const showBusiness = tiers.includes('business');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {avant}
      {/* Le Free ouvre la pile QUAND le lecteur est en Free (02/09 soir) :
          c'est son point de départ — il voit ce qu'il a, puis ce que payer
          change, ligne à ligne. Jamais montré aux payants (rien à y lire). */}
      {/* ⛔ (08/11, point 0 de Nico, achat « formule + Cloud » cassé) Le Cloud ne se combine JAMAIS à une carte
          payante : Apple et Google ne vendent qu'un abonnement par feuille, et le parcours combiné n'achetait que la
          formule. Seule la carte Free porte sa voie « Free + FillSell Cloud » (le Cloud seul, son propre achat) ;
          un compte payant ajoute le Cloud par la carte d'ajout, APRÈS sa formule. */}
      {showFree && <FreePlanCard fr={fr} K={K} estMonPlan cloud={cloud} voieCloud={voieCloudFree} />}
      {showPremium && <PremiumPlanCard fr={fr} K={K} onUpgrade={onUpgrade} cloud={null} />}
      {showPro && <ProPlanCard fr={fr} K={K} onUpgrade={onUpgrade} cloud={null} />}
      {showBusiness && <BusinessPlanCard fr={fr} K={K} onUpgrade={onUpgrade} cloud={null} />}
    </div>
  );
}

// ⛔ PORTAIL SUR document.body — OBLIGATOIRE, ET DÉMONTRÉ (2026-09-18).
// Rendue dans l’arbre d’App, cette feuille vit sous .app-root, qui est un
// conteneur de défilement/rognage. WebKit y peint les position:fixed DANS
// SA COUCHE : par-dessus une page elle-même portalisée sur body (la page
// Réglages, z-index 400), la feuille restait INVISIBLE malgré son z-index
// 9990 — constaté sur Safari iOS par Nico, bundle vérifié à l’empreinte.
// Aucun ancêtre ne porte transform/filter/contain/isolation : ce n’est donc
// pas explicable par l’empilement CSS, c’est un comportement WebKit. Le
// portail est le seul remède qui marche dans ce dépôt (c’est déjà celui des
// écrans de republication, qui s’affichent correctement).
// ⛔ CHANGEMENT DE POINT DE MONTAGE, ET RIEN D’AUTRE : même balisage, mêmes
//    styles, mêmes gestes, même télémétrie. Les hôtes (App, stepper) ne
//    voient aucune différence — un portail ne change ni le contexte React,
//    ni les props, ni les événements.
function Sheet({ onClose, children }) {
  return createPortal(
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
    </>,
    document.body,
  );
}

// ══ LES MURS, UN PAR JAUGE (04/11/2026, maquettes 5.1 → 5.5) — grille à 3 jauges seulement ════════════════════
// Chaque mur dit quelle jauge est pleine, quand elle revient (si le serveur l'a dit — jamais une date inventée)
// et ce qui marche encore, PUIS propose UNE carte : le palier qui débloque, le plus proche, pas le plus cher
// (palierQuiDebloque). Les autres formules restent à un appui (« Voir toutes les formules »). Pour TOUT palier :
// avant le 04/11, un Premium au mur ne lisait que « Passe au volume supérieur. ».
// ⛔ Le chiffre du titre vient du refus du serveur (quotaInfo.plafond, plafondRepub.plafond) : sans lui, la
//    phrase ne dit AUCUN nombre (règle du 26/10 : jamais le plafond d'un autre palier prêté à un compte).

// La carte d'un palier, par son nom (le mur n'en montre qu'une).
function CarteDuPalier({ palier, ...props }) {
  if (palier === 'premium') return <PremiumPlanCard {...props} />;
  if (palier === 'pro') return <ProPlanCard {...props} />;
  if (palier === 'business') return <BusinessPlanCard {...props} />;
  return null;
}

// La pastille du palier actuel, en tête d'un mur (même gabarit que les vues des offres).
function PastillePlan({ fr, isPremium, isPro, isBusiness }) {
  if (!isPremium && !isPro && !isBusiness) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12,
        background: C.paper, border: `1px solid ${C.border}`, borderRadius: 999,
        padding: '5px 11px', fontSize: 11, fontWeight: 600, color: C.mute,
      }}>
        {fr ? 'Tu es en Free' : "You're on Free"}
      </div>
    );
  }
  return (
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
  );
}

// « Aujourd'hui : 40 annonces · 400 publications · 1 500 remontées par mois » (maquettes 2.2 et 2.3) : ce que le
// payant A, en une ligne, avant ce que le palier au-dessus change. Volumes de grilleDuPalier ; aucun prix.
function ResumePalier({ fr, palier, K }) {
  const lang = fr ? 'fr' : 'en';
  const g = grilleDuPalier(K, palier);
  const gras = { color: C.ink, fontWeight: 700, fontVariantNumeric: 'tabular-nums' };
  return (
    <div data-resume-palier={palier} style={{
      background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: '9px 12px', marginBottom: 12,
      fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: C.mute2,
    }}>
      {fr ? "Aujourd'hui : " : 'Today: '}
      {JAUGES.map((cle, i) => (
        <span key={cle}>
          {i > 0 ? ' · ' : null}
          {g[cle] === Infinity
            ? <>{motJauge(cle, 2, lang)} <b style={gras}>{fr ? 'illimitées' : 'unlimited'}</b></>
            : <><b style={gras}>{nombre(g[cle], lang)}</b> {motJauge(cle, 2, lang)}</>}
        </span>
      ))}
      {fr ? ' par mois' : ' a month'}
    </div>
  );
}

// Les mots d'un mur (maquettes 5.1 → 5.5). `plafond` : du serveur, ou null (alors aucun nombre).
function textesDuMur({ fr, geste, palier, plafond, remise, publicationsRestantes, remonteesRestantes }) {
  const lang = fr ? 'fr' : 'en';
  const nom = NOMS_PALIERS[palier] ?? 'Free';
  const n = plafond != null ? nombre(plafond, lang) : null;
  const retour = remise ? (fr ? <> Elles reviennent le {remise}.</> : <> They come back on {remise}.</>) : null;
  const pubs = publicationsRestantes != null
    ? `${nombre(publicationsRestantes, lang)} ${motJauge('publications', publicationsRestantes, lang)}` : null;
  if (geste === 'publications') {
    return {
      titre: fr ? (n ? `Tes ${n} publications du mois sont faites.` : 'Tes publications du mois sont faites.')
                : (n ? `Your ${n} publications for this month are done.` : "This month's publications are done."),
      fait: fr
        ? <>Une publication, c'est une mise en ligne sur une plateforme. {n
            ? <>Ton plan {nom} en comprend <b>{n} par mois</b> : elles sont toutes faites, rien n'a été décompté.</>
            : <>Celles de ton plan {nom} pour ce mois sont toutes faites, rien n'a été décompté.</>}{retour}</>
        : <>A publication is one listing put online on one platform. {n
            ? <>Your {nom} plan includes <b>{n} a month</b>: they are all done, nothing was deducted.</>
            : <>Your {nom} plan's publications for this month are all done, nothing was deducted.</>}{retour}</>,
      encore: fr ? "Tes articles restent dans ton stock, rien n'est perdu." : 'Your items stay in your stock, nothing is lost.',
      encoreSous: fr ? "L'import, la synchro et le retrait après une vente continuent, sans compter."
                     : 'Imports, syncs and removal after a sale keep going, without counting.',
    };
  }
  if (geste === 'remontees') {
    // La définition n'est rappelée qu'au Free (maquette 5.3) : le payant connaît déjà le geste.
    const def = palier === 'free'
      ? (fr ? "Une remontée remet une annonce en haut d'une plateforme. " : 'A bump puts a listing back at the top of a platform. ') : null;
    return {
      titre: fr ? (n ? `Tes ${n} remontées du mois sont faites.` : 'Tes remontées du mois sont faites.')
                : (n ? `Your ${n} bumps for this month are done.` : "This month's bumps are done."),
      fait: fr
        ? <>{def}{n
            ? <>Ton plan {nom} en comprend <b>{n} par mois</b> : elles sont toutes faites, rien n'a été décompté.</>
            : <>Celles de ton plan {nom} pour ce mois sont toutes faites, rien n'a été décompté.</>}{retour}</>
        : <>{def}{n
            ? <>Your {nom} plan includes <b>{n} a month</b>: they are all done, nothing was deducted.</>
            : <>Your {nom} plan's bumps for this month are all done, nothing was deducted.</>}{retour}</>,
      encore: fr ? 'Tes annonces restent en ligne et à vendre.' : 'Your listings stay online and for sale.',
      encoreSous: pubs ? (fr ? `Tu peux toujours publier : il te reste ${pubs}.` : `You can still publish: you have ${pubs} left.`) : null,
    };
  }
  if (geste === 'lens') {
    return {
      titre: fr ? (n ? `Tes ${n} scans Lens du mois sont faits.` : 'Tes scans Lens du mois sont faits.')
                : (n ? `Your ${n} Lens scans for this month are done.` : "This month's Lens scans are done."),
      fait: fr ? <>{remise ? <>Ils reviennent le {remise}. </> : null}Rien n'a été décompté.</>
               : <>{remise ? <>They come back on {remise}. </> : null}Nothing was deducted.</>,
      encore: fr ? 'Tout le reste continue, sans limite.' : 'Everything else keeps going, with no limit.',
      encoreSous: fr ? "Rédaction par l'IA depuis tes photos, publications et remontées : illimitées."
                     : 'AI write-ups from your photos, publications and bumps: unlimited.',
    };
  }
  if (geste === 'auto') {
    return {
      titre: fr ? 'Laisse tes annonces remonter toutes seules.' : 'Let your listings rise on their own.',
      fait: fr ? 'La republication automatique est incluse dès le Pro. Tu choisis le créneau et les jours : tes annonces remontent sans que tu y penses.'
               : 'Automatic reposting is included from Pro. You pick the time slot and the days: your listings bump themselves without you thinking about it.',
      encore: fr ? 'Tu peux toujours remonter tes annonces toi-même.' : 'You can still bump your listings yourself.',
      encoreSous: remonteesRestantes != null
        ? (fr ? `Il t'en reste ${nombre(remonteesRestantes, lang)} ce mois-ci.` : `You have ${nombre(remonteesRestantes, lang)} left this month.`) : null,
    };
  }
  // annonces (un scan Lens refusé hors Business arrive ici : la jauge Annonces compte les deux)
  return {
    titre: fr ? (n ? `Tes ${n} annonces du mois sont créées.` : 'Tes annonces du mois sont créées.')
              : (n ? `Your ${n} listings for this month are created.` : "This month's listings are created."),
    fait: fr
      ? (n ? <>Ton plan {nom} comprend <b>{n} annonces par mois</b>, rédigées par l'IA ou scannées avec Lens. Elles sont toutes utilisées, rien n'a été décompté.{retour}</>
           : <>Les annonces de ton plan {nom} pour ce mois, rédigées par l'IA ou scannées avec Lens, sont toutes utilisées, rien n'a été décompté.{retour}</>)
      : (n ? <>Your {nom} plan includes <b>{n} listings a month</b>, written by the AI or scanned with Lens. They are all used, nothing was deducted.{retour}</>
           : <>Your {nom} plan's listings for this month, written by the AI or scanned with Lens, are all used, nothing was deducted.{retour}</>),
    encore: fr ? 'Ce qui est déjà rédigé se publie toujours.' : 'What is already written can still be published.',
    encoreSous: pubs ? (fr ? `Il te reste ${pubs} ce mois-ci.` : `You have ${pubs} left this month.`) : null,
  };
}

// Le petit libellé au-dessus de la carte proposée (maquettes 5.x) : ce que CE palier change pour CETTE jauge.
function rubanDuMur(geste, reco, K, fr) {
  const lang = fr ? 'fr' : 'en';
  const v = grilleDuPalier(K, reco)[geste === 'auto' ? 'remontees' : geste];
  const illimite = v === Infinity;
  const n = illimite ? null : nombre(v, lang);
  const autoInclus = reco === 'pro' || reco === 'business';
  if (geste === 'annonces') return illimite ? (fr ? 'Pour ne plus compter tes annonces' : 'To stop counting your listings')
    : (fr ? `Pour créer plus d'annonces : ${n} par mois` : `To create more listings: ${n} a month`);
  if (geste === 'publications') return illimite ? (fr ? 'Pour publier sans compter' : 'To publish without counting')
    : (fr ? `Pour publier plus : ${n} par mois` : `To publish more: ${n} a month`);
  if (geste === 'remontees') return illimite
    ? (autoInclus ? (fr ? 'Remontées illimitées, et toutes seules' : 'Unlimited bumps, and on their own') : (fr ? 'Remontées illimitées' : 'Unlimited bumps'))
    : (fr ? `Pour remonter plus : ${n} par mois` : `To bump more: ${n} a month`);
  return illimite ? (fr ? 'Toutes seules, et illimitées' : 'On their own, and unlimited') : (fr ? 'Toutes seules' : 'On their own');
}

// Le mur (maquette mur()) : pastille · titre-fait · carte du fait · carte menthe « ce qui marche encore » ·
// libellé + UNE carte · « Voir toutes les formules » · la sortie. Sans palier au-dessus (Lens du Business) :
// aucune offre, un bouton « Fermer ». Les sorties passent par les mêmes fonctions que les autres vues
// (onFond = tap hors de la feuille, onSortie = le lien ou le bouton du bas) : la télémétrie ne change pas.
// (04/11, maquette 5.4) `action` : { libelle, onClick } — le geste qui reste (Lens du Business : « Créer une
// annonce depuis mes photos »), rendu SEULEMENT si l'hôte sait le faire ; absent, rien de neuf.
function MurDeJauge({ fr, geste, pastille, titre, fait, encore, encoreSous, ruban, carte, onVoirTout, sortie, boutonFermer, onFond, onSortie, action = null }) {
  return (
    <Sheet onClose={onFond}>
      <div data-mur-jauge={geste}>
        {pastille}
        <Title>{titre}</Title>
        <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 14px', marginBottom: 10, fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: C.ink }}>
          {fait}
        </div>
        <div style={{ background: '#E8F5F3', border: `1px solid ${C.teal}`, borderRadius: 16, padding: '11px 14px', marginBottom: 16, fontSize: 12.5, fontWeight: 700, lineHeight: 1.5, color: C.tealDeep }}>
          {encore}
          {encoreSous ? <div style={{ fontSize: 11.5, fontWeight: 600, color: C.mute2, marginTop: 2 }}>{encoreSous}</div> : null}
        </div>
        {carte ? (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.mute, margin: '2px 2px 8px' }}>
              {ruban}
            </div>
            {carte}
          </>
        ) : null}
        {action ? (
          <button type="button" data-mur-action="" onClick={action.onClick} style={{
            width: '100%', padding: 15, border: 'none', borderRadius: 14,
            background: `linear-gradient(120deg,${C.teal},${C.tealDeep})`, color: '#fff',
            fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            boxShadow: '0 10px 22px -8px rgba(47,158,144,0.5)',
          }}>
            {action.libelle}
          </button>
        ) : null}
        {onVoirTout ? (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button type="button" onClick={onVoirTout} style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 700, color: C.tealDeep, textDecoration: 'underline', textUnderlineOffset: 3,
            }}>
              {fr ? 'Voir toutes les formules' : 'See all plans'}
            </button>
          </div>
        ) : null}
        {boutonFermer ? (
          <button type="button" onClick={onSortie} style={{
            width: '100%', marginTop: 16, padding: '13px 0', borderRadius: 999,
            background: 'none', border: `1px solid ${C.border}`, cursor: 'pointer',
            fontSize: 13.5, fontWeight: 700, color: C.mute2, fontFamily: 'inherit',
          }}>
            {sortie}
          </button>
        ) : (
          <Dismiss onClose={onSortie} label={sortie} />
        )}
      </div>
    </Sheet>
  );
}

// ── Modale ───────────────────────────────────────────────────────────────────

// (13/11/2026, audit des paiements de Nico) La montée d'un abonné : ce qui est prélevé et quand (utils/texteMontee.js).
function NoteMontee({ fr, canal }) {
  return <p data-note-montee={canal} style={{ margin: '10px 2px 0', fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: C.mute2 }}>{texteMontee(canal, fr)}</p>;
}

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
  // (itemCount / stockLimit : props RETIRÉES le 2026-09-04 avec la branche
  // stockFull — elles ne servaient qu'à la puce « N/200 articles ». Les deux
  // hôtes les passent encore ; une prop non lue est ignorée sans effet, et
  // les laisser là évite de toucher App.jsx et ListingPreviewScreen dans un
  // commit qui ne concerne que la modale.)
  // (coinBalance/coinPrice/onUseCoins : props supprimées le 03/09 avec la
  // monnaie interne — plus aucun hôte ne les passe.)
  // Point d'entrée EXACT (même vocabulaire que le tunnel d'App.jsx) — sert la
  // télémétrie de la modale elle-même, jamais l'affichage.
  origine      = null,
  // trigger 'republish_cap' UNIQUEMENT : { plafond, faites, remise_le }
  // renvoyés par le refus serveur plafond_republication_free (50 PAR MOIS
  // depuis le 05/10 ; remise_le = la remise à zéro du compte).
  plafondRepub = null,
  // trigger 'quota_geste' UNIQUEMENT : { geste: 'annonces'|'retouches',
  // plafond, consommes } — le refus serveur quota_*_atteint relayé par l'hôte.
  // ('scans' a disparu le 02/09 soir — fusion scans+annonces, un seul geste.)
  // (04/11, grille à 3 jauges) gestes en plus : 'publications' | 'remontees' | 'lens' (Lens du Business), et
  // champs facultatifs remise_le (la remise à zéro, rendue par le serveur), restantes, publications_restantes
  // (pour « Il te reste N publications » sous les murs Annonces et Remontées). Absents : rien d'affiché.
  quotaInfo    = null,
  // Code d'offre arrivé par un lien d'e-mail (lib/offreMail, 26/09) — web
  // seulement, l'hôte passe null en natif. Sert UNIQUEMENT à dire, sur la vue
  // Free, que la remise s'appliquera au paiement ; c'est le serveur qui
  // l'applique réellement (create-checkout-session).
  offre        = null,
  // (03/10, point 20) Free UNIQUEMENT : { restantes, plafond, remise_le } — ses
  // republications du mois (quotas_etat ; 50 par mois depuis le 05/10). Le mur
  // des republications (en lot, automatique) dit d'abord ce qu'il A DÉJÀ.
  repubOffertes = null,
  // (04/11, grille à 3 jauges, décision de Nico) Le Premium : ses remontées restantes du mois (quotas_etat), pour le
  // mur de l'automatique (« Il t'en reste N ce mois-ci »). null (défaut, et pour le Free qui passe par
  // repubOffertes) : rien ne change.
  remonteesRestantes = null,
  // (06/10 soir) Articles en stock (App : items non vendus) — relu pour UNE
  // chose : le bouton « Republier mes annonces » n'a rien à proposer sur un
  // stock vide. null (hôte qui ne le passe pas) = comportement d'avant.
  itemCount = null,
  // (04/10, option « Sans ordinateur », conception) Ajouter l'option à la
  // formule DÉJÀ payée, sans changer de palier. ⛔ Jamais via
  // onUpgrade(palier actuel) : les hôtes lanceraient un second abonnement.
  // Aucun hôte ne la passe tant que le paiement de l'option n'existe pas —
  // absente, la carte d'ajout n'est pas rendue.
  onAjouterCloud = null,
  // (04/10 soir) Prendre l'option SEULE sur un compte Free (« Free + Sans
  // ordinateur », quotas Free gardés). ⛔ Jamais via onUpgrade('free'), qui
  // partirait en paiement de formule. Absente, la carte Free n'a pas de bouton.
  onCloudSeul = null,
  // (15/10, P17) { ecran } : l'écran d'où la modale s'ouvre (stock, lens,
  // ventes, stats, reglages, stepper…) — télémétrie seulement, jamais l'affichage.
  contexte = null,
  // (04/11, grille à 3 jauges) L'hôte sait déjà, par quotas_etat, que la grille est active (grilleActive(quotas)).
  // Tant que coin_config n'est pas lue, la feuille part alors sur le repli AVEC la grille (grilleDuPalier se replie
  // sur GRILLE_REPLI) au lieu d'un éclair de l'ancienne feuille ; la config lue fait foi ensuite. false (défaut) :
  // rien ne change.
  grille: grilleHote = false,
  // (04/11, grille à 3 jauges, maquette 5.4) Le mur Lens du Business : « Créer une annonce depuis mes photos » ouvre la
  // création d'annonce par photos SANS Lens (rédaction par l'IA, comptée en annonces, illimitées chez le Business).
  // Seul l'hôte sait si c'est possible (photos à l'écran, parcours monté) : absente (null), le bouton n'est pas rendu.
  onCreerDepuisPhotos = null,
  // (11/11/2026) Les formules avec Cloud : (formule, { essaiAffiche, dejaCloud }) => l'achat (cloud/achatFormuleCloud.js).
  // Absente (null) : jamais d'interrupteur « Sans Cloud | Avec Cloud », la feuille d'avant.
  onFormuleCloud = null,
  // (11/11/2026) La position de départ demandée par l'hôte ('avec' | 'sans') ; null = la règle (vueOffresParDefaut).
  vueCloud = null,
}) {
  const fr = lang !== 'en';
  // (08/11, refus Google) Les prix de la boutique : l'écran se redessine quand ils arrivent (mobile).
  usePrixBoutique({ charger: Boolean(isOpen) });
  const [cfg, setCfg] = useState(null);
  // Vue interne : 'entry' = écran du cas d'entrée (packs d'unités en CAS 1/2) ;
  // 'plans' = vue comparative des abonnements. Depuis les CAS 1/2, le bouton
  // d'upsell BASCULE ici au lieu de partir en checkout — jamais de checkout
  // sans avoir vu la carte complète du plan (bug « Découvre Pro » 2026-07-22).
  const [view, setView] = useState('entry');
  useEffect(() => { if (isOpen) setView('entry'); }, [isOpen]);

  // ══ Option « Sans ordinateur » (Cloud, conception du 04/10/2026) ═══════════
  // UN interrupteur commun aux cartes payantes (décision Nico : une option à
  // 24,99 €/mois depuis le 03/11, EN PLUS d'un palier, pas un 4e palier). Drapeau baissé : aucune
  // lecture, aucun rendu, et `offreCloud` vaut null — onUpgrade(tier) part
  // alors à l'identique. L'état du compte (essai déjà pris, option active…)
  // se lit dans une requête À PART (useCloudProfil) : illisible = rien montré.
  // Ouverte depuis la 2e voie (trigger 'cloud') : l'interrupteur arrive coché.
  // (05/11 soir, phase 3 point 3) L'offre du Cloud ne se montre qu'en France (et aux témoins) : cloudOffreVendable.
  const cloudVisible = cloudOffreVendable(userId);
  // (11/11/2026) Les formules avec Cloud se montrent-elles ? Le canal de l'app (web → Stripe, iPhone → Apple, Android →
  // Google), son interrupteur serveur (ou un témoin), et un hôte qui sait acheter. Faux : rien de ce qui suit ne lit,
  // ne demande ni ne rend quoi que ce soit.
  let plateformeIci = 'web';
  try { plateformeIci = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web'; } catch { /* web */ }
  const formulesCanal = typeof onFormuleCloud === 'function' && formulesCloudVendables(userId, { plateforme: plateformeIci });
  const lectureCloud = useCloudProfil(userId, { actif: Boolean(isOpen && (cloudVisible || formulesCanal)) });
  const offreCloud = cloudVisible ? offreCloudPourModale(lectureCloud) : null;
  const profilFormules = useProfilFormules(userId, { actif: Boolean(isOpen && formulesCanal) });
  const venteFormules = useDisponibiliteCloud({ actif: Boolean(isOpen && formulesCanal) });
  useEffect(() => { if (isOpen && formulesCanal) demanderPrixFormules().catch(() => {}); }, [isOpen, formulesCanal]);
  // (13/11, décision de Nico : « on ouvre partout », plus aucun « … y arrivent bientôt ») Le canal de l'appareil est ouvert,
  // mais CE compte peut ne pas pouvoir prendre une formule ici : sa boutique qui facture est fermée (retour arrière), ou son
  // Cloud SEUL est facturé par l'App Store / Google Play (une formule serait un second abonnement). Les formules lui sont
  // alors MASQUÉES — la feuille d'avant, sans « Avec Cloud » — jamais une carte sans bouton ni une promesse.
  const formulesVisibles = formulesCanal && !formulesMasqueesPourLaVoie(cartesFormulesCloud({
    palier: palierDesDrapeaux({ isPremium, isPro, isBusiness }), formuleActuelle: profilFormules.formuleActuelle,
    canalApp: canalDeVente(plateformeIci), canalAbonnement: profilFormules.canalAbonnement,
    canalOuvert: formulesCloudOuvertes, canalCloud: canalDuCloudSeul(lectureCloud),
  }).voie);
  // La position choisie à la main ; null = la règle (le Cloud déjà pris, une porte Cloud, la voie du parcours d'entrée).
  const [vueChoisie, setVueChoisie] = useState(null);
  useEffect(() => { if (isOpen) setVueChoisie(null); }, [isOpen]);
  // (09/11, maquette B validée par Nico) Plus d'interrupteur : la carte FillSell Cloud a SON bouton (« Essayer 7 jours »)
  // qui prend le Cloud tout de suite (Free : seul ; payant : en plus de la formule). Les cartes des formules n'achètent
  // que leur formule — plus de « formule + Cloud ensuite » par un interrupteur coché.
  const avecCloud = false;
  // Un compte DÉJÀ payant ajoute l'option à SA formule par la carte d'ajout
  // (si l'hôte sait le faire) ; l'interrupteur des cartes ne sert alors pas.
  const ajoutCloudPossible = Boolean(isPremium && offreCloud?.mode === 'interrupteur' && typeof onAjouterCloud === 'function');
  const interrupteurMontre = offreCloud?.mode === 'interrupteur' && !ajoutCloudPossible;
  const cloudCarte = interrupteurMontre && avecCloud ? { essai: offreCloud.essai } : null;

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
  // (15/10, P17) OÙ, APRÈS QUOI, COMMENT, COMBIEN DE TEMPS. Chaque ouverture
  // porte un identifiant, l'écran (prop contexte), le dernier geste marquant
  // (utils/dernierGeste.js, en mémoire), le canal et l'âge du compte ; chaque
  // fermeture sans formule choisie dit sa SORTIE — non_merci (le lien du bas),
  // fond (tap hors de la feuille), echap, quitte (page cachée ou quittée, la
  // modale encore ouverte), fermee_par_app (l'app l'a fermée : retour Android,
  // navigation) — et sa durée. Une seule fermeture notée par ouverture.
  const ouvertureRef = useRef({ id: null, le: 0, notee: true });
  const contexteDeLogs = () => {
    let canal = 'web_ordinateur';
    try { canal = canalDeLApp({ natif: Capacitor.isNativePlatform(), plateforme: Capacitor.getPlatform() }); } catch { /* web */ }
    return { ecran: contexte?.ecran ?? null, ...lireDernierGeste(), canal };
  };
  const noterFermeture = (sortie) => {
    const o = ouvertureRef.current;
    if (o.notee || palierCliqueRef.current) return;
    o.notee = true;
    logModale('offers_modal_abandon', {
      origine: origine ?? 'non_precisee', trigger, view,
      paliers: paliersRef.current.join(','),
      ouverture: o.id, sortie, duree_ms: o.le ? Date.now() - o.le : null, ...contexteDeLogs(),
    });
  };
  const noterFermetureRef = useRef(noterFermeture);
  noterFermetureRef.current = noterFermeture;
  useEffect(() => {
    if (!isOpen) return;
    palierCliqueRef.current = false;
    ouvertureRef.current = { id: Math.random().toString(36).slice(2, 10), le: Date.now(), notee: false };
    logModale('offers_modal_open', { origine: origine ?? 'non_precisee', trigger, ouverture: ouvertureRef.current.id, ...contexteDeLogs(),
      // (04/11) Le geste du mur (quota_geste), pour savoir QUELLE jauge a ouvert la feuille. Rien d'autre ne change.
      ...(trigger === 'quota_geste' && quotaInfo?.geste ? { geste: quotaInfo.geste } : {}) });
    const quitte = () => { if (document.visibilityState === 'hidden') noterFermetureRef.current('quitte'); };
    const pageQuittee = () => noterFermetureRef.current('quitte');
    document.addEventListener('visibilitychange', quitte);
    window.addEventListener('pagehide', pageQuittee);
    return () => {
      document.removeEventListener('visibilitychange', quitte);
      window.removeEventListener('pagehide', pageQuittee);
      // Fermée sans passer par la modale (l'hôte l'a démontée ou repliée) :
      // retour Android, navigation, ou ouverture remplacée.
      noterFermetureRef.current('fermee_par_app');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  // Choix d'un palier : trace posée AVANT de passer la main au checkout — le
  // canal (Stripe/IAP) et checkout_open restent journalisés par l'hôte.
  // Option Cloud : le choix ne part QUE si l'interrupteur a été montré — sinon
  // l'appel reste onUpgrade(tier), un seul argument, comme avant le 04/10.
  const choisirPalier = (tier) => {
    palierCliqueRef.current = true;
    const choixCloud = interrupteurMontre;
    logModale('offers_modal_tier_click', { tier, origine: origine ?? 'non_precisee', trigger, view, ...(choixCloud ? { cloud: avecCloud } : {}),
      ouverture: ouvertureRef.current.id, duree_ms: ouvertureRef.current.le ? Date.now() - ouvertureRef.current.le : null, ...contexteDeLogs() });
    // (08/11, point 0) La carte d'un palier achète CE palier, et rien d'autre : plus jamais onUpgrade(tier, { cloud }).
    // (08/11, point 1) FillSell Cloud coché (interrupteur VISIBLE, voie Free) : l'hôte proposera l'étape 2 — son propre
    // achat — une fois la formule active (cloud/cloudEnsuite.js). Le bouton de la carte ne promet rien de plus.
    if (voieFree && avecCloud) onUpgrade(tier, { cloudEnsuite: true });
    else onUpgrade(tier);
  };
  const choisirCloudSeul = () => {
    palierCliqueRef.current = true;
    logModale('offers_modal_cloud_seul', { origine: origine ?? 'non_precisee', trigger, essai: offreCloud?.essai === true });
    onCloudSeul?.();
  };
  const ajouterCloud = () => {
    palierCliqueRef.current = true;
    logModale('offers_modal_cloud_ajout', { origine: origine ?? 'non_precisee', trigger, essai: offreCloud?.essai === true });
    onAjouterCloud?.();
  };
  // (11/11/2026) Une carte « Avec Cloud » choisie : la trace, puis l'achat par l'hôte (jamais onUpgrade).
  const choisirFormule = (carte) => {
    palierCliqueRef.current = true;
    logModale('offers_modal_formule_cloud', { formule: carte.formule, cta: carte.cta, essai: carte.essai === true, origine: origine ?? 'non_precisee', trigger,
      ouverture: ouvertureRef.current.id, duree_ms: ouvertureRef.current.le ? Date.now() - ouvertureRef.current.le : null, ...contexteDeLogs() });
    // (13/11) abonneBoutique : déjà abonné par la boutique de CE téléphone → jamais sa semaine gratuite (même groupe).
    onFormuleCloud?.(carte.formule, { essaiAffiche: carte.essai === true, dejaCloud: lectureCloud.cloud?.actif === true,
      abonneBoutique: plateformeIci !== 'web' && profilFormules.canalAbonnement === canalDeVente(plateformeIci) });
  };
  // TOUTES les sorties (backdrop, Escape, « Non merci ») passent ici : une
  // fermeture sans checkout est un abandon — avec les paliers qui étaient
  // affichés, pour savoir DEVANT QUOI l'utilisateur est parti.
  const fermer = (sortie = 'non_merci') => {
    noterFermeture(typeof sortie === 'string' ? sortie : 'non_merci');
    onClose();
  };
  const fermerParLeFond = () => fermer('fond');
  const fermerNonMerci = () => fermer('non_merci');

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
    const onKey = (e) => { if (e.key === 'Escape') fermer('echap'); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const K = cfg || (grilleHote === true ? { ...COIN_CONFIG_FALLBACK, grille_trois_jauges: 1 } : COIN_CONFIG_FALLBACK);
  // Suppression de la monnaie interne (02-03/09) : les anciens CAS 1/2 sont
  // MORTS (le serveur ne peut plus émettre insufficient_coins, prix à 0) et
  // leurs props ont disparu. La modale ne parle qu'en gestes et en plans.

  // ── Échelle des paliers (2026-08-09) ──────────────────────────────────────
  // Remplace l'ancien `isPro ? [] : isPremium ? ['pro'] : …`, qui codait en dur
  // « Pro = sommet » : un Pro s'y voyait dire « tu es déjà au maximum » et
  // Business n'était vendable NULLE PART dans l'UI.
  // Les flags étant CUMULATIFS (un Business porte aussi is_pro et is_premium),
  // le rang courant se lit du HAUT vers le bas, et n'est vendable que ce qui
  // est STRICTEMENT au-dessus.
  const RANG = { premium: 1, pro: 2, business: 3 };
  const rangCourant = PALIERS.indexOf(palierDesDrapeaux({ isPremium, isPro, isBusiness })); // utils/palier.js
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

  // ── Option « Sans ordinateur » : les blocs, montés selon le cas (04/10) ───
  // Tous valent null quand le drapeau est baissé (offreCloud null).
  const titreCloud = !formulesVisibles && trigger === 'cloud' && (interrupteurMontre || ajoutCloudPossible) ? textesCloud(lang).titreModale : null;
  // Option déjà active ou en pause : une ligne, jamais d'interrupteur.
  const ligneCloud = offreCloud && offreCloud.mode !== 'interrupteur' ? <LigneCloudModale offre={offreCloud} lang={lang} /> : null;
  // Free + Sans ordinateur (04/10 soir) : un compte Free prend l'option SEULE,
  // par le bouton dédié de la carte Free — seulement si l'hôte sait le faire.
  // Le nombre d'annonces vient de coin_config (K), jamais écrit ici.
  const voieFree = interrupteurMontre && !isPremium && typeof onCloudSeul === 'function';
  // (09/11, maquette B) Plus de section « Free + FillSell Cloud » dans la carte Free : la carte Cloud a son bouton.
  const voieCloudFree = null;
  // (09/11, maquette B validée par Nico) Compte Free : LA carte FillSell Cloud (CarteCloudOffres) au-dessus des formules,
  // son bouton « Essayer 7 jours » prend le Cloud seul (choisirCloudSeul) — à la place de l'interrupteur.
  // (11/11/2026) Formules avec Cloud visibles : le Cloud SEUL ne se vend plus (décision de Nico) — sa carte disparaît de
  // la position « Sans Cloud » ; la ligne « déjà actif » d'un client du Cloud seul reste (ses écrans ne changent pas).
  const blocCloud = formulesVisibles ? ligneCloud : interrupteurMontre
    ? (voieFree ? <CarteCloudOffres offre={offreCloud} onEssayer={choisirCloudSeul} lang={lang} /> : null)
    : ligneCloud;
  // Compte payant : la MÊME carte, avec le nom de la formule ; son bouton ajoute le Cloud à la formule (ajouterCloud).
  const carteCloudPayant = !formulesVisibles && ajoutCloudPossible
    ? <CarteCloudOffres offre={offreCloud} onEssayer={ajouterCloud} nomPalier={nomDuPalier(palierDesDrapeaux({ isPremium, isPro, isBusiness }))} lang={lang} />
    : null;
  const carteAjoutCloud = carteCloudPayant ? <div style={{ marginBottom: 12 }}>{carteCloudPayant}</div> : null;
  const blocCloudAuDessus = blocCloud ? <div style={{ marginBottom: 12 }}>{blocCloud}</div> : null;
  // (06/10) L'encart « Bientôt : FillSell Cloud » : SOUS les cartes, avant la
  // sortie — il n'éloigne aucun bouton d'abonnement. Il se masque seul (compte
  // qui a l'option, témoin de la vraie offre, interrupteur baissé).
  const encartCloud = <EncartCloudBientot lang={lang} userId={userId} />;

  // ══ LA GRILLE À 3 JAUGES (04/11/2026) — tout ce qui suit change DERRIÈRE grilleActiveConfig(K) ═════════════
  // Interrupteur à 0, ou config de repli (COIN_CONFIG_FALLBACK ne porte PAS grille_trois_jauges) : `grille` est
  // faux, aucun mur ne s'ouvre et chaque vue ci-dessous rend exactement ce qu'elle rendait.
  const grille = grilleActiveConfig(K);
  const palierIci = palierCarte(palierDesDrapeaux({ isPremium, isPro, isBusiness }));
  // Chez un payant, la carte d'ajout du Cloud passe SOUS les cartes (maquette 2.2 : c'est une option, elle ne
  // doit pas cacher la vraie montée). Sans la grille, elle reste au-dessus (carteAjoutCloud).
  const carteAjoutCloudSous = grille && carteCloudPayant ? <div style={{ marginTop: 12 }}>{carteCloudPayant}</div> : null;

  // ── Les murs, un par jauge (grille seulement, vue d'entrée) ──────────────────
  // quota_geste → la jauge du refus ('retouches' garde la feuille d'avant : compteur à part, inchangé ; un scan
  // Lens refusé hors Business compte en Annonces, la jauge qui compte les deux) ; republish_cap (refus du
  // Free) → Remontées ; republish_auto (Free, Premium) → le mur de l'automatique. « Voir toutes les formules »
  // bascule sur la vue complète du palier (view = 'plans'), où plus aucun mur ne s'ouvre.
  const gesteMur = !grille || view !== 'entry' ? null
    : trigger === 'quota_geste'
      ? (quotaInfo?.geste === 'retouches' ? null
        : quotaInfo?.geste === 'publications' || quotaInfo?.geste === 'remontees' ? quotaInfo.geste
        : quotaInfo?.geste === 'lens' && palierIci === 'business' ? 'lens'
        : 'annonces')
      : trigger === 'republish_cap' ? 'remontees'
      : trigger === 'republish_auto' && (palierIci === 'free' || palierIci === 'premium') ? 'auto'
      : null;
  if (gesteMur) {
    const lu = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
    // Le chiffre du titre vient du refus du serveur. Seule exception, déjà vraie avant la grille : le refus
    // plafond_republication_free est celui du Free, son propre volume (grilleDuPalier) peut le dire.
    const remonteesFree = grilleDuPalier(K, 'free').remontees;
    const plafondMur = gesteMur === 'auto' ? null
      : trigger === 'republish_cap'
        ? (lu(plafondRepub?.plafond) ?? (palierIci === 'free' && Number.isFinite(remonteesFree) ? remonteesFree : null))
        : lu(quotaInfo?.plafond);
    // (04/11, décision de Nico) La date des murs au format JJ/MM des maquettes (« Attendre le 16/11 »).
    const remiseMur = jourRemiseCourt(trigger === 'republish_cap' ? plafondRepub?.remise_le : quotaInfo?.remise_le, fr ? 'fr' : 'en');
    const mots = textesDuMur({
      fr, geste: gesteMur, palier: palierIci, plafond: plafondMur, remise: remiseMur,
      publicationsRestantes: lu(quotaInfo?.publications_restantes),
      remonteesRestantes: lu(repubOffertes?.restantes) ?? lu(remonteesRestantes),
    });
    // Le palier qui débloque — le plus proche, pas le plus cher — et seulement s'il est VENDABLE à ce compte
    // (offre Business, targetTiers) ; sinon le plus proche des vendables qui fait mieux sur cette jauge.
    const recoMur = (() => {
      if (gesteMur === 'lens') return null;
      if (gesteMur === 'auto') return ['pro', 'business'].find((p) => sellable.includes(p)) ?? null;
      const brut = palierQuiDebloque(gesteMur, palierIci, K);
      if (brut && sellable.includes(brut)) return brut;
      const ici = grilleDuPalier(K, palierIci)[gesteMur];
      return sellable.find((p) => grilleDuPalier(K, p)[gesteMur] > ici) ?? null;
    })();
    const sortieMur = gesteMur === 'lens' ? (fr ? 'Fermer' : 'Close')
      : gesteMur === 'auto' ? (fr ? 'Pas maintenant' : 'Not now')
      : remiseMur ? (fr ? `Attendre le ${remiseMur}` : `Wait until ${remiseMur}`)
      : (fr ? 'Non merci' : 'No thanks');
    return (
      <MurDeJauge
        fr={fr} geste={gesteMur}
        pastille={<PastillePlan fr={fr} isPremium={isPremium} isPro={isPro} isBusiness={isBusiness} />}
        titre={mots.titre} fait={mots.fait} encore={mots.encore} encoreSous={mots.encoreSous}
        ruban={recoMur ? rubanDuMur(gesteMur, recoMur, K, fr) : null}
        carte={recoMur ? <CarteDuPalier palier={recoMur} fr={fr} K={K} onUpgrade={choisirPalier} /> : null}
        onVoirTout={sellable.length > 0 ? () => setView('plans') : null}
        sortie={sortieMur} boutonFermer={gesteMur === 'lens'}
        onFond={fermerParLeFond} onSortie={fermerNonMerci}
        action={gesteMur === 'lens' && typeof onCreerDepuisPhotos === 'function' ? {
          libelle: fr ? 'Créer une annonce depuis mes photos' : 'Create a listing from my photos',
          // La sortie est nommée (abandon « creer_depuis_photos ») avant de passer la main à l'hôte.
          onClick: () => { fermer('creer_depuis_photos'); onCreerDepuisPhotos(); },
        } : null}
      />
    );
  }

  // ══ LES FORMULES AVEC CLOUD (11/11/2026) — l'interrupteur « Sans Cloud | Avec Cloud » ══════════════════════════════
  // Fermées (formulesVisibles faux) : `basculeFormules` vaut null et aucune vue ne change. Ouvertes : l'interrupteur en
  // tête de chaque vue ; « Sans Cloud » = la vue d'avant (sans la carte du Cloud seul) ; « Avec Cloud » = les trois cartes.
  const vueFormules = formulesVisibles
    ? (vueChoisie ?? vueOffresParDefaut({
      demande: vueCloud, trigger, choixEntree: lireVueOffres(),
      cloudActif: lectureCloud.cloud?.actif === true || profilFormules.formuleActuelle != null,
    }))
    : null;
  const basculeFormules = formulesVisibles ? <BasculeCloud vue={vueFormules} onChange={setVueChoisie} lang={lang} /> : null;
  if (vueFormules === 'avec') {
    const TF = textesFormules(lang);
    const palierCompte = palierDesDrapeaux({ isPremium, isPro, isBusiness });
    const modele = cartesFormulesCloud({
      palier: palierCompte, formuleActuelle: profilFormules.formuleActuelle, canalApp: canalDeVente(plateformeIci),
      canalAbonnement: profilFormules.canalAbonnement, essaiPermis: essaiPermisDuCompte(lectureCloud),
      essaiBoutique: (f) => etatEssaiBoutique(f), businessVisible: businessOfferVisible(userId), founder: profilFormules.founder,
      // (12/11, 4c et 4d) le canal QUI FACTURE (formule ou Cloud seul) et son interrupteur ; l'essai en cours.
      canalOuvert: formulesCloudOuvertes, canalCloud: canalDuCloudSeul(lectureCloud), essaiEnCours: lectureCloud.cloud?.etat === 'essai',
    });
    return (
      <Sheet onClose={fermerParLeFond}>
        <Title>{TF.titre}</Title>
        {modele.essaiAffiche && (
          <p data-formules-sous-titre="" style={{ margin: '-6px 0 14px', fontSize: 13, fontWeight: 600, lineHeight: 1.45, color: C.mute2 }}>
            {TF.sousTitreEssai(zeroAffiche('pro_cloud', lang))}
          </p>
        )}
        {basculeFormules}
        <OffresAvecCloud
          modele={modele} lang={lang} vente={venteFormules} venteFermee={venteFermee(venteFormules.dispo)} onChoisir={choisirFormule}
          palierIci={palierCompte} canalApp={canalDeVente(plateformeIci)} canalAbonnement={profilFormules.canalAbonnement}
          echeance={profilFormules.echeance ? dateLongue(profilFormules.echeance, lang) : null}
          finEssai={dateLongue(finEssaiSiOnCommence(), lang)}
          essaiFin={lectureCloud.cloud?.etat === 'essai' && lectureCloud.cloud?.essaiFin ? dateLongue(lectureCloud.cloud.essaiFin, lang) : null}
          corps={(palier, sombre) => (grille
            ? <CorpsCarteGrille fr={fr} palier={palier} K={K} dark={sombre} margeBas={0} />
            : <LignesDiff fr={fr} palier={palier} dark={sombre} K={K} />)}
        />
        <MentionsAbonnement lang={fr ? 'fr' : 'en'} essaiAnnonce={modele.essaiAffiche} />
        <Dismiss onClose={fermerNonMerci} label={fr ? 'Non merci' : 'No thanks'} />
      </Sheet>
    );
  }

  // (CAS 1/2 « unités insuffisantes » et leur vue 'plans' : SUPPRIMÉS le
  // 02/09 soir — insufficient_coins ne peut plus exister, cf. bascule quotas.)

  // ══ CAS 5 — Pro → Business (2026-08-09) ════════════════════════════════════
  // Placé AVANT le CAS 4 : un Pro porte aussi is_premium (flags cumulatifs), il
  // faut donc trancher du haut vers le bas. La garde `sellable.includes` porte
  // le drapeau de masquage — offre coupée, un Pro retombe sur « au maximum ».
  if (isPro && sellable.includes('business')) {
    return (
      <Sheet onClose={fermerParLeFond}>
        {basculeFormules}
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
        {/* (04/11) Grille : « Publie sans compter. » (« Zéro limite » était faux avec Lens à 600), puis ce
            que le Pro A, en une ligne (maquette 2.3) ; la carte d'ajout du Cloud passe sous la carte. */}
        <Title>{titreCloud ?? (grille ? (fr ? 'Publie sans compter.' : 'Publish without counting.') : (fr ? 'Le sommet. Zéro limite.' : 'The top. No limits.'))}</Title>
        {grille ? <ResumePalier fr={fr} palier={palierIci} K={K} /> : carteAjoutCloud}
        {grille ? null : <ToutesOffresBlock fr={fr} />}
        {blocCloudAuDessus}
        <BusinessPlanCard fr={fr} K={K} onUpgrade={choisirPalier} cloud={null} />
        <NoteMontee fr={fr} canal={plateformeIci} />
        {carteAjoutCloudSous}
        {encartCloud}
        <Dismiss onClose={fermerNonMerci} label={fr ? 'Rester en Pro' : 'Stay on Pro'} />
      </Sheet>
    );
  }

  // ══ CAS 4 — Premium → Pro (garde stricte : Premium réel et non-Pro) ════════
  // PlansStack et non plus la carte Pro seule : quand l'offre Business est
  // ouverte, un Premium voit Pro PUIS Business — le palier ultime ne doit pas
  // être invisible à qui a le plus de chances de le prendre.
  if (isPremium && !isPro && sellable.length > 0) {
    return (
      <Sheet onClose={fermerParLeFond}>
        {basculeFormules}
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
        {/* (04/11) Grille (maquette 2.2) : le Premium lit d'abord ce qu'il a, en une ligne, puis ce que le Pro
            change ; la carte d'ajout du Cloud passe sous les cartes. */}
        <Title>{titreCloud ?? (grille ? (fr ? 'Laisse FillSell travailler pour toi.' : 'Let FillSell work for you.') : (fr ? 'Passe au volume supérieur.' : 'Move up a gear.'))}</Title>
        {grille ? <ResumePalier fr={fr} palier={palierIci} K={K} /> : carteAjoutCloud}
        {grille ? null : <ToutesOffresBlock fr={fr} />}
        {blocCloudAuDessus}
        <PlansStack fr={fr} tiers={sellable} K={K} onUpgrade={choisirPalier} cloud={cloudCarte} />
        <NoteMontee fr={fr} canal={plateformeIci} />
        {carteAjoutCloudSous}
        {encartCloud}
        <Dismiss onClose={fermerNonMerci} label={fr ? 'Rester en Premium' : 'Stay on Premium'} />
      </Sheet>
    );
  }

  // ══ Plus rien à vendre ═════════════════════════════════════════════════════
  // Ne se dit QUE d'un utilisateur sans palier au-dessus — c'est-à-dire un
  // Business, ou un Pro tant que l'offre Business est masquée. (Les packs de
  // unités ne se vendent plus — bascule 02/09.)
  // (04/10, option « Sans ordinateur ») Un compte au sommet peut encore
  // AJOUTER l'option à sa formule — par la carte d'ajout, si l'hôte sait le
  // faire ; sinon, rien de plus qu'avant (ou la ligne « déjà active »).
  if (sellable.length === 0) {
    return (
      <Sheet onClose={fermerParLeFond}>
        {basculeFormules}
        <Title>{titreCloud ?? (fr ? 'Tu es déjà au maximum.' : "You're already on the top plan.")}</Title>
        {carteAjoutCloud ?? ligneCloud}
        <Dismiss onClose={fermerNonMerci} label={fr ? 'Fermer' : 'Close'} />
      </Sheet>
    );
  }

  // ══ CAS 3 — Free → Premium ═════════════════════════════════════════════════
  // Variante 'republish_cap' (bascule 02/09) : le serveur a refusé une
  // republication avec plafond_republication_free — en Free les 50
  // republications DU MOIS sont faites (05/10 : par mois désormais). La
  // modale dit le FAIT et le jour où elles reviennent, puis
  // ce que Premium change, puis les cartes. Ton informatif, aucun compte à
  // rebours ; elle s'ouvre à CHAQUE tentative refusée.
  // Variante 'republish_lot' : un Free a tapé « Republier en lot » — geste
  // réservé aux payants, rien consommé. Même structure, même registre.
  // Variante 'quota_geste' (bascule 02/09) : un quota du cycle est atteint
  // (annonces / retouches, prop quotaInfo {geste, plafond, consommes}) — le
  // fait, le déblocage, les cartes. Le geste 'scans' n'existe plus (fusion
  // scans+annonces du 02/09 soir : UN compteur, UN chiffre) — un scan refusé
  // arrive en geste 'annonces'.
  // (2026-09-04) La branche `stockFull` — puce « N/200 articles » et titre
  // « Ton stock est plein. » — est RETIRÉE : le stock est illimité pour tous
  // depuis la migration 20260904120100, la modale ne peut plus être ouverte
  // sur ce motif. Les cinq appelants qui posaient trigger='stock' existent
  // toujours (App.jsx ×4, ListingPreviewScreen ×1) mais sont tous derrière
  // quotaStockAtteint()/inventoryFull, donc derrière STOCK_ILLIMITE : aucun ne
  // peut plus partir. Si l'interrupteur repassait à false, ces appels
  // rouvriraient la modale sur sa branche GÉNÉRIQUE (« Débloque tout
  // FillSell. », sans la puce de compteur) — dégradé, jamais cassé.
  // (04/11) Grille : arrivé ici par « Voir toutes les formules » d'un mur (view = 'plans'), le lecteur a déjà
  // lu le fait — la vue est la vue générique (titre et encarts). Sans la grille, `trig` vaut `trigger`.
  const trig = grille && view === 'plans' ? 'generic' : trigger;
  const repubCap = trig === 'republish_cap';
  const repubLot = trig === 'republish_lot';
  // Republication AUTOMATIQUE (20/09) : le module en pied de Stock est
  // montré à tous les paliers ; ceux qui n'y ont pas droit arrivent ici et
  // doivent lire POURQUOI. `autorise` vaut pro/business côté serveur
  // (republish_palier) — c'est donc Pro qu'on nomme, jamais Premium.
  const repubAuto = trig === 'republish_auto';
  const quotaCas = trig === 'quota_geste' ? (quotaInfo ?? {}) : null;
  const repubPremium = grille
    ? nombre(grilleDuPalier(K, 'premium').remontees, fr ? 'fr' : 'en')
    : (K.quota_republication_premium ?? 1500).toLocaleString(fr ? 'fr-FR' : 'en-US');
  // (05/10) Le jour où les republications du gratuit reviennent : la remise à
  // zéro rendue par le refus (coin_wallets.next_grant_at, la même que les
  // annonces). Absente, passée ou illisible → rien (jamais une date inventée).
  const remiseRepub = jourRemise(plafondRepub?.remise_le, fr ? 'fr' : 'en');
  const remiseOffertes = jourRemise(repubOffertes?.remise_le, fr ? 'fr' : 'en');
  // (06/10 soir) Stock vide CONNU (0 article) : pas de bouton « Republier mes annonces ».
  const stockVide = itemCount === 0;
  return (
    <Sheet onClose={fermerParLeFond}>
      {basculeFormules}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12,
        background: C.paper, border: `1px solid ${C.border}`, borderRadius: 999,
        padding: '5px 11px', fontSize: 11, fontWeight: 600, color: C.mute,
      }}>
        {fr ? 'Tu es en Free' : "You're on Free"}
      </div>

      <Title>
        {titreCloud ?? (trig === 'voice'
          ? (fr ? 'Passe en vocal illimité.' : 'Go unlimited on voice.')
          : repubCap
            ? (fr ? 'Tes republications du mois sont faites.' : "This month's repostings are done.")
            : repubLot
              ? (fr ? 'Republie ton stock en un geste.' : 'Repost your stock in one move.')
            : repubAuto
              ? (fr ? 'Laisse tes annonces remonter toutes seules.' : 'Let your listings rise on their own.')
              : quotaCas
                ? (quotaCas.geste === 'retouches'
                    ? (fr ? 'Tes retouches du mois sont faites.' : "This month's touch-ups are done.")
                    : (fr ? 'Tes annonces du mois sont créées.' : "This month's listings are created."))
                // (04/11) Grille : « Débloque tout FillSell. » laissait croire que le Free est bridé partout.
                : grille
                  ? (fr ? 'Vends plus, en faisant moins.' : 'Sell more, doing less.')
                  : (fr ? 'Débloque tout FillSell.' : 'Unlock all of FillSell.'))}
      </Title>

      {(repubLot || repubAuto) && Number(repubOffertes?.restantes) > 0 && (
        /* (03/10, point 20) Ce qu'il A DÉJÀ, avant toute offre. Les 6 nouveaux
           comptes extension du 01-03/10 ont pris ce mur (en lot / automatique)
           et sont partis sans utiliser une seule de leurs 50 republications :
           rien ne leur disait qu'elles existaient, ni comment s'en servir. */
        <div style={{ background: '#E8F5F3', border: `1px solid ${C.teal}`, borderRadius: 16, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.5, color: C.tealDeep }}>
            {fr
              ? <>Tu as encore {repubOffertes.restantes} republications ce mois-ci{repubOffertes.plafond ? <> sur {repubOffertes.plafond}</> : null} — rien à payer.{remiseOffertes ? <> Remise à zéro le {remiseOffertes}.</> : null}</>
              : <>You still have {repubOffertes.restantes}{repubOffertes.plafond ? <> of {repubOffertes.plafond}</> : null} repostings this month — nothing to pay.{remiseOffertes ? <> Resets on {remiseOffertes}.</> : null}</>}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: C.mute2, marginTop: 4 }}>
            {/* (06/10 soir, Nico) FAUX avant : « une par une » — en Free, on
                republie AUSSI en lot (« Remonter mes annonces » du Stock). */}
            {stockVide
              ? (fr
                ? <>Dès que ton Stock a des annonces, republie-les en lot avec « Remonter mes annonces », ou une à une avec « Republier » sur leur carte.</>
                : <>Once your Stock has listings, repost them in bulk with “Bump my listings”, or one at a time with “Repost” on their card.</>)
              : (fr
                ? <>Republie-les depuis ton Stock : en lot avec « Remonter mes annonces », ou une à une avec « Republier » sur la carte d'une annonce.</>
                : <>Repost them from your Stock: in bulk with “Bump my listings”, or one at a time with “Repost” on a listing's card.</>)}
          </div>
          {!stockVide && (
            <button type="button"
              onClick={() => { palierCliqueRef.current = true; logModale('offers_modal_offertes_click', { origine: origine ?? 'non_precisee', trigger, restantes: repubOffertes.restantes }); onClose(); }}
              style={{ marginTop: 10, padding: '9px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                       background: C.tealDeep, color: '#fff', fontSize: 12.5, fontWeight: 700 }}>
              {fr ? 'Republier mes annonces' : 'Repost my listings'}
            </button>
          )}
        </div>
      )}

      {offre === 'FILLSELL50' && (
        /* Offre de rentrée (blast du 26/09) : -50 % le premier mois, code
           Stripe à usage de première commande. Le texte ne nomme aucun palier :
           le coupon vaut pour tous. */
        <div style={{ background: '#FDEEE6', border: `1px solid ${C.amber}`, borderRadius: 16, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.5, color: C.amberInk }}>
            {fr ? '-50 % sur ton premier mois' : '50% off your first month'}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: C.mute2, marginTop: 4 }}>
            {fr
              ? <>Code FILLSELL50 appliqué automatiquement au paiement, jusqu'au 31 octobre.</>
              : <>Code FILLSELL50 applied automatically at checkout, until October 31.</>}
          </div>
        </div>
      )}

      {repubCap && (
        /* Registre des cartes : le Free A quelque chose (50 par mois, qui
           reviennent à sa remise à zéro) et le Premium change le VOLUME.
           Jamais le mot « plafond ».
           Déclenchement (exclusif au code plafond_republication_free) et
           télémétrie portés par StockTab. */
        <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: C.ink }}>
            {fr
              ? <>Tes {plafondRepub?.plafond ?? K.quota_republication_free} republications du mois sont toutes utilisées{remiseRepub ? <> — elles reviennent le {remiseRepub}</> : null}. Rien n'a été décompté.</>
              : <>Your {plafondRepub?.plafond ?? K.quota_republication_free} repostings for this month are all used{remiseRepub ? <> — they come back on {remiseRepub}</> : null}. Nothing was deducted.</>}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: C.mute2, marginTop: 6 }}>
            {fr
              ? <>En Premium, tu repars avec {repubPremium} republications par mois — tu republies toi-même, quand tu veux.</>
              : <>On Premium you get {repubPremium} repostings a month — you repost yourself, whenever you want.</>}
          </div>
        </div>
      )}

      {repubAuto && (
        <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: C.ink }}>
            {fr
              ? <>La republication automatique est incluse à partir du plan Pro.</>
              : <>Automatic reposting is included from the Pro plan.</>}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: C.mute2, marginTop: 6 }}>
            {fr
              ? <>Tu choisis le créneau et le rythme : tes annonces remontent toutes seules, sans que tu aies à y penser.</>
              : <>You pick the time slot and the pace: your listings rise on their own, with nothing to do.</>}
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
              ? (fr ? <>Ton forfait comprend {quotaCas.plafond ?? 0} annonces retouchées par mois (jusqu'à 5 photos chacune) — elles sont toutes utilisées. Rien n'a été décompté.</>
                    : <>Your plan includes {quotaCas.plafond ?? 0} retouched listings a month (up to 5 photos each) — they are all used. Nothing was deducted.</>)
              // (26/10, Jocabroc « je me retrouve plus qu'à 5 ») Jamais le plafond Free (5) prêté à un compte : sans plafond
              // rendu par le serveur, la phrase ne dit AUCUN nombre (un compte payant lisait « 5 annonces »).
              : (fr ? <>{quotaCas.plafond != null ? <>Ton forfait comprend {quotaCas.plafond} annonces créées par mois — elles le sont toutes.</> : <>Les annonces créées de ton forfait pour ce mois sont toutes utilisées.</>} Rien n'a été décompté.</>
                    : <>{quotaCas.plafond != null ? <>Your plan includes {quotaCas.plafond} created listings a month — they are all used.</> : <>Your plan's created listings for this month are all used.</>} Nothing was deducted.</>)}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: C.mute2, marginTop: 6 }}>
            {quotaCas.geste === 'retouches'
              ? (fr ? <>En Premium, tu passes à {K.quota_retouche_premium} annonces retouchées par mois.</>
                    : <>On Premium you get {K.quota_retouche_premium} retouched listings a month.</>)
              : (fr ? <>En Premium, tu passes à {K.quota_annonces_premium} annonces par mois, publiées sur toutes tes plateformes.</>
                    : <>On Premium you get {K.quota_annonces_premium} listings a month, published on all your platforms.</>)}
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
          produit se lit avant de comparer les prix. (04/11) Avec la grille : Depop
          et « Comment on compte ». */}
      <ToutesOffresBlock fr={fr} grille={grille} />

      {/* Vue comparative (2026-07-22) : les cartes d'emblée, empilées —
          ouvertes par la carte Free (le point de départ du lecteur). */}
      <PlansStack fr={fr} tiers={sellable} showFree K={K} onUpgrade={choisirPalier} avant={blocCloud} cloud={cloudCarte} voieCloudFree={voieCloudFree} />
      {encartCloud}

      <MentionsAbonnement lang={fr ? 'fr' : 'en'} cloud={!formulesVisibles && Boolean(offreCloud)} essaiCloud={offreCloud?.essai !== false} />

      <Dismiss onClose={fermerNonMerci} label={fr ? 'Non merci' : 'No thanks'} />
    </Sheet>
  );
}
