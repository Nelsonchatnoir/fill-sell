import { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { track } from '../analytics/analytics';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { businessOfferVisible } from '../config/businessOffer';
import './landing.css';

/* ───────────────────────────────────────────────────────────────────────────
   Landing FillSell — page d'accueil publique de fillsell.app (route « / »,
   WEB uniquement : sur natif, AppRouter envoie la racine sur /login).

   Le DESSIN vient du projet Claude Design « FillSell Landing » (07/09/2026) et
   est repris tel quel : styles inline, animations @keyframes dans landing.css,
   attributs data-* comme points d'accroche des media queries. Ce qui a été
   RECÂBLÉ à l'intégration, et qu'un export HTML ne peut pas porter :

   1. bilingue FR/EN — le JSX porte le français en littéral, t() va chercher
      l'anglais dans EN (dictionnaire fourni par le design) ;
   2. volumes LUS EN BASE — les cartes de prix et la FAQ portent des jetons
      {ADS_*} / {REPUB_*} / {RETOUCHE_*} remplis depuis coin_config, jamais des
      nombres en dur : la page ne peut pas promettre un volume qu'on ne sert pas ;
   3. analytics — page_view, cta_click, change_language partent dans le
      dataLayer (GTM), d'où viennent les conversions TikTok et Google Ads ;
   4. routage — tous les CTA mènent à la création de compte, y compris
      « Passer Premium/Pro/Business » : pas de paywall avant que le visiteur
      ait vu l'app, l'upgrade se fait DEPUIS l'app ;
   5. JSON-LD FAQPage — construit depuis la FAQ réellement affichée ;
   6. carte Business — sous le même drapeau que l'app (businessOffer.js).

   Trois écarts ASSUMÉS par rapport au design, à ne pas « recorriger » :
   - la section témoignages a été RETIRÉE (trois avis signés que le design
     lui-même annonçait comme des emplacements à remplacer) ;
   - la puce « Déjà utilisé par des centaines de revendeurs » est remplacée par
     un fait vérifiable, faute de chiffre à citer ;
   - la réponse FAQ sur le risque de compte Vinted garde NOTRE texte (plafond
     de 45/jour, « aucun outil ne peut promettre zéro risque ») et non celui du
     design, qui affirmait « rien ne ressemble à un robot ».
   ─────────────────────────────────────────────────────────────────────────── */

/* Adresse de contact publique — la même que dans /legal. */
const CONTACT_EMAIL = 'support@fillsell.app';
const APP_STORE_URL = 'https://apps.apple.com/app/id6762152785';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=app.fillsell.app';
/* Badges stores : l'app est publiée sur les DEUX stores. Le drapeau couvre les
   deux d'un bloc — ne repasser à false que si les deux fiches disparaissent. */
const STORE_BADGES_VISIBLE = true;
/* Fiche Chrome Web Store — SEULE voie d'installation de l'extension (décision
   2026-09-07). Les CTA « Installer l'extension Chrome » y mènent DIRECTEMENT :
   ni /extension, ni le zip. Le zip continue d'être généré et servi
   (vite-plugin-zip-extension), mais plus aucun lien du site n'y conduit — une
   installation en mode développeur ne reçoit pas les mises à jour et fait
   cohabiter deux copies qui se disputent les mêmes jobs.
   Même id que le JSON-LD d'index.html et que ExtensionPage. */
const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/ooeagobimgoabciggfamljdfpkginhnm';
const TIKTOK_URL = 'https://www.tiktok.com/@fill.sell';
const X_URL = 'https://x.com/fillsellapp';

/* Badges stores — RÈGLE : c'est le VISUEL qui doit faire la même taille, pas
   le fichier. Les deux images n'ont pas le même cadre :
     Apple  — SVG 126,5 × 40, le badge occupe TOUT le cadre ;
     Google — PNG 646 × 250 avec 29 px de vide transparent en haut ET en bas
              (mesuré au trim) : son visuel ne fait que 192/250 de la hauteur
              du fichier, soit 77 %.
   Aligner les deux `height` donnait donc un badge Google 30 % plus grand
   (constat de Nico sur iPhone, 07/09). On aligne la hauteur du VISUEL :
   Google est agrandi de 250/192 puis remonté par des marges négatives, si
   bien que sa boîte de mise en page reste haute de BADGE_H comme Apple.
   Les largeurs restent légèrement différentes — les deux badges n'ont pas le
   même rapport (3,16 contre 3,37) et les chartes des deux stores INTERDISENT
   de les déformer : on aligne sur la hauteur, jamais sur la largeur. */
const BADGE_H = 44;
const BADGE_GOOGLE_H = Math.round(BADGE_H * 250 / 192);
const S_BADGE_APPLE = { height: `${BADGE_H}px`, width: 'auto', display: 'block' };
const S_BADGE_GOOGLE = {
  height: `${BADGE_GOOGLE_H}px`, width: 'auto', display: 'block',
  margin: `${-(BADGE_GOOGLE_H - BADGE_H) / 2}px 0`,
};

const SFOOT = { fontWeight: '600', fontSize: '13px', color: '#5C6560' };
const SSOCIAL = {
  width: 30, height: 30, borderRadius: 9, background: '#EDEAE0',
  border: '1px solid #E7E3D8', color: '#5C6560',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};

/* ── Volumes affichés ───────────────────────────────────────────────────────
   Les cartes de prix et la FAQ portent des jetons remplis au rendu par les
   QUOTAS PAR GESTE lus dans coin_config — la même source que les cartes de
   l'app (ConversionModal). La landing est publique : la lecture passe par le
   rôle anon, qui a SELECT sur coin_config.

   FILET, PAS SOURCE : si la requête échoue (hors ligne, Supabase indisponible),
   ces valeurs s'affichent plutôt qu'un blanc ou un zéro — une page tarifaire
   vide coûte plus cher qu'une page légèrement datée. À tenir à jour, mais ce
   n'est JAMAIS ce qui s'affiche quand la base répond.
   Relevé du 2026-09-07. quota_republication_business = 0 signifie ILLIMITÉ
   (c'est le différenciateur du palier) : aucun jeton ne le porte, la carte
   Business écrit « illimitées » en toutes lettres. */
const GRANTS_FALLBACK = {
  ADS_FREE: 5, ADS_PREMIUM: 40, ADS_PRO: 120, ADS_BUSINESS: 300,
  REPUB_FREE: 50, REPUB_PREMIUM: 1500, REPUB_PRO: 5000,
  RETOUCHE_PREMIUM: 5, RETOUCHE_PRO: 20, RETOUCHE_BUSINESS: 50,
};

const fillGrants = (texte, g, lang) => {
  const loc = lang === 'en' ? 'en-US' : 'fr-FR';
  const mille = (n) => Number(n).toLocaleString(loc);
  return String(texte)
    .replace(/\{ADS_FREE\}/g, g.ADS_FREE)
    .replace(/\{ADS_PREMIUM\}/g, g.ADS_PREMIUM)
    .replace(/\{ADS_PRO\}/g, g.ADS_PRO)
    .replace(/\{ADS_BUSINESS\}/g, g.ADS_BUSINESS)
    .replace(/\{REPUB_FREE\}/g, g.REPUB_FREE)
    .replace(/\{REPUB_PREMIUM\}/g, mille(g.REPUB_PREMIUM))
    .replace(/\{REPUB_PRO\}/g, mille(g.REPUB_PRO))
    .replace(/\{RETOUCHE_PREMIUM\}/g, g.RETOUCHE_PREMIUM)
    .replace(/\{RETOUCHE_PRO\}/g, g.RETOUCHE_PRO)
    .replace(/\{RETOUCHE_BUSINESS\}/g, g.RETOUCHE_BUSINESS);
};

function getInitialLang() {
  const saved = localStorage.getItem('fs_lang');
  if (saved === 'fr' || saved === 'en') return saved;
  return (navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/* Traduction : le JSX porte le FRANÇAIS en littéral (c'est ce qui est peint au
   premier rendu, sans dépendre d'un dictionnaire) et EN est indexé par cette
   chaîne française exacte. Une clé absente retombe donc naturellement sur le
   français plutôt que sur du vide. Dictionnaire fourni par le design. */
const EN = {
  "Comment ça marche": "How it works",
  "Import Vinted": "Vinted import",
  "Publication": "Publishing",
  "Tarifs": "Pricing",
  "Se connecter": "Log in",
  "Commencer": "Get started",
  "Ton dressing Vinted,": "Your Vinted wardrobe,",
  "publié aussi sur Leboncoin, eBay et Beebs.": "also live on Leboncoin, eBay and Beebs.",
  "Tu importes ton dressing en un clic. L'IA écrit les annonces. FillSell les publie sur les 4 plateformes avec tes propres comptes, et republie les tiennes sur Vinted pour qu'elles remontent.": "Import your wardrobe in one click. The AI writes the listings. FillSell publishes them to all 4 marketplaces with your own accounts, and reposts yours on Vinted so they climb back up.",
  "Commencer gratuitement": "Start free",
  "Installer l'extension Chrome": "Install the Chrome extension",
  "Gratuite · installée une seule fois · aucun mot de passe": "Free · installed once · no passwords",
  "Gratuit pour commencer — sans carte bancaire": "Free to start — no credit card required",
  "L'IA a écrit ton annonce": "The AI wrote your listing",
  "Casquette beige Volcom": "Beige Volcom cap",
  "Ajouté à ton stock": "Added to your stock",
  "Mode": "Fashion",
  "Patagonia": "Patagonia",
  "Taille unique": "One size",
  "Casquette beige Volcom, coton, taille unique": "Beige Volcom cap, cotton, one size",
  "4 plateformes, tes comptes": "4 marketplaces, your accounts",
  "Sur l'App Store et Google Play": "On the App Store and Google Play",
  "Jamais tes mots de passe": "Never your passwords",
  "Tu importes. On publie partout.": "You import. We publish everywhere.",
  "On republie sur Vinted.": "We repost on Vinted.",
  "Ton téléphone pilote.": "Your phone drives.",
  "Ton ordinateur exécute.": "Your computer executes.",
  "Tu as déjà 200 annonces sur Vinted ?": "Already 200 listings on Vinted?",
  "Tu ne les refais pas.": "You won't redo them.",
  "Une annonce.": "One listing.",
  "Quatre plateformes.": "Four marketplaces.",
  "Tes annonces qui dorment": "Your sleeping listings",
  "remontent toutes seules.": "climb back up on their own.",
  "Vendu sur une plateforme ? Tu retires les autres": "Sold on one marketplace? Remove the others",
  "en un tap.": "in one tap.",
  "Tu photographies.": "You photograph.",
  "L'IA écrit l'annonce.": "The AI writes the listing.",
  "Ton stock et tes bénéfices,": "Your stock and profits,",
  "à jour tout seuls.": "up to date on their own.",
  "Un plan pour": "A plan for",
  "chaque volume.": "every volume.",
  "Prêt à publier partout,": "Ready to list everywhere,",
  "sans effort ?": "effortlessly?",
  "Trois choses, c'est tout": "Three things, that's it",
  "Tu importes. On publie partout. On republie sur Vinted.": "You import. We publish everywhere. We repost on Vinted.",
  "Ton dressing Vinted entre en un clic": "Your Vinted wardrobe comes in with one click",
  "200 annonces déjà en ligne ? Titres, prix, photos : tout arrive dans ton stock. On lit, on ne publie ni ne supprime rien.": "Already 200 listings online? Titles, prices, photos — everything lands in your stock. We read; we never publish or delete anything.",
  "Publié sur les 4 plateformes": "Published on all 4 marketplaces",
  "Un seul ajout part sur Vinted, Leboncoin, eBay et Beebs — avec tes comptes. Quatre fois plus d'acheteurs, pas quatre fois le travail.": "One single add goes to Vinted, Leboncoin, eBay and Beebs — with your accounts. Four times more buyers, not four times the work.",
  "Republiées sur Vinted, toutes seules": "Reposted on Vinted, all by themselves",
  "Une annonce de trois semaines n'est plus vue. FillSell la remet en haut des résultats : en un tap sur tous les plans, toute seule avec le plan Pro.": "A three-week-old listing is seen by no one. FillSell puts it back on top of the results: in one tap on every plan, all by itself with the Pro plan.",
  "Ton téléphone pilote. Ton ordinateur exécute.": "Your phone drives. Your computer executes.",
  "FillSell ne se connecte jamais à ta place avec tes mots de passe. Une petite extension Chrome, installée une seule fois, remplit les formulaires depuis tes comptes déjà ouverts.": "FillSell never signs in for you with your passwords. A small Chrome extension, installed once, fills in the forms from your already-open accounts.",
  "Ton téléphone": "Your phone",
  "Tu ajoutes, tu choisis, tu pilotes": "You add, you choose, you drive",
  "Met tes annonces en file d'attente": "Queues up your listings",
  "Ton ordinateur": "Your computer",
  "Publie avec tes comptes — jamais tes mots de passe": "Publishes with your accounts — never your passwords",
  "EXTENSION": "EXTENSION",
  "Publication en cours…": "Publishing…",
  "Ton ordinateur est éteint ? Rien n'est perdu — tes annonces attendent en file et partent à la prochaine ouverture de Chrome.": "Computer off? Nothing is lost — your listings wait in line and go out the next time Chrome opens.",
  "Mon dressing Vinted": "My Vinted wardrobe",
  "Lecture seule": "Read-only",
  "214 annonces importées": "214 listings imported",
  "en 40 secondes": "in 40 seconds",
  "Tu as déjà 200 annonces sur Vinted ? Tu ne les refais pas.": "Already 200 listings on Vinted? You won't redo them.",
  "FillSell importe ton dressing en un clic : titres, prix, photos, tout arrive dans ton stock. On lit tes annonces — on ne publie, ne modifie ni ne supprime rien. Ensuite, tu choisis lesquelles envoyer sur Leboncoin, eBay et Beebs.": "FillSell imports your wardrobe in one click: titles, prices, photos — everything lands in your stock. We read your listings; we never publish, edit or delete anything. Then you pick which ones to send to Leboncoin, eBay and Beebs.",
  "Importer mon dressing": "Import my wardrobe",
  "Import gratuit et illimité": "Free, unlimited import",
  "Une annonce. Quatre plateformes.": "One listing. Four marketplaces.",
  "Tu remplis une fois. FillSell publie sur Vinted, Leboncoin, eBay et Beebs avec tes comptes. Quatre fois plus d'acheteurs devant le même article, sans quatre fois le travail.": "You fill it in once. FillSell publishes on Vinted, Leboncoin, eBay and Beebs with your accounts. Four times more buyers on the same item — without four times the work.",
  "1 seul ajout": "1 single add",
  "Automatique": "Automatic",
  "Republication Vinted": "Vinted reposting",
  "Tes annonces qui dorment remontent toutes seules.": "Your sleeping listings climb back up on their own.",
  "Sur Vinted, une annonce de trois semaines n'existe plus pour les acheteurs. FillSell la remet en haut des résultats, au rythme naturel d'un vendeur actif. Tes articles restent visibles : en un tap sur tous les plans, tout seul avec le plan Pro.": "On Vinted, a three-week-old listing no longer exists for buyers. FillSell puts it back on top of the results, at the natural pace of an active seller. Your items stay visible: in one tap on every plan, automatically with the Pro plan.",
  "Toujours en haut des résultats, là où les acheteurs regardent": "Always at the top of the results, where buyers actually look",
  "Au rythme d'un vrai vendeur — ton compte reste serein": "At a real seller's pace — your account stays worry-free",
  "Tu remontes tes annonces en un tap, ou tu laisses le plan Pro le faire pour toi": "Bump your listings in one tap, or let the Pro plan do it for you",
  "Republication auto": "Auto reposting",
  "Elle remonte en tête des résultats toutes les 24 h.": "It climbs back to the top of the results every 24 h.",
  "Résultats Vinted": "Vinted results",
  "Ton annonce": "Your listing",
  "1re": "1st",
  "Après la vente": "After the sale",
  "Vendu sur une plateforme ? Tu retires les autres en un tap.": "Sold on one marketplace? Remove the others in one tap.",
  "FillSell détecte la vente et te prévient. Tu confirmes, il retire les annonces des trois autres plateformes. Fini les acheteurs à qui tu dois expliquer que l'article est déjà parti.": "FillSell detects the sale and lets you know. You confirm, it removes the listings from the other three marketplaces. No more buyers you have to tell the item is already gone.",
  "Vendu sur Vinted — 21 €": "Sold on Vinted — €18",
  "Retiré des 3 autres": "Removed from the 3 others",
  "Annonce retirée": "Listing removed",
  "Le retrait attend ta confirmation — jamais dans ton dos.": "Removal waits for your confirmation — never behind your back.",
  "L'IA fait le travail d'écriture": "The AI does the writing",
  "Tu photographies. L'IA écrit l'annonce.": "You photograph. The AI writes the listing.",
  "Titre, description, catégorie, marque, taille : tout est rempli depuis la photo. Et la photo elle-même est retouchée pour donner envie de cliquer.": "Title, description, category, brand, size: all filled in from the photo. And the photo itself is retouched to make people want to click.",
  "L'annonce s'écrit toute seule": "The listing writes itself",
  "Titre": "Title",
  "Description": "Description",
  "T-shirt Patagonia noir": "Black Patagonia T-shirt",
  "Coton bio, taille L, logo brodé poitrine, très bon état — porté quelques fois.": "Organic cotton, size L, embroidered chest logo, great condition — worn a few times.",
  "La photo est retouchée": "The photo is retouched",
  "Ta photo": "Your photo",
  "✨ Retouchée": "✨ Retouched",
  "Prête à publier": "Ready to publish",
  "Stock & bénéfices": "Stock & profits",
  "Ton stock et tes bénéfices, à jour tout seuls.": "Your stock and profits, up to date on their own.",
  "Ce que tu as acheté, ce que tu as vendu, ce qu'il te reste et ce que ça t'a rapporté. Rangé, chiffré, sans tableur à tenir. Chaque vente détectée met la marge à jour toute seule.": "What you bought, what you sold, what's left and what it earned you. Sorted, priced, no spreadsheet to maintain. Every detected sale updates the margin on its own.",
  "🧮 Calcul de marge instantané": "🧮 Instant margin calculator",
  "📄 Import / export Excel": "📄 Excel import / export",
  "Ton mois en un coup d'œil": "Your month at a glance",
  "Septembre": "September",
  "Bénéfice net": "Net profit",
  "Ventes": "Sales",
  "Marge moy.": "Avg margin",
  "En stock": "In stock",
  "Évolution des bénéfices": "Profit evolution",
  "Un plan pour chaque volume.": "A plan for every volume.",
  "Commence gratuitement. Passe Premium, Pro ou Business quand tu veux vendre plus, sans engagement.": "Start free. Move to Premium or Pro whenever you want to sell more — no commitment.",
  "Gratuit": "Free",
  "Pour se lancer": "To get started",
  "/ mois": "/ mo",
  "0 €": "€0",
  "{ADS_FREE} annonces publiées / mois": "{ADS_FREE} listings published / mo",
  "{REPUB_FREE} republications Vinted offertes, à vie": "{REPUB_FREE} Vinted repostings included, for life",
  "Import Vinted gratuit et illimité": "Free, unlimited Vinted import",
  "Publication auto sur Vinted, Leboncoin, eBay & Beebs": "Auto-publishing to Vinted, Leboncoin, eBay & Beebs",
  "Calcul de marge instantané": "Instant margin calculator",
  "Suivi de tes ventes": "Track your sales",
  "Le plus populaire": "Most popular",
  "Pour vendre régulièrement": "To sell regularly",
  "12,99 €": "€12.99",
  "{ADS_PREMIUM} annonces publiées / mois": "{ADS_PREMIUM} listings published / mo",
  "{REPUB_PREMIUM} republications Vinted par mois": "{REPUB_PREMIUM} Vinted repostings a month",
  "Retouche IA — {RETOUCHE_PREMIUM} photos par mois": "AI touch-up — {RETOUCHE_PREMIUM} photos a month",
  "Import & export Excel de ton stock": "Excel import & export of your stock",
  "Support par email": "Email support",
  "Passer Premium": "Go Premium",
  "Pour les gros volumes": "For high volumes",
  "29,99 €": "€29.99",
  "{ADS_PRO} annonces publiées / mois": "{ADS_PRO} listings published / mo",
  "{REPUB_PRO} republications Vinted par mois": "{REPUB_PRO} Vinted repostings a month",
  "Republication automatique — tes annonces remontent toutes seules": "Automatic reposting — your listings bump themselves",
  "Retouche IA — {RETOUCHE_PRO} photos par mois": "AI touch-up — {RETOUCHE_PRO} photos a month",
  "Support prioritaire": "Priority support",
  "Passer Pro": "Go Pro",
  "Business": "Business",
  "Le sommet. Zéro limite.": "The top. No limits.",
  "59,99 €": "€59.99",
  "{ADS_BUSINESS} annonces publiées / mois": "{ADS_BUSINESS} listings published / mo",
  "Republications Vinted illimitées — autant que tu veux": "Unlimited Vinted repostings — as many as you want",
  "Retouche IA — {RETOUCHE_BUSINESS} photos par mois": "AI touch-up — {RETOUCHE_BUSINESS} photos a month",
  "Passer Business": "Go Business",
  "Les questions qu'on nous pose.": "The questions we get asked.",
  "Comment fonctionnent les forfaits ?": "How do the plans work?",
  "Chaque forfait comprend des volumes mensuels de gestes : des annonces créées par IA — depuis une photo ou depuis ton stock — et publiées sur les 4 plateformes ({ADS_FREE} en Free, {ADS_PREMIUM} en Premium, {ADS_PRO} en Pro, {ADS_BUSINESS} en Business), des retouches photo et des republications Vinted ({REPUB_FREE} offertes à vie en Free, {REPUB_PREMIUM} par mois en Premium, {REPUB_PRO} en Pro, illimitées en Business). La publication elle-même est incluse et illimitée. Les compteurs sont visibles dans l'app et se remettent à zéro à chaque cycle.": "Each plan includes monthly volumes of actions: AI-created listings — from a photo or from your stock — published to the 4 marketplaces ({ADS_FREE} on Free, {ADS_PREMIUM} on Premium, {ADS_PRO} on Pro, {ADS_BUSINESS} on Business), AI photo touch-ups and Vinted repostings ({REPUB_FREE} included for life on Free, {REPUB_PREMIUM} a month on Premium, {REPUB_PRO} on Pro, unlimited on Business). Publishing itself is included and unlimited. Counters are visible in the app and reset every cycle.",
  "Sur quelles plateformes je publie ?": "Which marketplaces can I publish to?",
  "Vinted, Leboncoin, eBay et Beebs — les 4 places de marché qui comptent en France. Un seul ajout, publié sur les quatre en même temps.": "Vinted, Leboncoin, eBay and Beebs — the 4 marketplaces that matter in France. One add, posted to all four at once.",
  "Comment FillSell publie-t-il mes annonces ?": "How does FillSell publish my listings?",
  "Par une extension Chrome installée une seule fois sur ton ordinateur. Elle remplit les formulaires avec tes comptes déjà connectés. FillSell ne connaît jamais tes mots de passe.": "Through a Chrome extension installed once on your computer. It fills in the forms with your already-signed-in accounts. FillSell never knows your passwords.",
  "Faut-il laisser mon ordinateur allumé ?": "Do I need to leave my computer on?",
  "Pour que les publications partent, oui, avec Chrome ouvert. Si ton ordinateur est éteint, tes actions attendent en file et partent à la prochaine ouverture.": "For listings to go out, yes — with Chrome open. If your computer is off, your actions wait in line and go out the next time it opens.",
  "Est-ce risqué pour mon compte Vinted ?": "Is it risky for my Vinted account?",
  "FillSell agit au rythme d'une personne : des gestes espacés, et la republication automatique est volontairement plafonnée à 45 par jour — une limite de sécurité pour protéger ton compte, pas une limite commerciale. Tu peux tout couper à tout moment. Aucun outil ne peut promettre zéro risque, et nous préférons la prudence aux promesses.": "FillSell acts at a human pace: spaced-out actions, and automatic reposting is deliberately capped at 45 a day — a safety limit to protect your account, not a commercial one. You can switch everything off at any time. No tool can promise zero risk, and we prefer caution over promises.",
  "Et si un article se vend ?": "What happens when an item sells?",
  "FillSell détecte la vente et te prévient. Tu confirmes, il retire les annonces des autres plateformes et met à jour ton stock, tes marges et tes stats.": "FillSell detects the sale and lets you know. You confirm, it removes the listings from the other marketplaces and updates your stock, margins and stats.",
  "Lens, c'est illimité ?": "Is Lens unlimited?",
  "Un scan Lens crée directement l'annonce : il compte comme une annonce de ton forfait ({ADS_PREMIUM} par mois en Premium, {ADS_PRO} en Pro) — un seul compteur, visible dans l'app, qui repart à chaque cycle.": "A Lens scan creates the listing directly: it counts as one listing from your plan ({ADS_PREMIUM} a month on Premium, {ADS_PRO} on Pro) — a single counter, visible in the app, that resets every cycle.",
  "Je peux annuler quand je veux ?": "Can I cancel anytime?",
  "Oui. Premium et Pro sont sans engagement : tu changes d'offre ou tu arrêtes en un clic depuis l'app.": "Yes. Premium and Pro have no commitment — switch plans or stop in one tap from the app.",
  "Prêt à publier partout, sans effort ?": "Ready to list everywhere, effortlessly?",
  "Importe ton dressing Vinted, laisse l'IA écrire, et vends sur les 4 plateformes. Gratuit pour commencer — sans carte bancaire.": "Import your Vinted wardrobe, let the AI write, and sell on all 4 marketplaces. Free to start — no credit card required.",
  "Revente automatisée · © 2026": "Automated reselling · © 2026",
  "Mentions légales": "Legal notice",
  "Confidentialité": "Privacy",
  "Contact": "Contact",
  "Guides & blog revente": "Reselling guides & blog",
  "Mar": "Mar", "Avr": "Apr", "Mai": "May", "Juin": "Jun", "Juil": "Jul", "Août": "Aug", "Sep": "Sep",
  "annonces restantes": "listings left",
  "En ligne": "Live",
  "Publier": "Publish",
  "Short Polo Ralph Lauren": "Polo Ralph Lauren shorts",
  "Télécharger dans l'App Store": "Download on the App Store",
  "Disponible sur Google Play": "Get it on Google Play",
};

/* FAQ — source UNIQUE : les <details> affichés ET le JSON-LD FAQPage sont
   construits depuis cette liste. En dur dans index.html, ce bloc fuyait sur
   toutes les routes SPA (double FAQPage sur les articles de blog à FAQ) —
   corrigé le 2026-08-02, ne pas l'y remettre. */
const FAQ = [
  ["Comment fonctionnent les forfaits ?",
   "Chaque forfait comprend des volumes mensuels de gestes : des annonces créées par IA — depuis une photo ou depuis ton stock — et publiées sur les 4 plateformes ({ADS_FREE} en Free, {ADS_PREMIUM} en Premium, {ADS_PRO} en Pro, {ADS_BUSINESS} en Business), des retouches photo et des republications Vinted ({REPUB_FREE} offertes à vie en Free, {REPUB_PREMIUM} par mois en Premium, {REPUB_PRO} en Pro, illimitées en Business). La publication elle-même est incluse et illimitée. Les compteurs sont visibles dans l'app et se remettent à zéro à chaque cycle."],
  ["Sur quelles plateformes je publie ?",
   "Vinted, Leboncoin, eBay et Beebs — les 4 places de marché qui comptent en France. Un seul ajout, publié sur les quatre en même temps."],
  ["Comment FillSell publie-t-il mes annonces ?",
   "Par une extension Chrome installée une seule fois sur ton ordinateur. Elle remplit les formulaires avec tes comptes déjà connectés. FillSell ne connaît jamais tes mots de passe."],
  ["Faut-il laisser mon ordinateur allumé ?",
   "Pour que les publications partent, oui, avec Chrome ouvert. Si ton ordinateur est éteint, tes actions attendent en file et partent à la prochaine ouverture."],
  ["Est-ce risqué pour mon compte Vinted ?",
   "FillSell agit au rythme d'une personne : des gestes espacés, et la republication automatique est volontairement plafonnée à 45 par jour — une limite de sécurité pour protéger ton compte, pas une limite commerciale. Tu peux tout couper à tout moment. Aucun outil ne peut promettre zéro risque, et nous préférons la prudence aux promesses."],
  ["Et si un article se vend ?",
   "FillSell détecte la vente et te prévient. Tu confirmes, il retire les annonces des autres plateformes et met à jour ton stock, tes marges et tes stats."],
  ["Lens, c'est illimité ?",
   "Un scan Lens crée directement l'annonce : il compte comme une annonce de ton forfait ({ADS_PREMIUM} par mois en Premium, {ADS_PRO} en Pro) — un seul compteur, visible dans l'app, qui repart à chaque cycle."],
  ["Je peux annuler quand je veux ?",
   "Oui. Premium et Pro sont sans engagement : tu changes d'offre ou tu arrêtes en un clic depuis l'app."],
];

export default function LandingPage() {
  const nav = useNavigate();
  const [lang, setLang] = useState(getInitialLang);
  const [menuOpen, setMenuOpen] = useState(false);
  const [grants, setGrants] = useState(GRANTS_FALLBACK);

  const isNative = Capacitor.isNativePlatform();
  /* Même drapeau que l'app : refermer l'offre Business dans businessOffer.js
     retire aussi sa carte d'ici, sans toucher à ce fichier. */
  const BUSINESS_VISIBLE = businessOfferVisible(null);

  /* Traduit PUIS remplit les jetons de volume — dans cet ordre, sinon les
     jetons de la version anglaise resteraient nus à l'écran. */
  const t = useCallback(
    (fr) => fillGrants(lang === 'en' && EN[fr] ? EN[fr] : fr, grants, lang),
    [lang, grants],
  );

  /* Quotas lus dans coin_config, comme le reste de l'app. Import dynamique du
     client Supabase : la landing est la première page servie aux visiteurs, on
     ne la met pas sur le chemin critique du premier rendu. Aucun état
     d'attente : le repli s'affiche d'emblée puis est remplacé si la base
     répond — le visiteur ne voit jamais ni blanc ni squelette à la place d'un
     tarif. quota_republication_business n'est pas lu : à 0 il signifie
     « illimité », un nombre n'aurait aucun sens dans la carte. */
  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const { supabase } = await import('../lib/supabase');
        const { data, error } = await supabase
          .from('coin_config')
          .select('key, value')
          .in('key', ['quota_annonces_free', 'quota_annonces_premium', 'quota_annonces_pro',
                      'quota_annonces_business',
                      'republication_avie_free', 'quota_republication_premium', 'quota_republication_pro',
                      'quota_retouche_premium', 'quota_retouche_pro', 'quota_retouche_business']);
        if (error || !data?.length || !vivant) return;
        const parKey = Object.fromEntries(data.map((r) => [r.key, r.value]));
        setGrants({
          ADS_FREE:          parKey.quota_annonces_free         ?? GRANTS_FALLBACK.ADS_FREE,
          ADS_PREMIUM:       parKey.quota_annonces_premium      ?? GRANTS_FALLBACK.ADS_PREMIUM,
          ADS_PRO:           parKey.quota_annonces_pro          ?? GRANTS_FALLBACK.ADS_PRO,
          ADS_BUSINESS:      parKey.quota_annonces_business     ?? GRANTS_FALLBACK.ADS_BUSINESS,
          REPUB_FREE:        parKey.republication_avie_free     ?? GRANTS_FALLBACK.REPUB_FREE,
          REPUB_PREMIUM:     parKey.quota_republication_premium ?? GRANTS_FALLBACK.REPUB_PREMIUM,
          REPUB_PRO:         parKey.quota_republication_pro     ?? GRANTS_FALLBACK.REPUB_PRO,
          RETOUCHE_PREMIUM:  parKey.quota_retouche_premium      ?? GRANTS_FALLBACK.RETOUCHE_PREMIUM,
          RETOUCHE_PRO:      parKey.quota_retouche_pro          ?? GRANTS_FALLBACK.RETOUCHE_PRO,
          RETOUCHE_BUSINESS: parKey.quota_retouche_business     ?? GRANTS_FALLBACK.RETOUCHE_BUSINESS,
        });
      } catch { /* hors ligne ou client indisponible : le repli reste affiché */ }
    })();
    return () => { vivant = false; };
  }, []);

  useEffect(() => { track('page_view', { page: 'landing' }); }, []);
  useEffect(() => { localStorage.setItem('fs_lang', lang); }, [lang]);

  /* Défilement doux pour les ancres du menu : posé sur <html> le temps de la
     landing seulement — la feuille voyage dans le chunk d'entrée, une règle
     globale s'appliquerait aussi à l'app connectée. */
  useEffect(() => {
    document.documentElement.classList.add('lp-smooth');
    return () => document.documentElement.classList.remove('lp-smooth');
  }, []);

  /* JSON-LD FAQPage — construit depuis la FAQ réellement AFFICHÉE (même
     tableau, mêmes quotas), jamais un texte parallèle qui divergerait.
     Injecté au montage, retiré au démontage : en dur dans index.html il
     fuyait sur TOUTES les routes SPA (corrigé le 2026-08-02). */
  useEffect(() => {
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(([q, a]) => ({
        '@type': 'Question',
        name: t(q),
        acceptedAnswer: { '@type': 'Answer', text: t(a) },
      })),
    });
    document.head.appendChild(el);
    return () => el.remove();
  }, [t]);

  /* Apparition au scroll. L'armement (opacity 0) se fait en JS et en
     useLayoutEffect — donc AVANT la peinture, sans clignotement, et sans
     jamais laisser un bloc invisible si le JS ne tourne pas. */
  useLayoutEffect(() => {
    const els = Array.from(document.querySelectorAll('.lp-root [data-r]'));
    if (!els.length || !('IntersectionObserver' in window)) return;
    els.forEach((el) => el.classList.add('lp-armed'));
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('lp-in');
        obs.unobserve(e.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  /* Le burger n'existe que sous 1040px (media query de landing.css) : repasser
     en desktop avec le menu ouvert le laisserait affiché sans bouton pour le
     refermer. Échap ferme aussi. */
  useEffect(() => {
    if (!menuOpen) return;
    const mq = window.matchMedia('(min-width: 1041px)');
    const onWide = (e) => { if (e.matches) setMenuOpen(false); };
    const onEsc = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    mq.addEventListener('change', onWide);
    window.addEventListener('keydown', onEsc);
    return () => {
      mq.removeEventListener('change', onWide);
      window.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  const changeLang = useCallback((code) => {
    setLang(code);
    localStorage.setItem('fs_lang', code);
    track('change_language', { language: code });
  }, []);
  const setFr = useCallback(() => changeLang('fr'), [changeLang]);
  const setEn = useCallback(() => changeLang('en'), [changeLang]);
  const toggleMenu = useCallback(() => setMenuOpen((o) => !o), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  /* Les CTA restent de VRAIS liens (href réel : ouverture dans un nouvel
     onglet, clic milieu, crawl). Le clic simple est intercepté pour rester
     dans la SPA — un clic modifié est laissé au navigateur. */
  const goSpa = useCallback((to) => (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
    e.preventDefault();
    setMenuOpen(false);
    nav(to);
  }, [nav]);

  /* Tous les CTA mènent à la même création de compte — « Passer Premium »,
     « Pro » et « Business » compris. Pas de paywall avant que le visiteur ait
     vu l'app : l'upgrade se fait depuis l'app. Le libellé ne sert plus qu'à
     distinguer les CTA dans l'analytics. */
  const onSignup = useCallback((cta) => (e) => {
    track('cta_click', { cta: `signup_${cta}`, page: 'landing' });
    goSpa('/login?mode=signup')(e);
  }, [goSpa]);
  const onLogin = useCallback((e) => {
    track('cta_click', { cta: 'login', page: 'landing' });
    goSpa('/login')(e);
  }, [goSpa]);
  /* Sortie du site vers le Chrome Web Store : on se contente de compter le
     clic, le navigateur suit le lien (nouvel onglet). Surtout PAS goSpa ici —
     ce n'est pas une route interne. */
  const onExtension = useCallback(() => {
    track('cta_click', { cta: 'extension_webstore', page: 'landing' });
  }, []);

  return (
      <div className="lp-root" style={{ maxWidth: "100%", overflowX: "hidden" }}>
        {/* ══════════ NAV ══════════ */}
        <header style={{ position: "sticky", top: "0", zIndex: "60", background: "rgba(250,250,248,.92)", backdropFilter: "blur(14px) saturate(1.4)", WebkitBackdropFilter: "blur(14px) saturate(1.4)", borderBottom: "1px solid #E7E3D8" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "13px 22px", display: "flex", alignItems: "center", gap: "18px", flexWrap: "nowrap" }}>
            <a href="#top" style={{ display: "flex", alignItems: "center", gap: "9px", flexShrink: "0" }}>
              <img src="/icon-192x192.png" alt="" style={{ width: "30px", height: "30px", borderRadius: "8px", display: "block" }} />
              <span style={{ fontWeight: "700", fontStyle: "italic", fontSize: "18px", letterSpacing: "-.02em", color: "#4A5A52", paddingRight: ".1em" }}>{t("FillSell")}</span>
            </a>
            <nav data-nav-links="1" style={{ display: "flex", gap: "4px", marginLeft: "6px" }}>
              <a href="#comment" style={{ fontWeight: "600", fontSize: "13.5px", color: "#5C6560", padding: "7px 11px", borderRadius: "9px", whiteSpace: "nowrap" }}>{t("Comment ça marche")}</a>
              <a href="#import" style={{ fontWeight: "600", fontSize: "13.5px", color: "#5C6560", padding: "7px 11px", borderRadius: "9px", whiteSpace: "nowrap" }}>{t("Import Vinted")}</a>
              <a href="#publication" style={{ fontWeight: "600", fontSize: "13.5px", color: "#5C6560", padding: "7px 11px", borderRadius: "9px", whiteSpace: "nowrap" }}>{t("Publication")}</a>
              <a href="#tarifs" style={{ fontWeight: "600", fontSize: "13.5px", color: "#5C6560", padding: "7px 11px", borderRadius: "9px", whiteSpace: "nowrap" }}>{t("Tarifs")}</a>
              <a href="#faq" style={{ fontWeight: "600", fontSize: "13.5px", color: "#5C6560", padding: "7px 11px", borderRadius: "9px" }}>{t("FAQ")}</a>
            </nav>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "11px", flexShrink: "0" }}>
              <div data-nav-desk="1" style={{ display: "flex", alignItems: "center", gap: "11px" }}>
                <div style={{ display: "inline-flex", background: "#F6F5F1", border: "1px solid #E7E3D8", borderRadius: "999px", padding: "3px" }}>
                  <button onClick={setFr} style={{ fontFamily: "inherit", fontWeight: "700", fontSize: "12px", padding: "6px 11px", border: "none", borderRadius: "999px", cursor: "pointer", background: "#10201B", color: "#fff" }}>{t("FR")}</button>
                  <button onClick={setEn} style={{ fontFamily: "inherit", fontWeight: "700", fontSize: "12px", padding: "6px 11px", border: "none", borderRadius: "999px", cursor: "pointer", background: "transparent", color: "#8A8578" }}>{t("EN")}</button>
                </div>
                <a href="/login" onClick={onLogin} style={{ fontWeight: "600", fontSize: "13.5px", color: "#5C6560", padding: "9px 14px", borderRadius: "999px", border: "1px solid #E7E3D8", whiteSpace: "nowrap" }}>{t("Se connecter")}</a>
              </div>
              <a href="/login?mode=signup" onClick={onSignup("nav")} style={{ fontWeight: "700", fontSize: "13.5px", color: "#fff", padding: "10px 18px", borderRadius: "999px", background: "linear-gradient(135deg,#2F9E90,#1B6E62)", boxShadow: "0 6px 16px -6px rgba(27,110,98,.5)", whiteSpace: "nowrap" }}>{t("Commencer")}</a>
              <button data-burger="1" onClick={toggleMenu} aria-label="Menu" style={{ display: "none", width: "38px", height: "38px", flexShrink: "0", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "#F6F5F1", border: "1px solid #E7E3D8", borderRadius: "10px", cursor: "pointer", padding: "0" }}>
                <span style={{ display: "block", width: "16px", height: "2px", borderRadius: "2px", background: "#10201B" }} />
                <span style={{ display: "block", width: "16px", height: "2px", borderRadius: "2px", background: "#10201B" }} />
                <span style={{ display: "block", width: "16px", height: "2px", borderRadius: "2px", background: "#10201B" }} />
              </button>
            </div>
          </div>
          <div data-menu="1" style={{ display: menuOpen ? "block" : "none", borderTop: "1px solid #E7E3D8", background: "rgba(250,250,248,.98)", padding: "10px 16px 14px" }}>
            <nav style={{ display: "flex", flexDirection: "column" }}>
              <a href="#comment" onClick={closeMenu} style={{ fontWeight: "600", fontSize: "15px", color: "#10201B", padding: "13px 6px", borderBottom: "1px solid #E7E3D8" }}>{t("Comment ça marche")}</a>
              <a href="#import" onClick={closeMenu} style={{ fontWeight: "600", fontSize: "15px", color: "#10201B", padding: "13px 6px", borderBottom: "1px solid #E7E3D8" }}>{t("Import Vinted")}</a>
              <a href="#publication" onClick={closeMenu} style={{ fontWeight: "600", fontSize: "15px", color: "#10201B", padding: "13px 6px", borderBottom: "1px solid #E7E3D8" }}>{t("Publication")}</a>
              <a href="#tarifs" onClick={closeMenu} style={{ fontWeight: "600", fontSize: "15px", color: "#10201B", padding: "13px 6px", borderBottom: "1px solid #E7E3D8" }}>{t("Tarifs")}</a>
              <a href="#faq" onClick={closeMenu} style={{ fontWeight: "600", fontSize: "15px", color: "#10201B", padding: "13px 6px", borderBottom: "1px solid #E7E3D8" }}>{t("FAQ")}</a>
            </nav>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingTop: "14px" }}>
              <div style={{ display: "inline-flex", background: "#F6F5F1", border: "1px solid #E7E3D8", borderRadius: "999px", padding: "3px" }}>
                <button onClick={setFr} style={{ fontFamily: "inherit", fontWeight: "700", fontSize: "12px", padding: "6px 11px", border: "none", borderRadius: "999px", cursor: "pointer", background: "#10201B", color: "#fff" }}>{t("FR")}</button>
                <button onClick={setEn} style={{ fontFamily: "inherit", fontWeight: "700", fontSize: "12px", padding: "6px 11px", border: "none", borderRadius: "999px", cursor: "pointer", background: "transparent", color: "#8A8578" }}>{t("EN")}</button>
              </div>
              <a href="/login" onClick={onLogin} style={{ fontWeight: "600", fontSize: "14px", color: "#5C6560", padding: "10px 16px", borderRadius: "999px", border: "1px solid #E7E3D8", whiteSpace: "nowrap" }}>{t("Se connecter")}</a>
            </div>
          </div>
        </header>
        {/* ══════════ HERO ══════════ */}
        <section id="top" style={{ position: "relative", padding: "clamp(44px,6vw,84px) 22px clamp(56px,7vw,96px)" }}>
          <div style={{ position: "absolute", pointerEvents: "none", borderRadius: "50%", top: "-80px", right: "-60px", width: "460px", height: "440px", filter: "blur(20px)", background: "radial-gradient(circle,rgba(47,158,144,.28),transparent 66%)" }} />
          <div style={{ position: "absolute", pointerEvents: "none", borderRadius: "50%", bottom: "-120px", left: "-80px", width: "420px", height: "420px", filter: "blur(24px)", background: "radial-gradient(circle,rgba(232,149,109,.24),transparent 66%)" }} />
          <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", display: "flex", gap: "clamp(28px,4vw,64px)", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: "1 1 440px", minWidth: "300px" }}>
              <h1 style={{ fontWeight: "700", fontSize: "clamp(38px,5.2vw,64px)", lineHeight: "1.02", letterSpacing: "-.035em", margin: "0 0 20px", textWrap: "pretty" }}>
                {t("Ton dressing Vinted,")}{" "}
                <span style={{ backgroundImage: "linear-gradient(90deg,#2F9E90 0%,#2F9E90 40%,#6FDFD3 50%,#2F9E90 60%,#2F9E90 100%)", backgroundSize: "300% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "fsShimmer 4.5s ease-in-out infinite" }}>{t("publié aussi sur Leboncoin, eBay et Beebs.")}</span>
              </h1>
              <p style={{ fontWeight: "500", fontSize: "clamp(16px,1.5vw,19px)", lineHeight: "1.55", color: "#5C6560", maxWidth: "520px", margin: "0 0 30px", textWrap: "pretty" }}>
                {t("Tu importes ton dressing en un clic. L'IA écrit les annonces. FillSell les publie sur les 4 plateformes avec tes propres comptes, et republie les tiennes sur Vinted pour qu'elles remontent.")}
              </p>
              <div style={{ display: "flex", gap: "13px", flexWrap: "wrap", alignItems: "center" }}>
                <a href="/login?mode=signup" onClick={onSignup("hero")} style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontWeight: "700", fontSize: "15.5px", color: "#fff", padding: "15px 26px", borderRadius: "14px", background: "linear-gradient(135deg,#2F9E90,#1B6E62)", boxShadow: "0 12px 26px -10px rgba(27,110,98,.55)", whiteSpace: "nowrap" }}>
                  {t("Commencer gratuitement")}{" "}
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0" }}>
                    <path d="M5 12h14" />
                    <path d="M13 6l6 6-6 6" />
                  </svg>
                </a>
                <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={onExtension} style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontWeight: "700", fontSize: "15px", color: "#1B6E62", padding: "14px 22px", borderRadius: "14px", border: "1.5px solid #1B6E62", whiteSpace: "nowrap" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0" }}>
                    <path d="M14 3a2 2 0 0 1 2 2v1h2a2 2 0 0 1 2 2v3h-1a2 2 0 1 0 0 4h1v3a2 2 0 0 1-2 2h-3v-1a2 2 0 1 0-4 0v1H8a2 2 0 0 1-2-2v-3H5a2 2 0 1 1 0-4h1V8a2 2 0 0 1 2-2h2V5a2 2 0 0 1 2-2z" />
                  </svg>
                  {t("Installer l'extension Chrome")}
                </a>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "22px", flexWrap: "wrap" }}>
                {STORE_BADGES_VISIBLE && !isNative && (
                  <>
                    <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ display: "block", lineHeight: "0" }}>
                      <img src={`https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/${lang === "fr" ? "fr-fr" : "en-us"}`} alt={t("Télécharger dans l'App Store")} loading="lazy" style={S_BADGE_APPLE} />
                    </a>
                    <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ display: "block", lineHeight: "0" }}>
                      <img src={`https://play.google.com/intl/en_us/badges/static/images/badges/${lang === "fr" ? "fr" : "en"}_badge_web_generic.png`} alt={t("Disponible sur Google Play")} loading="lazy" style={S_BADGE_GOOGLE} />
                    </a>
                  </>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginTop: "22px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="#2F9E90" style={{ flexShrink: "0", marginTop: "2px" }}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M20 6 9 17l-5-5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
                </svg>
                <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4", color: "#8A8578" }}>{t("Gratuit pour commencer — sans carte bancaire")}</span>
              </div>
            </div>
            {/* Scène : le dressing Vinted part vers les 3 autres plateformes, puis republication */}
            <div style={{ flex: "1 1 440px", minWidth: "290px", display: "flex", justifyContent: "center" }}>
              <div data-hero-stage="1" style={{ position: "relative", width: "440px", height: "454px", flexShrink: "0", borderRadius: "28px", background: "radial-gradient(120% 100% at 0% 0%,#1B6E62,transparent 60%),#10302B", boxShadow: "0 30px 66px -30px rgba(16,32,27,.6)", overflow: "hidden" }}>
                {/* ── Le téléphone : l'écran STOCK, deux articles ────────────
                    Rendu en MARKUP, pas en capture d'écran. La capture du
                    projet Design (uploads/IMG_7764.png) ne peut pas être
                    récupérée entière — l'API la coupe à 256 Kio et seuls 18 %
                    des lignes se décodent. Reconstruit à l'identique d'après
                    la partie lisible + la maquette : en-tête « N annonces
                    restantes » + chip Pro, puis DEUX cartes d'article, et
                    c'est la vignette de la première qui s'envole vers les
                    trois autres plateformes. Avantage sur une image : net à
                    tous les zooms, ~0 octet, et les vraies photos d'articles.

                    ⚠️ La vignette de la carte 1 est l'ANCRE de l'animation :
                    elle est à (12,45) dans l'écran, soit (41,82) dans la
                    scène. Les trois copies volantes partent de là et les
                    deltas des keyframes fsHA/fsHB/fsHC (landing.css) sont
                    calculés depuis ce point vers le centre des trois tuiles
                    de destination. Bouger l'un sans l'autre casse la visée. */}
                <div style={{ position: "absolute", left: "22px", top: "30px", width: "168px", height: "300px", background: "#10201B", borderRadius: "26px", padding: "7px", boxShadow: "0 22px 46px -22px rgba(0,0,0,.6)", animation: "fsFloat 6s ease-in-out infinite" }}>
                  <div style={{ width: "100%", height: "100%", borderRadius: "20px", overflow: "hidden", background: "#F6F5F1", display: "flex", flexDirection: "column" }}>
                    {/* Barre d'état */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 10px 0", fontWeight: "700", fontSize: "7px", color: "#10201B" }}>
                      <span>10:42</span>
                      <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <span style={{ width: "8px", height: "4px", borderRadius: "1px", border: "1px solid #10201B" }} />
                        <span style={{ width: "10px", height: "5px", borderRadius: "1.5px", background: "#2F9E90" }} />
                      </span>
                    </div>
                    {/* En-tête de l'app */}
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "5px 6px 6px" }}>
                      <img src="/icon-192x192.png" alt="" style={{ width: "14px", height: "14px", borderRadius: "4px", display: "block", flexShrink: "0" }} />
                      <span style={{ flex: "1", minWidth: "0", background: "#EDEAE0", borderRadius: "99px", padding: "3px 6px", fontWeight: "600", fontSize: "6.5px", color: "#5C6560", whiteSpace: "nowrap", overflow: "hidden" }}>
                        <b style={{ color: "#10201B" }}>116</b> {t("annonces restantes")}
                      </span>
                      <span style={{ flexShrink: "0", background: "#10302B", color: "#F2C98A", borderRadius: "99px", padding: "3px 7px", fontWeight: "700", fontSize: "6.5px" }}>{t("Pro")}</span>
                    </div>
                    {/* Les deux articles du stock */}
                    {/* flex:1 + overflow:hidden : la 3e carte est COUPÉE par le
                        bas de l'écran, comme dans une vraie liste qui défile —
                        sinon le téléphone montrait deux cartes puis du vide. */}
                    <div style={{ flex: "1", overflow: "hidden", display: "flex", flexDirection: "column", gap: "6px", padding: "0 6px" }}>
                      {[
                        { photo: "/landing/casquette-volcom.webp", titre: "Casquette beige Volcom", prix: "21,00 €" },
                        { photo: "/landing/short-polo.webp", titre: "Short Polo Ralph Lauren", prix: "48,00 €" },
                        { photo: "/landing/tshirt-patagonia.webp", titre: "T-shirt Patagonia noir", prix: "25,00 €" },
                      ].map((a) => (
                        <div key={a.titre} style={{ flexShrink: "0", display: "flex", gap: "6px", background: "#FFFFFF", border: "1px solid #EEEBE3", borderRadius: "9px", padding: "6px" }}>
                          <div style={{ width: "40px", height: "40px", flexShrink: "0", borderRadius: "7px", backgroundImage: `url(${a.photo})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                          <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                            <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "2px", background: "#E7F4F1", color: "#1B6E62", borderRadius: "99px", padding: "1px 5px", fontWeight: "700", fontSize: "5.5px" }}>
                              <span style={{ width: "3px", height: "3px", borderRadius: "99px", background: "#2F9E90" }} />
                              {t("En ligne")}
                            </span>
                            <span style={{ fontWeight: "700", fontSize: "6.5px", color: "#10201B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t(a.titre)}</span>
                            <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                              <b style={{ fontWeight: "700", fontSize: "7px", color: "#1B6E62" }}>{a.prix}</b>
                              <span style={{ display: "flex", gap: "1.5px", marginLeft: "auto" }}>
                                <PlatformLogo platform="vinted" size={9} />
                                <PlatformLogo platform="leboncoin" size={9} />
                                <PlatformLogo platform="ebay" size={9} />
                                <PlatformLogo platform="beebs" size={9} />
                              </span>
                            </span>
                            <span style={{ display: "block", textAlign: "center", background: "linear-gradient(135deg,#2F9E90,#1B6E62)", color: "#fff", borderRadius: "5px", padding: "2.5px 0", fontWeight: "700", fontSize: "6px" }}>{t("Publier")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Barre d'onglets */}
                    <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-around", borderTop: "1px solid #E7E3D8", background: "#FFFFFF", padding: "5px 0 7px" }}>
                      {[false, true, false, false, false].map((actif, i) => (
                        <span key={i} style={{ width: "12px", height: "3px", borderRadius: "99px", background: actif ? "#2F9E90" : "#D8D3C6" }} />
                      ))}
                    </div>
                  </div>
                </div>
                {/* Les copies qui s'échappent du téléphone vers les 3 autres plateformes */}
                <div style={{ position: "absolute", zIndex: "2", left: "41px", top: "82px", width: "40px", height: "40px", borderRadius: "7px", backgroundImage: "url(/landing/casquette-volcom.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", boxShadow: "0 0 0 2px #F6F5F1,0 8px 18px rgba(0,0,0,.45)", animation: "fsHA 6s cubic-bezier(.45,.05,.2,1) infinite" }} />
                <div style={{ position: "absolute", zIndex: "2", left: "41px", top: "82px", width: "40px", height: "40px", borderRadius: "7px", backgroundImage: "url(/landing/casquette-volcom.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", boxShadow: "0 0 0 2px #F6F5F1,0 8px 18px rgba(0,0,0,.45)", animation: "fsHB 6s cubic-bezier(.45,.05,.2,1) infinite" }} />
                <div style={{ position: "absolute", zIndex: "2", left: "41px", top: "82px", width: "40px", height: "40px", borderRadius: "7px", backgroundImage: "url(/landing/casquette-volcom.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", boxShadow: "0 0 0 2px #F6F5F1,0 8px 18px rgba(0,0,0,.45)", animation: "fsHC 6s cubic-bezier(.45,.05,.2,1) infinite" }} />
                {/* Destinations */}
                <div style={{ position: "absolute", left: "318px", top: "88px", width: "58px", height: "58px", borderRadius: "15px", background: "rgba(246,245,241,.06)", border: "1px solid rgba(78,205,196,.28)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <PlatformLogo platform="leboncoin" size={40} />
                  <span style={{ position: "absolute", right: "-7px", top: "-7px", animation: "fsHTA 6s ease infinite", display: "flex" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#4ECDC4">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M20 6 9 17l-5-5" fill="none" stroke="#10302B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
                    </svg>
                  </span>
                </div>
                <div style={{ position: "absolute", left: "318px", top: "188px", width: "58px", height: "58px", borderRadius: "15px", background: "rgba(246,245,241,.06)", border: "1px solid rgba(78,205,196,.28)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <PlatformLogo platform="ebay" size={40} />
                  <span style={{ position: "absolute", right: "-7px", top: "-7px", animation: "fsHTB 6s ease infinite", display: "flex" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#4ECDC4">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M20 6 9 17l-5-5" fill="none" stroke="#10302B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
                    </svg>
                  </span>
                </div>
                <div style={{ position: "absolute", left: "318px", top: "288px", width: "58px", height: "58px", borderRadius: "15px", background: "rgba(246,245,241,.06)", border: "1px solid rgba(78,205,196,.28)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <PlatformLogo platform="beebs" size={40} />
                  <span style={{ position: "absolute", right: "-7px", top: "-7px", animation: "fsHTC 6s ease infinite", display: "flex" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#4ECDC4">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M20 6 9 17l-5-5" fill="none" stroke="#10302B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
                    </svg>
                  </span>
                </div>
                {/* Republication : uniquement sur Vinted */}
                <div style={{ position: "absolute", left: "22px", top: "356px", right: "22px", display: "flex", alignItems: "center", gap: "14px", padding: "13px 16px", borderRadius: "18px", background: "rgba(78,205,196,.1)", border: "1px solid rgba(78,205,196,.32)", animation: "fsHRepub 6s ease infinite" }}>
                  <div style={{ position: "relative", width: "46px", height: "46px", flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <PlatformLogo platform="vinted" size={32} />
                    <svg width="46" height="46" viewBox="0 0 46 46" style={{ position: "absolute", left: "0", top: "0", animation: "fsRing 2.6s linear infinite" }}>
                      <circle cx="23" cy="23" r="21" fill="none" stroke="rgba(78,205,196,.25)" strokeWidth="2.5" />
                      <circle cx="23" cy="23" r="21" fill="none" stroke="#4ECDC4" strokeWidth="2.5" strokeDasharray="62 70" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={{ minWidth: "0", flex: "1" }}>
                    <div style={{ fontWeight: "700", fontSize: "13.5px", letterSpacing: "-.01em", color: "#4ECDC4" }}>{t("↻ Republication auto sur Vinted")}</div>
                    <div style={{ fontWeight: "500", fontSize: "12px", lineHeight: "1.35", color: "rgba(246,245,241,.78)", marginTop: "3px" }}>{t("Elle remonte en tête des résultats toutes les 24 h.")}</div>
                  </div>
                  <span style={{ position: "relative", display: "inline-block", width: "30px", height: "22px", flexShrink: "0" }}>
                    <span style={{ position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", background: "#4ECDC4", color: "#10302B", fontWeight: "700", fontSize: "12px", animation: "fsCnt1 8.4s ease infinite" }}>{t("×1")}</span>
                    <span style={{ position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", background: "#4ECDC4", color: "#10302B", fontWeight: "700", fontSize: "12px", animation: "fsCnt2 8.4s ease infinite" }}>{t("×2")}</span>
                    <span style={{ position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", background: "#4ECDC4", color: "#10302B", fontWeight: "700", fontSize: "12px", animation: "fsCnt3 8.4s ease infinite" }}>{t("×3")}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* ══════════ PREUVE SOCIALE (bandeau) ══════════ */}
        <section style={{ padding: "0 22px 8px" }}>
          <div data-r="1" data-proof="1" style={{ maxWidth: "1120px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "clamp(12px,2vw,28px)", flexWrap: "nowrap", padding: "16px 26px", borderRadius: "18px", background: "#F6F5F1", border: "1px solid #E7E3D8" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto" }}>
              <svg style={{ flexShrink: "0" }} width="16" height="16" viewBox="0 0 24 24" fill="#2F9E90">
                <circle cx="12" cy="12" r="10" />
                <path d="M20 6 9 17l-5-5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
              </svg>
              <span style={{ fontWeight: "700", fontSize: "13.5px", color: "#10201B", whiteSpace: "nowrap" }}>{t("Import Vinted gratuit et illimité")}</span>
            </div>
            <span data-proof-sep="1" style={{ width: "1px", height: "20px", background: "#D8D3C6", flexShrink: "0" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto" }}>
              <div style={{ display: "flex", gap: "4px", flexShrink: "0" }}>
                <PlatformLogo platform="vinted" size={22} />
                <PlatformLogo platform="leboncoin" size={22} />
                <PlatformLogo platform="ebay" size={22} />
                <PlatformLogo platform="beebs" size={22} />
              </div>
              <span style={{ fontWeight: "600", fontSize: "13.5px", color: "#5C6560", whiteSpace: "nowrap" }}>{t("4 plateformes, tes comptes")}</span>
            </div>
            <span data-proof-3="1" data-proof-sep="1" style={{ width: "1px", height: "20px", background: "#D8D3C6", flexShrink: "0" }} />
            <div data-proof-3="1" style={{ display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto" }}>
              <svg style={{ flexShrink: "0" }} width="16" height="16" viewBox="0 0 24 24" fill="#2F9E90">
                <circle cx="12" cy="12" r="10" />
                <path d="M20 6 9 17l-5-5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
              </svg>
              <span style={{ fontWeight: "600", fontSize: "13.5px", color: "#5C6560", whiteSpace: "nowrap" }}>{t("Sur l'App Store et Google Play")}</span>
            </div>
          </div>
        </section>
        {/* ══════════ LES 3 PILIERS ══════════ */}
        <section style={{ background: "radial-gradient(120% 100% at 0% 0%,#1B6E62,transparent 58%),#10302B", padding: "clamp(52px,6vw,92px) 22px" }}>
          <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", maxWidth: "680px", margin: "0 auto 44px" }}>
              <div style={{ fontWeight: "700", fontSize: "12px", textTransform: "uppercase", letterSpacing: ".12em", color: "#4ECDC4", marginBottom: "14px" }}>{t("Trois choses, c'est tout")}</div>
              <h2 style={{ fontWeight: "700", fontSize: "clamp(28px,3.6vw,44px)", lineHeight: "1.06", letterSpacing: "-.03em", margin: "0", color: "#F6F5F1", textWrap: "pretty" }}>
                {t("Tu importes. On publie partout.")}{" "}
                <span style={{ backgroundImage: "linear-gradient(90deg,#4ECDC4 0%,#4ECDC4 40%,#C6F5EF 50%,#4ECDC4 60%,#4ECDC4 100%)", backgroundSize: "300% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "fsShimmer 4.5s ease-in-out infinite" }}>{t("On republie sur Vinted.")}</span>
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "18px" }}>
              <div data-r="1" style={{ background: "rgba(246,245,241,.05)", border: "1px solid rgba(78,205,196,.22)", borderRadius: "22px", padding: "28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
                  <PlatformLogo platform="vinted" size={44} />
                  <div style={{ fontWeight: "700", fontSize: "32px", letterSpacing: "-.04em", color: "#4ECDC4", lineHeight: "1" }}>{t("1")}</div>
                </div>
                <div style={{ fontWeight: "700", fontSize: "20px", letterSpacing: "-.02em", color: "#F6F5F1", marginBottom: "8px" }}>{t("Ton dressing Vinted entre en un clic")}</div>
                <div style={{ fontWeight: "500", fontSize: "14.5px", lineHeight: "1.55", color: "rgba(246,245,241,.72)" }}>
                  {t("200 annonces déjà en ligne ? Titres, prix, photos : tout arrive dans ton stock. On lit, on ne publie ni ne supprime rien.")}
                </div>
              </div>
              <div data-r="1" style={{ background: "rgba(246,245,241,.05)", border: "1px solid rgba(78,205,196,.22)", borderRadius: "22px", padding: "28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
                  <div style={{ display: "flex", gap: "5px" }}>
                    <PlatformLogo platform="leboncoin" size={30} />
                    <PlatformLogo platform="ebay" size={30} />
                    <PlatformLogo platform="beebs" size={30} />
                  </div>
                  <div style={{ fontWeight: "700", fontSize: "32px", letterSpacing: "-.04em", color: "#4ECDC4", lineHeight: "1" }}>{t("2")}</div>
                </div>
                <div style={{ fontWeight: "700", fontSize: "20px", letterSpacing: "-.02em", color: "#F6F5F1", marginBottom: "8px" }}>{t("Publié sur les 4 plateformes")}</div>
                <div style={{ fontWeight: "500", fontSize: "14.5px", lineHeight: "1.55", color: "rgba(246,245,241,.72)" }}>
                  {t("Un seul ajout part sur Vinted, Leboncoin, eBay et Beebs — avec tes comptes. Quatre fois plus d'acheteurs, pas quatre fois le travail.")}
                </div>
              </div>
              <div data-r="1" style={{ background: "rgba(246,245,241,.05)", border: "1px solid rgba(78,205,196,.22)", borderRadius: "22px", padding: "28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
                  <div style={{ position: "relative", width: "44px", height: "44px", flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <PlatformLogo platform="vinted" size={32} />
                    <svg width="44" height="44" viewBox="0 0 44 44" style={{ position: "absolute", left: "0", top: "0", animation: "fsRing 3.2s linear infinite" }}>
                      <circle cx="22" cy="22" r="20" fill="none" stroke="rgba(78,205,196,.25)" strokeWidth="2.5" />
                      <circle cx="22" cy="22" r="20" fill="none" stroke="#4ECDC4" strokeWidth="2.5" strokeDasharray="58 68" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={{ fontWeight: "700", fontSize: "32px", letterSpacing: "-.04em", color: "#4ECDC4", lineHeight: "1" }}>{t("3")}</div>
                </div>
                <div style={{ fontWeight: "700", fontSize: "20px", letterSpacing: "-.02em", color: "#F6F5F1", marginBottom: "8px" }}>{t("Republiées sur Vinted, toutes seules")}</div>
                <div style={{ fontWeight: "500", fontSize: "14.5px", lineHeight: "1.55", color: "rgba(246,245,241,.72)" }}>
                  {t("Une annonce de trois semaines n'est plus vue. FillSell la remet en haut des résultats : en un tap sur tous les plans, toute seule avec le plan Pro.")}
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* ══════════ COMMENT ÇA MARCHE ══════════ */}
        <section id="comment" style={{ padding: "clamp(56px,7vw,110px) 22px", background: "#F6F5F1", borderBottom: "1px solid #E7E3D8" }}>
          <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", maxWidth: "660px", margin: "0 auto 44px" }}>
              <div style={{ fontWeight: "700", fontSize: "12px", textTransform: "uppercase", letterSpacing: ".12em", color: "#2F9E90", marginBottom: "14px" }}>{t("Comment ça marche")}</div>
              <h2 style={{ fontWeight: "700", fontSize: "clamp(28px,3.6vw,44px)", lineHeight: "1.06", letterSpacing: "-.03em", margin: "0 0 16px", textWrap: "pretty" }}>
                {t("Ton téléphone pilote.")}{" "}
                <span style={{ backgroundImage: "linear-gradient(90deg,#2F9E90 0%,#2F9E90 40%,#6FDFD3 50%,#2F9E90 60%,#2F9E90 100%)", backgroundSize: "300% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "fsShimmer 4.5s ease-in-out infinite" }}>{t("Ton ordinateur exécute.")}</span>
              </h2>
              <p style={{ fontWeight: "500", fontSize: "clamp(15px,1.4vw,18px)", lineHeight: "1.55", color: "#5C6560", margin: "0" }}>
                {t("FillSell ne se connecte jamais à ta place avec tes mots de passe. Une petite extension Chrome, installée une seule fois, remplit les formulaires depuis tes comptes déjà ouverts.")}
              </p>
            </div>
            {/* Schéma animé : téléphone ↔ FillSell ↔ extension */}
            <div data-r="1" style={{ background: "#EDEAE0", border: "1px solid #E7E3D8", borderRadius: "26px", padding: "clamp(26px,3.5vw,46px) clamp(18px,3vw,40px)", marginBottom: "24px" }}>
              <div data-flow="1" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "clamp(10px,2.5vw,34px)", flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", width: "150px" }}>
                  <div style={{ width: "74px", height: "120px", borderRadius: "16px", background: "#10201B", padding: "6px", boxShadow: "0 14px 30px -16px rgba(16,32,27,.5)" }}>
                    <div style={{ width: "100%", height: "100%", borderRadius: "11px", background: "#F6F5F1", display: "flex", flexDirection: "column", gap: "4px", padding: "8px 6px" }}>
                      <div style={{ height: "5px", borderRadius: "99px", background: "#2F9E90", width: "60%" }} />
                      <div style={{ height: "5px", borderRadius: "99px", background: "#D8D3C6" }} />
                      <div style={{ height: "5px", borderRadius: "99px", background: "#D8D3C6", width: "75%" }} />
                      <div style={{ marginTop: "auto", height: "14px", borderRadius: "5px", background: "linear-gradient(135deg,#2F9E90,#1B6E62)" }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: "700", fontSize: "15px" }}>{t("Ton téléphone")}</div>
                    <div style={{ fontWeight: "500", fontSize: "12.5px", color: "#8A8578", lineHeight: "1.4", marginTop: "3px" }}>{t("Tu ajoutes, tu choisis, tu pilotes")}</div>
                  </div>
                </div>
                <svg data-flow-arrow="1" width="86" height="30" viewBox="0 0 86 30" style={{ flexShrink: "0" }}>
                  <path d="M4 15h74" stroke="#D8D3C6" strokeWidth="2" strokeLinecap="round" strokeDasharray="7 7" style={{ animation: "fsDash 1.4s linear infinite" }} />
                  <path d="M70 8l8 7-8 7" fill="none" stroke="#2F9E90" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="4" cy="15" r="4" fill="#2F9E90" />
                </svg>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", width: "150px" }}>
                  <div style={{ position: "relative", width: "96px", height: "96px", borderRadius: "26px", background: "linear-gradient(135deg,#2F9E90,#1B6E62)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 16px 34px -16px rgba(27,110,98,.6)" }}>
                    <img src="/icon-192x192.png" alt="" style={{ width: "56px", height: "56px", borderRadius: "14px", display: "block" }} />
                    <div style={{ position: "absolute", inset: "-7px", borderRadius: "32px", border: "1.5px solid rgba(47,158,144,.35)", animation: "fsPulse 2.6s ease infinite" }} />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: "700", fontSize: "15px" }}>{t("FillSell")}</div>
                    <div style={{ fontWeight: "500", fontSize: "12.5px", color: "#8A8578", lineHeight: "1.4", marginTop: "3px" }}>{t("Met tes annonces en file d'attente")}</div>
                  </div>
                </div>
                <svg data-flow-arrow="1" width="86" height="30" viewBox="0 0 86 30" style={{ flexShrink: "0" }}>
                  <path d="M4 15h74" stroke="#D8D3C6" strokeWidth="2" strokeLinecap="round" strokeDasharray="7 7" style={{ animation: "fsDash 1.4s linear infinite .3s" }} />
                  <path d="M70 8l8 7-8 7" fill="none" stroke="#2F9E90" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="4" cy="15" r="4" fill="#2F9E90" />
                </svg>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", width: "170px" }}>
                  <div style={{ width: "150px", height: "104px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ width: "150px", height: "92px", borderRadius: "10px 10px 3px 3px", background: "#10201B", padding: "7px 7px 9px", boxShadow: "0 14px 30px -16px rgba(16,32,27,.5)" }}>
                      <div style={{ width: "100%", height: "100%", borderRadius: "6px", background: "#F6F5F1", padding: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <PlatformLogo platform="vinted" size={12} />
                          <PlatformLogo platform="leboncoin" size={12} />
                          <PlatformLogo platform="ebay" size={12} />
                          <PlatformLogo platform="beebs" size={12} />
                          <span style={{ marginLeft: "auto", fontWeight: "700", fontSize: "7px", letterSpacing: ".06em", color: "#2F9E90" }}>{t("EXTENSION")}</span>
                        </div>
                        <div style={{ height: "4px", borderRadius: "99px", background: "#D8D3C6" }} />
                        <div style={{ height: "4px", borderRadius: "99px", background: "#D8D3C6", width: "70%" }} />
                        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
                          <div style={{ width: "9px", height: "9px", borderRadius: "99px", border: "1.5px solid #D8D3C6", borderTopColor: "#2F9E90", animation: "fsSpin .9s linear infinite" }} />
                          <span style={{ fontWeight: "600", fontSize: "7.5px", color: "#8A8578" }}>{t("Publication en cours…")}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ width: "56px", height: "5px", background: "#0B1714", borderRadius: "0 0 4px 4px" }} />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontWeight: "700", fontSize: "15px" }}>{t("Ton ordinateur")}</div>
                    <div style={{ fontWeight: "500", fontSize: "12.5px", color: "#8A8578", lineHeight: "1.4", marginTop: "3px" }}>{t("Publie avec tes comptes — jamais tes mots de passe")}</div>
                  </div>
                </div>
              </div>
            </div>
            <div data-r="1" style={{ maxWidth: "660px", margin: "0 auto", textAlign: "center", background: "#EDEAE0", border: "1px solid #E7E3D8", borderRadius: "16px", padding: "17px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "18px" }}>{t("🔌")}</span>
              <span style={{ fontWeight: "700", fontSize: "15px", lineHeight: "1.5", textWrap: "pretty" }}>
                {t("Ton ordinateur est éteint ? Rien n'est perdu — tes annonces attendent en file et partent à la prochaine ouverture de Chrome.")}
              </span>
            </div>
            <div data-r="1" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", flexWrap: "wrap", marginTop: "22px" }}>
              <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={onExtension} style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontWeight: "700", fontSize: "15px", color: "#fff", padding: "14px 24px", borderRadius: "14px", background: "linear-gradient(135deg,#2F9E90,#1B6E62)", boxShadow: "0 12px 26px -10px rgba(27,110,98,.55)", whiteSpace: "nowrap" }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0" }}>
                  <path d="M14 3a2 2 0 0 1 2 2v1h2a2 2 0 0 1 2 2v3h-1a2 2 0 1 0 0 4h1v3a2 2 0 0 1-2 2h-3v-1a2 2 0 1 0-4 0v1H8a2 2 0 0 1-2-2v-3H5a2 2 0 1 1 0-4h1V8a2 2 0 0 1 2-2h2V5a2 2 0 0 1 2-2z" />
                </svg>
                {t("Installer l'extension Chrome")}
              </a>
              <span style={{ fontWeight: "600", fontSize: "13.5px", color: "#8A8578" }}>{t("Gratuite · installée une seule fois · aucun mot de passe")}</span>
            </div>
          </div>
        </section>
        {/* ══════════ IMPORT VINTED ══════════ */}
        <section id="import" style={{ background: "radial-gradient(110% 120% at 100% 0%,rgba(78,205,196,.16),transparent 55%),#10302B", padding: "clamp(56px,7vw,110px) 22px" }}>
          <div style={{ maxWidth: "1120px", margin: "0 auto", display: "flex", gap: "clamp(28px,4vw,64px)", flexWrap: "wrap-reverse", alignItems: "center", justifyContent: "center" }}>
            {/* Visuel : le dressing qui se remplit */}
            <div data-r="1" style={{ flex: "1 1 340px", minWidth: "290px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: "340px", background: "rgba(246,245,241,.05)", border: "1px solid rgba(78,205,196,.22)", borderRadius: "24px", padding: "22px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <PlatformLogo platform="vinted" size={30} />
                  <div style={{ fontWeight: "700", fontSize: "14.5px", color: "#F6F5F1" }}>{t("Mon dressing Vinted")}</div>
                  <span style={{ marginLeft: "auto", fontWeight: "700", fontSize: "11.5px", letterSpacing: ".04em", color: "#4ECDC4", background: "rgba(78,205,196,.12)", border: "1px solid rgba(78,205,196,.3)", borderRadius: "999px", padding: "4px 10px", whiteSpace: "nowrap" }}>{t("Lecture seule")}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "9px" }}>
                  <div style={{ aspectRatio: "1", minWidth: "0", borderRadius: "12px", backgroundImage: "url(/landing/casquette-volcom.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", animation: "fsTile 4.6s ease infinite 0s" }} />
                  <div style={{ aspectRatio: "1", minWidth: "0", borderRadius: "12px", backgroundImage: "url(/landing/tshirt-graphique.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", animation: "fsTile 4.6s ease infinite .12s" }} />
                  <div style={{ aspectRatio: "1", minWidth: "0", borderRadius: "12px", backgroundImage: "url(/landing/short-polo.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", animation: "fsTile 4.6s ease infinite .24s" }} />
                  <div style={{ aspectRatio: "1", minWidth: "0", borderRadius: "12px", backgroundImage: "url(/landing/sweat-redbull.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", animation: "fsTile 4.6s ease infinite .36s" }} />
                  <div style={{ aspectRatio: "1", minWidth: "0", borderRadius: "12px", backgroundImage: "url(/landing/tshirt-patagonia.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", animation: "fsTile 4.6s ease infinite .48s" }} />
                  <div style={{ aspectRatio: "1", minWidth: "0", borderRadius: "12px", backgroundImage: "url(/landing/chaussures-cyrillus.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", animation: "fsTile 4.6s ease infinite .6s" }} />
                  <div style={{ aspectRatio: "1", minWidth: "0", borderRadius: "12px", backgroundImage: "url(/landing/tshirt-ours.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", animation: "fsTile 4.6s ease infinite .72s" }} />
                  <div style={{ aspectRatio: "1", minWidth: "0", borderRadius: "12px", backgroundImage: "url(/landing/sweat-ohlins.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", animation: "fsTile 4.6s ease infinite .84s" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "9px", marginTop: "16px", paddingTop: "15px", borderTop: "1px solid rgba(78,205,196,.18)" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="#4ECDC4" style={{ flexShrink: "0" }}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M20 6 9 17l-5-5" fill="none" stroke="#10302B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
                  </svg>
                  <span style={{ fontWeight: "700", fontSize: "13px", color: "#4ECDC4" }}>{t("214 annonces importées")}</span>
                  <span style={{ marginLeft: "auto", fontWeight: "500", fontSize: "12px", color: "rgba(246,245,241,.6)" }}>{t("en 40 secondes")}</span>
                </div>
              </div>
            </div>
            <div style={{ flex: "1 1 380px", minWidth: "300px" }}>
              <div style={{ fontWeight: "700", fontSize: "12px", textTransform: "uppercase", letterSpacing: ".12em", color: "#4ECDC4", marginBottom: "14px" }}>{t("Import Vinted")}</div>
              <h2 style={{ fontWeight: "700", fontSize: "clamp(28px,3.6vw,44px)", lineHeight: "1.06", letterSpacing: "-.03em", margin: "0 0 16px", color: "#F6F5F1", textWrap: "pretty" }}>
                {t("Tu as déjà 200 annonces sur Vinted ?")}{" "}
                <span style={{ backgroundImage: "linear-gradient(90deg,#4ECDC4 0%,#4ECDC4 40%,#C6F5EF 50%,#4ECDC4 60%,#4ECDC4 100%)", backgroundSize: "300% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "fsShimmer 4.5s ease-in-out infinite" }}>{t("Tu ne les refais pas.")}</span>
              </h2>
              <p style={{ fontWeight: "500", fontSize: "clamp(15px,1.4vw,18px)", lineHeight: "1.55", color: "rgba(246,245,241,.74)", maxWidth: "480px", margin: "0 0 24px", textWrap: "pretty" }}>
                {t("FillSell importe ton dressing en un clic : titres, prix, photos, tout arrive dans ton stock. On lit tes annonces — on ne publie, ne modifie ni ne supprime rien. Ensuite, tu choisis lesquelles envoyer sur Leboncoin, eBay et Beebs.")}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                <a href="/login?mode=signup" onClick={onSignup("import")} style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontWeight: "700", fontSize: "15px", color: "#10302B", padding: "14px 24px", borderRadius: "14px", background: "#4ECDC4" }}>
                  {t("Importer mon dressing")}{" "}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="M13 6l6 6-6 6" />
                  </svg>
                </a>
                <span style={{ fontWeight: "600", fontSize: "13.5px", color: "rgba(246,245,241,.7)" }}>{t("Import gratuit et illimité")}</span>
              </div>
            </div>
          </div>
        </section>
        {/* ══════════ PUBLICATION 1 → 4 ══════════ */}
        <section id="publication" style={{ padding: "clamp(56px,7vw,110px) 22px" }}>
          <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", maxWidth: "680px", margin: "0 auto 44px" }}>
              <div style={{ fontWeight: "700", fontSize: "12px", textTransform: "uppercase", letterSpacing: ".12em", color: "#2F9E90", marginBottom: "14px" }}>{t("Publication")}</div>
              <h2 style={{ fontWeight: "700", fontSize: "clamp(28px,3.6vw,44px)", lineHeight: "1.06", letterSpacing: "-.03em", margin: "0 0 16px", textWrap: "pretty" }}>
                {t("Une annonce.")}{" "}
                <span style={{ backgroundImage: "linear-gradient(90deg,#2F9E90 0%,#2F9E90 40%,#6FDFD3 50%,#2F9E90 60%,#2F9E90 100%)", backgroundSize: "300% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "fsShimmer 4.5s ease-in-out infinite" }}>{t("Quatre plateformes.")}</span>
              </h2>
              <p style={{ fontWeight: "500", fontSize: "clamp(15px,1.4vw,18px)", lineHeight: "1.55", color: "#5C6560", margin: "0", textWrap: "pretty" }}>
                {t("Tu remplis une fois. FillSell publie sur Vinted, Leboncoin, eBay et Beebs avec tes comptes. Quatre fois plus d'acheteurs devant le même article, sans quatre fois le travail.")}
              </p>
            </div>
            <div data-r="1" style={{ background: "#F6F5F1", border: "1px solid #E7E3D8", borderRadius: "26px", padding: "clamp(28px,4vw,52px) clamp(20px,3vw,44px)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "clamp(16px,3vw,40px)", flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                  <div style={{ position: "relative", width: "116px", height: "116px" }}>
                    <div style={{ width: "116px", height: "116px", borderRadius: "22px", overflow: "hidden", backgroundImage: "url(/landing/chaussures-cyrillus.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", boxShadow: "0 12px 28px -14px rgba(16,32,27,.4)" }} />
                  </div>
                  <span style={{ fontWeight: "700", fontSize: "13px", color: "#5C6560" }}>{t("1 seul ajout")}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <svg width="60" height="24" viewBox="0 0 60 24">
                    <path d="M2 12h50" stroke="#D8D3C6" strokeWidth="2" strokeLinecap="round" strokeDasharray="6 6" style={{ animation: "fsDash 1.2s linear infinite" }} />
                    <path d="M44 5l8 7-8 7" fill="none" stroke="#2F9E90" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ fontWeight: "700", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".08em", color: "#8A8578" }}>{t("Automatique")}</span>
                </div>
                <div data-pubgrid="1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "11px" }}>
                  <div style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: "9px", background: "#EDEAE0", border: "1px solid #E7E3D8", borderRadius: "13px", padding: "12px 15px" }}>
                    <div style={{ position: "absolute", zIndex: "2", right: "10px", top: "50%", width: "28px", height: "28px", borderRadius: "8px", backgroundImage: "url(/landing/chaussures-cyrillus.webp)", backgroundSize: "cover", backgroundPosition: "center", boxShadow: "0 0 0 2px #F6F5F1,0 6px 14px rgba(16,32,27,.3)", animation: "fsArrA 5.2s cubic-bezier(.45,.05,.2,1) infinite" }} />
                    <PlatformLogo platform="vinted" size={30} />
                    <span style={{ fontWeight: "700", fontSize: "13px", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("Vinted")}</span>
                    <span style={{ flex: "1" }} />
                    <span style={{ flexShrink: "0", animation: "fsTick 5.2s ease infinite", display: "flex" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#2F9E90">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M20 6 9 17l-5-5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
                      </svg>
                    </span>
                  </div>
                  <div style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: "9px", background: "#EDEAE0", border: "1px solid #E7E3D8", borderRadius: "13px", padding: "12px 15px" }}>
                    <div style={{ position: "absolute", zIndex: "2", right: "10px", top: "50%", width: "28px", height: "28px", borderRadius: "8px", backgroundImage: "url(/landing/chaussures-cyrillus.webp)", backgroundSize: "cover", backgroundPosition: "center", boxShadow: "0 0 0 2px #F6F5F1,0 6px 14px rgba(16,32,27,.3)", animation: "fsArrB 5.2s cubic-bezier(.45,.05,.2,1) infinite" }} />
                    <PlatformLogo platform="leboncoin" size={30} />
                    <span style={{ fontWeight: "700", fontSize: "13px", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("leboncoin")}</span>
                    <span style={{ flex: "1" }} />
                    <span style={{ flexShrink: "0", animation: "fsTickB 5.2s ease infinite", display: "flex" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#2F9E90">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M20 6 9 17l-5-5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
                      </svg>
                    </span>
                  </div>
                  <div style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: "9px", background: "#EDEAE0", border: "1px solid #E7E3D8", borderRadius: "13px", padding: "12px 15px" }}>
                    <div style={{ position: "absolute", zIndex: "2", right: "10px", top: "50%", width: "28px", height: "28px", borderRadius: "8px", backgroundImage: "url(/landing/chaussures-cyrillus.webp)", backgroundSize: "cover", backgroundPosition: "center", boxShadow: "0 0 0 2px #F6F5F1,0 6px 14px rgba(16,32,27,.3)", animation: "fsArrC 5.2s cubic-bezier(.45,.05,.2,1) infinite" }} />
                    <PlatformLogo platform="ebay" size={30} />
                    <span style={{ fontWeight: "700", fontSize: "13px", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("eBay")}</span>
                    <span style={{ flex: "1" }} />
                    <span style={{ flexShrink: "0", animation: "fsTickC 5.2s ease infinite", display: "flex" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#2F9E90">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M20 6 9 17l-5-5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
                      </svg>
                    </span>
                  </div>
                  <div style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: "9px", background: "#EDEAE0", border: "1px solid #E7E3D8", borderRadius: "13px", padding: "12px 15px" }}>
                    <div style={{ position: "absolute", zIndex: "2", right: "10px", top: "50%", width: "28px", height: "28px", borderRadius: "8px", backgroundImage: "url(/landing/chaussures-cyrillus.webp)", backgroundSize: "cover", backgroundPosition: "center", boxShadow: "0 0 0 2px #F6F5F1,0 6px 14px rgba(16,32,27,.3)", animation: "fsArrD 5.2s cubic-bezier(.45,.05,.2,1) infinite" }} />
                    <PlatformLogo platform="beebs" size={30} />
                    <span style={{ fontWeight: "700", fontSize: "13px", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("Beebs")}</span>
                    <span style={{ flex: "1" }} />
                    <span style={{ flexShrink: "0", animation: "fsTickD 5.2s ease infinite", display: "flex" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#2F9E90">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M20 6 9 17l-5-5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* ══════════ REPUBLICATION ══════════ */}
        <section id="republication" style={{ background: "radial-gradient(110% 120% at 0% 100%,rgba(78,205,196,.15),transparent 55%),#10302B", padding: "clamp(56px,7vw,110px) 22px" }}>
          <div style={{ maxWidth: "1120px", margin: "0 auto", display: "flex", gap: "clamp(28px,4vw,64px)", flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
            <div style={{ flex: "1 1 380px", minWidth: "300px" }}>
              <div style={{ fontWeight: "700", fontSize: "12px", textTransform: "uppercase", letterSpacing: ".12em", color: "#4ECDC4", marginBottom: "14px" }}>{t("Republication Vinted")}</div>
              <h2 style={{ fontWeight: "700", fontSize: "clamp(28px,3.6vw,44px)", lineHeight: "1.06", letterSpacing: "-.03em", margin: "0 0 16px", color: "#F6F5F1", textWrap: "pretty" }}>
                {t("Tes annonces qui dorment")}{" "}
                <span style={{ backgroundImage: "linear-gradient(90deg,#4ECDC4 0%,#4ECDC4 40%,#C6F5EF 50%,#4ECDC4 60%,#4ECDC4 100%)", backgroundSize: "300% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "fsShimmer 4.5s ease-in-out infinite" }}>{t("remontent toutes seules.")}</span>
              </h2>
              <p style={{ fontWeight: "500", fontSize: "clamp(15px,1.4vw,18px)", lineHeight: "1.55", color: "rgba(246,245,241,.74)", maxWidth: "480px", margin: "0 0 22px", textWrap: "pretty" }}>
                {t("Sur Vinted, une annonce de trois semaines n'existe plus pour les acheteurs. FillSell la remet en haut des résultats, au rythme naturel d'un vendeur actif. Tes articles restent visibles : en un tap sur tous les plans, tout seul avec le plan Pro.")}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "11px", maxWidth: "460px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "11px" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#4ECDC4" style={{ flexShrink: "0", marginTop: "2px" }}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M20 6 9 17l-5-5" fill="none" stroke="#10302B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
                  </svg>
                  <span style={{ fontWeight: "500", fontSize: "14.5px", lineHeight: "1.45", color: "#F6F5F1" }}>{t("Toujours en haut des résultats, là où les acheteurs regardent")}</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "11px" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#4ECDC4" style={{ flexShrink: "0", marginTop: "2px" }}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M20 6 9 17l-5-5" fill="none" stroke="#10302B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
                  </svg>
                  <span style={{ fontWeight: "500", fontSize: "14.5px", lineHeight: "1.45", color: "#F6F5F1" }}>{t("Au rythme d'un vrai vendeur — ton compte reste serein")}</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "11px" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#4ECDC4" style={{ flexShrink: "0", marginTop: "2px" }}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M20 6 9 17l-5-5" fill="none" stroke="#10302B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" transform="scale(0.72) translate(4.6,4.6)" />
                  </svg>
                  <span style={{ fontWeight: "500", fontSize: "14.5px", lineHeight: "1.45", color: "#F6F5F1" }}>{t("Tu remontes tes annonces en un tap, ou tu laisses le plan Pro le faire pour toi")}</span>
                </div>
              </div>
            </div>
            {/* Visuel : anneau + compteur + remontée dans les résultats */}
            <div data-r="1" style={{ flex: "1 1 340px", minWidth: "290px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: "340px", background: "rgba(246,245,241,.05)", border: "1px solid rgba(78,205,196,.22)", borderRadius: "24px", padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
                  <div style={{ position: "relative", width: "84px", height: "84px", flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <PlatformLogo platform="vinted" size={58} />
                    <svg width="84" height="84" viewBox="0 0 84 84" style={{ position: "absolute", left: "0", top: "0", animation: "fsRing 2.8s linear infinite" }}>
                      <circle cx="42" cy="42" r="39" fill="none" stroke="rgba(78,205,196,.22)" strokeWidth="4" />
                      <circle cx="42" cy="42" r="39" fill="none" stroke="#4ECDC4" strokeWidth="4" strokeDasharray="110 135" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={{ minWidth: "0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontWeight: "700", fontSize: "16px", letterSpacing: "-.02em", color: "#4ECDC4", whiteSpace: "nowrap" }}>{t("Republication auto")}</span>
                      <span style={{ position: "relative", display: "inline-block", width: "34px", height: "24px" }}>
                        <span style={{ position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", background: "#4ECDC4", color: "#10302B", fontWeight: "700", fontSize: "13px", animation: "fsCnt1 8.4s ease infinite" }}>{t("×1")}</span>
                        <span style={{ position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", background: "#4ECDC4", color: "#10302B", fontWeight: "700", fontSize: "13px", animation: "fsCnt2 8.4s ease infinite" }}>{t("×2")}</span>
                        <span style={{ position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", background: "#4ECDC4", color: "#10302B", fontWeight: "700", fontSize: "13px", animation: "fsCnt3 8.4s ease infinite" }}>{t("×3")}</span>
                      </span>
                    </div>
                    <div style={{ fontWeight: "500", fontSize: "13px", lineHeight: "1.35", color: "rgba(246,245,241,.75)", marginTop: "5px" }}>{t("Elle remonte en tête des résultats toutes les 24 h.")}</div>
                  </div>
                </div>
                <div style={{ fontWeight: "700", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".1em", color: "rgba(246,245,241,.5)", marginBottom: "10px" }}>{t("Résultats Vinted")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px", borderRadius: "11px", background: "rgba(78,205,196,.14)", border: "1px solid rgba(78,205,196,.4)" }}>
                    <div style={{ width: "30px", height: "30px", borderRadius: "8px", flexShrink: "0", backgroundImage: "url(/landing/short-polo.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} />
                    <span style={{ fontWeight: "700", fontSize: "12.5px", color: "#F6F5F1" }}>{t("Ton annonce")}</span>
                    <span style={{ flex: "1" }} />
                    <span style={{ fontWeight: "700", fontSize: "10.5px", letterSpacing: ".05em", color: "#10302B", background: "#4ECDC4", borderRadius: "999px", padding: "3px 8px" }}>{t("1re")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px", borderRadius: "11px", background: "rgba(246,245,241,.04)", border: "1px solid rgba(246,245,241,.1)" }}>
                    <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "rgba(246,245,241,.12)", flexShrink: "0" }} />
                    <span style={{ height: "7px", width: "96px", borderRadius: "99px", background: "rgba(246,245,241,.14)" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px", borderRadius: "11px", background: "rgba(246,245,241,.04)", border: "1px solid rgba(246,245,241,.1)" }}>
                    <div style={{ width: "30px", height: "30px", borderRadius: "8px", background: "rgba(246,245,241,.12)", flexShrink: "0" }} />
                    <span style={{ height: "7px", width: "72px", borderRadius: "99px", background: "rgba(246,245,241,.14)" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* ══════════ VENDU → RETRAIT ══════════ */}
        <section id="vendu" style={{ padding: "clamp(56px,7vw,110px) 22px", background: "#F6F5F1", borderTop: "1px solid #E7E3D8", borderBottom: "1px solid #E7E3D8" }}>
          <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", maxWidth: "680px", margin: "0 auto 44px" }}>
              <div style={{ fontWeight: "700", fontSize: "12px", textTransform: "uppercase", letterSpacing: ".12em", color: "#2F9E90", marginBottom: "14px" }}>{t("Après la vente")}</div>
              <h2 style={{ fontWeight: "700", fontSize: "clamp(28px,3.6vw,44px)", lineHeight: "1.06", letterSpacing: "-.03em", margin: "0 0 16px", textWrap: "pretty" }}>
                {t("Vendu sur une plateforme ? Tu retires les autres")}{" "}
                <span style={{ backgroundImage: "linear-gradient(90deg,#2F9E90 0%,#2F9E90 40%,#6FDFD3 50%,#2F9E90 60%,#2F9E90 100%)", backgroundSize: "300% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "fsShimmer 4.5s ease-in-out infinite" }}>{t("en un tap.")}</span>
              </h2>
              <p style={{ fontWeight: "500", fontSize: "clamp(15px,1.4vw,18px)", lineHeight: "1.55", color: "#5C6560", margin: "0", textWrap: "pretty" }}>
                {t("FillSell détecte la vente et te prévient. Tu confirmes, il retire les annonces des trois autres plateformes. Fini les acheteurs à qui tu dois expliquer que l'article est déjà parti.")}
              </p>
            </div>
            <div data-r="1" style={{ maxWidth: "560px", margin: "0 auto", background: "#EDEAE0", border: "1px solid #E7E3D8", borderRadius: "24px", padding: "26px", boxShadow: "0 18px 44px -24px rgba(16,32,27,.28)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 15px", borderRadius: "14px", background: "rgba(47,158,144,.1)", border: "1px solid rgba(47,158,144,.28)", marginBottom: "18px" }}>
                <PlatformLogo platform="vinted" size={34} />
                <div style={{ minWidth: "0" }}>
                  <div style={{ fontWeight: "700", fontSize: "14.5px", color: "#1B6E62" }}>{t("Vendu sur Vinted — 21 €")}</div>
                  <div style={{ fontWeight: "500", fontSize: "12.5px", color: "#5C6560", marginTop: "2px" }}>{t("Casquette beige Volcom")}</div>
                </div>
                <span style={{ marginLeft: "auto", flexShrink: "0", fontSize: "20px" }}>{t("💰")}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                <span style={{ fontWeight: "700", fontSize: "11px", textTransform: "uppercase", letterSpacing: ".09em", color: "#8A8578" }}>{t("Retiré des 3 autres")}</span>
                <span style={{ flex: "1", height: "1px", background: "#D8D3C6" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "10px", padding: "10px 13px", borderRadius: "12px", background: "#F6F5F1", border: "1px solid #E7E3D8", animation: "fsFade 4.4s ease infinite" }}>
                  <PlatformLogo platform="leboncoin" size={26} />
                  <span style={{ fontWeight: "700", fontSize: "13px", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("leboncoin")}</span>
                  <span style={{ flex: "1" }} />
                  <span style={{ fontWeight: "600", fontSize: "12px", color: "#8A8578" }}>{t("Annonce retirée")}</span>
                  <span style={{ position: "absolute", left: "13px", right: "13px", top: "50%", height: "1.5px", background: "rgba(176,57,47,.65)", transformOrigin: "left", animation: "fsStrike 4.4s ease infinite" }} />
                </div>
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "10px", padding: "10px 13px", borderRadius: "12px", background: "#F6F5F1", border: "1px solid #E7E3D8", animation: "fsFade 4.4s ease infinite .18s" }}>
                  <PlatformLogo platform="ebay" size={26} />
                  <span style={{ fontWeight: "700", fontSize: "13px", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("eBay")}</span>
                  <span style={{ flex: "1" }} />
                  <span style={{ fontWeight: "600", fontSize: "12px", color: "#8A8578" }}>{t("Annonce retirée")}</span>
                  <span style={{ position: "absolute", left: "13px", right: "13px", top: "50%", height: "1.5px", background: "rgba(176,57,47,.65)", transformOrigin: "left", animation: "fsStrike 4.4s ease infinite .18s" }} />
                </div>
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "10px", padding: "10px 13px", borderRadius: "12px", background: "#F6F5F1", border: "1px solid #E7E3D8", animation: "fsFade 4.4s ease infinite .36s" }}>
                  <PlatformLogo platform="beebs" size={26} />
                  <span style={{ fontWeight: "700", fontSize: "13px", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("Beebs")}</span>
                  <span style={{ flex: "1" }} />
                  <span style={{ fontWeight: "600", fontSize: "12px", color: "#8A8578" }}>{t("Annonce retirée")}</span>
                  <span style={{ position: "absolute", left: "13px", right: "13px", top: "50%", height: "1.5px", background: "rgba(176,57,47,.65)", transformOrigin: "left", animation: "fsStrike 4.4s ease infinite .36s" }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "9px", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid #D8D3C6" }}>
                <span style={{ fontSize: "15px" }}>{t("👆")}</span>
                <span style={{ fontWeight: "600", fontSize: "13px", color: "#5C6560", lineHeight: "1.4" }}>{t("Le retrait attend ta confirmation — jamais dans ton dos.")}</span>
              </div>
            </div>
          </div>
        </section>
        {/* ══════════ L'IA ÉCRIT L'ANNONCE ══════════ */}
        <section id="ia" style={{ background: "radial-gradient(110% 120% at 100% 100%,rgba(232,149,109,.16),transparent 55%),#10302B", padding: "clamp(56px,7vw,110px) 22px" }}>
          <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", maxWidth: "680px", margin: "0 auto 44px" }}>
              <div style={{ fontWeight: "700", fontSize: "12px", textTransform: "uppercase", letterSpacing: ".12em", color: "#4ECDC4", marginBottom: "14px" }}>{t("L'IA fait le travail d'écriture")}</div>
              <h2 style={{ fontWeight: "700", fontSize: "clamp(28px,3.6vw,44px)", lineHeight: "1.06", letterSpacing: "-.03em", margin: "0 0 16px", color: "#F6F5F1", textWrap: "pretty" }}>
                {t("Tu photographies.")}{" "}
                <span style={{ backgroundImage: "linear-gradient(90deg,#4ECDC4 0%,#4ECDC4 40%,#C6F5EF 50%,#4ECDC4 60%,#4ECDC4 100%)", backgroundSize: "300% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "fsShimmer 4.5s ease-in-out infinite" }}>{t("L'IA écrit l'annonce.")}</span>
              </h2>
              <p style={{ fontWeight: "500", fontSize: "clamp(15px,1.4vw,18px)", lineHeight: "1.55", color: "rgba(246,245,241,.74)", margin: "0", textWrap: "pretty" }}>
                {t("Titre, description, catégorie, marque, taille : tout est rempli depuis la photo. Et la photo elle-même est retouchée pour donner envie de cliquer.")}
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "18px" }}>
              {/* L'IA écrit */}
              <div data-r="1" style={{ background: "rgba(246,245,241,.05)", border: "1px solid rgba(78,205,196,.22)", borderRadius: "22px", padding: "26px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "11px", marginBottom: "18px" }}>
                  <span style={{ fontSize: "20px" }}>{t("✨")}</span>
                  <div style={{ fontWeight: "700", fontSize: "17px", color: "#F6F5F1" }}>{t("L'annonce s'écrit toute seule")}</div>
                </div>
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <div style={{ width: "88px", height: "88px", borderRadius: "12px", flexShrink: "0", backgroundImage: "url(/landing/tshirt-patagonia.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", boxShadow: "0 10px 22px -12px rgba(0,0,0,.5)" }} />
                  <div style={{ minWidth: "0", flex: "1", display: "flex", flexDirection: "column", gap: "9px" }}>
                    <div>
                      <div style={{ fontWeight: "700", fontSize: "9.5px", textTransform: "uppercase", letterSpacing: ".1em", color: "rgba(246,245,241,.45)", marginBottom: "4px" }}>{t("Titre")}</div>
                      <div style={{ fontWeight: "700", fontSize: "14px", lineHeight: "1.3", minHeight: "18px", color: "#F6F5F1", animation: "fsWipe 6s ease infinite" }}>{t("T-shirt Patagonia noir")}</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: "700", fontSize: "9.5px", textTransform: "uppercase", letterSpacing: ".1em", color: "rgba(246,245,241,.45)", marginBottom: "4px" }}>{t("Description")}</div>
                      <div style={{ fontWeight: "500", fontSize: "12px", lineHeight: "1.5", minHeight: "54px", color: "rgba(246,245,241,.8)", animation: "fsWipe 6s ease infinite .35s" }}>
                        {t("Coton bio, taille L, logo brodé poitrine, très bon état — porté quelques fois.")}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      <span style={{ fontWeight: "700", fontSize: "10.5px", borderRadius: "999px", padding: "4px 9px", color: "#4ECDC4", background: "rgba(78,205,196,.12)", border: "1px solid rgba(78,205,196,.3)" }}>{t("Mode")}</span>
                      <span style={{ fontWeight: "700", fontSize: "10.5px", borderRadius: "999px", padding: "4px 9px", color: "#4ECDC4", background: "rgba(78,205,196,.12)", border: "1px solid rgba(78,205,196,.3)" }}>{t("Patagonia")}</span>
                      <span style={{ fontWeight: "700", fontSize: "10.5px", borderRadius: "999px", padding: "4px 9px", color: "#E8956D", background: "rgba(232,149,109,.14)", border: "1px solid rgba(232,149,109,.3)" }}>{t("25 €")}</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Retouche photo avant/après */}
              <div data-r="1" style={{ background: "rgba(246,245,241,.05)", border: "1px solid rgba(78,205,196,.22)", borderRadius: "22px", padding: "26px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "11px", marginBottom: "18px" }}>
                  <span style={{ fontSize: "20px" }}>{t("📸")}</span>
                  <div style={{ fontWeight: "700", fontSize: "17px", color: "#F6F5F1" }}>{t("La photo est retouchée")}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "118px", height: "118px", borderRadius: "14px", backgroundImage: "url(/landing/sweat-redbull.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", filter: "saturate(.6) brightness(.86) contrast(.9)" }} />
                    <span style={{ fontWeight: "600", fontSize: "11.5px", color: "rgba(246,245,241,.55)" }}>{t("Ta photo")}</span>
                  </div>
                  <svg width="26" height="16" viewBox="0 0 26 16" style={{ flexShrink: "0" }}>
                    <path d="M2 8h18" stroke="#4ECDC4" strokeWidth="2" strokeLinecap="round" />
                    <path d="M16 3l5 5-5 5" fill="none" stroke="#4ECDC4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                    <div style={{ position: "relative", width: "118px", height: "118px", borderRadius: "14px", overflow: "hidden", background: "linear-gradient(160deg,#fff,#EEF3F1)", boxShadow: "0 12px 26px -14px rgba(0,0,0,.5)" }}>
                      <div style={{ position: "absolute", inset: "0", backgroundImage: "url(/landing/sweat-redbull.webp)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", filter: "saturate(1.12) contrast(1.08) brightness(1.05)", animation: "fsSweep 4.6s ease infinite" }} />
                      <span style={{ position: "absolute", top: "7px", right: "7px", fontWeight: "700", fontSize: "9.5px", color: "#1B6E62", background: "rgba(255,255,255,.94)", border: "1px solid rgba(47,158,144,.3)", borderRadius: "999px", padding: "3px 7px" }}>{t("✨ Retouchée")}</span>
                    </div>
                    <span style={{ fontWeight: "600", fontSize: "11.5px", color: "#4ECDC4" }}>{t("Prête à publier")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* ══════════ STOCK & BÉNÉFICES ══════════ */}
        <section id="gains" style={{ padding: "clamp(56px,7vw,110px) 22px" }}>
          <div style={{ maxWidth: "1120px", margin: "0 auto", display: "flex", gap: "clamp(28px,4vw,64px)", flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
            <div style={{ flex: "1 1 380px", minWidth: "300px" }}>
              <div style={{ fontWeight: "700", fontSize: "12px", textTransform: "uppercase", letterSpacing: ".12em", color: "#2F9E90", marginBottom: "14px" }}>{t("Stock & bénéfices")}</div>
              <h2 style={{ fontWeight: "700", fontSize: "clamp(28px,3.6vw,44px)", lineHeight: "1.06", letterSpacing: "-.03em", margin: "0 0 16px", textWrap: "pretty" }}>
                {t("Ton stock et tes bénéfices,")}{" "}
                <span style={{ backgroundImage: "linear-gradient(90deg,#2F9E90 0%,#2F9E90 40%,#6FDFD3 50%,#2F9E90 60%,#2F9E90 100%)", backgroundSize: "300% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "fsShimmer 4.5s ease-in-out infinite" }}>{t("à jour tout seuls.")}</span>
              </h2>
              <p style={{ fontWeight: "500", fontSize: "clamp(15px,1.4vw,18px)", lineHeight: "1.55", color: "#5C6560", maxWidth: "480px", margin: "0 0 22px", textWrap: "pretty" }}>
                {t("Ce que tu as acheté, ce que tu as vendu, ce qu'il te reste et ce que ça t'a rapporté. Rangé, chiffré, sans tableur à tenir. Chaque vente détectée met la marge à jour toute seule.")}
              </p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontWeight: "700", fontSize: "12.5px", color: "#1B6E62", background: "rgba(47,158,144,.1)", border: "1px solid rgba(47,158,144,.22)", borderRadius: "999px", padding: "7px 13px" }}>{t("🧮 Calcul de marge instantané")}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontWeight: "700", fontSize: "12.5px", color: "#1B6E62", background: "rgba(47,158,144,.1)", border: "1px solid rgba(47,158,144,.22)", borderRadius: "999px", padding: "7px 13px" }}>{t("📄 Import / export Excel")}</span>
              </div>
            </div>
            {/* Dashboard animé */}
            <div data-r="1" style={{ flex: "1 1 360px", minWidth: "290px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: "360px", background: "#F6F5F1", border: "1px solid #E7E3D8", borderRadius: "24px", padding: "22px", boxShadow: "0 18px 44px -26px rgba(16,32,27,.28)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                  <div style={{ fontWeight: "700", fontSize: "15px" }}>{t("Ton mois en un coup d'œil")}</div>
                  <span style={{ fontWeight: "700", fontSize: "11px", color: "#8A8578" }}>{t("Septembre")}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
                  <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.06)", borderRadius: "12px", padding: "13px" }}>
                    <div style={{ fontWeight: "700", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".09em", color: "#A3A9A6", marginBottom: "7px" }}>{t("Bénéfice net")}</div>
                    <div style={{ fontWeight: "700", fontSize: "26px", letterSpacing: "-.03em", lineHeight: "1", color: "#1D9E75" }}>{t("+486,00 €")}</div>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.06)", borderRadius: "12px", padding: "13px" }}>
                    <div style={{ fontWeight: "700", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".09em", color: "#A3A9A6", marginBottom: "7px" }}>{t("Ventes")}</div>
                    <div style={{ fontWeight: "700", fontSize: "26px", letterSpacing: "-.03em", lineHeight: "1" }}>{t("31")}</div>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.06)", borderRadius: "12px", padding: "13px" }}>
                    <div style={{ fontWeight: "700", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".09em", color: "#A3A9A6", marginBottom: "7px" }}>{t("Marge moy.")}</div>
                    <div style={{ fontWeight: "700", fontSize: "26px", letterSpacing: "-.03em", lineHeight: "1", color: "#1D9E75" }}>{t("64 %")}</div>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.06)", borderRadius: "12px", padding: "13px" }}>
                    <div style={{ fontWeight: "700", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".09em", color: "#A3A9A6", marginBottom: "7px" }}>{t("En stock")}</div>
                    <div style={{ fontWeight: "700", fontSize: "26px", letterSpacing: "-.03em", lineHeight: "1" }}>{t("183")}</div>
                  </div>
                </div>
                <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.06)", borderRadius: "12px", padding: "15px 13px 11px" }}>
                  <div style={{ fontWeight: "700", fontSize: "10px", textTransform: "uppercase", letterSpacing: ".09em", color: "#A3A9A6", marginBottom: "13px" }}>{t("Évolution des bénéfices")}</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "7px", height: "78px" }}>
                    <div style={{ flex: "1", height: "34%", borderRadius: "5px 5px 2px 2px", background: "#5DCAA5", transformOrigin: "bottom", animation: "fsBar 1.1s cubic-bezier(.2,.8,.2,1) both" }} />
                    <div style={{ flex: "1", height: "46%", borderRadius: "5px 5px 2px 2px", background: "#5DCAA5", transformOrigin: "bottom", animation: "fsBar 1.1s cubic-bezier(.2,.8,.2,1) .08s both" }} />
                    <div style={{ flex: "1", height: "38%", borderRadius: "5px 5px 2px 2px", background: "#5DCAA5", transformOrigin: "bottom", animation: "fsBar 1.1s cubic-bezier(.2,.8,.2,1) .16s both" }} />
                    <div style={{ flex: "1", height: "62%", borderRadius: "5px 5px 2px 2px", background: "#2F9E90", transformOrigin: "bottom", animation: "fsBar 1.1s cubic-bezier(.2,.8,.2,1) .24s both" }} />
                    <div style={{ flex: "1", height: "54%", borderRadius: "5px 5px 2px 2px", background: "#2F9E90", transformOrigin: "bottom", animation: "fsBar 1.1s cubic-bezier(.2,.8,.2,1) .32s both" }} />
                    <div style={{ flex: "1", height: "78%", borderRadius: "5px 5px 2px 2px", background: "#2F9E90", transformOrigin: "bottom", animation: "fsBar 1.1s cubic-bezier(.2,.8,.2,1) .4s both" }} />
                    <div style={{ flex: "1", height: "100%", borderRadius: "5px 5px 2px 2px", background: "linear-gradient(180deg,#E8956D,#2F9E90)", transformOrigin: "bottom", animation: "fsBar 1.1s cubic-bezier(.2,.8,.2,1) .48s both" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "9px", fontWeight: "600", fontSize: "9.5px", color: "#A3A9A6" }}>
                    <span>{t("Mar")}</span>
                    <span>{t("Avr")}</span>
                    <span>{t("Mai")}</span>
                    <span>{t("Juin")}</span>
                    <span>{t("Juil")}</span>
                    <span>{t("Août")}</span>
                    <span>{t("Sep")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* ══════════ TÉMOIGNAGES — SECTION RETIRÉE (07/09) ══════════
           Le design portait trois citations signées (prénom, ville, volume,
           note 5/5) que son propre commentaire décrivait comme des
           EMPLACEMENTS à remplacer. Publier des avis fabriqués n'est pas
           négociable : la section attend de vrais témoignages, elle est
           prête à revenir telle quelle (voir le projet Claude Design). */}
        {/* ══════════ TARIFS ══════════ */}
        <section id="tarifs" style={{ background: "#F6F5F1", borderTop: "1px solid #E7E3D8", padding: "clamp(56px,7vw,110px) 22px" }}>
          <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", maxWidth: "660px", margin: "0 auto 48px" }}>
              <div style={{ fontWeight: "700", fontSize: "12px", textTransform: "uppercase", letterSpacing: ".12em", color: "#2F9E90", marginBottom: "14px" }}>{t("Tarifs")}</div>
              <h2 style={{ fontWeight: "700", fontSize: "clamp(28px,3.6vw,44px)", lineHeight: "1.06", letterSpacing: "-.03em", margin: "0 0 16px" }}>
                {t("Un plan pour")}{" "}
                <span style={{ backgroundImage: "linear-gradient(90deg,#2F9E90 0%,#2F9E90 40%,#6FDFD3 50%,#2F9E90 60%,#2F9E90 100%)", backgroundSize: "300% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "fsShimmer 4.5s ease-in-out infinite" }}>{t("chaque volume.")}</span>
              </h2>
              <p style={{ fontWeight: "500", fontSize: "clamp(15px,1.4vw,18px)", lineHeight: "1.55", color: "#5C6560", margin: "0" }}>
                {t("Commence gratuitement. Passe Premium, Pro ou Business quand tu veux vendre plus, sans engagement.")}
              </p>
            </div>
            <div data-plans="1" style={{ display: "grid", gridTemplateColumns: `repeat(${BUSINESS_VISIBLE ? 4 : 3},minmax(0,1fr))`, gap: "16px", alignItems: "stretch" }}>
              <div data-r="1" style={{ position: "relative", display: "flex", flexDirection: "column", borderRadius: "24px", padding: "30px 26px", background: "#EDEAE0", border: "1px solid #E7E3D8" }}>
                <div style={{ fontWeight: "700", fontSize: "16px" }}>{t("Gratuit")}</div>
                <div style={{ fontWeight: "500", fontSize: "13px", color: "#8A8578", margin: "4px 0 18px" }}>{t("Pour se lancer")}</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "5px", marginBottom: "22px" }}>
                  <b style={{ fontWeight: "700", fontSize: "40px", letterSpacing: "-.03em", lineHeight: "1" }}>{t("0 €")}</b>
                  <span style={{ fontWeight: "600", fontSize: "13px", color: "#8A8578", marginBottom: "5px" }}>{t("/ mois")}</span>
                </div>
                <div style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: "7px", fontWeight: "700", fontSize: "12px", color: "#1B6E62", background: "rgba(47,158,144,.1)", border: "1px solid rgba(47,158,144,.2)", borderRadius: "999px", padding: "6px 11px", marginBottom: "22px" }}>{t("{ADS_FREE} annonces publiées / mois")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "11px", marginBottom: "26px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F9E90" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4" }}>{t("{REPUB_FREE} republications Vinted offertes, à vie")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F9E90" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4" }}>{t("Import Vinted gratuit et illimité")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F9E90" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4" }}>{t("Publication auto sur Vinted, Leboncoin, eBay & Beebs")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F9E90" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4" }}>{t("Calcul de marge instantané")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F9E90" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4" }}>{t("Suivi de tes ventes")}</span>
                  </div>
                </div>
                <a href="/login?mode=signup" onClick={onSignup("free")} style={{ marginTop: "auto", width: "100%", fontWeight: "700", fontSize: "14px", textAlign: "center", borderRadius: "13px", padding: "13px", color: "#1B6E62", border: "1.5px solid #1B6E62" }}>{t("Commencer gratuitement")}</a>
              </div>
              <div data-r="1" style={{ position: "relative", display: "flex", flexDirection: "column", borderRadius: "24px", padding: "30px 26px", background: "#F6F5F1", border: "1.5px solid #2F9E90", boxShadow: "0 20px 48px -24px rgba(27,110,98,.5)" }}>
                <div style={{ position: "absolute", top: "-13px", left: "50%", transform: "translateX(-50%)", fontWeight: "700", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: ".08em", color: "#fff", background: "linear-gradient(135deg,#37AC9C,#1B6E62)", borderRadius: "999px", padding: "6px 14px", whiteSpace: "nowrap", boxShadow: "0 6px 14px -5px rgba(27,110,98,.6)" }}>{t("Le plus populaire")}</div>
                <div style={{ fontWeight: "700", fontSize: "16px" }}>{t("Premium")}</div>
                <div style={{ fontWeight: "500", fontSize: "13px", color: "#8A8578", margin: "4px 0 18px" }}>{t("Pour vendre régulièrement")}</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "5px", marginBottom: "22px" }}>
                  <b style={{ fontWeight: "700", fontSize: "40px", letterSpacing: "-.03em", lineHeight: "1" }}>{t("12,99 €")}</b>
                  <span style={{ fontWeight: "600", fontSize: "13px", color: "#8A8578", marginBottom: "5px" }}>{t("/ mois")}</span>
                </div>
                <div style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: "7px", fontWeight: "700", fontSize: "12px", color: "#1B6E62", background: "rgba(47,158,144,.1)", border: "1px solid rgba(47,158,144,.2)", borderRadius: "999px", padding: "6px 11px", marginBottom: "22px" }}>{t("{ADS_PREMIUM} annonces publiées / mois")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "11px", marginBottom: "26px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F9E90" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4" }}>{t("{REPUB_PREMIUM} republications Vinted par mois")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F9E90" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4" }}>{t("Retouche IA — {RETOUCHE_PREMIUM} photos par mois")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F9E90" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4" }}>{t("Publication auto sur Vinted, Leboncoin, eBay & Beebs")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F9E90" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4" }}>{t("Import & export Excel de ton stock")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F9E90" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4" }}>{t("Support par email")}</span>
                  </div>
                </div>
                <a href="/login?mode=signup" onClick={onSignup("premium")} style={{ marginTop: "auto", width: "100%", fontWeight: "700", fontSize: "14.5px", textAlign: "center", borderRadius: "13px", padding: "14px", color: "#fff", background: "linear-gradient(120deg,#2F9E90,#1B6E62)", boxShadow: "0 10px 22px -8px rgba(47,158,144,.55)" }}>{t("Passer Premium")}</a>
              </div>
              <div data-r="1" style={{ position: "relative", display: "flex", flexDirection: "column", borderRadius: "24px", padding: "30px 26px", background: "radial-gradient(130% 120% at 100% 0%,rgba(232,149,109,.26),transparent 58%),#10201B", border: "1.5px solid rgba(214,178,96,.5)", boxShadow: "0 22px 50px -24px rgba(16,32,27,.6)" }}>
                <div style={{ fontWeight: "700", fontSize: "16px", color: "#F6F5F1" }}>{t("Pro")}</div>
                <div style={{ fontWeight: "500", fontSize: "13px", color: "rgba(246,245,241,.6)", margin: "4px 0 18px" }}>{t("Pour les gros volumes")}</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "5px", marginBottom: "22px" }}>
                  <b style={{ fontWeight: "700", fontSize: "40px", letterSpacing: "-.03em", lineHeight: "1", color: "#F6F5F1" }}>{t("29,99 €")}</b>
                  <span style={{ fontWeight: "600", fontSize: "13px", color: "rgba(246,245,241,.6)", marginBottom: "5px" }}>{t("/ mois")}</span>
                </div>
                <div style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: "7px", fontWeight: "700", fontSize: "12px", color: "#F2C98A", background: "rgba(232,149,109,.14)", border: "1px solid rgba(214,178,96,.3)", borderRadius: "999px", padding: "6px 11px", marginBottom: "22px" }}>{t("{ADS_PRO} annonces publiées / mois")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "11px", marginBottom: "26px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E7B84C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4", color: "#F6F5F1" }}>{t("{REPUB_PRO} republications Vinted par mois")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E7B84C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4", color: "#F6F5F1" }}>{t("Republication automatique — tes annonces remontent toutes seules")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E7B84C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4", color: "#F6F5F1" }}>{t("Retouche IA — {RETOUCHE_PRO} photos par mois")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E7B84C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4", color: "#F6F5F1" }}>{t("Publication auto sur Vinted, Leboncoin, eBay & Beebs")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E7B84C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4", color: "#F6F5F1" }}>{t("Support prioritaire")}</span>
                  </div>
                </div>
                <a href="/login?mode=signup" onClick={onSignup("pro")} style={{ marginTop: "auto", width: "100%", fontWeight: "700", fontSize: "14.5px", textAlign: "center", borderRadius: "13px", padding: "14px", color: "#10201B", background: "linear-gradient(120deg,#E8956D,#F2B48C)", boxShadow: "0 10px 22px -8px rgba(232,149,109,.5)" }}>{t("Passer Pro")}</a>
              </div>
              {BUSINESS_VISIBLE && (
              <div data-r="1" style={{ position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", borderRadius: "24px", padding: "30px 26px", background: "radial-gradient(140% 110% at 0% 0%,rgba(155,232,220,.16),transparent 55%),radial-gradient(130% 120% at 100% 100%,rgba(242,201,138,.14),transparent 55%),#060B09", border: "1.5px solid rgba(174,233,223,.5)", boxShadow: "0 16px 40px -14px rgba(0,0,0,.65),0 0 30px -8px rgba(174,233,223,.35)" }}>
                <div style={{ fontWeight: "700", fontSize: "16px", backgroundImage: "linear-gradient(135deg,#FFFFFF,#9BE8DC)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", alignSelf: "flex-start" }}>{t("Business")}</div>
                <div style={{ fontWeight: "500", fontSize: "13px", color: "rgba(246,245,241,.6)", margin: "4px 0 18px" }}>{t("Le sommet. Zéro limite.")}</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "5px", marginBottom: "22px" }}>
                  <b style={{ fontWeight: "700", fontSize: "40px", letterSpacing: "-.03em", lineHeight: "1", color: "#F6F5F1" }}>{t("59,99 €")}</b>
                  <span style={{ fontWeight: "600", fontSize: "13px", color: "rgba(246,245,241,.6)", marginBottom: "5px" }}>{t("/ mois")}</span>
                </div>
                <div style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: "7px", fontWeight: "700", fontSize: "12px", color: "#C8F3EC", background: "rgba(155,232,220,.12)", border: "1px solid rgba(155,232,220,.3)", borderRadius: "999px", padding: "6px 11px", marginBottom: "22px" }}>{t("{ADS_BUSINESS} annonces publiées / mois")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "11px", marginBottom: "26px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9BE8DC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4", color: "#F6F5F1" }}>{t("Republications Vinted illimitées — autant que tu veux")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9BE8DC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4", color: "#F6F5F1" }}>{t("Republication automatique — tes annonces remontent toutes seules")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9BE8DC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4", color: "#F6F5F1" }}>{t("Retouche IA — {RETOUCHE_BUSINESS} photos par mois")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9BE8DC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4", color: "#F6F5F1" }}>{t("Publication auto sur Vinted, Leboncoin, eBay & Beebs")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9BE8DC" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: "0", marginTop: "2px" }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span style={{ fontWeight: "500", fontSize: "13.5px", lineHeight: "1.4", color: "#F6F5F1" }}>{t("Support prioritaire")}</span>
                  </div>
                </div>
                <a href="/login?mode=signup" onClick={onSignup("business")} style={{ marginTop: "auto", width: "100%", fontWeight: "700", fontSize: "14.5px", textAlign: "center", borderRadius: "13px", padding: "14px", color: "#060B09", background: "linear-gradient(120deg,#F4FFFD,#9BE8DC 55%,#F2C98A)", boxShadow: "0 10px 26px -8px rgba(174,233,223,.55)" }}>{t("Passer Business")}</a>
              </div>
              )}
            </div>
          </div>
        </section>
        {/* ══════════ FAQ ══════════ */}
        <section id="faq" style={{ padding: "clamp(56px,7vw,110px) 22px", borderTop: "1px solid #E7E3D8" }}>
          <div style={{ maxWidth: "780px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "40px" }}>
              <h2 style={{ fontWeight: "700", fontSize: "clamp(28px,3.6vw,44px)", lineHeight: "1.06", letterSpacing: "-.03em", margin: "0" }}>{t("Les questions qu'on nous pose.")}</h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {FAQ.map(([q, a], i) => (
                <details key={q} open={i === 0} style={{ background: "#F6F5F1", border: "1px solid #E7E3D8", borderRadius: "16px", overflow: "hidden" }}>
                  <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "18px 20px", fontWeight: "700", fontSize: "15.5px" }}>
                    {t(q)}
                    <span style={{ flexShrink: "0", width: "26px", height: "26px", borderRadius: "8px", background: "#EDEAE0", border: "1px solid #E7E3D8", display: "flex", alignItems: "center", justifyContent: "center", color: "#1B6E62", fontWeight: "700", fontSize: "18px" }}>+</span>
                  </summary>
                  <div style={{ padding: "0 20px 20px", fontWeight: "500", fontSize: "14px", lineHeight: "1.6", color: "#5C6560" }}>
                    {t(a)}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
        {/* ══════════ CTA FINAL ══════════ */}
        <section style={{ padding: "0 22px clamp(64px,8vw,110px)" }}>
          <div data-r="1" style={{ position: "relative", overflow: "hidden", maxWidth: "1000px", margin: "0 auto", background: "radial-gradient(120% 140% at 0% 0%,rgba(47,158,144,.9),transparent 55%),radial-gradient(120% 140% at 100% 100%,rgba(232,149,109,.55),transparent 55%),#10201B", borderRadius: "30px", padding: "clamp(40px,6vw,72px) 30px", textAlign: "center" }}>
            <h2 style={{ fontWeight: "700", fontSize: "clamp(28px,4vw,46px)", lineHeight: "1.08", letterSpacing: "-.03em", color: "#fff", margin: "0 auto 14px", maxWidth: "640px", textWrap: "pretty" }}>
              {t("Prêt à publier partout,")}{" "}
              <span style={{ backgroundImage: "linear-gradient(90deg,#4ECDC4 0%,#4ECDC4 40%,#C6F5EF 50%,#4ECDC4 60%,#4ECDC4 100%)", backgroundSize: "300% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "fsShimmer 4.5s ease-in-out infinite" }}>{t("sans effort ?")}</span>
            </h2>
            <p style={{ fontWeight: "500", fontSize: "clamp(15px,1.4vw,18px)", lineHeight: "1.5", color: "rgba(246,245,241,.78)", margin: "0 auto 30px", maxWidth: "520px" }}>
              {t("Importe ton dressing Vinted, laisse l'IA écrire, et vends sur les 4 plateformes. Gratuit pour commencer — sans carte bancaire.")}
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
              <a href="/login?mode=signup" onClick={onSignup("final")} style={{ display: "inline-flex", alignItems: "center", gap: "9px", fontWeight: "700", fontSize: "16px", color: "#10201B", background: "#F6F5F1", padding: "16px 30px", borderRadius: "14px", boxShadow: "0 16px 34px -14px rgba(0,0,0,.5)" }}>
                {t("Commencer gratuitement")}{" "}
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M13 6l6 6-6 6" />
                </svg>
              </a>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginTop: "26px", flexWrap: "wrap" }}>
              {STORE_BADGES_VISIBLE && !isNative && (
                <>
                  <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ display: "block", lineHeight: "0" }}>
                    <img src={`https://tools.applemediaservices.com/api/badges/download-on-the-app-store/white/${lang === "fr" ? "fr-fr" : "en-us"}`} alt={t("Télécharger dans l'App Store")} loading="lazy" style={S_BADGE_APPLE} />
                  </a>
                  <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ display: "block", lineHeight: "0" }}>
                    <img src={`https://play.google.com/intl/en_us/badges/static/images/badges/${lang === "fr" ? "fr" : "en"}_badge_web_generic.png`} alt={t("Disponible sur Google Play")} loading="lazy" style={S_BADGE_GOOGLE} />
                  </a>
                </>
              )}
            </div>
          </div>
        </section>
        {/* ══════════ FOOTER ══════════ */}
        <footer style={{ background: "#F6F5F1", borderTop: "1px solid #E7E3D8", padding: "34px 22px" }}>
          <div style={{ maxWidth: "1120px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "18px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
              <img src="/icon-192x192.png" alt="" style={{ width: "26px", height: "26px", borderRadius: "7px", display: "block" }} />
              <b style={{ fontWeight: "700", fontStyle: "italic", fontSize: "17px", color: "#4A5A52", paddingRight: ".1em" }}>{t("FillSell")}</b>
              <span style={{ fontWeight: "500", fontSize: "12.5px", color: "#A39D8E", marginLeft: "6px" }}>{t("Revente automatisée · © 2026")}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
              {/* Maillage interne (2026-08-02) : la home ne faisait AUCUN lien vers
                  /blog — le blog ne recevait aucun jus de la seule page qui ranke.
                  Ancre descriptive, pas un « cliquez ici ». */}
              <a href="/blog" style={SFOOT}>{t("Guides & blog revente")}</a>
              <a href="/legal#mentions" style={SFOOT}>{t("Mentions légales")}</a>
              <a href="/legal#confidentialite" style={SFOOT}>{t("Confidentialité")}</a>
              <a href={`mailto:${CONTACT_EMAIL}`} style={SFOOT}>{t("Contact")}</a>
              <a href={TIKTOK_URL} target="_blank" rel="noopener noreferrer" aria-label="TikTok" style={SSOCIAL}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.5 3c.3 2.1 1.5 3.6 3.5 3.9v2.6c-1.3.1-2.5-.3-3.5-1v6.1c0 3.3-2.5 5.4-5.4 5.4A5.2 5.2 0 0 1 6 15.2c0-3 2.5-5 5.4-4.9v2.7c-.4-.1-.8-.2-1.2-.1-1.3.1-2.2 1.1-2.1 2.4 0 1.3 1.1 2.3 2.4 2.2 1.3 0 2.2-1 2.2-2.4V3h1.8Z" />
                </svg>
              </a>
              <a href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="X" style={SSOCIAL}>
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
