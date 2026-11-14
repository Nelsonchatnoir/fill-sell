// Les alertes du Cloud — à support@fillsell.app SEULEMENT (jamais à un
// utilisateur), par la porte d'envoi unique (envoyer_mail_ponctuel, catégorie
// support), journalisées dans cloud_pool_alertes. Même esprit que veille-cpu :
// une alerte, puis un rappel au plus par heure pour le même sujet (le JOURNAL).
//
// (14/11/2026, complément 3 point 2 de Nico — « Nico ne reçoit plus un mail que pour un vrai problème ») LE MAIL suit la
// liste fermée de supabase/functions/_shared/alertes-nico.js (copiée dans lib/ au déploiement, comme cloud-pool.js) :
// chaque appel nomme son alerte (`{ alerte, cle }`, 4e argument) ; sans nom = 'orchestrateur.autre' = journal seulement
// (pool à la marge, IP grillée, saines sous la marge, capacité, purge, quarantaine, cloisonnement, redémarrage…).
// Une alerte gardée (client sans IP saine, solde qui ne couvre pas une IP attribuée, plateforme d'un client arrêtée)
// part UNE fois par problème, jusqu'à sa résolution (état dans monitor_state, alertes-nico.js). La ligne de
// cloud_pool_alertes est toujours écrite (details.alerte, details.mail) : rien n'est supprimé.
const RAPPEL_MS = 60 * 60_000;

/** La règle des mails à Nico (une source : supabase/functions/_shared/alertes-nico.js). */
export async function chargerRegleNico() {
  try {
    return await import('../lib/alertes-nico.js');
  } catch {
    return import('../../supabase/functions/_shared/alertes-nico.js');
  }
}

export function creerAlertes({ config, base, journal, regle = null }) {
  const dernieres = new Map();
  let regleP = regle ? Promise.resolve(regle) : null;
  const lireRegle = () => {
    regleP ??= chargerRegleNico().catch((e) => { journal.erreur('alertes_regle_illisible', { erreur: e.message }); return null; });
    return regleP;
  };

  async function signaler(niveau, texte, details = {}, { alerte = 'orchestrateur.autre', cle = null } = {}) {
    const k = `${niveau}:${texte.slice(0, 60)}`;
    if (Date.now() - (dernieres.get(k) ?? 0) < RAPPEL_MS) return { envoye: false, raison: 'rappel_trop_tot' };
    dernieres.set(k, Date.now());
    const r = await lireRegle();
    const decision = r ? r.decisionMail(alerte) : { mail: false, categorie: null };
    const niveauSql = ['vide', 'presque_vide', 'sans_place', 'serveur'].includes(niveau) ? niveau : 'serveur';
    await base.from('cloud_pool_alertes').insert({ nature: 'alerte', niveau: niveauSql,
      details: { texte, ...details, alerte, mail: decision.mail } }).then(() => {}, () => {});
    journal.alerte('alerte_cloud', { niveau, texte, alerte, mail: decision.mail });
    if (!decision.mail) return { envoye: false, raison: r ? 'coupee' : 'regle_illisible' };
    if (!config.alertesMail) return { envoye: false, raison: 'mails_coupes' };
    const etat = await r.signalerNico({ base, alerte, cle: cle ?? niveau, texte });
    if (!etat.mail) return { envoye: false, raison: etat.raison };
    const { data, error } = await base.rpc('envoyer_mail_ponctuel', {
      p_destinataires: [{ email: config.alertesDestinataire, user_id: null, variables: {} }],
      p_sujet: `[FillSell Cloud] ${niveau} — ${texte.slice(0, 80)}`,
      p_html: `<p>${texte.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p><p>Serveur ${config.serveurNom}, ${new Date().toISOString()}.</p>`
        + `<p style="color:#888">${r.CATEGORIES[decision.categorie] ?? ''} — un seul mail tant que le problème n'est pas résolu.</p>`,
      p_type: 'cloud_alerte',
      p_categorie: 'support',
      p_simulation: false,
    });
    if (error) {
      journal.erreur('alerte_mail_echec', { erreur: error.message });
      await r.annulerMailNico({ base, alerte, cle: cle ?? niveau });
    }
    return { envoye: !error, reponse: data ?? null };
  }

  /** Le problème d'une alerte gardée est résolu (la situation est revue saine) : le prochain signal renverra un mail. */
  async function resoudre(alerte, cle = null) {
    const r = await lireRegle();
    if (r && r.mailNico(alerte)) await r.resoudreNico({ base, alerte, cle });
  }

  /** La règle chargée (alertes-nico.js), ou null : les appelants y lisent alertePool, alerteSolde, alerteProlongation. */
  const regleNico = () => lireRegle();

  return { signaler, resoudre, regle: regleNico };
}
