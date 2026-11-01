// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT DE L'EXÉCUTANT CLOUD ET DE CHAQUE CONNEXION — les mots de l'écran (30/10, lot D)
// ═══════════════════════════════════════════════════════════════════════════
// Demande de Nico : « état de chaque connexion (connecté, à reconnecter) ; état de l'exécutant (en marche,
// dernière action) ». Lu par cloud_executant_moi() (migration 20261030130000) et cloud_coffre_etat_moi().
// Pur (testé par scripts/cloud-executant-selftest.mjs). Tutoiement, heure de Paris, aucune durée promise.

const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop', ebay: 'eBay' };
// (01/11) Les plateformes de l'écran « Me connecter », dans son ordre (même liste que config/cloudOffer.js, qui la passe).
const PLATEFORMES_ECRAN = ['vinted', 'leboncoin', 'beebs', 'depop'].map((id) => ({ id, nom: NOMS[id] }));
const ACTIONS = {
  fr: { publish: 'publication', republish: 'republication', delete: 'retrait', update: 'modification' },
  en: { publish: 'listing', republish: 'repost', delete: 'removal', update: 'edit' },
};
const STATUTS = {
  fr: { published: 'faite', deleted: 'faite', done: 'faite', failed: 'pas aboutie', processing: 'en cours', pending: 'en file', needs_user: 'attend ta réponse' },
  en: { published: 'done', deleted: 'done', done: 'done', failed: 'did not go through', processing: 'in progress', pending: 'queued', needs_user: 'waiting for you' },
};

/** « à 10:42 », « hier à 18:05 », « le 28 oct. à 09:10 » — heure de Paris (pur). */
export function quandParis(iso, maintenant = Date.now(), lang = 'fr') {
  const t = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(t)) return null;
  const en = lang === 'en';
  const jour = (x) => new Date(x).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  const heure = new Date(t).toLocaleTimeString(en ? 'en-GB' : 'fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  if (jour(t) === jour(maintenant)) return en ? `at ${heure}` : `à ${heure}`;
  if (jour(t) === jour(maintenant - 86400000)) return en ? `yesterday at ${heure}` : `hier à ${heure}`;
  const date = new Date(t).toLocaleDateString(en ? 'en-GB' : 'fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' });
  return en ? `on ${date} at ${heure}` : `le ${date} à ${heure}`;
}

/**
 * L'état d'une connexion de plateforme (pur) : 'connecte' | 'a_reconnecter' | 'a_connecter'.
 * Une ligne au coffre qui ne se dit plus connectée = une connexion qui a été faite puis a lâché.
 */
export function etatConnexion(ligne) {
  if (ligne?.connecte === true) return 'connecte';
  if (ligne && typeof ligne === 'object') return 'a_reconnecter';
  return 'a_connecter';
}

/**
 * (01/11) Les plateformes à reconnecter (pure) : seulement quand le Cloud exécute les tâches du compte
 * (profiles.cloud_voie), dans l'ordre de l'écran « Me connecter ». Lu par BandeauCloudReconnexion.jsx.
 */
export function plateformesAReconnecter({ cloudVoie, etats, fermees = [], plateformes = PLATEFORMES_ECRAN }) {
  if (cloudVoie !== true || !etats || typeof etats !== 'object') return [];
  return plateformes.filter((p) => !fermees.includes(p.id) && etatConnexion(etats[p.id]) === 'a_reconnecter');
}

// (01/11, 23:10, demande de Nico) L'exécutant arrêté SANS QU'ON LE SACHE (22:57 → 23:05 : plus rien, l'app disait
// « En pause : il repart dès qu'une tâche attend ») se DIT. Le serveur note un signe de vie toutes les 10 min
// (postes.js) : muet depuis plus de MUET_MS = arrêté ; éteint depuis plus de ETEINT_MS (un redémarrage ou un changement
// d'IP dure moins) = arrêté.
export const MUET_MS = 25 * 60_000;
export const ETEINT_MS = 5 * 60_000;
/**
 * L'exécutant Cloud est-il arrêté ? (pur) — seulement quand le Cloud exécute les tâches du compte (cloud_voie).
 * Rend null (il tourne, ou rien à dire) ou { depuis: iso|null, cause: 'arret_essai'|'muet'|'eteint'|'jamais' }.
 */
export function executantArrete({ cloudVoie, executant, maintenant = Date.now() }) {
  if (cloudVoie !== true || !executant || typeof executant !== 'object') return null;
  const po = executant.poste ?? null;
  if (!po?.etat) return { depuis: null, cause: 'jamais' };
  const t = (iso) => { const x = Date.parse(String(iso ?? '')); return Number.isFinite(x) ? x : null; };
  if (po.etat === 'actif' || po.etat === 'demarrage') {
    const vu = t(po.derniere_activite) ?? t(po.maj_le);
    return vu != null && maintenant - vu > MUET_MS ? { depuis: new Date(vu).toISOString(), cause: 'muet' } : null;
  }
  const depuis = t(po.arrete_le) ?? t(po.maj_le);
  if (/^arret_essai:/.test(String(po.derniere_erreur ?? '')) && po.etat !== 'actif') return { depuis: depuis != null ? new Date(depuis).toISOString() : null, cause: 'arret_essai' };
  if (depuis != null && maintenant - depuis <= ETEINT_MS) return null;
  return { depuis: depuis != null ? new Date(depuis).toISOString() : null, cause: 'eteint' };
}

/** La phrase de l'exécutant (pur) → { etat: 'en_marche'|'en_pause'|'erreur'|'jamais', titre, detail[] }. */
export function phraseExecutant(e, { maintenant = Date.now(), lang = 'fr' } = {}) {
  const en = lang === 'en';
  const po = e?.poste ?? null;
  const detail = [];
  const da = e?.derniere_action ?? null;
  if (da?.action) {
    const quoi = `${ACTIONS[en ? 'en' : 'fr'][da.action] ?? da.action} ${NOMS[da.plateforme] ?? da.plateforme ?? ''}`.trim();
    const statut = STATUTS[en ? 'en' : 'fr'][da.statut] ?? da.statut ?? '';
    const quand = quandParis(da.le, maintenant, lang);
    detail.push(en ? `Last action: ${quoi}${statut ? ` — ${statut}` : ''}${quand ? `, ${quand}` : ''}.`
      : `Dernière action : ${quoi}${statut ? ` — ${statut}` : ''}${quand ? `, ${quand}` : ''}.`);
  }
  const dr = e?.dernier_releve ?? null;
  if (dr?.le) {
    const quand = quandParis(dr.le, maintenant, lang);
    detail.push(en ? `Last check of your listings: ${NOMS[dr.plateforme] ?? dr.plateforme ?? ''} ${quand ?? ''}.`.replace(/\s+\./, '.')
      : `Dernier relevé de tes annonces : ${NOMS[dr.plateforme] ?? dr.plateforme ?? ''} ${quand ?? ''}.`.replace(/\s+\./, '.'));
  }
  if (!po || !po.etat) {
    return { etat: 'jamais', titre: en ? 'Not started yet: it starts as soon as a platform is connected.' : "Pas encore démarré : il démarre dès qu'une plateforme est connectée.", detail };
  }
  if (po.etat === 'actif' || po.etat === 'demarrage') {
    const depuis = quandParis(po.demarre_le, maintenant, lang);
    return { etat: 'en_marche', titre: en ? `Running${depuis ? ` since ${depuis.replace(/^at /, '')}` : ''}.` : `En marche${depuis ? ` depuis ${depuis.replace(/^à /, '')}` : ''}.`, detail };
  }
  if (po.etat === 'erreur') {
    return { etat: 'erreur', titre: en ? 'Stopped on an error: FillSell restarts it on its own.' : "Arrêté sur une erreur : FillSell le relance tout seul.", detail };
  }
  return { etat: 'en_pause', titre: en ? 'Paused: it starts again as soon as a task is waiting.' : "En pause : il repart dès qu'une tâche attend.", detail };
}
