// selftest:alertes-nico — VERROU (14/11/2026, complément 3 point 2 de Nico) : « NICO NE REÇOIT PLUS UN MAIL QUE POUR UN
// VRAI PROBLÈME ». Rouge sur 5b395f6 (la règle n'existe pas : support@ recevait pool presque vide, IP saines sous la
// marge, IP grillée sans client, ops-digest, handler-watch, ventes prouvées, nouvel essai…), vert après.
//   A. La liste FERMÉE : les six catégories de Nico + « Paiement reçu », et rien d'autre ; une alerte inconnue = pas de
//      mail ; chaque alerte nommée dans le code existe dans la table ; le test mord (une alerte coupée qu'on garderait).
//   B. Un seul mail par problème tant qu'il n'est pas résolu (monitor_state) : nouveau, ouvert, résolu, rouvert, silence,
//      deux passages simultanés, envoi raté, état illisible, alerte coupée journalisée sans mail.
//   C. Les règles des expéditeurs, rejouées sur les alertes réelles du 13-14/11 (pool à la marge, solde des ACHATS seuls,
//      IP grillée sans client) : coupées ; un client sans IP saine, une IP attribuée non couverte, cloud-2 muet : gardés.
//   D. L'orchestrateur (serveur-cloud/src/alertes.js) : journal toujours écrit, mail seulement pour une alerte gardée, une
//      fois par problème ; la règle copiée dans lib/ au déploiement.
//   E. Le câblage de chaque expéditeur (fonctions edge) ; aucun mail CLIENT touché.
//   npm run selftest:alertes-nico
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const R = await import('../supabase/functions/_shared/alertes-nico.js');

// ── A. LA LISTE FERMÉE ──────────────────────────────────────────────────────
ok(R.DESTINATAIRE_NICO === 'support@fillsell.app', 'destinataire : support@fillsell.app');
ok(JSON.stringify(Object.keys(R.CATEGORIES)) === JSON.stringify(['client_bloque', 'paiement_probleme', 'cloud_panne', 'cloud_sans_ip', 'solde_iproyal', 'double_vente', 'paiement_recu']),
  'les catégories : les six vrais problèmes de Nico + « Paiement reçu », rien d’autre');
const GARDEES_ATTENDUES = [
  'cloud.paiement', 'handler_watch.moderation_leboncoin', 'ops_digest.file_arretee', 'orchestrateur.client_sans_ip',
  'orchestrateur.plateforme_arretee', 'orchestrateur.solde_ip_attribuee', 'paiement.echoue', 'paiement.litige',
  'paiement.non_credite', 'paiement.recu', 'paiement.remboursement', 'vente.double_confirmee', 'veille.cloud_panne',
].sort();
const gardees = (table) => Object.keys(table).filter((k) => table[k]?.categorie != null).sort();
const listeConforme = (table) => JSON.stringify(gardees(table)) === JSON.stringify(GARDEES_ATTENDUES);
ok(listeConforme(R.ALERTES), `les alertes qui envoient un mail : exactement ${GARDEES_ATTENDUES.length} (${gardees(R.ALERTES).join(', ')})`);
ok(!listeConforme({ ...R.ALERTES, 'orchestrateur.pool_marge': { categorie: 'cloud_sans_ip', silenceH: 6 } }), 'le test mord : garder « pool presque vide » le fait rougir');
for (const k of Object.keys(R.ALERTES)) {
  const c = R.ALERTES[k].categorie;
  ok(c === null || Object.prototype.hasOwnProperty.call(R.CATEGORIES, c), `${k} : catégorie connue ou null`);
}
const COUPEES_ATTENDUES = ['cloud.arret_essai', 'cloud.arret_programme', 'cloud.essai_debut', 'cloud.essai_renouvellement_coupe', 'cloud.zero_connexion',
  'expirations_secrets.echeance', 'handler_watch.incident', 'handler_watch.moderation_leboncoin_gratuit', 'handler_watch.orpheline',
  'ops_digest.recapitulatif', 'orchestrateur.autre', 'orchestrateur.pool_marge', 'orchestrateur.solde_bas', 'paiement.deux_abonnements',
  'paiement.notification_inconnue', 'veille.cpu', 'veille.ventes_prouvees'];
for (const k of COUPEES_ATTENDUES) ok(R.decisionMail(k).mail === false, `${k} : COUPÉE (journal seulement)`);
ok(R.decisionMail('inconnue.quelconque').mail === false && R.mailNico('') === false, 'une alerte inconnue n’envoie rien (liste fermée)');
ok(R.decisionMail('paiement.recu').mail && R.decisionMail('cloud.paiement').categorie === 'paiement_recu', '« Paiement reçu » reste (boutiques, Stripe, Cloud)');
ok(R.ALERTES['paiement.echoue'].silenceH === null && R.ALERTES['veille.cloud_panne'].silenceH === 1, 'un événement (facture) : jamais rouvert par le silence ; un état (panne) : oui');

// Chaque alerte nommée dans le code existe dans la table (sinon elle serait muette sans le dire).
const fichiers = [];
const parcourir = (d) => { for (const f of readdirSync(join(RACINE, d))) { const p = `${d}/${f}`; if (statSync(join(RACINE, p)).isDirectory()) parcourir(p); else if (/\.(ts|js)$/.test(f)) fichiers.push(p); } };
parcourir('supabase/functions'); parcourir('serveur-cloud/src');
const nommees = new Set();
for (const f of fichiers) {
  const t = lire(f);
  if (!/alertes-nico|alerte:|regle\?\.\(\)/.test(t)) continue;
  for (const m of t.matchAll(/["'`]((?:paiement|cloud|orchestrateur|veille|handler_watch|ops_digest|expirations_secrets|vente)\.[a-z_]+)["'`]/g)) nommees.add(m[1]);
}
const { EVENEMENTS_ALERTE } = await import('../supabase/functions/_shared/cloud-alerte-nico.js');
for (const e of EVENEMENTS_ALERTE) nommees.add(`cloud.${e}`);
const inconnues = [...nommees].filter((k) => !Object.prototype.hasOwnProperty.call(R.ALERTES, k));
ok(nommees.size >= 25 && inconnues.length === 0, `chaque alerte nommée dans le code est dans la liste (${nommees.size} lues) ${inconnues.join(', ')}`);

// ── B. UN SEUL MAIL PAR PROBLÈME (monitor_state) ────────────────────────────
function fauxBase({ casse = false } = {}) {
  const tables = { monitor_state: [], cloud_pool_alertes: [] };
  const appels = [];
  let id = 1;
  const t = (v) => Date.parse(String(v));
  const correspond = (r, filtres) => filtres.every(([op, c, v]) => (op === 'eq' ? r[c] === v
    : op === 'lt' ? t(r[c]) < t(v)
      : op === 'like' ? new RegExp(`^${String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`).test(String(r[c]))
        : op === 'in' ? v.includes(r[c]) : true));
  const from = (table) => {
    const st = { op: null, filtres: [], payload: null, opts: {}, limite: null, unique: false };
    const executer = () => {
      if (casse && table === 'monitor_state') return { data: null, error: { message: 'table injoignable' } };
      const lignes = (tables[table] ??= []);
      if (st.op === 'select') {
        let rows = lignes.filter((r) => correspond(r, st.filtres));
        if (st.limite) rows = rows.slice(0, st.limite);
        return { data: st.unique ? (rows[0] ? { ...rows[0] } : null) : rows.map((r) => ({ ...r })), error: null };
      }
      if (st.op === 'insert') { lignes.push({ id: id++, ...st.payload }); return { data: null, error: null }; }
      if (st.op === 'upsert') {
        const p = st.payload;
        const existe = lignes.find((r) => r.platform === p.platform && r.signature === p.signature);
        if (existe) { if (st.opts.ignoreDuplicates) return { data: [], error: null }; Object.assign(existe, p); return { data: [{ id: existe.id }], error: null }; }
        const r = { id: id++, ...p }; lignes.push(r); return { data: [{ id: r.id }], error: null };
      }
      if (st.op === 'update') { const rows = lignes.filter((r) => correspond(r, st.filtres)); rows.forEach((r) => Object.assign(r, st.payload)); return { data: rows.map((r) => ({ id: r.id })), error: null }; }
      return { data: null, error: { message: `op ${st.op}` } };
    };
    const b = {
      select() { if (!st.op) st.op = 'select'; return b; },
      insert(p) { st.op = 'insert'; st.payload = p; return b; },
      upsert(p, o) { st.op = 'upsert'; st.payload = p; st.opts = o ?? {}; return b; },
      update(p) { st.op = 'update'; st.payload = p; return b; },
      eq(c, v) { st.filtres.push(['eq', c, v]); return b; },
      lt(c, v) { st.filtres.push(['lt', c, v]); return b; },
      like(c, v) { st.filtres.push(['like', c, v]); return b; },
      in(c, v) { st.filtres.push(['in', c, v]); return b; },
      limit(k) { st.limite = k; return b; },
      maybeSingle() { st.unique = true; return b; },
      then(res, rej) { return Promise.resolve().then(executer).then(res, rej); },
    };
    return b;
  };
  return { tables, appels, from, rpc: async (nom, args) => { appels.push([nom, args]); return { data: 42, error: null }; } };
}
const H = 3600_000;
const T0 = Date.parse('2026-11-14T09:00:00Z');
{
  const base = fauxBase();
  const s1 = await R.signalerNico({ base, alerte: 'paiement.echoue', cle: 'in_1', texte: 'carte refusée', maintenant: T0 });
  const s2 = await R.signalerNico({ base, alerte: 'paiement.echoue', cle: 'in_1', texte: 'carte refusée (relance Stripe)', maintenant: T0 + 3 * 24 * H });
  const ligne = base.tables.monitor_state[0];
  ok(s1.mail && s1.raison === 'nouveau' && !s2.mail && s2.raison === 'deja_signale', 'une facture échouée : UN mail ; la relance de Stripe 3 jours plus tard : rien');
  ok(ligne.platform === 'alertes_nico' && ligne.signature === 'paiement.echoue|in_1' && ligne.severity === 'paiement_probleme' && ligne.occurrences === 2 && ligne.resolved === false && ligne.last_alerted_at,
    'état dans monitor_state : platform alertes_nico, signature « alerte|clé », catégorie, occurrences, date du mail');
  ok((await R.signalerNico({ base, alerte: 'paiement.echoue', cle: 'in_2', maintenant: T0 })).mail, 'une AUTRE facture : un autre mail');
}
{
  const base = fauxBase();
  const a = { base, alerte: 'veille.cloud_panne', cle: 'cloud-2' };
  ok((await R.signalerNico({ ...a, maintenant: T0 })).mail, 'cloud-2 muet : un mail');
  ok(!(await R.signalerNico({ ...a, maintenant: T0 + 2 * 60_000 })).mail && !(await R.signalerNico({ ...a, maintenant: T0 + 30 * 60_000 })).mail, 'toujours muet (2 min, 30 min) : rien d’autre');
  await R.resoudreNico(a);
  ok(base.tables.monitor_state[0].resolved === true, 'le battement revenu : le problème est résolu');
  const r = await R.signalerNico({ ...a, maintenant: T0 + 3 * H });
  ok(r.mail && r.raison === 'rouvert' && base.tables.monitor_state.length === 1, 'une nouvelle panne après résolution : un nouveau mail (la même ligne, rouverte)');
  ok(!(await R.signalerNico({ ...a, maintenant: T0 + 3 * H + 60_000 })).mail, 'puis rien tant qu’elle dure');
  const s = await R.signalerNico({ ...a, maintenant: T0 + 3 * H + 60_000 + 2 * H });
  ok(s.mail && s.raison === 'rouvert', 'un ÉTAT muet depuis silenceH (1 h) est tenu pour résolu : le signal suivant renvoie');
}
{
  const base = fauxBase();
  const [x, y] = await Promise.all([
    R.signalerNico({ base, alerte: 'orchestrateur.client_sans_ip', cle: 'pool', maintenant: T0 }),
    R.signalerNico({ base, alerte: 'orchestrateur.client_sans_ip', cle: 'pool', maintenant: T0 }),
  ]);
  ok([x.mail, y.mail].filter(Boolean).length === 1 && base.tables.monitor_state.length === 1, 'deux passages simultanés : UN seul mail (réservation atomique)');
  await R.annulerMailNico({ base, alerte: 'orchestrateur.client_sans_ip', cle: 'pool' });
  ok(base.tables.monitor_state[0].resolved === true && base.tables.monitor_state[0].last_alerted_at === null, 'envoi raté : la ligne passe résolue, sans date de mail');
  ok((await R.signalerNico({ base, alerte: 'orchestrateur.client_sans_ip', cle: 'pool', maintenant: T0 + 60_000 })).mail, '… et le signal suivant renvoie');
}
{
  const base = fauxBase();
  const c = await R.signalerNico({ base, alerte: 'orchestrateur.pool_marge', cle: 'pool', maintenant: T0 });
  ok(!c.mail && c.raison === 'hors_liste' && base.tables.monitor_state.length === 0, 'une alerte COUPÉE : aucun mail, aucune écriture (l’expéditeur a son journal)');
  const j1 = await R.signalerNico({ base, alerte: 'paiement.deux_abonnements', cle: 'u1|apple', texte: 'Premium + Pro', journaliser: true, maintenant: T0 });
  const j2 = await R.signalerNico({ base, alerte: 'paiement.deux_abonnements', cle: 'u1|apple', texte: 'Premium + Pro', journaliser: true, maintenant: T0 + H });
  const l = base.tables.monitor_state[0];
  ok(!j1.mail && !j2.mail && l.severity === 'coupe' && l.last_alerted_at === null && l.occurrences === 2 && l.sample_error === 'Premium + Pro',
    'une alerte coupée sans autre journal (journaliser) : écrite dans monitor_state, jamais de mail');
  const casse = fauxBase({ casse: true });
  const e = await R.signalerNico({ base: casse, alerte: 'paiement.non_credite', cle: 'apple:apple:1', maintenant: T0 });
  ok(e.mail && e.raison === 'etat_illisible', 'état illisible : un vrai problème part quand même (jamais tu)');
  ok(!(await R.signalerNico({ base: casse, alerte: 'handler_watch.incident', cle: 'x', maintenant: T0 })).mail, 'état illisible : une alerte coupée reste coupée');
}
{
  const base = fauxBase();
  for (const cle of ['u1|vinted', 'u2|leboncoin']) await R.signalerNico({ base, alerte: 'ops_digest.file_arretee', cle, maintenant: T0 });
  const resolues = await R.resoudreAbsents({ base, alerte: 'ops_digest.file_arretee', presentes: ['u2|leboncoin'] });
  ok(resolues === 1 && base.tables.monitor_state.find((l) => l.signature === 'ops_digest.file_arretee|u1|vinted').resolved === true
    && base.tables.monitor_state.find((l) => l.signature === 'ops_digest.file_arretee|u2|leboncoin').resolved === false,
  'relevé complet du jour : la file qui a repris est résolue, l’autre reste ouverte (pas de second mail)');
}
ok(R.etatProbleme(null, { alerte: 'paiement.recu' }) === 'nouveau' && R.etatProbleme({ resolved: true }, { alerte: 'paiement.echoue' }) === 'rouvert'
  && R.etatProbleme({ resolved: false, last_seen_at: new Date(T0 - 100 * 24 * H).toISOString() }, { alerte: 'paiement.echoue', maintenant: T0 }) === 'ouvert',
'etatProbleme : nouveau, rouvert (résolu), un événement jamais rouvert par le silence');

// ── C. LES RÈGLES DES EXPÉDITEURS, REJOUÉES SUR LES ALERTES DU 13-14/11 ─────
// cloud_pool_alertes du 14/11 10:19 (Paris) : « Pool presque vide : 1 IP libre(s), 0 personne(s) attendent une place »
// (marge 2, 1 attribuable, 1 saine) — reçue 9 fois ce matin-là : coupée.
ok(R.alertePool({ sansPlace: 0, enAttente: 0, sainesLibres: 1, attribuables: 1 }).alerte === 'orchestrateur.pool_marge', '14/11 : pool à la marge, personne n’attend → COUPÉE');
ok(R.alertePool({ sansPlace: 0, enAttente: 0, sainesLibres: 0, attribuables: 0 }).alerte === 'orchestrateur.pool_marge', 'pool VIDE sans personne qui attend → COUPÉE');
ok(R.alertePool({ sansPlace: 0, enAttente: 1, sainesLibres: 0, attribuables: 2 }).sansIp, 'quelqu’un attend, des IP libres mais aucune SAINE → GARDÉE');
ok(R.alertePool({ sansPlace: 0, enAttente: 2, sainesLibres: 1, attribuables: 1 }).alerte === 'orchestrateur.pool_marge', 'quelqu’un attend mais une IP saine est libre (attribuée au tour suivant) → COUPÉE');
ok(R.alertePool({ sansPlace: 1, enAttente: 0, sainesLibres: 3 }).alerte === 'orchestrateur.client_sans_ip', 'un compte Cloud actif SANS IP → GARDÉE');
ok(R.alertePool({ enAttente: 1, sainesLibres: null, attribuables: 0 }).sansIp, 'contrôle de santé éteint : les attribuables tiennent lieu de saines');
// 13/11 13:57 et 20:40 : « Solde IPRoyal 5.15 USD … (16.00 $ : 0 renouvellement(s) et 4 achat(s)) » : des ACHATS seulement → coupée.
ok(R.alerteSolde({ soldeUsd: 5.15, projection: { seuilUsd: 16, renouvellements: 0, achats: 4, prixIpUsd: 4, horizonJours: 14, attribuees: 0 } }).alerte === 'orchestrateur.solde_bas',
  '13/11 : solde 5,15 $ sous la projection des ACHATS, aucune IP de client à renouveler → COUPÉE');
const sol = R.alerteSolde({ soldeUsd: 5.15, projection: { seuilUsd: 24, renouvellements: 2, achats: 4, prixIpUsd: 4, horizonJours: 14, attribuees: 2 } });
ok(sol.insuffisant && sol.alerte === 'orchestrateur.solde_ip_attribuee' && sol.besoinUsd === 8, '2 IP de clients à renouveler (8 $) pour 5,15 $ → GARDÉE');
ok(!R.alerteSolde({ soldeUsd: 8, projection: { attribuees: 2, prixIpUsd: 4 } }).insuffisant && !R.alerteSolde({ soldeUsd: 1, projection: null }).insuffisant, 'solde qui couvre, projection absente : rien');
ok(R.alerteProlongation({ raison: 'solde_insuffisant', ids: [42], ips: [{ id: 42, etat: 'attribuee_client' }] }).alerte === 'orchestrateur.solde_ip_attribuee'
  && R.alerteProlongation({ raison: 'solde_insuffisant', ids: [7], ips: [{ id: 7, etat: 'disponible' }] }).alerte === 'orchestrateur.autre'
  && R.alerteProlongation({ raison: 'interrupteur_coupe', ids: [42], ips: [{ id: 42, etat: 'attribuee_essai' }] }).alerte === 'orchestrateur.autre',
'prolongation refusée faute de solde : GARDÉE pour une IP de client, coupée pour le stock ou un interrupteur');
const now = Date.parse('2026-11-14T11:12:13Z');
const srv = [
  { nom: 'cloud-2', etat: 'actif', comptes: 7, vu_le: new Date(now - 27_000).toISOString() },
  { nom: 'cloud-1', etat: 'retire', comptes: 0, vu_le: '2026-11-06T18:27:35Z' },
];
ok(R.serveursEnPanne(srv, { maintenant: now }).pannes.length === 0, '14/11 11:12 : cloud-2 bat (27 s), cloud-1 retiré → aucune panne');
ok(R.serveursEnPanne([{ ...srv[0], vu_le: new Date(now - 3 * 60_000).toISOString() }], { maintenant: now }).pannes.length === 0, 'un redémarrage de déploiement (3 min) → rien');
const p = R.serveursEnPanne([{ ...srv[0], vu_le: new Date(now - 12 * 60_000).toISOString() }], { maintenant: now });
ok(p.pannes.length === 1 && p.pannes[0].nom === 'cloud-2' && p.pannes[0].muetMin === 12 && p.pannes[0].comptes === 7, 'cloud-2 muet 12 min avec 7 comptes → PANNE');
ok(R.serveursEnPanne([{ ...srv[0], comptes: 0, vu_le: new Date(now - 60 * 60_000).toISOString() }], { maintenant: now }).pannes.length === 0, 'muet sans aucun client → rien');
ok(R.payantOuEssai('pro', {}) && R.payantOuEssai('gratuit', { is_cloud: true }) && !R.payantOuEssai('gratuit', {}) && !R.payantOuEssai('free', null), 'payant ou en essai : palier des droits, ou le Cloud payé');

// ── D. L'ORCHESTRATEUR ──────────────────────────────────────────────────────
{
  const { creerAlertes, chargerRegleNico } = await import('../serveur-cloud/src/alertes.js');
  const regle = await chargerRegleNico();
  ok(typeof regle.decisionMail === 'function', 'alertes.js charge la règle (lib/alertes-nico.js, sinon le dépôt)');
  const base = fauxBase();
  const journal = { alerte() {}, erreur() {}, info() {} };
  const a = creerAlertes({ config: { alertesMail: true, alertesDestinataire: 'support@fillsell.app', serveurNom: 'cloud-2' }, base, journal, regle });
  const r1 = await a.signaler('presque_vide', 'Pool presque vide : 1 IP libre(s), 0 personne(s) attendent une place.', { etat: {} }, { alerte: 'orchestrateur.pool_marge', cle: 'pool' });
  const r2 = await a.signaler('serveur', 'IP 79 (x) GRILLÉE au contrôle de santé : ebay');
  ok(!r1.envoye && !r2.envoye && base.appels.length === 0, 'pool à la marge, IP grillée sans client : AUCUN mail');
  ok(base.tables.cloud_pool_alertes.length === 2 && base.tables.cloud_pool_alertes.every((l) => l.details.mail === false) && base.tables.cloud_pool_alertes[1].details.alerte === 'orchestrateur.autre',
    'le journal cloud_pool_alertes est toujours écrit (alerte, mail : false) — rien n’est supprimé');
  const g1 = await a.signaler('sans_place', '1 compte(s) Cloud actif(s) SANS IP : achète une IP (essai en attente : 0).', {}, { alerte: 'orchestrateur.client_sans_ip', cle: 'pool' });
  const g2 = await a.signaler('sans_place', '2 compte(s) Cloud actif(s) SANS IP : achète une IP (essai en attente : 1).', {}, { alerte: 'orchestrateur.client_sans_ip', cle: 'pool' });
  ok(g1.envoye && !g2.envoye && base.appels.length === 1 && base.appels[0][0] === 'envoyer_mail_ponctuel'
    && base.appels[0][1].p_categorie === 'support' && base.appels[0][1].p_destinataires[0].email === 'support@fillsell.app',
  'un client sans IP : UN mail (porte unique, catégorie support, support@) ; le même problème une heure après : rien');
  await a.resoudre('orchestrateur.client_sans_ip', 'pool');
  const g3 = await a.signaler('sans_place', '3 compte(s) Cloud actif(s) SANS IP : achète une IP (essai en attente : 0).', {}, { alerte: 'orchestrateur.client_sans_ip', cle: 'pool' });
  ok(g3.envoye && base.appels.length === 2, 'résolu puis revenu : un nouveau mail');
  const coupe = creerAlertes({ config: { alertesMail: false, alertesDestinataire: 'support@fillsell.app', serveurNom: 'cloud-2' }, base: fauxBase(), journal, regle });
  ok((await coupe.signaler('serveur', 'x', {}, { alerte: 'orchestrateur.plateforme_arretee', cle: 'u|vinted' })).raison === 'mails_coupes', 'ALERTES_MAIL=0 : rien ne part (inchangé)');
}
const dep = lire('serveur-cloud/outils/deployer.sh');
ok((dep.match(/cp supabase\/functions\/_shared\/alertes-nico\.js "\$PAQUET\/lib\/alertes-nico\.js"/g) ?? []).length === 2
  && /git status --porcelain -- serveur-cloud supabase\/functions\/_shared\/cloud-pool\.js supabase\/functions\/_shared\/alertes-nico\.js/.test(dep),
'deployer.sh : la règle copiée dans lib/ (orchestrateur seul et complet), et gardée par le refus d’un arbre sale');
ok(/'\.\.\/lib\/alertes-nico\.js'/.test(lire('serveur-cloud/src/alertes.js')) && /'\.\.\/\.\.\/supabase\/functions\/_shared\/alertes-nico\.js'/.test(lire('serveur-cloud/src/alertes.js')), 'alertes.js : lib/ dans l’image, le dépôt en test');
ok(/regleNico\?\.alertePool\(/.test(lire('serveur-cloud/src/entretien.js')) && /if \(!poolNico\.sansIp\) await alertes\?\.resoudre\?\.\('orchestrateur\.client_sans_ip', 'pool'\)/.test(lire('serveur-cloud/src/entretien.js')), 'entretien : le pool passe par alertePool et se résout quand il est revu sain');
ok(/regleNico\?\.alerteSolde\(/.test(lire('serveur-cloud/src/fournisseurIp.js')) && /\{ alerte: nico\.alerte, cle: nico\.cle \}/.test(lire('serveur-cloud/src/fournisseurIp.js')), 'solde : alerteSolde (IP attribuées)');
ok(/alerteProlongation\(/.test(lire('serveur-cloud/src/approvisionnement.js')) && /ips_etats: ipsEtats/.test(lire('serveur-cloud/src/approvisionnement.js')), 'prolongation refusée : alerteProlongation (état des IP de la commande)');
ok((lire('serveur-cloud/src/verifications.js').match(/alerte: 'orchestrateur\.plateforme_arretee'/g) ?? []).length === 2, 'vérification revenue / refusée encore : client bloqué (gardée)');
ok(/attribuees \};/.test(lire('supabase/functions/_shared/cloud-pool.js')), 'cloud-pool.js : la projection du solde rend les IP ATTRIBUÉES (attribuees)');

// ── E. LE CÂBLAGE DES FONCTIONS EDGE ────────────────────────────────────────
const hw = lire('supabase/functions/handler-watch/index.ts');
ok(/if \(!mailNico\("handler_watch\.incident"\)\) \{/.test(hw) && /if \(orphelins\.length && !mailNico\("handler_watch\.orpheline"\)\) \{/.test(hw), 'handler-watch : incidents et orphelines = journal (monitor_state, orphan_alerted_at), aucun mail');
ok(/payantOuEssai\(palierDesDroits\(pr\), pr\) \? "handler_watch\.moderation_leboncoin" : "handler_watch\.moderation_leboncoin_gratuit"/.test(hw), 'handler-watch : modération Leboncoin = mail pour un client payant ou en essai seulement, un par compte');
const od = lire('supabase/functions/ops-digest/index.ts');
ok(/if \(!mailNico\("ops_digest\.recapitulatif"\)\) \{/.test(od) && /alerte: "ops_digest\.recapitulatif", cle: jour, journaliser: true/.test(od), 'ops-digest : le récapitulatif n’est plus envoyé, son objet est journalisé (une ligne par jour)');
ok(od.indexOf('const problemes = await mailsDesVraisProblemes(') > 0 && od.indexOf('const problemes = await mailsDesVraisProblemes(') < od.indexOf('if (total === 0) {'),
  'ops-digest : les vrais problèmes (achat Apple non crédité, file arrêtée d’un client payant) partent, même un jour « propre »');
const vc = lire('supabase/functions/veille-cpu/index.ts');
ok(/if \(!mailNico\("veille\.cpu"\)\) \{/.test(vc) && /if \(mailNico\("veille\.ventes_prouvees"\) && resendKey\)/.test(vc) && /await admin\.from\("veille_cpu_alertes"\)\.insert/.test(vc) && /await admin\.from\("ventes_prouvees_alertes"\)\.insert/.test(vc),
  'veille-cpu : CPU et ventes prouvées = journal au même rythme, aucun mail');
ok(/const cloud = await veillerServeursCloud\(admin, maintenant\);/.test(vc) && /alerte: "veille\.cloud_panne"/.test(vc), 'veille-cpu : le serveur Cloud muet avec des clients = un mail par panne');
ok(/if \(mailNico\("expirations_secrets\.echeance"\) && resendKey\)/.test(lire('supabase/functions/expirations-secrets/index.ts')), 'expirations-secrets : échéances = journal (la table), aucun mail');
const tu = lire('supabase/functions/email-tunnel/index.ts');
ok(/alerte: "paiement\.echoue", cle: cleF/.test(tu) && /const opsOk = nicoF\.mail \? \(await envoyer\(/.test(tu), 'email-tunnel : paiement échoué = un mail à Nico par facture');
ok(/alerte: "paiement\.remboursement", cle: cleR/.test(tu) && /alerte: "paiement\.deux_abonnements", journaliser: true/.test(tu), 'email-tunnel : remboursement gardé (un par référence) ; deux abonnements coupé (journal)');
ok(/a\.motif === "notification_inconnue" \? "paiement\.notification_inconnue" : "paiement\.non_credite"/.test(tu) && /motif: "notification_inconnue",/.test(lire('supabase/functions/_shared/payment-notify.ts')),
  'email-tunnel : paiement reçu gardé, non crédité gardé (un par transaction), notification inconnue coupée');
ok(/if \(!mailNico\(`cloud\.\$\{e\.evenement\}`\)\) \{ ligne\.resultat = 'coupee'; continue; \}/.test(lire('supabase/functions/_shared/cloud-alerte-nico.js')), 'Cloud : seul le paiement part (essai, arrêt : registre seulement)');
ok(/if \(!mailNico\('cloud\.zero_connexion'\)\) \{ bilan\.coupes \+= 1; continue; \}/.test(lire('supabase/functions/_shared/cloud-alerte-connexion.js')), 'Cloud : « 0 plateforme connectée » coupé (registre seulement)');
// Tout expéditeur direct (Resend) passe par la règle, sauf ce qui n'est pas une alerte (message d'un client, transfert de
// support@ vers la boîte de Nico, la porte d'envoi des mails clients).
const HORS_CHAMP = new Set(['supabase/functions/send-bug-report/index.ts', 'supabase/functions/support-mail/index.ts', 'supabase/functions/_shared/desinscription.ts']);
const directs = fichiers.filter((f) => f.startsWith('supabase/functions/') && /api\.resend\.com/.test(lire(f)));
const sansRegle = directs.filter((f) => !HORS_CHAMP.has(f) && !/from "\.\.\/_shared\/alertes-nico\.js"/.test(lire(f)));
ok(directs.length >= 7 && sansRegle.length === 0, `chaque expéditeur direct d'alertes passe par la règle (${directs.length} lus) ${sansRegle.join(', ')}`);
// Les mails CLIENTS ne changent pas : le mail client d'un paiement échoué part avant la décision Nico, inchangé.
ok(tu.indexOf('categorie: "support",\n        dedup: "reservation",') > 0 && tu.indexOf('categorie: "support",\n        dedup: "reservation",') < tu.indexOf('alerte: "paiement.echoue"'), 'paiement échoué : le mail CLIENT part comme avant (avant la décision Nico)');

console.log(`✓ selftest:alertes-nico — ${n} contrôles verts`);
