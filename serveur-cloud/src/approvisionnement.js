// (03/11, point 2 de Nico) L'APPROVISIONNEMENT AUTOMATIQUE DES IP — appelé par l'entretien horaire (entretien.js) et,
// (07/11, décision 1) par le RÉAPPROVISIONNEMENT RAPIDE (entretien.reapprovisionnerVite, toutes les quelques minutes).
//   · RENOUVELLEMENT de toute IP que le plan désigne (une IP attribuée avant son échéance, une IP de la marge dont le pool
//     a besoin) : la commande IPRoyal entière est prolongée de 30 jours (une commande peut porter plusieurs IP : elles
//     ont la même échéance) ;
//   · ACHAT sous le stock visé (planDuJour : la MARGE, coin_config cloud_ip_marge, + les personnes en attente) : UNE
//     commande de N IP (N ≤ cloud_ip_achat_max, la remise de volume d'IPRoyal), France, 30 jours, sans renouvellement
//     chez IPRoyal ;
//   · LIVRAISON relue aux tours suivants : chaque IP livrée entre au pool (cloud_ip_ajouter : l'URL du proxy va au
//     vault, jamais au journal), le contrôle d'entrée la rend disponible.
// ⛔ LES GARDES : IPROYAL_ACHATS_AUTORISES=1 sur le serveur (iproyal.achatsAutorises), ET coin_config
//    cloud_ip_achats_auto / cloud_ip_renouvellement_auto = 1. Sinon : une PROPOSITION (alerte, aucun achat).
//    (07/11, décision 2 de Nico : « plus de plafond en dollars ») Le plafond du mois est RETIRÉ. À sa place, UNE garde
//    du NOMBRE pour l'achat : jamais plus d'IP comptées (vivantes + en commande + demandées) que de comptes Cloud + marge
//    + attente — en JS (regles.gardeNombre, porté par le plan) ET en base sous le verrou de la dépense
//    (cloud_ip_depense_ouvrir → cloud_ip_garde_nombre : plusieurs serveurs, une seule vérité). Elle n'arrête qu'une
//    boucle (alerte immédiate à support@), jamais un achat que le plan demande. Une PROLONGATION n'y passe jamais ; son
//    anti-boucle : jamais deux fois la même commande en 15 jours. Toute dépense est ouverte au registre
//    (cloud_ip_commandes) AVANT l'appel au fournisseur ; un achat échoué suspend l'achat automatique une heure — (20/11/2026
//    soir, bloc D de Nico) cinq minutes, au plus 3 essais par heure, quand un compte Cloud actif attend une IP ; une issue
//    inconnue est relue chez IPRoyal avant tout nouvel essai (pauseApresEchec, relireIssuesInconnues).
// (10/11 soir, ordre de Nico) LE MOYEN DE PAIEMENT : le SOLDE du compte IPRoyal, JAMAIS une carte. La banque refuse
//    IPRoyal (« marchand non autorisé » : achat du 10/11 19:36 en HTTP 500, paiements de 3,50 € refusés). Le mode carte
//    du 07/11 (coin_config cloud_ip_paiement_carte / cloud_ip_carte_id, reprise par le solde) est RETIRÉ : ces réglages
//    ne sont plus lus. Solde qui ne couvre pas la dépense : RIEN n'est acheté ni prolongé, aucune bascule, UNE alerte à
//    Nico « recharger le solde » (au plus une par heure et par texte, alertes.js). Une issue inconnue (5xx, coupure) n'est
//    jamais rejouée (jamais deux paiements). Le registre dit le moyen (details.paiement = 'solde').
import { proxiesLivres, commandePerdue } from './iproyal.js';

/** Une date IPRoyal (« 2026-12-04 12:57:45 », UTC sans fuseau) → instant (pure) ; NaN si illisible. */
export function dateIproyal(s) {
  const t = String(s ?? '').trim();
  if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d)?$/.test(t)) return Date.parse(`${t.replace(' ', 'T')}Z`);
  return Date.parse(t);
}

/** Les IP à renouveler, groupées par commande IPRoyal (pure) : Map commande → [ip_id]. Sans commande : écartée. */
export function grouperParCommande(ids, ips) {
  const parId = new Map((ips ?? []).map((i) => [Number(i.id), i]));
  const out = new Map();
  for (const id of ids ?? []) {
    const c = parId.get(Number(id))?.commande;
    if (!c) continue;
    out.set(String(c), [...(out.get(String(c)) ?? []), Number(id)]);
  }
  return out;
}

const RAISONS = Object.freeze({
  achats_coupes_serveur: 'achats coupés sur le serveur (IPROYAL_ACHATS_AUTORISES)',
  interrupteur_coupe: 'interrupteur coupé (coin_config)',
  garde_nombre: 'garde du nombre : plus d\'IP que de comptes Cloud + marge + attente',
  garde_illisible: 'garde du nombre illisible',
  prolongation_recente: 'commande déjà prolongée il y a moins de 15 jours',
  solde_insuffisant: 'solde IPRoyal insuffisant',
  prix_illisible: 'prix IPRoyal illisible',
  prix_ou_quantite_illisible: 'prix IPRoyal illisible',
  nature_inconnue: 'nature inconnue',
  echec_recent: 'un achat a échoué il y a moins d\'une heure',
  echecs_repetes: 'trois achats ont échoué dans l\'heure',
  issue_inconnue_a_relire: 'un achat à l\'issue inconnue n\'est pas encore relu chez IPRoyal',
  issue_inconnue_relue: 'un achat à l\'issue inconnue vient d\'être relu : le tour suivant replanifie',
  rebuts_controle: 'IP refusées au contrôle d\'entrée en série (24 h, en quarantaine — jamais jetées) : achat automatique suspendu, vérifier IPRoyal et le contrôle',
});
export const raisonLisible = (r) => RAISONS[r] ?? r;

/** (07/11) Un achat échoué suspend l'achat automatique pendant ce délai : jamais une boucle d'essais. */
// (21/11/2026 midi, point 5 de Nico) Une IP par essai d'achat, jamais plus — quel que soit le manque ou cloud_ip_achat_max.
export const ACHAT_PAR_ESSAI_MAX = 1;
export const ECHEC_ACHAT_PAUSE_MS = 3600_000;

// (20/11/2026 soir, bloc D de Nico) UN COMPTE CLOUD ACTIF ATTEND UNE IP (l'essai démarre tout de suite quand une IP est en route :
// migration 20261120230000, place promise) : un achat raté n'arrête plus l'achat une heure — nouvel essai au tour suivant du
// réapprovisionnement rapide (toutes les 5 min ; 30 s de jeu pour la durée du tour), au plus 3 achats ratés par heure glissante.
// Personne n'attend : la pause d'une heure, comme avant. Une ISSUE INCONNUE (5xx, coupure) n'est jamais rejouée à l'aveugle : sa
// ligne du registre reste « demandee » sans commande (comptée en route et par la garde du nombre) jusqu'à la RELECTURE des
// commandes IPRoyal (relireIssuesInconnues : adoptée si IPRoyal l'a prise, close en échec si IPRoyal n'a rien) — jamais deux
// paiements.
export const ECHEC_ACHAT_REESSAI_MS = 4.5 * 60_000;
export const ECHEC_ACHAT_MAX_PAR_HEURE = 3;
/** Une issue inconnue n'est relue chez IPRoyal qu'après ce délai (l'appel lui-même coupe à 30 s ; la commande a eu le temps d'apparaître). */
export const ISSUE_INCONNUE_RELECTURE_MS = 3 * 60_000;

/**
 * (20/11/2026 soir, bloc D de Nico) Après un achat raté, l'achat automatique est-il permis maintenant ? (pur : testé)
 * `echecs` : les instants des achats ratés ; `urgent` : un compte Cloud actif attend une IP (cloud_pool_etat.comptes_sans_place).
 * Rend { permis, raison?, reprise? } (reprise = l'instant où l'achat redevient permis).
 */
export function pauseApresEchec({ echecs = [], maintenant = Date.now(), urgent = false } = {}) {
  const heure = (echecs ?? []).map(Number).filter((t) => Number.isFinite(t) && maintenant - t < 3600_000).sort((a, b) => a - b);
  if (!heure.length) return { permis: true };
  const dernier = heure[heure.length - 1];
  if (!urgent) {
    return maintenant - dernier >= ECHEC_ACHAT_PAUSE_MS ? { permis: true } : { permis: false, raison: 'echec_recent', reprise: dernier + ECHEC_ACHAT_PAUSE_MS };
  }
  if (heure.length >= ECHEC_ACHAT_MAX_PAR_HEURE) {
    return { permis: false, raison: 'echecs_repetes', reprise: heure[heure.length - ECHEC_ACHAT_MAX_PAR_HEURE] + 3600_000 };
  }
  if (maintenant - dernier < ECHEC_ACHAT_REESSAI_MS) return { permis: false, raison: 'echec_recent', reprise: dernier + ECHEC_ACHAT_REESSAI_MS };
  return { permis: true };
}

/**
 * (20/11/2026 soir, bloc D de Nico) LA RELECTURE D'UNE ISSUE INCONNUE (pur : testé). `lignes` : les achats du registre restés
 * « demandee » sans commande depuis assez longtemps ; `commandes` : les commandes lues chez IPRoyal (GET /orders) ; `connues` :
 * les numéros de commande que le registre et le pool connaissent déjà. Une commande IPRoyal inconnue, plus récente que toutes
 * les connues (les numéros d'IPRoyal croissent), est la commande d'une de ces lignes :
 *   · aucune → chaque ligne est close en échec (IPRoyal n'a rien pris : rien n'a été payé) ;
 *   · autant que de lignes, mêmes quantités dans l'ordre → chaque ligne ADOPTE sa commande (livrée ensuite comme les autres) ;
 *   · sinon → douteuses : rien n'est décidé, rien n'est racheté, Nico est prévenu.
 */
export function rapprocherIssuesInconnues({ lignes = [], commandes = [], connues = [] } = {}) {
  const sues = new Set((connues ?? []).filter((x) => x != null && String(x).trim() !== '').map((x) => String(x).trim()));
  const nums = [...sues].map(Number).filter(Number.isFinite);
  const maxConnue = nums.length ? Math.max(...nums) : 0;
  const candidates = (commandes ?? [])
    .filter((c) => c?.id != null && !sues.has(String(c.id)) && Number(c.id) > maxConnue
      && (c.product_name == null || /isp/i.test(String(c.product_name))))
    .sort((a, b) => Number(a.id) - Number(b.id));
  const ls = [...(lignes ?? [])].sort((a, b) => Number(a.id) - Number(b.id));
  if (!ls.length) return { adopter: [], fermer: [], douteuses: [], candidates: candidates.map((c) => String(c.id)) };
  if (!candidates.length) return { adopter: [], fermer: ls.map((l) => l.id), douteuses: [], candidates: [] };
  if (candidates.length === ls.length && candidates.every((c, k) => Number(c.quantity ?? c.quantite) === Number(ls[k].quantite))) {
    return { adopter: ls.map((l, k) => ({ id: l.id, commande: String(candidates[k].id) })), fermer: [], douteuses: [], candidates: candidates.map((c) => String(c.id)) };
  }
  return { adopter: [], fermer: [], douteuses: ls.map((l) => l.id), candidates: candidates.map((c) => String(c.id)) };
}

/** (10/11 soir) L'alerte d'un solde qui ne couvre pas une dépense (pure) : ce qui manque, et « recharger ». */
// (19/11/2026, décision 2 de Nico : « par mail, UNE FOIS PAR INCIDENT, avec le montant à recharger et le nombre de clients
// qui seraient refusés ») `couverture` (alertes-nico.js couvertureSolde, sur la projection de 14 jours) et `enAttente` :
// qui attend déjà, combien de nouveaux clients seraient refusés, et le montant qui couvre les 14 prochains jours (jamais
// moins que ce qui manque pour cet achat).
export function texteSoldeInsuffisant({ nature, soldeUsd, montantUsd, texte, couverture = null, enAttente = null, horizonJours = 14 }) {
  const s = Number(soldeUsd), m = Number(montantUsd);
  const manque = Number.isFinite(s) && Number.isFinite(m) ? Math.max(0, Math.ceil((m - s) * 100) / 100) : NaN;
  const lisible = couverture?.lisible === true;
  const aRecharger = Math.max(Number.isFinite(manque) ? Math.ceil(manque) : 0, lisible ? Number(couverture.aRechargerUsd) || 0 : 0);
  const attente = Number(enAttente) > 0 ? ` ${Math.floor(Number(enAttente))} personne(s) attendent déjà une place.` : '';
  const refus = lisible ? ` D'ici ${horizonJours} jours, au rythme actuel, ${couverture.clientsRefuses} nouveau(x) client(s) seraient refusé(s) faute d'IP`
    + `${couverture.ipsClientsNonCouvertes ? ` et ${couverture.ipsClientsNonCouvertes} IP de client(s) ne seraient pas renouvelée(s)` : ''}.` : '';
  return `${nature} d'IP NON FAIT : solde IPRoyal ${Number.isFinite(s) ? `${s.toFixed(2)} $` : 'illisible'}, il faut ${Number.isFinite(m) ? `${m.toFixed(2)} $` : '?'}`
    + `${Number.isFinite(manque) ? ` (manque ${manque.toFixed(2)} $)` : ''}.${attente}${refus} RECHARGER LE SOLDE`
    + `${aRecharger > 0 ? ` d'au moins ${aRecharger} $${lisible ? ` (couvre les ${horizonJours} prochains jours)` : ''}` : ''} sur le tableau de bord IPRoyal`
    + ` — les IP ne se paient jamais par carte, rien n'est acheté d'ici là. (${texte})`;
}

/** (19/11/2026) L'incident « achat d'IP impossible faute de solde » : un mail, résolu par un achat réussi ou un solde qui couvre. */
export const ALERTE_ACHAT_SOLDE = Object.freeze({ alerte: 'orchestrateur.achat_ip_solde', cle: 'iproyal_achat' });

export function creerApprovisionnement({ base, iproyal, alertes, journal, regles, attendreLivraisonMs = 120_000, pasMs = 20_000, maintenant = () => Date.now() }) {
  // (20/11/2026 soir, bloc D) Les instants des achats ratés de la dernière heure (pauseApresEchec) ; vidé par un achat réussi.
  let echecsAchat = [];
  const param = async (cle, defaut) => {
    const { data, error } = await base.rpc('cloud_param', { p_cle: cle, p_defaut: defaut });
    return error ? defaut : Number(data ?? defaut);
  };

  /** Les gardes et réglages, lus à chaque tour (un changement de coin_config vaut au tour suivant). */
  async function gardes() {
    // (07/11 soir, ordres 3 et 4 de Nico) cloud_ip_sante_controle (le contrôle de santé périodique) et
    // cloud_ip_renouveler_saines_seulement (la règle « saines d'abord ») : 0 par défaut — le comportement d'avant.
    // (10/11 soir) cloud_ip_paiement_carte / cloud_ip_carte_id ne sont plus lus : les IP se paient par le solde, toujours.
    // (19/11/2026 ~14:00, décision de Nico) cloud_ip_achat_sur_demande = 1 (posé en base par scripts/reparations/
    // 20261119_cloud_ip_reglages.sql ; absent = 0, la marge d'avant) : un achat seulement pour un client qui attend vraiment,
    // une IP à la fois (entretien.js, regles.achatSurDemande).
    const [achatsAuto, renouvAuto, marge, achatMax, santeControle, sainesSeulement, surDemande] = await Promise.all([
      param('ip_achats_auto', 0), param('ip_renouvellement_auto', 0), param('ip_marge', regles?.PARAMETRES?.ipMarge ?? 3),
      param('ip_achat_max', regles?.PARAMETRES?.ipAchatMax ?? 10),
      param('ip_sante_controle', 0), param('ip_renouveler_saines_seulement', 0), param('ip_achat_sur_demande', 0),
    ]);
    return {
      envAutorise: iproyal?.achatsAutorises === true, achatsAuto: achatsAuto === 1, renouvAuto: renouvAuto === 1,
      marge: Math.max(0, Math.floor(Number.isFinite(marge) ? marge : 3)), achatMax: Math.max(1, Math.min(50, achatMax || 10)),
      santeControle: santeControle === 1, sainesSeulement: sainesSeulement === 1, surDemande: surDemande === 1,
    };
  }

  /** (10/11 soir) Le moyen de paiement : le SOLDE, toujours (jamais une carte — ordre de Nico). */
  function moyenPaiement() {
    return { mode: 'solde' };
  }

  /** Une dépense refusée ou impossible : dite (jamais un mail à un utilisateur ; ALERTES_MAIL décide pour support@). */
  async function dire(nature, raison, texte, details) {
    journal.info('approvisionnement_refuse', { nature, raison, ...details });
    if (raison === 'achats_coupes_serveur' || raison === 'interrupteur_coupe') {
      await alertes?.signaler('serveur', `Proposition (aucune dépense faite, ${raisonLisible(raison)}) : ${texte}`, details);
    } else if (raison === 'garde_nombre') {
      // (07/11, décision 2) La garde du nombre a parlé : une boucle d'achat est possible — alerte IMMÉDIATE.
      const gd = details?.garde ?? {};
      await alertes?.signaler('serveur', `Achat d'IP BLOQUÉ par la garde du nombre : ${gd.comptees ?? '?'} IP comptées (vivantes ${gd.vivantes ?? '?'}`
        + ` + en commande ${gd.en_commande ?? '?'} + demandées ${gd.demandees ?? '?'}) pour une borne de ${gd.borne ?? '?'} (comptes Cloud ${gd.comptes ?? '?'}`
        + ` + marge ${gd.marge ?? '?'} + attente ${gd.attente ?? '?'}). Une boucle d'achat ? Rien n'est acheté : relire cloud_ip_commandes et cloud_ips. (${texte})`, details);
    } else if (raison === 'solde_insuffisant') {
      // (10/11 soir) Le solde ne couvre pas : rien n'est fait, aucune bascule sur une carte — Nico recharge le solde.
      // (14/11, complément 3 point 2 de Nico) Un MAIL seulement pour la prolongation d'une IP ATTRIBUÉE à un client
      // (_shared/alertes-nico.js, alerteProlongation) ; une IP du stock : journal seulement.
      // (19/11/2026, décision 2 de Nico) Un ACHAT refusé faute de solde : un MAIL, une fois par incident
      // (orchestrateur.achat_ip_solde, clé « iproyal_achat » : les tentatives suivantes, toutes les 5 min, ne renvoient rien
      // tant que l'incident dure), avec le montant à recharger et les clients qui seraient refusés.
      const { ips_etats: etats, projection, en_attente: enAttente, ...reste } = details ?? {};
      const regleNico = await alertes?.regle?.();
      const nico = nature === 'achat' ? ALERTE_ACHAT_SOLDE
        : (regleNico?.alerteProlongation({ raison, ids: (etats ?? []).map((x) => x.id), ips: etats ?? [] }) ?? { alerte: 'orchestrateur.autre', cle: 'iproyal' });
      const couverture = projection && regleNico?.couvertureSolde ? regleNico.couvertureSolde({ soldeUsd: details?.solde_usd, projection }) : null;
      await alertes?.signaler('serveur', texteSoldeInsuffisant({ nature: nature === 'achat' ? 'Achat' : 'Renouvellement',
        soldeUsd: details?.solde_usd, montantUsd: details?.prix_usd, texte, couverture, enAttente, horizonJours: projection?.horizonJours ?? 14 }),
      { ...reste, ...(couverture ? { couverture } : {}) }, { alerte: nico.alerte, cle: nico.cle });
    } else {
      await alertes?.signaler('serveur', `Dépense IPRoyal BLOQUÉE (${raisonLisible(raison)}) : ${texte}`, details);
    }
  }

  /**
   * LE PAIEMENT D'UNE DÉPENSE DÉJÀ OUVERTE AU REGISTRE : `geste()` = l'appel IPRoyal, payé par le SOLDE. (10/11 soir)
   * Plus de carte ni de reprise : une erreur remonte telle quelle ; un 5xx ou une coupure = issue inconnue, jamais rejouée.
   */
  async function payer({ geste }) {
    try {
      return { r: await geste(), paiement: 'solde' };
    } catch (e) {
      if (!(Number(e?.statut) >= 400 && Number(e?.statut) < 500)) {
        // (20/11/2026 soir, bloc D) Un achat à l'issue inconnue est relu chez IPRoyal (relireIssuesInconnues) avant tout nouvel essai.
        e.message = `${e.message} — issue inconnue (aucune reprise à l'aveugle : jamais deux paiements), vérifier le tableau de bord IPRoyal`;
      }
      throw e;
    }
  }

  /**
   * (20/11/2026 soir, bloc D de Nico) LES ISSUES INCONNUES RELUES CHEZ IPRoyal (lecture seule : GET /orders). Les achats du
   * registre restés « demandee » sans commande depuis ISSUE_INCONNUE_RELECTURE_MS (5xx, coupure, orchestrateur mort entre le
   * registre et l'appel) : rapprocherIssuesInconnues décide — adoptée (« en_cours » avec sa commande : livrer() la fait entrer),
   * close en échec (IPRoyal n'a rien : rien payé), ou douteuse (rien décidé, Nico prévenu). Rend { aRelire } : le nombre de
   * lignes encore sans issue (0 = l'achat peut reprendre ; null = registre illisible).
   */
  async function relireIssuesInconnues(instantLu = maintenant()) {
    // Un client sans lecture de table (bancs d'essai qui ne simulent que les fonctions) : rien à relire ici — la garde du nombre
    // en base (cloud_ip_depense_ouvrir) compte toujours les lignes « demandee ». Une lecture qui ÉCHOUE, elle, bloque l'achat.
    if (typeof base?.from !== 'function') return { aRelire: 0, adoptees: [], closes: [], douteuses: [], sansRegistre: true };
    const { data, error } = await base.from('cloud_ip_commandes').select('id, quantite, statut, commande, demandee_le, details')
      .eq('nature', 'achat').eq('statut', 'demandee');
    if (error) return { aRelire: null, erreur: error.message };
    const lignes = (data ?? []).filter((c) => c?.statut === 'demandee' && !c.commande);
    if (!lignes.length) return { aRelire: 0, adoptees: [], closes: [], douteuses: [] };
    const mures = lignes.filter((c) => instantLu - Date.parse(c.demandee_le) >= ISSUE_INCONNUE_RELECTURE_MS);
    if (!mures.length) return { aRelire: lignes.length, jeunes: lignes.length };
    if (!iproyal?.disponible || typeof iproyal.listerCommandes !== 'function') return { aRelire: lignes.length, illisible: 'iproyal' };
    let commandes, connues;
    try {
      commandes = await iproyal.listerCommandes();
      const [reg, pool] = await Promise.all([base.from('cloud_ip_commandes').select('commande'), base.from('cloud_ips').select('commande')]);
      if (reg?.error || pool?.error) throw new Error(reg?.error?.message ?? pool?.error?.message);
      connues = [...(reg?.data ?? []), ...(pool?.data ?? [])].map((x) => x?.commande).filter(Boolean);
    } catch (e) {
      journal.alerte('issue_inconnue_illisible', { lignes: lignes.map((l) => l.id), erreur: e.message });
      return { aRelire: lignes.length, illisible: e.message };
    }
    const d = rapprocherIssuesInconnues({ lignes: mures, commandes, connues });
    const relue = new Date(instantLu).toISOString();
    for (const a of d.adopter) {
      await base.rpc('cloud_ip_depense_fermer', { p_id: a.id, p_statut: 'en_cours', p_commande: a.commande, p_prix_usd: null,
        p_details: { relue: 'commande_trouvee', relue_le: relue } });
      journal.alerte('issue_inconnue_adoptee', { depense: a.id, commande: a.commande });
      await alertes?.signaler('serveur', `Achat IPRoyal à l'issue inconnue (dépense n° ${a.id}) : IPRoyal l'a bien prise (commande ${a.commande}) — `
        + 'elle est livrée comme les autres, rien n\'est racheté.', { depense: a.id, commande: a.commande });
    }
    for (const id of d.fermer) {
      await base.rpc('cloud_ip_depense_fermer', { p_id: id, p_statut: 'echec', p_commande: null, p_prix_usd: null,
        p_details: { relue: 'aucune_commande', relue_le: relue, erreur: 'issue inconnue relue chez IPRoyal : aucune commande, rien payé' } });
      journal.info('issue_inconnue_close', { depense: id });
    }
    if (d.douteuses.length) {
      journal.alerte('issue_inconnue_douteuse', { depenses: d.douteuses, candidates: d.candidates });
      await alertes?.signaler('serveur', `Achat(s) IPRoyal à l'issue inconnue (dépense(s) n° ${d.douteuses.join(', ')}) : les commandes IPRoyal récentes `
        + `(${d.candidates.join(', ') || 'aucune'}) ne se rapprochent pas sans doute — RIEN n'est racheté tant que ce n'est pas tranché : relire `
        + 'cloud_ip_commandes et le tableau de bord IPRoyal.', { depenses: d.douteuses, candidates: d.candidates },
      { alerte: 'orchestrateur.autre', cle: `issue_inconnue:${d.douteuses.join(',')}` });
    }
    return { aRelire: lignes.length - d.adopter.length - d.fermer.length, adoptees: d.adopter, closes: d.fermer, douteuses: d.douteuses };
  }

  /** La livraison des commandes en cours : chaque IP livrée entre au pool (état « achetee »). */
  async function livrer(instantLu = maintenant()) {
    if (!iproyal?.disponible) return { livrees: 0 };
    let { data: enCours } = await base.from('cloud_ip_commandes')
      .select('id, commande, quantite, demandee_le, statut').eq('nature', 'achat').in('statut', ['demandee', 'en_cours']);
    // (20/11/2026 soir, bloc D) Une ligne sans commande (issue inconnue) est d'abord relue chez IPRoyal : adoptée, elle est livrée
    // dans ce même passage.
    let relues = 0;
    if ((enCours ?? []).some((c) => !c.commande) && typeof iproyal.listerCommandes === 'function') {
      const r = await relireIssuesInconnues(instantLu).catch((e) => { journal.alerte('issue_inconnue_illisible', { erreur: e.message }); return null; });
      relues = (r?.adoptees?.length ?? 0) + (r?.closes?.length ?? 0);
      if (relues > 0) {
        ({ data: enCours } = await base.from('cloud_ip_commandes')
          .select('id, commande, quantite, demandee_le, statut').eq('nature', 'achat').in('statut', ['demandee', 'en_cours']));
      }
    }
    let livrees = 0;
    for (const c of enCours ?? []) {
      if (!c.commande) {
        // Ouverte au registre, jamais passée (mort entre les deux) : comptée par la garde du nombre, dite — jamais rejouée.
        // (20/11/2026 soir) Relue chez IPRoyal ci-dessus ; encore sans issue après une heure : dite.
        if (instantLu - Date.parse(c.demandee_le) > 3600_000) {
          await alertes?.signaler('serveur', `Dépense IPRoyal n° ${c.id} ouverte sans commande depuis plus d'une heure : vérifier le tableau de bord IPRoyal.`, { depense: c.id });
        }
        continue;
      }
      try {
        const cmd = await iproyal.lireCommande(c.commande);
        // (20/11/2026 soir) Remboursée / annulée par IPRoyal : jamais livrée — close en échec (elle ne compte plus « en route »,
        // le rachat reprend), dite une fois.
        if (commandePerdue(cmd)) {
          await base.rpc('cloud_ip_depense_fermer', { p_id: c.id, p_statut: 'echec', p_commande: String(c.commande), p_prix_usd: null,
            p_details: { iproyal: String(cmd?.status ?? cmd?.order_status ?? ''), erreur: 'commande non livrée par IPRoyal (remboursée)' } });
          journal.alerte('commande_perdue', { commande: c.commande, statut: cmd?.status ?? null });
          await alertes?.signaler('serveur', `Commande IPRoyal ${c.commande} ${String(cmd?.status ?? '')} : aucune IP livrée, le montant revient au solde ; le rachat automatique reprend.`,
            { commande: c.commande }, { alerte: 'orchestrateur.autre', cle: `commande_perdue:${c.commande}` });
          continue;
        }
        const proxies = proxiesLivres(cmd);
        if (proxies.length < Number(c.quantite)) {
          if (instantLu - Date.parse(c.demandee_le) > 48 * 3600_000) {
            await alertes?.signaler('serveur', `Commande IPRoyal ${c.commande} : ${proxies.length}/${c.quantite} IP livrées après 48 h.`, { commande: c.commande });
          }
          continue;
        }
        const expire = dateIproyal(cmd?.expire_date);
        const ajoutees = [];
        for (const p of proxies) {
          const url = iproyal.urlProxy(cmd, p.ip);
          if (!url || !Number.isFinite(expire)) continue;
          const { data, error } = await base.rpc('cloud_ip_ajouter', { p_commande: String(c.commande), p_ip: p.ip, p_port: p.port,
            p_ville: cmd?.location ?? null, p_asn: null, p_proxy_url: url, p_expire_le: new Date(expire).toISOString() });
          if (error && !/duplicate|unique/i.test(error.message)) { journal.erreur('livraison_ajout_echec', { commande: c.commande, erreur: error.message }); continue; }
          ajoutees.push(p.ip);
          if (data != null) livrees++;
        }
        if (ajoutees.length === proxies.length) {
          await base.rpc('cloud_ip_depense_fermer', { p_id: c.id, p_statut: 'livree', p_commande: null, p_prix_usd: null, p_details: { ips: ajoutees.length } });
          journal.info('commande_livree', { commande: c.commande, ips: ajoutees.length });
        }
      } catch (e) { journal.alerte('livraison_illisible', { commande: c.commande, erreur: e.message }); }
    }
    return { livrees, relues };
  }

  /**
   * Les renouvellements du plan (une commande entière à la fois). `registre` : lignes récentes de cloud_ip_commandes
   * (l'anti-boucle des prolongations, ici et en base). Jamais bornés par la garde du nombre.
   */
  async function renouveler(plan, ips, g, solde, { registre = [] } = {}) {
    const faits = [];
    for (const [commande, ids] of grouperParCommande(plan?.renouveler ?? [], ips)) {
      let montant = NaN, cat = null, quantite = ids.length;
      try {
        // (14/11) Une prolongation ne dépend jamais du stock d'IP neuves (« France épuisée ») : l'IP est déjà à nous.
        cat = await iproyal.catalogueIsp({ exigerStock: false });
        quantite = proxiesLivres(await iproyal.lireCommande(commande)).length || ids.length;
        montant = await iproyal.prixCommande(quantite, cat);
      } catch (e) { journal.alerte('renouvellement_prix_illisible', { commande, erreur: e.message }); }
      const texte = `renouveler la commande ${commande} (${quantite} IP : ${ids.join(', ')}) pour ${Number.isFinite(montant) ? `${montant.toFixed(2)} $` : 'un prix illisible'}.`;
      const paiement = moyenPaiement();
      const dejaProlongee = ids.some((id) => regles.prolongationRecente({ registre, commande, ip: id, maintenant: maintenant() }));
      const d = regles.deciderDepense({ montantUsd: montant, envAutorise: g.envAutorise, interrupteur: g.renouvAuto, dejaProlongee,
        soldeUsd: solde?.montant });
      // (14/11) L'état de chaque IP de la commande : seul le renouvellement non couvert d'une IP de client fait partir un mail.
      const ipsEtats = ids.map((id) => ({ id, etat: (ips ?? []).find((i) => Number(i?.id) === Number(id))?.etat ?? null }));
      if (!d.faire) { await dire('prolongation', d.raison, texte, { commande, ips: ids, prix_usd: montant, solde_usd: solde?.montant ?? null, ips_etats: ipsEtats }); faits.push({ commande, fait: false, raison: d.raison }); continue; }
      const { data: o } = await base.rpc('cloud_ip_depense_ouvrir', { p_nature: 'prolongation', p_quantite: quantite, p_prix_usd: montant,
        p_ip: ids[0], p_details: { commande, ips: ids, paiement: paiement.mode } });
      if (!o?.ok) { await dire('prolongation', o?.raison ?? 'refus_base', texte, { commande }); faits.push({ commande, fait: false, raison: o?.raison }); continue; }
      try {
        const p = await payer({ geste: () => iproyal.prolonger(commande, cat.planId) });
        const fin = dateIproyal(p.r?.expire_date);
        await base.rpc('cloud_ip_depense_fermer', { p_id: o.id, p_statut: 'livree', p_commande: String(commande), p_prix_usd: montant,
          p_details: { expire_date: p.r?.expire_date ?? null, paiement: p.paiement } });
        if (Number.isFinite(fin)) {
          for (const id of ids) await base.rpc('cloud_ip_renouvelee', { p_ip: id, p_expire_le: new Date(fin).toISOString() });
        }
        if (p.paiement === 'solde' && solde && Number.isFinite(solde.montant)) solde.montant -= montant;
        registre.push({ nature: 'prolongation', statut: 'livree', demandee_le: new Date(maintenant()).toISOString(), ip_id: ids[0], details: { commande } });
        journal.info('renouvellement_fait', { commande, ips: ids.length, prix_usd: montant, paiement: p.paiement });
        faits.push({ commande, fait: true, paiement: p.paiement });
      } catch (e) {
        await base.rpc('cloud_ip_depense_fermer', { p_id: o.id, p_statut: 'echec', p_commande: String(commande), p_prix_usd: null, p_details: { erreur: e.message.slice(0, 200) } });
        await alertes?.signaler('serveur', `Renouvellement IPRoyal ÉCHOUÉ (commande ${commande}) : ${e.message.slice(0, 200)}`, { commande });
        faits.push({ commande, fait: false, raison: 'echec' });
      }
    }
    return faits;
  }

  /**
   * (04/11 soir, essai GPU — règle de Nico : « aucun achat d'IP sans mon accord écrit tant que le Cloud n'est pas ouvert »)
   * Le registre d'un achat sur ACCORD ÉCRIT quand l'interrupteur automatique est à 0 : cloud_ip_depense_ouvrir le refuse
   * (il ne connaît que l'automatique) ; la ligne s'écrit donc ici, mêmes colonnes, et `go_par` dit l'accord. La garde du
   * nombre a été relue en base juste avant (acheter). Aucun achat automatique ne peut courir en même temps (interrupteur à 0).
   */
  async function ouvrirSurAccord({ quantite, prixUsd, details, accord }) {
    const { data, error } = await base.from('cloud_ip_commandes').insert({ fournisseur: 'iproyal', nature: 'achat', quantite, statut: 'demandee',
      prix_usd: prixUsd, go_par: `accord écrit de Nico : ${accord}`.slice(0, 300), details: { ...details, accord_ecrit: accord } }).select('id').maybeSingle();
    if (error || !data?.id) return { ok: false, raison: 'registre_refuse' };
    return { ok: true, id: data.id };
  }

  /**
   * L'achat sous le stock visé : UNE commande de N IP (N ≤ cloud_ip_achat_max), sous la garde du nombre que porte le
   * plan (planDuJour, `garde`) — la base la revérifie sous verrou. (04/11 soir) `accordEcrit` : le texte de l'accord
   * écrit de Nico — il tient lieu d'interrupteur automatique, rien d'autre (serveur, garde du nombre relue en base, solde,
   * registre).
   */
  // (19/11/2026) `projection` (regles.seuilSoldeProjete, 14 jours) et `enAttente` : ce que dit le mail d'un achat refusé faute
  // de solde (montant à recharger, clients refusés) ; un achat réussi résout l'incident.
  // (20/11/2026 soir, bloc D de Nico) `urgent` : un compte Cloud actif attend une IP (cloud_pool_etat.comptes_sans_place > 0) —
  // un achat raté est réessayé au tour suivant (5 min), au plus 3 par heure (pauseApresEchec) ; sinon la pause d'une heure.
  async function acheter(plan, g, solde, { accordEcrit = null, projection = null, enAttente = null, urgent = false } = {}) {
    const accord = typeof accordEcrit === 'string' && accordEcrit.trim().length >= 10 ? accordEcrit.trim() : null;
    // (21/11/2026 midi, point 5 de Nico) Rachat : UNE IP par essai, jamais plus (le tour suivant rachète s'il manque encore).
    const n = Math.min(Math.max(0, Math.floor(Number(plan?.aCommander) || 0)), g.achatMax, ACHAT_PAR_ESSAI_MAX);
    if (n <= 0) return { fait: false, raison: 'rien_a_acheter' };
    const t0 = maintenant();
    const pause = accord ? { permis: true } : pauseApresEchec({ echecs: echecsAchat, maintenant: t0, urgent: urgent === true });
    if (!pause.permis) {
      journal.info('achat_suspendu', { raison: pause.raison, urgent: urgent === true, reprise_dans_s: Math.max(0, Math.round((pause.reprise - t0) / 1000)) });
      return { fait: false, raison: pause.raison };
    }
    // (20/11/2026 soir, bloc D) Jamais deux paiements : un achat à l'issue inconnue est d'abord relu chez IPRoyal ; tant qu'il
    // reste sans issue (trop jeune, IPRoyal illisible, rapprochement douteux), rien n'est acheté.
    // Relue à l'instant (adoptée ou close) : le plan de ce tour la comptait encore « en route » — rien n'est acheté sur lui, le
    // tour suivant replanifie sur le registre à jour.
    const relue = await relireIssuesInconnues(t0).catch((e) => ({ aRelire: null, erreur: e.message }));
    if (relue?.aRelire !== 0 || relue?.adoptees?.length || relue?.closes?.length) {
      const raison = relue?.aRelire !== 0 ? 'issue_inconnue_a_relire' : 'issue_inconnue_relue';
      journal.info('achat_suspendu', { raison, a_relire: relue?.aRelire ?? null, ...(relue?.illisible ? { illisible: relue.illisible } : {}) });
      return { fait: false, raison };
    }
    let montant = NaN, cat = null;
    try { cat = await iproyal.catalogueIsp(); montant = await iproyal.prixCommande(n, cat); } catch (e) { journal.alerte('achat_prix_illisible', { erreur: e.message }); }
    const texte = `acheter ${n} IP France 30 jours pour ${Number.isFinite(montant) ? `${montant.toFixed(2)} $` : 'un prix illisible'} (stock visé ${plan.vise}, prêtes ${plan.projete}).`;
    const paiement = moyenPaiement();
    // (07/11, décision 2) La garde du nombre : celle du plan (JS) ; sur accord écrit (plan sans garde), relue en base.
    const surAccord = Boolean(accord) && !g.achatsAuto;
    let garde = regles.gardePour(plan?.garde ?? null, n);
    if (surAccord) {
      const { data, error } = await base.rpc('cloud_ip_garde_nombre', { p_quantite: n });
      garde = error ? null : data;
    }
    const d = regles.deciderDepense({ montantUsd: montant, envAutorise: g.envAutorise, interrupteur: g.achatsAuto || Boolean(accord),
      garde, rebutsEntree: surAccord ? 0 : (plan?.rebutsEntree24h ?? 0), soldeUsd: solde?.montant });
    if (!d.faire) {
      await dire('achat', d.raison, texte, { quantite: n, prix_usd: montant, solde_usd: solde?.montant ?? null, ...(garde ? { garde } : {}),
        ...(projection ? { projection } : {}), ...(enAttente != null ? { en_attente: enAttente } : {}) });
      return { fait: false, raison: d.raison };
    }
    const detailsAchat = { produit: cat.produitId, offre: cat.planId, lieu: cat.lieuId, paiement: paiement.mode,
      ...(accord ? { accord_ecrit: accord } : {}) };
    const o = surAccord
      ? await ouvrirSurAccord({ quantite: n, prixUsd: montant, details: detailsAchat, accord })
      : (await base.rpc('cloud_ip_depense_ouvrir', { p_nature: 'achat', p_quantite: n, p_prix_usd: montant, p_ip: null, p_details: detailsAchat })).data;
    if (!o?.ok) {
      await dire('achat', o?.raison ?? 'refus_base', texte, { quantite: n, ...(o?.garde ? { garde: o.garde } : {}) });
      return { fait: false, raison: o?.raison };
    }
    let commande = null;
    try {
      const p = await payer({ geste: () => iproyal.commander(n, cat) });
      commande = p.r;
      await base.rpc('cloud_ip_depense_fermer', { p_id: o.id, p_statut: 'en_cours', p_commande: String(commande.id), p_prix_usd: montant,
        p_details: { paiement: p.paiement } });
      if (p.paiement === 'solde' && solde && Number.isFinite(solde.montant)) solde.montant -= montant;
      journal.info('achat_fait', { commande: String(commande.id), quantite: n, prix_usd: montant, paiement: p.paiement });
      echecsAchat = [];
      // (19/11/2026) L'incident « achat impossible faute de solde » est résolu : le prochain manque renverra un mail.
      await alertes?.resoudre?.(ALERTE_ACHAT_SOLDE.alerte, ALERTE_ACHAT_SOLDE.cle);
    } catch (e) {
      echecsAchat = [...echecsAchat.filter((t) => maintenant() - t < 3600_000), maintenant()];
      const suite = urgent === true
        ? `Un compte Cloud actif attend une IP : nouvel essai dans 5 min (au plus ${ECHEC_ACHAT_MAX_PAR_HEURE} par heure).`
        : 'Achat automatique suspendu une heure.';
      // (20/11/2026 soir, bloc D) Une ISSUE INCONNUE (5xx, coupure : IPRoyal a peut-être pris la commande) : la ligne reste
      // « demandee » sans commande — comptée en route — et sera relue chez IPRoyal (relireIssuesInconnues) avant tout nouvel
      // essai ; jamais close en échec à l'aveugle. Un REFUS (4xx) est sûr (rien payé) : close en échec, comme avant.
      if (!(Number(e?.statut) >= 400 && Number(e?.statut) < 500)) {
        try {
          await base.from('cloud_ip_commandes').update({ details: { ...detailsAchat, issue_inconnue: true, erreur: e.message.slice(0, 200),
            relire_apres: new Date(t0 + ISSUE_INCONNUE_RELECTURE_MS).toISOString() } }).eq('id', o.id).eq('statut', 'demandee');
        } catch (e2) { journal.alerte('issue_inconnue_note_echec', { depense: o.id, erreur: e2.message }); }
        await alertes?.signaler('serveur', `Achat IPRoyal à l'ISSUE INCONNUE (${n} IP, dépense n° ${o.id}) : ${e.message.slice(0, 200)}. La commande est `
          + `relue chez IPRoyal avant tout nouvel essai (jamais deux paiements). ${suite}`, { quantite: n, depense: o.id });
        return { fait: false, raison: 'issue_inconnue' };
      }
      await base.rpc('cloud_ip_depense_fermer', { p_id: o.id, p_statut: 'echec', p_commande: null, p_prix_usd: null, p_details: { erreur: e.message.slice(0, 200) } });
      await alertes?.signaler('serveur', `Achat IPRoyal ÉCHOUÉ (${n} IP) : ${e.message.slice(0, 200)}. ${suite}`, { quantite: n });
      return { fait: false, raison: 'echec' };
    }
    // La livraison prend quelques minutes chez IPRoyal : relue ici un moment, sinon au tour suivant.
    for (let t = 0; t < attendreLivraisonMs; t += pasMs) {
      await new Promise((r) => setTimeout(r, pasMs));
      if ((await livrer()).livrees > 0) break;
    }
    return { fait: true, commande: String(commande.id), quantite: n };
  }

  /**
   * (19/11/2026, remplacement gratuit par IPRoyal des IP 80, 81, 82) LES COMMANDES RELUES chez IPRoyal (entretien, chaque
   * heure ; lecture seule chez IPRoyal), UNE lecture par commande :
   *   1. l'échéance — prolongée chez IPRoyal → cloud_ip_renouvelee (comme avant, IP par IP) ;
   *   2. L'ADRESSE — une IP remplacée par IPRoyal dans la même commande (regles.remplacementsDeCommande) : une IP LIBRE reçoit
   *      la nouvelle adresse, son port et ses identifiants (cloud_ip_remplacee) et repasse le contrôle d'entrée puis la santé ;
   *      une IP ATTRIBUÉE n'est jamais changée seule (alerte, journal). Avant : rien ne relisait l'adresse d'une commande
   *      livrée — la base gardait l'ancienne adresse et l'ancien proxy, l'IP restait « grillée » jusqu'à son échéance.
   * Aucune adresse n'est écrite au journal de l'orchestrateur (les ids, la commande).
   */
  async function relireCommandes(ips) {
    const bilan = { lues: 0, renouvelees: 0, remplacees: [], refusees: [] };
    if (!iproyal?.disponible) return bilan;
    const parCommande = new Map();
    for (const i of (ips ?? []).filter((x) => !['expiree', 'rebut'].includes(x.etat) && x.commande)) {
      parCommande.set(String(i.commande), [...(parCommande.get(String(i.commande)) ?? []), i]);
    }
    for (const [commande, nos] of parCommande) {
      let cmd;
      try { cmd = await iproyal.lireCommande(commande); bilan.lues++; } catch (e) {
        for (const i of nos) journal.alerte('echeance_illisible', { ip_id: i.id, erreur: e.message });
        continue;
      }
      const fin = dateIproyal(cmd?.expire_date);
      for (const i of nos) {
        if (Number.isFinite(fin) && fin > Date.parse(i.expire_le)) {
          await base.rpc('cloud_ip_renouvelee', { p_ip: i.id, p_expire_le: new Date(fin).toISOString() });
          bilan.renouvelees++;
        }
      }
      const plan = regles?.remplacementsDeCommande?.({ ips: nos, proxies: proxiesLivres(cmd) }) ?? { remplacer: [] };
      for (const x of plan.remplacer) {
        if (x.etat === 'attribuee_essai' || x.etat === 'attribuee_client') {
          journal.alerte('ip_remplacee_attribuee', { ip_id: x.id, commande });
          await alertes?.signaler('serveur', `IP ${x.id} (commande IPRoyal ${commande}) : IPRoyal a changé son adresse alors qu'elle sert un compte — `
            + 'rien n\'est changé seul (le navigateur du compte garde l\'ancienne) : à décider.', { ip_id: x.id, commande });
          bilan.refusees.push(x.id);
          continue;
        }
        const url = iproyal.urlProxy?.(cmd, x.nouvelle) ?? null;
        const { data, error } = url ? await base.rpc('cloud_ip_remplacee', { p_ip: x.id, p_nouvelle: x.nouvelle, p_port: x.port, p_proxy_url: url })
          : { data: { ok: false, raison: 'url_illisible' }, error: null };
        if (!error && data?.ok === true) {
          journal.info('ip_remplacee', { ip_id: x.id, commande, etat_avant: x.etat });
          bilan.remplacees.push(x.id);
        } else {
          journal.alerte('ip_remplacement_refuse', { ip_id: x.id, commande, raison: data?.raison ?? error?.message ?? null });
          bilan.refusees.push(x.id);
        }
      }
    }
    return bilan;
  }

  return { gardes, moyenPaiement, livrer, renouveler, acheter, relireCommandes, relireIssuesInconnues };
}
