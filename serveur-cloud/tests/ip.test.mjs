// (03/11, point 2 de Nico) L'APPROVISIONNEMENT AUTOMATIQUE DES IP — sans réseau ni base : faux IPRoyal, fausse base.
// Achat et renouvellement sous la TRIPLE garde (serveur, interrupteur, plafond), solde insuffisant, livraison, pare-feu
// dynamique (liste écrite, preuve lue, script de l'hôte joué avec de faux iptables), refus par plateforme, verdict de la
// visite de contrôle, rotation sans partage simultané.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as regles from '../../supabase/functions/_shared/cloud-pool.js';
import { lireCatalogueIsp, prixDeCalcul, proxiesLivres, creerIproyal } from '../src/iproyal.js';
import { creerApprovisionnement, dateIproyal, grouperParCommande } from '../src/approvisionnement.js';
import { sortiesDuPool, texteSorties, lireSorties, sortiesAppliquees, sortieOuverte, creerPareFeu } from '../src/pareFeu.js';
import { verdictVisite, ACCUEILS_CONTROLE } from '../src/controle.js';
import { ipDuPool } from '../src/fournisseurIp.js';

const journal = { info() {}, alerte() {}, erreur() {} };
const J = 86_400_000;
const T0 = Date.parse('2026-11-03T12:00:00Z');
const iso = (t) => new Date(t).toISOString();

// Le catalogue tel que lu le 03/11 (GET /products, réduit).
const CATALOGUE = [
  { id: 3, name: 'Datacenter Dedicated', plans: [{ id: 5, name: '30 Days', price: 1.8 }], locations: [{ id: 1, name: 'France' }] },
  { id: 9, name: 'ISP Dedicated', plans: [{ id: 23, name: '1 Day (24 hours)', price: 2 }, { id: 22, name: '30 Days', price: 4, min_quantity: 1 }],
    locations: [{ id: 2, name: 'Europe', child_locations: [{ id: 25, name: 'France' }, { id: 26, name: 'Germany' }] }] },
];

test('catalogue : ISP Dedicated / 30 Days / France lus, jamais supposés ; prix et livraison lus', () => {
  assert.deepEqual(lireCatalogueIsp(CATALOGUE), { produitId: 9, planId: 22, lieuId: 25, prixUnitaireUsd: 4, minQuantite: 1 });
  assert.throws(() => lireCatalogueIsp(CATALOGUE.slice(0, 1)), /illisible/);
  assert.throws(() => lireCatalogueIsp([{ ...CATALOGUE[1], locations: [{ id: 25, name: 'France', out_of_stock: true }] }]), /épuisée/);
  assert.equal(prixDeCalcul({ price: 29.4, price_with_vat: 29.4 }), 29.4);
  assert.ok(Number.isNaN(prixDeCalcul({})));
  assert.deepEqual(proxiesLivres({ proxy_data: { ports: { 'http|https': 12323 }, proxies: [{ ip: '1.2.3.4', username: 'x', password: 'y' }, { ip: 'pas-une-ip' }] } }), [{ ip: '1.2.3.4', port: 12323 }]);
  assert.deepEqual(proxiesLivres({ status: 'in-progress' }), []);
});

test('IPRoyal : commander et prolonger REFUSÉS sans IPROYAL_ACHATS_AUTORISES (aucun appel réseau)', async () => {
  const sans = creerIproyal({ jeton: 'x', achatsAutorises: false, journal });
  assert.equal(sans.achatsAutorises, false);
  await assert.rejects(sans.commander(1, { produitId: 9, planId: 22, lieuId: 25 }), /REFUSÉ/);
  await assert.rejects(sans.prolonger('84458881', 22), /REFUSÉE/);
});

test('dépense : la triple garde, dans l’ordre — serveur, interrupteur, plafond, solde', () => {
  const base = { montantUsd: 29.4, envAutorise: true, interrupteur: true, budgetUsd: 60, depenseMoisUsd: 0, soldeUsd: 50 };
  assert.deepEqual(regles.deciderDepense(base), { faire: true, raison: 'ok' });
  assert.equal(regles.deciderDepense({ ...base, envAutorise: false }).raison, 'achats_coupes_serveur');
  assert.equal(regles.deciderDepense({ ...base, interrupteur: false }).raison, 'interrupteur_coupe');
  assert.equal(regles.deciderDepense({ ...base, depenseMoisUsd: 40 }).raison, 'plafond', '40 + 29,40 > 60');
  assert.equal(regles.deciderDepense({ ...base, budgetUsd: 0 }).raison, 'plafond', 'plafond nul = rien');
  assert.equal(regles.deciderDepense({ ...base, soldeUsd: 7.15 }).raison, 'solde_insuffisant');
  assert.equal(regles.deciderDepense({ ...base, montantUsd: NaN }).raison, 'prix_illisible');
  assert.equal(regles.soldeCouvre(3.15, 4), false);
  assert.equal(regles.soldeCouvre(7.15, 4), true);
});

// Une fausse base : rpc et lectures de cloud_ip_commandes, avec un registre des appels.
function fausseBase({ params = {}, depense = 0, ouvrir = { ok: true, id: 101 }, enCours = [] } = {}) {
  const appels = [];
  return {
    appels,
    async rpc(nom, a) {
      appels.push([nom, a]);
      if (nom === 'cloud_param') return { data: params[a.p_cle] ?? a.p_defaut, error: null };
      if (nom === 'cloud_ip_depenses_mois') return { data: depense, error: null };
      if (nom === 'cloud_ip_depense_ouvrir') return { data: ouvrir, error: null };
      if (nom === 'cloud_ip_ajouter') return { data: 50 + appels.filter((x) => x[0] === 'cloud_ip_ajouter').length, error: null };
      return { data: true, error: null };
    },
    from() {
      const q = { select() { return q; }, eq() { return q; }, in() { return q; },
        then(r) { return Promise.resolve({ data: enCours, error: null }).then(r); } };
      return q;
    },
  };
}
function fauxIproyal({ achatsAutorises = true, prix = 29.4, livree = null } = {}) {
  const gestes = [];
  return {
    gestes, disponible: true, achatsAutorises,
    async catalogueIsp() { return lireCatalogueIsp(CATALOGUE); },
    async prixCommande(n) { gestes.push(['prix', n]); return prix; },
    async commander(n, cat) { gestes.push(['commander', n, cat.planId]); return { id: 99001 }; },
    async prolonger(c, plan) { gestes.push(['prolonger', c, plan]); return { expire_date: '2026-12-04 12:57:45' }; },
    async lireCommande(c) { gestes.push(['lire', c]); return livree ?? { status: 'in-progress', proxy_data: { proxies: [] } }; },
    urlProxy(cmd, ip) { return `http://u:p@${ip}:12323`; },
  };
}
const plan = { renouveler: [], aCommander: 3, vise: 3, projete: 0 };

test('achat : interrupteurs COUPÉS (état du 03/11) → aucune commande, une PROPOSITION', async () => {
  const base = fausseBase();
  const iproyal = fauxIproyal({ achatsAutorises: false });
  const dits = [];
  const a = creerApprovisionnement({ base, iproyal, regles, journal, alertes: { async signaler(n, t) { dits.push(t); } }, attendreLivraisonMs: 0 });
  const g = await a.gardes();
  assert.deepEqual([g.envAutorise, g.achatsAuto, g.renouvAuto], [false, false, false]);
  const r = await a.acheter(plan, g, { montant: 50 });
  assert.equal(r.fait, false); assert.equal(r.raison, 'achats_coupes_serveur');
  assert.ok(!iproyal.gestes.some((x) => x[0] === 'commander'), 'aucune commande');
  assert.ok(!base.appels.some((x) => x[0] === 'cloud_ip_depense_ouvrir'), 'rien au registre');
  assert.ok(dits.some((t) => /^Proposition/.test(t)));
  // Serveur autorisé mais interrupteur de la base à 0 : toujours rien.
  const a2 = creerApprovisionnement({ base: fausseBase(), iproyal: fauxIproyal(), regles, journal, alertes: null, attendreLivraisonMs: 0 });
  assert.equal((await a2.acheter(plan, await a2.gardes(), { montant: 50 })).raison, 'interrupteur_coupe');
});

test('achat : garde ouverte → registre AVANT la commande, puis commande de N IP (une seule), livraison relue', async () => {
  const base = fausseBase({ params: { ip_achats_auto: 1, ip_budget_mensuel_usd: 60 } });
  const iproyal = fauxIproyal();
  const a = creerApprovisionnement({ base, iproyal, regles, journal, alertes: null, attendreLivraisonMs: 0 });
  const g = await a.gardes();
  const solde = { montant: 50 };
  const r = await a.acheter(plan, g, solde);
  assert.equal(r.fait, true); assert.equal(r.quantite, 3);
  const ordre = base.appels.map((x) => x[0]).filter((n) => n === 'cloud_ip_depense_ouvrir' || n === 'cloud_ip_depense_fermer');
  assert.deepEqual(ordre, ['cloud_ip_depense_ouvrir', 'cloud_ip_depense_fermer']);
  assert.deepEqual(iproyal.gestes.filter((x) => x[0] === 'commander'), [['commander', 3, 22]], 'UNE commande de 3 IP, offre 30 jours');
  assert.equal(base.appels.find((x) => x[0] === 'cloud_ip_depense_fermer')[1].p_statut, 'en_cours');
  assert.equal(solde.montant, 50 - 29.4); assert.equal(g.depenseMoisUsd, 29.4);
  // Plafond déjà atteint ce mois : refusé AVANT IPRoyal.
  const b2 = fausseBase({ params: { ip_achats_auto: 1, ip_budget_mensuel_usd: 60 }, depense: 40 });
  const i2 = fauxIproyal();
  const a2 = creerApprovisionnement({ base: b2, iproyal: i2, regles, journal, alertes: null, attendreLivraisonMs: 0 });
  assert.equal((await a2.acheter(plan, await a2.gardes(), { montant: 50 })).raison, 'plafond');
  assert.ok(!i2.gestes.some((x) => x[0] === 'commander'));
  // La base refuse (verrou du plafond) même si le calcul local passait : jamais d'appel IPRoyal.
  const b3 = fausseBase({ params: { ip_achats_auto: 1, ip_budget_mensuel_usd: 60 }, ouvrir: { ok: false, raison: 'plafond' } });
  const i3 = fauxIproyal();
  const a3 = creerApprovisionnement({ base: b3, iproyal: i3, regles, journal, alertes: null, attendreLivraisonMs: 0 });
  assert.equal((await a3.acheter(plan, await a3.gardes(), { montant: 50 })).raison, 'plafond');
  assert.ok(!i3.gestes.some((x) => x[0] === 'commander'));
});

test('achat : solde IPRoyal insuffisant → alerte, aucune commande', async () => {
  const base = fausseBase({ params: { ip_achats_auto: 1, ip_budget_mensuel_usd: 60 } });
  const iproyal = fauxIproyal();
  const dits = [];
  const a = creerApprovisionnement({ base, iproyal, regles, journal, alertes: { async signaler(n, t) { dits.push(t); } }, attendreLivraisonMs: 0 });
  const r = await a.acheter(plan, await a.gardes(), { montant: 3.15 });
  assert.equal(r.raison, 'solde_insuffisant');
  assert.ok(dits.some((t) => /ne couvre pas le prochain achat/.test(t)));
  assert.ok(!iproyal.gestes.some((x) => x[0] === 'commander'));
});

test('renouvellement : une commande entière à la fois, prolonger() appelée, échéance relue en UTC', async () => {
  const ips = [{ id: 39, commande: '87284262' }, { id: 1, commande: '84458881' }, { id: 7, commande: '84458881' }];
  assert.deepEqual([...grouperParCommande([39, 1, 7], ips)], [['87284262', [39]], ['84458881', [1, 7]]]);
  assert.equal(dateIproyal('2026-12-04 12:57:45'), Date.parse('2026-12-04T12:57:45Z'), 'IPRoyal parle en UTC, sans fuseau');
  // Coupé : rien.
  const off = creerApprovisionnement({ base: fausseBase(), iproyal: fauxIproyal(), regles, journal, alertes: null });
  const r0 = await off.renouveler({ renouveler: [39] }, ips, await off.gardes(), { montant: 50 });
  assert.equal(r0[0].fait, false); assert.equal(r0[0].raison, 'interrupteur_coupe');
  // Ouvert.
  const base = fausseBase({ params: { ip_renouvellement_auto: 1, ip_budget_mensuel_usd: 60 } });
  const iproyal = fauxIproyal({ prix: 4 });
  const a = creerApprovisionnement({ base, iproyal, regles, journal, alertes: null });
  const r = await a.renouveler({ renouveler: [39, 1, 7] }, ips, await a.gardes(), { montant: 50 });
  assert.deepEqual(r.map((x) => x.fait), [true, true]);
  assert.deepEqual(iproyal.gestes.filter((x) => x[0] === 'prolonger'), [['prolonger', '87284262', 22], ['prolonger', '84458881', 22]]);
  const renouvelees = base.appels.filter((x) => x[0] === 'cloud_ip_renouvelee').map((x) => [x[1].p_ip, x[1].p_expire_le]);
  assert.deepEqual(renouvelees, [[39, '2026-12-04T12:57:45.000Z'], [1, '2026-12-04T12:57:45.000Z'], [7, '2026-12-04T12:57:45.000Z']]);
});

test('livraison : chaque IP livrée entre au pool (URL au vault par cloud_ip_ajouter), la dépense est close', async () => {
  const enCours = [{ id: 101, commande: '99001', quantite: 2, demandee_le: iso(T0), statut: 'en_cours' }];
  const base = fausseBase({ enCours });
  const iproyal = fauxIproyal({ livree: { status: 'confirmed', expire_date: '2026-12-03 12:00:00', location: 'France',
    proxy_data: { ports: { 'http|https': 12323 }, proxies: [{ ip: '10.0.0.1' }, { ip: '10.0.0.2' }] } } });
  const a = creerApprovisionnement({ base, iproyal, regles, journal, alertes: null });
  const r = await a.livrer(T0);
  assert.equal(r.livrees, 2);
  const ajouts = base.appels.filter((x) => x[0] === 'cloud_ip_ajouter').map((x) => x[1]);
  assert.deepEqual(ajouts.map((x) => [x.p_ip, x.p_port, x.p_expire_le]), [['10.0.0.1', 12323, '2026-12-03T12:00:00.000Z'], ['10.0.0.2', 12323, '2026-12-03T12:00:00.000Z']]);
  assert.equal(base.appels.find((x) => x[0] === 'cloud_ip_depense_fermer')[1].p_statut, 'livree');
  // Pas encore livrée : rien n'entre, rien ne se ferme.
  const b2 = fausseBase({ enCours });
  await creerApprovisionnement({ base: b2, iproyal: fauxIproyal(), regles, journal, alertes: null }).livrer(T0);
  assert.ok(!b2.appels.some((x) => x[0] === 'cloud_ip_ajouter' || x[0] === 'cloud_ip_depense_fermer'));
});

test('pare-feu : la liste suit le pool (vivantes, IP en usage gardées), écrite atomiquement, preuve relue', async () => {
  const ips = [
    { id: 39, ip: '176.103.182.215', port: 12323, etat: 'attribuee_client', expire_le: iso(T0 + 30 * J) },
    { id: 1, ip: '94.194.94.233', port: 12323, etat: 'disponible', expire_le: iso(T0 + 31 * J) },
    { id: 3, ip: '81.181.239.136/32', port: 12323, etat: 'rebut', expire_le: iso(T0 + 26 * J) },
    { id: 5, ip: '176.103.180.12', port: 12323, etat: 'expiree', expire_le: iso(T0 - J) },
    { id: 6, ip: '80.12.178.102', port: 12323, etat: 'expiree', expire_le: iso(T0 - J) },
    { id: 8, ip: 'n-importe-quoi', port: 12323, etat: 'disponible', expire_le: iso(T0 + J) },
  ];
  const l = sortiesDuPool(ips, { enUsage: [6], maintenant: T0 });
  assert.deepEqual(l, ['176.103.182.215:12323', '80.12.178.102:12323', '81.181.239.136:12323', '94.194.94.233:12323'],
    'expirée écartée sauf si un navigateur ouvert l’utilise encore ; adresse invalide écartée ; triée');
  assert.deepEqual(lireSorties(texteSorties(l)), l);
  assert.deepEqual(lireSorties('# x\n1.2.3.4:12323\n\n9.9.9.9:abc\n 5.6.7.8 : 12323 \n'), ['1.2.3.4:12323', '5.6.7.8:12323']);
  const ap = sortiesAppliquees('{"boot_id":"b","destinations":"176.103.182.215:12323,94.194.94.233:12323"}');
  assert.equal(sortieOuverte(ap, '94.194.94.233', 12323), true);
  assert.equal(sortieOuverte(ap, '81.181.239.136', 12323), false);
  assert.equal(sortieOuverte(sortiesAppliquees('{"destinations":"ports:12321,12323"}'), '1.1.1.1', 12323), true, 'repli par ports');
  assert.equal(sortieOuverte(sortiesAppliquees('pas du json'), '1.1.1.1', 12323), false);

  const dossier = mkdtempSync(path.join(tmpdir(), 'pf-'));
  try {
    const pf = creerPareFeu({ config: { dossierEtat: dossier }, journal, attendreMs: 40, pasMs: 10 });
    const r1 = await pf.synchroniser(ips.slice(0, 2));
    assert.equal(r1.ecrit, true);
    assert.deepEqual(lireSorties(readFileSync(path.join(dossier, 'proxys-permis.txt'), 'utf8')), ['176.103.182.215:12323', '94.194.94.233:12323']);
    assert.equal(r1.manquantes.length, 2, 'sans preuve de l’hôte : rien n’est encore ouvert');
    writeFileSync(path.join(dossier, 'pare-feu.json'), '{"boot_id":"b","destinations":"176.103.182.215:12323,94.194.94.233:12323","source":"etat"}');
    const r2 = await pf.synchroniser(ips.slice(0, 2));
    assert.equal(r2.ecrit, false, 'liste inchangée : rien réécrit (l’unité de l’hôte ne rejoue rien)');
    assert.deepEqual(r2.manquantes, []);
  } finally { rmSync(dossier, { recursive: true, force: true }); }
});

test('pare-feu : le script de l’hôte (faux iptables) — liste du pool d’abord, une transaction, garde au premier passage seulement', { skip: spawnSync('sh', ['-c', 'true']).status !== 0 }, () => {
  const script = fileURLToPath(new URL('../deploiement/pare-feu-navigateurs.sh', import.meta.url));
  const d = mkdtempSync(path.join(tmpdir(), 'pfh-'));
  try {
    const bin = path.join(d, 'bin'); const etat = path.join(d, 'etat'); mkdirSync(bin); mkdirSync(etat);
    const log = path.join(d, 'appels.log');
    const faux = (nom, corps) => { const f = path.join(bin, nom); writeFileSync(f, `#!/bin/sh\n${corps}\n`); chmodSync(f, 0o755); };
    // « branche » = la chaîne est déjà branchée à DOCKER-USER (passage après le démarrage).
    faux('iptables', `echo "iptables $*" >> "${log.replace(/\\/g, '/')}"; case "$*" in *"-C DOCKER-USER"*) [ -f "${d.replace(/\\/g, '/')}/branche" ] && exit 0 || exit 1 ;; *"-C INPUT"*) exit 0 ;; esac; exit 0`);
    faux('ip6tables', 'exit 0');
    faux('iptables-restore', `echo "restore $*" >> "${log.replace(/\\/g, '/')}"; cat >> "${log.replace(/\\/g, '/')}"`);
    faux('flock', 'exit 0');
    writeFileSync(path.join(d, 'boot'), 'boot-123\n');
    writeFileSync(path.join(d, 'deploiement.txt'), '176.103.182.215:12323\n');
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FILLSELL_ETAT: etat, FILLSELL_VERROU: path.join(d, 'run'),
      FILLSELL_LISTE_DEPLOIEMENT: path.join(d, 'deploiement.txt'), FILLSELL_BOOT_ID: path.join(d, 'boot') };
    // 1. Premier passage, sans liste de l'orchestrateur : la liste du déploiement, la garde DROP posée puis retirée.
    let r = spawnSync('sh', [script], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    let appels = readFileSync(log, 'utf8');
    assert.match(appels, /iptables -I DOCKER-USER 1 -i br-fillsell -j DROP/);
    assert.match(appels, /restore --noflush/);
    assert.match(appels, /-A FILLSELL-NAV -p tcp -d 176\.103\.182\.215 --dport 12323 -j RETURN/);
    assert.match(appels, /iptables -D DOCKER-USER -i br-fillsell -j DROP/);
    let preuve = JSON.parse(readFileSync(path.join(etat, 'pare-feu.json'), 'utf8'));
    assert.deepEqual([preuve.boot_id, preuve.destinations, preuve.source], ['boot-123', '176.103.182.215:12323', 'deploiement']);
    // 2. La liste de l'orchestrateur, chaîne déjà branchée : une seule transaction, AUCUNE garde (rien n'est coupé).
    writeFileSync(path.join(d, 'branche'), '');
    writeFileSync(log, '');
    writeFileSync(path.join(etat, 'proxys-permis.txt'), texteSorties(['176.103.182.215:12323', '94.194.94.233:12323', '9.9.9.9:pas-un-port']));
    r = spawnSync('sh', [script], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    appels = readFileSync(log, 'utf8');
    assert.ok(!/-j DROP\n?$/m.test(appels.split('\n').filter((x) => x.startsWith('iptables -I DOCKER-USER')).join('\n')), 'aucune garde DROP');
    assert.ok(!appels.includes('iptables -I DOCKER-USER 1'), 'aucune garde DROP quand la chaîne est branchée');
    assert.match(appels, /:FILLSELL-NAV - \[0:0\]\n-F FILLSELL-NAV/);
    assert.match(appels, /94\.194\.94\.233 --dport 12323/);
    assert.ok(!appels.includes('9.9.9.9'), 'ligne invalide ignorée');
    preuve = JSON.parse(readFileSync(path.join(etat, 'pare-feu.json'), 'utf8'));
    assert.deepEqual([preuve.destinations, preuve.source], ['176.103.182.215:12323,94.194.94.233:12323', 'etat']);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('refus par plateforme : un blocage n’est plus un rebut ; le stock ignore les refus PROUVÉS ; l’attribution les met en dernier', () => {
  assert.equal(regles.effetSignalement('blocage_anti_robot'), 'refus_plateforme');
  assert.equal(regles.effetSignalement('captcha_repete'), 'refus_plateforme');
  for (const c of ['compte_restreint', 'liste_noire', 'sortie_non_conforme', 'controle_entree', 'manuel']) assert.equal(regles.effetSignalement(c), 'rebut', c);
  assert.equal(regles.refusProuve({ beebs: { prouvee: false } }), false);
  assert.equal(regles.refusProuve({ beebs: { prouvee: true } }), true);
  const disp = (id, refus = {}) => ({ id, etat: 'disponible', expire_le: iso(T0 + 25 * J), attributions: 0, refus });
  const ips = [disp(1, { beebs: { prouvee: true } }), disp(2, { beebs: { prouvee: false } }), disp(3)];
  assert.equal(regles.choisirIp(ips, { userId: 'u', maintenant: T0 }).id, 3, 'sans refus d’abord');
  assert.equal(regles.choisirIp(ips.slice(0, 2), { userId: 'u', maintenant: T0 }).id, 2, 'refus non prouvé ensuite');
  assert.equal(regles.choisirIp(ips.slice(0, 1), { userId: 'u', maintenant: T0 }).id, 1, 'refus prouvé : dernier recours');
  // Stock minimum : même avec un λ minimal, jamais sous cloud_ip_stock_min ; une IP au refus prouvé ne compte pas.
  assert.equal(regles.stockVise({ seuilCommande: 1, stockMin: 2, enAttente: 1 }), 3);
  const p = regles.planDuJour({ ips, lambda: 0.5, stockMin: 3, maintenant: T0 });
  assert.equal(p.projete, 2, 'IP 2 et 3 comptent ; la 1 (refus prouvé) non');
  assert.equal(p.aCommander, 1);
  assert.equal(p.attribuables, 2);
  const p2 = regles.planDuJour({ ips: [disp(3)], lambda: 0.5, stockMin: 2, maintenant: T0 });
  assert.equal(p2.aCommander, 1, 'stock 2, une seule IP saine → 1 à commander');
});

test('visite de contrôle : restreint / glissière / passe / indéterminé', () => {
  const page = (t, e, texteCadres = '') => ({ t, e: { hote: 'www.beebs.app', pret: true, bloque: false, restreint: false, captcha: false, interstitiel: false, ...e }, texteCadres });
  assert.deepEqual(Object.keys(ACCUEILS_CONTROLE).sort(), ['beebs', 'depop', 'leboncoin', 'vinted']);
  assert.equal(verdictVisite([page(2500, { interstitiel: true }), page(5000, { interstitiel: true }, 'Accès temporairement restreint')], 'beebs'), 'restreint',
    'le refus écrit dans le cadre DataDome (11:45 le 02/11)');
  assert.equal(verdictVisite([page(2500, { bloque: true })], 'beebs'), 'restreint', 'cadre t=bv');
  assert.equal(verdictVisite([page(2500, { interstitiel: true }), page(5000, { captcha: true })], 'beebs'), 'glissiere', 'un appareil neuf reçoit une glissière : l’IP n’est pas refusée');
  assert.equal(verdictVisite([page(2500, {}), page(5000, {}), page(12500, {})], 'beebs'), 'passe');
  assert.equal(verdictVisite([page(2500, {}), page(5000, {})], 'beebs'), 'indetermine', 'trop tôt pour dire « passe »');
  assert.equal(verdictVisite([page(12500, { interstitiel: true })], 'beebs'), 'indetermine', 'vérification restée');
  assert.equal(verdictVisite([page(12500, { hote: 'www.kiabi.com' })], 'beebs'), 'indetermine', 'pas la plateforme');
  assert.equal(verdictVisite([], 'beebs'), 'indetermine');
});

test('rotation : jamais deux comptes sur une IP en même temps', () => {
  const pool = [1, 2, 3].map((id) => ({ id, ip: `10.0.0.${id}`, pays: 'FR', etat: 'disponible', expire_le: iso(T0 + 10 * J) }));
  const t = 5;
  const a = ipDuPool(pool, 'A', t, T0);
  const occupees = new Map([[Number(a.id), 'A']]);
  const b = ipDuPool(pool, 'B', t, T0, occupees);
  assert.notEqual(b.id, a.id, 'B ne prend pas celle de A');
  assert.equal(ipDuPool(pool, 'A', t, T0, occupees).id, a.id, 'A garde la sienne');
  const tenue = pool.map((i) => ({ ...i, user_id: i.id === 1 ? 'X' : null }));
  for (const u of ['A', 'B', 'C', 'D']) assert.notEqual(ipDuPool(tenue, u, t, T0)?.id, 1, 'une IP tenue par un compte n’est jamais prise par un autre');
  const pleine = new Map([[1, 'A'], [2, 'B'], [3, 'C']]);
  assert.equal(ipDuPool(pool, 'D', t, T0, pleine), null, 'tout est pris : aucune IP (refus net), jamais un partage');
});

test('migration : défauts de cloud_param = PARAMETRES ; interrupteurs de dépense nés coupés ; refus par plateforme', () => {
  const sql = readFileSync(fileURLToPath(new URL('../../supabase/migrations/20261103202000_cloud_ip_approvisionnement.sql', import.meta.url)), 'utf8');
  assert.match(sql, /\('cloud_ip_achats_auto', 0\)/);
  assert.match(sql, /\('cloud_ip_renouvellement_auto', 0\)/);
  assert.match(sql, new RegExp(`\\('cloud_ip_stock_min', ${regles.PARAMETRES.ipStockMin}\\)`));
  assert.match(sql, new RegExp(`\\('cloud_ip_budget_mensuel_usd', ${regles.PARAMETRES.ipBudgetMensuelUsd}\\)`));
  assert.match(sql, new RegExp(`\\('cloud_ip_achat_max', ${regles.PARAMETRES.ipAchatMax}\\)`));
  assert.match(sql, new RegExp(`cloud_param\\('ip_stock_min', ${regles.PARAMETRES.ipStockMin}\\)`));
  assert.match(sql, new RegExp(`cloud_param\\('refus_revisite_jours', ${regles.PARAMETRES.refusRevisiteJours}\\)`));
  assert.match(sql, /IF p_critere IN \('blocage_anti_robot', 'captcha_repete'\) THEN/);
  assert.ok(regles.CRITERES_PAR_PLATEFORME.every((c) => sql.includes(`'${c}'`)));
  assert.ok(existsSync(fileURLToPath(new URL('../deploiement/systemd/fillsell-pare-feu-maj.path', import.meta.url))));
});
