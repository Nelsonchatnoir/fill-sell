// (03/11, point 2 de Nico) L'APPROVISIONNEMENT AUTOMATIQUE DES IP — sans réseau ni base : faux IPRoyal, fausse base.
// Achat et renouvellement sous leurs gardes (serveur, interrupteur ; (07/11) garde du NOMBRE pour l'achat, anti-boucle pour
// la prolongation — plus de plafond en dollars), solde insuffisant, paiement par carte, livraison, pare-feu
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
import { lireCatalogueIsp, prixDeCalcul, proxiesLivres, creerIproyal, finCarte, choisirCarte, carteLisible } from '../src/iproyal.js';
import { creerApprovisionnement, dateIproyal, grouperParCommande, alerteCarte, CARTE_ALERTE_JOURS, ECHEC_ACHAT_PAUSE_MS } from '../src/approvisionnement.js';
import { sortiesDuPool, texteSorties, lireSorties, sortiesAppliquees, sortieOuverte, creerPareFeu } from '../src/pareFeu.js';
import { verdictCloisonnement } from '../src/cloisonnement.js';
import { verdictVisite, ACCUEILS_CONTROLE } from '../src/controle.js';
import { ipDuPool } from '../src/fournisseurIp.js';
import { creerEntretien } from '../src/entretien.js';

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

test('dépense (07/11) : dans l’ordre — prix, serveur, interrupteur, garde du nombre (achat), anti-boucle (prolongation), solde ; plus AUCUN plafond en dollars', () => {
  const ok = { vivantes: 1, en_commande: 0, comptes: 1, marge: 3, attente: 0 };
  const base = { montantUsd: 29.4, envAutorise: true, interrupteur: true, garde: regles.gardePour(ok, 3), soldeUsd: 50 };
  assert.deepEqual(regles.deciderDepense(base), { faire: true, raison: 'ok' });
  assert.equal(regles.deciderDepense({ ...base, envAutorise: false }).raison, 'achats_coupes_serveur');
  assert.equal(regles.deciderDepense({ ...base, interrupteur: false }).raison, 'interrupteur_coupe');
  assert.equal(regles.deciderDepense({ ...base, garde: regles.gardePour(ok, 4) }).raison, 'garde_nombre', '1 + 4 > 1 + 3');
  assert.equal(regles.deciderDepense({ ...base, garde: null }).raison, 'garde_illisible', 'un achat sans garde lisible ne part pas');
  assert.equal(regles.deciderDepense({ ...base, budgetUsd: 0, depenseMoisUsd: 5000 }).raison, 'ok', 'les dollars ne bornent plus rien');
  assert.equal(regles.deciderDepense({ ...base, soldeUsd: 7.15 }).raison, 'solde_insuffisant');
  assert.equal(regles.deciderDepense({ ...base, soldeUsd: 0, paiement: 'carte' }).raison, 'ok', 'par carte, le solde ne bloque pas');
  assert.equal(regles.deciderDepense({ ...base, montantUsd: NaN }).raison, 'prix_illisible');
  // Une prolongation : jamais la garde du nombre (même très au-dessus), seulement l'anti-boucle.
  const prol = { montantUsd: 4, envAutorise: true, interrupteur: true, soldeUsd: 50 };
  assert.equal(regles.deciderDepense(prol).raison, 'ok');
  assert.equal(regles.deciderDepense({ ...prol, dejaProlongee: true }).raison, 'prolongation_recente');
  assert.equal(regles.deciderDepense({ ...prol, rebutsEntree: 9 }).raison, 'ok', 'les rebuts ne bornent jamais une prolongation');
  // Le rebut n'entre pas dans la garde : 3 IP refusées au contrôle d'ENTRÉE en 24 h suspendent l'achat (boucle achat → rebut).
  assert.equal(regles.deciderDepense({ ...base, rebutsEntree: 2 }).raison, 'ok');
  assert.equal(regles.deciderDepense({ ...base, rebutsEntree: 3 }).raison, 'rebuts_controle');
  const ipR = (id, critere, heures) => ({ id, etat: 'rebut', rebut_critere: critere, rebut_le: iso(T0 - heures * 3600_000), expire_le: iso(T0 + 20 * J) });
  const pr = regles.planDuJour({ ips: [ipR(1, 'controle_entree', 2), ipR(2, 'controle_entree', 23), ipR(3, 'controle_entree', 30), ipR(4, 'compte_restreint', 1)],
    lambda: 0.5, marge: 3, comptesSansPlace: 0, maintenant: T0 });
  assert.equal(pr.rebutsEntree24h, 2, 'au contrôle d’entrée, sur 24 h ; jamais un rebut de compte restreint (son remplacement est dû)');
  assert.equal(regles.soldeCouvre(3.15, 4), false);
  assert.equal(regles.soldeCouvre(7.15, 4), true);
});

test('(07/11, décision 2) garde du nombre : comptées = attribuées + pool qui couvre un essai (ni usée, ni refus prouvé) + en commande + demandées ; borne = comptes + marge + attente', () => {
  const ip = (id, etat, x = {}) => ({ id, etat, expire_le: iso(T0 + 25 * J), attributions: 0, refus: {}, ...x });
  const ips = [ip(42, 'attribuee_client', { user_id: 'nico' }), ip(43, 'attribuee_essai', { user_id: 'essai', expire_le: iso(T0 + J) }),
    ip(1, 'disponible'), ip(2, 'achetee'), ip(3, 'disponible', { refus: { beebs: { prouvee: false } } }),
    ip(4, 'disponible', { refus: { vinted: { prouvee: true } } }), ip(5, 'disponible', { attributions: 6 }), ip(6, 'disponible', { expire_le: iso(T0 + 9 * J) }),
    ip(7, 'repos', { dernier_user_id: 'parti' }), ip(8, 'rebut'), ip(9, 'expiree')];
  const g = regles.gardeNombre({ ips, comptesSansPlace: 1, enAttente: 2, enCommande: 3, quantite: 1, marge: 3, maintenant: T0 });
  assert.deepEqual([g.vivantes, g.en_commande, g.demandees, g.comptees], [5, 3, 1, 9], 'IP 42, 43, 1, 2, 3 ; jamais 4 (refus prouvé), 5 (usée), 6 (9 jours), 7, 8, 9');
  assert.deepEqual([g.comptes, g.marge, g.attente, g.borne, g.ok], [3, 3, 2, 8, false], '2 titulaires + 1 compte sans place ; 9 > 8');
  assert.equal(regles.gardePour(g, 0).ok, true, 'sans rien demander : 8 ≤ 8');
  assert.equal(regles.gardeNombre({ ips, comptesSansPlace: null }), null, 'comptes sans place illisibles : pas de garde (achat refusé)');
  // Le plan porte sa garde ; un achat que le plan demande passe TOUJOURS (la garde compte un sous-ensemble du plan).
  const p = regles.planDuJour({ ips: [ip(42, 'attribuee_client', { user_id: 'nico' }), ip(7, 'repos', { dernier_user_id: 'x', repos_fin: iso(T0 + 6 * J) })],
    lambda: 0.5, marge: 3, enAttente: 1, comptesSansPlace: 0, maintenant: T0 });
  assert.equal(p.vise, 4, 'marge 3 + 1 en attente');
  assert.equal(p.aCommander, 4);
  assert.equal(p.garde.ok, true); assert.equal(p.garde.comptees, 5); assert.equal(p.garde.borne, 5);
  assert.equal(regles.gardePour(p.garde, 5).ok, false, 'une IP de plus que le plan : refusée');
  assert.equal(regles.planDuJour({ ips: [], lambda: 0.5, marge: 3, maintenant: T0 }).garde, null, 'sans comptes sans place : garde absente');
});

test('(07/11) anti-boucle des prolongations : jamais deux fois la même commande (ou IP) en 15 jours, sauf échec', () => {
  const d = (x) => ({ nature: 'prolongation', statut: 'livree', demandee_le: iso(T0 - 2 * J), ip_id: 39, details: { commande: '87284262' }, ...x });
  assert.equal(regles.prolongationRecente({ registre: [d()], commande: '87284262', maintenant: T0 }), true);
  assert.equal(regles.prolongationRecente({ registre: [d()], commande: 'autre', ip: 39, maintenant: T0 }), true, 'la même IP');
  assert.equal(regles.prolongationRecente({ registre: [d({ statut: 'echec' })], commande: '87284262', maintenant: T0 }), false, 'un échec ne compte pas');
  assert.equal(regles.prolongationRecente({ registre: [d({ demandee_le: iso(T0 - 16 * J) })], commande: '87284262', maintenant: T0 }), false, '16 jours');
  assert.equal(regles.prolongationRecente({ registre: [d({ nature: 'achat' })], commande: '87284262', maintenant: T0 }), false);
  assert.equal(regles.PARAMETRES.ipProlongationEspacementJours, 15);
});

test('(07/11, décision 3) seuil du solde : les dépenses prévues sur 14 jours au rythme réel, jamais moins que la marge', () => {
  const ip = (id, etat, jours, x = {}) => ({ id, etat, expire_le: iso(T0 + jours * J), attributions: 0, refus: {}, ...x });
  const ips = [ip(42, 'attribuee_client', 10, { user_id: 'a' }), ip(43, 'attribuee_essai', 20, { user_id: 'b' }),
    ip(1, 'disponible', 5), ip(2, 'disponible', 8), ip(3, 'disponible', 12, { refus: { beebs: { prouvee: false } } }), ip(4, 'disponible', 30), ip(5, 'rebut', 3)];
  const sans = regles.seuilSoldeProjete({ ips, registre: [], marge: 3, prixIpUsd: 4, maintenant: T0 });
  assert.deepEqual([sans.renouvellements, sans.achats, sans.seuilUsd, sans.horizonJours], [3, 3, 24, 14],
    'IP 42 (10 j) + IP 1 et 2 du stock (la 3 au refus non prouvé n’est jamais renouvelée) ; achats = la marge');
  const registre = Array.from({ length: 6 }, (_, k) => ({ nature: 'achat', statut: 'livree', quantite: 2, demandee_le: iso(T0 - (k + 1) * 4 * J) }));
  const avec = regles.seuilSoldeProjete({ ips, registre: [...registre, { nature: 'achat', statut: 'echec', quantite: 9, demandee_le: iso(T0 - J) }], marge: 3, prixIpUsd: 4, maintenant: T0 });
  assert.equal(avec.achats, 6, '12 IP en 30 jours → 5,6 sur 14 jours → 6 (un achat échoué ne compte pas)');
  assert.equal(avec.seuilUsd, 36);
  assert.equal(regles.seuilSoldeProjete({ ips: [], marge: 3, maintenant: T0 }).prixIpUsd, regles.PARAMETRES.prixIpUsd30j, 'prix inconnu : le prix mesuré de PARAMETRES');
  assert.equal(regles.prixIpDuRegistre([{ statut: 'livree', prix_usd: 29.4, quantite: 7, demandee_le: iso(T0) }, { statut: 'livree', prix_usd: 4, quantite: 1, demandee_le: iso(T0 - J) }]), 4.2);
});

// Une fausse base : rpc et lectures de cloud_ip_commandes, avec un registre des appels.
function fausseBase({ params = {}, depense = 0, ouvrir = { ok: true, id: 101 }, enCours = [], gardeBase = null } = {}) {
  const appels = [];
  return {
    appels,
    async rpc(nom, a) {
      appels.push([nom, a]);
      if (nom === 'cloud_param') return { data: params[a.p_cle] ?? a.p_defaut, error: null };
      if (nom === 'cloud_ip_depenses_mois') return { data: depense, error: null };
      if (nom === 'cloud_ip_depense_ouvrir') return { data: ouvrir, error: null };
      if (nom === 'cloud_ip_garde_nombre') return gardeBase ? { data: regles.gardePour(gardeBase, a.p_quantite), error: null } : { data: null, error: { message: 'absente' } };
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
function fauxIproyal({ achatsAutorises = true, prix = 29.4, livree = null, cartes = [], carteRefuse = null } = {}) {
  const gestes = [];
  // (07/11, addendum) Une carte qui échoue : `carteRefuse` = le statut HTTP rendu (402 = refus sûr, 503 = issue inconnue).
  const payer = (carteId) => {
    if (carteId && carteRefuse) { const e = new Error(`IPRoyal POST → HTTP ${carteRefuse}`); e.statut = carteRefuse; throw e; }
  };
  return {
    gestes, disponible: true, achatsAutorises,
    async catalogueIsp() { return lireCatalogueIsp(CATALOGUE); },
    async prixCommande(n) { gestes.push(['prix', n]); return prix; },
    async commander(n, cat, o = {}) { gestes.push(['commander', n, cat.planId, o.carteId ?? null]); payer(o.carteId); return { id: 99001 }; },
    async prolonger(c, plan, o = {}) { gestes.push(['prolonger', c, plan, o.carteId ?? null]); payer(o.carteId); return { expire_date: '2026-12-04 12:57:45' }; },
    async cartes() { gestes.push(['cartes']); return cartes; },
    async lireCommande(c) { gestes.push(['lire', c]); return livree ?? { status: 'in-progress', proxy_data: { proxies: [] } }; },
    urlProxy(cmd, ip) { return `http://u:p@${ip}:12323`; },
  };
}
// (07/11) Le plan porte sa garde du nombre (planDuJour) : 1 compte, aucune IP d'avance, marge 3 → 3 IP permises.
const GARDE_OK = { vivantes: 1, en_commande: 0, comptes: 1, marge: 3, attente: 0 };
const plan = { renouveler: [], aCommander: 3, vise: 3, projete: 0, garde: regles.gardePour(GARDE_OK, 3) };

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
  const base = fausseBase({ params: { ip_achats_auto: 1 } });
  const iproyal = fauxIproyal();
  const a = creerApprovisionnement({ base, iproyal, regles, journal, alertes: null, attendreLivraisonMs: 0 });
  const g = await a.gardes();
  assert.deepEqual([g.marge, g.paiementCarte, g.carteId], [3, false, null], 'défauts : marge 3, paiement par le solde');
  const solde = { montant: 50 };
  const r = await a.acheter(plan, g, solde);
  assert.equal(r.fait, true); assert.equal(r.quantite, 3);
  const ordre = base.appels.map((x) => x[0]).filter((n) => n === 'cloud_ip_depense_ouvrir' || n === 'cloud_ip_depense_fermer');
  assert.deepEqual(ordre, ['cloud_ip_depense_ouvrir', 'cloud_ip_depense_fermer']);
  assert.deepEqual(iproyal.gestes.filter((x) => x[0] === 'commander'), [['commander', 3, 22, null]], 'UNE commande de 3 IP, offre 30 jours, payée par le solde');
  const fermer = base.appels.find((x) => x[0] === 'cloud_ip_depense_fermer')[1];
  assert.equal(fermer.p_statut, 'en_cours'); assert.equal(fermer.p_details.paiement, 'solde');
  assert.equal(base.appels.find((x) => x[0] === 'cloud_ip_depense_ouvrir')[1].p_details.paiement, 'solde', 'le registre dit le moyen de paiement');
  assert.equal(solde.montant, 50 - 29.4);
  assert.ok(!base.appels.some((x) => x[0] === 'cloud_ip_depenses_mois'), 'plus aucun plafond lu');
  // (07/11) Mille dollars déjà dépensés ce mois : rien ne bloque.
  const b1 = fausseBase({ params: { ip_achats_auto: 1, ip_budget_mensuel_usd: 60 }, depense: 1000 });
  const a1 = creerApprovisionnement({ base: b1, iproyal: fauxIproyal(), regles, journal, alertes: null, attendreLivraisonMs: 0 });
  assert.equal((await a1.acheter(plan, await a1.gardes(), { montant: 50 })).fait, true);
  // La garde du nombre (JS) refuse AVANT le registre et IPRoyal, et le DIT tout de suite (support@).
  const dits = [];
  const b2 = fausseBase({ params: { ip_achats_auto: 1 } });
  const i2 = fauxIproyal();
  const a2 = creerApprovisionnement({ base: b2, iproyal: i2, regles, journal, alertes: { async signaler(n, t) { dits.push([n, t]); } }, attendreLivraisonMs: 0 });
  const trop = { ...plan, aCommander: 4, garde: regles.gardePour({ ...GARDE_OK, en_commande: 3 }, 4) };
  assert.equal((await a2.acheter(trop, await a2.gardes(), { montant: 50 })).raison, 'garde_nombre');
  assert.ok(!i2.gestes.some((x) => x[0] === 'commander')); assert.ok(!b2.appels.some((x) => x[0] === 'cloud_ip_depense_ouvrir'));
  assert.ok(dits.some(([n, t]) => n === 'serveur' && /^Achat d'IP BLOQUÉ par la garde du nombre : 8 IP comptées .* borne de 4 .* Une boucle d'achat \?/.test(t)), JSON.stringify(dits));
  // 3 IP refusées au contrôle d'entrée en 24 h : l'achat se suspend, dit (jamais la boucle achat → rebut → rachat).
  const b5 = fausseBase({ params: { ip_achats_auto: 1 } }); const i5 = fauxIproyal(); const dits5 = [];
  const a5 = creerApprovisionnement({ base: b5, iproyal: i5, regles, journal, alertes: { async signaler(n, t) { dits5.push(t); } }, attendreLivraisonMs: 0 });
  assert.equal((await a5.acheter({ ...plan, rebutsEntree24h: 3 }, await a5.gardes(), { montant: 50 })).raison, 'rebuts_controle');
  assert.ok(!i5.gestes.some((x) => x[0] === 'commander') && dits5.some((t) => /refusées au contrôle d'entrée en série/.test(t)));
  // Plan sans garde (comptes sans place illisibles) : refusé, jamais à l'aveugle.
  const a4 = creerApprovisionnement({ base: fausseBase({ params: { ip_achats_auto: 1 } }), iproyal: fauxIproyal(), regles, journal, alertes: null, attendreLivraisonMs: 0 });
  assert.equal((await a4.acheter({ ...plan, garde: null }, await a4.gardes(), { montant: 50 })).raison, 'garde_illisible');
  // La base refuse (garde du nombre sous verrou : un autre serveur vient d'acheter) même si le calcul local passait.
  const b3 = fausseBase({ params: { ip_achats_auto: 1 }, ouvrir: { ok: false, raison: 'garde_nombre', garde: { comptees: 5, borne: 4 } } });
  const i3 = fauxIproyal();
  const a3 = creerApprovisionnement({ base: b3, iproyal: i3, regles, journal, alertes: null, attendreLivraisonMs: 0 });
  assert.equal((await a3.acheter(plan, await a3.gardes(), { montant: 50 })).raison, 'garde_nombre');
  assert.ok(!i3.gestes.some((x) => x[0] === 'commander'));
});

test('achat : solde IPRoyal insuffisant → alerte, aucune commande', async () => {
  const base = fausseBase({ params: { ip_achats_auto: 1 } });
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
  // Ouvert — mille dollars déjà dépensés ce mois : rien ne bloque un renouvellement.
  const base = fausseBase({ params: { ip_renouvellement_auto: 1, ip_budget_mensuel_usd: 60 }, depense: 1000 });
  const iproyal = fauxIproyal({ prix: 4 });
  const a = creerApprovisionnement({ base, iproyal, regles, journal, alertes: null });
  const registre = [];
  const r = await a.renouveler({ renouveler: [39, 1, 7] }, ips, await a.gardes(), { montant: 50 }, { registre });
  assert.deepEqual(r.map((x) => x.fait), [true, true]);
  assert.deepEqual(iproyal.gestes.filter((x) => x[0] === 'prolonger'), [['prolonger', '87284262', 22, null], ['prolonger', '84458881', 22, null]]);
  const renouvelees = base.appels.filter((x) => x[0] === 'cloud_ip_renouvelee').map((x) => [x[1].p_ip, x[1].p_expire_le]);
  assert.deepEqual(renouvelees, [[39, '2026-12-04T12:57:45.000Z'], [1, '2026-12-04T12:57:45.000Z'], [7, '2026-12-04T12:57:45.000Z']]);
  // (07/11) Anti-boucle : rejoué dans la foulée (le registre porte les deux prolongations), plus rien ne part.
  const r2 = await a.renouveler({ renouveler: [39, 1, 7] }, ips, await a.gardes(), { montant: 50 }, { registre });
  assert.deepEqual(r2.map((x) => x.raison), ['prolongation_recente', 'prolongation_recente']);
  assert.equal(iproyal.gestes.filter((x) => x[0] === 'prolonger').length, 2, 'aucune prolongation de plus');
});

// ── (07/11, addendum de Nico) LE PAIEMENT PAR CARTE ─────────────────────────────────────────────────────────────
const CARTES = [
  { id: 11, provider: 'stripe', card_type: 'visa', last_four_digits: '4242', expiry_date: '2029/4' },
  { id: 12, provider: 'stripe', card_type: 'visa', last_four_digits: '1881', expiry_date: '2031/12' },
  { id: 13, provider: 'stripe', card_type: 'mastercard', last_four_digits: '5100', expiry_date: '2031/12' },
  { id: 14, provider: 'stripe', last_four_digits: '0000', expiry_date: '2025/1' },
];

test('carte : fin du mois d’échéance, choix (réglage sinon la plus lointaine, jamais une expirée), jamais plus que 4 chiffres', () => {
  assert.equal(finCarte('2031/12'), Date.UTC(2032, 0, 1) - 1);
  assert.equal(finCarte('2029/4'), Date.UTC(2029, 4, 1) - 1, '« 2029/4 » sans zéro');
  assert.ok(Number.isNaN(finCarte('12/31'))); assert.ok(Number.isNaN(finCarte('2031/13'))); assert.ok(Number.isNaN(finCarte(null)));
  const loin = choisirCarte(CARTES, null, T0);
  assert.deepEqual([loin.id, loin.choisie, loin.quatre], [12, 'plus_lointaine', '1881'], 'la plus lointaine (12 et 13 à égalité : le plus petit id)');
  assert.equal(choisirCarte(CARTES, 11, T0).id, 11, 'cloud_ip_carte_id présente et valide : elle');
  assert.equal(choisirCarte(CARTES, 14, T0).id, 12, 'cloud_ip_carte_id expirée : la plus lointaine');
  assert.equal(choisirCarte(CARTES, 99, T0).id, 12, 'cloud_ip_carte_id absente de GET /cards : la plus lointaine');
  assert.equal(choisirCarte({ data: CARTES.slice(3) }, null, T0), null, 'que des cartes expirées : aucune');
  assert.equal(choisirCarte([], null, T0), null);
  assert.equal(carteLisible(loin), 'carte …1881 (stripe, fin 2031-12)');
  assert.ok(!/\d{5,}/.test(carteLisible(loin)), 'jamais plus que les 4 derniers chiffres');
});

test('carte : alerte si aucune carte valide ou fin dans 45 jours, au plus une fois par jour ; rien en mode solde', () => {
  const carte = { id: 12, fin: T0 + 40 * J };
  assert.deepEqual(alerteCarte({ modeCarte: false, carte: null, maintenant: T0 }), { alerte: false, raison: null });
  assert.deepEqual(alerteCarte({ modeCarte: true, carte: null, maintenant: T0 }), { alerte: true, raison: 'carte_absente' });
  assert.deepEqual(alerteCarte({ modeCarte: true, carte, maintenant: T0 }), { alerte: true, raison: 'carte_expire_bientot' });
  assert.equal(alerteCarte({ modeCarte: true, carte: { ...carte, fin: T0 + 46 * J }, maintenant: T0 }).alerte, false);
  assert.equal(alerteCarte({ modeCarte: true, carte, maintenant: T0, derniereLe: T0 - 2 * 3600_000 }).alerte, false, 'une fois par jour');
  assert.equal(alerteCarte({ modeCarte: true, carte, maintenant: T0, derniereLe: T0 - 25 * 3600_000 }).alerte, true);
  assert.equal(CARTE_ALERTE_JOURS, 45);
});

test('carte : achat et renouvellement passent card_id ; le solde ne bloque pas ; registre identique + moyen de paiement', async () => {
  const base = fausseBase({ params: { ip_achats_auto: 1, ip_renouvellement_auto: 1, ip_paiement_carte: 1 } });
  const iproyal = fauxIproyal({ cartes: CARTES });
  const dits = [];
  const a = creerApprovisionnement({ base, iproyal, regles, journal, alertes: { async signaler(n, t) { dits.push(t); } }, attendreLivraisonMs: 0, maintenant: () => T0 });
  const g = await a.gardes();
  assert.equal(g.paiementCarte, true);
  const solde = { montant: 0.5 };
  const r = await a.acheter(plan, g, solde);
  assert.equal(r.fait, true, 'solde à 0,50 $ : la carte paie');
  assert.deepEqual(iproyal.gestes.filter((x) => x[0] === 'commander'), [['commander', 3, 22, 12]], 'card_id = la carte la plus lointaine');
  assert.equal(solde.montant, 0.5, 'le solde n’est pas décompté');
  const ouvrir = base.appels.find((x) => x[0] === 'cloud_ip_depense_ouvrir')[1];
  assert.deepEqual([ouvrir.p_nature, ouvrir.p_quantite, ouvrir.p_details.paiement, ouvrir.p_details.carte_id], ['achat', 3, 'carte', 12]);
  assert.equal(base.appels.find((x) => x[0] === 'cloud_ip_depense_fermer')[1].p_details.paiement, 'carte');
  assert.ok(!dits.some((t) => /Solde IPRoyal/.test(t)), 'aucune alerte de solde en mode carte');
  assert.ok(!JSON.stringify(base.appels).includes('4242') && !JSON.stringify(base.appels).includes('1881'), 'aucun chiffre de carte au registre');
  const ips = [{ id: 42, commande: '87509051' }];
  const rr = await a.renouveler({ renouveler: [42] }, ips, g, solde, { registre: [] });
  assert.equal(rr[0].fait, true); assert.equal(rr[0].paiement, 'carte');
  assert.deepEqual(iproyal.gestes.filter((x) => x[0] === 'prolonger'), [['prolonger', '87509051', 22, 12]]);
  // cloud_ip_carte_id réglé : cette carte-là.
  const b2 = fausseBase({ params: { ip_achats_auto: 1, ip_paiement_carte: 1, ip_carte_id: 11 } });
  const i2 = fauxIproyal({ cartes: CARTES });
  const a2 = creerApprovisionnement({ base: b2, iproyal: i2, regles, journal, alertes: null, attendreLivraisonMs: 0, maintenant: () => T0 });
  await a2.acheter(plan, await a2.gardes(), null);
  assert.deepEqual(i2.gestes.filter((x) => x[0] === 'commander'), [['commander', 3, 22, 11]]);
});

test('carte refusée (4xx) : UNE reprise par le solde s’il couvre, puis une alerte ; sinon échec dit, pause d’une heure ; issue inconnue (5xx) : jamais de reprise', async () => {
  const faire = (statut, soldeUsd) => {
    const base = fausseBase({ params: { ip_achats_auto: 1, ip_paiement_carte: 1 } });
    const iproyal = fauxIproyal({ cartes: CARTES, carteRefuse: statut });
    const dits = [];
    let t = T0;
    const a = creerApprovisionnement({ base, iproyal, regles, journal, alertes: { async signaler(n, x) { dits.push(x); } }, attendreLivraisonMs: 0, maintenant: () => t });
    return { base, iproyal, dits, a, solde: { montant: soldeUsd }, avancer: (ms) => { t += ms; } };
  };
  // Refus sûr, solde suffisant : la carte, puis le solde (une fois).
  const x = faire(402, 100);
  const r = await x.a.acheter(plan, await x.a.gardes(), x.solde);
  assert.equal(r.fait, true);
  assert.deepEqual(x.iproyal.gestes.filter((g) => g[0] === 'commander').map((g) => g[3]), [12, null], 'carte, puis UNE reprise par le solde');
  assert.equal(x.solde.montant, 100 - 29.4, 'payé par le solde');
  const fermer = x.base.appels.find((g) => g[0] === 'cloud_ip_depense_fermer')[1].p_details;
  assert.deepEqual([fermer.paiement, fermer.repli_carte], ['solde', true], 'le registre dit la reprise');
  assert.ok(x.dits.some((d) => /carte …1881 \(stripe, fin 2031-12\) est REFUSÉE .* une seule reprise par le solde/.test(d)), JSON.stringify(x.dits));
  assert.ok(!x.dits.some((d) => /4242|5100/.test(d)));
  // Refus sûr, solde insuffisant : aucune reprise, échec dit, l'achat automatique suspendu une heure.
  const y = faire(402, 1);
  assert.equal((await y.a.acheter(plan, await y.a.gardes(), y.solde)).raison, 'echec');
  assert.deepEqual(y.iproyal.gestes.filter((g) => g[0] === 'commander').map((g) => g[3]), [12], 'aucune reprise');
  assert.equal(y.base.appels.find((g) => g[0] === 'cloud_ip_depense_fermer')[1].p_statut, 'echec');
  assert.ok(y.dits.some((d) => /Achat IPRoyal ÉCHOUÉ .*refusée, solde insuffisant pour la reprise.*suspendu une heure/.test(d)), JSON.stringify(y.dits));
  y.avancer(30 * 60_000);
  assert.equal((await y.a.acheter(plan, await y.a.gardes(), y.solde)).raison, 'echec_recent', '30 min après : rien n’est retenté');
  assert.equal(y.iproyal.gestes.filter((g) => g[0] === 'commander').length, 1);
  y.avancer(ECHEC_ACHAT_PAUSE_MS);
  await y.a.acheter(plan, await y.a.gardes(), y.solde);
  assert.equal(y.iproyal.gestes.filter((g) => g[0] === 'commander').length, 2, 'une heure après : un seul nouvel essai');
  // Issue inconnue (503) : jamais de reprise (un paiement est peut-être passé), même avec un gros solde.
  const z = faire(503, 1000);
  assert.equal((await z.a.acheter(plan, await z.a.gardes(), z.solde)).raison, 'echec');
  assert.deepEqual(z.iproyal.gestes.filter((g) => g[0] === 'commander').map((g) => g[3]), [12]);
  assert.ok(z.dits.some((d) => /issue inconnue \(aucune reprise : jamais deux paiements\)/.test(d)));
  // Mode carte sans carte valide : le solde paie (s'il couvre), dit par l'alerte de la carte au tour horaire.
  const w = faire(null, 100);
  w.iproyal.cartes = async () => CARTES.slice(3);
  assert.equal((await w.a.acheter(plan, await w.a.gardes(), w.solde)).fait, true);
  assert.deepEqual(w.iproyal.gestes.filter((g) => g[0] === 'commander').map((g) => g[3]), [null]);
  const v = await w.a.verifierCarte(await w.a.gardes());
  assert.deepEqual([v.mode, v.raison], ['solde', 'carte_absente']);
  assert.ok(w.dits.some((d) => /AUCUNE carte valide chez IPRoyal/.test(d)));
  await w.a.verifierCarte(await w.a.gardes());
  assert.equal(w.dits.filter((d) => /AUCUNE carte valide/.test(d)).length, 1, 'une fois par jour');
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
    // (07/11 soir) Le module br_netfilter « chargé » : il fait apparaître les réglages du pont, à 0 (le script les met à 1).
    const pont = path.join(d, 'pont').replace(/\\/g, '/');
    faux('modprobe', `echo "modprobe $*" >> "${log.replace(/\\/g, '/')}"; mkdir -p "${pont}"; echo 0 > "${pont}/bridge-nf-call-iptables"; echo 0 > "${pont}/bridge-nf-call-ip6tables"`);
    writeFileSync(path.join(d, 'boot'), 'boot-123\n');
    writeFileSync(path.join(d, 'deploiement.txt'), '176.103.182.215:12323\n');
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FILLSELL_ETAT: etat, FILLSELL_VERROU: path.join(d, 'run'),
      FILLSELL_LISTE_DEPLOIEMENT: path.join(d, 'deploiement.txt'), FILLSELL_BOOT_ID: path.join(d, 'boot'), FILLSELL_PONT_SYSCTL: pont };
    // 1. Premier passage, sans liste de l'orchestrateur : la liste du déploiement, la garde DROP posée puis retirée.
    let r = spawnSync('sh', [script], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    let appels = readFileSync(log, 'utf8');
    assert.match(appels, /iptables -I DOCKER-USER 1 -i br-fillsell -j DROP/);
    assert.match(appels, /restore --noflush/);
    assert.match(appels, /-A FILLSELL-NAV -p tcp -d 176\.103\.182\.215 --dport 12323 -j RETURN/);
    assert.match(appels, /iptables -D DOCKER-USER -i br-fillsell -j DROP/);
    // (07/11 soir, étanchéité entre clients) Un conteneur vers un autre : DROP en PREMIÈRE règle (avant ESTABLISHED et toute
    // sortie permise) ; plus aucun « -d 172.31.0.0/24 -j RETURN ».
    assert.match(appels, /-F FILLSELL-NAV\n-A FILLSELL-NAV -o br-fillsell -j DROP\n-A FILLSELL-NAV -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN\n/);
    assert.ok(!appels.includes('172.31.0.0/24'), 'le sous-réseau des navigateurs n’est plus jamais permis');
    assert.match(appels, /modprobe br_netfilter/, 'le pont devient filtré');
    assert.equal(readFileSync(path.join(d, 'pont', 'bridge-nf-call-iptables'), 'utf8').trim(), '1');
    assert.equal(readFileSync(path.join(d, 'pont', 'bridge-nf-call-ip6tables'), 'utf8').trim(), '1');
    let preuve = JSON.parse(readFileSync(path.join(etat, 'pare-feu.json'), 'utf8'));
    assert.deepEqual([preuve.boot_id, preuve.destinations, preuve.source], ['boot-123', '176.103.182.215:12323', 'deploiement']);
    assert.deepEqual([preuve.entre_conteneurs, preuve.pont_filtre], ['ferme', '1']);
    assert.match(r.stdout, /entre conteneurs : fermé \(pont filtré : 1\)/);
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
    assert.ok(!appels.includes('modprobe'), 'module déjà chargé : rien à charger');
    preuve = JSON.parse(readFileSync(path.join(etat, 'pare-feu.json'), 'utf8'));
    assert.deepEqual([preuve.destinations, preuve.source, preuve.entre_conteneurs, preuve.pont_filtre], ['176.103.182.215:12323,94.194.94.233:12323', 'etat', 'ferme', '1']);
    // La preuve lue par l'orchestrateur : le pare-feu seul cloisonne déjà le réseau (même sans enable_icc).
    const v = verdictCloisonnement({ reseau: { Options: { 'com.docker.network.bridge.name': 'br-fillsell' } }, pontFiltre: '1', preuve: JSON.stringify(preuve), bootId: 'boot-123' });
    assert.deepEqual([v.ok, v.pareFeu, v.docker], [true, true, false]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('(07/11 soir) pare-feu : repli par ports, le DROP entre conteneurs passe AVANT les ports des proxys ; br_netfilter introuvable = dit, jamais un échec', { skip: spawnSync('sh', ['-c', 'true']).status !== 0 }, () => {
  const script = fileURLToPath(new URL('../deploiement/pare-feu-navigateurs.sh', import.meta.url));
  const d = mkdtempSync(path.join(tmpdir(), 'pfp-'));
  try {
    const bin = path.join(d, 'bin'); const etat = path.join(d, 'etat'); mkdirSync(bin); mkdirSync(etat);
    const log = path.join(d, 'appels.log').replace(/\\/g, '/');
    const faux = (nom, corps) => { const f = path.join(bin, nom); writeFileSync(f, `#!/bin/sh\n${corps}\n`); chmodSync(f, 0o755); };
    faux('iptables', `echo "iptables $*" >> "${log}"; case "$*" in *"-C "*) exit 0 ;; esac; exit 0`);
    faux('ip6tables', 'exit 0');
    faux('iptables-restore', `cat >> "${log}"`);
    faux('flock', 'exit 0');
    faux('modprobe', `echo "modprobe $*" >> "${log}"; exit 1`);   // module introuvable (noyau sans br_netfilter)
    writeFileSync(path.join(d, 'boot'), 'boot-9\n');
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FILLSELL_ETAT: etat, FILLSELL_VERROU: path.join(d, 'run'),
      FILLSELL_LISTE_DEPLOIEMENT: path.join(d, 'aucune.txt'), FILLSELL_BOOT_ID: path.join(d, 'boot'), FILLSELL_PONT_SYSCTL: path.join(d, 'pont').replace(/\\/g, '/') };
    const r = spawnSync('sh', [script], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const regles = readFileSync(log, 'utf8');
    const iDrop = regles.indexOf('-A FILLSELL-NAV -o br-fillsell -j DROP');
    const iPorts = regles.indexOf('-A FILLSELL-NAV -p tcp -m multiport --dports 12321,12323,12324 -j RETURN');
    assert.ok(iDrop >= 0 && iPorts > iDrop, 'un conteneur vers un autre sur un port de proxy reste refusé');
    assert.match(regles, /modprobe br_netfilter/);
    const preuve = JSON.parse(readFileSync(path.join(etat, 'pare-feu.json'), 'utf8'));
    assert.deepEqual([preuve.source, preuve.entre_conteneurs, preuve.pont_filtre], ['ports', 'ferme', '0']);
    // L'orchestrateur lit le noyau (pont non filtré) : aucune couche ne tient → un seul compte à la fois, et l'alerte.
    const v = verdictCloisonnement({ reseau: { Options: { 'com.docker.network.bridge.enable_icc': 'false' } }, pontFiltre: '', preuve: JSON.stringify(preuve), bootId: 'boot-9' });
    assert.equal(v.ok, false);
    assert.deepEqual(v.raisons, ['pont_non_filtre']);
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
  // (07/11, décision 1) Le stock visé = la MARGE + l'attente ; une IP au refus prouvé ne compte pas.
  assert.equal(regles.stockVise({ marge: 2, enAttente: 1 }), 3);
  assert.equal(regles.stockVise({}), regles.PARAMETRES.ipMarge, 'défaut : la marge de PARAMETRES');
  assert.equal(regles.PARAMETRES.ipMarge, 3);
  const p = regles.planDuJour({ ips, lambda: 0.5, marge: 3, maintenant: T0 });
  assert.equal(p.projete, 2, 'IP 2 et 3 comptent ; la 1 (refus prouvé) non');
  assert.equal(p.aCommander, 1);
  assert.equal(p.attribuables, 2);
  const p2 = regles.planDuJour({ ips: [disp(3)], lambda: 0.5, marge: 2, maintenant: T0 });
  assert.equal(p2.aCommander, 1, 'marge 2, une seule IP saine → 1 à commander');
  assert.equal(regles.planDuJour({ ips: [disp(3)], lambda: 9, marge: 2, maintenant: T0 }).aCommander, 1, 'même à 9 essais par jour : la marge fixe la cible');
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
  const sql07 = readFileSync(fileURLToPath(new URL('../../supabase/migrations/20261107180000_cloud_ip_marge_garde_nombre.sql', import.meta.url)), 'utf8')
    .replace(/\r\n/g, '\n');
  assert.match(sql, /\('cloud_ip_achats_auto', 0\)/);
  assert.match(sql, /\('cloud_ip_renouvellement_auto', 0\)/);
  assert.match(sql, new RegExp(`\\('cloud_ip_achat_max', ${regles.PARAMETRES.ipAchatMax}\\)`));
  // (07/11) La marge et sa garde : mêmes défauts que PARAMETRES ; plus aucun plafond en dollars lu ; le paiement naît au solde.
  assert.match(sql07, new RegExp(`\\('cloud_ip_marge', ${regles.PARAMETRES.ipMarge}\\)`));
  assert.match(sql07, new RegExp(`cloud_param\\('ip_marge', ${regles.PARAMETRES.ipMarge}\\)`));
  assert.match(sql07, new RegExp(`cloud_param\\('ip_prolongation_espacement_jours', ${regles.PARAMETRES.ipProlongationEspacementJours}\\)`));
  assert.match(sql07, /\('cloud_ip_paiement_carte', 0\)/);
  assert.ok(!/cloud_param\('ip_budget_mensuel_usd'/.test(sql07), 'le plafond en dollars n’est plus lu');
  assert.match(sql07, /PERFORM pg_advisory_xact_lock\(hashtextextended\('cloud_ip_depense', 0\)\);\n  IF p_nature = 'achat' THEN\n    v_garde := public\.cloud_ip_garde_nombre\(p_quantite\);/,
    'la garde du nombre se lit SOUS le verrou de la dépense');
  assert.match(sql, new RegExp(`cloud_param\\('refus_revisite_jours', ${regles.PARAMETRES.refusRevisiteJours}\\)`));
  assert.match(sql, /IF p_critere IN \('blocage_anti_robot', 'captcha_repete'\) THEN/);
  assert.ok(regles.CRITERES_PAR_PLATEFORME.every((c) => sql.includes(`'${c}'`)));
  assert.ok(existsSync(fileURLToPath(new URL('../deploiement/systemd/fillsell-pare-feu-maj.path', import.meta.url))));
});

// ── (07/11, décision 1 de Nico) LE RÉAPPROVISIONNEMENT RAPIDE (entretien.reapprovisionnerVite) ─────────────────
function basePool({ ips = [], commandes = [], attente = 0, etat = {}, params = {}, ouvrir = { ok: true, id: 7 } } = {}) {
  const appels = [];
  const lignes = (table) => (table === 'cloud_ips' ? ips : table === 'cloud_ip_commandes' ? commandes : []);
  return {
    appels, ips, commandes,
    async rpc(nom, a) {
      appels.push([nom, a]);
      if (nom === 'cloud_param') return { data: params[a.p_cle] ?? a.p_defaut, error: null };
      if (nom === 'cloud_pool_etat') return { data: { en_attente: attente, commandes_en_cours: commandes.reduce((n, c) => n + c.quantite, 0), comptes_sans_place: 0, essais_7j: 0, ...etat }, error: null };
      if (nom === 'cloud_ip_depense_ouvrir') return { data: ouvrir, error: null };
      return { data: true, error: null };
    },
    from(table) {
      appels.push(['from', table]);
      let compte = false;
      const q = { select(c, o) { compte = Boolean(o?.head); return q; }, eq() { return q; }, in() { return q; }, gte() { return q; },
        then(r, k) { return Promise.resolve(compte ? { count: attente, error: null } : { data: lignes(table), error: null }).then(r, k); } };
      return q;
    },
  };
}
const ipPool = (id, etat, x = {}) => ({ id, commande: `c${id}`, ip: `10.9.0.${id}`, port: 12323, etat, expire_le: iso(Date.now() + 25 * J), attributions: 0, refus: {}, ...x });
const entretienRapide = ({ base, iproyal, attendre = null }) => {
  const appro = creerApprovisionnement({ base, iproyal, regles, journal, alertes: null, attendreLivraisonMs: 0 });
  if (attendre) { const acheter = appro.acheter; appro.acheter = async (...a) => { await attendre; return acheter(...a); }; }
  return creerEntretien({ config: { entretienPool: true }, base, iproyal, regles, journal, approvisionnement: appro, alertes: null,
    fournisseurIp: { async solde() { return { montant: 50, devise: 'USD' }; }, async rotationActive() { return false; } },
    pareFeu: { async synchroniser() { return { appliquees: null }; }, async appliquees() { return null; } }, controles: null, navigateurs: { ouverts: () => [] } });
};

test('réapprovisionnement rapide : rien sans le serveur (aucune lecture) ni sans l’interrupteur ; pool complet = trois petites lectures, aucun achat', async () => {
  const b0 = basePool();
  assert.deepEqual(await entretienRapide({ base: b0, iproyal: fauxIproyal({ achatsAutorises: false }) }).reapprovisionnerVite(), { coupe: 'serveur' });
  assert.deepEqual(b0.appels, [], 'IPROYAL_ACHATS_AUTORISES absent : pas une lecture');
  const b1 = basePool({ ips: [ipPool(42, 'attribuee_client', { user_id: 'nico' })] });
  const i1 = fauxIproyal();
  assert.deepEqual(await entretienRapide({ base: b1, iproyal: i1 }).reapprovisionnerVite(), { coupe: 'interrupteur' });
  assert.ok(b1.appels.every((x) => x[0] === 'cloud_param'), 'cloud_ip_achats_auto = 0 : seulement les réglages');
  assert.ok(!i1.gestes.some((x) => x[0] === 'commander'));
  const b2 = basePool({ ips: [ipPool(42, 'attribuee_client', { user_id: 'nico' }), ipPool(1, 'disponible'), ipPool(2, 'disponible'), ipPool(3, 'achetee')],
    params: { ip_achats_auto: 1 } });
  const i2 = fauxIproyal();
  const r = await entretienRapide({ base: b2, iproyal: i2 }).reapprovisionnerVite();
  assert.equal(r.aCommander, 0);
  assert.deepEqual(b2.appels.filter((x) => x[0] === 'from').map((x) => x[1]), ['cloud_ips', 'cloud_ip_commandes', 'cloud_attente'], 'trois petites tables');
  assert.ok(!b2.appels.some((x) => x[0] === 'cloud_pool_etat'), 'marge pleine : l’état complet n’est même pas lu');
  assert.ok(!i2.gestes.some((x) => x[0] === 'commander'));
});

test('réapprovisionnement rapide : il manque des IP à la marge → l’état du pool (garde du nombre), puis UN achat de ce qui manque ; jamais deux à la fois', async () => {
  const base = basePool({ ips: [ipPool(42, 'attribuee_client', { user_id: 'nico' }), ipPool(1, 'disponible')], params: { ip_achats_auto: 1 } });
  const iproyal = fauxIproyal({ prix: 8 });
  let lacher; const attendre = new Promise((ok) => { lacher = ok; });
  const e = entretienRapide({ base, iproyal, attendre });
  const p1 = e.reapprovisionnerVite();
  await new Promise((ok) => setTimeout(ok, 20));
  assert.deepEqual(await e.reapprovisionnerVite(), { occupe: true }, 'un seul à la fois');
  assert.deepEqual(await e.tour(), { occupe: true }, 'ni pendant lui l’entretien horaire (index.js le relance 3 min plus tard)');
  lacher();
  const r = await p1;
  assert.equal(r.aCommander, 2, 'marge 3, une IP prête → 2');
  assert.equal(r.achat.fait, true);
  assert.deepEqual(iproyal.gestes.filter((x) => x[0] === 'commander'), [['commander', 2, 22, null]]);
  const ouvrir = base.appels.find((x) => x[0] === 'cloud_ip_depense_ouvrir')[1];
  assert.deepEqual([ouvrir.p_nature, ouvrir.p_quantite], ['achat', 2], 'registre AVANT la commande, la base revérifie sous verrou');
  // La base refuse (un autre serveur vient d'acheter) : rien chez IPRoyal.
  const b2 = basePool({ ips: [ipPool(42, 'attribuee_client', { user_id: 'nico' })], params: { ip_achats_auto: 1 }, ouvrir: { ok: false, raison: 'garde_nombre' } });
  const i2 = fauxIproyal();
  assert.equal((await entretienRapide({ base: b2, iproyal: i2 }).reapprovisionnerVite()).achat.raison, 'garde_nombre');
  assert.ok(!i2.gestes.some((x) => x[0] === 'commander'));
  // Des commandes en cours couvrent le manque : aucune nouvelle (les IP en commande comptent).
  const b3 = basePool({ ips: [ipPool(42, 'attribuee_client', { user_id: 'nico' })], params: { ip_achats_auto: 1 },
    commandes: [{ id: 9, commande: '99001', quantite: 3, demandee_le: iso(Date.now()), statut: 'en_cours' }] });
  const i3 = fauxIproyal();
  assert.equal((await entretienRapide({ base: b3, iproyal: i3 }).reapprovisionnerVite()).aCommander, 0);
  assert.ok(i3.gestes.some((x) => x[0] === 'lire'), 'la livraison de la commande en cours est relue');
  assert.ok(!i3.gestes.some((x) => x[0] === 'commander'));
});

test('entretien horaire : une livraison relit le pool AVANT le plan (jamais racheter ce qui vient d’arriver) ; le solde est jugé sur 14 jours', async () => {
  const ips = [ipPool(42, 'attribuee_client', { user_id: 'nico' })];
  const commandes = [{ id: 9, commande: '99001', quantite: 3, demandee_le: iso(Date.now()), statut: 'en_cours' }];
  const base = basePool({ ips, commandes, params: { ip_achats_auto: 1 } });
  // Livraison : IPRoyal rend les 3 IP ; la base les ajoute (cloud_ip_ajouter) et ferme la commande.
  const iproyal = fauxIproyal({ livree: { status: 'confirmed', expire_date: '2026-12-07 12:00:00', proxy_data: { proxies: [{ ip: '10.9.1.1' }, { ip: '10.9.1.2' }, { ip: '10.9.1.3' }] } } });
  const rpc = base.rpc;
  base.rpc = async (nom, a) => {
    if (nom === 'cloud_ip_ajouter') { ips.push(ipPool(100 + ips.length, 'achetee', { ip: a.p_ip })); return { data: 1, error: null }; }
    if (nom === 'cloud_ip_depense_fermer' && a.p_statut === 'livree') { commandes.length = 0; return { data: true, error: null }; }
    return rpc(nom, a);
  };
  const soldes = [];
  const e = creerEntretien({ config: { entretienPool: true, dossierProfils: tmpdir() }, base, iproyal, regles, journal, alertes: { async signaler() {} },
    approvisionnement: creerApprovisionnement({ base, iproyal, regles, journal, alertes: null, attendreLivraisonMs: 0 }),
    fournisseurIp: { async verifierSolde(t, o) { soldes.push(o); return { montant: 21.15 }; }, async rotationActive() { return false; } },
    pareFeu: { async synchroniser() { return { appliquees: null }; }, async appliquees() { return null; } },
    controles: { async controler() { return null; } }, navigateurs: { ouverts: () => [] }, coffre: {}, sessions: {} });
  const b = await e.tour();
  assert.equal(b.livraisons, 3);
  assert.equal(b.plan.aCommander, 0, 'les 3 IP livrées sont vues : rien à racheter');
  assert.ok(!iproyal.gestes.some((x) => x[0] === 'commander'));
  assert.equal(soldes.length, 1);
  assert.equal(soldes[0].alerter, true, 'paiement par le solde : l’alerte du solde vaut');
  assert.deepEqual([soldes[0].projection.horizonJours, soldes[0].projection.achats, soldes[0].projection.prixIpUsd], [14, 3, 4], 'achats ≥ la marge, prix lu au catalogue');
});

test('IPRoyal : card_id dans le corps de la commande et de la prolongation en mode carte, jamais sinon ; le statut HTTP voyage avec l’erreur', async () => {
  const corps = [];
  const avant = globalThis.fetch;
  let statut = 200;
  globalThis.fetch = async (url, o) => { corps.push([url, o.method, o.body ? JSON.parse(o.body) : null]);
    return { ok: statut < 300, status: statut, json: async () => ({ data: { id: 1, expire_date: '2026-12-07 12:00:00' } }) }; };
  try {
    const i = creerIproyal({ jeton: 'x', achatsAutorises: true, journal });
    const cat = { produitId: 9, planId: 22, lieuId: 25 };
    await i.commander(2, cat); await i.commander(2, cat, { carteId: 12 });
    await i.prolonger('87509051', 22); await i.prolonger('87509051', 22, { carteId: 12 });
    await i.cartes();
    assert.deepEqual(corps.map((c) => c[2]?.card_id ?? null), [null, 12, null, 12, null]);
    assert.equal(corps[0][2].auto_extend, false, 'jamais de renouvellement automatique chez IPRoyal');
    assert.match(corps[4][0], /\/cards$/); assert.equal(corps[4][1], 'GET');
    statut = 402;
    await assert.rejects(i.commander(1, cat, { carteId: 12 }), (e) => e.statut === 402 && /HTTP 402/.test(e.message));
  } finally { globalThis.fetch = avant; }
});
