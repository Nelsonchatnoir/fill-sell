// selftest:jamais-en-ligne-referme — (27/10, GTA de BONCOIN) Une ligne « jamais mise en ligne » dont l'article est
// retrouvé en ligne par un relevé se referme seule, que le numéro soit le même ou non ; le motif dit ce qu'on sait.
//   npm run selftest:jamais-en-ligne-referme
// Sans réseau : lit la migration 20261027100000, son inverse, la réparation et son inverse, l'essai et le classement
// des causes. La preuve sur les vraies lignes est l'essai à blanc (scripts/essais/20261027100000_essai.sql, 26/26).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const sansCommentaires = (s) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const { causeDuTexte, ORIGINE } = await import(pathToFileURL(path.join(RACINE, "supabase/functions/_shared/cause-blocage.js")).href);
let n = 0;
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
console.log("jamais-en-ligne-referme-selftest");

const MIG = lire("supabase/migrations/20261027100000_jamais_en_ligne_referme_par_le_releve.sql");
const INV = lire("supabase/rollbacks/20261027100000_jamais_en_ligne_referme_par_le_releve_INVERSE.sql");
const REP = lire("scripts/reparations/20261027_jamais_en_ligne_refermes.sql");
const REPI = lire("scripts/reparations/20261027_jamais_en_ligne_refermes_INVERSE.sql");
const TESTS = lire("scripts/essais/20261027100000_essai.tests.sql");
const corps = (src, nom) => {
  const i = src.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  assert.ok(i >= 0, `${nom} présente`);
  const fin = src.indexOf("$function$;", src.indexOf("$function$", i) + 10);
  return src.slice(i, fin);
};
const REGLE = corps(MIG, "depot_jamais_en_ligne_refermer");
const DECL = corps(MIG, "annonce_en_ligne_referme_depot");
const TRANCHER = corps(MIG, "trancher_publications_sans_lien");
const FAIL = corps(MIG, "fail_publish_without_listing_url");

cas("1. la règle : seulement les publications en échec « jamais en ligne » du compte, de la plateforme ; bornée ; Vinted exclu", () => {
  assert.match(REGLE, /c\.user_id = p_user AND c\.status = 'failed' AND c\.platform = p_platform/);
  assert.match(REGLE, /COALESCE\(c\.action, 'publish'\) = 'publish'/);
  assert.match(REGLE, /\? 'depot_jamais_en_ligne'/);
  assert.match(REGLE, /LIMIT 25\s+FOR UPDATE SKIP LOCKED/);
  assert.match(REGLE, /p_platform = 'vinted' THEN\s+RETURN/);
  assert.ok(!/status = 'pending'|status='pending'/.test(sansCommentaires(REGLE)), "jamais remise en file : rien n'est redéposé");
  assert.ok(!/INSERT INTO/i.test(sansCommentaires(REGLE)), "aucune ligne créée");
  assert.ok(!/armer_retrait|action = 'delete'|refund|email|net\.http/i.test(sansCommentaires(REGLE)), "ni retrait, ni quota, ni mail");
});

cas("2. la preuve : un identifiant du dépôt, ou la MÊME fiche sur la MÊME plateforme du MÊME compte — jamais un titre", () => {
  assert.match(REGLE, /ap\.user_id = p_user AND ap\.platform = p_platform AND ap\.listing_id = ANY/);
  assert.match(REGLE, /ap\.user_id = p_user AND ap\.platform = p_platform AND ap\.inventaire_id = j\.inventaire_id/);
  assert.match(REGLE, /IF j\.inventaire_id IS NULL THEN CONTINUE; END IF;/);
  const lu = sansCommentaires(REGLE);
  assert.ok(!/titre|title|photo|prix|price|dhash/i.test(lu), "aucune lecture de titre, photo ou prix");
  assert.ok(!/jumelle|fiches_liees/i.test(lu), "jamais une autre fiche (jumelle)");
  for (const garde of ["statut_plateforme = 'en_ligne'", "disparu_le IS NULL", "retiree_le IS NULL"]) {
    assert.equal(lu.split(garde).length - 1, 2, `${garde} dans les deux preuves`);
  }
});

cas("3. même numéro : « publiée » avec son lien si personne ne la suit ; close si une autre publication la suit", () => {
  assert.match(REGLE, /SET status = 'published', error = NULL, listing_url = a\.url/);
  assert.match(REGLE, /o\.status IN \('published', 'sold'\)/);
  assert.match(REGLE, /'issue', 'en_ligne_meme_numero'/);
  assert.match(REGLE, /déjà suivie par FillSell : rien à refaire, rien n''est vendu\./);
  assert.match(REGLE, /'depot_jamais_en_ligne_leve'/);
});

cas("4. autre numéro, même fiche : close sans rouge, l'annonce et le relevé nommés, l'ancien motif archivé", () => {
  assert.match(REGLE, /'issue', 'article_en_ligne_ailleurs', 'issue_avant', v_trace -> 'issue'/);
  assert.match(REGLE, /'Ce dépôt n''a jamais été retrouvé dans tes annonces ' \|\| v_nom \|\| ', mais ton article y est en ligne sous l''annonce '/);
  assert.match(REGLE, /'par', 'releve : article retrouvé en ligne'/);
  assert.match(REGLE, /jsonb_array_length\(v_arch\) > 20/);
  assert.equal((REGLE.match(/WHERE id = j\.id AND status = 'failed'/g) || []).length, 3, "chaque écriture relit l'état");
});

cas("5. le déclencheur : à l'arrivée d'une annonce en ligne ou à un changement utile, jamais sur une ligne relue à l'identique", () => {
  assert.match(MIG, /CREATE TRIGGER annonces_plateforme_referme_depot_ins\s+AFTER INSERT ON public\.annonces_plateforme/);
  assert.match(MIG, /CREATE TRIGGER annonces_plateforme_referme_depot_maj\s+AFTER UPDATE OF inventaire_id, statut_plateforme, disparu_le, retiree_le, listing_id ON public\.annonces_plateforme/);
  assert.match(MIG, /OLD\.inventaire_id IS DISTINCT FROM NEW\.inventaire_id OR OLD\.statut_plateforme IS DISTINCT FROM NEW\.statut_plateforme/);
  assert.match(DECL, /IF NOT EXISTS \(SELECT 1 FROM cross_post_jobs c\s+WHERE c\.user_id = NEW\.user_id AND c\.status = 'failed'/);
  assert.match(DECL, /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
});

cas("6. trancher passe la règle à chaque relevé, isolée, et la rend dans son bilan ; sa logique ne change pas", () => {
  assert.match(TRANCHER, /v_refermees := depot_jamais_en_ligne_refermer\(p_user, p_platform, NULL, NULL, p_run_id\);\n  EXCEPTION WHEN OTHERS THEN/);
  assert.ok(TRANCHER.indexOf("depot_jamais_en_ligne_refermer") < TRANCHER.indexOf("IF NOT releve_preuve_absence(p_run_id)"), "avant la garde d'absence : une présence n'a pas besoin d'un relevé probant");
  assert.match(TRANCHER, /'refermees', v_refermees\);/);
  // Les gardes du jugement sont intactes (grâce Beebs 7 jours, 4 h ailleurs, Beebs sans lien jamais jugé, 14 jours).
  assert.match(TRANCHER, /v_grace := CASE WHEN p_platform = 'beebs' THEN interval '7 days' ELSE interval '4 hours' END;/);
  assert.match(TRANCHER, /IF p_platform = 'beebs' THEN\n      n_attente := n_attente \+ 1; CONTINUE;/);
  assert.match(TRANCHER, /> now\(\) - interval '14 days'/);
});

cas("7. les motifs disent ce qu'on sait : plus de « refusée par sa modération / vérification », ni de « refusé à la vérification »", () => {
  for (const [nom, c] of [["trancher", TRANCHER], ["fail_publish", FAIL]]) {
    const lu = sansCommentaires(c);
    assert.ok(!/refusée par sa modération|refusée par sa vérification|refusé à la vérification/.test(lu), `${nom} : aucune déduction`);
    assert.ok(/n''a donné aucun motif/.test(lu), `${nom} : « aucun motif donné »`);
  }
  assert.equal((TRANCHER.match(/' aux relevés complets du '\s*\|\| to_char\(COALESCE\(v_precedent\.finished_at/g) || []).length, 2, "les deux relevés datés, dans les deux boucles");
  assert.match(TRANCHER, /déjà en ligne sur ' \|\| v_nom \|\| '\. '/);
  assert.match(FAIL, /« Mes annonces » relu en entier '/);
});

cas("8. l'inverse rend les deux corps relus en prod et retire déclencheurs et règle", () => {
  assert.match(INV, /DROP TRIGGER IF EXISTS annonces_plateforme_referme_depot_ins/);
  assert.match(INV, /DROP TRIGGER IF EXISTS annonces_plateforme_referme_depot_maj/);
  assert.match(INV, /DROP FUNCTION IF EXISTS public\.depot_jamais_en_ligne_refermer\(uuid, text, bigint, text, uuid\)/);
  assert.ok(INV.includes("elle a été refusée par sa modération (ou retirée avant sa mise en ligne)"), "l'ancien texte revient tel quel");
  assert.ok(!INV.includes("depot_jamais_en_ligne_refermer(p_user"), "l'ancien trancher n'appelle pas la règle");
  assert.ok(INV.indexOf("CREATE OR REPLACE FUNCTION public.trancher_publications_sans_lien") < INV.indexOf("DROP FUNCTION IF EXISTS public.depot_jamais_en_ligne_refermer"), "trancher rendu avant que la règle parte");
});

cas("9. la réparation : la règle passe (pas une écriture au cas), sauvegarde protégée, GTA vérifiée, motifs rebâtis sur leurs relevés", () => {
  assert.match(REP, /CREATE TABLE public\._backup_2710_jamais_en_ligne AS/);
  assert.match(REP, /REVOKE ALL ON public\._backup_2710_jamais_en_ligne FROM PUBLIC, anon, authenticated;/);
  assert.match(REP, /to_regprocedure\('public\.depot_jamais_en_ligne_refermer\(uuid,text,bigint,text,uuid\)'\) IS NULL/);
  assert.match(REP, /b := public\.depot_jamais_en_ligne_refermer\(r\.user_id, r\.platform, NULL, NULL, NULL\);/);
  assert.match(REP, /RAISE EXCEPTION 'la GTA \(aea284ac\) n''a pas été refermée par la règle'/);
  assert.match(REP, /position\(\('relevés du ' \|\| v_p \|\| ' et du ' \|\| v_s\) IN r\.error\) = 0 THEN\s+RAISE EXCEPTION/);
  assert.ok(!/status = 'cancelled'|status = 'published'/.test(sansCommentaires(REP).replace(/AND status = 'cancelled'/g, "")), "aucun statut écrit à la main");
  assert.match(REPI, /FROM public\._backup_2710_jamais_en_ligne b\s+WHERE c\.id = b\.id AND c\.platform_fields \? 'reparation_2710_jamais_en_ligne'/);
});

cas("10. l'essai couvre le 26/10 rejoué, le même numéro, les gardes, le coût et l'absence de mail", () => {
  for (const k of ["D1b rattachée à la fiche", "D2 même numéro", "D3 même numéro suivi ailleurs", "G1 même titre, aucune fiche",
    "G2 même titre, AUTRE fiche", "G3 même fiche, AUTRE plateforme", "G4 même fiche, même plateforme, mais disparue",
    "P1 relevé de BONCOIN relu à l''identique", "M1 aucun retrait armé, aucun redépôt", "M2 aucun mail"]) {
    assert.ok(TESTS.includes(k), k);
  }
});

cas("11. le classement des causes (sentinelle) range le motif neuf avec l'ancien", () => {
  const c = causeDuTexte({ texte: "Cette annonce est absente de tes annonces Leboncoin aux relevés complets du 25/10 à 23h25 et du 26/10 à 16h54, et Leboncoin n'a donné aucun motif." });
  assert.equal(c.origine, ORIGINE.PLATEFORME);
  assert.equal(c.cause, "moderation");
});

console.log(`jamais-en-ligne-referme-selftest : ${n} cas verts`);
