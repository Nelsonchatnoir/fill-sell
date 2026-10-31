// LOT H (31/10) — la date du Stock = la date de l'éligibilité à la republication automatique, sur des données RÉELLES.
//   npx supabase db query --linked -o json -f scripts/essais/20261031_lot_h_equivalence_xewer.sql > xewer.json
//   node --import ./scripts/loader-ext.mjs scripts/lot-h-equivalence.mjs xewer.json
// Pour chaque (fiche, plateforme autre que Vinted) que la règle SQL date, le module _shared/mise-en-ligne.js doit
// rendre la MÊME date (à la milliseconde) ; et il ne doit dater AUCUNE plateforme que la règle SQL ne date pas.
// (Vinted : les deux lisent inventaire.listed_at_guess, comparé aussi.)
import { readFileSync } from "node:fs";
import { annonceEnLigne, indexerDatesRelevees } from "../supabase/functions/_shared/mise-en-ligne.js";

const brut = JSON.parse(readFileSync(process.argv[2], "utf8").replace(/^﻿/, ""));
const d = (brut.rows?.[0]?.donnees) ?? brut.donnees ?? brut;
const jobsPar = new Map();
for (const j of d.jobs ?? []) { const k = String(j.inventaire_id); if (!jobsPar.has(k)) jobsPar.set(k, []); jobsPar.get(k).push(j); }
const items = new Map((d.items ?? []).map((i) => [String(i.id), i]));
const releves = indexerDatesRelevees(d.releves ?? []);
const PF = ["leboncoin", "beebs", "ebay", "depop", "opla"];
const sql = new Map((d.sql ?? []).map((r) => [`${r.inv}:${r.platform}`, r.date]));
let egales = 0, ecarts = 0, imports = 0;
const exemples = [];
for (const [inv, item] of items) {
  const jobs = jobsPar.get(inv) ?? [];
  for (const platform of PF) {
    const attendu = sql.get(`${inv}:${platform}`) ?? null;
    const a = annonceEnLigne({ item, jobs, platform, datesRelevees: releves });
    const obtenu = a?.date ?? null;
    const same = (attendu == null && obtenu == null) || (attendu != null && obtenu != null && Date.parse(attendu) === Date.parse(obtenu));
    if (attendu == null && obtenu == null) continue;
    if (same) { egales++; if (a?.nature === "importee") imports++; } else { ecarts++; if (exemples.length < 10) exemples.push({ inv, platform, attendu, obtenu }); }
  }
  const v = annonceEnLigne({ item, jobs, platform: "vinted", datesRelevees: releves });
  const vAttendu = item.vinted_item_id && item.listed_at_guess ? item.listed_at_guess : null;
  if (vAttendu || v?.date) {
    if ((vAttendu && v?.date && Date.parse(vAttendu) === Date.parse(v.date))) egales++; else { ecarts++; if (exemples.length < 10) exemples.push({ inv, platform: "vinted", attendu: vAttendu, obtenu: v?.date ?? null }); }
  }
}
console.log(`fiches ${items.size} · dates identiques ${egales} (dont ${imports} imports datés par le relevé) · écarts ${ecarts}`);
for (const e of exemples) console.log("  ÉCART", JSON.stringify(e));
const g = items.get("1789717144944001");
if (g) {
  for (const platform of ["vinted", "leboncoin", "ebay"]) {
    const a = annonceEnLigne({ item: g, jobs: jobsPar.get("1789717144944001") ?? [], platform, datesRelevees: releves });
    console.log(`  GIGN ${platform} : ${a?.date ?? "—"} (${a?.nature ?? "—"})`);
  }
}
if (ecarts) process.exit(1);
