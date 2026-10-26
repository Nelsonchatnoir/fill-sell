// ═══════════════════════════════════════════════════════════════════════════
// LA PREMIÈRE SYNCHRO PART SEULE (26/10, Azizak Shop — Nico) — `npm run selftest:premiere-synchro`
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const P = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/premiere-synchro.js")).href);
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };

const maintenant = Date.parse("2026-10-26T15:30:00Z");
// Azizak : inscrit à 11:27 (Paris), 5 plateformes choisies, Vinted connecté, aucun relevé.
const azizak = { inscritLe: "2026-10-26T10:27:45Z", platformSettings: { plateformes_vendeur: ["vinted", "leboncoin", "ebay", "beebs", "depop"] }, sessions: { vinted: true }, runs: [], maintenant };
console.log("1. La décision");
ok(P.premiereSynchroAPoser(azizak).join() === "vinted", "Azizak : la première synchro Vinted part seule", P.premiereSynchroAPoser(azizak).join());
ok(P.premiereSynchroAPoser({ ...azizak, sessions: { vinted: true, leboncoin: true, beebs: false } }).join() === "vinted,leboncoin", "chaque plateforme choisie ET connectée");
ok(P.premiereSynchroAPoser({ ...azizak, runs: [{ declencheur: "bouton" }] }).length === 0, "une synchro déjà demandée (bouton) : rien — une fois par compte");
ok(P.premiereSynchroAPoser({ ...azizak, runs: [{ declencheur: "app" }] }).length === 0 && P.premiereSynchroAPoser({ ...azizak, runs: [{ declencheur: "bouton_distant:redemande" }] }).length === 0, "… ni après une demande de l'app ou une redemande");
ok(P.premiereSynchroAPoser({ ...azizak, runs: [{ declencheur: "cron" }, { declencheur: "veille:vinted" }] }).join() === "vinted", "un relevé de VEILLE n'est pas une synchro : la première part quand même");
ok(P.premiereSynchroAPoser({ ...azizak, sessions: {} }).length === 0, "aucune plateforme connectée : rien");
ok(P.premiereSynchroAPoser({ ...azizak, inscritLe: "2026-10-01T10:00:00Z" }).length === 0, "inscrit il y a plus de 15 jours : rien (jamais un import surprise chez un ancien)");
ok(P.premiereSynchroAPoser({ ...azizak, reglage: { actif: false } }).length === 0, "interrupteur coupé (coin_config) : rien");
ok(P.premiereSynchroAPoser({ ...azizak, platformSettings: {}, sessions: { vinted: true, beebs: true } }).join() === "vinted,beebs", "aucune plateforme choisie (étape passée) : celles où l'extension voit une session");

console.log("\n2. Le code livré");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const bloc = gpj.slice(gpj.indexOf("LA PREMIÈRE SYNCHRO PART SEULE"), gpj.indexOf("LA PREMIÈRE SYNCHRO PART SEULE") + 4000);
ok(/userClient\.rpc\("demander_sync_dressing"\)/.test(bloc) && /userClient\.rpc\("demander_sync_plateforme", \{ p_platform: pf \}\)/.test(bloc), "les MÊMES demandes que le bouton, au nom de la personne");
ok(/feature: "premiere_synchro_auto"/.test(bloc), "tracé (usage_logs premiere_synchro_auto)");
ok(gpj.indexOf("LA PREMIÈRE SYNCHRO PART SEULE") < gpj.indexOf("await userClient.rpc(\"purger_ma_sync_queue\")"), "posée AVANT la lecture des demandes : elle part dans ce même passage");
const st = lire("src/tabs/StockTab.jsx");
ok(/const blocage = !peutLancer && sondeFinie && capaciteConnue;/.test(st), "la carte « Installe l'extension » ne parle que si la base confirme l'absence");
ok(/demarrerRelecture\(async \(\) => \{\s*if \(Date\.now\(\) - debut > 10 \* 60_000\)/.test(st), "la capacité se relit (bornée, 10 min, stock vide) : l'extension installée éteint la carte sans recharger");

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
