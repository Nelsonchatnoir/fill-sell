// Autotest — le titre du job suit l'annonce prouvée (identifiant + photos) —
// `npm run selftest:titre-aligne` (_shared/titre-aligne.js, handler-watch).
// Données RELEVÉES en base le 15/10 (fixture) : DeadRoz 3279304096 (« Jean
// Levi's … 9 LONG femme », déposée par FillSell puis modifiée sur Leboncoin),
// XEWER 3259156501 (Need for Speed ProStreet ; le job dit « Pure PS3 »), XEWER
// 3201361859 (Skylanders, autre prise de vue que la fiche : JAMAIS aligné).
import { titreNommeAnnonce, decisionAlignementTitre, CONTRADICTION_IDENTITE_RE } from "../supabase/functions/_shared/titre-aligne.js";
import { urlsAnnonce } from "../supabase/functions/_shared/depot-sans-numero.js";
import { urlsPhotos } from "../supabase/functions/_shared/recreation-deja-partie.js";
import fs from "node:fs";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const F = JSON.parse(fs.readFileSync(new URL("./fixtures/titre-aligne-lbc-1510.json", import.meta.url), "utf8"));
const emp = (u) => (F.empreintes[u] ? { url: u, ...F.empreintes[u] } : undefined);
const A = Object.fromEntries(F.annonces.map((a) => [a.listing_id, { ...a, capture: { photos: a.cap } }]));
const decide = (job, a) => decisionAlignementTitre({
  job, annonce: a,
  empreintesAnnonce: urlsAnnonce(a).map(emp).filter(Boolean),
  empreintesFiche: urlsPhotos(a.fphotos, 6).map(emp).filter(Boolean),
});

console.log("\n1. LA GARDE DE L'EXTENSION, À L'IDENTIQUE");
const ext = fs.readFileSync(new URL("../chrome-extension/content-scripts/leboncoin.js", import.meta.url), "utf8");
ok(/if \(mots\.length < 3\) return null;/.test(ext) && /presents\.length >= mots\.length - 1/.test(ext), "seuils de l'extension inchangés (≥ 3 mots, tous sauf un)");
ok(titreNommeAnnonce("Casio G-Shock Noire Bracelet Résine", "Montre Casio G-Shock noire bracelet résine"), "la montre du 22/07 : un mot en trop toléré");
ok(!titreNommeAnnonce("Need for Speed ProStreet PS3 avec notice – PAL FR – EA", "Pure PS3 avec notice – PAL FR – Disney Interactive"), "XEWER : 4/7 → la garde bloque (constat du 15/10)");
ok(!titreNommeAnnonce(A["3279304096"].titre, "Jean Levi’s vintage Taille L 950 Relaxed Fit Tapered Leg W28 L32 bleu marine homme J99"), "DeadRoz : 11/15 → la garde bloque");

console.log("\n2. IDENTITÉ PROUVÉE (NUMÉRO + MÊME FICHE + PHOTOS) → TITRE ALIGNÉ");
const jobDead = { platform: "leboncoin", title: "Jean Levi’s vintage Taille L 950 Relaxed Fit Tapered Leg W28 L32 bleu marine homme J99", platform_listing_id: "3279304096", inventaire_id: 1789120449397004 };
const dD = decide(jobDead, A["3279304096"]);
ok(dD?.aligner === true && dD.titre === A["3279304096"].titre, "DeadRoz 61370f28 : aligné sur le titre en ligne", JSON.stringify(dD));
const jobXe = { platform: "leboncoin", title: "Pure PS3 avec notice – PAL FR – Disney Interactive", platform_listing_id: "3259156501", inventaire_id: 1789717143836002 };
const dX = decide(jobXe, A["3259156501"]);
ok(dX?.aligner === true && /Need for Speed/.test(dX.titre), "XEWER e28911c2 : aligné sur « Need for Speed ProStreet »", JSON.stringify(dX));
ok(titreNommeAnnonce(A["3259156501"].titre, dX.titre), "après alignement, la garde passe sur la page de l'annonce");

console.log("\n3. SANS PREUVE, RIEN NE BOUGE");
const jobSky = { platform: "leboncoin", title: "Titre sans rapport pour forcer la contradiction ici", platform_listing_id: "3201361859", inventaire_id: 1789717155362005 };
const dS = decide(jobSky, A["3201361859"]);
ok(dS?.aligner === false, "XEWER Skylanders : photos d'une autre prise de vue → jamais aligné (deuxième exemplaire possible)", JSON.stringify(dS));
ok(decide({ ...jobXe, platform_listing_id: "3259156502" }, A["3259156501"])?.aligner === false, "autre numéro : rien");
ok(decide({ ...jobXe, inventaire_id: 1 }, A["3259156501"])?.aligner === false, "annonce rattachée à une autre fiche : rien");
ok(decisionAlignementTitre({ job: jobXe, annonce: A["3259156501"], empreintesAnnonce: [], empreintesFiche: [] })?.aligner === false, "sans empreintes : rien (jamais le titre seul)");
ok(decide({ ...jobXe, title: A["3259156501"].titre }, A["3259156501"]) === null, "titre déjà juste : rien à faire");
ok(decide({ ...jobXe, platform: "vinted" }, A["3259156501"]) === null, "Leboncoin seulement");
ok(decide(jobXe, { ...A["3259156501"], disparu_le: "2026-10-15T00:00:00Z" })?.aligner === false, "annonce plus en ligne : rien");

console.log("\n4. LE MOTIF D'ARRÊT ET LE BALAYAGE");
ok(CONTRADICTION_IDENTITE_RE.test("Contradiction d'identité : l'annonce 3259156501 s'intitule « Need for Speed » alors que le job vise « Pure PS3 »"), "motif de la garde reconnu");
const hw = fs.readFileSync(new URL("../supabase/functions/handler-watch/index.ts", import.meta.url), "utf8");
ok(/decisionAlignementTitre\(\{/.test(hw) && /titre_aligne/.test(hw) && /\.eq\("id", f\.id\)\.eq\("status", f\.status\)/.test(hw), "handler-watch aligne (CAS sur le statut) et relance le job arrêté");
ok(!/from\("inventaire"\)\.update/.test(hw.slice(hw.indexOf("LE TITRE DU JOB SUIT"), hw.indexOf("PEUT-ÊTRE DÉJÀ PARTIE"))), "le titre de la fiche n'est jamais touché");

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
