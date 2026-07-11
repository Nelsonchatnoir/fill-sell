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
const FILLSELL_BUILD =
  "merge-v2 (beebs implémenté, entrée eBay par la home, timing humain, " +
  "pré-check catégorie avant navigation, adresse LBC validée par la valeur de l'input)";
console.log(
  `[background] FillSell service worker v${chrome.runtime.getManifest().version} — build: ${FILLSELL_BUILD}`
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

// Orchestration de la publication ciblée. Réutilise getValidSession (refresh),
// get-pending-jobs et processJob — aucune mécanique de remplissage réécrite.
async function publishSelected(jobIds) {
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

async function pollAndProcessJobs() {
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
      return { status: "dry_run_completed", unfilled: result.unfilledRequired ?? [] };
    } else if (result?.needsUser) {
      // Action utilisateur requise (adresse Leboncoin absente, brouillon LBC
      // à terminer, connexion). Ré-armement BORNÉ (voir rearmBounded).
      await rearmBounded(accessToken, job, result.error);
      return { status: "needsUser", error: result.error };
    } else if (result?.success) {
      console.log(`[background] Job ${job.id} publié : ${result.listingUrl ?? "(URL non récupérée)"}`);
      await updateJobStatus(accessToken, job.id, "published", {
        ...completionExtras(job, result),
        listing_url: result.listingUrl ?? undefined,
      });
      // L'onglet n'est PAS fermé : il sert au job suivant, comme un humain
      // qui garde son onglet Vinted ouvert entre deux dépôts.
      return { status: "published", listingUrl: result.listingUrl ?? null };
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
      // Déjà déchargé ou discard indisponible : on navigue quand même —
      // une page déjà déchargée n'a aucun beforeunload armé.
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
