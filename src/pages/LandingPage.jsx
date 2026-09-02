import { useState, useEffect, useCallback, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { track } from '../analytics/analytics';
import BrandMark from '../components/BrandMark';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import './landing.css';

/* Adresse de contact publique — la même que dans /legal. */
const CONTACT_EMAIL = 'support@fillsell.app';
const APP_STORE_URL = 'https://apps.apple.com/app/id6762152785';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=app.fillsell.app';
/* Badges stores affichés depuis le 2026-07-26 : l'app est publiée sur les DEUX
   stores (App Store id6762152785 ; Play canal Production, release 20 / 2.3,
   177 pays). Le flag couvre les deux badges d'un bloc — ne repasser à false que
   si les deux fiches redeviennent indisponibles. */
const STORE_BADGES_VISIBLE = true;
const TIKTOK_URL = 'https://www.tiktok.com/@fill.sell';
const X_URL = 'https://x.com/fillsellapp';

/* Photo du test de publication réel (t-shirt Patagonia), et non un mock. */
const HERO_PHOTO = '/pata1.jpg';

function getInitialLang() {
  const saved = localStorage.getItem('fs_lang');
  if (saved === 'fr' || saved === 'en') return saved;
  return (navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/* Lot 1 (2026-08-09) — refonte compréhension. Règles tenues ici :
   - le mot « Pépites » n'apparaît NULLE PART avant la section Tarifs ;
   - aucune promesse de retrait « tout seul / instantané / zéro risque » :
     le retrait après vente est SEMI-automatique (détection auto, confirmation
     utilisateur — pending_removal + bandeau), le texte doit le dire ;
   - la mécanique app-pilote / extension-PC-exécute est expliquée AVANT
     l'inscription (section « Comment ça marche » + FAQ). */
const COPY = {
  fr: {
    navHow: 'Comment ça marche', navPublish: 'Publication', navPricing: 'Tarifs',
    ctaStart: 'Commencer', login: 'Se connecter',
    heroKicker: 'Revente automatisée · France',
    heroLead: 'Ton dressing Vinted,', heroAccent: 'publié aussi sur Leboncoin, eBay et Beebs.',
    heroSub: "Importe tes annonces en un clic, elles partent sur les autres plateformes sans que tu refasses quoi que ce soit. Tu pilotes tout depuis ton téléphone.",
    heroTrust: 'Gratuit pour commencer — sans carte bancaire',
    storeApple: "Télécharger dans l'App Store", storePlay: 'Disponible sur Google Play',
    phS1: 'Ajout', phS2: 'Retouche IA', phS3: 'Publication',
    phItem: 'T-shirt Patagonia P-6', phAdded: 'Ajouté à ton stock', phPrice: '22 €',
    phCond: 'Bon état',
    phDesc: 'Patagonia P-6 Logo, coton bio, taille L, très bon état — porté quelques fois.',
    phRetouch: "Photo retouchée par l'IA", phSending: 'Envoi…',
    phDone: 'Publié sur 4 plateformes', phSent: 'Publications envoyées',
    vocTagCat: 'Mode', vocTagSize: 'Taille',

    howTitle: 'Comment ça marche',
    howPhoneT: 'Ton téléphone',
    howPhoneB: "Tu ajoutes tes articles, tu choisis où publier, tu pilotes tout d'où tu veux.",
    howPcT: 'Ton ordinateur',
    howPcB: 'Une petite extension Chrome, installée une seule fois, publie à ta place avec tes propres comptes. Jamais tes mots de passe.',
    howCloudT: 'FillSell',
    howCloudB: 'Tes annonces, tes ventes et ton stock restent synchronisés partout.',
    howNote: "Ton ordinateur est éteint ? Rien n'est perdu : tes actions attendent en file et partent à la prochaine ouverture de Chrome.",

    vintedKicker: 'Import Vinted',
    vintedTitle: 'Tu as déjà 200 annonces sur Vinted ? Tu ne les refais pas.',
    vintedBody: "FillSell importe ton dressing en un clic : titres, prix, photos, tout arrive dans ton stock. On lit tes annonces, on ne publie, ne modifie ni ne supprime rien. Ensuite, tu choisis lesquelles envoyer sur Leboncoin, eBay et Beebs.",
    vintedFree: 'Import gratuit et illimité.',
    vintedCta: 'Importer mon dressing',

    pubKicker: 'Publication', pubTitle: 'Une annonce. Quatre plateformes.',
    pubBody: 'Tu remplis une fois. FillSell publie sur Vinted, Leboncoin, eBay et Beebs avec tes comptes. Quatre fois plus d\'acheteurs devant le même article, sans quatre fois le travail.',
    pubOneItem: '1 seul ajout', pubAuto: 'Automatique', pubSold: 'Vendu sur',

    repubKicker: 'Republication',
    repubTitle: 'Tes annonces qui dorment remontent toutes seules.',
    repubBody: "Sur Vinted, une annonce de trois semaines n'est plus vue par personne. FillSell la republie pour la remettre en haut des résultats — au rythme d'une vraie personne, avec un plafond que tu règles, et tu peux couper à tout moment.",
    repubMention: 'Republication manuelle sur tous les plans, automatique avec le plan Pro.',

    soldKicker: 'Après la vente',
    soldTitle: 'Vendu sur une plateforme ? Tu retires les autres en un tap.',
    soldBody: "FillSell détecte la vente et te prévient. Tu confirmes, il retire les annonces des autres plateformes. Fini les acheteurs à qui tu dois expliquer que l'article est déjà parti.",

    gainsKicker: 'Stock & bénéfices',
    gainsTitle: 'Ton stock et tes bénéfices, à jour tout seuls.',
    gainsBody: "Ce que tu as acheté, ce que tu as vendu, ce qu'il te reste et ce que ça t'a rapporté. Rangé, chiffré, sans tableur à tenir.",

    toolsKicker: 'La boîte à outils', toolsTitle: 'Quatre outils pour aller plus vite.',

    priceKicker: 'Tarifs', priceTitle: 'Un plan pour chaque volume.',
    priceSub: 'Commence gratuitement. Passe Premium ou Pro quand tu veux vendre plus, sans engagement.',
    perMonth: '/ mois', freeTag: 'Pour se lancer', priceFree: '0 €',
    freeAds: '{ADS_FREE} annonces créées et publiées sur les 4 plateformes chaque mois',
    popular: 'Le plus populaire', priceP: '12,99 €',
    pAds: '{ADS_PREMIUM} annonces créées et publiées sur les 4 plateformes chaque mois',
    pricePro: '29,99 €',
    proAds: '{ADS_PRO} annonces créées et publiées sur les 4 plateformes chaque mois',
    ctaFree: 'Commencer gratuitement', ctaPremium: 'Passer Premium', ctaPro: 'Passer Pro',
    // (coinsTitle/coinsBody supprimées au nettoyage Pépites du 02/09 soir —
    // chaînes mortes, l'encadré qui les lisait est déjà remplacé.)

    faqTitle: "Les questions qu'on nous pose.",
    ctaTitle: 'Prêt à publier partout, sans effort ?',
    ctaBody: 'Commence gratuitement — sans carte bancaire.',
    ctaBtn: 'Commencer gratuitement',
    footTag: 'Revente automatisée', footLegal: 'Mentions légales',
    footPrivacy: 'Confidentialité', footContact: 'Contact',
    footBlog: 'Guides & blog revente',
  },
  en: {
    navHow: 'How it works', navPublish: 'Publishing', navPricing: 'Pricing',
    ctaStart: 'Get started', login: 'Log in',
    heroKicker: 'Automated reselling · France',
    heroLead: 'Your Vinted wardrobe,', heroAccent: 'also live on Leboncoin, eBay and Beebs.',
    heroSub: 'Import your listings in one click — they go live on the other marketplaces without you redoing a thing. You run everything from your phone.',
    heroTrust: 'Free to start — no credit card required',
    storeApple: 'Download on the App Store', storePlay: 'Get it on Google Play',
    phS1: 'Add', phS2: 'AI edit', phS3: 'Publishing',
    phItem: 'Patagonia P-6 T-shirt', phAdded: 'Added to your stock', phPrice: '€22',
    phCond: 'Good cond.',
    phDesc: 'Patagonia P-6 Logo, organic cotton, size L, great condition — worn a few times.',
    phRetouch: 'Photo retouched by AI', phSending: 'Sending…',
    phDone: 'Listed on 4 marketplaces', phSent: 'Listings sent',
    vocTagCat: 'Fashion', vocTagSize: 'Size',

    howTitle: 'How it works',
    howPhoneT: 'Your phone',
    howPhoneB: 'You add your items, pick where to publish, and run everything from anywhere.',
    howPcT: 'Your computer',
    howPcB: 'A small Chrome extension, installed once, publishes for you with your own accounts. Never your passwords.',
    howCloudT: 'FillSell',
    howCloudB: 'Your listings, sales and stock stay in sync everywhere.',
    howNote: 'Computer off? Nothing is lost: your actions wait in line and go out the next time Chrome opens.',

    vintedKicker: 'Vinted import',
    vintedTitle: "Already 200 listings on Vinted? You won't redo them.",
    vintedBody: 'FillSell imports your wardrobe in one click: titles, prices, photos — everything lands in your stock. We read your listings; we never publish, edit or delete anything. Then you pick which ones to send to Leboncoin, eBay and Beebs.',
    vintedFree: 'Free, unlimited import.',
    vintedCta: 'Import my wardrobe',

    pubKicker: 'Publishing', pubTitle: 'One listing. Four marketplaces.',
    pubBody: 'You fill it in once. FillSell publishes on Vinted, Leboncoin, eBay and Beebs with your accounts. Four times more buyers on the same item — without four times the work.',
    pubOneItem: '1 single add', pubAuto: 'Automatic', pubSold: 'Sold on',

    repubKicker: 'Reposting',
    repubTitle: 'Your sleeping listings climb back up on their own.',
    repubBody: 'On Vinted, a three-week-old listing is seen by no one. FillSell reposts it to put it back on top of the results — at a human pace, with a daily cap you set, and you can switch it off anytime.',
    repubMention: 'Manual reposting on every plan, automatic with the Pro plan.',

    soldKicker: 'After the sale',
    soldTitle: 'Sold on one marketplace? Remove the others in one tap.',
    soldBody: 'FillSell detects the sale and lets you know. You confirm, it removes the listings from the other marketplaces. No more buyers you have to tell the item is already gone.',

    gainsKicker: 'Stock & profits',
    gainsTitle: 'Your stock and profits, up to date on their own.',
    gainsBody: "What you bought, what you sold, what's left and what it earned you. Sorted, priced, no spreadsheet to maintain.",

    toolsKicker: 'The toolbox', toolsTitle: 'Four tools to move faster.',

    priceKicker: 'Pricing', priceTitle: 'A plan for every volume.',
    priceSub: 'Start free. Move to Premium or Pro whenever you want to sell more — no commitment.',
    perMonth: '/ mo', freeTag: 'To get started', priceFree: '€0',
    freeAds: '{ADS_FREE} listings created and published on all 4 marketplaces every month',
    popular: 'Most popular', priceP: '€12.99',
    pAds: '{ADS_PREMIUM} listings created and published on all 4 marketplaces every month',
    pricePro: '€29.99',
    proAds: '{ADS_PRO} listings created and published on all 4 marketplaces every month',
    ctaFree: 'Start free', ctaPremium: 'Go Premium', ctaPro: 'Go Pro',
    // (coinsTitle/coinsBody removed with the 02/09 Pépites cleanup — dead
    // strings, the block that read them is already replaced.)

    faqTitle: 'The questions we get asked.',
    ctaTitle: 'Ready to list everywhere, effortlessly?',
    ctaBody: 'Start free — no credit card required.',
    ctaBtn: 'Start free',
    footTag: 'Automated reselling', footLegal: 'Legal notice',
    footPrivacy: 'Privacy', footContact: 'Contact',
    footBlog: 'Reselling guides & blog',
  },
};

/* Boîte à outils (lot 1) : 4 cartes, pas une de plus — l'ancienne grille
   « Tout le reste » (8 cartes) diluait la page et sa carte « Stock illimité »
   contredisait le plafond Free de 200 articles (coin_config.free_stock_limit).
   Chaque libellé se comprend sans connaître le produit : « Lens » ne sort
   jamais sans son sous-titre explicatif. Aucun coût en Pépites ici — la
   monnaie n'apparaît qu'à partir de la section Tarifs. */
const TOOLS = {
  fr: [
    { emoji: '🔍', t: "Lens — le prix avant d'acheter", b: 'En brocante, photographie un article : FillSell estime à combien il se revend.' },
    { emoji: '✨', t: "L'IA écrit l'annonce", b: 'Photographie ton article : le titre, la description et la catégorie sont remplis.' },
    { emoji: '📸', t: 'Retouche photo', b: 'Des photos nettes qui donnent envie de cliquer.' },
    { emoji: '🎙️', t: 'Commande vocale', b: 'Décris ton article à voix haute, il entre dans ton stock.' },
  ],
  en: [
    { emoji: '🔍', t: 'Lens — the price before you buy', b: 'At a flea market, photograph an item: FillSell estimates what it resells for.' },
    { emoji: '✨', t: 'The AI writes the listing', b: 'Photograph your item: title, description and category are filled in.' },
    { emoji: '📸', t: 'Photo touch-up', b: 'Clean photos that make people want to click.' },
    { emoji: '🎙️', t: 'Voice commands', b: 'Describe your item out loud — it lands in your stock.' },
  ],
};

/* Cartes de plans — refonte lot 1 (2026-08-09) : chaque carte annonce d'abord
   un RÉSULTAT (« ≈ N annonces créées et publiées sur les 4 plateformes / mois »,
   jeton {ADS_*} calculé depuis les grants lus en base), les coûts unitaires
   sont SORTIS des puces (ils restent dans la FAQ « C'est quoi les Pépites ? »).
   La landing DIVERGE donc volontairement du squelette commun ConversionModal /
   PlanDetailsModal de l'app (07-08/08) : l'app parle à un utilisateur qui
   connaît déjà les Pépites, la landing à un visiteur qui ne les connaît pas.
   Les jetons {FREE}/{PREMIUM}/{PRO}/{LENS_*}/{ADS_*} sont remplis par
   fillGrants : la page ne peut pas promettre un volume qu'on ne sert pas. */
const PUBLISH_LINE = {
  fr: 'Publication auto sur Vinted, Leboncoin, eBay & Beebs',
  en: 'Auto-publishing to Vinted, Leboncoin, eBay & Beebs',
};

const PLANS = {
  fr: {
    // « N Pépites/mois » + republication au squelette UNIFORME — mêmes
    // formulations que les modales de l'app (uniformisation 27/08 soir,
    // décision Nico). Business n'a pas de carte ici (hors landing).
    // Bascule quotas (02/09) : plus une Pépite sur les cartes — des GESTES,
    // aux volumes lus en base (jetons {…} ci-dessous).
    free: [
      '{REPUB_FREE} republications Vinted offertes, à vie',
      "Ajout d'article à la voix",
      PUBLISH_LINE.fr,
      'Calcul de marge instantané',
      'Suivi de tes ventes',
    ],
    premium: [
      '{REPUB_PREMIUM} republications Vinted par mois',
      // (La ligne « analyses Lens » a fusionné dans les annonces le 02/09
      // soir : un scan crée l'annonce, un seul volume, dit par la ligne
      // lp-plan__coins au-dessus des puces.)
      'Retouche IA — {RETOUCHE_PREMIUM} photos par mois',
      'Stock illimité',
      PUBLISH_LINE.fr,
      'Import & export Excel de ton stock',
      'Support par email',
    ],
    pro: [
      '{REPUB_PRO} republications Vinted par mois',
      'Republication automatique — tes annonces remontent toutes seules',
      'Retouche IA — {RETOUCHE_PRO} photos par mois',
      'Stock illimité',
      PUBLISH_LINE.fr,
      'Support prioritaire',
    ],
  },
  en: {
    free: [
      '{REPUB_FREE} Vinted repostings included, for life',
      'Voice item adding',
      PUBLISH_LINE.en,
      'Instant margin calculator',
      'Track your sales',
    ],
    premium: [
      '{REPUB_PREMIUM} Vinted repostings a month',
      'AI touch-up — {RETOUCHE_PREMIUM} photos a month',
      'Unlimited stock',
      PUBLISH_LINE.en,
      'Excel import & export of your stock',
      'Email support',
    ],
    pro: [
      '{REPUB_PRO} Vinted repostings a month',
      'Automatic reposting — your listings bump themselves',
      'AI touch-up — {RETOUCHE_PRO} photos a month',
      'Unlimited stock',
      PUBLISH_LINE.en,
      'Priority support',
    ],
  },
};

/* FAQ — lot 1 : trois questions de confiance ajoutées (mécanique extension,
   PC allumé, risque de compte — les trois vraies objections d'avant-inscription)
   et « Et si un article se vend ? » corrigée : le retrait exige une
   confirmation (pending_removal + bandeau), plus jamais « automatiquement /
   zéro risque ». « Comment marche la publication automatique ? » est remplacée
   par « Comment FillSell publie-t-il mes annonces ? » qui dit la vérité
   (extension Chrome), au lieu de la cacher. */
const FAQ = {
  fr: [
    ['Comment fonctionnent les forfaits ?', 'Chaque forfait comprend des volumes mensuels de gestes : des annonces créées par IA — depuis une photo (Lens) ou depuis ton stock — et publiées sur les 4 plateformes ({ADS_FREE} en Free, {ADS_PREMIUM} en Premium, {ADS_PRO} en Pro), des retouches photo et des republications Vinted ({REPUB_FREE} offertes à vie en Free, {REPUB_PREMIUM} par mois en Premium, {REPUB_PRO} en Pro). La publication elle-même est incluse et illimitée. Les compteurs sont visibles dans l’app et se remettent à zéro à chaque cycle.'],
    ['Sur quelles plateformes je publie ?', 'Vinted, Leboncoin, eBay et Beebs — les 4 places de marché qui comptent en France. Un seul ajout, publié sur les quatre en même temps.'],
    ['Comment FillSell publie-t-il mes annonces ?', 'Par une extension Chrome installée une seule fois sur ton ordinateur. Elle remplit les formulaires avec tes comptes déjà connectés. FillSell ne connaît jamais tes mots de passe.'],
    ['Faut-il laisser mon ordinateur allumé ?', 'Pour que les publications partent, oui, avec Chrome ouvert. Si ton ordinateur est éteint, tes actions attendent en file et partent à la prochaine ouverture.'],
    ['Est-ce risqué pour mon compte Vinted ?', 'FillSell agit au rythme d’une personne : des gestes espacés, et la republication automatique est volontairement plafonnée à 45 par jour — une limite de sécurité pour protéger ton compte, pas une limite commerciale. Tu peux tout couper à tout moment. Aucun outil ne peut promettre zéro risque, et nous préférons la prudence aux promesses.'],
    ['Et si un article se vend ?', 'FillSell détecte la vente et te prévient. Tu confirmes, il retire les annonces des autres plateformes et met à jour ton stock, tes marges et tes stats.'],
    ['Lens, c’est illimité ?', 'Un scan Lens crée directement l’annonce : il compte comme une annonce de ton forfait ({ADS_PREMIUM} par mois en Premium, {ADS_PRO} en Pro) — un seul compteur, visible dans l’app, qui repart à chaque cycle.'],
    ['Je peux annuler quand je veux ?', 'Oui. Premium et Pro sont sans engagement : tu changes d’offre ou tu arrêtes en un clic depuis l’app.'],
  ],
  en: [
    ['How do the plans work?', 'Each plan includes monthly volumes of actions: AI-created listings — from a photo (Lens) or from your stock — published to the 4 marketplaces ({ADS_FREE} on Free, {ADS_PREMIUM} on Premium, {ADS_PRO} on Pro), AI photo touch-ups and Vinted repostings ({REPUB_FREE} included for life on Free, {REPUB_PREMIUM} a month on Premium, {REPUB_PRO} on Pro). Publishing itself is included and unlimited. Counters are visible in the app and reset every cycle.'],
    ['Which marketplaces can I publish to?', 'Vinted, Leboncoin, eBay and Beebs — the 4 marketplaces that matter in France. One add, posted to all four at once.'],
    ['How does FillSell publish my listings?', 'Through a Chrome extension installed once on your computer. It fills in the forms with your already-signed-in accounts. FillSell never knows your passwords.'],
    ['Do I need to leave my computer on?', 'For listings to go out, yes — with Chrome open. If your computer is off, your actions wait in line and go out the next time it opens.'],
    ['Is it risky for my Vinted account?', 'FillSell acts at a human pace: spaced-out actions, and automatic reposting is deliberately capped at 45 a day — a safety limit to protect your account, not a commercial one. You can switch everything off at any time. No tool can promise zero risk, and we prefer caution over promises.'],
    ['What happens when an item sells?', 'FillSell detects the sale and lets you know. You confirm, it removes the listings from the other marketplaces and updates your stock, margins and stats.'],
    ['Is Lens unlimited?', 'A Lens scan creates the listing directly: it counts as one listing from your plan ({ADS_PREMIUM} a month on Premium, {ADS_PRO} on Pro) — a single counter, visible in the app, that resets every cycle.'],
    ['Can I cancel anytime?', 'Yes. Premium and Pro have no commitment — switch plans or stop in one tap from the app.'],
  ],
};

/* ── Grants mensuels affichés ───────────────────────────────────────────────
   Les cartes de prix et la FAQ portent des jetons {FREE} / {PREMIUM} / {PRO},
   remplacés au rendu par les valeurs lues dans coin_config (même source que
   l'app : la base fait autorité, cf. ConversionModal). La landing est publique
   et non authentifiée — la lecture passe par le rôle anon, qui a SELECT sur
   coin_config (et, depuis le 2026-07-28, plus AUCUN droit d'écriture).

   FILET, PAS SOURCE : si la requête échoue (hors ligne, Supabase indisponible,
   coupure réseau au premier rendu), on affiche ces valeurs plutôt qu'un blanc,
   un zéro ou un squelette — une page tarifaire vide coûte plus cher qu'une
   page légèrement datée. À tenir à jour au fil des changements de grant, mais
   ce n'est JAMAIS ce qui s'affiche quand la base répond. */
/* Bascule quotas (02/09) : les jetons ne dérivent plus des grants de Pépites
   mais des QUOTAS PAR GESTE de coin_config — la même source que les cartes de
   l'app. Filet, pas source : valeurs de la grille du 02/09. */
/* Fusion scans+annonces (02/09 soir) : les jetons SCANS_* sont morts — un
   scan Lens consomme une annonce, un seul volume partout. */
const GRANTS_FALLBACK = {
  ADS_FREE: 5, ADS_PREMIUM: 40, ADS_PRO: 120,
  REPUB_FREE: 50, REPUB_PREMIUM: 1500, REPUB_PRO: 5000,
  RETOUCHE_PREMIUM: 5, RETOUCHE_PRO: 20,
};
const fillGrants = (texte, g) =>
  String(texte)
    .replace(/\{ADS_FREE\}/g, g.ADS_FREE)
    .replace(/\{ADS_PREMIUM\}/g, g.ADS_PREMIUM)
    .replace(/\{ADS_PRO\}/g, g.ADS_PRO)
    .replace(/\{REPUB_FREE\}/g, g.REPUB_FREE)
    .replace(/\{REPUB_PREMIUM\}/g, Number(g.REPUB_PREMIUM).toLocaleString('fr-FR'))
    .replace(/\{REPUB_PRO\}/g, Number(g.REPUB_PRO).toLocaleString('fr-FR'))
    .replace(/\{RETOUCHE_PREMIUM\}/g, g.RETOUCHE_PREMIUM)
    .replace(/\{RETOUCHE_PRO\}/g, g.RETOUCHE_PRO);

/* ── Fragments SVG réutilisés ───────────────────────────────── */
/* (La gemme <Pepite/> a été SUPPRIMÉE au nettoyage Pépites du 02/09 soir —
   plus aucune iconographie de la monnaie sur la landing.) */

/* Étoile/couronne dorée des chips Premium & Pro : dégradé doré inliné, id
   unique via useId — iOS/WebKit ne résout pas un fill="url(#id)" pointant
   vers un <defs> logé dans un <svg width=0 height=0> séparé. `path` reçu en
   prop (étoile ou couronne). */
const GoldGlyph = ({ size = 14, d }) => {
  const gid = 'gold-' + useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: 'relative' }} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FBE9A6" />
          <stop offset="0.5" stopColor="#E7B84C" />
          <stop offset="1" stopColor="#C79433" />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${gid})`} strokeLinejoin="round" />
    </svg>
  );
};

const Check = ({ color = '#2F9E90', size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const CheckDisc = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="#2F9E90" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M20 6 9 17l-5-5" fill="none" stroke="#fff" strokeWidth="2.6"
      strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
  </svg>
);

const Arrow = ({ w = 46, h = 24 }) => (
  <svg width={w} height={h} viewBox="0 0 46 24" fill="none" stroke="#2F9E90" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12h40" /><path d="M34 5l8 7-8 7" />
  </svg>
);

/* Flèche des CTA : SVG plein en currentColor, au lieu du caractère « → » brut
   qui rendait différemment sur iOS (police système / présentation emoji). */
const CtaArrow = ({ size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ flexShrink: 0, verticalAlign: 'middle' }}>
    <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
  </svg>
);

/* Les 4 plateformes, rendues avec les vrais logos via <PlatformLogo> — le même
   composant que StockTab, LensTab, VentesTab et ListingPreviewScreen. Vinted et
   eBay sont les tracés de marque officiels (simple-icons) sur socle blanc ;
   Leboncoin et Beebs sont les icônes d'app officielles (App Store). Aucune
   recoloration avec nos tokens : chaque marque garde sa charte. */
const PLATFORMS = [
  { key: 'vinted', name: 'Vinted' },
  { key: 'leboncoin', name: 'leboncoin' },
  { key: 'ebay', name: 'eBay' },
  { key: 'beebs', name: 'Beebs' },
];

/* Le sélecteur de langue est rendu deux fois : dans la barre en desktop, dans le
   menu burger en mobile. */
const LangToggle = ({ lang, onChange }) => (
  <div className="lp-lang" role="group" aria-label="Langue / Language">
    {['fr', 'en'].map((code) => (
      <button key={code} className={lang === code ? 'on' : ''}
        aria-pressed={lang === code} onClick={() => onChange(code)}>
        {code.toUpperCase()}
      </button>
    ))}
  </div>
);

export default function LandingPage() {
  const nav = useNavigate();
  const [lang, setLang] = useState(getInitialLang);
  const [openFaq, setOpenFaq] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [grants, setGrants] = useState(GRANTS_FALLBACK);

  const t = COPY[lang];
  const isNative = Capacitor.isNativePlatform();

  // Grants lus dans coin_config, comme le reste de l'app. Import dynamique du
  // client Supabase : la landing est la première page servie aux visiteurs, on
  // ne charge donc le client que pour cette requête, sans l'ajouter au chemin
  // critique du premier rendu. Aucun état d'attente : les valeurs de repli sont
  // affichées d'emblée puis remplacées si la base répond — le visiteur ne voit
  // jamais ni blanc ni squelette à la place d'un tarif.
  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const { supabase } = await import('../lib/supabase');
        // Bascule quotas (02/09) : la landing lit les QUOTAS par geste,
        // plus les grants de Pépites. Fusion du 02/09 soir : quota_scan_*
        // n'est plus lu (les clés sont à 0 en base, un scan consomme une
        // annonce — un seul volume).
        const { data, error } = await supabase
          .from('coin_config')
          .select('key, value')
          .in('key', ['quota_annonces_free', 'quota_annonces_premium', 'quota_annonces_pro',
                      'republication_avie_free', 'quota_republication_premium', 'quota_republication_pro',
                      'quota_retouche_premium', 'quota_retouche_pro']);
        if (error || !data?.length || !vivant) return;
        const parKey = Object.fromEntries(data.map((r) => [r.key, r.value]));
        setGrants({
          ADS_FREE:          parKey.quota_annonces_free        ?? GRANTS_FALLBACK.ADS_FREE,
          ADS_PREMIUM:       parKey.quota_annonces_premium     ?? GRANTS_FALLBACK.ADS_PREMIUM,
          ADS_PRO:           parKey.quota_annonces_pro         ?? GRANTS_FALLBACK.ADS_PRO,
          REPUB_FREE:        parKey.republication_avie_free    ?? GRANTS_FALLBACK.REPUB_FREE,
          REPUB_PREMIUM:     parKey.quota_republication_premium ?? GRANTS_FALLBACK.REPUB_PREMIUM,
          REPUB_PRO:         parKey.quota_republication_pro    ?? GRANTS_FALLBACK.REPUB_PRO,
          RETOUCHE_PREMIUM:  parKey.quota_retouche_premium     ?? GRANTS_FALLBACK.RETOUCHE_PREMIUM,
          RETOUCHE_PRO:      parKey.quota_retouche_pro         ?? GRANTS_FALLBACK.RETOUCHE_PRO,
        });
      } catch { /* hors ligne ou client indisponible : le repli reste affiché */ }
    })();
    return () => { vivant = false; };
  }, []);

  useEffect(() => { track('page_view', { page: 'landing' }); }, []);
  useEffect(() => { localStorage.setItem('fs_lang', lang); }, [lang]);

  // FAQPage JSON-LD (2026-08-02) : construit depuis la FAQ réellement AFFICHÉE
  // (même source FAQ[lang], mêmes grants) — jamais un texte parallèle qui
  // divergerait de la page. Il vivait en dur dans index.html : il fuyait alors
  // sur TOUTES les routes SPA (un article de blog avec sa propre FAQ portait
  // DEUX blocs FAQPage) et ses réponses avaient déjà dérivé du rendu. Injecté
  // au montage, retiré au démontage, même contrat que les scripts de BlogPost.
  useEffect(() => {
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ[lang].map(([q, a]) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: fillGrants(a, grants) },
      })),
    });
    document.head.appendChild(el);
    return () => el.remove();
  }, [lang, grants]);

  /* Apparition au scroll : animation-timeline n'est pas encore partout (Safari). */
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.lp-reveal').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [lang]);

  /* Le menu burger n'existe que sous 900px : s'il est resté ouvert, le repasser
     en desktop le laisserait affiché sans burger pour le refermer. */
  useEffect(() => {
    if (!menuOpen) return;
    const mq = window.matchMedia('(min-width: 900px)');
    const onWide = (e) => { if (e.matches) setMenuOpen(false); };
    const onEsc = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    mq.addEventListener('change', onWide);
    window.addEventListener('keydown', onEsc);
    return () => {
      mq.removeEventListener('change', onWide);
      window.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  const goSection = useCallback((id) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const navLinks = [
    { id: 'comment', label: t.navHow },
    { id: 'publication', label: t.navPublish },
    { id: 'tarifs', label: t.navPricing },
    { id: 'faq', label: 'FAQ' },
  ];

  /* Tous les CTA de la landing mènent à la même création de compte — y compris
     "Passer Premium" et "Passer Pro". Pas de paywall avant que l'utilisateur ait
     vu l'app : l'upgrade se fait depuis l'app, pas depuis la landing. `plan` ne
     sert plus qu'à distinguer les CTA dans l'analytics. */
  const startSignup = useCallback((plan) => {
    track('cta_click', { cta: `signup_${plan}`, page: 'landing' });
    nav('/login?mode=signup');
  }, [nav]);

  const changeLang = useCallback((code) => {
    setLang(code);
    localStorage.setItem('fs_lang', code);
    track('change_language', { language: code });
  }, []);

  return (
    <div className="lp-root">
      {/* ══════════ NAV ══════════ */}
      <header className="lp-nav">
        <div className="lp-nav__inner">
          <BrandMark onClick={() => { setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />

          <nav className="lp-nav__links">
            {navLinks.map((l) => (
              <button key={l.id} className="lp-nav__link" onClick={() => goSection(l.id)}>{l.label}</button>
            ))}
          </nav>

          <div className="lp-nav__actions">
            {/* Sous 900px, langue et connexion basculent dans le menu burger. */}
            <div className="lp-nav__desk">
              <LangToggle lang={lang} onChange={changeLang} />
              <button className="lp-btn lp-btn--ghost" onClick={() => nav('/login')}>{t.login}</button>
            </div>

            <button className="lp-btn lp-btn--nav" onClick={() => startSignup('free')}>{t.ctaStart}</button>

            <button className="lp-burger" id="lp-burger" aria-label="Menu" aria-expanded={menuOpen}
              aria-controls="lp-menu" onClick={() => setMenuOpen((o) => !o)}>
              <span /><span /><span />
            </button>
          </div>
        </div>

        <div className={`lp-menu${menuOpen ? ' open' : ''}`} id="lp-menu">
          <nav className="lp-menu__links">
            {navLinks.map((l) => (
              <button key={l.id} className="lp-menu__link" onClick={() => goSection(l.id)}>{l.label}</button>
            ))}
          </nav>
          <div className="lp-menu__foot">
            <LangToggle lang={lang} onChange={changeLang} />
            <button className="lp-btn lp-btn--ghost"
              onClick={() => { setMenuOpen(false); nav('/login'); }}>{t.login}</button>
          </div>
        </div>
      </header>

      {/* ══════════ HERO ══════════ */}
      <section className="lp-hero" id="top">
        <div className="lp-hero__blob lp-hero__blob--teal" />
        <div className="lp-hero__blob lp-hero__blob--peach" />

        <div className="lp-hero__inner">
          <div className="lp-hero__copy">
            <div className="lp-pill"><i /><span>{t.heroKicker}</span></div>

            <h1 className="lp-hero__title">{t.heroLead} <em>{t.heroAccent}</em></h1>
            <p className="lp-hero__sub">{t.heroSub}</p>

            <div className="lp-hero__ctas">
              <button className="lp-btn lp-btn--grad" onClick={() => startSignup('free')}>
                {t.ctaStart} <CtaArrow size={17} />
              </button>
            </div>

            {STORE_BADGES_VISIBLE && !isNative && (
              <div className="lp-stores">
                <a className="lp-store lp-store--apple" href={APP_STORE_URL}
                  target="_blank" rel="noopener noreferrer">
                  <img
                    src={lang === 'fr'
                      ? 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/fr-fr'
                      : 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us'}
                    alt={t.storeApple} loading="lazy"
                  />
                </a>
                <a className="lp-store lp-store--play" href={PLAY_STORE_URL}
                  target="_blank" rel="noopener noreferrer">
                  <img
                    src={lang === 'fr'
                      ? 'https://play.google.com/intl/en_us/badges/static/images/badges/fr_badge_web_generic.png'
                      : 'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png'}
                    alt={t.storePlay} loading="lazy"
                  />
                </a>
              </div>
            )}

            {/* Lot 1 : plus de gemme Pépite ici — la monnaie interne n'apparaît
                qu'à partir de la section Tarifs. */}
            <div className="lp-hero__trust">
              <CheckDisc />
              <span>{t.heroTrust}</span>
            </div>
          </div>

          {/* Téléphone : le stepper de publication, en boucle sur 8 s */}
          <div className="lp-hero__phone">
            <div className="lp-phone">
              <div className="lp-phone__body">
                <div className="lp-phone__screen">
                  <div className="lp-phone__bar">
                    <span className="lp-phone__time">9:41</span>
                    <span className="lp-phone__notch" />
                    <span className="lp-phone__app">FillSell</span>
                  </div>

                  <div className="lp-phone__stage">
                    <div className="lp-stepper" aria-hidden="true">
                      <span className="lp-stepper__num lp-stepper__num--on">1</span>
                      <span className="lp-stepper__bar lp-stepper__bar--1"><i /></span>
                      <span className="lp-stepper__num lp-stepper__num--2">2</span>
                      <span className="lp-stepper__bar lp-stepper__bar--2"><i /></span>
                      <span className="lp-stepper__num lp-stepper__num--3">3</span>
                      <span className="lp-stepper__bar lp-stepper__bar--3"><i /></span>
                      <span className="lp-stepper__num lp-stepper__num--4">4</span>
                    </div>

                    <div className="lp-scr__wrap">
                      {/* Étape 1 — l'article ajouté (photo du test de publication réel) */}
                      <div className="lp-scr lp-scr--1">
                        <span className="lp-scr__label">{t.phS1}</span>
                        <div className="lp-item">
                          <img className="lp-item__photo" src={HERO_PHOTO} alt="" loading="lazy" />
                          <div className="lp-item__body">
                            <div className="lp-item__name">{t.phItem}</div>
                            <div className="lp-item__meta">{t.phAdded}</div>
                          </div>
                          <div className="lp-item__price">{t.phPrice}</div>
                        </div>
                        <div className="lp-tags">
                          <span className="lp-tag lp-tag--cat">👕 {t.vocTagCat}</span>
                          <span className="lp-tag lp-tag--brand">Patagonia</span>
                          <span className="lp-tag">{t.vocTagSize} L</span>
                          <span className="lp-tag">{t.phCond}</span>
                        </div>
                        <div className="lp-desc">{t.phDesc}</div>
                      </div>

                      {/* Étape 2 — retouche IA de la même photo */}
                      <div className="lp-scr lp-scr--2">
                        <span className="lp-scr__label">{t.phS2}</span>
                        <div className="lp-retouch">
                          <div className="lp-retouch__shot lp-retouch__shot--raw">
                            <img src={HERO_PHOTO} alt="" loading="lazy" />
                          </div>
                          <Arrow w={26} h={16} />
                          <div className="lp-retouch__shot lp-retouch__shot--clean">
                            <img src={HERO_PHOTO} alt="" loading="lazy" />
                            <span className="lp-retouch__spark">✨</span>
                          </div>
                        </div>
                        <div className="lp-retouch__caption">{t.phRetouch}</div>
                      </div>

                      {/* Étape 3 — envoi simultané aux 4 plateformes */}
                      <div className="lp-scr lp-scr--3">
                        <span className="lp-scr__label">{t.phS3}</span>
                        {PLATFORMS.map((p) => (
                          <div className="lp-send" key={p.key}>
                            <PlatformLogo platform={p.key} size={22} />
                            <span className="lp-plat__name">{p.name}</span>
                            <span style={{ flex: 1 }} />
                            <span className="lp-send__status">{t.phSending}</span>
                            <span className="lp-send__spin" />
                          </div>
                        ))}
                      </div>

                      {/* Étape 4 — publié */}
                      <div className="lp-scr lp-scr--4">
                        <div className="lp-done__badge">
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff"
                            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div className="lp-done__title">{t.phDone}</div>
                          <div className="lp-done__sub">{t.phSent}</div>
                        </div>
                        <div className="lp-done__list">
                          {PLATFORMS.map((p) => (
                            <span key={p.key} title={p.name}>
                              <PlatformLogo platform={p.key} size={26} />
                              <span className="lp-done__ok">✓</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ COMMENT ÇA MARCHE ══════════
          Cœur du lot 1 : la mécanique app-pilote / extension-PC-exécute,
          expliquée AVANT l'inscription. Jusqu'ici la landing ne mentionnait ni
          extension, ni Chrome, ni ordinateur — le visiteur découvrait le
          prérequis après signup, au premier clic « Publier ». */}
      <section className="lp-section lp-section--tint" id="comment">
        <div className="lp-shell">
          <div className="lp-head lp-head--narrow lp-reveal">
            <h2 className="lp-h2" style={{ margin: 0 }}>{t.howTitle}</h2>
          </div>

          <div className="lp-cards">
            <div className="lp-card lp-reveal">
              <div className="lp-how__emoji" aria-hidden="true">📱</div>
              <div className="lp-card__title">{t.howPhoneT}</div>
              <div className="lp-card__body">{t.howPhoneB}</div>
            </div>

            <div className="lp-card lp-reveal">
              <div className="lp-how__emoji" aria-hidden="true">🧩</div>
              <div className="lp-card__title">{t.howPcT}</div>
              <div className="lp-card__body">{t.howPcB}</div>
            </div>

            <div className="lp-card lp-reveal">
              <div className="lp-how__emoji" aria-hidden="true">☁️</div>
              <div className="lp-card__title">{t.howCloudT}</div>
              <div className="lp-card__body">{t.howCloudB}</div>
            </div>
          </div>

          <div className="lp-hownote lp-reveal">{t.howNote}</div>
        </div>
      </section>

      {/* ══════════ IMPORT VINTED ══════════
          L'argument d'entrée de l'ICP principal : le dressing existant entre
          en un clic, en lecture seule — même contrat que la carte de sync
          in-app (« on lit, on ne publie/modifie/supprime rien »). */}
      <section className="lp-section" id="vinted">
        <div className="lp-shell">
          <div className="lp-head lp-reveal">
            <div className="lp-kicker">{t.vintedKicker}</div>
            <h2 className="lp-h2">{t.vintedTitle}</h2>
            <p className="lp-lead">{t.vintedBody}</p>
          </div>

          <div className="lp-import lp-reveal">
            <span className="lp-import__badge"><CheckDisc />{t.vintedFree}</span>
            <button className="lp-btn lp-btn--grad" onClick={() => startSignup('import')}>
              {t.vintedCta} <CtaArrow size={17} />
            </button>
          </div>
        </div>
      </section>

      {/* ══════════ UNE ANNONCE, QUATRE PLATEFORMES ══════════
          Fusion lot 1 : l'ancienne section « Publication automatique — Un
          geste, publié partout » doublonnait le hero. Une seule idée ici :
          1 ajout → 4 plateformes. Le retrait après vente et les marges ont
          chacun leur section dédiée plus bas. */}
      <section className="lp-section lp-section--tint" id="publication">
        <div className="lp-shell">
          <div className="lp-head lp-reveal">
            <div className="lp-kicker">{t.pubKicker}</div>
            <h2 className="lp-h2">{t.pubTitle}</h2>
            <p className="lp-lead">{t.pubBody}</p>
          </div>

          <div className="lp-fan lp-reveal">
            <div className="lp-fan__inner">
              <div className="lp-fan__col">
                <div className="lp-fan__tile"><img src={HERO_PHOTO} alt="" loading="lazy" /></div>
                <span className="lp-fan__caption">{t.pubOneItem}</span>
              </div>

              <div className="lp-fan__arrow">
                <Arrow />
                <span>{t.pubAuto}</span>
              </div>

              <div className="lp-fan__grid">
                {PLATFORMS.map((p) => (
                  <div className="lp-fan__cell" key={p.key}>
                    <PlatformLogo platform={p.key} size={30} />
                    <span className="lp-plat__name">{p.name}</span>
                    <span style={{ flex: 1 }} />
                    <CheckDisc />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ REPUBLICATION ══════════
          Nouvelle section lot 1 : la republication n'existait que dans les
          cartes de prix, sans jamais dire POURQUOI republier. Discours
          honnête : rythme humain, plafond réglable, coupable à tout moment. */}
      <section className="lp-section" id="republication">
        <div className="lp-shell">
          <div className="lp-head lp-reveal">
            <div className="lp-kicker">{t.repubKicker}</div>
            <h2 className="lp-h2">{t.repubTitle}</h2>
            <p className="lp-lead">{t.repubBody}</p>
          </div>

          <div className="lp-import lp-reveal">
            <span className="lp-import__badge">🔁 {t.repubMention}</span>
          </div>
        </div>
      </section>

      {/* ══════════ VENDU QUELQUE PART ══════════
          Formulation honnête (correction lot 1) : détection automatique,
          retrait SUR CONFIRMATION (« en un tap ») — plus jamais « tout seul /
          instantanément / zéro risque de double-vente », le code ne le fait
          pas (pending_removal + bandeau de confirmation). */}
      <section className="lp-section lp-section--tint" id="vendu">
        <div className="lp-shell">
          <div className="lp-head lp-reveal">
            <div className="lp-kicker">{t.soldKicker}</div>
            <h2 className="lp-h2">{t.soldTitle}</h2>
            <p className="lp-lead">{t.soldBody}</p>
          </div>

          <div className="lp-panel lp-panel--sold lp-reveal">
            <div className="lp-card__sold" style={{ marginTop: 0, justifyContent: 'center' }}>
              <span className="lp-card__sold-on">
                {t.pubSold}
                <PlatformLogo platform="vinted" size={16} />
                Vinted
              </span>
              <span className="lp-card__sold-arr"><CtaArrow size={14} /></span>
              {/* Les 3 autres, retirées : logos réels, désaturés et barrés. */}
              <span className="lp-card__sold-off">
                {PLATFORMS.filter((p) => p.key !== 'vinted').map((p) => (
                  <PlatformLogo key={p.key} platform={p.key} size={16} />
                ))}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ STOCK & BÉNÉFICES ══════════ */}
      <section className="lp-section lp-section--rule" id="gains">
        <div className="lp-shell">
          <div className="lp-head lp-reveal" style={{ marginBottom: 0 }}>
            <div className="lp-kicker">{t.gainsKicker}</div>
            <h2 className="lp-h2">{t.gainsTitle}</h2>
            <p className="lp-lead">{t.gainsBody}</p>
          </div>
        </div>
      </section>

      {/* ══════════ LA BOÎTE À OUTILS ══════════
          Lot 1 : les grandes vitrines Vocal / Lens / Retouche photo et la
          grille « Tout le reste » (8 cartes) sont condensées en UNE section de
          4 cartes — une promesse par carte, compréhensible sans connaître le
          produit. Au passage disparaissent la note deal « 8,4/10 » (feature
          supprimée du produit, cf. AnalyseMarche.jsx) et la carte « Stock
          illimité » qui contredisait le plafond Free de 200 articles. */}
      <section className="lp-section" id="outils">
        <div className="lp-shell">
          <div className="lp-head lp-head--narrow lp-reveal">
            <div className="lp-kicker">{t.toolsKicker}</div>
            <h2 className="lp-h2" style={{ margin: 0 }}>{t.toolsTitle}</h2>
          </div>

          <div className="lp-feats">
            {TOOLS[lang].map((f) => (
              <div className="lp-feat lp-reveal" key={f.t}>
                <div className="lp-feat__icon">{f.emoji}</div>
                <div className="lp-feat__title">{f.t}</div>
                <div className="lp-feat__body">{f.b}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ TARIFS ══════════ */}
      <section className="lp-pricing" id="tarifs">
        <div className="lp-shell">
          <div className="lp-head lp-reveal" style={{ maxWidth: 680 }}>
            <div className="lp-kicker">{t.priceKicker}</div>
            <h2 className="lp-h2" style={{ marginBottom: 14 }}>{t.priceTitle}</h2>
            <p className="lp-lead">{t.priceSub}</p>
          </div>

          <div className="lp-plans">
            {/* FREE */}
            <div className="lp-plan lp-reveal">
              <div className="lp-plan__name">Free</div>
              <div className="lp-plan__tag">{t.freeTag}</div>
              <div className="lp-plan__price"><b>{t.priceFree}</b></div>
              {/* Lot 1 : la ligne sous le prix annonce un RÉSULTAT (≈ N annonces
                  créées + publiées sur les 4 plateformes), pas un solde de
                  crédits — le grant en Pépites est la 1re puce de la liste. */}
              <div className="lp-plan__coins">{fillGrants(t.freeAds, grants)}</div>
              <div className="lp-plan__feats">
                {PLANS[lang].free.map((f) => (
                  <div className="lp-plan__feat" key={f}><Check /><span>{f}</span></div>
                ))}
              </div>
              <button className="lp-plan__cta lp-plan__cta--free" onClick={() => startSignup('free')}>
                {t.ctaFree}
              </button>
            </div>

            {/* PREMIUM */}
            <div className="lp-plan lp-plan--premium lp-reveal">
              <div className="lp-plan__flag">{t.popular}</div>
              <div className="lp-plan__chip lp-plan__chip--premium">
                <span className="lp-plan__shine" />
                <GoldGlyph size={14} d="M12 2l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.8 6.1 20.9l1.2-6.6L2.5 9.9l6.6-.9z" />
                <span className="lp-plan__chip-label">Premium</span>
              </div>
              <div className="lp-plan__price"><b>{t.priceP}</b><span>{t.perMonth}</span></div>
              <div className="lp-plan__coins">{fillGrants(t.pAds, grants)}</div>
              <div className="lp-plan__feats">
                {PLANS[lang].premium.map((f) => (
                  <div className="lp-plan__feat" key={f}><Check /><span>{fillGrants(f, grants)}</span></div>
                ))}
              </div>
              <button className="lp-plan__cta lp-plan__cta--premium" onClick={() => startSignup('premium')}>
                {t.ctaPremium}
              </button>
            </div>

            {/* PRO */}
            <div className="lp-plan lp-plan--pro lp-reveal">
              <div className="lp-plan__chip lp-plan__chip--pro">
                <span className="lp-plan__shine lp-plan__shine--gold" />
                <GoldGlyph size={15} d="M3 8l4.5 3L12 4l4.5 7L21 8l-1.8 10.5H4.8L3 8z" />
                <span className="lp-plan__chip-label lp-plan__chip-label--gold">Pro</span>
              </div>
              <div className="lp-plan__price"><b>{t.pricePro}</b><span>{t.perMonth}</span></div>
              <div className="lp-plan__coins">{fillGrants(t.proAds, grants)}</div>
              <div className="lp-plan__feats">
                {PLANS[lang].pro.map((f) => (
                  <div className="lp-plan__feat" key={f}><Check color="#F2C98A" /><span>{fillGrants(f, grants)}</span></div>
                ))}
              </div>
              <button className="lp-plan__cta lp-plan__cta--pro" onClick={() => startSignup('pro')}>
                {t.ctaPro}
              </button>
            </div>
          </div>

          {/* Bascule quotas (02/09) : l'encadré Pépites est MORT — la monnaie
              interne n'existe plus côté produit. Sa place dit la règle simple
              des forfaits. */}
          <div className="lp-coins lp-reveal">
            <span className="lp-coins__title"><b>{lang === 'en' ? 'Clear monthly volumes' : 'Des volumes mensuels clairs'}</b></span>
            <span className="lp-coins__sep" />
            <span>{lang === 'en'
              ? 'Every plan includes monthly action volumes — counters are visible in the app and reset each cycle.'
              : "Chaque forfait comprend des volumes de gestes par mois — les compteurs sont visibles dans l'app et repartent à chaque cycle."}</span>
          </div>
        </div>
      </section>

      {/* ══════════ FAQ ══════════ */}
      <section className="lp-section" id="faq">
        <div className="lp-faq">
          <div className="lp-faq__head lp-reveal">
            <div className="lp-kicker">FAQ</div>
            <h2 className="lp-h2" style={{ margin: 0 }}>{t.faqTitle}</h2>
          </div>

          <div className="lp-faq__list">
            {FAQ[lang].map(([q, a], i) => {
              const open = openFaq === i;
              return (
                <div className="lp-faq__item" key={q}>
                  <button className="lp-faq__q" aria-expanded={open} aria-controls={`lp-faq-${i}`}
                    onClick={() => setOpenFaq(open ? -1 : i)}>
                    <span>{q}</span>
                    <span className="lp-faq__plus" aria-hidden="true">+</span>
                  </button>
                  {open && <div className="lp-faq__a" id={`lp-faq-${i}`}>{fillGrants(a, grants)}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════ CTA FINAL ══════════ */}
      <section className="lp-final">
        <div className="lp-final__box lp-reveal">
          <h2 className="lp-final__title">{t.ctaTitle}</h2>
          <p className="lp-final__body">{t.ctaBody}</p>
          <button className="lp-final__cta" onClick={() => startSignup('free')}>
            {t.ctaBtn} <CtaArrow size={18} />
          </button>
        </div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="lp-footer">
        <div className="lp-footer__inner">
          <div className="lp-footer__brand">
            <img src="/logo.png" alt="FillSell" width="26" height="26" />
            <b>FillSell</b>
            <span className="lp-footer__copy">© 2026 · {t.footTag}</span>
          </div>

          <div className="lp-footer__links">
            {/* Maillage interne (2026-08-02) : la home ne faisait AUCUN lien
                vers /blog — le blog ne recevait aucun jus de la seule page qui
                ranke. Ancre descriptive, pas un « cliquez ici ». */}
            <a href="/blog">{t.footBlog}</a>
            <a href="/legal#mentions">{t.footLegal}</a>
            <a href="/legal#confidentialite">{t.footPrivacy}</a>
            <a href={`mailto:${CONTACT_EMAIL}`}>{t.footContact}</a>
          </div>

          <div className="lp-footer__social">
            <a href={TIKTOK_URL} target="_blank" rel="noopener noreferrer" aria-label="TikTok">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.5 3c.3 2.1 1.5 3.6 3.5 3.9v2.6c-1.3.1-2.5-.3-3.5-1v6.1c0 3.3-2.5 5.4-5.4 5.4A5.2 5.2 0 0 1 6 15.2c0-3 2.5-5 5.4-4.9v2.7c-.4-.1-.8-.2-1.2-.1-1.3.1-2.2 1.1-2.1 2.4 0 1.3 1.1 2.3 2.4 2.2 1.3 0 2.2-1 2.2-2.4V3h1.8Z" />
              </svg>
            </a>
            <a href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="X">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.9 2H22l-7.6 8.7L23 22h-6.8l-5.3-6.9L4.8 22H1.7l8.1-9.3L1 2h7l4.8 6.3L18.9 2Zm-1.2 18h1.7L7.4 3.8H5.6L17.7 20Z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
