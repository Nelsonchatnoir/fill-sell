// « RÉINITIALISER » CLÔT LES LIGNES DE SES FICHES ; UNE ANNONCE N'A QU'UNE LIGNE VIVANTE (08/11, ayadi007)
//   node scripts/une-ligne-vivante-par-annonce-selftest.mjs
// Cas : deux « Réinitialiser » (11:00:38, 11:26:08) laissent 455 lignes « vivantes » sans fiche (ON DELETE SET NULL) ;
// le « Synchroniser » suivant importe les mêmes annonces sur des fiches neuves : 111 Leboncoin et 104 Vinted en double.
// Gardé ici (texte des sources ; la preuve de bout en bout est scripts/preuve-ayadi-0811.mjs) : la réinitialisation
// clôt avant d'effacer, jamais un retrait / « processing » / republication engagée / ligne vendue ; la règle de clôture
// ne vise QUE des lignes sans fiche au numéro EXACT ; le déclencheur la joue à l'INSERT et à l'UPDATE d'une ligne
// rattachée ; le rattrapage passe par la même fonction, avec sauvegarde et inverse.
import fs from "node:fs";

const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const m = lire("supabase/migrations/20261108143000_une_ligne_vivante_par_annonce.sql");
const corpsDe = (nom) => { const i = m.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`); return i < 0 ? "" : m.slice(i, m.indexOf("$function$;", i)); };

console.log("1. « Réinitialiser »");
const r = corpsDe("supprimer_mon_stock_sans_retrait");
ok(r.indexOf("update public.cross_post_jobs j") > 0 && r.indexOf("update public.cross_post_jobs j") < r.indexOf("delete from public.inventaire"), "les lignes sont closes AVANT l'effacement des fiches");
ok(/perform set_config\('fillsell\.sans_retrait', '1', true\);/.test(r) && /delete from public\.ventes where user_id = auth\.uid\(\);\s*delete from public\.inventaire where user_id = auth\.uid\(\);/.test(r),
  "garde « sans retrait » et les deux DELETE de la prod, inchangés");
ok(/and coalesce\(j\.action, 'publish'\) in \('publish', 'republish'\)/.test(r), "jamais un retrait (action delete)");
ok(/j\.status in \('pending', 'needs_user'\)/.test(r) && !/'processing'/.test(r.slice(r.indexOf("update public.cross_post_jobs"))), "jamais une tâche « processing »");
ok(/coalesce\(nullif\(j\.platform_fields ->> 'republish_step', ''\), 'a_capturer'\) in \('a_capturer', 'captured'\)/.test(r), "une republication seulement avant tout retrait (« a_capturer », « captured »)");
ok(/'reinitialisation',\s*jsonb_build_object\('le', now\(\), 'statut_avant', j\.status, 'erreur_avant', j\.error, 'fiche', j\.inventaire_id\)/.test(r), "l'état d'avant est gardé (platform_fields.reinitialisation)");

console.log("\n2. La règle : une ligne sans fiche qui double une ligne rattachée");
const f = corpsDe("lignes_sans_fiche_clore");
ok(/o\.inventaire_id IS NULL/.test(f) && /btrim\(o\.platform_listing_id\) = btrim\(p_listing\)/.test(f) && !/titre|title/.test(f), "lignes SANS fiche, au numéro EXACT — jamais un titre");
ok(/o\.status IN \('published', 'pending', 'needs_user'\)/.test(f) && /COALESCE\(o\.action, 'publish'\) IN \('publish', 'republish'\)/.test(f), "vivantes seulement (ni « processing », ni retrait)");
ok(/o\.id IS DISTINCT FROM p_garde/.test(f) && /'remplacee_par', p_garde/.test(f), "jamais la ligne gardée ; la trace nomme la ligne qui la remplace");
ok(/REVOKE ALL ON FUNCTION public\.lignes_sans_fiche_clore\(uuid, text, text, uuid, text\) FROM PUBLIC, anon, authenticated;/.test(m), "fermée aux clients (service seulement)");

console.log("\n3. Le déclencheur");
ok(/CREATE TRIGGER cross_post_jobs_une_ligne_par_annonce\s+AFTER INSERT ON public\.cross_post_jobs/.test(m)
   && /CREATE TRIGGER cross_post_jobs_une_ligne_par_annonce_maj\s+AFTER UPDATE OF inventaire_id, status, platform_listing_id ON public\.cross_post_jobs/.test(m),
  "à l'INSERT et à l'UPDATE (rattachement, publication, recâblage)");
ok((m.match(/WHEN \(NEW\.inventaire_id IS NOT NULL AND NEW\.status IN \('published', 'sold'\)/g) ?? []).length === 2, "seulement une ligne RATTACHÉE, publiée ou vendue");
ok(/OLD\.inventaire_id IS DISTINCT FROM NEW\.inventaire_id OR OLD\.status IS DISTINCT FROM NEW\.status/.test(m), "à l'UPDATE : seulement si quelque chose a changé");
ok(/EXCEPTION WHEN OTHERS THEN\s*RAISE WARNING 'cross_post_jobs_une_ligne_par_annonce/.test(corpsDe("cross_post_jobs_une_ligne_par_annonce")), "une panne de la règle n'empêche jamais l'écriture");
ok(/CREATE INDEX IF NOT EXISTS cross_post_jobs_sans_fiche_vivantes\s*ON public\.cross_post_jobs \(user_id, platform, \(btrim\(platform_listing_id\)\)\)\s*WHERE inventaire_id IS NULL AND status IN \('published', 'pending', 'needs_user'\);/.test(m),
  "index partiel, même expression et même prédicat que la règle");

console.log("\n4. Garde, inverse, rattrapage");
ok(/md5\(v_d\) <> 'b0ab3a21aaf15c2b11864f9650f3a86e'/.test(m), "garde md5 de la prod du 08/11");
const inv = lire("supabase/rollbacks/20261108143000_une_ligne_vivante_par_annonce_INVERSE.sql");
ok(/DROP TRIGGER IF EXISTS cross_post_jobs_une_ligne_par_annonce ON/.test(inv) && /DROP FUNCTION IF EXISTS public\.lignes_sans_fiche_clore/.test(inv) && /DROP INDEX IF EXISTS public\.cross_post_jobs_sans_fiche_vivantes/.test(inv), "l'inverse retire tout ce qui est ajouté");
const rat = lire("scripts/reparations/20261108_lignes_sans_fiche_doublons.sql");
ok(rat.indexOf("INSERT INTO public._backup_0811_lignes_sans_fiche") < rat.indexOf("public.lignes_sans_fiche_clore(g.user_id"), "rattrapage : sauvegarde AVANT, puis la règle elle-même (aucun UPDATE à la main)");
ok(!/UPDATE (public\.)?cross_post_jobs/.test(rat), "… le rattrapage n'écrit jamais une ligne directement");
ok(/j\.platform_fields #>> '\{ligne_sans_fiche_close,par\}' = 'rattrapage_0811'/.test(lire("scripts/reparations/20261108_lignes_sans_fiche_doublons_INVERSE.sql")), "son inverse ne rouvre que ce qu'il a clos");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — une annonce, une ligne vivante`);
process.exit(ko ? 1 : 0);
