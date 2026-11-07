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

console.log(`vente-annulee-carte-selftest : ${n} contrôles verts`);
