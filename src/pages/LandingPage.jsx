import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { track } from '../analytics/analytics';
import { supabase } from '../lib/supabase';
import './landing.css';

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

const SCENES = {
  fr: [
    {
      ticker: '✓ Article ajouté',
      text: "Ajoute une veste Levi's vintage achetée 15 € au vide-grenier",
      cards: [
        { ic: '🎯', lbl: 'Intention', val: 'Ajout au stock', tag: 'Mode' },
        { ic: '🏷️', lbl: 'Article reconnu', val: "Levi's · Veste denim", tag: 'Vintage' },
        { ic: '✅', lbl: 'Action exécutée', val: 'Article ajouté à ton inventaire', tag: '15 €' },
      ],
    },
    {
      ticker: '✓ Vente enregistrée',
      text: "J'ai vendu les Nike Dunk panda 125 € sur Vinted",
      cards: [
        { ic: '🎯', lbl: 'Intention', val: 'Marquer comme vendu', tag: 'Vente' },
        { ic: '🔍', lbl: 'Article trouvé en stock', val: 'Nike Dunk Low Panda · EU 42', tag: '60 €' },
        { ic: '✅', lbl: 'Action exécutée', val: 'Vente · Vinted · sortie de stock', tag: '125 €' },
      ],
    },
    {
      ticker: '✓ 3 ventes affichées',
      text: 'Quelles sont mes 3 meilleures ventes ce mois-ci ?',
      cards: [
        { ic: '🥇', lbl: '#1 · Jordan 1 Retro High', val: 'Vendu 184 € · eBay', tag: '12 avr' },
        { ic: '🥈', lbl: '#2 · iPhone 13 Pro', val: 'Vendu 480 € · eBay', tag: '8 avr' },
        { ic: '🥉', lbl: '#3 · Sac Longchamp Pliage', val: 'Vendu 55 € · Vestiaire', tag: '2 avr' },
      ],
    },
    {
      ticker: '✓ Article supprimé',
      text: "Supprime la doudoune Uniqlo, je l'ai gardée finalement",
      cards: [
        { ic: '🎯', lbl: 'Intention', val: "Suppression d'un article", tag: 'Stock' },
        { ic: '🔍', lbl: 'Trouvé en stock', val: 'Doudoune Uniqlo Ultra Light · M', tag: '—' },
        { ic: '✅', lbl: 'Action exécutée', val: 'Article retiré de ton inventaire', tag: '−1' },
      ],
    },
    {
      ticker: '✓ 5 articles en lot',
      text: 'Ajoute 5 t-shirts Ralph Lauren taille L, 40 € le lot',
      cards: [
        { ic: '🎯', lbl: 'Intention', val: 'Ajout en lot', tag: '×5' },
        { ic: '📦', lbl: 'Lot reconnu', val: '5 × T-shirt Ralph Lauren · L', tag: '8 €/u' },
        { ic: '✅', lbl: 'Action exécutée', val: '5 articles ajoutés à ton stock', tag: '40 €' },
      ],
    },
    {
      ticker: '✓ Stock affiché',
      text: "Combien d'articles me reste-t-il en stock ?",
      cards: [
        { ic: '🎯', lbl: 'Intention', val: 'Question inventaire', tag: 'Lecture' },
        { ic: '📦', lbl: 'Stock total', val: '14 articles · valeur achat 1 240 €', tag: 'À jour' },
        { ic: '✅', lbl: 'Catégories', val: '6 mode · 4 high-tech · 3 luxe · 1 maison', tag: 'Détail' },
      ],
    },
  ],
  en: [
    {
      ticker: '✓ Item added',
      text: "Add a vintage Levi's jacket bought for £15 at a flea market",
      cards: [
        { ic: '🎯', lbl: 'Intent', val: 'Add to stock', tag: 'Fashion' },
        { ic: '🏷️', lbl: 'Item recognized', val: "Levi's · Denim jacket", tag: 'Vintage' },
        { ic: '✅', lbl: 'Action done', val: 'Item added to your inventory', tag: '£15' },
      ],
    },
    {
      ticker: '✓ Sale recorded',
      text: 'I sold the panda Nike Dunks for £125 on Vinted',
      cards: [
        { ic: '🎯', lbl: 'Intent', val: 'Mark as sold', tag: 'Sale' },
        { ic: '🔍', lbl: 'Found in stock', val: 'Nike Dunk Low Panda · EU 42', tag: '£60' },
        { ic: '✅', lbl: 'Action done', val: 'Sale · Vinted · out of stock', tag: '£125' },
      ],
    },
    {
      ticker: '✓ 3 sales shown',
      text: 'What are my 3 best sales this month?',
      cards: [
        { ic: '🥇', lbl: '#1 · Jordan 1 Retro High', val: 'Sold £184 · eBay', tag: 'Apr 12' },
        { ic: '🥈', lbl: '#2 · iPhone 13 Pro', val: 'Sold £480 · eBay', tag: 'Apr 8' },
        { ic: '🥉', lbl: '#3 · Longchamp Pliage Bag', val: 'Sold £55 · Vestiaire', tag: 'Apr 2' },
      ],
    },
    {
      ticker: '✓ Item deleted',
      text: 'Delete the Uniqlo puffer, I kept it after all',
      cards: [
        { ic: '🎯', lbl: 'Intent', val: 'Delete an item', tag: 'Stock' },
        { ic: '🔍', lbl: 'Found in stock', val: 'Uniqlo Ultra Light Puffer · M', tag: '—' },
        { ic: '✅', lbl: 'Action done', val: 'Item removed from your inventory', tag: '−1' },
      ],
    },
    {
      ticker: '✓ 5 items in batch',
      text: 'Add 5 Ralph Lauren t-shirts size L, £40 for the lot',
      cards: [
        { ic: '🎯', lbl: 'Intent', val: 'Batch add', tag: '×5' },
        { ic: '📦', lbl: 'Lot recognized', val: '5 × Ralph Lauren T-shirt · L', tag: '£8/ea' },
        { ic: '✅', lbl: 'Action done', val: '5 items added to your stock', tag: '£40' },
      ],
    },
    {
      ticker: '✓ Stock shown',
      text: 'How many items do I have left in stock?',
      cards: [
        { ic: '🎯', lbl: 'Intent', val: 'Stock query', tag: 'Read' },
        { ic: '📦', lbl: 'Total stock', val: '14 items · buy value £1,240', tag: 'Up to date' },
        { ic: '✅', lbl: 'Categories', val: '6 fashion · 4 high-tech · 3 luxury · 1 home', tag: 'Detail' },
      ],
    },
  ],
};

const T = {
  fr: {
    navFeatures: 'Fonctionnalités', navVocal: 'Vocal IA', navPricing: 'Tarifs', navFaq: 'FAQ',
    navLogin: 'Se connecter', navCta: 'Commencer gratuitement',
    heroBadge: '🎙️ Nouveau · Ajoute tes articles à la voix',
    heroTitle1: 'Parle. ', heroTitleAccent: "L'IA fait le reste.", heroTitle2: '',
    heroSub: "Ton assistant IA dans la poche. Ajoute, vends, supprime, demande tes meilleures ventes, gère un lot — à la voix. Il connaît tout ton stock et exécute en moins de 3 secondes.",
    heroCta: 'Essayer le vocal IA gratuit →', heroSecondary: 'Voir une démo',
    heroFree: 'Essai Premium 7 jours', heroNoCard: 'Sans carte bancaire', heroReady: '30 sec pour démarrer',
    heroTickerLbl: 'Action exécutée', heroTickerReady: 'Prêt',
    heroGreeting: 'Salut Léo 👋',
    stat1Label: 'Revendeurs actifs', stat2Label: 'Profits trackés',
    stat3Label: 'Satisfaction', stat4Label: 'Pour démarrer',
    featEyebrow: 'Fonctionnalités',
    featTitle1: "Tout ce qu'il te faut pour ", featTitleAccent: 'vendre plus malin',
    featSub: "Un outil simple, conçu par des revendeurs pour des revendeurs. Ajoute, calcule, vends — Fill & Sell s'occupe du reste.",
    f1Title: 'Suivi automatique',
    f1Desc: 'Ajoute tes articles en quelques secondes. Fill & Sell calcule tes marges automatiquement.',
    f1Header: '📦 Mon stock · 14 articles', f1Add: '+ Ajouter', f1BuyLabel: 'Achat → Vente',
    f1CatFashion: '👗 Mode', f1CatTech: '📱 High-Tech', f1CatLuxe: '💎 Luxe',
    f1LocLevis: 'Portant 1', f1LocIphone: 'Étagère garage', f1LocHermes: 'Sac Vinted prêt', f1LocPolo: 'Carton cave',
    f1DescLevis: '📏 Taille M', f1DescIphone: '💾 128 Go · Noir', f1DescHermes: '🎨 Cuir caramel · 28cm', f1DescPolo: '📏 Taille L · Blanc',
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
    f6AiFeature: '✦ Analyse IA de tes tendances',
    f6AiBullet2: '✦ Conseil IA vocal sur ton business',
    f6AiBullet3: '✦ Catégories et marques les plus rentables',
    f6AiMockup: '🤖 Analyse IA · Luxe performe 2× mieux ce mois',
    f7Title: 'Lens',
    f7Desc: "Prends en photo ton article. L'IA identifie la marque, l'état, et te donne une estimation de prix en temps réel.",
    freeF6: '📸 Lens · 3/jour · 15/mois · estimation visuelle uniquement',
    premiumF7: '📸 Lens Pro · 5/jour · 60/mois · prix marché en direct',
    lens_badge: 'NOUVEAU',
    lens_title: 'Lens',
    lens_desc: "Prends en photo ton article. L'IA identifie la marque, l'état, et te donne une estimation de prix en temps réel.",
    lens_result_title: 'Patagonia · T-shirt · Taille L · État : Bon',
    lens_result_price: '18 – 22 €',
    lens_result_recommended: 'Prix recommandé : 20 €',
    lens_result_platforms: 'Vinted · eBay · Leboncoin',
    lens_result_category: 'Outdoor · Casual',
    lens_result_state: 'État : Bon',
    lens_result_demand: 'Demande régulière · Se vend en < 5 jours',
    lens_result_tip: "Photo sur fond blanc recommandée pour ce type d'article",
    lens_result_slot_plus: '+',
    lens_add_stock: 'Ajouter au stock',
    lens_premium_badge: '⭐ PREMIUM · Prix marché en direct',
    lens_margin: '+8 € marge estimée',
    lens_ai_analysis: '🤖 Patagonia outdoor bien coté · tendance stable · vend mieux en automne',
    pricing_free_lens: '📸 Lens · 3/jour · 15/mois · estimation visuelle uniquement',
    pricing_premium_lens: '📸 Lens Pro · 5/jour · 60/mois · prix marché en direct',
    pricing_premium_suffix: 'puis 9,99 €/mois · Sans engagement.',
    stats_ai_line: '🤖 Analyse IA · Luxe performe 2× mieux ce mois',
    faq_lens_question: 'Comment fonctionne la fonction Lens ?',
    faq_lens_answer: "Tu prends jusqu'à 5 photos de ton article directement depuis l'app. L'IA analyse les visuels, identifie la marque, l'état et la catégorie, puis te suggère un prix de vente basé sur le marché actuel. Lens fonctionne en français et en anglais, dans 30 pays.",
    showcaseEyebrow: 'Aperçu',
    showcaseTitle1: 'Visualise tes profits ', showcaseTitleAccent: "en un coup d'œil",
    showcaseSub: "Une interface pensée pour le mobile. Toutes tes données importantes, là où tu en as besoin.",
    ph1CalcTitle: '🧮 Calcule ta marge', ph1CalcSub: 'Entre les prix ci-dessous',
    ph1BuyPrice: "Prix d'achat", ph1SellPrice: 'Prix de vente', ph1Fees: 'Frais annexes', ph1Verdict: 'Belle marge 💪',
    ph2Stock: '📦 Mon stock', ph2Search: 'Rechercher un article…',
    ph2All: 'Tout · 14', ph2Fashion: '👗 Mode · 6', ph2Tech: '📱 Tech · 3', ph2Luxe: '💎 Luxe · 2',
    ph2Buy: 'Achat', ph2Sold: 'Vendu', ph2CatFashion: '👗 Mode', ph2CatTech: '📱 Tech', ph2CatLuxe: '💎 Luxe',
    platformsTitle: 'Compatible avec toutes tes plateformes', platformsSub: 'Suis tes ventes, peu importe où tu vends.',
    vocalEyebrow: 'Comment ça marche',
    vocalTitle: '3 secondes. ', vocalTitleAccent: 'Une seule phrase.',
    vocalSub: 'De la voix au stock prêt à vendre — sans formulaire, sans recherche, sans calcul à la main.',
    step1Title: 'Tu parles',
    step1Desc: "Appuie sur le micro et décris ton article comme tu en parlerais à un pote. Aucun champ à remplir.",
    step2Title: "L'IA classe",
    step2Desc: "Marque, catégorie, état, prix d'achat — extraits automatiquement. Marge calculée dès que tu rentres la vente.",
    step3Title: 'Tracké · prêt à vendre',
    step3Desc: "Article ajouté au stock, marge estimée, ROI calculé. Tu peux passer au suivant ou publier directement.",
    tabDashboard: 'Tableau', tabStockIA: 'Stock IA', tabLens: 'Lens', tabVentes: 'Ventes', tabStats: 'Stats',
    detectTitle: 'Ce que l\'IA détecte ', detectTitleAccent: 'automatiquement',
    detectSub: "Une seule phrase suffit. L'IA extrait toutes les infos utiles — sans que tu aies à y penser.",
    chips: [
      { ico: '🏷️', lbl: 'Marque', ex: "Levi's, Nike, Apple" },
      { ico: '📦', lbl: 'Catégorie', ex: 'Veste, sneakers, sac' },
      { ico: '💰', lbl: "Prix d'achat", ex: '15 €, à 20 balles' },
      { ico: '⭐', lbl: 'État', ex: 'Neuf, très bon, usé' },
      { ico: '📈', lbl: 'Marge', ex: 'Calculée à la vente' },
      { ico: '📍', lbl: "Lieu d'achat", ex: 'Vide-grenier, friperie' },
      { ico: '📅', lbl: 'Date', ex: "Aujourd'hui, hier" },
      { ico: '🎨', lbl: 'Couleur', ex: 'Bleu indigo, beige' },
      { ico: '📏', lbl: 'Taille', ex: 'M, 42, EU 38' },
      { ico: '🌍', lbl: 'Plateforme cible', ex: 'Vinted, eBay, Vestiaire' },
      { ico: '⚡', lbl: 'Marge estimée', ex: '+23 € · 55 %' },
      { ico: '🗂️', lbl: 'Emplacement', ex: 'Portant, carton cave, bac brocante' },
    ],
    badLabel: 'Sans Vocal IA', badTitle: '~ 2 min par article',
    badTime: 'Saisie manuelle, recherche prix, copier-coller',
    badItems: [
      'Tu ouvres le formulaire, tu remplis 8 champs',
      'Tu copies-colles tout dans Excel',
      'Tu calcules ta marge à la main',
      'Tu lâches au bout de 10 articles',
      '30 articles = 1 h de saisie',
    ],
    goodLabel: 'Avec Vocal IA', goodTitle: '~ 3 sec par article',
    goodTime: "Tu parles, c'est dans le stock",
    goodItems: [
      "Une phrase, l'IA fait le reste",
      'Stock structuré, exportable Excel en 1 tap',
      'Marge & ROI calculés en direct',
      'Tu peux saisir 30 articles en 90 secondes',
      'Tu vends pendant que les autres saisissent',
    ],
    testimonials: [
      { quote: "J'ai vidé mon entrepôt de 200 articles en un samedi. Je dicte l'article, la marque, le prix et l'emplacement d'un coup. Avant, j'aurais mis trois soirées rien que pour la saisie. Le vocal IA, c'est game over pour les concurrents.", avatar: 'AM', name: 'Antoine M.', role: 'Power-seller · Vinted Pro · 4 800 ventes' },
      { quote: "Je revends en sortant des friperies. Je dicte direct dans la voiture et tout est prêt avant d'arriver chez moi. Plus jamais sans.", avatar: 'SL', name: 'Sarah L.', role: 'Friperie en ligne · 1 200 articles/an' },
      { quote: "Je dicte le prix d'achat, l'IA classe l'article et calcule ma marge dès que je rentre la vente. Plus de tableurs, plus de calculs à la main.", avatar: 'JD', name: 'Julien D.', role: 'Reseller luxe · Vestiaire Collective' },
    ],
    voiceCtaTitle: 'Essaie le vocal IA gratuitement',
    voiceCtaSub: 'Sans carte bancaire. Essaie gratuitement, sans engagement.',
    voiceCtaBtn: 'Activer le vocal IA →',
    pricingEyebrow: 'Tarifs',
    pricingTitle1: 'Choisis le plan qui te ', pricingTitleAccent: 'correspond',
    pricingSub: "Commence gratuitement. Sans carte bancaire, sans engagement.",
    freeTier: 'Gratuit', freeName: 'Pour démarrer', freePer: '/ toujours',
    freeTagline: 'Tout le nécessaire pour suivre tes premières ventes.',
    freeF1: '20 articles en stock maximum', freeF2: 'Dashboard & stats',
    freeF3: 'Calculateur de marge avec analyse IA', freeF4: 'Historique des ventes',
    freeF5: '🎙️ IA vocale · 5 commandes/jour',
    freeBtn: 'Commencer gratuitement',
    premiumBadge: '⭐ Le plus populaire', premiumTier: 'Premium', premiumName: 'Pour aller plus loin',
    premiumPer: '/ mois', premiumTagline: 'puis 9,99 €/mois · Sans engagement.',
    premiumTrialBadge: "7 jours gratuits · Sans CB",
    premiumF2: 'Stock illimité', premiumF3: '🎙️ IA vocale illimitée',
    premiumF4: 'Stats avancées analysées par IA', premiumF5: 'Import / Export Excel',
    premiumF6: 'Support prioritaire',
    premiumBtn: "Commencer l'essai gratuit ✨",
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
    navFeatures: 'Features', navVocal: 'Voice AI', navPricing: 'Pricing', navFaq: 'FAQ',
    navLogin: 'Log in', navCta: 'Start for free',
    heroBadge: '🎙️ New · Add your items by voice',
    heroTitle1: 'Speak. ', heroTitleAccent: 'AI does the rest.', heroTitle2: '',
    heroSub: "Your AI assistant in your pocket. Add, sell, delete, ask your best sales, manage a batch — by voice. It knows your entire stock and executes in under 3 seconds.",
    heroCta: 'Try Voice AI free →', heroSecondary: 'See a demo',
    heroFree: '7-day Premium trial', heroNoCard: 'No credit card', heroReady: '30 sec to start',
    heroTickerLbl: 'Action done', heroTickerReady: 'Ready',
    heroGreeting: 'Hey Leo 👋',
    stat1Label: 'Active resellers', stat2Label: 'Tracked profits',
    stat3Label: 'Satisfaction', stat4Label: 'To get started',
    featEyebrow: 'Features',
    featTitle1: 'Everything you need to ', featTitleAccent: 'sell smarter',
    featSub: "A simple tool, built by resellers for resellers. Add, calculate, sell — Fill & Sell handles the rest.",
    f1Title: 'Automatic tracking',
    f1Desc: 'Add your items in seconds. Fill & Sell calculates your margins automatically.',
    f1Header: '📦 My stock · 14 items', f1Add: '+ Add', f1BuyLabel: 'Buy → Sell',
    f1CatFashion: '👗 Fashion', f1CatTech: '📱 High-Tech', f1CatLuxe: '💎 Luxury',
    f1LocLevis: 'Rail 1', f1LocIphone: 'Garage shelf', f1LocHermes: 'Ready Vinted bag', f1LocPolo: 'Storage box',
    f1DescLevis: '📏 Size M', f1DescIphone: '💾 128GB · Black', f1DescHermes: '🎨 Caramel leather · 28cm', f1DescPolo: '📏 Size L · White',
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
    f6AiFeature: '✦ AI analysis of your trends',
    f6AiBullet2: '✦ AI voice coaching on your business',
    f6AiBullet3: '✦ Most profitable categories & brands',
    f6AiMockup: '🤖 AI Analysis · Luxury is 2× better performing this month',
    f7Title: 'Lens',
    f7Desc: 'Take a photo of your item. AI identifies the brand, condition, and gives you a real-time price estimate.',
    freeF6: '📸 Lens · 3/day · 15/month · visual estimate only',
    premiumF7: '📸 Lens Pro · 5/day · 60/month · live market price',
    lens_badge: 'NEW',
    lens_title: 'Lens',
    lens_desc: 'Photo your item. AI identifies the brand, condition, and gives you a real-time price estimate.',
    lens_result_title: 'Patagonia · T-shirt · Size L · Condition: Good',
    lens_result_price: '18 – 22 €',
    lens_result_recommended: 'Recommended price: 20 €',
    lens_result_platforms: 'Vinted · eBay · Leboncoin',
    lens_result_category: 'Outdoor · Casual',
    lens_result_state: 'Condition: Good',
    lens_result_demand: 'Steady demand · Sells in < 5 days',
    lens_result_tip: 'White background photo recommended for this item',
    lens_result_slot_plus: '+',
    lens_add_stock: 'Add to stock',
    lens_premium_badge: '⭐ PREMIUM · Live market price',
    lens_margin: '+8 € estimated margin',
    lens_ai_analysis: '🤖 Well-rated Patagonia outdoor · stable trend · sells better in autumn',
    pricing_free_lens: '📸 Lens · 3/day · 15/mo · visual estimate only',
    pricing_premium_lens: '📸 Lens Pro · 5/day · 60/mo · live market price',
    pricing_premium_suffix: 'then €9.99/month · No commitment.',
    stats_ai_line: '🤖 AI Analysis · Luxury is 2× better performing this month',
    faq_lens_question: 'How does the Lens feature work?',
    faq_lens_answer: 'Take up to 5 photos of your item directly from the app. AI analyzes the visuals, identifies the brand, condition and category, then suggests a selling price based on the current market. Lens works in French and English, across 30 countries.',
    showcaseEyebrow: 'Preview',
    showcaseTitle1: 'Visualize your profits ', showcaseTitleAccent: 'at a glance',
    showcaseSub: "A mobile-first interface. All your important data, right where you need it.",
    ph1CalcTitle: '🧮 Calculate your margin', ph1CalcSub: 'Enter the prices below',
    ph1BuyPrice: 'Buy price', ph1SellPrice: 'Sell price', ph1Fees: 'Other fees', ph1Verdict: 'Great margin 💪',
    ph2Stock: '📦 My stock', ph2Search: 'Search for an item…',
    ph2All: 'All · 14', ph2Fashion: '👗 Fashion · 6', ph2Tech: '📱 Tech · 3', ph2Luxe: '💎 Luxury · 2',
    ph2Buy: 'Buy', ph2Sold: 'Sold', ph2CatFashion: '👗 Fashion', ph2CatTech: '📱 Tech', ph2CatLuxe: '💎 Luxury',
    platformsTitle: 'Compatible with all your platforms', platformsSub: 'Track your sales, wherever you sell.',
    vocalEyebrow: 'How it works',
    vocalTitle: '3 seconds. ', vocalTitleAccent: 'One sentence.',
    vocalSub: 'From voice to stock ready to sell — no form, no search, no manual calculation.',
    step1Title: 'You speak',
    step1Desc: "Press the mic and describe your item like you'd tell a friend. No field to fill in.",
    step2Title: 'AI classifies',
    step2Desc: "Brand, category, condition, buy price — extracted automatically. Margin calculated when you record the sale.",
    step3Title: 'Tracked · ready to sell',
    step3Desc: "Item added to stock, margin estimated, ROI calculated. Move on to the next one or publish directly.",
    tabDashboard: 'Dashboard', tabStockIA: 'AI Stock', tabLens: 'Lens', tabVentes: 'Sales', tabStats: 'Stats',
    detectTitle: 'What AI detects ', detectTitleAccent: 'automatically',
    detectSub: "One sentence is enough. AI extracts all useful info — without you having to think about it.",
    chips: [
      { ico: '🏷️', lbl: 'Brand', ex: "Levi's, Nike, Apple" },
      { ico: '📦', lbl: 'Category', ex: 'Jacket, sneakers, bag' },
      { ico: '💰', lbl: 'Buy price', ex: '£15, bought for 20' },
      { ico: '⭐', lbl: 'Condition', ex: 'New, very good, worn' },
      { ico: '📈', lbl: 'Margin', ex: 'Calculated at sale' },
      { ico: '📍', lbl: 'Buy location', ex: 'Flea market, thrift store' },
      { ico: '📅', lbl: 'Date', ex: 'Today, yesterday' },
      { ico: '🎨', lbl: 'Color', ex: 'Indigo blue, beige' },
      { ico: '📏', lbl: 'Size', ex: 'M, 42, EU 38' },
      { ico: '🌍', lbl: 'Target platform', ex: 'Vinted, eBay, Vestiaire' },
      { ico: '⚡', lbl: 'Est. margin', ex: '+£23 · 55 %' },
      { ico: '🗂️', lbl: 'Location', ex: 'Rail, storage box, market bin' },
    ],
    badLabel: 'Without Voice AI', badTitle: '~ 2 min per item',
    badTime: 'Manual entry, price search, copy-paste',
    badItems: [
      'Open the form, fill in 8 fields',
      'Copy-paste everything into Excel',
      'Calculate your margin by hand',
      'Give up after 10 items',
      '30 items = 1 hour of entry',
    ],
    goodLabel: 'With Voice AI', goodTitle: '~ 3 sec per item',
    goodTime: "You speak, it's in the stock",
    goodItems: [
      'One sentence, AI does the rest',
      'Structured stock, Excel export in 1 tap',
      'Margin & ROI calculated live',
      'You can add 30 items in 90 seconds',
      'You sell while others are still typing',
    ],
    testimonials: [
      { quote: "I cleared 200 items in one Saturday. I dictate the item, brand, price and storage location in one shot. Before, that would've taken three evenings just for data entry. AI voice is game over for the competition.", avatar: 'AM', name: 'Antoine M.', role: 'Power-seller · Vinted Pro · 4,800 sales' },
      { quote: "I resell straight from thrift stores. I dictate in the car and everything's ready before I get home. Never going back.", avatar: 'SL', name: 'Sarah L.', role: 'Online thrift store · 1,200 items/year' },
      { quote: "I dictate the buy price, AI classifies the item and calculates my margin when I record the sale. No more spreadsheets, no more manual calculations.", avatar: 'JD', name: 'Julien D.', role: 'Luxury reseller · Vestiaire Collective' },
    ],
    voiceCtaTitle: 'Try Voice AI for free',
    voiceCtaSub: 'No credit card. Try free, no commitment.',
    voiceCtaBtn: 'Activate Voice AI →',
    pricingEyebrow: 'Pricing',
    pricingTitle1: 'Choose the plan that ', pricingTitleAccent: 'fits you',
    pricingSub: "Start for free. No credit card, no commitment.",
    freeTier: 'Free', freeName: 'To get started', freePer: '/ forever',
    freeTagline: 'Everything you need to track your first sales.',
    freeF1: '20 items in stock maximum', freeF2: 'Dashboard & stats',
    freeF3: 'Margin calculator with AI analysis', freeF4: 'Sales history',
    freeF5: '🎙️ AI voice · 5 commands/day',
    freeBtn: 'Start for free',
    premiumBadge: '⭐ Most popular', premiumTier: 'Premium', premiumName: 'To go further',
    premiumPer: '/ month', premiumTagline: 'then €9.99/month · No commitment.',
    premiumTrialBadge: '7 days free · No charge today',
    premiumF2: 'Unlimited stock', premiumF3: '🎙️ Unlimited AI voice',
    premiumF4: 'Advanced AI-powered stats', premiumF5: 'Import / Export Excel',
    premiumF6: 'Priority support',
    premiumBtn: 'Start your free trial ✨',
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

const FAQ_ITEMS = {
  fr: [
    { q: 'Comment fonctionne le Vocal IA ?', a: "Tu appuies sur le micro et tu décris ton article naturellement (\"veste Levi's vintage achetée 15 € en friperie\"). L'IA transcrit, identifie marque, catégorie, état, taille, couleur et prix d'achat, puis l'ajoute à ton stock. Le tout en moins de 3 secondes — fonctionne en français et en anglais." },
    { q: 'Puis-je organiser mon stock par emplacement ?', a: "Oui. Tu peux dicter ou saisir l'emplacement de chaque article — portant, carton cave, bac brocante, étagère garage. L'emplacement s'affiche sur chaque article dans ton stock et tu peux le mettre à jour vocalement : 'range la veste dans le portant 2'." },
    { q: 'Comment fonctionne la fonction Lens ?', a: "Tu prends jusqu'à 5 photos de ton article directement depuis l'app. L'IA identifie la marque, le modèle, la taille et l'état, puis te donne une fourchette de prix de revente basée sur le marché actuel — avec les meilleures plateformes et un conseil concret. En version gratuite : 3 analyses/jour · 15/mois (estimation visuelle uniquement). En Premium : 5/jour · 60/mois avec prix marché en direct." },
    { q: 'Le Vocal IA est-il fiable sur les marques de luxe ?', a: "Oui — l'IA est entraînée sur les marques de luxe (Hermès, Chanel, Louis Vuitton, etc.) et reconnaît même les modèles spécifiques à partir d'une description partielle. Tu peux toujours corriger avant validation. Précision moyenne : 94 % sur catégorie + marque à partir d'une phrase courte." },
    { q: 'Fill & Sell est-il gratuit ?', a: "Oui, le plan gratuit est permanent. Il inclut jusqu'à 20 articles, 5 commandes vocales/jour, 3 analyses Lens/jour · 15/mois et toutes les stats. Le plan Premium à 9,99 €/mois débloque les articles illimités, le vocal illimité, Lens Pro avec prix marché en direct, l'export Excel et les stats avancées." },
    { q: 'Quelles plateformes sont compatibles ?', a: 'Toutes les grandes plateformes de revente : Vinted, eBay, Depop, Leboncoin, Beebeep, Facebook Marketplace, Poshmark, Mercari, Wallapop, Vestiaire Collective, GOAT, StockX. Tu peux étiqueter tes ventes par plateforme pour suivre tes meilleurs canaux.' },
    { q: 'Comment calculer ma marge sur Vinted ?', a: "Avec le calculateur intégré, tu entres simplement le prix d'achat, le prix de vente et les frais (commission Vinted, livraison, emballage). Fill & Sell calcule ton bénéfice net et ton pourcentage de marge en temps réel — avant même que tu valides ton achat." },
    { q: 'Puis-je importer et exporter mes données en Excel ?', a: 'Oui, avec un compte Premium tu peux importer ton stock existant depuis un fichier Excel ou CSV, et exporter toutes tes données quand tu veux. Tu gardes le contrôle total sur tes informations — elles sont à toi.' },
    { q: 'Fill & Sell fonctionne-t-il sur mobile ?', a: "Bien sûr — Fill & Sell est conçu mobile-first. L'app marche dans ton navigateur sur iPhone et Android, et une version iOS native est disponible sur l'App Store. Tes données se synchronisent entre tous tes appareils." },
  ],
  en: [
    { q: 'How does Voice AI work?', a: 'You press the mic and describe your item naturally ("vintage Levi\'s jacket bought for £15 at a flea market"). AI transcribes, identifies brand, category, condition, size, color and buy price, then adds it to your stock. All in under 3 seconds — works in French and English.' },
    { q: 'Can I organise my stock by storage location?', a: "Yes. You can dictate or type the location of each item — clothing rail, storage box, market bin, garage shelf. The location shows on each item in your stock and you can update it by voice anytime: 'move the jacket to rail 2'." },
    { q: 'How does the Lens feature work?', a: 'Take up to 5 photos of your item directly from the app. The AI identifies the brand, model, size and condition, then gives you a resale price range based on the current market — with the best platforms and a concrete tip. Free plan: 3 analyses/day · 15/month (visual estimate only). Premium: 5/day · 60/month with live market prices.' },
    { q: 'Is Voice AI reliable for luxury brands?', a: "Yes — AI is trained on luxury brands (Hermès, Chanel, Louis Vuitton, etc.) and recognizes even specific models from a partial description. You can always correct before confirming. Average accuracy: 94% on category + brand from a short sentence." },
    { q: 'Is Fill & Sell free?', a: 'Yes, the free plan is permanent. It includes up to 20 items, 5 voice commands/day, 3 Lens analyses/day · 15/month and all stats. The Premium plan at €9.99/month unlocks unlimited items, unlimited voice, Lens Pro with live market prices, Excel export and advanced stats.' },
    { q: 'Which platforms are compatible?', a: 'All major resale platforms: Vinted, eBay, Depop, Leboncoin, Beebeep, Facebook Marketplace, Poshmark, Mercari, Wallapop, Vestiaire Collective, GOAT, StockX. You can tag your sales by platform to track your best channels.' },
    { q: 'How do I calculate my margin on Vinted?', a: 'With the built-in calculator, you simply enter the buy price, sell price and fees (Vinted commission, shipping, packaging). Fill & Sell calculates your net profit and margin percentage in real time — before you even confirm your purchase.' },
    { q: 'Can I import and export my data to Excel?', a: "Yes, with a Premium account you can import your existing stock from an Excel or CSV file, and export all your data whenever you want. You keep full control over your information — it's yours." },
    { q: 'Does Fill & Sell work on mobile?', a: 'Of course — Fill & Sell is built mobile-first. The app works in your browser on iPhone and Android, and a native iOS version is available on the App Store. Your data syncs across all your devices.' },
  ],
};

const GRAD_STYLE = { background: 'var(--grad)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' };
const TEAL_GRAD_STYLE = { background: 'linear-gradient(135deg,#4ECDC4,#E8956D)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' };

export default function LandingPage() {
  const nav = useNavigate();
  const [lang, setLang] = useState(getBrowserLang);
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [slotsRemaining, setSlotsRemaining] = useState(null);

  const vpTextRef = useRef(null);
  const vpStackRef = useRef(null);
  const tickerRef = useRef(null);

  const t = T[lang];
  const faqItems = FAQ_ITEMS[lang];
  const allPlatforms = [...PLATFORMS, ...PLATFORMS];

  useEffect(() => { track('page_view', { page: 'landing' }); }, []);
  useEffect(() => { localStorage.setItem('fs_lang', lang); }, [lang]);

  useEffect(() => {
    const FC_KEY = 'fs_founder_config';
    const FC_TTL = 5 * 60 * 1000;
    try {
      const c = JSON.parse(localStorage.getItem(FC_KEY) || 'null');
      if (c && Date.now() - c.ts < FC_TTL) {
        if (c.data) setSlotsRemaining(c.data.slots_total - c.data.slots_used);
        return;
      }
    } catch {}
    supabase.from('founder_config').select('slots_total,slots_used').eq('id', 1).maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) {
          setSlotsRemaining(data.slots_total - data.slots_used);
          try { localStorage.setItem(FC_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
        }
      });
  }, []);

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

  /* Voice animation */
  useEffect(() => {
    const vpText = vpTextRef.current;
    const vpStack = vpStackRef.current;
    const ticker = tickerRef.current;
    if (!vpText || !vpStack || !ticker) return;

    let running = true;
    let idx = 0;
    const currentScenes = SCENES[lang];
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    async function typeText(text) {
      vpText.textContent = '';
      for (let i = 0; i < text.length; i++) {
        if (!running) return;
        vpText.textContent += text[i];
        await sleep(26 + Math.random() * 20);
      }
    }

    function buildCard({ ic, lbl, val, tag }) {
      const el = document.createElement('div');
      el.className = 'vp-card';
      el.innerHTML = `<div class="ic">${ic}</div><div class="body"><div class="lbl">${lbl}</div><div class="val">${val}</div></div><div class="tag">${tag}</div>`;
      return el;
    }

    async function playScene(scene) {
      if (!running) return;
      vpStack.innerHTML = '';
      await typeText(scene.text);
      if (!running) return;
      await sleep(360);
      for (let i = 0; i < scene.cards.length - 1; i++) {
        if (!running) return;
        const card = buildCard(scene.cards[i]);
        vpStack.appendChild(card);
        requestAnimationFrame(() => card.classList.add('in'));
        await sleep(260);
      }
      if (!running) return;
      await sleep(180);
      const last = scene.cards[scene.cards.length - 1];
      const success = buildCard(last);
      success.classList.add('success');
      const ic = success.querySelector('.ic');
      const tag = success.querySelector('.tag');
      if (ic) ic.style.background = 'rgba(255,255,255,0.18)';
      if (tag) { tag.style.background = 'rgba(255,255,255,0.22)'; tag.style.color = 'white'; }
      vpStack.appendChild(success);
      requestAnimationFrame(() => success.classList.add('in'));
      ticker.textContent = scene.ticker;
      if (!running) return;
      await sleep(3200);
    }

    async function loop() {
      while (running) {
        await playScene(currentScenes[idx % currentScenes.length]);
        idx++;
        if (running) await sleep(280);
      }
    }

    loop();
    return () => { running = false; };
  }, [lang]);

  function changeLang(code) {
    setLang(code);
    localStorage.setItem('fs_lang', code);
    track('change_language', { language: code });
  }

  return (
    <div>
      {/* ── NAV ── */}
      <nav className={`lp-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <button className="lp-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <img src="/icon_180x180.png" alt="Fill & Sell logo" />
            <span className="lp-brand-name">Fill &amp; Sell</span>
          </button>
          <div className="lp-nav-links">
            <a className="lp-nav-link" href="#features">{t.navFeatures}</a>
            <a className="lp-nav-link" href="#vocal">{t.navVocal}</a>
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
            <button className="btn btn-primary nav-cta-btn"
              onClick={() => { track('cta_click', { cta: 'nav_signup', page: 'landing' }); nav('/login?mode=signup'); }}>
              {t.navCta}
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO (voice phone) ── */}
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
            <p style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 500, margin: '6px 0 10px', lineHeight: 1.5 }}>
              {lang === 'fr'
                ? "L'application pour revendeurs avec IA vocale. Suivez votre stock et vos profits automatiquement."
                : "The reseller app with AI voice. Track your stock and profits automatically."}
            </p>
            <a href="https://apps.apple.com/app/id6762152785" target="_blank" rel="noopener">
              <img
                src={lang === 'fr'
                  ? 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/fr-fr'
                  : 'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us'}
                alt={lang === 'fr' ? 'Télécharger sur l\'App Store' : 'Download on the App Store'}
                height="54"
                loading="eager"
                style={{ borderRadius: 13, display: 'block', marginBottom: 14 }}
              />
            </a>
            <p className="lp-hero-sub reveal delay-2">{t.heroSub}</p>
            <div className="lp-hero-ctas reveal delay-3">
              <button className="btn btn-grad btn-lg"
                onClick={() => { track('cta_click', { cta: 'hero_signup', page: 'landing' }); nav('/login?mode=signup'); }}>
                {t.heroCta}
              </button>
              <button className="btn btn-ghost btn-lg" style={{ border: '1.5px solid rgba(0,0,0,0.1)' }}
                onClick={() => document.getElementById('vocal')?.scrollIntoView({ behavior: 'smooth' })}>
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
            <div className="lp-iphone lp-iphone-voice">
              <div className="glow glow-voice"></div>
              <div className="lp-iphone-notch"></div>
              <div className="lp-iphone-screen" style={{ background: 'linear-gradient(180deg,#FAFAF8 0%,#F0F4F2 100%)' }}>
                <div className="vp-statusbar">
                  <span>9:41</span>
                  <span className="icons">
                    <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><rect x="0" y="6" width="2.5" height="5" rx="0.5"/><rect x="3.8" y="4" width="2.5" height="7" rx="0.5"/><rect x="7.6" y="2" width="2.5" height="9" rx="0.5"/><rect x="11.4" y="0" width="2.5" height="11" rx="0.5"/></svg>
                    <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor"><path d="M7 9.5L0 3a10 10 0 0114 0L7 9.5z"/></svg>
                    <svg width="22" height="11" viewBox="0 0 22 11"><rect x="0.5" y="0.5" width="18" height="10" rx="2.5" fill="none" stroke="currentColor"/><rect x="2" y="2" width="15" height="7" rx="1" fill="currentColor"/><rect x="19.5" y="3.5" width="1.5" height="4" rx="0.7" fill="currentColor"/></svg>
                  </span>
                </div>
                <div className="vp-header">
                  <img src="/icon_180x180.png" alt="" loading="lazy" />
                  <span className="name">Fill &amp; Sell</span>
                </div>
                <div className="vp-content">
                  <div className="vp-greeting">{t.heroGreeting}</div>
                  <div className="vp-prompt">
                    <span ref={vpTextRef}></span><span className="typing"></span>
                  </div>
                  <div className="vp-detected-stack" ref={vpStackRef}></div>
                  <div className="vp-bottom">
                    <div className="vp-wave">
                      {Array.from({ length: 14 }).map((_, i) => <span key={i}></span>)}
                    </div>
                    <div className="vp-mic">🎙️</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="hero-ticker">
              <span className="pulse"></span>
              <span className="lbl">{t.heroTickerLbl}</span>
              <span className="val" ref={tickerRef}>{t.heroTickerReady}</span>
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
                  { name: "Veste Levi's vintage", catClass: 'cat-fashion', catLabel: t.f1CatFashion, brand: "Levi's", buy: '15€', sell: '42€', loc: t.f1LocLevis, desc: t.f1DescLevis },
                  { name: 'iPhone 12 Pro 128Go', catClass: 'cat-tech', catLabel: t.f1CatTech, brand: 'Apple', buy: '280€', sell: '420€', loc: t.f1LocIphone, desc: t.f1DescIphone },
                  { name: 'Sac Hermès Kelly', catClass: 'cat-luxe', catLabel: t.f1CatLuxe, brand: 'Hermès', buy: '820€', sell: '1240€', loc: t.f1LocHermes, desc: t.f1DescHermes },
                  { name: 'Polo Ralph Lauren', catClass: 'cat-fashion', catLabel: t.f1CatFashion, brand: 'Ralph Lauren', buy: '8€', sell: '28€', loc: t.f1LocPolo, desc: t.f1DescPolo },
                ].map(({ name, catClass, catLabel, brand, buy, sell, loc, desc }) => (
                  <div key={name} className="mini-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{name}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                        <span className={`mini-cat ${catClass}`}>{catLabel}</span>
                        <span className="mini-cat" style={{ background: 'var(--teal-tint)', color: 'var(--teal-strong)', borderColor: '#9FE1CB' }}>{brand}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
                        <span className="mini-cat" style={{ background: '#F3F4F6', color: '#6B7280', borderColor: '#E5E7EB' }}>📍 {loc}</span>
                        <span className="mini-cat" style={{ background: '#F3F4F6', color: '#6B7280', borderColor: '#E5E7EB' }}>{desc}</span>
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
                    <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 6 }}>{t.appProfitLbl || 'Profit net'}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--teal-strong)', letterSpacing: '-0.03em', lineHeight: 1, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>+847 €</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--teal-strong)', marginTop: 4 }}>↑ +38% {t.f2VsMois}</div>
                  </div>
                  <div style={{ background: 'var(--bg-warm)', padding: 14, borderRadius: 12 }}>
                    <div style={{ fontSize: 18 }}>📈</div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 6 }}>{t.appMarginLbl || 'Marge moy.'}</div>
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
                    <defs><linearGradient id="g1" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#1D9E75" stopOpacity="0.35"/><stop offset="100%" stopColor="#1D9E75" stopOpacity="0"/></linearGradient></defs>
                    <path d="M 0 70 Q 40 60 60 55 T 120 45 T 180 30 T 240 22 L 280 12 L 280 90 L 0 90 Z" fill="url(#g1)"/>
                    <path d="M 0 70 Q 40 60 60 55 T 120 45 T 180 30 T 240 22 L 280 12" stroke="#1D9E75" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                    <circle cx="280" cy="12" r="4" fill="#1D9E75"/>
                    <circle cx="280" cy="12" r="8" fill="#1D9E75" opacity="0.2"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>

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

          <div className="lp-feature reveal">
            <div className="feature-copy">
              <span className="feature-tag" style={{ background: 'linear-gradient(135deg,#3EACA8,#E8956D)', color: '#fff' }}>📸 {t.lens_badge}</span>
              <div className="feature-icon-wrap">📸</div>
              <h3 className="feature-title">{t.lens_title}</h3>
              <p className="feature-desc">{t.lens_desc}</p>
            </div>
            <div className="feature-mock">
              <div className="mini-screen" style={{ maxWidth: 520, padding: '28px' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <div style={{ flex: 1, height: 120, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(62,172,160,0.2)' }}>
                    <img src="/pata1.jpg" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Analyse Lens IA Fill &amp; Sell - T-shirt Patagonia" loading="lazy" />
                  </div>
                  <div style={{ flex: 1, height: 120, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(62,172,160,0.2)' }}>
                    <img src="/pata2.jpg" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Résultat analyse prix marché Fill &amp; Sell" loading="lazy" />
                  </div>
                  <div style={{ flex: 1, height: 120, borderRadius: 12, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: '#aaa', border: '1px dashed #ccc' }}>{t.lens_result_slot_plus}</div>
                </div>
                <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>🔍 {t.lens_result_title}</div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, background: 'linear-gradient(135deg,#3EACA8,#E8956D)', color: '#fff', borderRadius: 20, padding: '3px 9px' }}>{t.lens_premium_badge}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    <span style={{ display: 'inline-block', background: 'var(--teal-tint)', color: 'var(--teal-strong)', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>Patagonia</span>
                    <span style={{ display: 'inline-block', background: '#f5f0ff', color: '#7c3aed', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>{t.lens_result_category}</span>
                    <span style={{ display: 'inline-block', background: '#e8f8f0', color: '#2d9e6b', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>{t.lens_result_state}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--teal-strong)' }}>🔥 {t.lens_result_price}</span>
                    <span style={{ fontSize: 13, color: 'var(--sub)', fontStyle: 'italic' }}>{t.lens_result_recommended}</span>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ display: 'inline-block', background: '#fff4e8', color: '#c2410c', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>📈 {t.lens_margin}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 6 }}>🏪 {t.lens_result_platforms}</div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ display: 'inline-block', background: '#e8f8f0', color: '#2d9e6b', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>⚡ {t.lens_result_demand}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--sub)', fontStyle: 'italic', marginBottom: 8 }}>💡 {t.lens_result_tip}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal-strong)', background: 'rgba(62,172,160,0.08)', borderRadius: 10, padding: '7px 10px' }}>{t.lens_ai_analysis}</div>
                </div>
              </div>
            </div>
          </div>

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

          <div className="lp-feature reverse reveal">
            <div className="feature-copy">
              <span className="feature-tag">⭐ Premium</span>
              <div className="feature-icon-wrap">✨</div>
              <h3 className="feature-title">{t.f6Title}</h3>
              <p className="feature-desc">{t.f6Desc}</p>
              <p className="feature-desc" style={{ marginTop: 8, fontWeight: 700, color: 'var(--accent)' }}>{t.f6AiFeature}</p>
              <p className="feature-desc" style={{ marginTop: 4, fontWeight: 600, color: 'var(--sub)' }}>{t.f6AiBullet2}</p>
              <p className="feature-desc" style={{ marginTop: 4, fontWeight: 600, color: 'var(--sub)' }}>{t.f6AiBullet3}</p>
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
                <div style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'rgba(62,172,160,0.08)', padding: '8px 12px', borderRadius: 10 }}>{t.f6AiMockup}</div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── VOCAL IA SECTION ── */}
      <section className="lp-voice-section" id="vocal">
        <div className="lp-container">
          <div className="section-head reveal" style={{ marginBottom: 60 }}>
            <span className="section-eyebrow">{t.vocalEyebrow}</span>
            <h2 className="section-title">{t.vocalTitle}<span style={TEAL_GRAD_STYLE}>{t.vocalTitleAccent}</span></h2>
            <p className="section-sub">{t.vocalSub}</p>
          </div>

          <div className="voice-steps">
            {[
              { num: 1, title: t.step1Title, desc: t.step1Desc },
              { num: 2, title: t.step2Title, desc: t.step2Desc },
              { num: 3, title: t.step3Title, desc: t.step3Desc },
            ].map(({ num, title, desc }) => (
              <div key={num} className="voice-step reveal">
                <div className="vstep-num">{num}</div>
                <h4>{title}</h4>
                <p>{desc}</p>
              </div>
            ))}
          </div>

          <div className="voice-detect">
            <h3>{t.detectTitle}<span style={TEAL_GRAD_STYLE}>{t.detectTitleAccent}</span></h3>
            <p className="voice-detect-sub">{t.detectSub}</p>
            <div className="voice-detect-grid">
              {t.chips.map(({ ico, lbl, ex }) => (
                <div key={lbl} className="voice-chip">
                  <div className="vico">{ico}</div>
                  <div className="vlbl">{lbl}</div>
                  <div className="vex">{ex}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="voice-compare">
            <div className="voice-compare-card bad reveal">
              <div className="clabel">{t.badLabel}</div>
              <h4>{t.badTitle}</h4>
              <div className="ctime">{t.badTime}</div>
              <ul>
                {t.badItems.map(item => (
                  <li key={item}><span className="bullet">✕</span>{item}</li>
                ))}
              </ul>
            </div>
            <div className="vs">VS</div>
            <div className="voice-compare-card good reveal">
              <div className="clabel">{t.goodLabel}</div>
              <h4>{t.goodTitle}</h4>
              <div className="ctime">{t.goodTime}</div>
              <ul>
                {t.goodItems.map(item => (
                  <li key={item}><span className="bullet">✓</span>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="voice-testis">
            {t.testimonials.map(({ quote, avatar, name, role }) => (
              <div key={name} className="voice-testi reveal">
                <div className="quote">{quote}</div>
                <div className="author">
                  <div className="avatar">{avatar}</div>
                  <div className="who">
                    <div className="vname">{name}</div>
                    <div className="role">{role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="voice-cta-box">
            <h3>{t.voiceCtaTitle}</h3>
            <p>{t.voiceCtaSub}</p>
            <button className="btn"
              onClick={() => { track('cta_click', { cta: 'voice_section', page: 'landing' }); nav('/login?mode=signup'); }}>
              {t.voiceCtaBtn}
            </button>
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
            <div className="iphone-sm">
              <div className="lp-iphone-notch"></div>
              <div className="lp-iphone-screen">
                <div className="appscr">
                  <div className="app-topbar">
                    <img src="/icon_180x180.png" alt="" loading="lazy" />
                    <span className="app-topbar-name">Fill &amp; Sell</span>
                    <span className="app-topbar-pill">⭐</span>
                  </div>
                  <div className="app-body">
                    <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 10 }}>📸 Lens</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      <div style={{ flex: 1, height: 90, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(62,172,160,0.2)' }}>
                        <img src="/pata1.jpg" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Analyse Lens IA Fill &amp; Sell - T-shirt Patagonia" loading="lazy" />
                      </div>
                      <div style={{ flex: 1, height: 90, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(62,172,160,0.2)' }}>
                        <img src="/pata2.jpg" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Résultat analyse prix marché Fill &amp; Sell" loading="lazy" />
                      </div>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid rgba(62,172,160,0.15)', borderRadius: 12, padding: '10px 12px', marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 3 }}>🔍 {t.lens_result_title}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--teal-strong)' }}>🔥 {t.lens_result_price}</span>
                        <span style={{ fontSize: 10, color: 'var(--sub)', fontStyle: 'italic' }}>{t.lens_result_recommended}</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--sub)', marginBottom: 5 }}>{t.lens_result_platforms}</div>
                      <span style={{ display: 'inline-block', background: '#e8f8f0', color: '#2d9e6b', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>⚡ {t.lens_result_demand}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--sub)', fontStyle: 'italic', marginBottom: 6 }}>💡 {t.lens_result_tip}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--teal-strong)', background: 'rgba(62,172,160,0.08)', borderRadius: 8, padding: '5px 8px', marginBottom: 8 }}>{t.lens_ai_analysis}</div>
                    <div style={{ background: 'var(--teal-strong)', color: '#fff', borderRadius: 10, padding: '9px 0', textAlign: 'center', fontSize: 12, fontWeight: 800 }}>{t.lens_add_stock}</div>
                  </div>
                  <div className="app-bnav">
                    <div className="item"><span className="ic">📊</span><span>{lang === 'fr' ? 'Tableau' : 'Dashboard'}</span></div>
                    <div className="item"><span className="ic">📦</span><span>{lang === 'fr' ? 'Stock IA' : 'AI Stock'}</span></div>
                    <div className="item on"><span className="ic">📸</span><span>Lens</span></div>
                    <div className="item"><span className="ic">📋</span><span>{lang === 'fr' ? 'Ventes' : 'Sales'}</span></div>
                    <div className="item"><span className="ic">📈</span><span>Stats</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="iphone-sm">
              <div className="lp-iphone-notch"></div>
              <div className="lp-iphone-screen">
                <div className="appscr">
                  <div className="app-topbar">
                    <img src="/icon_180x180.png" alt="" loading="lazy" />
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
                      { name: "Veste Levi's vintage", tags: [{ s: { background: '#FDF2F8', color: '#9D174D', borderColor: '#F9A8D4' }, l: t.ph2CatFashion }, { s: { background: 'var(--teal-tint)', color: 'var(--teal-strong)', borderColor: '#9FE1CB' }, l: "Levi's" }], side: t.ph2Buy, val: '15€', valClass: 'peach', borderColor: '#DB2777' },
                      { name: 'iPhone 12 Pro 128Go', tags: [{ s: { background: '#EFF6FF', color: '#1D4ED8', borderColor: '#93C5FD' }, l: t.ph2CatTech }, { s: { background: 'var(--teal-tint)', color: 'var(--teal-strong)', borderColor: '#9FE1CB' }, l: 'Apple' }], side: t.ph2Buy, val: '280€', valClass: 'peach', borderColor: '#2563EB' },
                      { name: 'Sac Hermès Kelly', tags: [{ s: { background: '#FDF8F0', color: '#92400E', borderColor: '#F59E0B' }, l: t.ph2CatLuxe }, { s: { background: 'var(--teal-tint)', color: 'var(--teal-strong)', borderColor: '#9FE1CB' }, l: 'Hermès' }], side: t.ph2Buy, val: '820€', valClass: 'peach', borderColor: '#D97706' },
                      { name: 'Polo Ralph Lauren M', tags: [{ s: { background: '#FDF2F8', color: '#9D174D', borderColor: '#F9A8D4' }, l: t.ph2CatFashion }, { s: { background: '#DCFCE7', color: '#15803D', borderColor: '#86EFAC' }, l: '✓ ' + t.ph2Sold }], side: t.ph2Sold, val: '28€', valClass: 'green', borderColor: '#DB2777' },
                    ].map(({ name, tags, side, val, valClass, borderColor }) => (
                      <div key={name} className="app-inv-row" style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: 9 }}>
                        <div style={{ flex: 1 }}>
                          <div className="name">{name}</div>
                          <div className="tags">{tags.map(({ s, l }) => <span key={l} className="app-tag" style={s}>{l}</span>)}</div>
                        </div>
                        <div className="right"><div className="l">{side}</div><div className={`v ${valClass}`}>{val}</div></div>
                      </div>
                    ))}
                  </div>
                  <div className="app-bnav">
                    <div className="item"><span className="ic">📊</span><span>{lang === 'fr' ? 'Tableau' : 'Dashboard'}</span></div>
                    <div className="item on"><span className="ic">📦</span><span>{lang === 'fr' ? 'Stock IA' : 'AI Stock'}</span></div>
                    <div className="item"><span className="ic">📸</span><span>Lens</span></div>
                    <div className="item"><span className="ic">📋</span><span>{lang === 'fr' ? 'Ventes' : 'Sales'}</span></div>
                    <div className="item"><span className="ic">📈</span><span>Stats</span></div>
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
            <div className="price-card free reveal" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="price-tier">{t.freeTier}</div>
              <h3 className="price-name">{t.freeName}</h3>
              <div className="price-amount"><span className="num">0 €</span><span className="per">{t.freePer}</span></div>
              <div className="price-tagline">{t.freeTagline}</div>
              <ul className="price-features">
                <li><span className="ck">✓</span> {t.freeF1}</li>
                <li><span className="ck">✓</span> {t.freeF2}</li>
                <li><span className="ck">✓</span> {t.freeF3}</li>
                <li><span className="ck">✓</span> {t.freeF4}</li>
                <li><span className="ck">✓</span> <strong>{t.freeF5}</strong></li>
                <li><span className="ck">✓</span> {t.freeF6}</li>
              </ul>
              <button className="btn btn-lg" style={{ marginTop: 'auto' }}
                onClick={() => { track('cta_click', { cta: 'pricing_free', page: 'landing' }); nav('/login?mode=signup'); }}>
                {t.freeBtn}
              </button>
            </div>
            <div className="price-card premium reveal delay-1">
              {slotsRemaining !== null && slotsRemaining > 0
                ? <div className="price-popular" style={{ background: 'linear-gradient(90deg,#E53E3E,#F97316)', color: '#fff', fontWeight: 700, textAlign: 'center' }}>🔥 {lang === 'fr' ? `Il reste ${slotsRemaining} place${slotsRemaining > 1 ? 's' : ''} Founder` : `Only ${slotsRemaining} Founder spot${slotsRemaining > 1 ? 's' : ''} left`}</div>
                : <div className="price-popular" style={{ background: 'linear-gradient(90deg,#0D9488,#F97316)', color: '#fff', fontWeight: 700, textAlign: 'center' }}>{t.premiumBadge}</div>
              }
              <div className="price-tier">{t.premiumTier}</div>
              <h3 className="price-name">{t.premiumName}</h3>
              <div className="price-amount"><span className="num">{slotsRemaining !== null && slotsRemaining > 0 ? '9,99 €' : '12,99 €'}</span><span className="per">{t.premiumPer}</span></div>
              <div className="price-trial-badge">🎁 {t.premiumTrialBadge}</div>
              <div className="price-tagline">{slotsRemaining !== null && slotsRemaining > 0 ? (lang === 'fr' ? 'Prix Founder · Sans engagement.' : 'Founder price · No commitment.') : t.premiumTagline}</div>
              {slotsRemaining !== null && slotsRemaining > 0 && (
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 8, padding: '6px 14px', textAlign: 'center', marginBottom: 6 }}>
                  {lang === 'fr' ? 'Ensuite 12,99 €/mois pour les nouveaux abonnés' : 'Then €12.99/month for new subscribers'}
                </div>
              )}
              <ul className="price-features">
                <li><span className="ck">✓</span> <strong>{t.premiumF2}</strong></li>
                <li><span className="ck">✓</span> <strong>{t.premiumF3}</strong></li>
                <li><span className="ck">✓</span> <strong>{t.premiumF7}</strong></li>
                <li><span className="ck">✓</span> {t.premiumF4}</li>
                <li><span className="ck">✓</span> {t.premiumF5}</li>
                <li><span className="ck">✓</span> {t.premiumF6}</li>
              </ul>
              <button className="btn btn-white btn-lg"
                onClick={() => { track('cta_click', { cta: 'pricing_premium', page: 'landing' }); nav('/login?mode=signup'); }}>
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
            <button className="btn btn-white btn-lg"
              onClick={() => { track('cta_click', { cta: 'final_cta', page: 'landing' }); nav('/login?mode=signup'); }}>
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
              <img src="/icon_180x180.png" alt="" loading="lazy" />
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
                  <a href="https://www.tiktok.com/@fill.sell" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/></svg>
                    TikTok
                  </a>
                </li>
                <li>
                  <a href="https://x.com/fillsellapp" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
