// Service worker (Manifest V3).
// Toutes les 30 min : lit le JWT depuis chrome.storage.local, appelle
// get-pending-jobs, dispatche chaque job vers le content script de sa
// plateforme, puis remonte le résultat via update-job-status.

importScripts("config.js");

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
    implemented: false,
    newListingUrl: "https://www.beebs.app", // TODO: URL exacte du formulaire de dépôt
  },
  ebay: {
    implemented: false,
    newListingUrl: "https://www.ebay.fr/sl/sell",
  },
};

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
});

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
      console.warn("[background] Refresh du token échoué — reconnexion nécessaire");
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
    if (i < jobs.length - 1) await sleep(FILLSELL_CONFIG.JOB_DELAY_MS);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processJob(job, accessToken) {
  const handler = PLATFORM_HANDLERS[job.platform];
  if (!handler) {
    console.warn(`[background] Plateforme inconnue "${job.platform}", job ${job.id} laissé en pending`);
    return;
  }
  if (!handler.implemented) {
    console.log(`[background] Handler ${job.platform} pas encore implémenté, job ${job.id} laissé en pending`);
    return;
  }

  console.log(`[background] Job ${job.id} → ${job.platform}`);

  try {
    await updateJobStatus(accessToken, job.id, "processing");

    // Onglet de travail UNIQUE, réutilisé de job en job — jamais un onglet
    // neuf par job (voir getOrCreateWorkTab : DataDome a suspendu la session
    // quand les tests accumulaient un onglet Vinted par requête).
    const tabId = await getOrCreateWorkTab(job.platform, handler.newListingUrl);

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
      await updateJobStatus(accessToken, job.id, "dry_run_completed", {
        error: result.warnings?.length ? `Dry-run OK. Warnings: ${result.warnings.join(" | ")}` : null,
      });
    } else if (result?.needsUser) {
      // Action utilisateur requise (adresse Leboncoin absente, brouillon LBC
      // à terminer, connexion). Ré-armement BORNÉ (voir rearmBounded).
      await rearmBounded(accessToken, job, result.error);
    } else if (result?.success) {
      console.log(`[background] Job ${job.id} publié : ${result.listingUrl ?? "(URL non récupérée)"}`);
      await updateJobStatus(accessToken, job.id, "published", {
        listing_url: result.listingUrl ?? undefined,
      });
      // L'onglet n'est PAS fermé : il sert au job suivant, comme un humain
      // qui garde son onglet Vinted ouvert entre deux dépôts.
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
      return;
    }
    console.error(`[background] Job ${job.id} en échec:`, e);
    await updateJobStatus(accessToken, job.id, "failed", { error: msg })
      .catch((err) => console.error("[background] update-job-status failed:", err));
  }
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
    // adopté comme onglet de travail persistant.
    tab = await chrome.tabs.create({ url: handler.newListingUrl + "#fillsell-temp", active: false });
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
    // Écouteur attaché AVANT de déclencher la navigation : un chargement
    // rapide pourrait sinon émettre son "complete" avant qu'on ne l'attende.
    const loaded = waitForTabComplete(effectiveId);
    await chrome.tabs.update(effectiveId, { url: target });
    await loaded;
    return effectiveId;
  }

  const fresh = await chrome.tabs.create({ url: target, active: false });
  await waitForTabComplete(fresh.id);
  await chrome.tabs.remove(tabId).catch(() => {});
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

function sendMessageToTab(tabId, message, timeoutMs = 120_000) {
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
