// Service worker (Manifest V3).
// Toutes les 30 min : lit le JWT depuis chrome.storage.local, appelle
// get-pending-jobs, dispatche chaque job vers le content script de sa
// plateforme, puis remonte le résultat via update-job-status.

importScripts("config.js");

// Marqueur de version du service worker. Motif (2026-07-09) : un second
// worktree (fill-and-sell-chrome-extension, branche feat/chrome-extension) a
// été chargé par erreur comme extension unpacked pendant des heures — beebs y
// est encore `implemented: false` et eBay n'y a pas d'entryUrl. Les symptômes
// ("Handler beebs pas encore implémenté", eBay qui s'ouvre direct sur /sl/list)
// contredisaient le code du dépôt principal sans qu'on puisse le voir.
// Ce log, imprimé au démarrage du SW, dit quelle COPIE tourne réellement :
// vérifier `version` et `build` avant de diagnostiquer quoi que ce soit.
// Format daté depuis le 2026-07-12 (les libellés de features ne permettaient
// pas de distinguer deux versions du même jour). À METTRE À JOUR à chaque
// modification de ce fichier.
const FILLSELL_BUILD =
  "2026-07-12-17h40 (AUCUNE ecriture auto + delai de grace par plateforme, paintTab, verrou, recover " +
  "listing_url, discard vérifié avant navigation, après 340158e)";
console.log(
  `[background.js] build ${FILLSELL_BUILD} — service worker v${chrome.runtime.getManifest().version}`
);

const ALARM_NAME = "fillsell-poll-jobs";

// Ré-armements "action utilisateur requise" (needsUser) autorisés avant de
// basculer le job en failed : évite qu'un job attendant une info jamais
// fournie (ex: adresse Leboncoin) ne rouvre un onglet à chaque cron sans fin.
const MAX_NEEDS_USER_RETRIES = 2;

// ── Dispatch par plateforme ────────────────────────────────────────────────────
// `implemented: false` → le job est loggé et laissé en pending (le content
// script n'existe pas encore). Passer à true quand le script est prêt.
const PLATFORM_HANDLERS = {
  vinted: {
    implemented: true,
    newListingUrl: "https://www.vinted.fr/items/new",
  },
  leboncoin: {
    implemented: true,
    newListingUrl: "https://www.leboncoin.fr/deposer-une-annonce",
  },
  beebs: {
    implemented: true,
    // URL directe confirmée en session réelle (2026-07-08, connecté) : ouvre
    // le formulaire "Mettre un article en vente" vierge, sans redirection de
    // login tant qu'une session est active (cf. content-scripts/beebs.js).
    newListingUrl: "https://www.beebs.app/fr/listing",
  },
  ebay: {
    implemented: true,
    // Point d'entrée : la home, PAS l'URL de dépôt (changement 2026-07-09).
    // Ouvrir un onglet neuf directement sur /sl/list?mode=AddItem... est un
    // marqueur d'automatisation net : aucun humain n'arrive sur le formulaire
    // de vente sans referrer, sans avoir chargé une seule page du site. On
    // passe donc par ebay.fr → clic réel sur "Vendre" → navigation interne
    // vers l'URL de dépôt (voir ebayNavigateToSellForm).
    entryUrl: "https://www.ebay.fr/",
    // eBay n'a pas de wizard à piloter : l'URL directe /sl/list avec le
    // categoryId (posé par l'app via ebayCategories.js) + titre + conditionId
    // ouvre le formulaire final pré-rempli (relevé en session réelle
    // 2026-07-07). D'où une URL PAR JOB — newListingUrl est une fonction,
    // résolue dans processJob. conditionId : famille seulement (neuf → 1000,
    // sinon 3000 = Occasion / Occasion - Très bon état selon la catégorie) ;
    // la granularité fine des états vêtements viendra dans un lot ultérieur.
    newListingUrl: (job) => {
      const fields = job.platform_fields ?? {};
      // Garde dure : sans categoryId, /sl/list ouvre l'outil de mise en vente
      // sans catégorie et eBay affiche SA PROPRE page d'erreur
      // (reason=pageLoadListing:Error:MISSING_CATEGORY_PRODUCT_ITEM_ID).
      // precheckJob() attrape déjà ce cas avant toute navigation ; ce throw
      // garantit qu'aucun autre chemin ne peut construire une URL invalide.
      if (!fields.ebayCategoryId) {
        throw new Error("URL eBay impossible à construire : platform_fields.ebayCategoryId absent.");
      }
      const params = new URLSearchParams({ mode: "AddItem" });
      params.set("categoryId", String(fields.ebayCategoryId));
      if (job.title) params.set("title", String(job.title).slice(0, 80));
      params.set("condition", /neuf/i.test(fields.etat ?? "") ? "1000" : "3000");
      return `https://www.ebay.fr/sl/list?${params}`;
    },
  },
};

// ── Pré-check : un job non mappé n'ouvre AUCUN onglet ──────────────────────────
// Bug du 2026-07-09 : processJob naviguait l'onglet de travail AVANT d'envoyer
// FILL_LISTING, donc avant que le content script ne puisse refuser le job. Pour
// un article de mode dont le genre ne résout aucun rayon, l'app ne pose pas de
// categoryId → l'URL eBay partait sans `categoryId` → l'utilisateur voyait la
// page d'erreur d'eBay ("L'outil de mise en vente ne fonctionne pas pour le
// moment", MISSING_CATEGORY_PRODUCT_ITEM_ID) pendant que la console affichait,
// pour LE MÊME job, le "Genre requis" du content script. Un job sans catégorie
// résolue ne doit provoquer ni onglet, ni navigation, ni page d'erreur.
//
// Les gardes équivalentes des content scripts sont CONSERVÉES (défense en
// profondeur : elles portent les messages détaillés et couvrent l'injection
// manuelle d'un job en dry-run piloté).
const CATEGORY_FIELD = {
  vinted: "categoryPath",
  leboncoin: "lbcCategoryPath",
  beebs: "beebsCategoryPath",
  ebay: "ebayCategoryId",
};

function precheckJob(job) {
  const key = CATEGORY_FIELD[job.platform];
  if (!key) return null;
  const fields = job.platform_fields ?? {};
  const value = fields[key];
  const resolved = Array.isArray(value) ? value.length > 0 : Boolean(value);
  if (resolved) return null;

  const genreRequired =
    fields.vintedGenreRequired || fields.ebayGenreRequired || fields.beebsGenreRequired;
  if (genreRequired) {
    return (
      `Catégorie ${job.platform} non résolue pour cet article de mode (genre = ` +
      `${JSON.stringify(fields.genre ?? null)}). Choisir un genre correspondant à un rayon ` +
      `réel de la plateforme dans les champs ${job.platform} de l'app, puis régénérer le job. ` +
      "Aucun onglet n'a été ouvert."
    );
  }
  return (
    `platform_fields.${key} absent — article non mappé vers le catalogue ${job.platform} ` +
    "(icône hors périmètre du mapping, ou job antérieur au mapping). Régénérer l'annonce " +
    "depuis l'app, ou compléter le mapping côté src/utils/. Aucun onglet n'a été ouvert."
  );
}

// ── Alarme 30 min ──────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => scheduleAlarm());
chrome.runtime.onStartup.addListener(() => scheduleAlarm());

function scheduleAlarm() {
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: FILLSELL_CONFIG.POLL_INTERVAL_MINUTES,
    delayInMinutes: 1,
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) pollAndProcessJobs();
});

// ── Messages (auth content script + popup) ────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "FILLSELL_SESSION" && msg.session?.access_token) {
    chrome.storage.local
      .set({ [FILLSELL_CONFIG.STORAGE_KEYS.SESSION]: msg.session })
      .then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "POLL_NOW") {
    pollAndProcessJobs();
    sendResponse({ ok: true });
  }
  // Source de vérité UNIQUE du "suis-je connecté" pour le popup (fix
  // 2026-07-11) : session VALIDÉE (refresh si expiration proche, storage
  // purgé si le refresh est mort) au lieu d'une relecture brute du storage
  // qui ne vérifiait que la présence d'un access_token — deux
  // implémentations qui divergeaient.
  if (msg?.type === "GET_VALID_SESSION") {
    getValidSession().then(
      (session) => sendResponse({ session }),
      (e) => {
        console.error("[background] GET_VALID_SESSION:", e);
        sendResponse({ session: null });
      }
    );
    return true; // réponse asynchrone
  }
  // Publication ciblée depuis le popup : publie UNIQUEMENT les jobs demandés
  // (plateformes cochées de l'annonce affichée), en réutilisant processJob.
  // Le poll automatique (POLL_NOW) reste inchangé.
  if (msg?.type === "PUBLISH_NOW") {
    publishSelected(Array.isArray(msg.jobIds) ? msg.jobIds : []).then(
      (r) => sendResponse(r),
      (e) => sendResponse({ ok: false, reason: "error", error: String(e?.message ?? e) })
    );
    return true; // réponse asynchrone
  }
});

// Événement de progression poussé vers le popup (ignoré s'il est fermé).
function emitProgress(payload) {
  chrome.runtime.sendMessage({ type: "FILLSELL_PROGRESS", ...payload }).catch(() => {});
}

// ── Résultats récents pour le popup (Sujet 5, 2026-07-11) ─────────────────────
// Le poll de fond termine des jobs SANS que le popup le sache : une fois
// dry_run_completed/published, le job sort de get-pending-jobs et le popup
// retombait sur "Non incluse" (FILLSELL_PROGRESS n'est émis que par le flux
// PUBLISH_NOW, jamais par pollAndProcessJobs). On persiste 30 min de
// résultats terminés ; le popup les lit à l'ouverture, et son
// storage.onChanged le re-render même déjà ouvert. annonceKey reprend la
// même formule que firstAnnonce côté popup (inv:<id> / title:<titre|jobId>).
const RECENT_RESULTS_TTL_MS = 30 * 60 * 1000;
async function recordRecentResult(job, status) {
  try {
    const KEY = FILLSELL_CONFIG.STORAGE_KEYS.RECENT_RESULTS;
    const store = await chrome.storage.local.get(KEY);
    const now = Date.now();
    const entries = Object.fromEntries(
      Object.entries(store[KEY] ?? {}).filter(([, r]) => now - (r.ts ?? 0) < RECENT_RESULTS_TTL_MS)
    );
    entries[job.id] = {
      platform: job.platform,
      status,
      title: job.title ?? "",
      inventaire_id: job.inventaire_id ?? null,
      annonceKey: job.inventaire_id != null ? `inv:${job.inventaire_id}` : `title:${job.title || job.id}`,
      ts: now,
    };
    await chrome.storage.local.set({ [KEY]: entries });
  } catch (e) {
    console.warn("[background] recordRecentResult:", e);
  }
}

// Orchestration de la publication ciblée. Réutilise getValidSession (refresh),
// get-pending-jobs et processJob — aucune mécanique de remplissage réécrite.
function publishSelected(jobIds) {
  return withJobFlowLock("publish-now", () => publishSelectedUnlocked(jobIds));
}

async function publishSelectedUnlocked(jobIds) {
  const session = await getValidSession();
  if (!session) return { ok: false, reason: "no_session" };

  let jobs;
  try {
    ({ jobs } = await callEdgeFunction("get-pending-jobs", session.access_token));
  } catch (e) {
    return { ok: false, reason: "fetch_failed", error: String(e?.message ?? e) };
  }

  const byId = new Map((jobs || []).map((j) => [String(j.id), j]));
  const targets = jobIds.map((id) => byId.get(String(id))).filter(Boolean);
  if (!targets.length) return { ok: false, reason: "no_matching_jobs" };

  // Même garde anti-rafale qu'un cycle de poll (cf. retryInTempTab).
  tempTabUsedThisPoll = false;

  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const job = targets[i];
    emitProgress({ jobId: job.id, platform: job.platform, phase: "processing" });
    let outcome;
    try {
      outcome = await processJob(job, session.access_token);
    } catch (e) {
      outcome = { status: "failed", error: String(e?.message ?? e) };
    }
    outcome = outcome || { status: "unknown" };
    emitProgress({
      jobId: job.id,
      platform: job.platform,
      phase: outcome.status,
      error: outcome.error,
      listingUrl: outcome.listingUrl,
    });
    results.push({ jobId: job.id, platform: job.platform, ...outcome });
    // Pause + jitter entre deux jobs, comme le poll.
    if (i < targets.length - 1) await sleep(jobDelayMs());
  }
  return { ok: true, results };
}

// ── Session ────────────────────────────────────────────────────────────────────

async function getValidSession() {
  const { SESSION } = FILLSELL_CONFIG.STORAGE_KEYS;
  const store = await chrome.storage.local.get(SESSION);
  let session = store[SESSION];
  if (!session?.access_token) return null;

  // Refresh si le token expire dans moins de 5 min
  const expiresSoon = session.expires_at && session.expires_at * 1000 - Date.now() < 5 * 60 * 1000;
  if (expiresSoon && session.refresh_token) {
    const refreshed = await refreshSession(session.refresh_token);
    if (refreshed) {
      session = { ...session, ...refreshed };
      await chrome.storage.local.set({ [SESSION]: session });
    } else {
      // Refresh mort : PURGE du storage, pas seulement retour null (fix
      // 2026-07-11). Sinon l'access_token périmé reste stocké et tout
      // lecteur du storage (popup.load) croit à une session valide sur sa
      // simple présence — "Connecté" affiché, poll bloqué en silence,
      // reconnexion impossible (le clic compte ne fait rien tant que
      // state.session est truthy). Le storage.onChanged du popup re-render
      // en "Se connecter" tout seul.
      await chrome.storage.local.remove(SESSION);
      console.warn("[background] Refresh du token échoué — session purgée, reconnexion nécessaire");
      return null;
    }
  }
  return session;
}

async function refreshSession(refreshToken) {
  try {
    const res = await fetch(
      `${FILLSELL_CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: FILLSELL_CONFIG.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    };
  } catch (e) {
    console.error("[background] refreshSession:", e);
    return null;
  }
}

// ── Edge functions ─────────────────────────────────────────────────────────────

async function callEdgeFunction(name, accessToken, body) {
  const res = await fetch(`${FILLSELL_CONFIG.SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: FILLSELL_CONFIG.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `${name} → HTTP ${res.status}`);
  return data;
}

function updateJobStatus(accessToken, jobId, status, extra = {}) {
  return callEdgeFunction("update-job-status", accessToken, {
    job_id: jobId,
    status,
    ...extra,
  });
}

// ── Boucle principale ──────────────────────────────────────────────────────────

// ── Verrou de flux de jobs (2026-07-12) ────────────────────────────────────────
// pollAndProcessJobs (alarme 30 min — RÉ-ARMÉE À +1 MIN à chaque rechargement
// de l'extension via onInstalled — ou POLL_NOW) et publishSelected
// (PUBLISH_NOW du popup) partagent les MÊMES onglets de travail persistants.
// Sans verrou, les deux flux se chevauchent : le second discard/re-navigue
// l'onglet pendant que le premier remplit → RELOAD de page en plein
// remplissage. Vécu en direct le 2026-07-12 : Publier cliqué dans le popup
// peu après un rechargement d'extension, l'alarme à +1 min a repris le même
// job pending et re-navigué l'onglet eBay au moment du Titre/Marque.
// On sérialise : un seul flux de jobs à la fois, le suivant attend son tour.
let jobFlowTail = Promise.resolve();
let jobFlowBusyLabel = null;
function withJobFlowLock(label, fn) {
  if (jobFlowBusyLabel) {
    console.log(`[background] ${label} : flux "${jobFlowBusyLabel}" en cours — mise en file (onglets de travail partagés)`);
  }
  const run = jobFlowTail.then(async () => {
    jobFlowBusyLabel = label;
    try {
      return await fn();
    } finally {
      jobFlowBusyLabel = null;
    }
  });
  jobFlowTail = run.catch(() => {});
  return run;
}

function pollAndProcessJobs() {
  return withJobFlowLock("poll", pollAndProcessJobsUnlocked);
}

async function pollAndProcessJobsUnlocked() {
  const session = await getValidSession();
  if (!session) {
    console.log("[background] Pas de session valide, poll ignoré");
    return;
  }

  await chrome.storage.local.set({
    [FILLSELL_CONFIG.STORAGE_KEYS.LAST_POLL]: new Date().toISOString(),
  });

  let jobs;
  try {
    ({ jobs } = await callEdgeFunction("get-pending-jobs", session.access_token));
  } catch (e) {
    console.error("[background] get-pending-jobs:", e);
    return;
  }

  console.log(`[background] ${jobs.length} job(s) pending`);

  // Nouveau cycle : ré-arme le droit à UN onglet temporaire (cf. retryInTempTab).
  tempTabUsedThisPoll = false;

  // Séquentiel : un onglet de publication à la fois, avec une pause entre
  // chaque job (FILLSELL_CONFIG.JOB_DELAY_MS) pour ne pas enchaîner les
  // onglets trop vite.
  for (let i = 0; i < jobs.length; i++) {
    await processJob(jobs[i], session.access_token);
    if (i < jobs.length - 1) await sleep(jobDelayMs());
  }

  // Re-capture différée des listing_url manquants (2026-07-12) : LBC/Beebs
  // n'affichent l'annonce dans "Mes annonces" qu'après modération/indexation —
  // l'aller-retour fait dans la foulée du dépôt peut revenir bredouille.
  await recoverMissingListingUrls(session).catch((e) =>
    console.error("[background] recoverMissingListingUrls:", e)
  );

  // Détection de vente (Phase A2, 2026-07-11) : après les jobs du cycle, on
  // vérifie une tranche des annonces published — depuis le NAVIGATEUR du
  // vendeur (cookies + IP + UA réels via fetch credentials:'include'), là où
  // le scraping serveur de l'ancienne check-listing-status se faisait bloquer.
  await checkPublishedListings(session).catch((e) =>
    console.error("[background] checkPublishedListings:", e)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const randInt = (min, max) => Math.round(min + Math.random() * (max - min));

// Plancher + jitter : deux ouvertures d'onglet ne doivent jamais être
// espacées d'exactement la même durée (cf. FILLSELL_CONFIG).
const jobDelayMs = () =>
  FILLSELL_CONFIG.JOB_DELAY_MS + randInt(0, FILLSELL_CONFIG.JOB_DELAY_JITTER_MS);

async function processJob(job, accessToken) {
  const handler = PLATFORM_HANDLERS[job.platform];
  if (!handler) {
    console.warn(`[background] Plateforme inconnue "${job.platform}", job ${job.id} laissé en pending`);
    return { status: "skipped", error: `Plateforme inconnue "${job.platform}"` };
  }
  if (!handler.implemented) {
    console.log(`[background] Handler ${job.platform} pas encore implémenté, job ${job.id} laissé en pending`);
    return { status: "skipped", error: `Handler ${job.platform} pas encore implémenté` };
  }

  // Jobs de SUPPRESSION (Phase B, 2026-07-11) : même file, pipeline dédié —
  // pas de pré-check catégorie ni de formulaire de dépôt à ouvrir.
  if (job.action === "delete") return processDeleteJob(job, accessToken);

  console.log(`[background] Job ${job.id} → ${job.platform}`);

  try {
    // AVANT tout : catégorie résolue ? Sinon échec sec, sans ouvrir d'onglet
    // ni naviguer (voir precheckJob).
    const blocker = precheckJob(job);
    if (blocker) {
      console.warn(`[background] Job ${job.id} refusé avant navigation — ${blocker}`);
      await updateJobStatus(accessToken, job.id, "failed", { error: blocker });
      return { status: "failed", error: blocker };
    }

    await updateJobStatus(accessToken, job.id, "processing");

    // Onglet de travail UNIQUE, réutilisé de job en job — jamais un onglet
    // neuf par job (voir getOrCreateWorkTab : DataDome a suspendu la session
    // quand les tests accumulaient un onglet Vinted par requête).
    // newListingUrl peut être une fonction (eBay : URL par job, construite
    // avec le categoryId du mapping) ou une chaîne fixe (Vinted, LBC).
    const listingUrl = typeof handler.newListingUrl === "function"
      ? handler.newListingUrl(job)
      : handler.newListingUrl;

    // entryUrl (eBay) : l'onglet de travail atterrit d'abord sur la home du
    // site, puis rejoint le formulaire par une navigation interne — jamais
    // d'ouverture d'onglet directement sur l'URL de dépôt.
    const tabId = await getOrCreateWorkTab(job.platform, handler.entryUrl ?? listingUrl);
    if (handler.entryUrl) await navigateHomeToForm(tabId, listingUrl);

    // Le content script est déclaré dans le manifest pour ce domaine (il est
    // ré-injecté à chaque navigation/reload de l'onglet de travail) ;
    // on lui envoie le job et on attend le résultat du remplissage.
    let result = await sendMessageToTab(tabId, { type: "FILL_LISTING", job });

    // Brouillon LBC bloquant sur l'onglet persistant : tentative unique dans
    // un onglet temporaire dédié à CE job (voir retryInTempTab — exception
    // bornée, l'onglet persistant et son brouillon ne sont jamais touchés).
    if (result?.draftBlocked) {
      result = await retryInTempTab(job, handler, result);
    }

    if (result?.dryRun) {
      // Dry-run réussi → statut TERMINAL, PAS de ré-armement en pending.
      // Sinon le job repartait à chaque cron de 30 min (get-pending-jobs le
      // resélectionnait), rouvrant des onglets en boucle → suspension
      // DataDome (incident vécu). Pour re-tester, régénérer le job depuis
      // l'app. L'onglet de travail reste ouvert pour inspection jusqu'au
      // prochain job.
      console.log(`[background] Job ${job.id} : DRY_RUN réussi → dry_run_completed (terminal, plus de boucle)`);
      await updateJobStatus(accessToken, job.id, "dry_run_completed", completionExtras(job, result));
      await recordRecentResult(job, "dry_run_completed");
      return { status: "dry_run_completed", unfilled: result.unfilledRequired ?? [] };
    } else if (result?.needsUser) {
      // Action utilisateur requise (adresse Leboncoin absente, brouillon LBC
      // à terminer, connexion). Ré-armement BORNÉ (voir rearmBounded).
      await rearmBounded(accessToken, job, result.error);
      return { status: "needsUser", error: result.error };
    } else if (result?.success) {
      // Ré-authentification post-clic (2026-07-11, constaté en réel sur eBay) :
      // le clic "Mettre en vente avec les frais affichés" a redirigé l'onglet
      // vers signin.ebay.fr (clé d'accès / passkey). Le content script, lui,
      // avait déjà répondu success — l'annonce n'existe pourtant PAS. La
      // navigation détruit son contexte, donc SEUL le background peut voir
      // l'écran de reconnexion. Traité comme un needsUser standard (même
      // mécanique que l'adresse LBC manquante) : ré-armement borné, message
      // clair, et le prochain poll retentera une fois l'utilisateur reconnecté.
      const reauth = await detectReauth(tabId, job.platform);
      if (reauth) {
        console.warn(`[background] Job ${job.id} : ${reauth}`);
        await rearmBounded(accessToken, job, reauth);
        return { status: "needsUser", error: reauth };
      }

      // Vérification de SOUMISSION (2026-07-12, vécu en LIVE réel sur eBay) :
      // le content script répond success juste après le clic, mais la
      // validation eBay peut refuser SUR PLACE (« Vous devez ajouter une
      // description », formulaire jamais soumis) — le job partait quand même
      // en "published" fantôme. Seul le background peut trancher : il survit
      // à la redirection (succès) comme à l'absence de redirection (refus).
      if (job.platform === "ebay") {
        const submitError = await verifyEbaySubmission(tabId);
        if (submitError) {
          console.warn(`[background] Job ${job.id} : ${submitError}`);
          await rearmBounded(accessToken, job, submitError);
          return { status: "needsUser", error: submitError };
        }
      }

      // A1 (2026-07-11) : l'URL de l'annonce créée est capturée CÔTÉ
      // BACKGROUND, pas par le content script — la redirection post-submit
      // peut détruire son contexte JS avant qu'il ait pu répondre (raison du
      // TODO historique de vinted.js). L'onglet, lui, survit : on surveille
      // son URL puis, en repli, les liens de la page de confirmation.
      // null si rien ne matche (non bloquant, comportement d'avant) — mais
      // sans listing_url, ni détection de vente ni retrait ciblé ne
      // fonctionneront pour ce job.
      let listingUrl = result.listingUrl ?? null;
      if (!listingUrl) listingUrl = await captureListingUrl(tabId, job.platform, job);
      console.log(`[background] Job ${job.id} publié : ${listingUrl ?? "(URL non récupérée)"}`);
      await updateJobStatus(accessToken, job.id, "published", {
        ...completionExtras(job, result),
        listing_url: listingUrl ?? undefined,
      });
      await recordRecentResult(job, "published");
      // L'onglet n'est PAS fermé : il sert au job suivant, comme un humain
      // qui garde son onglet Vinted ouvert entre deux dépôts.
      return { status: "published", listingUrl };
    } else {
      throw new Error(result?.error || "Le content script n'a pas retourné de résultat");
    }
  } catch (e) {
    const msg = String(e?.message ?? e);
    // Canal de message coupé en plein remplissage (navigation/reload de
    // l'onglet, rechargement de l'extension pendant un test) : transitoire,
    // pas un verdict sur le job — ré-armement borné plutôt que failed sec
    // (cas réel du 2026-07-06 : "message channel closed before a response").
    if (/message channel closed|Receiving end does not exist/i.test(msg)) {
      console.warn(`[background] Job ${job.id} : canal coupé pendant le remplissage (transitoire) — ${msg}`);
      await rearmBounded(accessToken, job, `Remplissage interrompu (onglet navigué/rechargé) : ${msg}`)
        .catch((err) => console.error("[background] update-job-status failed:", err));
      return { status: "retry", error: msg };
    }
    console.error(`[background] Job ${job.id} en échec:`, e);
    await updateJobStatus(accessToken, job.id, "failed", { error: msg })
      .catch((err) => console.error("[background] update-job-status failed:", err));
    return { status: "failed", error: msg };
  }
}

// ── Incomplétude visible depuis la DB (fix du 2026-07-09) ─────────────────────
// Un job ne doit JAMAIS se déclarer réussi en silence alors qu'un champ que le
// handler considère OBLIGATOIRE est resté vide. C'était le cas : un dry-run
// Beebs Figurines remontait dry_run_completed / error:null pendant qu'Âge et
// Matière affichaient "Sélectionner une valeur" en rouge sur la page — seule
// une inspection visuelle pouvait le voir.
//
// Le statut reste inchangé (dry_run_completed / published : le remplissage a
// bien eu lieu), mais :
//   - `error` porte un préfixe explicite, cherchable en base ;
//   - `platform_fields.unfilled_required_fields` porte la liste brute, pour
//     filtrer/agréger sans parser du texte.
// Les handlers ne remontent ici que des champs déjà marqués obligatoires dans
// leur propre code (Beebs : libellé sans "(facultatif)" ; Leboncoin : univers
// et Produit*). Vinted et eBay renvoient toujours une liste vide — leur seul
// champ requis, le genre, est bloqué en amont par precheckJob.
const UNFILLED_PREFIX = "COMPLÉTÉ AVEC CHAMPS MANQUANTS";

function completionExtras(job, result) {
  const unfilled = result.unfilledRequired ?? [];
  const warnings = result.warnings ?? [];
  const parts = [];
  if (unfilled.length) parts.push(`${UNFILLED_PREFIX} : ${unfilled.join(", ")}`);
  if (warnings.length) parts.push(`Warnings: ${warnings.join(" | ")}`);

  const extras = { error: parts.length ? parts.join(". ") : null };
  if (unfilled.length) {
    console.warn(`[background] Job ${job.id} : ${UNFILLED_PREFIX} : ${unfilled.join(", ")}`);
    // Fusion, jamais d'écrasement : platform_fields porte aussi le mapping
    // catégorie et needsUserAttempts.
    extras.platform_fields = {
      ...(job.platform_fields ?? {}),
      unfilled_required_fields: unfilled,
    };
  }
  return extras;
}

// Ré-armement BORNÉ d'un job en pending : au plus MAX_NEEDS_USER_RETRIES
// passages, sinon le job bouclerait indéfiniment (rouvrant un onglet +
// remplissant le formulaire à chaque cron) si la cause ne disparaît jamais —
// même risque DataDome que le dry-run en boucle. Compteur porté par
// platform_fields.needsUserAttempts (partagé needsUser / erreurs transitoires).
async function rearmBounded(accessToken, job, errorMsg) {
  const attempts = (job.platform_fields?.needsUserAttempts ?? 0) + 1;
  if (attempts >= MAX_NEEDS_USER_RETRIES) {
    console.warn(`[background] Job ${job.id} : cause toujours présente après ${attempts} tentatives → failed (sort de la boucle) — ${errorMsg}`);
    await updateJobStatus(accessToken, job.id, "failed", { error: errorMsg });
  } else {
    console.warn(`[background] Job ${job.id} : ré-armement (tentative ${attempts}/${MAX_NEEDS_USER_RETRIES}) — ${errorMsg}`);
    await updateJobStatus(accessToken, job.id, "pending", {
      error: errorMsg,
      platform_fields: { ...(job.platform_fields ?? {}), needsUserAttempts: attempts },
    });
  }
}

// ── Exception brouillon Leboncoin : onglet temporaire par job ──────────────────
// Cas fréquent en pratique : chaque dry-run LBC laisse NOTRE propre brouillon
// à l'aperçu (on remplit le wizard sans jamais publier), donc tout job LBC
// suivant trouve l'onglet persistant bloqué — et un utilisateur peut aussi
// avoir son propre brouillon manuel en cours. Plutôt qu'un needsUser
// systématique, on traite CE job dans un onglet temporaire : si le brouillon
// vit dans l'état de l'onglet (sessionStorage), l'onglet neuf repart de zéro.
//
// EXCEPTION bornée, pas une stratégie (règles anti-DataDome permanentes,
// l'onglet persistant getOrCreateWorkTab reste la norme) :
//   - au plus UN onglet temporaire par cycle de poll (jamais en rafale sur
//     plusieurs jobs : les suivants repartent en needsUser → prochain cron),
//   - jamais à moins de JOB_DELAY_MS du précédent (même délai que les autres
//     opérations sensibles, persisté en storage.session pour survivre aux
//     redémarrages du service worker),
//   - l'onglet temporaire est TOUJOURS fermé une fois le job terminé
//     (dry-run, publication ou erreur) — rien ne traîne à côté du persistant,
//   - le brouillon de l'onglet persistant n'est jamais touché,
//   - si le brouillon réapparaît dans l'onglet neuf (brouillon de compte,
//     pas d'onglet), on rend la main : un autre onglet n'y changerait rien.
let tempTabUsedThisPoll = false;
const TEMP_TAB_LAST_KEY = "fillsell_temp_tab_last_at";

async function retryInTempTab(job, handler, originalResult) {
  if (tempTabUsedThisPoll) {
    console.log(`[background] Job ${job.id} : brouillon bloquant, mais l'onglet temporaire de ce cycle a déjà servi → needsUser (prochain cron)`);
    return originalResult;
  }
  const store = await chrome.storage.session.get(TEMP_TAB_LAST_KEY);
  if (Date.now() - (store[TEMP_TAB_LAST_KEY] ?? 0) < FILLSELL_CONFIG.JOB_DELAY_MS) {
    console.log(`[background] Job ${job.id} : dernier onglet temporaire trop récent → needsUser (prochain cron)`);
    return originalResult;
  }
  tempTabUsedThisPoll = true;
  await chrome.storage.session.set({ [TEMP_TAB_LAST_KEY]: Date.now() });

  console.log(`[background] Job ${job.id} : brouillon sur l'onglet persistant → onglet temporaire dédié`);
  let tab = null;
  try {
    // Fragment distinct de #fillsell-worker : cet onglet ne sera jamais
    // adopté comme onglet de travail persistant. (typeof : newListingUrl
    // peut être une fonction — cf. eBay — même si seul LBC pose draftBlocked.)
    const tempUrl = typeof handler.newListingUrl === "function"
      ? handler.newListingUrl(job)
      : handler.newListingUrl;
    tab = await chrome.tabs.create({ url: tempUrl + "#fillsell-temp", active: false });
    await waitForTabComplete(tab.id);
    const result = await sendMessageToTab(tab.id, { type: "FILL_LISTING", job });
    if (result?.draftBlocked) {
      return {
        ...result,
        error:
          (result.error || "") +
          " Le brouillon persiste même dans un onglet neuf : c'est un brouillon " +
          "de compte, le publier ou le supprimer sur leboncoin.fr.",
      };
    }
    return result;
  } catch (e) {
    console.error(`[background] Onglet temporaire job ${job.id}:`, e);
    return originalResult;
  } finally {
    // Fermeture SYSTÉMATIQUE (dry-run compris — contrairement à l'onglet
    // persistant qui reste ouvert pour inspection).
    if (tab) await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// ── Entrée par la home puis navigation interne (eBay) ──────────────────────────
// Un onglet qui s'ouvre froid sur /sl/list?mode=AddItem (aucun referrer, aucune
// page du site chargée avant) est un signal d'automatisation. On reproduit le
// trajet d'un vendeur : la home est déjà chargée (getOrCreateWorkTab), on la
// "lit" quelques secondes, on demande au content script de cliquer réellement
// le lien "Vendre", puis on rejoint l'URL de dépôt par une navigation interne.
//
// Jamais bloquant : le lien "Vendre" introuvable, un content script muet ou
// une navigation ratée n'échouent PAS le job — on retombe sur la navigation
// directe vers l'URL de dépôt (comportement d'avant le 2026-07-09), le
// remplissage lui-même est identique dans les deux cas.
async function navigateHomeToForm(tabId, listingUrl) {
  await sleep(randInt(1500, 4000)); // temps de "lecture" de la home

  try {
    const res = await sendMessageToTab(tabId, { type: "GO_TO_SELL" }, 15_000);
    if (res?.clicked) {
      // Le content script répond AVANT de cliquer (la navigation détruit le
      // canal de message) : on attend ici le chargement de la page de vente.
      await waitForTabComplete(tabId).catch(() => {});
      await sleep(randInt(1200, 3000));
    } else {
      console.warn(`[background] Entrée par la home : clic "Vendre" non effectué (${res?.reason ?? "sans raison"}) — navigation directe`);
    }
  } catch (e) {
    console.warn("[background] Entrée par la home : content script injoignable —", String(e?.message ?? e));
  }

  // Navigation interne vers le formulaire (depuis une page du site, avec
  // referrer) plutôt qu'une ouverture d'onglet froide.
  const loaded = waitForTabComplete(tabId);
  await chrome.tabs.update(tabId, { url: listingUrl + WORK_TAB_FRAGMENT });
  await loaded;
}

// ── Onglet de travail dédié ────────────────────────────────────────────────────
// Un SEUL onglet par plateforme, créé par l'extension et réutilisé de job en
// job. Historique : quand chaque job ouvrait son propre onglet, les sessions
// de test ont accumulé jusqu'à ~30 onglets Vinted simultanés et DataDome a
// suspendu le compte ("activité inhabituelle ou automatisée", 403 sur
// item_upload/items). Un humain a UN onglet Vinted et poste ses annonces
// dedans à la suite — on reproduit exactement ça.
//
// Identification de NOTRE onglet (et jamais celui d'un utilisateur qui
// navigue sur Vinted à côté) :
//   1. ID mémorisé dans chrome.storage.session (survit aux redémarrages du
//      service worker MV3, pas à ceux du navigateur — voulu)
//   2. repli : fragment #fillsell-worker dans l'URL, marqueur posé par nos
//      propres navigations, retrouvable via tabs.query si le storage a été
//      vidé alors que l'onglet vit encore
//   3. sinon : création d'un onglet neuf (une seule fois), gardé ensuite.
// Les onglets Vinted ouverts manuellement par l'utilisateur ne portent ni
// l'ID ni le fragment : ils ne sont jamais adoptés, jamais navigués.
const WORK_TAB_FRAGMENT = "#fillsell-worker";
const workTabKey = (platform) => `fillsell_work_tab_${platform}`;

async function getOrCreateWorkTab(platform, url) {
  const key = workTabKey(platform);
  const target = url + WORK_TAB_FRAGMENT;

  // 1. Onglet mémorisé encore vivant → le réutiliser. navigateWorkTab peut
  // retourner un AUTRE id (discard/remplacement anti-beforeunload) : on
  // re-mémorise systématiquement l'id effectif.
  const store = await chrome.storage.session.get(key);
  if (store[key] != null) {
    const tab = await chrome.tabs.get(store[key]).catch(() => null);
    if (tab) {
      const effectiveId = await navigateWorkTab(tab.id, target);
      await chrome.storage.session.set({ [key]: effectiveId });
      return effectiveId;
    }
  }

  // 2. Storage perdu mais notre onglet marqué existe peut-être encore
  const host = new URL(url).hostname.split(".").slice(-2).join(".");
  const candidates = await chrome.tabs.query({ url: `*://*.${host}/*` }).catch(() => []);
  const marked = candidates.find((t) => (t.url || "").includes(WORK_TAB_FRAGMENT));
  if (marked) {
    const effectiveId = await navigateWorkTab(marked.id, target);
    await chrome.storage.session.set({ [key]: effectiveId });
    return effectiveId;
  }

  // 3. Aucun onglet à nous : en créer UN, mémorisé pour les jobs suivants
  const tab = await chrome.tabs.create({ url: target, active: false });
  await chrome.storage.session.set({ [key]: tab.id });
  await waitForTabComplete(tab.id);
  return tab.id;
}

// Amène l'onglet de travail sur la page de dépôt avec un formulaire VIERGE.
// Retourne l'ID de l'onglet à utiliser (peut différer de tabId : discard ou
// remplacement — le caller met à jour son stockage).
//
// beforeunload : l'hypothèse d'origine ("le remplissage synthétique n'arme
// pas la popup") était fausse en pratique — le dry-run laisse le formulaire
// REMPLI pour inspection, l'utilisateur interagit avec l'onglet (activation
// utilisateur réelle), et la navigation suivante déclenche la popup native
// "Actualiser le site ?" qu'aucune API ne peut cliquer (cas réel Vinted du
// 2026-07-06, préexistant aux fixes du jour : cette navigation date de la
// création de l'onglet de travail). Parade en deux temps :
//   1. onglet non actif (cas normal, il est créé active:false) :
//      chrome.tabs.discard décharge la page SANS exécuter les handlers
//      beforeunload, et la navigation repart d'une page morte — aucun
//      dialogue possible. NB: discard peut réattribuer un nouvel ID.
//   2. onglet actif (l'utilisateur le regarde, discard refusé par Chrome) :
//      on le REMPLACE — création du nouvel onglet de travail (inactif) puis
//      fermeture de l'ancien via tabs.remove, qui ne déclenche pas la popup
//      beforeunload. Toujours UN SEUL onglet persistant à l'arrivée, un seul
//      chargement de page de dépôt par job — jamais de blocage manuel.
//   3. la navigation ne "prend" pas (cas Beebs du 2026-07-09) : quand un
//      dialogue beforeunload est DÉJÀ ouvert sur l'onglet ("Quitter le site ?"
//      laissé par un test précédent), chrome.tabs.discard échoue et
//      chrome.tabs.update ne navigue pas — waitForTabComplete expirait au bout
//      de 30 s, le job partait en failed et AUCUN onglet ne s'ouvrait. On
//      remplace alors l'onglet (même parade que le cas 2 : tabs.remove ne
//      déclenche pas beforeunload), au lieu de laisser mourir le job.
async function navigateWorkTab(tabId, target) {
  const tab = await chrome.tabs.get(tabId);

  if (!tab.active) {
    let effectiveId = tabId;
    try {
      const discarded = await chrome.tabs.discard(tabId);
      if (discarded?.id != null) effectiveId = discarded.id;
    } catch {
      // Déjà déchargé ou discard indisponible : l'état RÉEL est vérifié
      // juste en dessous, on ne suppose plus rien.
    }
    // 4. (2026-07-12) discard peut échouer SANS lever, même inactif — cas
    //    identifié : DevTools attachés à l'onglet de travail (précisément
    //    quand on observe un run en direct). Naviguer un onglet NON déchargé
    //    dont le formulaire porte des modifications non sauvegardées (les
    //    specifics prennent réellement depuis les fixes LIVE) déclenche le
    //    dialogue beforeunload → page gelée, timeout 30 s, remplacement
    //    tardif et dialogue orphelin (vécu au run du 2026-07-12 midi). On
    //    vérifie l'état réel : pas déchargé → remplacement IMMÉDIAT, aucun
    //    dialogue possible, pas de gel.
    const check = await chrome.tabs.get(effectiveId).catch(() => null);
    if (!check || !check.discarded) {
      if (check) {
        console.log(
          `[background] Onglet de travail ${effectiveId} non déchargé après discard ` +
          "(DevTools attachés ?) — remplacement direct pour éviter le dialogue beforeunload"
        );
      }
      return replaceWorkTab(effectiveId, target);
    }
    try {
      // Écouteur attaché AVANT de déclencher la navigation : un chargement
      // rapide pourrait sinon émettre son "complete" avant qu'on ne l'attende.
      const loaded = waitForTabComplete(effectiveId);
      await chrome.tabs.update(effectiveId, { url: target });
      await loaded;
      return effectiveId;
    } catch (e) {
      console.warn(
        `[background] Onglet de travail ${effectiveId} bloqué (dialogue beforeunload resté ouvert ?) : ` +
        `${String(e?.message ?? e)} — remplacement par un onglet neuf`
      );
      return replaceWorkTab(effectiveId, target);
    }
  }

  return replaceWorkTab(tabId, target);
}

// Crée le nouvel onglet de travail (inactif) PUIS ferme l'ancien : tabs.remove
// ne déclenche jamais la popup beforeunload, contrairement à une navigation.
// Toujours UN SEUL onglet persistant à l'arrivée.
async function replaceWorkTab(oldTabId, target) {
  const fresh = await chrome.tabs.create({ url: target, active: false });
  await waitForTabComplete(fresh.id);
  await chrome.tabs.remove(oldTabId).catch(() => {});
  return fresh.id;
}

// ── Helpers onglets ────────────────────────────────────────────────────────────

function waitForTabComplete(tabId, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("Timeout: la page de dépôt n'a pas fini de charger"));
    }, timeoutMs);

    function onUpdated(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        // Petit délai pour laisser l'app JS de la plateforme s'initialiser
        setTimeout(resolve, 2000);
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

// ── Ré-authentification interceptée après le clic de publication ───────────────
// Une plateforme peut exiger une reconnexion AU MOMENT de l'action engageante,
// même avec une session valide au remplissage : constaté en réel le 2026-07-11
// sur eBay, où « Mettre en vente avec les frais affichés » a redirigé vers
// signin.ebay.fr → « Se connecter avec une clé d'accès » (passkey). C'est
// INFRANCHISSABLE par automatisation, et c'est très bien ainsi : on ne cherche
// pas à contourner, on le signale à l'utilisateur.
// La détection doit vivre ICI : la redirection détruit le contexte du content
// script, qui a déjà répondu success sans savoir que l'annonce n'a pas été
// créée. Sans cette garde, le job partait en "published" fantôme.
const REAUTH_HOSTS = {
  ebay: /(^|\.)signin\.ebay\.(fr|com)$/i,
  vinted: /(^|\.)vinted\.(fr|com)$/i, // sous-chemin /auth uniquement, cf. ci-dessous
  leboncoin: /(^|\.)auth\.leboncoin\.fr$/i,
  beebs: /(^|\.)beebs\.app$/i,        // sous-chemin /login uniquement
};
const REAUTH_PATHS = {
  vinted: /\/(auth|login|member\/signup_login)/i,
  beebs: /\/(login|signin|connexion)/i,
};

// Polling court : la redirection de ré-authentification peut arriver une
// poignée de secondes après le clic (le handler ne rend la main qu'après son
// propre sleep, mais la plateforme peut être plus lente). Une seule lecture de
// l'URL laisserait passer le cas.
async function detectReauth(tabId, platform, timeoutMs = 6000) {
  const hostRe = REAUTH_HOSTS[platform];
  if (!hostRe) return null;
  const pathRe = REAUTH_PATHS[platform];

  const listingRe = LISTING_URL_PATTERNS[platform];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.url) {
      // Sortie immédiate quand l'onglet est déjà sur l'annonce créée : pas de
      // ré-authentification possible, inutile d'attendre le timeout (sinon on
      // ajouterait ces secondes à CHAQUE publication réussie).
      if (listingRe?.test(tab.url)) return null;

      let host = "", path = "";
      try {
        const u = new URL(tab.url);
        host = u.hostname;
        path = u.pathname;
      } catch { /* URL interne (chrome://) : rien à conclure */ }

      // Pour les plateformes dont le login vit sur le domaine principal, le
      // host seul ne prouve rien — il faut aussi le chemin.
      if (host && hostRe.test(host) && (!pathRe || pathRe.test(path))) {
        const label = platform.charAt(0).toUpperCase() + platform.slice(1);
        return (
          `Reconnexion ${label} requise : la plateforme a demandé une ré-authentification ` +
          `(${host}${path}) au moment de la publication — l'annonce n'a PAS été créée. ` +
          `Se reconnecter sur ${label} dans Chrome (l'onglet de travail est resté ouvert) ; ` +
          "le job repartira automatiquement au prochain passage."
        );
      }
    }
    await sleep(1000);
  }
  return null;
}

// ── Vérification de soumission eBay (2026-07-12) ───────────────────────────────
// Le clic « Mettre en vente avec les frais affichés » peut être REFUSÉ sur
// place par la validation du formulaire (vécu en LIVE réel : « Vous devez
// ajouter une description » — l'onglet reste sur /lstng, rien n'est soumis),
// pendant que le content script a déjà répondu success. Signal de succès RÉEL
// exigé : l'onglet QUITTE le formulaire (redirection vers la confirmation ou
// l'annonce). Tant qu'il y reste, on lit les bandeaux d'erreur visibles pour
// remonter le message exact d'eBay ; à l'échéance sans redirection ni bandeau,
// on refuse quand même le "published" — aucun signal de succès ≠ succès.
async function verifyEbaySubmission(tabId, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    // Onglet disparu : impossible d'observer quoi que ce soit — on n'invente
    // pas un refus (captureListingUrl rendra listing_url null, c'est tout).
    if (!tab) return null;
    let path = "";
    try {
      path = new URL(tab.url || "").pathname;
    } catch { /* URL interne (chrome://) : on continue d'attendre */ }
    if (path && !/\/lstng/.test(path)) return null; // formulaire quitté : soumission partie

    const errors = await readVisibleEbayErrors(tabId);
    if (errors.length) {
      return (
        "Publication eBay REFUSÉE par la validation du formulaire : " +
        `« ${errors.join(" | ")} » — l'onglet de travail est resté sur le formulaire, ` +
        "le job repartira au prochain passage."
      );
    }
    await sleep(1000);
  }
  return (
    `Publication eBay non confirmée : l'onglet est resté sur le formulaire (/lstng) ` +
    `${Math.round(timeoutMs / 1000)} s après le clic, sans redirection ni bandeau d'erreur — ` +
    "job NON marqué publié, il repartira au prochain passage."
  );
}

// Bandeaux d'erreur visibles du formulaire eBay. Sélecteurs volontairement
// larges (le markup exact des notices n'a pas été relevé) mais bornés par la
// visibilité et la taille du texte : 8-250 caractères — filtre les conteneurs
// géants (un [class*="error"] parent de tout le formulaire) et les miettes.
// Un faux positif ici part en needsUser, jamais en published : sens sûr.
async function readVisibleEbayErrors(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const texts = [];
        const seen = new Set();
        const sel = '[role="alert"], .page-notice, .inline-notice, [class*="error" i]';
        for (const el of document.querySelectorAll(sel)) {
          if (!el.getClientRects().length) continue; // invisible
          const t = (el.innerText || "").replace(/\s+/g, " ").trim();
          if (t.length < 8 || t.length > 250 || seen.has(t)) continue;
          seen.add(t);
          texts.push(t);
        }
        return texts.slice(0, 3);
      },
    });
    return res?.result ?? [];
  } catch (e) {
    console.warn("[background] readVisibleEbayErrors :", String(e?.message ?? e));
    return [];
  }
}

// ── A1 : capture de l'URL de l'annonce créée (publication LIVE) ────────────────
// Ce que fait RÉELLEMENT chaque plateforme après le clic de publication
// (constaté en publication réelle le 2026-07-11, plus de suppositions) :
//   vinted    → REDIRIGE vers /member/{userId} (le profil, pas l'annonce !).
//               L'URL de l'annonce (/items/{id}-{slug}) n'apparaît QUE dans la
//               liste du dressing → surveillance de l'URL puis repli "liens de
//               la page", qui la trouve là.
//   leboncoin → /deposer-une-annonce/confirmation : "Nous avons bien reçu votre
//               annonce !" — AUCUN lien vers l'annonce (pas de "Voir mon
//               annonce"). L'URL /ad/{categorie}/{id} n'existe que dans
//               "Mes annonces" → aller-retour obligatoire (captureFromMyListings).
//   beebs     → /fr/listing/success : "Votre article a bien été ajouté…" — aucun
//               lien non plus, ET l'annonce part en modération avant d'être en
//               ligne. Même aller-retour, sur /my-adverts/creating.
//               ⚠️ Le format d'URL produit Beebs reste NON OBSERVÉ (l'annonce de
//               test n'était pas sortie de modération) : le pattern ci-dessous
//               est encore une supposition, à confirmer.
//   ebay      → non observé : le clic a déclenché une ré-authentification
//               passkey (cf. detectReauth), l'annonce n'a jamais été créée.
const LISTING_URL_PATTERNS = {
  vinted: /https:\/\/www\.vinted\.(?:fr|com)\/items\/\d+[^#\s"']*/i,
  leboncoin: /https:\/\/www\.leboncoin\.fr\/ad\/[^#\s"']+\/\d+[^#\s"']*/i,
  ebay: /https:\/\/www\.ebay\.(?:fr|com)\/itm\/[^#\s"']*\d{9,}[^#\s"']*/i,
  beebs: /https:\/\/www\.beebs\.app\/[^#\s"']*(?:produit|product|annonce|item|p\/)[^#\s"']+/i,
};

// Page "Mes annonces" par plateforme (2026-07-11) : Leboncoin et Beebs NE
// redirigent PAS vers l'annonce créée — leur dépôt finit sur une page de
// confirmation générique ("Nous avons bien reçu votre annonce !" /
// "Votre article a bien été ajouté…"), sans le moindre lien vers l'annonce.
// Constaté en publication réelle. Le SEUL endroit où l'URL existe est la liste
// des annonces du compte : on y fait un aller-retour, on repère l'annonce par
// son TITRE (exact), et on revient. Vinted et eBay, eux, redirigent
// directement — pas d'aller-retour pour eux.
const MY_LISTINGS_URL = {
  leboncoin: "https://www.leboncoin.fr/compte/part/mes-annonces",
  // Beebs : l'annonce passe d'abord par "En cours de vérification"
  // (/my-adverts/creating) avant d'atteindre "Actuellement en ligne"
  // (/my-adverts) — délai de modération observé > 30 min. On regarde les deux.
  beebs: "https://www.beebs.app/fr/account/my-adverts/creating",
};

async function captureListingUrl(tabId, platform, job = null, timeoutMs = 25_000) {
  const pattern = LISTING_URL_PATTERNS[platform];
  if (!pattern) return null;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return null;
    const m = (tab.url || "").match(pattern);
    if (m) return m[0].replace(WORK_TAB_FRAGMENT, "");
    await sleep(1000);
  }

  // Repli 1 : la page où l'on a atterri contient le lien de l'annonce —
  // profil Vinted (qui liste TOUTES les annonces : le titre est indispensable
  // pour ne pas ramener la mauvaise) ou vraie page de confirmation.
  const fromLinks = await findListingLinkInPage(tabId, pattern.source, job?.title ?? null);
  if (fromLinks) return fromLinks;

  // Repli 2 (LBC/Beebs) : aller-retour par "Mes annonces". L'onglet de travail
  // est navigué puis RENDU à la page où il était — un vendeur qui va vérifier
  // son annonce fait exactement ce trajet.
  const myListings = MY_LISTINGS_URL[platform];
  if (!myListings) {
    console.warn(`[background] captureListingUrl(${platform}) : aucune URL capturée — listing_url restera vide`);
    return null;
  }
  return captureFromMyListings(tabId, platform, pattern, myListings, job?.title ?? null);
}

// Cherche le lien de NOTRE annonce dans la page courante.
// ⚠️ Le titre n'est PAS optionnel dans les faits : après une publication
// Vinted, l'onglet atterrit sur le PROFIL du vendeur, qui liste toutes ses
// annonces (86 sur le compte de test). Prendre "le premier lien qui matche le
// pattern" y ramènerait l'URL d'un AUTRE article — et on l'écrirait dans
// listing_url, donc la détection de vente surveillerait le mauvais article et
// le retrait cross-plateforme supprimerait la mauvaise annonce.
// Règle : match par titre d'abord ; à défaut, on n'accepte un lien sans titre
// QUE s'il est le SEUL de la page (cas d'une vraie page de confirmation).
async function findListingLinkInPage(tabId, patternSource, title = null) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (src, wanted) => {
        const re = new RegExp(src, "i");
        const matches = [];
        for (const a of Array.from(document.querySelectorAll("a[href]"))) {
          const m = a.href.match(re);
          if (m) matches.push({ url: m[0], el: a });
        }
        if (!matches.length) return null;

        if (wanted) {
          const norm = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
          const target = norm(wanted);
          for (const { url, el } of matches) {
            const scope = el.closest("article, li, [class*='item'], [class*='card']") ?? el;
            const hay = norm(el.getAttribute("title") || "") + " " + norm(el.textContent) + " " + norm(scope.textContent);
            if (target && hay.includes(target)) return url;
          }
        }
        // Pas de correspondance par titre : un lien unique est sans ambiguïté
        // (page de confirmation) ; plusieurs → on refuse de deviner.
        const unique = [...new Set(matches.map((m) => m.url))];
        return unique.length === 1 ? unique[0] : null;
      },
      args: [patternSource, title],
    });
    return res?.result ?? null;
  } catch (e) {
    console.warn("[background] findListingLinkInPage :", String(e?.message ?? e));
    return null;
  }
}

async function captureFromMyListings(tabId, platform, pattern, myListingsUrl, title) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const backTo = tab?.url ?? null;
  try {
    console.log(`[background] captureListingUrl(${platform}) : aller-retour par "Mes annonces"`);
    // 8-15 s : constaté en LIVE réel (2026-07-12), 1,5-3,5 s ne suffisaient
    // pas — l'annonce venait d'être déposée mais n'était pas encore indexée
    // dans "Mes annonces" (LBC comme Beebs). Si elle n'y est toujours pas
    // (modération plus longue), recoverMissingListingUrls re-cherchera aux
    // cycles de poll suivants.
    await sleep(randInt(8000, 15000));
    const loaded = waitForTabComplete(tabId);
    await chrome.tabs.update(tabId, { url: myListingsUrl + WORK_TAB_FRAGMENT });
    await loaded;
    await sleep(randInt(1200, 2500)); // rendu de la liste

    const url = await findListingLinkInPage(tabId, pattern.source, title);
    if (url) {
      console.log(`[background] captureListingUrl(${platform}) : URL trouvée dans Mes annonces — ${url}`);
      return url;
    }
    console.warn(
      `[background] captureListingUrl(${platform}) : annonce introuvable dans Mes annonces ` +
      "(modération en cours ?) — listing_url vide pour l'instant, re-tentative aux prochains " +
      "cycles de poll (recoverMissingListingUrls)."
    );
    return null;
  } catch (e) {
    console.warn(`[background] captureFromMyListings(${platform}) :`, String(e?.message ?? e));
    return null;
  } finally {
    // Rendre l'onglet de travail à sa page d'origine (page de confirmation) :
    // le job suivant le renaviguera de toute façon, mais on ne le laisse pas
    // planté sur la liste des annonces du vendeur.
    if (backTo) {
      const back = waitForTabComplete(tabId).catch(() => {});
      await chrome.tabs.update(tabId, { url: backTo }).catch(() => {});
      await back;
    }
  }
}

// ── A2 : détection de vente sur les annonces published ─────────────────────────
// Détecteurs HTML portés TELS QUELS de check-listing-status v4 (qui ne les
// exécutera plus jamais : v5 = orchestrateur DB pur). Différence : le fetch
// part du navigateur du vendeur — cookies de session, IP résidentielle et
// User-Agent réels (le SW ne peut pas forger l'UA, tant mieux).
// Cadence : au plus SALE_CHECK_MAX_PER_CYCLE annonces par cycle de poll
// (30 min), chacune au plus toutes les SALE_CHECK_MIN_INTERVAL_MS, avec une
// pause jitter entre deux fetches — un humain qui re-regarde ses annonces,
// pas une rafale.
const SALE_CHECK_MIN_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 h entre deux vérifs
const SALE_CHECK_MAX_PER_CYCLE = 8;

// ── Délai de grâce après publication (2026-07-12) ─────────────────────────────
// SALE_CHECK_MIN_INTERVAL_MS n'espaçait que deux vérifications SUCCESSIVES : une
// annonce fraîchement publiée (last_checked_at null) partait en tête de file et
// était vérifiée IMMÉDIATEMENT. Or une annonce n'est pas encore consultable
// publiquement dans les minutes qui suivent son dépôt — elle serait lue comme
// "unavailable" et un bandeau « Vendue ? » s'afficherait sur une annonce qui
// vient d'être mise en ligne.
// Fenêtres calées sur ce qu'on a RÉELLEMENT observé le 2026-07-12 :
//   beebs     : 24 h — passe par « En cours de vérification » (modération), et
//               sa propagation est différée à DEUX niveaux (liste vendeur
//               obsolète plusieurs secondes, page publique servie en cache CDN
//               plusieurs MINUTES après un changement d'état). C'est aussi la
//               plateforme dont des annonces ont « disparu » sans explication :
//               large marge assumée.
//   leboncoin : 6 h — l'annonce n'était pas indexée dans « Mes annonces »
//               immédiatement après le dépôt (captureListingUrl revenait
//               bredouille : c'est ce qui a motivé recoverMissingListingUrls).
//   ebay      : 2 h — mise en ligne rapide et /itm/ répond tout de suite.
//   vinted    : 2 h — annonce consultable immédiatement après publication.
const PUBLISH_GRACE_MS = {
  beebs: 24 * 60 * 60 * 1000,
  leboncoin: 6 * 60 * 60 * 1000,
  ebay: 2 * 60 * 60 * 1000,
  vinted: 2 * 60 * 60 * 1000,
};
const PUBLISH_GRACE_DEFAULT_MS = 6 * 60 * 60 * 1000;

// ── Détection d'état d'une annonce — RÉÉCRITE le 2026-07-12 ───────────────────
// Les détecteurs précédents (portés d'un scraping serveur qui n'a JAMAIS tourné
// avec succès) étaient FAUX DANS LES DEUX SENS. Vérifié sur du vrai HTML :
//   · une annonce Vinted RÉELLEMENT VENDUE ne déclenchait AUCUN motif → "active"
//     (les motifs cherchaient "can_buy":false alors que le HTML porte du JSON
//     ÉCHAPPÉ : \"can_buy\":false — ils ne pouvaient matcher NULLE PART) ;
//   · une annonce SUPPRIMÉE (404/410) était déclarée "sold" par une guillotine
//     en amont → toute annonce retirée à la main fabriquait une VENTE FANTÔME
//     (ligne dans ventes, inventaire passé en vendu, frères annulés, email).
//
// TROIS ÉTATS désormais, et une règle absolue : UNE DISPARITION N'EST JAMAIS
// UNE VENTE. Le doute ne s'écrit pas en base, il se demande à l'utilisateur.
//   "active"      → toujours en ligne, rien à faire
//   "sold"        → PREUVE POSITIVE de vente → orchestration automatique
//   "unavailable" → plus en ligne, cause inconnue (supprimée, masquée,
//                   expirée, vendue sans trace…) → AUCUNE écriture comptable,
//                   drapeau + bandeau de confirmation dans l'app
//   "unknown"     → on n'a rien pu conclure (bot-shield, champs absents) →
//                   on ne touche à rien, on réessaiera
//
// ⚠️ can_buy vaut false AUSSI sur ses PROPRES annonces actives (on n'achète pas
// chez soi) : ce champ ne doit JAMAIS servir de signal de vente.

// Les pages embarquent leur JSON dans du HTML : les guillemets y sont échappés
// (\"champ\":valeur). On accepte les deux formes — c'est précisément ce qui
// manquait et qui rendait tous les anciens motifs inopérants.
function jsonField(html, key) {
  const m = html.match(new RegExp('\\\\?"' + key + '\\\\?":\\s*(\\\\?"[^"\\\\]*\\\\?"|true|false|null|\\d+)'));
  if (!m) return null;
  return m[1].replace(/\\/g, "").replace(/^"|"$/g, "");
}

// VINTED — signal VÉRIFIÉ en session réelle (annonce vendue 8758429057 vs
// annonce active 9350977566) :
//   vendue : \"is_closed\":true,  \"item_closing_action\":\"sold\"
//   active : \"is_closed\":false, \"item_closing_action\":null
// (is_reserved et is_hidden sont des booléens SÉPARÉS : masqué/réservé ≠ vendu)
function detectVintedState(html, finalUrl) {
  if (/\/not-found|\/404/.test(finalUrl)) return "unavailable";
  const closed = jsonField(html, "is_closed");
  if (closed === null) return "unknown"; // page inattendue : ne rien conclure
  if (closed !== "true") return "active";
  return jsonField(html, "item_closing_action") === "sold" ? "sold" : "unavailable";
}

// Prix affiché sur la page de l'annonce — plus à jour que job.price si le
// vendeur a changé son prix depuis la publication.
// ⚠️ VÉRIFIÉ sur une annonce réellement vendue : Vinted n'expose AUCUN prix de
// TRANSACTION distinct du prix demandé. Champs présents :
//     \"price\":{\"amount\":\"24.5\"}       → prix demandé
//     \"originalAskingAmount\":\"24.5\"     → idem
//     \"totalAmount\":\"26.43\"             → ce que paie l'ACHETEUR (frais de
//                                            protection inclus) — SURTOUT PAS la
//                                            recette du vendeur, à ne jamais
//                                            utiliser comme prix de vente
//     \"offerValue\":$undefined            → une offre acceptée n'est PAS exposée
// Donc : une vente négociée sera enregistrée au prix demandé. L'utilisateur
// corrige dans l'app (le prix de vente y est éditable). C'est la meilleure
// donnée publiquement disponible, et on ne devine pas le reste.
function vintedListedPrice(html) {
  const m = html.match(/\\?"price\\?":\s*\{\s*\\?"amount\\?":\s*\\?"([\d.]+)\\?"/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// LEBONCOIN — relevé réel : une annonce supprimée rend HTTP 410, et les champs
// isActive/adStatus que cherchait l'ancien code N'EXISTENT PAS dans la réponse.
// Surtout : LBC n'expose AUCUN statut « vendu » public — une annonce vendue est
// simplement RETIRÉE, réponse identique à une suppression manuelle. La preuve de
// vente ne peut donc venir que de la page vendeur (mes-transactions) — étape 2.
function detectLeboncoinState(html) {
  if (html.includes("Cette annonce n’est plus disponible") || html.includes("a été supprimée")) {
    return "unavailable";
  }
  return "active";
}

// EBAY — relevé réel sur notre annonce TERMINÉE SANS VENTE (800328233923) :
//   "listingStatus":"ENDED"  (EN MAJUSCULES — l'ancien code cherchait "Ended")
// ⚠️ La page contient les mots « Vendu » et un prix de vente… qui appartiennent
// aux annonces RECOMMANDÉES en bas de page : toute détection par texte brut est
// un faux positif garanti. On ne lit que le champ JSON.
// La valeur d'une annonce réellement VENDUE n'a PAS pu être observée (aucune
// vente eBay sur le compte) : tant qu'on ne l'a pas relevée, eBay ne conclut
// JAMAIS "sold" tout seul → "unavailable" → bandeau.
function detectEbayState(html, finalUrl) {
  if (!/\/itm\//.test(finalUrl)) return "unavailable";
  const st = (jsonField(html, "listingStatus") || "").toUpperCase();
  if (!st) return "unknown";
  if (st === "ACTIVE") return "active";
  return "unavailable"; // ENDED, COMPLETED… : terminée ≠ vendue (à confirmer)
}

// BEEBS — relevé réel : active → \"status\":\"AVAILABLE\" ; supprimée → 404.
// ⚠️ La chaîne \"sold\":\"Vendu\" est un LIBELLÉ de traduction présent sur TOUTES
// les pages (y compris actives) : piège de l'ancien motif "sold":true.
// Valeur du champ status pour une vente réelle : NON OBSERVÉE → jamais "sold".
function detectBeebsState(html) {
  const st = (jsonField(html, "status") || "").toUpperCase();
  if (!st) return "unknown";
  return st === "AVAILABLE" ? "active" : "unavailable";
}

// Retourne { state, price } — price = prix lu SUR LA PAGE (null si inconnu),
// utilisé comme prix de vente à l'auto-confirmation quand il est disponible.
async function checkListingState(url, platform) {
  try {
    const res = await fetch(url, { credentials: "include", redirect: "follow" });
    // 404/410 : l'annonce n'est plus là. Ce n'est PAS une vente — c'était la
    // guillotine qui fabriquait les ventes fantômes.
    if (res.status === 404 || res.status === 410) return { state: "unavailable", price: null };
    if (!res.ok) return { state: "unknown", price: null }; // bot-shield : ne pas conclure
    const html = await res.text();
    const finalUrl = res.url;
    switch (platform) {
      case "leboncoin": return { state: detectLeboncoinState(html), price: null };
      case "vinted":    return { state: detectVintedState(html, finalUrl), price: vintedListedPrice(html) };
      case "ebay":      return { state: detectEbayState(html, finalUrl), price: null };
      case "beebs":     return { state: detectBeebsState(html), price: null };
      default:          return { state: "unknown", price: null };
    }
  } catch (e) {
    console.warn(`[background] checkListingState(${url}):`, String(e?.message ?? e));
    return { state: "unknown", price: null };
  }
}

// PostgREST direct (RLS user via JWT) : lecture des published à vérifier et
// tampon last_checked_at — pas de nouvelle edge function pour si peu.
async function restRequest(path, accessToken, init = {}) {
  const res = await fetch(`${FILLSELL_CONFIG.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: FILLSELL_CONFIG.SUPABASE_ANON_KEY,
      Prefer: "return=minimal",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`REST ${path} → HTTP ${res.status}`);
  return init.method && init.method !== "GET" ? null : res.json();
}

async function checkPublishedListings(session) {
  let jobs;
  try {
    jobs = await restRequest(
      "cross_post_jobs" +
        "?select=id,platform,listing_url,last_checked_at,published_at,created_at,platform_fields" +
        "&status=eq.published&action=eq.publish&listing_url=not.is.null" +
        "&order=last_checked_at.asc.nullsfirst&limit=30",
      session.access_token
    );
  } catch (e) {
    console.error("[background] Lecture des jobs published:", String(e?.message ?? e));
    return;
  }

  const now = Date.now();

  // Délai de grâce : une annonce trop fraîche n'est PAS vérifiée du tout — on ne
  // la lit même pas (économie de requêtes, et zéro risque de conclure sur une
  // annonce en cours d'indexation/modération). Elle sera examinée au cycle qui
  // suivra la fin de sa fenêtre.
  const inGrace = (j) => {
    const ref = Date.parse(j.published_at ?? j.created_at ?? "");
    if (!Number.isFinite(ref)) return false; // pas de date fiable : on ne bloque pas
    const grace = PUBLISH_GRACE_MS[j.platform] ?? PUBLISH_GRACE_DEFAULT_MS;
    return now - ref < grace;
  };

  const fresh = (jobs ?? []).filter(inGrace);
  if (fresh.length) {
    console.log(
      `[background] Délai de grâce : ${fresh.length} annonce(s) trop récente(s), non vérifiée(s) — ` +
      fresh.map((j) => `${j.platform} (${Math.round((PUBLISH_GRACE_MS[j.platform] ?? PUBLISH_GRACE_DEFAULT_MS) / 3600000)} h)`).join(", ")
    );
  }

  const due = (jobs ?? [])
    .filter((j) => !inGrace(j))
    .filter((j) => !j.last_checked_at || now - Date.parse(j.last_checked_at) > SALE_CHECK_MIN_INTERVAL_MS)
    .slice(0, SALE_CHECK_MAX_PER_CYCLE);
  if (!due.length) return;

  console.log(`[background] Détection : ${due.length} annonce(s) à vérifier`);
  for (let i = 0; i < due.length; i++) {
    const job = due[i];
    const { state, price } = await checkListingState(job.listing_url, job.platform);
    console.log(`[background] ${job.platform} ${job.id} → ${state}${price ? ` (prix page : ${price} €)` : ""}`);

    // État AMBIGU (bot-shield, page inattendue, champs absents) : on ne conclut
    // RIEN, on ne pose AUCUN drapeau — et on ne tamponne même pas
    // last_checked_at, pour que le job soit re-examiné au cycle suivant plutôt
    // que d'attendre 2 h sur une lecture qui n'a rien donné.
    if (state === "unknown") {
      console.log(`[background] ${job.platform} ${job.id} : état indéterminé — aucune conclusion, nouvelle tentative au prochain cycle`);
      if (i < due.length - 1) await sleep(randInt(1500, 4000));
      continue;
    }

    const patch = { last_checked_at: new Date().toISOString() };

    // ⚠️ RÈGLE ABSOLUE (décision produit 2026-07-12) : le poll N'ÉCRIT JAMAIS
    // de vente en base — sur AUCUNE plateforme, pas même Vinted dont la preuve
    // de vente est pourtant fiable. Raison : le prix réel peut différer du prix
    // affiché (offre acceptée, marchandage), et un vendeur à volume ne
    // repassera jamais corriger après coup — la marge resterait fausse pour
    // toujours, en silence. Un bandeau au bon moment coûte moins cher qu'une
    // comptabilité fausse.
    // Le poll ne fait donc qu'une chose : POSER UN DRAPEAU. Le seul chemin qui
    // écrit (vente, inventaire, marges, frères) est le clic « Oui, enregistrer
    // la vente » dans l'app.
    //
    // La preuve positive ne disparaît pas pour autant — elle change de rôle :
    //   sale_signal="sold"        → bandeau IMMÉDIAT et affirmatif (« Vendue sur
    //                               Vinted 🎉 »), sans attendre une disparition
    //                               ambiguë, avec le prix lu sur la page pré-rempli
    //   sale_signal="unavailable" → bandeau interrogatif (« Plus en ligne —
    //                               vendue ? »), prix de publication pré-rempli
    if (state === "sold" || state === "unavailable") {
      const pf = job.platform_fields ?? {};
      if (!pf.unavailable_since) {
        patch.platform_fields = {
          ...pf,
          unavailable_since: new Date().toISOString(),
          sale_signal: state, // "sold" = preuve positive | "unavailable" = doute
          ...(state === "sold" && price ? { detected_price: price } : {}),
        };
        console.log(
          state === "sold"
            ? `[background] ${job.platform} ${job.id} : VENTE DÉTECTÉE (preuve positive)${price ? ` au prix affiché ${price} €` : ""} → confirmation utilisateur (aucune écriture)`
            : `[background] ${job.platform} ${job.id} : plus en ligne, AUCUNE preuve de vente → confirmation utilisateur`
        );
      }
    }

    await restRequest(`cross_post_jobs?id=eq.${job.id}`, session.access_token, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).catch((e) => console.warn("[background] PATCH job:", String(e?.message ?? e)));

    if (i < due.length - 1) await sleep(randInt(1500, 4000));
  }
}

// ── Re-capture différée des listing_url manquants (2026-07-12) ─────────────────
// Vécu en LIVE réel : LBC et Beebs publient bien, mais l'annonce ne figure
// dans "Mes annonces" qu'après un délai de modération/indexation —
// l'aller-retour de captureListingUrl, fait dans la foulée du dépôt, revenait
// bredouille ("annonce introuvable dans Mes annonces") et le job restait
// published SANS listing_url, donc invisible de la détection de vente et du
// retrait ciblé. On re-tente ici, au cycle de poll suivant : UNE navigation
// par plateforme et par cycle (cadence humaine — "je vais voir si mon annonce
// est en ligne"), tous les jobs manquants de la plateforme sont cherchés sur
// la même page chargée. Fenêtre bornée à 48 h après le dépôt : au-delà, ce
// n'est plus un délai de modération, on arrête de frapper à la porte.
const LISTING_URL_RECOVERY_PAGES = {
  leboncoin: ["https://www.leboncoin.fr/compte/part/mes-annonces"],
  // Beebs : d'abord "Actuellement en ligne" (l'URL publique de l'annonce vit
  // là), puis "En cours de vérification" au cas où la carte y porte déjà le
  // lien. ⚠️ Rappel : le format d'URL produit Beebs reste NON OBSERVÉ
  // (LISTING_URL_PATTERNS.beebs est une supposition).
  beebs: [
    "https://www.beebs.app/fr/account/my-adverts",
    "https://www.beebs.app/fr/account/my-adverts/creating",
  ],
};
const LISTING_URL_RECOVERY_MAX_AGE_MS = 48 * 60 * 60 * 1000;

async function recoverMissingListingUrls(session) {
  let jobs;
  try {
    jobs = await restRequest(
      "cross_post_jobs" +
        "?select=id,platform,title,created_at" +
        "&status=eq.published&action=eq.publish&listing_url=is.null" +
        "&platform=in.(leboncoin,beebs)&order=created_at.desc&limit=10",
      session.access_token
    );
  } catch (e) {
    console.error("[background] Lecture des published sans listing_url:", String(e?.message ?? e));
    return;
  }

  const now = Date.now();
  // Le titre est indispensable au repérage dans la liste (règle
  // findListingLinkInPage : jamais "le premier lien qui matche").
  const eligible = (jobs ?? []).filter(
    (j) => j.title && j.created_at && now - Date.parse(j.created_at) < LISTING_URL_RECOVERY_MAX_AGE_MS
  );
  if (!eligible.length) return;

  const byPlatform = new Map();
  for (const j of eligible) {
    if (!byPlatform.has(j.platform)) byPlatform.set(j.platform, []);
    byPlatform.get(j.platform).push(j);
  }

  for (const [platform, platformJobs] of byPlatform) {
    const pattern = LISTING_URL_PATTERNS[platform];
    console.log(
      `[background] listing_url manquant : ${platformJobs.length} job(s) ${platform} — passage par "Mes annonces"`
    );
    let remaining = [...platformJobs];
    for (const pageUrl of LISTING_URL_RECOVERY_PAGES[platform] ?? []) {
      if (!remaining.length) break;
      let tabId;
      try {
        // Onglet de travail persistant habituel — pas de restauration de page :
        // le prochain job le renaviguera, et un vendeur qui vérifie ses
        // annonces reste précisément sur cette liste.
        tabId = await getOrCreateWorkTab(platform, pageUrl);
      } catch (e) {
        console.warn(`[background] recover(${platform}) : onglet indisponible — ${String(e?.message ?? e)}`);
        break;
      }
      await sleep(randInt(1500, 3000)); // rendu de la liste
      const stillMissing = [];
      for (const job of remaining) {
        const url = await findListingLinkInPage(tabId, pattern.source, job.title);
        if (url) {
          console.log(`[background] listing_url récupéré (${platform}, job ${job.id}) : ${url}`);
          await restRequest(`cross_post_jobs?id=eq.${job.id}`, session.access_token, {
            method: "PATCH",
            body: JSON.stringify({ listing_url: url }),
          }).catch((e) => console.warn("[background] PATCH listing_url:", String(e?.message ?? e)));
        } else {
          stillMissing.push(job);
        }
      }
      remaining = stillMissing;
    }
    if (remaining.length) {
      console.log(
        `[background] listing_url toujours introuvable pour ${remaining.length} job(s) ${platform} ` +
        "(modération en cours ?) — nouvelle tentative au prochain cycle."
      );
    }
    await sleep(randInt(3000, 8000)); // pause entre plateformes, jamais en rafale
  }
}

// ── Onglet PEINT le temps d'une action (2026-07-12) ────────────────────────────
// Chrome ne calcule NI layout NI hydratation React pour un onglet qui n'a jamais
// été peint — et l'onglet de travail est créé active:false, donc jamais peint.
// Constaté et prouvé sur la page annonce Vinted (/items/<id>) :
//   onglet caché  → le DOM est là (HTML serveur : 2,2 Mo de textContent, 105
//                   boutons, [data-testid="item-delete-button"] présent), mais
//                   AUCUN layout (innerText 158 car., tous les rects 0×0,
//                   offsetParent null) et AUCUN handler React attaché : le clic
//                   part dans le vide, la modale ne se monte JAMAIS.
//                   → c'est très exactement l'erreur « Modale de confirmation
//                     introuvable après le clic Supprimer ».
//   onglet peint  → bouton 361×36, le même clic monte la modale
//                   (item-delete-modal, item-delete-confirmation-button).
// La publication, elle, n'a jamais eu besoin de ça : ses formulaires
// (/items/new, /lstng…) s'hydratent en arrière-plan. C'est la page ANNONCE
// Vinted qui exige la visibilité — on ne peint donc QUE le temps de la
// suppression, puis on rend la main à l'onglet de l'utilisateur.
async function paintTab(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return async () => {};
  if (tab.active) return async () => {}; // déjà peint : rien à faire ni à rendre

  // Onglet actif AVANT nous, dans la fenêtre de l'onglet de travail : on le
  // restaurera à la fin (l'utilisateur retrouve son écran).
  const [previous] = await chrome.tabs.query({ active: true, windowId: tab.windowId }).catch(() => []);

  await chrome.tabs.update(tabId, { active: true }).catch(() => {});
  // Une fenêtre minimisée/occluse ne peint pas non plus : on la ramène au
  // premier plan (sans la déplacer ni la redimensionner).
  await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  // Laisser le temps au premier paint + à l'hydratation de s'exécuter.
  await sleep(randInt(2500, 4000));
  console.log(`[background] Onglet de travail ${tabId} rendu VISIBLE (hydratation requise par la page)`);

  return async () => {
    if (previous && previous.id !== tabId) {
      await chrome.tabs.update(previous.id, { active: true }).catch(() => {});
    }
  };
}

// ── Phase B : exécution d'un job de SUPPRESSION (action='delete') ──────────────
// Armé UNIQUEMENT par le bandeau semi-auto de l'app (jamais automatique).
// Cible par plateforme : la page où vit le contrôle de suppression —
//   vinted → la page de l'annonce elle-même ; leboncoin → Mes annonces ;
//   ebay → Hub vendeur (annonces en cours) ; beebs → Mes annonces
//   (/fr/account/my-adverts, relevé en session réelle 2026-07-11).
// Le content script (DELETE_LISTING) fait le reste, en DELETE_DRY_RUN par
// défaut : il LOCALISE le contrôle de suppression sans jamais le cliquer et
// remonte une trace détaillée (platform_fields.delete_dry_run_trace) qui sert
// de relevé de sélecteurs pour la bascule en live.
const DELETE_TARGETS = {
  vinted: (job) => job.listing_url,
  leboncoin: () => "https://www.leboncoin.fr/compte/part/mes-annonces",
  ebay: () => "https://www.ebay.fr/sh/lst/active",
  beebs: () => "https://www.beebs.app/fr/account/my-adverts",
};

async function processDeleteJob(job, accessToken) {
  console.log(`[background] Job ${job.id} → ${job.platform} (DELETE)`);

  if (!job.listing_url) {
    const msg = "Job delete sans listing_url : impossible de cibler l'annonce à retirer.";
    await updateJobStatus(accessToken, job.id, "failed", { error: msg });
    return { status: "failed", error: msg };
  }

  try {
    await updateJobStatus(accessToken, job.id, "processing");

    const target = DELETE_TARGETS[job.platform]?.(job);
    if (!target) throw new Error(`Pas de cible de suppression pour ${job.platform}`);

    // Même onglet de travail persistant que la publication (anti-DataDome).
    const tabId = await getOrCreateWorkTab(job.platform, target);

    // L'onglet doit être PEINT pendant la suppression (2026-07-12, cause
    // prouvée de l'échec « Modale de confirmation introuvable ») — voir
    // withPaintedTab.
    const restore = await paintTab(tabId);
    let result;
    try {
      result = await sendMessageToTab(tabId, { type: "DELETE_LISTING", job });
    } finally {
      await restore();
    }

    if (result?.dryRun) {
      const trace = result.trace ?? [];
      console.log(`[background] Job ${job.id} : DELETE dry-run terminé —\n  ${trace.join("\n  ")}`);
      await updateJobStatus(accessToken, job.id, "dry_run_completed", {
        error: null,
        platform_fields: { ...(job.platform_fields ?? {}), delete_dry_run_trace: trace },
      });
      await recordRecentResult(job, "dry_run_completed");
      return { status: "dry_run_completed", trace };
    } else if (result?.needsUser) {
      await rearmBounded(accessToken, job, result.error);
      return { status: "needsUser", error: result.error };
    } else if (result?.success) {
      console.log(`[background] Job ${job.id} : annonce ${job.platform} supprimée`);
      await updateJobStatus(accessToken, job.id, "deleted", {
        platform_fields: { ...(job.platform_fields ?? {}), delete_trace: result.trace ?? [] },
      });
      await recordRecentResult(job, "deleted");
      return { status: "deleted" };
    } else {
      throw new Error(result?.error || "Le content script n'a pas retourné de résultat");
    }
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (/message channel closed|Receiving end does not exist/i.test(msg)) {
      await rearmBounded(accessToken, job, `Suppression interrompue (onglet navigué/rechargé) : ${msg}`)
        .catch((err) => console.error("[background] update-job-status failed:", err));
      return { status: "retry", error: msg };
    }
    console.error(`[background] Job ${job.id} (delete) en échec:`, e);
    await updateJobStatus(accessToken, job.id, "failed", { error: msg })
      .catch((err) => console.error("[background] update-job-status failed:", err));
    return { status: "failed", error: msg };
  }
}

// 300 s (et non 120 s) depuis le passage au timing humain du 2026-07-09 : la
// frappe caractère par caractère (80–250 ms) et les pauses aléatoires entre
// actions (300–900 ms) allongent volontairement un remplissage complet à
// ~1–2 min de temps RÉEL. Le timer Web Worker des content scripts garantit que
// ce temps n'est plus dilaté par le throttling des onglets cachés (fix
// 2026-07-08) — mais il reste supérieur à l'ancien budget de 120 s.
function sendMessageToTab(tabId, message, timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout: pas de réponse du content script")),
      timeoutMs
    );
    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
