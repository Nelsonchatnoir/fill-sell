// (04/11, mesure Beebs) La vue « bureau réduit » de « Me connecter » / « Résoudre » (src/vueBureau.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { vueBureau, formatBureau, zoneZoom, versPage, creerGesteSouris, ligneRequete, VUE_BUREAU_LARGEUR } from '../src/vueBureau.js';

// L'iPhone 15 de la capture du 04/11 : canvas 393×587 ; la glissière DataDome de Beebs rendue à 500 px (cache du Cloud).
const IPHONE = { largeur: 393, hauteur: 587, dpr: 3 };
const GLISSIERE_500 = { cadre: { x: 80, y: 176, l: 340, h: 173 }, piste: { l: 280, h: 40 }, poignee: { l: 63, h: 40 } };

test('Beebs seulement : Vinted, Leboncoin, Depop gardent le format du téléphone', () => {
  assert.equal(vueBureau('beebs'), true);
  for (const p of ['vinted', 'leboncoin', 'depop']) assert.equal(vueBureau(p), false);
});

test('la page de bureau : 500 px, aux proportions du canvas, dans l’écran du navigateur', () => {
  const f = formatBureau(IPHONE);
  assert.deepEqual([f.largeur, f.hauteur], [500, 747]);
  assert.ok(Math.abs(f.largeur / f.hauteur - IPHONE.largeur / IPHONE.hauteur) < 0.002, 'même proportion : l’app étire sans déformer');
  assert.ok(Math.abs(f.k - 0.786) < 0.001);
  assert.equal(formatBureau({ largeur: 280, hauteur: 1000 }).hauteur, 990, 'jamais plus haute que l’écran (1080)');
  assert.equal(VUE_BUREAU_LARGEUR, 500);
});

test('le zoom : la zone de la glissière à la largeur du téléphone — poignée de 44 pt au moins', () => {
  const f = formatBureau(IPHONE);
  const z = zoneZoom(GLISSIERE_500.cadre, f, IPHONE);
  assert.deepEqual({ x: z.x, l: z.l, h: z.h }, { x: 70, l: 360, h: 538 });
  assert.ok(z.y >= 0 && z.y + z.h <= f.hauteur, 'la zone reste dans la page');
  assert.ok(Math.abs(z.l / z.h - IPHONE.largeur / IPHONE.hauteur) < 0.003, 'proportions du canvas');
  assert.ok(Math.round(GLISSIERE_500.poignee.h * z.k) >= 43 && Math.round(GLISSIERE_500.poignee.l * z.k) >= 68, `poignée ${Math.round(63 * z.k)}×${Math.round(40 * z.k)} pt`);
  assert.ok(Math.round(GLISSIERE_500.poignee.h * f.k) < 44, 'sans zoom, la poignée passe sous 44 pt (31 pt) : d’où le zoom');
  assert.equal(zoneZoom(null, f, IPHONE), null);
  const bord = zoneZoom({ x: 480, y: 730, l: 40, h: 20 }, f, IPHONE);
  assert.ok(bord.x + bord.l <= f.largeur && bord.y + bord.h <= f.hauteur && bord.x >= 0 && bord.y >= 0, 'un cadre au bord : la zone est ramenée dans la page');
});

test('un point du téléphone → la page (entière ou zoomée), aller-retour exact', () => {
  const f = formatBureau(IPHONE);
  const coin = versPage({ x: 393, y: 587 }, { k: f.k });
  assert.ok(coin.x === 500 && Math.abs(coin.y - 747) < 0.5, 'le coin du canvas = le coin de la page (à moins d’un demi-pixel : hauteur arrondie)');
  const z = zoneZoom(GLISSIERE_500.cadre, f, IPHONE);
  const centre = versPage({ x: IPHONE.largeur / 2, y: IPHONE.hauteur / 2 }, z);
  assert.ok(Math.abs(centre.x - (z.x + z.l / 2)) < 0.01 && Math.abs(centre.y - (z.y + z.h / 2)) < 0.5, 'le centre du canvas = le centre de la zone');
});

test('les gestes : un appui = un clic, un glissé horizontal = un glisser bouton enfoncé, vertical = la molette', () => {
  const s = creerGesteSouris();
  assert.deepEqual(s('debut', { x: 100, y: 300 }).map((e) => e.type), ['mouseMoved']);
  const clic = s('fin', { x: 0, y: 0 });
  assert.deepEqual(clic.map((e) => e.type), ['mousePressed', 'mouseReleased']);
  assert.ok(clic.every((e) => e.x === 100 && e.y === 300 && e.button === 'left' && e.pointerType === 'mouse'), 'au point de départ, jamais au (0,0) du relâché');

  s('debut', { x: 140, y: 308 });
  assert.deepEqual(s('deplacer', { x: 143, y: 309 }), [], 'sous le seuil : rien (un doigt qui tremble n’appuie pas)');
  const g1 = s('deplacer', { x: 150, y: 309 });
  assert.deepEqual(g1.map((e) => e.type), ['mousePressed', 'mouseMoved']);
  assert.equal(g1[0].x, 140, 'appui au point de départ de la poignée');
  assert.equal(g1[1].buttons, 1, 'bouton enfoncé pendant le glisser');
  for (let x = 160; x <= 380; x += 20) assert.deepEqual(s('deplacer', { x, y: 310 }).map((e) => e.type), ['mouseMoved']);
  const fin = s('fin', { x: 0, y: 0 });
  assert.deepEqual(fin.map((e) => [e.type, e.x]), [['mouseReleased', 380]], 'relâché au dernier point du glisser');

  s('debut', { x: 200, y: 500 });
  const d1 = s('deplacer', { x: 202, y: 470 });
  assert.equal(d1[0].type, 'mouseWheel');
  assert.equal(d1[0].deltaY, 30, 'le doigt monte : la page descend');
  assert.deepEqual(s('fin', { x: 0, y: 0 }), [], 'fin d’un défilement : aucun clic');
  assert.deepEqual(s('deplacer', { x: 1, y: 1 }), [], 'hors d’un geste : rien');
});

test('une ligne d’enregistrement : hôte et chemin, jamais la query ; les coupures se voient', () => {
  const l = ligneRequete({ le: 'x', cadre: 'geo.captcha-delivery.com', url: 'https://geo.captcha-delivery.com/captcha/check?cid=SECRET&x=1', methode: 'GET', type: 'XHR', http: 200 });
  assert.equal(l.hote, 'geo.captcha-delivery.com');
  assert.equal(l.chemin, '/captcha/check');
  assert.ok(!JSON.stringify(l).includes('SECRET'));
  const pub = ligneRequete({ le: 'x', url: 'https://pagead2.googlesyndication.com/a.js', echec: 'net::ERR_BLOCKED_BY_CLIENT', publicite: true });
  assert.equal(pub.publicite, true);
  assert.equal(pub.echec, 'net::ERR_BLOCKED_BY_CLIENT');
});
