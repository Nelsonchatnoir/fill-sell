// Empreinte de version (2026-07-12) : PREMIÈRE ligne de console à l'injection —
// dit quelle version du code tourne RÉELLEMENT dans l'onglet. À METTRE À JOUR à
// chaque modification de ce fichier.
const VINTED_BUILD = "2026-08-09-photos-endpoint-reel (upload = POST /api/v2/photos, PAS /api/v2/images ; preuve croisée réseau + vignettes image-wrapper ; garde non bloquante sur recréation)";
console.log(`[vinted.js] build ${VINTED_BUILD}`);

// Content script Vinted — remplit le formulaire de dépôt d'annonce.
//
// ⚠️ DRY_RUN passé à false le 2026-07-12 (session de rodage supervisée par
// Nico : 1 article test, T-shirt Patagonia à 30 €, piloté à la main) : TOUT
// job publish part désormais en LIVE, plus seulement ceux marqués
// platform_fields.live_run. En dry-run, le formulaire était rempli mais le
// bouton publier n'était JAMAIS cliqué — le résultat était loggé en console.
const DRY_RUN = false;

// ── Requis par catégorie (chantier champs obligatoires, 2026-07-16) ──────────
// Source de vérité n°1 : la réponse POST /api/v2/item_upload/attributes que
// Vinted émet à CHAQUE sélection de catégorie — capturée par la sonde réseau
// du background (attrsConfig : code, titre humain, required, options). Relevé
// réel du 2026-07-16 (Téléphones portables) : internal_memory_capacity,
// condition et sim_lock y sont required=true ; brand et color n'y portent PAS
// de configuration (champs standards non requis).
// Source de vérité n°2 : le refus 400 du POST item_upload/items
// (errors[{field,value}]) — SEUL révélateur des requis absents de la config
// attributes, cas prouvé : model (400 réel f69e319c du 13/07).
//
// Table de correspondance nom-serveur → libellé humain : sert quand un champ
// arrive par un 400 sans avoir jamais été vu dans une config attributes (le
// titre humain manque alors). Libellés relevés sur le VRAI formulaire.
const VINTED_SERVER_FIELD_LABELS = {
  brand: "Marque",
  model: "Modèle",
  internal_memory_capacity: "Espace de stockage",
  sim_lock: "Simlockage",
  condition: "État",
  color: "Couleur",
  size: "Taille",
  material: "Matière",
  catalog_id: "Catégorie",
  price: "Prix",
  title: "Titre",
  description: "Description",
  photos: "Photos",
  isbn: "ISBN",
  video_game_rating: "Classification par âge (PEGI)",
  package_size_id: "Format du colis",
};

// Format de colis : id Vinted ↔ libellé ↔ rang du radio (publish.package_type).
// MESURÉ le 2026-08-05 sur l'annonce 8428482383 (package_size_id = 1) : le
// radio `package_type_selector_1` est celui coché sur la page d'édition, et son
// bloc affiche « Petit » (2 → « Moyen », 3 → « Grand »). Il n'existe AUCUN
// endpoint de référentiel pour ce champ — /api/v2/package_sizes,
// /api/v2/package_size_groups, /api/v2/shipping/package_sizes et
// /api/v2/item_upload/shipping_options rendent tous 404 (relevé du 05/08).
// C'est donc cette table qui fait foi, dans les DEUX sens : selectPackageSize
// la lit pour cliquer, la capture la lit pour nommer. Une seule table = les
// deux ne peuvent pas diverger. Un id hors 1..3 n'est JAMAIS approché : le
// champ part dans champs_manquants.
const VINTED_PACKAGE_SIZES_PAR_ID = { 1: "Petit", 2: "Moyen", 3: "Grand" };

// Sélecteur d'input pour un code d'attribut Vinted. Les champs « historiques »
// ont des testids spécifiques (relevés en réel) ; tout nouveau champ dynamique
// suit le motif générique category-<code>-… constaté sur stockage/simlock/état.
function vintedFieldSelector(code) {
  const special = {
    brand: '#brand, [data-testid="brand-select-dropdown-input"]',
    model: '#model, [data-testid="model-select-input"]',
    color: '#color, [data-testid="color-select-dropdown-input"]',
    condition: '#condition, [data-testid="category-condition-single-list-input"]',
    size: '#size, [data-testid="category-size-single-grid-input"]',
    material: '#material, [data-testid="category-material-multi-list-input"]',
  };
  if (special[code]) return special[code];
  const c = CSS.escape(code);
  return `#${c}, [data-testid="category-${c}-single-list-input"], [data-testid^="category-${c}-"]`;
}

// Dernière config attributes capturée par la sonde (celle de la catégorie
// réellement posée sur le formulaire — la sonde relaie chaque POST attributes,
// la plus récente gagne). [] si la sonde n'a rien vu (page pré-sonde, CSP…).
async function readLatestAttrsConfig() {
  const res = await askBackground({ type: "VINTED_PROBE_CAPTURES" });
  const captures = Array.isArray(res?.captures) ? res.captures : [];
  for (let i = captures.length - 1; i >= 0; i--) {
    if (Array.isArray(captures[i]?.attrsConfig) && captures[i].attrsConfig.length) {
      return captures[i].attrsConfig;
    }
  }
  return [];
}

// État RÉEL des requis de la catégorie courante : croise la config attributes
// (required=true) avec ce que le DOM affiche et porte comme valeurs.
// - `unfilled`  : libellés humains des requis encore vides → à bloquer.
// - `discovered`: tous les champs relevés (requis ou non) → catalogue
//   platform_category_aspects via le background.
// Le champ Modèle n'apparaît JAMAIS dans la config attributes (vérifié en réel
// le 2026-07-16 : aucun nouvel appel attributes à la pose de la marque) mais
// son 400 est prouvé — règle : #model PRÉSENT dans le DOM ⇒ requis.
async function computeVintedRequiredState() {
  const attrs = await readLatestAttrsConfig();
  const byCode = new Map();
  for (const a of attrs) {
    if (a?.code) byCode.set(a.code, a);
  }
  if (document.querySelector("#model") && !byCode.has("model")) {
    byCode.set("model", { code: "model", title: "Modèle", required: true, display: "list", options: null });
  }
  const discovered = [];
  const unfilled = [];
  for (const [code, meta] of byCode) {
    const el = document.querySelector(vintedFieldSelector(code));
    const filled = Boolean(el && String(el.value ?? "").trim());
    const label = meta.title ?? VINTED_SERVER_FIELD_LABELS[code] ?? code;
    discovered.push({
      key: code,
      label,
      required: meta.required === true,
      inputType: meta.display ?? null,
      options: Array.isArray(meta.options) && meta.options.length ? meta.options : null,
      source: "dom",
    });
    // Un requis ABSENT du DOM reste un requis (le serveur validera contre la
    // config, pas contre ce que la page a daigné afficher) : il compte vide.
    if (meta.required === true && !filled) unfilled.push(label);
  }
  // Couleur : la palette relevée dans le picker (selectColors) enrichit le
  // catalogue — allowed_values n'avait JAMAIS été capturé pour "color"
  // (relevé du 2026-07-30 : allowed_values=null partout). required est
  // CORRIGÉ à true : la config attributes le disait false, mais le serveur
  // refuse un dépôt sans couleur (400 réel "Le champ Couleur doit être
  // renseigné", job 243097d4) — le 400 prouvé prime sur la config. La
  // correction ne touche que le CATALOGUE (discovered) : unfilled, calculé
  // ci-dessus, n'est pas modifié — le blocage du cas « couleur manquante »
  // est porté par l'échec COULEUR INTROUVABLE du caller, pas par ici.
  if (paletteCouleursRelevee?.length) {
    const idx = discovered.findIndex((d) => d.key === "color");
    if (idx >= 0) {
      discovered[idx] = { ...discovered[idx], required: true, options: paletteCouleursRelevee };
    } else {
      discovered.push({
        key: "color",
        label: "Couleur",
        required: true,
        inputType: "multi-list",
        options: paletteCouleursRelevee,
        source: "dom",
      });
    }
  }
  // hadConfig : avait-on une BASE pour juger les requis ? byCode vide = la sonde
  // n'a capté AUCUNE config /attributes pour cette catégorie (page pré-sonde,
  // timing, CSP) → on ne peut PAS affirmer « tous les requis OK » (bug réel
  // 2026-07-18 : « Espace de stockage » jamais vu requis → publié à blanc).
  return { discovered, unfilled, hadConfig: byCode.size > 0 };
}

// Erreurs de validation STRUCTURÉES du refus serveur (parsées par la sonde sur
// tout status >= 400 de l'endpoint items). Donne les requis INVISIBLES côté
// DOM avec leur nom serveur exact — traduits en libellés humains via la config
// attributes puis la table de correspondance.
async function readServerValidationErrors() {
  const res = await askBackground({ type: "VINTED_PROBE_CAPTURES" });
  const captures = Array.isArray(res?.captures) ? res.captures : [];
  for (let i = captures.length - 1; i >= 0; i--) {
    const c = captures[i];
    if (Number(c?.status) < 400) continue;
    if (!/item_upload\/items/i.test(String(c?.url ?? ""))) continue;
    if (Array.isArray(c?.validationErrors) && c.validationErrors.length) return c.validationErrors;
  }
  return null;
}

// Panneau réutilisé par les dropdowns du formulaire (confirmé pour Catégorie ;
// supposé partagé avec Marque/Taille/État/Couleur/Matière, mêmes composants
// Vinted) : clé publish.dropdown_panel du registre — OPTIONAL, l'absence du
// panneau est un état nominal, d'où tryResolveSelector (jamais de -1 émis).
// waitForElementGone dessus ne bloque jamais (résout au timeout), donc même si
// l'hypothèse est fausse pour un champ donné, au pire on perd le timeout en
// délai, sans casser le flux. La sonde est SYNCHRONE (exigence de
// waitForElement/waitForElementGone) : elle se construit après résolution du
// module (S = await sel()).
function dropdownPanelProbe(S) {
  return () => S.tryResolveSelector("vinted", "publish.dropdown_panel")?.el ?? null;
}

// ── Registre de sélecteurs (chantier observatoire, 2026-07-27) ───────────────
// Les clés MIGRÉES ne portent plus leur littéral ici : il vit dans
// chrome-extension/selectors/vinted.registry.js et se résout par
// chrome-extension/selectors/resolve.js (cascade + télémétrie selector_health).
// Les content scripts sont des scripts CLASSIQUES (manifest sans type module) :
// l'import du module est forcément DYNAMIQUE — d'où l'entrée
// web_accessible_resources posée dans manifest.json pour selectors/*.js.
// ⚠️ Hors extension (injection manuelle « dry-run piloté », garde typeof chrome
// plus bas) : chrome.runtime n'existe pas, ce module est inaccessible et les
// chemins MIGRÉS lèvent — l'injection standalone ne couvre plus que les chemins
// non migrés. Assumé, signalé ici.
let __selectorsPromise = null;
function sel() {
  if (!__selectorsPromise) {
    __selectorsPromise = import(chrome.runtime.getURL("selectors/resolve.js"));
  }
  return __selectorsPromise;
}

// Attente d'une clé du registre — l'équivalent de waitForElement pour les clés
// migrées. Sonde resolveSelector SANS télémétrie d'échec (reportFailure:false :
// un -1 émis pendant le rendu SPA différé serait un faux signal de dégradation)
// et n'émet le -1 qu'à l'échec FINAL, par une dernière résolution non
// suppressée qui lève la SelectorResolutionError.
async function waitForKey(key, { timeoutMs = 10_000, params } = {}) {
  const S = await sel();
  const probe = () => {
    try {
      return S.resolveSelector("vinted", key, { params, reportFailure: false }).el;
    } catch (e) {
      if (e?.name === "SelectorResolutionError") return null;
      throw e; // erreur de configuration : casser bruyamment, pas attendre
    }
  };
  const found = await waitForElement(probe, timeoutMs, `vinted/${key}`).catch(() => null);
  if (found) return found;
  return S.resolveSelector("vinted", key, { params }).el; // émet le -1 puis lève
}

// ── Communication avec le background ──────────────────────────────────────────

// typeof guard : permet d'injecter ce fichier tel quel dans une page pour un
// dry-run piloté (hors extension), où chrome.runtime n'existe pas — même
// pattern que ebay.js/beebs.js.
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "DELETE_LISTING") {
      deleteListing(msg.job)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err) }));
      return true; // réponse asynchrone
    }
    if (msg?.type === "VINTED_CURRENT_USER") {
      vintedUtilisateurCourant()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err) }));
      return true; // réponse asynchrone
    }
    if (msg?.type === "SYNC_DRESSING_PAGE") {
      lirePageDressing(msg.page, msg.userId)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err) }));
      return true; // réponse asynchrone
    }
    if (msg?.type === "VINTED_ITEM_DETAIL") {
      lireDetailArticle(msg.vintedItemId)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err) }));
      return true; // réponse asynchrone
    }
    if (msg?.type === "VINTED_ITEM_CAPTURE") {
      // É1 republication : capture complète, lecture SEULE, à l'unité.
      capturerAnnonceVinted(msg.vintedItemId)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err) }));
      return true; // réponse asynchrone
    }
    if (msg?.type !== "FILL_LISTING") return;

    fillListingForm(msg.job)
      .then((result) => sendResponse(result))
      // err.diagnostic (2026-08-06) : annexe technique séparée du message
      // utilisateur — le background la range dans platform_fields.last_diagnostic,
      // jamais dans cross_post_jobs.error (affiché tel quel par l'app).
      .catch((err) => sendResponse({
        success: false,
        error: String(err?.message ?? err),
        ...(err?.diagnostic ? { diagnostic: String(err.diagnostic) } : {}),
      }));

    return true; // réponse asynchrone
  });

  // ── Relais des captures de la sonde réseau (2026-07-13) ─────────────────────
  // La sonde vit dans le monde MAIN (window.__fsCaptures) : elle MEURT avec la
  // page. Or Vinted redirige après une publication réussie — au moment où on
  // voudrait lire la preuve, elle n'existe plus (job ba84ebb0 : annonce en
  // ligne, job en "failed"). La sonde postMessage donc chaque capture ; on la
  // relaie AUSSITÔT au background, seul endroit qui survit à la navigation.
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data?.__fillsellProbe) return;
    try {
      chrome.runtime.sendMessage({ type: "VINTED_PROBE_CAPTURE", capture: e.data.capture }).catch(() => {});
    } catch { /* extension rechargée : sans conséquence */ }
  });
}

// Identité Vinted du compte connecté DANS CE NAVIGATEUR. L'id du dressing ne
// peut pas venir de FillSell : c'est la session Vinted de l'utilisateur qui
// fait foi, et lui seul sait sur quel compte il est connecté.
async function vintedUtilisateurCourant() {
  if (estPageBotShieldVinted()) {
    return { success: false, botShield: true, error: "CHALLENGE Vinted (bot-shield)" };
  }
  try {
    const r = await fetch("/api/v2/users/current", {
      headers: { Accept: "application/json" }, credentials: "include",
    });
    // Motifs DISTINCTS, code HTTP réel inclus : ils finissent mot pour mot
    // dans vinted_sync_runs.erreur (clôture du run côté background) et le
    // front reconnaît le cas « session » sur ce texte. Ici, contrairement à la
    // sonde du service worker (401 ambigu, cf. probePlatformSessions), la page
    // vient d'être chargée et a rafraîchi son token : un 401 est un vrai
    // signal de session absente/expirée.
    if (r.status === 401) {
      return { success: false, sessionExpiree: true, error: "session Vinted absente ou expirée (HTTP 401)" };
    }
    if (r.status === 403) {
      return { success: false, accesRefuse: true, error: "accès refusé par Vinted (HTTP 403)" };
    }
    const brut = await r.text();
    if (!brut.trim().startsWith("{")) return { success: false, error: `réponse non-JSON (HTTP ${r.status})` };
    const j = JSON.parse(brut);
    const u = j?.user;
    if (!u?.id) return { success: false, error: "id utilisateur Vinted absent de la réponse" };
    // Session ANONYME (garde du 2026-08-07) : Vinted sait servir des sessions
    // anonymes — si users/current répondait 200 avec un profil sans login,
    // l'ancienne sonde le prenait pour un succès et la sync lisait le
    // wardrobe d'un fantôme : run 'done' à 0 article, sans erreur, illisible
    // pour l'utilisateur. Un VRAI compte Vinted a toujours un login (pseudo
    // obligatoire à l'inscription). Le texte contient « session Vinted » :
    // c'est ce que le front reconnaît pour afficher son message actionnable.
    if (!u.login) {
      return { success: false, sessionExpiree: true, error: "session Vinted anonyme — aucun compte connecté dans ce navigateur" };
    }
    return {
      success: true,
      userId: String(u.id),
      login: u.login ?? null,
      // Ce que Vinted annonce sur le profil : sert à DIRE dans l'app que le
      // dressing n'expose pas tout l'historique (32 remontés vs 236 annoncés
      // sur le compte de test), au lieu de laisser croire à une sync ratée.
      itemCount: Number.isFinite(u.item_count) ? u.item_count : null,
      totalItemsCount: Number.isFinite(u.total_items_count) ? u.total_items_count : null,
    };
  } catch (e) {
    // fetch qui lève = pas de réponse HTTP du tout (réseau, DNS, page tuée).
    return { success: false, error: `erreur réseau : ${String(e?.message ?? e)}` };
  }
}

// ── Lecture du dressing (sync, 2026-08-03) ───────────────────────────────────
// UNE page de dressing par appel. Le background pilote la pagination et les
// pauses : ce fichier ne boucle JAMAIS tout seul sur le réseau de Vinted.
//
// Endpoint retenu (relevé en direct le 03/08 sur session authentifiée) :
//   GET /api/v2/wardrobe/{user_id}/items?page=N&per_page=96
// `per_page` est plafonné à 96 côté serveur (demander 100 ou 200 rend 96).
// La réponse porte DÉJÀ view_count et favourite_count : pas besoin d'un appel
// par article pour l'observabilité, qui est tout l'intérêt du chantier.
//
// ⛔ NE JAMAIS transformer ceci en boucle sur /api/v2/item_upload/items/{id}
// pour récupérer les descriptions. C'est l'endpoint du FORMULAIRE D'ÉDITION :
// 200 appels d'affilée dessus, c'est le profil de trafic le plus exposé du
// projet sur une plateforme sous DataDome (Leboncoin nous l'a rappelé le
// 30/07). Il sera appelé à l'unité, sur action humaine (republier / exporter
// un article), jamais en lot.
//
// Champs ABSENTS de l'API, à ne pas chercher ailleurs : la date de mise en
// ligne (Vinted ne l'expose pas ; la page publique n'affiche que « il y a
// 2 jours »), et l'historique de prix. Le seul repère disponible est le
// timestamp de la 1re photo — c'est la date du dernier ENVOI DE PHOTO, d'où
// le nom `listed_at_guess` côté base.
async function lirePageDressing(page, userId) {
  const t = (line) => console.log(`[vinted][sync] ${line}`);
  if (!userId) return { success: false, error: "user_id Vinted manquant" };

  // Un challenge DataDome rend du HTML : on le dit au lieu de faire planter le
  // JSON.parse sur une page de blocage (cf. bot-shield des 4 plateformes).
  if (estPageBotShieldVinted()) {
    return { success: false, botShield: true, error: "CHALLENGE Vinted (bot-shield) — sync interrompue" };
  }

  const url = `/api/v2/wardrobe/${encodeURIComponent(userId)}/items?page=${page}&per_page=96`;
  let resp;
  try {
    resp = await fetch(url, { headers: { Accept: "application/json" }, credentials: "include" });
  } catch (e) {
    return { success: false, error: `réseau : ${String(e?.message ?? e)}` };
  }
  t(`page ${page} → HTTP ${resp.status}`);
  if (resp.status === 401 || resp.status === 403) {
    return { success: false, sessionExpiree: true, error: `session Vinted refusée (HTTP ${resp.status})` };
  }
  const brut = await resp.text();
  if (!brut.trim().startsWith("{")) {
    // Vinted rend une page d'erreur HTML avec un content-type JSON : ne jamais
    // conclure « 0 article » sur ce corps, ce serait lu comme un dressing vide.
    return { success: false, error: `réponse non-JSON (HTTP ${resp.status})` };
  }
  let data;
  try { data = JSON.parse(brut); } catch (e) {
    return { success: false, error: `JSON illisible : ${String(e?.message ?? e)}` };
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const pagination = data?.pagination ?? null;

  const articles = items.map((it) => {
    const photos = Array.isArray(it.photos) ? it.photos : [];
    // Statut : is_closed + item_closing_action='sold' = vendu. Les autres
    // fermetures existent (retrait), on ne les confond pas avec une vente.
    let statut = "active";
    if (it.is_draft) statut = "draft";
    else if (it.is_closed) statut = it.item_closing_action === "sold" ? "sold" : "closed";
    else if (it.is_reserved) statut = "reserved";
    else if (it.is_hidden) statut = "hidden";
    return {
      vinted_item_id: String(it.id),
      titre: it.title ?? null,
      url: it.url ?? (it.path ? `https://www.vinted.fr${it.path}` : null),
      // price.amount est une STRING ("48.0") — parsing explicite, jamais de
      // Number() implicite sur l'objet.
      prix: it.price?.amount != null ? parseFloat(String(it.price.amount)) : null,
      devise: it.price?.currency_code ?? it.currency ?? null,
      marque: it.brand ?? null,
      taille: it.size ?? null,
      etat: it.status ?? null,
      vues: Number.isFinite(it.view_count) ? it.view_count : null,
      favoris: Number.isFinite(it.favourite_count) ? it.favourite_count : null,
      statut,
      photos: photos.map((p) => ({
        url: p.full_size_url ?? p.url ?? null,
        principale: p.is_main === true,
        ts: p.high_resolution?.timestamp ?? null,
      })).filter((p) => p.url),
      // Repère de mise en ligne : timestamp de la photo la plus ANCIENNE de
      // l'annonce (une photo ajoutée après coup ne doit pas rajeunir l'article).
      photo_ts: photos.reduce((min, p) => {
        const ts = p.high_resolution?.timestamp;
        return Number.isFinite(ts) && (min === null || ts < min) ? ts : min;
      }, null),
    };
  });

  return { success: true, articles, pagination, page };
}

// ── Détail d'UN article (2026-08-03 soir) ────────────────────────────────────
// GET /api/v2/item_upload/items/{id} — l'endpoint du FORMULAIRE D'ÉDITION,
// seul porteur de la description (absente de la liste wardrobe, cf. bandeau
// ⛔ ci-dessus). Il n'est appelé QU'À L'UNITÉ, sur ACTION HUMAINE (clic
// « Publier » côté site) : jamais de boucle, jamais de lot, jamais de cron —
// c'est exactement la limite posée par le bandeau, qu'on respecte ici.
async function lireDetailArticle(vintedItemId) {
  const id = String(vintedItemId ?? "").trim();
  if (!id || !/^\d+$/.test(id)) return { success: false, error: "id d'article Vinted manquant ou illisible" };
  if (estPageBotShieldVinted()) {
    return { success: false, botShield: true, error: "CHALLENGE Vinted (bot-shield)" };
  }
  let resp;
  try {
    resp = await fetch(`/api/v2/item_upload/items/${encodeURIComponent(id)}`, {
      headers: { Accept: "application/json" }, credentials: "include",
    });
  } catch (e) {
    return { success: false, error: `réseau : ${String(e?.message ?? e)}` };
  }
  if (resp.status === 401 || resp.status === 403) {
    return { success: false, sessionExpiree: true, error: `session Vinted refusée (HTTP ${resp.status})` };
  }
  if (resp.status === 404) {
    return { success: false, error: "annonce introuvable sur Vinted (HTTP 404)" };
  }
  const brut = await resp.text();
  if (!brut.trim().startsWith("{")) {
    return { success: false, error: `réponse non-JSON (HTTP ${resp.status})` };
  }
  let data;
  try { data = JSON.parse(brut); } catch (e) {
    return { success: false, error: `JSON illisible : ${String(e?.message ?? e)}` };
  }
  const item = data?.item ?? data;
  const photos = Array.isArray(item?.photos) ? item.photos : [];
  return {
    success: true,
    vintedItemId: id,
    description: typeof item?.description === "string" && item.description.trim() ? item.description : null,
    // Filet : les photos sont normalement déjà en base (écrites par la sync) —
    // on les renvoie quand même, au cas où une ligne ancienne n'en aurait pas.
    photos: photos.map((p) => p?.full_size_url ?? p?.url ?? null).filter(Boolean),
    // ── Payload NATIF complet (É1 republication, 2026-08-05) ─────────────────
    // On ne jette RIEN : on ne saura qu'à la recréation ce qui manque vraiment.
    // `natif` = l'objet item du formulaire d'édition tel que Vinted le rend
    // (ids catalog/brand/size/status/couleurs/colis, flags…). Les consommateurs
    // historiques (détail au Publier) continuent de lire description/photos.
    natif: item && typeof item === "object" ? item : null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// É1 REPUBLICATION — CAPTURE COMPLÈTE (2026-08-05). Lecture SEULE, à l'unité,
// sur action humaine — même cadre que lireDetailArticle (bandeau ⛔ ci-dessus).
// Aucune suppression ici, aucun job : on assemble tout ce qu'il faudrait pour
// recréer l'annonce À L'IDENTIQUE via le handler publish (voie 2 validée),
// avec un verdict explicite. RÈGLE ABSOLUE : une résolution id → libellé qui
// échoue ne produit JAMAIS une valeur approchée — elle nomme le champ dans
// champs_manquants et le verdict passe 'incomplet'. Un payload incomplet
// n'autorisera jamais une suppression (garde posée à la persistance, É2).
// ═════════════════════════════════════════════════════════════════════════════

// Référentiels Vinted — GET same-origin, mémoïsés pour la durée de vie de la
// page (une capture = au plus un fetch de chaque). ⚠️ Chemins d'API à
// CONFIRMER sur les comptes bêta : en cas de 404/forme inattendue, la
// résolution échoue PROPREMENT (champ nommé, jamais une valeur inventée) —
// c'est le comportement voulu, et le relevé réel corrigera le chemin.
// Chaque lecture réseau de la capture laisse une TRACE (statut HTTP, type de
// contenu, taille, clés de premier niveau, début du corps en cas d'échec),
// rangée dans payload.diagnostics. Sans ça, un endpoint qui bouge se lit comme
// « champ manquant » sans qu'on sache pourquoi — c'est exactement ce qui est
// arrivé le 05/08 au premier test réel : dto_public null, cause invisible.
// Le corps n'est JAMAIS stocké en entier (les catalogues font ~1,5 Mo) : 300
// caractères suffisent à distinguer 404 / 403 / DataDome / shape changée.
const _refCache = {};
// opts.memoiser=false : lecture propre à UN article (le dto public), qui n'a
// rien à faire dans un cache à durée de vie de page — l'onglet de travail vit
// des heures et resservirait le dto d'une autre capture.
async function lireReferentielVinted(cle, chemin, extraire, diag, opts = {}) {
  const memoiser = opts.memoiser !== false;
  if (memoiser && _refCache[cle]) {
    diag?.push({ cle, url: chemin, memoise: true });
    return _refCache[cle];
  }
  const trace = { cle, url: chemin };
  try {
    const r = await fetch(chemin, { headers: { Accept: "application/json" }, credentials: "include" });
    trace.status = r.status;
    trace.content_type = (r.headers.get("content-type") ?? "").split(";")[0] || null;
    const brut = await r.text();
    trace.taille = brut.length;
    const amorce = brut.trim();
    const estJson = amorce.startsWith("{") || amorce.startsWith("[");
    if (!r.ok || !estJson) {
      // ⚠️ Vinted rend ses 404 avec content-type: application/json ET un corps
      // HTML (relevé du 05/08) : le statut seul ne suffit pas, on garde l'amorce.
      trace.forme = estJson ? "json" : "non-json (corps HTML ?)";
      trace.corps_debut = brut.slice(0, 300);
      return null;
    }
    let data;
    try {
      data = JSON.parse(brut);
    } catch (e) {
      trace.forme = `json illisible : ${String(e?.message ?? e)}`;
      trace.corps_debut = brut.slice(0, 300);
      return null;
    }
    trace.forme = Array.isArray(data) ? `array(${data.length})` : Object.keys(data).slice(0, 12).join(",");
    const extrait = extraire(data);
    if (extrait) {
      if (memoiser) _refCache[cle] = extrait;
      trace.resolu = true;
    } else {
      // 200 + JSON mais forme inattendue : le cas le plus traître, on garde tout
      // ce qu'il faut pour corriger le parseur sans redemander un relevé.
      trace.resolu = false;
      trace.corps_debut = brut.slice(0, 300);
    }
    return extrait ?? null;
  } catch (e) {
    trace.erreur = String(e?.message ?? e);
    return null;
  } finally {
    diag?.push(trace);
  }
}

// catalog_id → chemin de libellés (["Hommes","Vêtements","Vêtements de sport et
// accessoires","Shorts"]), prêt pour platform_fields.categoryPath du publish.
// ⚠️ CHEMIN CORRIGÉ le 2026-08-05, mesuré : /api/v2/catalogs rend 404 (corps
// HTML) — c'était l'hypothèse du 05/08 au matin, elle était fausse. Le seul
// endpoint qui rend l'arbre est /api/v2/item_upload/catalogs (200, ~1,5 Mo,
// 8 racines, enfants sous `catalogs`, libellé sous `title`) : la descente
// ci-dessous, elle, était juste. Vérifié : 586 → Hommes > Vêtements >
// Vêtements de sport et accessoires > Shorts.
async function resoudreCheminCatalogue(catalogId, diag) {
  const id = Number(catalogId);
  if (!Number.isFinite(id)) return null;
  const racines = await lireReferentielVinted("catalogs", "/api/v2/item_upload/catalogs", (d) =>
    Array.isArray(d?.catalogs) && d.catalogs.length ? d.catalogs : null, diag);
  if (!racines) return null;
  const chemin = [];
  const descendre = (noeuds) => {
    for (const n of noeuds ?? []) {
      chemin.push(String(n?.title ?? ""));
      if (Number(n?.id) === id) return true;
      if (descendre(n?.catalogs)) return true;
      chemin.pop();
    }
    return false;
  };
  return descendre(racines) && chemin.every(Boolean) ? chemin.slice() : null;
}

// size_id → libellé ("M"). MESURÉ le 2026-08-05 : /api/v2/sizes rend 404, le
// référentiel vit sous /api/v2/size_groups (200, 74 groupes, chaque groupe
// portant ses `sizes: [{id,title}]`). Table PLATE assumée : les 709 ids relevés
// sont globalement uniques (0 collision de libellé entre groupes), donc pas
// besoin de scoper par catégorie. Si un jour deux groupes se disputaient un id,
// c'est ce commentaire qu'il faudra rouvrir — pas le résultat qu'il faudra
// deviner. Vérifié : 208 → « M » (groupe 14).
async function resoudreTaille(sizeId, diag) {
  const id = Number(sizeId);
  if (!Number.isFinite(id)) return null;
  const table = await lireReferentielVinted("size_groups", "/api/v2/size_groups", (d) =>
    Array.isArray(d?.size_groups) && d.size_groups.length
      ? new Map(d.size_groups.flatMap((g) =>
          (Array.isArray(g?.sizes) ? g.sizes : []).map((s) => [Number(s?.id), String(s?.title ?? "")])))
      : null, diag);
  const libelle = table?.get(id);
  return libelle ? libelle : null;
}

// Couleurs. Vinted ne porte PAS de `color_ids` : le payload d'édition expose
// deux emplacements nommés (color1/color2 + color1_id/color2_id), et il porte
// les libellés EN CLAIR. Le code du 05/08 au matin lisait `natif.color_ids`,
// champ inexistant → liste vide → « aucune couleur », déclaré ok : les deux
// couleurs (Marine, Orange) disparaissaient SANS être signalées manquantes.
// C'était le pire cas possible au regard de la règle (une perte silencieuse,
// pas un échec nommé). Désormais : libellé de natif d'abord, référentiel
// /api/v2/colors (200, 29 entrées — chemin déjà correct) en repli, et tout id
// non résolu part dans champs_manquants.
async function resoudreCouleurs(natif, diag) {
  const emplacements = [
    { rang: 1, id: natif?.color1_id ?? null, libelle: String(natif?.color1 ?? "").trim() },
    { rang: 2, id: natif?.color2_id ?? null, libelle: String(natif?.color2 ?? "").trim() },
  ].filter((c) => c.id != null || c.libelle);
  // Aucune couleur posée : cas VALIDE (le champ est optionnel sur Vinted).
  if (!emplacements.length) return { libelles: [], manquants: [] };

  const aResoudre = emplacements.filter((c) => !c.libelle && c.id != null);
  const table = aResoudre.length
    ? await lireReferentielVinted("colors", "/api/v2/colors", (d) =>
        Array.isArray(d?.colors) && d.colors.length
          ? new Map(d.colors.map((c) => [Number(c?.id), String(c?.title ?? "")]))
          : null, diag)
    : null;

  const libelles = [];
  const manquants = [];
  for (const c of emplacements) {
    const resolu = c.libelle || (c.id != null ? table?.get(Number(c.id)) : null);
    if (resolu) libelles.push(String(resolu));
    else manquants.push(`couleur ${c.rang} (color${c.rang}_id=${c.id} → libellé)`);
  }
  return { libelles, manquants };
}

// Capture complète d'UNE annonce en ligne. SOURCE PRINCIPALE : le payload
// d'édition item_upload/items/{id} — il porte les ids ET, en clair, `status`,
// `color1`/`color2`, `brand_dto.title`. Les référentiels (catalogues, groupes
// de tailles, couleurs) ne servent qu'aux ids que ce payload ne traduit pas
// (catalog_id, size_id), et items/{id} n'est plus qu'un dernier repli.
// Ordre posé le 2026-08-05 après le premier test réel : partir des libellés
// déjà présents, c'est trois requêtes de moins et un point de panne de moins.
async function capturerAnnonceVinted(vintedItemId) {
  const detail = await lireDetailArticle(vintedItemId);
  if (!detail.success) return detail; // erreurs déjà typées (session, 404, bot-shield…)
  const natif = detail.natif ?? {};
  const manquants = [];
  const diagnostics = [];

  // dto PUBLIC — REPLI SEULEMENT depuis le 2026-08-05. Il était le chemin
  // PRINCIPAL des libellés ; le premier test réel a montré qu'il ne rend plus
  // rien, et la mesure a tranché la cause : GET /api/v2/items/{id} → 404 avec
  // un corps HTML (ni 403, ni DataDome, ni forme changée — l'endpoint n'est
  // plus là). Or le payload d'édition porte déjà `status`, `color1`/`color2` et
  // `brand_dto.title` EN CLAIR : natif est donc la première source partout où
  // il porte un libellé, et cet appel n'est plus tenté que si un libellé
  // manque encore. Un endpoint mort ne coûte plus une requête par capture, et
  // s'il revient un jour on en profite sans rien changer.
  let dtoPublic = null;
  let dtoTente = false;
  const lireDtoPublic = async () => {
    if (dtoTente) return dtoPublic;
    dtoTente = true;
    dtoPublic = await lireReferentielVinted(
      `dto_public_${vintedItemId}`,
      `/api/v2/items/${encodeURIComponent(String(vintedItemId))}`,
      (d) => d?.item ?? d ?? null,
      diagnostics,
      { memoiser: false },
    );
    return dtoPublic;
  };

  const libelles = {};

  // Catégorie — le champ le plus important pour « à l'identique ».
  const catalogId = natif?.catalog_id ?? null;
  const chemin = catalogId != null ? await resoudreCheminCatalogue(catalogId, diagnostics) : null;
  if (chemin?.length) libelles.categoryPath = chemin;
  else manquants.push("categorie (catalog_id → chemin de libellés)");

  // État — libellé ("Bon état"), jamais déduit du seul status_id.
  const etat = String(natif?.status ?? "").trim() || String((await lireDtoPublic())?.status ?? "").trim();
  if (etat) libelles.etat = etat;
  else manquants.push("etat (libellé d'état absent du payload)");

  // Taille — size_id null est VALIDE (catégories sans taille) ; sinon un
  // libellé est requis, résolu par le référentiel des groupes de tailles.
  const sizeId = natif?.size_id ?? null;
  if (sizeId != null) {
    const taille = await resoudreTaille(sizeId, diagnostics);
    if (taille) libelles.taille = taille;
    else manquants.push(`taille (size_id=${sizeId} → libellé)`);
  }

  // Marque — brand_id null/vide = « Sans marque », valide.
  const marque = String(natif?.brand_dto?.title ?? natif?.brand ?? "").trim()
    || String((natif?.brand_id != null ? await lireDtoPublic() : null)?.brand ?? "").trim();
  if (marque) libelles.marque = marque;
  else if (natif?.brand_id != null) manquants.push("marque (brand_id présent sans libellé)");

  // Couleurs — libellés en clair dans natif, référentiel en repli.
  const couleurs = await resoudreCouleurs(natif, diagnostics);
  libelles.couleurs = couleurs.libelles;
  manquants.push(...couleurs.manquants);

  // Colis — requis au dépôt ; selectPackageSize (handler publish) attend le
  // libellé. Aucun référentiel distant n'existe (tous 404, relevé du 05/08) :
  // la table partagée VINTED_PACKAGE_SIZES_PAR_ID fait foi, et un id inconnu
  // est nommé plutôt qu'approché — un mauvais format de colis ne se voit qu'à
  // la première vente, en frais de port faux.
  const packageId = natif?.package_size_id ?? null;
  if (packageId != null) {
    const libelle = VINTED_PACKAGE_SIZES_PAR_ID[Number(packageId)];
    if (libelle) libelles.colis = libelle;
    else manquants.push(`colis (package_size_id=${packageId} hors table connue 1..3)`);
  } else {
    manquants.push("colis (package_size_id absent du payload)");
  }

  // Description — obligatoire au dépôt.
  if (!detail.description) manquants.push("description");

  // Photos — les URLs CDN sont vivantes (annonce en ligne) mais PAS encore
  // re-hébergées chez nous : tant que ce n'est pas fait, la capture reste
  // INCOMPLÈTE par construction — c'est la garde qui interdit de supprimer.
  const photosCdn = detail.photos ?? [];
  if (!photosCdn.length) manquants.push("photos (aucune URL lisible)");
  manquants.push("photos_rehebergees (re-hébergement en attente — infra à valider)");

  return {
    success: true,
    vintedItemId: String(vintedItemId),
    verdict: manquants.length ? "incomplet" : "valide",
    champs_manquants: manquants,
    titre: String(natif?.title ?? dtoPublic?.title ?? "").trim() || null,
    prix: natif?.price?.amount ?? natif?.price ?? dtoPublic?.price?.amount ?? null,
    description: detail.description,
    photos_cdn: photosCdn,
    libelles,
    natif,        // payload d'édition COMPLET — rien n'est jeté
    dto_public: dtoPublic, // null tant qu'aucun libellé ne l'a réclamé (repli)
    // Trace des lectures réseau de CETTE capture. C'est elle qui doit répondre
    // « pourquoi ce champ manque » sans redemander un relevé à Nico.
    diagnostics,
  };
}

// ── Suppression d'annonce (Phase B, 2026-07-11) ────────────────────────────────
// ⚠️ DELETE_DRY_RUN : passé à false le 2026-07-12 sur décision de Nico (session
// autonome). Gate Vinted : 1/3.
//
// ✅ CAUSE ÉLUCIDÉE le 2026-07-12 (ce n'était ni DataDome, ni la connexion, ni
// le sélecteur — les trois hypothèses successives étaient fausses) : la page
// annonce Vinted n'est ni peinte ni hydratée dans un onglet EN ARRIÈRE-PLAN,
// et l'onglet de travail est créé active:false.
//   onglet caché  : DOM complet (HTML serveur), [data-testid="item-delete-button"]
//                   TROUVÉ par querySelector, mais 0×0, offsetParent null, aucun
//                   handler React → simulateFullClick sans aucun effet → la
//                   modale ne se monte jamais → « Modale de confirmation
//                   introuvable » (on accusait la modale ; le coupable était le
//                   clic, qui n'avait rien déclenché).
//   onglet peint  : bouton 361×36, le même clic monte la modale.
// Parade : le background rend l'onglet visible pendant la suppression
// (paintTab), et la garde de peinture ci-dessous refuse tout clic sur un
// élément à 0×0.
//
// Markup de la modale relevé en réel (onglet peint) :
//   item-delete-modal--overlay, item-delete-modal,
//   item-delete-confirmation-button ("Confirmer et supprimer"),
//   item-delete-cancelation-button ("Annuler")
// → les sélecteurs du 2026-07-11 étaient corrects et le sont restés.
// SÉLECTEURS CONFIRMÉS en session réelle du 2026-07-11 (annonce
// /items/9376376044 réellement publiée puis supprimée) :
//   page annonce vendeur → button[data-testid="item-delete-button"]
//     ("Supprimer" — visible directement, avec item-edit-button,
//      item-hide-button, mark-as-sold-button, mark-as-reserved-button)
//   modale "Supprimer l'article" →
//     button[data-testid="item-delete-confirmation-button"]
//       ("Confirmer et supprimer")
//     button[data-testid="item-delete-cancelation-button"] ("Annuler")
//   après confirmation : redirection vers /member/<id> ; l'URL de l'annonce
//   sert ensuite une page "Page not found".
const DELETE_DRY_RUN = false;

// Clic de suppression : dans la fenêtre de travail invisible/minimisée,
// simulateFullClick (events synthétiques) ne déclenche PAS les handlers React
// → la modale de confirmation ne se monte jamais (bug re-vérifié 2026-07-17).
// On demande donc au background d'appeler DIRECTEMENT le props.onClick du
// bouton via les fibers (monde MAIN, même canal prouvé que le commit prix).
// ⚠️ NON VÉRIFIÉ en réel : simulateFullClick reste en repli (cas onglet peint /
// si le fiber-click échoue). Ne pas merger avant une suppression Vinted live OK.
async function deleteClickReact(el, trace) {
  const testid = el?.getAttribute?.("data-testid");
  if (testid) {
    const res = await askBackground({ type: "VINTED_FIBER_CLICK", selector: `[data-testid="${CSS.escape(testid)}"]` });
    if (res?.ok) {
      trace?.(`clic fiber onClick OK (${res.source ?? "?"}, niveau ${res.depth}, arg ${res.arg}) sur [data-testid="${testid}"]`);
      return true;
    }
    // Diagnostic remonté dans la trace (delete_trace du job) : c'est LUI qui, au
    // run RÉEL côté propriétaire, dira si le bouton porte un onClick React ou si
    // le handler est ailleurs / le contrôle n'est pas rendu (rect 0×0).
    const d = res?.diag;
    const diagStr = d ? ` | diag: rect=${d.rect?.w}x${d.rect?.h}, offsetParent=${d.offsetParent}, vis=${d.visibilityState}` : "";
    trace?.(`clic fiber KO — ${res?.reason ?? "pas de réponse"}${diagStr} — repli simulateFullClick`);
  }
  simulateFullClick(el);
  return false;
}

// Jeton CSRF Vinted : dans un <script> inline, en JSON échappé
// (\"csrf_token\":\"…\"). Relevé en direct le 2026-07-18. Repli meta.
// delete.csrf_token (migré au registre) : cascade pilotée par le CONTENU — le
// maillon 1 « résout » dès qu'il existe un script inline, c'est la regex sur
// textContent qui décide, et le repli meta ne joue que si AUCUN script ne
// porte le jeton. Irreprésentable par resolveSelector sans en changer le
// sens : les littéraux viennent du registre via selectorFor, le moteur reste
// ici. L'absence de jeton est un état GÉRÉ (needsUser / déjà supprimé), pas
// une anomalie de sélecteur.
async function extractVintedCsrfToken() {
  const S = await sel();
  for (const s of document.querySelectorAll(S.selectorFor("vinted", "delete.csrf_token", 0))) {
    const m = (s.textContent || "").match(/\\?"csrf[_-]?token\\?"\s*:\s*\\?"([^"\\]+)\\?"/i);
    if (m) return m[1];
  }
  const meta = document.querySelector(S.selectorFor("vinted", "delete.csrf_token", 1));
  return meta ? meta.getAttribute("content") : null;
}
function getVintedCookie(name) {
  const c = document.cookie.split("; ").find((x) => x.indexOf(name + "=") === 0);
  return c ? c.split("=").slice(1).join("=") : null;
}

// ── Sondes d'état (2026-07-21) ────────────────────────────────────────────────
// Nées d'un faux échec vécu : un article DÉJÀ supprimé fait servir sa page en
// 404 — une page d'erreur de ~18 Ko qui ne porte NI le script inline du jeton
// CSRF, NI de <meta name="csrf-token"> (Vinted n'en expose plus du tout,
// vérifié en direct). La requête partait alors SANS en-tête X-CSRF-Token, Vinted
// répondait 403, et on annonçait « session invalide, se reconnecter » sur une
// session parfaitement valide — pour une suppression qui avait en fait RÉUSSI.
// On ne devine plus : on demande à l'API.
async function vintedItemPresent(itemId, t) {
  try {
    const r = await fetch(`/api/v2/items/${itemId}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    t(`sonde article /api/v2/items/${itemId} → HTTP ${r.status}`);
    if (r.status === 404) return "absent";
    if (r.ok) return "present";
    return "inconnu";
  } catch (e) {
    t(`sonde article impossible : ${String(e?.message ?? e)}`);
    return "inconnu";
  }
}

// « Se reconnecter » ne doit être conseillé QUE si la session est réellement
// morte — c'est /users/current qui tranche, pas le code d'erreur du delete.
async function vintedSessionEtat(t) {
  try {
    const r = await fetch("/api/v2/users/current", {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    t(`sonde session /api/v2/users/current → HTTP ${r.status}`);
    if (r.status === 401) return "expiree";
    return r.ok ? "valide" : "inconnu";
  } catch (e) {
    t(`sonde session impossible : ${String(e?.message ?? e)}`);
    return "inconnu";
  }
}

// ── SUPPRESSION VINTED PAR API (2026-07-18) ───────────────────────────────────
// Le DOM ne peut PAS marcher en fenêtre de travail minimisée : le bouton
// "Supprimer" de Vinted n'obtient son handler React qu'après un VRAI scroll/paint
// (hydratation paresseuse à l'intersection) — impossible dans une fenêtre jamais
// rendue. PROUVÉ en direct : 5 s sans scroller → bouton 0×0 sans onClick ;
// window.scrollTo (programmatique) ne l'hydrate pas ; seul un vrai scroll molette
// le fait. On supprime donc par l'API — même origine, aucun DOM, 100% invisible,
// indépendant de l'état de la fenêtre. Requête relevée en direct sur le vrai
// flux (capture PerformanceObserver + patch XHR, tokens vérifiés par un PUT
// is_hidden qui a répondu 200) :
//   POST /api/v2/items/{id}/delete
//   X-CSRF-Token (script inline), X-Anon-Id (cookie anon_id), Accept/Content-Type JSON.
async function deleteListing(job) {
  const trace = [];
  const t = (line) => { trace.push(line); console.log(`[vinted][delete] ${line}`); };

  // Le background a navigué l'onglet de travail sur listing_url : on est sur la
  // page de l'annonce (même origine vinted.fr → cookies + tokens accessibles).
  if (!/\/items\/\d+/.test(location.pathname)) {
    return { success: false, error: `Page inattendue pour une suppression Vinted : ${location.href}`, trace };
  }
  const itemId = location.pathname.match(/\/items\/(\d+)/)?.[1];
  if (!itemId) {
    return { success: false, error: `Id d'annonce introuvable dans ${location.pathname}`, trace };
  }
  t(`page annonce ok : item ${itemId}`);

  const csrf = await extractVintedCsrfToken();
  const anonId = getVintedCookie("anon_id");
  t(`tokens : csrf=${csrf ? "ok" : "ABSENT"}, anon_id=${anonId ? "ok" : "ABSENT"}`);

  if (DELETE_DRY_RUN) {
    t("🧪 DELETE_DRY_RUN actif — endpoint prêt, AUCUN appel de suppression.");
    return { success: true, dryRun: true, found: true, trace };
  }

  // Jeton absent = on n'envoie RIEN. Envoyer quand même produisait un 403 qu'on
  // interprétait à contresens. Deux cas seulement, et on les distingue :
  //   · l'article n'existe plus  → la suppression est acquise (idempotent) ;
  //   · l'article existe encore  → page non hydratée, on le dit tel quel.
  if (!csrf) {
    if ((await vintedItemPresent(itemId, t)) === "absent") {
      t("article absent de l'API : il était DÉJÀ supprimé → suppression acquise");
      return { success: true, alreadyGone: true, trace };
    }
    return {
      success: false,
      needsUser: true,
      error:
        "Jeton CSRF Vinted introuvable sur la page (page 404 ou non hydratée) — " +
        "requête de suppression NON envoyée. L'annonce n'a pas été touchée.",
      trace,
    };
  }

  try {
    const resp = await fetch(`/api/v2/items/${itemId}/delete`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...(anonId ? { "X-Anon-Id": anonId } : {}),
      },
    });
    t(`API delete /api/v2/items/${itemId}/delete → HTTP ${resp.status}`);
    // 200/204 = supprimée ; 404 = déjà absente (idempotent) → succès.
    if (resp.ok || resp.status === 204 || resp.status === 404) {
      return { success: true, trace };
    }
    // 401/403 : refus. On ne conclut plus « session invalide » par réflexe — on
    // journalise le corps (c'est lui qui distingue un refus CSRF d'un blocage
    // anti-bot), puis on demande à l'API si l'article est encore là, et enfin si
    // la session est vraiment morte.
    if (resp.status === 401 || resp.status === 403) {
      const corps = (await resp.text().catch(() => "")).slice(0, 300);
      t(`corps du refus : ${corps || "(vide)"}`);

      if ((await vintedItemPresent(itemId, t)) === "absent") {
        t("article absent de l'API malgré le refus : suppression déjà effective");
        return { success: true, alreadyGone: true, trace };
      }

      const session = await vintedSessionEtat(t);
      return {
        success: false,
        needsUser: true,
        error:
          session === "expiree"
            ? `Suppression Vinted refusée (HTTP ${resp.status}) : session Vinted expirée. Se reconnecter à Vinted.`
            : `Suppression Vinted refusée (HTTP ${resp.status}) alors que la session est ${session} — ` +
              `refus CSRF ou protection anti-bot, PAS une déconnexion. Réponse : ${corps.slice(0, 120) || "(vide)"}`,
        trace,
      };
    }
    // Autre code : le background revérifie l'état réel (jamais de faux « deleted »).
    return {
      success: false,
      error: `Suppression Vinted : l'API a répondu HTTP ${resp.status}. Le background revérifie l'état réel de l'annonce.`,
      trace,
    };
  } catch (e) {
    return { success: false, error: `Suppression Vinted (appel API) : ${String(e?.message ?? e)}`, trace };
  }
}

// delete.card_button (migré au registre — scope + regex /^supprimer( l['’]
// annonce)?$/i désormais littéralisés dans vinted.registry.js). ⚠️ Fonction
// JAMAIS APPELÉE (code mort, grep 27/07 : aucune référence hors définition —
// la suppression Vinted passe par l'API depuis le 18/07) ; conservée à
// comportement identique (null si introuvable), reportFailure:false car un -1
// émis par du code mort serait un faux signal.
async function findDeleteByText() {
  const S = await sel();
  try {
    return S.resolveSelector("vinted", "delete.card_button", { reportFailure: false }).el;
  } catch (e) {
    if (e?.name === "SelectorResolutionError") return null;
    throw e;
  }
}

// waitFor local à la suppression (vinted.js n'avait que waitForElement, à
// sélecteur fixe — ici la condition est composée).
async function waitFor(fn, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = fn();
    if (value) return value;
    await sleep(150);
  }
  return null;
}

// ── Remplissage du formulaire ──────────────────────────────────────────────────

/**
 * @param {object} job — un job cross_post_jobs (colonnes réelles vérifiées en base) :
 *   { id, platform, title, description, price, photos, photo_option, platform_fields, inventaire_id }
 *   photos: [{ url, type }] — pas des File, il faut fetch() chaque url.
 *   platform_fields (vinted, vérifié sur des jobs réels) : { etat, marque, taille, matiere, categorie }
 *     - categorie est le libellé FillSell plat (ex: "Mode"), pas un chemin Vinted.
 *       Aucun mapping catégorie FillSell → chemin catalogue Vinted n'existe encore
 *       dans le projet (vérifié : ni ici, ni côté génération des jobs pour les
 *       autres plateformes). La sélection de catégorie ci-dessous n'est donc
 *       jamais déclenchée par les jobs actuels — elle est câblée en attente
 *       d'un futur `platform_fields.categoryPath` (tableau de labels dans l'ordre
 *       du chemin Vinted, ex: ["Femmes","Vêtements","Robes","Midi"]) sans rien
 *       inventer côté mapping. `colors` (tableau, 2 max, dominante d'abord) est
 *       fourni depuis 2026-07 par l'app (couleur IA → split → colors) ; seul
 *       `packageSize` reste sans source de donnée, câblé en best-effort.
 * @returns {Promise<{success: boolean, dryRun?: boolean, listingUrl?: string, error?: string}>}
 */
// ── Challenge anti-bot (DataDome) sur le DOM vivant (2026-07-30) ─────────────
// Copie locale d'estPageBotShieldLbc (leboncoin.js), ADR-03 (content scripts
// autonomes, duplication par copie). Vinted est bien derrière DataDome —
// vérifié le 2026-07-30 : la home pose un cookie `datadome` (Set-Cookie relevé
// en direct), même fournisseur que Leboncoin et Beebs. Mêmes adaptations que
// LBC :
//   · motif nu /datadome/ volontairement ÉCARTÉ : le tag JS DataDome est
//     embarqué sur les pages NORMALES, le mot apparaît hors de tout challenge ;
//   · formulaire de dépôt présent (champ titre) = pas de challenge ;
//   · l'iframe du challenge (geo.captcha-delivery.com) est décisive seule.
function estPageBotShieldVinted() {
  if (document.querySelector('iframe[src*="captcha-delivery"], iframe[src*="geo.captcha"]')) return true;
  if (document.querySelector('#title, [data-testid="title--input"]')) return false;
  const debut = String(document.documentElement?.innerHTML ?? "").slice(0, 4000);
  return /geo\.captcha|captcha-delivery|\bAre you a human\b|Vérification que vous n/i.test(debut);
}

async function fillListingForm(job) {
  console.log("[vinted] fillListingForm — job:", job.id, job.title, DRY_RUN ? "(DRY_RUN)" : "(LIVE)");

  // Challenge anti-bot testé AVANT le test de connexion (2026-07-30) : une
  // interception DataDome est servie SOUS LA MÊME URL (/items/new) sans champ
  // password — elle passait la garde de session puis échouait plus loin en
  // erreur quelconque, indistinguable d'une déconnexion ou d'un timeout.
  // Motif dédié, reconnaissable en SQL sur cross_post_jobs :
  //   error LIKE 'CHALLENGE DATADOME%'
  // Vérifié : ce libellé ne matche PAS TRANSIENT_JOB_ERROR_RE (background.js)
  // — un captcha ne déclenche jamais le ré-armement « transitoire », seulement
  // le needsUser borné classique (MAX_NEEDS_USER_RETRIES), comme la connexion.
  if (estPageBotShieldVinted()) {
    return {
      success: false,
      needsUser: true,
      error:
        "CHALLENGE DATADOME : Vinted affiche une vérification anti-robot à la place du " +
        "formulaire de dépôt. Ouvrir vinted.fr dans Chrome et résoudre la vérification " +
        "(l'onglet de travail est resté ouvert), le job repartira au prochain passage.",
    };
  }

  // Session : le background vient de naviguer l'onglet de travail sur
  // /items/new. Si Vinted a redirigé ailleurs (login, vérification) ou
  // affiche un formulaire d'authentification, on s'arrête AVANT tout
  // remplissage : needsUser (ré-armement borné côté background, jamais de
  // retry immédiat), aucune interaction sur une page de connexion.
  // auth.password_guard : clé OPTIONAL du registre, sémantique inversée —
  // la PRÉSENCE du champ mot de passe signifie « page de connexion » ⇒ needsUser.
  if (!location.pathname.startsWith("/items/new") || (await sel()).tryResolveSelector("vinted", "auth.password_guard")) {
    return {
      success: false,
      needsUser: true,
      error:
        "Connexion Vinted requise : se connecter sur vinted.fr dans Chrome " +
        "(l'onglet de travail est resté ouvert), le job repartira au prochain passage.",
    };
  }

  const fields = job.platform_fields || {};

  // ── Pont canal générique → champs dédiés (2026-07-18, ÉCRASANT 2026-07-19) ──
  // Un requis choisi dans le fallback « champs obligatoires » de l'app (ex.
  // « Espace de stockage ») ou tranché au mini-éditeur needs_user est écrit dans
  // platform_fields.vintedAspects sous le CODE SERVEUR (internal_memory_capacity,
  // condition, model…), PAS dans le champ dédié (fields.stockage, fields.etat…).
  // Or ces codes sont dans handledCodes : le loop générique plus bas les SAUTE
  // (pour ne pas doubler la pose des blocs dédiés). Le pont recopie donc vers le
  // champ dédié — et il ÉCRASE, toujours. La garde « seulement si le champ dédié
  // est vide » (version 2026-07-18) rendait la réponse d'un needs_user
  // structurellement inatteignable : le champ dédié portait justement la valeur
  // INVALIDE qui avait causé le needs_user (job c48be67a : fields.etat « Neuf
  // sans étiquette » hors catalogue Beauté → needs_user « État » → réponse
  // « Neuf avec étiquette » dans vintedAspects.condition jamais lue → même
  // needs_user en boucle infinie). Pour un code ponté, une valeur dans
  // vintedAspects ne peut venir QUE d'une décision utilisateur (stepper ou
  // mini-éditeur), toujours plus récente et plus fiable que la valeur d'origine
  // du job : elle prime, sans condition.
  const _va = fields.vintedAspects && typeof fields.vintedAspects === "object" ? fields.vintedAspects : {};
  const _bridge = {
    stockage: "internal_memory_capacity",
    modele: "model",
    etat: "condition",
    marque: "brand",
    matiere: "material",
    taille: "size",
    simlock: "sim_lock",
  };
  for (const [dedie, code] of Object.entries(_bridge)) {
    const v = String(_va[code] ?? "").trim();
    if (v) fields[dedie] = v;
  }
  // Couleur : cas à part du pont — fields.colors est un TABLEAU, pas une string.
  // « color » était le SEUL code de handledCodes (boucle générique plus bas)
  // sans AUCUN chemin de lecture : le bloc dédié ne lit que fields.colors, ce
  // pont l'excluait, la boucle générique le saute → une valeur écrite dans
  // vintedAspects.color (mini-éditeur needs_user, saisie manuelle du stepper)
  // tombait dans un trou et le needs_user « Couleur » revenait à l'identique,
  // sans issue (trou latent identifié en review du 2026-07-19 — latent car
  // aucune config attributes connue ne marque color required, mais fermé
  // AVANT qu'une catégorie inconnue ne l'ouvre). Valeur unique → tableau à un
  // élément, même format que le canal colors existant ; même règle d'écrasement
  // que le pont : la décision utilisateur prime sur les colors d'origine.
  const _color = String(_va.color ?? "").trim();
  if (_color) {
    fields.colors = [_color];
  }

  // Fallback explicite : sans chemin de catégorie, l'annonce ne peut pas être
  // publiée sur Vinted — on échoue AVANT de remplir quoi que ce soit, avec un
  // message actionnable. `vintedGenreRequired` (posé par l'app à la création
  // du job quand l'icône est un article de mode adulte) permet de distinguer
  // la vraie cause : genre manquant/Mixte vs icône hors mapping. Vinted n'a
  // aucun rayon Mixte (vérifié sur l'arbre complet) — pour la mode, seul un
  // rayon Femme/Homme est publiable.
  if (!fields.categoryPath?.length) {
    if (fields.vintedGenreRequired && (!fields.genre || fields.genre === "Mixte")) {
      return {
        success: false,
        error:
          "Genre requis pour cet article : c'est un article de mode et Vinted ne " +
          "propose que les rayons Femmes/Hommes (pas de Mixte). Choisir Femme ou " +
          "Homme dans les champs Vinted de l'app, puis régénérer le job.",
      };
    }
    if (fields.vintedGenreRequired && fields.genre === "Enfant") {
      return {
        success: false,
        error:
          "Article de mode en genre Enfant — rayon Enfants hors périmètre du " +
          "mapping actuel (Lot 1 = adultes). Prévu en Lot 2.",
      };
    }
    return {
      success: false,
      error:
        "platform_fields.categoryPath absent — article non mappé vers le catalogue Vinted " +
        "(icône hors périmètre du mapping, ou job antérieur au mapping). " +
        "Régénérer l'annonce depuis l'app, ou compléter src/utils/vintedCategories.js.",
    };
  }

  // Interstitiel éventuel à l'ARRIVÉE sur le formulaire (2026-07-26,
  // SELECTOR_AUDIT §9b : Vinted n'avait aucun dismiss pré-interaction) —
  // cookies, promo app… posés au chargement. Appelé ICI UNIQUEMENT, jamais
  // entre deux champs : les pickers Vinted (catalogue, marque…) sont des
  // dialogues légitimes qu'un dismiss en cours de flux pourrait fermer.
  await dismissInterstitials("arrivée sur le formulaire");

  const photoResult = job.photos?.length ? await uploadPhotos(job.photos) : null;
  if (job.title) await fillTextField('#title, [data-testid="title--input"]', job.title);
  if (job.description) await fillTextField('#description, [data-testid="description--input"]', job.description);

  await selectCategory(fields.categoryPath);

  // Dégradation propre : seule la CATÉGORIE (ci-dessus) reste bloquante —
  // sans elle rien n'est publiable. Tous les champs à choix fermé qui
  // suivent sautent avec un warning en cas de libellé introuvable, plutôt
  // que de faire échouer le job entier sur un détail.
  const warnings = [];
  if (photoResult?.duplicated) {
    warnings.push(
      `photos: ${job.photos.length} fournie(s), complétées à ${photoResult.count} par duplication ` +
      "(Vinted exige 3 photos minimum sur les marques premium)"
    );
  }
  if (photoResult?.photoNote) warnings.push(photoResult.photoNote);

  // Marque : catalogue d'abord, CRÉATION de la marque en repli — et plus
  // jamais de champ sauté (2026-07-29, job « Mela & Adorna » : marque hors
  // catalogue → champ laissé vide → 400 code 99 au dépôt, maquillé en refus
  // plateforme). selectVintedBrand LÈVE si même la création échoue : Vinted
  // refusera de toute façon un dépôt sans marque, autant échouer AVANT, avec
  // un message qui dit que c'est le handler qui n'a pas rempli le champ.
  if (fields.marque) {
    await selectVintedBrand(fields.marque, warnings);
  }

  // ── High-Tech (2026-07-13, relevé RÉEL du formulaire Téléphones portables —
  // échec 400 du job f69e319c : model / internal_memory_capacity / sim_lock
  // tous requis et jamais remplis) ────────────────────────────────────────────
  // ⚠️ Le champ Modèle (#model) n'EXISTE dans le DOM qu'après la pose de la
  // MARQUE (constaté : il apparaît à la sélection de Xiaomi) — ce bloc doit
  // rester APRÈS le bloc marque ci-dessus. Ses options n'ont PAS d'aria-label
  // (contrairement aux marques) : on matche par texte sur les fils --title.
  if (fields.modele) await selectVintedModel(fields.modele, warnings);
  // Espace de stockage : liste fermée (20 options relevées, 256 Mo → 4 To),
  // mêmes testids que état/matière → cascade standard.
  if (fields.stockage) {
    await selectClosedOptionSafe(
      "stockage",
      '#internal_memory_capacity, [data-testid="category-internal_memory_capacity-single-list-input"]',
      '[data-testid^="internal_memory_capacity-"]',
      fields.stockage,
      warnings
    );
  }
  // Simlockage : champ OBLIGATOIRE du formulaire téléphone (400 réel du job
  // f69e319c : « Sélectionne une valeur pour continuer »).
  // ⚠️ SÉMANTIQUE PIÉGEUSE, prouvée sur annonces réelles le 2026-07-13 : le
  // libellé porteur est « Simlockage » (Non = pas de simlock = désimlocké),
  // PAS le placeholder « L'appareil est-il désimlocké ? » — 4 annonces sur 5
  // dont la description dit « désimlocké » portent sim_lock="Non" (la 5e est
  // un vendeur piégé par cette ambiguïté de Vinted).
  // DÉFAUT ASSUMÉ : « Non » (= désimlocké), la quasi-totalité du marché FR de
  // l'occasion — indéductible d'une photo, donc jamais généré par l'IA.
  // fields.simlock ("Oui"/"Non") prime s'il est fourni un jour. Le bloc est
  // gaté sur la PRÉSENCE du champ dans le DOM : hors téléphone, il n'existe
  // pas et on ne tente rien.
  if (document.querySelector('#sim_lock, [data-testid="category-sim_lock-single-list-input"]')) {
    await selectClosedOptionSafe(
      "simlockage",
      '#sim_lock, [data-testid="category-sim_lock-single-list-input"]',
      '[data-testid^="sim_lock-"]',
      fields.simlock ?? "Non",
      warnings
    );
  }

  if (fields.taille) {
    // La grille Vinted affiche "42", pas "EU 42" (préfixe côté FillSell) —
    // on retire le préfixe, le match exact-par-segment fait le reste.
    await selectClosedOptionSafe(
      "taille",
      '#size, [data-testid="category-size-single-grid-input"]',
      '[data-testid^="size-group-"]',
      String(fields.taille).replace(/^EU\s*/i, ""),
      warnings,
      // Garde anti-nombre-nu : un « 3 » ne doit jamais matcher « 3 ans /
      // 98 cm » par contenance, ni « 36 mois » l'option adulte « 36 ».
      { sizeField: true }
    );
  }
  if (fields.etat) {
    await selectClosedOptionSafe(
      "état",
      '#condition, [data-testid="category-condition-single-list-input"]',
      '[data-testid^="condition-"]',
      fields.etat,
      warnings
    );
  }
  // platform_fields.colors : posé par l'app à l'insert — depuis le 2026-07-30
  // NORMALISÉ vers la palette fermée Vinted (vintedColors.js : libellés
  // exacts, 2 max). Absent sur les jobs anciens (valeur libre possible) et
  // quand rien ne se normalise (color_unmapped posé à la place).
  // Zéro couleur posée alors que le job en demandait → échec AVANT dépôt,
  // requêtable : error LIKE 'COULEUR INTROUVABLE%'. Laisser le champ vide
  // garantissait un 400 aveugle ("Le champ Couleur doit être renseigné",
  // job 243097d4, couleur "Argent" hors palette). Le retour porte le relevé
  // discoveredRequired (palette comprise) pour que le catalogue
  // platform_category_aspects apprenne malgré l'échec.
  if (fields.colors?.length) {
    const couleurPosee = await selectColors(fields.colors, warnings);
    if (!couleurPosee) {
      const requiredState = await computeVintedRequiredState().catch(() => ({ discovered: [] }));
      return {
        success: false,
        error:
          `COULEUR INTROUVABLE : aucune option du picker Vinted ne correspond à ` +
          `${JSON.stringify(fields.colors)}. Palette affichée par Vinted: ` +
          `${JSON.stringify(paletteCouleursRelevee ?? [])}. Corriger la couleur de ` +
          `l'article dans l'app puis relancer la publication.`,
        warnings,
        discoveredRequired: requiredState.discovered,
      };
    }
  }

  if (fields.matiere) {
    // Liste Vinted GLOBALE (55 options identiques toutes catégories,
    // vérifié sur Montres/T-shirts/Sacs) mais l'IA peut générer un composé
    // ("Résine et acier inoxydable") — c'est le cas d'origine de la cascade.
    await selectClosedOptionSafe(
      "matière",
      '#material, [data-testid="category-material-multi-list-input"]',
      '[data-testid^="material-"]',
      fields.matiere,
      warnings
    );
  }
  // ── Canal GÉNÉRIQUE (chantier champs obligatoires, 1.A/1.B) ────────────────
  // platform_fields.vintedAspects = { "<code serveur>": "valeur" } — posé par
  // l'app (saisie manuelle du stepper ou résolution IA) pour les requis SANS
  // champ dédié ci-dessus. Même philosophie que pf.ebayAspects sur eBay. Les
  // codes déjà servis par les blocs dédiés sont ignorés (jamais deux poses).
  const handledCodes = new Set([
    "brand", "model", "internal_memory_capacity", "sim_lock",
    "size", "condition", "color", "material",
  ]);
  if (fields.vintedAspects && typeof fields.vintedAspects === "object") {
    for (const [code, value] of Object.entries(fields.vintedAspects)) {
      const val = String(value ?? "").trim();
      if (!val || handledCodes.has(code)) continue;
      const label = VINTED_SERVER_FIELD_LABELS[code] ?? code;
      await selectClosedOptionSafe(
        label,
        vintedFieldSelector(code),
        `[data-testid^="${code}-"]`,
        val,
        warnings
      );
    }
  }

  if (job.price != null) await fillPriceField(job.price);

  // Format de colis — RÈGLE PRODUIT (Nico, 2026-07-12) : sur TOUTE la branche
  // Mode (vêtements ET chaussures), c'est TOUJOURS « Petit », sans exception.
  // ⚠️ Ne pas se fier au "défaut pré-coché" : Vinted pré-coche selon la
  // CATÉGORIE et met « Moyen » sur les chaussures (constaté sur l'annonce New
  // Balance de ce soir, colis parti en Moyen). On clique donc explicitement.
  // Hors Mode (le peu qui existe sur Vinted), aucune donnée de poids n'existe
  // dans le projet : on laisse le défaut de Vinted plutôt que de deviner.
  const isFashionJob =
    (job.platform_fields?.categorie ?? "") === "Mode" ||
    /^(femmes?|hommes?|enfants?|filles?|gar[çc]ons?)$/i.test(String(fields.categoryPath?.[0] ?? "")) ||
    Boolean(String(job.platform_fields?.taille ?? "").trim());
  const wantedPackage = fields.packageSize ?? (isFashionJob ? "Petit" : null);
  if (wantedPackage) await selectPackageSize(wantedPackage);

  // ── Constat des REQUIS avant tout verdict (chantier 2026-07-16, 1.C) ───────
  // Fini le `unfilledRequired: []` de constat : la config attributes capturée
  // par la sonde donne les requis EXACTS de la catégorie posée, croisés avec
  // les valeurs réellement présentes dans le DOM après remplissage.
  const requiredState = await computeVintedRequiredState().catch((e) => {
    console.warn("[vinted] computeVintedRequiredState en échec :", e?.message);
    // hadConfig:false → traité comme « non vérifiable » ci-dessous (needsUser),
    // plus jamais un {unfilled:[]} silencieux qui laissait cliquer à l'aveugle.
    return { discovered: [], unfilled: [], hadConfig: false };
  });

  // Gate par job (2026-07-11) : DRY_RUN global reste true par défaut ; un job
  // marqué platform_fields.live_run === true (test supervisé) publie vraiment.
  const dryRun = DRY_RUN && job.platform_fields?.live_run !== true;
  if (dryRun) {
    console.log(
      "[vinted] 🧪 DRY_RUN actif — formulaire rempli, publication NON déclenchée.",
      "\nJob:", job.id,
      "\nTitre:", job.title,
      "\nPrix:", job.price,
      "\nChamps plateforme:", fields,
      "\nRequis catégorie:", requiredState.discovered.filter((d) => d.required).map((d) => d.label).join(", ") || "(aucun relevé)",
      requiredState.unfilled.length ? `\n⚠️ Requis NON remplis: ${requiredState.unfilled.join(", ")}` : "\nTous les requis relevés sont remplis.",
      warnings.length ? `\nWarnings (${warnings.length}): ${warnings.map((w) => (typeof w === "string" ? w : w?.message)).join(" | ")}` : "\nAucun warning."
    );
    return {
      success: true,
      dryRun: true,
      warnings,
      unfilledRequired: requiredState.unfilled,
      discoveredRequired: requiredState.discovered,
    };
  }

  // ── Gate PRÉ-CLIC n°0 : requis NON VÉRIFIABLES (bug réel 2026-07-18).
  // Si la sonde n'a capté aucune config /attributes (hadConfig=false), on ne
  // peut PAS affirmer que les requis sont remplis — « Espace de stockage »
  // était introuvable et l'annonce est partie à blanc. On échoue honnêtement
  // (needsUser) plutôt que de cliquer à l'aveugle. Auto-réparable : relancer
  // ré-ouvre le formulaire et laisse la sonde re-capter la config.
  // ⚠️ Compromis assumé (règle produit « jamais un faux published ») : une
  // catégorie SANS aucun attribut serait bloquée à tort — cas rare sur les
  // rayons ciblés (mode/high-tech ont tous des attributs), et la relance est le
  // remède. On préfère ce faux-négatif à une publication fantôme.
  if (!requiredState.hadConfig) {
    return {
      success: false,
      needsUser: true,
      error:
        "Impossible de vérifier les champs obligatoires Vinted pour cette catégorie " +
        "(configuration non captée). Relance la publication — le formulaire sera rechargé.",
      warnings,
      discoveredRequired: requiredState.discovered,
    };
  }

  // ── Gate PRÉ-CLIC (règle produit du chantier) : un requis vide ne part
  // JAMAIS en silence. Le 400 serveur est certain (prouvé f69e319c) : cliquer
  // ne ferait qu'exposer un échec de plus à DataDome. needsUser explicite,
  // libellés humains exacts — l'app les présente en saisie manuelle.
  if (requiredState.unfilled.length) {
    // Options ACCEPTÉES par la catégorie (config attributes) annexées à chaque
    // requis vide : sans elles, l'erreur était inactionnable (cas réel Medik8
    // 18/07 — « État » vide alors que la Beauté n'accepte QUE « Neuf avec
    // étiquette » : la valeur « Très bon état » de l'app ne pouvait JAMAIS
    // matcher, et personne ne pouvait le savoir depuis le message).
    const labelWithOptions = (label) => {
      const d = requiredState.discovered.find((x) => x.label === label);
      const names = (d?.options ?? [])
        .map((o) => (typeof o === "string" ? o : o?.title ?? o?.value ?? ""))
        .filter(Boolean)
        .slice(0, 8);
      return names.length ? `${label} (accepte : ${names.join(" · ")})` : label;
    };
    // ── needsUserField (socle needs_user, 2026-07-19) : cas (a) — champ précis
    // identifié. On pose LE premier requis vide (un champ à la fois : après la
    // décision de l'utilisateur le job repart en pending, et un éventuel requis
    // suivant re-déclenchera ce même gate avec le champ d'après). Cible
    // d'écriture côté app : vintedAspects.<code serveur> — le pont _bridge
    // (l.399) recopie vers le champ dédié, le canal générique couvre le reste.
    const firstLabel = requiredState.unfilled[0];
    const firstMeta = requiredState.discovered.find((x) => x.label === firstLabel);
    const firstOptions = (firstMeta?.options ?? [])
      .map((o) => (typeof o === "string" ? o : o?.title ?? o?.value ?? ""))
      .filter(Boolean);
    return {
      success: false,
      needsUser: true,
      error:
        `Vinted exige des champs encore vides pour cette catégorie : ${requiredState.unfilled.map(labelWithOptions).join(", ")}. ` +
        "Compléter ces champs dans l'app (copie Vinted), puis relancer la publication.",
      warnings,
      unfilledRequired: requiredState.unfilled,
      discoveredRequired: requiredState.discovered,
      needsUserField: {
        field_key: firstMeta?.key ?? firstLabel,
        field_label: firstLabel,
        target: { root: "vintedAspects", key: firstMeta?.key ?? firstLabel },
        // input_type (2026-07-22, cf. beebs.js) : les requis Vinted relevés ici
        // viennent tous de la config `attributes` de la catégorie — ce sont des
        // listes fermées. Options absentes = relevé incomplet de notre part, pas
        // un champ libre. L'app doit REFUSER d'en faire une saisie texte.
        input_type: "dropdown",
        ...(firstOptions.length ? { allowed_values: firstOptions } : {}),
      },
    };
  }

  // Filet avant le clic (2026-07-11) : un panneau de dropdown resté ouvert
  // recouvre le bouton Publier et le clic part dans le vide, sans erreur.
  await closeAnyOpenDropdown();

  // Garde photos (2026-08-08, job 46e7dfc9) : preuve serveur que les N photos
  // sont ARRIVÉES avant de cliquer Publier — throw nommé sinon, jamais un 400
  // « Ajoute au moins une photo » après coup.
  // ⛔ SAUF sur une RECRÉATION (job.platform_fields.republish_recreation) :
  // l'annonce d'origine a déjà été supprimée, refuser de soumettre est alors
  // strictement pire que soumettre — cf. le bandeau de ensurePhotosLanded.
  if (photoResult) {
    const photoGardeNote = await ensurePhotosLanded(photoResult, "vinted", {
      bloquant: job.platform_fields?.republish_recreation !== true,
    });
    if (photoGardeNote) warnings.push(photoGardeNote);
  }

  // RE-VÉRIFICATION DU PRIX À L'INSTANT DU CLIC (bug réel 2026-07-18) — la vérif
  // faite pendant fillPriceField ne protège pas d'un re-render survenu DEPUIS
  // (choix format de colis, refetch /attributes…) qui a pu vider la prop `value`
  // pendant que l'affichage restait correct. On relit l'état React et on
  // re-commit si besoin ; si le prix est définitivement perdu, ensurePriceCommitted
  // throw → job failed honnête, AUCUN clic avec price: null.
  if (job.price != null) await ensurePriceCommitted(job.price);

  // publish.submit (migré au registre — criticité red, clé SANS fallback, §8
  // de l'audit ; l'assert du registre — visible au sens getComputedStyle +
  // enabled — s'applique désormais avant le clic).
  const publishBtn = await waitForKey("publish.submit");
  publishBtn.click();
  await sleep(2500);

  // Modale "Ajoute des photos à cette annonce" (marques premium, < 3 photos) :
  // uploadPhotos complète désormais toujours à 3, mais si Vinted durcit sa
  // règle, on la DÉTECTE au lieu de croire à une publication réussie — le job
  // repart en needsUser plutôt qu'en published fantôme.
  // publish.field_dialog_headers (migré au registre) : lecture de détection —
  // une liste vide (page déjà en cours de redirection) est tolérée comme avant,
  // on avale la SelectorResolutionError sans télémétrie d'échec (reportFailure:
  // false : l'absence de tout h2/h3/dialog ici n'est pas un sélecteur cassé).
  let enTetes = [];
  try {
    enTetes = (await sel()).resolveSelectorAll("vinted", "publish.field_dialog_headers", { reportFailure: false }).els;
  } catch (e) {
    if (e?.name !== "SelectorResolutionError") throw e;
  }
  const photoModal = enTetes.some((el) => /ajoute des photos à cette annonce/i.test(el.textContent || ""));
  if (photoModal) {
    return {
      success: false,
      needsUser: true,
      error:
        "Vinted refuse la publication : « Ajoute des photos à cette annonce » (minimum imposé sur " +
        "les marques premium). Ajouter des photos à l'annonce dans l'app, puis régénérer le job.",
      warnings,
    };
  }

  // ⚠️ PREUVE DE PUBLICATION (2026-07-12) — le trou noir du run de ce soir.
  // AVANT : on retournait `success: true` juste après le clic, sans rien
  // vérifier. Quand Vinted REFUSAIT le formulaire (validation : « Le champ prix
  // doit être supérieur ou égal à 1.0 »), le job partait quand même en
  // "published" — annonce inexistante, listing_url vide ("aucune URL capturée"),
  // et pire : une annonce fantôme entrait dans le poll de détection de vente.
  // Vérifié en base ce soir : 2 jobs Vinted "published" (Xiaomi, New Balance)
  // alors que la garde-robe Vinted ne contient NI l'un NI l'autre.
  // MAINTENANT : on ne conclut au succès que sur une PREUVE — la redirection
  // vers la page de l'annonce (/items/<id>) — et on remonte le message de
  // validation exact quand Vinted refuse.
  const proof = await waitForPublishOutcome();
  if (proof.error) {
    // La sonde réseau dit ce que Vinted a REÇU (et répondu) — c'est elle qui
    // tranchera si le prix part à 0/null malgré un champ correctement affiché.
    //
    // Refus 400 : les errors[{field,value}] parsées par la sonde sont les
    // requis que NI le DOM NI la config attributes n'avaient révélés (cas
    // fondateur : model). Traduits en libellés humains et remontés
    // STRUCTURÉS (serverRequired) : le background les persiste au catalogue
    // (source server_400) et les pose sur platform_fields du job pour la
    // saisie manuelle côté app.
    const serverErrors = await readServerValidationErrors().catch(() => null);
    if (serverErrors?.length) {
      const attrs = await readLatestAttrsConfig().catch(() => []);
      const titleOf = (field) =>
        attrs.find((a) => a.code === field)?.title ??
        VINTED_SERVER_FIELD_LABELS[field] ??
        field;
      const serverRequired = serverErrors.map((e) => ({
        key: e.field,
        label: titleOf(e.field),
        message: e.value,
      }));
      const details = serverRequired.map((f) => `${f.label} (${f.key})`).join(", ");
      return {
        success: false,
        error: `${proof.error} — Champs exigés par le serveur Vinted : ${details}.`,
        warnings,
        serverRequired,
        discoveredRequired: requiredState.discovered,
      };
    }
    return { success: false, error: proof.error, warnings, discoveredRequired: requiredState.discovered };
  }
  return { success: true, listingUrl: proof.listingUrl, warnings, discoveredRequired: requiredState.discovered };
}

// Après le clic Publier, Vinted fait l'un des QUATRE (le 4e découvert en réel
// le 2026-07-13, job 32a47b4e) :
//   1. redirige vers /items/<id> (succès — preuve n°1) ;
//   2. reste sur le formulaire et affiche une/des erreurs de validation ;
//   3. rame (upload photos, anti-bot) — on laisse du temps avant de conclure ;
//   4. PUBLIE (HTTP 200, item créé) mais affiche une modale à la place de la
//      redirection (after_upload_actions: ["show_item_verification_modal"]) —
//      l'annonce 9386838630 était réellement en ligne pendant que le job
//      partait en failed « aucune redirection ». D'où la preuve n°2 : la
//      RÉPONSE SERVEUR capturée par la sonde (item.id + code:0 + HTTP 200),
//      qui donne aussi l'URL sans attendre aucune navigation.
async function waitForPublishOutcome(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastValidation = null;

  while (Date.now() < deadline) {
    const m = location.pathname.match(/^\/items\/(\d+)/);
    if (m) return { listingUrl: location.origin + location.pathname };

    const served = await readProbeSuccess();
    if (served) {
      // Fermeture best-effort de la modale post-publication pour laisser
      // l'onglet de travail propre — le succès est déjà acquis, on ne le
      // conditionne à rien de visuel.
      await closePostPublishModal();
      return { listingUrl: served.listingUrl };
    }

    const validation = readValidationErrors();
    if (validation) lastValidation = validation;

    await sleep(1000);
  }

  if (lastValidation) {
    return {
      error:
        `Vinted a REFUSÉ la publication : ${lastValidation} — l'annonce n'a PAS été créée. ` +
        "(Le formulaire est resté sur /items/new.)",
    };
  }
  return {
    error:
      "Publication Vinted non confirmée : aucune redirection vers la page de l'annonce après " +
      `${timeoutMs / 1000} s, et aucun message d'erreur lisible. L'annonce n'a PAS été considérée ` +
      "comme publiée (le statut ne sera pas 'published' sans preuve).",
  };
}

// Preuve n°2 : la sonde réseau (monde MAIN, posée par le background) a capturé
// la réponse du POST /api/v2/item_upload/items. HTTP 200 + code:0 + item.id ⇒
// l'annonce EXISTE, quelle que soit la suite visuelle (modale, redirection
// lente…). Les captures portent la réponse en texte tronqué : on extrait par
// motif, pas de parse strict.
async function readProbeSuccess() {
  const res = await askBackground({ type: "VINTED_PROBE_CAPTURES" });
  const captures = Array.isArray(res?.captures) ? res.captures : [];
  for (let i = captures.length - 1; i >= 0; i--) {
    const c = captures[i];
    if (Number(c?.status) !== 200) continue;
    if (!/item_upload\/items/i.test(String(c?.url ?? ""))) continue;
    const body = String(c?.reponse ?? "");
    const idMatch = body.match(/"item"\s*:\s*\{\s*"id"\s*:\s*(\d+)/);
    if (idMatch && /"code"\s*:\s*0\b/.test(body)) {
      return { listingUrl: `${location.origin}/items/${idMatch[1]}` };
    }
  }
  return null;
}

// Modale post-publication (show_item_verification_modal & consorts) : on tente
// les fermetures classiques du design system Vinted, sans jamais échouer — si
// la modale reste, l'onglet de travail sera de toute façon re-navigué au
// prochain job (et le succès est déjà rapporté).
async function closePostPublishModal() {
  try {
    // offsetParent est null en fenêtre minimisée (aucun layout) : on prendrait
    // toujours « aucune modale ». On prend la première du DOM — best-effort.
    // publish.post_publish_modal (migré au registre) : chaîne à 3 ÉTAGES SCOPÉS
    // (conteneur → bouton de fermeture DANS le conteneur → repli tous boutons),
    // PAS une cascade de fallbacks du même élément — resolveSelector ne
    // s'applique pas sans en changer le sens ; les littéraux viennent du
    // registre via selectorFor, absence de modale tolérée comme avant.
    const S = await sel();
    const dialog = document.querySelector(S.selectorFor("vinted", "publish.post_publish_modal", 0));
    if (!dialog) return;
    const closer =
      dialog.querySelector(S.selectorFor("vinted", "publish.post_publish_modal", 1)) ??
      Array.from(dialog.querySelectorAll(S.selectorFor("vinted", "publish.post_publish_modal", 2))).find((b) =>
        /^(plus tard|non merci|fermer|ok|compris|continuer)$/i.test((b.textContent || "").trim())
      );
    if (closer) {
      simulateFullClick(closer);
      await humanPause();
    }
  } catch { /* best-effort assumé */ }
}

// Messages de validation du formulaire Vinted.
// ⚠️ NE PAS FILTRER PAR VOCABULAIRE (leçon du 2026-07-12). La 1re version exigeait
// que le texte contienne « doit/obligatoire/requis/supérieur/… » — or les messages
// les plus DÉCISIFS de Vinted n'emploient AUCUN de ces mots :
//     « Ajoute au moins une photo »      → MASQUÉ
//     « Choisis une sous-catégorie »     → MASQUÉ
//     « Le champ prix doit être supérieur ou égal à 1.0 » → remonté
// Résultat : sur un refus, on ne remontait QUE l'erreur de prix et on accusait le
// prix… alors que la vraie cause pouvait être la photo ou la catégorie. Vérifié
// sur le VRAI formulaire : un formulaire sans catégorie affiche l'erreur
// « prix ≥ 1.0 » MÊME quand le prix a été tapé au clavier par un humain — ce
// message est donc un SYMPTÔME, pas un diagnostic. On remonte tout, désormais.
function readValidationErrors() {
  const nodes = document.querySelectorAll(
    '[data-testid*="error"], [class*="error"], [role="alert"], .web_ui__InputBar__error'
  );
  const seen = new Set();
  for (const n of nodes) {
    const txt = (n.textContent || "").trim();
    if (!txt || txt.length > 200) continue;
    seen.add(txt);
  }
  return seen.size ? [...seen].join(" · ") : null;
}

// ── Helpers génériques ─────────────────────────────────────────────────────────

// ── Timers non throttlés (fix campagne de test 2026-07-08) ──────────────────
// L'onglet de travail est TOUJOURS en arrière-plan en production (créé
// active:false par le background) : Chrome clampe alors les setTimeout de la
// page à 1/s, puis 1/min après 5 min cachée (intensive throttling) — un
// remplissage passait à >10 min, au-delà des 120 s de sendMessageToTab côté
// background (échec systématique constaté). Les timers des dedicated workers
// ne subissent pas ce clamp : le délai court dans le worker, la page ne fait
// que recevoir le postMessage. Un setTimeout page reste armé en parallèle
// (premier arrivé gagne) : filet si le CSP de la plateforme bloque les blob
// workers — on retombe alors sur la lenteur d'origine, jamais sur un blocage.
const __timerWorker = (() => {
  try {
    const blob = new Blob(["onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)"], { type: "application/javascript" });
    const w = new Worker(URL.createObjectURL(blob));
    w.onerror = () => {};
    return w;
  } catch {
    return null;
  }
})();
const __timerCallbacks = new Map();
let __timerSeq = 0;
if (__timerWorker) {
  __timerWorker.onmessage = (e) => {
    const cb = __timerCallbacks.get(e.data);
    __timerCallbacks.delete(e.data);
    cb?.();
  };
}
function sleep(ms) {
  return new Promise((resolve) => {
    let done = false;
    const id = __timerWorker ? ++__timerSeq : null;
    const finish = () => {
      if (done) return;
      done = true;
      if (id != null) __timerCallbacks.delete(id);
      resolve();
    };
    if (id != null) {
      __timerCallbacks.set(id, finish);
      __timerWorker.postMessage({ id, ms });
    }
    setTimeout(finish, ms);
  });
}

// ── Timing humain (fix blocage anti-bot 2026-07-09) ─────────────────────────
// Un blocage "Accès temporairement restreint" ("vous surfez et cliquez à une
// vitesse surhumaine") a été déclenché sur Leboncoin par un remplissage
// instantané. Deux signaux de bot évidents, présents sur les 4 handlers :
//   - valeur posée en UNE fois (setter natif + event "input"), aucune séquence
//     clavier — un champ de 60 caractères se remplissait en 0 ms ;
//   - rythme mécanique : exactement CLICK_DELAY (250 ms) entre chaque action.
// On remplace donc les délais fixes par des tirages aléatoires (humanPause) et
// la pose de valeur en bloc par une frappe caractère par caractère (typeHuman)
// encadrée de keydown/keypress/keyup.
//
// ⚠️ Tous les délais passent par sleep() — donc par le timer Web Worker non
// clampé ci-dessus. Le timing humain reste ainsi valide dans un onglet caché,
// où setTimeout serait bridé à 1/s (et où 200 caractères à 165 ms coûteraient
// 200 s au lieu de 33 s). Ne JAMAIS remplacer ces sleep() par des setTimeout.
const HUMAN_CHAR_MIN = 80, HUMAN_CHAR_MAX = 250;
const HUMAN_ACTION_MIN = 300, HUMAN_ACTION_MAX = 900;
// Au-delà de ce seuil (description générée : plusieurs centaines de
// caractères), la frappe caractère par caractère coûterait des minutes et
// ferait exploser le budget de sendMessageToTab. On insère alors par blocs
// espacés d'une pause humaine — ce que fait de toute façon un vendeur qui
// colle un texte puis le relit, et qui reste très loin du "tout en une fois".
const HUMAN_TYPE_MAX_CHARS = 120;
const HUMAN_CHUNK_CHARS = 40;

const randInt = (min, max) => Math.round(min + Math.random() * (max - min));
const humanPause = (min = HUMAN_ACTION_MIN, max = HUMAN_ACTION_MAX) => sleep(randInt(min, max));

// Événements clavier synthétiques : ils n'insèrent aucun texte (c'est
// setNativeValue/execCommand qui le fait) mais ils donnent aux écouteurs de la
// page la séquence qu'une vraie frappe produit. Untrusted (isTrusted=false),
// comme tous nos events — on ne cherche pas à tromper une détection qui
// inspecte isTrusted, seulement à ne plus émettre un profil de frappe absurde.
function dispatchKey(el, type, char) {
  el.dispatchEvent(new KeyboardEvent(type, {
    key: char, bubbles: true, cancelable: true, composed: true,
  }));
}

// Frappe humaine dans un input/textarea React. ⚠️ Ne PAS utiliser sur un champ
// à masque de saisie (prix Vinted) : la concaténation sur el.value relit une
// valeur déjà reformatée par la page (bug "NaN €", cf. fillPriceField).
async function typeHuman(el, text) {
  el.focus();
  setNativeValue(el, "");
  const str = String(text);

  if (str.length <= HUMAN_TYPE_MAX_CHARS) {
    for (const char of str) {
      dispatchKey(el, "keydown", char);
      dispatchKey(el, "keypress", char);
      setNativeValue(el, el.value + char);
      dispatchKey(el, "keyup", char);
      await sleep(randInt(HUMAN_CHAR_MIN, HUMAN_CHAR_MAX));
    }
    return;
  }
  for (let i = 0; i < str.length; i += HUMAN_CHUNK_CHARS) {
    const chunk = str.slice(i, i + HUMAN_CHUNK_CHARS);
    dispatchKey(el, "keydown", chunk[0]);
    setNativeValue(el, el.value + chunk);
    dispatchKey(el, "keyup", chunk[chunk.length - 1]);
    await humanPause();
  }
}

// Attend qu'un élément apparaisse dans le DOM (pages SPA à rendu différé).
// `target` : sélecteur CSS, ou fonction-sonde () => Element|null (clés du
// registre — cf. waitForKey) ; `label` ne sert qu'au message d'erreur.
function waitForElement(target, timeoutMs = 10_000, label = undefined) {
  const probe = typeof target === "function" ? target : () => document.querySelector(target);
  const desc = label ?? (typeof target === "function" ? "sonde de clé" : target);
  return new Promise((resolve, reject) => {
    let observer = null;
    let timer = null;
    const settle = (fn, value) => {
      if (observer) observer.disconnect();
      if (timer) clearTimeout(timer);
      fn(value);
    };
    const check = () => {
      let el = null;
      try {
        el = probe();
      } catch (e) {
        settle(reject, e); // erreur de configuration de la sonde : jamais avalée
        return true;
      }
      if (el) {
        settle(resolve, el);
        return true;
      }
      return false;
    };
    if (check()) return;
    observer = new MutationObserver(() => {
      check();
    });
    timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Élément introuvable: ${desc}`));
    }, timeoutMs);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// Certains champs (ex: #brand) semblent dépendre de la catégorie tout juste
// choisie (les IDs "suggested-brand-*" du rapport DOM varient par catégorie) :
// React peut remonter/remplacer ce nœud juste après la fermeture du popup
// Catégorie. waitForElement renvoie le PREMIER nœud trouvé, qui peut être sur
// le point d'être détaché — cliquer dessus ne produit alors aucun effet
// visible, sans lever d'exception. On vérifie que le nœud trouvé est encore
// le même après une courte pause avant de le considérer "stable" à cliquer.
async function waitForStableElement(selector, timeoutMs = 5000, settleMs = 200) {
  const start = Date.now();
  let el = await waitForElement(selector, timeoutMs);
  while (Date.now() - start < timeoutMs) {
    await sleep(settleMs);
    const again = document.querySelector(selector);
    if (again === el) return el; // même nœud avant/après la pause : stable
    el = again || (await waitForElement(selector, timeoutMs - (Date.now() - start)));
  }
  return el;
}

// Attend qu'un élément disparaisse du DOM ou devienne invisible (offsetParent
// null — couvre le cas où Vinted le laisse monté mais masqué pendant
// l'animation de fermeture). `target` : sélecteur CSS ou fonction-sonde
// () => Element|null (clés du registre). Ne rejette jamais : au pire on attend
// le timeout puis on continue, pour ne pas bloquer indéfiniment si l'hypothèse
// de sélecteur est fausse pour un champ donné.
function waitForElementGone(target, timeoutMs = 3000) {
  const probe = typeof target === "function" ? target : () => document.querySelector(target);
  const isGone = () => {
    const el = probe();
    return !el || el.offsetParent === null;
  };
  return new Promise((resolve) => {
    if (isGone()) return resolve(true);
    const observer = new MutationObserver(() => {
      if (isGone()) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(true);
      }
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeoutMs);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
}

// Assigne une valeur à un input/textarea contrôlé par React en déclenchant
// le setter natif + les events "input"/"change", sinon le state React ne voit rien.
function setNativeValue(element, value) {
  const proto = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

// Confirmé par test réel : element.click() natif est bien tenté sur #brand
// (nœud stable, isConnected) mais n'ouvre pas le panneau — contrairement à
// #category où click() suffit. Certains composants React n'écoutent pas
// l'event "click" haut niveau mais pointerdown/mousedown (pattern courant
// pour les listbox/combobox afin de gérer focus et fermeture au clic
// extérieur sans race condition). On rejoue la séquence bas niveau complète
// qu'un vrai clic souris génère, dans l'ordre, avec des coordonnées réalistes.
function simulateFullClick(element) {
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const base = { bubbles: true, cancelable: true, composed: true, view: window, clientX, clientY, button: 0 };

  element.dispatchEvent(new PointerEvent("pointerdown", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
  element.focus();
  element.dispatchEvent(new PointerEvent("pointerup", { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
  element.dispatchEvent(new MouseEvent("click", base));
}

async function fillTextField(selector, value) {
  const el = await waitForElement(selector);
  await typeHuman(el, value);
  el.blur();
  await humanPause();
}

async function fillPriceField(value) {
  // Prix = champ texte à masque monétaire live (virgule + €), pas type="number".
  //
  // ⚠️ HISTORIQUE — deux pièges successifs, le second constaté en PUBLICATION
  // RÉELLE le 2026-07-11 :
  //   1. typeHuman concatène sur el.value, que Vinted reformate à la volée →
  //      chaîne invalide ("NaN €"). D'où l'ancienne pose en un coup.
  //   2. Mais setNativeValue NE SUFFIT PAS : il n'émet qu'un Event("input")
  //      générique, sans inputType ni data. Le masque de Vinted ne met alors
  //      pas à jour SON état interne — le champ AFFICHE bien "200,00 €" mais
  //      la soumission est refusée avec « Le champ prix doit être supérieur
  //      ou égal à 1.0 » (constaté sur l'annonce 9376376044 : publication
  //      bloquée jusqu'à une frappe clavier manuelle).
  // Fix : document.execCommand("insertText") — la seule voie qui produit un
  // vrai InputEvent (inputType/data), comme leboncoin.js (typeInto/
  // setFieldValue) sur ses inputs React.
  //
  // ⚠️ EN UN SEUL APPEL, jamais caractère par caractère : testé en réel le
  // 2026-07-11, une frappe char-by-char via execCommand redonne "NaN €" —
  // le masque reformate le champ après CHAQUE insertion et le caret se
  // retrouve au mauvais endroit, donc les caractères suivants s'insèrent dans
  // la valeur déjà formatée. Une insertion unique sur une sélection totale
  // laisse le masque formater une fois : "200" → "200,00 €" (vérifié).
  // L'exception au timing humain reste assumée (un prix fait 2-4 caractères,
  // ce n'est pas le signal de vitesse qui a déclenché le blocage LBC).
  //
  // ⚠️⚠️ SÉPARATEUR DÉCIMAL — le masque attend un POINT et rend « NaN € » sur
  // toute VIRGULE. MESURÉ sur le formulaire réel le 2026-08-05 :
  //     "5"    → 5,00 €        "5,0"  → NaN €
  //     "5.0"  → 5,00 €        "5,00" → NaN €
  //     "12.5" → 12,50 €       "12,5" → NaN €
  //     "7.99" → 7,99 €
  // Le code faisait exactement l'INVERSE : String(value).replace(".", ",").
  // Ça ne se voyait pas tant que les prix étaient ENTIERS — aucun point à
  // remplacer, "200" partait intact. La première valeur DÉCIMALE l'a révélé :
  // la republication rejoue le prix relevé sur Vinted ("5.0", une CHAÎNE), d'où
  // « NaN € », recréation refusée, et l'annonce laissée supprimée (job
  // 9bd4839e, 05/08). ⚠️ Le même trou avalait une publication NORMALE à
  // 7,50 € — ce n'était pas propre à la republication.
  const n = Number(String(value ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) {
    // JAMAIS de valeur non finie dans le champ : on ne saisit RIEN et on nomme
    // le problème. Un « NaN € » posé ici ne se voit qu'au clic Publier.
    throw new Error(`Prix inutilisable (reçu : ${JSON.stringify(value)}) — aucune saisie tentée dans le champ prix.`);
  }
  // toFixed(2) : point décimal garanti, jamais de séparateur de milliers.
  const str = n.toFixed(2);

  // Saisie complète, ré-exécutable telle quelle (le nœud peut être remonté par
  // React entre deux poses : on le re-résout à chaque appel).
  const typeIntoPrice = async () => {
    // status.price_input : clé NON migrée dans cette passe — le MÊME littéral
    // vit aussi côté background.js (readVintedPriceState/commitVintedPrice via
    // executeScript, hors périmètre vinted.js). Migrer ici seulement
    // dupliquerait la source de vérité ; à faire d'un bloc avec le background.
    const el = await waitForElement('#price, [data-testid="price-input--input"]');
    await humanPause();
    el.focus();
    let ok = false;
    try {
      el.setSelectionRange?.(0, el.value.length);
      document.execCommand("delete", false, null); // vide le champ ET son masque
      await humanPause();
      el.setSelectionRange?.(0, el.value.length);
      dispatchKey(el, "keydown", str[0]);
      ok = document.execCommand("insertText", false, str);
      dispatchKey(el, "keyup", str[str.length - 1]);
    } catch (e) {
      console.warn("[vinted] ⚠️ prix : execCommand indisponible —", String(e?.message ?? e));
    }
    if (!ok) {
      // Repli historique : pose la valeur mais Vinted REFUSE la soumission
      // (« Le champ prix doit être supérieur ou égal à 1.0 ») — la garde
      // ci-dessous ne le verra pas (l'affichage est correct), le clic Publier
      // échouera. Ce repli n'existe que si execCommand disparaît de Chrome.
      console.warn("[vinted] ⚠️ prix : repli setNativeValue — la validation Vinted risque de refuser la soumission");
      setNativeValue(el, str);
    }
    // 'change' natif + el.blur() (focusout réel). ⚠️ RÉVISION 2026-07-13 (lecture
    // des fibers React sur le vrai formulaire) : le blur n'est PAS le point de
    // commit — quand le composant fonctionne, onChange committe SEUL (l'état
    // React porte déjà "95" avant tout blur) et le blur ne fait que FORMATER
    // l'affichage ("95" → "95,00 €"). Le blur réel reste : inoffensif, fidèle au
    // geste humain, et il quitte réellement le champ (l'ancien Event('blur')
    // synthétique ne retirait même pas le focus).
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
    await sleep(800); // laisser un éventuel commit différé se propager
    await humanPause();
    return el;
  };

  let el = await typeIntoPrice();

  // Vérification immédiate : le champ doit afficher un montant non nul et
  // SANS NaN. C'est cette garde qui a attrapé le "NaN €" de la frappe
  // char-by-char en test réel — sans elle, le job serait parti jusqu'au clic
  // Publier pour échouer là-bas, sans message exploitable.
  const shown = String(el.value ?? "");
  if (/nan/i.test(shown) || !/[1-9]/.test(shown)) {
    throw new Error(
      `Prix non pris en compte par Vinted (champ = "${shown}") — la saisie du champ masqué a été rejetée.`
    );
  }

  // ── PREUVE DE COMMIT (2026-07-13) — l'affichage MENT. ────────────────────────
  // Prouvé en run réel (sonde réseau) puis reproduit en session pilotée : le
  // champ peut afficher « 95,00 € » avec un état React VIDE à tous les niveaux
  // (lecture des fibers) — la soumission part alors avec price: null. La
  // catégorie est HORS DE CAUSE (T-shirts et Baskets se comportent à
  // l'identique, testé croisé sur le vrai formulaire) ; le mode défaillant est
  // lié à l'état focus/peinture du document (même famille que le throttling
  // React de l'onglet caché documenté sur eBay). Seul l'état React fait foi, et
  // il n'est lisible que depuis le monde MAIN → on le demande au background.
  //
  // ⚠️ HISTORIQUE des escalades (2026-07-13), les deux prouvées en réel :
  //   v1 repose+onglet peint → ÉCHEC (job c7e10631 : paintTab ne produit aucun
  //      événement, et la lecture « au plus haut » prenait un niveau d'affichage
  //      pour le formulaire — d'où l'exigence de niveau BRUT ci-dessous) ;
  //   v2 clics trusted chrome.debugger → a commité (job 32a47b4e) mais bandeau
  //      « débogage » global non supprimable : invendable en production.
  // v3 — appel DIRECT de props.onChange du composant prix via les fibers
  // (monde MAIN, côté background) : prouvé en session pilotée dans les
  // conditions exactes de l'échec (onglet caché, hasFocus=false, zéro CDP) —
  // le niveau formulaire passe à la valeur brute, signature du mode sain.
  // Invisible, sans permission supplémentaire, Chrome par défaut.
  await ensurePriceCommitted(value);
}

// Vérifie que le prix est bien dans l'ÉTAT RÉACT (pas seulement affiché) et le
// re-commit via props.onChange (fibers) si l'état l'a perdu. Extraite de
// fillPriceField pour être appelable DEUX fois : après la saisie ET juste AVANT
// le clic Publier. Raison (bug réel 2026-07-18, iPhone) : entre la saisie et le
// clic, une interaction (choix du format de colis, refetch /attributes…) peut
// re-render le composant prix en onglet caché et REPOSER sa prop `value` à
// undefined pendant que le DOM garde l'affichage « 1 200,00 € » — le POST part
// alors sans prix (200 mais annonce jamais créée). Une seule vérif après saisie
// ne le voyait pas ; on re-vérifie donc à l'instant du clic.
// `state.readable` faux (fibers illisibles) → on ne peut ni confirmer ni
// infirmer : comportement historique conservé (pas de blocage sur illisible ici
// — c'est le garde-fou systémique de l'objectif 3 qui tranchera ce cas).
async function ensurePriceCommitted(value) {
  // Même normalisation que fillPriceField : la valeur re-commitée par
  // props.onChange doit avoir la forme que le masque accepte (POINT décimal),
  // sinon on réinjecterait le « NaN € » qu'on vient de corriger.
  const expected = Number(String(value ?? "").trim().replace(",", "."));
  if (!Number.isFinite(expected) || expected <= 0) {
    throw new Error(`Prix inutilisable (reçu : ${JSON.stringify(value)}) — commit du prix abandonné.`);
  }
  const str = expected.toFixed(2);
  const committedOk = (s) =>
    Array.isArray(s?.levels) &&
    s.levels.some((v) => {
      if (!v || /€/.test(String(v))) return false; // niveau d'affichage formaté : ne prouve rien
      const n = parseFloat(String(v).replace(",", "."));
      return Number.isFinite(n) && Math.abs(n - expected) < 0.005;
    });
  let state = await askBackground({ type: "VINTED_PRICE_STATE" });
  if (!state?.readable || committedOk(state)) return; // illisible (inchangé) ou déjà bon
  console.warn("[vinted] ⚠️ prix affiché mais NON commité dans l'état React — commit direct par props.onChange (fibers)");
  const commit = await askBackground({ type: "VINTED_COMMIT_PRICE", value: str });
  if (!commit?.ok) {
    console.warn("[vinted] ⚠️ commit direct refusé :", commit?.reason ?? "réponse nulle");
  }
  await sleep(1000); // laisser le re-render propager la prop value
  state = await askBackground({ type: "VINTED_PRICE_STATE" });
  if (state?.readable && !committedOk(state)) {
    throw new Error(
      `Prix jamais commité dans l'état React du formulaire ` +
      `(niveaux fibers [${(state?.levels ?? []).map((v) => `"${v}"`).join(", ")}], ` +
      `commit direct : ${commit?.ok ? "ok" : commit?.reason ?? "échec"}) — job arrêté AVANT le ` +
      "clic Publier (sinon Vinted recevrait price: null et refuserait)."
    );
  }
  if (state?.readable) console.log("[vinted] prix (re)commité par props.onChange :", state.levels);
}

// Messages vers le background (lecture des fibers React en monde MAIN, peinture
// temporaire de l'onglet). Résilient : background plus ancien ou message inconnu
// → null, et l'appelant continue comme avant (aucune régression possible).
function askBackground(msg) {
  try {
    return chrome.runtime.sendMessage(msg).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

// ── LE PANNEAU SE DÉDUIT DU DÉCLENCHEUR (2026-08-05, relevé en direct) ───────
// Vinted nomme le popup d'un champ d'après le champ lui-même : c'est le
// data-testid du déclencheur, « -input » remplacé par « -content ». Relevé sur
// /items/new, SIX familles différentes, toutes vérifiées 0 fermé → 1 ouvert :
//   catalog-select-dropdown-input        → catalog-select-dropdown-content
//   brand-select-dropdown-input          → brand-select-dropdown-content
//   color-select-dropdown-input          → color-select-dropdown-content
//   category-size-single-grid-input      → category-size-single-grid-content
//   category-condition-single-list-input → category-condition-single-list-content
//   category-material-multi-list-input   → category-material-multi-list-content
//
// C'est CE motif qui manquait au correctif précédent (8e6cf8b) : il ne
// couvrait que la famille « -dropdown- », d'où une catégorie qui passait et
// une Taille/un État qui restaient vides — le formulaire partait incomplet et
// Vinted les réclamait. Un sélecteur global ne peut pas marcher : « -content »
// nu attrape aussi size-banner-info-banner--content ou condition-6--content.
//
// Dérivé À L'EXÉCUTION, donc valable pour tout champ conditionnel futur sans
// une ligne de plus. Un data-testid ne dépend pas du hash de build : c'est ce
// qui rend cette sonde durable là où une classe ne l'est pas.
// Repli (déclencheur sans data-testid) : la chaîne du registre.
function panneauDuDeclencheur(trigger) {
  const tid = trigger?.getAttribute?.("data-testid") ?? "";
  if (!/-input$/.test(tid)) return null;
  const sel = `[data-testid="${tid.replace(/-input$/, "-content")}"]`;
  return () => document.querySelector(sel);
}

// Sonde du DERNIER panneau ouvert par openDropdown. confirmDropdownIfNeeded et
// closeAnyOpenDropdown s'en servent en priorité : sans elle, elles retombaient
// sur la sonde générique du registre, aveugle aux familles grid/list — un
// panneau Matière ou Taille resté ouvert recouvrait le bouton « Ajouter ».
let dernierPanneauProbe = null;

async function openDropdown(triggerSelector) {
  const S = await sel();
  // Filet de sécurité : si le panneau précédent (ex: Catégorie) n'a pas fini
  // de se fermer, cliquer le trigger suivant tout de suite peut rater le clic
  // ou ouvrir/refermer le mauvais panneau. Ce cas est censé être déjà réglé
  // par l'attente dans confirmDropdownIfNeeded ; ceci est redondant mais
  // gratuit (no-op si le panneau est déjà absent).
  await waitForElementGone(dernierPanneauProbe ?? dropdownPanelProbe(S), 2000);
  // waitForStableElement : certains champs (ex: #brand, dont les suggestions
  // dépendent de la catégorie tout juste choisie — ids "suggested-brand-*" du
  // rapport DOM) peuvent être remontés par React juste après la fermeture de
  // Catégorie. Cliquer le tout premier nœud trouvé risque de cliquer un nœud
  // sur le point d'être détaché.
  // ⏳ C'est AUSSI l'attente des champs CONDITIONNELS : Taille, État, Couleur
  // et Matière n'existent dans le DOM qu'une fois la catégorie choisie
  // (vérifié : sur formulaire vierge, seul catalog-select-dropdown-input est
  // présent ; brand/color n'apparaissent qu'après la feuille de catégorie).
  // waitForStableElement les attend au lieu de conclure « champ absent ».
  const trigger = await waitForStableElement(triggerSelector);
  // ⏳ LOADER DE CHAMP (2026-08-06, job f9861e8a « Jean Zara », recréation) :
  // sur une page neuve, un dropdown peut être encore en CHARGEMENT — Vinted
  // pose data-testid="<champ>--loader" à côté du trigger (relevés au moment
  // de l'échec : brand-select-dropdown--loader ET color-select-dropdown--loader
  // présents pendant que le code cliquait). Un dropdown en loader ne s'ouvre
  // PAS : les 6 clics de clickUntilPanelOpens partaient dans le vide et
  // l'erreur accusait le panneau. Même famille que la course de session Beebs
  // du matin : agir avant la fin de l'hydratation. On attend donc LA FIN DU
  // LOADER DE CE CHAMP (dérivé du data-testid du trigger, -input → --loader,
  // même convention que panneauDuDeclencheur) avec un timeout borné — jamais
  // un comptage de tentatives à l'aveugle. Timeout atteint : on tente le clic
  // quand même (loader orphelin possible), clickUntilPanelOpens reste juge —
  // et son diagnostic liste déjà les testids, loaders compris.
  const tidTrigger = trigger?.getAttribute?.("data-testid") ?? "";
  if (/-input$/.test(tidTrigger)) {
    const loaderSel = `[data-testid="${tidTrigger.replace(/-input$/, "--loader")}"]`;
    if (document.querySelector(loaderSel)) {
      console.log(`[vinted] ${loaderSel} présent — attente de la fin du chargement du champ`);
      if (!(await waitForElementGone(loaderSel, 15_000))) {
        console.warn(`[vinted] ⚠️ ${loaderSel} toujours présent après 15 s — clic tenté quand même`);
      }
    }
  }
  const probe = panneauDuDeclencheur(trigger) ?? dropdownPanelProbe(S);
  dernierPanneauProbe = probe;
  // Certains composants (confirmé sur #brand) ne sont pas immédiatement
  // réactifs juste après la fermeture du popup précédent : le premier clic
  // (séquence bas niveau pointerdown/mousedown/pointerup/mouseup/click) peut
  // ne rien ouvrir alors même que le nœud est stable et sans exception. Plutôt
  // qu'un délai fixe deviné avant le clic, on attend le résultat qui compte
  // réellement — le panneau ouvert — et on réessaie tant qu'il ne l'est pas.
  const opened = await clickUntilPanelOpens(trigger, { probe });
  if (!opened) {
    // PREUVE DOM DANS LE MESSAGE (2026-08-05). Ce message a coûté deux heures
    // et deux annonces : il nommait le sélecteur ABSENT et rien d'autre, alors
    // que la cause était que Vinted venait de renommer la classe du panneau
    // (migration CSS Modules d'InputDropdown, classe hachée par build). Le
    // panneau s'ouvrait à chaque clic et se refermait au suivant, invisible.
    // On dit maintenant ce qui EST là, pas seulement ce qui manque : le
    // renommage suivant se lira directement dans cross_post_jobs.error.
    const testids = [...document.querySelectorAll('[data-testid*="dropdown" i]')]
      .map((e) => e.getAttribute("data-testid")).slice(0, 8);
    const classes = [...new Set(
      [...document.querySelectorAll('[class*="dropdown" i]')]
        .flatMap((e) => [...e.classList]).filter((c) => /dropdown/i.test(c))
    )].slice(0, 6);
    // Message court + annexe sur err.diagnostic (2026-08-06, convention
    // last_diagnostic — le job f9861e8a portait ces listes en entier dans
    // cross_post_jobs.error). La PREUVE DOM ne disparaît pas : elle change de
    // canal. Les catchers non bloquants (warnings) gardent un e.message lisible.
    const err = new Error(
      `Le clic sur ${triggerSelector} n'a pas ouvert de panneau après plusieurs tentatives.`
    );
    err.diagnostic =
      `openDropdown(${triggerSelector}): panneau attendu ${S.selectorFor("vinted", "publish.dropdown_panel")} jamais vu. ` +
      `data-testid « dropdown » présents : ${JSON.stringify(testids)} ; ` +
      `classes « dropdown » présentes : ${JSON.stringify(classes)}.`;
    throw err;
  }
  await humanPause();
  return trigger;
}

// `probe` = sonde du panneau de CE champ (panneauDuDeclencheur). Sans elle on
// retombe sur la sonde générique du registre — ce qui a produit l'échec du
// 05/08 : chaque clic ouvrait puis refermait un panneau que la sonde ne voyait
// pas, six fois de suite, et l'erreur disait « n'a pas ouvert de panneau »
// alors qu'il s'ouvrait parfaitement.
async function clickUntilPanelOpens(trigger, { attempts = 6, perAttemptMs = 300, probe = null } = {}) {
  const S = await sel();
  const panneau = probe ?? dropdownPanelProbe(S);
  for (let i = 0; i < attempts; i++) {
    simulateFullClick(trigger);
    const opened = await waitForElement(panneau, perAttemptMs, "vinted/publish.dropdown_panel").catch(() => null);
    if (opened) return true;
  }
  return false;
}

// Confirmé par test réel sur Catégorie : cliquer la feuille (rond radio) ne
// ferme PAS le popup, il faut ensuite cliquer "Fait" pour valider et fermer.
// Comportement des autres popups à liste unique (État, Matière...) non
// vérifié — on tente ce clic partout par prudence : no-op si le bouton
// n'existe pas pour ce champ (ex: Marque semble se fermer seule au clic sur
// une option, à confirmer). Recherche document-wide par texte exact : un
// seul popup est ouvert à la fois, pas de risque de collision.
// publish.done_button (migré au registre — texte ^Fait$ sans flag i, fidèle à
// l'ancienne comparaison stricte). L'absence du bouton est NOMINALE ici
// (panneaux multi-sélection sans « Fait ») mais la clé n'est pas optional au
// registre (l'audit ne portait pas cette note) : on préserve le comportement
// historique (null) en avalant SelectorResolutionError, et reportFailure:false
// pour ne pas émettre un faux -1 à chaque panneau qui n'a pas de « Fait ».
async function findDoneButton() {
  const S = await sel();
  try {
    return S.resolveSelector("vinted", "publish.done_button", { reportFailure: false }).el;
  } catch (e) {
    if (e?.name === "SelectorResolutionError") return null;
    throw e;
  }
}

// Valide ET FERME le panneau. Le "Fait" n'existe pas partout (Matière/Couleur
// en multi-sélection n'en ont pas) : après le clic éventuel, on GARANTIT que
// le panneau a disparu (closeAnyOpenDropdown → clic extérieur complet), sinon
// il recouvre le bouton Publier — bug constaté en publication réelle du
// 2026-07-11.
async function confirmDropdownIfNeeded() {
  const doneBtn = await findDoneButton();
  if (!doneBtn) {
    await closeAnyOpenDropdown();
    return;
  }
  doneBtn.click();
  // Attente active de la fermeture réelle du panneau plutôt qu'un délai
  // fixe : hypothèse confirmée par test réel — le clic sur #brand juste
  // après "Fait" (250 ms fixes) tombait sur la modale Catégorie encore en
  // train de se démonter, #brand-search-input n'apparaissait jamais.
  if (!(await waitForElementGone(dernierPanneauProbe ?? dropdownPanelProbe(await sel()), 3000))) {
    await closeAnyOpenDropdown(); // "Fait" cliqué mais panneau récalcitrant
  }
  await humanPause();
}

// Match exact d'abord (texte entier, ou segment pour les grilles de taille
// type "M / 38 / 10"), includes() en repli seulement. Sans ça, "Bon état"
// sélectionne "Très bon état" (premier dans la liste) et la taille "S"
// matche "XS / 34 / 6" — textes d'options confirmés par inspection DOM.
// TOUS les candidats d'un libellé, exacts d'abord (2026-08-06) : un libellé
// peut exister en PLUSIEURS exemplaires dans le panneau (job 68420b37 :
// « Femmes » à la fois en suggestion catalog-suggestion-1904 ET en racine
// d'arbre) — ne rendre que le premier interdisait au caller de préférer le
// bon. `exclude` écarte des nœuds AVANT le matching (les suggestions, pour la
// cascade catégorie). Les deux options sont inertes pour les callers
// historiques : sans exclude ni lecture au-delà de [0], comportement inchangé.
function findOptionMatches(root, optionSelector, text, { exactOnly = false, exclude = null } = {}) {
  const options = Array.from(root.querySelectorAll(optionSelector))
    .filter((o) => !exclude || !exclude(o));
  // \s+ → " " : mêmes espaces insécables que dans la cascade (cf.
  // normalizeFuzzy — « 128 Go » du DOM porte U+00A0, prouvé job 7b67d67f).
  const normalize = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const target = normalize(text);
  const exacts = options.filter(
    (o) =>
      normalize(o.textContent) === target ||
      o.textContent.split("/").some((part) => normalize(part) === target)
  );
  if (exacts.length) return exacts.map((el) => ({ el, stage: "exact" }));
  if (exactOnly) return [];
  return options
    .filter((o) => normalize(o.textContent).includes(target))
    .map((el) => ({ el, stage: "includes" }));
}

function findOptionMatch(root, optionSelector, text, opts = {}) {
  return findOptionMatches(root, optionSelector, text, opts)[0] ?? null;
}

function findOptionByText(root, optionSelector, text) {
  return findOptionMatch(root, optionSelector, text)?.el ?? null;
}

async function waitForOptionByText(optionSelector, text, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = findOptionByText(document, optionSelector, text);
    if (found) return found;
    await sleep(80);
  }
  throw new Error(`Option "${text}" introuvable pour ${optionSelector}`);
}

// ── Matching en cascade pour les champs à choix fermé (matière, état,
// taille, couleur) : l'IA génère du texte libre qui ne colle pas toujours
// aux options Vinted (cas réel : "Résine et acier inoxydable" alors que la
// liste ne propose que "Acier"). Cascade, du plus sûr au plus permissif :
//   1. exact — texte entier ou segment "/" (grilles de taille)
//   2. option ⊂ valeur, en MOTS ENTIERS, accents ignorés — la plus longue
//      option contenue gagne ("acier" trouvé dans "résine et acier
//      inoxydable" ; les mots entiers évitent que "Or" matche "bORdeaux")
//   2bis. valeur ⊂ option, en mots entiers — l'option la plus COURTE gagne
//      ("Unique" → "Taille unique", cas réel de la grille taille des
//      montres, qui liste des diamètres + "Taille unique"). Sans danger
//      pour "Bon état"/"Très bon état" : l'exact passe toujours avant.
//   3. composants — la valeur est éclatée sur "et"/","/"&"/"+"/"/" et
//      chaque composant repasse par 1 puis 2/2bis ("Résine" seul, etc.)
// Retourne { el, label, stage } ou null — le caller décide de skipper. ──
// ⚠️ ESPACES NORMALISÉS (2026-07-13, job 7b67d67f — prouvé par relevé de
// codes) : les options Vinted à valeur numérique portent une ESPACE
// INSÉCABLE entre nombre et unité — « 128 Go » du DOM est
// 0031 0032 0038 00A0 0047 006F (U+00A0), jamais égal au « 128 Go » (espace
// normale) généré par l'IA. Aucun étage de la cascade ne matchait → champ
// stockage sauté → refus 400 Vinted (internal_memory_capacity). \s couvre
// U+00A0 et U+202F : les deux côtés de la comparaison passent par ici.
const normalizeFuzzy = (s) =>
  s.replace(/\s+/g, " ").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function containsAsWords(hay, needle) {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(hay);
}

// ── Garde anti-nombre-nu (2026-07-15, chantier tailles enfant) ──────────────
// Sur un champ TAILLE uniquement (opts.sizeField) : la grille enfant Vinted
// est une chaîne combinée qui CONTIENT des nombres nus (« 3 ans / 98 cm » ⊃
// « 3 ») et les tailles adultes/pointures sont des nombres nus CONTENUS dans
// ces chaînes. Sans garde, la cascade peut poser une taille FAUSSE en
// silence dans les deux sens. Règle : pour un nombre nu, seul l'EXACT fait
// foi (l'exact-par-segment « M / 38 / 10 » reste un exact) — tout match par
// CONTENANCE dont le côté contenu est purement numérique est rejeté (champ
// laissé vide avec warning, jamais faux). Les autres champs sont inchangés.
const PURE_NUMBER_RE = /^\d+(?:[.,]\d+)?$/;

function findOptionCascade(root, optionSelector, text, { sizeField = false } = {}) {
  const options = Array.from(root.querySelectorAll(optionSelector))
    .map((el) => ({ el, label: el.textContent.trim(), norm: normalizeFuzzy(el.textContent) }))
    .filter((o) => o.norm);
  if (!options.length) return null;
  const target = normalizeFuzzy(text);

  // 1. exact (texte entier ou segment de grille)
  const exact = options.find(
    (o) => o.norm === target || o.label.split("/").some((p) => normalizeFuzzy(p) === target)
  );
  if (exact) return { ...exact, stage: "exact" };

  const sizeGuardOk = (contained) => !sizeField || !PURE_NUMBER_RE.test(contained);

  const optionInTarget = (t) =>
    options
      .filter((o) => containsAsWords(t, o.norm) && sizeGuardOk(o.norm))
      .sort((a, b) => b.norm.length - a.norm.length)[0];

  // 2. option contenue dans la valeur (mots entiers, option la plus longue)
  const fuzzy = optionInTarget(target);
  if (fuzzy) return { ...fuzzy, stage: "fuzzy" };

  // 2bis. valeur contenue dans une option (mots entiers, option la plus
  // courte = la plus proche de la valeur) : "unique" → "Taille unique"
  const targetInOption = (t) =>
    options
      .filter((o) => containsAsWords(o.norm, t) && sizeGuardOk(t))
      .sort((a, b) => a.norm.length - b.norm.length)[0];
  const inverse = targetInOption(target);
  if (inverse) return { ...inverse, stage: "fuzzy-inverse" };

  // 3. composant par composant ("Résine et acier inoxydable" → "résine",
  // "acier inoxydable")
  const components = target.split(/\s+et\s+|[,&+/]/).map((c) => c.trim()).filter(Boolean);
  if (components.length > 1) {
    for (const comp of components) {
      if (sizeField && PURE_NUMBER_RE.test(comp)) continue; // fragment numérique nu : jamais fiable pour une taille
      const compExact = options.find((o) => o.norm === comp);
      if (compExact) return { ...compExact, stage: "composant" };
      const compFuzzy = optionInTarget(comp) || targetInOption(comp);
      if (compFuzzy) return { ...compFuzzy, stage: "composant" };
    }
  }
  return null;
}

async function waitForOptionCascade(optionSelector, text, timeoutMs = 5000, opts = {}) {
  const start = Date.now();
  let lastOptions = [];
  while (Date.now() - start < timeoutMs) {
    const found = findOptionCascade(document, optionSelector, text, opts);
    if (found) return found;
    lastOptions = Array.from(document.querySelectorAll(optionSelector))
      .map((o) => o.textContent.trim()).filter(Boolean);
    if (lastOptions.length) break; // options rendues mais aucun match : inutile d'attendre
    await sleep(80);
  }
  throw new Error(
    `Option "${text}" sans correspondance (même approximative) pour ${optionSelector}. ` +
    `Options Vinted: ${JSON.stringify(lastOptions.slice(0, 60))}`
  );
}

// Referme proprement un panneau resté ouvert après un échec de sélection —
// sans ça, le champ suivant échouerait en cascade (openDropdown attendrait
// la disparition d'un panneau qui ne se ferme jamais).
// Ferme un panneau de dropdown resté ouvert.
//
// ⚠️ Le panneau MATIÈRE (multi-sélection, pas de bouton "Fait") reste OUVERT
// après le clic sur une option — constaté en publication RÉELLE le 2026-07-11,
// il recouvrait le formulaire et le clic suivant sur "Ajouter" partait dans le
// vide. Les trois voies ont été testées sur la vraie page :
//   - document.body.click()  → NE FERME PAS. C'est le bug d'origine : un
//     .click() nu n'émet QUE l'event "click", sans pointerdown/mousedown — or
//     c'est sur ceux-là que Vinted branche sa détection de "clic extérieur".
//   - KeyboardEvent Escape synthétique (document / panneau / activeElement)
//     → NE FERME PAS (Vinted ignore les events clavier non trusted ; l'Échap
//     qui marchait en test manuel était une vraie frappe, hors de portée d'un
//     content script).
//   - séquence souris COMPLÈTE (simulateFullClick) sur un élément EXTÉRIEUR au
//     panneau → FERME. C'est la seule voie qui marche.
async function closeAnyOpenDropdown() {
  const S = await sel();
  // Sonde du dernier panneau ouvert d'abord : la générique du registre ne voit
  // que la famille « -dropdown- » et laissait donc un panneau Taille, État ou
  // Matière ouvert par-dessus le formulaire (mesuré le 05/08).
  const panneau = dernierPanneauProbe ?? dropdownPanelProbe(S);
  if (!panneau()) { dernierPanneauProbe = null; return; }

  const done = await findDoneButton();
  if (done) {
    done.click();
    if (await waitForElementGone(panneau, 2000)) {
      await humanPause();
      return;
    }
  }

  // Clic extérieur RÉALISTE : un élément qui n'est ni dans le panneau ni un
  // champ (le titre du formulaire fait un point de sortie neutre), avec la
  // séquence pointer/mouse complète.
  const panel = panneau();
  const outside = Array.from(document.querySelectorAll("h1, h2, header"))
    .find((el) => el.offsetParent !== null && !panel?.contains(el)) ?? document.body;
  simulateFullClick(outside);
  await waitForElementGone(panneau, 2000);
  // La sonde vise UN champ précis : la garder après fermeture ferait échouer
  // le filet d'entrée d'openDropdown sur le champ suivant (il attendrait la
  // disparition d'un panneau qui n'est déjà plus le sien).
  dernierPanneauProbe = null;
  await humanPause();
}

async function selectSimpleOption(triggerSelector, optionSelector, optionText, { searchInputSelector } = {}) {
  await openDropdown(triggerSelector);
  let optionTimeout = 5000;
  if (searchInputSelector) {
    // Le champ de recherche est rendu APRÈS l'ouverture du menu : l'attendre
    // activement. Avant : querySelector immédiat → null → toute la saisie
    // était sautée en silence, la liste restait sur "Marques populaires" et
    // l'option cherchée ne pouvait jamais apparaître, quel que soit le
    // polling en aval.
    const search = await waitForElement(searchInputSelector, 5000).catch(() => null);
    if (search) {
      // Frappe caractère par caractère : une assignation unique n'émet qu'un
      // seul event "input", pas toujours suffisant pour déclencher le debounce
      // de recherche Vinted. Depuis 2026-07-09 le rythme est humain (typeHuman,
      // 80–250 ms/caractère + keydown/keyup) au lieu des 40 ms fixes.
      await typeHuman(search, optionText);
      optionTimeout = 10000;
    }
  }
  // waitForOptionByText re-scanne le DOM toutes les 80 ms jusqu'au timeout —
  // c'est lui qui absorbe debounce + réseau + re-render, sans délai fixe.
  const option = await waitForOptionByText(optionSelector, optionText, optionTimeout);
  await humanPause(); // temps de "lecture" de la liste avant le clic
  option.click();
  await humanPause();
  await confirmDropdownIfNeeded();
}

// ── Marque : catalogue d'abord, création en repli (2026-07-29), « Sans
// marque » natif (2026-08-08) ─────────────────────────────────────────────────
// Cas réel (job du 29/07 23h18, « Mela & Adorna ») : marque absente du
// catalogue → l'option aria-label ne matche jamais → champ vide → 400 code 99
// au dépôt. Or Vinted PERMET de créer une marque. Séquence PROUVÉE en session
// réelle le 2026-07-29 sur /items/new (catégorie Robes d'été) :
//   1. frappe du nom COMPLET dans #brand-search-input ;
//   2. le panneau rend une ligne « Utiliser "X" comme marque »
//      (#custom-select-brand — role=button, SANS aria-label ni data-testid,
//      d'où une clé DÉDIÉE du registre, hors du sélecteur aria-label du
//      catalogue) ;
//   3. clic sur la ligne : elle DISPARAÎT (la sélection est enregistrée côté
//      React) mais #brand reste vide ;
//   4. « Fait » (confirmDropdownIfNeeded) : c'est la FERMETURE du panneau qui
//      commite la valeur dans #brand — jamais le clic seul. Vérif post
//      obligatoire sur #brand.value.
// JAMAIS de repli générique ou « Autre » : la marque est créée telle que
// détectée.
//
// ⚠️ « Sans marque » (panne du 08/08, jobs cad96961/577b371d) : sur CE terme,
// Vinted ne rend JAMAIS la ligne de création — il substitue sa ligne NATIVE
// #empty-brand (clé publish.no_brand_option ; les deux lignes sont
// EXCLUSIVES). L'attendre était un timeout garanti, et le job entier mourait
// sur un champ que Vinted sait remplir nativement. D'où :
//   · valeur ≈ « Sans marque » → chemin natif DIRECT (selectVintedNoBrand) ;
//   · toute autre marque : catalogue → création → et en REPLI ULTIME le
//     « Sans marque » natif, SIGNALÉ dans warnings — un sélecteur fragile ne
//     coûte plus l'annonce entière (doctrine du 08/08). L'annonce part alors
//     sans marque affichée : moins bien référencée, mais EN LIGNE, et le
//     warning dit quoi corriger à la main.
// Échec de TOUT (natif compris) = throw (le job échoue AVANT soumission) — un
// dépôt au champ Marque vide finit en 400 déguisé en refus plateforme.
const SANS_MARQUE_RE = /^\s*(?:sans\s+marque|no\s+brand|aucune(?:\s+marque)?|unbranded)\s*$/i;

// Ligne native « Sans marque » du picker : frappe du terme dans la recherche
// (c'est la recherche qui la fait apparaître), clic — COMMIT IMMÉDIAT prouvé
// le 08/08 (panneau fermé + #brand.value posé sur le seul clic, pas de
// « Fait »). confirmDropdownIfNeeded reste en filet : no-op panneau fermé.
async function selectVintedNoBrand(trigger) {
  await closeAnyOpenDropdown();
  await openDropdown(trigger);
  const search = await waitForElement("#brand-search-input", 5000);
  await typeHuman(search, "Sans marque");
  const opt = await waitForKey("publish.no_brand_option", { timeoutMs: 8000 });
  await humanPause(); // temps de "lecture" avant le clic, comme partout
  opt.click();
  await humanPause();
  await confirmDropdownIfNeeded();
  const input = document.querySelector(trigger);
  if (!(input?.value ?? "").trim()) {
    throw new Error("la ligne native « Sans marque » a été cliquée mais #brand est resté vide");
  }
}

async function selectVintedBrand(marque, warnings) {
  const trigger = '#brand, [data-testid="brand-select-dropdown-input"]';
  // « Sans marque » demandé par l'app : chemin natif direct — inutile de
  // chercher au catalogue (pas d'aria-label sur #empty-brand) et la création
  // ne se rend jamais sur ce terme.
  if (SANS_MARQUE_RE.test(marque)) {
    try {
      await selectVintedNoBrand(trigger);
      return;
    } catch (e) {
      await closeAnyOpenDropdown();
      const err = new Error(
        "Le champ Marque n'a pas pu être posé sur « Sans marque » (option native du picker Vinted " +
        "introuvable). Publication interrompue AVANT le dépôt — ce n'est PAS un refus Vinted, " +
        "l'annonce n'a pas été soumise."
      );
      err.diagnostic =
        `Marque "Sans marque" (native #empty-brand) : ${e.message}` +
        `${e.diagnostic ? ` — ${e.diagnostic}` : ""}`;
      throw err;
    }
  }
  // 1er essai — marque du catalogue (comportement historique inchangé) :
  // sections "Marques populaires" (id="brand-XXX") et "Suggestions"
  // (id="suggested-brand-XXX"), aria-label = nom exact dans les deux
  // (flag "i" : insensible à la casse).
  try {
    await selectSimpleOption(
      trigger,
      `[role="button"][aria-label="${CSS.escape(marque)}" i]`,
      marque,
      { searchInputSelector: "#brand-search-input" }
    );
    return;
  } catch (e) {
    console.warn(`[vinted] marque "${marque}" absente du catalogue (${e.message}) — repli : création de la marque`);
  }
  try {
    // selectSimpleOption vient d'échouer en laissant le panneau OUVERT avec la
    // recherche déjà tapée : la ligne de création est en général déjà rendue —
    // on la prend telle quelle. waitForKey porte la télémétrie observatoire.
    let custom = null;
    try {
      custom = await waitForKey("publish.custom_brand_option", { timeoutMs: 3000 });
    } catch { /* panneau refermé ou état incertain : on rejoue proprement */ }
    if (!custom) {
      await closeAnyOpenDropdown();
      await openDropdown(trigger);
      const search = await waitForElement("#brand-search-input", 5000);
      await typeHuman(search, marque);
      custom = await waitForKey("publish.custom_brand_option", { timeoutMs: 8000 });
    }
    await humanPause(); // temps de "lecture" avant le clic, comme partout
    custom.click();
    await humanPause();
    await confirmDropdownIfNeeded(); // « Fait » — c'est LUI qui commite #brand
    // Vérif post : le champ Marque ne doit JAMAIS rester vide à la soumission.
    const input = document.querySelector(trigger);
    if (!(input?.value ?? "").trim()) {
      throw new Error("la ligne de création a été cliquée mais #brand est resté vide après fermeture du panneau");
    }
    const note = `marque: "${marque}" absente du catalogue Vinted — créée via « Utiliser "${marque}" comme marque »`;
    console.warn(`[vinted] ${note}`);
    warnings.push(note);
  } catch (e) {
    await closeAnyOpenDropdown();
    // REPLI ULTIME (doctrine du 08/08) : catalogue ET création ont échoué —
    // plutôt que d'avorter la publication entière sur un sélecteur fragile,
    // on pose le « Sans marque » NATIF et on le dit dans warnings. L'annonce
    // part en ligne ; l'utilisateur peut corriger la marque à la main.
    try {
      await selectVintedNoBrand(trigger);
      const message =
        `marque: "${marque}" impossible à poser (introuvable au catalogue ET création en échec : ${e.message}) — ` +
        "annonce publiée en « Sans marque » (natif Vinted), marque à corriger à la main si besoin";
      console.warn(`[vinted] ${message}`);
      // Warning STRUCTURÉ (persisté en platform_fields.warnings par le
      // background, badge « Publiée — à vérifier » dans le Stock) : une
      // annonce en ligne avec une marque dégradée ne doit JAMAIS être
      // silencieuse — sur Vinted la marque est un filtre de recherche majeur.
      warnings.push({ code: "brand_fallback_no_brand", marque, message });
      return;
    } catch (e2) {
      // Convention error court / last_diagnostic (2026-08-06, job f9861e8a) :
      // le détail (cause exacte + annexe DOM d'openDropdown) part sur
      // err.diagnostic, le message reste lisible dans la modale de l'app.
      const err = new Error(
        `Le champ Marque n'a pas pu être renseigné avec « ${marque} » ` +
        "(introuvable au catalogue Vinted, création impossible, et même le repli « Sans marque » a échoué). " +
        "Publication interrompue AVANT le dépôt — ce n'est PAS un refus Vinted, l'annonce n'a pas été soumise."
      );
      err.diagnostic =
        `Marque "${marque}": introuvable au catalogue ET création via « Utiliser "${marque}" comme marque » ` +
        `impossible (${e.message})${e.diagnostic ? ` — ${e.diagnostic}` : ""} ; ` +
        `repli « Sans marque » natif également en échec (${e2.message})${e2.diagnostic ? ` — ${e2.diagnostic}` : ""}`;
      throw err;
    }
  }
}

// ── Modèle Vinted : champ à RECHERCHE sur liste virtualisée ────────────────────
// Prouvé en direct le 2026-07-18 (Xiaomi Redmi Note 10 5G) :
//   1. La liste des modèles est VIRTUALISÉE (~50 options rendues) : il FAUT
//      filtrer par la barre de recherche pour faire apparaître l'option voulue.
//   2. L'app génère souvent un libellé PLUS SPÉCIFIQUE que le catalogue Vinted :
//      "Redmi Note 10 5G" alors que Vinted n'a que "Redmi Note 10" → taper la
//      valeur complète ne renvoie AUCUN modèle réel (juste les replis "Mon modèle
//      ne figure pas dans la liste"). D'où le 400 "Sélectionne le modèle".
//      iPhone marchait car "iPhone 13 Pro Max" existe à l'exact.
//   3. La sélection ne se COMMITTE qu'en cliquant la LIGNE [role="button"]
//      (#model-<id>), pas seulement le <span> --title (test direct : #model.value
//      reste vide sur un clic du span de repli).
// Parade : on essaie la valeur complète, puis on retire les tokens de queue
// (5G/4G/Dual…) jusqu'à retomber sur un modèle catalogué. Match = exact sur la
// valeur, ou option qui est un PRÉFIXE mot-à-mot de la valeur (base du variant).
const MODEL_FALLBACK_LABELS = new Set([
  "mon modèle ne figure pas dans la liste",
  "je ne connais pas le nom du modèle",
]);
const normModel = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

function findVintedModelOption(optionSelector, rawWanted) {
  const wanted = normModel(rawWanted);
  const wantedTokens = wanted.split(" ").filter(Boolean);
  const opts = Array.from(document.querySelectorAll(optionSelector))
    .map((el) => ({ el, txt: normModel(el.textContent) }))
    .filter((o) => o.txt && !MODEL_FALLBACK_LABELS.has(o.txt));
  const exact = opts.find((o) => o.txt === wanted);
  if (exact) return { el: exact.el, label: exact.el.textContent.trim(), stage: "exact" };
  // option = préfixe mot-à-mot de la valeur (la plus longue gagne) :
  // "Redmi Note 10" ⊂ "Redmi Note 10 5G" — même base cataloguée. On EXCLUT les
  // frères non-préfixes ("Redmi Note 10 Pro" n'est pas un préfixe de "…10 5G").
  let best = null;
  for (const o of opts) {
    const t = o.txt.split(" ").filter(Boolean);
    if (t.length >= wantedTokens.length) continue;
    if (t.every((tok, i) => tok === wantedTokens[i]) && (!best || t.length > best.len)) {
      best = { el: o.el, label: o.el.textContent.trim(), len: t.length };
    }
  }
  return best ? { el: best.el, label: best.label, stage: "prefix" } : null;
}

// Clique la LIGNE cliquable de l'option (#model-<id> [role=button]) et non le
// <span> --title : seule la ligne commite la sélection (prouvé en direct).
// publish.model_option (migré au registre) : remontée par closest() — hors du
// périmètre de resolveSelector (résolution descendante) ; le littéral vient du
// registre via selectorFor.
async function clickModelOption(titleEl) {
  const S = await sel();
  const row = titleEl.closest(S.selectorFor("vinted", "publish.model_option")) || titleEl;
  row.click();
}

async function selectVintedModel(wanted, warnings) {
  const raw = String(wanted ?? "").trim();
  if (!raw) return false;
  const trigger = '#model, [data-testid="model-select-input"]';
  const optionSel = '[data-testid^="model-"][data-testid$="--title"]';

  // Requêtes candidates : valeur complète puis en retirant les tokens de queue.
  const words = raw.split(/\s+/).filter(Boolean);
  const queries = [];
  const seen = new Set();
  for (let n = words.length; n >= 1; n--) {
    const q = words.slice(0, n).join(" ");
    const k = q.toLowerCase();
    if (!seen.has(k)) { seen.add(k); queries.push(q); }
  }

  try {
    await openDropdown(trigger);
  } catch (e) {
    const note = `modèle: ouverture du champ impossible — ${e.message}`;
    console.warn(`[vinted] ⚠️ ${note}`);
    warnings.push(note);
    return false;
  }
  const search = await waitForElement("#model-search-input", 5000).catch(() => null);

  for (const q of queries) {
    if (search) await typeHuman(search, q);
    // Poll : laisser le filtre (debounce + réseau + re-render) faire apparaître
    // l'option, sans délai fixe deviné.
    const start = Date.now();
    let match = null;
    while (Date.now() - start < 8000) {
      match = findVintedModelOption(optionSel, raw);
      if (match) break;
      await sleep(120);
    }
    if (match) {
      await humanPause();
      await clickModelOption(match.el);
      await humanPause();
      await confirmDropdownIfNeeded();
      if (match.stage !== "exact") {
        const note = `modèle: "${raw}" absent à l'exact → option Vinted "${match.label}" (base du variant retenue)`;
        console.warn(`[vinted] ≈ ${note}`);
        warnings.push(note);
      }
      return true;
    }
  }

  // Aucun modèle catalogué ne correspond, même en retirant les qualificatifs :
  // champ laissé vide → la gate pré-clic (computeVintedRequiredState) le remonte
  // en needsUser "Modèle" au lieu d'un 400 muet. (On ne clique PAS le repli
  // Vinted "Mon modèle ne figure pas dans la liste" : commit non fiabilisé.)
  await closeAnyOpenDropdown();
  const note = `modèle: "${raw}" introuvable dans le catalogue Vinted (aucune correspondance) — champ laissé vide`;
  console.warn(`[vinted] ⚠️ ${note}`);
  warnings.push(note);
  return false;
}

// Variante robuste pour les champs à choix fermé (taille, état, matière) :
// matching en cascade ET jamais bloquante — un libellé IA sans équivalent
// Vinted saute le champ avec un warning au lieu de faire échouer le job
// entier (le champ restera vide, corrigeable à la main avant publication).
async function selectClosedOptionSafe(fieldName, triggerSelector, optionSelector, rawText, warnings, opts = {}) {
  try {
    await openDropdown(triggerSelector);
    const match = await waitForOptionCascade(optionSelector, rawText, 5000, opts);
    await humanPause(); // temps de "lecture" de la liste avant le clic
    match.el.click();
    await humanPause();
    await confirmDropdownIfNeeded();
    if (match.stage !== "exact") {
      const note = `${fieldName}: "${rawText}" → option Vinted "${match.label}" (match ${match.stage})`;
      console.warn(`[vinted] ≈ ${note}`);
      warnings.push(note);
    }
    return true;
  } catch (e) {
    // Options réellement affichées par Vinted, annexées au warning — même
    // relevé actionnable que Beebs/LBC (jeu d'options PAR CATÉGORIE : la
    // Beauté n'offre p.ex. que « Neuf avec étiquette » pour l'État).
    const visible = Array.from(document.querySelectorAll(optionSelector))
      .map((el) => el.textContent.trim())
      .filter(Boolean)
      .slice(0, 12);
    const note = `${fieldName}: champ sauté — ${e.message}` +
      (visible.length ? ` — options affichées: ${JSON.stringify(visible)}` : "");
    console.warn(`[vinted] ⚠️ ${note}`);
    warnings.push(note);
    await closeAnyOpenDropdown();
    return false;
  }
}

// Catégorie : menu en cascade, panneau réécrit en place à chaque niveau (pas de
// nouvelle ouverture de menu). path = ["Femmes", "Vêtements", "Robes", "Midi"] par ex.
// Attention : certains chemins ont un niveau supplémentaire (ex: "Pour occasions"
// sous Robes) — le path fourni en amont doit correspondre à un chemin complet
// jusqu'à une feuille terminale (option avec rond radio, pas chevron), sinon
// Vinted reste bloqué sur un niveau intermédiaire.
//
// Les erreurs listent les options réellement affichées par Vinted à ce niveau :
// c'est le retour dont on a besoin pendant les dry-runs pour corriger les
// libellés draft de vintedCategories.js (côté app) sans naviguer à la main.
// publish.catalog_option (migré au registre) : le littéral vit dans
// vinted.registry.js ; le moteur de matching par texte (findOptionByText et sa
// cascade) reste ICI et reçoit le sélecteur en paramètre (pattern
// publish.option_item de l'audit) — selectorFor, pas resolveSelector.
async function visibleCatalogLabels(limit = 20) {
  const S = await sel();
  return Array.from(document.querySelectorAll(S.selectorFor("vinted", "publish.catalog_option")))
    .map((o) => o.textContent.trim())
    .filter(Boolean)
    .slice(0, limit);
}

// Un niveau intermédiaire porte un chevron (classe web_ui__Cell__with-chevron,
// confirmée par inspection DOM réelle du formulaire) ; une feuille
// sélectionnable porte un rond radio. Le clic sur la feuille NE ferme PAS le
// menu (confirmé par test réel) : il faut ensuite valider via "Fait"
// (confirmDropdownIfNeeded). La classe chevron peut être sur le bouton
// lui-même, un parent ou un descendant selon le rendu — on teste les trois.
// Décision AVANT chaque clic : pas de profondeur supposée, c'est le DOM réel
// qui dit si on descend ou si on sélectionne (certains chemins ont un 5e
// niveau, ex: "Pour occasions" sous "Robes").
function isChevronOption(option) {
  return Boolean(
    option.matches(".web_ui__Cell__with-chevron") ||
    option.closest(".web_ui__Cell__with-chevron") ||
    option.querySelector(".web_ui__Cell__with-chevron")
  );
}

// Attend une option du catalogue STABLE : même nœud sur deux lectures espacées
// de settleMs (modèle waitForStableElement, l.1252) — le panneau Catégorie se
// remplit par vagues (liste racine, puis bloc suggestions issu du titre/photos,
// cf. suggested-brand-* l.1502-1506 pour le mécanisme équivalent côté Marque).
// Retourner le premier nœud dont le TEXTE matche, sans attendre que la liste
// soit posée, a produit le faux « feuille terminale » du 2026-07-30 (compte
// Ornella : même chemin, 2 succès / 1 échec) — le chevron était lu sur un état
// de rendu partiel. exactOnly : au niveau racine les libellés sont connus et
// courts (« Femmes »…), le repli includes() peut capturer une cellule de
// suggestion/fil d'Ariane qui CONTIENT le mot — refusé là où il est demandé.
async function waitForStableCatalogOption(optionSelector, text, { timeoutMs = 5000, settleMs = 250, exactOnly = false, exclude = null } = {}) {
  const start = Date.now();
  let prev = null;
  while (Date.now() - start < timeoutMs) {
    const match = findOptionMatch(document, optionSelector, text, { exactOnly, exclude });
    if (match && prev && match.el === prev.el && match.el.isConnected) return match;
    prev = match;
    await sleep(match ? settleMs : 80);
  }
  if (prev?.el?.isConnected) return prev; // trouvé mais jamais revu identique : on rend le dernier état
  throw new Error(`Option "${text}" introuvable pour ${optionSelector}`);
}

// Annexe de diagnostic commune aux erreurs de niveau : QUEL nœud a matché
// (id + extrait d'outerHTML), par quel étage de la cascade, et ce que Vinted
// affichait réellement — sans ça, impossible de départager post-mortem un
// mapping faux d'un état de rendu transitoire (leçon du faux « feuille
// terminale » du 2026-07-30).
function describeMatchedOption(match) {
  const el = match?.el;
  if (!el) return "aucun nœud matché";
  const html = String(el.outerHTML ?? "").replace(/\s+/g, " ").slice(0, 300);
  return `nœud matché (${match.stage}) id="${el.id || "?"}" : ${html}`;
}

// SUGGESTIONS vs nœuds d'arbre (2026-08-06, job 68420b37 « Pantalon flare
// FB Sister ») : le panneau Catégorie ouvre sur un bloc de SUGGESTIONS issues
// du titre/photos — id="catalog-suggestion-NNNN", cellule à RADIO (sélection
// finale directe), jamais de chevron, textContent qui concatène libellé + fil
// d'Ariane (« Pantalons à jambes largesFemmes > Vêtements > … ») — AVANT les
// racines de l'arbre (id="catalog-NNN"). Un libellé peut donc exister en
// DOUBLE (« Femmes » suggestion ET racine), et la suggestion arrive PREMIÈRE
// dans le DOM : le match exact tombait dessus, le test de chevron concluait
// « sans sous-niveaux » et la cascade abandonnait. Les suggestions sont
// EXCLUES de la navigation d'arbre — on ne descend que par les vrais nœuds.
function estSuggestionCatalogue(el) {
  return /^catalog-suggestion-/.test(el?.id ?? "")
    || Boolean(el?.closest?.('[id^="catalog-suggestion-"]'));
}

// Erreur de catégorie à DEUX étages (2026-08-06) : cross_post_jobs.error est
// AFFICHÉ TEL QUEL à l'utilisateur final (modale « En attente de toi ») — un
// dump DOM ou une liste d'options n'y a plus JAMAIS sa place. Le message
// court dit quoi faire ; l'annexe technique complète voyage sur
// err.diagnostic, relayée par le handler de messages puis rangée par le
// background dans platform_fields.last_diagnostic (requêtable en SQL).
function erreurCategorie(messageCourt, annexeTechnique) {
  const err = new Error(
    `La catégorie Vinted n'a pas pu être sélectionnée (${messageCourt}). ` +
    "Relance la publication depuis l'app ; si ça se reproduit, signale-le au support."
  );
  err.diagnostic = `Catégorie: ${annexeTechnique}`;
  return err;
}

async function selectCategory(path) {
  const catalogOptionSel = (await sel()).selectorFor("vinted", "publish.catalog_option");
  await openDropdown('#category, [data-testid="catalog-select-dropdown-input"]');
  for (let i = 0; i < path.length; i++) {
    const levelLabel = path[i];
    const isLast = i === path.length - 1;
    // Niveau racine : match EXACT exigé (libellés courts et connus, repli
    // includes() dangereux — cf. waitForStableCatalogOption). Aux niveaux
    // suivants le repli reste permis (libellés composés type « Robes midi »).
    // Les suggestions sont exclues à TOUS les niveaux (cf. estSuggestionCatalogue).
    const matchOpts = { exactOnly: i === 0, exclude: estSuggestionCatalogue };

    let match;
    try {
      match = await waitForStableCatalogOption(catalogOptionSel, levelLabel, matchOpts);
    } catch {
      throw erreurCategorie(
        `niveau « ${levelLabel} » introuvable`,
        `niveau "${levelLabel}" introuvable (chemin ${JSON.stringify(path)}). ` +
        `Options affichées par Vinted à ce niveau: ${JSON.stringify(await visibleCatalogLabels())}. ` +
        `Corriger le chemin dans vintedCategories.js avec un de ces libellés.`
      );
    }

    // Parmi TOUS les candidats du libellé (doublons possibles même hors
    // suggestions), préférer celui dont la NATURE colle à l'attendu : chevron
    // (navigable) quand le chemin continue, feuille (radio) au dernier niveau.
    // C'est le « réessayer sur le candidat suivant » : un nœud matché qui
    // n'ouvre pas de sous-niveau ne condamne plus le job tant qu'un autre
    // candidat du même libellé, lui, en ouvre un.
    const meilleurCandidat = () => {
      const cands = findOptionMatches(document, catalogOptionSel, levelLabel, matchOpts);
      if (!cands.length) return null;
      return cands.find((c) => isChevronOption(c.el) === !isLast) ?? cands[0];
    };
    match = meilleurCandidat() ?? match;
    let option = match.el;

    // Chevron absent → JAMAIS terminal sur une seule lecture (même famille de
    // leçon que LBC 410/200 : un seul relevé ne prime pas). Le nœud peut être
    // en cours de décoration, ou remplacé par un re-rendu — on re-cherche à
    // neuf, borné, avant de conclure.
    let hasChevron = isChevronOption(option);
    for (let retry = 0; !hasChevron && !isLast && retry < 3; retry++) {
      await sleep(400);
      const again = meilleurCandidat();
      if (again) {
        match = again;
        option = again.el;
        hasChevron = isChevronOption(option);
      }
    }

    // Le chemin continue mais AUCUN candidat n'a de chevron après retries.
    // Deux causes possibles, indécidables sans les annexes du diagnostic :
    // mapping trop profond (rare : le même chemin peut réussir par ailleurs),
    // ou état du panneau inattendu (pré-sélection, rendu partiel).
    if (!isLast && !hasChevron) {
      throw erreurCategorie(
        `le niveau « ${levelLabel} » ne propose pas les sous-niveaux attendus`,
        `"${levelLabel}" affiché sans sous-niveaux (pas de chevron, vérifié 4×, suggestions exclues) alors que ` +
        `le chemin continue avec ${JSON.stringify(path.slice(i + 1))}. ` +
        `${describeMatchedOption(match)}. ` +
        `Options affichées par Vinted à ce niveau: ${JSON.stringify(await visibleCatalogLabels())}.`
      );
    }

    // Dernier niveau du chemin mais encore un chevron : profondeur
    // supplémentaire dans le catalogue réel. On clique quand même pour révéler
    // les sous-niveaux et les remonter dans le diagnostic du job.
    if (isLast && hasChevron) {
      option.click();
      await sleep(400);
      throw erreurCategorie(
        `le chemin s'arrête sur un niveau intermédiaire (« ${levelLabel} »)`,
        `le chemin ${JSON.stringify(path)} s'arrête sur un niveau intermédiaire. ` +
        `Sous-niveaux proposés par Vinted: ${JSON.stringify(await visibleCatalogLabels())}. ` +
        `Ajouter le niveau terminal manquant dans vintedCategories.js.`
      );
    }

    await humanPause();
    option.click();
    await sleep(400);
  }
  // Le dernier clic (feuille) ne ferme pas le menu : valider explicitement.
  await confirmDropdownIfNeeded();
}

// Palette relevée dans le picker Couleur pendant qu'il est ouvert (2026-07-30,
// job 243097d4) : remontée au catalogue platform_category_aspects via
// computeVintedRequiredState → discoveredRequired → persistDiscoveredAspects
// (background). Avant ça, la ligne "color" du catalogue n'avait JAMAIS
// d'allowed_values — l'app ne pouvait pas proposer une liste fermée.
let paletteCouleursRelevee = null;

// Retourne true si AU MOINS une couleur a été posée (ou s'il n'y avait rien à
// poser / champ absent) ; false si des couleurs étaient demandées et
// qu'AUCUNE n'a matché — le caller échoue alors AVANT le dépôt, avec la
// palette relevée dans l'erreur, plutôt que de laisser le champ vide et de
// prendre un 400 aveugle ("Le champ Couleur doit être renseigné", job
// 243097d4 : couleur "Argent" hors palette, champ vide, refus serveur).
async function selectColors(colorNames, warnings = []) {
  // multi-sélection, 2 couleurs maximum côté Vinted — même cascade que les
  // autres choix fermés.
  try {
    await openDropdown('#color, [data-testid="color-select-dropdown-input"]');
  } catch (e) {
    const note = `couleur: champ sauté — ${e.message}`;
    console.warn(`[vinted] ⚠️ ${note}`);
    warnings.push(note);
    // Champ absent du formulaire (catégorie sans couleur) : rien à bloquer.
    return true;
  }
  // Capture de la palette pendant que le panneau est ouvert. Le sélecteur
  // attrape aussi le trigger (data-testid="color-select-dropdown-input",
  // même préfixe) : écarté par le filtre dropdown-input.
  // ⚠️ dropdown-CONTENT autant que dropdown-INPUT (2026-08-05) : depuis que
  // Vinted nomme le panneau d'après son champ, le popup lui-même porte
  // data-testid="color-select-dropdown-content" — donc il commence par
  // « color- » et entrait dans la liste des options. Son textContent est la
  // CONCATÉNATION de toute la palette (« NoirGrisBlancCrèmeBeige… ») : la
  // cascade `includes` pouvait le retenir comme correspondance et cliquer le
  // panneau au lieu d'une couleur. Le même filtre protège le relevé de palette
  // envoyé au catalogue, qui aurait sinon appris une fausse valeur.
  const options = Array.from(document.querySelectorAll('[data-testid^="color-"]'))
    .filter((el) => !/dropdown-(input|content)/.test(el.getAttribute("data-testid") ?? ""))
    .map((el) => el.textContent.trim())
    .filter(Boolean)
    .slice(0, 40);
  if (options.length) paletteCouleursRelevee = options;
  let posees = 0;
  for (const name of colorNames.slice(0, 2)) {
    // :not(...) — même exclusion que le relevé de palette ci-dessus, sinon la
    // cascade peut retenir le PANNEAU (color-select-dropdown-content) dont le
    // texte contient toutes les couleurs, et le cliquer à la place.
    const match = findOptionCascade(
      document,
      '[data-testid^="color-"]:not([data-testid$="-dropdown-content"]):not([data-testid$="-dropdown-input"])',
      name,
    );
    if (match) {
      await humanPause();
      match.el.click();
      await humanPause();
      posees++;
      if (match.stage !== "exact") {
        const note = `couleur: "${name}" → option Vinted "${match.label}" (match ${match.stage})`;
        console.warn(`[vinted] ≈ ${note}`);
        warnings.push(note);
      }
    } else {
      const note = `couleur: "${name}" sans correspondance dans le picker`;
      console.warn(`[vinted] ⚠️ ${note}`);
      warnings.push(note);
    }
  }
  // Multi-sélection sans bouton "valider" : le clic body NE FERME PAS le
  // panneau (constaté en réel le 2026-07-11, même famille que Matière) — on
  // passe par le clic extérieur complet de closeAnyOpenDropdown.
  await closeAnyOpenDropdown();
  return posees > 0 || !colorNames.length;
}

// ⚠️ 2026-07-12 : « Petit » n'est PAS toujours pré-coché — Vinted choisit le
// format par défaut selon la CATÉGORIE, et sur les chaussures il pré-coche
// « Moyen » (constaté sur l'annonce New Balance de ce soir). L'ancien
// `if (size === "Petit") return;` faisait donc confiance à un défaut qui n'en
// est pas un : on ne cliquait rien et le colis partait en Moyen.
// Décision produit Nico (2026-07-12) : sur TOUTE la branche Mode (vêtements ET
// chaussures), c'est TOUJOURS « Petit », sans exception. On CLIQUE désormais le
// format, on ne le suppose plus.
async function selectPackageSize(size = "Petit") {
  // Table partagée avec la capture republication (VINTED_PACKAGE_SIZES_PAR_ID,
  // en tête de fichier) : le rang du radio EST le package_size_id. Une seule
  // table dans les deux sens — capturer « Petit » puis recliquer « Petit » ne
  // peut pas dériver.
  const n = Number(Object.entries(VINTED_PACKAGE_SIZES_PAR_ID).find(([, l]) => l === size)?.[0]) || 1;
  // publish.package_type (migré au registre) : maillon template {n}, n = 1..3.
  const radio = await waitForKey("publish.package_type", { params: { n } });
  if (!radio.checked) {
    simulateFullClick(radio);
    await humanPause();
  }
  // Vérification : le format retenu doit être celui demandé (sinon on publierait
  // avec des frais de port faux, invisible jusqu'à la première vente).
  // Relecture DÉLIBÉRÉE du DOM (le nœud peut avoir été remonté par React) — un
  // nœud détaché entre-temps est toléré comme avant (after = null) :
  // SelectorResolutionError avalée, reportFailure:false (pas un sélecteur cassé).
  const S = await sel();
  let after = null;
  try {
    after = S.resolveSelector("vinted", "publish.package_type", { params: { n }, reportFailure: false }).el;
  } catch (e) {
    if (e?.name !== "SelectorResolutionError") throw e;
  }
  if (after && !after.checked) {
    console.warn(`[vinted] ⚠️ format de colis : "${size}" n'a pas pris (radio non coché après clic)`);
  }
}

// job.photos: [{ url, type }] — pas des File prêts, on fetch chaque url puis
// on construit les File nous-mêmes avant de les déposer sur l'input.
async function urlToFile(url, index) {
  // fetch() SOUS LE CORS DE LA PAGE HÔTE (MV3) : une photo hébergée hors de
  // notre storage (CDN Vinted d'un article importé du dressing, avant que
  // generate-listing ne la rapatrie) jette TypeError « Failed to fetch ».
  // Cette chaîne brute du navigateur ne doit plus JAMAIS finir dans
  // cross_post_jobs.error (job du 06/08, espadrilles MOA) — message FR
  // actionnable, et garde res.ok : un 404 fabriquait un File de page d'erreur.
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(
      `La photo ${index + 1} de l'annonce n'a pas pu être téléchargée depuis la page de dépôt ` +
      "(photo hébergée hors FillSell — article importé du dressing ? — ou réseau coupé). " +
      "Regénérer l'annonce depuis l'app rapatrie les photos, puis relancer la publication."
    );
  }
  if (!res.ok) {
    throw new Error(
      `La photo ${index + 1} de l'annonce est indisponible (HTTP ${res.status}). ` +
      "Regénérer l'annonce depuis l'app puis relancer la publication."
    );
  }
  const blob = await res.blob();
  const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  return new File([blob], `photo_${index}.${ext}`, { type: blob.type });
}

// Minimum 3 photos (constaté en publication réelle le 2026-07-11) : avec 2
// photos sur un article de marque premium (Patagonia), le clic Publier ouvre
// une modale bloquante « Ajoute des photos à cette annonce — Les annonces
// comportant des articles de luxe et des articles haut de gamme doivent
// inclure au moins 3 photos pour prouver leur authenticité ». Vinted ne dit
// PAS à l'avance quelles marques sont concernées : on complète donc TOUJOURS
// à 3 en dupliquant la dernière photo fournie (mieux qu'une annonce bloquée ;
// l'utilisateur peut retirer le doublon à la main). Aucun effet si l'app en
// fournit déjà 3 ou plus.
const VINTED_MIN_PHOTOS = 3;

async function uploadPhotos(photos) {
  const source = photos.slice();
  const duplicated = source.length > 0 && source.length < VINTED_MIN_PHOTOS;
  while (source.length > 0 && source.length < VINTED_MIN_PHOTOS) {
    source.push(source[source.length - 1]);
  }
  if (duplicated) {
    console.warn(
      `[vinted] ⚠️ ${photos.length} photo(s) fournie(s) — complété à ${VINTED_MIN_PHOTOS} par duplication ` +
      "(minimum imposé par Vinted sur les marques premium, sinon modale bloquante au clic Publier)."
    );
  }

  const files = await Promise.all(source.map((p, i) => urlToFile(p.url, i)));
  // publish.photo_input (migré au registre — criticité red, clé SANS fallback,
  // §8 de l'audit).
  const input = await waitForKey("publish.photo_input");
  const dataTransfer = new DataTransfer();
  files.forEach((f) => dataTransfer.items.add(f));
  // Doubles snapshots AVANT l'injection : vignettes posées dans la grille de
  // dépôt ET captures réseau /api/v2/photos de la sonde — la garde
  // ensurePhotosLanded (appelée juste avant le clic Publier) ne compte que ce
  // qui apparaît APRÈS.
  const vignettesAvant = photosDansLaGrille();
  const capturesAvant = await countImageUploadCaptures();
  input.files = dataTransfer.files;
  await humanPause(); // temps de "sélection des fichiers" avant le dépôt
  input.dispatchEvent(new Event("change", { bubbles: true }));
  // 1er étage (précoce, NON bloquant) : les prévisualisations disent que la
  // sélection de fichiers a été TRAITÉE par le React de Vinted. Le blocage,
  // lui, vit dans ensurePhotosLanded, sur la preuve serveur, avant Publier —
  // les uploads ont tout le remplissage du formulaire pour se terminer.
  const signal = await waitPhotosUploaded(files.length, vignettesAvant, 1500 * files.length, "vinted");
  return { count: files.length, duplicated, photoNote: signal.note, vignettesAvant, capturesAvant };
}

// ⚠️ /api/v2/PHOTOS — L'ENDPOINT RÉEL, MESURÉ LE 2026-08-09 SUR /items/new.
// La 0.5.3 comptait /api/v2/images, endpoint qui n'existe PAS dans ce flux :
// le compteur rendait donc 0 quoi qu'il arrive, et la garde photos levait à
// tous les coups (cf. PROBE_ENDPOINTS dans background.js pour le relevé).
// `images` est conservé en second motif, il ne coûte rien.
// Une capture 2xx = une photo réellement ARRIVÉE côté serveur Vinted.
// Rend 0 aussi quand le canal est indisponible (injection standalone hors
// extension, sonde pas encore posée) : la preuve DOM ci-dessous prend alors
// le relais.
const VINTED_UPLOAD_PHOTO_RE = /\/api\/v2\/(?:photos|images)(?:[/?#]|$)/i;

async function countImageUploadCaptures() {
  try {
    const res = await askBackground({ type: "VINTED_PROBE_CAPTURES" });
    const captures = Array.isArray(res?.captures) ? res.captures : [];
    return captures.filter((c) => {
      const st = Number(c?.status);
      return st >= 200 && st < 300 && VINTED_UPLOAD_PHOTO_RE.test(String(c?.url ?? ""));
    }).length;
  } catch {
    return 0;
  }
}

// ── Garde photos AVANT le clic Publier (2026-08-08, job 46e7dfc9) ────────────
// Constaté en prod : 5 photos fournies, formulaire soumis, 400 serveur
// « Ajoute au moins une photo » (errors[].field="photos") — les uploads
// n'étaient JAMAIS arrivés côté Vinted, et le flux a soumis quand même. Ce 400
// tardif maquillait la vraie cause. Désormais, AVANT de cliquer Publier :
//   · preuve (réseau OU grille) ≥ N → on publie ;
//   · sinon → ÉCHEC nommé AVANT soumission, jamais un 400 Vinted.
//
// ⚠️ DEUX PREUVES INDÉPENDANTES, ON GARDE LA MEILLEURE (2026-08-09) ⚠️
// La 0.5.3 n'en avait qu'une (captures /api/v2/images) et elle était FAUSSE —
// mauvais endpoint, compteur bloqué à 0, garde qui levait à tous les coups.
// Son échappatoire (« sonde muette mais N prévisualisations ») ne pouvait pas
// la sauver : mesuré en direct, Vinted ne crée AUCUNE prévisualisation
// blob:/data:. Il affiche directement l'URL CDN renvoyée par l'upload. Le
// signal historique était donc mort lui aussi — deux capteurs morts, aucun
// témoin, une annonce perdue (job 9a8eaad8).
// On croise maintenant deux capteurs qui ne peuvent pas mourir ensemble :
//   1. RÉSEAU  — POST /api/v2/photos 2xx vus par la sonde du background ;
//   2. DOM     — vignettes [data-testid^="image-wrapper-"] posées dans la
//                grille, dont l'<img> porte l'URL images1.vinted.net.
// La 2e est elle aussi une preuve SERVEUR (cette URL n'existe qu'en réponse
// d'un upload réussi) et ne dépend d'aucune sonde. Un renommage d'endpoint ne
// rend plus la garde aveugle ; une refonte du DOM non plus.
//
// Le budget attend le RELIQUAT d'uploads (le gros du temps s'est écoulé
// pendant le remplissage du formulaire) et est dimensionné pour les 8 photos
// du scan Business : 4 s/photo, plancher 15 s. La décision se prend sur l'ÉTAT
// FINAL, pas sur l'horloge : en fenêtre minimisée les timers sont throttlés
// (≥ 1 s, jusqu'à 1/min après 5 min cachée) — un réveil peut arriver APRÈS le
// budget alors que tout est arrivé ; on relit avant de juger.
//
// ⛔ bloquant:false — LE CAS RECRÉATION (annonce d'origine DÉJÀ SUPPRIMÉE).
// Là, refuser de soumettre est le PIRE des deux échecs possibles : il laisse
// l'utilisateur sans annonce et sans rien à retenter, alors qu'un refus de
// Vinted se retente sur un formulaire encore ouvert, photos déjà montées.
// Après une suppression, on soumet TOUJOURS ; le doute part en warning.
async function ensurePhotosLanded(photoResult, tag, { bloquant = true } = {}) {
  const { count, vignettesAvant, capturesAvant } = photoResult;
  const budgetMs = Math.max(15_000, 4_000 * count);
  const t0 = Date.now();
  const reseauDepuisInjection = async () => (await countImageUploadCaptures()) - capturesAvant;
  const grilleDepuisInjection = () => photosDansLaGrille() - vignettesAvant;

  let reseau = await reseauDepuisInjection();
  let grille = grilleDepuisInjection();
  while (Math.max(reseau, grille) < count && Date.now() - t0 < budgetMs) {
    await sleep(1000);
    reseau = await reseauDepuisInjection();
    grille = grilleDepuisInjection();
  }
  if (Math.max(reseau, grille) >= count) {
    console.log(
      `[${tag}] photos: ${count}/${count} arrivée(s) — ${Math.max(0, reseau)} POST /api/v2/photos 2xx, ` +
      `${Math.max(0, grille)} vignette(s) dans la grille — publication autorisée`
    );
    return null;
  }

  const constat =
    `photos: ${count} injectée(s) dans l'input, ${Math.max(0, grille)} vignette(s) posée(s) dans la grille, ` +
    `${Math.max(0, reseau)} POST /api/v2/photos 2xx capturé(s) depuis l'injection ` +
    `(${await countImageUploadCaptures()} au total sur l'onglet), budget ${budgetMs} ms épuisé`;

  if (!bloquant) {
    const note = `${constat} — RECRÉATION : soumission tentée quand même (l'annonce d'origine n'existe plus, un refus Vinted se retente, pas une annonce perdue)`;
    console.warn(`[${tag}] ${note}`);
    return note;
  }

  const err = new Error(
    `Les photos ne sont pas arrivées sur Vinted : ${Math.max(0, Math.max(reseau, grille))}/${count} confirmée(s) ` +
    `après ${Math.round((Date.now() - t0) / 1000)} s. Publication interrompue AVANT le dépôt — ce n'est PAS ` +
    "un refus Vinted, l'annonce n'a pas été soumise. Relancer la publication (les photos seront renvoyées)."
  );
  err.diagnostic = `${constat} — soumettre aurait produit le 400 « Ajoute au moins une photo » (cf. job 46e7dfc9)`;
  throw err;
}

// ── Interstitiels (2026-07-26, porté de beebs.js — SELECTOR_AUDIT §9b) ───────
// Détection STRUCTURELLE (role=dialog / aria-modal / classe modal, visibles au
// sens getComputedStyle), jamais par libellé exact. EXCLUSIONS Vinted — on ne
// ferme JAMAIS :
//   · un dialogue portant des contrôles du flux de dépôt (input photos,
//     bouton Publier, options catalogue id^="catalog-", panneau dropdown —
//     clé publish.dropdown_panel du registre) : c'est un PICKER de champ, pas
//     un interstitiel — le fermer casserait le remplissage ;
//   · la modale POST-PUBLICATION (clé publish.post_publish_modal) : attendue
//     par le flux et gérée par closePostPublishModal — hors fenêtre d'appel de toute
//     façon (dismiss appelé à l'arrivée seulement), exclue par structure via
//     la première règle si Vinted la montait plus tôt.
// Chaque fermeture est VÉRIFIÉE (dialogue détaché ou devenu invisible) et
// loggée ; échec de fermeture = log, jamais d'abandon du job. Le CTA store et
// « accepter » (consentement) sont exclus des candidats de clic.
function visibleSansLayoutV(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (n.getAttribute("aria-hidden") === "true") return false;
    const st = getComputedStyle(n);
    if (st.display === "none" || st.visibility === "hidden") return false;
  }
  return true;
}
async function findBlockingDialogsVinted() {
  // Sélecteur composé : morceaux hors registre + littéral du panneau dropdown
  // lu au registre (selectorFor — le moteur de détection reste ici, seul le
  // littéral a déménagé).
  const S = await sel();
  const panneauSel = S.selectorFor("vinted", "publish.dropdown_panel");
  const bruts = Array.from(
    document.querySelectorAll('[role="dialog"], [aria-modal="true"], [class*="modal" i]')
  )
    .filter(visibleSansLayoutV)
    // Contrôles du flux de dépôt à l'intérieur ⇒ picker légitime, pas un interstitiel.
    // Le fragment [data-testid="add-photos-input"] (sans préfixe input) est la
    // variante DÉTECTION de ce composite, distincte du littéral photo_input du
    // registre — laissé tel quel ; le bouton Publier vient, lui, du registre.
    .filter((d) =>
      !d.querySelector(
        '[data-testid="add-photos-input"], ' + S.selectorFor("vinted", "publish.submit") + ', ' +
        panneauSel + ', [id^="catalog-"], input[data-testid$="--input"]'
      )
    )
    .filter((d) => !d.closest(panneauSel));
  return bruts.filter((d) => !bruts.some((autre) => autre !== d && autre.contains(d)));
}
async function dismissInterstitials(contexte) {
  const dialogs = await findBlockingDialogsVinted();
  if (!dialogs.length) return { present: false, restants: 0 };
  for (const d of dialogs) {
    const boutons = Array.from(d.querySelectorAll("button")).filter(visibleSansLayoutV);
    console.warn(
      `[vinted] interstitiel détecté (${contexte}) : <${d.tagName.toLowerCase()} class="${String(d.className).slice(0, 90)}"` +
      ` role="${d.getAttribute("role") ?? ""}"> boutons=${JSON.stringify(boutons.map((b) => b.textContent.trim()).filter(Boolean).slice(0, 6))}`
    );
    const fermetures = Array.from(
      d.querySelectorAll('[aria-label*="clo" i], [aria-label*="ferm" i], [data-testid*="close"], [class*="close" i]')
    ).filter(visibleSansLayoutV);
    const candidats = boutons
      .filter((b) => !b.closest("a[href]"))
      .filter((b) => !/t[ée]l[ée]charg|app\s*store|google\s*play|accepter/i.test(b.textContent))
      .reverse();
    let ferme = false;
    for (const cible of [...fermetures, ...candidats]) {
      cible.click();
      await sleep(600);
      if (!d.isConnected || !visibleSansLayoutV(d)) {
        console.log(`[vinted] interstitiel fermé via « ${cible.textContent.trim() || cible.getAttribute("aria-label") || cible.className} »`);
        ferme = true;
        break;
      }
    }
    if (!ferme) console.warn(`[vinted] interstitiel NON fermé (${contexte}) — aucun candidat n'a eu d'effet ; le flux continue`);
  }
  return { present: true, restants: (await findBlockingDialogsVinted()).length };
}

// ── Vignettes RÉELLEMENT POSÉES dans la grille de dépôt (2026-08-09) ─────────
// ⚠️ REMPLACE le comptage des prévisualisations blob:/data', qui était MORT.
// Mesuré en direct sur /items/new : 3 fichiers injectés, 3 POST
// /api/v2/photos → 200, et ZÉRO img[src^="blob:"] à aucun instant. Vinted ne
// fabrique pas d'aperçu local : il attend la réponse de l'upload et affiche
// l'URL CDN qu'elle contient. Le « signal historique » de la 0.5.3 ne pouvait
// donc jamais se confirmer — il échouait en silence à chaque publication
// (non bloquant par contrat), et c'est ce silence qui a rendu l'échappatoire
// de ensurePhotosLanded inopérante le jour où le compteur réseau s'est
// trompé d'endpoint.
// Relevé DOM du 2026-08-09, à l'intérieur de [data-testid="media-upload-grid"],
// une entrée par photo acceptée :
//   image-wrapper-0 · media-select-grid-delete-button-0 · …-rotate-button-0
//   image-wrapper-1 · …  (index croissant)
// et l'<img> de chaque wrapper porte https://images1.vinted.net/…
// C'est donc une preuve SERVEUR au même titre que la capture réseau : cette
// URL n'existe qu'en réponse d'un upload réussi. Lecture par attribut
// uniquement — aucune mesure de layout (fenêtre de travail jamais rendue).
function photosDansLaGrille() {
  return document.querySelectorAll('[data-testid^="image-wrapper-"]').length;
}
// 1er étage, NON BLOQUANT : les vignettes disent que les uploads aboutissent.
// Le blocage vit dans ensurePhotosLanded, juste avant Publier — les uploads
// ont tout le remplissage du formulaire pour se terminer.
async function waitPhotosUploaded(attendues, avant, budgetMs, tag) {
  const t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    const vues = photosDansLaGrille() - avant;
    if (vues >= attendues) {
      console.log(`[${tag}] photos: ${vues}/${attendues} vignette(s) dans la grille en ${Date.now() - t0} ms — signal confirmé`);
      return { confirmed: true, seen: vues, note: null };
    }
    await sleep(250);
  }
  const vues = photosDansLaGrille() - avant;
  const note =
    `photos: signal non confirmé, ${attendues} attendue(s), ${Math.max(0, vues)} vignette(s) posée(s) ` +
    `(budget ${budgetMs} ms épuisé — flux poursuivi, la garde d'avant-Publier tranchera)`;
  console.warn(`[${tag}] ${note}`);
  return { confirmed: false, seen: vues, note };
}

// Marqueur de version dans le log : permet de vérifier depuis la console
// qu'une version fraîche du script est bien injectée après un reload de
// l'extension (le libellé change à chaque évolution notable du remplissage).
console.log(`[vinted] prêt — build ${VINTED_BUILD} | BUILD_ID __FILLSELL_BUILD_ID__ | DRY_RUN=${DRY_RUN} | DELETE_DRY_RUN=${DELETE_DRY_RUN}`);
