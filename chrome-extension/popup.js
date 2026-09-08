// Popup FillSell — cross-post.
// Rendu entièrement piloté par les vraies données :
//   - session FillSell : chrome.storage.local["fillsell_session"] (posée par
//     content-scripts/fillsell-auth.js via le background) ;
//   - annonces en file : edge function get-pending-jobs (même source que le
//     poll du background), lue ici en lecture seule pour l'affichage.
// La publication réelle passe par le background (POLL_NOW aujourd'hui,
// PUBLISH_NOW ciblé au commit suivant) — jamais réécrite ici.

const { SESSION, SESSION_OWN, BOOTSTRAP_LAST_FAIL, LAST_POLL, RECENT_RESULTS, KEEP_AWAKE } = FILLSELL_CONFIG.STORAGE_KEYS;
// Le marqueur d'éveil est PERSISTÉ (le service worker MV3 meurt sans arrêt) :
// il peut donc survivre à un Chrome fermé en plein lot. On ne l'affiche que
// s'il a été rafraîchi récemment — sinon il ne prouve plus rien.
const EVEIL_FRAICHEUR_MS = 5 * 60 * 1000;

// Plateformes affichées, de haut en bas. `supported:false` => "Bientôt"
// (ligne atténuée, non sélectionnable). Beebs passé à true le 2026-07-11 :
// le flag n'avait jamais suivi le handler (content-scripts/beebs.js complet
// depuis le 2026-07-08, implemented:true côté background, DRY_RUN=true comme
// les 3 autres — aucune publication réelle possible à ce stade).
const PLATFORMS = [
  { key: "vinted",    name: "Vinted",    supported: true, loginUrl: "https://www.vinted.fr/" },
  { key: "leboncoin", name: "Leboncoin", supported: true, loginUrl: "https://www.leboncoin.fr/" },
  { key: "ebay",      name: "eBay",      supported: true, loginUrl: "https://www.ebay.fr/" },
  { key: "beebs",     name: "Beebs",     supported: true, loginUrl: "https://www.beebs.app/" },
];

const CHECK_TEAL = '<svg class="icon-check" viewBox="0 0 24 24" fill="none" stroke="#1B6E62" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

const els = {
  brandLogo: document.getElementById("brand-logo"),
  acct: document.getElementById("acct"),
  acctLabel: document.getElementById("acct-label"),
  listing: document.getElementById("listing-card"),
  flow: document.getElementById("flow"),
  plateformes: document.getElementById("plateformes"),
  platList: document.getElementById("plat-list"),
  queueLabel: document.getElementById("queue-label"),
  history: document.getElementById("history"),
  life: document.getElementById("life"),
  awake: document.getElementById("awake"),
  alerts: document.getElementById("alerts"),
  now: document.getElementById("now"),
  queueExtra: document.getElementById("queue-extra"),
  diag: document.getElementById("diag"),
};

const state = {
  session: null,        // { access_token, email, ... }
  jobs: [],             // jobs pending de PUBLICATION (republish exclus, cf. splitRepublish)
  repub: [],            // jobs republish pending/processing — ligne d'état au footer
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
  // Calculé par get-pending-jobs à chaque poll depuis le 04/09 et jamais lu
  // jusqu'ici : c'est LA cause des files Vinted qui ne s'écoulent pas.
  boutiquePause: null,  // { connectee:{login}, retenus, par_boutique, par_boutique_login }
  eveil: null,          // épisode de maintien en éveil en cours, ou null
  dernierPoll: null,    // chrome.storage.local LAST_POLL
  prochainPoll: null,   // chrome.alarms — échéance réelle, pas une estimation
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function decodeJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch { return null; }
}

function euro(v) {
  if (v == null || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? `${n} €` : `${v} €`;
}

// Regroupe les jobs pending en "annonces" (une annonce = plusieurs lignes
// plateforme du même article). Clé : inventaire_id, sinon le titre.
function firstAnnonce(jobs) {
  if (!jobs.length) return null;
  const groups = new Map();
  for (const j of jobs) {
    const key = j.inventaire_id != null ? `inv:${j.inventaire_id}` : `title:${j.title || j.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(j);
  }
  const [key, group] = [...groups.entries()][0];
  const head = group[0];
  const byPlatform = {};
  for (const j of group) byPlatform[j.platform] = j;
  // photos = tableau d'OBJETS { url, type } (pas de simples chaînes) : la carte
  // affichait <img src="[object Object]"> → vignette cassée. On extrait l'URL
  // (compat chaîne brute au cas où d'anciens jobs en portent).
  const firstPhoto = Array.isArray(head.photos) ? head.photos[0] : null;
  const photoUrl = firstPhoto
    ? (typeof firstPhoto === "string" ? firstPhoto : (firstPhoto.url ?? firstPhoto.src ?? null))
    : null;
  return {
    key,
    title: head.title || "Sans titre",
    price: head.price,
    photo: photoUrl,
    tag: head.platform_fields?.categorie || null,
    byPlatform,
  };
}

// Lecture seule des jobs à publier (affichage). La publication passe par le
// background, qui refait un getValidSession (refresh) de son côté.
// include_processing (2026-07-12) : on demande AUSSI les jobs déjà en cours.
// Sans ça, un job passé en 'processing' disparaissait de la liste et sa ligne
// retombait sur « Non incluse » alors qu'il était en train d'être publié —
// vécu sur Beebs (traité en dernier, donc souvent déjà en cours quand le popup
// relit la file, et l'événement live FILLSELL_PROGRESS est perdu si le popup
// était fermé à ce moment-là).
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
  // ── LE NOMBRE VIENT DU SERVEUR (2026-09-04) ─────────────────────────────
  // Le popup et le bandeau de l'app affichaient deux nombres différents pour
  // la même chose (« 6 opérations » ici, « 4 annonces » là-bas) parce que
  // chacun comptait de son côté sur un périmètre différent. get-pending-jobs
  // fait maintenant LE calcul, et les deux écrans lisent le même résultat.
  // Repli sur le compte local si le champ manque (fonction pas encore
  // déployée) : le popup n'affiche jamais rien de moins qu'avant.
  state.attenteTotal = Number.isFinite(data?.annonces_en_attente?.total)
    ? data.annonces_en_attente.total
    : null;
  // Les jobs action='delete' (retrait cross-plateforme, 2026-07-11) passent
  // par la même file mais ne sont PAS des annonces à publier : ils
  // n'apparaissent pas dans le popup et ne sont jamais ciblés par
  // PUBLISH_NOW — le poll de fond les exécute seul.
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  return jobs.filter((j) => j.action !== "delete");
}

// É5 popup (2026-08-05) : les jobs action='republish' ne sont PAS des annonces
// à publier — les mêler au flux de dépôt affichait « Publier maintenant » sur
// une opération qui SUPPRIME d'abord. Ils ont leur ligne d'état dédiée au
// footer (renderFooter), lisible et rassurante : en file, recréation en
// attente, en cours.
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
  // mort. L'ancienne lecture brute du storage ne testait que la présence
  // d'access_token → "Connecté" affiché avec un token périmé, impossible de
  // se reconnecter. Une seule source de vérité désormais.
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
      // ⚠️ Les jobs 'needs_user' sortent AVANT tout le reste. Mêlés au flux de
      // dépôt, ils deviendraient des « annonces à publier » sélectionnables,
      // et un clic sur « Publier maintenant » relancerait une opération qui
      // attend une décision humaine. Ils ont leur bloc, en tête.
      state.besoinGeste = tous.filter((j) => j.status === "needs_user");
      const actifs = tous.filter((j) => j.status !== "needs_user");
      const { repub, autres } = splitRepublish(actifs);
      state.jobs = autres;
      state.repub = repub;
    } catch (e) {
      console.warn("[popup] get-pending-jobs:", e);
      state.jobs = [];
      state.repub = [];
      state.besoinGeste = [];
    }
    // Signaux LOCAUX, gratuits et exacts : quand cette extension-ci est
    // passée, et quand elle repassera. On ne parle jamais du heartbeat
    // serveur ici — le popup EST l'extension, il se décrit lui-même.
    try {
      const st = await chrome.storage.local.get(LAST_POLL);
      state.dernierPoll = st?.[LAST_POLL] ? Date.parse(st[LAST_POLL]) : null;
    } catch { state.dernierPoll = null; }
    try {
      const al = await chrome.alarms.get("fillsell-poll-jobs");
      state.prochainPoll = al?.scheduledTime ?? null;
    } catch { state.prochainPoll = null; }
    // Maintien en éveil en cours (2026-09-04) — lecture SEULE d'un marqueur
    // écrit par le background. Le popup ne demande ni ne relâche rien.
    try {
      const ka = await chrome.storage.local.get(KEEP_AWAKE);
      const ep = ka?.[KEEP_AWAKE] ?? null;
      const frais = ep?.maj && Date.now() - Date.parse(ep.maj) < EVEIL_FRAICHEUR_MS;
      state.eveil = frais ? ep : null;
    } catch { state.eveil = null; }
    state.annonce = firstAnnonce(state.jobs);
    // Jobs terminés récemment par le poll de fond (Sujet 5) : ils sortent de
    // get-pending-jobs (status=pending only) → badge "Publié" au lieu de
    // "Non incluse". Match sur la MÊME annonce quand une annonce pending est
    // affichée, sinon sur le groupe terminé le plus récent (cas "tout est
    // fini", annonce=null).
    state.recent = {};
    try {
      const rr = await chrome.storage.local.get(RECENT_RESULTS);
      const now = Date.now();
      // Inclut désormais les ÉCHECS (failed/needsUser/retry) : un job terminé en
      // échec sort de get-pending-jobs et retombait sur « Non incluse » — on le
      // ré-affiche « Échec »/« À reconnecter » grâce à son résultat récent.
      const RECENT_TERMINAL = ["dry_run_completed", "published", "failed", "needsUser", "retry"];
      const fresh = Object.values(rr[RECENT_RESULTS] ?? {}).filter(
        (r) => now - (r.ts ?? 0) < 30 * 60 * 1000 && RECENT_TERMINAL.includes(r.status)
      );
      // ⚠️ Tri EXPLICITE du plus ancien au plus récent (2026-07-19, casquette
      // fec0c363) : l'ancien code triait `fresh` EN PLACE en ordre DÉCROISSANT
      // (uniquement pour choisir refKey, et uniquement quand la file était
      // vide) — la boucle d'affectation itérait alors du plus récent au plus
      // ancien et le PLUS VIEUX résultat écrasait les autres : trois jobs eBay
      // successifs de la même annonce (failed 13:39, published 13:58) →
      // popup « Échec : Publication eBay non confirmée » pendant que la base
      // disait published+URL. Le sort ne s'exécutant pas quand une annonce
      // est affichée (court-circuit ??), le bug n'apparaissait qu'une fois la
      // file VIDE — exactement le moment où on vient lire le verdict.
      // Ordre croissant assumé partout : le dernier écrit gagne, refKey = le
      // plus récent, dans les DEUX branches.
      fresh.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
      // É5 : les résultats de REPUBLICATION ne colorent pas les lignes du flux
      // de dépôt (un republish échoué affichait « Échec » sur Vinted alors
      // qu'aucune publication n'était en cause). Ils vivent au footer.
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
    state.recentRepub = null;
    state.annonce = null;
    state.recent = {};
  }
  state.status = {};
  render();
}

// ── Rendu ────────────────────────────────────────────────────────────────────

function renderAccount() {
  const on = Boolean(state.session);
  els.acct.classList.toggle("on", on);
  els.acct.classList.toggle("off", !on);
  // Cliquable dans les deux états depuis le fix 2026-07-11 (déconnexion) —
  // le CSS .acct ne met le pointer que sur .off, on l'impose ici plutôt que
  // de toucher popup.html.
  els.acct.style.cursor = "pointer";
  if (on) {
    const payload = decodeJwtPayload(state.session.access_token);
    const email = state.session.email || payload?.email || "";
    els.acctLabel.textContent = "Connecté";
    els.acct.title = email ? `${email} — cliquer pour se déconnecter` : "Cliquer pour se déconnecter";
  } else {
    els.acctLabel.textContent = "Se connecter";
    els.acct.title = "";
  }
}

function renderListing() {
  const a = state.annonce;
  if (!a) {
    els.listing.innerHTML = `
      <div class="empty">
        <div class="empty-emoji">🪄</div>
        <div class="empty-title">Aucune annonce à publier</div>
        <div class="empty-sub">Créez-en une dans FillSell,<br/>elle apparaîtra ici prête à diffuser.</div>
      </div>`;
    return;
  }
  const thumb = a.photo
    ? `<img class="listing-thumb" src="${a.photo}" alt="" referrerpolicy="no-referrer" />`
    : `<div class="listing-thumb">📦</div>`;
  const price = a.price != null && a.price !== "" ? `<span class="listing-price">${euro(a.price)}</span>` : "";
  const tag = a.tag ? `<span class="tag">${escapeHtml(a.tag)}</span>` : "";
  els.listing.innerHTML = `
    <div class="listing">
      ${thumb}
      <div class="listing-body">
        <div class="listing-title">${escapeHtml(a.title)}</div>
        <div class="listing-meta">${price}${tag}</div>
      </div>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Logo plateforme — assets bundlés en local (chrome-extension/assets/) :
// Vinted/eBay = tracé de marque sur socle blanc (SVG), Beebs/Leboncoin =
// icône d'app officielle (PNG). Réutilise les mêmes visuels que l'app.
const PLATFORM_LOGO = {
  vinted: "assets/vinted.svg",
  ebay: "assets/ebay.svg",
  leboncoin: "assets/leboncoin.png",
  beebs: "assets/beebs.png",
};
function platformLogo(p) {
  const src = PLATFORM_LOGO[p.key];
  return `<img class="plogo" src="${src}" alt="${p.name}" />`;
}

// État d'une ligne plateforme, dérivé de : supporté ? job présent ? statut de
// publication en cours ?
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
  // n'a reçu aucun événement live (popup fermé au moment du démarrage du job).
  // C'est ce qui affichait « Non incluse » sur Beebs pendant toute sa publication.
  if (job?.status === "processing") return "busy";
  // Lot en cours mais ce job pas encore démarré (popup ROUVERT en pleine
  // publication : les événements live du début de lot sont perdus) : la ligne
  // attend son tour — pas une coche de sélection statique ambiguë pendant
  // qu'une autre plateforme publie (capture du 2026-07-18).
  if (job) return batchRunning() ? "queued" : "ready";
  // Terminé (<30 min) par le poll de fond (Sujet 5). Désormais on distingue le
  // verdict réel du résultat récent : publié → « Publié », échec → « Échec »,
  // reconnexion → « Se connecter » — fini le « Non incluse » sur un job échoué.
  const rec = state.recent[p.key];
  if (rec) {
    if (rec.status === "published" || rec.status === "dry_run_completed") return "done";
    if (isConnErr(rec.error)) return "connect";
    return "err";
  }
  return "none";
}

function renderFlow() {
  els.flow.innerHTML = "";
  for (const p of PLATFORMS) {
    const s = rowState(p);
    const row = document.createElement("div");
    row.className = "prow";
    const actionable = s === "ready" || s === "connect";
    if (actionable) row.classList.add("actionable");
    if (s === "soon" || s === "none") row.classList.add("dim");

    const nodeClass = { ready: "ready", connect: "connect", soon: "soon", none: "none",
                        queued: "queued", busy: "busy", done: "done", err: "err" }[s];
    const st = state.status[p.key];
    const rec = state.recent[p.key];

    let right = "";
    if (s === "ready") {
      // Plus de case à cocher : le job part TOUT SEUL au prochain poll. On dit
      // donc où il en est, avec le mot que le popup emploie déjà en pied
      // d'écran (« N en file ») — rien de neuf à apprendre au vendeur.
      right = `<span class="badge-soft">En file</span>`;
    } else if (s === "connect") {
      right = `<button class="connect-btn" data-connect="${p.key}" type="button">Se connecter</button>`;
    } else if (s === "soon") {
      right = `<span class="badge-soft">Bientôt</span>`;
    } else if (s === "none") {
      // « Non incluse » (retiré le 08/09) laissait lire « pas connectée » ou
      // « ça ne marche pas ». Relevé sur le cas d'Ornella : l'article était en
      // réalité DÉJÀ PUBLIÉ sur les trois plateformes ainsi étiquetées. On ne
      // dit donc plus que la plateforme est exclue de quoi que ce soit — on dit
      // que ce dépôt-ci ne la concerne pas, ce qui est vrai dans tous les cas.
      right = `<span class="badge-soft">Pas dans cet envoi</span>`;
    } else if (s === "queued") {
      // En attente de son tour (publication SÉQUENTIELLE plateforme par plateforme).
      right = `<span class="status-wait"><span class="dot-wait"></span>En attente…</span>`;
    } else if (s === "busy") {
      right = `<span class="status-run"><span class="spinner"></span>Publication…</span>`;
    } else if (s === "done") {
      // Message live (state.status) sinon résultat récent (popup rouvert).
      const msg = st?.msg || (rec?.status === "dry_run_completed" ? "Prêt (test)" : "Publié");
      right = `<span class="status-ok">${CHECK_TEAL}${escapeHtml(msg)}</span>`;
    } else if (s === "err") {
      const msg = st?.msg || shortErr(rec?.error);
      right = `<span class="status-err" title="${escapeHtml(st?.msg || rec?.error || "Échec")}">${escapeHtml(msg || "Échec")}</span>`;
    }

    row.innerHTML = `
      <span class="pnode ${nodeClass}"></span>
      ${platformLogo(p)}
      <span class="pname">${p.name}</span>
      <span class="pstate">${right}</span>`;
    els.flow.appendChild(row);
  }
}

// Un lot est-il EN COURS ? state.publishing ne couvre que la publication lancée
// par CE popup : refermé puis ROUVERT en plein lot, il repart à false alors que
// la publication séquentielle continue côté background — les plateformes pas
// encore démarrées sont toujours 'pending', re-cochées par défaut, et le CTA
// redevenait cliquable en pleine publication (risque de re-soumission par
// réflexe ; le verrou de flux + le re-fetch du background évitaient la double
// annonce, mais le bouton MENTAIT). On dérive donc l'état du lot de ce qui est
// VISIBLE : phase live queued/busy (événements FILLSELL_PROGRESS) ou job de
// l'annonce 'processing' (visible via include_processing même popup rouvert).
function batchRunning() {
  if (state.publishing) return true;
  for (const st of Object.values(state.status)) {
    if (st && (st.phase === "queued" || st.phase === "busy")) return true;
  }
  // Snapshot 'processing' pris à l'ouverture — mais le LIVE prime : une fois
  // l'événement terminal reçu (done/err/connect), le snapshot est périmé et ne
  // doit pas garder le lot « en cours » (CTA gelé à vie popup ouvert).
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
// ne connaît pas tombe dans « autre motif » — jamais rangée de force.
// Vérifié sur les 27 jobs en attente d'ornellaracano le 08/09 : 17 + 6 + 3 + 1.
const MOTIFS_ANCRES = [
  { re: /^Republication en pause/i, libelle: "republications en pause — ton annonce est intacte" },
  { re: /^Ta republication attend/i, libelle: "republications en pause — ton annonce est intacte" },
  { re: /^(Connexion .+ requise|Session .+ (fermée|expirée))/i, libelle: "reconnexion demandée" },
  { re: /^CHALLENGE /, libelle: "vérification anti-robot à passer" },
  { re: /^Catégorie \S+ à confirmer/i, libelle: "catégorie à confirmer" },
  { re: /^(Aucun état|\S+ exige|LIVE : aspect)/i, libelle: "une information manque à la fiche" },
  { re: /^Un brouillon Leboncoin non terminé/i, libelle: "brouillon à supprimer sur Leboncoin" },
  { re: /^Publication non confirmée/i, libelle: "publication à vérifier sur la plateforme" },
];

// ⛔ DEUX FAMILLES NE SONT PAS RÉPÉTÉES ICI (2026-09-08, correction Nico) :
// « reconnexion demandée » et « vérification anti-robot à passer » se lisent
// DÉJÀ, en haut, sur la ligne de la plateforme concernée — « Session fermée »
// avec son bouton, « Bloquée » avec son geste. Les redire ici, c'était la même
// information à deux endroits, dans deux formulations, et sans le bouton.
// Le TOTAL, lui, ne bouge pas : il vient du serveur et reste celui du bandeau
// de l'app (source unique posée le 04/09). Cette liste n'a jamais été une
// décomposition du total — c'est un dessus de pile, déjà borné à 4 lignes.
const MOTIFS_DITS_AILLEURS = new Set(["reconnexion demandée", "vérification anti-robot à passer"]);

/** [{ libelle, n }] trié du plus nombreux au moins nombreux, 4 au plus. */
function motifsDominants(jobs) {
  const compte = new Map();
  for (const j of jobs ?? []) {
    const msg = String(j?.error ?? "").trim();
    const f = MOTIFS_ANCRES.find((m) => m.re.test(msg));
    const cle = f ? f.libelle : "autre motif";
    if (MOTIFS_DITS_AILLEURS.has(cle)) continue;
    compte.set(cle, (compte.get(cle) ?? 0) + 1);
  }
  return [...compte.entries()]
    .map(([libelle, n]) => ({ libelle, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 4);
}

// ── ÉTAT DES PLATEFORMES (2026-09-08) ────────────────────────────────────────
// La question qu'on se pose en ouvrant le popup, et qui n'était nulle part :
// quelle plateforme est joignable ? Tout vient de ce que l'extension a DÉJÀ —
// `contexte.sessions` (servi à chaque poll) et les verdicts des jobs. Aucune
// sonde, aucun appel.
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
    return { etat: "bloquee", sous: `Vérification anti-robot à passer sur ${p.name.toLowerCase()}` };
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

function renderPlateformes() {
  if (!state.session) { els.plateformes.classList.add("hidden"); return; }
  const s = state.sessions;
  const vu = s?.checked_at ? Date.parse(s.checked_at) : NaN;
  const sondeFraiche = Number.isFinite(vu) && Date.now() - vu < SESSIONS_FRAICHEUR_MS;

  // ── LES QUATRE LIGNES SONT TOUJOURS LÀ (2026-09-08, correction Nico) ──────
  // Faire DISPARAÎTRE une plateforme dont on ne sait rien, c'est répondre à la
  // question par l'absence : vu sur écran réel, Beebs s'évanouissait et on
  // croyait la plateforme retirée. Une ligne muette dit deux choses vraies à la
  // fois — la plateforme est bien là, et on n'a rien mesuré sur elle.
  // Logo et nom en gris, AUCUNE pastille, AUCUN mot : on n'affirme rien.
  const lignes = [];
  let sues = 0;
  for (const p of PLATFORMS) {
    const { etat, sous } = etatPlateforme(p, sondeFraiche);
    let droite = "";
    if (etat === "ko") {
      droite = `<button class="connect-btn" data-connect="${p.key}" type="button">Se connecter</button>`;
    } else if (etat === "bloquee") {
      droite = `<span class="plat-etat ko"><span class="plat-dot ko"></span>Bloquée</span>`;
    } else if (etat === "ok") {
      droite = `<span class="plat-etat ok"><span class="plat-dot ok"></span>Connectée</span>`;
    }
    if (etat) sues++;
    lignes.push(
      `<div class="plat${etat ? "" : " muette"}">${platformLogo(p)}` +
      `<div class="plat-txt"><div class="plat-nom">${escapeHtml(p.name)}</div>` +
      `${etat && sous ? `<div class="plat-sous">${escapeHtml(sous)}</div>` : ""}</div>` +
      `${droite}</div>`,
    );
  }
  // Rien de mesuré sur AUCUNE des quatre : le bloc n'apprendrait rien.
  if (!sues) { els.plateformes.classList.add("hidden"); return; }
  const age = sondeFraiche ? `<div class="plat-vu">Vérifié ${ilYA(Date.now() - vu)}.</div>` : "";
  els.platList.innerHTML = `<div class="bloc">${lignes.join("")}${age}</div>`;
  els.plateformes.classList.remove("hidden");
}

function renderFooter() {
  // Le compteur dit LA FILE, pas une partie d'elle. Il excluait les
  // republications sans le dire : « 0 en file » s'affichait pendant que trois
  // republications attendaient. Le DÉTAIL vit dans le bloc « Aussi en file »,
  // ce compteur n'en est que le total.
  const repub = state.repub ?? [];
  const n = state.jobs.length + repub.length;
  let texte = n === 0 ? "0 en file" : `${n} en file`;
  if (!repub.length && state.recentRepub) {
    const r = state.recentRepub;
    if (r.status === "published") texte += " · 🔁 republication terminée ✓";
    else if (r.status === "dry_run_completed") texte += " · 🔁 republication testée (dry run) ✓";
    else if (r.status === "needsUser") texte += " · 🔁 republication à relancer depuis l'app";
  }
  els.queueLabel.textContent = texte;
}

// ── Poste de pilotage (2026-08-04) ───────────────────────────────────────────
// Règle commune à tous ces blocs : ils n'existent QUE s'ils ont quelque chose
// à dire, et ils ne disent que ce dont on est SÛR. Une donnée dont on ne peut
// pas garantir la fraîcheur ne s'affiche pas — mieux vaut le silence qu'un
// voyant vert périmé.

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

function renderLife() {
  if (!state.session || state.dernierPoll == null) { els.life.classList.add("hidden"); return; }
  const ecoule = Date.now() - state.dernierPoll;
  // Au-delà d'une heure sans passage, on ne prétend plus que tout va bien :
  // la pastille s'éteint et le texte ne promet pas de prochain passage.
  const froid = ecoule > 60 * 60 * 1000;
  const suite = !froid && state.prochainPoll && state.prochainPoll > Date.now()
    ? ` · prochain ${dansCombien(state.prochainPoll - Date.now())}`
    : "";
  els.life.innerHTML =
    `<span class="dot${froid ? " cold" : ""}"></span>` +
    `<span>${froid ? "En veille" : "Active"} · dernier passage ${escapeHtml(ilYA(ecoule))}${escapeHtml(suite)}</span>`;
  els.life.classList.remove("hidden");
}

// ── Maintien en éveil (2026-09-04) ──────────────────────────────────────────
// Une ligne, présente UNIQUEMENT tant que le maintien est actif. Personne ne
// doit découvrir après coup que son ordinateur n'a pas dormi — et personne ne
// doit avoir à chercher pourquoi : c'est dit là où l'extension dit déjà ce
// qu'elle fait. Aucun réglage à créer : ça s'arrête tout seul avec la file.
function renderAwake() {
  if (!state.eveil) { els.awake.classList.add("hidden"); return; }
  els.awake.innerHTML =
    '<span class="dot awake"></span>' +
    "<span>FillSell garde ton ordinateur éveillé pendant la publication</span>";
  els.awake.classList.remove("hidden");
}

function renderAlerts() {
  // Le total fait foi quand le serveur l'a rendu (source unique partagée avec
  // le bandeau de l'app) ; sinon le compte local, comme avant.
  const n = state.attenteTotal ?? state.besoinGeste.length;
  // ── Bascule de compte FillSell en attente (2026-09-03, incident Nadège) ────
  // fillsell.app est connecté avec un AUTRE compte que celui rattaché à cette
  // extension : rien n'a été basculé tout seul — c'est CE clic qui décide.
  const sw = state.pendingSwitch;
  // `boutique_pause` compte lui aussi comme un blocage à dire : sans lui dans
  // cette garde, une file entièrement retenue par un mauvais dressing (aucun
  // needs_user) n'afficherait rien du tout.
  if (!n && !sw && !state.boutiquePause?.retenus) { els.alerts.classList.add("hidden"); return; }
  let html = "";
  if (sw) {
    const versQui = sw.email ? escapeHtml(sw.email) : "un autre compte";
    const actuel = sw.actuel ? ` (actuellement : ${escapeHtml(sw.actuel)})` : "";
    html +=
      `<div class="bloc alerte">` +
      `<div class="bloc-t">🔁 Changer de compte FillSell ?</div>` +
      `<div class="bloc-s">fillsell.app est connecté avec ${versQui}, mais cette extension est rattachée à un autre compte${actuel}. Rien n'a été changé sans toi.</div>` +
      `<div style="display:flex;gap:8px;margin-top:8px;">` +
      `<button id="switch-ok" type="button" style="flex:1;padding:8px 10px;border-radius:9px;border:none;background:#1B6E62;color:#fff;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;">Basculer l'extension</button>` +
      `<button id="switch-no" type="button" style="flex:1;padding:8px 10px;border-radius:9px;border:1px solid #E7E3D8;background:#F6F5F1;color:#5C6560;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;">Rester</button>` +
      `</div></div>`;
  }
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
    html +=
      `<div class="bloc alerte">` +
      `<div class="bloc-t">${nb} republication${nb > 1 ? "s" : ""} sur le dressing ${escapeHtml(quelDressing)}</div>` +
      `<div class="bloc-s">Chrome est connecté à ${escapeHtml(connectee)}. ` +
      `Change de compte sur vinted.fr, elles repartiront seules.</div>` +
      `</div>`;
  }
  if (n) {
    // Le motif écrit par l'extension est déjà rédigé pour être lu : on le montre
    // tel quel s'il est propre, jamais un code technique.
    const brut = String(state.besoinGeste[0]?.error ?? "").trim();
    const propre = brut && brut.length <= 220 && !/[{}<>]|https?:\/\//.test(brut);
    // ── Dire QUOI, OÙ, et QUEL GESTE (lisibilité 2026-09-04) ────────────────
    // Avant : « N opérations attendent ta décision » + « Ouvre FillSell pour
    // voir ce qui bloque et relancer ». Trois défauts relevés sur écran réel :
    // « opération » n'est pas un mot de vendeur (ce sont des ANNONCES), « ta
    // décision » ne dit pas laquelle, et rien n'indiquait OÙ regarder — l'app
    // a cinq onglets. On nomme donc l'onglet exact.
    // Le motif écrit par l'extension reste en tête quand il est propre : c'est
    // le QUOI. La phrase de localisation le suit toujours, y compris dans ce
    // cas — sans elle, savoir ce qui bloque ne dit toujours pas où aller.
    // ── LES MOTIFS DOMINANTS (2026-09-08) ─────────────────────────────────
    // Un nombre seul n'aide personne : « 27 annonces » ne dit ni quoi ni où.
    // Les 27 jobs sont DÉJÀ dans le popup avec leur texte d'erreur — on les
    // regroupe. Le motif du premier job (montré depuis le 04/09) laisse la
    // place à la répartition : elle dit la même chose pour les 27, pas pour un.
    const familles = motifsDominants(state.besoinGeste);
    const lignes = familles.map((f) =>
      `<div class="motif"><span class="motif-n">${f.n}</span>` +
      `<span>${escapeHtml(f.libelle)}</span></div>`,
    ).join("");
    // Repli si aucun job n'est en main (le total vient du serveur, la liste
    // peut être vide) : le motif du premier job, comme avant.
    const corps = lignes
      ? `<div class="motifs">${lignes}</div>`
      : `<div class="bloc-s">${propre ? escapeHtml(brut) : ""}</div>`;
    html +=
      `<div class="bloc alerte">` +
      `<div class="bloc-t">⚠️ ${n} annonce${n > 1 ? "s" : ""} attend${n > 1 ? "ent" : ""} un geste de ta part</div>` +
      corps +
      `<div class="bloc-s" style="margin-top:7px">Ouvre FillSell, onglet Stock IA : la fiche de l'annonce dit ce qui manque et porte le bouton pour relancer.</div>` +
      `</div>`;
  }
  els.alerts.innerHTML = html;
  els.alerts.classList.remove("hidden");
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
    renderAlerts();
  });
}

function renderNow() {
  const morceaux = [];
  const s = state.sync;
  if (s?.status === "running") {
    const vus = s.items_vus ?? 0;
    morceaux.push(s.total_entries
      ? `Synchronisation du dressing — ${vus} articles sur ${s.total_entries}`
      : `Synchronisation du dressing — ${vus} article${vus > 1 ? "s" : ""} lu${vus > 1 ? "s" : ""}`);
  }
  // ── QUI, ET SUR QUOI (2026-09-08) ────────────────────────────────────────
  // « Publication en cours sur 1 plateforme » ne disait ni laquelle ni lequel —
  // et l'article déposé n'est PAS celui affiché en « Prête à publier » (relevé
  // sur écran réel : Robe camisole en cours, Blouse blanche prête). On les
  // confondait pour un seul article dont la vignette ne correspondait pas.
  for (const j of state.jobs.filter((x) => x.status === "processing")) {
    const nom = PLATFORMS.find((p) => p.key === j.platform)?.name ?? j.platform;
    const titre = String(j.title ?? "").trim();
    morceaux.push(`Dépôt sur ${nom}${titre ? ` — « ${titre} »` : ""}`);
  }
  // LAQUELLE est traitée (2026-08-07, chantier lisibilité) : le titre dit ce
  // qui se passe — « Republication en cours » tout court laissait deviner.
  const repEnCours = state.repub.find((j) => j.status === "processing");
  if (repEnCours) {
    const etape = REPUB_ETAPES[repEnCours.platform_fields?.republish_step ?? "a_capturer"] ?? "";
    // Titre ENTIER (2026-09-08) : coupé à 40 caractères, il ne permettait pas
    // de distinguer deux articles au libellé voisin.
    const titre = String(repEnCours.title ?? "").trim();
    morceaux.push(`Republication en cours${titre ? ` — « ${titre} »` : ""}${etape ? ` (${etape})` : ""}`);
  }
  if (!morceaux.length) { els.now.classList.add("hidden"); return; }
  els.now.innerHTML =
    `<div class="bloc"><div class="bloc-t">En cours</div>` +
    morceaux.map((m) => `<div class="bloc-s">${escapeHtml(m)}</div>`).join("") +
    `</div>`;
  els.now.classList.remove("hidden");
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
  const lignes = [];
  const rep = state.repub.filter((j) => j.status !== "processing");
  if (rep.length) {
    const parEtape = {};
    for (const j of rep) {
      const e = REPUB_ETAPES[j.platform_fields?.republish_step ?? "a_capturer"] ?? "en file";
      parEtape[e] = (parEtape[e] ?? 0) + 1;
    }
    const detail = Object.entries(parEtape).map(([e, n]) => `${n} ${e}`).join(" · ");
    lignes.push(`🔁 <b>${rep.length} republication${rep.length > 1 ? "s" : ""}</b> — ${escapeHtml(detail)}`);
  }
  // Prochain geste PRÉVU, avec son heure (2026-08-07) : les pauses de 2-5 min
  // entre suppression et recréation sont VOLONTAIRES — sans cette ligne,
  // l'utilisateur qui regarde la popup pendant la fenêtre croit que c'est
  // planté. next_action_after est la seule heure réelle : rien n'est inventé.
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
  if (!lignes.length) { els.queueExtra.classList.add("hidden"); return; }
  els.queueExtra.innerHTML =
    `<div class="bloc"><div class="bloc-t">Aussi en file</div>` +
    lignes.map((l) => `<div class="bloc-l">${l}</div>`).join("") +
    `</div>`;
  els.queueExtra.classList.remove("hidden");
}

// Fraîcheur exigée du relevé de sessions. Au-delà, on n'affiche RIEN : une
// pastille verte sur un relevé de la semaine dernière est un mensonge.
const SESSIONS_FRAICHEUR_MS = 60 * 60 * 1000;

function renderDiag() {
  const bouts = [];
  // Les pastilles de sessions ont quitté ce pied de page le 08/09 : elles sont
  // devenues le bloc « Plateformes », en tête, où on les cherchait. Les répéter
  // ici en 6 px n'apporterait rien — et pour Beebs elles MENTAIENT (un `null`
  // de sonde y passait pour une déconnexion).
  const v = chrome.runtime.getManifest().version;
  bouts.push(`<span class="build">v${escapeHtml(v)}</span>`);
  els.diag.innerHTML = bouts.join("");
  els.diag.classList.toggle("hidden", !state.session);
}

function render() {
  renderAccount();
  renderLife();
  renderAwake();
  renderPlateformes();
  renderAlerts();
  renderNow();
  renderListing();
  renderFlow();
  renderQueueExtra();
  renderFooter();
  renderDiag();
}

// ── Interactions ─────────────────────────────────────────────────────────────

function openLogin() {
  chrome.tabs.create({ url: FILLSELL_CONFIG.AUTH_URL });
  window.close();
}

// Déconnexion explicite (fix 2026-07-11) : connecté, le 1er clic sur la
// pastille arme une confirmation inline ("Se déconnecter ?", 4 s), le 2e la
// exécute — storage purgé, re-render immédiat. Ni confirm() natif (dialog
// modal qui gèle le popup) ni menu dropdown (CSS neuf dans popup.html) : on
// reste sur la pastille .on/.off existante.
let logoutArm = null;
els.acct.addEventListener("click", async () => {
  if (!state.session) { openLogin(); return; }
  if (logoutArm) {
    clearTimeout(logoutArm);
    logoutArm = null;
    // Les DEUX sessions (fix 2026-08-01) : ne retirer que la copie relayée
    // laissait vivre la session PROPRE (fillsell_session_own) — le popup se
    // ré-affichait « Connecté » et, pire, une session propre MORTE continuait
    // de bloquer toute reconnexion (garde FILLSELL_SESSION). La déconnexion
    // doit être un vrai reset : sessions + délai anti-rafale de bootstrap.
    await chrome.storage.local.remove([SESSION, SESSION_OWN, BOOTSTRAP_LAST_FAIL]);
    state.session = null;
    load();
    return;
  }
  els.acctLabel.textContent = "Se déconnecter ?";
  logoutArm = setTimeout(() => { logoutArm = null; renderAccount(); }, 4000);
});

els.history.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://fillsell.app/app" });
  window.close();
});

// Délégation : "Se connecter" sur une ligne, dans le flux comme dans le bloc
// Plateformes. Plus de case à cocher depuis le retrait du CTA (2026-09-08).
function ouvrirConnexion(e) {
  const connect = e.target.closest("[data-connect]");
  if (!connect) return;
  const p = PLATFORMS.find((x) => x.key === connect.getAttribute("data-connect"));
  if (p) { chrome.tabs.create({ url: p.loginUrl }); window.close(); }
}
els.flow.addEventListener("click", ouvrirConnexion);
els.platList.addEventListener("click", ouvrirConnexion);

// ── Publication ──────────────────────────────────────────────────────────────
// Envoie au background la liste des jobs des plateformes cochées ; les états
// par ligne (en cours / publié / erreur / se connecter) arrivent en direct via
// les événements FILLSELL_PROGRESS. La mécanique de remplissage (processJob,
// onglet de travail unique, statuts) n'est jamais réécrite ici.
const CONN_RE = /(se\s*)?connect|connexion|identifi|login|sign[-\s]?in|non connect|session (expir|invalide)/i;
const isConnErr = (msg) => CONN_RE.test(String(msg || ""));
const shortErr = (msg) => {
  const s = String(msg || "Échec").replace(/\s+/g, " ").trim();
  return s.length > 42 ? s.slice(0, 41) + "…" : s;
};

// ── PLUS DE DÉCLENCHEMENT MANUEL (2026-09-08, décision Nico) ─────────────────
// Le bouton « Publier maintenant » et son envoi PUBLISH_NOW ont été retirés
// d'ici. Motif : les jobs partent tout seuls au poll. Un job qui n'est PAS parti
// a toujours une cause — mauvais dressing, session fermée, champ manquant — et
// cliquer ne la levait pas : il repartait au même mur. Le bouton promettait une
// action qui n'existait pas.
// Ce que le popup fait à la place, plus haut : nommer la cause et le geste qui
// la lève. Le handler PUBLISH_NOW du background n'est PAS touché (la logique de
// publication reste hors de ce chantier) ; il n'a simplement plus d'appelant.
// Les états live ci-dessous continuent d'arriver : ils viennent du poll, pas
// d'un clic.

// États live par plateforme, poussés par le background pendant la publication.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "FILLSELL_PROGRESS") return;
  const key = msg.platform;
  if (!PLATFORMS.some((p) => p.key === key)) return;
  // Filtre par jobId (2026-07-18) : le flux POLL émet désormais aussi la
  // progression — y compris pour des jobs d'une AUTRE annonce ou des jobs
  // delete (absents de byPlatform, filtrés au fetch). Sans ce filtre, leur
  // progression peindrait les lignes de l'annonce affichée.
  const job = state.annonce?.byPlatform[key];
  if (!job || (msg.jobId != null && String(msg.jobId) !== String(job.id))) return;
  switch (msg.phase) {
    case "queued":             state.status[key] = { phase: "queued" }; break;
    case "processing":         state.status[key] = { phase: "busy" }; break;
    case "published":          state.status[key] = { phase: "done", msg: "Publié" }; break;
    case "dry_run_completed":  state.status[key] = { phase: "done", msg: "Prêt (test)" }; break;
    case "needsUser":
      state.status[key] = isConnErr(msg.error)
        ? { phase: "connect" }
        : { phase: "err", msg: shortErr(msg.error) };
      break;
    case "failed":
    case "retry":
      state.status[key] = isConnErr(msg.error)
        ? { phase: "connect" }
        : { phase: "err", msg: shortErr(msg.error) };
      break;
    default: break;
  }
  renderFlow();
  // Le bloc Plateformes suit le direct lui aussi : un refus « CHALLENGE » ou
  // « Connexion Beebs requise » qui arrive pendant que le popup est ouvert doit
  // changer la ligne tout de suite, sans attendre une réouverture.
  renderPlateformes();
});

// Re-render si le background met à jour la session pendant que le popup est ouvert.
// Pendant une publication, on ne recharge pas (ça écraserait les états live).
chrome.storage.onChanged.addListener((changes, area) => {
  // RECENT_RESULTS inclus (Sujet 5) : le poll de fond qui termine un job
  // re-render le popup DÉJÀ OUVERT — le live redevient cohérent sans
  // toucher à emitProgress.
  // SESSION_OWN inclus (2026-08-01) : c'est la session de régime normal — sa
  // purge par le background (token rejeté par le serveur) doit faire passer un
  // popup ouvert à « Se connecter » en direct, pas au prochain clic.
  if (area === "local" && (changes[SESSION] || changes[SESSION_OWN] || changes[LAST_POLL] || changes[RECENT_RESULTS]) && !state.publishing) load();
});

load();
