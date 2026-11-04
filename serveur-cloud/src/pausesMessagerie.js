// (04/11 soir, règle de Nico pendant l'essai GPU) LES PAUSES DE LA MESSAGERIE ET DE LA VEILLE DES COMMANDES d'un compte Cloud.
// Un signe anti-robot (403, glissière…) coupe la messagerie d'une plateforme 6 h / 24 h (messagerie_releves.pause_jusqu_au,
// messagerie_releve_bloque) et, dans le navigateur qui l'a vu, la messagerie ET la veille des commandes (« coupee » dans le
// stockage de l'extension : messagerie_beta_etat, veille_commandes_etat). Vu le 04/11 : une pause née sur cloud-1 (403 de
// 17:02) tenait encore sur cloud-2, et le « Résoudre » réussi de 20:16 ne levait ni elle ni la coupure de la veille (18:58).
// LA RÈGLE :
//   · une RÉSOLUTION réussie d'une plateforme (Résoudre, contre-visite passée, connexion vérifiée) lève ses pauses ;
//   · un CHANGEMENT DE MACHINE ou d'IP DÉDIÉE repart sans les pauses de l'ancienne (et sans leur mémoire : bloque_le, qui
//     ferait passer le prochain blocage à 24 h au lieu de 6 h).
// Jamais une plateforme visitée ici : la base, et le stockage de l'extension par le pilotage du navigateur (comme la session
// FillSell, sessionFillsell.js).
import { readFile } from 'node:fs/promises';
import { evaluerDansExtension, idExtensionDepuisCle } from './sessionFillsell.js';

export const PLATEFORMES_PAUSES = Object.freeze(['vinted', 'leboncoin', 'beebs', 'depop']);
// Les clés du stockage de l'extension (chrome-extension/background.js : MESSAGERIE_ETAT_KEY, VEILLE_COMMANDES_ETAT_KEY).
export const CLES_ETAT_EXTENSION = Object.freeze(['messagerie_beta_etat', 'veille_commandes_etat']);

/**
 * La machine ou l'IP a-t-elle changé depuis la dernière ouverture ? (pure : testée) `avant` = cloud_postes.details.ouvert_sur
 * de la dernière ouverture (absent : on ne sait pas → non). L'IP ne compte qu'en sortie DÉDIÉE (en rotation, elle change à
 * chaque session par construction).
 */
export function changementDePoste(avant, maintenant) {
  if (!avant || typeof avant !== 'object' || !avant.serveur || !maintenant?.serveur) return false;
  if (String(avant.serveur) !== String(maintenant.serveur)) return true;
  const dedie = (x) => (x?.mode ?? 'dedie') === 'dedie';
  return dedie(avant) && dedie(maintenant) && avant.ip_id != null && maintenant.ip_id != null && Number(avant.ip_id) !== Number(maintenant.ip_id);
}

/**
 * L'expression évaluée dans l'extension (pure : testée) : retire « coupee » des plateformes visées dans les deux états,
 * rend ce qui a été levé { cle: [plateformes] }. Rien d'autre n'est touché (cadence, mesures, type de compte). (04/11 soir)
 * Une coupure posée À LA MAIN (motif « coupe_par_… », ordre de Nico) ne se lève qu'à la main, jamais par cette règle.
 */
export function expressionLeverCoupures(plateformes) {
  const p = JSON.stringify((plateformes ?? []).filter((x) => PLATEFORMES_PAUSES.includes(x)));
  const cles = JSON.stringify(CLES_ETAT_EXTENSION);
  return `(async () => { const ps = ${p}, cles = ${cles}, levees = {};
    const s = await chrome.storage.local.get(cles);
    for (const k of cles) { const e = s[k]; if (!e || typeof e !== 'object') continue; let n = false;
      for (const pf of ps) if (e[pf] && e[pf].coupee && !String(e[pf].coupee.motif || '').startsWith('coupe_par_')) { levees[k] = [...(levees[k] || []), pf]; delete e[pf].coupee; n = true; }
      if (n) await chrome.storage.local.set({ [k]: e }); }
    return levees; })()`;
}

export function creerPausesMessagerie({ config, base, navigateurs, journal }) {
  let idExtension = null;
  async function extensionId() {
    if (idExtension) return idExtension;
    const man = JSON.parse(await readFile(`${config.dossierExtension}/manifest.json`, 'utf8'));
    idExtension = man.key ? idExtensionDepuisCle(man.key) : null;
    return idExtension;
  }

  /**
   * Lève les pauses d'un compte : `plateformes` (null = toutes), `oublier` = efface aussi leur mémoire (bloque_le). Rend
   * { base: [plateformes dont la pause en base est levée], extension: { cle: [plateformes] } | null }.
   */
  async function lever(user, plateformes = null, { raison, oublier = false } = {}) {
    const ps = (plateformes ?? PLATEFORMES_PAUSES).filter((p) => PLATEFORMES_PAUSES.includes(p));
    if (!user || !ps.length) return { base: [], extension: null };
    const maintenant = new Date().toISOString();
    const patch = oublier ? { pause_jusqu_au: null, bloque_le: null } : { pause_jusqu_au: null };
    let q = base.from('messagerie_releves').update(patch).eq('user_id', user).in('platform', ps);
    q = oublier ? q.or(`pause_jusqu_au.gt.${maintenant},bloque_le.not.is.null`) : q.gt('pause_jusqu_au', maintenant);
    const { data, error } = await q.select('platform');
    if (error) throw new Error(`messagerie_releves : ${error.message}`);
    const enBase = (data ?? []).map((r) => r.platform);
    let extension = null;
    const h = navigateurs.ouvert(user);
    const id = h ? await extensionId().catch(() => null) : null;
    if (h && id) {
      extension = await evaluerDansExtension(h.cdp, id, expressionLeverCoupures(ps))
        .catch((e) => { journal.alerte('pauses_extension_echec', { user, erreur: e.message }); return null; });
    }
    if (enBase.length || (extension && Object.keys(extension).length)) {
      journal.info('pauses_messagerie_levees', { user, raison, base: enBase, extension, oublier });
    }
    return { base: enBase, extension };
  }

  return { lever };
}
