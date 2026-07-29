import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Même helper que les quatre autres fonctions IA non facturées (voice-parse,
// normalize-title, stats-analysis, lot-distribute) : compte les appels sur 24 h
// glissantes dans usage_logs et laisse passer si le comptage échoue.
import { appelAutorise, loggerAppelIA } from "../_shared/usage-guard.ts";

const ALLOWED_ORIGINS = ["https://fillsell.app", "capacitor://localhost", "https://localhost", "http://localhost:5173"];

const PLATFORMS: Record<string, string> = {
  FR: "Vinted, eBay, Leboncoin, Vestiaire Collective, Backmarket, Facebook Marketplace",
  BE: "Vinted, eBay, 2ememain, Facebook Marketplace",
  CH: "Vinted, eBay, Ricardo.ch, Facebook Marketplace",
  LU: "Vinted, eBay, Anibis, Facebook Marketplace",
  DE: "eBay Kleinanzeigen, Vinted, Rebuy, Facebook Marketplace",
  AT: "Willhaben, eBay, Vinted, Facebook Marketplace",
  ES: "Wallapop, Vinted, eBay, Milanuncios, Facebook Marketplace",
  IT: "Subito, Vinted, eBay, Facebook Marketplace",
  NL: "Marktplaats, Vinted, eBay, Facebook Marketplace",
  PT: "Olx.pt, Vinted, eBay, Facebook Marketplace",
  PL: "OLX.pl, Vinted, Allegro, Facebook Marketplace",
  SE: "Blocket, Vinted, eBay, Facebook Marketplace",
  DK: "DBA.dk, Vinted, eBay, Facebook Marketplace",
  NO: "Finn.no, Vinted, eBay, Facebook Marketplace",
  FI: "Tori.fi, Vinted, eBay, Facebook Marketplace",
  GB: "eBay UK, Depop, Vinted UK, Gumtree, Facebook Marketplace",
  IE: "DoneDeal, eBay, Vinted, Facebook Marketplace",
  US: "eBay, Poshmark, Mercari, Facebook Marketplace, OfferUp, Craigslist",
  CA: "eBay, Kijiji, Facebook Marketplace, Poshmark, OfferUp",
  MA: "Avito, OLX, Jumia, Facebook Marketplace, WhatsApp",
  DZ: "Avito, OLX, Facebook Marketplace, WhatsApp",
  TN: "OLX, Tayara, Facebook Marketplace, WhatsApp",
};

const AFRICA_CODES = new Set(["SN","CI","CM","GH","NG","KE","ZA","EG","TZ","UG","ET","ML","BF","NE","TD","MR"]);
const EUROPE_CODES = new Set(["CZ","HU","RO","SK","BG","HR","GR","RS","UA","BY","LT","LV","EE"]);
const LATAM_CODES = new Set(["MX","BR","AR","CO","CL","PE","VE","EC","BO","PY","UY"]);

function getPlatforms(countryCode: string | null, lang: string): string {
  if (countryCode && PLATFORMS[countryCode]) return PLATFORMS[countryCode];
  if (countryCode && AFRICA_CODES.has(countryCode)) return "Jumia, OLX, Facebook Marketplace, WhatsApp groupes locaux";
  if (countryCode && EUROPE_CODES.has(countryCode)) return "Vinted, eBay, OLX local, Facebook Marketplace";
  if (countryCode && LATAM_CODES.has(countryCode)) return "Mercado Libre, OLX, Facebook Marketplace, Instagram Shop";
  if (lang === "en") return "eBay, Depop, Facebook Marketplace, Vinted";
  return "Vinted, eBay, Leboncoin, Facebook Marketplace";
}

// Qualité unifiée (2026-07) : un seul prompt — l'ex-analyse Premium avec
// web_search — pour TOUS les tiers. Depuis le 2026-07-23 (levée du gate
// économie v2), CHAQUE analyse coûte des Pépites (price_lens_overflow = 6),
// tous tiers : la différenciation se fait uniquement sur le grant mensuel
// de Pépites (free 30 / premium 150 / pro 600).
// Deux modes (2026-07-28) :
//   • "full"     — le scan complet historique, web_search attaché, 6 Pépites.
//   • "identify" — la MÊME lecture de photos SANS recherche web, INCLUSE dans
//     le prix de publication. Mesuré sur 7 articles réels : marque 7/7
//     identique, taille 7/7 exploitable, description égale ou meilleure. Seul
//     le PRIX dépend vraiment du web (identify est optimiste de +24 % à +150 %),
//     donc identify n'en renvoie AUCUN — c'est aussi ce qui reste à vendre à
//     6 Pépites. Coût mesuré : 0,0101 € contre 0,0716 €, 9 s contre 16 s.
type LensMode = "full" | "identify";

function buildSystemPrompt(lang: string, platforms: string, countryName: string | null, photoCount: number, mode: LensMode = "full"): string {
  const estIdentify = mode === "identify";
  // Multi-photos (2026-07-17) : neutralise le biais d'ORDRE (les modèles vision
  // sur-pondèrent souvent la 1re image) et force une lecture SYSTÉMATIQUE de
  // chaque vue + le CROISEMENT des infos (marque sur une photo, taille sur une
  // autre). Diagnostic : l'ancien "croise-les" était trop faible.
  const multiNote = photoCount > 1
    ? (lang === "en"
        ? ` You are given ${photoCount} photos of the SAME item, as different views (front, back, label/tag, close-up…). Their ORDER carries NO meaning — examine EVERY photo with equal attention, never assume the first is the most important. Read ALL visible text across ALL photos (brand logos, size/care labels, model or reference numbers, packaging) and CROSS-REFERENCE them: the brand may be on one photo, the size on another, a defect on a third. Merge everything into ONE coherent identification.`
        : ` Tu reçois ${photoCount} photos du MÊME article, sous différents angles (face, dos, étiquette, gros plan…). Leur ORDRE n'a AUCUNE signification — examine CHAQUE photo avec la même attention, ne considère jamais la première comme la plus importante. Lis TOUT le texte visible sur TOUTES les photos (logos de marque, étiquettes taille/composition, numéros de modèle ou référence, packaging) et CROISE-les : la marque peut être sur une photo, la taille sur une autre, un défaut sur une troisième. Fusionne le tout en UNE identification cohérente.`)
    : "";

  // `couleur` (2026-07-28) : NOUVEAU, dans les DEUX modes. Il manquait partout —
  // la couleur des annonces était jusqu'ici INVENTÉE par generate-listing depuis
  // un contexte purement textuel (aucune photo ne lui est envoyée), alors que
  // c'est l'attribut le plus trivialement lisible sur une photo, requis comme
  // aspect eBay et proposé par Vinted et Beebs.
  const attributsSchema = `"attributs_visibles":{"nom_parfum":string,"volume":string,"teinte":string,"reference_fabricant":string,"taille_ecran":string,"capacite":string,"hauteur":string,"largeur":string,"longueur":string}|null`;
  // Schéma RÉDUIT en identify : les champs de marché n'y figurent pas du tout.
  // Les retirer du schéma vaut mieux que demander « mets-les à null » — on ne
  // peut pas halluciner un champ qu'on n'a pas à produire — et ça raccourcit
  // d'autant la sortie facturée. Le code les force à null de toute façon.
  const schema = estIdentify
    ? `{"titre":string,"marque":string|null,"modele":string|null,"modele_source":"lue"|"reconnue"|null,"matiere":string|null,"couleur":string|null,"etat_estime":"Neuf avec étiquette"|"Neuf sans étiquette"|"Très bon état"|"Bon état"|"Satisfaisant"|null,"taille_estimee":string|null,"categorie":"Mode"|"High-Tech"|"Maison"|"Sport"|"Musique"|"Beauté"|"Collection"|"Livres"|"Auto-Moto"|"Électroménager"|"Jouets"|"Autre","description":string,"prix_achat_reel":number|null,"confiance":"basse"|"moyenne"|"haute","notes":string,"est_vendu":boolean,"prix_vente_reel":number|null,${attributsSchema}}`
    : `{"titre":string,"marque":string|null,"modele":string|null,"modele_source":"lue"|"reconnue"|"web"|null,"matiere":string|null,"couleur":string|null,"etat_estime":"Neuf avec étiquette"|"Neuf sans étiquette"|"Très bon état"|"Bon état"|"Satisfaisant"|null,"taille_estimee":string|null,"categorie":"Mode"|"High-Tech"|"Maison"|"Sport"|"Musique"|"Beauté"|"Collection"|"Livres"|"Auto-Moto"|"Électroménager"|"Jouets"|"Autre","description":string,"prix_achat_reel":number|null,"prix_achat_suggere":number|null,"prix_vente_suggere":number,"fourchette_min":number,"fourchette_max":number,"fourchette_marche":{"bas":number,"moyen":number,"haut":number}|null,"vitesse_vente":"rapide"|"moyen"|"lent","vitesse_vente_explication":string|null,"plateformes":string[],"conseils":string[],"confiance":"basse"|"moyenne"|"haute","verdict":"excellent"|"bon"|"moyen"|"eviter","score":number,"notes":string,"est_vendu":boolean,"prix_vente_reel":number|null,${attributsSchema}}`;
  // ── Langue de sortie (2026-07-28, BUG PRÉEXISTANT) ──────────────────────
  // Mesuré pendant l'audit du 28/07 : le prompt FR produit parfois un titre et
  // une description en ANGLAIS (identify sur momcozy, scan COMPLET sur cyrillus
  // et montre — matiere « Leather » au lieu de « Cuir »). Le mécanisme `_lang`
  // existait et les deux prompts existaient : ce qui manquait, c'est une
  // consigne sur la langue des CHAÎNES PRODUITES. Adossée à `lang`, jamais
  // codée en dur — un utilisateur en anglais doit obtenir de l'anglais.
  // La description Lens est le SEUL contexte texte que reçoit generate-listing
  // (aucune photo ne lui est envoyée) : une description anglaise ressort en
  // titre d'annonce anglais sur un article français.
  const langueDirective = lang === "en"
    ? `OUTPUT LANGUAGE: every free-text string you produce — titre, description, matiere, notes, vitesse_vente_explication, conseils — MUST be written IN ENGLISH, whatever the language printed on the item, on its labels, or used in the user note. Enumerated values (categorie, etat_estime, vitesse_vente, confiance, verdict, modele_source) keep the exact spelling of the schema — etat_estime therefore stays in French even here.`
    : `LANGUE DE SORTIE : toutes les chaînes en texte libre que tu produis — titre, description, matiere, notes, vitesse_vente_explication, conseils — DOIVENT être rédigées EN FRANÇAIS, quelle que soit la langue imprimée sur l'article, sur ses étiquettes, ou employée dans la note de l'utilisateur. Les valeurs énumérées (categorie, etat_estime, vitesse_vente, confiance, verdict, modele_source) gardent l'orthographe exacte du schéma.`;

  // ── Provenance du modèle (2026-07-28) ───────────────────────────────────
  // Le champ `modele` mélangeait jusqu'ici trois choses indiscernables : une
  // référence LUE sur l'objet, une référence RECONNUE de mémoire, et une
  // référence ramenée du WEB. La même G-Shock est ressortie GA-2100 (120 €),
  // puis sans modèle (55 €), puis GD-100 (45 €) sur trois scans payants — la
  // dernière est fausse (l'objet en photo est une GA-2100). Une référence
  // fausse dans un titre Vinted sort l'annonce des bonnes recherches ET la met
  // dans les mauvaises ; dans un aspect eBay structuré, elle est pire encore.
  // `modele_source` rend la provenance lisible pour le client, qui n'alimente
  // les aspects eBay qu'avec une valeur "lue" (ou confirmée à la main).
  // ⚠️ NE PAS confondre avec attributs_visibles.reference_fabricant (le MPN
  // imprimé, étape 1bis) : `modele` est le NOM COMMERCIAL.
  const sourceWeb = lang === "en"
    ? ` "web" = the reference comes from a web search rather than from the item itself.`
    : ` "web" = la référence vient d'une recherche web et non de l'article lui-même.`;
  const modeleRule = lang === "en"
    ? `1ter. MODEL AND ITS PROVENANCE: "modele" is the COMMERCIAL model name ("GA-2100", "iPhone 13"), never the printed MPN (that one belongs to attributs_visibles.reference_fabricant). Fill "modele_source" with WHERE the value comes from: "lue" = the reference is physically legible on a photo (engraving, silkscreen, label, case back, sole, box); "reconnue" = nothing is written but the product is identified by its shape, allowed ONLY for iconic, widely distributed products (iPhone/MacBook models, G-Shock, well-known sneaker lines) and FORBIDDEN whenever marque is null.${estIdentify ? "" : sourceWeb} Any other case — vague resemblance, deduction from style, generic product — is an INVENTION: set modele=null and modele_source=null. If modele is null, modele_source MUST be null. A missing model costs far less than a wrong one.`
    : `1ter. MODÈLE ET SA PROVENANCE : "modele" est le NOM COMMERCIAL du modèle (« GA-2100 », « iPhone 13 »), jamais la référence imprimée (celle-ci va dans attributs_visibles.reference_fabricant). Renseigne "modele_source" avec l'ORIGINE de la valeur : "lue" = la référence est physiquement déchiffrable sur une photo (gravure, sérigraphie, étiquette, dos de boîtier, semelle, boîte) ; "reconnue" = rien n'est écrit mais le produit est identifié par sa forme, autorisé UNIQUEMENT pour des produits iconiques largement diffusés (modèles d'iPhone/MacBook, G-Shock, sneakers de série connue) et INTERDIT dès que marque est null.${estIdentify ? "" : sourceWeb} Tout autre cas — ressemblance vague, déduction depuis le style, produit générique — est une INVENTION : mets modele=null et modele_source=null. Si modele est null, modele_source DOIT être null. Une référence absente coûte beaucoup moins cher qu'une référence fausse.`;

  // ── Couleur (2026-07-28) ────────────────────────────────────────────────
  // Un MOT courant, jamais une nuance composée : la valeur descend telle quelle
  // dans canonical_fields, et les listes de couleurs des plateformes sont
  // FERMÉES (Vinted : « Gris », pas « gris chiné »). Une valeur composée ne
  // matcherait aucune option et le champ resterait vide.
  const couleurRule = lang === "en"
    ? ` Also read "couleur": the item's DOMINANT color, as ONE common word ("Black", "Grey", "Beige") — never a compound shade ("heather grey" → "Grey"), never two colors. null if the photos do not settle it.`
    : ` Lis aussi "couleur" : la couleur DOMINANTE de l'article, en UN mot courant (« Noir », « Gris », « Beige ») — jamais une nuance composée (« gris chiné » → « Gris »), jamais deux couleurs. null si les photos ne permettent pas de trancher.`;

  // attributs_visibles (2026-07-16, chantier champs obligatoires eBay) :
  // clés TOUTES optionnelles — seules celles réellement LUES sur l'article
  // apparaissent. Consommées par le flux resolve_aspects (aspects eBay
  // obligatoires sans champ dédié : Nom de parfum, Volume, Numéro de pièce
  // fabricant, dimensions…). Depuis le 2026-07-23, CE fichier est la source
  // unique déployée (index.prod.ts et la procédure cp/deploy/restore sont
  // morts avec la levée du gate économie v2).

  // ── Étapes du processus ─────────────────────────────────────────────────
  // Les étapes 1, 1bis, 1ter, 6 et 7 sont COMMUNES aux deux modes : taille,
  // attributs visibles, provenance du modèle, prix d'achat et détection de
  // vente se lisent tous sur les photos ou dans la note utilisateur — aucune
  // ne coûte une recherche.
  // Le mode identify remplace l'étape 2 (la marque se LIT, aucune confirmation
  // web n'est requise ni possible) et SUPPRIME les étapes 3, 4, 5 et le bloc
  // marge/verdict/score de l'étape 8 : toutes dépendent du marché.
  // ⚠️ Retirer web_search SANS réécrire l'étape 2 serait catastrophique :
  // « Ne jamais retourner une marque sans confirmation. Si non trouvée,
  // marque=null » viderait systématiquement le champ mesuré à 7/7 dans l'audit.
  if (lang === "en") {
    const etape2 = estIdentify
      ? `2. BRAND — READ, NOT SEARCHED: you have NO web access and NO tool in this mode. The brand is READ on the item: logo, sewn label, hallmark, silkscreen, embossing, packaging. A logo alone is enough (a moulded sole logo, an engraved hallmark). Write it with its usual capitalisation. marque=null ONLY if nothing identifiable is legible on any photo — never because you "could not confirm" it: there is nothing to confirm here.`
      : `2. BRAND VALIDATION: If you detect a brand visually, you MUST do a web search to confirm exact spelling and existence (e.g. "pict pure clothing" → search → "Picture Organic Clothing"). Never return a brand without web search confirmation. If not found, marque=null.`;
    const etapesMarche = estIdentify ? "" : `3. PRICE ESTIMATION: Always base prices on a real web search. Query: "[brand] [item type] Vinted price" or site:vinted.com. Fallback: eBay. Set fourchette_min/fourchette_max AND fourchette_marche.bas/moyen/haut from actual listings. Cite source in notes (e.g. "Based on 5 Vinted listings"). If no data: confiance="basse".
4. SPEED & PLATFORMS: Estimate vitesse_vente (rapide/moyen/lent) with vitesse_vente_explication. Order plateformes by best fit for this item. Provide exactly 2–3 concrete conseils to maximise the sale.
5. SCORE: Rate 0–10 based on potential margin, demand, and ease of resale.
`;
    const etape8 = estIdentify
      ? `8. RULES: NO PRICE, NO VERDICT. You have no market data, so you produce none: never write a price, a range, a sale speed, a verdict or a score anywhere — not even inside "notes" or "description". prix_achat_reel is the ONLY number you may fill, and only when the user states it. confiance="haute" when the brand is legible AND the item is unambiguous, "moyenne" when partial, "basse" when you are guessing. notes: what you could NOT read (an absent label, a blurry photo) and what a second photo would settle — never a price comment.`
      : `8. RULES:
   MARGIN CALCULATION (strict priority):
   - If prix_achat_reel is not null: margin = prix_vente_suggere − prix_achat_reel. This is the ONLY basis for verdict and score. NEVER anchor prix_vente_suggere on it (market data only).
   - If prix_achat_reel is null: margin = prix_vente_suggere − prix_achat_suggere.
   VERDICT (margin-only, no exceptions): verdict="excellent" if margin>40% of prix_vente_suggere, "bon" if>20%, "moyen" if>0%, "eviter" if margin≤0.
   CRITICAL: if prix_achat_reel is known and margin is negative or zero → verdict MUST be "eviter". Strong brand and high demand are secondary factors — they NEVER override a negative real margin.
   SCORE (0–10, reflects real profitability): negative margin → 0–3; margin 0–20% → 4–5; margin 20–40% → 6–7; margin >40% → 8–10. Adjust ±1 for demand/ease, but NEVER above 4 if real margin is negative.
   confiance="haute" if brand confirmed + prices found, "moyenne" if partial, "basse" if uncertain.
   prix_achat_suggere: your independent market estimate — set to null if prix_achat_reel is not null. notes: price source + one actionable tip.`;
    return `You are an expert in secondhand resale (${platforms}).${multiNote}
Analyze the item and return ONLY valid JSON (no markdown, no explanation):

ABSOLUTE RULE, OVERRIDING EVERY OTHER INSTRUCTION: your reply must be a JSON object matching the schema, and NOTHING else. You are NEVER asked to ask a question, request clarification, or comment on what is missing. If a piece of information is absent, uncertain or unreadable, set that field to null (or its default) and CARRY ON: uncertainty is expressed through "confiance":"basse" and the "notes" field, never through a question or any text outside the JSON. A prose reply is a FAILURE, however helpful or polite it may be.
${langueDirective}
${schema}
${countryName ? `Region: ${countryName}.` : ""} Platforms from: ${platforms}

MANDATORY PROCESS — follow in order:
1. IDENTIFICATION: Identify marque, modele, matiere, etat_estime from visual cues and labels. Fill "etat_estime" with EXACTLY one of the five schema values, never free text: "Neuf avec étiquette" and "Neuf sans étiquette" ONLY when the photos or the user note state the item is new and never worn — a brand, size or composition label sewn onto a garment is NOT proof of newness, it stays in place on a worn item; for anything else, "Très bon état" is the NORMAL answer for a second-hand item and your DEFAULT: a garment that has been worn but shows no identifiable defect is "Très bon état", not "Bon état" — being second-hand is not a defect, and neither is an ordinary fold, a crease from storage, or a photo taken in dim light. Only downgrade on a defect you could actually NAME after looking at the photos: "Bon état" requires a visible one (pilling, a stain, faded colour, a scuffed sole, a stretched hem, a missing button); "Satisfaisant" requires an obvious or major one (hole, tear, permanent mark, broken part). If you hesitate between two levels, pick the HIGHER one. etat_estime=null if the photos do not settle it — never guess a condition. For taille_estimee (size), prioritize the "User note:" field first: if the user writes a size in free text (e.g. "size M", "taille 42", "pointure 42", "US 9", "UK 8"), use that. Infer from context whether the item is a garment (letter sizes XS-XXL or EU numeric 34-52) or a shoe (EU/US/UK shoe size). For garments, keep the exact system the user wrote in (e.g. "M", "42") — never convert speculatively. For shoes, always format the value as "EU {n}" (e.g. "EU 42", "EU 38.5") regardless of language, even if the user wrote a bare number or a US/UK size you can reliably convert to EU — this avoids confusion with garment numeric sizes. Only if no size appears in the user note, try to read it visually from a tag/label in the photos. If still nothing found, set taille_estimee=null — never invent a value. Since the app is in English, append the US shoe-size equivalent in parentheses only when a reliable EU→US conversion exists (e.g. "EU 42 (US 9)") — omit it if you're not confident in the conversion.${couleurRule}
1bis. VISIBLE ATTRIBUTES: fill attributs_visibles ONLY with values READ on the item, its label or packaging — NEVER estimated or speculatively converted: nom_parfum (fragrance commercial name), volume ("50 ml", with a space), teinte (cosmetics shade), reference_fabricant (printed MPN/reference), taille_ecran ("6,7 pouces"), capacite ("128 Go"), hauteur/largeur/longueur (ONLY if numeric measurements are printed or visible on a measuring tape in a photo, with unit "80 cm"). Required confidence: include a key ONLY if the reading is CLEAR — blurry photo, partial text or deduction = key ABSENT. Nothing legible → attributs_visibles=null. reference_fabricant is a CODE (letters/digits, e.g. "GA-2100A-1AER"), never a sentence: if you cannot read a code, omit the key — a description of what you see ("quality control hallmarks visible on the back…") is a violation of this rule and is rejected by the server.
${modeleRule}
${etape2}
${etapesMarche}6. PURCHASE PRICE EXTRACTION: Read the field labelled "User note:" in the message. If the user mentions a price they paid — in any form ("bought for 20", "paid €15", "cost me 8 euros", "acheté 50e", etc.) — extract the numeric value and set prix_achat_reel to that number. If no price is mentioned, set prix_achat_reel to null.
7. SALE DETECTION: Read the "User note:" field. If the user says they already sold this item — in any form ("sold for 80€", "sold it for X", "I sold it", "vendu 80€", "je l'ai vendu", etc.) — set est_vendu: true and prix_vente_reel to the numeric sale amount. Otherwise set est_vendu: false and prix_vente_reel: null.
${etape8}`;
  }
  const etape2Fr = estIdentify
    ? `2. MARQUE — LUE, PAS CHERCHÉE : dans ce mode tu n'as AUCUN accès web et AUCUN outil. La marque se LIT sur l'article : logo, étiquette cousue, poinçon, sérigraphie, gravure, packaging. Un logo seul suffit (logo moulé dans une semelle, poinçon d'orfèvre gravé). Écris-la avec sa casse usuelle. marque=null UNIQUEMENT si rien d'identifiable n'est lisible sur aucune photo — jamais parce que tu n'as pas pu la « confirmer » : il n'y a rien à confirmer ici.`
    : `2. VALIDATION MARQUE : Si tu détectes une marque visuellement, tu DOIS faire une web search pour confirmer l'orthographe exacte et l'existence (ex : "pict pure clothing" → recherche → "Picture Organic Clothing"). Ne jamais retourner une marque sans confirmation. Si non trouvée, marque=null.`;
  const etapesMarcheFr = estIdentify ? "" : `3. ESTIMATION PRIX : Toujours baser les prix sur une web search réelle. Requête : "[marque] [type] Vinted prix" ou site:vinted.fr. Fallback : eBay.fr ou Leboncoin. Fixer fourchette_min/fourchette_max ET fourchette_marche.bas/moyen/haut à partir des annonces trouvées. Citer la source dans notes (ex : "Prix basé sur 5 annonces Vinted"). Si aucune donnée : confiance="basse".
4. VITESSE ET PLATEFORMES : Estimer vitesse_vente (rapide/moyen/lent) avec vitesse_vente_explication. Ordonner les plateformes par pertinence pour cet article. Fournir exactement 2 à 3 conseils concrets dans le champ conseils pour maximiser la vente.
5. SCORE : Note de 0 à 10 basée sur la marge potentielle, la demande et la facilité de revente.
`;
  const etape8Fr = estIdentify
    ? `8. RÈGLES : AUCUN PRIX, AUCUN VERDICT. Tu n'as aucune donnée de marché, donc tu n'en produis aucune : n'écris nulle part un prix, une fourchette, une vitesse de vente, un verdict ni un score — pas même dans "notes" ou "description". prix_achat_reel est le SEUL nombre que tu peux renseigner, et uniquement si l'utilisateur l'indique. confiance="haute" si la marque est lisible ET l'article sans ambiguïté, "moyenne" si partiel, "basse" si tu supposes. notes : ce que tu n'as PAS pu lire (étiquette absente, photo floue) et ce qu'une photo de plus trancherait — jamais un commentaire de prix.`
    : `8. RÈGLES :
   CALCUL DE MARGE (priorité stricte) :
   - Si prix_achat_reel n'est pas null : marge = prix_vente_suggere − prix_achat_reel. C'est l'UNIQUE base pour le verdict et le score — NE JAMAIS l'utiliser pour fixer prix_vente_suggere (toujours basé sur les données marché).
   - Si prix_achat_reel est null : marge = prix_vente_suggere − prix_achat_suggere.
   VERDICT (basé uniquement sur la marge, sans exception) : verdict="excellent" si marge>40% du prix_vente_suggere, "bon" si>20%, "moyen" si>0%, "eviter" si marge≤0.
   CRITIQUE : si prix_achat_reel est connu et que la marge est négative ou nulle → verdict DOIT être "eviter". La marque forte et la demande sont des facteurs secondaires — ils ne peuvent JAMAIS contredire une marge réelle négative.
   SCORE (0 à 10, reflète la rentabilité réelle) : marge négative → 0-3 ; marge 0-20% → 4-5 ; marge 20-40% → 6-7 ; marge >40% → 8-10. Ajuster ±1 selon demande/facilité, jamais au-dessus de 4 si marge réelle négative.
   confiance="haute" si marque confirmée ET prix trouvés, "moyenne" si partiel, "basse" si incertain.
   prix_achat_suggere : estimation marché indépendante — mettre à null si prix_achat_reel n'est pas null. notes : source de l'estimation prix + un conseil concret pour vendre plus vite.`;
  return `Tu es expert en achat-revente occasion (${platforms}).${multiNote}
Analyse l'article et réponds UNIQUEMENT avec du JSON valide (sans markdown, sans explication) :

RÈGLE ABSOLUE, PRIORITAIRE SUR TOUTE AUTRE INSTRUCTION : ta réponse doit être un objet JSON conforme au schéma, et RIEN d'autre. Il ne t'est JAMAIS demandé de poser une question, de réclamer une précision, ni de commenter ce qui te manque. Si une information est absente, incertaine ou illisible, mets le champ à null (ou à sa valeur par défaut) et CONTINUE : l'incertitude se signale par "confiance":"basse" et par le champ "notes", jamais par une question ni par du texte hors JSON. Une réponse en prose est un ÉCHEC, même si elle est utile et polie.
${langueDirective}
${schema}
${countryName ? `Région : ${countryName}.` : ""} Plateformes parmi : ${platforms}

PROCESSUS OBLIGATOIRE — suivre dans l'ordre :
1. IDENTIFICATION : Identifie marque, modele, matiere, etat_estime à partir des indices visuels et étiquettes. Renseigne "etat_estime" avec EXACTEMENT une des cinq valeurs du schéma, jamais du texte libre : « Neuf avec étiquette » et « Neuf sans étiquette » UNIQUEMENT si les photos ou la note utilisateur affirment que l'article est neuf et jamais porté — une étiquette de marque, de taille ou de composition cousue sur un vêtement n'est PAS une preuve de neuf, elle reste en place sur un article porté ; pour tout le reste, « Très bon état » est la réponse NORMALE pour un article d'occasion et ton choix PAR DÉFAUT : un vêtement porté mais sans défaut identifiable est en « Très bon état », pas en « Bon état » — être d'occasion n'est pas un défaut, et un pli, un faux pli de rangement ou une photo un peu sombre n'en sont pas non plus. Ne descends d'un cran que sur un défaut que tu pourrais NOMMER après avoir regardé les photos : « Bon état » exige un défaut visible (bouloches, tache, couleur passée, semelle éraflée, ourlet détendu, bouton manquant) ; « Satisfaisant » exige un défaut manifeste ou important (trou, accroc, marque indélébile, pièce cassée). Si tu hésites entre deux niveaux, choisis le PLUS HAUT. etat_estime=null si les photos ne permettent pas de trancher — ne devine jamais un état. Pour taille_estimee, priorise d'abord le champ "Note de l'utilisateur :" : si l'utilisateur écrit une taille en texte libre (ex : "taille M", "taille 42", "pointure 42", "US 9", "UK 8"), utilise-la. Déduis du contexte s'il s'agit d'un vêtement (tailles lettres XS-XXL ou numériques FR/EU 34-52) ou d'une chaussure (pointure EU/US/UK). Pour un vêtement, garde le système exact utilisé par l'utilisateur (ex : "M", "42") — ne convertis jamais de façon spéculative. Pour une chaussure, formate toujours la valeur en "EU {n}" (ex : "EU 42", "EU 38.5"), même si l'utilisateur a écrit un nombre seul ou une pointure US/UK que tu peux convertir de façon fiable en EU — ça évite la confusion avec les tailles vêtement numériques. Seulement si aucune taille n'apparaît dans la note utilisateur, essaie de la lire visuellement sur une étiquette en photo. Si toujours rien trouvé, mets taille_estimee=null — n'invente jamais de valeur.${couleurRule}
1bis. ATTRIBUTS VISIBLES : renseigne attributs_visibles UNIQUEMENT avec des valeurs LUES sur l'article, son étiquette ou son packaging — JAMAIS estimées ni converties spéculativement : nom_parfum (nom commercial du parfum), volume ("50 ml", avec espace), teinte (cosmétique), reference_fabricant (MPN/référence imprimée), taille_ecran ("6,7 pouces"), capacite ("128 Go"), hauteur/largeur/longueur (UNIQUEMENT si des mesures chiffrées sont imprimées ou visibles sur un mètre en photo, avec unité "80 cm"). Niveau de confiance exigé : n'inclus une clé QUE si la lecture est NETTE — photo floue, texte partiel ou déduction = clé ABSENTE. Aucune clé lisible → attributs_visibles=null. reference_fabricant est un CODE (lettres/chiffres, ex : « GA-2100A-1AER »), jamais une phrase : si tu ne lis pas de code, omets la clé — décrire ce que tu vois (« Poinçons de contrôle qualité visibles au dos… ») viole cette règle et est rejeté par le serveur.
${modeleRule}
${etape2Fr}
${etapesMarcheFr}6. EXTRACTION PRIX D'ACHAT : Lis le champ "Note de l'utilisateur :" dans le message. S'il mentionne un prix payé — sous n'importe quelle forme ("acheté 50e", "payé 12€", "coûte 30 euros", "j'ai mis 8€", "bought for 20", etc.) — extrais la valeur numérique et mets-la dans prix_achat_reel. Si aucun prix mentionné, prix_achat_reel = null.
7. DÉTECTION VENTE : Lis le champ "Note de l'utilisateur :" dans le message. Si l'utilisateur mentionne avoir déjà vendu l'article — sous n'importe quelle forme ("vendu 80€", "je l'ai vendu", "sold for X", "vendu pour X", etc.) — mets est_vendu: true et prix_vente_reel au montant numérique. Sinon est_vendu: false et prix_vente_reel: null.
${etape8Fr}`;
}

// ── Validation SERVEUR des champs « lus sur l'article » (2026-07-28) ────────
// L'étape 1bis interdit depuis le 16/07 toute valeur déduite dans
// attributs_visibles (« lecture NETTE, déduction = clé ABSENTE ») et la règle
// est VIOLÉE en production : « Poinçons de contrôle qualité visibles au dos
// (triangle, chiffres partiellement lisibles) » est parti dans
// reference_fabricant, donc dans le contexte de resolve_aspects
// (ListingPreviewScreen → generate-listing), donc dans l'aspect eBay « Numéro
// de pièce fabricant » qui accepte la SAISIE LIBRE. Renforcer le prompt ne
// règle rien — un modèle qui ignore la consigne une fois l'ignorera encore.
// Seule la validation serveur tient, et elle s'applique aux DEUX modes.
//
// Une référence fabricant est un CODE : jamais plus de 6 mots, jamais plus de
// 50 caractères, jamais terminée par un point. Une valeur refusée fait
// disparaître la CLÉ (sémantique de l'étape 1bis), elle n'est pas mise à null.
const MPN_MAX_MOTS = 6;
const MPN_MAX_CARACTERES = 50;

function referenceFabricantValide(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.toLowerCase() === "null") return null;
  if (s.length > MPN_MAX_CARACTERES) return null;
  if (s.endsWith(".")) return null;
  if (s.split(/\s+/).filter(Boolean).length > MPN_MAX_MOTS) return null;
  return s;
}

const MODELE_SOURCES = new Set(["lue", "reconnue", "web"]);

// ── État : LISTE FERMÉE de 5 valeurs (2026-07-29) ──────────────────────────
// Jusqu'ici etat_estime était du TEXTE LIBRE, et generate-listing le
// documentait déjà comme tel : « Bon », « bon », « Bon état », « Très bon »
// relevés en prod le 28/07 pour un même niveau. Conséquence : le rédacteur de
// generate-listing recevait une lecture non normalisée et devait la rapprocher
// lui-même de la liste fermée de CHAQUE plateforme — un rapprochement de plus,
// donc une occasion de plus de sortir de la liste (Vinted « Satisfaisant » vs
// LBC « État satisfaisant » vs Beebs « État moyen »).
// Les 5 valeurs sont celles du formulaire Vinted, orthographe EXACTE reprise de
// PLATFORM_CFG.vinted dans generate-listing (« étiquette » au SINGULIER).
// Elles restent en français quelle que soit la langue de sortie : c'est une
// énumération, pas du texte libre — comme categorie (« Mode », « Beauté »).
const ETATS = [
  "Neuf avec étiquette",
  "Neuf sans étiquette",
  "Très bon état",
  "Bon état",
  "Satisfaisant",
] as const;

/** Minuscules, sans accents ni ponctuation, espaces compactés. */
function aplatir(s: string): string {
  return s
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Table de rapprochement. L'ORDRE DES TESTS COMPTE et il est vérifié par les
// cas réels : « très bon état » contient « bon », « comme neuf » contient
// « neuf ». Le plus spécifique passe donc toujours en premier.
const ETAT_SYNONYMES: Array<[RegExp, typeof ETATS[number]]> = [
  // Neuf AVEC étiquette — exige les deux signaux.
  [/\bneuf\b.*\bavec\b.*\betiquette/, "Neuf avec étiquette"],
  [/\bnew\b.*\bwith\b.*\btag/, "Neuf avec étiquette"],
  [/^nwt$/, "Neuf avec étiquette"],
  // Neuf SANS étiquette.
  [/\bneuf\b.*\bsans\b.*\betiquette/, "Neuf sans étiquette"],
  [/\bnew\b.*\bwithout\b.*\btag/, "Neuf sans étiquette"],
  [/^nwot$/, "Neuf sans étiquette"],
  // « Comme neuf » / « like new » ne sont PAS du neuf : Vinted n'a pas ce
  // niveau, et le voisin honnête est « Très bon état ». Testé AVANT « neuf ».
  [/\bcomme neuf\b|\blike new\b|\bquasi neuf\b|\bpresque neuf\b/, "Très bon état"],
  [/\btres bon\b|\btres bonne\b|\btbe\b|\bexcellent\b|\bvery good\b|\bmint\b|\bparfait etat\b/, "Très bon état"],
  [/\bbon etat\b|\bbonne condition\b|\bgood condition\b|^bon$|^bonne$|^good$/, "Bon état"],
  // « used » anglais est VOLONTAIREMENT absent : tout article d'occasion est
  // « used », ce n'est pas un niveau d'usure — le mapper dégraderait à tort.
  [/\bsatisfaisant\b|\bcorrect\b|\bmoyen\b|\bacceptable\b|\bfair\b|\busagee?\b|\busee?\b|\bworn\b|\bmauvais\b|\bpoor\b|\bpassable\b/, "Satisfaisant"],
  // Neuf NU, en dernier : le modèle affirme le neuf sans parler d'étiquette.
  // On retient la variante SANS étiquette — c'est la moins engageante des deux
  // (elle n'ajoute pas une allégation d'étiquette que personne n'a vue).
  [/\bneuf\b|\bneuve\b|\bbrand new\b|^new$|\bjamais porte\b|\bjamais utilise\b|\bnever worn\b/, "Neuf sans étiquette"],
];

/**
 * Ramène etat_estime dans la liste fermée, ou null.
 *
 * ⚠️ Une valeur non reconnue devient null, JAMAIS une valeur par défaut : c'est
 * la même doctrine que modele_source (« n'est JAMAIS deviné ») et que le MPN.
 * Un état inventé descend jusque dans platform_fields.etat des 5 plateformes ;
 * un état absent laisse simplement le rédacteur faire son travail.
 */
function etatEstimeNormalise(v: unknown): { valeur: string | null; rejete: boolean } {
  if (v == null) return { valeur: null, rejete: false };
  if (typeof v !== "string") return { valeur: null, rejete: true };
  const brut = v.trim();
  if (!brut || brut.toLowerCase() === "null") return { valeur: null, rejete: false };

  // Déjà canonique (chemin nominal une fois le prompt suivi).
  const exact = ETATS.find((e) => e === brut);
  if (exact) return { valeur: exact, rejete: false };

  const plat = aplatir(brut);
  // Canonique à la casse/aux accents près (« tres bon etat », « BON ÉTAT »).
  const quasi = ETATS.find((e) => aplatir(e) === plat);
  if (quasi) return { valeur: quasi, rejete: false };

  for (const [motif, cible] of ETAT_SYNONYMES) {
    if (motif.test(plat)) return { valeur: cible, rejete: false };
  }
  return { valeur: null, rejete: true };
}

/**
 * Normalise la sortie du modèle : MPN validé, `modele` / `modele_source`
 * cohérents. Retourne ce qui a été rejeté, pour la télémétrie.
 * ⚠️ `modele_source` n'est JAMAIS deviné : une valeur hors énumération devient
 * null, et le client traite « pas "lue" » comme « à confirmer ». Une source
 * absente ne peut donc pas servir de passe-droit vers un aspect eBay.
 */
function assainirSortie(item: Record<string, unknown>): { mpnRejete: boolean; etatRejete: boolean } {
  let mpnRejete = false;

  const attrs = item.attributs_visibles;
  if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
    const a = attrs as Record<string, unknown>;
    if ("reference_fabricant" in a) {
      const valide = referenceFabricantValide(a.reference_fabricant);
      if (valide === null) {
        console.warn(`[lens-analysis] reference_fabricant rejetée: ${String(a.reference_fabricant).slice(0, 120)}`);
        delete a.reference_fabricant;
        mpnRejete = true;
      } else {
        a.reference_fabricant = valide;
      }
    }
    // Toutes les clés lues ont été refusées : le contrat dit null, pas {}.
    if (Object.keys(a).length === 0) item.attributs_visibles = null;
  }

  const brut = typeof item.modele === "string" ? item.modele.trim() : "";
  const modele = brut && brut.toLowerCase() !== "null" ? brut : null;
  item.modele = modele;
  const src = typeof item.modele_source === "string" ? item.modele_source.trim().toLowerCase() : "";
  item.modele_source = modele && MODELE_SOURCES.has(src) ? src : null;

  // État ramené dans la liste fermée. S'applique aux DEUX modes : etat_estime
  // figure dans le schéma identify comme dans le schéma complet.
  const etat = etatEstimeNormalise(item.etat_estime);
  if (etat.rejete) {
    console.warn(`[lens-analysis] etat_estime hors liste, mis à null : ${String(item.etat_estime).slice(0, 120)}`);
  }
  item.etat_estime = etat.valeur;

  return { mpnRejete, etatRejete: etat.rejete };
}

// ══════════════════════════════════════════════════════════════════════════
// GARDE-FOUS DU MODE IDENTIFY (2026-07-28)
// ══════════════════════════════════════════════════════════════════════════

// Plafond par utilisateur, 24 h glissantes. 60 et non 100 : le maximum réel
// observé en base, toutes analyses confondues, est de 16/jour/utilisateur
// (p95 = 10, moyenne = 2,9). Un utilisateur ne l'atteindra jamais ; seule une
// boucle le peut.
const PLAFOND_IDENTIFY_PAR_USER = 60;

// Plafond GLOBAL journalier — garde NEUVE. Toutes les gardes existantes sont
// par utilisateur : aucune ne regarde le total. Identify étant gratuit, il
// ouvre un chemin API sans contrepartie de revenu, et c'est le seul risque neuf
// introduit par ce mode. 3 000 appels/jour ≈ 30 € (0,0101 €/appel mesuré).
const PLAFOND_IDENTIFY_GLOBAL = 3000;

// Version du prompt : elle entre dans la clé du cache d'idempotence. À BUMPER
// à chaque modification des prompts ou du schéma, sinon on continue de servir
// un résultat produit par l'ancienne version.
const VERSION_PROMPT = "2026-07-29b";

// Champs de marché forcés à null en identify — dans le CODE, pas seulement par
// consigne de prompt (ils ne figurent déjà plus dans le schéma identify).
const CHAMPS_MARCHE = [
  "prix_vente_suggere", "prix_achat_suggere", "fourchette_min", "fourchette_max",
  "fourchette_marche", "vitesse_vente", "vitesse_vente_explication",
  "verdict", "score", "plateformes", "conseils",
] as const;

const TABLE_CACHE = "lens_identify_cache";

/**
 * Clé stable : utilisateur + mode + version de prompt + URLs de photos TRIÉES.
 * Les photos passent par URL (jamais en base64), donc l'URL est un identifiant
 * suffisant et stable. Le tri rend la clé insensible à l'ordre d'ajout ;
 * l'ordre réel d'envoi, lui, reste celui du client (biais positionnel).
 */
async function cleIdempotence(userId: string, mode: string, urls: string[]): Promise<string> {
  const brut = [userId, mode, VERSION_PROMPT, ...[...urls].sort()].join("|");
  const empreinte = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(brut));
  return [...new Uint8Array(empreinte)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Résultat mémorisé de moins de 24 h, ou null. L'expiration est vérifiée À LA
 * LECTURE : la purge (branchée sur le sweep quotidien de 04:15) ne fait que du
 * ménage, elle n'est jamais le garant de la fraîcheur.
 * Best-effort : toute erreur ⇒ null ⇒ appel API normal.
 */
async function lireCache(admin: any, cle: string): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await admin
      .from(TABLE_CACHE)
      .select("resultat")
      .eq("cle", cle)
      .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
      .maybeSingle();
    return (data?.resultat as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

/** Mémorise le résultat (best-effort : un échec d'écriture ne casse rien). */
async function ecrireCache(admin: any, cle: string, userId: string, resultat: unknown): Promise<void> {
  try {
    const { error } = await admin
      .from(TABLE_CACHE)
      .upsert({ cle, user_id: userId, resultat, created_at: new Date().toISOString() }, { onConflict: "cle" });
    if (error) console.error("[lens-analysis] cache identify:", error.message);
  } catch (e) {
    console.error("[lens-analysis] cache identify:", (e as Error)?.message);
  }
}

/**
 * Instant UTC du dernier minuit de Paris — jamais d'UTC brut pour une mesure
 * journalière (cf. CLAUDE.md). Calculé depuis l'heure locale de Paris décomposée
 * par Intl, sans table de fuseaux embarquée.
 */
function debutJourneeParisISO(): string {
  const maintenant = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(maintenant);
  const nb = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const depuisMinuit = (nb("hour") * 3600 + nb("minute") * 60 + nb("second")) * 1000 + maintenant.getMilliseconds();
  return new Date(maintenant.getTime() - depuisMinuit).toISOString();
}

/**
 * Nombre d'identifies RÉELLEMENT appelés aujourd'hui (heure de Paris), tous
 * utilisateurs confondus. Les hits de cache ne comptent pas : ils sont logués
 * sous 'lens_identify_cache' et ne coûtent rien.
 * null si le comptage est impossible ⇒ l'appelant laisse passer, comme les
 * gardes existantes : une panne de lecture ne devient jamais un refus.
 */
async function appelsIdentifyDuJour(admin: any): Promise<number | null> {
  try {
    const { count, error } = await admin
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("feature", "lens_identify")
      .gte("created_at", debutJourneeParisISO());
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function fetchWithRetry(url: string, init: RequestInit, maxAttempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status !== 429) return res;
      const after = parseInt(res.headers.get("retry-after") || "30", 10);
      if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, after * 1000));
      lastErr = new Error("HTTP 429");
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt < maxAttempts - 1) await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
    }
  }
  const err = new Error("ai_unavailable");
  (err as any).isAiUnavailable = true;
  throw err;
}

async function callClaude(apiKey: string, payload: object, beta?: string): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  if (beta) headers["anthropic-beta"] = beta;
  const r = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => `HTTP ${r.status}`);
    throw new Error(`Anthropic ${r.status}: ${t}`);
  }
  return r.json();
}

serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "https://fillsell.app";
  const CORS = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  // ── Auth ──────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // ── Payant-par-scan (2026-07-23, levée du gate économie v2) ───────────────
  // Plus de quota mensuel inclus (ex 5/120/250), plus de frein journalier :
  // CHAQUE analyse débite price_lens_overflow (6) via spend_coins_for_lens,
  // tous tiers. Le RPC pose aussi le grant mensuel LAZY (30/150/600) si le
  // mois du wallet est vierge — un inscrit du jour a ses Pépites dès sa
  // première analyse, sans attendre le sweep de 04:15. Les colonnes
  // lens_daily_override / lens_monthly_override ne sont plus consultées
  // (lettres mortes sans quotas — 2 comptes en avaient, cf. état des lieux).
  const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Pièces débitées pour cette analyse — remboursées si elle n'est pas livrée.
  let paidWithCoins = 0;

  // ── Télémétrie du scan (2026-07-28) ─────────────────────────────────────
  // Sommée sur TOUS les tours : appel initial, relances pause_turn, repli sans
  // outil et passe de réparation. Un seul tour observé ne dirait rien — c'est
  // justement l'empilement des tours qui coûte cher, et que le cache vise.
  // Déclaré dans le scope de la requête, jamais au niveau module : les
  // requêtes concurrentes partagent l'isolat Deno et mélangeraient les
  // compteurs de deux scans simultanés.
  const stats = { in: 0, out: 0, cache_w: 0, cache_r: 0, recherches: 0, tours: 0, photos: 0 };
  const debutMs = Date.now();
  const trackUsage = (d: unknown) => {
    const u = (d as {
      usage?: {
        input_tokens?: number; output_tokens?: number;
        cache_creation_input_tokens?: number; cache_read_input_tokens?: number;
        server_tool_use?: { web_search_requests?: number };
      };
    })?.usage;
    if (!u) return;
    stats.in         += u.input_tokens ?? 0;
    stats.out        += u.output_tokens ?? 0;
    stats.cache_w    += u.cache_creation_input_tokens ?? 0;
    stats.cache_r    += u.cache_read_input_tokens ?? 0;
    stats.recherches += u.server_tool_use?.web_search_requests ?? 0;
    stats.tours      += 1;
  };

  // Relâche ce que la tentative a coûté (idempotent, best-effort : un échec de
  // remboursement ne doit jamais masquer l'erreur d'origine). La ligne
  // usage_logs posée par spend_coins_for_lens reste en place : elle n'ouvre
  // plus aucun droit (pure télémétrie), rembourser les Pépites suffit — la
  // reprise depuis LensTab est gratuite de fait.
  let released = false;
  const userId = user.id; // capturé hors closure : TS ne garde pas le narrowing
  async function releaseAttempt(reason: string) {
    if (released) return;
    released = true;
    if (paidWithCoins > 0) {
      const { error } = await adminClient.rpc("refund_coins", {
        p_user_id: userId,
        p_amount: paidWithCoins,
        p_metadata: { source: reason },
      });
      if (error) console.error("[lens-analysis] refund_coins:", error.message);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CORPS DE LA REQUÊTE — LU AVANT TOUT DÉBIT (2026-07-28)
  // ══════════════════════════════════════════════════════════════════════════
  // Il était lu APRÈS spend_coins_for_lens. Ajouter un paramètre `mode` sans
  // toucher à cet ordre aurait débité 6 Pépites à CHAQUE identify — l'inverse
  // exact de la décision commerciale (identify INCLUS dans le prix de
  // publication). L'ordre est désormais : corps → mode → gardes → débit, et le
  // débit ne concerne que le mode complet.
  // Les sorties précoces ci-dessous n'appellent plus releaseAttempt : rien n'a
  // encore été débité à ce stade, dans AUCUN des deux modes.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  const { urls, description, prixAchat, lang = "fr", userCountry, userStats } =
    (body ?? {}) as Record<string, any>;
  const mode: LensMode = body?.mode === "identify" ? "identify" : "full";
  const estIdentify = mode === "identify";

  if (!Array.isArray(urls) || urls.length === 0) {
    return new Response(JSON.stringify({ error: "Missing urls" }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing API key" }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  // Cap 8 photos : appliqué ICI parce que la clé du cache d'idempotence porte
  // sur la liste RÉELLEMENT envoyée, pas sur ce que le client a proposé.
  const photoUrls = (urls as string[]).slice(0, 8);

  // ── Gardes du mode identify (2026-07-28) ────────────────────────────────
  // Identify est GRATUIT : rien n'empêche de le relancer en boucle sans jamais
  // publier. Trois étages, dans cet ordre précis.
  let cacheCle: string | null = null;
  if (estIdentify) {
    // a) IDEMPOTENCE — testée AVANT tout compteur. Le cas d'abus probable n'est
    //    pas un script, c'est quelqu'un qui re-clique parce que le résultat ne
    //    lui plaît pas (temperature: 0 rend d'ailleurs la réponse quasi
    //    déterministe). Tester le cache en premier fait qu'un re-clic ne brûle
    //    PAS le quota pour un résultat déjà produit.
    //    La clé inclut le mode ET la version du prompt : sans eux, un identify
    //    et un scan complet sur les mêmes photos entreraient en collision, et
    //    un changement de prompt continuerait de servir du périmé.
    cacheCle = await cleIdempotence(userId, mode, photoUrls);
    const memorise = await lireCache(adminClient, cacheCle);
    if (memorise) {
      console.log(`[lens-analysis][identify] cache HIT user=${userId} photos=${photoUrls.length}`);
      // Journalisé sous une feature DISTINCTE : un hit ne doit pas consommer le
      // quota (aucun appel API, aucun coût), mais doit rester visible.
      await loggerAppelIA(adminClient, userId, "lens_identify_cache", { in: 0, out: 0 }, {
        mode, cache_hit: true, photos: photoUrls.length,
      });
      return new Response(JSON.stringify(memorise), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // b) Plafond par utilisateur — même helper que les 4 autres fonctions IA
    //    non facturées. 60 et non 100 : le maximum réel observé en base est de
    //    16 analyses/jour/utilisateur. Comptage impossible ⇒ on laisse passer.
    if (!(await appelAutorise(adminClient, userId, "lens_identify", PLAFOND_IDENTIFY_PAR_USER))) {
      console.warn(`[lens-analysis] garde-fou identify atteint pour ${userId}`);
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429, headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // c) Plafond GLOBAL journalier — toutes les gardes existantes sont par
    //    utilisateur, AUCUNE ne regarde le total. Identify étant gratuit, il
    //    ouvre un chemin API sans contrepartie de revenu : c'est le seul risque
    //    neuf introduit ici. Au-delà, identify est court-circuité et le parcours
    //    continue SANS analyse (le client ne bloque jamais là-dessus).
    const total = await appelsIdentifyDuJour(adminClient);
    if (total !== null && total >= PLAFOND_IDENTIFY_GLOBAL) {
      console.error(
        `[lens-analysis][ALERTE] plafond global identify atteint : ${total}/${PLAFOND_IDENTIFY_GLOBAL} appels aujourd'hui (Europe/Paris) — identify court-circuité`
      );
      return new Response(JSON.stringify({ error: "identify_unavailable" }), {
        status: 429, headers: { "Content-Type": "application/json", ...CORS },
      });
    }
  }

  const { data: spend, error: spendErr } = estIdentify
    // Identify ne débite RIEN : l'identification est incluse dans le prix de
    // publication (parcours minimum = 3 Pépites AU TOTAL, jamais 3 + 3).
    // Ne pas passer par spend_coins_for_lens le prive aussi de son grant
    // mensuel LAZY — sans conséquence depuis le commit 0259849 : handle_new_user
    // appelle grant_monthly_coins('free') À L'INSCRIPTION (vérifié en base), et
    // le sweep de 04:15 reste le filet pour les mois suivants.
    ? { data: { allowed: true, price: 0 } as Record<string, any>, error: null }
    : await adminClient.rpc("spend_coins_for_lens", { p_user_id: user.id });
  if (spendErr || !spend) {
    console.error("[lens-analysis] spend_coins_for_lens:", spendErr?.message);
    return new Response(
      JSON.stringify({ error: "coin_debit_failed" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
  if (spend.allowed === false) {
    if (spend.reason === "insufficient_coins") {
      // 402 → le client ouvre la ConversionModal (trigger lens) avec le prix
      // et le solde réels — chemin déjà câblé côté App.jsx et
      // ListingPreviewScreen.
      return new Response(
        JSON.stringify({ error: "insufficient_coins", price: spend.price, balance: spend.balance }),
        { status: 402, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }
    console.error("[lens-analysis] spend_coins_for_lens refused:", spend.reason);
    return new Response(
      JSON.stringify({ error: "coin_debit_failed", reason: spend.reason }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
  paidWithCoins = spend.price ?? 0;

  // Ligne usage_logs que spend_coins_for_lens vient de poser : on la retient
  // pour y écrire la télémétrie du scan une fois les appels API terminés. Le
  // RPC ne renvoie pas son id, on relit donc la plus récente de cet
  // utilisateur — sans risque de confusion, elle a été créée à l'instant dans
  // la même requête. Best-effort : on n'enrichit que la ligne du scan courant.
  // ⚠️ MODE COMPLET UNIQUEMENT. Un identify ne pose aucune ligne 'lens' : s'il
  // relisait « la plus récente », il DÉTOURNERAIT la télémétrie du dernier scan
  // complet de cet utilisateur. Sa propre télémétrie part sous la feature
  // 'lens_identify' (loggerAppelIA), jamais sous 'lens'.
  let logId: string | null = null;
  let logMeta: Record<string, unknown> = {};
  if (!estIdentify) {
    try {
      const { data: ligne } = await adminClient
        .from("usage_logs").select("id, metadata")
        .eq("user_id", user.id).eq("feature", "lens")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (ligne) { logId = ligne.id as string; logMeta = (ligne.metadata as Record<string, unknown>) ?? {}; }
    } catch { /* télémétrie seulement : ne doit jamais empêcher le scan */ }
  }

  // Écrit la télémétrie dans la ligne 'lens' déjà posée, en FUSIONNANT avec
  // son metadata (coins, model) plutôt qu'en l'écrasant. Appelée aussi bien
  // sur succès que sur échec : un scan raté consomme de l'API, son coût doit
  // se voir. Best-effort de bout en bout.
  async function enregistrerTelemetrie(issue: string) {
    if (logId == null) return;
    try {
      await adminClient.from("usage_logs").update({
        metadata: {
          ...logMeta,
          issue,
          photos: stats.photos,
          tours: stats.tours,
          input_tokens: stats.in,
          output_tokens: stats.out,
          cache_creation_input_tokens: stats.cache_w,
          cache_read_input_tokens: stats.cache_r,
          web_search_requests: stats.recherches,
        },
      }).eq("id", logId);
    } catch (e) {
      console.error("[lens-analysis] télémétrie:", (e as Error)?.message);
    }
  }

  try {
    // Corps, urls et clé API : déjà lus et validés PLUS HAUT, avant le débit.
    const _lang = lang === "en" ? "en" : "fr";
    const countryCode = userCountry?.code ?? null;
    const countryName = userCountry?.name ?? null;
    const platforms = getPlatforms(countryCode, _lang);
    const systemPrompt = buildSystemPrompt(_lang, platforms, countryName, photoUrls.length, mode);

    const textParts: string[] = [];
    // TOUJOURS envoyée, même vide (2026-07-22). Le prompt système ordonne TROIS
    // fois de lire « Note de l'utilisateur » (étapes 1, 6 et 7). Quand la ligne
    // était omise — cas d'un article sans note, comme la robe Camaïeu du 22/07 —
    // on demandait au modèle de lire un champ INEXISTANT, et il répondait en
    // prose pour le réclamer (« Avez-vous une Note de l'utilisateur à me
    // fournir ? »), d'où « Réponse IA non parsable ». Un « (aucune) » explicite
    // ferme la question au lieu de l'ouvrir.
    textParts.push(_lang === "en"
      ? `User note: ${description || "(none — the user provided no note; do not ask for one)"}`
      : `Note de l'utilisateur : ${description || "(aucune — l'utilisateur n'a pas fourni de note ; ne la réclame pas)"}`);
    if (prixAchat != null) textParts.push(_lang === "en" ? `My actual purchase price (cost paid): €${prixAchat}` : `Mon prix d'achat réel (coût payé) : ${prixAchat}€`);
    if (userStats?.avgMargin != null) textParts.push(_lang === "en" ? `My average margin: ${userStats.avgMargin}%` : `Ma marge moyenne : ${userStats.avgMargin}%`);
    if (userStats?.topCategories?.length) textParts.push(_lang === "en" ? `My top categories: ${userStats.topCategories.join(", ")}` : `Mes meilleures catégories : ${userStats.topCategories.join(", ")}`);
    const userText = textParts.length ? textParts.join("\n") : (_lang === "en" ? "Analyze this item." : "Analyse cet article.");

    // Cap 8 (2026-07-17) : ALIGNÉ sur la limite UI Pro (LensTab maxPhotos =
    // isPro ? 8 : 5). L'ancien slice(0,5) tronquait SILENCIEUSEMENT les photos
    // 6-8 d'un Pro (qui les avait payées) — la 6e n'était de toute façon jamais
    // ajoutable côté client (handlers cappés à 5), donc bug à 2 étages : ici +
    // handlers App.jsx. Les deux corrigés ensemble. Free/Premium n'envoient
    // jamais > 5 (grille UI 5). ⚠️ Déploiement nécessaire pour prendre effet.
    // ── Cache de prompt (2026-07-28) — facturation seule, comportement nul ──
    // Un scan enchaîne 2 à 5 tours quand web_search s'active, et CHAQUE tour
    // re-facture plein tarif tout le préfixe : définitions d'outil, prompt
    // système et surtout les images. Le marqueur ci-dessous met ce préfixe en
    // cache : le 1er tour l'écrit à 1,25×, les suivants le relisent à 0,1×.
    // Le modèle reçoit EXACTEMENT le même contenu, dans le même ordre.
    //
    // UN SEUL point de rupture, sur la DERNIÈRE image : tout ce qui précède
    // (outils + système + toutes les images) est mis en cache, tout ce qui
    // suit (note utilisateur, contenu assistant partiel, résultats de
    // recherche qui s'accumulent au fil des tours) reste hors cache.
    //
    // ⚠️ Pourquoi PAS un second point sur le prompt système : le minimum
    // cachable de Haiku 4.5 est de 4096 tokens — le plus élevé du catalogue.
    // Outils + système pèsent ~2 200 tokens : un point de rupture placé là ne
    // cacherait JAMAIS rien (l'API ignore silencieusement un préfixe trop
    // court, sans erreur). Il faut les images pour franchir le seuil.
    //
    // ⚠️ IDENTIFY : marqueur NON POSÉ (2026-07-28). Mesuré sur 7 appels sur 7 :
    // cache_read_input_tokens = 0. Sans web_search il n'y a qu'UN tour, et le
    // tour suivant n'existe pas — le préfixe est écrit à 1,25× et jamais relu,
    // soit +24,9 % d'entrée facturée et +16,4 % de coût pour zéro bénéfice.
    // La pose est donc conditionnée à la présence de web_search, c'est-à-dire au
    // mode complet, où le cache est massivement relu (10 k à 115 k tokens par
    // scan, via les itérations internes de l'outil serveur).
    const imageContent = photoUrls.map((url, i, arr) => ({
      type: "image",
      source: { type: "url", url },
      // Ordre strictement déterministe : il suit celui du tableau `urls` reçu,
      // jamais un tri ni une itération d'objet — un ordre instable ferait
      // manquer le cache à chaque tour.
      ...(!estIdentify && i === arr.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
    }));

    stats.photos = imageContent.length;

    const initialMessages = [
      { role: "user", content: [...imageContent, { type: "text", text: userText }] },
    ];

    const basePayload = {
      // max_tokens 1200 → 2500 (2026-07-18) : 1200 pouvait être épuisé en
      // narration/recherches AVANT l'émission du JSON (schéma massif) →
      // stop_reason "max_tokens" sans la moindre accolade → "non parsable".
      model: "claude-haiku-4-5-20251001",
      // Identify : schéma bien plus court (aucun champ de marché) et aucune
      // narration de recherche. Sortie mesurée à 641–804 tokens sur 7 articles,
      // 1500 laisse une marge large sans plafonner le JSON.
      max_tokens: estIdentify ? 1500 : 2500,
      temperature: 0,
      // Passé en bloc de contenu (au lieu d'une chaîne) pour faire partie du
      // préfixe cachable. Contenu identique au caractère près — un `system`
      // chaîne et un `system` [{type:"text"}] sont équivalents pour le modèle.
      // Le prompt ne contient AUCUNE variable par appel (ni horodatage, ni
      // identifiant, ni compteur) : seuls le pays, la langue et le nombre de
      // photos le font varier, et ces trois-là sont constants pendant un scan.
      system: [{ type: "text", text: systemPrompt }],
    };

    // Analyse unifiée : web_search pour tout le monde (prix marché en direct),
    // avec repli sur l'analyse vision seule si l'outil échoue.
    // ⚠️ web_search est un outil SERVEUR : les recherches s'exécutent côté API
    // dans la même requête (blocs "server_tool_use"/"web_search_tool_result"),
    // il n'y a jamais de stop_reason "tool_use" ni de tool_result à renvoyer.
    // L'ancienne boucle filtrait type==="tool_use" → ne matchait jamais → boucle
    // morte : un tour long interrompu par l'API (stop_reason "pause_turn")
    // n'était jamais repris et le texte reçu s'arrêtait AVANT le JSON final
    // ("Réponse IA non parsable", casquette Volcom 18/07, déterministe selon
    // l'ordre des photos). Reprise correcte d'un pause_turn : rejouer la même
    // requête avec le contenu assistant partiel ajouté en fin de conversation.
    // ⚠️ IDENTIFY : AUCUN outil attaché — c'est toute la différence entre les
    // deux modes. Un seul tour, donc ni boucle pause_turn ni repli à prévoir
    // (la passe de réparation plus bas reste, elle, valable pour les deux).
    let data: any;
    if (estIdentify) {
      data = await callClaude(apiKey, { ...basePayload, messages: initialMessages });
      trackUsage(data);
    } else {
    try {
      const wsMessages: any[] = [...initialMessages];
      data = await callClaude(apiKey, {
        ...basePayload,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: wsMessages,
      }, "web-search-2025-03-05");
      trackUsage(data);

      for (let i = 0; i < 3 && data.stop_reason === "pause_turn"; i++) {
        wsMessages.push({ role: "assistant", content: data.content });
        data = await callClaude(apiKey, {
          ...basePayload,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: wsMessages,
        }, "web-search-2025-03-05");
        trackUsage(data);
      }
    } catch {
      // Repli sans outil : le préfixe diffère (plus de définition d'outil), il
      // ne peut donc pas réutiliser le cache écrit par le tour précédent.
      data = await callClaude(apiKey, { ...basePayload, messages: initialMessages });
      trackUsage(data);
    }
    }

    const rawText = (data.content as any[] ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text as string)
      .join("")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let itemData: Record<string, unknown>;
    try {
      itemData = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      try {
        if (!match) throw new Error("no JSON braces");
        itemData = JSON.parse(match[0]);
      } catch {
        // ── PASSE DE RÉPARATION (2026-07-22) ────────────────────────────────
        // Cause réelle : stop_reason "end_turn", aucune coupure — le modèle a
        // simplement répondu en PROSE (il a posé une question à l'utilisateur)
        // au lieu du JSON. Les correctifs pause_turn et max_tokens ne couvrent
        // pas ce mode d'échec : ce n'est ni un tour interrompu ni une sortie
        // tronquée, c'est un contournement du format.
        // Plutôt que d'échouer, on lui demande de reformater SA PROPRE réponse.
        // Cet appel n'a AUCUN outil : le prefill assistant y est donc sûr
        // (Haiku 4.5 le supporte — voice-intent le garde derrière !useWebSearch
        // pour cette même raison, la compatibilité prefill × outils serveur
        // n'étant pas documentée). Le prefill « { » rend la prose
        // structurellement impossible sur cette seconde passe.
        // Coût : au plus UN appel, et seulement quand le parsing a déjà échoué.
        console.error(`[lens-analysis] parse fail — stop_reason=${data?.stop_reason ?? "?"} — rawText(400): ${rawText.slice(0, 400)}`);
        try {
          const repair = await callClaude(apiKey, {
            ...basePayload,
            messages: [
              ...initialMessages,
              { role: "assistant", content: rawText.slice(0, 4000) },
              { role: "user", content: _lang === "en"
                  ? "Return ONLY the JSON object for the schema above. No question, no prose, no markdown. Unknown fields: null."
                  : "Renvoie UNIQUEMENT l'objet JSON du schéma ci-dessus. Aucune question, aucune prose, aucun markdown. Champs inconnus : null." },
              { role: "assistant", content: "{" },
            ],
          });
          trackUsage(repair);
          const suite = (repair.content as any[] ?? [])
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text as string)
            .join("");
          const recolle = "{" + suite;
          const fin = recolle.lastIndexOf("}");
          if (fin < 0) throw new Error("réparation sans accolade fermante");
          itemData = JSON.parse(recolle.slice(0, fin + 1));
          console.warn("[lens-analysis] réponse en prose RATTRAPÉE par la passe de réparation");
        } catch (repairErr) {
          console.error("[lens-analysis] passe de réparation en échec :", String((repairErr as any)?.message ?? repairErr));
          throw new Error(_lang === "en" ? "AI response could not be parsed" : "Réponse IA non parsable");
        }
      }
    }

    // Si l'utilisateur a fourni son prix d'achat, on ne retourne pas prix_achat_suggere
    if (prixAchat != null) itemData.prix_achat_suggere = null;

    // Filtre serveur (2026-07-28) : reference_fabricant en texte libre rejetée,
    // modele_source normalisée, etat_estime ramené dans sa liste fermée
    // (2026-07-29). APRÈS le parsing et la passe de réparation : tout chemin
    // qui produit un JSON passe par ici.
    const { mpnRejete, etatRejete } = assainirSortie(itemData);
    if (mpnRejete) logMeta = { ...logMeta, mpn_rejete: true };
    if (etatRejete) logMeta = { ...logMeta, etat_rejete: true };

    // ── Identify : champs de marché forcés à null DANS LE CODE ──────────────
    // Pas seulement par consigne de prompt. Un prix produit sans donnée marché
    // est faux dans un sens CONNU (mesuré : +24 % à +150 % sur 4 cas sur 7) et
    // il contamine verdict et score — l'écran « bonne affaire » mentirait. Et
    // commercialement, le prix est exactement ce qui reste à vendre à
    // 6 Pépites : s'il sortait gratuitement et de façon crédible, plus personne
    // ne paierait le scan complet.
    if (estIdentify) {
      for (const champ of CHAMPS_MARCHE) itemData[champ] = null;
    }

    if (estIdentify) {
      // Mémorisation 24 h (best-effort). Écrit APRÈS le forçage à null : ce qui
      // est resservi est exactement ce qui a été renvoyé.
      if (cacheCle) await ecrireCache(adminClient, cacheCle, userId, itemData);
      await loggerAppelIA(adminClient, userId, "lens_identify", { in: stats.in, out: stats.out }, {
        mode, cache_hit: false, photos: stats.photos, tours: stats.tours,
        duree_ms: Date.now() - debutMs,
        modele_source: itemData.modele_source ?? null,
        ...(mpnRejete ? { mpn_rejete: true } : {}),
        ...(etatRejete ? { etat_rejete: true } : {}),
      });
    } else {
      await enregistrerTelemetrie("ok");
    }
    console.log(
      `[lens-analysis][usage] mode=${mode} user=${user.id} photos=${stats.photos} tours=${stats.tours}`
      + ` in=${stats.in} out=${stats.out} cache_w=${stats.cache_w} cache_r=${stats.cache_r}`
      + ` recherches=${stats.recherches} ms=${Date.now() - debutMs}`
    );

    return new Response(JSON.stringify(itemData), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err: any) {
    console.error("[lens-analysis] Error:", err);
    // Analyse jamais livrée : on rembourse les Pépites débitées (créditées en
    // solde « acheté », cf. refund_coins). La reprise depuis le bouton
    // « Analyser avec l'IA » de LensTab est donc gratuite de fait : la
    // tentative ratée n'a rien coûté.
    // Un scan raté a tout de même consommé de l'API : sa télémétrie doit être
    // enregistrée, sinon le coût réel du Lens est sous-estimé. En identify, la
    // ligne part sous 'lens_identify' (aucune ligne 'lens' n'existe) et compte
    // donc dans le quota : un échec a coûté de l'argent, il ne doit pas être
    // gratuit du point de vue du garde-fou.
    if (estIdentify) {
      await loggerAppelIA(adminClient, userId, "lens_identify", { in: stats.in, out: stats.out }, {
        mode, cache_hit: false, photos: stats.photos, tours: stats.tours,
        duree_ms: Date.now() - debutMs, issue: "echec",
      });
    } else {
      await enregistrerTelemetrie("echec");
    }
    await releaseAttempt("lens_analysis_failed");
    if (err?.isAiUnavailable) {
      return new Response(JSON.stringify({ error: "ai_unavailable", retry_after: 30 }), {
        status: 503, headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    return new Response(JSON.stringify({ error: err?.message ?? "Internal error" }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
