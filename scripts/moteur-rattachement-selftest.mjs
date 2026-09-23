// ═══════════════════════════════════════════════════════════════════════════
// LE MOTEUR DE RATTACHEMENT NE PERD PLUS SON IMPORT EN SILENCE (2026-09-23)
// ═══════════════════════════════════════════════════════════════════════════
// Le 19/09, la migration « une notification n'est pas une annonce » a réécrit
// `rapprocher_releve` en repartant du corps de la veille : le bloc d'import
// automatique (point F du 18/09) a disparu, et personne ne l'a vu pendant
// quatre jours — 0 import, ~2 000 lignes « aucune » par jour, le stock d'un
// nouvel inscrit sans Vinted (598 annonces relevées) resté vide.
//
// Ce test lit la DERNIÈRE définition locale de chaque fonction du moteur (le
// fichier de migration le plus récent qui la définit) et vérifie la chaîne :
//   rapprocher_releve → rapprocher_traiter_annonce → rapprocher_importer
// ainsi que les trois conditions de l'import et l'affichage « importées »
// dans la ligne du run côté extension. Une future migration qui repartirait
// d'un vieux corps échoue ICI, avant d'être appliquée.
//
//   npm run selftest:moteur-rattachement

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dossier = path.join(racine, 'supabase', 'migrations');
const fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith('.sql')).sort();

/** Dernière définition locale de `public.<nom>(` : { fichier, corps }. */
function derniereDefinition(nom) {
  const entete = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${nom}\\s*\\(`, 'i');
  for (const f of [...fichiers].reverse()) {
    const src = fs.readFileSync(path.join(dossier, f), 'utf8').replace(/\r\n/g, '\n');
    const m = entete.exec(src);
    if (!m) continue;
    // Le corps s'arrête au premier `$$;` qui suit le `AS $$` de cette définition.
    const debutCorps = src.indexOf('$$', m.index);
    const finCorps = src.indexOf('$$;', debutCorps + 2);
    if (debutCorps < 0 || finCorps < 0) continue;
    return { fichier: f, corps: src.slice(m.index, finCorps + 3) };
  }
  return null;
}

const echecs = [];
const ok = [];
function exiger(cond, message) { (cond ? ok : echecs).push(message); }

const releve = derniereDefinition('rapprocher_releve');
const traiter = derniereDefinition('rapprocher_traiter_annonce');
const rattraper = derniereDefinition('rapprocher_rattraper');
const importer = derniereDefinition('rapprocher_importer');

exiger(!!releve, 'rapprocher_releve a une définition locale');
exiger(!!traiter, 'rapprocher_traiter_annonce a une définition locale');
exiger(!!rattraper, 'rapprocher_rattraper a une définition locale');
exiger(!!importer, 'rapprocher_importer a une définition locale');

if (releve) {
  exiger(/rapprocher_traiter_annonce\s*\(/.test(releve.corps),
    `rapprocher_releve (${releve.fichier}) délègue à rapprocher_traiter_annonce`);
  exiger(/import_auto_ouvert/.test(releve.corps),
    `rapprocher_releve (${releve.fichier}) lit l'interrupteur import_auto_ouvert`);
  exiger(/rapprocher_budget\s*\(/.test(releve.corps) && /restantes/.test(releve.corps),
    `rapprocher_releve (${releve.fichier}) a un budget de temps et rend « restantes »`);
  exiger(/'importees'/.test(releve.corps),
    `rapprocher_releve (${releve.fichier}) rend « importees » dans son bilan`);
}
if (traiter) {
  exiger(/rapprocher_importer\s*\(/.test(traiter.corps),
    `rapprocher_traiter_annonce (${traiter.fichier}) appelle rapprocher_importer — l'import automatique est vivant`);
  exiger(/p_import_ouvert/.test(traiter.corps),
    'condition 1 — l\'interrupteur est passé au traitement');
  exiger(/statut_plateforme\s*=\s*'en_ligne'/.test(traiter.corps),
    'condition 2 — seule une annonce EN LIGNE s\'importe');
  exiger(/decision\s*=\s*'aucune'/.test(traiter.corps) && /run_id/.test(traiter.corps),
    'condition 3 — une ligne « aucune » d\'un run précédent est exigée');
  exiger(/annonce_lien_notification\s*\(/.test(traiter.corps),
    'une notification n\'est toujours pas une annonce (filtre du 19/09 conservé)');
  exiger(/'candidats_total'/.test(traiter.corps) && /'signaux'/.test(traiter.corps) && /'choix_arbitraire'/.test(traiter.corps),
    'la proposition porte candidats_total / signaux / choix_arbitraire (clés du 18/09)');
}
if (rattraper) {
  exiger(/rapprocher_traiter_annonce\s*\(/.test(rattraper.corps),
    `rapprocher_rattraper (${rattraper.fichier}) passe par le même traitement que le relevé`);
  exiger(/p_simulation/.test(rattraper.corps) && /RAISE EXCEPTION/.test(rattraper.corps),
    'le rattrapage sait simuler (tout exécuter, puis annuler)');
}
if (importer) {
  exiger(/jumeau_probable/.test(importer.corps),
    `rapprocher_importer (${importer.fichier}) garde la garde du jumeau (20/09)`);
}

// Côté extension : la ligne du run doit DIRE combien d'annonces sont importées,
// sinon la prochaine panne de l'import est de nouveau invisible.
const bg = fs.readFileSync(path.join(racine, 'chrome-extension', 'background.js'), 'utf8');
exiger(/importées \$\{bilan\.importees\}/.test(bg),
  'background.js écrit « importées N » dans la ligne [rattachement] du run');
exiger(/Number\(b\.restantes\) > 0/.test(bg),
  'background.js rappelle le moteur tant qu\'il rend des « restantes »');
exiger(/annonces_plateforme\?user_id=eq\.\$\{userId\}&platform=eq\.\$\{platform\}&inventaire_id=is\.null/.test(bg),
  'l\'alarme quotidienne relève aussi une plateforme où des annonces attendent leur rattachement');

for (const m of ok) console.log('  ✓', m);
for (const m of echecs) console.error('  ✗', m);
if (echecs.length) {
  console.error(`\n${echecs.length} contrôle(s) en échec — l'import automatique ou sa visibilité est cassé(e).`);
  process.exit(1);
}
console.log(`\n${ok.length} contrôles passés — moteur de rattachement : la chaîne relevé → traitement → import est entière.`);
