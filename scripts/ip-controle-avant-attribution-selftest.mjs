// VERROU (19/11/2026 soir, décisions de Nico) — LE CONTRÔLE AVANT ATTRIBUTION D'IP, côté orchestrateur et règles.
//   1. Aucune IP donnée à un compte sans un contrôle de santé RÉUSSI juste avant (60 min, après sa libération et sa
//      livraison) : miroir JS de cloud_ip_controlee_avant_attribution / cloud_ip_attribuer (migration 20261119230000).
//   2. Un compte qui attend : l'orchestrateur contrôle SON IP au repos, SA réservation, puis la meilleure disponible ;
//      la 1re qui échoue → la suivante ; déjà contrôlée → servi tout de suite.
//   3. Avant le renouvellement d'une IP TENUE : sa SORTIE seule (aucune page de plateforme), un échec RELU = pas renouvelée ;
//      un refus PROUVÉ = pas renouvelée ; eBay n'entre jamais dans le contrôle.
//   4. Une IP grillée sur sa SORTIE (hébergeur, proxy, pays — les 80, 81, 82, 88, 89) ne revient jamais : ni attribuée, ni
//      renouvelée, plus recontrôlée ; une grillée sur une plateforme seule garde la règle du 14/11.
//   5. Alerte immédiate au PREMIER blocage de plateforme lié à une IP (une clé par IP et par plateforme).
//   6. Chaque commande IPRoyal porte « Extra Requirements » ; sans la question au catalogue, rien n'est acheté.
// Rouge sur e331f8e (fonctions absentes), vert après.
import { readFileSync, existsSync } from 'node:fs';
import * as R from '../supabase/functions/_shared/cloud-pool.js';
import { creerEntretien } from '../serveur-cloud/src/entretien.js';
import { creerSante } from '../serveur-cloud/src/sante.js';
import * as IPR from '../serveur-cloud/src/iproyal.js';

let echecs = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };
const titre = (t) => console.log(t);
const T = Date.parse('2026-11-20T10:00:00Z');
const MIN = 60_000, H = 3_600_000, J = 86_400_000;
const iso = (t) => new Date(t).toISOString();
const saine = (depuisMin) => ({ verdict: 'saine', le: iso(T - depuisMin * MIN), saine_le: iso(T - depuisMin * MIN), echecs: [] });
const dispo = (id, x = {}) => ({ id, ip: `10.9.0.${id}`, port: 12323, etat: 'disponible', expire_le: iso(T + 25 * J), attributions: 0, refus: {}, livree_le: iso(T - 10 * J), ...x });
const ex = (f) => { try { return f(); } catch (e) { return e; } };
const fn = (n) => typeof R[n] === 'function';

titre('1. Contrôlée juste avant l\'attribution (miroir de la migration 20261119230000)');
ok(fn('controleeAvantAttribution'), 'controleeAvantAttribution existe');
if (fn('controleeAvantAttribution')) {
  ok(R.controleeAvantAttribution(dispo(1, { sante: saine(10) }), T) === true, 'saine il y a 10 min → oui');
  ok(R.controleeAvantAttribution(dispo(1, { sante: saine(61) }), T) === false, 'saine il y a 61 min → non (60 min au plus)');
  ok(R.controleeAvantAttribution(dispo(1, { sante: saine(10), liberee_le: iso(T - 5 * MIN) }), T) === false, 'contrôle d\'AVANT la libération (retour du repos) → non');
  ok(R.controleeAvantAttribution(dispo(1, { sante: saine(10), livree_le: iso(T - 5 * MIN) }), T) === false, 'contrôle d\'avant la livraison (adresse remplacée) → non');
  ok(R.controleeAvantAttribution(dispo(1, { sante: { ...saine(10), verdict: 'suspecte' } }), T) === false, 'suspecte → non');
  ok(R.controleeAvantAttribution(dispo(1), T) === false, 'jamais contrôlée (la 39) → non');
  const pool = [dispo(39), dispo(90, { sante: saine(20) })];
  ok(R.choisirIp(pool, { userId: 'u', maintenant: T, controleAvant: true })?.id === 90, 'attribution : la contrôlée (90), jamais la 39 sans contrôle');
  ok(R.choisirIp([dispo(39)], { userId: 'u', maintenant: T, controleAvant: true }) === null, 'aucune contrôlée → null (« une place se prépare »)');
  const repos = { ...dispo(4), etat: 'repos', dernier_user_id: 'u', liberee_le: iso(T - 2 * J), sante: saine(3 * 24 * 60) };
  ok(R.choisirIp([repos], { userId: 'u', maintenant: T, controleAvant: true }) === null, 'même SA propre IP au repos : pas sans un contrôle juste avant');
  ok(R.choisirIp([{ ...repos, sante: saine(5) }], { userId: 'u', maintenant: T, controleAvant: true })?.id === 4, 'son IP au repos contrôlée juste avant → la sienne');
}

titre('2. Le compte qui attend : quelle IP contrôler');
ok(fn('ipAControlerAvantAttribution'), 'ipAControlerAvantAttribution existe');
if (fn('ipAControlerAvantAttribution')) {
  const att = [{ user_id: 'u', nature: 'client', reserve_ip: null }];
  const repos = { ...dispo(4), etat: 'repos', dernier_user_id: 'u', liberee_le: iso(T - 2 * J) };
  ok(R.ipAControlerAvantAttribution([dispo(90), repos], att, { maintenant: T })?.ip.id === 4, 'son IP au repos d\'abord');
  ok(R.ipAControlerAvantAttribution([dispo(39), dispo(90, { expire_le: iso(T + 20 * J) })], [{ ...att[0], reserve_ip: 39 }], { maintenant: T })?.raison === 'sa_reservation',
    'puis SA réservation');
  const echouee = dispo(90, { expire_le: iso(T + 20 * J), sante: { verdict: 'suspecte', le: iso(T - 10 * MIN), suspecte_le: iso(T - 10 * MIN), echecs: ['vinted'], saine_le: null } });
  ok(R.ipAControlerAvantAttribution([echouee, dispo(39)], att, { maintenant: T })?.ip.id === 39, 'la 1re qui échoue (90, il y a 10 min) → la suivante (39)');
  ok(R.ipAControlerAvantAttribution([dispo(90, { sante: saine(5) }), dispo(39)], att, { maintenant: T })?.raison === 'deja_controlee', 'déjà contrôlée → servi tout de suite');
  const grillees = [80, 81, 82, 88, 89].map((id) => dispo(id, { sante: { verdict: 'grillee', le: iso(T - 2 * H), grillee_le: iso(T - 2 * H), echecs: ['sortie:hebergeur'] } }));
  // (20/11/2026, décision de Nico) Hébergeur / proxy ne sont plus des motifs : ces grillées-là sont proposées au contrôle ;
  // la grillée sur le PAYS (la 82, Royaume-Uni) ne l'est jamais.
  ok([80, 81, 88, 89].includes(R.ipAControlerAvantAttribution(grillees.filter((g) => g.id !== 82), att, { maintenant: T })?.ip.id), '(20/11) grillées hébergeur seulement (80, 81, 88, 89) : proposées au contrôle');
  const g82 = dispo(82, { sante: { verdict: 'grillee', le: iso(T - 2 * H), grillee_le: iso(T - 2 * H), echecs: ['sortie:pays'] } });
  ok(R.ipAControlerAvantAttribution([g82], att, { maintenant: T }) === null, 'grillée sur le pays (82) : jamais proposée');
  ok(R.ipAControlerAvantAttribution([dispo(39)], att, { maintenant: T, enUsage: [39] }) === null, 'une IP en usage : jamais');
  ok(R.ipAControlerAvantAttribution([dispo(39)], att, { maintenant: T, permise: () => false }) === null, 'une sortie fermée par le pare-feu : jamais');
}

titre('3. Avant le renouvellement d\'une IP tenue : la sortie seule, un échec relu');
const tenue = (x = {}) => ({ ...dispo(3), etat: 'attribuee_client', user_id: 'c', dernier_user_id: 'c', attribuee_le: iso(T - 20 * J), expire_le: iso(T + 2 * J), ...x });
const planDe = (ip) => R.planDuJour({ ips: [ip], lambda: 0, maintenant: T });
ok(fn('controleRenouvellementSuivant') && fn('verdictRenouvellement') && fn('choisirSortieAControler'), 'fonctions du renouvellement présentes');
if (fn('controleRenouvellementSuivant')) {
  const lu1 = { fait_le: iso(T - 40 * MIN), echecs: ['sortie:pays'], inconnus: [], resume: {} };
  const c1 = R.controleRenouvellementSuivant(tenue(), lu1);
  ok(c1.confirme === false && c1.echecs.join() === 'sortie:pays', '1er échec : noté, PAS encore relu');
  ok(planDe(tenue({ controle_renouvellement: c1 })).renouveler.includes(3), 'un échec pas relu : renouvelée (jamais couper un client sur une lecture)');
  ok(R.choisirSortieAControler([tenue({ controle_renouvellement: c1 })], { maintenant: T })?.raison === 'echec_a_relire', 'l\'échec est relu 30 min plus tard');
  const c2 = R.controleRenouvellementSuivant(tenue({ controle_renouvellement: c1 }), { fait_le: iso(T), echecs: ['sortie:pays'], inconnus: [] });
  ok(c2.confirme === true, 'même échec relu 40 min plus tard → confirmé');
  const p2 = planDe(tenue({ controle_renouvellement: c2 }));
  ok(p2.laisserExpirer.includes(3) && p2.raisons[3] === 'sortie_echouee', 'sortie relue en échec → PAS renouvelée (sortie_echouee)');
  const okc = R.controleRenouvellementSuivant(tenue(), { fait_le: iso(T), echecs: [], inconnus: [] });
  ok(planDe(tenue({ controle_renouvellement: okc })).renouveler.includes(3), 'sortie bonne → renouvelée');
  ok(planDe(tenue()).renouveler.includes(3), 'aucun contrôle (migration absente) → renouvelée comme avant');
  const pr = planDe(tenue({ refus: { vinted: { prouvee: true, le: iso(T - J) } } }));
  ok(pr.laisserExpirer.includes(3) && pr.raisons[3] === 'refus_prouve_titulaire', 'refus PROUVÉ → pas renouvelée');
  const pas = R.controleRenouvellementSuivant(tenue(), { fait_le: iso(T), echecs: ['vinted', 'ebay', 'sortie:pays'], inconnus: ['leboncoin'] });
  ok(pas.echecs.join() === 'sortie:pays' && pas.inconnus.length === 0, 'seuls les codes de SORTIE comptent (aucune plateforme, jamais eBay)');
  ok(R.choisirSortieAControler([tenue({ expire_le: iso(T + 6 * J) })], { maintenant: T }) === null, 'échéance à 6 jours : pas encore (4 jours avant)');
  ok(R.choisirSortieAControler([dispo(90, { expire_le: iso(T + J) })], { maintenant: T }) === null, 'une IP libre : jamais par ce contrôle (la santé complète s\'en charge)');
  const vieux = R.controleRenouvellementSuivant(tenue(), { fait_le: iso(T - 30 * J), echecs: ['sortie:proxy'], inconnus: [] });
  ok(!R.controleRenouvellementValable(tenue({ controle_renouvellement: { ...vieux, confirme: true } })), 'un contrôle d\'avant l\'attribution / hors fenêtre ne compte pas');
}

titre('4. (20/11/2026, décision de Nico) Seul le PAYS est définitif ; hébergeur / proxy en information (80, 81, 88, 89)');
ok(fn('grilleeSurSortie'), 'grilleeSurSortie existe');
if (fn('grilleeSurSortie')) {
  const g80 = { verdict: 'grillee', le: iso(T - 13 * H), grillee_le: iso(T - 3 * J), echecs: ['sortie:hebergeur'], recontroles: 3 };
  const apres = R.santeSuivante(g80, { fait_le: iso(T), echecs: [], inconnus: [] });
  ok(apres.verdict === 'saine' && apres.echecs.length === 0 && apres.definitive !== true, 'grillée hébergeur seulement : un contrôle qui passe la rend saine');
  ok(R.santeSuivante(g80, { fait_le: iso(T), echecs: ['sortie:hebergeur', 'sortie:proxy'], inconnus: [] }).verdict === 'saine', 'un ancien code hébergeur / proxy relu n\'est plus un échec');
  const g81 = { verdict: 'grillee', le: iso(T - 13 * H), grillee_le: iso(T - 3 * J), echecs: ['depop', 'sortie:hebergeur', 'sortie:proxy'] };
  ok(R.santeSuivante(g81, { fait_le: iso(T), echecs: ['depop'], inconnus: [] }).verdict === 'grillee', 'grillée sur une plateforme (Depop) relue : reste grillée');
  ok(R.choisirIpASonder([dispo(80, { sante: g80 })], { maintenant: T })?.raison === 'regle_du_20_11', 'verdict sans motif : recontrôlée tout de suite');
  ok(R.choisirIpASonder([dispo(80, { sante: g80 }), dispo(81, { sante: { verdict: 'suspecte', le: iso(T - H), suspecte_le: iso(T - H), echecs: ['vinted'] } })], { maintenant: T })?.ip.id === 80, 'avant même une confirmation');
  ok(!R.grillee(dispo(80, { sante: g80 })) && R.santeConnue(dispo(80, { sante: g80 }), T) === 'inconnue', 'jamais écartée sur hébergeur / proxy : « à recontrôler »');
  const g82 = { verdict: 'grillee', le: iso(T - 13 * H), grillee_le: iso(T - 3 * J), echecs: ['sortie:pays'], recontroles: 3 };
  const apres82 = R.santeSuivante(g82, { fait_le: iso(T), echecs: [], inconnus: [] });
  ok(apres82.verdict === 'grillee' && apres82.definitive === true && apres82.echecs.includes('sortie:pays'), 'grillée sur le PAYS (82, Royaume-Uni) : définitive');
  ok(R.choisirIpASonder([dispo(82, { sante: g82 })], { maintenant: T }) === null, 'la 82 : plus jamais recontrôlée');
  const gp = { verdict: 'grillee', le: iso(T - 13 * H), grillee_le: iso(T - 3 * J), echecs: ['vinted'], recontroles: 3 };
  ok(R.santeSuivante(gp, { fait_le: iso(T), echecs: [], inconnus: [] }).verdict === 'saine', 'grillée sur une PLATEFORME seule : revient saine (règle du 14/11 gardée)');
  const p = R.planDuJour({ ips: [dispo(89, { sante: g82, expire_le: iso(T + J) })], lambda: 0, maintenant: T, sainesSeulement: true });
  ok(p.laisserExpirer.includes(89) && !p.renouveler.includes(89), 'grillée sur le pays : jamais renouvelée');
  ok(!R.ipAttribuable(dispo(88, { sante: g82 }), { maintenant: T }), 'grillée sur le pays : jamais attribuable');
  const tenueNtt = { ...dispo(40), etat: 'attribuee_client', user_id: 'u', attribuee_le: iso(T - 20 * J), expire_le: iso(T + 2 * J),
    controle_renouvellement: { fait_le: iso(T - H), echecs: ['sortie:hebergeur', 'sortie:proxy'], inconnus: [], confirme: true } };
  ok(R.verdictRenouvellement(tenueNtt) === 'ok', 'IP d\'un client (NTT) : hébergeur / proxy confirmés n\'empêchent plus le renouvellement');
  // (20/11) Un verdict sans motif relu sans conclusion (Beebs 406, comme 81 et 88) : « inconnue », plus jamais « sans motif »
  // (sinon recontrôlée à chaque tour) ; relu avec un vrai échec : suspecte ; la trace d'avant gardée.
  const g88 = { verdict: 'grillee', le: iso(T - 13 * H), grillee_le: iso(T - 3 * J), echecs: ['sortie:hebergeur', 'sortie:proxy'], saine_le: iso(T - 5 * J) };
  const muet = R.santeSuivante(g88, { fait_le: iso(T), echecs: [], inconnus: ['beebs'] });
  ok(muet.verdict === 'inconnue' && muet.echecs.length === 0 && muet.saine_le === null && !R.verdictSansMotif(muet) && muet.verdict_retire?.verdict === 'grillee',
    '(20/11) sans motif + Beebs indéterminé : inconnue, jamais l\x27ancien verdict, la trace gardée', JSON.stringify(muet));
  ok(R.choisirIpASonder([dispo(88, { sante: { ...muet, le: iso(T - 5 * MIN) } })], { maintenant: T }) === null, '(20/11) relue à l\x27instant : pas recontrôlée à chaque tour');
  ok(R.santeSuivante(g88, { fait_le: iso(T), echecs: ['vinted'], inconnus: [] }).verdict === 'suspecte', '(20/11) sans motif + un vrai échec : suspecte');
}

titre('5. L\'orchestrateur : contrôle juste avant l\'attribution, sortie seule avant renouvellement');
const journal = { info() {}, alerte() {}, erreur() {} };
function fausseBase({ ips, attendus = [] }) {
  const appels = [];
  return {
    appels,
    async rpc(nom, a) {
      appels.push([nom, a]);
      if (nom === 'cloud_ip_attendus') return { data: attendus, error: null };
      if (nom === 'cloud_proxy_identifiants') return { data: `http://u:mdp@10.9.0.${a.p_ip}:12323`, error: null };
      if (nom === 'cloud_ip_sante_noter') return { data: { ok: true, avant: null }, error: null };
      if (nom === 'cloud_ip_controle_renouvellement_noter') return { data: { ok: true }, error: null };
      if (nom === 'cloud_compte_synchroniser_pool') return { data: { action: 'attribuer', ip: a.p_user }, error: null };
      return { data: null, error: null };
    },
    from() { const q = { select() { return q; }, eq() { return q; }, then(r, k) { return Promise.resolve({ data: ips, error: null }).then(r, k); } }; return q; },
  };
}
const pareFeu = (ips) => ({ async appliquees() { return { ports: null, sorties: new Set(ips.map((i) => `${i.ip}:12323`)) }; }, async synchroniser() { return {}; } });
const monter = ({ ips, attendus, verifier, verifierSortie, alertes = null }) => creerEntretien({ config: { entretienPool: true }, base: fausseBase({ ips, attendus }), regles: R,
  journal, iproyal: { disponible: false }, alertes, pareFeu: pareFeu(ips), navigateurs: { ouverts: () => [] }, controles: null, charge: () => 0.1,
  sante: { verifier, verifierSortie }, approvisionnement: { async gardes() { return null; } }, fournisseurIp: { async rotationActive() { return false; } } });
{
  const ips = [dispo(39), dispo(90, { expire_le: iso(Date.now() + 20 * J) })].map((i) => ({ ...i, expire_le: iso(Date.now() + 25 * J) }));
  const vus = [];
  const e = monter({ ips, attendus: [{ user_id: 'u', nature: 'essai', reserve_ip: null }],
    verifier: async (a) => { vus.push(a.ipId); return { fait_le: new Date().toISOString(), echecs: [], inconnus: [] }; } });
  ok(typeof e.controlerAvantAttribution === 'function', 'entretien.controlerAvantAttribution existe');
  if (typeof e.controlerAvantAttribution === 'function') {
    const r = await e.controlerAvantAttribution();
    ok(vus.length === 1 && r.verdict === 'saine', `un compte attend : UNE IP contrôlée (santé complète), verdict écrit (${JSON.stringify(r).slice(0, 90)})`);
    const vides = monter({ ips, attendus: [], verifier: async () => { throw new Error('aucun contrôle'); } });
    ok((await vides.controlerAvantAttribution()).rien === true, 'personne n\'attend : aucun contrôle');
    const sert = monter({ ips: [dispo(90, { sante: { ...saine(0), le: iso(Date.now() - MIN), saine_le: iso(Date.now() - MIN) }, expire_le: iso(Date.now() + 25 * J) })],
      attendus: [{ user_id: 'u', nature: 'essai' }], verifier: async () => { throw new Error('aucun contrôle'); } });
    const rs = await sert.controlerAvantAttribution();
    ok(rs.raison === 'deja_controlee' && rs.servi != null, 'déjà contrôlée : servi tout de suite (cloud_compte_synchroniser_pool)');
  }
  const exp = Date.now() + 2 * J;
  const ipsT = [{ ...dispo(3), etat: 'attribuee_client', user_id: 'c', attribuee_le: iso(Date.now() - 20 * J), expire_le: iso(exp), controle_renouvellement: null }];
  const alertes = [];
  let sortiesLues = 0;
  const e2 = monter({ ips: ipsT, verifier: async () => { throw new Error('JAMAIS la santé complète sur l\'IP d\'un client'); },
    verifierSortie: async () => { sortiesLues++; return { fait_le: new Date().toISOString(), echecs: ['sortie:pays'], inconnus: [] }; },
    alertes: { async signaler(n, t) { alertes.push(t); } } });
  ok(typeof e2.controlerSortieAvantRenouvellement === 'function', 'entretien.controlerSortieAvantRenouvellement existe');
  if (typeof e2.controlerSortieAvantRenouvellement === 'function') {
    const r2 = await e2.controlerSortieAvantRenouvellement();
    ok(sortiesLues === 1 && r2.ip_id === 3 && r2.confirme === false, 'IP tenue à J-2 : sa SORTIE seule lue, échec noté (pas encore relu)');
  }
}
{
  // sante.verifierSortie : aucune page de plateforme, Chrome jamais piloté.
  const gestes = [];
  const docker = { async creer(n) { gestes.push(['creer', n]); }, async demarrer() {}, async inspecter() { return {}; }, async supprimer(n) { gestes.push(['supprimer', n]); } };
  const s = creerSante({ config: { reseauDocker: 'r' }, docker, journal, pareFeu: async () => ({ ok: true }),
    connecter: async () => { throw new Error('Chrome piloté : interdit'); }, horloge: { maintenant: () => Date.now(), attendre: async () => {} },
    executer: async (nom, cmd) => (String(cmd.at(-1)).includes('ip-api')
      ? JSON.stringify({ status: 'success', query: '10.9.0.3', countryCode: 'FR', hosting: true, proxy: false })
      : JSON.stringify({ ip: '10.9.0.3', country: 'FR' })) });
  ok(typeof s.verifierSortie === 'function', 'sante.verifierSortie existe');
  if (typeof s.verifierSortie === 'function') {
    const r = await s.verifierSortie({ ipId: 3, ip: '10.9.0.3', proxyUrl: 'http://u:p@10.9.0.3:12323' });
    ok(r.echecs.length === 0 && r.inconnus.length === 0, '(20/11) hébergeur lu à travers l\x27IP : en information, jamais un échec', JSON.stringify(r));
    ok(gestes.at(-1)?.[0] === 'supprimer', 'le conteneur jetable est supprimé après');
  }
}

titre('6. Alerte au premier blocage, une clé par IP et par plateforme');
{
  const src = readFileSync(new URL('../serveur-cloud/src/verifications.js', import.meta.url), 'utf8');
  const bloc = src.slice(src.indexOf('async function noterRefusIp'), src.indexOf('async function revenue'));
  ok(/alertes\?\.signaler\(/.test(bloc) && /premier blocage/.test(bloc), 'noterRefusIp prévient l\'équipe dès le 1er accès restreint');
  ok(/cle: `ip:\$\{data\.ip_id\}\|\$\{b\.plateforme\}`/.test(bloc) && /orchestrateur\.plateforme_arretee/.test(bloc), 'clé ip:<id>|<plateforme> (un mail par IP et par incident)');
}

titre('7. (20/11 18:09, décision de Nico) IPRoyal : la commande STANDARD, sans « Extra Requirements »');
ok(typeof IPR.corpsCommande === 'function' && IPR.EXIGENCES_IP === undefined, 'corpsCommande existe ; plus aucune consigne d’exigences');
if (typeof IPR.corpsCommande === 'function') {
  const produits = [{ id: 9, name: 'ISP Dedicated', plans: [{ id: 22, name: '30 Days', price: 4 }], locations: [{ id: 25, name: 'France' }],
    questions: [{ id: 7, name: 'Extra Requirements' }] }];
  const cat = IPR.lireCatalogueIsp(produits);
  const corps = IPR.corpsCommande(cat, 1);
  ok(JSON.stringify(corps) === JSON.stringify({ product_id: 9, product_plan_id: 22, product_location_id: 25, quantity: 1, auto_extend: false }),
    'ISP Dedicated, France, 30 jours, sans product_question_answers (livrée tout de suite)', JSON.stringify(corps));
  ok(IPR.commandePerdue?.({ status: 'refunded' }) === true && IPR.commandePerdue({ status: 'confirmed' }) === false && IPR.commandePerdue({ status: 'in-progress' }) === false
    && IPR.commandePerdue({}) === false, 'une commande remboursée est perdue (close en échec) ; une confirmée ou en cours ne l’est pas');
  ok(corps.card_id === undefined && corps.auto_extend === false, 'toujours par le SOLDE, sans renouvellement automatique');
  const sans = IPR.lireCatalogueIsp([{ ...produits[0], questions: [] }]);
  ok(IPR.corpsCommande(sans, 1).product_id === 9, 'sans la question au catalogue : l’achat part quand même');
  const fetchAvant = globalThis.fetch;
  const envoyes = [];
  globalThis.fetch = async (u, o) => { envoyes.push(o?.body ? JSON.parse(o.body) : null); return { ok: true, json: async () => ({ id: 123 }) }; };
  try {
    await IPR.creerIproyal({ jeton: 'x', achatsAutorises: true, journal }).commander(1, cat);
    ok(envoyes[0] && !('product_question_answers' in envoyes[0]), 'commander n’envoie aucune exigence à POST /orders', JSON.stringify(envoyes[0]));
  } finally { globalThis.fetch = fetchAvant; }
}

titre('8. La migration et son inverse');
const mig = new URL('../supabase/migrations/20261119230000_cloud_ip_controle_avant_attribution.sql', import.meta.url);
const inv = new URL('../supabase/rollbacks/20261119230000_cloud_ip_controle_avant_attribution_INVERSE.sql', import.meta.url);
ok(existsSync(mig) && existsSync(inv), 'migration 20261119230000 et son inverse présentes');
if (existsSync(mig)) {
  const m = readFileSync(mig, 'utf8');
  ok(/6c56aac90065aa2366c3d717315af904/.test(m) && /46db9ef1c9861d713a4574b684e8244d/.test(m) && m.includes('md5(replace(pg_get_functiondef'), 'gardes (sans retours chariot) : corps de prod relus (md5)');
  ok(/cloud_ip_controlee_avant_attribution\(i\)/.test(m) && /cloud_ip_attendus/.test(m) && /controle_renouvellement/.test(m), 'attribution, attendus, contrôle de renouvellement');
  ok(!/ebay/i.test(m.replace(/--.*$/gm, '')), 'eBay n\'entre jamais dans le contrôle (code SQL)');
}

console.log(echecs ? `✗ ip-controle-avant-attribution : ${total - echecs}/${total}` : `✓ ip-controle-avant-attribution : ${total}/${total}`);
process.exit(echecs ? 1 : 0);
