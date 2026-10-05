// LE PLANIFICATEUR — quand allumer, quand éteindre le navigateur de chaque compte.
//
// La décision est PURE (planifierPostes, testée) ; la boucle (creerPlanificateur)
// lit la base, applique, et ne fait rien d'autre.
//
// Les règles (décisions de Nico, 04-05/10) :
//   · un compte n'a un navigateur que s'il est ACTIF (essai ou payé) et titulaire
//     de son IP dédiée (cloud_comptes_a_servir) ; un essai fini pendant sa grâce
//     n'est allumé que pour finir un job en cours ;
//   · le délai entre deux sessions N'EST PAS TRANCHÉ (étude en cours, 05/10) :
//     il se lit dans la base (coin_config cloud_delai_sessions_min) ; absent =
//     navigateur en continu (exécution H24, détection des ventes continue) ;
//     présent = une session au plus tard tous les N minutes, et tout de suite
//     dès qu'un job attend ou qu'une connexion est demandée ;
//   · JAMAIS coupé au milieu d'un job (un job « processing » garde son navigateur) ;
//   · capacité du serveur : au plus navigateursMax navigateurs ; au-delà, les
//     priorités : connexion demandée > job en cours > retrait en attente >
//     autre job en attente > relecture périodique ; l'alerte « serveur » part ;
//   · garde CPU de la base (règle du 04/10) : au-dessus de cpuPause %, aucun
//     démarrage nouveau, sauf une connexion que quelqu'un attend, les yeux sur
//     son écran ; ce qui tourne finit ses jobs.

const PRIORITE = { connexion: 0, en_cours: 1, retrait: 2, job: 3, periodique: 4, continu: 5 };

/**
 * @param {object} e
 *   comptes      : [{ user_id, etat_cloud }] (cloud_comptes_a_servir, déjà filtrés)
 *   ouverts      : Map user → { ouvertLe }
 *   jobs         : Map user → { attente: n, retraits: n, enCours: n }
 *   connexions   : Set des comptes dont l'écran « Me connecter » est ouvert
 *   dernieresFins: Map user → instant (ms) de la dernière fermeture
 *   delaiMin     : null (continu) | minutes entre deux sessions
 *   cpuPct, cpuPause, navigateursMax, sessionMinimaleMin, maintenant
 * @returns {{ ouvrir: Array<{user, motif}>, fermer: Array<{user, raison}>, refuses: Array<{user, raison}> }}
 */
export function planifierPostes(e) {
  const now = e.maintenant ?? Date.now();
  const ouverts = e.ouverts ?? new Map();
  const jobs = e.jobs ?? new Map();
  const connexions = e.connexions ?? new Set();
  const fins = e.dernieresFins ?? new Map();
  const delai = e.delaiMin == null ? null : Math.max(1, Number(e.delaiMin));
  const minimale = Math.max(1, Number(e.sessionMinimaleMin ?? 8)) * 60_000;
  const cpuHaut = Number.isFinite(e.cpuPct) && e.cpuPct > (e.cpuPause ?? 50);
  const max = Math.max(0, Number(e.navigateursMax ?? 0));

  const servis = new Map((e.comptes ?? []).map((c) => [c.user_id, c]));
  const fermer = [];
  const voulus = [];

  // 1. Ce qui tourne alors que le compte n'est plus à servir → fermé (sauf un job en cours).
  for (const [user] of ouverts) {
    const j = jobs.get(user) ?? {};
    if (!servis.has(user) && !(j.enCours > 0)) fermer.push({ user, raison: 'compte_inactif' });
  }

  // 2. Ce que chaque compte servi voudrait.
  for (const [user, c] of servis) {
    const j = jobs.get(user) ?? {};
    const ouvert = ouverts.get(user);
    const grace = c.etat_cloud === 'essai_termine';
    let motif = null;
    if (connexions.has(user) && !grace) motif = 'connexion';
    else if (j.enCours > 0) motif = 'en_cours';
    else if (!grace && j.retraits > 0) motif = 'retrait';
    else if (!grace && j.attente > 0) motif = 'job';
    else if (!grace && delai == null) motif = 'continu';
    else if (!grace && delai != null) {
      const fin = fins.get(user);
      if (ouvert && now - ouvert.ouvertLe < minimale) motif = 'periodique';          // une session va au bout de sa durée minimale
      else if (!ouvert && (fin == null || now - fin >= delai * 60_000)) motif = 'periodique';
    }
    if (motif) voulus.push({ user, motif, ouvert: Boolean(ouvert) });
    else if (ouvert) fermer.push({ user, raison: grace ? 'grace_sans_job' : 'session_finie' });
  }

  // 3. Capacité et garde CPU : les ouverts voulus restent ; les nouveaux, par priorité.
  voulus.sort((a, b) => PRIORITE[a.motif] - PRIORITE[b.motif]);
  const restants = new Set(voulus.filter((v) => v.ouvert).map((v) => v.user));
  let places = max - restants.size;
  const ouvrir = [];
  const refuses = [];
  for (const v of voulus) {
    if (v.ouvert) continue;
    if (cpuHaut && v.motif !== 'connexion') { refuses.push({ user: v.user, raison: 'cpu_base' }); continue; }
    if (places <= 0) { refuses.push({ user: v.user, raison: 'capacite' }); continue; }
    ouvrir.push({ user: v.user, motif: v.motif });
    places--;
  }
  // Une connexion demandée sans place : on libère la session périodique / continue la moins prioritaire.
  for (const r of refuses.filter((x) => x.raison === 'capacite')) {
    const v = voulus.find((x) => x.user === r.user);
    if (v?.motif !== 'connexion') continue;
    const victime = [...voulus].reverse().find((x) => x.ouvert && (x.motif === 'continu' || x.motif === 'periodique')
      && !fermer.some((f) => f.user === x.user));
    if (!victime) continue;
    fermer.push({ user: victime.user, raison: 'place_pour_une_connexion' });
    ouvrir.push({ user: r.user, motif: 'connexion' });
    r.raison = null;
  }
  return { ouvrir, fermer, refuses: refuses.filter((r) => r.raison) };
}

/** Les jobs du Cloud, par compte, en UNE lecture bornée (index user_id, status). */
export function resumerJobs(lignes, maintenant = Date.now()) {
  const out = new Map();
  for (const l of lignes ?? []) {
    const e = out.get(l.user_id) ?? { attente: 0, retraits: 0, enCours: 0 };
    if (l.status === 'processing') e.enCours++;
    else if (l.status === 'pending') {
      const naa = Date.parse(l.platform_fields?.next_action_after ?? '');
      if (Number.isFinite(naa) && naa > maintenant + 2 * 60_000) { out.set(l.user_id, e); continue; }
      e.attente++;
      if (l.action === 'delete') e.retraits++;
    }
    out.set(l.user_id, e);
  }
  return out;
}
