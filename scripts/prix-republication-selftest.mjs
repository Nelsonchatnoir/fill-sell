// VERROU (15/11/2026, point 5 de Nico — nino57270, 7153db13) — UNE REPUBLICATION N'IGNORE JAMAIS UN PRIX CHANGÉ DANS LA
// FICHE ; « AUTRE PRIX » À LA REPUBLICATION.
//   node --import ./scripts/loader-ext.mjs scripts/prix-republication-selftest.mjs   (npm run selftest:prix-republication)
//
// Cas : fiche « Calandre Audi A7 » passée de 225 à 200 € dans l'app le 15/11 à 13:22:04 ; republiée sur Leboncoin à
// 13:22:50 → repartie à 225 € (republish_snapshot.prix = prix de la tâche source). Même chose le 14/11 (299 → 250 €).
// spend_coins_and_republish ne lisait jamais le prix de la fiche ; la feuille de republication n'offrait que « Garder »,
// −5/−10/−15 % (et un champ pour Vinted seul). Rapport : docs/enquetes/lot-1511-5-prix-republication/RAPPORT.md.
//
// Ce verrou casse si :
//   1. la règle serveur (migration 20261115180000, public.prix_de_republication) ne prend plus le prix de la fiche changé
//      PAR LA PERSONNE après la mise en ligne, n'applique plus la baisse sur ce prix-là, ou si spend_coins_and_republish
//      (toutes voies : bouton, lot, automatique, planifiée) ne passe plus par elle ;
//   2. l'app ne propose plus « Autre prix » pour un article (et jamais en lot), ne contrôle plus le prix saisi (jamais 0,
//      jamais un texte), n'écrit plus le prix saisi dans la fiche, ou renvoie une baisse en prix calculé au lieu du % ;
//   3. les républications automatiques et planifiées se mettent à poser leur propre prix ;
//   4. le banc sur base jetable (scripts/essais/20261115180000_banc.mjs) n'est plus inscrit.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = process.env.VERROU_RACINE ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => { try { return readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const importer = async (f) => { try { return await import(pathToFileURL(path.join(racine, f)).href); } catch { return {}; } };
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

console.log('1. La règle serveur');
const mig = lire('supabase/migrations/20261115180000_republication_prix_de_la_fiche.sql');
ok(/IF v_change_par = 'app' AND v_fiche_prix >= 1 AND \(v_pub_le IS NULL OR v_change_le > v_pub_le\) THEN\s+v_fiche := v_fiche_prix;/.test(mig),
  'le prix de la fiche compte s\'il a été changé PAR LA PERSONNE (app) APRÈS la mise en ligne de l\'annonce');
ok(/v_base := COALESCE\(v_fiche, v_annonce\);/.test(mig) && /v_prix := greatest\(2, floor\(v_base \* \(100 - p_baisse_pct\) \/ 100\)\)/.test(mig),
  'la baisse s\'applique sur ce prix-là (fiche changée, sinon annonce), plancher 2 €');
ok(/IF p_prix_republication IS NOT NULL THEN\s+v_prix := p_prix_republication; v_raison := 'prix_choisi';/.test(mig), 'un prix choisi gagne');
ok(/ELSIF v_fiche IS NOT NULL THEN\s+v_prix := v_fiche; v_raison := 'prix_de_la_fiche';/.test(mig), 'sans choix : le prix de la fiche changée, sinon rien (le prix de l\'annonce)');
ok(/v_prix_decision := public\.prix_de_republication\(p_inventaire_id, v_platform,/.test(mig) && !/\n  v_prix := p_prix_republication;\n/.test(mig),
  'spend_coins_and_republish passe par la règle (plus de « prix choisi, sinon rien » en direct)');
ok(/p_baisse_pct < 1 OR p_baisse_pct >= 90/.test(mig) && /'invalid_price'/.test(mig), 'une baisse hors 1–89 % est refusée (jamais 0 €)');
ok(/DROP FUNCTION IF EXISTS public\.spend_coins_and_republish\(bigint, text, text, numeric, text\);/.test(mig)
  && /md5\(v\) <> 'cba15cc960b6e1a8fdb4e496020041c3'/.test(mig)
  && lire('supabase/rollbacks/20261115180000_republication_prix_de_la_fiche_INVERSE.sql').includes('p_platform text DEFAULT'),
  'garde md5 du corps de prod, une seule signature, inverse prêt');

const mig2 = lire('supabase/migrations/20261115190000_prix_republication_moment_du_prix.sql');
ok(/AND \(j\.action = 'publish'\s+OR \(j\.action = 'republish' AND \(j\.platform_fields \? 'prix_republication'/.test(mig2)
  && lire('supabase/rollbacks/20261115190000_prix_republication_moment_du_prix_INVERSE.sql').includes('prix_de_republication'),
  'la fiche se compare au moment où le prix de l\'annonce a été FIXÉ (dépôt ou republication avec prix), jamais à une republication qui l\'a recopié');

console.log('2. L\'app : « Autre prix », contrôle du prix saisi, fiche mise à jour');
const P = await importer('src/utils/prixRepublication.js');
const l = (t) => P.lirePrixSaisi?.(t) ?? { ok: null };
ok(l('139').ok === true && l('139').prix === 139 && l('139,50').prix === 139.5 && l(' 139 € ').prix === 139, 'lit « 139 », « 139,50 », « 139 € »');
ok(['', '0', '0,5', '-5', 'abc', '12a', '1,234'].every((t) => l(t).ok === false), 'refuse vide, 0, 0,50, −5, un texte, trois décimales (jamais 0 €)');
ok(/en euros/.test(P.messagePrixSaisi?.('pas_un_nombre', 'fr') ?? '') && /1 €/.test(P.messagePrixSaisi?.('trop_petit', 'fr') ?? ''), 'le refus est dit en clair');
const c = (x) => P.choixPrixRepublication?.(x) ?? {};
ok(c({ solo: true, mode: 'autre', saisie: '139' }).prix === 139 && c({ solo: true, mode: 'autre', saisie: '139' }).baissePct === null, 'un article, « Autre prix » 139 → 139 €');
ok(c({ solo: false, mode: 'autre', saisie: '139' }).erreur === 'autre_prix_en_lot', 'en lot, jamais un prix pour tous');
ok(c({ solo: false, mode: 'pct', pct: 10 }).baissePct === 10 && c({ solo: false, mode: 'pct', pct: 10 }).prix === null, 'une baisse part en POURCENTAGE (le serveur l\'applique annonce par annonce)');
ok(c({ solo: true, mode: 'garder' }).prix === null && c({ solo: true, mode: 'garder' }).baissePct === null, '« Garder » : rien (le serveur garde l\'annonce ou prend la fiche changée)');
const st = lire('src/tabs/StockTab.jsx');
const feuille = st.slice(st.indexOf('export function RepublishSheet('), st.indexOf('export function RepublishSheet(') + 30000);
ok(/\{solo && \(\s*<button data-autre-prix-pastille/.test(feuille) && /\{solo && autre && \(\s*<div data-autre-prix/.test(feuille), '« Autre prix » et son champ : pour UN article seulement');
ok(/if \(choixPrix\.erreur\) return;/.test(feuille) && /const actif = \(lotCourt \? plusAnciennes\.choisis\.length > 0 : nbEnvois\) && !choixPrix\.erreur;/.test(feuille), 'un prix saisi illisible : bouton grisé, rien ne part');
ok(!/arrondi\(prixActuel\)/.test(feuille.slice(feuille.indexOf('const confirmer'), feuille.indexOf('const chip'))), 'la confirmation n\'envoie plus de prix calculé pour une baisse');
ok(/opts\.prixSaisi && Number\(prixRepublication\) >= 1 && partis > 0\)[\s\S]{0,200}from\('inventaire'\)\s*\.update\(\{ prix_vente: Number\(prixRepublication\) \}\)/.test(st), 'le prix saisi devient le prix de la fiche (après au moins une republication partie)');
ok(/p_baisse_pct: pct/.test(lire('src/utils/republication.js')) && /p_baisse_pct: pct/.test(lire('src/utils/vintedSync.js')), 'les deux appels (Vinted et autres) envoient la baisse');

console.log('3. Les republications automatiques et planifiées n\'ont pas de prix à elles');
const sweeps = ['supabase/migrations/20261025200000_rythme_par_plateforme.sql', 'supabase/migrations/20261025180000_creneau_remplace_les_sautes.sql'].map(lire).join('\n');
ok(/spend_coins_and_republish\(v_cand\.inv_id, v_cand\.item_id, 'auto', NULL, v_pf\)/.test(sweeps), 'republish_planifiee_sweep : aucun prix (la règle du serveur s\'applique)');
ok(!/republish-auto-sweep[\s\S]{0,40}p_prix_republication: [^n]/.test(lire('supabase/functions/republish-auto-sweep/index.ts')), 'republish-auto-sweep : aucun prix posé');

console.log('4. Le banc sur base jetable est inscrit');
const pkg = JSON.parse(lire('package.json') || '{}');
ok(/scripts\/essais\/20261115180000_banc\.mjs/.test(pkg.scripts?.['selftest:prix-republication-pg'] ?? ''), 'selftest:prix-republication-pg');

console.log(`\n${ko ? '✗' : '✓'} ${n - ko} vert(s), ${ko} rouge(s) sur ${n}`);
process.exit(ko ? 1 : 0);
