// ═══════════════════════════════════════════════════════════════════════════
// LA RELECTURE QUI REMET UNE ANNONCE EN LIGNE N'ATTEND JAMAIS DES HEURES (26/10)
// ═══════════════════════════════════════════════════════════════════════════
// Johan Désiré (Pro), 26/10 : « Jean Lee Carol Western » retirée de Leboncoin à
// 15:49, essai de recréation coupé à 16:33 sur /deposer-une-annonce/options
// (« message channel closed », 0.6.144). La garde anti-doublon
// (_shared/recreation-deja-partie.js) pose à 17:08 un relevé
// « serveur:verif_redepot » et retient le redépôt jusqu'à lui. Servi à 16:24 (UTC),
// 16:53, 17:10 : JAMAIS pris. Prouvé dans les journaux : l'ordinateur dort et
// ne se réveille qu'une minute toutes les 16 à 29 min (un minuteur de 45 s de
// l'extension n'a pas sonné pendant 17 à 28 min), et l'extension ne lançait un
// relevé servi qu'à la TOUTE FIN de son cycle (tâches, lectures, messagerie,
// veilleur), derrière les polls empilés par l'alarme. L'annonce serait restée
// hors ligne 6 h (RELEVE_ATTENTE_MAX_H) avant qu'on le dise à la personne.
//
// RÈGLE (Nico) — jamais de second dépôt sans relecture prouvée, et jamais des
// heures hors ligne derrière une relecture qui ne part pas :
//   1. Le relevé de vérification est servi DEVANT (`devant: true`) : l'extension
//      ≥ 0.6.148 le fait en tête de cycle, avant toute autre tâche.
//   2. Servi à un poste qui POLLE (au moins RELEVE_NON_PRIS_SERVICES passages)
//      pendant RELEVE_NON_PRIS_MIN minutes sans être pris : il est RELANCÉ une
//      fois (l'ancien clos « non pris », un neuf posé — frais, il repasse devant).
//   3. La relance elle-même non prise dans les mêmes bornes : on le DIT à la
//      personne (needs_user, avec le lien) — jamais de redépôt à l'aveugle.
// Un poste absent (aucun passage) ne compte pas : rien n'avance sans lui, la
// borne de 6 h reste le dernier filet.
//
// Pur (aucune I/O, Deno + Node) : get-pending-jobs lit, écrit et sert.

export const RELEVE_VERIF_DECLENCHEUR = 'serveur:verif_redepot';
export const RELEVE_NON_PRIS_MIN = 20;
export const RELEVE_NON_PRIS_SERVICES = 3;
export const RELEVES_VERIF_RELANCES_MAX = 1;

const ms = (v) => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : null; };

/** Un relevé de vérification passe devant toute autre tâche du poste. */
export function releveServiDevant(declencheur) {
  return String(declencheur ?? '') === RELEVE_VERIF_DECLENCHEUR;
}

/**
 * Le suivi d'un relevé de vérification servi (platform_fields.releve_verif_suivi
 * du job retenu) et la décision de ce passage.
 *   · run      : le relevé en file pour la plateforme ({ id, status, queued_at }) ou null ;
 *   · servi    : ce passage le sert au poste (sync_commands_annonces) ;
 *   · suivi    : le suivi précédent (ou null) ;
 *   · maintenant : ms.
 * Rend { action: 'attendre' | 'relancer' | 'personne', suivi } — `suivi` est
 * l'objet à écrire (identique à l'entrée quand rien n'a changé : pas de réécriture).
 */
export function decisionReleveVerif({ run, servi, suivi, maintenant = Date.now() }) {
  const prec = suivi && typeof suivi === 'object' ? suivi : null;
  const relances = Number(prec?.relances) || 0;
  if (!run || run.status !== 'queued') return { action: 'attendre', suivi: prec };
  const runId = String(run.id ?? '');
  // Un autre relevé que celui suivi : le compte repart de zéro (relances gardées).
  const base = prec && String(prec.run ?? '') === runId
    ? prec
    : { run: runId, premier_service: null, services: 0, relances };
  if (!servi) return { action: 'attendre', suivi: base === prec ? prec : base };
  const premier = ms(base.premier_service) ?? maintenant;
  const services = (Number(base.services) || 0) + 1;
  const neuf = { ...base, premier_service: new Date(premier).toISOString(), services, dernier_service: new Date(maintenant).toISOString() };
  const nonPris = services >= RELEVE_NON_PRIS_SERVICES && maintenant - premier >= RELEVE_NON_PRIS_MIN * 60_000;
  if (!nonPris) return { action: 'attendre', suivi: neuf };
  return { action: relances < RELEVES_VERIF_RELANCES_MAX ? 'relancer' : 'personne', suivi: neuf };
}

/** Le motif écrit sur un relevé servi jamais pris (clos 'expired'). */
export function motifReleveNonPris(suivi, suite) {
  const n = Number(suivi?.services) || 0;
  const depuis = ms(suivi?.premier_service);
  const min = depuis == null ? '?' : Math.round((Date.now() - depuis) / 60_000);
  return `[non pris] relevé de vérification servi ${n} fois en ${min} min à un poste qui polle, jamais pris — ${suite}`;
}

/** Le message à la personne quand la relecture n'a pas pu partir (needs_user). */
export function messageReleveNonPris(nomPf, titre) {
  const t = String(titre ?? '').split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, 80);
  return `On n'a pas pu relire tes annonces ${nomPf} depuis ton ordinateur (il se met en veille, ou Chrome est trop occupé) : ` +
    `${t ? `« ${t} » ` : 'ton annonce '}a été retirée, et un essai l'a peut-être déjà remise en ligne. Pour ne jamais la mettre ` +
    `en double, on ne la redépose pas à l'aveugle : regarde tes annonces ${nomPf} — si elle y est, il n'y a rien à faire ; ` +
    `sinon relance la republication d'un clic, ordinateur allumé.`;
}
