// (07/11 soir) L'ÉTANCHÉITÉ ENTRE CLIENTS : le réseau des navigateurs cloisonné (src/cloisonnement.js).
//   · le réseau naît avec enable_icc=false (orchestrateur, déploiement, amorce d'un serveur neuf) ;
//   · le verdict (deux couches : Docker, pare-feu ; condition commune : le pont filtré) — l'état relevé sur cloud-2 le 07/11
//     17:16 est NON cloisonné, la bascule du pare-feu seule le cloisonne, la bascule complète le rend complet ;
//   · au démarrage : alerte support@ quand une couche manque, rien quand tout tient ;
//   · à l'ouverture : seul, un compte n'est jamais refusé ; à côté d'un autre (ouvert ou en train de s'ouvrir), refusé tant
//     que rien ne cloisonne.
// Le script du pare-feu (règle « -o br-fillsell -j DROP », br_netfilter, preuve) : tests/ip.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpsReseau, OPTION_ICC, OPTION_PONT, PONT } from '../src/docker.js';
import { verdictCloisonnement, alerteCloisonnement, ouverturePermise, creerCloisonnement, DOC_BASCULE } from '../src/cloisonnement.js';
import { creerNavigateurs } from '../src/navigateur.js';
import { amorcePour } from '../src/flotte.js';

const BOOT = 'b00t-0711';
// Le réseau tel que relevé sur cloud-2 le 07/11 17:16 (docker network inspect) : le pont nommé, AUCUNE option enable_icc.
const RESEAU_CLOUD2 = { Name: 'fillsell-cloud', Options: { [OPTION_PONT]: PONT }, IPAM: { Config: [{ Subnet: '172.31.0.0/24', Gateway: '172.31.0.1' }] } };
const RESEAU_CLOISONNE = { ...RESEAU_CLOUD2, Options: { [OPTION_PONT]: PONT, [OPTION_ICC]: 'false' } };
// La preuve de l'ANCIEN script (sans entre_conteneurs) et celle du nouveau.
const PREUVE_ANCIENNE = JSON.stringify({ boot_id: BOOT, le: '2026-11-04T17:08:32Z', destinations: '1.2.3.4:12323', source: 'etat' });
const PREUVE_NOUVELLE = JSON.stringify({ boot_id: BOOT, le: '2026-11-07T21:00:00Z', destinations: '1.2.3.4:12323', source: 'etat', entre_conteneurs: 'ferme', pont_filtre: '1' });
const IMAGE = 'ghcr.io/steel-dev/steel-browser@sha256:' + 'a'.repeat(64);
const journalMuet = { info: () => {}, alerte: () => {}, erreur: () => {} };

test('réseau : créé avec enable_icc=false partout où il naît (orchestrateur, déploiement, serveur neuf)', () => {
  const c = corpsReseau('fillsell-cloud', '172.31.0.0/24');
  assert.equal(c.Driver, 'bridge');
  assert.deepEqual(c.IPAM, { Config: [{ Subnet: '172.31.0.0/24' }] });
  assert.equal(c.Options[OPTION_ICC], 'false', 'la communication entre conteneurs est coupée');
  assert.equal(OPTION_ICC, 'com.docker.network.bridge.enable_icc', 'la clé exacte de Docker (libnetwork/drivers/bridge/labels.go)');
  assert.equal(c.Options[OPTION_PONT], 'br-fillsell', 'le pont garde son nom : le pare-feu de l’hôte le filtre par ce nom');
  const amorce = amorcePour({ sha: '0123456789ab', domaine: 'cloud-3.fillsell.app', imageSteel: IMAGE, urlPaquet: 'https://x.supabase.co/a.tgz', destinations: '' });
  assert.match(amorce, /docker network create [^\n]*-o com\.docker\.network\.bridge\.name=br-fillsell -o com\.docker\.network\.bridge\.enable_icc=false fillsell-cloud/);
  const deployer = readFileSync(fileURLToPath(new URL('../outils/deployer.sh', import.meta.url)), 'utf8');
  assert.match(deployer, /docker network create [^\n]*-o com\.docker\.network\.bridge\.enable_icc=false fillsell-cloud/);
  assert.match(deployer, /ATTENTION : réseau fillsell-cloud sans enable_icc=false/, 'un réseau déjà là sans l’option est DIT au déploiement');
  assert.ok(!/docker network rm/.test(deployer), 'le déploiement ne recrée jamais le réseau seul (il arrêterait les navigateurs)');
});

test('verdict : cloud-2 le 07/11 = NON cloisonné ; pare-feu seul = cloisonné ; bascule complète = complet', () => {
  const avant = verdictCloisonnement({ reseau: RESEAU_CLOUD2, pontFiltre: '', preuve: PREUVE_ANCIENNE, bootId: `${BOOT}\n` });
  assert.equal(avant.ok, false);
  assert.deepEqual(avant.raisons, ['pont_non_filtre', 'reseau_sans_enable_icc', 'pare_feu_sans_fermeture_entre_conteneurs']);
  const pareFeu = verdictCloisonnement({ reseau: RESEAU_CLOUD2, pontFiltre: '1\n', preuve: PREUVE_NOUVELLE, bootId: BOOT });
  assert.deepEqual([pareFeu.ok, pareFeu.complet, pareFeu.pareFeu, pareFeu.docker], [true, false, true, false]);
  assert.deepEqual(pareFeu.raisons, ['reseau_sans_enable_icc']);
  const complet = verdictCloisonnement({ reseau: RESEAU_CLOISONNE, pontFiltre: '1', preuve: PREUVE_NOUVELLE, bootId: BOOT });
  assert.deepEqual([complet.ok, complet.complet, complet.raisons], [true, true, []]);
});

test('verdict : sans pont filtré, AUCUNE couche ne tient (même enable_icc=false et le nouveau pare-feu)', () => {
  const v = verdictCloisonnement({ reseau: RESEAU_CLOISONNE, pontFiltre: '0', preuve: PREUVE_NOUVELLE, bootId: BOOT });
  assert.equal(v.ok, false, 'br_netfilter absent : aucun paquet entre deux conteneurs ne passe par iptables');
  assert.deepEqual(v.raisons, ['pont_non_filtre']);
  assert.equal(verdictCloisonnement({ reseau: null, pontFiltre: '1', preuve: '', bootId: BOOT }).ok, false, 'réseau absent, preuve absente');
  assert.equal(verdictCloisonnement({ reseau: { ...RESEAU_CLOUD2, Options: { [OPTION_ICC]: 'true' } }, pontFiltre: '1', preuve: PREUVE_ANCIENNE, bootId: BOOT }).ok, false);
  assert.equal(verdictCloisonnement({ reseau: { ...RESEAU_CLOUD2, Options: { [OPTION_ICC]: '0' } }, pontFiltre: '1', preuve: PREUVE_ANCIENNE, bootId: BOOT }).docker, true,
    'Docker lit l’option par ParseBool : « 0 » la coupe aussi');
  // Le pare-feu d'un autre démarrage (pas encore rejoué) ne prouve rien ; enable_icc tient seul.
  const autreBoot = verdictCloisonnement({ reseau: RESEAU_CLOISONNE, pontFiltre: '1', preuve: PREUVE_NOUVELLE, bootId: 'autre' });
  assert.deepEqual([autreBoot.ok, autreBoot.docker, autreBoot.pareFeu], [true, true, false]);
  assert.deepEqual(autreBoot.raisons, ['pare_feu_preuve_d_un_autre_demarrage']);
});

test('alerte : non cloisonné / partiel dits avec la procédure ; rien quand tout tient ou quand le pare-feu n’est pas encore rejoué', () => {
  const non = alerteCloisonnement(verdictCloisonnement({ reseau: RESEAU_CLOUD2, pontFiltre: '', preuve: PREUVE_ANCIENNE, bootId: BOOT }), 'cloud-2');
  assert.equal(non.niveau, 'serveur');
  assert.match(non.texte, /NON cloisonné \(cloud-2\)/);
  assert.match(non.texte, /Un seul compte à la fois/);
  assert.ok(non.texte.includes(DOC_BASCULE));
  const partiel = alerteCloisonnement(verdictCloisonnement({ reseau: RESEAU_CLOUD2, pontFiltre: '1', preuve: PREUVE_NOUVELLE, bootId: BOOT }), 'cloud-2');
  assert.match(partiel.texte, /PARTIEL \(cloud-2\).*reseau_sans_enable_icc/);
  assert.equal(alerteCloisonnement(verdictCloisonnement({ reseau: RESEAU_CLOISONNE, pontFiltre: '1', preuve: PREUVE_NOUVELLE, bootId: BOOT })), null);
  assert.equal(alerteCloisonnement(verdictCloisonnement({ reseau: RESEAU_CLOISONNE, pontFiltre: '1', preuve: PREUVE_NOUVELLE, bootId: 'autre' })), null,
    'au redémarrage du serveur, avant que le pare-feu soit rejoué : pas d’alerte (exigerPareFeu tient déjà tout fermé)');
});

test('ouverture : seul, jamais refusé (le compte de Nico seul passe toujours) ; à côté d’un autre, seulement cloisonné', () => {
  assert.equal(ouverturePermise({ ok: false }, 0), true);
  assert.equal(ouverturePermise(null, 0), true);
  assert.equal(ouverturePermise({ ok: false }, 1), false);
  assert.equal(ouverturePermise(null, 2), false, 'verdict illisible : refusé à côté d’un autre');
  assert.equal(ouverturePermise({ ok: true }, 5), true);
});

function fauxDocker(reseau) {
  const appels = [];
  return { appels, async reseau(nom) { appels.push(nom); return reseau; } };
}

test('démarrage : réseau sans enable_icc → journal + alerte support@ (alertes.signaler) ; réseau cloisonné → aucune alerte', async () => {
  const alertes = []; const lignes = [];
  const journal = { info: (e, d) => lignes.push(['info', e, d]), alerte: (e, d) => lignes.push(['alerte', e, d]), erreur: () => {} };
  const config = { reseauDocker: 'fillsell-cloud', serveurNom: 'cloud-2', dossierEtat: '/inexistant' };
  const c = creerCloisonnement({ config, docker: fauxDocker(RESEAU_CLOUD2), journal, alertes: { signaler: async (...a) => { alertes.push(a); } },
    lirePont: async () => { throw Object.assign(new Error('absent'), { code: 'ENOENT' }); }, lirePreuve: async () => PREUVE_ANCIENNE, lireBoot: async () => BOOT });
  const v = await c.verifierAuDemarrage();
  assert.equal(v.ok, false);
  assert.equal(alertes.length, 1);
  assert.equal(alertes[0][0], 'serveur');
  assert.match(alertes[0][1], /NON cloisonné/);
  assert.deepEqual(alertes[0][2].raisons, v.raisons);
  assert.ok(lignes.some(([n, e, d]) => n === 'info' && e === 'reseau_cloisonnement' && d.ok === false && d.reseau === 'fillsell-cloud'));
  assert.ok(lignes.some(([n, e]) => n === 'alerte' && e === 'reseau_non_cloisonne'));

  const alertes2 = [];
  const c2 = creerCloisonnement({ config, docker: fauxDocker(RESEAU_CLOISONNE), journal: journalMuet, alertes: { signaler: async (...a) => { alertes2.push(a); } },
    lirePont: async () => '1\n', lirePreuve: async () => PREUVE_NOUVELLE, lireBoot: async () => BOOT });
  assert.equal((await c2.verifierAuDemarrage()).complet, true);
  assert.equal(alertes2.length, 0);
});

test('exiger : aucun autre compte → aucune lecture, jamais refusé ; un autre → refusé tant que non cloisonné ; Docker muet → refusé', async () => {
  const config = { reseauDocker: 'fillsell-cloud', serveurNom: 'cloud-2', dossierEtat: '/inexistant' };
  const docker = fauxDocker(RESEAU_CLOUD2);
  const c = creerCloisonnement({ config, docker, journal: journalMuet, lirePont: async () => '', lirePreuve: async () => PREUVE_ANCIENNE, lireBoot: async () => BOOT });
  assert.equal(await c.exiger('nico', 0), null);
  assert.equal(docker.appels.length, 0, 'seul : rien à lire');
  await assert.rejects(c.exiger('client', 1), /non cloisonné \(pont_non_filtre, reseau_sans_enable_icc, pare_feu_sans_fermeture_entre_conteneurs\) — un seul compte à la fois/);
  const ok = creerCloisonnement({ config, docker: fauxDocker(RESEAU_CLOUD2), journal: journalMuet, lirePont: async () => '1', lirePreuve: async () => PREUVE_NOUVELLE, lireBoot: async () => BOOT });
  assert.equal((await ok.exiger('client', 3)).ok, true, 'le pare-feu seul cloisonne : plusieurs comptes permis');
  const muet = creerCloisonnement({ config, docker: { reseau: async () => { throw new Error('socket docker'); } }, journal: journalMuet,
    lirePont: async () => '1', lirePreuve: async () => PREUVE_NOUVELLE, lireBoot: async () => BOOT });
  await assert.rejects(muet.exiger('client', 1), /verification_impossible \(socket docker\)/);
});

test('navigateurs.ouvrir : un compte qui s’ouvre compte comme un ouvert (aucune course) ; seul, jamais refusé par le cloisonnement', async () => {
  const etat = mkdtempSync(path.join(tmpdir(), 'cl-'));   // aucune preuve du pare-feu : chaque ouverture finit refusée par exigerPareFeu
  try {
    const config = { moteurNavigateur: 'chrome', reseauDocker: 'fillsell-cloud', serveurNom: 'cloud-2', dossierEtat: etat, dossierProfils: etat };
    const monter = (reseau, pont, preuve) => creerNavigateurs({ config, docker: fauxDocker(reseau), journal: journalMuet,
      cloisonnement: creerCloisonnement({ config, docker: fauxDocker(reseau), journal: journalMuet, lirePont: async () => pont, lirePreuve: async () => preuve, lireBoot: async () => BOOT }) });
    const opts = { proxyUrl: 'http://u:p@10.0.0.1:12323', profilId: 'p-test' };

    // Non cloisonné : A s'ouvre (pas encore fini) ; B, lancé pendant ce temps, est refusé par le cloisonnement.
    const nav = monter(RESEAU_CLOUD2, '', PREUVE_ANCIENNE);
    const pa = nav.ouvrir('A', opts);
    const pb = nav.ouvrir('B', opts);
    await Promise.all([
      assert.rejects(pb, /réseau des navigateurs non cloisonné/),
      assert.rejects(pa, /pare-feu des navigateurs non prouvé/, 'A, seul, passe le cloisonnement (refusé plus loin faute de preuve ici)'),
    ]);
    // Plus rien en cours : B, seul, n'est plus refusé par le cloisonnement (l'inscription de A est bien retirée).
    await assert.rejects(nav.ouvrir('B', opts), /pare-feu des navigateurs non prouvé/);

    // Cloisonné (pare-feu seul) : B passe le cloisonnement à côté de A.
    const nav2 = monter(RESEAU_CLOUD2, '1', PREUVE_NOUVELLE);
    const qa = nav2.ouvrir('A', opts);
    const qb = nav2.ouvrir('B', opts);
    await Promise.all([assert.rejects(qb, /pare-feu des navigateurs non prouvé/), assert.rejects(qa, /pare-feu des navigateurs non prouvé/)]);
    assert.equal(typeof nav2.etatCloisonnement, 'function');
    assert.equal((await nav2.etatCloisonnement()).ok, true);
    assert.equal(await creerNavigateurs({ config, docker: fauxDocker(null), journal: journalMuet }).etatCloisonnement(), null, 'sans garde : null');
  } finally { rmSync(etat, { recursive: true, force: true }); }
});
