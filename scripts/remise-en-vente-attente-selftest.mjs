// ═══════════════════════════════════════════════════════════════════════════
// Selftest « Leboncoin : la remise en vente attend que l'annonce vendue soit hors ligne » (06/11, Nico, règle A)
//   node scripts/remise-en-vente-attente-selftest.mjs
// LE CAS : Louis, 7 remises Leboncoin déposées à 07:22-07:29 alors que les annonces vendues (transaction « Achat en
// cours ») étaient encore actives — refusées par Leboncoin (« annonce identique déjà en ligne »).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { remiseAAttendre, annonceVendueDeLaRemise, annonceVendueEncoreEnLigne, PLATEFORMES_REMISE_APRES_DISPARITION } from "../supabase/functions/_shared/remise-en-vente-attente.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const remise = (o = {}) => ({ platform: "leboncoin", action: "publish", status: "pending",
  platform_fields: { remise_en_vente: { annonce_vendue: "3297400164", vente: "annonce:leboncoin:3297400164", restant: 9996 } }, ...o });

console.log("1. Qui attend");
ok("une remise Leboncoin (numéro de l'annonce vendue connu)", remiseAAttendre(remise()) && annonceVendueDeLaRemise(remise()) === "3297400164");
ok("une publication Leboncoin ordinaire : jamais", !remiseAAttendre({ platform: "leboncoin", action: "publish", platform_fields: {} }));
ok("une remise Vinted, Beebs, eBay, Depop : jamais (seul Leboncoin refuse un dépôt identique)",
  ["vinted", "beebs", "ebay", "depop"].every((p) => !remiseAAttendre(remise({ platform: p }))) && JSON.stringify(PLATEFORMES_REMISE_APRES_DISPARITION) === '["leboncoin"]');
ok("une remise sans numéro d'annonce vendue : jamais retenue (rien à surveiller)", !remiseAAttendre(remise({ platform_fields: { remise_en_vente: { vente: "x" } } })));

console.log("2. Quand l'annonce vendue est-elle encore en ligne ?");
ok("relevée en ligne, sous transaction (Leboncoin la garde « active ») : oui", annonceVendueEncoreEnLigne({ statut_plateforme: "en_ligne", disparu_le: null }));
ok("relevée disparue : non (la remise part)", !annonceVendueEncoreEnLigne({ statut_plateforme: "en_ligne", disparu_le: "2026-11-07T08:00:00Z" }));
ok("retirée : non", !annonceVendueEncoreEnLigne({ statut_plateforme: "en_ligne", retiree_le: "2026-11-07T08:00:00Z" }));
ok("aucune ligne au relevé : non (rien ne prouve qu'elle est là)", !annonceVendueEncoreEnLigne(null));

console.log("3. Branchement (get-pending-jobs)");
const gpj = readFileSync(join(ROOT, "supabase/functions/get-pending-jobs/index.ts"), "utf8");
ok("les remises retenues sortent de la file, sans écriture ni message",
  /const retenuesR = new Set\(remises\.filter\(\(j\) => enLigne\.has\(`\$\{j\.platform\}:\$\{annonceVendueDeLaRemise\(j\)\}`\)\)\.map\(\(j\) => String\(j\.id\)\)\);/.test(gpj)
  && /out = out\.filter\(\(j\) => !retenuesR\.has\(String\(j\.id\)\)\);/.test(gpj));
const bloc = gpj.slice(gpj.indexOf("let heldRemisesLbc = 0;"), gpj.indexOf("// ── SESSION PLATEFORME CONNUE MORTE"));
ok("le bloc n'écrit rien sur la tâche (aucun update)", bloc.length > 100 && !/\.update\(/.test(bloc));

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
