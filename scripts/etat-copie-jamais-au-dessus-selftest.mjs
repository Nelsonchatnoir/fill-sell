// VERROU (13/11/2026, lot « zéro problème », étape 5 — décision de Nico) : UNE COPIE NE DIT JAMAIS MIEUX QUE LA FICHE.
//
//     npm run selftest:etat-copie-jamais-au-dessus
//
// « Une copie dont l'état dépasse l'état confirmé de la fiche est un embellissement » : contenuAImposer (get-pending-jobs,
// publications et republications hors Vinted) et le filet de la recréation Vinted (capture-corrigee.js) la ramènent à
// l'état de la fiche ; jamais l'inverse (cette règle ne monte rien). Avant : « un état de copie plus HAUT n'est jamais
// touché » (22/10) — mesuré le 13/11 (lecture seule, 30 jours, juge unique) : 342 copies au-dessus de l'état confirmé de
// leur fiche, dont 182 parties (Leboncoin 126, recréations Vinted 78, Beebs 59, Depop 41, eBay 20, Vinted 18).
// Paires réelles du relevé : « Très bon état » sur une fiche « Bon état » (annonce Vinted lue en détail) ;
// « Neuf avec étiquette » sur une fiche « État neuf » relevée sur Leboncoin — compatible (la grille Leboncoin ne sépare
// pas l'étiquette), jamais baissée.
// FILLSELL_RACINE=<dossier> : le code mis à l'épreuve est celui de ce dossier (mesure « rouge avant »).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = process.env.FILLSELL_RACINE ? path.resolve(process.env.FILLSELL_RACINE) : path.resolve(ICI, "..");
const imp = async (p) => { try { return await import(pathToFileURL(path.join(RACINE, p)).href); } catch { return null; } };
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 300)}`}`); } };

const E = await imp("supabase/functions/_shared/etat-embelli.js");
const C = await imp("supabase/functions/_shared/contenu-fiche.js");
const K = await imp("supabase/functions/_shared/capture-corrigee.js");

const LECTURE = "2026-10-20T10:00:00.000Z", AVANT = "2026-10-19T10:00:00.000Z", APRES = "2026-10-21T10:00:00.000Z";
const fiche = (etat, source) => ({
  origine: "vinted_sync", titre: "Pull", description: "Pull en laine, porté quelques fois, une petite tache.",
  photos: [], attributs: { etat: { v: etat, source, at: LECTURE }, description_source: { v: "vinted", at: LECTURE } },
});
const copie = (platform, action, etatPf, extra = {}) => ({
  platform, action, title: "Pull", description: "Pull en laine, porté quelques fois, une petite tache.",
  photos: [], photo_option: "original", created_at: APRES, platform_fields: { etat: etatPf, ...extra },
});

console.log("A. Le juge (niveaux de etat-correspondance.js)");
ok(E?.copieAuDessusDeLaFiche?.("Très bon état", "Bon état") === true, "« Très bon état » sur « Bon état » : au-dessus");
ok(E?.copieAuDessusDeLaFiche?.("Neuf avec étiquette", "État neuf") === false, "« Neuf avec étiquette » sur « État neuf » (Leboncoin) : compatible, jamais baissé");
ok(E?.copieAuDessusDeLaFiche?.("Neuf avec étiquette", "Neuf, sans étiquette") === true, "« avec étiquette » sur « sans étiquette » (Beebs) : au-dessus");
ok(E?.copieAuDessusDeLaFiche?.("Bon état", "Très bon état") === false, "une copie plus BASSE n'est jamais « au-dessus »");
ok(E?.etatDeFicheConfirme?.({ v: "Bon état", source: "lens" }) === false && E?.etatDeFicheConfirme?.({ v: "Bon état", source: "vinted_detail" }) === true,
  "l'estimation de la lecture des photos (lens) ne confirme rien ; une annonce lue, oui");

console.log("B. contenuAImposer (get-pending-jobs) : ramenée à la fiche, jamais l'inverse");
{
  const t = { contenuLe: APRES, descriptionLueLe: LECTURE, etatLuLe: LECTURE, photosLuesLe: LECTURE };
  const r = C?.contenuAImposer?.(copie("leboncoin", "republish", "Très bon état"), fiche("Bon état", "vinted_detail"), t);
  ok(r?.etat === "Bon état" && r.raisons.includes("etat"), "Leboncoin « Très bon état », fiche « Bon état » (annonce Vinted) → « Bon état »", r);
  const pub = C?.contenuAImposer?.(copie("beebs", "publish", "Neuf, sans étiquette"), fiche("Très bon état", "releve_depop"), t);
  ok(pub?.etat === "Très bon état", "Beebs « Neuf, sans étiquette », fiche « Très bon état » (relevé) → « Très bon état »", pub);
  const lens = C?.contenuAImposer?.(copie("leboncoin", "publish", "Très bon état"), fiche("Bon état", "lens"), t);
  ok(lens && lens.etat === undefined, "fiche à l'état ESTIMÉ (lens) : rien ne baisse", lens);
  const neuf = C?.contenuAImposer?.(copie("vinted", "publish", "Neuf avec étiquette"), fiche("État neuf", "releve_leboncoin"), t);
  ok(neuf && neuf.etat === undefined, "« Neuf avec étiquette » sur « État neuf » : pas touché", neuf);
  const bas = C?.contenuAImposer?.(copie("leboncoin", "publish", "Satisfaisant"), fiche("Bon état", "vinted_detail"), { ...t, etatLuLe: AVANT });
  ok(bas && bas.etat === undefined, "une copie plus BASSE posée avant (publication, état lu avant) : elle reste — cette règle ne monte rien", bas);
}

console.log("C. Le filet de la recréation Vinted (capture-corrigee.js)");
{
  const f = { ...fiche("Bon état", "releve_leboncoin"), origine: "releve_leboncoin" }; // une annonce née sur Vinted garde le sien (null)
  const r = K?.correctionCaptureVinted?.(f, { etat: "Très bon état", categoryPath: null }, { status_id: 2 });
  ok(r?.libelles?.etat === "Bon état" && r?.natif?.status_id === 3 && (r?.raisons ?? []).includes("etat_de_la_fiche"),
    "capture « Très bon état » (status 2), fiche « Bon état » → « Bon état » (status 3)", r && { libelles: r.libelles, natif: r.natif, raisons: r.raisons });
  const n2 = K?.correctionCaptureVinted?.({ ...fiche("État neuf", "releve_leboncoin"), origine: "releve_leboncoin" }, { etat: "Neuf avec étiquette" }, { status_id: 6 });
  ok(!n2 || !(n2.raisons ?? []).includes("etat_de_la_fiche"), "« Neuf avec étiquette » sur « État neuf » : la capture garde son état", n2 && n2.raisons);
  const l2 = K?.correctionCaptureVinted?.({ ...fiche("Bon état", "lens"), origine: "releve_leboncoin" }, { etat: "Très bon état" }, { status_id: 2 });
  ok(!l2 || !(l2.raisons ?? []).includes("etat_de_la_fiche"), "fiche estimée (lens) : la capture garde son état", l2 && l2.raisons);
}

console.log(`\n${n - ko}/${n} verts${ko ? `, ${ko} rouge(s)` : ""}`);
if (ko) process.exit(1);
