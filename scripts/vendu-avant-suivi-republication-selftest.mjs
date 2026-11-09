// ═══════════════════════════════════════════════════════════════════════════
// LE BADGE « VENDU » LEBONCOIN D'AVANT LE SUIVI N'EST JAMAIS UNE VENTE, ET LE REFUS GARDE SON MOTIF (09/11, point 1 de Nico)
// `npm run selftest:vendu-avant-suivi-republication`
// ═══════════════════════════════════════════════════════════════════════════
// assopmfrance (Pro), remise en avant groupée du 08/11 21:17 et 21:19 : « Écusson pm 123 » (Leboncoin 3260078076) refusée
// « annonce_introuvable ». Le serveur avait dit « vendue » (motif annonce_vendue), la trace de l'app ne le gardait pas. La
// vente datait d'AVANT le suivi (« Vendu » dès la première lecture de l'import) et l'annonce manque à cinq relevés complets :
// refuser était juste, « vendue » ne l'était pas. Ailleurs, le même badge lu par la veille de l'extension (sale_signal
// 'sold') refusait À TORT 11 annonces importées EN LIGNE (christopher.boyer30, jordy.rouleau, lupilou999).
// Ce test prouve :
//   1. la trace du refus garde reason:motif et la phrase du serveur (règle pure, cas réel) ;
//   2. les deux chemins de l'app (republier, republier_lot) l'emploient ;
//   3. la migration 20261109010000 : garde md5 de la prod, CTE avant_suivi lue par les DEUX branches, chaque ligne de la
//      prod gardée ; l'inverse = le corps de la prod, mot pour mot ;
//   4. avec PREUVE_PG (Postgres jetable), le banc complet (avant / après / inverse) ;
//   5. le test mord.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { traceRefusRepublication } from "../src/utils/traceRefusRepublication.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. LA TRACE D'UN REFUS GARDE LE MOTIF DU SERVEUR");
{
  // La réponse réelle du serveur pour l'Écusson (spend_coins_and_republish, branche « annonce partie »).
  const reel = { success: false, allowed: false, reason: "annonce_introuvable", motif: "annonce_vendue", platform: "leboncoin", annonce: "3260078076",
    message: "Republication pas lancée : cette annonce Leboncoin est vendue. Rien n'a été décompté." };
  const t = traceRefusRepublication(reel);
  ok(t.motif === "annonce_introuvable:annonce_vendue", "le motif garde la cause du serveur (annonce_introuvable:annonce_vendue)", t.motif);
  ok(/est vendue/.test(t.message ?? ""), "la phrase du serveur est gardée (message, et non error vide)", String(t.message));
  ok(t.annonce === "3260078076", "le numéro d'annonce est gardé");
  const sans = traceRefusRepublication({ success: false, reason: "annonce_introuvable", platform: "beebs" });
  ok(sans.motif === "annonce_introuvable" && sans.message === null, "sans motif du serveur : le motif d'avant, à l'identique");
  ok(traceRefusRepublication({ success: false, error: "Failed to fetch" }).motif === "refus", "une coupure (sans reason) : « refus », message gardé");
  ok(traceRefusRepublication({ success: false, error: "Failed to fetch" }).message === "Failed to fetch", "…avec son texte");
  ok(traceRefusRepublication({ success: false, reason: "x", message: "y".repeat(400) }).message.length === 160, "message borné à 160 caractères");
}

console.log("\n2. LES DEUX CHEMINS DE L'APP L'EMPLOIENT");
{
  const stock = lire("src/tabs/StockTab.jsx");
  ok(/action: 'republier', motif: t\.motif/.test(stock), "republier (à l'unité) : motif du serveur");
  ok(/action: 'republier_lot', motif: t\.motif/.test(stock), "republier_lot (remise en avant groupée) : motif du serveur");
  ok(!/action: 'republier(?:_lot)?', motif: String\(res\.reason/.test(stock), "plus aucun refus de republication tracé sur reason seul");
  ok(/import \{[^}]*traceRefusRepublication[^}]*\} from '\.\.\/utils\/republication'/.test(stock), "importé depuis utils/republication");
}

console.log("\n3. LA MIGRATION 20261109010000 ET SON INVERSE");
{
  const mig = lire("supabase/migrations/20261109010000_vendu_avant_suivi_jamais_une_vente.sql");
  const inv = lire("supabase/rollbacks/20261109010000_vendu_avant_suivi_jamais_une_vente_INVERSE.sql");
  const prod = lire("scripts/essais/fixtures/prod-0911-vendu-avant-suivi/republication_annonce_partie.sql").replace(/;\n*$/, "");
  ok(/md5\(v_d\) <> '00b2218f3ded96d364f83b8f7d1aebae'/.test(mig), "garde : la définition de prod relue le 09/11 (md5)");
  ok(/avant_suivi AS \(/.test(mig), "la CTE avant_suivi existe");
  ok((mig.match(/AND NOT COALESCE\(\(SELECT s\.oui FROM avant_suivi s\), false\)\)/g) ?? []).length === 2, "les DEUX branches de la vente la lisent (relevé et page)");
  ok(/public\.leboncoin_vendu_avant_suivi\(p_user, lid\.id\)/.test(mig) && /p_platform = 'leboncoin'/.test(mig), "Leboncoin seulement, règle du 03/11 soir");
  ok(/statut_plateforme = 'en_ligne' AND a\.disparu_le IS NULL\)\s*\n\s*OR \(EXISTS/.test(mig), "vue en ligne (08/11) OU née hors FillSell");
  ok(/AND x\.action IN \('publish', 'republish'\)\s*\n\s*AND COALESCE\(x\.platform_fields ->> 'source', ''\) <> 'releve'/.test(mig),
    "un numéro porté par un dépôt de FillSell n'est jamais « né hors FillSell »");
  // Chaque ligne de la prod gardée (la migration n'ajoute que des lignes) ; les deux lignes qui ferment une branche ne
  // perdent que leur parenthèse fermante, reprise par la condition ajoutée.
  const sansParen = (l) => l.replace(/\)+$/, "");
  const lignesMig = new Set(mig.split("\n").map(sansParen));
  const perdues = prod.split("\n").filter((l) => l.trim() && !lignesMig.has(sansParen(l)));
  ok(perdues.length === 0, "chaque ligne de la définition de prod est gardée", perdues.slice(0, 3).join(" | "));
  ok(inv.includes(prod) && !/avant_suivi AS \(/.test(inv), "l'inverse = la définition de prod, mot pour mot");
  ok(!/\bBEGIN;|\bCOMMIT;/.test(mig), "ni BEGIN ni COMMIT : appliquée une fois, sur feu vert");
}

console.log("\n4. LE BANC SUR POSTGRES JETABLE");
if (process.env.PREUVE_PG) {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/essais/20261109010000_banc.mjs")], { encoding: "utf8", env: process.env, timeout: 240_000 });
  ok(r.status === 0 && /banc 20261109010000 vert/.test(r.stdout), "banc avant / après / inverse vert", (r.stdout + r.stderr).slice(-600));
} else {
  console.log("  (PREUVE_PG absent : banc non joué ici — PREUVE_PG=embarque npm run selftest:vendu-avant-suivi-republication)");
}

console.log("\n5. LE TEST MORD");
{
  // L'ancienne trace (reason seul, res.error) perdait le motif : le contrôle 1 la refuserait.
  const ancienne = (res) => ({ motif: String(res.reason ?? "refus"), message: res.error ? String(res.error).slice(0, 160) : null });
  const a = ancienne({ reason: "annonce_introuvable", motif: "annonce_vendue", message: "… est vendue." });
  ok(a.motif !== "annonce_introuvable:annonce_vendue" && a.message === null, "l'ancienne trace aurait échoué (motif perdu, message vide)");
  const prod = lire("scripts/essais/fixtures/prod-0911-vendu-avant-suivi/republication_annonce_partie.sql");
  ok(!/avant_suivi AS \(/.test(prod), "le corps de la prod n'a pas la règle (le contrôle 3 le distingue)");
}

if (ko) { console.error(`\n✗ ${ko} contrôle(s) en échec`); process.exit(1); }
console.log("\n✓ vendu-avant-suivi-republication : tout est vert");
