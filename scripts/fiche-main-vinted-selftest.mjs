// ═══════════════════════════════════════════════════════════════════════════
// FICHE CRÉÉE À LA MAIN FACE À UNE FICHE VINTED (08/10/2026 soir, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Même règle que pour les imports » : photo ET titre concordants, sans
// concurrent → fusion automatique (la fiche de la personne gardée) ; un doute
// → « à vérifier », hors du stock ; jamais la photo seule, jamais le titre
// seul ; les décisions de la personne restent définitives.
// Ce test ÉCHOUE si :
//   · le moteur fusionne sur la photo seule, sur le titre seul, malgré un
//     concurrent, malgré un refus de la personne ou une fusion qu'elle a
//     défaite, deux fiches Vinted entre elles, ou un article vendu ;
//   · il garde la fiche Vinted au lieu de celle de la personne ;
//   · la règle change une seule décision des annonces (sous-graphe à part) ;
//   · elle s'allume sans que la lecture de la base le dise ;
//   · la migration perd une de ses gardes, ou la fonction edge ne date pas le
//     jugement des fiches à la main ;
//   · avec --prod (après l'application) : une fusion de la règle a fondu une
//     fiche que la personne avait touchée, ou gardé la fiche Vinted.
//
//   npm run selftest:fiche-main-vinted
//   node scripts/fiche-main-vinted-selftest.mjs --prod
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
const MIGRATION = 'supabase/migrations/20261008150000_fiche_a_la_main_face_a_vinted.sql';
const corpsFonction = (sql, nom) => {
  const i = sql.indexOf(`FUNCTION public.${nom}(`); if (i < 0) return null;
  const j = sql.indexOf('$function$', i); const k = sql.indexOf('$function$', j + 10);
  return j < 0 || k < 0 ? null : sql.slice(i, k);
};

// ── des empreintes fabriquées : même graine = même photo ; flips = photo voisine
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
const P = (nom, g, flips = 0) => [photo(`${nom}1`, g, flips), photo(`${nom}2`, g + 1, flips), photo(`${nom}3`, g + 2, flips)];
// une fiche à la main (origine vide, aucune annonce Vinted) / une fiche du dressing
const main = (id, titre, photos, o = {}) => ({ id: String(id), titre, prix: o.prix ?? 20, statut: o.statut ?? 'stock', origine: null, marque: null, taille: o.taille ?? null,
  photos, a_verifier: false, a_verifier_auto: false, created_at: o.le ?? '2026-10-01T10:00:00Z', quantite: o.quantite ?? 1, vinted_item_id: null });
const vin = (id, titre, photos, o = {}) => ({ id: String(id), titre, prix: o.prix ?? 20, statut: o.statut ?? 'stock', origine: 'vinted_sync', marque: null, taille: o.taille ?? null,
  photos, a_verifier: false, a_verifier_auto: false, created_at: o.le ?? '2026-10-08T10:00:00Z', quantite: 1, vinted_item_id: String(900000 + Number(id)) });
const annonce = (id, platform, titre, photos, o = {}) => ({ id: String(id), platform, listing_id: String(id), url: `https://${platform}.test/${id}`, titre, prix: 20, photo_url: photos[0], photos,
  taille: o.taille ?? null, marque: null, inventaire_id: o.inventaire_id ?? null, ignoree: false, ignoree_par_utilisateur: false, proposition_motif: null,
  source: o.source ?? 'automatique', run_id: 'r1', en_ligne: true, hors_liste: false, ebay_bloque: false, geste: true, derniere_par: o.derniere_par ?? 'auto', derniere_decision: 'import' });
const d = (fiches, o = {}) => ({ fiches, annonces: o.annonces ?? [], fusions: o.fusions ?? [], doublons: o.doublons ?? [], dette_beebs: false, import_ouvert: true, geste_recent: true,
  fiches_main_actif: o.actif ?? true, fiches_main_a_juger: o.mainAJuger ?? [], vinted_a_juger: o.vintedAJuger ?? [] });
const plan = (x, portee = 'nouvelles') => passe(x, E, { mode: 'normal', fichesMain: portee }).decisions;
const regle = (ds) => ds.filter((x) => x.type === 'fusionner_fiche' || x.type === 'fiche_a_verifier');
const fusion = (ds) => ds.find((x) => x.type === 'fusionner_fiche');
const question = (ds) => regle(ds).filter((x) => x.type === 'fiche_a_verifier');

console.log('1. Le moteur : photo ET titre, sans concurrent → fusion ; la fiche de la personne gardée');
{
  const H = main(1, 'Robe Sézane Lou fleurie taille 38', P('sez', 100), { taille: '38' });
  const V = vin(2, 'Robe Sézane modèle Lou à fleurs 38', P('sez', 100), { taille: '38' });
  const f = fusion(plan(d([H, V], { vintedAJuger: ['2'] })));
  ok(f && f.garde === '1' && f.absorbe === '2', 'fiche Vinted nouvelle, même photo, même titre : elle se fond dans la fiche à la main (gardée)');
  ok(f?.preuve?.regle === 'rapprochement_v3' && f?.preuve?.portee === 'fiche_main', 'la décision porte sa règle (rapprochement_v3, fiche_main)');
  const f2 = fusion(plan(d([H, V], { mainAJuger: ['1'] })));
  ok(f2 && f2.garde === '1' && f2.absorbe === '2', 'fiche à la main nouvelle face à une fiche Vinted d\'avant : même fusion, même sens');
  ok(regle(plan(d([H, V], {}))).length === 0, 'rien de nouveau à juger : rien (une passe normale ne rejuge pas le stock)');
  ok(fusion(plan(d([H, V], {}), 'toutes'))?.garde === '1', 'portée « toutes » (rattrapage du stock existant) : la paire d\'avant est jugée');
  ok(regle(plan(d([H, V], { actif: false, vintedAJuger: ['2'] }))).length === 0, 'règle éteinte tant que la lecture de la base ne l\'allume pas (fiches_main_actif)');
}

console.log('2. Jamais la photo seule, jamais le titre seul : la question, hors du stock');
{
  const H = main(1, 'Robe Sézane Lou fleurie taille 38', P('sez', 100), { taille: '38' });
  const etr = vin(3, 'Lot de 3 bodies bébé 6 mois', P('sez', 100));
  const q1 = question(plan(d([H, etr], { vintedAJuger: ['3'] })));
  ok(!fusion(plan(d([H, etr], { vintedAJuger: ['3'] }))) && q1.length === 1 && q1[0].garde === '1' && q1[0].absorbe === '3',
    'même photo, titre étranger : la question (gardée = la fiche de la personne), jamais une fusion');
  const t = vin(4, 'Robe Sézane Lou fleurie taille 38', P('aut', 700), { taille: '38' });
  const q2 = plan(d([H, t], { vintedAJuger: ['4'] }));
  ok(!fusion(q2) && question(q2).length === 1 && question(q2)[0].motif === 'titre_sans_photo', 'même titre, aucune photo commune : la question, jamais une fusion');
  // une seule photo voisine (10 bits), les autres étrangères (trois à ≤ 12 vaudraient « même photo »)
  // (titre identique : la paire est candidate par l'index des titres ; les 10 bits
  // fabriqués ici touchent toutes les tranches de l'index des photos)
  const proche = vin(5, 'Robe Sézane Lou fleurie taille 38', [photo('sezp1', 100, 10), photo('autp2', 810), photo('autp3', 820)], { taille: '38' });
  const q3 = plan(d([H, proche], { vintedAJuger: ['5'] }));
  ok(!fusion(q3) && question(q3).length === 1, 'photo seulement proche, même titre : la question');
  const taille = vin(6, 'Robe Sézane modèle Lou à fleurs 42', P('sez', 100), { taille: '42' });
  const q4 = plan(d([H, taille], { vintedAJuger: ['6'] }));
  ok(!fusion(q4) && question(q4).length === 1 && /taille/.test(question(q4)[0].motif), 'même photo, tailles contradictoires (38 / 42) : la question');
  const rien = vin(7, 'Lampe de chevet laiton', P('lam', 400));
  ok(regle(plan(d([H, rien], { vintedAJuger: ['7'] }))).length === 0, 'aucun rapport : aucun geste');
}

console.log('3. Un concurrent : jamais de fusion');
{
  const H = main(1, 'Robe Sézane Lou fleurie taille 38', P('sez', 100), { taille: '38' });
  const V1 = vin(2, 'Robe Sézane modèle Lou à fleurs 38', P('sez', 100), { taille: '38' });
  const V2 = vin(3, 'Robe Sézane Lou fleurie 38', P('sez', 100, 1), { taille: '38', le: '2026-09-01T10:00:00Z' });
  const p1 = plan(d([H, V1, V2], { vintedAJuger: ['2'] }));
  ok(!fusion(p1) && question(p1).some((x) => x.absorbe === '2'), 'deux fiches Vinted sur la même photo (deux exemplaires) : la question, aucune fusion');
  const pt = plan(d([H, V1, V2], {}), 'toutes');
  ok(!fusion(pt) && question(pt).length === 1 && question(pt)[0].preuves?.candidats_total === 2,
    'rattrapage : UNE question par fiche à la main (son meilleur candidat, 2 candidats notés) — jamais une fiche Vinted sortie du stock par candidat');
  const H2 = main(8, 'Robe Sézane Lou fleurie 38', P('sez', 100, 1), { taille: '38' });
  const p2 = plan(d([H, H2, V1], { vintedAJuger: ['2'] }));
  ok(!fusion(p2) && question(p2).length === 1, 'deux fiches à la main sur la même photo : une question, aucune fusion');
  const Vbis = { ...vin(9, 'Robe Sézane Lou fleurie taille 38', P('sez', 100)), origine: null, vinted_item_id: '123' };
  ok(regle(plan(d([V1, Vbis], { vintedAJuger: ['2'] }))).length === 0, 'deux fiches Vinted (dressing, dépôt FillSell) ne se fondent jamais entre elles');
}

console.log('4. Les décisions de la personne restent définitives ; un article vendu n\'est pas touché');
{
  const H = main(1, 'Robe Sézane Lou fleurie taille 38', P('sez', 100), { taille: '38' });
  const V = vin(2, 'Robe Sézane modèle Lou à fleurs 38', P('sez', 100), { taille: '38' });
  const refus = [{ id: 'q1', garde: '1', absorbe: '2', statut: 'refusee', decide_par: 'utilisateur', motif: 'photo_identique', source: 'releve', auto: false }];
  ok(regle(plan(d([H, V], { vintedAJuger: ['2'], doublons: refus }))).length === 0, '« Non » de la personne : ni fusion, ni question, jamais');
  ok(regle(plan(d([H, V], { vintedAJuger: ['2'], fusions: [{ garde: '1', absorbe: '2', par: 'utilisateur', defaite: true }] }))).length === 0,
    'une fusion qu\'elle a défaite : jamais refaite');
  ok(regle(plan(d([H, { ...V, statut: 'vendu' }], { vintedAJuger: ['2'] }))).length === 0, 'fiche Vinted vendue : rien');
  ok(regle(plan(d([{ ...H, statut: 'vendu' }, V], { vintedAJuger: ['2'] }))).length === 0, 'fiche à la main vendue : rien');
  const q = plan(d([{ ...H, quantite: 3 }, V], { vintedAJuger: ['2'] }));
  ok(!fusion(q) && question(q).length === 1, 'plusieurs exemplaires sur la fiche à la main : la question, pas la fusion');
}

console.log('5. Les décisions des annonces ne bougent pas d\'un iota');
{
  const H = main(1, 'Robe Sézane Lou fleurie taille 38', P('sez', 100), { taille: '38' });
  const V = vin(2, 'Robe Sézane modèle Lou à fleurs 38', P('sez', 100), { taille: '38' });
  // a1 : la robe sur Leboncoin (même photo) ; a2 : une lampe Beebs (rien ailleurs) ;
  // a3 : un pull déjà importé (fiche 10), sans rapport
  const imp = { ...main(10, 'Pull marin Saint James rayé', P('pul', 300)), origine: 'releve_leboncoin' };
  const a1 = annonce('a1', 'leboncoin', 'Robe Sézane Lou fleurie 38', P('lbc', 100, 2));
  const a2 = annonce('a2', 'beebs', 'Lampe de chevet laiton', P('lam', 400));
  const a3 = annonce('a3', 'leboncoin', 'Pull marin Saint James rayé', P('pul', 300), { inventaire_id: '10' });
  const donnees = d([H, V, imp], { annonces: [a1, a2, a3], vintedAJuger: ['2'] });
  const avec = plan(donnees);
  const sans = passe({ ...donnees, fiches_main_actif: false }, E, { mode: 'normal' }).decisions;
  ok(JSON.stringify(avec.filter((x) => !regle([x]).length)) === JSON.stringify(sans), 'règle allumée ou éteinte : les mêmes décisions d\'annonces, dans le même ordre');
  const ia = avec.findIndex((x) => x.type === 'attacher'), iff = avec.findIndex((x) => x.type === 'fusionner_fiche'), ic = avec.findIndex((x) => x.type === 'creer');
  ok(iff >= 0 && ia >= 0 && ia < iff && (ic < 0 || ic > iff),
    'ordre : les rattachements à la fiche Vinted d\'abord, sa fusion ensuite (elle les emporte), les créations après');
}

console.log('6. La migration : les gardes de la base');
{
  const sql = lire(MIGRATION);
  const g = corpsFonction(sql, 'rapprochement_v3_fiches_fusionnables') ?? '';
  ok(/q\.decide_par = 'utilisateur'[\s\S]{0,300}f\.defait_le IS NOT NULL[\s\S]{0,200}RETURN 'paire_tranchee'/.test(g), 'une paire tranchée par la personne (réponse, fusion défaite) : plus rien');
  ok(/h\.vinted_item_id IS NOT NULL OR COALESCE\(h\.origine, ''\) = 'vinted_sync' OR COALESCE\(h\.origine, ''\) LIKE 'releve\\_%'/.test(g), 'la gardée est une fiche à la main (sans annonce Vinted, ni relevé)');
  ok(/RETURN 'main_pas_en_stock'/.test(g) && /RETURN 'vinted_pas_en_stock'/.test(g) && /RETURN 'vinted_disparue'/.test(g), 'un article vendu ou retiré n\'est ni fondu ni questionné');
  ok(/RETURN 'quantite'/.test(g) && /RETURN 'job_en_vol'/.test(g) && /RETURN 'vinted_touchee'/.test(g) && /RETURN 'deux_exemplaires'/.test(g),
    'plusieurs exemplaires, publication en vol, fiche Vinted touchée, deux annonces d\'une plateforme : la question');
  ok(/v\.prix_achat IS NOT NULL[\s\S]{0,400}FROM ventes x[\s\S]{0,700}e\.value ->> 'source' = 'manuel'/.test(g), '« touchée » : prix d\'achat, prix ou poids changés dans l\'app, vente, fiche d\'annonce, champ saisi');
  const ap = corpsFonction(sql, 'rapprochement_v3_appliquer') ?? '';
  ok(/inventaire_fusionner_pour\(p_user, v_fa, v_fb, 'utilisateur:photo_rapprochement_v3_main'\)/.test(ap), 'la fusion garde la fiche à la main (v_fa), fond la fiche Vinted (v_fb), journalisée');
  ok(/v_type = 'fusionner_fiche' AND v_motif IS NULL/.test(ap), 'fusion seulement quand AUCUNE garde ne s\'y oppose');
  ok(/releve_poser_question\(p_user, v_fa, v_fb[\s\S]{0,900}rapprochement_v3_marquer\(p_user, v_fb,/.test(ap), 'sinon la question, et la fiche Vinted hors du stock (jamais celle de la personne)');
  ok(/'portee', 'fiche_main'/.test(ap) && /'regle', 'rapprochement_v3'/.test(ap), 'chaque geste porte sa règle et sa portée');
  const l = corpsFonction(sql, 'rapprochement_v3_lire') ?? '';
  ok(/'fiches_main_actif', true/.test(l) && /'fiches_main_a_juger', v_main/.test(l) && /LIMIT 200/.test(l), 'la lecture allume la règle et rend les fiches à la main à juger (200 par passe)');
  const fr = corpsFonction(sql, 'rapprochement_fin_run') ?? '';
  ok(/rapprochement_v3_fiches_main_depuis\(NEW\.user_id\)/.test(fr), 'la fin d\'un relevé réveille la passe pour des fiches à la main à juger');
  ok(/REVOKE ALL ON FUNCTION public\.rapprochement_v3_fiches_fusionnables[^;]*FROM PUBLIC, anon, authenticated/.test(sql), 'fonctions fermées à anon / authenticated');
  const e = corpsFonction(sql, 'inventaire_ecarte_import_sync') ?? '';
  ok(/if TG_OP = 'UPDATE' and new\.vinted_item_id is null then\s*return new;\s*end if;/.test(e),
    'garde de boutique : une fiche qui lâche son annonce Vinted (fusion) passe — 0 fusion de ce genre depuis le 28/09 sans ça');
  ok(/if not boutique_vinted_confirmee\(new\.user_id,new\.vinted_account_id\) then\s*raise exception '\[boutique_a_confirmer\]/.test(e)
    && e.indexOf("new.vinted_item_id is null") < e.indexOf('boutique_vinted_confirmee'), '… et tout import reste gardé comme avant (la boutique confirmée)');
  ok(!/INSERT INTO rapprochements[^;]*'fiche_main'/.test(ap), 'aucune ligne de rapprochement sans annonce (le journal est celui des fusions)');
  ok(fs.existsSync(path.join(racine, 'supabase/rollbacks/20261008150000_fiche_a_la_main_face_a_vinted_INVERSE.sql')), 'l\'inverse est prêt');
  ok(/if coalesce\(new\.origine,''\) <> 'vinted_sync' then\s*return new;\s*end if;\s*-- Le contrôle précède/.test(lire('supabase/rollbacks/20261008150000_fiche_a_la_main_face_a_vinted_INVERSE.sql')),
    'l\'inverse rend la garde de boutique telle qu\'elle est en prod');
}

console.log('7. La fonction edge date le jugement des fiches à la main');
{
  const ts = lire('supabase/functions/rapprochement/index.ts');
  ok(/donnees\.fiches_main_juge_jusqu_a \? \{ fiches_main_juge_le: donnees\.fiches_main_juge_jusqu_a \}/.test(ts), 'fiches_main_juge_le posé après une passe finie, sans erreur');
  ok(/fichesMain: porteeMain/.test(ts) || /fichesMain:/.test(ts), 'la portée passe au moteur');
}

if (process.argv.includes('--prod')) {
  console.log('8. La base, en lecture seule');
  const q = (sql) => {
    const f = path.join(os.tmpdir(), `fiche-main-${process.pid}-${Date.now()}.sql`); fs.writeFileSync(f, sql);
    try { const out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: racine, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }); return JSON.parse(out.slice(out.indexOf('{'))).rows; }
    finally { fs.rmSync(f, { force: true }); }
  };
  const [r] = q(`SELECT
    (SELECT count(*) FROM pg_proc WHERE proname = 'rapprochement_v3_fiches_fusionnables') garde,
    (SELECT count(*) FROM inventaire_fusions f JOIN inventaire g ON g.id = f.garde
      WHERE f.par = 'utilisateur:photo_rapprochement_v3_main' AND (g.vinted_item_id IS NOT NULL AND (f.champs_repris -> 'vinted_identite') IS NULL)) gardee_vinted,
    (SELECT count(*) FROM inventaire_fusions f JOIN inventaire a ON a.id = f.absorbe
      WHERE f.par = 'utilisateur:photo_rapprochement_v3_main' AND (a.prix_achat IS NOT NULL OR a.prix_vente_change_par = 'app')) fondue_touchee`);
  if (Number(r.garde) === 0) console.log('  · migration 20261008150000 pas encore appliquée : rien à relire');
  else {
    ok(Number(r.gardee_vinted) === 0, `aucune fusion de la règle n'a gardé une fiche Vinted d'origine (${r.gardee_vinted})`);
    ok(Number(r.fondue_touchee) === 0, `aucune fusion de la règle n'a fondu une fiche que la personne avait touchée (${r.fondue_touchee})`);
  }
}

console.log(ko ? `\n${ko} contrôle(s) en échec.` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
