// (15/11/2026, cliente af37fa49) LE CODE DEMANDÉ PENDANT « ME CONNECTER » — règles pures (codeConnexion.js) et pages de
// connexion du compte Kiabi après le code (plateformes.js). Verrou : selftest:cloud-connexion-code (avec la simulation).
import test from 'node:test';
import assert from 'node:assert/strict';
import { lireCodeDemande, nomFournisseur, raisonFermeture, delaisConnexion, MESSAGES_CODE, EXPRESSION_CODE_DEMANDE,
  EXPRESSION_ETAT_CODE, etatChampCode, expressionCibleClic, validationAuClic,
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

// Le TEXTE RÉEL de la page du code de Kiabi (www.kiabi.com/account/_next/data/…/auth.json, clés page.signIn.withCode,
// lu le 15/11 dans un vrai Chrome) : « Saisissez le code à 6 chiffres reçu par e-mail », « Votre code à 6 chiffres »,
// « Faire confiance à cet appareil », « Me connecter », « Envoyer un nouveau code ».
test('(15/11, af37fa49) le texte RÉEL de la page du code de Kiabi : un code par e-mail', () => {
  const texte = ['Authentification', 'Sécurité avant tout !', 'Pour protéger votre compte on vous demande une étape de vérification rapide.',
    'Saisissez le code à 6 chiffres reçu par e-mail', 'Le code a été envoyé. Veuillez patienter, cela peut prendre quelques instants, merci.',
    'Votre code à 6 chiffres', 'Faire confiance à cet appareil', 'Me connecter', "Vous n'avez rien reçu ?", 'Cela peut prendre quelques instants.',
    'Pensez à consulter vos spams et à vérifier que votre adresse e-mail est correcte.', 'Envoyer un nouveau code', 'Accéder à la FAQ'].join('\n');
  assert.deepEqual(lireCodeDemande({ hote: 'www.kiabi.com', texte,
    champs: [{ type: 'text', ac: 'one-time-code', mode: 'numeric', nom: 'code sign-in-verification-code-input Votre code à 6 chiffres', max: 6 }] }),
  { canal: 'email', chiffres: true, hote: 'www.kiabi.com' });
  // La VRAIE page de connexion Kiabi (même jour, même Chrome) : un seul champ, l'e-mail — jamais un code.
  assert.equal(lireCodeDemande({ hote: 'www.kiabi.com', texte: 'Retour\n\nCréez votre compte ou connectez-vous\n\nCommençons par le commencement :) Indiquez-nous votre adresse e-mail.\n\nE-mail\nE-mail\nContinuer\nGoogle\nApple',
    champs: [{ type: 'email', ac: '', mode: 'text', nom: 'email', max: null }] }), null);
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
  assert.match(m, /Touche la case du code, appuie sur « Écrire », tape le code, puis valide sur la page\./);
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

// ── (15/11/2026 soir, ordre de Nico — point D) LE CHAMP DU CODE : sa LONGUEUR, s'il a le clavier, la validation ──────────
// Cliente af37fa49, 20:15 sur son ordinateur : une frappe reçue pendant le code, aucune vérification chez Kiabi, puis
// « Fermer » — sans savoir ce qu'elle voyait dans le champ. Ce que la page en dit désormais, sans jamais sa valeur.
test('(15/11 soir, point D) la lecture mesurée rend la LONGUEUR du champ du code, jamais sa valeur ; mot de passe, e-mail, identifiant jamais mesurés', () => {
  const champ = (o) => ({ name: '', id: '', placeholder: '', maxLength: -1, type: 'text', value: '', ...o,
    getAttribute: (a) => ({ autocomplete: o.ac ?? null, inputmode: o.mode ?? null, 'data-testid': o.testid ?? null, 'aria-label': null })[a] ?? null,
    getBoundingClientRect: () => ({ width: 300, height: 40 }) });
  const code = champ({ name: 'code', ac: 'one-time-code', mode: 'numeric', testid: 'sign-in-verification-code-input', maxLength: 6, value: '482' });
  const mdp = champ({ type: 'password', name: 'password', ac: 'current-password', value: 'secret-tres-long' });
  const courriel = champ({ type: 'email', name: 'email', ac: 'email', value: 'personne@exemple.invalid' });
  const ident = champ({ name: 'login', ac: 'username', value: 'doriane' });
  const document = { querySelectorAll: () => [code, mdp, courriel, ident], body: { innerText: KIABI.texte }, activeElement: code };
  const f = new Function('document', 'location', 'getComputedStyle', `return ${EXPRESSION_ETAT_CODE};`);
  const v = f(document, { hostname: 'www.kiabi.com' }, () => ({ display: 'block', visibility: 'visible' }));
  const brut = JSON.stringify(v);
  for (const valeur of ['482', 'secret-tres-long', 'personne@exemple.invalid', 'doriane']) assert.ok(!brut.includes(valeur), `jamais une valeur (${valeur})`);
  assert.deepEqual(v.champs.map((c) => [c.nom.split(' ')[0], c.lg, c.actif]),
    [['code', 3, true], ['password', null, false], ['email', null, false], ['login', null, false]]);
  assert.deepEqual(etatChampCode(v), { longueur: 3, attendue: 6, clavier: true });
  assert.deepEqual(lireCodeDemande(v), { canal: 'email', chiffres: true, hote: 'www.kiabi.com' }, 'la détection lit la même chose');
  // La seule valeur touchée : `.value ?? '').length` ; la lecture de DÉTECTION (toutes les 2 s) n'y touche jamais.
  assert.deepEqual(EXPRESSION_ETAT_CODE.match(/\.value\b.{0,12}/g), [".value ?? '').leng"]);
  assert.doesNotMatch(EXPRESSION_CODE_DEMANDE, /\.value\b|activeElement/);
});

test('(15/11 soir, point D) l’état du champ : un champ, des cases d’un chiffre, champ sans clavier, lecture sans mesure', () => {
  const k = (lg, actif) => ({ ...KIABI, champs: [{ type: 'text', ac: 'one-time-code', mode: 'numeric', nom: 'code', max: 6, lg, actif }] });
  assert.deepEqual(etatChampCode(k(0, false)), { longueur: 0, attendue: 6, clavier: false });
  assert.deepEqual(etatChampCode(k(6, true)), { longueur: 6, attendue: 6, clavier: true });
  const cases = Array.from({ length: 6 }, (_, i) => ({ type: 'text', ac: '', mode: 'numeric', nom: `chiffre-${i}`, max: 1, lg: i < 4 ? 1 : 0, actif: i === 4 }));
  assert.deepEqual(etatChampCode({ hote: 'auth.leboncoin.fr', texte: 'Saisis le code à 6 chiffres envoyé par e-mail', champs: cases }), { longueur: 4, attendue: 6, clavier: true });
  // La lecture de détection (sans mesure) : longueur inconnue, jamais inventée.
  assert.deepEqual(etatChampCode(KIABI), { longueur: null, attendue: 6, clavier: false });
  assert.equal(etatChampCode({ hote: 'x', texte: 'E-mail', champs: [{ type: 'email', nom: 'email', lg: 5 }] }), null, 'pas de page de code : rien');
});

test('(15/11 soir, point D) un clic pendant le code : « Me connecter » de Kiabi = validation ; désactivé = non envoyée ; « nouveau code » à part', () => {
  const kiabi = { bouton: true, balise: 'button', soumet: true, formulaire: true, champCode: true, inactif: false, libelle: 'Me connecter' };
  assert.deepEqual(validationAuClic(kiabi), { par: 'bouton', inactif: false });
  assert.deepEqual(validationAuClic({ ...kiabi, inactif: true }), { par: 'bouton', inactif: true });
  assert.deepEqual(validationAuClic({ bouton: true, balise: 'button', soumet: false, formulaire: false, champCode: false, inactif: false, libelle: 'Envoyer un nouveau code' }), { par: 'nouveau_code', inactif: false });
  assert.deepEqual(validationAuClic({ bouton: true, balise: 'a', soumet: false, formulaire: false, champCode: false, libelle: 'Renvoyer le code' })?.par, 'nouveau_code');
  assert.deepEqual(validationAuClic({ bouton: true, balise: 'div', soumet: false, formulaire: false, champCode: false, libelle: 'Valider' })?.par, 'bouton');
  assert.equal(validationAuClic({ bouton: true, balise: 'a', soumet: false, formulaire: false, champCode: false, libelle: 'Mot de passe oublié ?' }), null);
  assert.equal(validationAuClic({ bouton: false }), null);
  assert.equal(validationAuClic(null), null);
  // L'expression : un point de la page, le bouton dessous, jamais un champ saisi.
  const e = expressionCibleClic(120.6, 'x');
  assert.match(e, /document\.elementFromPoint\(121, 0\)/);
  assert.doesNotMatch(e, /\.value\b/);
  const bouton = { tagName: 'BUTTON', disabled: false, innerText: ' Me connecter ', form: { querySelector: () => ({}) },
    getAttribute: (a) => ({ type: 'submit' })[a] ?? null, closest() { return this; } };
  const r = new Function('document', `return ${e};`)({ elementFromPoint: () => ({ closest: () => bouton }) });
  assert.deepEqual(r, { bouton: true, balise: 'button', soumet: true, formulaire: true, champCode: true, inactif: false, libelle: 'Me connecter' });
});
