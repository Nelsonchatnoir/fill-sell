// VERROU (19/11/2026 soir, point 7 de Nico — compte 3f91c02e) : UNE FICHE SUPPRIMÉE PENDANT LA LECTURE DE SA DESCRIPTION
// N'EST PLUS SUIVIE, ET N'EST JAMAIS UNE « ACTION RATÉE ».
// Le cas : 16:13:10 « publier » sur la fiche 1792860311388 (photos à lire sur Beebs, Android sans extension) → suivie
// « Lecture… » ; 16:13:40 la personne supprime l'article (suppression_article, la ligne inventaire disparaît) ; le suivi
// relisait une fiche qui n'existait plus pendant 5 min, puis 16:18:34 « lecture_origine_non_aboutie », carte introuvable :
// une fausse panne (aucune tâche à créer : il n'y avait plus d'article). Maintenant : la ligne disparue → le suivi l'oublie
// (oublier), une trace « reprise_fiche_supprimee », jamais signalerActionRatee. Rouge sur e331f8e, vert après.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };
const sv = fs.readFileSync(path.join(ROOT, 'src/publication/SuiviDescriptions.jsx'), 'utf8').replace(/\r\n/g, '\n');
const boucle = sv.slice(sv.indexOf('for (const s of enCours)'), sv.indexOf('return !rate;'));
const iSelect = boucle.indexOf('from("inventaire").select("description")');
const iOubli = boucle.indexOf('if (!data) {');
const iDecision = boucle.indexOf('decisionReprise(');
const iRatee = boucle.indexOf('signalerActionRatee(');
ok(iSelect > 0, 'la relecture lit la ligne inventaire de la fiche');
ok(iOubli > iSelect && iOubli < iDecision, 'ligne absente → traitée AVANT toute décision de reprise');
const bloc = boucle.slice(iOubli, boucle.indexOf('continue;', iOubli) + 9);
ok(/oublier\(s\.id\)/.test(bloc), 'la fiche supprimée est oubliée du suivi');
ok(/reprise_fiche_supprimee/.test(bloc), 'une trace dit pourquoi (reprise_fiche_supprimee)');
ok(!/signalerActionRatee/.test(bloc) && iRatee > iOubli, 'jamais une « action ratée » pour elle');
ok(/\boublier\b/.test(sv.slice(0, sv.indexOf('from "./descriptionsSuivies"'))), 'oublier importé du magasin des suivis');

// Le magasin : oublier retire bien la fiche (aucune pastille « Description introuvable » ne reste).
const store = await import('../src/publication/descriptionsSuivies.js');
store.viderSuivis();
store.suivre({ id: 1792860311388, titre: 'x' });
ok(store.suiviDe(1792860311388)?.etat === 'lecture', 'suivie « Lecture… » après « publier »');
store.oublier(1792860311388);
ok(store.suiviDe(1792860311388) === null && store.lireSuivis().suivis.length === 0, 'oubliée : plus aucune trace dans le suivi');
store.viderSuivis();

console.log(echecs ? `✗ suivi-fiche-supprimee-1911 : ${total - echecs}/${total}` : `✓ suivi-fiche-supprimee-1911 : ${total}/${total}`);
process.exit(echecs ? 1 : 0);
