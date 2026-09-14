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

// ⛔ Les bornes (prix max/min, titre, description, photos) NE SONT PAS
// redéclarées ici : elles vivent dans `handlers/opla-prevol.js`, qui est
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
// 4. PRÉ-VOL — LA SEULE GARDE QUI EXISTE, ET ELLE VIT AILLEURS
// ═══════════════════════════════════════════════════════════════════════════
// Le pré-vol (catégorie feuille, taille dans LA BONNE grille, marque, prix,
// photos) est dans `handlers/opla-prevol.js`, déclaré AVANT ce fichier dans le
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
  (function parcours(liste) {
    for (const n of liste || []) {
      noeuds.add(n.code);
      if (n.categories && n.categories.length) parcours(n.categories);
      else feuilles.add(n.code);
    }
  })(arbre.corps.categories);

  // Grille par feuille : `sizes` présent ⇔ la catégorie a un champ Taille.
  // Mémoïsé — une feuille par job, pas 886.
  const cache = new Map();
  const grillePour = (code) => cache.has(code) ? cache.get(code) : null;
  const precharger = async (code) => {
    if (cache.has(code)) return cache.get(code);
    const r = await oplaJson(OPLA_ENDPOINTS.paramsCategorie(code));
    const g = r.ok && r.corps && r.corps.sizes ? r.corps.sizes.map((s) => s.code) : null;
    cache.set(code, g);
    return g;
  };
  return { noeuds, feuilles, grillePour, precharger };
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
  // TODO(lot 4) — la publication n'est PAS écrite ici : les lots 1 et 2 étaient
  // des lots d'observation. Tout ce qu'il faut est désormais relevé, et la
  // séquence exacte est celle-ci :
  //   1. ref = await oplaChargerReferentiel(); await ref.precharger(code)
  //   2. verdict = oplaPrevol(job, ref)   ⛔ si !verdict.ok → needs_user,
  //      le job NE PART PAS (motif dans verdict.motif, distinct d'un refus
  //      plateforme). C'est la seule garde contre l'annonce morte.
  //   3. photos : POST /public/images/upload-url puis PUT sur `uploadUrl`,
  //      on garde `key` — c'est elle qui entre dans corps.images[]
  //   4. POST /public/me/articles avec verdict.corps → 201
  //   5. succès = l'`id` rendu par le 201. Jamais la redirection, jamais un délai.
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
