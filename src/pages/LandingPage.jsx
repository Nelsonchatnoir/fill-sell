import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { track } from '../analytics/analytics';

function getBrowserLang() {
  const saved = localStorage.getItem('fs_lang');
  if (saved) return saved;
  const bl = (navigator.language || 'fr').toLowerCase().split('-')[0];
  return bl === 'fr' ? 'fr' : 'en';
}

const PLATFORMS = [
  { name: 'Vinted' }, { name: 'eBay' }, { name: 'Depop' }, { name: 'Leboncoin' },
  { name: 'Beebeep' }, { name: 'Facebook Marketplace' }, { name: 'Poshmark' },
  { name: 'Mercari' }, { name: 'Wallapop' }, { name: 'Vestiaire Collective' },
  { name: 'GOAT' }, { name: 'StockX' },
];

const FAQ_ITEMS = {
  fr: [
    { q: 'Fill & Sell est-il gratuit ?', a: "Oui, Fill & Sell est entièrement gratuit jusqu'à 20 articles en stock. Tu as accès au dashboard, au calculateur de marge et à l'historique de tes ventes — sans carte bancaire requise. Pour aller plus loin (articles illimités, export Excel, stats avancées), passe au Premium à 4,99 €/mois." },
    { q: 'Quelles plateformes sont compatibles ?', a: 'Toutes les grandes plateformes de revente : Vinted, eBay, Depop, Leboncoin, Beebeep, Facebook Marketplace, Poshmark, Mercari, Wallapop, Vestiaire Collective, GOAT, StockX. Tu peux étiqueter tes ventes par plateforme pour suivre tes meilleurs canaux.' },
    { q: 'Comment calculer ma marge sur Vinted ?', a: "Avec le calculateur intégré, tu entres simplement le prix d'achat, le prix de vente et les frais (commission Vinted, livraison, emballage). Fill & Sell calcule ton bénéfice net et ton pourcentage de marge en temps réel — avant même que tu valides ton achat." },
    { q: 'Puis-je importer et exporter mes données en Excel ?', a: 'Oui, avec un compte Premium tu peux importer ton stock existant depuis un fichier Excel ou CSV, et exporter toutes tes données quand tu veux. Tu gardes le contrôle total sur tes informations — elles sont à toi.' },
    { q: 'Fill & Sell fonctionne-t-il sur mobile ?', a: "Bien sûr — Fill & Sell est conçu mobile-first. L'app marche dans ton navigateur sur iPhone et Android, et une version iOS native est disponible sur l'App Store. Tes données se synchronisent entre tous tes appareils." },
  ],
  en: [
    { q: 'Is Fill & Sell free?', a: 'Yes, Fill & Sell is completely free for up to 20 items in stock. You get access to the dashboard, margin calculator and sales history — no credit card required. To go further (unlimited items, Excel export, advanced stats), upgrade to Premium at €4.99/month.' },
    { q: 'Which platforms are compatible?', a: 'All major resale platforms: Vinted, eBay, Depop, Leboncoin, Beebeep, Facebook Marketplace, Poshmark, Mercari, Wallapop, Vestiaire Collective, GOAT, StockX. You can tag your sales by platform to track your best channels.' },
    { q: 'How do I calculate my margin on Vinted?', a: 'With the built-in calculator, you simply enter the buy price, sell price and fees (Vinted commission, shipping, packaging). Fill & Sell calculates your net profit and margin percentage in real time — before you even confirm your purchase.' },
    { q: 'Can I import and export my data to Excel?', a: "Yes, with a Premium account you can import your existing stock from an Excel or CSV file, and export all your data whenever you want. You keep full control over your information — it's yours." },
    { q: 'Does Fill & Sell work on mobile?', a: 'Of course — Fill & Sell is built mobile-first. The app works in your browser on iPhone and Android, and a native iOS version is available on the App Store. Your data syncs across all your devices.' },
  ],
};

const T = {
  fr: {
    navFeatures: 'Fonctionnalités', navPricing: 'Tarifs', navFaq: 'FAQ',
    navLogin: 'Se connecter', navCta: 'Commencer gratuitement',
    heroBadge: '🚀 Déjà utilisé par des centaines de revendeurs',
    heroTitle1: 'Suis tes ', heroTitleAccent: 'profits de revente', heroTitle2: ' automatiquement 💰',
    heroSub: "Arrête de deviner tes marges. Sache exactement combien tu gagnes — article par article.",
    heroCta: 'Créer mon compte gratuit →', heroSecondary: 'Voir comment ça marche',
    heroFree: 'Gratuit', heroNoCard: 'Sans carte bancaire', heroReady: 'Prêt en 30 secondes',
    appMonthTitle: "Ton mois en un coup d'œil",
    appProfitLbl: 'Profit net', appSalesLbl: 'Ventes', appMarginLbl: 'Marge moy.', appStockLbl: 'En stock',
    appThisMonth: 'ce mois', appChartTitle: 'Profit · 6 mois',
    appMonths: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun'],
    appLatestSales: 'Dernières ventes', appSeeAll: 'Voir tout →',
    appSale1Date: "Aujourd'hui · Vinted", appSale2Date: 'Hier · eBay',
    appNavDash: 'Tableau', appNavStock: 'Stock', appNavCalc: 'Calculer', appNavHist: 'Historique',
    stat1Label: 'Revendeurs actifs', stat2Label: 'Profits trackés',
    stat3Label: 'Satisfaction', stat4Label: 'Pour démarrer',
    featEyebrow: 'Fonctionnalités',
    featTitle1: "Tout ce qu'il te faut pour ", featTitleAccent: 'vendre plus malin',
    featSub: "Un outil simple, conçu par des revendeurs pour des revendeurs. Ajoute, calcule, vends — Fill & Sell s'occupe du reste.",
    f1Title: 'Suivi automatique',
    f1Desc: 'Ajoute tes articles en quelques secondes. Fill & Sell calcule tes marges automatiquement.',
    f1Header: '📦 Mon stock · 14 articles', f1Add: '+ Ajouter', f1BuyLabel: 'Achat → Vente',
    f1CatFashion: '👗 Mode', f1CatTech: '📱 High-Tech', f1CatLuxe: '💎 Luxe',
    f2Title: 'Dashboard clair',
    f2Desc: "Visualise tes profits, ventes et stocks en un coup d'œil. Plus besoin d'Excel ni de calculatrice.",
    f2Evolution: 'Évolution', f2VsMois: 'vs mois -1', f2SalesCount: '23 ventes', f2Period: '6 mois',
    f3Title: 'Calculateur de marge',
    f3Desc: "Calcul de bénéfice instantané avant d'acheter. Ne fais plus jamais de mauvaise affaire.",
    f3BuyPrice: "Prix d'achat", f3SellPrice: 'Prix de vente', f3Fees: 'Frais annexes', f3Verdict: 'Belle marge 💪',
    f4Title: 'Historique complet',
    f4Desc: 'Retrouve toutes tes ventes, triées par date et par profit. Filtres par catégorie, par marque, par plateforme.',
    f4Header: '📋 Historique · 23 ventes',
    f4Items: [
      { name: 'Nike Air Max 90', date: '28 avr. 2026 · Vinted', amt: '+47,00 €', red: false },
      { name: 'Sac Longchamp Pliage', date: '27 avr. 2026 · eBay', amt: '+31,50 €', red: false },
      { name: 'Polo Ralph Lauren M', date: '25 avr. 2026 · Depop', amt: '+18,20 €', red: false },
      { name: 'Casquette New Era', date: '23 avr. 2026 · Vinted', amt: '−2,40 €', red: true },
      { name: 'Robe Maje neuve', date: '22 avr. 2026 · Vestiaire', amt: '+89,00 €', red: false },
    ],
    f5Title: 'Import & Export Excel',
    f5Desc: "Importe ton stock et exporte tes données en un tap. Compatible avec Excel, Numbers et Google Sheets.",
    f5TabStock: '📊 Stock', f5TabSales: '📋 Ventes', f5TabStats: '📈 Stats',
    f5ColItem: 'Article', f5ColBuy: 'Achat', f5ColSell: 'Vente', f5ColMargin: 'Marge',
    f6Title: 'Stats avancées',
    f6Desc: 'Analyse tes meilleures ventes, ta marge moyenne et tes tendances. Trouve ce qui marche le mieux.',
    f6Top3: '🏆 Top 3 du mois',
    f6Items: [
      { name: 'Sac Hermès Kelly', date: '22 avr. · Vestiaire', prefix: 'Vendu' },
      { name: 'iPhone 12 Pro 128Go', date: '19 avr. · eBay', prefix: 'Vendu' },
      { name: 'Robe Maje neuve', date: '22 avr. · Vestiaire', prefix: 'Vendu' },
    ],
    f6BestCat: 'Meilleure catégorie', f6BestCatVal: '💎 Luxe · 64% de marge',
    showcaseEyebrow: 'Aperçu',
    showcaseTitle1: 'Visualise tes profits ', showcaseTitleAccent: "en un coup d'œil",
    showcaseSub: "Une interface pensée pour le mobile. Toutes tes données importantes, là où tu en as besoin.",
    ph1CalcTitle: '🧮 Calcule ta marge', ph1CalcSub: 'Entre les prix ci-dessous',
    ph1BuyPrice: "Prix d'achat", ph1SellPrice: 'Prix de vente', ph1Fees: 'Frais annexes', ph1Verdict: 'Belle marge 💪',
    ph2Stock: '📦 Mon stock', ph2Search: 'Rechercher un article…',
    ph2All: 'Tout · 14', ph2Fashion: '👗 Mode · 6', ph2Tech: '📱 Tech · 3', ph2Luxe: '💎 Luxe · 2',
    ph2Buy: 'Achat', ph2Sold: 'Vendu', ph2CatFashion: '👗 Mode', ph2CatTech: '📱 Tech', ph2CatLuxe: '💎 Luxe',
    platformsTitle: 'Compatible avec toutes tes plateformes', platformsSub: 'Suis tes ventes, peu importe où tu vends.',
    pricingEyebrow: 'Tarifs',
    pricingTitle1: 'Choisis le plan qui te ', pricingTitleAccent: 'correspond',
    pricingSub: "Commence gratuitement. Passe au premium quand tu es prêt — pas de surprise, pas d'engagement.",
    freeTier: 'Gratuit', freeName: 'Pour démarrer', freePer: '/ toujours',
    freeTagline: 'Tout le nécessaire pour suivre tes premières ventes.',
    freeF1: "Jusqu'à 20 articles", freeF2: 'Dashboard & stats de base',
    freeF3: 'Calculateur de marge', freeF4: 'Historique des ventes', freeBtn: 'Commencer gratuitement',
    premiumBadge: '⭐ Le plus populaire', premiumTier: 'Premium', premiumName: 'Pour aller plus loin',
    premiumPer: '/ mois', premiumTagline: 'Débloque toutes les fonctionnalités. Sans limite.',
    premiumF1: 'Articles illimités', premiumF2: 'Stats avancées & tendances',
    premiumF3: 'Export Excel & CSV', premiumF4: 'Import Excel en masse', premiumF5: 'Support prioritaire',
    premiumBtn: 'Passer au premium ✨',
    ctaTitle: 'Prêt à maximiser tes profits ?',
    ctaSub: 'Rejoins des centaines de revendeurs qui suivent leurs profits avec Fill & Sell.',
    ctaBtn: 'Créer mon compte gratuit →', ctaMicro: 'Gratuit · Sans carte bancaire · Prêt en 30 secondes',
    faqEyebrow: 'FAQ', faqTitle: 'Tu as des questions ?',
    faqSub: 'Voici les réponses aux questions les plus fréquentes. Tu peux aussi nous écrire à support@fillsell.app',
    footerTagline: 'Suis tes profits de revente, automatiquement. Pour les revendeurs Vinted, eBay, Depop et plus.',
    footerProduct: 'Produit', footerLegal: 'Légal', footerMentions: 'Mentions légales',
    footerPrivacy: 'Confidentialité', footerCgu: 'CGU', footerContact: 'Contact',
    footerCopy: '© 2026 Fill & Sell. Tous droits réservés. Fait avec 💛 pour les revendeurs.',
  },
  en: {
    navFeatures: 'Features', navPricing: 'Pricing', navFaq: 'FAQ',
    navLogin: 'Log in', navCta: 'Start for free',
    heroBadge: '🚀 Already used by hundreds of resellers',
    heroTitle1: 'Track your ', heroTitleAccent: 'resale profits', heroTitle2: ' automatically 💰',
    heroSub: "Stop guessing your margins. Know exactly how much you earn — item by item.",
    heroCta: 'Create my free account →', heroSecondary: 'See how it works',
    heroFree: 'Free', heroNoCard: 'No credit card', heroReady: 'Ready in 30 seconds',
    appMonthTitle: 'Your month at a glance',
    appProfitLbl: 'Net profit', appSalesLbl: 'Sales', appMarginLbl: 'Avg. margin', appStockLbl: 'In stock',
    appThisMonth: 'this month', appChartTitle: 'Profit · 6 months',
    appMonths: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    appLatestSales: 'Latest sales', appSeeAll: 'See all →',
    appSale1Date: 'Today · Vinted', appSale2Date: 'Yesterday · eBay',
    appNavDash: 'Dashboard', appNavStock: 'Stock', appNavCalc: 'Calculate', appNavHist: 'History',
    stat1Label: 'Active resellers', stat2Label: 'Tracked profits',
    stat3Label: 'Satisfaction', stat4Label: 'To get started',
    featEyebrow: 'Features',
    featTitle1: 'Everything you need to ', featTitleAccent: 'sell smarter',
    featSub: "A simple tool, built by resellers for resellers. Add, calculate, sell — Fill & Sell handles the rest.",
    f1Title: 'Automatic tracking',
    f1Desc: 'Add your items in seconds. Fill & Sell calculates your margins automatically.',
    f1Header: '📦 My stock · 14 items', f1Add: '+ Add', f1BuyLabel: 'Buy → Sell',
    f1CatFashion: '👗 Fashion', f1CatTech: '📱 High-Tech', f1CatLuxe: '💎 Luxury',
    f2Title: 'Clear dashboard',
    f2Desc: 'Visualize your profits, sales and stock at a glance. No more Excel or calculator needed.',
    f2Evolution: 'Trend', f2VsMois: 'vs last month', f2SalesCount: '23 sales', f2Period: '6 months',
    f3Title: 'Margin calculator',
    f3Desc: "Instant profit calculation before you buy. Never make a bad deal again.",
    f3BuyPrice: 'Buy price', f3SellPrice: 'Sell price', f3Fees: 'Other fees', f3Verdict: 'Great margin 💪',
    f4Title: 'Full history',
    f4Desc: 'Find all your sales, sorted by date and profit. Filter by category, brand, platform.',
    f4Header: '📋 History · 23 sales',
    f4Items: [
      { name: 'Nike Air Max 90', date: 'Apr 28, 2026 · Vinted', amt: '+€47.00', red: false },
      { name: 'Longchamp Pliage Bag', date: 'Apr 27, 2026 · eBay', amt: '+€31.50', red: false },
      { name: 'Polo Ralph Lauren M', date: 'Apr 25, 2026 · Depop', amt: '+€18.20', red: false },
      { name: 'New Era Cap', date: 'Apr 23, 2026 · Vinted', amt: '−€2.40', red: true },
      { name: 'Maje dress (new)', date: 'Apr 22, 2026 · Vestiaire', amt: '+€89.00', red: false },
    ],
    f5Title: 'Excel Import & Export',
    f5Desc: "Import your stock and export your data in one tap. Compatible with Excel, Numbers and Google Sheets.",
    f5TabStock: '📊 Stock', f5TabSales: '📋 Sales', f5TabStats: '📈 Stats',
    f5ColItem: 'Item', f5ColBuy: 'Buy', f5ColSell: 'Sell', f5ColMargin: 'Margin',
    f6Title: 'Advanced stats',
    f6Desc: 'Analyze your best sales, average margin and trends. Find what works best.',
    f6Top3: '🏆 Top 3 of the month',
    f6Items: [
      { name: 'Hermès Kelly Bag', date: 'Apr 22 · Vestiaire', prefix: 'Sold' },
      { name: 'iPhone 12 Pro 128GB', date: 'Apr 19 · eBay', prefix: 'Sold' },
      { name: 'Maje dress (new)', date: 'Apr 22 · Vestiaire', prefix: 'Sold' },
    ],
    f6BestCat: 'Best category', f6BestCatVal: '💎 Luxury · 64% margin',
    showcaseEyebrow: 'Preview',
    showcaseTitle1: 'Visualize your profits ', showcaseTitleAccent: 'at a glance',
    showcaseSub: "A mobile-first interface. All your important data, right where you need it.",
    ph1CalcTitle: '🧮 Calculate your margin', ph1CalcSub: 'Enter the prices below',
    ph1BuyPrice: 'Buy price', ph1SellPrice: 'Sell price', ph1Fees: 'Other fees', ph1Verdict: 'Great margin 💪',
    ph2Stock: '📦 My stock', ph2Search: 'Search for an item…',
    ph2All: 'All · 14', ph2Fashion: '👗 Fashion · 6', ph2Tech: '📱 Tech · 3', ph2Luxe: '💎 Luxury · 2',
    ph2Buy: 'Buy', ph2Sold: 'Sold', ph2CatFashion: '👗 Fashion', ph2CatTech: '📱 Tech', ph2CatLuxe: '💎 Luxury',
    platformsTitle: 'Compatible with all your platforms', platformsSub: 'Track your sales, wherever you sell.',
    pricingEyebrow: 'Pricing',
    pricingTitle1: 'Choose the plan that ', pricingTitleAccent: 'fits you',
    pricingSub: "Start for free. Go premium when you're ready — no surprise, no commitment.",
    freeTier: 'Free', freeName: 'To get started', freePer: '/ forever',
    freeTagline: 'Everything you need to track your first sales.',
    freeF1: 'Up to 20 items', freeF2: 'Dashboard & basic stats',
    freeF3: 'Margin calculator', freeF4: 'Sales history', freeBtn: 'Start for free',
    premiumBadge: '⭐ Most popular', premiumTier: 'Premium', premiumName: 'To go further',
    premiumPer: '/ month', premiumTagline: 'Unlock all features. No limits.',
    premiumF1: 'Unlimited items', premiumF2: 'Advanced stats & trends',
    premiumF3: 'Excel & CSV export', premiumF4: 'Bulk Excel import', premiumF5: 'Priority support',
    premiumBtn: 'Go Premium ✨',
    ctaTitle: 'Ready to maximize your profits?',
    ctaSub: 'Join hundreds of resellers who track their profits with Fill & Sell.',
    ctaBtn: 'Create my free account →', ctaMicro: 'Free · No credit card · Ready in 30 seconds',
    faqEyebrow: 'FAQ', faqTitle: 'Have questions?',
    faqSub: 'Here are answers to the most common questions. You can also reach us at support@fillsell.app',
    footerTagline: 'Track your resale profits, automatically. For Vinted, eBay, Depop and more resellers.',
    footerProduct: 'Product', footerLegal: 'Legal', footerMentions: 'Legal notice',
    footerPrivacy: 'Privacy', footerCgu: 'Terms', footerContact: 'Contact',
    footerCopy: '© 2026 Fill & Sell. All rights reserved. Made with 💛 for resellers.',
  },
};

const css = `
:root {
  --teal: #3EACA0;
  --teal-strong: #1D9E75;
  --teal-bright: #4ECDC4;
  --teal-dark: #0F6E56;
  --teal-tint: #E8F5F0;
  --peach: #E8956D;
  --orange: #F9A26C;
  --bg: #FAFAF8;
  --bg-warm: #F8F7F4;
  --white: #FFFFFF;
  --text: #0D1117;
  --text-strong: #111827;
  --sub: #6B7280;
  --label: #A3A9A6;
  --border: rgba(0,0,0,0.06);
  --grad: linear-gradient(135deg, #3EACA0 0%, #E8956D 100%);
  --grad-soft: linear-gradient(135deg, #1D9E75, #4ECDC4);
  --shadow-sm: 0 1px 4px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04);
  --shadow-md: 0 8px 28px rgba(0,0,0,0.09);
  --shadow-lg: 0 24px 64px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
  --shadow-cta: 0 8px 24px rgba(62,172,160,0.40);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: 1.5;
  overflow-x: hidden;
}
img { max-width: 100%; display: block; }
button { font-family: inherit; cursor: pointer; }
a { text-decoration: none; color: inherit; }
.lp-container { max-width: 1180px; margin: 0 auto; padding: 0 24px; }

/* Reveal */
.reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.8s ease, transform 0.8s ease; }
.reveal.in { opacity: 1; transform: translateY(0); }
.reveal.delay-1 { transition-delay: 0.1s; }
.reveal.delay-2 { transition-delay: 0.2s; }
.reveal.delay-3 { transition-delay: 0.3s; }
.reveal.delay-4 { transition-delay: 0.4s; }

/* NAV */
.lp-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  background: rgba(250,250,248,0.78);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s, background 0.2s;
  padding-top: env(safe-area-inset-top, 0px);
}
.lp-nav.scrolled { border-bottom-color: var(--border); }
.lp-nav-inner {
  display: flex; align-items: center; justify-content: space-between;
  height: 68px; max-width: 1180px; margin: 0 auto; padding: 0 24px;
}
.lp-brand { display: flex; align-items: center; gap: 10px; cursor: pointer; border: none; background: transparent; padding: 0; }
.lp-brand img { height: 32px; width: 32px; }
.lp-brand-name {
  font-family: 'Plus Jakarta Sans', sans-serif; font-style: italic; font-weight: 800;
  font-size: 20px; letter-spacing: 0.2px;
  background: var(--grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
}
.lp-nav-links { display: flex; align-items: center; gap: 28px; }
.lp-nav-link { font-size: 14px; font-weight: 600; color: var(--text); transition: color 0.15s; }
.lp-nav-link:hover { color: var(--teal-strong); }
.lp-nav-actions { display: flex; align-items: center; gap: 10px; }
.lp-lang-seg { display: inline-flex; background: rgba(0,0,0,0.04); border-radius: 99px; padding: 3px; }
.lp-lang-seg button {
  background: transparent; border: none; color: var(--sub);
  font-weight: 800; font-size: 11px; padding: 5px 11px; border-radius: 99px;
  letter-spacing: 0.04em; transition: all 0.15s;
}
.lp-lang-seg button.on { background: var(--white); color: var(--teal-strong); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }

/* BUTTONS */
.btn {
  display: inline-flex; align-items: center; gap: 6px; border: none;
  font-weight: 700; font-size: 14px; border-radius: 99px; padding: 11px 20px;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s;
  white-space: nowrap;
}
.btn-ghost { background: transparent; color: var(--text); }
.btn-ghost:hover { background: rgba(0,0,0,0.04); }
.btn-primary { background: var(--teal-strong); color: white; box-shadow: 0 4px 14px rgba(29,158,117,0.32); }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(29,158,117,0.45); background: #178f68; }
.btn-grad { background: var(--grad); color: white; box-shadow: var(--shadow-cta); }
.btn-grad:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(62,172,160,0.5); }
.btn-white { background: white; color: var(--teal-strong); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
.btn-white:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.18); }
.btn-lg { font-size: 15px; padding: 15px 26px; border-radius: 14px; }

/* HERO */
.lp-hero {
  position: relative; min-height: 100vh;
  padding: calc(140px + env(safe-area-inset-top, 0px)) 0 80px;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 15% 20%, rgba(62,172,160,0.18) 0%, transparent 55%),
    radial-gradient(ellipse at 85% 80%, rgba(232,149,109,0.18) 0%, transparent 55%),
    var(--bg);
  display: flex; align-items: center;
}
.lp-hero::before {
  content: "";
  position: absolute; inset: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.4'/></svg>");
  opacity: 0.35; pointer-events: none; mix-blend-mode: multiply;
}
.lp-hero::after {
  content: "";
  position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(62,172,160,0.05) 0%, rgba(232,149,109,0.05) 100%);
  pointer-events: none;
  animation: gradientShift 18s ease-in-out infinite alternate;
}
@keyframes gradientShift {
  0% { opacity: 1; }
  100% { opacity: 0.6; }
}
.lp-hero-inner {
  position: relative; z-index: 2; width: 100%;
  display: grid; grid-template-columns: 1.05fr 1fr; gap: 60px; align-items: center;
}
.lp-hero-copy { max-width: 580px; }
.badge-pill {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 16px; background: rgba(255,255,255,0.7);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(62,172,160,0.25); border-radius: 99px;
  font-size: 13px; font-weight: 700; color: var(--teal-dark); margin-bottom: 24px;
  animation: pillFloat 3s ease-in-out infinite;
}
.badge-pill .dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--teal-strong);
  box-shadow: 0 0 0 0 rgba(29,158,117,0.6);
  animation: pulse 2s infinite;
}
@keyframes pillFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(29,158,117,0.6); } 70% { box-shadow: 0 0 0 8px rgba(29,158,117,0); } 100% { box-shadow: 0 0 0 0 rgba(29,158,117,0); } }
h1.lp-hero-title {
  font-family: 'Nunito', sans-serif; font-weight: 900;
  font-size: clamp(40px, 6vw, 72px); line-height: 1.02;
  letter-spacing: -0.035em; margin: 0 0 22px; color: var(--text); text-wrap: balance;
}
h1.lp-hero-title .grad {
  background: var(--grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
}
.lp-hero-sub { font-size: 19px; line-height: 1.55; color: var(--sub); margin: 0 0 32px; max-width: 540px; font-weight: 500; }
.lp-hero-ctas { display: flex; gap: 12px; flex-wrap: wrap; }
.lp-hero-micro {
  margin-top: 22px; font-size: 13px; color: var(--sub); font-weight: 600;
  display: flex; gap: 18px; flex-wrap: wrap;
}
.lp-hero-micro span { display: inline-flex; align-items: center; gap: 6px; }
.lp-hero-micro .check {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; background: var(--teal-tint); color: var(--teal-strong);
  border-radius: 50%; font-size: 10px; font-weight: 900;
}

/* iPhone mockup */
.lp-mockup-wrap { position: relative; display: flex; justify-content: center; align-items: center; perspective: 1200px; }
.lp-iphone {
  position: relative; width: 320px; height: 660px;
  background: #0D0D0D; border-radius: 50px; padding: 12px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08), inset 0 0 0 1.5px #2a2a2a;
  animation: floatPhone 6s ease-in-out infinite;
}
@keyframes floatPhone { 0%, 100% { transform: translateY(0) rotate(-1.5deg); } 50% { transform: translateY(-14px) rotate(-0.5deg); } }
.lp-iphone-screen { width: 100%; height: 100%; background: var(--bg-warm); border-radius: 38px; overflow: hidden; position: relative; }
.lp-iphone-notch { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); width: 110px; height: 28px; background: #0D0D0D; border-radius: 99px; z-index: 10; }
.lp-iphone .glow {
  position: absolute; inset: -40px;
  background: radial-gradient(ellipse at center, rgba(62,172,160,0.25), transparent 60%);
  filter: blur(40px); z-index: -1;
  animation: glowPulse 4s ease-in-out infinite alternate;
}
@keyframes glowPulse { 0% { opacity: 0.6; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1.05); } }

/* App screen */
.appscr { font-family: 'Nunito', sans-serif; height: 100%; display: flex; flex-direction: column; }
.app-topbar {
  background: var(--grad-soft); padding: 50px 16px 14px; display: flex; align-items: center; gap: 8px;
}
.app-topbar img { width: 22px; height: 22px; }
.app-topbar-name {
  font-family: 'Plus Jakarta Sans', sans-serif; font-style: italic; font-weight: 800;
  color: white; font-size: 14px; letter-spacing: 0.2px; flex: 1;
}
.app-topbar-pill {
  background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.35);
  border-radius: 99px; padding: 4px 9px; font-size: 9px; font-weight: 800; color: white;
}
.app-body { padding: 14px 14px 70px; flex: 1; overflow: hidden; }
.app-h2 { font-size: 16px; font-weight: 900; margin: 4px 0 12px; letter-spacing: -0.02em; }
.app-kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
.app-kpi { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 10px 11px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.app-kpi .ico { font-size: 12px; }
.app-kpi .lbl { font-size: 8px; font-weight: 800; color: var(--sub); text-transform: uppercase; letter-spacing: 0.07em; margin-top: 3px; }
.app-kpi .val { font-size: 16px; font-weight: 900; letter-spacing: -0.03em; line-height: 1; margin-top: 4px; font-variant-numeric: tabular-nums; }
.app-kpi .val.green { color: var(--teal-strong); }
.app-kpi .sub { font-size: 8px; font-weight: 700; color: var(--teal-strong); margin-top: 3px; }
.app-chart { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); margin-bottom: 12px; }
.app-chart-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.app-chart-title { font-size: 9px; font-weight: 800; color: var(--label); text-transform: uppercase; letter-spacing: 0.07em; }
.app-chart-pill { font-size: 8px; font-weight: 800; background: var(--teal-tint); color: var(--teal-strong); padding: 2px 7px; border-radius: 99px; }
.app-bars { display: flex; align-items: flex-end; gap: 4px; height: 70px; padding: 0 2px; }
.app-bars .bar { flex: 1; background: var(--teal-tint); border-radius: 4px 4px 0 0; }
.app-bars .bar.hi { background: var(--teal-strong); }
.app-bars .bar.top { background: var(--teal-dark); }
.app-xlabels { display: flex; gap: 4px; padding: 4px 2px 0; font-size: 8px; font-weight: 700; color: var(--label); }
.app-xlabels span { flex: 1; text-align: center; }
.app-sales-head { display: flex; justify-content: space-between; align-items: center; margin: 4px 0 8px; }
.app-sales-head .h { font-size: 11px; font-weight: 900; letter-spacing: -0.01em; }
.app-sales-head .a { font-size: 9px; font-weight: 700; color: var(--teal-strong); }
.app-sale {
  display: flex; align-items: center; justify-content: space-between;
  background: white; border-radius: 10px; padding: 8px 10px;
  border: 1px solid var(--border); margin-bottom: 5px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
.app-sale .t { font-size: 10px; font-weight: 700; }
.app-sale .d { font-size: 8px; font-weight: 600; color: var(--label); margin-top: 1px; }
.app-sale .amt { font-size: 11px; font-weight: 900; color: var(--teal-strong); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; text-align: right; }
.app-sale .pct { font-size: 8px; font-weight: 800; color: rgba(29,158,117,0.7); text-align: right; }
.app-bnav {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: white; border-top: 1px solid var(--border);
  display: flex; padding: 8px 0 14px;
}
.app-bnav .item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 8px; font-weight: 800; color: var(--label); }
.app-bnav .item.on { color: var(--teal-strong); }
.app-bnav .item .ic { font-size: 16px; opacity: 0.55; }
.app-bnav .item.on .ic { opacity: 1; }

/* STATS */
.lp-stats { background: white; padding: 80px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.lp-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; text-align: center; }
.stat-num {
  font-family: 'Nunito', sans-serif; font-size: clamp(40px, 5vw, 60px); font-weight: 900;
  letter-spacing: -0.04em; line-height: 1;
  background: var(--grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  margin-bottom: 8px; font-variant-numeric: tabular-nums;
}
.stat-label { font-size: 14px; font-weight: 700; color: var(--sub); }

/* SECTION */
.lp-section { padding: 100px 0; }
.section-eyebrow {
  display: inline-block; font-size: 12px; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.12em; color: var(--teal-strong);
  margin-bottom: 14px; padding: 6px 14px; background: var(--teal-tint); border-radius: 99px;
}
h2.section-title {
  font-family: 'Nunito', sans-serif; font-size: clamp(32px, 4vw, 48px); font-weight: 900;
  letter-spacing: -0.025em; line-height: 1.08; margin: 0 0 16px; text-wrap: balance;
}
.section-sub { font-size: 18px; color: var(--sub); font-weight: 500; max-width: 620px; margin: 0 auto; line-height: 1.55; }
.section-head { text-align: center; margin-bottom: 64px; }

/* FEATURES */
.lp-feature { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; margin-bottom: 120px; }
.lp-feature:last-child { margin-bottom: 0; }
.lp-feature.reverse .feature-copy { order: 2; }
.lp-feature.reverse .feature-mock { order: 1; }
.feature-icon-wrap {
  display: inline-flex; width: 64px; height: 64px; background: var(--grad);
  border-radius: 18px; align-items: center; justify-content: center; font-size: 30px;
  margin-bottom: 20px; box-shadow: 0 8px 24px rgba(62,172,160,0.3); transition: transform 0.4s ease;
}
.lp-feature:hover .feature-icon-wrap { transform: rotate(-6deg) scale(1.05); }
.feature-title { font-family: 'Nunito', sans-serif; font-size: 32px; font-weight: 900; letter-spacing: -0.02em; line-height: 1.15; margin: 0 0 14px; }
.feature-desc { font-size: 17px; color: var(--sub); line-height: 1.6; font-weight: 500; margin: 0 0 20px; max-width: 460px; }
.feature-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--peach); background: rgba(232,149,109,0.12); padding: 5px 11px; border-radius: 99px; margin-bottom: 14px; }
.feature-mock { position: relative; display: flex; justify-content: center; }
.mini-screen {
  background: white; border: 1px solid var(--border); border-radius: 24px;
  box-shadow: var(--shadow-md); padding: 24px; width: 100%; max-width: 460px;
  font-family: 'Nunito', sans-serif; position: relative; overflow: hidden;
}
.mini-screen::before {
  content: ""; position: absolute; top: -60px; right: -60px; width: 200px; height: 200px;
  background: radial-gradient(circle, rgba(62,172,160,0.1), transparent 70%);
  border-radius: 50%; pointer-events: none;
}
.mini-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); }
.mini-row:last-child { border-bottom: none; }
.mini-cat { display: inline-flex; font-size: 10px; font-weight: 800; padding: 3px 9px; border-radius: 99px; border: 1px solid; margin-right: 6px; }
.cat-fashion { background: #FDF2F8; color: #9D174D; border-color: #F9A8D4; }
.cat-tech { background: #EFF6FF; color: #1D4ED8; border-color: #93C5FD; }
.cat-luxe { background: #FDF8F0; color: #92400E; border-color: #F59E0B; }
.cat-home { background: #F0FDF4; color: #166534; border-color: #86EFAC; }
.calc-mock { padding: 24px; }
.calc-input { background: var(--bg-warm); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; }
.calc-input.filled { background: white; border-color: rgba(29,158,117,0.4); box-shadow: 0 0 0 3px rgba(29,158,117,0.08); }
.calc-input .ico { font-size: 18px; opacity: 0.7; }
.calc-input .meta { flex: 1; }
.calc-input .lbl { font-size: 9px; font-weight: 800; color: var(--label); text-transform: uppercase; letter-spacing: 0.08em; }
.calc-input .val { font-size: 14px; font-weight: 700; margin-top: 1px; }
.calc-input .suf { color: var(--label); font-size: 12px; font-weight: 700; }
.calc-result { margin-top: 14px; padding: 18px; background: linear-gradient(135deg, rgba(29,158,117,0.05), rgba(78,205,196,0.05)); border-radius: 14px; text-align: center; border: 1px solid rgba(29,158,117,0.15); }
.calc-big { font-size: 36px; font-weight: 900; color: var(--teal-strong); letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }
.calc-pct { display: inline-block; margin-top: 6px; font-size: 11px; font-weight: 800; background: rgba(29,158,117,0.15); color: var(--teal-strong); padding: 3px 10px; border-radius: 99px; }
.calc-verdict { margin-top: 8px; font-size: 13px; font-weight: 800; color: var(--teal-strong); }
.hist-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); }
.hist-row:last-child { border: none; }
.hist-name { font-size: 13px; font-weight: 700; }
.hist-date { font-size: 10px; font-weight: 600; color: var(--label); margin-top: 2px; }
.hist-amt { font-size: 14px; font-weight: 900; color: var(--teal-strong); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; text-align: right; }
.hist-amt.red { color: #E53E3E; }
.excel-mock { font-family: 'Nunito', sans-serif; }
.xlsx-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
.xlsx-tab { font-size: 11px; font-weight: 800; padding: 6px 12px; border-radius: 8px; background: #F5F6F5; color: var(--sub); }
.xlsx-tab.on { background: #1B7C4F; color: white; }
.xlsx-grid { display: grid; grid-template-columns: 1.6fr 1fr 1fr 0.9fr; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); font-size: 11px; }
.xlsx-grid > div { padding: 8px 10px; border-bottom: 1px solid var(--border); font-weight: 600; }
.xlsx-grid .h { background: #F8F7F4; font-weight: 800; font-size: 9px; color: var(--sub); text-transform: uppercase; letter-spacing: 0.06em; }
.xlsx-grid .green { color: var(--teal-strong); font-weight: 800; }
.stat-card { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.stat-medal { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #FDE68A, #F59E0B); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.stat-medal.silver { background: linear-gradient(135deg, #E5E7EB, #9CA3AF); }
.stat-medal.bronze { background: linear-gradient(135deg, #FED7AA, #F97316); }
.stat-card .t { font-size: 12px; font-weight: 800; }
.stat-card .d { font-size: 10px; font-weight: 600; color: var(--label); margin-top: 1px; }
.stat-card .amt { font-size: 14px; font-weight: 900; color: var(--teal-strong); margin-left: auto; }

/* SHOWCASE */
.lp-showcase {
  background: linear-gradient(180deg, #F1F5F4 0%, #FAFAF8 100%);
  padding: 100px 0; position: relative; overflow: hidden;
}
.lp-showcase::before {
  content: ""; position: absolute; width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(62,172,160,0.12), transparent 70%);
  border-radius: 50%; top: -200px; left: -200px; pointer-events: none;
}
.lp-showcase::after {
  content: ""; position: absolute; width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(232,149,109,0.12), transparent 70%);
  border-radius: 50%; bottom: -200px; right: -200px; pointer-events: none;
}
.showcase-phones { display: flex; justify-content: center; align-items: center; gap: 48px; position: relative; z-index: 2; flex-wrap: wrap; }
.iphone-sm { width: 280px; height: 580px; background: #0D0D0D; border-radius: 44px; padding: 10px; box-shadow: 0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08); position: relative; flex-shrink: 0; }
.iphone-sm:nth-child(1) { transform: rotate(-4deg) translateY(20px); }
.iphone-sm:nth-child(2) { transform: rotate(4deg) translateY(-20px); }
.iphone-sm:hover { transform: rotate(0) translateY(-8px); transition: transform 0.5s; }
.iphone-sm .lp-iphone-screen { border-radius: 34px; }
.iphone-sm .lp-iphone-notch { width: 90px; height: 24px; }
.app-search { background: white; border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; font-size: 10px; color: var(--label); }
.app-filters { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 10px; }
.app-filter { font-size: 9px; font-weight: 800; padding: 4px 9px; border-radius: 99px; background: #F5F6F5; color: var(--sub); }
.app-filter.on { background: var(--teal-tint); color: var(--teal-strong); }
.app-inv-row { background: white; border-radius: 10px; border: 1px solid var(--border); padding: 9px 11px; margin-bottom: 6px; display: flex; align-items: center; gap: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); }
.app-inv-row .name { font-size: 10px; font-weight: 700; margin-bottom: 3px; }
.app-inv-row .tags { display: flex; gap: 3px; flex-wrap: wrap; }
.app-tag { font-size: 8px; font-weight: 800; padding: 1.5px 6px; border-radius: 99px; border: 1px solid; }
.app-inv-row .right { text-align: right; margin-left: auto; }
.app-inv-row .right .l { font-size: 7px; color: var(--label); font-weight: 700; }
.app-inv-row .right .v { font-size: 11px; font-weight: 900; }
.app-inv-row .right .v.green { color: var(--teal-strong); }
.app-inv-row .right .v.peach { color: var(--peach); }

/* PLATFORMS */
.lp-platforms { padding: 80px 0; background: white; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); overflow: hidden; }
.platforms-head { text-align: center; margin-bottom: 40px; }
.platforms-head h3 { font-family: 'Nunito', sans-serif; font-size: 24px; font-weight: 900; letter-spacing: -0.02em; margin: 0 0 8px; }
.platforms-head p { color: var(--sub); font-size: 15px; font-weight: 500; margin: 0; }
.marquee { display: flex; overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent 0%, black 8%, black 92%, transparent 100%); mask-image: linear-gradient(90deg, transparent 0%, black 8%, black 92%, transparent 100%); }
.marquee-track { display: flex; gap: 14px; animation: scroll 40s linear infinite; flex-shrink: 0; padding-right: 14px; }
@keyframes scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
.platform-pill { display: inline-flex; align-items: center; gap: 8px; padding: 12px 22px; background: var(--bg); border: 1px solid var(--border); border-radius: 99px; font-size: 15px; font-weight: 800; color: var(--text); white-space: nowrap; transition: all 0.18s; }
.platform-pill:hover { background: white; border-color: rgba(62,172,160,0.4); color: var(--teal-strong); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.platform-pill .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--grad); }

/* PRICING */
.lp-pricing { background: var(--bg); }
.pricing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 880px; margin: 0 auto; }
.price-card { background: white; border: 1px solid var(--border); border-radius: 24px; padding: 36px 32px; position: relative; transition: transform 0.25s, box-shadow 0.25s; box-shadow: var(--shadow-sm); }
.price-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-md); }
.price-card.premium { background: var(--grad); color: white; border: none; box-shadow: 0 16px 48px rgba(62,172,160,0.35); }
.price-card.premium::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: radial-gradient(circle at 20% 0%, rgba(255,255,255,0.18), transparent 50%), radial-gradient(circle at 80% 100%, rgba(255,255,255,0.12), transparent 50%);
  border-radius: 24px; pointer-events: none;
}
.price-popular { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: white; color: var(--teal-strong); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; padding: 6px 14px; border-radius: 99px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); }
.price-tier { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
.price-card .price-tier { color: var(--teal-strong); }
.price-card.premium .price-tier { color: rgba(255,255,255,0.85); }
.price-name { font-family: 'Nunito', sans-serif; font-size: 28px; font-weight: 900; letter-spacing: -0.02em; margin: 0 0 8px; }
.price-amount { display: flex; align-items: baseline; gap: 6px; margin: 0 0 8px; }
.price-amount .num { font-family: 'Nunito', sans-serif; font-size: 56px; font-weight: 900; letter-spacing: -0.04em; line-height: 1; }
.price-amount .per { font-size: 16px; font-weight: 700; opacity: 0.7; }
.price-tagline { font-size: 14px; font-weight: 600; opacity: 0.85; margin-bottom: 28px; }
.price-features { list-style: none; padding: 0; margin: 0 0 32px; display: flex; flex-direction: column; gap: 12px; }
.price-features li { display: flex; align-items: flex-start; gap: 10px; font-size: 15px; font-weight: 600; line-height: 1.4; }
.price-features .ck { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; font-size: 11px; font-weight: 900; }
.price-card .ck { background: var(--teal-tint); color: var(--teal-strong); }
.price-card.premium .ck { background: rgba(255,255,255,0.25); color: white; }
.price-card .btn { width: 100%; justify-content: center; }
.price-card.free .btn { background: transparent; color: var(--teal-strong); border: 1.5px solid var(--teal-strong); }
.price-card.free .btn:hover { background: var(--teal-strong); color: white; }

/* CTA FINAL */
.lp-cta-final {
  position: relative; padding: 120px 0; background: var(--grad); overflow: hidden; text-align: center;
}
.lp-cta-final::before { content: ""; position: absolute; width: 500px; height: 500px; background: rgba(255,255,255,0.08); border-radius: 50%; top: -200px; left: 10%; pointer-events: none; filter: blur(40px); }
.lp-cta-final::after { content: ""; position: absolute; width: 400px; height: 400px; background: rgba(255,255,255,0.1); border-radius: 50%; bottom: -150px; right: 10%; pointer-events: none; filter: blur(40px); }
.lp-cta-final .lp-container { position: relative; z-index: 2; }
.lp-cta-final h2 { font-family: 'Nunito', sans-serif; font-size: clamp(36px, 5vw, 56px); font-weight: 900; letter-spacing: -0.025em; line-height: 1.1; color: white; margin: 0 0 20px; text-wrap: balance; }
.lp-cta-final p { font-size: 18px; color: rgba(255,255,255,0.92); max-width: 600px; margin: 0 auto 36px; line-height: 1.55; font-weight: 500; }
.lp-cta-final .btn-white { font-size: 16px; padding: 17px 32px; }
.lp-cta-final .micro { margin-top: 22px; font-size: 14px; color: rgba(255,255,255,0.85); font-weight: 600; }

/* FAQ */
.lp-faq { background: var(--bg); }
.faq-list { max-width: 780px; margin: 0 auto; }
.faq-item { background: white; border: 1px solid var(--border); border-radius: 16px; margin-bottom: 12px; overflow: hidden; transition: box-shadow 0.2s, border-color 0.2s; }
.faq-item:hover { border-color: rgba(62,172,160,0.3); }
.faq-item.open { box-shadow: var(--shadow-sm); border-color: rgba(62,172,160,0.4); }
.faq-q { width: 100%; background: transparent; border: none; padding: 22px 26px; display: flex; align-items: center; justify-content: space-between; font-family: 'Nunito', sans-serif; font-size: 17px; font-weight: 800; text-align: left; color: var(--text); letter-spacing: -0.01em; }
.faq-q .plus { width: 28px; height: 28px; flex-shrink: 0; border-radius: 50%; background: var(--teal-tint); color: var(--teal-strong); display: inline-flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; transition: transform 0.3s, background 0.3s; margin-left: 16px; }
.faq-item.open .plus { background: var(--teal-strong); color: white; transform: rotate(45deg); }
.faq-a { max-height: 0; overflow: hidden; transition: max-height 0.4s ease; }
.faq-item.open .faq-a { max-height: 400px; }
.faq-a-inner { padding: 0 26px 22px; font-size: 15px; line-height: 1.65; color: var(--sub); font-weight: 500; }

/* FOOTER */
.lp-footer { background: var(--text); color: rgba(255,255,255,0.7); padding: 60px 0 40px; }
.footer-inner { display: flex; justify-content: space-between; align-items: flex-start; gap: 32px; flex-wrap: wrap; }
.footer-brand-block { max-width: 360px; }
.footer-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.footer-brand img { height: 32px; width: 32px; }
.footer-brand-name { font-family: 'Plus Jakarta Sans', sans-serif; font-style: italic; font-weight: 800; font-size: 20px; background: var(--grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; overflow: visible; white-space: nowrap; padding-right: 4px; }
.footer-tagline { font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.65); margin: 0 0 18px; }
.footer-copy { font-size: 13px; color: rgba(255,255,255,0.45); margin-top: 32px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 24px; }
.footer-links { display: flex; gap: 28px; flex-wrap: wrap; }
.footer-links-col h4 { font-family: 'Nunito', sans-serif; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: white; margin: 0 0 14px; }
.footer-links-col ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.footer-links-col a { font-size: 14px; color: rgba(255,255,255,0.65); transition: color 0.15s; }
.footer-links-col a:hover { color: white; }

/* RESPONSIVE */
@media (max-width: 980px) {
  .lp-hero { padding-top: calc(120px + env(safe-area-inset-top, 0px)); }
  .lp-hero-inner { grid-template-columns: 1fr; gap: 60px; }
  .lp-hero-copy { max-width: 100%; }
  .lp-feature { grid-template-columns: 1fr; gap: 40px; margin-bottom: 80px; }
  .lp-feature.reverse .feature-copy { order: 1; }
  .lp-feature.reverse .feature-mock { order: 2; }
  .lp-stats-grid { grid-template-columns: 1fr 1fr; gap: 40px 24px; }
  .pricing-grid { grid-template-columns: 1fr; max-width: 480px; }
  .lp-nav-links { display: none; }
  .lp-section { padding: 80px 0; }
  .lp-iphone { width: 280px; height: 580px; }
  .lp-iphone-screen { border-radius: 34px; }
  .iphone-sm:nth-child(1), .iphone-sm:nth-child(2) { transform: none; }
  .showcase-phones { gap: 24px; }
}
@media (max-width: 768px) {
  .nav-cta-btn { display: none; }
}
@media (max-width: 540px) {
  .lp-stats-grid { gap: 32px 16px; }
  h1.lp-hero-title { font-size: 40px; }
  .lp-hero-sub { font-size: 17px; }
  .lp-iphone { width: 260px; height: 540px; padding: 10px; }
  .lp-iphone-screen { border-radius: 30px; }
  .feature-title { font-size: 26px; }
  .feature-desc { font-size: 16px; }
  .price-amount .num { font-size: 44px; }
  .price-card { padding: 28px 22px; }
  .platform-pill { font-size: 13px; padding: 10px 16px; }
}
`;

const GRAD_STYLE = { background: 'var(--grad)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' };

export default function LandingPage() {
  const nav = useNavigate();
  const [lang, setLang] = useState(getBrowserLang);
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  const t = T[lang];
  const faqItems = FAQ_ITEMS[lang];

  useEffect(() => { track('page_view', { page: 'landing' }); }, []);
  useEffect(() => { localStorage.setItem('fs_lang', lang); }, [lang]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    function animateCounter(el) {
      const target = parseFloat(el.dataset.counter);
      const suffix = el.dataset.suffix || '';
      const duration = 1800;
      const start = performance.now();
      function tick(now) {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        const val = target * eased;
        el.textContent = (target % 1 === 0 ? Math.round(val) : val.toFixed(1)) + suffix;
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = target + suffix;
      }
      requestAnimationFrame(tick);
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { animateCounter(e.target); obs.unobserve(e.target); } });
    }, { threshold: 0.4 });
    document.querySelectorAll('[data-counter]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  function changeLang(code) {
    setLang(code);
    localStorage.setItem('fs_lang', code);
    track('change_language', { language: code });
  }

  const allPlatforms = [...PLATFORMS, ...PLATFORMS];

  return (
    <div>
      <style>{css}</style>

      {/* ── NAV ── */}
      <nav className={`lp-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <button className="lp-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <img src="/icon_180x180.png" alt="Fill & Sell logo" />
            <span className="lp-brand-name">Fill &amp; Sell</span>
          </button>
          <div className="lp-nav-links">
            <a className="lp-nav-link" href="#features">{t.navFeatures}</a>
            <a className="lp-nav-link" href="#pricing">{t.navPricing}</a>
            <a className="lp-nav-link" href="#faq">{t.navFaq}</a>
          </div>
          <div className="lp-nav-actions">
            <div className="lp-lang-seg" role="tablist" aria-label="Langue">
              {['fr', 'en'].map(code => (
                <button key={code} className={lang === code ? 'on' : ''} onClick={() => changeLang(code)}>
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={() => nav('/login')}>{t.navLogin}</button>
            <button className="btn btn-primary nav-cta-btn" onClick={() => { track('cta_click', { cta: 'nav_signup', page: 'landing' }); nav('/login?mode=signup'); }}>
              {t.navCta}
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="lp-hero" id="top">
        <div className="lp-container lp-hero-inner">
          <div className="lp-hero-copy">
            <div className="badge-pill reveal">
              <span className="dot"></span>
              {t.heroBadge}
            </div>
            <h1 className="lp-hero-title reveal delay-1">
              {t.heroTitle1}<span className="grad">{t.heroTitleAccent}</span>{t.heroTitle2}
            </h1>
            <p className="lp-hero-sub reveal delay-2">{t.heroSub}</p>
            <div className="lp-hero-ctas reveal delay-3">
              <button className="btn btn-grad btn-lg"
                onClick={() => { track('cta_click', { cta: 'hero_signup', page: 'landing' }); nav('/login?mode=signup'); }}>
                {t.heroCta}
              </button>
              <button className="btn btn-ghost btn-lg" style={{ border: '1.5px solid rgba(0,0,0,0.1)' }}
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
                {t.heroSecondary}
              </button>
            </div>
            <div className="lp-hero-micro reveal delay-4">
              <span><span className="check">✓</span> {t.heroFree}</span>
              <span><span className="check">✓</span> {t.heroNoCard}</span>
              <span><span className="check">✓</span> {t.heroReady}</span>
            </div>
          </div>

          <div className="lp-mockup-wrap reveal delay-2">
            <div className="lp-iphone">
              <div className="glow"></div>
              <div className="lp-iphone-notch"></div>
              <div className="lp-iphone-screen">
                <div className="appscr">
                  <div className="app-topbar">
                    <img src="/icon_180x180.png" alt="" />
                    <span className="app-topbar-name">Fill &amp; Sell</span>
                    <span className="app-topbar-pill">⭐ Premium</span>
                  </div>
                  <div className="app-body">
                    <div className="app-h2">{t.appMonthTitle}</div>
                    <div className="app-kpis">
                      <div className="app-kpi">
                        <div className="ico">💰</div>
                        <div className="lbl">{t.appProfitLbl}</div>
                        <div className="val green">+847 €</div>
                        <div className="sub">{t.appThisMonth}</div>
                      </div>
                      <div className="app-kpi">
                        <div className="ico">📊</div>
                        <div className="lbl">{t.appSalesLbl}</div>
                        <div className="val">23</div>
                        <div className="sub" style={{ color: 'var(--sub)' }}>{t.appThisMonth}</div>
                      </div>
                      <div className="app-kpi">
                        <div className="ico">📈</div>
                        <div className="lbl">{t.appMarginLbl}</div>
                        <div className="val green">42,8 %</div>
                      </div>
                      <div className="app-kpi">
                        <div className="ico">📦</div>
                        <div className="lbl">{t.appStockLbl}</div>
                        <div className="val" style={{ color: 'var(--sub)' }}>14 art.</div>
                      </div>
                    </div>
                    <div className="app-chart">
                      <div className="app-chart-head">
                        <div className="app-chart-title">{t.appChartTitle}</div>
                        <div className="app-chart-pill">+38%</div>
                      </div>
                      <div className="app-bars">
                        <div className="bar" style={{ height: '30%' }}></div>
                        <div className="bar" style={{ height: '24%' }}></div>
                        <div className="bar hi" style={{ height: '50%' }}></div>
                        <div className="bar" style={{ height: '38%' }}></div>
                        <div className="bar hi" style={{ height: '64%' }}></div>
                        <div className="bar top" style={{ height: '88%' }}></div>
                      </div>
                      <div className="app-xlabels">
                        {t.appMonths.map(m => <span key={m}>{m}</span>)}
                      </div>
                    </div>
                    <div className="app-sales-head">
                      <div className="h">{t.appLatestSales}</div>
                      <div className="a">{t.appSeeAll}</div>
                    </div>
                    <div className="app-sale">
                      <div><div className="t">Nike Air Max 90</div><div className="d">{t.appSale1Date}</div></div>
                      <div><div className="amt">+47,00 €</div><div className="pct">38,2%</div></div>
                    </div>
                    <div className="app-sale">
                      <div><div className="t">Sac Longchamp Pliage</div><div className="d">{t.appSale2Date}</div></div>
                      <div><div className="amt">+31,50 €</div><div className="pct">31,5%</div></div>
                    </div>
                  </div>
                  <div className="app-bnav">
                    <div className="item on"><span className="ic">📊</span><span>{t.appNavDash}</span></div>
                    <div className="item"><span className="ic">📦</span><span>{t.appNavStock}</span></div>
                    <div className="item"><span className="ic">🧮</span><span>{t.appNavCalc}</span></div>
                    <div className="item"><span className="ic">📋</span><span>{t.appNavHist}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="lp-stats reveal">
        <div className="lp-container">
          <div className="lp-stats-grid">
            <div><div className="stat-num" data-counter="500" data-suffix="+">0</div><div className="stat-label">{t.stat1Label}</div></div>
            <div><div className="stat-num" data-counter="12" data-suffix="k€">0</div><div className="stat-label">{t.stat2Label}</div></div>
            <div><div className="stat-num" data-counter="98" data-suffix="%">0</div><div className="stat-label">{t.stat3Label}</div></div>
            <div><div className="stat-num" data-counter="30" data-suffix="s">0</div><div className="stat-label">{t.stat4Label}</div></div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="lp-section" id="features">
        <div className="lp-container">
          <div className="section-head reveal">
            <span className="section-eyebrow">{t.featEyebrow}</span>
            <h2 className="section-title">{t.featTitle1}<span style={GRAD_STYLE}>{t.featTitleAccent}</span></h2>
            <p className="section-sub">{t.featSub}</p>
          </div>

          {/* Feature 1 */}
          <div className="lp-feature reveal">
            <div className="feature-copy">
              <div className="feature-icon-wrap">📦</div>
              <h3 className="feature-title">{t.f1Title}</h3>
              <p className="feature-desc">{t.f1Desc}</p>
            </div>
            <div className="feature-mock">
              <div className="mini-screen">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-0.01em' }}>{t.f1Header}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal-strong)' }}>{t.f1Add}</div>
                </div>
                {[
                  { name: "Veste Levi's vintage", catClass: 'cat-fashion', catLabel: t.f1CatFashion, brand: "Levi's", buy: '15€', sell: '42€' },
                  { name: 'iPhone 12 Pro 128Go', catClass: 'cat-tech', catLabel: t.f1CatTech, brand: 'Apple', buy: '280€', sell: '420€' },
                  { name: 'Sac Hermès Kelly', catClass: 'cat-luxe', catLabel: t.f1CatLuxe, brand: 'Hermès', buy: '820€', sell: '1240€' },
                ].map(({ name, catClass, catLabel, brand, buy, sell }) => (
                  <div key={name} className="mini-row">
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{name}</div>
                      <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                        <span className={`mini-cat ${catClass}`}>{catLabel}</span>
                        <span className="mini-cat" style={{ background: 'var(--teal-tint)', color: 'var(--teal-strong)', borderColor: '#9FE1CB' }}>{brand}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 9, color: 'var(--label)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.f1BuyLabel}</div>
                      <div style={{ fontSize: 13, fontWeight: 900, marginTop: 3 }}>
                        <span style={{ color: 'var(--peach)' }}>{buy}</span> → <span style={{ color: 'var(--teal-strong)' }}>{sell}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="lp-feature reverse reveal">
            <div className="feature-copy">
              <div className="feature-icon-wrap">📊</div>
              <h3 className="feature-title">{t.f2Title}</h3>
              <p className="feature-desc">{t.f2Desc}</p>
            </div>
            <div className="feature-mock">
              <div className="mini-screen">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div style={{ background: 'var(--bg-warm)', padding: 14, borderRadius: 12 }}>
                    <div style={{ fontSize: 18 }}>💰</div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 6 }}>{t.appProfitLbl}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--teal-strong)', letterSpacing: '-0.03em', lineHeight: 1, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>+847 €</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--teal-strong)', marginTop: 4 }}>↑ +38% {t.f2VsMois}</div>
                  </div>
                  <div style={{ background: 'var(--bg-warm)', padding: 14, borderRadius: 12 }}>
                    <div style={{ fontSize: 18 }}>📈</div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 6 }}>{t.appMarginLbl}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--teal-strong)', letterSpacing: '-0.03em', lineHeight: 1, marginTop: 4 }}>42,8 %</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sub)', marginTop: 4 }}>{t.f2SalesCount}</div>
                  </div>
                </div>
                <div style={{ background: 'var(--bg-warm)', padding: 14, borderRadius: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--label)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t.f2Evolution}</div>
                    <div style={{ fontSize: 9, fontWeight: 800, background: 'var(--teal-tint)', color: 'var(--teal-strong)', padding: '3px 9px', borderRadius: 99 }}>{t.f2Period}</div>
                  </div>
                  <svg viewBox="0 0 280 90" style={{ width: '100%', height: 90, display: 'block' }}>
                    <defs>
                      <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#1D9E75" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#1D9E75" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M 0 70 Q 40 60 60 55 T 120 45 T 180 30 T 240 22 L 280 12 L 280 90 L 0 90 Z" fill="url(#g1)" />
                    <path d="M 0 70 Q 40 60 60 55 T 120 45 T 180 30 T 240 22 L 280 12" stroke="#1D9E75" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                    <circle cx="280" cy="12" r="4" fill="#1D9E75" />
                    <circle cx="280" cy="12" r="8" fill="#1D9E75" opacity="0.2" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="lp-feature reveal">
            <div className="feature-copy">
              <div className="feature-icon-wrap">🧮</div>
              <h3 className="feature-title">{t.f3Title}</h3>
              <p className="feature-desc">{t.f3Desc}</p>
            </div>
            <div className="feature-mock">
              <div className="mini-screen calc-mock">
                {[{ ico: '💶', lbl: t.f3BuyPrice, val: '15,00' }, { ico: '💰', lbl: t.f3SellPrice, val: '42,00' }, { ico: '📦', lbl: t.f3Fees, val: '3,50' }].map(({ ico, lbl, val }) => (
                  <div key={lbl} className="calc-input filled">
                    <span className="ico">{ico}</span>
                    <div className="meta"><div className="lbl">{lbl}</div><div className="val">{val}</div></div>
                    <span className="suf">€</span>
                  </div>
                ))}
                <div className="calc-result">
                  <div className="calc-big">+23,50 €</div>
                  <div className="calc-pct">55,9 %</div>
                  <div className="calc-verdict">{t.f3Verdict}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature 4 */}
          <div className="lp-feature reverse reveal">
            <div className="feature-copy">
              <div className="feature-icon-wrap">📋</div>
              <h3 className="feature-title">{t.f4Title}</h3>
              <p className="feature-desc">{t.f4Desc}</p>
            </div>
            <div className="feature-mock">
              <div className="mini-screen">
                <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 12 }}>{t.f4Header}</div>
                {t.f4Items.map(({ name, date, amt, red }) => (
                  <div key={name} className="hist-row">
                    <div><div className="hist-name">{name}</div><div className="hist-date">{date}</div></div>
                    <div className={`hist-amt${red ? ' red' : ''}`}>{amt}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Feature 5 */}
          <div className="lp-feature reveal">
            <div className="feature-copy">
              <span className="feature-tag">⭐ Premium</span>
              <div className="feature-icon-wrap">📥</div>
              <h3 className="feature-title">{t.f5Title}</h3>
              <p className="feature-desc">{t.f5Desc}</p>
            </div>
            <div className="feature-mock">
              <div className="mini-screen excel-mock">
                <div className="xlsx-tabs">
                  <div className="xlsx-tab on">{t.f5TabStock}</div>
                  <div className="xlsx-tab">{t.f5TabSales}</div>
                  <div className="xlsx-tab">{t.f5TabStats}</div>
                </div>
                <div className="xlsx-grid">
                  <div className="h">{t.f5ColItem}</div><div className="h">{t.f5ColBuy}</div><div className="h">{t.f5ColSell}</div><div className="h">{t.f5ColMargin}</div>
                  <div>Veste Levi's vintage</div><div>15,00 €</div><div>42,00 €</div><div className="green">+23,50 €</div>
                  <div>iPhone 12 Pro</div><div>280,00 €</div><div>420,00 €</div><div className="green">+128,00 €</div>
                  <div>Sac Hermès Kelly</div><div>820,00 €</div><div>1240,00 €</div><div className="green">+395,00 €</div>
                  <div>Polo Ralph Lauren</div><div>8,00 €</div><div>28,00 €</div><div className="green">+18,20 €</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <div style={{ flex: 1, background: '#F0FDF4', color: '#166534', fontSize: 11, fontWeight: 800, padding: '9px 12px', borderRadius: 10, textAlign: 'center', border: '1px solid #86EFAC' }}>📥 Import Excel</div>
                  <div style={{ flex: 1, background: '#FFF4EE', color: '#9A3412', fontSize: 11, fontWeight: 800, padding: '9px 12px', borderRadius: 10, textAlign: 'center', border: '1px solid #FDBA74' }}>📤 Export CSV</div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature 6 */}
          <div className="lp-feature reverse reveal">
            <div className="feature-copy">
              <span className="feature-tag">⭐ Premium</span>
              <div className="feature-icon-wrap">✨</div>
              <h3 className="feature-title">{t.f6Title}</h3>
              <p className="feature-desc">{t.f6Desc}</p>
            </div>
            <div className="feature-mock">
              <div className="mini-screen">
                <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 14 }}>{t.f6Top3}</div>
                <div className="stat-card"><div className="stat-medal">🥇</div><div><div className="t">{t.f6Items[0].name}</div><div className="d">{t.f6Items[0].prefix} {t.f6Items[0].date}</div></div><div className="amt">+395 €</div></div>
                <div className="stat-card"><div className="stat-medal silver">🥈</div><div><div className="t">{t.f6Items[1].name}</div><div className="d">{t.f6Items[1].prefix} {t.f6Items[1].date}</div></div><div className="amt">+128 €</div></div>
                <div className="stat-card"><div className="stat-medal bronze">🥉</div><div><div className="t">{t.f6Items[2].name}</div><div className="d">{t.f6Items[2].prefix} {t.f6Items[2].date}</div></div><div className="amt">+89 €</div></div>
                <div style={{ background: 'linear-gradient(135deg,rgba(62,172,160,0.08),rgba(232,149,109,0.08))', padding: '12px 14px', borderRadius: 12, marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t.f6BestCat}</div>
                    <div style={{ fontSize: 14, fontWeight: 900, marginTop: 3 }}>{t.f6BestCatVal}</div>
                  </div>
                  <div style={{ fontSize: 18 }}>🔥</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SHOWCASE ── */}
      <section className="lp-showcase">
        <div className="lp-container">
          <div className="section-head reveal">
            <span className="section-eyebrow">{t.showcaseEyebrow}</span>
            <h2 className="section-title">{t.showcaseTitle1}<span style={GRAD_STYLE}>{t.showcaseTitleAccent}</span></h2>
            <p className="section-sub">{t.showcaseSub}</p>
          </div>
          <div className="showcase-phones reveal">

            {/* Phone 1: Calculator */}
            <div className="iphone-sm">
              <div className="lp-iphone-notch"></div>
              <div className="lp-iphone-screen">
                <div className="appscr">
                  <div className="app-topbar">
                    <img src="/icon_180x180.png" alt="" />
                    <span className="app-topbar-name">Fill &amp; Sell</span>
                    <span className="app-topbar-pill">⭐</span>
                  </div>
                  <div className="app-body">
                    <div style={{ textAlign: 'center', padding: '6px 0 14px' }}>
                      <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.02em' }}>{t.ph1CalcTitle}</div>
                      <div style={{ fontSize: 10, color: 'var(--sub)', fontWeight: 600, marginTop: 3 }}>{t.ph1CalcSub}</div>
                    </div>
                    {[{ ico: '💶', lbl: t.ph1BuyPrice, val: '12,00' }, { ico: '💰', lbl: t.ph1SellPrice, val: '35,00' }, { ico: '📦', lbl: t.ph1Fees, val: '2,80' }].map(({ ico, lbl, val }, i) => (
                      <div key={lbl} className="calc-input filled" style={{ marginBottom: i < 2 ? 8 : 12, padding: '10px 12px' }}>
                        <span className="ico" style={{ fontSize: 16 }}>{ico}</span>
                        <div className="meta"><div className="lbl" style={{ fontSize: 8 }}>{lbl}</div><div className="val" style={{ fontSize: 13 }}>{val}</div></div>
                        <span className="suf" style={{ fontSize: 11 }}>€</span>
                      </div>
                    ))}
                    <div style={{ background: 'linear-gradient(135deg,rgba(29,158,117,0.06),rgba(78,205,196,0.06))', border: '1px solid rgba(29,158,117,0.2)', borderRadius: 14, padding: '18px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--teal-strong)', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>+20,20 €</div>
                      <div style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 800, background: 'rgba(29,158,117,0.15)', color: 'var(--teal-strong)', padding: '3px 9px', borderRadius: 99 }}>57,7 %</div>
                      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: 'var(--teal-strong)' }}>{t.ph1Verdict}</div>
                    </div>
                  </div>
                  <div className="app-bnav">
                    <div className="item"><span className="ic">📊</span><span>{t.appNavDash}</span></div>
                    <div className="item"><span className="ic">📦</span><span>{t.appNavStock}</span></div>
                    <div className="item on"><span className="ic">🧮</span><span>{t.appNavCalc}</span></div>
                    <div className="item"><span className="ic">📋</span><span>{t.appNavHist}</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Phone 2: Inventory */}
            <div className="iphone-sm">
              <div className="lp-iphone-notch"></div>
              <div className="lp-iphone-screen">
                <div className="appscr">
                  <div className="app-topbar">
                    <img src="/icon_180x180.png" alt="" />
                    <span className="app-topbar-name">Fill &amp; Sell</span>
                    <span className="app-topbar-pill">⭐</span>
                  </div>
                  <div className="app-body">
                    <div className="app-h2">{t.ph2Stock}</div>
                    <div className="app-search">🔍 <span>{t.ph2Search}</span></div>
                    <div className="app-filters">
                      <span className="app-filter on">{t.ph2All}</span>
                      <span className="app-filter">{t.ph2Fashion}</span>
                      <span className="app-filter">{t.ph2Tech}</span>
                      <span className="app-filter">{t.ph2Luxe}</span>
                    </div>
                    {[
                      { name: "Veste Levi's vintage", tags: [{ s: { background: '#FDF2F8', color: '#9D174D', borderColor: '#F9A8D4' }, l: t.ph2CatFashion }, { s: { background: 'var(--teal-tint)', color: 'var(--teal-strong)', borderColor: '#9FE1CB' }, l: "Levi's" }], side: t.ph2Buy, val: '15€', valClass: 'peach' },
                      { name: 'iPhone 12 Pro 128Go', tags: [{ s: { background: '#EFF6FF', color: '#1D4ED8', borderColor: '#93C5FD' }, l: t.ph2CatTech }, { s: { background: 'var(--teal-tint)', color: 'var(--teal-strong)', borderColor: '#9FE1CB' }, l: 'Apple' }], side: t.ph2Sold, val: '420€', valClass: 'green' },
                      { name: 'Sac Hermès Kelly', tags: [{ s: { background: '#FDF8F0', color: '#92400E', borderColor: '#F59E0B' }, l: t.ph2CatLuxe }, { s: { background: 'var(--teal-tint)', color: 'var(--teal-strong)', borderColor: '#9FE1CB' }, l: 'Hermès' }], side: t.ph2Buy, val: '820€', valClass: 'peach' },
                      { name: 'Polo Ralph Lauren M', tags: [{ s: { background: '#FDF2F8', color: '#9D174D', borderColor: '#F9A8D4' }, l: t.ph2CatFashion }, { s: { background: 'var(--teal-tint)', color: 'var(--teal-strong)', borderColor: '#9FE1CB' }, l: 'Ralph L.' }], side: t.ph2Sold, val: '28€', valClass: 'green' },
                    ].map(({ name, tags, side, val, valClass }) => (
                      <div key={name} className="app-inv-row">
                        <div style={{ flex: 1 }}>
                          <div className="name">{name}</div>
                          <div className="tags">{tags.map(({ s, l }) => <span key={l} className="app-tag" style={s}>{l}</span>)}</div>
                        </div>
                        <div className="right"><div className="l">{side}</div><div className={`v ${valClass}`}>{val}</div></div>
                      </div>
                    ))}
                  </div>
                  <div className="app-bnav">
                    <div className="item"><span className="ic">📊</span><span>{t.appNavDash}</span></div>
                    <div className="item on"><span className="ic">📦</span><span>{t.appNavStock}</span></div>
                    <div className="item"><span className="ic">🧮</span><span>{t.appNavCalc}</span></div>
                    <div className="item"><span className="ic">📋</span><span>{t.appNavHist}</span></div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── PLATFORMS ── */}
      <section className="lp-platforms reveal">
        <div className="lp-container platforms-head">
          <h3>{t.platformsTitle}</h3>
          <p>{t.platformsSub}</p>
        </div>
        <div className="marquee">
          <div className="marquee-track">
            {allPlatforms.map((p, i) => (
              <div key={i} className="platform-pill">
                <span className="dot"></span>
                {p.name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="lp-section lp-pricing" id="pricing">
        <div className="lp-container">
          <div className="section-head reveal">
            <span className="section-eyebrow">{t.pricingEyebrow}</span>
            <h2 className="section-title">{t.pricingTitle1}<span style={GRAD_STYLE}>{t.pricingTitleAccent}</span></h2>
            <p className="section-sub">{t.pricingSub}</p>
          </div>
          <div className="pricing-grid">
            <div className="price-card free reveal">
              <div className="price-tier">{t.freeTier}</div>
              <h3 className="price-name">{t.freeName}</h3>
              <div className="price-amount"><span className="num">0 €</span><span className="per">{t.freePer}</span></div>
              <div className="price-tagline">{t.freeTagline}</div>
              <ul className="price-features">
                <li><span className="ck">✓</span> {t.freeF1}</li>
                <li><span className="ck">✓</span> {t.freeF2}</li>
                <li><span className="ck">✓</span> {t.freeF3}</li>
                <li><span className="ck">✓</span> {t.freeF4}</li>
              </ul>
              <button className="btn btn-lg" onClick={() => { track('cta_click', { cta: 'pricing_free', page: 'landing' }); nav('/login?mode=signup'); }}>
                {t.freeBtn}
              </button>
            </div>
            <div className="price-card premium reveal delay-1">
              <div className="price-popular">{t.premiumBadge}</div>
              <div className="price-tier">{t.premiumTier}</div>
              <h3 className="price-name">{t.premiumName}</h3>
              <div className="price-amount"><span className="num">4,99 €</span><span className="per">{t.premiumPer}</span></div>
              <div className="price-tagline">{t.premiumTagline}</div>
              <ul className="price-features">
                <li><span className="ck">✓</span> <strong>{t.premiumF1}</strong></li>
                <li><span className="ck">✓</span> {t.premiumF2}</li>
                <li><span className="ck">✓</span> {t.premiumF3}</li>
                <li><span className="ck">✓</span> {t.premiumF4}</li>
                <li><span className="ck">✓</span> {t.premiumF5}</li>
              </ul>
              <button className="btn btn-white btn-lg" onClick={() => { track('cta_click', { cta: 'pricing_premium', page: 'landing' }); nav('/login'); }}>
                {t.premiumBtn}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="lp-cta-final">
        <div className="lp-container">
          <h2 className="reveal">{t.ctaTitle}</h2>
          <p className="reveal delay-1">{t.ctaSub}</p>
          <div className="reveal delay-2" style={{ display: 'flex', justifyContent: 'center' }}>
            <button className="btn btn-white btn-lg" onClick={() => { track('cta_click', { cta: 'final_cta', page: 'landing' }); nav('/login?mode=signup'); }}>
              {t.ctaBtn}
            </button>
          </div>
          <div className="micro reveal delay-3">{t.ctaMicro}</div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="lp-section lp-faq" id="faq">
        <div className="lp-container">
          <div className="section-head reveal">
            <span className="section-eyebrow">{t.faqEyebrow}</span>
            <h2 className="section-title">{t.faqTitle}</h2>
            <p className="section-sub">{t.faqSub}</p>
          </div>
          <div className="faq-list">
            {faqItems.map((item, i) => (
              <div key={i} className={`faq-item${openFaq === i ? ' open' : ''}`}>
                <button className="faq-q" onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
                  <span>{item.q}</span>
                  <span className="plus">+</span>
                </button>
                <div className="faq-a"><div className="faq-a-inner">{item.a}</div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-container footer-inner">
          <div className="footer-brand-block">
            <div className="footer-brand">
              <img src="/icon_180x180.png" alt="" />
              <span className="footer-brand-name">Fill &amp; Sell</span>
            </div>
            <p className="footer-tagline">{t.footerTagline}</p>
          </div>
          <div className="footer-links">
            <div className="footer-links-col">
              <h4>{t.footerProduct}</h4>
              <ul>
                <li><a href="#features">{t.navFeatures}</a></li>
                <li><a href="#pricing">{t.navPricing}</a></li>
                <li><a href="#faq">{t.navFaq}</a></li>
              </ul>
            </div>
            <div className="footer-links-col">
              <h4>{t.footerLegal}</h4>
              <ul>
                <li><a href="/legal">{t.footerMentions}</a></li>
                <li><a href="/legal">{t.footerPrivacy}</a></li>
                <li><a href="/legal">{t.footerCgu}</a></li>
              </ul>
            </div>
            <div className="footer-links-col">
              <h4>{t.footerContact}</h4>
              <ul>
                <li><a href="mailto:support@fillsell.app">support@fillsell.app</a></li>
                <li>
                  <a href="https://www.tiktok.com/@fill.sell" target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/></svg>
                    TikTok
                  </a>
                </li>
                <li>
                  <a href="https://x.com/fillsellapp" target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    X
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="lp-container">
          <div className="footer-copy">{t.footerCopy}</div>
        </div>
      </footer>
    </div>
  );
}
