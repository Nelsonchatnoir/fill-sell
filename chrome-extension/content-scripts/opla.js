// ═══════════════════════════════════════════════════════════════════════════
// OPLA — SQUELETTE DE CONNECTEUR
// phase 0 (2026-09-14) + LOT 1 (cycle complet observé le même soir)
// ═══════════════════════════════════════════════════════════════════════════
//
// ── ALLUMÉ LE 16/09 (décision Nico), DERRIÈRE UNE PERMISSION OPTIONNELLE ────
//   · OPLA_ACTIF = true → les entrées font le vrai travail (API depuis la page).
//   · Ce fichier n'est injecté NULLE PART par le manifest : opla.co est en
//     `optional_host_permissions`, et les trois scripts Opla sont enregistrés
//     par le background (chrome.scripting.registerContentScripts) SEULEMENT
//     après que la personne a cliqué « Autoriser Opla » dans le popup. Sans ce
//     clic, le parc n'a ni l'hôte, ni ce code en page — c'est ça,
//     l'interrupteur, pas le drapeau ci-dessous.
//   · OPLA_ACTIF = false reste possible (coupe-circuit) : toute entrée répond
//     alors un refus net, sans toucher la page (scripts/opla-inerte-selftest.mjs
//     le prouve sur une copie du fichier au drapeau forcé).
//
// EMPLACEMENT (2026-09-16, câblage) : `chrome-extension/content-scripts/`, comme
// les quatre connecteurs en service. Le squelette a vécu dans `handlers/` du
// 14/09 au 16/09, à dessein non branché ; `handlers/` n'existe plus.
//
// ⚠️ CE QUI EST ÉCRIT ICI EST CE QUI A ÉTÉ OBSERVÉ, ET RIEN D'AUTRE.
// Relevé complet : docs/OPLA_RELEVE.md (§ 15 = lot 1) + docs/OPLA_MAPPING.md
//
// ── CONTRAT : L'UNION DES QUATRE (décision Nico, 2026-09-14) ────────────────
// Les 4 connecteurs divergent ; Opla prend l'union, parce que chacun de ces
// mécanismes a été ajouté après un incident où le diagnostic manquait, et
// qu'on ne démarre pas une 5e plateforme plus aveugle que les autres :
//   · relais d'étape FILLSELL_FILL_STEP        (leboncoin, ebay)
//   · relais de sonde réseau FILLSELL_PROBE_*  (vinted, leboncoin, ebay)
//   · garde « un seul écouteur »               (vinted)
//   · trace jointe au POINT DE SORTIE UNIQUE   (ebay) — sur TOUTES les issues,
//     réussites comprises : sans les réussites on ne mesure pas une couverture,
//     on compte des plaintes.
// ═══════════════════════════════════════════════════════════════════════════

/* eslint-disable no-unused-vars */
/* global chrome */

const OPLA_ACTIF = true; // Levé le 16/09 (GO Nico, permission optionnelle) — levé puis rééteint le 15/09 après le lot 6 (dépôt réel fait, annonce retirée). L'accès réel reste conditionné au clic « Autoriser Opla » (cf. en-tête).

// ═══════════════════════════════════════════════════════════════════════════
// 1. L'API — ET POURQUOI ELLE DOIT PARTIR D'ICI, JAMAIS DU SERVICE WORKER
// ═══════════════════════════════════════════════════════════════════════════
// MESURÉ : `curl` sur /api/public/config/articles rend 429 à l'instant où
// `fetch()` depuis la page rend 200. Ce n'est pas une limite d'IP, c'est un
// rejet des clients sans empreinte de navigateur. Un fetch du background MV3
// tomberait dans le même panier.
//   ⇒ TOUT appel API passe par ce content script, avec la session de la page.
const OPLA_API = "/api";

async function oplaJson(chemin, options = {}) {
  const r = await fetch(OPLA_API + chemin, {
    credentials: "include",
    headers: { "Accept-Language": "fr", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    ...options,
  });
  const texte = await r.text().catch(() => "");
  let corps = null;
  try { corps = texte ? JSON.parse(texte) : null; } catch { corps = texte; }
  return { statut: r.status, ok: r.ok, corps };
}

// Endpoints RELEVÉS — code HTTP constaté en session réelle (lot 1).
const OPLA_ENDPOINTS = {
  arbre: "/public/config/articles",                                   // 200 — 1014 nœuds, 886 feuilles
  paramsGlobaux: "/config/params?locale=fr",                          // 200 — listes fermées + drapeaux
  paramsCategorie: (c) => `/public/config/params?category=${encodeURIComponent(c)}`, // 200
  moi: "/public/me",                                                  // 200 — { user }
  mesArticles: "/public/me/articles?view=summary&limit=50",           // 200 — { articles, nextCursor }
  article: (id) => `/public/articles/${encodeURIComponent(id)}`,      // 200 / 404 si absent
  urlPhotoPresignee: "/public/images/upload-url",                     // 200 — POST → URL S3 présignée
  creer: "/public/me/articles",                                       // 201 — POST
  modifier: (id) => `/public/me/articles/${encodeURIComponent(id)}`,  // 200 — PATCH (PARTIEL)
  supprimer: (id) => `/public/me/articles/${encodeURIComponent(id)}`, // 204 — DELETE
};

// ⛔ PIÈGE : /api/config/articles (sans « public ») rend 404, alors que
// /api/config/params (sans « public ») rend 200. Le préfixe n'est PAS
// symétrique. Ne jamais le déduire de l'autre.

// ═══ L'URL PUBLIQUE D'UNE ANNONCE — /product/, JAMAIS /article/ ════════════
// ⛔⛔ CORRECTION B (lot 7). Ce fichier écrivait `/article/<id>`. MESURÉ le
// 15/09 sur l'annonce réelle art_4382c407fb47b15d0060b7ce00dfaa58, en ligne
// et approuvée à la seconde de la lecture :
//     /article/<id vrai>  → 404, <title>Page introuvable | Opla</title>, 8,6 Ko
//     /product/<id vrai>  → 200, <title>Sweat Tommy Jeans… | Opla</title>, 108 Ko
// Contrôle avec un id INVENTÉ, qui dit lequel des deux 404 signifie quoi :
//     /article/<id bidon> → 404   ⇒ la route /article/ N'EXISTE PAS
//     /product/<id bidon> → 200   ⇒ la route existe et rend une page pour tout
// Le dépôt réussissait donc et le lien enregistré était mort par construction.
// docs/OPLA_RELEVE.md § 9 avait raison depuis le début : c'est /product/.
//
// ⚠️⚠️ ET SURTOUT — CETTE URL N'EST PAS UN ORACLE, NULLE PART :
//   · elle rend 200 sur un identifiant inventé ;
//   · elle rend 200, page COMPLÈTE, sur une annonce SUPPRIMÉE — mesuré juste
//     après le DELETE du lot 6 : 108201 octets à l'octet près, en-têtes
//     `x-…-cache: STALE`, `age: 26`. Ni `cache:'no-store'` ni un paramètre
//     d'URL cassé ne la délogent (le cache ISR de Next.js ignore les query
//     params inconnus). La page publique SURVIT au retrait.
// Le seul oracle d'existence est GET /api/public/articles/<id> : 200 = là,
// 404 = plus là. Tout ce fichier s'y tient.
const oplaUrlPublique = (id) => `https://www.opla.co/product/${encodeURIComponent(id)}`;

// L'identifiant repart de l'URL qu'on a nous-mêmes écrite en base — c'est le
// seul endroit où il vit (get-pending-jobs ne sert pas platform_listing_id à
// l'extension). Les deux formes sont acceptées : `/article/` n'a jamais été
// une URL valide, mais un job écrit par un build antérieur à cette correction
// porterait ce lien mort, et son identifiant, lui, est bon — refuser
// l'extraction laisserait une annonce irretirable pour une faute qui est la
// nôtre. Le préfixe `art_` reste exigé : on ne ramasse pas n'importe quel
// segment d'URL.
function oplaIdDepuisUrl(url) {
  const m = String(url ?? "").match(/\/(?:product|article)\/(art_[^/?#\s]+)/i);
  return m ? m[1] : null;
}

// ── RELEVÉ DES ANNONCES DU VENDEUR (2026-09-17, sync multiplateforme lot 1) ──
// GET /public/me/articles?view=summary&limit=50 → { articles, nextCursor }
// (relevé lot 1, docs/OPLA_RELEVE.md § 15). Lecture seule, page par page,
// borné à 40 pages. Les champs d'un article « summary » n'ont pas été relevés
// un par un : on lit défensivement (id / title / price / moderationStatus /
// status / images) et on rend ce qu'on a — l'identifiant seul suffit au
// moteur de rattachement (par identifiant, puis par titre s'il est là).
async function listerMesArticles() {
  const articles = [];
  let cursor = null;
  let complet = true;
  for (let page = 0; page < 40; page++) {
    const chemin = OPLA_ENDPOINTS.mesArticles + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const r = await oplaJson(chemin);
    if (r.statut === 401 || r.statut === 403) return { success: false, error: `session Opla refusée (HTTP ${r.statut})`, needsUser: true };
    if (!r.ok || !r.corps || typeof r.corps !== "object") return { success: false, error: `liste Opla illisible (HTTP ${r.statut})` };
    const liste = Array.isArray(r.corps.articles) ? r.corps.articles : (Array.isArray(r.corps.items) ? r.corps.items : []);
    for (const a of liste) {
      const id = String(a?.id ?? a?.articleId ?? "").trim();
      if (!/^art_/.test(id)) continue;
      const titre = String(a?.title ?? a?.name ?? a?.titre ?? "").trim() || null;
      const prixBrut = a?.price ?? a?.prix ?? (Number.isFinite(Number(a?.priceCents)) ? Number(a.priceCents) / 100 : null);
      const prix = Number.isFinite(Number(prixBrut)) ? Number(prixBrut) : null;
      const mod = String(a?.moderationStatus ?? "").toLowerCase();
      const st = String(a?.status ?? a?.state ?? "").toLowerCase();
      const statut = /sold|vendu/.test(st) ? "vendue"
        : mod === "pending" ? "en_verification"
        : /reject|refus|inactive|disabled|archived/.test(st) || mod === "rejected" ? "desactivee"
        : (mod === "approved" || mod === "") ? "en_ligne" : "inconnu";
      // Vignette : l'API rend une CLÉ (« images/apple|… »), servie sur le
      // CloudFront (oplaUrlImage) — sans ça le relevé Opla n'avait pas de photo.
      // Vues / favoris : viewCount / favouriteCount, présents dans le résumé.
      const img = Array.isArray(a?.images) ? a.images[0] : (Array.isArray(a?.photos) ? a.photos[0] : null);
      const entier = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);
      articles.push({ listing_id: id, url: oplaUrlPublique(id), titre, prix, statut, photo_url: oplaUrlImage(img), vues: entier(a?.viewCount), favoris: entier(a?.favouriteCount) });
    }
    cursor = r.corps.nextCursor ?? r.corps.next_cursor ?? null;
    if (!cursor || !liste.length) break;
    if (page === 39) complet = false;
  }
  return { success: true, articles, complet };
}

// CAPTURE COMPLÈTE d'un article (relevé, 2026-09-17 soir) : la fiche publique
// par l'API — photos, description, marque, état, taille, couleurs, matières,
// chemin de catégorie, vues et favoris. Aucune écriture, aucun quota.
// ⚠️ `images` rend des CLÉS (« images/apple|000159.….2004/art_…/ima_….webp »),
//    pas des URL (relevé 18/09 00:20 sur art_9c05d05d…) : le site les sert sur
//    le CloudFront ci-dessous, chaque segment encodé (« | » → %7C) — vérifié
//    200 image/webp. Les codes d'état (« like-new ») sont rendus en libellé
//    (miroir de OPLA_ETAT_PAR_LIBELLE côté app).
const OPLA_CDN_IMAGES = "https://d2f61lx5s6m7uh.cloudfront.net/";
const OPLA_ETAT_LIBELLE = Object.freeze({
  "new-with-tags": "Neuf avec étiquette", "new": "Neuf sans étiquette", "like-new": "Très bon état", "good": "Bon état", "fair": "Satisfaisant",
});
function oplaUrlImage(i) {
  const v = typeof i === "string" ? i : (i?.url ?? i?.src ?? i?.key ?? null);
  if (!v) return null;
  if (/^https?:/.test(v)) return v;
  return OPLA_CDN_IMAGES + String(v).replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
}
async function capturerArticle(id) {
  if (!/^art_/.test(id)) return { success: false, error: "identifiant Opla inattendu" };
  const r = await oplaJson(OPLA_ENDPOINTS.article(id));
  if (!r.ok || !r.corps || typeof r.corps !== "object") return { success: false, error: `fiche Opla illisible (HTTP ${r.statut})` };
  const a = r.corps.article && typeof r.corps.article === "object" ? r.corps.article : r.corps;
  const images = (Array.isArray(a.images) ? a.images : (Array.isArray(a.imageUrls) ? a.imageUrls : []))
    .map(oplaUrlImage).filter(Boolean);
  const md = a.metadata && typeof a.metadata === "object" ? a.metadata : {};
  const liste = (v) => (Array.isArray(v) && v.length ? v.map(String).join(", ") : null);
  const entier = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    success: true,
    capture: {
      photos: images,
      description: typeof a.description === "string" && a.description.trim() ? a.description.trim() : null,
      marque: a.brand ?? null,
      taille: Array.isArray(md.sizes) ? (md.sizes[0] ?? null) : null,
      etat: a.condition ? (OPLA_ETAT_LIBELLE[String(a.condition)] ?? String(a.condition)) : null,
      couleur: liste(md.colors),
      matiere: liste(md.materials),
      categorie: Array.isArray(a.categoriesPath) ? a.categoriesPath.join(" > ") : (a.category ?? null),
      vues: entier(a.viewCount),
      favoris: entier(a.favouriteCount),
      source: "api",
    },
  };
}

// ⛔ Les bornes (prix max/min, titre, description, photos) NE SONT PAS
// redéclarées ici : elles vivent dans `content-scripts/opla-prevol.js`, qui est
// injecté dans le MÊME monde isolé que ce fichier. Les redéclarer en `const`
// lèverait une SyntaxError au chargement du content script — et
// scripts/content-scripts-selftest.mjs refuse déjà les noms déclarés deux fois
// dans un même monde. On les lit dans `OPLA_BORNES`.

// ═══════════════════════════════════════════════════════════════════════════
// 2. DÉTECTION D'ÉTAT — getComputedStyle + textContent, RIEN D'AUTRE
// ═══════════════════════════════════════════════════════════════════════════
// La fenêtre de travail est MINIMISÉE : getBoundingClientRect/getClientRects
// rendent des zéros, innerText rend du vide, les transitions ne se résolvent
// jamais. Tout ce fichier s'y tient, par construction.
// ⛔ L'opacité n'est JAMAIS un verdict.

const oplaTexte = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();

function oplaUtilisable(el) {
  if (!el) return false;
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden") return false;
  if (el.disabled === true || el.getAttribute("aria-disabled") === "true") return false;
  return true;
}
// ⛔ pointerEvents N'EST PAS testé élément par élément : sur Opla il est hérité
// d'un ancêtre et vaut « none » sur TOUT le formulaire quand le profil vendeur
// est incomplet. L'y mettre ferait déclarer « introuvable » des champs
// parfaitement présents (PRÉSENT ≠ BLOQUANT). Il est traité pour ce qu'il est :
// un verdict de PAGE, ci-dessous.

// ⛔⛔ LE PIÈGE (mesuré) : tant que le profil vendeur est incomplet, le
// formulaire est enveloppé dans <div class="pointer-events-none opacity-50">,
// et `element.click()` comme le setter natif TRAVERSENT pointer-events:none.
// On remplit un formulaire MORT sans la moindre erreur — le faux « published »
// de Leboncoin, en pire.
//   ⇒ Sur Opla, pointer-events:none sur un ANCÊTRE est un VERDICT. Le seul.
//     Il se lit par getComputedStyle : il vaut donc aussi en minimisé.
function oplaFormulaireDesactive() {
  let n = document.querySelector(OPLA_SEL.titre);
  let poseur = null;
  while (n && n !== document.body) {
    if (getComputedStyle(n).pointerEvents === "none") poseur = n; // on garde le PLUS HAUT
    n = n.parentElement;
  }
  return poseur; // non nul ⇒ formulaire désactivé ⇒ attenteUtilisateur
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. SÉLECTEURS — ET LEUR DETTE, DITE FRANCHEMENT
// ═══════════════════════════════════════════════════════════════════════════
// HORS #sell-photo-new et button[aria-label="Actions"], AUCUN contrôle ne porte
// d'id, de data-*, de name ni d'aria-label. Il ne reste que des classes
// utilitaires Tailwind (qui changent à chaque build) et le TEXTE VISIBLE (qui
// change à chaque traduction). C'est une dette assumée — et la première raison
// de passer par l'API plutôt que par le DOM.
const OPLA_SEL = {
  photos: "#sell-photo-new",                        // ✅ id stable
  titre: 'main input[maxlength="80"]',              // ✅ attribut stable
  description: "main textarea",
  prix: 'main input[inputmode="decimal"]',          // ✅ attribut stable
  blocErreur: "main div.bg-red-50",                 // sans role ni aria-live : textContent seul
  menuActions: 'button[aria-label="Actions"]',      // ✅ le seul aria-label du parcours
  retirerPhoto: "main button.absolute.right-1.top-1",
  // ⛔ `parLibelle` RETIRÉ le 2026-09-20 (passe 3, point 4-b), pour la même
  //    raison qu'oplaEstFacultatif : jamais lu une seule fois. Ces six
  //    expressions décrivaient les libellés du formulaire WEB d'Opla, que ce
  //    fichier n'ouvre jamais — il poste sur l'API. Un sélecteur qui ne sert
  //    à rien finit par faire croire qu'un chemin existe.
  // ⚠️ Modales = portails en fin de <body>, SANS role="dialog". Le z-index
  // CHANGE d'une modale à l'autre (z-50 / z-[60] / z-[110]) : ne JAMAIS cibler
  // par z-index. ⛔ #_r_3_-input est un id GÉNÉRÉ par React : jamais un sélecteur.
  modale: "div.fixed.inset-0",
};

// ⛔ CODE MORT RETIRÉ LE 2026-09-20 (passe 3, point 4-b) : `oplaEstFacultatif()`.
// Écrite le 15/09 pour repérer les champs « (optionnel) » du formulaire web
// d'Opla, elle n'a JAMAIS été appelée une seule fois — et elle ne POUVAIT pas
// l'être : cette plateforme ne se remplit pas par un formulaire, elle se POSTE
// sur une API (cf. § 1). C'est ce code mort, qui avait toutes les apparences
// du code vivant, qui a fait chercher un observateur DOM là où il n'y en a
// jamais eu — et retardé d'autant le point 3 (le catalogue Opla qui
// n'apprenait rien depuis le 16/09).
// Ce qu'Opla exige se lit dans /public/config/params, pas dans un libellé :
// c'est `oplaRelverAspects()`, plus bas.

// ═══════════════════════════════════════════════════════════════════════════
// 4. PRÉ-VOL — LA SEULE GARDE QUI EXISTE, ET ELLE VIT AILLEURS
// ═══════════════════════════════════════════════════════════════════════════
// Le pré-vol (catégorie feuille, taille dans LA BONNE grille, marque, prix,
// photos) est dans `content-scripts/opla-prevol.js`, déclaré AVANT ce fichier dans le
// manifest. Il y est pour une raison : il est PUR, donc testable, et
// `scripts/opla-prevol-selftest.mjs` le passe contre les cas qui nous ont
// réellement piégés (catégorie inexistante, nœud intermédiaire, taille de la
// mauvaise grille, code de taille partagé entre deux grilles, prix à 0,50 €,
// 21 photos) — 30 contrôles.
//
// ⛔ Ne PAS réimplémenter ces contrôles ici : deux sources de vérité, c'est la
//    garantie qu'une des deux dérivera, et c'est la seule protection qu'on ait
//    contre une annonce silencieusement morte.
//
// Il publie sur globalThis : `oplaPrevol(job, ref)`, `OPLA_PREVOL_MOTIFS`,
// `OPLA_ETATS`, `OPLA_BORNES`. Le référentiel `ref` se charge par l'API —
// c'est la seule partie non pure, et elle est ci-dessous.

/**
 * Charge le référentiel que le pré-vol attend, depuis l'API (source de vérité).
 * ⚠️ Non pur : fait des requêtes. À appeler depuis le content script, jamais
 * depuis le service worker (cf. § 1).
 */
async function oplaChargerReferentiel() {
  const arbre = await oplaJson(OPLA_ENDPOINTS.arbre);
  if (!arbre.ok) throw new Error(`Arbre Opla indisponible (HTTP ${arbre.statut})`);
  const noeuds = new Set();
  const feuilles = new Set();
  // ── LA PARENTÉ, relevée en même temps (2026-09-16) ────────────────────────
  // Elle ne coûte RIEN de plus (on parcourt déjà l'arbre) et c'est elle qui
  // permet de proposer LE NIVEAU QUI A ÉCHOUÉ au lieu des 8 racines.
  // Défaut observé le 16/09 sur Vinted (Blaf69, Achille Talon) : le job a buté
  // sur la FEUILLE « Bandes dessinées… » et l'app a proposé les racines du
  // catalogue. L'utilisateur aurait rechoisi « Livres et médias », déjà bon, et
  // rebuté au même endroit. Une question qui ne peut pas débloquer coûte un
  // geste ET la confiance.
  const titres = new Map();
  const parents = new Map();
  const enfants = new Map(); // code parent ("" = racines) → [{code,title}]
  (function parcours(liste, parent) {
    for (const n of liste || []) {
      noeuds.add(n.code);
      titres.set(n.code, n.title);
      parents.set(n.code, parent || null);
      const cle = parent || "";
      if (!enfants.has(cle)) enfants.set(cle, []);
      enfants.get(cle).push({ code: n.code, title: n.title });
      if (n.categories && n.categories.length) parcours(n.categories, n.code);
      else feuilles.add(n.code);
    }
  })(arbre.corps.categories, "");

  const enfantsDe = (code) => enfants.get(String(code ?? "")) ?? [];

  /**
   * Les options à proposer quand la catégorie ne convient pas. MÊME RÈGLE que
   * supabase/functions/_shared/opla-catalogue.ts (scripts/opla-catalogue-selftest.mjs
   * vérifie que les deux répondent pareil) :
   *   · nœud intermédiaire → ses PROPRES enfants (descendre d'un cran) ;
   *   · feuille            → ses FRÈRES (le voisinage du choix qui n'a pas convenu) ;
   *   · code inconnu       → on descend le chemin de libellés tant qu'il est
   *     reconnu, et on propose les enfants du dernier nœud reconnu.
   * Les racines ne sortent QUE si rien n'a été reconnu — le seul cas où elles
   * sont la bonne réponse.
   */
  const optionsNiveauEchoue = (code, chemin) => {
    const c = String(code ?? "").trim();
    if (noeuds.has(c)) {
      return feuilles.has(c) ? enfantsDe(parents.get(c) ?? "") : enfantsDe(c);
    }
    let ancre = "";
    for (const segment of Array.isArray(chemin) ? chemin : []) {
      const cible = String(segment ?? "").trim().toLowerCase();
      if (!cible) break;
      const suivant = enfantsDe(ancre).find((e) => String(e.title).trim().toLowerCase() === cible);
      if (!suivant) break;
      if (feuilles.has(suivant.code)) return enfantsDe(ancre); // c'est la feuille qui a échoué
      ancre = suivant.code;
    }
    return enfantsDe(ancre);
  };

  // ── LE CHEMIN D'UN CODE, ET LA DESCENTE PAR LE MOT (2026-09-17 soir) ──────
  // Défaut vu sur le job cb3dfbb6 (t-shirt homme, catégorie absente à
  // l'insert) : la question proposait les 8 racines, l'utilisateur répondait
  // « Hommes », le pré-vol rebutait sur MENS (nœud intermédiaire) et proposait
  // ses 3 enfants ; il répondait « Vêtements »… et le passage suivant
  // repartait des 8 racines, le code traduit du choix n'étant jamais écrit sur
  // le job. Trois questions, zéro progrès, et la garde anti-boucle aurait
  // coupé à la quatrième.
  // Ici : (1) le chemin de libellés d'un code (persisté avec lui, cf.
  // categorieRetenue dans fillListingForm) ; (2) une feuille désignée par son
  // chemin ENTIER — la forme de la réponse quand la question proposait des
  // feuilles ; (3) les feuilles dont le libellé EST le mot-objet du job
  // (jetons comparables : minuscules sans accents, pluriels ramenés, mots
  // vides ôtés — même règle que src/utils/categorieParMot.js), sous un nœud
  // donné ou dans tout l'arbre. Une seule → on descend sans question ;
  // plusieurs → UNE question, au niveau des feuilles, avec leur chemin entier.
  const SEPARATEUR_CHEMIN = " › ";
  const cheminDe = (code) => {
    const out = [];
    for (let c = String(code ?? "").trim(), n = 0; c && noeuds.has(c) && n < 12; c = parents.get(c) ?? "", n++) out.unshift(titres.get(c));
    return out;
  };
  const comparable = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  // ⚠️ « pour » (mot-outil, il départageait un livre de musculation vers les
  //    livres pour bébé) et « y » → « ie » (« body » ne trouvait pas
  //    « Bodies ») ajoutés le 2026-09-20, EN MÊME TEMPS que le serveur —
  //    _shared/opla-resolution.ts. Ces deux fonctions sont jumelles ; si elles
  //    divergent, le serveur et l'extension ne trancheront pas la même chose
  //    sur le même article.
  const MOTS_VIDES = new Set(["de", "des", "du", "le", "la", "les", "l", "d", "et", "ou", "a", "au", "aux", "en", "par", "pour", "sur", "avec", "autre", "autres", "divers"]);
  const jetons = (s) => comparable(s).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
    .map((t) => t.replace(/(?<=\p{L}{3})[sx]$/u, "").replace(/(?<=\p{L}{3})y$/u, "ie")).filter((t) => t && !MOTS_VIDES.has(t)).sort().join(" ");
  const sousArbre = (code) => {
    const c = String(code ?? "").trim();
    if (!c || !noeuds.has(c)) return null; // null = tout l'arbre
    const dedans = new Set();
    (function descend(k) { for (const e of enfantsDe(k)) { dedans.add(e.code); descend(e.code); } })(c);
    return dedans;
  };
  // ── LA RECHERCHE PAR LE MOT, EN TROIS PASSES (2026-09-18) ─────────────────
  // Défaut mesuré sur le job eba8a512 (« Ego Maillot Muangthong United blanc
  // Yamaha », 18/09 09:20) : le job porte DEUX mots-objets —
  // categorie_objet_ia = « maillot de football » et categorie_mot_cle_titre =
  // « maillot ». L'ancien code n'en lisait qu'UN (`a ?? b`), l'égalité stricte
  // des jetons ne trouvait rien pour « football maillot », et le pré-vol
  // repartait en question sur les 13 enfants de MEN_CLOTHING — alors que
  // MEN_JERSEYS (« Maillots », sous SPORTSWEAR, sous MEN_CLOTHING) est la
  // seule feuille que ces mots désignent.
  //
  // Donc : TOUS les mots candidats, et trois passes, de la plus sûre à la plus
  // large. On s'arrête à la PREMIÈRE passe qui rend quelque chose — une passe
  // plus large ne ferait qu'ajouter du bruit à un résultat déjà trouvé.
  //   1. ÉGALITÉ     : les jetons du libellé SONT ceux du mot
  //                    (« t-shirt » = « T-shirts ») ;
  //   2. LIBELLÉ ⊆ MOT : le mot nomme le libellé et le précise
  //                    (« maillot de football » ⊃ « Maillots ») — sûre, parce
  //                    que c'est le LIBELLÉ qui doit être entièrement contenu ;
  //   3. MOT ⊆ LIBELLÉ : le mot est une partie du libellé
  //                    (« montre » ⊂ « Montres connectées ») — la plus large,
  //                    d'où le plafond ci-dessous.
  // ⛔ PLAFOND : au-delà de OPLA_CANDIDATS_MAX feuilles, la passe ne « trouve »
  //    rien d'utile — c'est une liste à cocher illisible, pas une réponse. On
  //    la jette et on laisse la descente poser la question AU NIVEAU, qui tient
  //    sur un écran. Une question qui ne peut pas être répondue coûte un geste
  //    ET la confiance (leçon Blaf69 du 16/09).
  // ⛔ CE QUI ÉTAIT FAUX, ET QUI A COÛTÉ DEUX JOBS (corrigé le 2026-09-20)
  // La boucle sortait au PREMIER `return` : dès qu'une passe rendait quelque
  // chose, les suivantes ne tournaient jamais. Les trois passes étaient rangées
  // « de la plus sûre à la plus large », mais cette sûreté se mesure sur le
  // LIBELLÉ, pas sur l'ARTICLE — et le même libellé vit à des PROFONDEURS
  // différentes selon la branche. « Jeans » est une FEUILLE chez les enfants et
  // un NŒUD chez les adultes : l'égalité exacte trouvait les deux feuilles
  // enfant et s'arrêtait là, pendant que les jeans d'adulte attendaient dans la
  // passe 3, qui ne tournait jamais. Jobs 2e96a21f et 840b67ec (Thomas, 20/09),
  // « Jean Bootcut Levi's 544 » : deux options, toutes deux fausses.
  // Les trois passes CONTRIBUENT donc toutes, rangées en ÉTAGES (mot d'abord,
  // passe ensuite), et c'est l'article — son genre — qui élague.
  // ⛔ Jumelle de _shared/opla-resolution.ts. Toute retouche ici se reporte
  //    là-bas, et réciproquement.
  const OPLA_CANDIDATS_MAX = 12;
  // La borne d'une QUESTION, plus haute que celle du repli : « jean » désigne
  // 13 feuilles et la bonne y est toujours ; une liste HOMOGÈNE se lit.
  const OPLA_QUESTION_MAX = 15;
  const PASSES = [
    (jt, jm) => jt.join(" ") === jm.join(" "),
    (jt, jm) => jt.every((t) => jm.includes(t)),
    (jt, jm) => jm.every((t) => jt.includes(t)),
  ];
  const feuillesDedans = (racine) => {
    const perimetre = sousArbre(racine);
    const dedans = [];
    for (const f of feuilles) {
      if (perimetre && !perimetre.has(f)) continue;
      const jt = jetons(titres.get(f));
      if (jt) dedans.push({ code: f, title: titres.get(f), jetons: jt.split(" ") });
    }
    return dedans;
  };
  const enFeuille = (f) => ({ code: f.code, title: f.title, chemin: cheminDe(f.code) });
  /** Un étage par couple (mot, passe) : { feuilles, passe, mot }. Rien n'est jeté. */
  const feuillesParMotEtages = (mots, racine) => {
    const listeMots = (Array.isArray(mots) ? mots : [mots]).map((m) => jetons(m)).filter(Boolean);
    if (!listeMots.length) return [];
    const dedans = feuillesDedans(racine);
    const etages = [];
    const vus = new Set();
    for (const mot of listeMots) {
      const jm = mot.split(" ");
      for (let p = 0; p < PASSES.length; p++) {
        const lot = dedans.filter((f) => !vus.has(f.code) && PASSES[p](f.jetons, jm));
        for (const f of lot) vus.add(f.code);
        if (lot.length) etages.push({ feuilles: lot.map(enFeuille), passe: p + 1, mot });
      }
    }
    return etages;
  };
  const feuillesParMot = (mots, racine) => feuillesParMotEtages(mots, racine).flatMap((e) => e.feuilles);
  /** L'ANCIENNE recherche, gardée comme REPLI quand la liste large est trop longue. */
  const feuillesParMotEtroit = (mots, racine) => {
    const listeMots = (Array.isArray(mots) ? mots : [mots]).map((m) => jetons(m)).filter(Boolean);
    if (!listeMots.length) return [];
    const dedans = feuillesDedans(racine);
    for (const passe of PASSES) {
      for (const mot of listeMots) {
        const jm = mot.split(" ");
        const out = dedans.filter((f) => passe(f.jetons, jm)).map(enFeuille);
        if (out.length && out.length <= OPLA_CANDIDATS_MAX) return out;
      }
    }
    return [];
  };
  /** Les feuilles sœurs d'une feuille, elle comprise. */
  const feuillesSoeurs = (code) => {
    const p = parents.get(code) ?? null;
    if (!p) return [];
    const out = [];
    for (const f of feuilles) if ((parents.get(f) ?? null) === p) out.push({ code: f, title: titres.get(f), chemin: cheminDe(f) });
    return out;
  };

  // ── LE MOT PEUT NOMMER UN RAYON, PAS SEULEMENT UNE FEUILLE (2026-09-20) ───
  // DÉFAUT MESURÉ, job 2e96a21f / 840b67ec (Thomas, 20/09 01:58 et 02:03) :
  // « Jean Bootcut Levi's 544 Taille 38 » — un jean d'ADULTE. Les deux seules
  // options proposées étaient
  //     Enfants › Vêtements pour filles › … › Jeans
  //     Enfants › Vêtements pour garçons › … › Jeans
  // parce que ce sont les deux SEULES FEUILLES de l'arbre Opla dont le
  // libellé est exactement « Jeans ». Les jeans d'adulte existent pourtant —
  // 12 feuilles — mais elles s'appellent « Jeans droits », « Jeans skinny »,
  // « Jeans coupe droite »… et « Jeans » y est un NŒUD, pas une feuille.
  // La bonne réponse n'était pas dans la liste. Il a répondu « Autre », puis
  // « Autres », et la question est revenue à l'identique. Deux jobs morts.
  //
  // C'est le MÊME défaut que les livres sur Opla (« livre » → seulement
  // « Livres sonores » et « Livres pour bébé ») : quand le mot nomme un
  // RAYON, les candidates sont les feuilles DE CE RAYON.
  // ⛔ On ne remplace pas la recherche par feuille : on la COMPLÈTE, et
  //    seulement quand elle n'a rien donné d'utilisable.
  const feuillesDuNoeudNomme = (mots, racine) => {
    const listeMots = (Array.isArray(mots) ? mots : [mots]).map((m) => jetons(m)).filter(Boolean);
    if (!listeMots.length) return [];
    const perimetre = sousArbre(racine);
    const out = [];
    for (const n of noeuds.keys()) {
      if (feuilles.has(n)) continue;                       // un nœud, pas une feuille
      if (perimetre && !perimetre.has(n)) continue;
      if (!listeMots.includes(jetons(titres.get(n)))) continue;
      for (const f of feuilles) {
        if (!cheminDe(f).length) continue;
        let p = parents.get(f);
        for (let g = 0; p && g < 12; p = parents.get(p), g++) if (p === n) { out.push(f); break; }
      }
    }
    return [...new Set(out)].map((f) => ({ code: f, title: titres.get(f), chemin: cheminDe(f) }));
  };

  // ── LE GENRE ÉCARTE LES RAYONS QUI LE CONTREDISENT (2026-09-20) ──────────
  // ⛔ CE QUI ÉTAIT FAUX : « si filtrer vide la liste, on garde la liste
  //    d'origine ». Job 40ebdf2c, « Robe 12-18 mois », genre Fille : les seules
  //    feuilles trouvées étaient des robes FEMME, le filtre les écartait
  //    toutes, se ravisait, et la robe de bébé partait au rayon des femmes. Un
  //    filtre qui rend ce qu'il vient de juger faux ne filtre pas, il valide.
  // ⛔ ET UN GENRE CONNU DÉSIGNE UN RAYON : dès qu'une candidate est dans le
  //    rayon du genre, les autres sortent — genrées ou non. Sans ça, le maillot
  //    du job eba8a512 gagnait au rayon « Sport › Football ». Ce n'est QUE si
  //    aucune n'y est qu'on garde les racines non genrées (un ballon reste un
  //    ballon).
  const GENRE_RACINE = {
    homme: "hommes", femme: "femmes",
    garcon: "enfants", fille: "enfants", enfant: "enfants", bebe: "enfants",
  };
  const GENRE_RAYON = { fille: "filles", garcon: "garcons" };
  const RACINES_GENREES = new Set(["hommes", "femmes", "enfants"]);
  const cleGenre = (genre) => {
    const g = comparable(genre).replace(/[^a-z]/g, "");
    return GENRE_RACINE[g] ? g : (GENRE_RACINE[g.replace(/s$/, "")] ? g.replace(/s$/, "") : null);
  };
  const filtrerParGenre = (candidats, genre) => {
    const g = cleGenre(genre);
    if (!g || !candidats.length) return candidats;
    const racine = GENRE_RACINE[g];
    const rayon = GENRE_RAYON[g] ?? null;   // « filles » / « garçons », dans le libellé du 2e niveau
    const dansLeRayon = candidats.filter((c) => {
      if (comparable(c.chemin[0] ?? "") !== racine) return false;
      if (!rayon) return true;
      const niveau2 = comparable(c.chemin[1] ?? "");
      // Job 8de4f86a : « Pull 24M », genre Garçon → rayon des FILLES.
      if (/\bfilles?\b/.test(niveau2) && rayon !== "filles") return false;
      if (/\bgarcons?\b/.test(niveau2) && rayon !== "garcons") return false;
      return true;
    });
    if (dansLeRayon.length) return dansLeRayon;
    return candidats.filter((c) => !RACINES_GENREES.has(comparable(c.chemin[0] ?? "")));
  };

  // ── LA DESCENTE AUTOMATIQUE (2026-09-18) ──────────────────────────────────
  // Avant, arriver à MEN_TOP_T_SHIRTS coûtait TROIS needs_user : Hommes, puis
  // Vêtements, puis Hauts et t-shirts — une question par niveau, alors qu'un
  // seul de ces niveaux était réellement ambigu. Ici, tant qu'il n'y a qu'un
  // chemin plausible on descend TOUT SEUL, et on ne s'arrête que sur le niveau
  // qui demande vraiment un arbitrage.
  //
  // Deux façons de descendre sans demander :
  //   · par le MOT : une seule feuille du sous-arbre porte le nom de l'objet ;
  //   · par la FORME de l'arbre : un nœud à UN SEUL enfant n'offre aucun choix
  //     — poser la question serait faire cocher la seule case disponible.
  // Et un cas où l'on s'arrête pour de bon : plusieurs feuilles nommées par le
  // mot → UNE question, au niveau des FEUILLES, avec leur chemin entier.
  //
  // ⛔ ON NE S'ARRÊTE JAMAIS SUR UN NŒUD INTERMÉDIAIRE POUR ÉVITER LA QUESTION.
  //    Le serveur Opla accepte une catégorie inexistante en 200 et produit une
  //    annonce silencieusement morte (établi au lot 1) : la descente rend ce
  //    qu'elle a atteint, et c'est le PRÉ-VOL — la seule garde — qui tranche.
  // ⛔ Et on ne remonte JAMAIS : partir d'un nœud acquis et finir plus haut
  //    ferait perdre ce que l'utilisateur a déjà tranché.
  const descendre = (depart, mots, genre = "") => {
    let code = String(depart ?? "").trim();
    if (code && !noeuds.has(code)) code = ""; // un code inconnu n'est pas une ancre
    const etapes = [];
    for (let garde = 0; garde < 12; garde++) {
      if (code && feuilles.has(code)) break;
      // Le meilleur ÉTAGE non vide APRÈS élagage au genre : un étage vidé par
      // le genre laisse sa place au suivant — c'est ce qui sauve le jean
      // d'homme, dont l'étage d'égalité ne contient que des feuilles enfant.
      let parMot = [];
      for (const etage of feuillesParMotEtages(mots, code || null)) {
        let garde = filtrerParGenre(etage.feuilles, genre);
        if (!garde.length) continue;
        // Une passe 3 seule ne tranche pas, elle propose : le mot n'est qu'UNE
        // PARTIE du libellé, le reste, personne ne l'a demandé (job 9e6d4eb6,
        // « Pantalon velours enfant » → la seule feuille garçon contenant
        // « pantalon » est « Pantalons pattes d'éléphant »).
        if (etage.passe === 3 && garde.length === 1) {
          const soeurs = filtrerParGenre(feuillesSoeurs(garde[0].code), genre);
          if (soeurs.length > 1 && soeurs.length <= OPLA_QUESTION_MAX) garde = soeurs;
        }
        // Le mot nomme peut-être aussi un RAYON (« Jeans », « Jupes ») : ses
        // feuilles entrent alors dans la course, sans priorité pour la feuille.
        const parNoeud = filtrerParGenre(feuillesDuNoeudNomme([etage.mot], code || null), genre);
        if (parNoeud.length && parNoeud.length <= OPLA_QUESTION_MAX) {
          const vus = new Set(garde.map((c) => c.code));
          const fusion = [...garde, ...parNoeud.filter((c) => !vus.has(c.code))];
          if (fusion.length <= OPLA_QUESTION_MAX) {
            etapes.push(`mot → rayon nommé : ${fusion.length - garde.length} feuille(s) de ce rayon ajoutée(s) aux candidates`);
            garde = fusion;
          }
        }
        parMot = garde;
        break;
      }
      if (parMot.length === 1) {
        etapes.push(`mot → ${parMot[0].code} (feuille unique ${code ? `sous ${code}` : "dans tout l'arbre"})`);
        code = parMot[0].code;
        continue;
      }
      if (parMot.length > OPLA_QUESTION_MAX) {
        // Trop pour une question : on retombe sur EXACTEMENT ce que faisait le
        // code d'hier, pour ne rien casser de ce qui marchait.
        const repli = filtrerParGenre(feuillesParMotEtroit(mots, code || null), genre);
        etapes.push(`${parMot.length} feuilles, trop pour une question — repli sur la passe la plus sûre (${repli.length})`);
        parMot = repli;
        if (parMot.length === 1) { code = parMot[0].code; continue; }
      }
      if (parMot.length > 1) {
        etapes.push(`mot → ${parMot.length} feuilles ${code ? `sous ${code}` : "dans tout l'arbre"} — question au niveau des feuilles`);
        return { code, candidats: parMot, etapes };
      }
      const enf = enfantsDe(code || "");
      if (enf.length === 1) {
        etapes.push(`enfant unique → ${enf[0].code} (aucun choix à proposer)`);
        code = enf[0].code;
        continue;
      }
      break; // ambiguïté réelle : c'est ICI que la question se pose
    }
    // ── L'ANCRE EST LE BON RAYON, MÊME QUAND AUCUN MOT NE TROUVE SA FEUILLE ──
    // Job 01e066f1 (« Station d'accueil Articona », 19/09) : le mot ne désigne
    // aucune feuille de l'arbre Opla, l'ancre posée était un NŒUD, et le
    // pré-vol refusait « c'est un nœud intermédiaire » SANS aucune option —
    // un diagnostic juste et aucune issue. Les feuilles de ce nœud font une
    // question courte, fermée, où la bonne réponse est forcément.
    // ⛔ En dernier recours seulement : si un mot avait trouvé, on serait déjà
    //    sorti plus haut. (Le serveur, lui, retente d'abord depuis les racines
    //    — il a l'arbre entier sous la main au même instant.)
    if (code && !feuilles.has(code)) {
      const perimetre = sousArbre(code);
      const sous = filtrerParGenre(
        [...feuilles].filter((f) => perimetre?.has(f)).map((f) => ({ code: f, title: titres.get(f), chemin: cheminDe(f) })),
        genre,
      );
      if (sous.length > 1 && sous.length <= OPLA_QUESTION_MAX) {
        etapes.push(`aucun mot ne désigne de feuille — on propose les ${sous.length} feuilles du rayon « ${titres.get(code)} »`);
        return { code, candidats: sous, etapes };
      }
    }
    return { code, candidats: [], etapes };
  };
  const feuilleParChemin = (libelle) => {
    const l = String(libelle ?? "");
    if (!l.includes(SEPARATEUR_CHEMIN.trim())) return null;
    const cible = comparable(l.split(/\s*›\s*/).join(SEPARATEUR_CHEMIN));
    for (const f of feuilles) if (comparable(cheminDe(f).join(SEPARATEUR_CHEMIN)) === cible) return f;
    return null;
  };

  // Paramètres par feuille : `sizes` présent ⇔ la catégorie a un champ Taille.
  // Mémoïsé — une feuille par job, pas 886.
  //
  // ── LOT 7 : LA MÊME RÉPONSE PORTE DÉJÀ COULEURS ET MATIÈRES ───────────────
  // /public/config/params?category=<code> rend { conditions, sizes, colors,
  // materials } — mesuré sur MEN_SWEATERS le 15/09 : 14 tailles, 35 couleurs,
  // 65 matières, en UN appel. On ne gardait que les tailles et on jetait le
  // reste, ce qui laissait le pré-vol aveugle sur deux champs que le serveur
  // Opla n'inspecte pas davantage. Élargir le cache ne coûte AUCUNE requête
  // de plus : c'est la même réponse, lue jusqu'au bout.
  const cache = new Map();
  const params = (code) => (cache.has(code) ? cache.get(code) : null);
  const grillePour = (code) => params(code)?.tailles ?? null;
  const couleursPour = (code) => params(code)?.couleurs ?? null;
  const matieresPour = (code) => params(code)?.matieres ?? null;
  const precharger = async (code) => {
    if (cache.has(code)) return cache.get(code);
    const r = await oplaJson(OPLA_ENDPOINTS.paramsCategorie(code));
    const corps = r.ok && r.corps && typeof r.corps === "object" ? r.corps : null;
    // ⛔ null ≠ [] : une liste ABSENTE de la réponse (ou une réponse en échec)
    //    veut dire « on ne sait pas », et le pré-vol doit pouvoir le distinguer
    //    d'une liste vide. Jamais de repli statique (règle du 02/09).
    const liste = (v) => (Array.isArray(v) ? v.map((e) => ({ code: e?.code, title: e?.title })) : null);
    const p = {
      tailles: Array.isArray(corps?.sizes) ? corps.sizes.map((s) => s.code) : null,
      couleurs: liste(corps?.colors),
      matieres: liste(corps?.materials),
    };
    cache.set(code, p);
    return p.tailles;
  };
  return {
    noeuds, feuilles, grillePour, couleursPour, matieresPour, precharger,
    titres, enfantsDe, optionsNiveauEchoue,
    cheminDe, feuillesParMot, feuilleParChemin, descendre, SEPARATEUR_CHEMIN,
    feuillesDuNoeudNomme, filtrerParGenre,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. POINTS D'ENTRÉE — conformes au contrat commun
// ═══════════════════════════════════════════════════════════════════════════

const OPLA_REFUS = Object.freeze({
  success: false,
  error: "Opla n'est pas activé.",
  diagnostic: "content-scripts/opla.js — OPLA_ACTIF=false (coupe-circuit : rien n'est tenté).",
});

// Session morte : la FORME du message compte autant que son contenu.
// background.js (motifSessionMorte) reconnaît « Connexion <X> requise… » et
// route alors le job vers l'ATTENTE de session — aucune tentative consommée,
// re-sonde plus tard (règle du 10/09). Un autre libellé ferait brûler les
// cinq reprises du job sur une session qui ne reviendra pas toute seule.
// ⛔ Ni « Chrome », ni « onglet » (2026-09-23) : le geste est le bouton « Me
//    connecter » de l'app, qui ouvre Opla sur l'ordinateur. Le préfixe
//    « Connexion Opla requise » reste : c'est l'ancre que lit le background.
const OPLA_MSG_SESSION =
  "Connexion Opla requise : ta session Opla est fermée sur ton ordinateur. " +
  "Appuie sur « Me connecter » et connecte-toi à Opla — dès que c'est fait, la publication repart toute seule.";

// ── LOT 4 (c) — CHEMIN DE PUBLICATION, VOIE API ─────────────────────────────
// Écrit le 2026-09-15, DERRIÈRE OPLA_ACTIF. Rien ne s'exécute tant que le
// drapeau est éteint : la première ligne de fillListingForm rend le refus.
//
// La séquence est celle RELEVÉE au lot 1, pas une conception :
//   1. référentiel + préchargement de la feuille visée ;
//   2. PRÉ-VOL (lot 3) — seule garde contre l'annonce morte. Un pré-vol qui
//      échoue = le job NE PART PAS et remonte needs_user, avec un motif
//      DISTINCT d'un refus plateforme ;
//   3. photos : POST /public/images/upload-url → PUT S3 présigné → on garde
//      `key`, c'est elle qui entre dans corps.images[] ;
//   4. POST /public/me/articles → 201 ;
//   5. succès = l'`id` rendu par le 201. JAMAIS la redirection, jamais un délai.
//
// ⛔ CE QUI N'EST PAS FAIT ICI, ET POURQUOI :
//   · aucun dépôt réel n'a été tenté avec ce code — il n'a jamais tourné, le
//     drapeau est éteint et handlers/ n'est injecté nulle part ;
//   · le retrait reste au lot 6 ;
//   · rien ne touche au manifest : la permission d'hôte opla.co n'entre pas
//     dans un paquet CWS (avertissement de permission pour TOUT le parc), et
//     son retrait du manifest source est le geste de Nico, pas le mien.

// Monte UNE photo et rend sa `key` (celle attendue par corps.images[]).
// ⚠️ Le PUT présigné part vers S3, PAS vers /api : il ne passe donc pas par
// oplaJson (pas de credentials, pas de préfixe). Relevé au lot 1.
// ── LECTURE DE LA PHOTO : 1 essai + 5 REPRISES (lot 7, aligné sur urlToFile) ─
// Barème REPRIS TEL QUEL des quatre connecteurs en service (3/5/8/10/10 s,
// ≈ 36 s), et pour la même raison mesurée le 12/09 : 5 republications Vinted
// arrêtées parce qu'UNE lecture sur neuf avait répondu 502/504 alors que le
// fichier était en place. Opla n'avait aucune reprise — un hoquet de
// passerelle Supabase coûtait le job entier.
// Clé de cache NEUVE à chaque reprise (r=…) : le CDN indexe par URL complète,
// une réponse d'erreur mise en cache n'est donc jamais resservie.
// ⚠️ Reprise sur TOUT échec (statut non-2xx ET exception réseau), jamais sur
//    les seuls 404/410 — c'est exactement la borne trop étroite qui avait été
//    corrigée ailleurs le 12/09.
const OPLA_PHOTO_REPRISES_MS = [3000, 5000, 8000, 10000, 10000];

async function oplaLirePhoto(url, indice) {
  let reponse = null;
  let exception = null;
  for (let essai = 0; essai <= OPLA_PHOTO_REPRISES_MS.length; essai++) {
    if (essai > 0) await new Promise((r) => setTimeout(r, OPLA_PHOTO_REPRISES_MS[essai - 1]));
    const cible = essai === 0 ? url : `${url}${url.includes("?") ? "&" : "?"}r=${Date.now()}_${essai}`;
    try {
      exception = null;
      reponse = await fetch(cible, { credentials: "omit" });
    } catch (e) {
      exception = e;
      reponse = null;
    }
    if (reponse && reponse.ok) return reponse;
    oplaTracer(
      `photo ${indice + 1} : lecture ${essai + 1}/${OPLA_PHOTO_REPRISES_MS.length + 1} en échec ` +
      `(${reponse ? `HTTP ${reponse.status}` : String(exception?.message ?? exception)})`
    );
  }
  throw new Error(
    reponse
      ? `photo ${indice + 1} illisible (HTTP ${reponse.status}) après ${OPLA_PHOTO_REPRISES_MS.length + 1} lectures sur ~36 s`
      : `photo ${indice + 1} illisible (${String(exception?.message ?? exception)}) après ${OPLA_PHOTO_REPRISES_MS.length + 1} lectures sur ~36 s`
  );
}

async function oplaMonterPhoto(url, indice) {
  const source = await oplaLirePhoto(url, indice);
  const blob = await source.blob();

  const presigne = await oplaJson(OPLA_ENDPOINTS.urlPhotoPresignee, {
    method: "POST",
    body: JSON.stringify({ contentType: blob.type || "image/jpeg" }),
  });
  if (!presigne.ok || !presigne.corps?.uploadUrl || !presigne.corps?.key) {
    // ── UN 401 N'EST PAS UN PROBLÈME DE PHOTO (2026-09-20, passe 3) ────────
    // 🚨 LE CAS : laforge.vinted, « Tee-shirt Nike Sportswear Script »,
    //    20/09 16:07 → job FAILED sur « Opla : URL présignée refusée pour la
    //    photo 1 (HTTP 401) ». Motif jamais vu dans le parc, et pour cause :
    //    ce n'est pas la photo qui est refusée, c'est NOUS. 401 sur
    //    /public/images/upload-url veut dire que la session Opla de l'onglet
    //    n'est plus valable — le fichier n'a même pas quitté le poste.
    //    Le message envoyait la personne chercher un défaut dans ses photos.
    // ⛔ ET C'ÉTAIT UN `failed` TERMINAL pour une cause qui revient toute
    //    seule. Les trois autres fonctions du fichier (listerMesArticles,
    //    deleteListing, republishListing) traitent déjà le 401 en needsUser
    //    avec OPLA_MSG_SESSION ; le chemin de PUBLICATION était le seul à ne
    //    pas l'avoir. On aligne : même verdict, même phrase, même porte.
    if (presigne.statut === 401 || presigne.statut === 403) {
      const err = new Error(OPLA_MSG_SESSION);
      err.sessionOpla = true;
      throw err;
    }
    throw new Error(`URL présignée refusée pour la photo ${indice + 1} (HTTP ${presigne.statut})`);
  }

  const envoi = await fetch(presigne.corps.uploadUrl, {
    method: "PUT",
    body: blob,
    headers: { "Content-Type": blob.type || "image/jpeg" },
  });
  if (!envoi.ok) throw new Error(`envoi S3 refusé pour la photo ${indice + 1} (HTTP ${envoi.status})`);
  return presigne.corps.key;
}

// Monte les photos DANS L'ORDRE (la première est la vignette) et s'arrête à la
// première qui échoue : une annonce à trous ne vaut pas mieux qu'une absente,
// et à ce stade RIEN n'a encore été créé côté Opla.
async function oplaMonterPhotos(photos) {
  const cles = [];
  for (let i = 0; i < photos.length; i++) {
    cles.push(await oplaMonterPhoto(photos[i], i));
  }
  return cles;
}

/**
 * @param {object} job — cross_post_jobs :
 *   { id, platform, title, description, price, photos, platform_fields }
 *   platform_fields attendus (À POSER PAR L'APP, cf. docs/OPLA_MAPPING.md) :
 *     { oplaCategoryCode, etat, marque, taille?, couleurs?[], matieres?[] }
 */
async function fillListingForm(job) {
  if (!OPLA_ACTIF) return { ...OPLA_REFUS };
  const t0 = Date.now();
  oplaTracer("fillListingForm: entrée");
  try {
    // 1. RÉFÉRENTIEL + préchargement de la feuille visée.
    oplaEtape("referentiel");
    const ref = await oplaChargerReferentiel();
    // ── LA RÉPONSE DE L'UTILISATEUR, CONSOMMÉE ICI (2026-09-16) ─────────────
    // Le needs_user de catégorie écrit `platform_fields.oplaCategoryChoice` :
    // un LIBELLÉ, celui que l'utilisateur a coché parmi les options du niveau
    // qui avait échoué. On le retraduit en CODE — le POST Opla n'accepte que
    // le code — jamais en cherchant le libellé dans tout l'arbre : deux
    // branches portent le même libellé (« Vestes » existe sous WOMENS et sous
    // MEN_PULLOVERS_SWEATERS), et prendre le premier venu rangerait l'annonce
    // dans l'autre rayon, en 200, sans un mot.
    //
    // ⛔ LA RÉPONSE SE RAPPROCHE DU NIVEAU QUI A POSÉ LA QUESTION (2026-09-18).
    //    C'est ce qui a tué le job 7d31c111 (« Casio Montre G-Shock noire »,
    //    17/09 22:57) : FAILED après 5 questions, journal
    //    « choix utilisateur "Accessoires" ABSENT du niveau courant — ignoré,
    //    on redemandera ». Relevé en base : oplaCategoryCode = NULL sur ce job.
    //    La question avait été posée depuis une ancre DÉDUITE (la descente du
    //    chemin de libellés) que rien ne persistait ; au passage suivant,
    //    l'ancre était reperdue, `optionsNiveauEchoue("")` rendait les 8
    //    RACINES, « Accessoires » n'en est pas une, et la même question
    //    revenait. Cinq fois.
    //    Le remède est à la racine : la question PART AVEC SES OPTIONS
    //    (`oplaCategoryAsk` = { ancre, options:[{code,title}] }, persisté par
    //    categorieRetenue comme le reste), et la réponse se relit contre CETTE
    //    liste-là. Plus aucune retraduction « contre le niveau courant », donc
    //    plus aucun moyen que le niveau ait bougé entre-temps.
    const pf0 = job?.platform_fields ?? {};
    const choix = String(pf0.oplaCategoryChoice ?? "").trim();
    let code = String(pf0.oplaCategoryCode ?? "").trim();
    let choixConsomme = false;
    if (choix) {
      // (a) LA LISTE QUI A ÉTÉ MONTRÉE. Source de vérité : c'est exactement ce
      //     que l'utilisateur avait sous les yeux, code compris.
      const ask = pf0.oplaCategoryAsk;
      const posees = Array.isArray(ask?.options) ? ask.options : [];
      const dansAsk = posees.find((o) => String(o?.title ?? "").trim().toLowerCase() === choix.toLowerCase());
      if (dansAsk?.code) {
        oplaTracer(`categorie: choix utilisateur « ${choix} » → ${dansAsk.code} (liste posée à la question, ancre ${ask?.ancre ?? "(racines)"})`);
        code = String(dansAsk.code);
        choixConsomme = true;
      } else {
        // (b) Un CHEMIN ENTIER (« Hommes › Vêtements › … › T-shirts ») : la
        //     forme des réponses posées avant que la liste soit persistée.
        const feuille = ref.feuilleParChemin(choix);
        if (feuille) {
          oplaTracer(`categorie: choix utilisateur « ${choix} » → ${feuille} (feuille, par son chemin)`);
          code = feuille;
          choixConsomme = true;
        } else {
          // (c) REPLI HISTORIQUE, pour les jobs posés avant le 18/09 : le
          //     libellé relu contre le niveau qui échouerait aujourd'hui.
          const niveau = ref.optionsNiveauEchoue(code, pf0.oplaCategoryPath ?? job?.categoryPath ?? []);
          const trouve = niveau.find((o) => String(o.title).trim().toLowerCase() === choix.toLowerCase());
          if (trouve) {
            oplaTracer(`categorie: choix utilisateur « ${choix} » → ${trouve.code} (repli : niveau de ${niveau.length} options)`);
            code = trouve.code;
            choixConsomme = true;
          } else {
            oplaTracer(`categorie: choix utilisateur « ${choix} » introuvable, ni dans la liste posée ni au niveau courant — on redemandera`);
          }
        }
      }
    }
    // ── LA DESCENTE AUTOMATIQUE (2026-09-17 soir, élargie le 18/09) ──────────
    // Elle part de ce qui est acquis — y compris du code qu'on vient de
    // traduire — et descend TANT QU'IL N'Y A QU'UN CHEMIN PLAUSIBLE : une
    // feuille que le mot-objet désigne seule, ou un nœud à enfant unique.
    // C'est ce qui fait qu'une réponse utilisateur ne s'arrête plus net au
    // niveau suivant : elle consomme son niveau ET relance la descente en
    // dessous. « Hommes » + « t-shirt » va jusqu'à MEN_TOP_T_SHIRTS d'un trait.
    // Les DEUX mots-objets posés par l'app sont servis (categorie_objet_ia ET
    // categorie_mot_cle_titre) : sur le job eba8a512, le premier
    // (« maillot de football ») ne trouve rien et le second (« maillot ») mène
    // droit à MEN_JERSEYS — l'ancien `a ?? b` n'en lisait qu'un.
    const mots = [pf0.categorie_objet_ia, pf0.categorie_mot_cle_titre]
      .map((m) => String(m ?? "").trim()).filter(Boolean);
    // Le GENRE de la fiche filtre les candidates (2026-09-20) : sans lui, un
    // jean d'homme se voyait proposer les rayons filles et garcons.
    const genreFiche = String(pf0.genre ?? pf0.univers ?? "").trim();
    const descente = ref.descendre(code, mots, genreFiche);
    for (const e of descente.etapes) oplaTracer(`categorie: ${e}`);
    const feuillesCandidates = descente.candidats;
    code = descente.code;
    // Ce qui est acquis est ACQUIS : le code (même intermédiaire) et son chemin
    // partent avec le résultat sur TOUTES les issues (oplaSortie), et le
    // background les recopie sur le job. Le choix consommé est effacé — relu au
    // passage suivant, il se traduirait contre un autre niveau.
    // ⚠️ `oplaCategoryAsk` est EFFACÉ ici et ne sera réécrit que si une
    //    question repart plus bas : une liste périmée qui survit est
    //    exactement le défaut qu'on corrige.
    oplaCategorieRetenue = {
      ...(code && ref.noeuds.has(code) ? { oplaCategoryCode: code, oplaCategoryPath: ref.cheminDe(code) } : {}),
      ...(choix ? { oplaCategoryChoice: null } : {}),
      ...(choixConsomme || pf0.oplaCategoryAsk ? { oplaCategoryAsk: null } : {}),
    };
    if (!Object.keys(oplaCategorieRetenue).length) oplaCategorieRetenue = null;
    if (code) job = { ...job, platform_fields: { ...pf0, oplaCategoryCode: code } };
    if (code) await ref.precharger(code);
    oplaRelverAspects(code, ref);
    oplaTracer(`referentiel: ${ref.feuilles.size} feuilles, categorie « ${code || "(absente)"} »`);

    // 2. PRÉ-VOL — LA GARDE. Un échec ici n'est PAS un refus de plateforme :
    //    rien n'a été envoyé, l'annonce n'existe pas, et l'utilisateur peut
    //    corriger. D'où needsUser et un motif nommé, jamais un message brut.
    oplaEtape("prevol");
    // globalThis.oplaPrevol, JAMAIS une liaison lexicale : opla-prevol.js publie
    // sur globalThis et rien d'autre (son bandeau le dit). Écrit `oplaPrevol`
    // nu, le fichier chargerait quand même et planterait au premier job réel —
    // scripts/content-scripts-selftest.mjs l'a refusé, et il avait raison.
    const verdict = globalThis.oplaPrevol(job, ref);
    if (!verdict.ok) {
      oplaTracer(`prevol REFUSE: ${verdict.motif}${verdict.options ? ` (${verdict.options.length} options proposées)` : ""}`);
      // ── LA QUESTION TYPÉE (2026-09-16) ────────────────────────────────────
      // Quand le pré-vol sait QUOI proposer, on ne rend pas un message à lire :
      // on rend une LISTE À COCHER, au format du socle needs_user (celui de
      // vinted.js « niveau introuvable »). `target.root: null` = la réponse
      // s'écrit à la racine de platform_fields, là où le prochain passage la
      // lit. Les libellés partent en allowed_values, le code reste à nous :
      // l'utilisateur choisit dans SA langue, jamais dans des codes opaques.
      const champNU = verdict.champ === "size"
        ? { key: "oplaSizeChoice", label: "Taille Opla" }
        : { key: "oplaCategoryChoice", label: "Catégorie Opla" };
      // Quand la descente par le mot a trouvé PLUSIEURS feuilles, la question
      // porte sur ELLES (chemin entier) — pas sur le niveau du pré-vol.
      const options = verdict.champ === "category" && feuillesCandidates.length
        ? feuillesCandidates.map((f) => ({ code: f.code, title: f.chemin.join(ref.SEPARATEUR_CHEMIN) }))
        : (Array.isArray(verdict.options) ? verdict.options : []);
      // ── LA QUESTION PART AVEC SA LISTE (2026-09-18) ───────────────────────
      // Le prochain passage relira la réponse CONTRE CETTE LISTE, pas contre
      // un niveau recalculé — c'est la correction de fond du job 7d31c111
      // (5 questions, réponse « Accessoires » jetée à chaque fois parce que
      // l'ancre n'était persistée nulle part). On garde le CODE de chaque
      // option : c'est lui qui lève l'ambiguïté des libellés en double
      // (« Vestes » existe sous deux branches).
      // ⛔ Uniquement pour la CATÉGORIE : la taille se relit contre la grille
      //    de la feuille, qui est déjà une liste fermée et stable.
      if (verdict.champ === "category" && options.length) {
        oplaCategorieRetenue = {
          ...(oplaCategorieRetenue ?? {}),
          oplaCategoryAsk: {
            ancre: code && ref.noeuds.has(code) ? code : null,
            options: options.map((o) => ({ code: String(o.code), title: String(o.title ?? o.code) })),
            le: new Date().toISOString(),
          },
        };
      }
      return oplaSortie({
        success: false,
        needsUser: true,
        error: verdict.message ?? `Opla refuserait cette annonce : ${verdict.motif}. Rien n'a été envoyé.`,
        motif_prevol: verdict.motif,
        champ: verdict.champ ?? null,
        ...(options.length ? {
          needsUserField: {
            field_key: champNU.key,
            field_label: champNU.label,
            allowed_values: options.map((o) => String(o.title ?? o.code)),
            input_type: "selection_only",
            // ── LA LISTE EST COMPLÈTE, ET ON LE DIT (2026-09-20) ───────────
            // Sans ce drapeau, la modale laisse « Autre valeur… » : elle
            // suppose qu'un relevé peut être partiel (doctrine du 29/07, vraie
            // pour Beebs et Leboncoin dont on lit des listes à l'écran).
            // Ici la liste ne vient PAS d'un relevé : elle vient de NOTRE
            // arbre Opla, où les enfants d'un nœud sont connus en entier.
            // MESURÉ, jobs 2e96a21f et 840b67ec (Thomas, 20/09) : il a répondu
            // « Autre » puis « Autres » — deux valeurs qui ne sont dans AUCUNE
            // liste, que le passage suivant ne peut pas traduire, et la même
            // question est revenue à l'identique. Deux jobs morts.
            // Une valeur qu'on ne saura jamais consommer ne doit pas pouvoir
            // être saisie. Et quand aucune option ne convient, la sortie
            // existe désormais : « Abandonner Opla pour cet article ».
            options_completes: true,
            target: { root: null, key: champNU.key },
          },
        } : {}),
        t0,
      });
    }
    for (const a of verdict.avertissements ?? []) oplaTracer(`prevol OK, avertissement: ${a}`);

    // 3. PHOTOS — avant la création : le corps de l'article porte leurs clés.
    //    ⚠️ Quota RELEVÉ = 20, et au-delà Opla TRONQUE EN SILENCE. Le pré-vol
    //    borne déjà 1..20 ; on ne re-tronque pas ici, on ferait mentir sa garde.
    oplaEtape("photos");
    const photos = (job?.photos ?? []).map((p) => p?.url).filter(Boolean);
    let cles;
    try {
      cles = await oplaMonterPhotos(photos);
    } catch (e) {
      // La session, et elle seule, sort par la porte douce : needsUser, le
      // message de connexion, et RIEN n'a été créé côté Opla (le montage des
      // photos précède la création). Tout le reste garde le chemin d'avant.
      if (e?.sessionOpla) {
        oplaTracer("photos: session Opla refusée (401/403) — aucune photo envoyée");
        return oplaSortie({ success: false, needsUser: true, error: OPLA_MSG_SESSION, t0 });
      }
      throw e;
    }
    oplaTracer(`photos: ${cles.length}/${photos.length} montées`);

    // 4. CRÉATION.
    oplaEtape("creation");
    // ⛔ GARDE POSÉE PAR LE PASSAGE À BLANC DU LOT 5 (2026-09-15).
    // Le pré-vol construit un `corps` complet, `images` COMPRIS — mais il le
    // remplit avec ce qu'il a sous la main : le tableau `photos` du job, qui
    // porte des URL. Or l'API veut les CLÉS S3 rendues par /images/upload-url.
    // Mesuré sur le job servi 8679f6e3 : le pré-vol rend
    //   images: [{ type: "original", url: "https://…" }]
    // là où le POST attend [ "<key>", … ]. Ce n'est pas un bug aujourd'hui —
    // la ligne suivante écrase `images` — mais c'est un piège armé : le jour où
    // quelqu'un fera confiance à verdict.corps tel quel, le dépôt partira avec
    // des URL et Opla refusera, APRÈS que les photos aient été montées.
    // On vérifie donc ce qu'on envoie, au lieu de compter sur l'ordre des clés.
    const corps = { ...verdict.corps, images: cles };
    if (!Array.isArray(corps.images) || corps.images.some((k) => typeof k !== "string" || !k.trim())) {
      throw new Error(
        "images du POST mal formées : on attend des clés S3 (chaînes), reçu " +
        JSON.stringify(corps.images).slice(0, 120)
      );
    }
    const creation = await oplaJson(OPLA_ENDPOINTS.creer, {
      method: "POST",
      body: JSON.stringify(corps),
    });

    // 5. LE SUCCÈS EST L'`id` DU 201 — jamais la redirection vers
    //    /sell/published, jamais un délai. Et moderationStatus vaut "pending" à
    //    la création puis "approved" : la modération est ASYNCHRONE, elle ne
    //    conditionne pas le succès du dépôt (même doctrine que Beebs).
    //
    // ⛔⛔ CORRECTION A (lot 7) — LE 201 ÉTAIT LU COMME UN REFUS.
    // Ligne d'origine : `!creation.corps?.id`. Or TOUTE l'API Opla est
    // ENVELOPPÉE, l'écriture comprise — mesuré le 15/09 sur une création
    // brouillon, réponse recopiée telle quelle :
    //     POST /api/public/me/articles → 201
    //     { "article": { "id": "art_…", "status": "draft", … } }
    //     corps.id → undefined      corps.article.id → "art_…"
    // (les lectures le disaient déjà : {user}, {articles,nextCursor},
    // {article} — le § 15.2 du relevé décrivait l'objet DANS l'enveloppe, et
    // le handler l'a lu à plat.) Coût réel, mesuré au lot 6 : le dépôt du
    // sweat Tommy Jeans a RÉUSSI (201, annonce en ligne, approved) et le job
    // est parti en `failed` — « Opla a refusé le dépôt (HTTP 201). » Une
    // annonce ORPHELINE, en ligne chez Opla, inexistante pour FillSell, dont
    // l'identifiant ne vivait nulle part en base : la relancer aurait fait un
    // doublon payant.
    // ⚠️ On corrige la LECTURE, pas la sévérité : pas d'id ⇒ pas de succès.
    //    Un 201 sans identifiant reste un refus, parce qu'une annonce qu'on ne
    //    sait pas nommer ne peut être ni reliée, ni surveillée, ni retirée.
    const id = String(creation.corps?.article?.id ?? "").trim();
    if (creation.statut !== 201 || !id) {
      // ── CORRECTION G (lot 7) : LE CORPS DU REFUS PART EN BASE ─────────────
      // Le refus portait déjà un champ `reponse`… que background.js ne
      // persiste pas (il ne retient que result.diagnostic, et oplaSortie
      // écrase `diagnostic` avec la trace). Le corps était donc capturé puis
      // jeté — c'est POUR ÇA que la cause A était invisible en base et qu'il a
      // fallu une sonde live pour la voir. La trace, elle, EST persistée : on
      // y met l'extrait. Borné à 300 caractères, comme l'annexe Beebs.
      const extrait = typeof creation.corps === "string"
        ? creation.corps.slice(0, 300)
        : JSON.stringify(creation.corps ?? null).slice(0, 300);
      oplaTracer(
        `creation REFUSEE: HTTP ${creation.statut}` +
        (creation.statut === 201 ? " (201 SANS id exploitable — vérifier l'enveloppe de la réponse)" : "") +
        ` · corps: ${extrait}`
      );
      // ── LE 403 DU PROFIL VÉRIFIÉ — mesuré au lot A (2026-09-16) ──────────
      // Opla refuse toute annonce à plus de 300 € tant que le profil du vendeur
      // n'est pas vérifié, et il le dit PROPREMENT : un code machine, le seuil
      // en centimes, et un message français déjà actionnable. Le rendre en
      // « Opla a refusé le dépôt (HTTP 403). » serait jeter tout ça pour dire à
      // l'utilisateur un nombre qu'il ne peut pas interpréter, sur un problème
      // qu'il peut résoudre seul (baisser le prix, ou vérifier son profil).
      // C'est un needs_user : rien n'est cassé, il manque une décision humaine.
      const refus = creation.corps && typeof creation.corps === "object" ? creation.corps : null;
      if (creation.statut === 403 && refus?.error === "phone_verification_required") {
        const seuil = Number.isFinite(refus.thresholdCents) ? ` (seuil : ${refus.thresholdCents / 100} €)` : "";
        return oplaSortie({
          success: false,
          needsUser: true,
          error: String(refus.message ?? "Opla exige un profil vérifié pour une annonce de ce prix.").trim() + seuil,
          motif_prevol: "opla_profil_non_verifie",
          champ: "price",
          http: creation.statut,
          reponse: extrait,
          t0,
        });
      }
      return oplaSortie({
        success: false,
        error: `Opla a refusé le dépôt (HTTP ${creation.statut}).`,
        http: creation.statut,
        reponse: extrait,
        t0,
      });
    }
    const moderation = creation.corps.article.moderationStatus ?? null;
    // Modération TRACÉE, jamais un verdict : elle est asynchrone et ne
    // conditionne pas le succès du dépôt (même doctrine que Beebs). Elle part
    // dans la trace parce que la trace, elle, arrive en base.
    oplaTracer(`creation OK: id ${id} · moderationStatus ${moderation ?? "(absent)"}`);
    return oplaSortie({
      success: true,
      // ── CORRECTION C (lot 7) : LE CONTRAT DES QUATRE, PAS LE NÔTRE ────────
      // On rendait `listing_url` / `platform_listing_id` (snake_case) quand
      // background.js lit `result.listingUrl`, comme chez les quatre
      // connecteurs EN SERVICE. Personne ne lisait donc rien : listing_url
      // restait NULL, platform_listing_id aussi (update-job-status ne le
      // dérive QUE d'un listing_url), et l'identifiant de l'annonce
      // n'existait nulle part. C'est opla.js qui s'aligne — jamais l'inverse.
      // L'identifiant voyage DANS l'URL, exactement comme chez les quatre.
      listingUrl: oplaUrlPublique(id),
      ...(verdict.avertissements?.length ? { warnings: verdict.avertissements } : {}),
      t0,
    });
  } catch (e) {
    // Toute panne technique (référentiel injoignable, photo illisible, S3 qui
    // refuse) : échec NET, jamais une annonce à moitié créée — à ce stade le
    // POST de création n'est pas parti.
    oplaTracer(`exception: ${String(e?.message ?? e)}`);
    return oplaSortie({
      success: false,
      error: `Opla : ${String(e?.message ?? e)}`,
      t0,
    });
  }
}

// Point de sortie UNIQUE (union du contrat, emprunté à eBay) : la trace part
// sur TOUTES les issues, réussites comprises — sans les réussites on ne mesure
// pas une couverture, on collectionne des échecs.
function oplaSortie(resultat) {
  const { t0, ...reste } = resultat;
  return {
    ...reste,
    // La catégorie acquise (fillListingForm), sur toutes les issues — c'est
    // ce que le background recopie sur le job (categorieRetenue).
    ...(oplaCategorieRetenue ? { categorieRetenue: oplaCategorieRetenue } : {}),
    // Ce qu'Opla exige pour cette feuille, sur TOUTES les issues : une
    // publication refusée renseigne le catalogue autant qu'une réussie.
    ...(oplaAspectsReleves ? { discoveredRequired: oplaAspectsReleves } : {}),
    diagnostic: oplaTrace.slice(-30).join(" | "),
    etape: oplaEtapeCourante,
    duree_ms: t0 ? Date.now() - t0 : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RETRAIT (lot 7) — DELETE, ET LE 404 COMME SEULE PREUVE
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ LE 204 N'EST PAS LA PREUVE. Il dit « requête acceptée », rien de plus.
//    La preuve est le 404 sur GET /public/articles/<id> : 200 = encore là,
//    404 = plus là. Mesuré au lot 6 : DELETE 204, puis fiche 404, puis liste
//    vendeur vide — et pendant tout ce temps /product/<id> rendait 200 avec la
//    page COMPLÈTE (cache ISR, `age: 26`, 108201 octets identiques). Conclure
//    sur la page publique, c'est déclarer vivante une annonce supprimée.
//
// ⛔ DEUX CHEMINS À NE JAMAIS CONFONDRE, côté Opla :
//      « Publier plus tard » → DÉPUBLIE (retour en draft). Réversible, et
//        l'article existe toujours : la fiche répondrait encore.
//      « Supprimer »         → EFFACE. C'est celui-ci, et lui seul : on
//        n'appelle QUE DELETE /public/me/articles/<id>, jamais un PATCH de
//        statut, qui rendrait un retrait réversible et invisible à la garde.
//
// Idempotent par construction : une annonce déjà absente AVANT notre geste est
// un retrait RÉUSSI (même doctrine que le « déjà supprimée » d'eBay, 13/07),
// pas un échec — et on ne lance alors aucun DELETE.
async function deleteListing(job) {
  if (!OPLA_ACTIF) return { ...OPLA_REFUS };
  const t0 = Date.now();
  oplaTracer("deleteListing: entrée");
  try {
    oplaEtape("cible");
    const id = oplaIdDepuisUrl(job?.listing_url);
    if (!id) {
      // JAMAIS par titre (leçon Beebs du 11/09) : sans identifiant, on ne
      // retire rien du tout plutôt que de risquer l'annonce d'à côté.
      return oplaSortie({
        success: false, needsUser: true,
        error: "Retrait Opla impossible : aucun identifiant d'annonce dans le lien enregistré. " +
               "Retirer l'annonce à la main sur opla.co.",
        t0,
      });
    }
    oplaTracer(`cible: ${id}`);

    oplaEtape("etat_avant");
    const avant = await oplaJson(OPLA_ENDPOINTS.article(id));
    if (avant.statut === 401) return oplaSortie({ success: false, needsUser: true, error: OPLA_MSG_SESSION, t0 });
    if (avant.statut === 404) {
      oplaTracer("etat_avant: 404 — annonce déjà absente, aucun DELETE envoyé");
      return oplaSortie({ success: true, deja_absente: true, t0 });
    }
    if (avant.statut !== 200) {
      // Lecture non concluante : on ne supprime pas à l'aveugle, et on ne
      // conclut pas non plus. Reprise, rien n'a été touché.
      return oplaSortie({
        success: false, reprise: true,
        error: `État de l'annonce Opla illisible avant retrait (HTTP ${avant.statut}) — rien n'a été touché, reprise au prochain passage.`,
        t0,
      });
    }

    oplaEtape("suppression");
    const sup = await oplaJson(OPLA_ENDPOINTS.supprimer(id), { method: "DELETE" });
    oplaTracer(`DELETE: HTTP ${sup.statut}`);
    if (sup.statut === 401) return oplaSortie({ success: false, needsUser: true, error: OPLA_MSG_SESSION, t0 });

    // ── LA VÉRIFICATION, qui seule tranche ───────────────────────────────────
    // Elle tourne MÊME sur un 204 (le 204 ne prouve rien) et MÊME sur un code
    // d'erreur (une suppression peut aboutir et répondre mal).
    oplaEtape("verification");
    const apres = await oplaJson(OPLA_ENDPOINTS.article(id));
    oplaTracer(`verification: GET fiche → HTTP ${apres.statut}`);
    if (apres.statut === 404) return oplaSortie({ success: true, t0 });

    return oplaSortie({
      success: false, reprise: true,
      error: `Retrait Opla NON confirmé : après DELETE (HTTP ${sup.statut}), la fiche répond encore HTTP ${apres.statut} ` +
             "— l'annonce est probablement toujours en ligne. Reprise au prochain passage.",
      t0,
    });
  } catch (e) {
    oplaTracer(`exception: ${String(e?.message ?? e)}`);
    return oplaSortie({ success: false, reprise: true, error: `Opla : ${String(e?.message ?? e)}`, t0 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REPUBLICATION (lot 7) — UNE MODIFICATION EN PLACE, PAS UN RE-DÉPÔT
// ═══════════════════════════════════════════════════════════════════════════
// Chez les quatre, republier = SUPPRIMER puis RECRÉER, avec tout ce que ça
// traîne : fenêtre de doublon, snapshot à garder, annonce détruite si la
// recréation échoue (les 8 livres du 15-22/08). Chez Opla, rien de tout ça :
// PATCH /public/me/articles/<id> modifie l'article EN PLACE. Aucune fenêtre,
// aucune suppression, rien à recréer — donc rien à perdre.
//
// ⚠️ Ce n'est pas « l'API plutôt que le DOM » par préférence : le chemin DOM
//    est MORT chez eux (bouton Enregistrer sans requête, relevé lot 1).
// ⚠️ LE PATCH EST PARTIEL : ce qui n'est pas envoyé SURVIT. On n'envoie donc
//    PAS `images` — les photos déjà en ligne restent en place, et on évite de
//    re-monter 5 fichiers pour rien.
// ⛔ DEUX CLÉS INTERDITES DANS UN PATCH, relevées au lot 1 :
//      asDraft → 400 empty_patch (c'est un drapeau de CRÉATION, pas un levier
//        de publication) ;
//      status  → 403 phone_verification_required sur draft→available, alors
//        que la création directe en available passe sans téléphone vérifié.
//    Elles sont retirées ICI, par une garde, et pas seulement « pas ajoutées » :
//    le corps vient du pré-vol, qui peut changer.
async function republishListing(job) {
  if (!OPLA_ACTIF) return { ...OPLA_REFUS };
  const t0 = Date.now();
  oplaTracer("republishListing: entrée");
  try {
    oplaEtape("cible");
    const id = oplaIdDepuisUrl(job?.listing_url);
    if (!id) {
      return oplaSortie({
        success: false, needsUser: true,
        error: "Republication Opla impossible : aucun identifiant d'annonce dans le lien enregistré.",
        t0,
      });
    }

    // L'annonce doit EXISTER : l'oracle, encore lui. Une republication sur une
    // annonce disparue n'a pas de sens ici — il n'y a rien à modifier, et on
    // ne va SURTOUT pas en recréer une (ce serait le re-dépôt qu'on évite).
    oplaEtape("etat_avant");
    const avant = await oplaJson(OPLA_ENDPOINTS.article(id));
    if (avant.statut === 401) return oplaSortie({ success: false, needsUser: true, error: OPLA_MSG_SESSION, t0 });
    if (avant.statut === 404) {
      return oplaSortie({
        success: false, needsUser: true,
        error: "Republication Opla impossible : l'annonce n'est plus en ligne (fiche introuvable). " +
               "Rien n'a été modifié, et aucune nouvelle annonce n'a été créée.",
        t0,
      });
    }
    if (avant.statut !== 200) {
      return oplaSortie({
        success: false, reprise: true,
        error: `État de l'annonce Opla illisible avant republication (HTTP ${avant.statut}) — rien n'a été touché.`,
        t0,
      });
    }

    // Même pré-vol que la publication : la republication écrit les mêmes
    // champs, elle mérite les mêmes gardes (catégorie, taille, couleurs,
    // matières, prix). Un pré-vol qui refuse ⇒ on ne touche pas à l'annonce
    // existante, qui reste en ligne et intacte.
    // ── LA CATÉGORIE DE L'ANNONCE ELLE-MÊME (0.6.69, 25/09) ────────────────
    // nadegemarcelin78 : « Contes pour les Filles » et « Pantalon Morgan »,
    // 5 refus chacun sur opla_categorie_absente. Leur dépôt d'origine vient du
    // RELEVÉ (annonce Opla importée) : aucune catégorie sur le job. Or une
    // republication Opla MODIFIE l'annonce en place (PATCH) — et l'annonce,
    // lue juste au-dessus (`avant`), porte SA catégorie et SON état. On les
    // reprend tels quels : c'est la republication à l'identique, sans rien
    // deviner. Priorité : une catégorie choisie par la personne (pas de trace
    // `opla_deduit`) garde la main ; une catégorie seulement DÉDUITE par le
    // serveur (opla_deduit.oplaCategoryCode) cède devant celle de l'annonce.
    {
      const art = (avant.corps?.article && typeof avant.corps.article === "object") ? avant.corps.article : (avant.corps ?? {});
      const pfA = job?.platform_fields ?? {};
      const codeJob = String(pfA.oplaCategoryCode ?? "").trim();
      const deduit = Boolean(pfA.opla_deduit && typeof pfA.opla_deduit === "object" && pfA.opla_deduit.oplaCategoryCode);
      const codeAnnonce = typeof art.category === "string" ? art.category.trim() : "";
      const reprise = {};
      if (codeAnnonce && (!codeJob || (deduit && codeJob !== codeAnnonce))) {
        reprise.oplaCategoryCode = codeAnnonce;
        oplaTracer(`categorie: reprise de l'annonce elle-même « ${codeAnnonce} »${codeJob ? ` (au lieu de « ${codeJob} », seulement déduit)` : ""}`);
      }
      const etatJob = String(pfA.etat ?? "").trim();
      const etatAnnonce = typeof art.condition === "string" ? art.condition.trim() : "";
      if (etatAnnonce && !["new-with-tags", "new", "like-new", "good", "fair"].includes(etatJob)
          && ["new-with-tags", "new", "like-new", "good", "fair"].includes(etatAnnonce)) {
        reprise.etat = etatAnnonce;
        oplaTracer(`etat: reprise de l'annonce elle-même « ${etatAnnonce} »${etatJob ? ` (le job portait « ${etatJob} »)` : ""}`);
      }
      if (Object.keys(reprise).length) job = { ...job, platform_fields: { ...pfA, ...reprise } };
    }

    oplaEtape("referentiel");
    const code = String(job?.platform_fields?.oplaCategoryCode ?? "").trim();
    const ref = await oplaChargerReferentiel();
    if (code) await ref.precharger(code);
    oplaRelverAspects(code, ref);

    oplaEtape("prevol");
    const verdict = globalThis.oplaPrevol(job, ref);
    if (!verdict.ok) {
      oplaTracer(`prevol REFUSE: ${verdict.motif}`);
      return oplaSortie({
        success: false, needsUser: true,
        error: verdict.message ?? `Opla refuserait cette modification : ${verdict.motif}. L'annonce en ligne n'a pas été touchée.`,
        motif_prevol: verdict.motif,
        champ: verdict.champ ?? null,
        t0,
      });
    }
    for (const a of verdict.avertissements ?? []) oplaTracer(`prevol OK, avertissement: ${a}`);

    // Corps du PATCH : tout ce que le pré-vol a validé, SAUF les images (elles
    // survivent) et SAUF les deux clés interdites.
    const corps = { ...verdict.corps };
    delete corps.images;
    delete corps.asDraft;
    delete corps.status;
    if (!Object.keys(corps).length) {
      throw new Error("corps de PATCH vide — Opla rendrait 400 empty_patch");
    }

    oplaEtape("modification");
    const patch = await oplaJson(OPLA_ENDPOINTS.modifier(id), { method: "PATCH", body: JSON.stringify(corps) });
    oplaTracer(`PATCH: HTTP ${patch.statut} · champs: ${Object.keys(corps).join(",")}`);
    if (patch.statut === 401) return oplaSortie({ success: false, needsUser: true, error: OPLA_MSG_SESSION, t0 });
    if (patch.statut !== 200) {
      const extrait = typeof patch.corps === "string"
        ? patch.corps.slice(0, 300)
        : JSON.stringify(patch.corps ?? null).slice(0, 300);
      oplaTracer(`modification REFUSEE · corps: ${extrait}`);
      return oplaSortie({
        success: false,
        error: `Opla a refusé la modification (HTTP ${patch.statut}). L'annonce en ligne est inchangée.`,
        http: patch.statut,
        reponse: extrait,
        t0,
      });
    }

    // Preuve POSITIVE, relue sur la fiche : l'enveloppe, toujours (leçon A).
    oplaEtape("verification");
    const apres = await oplaJson(OPLA_ENDPOINTS.article(id));
    const article = apres.corps?.article ?? null;
    const titreVu = String(article?.title ?? "");
    const prixVu = article?.priceCents ?? null;
    oplaTracer(`verification: HTTP ${apres.statut} · title « ${titreVu} » · priceCents ${prixVu}`);
    if (apres.statut !== 200 || titreVu !== corps.title || prixVu !== corps.priceCents) {
      return oplaSortie({
        success: false, reprise: true,
        error: "Modification Opla non confirmée : la fiche relue ne porte pas les valeurs envoyées. " +
               "Reprise au prochain passage.",
        t0,
      });
    }

    // L'URL ne change pas — c'est tout l'intérêt d'une modification en place :
    // aucun lien à repointer, aucune annonce à clore, aucun doublon possible.
    return oplaSortie({
      success: true,
      listingUrl: oplaUrlPublique(id),
      ...(verdict.avertissements?.length ? { warnings: verdict.avertissements } : {}),
      t0,
    });
  } catch (e) {
    oplaTracer(`exception: ${String(e?.message ?? e)}`);
    return oplaSortie({ success: false, reprise: true, error: `Opla : ${String(e?.message ?? e)}`, t0 });
  }
}

// ── Relais d'étape (union du contrat) ───────────────────────────────────────
// Fire-and-forget par construction : jamais d'await, jamais de throw, aucun
// effet sur les temporisations.
let oplaEtapeCourante = null;
function oplaEtape(nom) {
  oplaEtapeCourante = String(nom ?? "");
  try {
    chrome.runtime?.sendMessage?.({ type: "FILLSELL_FILL_STEP", step: nom })?.catch?.(() => {});
  } catch { /* hors extension, ou extension rechargée */ }
}

// ── Trace du relevé, jointe au POINT DE SORTIE UNIQUE ───────────────────────
const oplaTrace = [];
// La catégorie acquise au cours du passage (code + chemin, choix consommé) :
// posée par fillListingForm, jointe à TOUTES les sorties par oplaSortie, remise
// à zéro avec la trace à chaque message.
let oplaCategorieRetenue = null;
// ── CE QU'OPLA EXIGE POUR CETTE FEUILLE (2026-09-20, passe 2) ──────────────
// 🚨 LE DÉFAUT : 526 lignes de catalogue Opla, TOUTES en source 'manual',
//    toutes posées à la main le 16/09, ZÉRO apprentissage depuis — pendant
//    que Leboncoin en apprenait 71 en sept jours. Deux causes :
//      1. `categoryKeyOf` (background.js) ne lisait pas `oplaCategoryPath`
//         ni `oplaCategoryCode` : une observation Opla serait tombée dans
//         « (catégorie inconnue) ». Corrigé.
//      2. Opla ne produisait AUCUNE observation — et pour une bonne raison :
//         elle ne remplit pas un formulaire, elle POSTE sur une API. Il n'y a
//         pas d'astérisque à lire, donc `oplaEstFacultatif()` (écrit le
//         15/09) n'a jamais été appelé une seule fois : du code mort.
//
// CE QU'ON OBSERVE À LA PLACE, et c'est mieux : `/public/config/params?
// category=<code>` rend la vérité d'Opla pour cette feuille — { sizes,
// colors, materials }. On le charge DÉJÀ à chaque publication (ref.precharger),
// pour le pré-vol. On ne fait donc aucun appel de plus : on écrit ce qu'on a
// lu, au lieu de le jeter.
//
// ⛔ `required` N'EST PAS DEVINÉ. Seule la TAILLE est déclarée obligatoire, et
//    seulement quand la grille existe : c'est la règle du pré-vol
//    (MOTIFS.TAILLE_REQUISE), prouvée par les refus réels d'Opla. Couleur et
//    matière partent en `required: false` avec leurs valeurs — on ne sait pas
//    si Opla les exige, on ne le prétend pas. Champ vide plutôt que champ
//    menteur.
// ⛔ `source: 'dom'` COMME TOUT LE MONDE : ces lignes passent par la garde de
//    corroboration (deux témoins distincts, la moitié des releveurs) au même
//    titre que Vinted ou Leboncoin. On ne relâche rien pour rattraper le
//    retard — sinon un compte seul redeviendrait la règle du parc, ce qui est
//    exactement l'incident du 16/09.
let oplaAspectsReleves = null;
function oplaRelverAspects(code, ref) {
  try {
    if (!code || !ref) { oplaAspectsReleves = null; return; }
    const tailles = typeof ref.grillePour === "function" ? ref.grillePour(code) : null;
    const couleurs = typeof ref.couleursPour === "function" ? ref.couleursPour(code) : null;
    const matieres = typeof ref.matieresPour === "function" ? ref.matieresPour(code) : null;
    const titresDe = (l) => (Array.isArray(l) ? l.map((e) => String(e?.title ?? e?.code ?? "").trim()).filter(Boolean) : []);
    const rows = [];
    if (Array.isArray(tailles) && tailles.length) {
      rows.push({ key: "size", label: "Taille", required: true, inputType: "selection_only", options: tailles.map(String) });
    }
    const opts = (l) => titresDe(l);
    if (Array.isArray(couleurs) && couleurs.length) {
      rows.push({ key: "color", label: "Couleur", required: false, inputType: "selection_only", options: opts(couleurs) });
    }
    if (Array.isArray(matieres) && matieres.length) {
      rows.push({ key: "material", label: "Matière", required: false, inputType: "selection_only", options: opts(matieres) });
    }
    oplaAspectsReleves = rows.length ? rows : null;
    if (rows.length) oplaTracer(`aspects relevés: ${rows.map((r) => `${r.key}(${r.options.length})`).join(", ")}`);
  } catch (e) {
    oplaAspectsReleves = null; // jamais bloquant : un relevé raté ne coûte rien
    console.warn("[opla] relevé des aspects ignoré :", String(e?.message ?? e));
  }
}
function oplaTracer(quoi) { oplaTrace.push(`${new Date().toISOString()} ${quoi}`); }

// ── Écouteur ────────────────────────────────────────────────────────────────
// Garde `typeof chrome` : permet d'injecter ce fichier tel quel pour un dry-run
// piloté hors extension. Garde d'écouteur unique : sans elle, deux injections
// répondent au même message.
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage && !globalThis.__fillsellOplaEcouteur) {
  globalThis.__fillsellOplaEcouteur = true;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // « es-tu là ? » — réponse SYNCHRONE, aucune lecture de page, aucun effet.
    if (msg?.type === "OPLA_PING") {
      sendResponse({ success: true, pong: true, actif: OPLA_ACTIF });
      return true;
    }
    if (msg?.type === "OPLA_CAPTURE_ARTICLE") {
      capturerArticle(String(msg.listingId ?? ""))
        .then((r) => sendResponse(r))
        .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err) }));
      return true;
    }
    if (msg?.type === "OPLA_LISTE_ARTICLES") {
      listerMesArticles()
        .then((r) => sendResponse(r))
        .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err) }));
      return true;
    }
    if (msg?.type === "DELETE_LISTING" || msg?.type === "REPUBLISH_LISTING") {
      // ⚠️ REMISE À ZÉRO DE LA TRACE (lot 7). Elle n'existait que sur
      // FILL_LISTING : un retrait héritait donc de la trace du dépôt précédent
      // — le content script survit d'un job à l'autre sur l'onglet de travail
      // persistant. Le diagnostic écrit en base aurait décrit un autre job.
      oplaEtapeCourante = null;
      oplaTrace.length = 0; oplaCategorieRetenue = null; oplaAspectsReleves = null;
      const action = msg.type === "DELETE_LISTING" ? deleteListing : republishListing;
      action(msg.job)
        .then((r) => sendResponse({ ...r, trace: [...oplaTrace], fill_step: oplaEtapeCourante }))
        .catch((err) => sendResponse({
          success: false,
          error: String(err?.message ?? err),
          ...(err?.needsUser === true ? { needsUser: true } : {}),
          trace: [...oplaTrace],
          fill_step: oplaEtapeCourante,
        }));
      return true;
    }
    if (msg?.type !== "FILL_LISTING") return;

    oplaEtapeCourante = null;
    oplaTrace.length = 0; oplaCategorieRetenue = null; oplaAspectsReleves = null;
    // trace jointe sur TOUTES les issues, réussites comprises (motif ebay.js)
    fillListingForm(msg.job)
      .then((r) => sendResponse({ ...r, trace: [...oplaTrace], fill_step: oplaEtapeCourante }))
      .catch((err) => sendResponse({
        success: false,
        error: String(err?.message ?? err),
        // motif beebs.js : une erreur LEVÉE peut être un needs_user borné
        ...(err?.needsUser === true ? { needsUser: true } : {}),
        ...(err?.diagnostic ? { diagnostic: String(err.diagnostic) } : {}),
        trace: [...oplaTrace],
        fill_step: oplaEtapeCourante,
      }));
    return true;
  });

  // ── Relais de la sonde réseau (union du contrat) ──────────────────────────
  // La sonde vit dans le monde MAIN et MEURT avec la page ; elle postMessage
  // chaque capture, on la relaie au background, qui survit à la navigation.
  // C'est ce qui prouve qu'un dépôt est parti quand la page ne le dit pas.
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data?.__fillsellProbe) return;
    try {
      if (e.data.capture) chrome.runtime.sendMessage({ type: "FILLSELL_PROBE_CAPTURE", capture: e.data.capture }).catch(() => {});
      if (e.data.envoi) chrome.runtime.sendMessage({ type: "FILLSELL_PROBE_ENVOI", envoi: e.data.envoi }).catch(() => {});
    } catch { /* extension rechargée : sans conséquence */ }
  });
}
