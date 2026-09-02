import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import useSeo from "../lib/seo";

const C = { teal: "#3EACA0", peach: "#E8956D", text: "#0F172A", sub: "#475569", label: "#94A3B8", border: "rgba(0,0,0,0.06)" };

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: #F1F5F9; }
  .legal-card {
    background: #fff;
    border-radius: 16px;
    border: 1px solid rgba(0,0,0,0.06);
    box-shadow: 0 1px 4px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04);
    padding: 32px 36px;
    margin-bottom: 16px;
  }
  .legal-h2 {
    font-size: 15px;
    font-weight: 800;
    color: #0F172A;
    letter-spacing: -0.3px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .legal-p {
    font-size: 13.5px;
    color: #475569;
    line-height: 1.75;
    margin-bottom: 10px;
  }
  .legal-p:last-child { margin-bottom: 0; }
  .legal-ul {
    list-style: none;
    padding: 0;
    margin: 8px 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .legal-ul li {
    font-size: 13.5px;
    color: #475569;
    line-height: 1.6;
    padding-left: 14px;
    position: relative;
  }
  .legal-ul li::before {
    content: "–";
    position: absolute;
    left: 0;
    color: #94A3B8;
  }
  .legal-strong { font-weight: 700; color: #0F172A; }
  a.legal-link { color: #3EACA0; text-decoration: none; font-weight: 600; }
  a.legal-link:hover { text-decoration: underline; }
  @media(max-width: 640px) {
    .legal-card { padding: 22px 18px; }
  }
`;

const Section = ({ icon, title, id, children }) => (
  <div className="legal-card" id={id} style={id ? { scrollMarginTop: 84 } : undefined}>
    <div className="legal-h2">
      <span>{icon}</span>
      {title}
    </div>
    {children}
  </div>
);

const privacyTexts = {
  fr: {
    title: "🔐 Politique de confidentialité (App Store)",
    intro: "FillSell collecte et traite les données utilisateur pour fournir ses fonctionnalités principales.",
    collectedTitle: "Données collectées :",
    collected: [
      "Adresse email (création de compte et authentification)",
      "Identifiant de connexion tierce (Sign in with Apple / Google, optionnel)",
      "Contenu utilisateur (inventaire, ventes, descriptions)",
      "Statut d'abonnement (accès premium)",
      "Données techniques (logs de sécurité)",
    ],
    usageTitle: "Ces données sont :",
    usage: [
      "Utilisées exclusivement pour faire fonctionner le service",
      "Jamais vendues à des tiers",
      "Jamais utilisées pour du tracking publicitaire",
    ],
    storage: "Les données sont stockées de manière sécurisée via Supabase (infrastructure EU) et protégées par des mesures de sécurité standard.",
    rights: "Les utilisateurs peuvent demander l'accès, la modification ou la suppression de leurs données en contactant :",
    noTrack: "FillSell ne contient aucun SDK de tracking ou de publicité.",
    compliance: "This app complies with Apple App Store privacy requirements.",
  },
  en: {
    title: "🔐 Privacy Policy (App Store)",
    intro: "FillSell collects and processes user data to provide its core features.",
    collectedTitle: "Data collected:",
    collected: [
      "Email address (account creation and authentication)",
      "Third-party sign-in identifier (Sign in with Apple / Google, optional)",
      "User content (inventory, sales, descriptions)",
      "Subscription status (premium access)",
      "Technical data (security logs)",
    ],
    usageTitle: "This data is:",
    usage: [
      "Used exclusively to operate the service",
      "Never sold to third parties",
      "Never used for advertising tracking",
    ],
    storage: "Data is stored securely via Supabase (EU infrastructure) and protected by standard security measures.",
    rights: "Users may request access, modification, or deletion of their data by contacting:",
    noTrack: "FillSell contains no tracking or advertising SDKs.",
    compliance: "This app complies with Apple App Store privacy requirements.",
  },
};

// CGV Pépites — texte contractuel validé par Nico le 05/08/2026, aligné sur le
// code réellement en prod (plafond de cumul = grant_monthly_coins, ordre de
// dépense = spend_*, restitutions = coin_reservations/refund triggers). Toute
// modification de ces mécanismes doit être répercutée ici.
const cgvTexts = {
  fr: [
    { t: "Article 1 — Nature des Pépites", ps: [
      "Les « Pépites » sont des crédits d'usage internes au service FillSell. Elles permettent d'utiliser certaines fonctionnalités payantes de l'application (génération d'annonce, analyse photo, retouche photo, publication, republication), selon la grille en vigueur affichée dans l'application.",
      "Les Pépites n'ont aucune valeur monétaire. Elles ne constituent ni une monnaie électronique, ni un avoir, ni un instrument de paiement. Elles ne sont pas convertibles ni remboursables en euros (sous réserve des droits impératifs prévus à l'article 9), ne sont ni transférables ni cessibles à un tiers, et sont exclusivement attachées au compte FillSell qui les a reçues. La suppression du compte entraîne la perte définitive des Pépites restantes, sans compensation.",
    ]},
    { t: "Article 2 — Prix des actions et grille tarifaire", ps: [
      "Le prix en Pépites de chaque action est celui affiché dans l'application au moment de l'utilisation. Il est présenté à l'utilisateur avant toute dépense.",
      "FillSell peut faire évoluer cette grille (prix des actions, dotations mensuelles incluses dans les abonnements, contenu des packs de Pépites) moyennant un préavis raisonnable porté à la connaissance des utilisateurs dans l'application. Une modification de la grille ne s'applique jamais rétroactivement : les Pépites déjà créditées restent utilisables, au prix en vigueur au moment de chaque utilisation.",
    ]},
    { t: "Article 3 — Durée de validité", ps: [
      "Les Pépites achetées (packs) n'expirent pas.",
      "Les Pépites incluses (créditées chaque mois avec un plan) n'expirent pas non plus à date fixe : aucune Pépite déjà créditée n'est jamais retirée du compte. En revanche, leur cumul est plafonné : à chaque crédit mensuel, le solde de Pépites incluses ne peut excéder deux fois la dotation mensuelle du plan en vigueur. La fraction du crédit mensuel qui porterait le solde au-delà de ce plafond n'est pas versée. Le plafond s'apprécie sur la dotation du plan actif au moment du crédit ; il ne s'applique pas aux Pépites achetées.",
      "Le crédit mensuel des plans payants est conditionné au paiement effectif de l'échéance d'abonnement correspondante.",
    ]},
    { t: "Article 4 — Ordre de consommation", ps: [
      "Lors d'une dépense, les Pépites incluses sont consommées en priorité ; les Pépites achetées ne sont entamées qu'une fois le solde de Pépites incluses épuisé. En cas de restitution (article 5), les Pépites achetées sont restituées en premier.",
    ]},
    { t: "Article 5 — Restitutions automatiques", ps: [
      "L'utilisateur n'est facturé que pour les actions effectivement rendues :",
      "– Publication : le prix d'une publication comporte deux parts. La part retouche photo est débitée définitivement au lancement de la publication, en même temps que le traitement des photos. La part publication (facturée par plateforme) est quant à elle seulement réservée à ce moment-là, et n'est définitivement débitée que lorsque l'annonce est effectivement publiée ; si la publication échoue ou est annulée, la part réservée correspondante est restituée automatiquement.",
      "– Retouche photo : si aucune des photos du lot ne peut être retouchée, la part retouche n'est pas facturée. Dès lors qu'au moins une photo retouchée est livrée, la part retouche est due en totalité ; il n'est pas appliqué de facturation proportionnelle au nombre de photos retouchées.",
      "– Génération d'annonce : en cas d'échec de la génération, les Pépites débitées sont automatiquement remboursées.",
      "– Republication : si la republication échoue ou est annulée avant la suppression de l'annonce d'origine (annonce intacte), les Pépites débitées sont automatiquement restituées. Après la suppression, l'opération est reprise à l'étape de recréation (article 8) ; le service étant en cours d'exécution, elle ne donne pas lieu à restitution.",
      "Ces restitutions se font en Pépites, sur le compte de l'utilisateur, jamais en euros.",
    ]},
    { t: "Article 6 — Extension Chrome requise", ps: [
      "La publication, la republication et le retrait automatique d'annonces sur les plateformes tierces sont exécutés par l'extension Chrome FillSell, installée sur un ordinateur (navigateur Chrome ou compatible). Sans extension installée et active, ces actions ne peuvent pas aboutir — y compris lorsqu'elles sont commandées depuis l'application mobile. Avant toute facturation, FillSell vérifie qu'une extension a été associée au compte ; à défaut, l'action est refusée et aucune Pépite n'est débitée. Si une action commandée ne peut aboutir faute d'extension active, les Pépites correspondantes sont restituées dans les conditions de l'article 5 : immédiatement en cas d'annulation, et au plus tard à l'expiration de la réservation, dans un délai de 30 jours.",
    ]},
    { t: "Article 7 — Plateformes tierces", ps: [
      "FillSell n'est affilié à aucune des plateformes sur lesquelles les annonces sont publiées (Vinted, Leboncoin, eBay, Beebs) et n'est ni approuvé ni sponsorisé par elles. L'extension exécute les actions dans le navigateur de l'utilisateur, au sein de ses propres sessions, comme il le ferait manuellement ; l'utilisateur reste seul titulaire de ses comptes sur ces plateformes et seul responsable du respect de leurs conditions d'utilisation.",
      "FillSell ne garantit ni la disponibilité, ni le maintien, ni le résultat de la publication sur ces plateformes : celles-ci peuvent modifier leur fonctionnement ou restreindre l'accès automatisé à tout moment et sans préavis, ce qui peut interrompre tout ou partie du service sans que la responsabilité de FillSell puisse être engagée. En pareil cas, les actions échouées donnent lieu aux restitutions prévues à l'article 5.",
    ]},
    { t: "Article 8 — Republication d'annonces", ps: [
      "La republication d'une annonce Vinted consiste à supprimer l'annonce existante puis à en créer une nouvelle. Il s'agit d'une annonce distincte : les vues, les favoris et l'ancienneté de l'annonce d'origine sont définitivement perdus. Cet effet est irréversible : une annonce supprimée ne peut pas être restaurée par FillSell. Si une interruption survient après la suppression, l'opération est reprise à l'étape de recréation de l'annonce, le cas échéant avec l'intervention de l'utilisateur, sans que l'aboutissement de la recréation puisse être garanti ; l'annonce d'origine n'est en aucun cas rétablie, et les Pépites débitées restent dues, le service étant en cours d'exécution. En demandant une republication — manuelle ou automatisée — l'utilisateur reconnaît et accepte cet effet.",
    ]},
    { t: "Article 9 — Droit de rétractation", ps: [
      "Abonnements : conformément aux articles L221-18 et suivants du Code de la consommation, l'utilisateur consommateur dispose d'un délai de 14 jours à compter de la souscription pour se rétracter, en écrivant à support@fillsell.app. Si l'utilisateur a demandé l'exécution immédiate du service, le remboursement est diminué du prorata correspondant à la période déjà écoulée.",
      "Packs de Pépites : en achetant un pack, l'utilisateur demande expressément l'exécution immédiate (crédit instantané des Pépites) et reconnaît que toute Pépite consommée avant l'expiration du délai de 14 jours emporte, pour la partie consommée, renonciation expresse à son droit de rétractation (article L221-28 du Code de la consommation). La rétractation reste possible dans le délai de 14 jours pour la partie du pack non consommée.",
      "Pour les achats effectués via l'App Store (Apple) ou Google Play, les demandes de remboursement sont soumises aux conditions du store concerné et doivent lui être adressées directement.",
    ]},
  ],
  en: [
    { t: "Article 1 — Nature of Nuggets", ps: [
      "\"Nuggets\" are usage credits internal to the FillSell service. They give access to certain paid features of the application (listing generation, photo analysis, photo enhancement, publishing, reposting), according to the price list displayed in the app.",
      "Nuggets have no monetary value. They are neither electronic money, nor a credit note, nor a payment instrument. They cannot be converted into or refunded in euros (subject to the mandatory rights set out in Article 9), are neither transferable nor assignable to any third party, and are exclusively attached to the FillSell account that received them. Deleting the account results in the permanent loss of any remaining Nuggets, without compensation.",
    ]},
    { t: "Article 2 — Action prices and price list", ps: [
      "The price in Nuggets of each action is the one displayed in the app at the time of use. It is shown to the user before any spending.",
      "FillSell may change this price list (action prices, monthly allowances included with subscriptions, contents of Nugget packs) subject to reasonable prior notice given to users in the app. A change to the price list never applies retroactively: Nuggets already credited remain usable, at the price in force at the time of each use.",
    ]},
    { t: "Article 3 — Validity period", ps: [
      "Purchased Nuggets (packs) do not expire.",
      "Included Nuggets (credited monthly with a plan) do not expire on any date either: no Nugget already credited is ever removed from the account. However, their accumulation is capped: at each monthly credit, the included-Nugget balance may not exceed twice the monthly allowance of the current plan. The portion of the monthly credit that would take the balance above this cap is not credited. The cap is assessed against the allowance of the plan active at the time of the credit; it does not apply to purchased Nuggets.",
      "The monthly credit of paid plans is conditional upon actual payment of the corresponding subscription instalment.",
    ]},
    { t: "Article 4 — Spending order", ps: [
      "When spending, included Nuggets are consumed first; purchased Nuggets are only drawn upon once the included balance is exhausted. In the event of a restitution (Article 5), purchased Nuggets are returned first.",
    ]},
    { t: "Article 5 — Automatic restitutions", ps: [
      "The user is only charged for actions actually delivered:",
      "– Publishing: the price of a publication has two components. The photo-enhancement component is definitively debited when publishing starts, at the same time as the photos are processed. The publishing component (charged per marketplace) is only reserved at that point, and is definitively debited only once the listing is actually published; if publishing fails or is cancelled, the corresponding reserved portion is automatically returned.",
      "– Photo enhancement: if none of the photos in the batch can be enhanced, the enhancement component is not charged. As soon as at least one enhanced photo is delivered, the enhancement component is due in full; no pro-rata billing is applied based on the number of successfully enhanced photos.",
      "– Listing generation: if generation fails, the debited Nuggets are automatically refunded.",
      "– Reposting: if the repost fails or is cancelled before the original listing is deleted (listing intact), the debited Nuggets are automatically returned. After deletion, the operation is resumed at the re-creation step (Article 8); as the service is then in the course of performance, no restitution is made.",
      "These restitutions are made in Nuggets, to the user's account, never in euros.",
    ]},
    { t: "Article 6 — Chrome extension required", ps: [
      "Publishing, reposting and automated withdrawal of listings on third-party marketplaces are performed by the FillSell Chrome extension, installed on a computer (Chrome or compatible browser). Without the extension installed and active, these actions cannot be completed — including when they are requested from the mobile app. Before any charge, FillSell verifies that an extension has been linked to the account; failing that, the action is refused and no Nuggets are charged. If a requested action cannot be completed for lack of an active extension, the corresponding Nuggets are returned under the conditions of Article 5: immediately if the action is cancelled, and at the latest upon expiry of the reservation, within 30 days.",
    ]},
    { t: "Article 7 — Third-party marketplaces", ps: [
      "FillSell is not affiliated with any of the marketplaces on which listings are published (Vinted, Leboncoin, eBay, Beebs), and is neither endorsed nor sponsored by them. The extension performs actions in the user's browser, within the user's own sessions, as the user would manually; the user remains the sole holder of their accounts on those marketplaces and solely responsible for complying with their terms of service.",
      "FillSell does not guarantee the availability, continuity or outcome of publishing on these marketplaces: they may change how they operate or restrict automated access at any time and without notice, which may interrupt all or part of the service without FillSell incurring any liability. In such cases, failed actions give rise to the restitutions provided for in Article 5.",
    ]},
    { t: "Article 8 — Reposting of listings", ps: [
      "Reposting a Vinted listing consists of deleting the existing listing and creating a new one. The new listing is a distinct listing: the views, favourites and seniority of the original listing are permanently lost. This effect is irreversible: a deleted listing cannot be restored by FillSell. If an interruption occurs after deletion, the operation is resumed at the re-creation step, where applicable with the user's involvement, and successful re-creation cannot be guaranteed; the original listing is in no event reinstated, and the debited Nuggets remain due, as the service is in the course of performance. By requesting a repost — whether manual or automated — the user acknowledges and accepts this effect.",
    ]},
    { t: "Article 9 — Right of withdrawal", ps: [
      "Subscriptions: in accordance with applicable consumer law (Articles L221-18 et seq. of the French Consumer Code), consumers have 14 days from subscribing to withdraw, by writing to support@fillsell.app. If the user requested immediate performance of the service, the refund is reduced pro rata for the period already elapsed.",
      "Nugget packs: by purchasing a pack, the user expressly requests immediate performance (instant crediting of the Nuggets) and acknowledges that any Nugget consumed before the 14-day period expires entails, for the consumed portion, express waiver of the right of withdrawal (Article L221-28 of the French Consumer Code). Withdrawal remains possible within the 14-day period for the unconsumed portion of the pack.",
      "For purchases made through the App Store (Apple) or Google Play, refund requests are subject to the terms of the relevant store and must be addressed to it directly.",
    ]},
  ],
};

// Détail technique des droits de l'extension Chrome, aligné 1:1 sur
// chrome-extension/manifest.json (permissions + host_permissions). Toute
// modification du manifest doit être répercutée ici pour la soumission Web Store.
const extensionPermissions = [
  // permissions (API Chrome)
  { key: 'storage', scope: 'permissions',
    fr: "Stocke localement le jeton de session FillSell et les réglages de l'extension (chrome.storage.local). Rien n'est transmis à des tiers.",
    en: "Stores the FillSell session token and the extension settings locally (chrome.storage.local). Nothing is shared with third parties." },
  { key: 'alarms', scope: 'permissions',
    fr: "Planifie une vérification périodique (~30 min) des annonces à publier, du statut des annonces en ligne et des retraits à effectuer, sans garder d'onglet ouvert en continu.",
    en: "Schedules a periodic check (~30 min) for listings to publish, the status of live listings, and withdrawals to perform, without keeping a tab open continuously." },
  { key: 'scripting', scope: 'permissions',
    fr: "Injecte le script d'automatisation sur les pages de la plateforme concernée : remplissage du formulaire à la publication, lecture du statut de l'annonce, retrait après confirmation d'une vente.",
    en: "Injects the automation script onto the marketplace's pages: form filling at publish time, listing status reading, withdrawal after a confirmed sale." },
  { key: 'cookies', scope: 'permissions',
    fr: "Vérifie la présence du cookie de session Vinted (v_uid), uniquement sur les domaines listés ci-dessous, pour distinguer « vous n'êtes pas connecté à Vinted » d'un blocage anti-robot lors de la synchronisation du dressing. Aucun cookie n'est lu en dehors de ce test, ni transmis, ni stocké.",
    en: "Checks for the Vinted session cookie (v_uid), only on the domains listed below, to tell \"you are not signed in to Vinted\" apart from an anti-bot block during closet sync. No cookie is read beyond this check, transmitted, or stored." },
  // host_permissions (accès par domaine)
  { key: 'https://*.vinted.fr/*', scope: 'host_permissions',
    fr: "Remplir le formulaire de dépôt, vérifier le statut des annonces publiées et exécuter leur retrait après confirmation d'une vente, sur Vinted (domaine français).",
    en: "Fill the listing form, check the status of published listings, and withdraw them after a confirmed sale, on Vinted (French domain)." },
  { key: 'https://*.vinted.com/*', scope: 'host_permissions',
    fr: "Remplir le formulaire de dépôt, vérifier le statut des annonces publiées et exécuter leur retrait après confirmation d'une vente, sur Vinted (domaine international .com).",
    en: "Fill the listing form, check the status of published listings, and withdraw them after a confirmed sale, on Vinted (international .com domain)." },
  { key: 'https://*.leboncoin.fr/*', scope: 'host_permissions',
    fr: "Remplir le formulaire de dépôt, vérifier le statut des annonces publiées et exécuter leur retrait après confirmation d'une vente, sur Leboncoin.",
    en: "Fill the listing form, check the status of published listings, and withdraw them after a confirmed sale, on Leboncoin." },
  { key: 'https://*.ebay.fr/*', scope: 'host_permissions',
    fr: "Remplir le formulaire de dépôt, vérifier le statut des annonces publiées et exécuter leur retrait après confirmation d'une vente, sur eBay (domaine français).",
    en: "Fill the listing form, check the status of published listings, and withdraw them after a confirmed sale, on eBay (French domain)." },
  { key: 'https://*.ebay.com/*', scope: 'host_permissions',
    fr: "Remplir le formulaire de dépôt, vérifier le statut des annonces publiées et exécuter leur retrait après confirmation d'une vente, sur eBay (domaine international .com).",
    en: "Fill the listing form, check the status of published listings, and withdraw them after a confirmed sale, on eBay (international .com domain)." },
  { key: 'https://*.beebs.app/*', scope: 'host_permissions',
    fr: "Remplir le formulaire de dépôt, vérifier le statut des annonces publiées et exécuter leur retrait après confirmation d'une vente, sur Beebs.",
    en: "Fill the listing form, check the status of published listings, and withdraw them after a confirmed sale, on Beebs." },
  { key: 'https://fillsell.app/*', scope: 'host_permissions',
    fr: "Lire la session d'authentification FillSell pour rattacher l'extension au compte de l'utilisateur.",
    en: "Read the FillSell authentication session to link the extension to the user's account." },
  { key: 'https://tojihnuawsoohlolangc.supabase.co/*', scope: 'host_permissions',
    fr: "Appeler le backend FillSell (Supabase) pour récupérer les annonces à publier et remonter leur statut.",
    en: "Call the FillSell backend (Supabase) to fetch the listings to publish and report their status." },
];

export default function Legal() {
  const nav = useNavigate();
  const [lang] = useState(() => localStorage.getItem('fs_lang') || 'fr');
  const p = privacyTexts[lang] || privacyTexts.fr;
  const en = lang === 'en';

  // Page listée au sitemap : elle doit porter SON canonical, pas celui de la
  // home. Meta en FR quel que soit `lang` : le canonical annoncé est l'URL FR
  // et un crawler n'a pas de localStorage — il verrait toujours le français.
  useSeo({
    path: '/legal',
    title: 'Mentions légales, CGU, CGV et confidentialité — FillSell',
    description: "Mentions légales de FillSell : éditeur, hébergement, conditions générales d'utilisation et de vente (Pépites), politique de confidentialité (RGPD), abonnements et suppression de compte.",
    ogType: 'website',
  });

  // Le scroll natif du navigateur sur #ancre arrive avant le montage React :
  // les liens du footer (/legal#mentions, /legal#confidentialite) le referaient
  // à vide. On rejoue la cible une fois les sections rendues.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#F1F5F9", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{css}</style>

      {/* Header — paddingTop pushes content below notch/Dynamic Island */}
      <div style={{ background: "linear-gradient(135deg,#3EACA0ee 0%,#E8956Ddd 100%)", boxShadow: "0 6px 24px rgba(0,0,0,0.12)", paddingTop: 'env(safe-area-inset-top)' }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", height: 68, gap: 14 }}>
          <button onClick={() => nav(-1)} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 10, padding: "6px 14px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.32)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
          >{en ? '← Back' : '← Retour'}</button>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
            {en ? 'Legal Notice, T&C & Terms of Sale' : 'Mentions légales, CGU & CGV'}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Intro */}
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
            {en ? 'Legal documents' : 'Documents légaux'}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: C.text, letterSpacing: "-0.8px", marginBottom: 8 }}>
            {en ? 'Legal Notice, T&C & Terms of Sale' : 'Mentions légales, CGU & CGV'}
          </h1>
          <p style={{ fontSize: 13, color: C.label }}>
            {en ? 'Last updated: August 2026' : 'Dernière mise à jour : août 2026'}
          </p>
        </div>

        {/* 1. Éditeur / Publisher */}
        <Section id="mentions" icon="🏢" title={en ? '1. Publisher' : '1. Éditeur du site'}>
          <p className="legal-p">
            {en
              ? <>The website <span className="legal-strong">FillSell</span> (accessible at <span className="legal-strong">fillsell.app</span>) is published by:</>
              : <>Le site <span className="legal-strong">FillSell</span> (accessible à l'adresse <span className="legal-strong">fillsell.app</span>) est édité par :</>}
          </p>
          <ul className="legal-ul">
            <li><span className="legal-strong">{en ? 'Status:' : 'Statut :'}</span> {en ? 'Self-employed' : 'Auto-entrepreneur'}</li>
            <li><span className="legal-strong">{en ? 'Trade name:' : 'Nom commercial :'}</span> FillSell</li>
            <li><span className="legal-strong">{en ? 'Publication manager:' : 'Responsable de publication :'}</span> {en ? 'The manager of FillSell' : 'Le gérant de FillSell'}</li>
            <li><span className="legal-strong">Contact :</span> <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a></li>
          </ul>
        </Section>

        {/* 2. Hébergement / Hosting */}
        <Section icon="🌐" title={en ? '2. Hosting' : '2. Hébergement'}>
          <p className="legal-p">{en ? 'The website is hosted by:' : 'Le site est hébergé par :'}</p>
          <ul className="legal-ul">
            <li><span className="legal-strong">{en ? 'Company:' : 'Société :'}</span> Vercel Inc.</li>
            <li><span className="legal-strong">{en ? 'Address:' : 'Adresse :'}</span> 340 Pine Street, Suite 701, San Francisco, CA 94104, {en ? 'United States' : 'États-Unis'}</li>
            <li><span className="legal-strong">{en ? 'Website:' : 'Site web :'}</span> <a href="https://vercel.com" className="legal-link" target="_blank" rel="noreferrer">vercel.com</a></li>
          </ul>
          <p className="legal-p" style={{ marginTop: 10 }}>
            {en
              ? <>Data is stored via <span className="legal-strong">Supabase</span> (Supabase Inc., AWS eu-west-1 infrastructure — Europe).</>
              : <>Les données sont stockées via <span className="legal-strong">Supabase</span> (Supabase Inc., infrastructure AWS eu-west-1 — Europe).</>}
          </p>
        </Section>

        {/* 3. CGU / T&C */}
        <Section id="cgu" icon="📋" title={en ? '3. Terms and Conditions (T&C)' : '3. Conditions générales d\'utilisation (CGU)'}>
          <p className="legal-p">
            <span className="legal-strong">{en ? '3.1 Purpose' : '3.1 Objet'}</span><br />
            {en
              ? 'FillSell is a SaaS buy-and-resell tracking tool that allows users to manage their inventory, calculate their margins, and analyze their profits. Access to the service implies full acceptance of these Terms and Conditions.'
              : "FillSell est un outil SaaS de suivi d'achat-revente permettant aux utilisateurs de gérer leur inventaire, calculer leurs marges et analyser leurs profits. L'accès au service implique l'acceptation pleine et entière des présentes CGU."}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '3.2 Registration' : '3.2 Inscription'}</span><br />
            {en
              ? 'Registration is free. The user agrees to provide accurate information and to maintain the confidentiality of their credentials. Any account may be cancelled by the user at any time.'
              : "L'inscription est gratuite. L'utilisateur s'engage à fournir des informations exactes et à maintenir la confidentialité de ses identifiants. Tout compte peut être résilié par l'utilisateur à tout moment."}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '3.3 Free Plan' : '3.3 Plan gratuit'}</span><br />
            {en
              ? <>The free plan allows managing up to <span className="legal-strong">200 items</span> in inventory. Access to the dashboard, margin calculation, and sales history is included without time limit.</>
              : <>Le plan gratuit permet de gérer jusqu'à <span className="legal-strong">200 articles</span> en stock. L'accès au dashboard, au calcul des marges et à l'historique des ventes est inclus sans limite de durée.</>}
          </p>

          {/* Bascule quotas (02/09) : la description des plans dit désormais
              les VOLUMES PAR CYCLE réellement servis (annonces IA, scans,
              republications, retouches). Les deux mensonges historiques
              (« sans frais supplémentaires », « 50/jour réglable défaut
              10 ») sont morts avec elle. Toute évolution des volumes est
              couverte par la clause d'évolution de la grille. */}
          {/* CGV bascule quotas (02/09) : chiffres EXACTS de la grille (les
              mêmes clés coin_config que l'app — à mettre à jour ICI si la
              grille bouge), réarmement au CYCLE d'abonnement, plafond de
              sécurité 45/jour de l'auto MOTIVÉ (protection anti-restriction
              Vinted, pas une limite commerciale), et distinction tarif
              web / tarif boutiques (ils peuvent différer). */}
          {en ? (
            <p className="legal-p"><span className="legal-strong">3.4 Premium, Pro and Business Subscriptions</span><br />
              Paid plans are offered with no commitment. Each plan includes volumes of actions per subscription cycle. As of September 2, 2026, these volumes are:<br />
              — <span className="legal-strong">Free</span>: 5 AI-generated listings published to the 4 supported platforms, 3 Lens scans per cycle, and a one-time allowance of 50 Vinted repostings (granted once, no monthly renewal);<br />
              — <span className="legal-strong">Premium</span>: 40 AI-generated listings, 40 Lens scans, 1,500 Vinted repostings and 5 AI photo touch-ups per cycle;<br />
              — <span className="legal-strong">Pro</span>: 120 AI-generated listings, 120 Lens scans, 5,000 Vinted repostings (with optional automatic reposting) and 20 AI photo touch-ups per cycle;<br />
              — <span className="legal-strong">Business</span>: 300 AI-generated listings, 300 Lens scans, unlimited Vinted repostings (with automatic reposting) and 50 AI photo touch-ups per cycle.<br />
              Publishing listings to the supported platforms is included in all plans and not counted. Volumes reset at each <span className="legal-strong">subscription cycle</span> (the monthly anniversary of the subscription), not on calendar months. Counters are visible in the app; volumes may change over time, and the applicable volumes are those displayed in the app at the time of use.<br /><br />
              <span className="legal-strong">Automatic reposting</span> (Pro and Business) is capped at <span className="legal-strong">45 repostings per day</span> regardless of plan. This is a safety limit designed to protect users' Vinted accounts against restrictions that Vinted may impose on high-frequency activity — not a commercial limit. Reposting effects are described in Article 8 of the Terms of Sale below.<br /><br />
              <span className="legal-strong">Prices:</span> the price in effect is the one displayed at the time of purchase, on the web (payment securely processed by <span className="legal-strong">Stripe</span>) or in the app stores. Web prices and app-store prices (Apple App Store, Google Play) may differ for the same plan.<br /><br />
              <span className="legal-strong">On iOS/Android:</span> payment is managed by the relevant store (In-App Purchase). The subscription automatically renews unless cancelled at least 24 hours before the end of the current period. You can manage or cancel your subscription in your store account settings.
            </p>
          ) : (
            <p className="legal-p"><span className="legal-strong">3.4 Abonnements Premium, Pro et Business</span><br />
              Les plans payants sont proposés sans engagement. Chaque plan comprend des volumes d'actions par cycle d'abonnement. Au 2 septembre 2026, ces volumes sont :<br />
              — <span className="legal-strong">Free</span> : 5 annonces générées par IA et publiées sur les 4 plateformes prises en charge, 3 analyses Lens par cycle, et une dotation unique de 50 republications Vinted (accordée une fois, sans renouvellement mensuel) ;<br />
              — <span className="legal-strong">Premium</span> : 40 annonces générées par IA, 40 analyses Lens, 1 500 republications Vinted et 5 retouches photo par IA par cycle ;<br />
              — <span className="legal-strong">Pro</span> : 120 annonces générées par IA, 120 analyses Lens, 5 000 republications Vinted (avec republication automatique en option) et 20 retouches photo par IA par cycle ;<br />
              — <span className="legal-strong">Business</span> : 300 annonces générées par IA, 300 analyses Lens, republications Vinted illimitées (avec republication automatique) et 50 retouches photo par IA par cycle.<br />
              La publication des annonces sur les plateformes prises en charge est incluse dans tous les plans et n'est pas décomptée. Les volumes se réarment à chaque <span className="legal-strong">cycle d'abonnement</span> (date anniversaire mensuelle de la souscription), et non au mois calendaire. Les compteurs sont visibles dans l'application ; les volumes peuvent évoluer, et ceux applicables sont ceux affichés dans l'application au moment de l'utilisation.<br /><br />
              <span className="legal-strong">La republication automatique</span> (Pro et Business) est plafonnée à <span className="legal-strong">45 republications par jour</span>, quel que soit le plan. Il s'agit d'une limite de sécurité destinée à protéger les comptes Vinted des utilisateurs contre les restrictions que Vinted peut imposer en cas d'activité à haute fréquence — et non d'une limite commerciale. Les effets de la republication sont décrits à l'article 8 des CGV ci-dessous.<br /><br />
              <span className="legal-strong">Prix :</span> le prix applicable est celui affiché au moment de l'achat, sur le web (paiement traité de manière sécurisée par <span className="legal-strong">Stripe</span>) ou dans les boutiques d'applications. Les prix web et les prix des boutiques (App Store Apple, Google Play) peuvent différer pour un même plan.<br /><br />
              <span className="legal-strong">Sur iOS/Android :</span> le paiement est géré par la boutique concernée (In-App Purchase). L'abonnement se renouvelle automatiquement sauf résiliation au moins 24h avant la fin de la période en cours. Vous pouvez gérer ou annuler votre abonnement dans les réglages de votre compte de la boutique.
            </p>
          )}

          <p className="legal-p">
            <span className="legal-strong">{en ? '3.5 Cancellation' : '3.5 Résiliation'}</span><br />
            {en
              ? 'The user may cancel their subscription at any time from their account. Cancellation takes effect at the end of the current billing period. No pro-rata refund is made for the remaining days.'
              : "L'utilisateur peut résilier son abonnement à tout moment depuis son espace client. La résiliation prend effet à la fin de la période de facturation en cours. Aucun remboursement au prorata n'est effectué pour les jours restants."}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '3.6 Refunds and withdrawal' : '3.6 Remboursement et rétractation'}</span><br />
            {en
              ? <><span className="legal-strong">Subscriptions:</span> in accordance with applicable consumer law (Articles L221-18 et seq. of the French Consumer Code), consumers have 14 days from subscribing to withdraw, by writing to <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a>. If the user requested immediate performance of the service, the refund is reduced pro rata for the period already elapsed.<br /><br />
                  <span className="legal-strong">Nugget packs:</span> withdrawal remains possible within the 14-day period for the unconsumed portion of the pack. Any Nugget consumed before that period expires entails, for the consumed portion, express waiver of the right of withdrawal (Article L221-28 of the French Consumer Code).<br /><br />
                  In the event of a manifest error or service defect, a refund request may additionally be submitted to <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a> within 7 days of the charge. For purchases made through the App Store (Apple) or Google Play, refund requests are subject to the terms of the relevant store and must be addressed to it directly.</>
              : <><span className="legal-strong">Abonnements :</span> conformément aux articles L221-18 et suivants du Code de la consommation, l'utilisateur consommateur dispose d'un délai de 14 jours à compter de la souscription pour se rétracter, en écrivant à <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a>. Si l'utilisateur a demandé l'exécution immédiate du service, le remboursement est diminué du prorata correspondant à la période déjà écoulée.<br /><br />
                  <span className="legal-strong">Packs de Pépites :</span> la rétractation reste possible dans le délai de 14 jours pour la partie du pack non consommée. Toute Pépite consommée avant l'expiration de ce délai emporte, pour la partie consommée, renonciation expresse au droit de rétractation (article L221-28 du Code de la consommation).<br /><br />
                  En cas d'erreur manifeste ou de défaut du service, une demande de remboursement peut par ailleurs être adressée à <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a> dans un délai de 7 jours suivant le débit. Pour les achats effectués via l'App Store (Apple) ou Google Play, les demandes de remboursement sont soumises aux conditions du store concerné et doivent lui être adressées directement.</>}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '3.7 Service Availability' : '3.7 Disponibilité du service'}</span><br />
            {en
              ? 'FillSell strives to ensure service availability 24/7. Temporary interruptions may occur for maintenance. FillSell cannot be held responsible for any temporary unavailability.'
              : "FillSell s'efforce d'assurer la disponibilité du service 24h/24 et 7j/7. Des interruptions temporaires peuvent survenir pour maintenance. FillSell ne saurait être tenu responsable en cas d'indisponibilité temporaire."}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '3.8 Intellectual Property' : '3.8 Propriété intellectuelle'}</span><br />
            {en
              ? 'All elements of the website (logo, design, code, content) are the exclusive property of FillSell. Any reproduction, even partial, without prior written authorization is prohibited.'
              : "L'ensemble des éléments du site (logo, design, code, contenus) sont la propriété exclusive de FillSell. Toute reproduction, même partielle, sans autorisation écrite préalable est interdite."}
          </p>
        </Section>

        {/* CGV — Pépites et services payants. Articles numérotés 1-9 en propre :
            la numérotation des sections existantes (4 RGPD, 8 Extension…) est
            référencée ailleurs (fiches stores, liens du footer) et ne bouge pas. */}
        <Section id="cgv" icon="💎" title={en ? 'Terms of Sale — Nuggets and paid services' : 'Conditions générales de vente (CGV) — Pépites et services payants'}>
          {/* Bascule quotas (02/09) : les Pépites ne sont plus ni vendues ni
              requises — les articles ci-dessous restent PUBLIÉS pour les
              achats passés (soldes achetés honorés, remboursements,
              rétractation). L'avis daté ci-dessous le dit à qui les lit. */}
          <p className="legal-p" style={{ fontStyle: 'italic' }}>
            {en
              ? 'Notice (September 2, 2026): FillSell plans are now expressed as monthly action volumes (see 3.4). Nuggets are no longer offered for sale and are no longer required to use the service. The articles below remain applicable to Nugget packs purchased before that date: purchased balances remain honored under the conditions described.'
              : "Avis (2 septembre 2026) : les forfaits FillSell s'expriment désormais en volumes mensuels d'actions (voir 3.4). Les Pépites ne sont plus proposées à la vente et ne sont plus requises pour utiliser le service. Les articles ci-dessous restent applicables aux packs de Pépites achetés avant cette date : les soldes achetés restent honorés dans les conditions décrites."}
          </p>
          {cgvTexts[en ? 'en' : 'fr'].map((art, ai) => (
            <div key={art.t} style={{ marginBottom: ai === cgvTexts[en ? 'en' : 'fr'].length - 1 ? 0 : 18 }}>
              <p className="legal-p"><span className="legal-strong">{art.t}</span></p>
              {art.ps.map((txt, i) => (
                <p className="legal-p" key={i} style={txt.startsWith('–') ? { paddingLeft: 14 } : undefined}>{txt}</p>
              ))}
            </div>
          ))}
        </Section>

        {/* 4. RGPD / GDPR */}
        <Section id="confidentialite" icon="🔒" title={en ? '4. Personal Data Protection (GDPR)' : '4. Protection des données personnelles (RGPD)'}>
          <p className="legal-p">
            <span className="legal-strong">{en ? '4.1 Data Controller' : '4.1 Responsable du traitement'}</span><br />
            {en
              ? 'FillSell is the controller of personal data collected through the service, in accordance with the General Data Protection Regulation (GDPR — EU 2016/679).'
              : 'FillSell est responsable du traitement des données personnelles collectées via le service, conformément au Règlement Général sur la Protection des Données (RGPD — UE 2016/679).'}
          </p>

          <p className="legal-p"><span className="legal-strong">{en ? '4.2 Data Collected' : '4.2 Données collectées'}</span></p>
          <ul className="legal-ul">
            <li>{en ? 'Email address (account creation and authentication)' : 'Adresse email (création de compte et authentification)'}</li>
            <li><span className="legal-strong">{en ? 'Third-party authentication data (optional):' : 'Données d\'authentification tierce (optionnel) :'}</span> {en
              ? 'if you choose to sign in with Google or Apple, we receive from the provider your email address and, where available, your profile name, for the sole purposes of creating and authenticating your account. FillSell never receives your Google/Apple password and does not access any other data from those accounts (contacts, calendar, files…). You can revoke this access at any time from the security settings of your Google or Apple account.'
              : 'si vous choisissez de vous connecter via Google ou Apple, nous recevons du fournisseur votre adresse email et, le cas échéant, votre nom de profil, aux seules fins de créer et d\'authentifier votre compte. FillSell ne reçoit jamais votre mot de passe Google/Apple et n\'accède à aucune autre donnée de ces comptes (contacts, agenda, fichiers…). Vous pouvez révoquer cet accès à tout moment depuis les réglages de sécurité de votre compte Google ou Apple.'}</li>
            <li>{en ? 'Sales and inventory data entered by the user' : "Données de ventes et d'inventaire saisies par l'utilisateur"}</li>
            <li>{en ? 'Payment data (managed exclusively by Stripe — not stored on our servers)' : 'Données de paiement (gérées exclusivement par Stripe — non stockées sur nos serveurs)'}</li>
            <li>{en ? 'Navigation data (technical logs, IP address)' : 'Données de navigation (logs techniques, adresse IP)'}</li>
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}><span className="legal-strong">{en ? '4.3 Purposes of Processing' : '4.3 Finalités du traitement'}</span></p>
          <ul className="legal-ul">
            <li>{en ? 'Provision and improvement of the service' : 'Fourniture et amélioration du service'}</li>
            <li>{en ? 'Subscription and billing management' : 'Gestion des abonnements et de la facturation'}</li>
            <li>{en ? 'User support' : 'Support utilisateur'}</li>
            <li>{en ? 'Security and fraud prevention' : 'Sécurité et prévention des fraudes'}</li>
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}>
            <span className="legal-strong">{en ? '4.4 Your Rights' : '4.4 Vos droits'}</span><br />
            {en
              ? 'In accordance with the GDPR, you have the following rights regarding your data:'
              : 'Conformément au RGPD, vous disposez des droits suivants sur vos données :'}
          </p>
          <ul className="legal-ul">
            <li><span className="legal-strong">{en ? 'Right of access:' : 'Droit d\'accès :'}</span> {en ? 'obtain a copy of your personal data' : 'obtenir une copie de vos données personnelles'}</li>
            <li><span className="legal-strong">{en ? 'Right of rectification:' : 'Droit de rectification :'}</span> {en ? 'correct inaccurate data' : 'corriger des données inexactes'}</li>
            <li><span className="legal-strong">{en ? 'Right to erasure:' : 'Droit à l\'effacement :'}</span> {en ? 'delete your data ("right to be forgotten")' : 'supprimer vos données (« droit à l\'oubli »)'}</li>
            <li><span className="legal-strong">{en ? 'Right to data portability:' : 'Droit à la portabilité :'}</span> {en ? 'receive your data in a structured format' : 'recevoir vos données dans un format structuré'}</li>
            <li><span className="legal-strong">{en ? 'Right to object:' : 'Droit d\'opposition :'}</span> {en ? 'object to certain processing' : 'vous opposer à certains traitements'}</li>
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}>
            {en
              ? <>To exercise these rights, contact us at: <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a>. We will respond within a maximum of 30 days.</>
              : <>Pour exercer ces droits, contactez-nous à : <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a>. Nous répondrons dans un délai maximum de 30 jours.</>}
          </p>
          <p className="legal-p">
            {en
              ? <>You may also lodge a complaint with the relevant data protection authority in your country.</>
              : <>Vous pouvez également introduire une réclamation auprès de la <span className="legal-strong">CNIL</span> (<a href="https://www.cnil.fr" className="legal-link" target="_blank" rel="noreferrer">cnil.fr</a>).</>}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '4.5 Data Retention' : '4.5 Conservation des données'}</span><br />
            {en
              ? 'Data is retained for the duration of the subscription, then deleted within 90 days of account closure, unless otherwise required by law.'
              : "Les données sont conservées pendant toute la durée de l'abonnement, puis supprimées dans un délai de 90 jours suivant la clôture du compte, sauf obligation légale contraire."}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '4.6 Account Deletion' : '4.6 Suppression de compte'}</span><br />
            {en
              ? <>You can delete your FillSell account and all associated data directly from the app: go to <span className="legal-strong">Profile → Settings → Delete my account</span>, then confirm the action.</>
              : <>Vous pouvez supprimer votre compte FillSell et l'ensemble de vos données associées directement depuis l'application : rendez-vous dans <span className="legal-strong">Profil → Paramètres → Supprimer mon compte</span>, puis confirmez l'action.</>}
          </p>
          <p className="legal-p">
            {en
              ? 'Deletion is immediate and permanent. It results in:'
              : 'La suppression est immédiate et définitive. Elle entraîne :'}
          </p>
          <ul className="legal-ul">
            <li>{en ? 'Deletion of your profile (email, username, preferences)' : 'La suppression de votre profil (email, pseudo, préférences)'}</li>
            <li>{en ? 'Deletion of all your inventory and sales history' : "La suppression de l'intégralité de votre inventaire et de votre historique de ventes"}</li>
            <li>{en
              ? 'Automatic cancellation of your current Premium subscription (Stripe or Apple/Google depending on your payment method)'
              : "L'annulation automatique de votre abonnement Premium en cours (Stripe ou Apple/Google selon votre méthode de paiement)"}
            </li>
          </ul>
          <p className="legal-p" style={{ marginTop: 10 }}>
            {en
              ? 'Some billing data may be retained beyond the account deletion to meet our legal and accounting obligations (retention of transaction records as required by applicable law).'
              : "Certaines données de facturation peuvent être conservées au-delà de la suppression du compte, pour répondre à nos obligations légales et comptables (conservation des justificatifs de transaction imposée par la loi française)."}
          </p>
          <p className="legal-p">
            {en
              ? <>If you encounter any difficulty deleting your account from the app, you can also submit your request by email at <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a>.</>
              : <>Si vous rencontrez une difficulté pour supprimer votre compte depuis l'application, vous pouvez également faire votre demande par email à <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a>.</>}
          </p>

          <p className="legal-p">
            <span className="legal-strong">{en ? '4.7 Sub-processors' : '4.7 Sous-traitants'}</span><br />
            {en
              ? 'FillSell uses the following sub-processors, all GDPR-compliant:'
              : 'FillSell fait appel aux sous-traitants suivants, tous conformes au RGPD :'}
          </p>
          <ul className="legal-ul">
            <li><span className="legal-strong">Supabase</span> — {en ? 'data storage (EU infrastructure)' : 'stockage des données (infrastructure EU)'}</li>
            <li><span className="legal-strong">Vercel</span> — {en ? 'application hosting' : "hébergement de l'application"}</li>
            <li><span className="legal-strong">Stripe</span> — {en ? 'payment processing (PCI-DSS certified)' : 'traitement des paiements (certifié PCI-DSS)'}</li>
            <li><span className="legal-strong">Google / Apple</span> — {en ? 'identity providers (optional sign-in with Google or Apple)' : 'fournisseurs d\'identité (connexion optionnelle via Google ou Apple)'}</li>
          </ul>
        </Section>

        {/* 5. Cookies */}
        <Section icon="🍪" title={en ? '5. Cookie Policy' : '5. Politique de cookies'}>
          <p className="legal-p">
            {en
              ? 'FillSell uses a minimal number of cookies, strictly necessary for the operation of the service:'
              : 'FillSell utilise un nombre minimal de cookies, strictement nécessaires au fonctionnement du service :'}
          </p>
          <ul className="legal-ul">
            <li><span className="legal-strong">{en ? 'Session cookie:' : 'Cookie de session :'}</span> {en ? 'maintaining user connection (Supabase Auth)' : 'maintien de la connexion utilisateur (Supabase Auth)'}</li>
            <li><span className="legal-strong">{en ? 'Local preferences:' : 'Préférences locales :'}</span> {en ? 'active tab, display settings (localStorage — not shared with third parties)' : 'onglet actif, paramètres d\'affichage (localStorage — non transmis à des tiers)'}</li>
          </ul>
          <p className="legal-p" style={{ marginTop: 10 }}>
            {en
              ? <>FillSell uses <span className="legal-strong">no advertising cookies</span> or third-party trackers for targeting purposes. No explicit consent is required for strictly necessary cookies, in accordance with the ePrivacy Directive.</>
              : <>FillSell n'utilise <span className="legal-strong">aucun cookie publicitaire</span> ni tracker tiers à des fins de ciblage. Aucun consentement explicite n'est requis pour les cookies strictement nécessaires, conformément à la directive ePrivacy.</>}
          </p>
        </Section>

        {/* 6. Droit applicable / Applicable Law */}
        <Section icon="⚖️" title={en ? '6. Applicable Law and Disputes' : '6. Droit applicable et litiges'}>
          <p className="legal-p">
            {en
              ? 'These Terms and Conditions and legal notices are governed by French law. In the event of a dispute, an amicable resolution will be sought first. Failing that, the competent courts will be those of FillSell\'s registered office.'
              : <>Les présentes CGU et mentions légales sont régies par le <span className="legal-strong">droit français</span>. En cas de litige, une solution amiable sera recherchée en priorité. À défaut, les tribunaux compétents seront ceux du ressort du siège de FillSell.</>}
          </p>
          <p className="legal-p">
            {en
              ? <>In accordance with applicable consumer law, the user may use a free consumer mediator. For any dispute related to an online payment, the European Commission's online dispute resolution platform is available at: <a href="https://ec.europa.eu/consumers/odr" className="legal-link" target="_blank" rel="noreferrer">ec.europa.eu/consumers/odr</a>.</>
              : <>Conformément à l'article L.612-1 du Code de la consommation, l'utilisateur peut recourir gratuitement à un médiateur de la consommation. Pour tout litige lié à un paiement en ligne, la plateforme de règlement en ligne des litiges de la Commission européenne est accessible à : <a href="https://ec.europa.eu/consumers/odr" className="legal-link" target="_blank" rel="noreferrer">ec.europa.eu/consumers/odr</a>.</>}
          </p>
        </Section>

        {/* 7. App Store Privacy */}
        <Section icon="🔐" title={p.title}>
          <p className="legal-p">{p.intro}</p>

          <p className="legal-p" style={{ marginTop: 12 }}><span className="legal-strong">{p.collectedTitle}</span></p>
          <ul className="legal-ul">
            {p.collected.map((item, i) => <li key={i}>{item}</li>)}
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}><span className="legal-strong">{p.usageTitle}</span></p>
          <ul className="legal-ul">
            {p.usage.map((item, i) => <li key={i}>{item}</li>)}
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}>{p.storage}</p>
          <p className="legal-p">{p.rights} <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a></p>
          <p className="legal-p">{p.noTrack}</p>
          <p className="legal-p" style={{ fontStyle: "italic", color: "#94A3B8", fontSize: 12.5 }}>{p.compliance}</p>
        </Section>

        {/* 8. Extension Chrome */}
        <Section icon="🧩" title={en ? '8. Chrome Extension (cross-post)' : '8. Extension Chrome (cross-post)'}>
          <p className="legal-p">
            {en
              ? <>FillSell offers an optional <span className="legal-strong">Chrome extension</span> that publishes the listings you generate in FillSell onto the marketplaces where you sell (Vinted, Leboncoin, eBay, Beebs), checks their status, and can withdraw them after you confirm a sale (see 8.4). Installing and using it is entirely optional.</>
              : <>FillSell propose une <span className="legal-strong">extension Chrome</span> optionnelle qui publie les annonces générées dans FillSell sur les plateformes de vente (Vinted, Leboncoin, eBay, Beebs), vérifie leur statut et peut les retirer après confirmation d'une vente (voir 8.4). Son installation et son utilisation sont entièrement facultatives.</>}
          </p>

          <p className="legal-p" style={{ marginTop: 12 }}><span className="legal-strong">{en ? '8.1 Access requested and purpose' : '8.1 Accès demandés et finalités'}</span></p>
          <ul className="legal-ul">
            <li><span className="legal-strong">Vinted, Leboncoin, eBay, Beebs :</span> {en ? 'the extension reads and fills the listing forms on these sites only, to publish on your behalf. It runs solely on these pages and does not read your general browsing.' : "l'extension lit et remplit les formulaires de dépôt d'annonce sur ces sites uniquement, afin de publier à votre place. Elle n'agit que sur ces pages et ne lit pas votre navigation générale."}</li>
            <li><span className="legal-strong">fillsell.app :</span> {en ? 'reads your FillSell session so the extension can act on your account.' : "lit votre session FillSell pour que l'extension puisse agir sur votre compte."}</li>
            <li><span className="legal-strong">Supabase :</span> {en ? 'communicates with the FillSell backend to fetch the listings to publish and report their status.' : "communique avec le backend FillSell pour récupérer les annonces à publier et remonter leur statut."}</li>
            <li><span className="legal-strong">{en ? 'Local storage & scheduling:' : 'Stockage local & planification :'}</span> {en ? 'the extension stores your FillSell session and its settings locally in the browser, and periodically checks for new listings to publish.' : "l'extension stocke localement votre session FillSell et ses réglages dans le navigateur, et vérifie périodiquement s'il y a de nouvelles annonces à publier."}</li>
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}><span className="legal-strong">{en ? '8.2 Data handling' : '8.2 Traitement des données'}</span></p>
          <ul className="legal-ul">
            <li>{en ? 'The extension collects no additional personal data beyond what is already processed by the FillSell service.' : "L'extension ne collecte aucune donnée personnelle supplémentaire au-delà de ce qui est déjà traité par le service FillSell."}</li>
            <li>{en ? 'Your marketplace credentials (Vinted, Leboncoin…) are never read or stored: the extension acts within the session you have already opened in your browser.' : "Vos identifiants des plateformes (Vinted, Leboncoin…) ne sont jamais lus ni stockés : l'extension agit dans la session que vous avez déjà ouverte dans votre navigateur."}</li>
            <li>{en ? 'The only sensitive item in transit is your FillSell session token (Supabase), kept locally in the browser and used only to authenticate calls to the FillSell backend.' : "La seule donnée sensible en transit est votre jeton de session FillSell (Supabase), conservé localement dans le navigateur et utilisé uniquement pour authentifier les appels au backend FillSell."}</li>
            <li>{en ? 'No data is sold or shared with third parties; the extension contains no tracking or advertising SDK.' : "Aucune donnée n'est vendue ni partagée avec des tiers ; l'extension ne contient aucun SDK de tracking ou de publicité."}</li>
          </ul>

          <p className="legal-p" style={{ marginTop: 12 }}><span className="legal-strong">{en ? '8.3 Technical breakdown of permissions (Chrome Web Store)' : '8.3 Détail technique des permissions (Chrome Web Store)'}</span></p>
          <p className="legal-p">
            {en
              ? <>Every key declared in the extension's <span className="legal-strong">manifest.json</span> is listed below with its exact justification:</>
              : <>Chaque clé déclarée dans le <span className="legal-strong">manifest.json</span> de l'extension est listée ci-dessous avec sa justification exacte :</>}
          </p>
          <div style={{ overflowX: 'auto', margin: '8px 0 4px', border: `1px solid ${C.border}`, borderRadius: 12 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520, fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <th style={{ textAlign: 'left', padding: '9px 12px', fontWeight: 800, color: C.text, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{en ? 'Key' : 'Clé'}</th>
                  <th style={{ textAlign: 'left', padding: '9px 12px', fontWeight: 800, color: C.text, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{en ? 'Section' : 'Section'}</th>
                  <th style={{ textAlign: 'left', padding: '9px 12px', fontWeight: 800, color: C.text, borderBottom: `1px solid ${C.border}` }}>{en ? 'Justification' : 'Justification'}</th>
                </tr>
              </thead>
              <tbody>
                {extensionPermissions.map((row, i) => (
                  <tr key={row.key} style={{ background: i % 2 ? '#FCFDFE' : '#fff' }}>
                    <td style={{ padding: '9px 12px', color: C.text, borderBottom: `1px solid ${C.border}`, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{row.key}</td>
                    <td style={{ padding: '9px 12px', color: C.sub, borderBottom: `1px solid ${C.border}`, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, whiteSpace: 'nowrap' }}>{row.scope}</td>
                    <td style={{ padding: '9px 12px', color: C.sub, borderBottom: `1px solid ${C.border}`, lineHeight: 1.5 }}>{en ? row.en : row.fr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="legal-p" style={{ fontStyle: 'italic', color: C.label, fontSize: 12.5, marginTop: 8 }}>
            {en
              ? 'The extension declares no other permission (no « tabs », « history » or « <all_urls> » access).'
              : "L'extension ne déclare aucune autre permission (pas d'accès « tabs », « history » ni « <all_urls> »)."}
          </p>

          <p className="legal-p" style={{ marginTop: 12 }}><span className="legal-strong">{en ? '8.4 Automated listing withdrawal' : '8.4 Retrait automatisé des annonces'}</span></p>
          <p className="legal-p">
            {en
              ? <>When you confirm a sale in FillSell, the extension can automatically withdraw the corresponding listings published on the other platforms (Vinted, Leboncoin, eBay, Beebs), in order to prevent a double sale. This withdrawal is never triggered without your explicit confirmation: you validate the sale in the app; the extension then performs, in your browser and within your open sessions, the same deletion actions you would perform manually (including, where applicable, selecting a reason such as "sold on another platform"). The withdrawal is final as far as the platform is concerned: a withdrawn listing cannot be restored by FillSell. FillSell cannot be held liable for a withdrawal resulting from an erroneous sale confirmation on your part; check the price and the item before confirming.</>
              : <>Lorsqu'une vente est confirmée <span className="legal-strong">par vous</span> dans FillSell, l'extension peut retirer automatiquement les annonces correspondantes publiées sur les autres plateformes (Vinted, Leboncoin, eBay, Beebs), afin d'éviter une double vente. Ce retrait n'est jamais déclenché sans votre confirmation explicite : c'est vous qui validez la vente dans l'application ; l'extension exécute alors, dans votre navigateur et dans vos sessions ouvertes, les mêmes actions de suppression que celles que vous feriez manuellement (y compris, le cas échéant, la sélection d'un motif tel que « vendu sur une autre plateforme »). Le retrait est définitif au sens de la plateforme concernée : une annonce retirée ne peut pas être restaurée par FillSell. FillSell ne saurait être tenu responsable d'un retrait consécutif à une confirmation de vente erronée de votre part ; vérifiez le prix et l'article avant de confirmer.</>}
          </p>

          <p className="legal-p" style={{ marginTop: 12 }}>
            {en
              ? <>You can remove the extension at any time from <span className="legal-strong">chrome://extensions</span>; this immediately stops all access described above. The rights set out in section 4 (GDPR) apply identically, at <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a>.</>
              : <>Vous pouvez retirer l'extension à tout moment depuis <span className="legal-strong">chrome://extensions</span> ; cela interrompt immédiatement tous les accès décrits ci-dessus. Les droits prévus à la section 4 (RGPD) s'appliquent à l'identique, à <a href="mailto:support@fillsell.app" className="legal-link">support@fillsell.app</a>.</>}
          </p>
        </Section>

        {/* Contact */}
        <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
          <p style={{ fontSize: 13, color: C.label }}>
            {en ? 'Questions?' : 'Des questions ?'}{' '}
            {en ? 'Contact us at' : 'Contactez-nous à'}{' '}
            <a href="mailto:support@fillsell.app" style={{ color: C.teal, fontWeight: 600, textDecoration: "none" }}>support@fillsell.app</a>
          </p>
        </div>

      </div>
    </div>
  );
}
