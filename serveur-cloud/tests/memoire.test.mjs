// (03/11, point 1 de Nico : « on ne refuse jamais un client par manque de mémoire ») La cause prouvée des OOM du
// navigateur Cloud (02/11 18:51, 03/11 02:26 et 04:32) : l'accueil Leboncoin et ses ~28 cadres de régies publicitaires
// (un processus de rendu chacun). Le verrou les fait échouer comme un bloqueur de pub ; le filet redémarre proprement un
// navigateur AU REPOS qui dépasse son seuil.
import test from 'node:test';
import assert from 'node:assert/strict';
import { estPublicite, motifsVerrou, requetePermise, memoireReelleMo, tailleEnMo, DOMAINES_PUBLICITE } from '../src/navigateur.js';
import { redemarrerPourMemoire, seuilFiletMo, FILET_OUVERT_DEPUIS_MIN_MS, FILET_ESPACEMENT_MS } from '../src/postes.js';

test('publicité : les régies relevées sur l’accueil Leboncoin le 03/11 sont reconnues', () => {
  for (const h of ['9981794.fls.doubleclick.net', 'ads.pubmatic.com', 'cm.g.doubleclick.net', 'eus.rubiconproject.com',
    'acdn.adnxs.com', 'js-sec.indexww.com', 'onetag-sys.com', 'eb2.3lift.com', 'apps.smartadserver.com', 'gum.criteo.com',
    'ssp-sync.criteo.com', 'cdn.pbstck.com', 'ssum-sec.casalemedia.com', 'image6.pubmatic.com', 'eu-u.openx.net',
    'ad.360yield.com', 'sync.richaudience.com']) {
    assert.equal(estPublicite(`https://${h}/x`), true, h);
  }
});

test('publicité : jamais une plateforme, son anti-robot ni Google (connexion Beebs, reCAPTCHA)', () => {
  for (const u of ['https://www.leboncoin.fr/', 'https://api.leboncoin.fr/api/account/v2/members/me/account',
    'https://server.sgtm.leboncoin.fr/x', 'https://www.vinted.fr/items/1', 'https://www.beebs.app/fr',
    'https://www.depop.com/', 'https://geo.captcha-delivery.com/captcha/', 'https://js.datadome.co/tags.js',
    'https://dd.leboncoin.fr/js/', 'https://www.google.com/recaptcha/api2/aframe', 'https://accounts.google.com/',
    'https://apis.google.com/js/api.js', 'https://notdoubleclick.net.example.org/', 'pas une adresse']) {
    assert.equal(estPublicite(u), false, u);
  }
  assert.ok(!DOMAINES_PUBLICITE.some((d) => /leboncoin|vinted|beebs|depop|datadome|captcha|google\.com$/.test(d)));
});

test('verrou : les motifs de publicité s’ajoutent seulement sur demande, et restent fermés quelles que soient les plateformes', () => {
  const sans = motifsVerrou(['vinted', 'leboncoin', 'beebs', 'depop']).map((m) => m.urlPattern);
  assert.ok(!sans.some((p) => p.includes('doubleclick')), 'sans l’option : inchangé (essai du 01/11)');
  const avec = motifsVerrou(['vinted', 'leboncoin', 'beebs', 'depop'], { publicite: true });
  const motifs = avec.map((m) => m.urlPattern);
  assert.ok(motifs.includes('*://*.doubleclick.net/*') && motifs.includes('*://doubleclick.net/*'));
  assert.ok(motifs.includes('*://*.pubmatic.com/*'));
  assert.ok(!motifs.some((p) => /leboncoin|vinted|beebs|depop/.test(p)), 'les plateformes ouvertes ne sont jamais interceptées');
  assert.ok(avec.every((m) => m.requestStage === 'Request'));
});

test('verrou : une régie ne passe jamais, même depuis le cadre d’une page de résolution', () => {
  const h = { cadresPermis: new Map([['page-1', 'leboncoin']]) };
  assert.equal(requetePermise(h, { frameId: 'page-1', request: { url: 'https://ads.pubmatic.com/AdServer/js/user_sync.html' } }), false);
  assert.equal(requetePermise(h, { frameId: 'page-1', request: { url: 'https://api.leboncoin.fr/api/x' } }), true, 'la plateforme, elle, passe toujours');
});

test('mémoire : lue comme docker stats (cache de fichiers retiré) ; tailles « 3g », « 1400m »', () => {
  assert.equal(memoireReelleMo({ memory_stats: { usage: 2 * 1048576 * 1024, stats: { inactive_file: 1048576 * 24 } } }), 2024);
  assert.equal(memoireReelleMo(null), null);
  assert.equal(memoireReelleMo({ memory_stats: {} }), null);
  assert.equal(tailleEnMo('3g'), 3072);
  assert.equal(tailleEnMo('1400m'), 1400);
  assert.equal(tailleEnMo('2048'), 2048);
  assert.equal(tailleEnMo('abc'), null);
});

test('filet : seuil = réglage, sinon 80 % du plafond ; 0 = coupé', () => {
  assert.equal(seuilFiletMo(null, 3072), 2458);
  assert.equal(seuilFiletMo(2200, 3072), 2200);
  assert.equal(seuilFiletMo(0, 3072), 0);
  assert.equal(seuilFiletMo(null, null), 0);
});

test('filet : redémarre seulement AU REPOS, au-dessus du seuil, ni trop tôt ni trop souvent', () => {
  const t = Date.parse('2026-11-03T03:00:00Z');
  const base = { mo: 2600, seuilMo: 2458, enCours: 0, connexion: false, ouvertLe: t - FILET_OUVERT_DEPUIS_MIN_MS - 1, maintenant: t };
  assert.equal(redemarrerPourMemoire(base), true);
  assert.equal(redemarrerPourMemoire({ ...base, mo: 2400 }), false, 'sous le seuil');
  assert.equal(redemarrerPourMemoire({ ...base, enCours: 1 }), false, 'jamais pendant un job');
  assert.equal(redemarrerPourMemoire({ ...base, connexion: true }), false, 'jamais pendant un « Me connecter »');
  assert.equal(redemarrerPourMemoire({ ...base, ouvertLe: t - 60_000 }), false, 'jamais un navigateur qui vient d’ouvrir');
  assert.equal(redemarrerPourMemoire({ ...base, dernierRedemarrage: t - FILET_ESPACEMENT_MS + 60_000 }), false, 'au plus toutes les 2 h');
  assert.equal(redemarrerPourMemoire({ ...base, dernierRedemarrage: t - FILET_ESPACEMENT_MS - 1 }), true);
  assert.equal(redemarrerPourMemoire({ ...base, mo: null }), false, 'mémoire illisible : on ne touche à rien');
  assert.equal(redemarrerPourMemoire({ ...base, seuilMo: 0 }), false, 'filet coupé');
});
