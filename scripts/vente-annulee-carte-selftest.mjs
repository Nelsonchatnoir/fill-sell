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

const carte = lire("src/components/VentesAnnulees.jsx");
ok(/Vente annulée/.test(carte) && (carte.match(/<button/g) ?? []).length === 1, "la carte : « Vente annulée », UN seul bouton");
ok(/v\.etat === 'proposee' && \(/.test(carte), "le bouton n'existe que tant que la remise est proposée");
const app = lire("src/App.jsx");
ok(/supabase\.rpc\('ventes_annulees_a_remettre'\)/.test(app) && /supabase\.rpc\('remettre_en_vente_apres_annulation',\{p_inventaire:v\.inventaire_id\}\)/.test(app),
  "l'app lit les propositions et l'appui passe par la base (aucun autre circuit)");
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

console.log(`vente-annulee-carte-selftest : ${n} contrôles verts`);
