// ═══════════════════════════════════════════════════════════════════════════
// AUCUNE FICHE NE NAÎT D'UN RELEVÉ SANS DÉCISION v3 (08/10/2026, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Recensement du 08/10 après-midi : une fiche « releve_* » (Leboncoin, Beebs,
// eBay, Opla) ne sort que de rapprocher_importer, appelé par le moteur v3
// (rapprochement_v3_fiche_de) ou par la personne (rapprochement_decider) ; la
// base refuse toute autre écriture (inventaire_releve_par_decision). Le
// dressing Vinted écrit ses fiches lui-même (extension) : celles nées depuis
// la dernière passe sont jugées par le moteur contre les imports déjà au stock.
// Ce test ÉCHOUE si :
//   · une écriture de fiche « releve_* » apparaît ailleurs (extension, app,
//     fonctions edge, fonction SQL autre que rapprocher_importer) ;
//   · la garde de la base, la clé posée par rapprocher_importer, la règle
//     tracée ou le réveil de la passe disparaissent ;
//   · le moteur ne juge plus une fiche Vinted nouvelle contre un import (ou
//     rejuge une décision de la personne, ou fusionne malgré un concurrent) ;
//   · avec --prod : la garde manque en base, une fiche de relevé née depuis le
//     correctif n'a pas sa décision v3 ou de la personne, ou une fiche Vinted
//     d'un compte à imports est restée sans jugement alors que la passe est finie.
//
//   npm run selftest:aucune-fiche-sans-v3            (fichiers + moteur)
//   node scripts/aucune-fiche-sans-v3-selftest.mjs --prod   (et la base, lecture seule)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { passe } from '../supabase/functions/_shared/rapprochement/passe.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };
const MIGRATION = 'supabase/migrations/20261008130000_aucune_fiche_de_releve_sans_v3.sql';
// Date d'application du correctif en prod (borne des contrôles --prod).
const APPLIQUE_LE = '2026-10-08T11:15:00Z'; // 20261008130000 appliquée vers 11:18 UTC (13:18 Paris)

const fichiers = (dir, ext) => {
  const out = [];
  const pile = [path.join(racine, dir)];
  while (pile.length) {
    const d = pile.pop();
    if (!fs.existsSync(d)) continue;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) pile.push(p); else if (ext.some((x) => e.name.endsWith(x))) out.push(p);
    }
  }
  return out;
};
const corpsFonction = (sql, nom) => {
  const i = sql.indexOf(`FUNCTION public.${nom}(`); if (i < 0) return null;
  const j = sql.indexOf('$function$', i); const k = sql.indexOf('$function$', j + 10);
  return j < 0 || k < 0 ? null : sql.slice(i, k);
};

console.log('1. Aucune autre porte : ni l\'extension, ni l\'app, ni une fonction edge');
{
  const code = [...fichiers('chrome-extension', ['.js']), ...fichiers('src', ['.js', '.jsx', '.ts', '.tsx']), ...fichiers('supabase/functions', ['.ts', '.js'])];
  const ecritures = [];
  for (const f of code) {
    const t = fs.readFileSync(f, 'utf8');
    if (/origine["']?\s*:\s*[`'"]releve_/.test(t) || /origine["']?\s*:\s*`releve_\$\{/.test(t)) ecritures.push(path.relative(racine, f));
    if (t.includes('fillsell.import_releve')) ecritures.push(path.relative(racine, f) + ' (clé de la garde)');
  }
  ok(code.length > 100, `${code.length} fichiers de code lus`);
  ok(ecritures.length === 0, `aucune écriture de fiche « releve_* » hors de la base${ecritures.length ? ' : ' + ecritures.join(', ') : ''}`);
}

console.log('2. La base : la garde, la seule clé, la règle tracée, le réveil');
{
  const sql = lire(MIGRATION);
  ok(/CREATE TRIGGER inventaire_releve_par_decision\s+BEFORE INSERT ON public\.inventaire\s+FOR EACH ROW WHEN \(NEW\.origine LIKE 'releve\\_%'\)/.test(sql),
    'déclencheur BEFORE INSERT sur toute fiche « releve_* »');
  ok(/BEFORE UPDATE OF origine ON public\.inventaire[\s\S]{0,120}OLD\.origine IS DISTINCT FROM NEW\.origine/.test(sql), 'et sur une origine réécrite en « releve_* »');
  ok(/current_setting\('fillsell\.import_releve', true\)[\s\S]{0,80}RAISE EXCEPTION/.test(sql), 'sans la clé de la décision : refus (42501)');
  const imp = corpsFonction(sql, 'rapprocher_importer') ?? '';
  ok(/set_config\('fillsell\.import_releve', 'on', true\);\s*INSERT INTO inventaire/.test(imp), 'rapprocher_importer pose la clé juste avant SON insert');
  ok(/v_photos IS NOT NULL\);\s*PERFORM set_config\('fillsell\.import_releve', '', true\);/.test(imp), '… et la retire juste après (rien d\'autre ne passe dans la transaction)');
  ok(/WHEN p_par = 'rapprochement' THEN jsonb_build_object\('regle', 'rapprochement_v3'\)/.test(imp), 'un import du moteur porte « regle : rapprochement_v3 »');
  // la clé n'est posée nulle part ailleurs, dans aucune migration
  const autres = [];
  for (const f of fichiers('supabase/migrations', ['.sql'])) {
    const t = fs.readFileSync(f, 'utf8'); if (!t.includes("fillsell.import_releve', 'on'")) continue;
    const reste = t.replace(corpsFonction(t, 'rapprocher_importer') ?? '', '');
    if (reste.includes("fillsell.import_releve', 'on'")) autres.push(path.basename(f));
  }
  ok(autres.length === 0, `la clé n'est posée que par rapprocher_importer${autres.length ? ' (aussi : ' + autres.join(', ') + ')' : ''}`);
  // toute réécriture postérieure de rapprocher_importer garde la clé
  const plusTard = fichiers('supabase/migrations', ['.sql']).filter((f) => path.basename(f) > path.basename(MIGRATION))
    .filter((f) => /FUNCTION public\.rapprocher_importer\(/.test(fs.readFileSync(f, 'utf8')))
    .filter((f) => !/set_config\('fillsell\.import_releve', 'on', true\)/.test(corpsFonction(fs.readFileSync(f, 'utf8'), 'rapprocher_importer') ?? ''));
  ok(plusTard.length === 0, `aucune migration plus récente ne réécrit rapprocher_importer sans la clé${plusTard.length ? ' : ' + plusTard.map((f) => path.basename(f)).join(', ') : ''}`);
  const lireV3 = corpsFonction(sql, 'rapprochement_v3_lire') ?? '';
  ok(/'vinted_a_juger', v_vinted/.test(lireV3) && /LIMIT 200/.test(lireV3) && /'vinted_reste'/.test(lireV3), 'la lecture rend les fiches Vinted à juger (200 par passe, la suite ensuite)');
  const ap = corpsFonction(sql, 'rapprochement_v3_appliquer') ?? '';
  ok(/d ->> 'portee' = 'vinted_nouvelle'[\s\S]{0,260}v\.origine = 'vinted_sync' AND v\.created_at > rapprochement_v3_vinted_depuis\(p_user\)/.test(ap),
    'hors réparation, une fusion ne va que vers une fiche Vinted pas encore jugée');
  ok(/NOT rapprochement_v3_fiche_intacte\(f\.id\)[\s\S]{0,400}releve_poser_question/.test(ap), '… et seulement d\'un import intact (sinon la question)');
  const fr = corpsFonction(sql, 'rapprochement_fin_run') ?? '';
  ok(/v\.origine = 'vinted_sync'[\s\S]{0,200}rapprochement_v3_vinted_depuis\(NEW\.user_id\)/.test(fr), 'la fin d\'un relevé réveille la passe pour des fiches Vinted à juger');
  ok(fs.existsSync(path.join(racine, 'supabase/rollbacks/20261008130000_aucune_fiche_de_releve_sans_v3_INVERSE.sql')), 'l\'inverse est prêt');
}

console.log('3. La fonction edge date le jugement seulement au bout d\'une passe sans erreur');
{
  const ts = lire('supabase/functions/rapprochement/index.ts');
  ok(/fini && erreurs\.length === 0 && donnees\.vinted_juge_jusqu_a \? \{ vinted_juge_le: donnees\.vinted_juge_jusqu_a \}/.test(ts), 'vinted_juge_le posé après une passe finie, sans erreur');
  ok(/vintedReste \? "a_faire"/.test(ts), 'une suite à juger garde le compte « à faire » (le filet reprend)');
}

console.log('4. Le moteur juge une fiche Vinted nouvelle contre les imports au stock');
{
  const bitsDe = (graine, flips = 0) => {
    let x = 0x9e3779b9 ^ graine; const out = [];
    for (let i = 0; i < 64; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; out.push((x >>> 16) & 1); }
    for (let i = 0; i < flips; i++) out[(i * 7) % 64] ^= 1;
    return out.join('');
  };
  const E = new Map();
  const photo = (nom, graine, flips = 0) => {
    const url = `https://cdn.test/${nom}.jpg`;
    E.set(url, { url, dhash: bitsDe(graine, flips), phash: bitsDe(graine + 1000, flips),
      variantes: Object.fromEntries(['c70', 'p85', 'g45', 'g60', 'g35'].map((k, i) => [k, [bitsDe(graine + 10 * (i + 1), flips), bitsDe(graine + 10 * (i + 1) + 1000, flips)]])) });
    return url;
  };
  const fiche = (id, titre, photos, o = {}) => ({ id: String(id), titre, prix: 20, statut: 'stock', origine: o.origine ?? 'vinted_sync', marque: null, taille: o.taille ?? null,
    photos, a_verifier: false, a_verifier_auto: false, created_at: '2026-10-08T10:00:00Z', quantite: 1, vinted_item_id: (o.origine ?? 'vinted_sync') === 'vinted_sync' ? String(900000 + id) : null });
  const annonce = (id, platform, titre, photos, o = {}) => ({ id: String(id), platform, listing_id: String(id), url: `https://${platform}.test/${id}`, titre, prix: 20, photo_url: photos[0], photos,
    taille: o.taille ?? null, marque: null, inventaire_id: o.inventaire_id ?? null, ignoree: false, ignoree_par_utilisateur: false, proposition_motif: null,
    source: o.source ?? 'automatique', run_id: 'r1', en_ligne: true, hors_liste: false, ebay_bloque: false, geste: true, derniere_par: o.derniere_par ?? 'auto', derniere_decision: 'import' });
  const d = (fiches, annonces, aJuger) => ({ fiches, annonces, fusions: [], doublons: [], dette_beebs: false, import_ouvert: true, geste_recent: true, ...(aJuger ? { vinted_a_juger: aJuger } : {}) });
  const P = (nom, g) => [photo(`${nom}1`, g), photo(`${nom}2`, g + 1), photo(`${nom}3`, g + 2)];
  const Pb = (nom, g) => [photo(`${nom}1b`, g, 2), photo(`${nom}2b`, g + 1, 2), photo(`${nom}3b`, g + 2, 2)];
  const plan = (x) => passe(x, E, { mode: 'normal' }).decisions;

  // l'import Leboncoin d'hier (fiche 10, intact), la fiche Vinted née aujourd'hui (20)
  const imp = fiche(10, 'Bottes Cosmoparis Belma neuves', Pb('lbc', 100), { origine: 'releve_leboncoin', taille: '39' });
  const lbc = annonce('a1', 'leboncoin', 'Bottes Cosmoparis Belma neuves', Pb('lbc', 100), { inventaire_id: '10', taille: '39' });
  const vin = fiche(20, 'Bottes "Belma" Cosmoparis neuves 39', P('vin', 100), { taille: '39' });
  const p1 = plan(d([imp, vin], [lbc], ['20']));
  const f1 = p1.find((x) => x.type === 'fusionner');
  ok(f1 && f1.portee === 'vinted_nouvelle' && f1.garde === '20' && String(f1.absorbe) === '10',
    'même photo + même titre : l\'import rejoint la fiche Vinted nouvelle (fusion, portée « vinted_nouvelle »)');
  ok(plan(d([imp, vin], [lbc], null)).length === 0, 'sans fiche Vinted à juger, une annonce déjà rangée n\'est jamais rejugée');
  ok(plan(d([imp, vin], [{ ...lbc, source: 'manuel', derniere_par: 'utilisateur' }], ['20'])).length === 0, 'une décision de la personne n\'est jamais rejugée');
  ok(plan(d([imp, vin], [{ ...lbc, source: 'job', derniere_par: 'job' }], ['20'])).length === 0, 'une annonce liée par un dépôt FillSell (republication) non plus');
  // titre étranger, même photo : la question, hors du stock — jamais une fusion
  const etr = fiche(21, 'Matelas mousse 140x200', P('vin', 100));
  const p2 = plan(d([imp, etr], [lbc], ['21']));
  ok(!p2.some((x) => x.type === 'fusionner') && p2.some((x) => x.type === 'a_verifier' && x.candidat?.fiche === '21' && x.annonces[0] === 'a1'),
    'même photo, titre étranger : la question « Est-ce le même article ? » (à vérifier), jamais une fusion');
  // une fiche Vinted d'avant (déjà jugée) identique : rien ne bouge
  ok(plan(d([imp, { ...vin, id: '22' }], [lbc], [])).length === 0, 'une fiche Vinted déjà jugée ne rouvre rien');
  // deux fiches Vinted identiques (une d'avant, une nouvelle) : un concurrent → jamais une fusion
  const p3 = plan(d([imp, vin, { ...vin, id: '23', photos: P('vio', 100) }], [lbc], ['20']));
  ok(!p3.some((x) => x.type === 'fusionner'), 'deux fiches Vinted identiques (deux exemplaires) : aucune fusion, le concurrent compte');
  // rien en commun : rien
  ok(plan(d([imp, fiche(24, 'Robe Weill neuve', P('rob', 500))], [lbc], ['24'])).length === 0, 'une fiche Vinted sans rapport : aucun geste');
}

if (process.argv.includes('--prod')) {
  console.log('5. La base, en lecture seule');
  const q = (sql) => {
    const f = path.join(os.tmpdir(), `aucune-fiche-v3-${process.pid}-${Date.now()}.sql`); fs.writeFileSync(f, sql);
    try { const out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: racine, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }); return JSON.parse(out.slice(out.indexOf('{'))).rows; }
    finally { fs.rmSync(f, { force: true }); }
  };
  const [r] = q(`SELECT
    (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.inventaire'::regclass AND tgname IN ('inventaire_releve_par_decision', 'inventaire_releve_par_decision_maj') AND tgenabled <> 'D') garde,
    (SELECT count(*) FROM inventaire i WHERE i.origine LIKE 'releve\\_%' AND i.created_at > '${APPLIQUE_LE}'
       AND NOT EXISTS (SELECT 1 FROM rapprochements r WHERE r.inventaire_id = i.id AND r.decision = 'import'
                         AND (r.detail ->> 'regle' = 'rapprochement_v3' OR r.par = 'utilisateur'))
       AND NOT EXISTS (SELECT 1 FROM inventaire_fusions f WHERE f.absorbe = i.id)) sans_decision,
    (SELECT count(*) FROM inventaire v JOIN rapprochement_comptes c ON c.user_id = v.user_id
      WHERE v.origine = 'vinted_sync' AND v.created_at > '${APPLIQUE_LE}' AND v.created_at < now() - interval '30 minutes'
        AND v.fusionne_dans IS NULL AND v.created_at > rapprochement_v3_vinted_depuis(v.user_id) AND c.etat = 'termine'
        AND NOT rapprochement_v3_releves_en_cours(v.user_id)
        AND EXISTS (SELECT 1 FROM inventaire r WHERE r.user_id = v.user_id AND r.origine LIKE 'releve\\_%' AND r.fusionne_dans IS NULL AND r.statut IN ('stock', 'vendu'))) vinted_non_jugees`);
  ok(Number(r.garde) === 2, 'la garde est en place en prod (deux déclencheurs actifs)');
  ok(Number(r.sans_decision) === 0, `aucune fiche de relevé née depuis le correctif sans décision v3 ou de la personne (${r.sans_decision})`);
  ok(Number(r.vinted_non_jugees) === 0, `aucune fiche Vinted d'un compte à imports restée sans jugement (${r.vinted_non_jugees})`);
}

console.log(ko ? `\n${ko} contrôle(s) en échec.` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
