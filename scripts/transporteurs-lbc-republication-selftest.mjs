// ═══════════════════════════════════════════════════════════════════════════
// REPUBLICATION LEBONCOIN : LES TRANSPORTEURS DE LA FICHE D'ABORD — SELFTEST « VERROU » (19/11/2026, demande de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Les transporteurs choisis sur la fiche (attributs.transporteurs_lbc, Opus-1 f24628b) partent à la publication ; à la
// republication, get-pending-jobs ne connaissait que le choix retenu du compte, puis l'annonce. Rouge sur le code d'avant
// (module absent, get-pending-jobs sans la fiche).
// Garanties :
//   1. le choix de la fiche passe devant celui du compte (et devant ce que l'annonce affiche) ;
//   2. borné au poids qui part : celui de la fiche d'abord, puis la copie, puis l'annonce (un transporteur qui ne prend
//      pas ce poids n'est jamais coché) ;
//   3. un choix que le poids écarte en entier, ou aucun choix sur la fiche : la règle d'avant (compte, puis annonce) ;
//   4. seuls les noms exacts de Leboncoin partent, dans l'ordre de Leboncoin ;
//   5. le câblage : une réponse de la personne sur la tâche reste devant tout ; le compte n'est lu qu'à défaut de la fiche.
//   node scripts/transporteurs-lbc-republication-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0, n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `\n      ${detail}` : ""}`); } };

let M = null;
try { M = await import("../supabase/functions/_shared/transporteurs-lbc-republication.js"); }
catch (e) { ok(false, "_shared/transporteurs-lbc-republication.js existe", String(e?.message ?? e).slice(0, 160)); }
const { choixTransporteursPourLaFiche } = await import("../src/utils/transporteursLbcFiche.js");
const fiche = (noms) => ({ ...(choixTransporteursPourLaFiche(noms, new Date("2026-11-19T14:00:00Z")) ?? {}), etat: { v: "Très bon état", source: "manuel" } });

if (M) {
  console.log("\n1. Le choix de la fiche part (forme écrite par l'app)");
  const a = fiche(["Colissimo", "Mondial Relay"]);
  ok(a.transporteurs_lbc?.source === "manuel" && Array.isArray(a.transporteurs_lbc.v), "forme de la fiche : { v: [...], source: manuel, at }", JSON.stringify(a.transporteurs_lbc));
  const r = M.transporteursDeLaFicheALaRepublication({ attributs: a, poidsFiche: 900 });
  ok(JSON.stringify(r?.noms) === JSON.stringify(["Mondial Relay", "Colissimo"]), "Mondial Relay + Colissimo (ordre de Leboncoin)", JSON.stringify(r));

  console.log("\n2. Borné au poids qui part");
  const b = fiche(["Courrier suivi", "Mondial Relay"]);
  ok(JSON.stringify(M.transporteursDeLaFicheALaRepublication({ attributs: b, poidsFiche: 2500 })?.noms) === JSON.stringify(["Mondial Relay"]),
    "2,5 kg : Courrier suivi (2 kg au plus) n'est jamais coché");
  ok(JSON.stringify(M.transporteursDeLaFicheALaRepublication({ attributs: b, poidsFiche: 2500, poidsCopie: 300 })?.noms) === JSON.stringify(["Mondial Relay"]),
    "le poids de la FICHE borne (il passe devant celui de la copie au service)");
  ok(JSON.stringify(M.transporteursDeLaFicheALaRepublication({ attributs: b, poidsFiche: null, poidsCopie: 300 })?.noms) === JSON.stringify(["Courrier suivi", "Mondial Relay"]),
    "sans poids sur la fiche : celui de la copie");
  ok(JSON.stringify(M.transporteursDeLaFicheALaRepublication({ attributs: b, poidsAnnonce: 2500 })?.noms) === JSON.stringify(["Mondial Relay"]), "sinon celui de l'annonce");
  ok(JSON.stringify(M.transporteursDeLaFicheALaRepublication({ attributs: b })?.noms) === JSON.stringify(["Courrier suivi", "Mondial Relay"]), "aucun poids connu : le choix entier");

  console.log("\n3. Sinon, la règle d'avant");
  ok(M.transporteursDeLaFicheALaRepublication({ attributs: fiche(["Courrier suivi"]), poidsFiche: 2500 }) === null, "choix écarté en entier par le poids : null (compte, puis annonce)");
  ok(M.transporteursDeLaFicheALaRepublication({ attributs: { etat: { v: "Bon état" } }, poidsFiche: 500 }) === null, "aucun choix sur la fiche : null");
  ok(M.transporteursDeLaFicheALaRepublication({ attributs: null }) === null, "fiche illisible : null");

  console.log("\n4. Les noms exacts de Leboncoin seulement");
  ok(JSON.stringify(M.transporteursDeLaFicheALaRepublication({ attributs: { transporteurs_lbc: { v: ["DHL", "Colissimo", "Colissimo"], source: "manuel" } } })?.noms) === JSON.stringify(["Colissimo"]),
    "un nom inconnu écarté, sans doublon");
  ok(M.transporteursDeLaFicheALaRepublication({ attributs: { transporteurs_lbc: { v: ["DHL"], source: "manuel" } } }) === null, "que des noms inconnus : null");
}

console.log("\n5. Câblage (get-pending-jobs, republication Leboncoin)");
{
  const G = fs.readFileSync(path.join(RACINE, "supabase/functions/get-pending-jobs/index.ts"), "utf8").replace(/\r\n/g, "\n");
  ok(/from "\.\.\/_shared\/transporteurs-lbc-republication\.js"/.test(G), "get-pending-jobs importe _shared/transporteurs-lbc-republication.js");
  const i = G.indexOf("const ficheT = reponduL(\"lbcTransporteurs\") ? null : transporteursDeLaFicheALaRepublication(");
  ok(i > 0, "la fiche est lue seulement sans réponse de la personne sur la tâche");
  const bloc = i > 0 ? G.slice(i, i + 2600) : "";
  ok(/attributs: colisFicheDe\.get\(j\.inventaire_id as number\)\?\.attributs/.test(bloc) && /poidsFiche: colisFicheDe\.get\(j\.inventaire_id as number\)\?\.poids_g/.test(bloc),
    "la fiche de CET article : ses attributs et son poids");
  ok(/const retenusLbc = \(reponduL\("lbcTransporteurs"\) \|\| ficheT\) \? null : await transporteursLbcRetenus\(\);/.test(bloc), "le choix du compte n'est lu qu'à défaut de la fiche");
  ok(bloc.indexOf("if (ficheT)") >= 0 && bloc.indexOf("if (ficheT)") < bloc.indexOf("} else if (retenusLbc)") && bloc.indexOf("} else if (retenusLbc)") < bloc.indexOf("} else if (vals && !reponduL(\"lbcTransporteurs\"))"),
    "ordre : fiche, puis compte, puis annonce");
}

console.log(`\n${n - ko}/${n} vérifications`);
if (ko) { console.log(`✗ ${ko} échec(s)`); process.exit(1); }
console.log("✓ selftest transporteurs-lbc-republication : OK");
