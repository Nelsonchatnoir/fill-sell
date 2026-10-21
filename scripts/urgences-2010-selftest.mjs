// ═══════════════════════════════════════════════════════════════════════════
// URGENCES DU 20/10 SOIR — `npm run selftest:urgences-2010`
// ═══════════════════════════════════════════════════════════════════════════
// Rapport : docs/enquetes/urgences-2010/RAPPORT.md. Contrôles hors ligne des trois règles :
//   1. (Sébastien) un dépôt jamais vu en ligne n'est jamais « Plus en ligne — Vendue ? » : le déclencheur
//      remplace le drapeau par « pas encore visible », Vinted et la preuve « sold » hors règle, l'échec de
//      publication après la grâce (72 h Beebs, 4 h ailleurs), et l'app lit le marqueur (« Beebs vérifie ») ;
//   2. (sécurité) les trois fonctions SECURITY DEFINER vérifient auth.uid() sous une session, service_role et
//      les appels sans jeton inchangés ;
//   3. (Louis) la fiche JUMELLE d'un compte relié occupe la plateforme d'une boutique PARTAGÉE : refus de
//      publication et de relance côté serveur, plateforme occupée dans le lot, le stepper et les filtres, logo
//      atténué sur la carte — et RIEN ne change pour un article sans copie jumelle.
// Les essais en base (ROLLBACK) : scripts/essais/20261020200000_essai.sql, 20261020220000_essai.sql,
// 20261020_reparations_essai.sql.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const importer = (f) => import(pathToFileURL(join(RACINE, f)).href);
let ko = 0, ok = 0;
const verifier = (c, quoi, detail = '') => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };

// ── 1. Jamais vue en ligne ─────────────────────────────────────────────────
console.log('1. Un dépôt jamais vu en ligne n\'est jamais « vendue ? » (migration 20261020220000)');
const mC = lire('supabase/migrations/20261020220000_jamais_vue_en_ligne_jamais_vendue.sql');
verifier(/create trigger cross_post_jobs_vue_ou_pas_encore_visible\s+before update of platform_fields, last_checked_at, vu_en_ligne_le/.test(mC), 'déclencheur BEFORE UPDATE sur platform_fields / last_checked_at / vu_en_ligne_le');
verifier(/for each row when \(new\.platform <> 'vinted'/.test(mC), 'Vinted hors règle (sa preuve est le dressing)');
verifier(/coalesce\(new\.platform_fields ->> 'sale_signal', 'unavailable'\) = 'unavailable'/.test(mC), 'une preuve « sold » n\'est jamais touchée');
verifier(/not \(coalesce\(old\.platform_fields, '\{\}'::jsonb\) \? 'unavailable_since'\)/.test(mC), 'seul un drapeau NEUF est remplacé (une question déjà ouverte ne bouge pas)');
verifier(/'cross_post_jobs_vu_en_ligne'|« vu_ » avant « vue_ »/.test(mC) && 'cross_post_jobs_vue_ou_pas_encore_visible' > 'cross_post_jobs_vu_en_ligne', 'nommé pour passer après cross_post_jobs_vu_en_ligne (ordre alphabétique)');
verifier(/statut_plateforme in \('en_ligne', 'vendue'\)/.test(mC) && /p_vu_en_ligne is null and not exists/.test(mC), '« vue en ligne » = la veille OU un relevé (en ligne / vendue)');
verifier(/fillsell\.restauration/.test(mC), 'porte de restauration pour les inverses');
verifier(/WHEN p_platform = 'beebs' THEN interval '72 hours' ELSE interval '4 hours'/.test(mC), 'grâce : 72 h Beebs, 4 h ailleurs');
verifier(/now\(\) - interval '14 days'/.test(mC) && /LIMIT 25 FOR UPDATE OF c SKIP LOCKED/.test(mC), 'nouvelle boucle bornée (14 jours, 25 par relevé)');
verifier(/IF p_platform <> 'vinted' THEN\n    v_grace/.test(mC), 'nouvelle boucle jamais pour Vinted');
const iRet = mC.indexOf("RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', p_platform,\n                            'refusees', n_refusees + n_jamais_vues");
verifier(iRet > mC.indexOf('UN DÉPÔT JAMAIS VU EN LIGNE N\'EST JAMAIS UNE VENTE — AUSSI QUAND IL A UN LIEN') && iRet > 0, 'la nouvelle boucle est AVANT le retour final (jamais du code mort)');
verifier(!/RETURN jsonb_build_object\('ok', true, 'run_id', p_run_id, 'platform', p_platform,\n\s+'refusees', n_refusees, 'en_ligne'/.test(mC), 'l\'ancien retour final a disparu');
verifier(!/v_jumelle\b/.test(mC), 'aucune variable record lue sans être assignée (v_jum_id texte)');
verifier(/'refus_moderation_probable'/.test(mC) && /refund_publish_unconfirmed\(j\.id\)/.test(mC), 'échec de publication = motif + publication rendue, jamais une vente');
const st = lire('src/tabs/StockTab.jsx');
verifier(/const enVerificationPlateforme = \(job\) => !!job && \(!job\.listing_url \|\| !!job\.platform_fields\?\.pas_encore_visible\);/.test(st), 'app : « Beebs vérifie ton annonce » aussi pour le marqueur pas_encore_visible');

// ── 2. Sécurité ────────────────────────────────────────────────────────────
console.log('2. Les trois fonctions SECURITY DEFINER vérifient l\'identité (migration 20261020200000)');
const mA = lire('supabase/migrations/20261020200000_securite_2010_controle_identite.sql');
const corps = (nom) => { const i = mA.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`); return i < 0 ? '' : mA.slice(i, mA.indexOf('$function$;', i)); };
for (const nom of ['spend_coins_for_generate', 'spend_coins_for_lens', 'fiche_completer_photos_capture']) {
  const c = corps(nom);
  verifier(c && /SECURITY DEFINER/.test(c) && /IF auth\.role\(\) IS NOT NULL AND auth\.role\(\) <> 'service_role' THEN/.test(c) && /ERRCODE = '42501'/.test(c), `${nom} : garde sous session, 42501`);
}
verifier(/p_user_id IS DISTINCT FROM auth\.uid\(\)/.test(corps('spend_coins_for_generate')) && /i\.id = p_inventaire_id AND i\.user_id = auth\.uid\(\)/.test(corps('spend_coins_for_generate')), 'generate : l\'utilisateur ET la fiche');
verifier(/i\.id = p_inventaire AND i\.user_id = auth\.uid\(\)/.test(corps('fiche_completer_photos_capture')), 'photos : la fiche');
verifier(!/\b(revoke|grant)\b/i.test(mA.replace(/--.*$/gm, '')), 'droits inchangés (aucun GRANT/REVOKE : CREATE OR REPLACE les garde)');
const appelants = ['src', 'chrome-extension'].map((d) => d);
verifier(!/rpc\(\s*['"](spend_coins_for_generate|spend_coins_for_lens|fiche_completer_photos_capture)['"]/.test(lire('src/App.jsx') + lire('src/components/ListingPreviewScreen.jsx') + lire('chrome-extension/background.js')), 'aucun appel direct depuis l\'app ni l\'extension', appelants.join(','));
verifier(/adminClient\s*\.rpc\("spend_coins_for_generate"/.test(lire('supabase/functions/generate-listing/index.ts')), 'generate-listing appelle par le client service_role');
verifier(/adminClient\.rpc\("spend_coins_for_lens"/.test(lire('supabase/functions/lens-analysis/index.ts')), 'lens-analysis appelle par le client service_role');

// ── 3. Comptes reliés, boutique partagée ───────────────────────────────────
console.log('3. La fiche jumelle d\'un compte relié occupe la plateforme (migration 20261020210000)');
const mB = lire('supabase/migrations/20261020210000_comptes_relies_boutique_partagee.sql');
verifier(/coalesce\(p_platform, ''\) not in \('', 'vinted'\)/.test(mB) && /e\.motif = 'compte_relie:' \|\| p_platform/.test(mB), 'boutique partagée prouvée par le relevé, jamais Vinted');
verifier(/'compte_relie', v_conflits_relie/.test(mB) && mB.indexOf('v_conflits_relie IS NOT NULL') < mB.indexOf("SELECT value INTO v_price_photo"), 'spend_coins_and_publish refuse AVANT tout débit, compte_relie nommé');
verifier(/WHERE f\.fiche_a = NULLIF\(j->>'inventaire_id',''\)::bigint OR f\.fiche_b = NULLIF\(j->>'inventaire_id',''\)::bigint\)/.test(mB), 'sans fiche jumelle : un seul test d\'index');
verifier(/create trigger cross_post_jobs_refus_relance_jumelle_en_ligne\s+before update of status/.test(mB) && /using errcode = 'check_violation'/.test(mB), 'relance refusée (déclencheur, check_violation)');
verifier(/where auth\.uid\(\) is not null/.test(mB) && /grant execute on function public\.copies_fiches_jumelles\(\) to authenticated, service_role/.test(mB), 'copies_fiches_jumelles : auth.uid(), authenticated');
verifier(/revoke all on function public\.jumelle_occupe_plateformes\(uuid, bigint\) from public, anon, authenticated/.test(mB), 'jumelle_occupe_plateformes jamais exposée');

const { indexCopiesJumelles, avecCopiesJumelles, plateformesJumelles } = await importer('src/utils/copiesJumelles.js');
const idx = indexCopiesJumelles([
  { inventaire_id: 12, platform: 'leboncoin', listing_id: '3092775287', url: 'https://www.leboncoin.fr/ad/livres/3092775287', statut: 'en_ligne' },
  { inventaire_id: 12, platform: 'leboncoin', listing_id: 'x', url: null, statut: 'published' },
  { inventaire_id: 13, platform: 'vinted', listing_id: '1', url: null, statut: 'en_ligne' },
  null, { inventaire_id: null, platform: 'beebs' },
]);
verifier(idx.size === 2 && idx.get('12').length === 1, 'index : une copie par plateforme et par fiche');
const sans = { id: 99, title: 'Sans jumelle' };
verifier(avecCopiesJumelles(sans, idx) === sans && avecCopiesJumelles(sans, new Map()) === sans && avecCopiesJumelles(sans, null) === sans, 'article sans copie : le MÊME objet (rien ne change)');
const avec = avecCopiesJumelles({ id: 12, title: 'Avec' }, idx);
verifier(JSON.stringify(plateformesJumelles(avec)) === '["leboncoin"]', 'plateformes occupées par la jumelle');
verifier(plateformesJumelles(avecCopiesJumelles({ id: 13 }, idx)).length === 0, 'Vinted jamais (une boutique Vinted = un compte)');
verifier(plateformesJumelles(null).length === 0 && plateformesJumelles({}).length === 0, 'sans données : rien');

const { plateformesOccupees, plateformesLibres } = await importer('src/publication/lot/regles.js');
const jobsVides = [];
verifier(plateformesOccupees(avec, jobsVides).has('leboncoin'), 'lot : leboncoin occupée par la jumelle');
verifier(!plateformesLibres(avec, jobsVides, ['vinted', 'leboncoin', 'beebs']).includes('leboncoin'), 'lot : leboncoin jamais proposée');
const jobsPub = [{ id: 'a', platform: 'beebs', action: 'publish', status: 'published', published_at: '2026-10-20T07:00:00Z', created_at: '2026-10-20T07:00:00Z', listing_url: 'https://www.beebs.app/fr/p/34201103' }];
verifier(JSON.stringify([...plateformesOccupees({ id: 1 }, jobsPub)].sort()) === JSON.stringify([...plateformesOccupees({ id: 1, copies_jumelles: [] }, jobsPub)].sort()), 'lot : article sans copie, occupation identique');

const { messageRefusPublication } = await importer('src/utils/etatsPublication.js');
const m = messageRefusPublication(['leboncoin'], { compteRelie: new Set(['leboncoin']), lang: 'fr' });
verifier(/Leboncoin : déjà en ligne pour cet article via ton compte FillSell relié — rien à refaire\./.test(m), 'refus serveur : la phrase du compte relié', m);
verifier(messageRefusPublication(['leboncoin'], { lang: 'fr' }) === messageRefusPublication(['leboncoin'], { compteRelie: new Set(), lang: 'fr' }), 'refus serveur : sans compte relié, phrase identique');

const pa = lire('src/publication/lot/propsArticle.js');
verifier(/plateformesCompteRelie: plateformesJumelles\(item\),/.test(pa), 'stepper : la prop plateformesCompteRelie');
const lps = lire('src/components/ListingPreviewScreen.jsx');
verifier(/const lockedSet = useMemo\(\(\) => new Set\(\[\.\.\.publishedSet, \.\.\.queuedSet, \.\.\.attenteSet, \.\.\.compteRelieSet\]\)/.test(lps), 'stepper : verrou');
verifier(/compteRelie: new Set\(compteRelieServeur\)/.test(lps) && /pubRes\.compte_relie/.test(lps), 'stepper : refus serveur nommé');
verifier(/for \(const p of plateformesJumelles\(item\)\) if \(!occupees\.includes\(p\)\) occupees\.push\(p\);/.test(lire('src/utils/stockFiltres.js')), 'filtres : « Pas encore » ne propose pas la plateforme occupée');
verifier(/const logosJumelles=plateformesJumelles\(item\)\.filter\(p=>!logosEnLigne\.includes\(p\)\);/.test(st)
  && /const aPublier=plateformesCompte\.filter\(p=>!logosEnLigne\.includes\(p\)&&!logosJumelles\.includes\(p\)\);/.test(st)
  && /for \(const p of d\.logosJumelles \?\? \[\]\) etats\[p\] = \{ attenue: true, desature: false \};/.test(st), 'carte : logo atténué, jamais à « Publier »');
const app = lire('src/App.jsx');
verifier(/supabase\.rpc\('copies_fiches_jumelles'\)\.then\(\(r\)=>r,\(\)=>\(\{data:null,error:true\}\)\)/.test(app) && /\.map\(mapItem\)\.map\(it=>avecCopiesJumelles\(it,jumelles\)\)/.test(app), 'app : lecture best-effort avec l\'inventaire');

console.log(`\n${ok} vert(s), ${ko} rouge(s)`);
process.exit(ko ? 1 : 0);
