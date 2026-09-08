// Popup FillSell — cross-post.
// Rendu entièrement piloté par les vraies données :
//   - session FillSell : chrome.storage.local["fillsell_session"] (posée par
//     content-scripts/fillsell-auth.js via le background) ;
//   - annonces en file : edge function get-pending-jobs (même source que le
//     poll du background), lue ici en lecture seule pour l'affichage.
// La publication réelle passe par le background (poll de fond) — jamais
// réécrite ici. Le popup DÉCRIT ; il ne déclenche rien.
//
// Habillage refondu le 08/09/2026 d'après la maquette Claude Design
// « FillSell Extension Popup » (écrans 1a nominal, 1b vide, 1c erreurs).
// La logique de lecture (motifs ancrés, ordre de preuve Beebs, fraîcheur de
// la sonde) est celle des commits 340004c / d025e30 / c261fb3, inchangée.

const { SESSION, SESSION_OWN, BOOTSTRAP_LAST_FAIL, LAST_POLL, RECENT_RESULTS, KEEP_AWAKE } = FILLSELL_CONFIG.STORAGE_KEYS;
// Le marqueur d'éveil est PERSISTÉ (le service worker MV3 meurt sans arrêt) :
// il peut donc survivre à un Chrome fermé en plein lot. On ne l'affiche que
// s'il a été rafraîchi récemment — sinon il ne prouve plus rien.
const EVEIL_FRAICHEUR_MS = 5 * 60 * 1000;
const APP_URL = "https://fillsell.app/app";

// Plateformes affichées, de haut en bas. `supported:false` => "Bientôt"
// (ligne atténuée). Beebs passé à true le 2026-07-11.
const PLATFORMS = [
  { key: "vinted",    name: "Vinted",    supported: true, loginUrl: "https://www.vinted.fr/" },
  { key: "leboncoin", name: "Leboncoin", supported: true, loginUrl: "https://www.leboncoin.fr/" },
  { key: "ebay",      name: "eBay",      supported: true, loginUrl: "https://www.ebay.fr/" },
  { key: "beebs",     name: "Beebs",     supported: true, loginUrl: "https://www.beebs.app/" },
];

const CHECK_SVG = '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

const els = {
  acct: document.getElementById("acct"),
  acctLabel: document.getElementById("acct-label"),
  barAlerte: document.getElementById("bar-alerte"),
  life: document.getElementById("life"),
  awake: document.getElementById("awake"),
  switchBox: document.getElementById("switch"),
  plateformes: document.getElementById("plateformes"),
  platList: document.getElementById("plat-list"),
  now: document.getElementById("now"),
  listing: document.getElementById("listing-card"),
  attente: document.getElementById("attente"),
  pourquoi: document.getElementById("pourquoi"),
  queueExtra: document.getElementById("queue-extra"),
  queue: document.getElementById("queue"),
  queueLabel: document.getElementById("queue-label"),
  history: document.getElementById("history"),
  openApp: document.getElementById("open-app"),
  diag: document.getElementById("diag"),
};

const state = {
  session: null,        // { access_token, email, ... }
  jobs: [],             // jobs pending/processing de PUBLICATION (republish exclus, cf. splitRepublish)
  repub: [],            // jobs republish pending/processing
  recentRepub: null,    // dernier résultat récent d'une republication (<30 min)
  annonce: null,        // { key, title, price, photo, tag, byPlatform: {vinted: job, ...} }
  status: {},           // { [platform]: { phase: 'idle'|'busy'|'done'|'err'|'connect', msg } }
  recent: {},           // { [platform]: résultat terminé <30 min par le poll de fond (Sujet 5) }
  publishing: false,
  // ── Poste de pilotage (2026-08-04) ────────────────────────────────────────
  besoinGeste: [],      // jobs 'needs_user' — ce qui attend une décision
  attenteTotal: null,   // total servi par get-pending-jobs (source unique, partagée avec l'app)
  sync: null,           // dernier run vinted_sync_runs (état + progression)
  sessions: null,       // profiles.extension_sessions (relevé de l'extension)
  // Republications retenues parce que Chrome est connecté à un AUTRE dressing.
  boutiquePause: null,  // { connectee:{login}, retenus, par_boutique, par_boutique_login }
  // « Déjà en ligne » pour l'article affiché (2026-09-08) : servi par
  // get-pending-jobs à l'ouverture du popup seulement.
  // { inventaire_id, plateformes: { vinted?, leboncoin?, ebay?, beebs? } } —
  // une clé ABSENTE = non mesuré (lecture en échec) → la case garde son état.
  dejaEnLigne: null,
  eveil: null,          // épisode de maintien en éveil en cours, ou null
  dernierPoll: null,    // chrome.storage.local LAST_POLL
  prochainPoll: null,   // chrome.alarms — échéance réelle, pas une estimation
  pendingSwitch: null,  // bascule de compte FillSell en attente d'une décision
  // La lecture de la file a-t-elle abouti ? null = pas tentée (pas de session),
  // false = échec réseau/serveur. Sur false, on ne dit JAMAIS « rien n'attend » :
  // on n'a pas mesuré.
  lectureOk: null,
  // État par plateforme, calculé UNE fois par rendu (cf. calculerEtats).
  etats: {},
  sondeFraiche: false,
  sondeVu: NaN,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function decodeJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch { return null; }
}

const EURO = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
function euro(v) {
  if (v == null || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? EURO.format(n) : `${v} €`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

const nomPlateforme = (key) => PLATFORMS.find((p) => p.key === key)?.name ?? key;
// « ebay.fr », « vinted.fr », « beebs.app » : le domaine qu'on ouvre, tel quel.
function hostOf(key) {
  const p = PLATFORMS.find((x) => x.key === key);
  try { return new URL(p.loginUrl).hostname.replace(/^www\./, ""); } catch { return p?.name ?? key; }
}
// « Vinted », « Vinted et eBay », « Vinted, Leboncoin et eBay ».
function enumerer(noms) {
  if (noms.length <= 1) return noms[0] || "";
  return `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
}

// photos = tableau d'OBJETS { url, type } (pas de simples chaînes) : la carte
// affichait <img src="[object Object]"> → vignette cassée. On extrait l'URL
// (compat chaîne brute au cas où d'anciens jobs en portent).
function photoUrl(photos) {
  const first = Array.isArray(photos) ? photos[0] : null;
  if (!first) return null;
  return typeof first === "string" ? first : (first.url ?? first.src ?? null);
}

// Regroupe les jobs en "annonces" (une annonce = plusieurs lignes plateforme du
// même article). Clé : inventaire_id, sinon le titre.
// « Prête à publier » montre la PROCHAINE à partir : un groupe dont aucune
// ligne n'est déjà en cours de dépôt — celles-là vivent dans « En cours ».
// S'il n'y a que des groupes en cours, on montre le premier.
function firstAnnonce(jobs) {
  if (!jobs.length) return null;
  const groups = new Map();
  for (const j of jobs) {
    const key = j.inventaire_id != null ? `inv:${j.inventaire_id}` : `title:${j.title || j.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(j);
  }
  const entries = [...groups.entries()];
  const [key, group] = entries.find(([, g]) => !g.some((j) => j.status === "processing")) ?? entries[0];
  const head = group[0];
  const byPlatform = {};
  for (const j of group) byPlatform[j.platform] = j;
  return {
    key,
    title: head.title || "Sans titre",
    price: head.price,
    photo: photoUrl(head.photos),
    tag: head.platform_fields?.categorie || null,
    byPlatform,
  };
}

// Lecture seule des jobs à publier (affichage). La publication passe par le
// background, qui refait un getValidSession (refresh) de son côté.
// include_processing (2026-07-12) : on demande AUSSI les jobs déjà en cours.
// Sans ça, un job passé en 'processing' disparaissait de la liste.
async function fetchPendingJobs(accessToken) {
  const res = await fetch(`${FILLSELL_CONFIG.SUPABASE_URL}/functions/v1/get-pending-jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: FILLSELL_CONFIG.SUPABASE_ANON_KEY,
    },
    // include_needs_user + include_context (2026-08-04) : réservés au popup.
    // Le contexte (état de la sync, sessions plateformes) voyage dans CETTE
    // réponse — pas de requête supplémentaire. Le background, lui, n'envoie
    // aucun de ces flags et ne paie donc rien.
    body: JSON.stringify({ include_processing: true, include_needs_user: true, include_context: true }),
  });
  if (!res.ok) throw new Error(`get-pending-jobs → HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  state.sync = data?.contexte?.sync ?? null;
  state.sessions = data?.contexte?.sessions ?? null;
  state.boutiquePause = data?.boutique_pause ?? null;
  state.dejaEnLigne = data?.deja_en_ligne ?? null;
  // ── LE NOMBRE VIENT DU SERVEUR (2026-09-04) ─────────────────────────────
  // Le popup et le bandeau de l'app affichaient deux nombres différents pour
  // la même chose. get-pending-jobs fait maintenant LE calcul, et les deux
  // écrans lisent le même résultat. Repli sur le compte local si le champ
  // manque : le popup n'affiche jamais rien de moins qu'avant.
  state.attenteTotal = Number.isFinite(data?.annonces_en_attente?.total)
    ? data.annonces_en_attente.total
    : null;
  // Les jobs action='delete' (retrait cross-plateforme, 2026-07-11) passent
  // par la même file mais ne sont PAS des annonces à publier.
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  return jobs.filter((j) => j.action !== "delete");
}

// Les jobs action='republish' ne sont PAS des annonces à publier : ils ont
// leur place à part (« En cours », « Aussi en file »).
function splitRepublish(jobs) {
  const repub = [];
  const autres = [];
  for (const j of jobs) (j.action === "republish" ? repub : autres).push(j);
  return { repub, autres };
}

// ── Chargement ───────────────────────────────────────────────────────────────

async function load() {
  // Session VALIDÉE par le background (fix 2026-07-11) : getValidSession
  // refresh si l'expiration est proche et PURGE le storage si le refresh est
  // mort. Une seule source de vérité.
  let session = null;
  try {
    try {
      const sw = await chrome.runtime.sendMessage({ type: "GET_PENDING_SWITCH" });
      state.pendingSwitch = sw?.pending ?? null;
    } catch { state.pendingSwitch = null; }
    const resp = await chrome.runtime.sendMessage({ type: "GET_VALID_SESSION" });
    session = resp?.session ?? null;
  } catch (e) {
    console.warn("[popup] GET_VALID_SESSION:", e);
  }
  state.session = session?.access_token ? session : null;

  if (state.session) {
    try {
      const tous = await fetchPendingJobs(state.session.access_token);
      // Les jobs 'needs_user' sortent AVANT tout le reste : ils attendent une
      // décision humaine, ils ne sont pas « à publier ».
      state.besoinGeste = tous.filter((j) => j.status === "needs_user");
      const actifs = tous.filter((j) => j.status !== "needs_user");
      const { repub, autres } = splitRepublish(actifs);
      state.jobs = autres;
      state.repub = repub;
      state.lectureOk = true;
    } catch (e) {
      console.warn("[popup] get-pending-jobs:", e);
      state.jobs = [];
      state.repub = [];
      state.besoinGeste = [];
      state.lectureOk = false;
    }
    // Signaux LOCAUX, gratuits et exacts : quand cette extension-ci est
    // passée, et quand elle repassera. Le popup EST l'extension, il se décrit
    // lui-même.
    try {
      const st = await chrome.storage.local.get(LAST_POLL);
      state.dernierPoll = st?.[LAST_POLL] ? Date.parse(st[LAST_POLL]) : null;
    } catch { state.dernierPoll = null; }
    try {
      const al = await chrome.alarms.get("fillsell-poll-jobs");
      state.prochainPoll = al?.scheduledTime ?? null;
    } catch { state.prochainPoll = null; }
    // Maintien en éveil en cours (2026-09-04) — lecture SEULE d'un marqueur
    // écrit par le background.
    try {
      const ka = await chrome.storage.local.get(KEEP_AWAKE);
      const ep = ka?.[KEEP_AWAKE] ?? null;
      const frais = ep?.maj && Date.now() - Date.parse(ep.maj) < EVEIL_FRAICHEUR_MS;
      state.eveil = frais ? ep : null;
    } catch { state.eveil = null; }
    state.annonce = firstAnnonce(state.jobs);
    // Jobs terminés récemment par le poll de fond (Sujet 5) : ils sortent de
    // get-pending-jobs → badge « Publiée » / « Échec » / « Se connecter » au
    // lieu de « Pas dans cet envoi ». Match sur la MÊME annonce quand une
    // annonce est affichée, sinon sur le groupe terminé le plus récent.
    state.recent = {};
    try {
      const rr = await chrome.storage.local.get(RECENT_RESULTS);
      const now = Date.now();
      const RECENT_TERMINAL = ["dry_run_completed", "published", "failed", "needsUser", "retry"];
      const fresh = Object.values(rr[RECENT_RESULTS] ?? {}).filter(
        (r) => now - (r.ts ?? 0) < 30 * 60 * 1000 && RECENT_TERMINAL.includes(r.status)
      );
      // Tri EXPLICITE du plus ancien au plus récent (2026-07-19) : le dernier
      // écrit gagne, refKey = le plus récent, dans les DEUX branches.
      fresh.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
      // Les résultats de REPUBLICATION ne colorent pas les lignes du flux de
      // dépôt : un republish échoué affichait « Échec » sur Vinted alors
      // qu'aucune publication n'était en cause.
      const freshPub = fresh.filter((r) => (r.action ?? "publish") !== "republish");
      state.recentRepub = fresh.filter((r) => (r.action ?? "publish") === "republish").pop() ?? null;
      const refKey = state.annonce?.key ?? freshPub[freshPub.length - 1]?.annonceKey ?? null;
      for (const r of freshPub) {
        if (r.annonceKey === refKey) state.recent[r.platform] = r;
      }
    } catch (e) {
      console.warn("[popup] recent results:", e);
    }
  } else {
    state.jobs = [];
    state.repub = [];
    state.besoinGeste = [];
    state.recentRepub = null;
    state.annonce = null;
    state.recent = {};
    state.lectureOk = null;
  }
  state.status = {};
  render();
}

// ── Logos ────────────────────────────────────────────────────────────────────
// Assets bundlés en local (chrome-extension/assets/) : Vinted/eBay = tracé de
// marque sur socle blanc (SVG), Beebs/Leboncoin = icône d'app officielle (PNG).
const PLATFORM_LOGO = {
  vinted:    { src: "assets/vinted.svg",    png: false },
  ebay:      { src: "assets/ebay.svg",      png: false },
  leboncoin: { src: "assets/leboncoin.png", png: true },
  beebs:     { src: "assets/beebs.png",     png: true },
};
function logoHtml(key, size) {
  const l = PLATFORM_LOGO[key];
  if (!l) return "";
  return `<span class="plogo ${key}${l.png ? " png" : ""}${size ? ` ${size}` : ""}">` +
    `<img src="${l.src}" alt="${escapeHtml(nomPlateforme(key))}" /></span>`;
}

// ── État d'une case « Diffuser sur » ─────────────────────────────────────────
// Dérivé de : supporté ? job présent ? statut de publication en cours ?
function rowState(p) {
  if (!p.supported) return "soon";
  const st = state.status[p.key];
  if (st?.phase === "queued") return "queued";
  if (st?.phase === "busy") return "busy";
  if (st?.phase === "done") return "done";
  if (st?.phase === "err") return "err";
  if (st?.phase === "connect") return "connect";
  const job = state.annonce?.byPlatform[p.key];
  // Job DÉJÀ en cours côté serveur (2026-07-12) : « Publication… », même si on
  // n'a reçu aucun événement live (popup fermé au démarrage du job).
  if (job?.status === "processing") return "busy";
  // Lot en cours mais ce job pas encore démarré : la ligne attend son tour.
  if (job) return batchRunning() ? "queued" : "ready";
  // Terminé (<30 min) par le poll de fond : on distingue le verdict réel —
  // publié → « Publiée », échec → « Échec », reconnexion → « Se connecter ».
  const rec = state.recent[p.key];
  if (rec) {
    if (rec.status === "published" || rec.status === "dry_run_completed") return "done";
    if (isConnErr(rec.error)) return "connect";
    return "err";
  }
  return "none";
}

// Un lot est-il EN COURS ? Dérivé de ce qui est VISIBLE : phase live
// queued/busy (événements FILLSELL_PROGRESS) ou job de l'annonce 'processing'
// (visible via include_processing même popup rouvert).
function batchRunning() {
  if (state.publishing) return true;
  for (const st of Object.values(state.status)) {
    if (st && (st.phase === "queued" || st.phase === "busy")) return true;
  }
  // Snapshot 'processing' pris à l'ouverture — mais le LIVE prime : une fois
  // l'événement terminal reçu (done/err/connect), le snapshot est périmé.
  const by = state.annonce?.byPlatform ?? {};
  return Object.entries(by).some(([key, j]) => {
    if (j?.status !== "processing") return false;
    const st = state.status[key];
    return !(st && ["done", "err", "connect"].includes(st.phase));
  });
}

// ── MOTIFS DOMINANTS DES ANNONCES EN ATTENTE (2026-09-08) ────────────────────
// ⛔ REGROUPEMENT PAR TÊTE DE MESSAGE ANCRÉE, JAMAIS PAR RESSEMBLANCE.
// Chaque motif ci-dessous est un ^ancrage sur le début EXACT d'un message que
// les handlers écrivent aujourd'hui. Une recherche large (« contient
// connexion ») rangerait « Republication en pause … reconnecte-toi » dans la
// mauvaise famille, et personne ne s'en apercevrait. Une tête que cette table
// ne connaît pas tombe dans « autre » — jamais rangée de force.
// Vérifié sur les 27 jobs en attente d'ornellaracano le 08/09 : 17 + 6 + 3 + 1.
const MOTIFS_ANCRES = [
  { re: /^Republication en pause/i, famille: "repub_pause" },
  { re: /^Ta republication attend/i, famille: "repub_pause" },
  { re: /^(Connexion .+ requise|Session .+ (fermée|expirée))/i, famille: "reconnexion" },
  { re: /^CHALLENGE /, famille: "challenge" },
  { re: /^Catégorie \S+ à confirmer/i, famille: "categorie" },
  { re: /^(Aucun état|\S+ exige|LIVE : aspect)/i, famille: "fiche" },
  { re: /^Un brouillon Leboncoin non terminé/i, famille: "brouillon_lbc" },
  { re: /^Publication non confirmée/i, famille: "a_verifier" },
];

// ⛔ DEUX FAMILLES NE SONT PAS RÉPÉTÉES ICI (2026-09-08, correction Nico) :
// « reconnexion demandée » et « vérification anti-robot à passer » se lisent
// DÉJÀ, en haut, sur la ligne de la plateforme concernée — « Session fermée »
// avec son bouton, « Bloquée » avec son geste. Les redire plus bas, c'était la
// même information à deux endroits, dans deux formulations, et sans le bouton.
// Le TOTAL, lui, ne bouge pas : il vient du serveur et reste celui du bandeau
// de l'app (source unique posée le 04/09). Cette liste n'a jamais été une
// décomposition du total — c'est un dessus de pile, déjà borné à 4 lignes.
const MOTIFS_DITS_AILLEURS = new Set(["reconnexion", "challenge"]);

const pl = (n, un, des) => (n > 1 ? des : un);
// Un message écrit pour être lu : on le montre tel quel s'il est propre, jamais
// un code technique ni une URL.
const messagePropre = (brut) => {
  const s = String(brut ?? "").trim();
  return s && s.length <= 220 && !/[{}<>]|https?:\/\//.test(s) ? s : null;
};

// Par famille : le libellé COURT de la liste « En attente », puis la carte
// « Pourquoi ça attend » — titre, cause, geste. Chaque phrase ne dit que ce
// que le message d'origine dit déjà (une republication « en pause AVANT toute
// suppression » = annonce intacte ; un needs_user = un choix humain attendu).
const FAMILLES = {
  repub_pause: {
    court: (n) => pl(n, "republication en pause", "republications en pause"),
    titre: (n) => `${n} ${pl(n, "republication en pause", "republications en pause")}`,
    sous: () => "Rien n'a été supprimé : l'annonce est intacte sur Vinted. La fiche dans l'appli dit le motif et porte le bouton pour relancer.",
    lien: "app",
  },
  fiche: {
    court: (n) => pl(n, "information manquante sur la fiche", "informations manquantes sur les fiches"),
    titre: (n) => `${n} ${pl(n, "fiche incomplète", "fiches incomplètes")}`,
    sous: (n) => `${pl(n, "Complète-la", "Complète-les")} dans l'appli puis relance : la fiche dit ce qui manque et porte le bouton.`,
    lien: "app",
  },
  categorie: {
    court: (n) => pl(n, "catégorie à confirmer", "catégories à confirmer"),
    titre: (n, pf) => `${n} ${pl(n, "catégorie", "catégories")}${pf ? ` ${pf}` : ""} à confirmer`,
    sous: (n) => `Le rayon n'a pas pu être choisi tout seul. Confirme-le dans l'appli : ${pl(n, "l'annonce repartira", "les annonces repartiront")} au passage suivant.`,
    lien: "app",
  },
  brouillon_lbc: {
    court: (n) => pl(n, "brouillon à supprimer sur Leboncoin", "brouillons à supprimer sur Leboncoin"),
    titre: (n) => `${n} ${pl(n, "brouillon", "brouillons")} à supprimer sur Leboncoin`,
    sous: () => "Un brouillon non terminé bloque le dépôt. Supprime-le sur leboncoin.fr, puis relance depuis l'appli.",
    lien: "leboncoin",
  },
  a_verifier: {
    court: (n) => pl(n, "publication à vérifier", "publications à vérifier"),
    titre: (n) => `${n} ${pl(n, "publication", "publications")} à vérifier`,
    sous: () => "Le dépôt n'a pas pu être confirmé. Regarde sur la plateforme si l'annonce existe, puis relance ou retire depuis l'appli.",
    lien: "app",
  },
  autre: {
    court: (n) => pl(n, "autre motif", "autres motifs"),
    titre: (n) => `${n} ${pl(n, "annonce", "annonces")} avec un autre motif`,
    sous: (_n, _pf, premier) => messagePropre(premier)
      ?? "La fiche de l'annonce, dans l'appli, dit ce qui bloque et porte le bouton pour relancer.",
    lien: "app",
  },
};

/** [{ famille, n, plateformes:Set, premier }] du plus nombreux au moins nombreux, 4 au plus. */
function motifsDominants(jobs) {
  const compte = new Map();
  for (const j of jobs ?? []) {
    const msg = String(j?.error ?? "").trim();
    const f = MOTIFS_ANCRES.find((m) => m.re.test(msg));
    const famille = f ? f.famille : "autre";
    if (MOTIFS_DITS_AILLEURS.has(famille)) continue;
    const cur = compte.get(famille) ?? { famille, n: 0, plateformes: new Set(), premier: null };
    cur.n += 1;
    if (j.platform) cur.plateformes.add(j.platform);
    if (cur.premier == null && msg) cur.premier = msg;
    compte.set(famille, cur);
  }
  return [...compte.values()].sort((a, b) => b.n - a.n).slice(0, 4);
}

// ── ÉTAT DES PLATEFORMES (2026-09-08) ────────────────────────────────────────
// La question qu'on se pose en ouvrant le popup : quelle plateforme est
// joignable ? Tout vient de ce que l'extension a DÉJÀ — `contexte.sessions`
// (servi à chaque poll) et les verdicts des jobs. Aucune sonde, aucun appel.
//
// ⛔ BEEBS NE PASSE PAS PAR LA SONDE. `probePlatformSessions` le dit lui-même :
// sa page est une SPA qui redirige CÔTÉ CLIENT, le fetch ne verra donc
// « quasiment jamais false » — un `null` y signifie aussi bien « pas connecté »
// que « pas pu vérifier ». Afficher « non connectée » dessus, ce serait refaire
// le faux bandeau du 30/07. Pour Beebs, la seule preuve acceptée est le VERDICT
// D'UN JOB : un job revenu avec « Connexion Beebs requise » est un fait.
// Tant qu'aucun job n'a tranché, cette ligne ne dit RIEN.
//
// ⛔ Et pour les trois autres, un `null` ne dit rien non plus : la ligne reste
// muette. On n'affiche que ce qu'on sait.
const BEEBS_DECO_RE = /^Connexion Beebs requise/i;
const CHALLENGE_RE = /^CHALLENGE /;
// Fraîcheur exigée du relevé de sessions. Au-delà, on n'affiche RIEN : une
// pastille verte sur un relevé de la semaine dernière est un mensonge.
const SESSIONS_FRAICHEUR_MS = 60 * 60 * 1000;

/** Tous les messages d'erreur connus du popup pour une plateforme, du plus
 *  récent au plus ancien. Jobs servis + résultats terminés (< 30 min). */
function messagesPlateforme(key) {
  const out = [];
  const rec = state.recent[key];
  if (rec?.error) out.push(String(rec.error));
  for (const j of [...state.besoinGeste, ...state.jobs, ...state.repub]) {
    if (j.platform === key && j.error) out.push(String(j.error));
  }
  return out;
}

/** { etat: 'ok'|'ko'|'bloquee'|null, sous } — null = on ne dit rien. */
function etatPlateforme(p, sondeFraiche) {
  const msgs = messagesPlateforme(p.key);
  // Anti-robot : motif ANCRÉ en tête de message (jamais une recherche large),
  // et seulement sur un résultat récent — un challenge d'hier est passé.
  const rec = state.recent[p.key];
  if (rec?.error && CHALLENGE_RE.test(String(rec.error).trim())) {
    return { etat: "bloquee", sous: `Vérification anti-robot à passer sur ${hostOf(p.key)}` };
  }
  if (p.key === "beebs") {
    // ⚠️ LE PLUS RÉCENT TRANCHE, dans cet ordre. Un job en needs_user peut
    // porter « Connexion Beebs requise » depuis des jours : s'il primait, on
    // enverrait se reconnecter quelqu'un dont le dépôt d'il y a dix minutes a
    // abouti. Un dépôt réussi PROUVE la session, là où la sonde ne peut rien
    // prouver — c'est lui qui passe devant.
    if (rec && (rec.status === "published" || rec.status === "dry_run_completed")) {
      return { etat: "ok", sous: null };
    }
    if (rec?.error && BEEBS_DECO_RE.test(String(rec.error).trim())) {
      return { etat: "ko", sous: "Session fermée" };
    }
    // Aucun résultat frais : le verdict d'un job encore en attente fait foi.
    if (msgs.some((m) => BEEBS_DECO_RE.test(m.trim()))) {
      return { etat: "ko", sous: "Session fermée" };
    }
    return { etat: null, sous: null };
  }
  if (!sondeFraiche) return { etat: null, sous: null };
  const v = state.sessions?.[p.key];
  if (v === true) {
    const ident = p.key === "vinted" ? state.sessions?.vinted_identite : null;
    return { etat: "ok", sous: ident?.login ? `Chrome connecté à @${ident.login}` : null };
  }
  if (v === false) return { etat: "ko", sous: "Session fermée" };
  return { etat: null, sous: null };
}

// Calculé UNE fois par rendu : la pastille du haut, la ligne d'alerte, le bloc
// Plateformes, la carte « Prête » et le pied lisent tous le même relevé.
function calculerEtats() {
  const s = state.sessions;
  const vu = s?.checked_at ? Date.parse(s.checked_at) : NaN;
  state.sondeVu = vu;
  state.sondeFraiche = Number.isFinite(vu) && Date.now() - vu < SESSIONS_FRAICHEUR_MS;
  state.etats = {};
  for (const p of PLATFORMS) {
    state.etats[p.key] = state.session ? etatPlateforme(p, sondeFraichePour(p.key)) : { etat: null, sous: null };
  }
}

// Fraîcheur PAR plateforme (0.6.22, sonde de session) : Vinted est sondée au rythme régulier,
// Leboncoin / eBay / Beebs seulement avant un job — un relevé porte donc
// checked_at_par_plateforme. À défaut (relevé d'une version antérieure), le
// checked_at global fait foi, comme avant.
function sondeFraichePour(key) {
  const s = state.sessions;
  const propre = s?.checked_at_par_plateforme?.[key];
  const vu = Date.parse(propre ?? s?.checked_at ?? "");
  return Number.isFinite(vu) && Date.now() - vu < SESSIONS_FRAICHEUR_MS;
}
const estKo = (key) => ["ko", "bloquee"].includes(state.etats[key]?.etat);
const plateformesKo = () => PLATFORMS.filter((p) => estKo(p.key));
const plateformesOk = () => PLATFORMS.filter((p) => state.etats[p.key]?.etat === "ok");
// Au-delà d'une heure sans passage, on ne prétend plus que tout va bien.
const extensionFroide = () => state.dernierPoll == null || Date.now() - state.dernierPoll > 60 * 60 * 1000;

// ── Rendu ────────────────────────────────────────────────────────────────────

function ilYA(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

function dansCombien(ms) {
  const min = Math.ceil(ms / 60000);
  return min <= 1 ? "dans moins d'une minute" : `dans ${min} min`;
}

// La pastille du bandeau : ce que l'extension EST en ce moment.
//   Se connecter — pas de session FillSell ;
//   Ralentie     — au moins une plateforme mesurée fermée ou bloquée ;
//   En veille    — aucun passage depuis plus d'une heure ;
//   Active       — un passage récent ;
//   Connectée    — session valide mais aucun passage encore enregistré.
function renderAccount() {
  const on = Boolean(state.session);
  els.acct.classList.remove("on", "off", "active", "ralentie", "veille");
  if (!on) {
    els.acct.classList.add("off");
    els.acctLabel.textContent = "Se connecter";
    els.acct.title = "";
    return;
  }
  const payload = decodeJwtPayload(state.session.access_token);
  const email = state.session.email || payload?.email || "";
  let cls = "active", label = "Active";
  if (plateformesKo().length) { cls = "ralentie"; label = "Ralentie"; }
  else if (state.dernierPoll == null) { cls = "veille"; label = "Connectée"; }
  else if (extensionFroide()) { cls = "veille"; label = "En veille"; }
  els.acct.classList.add("on", cls);
  els.acctLabel.textContent = label;
  els.acct.title = email ? `${email} — cliquer pour se déconnecter` : "Cliquer pour se déconnecter";
}

function renderBars() {
  // Plateformes qui ont besoin d'un geste — une phrase, en tête. « Les autres
  // continuent » n'est écrit que si une autre plateforme est MESURÉE connectée.
  const ko = plateformesKo();
  if (state.session && ko.length) {
    const n = ko.length;
    const suite = plateformesOk().length ? " · les autres continuent" : "";
    els.barAlerte.innerHTML =
      `<span class="bdot"></span>` +
      `<span>${n} ${pl(n, "plateforme a", "plateformes ont")} besoin de toi${suite}</span>`;
    els.barAlerte.classList.remove("hidden");
  } else {
    els.barAlerte.classList.add("hidden");
  }
  // Ligne de vie : dernier passage, prochain passage (échéance réelle de
  // l'alarme, jamais une estimation).
  if (!state.session || state.dernierPoll == null) { els.life.classList.add("hidden"); return; }
  const ecoule = Date.now() - state.dernierPoll;
  const froid = ecoule > 60 * 60 * 1000;
  const suite = !froid && state.prochainPoll && state.prochainPoll > Date.now()
    ? ` · prochain <b>${escapeHtml(dansCombien(state.prochainPoll - Date.now()))}</b>`
    : "";
  els.life.innerHTML =
    `<span class="bdot${froid ? " cold" : ""}"></span>` +
    `<span>${froid ? "En veille · dernier passage" : "Dernier passage"} ${escapeHtml(ilYA(ecoule))}${suite}</span>`;
  els.life.classList.remove("hidden");
}

// ── Maintien en éveil (2026-09-04) ──────────────────────────────────────────
// Une ligne, présente UNIQUEMENT tant que le maintien est actif. Personne ne
// doit découvrir après coup que son ordinateur n'a pas dormi.
function renderAwake() {
  if (!state.eveil) { els.awake.classList.add("hidden"); return; }
  els.awake.innerHTML =
    '<span class="bdot"></span>' +
    "<span>FillSell garde ton ordinateur éveillé pendant la publication</span>";
  els.awake.classList.remove("hidden");
}

// ── Bascule de compte FillSell en attente (2026-09-03, incident Nadège) ──────
// fillsell.app est connecté avec un AUTRE compte que celui rattaché à cette
// extension : rien n'a été basculé tout seul — c'est CE clic qui décide.
function renderSwitch() {
  const sw = state.pendingSwitch;
  if (!sw) { els.switchBox.classList.add("hidden"); return; }
  const versQui = sw.email ? escapeHtml(sw.email) : "un autre compte";
  const actuel = sw.actuel ? ` (actuellement : ${escapeHtml(sw.actuel)})` : "";
  els.switchBox.innerHTML =
    `<div class="card peach why"><i class="dot peach pulse"></i><div class="why-body">` +
    `<div class="why-t">Changer de compte FillSell ?</div>` +
    `<div class="why-s">fillsell.app est connecté avec <b>${versQui}</b>, mais cette extension est rattachée à un autre compte${actuel}. Rien n'a été changé sans toi.</div>` +
    `<div class="switch-btns">` +
    `<button id="switch-ok" class="btn-full" type="button">Basculer l'extension</button>` +
    `<button id="switch-no" class="btn-ghost" type="button">Rester</button>` +
    `</div></div></div>`;
  els.switchBox.classList.remove("hidden");
  const ok = document.getElementById("switch-ok");
  const no = document.getElementById("switch-no");
  if (ok) ok.addEventListener("click", async () => {
    ok.disabled = true; ok.textContent = "Bascule…";
    try {
      const r = await chrome.runtime.sendMessage({ type: "CONFIRM_ACCOUNT_SWITCH" });
      if (r?.ok) { state.pendingSwitch = null; load(); }
      else {
        ok.textContent = r?.reason === "session_perimee"
          ? "Rouvre fillsell.app connecté, puis reviens ici"
          : "Impossible — réessaie";
      }
    } catch { ok.textContent = "Impossible — réessaie"; }
  });
  if (no) no.addEventListener("click", async () => {
    try { await chrome.runtime.sendMessage({ type: "DISMISS_ACCOUNT_SWITCH" }); } catch { /* re-proposé à la prochaine visite du site */ }
    state.pendingSwitch = null;
    renderSwitch();
  });
}

function renderPlateformes() {
  if (!state.session) { els.plateformes.classList.add("hidden"); return; }
  // ── LES QUATRE LIGNES SONT TOUJOURS LÀ (2026-09-08, correction Nico) ──────
  // Faire DISPARAÎTRE une plateforme dont on ne sait rien, c'est répondre à la
  // question par l'absence : vu sur écran réel, Beebs s'évanouissait et on
  // croyait la plateforme retirée. Une ligne muette dit deux choses vraies à la
  // fois — la plateforme est bien là, et on n'a rien mesuré sur elle.
  // Logo et nom en gris, AUCUNE pastille, AUCUN mot : on n'affirme rien.
  const lignes = [];
  let sues = 0;
  for (const p of PLATFORMS) {
    const { etat, sous } = state.etats[p.key] ?? { etat: null, sous: null };
    const nom = escapeHtml(p.name);
    if (etat === "ok") {
      lignes.push(
        `<div class="plat">${logoHtml(p.key)}<div class="plat-txt"><div class="plat-nom">${nom}</div>` +
        `${sous ? `<div class="plat-sous">${escapeHtml(sous)}</div>` : ""}</div>` +
        `<span class="etat ok"><i class="dot teal pulse"></i>Connectée</span></div>`,
      );
    } else if (etat === "ko") {
      // Session fermée : le mot, et le bouton qui ouvre le site.
      lignes.push(
        `<div class="plat">${logoHtml(p.key)}<div class="plat-txt"><div class="plat-nom">${nom}</div>` +
        `<div class="plat-sous"><i class="dot gris"></i>${escapeHtml(sous || "Session fermée")}</div></div>` +
        `<button class="btn-outline" data-connect="${p.key}" type="button">Se connecter</button></div>`,
      );
    } else if (etat === "bloquee") {
      // Bloquée = un refus CHALLENGE de moins de 30 min : le geste est sur le
      // site (passer la vérification), pas « reconnecte-toi ».
      lignes.push(
        `<div class="plat bloquee">${logoHtml(p.key)}<div class="plat-txt">` +
        `<div class="plat-ligne"><span class="plat-nom">${nom}</span>` +
        `<span class="etat ko"><i class="dot peach pulse"></i>Bloquée</span></div>` +
        `${sous ? `<div class="plat-sous">${escapeHtml(sous)}</div>` : ""}` +
        `<button class="lien" data-connect="${p.key}" type="button">Ouvrir ${escapeHtml(hostOf(p.key))} <span aria-hidden="true">→</span></button>` +
        `</div></div>`,
      );
    } else {
      lignes.push(`<div class="plat muette">${logoHtml(p.key)}<div class="plat-txt"><div class="plat-nom">${nom}</div></div></div>`);
    }
    if (etat) sues++;
  }
  // Rien de mesuré sur AUCUNE des quatre : le bloc n'apprendrait rien.
  if (!sues) { els.plateformes.classList.add("hidden"); return; }
  const age = state.sondeFraiche
    ? `<div class="plat-vu">Vérifié ${escapeHtml(ilYA(Date.now() - state.sondeVu))}</div>`
    : "";
  els.platList.innerHTML = `<div class="card">${lignes.join("")}</div>${age}`;
  els.plateformes.classList.remove("hidden");
}

// ── En cours : QUI, ET SUR QUOI (2026-09-08) ─────────────────────────────────
// « Publication en cours sur 1 plateforme » ne disait ni laquelle ni lequel —
// et l'article déposé n'est PAS celui affiché en « Prête à publier ». Chaque
// carte nomme la plateforme ET l'article, titre entier. La barre est un signe
// d'activité (rien ne mesure une progression), pas un pourcentage.
function carteEnCours({ photo, emoji, logo, tag, titre, delai }) {
  const thumb = photo
    ? `<img class="thumb" src="${escapeHtml(photo)}" alt="" referrerpolicy="no-referrer" />`
    : `<div class="thumb">${emoji ?? "📦"}</div>`;
  const t = String(titre ?? "").trim();
  return `<div class="card encours">${thumb}<div class="encours-body">` +
    `<div class="encours-tag">${logoHtml(logo, "xs")}<span>${escapeHtml(tag)}</span></div>` +
    `${t ? `<div class="titre">${escapeHtml(t)}</div>` : ""}` +
    `<div class="barre"><div class="barre-fill" style="animation-delay:${(delai * 2.5).toFixed(1)}s"></div></div>` +
    `</div></div>`;
}

function renderNow() {
  if (!state.session) { els.now.classList.add("hidden"); return; }
  const cartes = [];
  const s = state.sync;
  if (s?.status === "running") {
    const vus = s.items_vus ?? 0;
    const detail = s.total_entries
      ? `${vus} articles sur ${s.total_entries}`
      : `${vus} ${pl(vus, "article lu", "articles lus")}`;
    cartes.push(carteEnCours({ emoji: "🔄", logo: "vinted", tag: "Vinted · synchronisation du dressing", titre: detail, delai: 0 }));
  }
  let i = 0;
  for (const j of state.jobs.filter((x) => x.status === "processing")) {
    cartes.push(carteEnCours({
      photo: photoUrl(j.photos), logo: j.platform,
      tag: `${nomPlateforme(j.platform)} · publication`, titre: j.title, delai: i++,
    }));
  }
  for (const j of state.repub.filter((x) => x.status === "processing")) {
    const etape = REPUB_ETAPES[j.platform_fields?.republish_step ?? "a_capturer"] ?? "";
    cartes.push(carteEnCours({
      photo: photoUrl(j.photos), logo: j.platform,
      tag: `${nomPlateforme(j.platform)} · republication${etape ? ` · ${etape}` : ""}`, titre: j.title, delai: i++,
    }));
  }
  if (!cartes.length) { els.now.classList.add("hidden"); return; }
  const nArt = i;
  const pastille = nArt ? `${nArt} ${pl(nArt, "article", "articles")}` : "dressing";
  els.now.innerHTML =
    `<div class="sec-head"><span class="eyebrow">En cours</span>` +
    `<span class="pill-mini"><i class="spin"></i>${escapeHtml(pastille)}</span></div>` +
    `<div class="stack">${cartes.join("")}</div>`;
  els.now.classList.remove("hidden");
}

// ── Prête à publier ──────────────────────────────────────────────────────────
// La ligne d'état sous le prix ne dit que ce qui est mesuré : un dépôt en
// cours, une plateforme fermée qui retient la ligne, une extension qui ne
// passe plus, sinon le régime normal d'un job pending — il part au poll.
function etatPrete(a) {
  const entries = Object.entries(a.byPlatform);
  const noms = (keys) => enumerer(keys.map(nomPlateforme));
  const enCours = entries
    .filter(([k, j]) => j.status === "processing" || ["busy", "queued"].includes(state.status[k]?.phase))
    .map(([k]) => k);
  if (enCours.length) {
    return { cls: "", html: `<i class="spin"></i>Publication en cours sur ${escapeHtml(noms(enCours))}` };
  }
  const phases = entries.map(([k]) => state.status[k]?.phase).filter(Boolean);
  if (phases.length && phases.length === entries.length && phases.every((ph) => ph === "done")) {
    return { cls: "", html: `${CHECK_SVG}Publiée` };
  }
  if (phases.some((ph) => ph === "err" || ph === "connect")) {
    return { cls: "peach", html: `<i class="dot peach"></i>Un dépôt n'a pas abouti — le détail est ci-dessous` };
  }
  const ko = entries.filter(([k, j]) => j.status === "pending" && estKo(k)).map(([k]) => k);
  if (ko.length) {
    return {
      cls: "peach",
      html: `<i class="dot peach pulse"></i>Partira dès que ${escapeHtml(noms(ko))} ${pl(ko.length, "est rouvert", "sont rouverts")}`,
    };
  }
  if (extensionFroide()) {
    return { cls: "gris", html: `<i class="dot gris"></i>Partira au prochain passage de l'extension` };
  }
  return { cls: "", html: `<span class="dots"><i></i><i></i><i></i></span>Part au prochain passage` };
}

function renderPrete() {
  if (!state.session) {
    els.listing.innerHTML =
      `<div class="card vide"><div class="vide-ico">🔐</div>` +
      `<div class="vide-t">Connecte-toi pour voir ta file</div>` +
      `<div class="vide-s">Ouvre fillsell.app et connecte-toi : l'extension récupère ta session.</div>` +
      `<button class="cta" data-login type="button">Se connecter <span aria-hidden="true">→</span></button></div>`;
    return;
  }
  const a = state.annonce;
  if (!a) {
    els.listing.innerHTML =
      `<div class="card vide"><div class="vide-ico">🪄</div>` +
      `<div class="vide-t">Aucune annonce à publier</div>` +
      `<div class="vide-s">Crée-en une dans FillSell, elle apparaîtra ici prête à diffuser.</div>` +
      `<button class="cta" data-open-app type="button">Créer une annonce <span aria-hidden="true">→</span></button></div>`;
    return;
  }
  // Vignette 78 px sur fond clair : à 56 px sur fond sombre, une photo portée
  // ne permettait pas de reconnaître l'article.
  const thumb = a.photo
    ? `<img class="thumb" src="${escapeHtml(a.photo)}" alt="" referrerpolicy="no-referrer" />`
    : `<div class="thumb">📦</div>`;
  const prix = a.price != null && a.price !== "" ? `<span class="prix">${escapeHtml(euro(a.price))}</span>` : "";
  // La famille de catégorie telle que le job la porte (un MOT, depuis la
  // sortie de l'emoji du 07/09) — jamais une icône devinée ici.
  const chip = a.tag ? `<span class="chip">${escapeHtml(a.tag)}</span>` : "";
  const et = etatPrete(a);
  els.listing.innerHTML =
    `<div class="card"><div class="prete-top">${thumb}<div class="prete-body">` +
    `<div class="titre">${escapeHtml(a.title)}</div>` +
    `${prix || chip ? `<div class="prete-meta">${prix}${chip}</div>` : ""}` +
    `<div class="prete-etat ${et.cls}">${et.html}</div>` +
    `</div></div>` +
    `<div class="prete-bas"><div class="eyebrow soft">Diffuser sur</div><div id="flow" class="grid"></div></div></div>`;
  renderFlow();
}

// L'article affiché est-il DÉJÀ en ligne sur cette plateforme ? Vrai seulement
// si le serveur l'a MESURÉ pour CET article (même inventaire_id que l'annonce
// affichée — le choix de l'article est le même des deux côtés, mais on ne se
// fie qu'à l'identifiant) et l'a dit vrai. Tout le reste = non.
function dejaEnLigne(key) {
  const d = state.dejaEnLigne;
  if (!d || !state.annonce || state.annonce.key !== `inv:${d.inventaire_id}`) return false;
  return d.plateformes?.[key] === true;
}

// « Diffuser sur » : un ÉTAT par plateforme, plus une sélection (le bouton
// « Publier maintenant » a été retiré le 08/09 — les jobs partent seuls au poll).
function renderFlow() {
  const flow = document.getElementById("flow");
  if (!flow) return;
  const cells = [];
  for (const p of PLATFORMS) {
    const s = rowState(p);
    const st = state.status[p.key];
    const rec = state.recent[p.key];
    let cls = "gris";
    let droite = "";
    if (s === "ready") {
      // Le job part TOUT SEUL au prochain poll — sauf si sa plateforme est
      // mesurée fermée ou bloquée : même mot, couleur d'attente.
      const retenu = estKo(p.key);
      cls = retenu ? "peach" : "teal";
      droite = `<span class="cell-etat${retenu ? " peach" : ""}">En file</span>`;
    } else if (s === "queued") {
      // En attente de son tour (publication SÉQUENTIELLE plateforme par plateforme).
      cls = "teal";
      droite = `<span class="cell-etat"><i class="dot peach pulse"></i>En attente…</span>`;
    } else if (s === "busy") {
      cls = "teal";
      droite = `<span class="cell-etat"><i class="spin"></i>Publication…</span>`;
    } else if (s === "done") {
      cls = "teal";
      const msg = st?.msg || (rec?.status === "dry_run_completed" ? "Prêt (test)" : "Publiée");
      droite = `<span class="cell-etat">${CHECK_SVG}${escapeHtml(msg)}</span>`;
    } else if (s === "connect") {
      cls = "peach";
      droite = `<button class="lien" data-connect="${p.key}" type="button">Se connecter</button>`;
    } else if (s === "err") {
      cls = "peach";
      const complet = st?.msg || rec?.error || "Échec";
      droite = `<span class="cell-etat peach" title="${escapeHtml(complet)}">Échec</span>`;
    } else if (s === "soon") {
      droite = `<span class="cell-etat gris">Bientôt</span>`;
    } else if (dejaEnLigne(p.key)) {
      // ── « DÉJÀ EN LIGNE » (2026-09-08, décision Nico) ─────────────────────
      // « Non incluse », puis « Pas dans cet envoi », se lisaient sur des
      // plateformes où l'article était en réalité DÉJÀ publié (Blouse blanche :
      // trois fois sur quatre). Le serveur le dit désormais pour l'article
      // affiché — Vinted par inventaire.vinted_item_id, les trois autres par un
      // job 'published' STRICTEMENT — lu à l'ouverture du popup seulement.
      // ⛔ PUREMENT INFORMATIF : cette case ne filtre, ne retient ni ne décale
      // rien. Un job présent sur la plateforme garde son propre état (branches
      // ci-dessus) ; on n'arrive ici qu'en l'absence de job et de résultat.
      cls = "teal";
      droite = `<span class="cell-etat">${CHECK_SVG}Déjà en ligne</span>`;
    } else {
      // On dit que ce dépôt-ci ne concerne pas la plateforme, ce qui est vrai
      // dans tous les cas — y compris quand « déjà en ligne » n'a pas pu être
      // mesuré : on ne l'affiche JAMAIS par défaut.
      droite = `<span class="cell-etat gris">Pas dans cet envoi</span>`;
    }
    cells.push(
      `<div class="cell ${cls}">${logoHtml(p.key, "sm")}<span class="cell-nom">${escapeHtml(p.name)}</span>${droite}</div>`,
    );
  }
  flow.innerHTML = cells.join("");
}

// ── En attente : le nombre, puis les motifs ──────────────────────────────────
function renderAttente() {
  // Lecture en échec : on n'a rien mesuré, on ne dit rien — surtout pas
  // « rien n'attend ».
  if (!state.session || state.lectureOk === false) { els.attente.classList.add("hidden"); return; }
  // Le total fait foi quand le serveur l'a rendu (source unique partagée avec
  // le bandeau de l'app) ; sinon le compte local, comme avant.
  const n = state.attenteTotal ?? state.besoinGeste.length;
  if (!n) {
    // Des republications retenues par le mauvais dressing attendent bien un
    // geste : c'est dit dans « Pourquoi ça attend », on ne le contredit pas ici.
    if (state.boutiquePause?.retenus) { els.attente.classList.add("hidden"); return; }
    els.attente.innerHTML =
      `<div class="eyebrow">En attente</div>` +
      `<div class="card rien"><span class="tick">${CHECK_SVG}</span><div>Rien n'attend ton intervention</div></div>`;
    els.attente.classList.remove("hidden");
    return;
  }
  // Un nombre seul n'aide personne : les jobs sont DÉJÀ dans le popup avec
  // leur texte d'erreur — on les regroupe par tête de message ancrée.
  const familles = motifsDominants(state.besoinGeste);
  const lignes = familles.map((f) =>
    `<div class="motif"><span class="motif-n">${f.n}</span><span class="motif-sep"></span>` +
    `<span>${escapeHtml(FAMILLES[f.famille].court(f.n))}</span></div>`,
  ).join("");
  els.attente.innerHTML =
    `<div class="eyebrow">En attente</div>` +
    `<div class="card att"><div class="att-head"><span class="att-n">${n}</span>` +
    `<span class="att-t">${pl(n, "annonce attend", "annonces attendent")} un geste de ta part</span></div>` +
    `${lignes ? `<div class="att-list">${lignes}</div>` : ""}</div>`;
  els.attente.classList.remove("hidden");
}

// ── Pourquoi ça attend : chaque cause avec le geste qui la lève ──────────────
function renderPourquoi() {
  if (!state.session) { els.pourquoi.classList.add("hidden"); return; }
  const cartes = [];
  // ── LE DRESSING QUI NE CORRESPOND PAS (2026-09-08) ───────────────────────
  // get-pending-jobs calcule `boutique_pause` à chaque poll depuis le 04/09 et
  // PERSONNE ne l'affichait — alors que c'est la seule explication d'une file
  // Vinted qui ne s'écoule pas (mesuré chez ornellaracano : 70 republications
  // immobiles, Chrome connecté à l'autre boutique). Cause + geste, rien d'autre.
  const bp = state.boutiquePause;
  if (bp?.retenus) {
    const origine = Object.entries(bp.par_boutique ?? {})
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    // Pseudo quand on l'a, identifiant sinon — jamais un pseudo deviné.
    const pseudo = origine ? (bp.par_boutique_login?.[origine] ?? null) : null;
    const quelDressing = pseudo ? `@${pseudo}` : (origine ? `nº ${origine}` : "un autre dressing");
    const connectee = bp.connectee?.login ? `@${bp.connectee.login}` : "un autre compte";
    const nb = bp.retenus;
    cartes.push(
      `<div class="card peach why"><i class="dot peach pulse"></i><div class="why-body">` +
      `<div class="why-t">${nb} ${pl(nb, "republication", "republications")} sur le dressing <span class="qui">${escapeHtml(quelDressing)}</span></div>` +
      `<div class="why-s">Chrome est connecté à <b>${escapeHtml(connectee)}</b>. Change de compte sur vinted.fr, elles repartiront seules.</div>` +
      `<button class="lien" data-connect="vinted" type="button">Ouvrir vinted.fr <span aria-hidden="true">→</span></button>` +
      `</div></div>`,
    );
  }
  for (const f of motifsDominants(state.besoinGeste)) {
    const d = FAMILLES[f.famille];
    // La plateforme n'est nommée que si TOUS les jobs de la famille la partagent.
    const pf = f.plateformes.size === 1 ? nomPlateforme([...f.plateformes][0]) : null;
    const lien = d.lien === "app"
      ? `<button class="lien" data-open-app type="button">Ouvrir l'appli, onglet Stock IA <span aria-hidden="true">→</span></button>`
      : `<button class="lien" data-connect="${d.lien}" type="button">Ouvrir ${escapeHtml(hostOf(d.lien))} <span aria-hidden="true">→</span></button>`;
    cartes.push(
      `<div class="card why"><i class="dot gris"></i><div class="why-body">` +
      `<div class="why-t">${escapeHtml(d.titre(f.n, pf))}</div>` +
      `<div class="why-s">${escapeHtml(d.sous(f.n, pf, f.premier))}</div>` +
      `${lien}</div></div>`,
    );
  }
  if (!cartes.length) { els.pourquoi.classList.add("hidden"); return; }
  els.pourquoi.innerHTML = `<div class="eyebrow">Pourquoi ça attend</div><div class="stack">${cartes.join("")}</div>`;
  els.pourquoi.classList.remove("hidden");
}

// Étapes de republication, en clair. 'a_capturer' = rien n'a encore été
// touché ; 'deleted' = l'annonce est supprimée et la recréation reste à
// faire — c'est l'état qu'il faut savoir nommer sans inquiéter.
const REPUB_ETAPES = {
  a_capturer: "à relever",
  captured: "prête à republier",
  deleted: "recréation en attente",
  recreated: "recréée",
};

function renderQueueExtra() {
  if (!state.session) { els.queueExtra.classList.add("hidden"); return; }
  const lignes = [];
  const rep = state.repub.filter((j) => j.status !== "processing");
  if (rep.length) {
    const parEtape = {};
    for (const j of rep) {
      const e = REPUB_ETAPES[j.platform_fields?.republish_step ?? "a_capturer"] ?? "en file";
      parEtape[e] = (parEtape[e] ?? 0) + 1;
    }
    const detail = Object.entries(parEtape).map(([e, n]) => `${n} ${e}`).join(" · ");
    lignes.push(`🔁 <b>${rep.length} ${pl(rep.length, "republication", "republications")}</b> — ${escapeHtml(detail)}`);
  }
  // Prochain geste PRÉVU, avec son heure : les pauses de 2-5 min entre
  // suppression et recréation sont VOLONTAIRES — sans cette ligne, on croit
  // que c'est planté. next_action_after est la seule heure réelle.
  let prochaine = null;
  for (const j of state.repub) {
    const naa = Date.parse(j.platform_fields?.next_action_after ?? "");
    if (Number.isFinite(naa) && naa > Date.now() && (!prochaine || naa < prochaine)) prochaine = naa;
  }
  if (prochaine) {
    const h = new Date(prochaine).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    lignes.push(`⏱️ <b>Prochaine recréation vers ${escapeHtml(h)}</b> — j'espace volontairement mes gestes de quelques minutes, comme le ferait une vraie personne`);
  }
  if (state.sync?.status === "queued") {
    lignes.push(`🔄 <b>Synchronisation demandée</b> — elle part à mon prochain passage`);
  }
  // Dernier résultat de republication (< 30 min) quand plus rien n'est en file.
  if (!state.repub.length && state.recentRepub) {
    const r = state.recentRepub;
    if (r.status === "published") lignes.push(`🔁 <b>Republication terminée</b> ✓`);
    else if (r.status === "dry_run_completed") lignes.push(`🔁 <b>Republication testée</b> (dry run) ✓`);
    else if (r.status === "needsUser") lignes.push(`🔁 <b>Republication à relancer</b> depuis l'appli`);
  }
  if (!lignes.length) { els.queueExtra.classList.add("hidden"); return; }
  els.queueExtra.innerHTML =
    `<div class="eyebrow">Aussi en file</div><div class="card extra">` +
    lignes.map((l) => `<div class="extra-l">${l}</div>`).join("") +
    `</div>`;
  els.queueExtra.classList.remove("hidden");
}

function renderFooter() {
  // Le compteur dit LA FILE, pas une partie d'elle (republications comprises).
  const repub = state.repub ?? [];
  const tous = [...state.jobs, ...repub];
  const n = tous.length;
  // « en pause » n'est écrit que si TOUT ce qui est pending est retenu pour
  // une cause mesurée : plateforme fermée/bloquée, ou republications que le
  // serveur dit retenir (mauvais dressing) — au moins autant que la file.
  const pending = tous.filter((j) => j.status === "pending");
  const bp = state.boutiquePause;
  const enPause = pending.length > 0 && (
    pending.every((j) => estKo(j.platform)) ||
    (pending.every((j) => j.action === "republish") && (bp?.retenus ?? 0) >= pending.length)
  );
  els.queueLabel.textContent = `${n} en file${enPause ? " · en pause" : ""}`;
  els.queue.classList.toggle("zero", n === 0);
  els.queue.classList.toggle("pause", n > 0 && enPause);
}

function renderDiag() {
  const v = chrome.runtime.getManifest().version;
  els.diag.textContent = `v${v}`;
  els.diag.classList.toggle("hidden", !state.session);
}

function render() {
  calculerEtats();
  renderAccount();
  renderBars();
  renderAwake();
  renderSwitch();
  renderPlateformes();
  renderNow();
  renderPrete();
  renderAttente();
  renderPourquoi();
  renderQueueExtra();
  renderFooter();
  renderDiag();
}

// Ce qui doit suivre le DIRECT (événements du poll pendant que le popup est
// ouvert) : un refus « CHALLENGE » ou « Connexion Beebs requise » qui arrive
// doit changer la ligne tout de suite, sans attendre une réouverture.
function renderVif() {
  calculerEtats();
  renderAccount();
  renderBars();
  renderPlateformes();
  renderPrete();
  renderFooter();
}

// ── Interactions ─────────────────────────────────────────────────────────────

function openLogin() {
  chrome.tabs.create({ url: FILLSELL_CONFIG.AUTH_URL });
  window.close();
}
function openApp() {
  chrome.tabs.create({ url: APP_URL });
  window.close();
}

// Déconnexion explicite (fix 2026-07-11) : connecté, le 1er clic sur la
// pastille arme une confirmation inline ("Se déconnecter ?", 4 s), le 2e la
// exécute — storage purgé, re-render immédiat. Ni confirm() natif (dialog
// modal qui gèle le popup) ni menu dropdown.
let logoutArm = null;
els.acct.addEventListener("click", async () => {
  if (!state.session) { openLogin(); return; }
  if (logoutArm) {
    clearTimeout(logoutArm);
    logoutArm = null;
    // Les DEUX sessions (fix 2026-08-01) : ne retirer que la copie relayée
    // laissait vivre la session PROPRE (fillsell_session_own). La déconnexion
    // doit être un vrai reset : sessions + délai anti-rafale de bootstrap.
    await chrome.storage.local.remove([SESSION, SESSION_OWN, BOOTSTRAP_LAST_FAIL]);
    state.session = null;
    load();
    return;
  }
  els.acctLabel.textContent = "Se déconnecter ?";
  logoutArm = setTimeout(() => { logoutArm = null; renderAccount(); }, 4000);
});

els.history.addEventListener("click", openApp);
els.openApp.addEventListener("click", openApp);

// Délégation : « Se connecter » / « Ouvrir <site> » sur une ligne ou une carte,
// « Ouvrir l'appli », « Se connecter » à FillSell. Aucune de ces actions ne
// publie quoi que ce soit — elles ouvrent un onglet.
document.body.addEventListener("click", (e) => {
  const connect = e.target.closest("[data-connect]");
  if (connect) {
    const p = PLATFORMS.find((x) => x.key === connect.getAttribute("data-connect"));
    if (p) { chrome.tabs.create({ url: p.loginUrl }); window.close(); }
    return;
  }
  if (e.target.closest("[data-open-app]")) { openApp(); return; }
  if (e.target.closest("[data-login]")) openLogin();
});

// ── Direct ───────────────────────────────────────────────────────────────────
// Les états par plateforme arrivent en direct via FILLSELL_PROGRESS, poussés
// par le background pendant la publication. Ils viennent du poll, pas d'un
// clic : le popup n'a plus de déclencheur manuel (« Publier maintenant »
// retiré le 08/09 — les jobs partent seuls, et un job qui n'est pas parti a
// toujours une cause, que l'écran nomme). Le handler PUBLISH_NOW du background
// n'est pas touché ; il n'a simplement plus d'appelant.
const CONN_RE = /(se\s*)?connect|connexion|identifi|login|sign[-\s]?in|non connect|session (expir|invalide)/i;
const isConnErr = (msg) => CONN_RE.test(String(msg || ""));
const shortErr = (msg) => {
  const s = String(msg || "Échec").replace(/\s+/g, " ").trim();
  return s.length > 42 ? s.slice(0, 41) + "…" : s;
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "FILLSELL_PROGRESS") return;
  const key = msg.platform;
  if (!PLATFORMS.some((p) => p.key === key)) return;
  // Filtre par jobId (2026-07-18) : le flux POLL émet aussi la progression de
  // jobs d'une AUTRE annonce ou de jobs delete. Sans ce filtre, leur
  // progression peindrait les cases de l'annonce affichée.
  const job = state.annonce?.byPlatform[key];
  if (!job || (msg.jobId != null && String(msg.jobId) !== String(job.id))) return;
  switch (msg.phase) {
    case "queued":             state.status[key] = { phase: "queued" }; break;
    case "processing":         state.status[key] = { phase: "busy" }; break;
    case "published":          state.status[key] = { phase: "done", msg: "Publiée" }; break;
    case "dry_run_completed":  state.status[key] = { phase: "done", msg: "Prêt (test)" }; break;
    case "needsUser":
    case "failed":
    case "retry":
      state.status[key] = isConnErr(msg.error)
        ? { phase: "connect" }
        : { phase: "err", msg: shortErr(msg.error) };
      break;
    default: break;
  }
  renderVif();
});

// Re-render si le background met à jour la session pendant que le popup est
// ouvert. Pendant une publication, on ne recharge pas (ça écraserait les états
// live). RECENT_RESULTS inclus : le poll de fond qui termine un job re-render
// le popup DÉJÀ OUVERT. SESSION_OWN inclus : sa purge par le background doit
// faire passer un popup ouvert à « Se connecter » en direct.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes[SESSION] || changes[SESSION_OWN] || changes[LAST_POLL] || changes[RECENT_RESULTS]) && !state.publishing) load();
});

load();
