import { useState, useEffect, useCallback } from 'react';
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
const TIKTOK_URL = 'https://www.tiktok.com/@fill.sell';
const X_URL = 'https://x.com/fillsellapp';

/* Photo du test de publication réel (t-shirt Patagonia), et non un mock. */
const HERO_PHOTO = '/pata1.jpg';

function getInitialLang() {
  const saved = localStorage.getItem('fs_lang');
  if (saved === 'fr' || saved === 'en') return saved;
  return (navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

const COPY = {
  fr: {
    navPublish: 'Publication', navVocal: 'Voix', navPricing: 'Tarifs',
    ctaStart: 'Commencer', login: 'Se connecter',
    heroKicker: 'Revente automatisée · France',
    heroLead: 'Un ajout,', heroAccent: 'publié partout.',
    heroSub: "Ajoute un article une seule fois — FillSell le publie automatiquement sur Vinted, Leboncoin, eBay et Beebs en quelques secondes. Vendu quelque part ? Il disparaît des autres, tout seul.",
    heroTrust: '30 Pépites offertes chaque mois · sans carte bancaire',
    storeApple: "Télécharger dans l'App Store", storePlay: 'Disponible sur Google Play',
    phS1: 'Ajout', phS2: 'Retouche IA', phS3: 'Publication',
    phItem: 'T-shirt Patagonia P-6', phAdded: 'Ajouté à ton stock', phPrice: '22 €',
    phCond: 'Bon état',
    phDesc: 'Patagonia P-6 Logo, coton bio, taille L, très bon état — porté quelques fois.',
    phRetouch: "Photo retouchée par l'IA", phSending: 'Envoi…',
    phDone: 'Publié sur 4 plateformes', phSent: 'Publications envoyées',

    pubKicker: 'Publication automatique', pubTitle: 'Un geste, publié partout.',
    pubBody: "Tu ajoutes un article, FillSell s'occupe du reste : il crée et publie l'annonce sur les 4 plateformes en même temps. Aucun copier-coller, aucune photo à re-téléverser.",
    pubOneItem: '1 seul ajout', pubAuto: 'Automatique', pubSold: 'Vendu sur',
    pubB1t: '4 plateformes, 1 ajout',
    pubB1b: 'Vinted, Leboncoin, eBay et Beebs reçoivent ton annonce en même temps, formatée pour chacune.',
    pubB2t: 'Suppression auto cross-plateforme',
    pubB2b: "Vendu sur une plateforme ? L'annonce est retirée des 3 autres instantanément. Zéro risque de double-vente.",
    pubB3t: 'Vente détectée, marges à jour',
    pubB3b: 'Un article vendu sur une plateforme ? FillSell le détecte et met à jour tes marges, ton stock et tes stats, automatiquement.',

    vocKicker: 'Gestion vocale', vocTitle: 'Gère ton stock à la voix.',
    vocBody: "Ajoute un article, marque-le vendu ou range-le — rien qu'à la voix. L'IA détecte la marque, la plateforme, la taille, l'état (« trou à la manche ») et même l'emplacement de rangement, puis remplit la fiche pour toi.",
    vocLink: 'Ton inventaire toujours à jour, sans saisie',
    vocQuote: '« Pull Zara, taille M, trou à la manche, bac 3 »',
    vocTagCat: 'Mode', vocTagSize: 'Taille', vocTagState: 'Trou manche', vocTagLoc: 'Bac 3',
    vocAdded: 'Ajouté à ton inventaire',

    lensKicker: 'FillSell Lens', lensTitle: "Photographie. L'IA chiffre.",
    lensBody: "Prends un objet en photo : Lens l'identifie, estime son prix de revente et note l'affaire sur 10. Tu sais en 2 secondes si ça vaut le coup.",
    lensScanning: 'Analyse en cours', lensIdentified: 'Article identifié',
    lensItem: 'Nike Air Max 90', lensScore: '8,4', lensPriceLabel: 'Prix de revente estimé',
    lensPrice: '≈ 68 €', lensVerdict: 'Bonne affaire', lensCost: '6 Pépites',
    lensStep1: "Tu prends l'objet en photo",
    lensStep2: "L'IA l'identifie et le chiffre",
    lensStep3: 'Tu obtiens prix + note du deal',

    photoKicker: 'Retouche photo IA', photoTitle: 'Des photos qui font vendre.',
    photoBody: "En un tap, l'IA détoure l'objet, nettoie l'arrière-plan et corrige la lumière. Tes annonces sortent du lot — sans studio ni appli tierce.",
    photoBefore: 'Ta photo', photoAfter: 'Retouchée', photoBadge: 'Retouché',

    featKicker: 'Tout le reste', featTitle: 'Tout pour gérer ta revente.',

    priceKicker: 'Tarifs', priceTitle: 'Un plan pour chaque volume.',
    priceSub: 'Commence gratuitement. Passe Premium ou Pro quand tu veux vendre plus, sans engagement.',
    perMonth: '/ mois', freeTag: 'Pour se lancer', priceFree: '0 €', freeCoins: '30 Pépites / mois',
    popular: 'Le plus populaire', priceP: '12,99 €', pCoins: '150 Pépites / mois',
    pricePro: '29,99 €', proCoins: '600 Pépites / mois — 4× plus',
    ctaFree: 'Commencer gratuitement', ctaPremium: 'Passer Premium', ctaPro: 'Passer Pro',
    coinsTitle: 'Les Pépites, ta monnaie', coinsPublish: 'Publier : 3 à 35 Pépites',
    coinsLens: 'Analyse Lens : 6 Pépites', coinsPacks: 'Packs dès 4,99 €',

    faqTitle: "Les questions qu'on nous pose.",
    ctaTitle: 'Prêt à publier partout, sans effort ?',
    ctaBody: 'Commence gratuitement — 30 Pépites offertes chaque mois, sans carte bancaire.',
    ctaBtn: 'Commencer gratuitement',
    footTag: 'Revente automatisée', footLegal: 'Mentions légales',
    footPrivacy: 'Confidentialité', footContact: 'Contact',
  },
  en: {
    navPublish: 'Publishing', navVocal: 'Voice', navPricing: 'Pricing',
    ctaStart: 'Get started', login: 'Log in',
    heroKicker: 'Automated reselling · France',
    heroLead: 'One add,', heroAccent: 'listed everywhere.',
    heroSub: 'Add an item once — FillSell automatically lists it on Vinted, Leboncoin, eBay and Beebs in seconds. Sold somewhere? It vanishes from the others, all on its own.',
    heroTrust: '30 Pépites free every month · no card required',
    storeApple: 'Download on the App Store', storePlay: 'Get it on Google Play',
    phS1: 'Add', phS2: 'AI edit', phS3: 'Publishing',
    phItem: 'Patagonia P-6 T-shirt', phAdded: 'Added to your stock', phPrice: '€22',
    phCond: 'Good cond.',
    phDesc: 'Patagonia P-6 Logo, organic cotton, size L, great condition — worn a few times.',
    phRetouch: 'Photo retouched by AI', phSending: 'Sending…',
    phDone: 'Listed on 4 marketplaces', phSent: 'Listings sent',

    pubKicker: 'Automatic publishing', pubTitle: 'One move, live everywhere.',
    pubBody: 'You add an item, FillSell does the rest: it builds and posts the listing on all 4 marketplaces at once. No copy-paste, no re-uploading photos.',
    pubOneItem: '1 single add', pubAuto: 'Automatic', pubSold: 'Sold on',
    pubB1t: '4 marketplaces, 1 add',
    pubB1b: 'Vinted, Leboncoin, eBay and Beebs get your listing at the same time, formatted for each one.',
    pubB2t: 'Cross-platform auto-removal',
    pubB2b: 'Sold on one marketplace? The listing is pulled from the other 3 instantly. Zero double-sale risk.',
    pubB3t: 'Sale detected, margins updated',
    pubB3b: 'An item sells on a marketplace? FillSell detects it and updates your margins, stock and stats, automatically.',

    vocKicker: 'Voice management', vocTitle: 'Manage your stock by voice.',
    vocBody: 'Add an item, mark it sold or file it away — just by voice. The AI catches the brand, marketplace, size, condition (“hole in the sleeve”) and even the storage spot, then fills the listing for you.',
    vocLink: 'Your inventory always up to date, no typing',
    vocQuote: '“Zara jumper, size M, hole in the sleeve, bin 3”',
    vocTagCat: 'Fashion', vocTagSize: 'Size', vocTagState: 'Sleeve hole', vocTagLoc: 'Bin 3',
    vocAdded: 'Added to your inventory',

    lensKicker: 'FillSell Lens', lensTitle: 'Snap it. The AI prices it.',
    lensBody: "Photograph any object: Lens identifies it, estimates its resale price and rates the deal out of 10. You know in 2 seconds if it's worth it.",
    lensScanning: 'Analyzing', lensIdentified: 'Item identified',
    lensItem: 'Nike Air Max 90', lensScore: '8.4', lensPriceLabel: 'Estimated resale price',
    lensPrice: '≈ €68', lensVerdict: 'Good deal', lensCost: '6 Pépites',
    lensStep1: 'You snap the object',
    lensStep2: 'The AI identifies & prices it',
    lensStep3: 'You get price + deal score',

    photoKicker: 'AI photo touch-up', photoTitle: 'Photos that sell.',
    photoBody: 'In one tap, the AI cuts out the object, cleans the background and fixes the lighting. Your listings stand out — no studio, no third-party app.',
    photoBefore: 'Your photo', photoAfter: 'Touched up', photoBadge: 'Enhanced',

    featKicker: 'Everything else', featTitle: 'Everything to run your reselling.',

    priceKicker: 'Pricing', priceTitle: 'A plan for every volume.',
    priceSub: 'Start free. Move to Premium or Pro whenever you want to sell more — no commitment.',
    perMonth: '/ mo', freeTag: 'To get started', priceFree: '€0', freeCoins: '30 Pépites / mo',
    popular: 'Most popular', priceP: '€12.99', pCoins: '150 Pépites / mo',
    pricePro: '€29.99', proCoins: '600 Pépites / mo — 4× more',
    ctaFree: 'Start free', ctaPremium: 'Go Premium', ctaPro: 'Go Pro',
    coinsTitle: 'Pépites, your currency', coinsPublish: 'Publish: 3 to 35 Pépites',
    coinsLens: 'Lens analysis: 6 Pépites', coinsPacks: 'Packs from €4.99',

    faqTitle: 'The questions we get asked.',
    ctaTitle: 'Ready to list everywhere, effortlessly?',
    ctaBody: 'Start free — 30 Pépites every month, no credit card required.',
    ctaBtn: 'Start free',
    footTag: 'Automated reselling', footLegal: 'Legal notice',
    footPrivacy: 'Privacy', footContact: 'Contact',
  },
};

const FEATURES = {
  fr: [
    { emoji: '💬', t: 'Gestion vocale du stock', b: 'Ajoute, vends ou range un article à la voix — marque, taille, état et emplacement détectés.' },
    { emoji: '📊', t: 'Stats avancées', b: 'Profit net, marge moyenne, meilleures ventes et évolution mois par mois.' },
    { emoji: '📦', t: 'Stock illimité', b: "Gère tout ton inventaire sans limite, avec catégorisation automatique par l'IA." },
    { emoji: '🔄', t: 'Sync cross-plateforme', b: 'Tes 4 places de marché restent alignées en permanence, sans intervention.' },
    { emoji: '📋', t: 'Historique complet', b: 'Chaque achat et chaque vente conservés, filtrables par marque et catégorie.' },
    { emoji: '📁', t: 'Import / export Excel', b: 'Fais entrer et sortir ton stock en un fichier, sans ressaisie.' },
    { emoji: '🧮', t: 'Calcul de marge', b: "Achat, frais, prix de vente → ton bénéfice net et ta marge %, avant même d'acheter." },
    { emoji: '🗂️', t: 'Emplacements de rangement', b: "Chaque article rangé à sa place — retrouve n'importe quel produit en un mot." },
  ],
  en: [
    { emoji: '💬', t: 'Voice stock management', b: 'Add, sell or file an item by voice — brand, size, condition and location detected.' },
    { emoji: '📊', t: 'Advanced stats', b: 'Net profit, average margin, best sales and month-by-month trends.' },
    { emoji: '📦', t: 'Unlimited stock', b: 'Manage your whole inventory with no limit and automatic AI categories.' },
    { emoji: '🔄', t: 'Cross-platform sync', b: 'Your 4 marketplaces stay aligned at all times, hands-free.' },
    { emoji: '📋', t: 'Full history', b: 'Every buy and sale kept, filterable by brand and category.' },
    { emoji: '📁', t: 'Excel import / export', b: 'Move your stock in and out with one file — no re-typing.' },
    { emoji: '🧮', t: 'Margin calculator', b: 'Cost, fees, sale price → your net profit and margin %, before you even buy.' },
    { emoji: '🗂️', t: 'Storage locations', b: 'Every item filed in its spot — find any product with a single word.' },
  ],
};

/* La publication auto sur les 4 plateformes est le moteur commun aux 3 paliers :
   le libellé est donc volontairement identique sur les 3 cartes. Ce qui distingue
   les paliers, c'est le volume de Pépites (30 / 150 / 600), pas la fonctionnalité. */
const PUBLISH_LINE = {
  fr: 'Publication auto sur Vinted, Leboncoin, eBay & Beebs',
  en: 'Auto-publishing to Vinted, Leboncoin, eBay & Beebs',
};

const PLANS = {
  fr: {
    free: ["Ajout d'article à la voix", PUBLISH_LINE.fr, 'Calcul de marge instantané', 'Suivi de tes ventes'],
    premium: ['Stock illimité', 'Stats avancées & historique complet', PUBLISH_LINE.fr, 'Import / export Excel', 'Commandes vocales illimitées'],
    pro: ['Tout le Premium, inclus', PUBLISH_LINE.fr, 'Bien plus de marge pour tes analyses Lens', 'Import / export Excel avancé', 'Support prioritaire'],
  },
  en: {
    free: ['Voice item adding', PUBLISH_LINE.en, 'Instant margin calculator', 'Track your sales'],
    premium: ['Unlimited stock', 'Advanced stats & full history', PUBLISH_LINE.en, 'Excel import / export', 'Unlimited voice commands'],
    pro: ['Everything in Premium', PUBLISH_LINE.en, 'Far more room for your Lens analyses', 'Advanced Excel import / export', 'Priority support'],
  },
};

const FAQ = {
  fr: [
    ['C’est quoi les Pépites ?', 'Les Pépites sont la monnaie de FillSell. Tu en reçois chaque mois selon ton offre (30 en Free, 150 en Premium, 600 en Pro) et tu les dépenses pour publier une annonce (3 à 35 Pépites selon le type) ou lancer une analyse Lens (6 Pépites). Besoin de plus ? Des packs sont dispo dès 4,99 €.'],
    ['Sur quelles plateformes je publie ?', 'Vinted, Leboncoin, eBay et Beebs — les 4 places de marché qui comptent en France. Un seul ajout, publié sur les quatre en même temps.'],
    ['Comment marche la publication automatique ?', 'Tu ajoutes un article à ton inventaire, puis FillSell génère l’annonce et la publie sur les 4 plateformes en même temps. Rien à recopier ni à re-téléverser.'],
    ['Et si un article se vend ?', 'FillSell détecte la vente, retire l’annonce des 3 autres plateformes et met à jour tes marges, ton stock et tes stats — automatiquement. Zéro risque de double-vente.'],
    ['Lens, c’est illimité ?', 'Non — chaque analyse Lens coûte 6 Pépites, quel que soit ton palier. Le Pro reçoit simplement bien plus de Pépites (600/mois) pour en faire davantage.'],
    ['Je peux annuler quand je veux ?', 'Oui. Premium et Pro sont sans engagement : tu changes d’offre ou tu arrêtes en un clic depuis l’app.'],
  ],
  en: [
    ['What are Pépites?', 'Pépites are FillSell’s currency. You get some every month based on your plan (30 on Free, 150 on Premium, 600 on Pro) and spend them to publish a listing (3 to 35 Pépites depending on type) or run a Lens analysis (6 Pépites). Need more? Packs start at €4.99.'],
    ['Which marketplaces can I publish to?', 'Vinted, Leboncoin, eBay and Beebs — the 4 marketplaces that matter in France. One add, posted to all four at once.'],
    ['How does automatic publishing work?', 'You add an item to your inventory, then FillSell builds the listing and posts it to all 4 marketplaces at once. Nothing to copy or re-upload.'],
    ['What happens when an item sells?', 'FillSell detects the sale, pulls the listing from the other 3 marketplaces and updates your margins, stock and stats — automatically. Zero double-sale risk.'],
    ['Is Lens unlimited?', 'No — each Lens analysis costs 6 Pépites, on every tier. Pro simply gets far more Pépites (600/mo) so you can run more of them.'],
    ['Can I cancel anytime?', 'Yes. Premium and Pro have no commitment — switch plans or stop in one tap from the app.'],
  ],
};

/* ── Fragments SVG réutilisés ───────────────────────────────── */
const Pepite = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={{ flexShrink: 0 }} aria-hidden="true">
    <path d="M32 4 L48 16 L54 30 L44 56 L32 60 L20 56 L10 30 L16 16 Z" fill="url(#lpPep)" />
    <path d="M32 4 L48 16 L32 24 L16 16 Z" fill="#fff" opacity="0.35" />
  </svg>
);

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

export default function LandingPage() {
  const nav = useNavigate();
  const [lang, setLang] = useState(getInitialLang);
  const [openFaq, setOpenFaq] = useState(0);

  const t = COPY[lang];
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => { track('page_view', { page: 'landing' }); }, []);
  useEffect(() => { localStorage.setItem('fs_lang', lang); }, [lang]);

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

  const scrollTo = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

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
      {/* Dégradés partagés par les icônes SVG de la page */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="lpPep" x1="10" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F0B860" />
            <stop offset="45%" stopColor="#E8956D" />
            <stop offset="100%" stopColor="#2F9E90" />
          </linearGradient>
          <linearGradient id="lpGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FBE9A6" />
            <stop offset="0.5" stopColor="#E7B84C" />
            <stop offset="1" stopColor="#C79433" />
          </linearGradient>
        </defs>
      </svg>

      {/* ══════════ NAV ══════════ */}
      <header className="lp-nav">
        <div className="lp-nav__inner">
          <BrandMark onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />

          <nav className="lp-nav__links">
            <button className="lp-nav__link" onClick={() => scrollTo('publication')}>{t.navPublish}</button>
            <button className="lp-nav__link" onClick={() => scrollTo('vocal')}>{t.navVocal}</button>
            <button className="lp-nav__link" onClick={() => scrollTo('lens')}>Lens</button>
            <button className="lp-nav__link" onClick={() => scrollTo('tarifs')}>{t.navPricing}</button>
            <button className="lp-nav__link" onClick={() => scrollTo('faq')}>FAQ</button>
          </nav>

          <div className="lp-nav__actions">
            <div className="lp-lang" role="group" aria-label="Langue / Language">
              {['fr', 'en'].map((code) => (
                <button key={code} className={lang === code ? 'on' : ''}
                  aria-pressed={lang === code} onClick={() => changeLang(code)}>
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            <button className="lp-btn lp-btn--ghost" onClick={() => nav('/login')}>{t.login}</button>
            <button className="lp-btn lp-btn--nav" onClick={() => startSignup('free')}>{t.ctaStart}</button>
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
                {t.ctaStart} <span style={{ fontSize: 17 }}>→</span>
              </button>
            </div>

            {!isNative && (
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

            <div className="lp-hero__trust">
              <Pepite />
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

      {/* ══════════ PUBLICATION AUTO ══════════ */}
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

          <div className="lp-cards">
            <div className="lp-card lp-reveal">
              <div className="lp-card__icon lp-card__icon--teal">
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-5" />
                </svg>
              </div>
              <div className="lp-card__title">{t.pubB1t}</div>
              <div className="lp-card__body">{t.pubB1b}</div>
            </div>

            <div className="lp-card lp-reveal">
              <div className="lp-card__icon lp-card__icon--peach">
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.2-8.5" /><path d="M22 4 12 14.01l-3-3" />
                </svg>
              </div>
              <div className="lp-card__title">{t.pubB2t}</div>
              <div className="lp-card__body">{t.pubB2b}</div>
              <div className="lp-card__sold">
                <span className="lp-card__sold-on">
                  {t.pubSold}
                  <PlatformLogo platform="vinted" size={16} />
                  Vinted
                </span>
                <span className="lp-card__sold-arr">→</span>
                {/* Les 3 autres, retirées : logos réels, désaturés et barrés. */}
                <span className="lp-card__sold-off">
                  {PLATFORMS.filter((p) => p.key !== 'vinted').map((p) => (
                    <PlatformLogo key={p.key} platform={p.key} size={16} />
                  ))}
                </span>
              </div>
            </div>

            <div className="lp-card lp-reveal">
              <div className="lp-card__icon lp-card__icon--deep">
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#fff"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" />
                </svg>
              </div>
              <div className="lp-card__title">{t.pubB3t}</div>
              <div className="lp-card__body">{t.pubB3b}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ VOCAL ══════════ */}
      <section className="lp-section" id="vocal">
        <div className="lp-shell lp-split">
          <div className="lp-split__copy lp-reveal">
            <div className="lp-kicker">{t.vocKicker}</div>
            <h2 className="lp-h2">{t.vocTitle}</h2>
            <p className="lp-lead">{t.vocBody}</p>
            <div className="lp-voc__link">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B6E62"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" />
              </svg>
              {t.vocLink}
            </div>
          </div>

          <div className="lp-split__media lp-reveal">
            <div className="lp-panel">
              <div className="lp-voc__head">
                <div className="lp-voc__mic">
                  <i />
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff"
                    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                </div>
                <div className="lp-voc__wave">
                  {[0, 0.15, 0.3, 0.45, 0.6, 0.75].map((d, i) => (
                    <span key={i} style={{ animationDelay: `${d}s`, background: i === 3 ? '#E8956D' : undefined }} />
                  ))}
                </div>
              </div>

              <div className="lp-voc__quote">{t.vocQuote}</div>

              <div className="lp-tags lp-voc__tags">
                <span className="lp-tag lp-tag--cat">👗 {t.vocTagCat}</span>
                <span className="lp-tag lp-tag--brand">Zara</span>
                <span className="lp-tag">{t.vocTagSize} M</span>
                <span className="lp-tag lp-tag--warn">⚠ {t.vocTagState}</span>
                <span className="lp-tag lp-tag--loc">📍 {t.vocTagLoc}</span>
              </div>

              <div className="lp-voc__added"><Check color="#1B6E62" size={15} />{t.vocAdded}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ LENS ══════════ */}
      <section className="lp-section lp-section--tint" id="lens">
        <div className="lp-shell lp-split lp-split--rev">
          <div className="lp-split__media lp-reveal">
            <div className="lp-lens">
              <div className="lp-lens__body">
                <div className="lp-lens__screen">
                  <div className="lp-lens__view">
                    <span style={{ fontSize: 120, filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.5))' }}>👟</span>
                  </div>

                  <div className="lp-lens__frame" aria-hidden="true">
                    <i className="tl" /><i className="tr" /><i className="bl" /><i className="br" />
                    <span className="lp-lens__beam" />
                  </div>

                  <div className="lp-lens__scanning"><span>{t.lensScanning}</span></div>

                  <div className="lp-lens__sheet">
                    <div className="lp-lens__grab" />
                    <div className="lp-lens__row">
                      <div>
                        <div className="lp-lens__eyebrow">{t.lensIdentified}</div>
                        <div className="lp-lens__item">{t.lensItem}</div>
                      </div>
                      <div className="lp-lens__score"><b>{t.lensScore}</b><span>/10</span></div>
                    </div>
                    <div className="lp-lens__price">
                      <div className="lp-lens__eyebrow">{t.lensPriceLabel}</div>
                      <b>{t.lensPrice}</b>
                      <div className="lp-lens__gauge"><i /></div>
                    </div>
                    <div className="lp-lens__foot">
                      <span className="lp-lens__verdict">
                        <Check color="#1B6E62" size={14} />{t.lensVerdict} ·
                        <PlatformLogo platform="vinted" size={14} />Vinted
                      </span>
                      <span className="lp-lens__cost"><Pepite size={12} />{t.lensCost}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lp-split__copy lp-reveal">
            <div className="lp-kicker lp-kicker--icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F9E90" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="14.31" y1="8" x2="20.05" y2="17.94" />
                <line x1="9.69" y1="8" x2="21.17" y2="8" />
                <line x1="7.38" y1="12" x2="13.12" y2="2.06" />
                <line x1="9.69" y1="16" x2="3.95" y2="6.06" />
                <line x1="14.31" y1="16" x2="2.83" y2="16" />
                <line x1="16.62" y1="12" x2="10.88" y2="21.94" />
              </svg>
              <span>{t.lensKicker}</span>
            </div>
            <h2 className="lp-h2">{t.lensTitle}</h2>
            <p className="lp-lead">{t.lensBody}</p>

            <div className="lp-lens__steps">
              <div className="lp-lens__step">
                <i>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B6E62"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </i>
                <span>{t.lensStep1}</span>
              </div>
              <div className="lp-lens__step">
                <i>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B6E62"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v3" /><path d="M12 18v3" /><path d="M5 12H2" /><path d="M22 12h-3" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                </i>
                <span>{t.lensStep2}</span>
              </div>
              <div className="lp-lens__step">
                <i className="peach">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C2410C"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </i>
                <span>{t.lensStep3}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ RETOUCHE PHOTO IA ══════════ */}
      <section className="lp-section lp-section--rule" id="photo">
        <div className="lp-shell lp-split">
          <div className="lp-split__copy lp-reveal">
            <div className="lp-kicker lp-kicker--icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F9E90"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 21 9-9" />
                <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M12.2 6.2 11 5" />
                <path d="M15 9h.01" />
              </svg>
              <span>{t.photoKicker}</span>
            </div>
            <h2 className="lp-h2">{t.photoTitle}</h2>
            <p className="lp-lead">{t.photoBody}</p>
          </div>

          <div className="lp-split__media lp-reveal">
            <div className="lp-panel">
              <div className="lp-photo">
                <div className="lp-photo__col">
                  <div className="lp-photo__shot lp-photo__shot--raw">
                    <img src={HERO_PHOTO} alt="" loading="lazy" />
                  </div>
                  <span className="lp-photo__caption">{t.photoBefore}</span>
                </div>

                <div className="lp-photo__arrow">
                  <Arrow w={34} h={20} />
                  <span>IA</span>
                </div>

                <div className="lp-photo__col">
                  <div className="lp-photo__shot lp-photo__shot--clean">
                    <img src={HERO_PHOTO} alt="" loading="lazy" />
                    <span className="lp-photo__badge">✨ {t.photoBadge}</span>
                  </div>
                  <span className="lp-photo__caption lp-photo__caption--after">{t.photoAfter}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ FEATURES ══════════ */}
      <section className="lp-section">
        <div className="lp-shell">
          <div className="lp-head lp-head--narrow lp-reveal">
            <div className="lp-kicker">{t.featKicker}</div>
            <h2 className="lp-h2" style={{ margin: 0 }}>{t.featTitle}</h2>
          </div>

          <div className="lp-feats">
            {FEATURES[lang].map((f) => (
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
              <div className="lp-plan__coins"><Pepite size={13} />{t.freeCoins}</div>
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
                <svg width="14" height="14" viewBox="0 0 24 24" style={{ position: 'relative' }}>
                  <path d="M12 2l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.8 6.1 20.9l1.2-6.6L2.5 9.9l6.6-.9z" fill="url(#lpGold)" />
                </svg>
                <span className="lp-plan__chip-label">Premium</span>
              </div>
              <div className="lp-plan__price"><b>{t.priceP}</b><span>{t.perMonth}</span></div>
              <div className="lp-plan__coins"><Pepite size={13} />{t.pCoins}</div>
              <div className="lp-plan__feats">
                {PLANS[lang].premium.map((f) => (
                  <div className="lp-plan__feat" key={f}><Check /><span>{f}</span></div>
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
                <svg width="15" height="15" viewBox="0 0 24 24" style={{ position: 'relative' }}>
                  <path d="M3 8l4.5 3L12 4l4.5 7L21 8l-1.8 10.5H4.8L3 8z" fill="url(#lpGold)" strokeLinejoin="round" />
                </svg>
                <span className="lp-plan__chip-label lp-plan__chip-label--gold">Pro</span>
              </div>
              <div className="lp-plan__price"><b>{t.pricePro}</b><span>{t.perMonth}</span></div>
              <div className="lp-plan__coins"><Pepite size={13} />{t.proCoins}</div>
              <div className="lp-plan__feats">
                {PLANS[lang].pro.map((f) => (
                  <div className="lp-plan__feat" key={f}><Check color="#F2C98A" /><span>{f}</span></div>
                ))}
              </div>
              <button className="lp-plan__cta lp-plan__cta--pro" onClick={() => startSignup('pro')}>
                {t.ctaPro}
              </button>
            </div>
          </div>

          <div className="lp-coins lp-reveal">
            <span className="lp-coins__title"><Pepite /><b>{t.coinsTitle}</b></span>
            <span className="lp-coins__sep" />
            <span>{t.coinsPublish}</span>
            <span className="lp-coins__sep" />
            <span>{t.coinsLens}</span>
            <span className="lp-coins__sep" />
            <span>{t.coinsPacks}</span>
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
                  {open && <div className="lp-faq__a" id={`lp-faq-${i}`}>{a}</div>}
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
            {t.ctaBtn} <span style={{ fontSize: 18 }}>→</span>
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
