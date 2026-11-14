// (14/11, règle de Nico) VERROU — « On ne jette JAMAIS une IP payée. Un contrôle sans réponse se retente (attente puis
// nouveaux essais) ; une IP douteuse va en quarantaine et se recontrôle, jamais au rebut automatique ; si une IP reste
// vraiment inutilisable, on le signale à Nico avec la preuve. »
//   npm run selftest:cloud-ip-quarantaine      (node --test serveur-cloud/tests/ip-quarantaine.test.mjs)
// Le cas qui l'a fait naître, rejoué en données synthétiques : le 13/11, une IP livrée à 13:18:11, contrôlée à 13:22:57
// (4 min 46 plus tard) — écho vide (ni sortie ni pays) → cloud_ip_controle_entree → cloud_ip_signaler → REBUT ; puis une
// autre IP achetée à 13:23:00 pour la remplacer. La fausse base joue la base de la PROD du 13/11 (un contrôle d'entrée
// raté = le rebut) : l'orchestrateur doit s'en garder lui-même.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as regles from '../../supabase/functions/_shared/cloud-pool.js';
import { creerApprovisionnement } from '../src/approvisionnement.js';
import { creerEntretien } from '../src/entretien.js';
import { releverControle, CONTROLE_LECTURES, CONTROLE_PAUSE_MS } from '../src/controle.js';
import { ipDuPool } from '../src/fournisseurIp.js';

const journal = { info() {}, alerte() {}, erreur() {} };
const J = 86_400_000, H = 3_600_000, M = 60_000;
const iso = (t) => new Date(t).toISOString();
const RACINE = fileURLToPath(new URL('../..', import.meta.url));

// ── Les faux ────────────────────────────────────────────────────────────────────────────────────────────────────
const CATALOGUE = [{ id: 9, name: 'ISP Dedicated', plans: [{ id: 22, name: '30 Days', price: 4 }], locations: [{ id: 25, name: 'France' }] }];
function fauxIproyal() {
  const gestes = [];
  return {
    gestes, disponible: true, achatsAutorises: true,
    async catalogueIsp() { const { lireCatalogueIsp } = await import('../src/iproyal.js'); return lireCatalogueIsp(CATALOGUE); },
    async prixCommande() { return 4; },
    async commander(n) { gestes.push(['commander', n]); return { id: 99001 }; },
    async prolonger(c) { gestes.push(['prolonger', c]); return { expire_date: '2026-12-31 00:00:00' }; },
    async lireCommande(c) { gestes.push(['lire', c]); return { status: 'in-progress', proxy_data: { proxies: [] } }; },
    urlProxy(cmd, ip) { return `http://u:p@${ip}:12323`; },
  };
}
/**
 * Une fausse base qui JOUE les fonctions : cloud_ip_controle_entree = la prod du 13/11 (manques → REBUT, comme
 * cloud_ip_signaler) ; cloud_ip_quarantaine_noter = la migration 20261114090000 (absente si `migration: false` : la
 * fonction et la colonne manquent, comme en prod avant son application).
 */
function fausseBase({ ips, params = {}, migration = true }) {
  const appels = [];
  const ligne = (id) => ips.find((x) => Number(x.id) === Number(id));
  return {
    appels, ips,
    async rpc(nom, a) {
      appels.push([nom, a]);
      if (nom === 'cloud_param') return { data: params[a.p_cle] ?? a.p_defaut, error: null };
      if (nom === 'cloud_pool_etat') return { data: { en_attente: 0, commandes_en_cours: 0, comptes_sans_place: 0, essais_7j: 0 }, error: null };
      if (nom === 'cloud_pool_entretien') return { data: {}, error: null };
      if (nom === 'cloud_ip_a_visiter') return { data: [], error: null };
      if (nom === 'cloud_proxy_identifiants') { const i = ligne(a.p_ip); return { data: i && !['rebut', 'expiree'].includes(i.etat) ? 'http://u:p@proxy:12323' : null, error: null }; }
      if (nom === 'cloud_ip_controle_entree') {
        const i = ligne(a.p_ip);
        if (!i || i.etat !== 'achetee') return { data: { ok: false, raison: 'pas_achetee' }, error: null };
        const m = regles.manquesControle(a.p_controle, i);
        if (m.length) { Object.assign(i, { etat: 'rebut', rebut_critere: 'controle_entree', rebut_le: iso(Date.now()) }); return { data: { ok: false, raison: 'rebut', manques: m }, error: null }; }
        i.etat = 'disponible';
        return { data: { ok: true }, error: null };
      }
      if (nom === 'cloud_ip_signaler') { const i = ligne(a.p_ip); Object.assign(i, { etat: 'rebut', rebut_critere: a.p_critere, rebut_le: iso(Date.now()) }); return { data: { ok: true, rebut: true }, error: null }; }
      if (nom === 'cloud_ip_quarantaine_noter') {
        if (!migration) return { data: null, error: { message: 'Could not find the function public.cloud_ip_quarantaine_noter(p_controle, p_ip, p_quarantaine) in the schema cache' } };
        const i = ligne(a.p_ip);
        if (!i || !['achetee', 'quarantaine'].includes(i.etat) || i.user_id) return { data: { ok: false, raison: 'etat' }, error: null };
        const m = regles.manquesControle(a.p_controle, i);
        if (!m.length) { const avant = i.etat; Object.assign(i, { etat: 'disponible', quarantaine: null }); return { data: { ok: true, sortie: avant === 'quarantaine' }, error: null }; }
        Object.assign(i, { etat: 'quarantaine', quarantaine: a.p_quarantaine });
        return { data: { ok: false, quarantaine: true, manques: m, essais: a.p_quarantaine?.essais }, error: null };
      }
      if (nom === 'cloud_ip_depense_ouvrir') return { data: { ok: true, id: 7 }, error: null };
      return { data: true, error: null };
    },
    from(table) {
      let colonnes = '', compte = false;
      const q = { select(c, o) { colonnes = String(c ?? ''); compte = Boolean(o?.head); return q; }, eq() { return q; }, in() { return q; }, gte() { return q; },
        then(r, k) {
          if (table === 'cloud_ips' && !migration && /quarantaine/.test(colonnes)) return Promise.resolve({ data: null, error: { message: 'column cloud_ips.quarantaine does not exist' } }).then(r, k);
          const data = table === 'cloud_ips' ? ips.map((x) => ({ ...x })) : [];
          return Promise.resolve(compte ? { count: 0, error: null } : { data, error: null }).then(r, k);
        } };
      return q;
    },
  };
}
const ECHO_VIDE = () => ({ fait_le: iso(Date.now()), ip_sortie: null, pays: null, listes_noires: [], plateformes: { visite: 'aucune' }, lectures: 3 });
const ECHO_BON = (ip) => ({ fait_le: iso(Date.now()), ip_sortie: ip, pays: 'FR', listes_noires: [], plateformes: { visite: 'aucune' }, lectures: 1 });
function fauxControles(reponse) {
  const faits = [];
  return { faits, async controler({ ipId, ip }) { faits.push(ipId); return reponse(ipId, ip); } };
}
const PARE_FEU_OUVERT = { async synchroniser() { return { appliquees: { ports: new Set(['12323']), sorties: new Set() } }; },
  async appliquees() { return { ports: new Set(['12323']), sorties: new Set() }; } };
function entretien({ base, controles, iproyal = fauxIproyal(), dits = [] }) {
  const alertes = { async signaler(n, t, d) { dits.push({ n, t, d }); } };
  return creerEntretien({ config: { entretienPool: true }, base, iproyal, controles, alertes, regles, journal,
    approvisionnement: creerApprovisionnement({ base, iproyal, regles, journal, alertes, attendreLivraisonMs: 0 }),
    fournisseurIp: { async solde() { return { montant: 50, devise: 'USD' }; }, async verifierSolde() { return { montant: 50 }; }, async rotationActive() { return false; } },
    pareFeu: PARE_FEU_OUVERT, navigateurs: { ouverts: () => [] }, coffre: {}, sessions: {} });
}
const ip = (id, etat, x = {}) => ({ id, commande: `c${id}`, ip: `10.8.0.${id}`, port: 12323, etat, user_id: null, expire_le: iso(Date.now() + 30 * J),
  attributions: 0, refus: {}, sante: null, quarantaine: null, livree_le: iso(Date.now() - 10 * J), ...x });

// ── 1. Le cas du 13/11 rejoué ───────────────────────────────────────────────────────────────────────────────────
test('13/11 rejoué : un écho vide 4 min 46 après la livraison → QUARANTAINE (jamais le rebut), et aucune IP rachetée dans la minute', async () => {
  const ips = [ip(42, 'attribuee_client', { user_id: 'u1' }), ip(78, 'disponible'), ip(77, 'achetee', { livree_le: iso(Date.now() - (4 * M + 46_000)) })];
  const base = fausseBase({ ips, params: { ip_achats_auto: 1, ip_marge: 2 } });
  const iproyal = fauxIproyal();
  const controles = fauxControles(() => ECHO_VIDE());
  const r = await entretien({ base, controles, iproyal }).reapprovisionnerVite();
  const i77 = ips.find((x) => x.id === 77);
  assert.deepEqual(controles.faits, [77], 'le contrôle d’entrée a lieu (le délai de livraison est passé)');
  assert.notEqual(i77.etat, 'rebut', 'une IP payée n’est JAMAIS jetée sur un contrôle sans réponse');
  assert.equal(i77.etat, 'quarantaine');
  assert.ok(!base.appels.some((x) => x[0] === 'cloud_ip_signaler'), 'cloud_ip_signaler : jamais par l’automate');
  assert.ok(!base.appels.some((x) => x[0] === 'cloud_ip_controle_entree'), 'un contrôle raté ne va jamais à la fonction qui jetait');
  assert.equal(i77.quarantaine.essais, 1);
  assert.equal(i77.quarantaine.origine, 'controle_entree');
  assert.deepEqual(i77.quarantaine.dernier.manques, ['ip_sortie', 'pays'], 'la preuve garde ce qui manquait');
  const dans = Date.parse(i77.quarantaine.prochain_le) - Date.now();
  assert.ok(dans > 14 * M && dans <= 15 * M, `recontrôle 15 min plus tard (${Math.round(dans / M)} min)`);
  assert.ok(!iproyal.gestes.some((g) => g[0] === 'commander'), 'aucune IP rachetée pour remplacer une IP payée qui va revenir');
  assert.equal(r.aCommander, 0);
});

test('attente : aucun contrôle d’entrée avant 2 min après la livraison ; ensuite oui', async () => {
  const ips = [ip(42, 'attribuee_client', { user_id: 'u1' }), ip(78, 'disponible'), ip(77, 'achetee', { livree_le: iso(Date.now() - 30_000) })];
  const base = fausseBase({ ips, params: { ip_achats_auto: 1, ip_marge: 2 } });
  const controles = fauxControles((id, adr) => ECHO_BON(adr));
  const e = entretien({ base, controles });
  await e.reapprovisionnerVite();
  assert.deepEqual(controles.faits, [], '30 s après la livraison : pas de contrôle (le proxy n’est pas encore actif)');
  assert.equal(ips.find((x) => x.id === 77).etat, 'achetee');
  const b2 = await e.tour();
  assert.deepEqual(controles.faits, [], 'ni par l’entretien horaire');
  assert.equal(b2.entrees_reportees, 1);
  ips.find((x) => x.id === 77).livree_le = iso(Date.now() - 2 * M - 1000);
  await e.reapprovisionnerVite();
  assert.deepEqual(controles.faits, [77]);
  assert.equal(ips.find((x) => x.id === 77).etat, 'disponible', 'un contrôle qui passe : disponible, par cloud_ip_controle_entree');
});

test('nouveaux essais : un écho vide est RELU (3 lectures, 20 s d’écart) ; une réponse lue n’est jamais relue', async () => {
  const pages = ['', '<html><body>ERR_TUNNEL_CONNECTION_FAILED</body></html>', '<pre>{"ip":"10.8.0.77","country":"FR"}</pre>'];
  const lues = [], pauses = [];
  const r = await releverControle(async (u) => { lues.push(u); return pages.shift() ?? ''; }, '10.8.0.77',
    { listes: async () => [], lectures: 3, pauseMs: 20_000, attendre: async (ms) => { pauses.push(ms); } });
  assert.equal(r.ip_sortie, '10.8.0.77'); assert.equal(r.pays, 'FR'); assert.equal(r.lectures, 3);
  assert.deepEqual(pauses, [20_000, 20_000]);
  assert.deepEqual([...new Set(lues)], ['https://ipinfo.io/json'], 'toujours la même cible, jamais une plateforme');
  const autre = await releverControle(async () => '{"ip":"9.9.9.9","country":"DE"}', '10.8.0.77', { listes: async () => [], lectures: 3, pauseMs: 0 });
  assert.equal(autre.lectures, 1, 'une réponse (même douteuse) est le verdict : pas de relecture');
  const muet = await releverControle(async () => '', '10.8.0.77', { listes: async () => [], lectures: 3, pauseMs: 0 });
  assert.deepEqual([muet.ip_sortie, muet.pays, muet.lectures], [null, null, 3]);
  // Le navigateur de contrôle (creerControles) relit comme le disent les règles.
  assert.equal(CONTROLE_LECTURES, regles.PARAMETRES.controleLecturesMax);
  assert.equal(CONTROLE_PAUSE_MS, regles.PARAMETRES.controleLecturePauseS * 1000);
});

// ── 2. La quarantaine : recontrôles espacés, retour au pool, signalement avec la preuve ─────────────────────────────
test('règle : recontrôles à 15 min, 1 h, 4 h puis 12 h ; signalée après 4 échecs étalés sur 24 h, puis un recontrôle par jour', () => {
  let t = Date.parse('2026-11-13T12:22:57Z');
  let q = null;
  const ecarts = [];
  for (let n = 1; n <= 6; n++) {
    q = regles.quarantaineSuivante(q, { fait_le: iso(t), ip_sortie: null, pays: null, listes_noires: [] }, { manques: ['ip_sortie', 'pays'], maintenant: t });
    ecarts.push((Date.parse(q.prochain_le) - t) / M);
    assert.equal(q.essais, n);
    if (n < 6) assert.equal(regles.quarantaineASignaler(q), n >= 4 && t - Date.parse(q.premier_echec_le) >= 24 * H, `essai ${n}`);
    t = Date.parse(q.prochain_le);
  }
  assert.deepEqual(ecarts, [15, 60, 240, 720, 720, 720]);
  // 15 min + 1 h + 4 h + 12 h = 17 h 15 entre le 1er et le 5e : pas encore ; le 6e (29 h 15) : oui.
  assert.equal(regles.quarantaineASignaler(q), true, '6 contrôles ratés sur plus de 24 h');
  assert.equal(regles.quarantaineASignaler({ ...q, essais: 9, premier_echec_le: iso(Date.parse(q.dernier.le) - 5 * H) }), false, 'jamais sur une seule nuit');
  assert.equal(regles.quarantaineASignaler({ ...q, signalee_le: iso(t) }), false, 'jamais deux fois');
  assert.equal(regles.quarantaineEspacementMs(7, { signalee: true }), 24 * H);
  assert.equal(q.preuves.length, 6); assert.equal(q.premier_echec_le, '2026-11-13T12:22:57.000Z');
  const long = Array.from({ length: 12 }).reduce((a, _, k) => regles.quarantaineSuivante(a, { fait_le: iso(t + k * H) }, { manques: ['pays'], maintenant: t + k * H }), null);
  assert.equal(long.preuves.length, regles.PARAMETRES.quarantainePreuvesMax, 'la preuve est bornée');
  const texte = regles.texteSignalementQuarantaine({ id: 77, ip: '10.8.0.77', commande: '42424242', expire_le: '2026-12-13T12:17:51Z' }, q);
  assert.match(texte, /^IP 77 \(10\.8\.0\.77, commande IPRoyal 42424242, payée jusqu'au 13\/12\/2026 13:17\) TOUJOURS INUTILISABLE : 6 contrôles ratés du 13\/11\/2026 13:22/);
  assert.match(texte, /13\/11\/2026 13:22 : ip_sortie, pays \(sortie lue aucune, pays aucun\)/, 'chaque contrôle raté, en heure de Paris');
  assert.match(texte, /reste en QUARANTAINE \(jamais jetée\)/);
});

test('recontrôle : une quarantaine DUE est recontrôlée ; elle rejoint le pool si le contrôle passe ; pas avant son heure', async () => {
  const q = regles.quarantaineSuivante(null, ECHO_VIDE(), { manques: ['ip_sortie', 'pays'], maintenant: Date.now() - 20 * M });
  const ips = [ip(42, 'attribuee_client', { user_id: 'u1' }), ip(77, 'quarantaine', { quarantaine: q })];
  const base = fausseBase({ ips, params: { ip_marge: 2 } });
  const controles = fauxControles((id, adr) => ECHO_BON(adr));
  const dits = [];
  const b = await entretien({ base, controles, dits }).tour();
  assert.deepEqual(controles.faits, [77]);
  assert.equal(ips.find((x) => x.id === 77).etat, 'disponible', 'contrôle passé : retour au pool');
  const appel = base.appels.find((x) => x[0] === 'cloud_ip_quarantaine_noter');
  assert.equal(appel[1].p_quarantaine, null, 'un contrôle bon : la base le juge elle-même et efface la quarantaine');
  assert.deepEqual(b.quarantaine, { ips: [77], due: 77 });
  assert.ok(!dits.some((d) => /SORTIE DE QUARANTAINE/.test(d.t)), 'jamais signalée : rien à dire');
  // Pas encore due : rien.
  const pasDue = { ...q, prochain_le: iso(Date.now() + 10 * M) };
  const ips2 = [ip(77, 'quarantaine', { quarantaine: pasDue })];
  const c2 = fauxControles((id, adr) => ECHO_BON(adr));
  await entretien({ base: fausseBase({ ips: ips2 }), controles: c2 }).tour();
  assert.deepEqual(c2.faits, [], 'avant son heure : pas de recontrôle');
  // Le réapprovisionnement rapide la recontrôle aussi (le 1er recontrôle tombe 15 min après : il n'attend pas l'heure).
  const ips3 = [ip(42, 'attribuee_client', { user_id: 'u1' }), ip(78, 'disponible'), ip(77, 'quarantaine', { quarantaine: q })];
  const c3 = fauxControles(() => ECHO_VIDE());
  const r3 = await entretien({ base: fausseBase({ ips: ips3, params: { ip_achats_auto: 1, ip_marge: 2 } }), controles: c3 }).reapprovisionnerVite();
  assert.deepEqual(c3.faits, [77]); assert.equal(r3.recontrole_quarantaine, 77);
  const i77 = ips3.find((x) => x.id === 77);
  assert.equal(i77.etat, 'quarantaine'); assert.equal(i77.quarantaine.essais, 2);
  assert.equal(Math.round((Date.parse(i77.quarantaine.prochain_le) - Date.now()) / M), 60, '2e échec : recontrôle 1 h plus tard');
});

test('signalement : après des échecs répétés sur 24 h, UNE alerte à Nico avec la preuve ; elle reste en quarantaine ; son retour est dit', async () => {
  const t0 = Date.now() - 30 * H;
  let q = null;
  for (const dt of [0, 15 * M, 75 * M]) q = regles.quarantaineSuivante(q, { fait_le: iso(t0 + dt), ip_sortie: null, pays: null, listes_noires: [] }, { manques: ['ip_sortie', 'pays'], maintenant: t0 + dt });
  q = { ...q, prochain_le: iso(Date.now() - M) };
  const ips = [ip(77, 'quarantaine', { quarantaine: q, commande: '42424242' })];
  const base = fausseBase({ ips });
  const dits = [];
  const e = entretien({ base, controles: fauxControles(() => ({ ...ECHO_VIDE(), ip_sortie: '10.8.9.9', pays: 'FR' })), dits });
  await e.tour();
  const i77 = ips[0];
  assert.equal(i77.etat, 'quarantaine', 'inutilisable : jamais jetée');
  assert.equal(i77.quarantaine.essais, 4);
  assert.ok(i77.quarantaine.signalee_le, 'la quarantaine garde la date du signalement');
  assert.equal(Math.round((Date.parse(i77.quarantaine.prochain_le) - Date.now()) / H), 24, 'signalée : un recontrôle par jour');
  const alerte = dits.filter((d) => /TOUJOURS INUTILISABLE/.test(d.t));
  assert.equal(alerte.length, 1);
  assert.equal(alerte[0].n, 'serveur', 'l’alerte de l’orchestrateur (support@)');
  assert.match(alerte[0].t, /IP 77 \(10\.8\.0\.77, commande IPRoyal 42424242/);
  assert.match(alerte[0].t, /ip_sortie \(sortie lue 10\.8\.9\.9, pays FR/, 'la preuve : ce que le dernier contrôle a lu');
  assert.equal(alerte[0].d.quarantaine.preuves.length, 4, 'la preuve complète dans les détails');
  // Recontrôlée le lendemain, encore ratée : pas de 2e alerte.
  i77.quarantaine = { ...i77.quarantaine, prochain_le: iso(Date.now() - M) };
  await e.tour();
  assert.equal(dits.filter((d) => /TOUJOURS INUTILISABLE/.test(d.t)).length, 1, 'jamais deux fois');
  assert.ok(ips[0].quarantaine.signalee_le, 'le signalement ne s’efface pas');
  // Puis un contrôle passe : elle revient, et c'est dit.
  ips[0].quarantaine = { ...ips[0].quarantaine, prochain_le: iso(Date.now() - M) };
  const e2 = entretien({ base, controles: fauxControles((id, adr) => ECHO_BON(adr)), dits });
  await e2.tour();
  assert.equal(ips[0].etat, 'disponible');
  assert.ok(dits.some((d) => /^IP 77 \(10\.8\.0\.77\) SORTIE DE QUARANTAINE/.test(d.t)));
});

test('migration pas encore appliquée : un contrôle douteux n’écrit RIEN — l’IP reste « achetee » et se recontrôle, jamais le rebut', async () => {
  const ips = [ip(42, 'attribuee_client', { user_id: 'u1' }), ip(78, 'disponible'), ip(77, 'achetee', { livree_le: iso(Date.now() - 5 * M) })];
  const base = fausseBase({ ips, params: { ip_achats_auto: 1, ip_marge: 2 }, migration: false });
  const controles = fauxControles(() => ECHO_VIDE());
  const e = entretien({ base, controles });
  await e.reapprovisionnerVite();
  await e.tour();
  assert.deepEqual(controles.faits, [77, 77], 'recontrôlée au tour suivant');
  assert.equal(ips.find((x) => x.id === 77).etat, 'achetee');
  assert.ok(!base.appels.some((x) => x[0] === 'cloud_ip_controle_entree' || x[0] === 'cloud_ip_signaler'));
});

// ── 3. Le plan, la rotation, la garde ────────────────────────────────────────────────────────────────────────────
test('plan : une IP en quarantaine n’est jamais renouvelée ; elle compte « en route » pour l’achat tant qu’elle n’est pas signalée', () => {
  const now = Date.parse('2026-11-14T10:00:00Z');
  const q = (x = {}) => ({ version: 1, origine: 'controle_entree', depuis: iso(now - H), essais: 1, premier_echec_le: iso(now - H), prochain_le: iso(now + 15 * M), signalee_le: null, ...x });
  const base = [{ id: 42, etat: 'attribuee_client', user_id: 'u1', expire_le: iso(now + 20 * J), attributions: 1, refus: {} },
    { id: 78, etat: 'disponible', expire_le: iso(now + 29 * J), attributions: 0, refus: {} }];
  const avec = (x) => regles.planDuJour({ ips: [...base, { id: 77, etat: 'quarantaine', expire_le: iso(now + 29 * J), attributions: 0, refus: {}, quarantaine: q(), ...x }],
    lambda: 1, marge: 2, comptesSansPlace: 0, maintenant: now });
  const p1 = avec({});
  assert.equal(p1.aCommander, 0, 'elle va revenir : aucune IP rachetée');
  assert.equal(p1.enQuarantaine, 1);
  assert.equal(p1.raisons[77], 'quarantaine');
  const p2 = avec({ quarantaine: q({ signalee_le: iso(now - H) }) });
  assert.equal(p2.aCommander, 1, 'signalée inutilisable : la marge se reconstitue (attribuées + marge)');
  const p3 = avec({ expire_le: iso(now + 2 * J) });
  assert.ok(p3.laisserExpirer.includes(77) && !p3.renouveler.includes(77), 'jamais renouvelée : elle expire à son terme');
  // Elle ne prend pas la place d'une IP saine à renouveler (règle « saines d'abord »).
  const saine = { id: 3, etat: 'disponible', expire_le: iso(now + 8 * J), attributions: 0, refus: {}, sante: { verdict: 'saine', saine_le: iso(now - H) } };
  const p4 = regles.planDuJour({ ips: [base[0], saine, { id: 77, etat: 'quarantaine', expire_le: iso(now + 29 * J), attributions: 0, refus: {}, quarantaine: q() }],
    lambda: 1, marge: 1, comptesSansPlace: 0, sainesSeulement: true, maintenant: now });
  assert.ok(p4.renouveler.includes(3), 'la saine est renouvelée malgré l’IP en quarantaine');
  // La garde contre la boucle achat → refus → rachat compte les quarantaines d'entrée sur 24 h.
  const qs = [1, 2, 3].map((k) => ({ id: 100 + k, etat: 'quarantaine', quarantaine: q({ depuis: iso(now - k * H) }) }));
  assert.equal(regles.rebutsEntreeRecents([...qs, { id: 9, etat: 'quarantaine', quarantaine: q({ depuis: iso(now - 30 * H) }) }], now), 3);
  assert.equal(regles.deciderDepense({ montantUsd: 4, envAutorise: true, interrupteur: true, garde: regles.gardePour({ vivantes: 1, en_commande: 0, comptes: 1, marge: 3, attente: 0 }, 1),
    rebutsEntree: 3, soldeUsd: 50 }).raison, 'rebuts_controle');
  // Jamais donnée en rotation non plus.
  assert.equal(ipDuPool([{ id: 77, ip: '10.8.0.77', pays: 'FR', etat: 'quarantaine', expire_le: iso(now + 20 * J) }], 'u2', 1, now), null);
  assert.equal(regles.entreeControlable({ etat: 'achetee', livree_le: iso(now - 119_000) }, now), false);
  assert.equal(regles.entreeControlable({ etat: 'achetee', livree_le: iso(now - 121_000) }, now), true);
  assert.equal(regles.controleSansReponse({ ip_sortie: null, pays: null }), true);
  assert.equal(regles.controleSansReponse({ ip_sortie: '9.9.9.9', pays: 'DE' }), false);
});

// ── 4. Aucun chemin automatique vers le rebut ───────────────────────────────────────────────────────────────────
test('aucun automate n’appelle cloud_ip_signaler ; la migration ne jette jamais au contrôle', () => {
  const fichiers = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? fichiers(p) : [p]; });
  const src = fichiers(path.join(RACINE, 'serveur-cloud', 'src')).filter((f) => f.endsWith('.js'));
  // Un appel = le nom en chaîne (base.rpc('cloud_ip_signaler', …)) ; les commentaires peuvent le citer.
  for (const f of src) assert.ok(!/['"`]cloud_ip_signaler['"`]/.test(readFileSync(f, 'utf8')), `${path.basename(f)} appelle cloud_ip_signaler`);
  const sql = readFileSync(path.join(RACINE, 'supabase', 'migrations', '20261114090000_cloud_ip_quarantaine.sql'), 'utf8');
  const corps = (nom) => { const d = sql.indexOf(`FUNCTION public.${nom}(`); return sql.slice(d, sql.indexOf('$f$;', d)); };
  for (const nom of ['cloud_ip_controle_entree', 'cloud_ip_quarantaine_noter']) {
    const c = corps(nom);
    assert.ok(c.length > 200, nom);
    assert.ok(!/cloud_ip_signaler/.test(c), `${nom} : jamais cloud_ip_signaler`);
    assert.ok(!/etat\s*=\s*'rebut'/.test(c), `${nom} : jamais l'état rebut`);
  }
  assert.match(sql, /'repos', 'quarantaine', 'rebut', 'expiree'/, 'l’état quarantaine au CHECK, dans l’ordre de ETATS');
  assert.ok(regles.ETATS.includes('quarantaine'));
  assert.match(sql, /'depense', 'quarantaine', 'sortie_quarantaine'/, 'deux natures de journal');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.cloud_ip_quarantaine_noter\(bigint, jsonb, jsonb\) FROM PUBLIC, anon, authenticated/);
});
