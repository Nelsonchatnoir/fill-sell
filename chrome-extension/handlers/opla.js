// ═══════════════════════════════════════════════════════════════════════════
// OPLA — SQUELETTE DE CONNECTEUR (phase 0, 2026-09-14)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE FICHIER EST INERTE, ET DOIT LE RESTER TANT QUE NICO N'A PAS DIT LE CONTRAIRE.
//
//   · OPLA_ACTIF = false  → toute entrée répond un refus net, sans toucher la page.
//   · Aucun manifest ne déclare `handlers/` : ce fichier n'est injecté NULLE PART.
//   · Aucun fichier existant n'a été modifié pour lui (ni manifest.json, ni
//     background.js, ni un content-script, ni l'app).
//
// ⚠️ EMPLACEMENT PROVISOIRE. Les quatre connecteurs en service vivent dans
// `chrome-extension/content-scripts/`. `handlers/` était vide. Il est ici parce
// que le brief le demande, et c'est un bon endroit pour un fichier qui ne doit
// pas tourner. Le jour de l'activation il DESCEND dans `content-scripts/`, et
// c'est seulement à ce moment-là qu'on touche au manifest.
//
// ⚠️ CE QUI EST ÉCRIT ICI EST CE QUI A ÉTÉ OBSERVÉ, ET RIEN D'AUTRE.
// Tout ce qui n'a pas pu l'être porte un TODO nommé avec sa raison. Il n'y a
// aucun sélecteur supposé, aucune valeur devinée, aucun champ déduit par
// analogie avec Vinted. Relevé complet : docs/OPLA_RELEVE.md + docs/OPLA_MAPPING.md
//
// ═══════════════════════════════════════════════════════════════════════════

/* eslint-disable no-unused-vars */
/* global chrome */
// `chrome` est déclaré ici et pas dans la config ESLint : le périmètre
// content-scripts/ y est déjà couvert, handlers/ ne l'est pas, et AUCUN fichier
// existant ne devait être modifié cette nuit. À la remontée du fichier dans
// content-scripts/ (lot 4), cette ligne devient inutile.

const OPLA_ACTIF = false; // ⛔ NE PAS LEVER SANS DÉCISION EXPLICITE DE NICO

// ── Ce qu'Opla est, en une ligne ────────────────────────────────────────────
// SPA Next.js 16.2.1 / React 19 (canary), API REST same-origin sous /api,
// session par cookie httpOnly, catalogue et champs servis par le serveur.

// ═══════════════════════════════════════════════════════════════════════════
// 1. L'API — ET POURQUOI ELLE DOIT PARTIR D'ICI, JAMAIS DU SERVICE WORKER
// ═══════════════════════════════════════════════════════════════════════════
// MESURÉ le 14/09 : `curl` sur /api/public/config/articles rend 429 à l'instant
// où `fetch()` depuis la page rend 200. Ce n'est pas une limite d'IP, c'est un
// rejet des clients sans empreinte de navigateur. Un fetch du background MV3
// tomberait dans le même panier.
//   ⇒ TOUT appel API passe par ce content script, avec la session de la page.
const OPLA_API = "/api";

async function oplaGet(chemin) {
  const r = await fetch(OPLA_API + chemin, {
    credentials: "include",
    headers: { "Accept-Language": "fr" },
  });
  if (!r.ok) throw new Error(`Opla ${chemin} → HTTP ${r.status}`);
  return r.json();
}

// Endpoints RELEVÉS (code HTTP constaté en session réelle) :
const OPLA_ENDPOINTS = {
  // 200 — arbre complet : 8 racines, 1014 nœuds, 886 feuilles, codes TOUS uniques
  arbre: "/public/config/articles",
  // 200 — listes fermées globales + drapeaux serveur (dont depositPaused)
  paramsGlobaux: "/config/params?locale=fr",
  // 200 — config PAR catégorie. `sizes` présent ⇔ la catégorie a une grille.
  paramsCategorie: (code) => `/public/config/params?category=${encodeURIComponent(code)}`,
  // 200 — mes annonces : { articles:[…], nextCursor }
  mesArticles: "/public/me/articles?view=summary&limit=50",
  // 200 — détail : { article:{…} }
  article: (id) => `/public/articles/${encodeURIComponent(id)}`,
  // 200 — profil : { user:{…} }
  moi: "/public/me",
  // ⚠️ RELEVÉS DANS LE BUNDLE, JAMAIS APPELÉS — corps et méthode NON OBSERVÉS.
  // Ne pas les utiliser avant de les avoir vus passer sur un dépôt réel autorisé.
  urlPhotoPresignee_NON_OBSERVE: "/public/images/upload-url",
  creationArticle_NON_OBSERVE: "/public/me/articles",
};

// ⛔ PIÈGE RELEVÉ : /api/config/articles (sans « public ») rend 404, alors que
// /api/config/params (sans « public ») rend 200. Le préfixe n'est PAS symétrique.
// Ne jamais le déduire de l'autre.

// ═══════════════════════════════════════════════════════════════════════════
// 2. DÉTECTION D'ÉTAT — getComputedStyle + textContent, RIEN D'AUTRE
// ═══════════════════════════════════════════════════════════════════════════
// La fenêtre de travail est MINIMISÉE : getBoundingClientRect/getClientRects
// rendent des zéros, innerText rend du vide, les transitions ne se résolvent
// jamais. Tout ce fichier s'y tient, par construction.
// ⛔ L'opacité n'est JAMAIS un verdict (leçon du 14/09, Beebs/LBC).

const oplaTexte = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();

function oplaUtilisable(el) {
  if (!el) return false;
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden") return false;
  if (el.disabled === true || el.getAttribute("aria-disabled") === "true") return false;
  return true;
}
// ⛔ pointerEvents N'EST PAS testé élément par élément : sur Opla il est hérité d'un
// ancêtre et vaut « none » sur TOUT le formulaire quand le profil vendeur est
// incomplet. L'y mettre ferait déclarer « introuvable » des champs parfaitement
// présents — la faute exacte du 14/09 (PRÉSENT ≠ BLOQUANT). Il est traité pour ce
// qu'il est : un verdict de PAGE, ci-dessous.

// ⛔⛔ LE PIÈGE QUI COÛTERAIT UNE SEMAINE (mesuré le 14/09)
// Tant que le profil vendeur est incomplet, le formulaire est enveloppé dans
//   <div class="pointer-events-none opacity-50">
// et `element.click()` comme le setter natif TRAVERSENT pointer-events:none.
// J'ai ouvert des modales et rempli des champs sur un formulaire DÉSACTIVÉ sans
// la moindre erreur. Un handler naïf remplirait donc un formulaire mort en
// croyant réussir — le faux « published » de Leboncoin, en pire.
//   ⇒ Sur Opla, `pointer-events:none` sur un ANCÊTRE est un VERDICT. Le seul du
//     relevé. Il se lit par getComputedStyle : il vaut donc aussi en minimisé.
//   ⛔ L'`opacity-50` qui l'accompagne n'est JAMAIS un verdict (règle du 14/09).
function oplaFormulaireDesactive() {
  let n = document.querySelector(OPLA_SEL.titre);
  let poseur = null;
  while (n && n !== document.body) {
    if (getComputedStyle(n).pointerEvents === "none") poseur = n; // on garde le PLUS HAUT
    n = n.parentElement;
  }
  return poseur; // non nul ⇒ formulaire désactivé
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. SÉLECTEURS — ET LEUR DETTE, DITE FRANCHEMENT
// ═══════════════════════════════════════════════════════════════════════════
// Relevé du 14/09 sur /sell/create, catégorie « Robes d'été » posée.
// HORS #sell-photo-new, AUCUN contrôle du formulaire ne porte d'id, de data-*,
// de name ni d'aria-label. Il ne reste que des classes utilitaires Tailwind
// (qui changent à chaque build) et le TEXTE VISIBLE (qui change à chaque
// traduction). On s'accroche donc au texte, et c'est une dette assumée.
const OPLA_SEL = {
  // ✅ id STABLE — la seule prise solide de tout le formulaire
  photos: "#sell-photo-new",
  // ✅ attributs stables (maxlength/inputmode), meilleurs que le placeholder
  titre: 'main input[maxlength="80"]',
  description: "main textarea",
  prix: 'main input[inputmode="decimal"]',
  // ⚠️ TEXTE SEUL — aucune autre prise. Repli : ordre d'apparition dans <main>.
  parLibelle: {
    categorie: /^Catégorie/,
    marque: /^Marque/,
    etat: /^État/,
    taille: /^Taille/,
    couleur: /^Couleur/,
    matiere: /^Matière/,
  },
  // ⚠️ Les modales sont des portails en fin de <body>, SANS role="dialog".
  // Le z-index CHANGE d'une modale à l'autre (z-50 catégorie/taille, z-[60]
  // marque, z-[110] porte de profil) : ne JAMAIS cibler par z-index.
  modale: "div.fixed.inset-0",
  // ⛔ #_r_3_-input (champ Adresse) est un id GÉNÉRÉ PAR REACT — même famille
  // que les _r_0_ de Leboncoin. Jamais comme sélecteur.
};

// Un champ est FACULTATIF si et seulement si son libellé contient « (optionnel) ».
// Relevé : « Taille » n'en porte pas → obligatoire ; « Couleur (optionnel) » et
// « Matière (optionnel) » en portent → facultatifs. Pur textContent : valide en
// fenêtre non rendue.
function oplaEstFacultatif(bouton) {
  return /\(optionnel\)/i.test(oplaTexte(bouton));
}

function oplaBoutonChamp(motif) {
  return [...document.querySelectorAll("main button")].find((b) => motif.test(oplaTexte(b))) ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LES DEUX PORTES QUI PRÉCÈDENT TOUT DÉPÔT
// ═══════════════════════════════════════════════════════════════════════════

// (a) Interrupteur SERVEUR de mise en pause des dépôts.
// Relevé à TRUE le 14/09. Son effet réel n'a pas pu être caractérisé (le
// formulaire s'ouvrait quand même) — d'où le TODO. Mais on le lit avant de
// pousser quoi que ce soit : pousser dans une plateforme en pause, c'est
// exactement ce que platform_health est là pour éviter.
async function oplaDepotsEnPause() {
  try {
    const p = await oplaGet(OPLA_ENDPOINTS.paramsGlobaux);
    return p?.features?.depositPaused === true;
  } catch {
    return false; // fail-safe : on ne bloque pas sur une lecture ratée
  }
}
// TODO(phase 1) — caractériser depositPaused:true : le POST est-il refusé ?
// L'UI change-t-elle ? Non observable ce soir, le drapeau était déjà à true.

// (b) Porte de PROFIL VENDEUR.
// Relevé : /sell et /sell/create remplacent le bouton de publication par
// « Renseigner mes informations » et ouvrent une modale exigeant
// Prénom*, Nom*, Téléphone*, Adresse*, Code postal*, Ville*.
// C'est un attenteUtilisateur au sens du contrat : information de COMPTE
// manquante chez la plateforme. Ni reprise espacée, ni failed.
// ⛔ Le handler ne remplit JAMAIS ces champs : données personnelles.
function oplaPorteDeProfil() {
  const gate = [...document.querySelectorAll("main button")]
    .find((b) => /Renseigner mes informations/i.test(oplaTexte(b)));
  return oplaUtilisable(gate) ? gate : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. POINTS D'ENTRÉE — conformes au contrat commun des 4 connecteurs
// ═══════════════════════════════════════════════════════════════════════════

const OPLA_REFUS = Object.freeze({
  success: false,
  error: "Opla n'est pas activé.",
  diagnostic: "handlers/opla.js — OPLA_ACTIF=false (squelette de phase 0, jamais branché).",
});

/**
 * @param {object} job — cross_post_jobs :
 *   { id, platform, title, description, price, photos, platform_fields }
 *   platform_fields attendus (À POSER PAR L'APP, cf. docs/OPLA_MAPPING.md) :
 *     { oplaCategoryCode, etat, taille?, couleurs?[], matieres?[], marque? }
 */
async function fillListingForm(job) {
  if (!OPLA_ACTIF) return { ...OPLA_REFUS };
  // TODO(lot 2) — non écrit : le corps du POST /me/articles n'a PAS été observé
  // (bundle minifié, et aucun dépôt réel n'a été fait). Écrire ce chemin sans
  // l'avoir vu passer, ce serait exactement le faux « published » de Leboncoin.
  return { ...OPLA_REFUS, error: "Chemin de publication Opla non implémenté (phase 0)." };
}

async function deleteListing(job) {
  if (!OPLA_ACTIF) return { ...OPLA_REFUS };
  // TODO(lot 4) — non écrit : le chemin de retrait n'a pas pu être observé,
  // le compte de test n'a AUCUNE annonce (GET /me/articles → articles:[]).
  return { ...OPLA_REFUS, error: "Chemin de retrait Opla non implémenté (phase 0)." };
}

// ── Relais d'étape et de sonde ──────────────────────────────────────────────
// Le contrat commun DIVERGE sur ces deux mécanismes (leboncoin/ebay les ont,
// vinted/beebs non). Je prends ici l'union — c'est mon avis, pas une décision :
// chacun a été ajouté après un incident où le diagnostic manquait. Cf. § 1.4
// du relevé, à trancher par Nico.
let oplaEtapeCourante = null;
function oplaEtape(nom) {
  oplaEtapeCourante = String(nom ?? "");
  try {
    chrome.runtime?.sendMessage?.({ type: "FILLSELL_FILL_STEP", step: nom })?.catch?.(() => {});
  } catch { /* hors extension, ou extension rechargée */ }
}

// ── Écouteur ────────────────────────────────────────────────────────────────
// Garde `typeof chrome` : permet d'injecter ce fichier tel quel pour un dry-run
// piloté hors extension (même motif que les quatre autres).
// Garde d'écouteur unique : reprise du motif vinted.js (le seul des quatre à
// l'avoir) — sans elle, deux injections répondent au même message.
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
        .then((r) => sendResponse(r))
        .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err) }));
      return true;
    }
    if (msg?.type !== "FILL_LISTING") return;

    oplaEtapeCourante = null;
    fillListingForm(msg.job)
      .then((r) => sendResponse(r))
      .catch((err) => sendResponse({
        success: false,
        error: String(err?.message ?? err),
        // reprise du motif beebs.js : une erreur LEVÉE peut être un needs_user borné
        ...(err?.needsUser === true ? { needsUser: true } : {}),
        ...(err?.diagnostic ? { diagnostic: String(err.diagnostic) } : {}),
      }));
    return true;
  });
}
