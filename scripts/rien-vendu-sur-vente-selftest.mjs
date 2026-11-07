// « RIEN N'EST VENDU » NE S'AFFICHE JAMAIS SUR LA REMISE EN VENTE D'UN ARTICLE VENDU (07/11, point 1) — SELFTEST
//   node --import ./scripts/loader-ext.mjs scripts/rien-vendu-sur-vente-selftest.mjs
import { sansRienVenduSurVente, jobSuitUneVente } from "../src/utils/rienVenduSurVente.js";
import { humanizeJobError } from "../src/utils/shared.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };
const remise = { platform: "leboncoin", status: "cancelled", platform_fields: { remise_en_vente: { annonce_vendue: "3297400164" } } };
const simple = { platform: "leboncoin", status: "cancelled", platform_fields: {} };
const T1 = "Ce dépôt n'a jamais été retrouvé dans tes annonces Leboncoin, mais ton article y est en ligne sous l'annonce 3297400164 : rien à refaire, rien n'est vendu.";
const T2 = "Cette annonce est absente de tes annonces Leboncoin aux relevés complets du 06/11 à 21h27 et du 06/11 à 21h36, et Leboncoin n'a donné aucun motif. Rien n'est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.";
const T3 = "Beebs a refusé cette annonce. Rien n'est en ligne, rien n'est vendu : ton article reste dans ton stock.";

ok(jobSuitUneVente(remise) && !jobSuitUneVente(simple) && !jobSuitUneVente(null), "jobSuitUneVente : remise oui, sinon non");
ok(sansRienVenduSurVente(T1, simple) === T1 && sansRienVenduSurVente(T2, simple) === T2, "un job qui ne suit pas une vente : texte intact, octet pour octet");
ok(!/rien n['’]est vendu/i.test(sansRienVenduSurVente(T1, remise)) && /ta vente d'avant n'est pas touchée\.$/.test(sansRienVenduSurVente(T1, remise)), "remise : « ta vente d'avant n'est pas touchée »");
ok(/^Cette annonce est absente.*Ta vente d'avant n'est pas touchée, ton article reste dans ton stock/.test(sansRienVenduSurVente(T2, remise)), "remise : la majuscule est gardée");
ok(/Rien n'est en ligne, ta vente d'avant n'est pas touchée/.test(sansRienVenduSurVente(T3, remise)), "remise : « Rien n'est en ligne, … » (Beebs)");
ok(sansRienVenduSurVente("Nothing is sold, your item stays in your stock.", remise) === "Your earlier sale is not affected, your item stays in your stock.", "anglais aussi");
const affiche = humanizeJobError({ ...remise, error: T2 }, "fr");
ok(typeof affiche === "string" && !/rien n['’]est vendu/i.test(affiche), `humanizeJobError, remise : jamais « rien n'est vendu » (${String(affiche).slice(0, 60)}…)`);
const afficheSimple = humanizeJobError({ ...simple, error: T2 }, "fr");
ok(typeof afficheSimple === "string" && /Rien n'est vendu/.test(afficheSimple), "humanizeJobError, publication ordinaire : inchangé");

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
