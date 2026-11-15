// (15/11/2026, cliente af37fa49) LE CODE DEMANDÉ PENDANT « ME CONNECTER » — règles pures (codeConnexion.js) et pages de
// connexion du compte Kiabi après le code (plateformes.js). Verrou : selftest:cloud-connexion-code (avec la simulation).
import test from 'node:test';
import assert from 'node:assert/strict';
import { lireCodeDemande, nomFournisseur, raisonFermeture, delaisConnexion, MESSAGES_CODE, EXPRESSION_CODE_DEMANDE,
  INACTIVITE_MS, INACTIVITE_CODE_MS, DUREE_MAX_MS, DUREE_MAX_CODE_MS } from '../src/codeConnexion.js';
import { pageSsoPermise, navigationPermise } from '../src/plateformes.js';

// La page « signInWithCode » de Kiabi telle que son code la décrit (www.kiabi.com/account, chunk 3drp_9z_iwfhk.js lu le
// 15/11 : autoComplete « one-time-code », inputMode « numeric », maxLength 6, data-testid
// « sign-in-verification-code-input ») et telle qu'elle l'écrit.
const KIABI = { hote: 'www.kiabi.com', texte: 'Authentification\nSaisissez le code reçu par e-mail\nUn code à 6 chiffres a été envoyé à d***@hotmail.com\nRenvoyer le code',
  champs: [{ type: 'text', ac: 'one-time-code', mode: 'numeric', nom: 'code sign-in-verification-code-input', max: 6 }] };

test('(15/11, af37fa49) la page du code de Kiabi est reconnue : par e-mail, des chiffres', () => {
  assert.deepEqual(lireCodeDemande(KIABI), { canal: 'email', chiffres: true, hote: 'www.kiabi.com' });
});

test('(15/11) un code par SMS (Google), des cases d’un chiffre (Leboncoin), une appli d’authentification', () => {
  assert.equal(lireCodeDemande({ hote: 'accounts.google.com', texte: 'Validation en deux étapes\nUn SMS contenant un code de validation a été envoyé au ••• •• •• 12\nSaisir le code',
    champs: [{ type: 'tel', ac: '', mode: '', nom: 'idvPin Saisir le code', max: null }] })?.canal, 'sms');
  const cases = Array.from({ length: 6 }, (_, i) => ({ type: 'text', ac: '', mode: 'numeric', nom: `chiffre-${i}`, max: 1 }));
  const l = lireCodeDemande({ hote: 'auth.leboncoin.fr', texte: 'Saisis le code à 6 chiffres envoyé par e-mail', champs: cases });
  assert.deepEqual([l?.canal, l?.chiffres], ['email', true]);
  assert.equal(lireCodeDemande({ hote: 'accounts.google.com', texte: 'Obtenez un code de validation dans l\'application Google Authenticator',
    champs: [{ type: 'tel', ac: 'one-time-code', mode: '', nom: 'totpPin', max: null }] })?.canal, 'appli');
  assert.equal(lireCodeDemande({ hote: 'x', texte: 'Saisis le code reçu par e-mail ou par SMS', champs: [{ type: 'text', ac: 'one-time-code', nom: '', max: 6 }] })?.canal, 'inconnu');
});

test('(15/11) jamais un code là où il n’y en a pas : connexion e-mail / mot de passe, code postal, code promo, parrainage', () => {
  assert.equal(lireCodeDemande({ hote: 'www.kiabi.com', texte: 'Créez votre compte ou connectez-vous\nE-mail\nContinuer',
    champs: [{ type: 'email', ac: 'email', mode: '', nom: 'email', max: null }] }), null);
  assert.equal(lireCodeDemande({ hote: 'www.kiabi.com', texte: 'Mot de passe\nSe connecter\nMot de passe oublié ?',
    champs: [{ type: 'password', ac: 'current-password', mode: '', nom: 'password', max: null }] }), null);
  assert.equal(lireCodeDemande({ hote: 'www.beebs.app', texte: 'Inscription\nCode postal\nCode de parrainage (facultatif)',
    champs: [{ type: 'text', ac: 'postal-code', mode: 'numeric', nom: 'postalCode Code postal', max: 5 }, { type: 'text', ac: '', mode: '', nom: 'parrainage referralCode', max: null }] }), null);
  assert.equal(lireCodeDemande({ hote: 'x', texte: '', champs: [{ type: 'text', ac: '', nom: 'promoCode', max: 10 }] }), null);
  assert.equal(lireCodeDemande(null), null);
  assert.equal(lireCodeDemande({ champs: [] }), null);
});

test('(15/11) l’expression de la page ne lit JAMAIS une valeur saisie, et rend les champs visibles et le texte', () => {
  assert.doesNotMatch(EXPRESSION_CODE_DEMANDE, /\.value\b/, 'jamais la valeur d’un champ');
  // Un document minimal : la page du code de Kiabi.
  const champ = { type: 'text', name: 'code', id: '', placeholder: 'Code', maxLength: 6,
    getAttribute: (a) => ({ autocomplete: 'one-time-code', inputmode: 'numeric', 'data-testid': 'sign-in-verification-code-input', 'aria-label': null })[a] ?? null,
    getBoundingClientRect: () => ({ width: 300, height: 40 }) };
  const cache = { ...champ, type: 'hidden' };
  const document = { querySelectorAll: () => [champ, cache], body: { innerText: KIABI.texte } };
  const f = new Function('document', 'location', 'getComputedStyle', `return ${EXPRESSION_CODE_DEMANDE};`);
  const v = f(document, { hostname: 'www.kiabi.com' }, () => ({ display: 'block', visibility: 'visible' }));
  assert.equal(v.champs.length, 1, 'le champ caché est ignoré');
  assert.deepEqual(lireCodeDemande(v), { canal: 'email', chiffres: true, hote: 'www.kiabi.com' });
});

test('(15/11) le fournisseur nommé d’après la page affichée ; la plateforme sinon', () => {
  assert.equal(nomFournisseur('www.kiabi.com', 'Beebs'), 'Kiabi');
  assert.equal(nomFournisseur('identity.kiabi.com', 'Beebs'), 'Kiabi');
  assert.equal(nomFournisseur('accounts.google.fr', 'Beebs'), 'Google');
  assert.equal(nomFournisseur('idmsa.apple.com', 'Beebs'), 'Apple');
  assert.equal(nomFournisseur('m.facebook.com', 'Vinted'), 'Facebook');
  assert.equal(nomFournisseur('www.vinted.fr', 'Vinted'), 'Vinted');
  assert.equal(nomFournisseur('kiabi.com.exemple.net', 'Beebs'), 'Beebs');
});

test('(15/11) délais : 5 min / 15 min sans code (inchangés) ; 10 min / 25 min dès qu’un code est demandé', () => {
  assert.equal(INACTIVITE_MS, 5 * 60_000);
  assert.equal(DUREE_MAX_MS, 15 * 60_000);
  assert.deepEqual(delaisConnexion({ codeVu: false }), { inactiviteMs: INACTIVITE_MS, dureeMaxMs: DUREE_MAX_MS, repriseMs: INACTIVITE_MS, avantFermetureMs: 60_000 });
  assert.deepEqual(delaisConnexion({ codeVu: true }), { inactiviteMs: INACTIVITE_CODE_MS, dureeMaxMs: DUREE_MAX_CODE_MS, repriseMs: INACTIVITE_CODE_MS, avantFermetureMs: 60_000 });
  assert.equal(INACTIVITE_CODE_MS, 10 * 60_000);
  assert.equal(DUREE_MAX_CODE_MS, 25 * 60_000);
});

test('(15/11) la raison notée : une fermeture pendant l’attente du code le dit', () => {
  assert.equal(raisonFermeture('expiree', true), 'code_non_saisi');
  assert.equal(raisonFermeture('client_parti', true), 'code_non_saisi');
  assert.equal(raisonFermeture('client', true), 'client_au_code');
  assert.equal(raisonFermeture('expiree', false), 'expiree');
  assert.equal(raisonFermeture('remplacee', true), 'remplacee');
});

test('(15/11) les messages : qui, par où, où chercher, « Écrire », combien de temps ; jamais l’ordinateur', () => {
  const fr = MESSAGES_CODE.fr;
  const m = fr.demande('Kiabi', 'email', 10);
  assert.match(m, /^Kiabi vient de t'envoyer un code par e-mail\. Ouvre ta boîte mail \(regarde aussi les courriers indésirables\), puis reviens ici : la page t'attend 10 minutes\./);
  assert.match(m, /Touche la case du code, appuie sur « Écrire » et tape le code\./);
  assert.match(fr.demande('Google', 'sms', 10), /par SMS\. Ouvre tes messages/);
  assert.match(fr.demande('Kiabi', 'inconnu', 10), /reçu par e-mail ou par SMS/);
  assert.match(fr.expire('Kiabi', 'email'), /le code de Kiabi n'a pas été saisi à temps.*ta boîte mail.*nouveau code/);
  assert.equal(fr.titre('email'), 'Code envoyé par e-mail');
  assert.match(MESSAGES_CODE.en.demande('Kiabi', 'email', 10), /^Kiabi just emailed you a code/);
  for (const l of [MESSAGES_CODE.fr, MESSAGES_CODE.en]) {
    for (const canal of ['email', 'sms', 'appli', 'inconnu']) {
      for (const t of [l.demande('Kiabi', canal, 10), l.expire('Kiabi', canal), l.titre(canal), l.suite('Kiabi'), l.bientot]) {
        assert.doesNotMatch(t, /ordinateur|computer|chrome/i, t);
      }
    }
  }
});

test('(15/11, af37fa49) après le code, les pages de connexion du compte Kiabi passent (codeExchange…) ; le reste du site non', () => {
  // Les pages de l'espace de connexion de Kiabi (basePath /account, _buildManifest.js lu le 15/11).
  for (const chemin of ['/account/codeExchange', '/account/signInWithCode', '/account/signIn', '/account/signUp', '/account/passwordless',
    '/account/passwordReset', '/account/auth', '/account/auth/callback']) {
    assert.ok(pageSsoPermise('www.kiabi.com', chemin), chemin);
    assert.ok(navigationPermise('beebs', `https://www.kiabi.com${chemin}?authType=mfa&code=x`, []), chemin);
  }
  for (const chemin of ['/account', '/account/', '/account/orders', '/account/InFamily', '/account/informations', '/robes-fille_200', '/account/codeExchangeX/../orders']) {
    assert.ok(!pageSsoPermise('www.kiabi.com', chemin), chemin);
  }
});
