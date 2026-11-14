// (14/11, règle de Nico) VERROU — « IP attribuées + 2 de marge, pas plus » : l'orchestrateur PROLONGE LUI-MÊME, sur le
// solde IPRoyal, AVANT l'échéance, les seules IP utiles (attribuées + la marge de coin_config cloud_ip_marge) ; une commande
// IPRoyal absente de cloud_ips n'est JAMAIS prolongée ; un solde qui ne suffit pas = rien de payé et Nico prévenu
// (« RECHARGER LE SOLDE ») ; (14/11) une rupture de stock d'IP neuves chez IPRoyal ne bloque plus une prolongation.
//   npm run selftest:cloud-ip-prolongation      (node --test serveur-cloud/tests/ip-prolongation.test.mjs)
// Données synthétiques (aucune IP ni commande réelle).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as regles from '../../supabase/functions/_shared/cloud-pool.js';
import { lireCatalogueIsp } from '../src/iproyal.js';
import { creerApprovisionnement } from '../src/approvisionnement.js';
import { creerEntretien } from '../src/entretien.js';

const journal = { info() {}, alerte() {}, erreur() {} };
const J = 86_400_000, H = 3_600_000;
const iso = (t) => new Date(t).toISOString();
const ipr = (t) => iso(t).slice(0, 19).replace('T', ' ');   // une date IPRoyal (UTC, sans fuseau)
const catalogue = (epuisee = false) => [{ id: 9, name: 'ISP Dedicated', plans: [{ id: 22, name: '30 Days', price: 4 }],
  locations: [{ id: 2, name: 'Europe', child_locations: [{ id: 25, name: 'France', ...(epuisee ? { out_of_stock: true } : {}) }] }] }];

/** Un faux IPRoyal qui connaît des commandes (dont des INCONNUES de notre base) et note chaque prolongation. */
function fauxIproyal({ commandes, epuisee = false }) {
  const gestes = [];
  return {
    gestes, disponible: true, achatsAutorises: true,
    async catalogueIsp(o) { return lireCatalogueIsp(catalogue(epuisee), o); },
    async prixCommande(n) { return 4 * n; },
    async commander(n) { gestes.push(['commander', n]); return { id: 99001 }; },
    async prolonger(c, plan) {
      gestes.push(['prolonger', String(c), plan]);
      const cmd = commandes.get(String(c));
      cmd.expire = cmd.expire + 30 * J;
      return { expire_date: ipr(cmd.expire) };
    },
    async lireCommande(c) {
      const cmd = commandes.get(String(c));
      return { status: 'confirmed', expire_date: ipr(cmd.expire), proxy_data: { proxies: [{ ip: cmd.ip }] } };
    },
    urlProxy() { return 'http://u:p@x:12323'; },
  };
}
function fausseBase({ ips, params }) {
  const appels = [];
  return {
    appels,
    async rpc(nom, a) {
      appels.push([nom, a]);
      if (nom === 'cloud_param') return { data: params[a.p_cle] ?? a.p_defaut, error: null };
      if (nom === 'cloud_pool_etat') return { data: { en_attente: 0, commandes_en_cours: 0, comptes_sans_place: 0, essais_7j: 2 }, error: null };
      if (nom === 'cloud_pool_entretien') return { data: {}, error: null };
      if (nom === 'cloud_ip_a_visiter') return { data: [], error: null };
      if (nom === 'cloud_ip_depense_ouvrir') return { data: { ok: true, id: 500 + appels.length }, error: null };
      if (nom === 'cloud_ip_renouvelee') { const i = ips.find((x) => x.id === a.p_ip); if (Date.parse(a.p_expire_le) > Date.parse(i.expire_le)) i.expire_le = a.p_expire_le; return { data: true, error: null }; }
      return { data: true, error: null };
    },
    from(table) {
      const q = { select() { return q; }, eq() { return q; }, in() { return q; }, gte() { return q; },
        then(r, k) { return Promise.resolve({ data: table === 'cloud_ips' ? ips.map((x) => ({ ...x })) : [], error: null }).then(r, k); } };
      return q;
    },
  };
}
function entretien({ base, iproyal, solde, dits }) {
  const alertes = { async signaler(n, t) { dits.push(t); } };
  return creerEntretien({ config: { entretienPool: true }, base, iproyal, regles, journal, alertes, controles: { async controler() { return null; } },
    approvisionnement: creerApprovisionnement({ base, iproyal, regles, journal, alertes, attendreLivraisonMs: 0 }),
    fournisseurIp: { async verifierSolde() { return { montant: solde, devise: 'USD' }; }, async solde() { return { montant: solde }; }, async rotationActive() { return false; } },
    pareFeu: { async synchroniser() { return { appliquees: null }; }, async appliquees() { return null; } }, navigateurs: { ouverts: () => [] }, coffre: {}, sessions: {} });
}

/**
 * Le décor : 6 IP attribuées (deux échoient dans 2 j et 2,5 j, les autres dans 20 j), 4 IP libres saines qui ne couvrent
 * plus un essai (8 j), une au rebut ; et chez IPRoyal deux commandes INCONNUES de notre base qui échoient dans 2 j.
 */
function decor() {
  const now = Date.now();
  const saine = { verdict: 'saine', saine_le: iso(now - H), le: iso(now - H), operateur: { rang: 0 } };
  const ips = [];
  const commandes = new Map();
  const ajouter = (id, etat, jours, x = {}) => {
    const expire = now + jours * J;
    ips.push({ id, commande: `7000${id}`, ip: `10.7.0.${id}`, port: 12323, etat, expire_le: iso(expire), attributions: 1, refus: {}, sante: saine, user_id: null, ...x });
    commandes.set(`7000${id}`, { ip: `10.7.0.${id}`, expire });
  };
  ajouter(1, 'attribuee_essai', 2, { user_id: 'a1' });
  ajouter(2, 'attribuee_client', 2.5, { user_id: 'a2' });
  for (const id of [3, 4, 5, 6]) ajouter(id, 'attribuee_essai', 20, { user_id: `a${id}` });
  for (const id of [11, 12, 13, 14]) ajouter(id, 'disponible', 8);
  ajouter(20, 'rebut', 2, { rebut_critere: 'manuel', rebut_le: iso(now - J) });
  commandes.set('83000001', { ip: '10.7.9.1', expire: now + 2 * J });   // inconnues de cloud_ips
  commandes.set('86000002', { ip: '10.7.9.2', expire: now + 2 * J });
  return { ips, commandes };
}
const PARAMS = { ip_renouvellement_auto: 1, ip_achats_auto: 1, ip_renouveler_saines_seulement: 1, ip_sante_controle: 1 };

test('D2 : l’entretien prolonge LUI-MÊME, avant l’échéance, les attribuées qui échoient + la marge (2), rien de plus ; jamais une commande inconnue', async () => {
  const { ips, commandes } = decor();
  const iproyal = fauxIproyal({ commandes });
  const base = fausseBase({ ips, params: { ...PARAMS, ip_marge: 2 } });
  const dits = [];
  const b = await entretien({ base, iproyal, solde: 100, dits }).tour();
  const prolongees = iproyal.gestes.filter((g) => g[0] === 'prolonger').map((g) => g[1]);
  assert.ok(prolongees.includes('70001') && prolongees.includes('70002'), 'les deux attribuées qui échoient sous 3 jours');
  assert.equal(prolongees.filter((c) => ['700011', '700012', '700013', '700014'].includes(c)).length, 2, 'la marge : 2 IP libres, pas plus');
  assert.equal(prolongees.length, 4, `attribuées qui échoient (2) + marge (2) : ${prolongees.join(', ')}`);
  assert.ok(!prolongees.some((c) => ['83000001', '86000002'].includes(c)), 'une commande absente de cloud_ips n’est JAMAIS prolongée');
  assert.ok(!prolongees.includes('700020'), 'jamais une IP au rebut');
  assert.ok(!prolongees.some((c) => ['70003', '70004', '70005', '70006'].includes(c)), 'une attribuée qui a 20 jours devant elle attend');
  assert.ok(iproyal.gestes.filter((g) => g[0] === 'prolonger').every((g) => g[2] === 22), 'l’offre 30 jours du catalogue, payée par le solde');
  const ouvertes = base.appels.filter((x) => x[0] === 'cloud_ip_depense_ouvrir').map((x) => x[1]);
  assert.ok(ouvertes.every((o) => o.p_nature === 'prolongation' && o.p_details.paiement === 'solde'), 'registre AVANT le geste, paiement : le solde');
  assert.equal(b.plan.aCommander, 0, 'rien à acheter : attribuées + 2');
  assert.ok(!iproyal.gestes.some((g) => g[0] === 'commander'));
  // Les deux attribuées : échéance repoussée de 30 jours en base (cloud_ip_renouvelee).
  assert.ok(Date.parse(ips.find((x) => x.id === 1).expire_le) - Date.now() > 31 * J);
  // La même règle avec la marge de la prod au 13/11 (cloud_ip_marge = 3) : une libre de plus — c'est le réglage qui décide.
  const d3 = decor();
  const i3 = fauxIproyal({ commandes: d3.commandes });
  await entretien({ base: fausseBase({ ips: d3.ips, params: { ...PARAMS, ip_marge: 3 } }), iproyal: i3, solde: 100, dits: [] }).tour();
  assert.equal(i3.gestes.filter((g) => g[0] === 'prolonger').length, 5, 'marge 3 → attribuées + 3');
});

test('D2 : solde insuffisant → rien de payé au-delà du solde, Nico prévenu « RECHARGER LE SOLDE » (et la veille, sur 14 jours)', async () => {
  const { ips, commandes } = decor();
  const iproyal = fauxIproyal({ commandes });
  const dits = [];
  await entretien({ base: fausseBase({ ips, params: { ...PARAMS, ip_marge: 2 } }), iproyal, solde: 5, dits }).tour();
  assert.equal(iproyal.gestes.filter((g) => g[0] === 'prolonger').length, 1, '5 $ : une seule prolongation à 4 $ ; jamais de dette');
  assert.ok(dits.some((t) => /^Renouvellement d'IP NON FAIT : solde IPRoyal 1\.00 \$, il faut 4\.00 \$ \(manque 3\.00 \$\)\. RECHARGER LE SOLDE/.test(t)), dits.join('\n'));
  // La veille : le seuil du solde (14 jours) compte ces prolongations — l'alerte part bien avant l'échéance.
  const s = regles.seuilSoldeProjete({ ips: decor().ips, registre: [], marge: 2, prixIpUsd: 4 });
  assert.deepEqual([s.renouvellements, s.seuilUsd], [4, 24], `2 attribuées + 2 de marge à renouveler, + 2 achats (la marge) : ${JSON.stringify(s)}`);
});

test('D2 (14/11) : le contrôle de santé (qui prouve les « saines » de la marge) ne part plus au même instant que le réapprovisionnement', async () => {
  // En prod (13/11 soir) : aucun « sante_ip » au journal en 1 h 45, l'IP 78 due ; les deux minuteries de 5 min partaient
  // ensemble, le réapprovisionnement prenait le verrou et la santé repartait « occupe ». Sans santé, « saines d'abord » ne
  // renouvelle aucune IP libre : la marge expire et se rachète.
  const { dephasageSanteMs } = await import('../src/entretien.js');
  assert.equal(dephasageSanteMs(5, 5), 150_000, 'une demi-période (2 min 30) après le réapprovisionnement');
  assert.equal(dephasageSanteMs(5, 0), 0, 'réapprovisionnement coupé : aucun déphasage');
  assert.equal(dephasageSanteMs(10, 5), 150_000);
  const { readFileSync } = await import('node:fs');
  const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(index, /setTimeout\(\(\) => \{ t8 = setInterval\(tourSante, config\.santeIpMin \* 60_000\); tourSante\(\); \}, dephasageSanteMs\(config\.santeIpMin, config\.reapproRapideMin\)/,
    'index.js : la minuterie de santé part déphasée');
  assert.ok(!/const t8 = config\.santeIpMin > 0 \? setInterval\(tourSante/.test(index), 'plus de minuterie de santé alignée sur celle du réapprovisionnement');
});

test('D2 (14/11) : « France épuisée » chez IPRoyal ne bloque JAMAIS la prolongation d’une IP déjà à nous', async () => {
  const { ips, commandes } = decor();
  const iproyal = fauxIproyal({ commandes, epuisee: true });
  const base = fausseBase({ ips, params: { ...PARAMS, ip_marge: 2 } });
  const a = creerApprovisionnement({ base, iproyal, regles, journal, alertes: null });
  const r = await a.renouveler({ renouveler: [1] }, ips, await a.gardes(), { montant: 50 }, { registre: [] });
  assert.equal(r[0].fait, true, `l’IP du client est prolongée (raison : ${r[0].raison ?? 'ok'})`);
  assert.deepEqual(iproyal.gestes.filter((g) => g[0] === 'prolonger'), [['prolonger', '70001', 22]]);
  // L'ACHAT d'IP neuves, lui, reste refusé quand la France est épuisée (on n'achète pas à l'aveugle).
  assert.throws(() => lireCatalogueIsp(catalogue(true)), /épuisée/);
});
