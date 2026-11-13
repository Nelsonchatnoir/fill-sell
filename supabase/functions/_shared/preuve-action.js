// ═══════════════════════════════════════════════════════════════════════════
// UNE ACTION RÉUSSIE PROUVE LA CONNEXION (13/11/2026, 2e réponse de Nico — cas ed4531e2)
// ═══════════════════════════════════════════════════════════════════════════
// Nico : « Il était connecté à Vinted (ventes lues, 2 publications réussies), mais la sonde ne le voyait pas, donc jamais
// de première synchro. C'est le vieux problème du 403, il doit être fermé pour de bon : une action réussie sur une
// plateforme (vente lue, publication, relevé) prouve la connexion et compte comme session vue ; jamais de « pas connecté »
// affiché à quelqu'un qui vient de réussir une action. » Et : « Les 52 comptes sans plateforme choisie : oui, les
// plateformes qu'ils utilisent comptent comme choisies. »
//
// Constat (lu en base le 13/11) : ed4531e2, inscrit le 18/10, Vinted seul — publications Vinted réussies le 18/10 à
// 14:21 et 14:29 (Paris), ventes Vinted lues le 18/10 à 14:42 et le 22/10 à 18:16 ; la sonde du service worker répondait
// 403 (extension_sessions.vinted jamais `true`) → la première synchro (sessions `true` seulement) n'est jamais partie, et la
// vérité serveur (plateformes_verite : relevé, dépôt de moins de 72 h, sonde — jamais la vente lue) le disait « inconnue »
// dès le 21/10. Depuis le 01/10, 3 comptes connectés (prouvé par une action) n'ont jamais été vus : ed4531e2 (Vinted),
// 4dcf42bd et bafbd2de (Leboncoin, ventes lues).
//
// LA RÈGLE (pure, Deno + Node + Vite — une seule pour l'app, get-pending-jobs et la migration de plateformes_verite) :
//   · PREUVES d'action réussie, par plateforme : vente lue (usage_logs `releve_ventes` sans motif, ou au moins une vente
//     lue), dépôt (publish / republish publié ou vendu, `published_at`, jamais une annonce importée par un relevé), retrait
//     fait PAR FillSell (delete « deleted », `retrait_par = fillsell` — « déjà hors ligne » ne prouve rien), relevé fait
//     (« done », ou « incomplete » avec des annonces vues).
//   · Une preuve est un fait « connectée » daté, comme le relevé et le dépôt de plateformes_verite : moins de 7 jours →
//     connectée ; 7 à 30 jours → « à vérifier » (silence) ; jamais « pas encore vue » ni « pas connecté » tant qu'elle compte.
//   · GARDE, N = 24 h : dans les 24 h qui suivent une action réussie, AUCUNE SONDE ne dit « pas connecté » (la sonde du
//     service worker s'est déjà trompée : 403, 401, cookie illisible) ; seule une ACTION ratée PLUS RÉCENTE le peut — un
//     relevé tombé sur un mur de connexion, une page de connexion vue pendant une tâche (http `login_redirect_observee`,
//     noterSessionDeconnectee) — et elle garde son message à elle. Pourquoi 24 h : la lecture des ventes repasse toutes les
//     20 h (VENTES_CADENCE_MS de l'extension) ; un vendeur dont les actions réussissent refait donc la preuve au moins une
//     fois par jour, et une sonde seule ne peut jamais lui dire « pas connecté » ; au-delà, un vendeur qui n'agit plus
//     retrouve le verdict de la sonde au plus 24 h après sa dernière action réussie.
//   · Première synchro : une plateforme est « vue » si la sonde dit `true` OU si une action y a réussi depuis moins de
//     24 h (jamais contre une page de connexion vue après l'action).
//   · Compte SANS plateforme choisie (platform_settings.plateformes_vendeur absent ou vide) : les plateformes qu'il
//     UTILISE comptent comme choisies — relevé fait, annonce publiée ou vendue en base, vente lue, action réussie.
//     platform_settings n'est jamais écrit : c'est une lecture.
// Une vérité serveur qui applique déjà la règle (migration 20261113213000, clé `preuves_action: true`) n'est jamais
// recomplétée : ce module ne fait alors rien.
// Verrou : scripts/action-reussie-session-vue-selftest.mjs (cas réels ed4531e2, ff1f879f, 1f95f334, 7d64bf87, 4dcf42bd).

export const PLATEFORMES_PREUVE = Object.freeze(["vinted", "leboncoin", "ebay", "beebs", "depop"]);
/** N : dans les 24 h qui suivent une action réussie, aucune sonde ne dit « pas connecté ». */
export const GARDE_ACTION_MS = 24 * 3600_000;
/** Comme plateformes_verite (27/09) : une preuve de plus de 7 jours dit « à vérifier ». */
export const PREUVE_PERIMEE_MS = 7 * 86_400_000;
/** Les preuves lues : 30 jours (au-delà, la plateforme retombe sur la vérité d'avant). */
export const FENETRE_PREUVES_MS = 30 * 86_400_000;
/** La page de connexion vue PENDANT une tâche (noterSessionDeconnectee) : une action ratée, pas une sonde. */
export const HTTP_PAGE_CONNEXION = "login_redirect_observee";
export const MOTIF_DE_SOURCE = Object.freeze({ vente: "vente_lue", depot: "depot_reussi", retrait: "retrait_fait", releve: "releve_reussi" });

const ms = (x) => {
  if (typeof x === "number") return Number.isFinite(x) ? x : NaN;
  const t = Date.parse(String(x ?? ""));
  return Number.isFinite(t) ? t : NaN;
};
const pfValide = (p) => {
  const s = String(p ?? "").toLowerCase();
  return PLATEFORMES_PREUVE.includes(s) ? s : null;
};

/** Une ligne usage_logs `releve_ventes` réussie → { pf, le, source: 'vente' } ; sinon null. */
export function venteLue(row) {
  if (!row || (row.feature != null && row.feature !== "releve_ventes")) return null;
  const m = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const pf = pfValide(m.plateforme);
  if (!pf) return null;
  const motif = m.motif == null ? "" : String(m.motif).trim();
  if (motif !== "" && !(Number(m.lues) > 0)) return null;
  const le = ms(row.created_at);
  return Number.isFinite(le) ? { pf, le, source: "vente" } : null;
}

/** Une tâche de dépôt réussie (publiée ou vendue depuis, jamais un import de relevé) → { pf, le, source: 'depot' }. */
export function depotReussi(job) {
  if (!job || !["publish", "republish"].includes(String(job.action ?? ""))) return null;
  if (!["published", "sold"].includes(String(job.status ?? ""))) return null;
  if (job.handler_build === "releve-annonces") return null;
  const pf = pfValide(job.platform);
  const le = ms(job.published_at);
  return pf && Number.isFinite(le) ? { pf, le, source: "depot" } : null;
}

/** Un retrait FAIT par FillSell (pas « annonce déjà hors ligne ») → { pf, le, source: 'retrait' }. */
export function retraitFait(job) {
  if (!job || String(job.action ?? "") !== "delete" || String(job.status ?? "") !== "deleted") return null;
  const f = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (f.retrait_par !== "fillsell") return null;
  const pf = pfValide(job.platform);
  const t = ms(f.processing_since);
  const le = Number.isFinite(t) ? t : ms(job.created_at);
  return pf && Number.isFinite(le) ? { pf, le, source: "retrait" } : null;
}

/** Un relevé fait (dressing = Vinted, « annonces » = sa plateforme) → { pf, le, source: 'releve' }. */
export function releveFait(run) {
  if (!run) return null;
  const st = String(run.status ?? "");
  if (!(st === "done" || (st === "incomplete" && Number(run.items_vus) > 0))) return null;
  const kind = String(run.kind ?? "");
  const pf = kind === "dressing" ? "vinted" : kind === "annonces" ? pfValide(run.platform) : null;
  const le = ms(run.finished_at ?? run.started_at);
  return pf && Number.isFinite(le) ? { pf, le, source: "releve" } : null;
}

/**
 * La dernière action réussie de chaque plateforme, dans la fenêtre.
 * @returns {Record<string, { le: number, source: 'vente'|'depot'|'retrait'|'releve' }>}
 */
export function preuvesActionReussie({ ventes = [], jobs = [], runs = [], maintenant = Date.now(), fenetreMs = FENETRE_PREUVES_MS } = {}) {
  const out = {};
  const garder = (p) => {
    // Hors fenêtre, ou postérieure à « maintenant » (une minute de jeu entre horloges) : rien.
    if (!p || maintenant - p.le > fenetreMs || p.le - maintenant > 60_000) return;
    if (!out[p.pf] || p.le > out[p.pf].le) out[p.pf] = { le: p.le, source: p.source };
  };
  for (const r of Array.isArray(ventes) ? ventes : []) garder(venteLue(r));
  for (const j of Array.isArray(jobs) ? jobs : []) garder(depotReussi(j) ?? retraitFait(j));
  for (const r of Array.isArray(runs) ? runs : []) garder(releveFait(r));
  return out;
}

/** Fusionne des preuves (la plus récente gagne). */
export function fusionnerPreuves(...listes) {
  const out = {};
  for (const l of listes) {
    for (const [pf, p] of Object.entries(l && typeof l === "object" ? l : {})) {
      if (p && Number.isFinite(p.le) && (!out[pf] || p.le > out[pf].le)) out[pf] = { le: p.le, source: p.source };
    }
  }
  return out;
}

/** La sonde a-t-elle vu la PAGE de connexion pendant une tâche (une action ratée), et quand ? */
function pageConnexionVue(sessions, pf) {
  const s = sessions && typeof sessions === "object" ? sessions : {};
  if (s[pf] !== false || s.http?.[pf] !== HTTP_PAGE_CONNEXION) return NaN;
  return ms(s.checked_at_par_plateforme?.[pf] ?? s.checked_at);
}

/**
 * Première synchro, sonde muette : la plateforme est-elle VUE par une action réussie de moins de 24 h ?
 * Jamais contre une page de connexion vue APRÈS cette action.
 */
export function sessionVueParAction(preuve, { pf = null, sessions = null, maintenant = Date.now(), gardeMs = GARDE_ACTION_MS } = {}) {
  if (!preuve || !Number.isFinite(preuve.le)) return false;
  if (maintenant - preuve.le >= gardeMs) return false;
  if (pf) {
    const page = pageConnexionVue(sessions, pf);
    if (Number.isFinite(page) && page > preuve.le) return false;
  }
  return true;
}

/**
 * L'état d'UNE plateforme de la vérité serveur, complété par sa dernière action réussie (pur). Rend l'entrée telle quelle
 * quand la preuve n'y change rien.
 */
export function etatAvecPreuve(v, preuveLue, maintenant = Date.now()) {
  if (!v || typeof v !== "object") return v;
  // Les succès que la vérité porte déjà (dernier relevé fait, dépôt) comptent aussi : la garde de 24 h vaut pour eux.
  let preuve = preuveLue && Number.isFinite(preuveLue.le) ? preuveLue : null;
  for (const f of Array.isArray(v.faits) ? v.faits : []) {
    const at = ms(f?.at);
    if (f?.etat === "connectee" && (f.src === "releve" || f.src === "depot") && Number.isFinite(at) && at - maintenant <= 60_000 && (!preuve || at > preuve.le)) {
      preuve = { le: at, source: f.src };
    }
  }
  if (!preuve) return v;
  const etat = String(v.etat ?? "inconnue");
  // Écartée, eBay relié par l'API, autorisation (Depop / Opla) : ce n'est pas une question de session.
  if (etat === "ecartee" || v.source === "api" || etat === "a_autoriser") return v;
  const depuis = ms(v.depuis);
  if ((etat === "connectee" || etat === "a_verifier") && Number.isFinite(depuis) && depuis >= preuve.le) return v;
  if (etat === "a_connecter" && Number.isFinite(depuis) && depuis > preuve.le) {
    // Un fait « à connecter » PLUS RÉCENT que l'action : une action ratée (relevé sur un mur, page de connexion vue
    // pendant une tâche) garde son verdict ; une sonde seule ne le garde qu'au-delà de la garde de 24 h.
    const actionRatee = v.source === "releve" || v.source === "depot" || v.http === HTTP_PAGE_CONNEXION || v.motif === "page_connexion_vue";
    if (actionRatee || maintenant - preuve.le >= GARDE_ACTION_MS) return v;
  }
  const perimee = maintenant - preuve.le >= PREUVE_PERIMEE_MS;
  const { mur: _mur, action_secondaire: _a2, ...reste } = v;
  return {
    ...reste,
    etat: perimee ? "a_verifier" : "connectee",
    action: null,
    // releve / depot / vente / retrait : le popup et les Réglages nomment déjà « relevé » et « dépôt » ; les deux autres
    // n'ont pas de sous-titre (rien d'inventé).
    source: preuve.source,
    depuis: new Date(preuve.le).toISOString(),
    motif: perimee ? "preuve_perimee" : (MOTIF_DE_SOURCE[preuve.source] ?? "action_reussie"),
    preuve_action: { source: preuve.source, le: new Date(preuve.le).toISOString() },
  };
}

/** Le compte n'a choisi aucune plateforme (étape passée, compte ancien) : aucune n'est `declaree` dans la vérité. */
export function choixVide(verite) {
  const p = verite?.plateformes;
  if (!p || typeof p !== "object") return false;
  return !Object.values(p).some((x) => x && x.declaree === true);
}

/**
 * Les plateformes qu'un compte UTILISE : relevé fait (fait de la vérité ou relevé lu), annonce publiée / vendue en base,
 * action réussie (preuves). Pur.
 */
export function plateformesUtilisees({ verite = null, preuves = null, annonces = [], runs = [] } = {}) {
  const out = new Set(Object.keys(preuves && typeof preuves === "object" ? preuves : {}).filter((p) => PLATEFORMES_PREUVE.includes(p)));
  const p = verite?.plateformes ?? {};
  for (const pf of PLATEFORMES_PREUVE) {
    const faits = Array.isArray(p[pf]?.faits) ? p[pf].faits : [];
    if (faits.some((f) => f && f.etat === "connectee" && (f.src === "releve" || f.src === "depot"))) out.add(pf);
  }
  for (const a of Array.isArray(annonces) ? annonces : []) {
    const pf = pfValide(a?.platform);
    if (pf && ["published", "sold"].includes(String(a?.status ?? ""))) out.add(pf);
  }
  for (const r of Array.isArray(runs) ? runs : []) {
    const f = releveFait(r);
    if (f) out.add(f.pf);
  }
  return PLATEFORMES_PREUVE.filter((pf) => out.has(pf));
}

/** La vérité doit-elle être complétée (serveur d'avant la migration, et une plateforme que la règle peut changer) ? */
export function veriteACompleter(verite) {
  if (!verite || verite.ok !== true || !verite.plateformes || verite.preuves_action === true) return false;
  if (choixVide(verite)) return true;
  return PLATEFORMES_PREUVE.some((pf) => {
    const v = verite.plateformes[pf];
    return v && v.declaree === true && ["inconnue", "a_connecter", "a_verifier"].includes(String(v.etat ?? ""));
  });
}

/** Les plateformes dont la preuve peut changer l'état (déclarées, ou toutes quand aucune n'est choisie). */
export function plateformesACompleter(verite) {
  if (!verite?.plateformes) return [];
  const vide = choixVide(verite);
  return PLATEFORMES_PREUVE.filter((pf) => {
    const v = verite.plateformes[pf];
    return v && (vide || v.declaree === true) && ["inconnue", "a_connecter", "a_verifier"].includes(String(v.etat ?? ""));
  });
}

/**
 * La vérité serveur complétée par la règle (pur). Une vérité qui l'applique déjà (`preuves_action: true`) est rendue
 * telle quelle.
 * @param {object} verite       réponse de plateformes_verite
 * @param {object} o
 * @param {object} o.preuves    preuvesActionReussie(...)
 * @param {string[]|null} o.utilisees  plateformesUtilisees(...) — lu seulement quand aucune plateforme n'est choisie
 */
export function completerVerite(verite, { preuves = {}, utilisees = null, maintenant = Date.now() } = {}) {
  if (!verite || verite.ok !== true || !verite.plateformes || verite.preuves_action === true) return verite;
  const vide = choixVide(verite);
  const uses = new Set(Array.isArray(utilisees) ? utilisees : []);
  const out = {};
  for (const [pf, v] of Object.entries(verite.plateformes)) {
    let w = etatAvecPreuve(v, preuves?.[pf] ?? null, maintenant);
    if (vide && uses.has(pf) && w && w.etat !== "ecartee") w = { ...w, declaree: true, choisie_par: "utilisation" };
    out[pf] = w;
  }
  return { ...verite, plateformes: out, preuves_action: "lecteur" };
}

const iso = (t) => new Date(t).toISOString();

/**
 * Lit les preuves d'un compte (client Supabase de la personne — RLS — ou client service avec `userId`). Bornée : une
 * lecture des ventes (30 jours, 300 lignes au plus) et, par plateforme demandée, un dépôt et un retrait (1 ligne chacun,
 * index user_id) ; pour chaque plateforme de `utilisationDe` pas encore prouvée, une annonce publiée/vendue puis un relevé
 * fait (1 ligne chacun) — seulement pour un compte sans plateforme choisie.
 * Une lecture qui échoue ne prouve rien (jamais une erreur remontée).
 * @param {any} client
 * @param {{ userId?: string|null, plateformes?: readonly string[], maintenant?: number, fenetreMs?: number, utilisationDe?: string[] }} [o]
 * @returns {Promise<{ preuves: Record<string, { le: number, source: string }>, annonces: any[], runs: any[], lu: boolean }>}
 */
export async function lirePreuvesAction(client, { userId, plateformes = PLATEFORMES_PREUVE, maintenant = Date.now(), fenetreMs = FENETRE_PREUVES_MS, utilisationDe = [] } = {}) {
  const res = { preuves: {}, annonces: [], runs: [], lu: false };
  if (!client || !userId) return res;
  const pfs = (Array.isArray(plateformes) ? plateformes : []).map(pfValide).filter(Boolean);
  const usage = (Array.isArray(utilisationDe) ? utilisationDe : []).map(pfValide).filter(Boolean);
  if (!pfs.length && !usage.length) return res;
  const depuis = iso(maintenant - fenetreMs);
  const ventes = [];
  const jobs = [];
  const taches = [];
  taches.push((async () => {
    const { data, error } = await client.from("usage_logs")
      .select("created_at, plateforme:metadata->>plateforme, motif:metadata->>motif, lues:metadata->>lues")
      .eq("user_id", userId).eq("feature", "releve_ventes").gte("created_at", depuis)
      .order("created_at", { ascending: false }).limit(300);
    if (error || !Array.isArray(data)) return;
    for (const r of data) ventes.push({ created_at: r.created_at, metadata: { plateforme: r.plateforme, motif: r.motif, lues: r.lues } });
  })());
  for (const pf of pfs) {
    taches.push((async () => {
      const { data, error } = await client.from("cross_post_jobs")
        .select("platform, action, status, published_at, handler_build")
        .eq("user_id", userId).eq("platform", pf).in("status", ["published", "sold"]).in("action", ["publish", "republish"])
        .or("handler_build.is.null,handler_build.neq.releve-annonces").gte("published_at", depuis)
        .order("published_at", { ascending: false }).limit(1);
      if (!error && Array.isArray(data)) jobs.push(...data);
    })());
    taches.push((async () => {
      const { data, error } = await client.from("cross_post_jobs")
        .select("platform, action, status, created_at, retrait_par:platform_fields->>retrait_par, processing_since:platform_fields->>processing_since")
        .eq("user_id", userId).eq("platform", pf).eq("action", "delete").eq("status", "deleted")
        .eq("platform_fields->>retrait_par", "fillsell").gte("created_at", depuis)
        .order("created_at", { ascending: false }).limit(1);
      if (!error && Array.isArray(data)) {
        for (const r of data) jobs.push({ platform: r.platform, action: r.action, status: r.status, created_at: r.created_at, platform_fields: { retrait_par: r.retrait_par, processing_since: r.processing_since } });
      }
    })());
  }
  try { await Promise.all(taches.map((t) => t.catch(() => {}))); } catch { /* rien de prouvé */ }
  res.preuves = preuvesActionReussie({ ventes, jobs, maintenant, fenetreMs });
  res.lu = true;
  if (usage.length) {
    const deja = new Set(Object.keys(res.preuves));
    const reste = usage.filter((pf) => !deja.has(pf));
    await Promise.all(reste.map(async (pf) => {
      try {
        const { data: a } = await client.from("cross_post_jobs").select("platform, status").eq("user_id", userId).eq("platform", pf)
          .in("status", ["published", "sold"]).limit(1);
        if (Array.isArray(a) && a.length) { res.annonces.push(...a); return; }
        const q = client.from("vinted_sync_runs").select("kind, platform, status, items_vus, finished_at, started_at").eq("user_id", userId).eq("status", "done");
        const { data: r } = pf === "vinted" ? await q.eq("kind", "dressing").limit(1) : await q.eq("kind", "annonces").eq("platform", pf).limit(1);
        if (Array.isArray(r)) res.runs.push(...r);
      } catch { /* rien de prouvé */ }
    }));
  }
  return res;
}

/**
 * La vérité serveur complétée, lue en une fois (app : lireVeritePlateformes ; get-pending-jobs : le contexte du popup).
 * Rien à compléter (serveur à jour, tout connecté) → la vérité telle quelle, AUCUNE lecture de plus.
 * @param {any} client
 * @param {any} verite
 * @param {{ userId?: string|null, maintenant?: number }} [o]
 * @returns {Promise<any>}
 */
export async function completerVeriteLue(client, verite, { userId, maintenant = Date.now() } = {}) {
  if (!veriteACompleter(verite) || !userId) return verite;
  const vide = choixVide(verite);
  // Seules les plateformes que la preuve peut changer sont lues (une plateforme connectée n'en a pas besoin).
  const pfs = plateformesACompleter(verite);
  // Sans choix : l'UTILISATION de chaque plateforme (ni écartée, pas déjà connue par un fait de la vérité) est lue aussi.
  const connues = new Set(plateformesUtilisees({ verite }));
  const usage = vide ? PLATEFORMES_PREUVE.filter((pf) => verite.plateformes[pf] && verite.plateformes[pf].etat !== 'ecartee' && !connues.has(pf)) : [];
  const lu = pfs.length || usage.length
    ? await lirePreuvesAction(client, { userId, plateformes: pfs, maintenant, utilisationDe: usage })
    : { preuves: {}, annonces: [], runs: [], lu: true };
  if (!lu.lu) return verite;
  const utilisees = vide ? plateformesUtilisees({ verite, preuves: lu.preuves, annonces: lu.annonces, runs: lu.runs }) : null;
  return completerVerite(verite, { preuves: lu.preuves, utilisees, maintenant });
}
