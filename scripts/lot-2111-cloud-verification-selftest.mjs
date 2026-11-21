// ═══════════════════════════════════════════════════════════════════════════
// VERROU — lot du 21/11/2026, point 5 : un captcha sur le Cloud = la cliente prévenue, et TOUJOURS un bouton « Résoudre »
// ═══════════════════════════════════════════════════════════════════════════
// Rouge avant (Muriel, 0c97dc8b, glissière Beebs à 11:19) : « verification_revenue » → aucun bouton dans l'app (« Arrêtée :
// on regarde »), le mode « résoudre » refusé par l'orchestrateur, et AUCUNE notification ni mail (aucun appareil push).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aPrevenir, messageVerification, mailVerification, decisionMail, ETATS_A_PREVENIR } from '../supabase/functions/push-cloud-verification/message.js';
import { verificationAResoudre } from '../src/cloud/executant.js';
import { ETATS_A_PREVENIR as ETATS_ORCH } from '../serveur-cloud/src/verifications.js';

let ok = 0;
const t = (nom, f) => { f(); ok++; console.log(`  ✓ ${nom}`); };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

console.log('1. Toujours un bouton « Résoudre » quand une plateforme est à résoudre');
t('la règle de l\'app : à résoudre ET revenue ; jamais restreint ni la confirmation en cours', () => {
  assert.equal(verificationAResoudre('a_resoudre'), true);
  assert.equal(verificationAResoudre('revenue'), true);
  assert.equal(verificationAResoudre('restreint'), false);
  assert.equal(verificationAResoudre('verification_en_cours'), false);
  assert.equal(verificationAResoudre(null), false);
});
t('les trois écrans la lisent (bandeau, Me connecter, parcours d\'entrée) ; l\'orchestrateur accepte « résoudre » sur revenue', () => {
  assert.match(lire('src/cloud/BandeauCloudReconnexion.jsx'), /\{verificationAResoudre\(etat\) && \(/);
  assert.match(lire('src/cloud/MeConnecterCloud.jsx'), /sansBouton=\{!verificationAResoudre\(verif\)\}/);
  assert.match(lire('src/entree/EtapeCloudConnexion.jsx'), /return verificationAResoudre\(l\.verif\)/);
  assert.match(lire('serveur-cloud/src/connexion.js'), /!\['a_resoudre', 'revenue'\]\.includes\(etatVisible\(blocage\.nature\)\)/);
});
t('les textes de « revenue » disent le geste, plus jamais « l\'équipe regarde »', () => {
  const tx = lire('src/cloud/textesConnexion.js');
  assert.doesNotMatch(tx, /Arrêtée : on regarde|l'équipe regarde|the team is looking into it/);
  assert.match(tx, /revenue: 'Vérification à refaire'/);
  assert.doesNotMatch(lire('serveur-cloud/src/verifications.js'), /et l'équipe FillSell est prévenue\. Rien n'a été touché/);
});

console.log('2. La cliente est PRÉVENUE (push, mail de repli derrière l\'interrupteur)');
t('les mêmes états des deux côtés (orchestrateur, fonction)', () => {
  assert.deepEqual([...ETATS_ORCH], [...ETATS_A_PREVENIR]);
  assert.equal(aPrevenir('beebs', 'a_resoudre'), true);
  assert.equal(aPrevenir('beebs', 'revenue'), true);
  assert.equal(aPrevenir('beebs', 'restreint'), false);
  assert.equal(aPrevenir('ebay', 'a_resoudre'), false, 'eBay n\'est pas fait par le Cloud');
});
t('le message : la plateforme, le geste, jamais Chrome ni l\'ordinateur (FR, EN)', () => {
  const f = messageVerification('beebs', 'a_resoudre', 'fr');
  assert.equal(f.titre, 'Beebs demande une vérification');
  assert.match(f.corps, /« Résoudre la vérification »/);
  assert.equal(messageVerification('beebs', 'revenue', 'fr').titre, 'Beebs redemande une vérification');
  const e = messageVerification('vinted', 'a_resoudre', 'en');
  assert.match(e.corps, /"Solve the check"/);
  for (const x of [f, e, mailVerification('leboncoin', 'a_resoudre', 'fr'), mailVerification('leboncoin', 'revenue', 'en')]) {
    assert.doesNotMatch(JSON.stringify(x), /Chrome|ordinateur|extension|computer/i);
  }
  assert.deepEqual(f.donnees, { type: 'cloud_verification', plateforme: 'beebs', etat: 'a_resoudre' });
});
t('le mail : seulement sans push reçu, et seulement interrupteur à 1 (aucun mail client sans l\'ordre de Nico)', () => {
  assert.deepEqual(decisionMail({ pushEnvoye: true, interrupteur: '1' }), { envoyer: false, motif: 'push_recu' });
  assert.deepEqual(decisionMail({ pushEnvoye: false, interrupteur: null }), { envoyer: false, motif: 'mail_coupe' });
  assert.deepEqual(decisionMail({ pushEnvoye: false, interrupteur: '0' }), { envoyer: false, motif: 'mail_coupe' });
  assert.deepEqual(decisionMail({ pushEnvoye: false, interrupteur: '1' }), { envoyer: true, motif: null });
});
t('la fonction : clé de service seulement, appareils de la personne, trace dans usage_logs', () => {
  const f = lire('supabase/functions/push-cloud-verification/index.ts');
  assert.match(f, /if \(!service \|\| jeton !== service\) return json\(\{ error: "Non autorisé" \}, 401\);/);
  assert.match(f, /from\("appareils_push"\)\.select\("id, plateforme, jeton, apns_env"\)\.eq\("user_id", userId\)/);
  assert.match(f, /eq\("key", "cloud_verification_mail"\)/);
  assert.match(f, /feature: "cloud_verification_prevenue"/);
});

console.log(`\n${ok} vérifications vertes — lot du 21/11, point 5 (Cloud : bouton et cliente prévenue).`);
