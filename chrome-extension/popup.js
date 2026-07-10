// Popup FillSell — cross-post.
// Rendu entièrement piloté par les vraies données :
//   - session FillSell : chrome.storage.local["fillsell_session"] (posée par
//     content-scripts/fillsell-auth.js via le background) ;
//   - annonces en file : edge function get-pending-jobs (même source que le
//     poll du background), lue ici en lecture seule pour l'affichage.
// La publication réelle passe par le background (POLL_NOW aujourd'hui,
// PUBLISH_NOW ciblé au commit suivant) — jamais réécrite ici.

const { SESSION, LAST_POLL } = FILLSELL_CONFIG.STORAGE_KEYS;

// Plateformes affichées, de haut en bas. `supported:false` => "Bientôt"
// (Beebs pour l'instant : ligne atténuée, non sélectionnable).
const PLATFORMS = [
  { key: "vinted",    name: "Vinted",    supported: true,  loginUrl: "https://www.vinted.fr/" },
  { key: "leboncoin", name: "Leboncoin", supported: true,  loginUrl: "https://www.leboncoin.fr/" },
  { key: "ebay",      name: "eBay",      supported: true,  loginUrl: "https://www.ebay.fr/" },
  { key: "beebs",     name: "Beebs",     supported: false, loginUrl: "https://www.beebs.app/" },
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
  return {
    key,
    title: head.title || "Sans titre",
    price: head.price,
    photo: Array.isArray(head.photos) ? head.photos[0] : null,
    tag: head.platform_fields?.categorie || null,
    byPlatform,
  };
}

// Lecture seule des jobs pending (affichage). La publication passe par le
// background, qui refait un getValidSession (refresh) de son côté.
async function fetchPendingJobs(accessToken) {
  const res = await fetch(`${FILLSELL_CONFIG.SUPABASE_URL}/functions/v1/get-pending-jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: FILLSELL_CONFIG.SUPABASE_ANON_KEY,
    },
    body: "{}",
  });
  if (!res.ok) throw new Error(`get-pending-jobs → HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.jobs) ? data.jobs : [];
}

// ── Chargement ───────────────────────────────────────────────────────────────

async function load() {
  const store = await chrome.storage.local.get([SESSION]);
  const session = store[SESSION];
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
        if (p.supported && state.annonce.byPlatform[p.key]) state.selected.add(p.key);
      }
    }
  } else {
    state.jobs = [];
    state.annonce = null;
    state.selected = new Set();
  }
  state.status = {};
  render();
}

// ── Rendu ────────────────────────────────────────────────────────────────────

function renderAccount() {
  const on = Boolean(state.session);
  els.acct.classList.toggle("on", on);
  els.acct.classList.toggle("off", !on);
  if (on) {
    const payload = decodeJwtPayload(state.session.access_token);
    els.acctLabel.textContent = "Connecté";
    els.acct.title = state.session.email || payload?.email || "";
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

// Logo plateforme — placeholder au commit 1 (initiale), remplacé par le vrai
// asset au commit suivant.
function platformLogo(p) {
  return `<span class="plogo" data-platform="${p.key}">${p.name[0]}</span>`;
}

// État d'une ligne plateforme, dérivé de : supporté ? job présent ? statut de
// publication en cours ?
function rowState(p) {
  if (!p.supported) return "soon";
  const st = state.status[p.key];
  if (st?.phase === "busy") return "busy";
  if (st?.phase === "done") return "done";
  if (st?.phase === "err") return "err";
  if (st?.phase === "connect") return "connect";
  if (!state.annonce || !state.annonce.byPlatform[p.key]) return "none";
  return "ready";
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
                        busy: "busy", done: "done", err: "err" }[s];

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
    } else if (s === "busy") {
      right = `<span class="status-run"><span class="spinner"></span>Publication…</span>`;
    } else if (s === "done") {
      const st = state.status[p.key];
      right = `<span class="status-ok">${CHECK_TEAL}${st?.msg || "Publié"}</span>`;
    } else if (s === "err") {
      const st = state.status[p.key];
      right = `<span class="status-err" title="${escapeHtml(st?.msg || "Échec")}">${escapeHtml(st?.msg || "Échec")}</span>`;
    }

    row.innerHTML = `
      <span class="pnode ${nodeClass}"></span>
      ${platformLogo(p)}
      <span class="pname">${p.name}</span>
      <span class="pstate">${right}</span>`;
    els.flow.appendChild(row);
  }
}

function renderCta() {
  const count = state.selected.size;
  const disabled = state.publishing || !state.annonce || count === 0;
  els.cta.disabled = disabled;
  els.ctaLabel.textContent = state.publishing ? "Publication…" : "Publier maintenant";
  els.ctaCount.textContent = String(count);
  els.ctaCount.classList.toggle("hidden", count === 0 || state.publishing);
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

els.acct.addEventListener("click", () => { if (!state.session) openLogin(); });

els.history.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://fillsell.app/app" });
  window.close();
});

// Délégation : cocher/décocher une plateforme, ou "Se connecter" sur une ligne.
els.flow.addEventListener("click", (e) => {
  const check = e.target.closest("[data-check]");
  if (check && !state.publishing) {
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
// Commit 1 (intérim) : déclenche le poll existant du background. Le ciblage par
// plateforme sélectionnée + les états de progression par ligne arrivent au
// commit "logique publication".
els.cta.addEventListener("click", () => {
  if (state.cta === true || els.cta.disabled) return;
  chrome.runtime.sendMessage({ type: "POLL_NOW" });
  window.close();
});

// Re-render si le background met à jour la session pendant que le popup est ouvert.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes[SESSION] || changes[LAST_POLL])) load();
});

load();
