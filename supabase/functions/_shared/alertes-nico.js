// ═══════════════════════════════════════════════════════════════════════════
// LES MAILS À NICO (support@fillsell.app) : UNE LISTE FERMÉE (14/11/2026, complément 3 point 2 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « NICO NE REÇOIT PLUS UN MAIL QUE POUR UN VRAI PROBLÈME » : un client payant ou en essai qui ne peut plus publier ;
// un paiement échoué, un remboursement ou un litige ; le serveur Cloud en panne pendant plusieurs minutes alors que des
// clients en dépendent ; un client qui attend une place Cloud sans IP saine disponible ; un solde IPRoyal insuffisant
// pour renouveler une IP attribuée avant son expiration ; une double vente réelle confirmée. « Paiement reçu » reste.
// Tout le reste n'envoie plus de mail (pool à la marge, IP signalée sans client, redémarrage, récapitulatifs…) : chaque
// expéditeur garde son journal en base (rien n'est supprimé), seul l'envoi est coupé.
// « Pour un même problème, un seul mail, puis rien d'autre tant que le problème n'est pas résolu » : l'état d'un problème
// vit dans public.monitor_state (la table d'état et de journal des alertes de handler-watch, clé unique (platform,
// signature), colonnes first_seen_at / last_seen_at / last_alerted_at / resolved) — lignes platform = 'alertes_nico',
// signature = « <alerte>|<clé du problème> ». AUCUNE migration : la table, sa clé et ses droits (service_role) existent.
//   · problème NOUVEAU (aucune ligne) ou ROUVERT (ligne résolue, ou muette depuis `silenceH` heures pour un état) → un
//     mail, réservé atomiquement (INSERT … ON CONFLICT DO NOTHING, ou UPDATE conditionnel) : deux passages simultanés
//     n'en envoient qu'un ;
//   · problème OUVERT → rien, la ligne est seulement rafraîchie (last_seen_at, occurrences) ;
//   · résolu : par l'expéditeur qui revoit la situation saine (resoudreNico), ou par le silence (`silenceH`) ;
//   · un ÉVÉNEMENT (paiement, remboursement… : silenceH = null) a sa propre clé (facture, transaction) : un mail, jamais
//     deux ;
//   · état illisible (table injoignable) → le mail part quand même (un vrai problème n'est jamais tu ; les filets
//     propres à chaque expéditeur restent en place) ;
//   · envoi raté → annulerMailNico : la ligne passe « résolue », le prochain signal renvoie.
// Pur et sans dépendance : importé par les fonctions edge (Deno) ET par l'orchestrateur Cloud (Node — copié dans
// lib/alertes-nico.js par serveur-cloud/outils/deployer.sh, comme cloud-pool.js). Le client de base est injecté
// (supabase-js, même API des deux côtés). Verrou : scripts/alertes-nico-selftest.mjs (npm run selftest:alertes-nico).
// Les mails aux CLIENTS ne passent jamais ici.

export const DESTINATAIRE_NICO = 'support@fillsell.app';
export const PLATEFORME_ETAT = 'alertes_nico';

/** Les SEULES raisons d'un mail à Nico (ses mots, 14/11/2026). */
export const CATEGORIES = Object.freeze({
  client_bloque: 'Un client payant ou en essai ne peut plus publier',
  paiement_probleme: 'Un paiement échoué, un remboursement ou un litige',
  cloud_panne: 'Le serveur Cloud en panne plusieurs minutes alors que des clients en dépendent',
  cloud_sans_ip: 'Un client attend une place Cloud sans IP saine disponible',
  solde_iproyal: 'Solde IPRoyal insuffisant pour renouveler une IP attribuée avant son expiration',
  double_vente: 'Une double vente réelle confirmée',
  paiement_recu: 'Paiement reçu',
});

const A = (categorie, silenceH = null) => Object.freeze({ categorie, silenceH });

/**
 * CHAQUE alerte connue → sa catégorie (un mail) ou null (journal seulement). Une alerte absente de cette table n'envoie
 * rien (liste FERMÉE). silenceH : un ÉTAT (re-signalé tant qu'il dure) est tenu pour résolu après silenceH heures sans
 * signal ; null = un ÉVÉNEMENT (une clé par événement : un mail, jamais deux).
 */
export const ALERTES = Object.freeze({
  // ── GARDÉES ────────────────────────────────────────────────────────────
  // Paiement reçu (email-tunnel payment_alert ok ; _shared/cloud-alerte-nico.js 'paiement').
  'paiement.recu': A('paiement_recu'),
  'cloud.paiement': A('paiement_recu'),
  // Paiement payé mais rien crédité (webhooks des boutiques ; ops-digest : croisement Apple), échoué (stripe-webhook),
  // remboursé (Apple, Google, Stripe), litige (aucun détecteur aujourd'hui : charge.dispute.* n'est pas traité).
  'paiement.non_credite': A('paiement_probleme'),
  'paiement.echoue': A('paiement_probleme'),
  'paiement.remboursement': A('paiement_probleme'),
  'paiement.litige': A('paiement_probleme'),
  // Cloud : un client attend sans IP saine (orchestrateur, entretien du pool, une fois par heure).
  'orchestrateur.client_sans_ip': A('cloud_sans_ip', 6),
  // Cloud : le solde ne couvre pas le renouvellement d'une IP ATTRIBUÉE (projection 14 jours, ou prolongation refusée).
  'orchestrateur.solde_ip_attribuee': A('solde_iproyal', 48),
  // Cloud : une plateforme d'un client arrêtée sur le Cloud, sans nouvel essai (verifications.js).
  'orchestrateur.plateforme_arretee': A('client_bloque', 24),
  // Cloud : le serveur ne bat plus depuis 10 min alors qu'il porte des comptes (veille-cpu, toutes les 2 min).
  'veille.cloud_panne': A('cloud_panne', 1),
  // Une publication Leboncoin d'un client PAYANT ou EN ESSAI en pause « FillSell s'en occupe » (handler-watch).
  'handler_watch.moderation_leboncoin': A('client_bloque', 24),
  // La file d'un client PAYANT ou EN ESSAI arrêtée alors que son extension est ouverte (ops-digest, une fois par jour).
  'ops_digest.file_arretee': A('client_bloque', 48),
  // Une double vente réelle confirmée (aucun détecteur aujourd'hui).
  'vente.double_confirmee': A('double_vente'),

  // ── COUPÉES (journal seulement) ────────────────────────────────────────
  'paiement.notification_inconnue': A(null),      // stores_notifications_journal (connu = false)
  'paiement.deux_abonnements': A(null),           // monitor_state (alertes_nico)
  'cloud.essai_debut': A(null),                   // public.cloud_mails (clé « alerte: »)
  'cloud.arret_essai': A(null),
  'cloud.arret_programme': A(null),
  'cloud.essai_renouvellement_coupe': A(null),
  'cloud.zero_connexion': A(null),                // public.cloud_mails
  'orchestrateur.pool_marge': A(null),            // cloud_pool_alertes : pool presque vide / vide, personne sans IP
  'orchestrateur.solde_bas': A(null),             // cloud_pool_alertes : solde sous la projection d'ACHATS seulement
  'orchestrateur.autre': A(null),                 // cloud_pool_alertes : IP grillée, marge, capacité, purge, quarantaine…
  'handler_watch.incident': A(null),              // monitor_state (lignes de handler-watch)
  'handler_watch.orpheline': A(null),             // cross_post_jobs.platform_fields.orphan_alerted_at
  'handler_watch.moderation_leboncoin_gratuit': A(null), // platform_fields.lbc_moderation_alerte_le
  'veille.cpu': A(null),                          // veille_cpu_alertes
  'veille.ventes_prouvees': A(null),              // ventes_prouvees_alertes
  'ops_digest.recapitulatif': A(null),            // monitor_state (alertes_nico, une ligne par jour)
  'expirations_secrets.echeance': A(null),        // public.expirations_secrets
});

/** La décision d'une alerte : { mail, categorie } — inconnue = pas de mail. */
export function decisionMail(alerte) {
  const d = Object.prototype.hasOwnProperty.call(ALERTES, alerte) ? ALERTES[alerte] : null;
  const categorie = d?.categorie ?? null;
  return { alerte, mail: categorie != null && Object.prototype.hasOwnProperty.call(CATEGORIES, categorie), categorie };
}
/** Raccourci : cette alerte envoie-t-elle un mail ? */
export const mailNico = (alerte) => decisionMail(alerte).mail;

/** La clé d'état d'un problème dans monitor_state (bornée). */
export const signatureProbleme = (alerte, cle) => `${String(alerte)}|${String(cle ?? '-')}`.slice(0, 300);

const instant = (v) => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/**
 * L'état d'un problème (pur) : 'nouveau' (aucune ligne), 'rouvert' (ligne résolue, ou muette depuis silenceH heures pour
 * un état), 'ouvert' (déjà signalé, pas résolu : rien à envoyer).
 */
/** @param {any} ligne @param {{ alerte?: string, maintenant?: number }} [o] */
export function etatProbleme(ligne, { alerte, maintenant = Date.now() } = {}) {
  if (!ligne) return 'nouveau';
  if (ligne.resolved === true) return 'rouvert';
  const silenceH = ALERTES[alerte]?.silenceH ?? null;
  const vu = instant(ligne.last_seen_at);
  if (silenceH != null && vu != null && instant(maintenant) - vu >= silenceH * 3600_000) return 'rouvert';
  return 'ouvert';
}

// ── L'état en base (client supabase-js injecté : fonctions edge et orchestrateur) ──────────────────────────────────
const ligneNeuve = ({ alerte, cle, texte, categorie, iso, mail }) => ({
  platform: PLATEFORME_ETAT, signature: signatureProbleme(alerte, cle), severity: categorie ?? 'coupe',
  occurrences: 1, distinct_users: 0, sample_job_ids: [], sample_error: String(texte ?? '').slice(0, 500), handler_build: null,
  first_seen_at: iso, last_seen_at: iso, last_alerted_at: mail ? iso : null, resolved: false,
});

/**
 * Le signal d'un problème. Rend { mail, categorie, raison } : mail = true → l'appelant envoie (et appelle
 * annulerMailNico si l'envoi rate). raison : 'hors_liste' | 'nouveau' | 'rouvert' | 'deja_signale' | 'etat_illisible'
 * | 'pris_ailleurs'. `journaliser` : une alerte COUPÉE est aussi écrite dans monitor_state (pour les expéditeurs qui
 * n'ont pas d'autre journal en base). Ne lève jamais.
 */
/** @param {{ base: any, alerte: string, cle?: string | null, texte?: string, maintenant?: number, journaliser?: boolean }} p */
export async function signalerNico({ base, alerte, cle = null, texte = '', maintenant = Date.now(), journaliser = false }) {
  const { mail, categorie } = decisionMail(alerte);
  const iso = new Date(instant(maintenant) ?? Date.now()).toISOString();
  const sig = signatureProbleme(alerte, cle);
  if (!mail && !journaliser) return { mail: false, categorie, raison: 'hors_liste' };
  try {
    const { data: ligne, error } = await base.from('monitor_state')
      .select('id, last_seen_at, last_alerted_at, resolved, occurrences')
      .eq('platform', PLATEFORME_ETAT).eq('signature', sig).maybeSingle();
    if (error) throw new Error(error.message);
    const etat = etatProbleme(ligne, { alerte, maintenant });
    if (etat === 'nouveau') {
      const { data: pris, error: e2 } = await base.from('monitor_state')
        .upsert(ligneNeuve({ alerte, cle, texte, categorie, iso, mail }), { onConflict: 'platform,signature', ignoreDuplicates: true })
        .select('id');
      if (e2) throw new Error(e2.message);
      if (!mail) return { mail: false, categorie, raison: 'hors_liste' };
      return pris?.length ? { mail: true, categorie, raison: 'nouveau' } : { mail: false, categorie, raison: 'pris_ailleurs' };
    }
    if (etat === 'rouvert') {
      const silenceH = ALERTES[alerte]?.silenceH ?? null;
      let q = base.from('monitor_state').update({
        severity: categorie ?? 'coupe', occurrences: 1, sample_error: String(texte ?? '').slice(0, 500),
        first_seen_at: iso, last_seen_at: iso, last_alerted_at: mail ? iso : null, resolved: false,
      }).eq('id', ligne.id);
      // Réservation atomique : la ligne n'est reprise que si elle est TOUJOURS résolue (ou muette) au moment d'écrire.
      q = silenceH != null && ligne.resolved !== true
        ? q.lt('last_seen_at', new Date(instant(maintenant) - silenceH * 3600_000).toISOString())
        : q.eq('resolved', true);
      const { data: pris, error: e3 } = await q.select('id');
      if (e3) throw new Error(e3.message);
      if (!mail) return { mail: false, categorie, raison: 'hors_liste' };
      return pris?.length ? { mail: true, categorie, raison: 'rouvert' } : { mail: false, categorie, raison: 'pris_ailleurs' };
    }
    await base.from('monitor_state').update({ last_seen_at: iso, occurrences: (Number(ligne.occurrences) || 0) + 1,
      sample_error: String(texte ?? '').slice(0, 500) }).eq('id', ligne.id);
    return { mail: false, categorie, raison: mail ? 'deja_signale' : 'hors_liste' };
  } catch (e) {
    // Un vrai problème n'est jamais tu : l'état illisible laisse partir le mail (les filets de l'expéditeur restent).
    return { mail, categorie, raison: mail ? 'etat_illisible' : 'hors_liste', erreur: String(e?.message ?? e).slice(0, 200) };
  }
}

/** Le problème est résolu (l'expéditeur revoit la situation saine) : le prochain signal renverra un mail. Ne lève jamais. */
/** @param {{ base: any, alerte: string, cle?: string | null }} p */
export async function resoudreNico({ base, alerte, cle = null }) {
  try {
    await base.from('monitor_state').update({ resolved: true })
      .eq('platform', PLATEFORME_ETAT).eq('signature', signatureProbleme(alerte, cle)).eq('resolved', false);
  } catch { /* jamais bloquant */ }
}

/** Un envoi réservé a raté : la ligne passe « résolue », sans date d'envoi — le prochain signal renverra. */
/** @param {{ base: any, alerte: string, cle?: string | null }} p */
export async function annulerMailNico({ base, alerte, cle = null }) {
  try {
    await base.from('monitor_state').update({ resolved: true, last_alerted_at: null })
      .eq('platform', PLATEFORME_ETAT).eq('signature', signatureProbleme(alerte, cle));
  } catch { /* jamais bloquant */ }
}

/**
 * Les problèmes OUVERTS d'une alerte qui ne sont plus vus par un relevé COMPLET (ex. ops-digest : les files arrêtées
 * du jour) : résolus. `presentes` = les clés vues à ce relevé. Lecture bornée (200 lignes). Ne lève jamais.
 */
/** @param {{ base: any, alerte: string, presentes?: string[] }} p */
export async function resoudreAbsents({ base, alerte, presentes = [] }) {
  try {
    const vues = new Set((presentes ?? []).map((c) => signatureProbleme(alerte, c)));
    const { data } = await base.from('monitor_state').select('id, signature')
      .eq('platform', PLATEFORME_ETAT).eq('resolved', false).like('signature', `${String(alerte)}|%`).limit(200);
    const ids = (data ?? []).filter((l) => !vues.has(l.signature)).map((l) => l.id);
    if (ids.length) await base.from('monitor_state').update({ resolved: true }).in('id', ids).eq('resolved', false);
    return ids.length;
  } catch { return 0; }
}

// ── Les règles des expéditeurs (pures : testées par le verrou) ──────────────────────────────────────────────────────

/** Un client PAYANT ou EN ESSAI : palier des droits (palier.js : palierDesDroits) autre que gratuit, ou le Cloud payé. */
/** @param {string | null | undefined} palierDroits @param {any} [profil] */
export function payantOuEssai(palierDroits, profil = null) {
  return (palierDroits != null && palierDroits !== 'gratuit' && palierDroits !== 'free') || profil?.is_cloud === true;
}

/**
 * L'alerte du pool (orchestrateur, entretien) : un client attend une place Cloud SANS IP saine disponible — un compte
 * Cloud actif sans IP (comptes_sans_place), ou quelqu'un en attente alors qu'aucune IP saine n'est libre. Sinon (pool à
 * la marge, presque vide sans personne qui attend) : journal seulement.
 */
/** @param {{ sansPlace?: number, enAttente?: number, sainesLibres?: number | null, attribuables?: number }} [o] */
export function alertePool({ sansPlace = 0, enAttente = 0, sainesLibres = null, attribuables = 0 } = {}) {
  const saines = Number.isFinite(Number(sainesLibres)) && sainesLibres != null ? Number(sainesLibres) : Number(attribuables) || 0;
  const sansIp = (Number(sansPlace) || 0) > 0 || ((Number(enAttente) || 0) > 0 && saines <= 0);
  return { alerte: sansIp ? 'orchestrateur.client_sans_ip' : 'orchestrateur.pool_marge', cle: 'pool', sansIp };
}

/**
 * Le solde IPRoyal couvre-t-il le renouvellement des IP ATTRIBUÉES (projection : cloud-pool.js seuilSoldeProjete,
 * champ `attribuees` = IP attribuées qui échoient dans l'horizon) ? Non → solde_iproyal ; sinon la projection des
 * ACHATS seule n'est qu'un journal.
 */
/** @param {{ soldeUsd?: number | null, projection?: any }} [o] */
export function alerteSolde({ soldeUsd, projection } = {}) {
  const n = Number(projection?.attribuees) || 0;
  const prix = Number(projection?.prixIpUsd) || 0;
  const besoin = Math.round(n * prix * 100) / 100;
  const insuffisant = n > 0 && Number.isFinite(Number(soldeUsd)) && Number(soldeUsd) + 1e-9 < besoin;
  return { alerte: insuffisant ? 'orchestrateur.solde_ip_attribuee' : 'orchestrateur.solde_bas', cle: 'iproyal', insuffisant, besoinUsd: besoin };
}

/** Une prolongation refusée faute de solde : un mail seulement si l'une des IP de la commande est attribuée. */
export const ETATS_IP_ATTRIBUEE = Object.freeze(['attribuee_essai', 'attribuee_client']);
/** @param {{ raison?: string, ids?: Array<number | string>, ips?: Array<{ id: any, etat?: string | null }> }} [o] */
export function alerteProlongation({ raison, ids = [], ips = [] } = {}) {
  const attribuee = raison === 'solde_insuffisant' && (ids ?? []).some((id) =>
    ETATS_IP_ATTRIBUEE.includes((ips ?? []).find((i) => Number(i?.id) === Number(id))?.etat));
  return { alerte: attribuee ? 'orchestrateur.solde_ip_attribuee' : 'orchestrateur.autre', cle: 'iproyal', attribuee };
}

/** Le serveur Cloud muet depuis au moins 10 min (« plusieurs minutes », plus long qu'un redémarrage de déploiement). */
export const PANNE_CLOUD_MIN = 10;
/**
 * Les serveurs Cloud en panne (pur) : actifs, portant des comptes (des clients en dépendent), sans battement depuis
 * PANNE_CLOUD_MIN minutes. Rend { pannes: [{ nom, comptes, muetMin }], sains: [nom] }.
 */
/** @param {any[]} serveurs @param {{ maintenant?: number, seuilMin?: number }} [o] */
export function serveursEnPanne(serveurs, { maintenant = Date.now(), seuilMin = PANNE_CLOUD_MIN } = {}) {
  const now = instant(maintenant);
  const pannes = [];
  const sains = [];
  for (const s of Array.isArray(serveurs) ? serveurs : []) {
    if (!s?.nom || s.etat !== 'actif') continue;
    const vu = instant(s.vu_le);
    const muetMin = vu == null ? null : Math.floor((now - vu) / 60_000);
    if ((Number(s.comptes) || 0) > 0 && (vu == null || muetMin >= seuilMin)) pannes.push({ nom: String(s.nom), comptes: Number(s.comptes) || 0, muetMin });
    else sains.push(String(s.nom));
  }
  return { pannes, sains };
}
