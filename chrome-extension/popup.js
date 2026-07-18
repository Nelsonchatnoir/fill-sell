// Popup FillSell — cross-post.
// Rendu entièrement piloté par les vraies données :
//   - session FillSell : chrome.storage.local["fillsell_session"] (posée par
//     content-scripts/fillsell-auth.js via le background) ;
//   - annonces en file : edge function get-pending-jobs (même source que le
//     poll du background), lue ici en lecture seule pour l'affichage.
// La publication réelle passe par le background (POLL_NOW aujourd'hui,
// PUBLISH_NOW ciblé au commit suivant) — jamais réécrite ici.

const { SESSION, LAST_POLL, RECENT_RESULTS } = FILLSELL_CONFIG.STORAGE_KEYS;

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

const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const CHECK_TEAL = '<svg class="icon-check" viewBox="0 0 24 24" fill="none" stroke="#1B6E62" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

const els = {
  brandLogo: document.getElementById("brand-logo"),
  acct: document.getElementById("acct"),
  acctLabel: document.getElementById("acct-label"),
  listing: document.getElementById("listing-card"),
  flow: document.getElementById("flow"),
  cta: document.getElementById("cta"),
  ctaLabel: document.getElementById("cta-label"),
  ctaCount: document.getElementById("cta-count"),
  queueLabel: document.getElementById("queue-label"),
  history: document.getElementById("history"),
};

const state = {
  session: null,        // { access_token, email, ... }
  jobs: [],             // tous les jobs pending
  annonce: null,        // { key, title, price, photo, tag, byPlatform: {vinted: job, ...} }
  selected: new Set(),  // plateformes cochées (parmi celles "prêtes")
  status: {},           // { [platform]: { phase: 'idle'|'busy'|'done'|'err'|'connect', msg } }
  recent: {},           // { [platform]: résultat terminé <30 min par le poll de fond (Sujet 5) }
  publishing: false,
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
    body: JSON.stringify({ include_processing: true }),
  });
  if (!res.ok) throw new Error(`get-pending-jobs → HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  // Les jobs action='delete' (retrait cross-plateforme, 2026-07-11) passent
  // par la même file mais ne sont PAS des annonces à publier : ils
  // n'apparaissent pas dans le popup et ne sont jamais ciblés par
  // PUBLISH_NOW — le poll de fond les exécute seul.
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  return jobs.filter((j) => j.action !== "delete");
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
    const resp = await chrome.runtime.sendMessage({ type: "GET_VALID_SESSION" });
    session = resp?.session ?? null;
  } catch (e) {
    console.warn("[popup] GET_VALID_SESSION:", e);
  }
  state.session = session?.access_token ? session : null;

  if (state.session) {
    try {
      state.jobs = await fetchPendingJobs(state.session.access_token);
    } catch (e) {
      console.warn("[popup] get-pending-jobs:", e);
      state.jobs = [];
    }
    state.annonce = firstAnnonce(state.jobs);
    // Sélection par défaut : toutes les plateformes supportées présentes dans
    // l'annonce (session plateforme supposée ouverte — détection réactive).
    state.selected = new Set();
    if (state.annonce) {
      for (const p of PLATFORMS) {
        const job = state.annonce.byPlatform[p.key];
        // ⚠️ JAMAIS un job déjà en cours (status 'processing', visible depuis
        // include_processing) : le cocher par défaut le ferait re-publier par
        // PUBLISH_NOW → DOUBLE ANNONCE. Il s'affiche en « Publication… », il ne
        // se sélectionne pas.
        if (p.supported && job && job.status !== "processing") state.selected.add(p.key);
      }
    }
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
      const refKey = state.annonce?.key ?? fresh.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))[0]?.annonceKey ?? null;
      for (const r of fresh) {
        if (r.annonceKey === refKey) state.recent[r.platform] = r;
      }
    } catch (e) {
      console.warn("[popup] recent results:", e);
    }
  } else {
    state.jobs = [];
    state.annonce = null;
    state.selected = new Set();
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
  if (job) return "ready";
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
      const on = state.selected.has(p.key);
      right = `<div class="check ${on ? "on" : ""}" data-check="${p.key}" role="checkbox" aria-checked="${on}" tabindex="0">${CHECK_SVG}</div>`;
    } else if (s === "connect") {
      right = `<button class="connect-btn" data-connect="${p.key}" type="button">Se connecter</button>`;
    } else if (s === "soon") {
      right = `<span class="badge-soft">Bientôt</span>`;
    } else if (s === "none") {
      right = `<span class="badge-soft">Non incluse</span>`;
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
  const by = state.annonce?.byPlatform ?? {};
  return Object.values(by).some((j) => j?.status === "processing");
}

function renderCta() {
  const count = state.selected.size;
  const running = batchRunning();
  const disabled = running || !state.annonce || count === 0;
  els.cta.disabled = disabled;
  els.ctaLabel.textContent = running ? "Publication…" : "Publier maintenant";
  els.ctaCount.textContent = String(count);
  els.ctaCount.classList.toggle("hidden", count === 0 || running);
}

function renderFooter() {
  const n = state.jobs.length;
  els.queueLabel.textContent = n === 0 ? "0 en file" : `${n} en file`;
}

function render() {
  renderAccount();
  renderListing();
  renderFlow();
  renderCta();
  renderFooter();
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
    await chrome.storage.local.remove(SESSION);
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

// Délégation : cocher/décocher une plateforme, ou "Se connecter" sur une ligne.
els.flow.addEventListener("click", (e) => {
  const check = e.target.closest("[data-check]");
  // batchRunning et non state.publishing : les cases restent aussi gelées
  // quand le popup a été rouvert en plein lot (cohérent avec le CTA).
  if (check && !batchRunning()) {
    const key = check.getAttribute("data-check");
    if (state.selected.has(key)) state.selected.delete(key);
    else state.selected.add(key);
    renderFlow();
    renderCta();
    return;
  }
  const connect = e.target.closest("[data-connect]");
  if (connect) {
    const p = PLATFORMS.find((x) => x.key === connect.getAttribute("data-connect"));
    if (p) { chrome.tabs.create({ url: p.loginUrl }); window.close(); }
  }
});

// Accessibilité clavier sur les cases à cocher.
els.flow.addEventListener("keydown", (e) => {
  if ((e.key === " " || e.key === "Enter")) {
    const check = e.target.closest("[data-check]");
    if (check) { e.preventDefault(); check.click(); }
  }
});

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

function selectedJobIds() {
  const ids = [];
  for (const key of state.selected) {
    const job = state.annonce?.byPlatform[key];
    // Double filet contre la double publication : un job 'processing' n'est
    // jamais envoyé à PUBLISH_NOW, même s'il s'était retrouvé sélectionné.
    if (job && job.status !== "processing") ids.push(job.id);
  }
  return ids;
}

els.cta.addEventListener("click", () => {
  if (els.cta.disabled || batchRunning()) return;
  const jobIds = selectedJobIds();
  if (!jobIds.length) return;

  state.publishing = true;
  // « En attente… » d'emblée pour TOUTES les plateformes cochées : la
  // publication est SÉQUENTIELLE (background : une plateforme à la fois), et
  // l'événement FILLSELL_PROGRESS "processing" fait passer chacune à « Publication… »
  // à son tour — la séquence devient lisible au lieu d'un « Publication… » global.
  for (const key of state.selected) state.status[key] = { phase: "queued" };
  render();

  chrome.runtime.sendMessage({ type: "PUBLISH_NOW", jobIds }, (res) => {
    state.publishing = false;
    if (chrome.runtime.lastError || !res?.ok) {
      // Échec global (session FillSell invalide, ou aucun job trouvé) : bascule
      // les lignes concernées, sans écraser un état live déjà reçu.
      const reason = res?.reason;
      for (const key of state.selected) {
        // "queued" inclus : sur un échec GLOBAL (pas de session, aucun job),
        // aucune plateforme n'a reçu d'événement "processing" → elles sont
        // encore en attente et doivent basculer, pas rester bloquées.
        if (["busy", "queued"].includes(state.status[key]?.phase)) {
          state.status[key] = reason === "no_session"
            ? { phase: "connect" }
            : { phase: "err", msg: reason === "no_matching_jobs" ? "Déjà traité" : "Échec" };
        }
      }
    }
    render();
  });
});

// États live par plateforme, poussés par le background pendant la publication.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "FILLSELL_PROGRESS") return;
  const key = msg.platform;
  if (!PLATFORMS.some((p) => p.key === key)) return;
  switch (msg.phase) {
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
  // renderCta aussi : popup rouvert en plein lot, c'est l'événement 'processing'
  // (ou la fin du lot done/err) qui doit geler/dégeler le bouton en direct.
  renderCta();
});

// Re-render si le background met à jour la session pendant que le popup est ouvert.
// Pendant une publication, on ne recharge pas (ça écraserait les états live).
chrome.storage.onChanged.addListener((changes, area) => {
  // RECENT_RESULTS inclus (Sujet 5) : le poll de fond qui termine un job
  // re-render le popup DÉJÀ OUVERT — le live redevient cohérent sans
  // toucher à emitProgress.
  if (area === "local" && (changes[SESSION] || changes[LAST_POLL] || changes[RECENT_RESULTS]) && !state.publishing) load();
});

load();
