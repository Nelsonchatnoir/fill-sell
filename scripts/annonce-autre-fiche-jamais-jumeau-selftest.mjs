// ═══════════════════════════════════════════════════════════════════════════
// L'ANNONCE D'UNE AUTRE FICHE N'EST JAMAIS UN « DÉJÀ EN LIGNE » (09/10 soir, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// « Rangement Noir et Blanc » (9 997 exemplaires) vendu sur Leboncoin : sa
// remise en vente retenue « jumeau_en_ligne » et sa republication refusée
// « déjà en ligne par ta fiche Rangement Noir et Jaune » — une autre fiche,
// un autre article. Le message renvoyait à une question introuvable.
// Ce test garde :
//   1. la base (migration 20261009233000) : ni spend_coins_and_publish ni
//      remises_en_vente_tick ne lisent plus une paire de fiches pour refuser ;
//      la règle « une fiche, une annonce par plateforme » reste
//      (already_published, deja_en_vente) ;
//   2. l'app : aucun refus ne renvoie à « Est-ce le même article ? » ; la
//      ressemblance côté client ne lit que les annonces rattachées à AUCUNE
//      fiche ; elle ne retient jamais une fiche à plusieurs exemplaires ;
//   3. avec --prod : les corps EN PROD (lecture seule).
//   node scripts/annonce-autre-fiche-jamais-jumeau-selftest.mjs [--prod]
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');
const sansCommentairesSql = (s) => s.replace(/--[^\n]*/g, '');
const sansCommentairesJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let ko = 0, n = 0;
const ok = (cond, nom, detail = '') => { n++; if (!cond) ko++; console.log(`  ${cond ? 'ok' : 'KO'}  ${nom}${cond ? '' : `   ← ${detail}`}`); };

console.log('1. La base (migration 20261009233000)');
const mig = sansCommentairesSql(lire('supabase/migrations/20261009233000_annonce_d_une_autre_fiche_jamais_un_jumeau.sql'));
const corps = (nom) => {
  const i = mig.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  return i < 0 ? '' : mig.slice(i, mig.indexOf('$function$;', i));
};
const pub = corps('spend_coins_and_publish');
const tick = corps('remises_en_vente_tick');
ok(pub.length > 0 && tick.length > 0, 'les deux fonctions sont redéfinies');
ok(!/jumeau|inventaire_doublons/i.test(pub), 'publication : aucune paire de fiches ne refuse plus rien');
ok(!/jumeau|inventaire_doublons/i.test(tick), 'remise en vente : aucune paire de fiches ne retient plus rien');
ok(/'reason', 'already_published'/.test(pub) && /c\.inventaire_id = NULLIF\(j->>'inventaire_id',''\)::bigint/.test(pub),
  'publication : « une fiche, une annonce par plateforme » reste (jobs de CETTE fiche)');
ok(/v_motif := 'deja_en_vente'/.test(tick) && /a\.inventaire_id = r\.inventaire_id/.test(tick),
  'remise en vente : « déjà en vente » reste (annonces de CETTE fiche)');
ok(/v_motif := 'publication_payante'/.test(tick) && /remise_en_vente_place\(r\.user_id\)/.test(tick),
  'remise en vente : le reste du tour est inchangé (payante, place)');

console.log('2. L\'app');
const etats = sansCommentairesJs(lire('src/utils/etatsPublication.js'));
ok(!/même article|same item|Mes annonces en ligne|jumeau/i.test(etats), 'aucun refus de publication ne renvoie à « Est-ce le même article ? »');
const lps = lire('src/components/ListingPreviewScreen.jsx');
ok(!/jumeauxServeur|pubRes\.jumeaux/.test(lps), 'l\'écran de publication ne lit plus de « jumeaux » du serveur');
const jel = sansCommentairesJs(lire('src/utils/jumeauxEnLigne.js'));
ok(/\.is\("inventaire_id", null\)/.test(jel) && /if \(a\.inventaire_id != null\) continue;/.test(jel),
  'ressemblance : seules les annonces rattachées à AUCUNE fiche sont lues');
ok(!/from\("cross_post_jobs"\)/.test(jel), 'ressemblance : les dépôts (toujours portés par une fiche) ne sont plus lus');
const { jumeauxQuiRetiennent, bilanArticle } = await import(pathToFileURL(path.join(racine, 'src/publication/lot/regles.js')).href);
const j = [{ platform: 'leboncoin', titre: 'Rangement Noir et Jaune' }];
ok(jumeauxQuiRetiennent({ jumeaux: j, quantiteFiche: 9997 }, ['leboncoin']).length === 0, 'lot : une fiche à 9 997 exemplaires n\'est jamais retenue');
ok(jumeauxQuiRetiennent({ jumeaux: j, quantiteFiche: 1 }, ['leboncoin']).length === 1, 'lot : une fiche à un exemplaire garde sa question, sur l\'écran du lot');
ok(!bilanArticle({ preparationAuRepos: true, price: 12, plateformesPubliables: new Set(['leboncoin']), jumeaux: j, quantiteFiche: 3 })
  .motifs.some((x) => x.cle === 'jumeau'), 'lot : aucun motif « Même article ? » à plusieurs exemplaires');

if (process.argv.includes('--prod')) {
  console.log('3. La base EN PROD (lecture seule)');
  const q = (sql) => {
    const f = path.join(os.tmpdir(), `autre-fiche-jumeau-${process.pid}-${Date.now()}.sql`); fs.writeFileSync(f, sql);
    try { const out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: racine, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }); return JSON.parse(out.slice(out.indexOf('{'))).rows; }
    finally { fs.rmSync(f, { force: true }); }
  };
  const [r] = q(`SELECT
    (SELECT count(*) FROM pg_proc WHERE proname IN ('spend_coins_and_publish', 'remises_en_vente_tick')
       AND regexp_replace(prosrc, '--[^\\n]*', '', 'g') ~* 'jumeau|inventaire_doublons') garde,
    (SELECT count(*) FROM pg_proc WHERE proname = 'spend_coins_and_publish' AND prosrc LIKE '%already_published%') une_fiche,
    (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261009233000') historique`);
  ok(Number(r.garde) === 0, 'en prod : plus aucune garde « jumeau » dans les deux fonctions');
  ok(Number(r.une_fiche) === 1, 'en prod : « une fiche, une annonce par plateforme » reste');
  ok(Number(r.historique) === 1, 'en prod : migration inscrite dans l\'historique');
}

console.log(`\nannonce-autre-fiche-jamais-jumeau : ${n - ko} contrôles verts, ${ko} rouges`);
process.exit(ko ? 1 : 0);
