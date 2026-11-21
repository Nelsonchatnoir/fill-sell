// ═══════════════════════════════════════════════════════════════════════════
// VERROU — lot du 21/11/2026, point 6b : aucun message d'un compte Cloud ne parle de Chrome ni de l'ordinateur
// ═══════════════════════════════════════════════════════════════════════════
// Rouge avant : la restriction Vinted (« ouvre vinted.fr dans Chrome pour voir ce que Vinted demande ») perdait sa cause
// au Cloud (« FillSell Cloud réessaie tout seul ; relance-la ») ; la file des tâches disait « ouvre ta boutique @x sur
// vinted.fr dans Chrome » ; « Connecte-toi à Vinted sur ton ordinateur » partout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { texteSelonVoie, MOTS_DU_POSTE_RE } from '../supabase/functions/_shared/texte-voie.js';
import { situationJob } from '../src/utils/fileDesJobs.js';
import { texteConnecteToi } from '../src/annonces/synchroniser.js';
import { noterCompteCourantCloud } from '../src/cloud/voieCloud.js';
import { tuileConnecteeAuCloud, PHASES_SANS_CHIFFRE } from '../src/stock/boutonSynchro.js';

let ok = 0;
const t = (nom, f) => { f(); ok++; console.log(`  ✓ ${nom}`); };
const RESTRICTION = "Vinted a restreint les mises en vente de ton compte : ouvre vinted.fr dans Chrome pour voir ce que Vinted demande. "
  + "Ton annonce est toujours en ligne : rien n'est retiré tant que la restriction n'est pas levée ; la republication repartira seule ensuite.";

console.log('1. La restriction Vinted (linda) : la cause reste, le geste se fait depuis le téléphone');
t('français', () => {
  const c = texteSelonVoie(RESTRICTION, { cloud: true, nom: 'Vinted' });
  assert.match(c, /^Vinted a restreint les mises en vente de ton compte : ouvre l'app Vinted ou vinted\.fr, depuis ton téléphone, pour voir ce que Vinted demande\./);
  assert.match(c, /Ton annonce est toujours en ligne/);
  assert.equal(MOTS_DU_POSTE_RE.test(c), false);
  assert.doesNotMatch(c, /relance-la/);
});
t('le texte de l\'erreur du formulaire (« Ouvrir … dans Chrome »)', () => {
  const c = texteSelonVoie("RESTRICTION VINTED : Vinted a restreint les mises en vente de ce compte (page /selling-restriction à la place du formulaire de dépôt). Ouvrir vinted.fr dans Chrome pour voir ce que Vinted demande.", { cloud: true, nom: 'Vinted' });
  assert.match(c, /Ouvrir l'app Vinted ou vinted\.fr, depuis ton téléphone, pour voir ce que Vinted demande\./);
  assert.equal(MOTS_DU_POSTE_RE.test(c), false);
});
t('anglais', () => {
  const c = texteSelonVoie('Vinted has restricted listings on your account: open vinted.co.uk in Chrome to see what Vinted asks.', { cloud: true, nom: 'Vinted', lang: 'en' });
  assert.match(c, /open the Vinted app or vinted\.co\.uk, from your phone, to see what Vinted asks/);
});
t('sans Cloud : le texte de l\'ordinateur, tel quel ; idempotent au Cloud', () => {
  assert.equal(texteSelonVoie(RESTRICTION, { cloud: false }), RESTRICTION);
  const c = texteSelonVoie(RESTRICTION, { cloud: true, nom: 'Vinted' });
  assert.equal(texteSelonVoie(c, { cloud: true, nom: 'Vinted' }), c);
});

console.log('2. La file des tâches d\'un compte Cloud : jamais « dans Chrome »');
const job = (pf) => ({ id: 'j1', platform: 'vinted', action: 'republish', status: 'pending', created_at: new Date().toISOString(), platform_fields: pf });
t('boutique attendue : la boutique connectée à FillSell Cloud', () => {
  const s = situationJob(job({ attente_boutique: { login: 'marie', depuis: new Date().toISOString() } }), { cloud: true });
  assert.equal(s.motif, 'boutique');
  assert.match(s.raison, /ta boutique Vinted @marie, pas sur celle connectée à FillSell Cloud/);
  assert.equal(MOTS_DU_POSTE_RE.test(s.raison), false);
  const pc = situationJob(job({ attente_boutique: { login: 'marie', depuis: new Date().toISOString() } }), { cloud: false });
  assert.match(pc.raison, /dans Chrome/);
});

console.log('3. « Connecte-toi à … » : la connexion se refait dans le Cloud');
t('texteConnecteToi', () => {
  assert.equal(texteConnecteToi('vinted', 'fr', false), 'Connecte-toi à Vinted sur ton ordinateur.');
  assert.equal(texteConnecteToi('vinted', 'fr', true), 'Reconnecte Vinted à FillSell Cloud (Réglages › Abonnement › FillSell Cloud).');
  noterCompteCourantCloud(true);
  assert.match(texteConnecteToi('leboncoin', 'en'), /^Reconnect Leboncoin to FillSell Cloud/);
  noterCompteCourantCloud(false);
  assert.equal(texteConnecteToi('leboncoin', 'en'), 'Sign in to Leboncoin on your computer.');
});

console.log('4. (point 6a, Louis) La carte du Stock dit la connexion du Cloud, jamais « pas connecté » sur un vieux relevé');
t('plateforme connectée au Cloud : le dernier relevé réussi, sinon « connecté »', () => {
  for (const phase of PHASES_SANS_CHIFFRE) {
    assert.equal(tuileConnecteeAuCloud({ connexion: 'connecte', phase, dernierReussi: { id: 'r' } }), 'releve');
    assert.equal(tuileConnecteeAuCloud({ connexion: 'connecte', phase, dernierReussi: null }), 'connecte');
  }
  // Un relevé fait ou en cours garde sa tuile ; une plateforme à (re)connecter garde son « pas connecté ».
  assert.equal(tuileConnecteeAuCloud({ connexion: 'connecte', phase: 'fait', dernierReussi: { id: 'r' } }), null);
  assert.equal(tuileConnecteeAuCloud({ connexion: 'connecte', phase: 'en_cours', dernierReussi: null }), null);
  assert.equal(tuileConnecteeAuCloud({ connexion: 'a_reconnecter', phase: 'absente', dernierReussi: { id: 'r' } }), null);
  assert.equal(tuileConnecteeAuCloud({ connexion: null, phase: 'absente', dernierReussi: { id: 'r' } }), null);
});
t('la carte branche la règle et lit le dernier relevé réussi une seule fois', () => {
  const carte = fs.readFileSync(new URL('../src/stock/BlocSynchro.jsx', import.meta.url), 'utf8');
  assert.match(carte, /tuileConnecteeAuCloud\(\{ connexion: connexionCloudDe\(cxCloud, p\)/);
  assert.match(carte, /!t\.e\.cloudConnecte && t\.e\.phase !== 'fait'/);
  assert.match(carte, /lireDerniersRelevesReussis\(r\.userId\)/);
  assert.doesNotMatch(carte, /setInterval\(/);
});

console.log(`\n${ok} vérifications vertes — lot du 21/11, points 6a et 6b (Cloud : la vraie connexion, jamais Chrome).`);
