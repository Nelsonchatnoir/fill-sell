// selftest:vente-annulee-carte — (24/10 soir, décision de Nico) Après une vente annulée, PAS de remise en vente
// automatique : la carte « Vente annulée — Remettre en vente ? », UN bouton ; un appui remet l'article en vente sur
// Vinted et partout où il avait été retiré, hors quota, après un relevé (déjà remis en ligne par le vendeur → rattaché).
//   npm run selftest:vente-annulee-carte
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { texteVenteAnnulee } from "../src/utils/venteAnnulee.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
console.log("vente-annulee-carte-selftest");

const v = { inventaire_id: 1, titre: "Short", plateformes: ["beebs", "leboncoin", "vinted"], etat: "proposee" };
ok(texteVenteAnnulee(v) === "Remettre en vente sur Beebs, Leboncoin, Vinted ?", "proposée : la question, avec TOUTES les plateformes");
ok(texteVenteAnnulee({ ...v, etat: "en_cours" }).startsWith("Remise en vente en cours"), "après l'appui : en cours");
ok(/rattachée, rien n’a été republié/.test(texteVenteAnnulee({ ...v, etat: "deja_en_vente" })), "déjà remis en ligne par le vendeur : rattachée, rien republié");
ok(texteVenteAnnulee(v, "en") === "List again on Beebs, Leboncoin, Vinted?", "anglais");

// (07/11, Ornella) Une remise fermée par la base dit POURQUOI ; le choix de la personne aussi.
ok(/autre fiche de ton stock : rien n’a été remis en vente/.test(texteVenteAnnulee({ ...v, etat: "abandonnee", motif: "vendu_sous_autre_fiche" })), "fermée : vendu sous une autre fiche");
ok(/autre fiche de ton stock : rien n’a été republié/.test(texteVenteAnnulee({ ...v, etat: "abandonnee", motif: "deja_en_vente_autre_fiche" })), "fermée : déjà en ligne sous une autre fiche");
ok(/n’est plus dans ton stock/.test(texteVenteAnnulee({ ...v, etat: "abandonnee", motif: "plus_en_stock" })), "fermée : plus en stock");
ok(texteVenteAnnulee({ ...v, etat: "abandonnee", motif: "choix_personne" }) === "Tu as choisi de ne pas le remettre en vente."
  && texteVenteAnnulee({ ...v, etat: "abandonnee", motif: "choix_personne" }, "en") === "You chose not to list it again.", "fermée : le choix de la personne (FR/EN)");
ok(/^Remise en vente arrêtée/.test(texteVenteAnnulee({ ...v, etat: "abandonnee", motif: "plus_de_stock" })), "un autre motif : le texte d'avant");

const carte = lire("src/components/VentesAnnulees.jsx");
ok(/Vente annulée/.test(carte) && (carte.match(/<button/g) ?? []).length === 2 && /'Remettre en vente'/.test(carte) && /'Ne pas remettre en vente'/.test(carte),
  "la carte : « Vente annulée », DEUX boutons : « Remettre en vente », « Ne pas remettre en vente » (07/11)");
ok(/v\.etat === 'proposee' && \(/.test(carte) && (carte.match(/v\.etat === 'proposee'/g) ?? []).length === 1, "les boutons n'existent que tant que la remise est proposée");
ok(/onRemettre\?\.\(v, \{ remettre: false \}\)/.test(carte), "« Ne pas remettre » passe par le même rappel (aucune prop neuve au Stock)");
const app = lire("src/App.jsx");
ok(/supabase\.rpc\('ventes_annulees_a_remettre'\)/.test(app) && /supabase\.rpc\('remettre_en_vente_apres_annulation',\{p_inventaire:v\.inventaire_id\}\)/.test(app),
  "l'app lit les propositions et l'appui passe par la base (aucun autre circuit)");
ok(/if\(opts\?\.remettre===false\)\{\s*const\{data,error\}=await supabase\.rpc\('ventes_annulees_ne_pas_remettre',\{p_inventaire:v\.inventaire_id\}\);/.test(app),
  "« Ne pas remettre en vente » : rpc ventes_annulees_ne_pas_remettre, rien d'autre");
// (24/10 nuit, Nico) La carte vit dans « À régler » du Stock : une ligne comptée, son écran.
const stock = lire("src/tabs/StockTab.jsx");
ok(/<VentesAnnulees lang=\{lang\} ventes=\{ventesAnnulees\}/.test(stock) && stock.includes("cle: 'ventes_annulees', n: nbVentesAnnulees")
  && stock.includes("+ nbAlertesCompte + nbVentesAnnulees;") && !/<VentesAnnulees /.test(app), "la carte est dans « À régler » (ligne comptée et écran), plus sur la page");

// La base : rien d'automatique, l'appui seul fait partir la remise, hors quota, après un relevé.
const mig = lire("supabase/migrations/20261024234000_vinted_annulee_remise_en_vente_hors_quota.sql");
ok((mig.match(/VALUES \(v\.user_id, i\.id, v_copie\.platform, v_copie\.depot, now\(\), 'proposee'\)/g) ?? []).length === 2,
  "Vinted et Leboncoin : les copies retirées sont PROPOSÉES, jamais « à faire »");
ok(!/VALUES \(v\.user_id, i\.id, v_copie\.platform, v_copie\.depot, now\(\) \+ interval '2 minutes'\)/.test(mig), "plus aucune remise automatique après annulation");
ok(/UPDATE remises_en_vente r SET statut = 'a_faire', accepte_le = now\(\)/.test(mig), "l'appui passe les propositions « à faire »");
ok(/IF v_motif IS NULL AND NOT v_annul THEN\s*\n\s*v_place := remise_en_vente_place/.test(mig), "hors quota");
ok(/public\.releve_apres_annulation\(r\.user_id, r\.platform,/.test(mig) && /v_motif := 'releve_attendu';/.test(mig), "un relevé fait après l'appui avant de republier");

// (07/11, Ornella) Une proposition se ferme quand l'article n'est plus à remettre — jamais sur un titre.
const mig2 = lire("supabase/migrations/20261107150000_ventes_annulees_fermeture.sql");
const inv2 = lire("supabase/rollbacks/20261107150000_ventes_annulees_fermeture_INVERSE.sql");
const jum = mig2.slice(mig2.indexOf("CREATE OR REPLACE FUNCTION public.fiche_jumelle_prouvee"), mig2.indexOf("CREATE OR REPLACE FUNCTION public.remise_annulee_jumelle_fermer"));
ok(jum.length > 500 && !/titre/.test(jum.replace(/--.*$/gm, "")) && /bit_count\(pt\.d # ef\.d\) <= 4/.test(jum) && /\(SELECT count\(\*\) FROM prouvees\) = 1/.test(jum)
  && /s\.status = 'active' AND s\.captured_at >= c\.apparue/.test(jum) && /LEAST\(t\.created_at, t\.first_seen_at\) > p_apres/.test(jum)
  && jum.includes("AND (t.origine = 'vinted_sync' OR t.origine LIKE 'releve\\_%')"),
  "jumelle prouvée : née d'un relevé, photos (dHash ≤ 4), une seule, jamais en ligne ensemble, apparue après la vente — aucun titre lu");
// (07/11, décision de Nico) Seules les preuves SOLIDES ferment : plus jamais « 1 photo suffit » (la spatule de 02ca0f20 reste).
ok(/WHERE cm\.n >= 2 AND cm\.deux_differentes AND k\.nt >= 2 AND k\.nf >= 2 AND 2 \* cm\.n >= k\.nt AND 2 \* cm\.n >= k\.nf/.test(jum)
  && /bit_count\(q\.td # p\.td\) > 4 AND bit_count\(q\.fd # p\.fd\) > 4/.test(jum) && /AND \(SELECT count\(\*\) FROM communes\) = 1/.test(jum)
  && !/cm\.n >= 1/.test(jum) && !/<= 1\)/.test(jum.replace(/--.*$/gm, "").replace(/COALESCE\([a-z.]+quantite, 1\) <= 1/g, "")),
  "preuve solide : ≥ 2 photos de chaque côté, ≥ 2 photos communes différentes, la moitié de chaque fiche, aucune autre ressemblance — jamais une seule photo");
ok(/motif = 'plus_en_stock'/.test(mig2) && /'vendu_sous_autre_fiche'/.test(mig2) && /'deja_en_vente_autre_fiche'/.test(mig2)
  && /IF v_motif IS NULL AND v_annul THEN\s*\n\s*BEGIN\s*\n\s*v_jum := public\.remise_annulee_jumelle_fermer\(r\.user_id, r\.inventaire_id\);/.test(mig2),
  "tick : hors stock « plus_en_stock », jumelle (avant l'appui ET juste avant de créer la publication)");
ok(/ORDER BY random\(\)\s*\n\s*LIMIT 50/.test(mig2), "pré-fermeture bornée (50 fiches par passage)");
ok(/motif = 'choix_personne'/.test(mig2) && /WHERE r\.user_id = v_user AND r\.inventaire_id = p_inventaire AND r\.statut = 'proposee'/.test(mig2)
  && /GRANT EXECUTE ON FUNCTION public\.ventes_annulees_ne_pas_remettre\(bigint\) TO authenticated;/.test(mig2)
  && /REVOKE ALL ON FUNCTION public\.ventes_annulees_ne_pas_remettre\(bigint\) FROM PUBLIC, anon, service_role;/.test(mig2),
  "« Ne pas remettre » : le compte appelant, cette fiche, authenticated seulement");
ok(/AND i\.fusionne_dans IS NULL AND i\.statut = 'stock' AND COALESCE\(i\.quantite, 1\) > 0/.test(mig2), "l'écran : une fiche hors stock ou fondue ne s'affiche plus");
ok(!/\bCOMMIT\b|\bBEGIN;/.test(mig2) && /8727977d992fbdf357f76718908554ca/.test(mig2) && /8727977d992fbdf357f76718908554ca/.test(inv2)
  && /DROP FUNCTION IF EXISTS public\.ventes_annulees_ne_pas_remettre\(bigint\);/.test(inv2), "garde md5 de prod, aucun COMMIT, inverse qui retire les fonctions nouvelles");

// (07/11, Ornella — pull rayé) L'article remis en ligne après une vente annulée sous une fiche NEUVE : la QUESTION, jamais
// une fusion (migration 20261107160000, preuve : scripts/preuve-remise-apres-annulation-question.mjs).
const mig3 = lire("supabase/migrations/20261107160000_remise_apres_annulation_question.sql");
const inv3 = lire("supabase/rollbacks/20261107160000_remise_apres_annulation_question_INVERSE.sql");
const corps = (src, nom) => { const a = src.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`); return a < 0 ? "" : src.slice(a, src.indexOf("$function$;", a)); };
const rp = corps(mig3, "rapprochement_v3_remise_possible"), fp = corps(mig3, "inventaire_fusionner_pour");
const branche = rp.slice(rp.indexOf("LA REMISE EN LIGNE APRÈS UNE VENTE ANNULÉE"), rp.indexOf("RETURN 'vente_annulee_question';") + 40);
ok(branche.length > 200 && /RETURN 'vente_annulee_question';/.test(branche) && !/RETURN NULL/.test(branche)
  && /NOT COALESCE\(public\.vinted_remise_en_ligne\(m\.id, n\.id\), false\)/.test(branche),
  "remise_possible : la vente annulée rend 'vente_annulee_question' (jamais NULL = jamais la fusion automatique), seulement là où la règle d'avant ne relie rien");
ok(/v_remise_annulee := v_geste AND COALESCE\(public\.vinted_remise_apres_annulation\(p_garde, p_absorbe\), false\);/.test(fp)
  && (fp.match(/v_remise_annulee/g) ?? []).length === 4,
  "inventaire_fusionner_pour : la variante sur le SEUL geste de la personne (« Oui », fusion à la main), lue une fois");
const neuves = ["vente_annulee_prouvee", "vinted_remise_apres_annulation", "remise_annulee_question_poser", "remise_annulee_questions"].map((x) => corps(mig3, x));
ok(neuves.every((c) => c.length > 100 && !/inventaire_fusionner|rapprochement_v3_appliquer|armer_retrait|UPDATE |DELETE /.test(c.replace(/--.*$/gm, "")))
  && /releve_poser_question\(p_user, p_fiche, v_jumelle, 'remise_en_ligne_vente_annulee'/.test(neuves[2]) && /LIMIT GREATEST\(1, LEAST\(COALESCE\(p_limite, 20\), 50\)\)/.test(neuves[3]),
  "les quatre fonctions nouvelles : aucune fusion, aucun retrait, aucune mise à jour — la question seulement, bornée");
ok(!/CREATE OR REPLACE FUNCTION public\.(vinted_remise_en_ligne|rapprochement_v3_appliquer|inventaire_doublon_evaluer|inventaire_doublons_pour|doublons_fiches_a_examiner)\(/.test(mig3)
  && /md5\(v_d\) <> '803a52270730966e7e641a03c6c9164b'/.test(mig3) && /md5\(v_d\) <> 'f457e0714933c5b52d57d4dae3ce3d57'/.test(mig3)
  && /aee9bcf5f16349c99b5349b60cddffcd/.test(inv3) && /DROP FUNCTION IF EXISTS public\.vente_annulee_prouvee\(uuid, bigint\);/.test(inv3) && !/\bCOMMIT\b|\bBEGIN;/.test(mig3),
  "C : vinted_remise_en_ligne et ses appelants, appliquer intouchés ; garde md5 (B appliquée, appliquer de prod) ; inverse de prod");

console.log(`vente-annulee-carte-selftest : ${n} contrôles verts`);
