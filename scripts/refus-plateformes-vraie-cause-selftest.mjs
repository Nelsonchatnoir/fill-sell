// selftest:refus-plateformes-vraie-cause — (24/10, point 6) Un refus de plateforme se dit avec sa VRAIE cause, et
// une relance ne repart jamais avec l'annonce morte du dépôt d'avant.
//   npm run selftest:refus-plateformes-vraie-cause
// Les cas du 23/10 : jocabroc8 (eBay, deux annonces arrêtées par le vendeur 2 et 17 min après leur mise en ligne,
// montrées « refusées par la modération ») ; louis-seller (Raiponce relancée qui gardait le numéro mort 3290885485 ;
// Short Okaïdi en ligne chez le compte relié montré « Publication non confirmée »).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const { relanceSansDepotMort, TRACES_DEPOT_MORT } = await import(pathToFileURL(path.join(RACINE, "src/utils/relanceDepotMort.js")).href);
let n = 0;
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
console.log("refus-plateformes-vraie-cause-selftest");

// La Raiponce de louis-seller telle que relue le 23/10 (champs réduits à ce qui compte).
const RAIPONCE = {
  platform_listing_id: "3290885485", listing_url: "https://www.leboncoin.fr/ad/vetements/3290885485",
  pf: {
    taille: "8 ans", lot_publication: { id: "lot" }, relances_manuelles: 0,
    lbc_depot: { adsubmit: { id: "3290885485", status: 201 } },
    depot_jamais_en_ligne: { issue: "refus_moderation_probable", identifiants: ["3290885485"], avec_lien: true },
    unavailable_pending_since: "2026-10-21T22:00:00Z", listing_url_recovery: { essais: 3 },
  },
};

cas("1. relance après un dépôt PROUVÉ mort : numéro, lien et traces effacés, archivés — le contenu reste", () => {
  const r = relanceSansDepotMort(RAIPONCE, RAIPONCE.pf, "2026-10-23T16:33:33.155Z");
  assert.deepEqual(r.colonnes, { platform_listing_id: null, listing_url: null, published_at: null });
  for (const k of ["lbc_depot", "depot_jamais_en_ligne", "unavailable_pending_since", "listing_url_recovery"]) assert.ok(!(k in r.pf), `${k} effacé`);
  assert.equal(r.pf.taille, "8 ans");
  assert.deepEqual(r.pf.lot_publication, { id: "lot" });
  const a = r.pf.relance_apres_depot_mort;
  assert.equal(a.identifiant, "3290885485");
  assert.equal(a.lien, "https://www.leboncoin.fr/ad/vetements/3290885485");
  assert.equal(a.issue, "refus_moderation_probable");
  assert.deepEqual(a.constat.identifiants, ["3290885485"]);
  assert.deepEqual(a.traces_retirees.sort(), ["depot_jamais_en_ligne", "lbc_depot", "listing_url_recovery", "unavailable_pending_since"]);
  assert.ok(!("relance_apres_depot_mort" in RAIPONCE.pf), "la ligne lue n'est pas modifiée en place");
});

cas("2. sans preuve de dépôt mort (une annonce peut être en vérification) : rien ne change", () => {
  const pf = { lbc_depot: { adsubmit: { id: "3293872836" } }, needsUserAttempts: 2 };
  const r = relanceSansDepotMort({ platform_listing_id: "3293872836" }, pf);
  assert.equal(r.pf, pf);
  assert.deepEqual(r.colonnes, {});
  assert.deepEqual(relanceSansDepotMort({}, { depot_jamais_en_ligne: "x" }).colonnes, {}, "forme inattendue : rien");
  assert.deepEqual(relanceSansDepotMort({}, null).colonnes, {});
});

cas("3. les traces effacées sont celles qui font croire à une annonce (ou à sa disparition) — jamais le contenu", () => {
  for (const k of ["lbc_depot", "depot_jamais_en_ligne", "sale_signal", "unavailable_since", "unavailable_pending_since", "lien_refuse", "moderation_probe"]) {
    assert.ok(TRACES_DEPOT_MORT.includes(k), k);
  }
  for (const k of ["taille", "marque", "etat", "photos_lbc", "lbcCategoryPath", "adresse", "format_colis", "lot_publication", "needsUserResolved"]) {
    assert.ok(!TRACES_DEPOT_MORT.includes(k), `${k} n'est jamais effacé`);
  }
});

cas("4. l'app : « Relancer » et « Relancer par copie » partent sans l'annonce morte", () => {
  const S = lire("src/tabs/StockTab.jsx");
  assert.ok(S.includes("import { relanceSansDepotMort, TRACES_DEPOT_MORT } from '../utils/relanceDepotMort.js';"));
  assert.ok(S.includes("const sansDepotMort = relanceSansDepotMort(job, pf);"));
  assert.ok(S.includes(".update({ status: 'pending', error: null, ...sansDepotMort.colonnes, platform_fields: sansDepotMort.pf, ...(photosRelance ? { photos: photosRelance } : {}) })"));
  assert.ok(/'blocage_antirobot', 'capture_echec', 'pending_muet_clos_le', 'pending_muet_jours',\n[\s\S]{0,400}\.\.\.TRACES_DEPOT_MORT,\n\];/.test(S), "la copie n'hérite plus du dépôt de la source");
});

const MIG = lire("supabase/migrations/20261024140000_refus_plateformes_vraie_cause.sql");
const INV = lire("supabase/rollbacks/20261024140000_refus_plateformes_vraie_cause_INVERSE.sql");
const corps = (src, nom) => {
  const i = src.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  assert.ok(i >= 0, `${nom} absent`);
  return src.slice(i, src.indexOf("$function$;", i));
};

cas("5. eBay : une annonce dont la veille a lu la fin (sans vente) est « arrêtée sur eBay — pas par FillSell », jamais « refusée »", () => {
  const T = corps(MIG, "trancher_publications_sans_lien");
  const i = T.indexOf("IF p_platform = 'ebay' AND _ts_ou_null(j.platform_fields #>> '{fin_ebay,fin}') IS NOT NULL");
  assert.ok(i > 0);
  assert.ok(/AND coalesce\(j\.platform_fields #>> '\{fin_ebay,vendus\}', '0'\) ~ '\^0\+\$' THEN/.test(T), "une vente lue n'est jamais close ici");
  const branche = T.slice(i, T.indexOf("END IF;", i));
  assert.ok(branche.includes("status = 'cancelled'") && branche.includes("'issue', 'arretee_sur_ebay'"));
  assert.ok(branche.includes("pas par FillSell, et sans vente. Ce n''est pas un refus d''eBay."));
  assert.ok(!/modération|doublons/.test(branche.replace(/--[^\n]*/g, "")), "aucun mot de refus dans le motif");
  assert.ok(branche.includes("v_refund := CASE WHEN v_vivante.listing_id IS NULL AND v_jum_id IS NULL THEN refund_publish_unconfirmed(j.id) END;"), "quotas comme avant");
  assert.ok(i < T.indexOf("IF v_vivante.listing_id IS NOT NULL OR v_jum_id IS NOT NULL THEN\n        UPDATE cross_post_jobs SET status = 'cancelled',"), "avant la clôture « en ligne ailleurs », qui disait « jamais mis en ligne »");
  assert.ok(T.includes("'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id"), "le refus vrai reste dit comme avant");
});

cas("6. un dépôt sans lien dont l'article est en ligne ailleurs (même fiche, compte relié) n'est jamais « non confirmé »", () => {
  const F = corps(MIG, "fail_publish_without_listing_url");
  assert.equal([...F.matchAll(/v_ailleurs := article_en_ligne_ailleurs\(j\.user_id, j\.platform, j\.inventaire_id, /g)].length, 2, "les deux boucles");
  assert.ok(F.indexOf("v_ailleurs := article_en_ligne_ailleurs") < F.indexOf("-- (3) La seulement : ni lien, ni identifiant"), "avant « Publication non confirmée »");
  assert.ok(F.includes("publiée par ton compte FillSell relié — ' || initcap(j.platform)"));
  assert.ok(F.includes("SELECT id, user_id, platform, platform_listing_id, inventaire_id,") && F.includes("SELECT c.id, c.user_id, c.platform, c.platform_listing_id, c.inventaire_id,"));
  assert.ok(F.includes("'en_ligne_ailleurs', n_ailleurs"));
  assert.ok(/REVOKE ALL ON FUNCTION public\.fail_publish_without_listing_url\(timestamp with time zone\) FROM PUBLIC, anon, authenticated, service_role;/.test(MIG), "droits : postgres seul, comme relus");
  const A = corps(MIG, "article_en_ligne_ailleurs");
  assert.ok(A.includes("ap.inventaire_id = p_inventaire") && A.includes("jumelle_occupe_plateformes(p_user, p_inventaire)"), "par la fiche, jamais par un titre");
  assert.ok(!/titre|title|ilike/i.test(A.replace(/--[^\n]*/g, "")));
  assert.ok(/REVOKE ALL ON FUNCTION public\.article_en_ligne_ailleurs\(uuid, text, bigint, text\[\]\) FROM PUBLIC, anon, authenticated;\nGRANT EXECUTE ON FUNCTION public\.article_en_ligne_ailleurs\(uuid, text, bigint, text\[\]\) TO service_role;/.test(MIG));
});

cas("7. l'inverse rend les deux corps d'avant et retire l'aide", () => {
  assert.ok(!INV.includes("arretee_sur_ebay") && !INV.includes("article_en_ligne_ailleurs(j."));
  assert.ok(INV.includes("DROP FUNCTION IF EXISTS public.article_en_ligne_ailleurs(uuid, text, bigint, text[]);"));
  assert.ok(INV.includes("'Publication non confirmée : ton annonce n''a pas pu être retrouvée en ligne sur '"));
});

cas("8. la réparation des 4 jobs : sauvegarde protégée, gardes d'état, 4 lignes ou rien, inverse depuis la sauvegarde", () => {
  const R = lire("scripts/reparations/20261024_refus_plateformes_vraie_cause.sql");
  const RI = lire("scripts/reparations/20261024_refus_plateformes_vraie_cause_INVERSE.sql");
  assert.ok(/CREATE TABLE public\._backup_2410_refus_plateformes AS/.test(R) && /ALTER TABLE public\._backup_2410_refus_plateformes ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON public\._backup_2410_refus_plateformes FROM PUBLIC, anon, authenticated;/.test(R));
  assert.ok(R.indexOf("CREATE TABLE public._backup_2410_refus_plateformes") < R.indexOf("UPDATE public.cross_post_jobs"), "sauvegarde avant toute écriture");
  assert.ok(/IF n <> 4 THEN RAISE EXCEPTION/.test(R));
  assert.equal([...R.matchAll(/UPDATE public\.cross_post_jobs c SET status = 'cancelled'/g)].length, 4);
  assert.ok(R.includes("AND c.status = 'failed' AND c.platform = 'ebay'") && R.includes("AND c.status = 'published' AND c.platform = 'leboncoin'"));
  assert.ok(!/db986536[^\n]*SET/.test(R) && R.includes("WHERE d.id = 'db986536-02af-4706-a0a8-de17a090b1d0' AND d.status = 'published'"), "le suivi vivant n'est pas touché");
  assert.ok(!/DELETE|INSERT INTO public\.cross_post_jobs|email|push_ventes/i.test(R.replace(/--[^\n]*/g, "")), "ni retrait, ni job créé, ni mail, ni push");
  assert.ok(RI.includes("FROM public._backup_2410_refus_plateformes b") && RI.includes("c.platform_fields ? 'reparation_2410_refus'"));
});

console.log(`\n✓ refus-plateformes-vraie-cause : ${n} cas verts`);
