// VERROU (15/11/2026, question Depop de Nico — merelus.serge, 3c82995d) — « ACCÈS DEPOP NON ACCORDÉ » SE DIT « AUTORISER
// DEPOP », JAMAIS « ME CONNECTER ».
//   node --import ./scripts/loader-ext.mjs scripts/depop-acces-verite-selftest.mjs   (npm run selftest:depop-acces-verite)
//
// Cas : 13 relevés Depop « absente · [incomplet] accès Depop non accordé » de 12:04 à 13:28 ; son seul poste déclarait
// « sans_depop » (chrome.permissions.contains = faux). La vérité serveur rangeait ce relevé dans les murs de connexion
// (« à connecter », action « connexion ») : l'app disait « Tu n'es pas connecté à Depop » + « Me connecter » ; ses deux
// « Me connecter » (13:24, 13:27) ont rouvert depop.com — la demande finit « done » dès que la page s'ouvre, elle ne
// vérifie aucune permission — il s'y voyait connecté, et le relevé de 13:28 redisait « accès non accordé ». Côté app, la
// carte du relevé, ses bandes et le parcours d'entrée (murConnexionReleve) ne reconnaissaient pas ce mur : aucun geste.
// Rapport : docs/enquetes/lot-1511-4-champs-doutes-depop/RAPPORT.md.
//
// Ce verrou casse si :
//   1. la vérité serveur (migration 20261115160000) ne range plus « accès Depop non accordé » en « à autoriser », ne lit
//      plus la trace par poste (depop_acces), ou ne rend plus l'action « autoriser_depop » ;
//   2. l'app (src/annonces/etatReleve.js) ne transforme plus ce relevé en motif « autoriser_depop » (carte du relevé,
//      bandes, parcours d'entrée), ou le confond avec « Me connecter » ;
//   3. les écrans des plateformes choisies (connexionChoisie) ne disent plus « Depop : à autoriser » + « Autoriser Depop »
//      pour cet état ;
//   4. le banc sur base jetable (scripts/essais/20261115160000_banc.mjs) n'est plus inscrit.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = process.env.VERROU_RACINE ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => { try { return readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const importer = async (f) => { try { return await import(pathToFileURL(path.join(racine, f)).href); } catch { return {}; } };

const NON_ACCORDE = '[incomplet] accès Depop non accordé · [rattachement] par identifiant 0, automatiques 0, proposées 0';

console.log('1. La vérité serveur : « accès Depop non accordé » → « à autoriser »');
const mig = lire('supabase/migrations/20261115160000_depop_acces_non_accorde_a_autoriser.sql');
ok(/ELSIF pf = 'depop' AND COALESCE\(r\.erreur, ''\) ~\* 'acc\[èe\]s depop non accord' THEN\s*(--[^\n]*\n\s*)*v_facts := v_facts \|\| jsonb_build_object\('src', 'releve', 'etat', 'a_autoriser'/.test(mig),
  'le relevé « accès Depop non accordé » donne « a_autoriser » (avant la règle générique des murs)');
ok(mig.indexOf("acc[èe]s depop non accord") > 0 && mig.indexOf("acc[èe]s depop non accord") < mig.indexOf("ELSIF r.status = 'absente'"), 'la règle Depop passe AVANT « absente → à connecter »');
ok(/FILTER \(WHERE v ->> 'depop_acces' = 'true'\)[\s\S]{0,120}FILTER \(WHERE v ->> 'depop_acces' = 'false'\)/.test(mig) && /'poste_sans_acces_depop'/.test(mig), 'la trace par poste (depop_acces) est lue : sans accès → « à autoriser », avec accès → efface');
ok(/WHEN pf = 'depop' THEN 'autoriser_depop'/.test(mig), 'action « autoriser_depop » (jamais « connexion ») pour Depop à autoriser');
ok(/md5\(v\) <> '6a48d15f5674833985d9e84b9a97850f'/.test(mig) && lire('supabase/rollbacks/20261115160000_depop_acces_non_accorde_a_autoriser_INVERSE.sql').includes('CREATE OR REPLACE FUNCTION public.plateformes_verite'), 'garde md5 du corps de prod lu ; inverse prêt');

const mig2 = lire('supabase/migrations/20261115170000_depop_a_autoriser_seulement_choisie.sql');
ok(/ELSIF v_dpos_ko_le IS NOT NULL AND v_declaree THEN/.test(mig2)
  && lire('supabase/rollbacks/20261115170000_depop_a_autoriser_seulement_choisie_INVERSE.sql').includes('CREATE OR REPLACE FUNCTION public.plateformes_verite'),
  'le poste sans l\'accès ne dit « à autoriser » qu\'à qui a CHOISI Depop (20261115170000, inverse prêt)');

console.log('2. L\'app : le relevé « accès Depop non accordé » propose « Autoriser Depop »');
const R = await importer('src/annonces/etatReleve.js');
const run = { status: 'absente', erreur: NON_ACCORDE, items_vus: 0 };
ok(typeof R.murConnexionReleve === 'function' && R.murConnexionReleve(run, 'depop') === 'autoriser_depop', 'murConnexionReleve → « autoriser_depop » (carte du relevé, bandes, parcours d\'entrée)');
ok(R.absenceDePlateforme?.({ status: 'failed', erreur: NON_ACCORDE, items_vus: 0 }) === true, 'un relevé « failed » avec ce texte est une plateforme empêchée (pas une panne technique)');
ok(R.murConnexionReleve?.({ status: 'absente', erreur: '[incomplet] session depop : page de connexion', items_vus: 0 }, 'depop') === 'connexion', 'la vraie page de connexion reste « Me connecter »');
ok(R.murConnexionReleve?.({ status: 'absente', erreur: 'accès Opla non accordé', items_vus: 0 }, 'opla') === 'autoriser_opla', 'Opla inchangé');

console.log('3. Les écrans des plateformes choisies');
const C = await importer('src/plateformes/connexionChoisie.js');
const verite = { ok: true, extension_vue_le: new Date().toISOString(), plateformes: { depop: { etat: 'a_autoriser', action: 'autoriser_depop', declaree: true } } };
const lignes = typeof C.connexionsChoisies === 'function' ? C.connexionsChoisies({ verite }) : null;
const lignesListe = Array.isArray(lignes) ? lignes : (lignes?.lignes ?? []);
const dep = lignesListe.find((l) => l.p === 'depop');
ok(dep?.etat === 'a_autoriser' && dep?.geste?.type === 'autoriser_depop' && /Autoriser Depop/.test(dep?.geste?.libelle ?? ''), '« Depop : à autoriser » + bouton « Autoriser Depop » (jamais « Me connecter »)');

const reg = lire('src/reglages/SousPagePlateformes.jsx');
ok(/etat === ETATS\.A_AUTORISER && pf === 'depop' && !lc && \([\s\S]{0,400}motif=\{MOTIFS\.AUTORISER_DEPOP\}/.test(reg)
  && /etat === ETATS\.A_AUTORISER && pf !== 'depop' && \(/.test(reg),
  'Réglages › Plateformes : Depop à autoriser → sa phrase et « Autoriser Depop », jamais le bloc d\'Opla');

console.log('4. Le banc sur base jetable est inscrit');
const pkg = JSON.parse(lire('package.json') || '{}');
ok(/scripts\/essais\/20261115160000_banc\.mjs/.test(pkg.scripts?.['selftest:depop-acces-verite-pg'] ?? ''), 'selftest:depop-acces-verite-pg');

console.log(`\n${ko ? '✗' : '✓'} ${n - ko} vert(s), ${ko} rouge(s) sur ${n}`);
process.exit(ko ? 1 : 0);
