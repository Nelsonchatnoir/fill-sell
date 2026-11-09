// ═══════════════════════════════════════════════════════════════════════════
// UN POSTE CONNECTÉ À UNE PLATEFORME, ET LE RELEVÉ QU'UN POSTE A PRIS (09/11/2026 soir — décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas : Guillaume JEHLY (Business) a 3 postes vivants — Chrome et Brave sur un PC, Brave sur un autre. Leboncoin est
// connecté dans Chrome seulement. Les TÂCHES évitaient déjà un poste qui a vu le mur (get-pending-jobs, murDuPosteTient) ;
// les RELEVÉS partaient au premier poste venu : un Brave sans session Leboncoin concluait « page de connexion », et l'app
// disait « Me reconnecter » pendant que Chrome publiait (17:42, 18:11). Décisions de Nico (09/11 soir) :
//   · un relevé ne part qu'à un poste où la plateforme est connectée, comme les tâches (get-pending-jobs) ;
//   · un relevé tombé sur la page de connexion d'un poste n'affiche plus « Me reconnecter » si un autre poste du même
//     compte est connecté (src/utils/syncPlateformes.js, lireDerniersRunsReleve).
// Le serveur note sur le poste le relevé qu'il lui sert (`releve_<pf>` = { run, le }, profiles.extension_postes, RPC
// noter_poste_extension) ; un relevé de ce poste fini sur la page de connexion lui pose son mur (`mur_<pf>`), comme une
// tâche. Pur : Deno (get-pending-jobs), Vite (app), Node (scripts/poste-connecte-selftest.mjs).

export const POSTE_VIVANT_MS = 15 * 60_000;          // même fenêtre que le routage des tâches (get-pending-jobs)
export const PREUVE_OK_MS = 7 * 86_400_000;           // même fenêtre que MUR_AUTRE_POSTE_OK_MS (_shared/poste-extension.ts)
export const PLATEFORMES_RELEVE_POSTE = Object.freeze(['leboncoin', 'beebs', 'ebay', 'depop']);
// Le texte d'un relevé qui a buté sur la page de connexion (même motif que src/annonces/etatReleve.js MUR_PAGE_CONNEXION).
export const RELEVE_PAGE_CONNEXION = /page de connexion/i;

const ms = (v) => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : NaN; };
const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

/**
 * Le poste est-il VIVANT (vu il y a moins de 15 min) et CONNECTÉ à `pf` ? Connecté = sa dernière preuve sur `pf` est
 * positive : une réussite de ce poste (ok_<pf>, moins de 7 jours) ou sa sonde qui dit `pf` connectée (moins de 15 min),
 * PLUS RÉCENTE que son dernier mur (mur_<pf>) et que sa dernière sonde « déconnectée ». Rien de prouvé → false.
 */
export function posteConnecte(poste, pf, maintenant = Date.now()) {
  const p = objet(poste);
  if (!p || !pf) return false;
  const le = ms(p.le);
  if (!Number.isFinite(le) || maintenant - le > POSTE_VIVANT_MS) return false;
  const s = objet(p.sessions);
  const sondeLe = ms(s?.lu_le);
  const sondeFraiche = Number.isFinite(sondeLe) && maintenant - sondeLe <= POSTE_VIVANT_MS;
  const ok = ms(p[`ok_${pf}`]);
  const preuves = [];
  if (Number.isFinite(ok) && maintenant - ok <= PREUVE_OK_MS) preuves.push(ok);
  if (sondeFraiche && s[pf] === true) preuves.push(sondeLe);
  if (!preuves.length) return false;
  const preuve = Math.max(...preuves);
  const mur = ms(p[`mur_${pf}`]);
  if (Number.isFinite(mur) && mur >= preuve) return false;
  if (sondeFraiche && s[pf] === false && sondeLe >= preuve) return false;
  return true;
}

/** Les postes (sessions) connectés à `pf`, sauf `sauf`. */
export function postesConnectes(postes, pf, { sauf = null, maintenant = Date.now() } = {}) {
  return Object.entries(objet(postes) ?? {})
    .filter(([sid, p]) => sid !== sauf && posteConnecte(p, pf, maintenant))
    .map(([sid]) => sid);
}

/** La session du poste à qui le serveur a servi ce relevé (releve_<pf>.run = run), ou null. */
export function posteDuReleve(postes, pf, runId) {
  if (!runId) return null;
  for (const [sid, p] of Object.entries(objet(postes) ?? {})) {
    const r = objet(objet(p)?.[`releve_${pf}`]);
    if (r && String(r.run ?? '') === String(runId)) return sid;
  }
  return null;
}

/**
 * Un relevé fini sur la page de connexion (statut absente/incomplete/done, texte « page de connexion »). Le serveur et
 * l'app lisent le même motif que l'écran (etatReleve.js).
 */
export function releveSurPageConnexion(run) {
  const r = objet(run);
  if (!r) return false;
  return ['absente', 'incomplete', 'done', 'failed'].includes(String(r.status ?? '')) && RELEVE_PAGE_CONNEXION.test(String(r.erreur ?? ''));
}

/**
 * L'APP : ce relevé raté doit-il se taire ? Oui seulement si on SAIT quel poste l'a pris (releve_<pf>) et qu'un AUTRE
 * poste vivant du compte est connecté à `pf`. Poste inconnu (relevé servi avant cette règle) ou aucun autre poste
 * connecté → non : on dit ce qu'on a lu, comme avant.
 */
export function releveRateParUnAutrePoste(run, pf, postes, maintenant = Date.now()) {
  if (!releveSurPageConnexion(run)) return false;
  const sid = posteDuReleve(postes, pf, objet(run)?.id);
  if (!sid) return false;
  return postesConnectes(postes, pf, { sauf: sid, maintenant }).length > 0;
}

/**
 * LE SERVEUR : les relevés servis à CE poste et finis sur la page de connexion depuis qu'il les a pris → le mur à poser
 * ({ [`mur_${pf}`]: fin }), jamais plus ancien que le mur déjà posé. `runs` : lignes { id, platform, status, erreur,
 * finished_at } lues par get-pending-jobs.
 */
export function mursDesRelevesDuPoste(poste, runs) {
  const p = objet(poste);
  if (!p) return {};
  const patch = {};
  for (const run of Array.isArray(runs) ? runs : []) {
    const pf = String(run?.platform ?? '');
    const pris = objet(p[`releve_${pf}`]);
    if (!pris || String(pris.run ?? '') !== String(run?.id ?? '') || !releveSurPageConnexion(run)) continue;
    const fin = ms(run.finished_at) || ms(pris.le);
    if (!Number.isFinite(fin)) continue;
    const murAvant = ms(p[`mur_${pf}`]);
    if (Number.isFinite(murAvant) && murAvant >= fin) continue;
    patch[`mur_${pf}`] = new Date(fin).toISOString();
  }
  return patch;
}
