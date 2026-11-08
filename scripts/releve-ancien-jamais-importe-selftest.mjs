// UNE ANNONCE QUE LE DERNIER RELEVÉ N'A PAS REVUE N'ENTRE JAMAIS AU STOCK ; UN COMPTE QUI CHANGE NE FAIT PAS UNE
// QUESTION PAR ANNONCE (08/11, ayadi007)
//   node scripts/releve-ancien-jamais-importe-selftest.mjs
// Cas : après « Réinitialiser » (11:00:38, 11:26:08), 116 annonces Leboncoin vues le 07/11 à 20:59 réimportées à 11:04
// et 11:28 alors que les relevés du jour lisaient 0 annonce (compte bloqué ou changé). Et dès que deux relevés probants
// liront le nouveau compte, les 117 annonces de l'ancien auraient chacune leur « Vendue ? ».
// Gardé ici : le moteur (passe / construireNoeuds) ne fait ni fiche ni rattachement d'une annonce « perimee » sans fiche ;
// rapprochement_v3_lire calcule « perimee » sur le DERNIER relevé terminé de la plateforme ; constater_absences_releve
// rend « compte_change_ou_vide » sans dater ni questionner (≥ 5 absentes, aucune continuité). Preuve de bout en bout sur
// la prod (base jetable) : scripts/preuve-ayadi-0811.mjs.
import fs from "node:fs";
import { passe } from "../supabase/functions/_shared/rapprochement/passe.js";
import { construireNoeuds } from "../supabase/functions/_shared/rapprochement/moteur.js";

const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${JSON.stringify(d).slice(0, 600)}` : ""}`); } };

console.log("1. Le moteur");
const an = (id, titre, extra) => ({ id, platform: "leboncoin", listing_id: "L" + id, url: `https://www.leboncoin.fr/ad/x/${id}`, titre, prix: 50,
  photos: [], inventaire_id: null, ignoree: false, source: null, run_id: "r1", en_ligne: true, hors_liste: false, ebay_bloque: false, geste: true, ...extra });
const donnees = (annonces) => ({ user_id: "u", fiches: [{ id: "77", titre: "Costume quatre pièces garçon", prix: 40, statut: "stock", origine: "releve_leboncoin", photos: [] }],
  annonces, fusions: [], doublons: [], vinted_a_juger: [], fiches_main_a_juger: [], vinted_nouvelles: [], import_ouvert: true, geste_recent: true });
const D = donnees([
  an("a1", "Lustre LED deux anneaux", { perimee: true }),
  an("a2", "Pompe à eau de mer Mercruiser", { perimee: false }),
  an("a3", "Tapis de chambre enfant", {}),
  an("a4", "Costume quatre pièces garçon", { perimee: true, inventaire_id: "77" }),
]);
const plan = passe(D, new Map(), { mode: "normal" }).decisions;
const cree = (id) => plan.some((p) => p.type === "creer" && p.annonce === id);
ok(!cree("a1"), "annonce SANS fiche que le dernier relevé n'a pas revue (perimee) : aucune fiche", plan);
ok(cree("a2") && cree("a3"), "annonce revue (perimee false) ou champ absent (base d'avant) : créée comme avant", plan);
ok(!plan.some((p) => (p.annonces ?? []).includes("a1") || p.annonce === "a1" || p.a?.annonce === "a1" || p.b?.annonce === "a1"), "… et aucune autre décision (ni rattachement, ni question) sur elle");
const N = construireNoeuds(D, () => []);
ok(!N.some((x) => x.id === "Aa1") && N.some((x) => x.id === "Aa4"), "construireNoeuds : l'orpheline périmée est écartée, la rattachée périmée reste lue (preuves du graphe)");
const moteur = lire("supabase/functions/_shared/rapprochement/moteur.js");
ok(/if \(a\.perimee === true && !a\.inventaire_id\) continue;/.test(moteur), "la règle, en une ligne, à l'entrée des annonces (comme « hors_liste »)");

console.log("\n2. rapprochement_v3_lire (migration 20261108141000)");
const m2 = lire("supabase/migrations/20261108141000_releve_ancien_jamais_importe.sql");
ok(/WITH derniers AS \(\s*SELECT DISTINCT ON \(r\.platform\) r\.platform, r\.id, r\.started_at\s*FROM vinted_sync_runs r\s*WHERE r\.user_id = p_user AND r\.kind = 'annonces' AND r\.status = 'done' AND r\.started_at IS NOT NULL\s*ORDER BY r\.platform, r\.started_at DESC/.test(m2),
  "le DERNIER relevé terminé (« done ») de chaque plateforme du compte (DISTINCT ON avec son ORDER BY)");
ok(/'perimee', dr\.id IS NOT NULL AND a\.run_id IS DISTINCT FROM dr\.id\s*AND COALESCE\(a\.vu_le, a\.created_at\) < dr\.started_at - interval '10 minutes'/.test(m2),
  "perimee = il existe, ne l'a pas revue (run_id), et elle n'a pas été vue depuis son début (10 min de marge)");
ok(/LEFT JOIN derniers dr ON dr\.platform = a\.platform/.test(m2) && /md5\(v_d\) <> 'a0aeaefb68d34d9120949df2cc5c79cb'/.test(m2), "jointure par plateforme ; garde md5 de la prod du 08/11");
ok(fs.existsSync(new URL("../supabase/rollbacks/20261108141000_releve_ancien_jamais_importe_INVERSE.sql", import.meta.url)), "inverse présent");

console.log("\n3. constater_absences_releve (migration 20261108144000)");
const m5 = lire("supabase/migrations/20261108144000_compte_change_sans_vendue.sql");
const bloc = m5.slice(m5.indexOf("(08/11, ayadi007) UN COMPTE QUI A CHANGÉ"), m5.indexOf(" FOR a IN"));
ok(/IF v_cand>=5 AND NOT EXISTS \(SELECT 1 FROM annonces_plateforme x\s*WHERE x\.user_id=r\.user_id AND x\.platform=r\.platform AND x\.run_id IN \(r\.id, precedent\.id\) AND x\.created_at<v_derniere\) THEN/.test(bloc),
  "≥ 5 annonces absentes ET aucune annonce vue par les deux relevés connue avant leur dernière vue");
ok(/RETURN jsonb_build_object\('disparues',0,'motif','compte_change_ou_vide'/.test(bloc) && !/UPDATE annonces_plateforme|UPDATE cross_post_jobs/.test(bloc),
  "… rend « compte_change_ou_vide » AVANT la boucle : rien daté, aucun « Vendue ? »");
ok(/feature='releve_compte_change'[\s\S]*INSERT INTO usage_logs/.test(bloc), "une trace par relevé (releve_compte_change), sans doublon");
ok(m5.indexOf("UN COMPTE QUI A CHANGÉ") > m5.indexOf("'second_releve_attendu'") && /md5\(v_d\) <> 'd36984b5c0fc70a5251059b5703f0404'/.test(m5),
  "placée après « second relevé attendu » (la paire de relevés reste exigée) ; garde md5 de la prod du 08/11");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — jamais d'import sur un relevé ancien, jamais 117 « Vendue ? » pour un compte changé`);
process.exit(ko ? 1 : 0);
