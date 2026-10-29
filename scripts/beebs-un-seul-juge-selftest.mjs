// ═══════════════════════════════════════════════════════════════════════════
// BEEBS : UN SEUL JUGE « JAMAIS EN LIGNE », LE MESSAGE VRAI, LA SUPPRESSION ENVOYÉE GARDÉE (29/10, lot B 4.5/4.9)
// `npm run selftest:beebs-un-seul-juge`
// ═══════════════════════════════════════════════════════════════════════════
// 4.5 — louis-seller 34200634 / 34200711, XEWER 34198358 : ARRIVÉS chez Beebs, puis dits « jamais en ligne » par la
//   fonction SQL sur des relevés dont le total est le compteur de l'INDEX (la page n'en montre que 60) ; Polly
//   34206489, jugée ainsi le 24/10, EN LIGNE le 28/10. R1 : un seul juge, deux preuves (la page qui voit tout, deux
//   constats 404 à 6 h d'écart) ; R3 : « Beebs a reçu ton annonce (n° …, en vérification à HHhMM le JJ/MM), puis l'a
//   retirée de sa vérification sans la mettre en ligne (elle n'y était plus à HHhMM le JJ/MM) ; Beebs ne dit pas
//   pourquoi. » — deux heures constatées, jamais une durée (selftest aucune-estimation).
// 4.9 B — Sébastien cfed66ca, fiche supprimée : le filet de réarmement exigeait une fiche « vendu » (R4).
// 4.9 C — Joséphine 1845ce62 : supprimée par FillSell le 26/10, la preuve exigeait « Mes annonces » complète (R5) ;
//   la cause de « illisible en entier » n'était gardée nulle part (R6).
// Essais à blanc (prod, ROLLBACK) : scripts/essais/20261029200000_essai.sql (24/24), 20261029201000_essai.sql (11/11).
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (f) => readFileSync(join(RACINE, f), "utf8").replace(/\r\n/g, "\n");
const imp = (f) => import(pathToFileURL(join(RACINE, f)).href);
const SV = await imp("supabase/functions/_shared/beebs-sortie-verification.js");
const BP = await imp("supabase/functions/_shared/beebs-preuve-retrait.js");
const RA = await imp("supabase/functions/_shared/retrait-deja-absent.js");
const CB = await imp("supabase/functions/_shared/cause-blocage.js");
let ko = 0, n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ""}`); } };
const t = (iso) => Date.parse(iso);

console.log("1. Le juge JS : la seconde preuve (deux constats « page 404 »), la même que la fonction SQL");
const EN_LIGNE = Array.from({ length: 60 }, (_, k) => String(34100000 + k));
const lecture = (lu_le, verif, annoncees = 253) => ({ ok: true, lu_le, ids: [...verif, ...EN_LIGNE],
  pages: [{ page: "en_verification", ok: true, ids: verif, n: verif.length }, { page: "en_ligne", ok: true, ids: EN_LIGNE, n: 60, annoncees }] });
const depot = { id: "22362f3a", platform: "beebs", action: "publish", status: "published", price: "1.5", platform_listing_id: "34200634",
  listing_url: "https://www.beebs.app/fr/p/34200634", published_at: "2026-10-20T01:02:44Z", created_at: "2026-10-19T22:01:43Z", vu_en_ligne_le: null,
  platform_fields: { preuve_identifiant_beebs: { id: "34200634", avant: lecture("2026-10-20T01:02:30Z", ["34200633"]), apres: lecture("2026-10-20T01:02:40Z", ["34200634", "34200633"]) } } };
const ls = SV.lecturesDesDepotsBeebs([depot]);
const c404 = (le, verif = "complete") => ({ le, page_http: 404, produit: false, en_verification: verif });
const gros = { status: "done", started_at: "2026-10-29T16:17:35Z", finished_at: "2026-10-29T16:18:00Z", items_vus: 253, total_entries: 253,
  erreur: "[défilement] page : 60 annonce(s) affichée(s) (1 défilement(s), la page n'en affichait pas plus) | page : 0 annonce(s) affichée(s) | index public Beebs : 253 annonce(s) en ligne, 253 lue(s) au total" };
const maint = t("2026-10-29T18:00:00Z");
ok(SV.jugerSortieVerificationBeebs(depot, { lectures: ls, releves: [gros], maintenant: maint }) === null,
  "gros compte (page 60 < index 253), aucune lecture « en vérification » après le dépôt, aucun constat : rien (Polly, 34200634)");
const v404 = SV.jugerSortieVerificationBeebs(depot, { lectures: ls, releves: [gros], constats404: [c404("2026-10-28T10:00:00Z"), c404("2026-10-28T17:00:00Z")], maintenant: maint });
ok(v404?.verdict === "refus" && v404.confirmee_par === "constats_404" && v404.confirmee_le === "2026-10-28T17:00:00.000Z" && v404.confirmee_depuis === "2026-10-28T10:00:00.000Z"
  && v404.sortie_constatee_le === null, "deux constats 404 (en vérification lue en entier) à 7 h d'écart, 8 jours après : REFUS prouvé ; heure de sortie inconnue, jamais devinée", JSON.stringify(v404));
ok(SV.jugerSortieVerificationBeebs({ ...depot, platform_fields: { ...depot.platform_fields, beebs_404_constats: [c404("2026-10-28T10:00:00Z"), c404("2026-10-28T17:00:00Z")] } },
  { lectures: ls, maintenant: maint })?.confirmee_par === "constats_404", "les constats portés par le dépôt lui-même comptent aussi");
ok(SV.jugerSortieVerificationBeebs(depot, { lectures: ls, constats404: [c404("2026-10-28T10:00:00Z"), c404("2026-10-28T13:00:00Z")], maintenant: maint }) === null,
  "3 h d'écart : jamais une preuve");
ok(SV.jugerSortieVerificationBeebs(depot, { lectures: ls, constats404: [c404("2026-10-21T10:00:00Z"), c404("2026-10-21T17:00:00Z")], maintenant: maint }) === null,
  "constats d'avant les 7 jours (Beebs garde une annonce invisible jusqu'à 126 h) : jamais une preuve");
ok(SV.jugerSortieVerificationBeebs(depot, { lectures: ls, constats404: [c404("2026-10-28T10:00:00Z", "non_lue"), c404("2026-10-28T17:00:00Z", "non_lue")], maintenant: maint }) === null,
  "« en vérification » non lue : une page 404 est aussi celle d'une annonce en vérification — jamais une preuve");
ok(SV.jugerSortieVerificationBeebs({ ...depot, price: "999" }, { lectures: ls, constats404: [c404("2026-10-28T10:00:00Z"), c404("2026-10-28T17:00:00Z")], maintenant: maint }) === null,
  "999 € : jamais jugée (Beebs les examine invisibles)");
ok(SV.preuve404RefusBeebs([c404("2026-10-28T10:00:00Z"), c404("2026-10-28T17:00:00Z")], t("2026-10-20T01:02:40Z"))?.n === 2
  && SV.preuve404RefusBeebs([c404("2026-10-20T01:00:00Z"), c404("2026-10-28T17:00:00Z")], t("2026-10-20T01:02:40Z")) === null,
  "preuve404RefusBeebs : seuls les constats APRÈS la dernière vue comptent");

console.log("\n2. Le message vrai, daté (R3) — le même texte que la fonction SQL (essai M1-M4, à l'octet près)");
const FIN = " Rien n'est en ligne, rien n'est vendu : ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. Pour la reproposer, change d'abord ce que Beebs a pu refuser (photos, titre, description, rayon).";
const CAS = [
  [{ action: "publish" }, { numero: "34198358", vu_en_verification_le: "2026-10-19T16:09:07Z", sortie_constatee_le: "2026-10-19T16:12:30Z", confirmee_le: "2026-10-29T16:18:31Z", confirmee_par: "releve" },
    "Beebs a reçu ton annonce (n° 34198358, en vérification à 18h09 le 19/10), puis l'a retirée de sa vérification sans la mettre en ligne (elle n'y était plus à 18h12 le 19/10) ; Beebs ne dit pas pourquoi. Le relevé fait à 17h18 le 29/10, qui a lu toutes tes annonces en ligne, ne la montre pas : Beebs n'a jamais mis cette annonce en ligne." + FIN],
  [{ action: "publish" }, { numero: "34200634", vu_en_verification_le: "2026-10-20T01:02:40Z", sortie_constatee_le: "2026-10-20T03:32:40Z", confirmee_le: "2026-10-28T17:00:00Z", confirmee_par: "constats_404", confirmee_depuis: "2026-10-28T10:00:00Z" },
    "Beebs a reçu ton annonce (n° 34200634, en vérification à 03h02 le 20/10), puis l'a retirée de sa vérification sans la mettre en ligne (elle n'y était plus à 05h32 le 20/10) ; Beebs ne dit pas pourquoi. Sa page est introuvable (404) à 11h00 le 28/10 et encore à 18h00 le 28/10, et elle n'est plus dans tes annonces en vérification : Beebs n'a jamais mis cette annonce en ligne." + FIN],
  [{ action: "republish" }, { numero: "34206489", vu_en_verification_le: "2026-10-20T21:51:59Z", sortie_constatee_le: "2026-10-23T21:51:59Z", confirmee_le: "2026-10-29T16:17:35Z", confirmee_par: "releve" },
    "Beebs a reçu ta nouvelle annonce (n° 34206489, en vérification à 23h51 le 20/10), puis l'a retirée de sa vérification sans la mettre en ligne (elle n'y était plus à 23h51 le 23/10) ; Beebs ne dit pas pourquoi. Le relevé fait à 17h17 le 29/10, qui a lu toutes tes annonces en ligne, ne la montre pas : Beebs n'a jamais mis cette annonce en ligne. L'ancienne annonce avait été retirée : ton article n'est plus en ligne sur Beebs. Rien n'est vendu, ton article reste dans ton stock, et cette republication ne compte pas dans tes limites. Pour la reproposer, change d'abord ce que Beebs a pu refuser (photos, titre, description, rayon)."],
  [{ action: "publish" }, { numero: "34200711", vu_en_verification_le: null, sortie_constatee_le: null, confirmee_le: "2026-10-29T16:17:35Z", confirmee_par: "releve" },
    "Beebs a reçu ton annonce (n° 34200711), puis l'a retirée de sa vérification sans la mettre en ligne ; Beebs ne dit pas pourquoi. Le relevé fait à 17h17 le 29/10, qui a lu toutes tes annonces en ligne, ne la montre pas : Beebs n'a jamais mis cette annonce en ligne." + FIN],
];
for (const [job, verdict, attendu] of CAS) {
  const m = SV.messageRefusVerificationBeebs(job, verdict);
  ok(m === attendu, `${job.action} n° ${verdict.numero} (${verdict.confirmee_par}) : mot pour mot`, m);
}
ok(CAS.every(([j, v]) => !/\bplus tard\b|moins d.une minute|\b\d+\s*(min|h|jours?)\b/.test(SV.messageRefusVerificationBeebs(j, v).replace(/\d\dh\d\d le \d\d\/\d\d/g, "")))
  && SV.messageRefusVerificationBeebs({ action: "publish" }, { numero: "1", vu_en_verification_le: "2026-10-20T10:00:00Z", sortie_constatee_le: "2026-10-20T09:00:00Z" }).includes("sans la mettre en ligne ; Beebs"),
  "deux heures constatées, jamais une durée ; une sortie lue AVANT la vue n'est jamais dite");
const m0 = SV.messageRefusVerificationBeebs(CAS[0][0], CAS[0][1]);
ok(!/refusée|a refusé|serait refusé|relance|FillSell (la )?relit à|à partir du/i.test(m0), "jamais « refusée » (une déduction), jamais « serait refusé de même », aucune heure promise");
ok(JSON.stringify(CB.causeDuTexte({ texte: m0 })) === JSON.stringify({ origine: "plateforme", cause: "moderation" }),
  "classé « la plateforme refuse sans motif » (cause-blocage), comme avant", JSON.stringify(CB.causeDuTexte({ texte: m0 })));

console.log("\n3. La migration 20261029200000 (R1 + R3), son inverse, son essai");
const M1 = lire("supabase/migrations/20261029200000_beebs_un_seul_juge_jamais_en_ligne.sql");
const I1 = lire("supabase/rollbacks/20261029200000_beebs_un_seul_juge_jamais_en_ligne_INVERSE.sql");
const corps = (src, nom) => { const i = src.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`); const a = src.indexOf("$function$", i); const j = src.indexOf("$function$", a + 10); return i < 0 || a < 0 || j < 0 ? "" : src.slice(i, j); };
const sansCom = (s) => s.replace(/--[^\n]*/g, "");
const TR = sansCom(corps(M1, "trancher_publications_sans_lien"));
const PR = sansCom(corps(M1, "beebs_preuve_jamais_en_ligne"));
const RV = sansCom(corps(M1, "releve_beebs_voit_tout_en_ligne"));
ok(/NON APPLIQUÉE/.test(M1) && /md5\(pg_get_functiondef\('public\.trancher_publications_sans_lien\(uuid,text,uuid\)'::regprocedure\)\) <> '6ea3fdf30588cf009c3bf3ba50ec1058'/.test(M1),
  "non appliquée ; refuse de remplacer une fonction qui aurait changé en prod depuis sa lecture (md5 du 29/10)");
const iJuge = TR.indexOf("beebs_preuve_jamais_en_ligne(p_user, v_num, j.publie, j.price, j.platform_fields, p_run_id)");
const iBoucle2 = TR.indexOf("IF p_platform <> 'vinted' THEN");
ok(iJuge > iBoucle2 && iJuge < TR.indexOf("v_vivante := NULL;", iBoucle2) && iJuge < TR.indexOf("refund_publish_unconfirmed(j.id)", iBoucle2),
  "seconde boucle : le juge passe AVANT toute conclusion (clos « en ligne ailleurs », publication rendue, « failed »)");
ok(/IF v_preuve IS NULL THEN\s+IF NOT \(COALESCE\(j\.platform_fields, '\{\}'::jsonb\) \? 'pas_encore_visible'\) THEN/.test(TR)
  && /AND NOT \(COALESCE\(platform_fields, '\{\}'::jsonb\) \? 'pas_encore_visible'\);/.test(TR) && /n_attente := n_attente \+ 1; CONTINUE;\s+END IF;\s+END IF;\s+v_vivante := NULL;/.test(TR),
  "sans preuve : « pas encore visible » posé une seule fois (jamais une ligne inchangée réécrite), jamais « refusée »");
ok(/v_num := CASE WHEN array_length\(v_ids, 1\) = 1 THEN v_ids\[1\] END;/.test(TR), "deux numéros contraires : rien n'est conclu");
ok(/v_msg := 'Cette annonce est absente de tes annonces ' \|\| v_nom\n\s+\|\| ' aux relevés complets du '/.test(TR) && !/Sept jours après le dépôt/.test(TR)
  && /IF p_platform = 'beebs' THEN\s+v_msg := beebs_message_jamais_en_ligne\(v_preuve, false, v_doublon\.listing_id\);/.test(TR),
  "Leboncoin, eBay, Depop : le texte d'avant ; Beebs : le message vrai, daté");
ok(TR.split("IF p_platform = 'beebs' THEN\n      n_attente := n_attente + 1; CONTINUE;").length === 2, "première boucle inchangée : Beebs n'y est jamais jugé");
// Le miroir SQL de releveVoitToutEnLigne : les mêmes trois motifs que le JS.
const js = lire("supabase/functions/_shared/beebs-sortie-verification.js");
ok(js.includes("e.match(/\\[flux\\] en ligne (\\d+)\\/(\\d+)/)") && js.includes("e.match(/page : (\\d+) annonce\\(s\\) affichée\\(s\\)/)") && RV.includes("'\\[flux\\] en ligne (\\d+)/(\\d+)'") && RV.includes("'page : (\\d+) annonce\\(s\\) affichée\\(s\\)'")
  && RV.includes("'index public Beebs : (\\d+) annonce\\(s\\) en ligne'") && /v_page >= v_index/.test(RV) && /v_flux\[1\]::integer >= v_flux\[2\]::integer AND v_flux\[2\]::integer > 0/.test(RV)
  && /COALESCE\(r\.items_vus, -1\) < r\.total_entries/.test(RV) && /\\\[incomplet\\\]/.test(RV),
  "releve_beebs_voit_tout_en_ligne = releveVoitToutEnLigne (complet, flux X ≥ Y > 0, sinon page ≥ index)");
ok(/p_prix IS NULL OR p_prix <= 0 OR p_prix >= 500 THEN RETURN NULL/.test(PR) && /IF v_vue_en_ligne THEN RETURN NULL; END IF;/.test(PR)
  && /v_run\.started_at >= v_derniere \+ interval '7 days' AND releve_beebs_voit_tout_en_ligne\(p_run\)/.test(PR)
  && /e -> 'page_http' = '404'::jsonb AND e -> 'produit' = 'false'::jsonb\s+AND e ->> 'en_verification' = 'complete'/.test(PR)
  && /v_cn >= 2 AND v_c2 - v_c1 >= interval '6 hours' AND v_c2 >= v_derniere \+ interval '7 days'/.test(PR)
  && /o\.user_id = p_user AND o\.created_at >= p_publie - interval '1 day'/.test(PR),
  "beebs_preuve_jamais_en_ligne : < 500 €, jamais vue en ligne, la page à J+7, ou deux 404 (en vérification lue) à 6 h dont le dernier à J+7 ; lectures bornées (compte, depuis le dépôt)");
ok(/REVOKE ALL ON FUNCTION public\.releve_beebs_voit_tout_en_ligne\(uuid\) FROM PUBLIC, anon, authenticated;/.test(M1)
  && /GRANT EXECUTE ON FUNCTION public\.beebs_message_jamais_en_ligne\(jsonb, boolean, text\) TO service_role;/.test(M1), "droits : serveur seulement");
ok(/CREATE OR REPLACE FUNCTION public\.trancher_publications_sans_lien/.test(I1) && /Sept jours après le dépôt/.test(I1)
  && /DROP FUNCTION IF EXISTS public\.beebs_preuve_jamais_en_ligne/.test(I1) && /'6ea3fdf30588cf009c3bf3ba50ec1058'/.test(I1)
  && I1.indexOf("CREATE OR REPLACE FUNCTION public.trancher_publications_sans_lien") < I1.indexOf("DROP FUNCTION IF EXISTS public.beebs_preuve_jamais_en_ligne"),
  "inverse : la définition de la prod rendue AVANT que les fonctions partent, md5 relu");
const E1 = lire("scripts/essais/20261029200000_essai.sql");
ok(existsSync(join(RACINE, "scripts/essais/20261029200000_generer.sh")) && /^begin;$/m.test(E1) && /\nrollback;\n$/.test(E1) && !/^commit;$/im.test(E1)
  && E1.includes("beebs_sans_preuve_de_refus_2910"), "essai à blanc : une transaction, ROLLBACK, jamais COMMIT");

console.log("\n4. La migration 20261029201000 (R4) : la vente sans fiche réarme le retrait revu en ligne");
const M2 = lire("supabase/migrations/20261029201000_beebs_rearmer_retrait_vente_sans_fiche.sql");
const I2 = lire("supabase/rollbacks/20261029201000_beebs_rearmer_retrait_vente_sans_fiche_INVERSE.sql");
const RR = sansCom(corps(M2, "retraits_beebs_rearmer_revus"));
ok(/NON APPLIQUÉE/.test(M2) && /'0756d52c09e79dedc45a66971a8ebf2c'/.test(M2) && /'0756d52c09e79dedc45a66971a8ebf2c'/.test(I2), "non appliquée, garde md5, inverse relu");
ok(/where i\.id = dep\.inventaire_id and i\.user_id = dep\.user_id and i\.statut = 'vendu'\)/.test(RR), "fiche présente : la règle d'avant (fiche « vendu »)");
ok(/dep\.inventaire_id is null and j\.inventaire_id is null and dep\.user_id = j\.user_id/.test(RR) && /not \(coalesce\(dep\.platform_fields, '\{\}'::jsonb\) \? 'vente_annulee_remise'\)/.test(RR)
  && /v\.user_id = j\.user_id and v\.inventaire_id is null/.test(RR) && /- interval '2 minutes'/.test(RR) && /\+ interval '2 minutes'/.test(RR)
  && /not in \('', 'beebs'\)/.test(RR) && !/titre|title/i.test(RR),
  "fiche supprimée : SA ligne ventes (même compte, sans fiche, pas Beebs, pas annulée, née à l'armement ± 2 min), aucune annulation sur le dépôt — jamais un titre");
ok(/arme_par,chemin\}' in \('vente_article_serveur', 'vente_copie_prouvee'\)/.test(RR) && /rearme_revu_en_ligne,n\}'\)::int, 0\) < 3/.test(RR) && /limit 20/.test(RR), "chemin d'armement, plafond de 3, 20 par appel : inchangés");
const E2 = lire("scripts/essais/20261029201000_essai.sql");
ok(/^begin;$/m.test(E2) && /\nrollback;\n$/.test(E2) && !/^commit;$/im.test(E2), "essai à blanc : ROLLBACK");

console.log("\n5. La suppression envoyée, gardée et prouvée (R5) — modules partagés");
const ENVOI = "2026-10-26T19:40:00.000Z";
const se = { le: ENVOI, numero: "33911382", vue_en_ligne_avant: { par: "bouton_page", le: ENVOI }, pose_par: "extension (retrait)" };
const annonce = (dates, extra = {}) => ({ page_http: 404, produit: false, regle: BP.REGLE_SUPPRESSION_ENVOYEE_404, suppression_envoyee_le: ENVOI,
  vue_en_ligne_avant: se.vue_en_ligne_avant, constats_404: dates, en_verification: "non_lue", ...extra });
const preuveR = (a) => ({ preuve_retrait: { source: "mes_annonces", absente: true, numero: "33911382", moment: "apres_suppression", annonce: a } });
ok(BP.preuveRetraitBeebsValide(preuveR(annonce(["2026-10-27T08:00:00.000Z", "2026-10-27T15:00:00.000Z"]))), "envoi + deux 404 à 7 h d'écart APRÈS l'envoi : preuve valide (update-job-status)");
ok(!BP.preuveRetraitBeebsValide(preuveR(annonce(["2026-10-27T08:00:00.000Z", "2026-10-27T11:00:00.000Z"]))), "3 h d'écart : refusée");
ok(!BP.preuveRetraitBeebsValide(preuveR(annonce(["2026-10-26T12:00:00.000Z", "2026-10-27T15:00:00.000Z"]))), "un constat d'AVANT l'envoi : refusée");
ok(!BP.preuveRetraitBeebsValide(preuveR(annonce(["2026-10-27T08:00:00.000Z", "2026-10-27T15:00:00.000Z"], { vue_en_ligne_avant: null }))), "sans « vue en ligne avant l'envoi » : refusée");
ok(BP.verdictClotureRetraitBeebs(preuveR(annonce(["2026-10-27T08:00:00.000Z", "2026-10-27T15:00:00.000Z"])), "2026-10-29T20:00:00Z+abc · v0.6.156") === "ok", "verdict de clôture : « ok »");
const retraitJo = { id: "1845ce62", platform: "beebs", action: "delete", status: "pending", platform_listing_id: "33911382", listing_url: "https://www.beebs.app/fr/p/33911382",
  platform_fields: { beebs_suppression_envoyee: se, beebs_404_constats: [c404("2026-10-27T08:00:00.000Z", "non_lue"), c404("2026-10-27T15:00:00.000Z", "non_lue")] } };
const vJo = RA.jugerRetraitDejaAbsent(retraitJo, { depotsBeebs: null });
ok(vJo?.motif === BP.REGLE_SUPPRESSION_ENVOYEE_404 && vJo.preuve?.constats_404?.length === 2 && vJo.delete_confirmed_by === "suppression_envoyee_404",
  "balayage serveur (handler-watch) : Joséphine 1845ce62 — envoi gardé + deux 404 → retrait fait, sans « Mes annonces » complète ni garde de modération", JSON.stringify(vJo));
ok(RA.jugerRetraitDejaAbsent({ ...retraitJo, platform_fields: { ...retraitJo.platform_fields, beebs_suppression_envoyee: undefined } }, { depotsBeebs: null }) === null,
  "sans l'envoi gardé : les constats « en vérification non lue » ne prouvent rien (règle d'avant)");
ok(RA.jugerRetraitDejaAbsent({ ...retraitJo, platform_fields: { ...retraitJo.platform_fields, beebs_suppression_envoyee: { ...se, numero: "33911383" } } }, { depotsBeebs: null }) === null,
  "un envoi gardé pour un AUTRE numéro : rien");
// Pour update-job-status (attente du second constat, pas un essai) — à brancher là-bas (voir le rapport du lot B).
const unConstat = { beebs_suppression_envoyee: se, beebs_404_constats: [c404("2026-10-26T12:00:00.000Z", "non_lue"), c404("2026-10-27T08:00:00.000Z", "non_lue")] };
ok(BP.constats404DuRetraitBeebs(unConstat).length === 1 && BP.constats404DuRetraitBeebs({ beebs_404_constats: unConstat.beebs_404_constats }).length === 0
  && BP.constats404DuRetraitBeebs({ ...unConstat, beebs_404_constats: [c404("2026-10-27T08:00:00.000Z")] }).length === 1,
  "les constats qui font attendre : ceux du 25/10, sinon ceux d'APRÈS l'envoi");
const mAtt = BP.messageRetraitBeebsApresEnvoi404(unConstat, t("2026-10-27T08:05:00Z"));
ok(mAtt === "Suppression envoyée à Beebs le 26/10 à 20h40 : depuis, sa page est introuvable (404, constaté une fois depuis le 27/10 à 09h00) — elle n'est plus achetable. FillSell la relit à partir du 27/10 à 15h02 et clôt alors le retrait — rien à faire.",
  "le message de l'attente : l'envoi daté, le 404 daté, plus achetable", mAtt);

console.log("\n6. L'extension : beebs.js exécuté (preuve après l'envoi, résumé de la lecture)");
const bj = lire("chrome-extension/content-scripts/beebs.js");
const extraire = (nom) => {
  const d = bj.indexOf(`async function ${nom}(`) >= 0 ? bj.indexOf(`async function ${nom}(`) : bj.indexOf(`function ${nom}(`);
  if (d < 0) throw new Error(`${nom} absent de beebs.js`);
  return bj.slice(d, bj.indexOf("\n}\n", d) + 2);
};
const src = [bj.match(/^const REGLE_SUPPRESSION_ENVOYEE_404 = .*$/m)?.[0] ?? "", extraire("produitVenduSurBeebs"), extraire("jugerConstats404Beebs"),
  extraire("jugerConstats404ApresEnvoi"), extraire("resumeLectureMesAnnonces"), extraire("suppressionEnvoyeeDuJob"), extraire("preuveAbsenceMesAnnonces"),
  extraire("preuveRetraitDepuis"), extraire("confirmerRetraitParMesAnnonces")].join("\n");
const fabrique = (lectures, { pageAnnonce = { http: null, produit: false }, index = null } = {}) => {
  let i = 0;
  return new Function("lireIdsMesAnnoncesBeebs", "sleep", "pageAnnonceBeebs", "presenceIndexBeebs",
    `${src}; return { preuveAbsenceMesAnnonces, confirmerRetraitParMesAnnonces, resumeLectureMesAnnonces, suppressionEnvoyeeDuJob };`)(
    async () => lectures[Math.min(i++, lectures.length - 1)], async () => {}, async () => pageAnnonce, async () => index);
};
const illisible = { ok: false, lu_le: "2026-10-27T08:00:00Z", ids: EN_LIGNE, pages: [{ page: "en_verification", ok: false, ids: [], n: 0, http: 403, motif: "vérification anti-robot de Beebs (DataDome)", mur: "anti_robot", cadre: "cadre : page non chargée" },
  { page: "en_ligne", ok: true, ids: EN_LIGNE, n: 60, annoncees: 297, http: 200, par: "page" }] };
const tt = () => {};
const ctx = (constats = []) => ({ constats404: constats, suppressionEnvoyee: { le: ENVOI, vue_en_ligne_avant: se.vue_en_ligne_avant } });
{
  const F = fabrique([illisible], { pageAnnonce: { http: 404, produit: false }, index: true });
  const p1 = await F.preuveAbsenceMesAnnonces("33911382", tt, ctx());
  ok(p1.verdict === "illisible" && p1.lecture.constats404?.length === 1 && p1.lecture.constats404[0].en_verification === "non_lue" && p1.lecture.apres_envoi === true,
    "1er essai après l'envoi : « en vérification » illisible, page 404 → constat noté (rien conclu)", JSON.stringify(p1.lecture.constats404));
  const avant = { ...p1.lecture.constats404[0], le: "2026-10-27T01:00:00.000Z" };
  const p2 = await F.preuveAbsenceMesAnnonces("33911382", tt, ctx([avant]));
  ok(p2.verdict === "absente" && p2.lecture.preuve_annonce?.regle === "suppression_envoyee_deux_404" && p2.lecture.preuve_annonce.suppression_envoyee_le === ENVOI
    && p2.lecture.preuve_annonce.constats_404.length === 2 && BP.preuveSuppressionEnvoyee404Valide(p2.lecture.preuve_annonce),
    "2e constat 6 h et plus après le 1er : RETIRÉE, sans « Mes annonces » complète — preuve acceptée par le serveur", JSON.stringify(p2.lecture.preuve_annonce));
  const r = F.resumeLectureMesAnnonces(illisible, "illisible");
  ok(r.verdict === "illisible" && r.onglets.length === 2 && r.onglets[0].ok === false && r.onglets[0].http === 403 && r.onglets[0].mur === "anti_robot" && /DataDome/.test(r.onglets[0].motif)
    && r.onglets[0].cadre && r.onglets[1].par === "page" && r.onglets[1].n === 60 && r.onglets[1].annoncees === 297 && r.onglets[1].motif === null,
    "R6 : le résumé dit, par onglet, ok / voie / http / motif / lues sur annoncées", JSON.stringify(r));
}
{
  const F = fabrique([illisible], { pageAnnonce: { http: 200, produit: true } });
  const p = await F.preuveAbsenceMesAnnonces("33911382", tt, ctx([c404("2026-10-27T01:00:00.000Z", "non_lue")]));
  ok(p.verdict === "presente" && p.lecture.constats404?.length === 0 && p.lecture.suppression_levee === true, "page 200 avec sa fiche après l'envoi : encore en vente — constats remis à zéro, envoi levé");
  const verifAvecElle = { ...illisible, ids: ["33911382", ...EN_LIGNE], pages: [{ page: "en_verification", ok: true, ids: ["33911382"], n: 1 }, illisible.pages[1]] };
  const pv = await fabrique([verifAvecElle]).preuveAbsenceMesAnnonces("33911382", tt, ctx());
  ok(pv.verdict === "presente" && pv.lecture.suppression_levee === true, "revue « en vérification » après l'envoi : ses 404 ne diraient plus rien — envoi levé");
  const sansEnvoi = await fabrique([illisible], { pageAnnonce: { http: 404, produit: false } }).preuveAbsenceMesAnnonces("33911382", tt, { constats404: [] });
  ok(sansEnvoi.verdict === "illisible" && !(sansEnvoi.lecture.constats404 ?? []).length, "sans envoi gardé : la règle d'avant (« en vérification » illisible → aucun constat)");
  const F2 = fabrique([illisible]);
  ok(F2.suppressionEnvoyeeDuJob({ platform_fields: { beebs_suppression_envoyee: se } }, "33911382")?.le === ENVOI
    && F2.suppressionEnvoyeeDuJob({ platform_fields: { beebs_suppression_envoyee: se } }, "33911383") === null
    && F2.suppressionEnvoyeeDuJob({ platform_fields: { beebs_suppression_envoyee: { ...se, vue_en_ligne_avant: null } } }, "33911382") === null,
    "l'envoi du job : même numéro, vu en ligne avant — sinon ignoré");
  const c = await fabrique([illisible]).confirmerRetraitParMesAnnonces("33911382", tt, { par: "bouton_page" });
  ok(c.success === false && c.suppressionEnvoyee === true && c.suppressionVueEnLigneAvant?.par === "bouton_page" && c.lectureMesAnnonces?.onglets?.length === 2,
    "après l'envoi non prouvé : l'heure, la vue en ligne d'avant et le résumé de la lecture remontent au background", JSON.stringify({ ...c, error: undefined }).slice(0, 300));
}
const dl = bj.slice(bj.indexOf("async function deleteListing(job)"), bj.indexOf("// ⚠️⚠️ AUCUNE MESURE DE LAYOUT DANS CE FICHIER"));
ok(/const envoiDuJob = job\?\.action === "delete" \? suppressionEnvoyeeDuJob\(job, idCible\) : null;/.test(dl)
  && /apresEnvoi \? "apres_suppression" : "deja_absente"/.test(dl) && (dl.match(/return sortieAbsente\(preuve\);/g) ?? []).length === 2,
  "deleteListing : l'envoi du retrait lu ; absente après NOTRE envoi = « apres_suppression » (retirée par FillSell, jamais la garde de modération)");

console.log("\n7. Le background garde l'envoi et le résumé, seulement s'ils changent");
const bg = lire("chrome-extension/background.js");
const bloc = bg.slice(bg.indexOf("BEEBS : LA SUPPRESSION ENVOYÉE ET LA LECTURE DE « MES ANNONCES » SONT GARDÉES"), bg.indexOf("BEEBS : LA SUPPRESSION ENVOYÉE ET LA LECTURE DE « MES ANNONCES » SONT GARDÉES") + 2600);
ok(bloc.length > 100 && bg.indexOf("BEEBS : LA SUPPRESSION ENVOYÉE ET LA LECTURE") > bg.indexOf("LES CONSTATS « PAGE 404 » BEEBS SURVIVENT À TOUT CHEMIN")
  && bg.indexOf("BEEBS : LA SUPPRESSION ENVOYÉE ET LA LECTURE") < bg.indexOf("« ANNONCE INTROUVABLE » PEUT VOULOIR DIRE « DÉJÀ SUPPRIMÉE »"),
  "posés sur la copie mémoire du retrait, avant toute branche (relue par rearmBounded et la clôture)");
ok(/pfS0\.beebs_suppression_envoyee = \{ le: String\(result\.suppressionEnvoyeeLe\), numero: numeroAnnonceRetrait\(job\),\s+vue_en_ligne_avant: result\.suppressionVueEnLigneAvant \?\? null/.test(bloc)
  && /result\.suppressionEnvoyeeLevee === true && pfS0\.beebs_suppression_envoyee/.test(bloc), "l'envoi gardé (le dernier), levé quand l'annonce est revue");
ok(/cleLu0\(lu0\) !== cleLu0\(pfS0\.beebs_lecture_mes_annonces\)/.test(bloc) && /if \(changeS0\) job\.platform_fields = pfS0;/.test(bloc),
  "le résumé écrit seulement s'il change (verdict et onglets ; l'heure seule ne réécrit rien)");

console.log(`\n${ko ? `✗ ${ko} échec(s)` : "✓ tout est vert"} — ${n} contrôles`);
process.exit(ko ? 1 : 0);
