// ═══════════════════════════════════════════════════════════════════════════
// OPLA — SQUELETTE DE CONNECTEUR
// phase 0 (2026-09-14) + LOT 1 (cycle complet observé le même soir)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE FICHIER EST INERTE, ET DOIT LE RESTER TANT QUE NICO N'A PAS DIT LE CONTRAIRE.
//
//   · OPLA_ACTIF = false  → toute entrée répond un refus net, sans toucher la page.
//   · Aucun manifest ne déclare `handlers/` : ce fichier n'est injecté NULLE PART.
//   · Aucun fichier existant n'a été modifié pour lui.
//
// ⚠️ EMPLACEMENT PROVISOIRE. Les quatre connecteurs en service vivent dans
// `chrome-extension/content-scripts/`. `handlers/` était vide. Le jour de
// l'activation, ce fichier DESCEND dans `content-scripts/`, et c'est seulement
// à ce moment-là qu'on touche au manifest (⛔ jamais la permission d'hôte
// opla.co dans le paquet CWS : avertissement de permission pour TOUS les
// utilisateurs + nouvelle revue, pour un chantier à drapeau éteint).
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
// `chrome` est déclaré ici et pas dans la config ESLint : le périmètre
// content-scripts/ y est déjà couvert, handlers/ ne l'est pas, et aucun fichier
// existant ne devait être modifié. À la remontée dans content-scripts/, cette
// ligne devient inutile.

const OPLA_ACTIF = false; // ⛔ NE PAS LEVER SANS DÉCISION EXPLICITE DE NICO

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

// Plafond de prix — RÈGLE MÉTIER OPLA, refus serveur observé :
//   400 {"error":"price_too_high","maxCents":100000,
//        "message":"Le prix maximum autorisé sur Opla est de 1000 €. …"}
const OPLA_PRIX_MAX_CENTIMES = 100000;
const OPLA_TITRE_MAX = 80;
const OPLA_DESCRIPTION_MAX = 2000;
const OPLA_PHOTOS_MAX = 20; // mesuré : 22 posées → 20 retenues, EN SILENCE
const OPLA_PHOTOS_MIN = 1;  // « Une image est requise au minimum. »

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
  parLibelle: {
    categorie: /^Catégorie/, marque: /^Marque/, etat: /^État/,
    taille: /^Taille/, couleur: /^Couleur/, matiere: /^Matière/,
  },
  // ⚠️ Modales = portails en fin de <body>, SANS role="dialog". Le z-index
  // CHANGE d'une modale à l'autre (z-50 / z-[60] / z-[110]) : ne JAMAIS cibler
  // par z-index. ⛔ #_r_3_-input est un id GÉNÉRÉ par React : jamais un sélecteur.
  modale: "div.fixed.inset-0",
};

// Un champ est FACULTATIF si et seulement si son libellé contient « (optionnel) ».
// Pur textContent : valide en fenêtre non rendue.
function oplaEstFacultatif(bouton) { return /\(optionnel\)/i.test(oplaTexte(bouton)); }

// ═══════════════════════════════════════════════════════════════════════════
// 4. PRÉ-VOL — LA SEULE GARDE QUI EXISTE, C'EST LA NÔTRE
// ═══════════════════════════════════════════════════════════════════════════
// ⛔⛔ MESURÉ : le serveur Opla accepte en 200 une catégorie INEXISTANTE et une
// taille HORS de la grille de la catégorie. Une faute de mapping ne rend donc
// pas d'erreur — elle produit une annonce SILENCIEUSEMENT MORTE (invisible en
// navigation, introuvable en recherche) et parfaitement « publiée » de notre
// point de vue. Aucun code HTTP ne préviendra.
//   ⇒ Ces contrôles ne sont pas du confort. Ils sont la seule protection.
//
// Fonctions PURES : aucun effet, aucune requête. Testables telles quelles.

function oplaVerifierPrix(prixEuros) {
  const cents = Math.round(Number(prixEuros) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return { ok: false, motif: "prix_absent" };
  if (cents > OPLA_PRIX_MAX_CENTIMES) {
    return { ok: false, motif: "price_too_high", maxCents: OPLA_PRIX_MAX_CENTIMES,
             message: "Opla n'accepte pas les annonces au-dessus de 1000 €." };
  }
  return { ok: true, priceCents: cents };
}

/** @param {Set<string>} feuilles codes de feuilles connus (docs/opla/categories.tsv) */
function oplaVerifierCategorie(code, feuilles) {
  if (!code) return { ok: false, motif: "categorie_absente" };
  if (!feuilles.has(code)) return { ok: false, motif: "categorie_inconnue", code };
  return { ok: true };
}

/** @param {string[]|null} grille `sizes` rendu par ?category=<CODE>, ou null si absent */
function oplaVerifierTaille(taille, grille) {
  if (!grille || !grille.length) {
    // pas de grille ⇒ pas de champ Taille ⇒ NE RIEN envoyer
    return taille ? { ok: true, omettre: true } : { ok: true, omettre: true };
  }
  if (!taille) return { ok: false, motif: "taille_requise" };
  if (!grille.includes(taille)) return { ok: false, motif: "taille_hors_grille", taille, grille };
  return { ok: true, omettre: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. LE CORPS DU POST — OBSERVÉ, pas déduit (lot 1, 201 Created)
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ Un champ vide ne s'envoie PAS : on omet la clé (mesuré sur le brouillon
//    sans description). Jamais "" ni [].
// ⛔ categoriesPath ne s'envoie PAS : le serveur le calcule et le rend.
// ⛔ maxlength ne protège rien contre une écriture programmatique : on tronque
//    NOUS-MÊMES (95 caractères de titre et 2050 de description ont été acceptés).
function oplaConstruireCorps({ titre, description, priceCents, images, category, brand, condition, sizes, colors, materials, brouillon }) {
  const corps = { title: String(titre).slice(0, OPLA_TITRE_MAX) };
  const d = String(description ?? "").slice(0, OPLA_DESCRIPTION_MAX);
  if (d) corps.description = d;
  corps.priceCents = priceCents;
  corps.images = (images ?? []).slice(0, OPLA_PHOTOS_MAX);
  corps.category = category;
  if (brand) corps.brand = brand;
  corps.condition = condition;
  const meta = {};
  if (sizes?.length) meta.sizes = sizes;
  if (colors?.length) meta.colors = colors;
  if (materials?.length) meta.materials = materials;
  if (Object.keys(meta).length) corps.metadata = meta;
  if (brouillon) corps.asDraft = true;
  return corps;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. POINTS D'ENTRÉE — conformes au contrat commun
// ═══════════════════════════════════════════════════════════════════════════

const OPLA_REFUS = Object.freeze({
  success: false,
  error: "Opla n'est pas activé.",
  diagnostic: "handlers/opla.js — OPLA_ACTIF=false (squelette, jamais branché).",
});

/**
 * @param {object} job — cross_post_jobs :
 *   { id, platform, title, description, price, photos, platform_fields }
 *   platform_fields attendus (À POSER PAR L'APP, cf. docs/OPLA_MAPPING.md) :
 *     { oplaCategoryCode, etat, marque, taille?, couleurs?[], matieres?[] }
 */
async function fillListingForm(job) {
  if (!OPLA_ACTIF) return { ...OPLA_REFUS };
  // TODO(lot 4) — la publication n'est PAS écrite ici : le lot 1 était un lot
  // d'observation. Tout ce qu'il faut pour l'écrire est désormais relevé
  // (§ 15.2 du relevé) : POST /public/me/articles avec oplaConstruireCorps(),
  // photos par URL présignée AVANT le POST, succès = l'id rendu par le 201.
  return { ...OPLA_REFUS, error: "Chemin de publication Opla non implémenté (lot 4)." };
}

async function deleteListing(job) {
  if (!OPLA_ACTIF) return { ...OPLA_REFUS };
  // TODO(lot 6) — relevé : DELETE /public/me/articles/<id> → 204.
  // ⛔ Le signal de retrait est le 404 sur GET /public/articles/<id>, PAS le 204 :
  //    le 204 dit que la requête a été acceptée, le 404 dit que l'annonce n'est
  //    plus là. C'est le 404 qu'on écrit en base.
  // ⚠️ Ne pas confondre avec « Publier plus tard », qui DÉPUBLIE (retour en
  //    draft, réversible) sans supprimer.
  return { ...OPLA_REFUS, error: "Chemin de retrait Opla non implémenté (lot 6)." };
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
    if (msg?.type === "DELETE_LISTING") {
      deleteListing(msg.job)
        .then((r) => sendResponse({ ...r, trace: [...oplaTrace] }))
        .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err), trace: [...oplaTrace] }));
      return true;
    }
    if (msg?.type !== "FILL_LISTING") return;

    oplaEtapeCourante = null;
    oplaTrace.length = 0;
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
