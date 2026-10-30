// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT DE L'EXÉCUTANT CLOUD ET DE CHAQUE CONNEXION — les mots de l'écran (30/10, lot D)
// ═══════════════════════════════════════════════════════════════════════════
// Demande de Nico : « état de chaque connexion (connecté, à reconnecter) ; état de l'exécutant (en marche,
// dernière action) ». Lu par cloud_executant_moi() (migration 20261030130000) et cloud_coffre_etat_moi().
// Pur (testé par scripts/cloud-executant-selftest.mjs). Tutoiement, heure de Paris, aucune durée promise.

const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop', ebay: 'eBay' };
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
