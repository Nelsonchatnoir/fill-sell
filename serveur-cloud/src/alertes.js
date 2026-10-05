// Les alertes du Cloud — à support@fillsell.app SEULEMENT (jamais à un
// utilisateur), par la porte d'envoi unique (envoyer_mail_ponctuel, catégorie
// support), journalisées dans cloud_pool_alertes. Même esprit que veille-cpu :
// une alerte, puis un rappel au plus par heure pour le même sujet.
const RAPPEL_MS = 60 * 60_000;

export function creerAlertes({ config, base, journal }) {
  const dernieres = new Map();

  async function signaler(niveau, texte, details = {}) {
    const cle = `${niveau}:${texte.slice(0, 60)}`;
    if (Date.now() - (dernieres.get(cle) ?? 0) < RAPPEL_MS) return { envoye: false, raison: 'rappel_trop_tot' };
    dernieres.set(cle, Date.now());
    const niveauSql = ['vide', 'presque_vide', 'sans_place', 'serveur'].includes(niveau) ? niveau : 'serveur';
    await base.from('cloud_pool_alertes').insert({ nature: 'alerte', niveau: niveauSql, details: { texte, ...details } }).then(() => {}, () => {});
    journal.alerte('alerte_cloud', { niveau, texte });
    if (!config.alertesMail) return { envoye: false, raison: 'mails_coupes' };
    const { data, error } = await base.rpc('envoyer_mail_ponctuel', {
      p_destinataires: [{ email: config.alertesDestinataire, user_id: null, variables: {} }],
      p_sujet: `[FillSell Cloud] ${niveau} — ${texte.slice(0, 80)}`,
      p_html: `<p>${texte.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p><p>Serveur ${config.serveurNom}, ${new Date().toISOString()}.</p>`,
      p_type: 'cloud_alerte',
      p_categorie: 'support',
      p_simulation: false,
    });
    if (error) journal.erreur('alerte_mail_echec', { erreur: error.message });
    return { envoye: !error, reponse: data ?? null };
  }

  return { signaler };
}
