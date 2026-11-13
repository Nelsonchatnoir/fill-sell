#!/usr/bin/env node
// Selftest de /installer (13/11/2026) : la destination des publicités Meta envoie l'iPhone à l'App Store,
// l'Android à Google Play (UTM transmis dans `referrer`, et eux seuls), et laisse l'ordinateur sur la page.
// Verrou : avant la page, aucune destination unique n'existait (les pubs pointaient sur l'accueil).
// Usage : node scripts/site/installer-selftest.mjs
import assert from 'node:assert/strict';
import { destinationInstallation, PARAMS_UTM, installer } from '../../site/gabarits/installer.mjs';
import { LIENS } from '../../site/gabarits/textes.mjs';

const liens = { appStore: LIENS.appStore, googlePlay: LIENS.googlePlay };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/490.0]';
const IPAD_BUREAU = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/490.0;]';
const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const RECH = '?utm_source=meta&utm_medium=paid&utm_campaign=fillsell-installer&utm_content=v1&fbclid=AbC123&email=x%40y.fr';

let n = 0;
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };

cas('iPhone (navigateur Facebook) → App Store', () => {
  assert.equal(destinationInstallation(IPHONE, RECH, liens, PARAMS_UTM, null), LIENS.appStore);
});
cas('iPad en mode bureau (Instagram) → App Store', () => {
  assert.equal(destinationInstallation(IPAD_BUREAU, RECH, liens, PARAMS_UTM, null), LIENS.appStore);
});
cas('iPhone avec jeton fournisseur → campagne dans ct (40 car. au plus)', () => {
  const d = destinationInstallation(IPHONE, RECH, liens, PARAMS_UTM, '123456');
  assert.equal(d, `${LIENS.appStore}?pt=123456&ct=fillsell-installer&mt=8`);
});
cas('Android → Google Play, UTM seuls dans referrer (ni fbclid ni e-mail)', () => {
  const d = destinationInstallation(ANDROID, RECH, liens, PARAMS_UTM, null);
  assert.ok(d.startsWith(`${LIENS.googlePlay}&referrer=`));
  const ref = decodeURIComponent(d.split('&referrer=')[1]);
  assert.equal(ref, 'utm_source=meta&utm_medium=paid&utm_campaign=fillsell-installer&utm_content=v1');
  assert.ok(!/fbclid|email|@/.test(d));
});
cas('Android sans UTM → Google Play sans referrer', () => {
  assert.equal(destinationInstallation(ANDROID, '', liens, PARAMS_UTM, null), LIENS.googlePlay);
});
cas('valeur UTM nettoyée et bornée (aucun caractère d\'injection)', () => {
  const d = destinationInstallation(ANDROID, `?utm_campaign=${'a'.repeat(150)}%22%3E%3Cscript%3E`, liens, PARAMS_UTM, null);
  const ref = decodeURIComponent(d.split('&referrer=')[1]);
  assert.equal(ref, `utm_campaign=${'a'.repeat(100)}`);
});
cas('ordinateur → reste sur la page (null)', () => {
  assert.equal(destinationInstallation(PC, RECH, liens, PARAMS_UTM, null), null);
});
cas('page : script sérialisé exécutable, liens officiels des deux stores, un seul h1', () => {
  const site = { badges: () => ({ apple: { url: '/a.svg', largeur: 120, hauteur: 40 }, google: { url: '/g.png', largeur: 135, hauteur: 40 } }), logos: { Vinted: '/v.webp', Leboncoin: '/l.webp', eBay: '/e.webp', Beebs: '/b.webp', Depop: '/d.webp' } };
  const html = installer({ site });
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  let vers = null;
  const fn = new Function('navigator', 'location', script);
  fn({ userAgent: ANDROID }, { search: RECH, replace: (u) => { vers = u; } });
  assert.ok(vers && vers.startsWith(LIENS.googlePlay));
  vers = null;
  fn({ userAgent: PC }, { search: RECH, replace: (u) => { vers = u; } });
  assert.equal(vers, null);
  assert.ok(html.includes(LIENS.appStore) && html.includes(LIENS.googlePlay));
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  for (const l of ['/v.webp', '/l.webp', '/e.webp', '/b.webp', '/d.webp']) assert.ok(html.includes(l), `logo ${l} absent de la page`);
});
console.log(`installer-selftest : ${n}/${n} verts`);
