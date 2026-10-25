// ═══════════════════════════════════════════════════════════════════════════
// UN RETRAIT BEEBS QU'UNE VÉRIFICATION DE PLUS DE 72 H RETIENT (25/10, DeadRoz)
// `npm run selftest:retrait-beebs-verification-longue`
// ═══════════════════════════════════════════════════════════════════════════
// Retrait 53cff028 (annonce 34083555, « Jeans 511 Levi's », déposée par FillSell
// le 30/09 à 19:00, jamais vue en ligne, « en vérification » à chaque relevé
// depuis le 01/10 ; article vendu « Ailleurs » le 14/10) : 153 essais, un par
// heure, chacun ouvre /fr/p/34083555 (404). Constaté le 25/10 sur le compte de
// Nico : la carte « En cours de vérification » n'a AUCUN lien ni bouton — Beebs
// n'offre aucun geste pendant la vérification.
// La règle (_shared/beebs-retrait-verification-longue.js) :
//   1. au-delà de 72 h en vérification, le message est daté et vrai ;
//   2. le retrait n'est servi que si la ligne du relevé de CETTE annonce a bougé
//      depuis le dernier essai (statut, disparition, retrait), sinon toutes les 12 h ;
//   3. « depuis » ne dit que ce qu'on sait : le dépôt jamais vu en ligne, ou la
//      première ligne du relevé « en vérification » — le plus ancien.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const M = await import(pathToFileURL(join(RACINE, 'supabase/functions/_shared/beebs-retrait-verification-longue.js')).href);
let ko = 0, n = 0;
const ok = (c, quoi, detail = '') => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };

console.log('1. Depuis quand Beebs la garde en vérification');
const ligne = { statut_plateforme: 'en_verification', created_at: '2026-10-01T01:23:12.203784+00:00', vu_le: '2026-10-24T20:38:04.013+00:00', disparu_le: null, retiree_le: null };
const depot = { published_at: '2026-09-30T17:00:44.89+00:00', created_at: '2026-09-30T16:57:15.489867+00:00', vu_en_ligne_le: null };
const depuis = M.debutVerificationBeebs({ ligne, depot });
ok(depuis === '2026-09-30T17:00:44.890Z', 'DeadRoz : le dépôt du 30/09 19:00 (jamais vu en ligne) date la vérification', depuis);
ok(M.debutVerificationBeebs({ ligne, depot: null }) === '2026-10-01T01:23:12.203Z', 'sans dépôt FillSell : la première ligne du relevé « en vérification »');
ok(M.debutVerificationBeebs({ ligne, depot: { ...depot, vu_en_ligne_le: '2026-10-02T10:00:00Z' } }) === null, 'vue en ligne un jour : on ne sait plus depuis quand elle y est revenue → rien');
ok(M.debutVerificationBeebs({ ligne: { ...ligne, statut_plateforme: 'en_ligne' }, depot: null }) === null, 'ligne « en ligne » sans dépôt : rien de sûr');
const maintenant = Date.parse('2026-10-25T08:00:00Z');
ok(M.verificationLongue(depuis, maintenant) && !M.verificationLongue('2026-10-23T09:00:00Z', maintenant) && !M.verificationLongue(null, maintenant), 'plus de 72 h : longue ; 47 h : non ; inconnu : non');

console.log('\n2. Le message, daté et vrai');
const m = M.messageRetraitBeebsVerificationLongue(depuis);
ok(m === "Beebs garde cette annonce en vérification depuis le 30/09 : elle n'est ni visible ni achetable, et Beebs ne permet pas de la supprimer pendant la vérification. FillSell la retire dès que Beebs la met en ligne — rien à faire.", 'le message dit la date, l’état, l’impossibilité, et qu’il n’y a rien à faire', m);

console.log('\n3. Servi seulement si le relevé bouge, sinon toutes les 12 h');
const sig = M.signatureAnnonceBeebs(ligne);
ok(sig === M.signatureAnnonceBeebs({ ...ligne, vu_le: '2026-10-25T07:00:00Z' }), 'vu_le (chaque relevé) ne compte pas comme un changement');
ok(sig !== M.signatureAnnonceBeebs({ ...ligne, statut_plateforme: 'en_ligne' }) && sig !== M.signatureAnnonceBeebs({ ...ligne, disparu_le: '2026-10-25T06:00:00Z' })
  && sig !== M.signatureAnnonceBeebs({ ...ligne, retiree_le: '2026-10-25T06:00:00Z' }) && M.signatureAnnonceBeebs(null) === 'absente', 'statut, disparition, retrait (ou ligne disparue) : changement');
const job = (derniereH, extra = {}) => ({ platform: 'beebs', action: 'delete', platform_fields: { retrait_en_attente_verification: {
  depuis: '2026-10-14T00:46:03.585Z', derniere: new Date(maintenant - derniereH * 3600_000).toISOString(), essais: 153,
  en_verification_depuis: depuis, longue: true, signature: sig, ...extra } } });
ok(M.retenirRetraitVerificationLongue(job(2), ligne, maintenant) === true, 'dernier essai il y a 2 h, relevé inchangé : retenu');
ok(M.retenirRetraitVerificationLongue(job(12.5), ligne, maintenant) === false, 'dernier essai il y a 12 h 30 : servi (une fois toutes les 12 h)');
ok(M.retenirRetraitVerificationLongue(job(2), { ...ligne, statut_plateforme: 'en_ligne' }, maintenant) === false, 'le relevé la voit EN LIGNE : servi tout de suite (elle se retire enfin)');
ok(M.retenirRetraitVerificationLongue(job(2), null, maintenant) === false, 'la ligne a disparu : servi (on regarde)');
ok(M.retenirRetraitVerificationLongue(job(2, { longue: false }), ligne, maintenant) === false && M.retenirRetraitVerificationLongue({ ...job(2), action: 'republish' }, ligne, maintenant) === false
  && M.retenirRetraitVerificationLongue({ ...job(2), platform: 'vinted' }, ligne, maintenant) === false, 'jamais hors d’un retrait Beebs marqué « longue »');

console.log('\n4. Le câblage serveur');
const uj = lire('supabase/functions/update-job-status/index.ts');
const bloc = uj.slice(uj.indexOf('const RETRAIT_VERIF_BEEBS_RE'), uj.indexOf('const RETRAIT_VERIF_BEEBS_RE') + 6000);
ok(/\.select\("statut_plateforme, vu_le, created_at, disparu_le, retiree_le"\)/.test(bloc), 'update-job-status lit la ligne du relevé (date, disparition, retrait)');
ok(/debutVerificationBeebs\(\{ ligne: ligne as Record<string, unknown> \| null, depot: depotV as Record<string, unknown> \| null \}\)/.test(bloc)
  && /\.eq\("platform_listing_id", idBeebs\)/.test(bloc), '… et le dépôt FillSell de CE numéro');
ok(/\.\.\.\(longueV \? \{ longue: true, signature: signatureAnnonceBeebs\(ligne\) \} : \{\}\)/.test(bloc)
  && /messageEffectif = longueV && depuisV \? messageRetraitBeebsVerificationLongue\(depuisV\) :/.test(bloc), 'au-delà de 72 h : marque « longue » + signature, message daté ; avant : le message d’avant');
ok(/needsUserAttempts: Number\(pfBase\.needsUserAttempts \?\? 0\) \|\| 0/.test(bloc), 'toujours aucune tentative consommée');
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
const g = gpj.slice(gpj.indexOf('UN RETRAIT BEEBS QU\'UNE VÉRIFICATION DE PLUS DE 72 H RETIENT'), gpj.indexOf('UN RETRAIT BEEBS QU\'UNE VÉRIFICATION DE PLUS DE 72 H RETIENT') + 3500);
ok(/retenirRetraitVerificationLongue\(j, ligneDe\.get\(numeroL\(j\)\) \?\? null\)/.test(g) && /\.from\("annonces_plateforme"\)/.test(g)
  && /out = out\.filter\(\(j\) => !aRetenirL\.has\(String\(j\.id\)\)\)/.test(g), 'get-pending-jobs : retenu (jamais écrit) si le relevé n’a pas bougé et le dernier essai a moins de 12 h');
ok(/beebs_verification_longue_retenus: heldBeebsVerificationLongue/.test(gpj), 'le compteur est dans le diagnostic du service');
ok(/import \{ retenirRetraitVerificationLongue \} from "\.\.\/_shared\/beebs-retrait-verification-longue\.js";/.test(gpj)
  && /from "\.\.\/_shared\/beebs-retrait-verification-longue\.js";/.test(uj), 'les deux fonctions importent le même module');

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${n} contrôles`);
process.exit(ko ? 1 : 0);
