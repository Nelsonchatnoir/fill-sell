// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LES FICHES « JEU TESTÉ LE <DATE> » DU COMPTE de63ca45 : LA DATE PASSE DANS teste_le (13/11/2026, lot NU, H2)
//   npm run selftest:date-test-forme-plus-tard
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (13/11, question H2 de l'étape 5) : « oui, la date des 72 fiches « Jeu testé le » passe dans
// teste_le ». La réparation préparée (scripts/reparations/20261113_de63ca45_date_de_test.sql) ne rangeait que les 92 fiches
// « Jeu testé aujourd’hui, le <date>, et fonctionnel. ». Lecture seule du 13/11 (compte de63ca45, fiches en stock) :
// 72 fiches portent « … testé le <date>, … » — AUCUNE ne suit son modèle « Jeu testé le [date] et fonctionnel. » :
//   · 66 « Jeu testé le <j> <mois> 2026, fonctionne correctement. » + 1 « 1er » — 67 RANGÉES (date complète, une seule
//     phrase, seule sur sa ligne) ;
//   · 5 NON TOUCHÉES : « UMD testé le 6 septembre 2026, … » (le mot n'est pas « Jeu » : un film UMD deviendrait « Jeu ») ;
//     « Jeu testé le 17 août, … » et « Jeu testé le 31 mai, …, aucun souci à signaler. » (SANS ANNÉE : jamais une année
//     inventée) ; « …, fonctionne parfaitement. » et « …, se lance et fonctionne correctement. » (13/11, tranché par
//     prudence — règle « phrases du vendeur mot pour mot » : leurs mots ne deviennent pas « et fonctionnel »).
// Pourquoi la phrase SORT du texte (comme pour les 92) : la date posée dans teste_le, get-pending-jobs écrit à chaque envoi
// la phrase de SON modèle ; si l'ancienne phrase restait (elle ne suit pas le modèle, rien ne la reconnaît), l'annonce
// partirait avec DEUX phrases de test. ⚠️ Aujourd'hui ces 72 phrases partent telles quelles (le service ne les reconnaît pas :
// la note de la PREUVE d'avant le disait « réécrite au jour de l'envoi », c'était faux pour ces formes).
// Aucune annonce ni tâche touchée ; script PRÉPARÉ, jamais exécuté (feu vert de Nico, après get-pending-jobs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = process.env.FILLSELL_RACINE ? path.resolve(process.env.FILLSELL_RACINE) : path.resolve(ICI, '..');
const imp = async (p) => { try { return await import(pathToFileURL(path.join(RACINE, p)).href); } catch { return null; } };
const lire = (p) => { try { return fs.readFileSync(path.join(RACINE, p), 'utf8'); } catch { return ''; } };
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 400)}`}`); } };

const B = await imp('src/utils/blocsDescription.js');
const C = await imp('src/utils/consignesRedaction.js');
const fx = JSON.parse(fs.readFileSync(path.join(ICI, 'fixtures/redaction-de63ca45/sept-fiches.json'), 'utf8'));
const lues = C?.lireConsignes?.(fx.consignes) ?? null;
const servir = (texte, plateforme, aujourdhui, testeLe = null) => B?.rendreDescriptionAuService?.(texte, { plateforme, lues, aujourdhui, testeLe }) ?? null;

// Les 72 phrases relevées le 13/11 (la ligne seule — jamais le reste du texte), avec leur nombre de fiches.
const PHRASES = [
  ['Jeu testé le 10 septembre 2026, fonctionne correctement.', 2], ['Jeu testé le 11 septembre 2026, fonctionne correctement.', 5],
  ['Jeu testé le 12 septembre 2026, fonctionne correctement.', 7], ['Jeu testé le 13 septembre 2026, fonctionne correctement.', 1],
  ['Jeu testé le 14 septembre 2026, fonctionne correctement.', 4], ['Jeu testé le 15 septembre 2026, fonctionne correctement.', 6],
  ['Jeu testé le 15 septembre 2026, fonctionne parfaitement.', 1], ['Jeu testé le 15 septembre 2026, se lance et fonctionne correctement.', 1],
  ['Jeu testé le 17 août, fonctionne parfaitement.', 1], ['Jeu testé le 1er septembre 2026, fonctionne correctement.', 1],
  ['Jeu testé le 2 septembre 2026, fonctionne correctement.', 1], ['Jeu testé le 25 août 2026, fonctionne correctement.', 3],
  ['Jeu testé le 26 août 2026, fonctionne correctement.', 2], ['Jeu testé le 27 août 2026, fonctionne correctement.', 7],
  ['Jeu testé le 28 août 2026, fonctionne correctement.', 2], ['Jeu testé le 29 août 2026, fonctionne correctement.', 5],
  ['Jeu testé le 3 septembre 2026, fonctionne correctement.', 1], ['Jeu testé le 31 août 2026, fonctionne correctement.', 10],
  ['Jeu testé le 31 mai, fonctionne parfaitement, aucun souci à signaler.', 1], ['Jeu testé le 4 septembre 2026, fonctionne correctement.', 2],
  ['Jeu testé le 6 septembre 2026, fonctionne correctement.', 3], ['Jeu testé le 7 septembre 2026, fonctionne correctement.', 5],
  ['UMD testé le 6 septembre 2026, fonctionne correctement.', 1],
];
const FIN = 'Vendu comme sur les photos.\n\n📍 Remise en main propre possible.\n\n🚚 Expédition rapide et soignée, généralement sous 12 heures ouvrées.';
const texteAvec = (phrase) => `🎮 Je vends un jeu sur PS4.\n\n📦 Contenu :\n\n✅ Disque du jeu.\n\n${phrase}\n\n${FIN}`;
const REELLE = 'Jeu testé le 15 septembre 2026, fonctionne correctement.';

console.log('\n1. Le service aujourd\'hui (constat) et ce qui imposait de sortir la phrase');
ok(PHRASES.reduce((s, [, k]) => s + k, 0) === 72, '72 fiches relevées le 13/11');
{
  const t = texteAvec(REELLE);
  const r = servir(t, 'vinted', '2026-11-13');
  ok(r && r.texte === t && !r.modifie, 'sans teste_le : « Jeu testé le 15 septembre 2026, fonctionne correctement. » part TELLE QUELLE (son modèle ne la reconnaît pas)', r?.texte?.slice(-220));
  const double = servir(t, 'vinted', '2026-11-13', '2026-09-15');
  const nb = (double?.texte.match(/testé le/g) ?? []).length;
  ok(nb === 2, 'date posée SANS sortir la phrase → DEUX phrases de test : la réparation doit la sortir du texte', double?.texte?.slice(-260));
}

console.log('\n2. La réparation (le motif lu DANS le script, appliqué aux 72 phrases réelles)');
const rep = lire('scripts/reparations/20261113_de63ca45_date_de_test.sql');
const brut = rep.match(/motif_plus_tard\(re\) AS \(VALUES \('((?:[^']|'')+)'\)\)/)?.[1] ?? null;
const RE = brut ? new RegExp(brut.replace(/''/g, "'")) : null;
ok(Boolean(RE), 'le script porte le motif « plus tard » (motif_plus_tard)');
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const rangees = [], laissees = [];
for (const [p, k] of PHRASES) {
  const m = RE ? RE.exec(`${p}\n`) : null;
  for (let i = 0; i < k; i++) (m ? rangees : laissees).push(m ? `${m[4]}-${String(MOIS.indexOf(m[3]) + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}` : p);
}
ok(rangees.length === 67 && laissees.length === 5, '67 rangées, 5 laissées', { rangees: rangees.length, laissees });
ok(laissees.sort().join(' | ') === ['Jeu testé le 15 septembre 2026, fonctionne parfaitement.', 'Jeu testé le 15 septembre 2026, se lance et fonctionne correctement.',
  'Jeu testé le 17 août, fonctionne parfaitement.', 'Jeu testé le 31 mai, fonctionne parfaitement, aucun souci à signaler.', 'UMD testé le 6 septembre 2026, fonctionne correctement.'].join(' | '),
  'laissées : sans année (17 août, 31 mai), « UMD », et les fins « fonctionne parfaitement » / « se lance et … » (mot pour mot) — jamais une année, un mot ni une fin réécrits', laissees);
ok(rangees.slice().sort()[0] === '2026-08-25' && rangees.slice().sort().at(-1) === '2026-09-15' && rangees.includes('2026-09-01'), 'dates du 25/08 au 15/09/2026, « 1er » lu (2026-09-01)');
ok(RE && !RE.test('Jeu testé le 15 septembre 2026 et fonctionnel, mais la manette grésille.\n') && !RE.test('Jeu testé le 15 septembre 2026, fonctionne correctement. Boîtier abîmé.\n'), 'une phrase qui dit autre chose, ou suivie d\'autre chose sur sa ligne : jamais touchée');

console.log('\n3. Après la réparation : la phrase de SON modèle, une seule fois, omise sur Beebs');
{
  const t = texteAvec(REELLE);
  // Le retrait, comme le script : la phrase sort avec les lignes vides qui la précèdent.
  const echap = REELLE.replace(/[.^$*+?()[\]{}|\\]/g, '\\$&');
  const apres = t.replace(new RegExp(`\\n*(?:^|(?<=\\n))${echap}[ \\t]*`), '').replace(/^\n+/, '');
  ok(apres === `🎮 Je vends un jeu sur PS4.\n\n📦 Contenu :\n\n✅ Disque du jeu.\n\n${FIN}`, 'le texte de la fiche : la phrase sortie, rien d\'autre ne bouge', apres);
  const v = servir(apres, 'vinted', '2026-11-13', '2026-09-15');
  ok(v && (v.texte.match(/testé le/g) ?? []).length === 1 && v.texte === texteAvec('Jeu testé le 15 septembre 2026 et fonctionnel.'), 'Vinted, servi le 13/11 : « Jeu testé le 15 septembre 2026 et fonctionnel. » (son modèle), à sa place, avant ses phrases finales', v?.texte?.slice(-260));
  const b = servir(apres, 'beebs', '2026-11-13', '2026-09-15');
  ok(b && !/testé/.test(b.texte) && b.texte.endsWith(FIN), 'Beebs : aucune phrase de test (refusée par la plateforme)', b?.texte?.slice(-200));
}

console.log('\n4. Le script, son inverse, sa preuve');
ok(/famille/.test(rep) && /'plus_tard'/.test(rep) && /'aujourdhui'/.test(rep), 'deux familles dans la même sauvegarde (aujourdhui : les 92, plus_tard : les 67)');
ok(/IF np < 60 OR np > 67/.test(rep) && /IF na < 80 OR na > 92/.test(rep), 'gardes de nombre PAR famille (92 et 67 lues le 13/11, jamais au-delà)');
ok(/regexp_matches\(f\.description, 'testé \(aujourd\.hui\|le \)', 'g'\)\) = 1|n_phrases = 1/.test(rep), 'une seule phrase de test dans le texte (sinon : pas touchée)');
ok(/description_apres ~ 'testé \(aujourd\.hui\|le \)'/.test(rep), 'aucune phrase de test ne reste après le retrait (sinon rien n\'est écrit)');
ok(/teste_le > \(now\(\) AT TIME ZONE 'Europe\/Paris'\)::date/.test(rep), 'jamais une date de test dans le futur');
ok(/i\.description = b\.description_avant AND NOT \(i\.attributs \? 'teste_le'\)/.test(rep) && /NON EXÉCUTÉE/.test(rep), 'écriture seulement sur une fiche intacte ; non exécutée');
const inv = lire('scripts/reparations/20261113_de63ca45_date_de_test_INVERSE.sql');
ok(/SET description = b\.description_avant/.test(inv) && /67/.test(inv), 'inverse : chaque fiche (des deux familles) retrouve son texte, la date sort');
const pre = lire('scripts/reparations/20261113_de63ca45_date_de_test_PREUVE.sql');
ok(/forme_plus_tard_reparable/.test(pre) && /hors_modele_plus_tard/.test(pre) && /--read-only/.test(pre) && !/\b(UPDATE|INSERT|DELETE|CREATE)\b/.test(pre.replace(/^--.*$/gm, '')), 'preuve : compte les réparables « plus tard » et nomme les laissées, lecture seule');

ok(/_INVERSE\.sql/.test(lire('scripts/essais/20261113_de63ca45_date_de_test_banc.mjs')), 'banc sur base jetable (réparation, garde, rejouée, inverse à l\'octet) : node scripts/essais/20261113_de63ca45_date_de_test_banc.mjs');

console.log(`\n${n - ko}/${n} verts${ko ? `, ${ko} rouge(s)` : ''}`);
if (ko) process.exit(1);
