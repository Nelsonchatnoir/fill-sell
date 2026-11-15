// 15/11/2026 (décision (a) de Nico, point 4 — ventes effacées) : fabrique 20261115_ventes_champs_rendus.sql à partir de
// ce qui a été LU dans les deux copies temporaires des sauvegardes Supabase (« Restore to a new project ») :
//   · lecture-temp-0811 (sauvegarde du 08/11 04:20 UTC) : ayadi007 (cfdfda6f) ;
//   · lecture-temp-1311 (sauvegarde du 13/11 04:24 UTC) : noubliejamais (2c89e573).
// Lecture seule dans les copies : `select … from ventes left join inventaire …` (scripts de lecture du lot, rangés dans
// .tmp-terminal/lot1511d/ le temps du lot). Les copies sont supprimées une fois les champs remis.
// Ne garde QUE les champs perdus demandés par Nico : prix d'achat, frais (selling_fees, frais_plateforme), marge (benefice),
// marque, et le numéro d'annonce de la fiche (pour le lien vers la fiche) — appariés par l'id d'origine de la vente,
// jamais par le titre.
//   node scripts/reparations/20261115_ventes_champs_rendus_generer.mjs <clone-0811.json> <clone-1311.json> <cibles.json>
// cibles.json : { "<id>": "<8 premiers caractères du compte>" } — les ventes rendues (restauration du 15/11 12:27:54 et
// doutes remis par 20261115_ventes_doutes_remises.sql).
import { readFileSync, writeFileSync } from 'node:fs';

const [f0811, f1311, fCibles] = process.argv.slice(2);
if (!f0811 || !f1311 || !fCibles) { console.error('usage : <clone-0811.json> <clone-1311.json> <cibles.json>'); process.exit(2); }
const lignes = (f) => JSON.parse(readFileSync(f, 'utf8')).rows;
const cibles = JSON.parse(readFileSync(fCibles, 'utf8'));

const lit = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined || v === '' ? 'NULL' : String(Number(v)));

const valeurs = [];
const compte = {};
for (const [copie, f] of [['0811', f0811], ['1311', f1311]]) {
  for (const x of lignes(f)) {
    const u8 = String(x.user_id).slice(0, 8);
    if (cibles[String(x.id)] !== u8) continue;
    const champs = [x.prix_achat, x.benefice, x.selling_fees, x.frais_plateforme, x.marque, x.fiche_vinted];
    if (champs.every((c) => c === null || c === undefined || c === '')) continue;
    valeurs.push(`(${x.id}, '${u8}', ${lit(x.commande_ref)}, ${num(x.prix_vente)}, ${num(x.prix_achat)}, ${num(x.benefice)}, `
      + `${num(x.selling_fees)}, ${num(x.frais_plateforme)}, ${lit(x.marque)}, ${lit(x.fiche_vinted)}, '${copie}')`);
    compte[u8] = (compte[u8] ?? 0) + 1;
  }
}
valeurs.sort();
const gabarit = readFileSync(new URL('./20261115_ventes_champs_rendus.gabarit.sql', import.meta.url), 'utf8');
const sortie = gabarit
  .replace('-- @VALEURS@', valeurs.join(',\n') + ';')
  .replace("'@ATTENDUS@'", `'${JSON.stringify(Object.fromEntries(Object.entries(compte).sort()))}'`)
  .replaceAll('@N@', String(valeurs.length));
writeFileSync(new URL('./20261115_ventes_champs_rendus.sql', import.meta.url), sortie);
console.log(`${valeurs.length} ventes à compléter`, compte);
