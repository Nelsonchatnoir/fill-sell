// ═══════════════════════════════════════════════════════════════════════════
// REPUBLICATION LEBONCOIN, BEEBS, DEPOP : LES CORRECTIONS DE LA FEUILLE PASSENT SUR LA COPIE — SELFTEST « VERROU » (19/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Constat (demande de Nico, point 3) : ces republications recréent l'annonce depuis la COPIE du dernier dépôt en ligne
// (spend_coins_and_republish : title, description, platform_fields du job source), jamais depuis la fiche — sauf le prix
// (prix_de_republication : le prix choisi gagne), le colis Leboncoin (poids et format de la fiche, colis-de-la-fiche.js)
// et l'état quand la fiche est plus haute (contenuAImposer). La correction faite dans la feuille, écrite sur la fiche,
// n'atteignait donc ni le titre, ni la description, ni la taille, la couleur, la marque, la matière, ni un état plus bas.
// Rouge sur le code d'avant (module absent, get-pending-jobs muet).
// Garanties :
//   1. Leboncoin, Beebs, Depop : chaque correction est posée là où le remplisseur la lit (colonnes title / description /
//      price ; Leboncoin : taille, marque, couleur ET colors[0], matière, état ET lbcAspects.condition ; Beebs : taille
//      avec sa trace, couleur, marque, matière, état dans le vocabulaire Beebs ; Depop : identifiants Depop — état,
//      couleurs, matières — marque et taille Depop) ;
//   2. Beebs : la taille que l'annonce affiche encore ne reprend jamais la taille corrigée (correction_tracee, lue par
//      get-pending-jobs ET par beebs.js — exécuté ici) ;
//   3. jamais une valeur inventée : Depop sans identifiant connu, titre sur Depop, état embelli → non posée, dite ;
//   4. une fois par tâche, avant tout retrait ; jamais héritée d'une republication d'avant ;
//   5. le câblage : get-pending-jobs pose la correction, et « le contenu du vendeur » (contenuAImposer) ne la défait pas.
//   node scripts/corrections-republication-copie-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0, n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `\n      ${detail}` : ""}`); } };
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");

let M = null;
try { M = await import("../supabase/functions/_shared/corrections-republication.js"); }
catch (e) { ok(false, "_shared/corrections-republication.js existe", String(e?.message ?? e).slice(0, 160)); }
const APP = await import("../src/stock/correctionsRepublication.js");
const { correctionTient } = await import("../supabase/functions/_shared/correction-tracee.js");

const NE = "2026-11-19T14:00:00.000Z";
const LE = "2026-11-19T14:00:04.000Z";
const tache = (platform, pf = {}, col = {}) => ({ id: `22222222-aaaa-4bbb-8ccc-${platform.padEnd(12, "0").slice(0, 12)}`, platform, action: "republish", status: "pending",
  created_at: NE, title: "TEST FillSell ancien titre - ne pas acheter", description: "Ancien texte", price: 999, ...col,
  platform_fields: { republish_step: "a_capturer", ...pf } });
const depuisFeuille = (platform, toutes) => ({ corrections_republication: { ...APP.correctionsPourLaTache({ toutes, parPf: {} }, platform), le: LE, par: "feuille_republication" } });

if (M) {
  console.log("\n1. Leboncoin : là où leboncoin.js lit");
  {
    const j = tache("leboncoin", { ...depuisFeuille("leboncoin", { titre: "TEST FillSell titre corrigé - ne pas acheter", description: "Texte corrigé", prix: "1200",
      taille: "L", couleur: "Noir", marque: "Marque B", matiere: "Laine", etat: "Bon état" }),
      taille: "M", couleur: "Gris", colors: ["Gris"], marque: "Marque A", matiere: "Coton", etat: "Très bon état", lbcAspects: { condition: "Très bon état", clothing_brand: "Marque A" }, lbc_etat_precis: "Très bon état" });
    ok(M.copieACorrigerParLaFeuille(j), "republication Leboncoin en attente avec corrections : à corriger");
    const r = M.correctionsSurLaCopie({ job: j, corrections: M.correctionsDeCetteTache(j) });
    ok(r.colonnes.title === "TEST FillSell titre corrigé - ne pas acheter" && r.colonnes.description === "Texte corrigé" && r.colonnes.price === 1200, "colonnes : titre, description, prix", JSON.stringify(r.colonnes));
    ok(r.pf.prix_republication === 1200, "prix de republication aligné");
    ok(r.pf.taille === "L" && r.pf.marque === "Marque B" && r.pf.matiere === "Laine", "taille, marque, matière : champs dédiés (devant lbcAspects)");
    ok(r.pf.couleur === "Noir" && JSON.stringify(r.pf.colors) === JSON.stringify(["Noir"]), "couleur : couleur ET colors[0] (leboncoin.js lit colors[0] d'abord)");
    ok(r.pf.etat === "Bon état" && r.pf.lbcAspects.condition === "Bon état" && !("lbc_etat_precis" in r.pf),
      "état : platform_fields.etat ET lbcAspects.condition (posé devant), l'état précis d'avant retiré");
    const etatCandidats = new Function(`${extraireFonctionJs(lire("chrome-extension/content-scripts/leboncoin.js"), "etatCandidatsLeboncoin")}; return etatCandidatsLeboncoin;`)();
    ok(etatCandidats(r.pf)[0] === "Bon état" && !etatCandidats(r.pf).includes("Très bon état"), "leboncoin.js (vrai code) : l'état corrigé est le premier candidat, l'ancien n'y est plus", JSON.stringify(etatCandidats(r.pf)));
    ok(r.pf.lbcAspects.clothing_brand === "Marque A" && r.non_posees.length === 0, "le reste de la copie gardé ; rien refusé");
  }

  console.log("\n2. Beebs : la taille corrigée tient devant celle que l'annonce affiche encore");
  {
    const j = tache("beebs", { ...depuisFeuille("beebs", { taille: "L", etat: "Neuf sans étiquette", couleur: "Noir" }), taille: "M", etat: "Très bon état", couleur: "Gris" });
    const r = M.correctionsSurLaCopie({ job: j, corrections: M.correctionsDeCetteTache(j), tailleAffichee: "M" });
    ok(r.pf.taille === "L" && r.pf.correction_tracee?.cle === "taille" && r.pf.correction_tracee.avant === "M" && r.pf.correction_tracee.apres === "L",
      "taille L, trace { avant: M (affichée), apres: L }", JSON.stringify(r.pf.correction_tracee));
    ok(correctionTient(r.pf, "taille", "M"), "get-pending-jobs (correctionTient) : l'annonce affiche encore « M » → la copie corrigée tient");
    const BJ = lire("chrome-extension/content-scripts/beebs.js");
    const taillesAPoser = new Function(`${extraireFonctionJs(BJ, "valeurAfficheeSurLAnnonce")}\n${extraireFonctionJs(BJ, "correctionTient")}\n${extraireFonctionJs(BJ, "taillesAPoser")}; return taillesAPoser;`)();
    const t = taillesAPoser({ ...r.pf, champs_lus_sur_l_annonce: { lus: { taille: "M" }, repris: {} } });
    ok(t?.primaire === "L" && !(t.replis ?? []).includes("M"), "beebs.js (vrai code) : « L » posée, jamais « M » en repli", JSON.stringify(t));
    ok(r.pf.etat === "Neuf, sans étiquette" && r.pf.couleur === "Noir", "état dans le vocabulaire Beebs, couleur");
    const autre = tache("beebs", { ...depuisFeuille("beebs", { taille: "L" }), taille: "M", correction_tracee: { cle: "age", avant: "1 an", apres: "2 ans" } });
    ok(M.correctionsSurLaCopie({ job: autre, corrections: M.correctionsDeCetteTache(autre) }).non_posees[0]?.motif === "autre_correction_tracee_sur_la_copie",
      "une autre correction tracée déjà sur la copie : la taille n'est pas posée (jamais une trace écrasée), dite");
  }

  console.log("\n3. Depop : les identifiants que depop.js lit");
  {
    // L'état d'une copie Depop se dit dans le vocabulaire Vinted (contenu-fiche.js) : la feuille de l'app n'envoie RIEN pour
    // Depop (etatPourPlateforme(v, "depop") = null) — dit à Opus-1 ; le serveur accepte la forme convenue { v }.
    ok(APP.correctionsPourLaTache({ toutes: { etat: "Bon état" }, parPf: {} }, "depop") == null, "(constat) la feuille de l'app n'envoie pas l'état pour Depop — à poser côté app");
    const corrDepop = { ...depuisFeuille("depop", { titre: "TEST titre", couleur: "Noir", matiere: "Laine", marque: "Marque B", taille: "L" }).corrections_republication, etat: { v: "Bon état" } };
    const j = tache("depop", { corrections_republication: corrDepop,
      depopCategoryPath: ["womenswear", "tops", "jumpers"], depopCouleurs: ["grey"], depopEtat: "used_excellent", depopMarque: "Marque A", depopTaille: "M", couleur: "Gris" });
    const r = M.correctionsSurLaCopie({ job: j, corrections: M.correctionsDeCetteTache(j) });
    ok(JSON.stringify(r.pf.depopCouleurs) === JSON.stringify(["black"]) && r.pf.depopEtat === "used_good" && JSON.stringify(r.pf.depopMatieres) === JSON.stringify(["wool"]),
      "couleurs black, état used_good, matière wool", JSON.stringify({ c: r.pf.depopCouleurs, e: r.pf.depopEtat, m: r.pf.depopMatieres }));
    ok(r.pf.depopMarque === "Marque B" && r.pf.depopTaille === "L" && r.pf.etat === "Bon état", "marque et taille Depop ; état (vocabulaire Vinted, comme la copie)");
    ok(r.non_posees.map((p) => p.motif).join() === "depop_sans_titre" && !r.colonnes.title, "titre : Depop n'en a pas — non posé, dit");
    const hors = tache("depop", { ...depuisFeuille("depop", { couleur: "Xyzzy", matiere: "Fibre magique" }), depopCategoryPath: ["womenswear", "tops", "jumpers"], depopCouleurs: ["grey"] });
    const rh = M.correctionsSurLaCopie({ job: hors, corrections: M.correctionsDeCetteTache(hors) });
    ok(rh.non_posees.map((p) => p.motif).sort().join() === "couleur_hors_palette_depop,matiere_hors_liste_depop" && JSON.stringify(rh.pf.depopCouleurs) === JSON.stringify(["grey"]),
      "couleur ou matière sans identifiant Depop : non posées, la copie garde les siennes");
    const beaute = tache("depop", { corrections_republication: { etat: { v: "Bon état" }, le: LE }, depopCategoryPath: ["womenswear", "beauty", "makeup"], depopEtat: "brand_new" });
    ok(M.correctionsSurLaCopie({ job: beaute, corrections: M.correctionsDeCetteTache(beaute) }).non_posees[0]?.motif === "etat_neuf_seulement", "beauté (neuf seulement) : un état d'occasion n'est pas posé");
  }

  console.log("\n4. Une fois par tâche, avant tout retrait, jamais héritée");
  {
    const j = tache("leboncoin", { ...depuisFeuille("leboncoin", { taille: "L" }) });
    const fait = { ...j, platform_fields: M.traceCorrectionsPosees(j.platform_fields, { jobId: j.id, posees: { taille: "L" }, non_posees: [] }) };
    ok(!M.copieACorrigerParLaFeuille(fait), "déjà posée sur cette tâche : plus jamais");
    ok(!M.copieACorrigerParLaFeuille(tache("leboncoin", { ...depuisFeuille("leboncoin", { taille: "L" }), deleted_at: "2026-11-19T14:10:00Z" })), "retrait engagé : jamais");
    ok(!M.copieACorrigerParLaFeuille(tache("beebs", { ...depuisFeuille("beebs", { taille: "L" }), republish_suppression_envoyee: { le: "x" } })), "suppression envoyée : jamais");
    const heritee = tache("leboncoin", { corrections_republication: { taille: { v: "L" }, le: "2026-11-16T10:00:00.000Z" },
      corrections_republication_posees: { job_id: "ancienne-tache", posees: { taille: "L" } } });
    ok(!M.copieACorrigerParLaFeuille(heritee) && !M.champSousCorrection(heritee, "taille"), "recopiée d'une republication d'avant : ni posée, ni protégée");
    ok(!M.copieACorrigerParLaFeuille(tache("vinted", depuisFeuille("vinted", { taille: "L" }))), "Vinted : jamais par la copie (la capture fait foi)");
    ok(!M.copieACorrigerParLaFeuille({ ...tache("leboncoin", depuisFeuille("leboncoin", { taille: "L" })), action: "publish" }), "une publication : jamais");
  }

  console.log("\n5. L'état n'est jamais embelli, et le contenu du vendeur ne défait pas une correction");
  {
    const j = tache("leboncoin", depuisFeuille("leboncoin", { etat: "Bon état" }));
    ok(M.champSousCorrection(j, "etat") && !M.champSousCorrection(j, "description"), "avant d'être posée, la correction d'état protège l'état — pas la description");
    const pose = { ...j, platform_fields: M.traceCorrectionsPosees(j.platform_fields, { jobId: j.id, posees: { etat: "Bon état" }, non_posees: [] }) };
    ok(M.champSousCorrection(pose, "etat"), "posée : protégée");
  }
}

console.log("\n6. Câblage (get-pending-jobs)");
{
  const G = lire("supabase/functions/get-pending-jobs/index.ts");
  const i = G.indexOf("copieACorrigerParLaFeuille(j");
  ok(i > 0, "get-pending-jobs juge les republications Leboncoin / Beebs / Depop");
  const bloc = i > 0 ? G.slice(i, i + 6000) : "";
  ok(/correctionsSurLaCopie\(/.test(bloc) && /traceCorrectionsPosees\(/.test(bloc) && /\.eq\("status", "pending"\)/.test(bloc), "pose, trace, tâche encore en attente seulement");
  ok(/annonces_plateforme/.test(bloc) && /taille/.test(bloc), "Beebs : la taille affichée lue au relevé (annonces_plateforme) pour la trace");
  ok(/champSousCorrection\(j as never, "description"\)/.test(G) && /champSousCorrection\(j as never, "etat"\)/.test(G.slice(G.indexOf("const imp = contenuAImposer("), G.indexOf("const imp = contenuAImposer(") + 6000)),
    "contenuAImposer : ni la description ni l'état corrigés ne sont rejoués");
}

console.log(`\n${n - ko}/${n} vérifications`);
if (ko) { console.log(`✗ ${ko} échec(s)`); process.exit(1); }
console.log("✓ selftest corrections-republication-copie : OK");
