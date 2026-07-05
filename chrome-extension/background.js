// Service worker (Manifest V3).
// Toutes les 30 min : lit le JWT depuis chrome.storage.local, appelle
// get-pending-jobs, dispatche chaque job vers le content script de sa
// plateforme, puis remonte le résultat via update-job-status.

importScripts("config.js");

const ALARM_NAME = "fillsell-poll-jobs";

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
    const result = await sendMessageToTab(tabId, { type: "FILL_LISTING", job });

    if (result?.dryRun) {
      // Dry-run : rien n'a été publié, on ré-arme le job. L'onglet de travail
      // reste ouvert (comme toujours) — le formulaire rempli y est inspectable
      // jusqu'au job suivant, qui rechargera la page.
      console.log(`[background] Job ${job.id} : DRY_RUN, formulaire rempli sans publication — ré-armé en pending`);
      await updateJobStatus(accessToken, job.id, "pending");
    } else if (result?.needsUser) {
      // Action utilisateur requise (ex: adresse Leboncoin absente des
      // Réglages, brouillon LBC à terminer) : PENDING avec message explicite,
      // jamais failed — le job repartira au poll suivant une fois l'action
      // faite, et le brouillon plateforme persiste.
      console.warn(`[background] Job ${job.id} : action utilisateur requise — ${result.error}`);
      await updateJobStatus(accessToken, job.id, "pending", { error: result.error });
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
    console.error(`[background] Job ${job.id} en échec:`, e);
    await updateJobStatus(accessToken, job.id, "failed", { error: String(e?.message ?? e) })
      .catch((err) => console.error("[background] update-job-status failed:", err));
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

  // 1. Onglet mémorisé encore vivant → le réutiliser
  const store = await chrome.storage.session.get(key);
  if (store[key] != null) {
    const tab = await chrome.tabs.get(store[key]).catch(() => null);
    if (tab) {
      await navigateWorkTab(tab.id, target);
      return tab.id;
    }
  }

  // 2. Storage perdu mais notre onglet marqué existe peut-être encore
  const host = new URL(url).hostname.split(".").slice(-2).join(".");
  const candidates = await chrome.tabs.query({ url: `*://*.${host}/*` }).catch(() => []);
  const marked = candidates.find((t) => (t.url || "").includes(WORK_TAB_FRAGMENT));
  if (marked) {
    await chrome.storage.session.set({ [key]: marked.id });
    await navigateWorkTab(marked.id, target);
    return marked.id;
  }

  // 3. Aucun onglet à nous : en créer UN, mémorisé pour les jobs suivants
  const tab = await chrome.tabs.create({ url: target, active: false });
  await chrome.storage.session.set({ [key]: tab.id });
  await waitForTabComplete(tab.id);
  return tab.id;
}

// Amène l'onglet de travail sur la page de dépôt avec un formulaire VIERGE.
// Si l'onglet est déjà sur cette URL (cas normal entre deux jobs : seul le
// fragment ou rien n'a changé, tabs.update ne rechargerait pas la page et le
// formulaire garderait les valeurs du job précédent), on force un reload.
// Pas de popup "Leave site?" à craindre : les dialogs beforeunload ne
// s'affichent que si la page a eu une interaction utilisateur réelle, ce que
// le remplissage par events synthétiques ne crée pas.
async function navigateWorkTab(tabId, target) {
  const tab = await chrome.tabs.get(tabId);
  const samePage = (tab.url || "").split("#")[0] === target.split("#")[0];
  // Écouteur attaché AVANT de déclencher la navigation : un reload rapide
  // pourrait sinon émettre son "complete" avant qu'on ne l'attende.
  const loaded = waitForTabComplete(tabId);
  if (samePage) {
    await chrome.tabs.update(tabId, { url: target }); // (re)pose le marqueur
    await chrome.tabs.reload(tabId);
  } else {
    await chrome.tabs.update(tabId, { url: target });
  }
  await loaded;
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
