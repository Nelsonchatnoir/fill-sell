// selftest:releve-identifiant-avant-fiche — (27/10, Nico/Depop, XEWER/Leboncoin, Johan/Beebs) Le relevé ne crée jamais
// une fiche pour une annonce qu'un dépôt FillSell du compte porte déjà : l'identifiant d'annonce fait foi.
//   npm run selftest:releve-identifiant-avant-fiche
// Sans réseau : lit la migration 20261027120000, son inverse, la réparation et son inverse, l'essai et l'écran
// « Rattacher ». La preuve sur les vraies lignes est l'essai à blanc (scripts/essais/20261027120000_essai.sql, 18/18).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const sansCommentaires = (s) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
let n = 0;
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
console.log("releve-identifiant-avant-fiche-selftest");

const MIG = lire("supabase/migrations/20261027120000_releve_identifiant_avant_fiche.sql");
const INV = lire("supabase/rollbacks/20261027120000_releve_identifiant_avant_fiche_INVERSE.sql");
const REP = lire("scripts/reparations/20261027_doublons_identifiant.sql");
const REPI = lire("scripts/reparations/20261027_doublons_identifiant_INVERSE.sql");
const TESTS = lire("scripts/essais/20261027120000_essai.tests.sql");
const corps = (src, nom) => {
  const i = src.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  assert.ok(i >= 0, `${nom} présente`);
  return src.slice(i, src.indexOf("$function$;", src.indexOf("$function$", i) + 10));
};
const REGLE = corps(MIG, "annonce_rattacher_par_identifiant");
const RESORBER = corps(MIG, "fiche_releve_doublon_resorber");
const IMPORTER = corps(MIG, "rapprocher_importer");
const ATTACHER = corps(MIG, "rapprochement_attacher");

cas("1. la règle : l'identifiant seul (numéro ou lien), même compte, même plateforme — jamais un titre ni une photo", () => {
  assert.match(REGLE, /j\.user_id = a\.user_id AND j\.platform = a\.platform AND j\.action IN \('publish', 'republish'\)/);
  assert.match(REGLE, /listing_designe\(a\.listing_id, j\.listing_url, j\.platform_listing_id\)/);
  assert.match(REGLE, /a\.platform = 'vinted' THEN RETURN NULL/);
  const lu = sansCommentaires(REGLE);
  assert.ok(!/titre_norm|titre_jetons|dhash|photo_empreintes|a\.titre\s*=|similarity/.test(lu), "aucune comparaison de titre ni de photo");
});

cas("2. le DÉPÔT FillSell passe avant un job de suivi d'un relevé, puis le publié ; détaché par la personne = jamais", () => {
  assert.match(REGLE, /ORDER BY \(COALESCE\(j\.platform_fields ->> 'source', ''\) <> 'releve'\) DESC, \(j\.status = 'published'\) DESC/);
  assert.match(REGLE, /NOT \(COALESCE\(j\.platform_fields, '\{\}'::jsonb\) \? 'detache_le'\)/);
  assert.match(REGLE, /r\.decision = 'detache' AND r\.par = 'utilisateur'\s+AND r\.inventaire_id = f\.id/);
});

cas("3. dépôt publié → son job ; clos sur fiche en stock → job de suivi ; clos sur fiche vendue → le dépôt, rien retiré", () => {
  assert.match(REGLE, /v_job := v_depot;\n  IF v_bande = 'job_clos' AND f\.statut = 'stock' THEN\n    v_job := rapprocher_job_de_suivi/);
  const lu = sansCommentaires(REGLE);
  assert.ok(!/pending_removal|vendu_encore_en_ligne|armer_retrait|status = 'cancelled'|status = 'sold'|INSERT INTO ventes|INSERT INTO inventaire/.test(lu),
    "ni retrait, ni statut changé, ni vente, ni fiche créée");
  assert.match(REGLE, /f\.fusionne_dans IS NOT NULL AND n < 5 LOOP/);
});

cas("4. les deux portes lisent la règle d'abord : l'import (toutes voies) et le rattachement par la photo", () => {
  assert.ok(IMPORTER.indexOf("annonce_rattacher_par_identifiant(a.id, p_par)") < IMPORTER.indexOf("INSERT INTO inventaire"), "avant toute fiche");
  assert.match(IMPORTER, /IF v_ident IS NOT NULL THEN RETURN v_ident; END IF;/);
  assert.ok(ATTACHER.indexOf("annonce_rattacher_par_identifiant(a.id, 'moteur')") < ATTACHER.indexOf("rapprocher_job_de_suivi"), "avant tout job de suivi");
  assert.match(ATTACHER, /RETURN CASE WHEN \(v_ident ->> 'inventaire_id'\)::bigint = p_inv THEN NULLIF\(v_ident ->> 'job_id', ''\)::uuid END;/);
});

cas("5. la résorption : fiche née d'un relevé ET intacte seulement ; sinon la raison, rien écrit", () => {
  assert.match(RESORBER, /d\.origine NOT LIKE 'releve\\_%'/);
  assert.match(RESORBER, /'motif', 'fiche_pas_nee_du_releve'/);
  assert.match(RESORBER, /'motif', 'fiche_pas_intacte'/);
  for (const g of ["d.statut = 'stock'", "NOT EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = d.id)", "x.id <> a.id AND x.disparu_le IS NULL",
    "j.status IN ('pending', 'processing', 'needs_user')", "e.value ->> 'source' = 'manuel'", "d.prix_achat IS NULL"]) {
    assert.ok(RESORBER.includes(g), `garde : ${g}`);
  }
  assert.ok(RESORBER.indexOf("RETURN jsonb_build_object('ok', false, 'reason', 'a_signaler', 'motif', 'fiche_pas_intacte'") < RESORBER.indexOf("UPDATE cross_post_jobs"),
    "les gardes passent avant toute écriture");
});

cas("6. la résorption passe PAR LA RÈGLE, absorbe la fiche (fusionne_dans, journal), ne supprime rien", () => {
  assert.match(RESORBER, /v_r := annonce_rattacher_par_identifiant\(a\.id, 'reparation'\);/);
  assert.match(RESORBER, /UPDATE inventaire SET fusionne_dans = \(v_r ->> 'inventaire_id'\)::bigint, fusionne_le = now\(\)/);
  assert.match(RESORBER, /INSERT INTO inventaire_fusions/);
  assert.ok(!/DELETE/i.test(sansCommentaires(RESORBER)), "aucune suppression");
  assert.match(RESORBER, /'detache_le', now\(\), 'doublon_identifiant'/);
});

cas("7. l'inverse rend les deux corps relus en prod et retire les deux fonctions neuves", () => {
  assert.ok(!INV.includes("annonce_rattacher_par_identifiant(a.id"), "les corps d'avant n'appellent pas la règle");
  assert.match(INV, /DROP FUNCTION IF EXISTS public\.fiche_releve_doublon_resorber\(uuid\);/);
  assert.match(INV, /DROP FUNCTION IF EXISTS public\.annonce_rattacher_par_identifiant\(uuid, text\);/);
});

cas("8. la réparation : sauvegardes protégées, la règle sur chaque paire du parc, Nico vérifié ; inverse depuis la sauvegarde", () => {
  for (const t of ["_backup_2710_doublons_paires", "_backup_2710_doublons_fiches", "_backup_2710_doublons_jobs", "_backup_2710_doublons_annonces"]) {
    assert.ok(REP.includes(`CREATE TABLE public.${t} AS`), t);
  }
  assert.match(REP, /v := public\.fiche_releve_doublon_resorber\(r\.annonce_id\);/);
  assert.match(REP, /AND COALESCE\(j\.platform_fields ->> 'source', ''\) <> 'releve'/);
  assert.match(REP, /RAISE EXCEPTION 'la fiche Depop de Nico \(1793089261133\) n''a pas été résorbée par la règle'/);
  assert.ok(!/UPDATE public\.(inventaire|annonces_plateforme|cross_post_jobs)/.test(sansCommentaires(REP)), "aucune écriture au cas");
  assert.match(REPI, /FROM public\._backup_2710_doublons_annonces b, public\._resultat_2710_doublons r/);
});

cas("9. l'essai couvre les trois cas rejoués, le sans-dépôt d'avant, le dépôt annulé, le détachement, le coût, aucun mail", () => {
  for (const k of ["I1 personne, dépôt PUBLIÉ", "I2 moteur, dépôt VENDU", "I3 photo vers une autre fiche", "I4 photo vers la fiche du dépôt",
    "I6 sans dépôt : fiche neuve comme avant", "I7 dépôt annulé, fiche en stock", "I8 détachée par la personne", "P1 la règle sur le plus gros compte",
    "M1 aucun retrait armé", "M2 aucun mail", "R6 parc"]) assert.ok(TESTS.includes(k), k);
});

cas("10. l'écran « Rattacher » dit où l'annonce est allée quand « Importer » la rattache à son dépôt", () => {
  const E = lire("src/annonces/EcranRattachement.jsx");
  assert.match(E, /decision === 'attache' \|\| r\?\.decision === 'attache' \? T\.ratFaitAttache\(titreDe\(inventaireId \?\? r\.inventaire_id\)/);
});

console.log(`releve-identifiant-avant-fiche-selftest : ${n} cas verts`);
