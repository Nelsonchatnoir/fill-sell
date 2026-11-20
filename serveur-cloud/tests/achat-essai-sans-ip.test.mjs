// (20/11/2026 soir, BLOC D DE NICO) L'essai Cloud démarre tout de suite quand une IP est en route (migration 20261120230000,
// place promise) : l'achat de cette IP ne doit plus s'arrêter une heure au premier raté. Sans réseau ni base :
//   · pauseApresEchec — un compte Cloud actif attend une IP : nouvel essai après 5 min, au plus 3 achats ratés par heure ;
//     personne n'attend : la pause d'une heure, comme avant ;
//   · une ISSUE INCONNUE (5xx, coupure) n'est jamais rejouée à l'aveugle : la ligne du registre reste « demandee », relue chez
//     IPRoyal (GET /orders) — adoptée si IPRoyal a la commande, close en échec si IPRoyal n'a rien, douteuse sinon (rien
//     racheté) ; IPRoyal illisible = rien racheté ;
//   · listerCommandes lit toutes les pages, jamais une liste coupée ;
//   · l'entretien passe `urgent` (comptes_sans_place) et note le solde en base seulement quand il change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as regles from '../../supabase/functions/_shared/cloud-pool.js';
import { lireCatalogueIsp, creerIproyal } from '../src/iproyal.js';
import {
  creerApprovisionnement, pauseApresEchec, rapprocherIssuesInconnues,
  ECHEC_ACHAT_PAUSE_MS, ECHEC_ACHAT_REESSAI_MS, ECHEC_ACHAT_MAX_PAR_HEURE, ISSUE_INCONNUE_RELECTURE_MS,
} from '../src/approvisionnement.js';

const journal = { info() {}, alerte() {}, erreur() {} };
const T0 = Date.parse('2026-11-20T20:00:00Z');
const MIN = 60_000;
const CATALOGUE = [{ id: 9, name: 'ISP Dedicated', plans: [{ id: 22, name: '30 Days', price: 4, min_quantity: 1 }],
  locations: [{ id: 2, name: 'Europe', child_locations: [{ id: 25, name: 'France' }] }] }];
const GARDE_OK = { vivantes: 16, en_commande: 0, comptes: 17, marge: 6, attente: 0 };
const plan = { renouveler: [], aCommander: 1, vise: 7, projete: 0, garde: regles.gardePour(GARDE_OK, 1) };

/** Une fausse base qui tient un vrai registre (cloud_ip_commandes) : ouvrir, fermer, mettre à jour, lire. */
function baseRegistre({ connues = ['89090351'], pool = [] } = {}) {
  const registre = [];
  const appels = [];
  let id = 100;
  const requete = (table) => {
    const filtres = [];
    let maj = null;
    const q = {
      select() { return q; },
      eq(col, v) { filtres.push((r) => r[col] === v); return q; },
      in(col, vs) { filtres.push((r) => vs.includes(r[col])); return q; },
      update(v) { maj = v; return q; },
      then(res, rej) {
        const lignes = table === 'cloud_ip_commandes'
          ? [...connues.map((c, k) => ({ id: k + 1, nature: 'achat', statut: 'livree', commande: c, quantite: 1 })), ...registre]
          : table === 'cloud_ips' ? pool.map((c) => ({ commande: c })) : [];
        const choisies = lignes.filter((r) => filtres.every((f) => f(r)));
        if (maj) { for (const r of choisies) Object.assign(r, maj); appels.push(['update', table, maj]); }
        return Promise.resolve({ data: choisies.map((r) => ({ ...r })), error: null }).then(res, rej);
      },
    };
    return q;
  };
  return {
    registre, appels,
    async rpc(nom, a) {
      appels.push([nom, a]);
      if (nom === 'cloud_param') return { data: ({ ip_achats_auto: 1 })[a.p_cle] ?? a.p_defaut, error: null };
      if (nom === 'cloud_ip_depense_ouvrir') {
        const ligne = { id: ++id, nature: 'achat', statut: 'demandee', commande: null, quantite: a.p_quantite, demandee_le: null, details: a.p_details };
        ligne.demandee_le = new Date(horloge.t).toISOString();
        registre.push(ligne);
        return { data: { ok: true, id: ligne.id }, error: null };
      }
      if (nom === 'cloud_ip_depense_fermer') {
        const l = registre.find((r) => r.id === a.p_id && ['demandee', 'en_cours'].includes(r.statut));
        if (l) { l.statut = a.p_statut; l.commande = a.p_commande ?? l.commande; l.details = { ...l.details, ...a.p_details }; }
        return { data: Boolean(l), error: null };
      }
      return { data: true, error: null };
    },
    from: requete,
  };
}
const horloge = { t: T0 };
/** Un faux IPRoyal : `echecs` = les statuts HTTP des prochains appels POST /orders (null = réussi) ; `commandes` = GET /orders. */
function fauxIproyal({ echecs = [], commandes = [], lister = true } = {}) {
  const gestes = [];
  const i = {
    gestes, disponible: true, achatsAutorises: true,
    async catalogueIsp() { return lireCatalogueIsp(CATALOGUE); },
    async prixCommande() { return 4; },
    async commander(n) {
      gestes.push(['commander', n]);
      const s = echecs.shift();
      if (s) { const e = new Error(`IPRoyal POST /orders → HTTP ${s}`); e.statut = s; throw e; }
      return { id: 89100000 + gestes.length };
    },
    async lireCommande() { return { status: 'in-progress', proxy_data: { proxies: [] } }; },
    urlProxy() { return null; },
    commandes,
  };
  if (lister) i.listerCommandes = async () => { gestes.push(['lister']); return i.commandes; };
  return i;
}
const creer = (base, iproyal, dits = []) => creerApprovisionnement({ base, iproyal, regles, journal, attendreLivraisonMs: 0,
  alertes: { async signaler(n, t) { dits.push(t); }, async resoudre() {} }, maintenant: () => horloge.t });
const nCommander = (i) => i.gestes.filter((g) => g[0] === 'commander').length;

test('pauseApresEchec : personne n’attend → une heure ; un compte actif attend → 5 min, au plus 3 ratés par heure', () => {
  assert.deepEqual(pauseApresEchec({ echecs: [], maintenant: T0 }), { permis: true });
  assert.equal(pauseApresEchec({ echecs: [T0], maintenant: T0 + 30 * MIN }).raison, 'echec_recent', 'comme avant : 30 min après, rien');
  assert.equal(pauseApresEchec({ echecs: [T0], maintenant: T0 + ECHEC_ACHAT_PAUSE_MS }).permis, true, 'comme avant : une heure après');
  assert.equal(pauseApresEchec({ echecs: [T0], maintenant: T0 + 2 * MIN, urgent: true }).raison, 'echec_recent');
  assert.equal(pauseApresEchec({ echecs: [T0], maintenant: T0 + 5 * MIN, urgent: true }).permis, true, 'le tour suivant (5 min) réessaie');
  assert.ok(ECHEC_ACHAT_REESSAI_MS <= 5 * MIN && ECHEC_ACHAT_REESSAI_MS >= 4 * MIN, 'un tour de réapprovisionnement rapide, avec du jeu');
  assert.equal(ECHEC_ACHAT_MAX_PAR_HEURE, 3);
  const trois = [T0, T0 + 5 * MIN, T0 + 10 * MIN];
  const p = pauseApresEchec({ echecs: trois, maintenant: T0 + 15 * MIN, urgent: true });
  assert.equal(p.raison, 'echecs_repetes'); assert.equal(p.reprise, T0 + 60 * MIN, 'reprise quand le plus ancien des 3 sort de l’heure');
  assert.equal(pauseApresEchec({ echecs: trois, maintenant: T0 + 61 * MIN, urgent: true }).permis, true);
});

test('rapprocherIssuesInconnues : aucune commande → close ; la sienne → adoptée ; doute → rien décidé', () => {
  const lignes = [{ id: 7, quantite: 1 }];
  const connues = ['89083468', '89090351'];
  assert.deepEqual(rapprocherIssuesInconnues({ lignes, commandes: [{ id: 89090351, quantity: 1 }], connues }).fermer, [7], 'IPRoyal n’a rien de neuf : rien payé');
  assert.deepEqual(rapprocherIssuesInconnues({ lignes, commandes: [{ id: 89090351, quantity: 1 }, { id: 89100001, quantity: 1, product_name: 'ISP Dedicated' }], connues }).adopter,
    [{ id: 7, commande: '89100001' }], 'la commande inconnue la plus récente est la sienne');
  assert.deepEqual(rapprocherIssuesInconnues({ lignes, commandes: [{ id: 89000001, quantity: 1 }], connues }).fermer, [7], 'une vieille commande inconnue (plus ancienne que les connues) n’est jamais la sienne');
  assert.deepEqual(rapprocherIssuesInconnues({ lignes, commandes: [{ id: 89100001, quantity: 2 }], connues }).douteuses, [7], 'quantité différente : douteuse');
  assert.deepEqual(rapprocherIssuesInconnues({ lignes, commandes: [{ id: 89100001, quantity: 1 }, { id: 89100002, quantity: 1 }], connues }).douteuses, [7], 'deux candidates pour une ligne : douteuse');
  assert.deepEqual(rapprocherIssuesInconnues({ lignes, commandes: [{ id: 89100001, quantity: 1, product_name: 'Datacenter Dedicated' }], connues }).fermer, [7], 'un autre produit n’est jamais la sienne');
});

test('un compte actif attend : achat refusé (4xx, sûr) → nouvel essai au tour suivant, au plus 3 par heure', async () => {
  horloge.t = T0;
  const base = baseRegistre();
  const iproyal = fauxIproyal({ echecs: [400, 400, 400, 400] });
  const dits = [];
  const a = creer(base, iproyal, dits);
  const g = await a.gardes();
  const essai = () => a.acheter(plan, g, { montant: 70 }, { urgent: true });
  assert.equal((await essai()).raison, 'echec');
  assert.equal(base.registre[0].statut, 'echec', 'un refus (4xx) est sûr : clos en échec');
  assert.ok(dits.some((d) => /ÉCHOUÉ .*nouvel essai dans 5 min \(au plus 3 par heure\)/.test(d)), JSON.stringify(dits));
  horloge.t += 2 * MIN;
  assert.equal((await essai()).raison, 'echec_recent'); assert.equal(nCommander(iproyal), 1, '2 min après : rien');
  horloge.t += 3 * MIN;
  assert.equal((await essai()).raison, 'echec'); assert.equal(nCommander(iproyal), 2, '5 min après : un nouvel essai');
  horloge.t += 5 * MIN;
  assert.equal((await essai()).raison, 'echec'); assert.equal(nCommander(iproyal), 3);
  horloge.t += 5 * MIN;
  assert.equal((await essai()).raison, 'echecs_repetes'); assert.equal(nCommander(iproyal), 3, 'jamais plus de 3 ratés par heure');
  horloge.t = T0 + 61 * MIN;
  await essai();
  assert.equal(nCommander(iproyal), 4, 'le plus ancien sorti de l’heure : un essai de plus');
});

test('personne n’attend : la pause d’une heure, comme avant', async () => {
  horloge.t = T0;
  const base = baseRegistre();
  const iproyal = fauxIproyal({ echecs: [400] });
  const dits = [];
  const a = creer(base, iproyal, dits);
  const g = await a.gardes();
  assert.equal((await a.acheter(plan, g, { montant: 70 })).raison, 'echec');
  assert.ok(dits.some((d) => /suspendu une heure/.test(d)));
  horloge.t += 30 * MIN;
  assert.equal((await a.acheter(plan, g, { montant: 70 })).raison, 'echec_recent');
  horloge.t = T0 + 61 * MIN;
  assert.equal((await a.acheter(plan, g, { montant: 70 })).fait, true);
  assert.equal(nCommander(iproyal), 2);
});

test('issue inconnue (5xx) : la ligne reste en route, relue chez IPRoyal ; IPRoyal a la commande → adoptée, JAMAIS rachetée', async () => {
  horloge.t = T0;
  const base = baseRegistre();
  const iproyal = fauxIproyal({ echecs: [502] });
  const dits = [];
  const a = creer(base, iproyal, dits);
  const g = await a.gardes();
  const essai = () => a.acheter(plan, g, { montant: 70 }, { urgent: true });
  assert.equal((await essai()).raison, 'issue_inconnue');
  const l = base.registre[0];
  assert.equal(l.statut, 'demandee', 'jamais close à l’aveugle : comptée en route et par la garde du nombre');
  assert.equal(l.details.issue_inconnue, true); assert.match(l.details.erreur, /HTTP 502/);
  assert.ok(!base.appels.some((x) => x[0] === 'cloud_ip_depense_fermer'), 'rien fermé');
  assert.ok(dits.some((d) => /ISSUE INCONNUE .*relue chez IPRoyal avant tout nouvel essai \(jamais deux paiements\)/.test(d)), JSON.stringify(dits));
  // IPRoyal avait bien pris la commande (lente à répondre) : elle apparaît dans GET /orders.
  iproyal.commandes = [{ id: 89090351, quantity: 1 }, { id: 89100777, quantity: 1, product_name: 'ISP Dedicated' }];
  horloge.t += 2 * MIN;
  assert.equal((await essai()).raison, 'echec_recent', 'avant 5 min : rien');
  horloge.t += 3 * MIN;
  assert.equal((await essai()).raison, 'issue_inconnue_relue', 'relue : adoptée, ce tour n’achète rien');
  assert.equal(l.statut, 'en_cours'); assert.equal(l.commande, '89100777'); assert.equal(l.details.relue, 'commande_trouvee');
  assert.equal(nCommander(iproyal), 1, 'un seul paiement');
  assert.ok(dits.some((d) => /IPRoyal l'a bien prise \(commande 89100777\)/.test(d)));
});

test('issue inconnue : IPRoyal n’a rien → close en échec (rien payé) ; puis le nouvel essai', async () => {
  horloge.t = T0;
  const base = baseRegistre();
  const iproyal = fauxIproyal({ echecs: [503], commandes: [{ id: 89090351, quantity: 1 }] });
  const a = creer(base, iproyal);
  const g = await a.gardes();
  const essai = () => a.acheter(plan, g, { montant: 70 }, { urgent: true });
  assert.equal((await essai()).raison, 'issue_inconnue');
  horloge.t += ISSUE_INCONNUE_RELECTURE_MS - MIN;
  // La livraison (chaque tour) relit aussi : trop jeune, rien décidé.
  assert.equal((await a.livrer(horloge.t)).relues, 0);
  assert.equal(base.registre[0].statut, 'demandee');
  horloge.t = T0 + 5 * MIN;
  const liv = await a.livrer(horloge.t);
  assert.equal(liv.relues, 1, 'la livraison du tour suivant la relit');
  assert.equal(base.registre[0].statut, 'echec'); assert.equal(base.registre[0].details.relue, 'aucune_commande');
  assert.equal((await essai()).fait, true, 'close : le nouvel essai part (5 min après le raté)');
  assert.equal(nCommander(iproyal), 2);
});

test('issue inconnue : IPRoyal illisible (ou douteux) → rien n’est racheté', async () => {
  horloge.t = T0;
  const base = baseRegistre();
  const iproyal = fauxIproyal({ echecs: [500], lister: false });
  const a = creer(base, iproyal);
  const g = await a.gardes();
  assert.equal((await a.acheter(plan, g, { montant: 70 }, { urgent: true })).raison, 'issue_inconnue');
  for (const m of [5, 30, 90]) {
    horloge.t = T0 + m * MIN;
    assert.equal((await a.acheter(plan, g, { montant: 70 }, { urgent: true })).raison, 'issue_inconnue_a_relire', `${m} min après`);
  }
  assert.equal(nCommander(iproyal), 1);
  // Douteux : deux commandes inconnues pour une ligne.
  horloge.t = T0;
  const b2 = baseRegistre();
  const i2 = fauxIproyal({ echecs: [500], commandes: [{ id: 89100001, quantity: 1 }, { id: 89100002, quantity: 1 }] });
  const dits = [];
  const a2 = creer(b2, i2, dits);
  await a2.acheter(plan, await a2.gardes(), { montant: 70 }, { urgent: true });
  horloge.t = T0 + 5 * MIN;
  assert.equal((await a2.acheter(plan, await a2.gardes(), { montant: 70 }, { urgent: true })).raison, 'issue_inconnue_a_relire');
  assert.equal(b2.registre[0].statut, 'demandee'); assert.equal(nCommander(i2), 1);
  assert.ok(dits.some((d) => /ne se rapprochent pas sans doute — RIEN n'est racheté/.test(d)), JSON.stringify(dits));
});

test('listerCommandes : toutes les pages (GET /orders, ISP), jamais une liste coupée', async () => {
  const vu = [];
  const avant = globalThis.fetch;
  const page = (n, k) => Array.from({ length: n }, (_, j) => ({ id: 89000000 + k * 100 + j, quantity: 1 }));
  try {
    globalThis.fetch = async (url) => {
      vu.push(String(url));
      const p = Number(new URL(url).searchParams.get('page'));
      const corps = String(url).includes('/products') ? CATALOGUE : { data: p === 1 ? page(50, 1) : page(3, 2), meta: {} };
      return { ok: true, status: 200, json: async () => corps };
    };
    const i = creerIproyal({ jeton: 'x', achatsAutorises: false, journal });
    const toutes = await i.listerCommandes();
    assert.equal(toutes.length, 53);
    assert.ok(vu.some((u) => /\/orders\?product_id=9&page=2&per_page=50$/.test(u)), vu.join(' '));
    globalThis.fetch = async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes('/products') ? CATALOGUE : { data: page(50, 1) }) });
    await assert.rejects(i.listerCommandes({ pagesMax: 2 }), /liste incomplète/);
  } finally { globalThis.fetch = avant; }
});

test('entretien : `urgent` = un compte Cloud actif sans IP ; le solde noté en base seulement quand il change', () => {
  const src = readFileSync(new URL('../src/entretien.js', import.meta.url), 'utf8');
  assert.equal((src.match(/urgent: \(Number\(etat\?\.comptes_sans_place\) \|\| 0\) > 0/g) ?? []).length, 2, 'l’entretien et le réapprovisionnement rapide');
  assert.match(src, /if \(soldeNote === cents\) return;/);
  assert.match(src, /key: 'cloud_ip_solde_cents'/);
  assert.match(src, /iproyal\?\.achatsAutorises === true \? Math\.max\(0, Math\.floor\(Number\(s\.montant\) \* 100\)\) : 0/);
});
