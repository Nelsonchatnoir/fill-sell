// (30/10, lot D) LE fournisseur d'IP : rotation (pool ou résidentiel), mode dédié, alerte de solde — et le module
// est le SEUL à parler de la sortie (aucun autre fichier ne lit cloud_proxy_identifiants pour un navigateur).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { trancheRotation, sessionCollante, urlResidentielle, ipDuPool, alerteSolde, creerFournisseurIp } from '../src/fournisseurIp.js';

const H = 3600_000;
const t0 = Date.parse('2026-10-30T10:00:00Z');
const pool = [
  { id: 1, ip: '94.194.94.233/32', pays: 'FR', etat: 'disponible', expire_le: '2026-11-04T12:57:45Z' },
  { id: 2, ip: '1.2.3.4', pays: 'DE', etat: 'disponible', expire_le: '2026-12-01T00:00:00Z' },
  { id: 3, ip: '5.6.7.8', pays: 'FR', etat: 'rebut', expire_le: '2026-12-01T00:00:00Z' },
  { id: 4, ip: '9.9.9.9', pays: 'FR', etat: 'disponible', expire_le: '2026-10-30T10:30:00Z' },
];

test('rotation : une tranche de 24 h, une session collante stable pendant la tranche, neuve à la suivante', () => {
  assert.equal(trancheRotation(t0, 24), trancheRotation(t0 + 5 * H, 24));
  assert.notEqual(trancheRotation(t0, 24), trancheRotation(t0 + 25 * H, 24));
  const a = sessionCollante('u1', 100), b = sessionCollante('u1', 101), c = sessionCollante('u2', 100);
  assert.equal(a.length, 8); assert.notEqual(a, b); assert.notEqual(a, c);
  assert.equal(sessionCollante('u1', 100), a);
});

test('résidentiel : pays FR, session et durée dans le mot de passe, passerelle IPRoyal', () => {
  const u = urlResidentielle({ utilisateur: 'usr', motDePasse: 'mdp', session: 'abcd1234', heures: 24 });
  assert.match(u, /^http:\/\/usr:mdp_country-fr_session-abcd1234_lifetime-24h@geo\.iproyal\.com:12321$/);
});

test('pool : seules les IP françaises vivantes ; le même compte garde la même IP dans la tranche', () => {
  const ip = ipDuPool(pool, 'u1', 7, t0);
  assert.equal(ip.id, 1, 'DE, rebut et quasi expirée écartées');
  assert.equal(ipDuPool(pool, 'u1', 7, t0).id, ipDuPool(pool, 'u1', 7, t0 + H).id);
  assert.equal(ipDuPool(pool.filter((i) => i.id !== 1), 'u1', 7, t0), null, 'aucune IP française vivante → null');
});

test('solde : alerte sous le seuil, une fois par 24 h', () => {
  assert.equal(alerteSolde(10.6, 5, null, t0), false);
  assert.equal(alerteSolde(4.2, 5, null, t0), true);
  assert.equal(alerteSolde(4.2, 5, t0 - 2 * H, t0), false);
  assert.equal(alerteSolde(4.2, 5, t0 - 25 * H, t0), true);
});

function baseFausse({ rotation }) {
  return {
    from(table) {
      const q = { select() { return q; }, eq() { return q; },
        async maybeSingle() { return { data: table === 'coin_config' ? (rotation == null ? null : { value: rotation }) : null, error: null }; },
        then(r) { return Promise.resolve({ data: table === 'cloud_ips' ? pool : [], error: null }).then(r); } };
      return q;
    },
    async rpc(nom, args) { return nom === 'cloud_proxy_identifiants' ? { data: `http://u:p@ip${args.p_ip}:12323`, error: null } : { data: null, error: null }; },
  };
}
const journal = { info() {}, alerte() {}, erreur() {} };

test('proxyPour : dédié → l’IP du compte ; rotation → le pool ; rotation coupée sans IP → refus', async () => {
  const f = creerFournisseurIp({ config: {}, base: baseFausse({ rotation: 1 }), iproyal: null, journal });
  const d = await f.proxyPour('u1', { ip_id: 7, ip: '7.7.7.7' }, t0);
  assert.equal(d.mode, 'dedie'); assert.equal(d.ipId, 7); assert.match(d.proxyUrl, /ip7:/);
  const r = await f.proxyPour('u1', { ip_id: null }, t0);
  assert.equal(r.mode, 'rotation_pool'); assert.equal(r.ipId, null); assert.equal(r.sortie, '94.194.94.233'); assert.match(r.proxyUrl, /ip1:/);
  // (30/10, décision de Nico) Le résidentiel n'est JAMAIS la sortie générale : seulement celle de Beebs, si demandé.
  const fr = creerFournisseurIp({ config: { iproyalResiUtilisateur: 'usr', iproyalResiMotDePasse: 'mdp' }, base: baseFausse({ rotation: 1 }), iproyal: null, journal });
  const sansBeebs = await fr.proxyPour('u1', { ip_id: null }, t0);
  assert.equal(sansBeebs.mode, 'rotation_pool'); assert.equal(sansBeebs.proxyBeebs, null, 'BEEBS_RESIDENTIEL absent : Beebs sort par l’IP du compte');
  const fb = creerFournisseurIp({ config: { iproyalResiUtilisateur: 'usr', iproyalResiMotDePasse: 'mdp', beebsResidentiel: true }, base: baseFausse({ rotation: 1 }), iproyal: null, journal });
  const avecBeebs = await fb.proxyPour('u1', { ip_id: null }, t0);
  assert.equal(avecBeebs.mode, 'rotation_pool'); assert.match(avecBeebs.proxyUrl, /ip1:/, 'la sortie générale reste l’IP du pool');
  assert.match(avecBeebs.proxyBeebs, /^http:\/\/usr:mdp_country-fr_session-[0-9a-f]{8}_lifetime-24h@\d+\.\d+\.\d+\.\d+:12321$/, 'Beebs : résidentiel FR collant, passerelle donnée par son adresse');
  const off = creerFournisseurIp({ config: {}, base: baseFausse({ rotation: 0 }), iproyal: null, journal });
  await assert.rejects(() => off.proxyPour('u1', { ip_id: null }, t0), /rotation coupée/);
});

test('verifierSolde : lecture seule, alerte « solde bas », jamais d’achat', async () => {
  const alertes = []; const iproyal = { disponible: true, async solde() { return { montant: 3.5, devise: 'USD' }; }, prolonger() { throw new Error('jamais'); } };
  const f = creerFournisseurIp({ config: { iproyalSoldeAlerte: 5 }, base: baseFausse({ rotation: 1 }), iproyal, journal, alertes: { async signaler(n, m) { alertes.push(m); } } });
  const s = await f.verifierSolde(t0);
  assert.equal(s.sous_le_seuil, true); assert.equal(alertes.length, 1); assert.match(alertes[0], /Aucun achat fait/);
  await f.verifierSolde(t0 + H); assert.equal(alertes.length, 1, 'une fois par jour');
});

test('UN seul module parle de la sortie des navigateurs', () => {
  const dossier = new URL('../src/', import.meta.url);
  const fautifs = readdirSync(dossier).filter((f) => f.endsWith('.js') && !['fournisseurIp.js', 'entretien.js'].includes(f))
    .filter((f) => /cloud_proxy_identifiants/.test(readFileSync(new URL(f, dossier), 'utf8')));
  assert.deepEqual(fautifs, [], 'cloud_proxy_identifiants hors du module : ' + fautifs.join(', '));
  assert.match(readFileSync(new URL('postes.js', dossier), 'utf8'), /fournisseurIp\.proxyPour\(user, compte\)/);
});
