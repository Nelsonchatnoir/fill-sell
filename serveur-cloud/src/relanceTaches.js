// (05/11 soir, lot « Ouverture du Cloud », point 9 — règle de Nico) UNE PLATEFORME ROUVERTE REPART TOUT DE SUITE.
// Après un « Résoudre » réussi, une connexion vérifiée ou une vérification de l'appareil passée SEULE, les tâches de la
// plateforme que l'anti-robot avait espacées repartent sans attendre leur heure : vu le 04/11, la republication Leboncoin
// est restée à l'arrêt de 21:38 (« Résoudre » réussi) à 21:56, et le 05/11 la messagerie Beebs est restée en pause de
// 02:48:48 (vérification passée seule) à 08:48:44.
// LA RÈGLE :
//   · seules les attentes nées de l'anti-robot ou d'une vérification du Cloud sont levées (marques blocage_antirobot,
//     attente_antirobot_compte, attente_verification_cloud) : jamais une attente de cadence, de créneau, de quota ou de
//     session — la cadence de republication est intouchable ;
//   · l'état d'avant est gardé dans relance_apres_verification.avant (lisible, annulable) ; compare-and-set sur
//     « pending » : une tâche prise entre-temps n'est jamais touchée ;
//   · puis l'extension du navigateur est réveillée (passage immédiat de sa file) au lieu d'attendre son alarme de 2 min.
import { evaluerDansExtension } from './sessionFillsell.js';

export const MARQUES_ATTENTE_ANTIROBOT = Object.freeze(['blocage_antirobot', 'attente_antirobot_compte', 'attente_verification_cloud']);
export const RELANCE_MAX = 200;
// Lu dans la copie Cloud de l'extension (scripts/cloud/build-extension-cloud.mjs : __fillsellVerrouCloud.relancer).
export const EXPRESSION_RELANCER = '(globalThis.__fillsellVerrouCloud && typeof globalThis.__fillsellVerrouCloud.relancer === "function") ? globalThis.__fillsellVerrouCloud.relancer() : false';

/**
 * Le patch d'une tâche à relancer (pure : testée), ou null si elle n'attend pas l'anti-robot. `pf` = platform_fields.
 * L'heure d'attente (next_action_after) n'est effacée que si une marque anti-robot l'accompagne.
 */
export function patchRelance(pf, { par, le = new Date().toISOString() } = {}) {
  if (!pf || typeof pf !== 'object') return null;
  const marques = MARQUES_ATTENTE_ANTIROBOT.filter((k) => pf[k] != null);
  if (!marques.length) return null;
  const avant = {};
  for (const k of [...marques, 'next_action_after']) if (pf[k] != null) avant[k] = pf[k];
  const suivant = { ...pf };
  for (const k of [...marques, 'next_action_after']) delete suivant[k];
  suivant.relance_apres_verification = { le, par: String(par ?? 'verification').slice(0, 80), avant };
  return suivant;
}

/** Le texte d'une tâche relancée (pure) : le message de l'anti-robot ou du Cloud s'efface, jamais un autre. */
export function erreurApresRelance(erreur, pf) {
  const message = pf?.attente_verification_cloud?.message;
  if (erreur && message && erreur === message) return null;
  if (erreur && /anti-?robot|v[ée]rification/i.test(String(erreur))) return null;
  return erreur ?? null;
}

export function creerRelanceTaches({ base, navigateurs, journal, idExtension = async () => null, maintenant = () => new Date() }) {
  /**
   * Relance les tâches d'une plateforme (ou de toutes : plateforme = null) du compte, puis réveille son extension.
   * Rend { relancees, reveil } ; ne jette jamais (une relance ratée attend l'alarme de l'extension, comme avant).
   */
  async function relancer(user, plateforme, { par = 'verification' } = {}) {
    let relancees = 0;
    const le = maintenant().toISOString();
    try {
      let q = base.from('cross_post_jobs').select('id, error, platform, platform_fields')
        .eq('user_id', user).eq('status', 'pending').limit(RELANCE_MAX);
      if (plateforme) q = q.eq('platform', plateforme);
      q = q.or(MARQUES_ATTENTE_ANTIROBOT.map((k) => `platform_fields->>${k}.not.is.null`).join(','));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      for (const j of data ?? []) {
        const pf = patchRelance(j.platform_fields, { par, le });
        if (!pf) continue;
        const { data: maj, error: e2 } = await base.from('cross_post_jobs')
          .update({ platform_fields: pf, error: erreurApresRelance(j.error, j.platform_fields) })
          .eq('id', j.id).eq('status', 'pending').select('id');
        if (!e2 && (maj ?? []).length) relancees++;
      }
    } catch (e) {
      journal?.alerte?.('relance_taches_echec', { user, plateforme, erreur: String(e?.message ?? e).slice(0, 160) });
    }
    let reveil = null;
    try {
      const h = navigateurs?.ouvert?.(user);
      const id = h ? await idExtension() : null;
      if (h?.cdp && id) reveil = await evaluerDansExtension(h.cdp, id, EXPRESSION_RELANCER).catch(() => null);
    } catch { reveil = null; }
    journal?.info?.('taches_relancees', { user, plateforme, par, relancees, reveil: reveil === true });
    return { relancees, reveil: reveil === true };
  }
  return { relancer, idExtension };
}
