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
//   4. le banc sur base jetable (scripts/essais/20261115160000_banc.mjs) n'est plus inscrit ;
//   5. (15/11 soir, garde-fou demandé par Nico : « que ça ne revienne pas ») la règle EN VIGUEUR — la DERNIÈRE migration
//      qui redéfinit plateformes_verite, pas seulement celle du 15/11 — perd la règle Depop, ou le texte que l'extension
//      écrit, la règle du serveur et la règle de l'app cessent de dire la même chose.
//      D'où venait le défaut (enquête du 15/11 soir) : la migration 20261009020000 (09/10, arrivée de Depop) a mis Depop
//      dans plateformes_verite avec la seule règle générique « relevé absente → à connecter » ; le relevé Depop sans accès
//      (« accès Depop non accordé », extension 0.6.105, premier relevé le 13/10) a donc toujours été « à connecter » +
//      « Me connecter » (11 comptes l'ont tapé entre le 21/10 et le 15/11). « Autoriser Depop » n'existait que sur une
//      PUBLICATION retenue (handler-watch, 11/10). Le 13/11 (0e8dd9b), l'app a écrit « Depop à autoriser → Autoriser
//      Depop » en le testant sur un état serveur INVENTÉ, que le serveur ne produisait pas. Les points 1 à 4 lisent les
//      fichiers du 15/11 : une migration plus récente réécrivant plateformes_verite sans la règle Depop les laisserait
//      verts. Le point 5 lit la définition en vigueur et la confronte au texte de l'extension et à la règle de l'app.
import { readFileSync, readdirSync } from 'node:fs';
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

console.log('5. La règle EN VIGUEUR (dernière migration qui définit plateformes_verite) = l\'extension = l\'app');
// La définition en vigueur : la DERNIÈRE migration (ordre des noms = ordre d'application) qui crée ou remplace la
// fonction ; dans ce fichier, sa dernière définition. Commentaires SQL retirés : seul le code compte.
const DOSSIER_MIG = 'supabase/migrations';
let fichiersMig = [];
try { fichiersMig = readdirSync(path.join(racine, DOSSIER_MIG)).filter((f) => f.endsWith('.sql')).sort(); } catch { /* rouge plus bas */ }
const DEF_VERITE = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.plateformes_verite\s*\(/gi;
const enVigueur = [...fichiersMig].reverse().find((f) => { DEF_VERITE.lastIndex = 0; return DEF_VERITE.test(lire(`${DOSSIER_MIG}/${f}`)); }) ?? null;
let corpsVigueur = '';
if (enVigueur) {
  const t = lire(`${DOSSIER_MIG}/${enVigueur}`);
  let debut = -1;
  DEF_VERITE.lastIndex = 0;
  for (let m = DEF_VERITE.exec(t); m; m = DEF_VERITE.exec(t)) debut = m.index;
  const ouvre = t.indexOf('$function$', debut);
  const ferme = ouvre >= 0 ? t.indexOf('$function$', ouvre + 10) : -1;
  if (debut >= 0 && ferme > ouvre) corpsVigueur = t.slice(debut, ferme).replace(/--[^\n]*/g, '');
}
ok(Boolean(enVigueur && corpsVigueur), `définition en vigueur trouvée : ${enVigueur ?? 'aucune'}`);
const brancheDepop = corpsVigueur.match(/pf = 'depop' AND COALESCE\(r\.erreur, ''\) ~\* '([^']+)' THEN\s*v_facts := v_facts \|\| jsonb_build_object\('src', 'releve', 'etat', 'a_autoriser'/);
ok(Boolean(brancheDepop) && corpsVigueur.indexOf(brancheDepop[0]) < corpsVigueur.indexOf("ELSIF r.status = 'absente'"),
  'en vigueur : le relevé Depop sans accès → « a_autoriser », AVANT la règle générique « absente → à connecter »');
const actionDepop = (corpsVigueur.match(/WHEN 'a_autoriser' THEN CASE[^\n]*WHEN pf = 'depop' THEN '([a-z_]+)'/) ?? [])[1] ?? null;
ok(actionDepop === 'autoriser_depop', `en vigueur : action rendue pour Depop à autoriser = « ${actionDepop ?? 'aucune'} » (attendu autoriser_depop, jamais connexion)`);
ok(/v ->> 'depop_acces' = 'false'/.test(corpsVigueur) && /'poste_sans_acces_depop'/.test(corpsVigueur), 'en vigueur : la trace par poste (depop_acces) est toujours lue');
// Le texte que l'extension écrit quand Chrome ne lui a pas donné www.depop.com.
const bgExt = lire('chrome-extension/background.js');
const texteExt = (bgExt.match(/if \(!\(await depopAccesAccorde\(\)\)\) return \{[^}]*absente: true, erreur: "([^"]+)"/) ?? [])[1] ?? null;
ok(Boolean(texteExt), `extension : relevé Depop sans accès = « ${texteExt ?? 'introuvable'} » (status absente)`);
let regleServeur = null;
try { regleServeur = brancheDepop ? new RegExp(brancheDepop[1], 'i') : null; } catch { regleServeur = null; }
const runExt = { status: 'absente', erreur: `[incomplet] ${texteExt ?? ''} · [rattachement] par identifiant 0`, items_vus: 0 };
ok(Boolean(texteExt && regleServeur?.test(runExt.erreur)), 'le texte de l\'extension est reconnu par la règle EN VIGUEUR du serveur (sinon : « à connecter »)');
ok(Boolean(texteExt) && R.murConnexionReleve?.(runExt, 'depop') === 'autoriser_depop', 'le texte de l\'extension est reconnu par l\'app (murConnexionReleve → autoriser_depop)');
// L'app ne se teste plus sur un état inventé : l'action qu'elle attend est celle que le serveur en vigueur produit.
const ligneVraie = (() => {
  if (typeof C.connexionsChoisies !== 'function' || !actionDepop) return null;
  const v = { ok: true, extension_vue_le: new Date().toISOString(), plateformes: { depop: { etat: 'a_autoriser', action: actionDepop, declaree: true } } };
  const l = C.connexionsChoisies({ verite: v });
  return (Array.isArray(l) ? l : (l?.lignes ?? [])).find((x) => x.p === 'depop') ?? null;
})();
ok(ligneVraie?.geste?.type === actionDepop && /Autoriser Depop/.test(ligneVraie?.geste?.libelle ?? ''),
  'l\'état et l\'action que le serveur EN VIGUEUR produit donnent « Autoriser Depop » à l\'écran (même vocabulaire des deux côtés)');

console.log(`\n${ko ? '✗' : '✓'} ${n - ko} vert(s), ${ko} rouge(s) sur ${n}`);
process.exit(ko ? 1 : 0);
