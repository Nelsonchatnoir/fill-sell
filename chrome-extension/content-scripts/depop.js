// ═══════════════════════════════════════════════════════════════════════════
// DEPOP — CONNECTEUR (09/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// ── INJECTÉ PAR LE BACKGROUND, DERRIÈRE UNE PERMISSION OPTIONNELLE ──────────
// Même patron qu'Opla, pas une deuxième mécanique : www.depop.com est en
// `optional_host_permissions` ; ce fichier n'est déclaré NULLE PART dans le
// manifest, il est enregistré (chrome.scripting.registerContentScripts) après
// le clic « Autoriser Depop ». Sans ce clic, le parc n'a ni l'hôte, ni ce code.
// Et le serveur ne sert un job Depop qu'aux comptes autorisés (garde en base,
// migration 20261009020000) : pour tous les autres, rien n'arrive jamais ici.
//
// ── L'API DEPUIS LA PAGE, JAMAIS DU SERVICE WORKER ──────────────────────────
// MESURÉ le 08/10 : webapi.depop.com appelé hors navigateur → 403 (« Forbidden
// - Depop »). Depuis une page www.depop.com, avec le jeton de la session
// (cookie `access_token`, lisible par la page, envoyé en `Authorization:
// Bearer` — exactement ce que fait le site) → 200. Rien n'est contourné : on
// appelle ce que le formulaire « Sell » appelle, au rythme d'une personne
// (une requête à la fois, des pauses entre les pages d'une liste).
//
// ── CONTRATS RELEVÉS EN RÉEL (09/10, compte de Nico, annonce de test à 999 €
//    créée puis supprimée ; docs/plateformes/depop/CARTOGRAPHIE.md § 8) ───────
//   photo    : POST /presentation/api/v1/pictures/ {type, extension, dimensions}
//              → 201 {id, url (PUT S3 présigné)} ; PUT ; POST …/pictures/validate/
//              {picture_ids} jusqu'à status « complete » (non carré accepté) ;
//   création : POST /presentation/api/v1/listing/products/ → 201 {id, slug} ;
//   lecture  : GET /presentation/api/v1/products/<id>/ (publique) →
//              status STATUS_ONSALE | STATUS_PURCHASED ; 404 « Product not found » ;
//   retrait  : DELETE /presentation/api/v1/products/<id>/ → 204, puis 404 ;
//   boutique : GET /presentation/api/v1/shops/<id>/products/[?after=…] (en
//              vente), …/by-status/sold/ (vendues) ;
//   vendeur  : GET /api/v1/sellerOnboarding/sellerStatus/ → canSell.
//
// ⛔ UNE ERREUR RÉSEAU N'EST JAMAIS UN VERDICT. « Failed to fetch » (CORS sur un
//    jeton invalide, coupure, Cloudflare) ne dit ni « déconnecté », ni « retirée »,
//    ni « vendue » : on le dit tel quel et on reprend plus tard.
// ⛔ CE QUI N'A PAS D'ÉQUIVALENT DEPOP DEVIENT UNE QUESTION (taille hors de la
//    grille de la feuille, marque introuvable dans la liste Depop, genre d'un
//    article enfant, frais de port) — jamais une valeur choisie à la place de la
//    personne. Seule l'ABSENCE de marque part en « Other » (`unbranded`), comme
//    le formulaire de Depop le propose lui-même.
// ═══════════════════════════════════════════════════════════════════════════

/* eslint-disable no-unused-vars */
/* global chrome */

const DEPOP_ACTIF = true;
const DEPOP_API = "https://webapi.depop.com";
const DEPOP_SITE = "https://www.depop.com";
// Une page de liste à la fois, une pause « humaine » entre deux (mesuré : aucun
// 429 sur ~25 appels espacés de ≥ 0,6 s le 08/10).
const DEPOP_PAUSE_MS = 900;
const DEPOP_PAGES_MAX = 60;          // 24 annonces par page → 1 440 annonces
const DEPOP_PHOTOS_MAX = 8;          // « Add up to 8 photos » (formulaire)
const DEPOP_DESCRIPTION_MAX = 1000;  // MAX_CHAR_COUNT (bundle du formulaire)
const DEPOP_HASHTAGS_MAX = 5;        // MAX_HASHTAGS
const DEPOP_PORT_MAX = 100;          // MAX_MANUAL_SHIPPING_PRICE (strictement inférieur)
const DEPOP_PHOTO_COTE_MAX = 1280;   // IMAGE_DEFAULT_COMPRESSED_SIZE_PX
const DEPOP_BEAUTE_NEUF_SEULEMENT = Object.freeze(["bath-and-body", "fragrance", "hair-products", "makeup", "nails", "skincare"]);
const DEPOP_ETATS = Object.freeze(["brand_new", "used_like_new", "used_excellent", "used_good", "used_fair"]);
// Libellés des questions, dans le vocabulaire de l'app (une réponse revient en
// français et se traduit ici en identifiant Depop — même table que
// src/utils/depopAttributs.js DEPOP_ETAT_PAR_PALIER).
const DEPOP_ETAT_PAR_LIBELLE = Object.freeze({
  "Neuf avec étiquette": "brand_new",
  "Neuf sans étiquette": "used_like_new",
  "Très bon état": "used_excellent",
  "Bon état": "used_good",
  "Satisfaisant": "used_fair",
});
// Sens retour (relevé) : jamais au-dessus du réel — used_like_new couvre
// « neuf sans étiquette » ET « occasion comme neuve », on prend le plus bas.
const DEPOP_LIBELLE_PAR_ETAT = Object.freeze({
  brand_new: "Neuf avec étiquette",
  used_like_new: "Très bon état",
  used_excellent: "Très bon état",
  used_good: "Bon état",
  used_fair: "Satisfaisant",
});
const DEPOP_COULEUR_LIBELLE = Object.freeze({
  black: "Noir", grey: "Gris", white: "Blanc", cream: "Crème", tan: "Beige", orange: "Orange", red: "Rouge",
  burgundy: "Bordeaux", pink: "Rose", purple: "Violet", blue: "Bleu", navy: "Marine", green: "Vert",
  khaki: "Kaki", brown: "Marron", yellow: "Jaune", silver: "Argenté", gold: "Doré", multi: "Multicolore",
});
const DEPOP_GENRE_PAR_LIBELLE = Object.freeze({ Fille: "female", "Garçon": "male", Mixte: "unisex" });

// Session morte : la FORME compte autant que le fond. background.js
// (motifSessionMorte, traiterMurDeConnexion) reconnaît « Connexion <X>
// requise… » et route le job vers l'ATTENTE de session — aucune tentative
// consommée. Le geste est « Me connecter » dans l'app.
const DEPOP_MSG_SESSION =
  "Connexion Depop requise : ta session Depop est fermée sur ton ordinateur. " +
  "Appuie sur « Me connecter » et connecte-toi à Depop — dès que c'est fait, la publication repart toute seule.";
// Vendeur pas encore configuré (mesuré le 08/10 sur le compte de Nico : Depop
// enregistre l'annonce en brouillon et exige « Add payment info » avant toute
// mise en ligne). Ce n'est pas la session : c'est une étape du compte.
const DEPOP_MSG_SESSION_RETRAIT =
  "Connexion Depop requise : ta session Depop est fermée sur ton ordinateur. " +
  "Appuie sur « Me connecter » et connecte-toi à Depop — dès que c'est fait, le retrait repart tout seul.";
const DEPOP_MSG_VENDEUR =
  "Depop demande de terminer ta configuration de vendeur avant toute mise en ligne (moyen de paiement à relier sur depop.com). " +
  "Ta connexion n'est pas en cause : termine cette étape sur depop.com sur ton ordinateur, puis relance la publication.";

// ═══════════════════════════════════════════════════════════════════════════
// 1. L'API
// ═══════════════════════════════════════════════════════════════════════════
// ⟦depop-lecture:début⟧
function depopJeton() {
  const m = String(document.cookie ?? "").match(/(?:^|;\s*)access_token=([^;]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}
const depopAttendre = (ms) => new Promise((r) => setTimeout(r, ms));

// ── UNE LECTURE QUI ÉCHOUE « RÉSEAU » EST REPRISE (09/10, parcours réel) ─────
// Mesuré le 09/10 depuis la page de Nico, avec le MÊME jeton valable :
// users/me en échec RAPIDE (« Failed to fetch » en 20 à 40 ms) 3 fois sur 19 à
// 1,5 s d'intervalle, 200 autour ; sellerStatus aussi, par moments ; la
// lecture publique (sans Authorization, donc sans pré-requête CORS) : 0 sur
// 19. La publication croisée 1ad7fa87 a perdu 15 min sur ce tout premier appel
// (« Session Depop illisible (reseau) », 09:11:03 UTC), passée telle quelle à
// l'essai suivant. Une LECTURE (GET) qui échoue ainsi est relancée deux fois
// (1 s, puis 2,5 s) avant d'être dite « reseau ». Une ÉCRITURE (POST, PUT,
// DELETE) ne l'est JAMAIS ici : le geste qui l'a lancée relit Depop avant de
// conclure — jamais une annonce créée deux fois, jamais un retrait aveugle.
// Une réponse (401, 404, 429, 500…) n'est jamais reprise : elle se lit.
const DEPOP_REPRISES_LECTURE_MS = Object.freeze([1000, 2500]);

async function depopJson(chemin, { methode = "GET", corps, authentifie = true } = {}) {
  const jeton = authentifie ? depopJeton() : null;
  if (authentifie && !jeton) return { statut: 401, ok: false, corps: null, sansJeton: true };
  const headers = { Accept: "application/json" };
  if (jeton) headers.Authorization = `Bearer ${jeton}`;
  if (corps !== undefined) headers["Content-Type"] = "application/json";
  let r;
  for (let essai = 0; ; essai++) {
    try {
      r = await fetch(DEPOP_API + chemin, {
        method: methode, headers, credentials: "omit", cache: "no-store",
        ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
      });
      break;
    } catch (e) {
      if (methode === "GET" && essai < DEPOP_REPRISES_LECTURE_MS.length) {
        await depopAttendre(DEPOP_REPRISES_LECTURE_MS[essai]);
        continue;
      }
      return { statut: 0, ok: false, corps: null, erreurReseau: String(e?.message ?? e).slice(0, 120), essais: essai + 1 };
    }
  }
  const texte = await r.text().catch(() => "");
  let json = null;
  try { json = texte ? JSON.parse(texte) : null; } catch { json = null; }
  return { statut: r.status, ok: r.ok, corps: json, texte: json === null ? texte.slice(0, 200) : null };
}
// ⟦depop-lecture:fin⟧

const DEPOP_ENDPOINTS = {
  moi: "/presentation/api/v1/users/me/",
  vendeur: "/api/v1/sellerOnboarding/sellerStatus/",
  attributs: "/presentation/api/v1/attributes/",
  grilles: "/presentation/api/v1/attributes/categories/size-mapping/",
  photo: "/presentation/api/v1/pictures/",
  photoValider: "/presentation/api/v1/pictures/validate/",
  creer: "/presentation/api/v1/listing/products/",
  produit: (id) => `/presentation/api/v1/products/${encodeURIComponent(id)}/`,
  produitParSlug: (slug) => `/presentation/api/v1/products/by-slug/${encodeURIComponent(slug)}/`,
  enVente: (vendeur, apres) => `/presentation/api/v1/shops/${encodeURIComponent(vendeur)}/products/${apres ? `?after=${encodeURIComponent(apres)}` : ""}`,
  vendues: (vendeur, apres) => `/presentation/api/v1/shops/${encodeURIComponent(vendeur)}/products/by-status/sold/${apres ? `?after=${encodeURIComponent(apres)}` : ""}`,
};
const DEPOP_PAYS_URL = "https://assets.depop.com/web/assets/listing/location/countries.json";
// Repli mesuré (countries.json du 08/10) : le formulaire envoie exactement ceci
// pour un compte français dont le profil dit « France ».
const DEPOP_LIEU_FR = Object.freeze({ address: "France", countryCode: "FR", geoLat: 47.8249046208979, geoLng: 2.61878695312962 });

const depopUrlPublique = (slug) => `${DEPOP_SITE}/products/${encodeURIComponent(slug)}/`;
// Le slug vit dans l'URL (/products/<slug>/, /fr/products/<slug>/manage/) ; un
// slug Depop porte toujours un tiret (« prefixe-mots-suffixe ») — ce qui écarte
// /products/create/ et /products/edit/.
function depopSlugDepuisUrl(url) {
  const m = String(url ?? "").match(/\/products\/([A-Za-z0-9]+-[A-Za-z0-9-]*[A-Za-z0-9])(?:[/?#]|$)/);
  return m ? m[1] : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LA SESSION, ET LE COMPTE VENDEUR
// ═══════════════════════════════════════════════════════════════════════════
async function depopSession() {
  if (!depopJeton()) return { connecte: false, motif: "sans_jeton" };
  const moi = await depopJson(DEPOP_ENDPOINTS.moi);
  if (moi.statut === 401) return { connecte: false, motif: "http_401" };
  if (!moi.ok || !moi.corps?.id) return { connecte: null, motif: moi.erreurReseau ? "reseau" : `http_${moi.statut}` };
  return { connecte: true, id: moi.corps.id, username: moi.corps.username ?? null, pays: String(moi.corps.country ?? "").toUpperCase() || null };
}
async function depopStatutVendeur() {
  const v = await depopJson(DEPOP_ENDPOINTS.vendeur);
  if (v.statut === 401) return { session: false };
  if (!v.ok || typeof v.corps?.canSell !== "boolean") return { canSell: null, motif: v.erreurReseau ? "reseau" : `http_${v.statut}` };
  return { canSell: v.corps.canSell, reonboarding: v.corps.needsReonboarding === true };
}

// Région de grille (une feuille porte une grille PAR RÉGION : IT = système EUR
// pour la France et l'UE) et devise (getCurrencyCodeFromCountryCode du site).
function depopRegion(pays) {
  return pays === "GB" ? "GB" : pays === "US" ? "US" : pays === "AU" ? "AU" : "IT";
}
const DEPOP_PAYS_EURO = new Set(["FR", "BE", "DE", "IT", "ES", "NL", "IE", "AT", "PT", "FI", "LU", "GR", "SK", "SI", "EE", "LV", "LT", "MT", "CY", "HR"]);

// ═══════════════════════════════════════════════════════════════════════════
// 3. LES RÉFÉRENTIELS (publics, lus une fois par onglet)
// ═══════════════════════════════════════════════════════════════════════════
let depopAttributsCache = null;
let depopGrillesCache = null;
async function depopAttributs() {
  if (depopAttributsCache) return depopAttributsCache;
  const r = await depopJson(DEPOP_ENDPOINTS.attributs, { authentifie: false });
  if (!r.ok || !Array.isArray(r.corps?.brand)) throw new Error(`référentiel Depop illisible (HTTP ${r.statut || r.erreurReseau || "?"})`);
  const marques = new Map();
  const ambigues = new Set();
  for (const b of r.corps.brand) {
    if (!b?.id || b.status !== "active") continue;
    for (const cle of new Set([depopNormaliser(b.name), depopNormaliser(b.id)])) {
      if (!cle) continue;
      if (marques.has(cle) && marques.get(cle).id !== b.id) ambigues.add(cle);
      else marques.set(cle, { id: b.id, nom: b.name });
    }
  }
  depopAttributsCache = { marques, ambigues };
  return depopAttributsCache;
}
async function depopGrilles() {
  if (depopGrillesCache) return depopGrillesCache;
  const r = await depopJson(DEPOP_ENDPOINTS.grilles, { authentifie: false });
  if (!r.ok || !Array.isArray(r.corps?.category_size_mapping) || !Array.isArray(r.corps?.size_sets)) {
    throw new Error(`grilles de tailles Depop illisibles (HTTP ${r.statut || r.erreurReseau || "?"})`);
  }
  const feuilles = new Map();
  for (const e of r.corps.category_size_mapping) feuilles.set(`${e.department}/${e.group}/${e.product_type}`, e);
  const grilles = new Map(r.corps.size_sets.map((s) => [s.id, s]));
  depopGrillesCache = { feuilles, grilles };
  return depopGrillesCache;
}
// Le lieu de l'annonce : la préférence du formulaire si la personne en a une,
// sinon le pays du profil (fichier public du site), sinon le relevé du 08/10.
async function depopLieu(pays) {
  try {
    const pref = JSON.parse(localStorage.getItem("DEPOP_LISTING_LOCATION_PREFERENCES") ?? "null");
    if (pref && pref.countryCode === pays && Number.isFinite(pref.geoLat) && Number.isFinite(pref.geoLng) && pref.address) return pref;
  } catch { /* préférence illisible : on passe */ }
  try {
    const r = await fetch(DEPOP_PAYS_URL, { credentials: "omit" });
    const liste = r.ok ? await r.json() : null;
    const e = Array.isArray(liste) ? liste.find((c) => c?.countryCode === pays) : null;
    if (e && Number.isFinite(e.geoLat) && Number.isFinite(e.geoLng)) return { address: e.address, countryCode: e.countryCode, geoLat: e.geoLat, geoLng: e.geoLng };
  } catch { /* fichier injoignable : repli */ }
  return pays === "FR" ? { ...DEPOP_LIEU_FR } : null;
}

function depopNormaliser(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
const DEPOP_SANS_MARQUE_MOTS = new Set(["", "sansmarque", "aucunemarque", "aucune", "nobrand", "unbranded", "other", "autre", "autresansmarque", "nonmarque", "generique"]);

// ═══════════════════════════════════════════════════════════════════════════
// 4. LES QUESTIONS (format du socle needs_user, cf. markNeedsUser)
// ═══════════════════════════════════════════════════════════════════════════
function depopQuestion(field_key, field_label, { allowed_values = null, input_type = "selection_only", explication = null } = {}) {
  return {
    field_key, field_label,
    ...(allowed_values ? { allowed_values, options_completes: true } : {}),
    input_type,
    ...(explication ? { explication } : {}),
    target: { root: null, key: field_key },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. LE PRÉ-VOL — PUR (testé par scripts/depop-connecteur-selftest.mjs)
// ═══════════════════════════════════════════════════════════════════════════
// Rend { ok: true, ... } ou { ok: false, motif, error, question?, definitif? }.
// Rien n'est créé chez Depop tant que ce pré-vol ne rend pas ok.
function depopCompterHashtags(texte) { return (String(texte ?? "").match(/#[a-zA-Z0-9_]+/g) ?? []).length; }
function depopPrevol(job) {
  const pf = job?.platform_fields ?? {};
  const description = String(job?.description ?? "").trim();
  if (!description) return { ok: false, motif: "description_vide", error: "Depop exige une description : la fiche n'en a pas." };
  if (description.length > DEPOP_DESCRIPTION_MAX) return { ok: false, motif: "description_trop_longue", error: `Description trop longue pour Depop (${description.length} caractères, 1 000 au plus).` };
  if (depopCompterHashtags(description) > DEPOP_HASHTAGS_MAX) return { ok: false, motif: "hashtags", error: `Trop de hashtags pour Depop (${depopCompterHashtags(description)}, 5 au plus).` };
  const photos = Array.isArray(job?.photos) ? job.photos.map((p) => (typeof p === "string" ? p : p?.url)).filter(Boolean) : [];
  if (!photos.length) return { ok: false, motif: "sans_photo", error: "Depop exige au moins une photo : la fiche n'en a pas." };
  const prix = Number(job?.price);
  if (!Number.isFinite(prix) || prix < 1) return { ok: false, motif: "prix", error: "Depop exige un prix d'au moins 1 €." };
  const chemin = Array.isArray(pf.depopCategoryPath) ? pf.depopCategoryPath.map(String) : [];
  if (chemin.length !== 3 || chemin.some((x) => !/^[a-z0-9-]+$/.test(x))) {
    return { ok: false, motif: "categorie", error: "Rayon Depop absent du job : il se choisit dans l'app avant le dépôt." };
  }
  const [dep, , type] = chemin;
  let etat = String(pf.depopEtat ?? "").trim();
  if (!DEPOP_ETATS.includes(etat) && DEPOP_ETAT_PAR_LIBELLE[etat]) etat = DEPOP_ETAT_PAR_LIBELLE[etat];
  if (!DEPOP_ETATS.includes(etat)) {
    return { ok: false, motif: "etat", error: "Depop exige l'état de l'article.", question: depopQuestion("depopEtat", "État (Depop)", { allowed_values: Object.keys(DEPOP_ETAT_PAR_LIBELLE) }) };
  }
  if (DEPOP_BEAUTE_NEUF_SEULEMENT.includes(type) && etat !== "brand_new") {
    return { ok: false, motif: "beaute_neuf_seulement", definitif: true,
      error: "Depop n'accepte que des produits de beauté NEUFS (« Nouveau ») : l'état de la fiche ne l'est pas. Si l'article est neuf, corrige son état sur la fiche ; sinon il ne peut pas partir sur Depop." };
  }
  let genre = null;
  if (dep === "menswear") genre = "male";
  else if (dep === "womenswear") genre = "female";
  else if (dep === "kidswear") {
    const g = String(pf.depopGenre ?? "").trim();
    genre = ["male", "female", "unisex"].includes(g) ? g : (DEPOP_GENRE_PAR_LIBELLE[g] ?? null);
    if (!genre) return { ok: false, motif: "genre_enfant", error: "Depop exige le genre d'un article enfant.", question: depopQuestion("depopGenre", "Pour (Depop, enfants)", { allowed_values: Object.keys(DEPOP_GENRE_PAR_LIBELLE) }) };
  }
  const portBrut = pf.depopPort;
  const port = portBrut === "" || portBrut == null ? NaN : Number(String(portBrut).replace(",", "."));
  if (!Number.isFinite(port) || port < 0 || port >= DEPOP_PORT_MAX) {
    return { ok: false, motif: "port", error: "Depop exige des frais de port (envoi en France, montant libre, moins de 100 €).",
      question: depopQuestion("depopPort", "Frais de port Depop (€)", { input_type: "number", explication: "Le prix que l'acheteur paie pour l'envoi en France. Depop ne calcule rien : tu expédies comme tu veux, avec suivi." }) };
  }
  const quantite = Math.max(1, Math.round(Number(pf.depopQuantite ?? pf.quantite ?? 1)) || 1);
  return { ok: true, description, photos: photos.slice(0, DEPOP_PHOTOS_MAX), photosEcartees: Math.max(0, photos.length - DEPOP_PHOTOS_MAX),
    prix: Math.round(prix * 100) / 100, chemin, etat, genre, port: Math.round(port * 100) / 100, quantite,
    couleurs: (Array.isArray(pf.depopCouleurs) ? pf.depopCouleurs : []).map(String).filter((c) => Object.prototype.hasOwnProperty.call(DEPOP_COULEUR_LIBELLE, c)).slice(0, 2) };
}

// La marque : l'absence part en « Other » (`unbranded`) — c'est l'option du
// formulaire de Depop. Une vraie marque se cherche dans la liste Depop
// (21 752 marques) ; introuvable ou ambiguë → question, jamais `unbranded`.
function depopResoudreMarque(pf, referentiel) {
  const choisie = String(pf.depopMarque ?? "").trim();
  const brute = choisie || String(pf.marque ?? "").trim();
  const cle = depopNormaliser(brute);
  if (DEPOP_SANS_MARQUE_MOTS.has(cle)) return { id: "unbranded", nom: "Other" };
  if (referentiel.ambigues.has(cle)) {
    return { question: depopQuestion("depopMarque", "Marque (Depop)", { input_type: "text",
      explication: `Plusieurs marques Depop s'écrivent « ${brute} » : écris-la exactement comme sur Depop, ou « Autre » si l'article n'a pas de marque.` }) };
  }
  const trouvee = referentiel.marques.get(cle);
  if (trouvee) return trouvee;
  return { question: depopQuestion("depopMarque", "Marque (Depop)", { input_type: "text",
    explication: `« ${brute} » n'est pas dans la liste des marques de Depop. Écris la marque comme Depop l'écrit, ou « Autre » si l'article n'a pas de marque.` }) };
}

// La taille : la grille EXACTE de la feuille, dans la région du compte. La
// traduction passe par le moteur commun (taillesVocabulaire.tailleDansGrille :
// depop-tailles.js, copie à l'octet de la règle ACTUELLE de _shared/tailles.js)
// — « EU 42 » → « EUR 42 », « 12 ans » → « 12 years », « Taille unique » →
// « One size » — jamais une conversion. « Other » ne se choisit jamais seul.
// Hors grille → question avec les tailles de la grille.
function depopResoudreTaille(pf, chemin, region, grilles) {
  const e = grilles.feuilles.get(chemin.join("/"));
  if (!e) return { refus: "feuille_inconnue" };
  const idGrille = e.size_set_by_region?.[region] ?? null;
  if (!idGrille) return { sansGrille: true };
  const grille = grilles.grilles.get(idGrille);
  if (!grille || !Array.isArray(grille.sizes) || !grille.sizes.length) return { refus: "grille_illisible" };
  const libelles = grille.sizes.map((s) => String(s?.name_i18n?.en ?? s?.name_i18n?.fr ?? "").trim());
  const question = () => ({ question: depopQuestion("depopTaille", "Taille (Depop)", { allowed_values: [...new Set(libelles.filter(Boolean))] }) });
  const brute = String(pf.depopTaille ?? pf.taille ?? "").trim();
  if (!brute) return question();
  const exacte = libelles.indexOf(brute);
  const tv = globalThis.taillesVocabulaire;
  const trouvee = exacte >= 0 ? { valeur: brute } : (tv?.tailleDansGrille ? tv.tailleDansGrille(brute, libelles) : null);
  if (!trouvee) return question();
  const s = grille.sizes[libelles.indexOf(trouvee.valeur)];
  if (!s) return question();
  return { idGrille, idTaille: s.id, libelle: trouvee.valeur };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. LES PHOTOS
// ═══════════════════════════════════════════════════════════════════════════
// Lecture : 1 essai + 5 reprises (barème des connecteurs en service, ≈ 36 s) —
// une passerelle qui hoquette ne coûte jamais le job. Clé de cache neuve à
// chaque reprise. Rien n'est encore créé chez Depop à ce stade.
const DEPOP_PHOTO_REPRISES_MS = [3000, 5000, 8000, 10000, 10000];
async function depopLirePhoto(url, indice) {
  let reponse = null; let exception = null;
  for (let essai = 0; essai <= DEPOP_PHOTO_REPRISES_MS.length; essai++) {
    if (essai > 0) await depopAttendre(DEPOP_PHOTO_REPRISES_MS[essai - 1]);
    const cible = essai === 0 ? url : `${url}${url.includes("?") ? "&" : "?"}r=${Date.now()}_${essai}`;
    try { exception = null; reponse = await fetch(cible, { credentials: "omit" }); }
    catch (e) { exception = e; reponse = null; }
    if (reponse && reponse.ok) return reponse;
    depopTracer(`photo ${indice + 1} : lecture ${essai + 1} en échec (${reponse ? `HTTP ${reponse.status}` : String(exception?.message ?? exception)})`);
  }
  throw new Error(`photo ${indice + 1} illisible après ${DEPOP_PHOTO_REPRISES_MS.length + 1} lectures`);
}
// JPEG, côté long ≤ 1 280 px, proportions GARDÉES (mesuré le 09/10 : une image
// 960×1280 est acceptée et validée par Depop, `is_square: false`) — on ne
// rogne jamais l'article.
async function depopPreparerImage(blob) {
  const bitmap = await createImageBitmap(blob);
  const echelle = Math.min(1, DEPOP_PHOTO_COTE_MAX / Math.max(bitmap.width, bitmap.height));
  const largeur = Math.max(1, Math.round(bitmap.width * echelle));
  const hauteur = Math.max(1, Math.round(bitmap.height * echelle));
  const canvas = document.createElement("canvas");
  canvas.width = largeur; canvas.height = hauteur;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, largeur, hauteur); // transparence PNG → fond blanc
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
  bitmap.close?.();
  const jpeg = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!jpeg) throw new Error("conversion JPEG impossible");
  return { jpeg, largeur, hauteur };
}
async function depopMonterPhoto(url, indice) {
  const source = await depopLirePhoto(url, indice);
  const { jpeg, largeur, hauteur } = await depopPreparerImage(await source.blob());
  const p = await depopJson(DEPOP_ENDPOINTS.photo, { methode: "POST", corps: { type: "product", extension: "jpg", dimensions: { width: largeur, height: hauteur } } });
  if (p.statut === 401) { const err = new Error(DEPOP_MSG_SESSION); err.sessionDepop = true; throw err; }
  if (!p.ok || !p.corps?.url || !p.corps?.id) throw new Error(`présignature refusée pour la photo ${indice + 1} (HTTP ${p.statut || p.erreurReseau})`);
  const envoi = await fetch(p.corps.url, { method: "PUT", body: jpeg, headers: { "Content-Type": "image/jpeg" } });
  if (!envoi.ok) throw new Error(`envoi de la photo ${indice + 1} refusé (HTTP ${envoi.status})`);
  depopTracer(`photo ${indice + 1} : ${largeur}×${hauteur}, id ${p.corps.id}`);
  return p.corps.id;
}
// La validation se relit jusqu'à « complete » (mesuré : « in_progress » puis
// « complete » en ~2 s). Une photo absente de valid_picture_ids n'entre pas.
async function depopValiderPhotos(ids) {
  for (let essai = 0; essai < 15; essai++) {
    await depopAttendre(essai === 0 ? 800 : 1500);
    const v = await depopJson(DEPOP_ENDPOINTS.photoValider, { methode: "POST", corps: { picture_ids: ids } });
    if (v.statut === 401) { const err = new Error(DEPOP_MSG_SESSION); err.sessionDepop = true; throw err; }
    if (v.ok && v.corps?.status === "complete") {
      const valides = new Set((v.corps.valid_picture_ids ?? []).map(Number));
      const refusees = ids.filter((id) => !valides.has(Number(id)));
      if (refusees.length) throw new Error(`Depop a refusé ${refusees.length} photo(s) à la validation`);
      return true;
    }
  }
  throw new Error("validation des photos Depop non terminée après ~20 s");
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. LA PUBLICATION
// ═══════════════════════════════════════════════════════════════════════════
function depopUuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function fillListingForm(job) {
  if (!DEPOP_ACTIF) return { success: false, error: "Depop n'est pas activé." };
  const t0 = Date.now();
  const pf = job?.platform_fields ?? {};
  try {
    depopEtape("session");
    const session = await depopSession();
    if (session.connecte === false) return depopSortie({ success: false, needsUser: true, error: DEPOP_MSG_SESSION, sessionPage: "morte", t0 });
    if (session.connecte !== true) return depopSortie({ success: false, reprise: true, error: `Session Depop illisible (${session.motif}) : rien n'a été envoyé, nouvel essai plus tard.`, t0 });
    if (!DEPOP_PAYS_EURO.has(session.pays)) {
      return depopSortie({ success: false, needsUser: true, attenteUtilisateur: true, attenteMotif: "depop_hors_zone_euro",
        error: `Ton compte Depop est rattaché à un pays hors de la zone euro (${session.pays ?? "inconnu"}) : FillSell ne publie sur Depop qu'en euros.`, t0 });
    }
    const vendeur = await depopStatutVendeur();
    if (vendeur.session === false) return depopSortie({ success: false, needsUser: true, error: DEPOP_MSG_SESSION, sessionPage: "morte", t0 });
    if (vendeur.canSell === false) {
      return depopSortie({ success: false, needsUser: true, attenteUtilisateur: true, attenteMotif: "depop_vendeur_a_configurer", error: DEPOP_MSG_VENDEUR, t0 });
    }

    depopEtape("prevol");
    const v = depopPrevol(job);
    if (!v.ok) {
      depopTracer(`pré-vol : ${v.motif}`);
      if (v.question) return depopSortie({ success: false, needsUser: true, motif_prevol: v.motif, error: v.error, needsUserField: v.question, t0 });
      return depopSortie({ success: false, needsUser: true, attenteUtilisateur: true, attenteMotif: `depop_${v.motif}`, motif_prevol: v.motif, error: v.error, t0 });
    }

    depopEtape("referentiels");
    const [referentiel, grilles] = await Promise.all([depopAttributs(), depopGrilles()]);
    const marque = depopResoudreMarque(pf, referentiel);
    if (marque.question) return depopSortie({ success: false, needsUser: true, motif_prevol: "marque", error: marque.question.explication, needsUserField: marque.question, t0 });
    const taille = depopResoudreTaille(pf, v.chemin, depopRegion(session.pays), grilles);
    if (taille.refus) {
      return depopSortie({ success: false, needsUser: true, attenteUtilisateur: true, attenteMotif: "depop_rayon_inconnu",
        error: `Le rayon Depop du job (${v.chemin.join(" › ")}) n'existe pas chez Depop : choisis-le à nouveau dans l'app.`, t0 });
    }
    if (taille.question) return depopSortie({ success: false, needsUser: true, motif_prevol: "taille", error: "Depop exige une taille de SA grille pour ce rayon.", needsUserField: taille.question, t0 });
    const lieu = await depopLieu(session.pays);
    if (!lieu) {
      return depopSortie({ success: false, needsUser: true, attenteUtilisateur: true, attenteMotif: "depop_lieu",
        error: "Le pays de ton profil Depop n'a pas pu être lu : ouvre « Sell » une fois sur depop.com, puis relance.", t0 });
    }

    depopEtape("photos");
    const ids = [];
    for (let i = 0; i < v.photos.length; i++) ids.push(await depopMonterPhoto(v.photos[i], i));
    await depopValiderPhotos(ids);

    depopEtape("creation");
    const [, , type] = v.chemin;
    const corps = {
      address: lieu.address,
      attributes: {},
      brand: marque.id,
      colour: v.couleurs,
      condition: v.etat,
      country: lieu.countryCode,
      description: v.description,
      ...(v.genre ? { gender: v.genre } : {}),
      geo_position_lat: lieu.geoLat,
      geo_position_lng: lieu.geoLng,
      is_kids: v.chemin[0] === "kidswear",
      listing_lifecycle_id: depopUuid(),
      national_shipping_cost: String(v.port),
      picture_ids: ids,
      price_amount: String(v.prix),
      price_currency: "EUR",
      product_type: type,
      shipping_methods: [],
      ...(taille.sansGrille
        ? { variants: {}, quantity: v.quantite }
        : { variant_set: taille.idGrille, variants: { [String(taille.idTaille)]: v.quantite }, quantity: null }),
      persistent_id: depopUuid(),
    };
    const c = await depopJson(DEPOP_ENDPOINTS.creer, { methode: "POST", corps });
    depopTracer(`POST listing/products : HTTP ${c.statut || c.erreurReseau}`);
    if (c.statut === 401) return depopSortie({ success: false, needsUser: true, error: DEPOP_MSG_SESSION, sessionPage: "morte", t0 });
    if (c.statut === 0) {
      // Réponse perdue : l'annonce a PU être créée. On ne redépose pas à
      // l'aveugle (doublon) : le background vérifie la boutique avant toute
      // nouvelle tentative (verifier_doublon_avant_publication).
      return depopSortie({ success: false, depotPeutEtreParti: true, reprise: true,
        error: `Réponse de Depop perdue pendant la création (${c.erreurReseau}) : l'annonce est peut-être en ligne, vérification avant tout nouvel envoi.`, t0 });
    }
    if (!c.ok || !c.corps?.id || !c.corps?.slug) {
      const detail = JSON.stringify(c.corps ?? c.texte ?? "").slice(0, 300);
      return depopSortie({ success: false, error: `Depop a refusé l'annonce (HTTP ${c.statut}) : ${detail}`, reponse: detail, http: c.statut, t0 });
    }

    // La RÉPONSE de Depop prouve la création (règle 3 de l'extension). On relit
    // quand même la fiche : son statut part dans la trace.
    depopEtape("verification");
    await depopAttendre(DEPOP_PAUSE_MS);
    const lu = await depopJson(DEPOP_ENDPOINTS.produit(c.corps.id), { authentifie: false });
    depopTracer(`relecture : HTTP ${lu.statut} ${lu.corps?.status ?? ""}`);
    const warnings = [];
    if (v.photosEcartees) warnings.push({ code: "depop_photos_plafond", message: `Depop accepte 8 photos au plus : ${v.photosEcartees} photo(s) de la fiche ne sont pas parties.` });
    return depopSortie({
      success: true,
      listingUrl: depopUrlPublique(c.corps.slug),
      platformListingId: String(c.corps.slug),
      depopProductId: Number(c.corps.id),
      depopStatut: lu.corps?.status ?? null,
      ...(warnings.length ? { warnings } : {}),
      t0,
    });
  } catch (e) {
    const msg = String(e?.message ?? e);
    depopTracer(`exception : ${msg}`);
    if (e?.sessionDepop) return depopSortie({ success: false, needsUser: true, error: DEPOP_MSG_SESSION, sessionPage: "morte", t0 });
    return depopSortie({ success: false, reprise: true, error: `Depop : ${msg}`, t0 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. LE RETRAIT — DELETE, ET LE 404 COMME SEULE PREUVE
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ Le 204 n'est pas la preuve : la fiche relue en 404 l'est. Une annonce déjà
//    absente avant notre geste est un retrait RÉUSSI (aucun DELETE envoyé).
// ⛔ JAMAIS par titre, et JAMAIS l'annonce d'un autre vendeur : l'identifiant
//    vient du job (slug, numéro), et la fiche doit appartenir au compte connecté.
async function depopIdentifiants(job) {
  const pf = job?.platform_fields ?? {};
  const slug = String(job?.platform_listing_id ?? "").trim() || depopSlugDepuisUrl(job?.listing_url);
  let id = Number(pf.depop_product_id) || null;
  if (!id && slug) {
    const r = await depopJson(DEPOP_ENDPOINTS.produitParSlug(slug), { authentifie: false });
    if (r.statut === 404) return { slug, id: null, absente: true };
    if (r.ok && r.corps?.id) id = Number(r.corps.id);
    else return { slug, id: null, illisible: r.erreurReseau ?? `http_${r.statut}` };
  }
  return { slug, id };
}
async function deleteListing(job) {
  if (!DEPOP_ACTIF) return { success: false, error: "Depop n'est pas activé." };
  const t0 = Date.now();
  try {
    depopEtape("cible");
    const cible = await depopIdentifiants(job);
    if (cible.absente) { depopTracer(`cible ${cible.slug} : 404 — déjà absente, aucun DELETE`); return depopSortie({ success: true, deja_absente: true, t0 }); }
    if (cible.illisible) return depopSortie({ success: false, reprise: true, error: `Annonce Depop illisible avant retrait (${cible.illisible}) : rien n'a été touché, reprise au prochain passage.`, t0 });
    if (!cible.id) {
      return depopSortie({ success: false, needsUser: true,
        error: "Retrait Depop impossible : aucun identifiant d'annonce sur ce job. Retire l'annonce à la main sur depop.com.", t0 });
    }
    depopTracer(`cible : ${cible.slug ?? "?"} (${cible.id})`);
    const session = await depopSession();
    if (session.connecte === false) return depopSortie({ success: false, needsUser: true, error: DEPOP_MSG_SESSION_RETRAIT, sessionPage: "morte", t0 });
    if (session.connecte !== true) return depopSortie({ success: false, reprise: true, error: `Session Depop illisible (${session.motif}) : rien n'a été touché.`, t0 });

    depopEtape("etat_avant");
    const avant = await depopJson(DEPOP_ENDPOINTS.produit(cible.id), { authentifie: false });
    if (avant.statut === 404) { depopTracer("etat_avant : 404 — déjà absente, aucun DELETE"); return depopSortie({ success: true, deja_absente: true, t0 }); }
    if (!avant.ok || !avant.corps) return depopSortie({ success: false, reprise: true, error: `État de l'annonce Depop illisible avant retrait (HTTP ${avant.statut || avant.erreurReseau}) — rien n'a été touché.`, t0 });
    if (Number(avant.corps.user_id) !== Number(session.id)) {
      return depopSortie({ success: false, needsUser: true, attenteUtilisateur: true, attenteMotif: "depop_annonce_d_un_autre_compte",
        error: "Cette annonce Depop n'appartient pas au compte Depop connecté sur ton ordinateur : rien n'a été touché. Connecte-toi au bon compte Depop, puis relance.", t0 });
    }
    if (avant.corps.status === "STATUS_PURCHASED") {
      depopTracer("etat_avant : STATUS_PURCHASED — vendue, aucun DELETE");
      return depopSortie({ success: true, deja_absente: true, vendue: true, t0 });
    }

    depopEtape("suppression");
    const sup = await depopJson(DEPOP_ENDPOINTS.produit(cible.id), { methode: "DELETE" });
    depopTracer(`DELETE : HTTP ${sup.statut || sup.erreurReseau}`);
    if (sup.statut === 401) return depopSortie({ success: false, needsUser: true, error: DEPOP_MSG_SESSION_RETRAIT, sessionPage: "morte", t0 });

    depopEtape("verification");
    await depopAttendre(DEPOP_PAUSE_MS);
    const apres = await depopJson(DEPOP_ENDPOINTS.produit(cible.id), { authentifie: false });
    depopTracer(`vérification : HTTP ${apres.statut || apres.erreurReseau}`);
    if (apres.statut === 404) return depopSortie({ success: true, t0, suppressionEnvoyee: true });
    return depopSortie({ success: false, reprise: true, suppressionEnvoyee: sup.statut >= 200 && sup.statut < 300,
      error: `Retrait Depop NON confirmé : après DELETE (HTTP ${sup.statut || sup.erreurReseau}), la fiche répond ${apres.statut || apres.erreurReseau}. Vérification au prochain passage.`, t0 });
  } catch (e) {
    depopTracer(`exception : ${String(e?.message ?? e)}`);
    return depopSortie({ success: false, reprise: true, error: `Depop : ${String(e?.message ?? e)}`, t0 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. LE RELEVÉ DE LA BOUTIQUE, LA FICHE, L'ÉTAT, LES VENTES
// ═══════════════════════════════════════════════════════════════════════════
const depopPremiereLigne = (texte) => String(texte ?? "").split(/\r?\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 120) ?? null;
function depopPhotoUrl(pic) {
  const f = pic?.formats ?? {};
  return f.P0?.url ?? f.P8?.url ?? f.P7?.url ?? f.P1?.url ?? Object.values(f)[0]?.url ?? null;
}
function depopPrixAnnonce(o) {
  const v = Number(o?.pricing?.current_price?.price_breakdown?.price?.amount ?? o?.price_amount ?? NaN);
  return Number.isFinite(v) ? v : null;
}
async function depopParcourir(fabriqueChemin, vendeur, statut) {
  const sortie = [];
  let apres = null;
  let complet = true;
  for (let page = 0; page < DEPOP_PAGES_MAX; page++) {
    if (page > 0) await depopAttendre(DEPOP_PAUSE_MS);
    const r = await depopJson(fabriqueChemin(vendeur, apres), { authentifie: false });
    if (!r.ok || !Array.isArray(r.corps?.objects)) return { objets: sortie, complet: false, erreur: `HTTP ${r.statut || r.erreurReseau}` };
    for (const o of r.corps.objects) if (o?.slug) sortie.push({ o, statut });
    apres = r.corps.page_info?.has_more ? (r.corps.page_info.last ?? null) : null;
    if (!apres) break;
    if (page === DEPOP_PAGES_MAX - 1) complet = false;
  }
  return { objets: sortie, complet };
}
async function listerMesArticles() {
  const session = await depopSession();
  if (session.connecte === false) return { success: false, needsUser: true, error: "Connexion Depop requise : connecte-toi à Depop sur ton ordinateur." };
  if (session.connecte !== true) return { success: false, error: `session Depop illisible (${session.motif})` };
  const enVente = await depopParcourir(DEPOP_ENDPOINTS.enVente, session.id, "en_ligne");
  const articles = enVente.objets.map(({ o, statut }) => ({
    listing_id: String(o.slug),
    url: depopUrlPublique(o.slug),
    titre: depopPremiereLigne(o.description),
    prix: depopPrixAnnonce(o),
    statut,
    photo_url: depopPhotoUrl(Array.isArray(o.pictures) ? o.pictures[0] : null),
    quantite: Number.isFinite(Number(o.listed_quantity)) ? Number(o.listed_quantity) : null,
    depop_id: o.id,
  }));
  return { success: true, articles, complet: enVente.complet, boutique: { id: session.id, login: session.username }, ...(enVente.erreur ? { erreur: enVente.erreur } : {}) };
}
async function capturerArticle(slug) {
  if (!/^[A-Za-z0-9]+-[A-Za-z0-9-]*[A-Za-z0-9]$/.test(String(slug ?? ""))) return { success: false, error: "identifiant Depop inattendu" };
  const r = await depopJson(DEPOP_ENDPOINTS.produitParSlug(slug), { authentifie: false });
  if (!r.ok || !r.corps) return { success: false, error: `fiche Depop illisible (HTTP ${r.statut || r.erreurReseau})` };
  const a = r.corps;
  const at = a.attributes ?? {};
  const couleurs = (Array.isArray(at.colour) ? at.colour : []).map((c) => DEPOP_COULEUR_LIBELLE[c]).filter(Boolean);
  const variante = Array.isArray(a.variants_all) ? a.variants_all.find((x) => x?.variant) : null;
  return {
    success: true,
    capture: {
      photos: (Array.isArray(a.pictures) ? a.pictures : []).map(depopPhotoUrl).filter(Boolean),
      description: typeof a.description === "string" && a.description.trim() ? a.description.trim() : null,
      marque: at.brand && at.brand !== "unbranded" ? (a.brand_name ?? at.brand) : null,
      taille: variante?.variant ?? null,
      etat: at.condition ? (DEPOP_LIBELLE_PAR_ETAT[at.condition] ?? null) : null,
      couleur: couleurs.length ? couleurs.join(", ") : null,
      // La catégorie par IDENTIFIANTS, jamais par libellé (cf. RATTACHEMENT.md) :
      // « <groupe>/<type> », que le serveur et l'app rattachent par la table
      // DEPOP_TYPE_VERS_INTERNE.
      categorie: at.group && at.product_type ? `${at.group}/${at.product_type}` : null,
      genre: at.is_kids === true ? "enfant" : at.gender === "female" ? "Femme" : at.gender === "male" ? "Homme" : null,
      quantite: Number.isFinite(Number(a.listed_quantity)) ? Number(a.listed_quantity) : null,
      depop_id: a.id ?? null,
      depop_statut: a.status ?? null,
      source: "api",
    },
  };
}
// L'état d'UNE annonce, sur son identifiant exact (lecture publique).
async function lireEtatAnnonceDepop(slug) {
  if (!slug) return { erreur: "slug_absent" };
  const r = await depopJson(DEPOP_ENDPOINTS.produitParSlug(slug), { authentifie: false });
  if (r.statut === 0) return { erreur: r.erreurReseau ?? "reseau" };
  return { status: r.statut, etat: r.corps?.status ?? null, id: r.corps?.id ?? null, slug: r.corps?.slug ?? null, prix: depopPrixAnnonce(r.corps), user_id: r.corps?.user_id ?? null };
}
// Les VENTES : les annonces passées STATUS_PURCHASED dans la boutique du compte
// connecté. ⚠️ Depop ne rend pas de date de vente sur ces fiches : `vendu_le`
// est la date de dernière modification de l'annonce vendue (son passage en
// STATUS_PURCHASED), approximation dite comme telle.
async function lireVentesDepop() {
  const session = await depopSession();
  if (session.connecte === false) return { ok: false, motif: "session" };
  if (session.connecte !== true) return { ok: false, motif: `session_illisible_${session.motif}` };
  const vendues = await depopParcourir(DEPOP_ENDPOINTS.vendues, session.id, "vendue");
  const rows = vendues.objets.map(({ o }) => ({
    ref: String(o.id),
    titre: depopPremiereLigne(o.description),
    prix: depopPrixAnnonce(o),
    devise: o.pricing?.currency ?? "EUR",
    vendu_le: o.updated_at ?? null,
    statut: String(o.status ?? ""),
    listing_id: String(o.slug),
    url: depopUrlPublique(o.slug),
    frais: null,
    lot: false,
  }));
  return { ok: vendues.complet, rows, pages: null, motif: vendues.erreur ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. TRACE, ÉTAPE, POINT DE SORTIE UNIQUE
// ═══════════════════════════════════════════════════════════════════════════
let depopEtapeCourante = null;
function depopEtape(nom) {
  depopEtapeCourante = String(nom ?? "");
  try { chrome.runtime?.sendMessage?.({ type: "FILLSELL_FILL_STEP", step: nom })?.catch?.(() => {}); } catch { /* extension rechargée */ }
}
const depopTrace = [];
function depopTracer(quoi) { depopTrace.push(`${new Date().toISOString()} ${quoi}`); }
function depopSortie(resultat) {
  const { t0, ...reste } = resultat;
  return { ...reste, diagnostic: depopTrace.slice(-30).join(" | "), etape: depopEtapeCourante, duree_ms: t0 ? Date.now() - t0 : null };
}

// ── Écouteur ────────────────────────────────────────────────────────────────
// Garde d'écouteur unique : deux injections ne répondent jamais deux fois.
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage && !globalThis.__fillsellDepopEcouteur) {
  globalThis.__fillsellDepopEcouteur = true;
  const repondre = (promesse, sendResponse) => {
    promesse
      .then((r) => sendResponse({ ...r, trace: [...depopTrace], fill_step: depopEtapeCourante }))
      .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err), trace: [...depopTrace], fill_step: depopEtapeCourante }));
    return true;
  };
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "DEPOP_PING" || msg?.type === "FILLSELL_PING") {
      sendResponse({ success: true, pong: true, actif: DEPOP_ACTIF, plateforme: "depop" });
      return true;
    }
    if (msg?.type === "DEPOP_SESSION") return repondre(depopSession().then(async (s) => (s.connecte === true ? { ...s, vendeur: await depopStatutVendeur() } : s)), sendResponse);
    if (msg?.type === "DEPOP_LISTE_ARTICLES") return repondre(listerMesArticles(), sendResponse);
    if (msg?.type === "DEPOP_CAPTURE_ARTICLE") return repondre(capturerArticle(String(msg.listingId ?? "")), sendResponse);
    if (msg?.type === "DEPOP_ETAT_ANNONCE") return repondre(lireEtatAnnonceDepop(String(msg.slug ?? "")), sendResponse);
    if (msg?.type === "DEPOP_VENTES") return repondre(lireVentesDepop(), sendResponse);
    if (msg?.type === "DELETE_LISTING" || msg?.type === "FILL_LISTING") {
      depopEtapeCourante = null;
      depopTrace.length = 0;
      return repondre(msg.type === "DELETE_LISTING" ? deleteListing(msg.job) : fillListingForm(msg.job), sendResponse);
    }
    return undefined;
  });
}
