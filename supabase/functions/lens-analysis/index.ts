import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Même helper que les quatre autres fonctions IA non facturées (voice-parse,
// normalize-title, stats-analysis, lot-distribute) : compte les appels sur 24 h
// glissantes dans usage_logs et laisse passer si le comptage échoue.
import { appelAutorise, loggerAppelIA, coutHaikuUsd } from "../_shared/usage-guard.ts";

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
// de Pépites (coin_config monthly_grant_* — 50/400/1200 depuis la grille du
// 2026-08-08).
// Deux modes (2026-07-28) :
//   • "full"     — le scan complet historique, web_search attaché, 6 Pépites.
//   • "identify" — la MÊME lecture de photos SANS recherche web, INCLUSE dans
//     le prix de publication. Mesuré sur 7 articles réels : marque 7/7
//     identique, taille 7/7 exploitable, description égale ou meilleure. Seul
//     le PRIX dépend vraiment du web (identify est optimiste de +24 % à +150 %),
//     donc identify n'en renvoie AUCUN — c'est aussi ce qui reste à vendre à
//     6 Pépites. Coût mesuré : 0,0101 € contre 0,0716 €, 9 s contre 16 s.
type LensMode = "full" | "identify";

// ══════════════════════════════════════════════════════════════════════════
// FAMILLES D'OBJETS (2026-08-11)
// ══════════════════════════════════════════════════════════════════════════
// Le schéma était un schéma de VÊTEMENT (titre, marque, modele, couleur,
// matiere, taille) appliqué à tout. Sur du non-textile il se dégradait de deux
// façons mesurées en base :
//   · `marque` étant un champ que le modèle se sentait obligé de remplir, il
//     attrapait n'importe quel texte présent — « Amazon » sur un meuble en bois
//     (distributeur), « arras » sur une lampe de mineur (la ville gravée),
//     « cp international » sur une poupée en porcelaine, « Ppc » sur une console
//     dont la description disait elle-même « marque VideoJet visible » ;
//   · les attributs qui FONT le prix hors textile (tension de batterie, capacité
//     de stockage, dimensions, référence de pièce, complet oui/non) n'avaient
//     nulle part où aller.
// Deux niveaux désormais : un SOCLE commun, et un sac `attributs_visibles`
// ouvert dont les clés dépendent de la famille.

// La famille est l'axe FIN (17 valeurs) ; `categorie` reste l'axe GROSSIER,
// celui qui descend tel quel dans inventaire.type.
const FAMILLES = [
  "mode", "chaussures", "bricolage", "electromenager", "high_tech", "mobilier",
  "maison_deco", "jouets", "collection", "auto_moto", "livres_medias", "sport",
  "puericulture", "beaute", "musique", "jardin", "autre",
] as const;
type Famille = typeof FAMILLES[number];

// ── famille → categorie → inventaire.type : mapping EXPLICITE et EXHAUSTIF ──
// Pas de correspondance implicite par nom : `categorie` n'est JAMAIS demandée au
// modèle, elle est DÉRIVÉE ici. Deux champs libres qui devraient s'accorder,
// c'est deux champs qui finissent par se contredire (cf. `marque` vs
// `description` sur la console VideoJet).
//
// Les valeurs de droite sont exactement celles du sélecteur de type de l'app
// (App.jsx) : `inventaire.type` est du texte libre côté base, le sélecteur fait
// donc foi. « Bricolage » et « Jardin » y existent depuis toujours, avec style,
// libellé EN, couleur de tuile, icône et règle detectType — seule l'énumération
// du Lens les ignorait, si bien qu'une perceuse ne pouvait PAS être rangée
// correctement par le Lens. C'est corrigé ici, sans nouveau type côté front.
//
// Deux renvois volontaires et tracés vers « Autre » :
//   · puericulture — l'app n'a pas de type « Puériculture », et « Jouets » est
//     faux pour une poussette. detectType() envoie déjà « poussette » sur
//     « Autre » : on suit la convention existante plutôt que d'en inventer une.
//     Créer le type est une décision produit (il change le sélecteur et les
//     couleurs de stats), pas une décision de refonte de prompt.
//   · chaussures → « Mode », qui n'est pas un renvoi par défaut mais le rangement
//     correct : l'app n'a pas de type « Chaussures ».
// « Multimédia » reste hors d'atteinte du Lens : il chevauche High-Tech et
// Livres sans frontière nette. Il demeure accessible à la main.
const FAMILLE_VERS_CATEGORIE: Record<Famille, string> = {
  mode:           "Mode",
  chaussures:     "Mode",
  bricolage:      "Bricolage",
  electromenager: "Électroménager",
  high_tech:      "High-Tech",
  mobilier:       "Maison",
  maison_deco:    "Maison",
  jouets:         "Jouets",
  collection:     "Collection",
  auto_moto:      "Auto-Moto",
  livres_medias:  "Livres",
  sport:          "Sport",
  puericulture:   "Autre",
  beaute:         "Beauté",
  musique:        "Musique",
  jardin:         "Jardin",
  autre:          "Autre",
};

// ── Attributs par famille ───────────────────────────────────────────────────
// Les CLÉS sont des identifiants : elles restent en français snake_case quelle
// que soit la langue de sortie, exactement comme `categorie` et `etat_estime`.
// Elles descendent telles quelles dans le contexte de resolve_aspects
// (generate-listing) : les renommer casserait la résolution des aspects eBay.
// ⚠️ Les 9 clés de l'ancien schéma fermé sont TOUTES conservées et réparties —
// nom_parfum/volume/teinte (beaute), reference_fabricant (universelle),
// taille_ecran/capacite (high_tech), hauteur/largeur/longueur (mobilier,
// maison_deco, autre). Aucune n'est perdue.
const ATTRIBUTS_PAR_FAMILLE: Record<Famille, string> = {
  mode:           "taille, coupe, composition, saison",
  chaussures:     "pointure, semelle, boite_origine",
  bricolage:      "filaire_ou_sans_fil, tension_batterie, nb_batteries, chargeur_inclus, coffret, fonctionne, accessoires_manquants",
  electromenager: "puissance, capacite, accessoires_inclus, fonctionne",
  high_tech:      "capacite, taille_ecran, generation_annee, cables_inclus, boite, etat_ecran, verrouillage_compte",
  mobilier:       "hauteur, largeur, longueur, materiau, demontable, notice_visserie",
  maison_deco:    "hauteur, largeur, longueur, materiau, nb_pieces",
  jouets:         "tranche_age, complet, nb_pieces, boite_origine",
  collection:     "annee_periode, edition, tirage, complet, signature",
  auto_moto:      "vehicules_compatibles, cote, oem_ou_adaptable",
  livres_medias:  "auteur, editeur, annee, isbn_ean, edition",
  sport:          "taille, discipline, niveau, complet",
  puericulture:   "tranche_age, norme_certification, complet",
  beaute:         "volume, nom_parfum, teinte, entame, dluo",
  musique:        "type_instrument, format, etat_disque, etat_pochette, annee",
  jardin:         "puissance, motorisation, largeur_coupe, fonctionne, accessoires_manquants",
  autre:          "hauteur, largeur, longueur, materiau, + toute caractéristique chiffrée ou lisible qui distingue cet objet d'un objet voisin",
};

/** Le tableau famille → attributs, tel qu'il apparaît dans le prompt. */
function tableauFamilles(): string {
  return FAMILLES.map((f) => `  ${f} : ${ATTRIBUTS_PAR_FAMILLE[f]}`).join("\n");
}

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
  // OUVERT depuis le 2026-08-11 : les clés dépendent de la famille (cf.
  // ATTRIBUTS_PAR_FAMILLE), un sac fermé de 9 clés textiles ne pouvait pas
  // porter une tension de batterie ni une compatibilité véhicule. Le serveur
  // assainit (clés/valeurs bornées, valeurs vides et « non renseigné » écartés).
  const attributsSchema = `"attributs_visibles":{"<cle>":"<valeur lue>"}|null`;
  const familleSchema = FAMILLES.map((f) => `"${f}"`).join("|");
  // Schéma RÉDUIT en identify : les champs de marché n'y figurent pas du tout.
  // Les retirer du schéma vaut mieux que demander « mets-les à null » — on ne
  // peut pas halluciner un champ qu'on n'a pas à produire — et ça raccourcit
  // d'autant la sortie facturée. Le code les force à null de toute façon.
  // ⚠️ `categorie` ne figure PLUS dans le schéma : elle est DÉRIVÉE de `famille`
  // par le serveur (FAMILLE_VERS_CATEGORIE). Deux champs à remplir qui doivent
  // s'accorder, c'est une contradiction de plus à produire — on n'en demande
  // qu'un. `reference` non plus : le serveur la recopie depuis la référence
  // fabricant validée, elle n'a donc qu'une seule source.
  const schema = estIdentify
    ? `{"titre":string,"famille":${familleSchema},"marque":string|null,"modele":string|null,"modele_source":"lue"|"reconnue"|null,"matiere":string|null,"couleur":string|null,"etat_estime":"Neuf avec étiquette"|"Neuf sans étiquette"|"Très bon état"|"Bon état"|"Satisfaisant"|null,"taille_estimee":string|null,"description":string,"prix_achat_reel":number|null,"confiance":"basse"|"moyenne"|"haute","notes":string,"est_vendu":boolean,"prix_vente_reel":number|null,${attributsSchema}}`
    : `{"titre":string,"famille":${familleSchema},"marque":string|null,"modele":string|null,"modele_source":"lue"|"reconnue"|"web"|null,"matiere":string|null,"couleur":string|null,"etat_estime":"Neuf avec étiquette"|"Neuf sans étiquette"|"Très bon état"|"Bon état"|"Satisfaisant"|null,"taille_estimee":string|null,"description":string,"prix_achat_reel":number|null,"prix_achat_suggere":number|null,"prix_vente_suggere":number,"fourchette_min":number,"fourchette_max":number,"fourchette_marche":{"bas":number,"moyen":number,"haut":number}|null,"annonces_marche":[{"titre":string,"prix":number,"plateforme":string}]|null,"vitesse_vente":"rapide"|"moyen"|"lent","vitesse_vente_explication":string|null,"plateformes":string[],"conseils":string[],"confiance":"basse"|"moyenne"|"haute","verdict":"excellent"|"bon"|"moyen"|"eviter","score":number,"notes":string,"est_vendu":boolean,"prix_vente_reel":number|null,${attributsSchema}}`;
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
    ? `OUTPUT LANGUAGE: every free-text string you produce — titre, description, matiere, notes, vitesse_vente_explication, conseils, and the VALUES inside attributs_visibles — MUST be written IN ENGLISH, whatever the language printed on the item, on its labels, or used in the user note. Enumerated values (famille, etat_estime, vitesse_vente, confiance, verdict, modele_source) and the KEYS of attributs_visibles are identifiers: they keep the exact spelling of the schema and stay in French even here, exactly like etat_estime. The one exception is text you TRANSCRIBE from the item itself — an inscription, a model name, a reference code — which is copied as it appears, never translated.`
    : `LANGUE DE SORTIE : toutes les chaînes en texte libre que tu produis — titre, description, matiere, notes, vitesse_vente_explication, conseils, ainsi que les VALEURS de attributs_visibles — DOIVENT être rédigées EN FRANÇAIS, quelle que soit la langue imprimée sur l'article, sur ses étiquettes, ou employée dans la note de l'utilisateur. Les valeurs énumérées (famille, etat_estime, vitesse_vente, confiance, verdict, modele_source) et les CLÉS de attributs_visibles sont des identifiants : elles gardent l'orthographe exacte du schéma. Seule exception : un texte que tu TRANSCRIS depuis l'objet — une inscription, un nom de modèle, un code de référence — se recopie tel qu'il apparaît, jamais traduit.`;

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
    ? `1ter. MODEL AND ITS PROVENANCE: "modele" is the COMMERCIAL model name ("GA-2100", "iPhone 13"), never the printed MPN (that one belongs to attributs_visibles.reference_fabricant). Fill "modele_source" with WHERE the value comes from: "lue" = the reference is physically legible on a photo (engraving, silkscreen, label, case back, sole, box); "reconnue" = nothing is written but the product is identified by its shape, allowed ONLY for iconic, widely distributed products (iPhone/MacBook models, G-Shock, well-known sneaker lines) and FORBIDDEN whenever marque is null.${estIdentify ? "" : sourceWeb} READABLE MANUFACTURER CODE: when a printed reference is read, it goes into attributs_visibles.reference_fabricant and the raw code itself NEVER goes into "modele" — "U9060CTN" as modele is a violation of this rule. If the commercial model line is legible IN CLEAR inside the code — the digits/name the brand actually sells under: "U9060CTN" → "9060", "M990GL6" → "990" — put THAT into "modele" with modele_source="lue" (it is physically read on the label). An opaque code whose model line you cannot extract with certainty ("DC7350-100") → modele=null, never a guess. In "titre", use the commercial name (modele), NEVER the printed reference: "New Balance 9060 shoes brown", not "… U9060CTN brown" — the code already lives in reference_fabricant. Any other case — vague resemblance, deduction from style, generic product — is an INVENTION: set modele=null and modele_source=null. If modele is null, modele_source MUST be null. A missing model costs far less than a wrong one.`
    : `1ter. MODÈLE ET SA PROVENANCE : "modele" est le NOM COMMERCIAL du modèle (« GA-2100 », « iPhone 13 »), jamais la référence imprimée (celle-ci va dans attributs_visibles.reference_fabricant). Renseigne "modele_source" avec l'ORIGINE de la valeur : "lue" = la référence est physiquement déchiffrable sur une photo (gravure, sérigraphie, étiquette, dos de boîtier, semelle, boîte) ; "reconnue" = rien n'est écrit mais le produit est identifié par sa forme, autorisé UNIQUEMENT pour des produits iconiques largement diffusés (modèles d'iPhone/MacBook, G-Shock, sneakers de série connue) et INTERDIT dès que marque est null.${estIdentify ? "" : sourceWeb} CODE FABRICANT LISIBLE : quand une référence imprimée est lue, elle va dans attributs_visibles.reference_fabricant et le code brut ne va JAMAIS dans "modele" — « U9060CTN » en modele est une violation de cette règle. Si la ligne de modèle commerciale est lisible EN CLAIR dans le code — les chiffres/le nom sous lesquels la marque vend réellement : « U9060CTN » → « 9060 », « M990GL6 » → « 990 » — mets CELLE-LÀ dans "modele" avec modele_source="lue" (elle est physiquement lue sur l'étiquette). Un code opaque dont tu ne peux pas extraire la ligne de modèle avec certitude (« DC7350-100 ») → modele=null, jamais une déduction. Dans "titre", utilise le nom commercial (modele), JAMAIS la référence imprimée : « Chaussures New Balance 9060 marron », pas « … U9060CTN marron » — le code vit déjà dans reference_fabricant. Tout autre cas — ressemblance vague, déduction depuis le style, produit générique — est une INVENTION : mets modele=null et modele_source=null. Si modele est null, modele_source DOIT être null. Une référence absente coûte beaucoup moins cher qu'une référence fausse.`;

  // ── Couleur (2026-07-28) ────────────────────────────────────────────────
  // Un MOT courant, jamais une nuance composée : la valeur descend telle quelle
  // dans canonical_fields, et les listes de couleurs des plateformes sont
  // FERMÉES (Vinted : « Gris », pas « gris chiné »). Une valeur composée ne
  // matcherait aucune option et le champ resterait vide.
  const couleurRule = lang === "en"
    ? ` Also read "couleur": the item's DOMINANT color, as ONE common word ("Black", "Grey", "Beige") — never a compound shade ("heather grey" → "Grey"), never two colors. null if the photos do not settle it.`
    : ` Lis aussi "couleur" : la couleur DOMINANTE de l'article, en UN mot courant (« Noir », « Gris », « Beige ») — jamais une nuance composée (« gris chiné » → « Gris »), jamais deux couleurs. null si les photos ne permettent pas de trancher.`;

  // ── Type de produit (2026-07-30) ────────────────────────────────────────
  // Cas réel New Balance 9060 « Triple Black » : l'identify a titré
  // « Chaussures de randonnée » des sneakers lifestyle (silhouette trail +
  // semelle crantée), et generate-listing — qui ne voit AUCUNE photo — a
  // fidèlement propagé ce faux type jusqu'aux 4 annonces, garde-fou
  // anti-invention compris (le fait venait de SON contexte). La règle doit
  // donc vivre ICI, à la source visuelle. Le doute se résout TOUJOURS vers
  // le générique, jamais vers le spécifique.
  const typeRule = lang === "en"
    ? ` PRODUCT TYPE — DOUBT ALWAYS RESOLVES TO THE GENERIC: a type implying a sport practice or a technical use ("hiking shoes", "trail/running shoes", "safety shoes", "ski jacket", "work trousers"…) may be written — in titre as in description — ONLY when it is established: either brand + model identified as belonging to that category, or an explicit mention legible on the item or its label ("Gore-Tex", "Trail", "steel toe"…). Otherwise use the neutral generic term ("sneakers", "shoes", "jacket"). A rugged silhouette or a lugged sole NEVER suffices: lifestyle sneakers look like hiking shoes without being any. Same rule for performance claims ("functional", "waterproof"): not established the same way → not written.`
    : ` TYPE DE PRODUIT — LE DOUTE SE RÉSOUT TOUJOURS VERS LE GÉNÉRIQUE : un type impliquant une pratique sportive ou un usage technique (« chaussures de randonnée », « chaussures de trail/running », « chaussures de sécurité », « veste de ski », « pantalon de travail »…) ne s'écrit — dans titre comme dans description — QUE s'il est établi : soit marque + modèle identifiés comme appartenant à cette catégorie, soit mention explicite lisible sur l'article ou son étiquette (« Gore-Tex », « Trail », « steel toe »…). Sinon, emploie le terme générique et neutre (« baskets », « sneakers », « chaussures », « veste »). Une silhouette robuste ou une semelle crantée ne suffit JAMAIS : des sneakers lifestyle ressemblent à des chaussures de randonnée sans en être. Même règle pour les allégations de performance (« fonctionnelles », « imperméables ») : non établies de la même façon → non écrites.`;

  // ── Famille + attributs spécifiques (2026-08-11) ────────────────────────
  // L'étape qui ouvre le Lens à autre chose que du textile. Elle passe EN
  // PREMIER dans le processus : la famille décide quels attributs sont à
  // chercher, donc où porter l'attention sur les photos.
  const familleRule = lang === "en"
    ? `0. FAMILY FIRST — it determines everything else. Pick exactly ONE "famille" from the schema, then fill "attributs_visibles" with the attributes that actually set the price for THAT family:
${tableauFamilles()}
   reference_fabricant (the manufacturer code/reference printed on the item) applies to EVERY family — read it whenever it is legible.
   A key you cannot READ does not exist: omit it. NEVER write "non renseigné", "inconnu", "N/A", "unknown", "?" or an empty string as a value — an absent key and a null are the only ways to say "I don't know". Values are short and factual ("18 V", "128 Go", "80 cm", "oui", "non", "non testé"), never a sentence. Nothing legible → attributs_visibles=null.
   A resale item you cannot place → famille="autre", and put in attributs_visibles the dimensions plus whatever measurable, legible characteristic distinguishes this object from a neighbouring one. "autre" is a correct answer, not a failure — a wrong family is worse, because it sends the item to the wrong category and the wrong buyers.
   "taille_estimee" concerns ONLY what is WORN (mode, chaussures, sport, puericulture). For every other family it is null — a drill has no size; its measurements go into attributs_visibles as hauteur/largeur/longueur.`
    : `0. LA FAMILLE D'ABORD — elle commande tout le reste. Choisis exactement UNE "famille" du schéma, puis renseigne "attributs_visibles" avec les attributs qui font réellement le prix DANS CETTE famille :
${tableauFamilles()}
   reference_fabricant (le code / la référence du fabricant imprimé sur l'objet) vaut pour TOUTES les familles — lis-la dès qu'elle est déchiffrable.
   Une clé que tu ne peux pas LIRE n'existe pas : omets-la. N'écris JAMAIS « non renseigné », « inconnu », « N/A », « ? » ni une chaîne vide comme valeur — une clé absente ou null sont les deux seules façons de dire « je ne sais pas ». Les valeurs sont courtes et factuelles (« 18 V », « 128 Go », « 80 cm », « oui », « non », « non testé »), jamais une phrase. Rien de lisible → attributs_visibles=null.
   Un objet revendable que tu n'arrives pas à placer → famille="autre", et mets dans attributs_visibles les dimensions ainsi que toute caractéristique mesurable et lisible qui le distingue d'un objet voisin. « autre » est une réponse correcte, pas un échec — une famille fausse est pire, elle range l'article dans la mauvaise catégorie et devant les mauvais acheteurs.
   "taille_estimee" ne concerne QUE ce qui se PORTE (mode, chaussures, sport, puericulture). Pour toutes les autres familles elle vaut null — une perceuse n'a pas de taille ; ses mesures vont dans attributs_visibles en hauteur/largeur/longueur.`;

  // ── MARQUE : la règle anti-hallucination (2026-08-11) ────────────────────
  // LE bug. Cas relevés en base sur 7 jours : « Amazon » sur un meuble en bois,
  // « arras » sur une lampe de mineur (la ville gravée), « cp international »
  // sur une poupée en porcelaine, « Ducati Monstra » au lieu de « Monster »,
  // « Ppc » sur une console dont la description disait « marque VideoJet
  // visible ». Le modèle EN EST CAPABLE — un niveau à bulle Milwaukee est
  // identifié correctement, avec une note honnête sur ce qui manque : c'est le
  // cadrage qui l'en empêchait, pas la vision.
  // Écrite une seule fois et servie aux DEUX modes : la marque se lit sur des
  // photos, la présence ou l'absence de recherche web n'y change rien.
  const marqueRule = lang === "en"
    ? `2. BRAND — READ, NEVER GUESSED. marque is null unless a MANUFACTURER brand is legible on the item, its label, its hallmark or its packaging. Returning null is a CORRECT and expected result, never a failure: an unbranded object is the normal case for furniture, tools, crockery, bric-a-brac and most vintage items.
   NEVER put into "marque":
     · a retailer or a marketplace — Amazon, Cdiscount, Temu, Shein, Wish, Action, Gifi, Lidl (outside its own house brands), a supermarket chain: those sell the object, they do not make it;
     · a place name — a town, a region, a country read on the item ("ARRAS" engraved on a miner's lamp is where it was used, not who built it);
     · a generic or decorative word printed on the object ("Vintage", "Original", "Handmade", "Paris");
     · the name of a product SOLD INSIDE the container — "Grey-Poupon" on an old mustard pot names the mustard, not the potter;
     · a deduction from style, era, shape or country of origin. "Looks like X" is not "is X".
   If a text is legible on the item but you are not certain it is the brand, it goes into "notes" — 'text legible on the item: "…"' — and marque stays null. That sentence is useful to the seller; a wrong brand is not.
   CONSISTENCY, MANDATORY: "marque" must be the brand your own "description" names. If the description mentions a visible brand, marque cannot contain a different one — and cannot be null either. Re-read your description before closing the JSON.`
    : `2. MARQUE — LUE, JAMAIS DEVINÉE. marque vaut null tant qu'aucune marque de FABRICANT n'est lisible sur l'objet, son étiquette, son poinçon ou son emballage. Renvoyer null est un résultat CORRECT et attendu, jamais un échec : un objet sans marque est le cas NORMAL pour du mobilier, de l'outillage, de la vaisselle, de la brocante et la plupart des objets anciens.
   NE JAMAIS mettre dans "marque" :
     · un distributeur ou une marketplace — Amazon, Cdiscount, Temu, Shein, Wish, Action, Gifi, Lidl (hors ses marques propres), une enseigne de supermarché : ils vendent l'objet, ils ne le fabriquent pas ;
     · un nom de lieu — une ville, une région, un pays lu sur l'objet (« ARRAS » gravé sur une lampe de mineur dit où elle a servi, pas qui l'a construite) ;
     · un mot générique ou décoratif imprimé sur l'objet (« Vintage », « Original », « Fait main », « Paris ») ;
     · le nom d'un produit VENDU DANS le contenant — « Grey-Poupon » sur un ancien pot à moutarde nomme la moutarde, pas le potier ;
     · une déduction à partir du style, de l'époque, de la forme ou du pays d'origine. « Ça ressemble à du X » n'est pas « c'est du X ».
   Si un texte est lisible sur l'objet sans que tu sois certain qu'il s'agisse de la marque, il va dans "notes" — « texte lisible sur l'objet : "…" » — et marque reste null. Cette phrase-là sert au vendeur ; une marque fausse, non.
   COHÉRENCE, OBLIGATOIRE : "marque" doit être celle que ta propre "description" cite. Si la description mentionne une marque visible, marque ne peut pas en contenir une autre — ni rester null. Relis ta description avant de fermer le JSON.`;

  // ── Confiance (2026-08-11) ──────────────────────────────────────────────
  // Le modèle sait déjà bien dire ce qui lui manque sur du textile (« une photo
  // de l'étiquette trancherait »). On étend ce réflexe à tout, et on interdit la
  // confiance haute quand la marque est nulle : sinon « meuble sans marque » et
  // « iPhone 13 128 Go lu au dos » sortent avec le même niveau de certitude.
  const confianceRule = lang === "en"
    ? `2bis. CONFIDENCE, AND WHAT WOULD SETTLE IT. "haute" ONLY if a brand OR a manufacturer reference is read directly on the item AND the family is certain. If marque is null, confiance cannot exceed "moyenne", whatever else you managed to read. If the family itself is uncertain, confiance="basse". Whenever confiance is not "haute", "notes" must name the ONE extra photo that would settle it, as concretely as possible: the rating plate, the sewn label, the underside of the object, the back of the case, the serial number, the box. Not "a clearer photo" — WHICH photo, and of WHAT.`
    : `2bis. CONFIANCE, ET CE QUI LA TRANCHERAIT. « haute » UNIQUEMENT si une marque OU une référence fabricant est lue directement sur l'objet ET que la famille est certaine. Si marque est null, confiance ne peut pas dépasser « moyenne », quoi que tu aies réussi à lire par ailleurs. Si la famille elle-même est incertaine, confiance="basse". Dès que confiance n'est pas « haute », "notes" doit nommer LA photo supplémentaire qui trancherait, le plus concrètement possible : la plaque signalétique, l'étiquette cousue, le dessous de l'objet, le dos du boîtier, le numéro de série, la boîte. Pas « une photo plus nette » — QUELLE photo, et de QUOI.`;

  // ── Lecture du texte porté par l'objet (2026-08-11) ─────────────────────
  // Relevé : « ÉTIGER LA CAPSULE » sur un pot à moutarde, pour « EXIGER LA
  // CAPSULE ». Une transcription lissée mais fausse est pire qu'une
  // transcription trouée : le vendeur ne peut pas la corriger s'il ne sait pas
  // qu'elle est douteuse.
  const lectureTexteRule = lang === "en"
    ? ` TEXT CARRIED BY THE OBJECT: engraved, moulded, embossed or printed inscriptions are transcribed EXACTLY as they appear — same wording, same spelling, same capitalisation. Do not "repair" a text into the phrase you expect. If a character is uncertain, transcribe what you actually see and say so in "notes" ("inscription partly illegible: …"). A transcription with a hole in it is usable; a smoothed-over transcription that is wrong is not, because nobody can tell it is wrong.`
    : ` TEXTE PORTÉ PAR L'OBJET : les inscriptions gravées, moulées, embossées ou imprimées se transcrivent EXACTEMENT telles qu'elles apparaissent — même libellé, même orthographe, même casse. Ne « répare » pas un texte vers la formule que tu attends. Si un caractère est incertain, transcris ce que tu vois réellement et signale-le dans "notes" (« inscription partiellement illisible : … »). Une transcription trouée est exploitable ; une transcription lissée mais fausse ne l'est pas, puisque personne ne peut savoir qu'elle est fausse.`;

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
    // The brand rule is IDENTICAL in both modes — a brand is read off photos,
    // and whether a search tool is attached changes nothing about that. Full
    // mode only adds what the tool may and may not be used for.
    const etape2 = marqueRule + (estIdentify
      ? ` In this mode you have NO web access and NO tool: there is nothing to "confirm", and marque=null must never mean "I could not confirm it".`
      : ` USING WEB SEARCH ON THE BRAND: search is allowed ONLY to check the exact spelling and the existence of a brand you have ALREADY READ on the item ("pict pure clothing" → "Picture Organic Clothing"). It is FORBIDDEN to use it to go looking for a brand you did not read: a search cannot see the object. And a search never REPLACES what you read with something that merely resembles it — if what you read is not confirmed, keep the reading as it is or set marque=null, never the nearest real-sounding brand.`);
    const etapesMarche = estIdentify ? "" : `3. PRICE ESTIMATION: Always base prices on a real web search. BUILD THE QUERY FROM WHAT YOU ACTUALLY READ, in this order of preference: (a) the manufacturer reference when you have one — it is the most discriminating term there is; (b) brand + commercial model; (c) failing both, the plain object type plus its price-setting attributes ("cordless drill 18V 2 batteries", "solid oak chest of drawers 4 drawers"). NEVER build a query on a brand you did not read on the item: a price estimate sourced from a hallucinated brand is the worst possible outcome — it is wrong AND it looks sourced. When marque is null, that is not a reason to skip the search: search the object type, and say so in notes ("unbranded item, price based on comparable X").
   Query: "[brand] [item type] Vinted price" or site:vinted.com. Fallback: eBay. Set fourchette_min/fourchette_max AND fourchette_marche.bas/moyen/haut from actual listings. Cite source in notes (e.g. "Based on 5 Vinted listings"). Also fill "annonces_marche": the INDIVIDUAL listings you actually based the range on — those only, never every raw result — each with titre (the title as it appears in the search results), prix (number, in euros) and plateforme ("Vinted", "eBay", "Leboncoin"…), 8 at most. INVENTING or completing a listing is FORBIDDEN: a listing whose title or price does not appear in the search results is LEFT OUT — omit rather than guess. No usable individual listing → annonces_marche=null, and the range stays set exactly as described above. If no data: confiance="basse".
4. SPEED & PLATFORMS: Estimate vitesse_vente (rapide/moyen/lent) with vitesse_vente_explication. Order plateformes by best fit for this item. Provide exactly 2–3 concrete conseils to maximise the sale.
5. SCORE: Rate 0–10 based on potential margin, demand, and ease of resale.
`;
    const etape8 = estIdentify
      ? `8. RULES: NO PRICE, NO VERDICT. You have no market data, so you produce none: never write a price, a range, a sale speed, a verdict or a score anywhere — not even inside "notes" or "description". prix_achat_reel is the ONLY number you may fill, and only when the user states it. Confidence follows step 2bis, without exception. notes: what you could NOT read (an absent label, a blurry photo), any text legible on the item you were not certain about, and which second photo would settle it — never a price comment.`
      : `8. RULES:
   MARGIN CALCULATION (strict priority):
   - If prix_achat_reel is not null: margin = prix_vente_suggere − prix_achat_reel. This is the ONLY basis for verdict and score. NEVER anchor prix_vente_suggere on it (market data only).
   - If prix_achat_reel is null: margin = prix_vente_suggere − prix_achat_suggere.
   VERDICT (margin-only, no exceptions): verdict="excellent" if margin>40% of prix_vente_suggere, "bon" if>20%, "moyen" if>0%, "eviter" if margin≤0.
   CRITICAL: if prix_achat_reel is known and margin is negative or zero → verdict MUST be "eviter". Strong brand and high demand are secondary factors — they NEVER override a negative real margin.
   SCORE (0–10, reflects real profitability): negative margin → 0–3; margin 0–20% → 4–5; margin 20–40% → 6–7; margin >40% → 8–10. Adjust ±1 for demand/ease, but NEVER above 4 if real margin is negative.
   Confidence follows step 2bis; on top of that, if no usable market data was found, confiance="basse".
   prix_achat_suggere: your independent market estimate — set to null if prix_achat_reel is not null. notes: price source + one actionable tip.`;
    return `You are an expert in secondhand resale (${platforms}).${multiNote}
Analyze the item and return ONLY valid JSON (no markdown, no explanation):

ABSOLUTE RULE, OVERRIDING EVERY OTHER INSTRUCTION: your reply must be a JSON object matching the schema, and NOTHING else. You are NEVER asked to ask a question, request clarification, or comment on what is missing. If a piece of information is absent, uncertain or unreadable, set that field to null (or its default) and CARRY ON: uncertainty is expressed through "confiance":"basse" and the "notes" field, never through a question or any text outside the JSON. A prose reply is a FAILURE, however helpful or polite it may be.
${langueDirective}
${schema}
${countryName ? `Region: ${countryName}.` : ""} Platforms from: ${platforms}

MANDATORY PROCESS — follow in order:
${familleRule}
1. IDENTIFICATION: Identify marque, modele, matiere, etat_estime from visual cues and labels. Fill "etat_estime" with EXACTLY one of the five schema values, never free text. "Neuf avec étiquette" as soon as an ORIGINAL HANGING TAG is visible on a photo (cardboard swing tag, price tag still attached to the garment). "Neuf sans étiquette" when the user note states the item is new and never worn, with no hanging tag visible. ⚠️ A SEWN-IN label (brand, size, composition) is NOT an original tag: it stays in place on a worn item and proves nothing. FOR EVERYTHING ELSE, "Très bon état" is your DEFAULT answer and must be the outcome in the vast majority of cases — it is what resellers actually use. These all stay "Très bon état": pilling, folds, storage creases, slight fading, a dim photo, a lightly scuffed sole. Only go down to "Bon état" when a defect is SHARP and VISIBLE on the photo: a clear stain, marked wear, a missing button. "Satisfaisant" is reserved for a DAMAGED item: hole, tear, rip, broken part. When hesitating between two levels, ALWAYS pick the higher one. etat_estime=null only if the photos do not show the item itself. For taille_estimee (size), prioritize the "User note:" field first: if the user writes a size in free text (e.g. "size M", "taille 42", "pointure 42", "US 9", "UK 8"), use that. Infer from context whether the item is a garment (letter sizes XS-XXL or EU numeric 34-52) or a shoe (EU/US/UK shoe size). For garments, keep the exact system the user wrote in (e.g. "M", "42") — never convert speculatively. For shoes, always format the value as "EU {n}" (e.g. "EU 42", "EU 38.5") regardless of language, even if the user wrote a bare number or a US/UK size you can reliably convert to EU — this avoids confusion with garment numeric sizes. Only if no size appears in the user note, try to read it visually from a tag/label in the photos. If still nothing found, set taille_estimee=null — never invent a value. Since the app is in English, append the US shoe-size equivalent in parentheses only when a reliable EU→US conversion exists (e.g. "EU 42 (US 9)") — omit it if you're not confident in the conversion.${couleurRule}${typeRule}${lectureTexteRule}
1bis. VISIBLE ATTRIBUTES: fill attributs_visibles ONLY with values READ on the item, its label or its packaging — NEVER estimated, deduced or speculatively converted. Which keys to look for is decided by the family you picked at step 0. Required confidence: include a key ONLY if the reading is CLEAR — blurry photo, partial text or deduction = key ABSENT. Nothing legible → attributs_visibles=null. Format conventions that matter downstream: volume "50 ml" (with a space), capacite "128 Go", taille_ecran "6,7 pouces", hauteur/largeur/longueur ONLY if numeric measurements are printed on the item or visible on a measuring tape in a photo, with the unit ("80 cm"). Yes/no attributes (fonctionne, complet, boite, chargeur_inclus, demontable…) take exactly "oui", "non" or "non testé" — and "non testé" is the honest answer for anything electrical you cannot see running in a photo. reference_fabricant is a CODE (letters/digits, e.g. "GA-2100A-1AER"), never a sentence: if you cannot read a code, omit the key — a description of what you see ("quality control hallmarks visible on the back…") is a violation of this rule and is rejected by the server.
${modeleRule}
${etape2}
${confianceRule}
${etapesMarche}6. PURCHASE PRICE EXTRACTION: Read the field labelled "User note:" in the message. If the user mentions a price they paid — in any form ("bought for 20", "paid €15", "cost me 8 euros", "acheté 50e", etc.) — extract the numeric value and set prix_achat_reel to that number. If no price is mentioned, set prix_achat_reel to null.
7. SALE DETECTION: Read the "User note:" field. If the user says they already sold this item — in any form ("sold for 80€", "sold it for X", "I sold it", "vendu 80€", "je l'ai vendu", etc.) — set est_vendu: true and prix_vente_reel to the numeric sale amount. Otherwise set est_vendu: false and prix_vente_reel: null.
${etape8}`;
  }
  // Règle marque IDENTIQUE dans les deux modes — une marque se lit sur des
  // photos, la présence d'un outil de recherche n'y change rien. Le mode complet
  // ajoute seulement ce à quoi l'outil a le droit de servir, et ce à quoi il n'a
  // pas le droit de servir.
  const etape2Fr = marqueRule + (estIdentify
    ? ` Dans ce mode tu n'as AUCUN accès web et AUCUN outil : il n'y a rien à « confirmer », et marque=null ne doit jamais vouloir dire « je n'ai pas pu confirmer ».`
    : ` USAGE DE LA RECHERCHE WEB SUR LA MARQUE : la recherche sert UNIQUEMENT à vérifier l'orthographe exacte et l'existence d'une marque que tu as DÉJÀ LUE sur l'objet (« pict pure clothing » → « Picture Organic Clothing »). Il est INTERDIT de s'en servir pour aller chercher une marque que tu n'as pas lue : une recherche ne voit pas l'objet. Et une recherche ne REMPLACE jamais ce que tu as lu par quelque chose qui y ressemble — si ta lecture n'est pas confirmée, garde-la telle quelle ou mets marque=null, jamais la marque réelle la plus proche.`);
  const etapesMarcheFr = estIdentify ? "" : `3. ESTIMATION PRIX : Toujours baser les prix sur une web search réelle. CONSTRUIS LA REQUÊTE À PARTIR DE CE QUE TU AS RÉELLEMENT LU, dans cet ordre de préférence : (a) la référence fabricant quand tu en as une — c'est le terme le plus discriminant qui existe ; (b) marque + modèle commercial ; (c) à défaut des deux, le type d'objet nu accompagné de ses attributs qui font le prix (« perceuse sans fil 18V 2 batteries », « commode chêne massif 4 tiroirs »). NE JAMAIS construire une requête sur une marque que tu n'as pas lue sur l'objet : une estimation de prix fondée sur une marque hallucinée est le pire cas possible — elle est fausse ET elle a l'air sourcée. Une marque null n'est pas une raison de sauter la recherche : cherche le type d'objet, et dis-le dans notes (« objet sans marque, prix basé sur des X comparables »).
   Requête : "[marque] [type] Vinted prix" ou site:vinted.fr. Fallback : eBay.fr ou Leboncoin. Fixer fourchette_min/fourchette_max ET fourchette_marche.bas/moyen/haut à partir des annonces trouvées. Citer la source dans notes (ex : "Prix basé sur 5 annonces Vinted"). Remplis aussi "annonces_marche" : les annonces INDIVIDUELLES sur lesquelles tu as réellement fondé la fourchette — celles-là seulement, jamais tous les résultats bruts — chacune avec titre (le titre tel qu'il apparaît dans les résultats de recherche), prix (nombre, en euros) et plateforme (« Vinted », « eBay », « Leboncoin »…), 8 au maximum. INTERDIT d'inventer ou de compléter une annonce : une annonce dont le titre ou le prix n'apparaît pas dans les résultats de recherche est ÉCARTÉE — omets plutôt que deviner. Aucune annonce individuelle exploitable → annonces_marche=null, et la fourchette reste fixée exactement comme décrit ci-dessus. Si aucune donnée : confiance="basse".
4. VITESSE ET PLATEFORMES : Estimer vitesse_vente (rapide/moyen/lent) avec vitesse_vente_explication. Ordonner les plateformes par pertinence pour cet article. Fournir exactement 2 à 3 conseils concrets dans le champ conseils pour maximiser la vente.
5. SCORE : Note de 0 à 10 basée sur la marge potentielle, la demande et la facilité de revente.
`;
  const etape8Fr = estIdentify
    ? `8. RÈGLES : AUCUN PRIX, AUCUN VERDICT. Tu n'as aucune donnée de marché, donc tu n'en produis aucune : n'écris nulle part un prix, une fourchette, une vitesse de vente, un verdict ni un score — pas même dans "notes" ou "description". prix_achat_reel est le SEUL nombre que tu peux renseigner, et uniquement si l'utilisateur l'indique. La confiance suit l'étape 2bis, sans exception. notes : ce que tu n'as PAS pu lire (étiquette absente, photo floue), tout texte lisible sur l'objet dont tu n'étais pas certain, et quelle photo de plus trancherait — jamais un commentaire de prix.`
    : `8. RÈGLES :
   CALCUL DE MARGE (priorité stricte) :
   - Si prix_achat_reel n'est pas null : marge = prix_vente_suggere − prix_achat_reel. C'est l'UNIQUE base pour le verdict et le score — NE JAMAIS l'utiliser pour fixer prix_vente_suggere (toujours basé sur les données marché).
   - Si prix_achat_reel est null : marge = prix_vente_suggere − prix_achat_suggere.
   VERDICT (basé uniquement sur la marge, sans exception) : verdict="excellent" si marge>40% du prix_vente_suggere, "bon" si>20%, "moyen" si>0%, "eviter" si marge≤0.
   CRITIQUE : si prix_achat_reel est connu et que la marge est négative ou nulle → verdict DOIT être "eviter". La marque forte et la demande sont des facteurs secondaires — ils ne peuvent JAMAIS contredire une marge réelle négative.
   SCORE (0 à 10, reflète la rentabilité réelle) : marge négative → 0-3 ; marge 0-20% → 4-5 ; marge 20-40% → 6-7 ; marge >40% → 8-10. Ajuster ±1 selon demande/facilité, jamais au-dessus de 4 si marge réelle négative.
   La confiance suit l'étape 2bis ; en plus de cela, si aucune donnée de marché exploitable n'a été trouvée, confiance="basse".
   prix_achat_suggere : estimation marché indépendante — mettre à null si prix_achat_reel n'est pas null. notes : source de l'estimation prix + un conseil concret pour vendre plus vite.`;
  return `Tu es expert en achat-revente occasion (${platforms}).${multiNote}
Analyse l'article et réponds UNIQUEMENT avec du JSON valide (sans markdown, sans explication) :

RÈGLE ABSOLUE, PRIORITAIRE SUR TOUTE AUTRE INSTRUCTION : ta réponse doit être un objet JSON conforme au schéma, et RIEN d'autre. Il ne t'est JAMAIS demandé de poser une question, de réclamer une précision, ni de commenter ce qui te manque. Si une information est absente, incertaine ou illisible, mets le champ à null (ou à sa valeur par défaut) et CONTINUE : l'incertitude se signale par "confiance":"basse" et par le champ "notes", jamais par une question ni par du texte hors JSON. Une réponse en prose est un ÉCHEC, même si elle est utile et polie.
${langueDirective}
${schema}
${countryName ? `Région : ${countryName}.` : ""} Plateformes parmi : ${platforms}

PROCESSUS OBLIGATOIRE — suivre dans l'ordre :
${familleRule}
1. IDENTIFICATION : Identifie marque, modele, matiere, etat_estime à partir des indices visuels et étiquettes. Renseigne "etat_estime" avec EXACTEMENT une des cinq valeurs du schéma, jamais du texte libre. « Neuf avec étiquette » dès qu'une ÉTIQUETTE D'ORIGINE PENDANTE est visible sur une photo (étiquette cartonnée, étiquette de prix encore attachée au vêtement). « Neuf sans étiquette » si la note utilisateur affirme que l'article est neuf et jamais porté, sans étiquette pendante visible. ⚠️ Une étiquette COUSUE (marque, taille, composition) n'est PAS une étiquette d'origine : elle reste en place sur un article porté et ne prouve rien. POUR TOUT LE RESTE, « Très bon état » est ta réponse PAR DÉFAUT, et elle doit sortir dans la très grande majorité des cas — c'est la valeur que mettent les revendeurs. Restent en « Très bon état » : bouloches, plis, faux plis de rangement, légère décoloration, photo sombre, semelle un peu marquée. Ne descends à « Bon état » QUE si un défaut est NET et VISIBLE sur la photo : tache franche, usure marquée, bouton manquant. « Satisfaisant » est réservé à un article ABÎMÉ : trou, accroc, déchirure, pièce cassée. En cas d'hésitation entre deux niveaux, choisis TOUJOURS le plus haut. etat_estime=null uniquement si les photos ne montrent pas l'article lui-même. Pour taille_estimee, priorise d'abord le champ "Note de l'utilisateur :" : si l'utilisateur écrit une taille en texte libre (ex : "taille M", "taille 42", "pointure 42", "US 9", "UK 8"), utilise-la. Déduis du contexte s'il s'agit d'un vêtement (tailles lettres XS-XXL ou numériques FR/EU 34-52) ou d'une chaussure (pointure EU/US/UK). Pour un vêtement, garde le système exact utilisé par l'utilisateur (ex : "M", "42") — ne convertis jamais de façon spéculative. Pour une chaussure, formate toujours la valeur en "EU {n}" (ex : "EU 42", "EU 38.5"), même si l'utilisateur a écrit un nombre seul ou une pointure US/UK que tu peux convertir de façon fiable en EU — ça évite la confusion avec les tailles vêtement numériques. Seulement si aucune taille n'apparaît dans la note utilisateur, essaie de la lire visuellement sur une étiquette en photo. Si toujours rien trouvé, mets taille_estimee=null — n'invente jamais de valeur.${couleurRule}${typeRule}${lectureTexteRule}
1bis. ATTRIBUTS VISIBLES : renseigne attributs_visibles UNIQUEMENT avec des valeurs LUES sur l'article, son étiquette ou son packaging — JAMAIS estimées, déduites ni converties spéculativement. Quelles clés chercher est décidé par la famille choisie à l'étape 0. Niveau de confiance exigé : n'inclus une clé QUE si la lecture est NETTE — photo floue, texte partiel ou déduction = clé ABSENTE. Aucune clé lisible → attributs_visibles=null. Conventions de format qui comptent en aval : volume « 50 ml » (avec espace), capacite « 128 Go », taille_ecran « 6,7 pouces », hauteur/largeur/longueur UNIQUEMENT si des mesures chiffrées sont imprimées sur l'objet ou visibles sur un mètre en photo, avec l'unité (« 80 cm »). Les attributs oui/non (fonctionne, complet, boite, chargeur_inclus, demontable…) prennent exactement « oui », « non » ou « non testé » — et « non testé » est la réponse honnête pour tout ce qui est électrique et qu'aucune photo ne montre en marche. reference_fabricant est un CODE (lettres/chiffres, ex : « GA-2100A-1AER »), jamais une phrase : si tu ne lis pas de code, omets la clé — décrire ce que tu vois (« Poinçons de contrôle qualité visibles au dos… ») viole cette règle et est rejeté par le serveur.
${modeleRule}
${etape2Fr}
${confianceRule}
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
//
// ⚠️ TROIS verdicts, pas deux (investigation du 03/08). L'ancien
// referenceFabricantValide rendait null aussi bien pour une phrase parasite
// que pour une valeur JSON null / chaîne vide — et mpn_rejete comptait les
// deux. Relevé des logs 27/07→03/08 : les 57 rejets de la semaine étaient
// TOUS « rejetée: null » — zéro phrase parasite. Le taux d'~30 % mesurait la
// part d'articles SANS référence imprimée (vêtements, cosmétiques…), pas une
// dérive du modèle. D'où la séparation :
//   « absente »  = null / vide / "null" : l'article n'a pas de référence,
//                  réponse correcte sur le fond (le modèle pose la clé à null
//                  au lieu de l'omettre — écart de forme, pas signalé) ;
//   « invalide » = une vraie valeur qui viole les règles du code : c'est LE
//                  cas pour lequel le garde-fou existe, le seul compté
//                  mpn_rejete et le seul journalisé.
const MPN_MAX_MOTS = 6;
const MPN_MAX_CARACTERES = 50;

function classerReferenceFabricant(v: unknown): {
  valeur: string | null;
  verdict: "valide" | "absente" | "invalide";
} {
  if (v == null) return { valeur: null, verdict: "absente" };
  if (typeof v !== "string") return { valeur: null, verdict: "invalide" };
  const s = v.trim();
  if (!s || s.toLowerCase() === "null") return { valeur: null, verdict: "absente" };
  if (
    s.length > MPN_MAX_CARACTERES ||
    s.endsWith(".") ||
    s.split(/\s+/).filter(Boolean).length > MPN_MAX_MOTS
  ) {
    return { valeur: null, verdict: "invalide" };
  }
  return { valeur: s, verdict: "valide" };
}

const MODELE_SOURCES = new Set(["lue", "reconnue", "web"]);

// ── Sac d'attributs OUVERT : assainissement serveur (2026-08-11) ────────────
// Ouvrir les clés au modèle sans filet, c'est accepter « non renseigné » comme
// valeur — exactement ce que le brief interdit, et exactement ce qu'un modèle
// fait quand une clé lui est suggérée et qu'il ne sait pas. La consigne de
// prompt ne suffit pas (l'étape 1bis interdisait déjà les valeurs déduites
// depuis le 16/07, et elle a été violée en prod) : seule la validation serveur
// tient. Une clé refusée DISPARAÎT, elle n'est pas mise à null.
const ATTRIBUTS_MAX_CLES = 20;
const ATTRIBUT_VALEUR_MAX = 120;
const ATTRIBUT_CLE_MAX = 40;

/** Valeurs qui veulent dire « je ne sais pas » et doivent donc être ABSENTES. */
const VALEURS_VIDES = new Set([
  "null", "none", "nil", "n a", "na", "nc", "inconnu", "inconnue", "unknown",
  "non renseigne", "non renseignee", "non precise", "non precisee",
  "non specifie", "non specifiee", "non communique", "non indique",
  "not specified", "not provided", "not applicable", "unspecified",
  "?", "-", "--", "aucun", "aucune",
]);

/**
 * Normalise une clé d'attribut en identifiant snake_case ASCII.
 * `Tension batterie` / `tension-batterie` / `Tension_Batterie` → `tension_batterie`.
 * Une clé qui ne survit pas à la normalisation est rejetée : elle ne serait de
 * toute façon exploitable par personne en aval (resolve_aspects la lit comme un
 * nom de champ).
 */
function normaliserCleAttribut(brut: string): string | null {
  const cle = brut
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cle || cle.length > ATTRIBUT_CLE_MAX) return null;
  return cle;
}

/**
 * Assainit `attributs_visibles`, sac ouvert clé/valeur.
 * · valeur non scalaire, vide, ou disant « je ne sais pas » → clé SUPPRIMÉE ;
 * · valeur tronquée à 120 caractères (un attribut est une valeur, pas une phrase) ;
 * · clé normalisée en snake_case ASCII ;
 * · 20 clés au maximum, dans l'ordre d'émission ;
 * · sac vide → null (le contrat dit null, pas {}).
 * `reference_fabricant` garde sa validation stricte propre, appliquée ensuite.
 */
function assainirAttributs(brut: unknown): Record<string, string> | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const propres: Record<string, string> = {};
  for (const [cleBrute, valeurBrute] of Object.entries(brut as Record<string, unknown>)) {
    if (Object.keys(propres).length >= ATTRIBUTS_MAX_CLES) break;
    const cle = normaliserCleAttribut(cleBrute);
    if (!cle) continue;
    // Nombres et booléens acceptés puis rendus en texte : le modèle écrit
    // volontiers 4 ou true là où la clé attend « 4 » ou « oui ». Rejeter ces
    // valeurs-là perdrait une lecture correcte pour un détail de typage.
    let valeur: string;
    if (typeof valeurBrute === "string") valeur = valeurBrute.trim();
    else if (typeof valeurBrute === "number" && Number.isFinite(valeurBrute)) valeur = String(valeurBrute);
    else if (typeof valeurBrute === "boolean") valeur = valeurBrute ? "oui" : "non";
    else continue;
    if (!valeur) continue;
    if (VALEURS_VIDES.has(aplatir(valeur))) continue;
    propres[cle] = valeur.slice(0, ATTRIBUT_VALEUR_MAX);
  }
  return Object.keys(propres).length ? propres : null;
}

// ── famille → categorie : résolution serveur (2026-08-11) ───────────────────
// `categorie` n'est plus produite par le modèle, elle est DÉRIVÉE ici. Les
// alias couvrent les slugs voisins qu'un modèle produit naturellement malgré
// l'énumération (« high-tech », « meubles », « livres ») : sans eux, un simple
// tiret ferait basculer tout un article en « autre » sans que rien ne le dise.
const FAMILLE_ALIAS: Record<string, Famille> = {
  hightech: "high_tech", tech: "high_tech", electronique: "high_tech",
  electro: "electromenager", electromenagers: "electromenager",
  livres: "livres_medias", livre: "livres_medias", medias: "livres_medias", media: "livres_medias",
  maison: "maison_deco", deco: "maison_deco", decoration: "maison_deco",
  meuble: "mobilier", meubles: "mobilier", ameublement: "mobilier",
  auto: "auto_moto", moto: "auto_moto", automoto: "auto_moto", piece_auto: "auto_moto",
  chaussure: "chaussures", jouet: "jouets", vetement: "mode", vetements: "mode",
  bebe: "puericulture", cosmetique: "beaute", cosmetiques: "beaute", parfum: "beaute",
  outillage: "bricolage", outil: "bricolage", outils: "bricolage",
  instrument: "musique", instruments: "musique", jardinage: "jardin",
};

function resoudreFamille(v: unknown): Famille | null {
  if (typeof v !== "string") return null;
  const brut = v.trim();
  if (!brut) return null;
  const cle = normaliserCleAttribut(brut);
  if (!cle) return null;
  if ((FAMILLES as readonly string[]).includes(cle)) return cle as Famille;
  return FAMILLE_ALIAS[cle] ?? null;
}

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
function assainirSortie(item: Record<string, unknown>): {
  mpnRejete: boolean;
  mpnAbsente: boolean;
  etatRejete: boolean;
  familleInconnue: boolean;
} {
  let mpnRejete = false;
  let mpnAbsente = false;

  // Sac ouvert d'abord (clés normalisées, valeurs vides écartées), MPN ensuite :
  // la validation stricte de la référence s'applique à ce qui a survécu.
  const a = assainirAttributs(item.attributs_visibles);
  if (a) {
    if ("reference_fabricant" in a) {
      const brutMpn = a.reference_fabricant;
      const { valeur, verdict } = classerReferenceFabricant(brutMpn);
      if (verdict === "valide") {
        a.reference_fabricant = valeur as string;
      } else {
        delete a.reference_fabricant;
        if (verdict === "invalide") {
          // Le seul cas qui mérite un warn : le modèle a ÉCRIT quelque chose
          // et ce quelque chose viole les règles d'un code fabricant.
          console.warn(`[lens-analysis] reference_fabricant rejetée: ${String(brutMpn).slice(0, 120)}`);
          mpnRejete = true;
        } else {
          // Clé posée à null/vide : article sans référence, pas d'alerte.
          mpnAbsente = true;
        }
      }
    } else {
      mpnAbsente = true;
    }
  }
  // Toutes les clés lues ont été refusées : le contrat dit null, pas {}.
  item.attributs_visibles = a && Object.keys(a).length ? a : null;

  // ── famille → categorie, et `reference` en miroir (2026-08-11) ────────────
  // Une famille non reconnue tombe en « autre » → categorie « Autre », de façon
  // VOLONTAIRE et TRACÉE : `familleInconnue` remonte dans usage_logs, sinon un
  // slug inattendu viderait silencieusement toute une catégorie d'articles.
  const famille = resoudreFamille(item.famille);
  const familleInconnue = famille === null;
  if (familleInconnue) {
    console.warn(`[lens-analysis] famille non reconnue, repli sur "autre" : ${String(item.famille).slice(0, 60)}`);
  }
  const familleFinale: Famille = famille ?? "autre";
  item.famille = familleFinale;
  item.categorie = FAMILLE_VERS_CATEGORIE[familleFinale];

  // `reference` du socle : RECOPIE de la référence fabricant validée, jamais une
  // seconde demande au modèle. Un même fait produit deux fois, c'est un fait qui
  // finit par se contredire — et c'est déjà ce qui s'est passé entre `marque` et
  // `description` sur la console VideoJet.
  const attrsFinaux = item.attributs_visibles as Record<string, string> | null;
  item.reference = attrsFinaux?.reference_fabricant ?? null;

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

  // ── Plafond de confiance (2026-08-11) ───────────────────────────────────
  // Posé DANS LE CODE, pas seulement par consigne : « marque nulle » est
  // précisément le cas où le modèle a le moins de prise, donc celui où une
  // confiance haute trompe le plus. Sans marque ni référence lue, le plafond
  // est « moyenne » ; une famille non reconnue force « basse ».
  const CONFIANCES = ["basse", "moyenne", "haute"];
  const confianceBrute = typeof item.confiance === "string" ? item.confiance.trim().toLowerCase() : "";
  let rang = CONFIANCES.indexOf(confianceBrute);
  if (rang < 0) rang = 0;
  const marqueLue = !!(typeof item.marque === "string" && item.marque.trim() && item.marque.trim().toLowerCase() !== "null");
  const referenceLue = !!item.reference;
  if (!marqueLue && !referenceLue) rang = Math.min(rang, 1);
  if (familleInconnue) rang = 0;
  item.confiance = CONFIANCES[rang];

  return { mpnRejete, mpnAbsente, etatRejete: etat.rejete, familleInconnue };
}

// ── annonces_marche (2026-07-30, chantier « sources de l'estimation ») ───────
// Les annonces individuelles que le modèle dit avoir RETENUES pour fixer la
// fourchette. EXPOSITION seulement : la fourchette reste calculée par le
// modèle exactement comme avant (étape 3 inchangée sur le fond) — ce filtre
// garantit juste au front des entrées complètes, jamais des données bricolées :
//   · entrée sans titre lisible ou sans prix fini > 0 → ÉCARTÉE (on omet, on
//     ne complète pas — règle du chantier : aucune donnée inventée) ;
//   · plateforme conservée seulement si c'est une chaîne non vide ;
//   · 10 entrées max (le prompt en demande 8) ;
//   · rien d'exploitable → null : le front n'affiche alors AUCUN bloc source.
function assainirAnnoncesMarche(item: Record<string, unknown>): void {
  const brut = item.annonces_marche;
  if (!Array.isArray(brut)) { item.annonces_marche = null; return; }
  const propres = brut
    .map((a) => {
      if (!a || typeof a !== "object" || Array.isArray(a)) return null;
      const o = a as Record<string, unknown>;
      const titre = typeof o.titre === "string" ? o.titre.trim().slice(0, 160) : "";
      const prix = typeof o.prix === "number" && Number.isFinite(o.prix) && o.prix > 0 ? o.prix : null;
      if (!titre || prix == null) return null;
      const plateforme = typeof o.plateforme === "string" && o.plateforme.trim()
        ? o.plateforme.trim().slice(0, 40)
        : null;
      return { titre, prix, ...(plateforme ? { plateforme } : {}) };
    })
    .filter(Boolean)
    .slice(0, 10);
  item.annonces_marche = propres.length ? propres : null;
}

// ── Empreinte de la SORTIE dans usage_logs (2026-08-11) ────────────────────
// Le scan payant ne stockait AUCUNE trace de ce qu'il avait produit : usage_logs
// ne portait que coût, tokens et nombre de recherches web. Une plainte
// utilisateur (« le Lens dit n'importe quoi sur mes objets maison ») n'était
// donc PAS diagnosticable : le seul endroit où une sortie survivait était
// lens_identify_cache, purgé à 24 h, et uniquement pour le mode identify.
//
// Ce qui entre : de quoi requêter la QUALITÉ par famille d'objet.
// Ce qui n'entre PAS, et n'entrera jamais : photos, URLs de photos,
// description complète, notes, note utilisateur — aucune donnée personnelle.
// `titre_genere` est tronqué à 120 caractères : c'est un libellé d'article, pas
// un contenu utilisateur, et il sert à retrouver le cas dans l'inventaire.
//
// Aucune migration : usage_logs.metadata est déjà en jsonb, on ajoute des clés
// dans un objet existant. Rien à GRANTer.
//
// ⚠️ `famille` sort null tant que la Tâche 2 n'est pas déployée — c'est VOULU :
// ces lignes-là sont la mesure de référence « avant fix ».
const TITRE_MAX_TELEMETRIE = 120;

function texteNonVide(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s && s.toLowerCase() !== "null" ? s : null;
}

function empreinteSortie(item: Record<string, unknown>): Record<string, unknown> {
  const attrs = item.attributs_visibles;
  const nbAttributs = attrs && typeof attrs === "object" && !Array.isArray(attrs)
    ? Object.keys(attrs as Record<string, unknown>).length
    : 0;
  const titre = texteNonVide(item.titre);
  return {
    famille: texteNonVide(item.famille),
    categorie: texteNonVide(item.categorie),
    // TOUJOURS présent, true comme false — contrairement à `marque_absente`,
    // qui n'est écrit que quand il vaut true et dont l'ABSENCE est donc
    // ambiguë (marque présente ? ou ligne d'avant l'instrumentation ?).
    // Les deux coexistent : `marque_absente` porte la série des 7 derniers
    // jours, on ne la casse pas en cours de mesure.
    marque_nulle: texteNonVide(item.marque) == null,
    confiance: texteNonVide(item.confiance),
    nb_attributs: nbAttributs,
    titre_genere: titre ? titre.slice(0, TITRE_MAX_TELEMETRIE) : null,
  };
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
const VERSION_PROMPT = "2026-08-11-familles";

// Champs de marché forcés à null en identify — dans le CODE, pas seulement par
// consigne de prompt (ils ne figurent déjà plus dans le schéma identify).
const CHAMPS_MARCHE = [
  "prix_vente_suggere", "prix_achat_suggere", "fourchette_min", "fourchette_max",
  "fourchette_marche", "annonces_marche", "vitesse_vente", "vitesse_vente_explication",
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
  // `sortie` : empreinte de ce que le modèle a RÉELLEMENT produit (2026-08-11),
  // absente sur un échec — il n'y a alors rien à décrire.
  async function enregistrerTelemetrie(issue: string, sortie?: Record<string, unknown>) {
    if (logId == null) return;
    try {
      await adminClient.from("usage_logs").update({
        metadata: {
          ...logMeta,
          ...(sortie ?? {}),
          issue,
          photos: stats.photos,
          tours: stats.tours,
          input_tokens: stats.in,
          output_tokens: stats.out,
          cache_creation_input_tokens: stats.cache_w,
          cache_read_input_tokens: stats.cache_r,
          web_search_requests: stats.recherches,
          // Coût réel de l'appel (audit du 08/08) — les CINQ composantes,
          // tarifs partagés avec usage-guard (source unique) : entrée,
          // sortie, cache écriture (1,25×), cache lecture (0,10×), web
          // search (0,01 $/requête, facturé à part par Anthropic). Le poste
          // le plus cher du produit (~10 $/semaine) était invisible de toute
          // somme par cost_usd : les tokens étaient journalisés, jamais
          // valorisés.
          cost_usd: Number(coutHaikuUsd({
            in: stats.in,
            out: stats.out,
            cacheW: stats.cache_w,
            cacheR: stats.cache_r,
            webSearches: stats.recherches,
          }).toFixed(6)),
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
    const { mpnRejete, mpnAbsente, etatRejete, familleInconnue } = assainirSortie(itemData);
    // Depuis le 03/08, mpn_rejete ne compte QUE les vraies valeurs invalides
    // (celles pour lesquelles le garde-fou a été écrit). mpn_absente = le
    // modèle a posé la clé à null : article sans référence imprimée, réponse
    // correcte — c'était ~100 % de l'ancien compteur (57/57 sur la semaine du
    // 27/07). marque_absente comble le trou de télémétrie : aucun chiffre ne
    // disait jusqu'ici si `marque` sortait renseignée sur un scan complet.
    const marqueBrute = typeof itemData.marque === "string" ? itemData.marque.trim() : "";
    const marqueAbsente = !marqueBrute || marqueBrute.toLowerCase() === "null";
    if (mpnRejete) logMeta = { ...logMeta, mpn_rejete: true };
    if (mpnAbsente) logMeta = { ...logMeta, mpn_absente: true };
    if (etatRejete) logMeta = { ...logMeta, etat_rejete: true };
    if (marqueAbsente) logMeta = { ...logMeta, marque_absente: true };
    if (familleInconnue) logMeta = { ...logMeta, famille_inconnue: true };
    // Sources de la fourchette : entrées incomplètes écartées, jamais complétées
    // (sans objet en identify — le champ y est reforcé à null juste dessous).
    assainirAnnoncesMarche(itemData);

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
      // L'empreinte de sortie part aussi sur 'lens_identify' : c'est le mode
      // INCLUS dans la publication, donc celui qui alimente le plus d'articles
      // d'inventaire — mesurer la qualité sur le seul scan payant laisserait
      // aveugle sur la majorité des identifications réellement livrées.
      await loggerAppelIA(adminClient, userId, "lens_identify", { in: stats.in, out: stats.out }, {
        mode, cache_hit: false, photos: stats.photos, tours: stats.tours,
        duree_ms: Date.now() - debutMs,
        modele_source: itemData.modele_source ?? null,
        ...empreinteSortie(itemData),
        ...(mpnRejete ? { mpn_rejete: true } : {}),
        ...(mpnAbsente ? { mpn_absente: true } : {}),
        ...(etatRejete ? { etat_rejete: true } : {}),
        ...(marqueAbsente ? { marque_absente: true } : {}),
        ...(familleInconnue ? { famille_inconnue: true } : {}),
      });
    } else {
      await enregistrerTelemetrie("ok", empreinteSortie(itemData));
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
