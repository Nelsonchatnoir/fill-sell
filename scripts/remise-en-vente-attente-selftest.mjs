// ═══════════════════════════════════════════════════════════════════════════
// Selftest « Leboncoin : la remise en vente attend que l'annonce vendue soit hors ligne » (06/11, Nico, règle A)
//   node scripts/remise-en-vente-attente-selftest.mjs
// LE CAS : Louis, 7 remises Leboncoin déposées à 07:22-07:29 alors que les annonces vendues (transaction « Achat en
// cours ») étaient encore actives — refusées par Leboncoin (« annonce identique déjà en ligne »).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { remiseAAttendre, annonceVendueDeLaRemise, annonceVendueEncoreEnLigne, PLATEFORMES_REMISE_APRES_DISPARITION, decisionRearmementRemise, champsRearmementRemise, REARMEMENTS_MAX } from "../supabase/functions/_shared/remise-en-vente-attente.js";

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
ok("la règle A passe AVANT la série (une remise retenue n'est pas servie par la série)",
  gpj.indexOf("let heldRemisesLbc = 0;") > 0 && gpj.indexOf("let heldRemisesLbc = 0;") < gpj.indexOf("let heldSerie = 0;"));

console.log("4. (07/11, option A) Une remise close pendant que sa vendue est affichée revient en attente");
const T0 = Date.parse("2026-11-07T14:00:00Z");
const close = (o = {}) => remise({ status: "cancelled", created_at: "2026-11-06T06:20:00Z", platform_listing_id: "3303702852",
  error: "Ce dépôt n'a jamais été retrouvé … rien n'est vendu.", ...o,
  platform_fields: { remise_en_vente: { annonce_vendue: "3297400164" }, lbc_depot: { sans_adsubmit: { id: "3303702852" } },
    depot_jamais_en_ligne: { issue: "article_en_ligne_ailleurs", identifiants: ["3303702852"] }, serie_un_par_un: { serie: "s", rang: 1 }, ...(o.platform_fields ?? {}) } });
const f = { vendueEncoreAffichee: true, depotVu: false, autreAnnonceVivante: false, maintenant: T0 };
ok("rang 1 de Louis (cancelled à tort) : remis en attente", decisionRearmementRemise(close(), f).rearmer);
ok("rejugé « failed » : remis en attente", decisionRearmementRemise(close({ status: "failed" }), f).rearmer);
ok("rang 4 (published 11:25, jamais vu, 410) : remis en attente après 2 h, pas avant",
  decisionRearmementRemise(close({ status: "published", published_at: "2026-11-07T10:25:28Z" }), f).rearmer
  && !decisionRearmementRemise(close({ status: "published", published_at: "2026-11-07T13:30:00Z" }), f).rearmer);
ok("vendue disparue : rien (la règle B juge le refus)", !decisionRearmementRemise(close(), { ...f, vendueEncoreAffichee: false }).rearmer);
ok("dépôt vu en ligne : rien", !decisionRearmementRemise(close(), { ...f, depotVu: true }).rearmer
  && !decisionRearmementRemise(close({ vu_en_ligne_le: "2026-11-07T09:00:00Z" }), f).rearmer);
ok("une autre annonce NON vendue de la fiche en ligne : rien (jamais de doublon)", !decisionRearmementRemise(close(), { ...f, autreAnnonceVivante: true }).rearmer);
ok("arrêtée par la personne : rien", !decisionRearmementRemise(close({ error: "Annulée à ta demande." }), f).rearmer);
ok("plus de 14 jours : rien", !decisionRearmementRemise(close({ created_at: "2026-10-20T06:20:00Z" }), f).rearmer);
ok("publication ordinaire ou autre plateforme : rien", !decisionRearmementRemise({ ...close(), platform_fields: {} }, f).rearmer
  && !decisionRearmementRemise(close({ platform: "vinted" }), f).rearmer);
const pfR = champsRearmementRemise(close().platform_fields, close(), "2026-11-07T14:00:00.000Z");
ok("le dépôt refusé est archivé, la tâche redevient neuve, la série gardée", pfR.depots_desactives_regle_a?.[0]?.numero === "3303702852"
  && !("lbc_depot" in pfR) && !("depot_jamais_en_ligne" in pfR) && pfR.serie_un_par_un?.rang === 1 && pfR.remise_en_vente?.annonce_vendue === "3297400164"
  && pfR.remise_regle_a?.rearmements === 1 && remiseAAttendre({ platform: "leboncoin", action: "publish", platform_fields: pfR }));
let pfX = close().platform_fields;
for (let i = 0; i < REARMEMENTS_MAX; i++) pfX = champsRearmementRemise(pfX, close(), "2026-11-07T14:00:00Z");
ok("jamais plus de 3 fois", !decisionRearmementRemise(close({ platform_fields: pfX }), f).rearmer);
const HW = readFileSync(join(ROOT, "supabase/functions/handler-watch/index.ts"), "utf8");
ok("branchement handler-watch : statut relu à l'écriture, un passage par quart d'heure",
  /decisionRearmementRemise\(j, \{/.test(HW) && /\.eq\("id", j\.id\)\.eq\("status", j\.status\)/.test(HW) && /getUTCMinutes\(\) % 15 < 3/.test(HW));

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
