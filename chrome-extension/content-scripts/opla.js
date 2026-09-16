// ═══════════════════════════════════════════════════════════════════════════
// OPLA — SQUELETTE DE CONNECTEUR
// phase 0 (2026-09-14) + LOT 1 (cycle complet observé le même soir)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE FICHIER EST INERTE, ET DOIT LE RESTER TANT QUE NICO N'A PAS DIT LE CONTRAIRE.
//
//   · OPLA_ACTIF = false  → toute entrée répond un refus net, sans toucher la page.
//   · Injecté sur `https://www.opla.co/*` par le manifest SOURCE seulement :
//     l'hôte opla.co est un « hôte de chantier » (scripts/hotes-livrables-cws.mjs),
//     l'empaquetage CWS le REFUSE — le parc n'a donc ni la permission d'hôte,
//     ni ce fichier. ⛔ Jamais la permission d'hôte opla.co dans le paquet :
//     avertissement de permission pour TOUS les utilisateurs + nouvelle revue,
//     pour un chantier à drapeau éteint.
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

const OPLA_ACTIF = false; // ⛔ NE PAS LEVER SANS DÉCISION EXPLICITE DE NICO — levé puis RÉÉTEINT le 15/09 après le lot 6 (dépôt réel fait, annonce retirée).

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
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. POINTS D'ENTRÉE — conformes au contrat commun
// ═══════════════════════════════════════════════════════════════════════════

const OPLA_REFUS = Object.freeze({
  success: false,
  error: "Opla n'est pas activé.",
  diagnostic: "content-scripts/opla.js — OPLA_ACTIF=false (câblé, drapeau éteint).",
});

// Session morte : la FORME du message compte autant que son contenu.
// background.js (motifSessionMorte) reconnaît « Connexion <X> requise… » et
// route alors le job vers l'ATTENTE de session — aucune tentative consommée,
// re-sonde plus tard (règle du 10/09). Un autre libellé ferait brûler les
// cinq reprises du job sur une session qui ne reviendra pas toute seule.
const OPLA_MSG_SESSION =
  "Connexion Opla requise : ouvre opla.co dans Chrome et reconnecte-toi, " +
  "puis relance depuis la fiche de l'article.";

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
    // le code — en cherchant dans les options de CE NIVEAU, jamais dans tout
    // l'arbre : deux branches portent le même libellé (« Vestes » existe sous
    // WOMENS et sous MEN_PULLOVERS_SWEATERS), et prendre le premier venu
    // rangerait l'annonce dans l'autre rayon, en 200, sans un mot.
    // Un choix qui mène à un nœud intermédiaire laisse le job repasser au
    // pré-vol : il redemandera, UN CRAN PLUS BAS, avec les bonnes options.
    const choix = String(job?.platform_fields?.oplaCategoryChoice ?? "").trim();
    let code = String(job?.platform_fields?.oplaCategoryCode ?? "").trim();
    if (choix) {
      const niveau = ref.optionsNiveauEchoue(code, job?.platform_fields?.oplaCategoryPath ?? job?.categoryPath ?? []);
      const trouve = niveau.find((o) => String(o.title).trim().toLowerCase() === choix.toLowerCase());
      if (trouve) {
        oplaTracer(`categorie: choix utilisateur « ${choix} » → ${trouve.code} (niveau de ${niveau.length} options)`);
        code = trouve.code;
        job = { ...job, platform_fields: { ...(job.platform_fields ?? {}), oplaCategoryCode: code } };
      } else {
        oplaTracer(`categorie: choix utilisateur « ${choix} » ABSENT du niveau courant — ignoré, on redemandera`);
      }
    }
    if (code) await ref.precharger(code);
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
      const options = Array.isArray(verdict.options) ? verdict.options : [];
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
    const cles = await oplaMonterPhotos(photos);
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
    oplaEtape("referentiel");
    const code = String(job?.platform_fields?.oplaCategoryCode ?? "").trim();
    const ref = await oplaChargerReferentiel();
    if (code) await ref.precharger(code);

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
    if (msg?.type === "DELETE_LISTING" || msg?.type === "REPUBLISH_LISTING") {
      // ⚠️ REMISE À ZÉRO DE LA TRACE (lot 7). Elle n'existait que sur
      // FILL_LISTING : un retrait héritait donc de la trace du dépôt précédent
      // — le content script survit d'un job à l'autre sur l'onglet de travail
      // persistant. Le diagnostic écrit en base aurait décrit un autre job.
      oplaEtapeCourante = null;
      oplaTrace.length = 0;
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
