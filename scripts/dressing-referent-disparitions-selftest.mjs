// (07/11 nuit, point 3 — compte 90d11dae) Le marquage des disparitions du relevé du dressing Vinted ne se perd plus.
// La personne a vidé son dressing (12 → 1 article entre le 27/10 10:20 et le 28/10 09:19) ; le relevé du 28/10 (identité
// prouvée) n'a rien marqué — garde (d) « sans recoupement, mauvais compte possible » — et le relevé suivant l'a pris pour
// référent : la fenêtre partait du 28/10, les 11 annonces vues le 27/10 en sortaient, immarquables à jamais.
// Le VRAI code : runAMarqueLesDisparitions, choisirReferentDisparitions, decisionMarquageDisparitions (background.js),
// joués sur une suite de relevés simulée (inventaire, notes « [note] disparitions non marquées — … »).
import fs from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const bg = lire("chrome-extension/background.js");
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

const reRodage = bg.match(/const MOTIF_RODAGE_DISPARITIONS_RE = (\/[^\n]+\/);/);
ok(!!reRodage, "MOTIF_RODAGE_DISPARITIONS_RE présent");
const { runAMarqueLesDisparitions, choisirReferentDisparitions, decisionMarquageDisparitions } = new Function(
  `const MOTIF_RODAGE_DISPARITIONS_RE = ${reRodage[1]};\n`
  + ["runAMarqueLesDisparitions", "choisirReferentDisparitions", "decisionMarquageDisparitions"].map((f) => extraireFonctionJs(bg, f)).join("\n")
  + "\nreturn { runAMarqueLesDisparitions, choisirReferentDisparitions, decisionMarquageDisparitions };")();

// ── Le simulateur : la même suite d'étapes que syncDressingUnlocked (référent → fenêtre → connus → disparus → gardes).
const ID = "3189544338";
function simulateur() {
  const runs = [];           // du plus ancien au plus récent : { id, status, vinted_user_id, vinted_login, started_at, items_vus, erreur }
  const inventaire = new Map(); // vinted_item_id → { id, vinted_item_id, last_synced_at, disparu_le, origine }
  let seq = 0;
  const relever = (le, visibles, { identite = ID, login = "ayoubd72", origineHors = [] } = {}) => {
    const t = Date.parse(le);
    const run = { id: `r${++seq}`, status: "done", vinted_user_id: identite, vinted_login: login, started_at: new Date(t).toISOString(), items_vus: visibles.length, erreur: null };
    // Import / mise à jour : les articles vus portent last_synced_at du relevé (origine vinted_sync, sauf les articles
    // publiés par FillSell — origine « app » — que la fenêtre ne compte jamais).
    for (const v of visibles) {
      const ligne = inventaire.get(v) ?? { id: `i${v}`, vinted_item_id: v, disparu_le: null, origine: origineHors.includes(v) ? "app" : "vinted_sync" };
      ligne.last_synced_at = new Date(t + 60_000).toISOString();
      inventaire.set(v, ligne);
    }
    const recents = [...runs].reverse();
    const choix = choisirReferentDisparitions(recents, identite, login);
    let motif = choix.motif ?? null;
    let marques = [];
    if (!motif) {
      const fenetre = Date.parse(choix.referent.started_at) - 5 * 60_000;
      const connus = [...inventaire.values()].filter((l) => l.origine === "vinted_sync" && !l.disparu_le && Date.parse(l.last_synced_at) >= fenetre);
      const vus = new Set(visibles);
      const disparus = connus.filter((l) => !vus.has(l.vinted_item_id));
      const d = decisionMarquageDisparitions({ connus, vus, disparus, relevePrecedent: choix.relevePrecedent });
      if (d.motif) motif = d.motif;
      else { marques = d.aMarquer; for (const l of marques) l.disparu_le = run.started_at; }
    }
    if (motif) run.erreur = `[note] disparitions non marquées — ${motif}`;
    runs.push(run);
    return { run, motif, marques: marques.map((l) => l.vinted_item_id) };
  };
  return { relever, inventaire, runs };
}

// ═══ 1. Le cas 90d11dae ═══════════════════════════════════════════════════════════════════════════════════════
{
  const S = simulateur();
  const DOUZE = Array.from({ length: 12 }, (_, i) => `100${i}`);
  ok(/aucun run terminé en référence/.test(S.relever("2026-10-26T10:00:00Z", DOUZE).motif), "26/10 : premier relevé = rodage");
  const r27 = S.relever("2026-10-27T10:20:00Z", DOUZE);
  ok(!r27.motif && r27.marques.length === 0, "27/10 : 12 vues, rien à marquer");
  // 28/10 : la personne a tout retiré ; le seul article visible est un article publié par FillSell (origine « app »).
  const r28 = S.relever("2026-10-28T09:19:00Z", ["9999"], { origineHors: ["9999"] });
  ok(/sans recoupement/.test(r28.motif) && /marquage reporté au prochain relevé/.test(r28.motif) && !/mauvais compte/.test(r28.motif),
    "28/10 : (d) à identité prouvée → REPORT d'un relevé (plus « mauvais compte possible »)");
  ok(runAMarqueLesDisparitions(r28.run) === false, "28/10 : un relevé qui a reporté n'est jamais un référent");
  const r29 = S.relever("2026-10-29T09:00:00Z", ["9999"], { origineHors: ["9999"] });
  ok(!r29.motif && r29.marques.length === 12, `29/10 : les 12 annonces absentes des DEUX relevés sont marquées (${r29.marques.length})`);
  ok(DOUZE.every((v) => S.inventaire.get(v).disparu_le === r29.run.started_at), "toutes datées par le relevé qui confirme");
  const r30 = S.relever("2026-10-30T09:00:00Z", ["9999"], { origineHors: ["9999"] });
  ok(!r30.motif && r30.marques.length === 0, "30/10 : rien de plus (jamais deux fois)");
}

// ═══ 2. La règle d'avant sur le même cas (reconstruction littérale) : immarquables — la preuve du défaut ═══════
{
  // Référent = dernier run « done » ; (d) sans recoupement = renonce. Mêmes données.
  const runs = [];
  const inv = new Map();
  const relever = (le, visibles, hors = []) => {
    const t = Date.parse(le);
    for (const v of visibles) inv.set(v, { ...(inv.get(v) ?? { vinted_item_id: v, disparu_le: null, origine: hors.includes(v) ? "app" : "vinted_sync" }), last_synced_at: new Date(t + 60_000).toISOString() });
    const referent = [...runs].reverse().find((r) => r.status === "done");
    let marques = 0;
    if (referent) {
      const fen = Date.parse(referent.started_at) - 5 * 60_000;
      const connus = [...inv.values()].filter((l) => l.origine === "vinted_sync" && !l.disparu_le && Date.parse(l.last_synced_at) >= fen);
      const disparus = connus.filter((l) => !visibles.includes(l.vinted_item_id));
      const recoupement = connus.some((l) => visibles.includes(l.vinted_item_id));
      if (disparus.length && recoupement) { for (const l of disparus) l.disparu_le = le; marques = disparus.length; }
    }
    runs.push({ status: "done", started_at: new Date(t).toISOString() });
    return marques;
  };
  const DOUZE = Array.from({ length: 12 }, (_, i) => `100${i}`);
  relever("2026-10-26T10:00:00Z", DOUZE); relever("2026-10-27T10:20:00Z", DOUZE);
  const avant = [relever("2026-10-28T09:19:00Z", ["9999"], ["9999"]), relever("2026-10-29T09:00:00Z", ["9999"], ["9999"]), relever("2026-11-04T09:00:00Z", ["9999"], ["9999"])];
  ok(avant.every((m) => m === 0) && DOUZE.every((v) => !inv.get(v).disparu_le), "règle d'avant : 0 marquée, à jamais (le défaut constaté chez 90d11dae)");
}

// ═══ 3. Contre-épreuves : ce qui protégeait protège toujours ═══════════════════════════════════════════════════
{
  // 3a. Changement de compte : jamais de marquage, même avec un référent plus ancien du compte.
  const S = simulateur();
  const A = ["1", "2", "3"];
  S.relever("2026-10-01T10:00:00Z", A); S.relever("2026-10-02T10:00:00Z", A);
  const autre = S.relever("2026-10-03T10:00:00Z", ["7", "8"], { identite: "555", login: "autre" });
  ok(/changement de compte/.test(autre.motif) && autre.marques.length === 0, "changement de compte : aucun marquage");
  const retour = S.relever("2026-10-04T10:00:00Z", ["1"]);
  ok(/changement de compte/.test(retour.motif) && !S.inventaire.get("2").disparu_le, "retour au compte d'avant : aucun marquage (le dernier relevé est d'un autre compte)");
  const ensuite = S.relever("2026-10-05T10:00:00Z", ["1"]);
  ok(!ensuite.motif && ensuite.marques.length === 0 && !S.inventaire.get("2").disparu_le,
    "relevé suivant : le retour (rodage) est le référent — les lignes d'avant le changement restent immarquables, comme avant");
  // Un run d'un autre compte glissé APRÈS un référent plus ancien (report entre deux) : périmètre invérifiable.
  const T = simulateur();
  T.relever("2026-10-01T10:00:00Z", ["1", "2"]); T.relever("2026-10-02T10:00:00Z", ["1", "2"]);
  ok(/reporté/.test(T.relever("2026-10-03T10:00:00Z", ["z"], { origineHors: ["z"] }).motif), "report (sans recoupement)");
  T.runs.push({ id: "intrus", status: "incomplete", vinted_user_id: "555", vinted_login: "autre", started_at: "2026-10-03T12:00:00Z", items_vus: 4, erreur: null });
  const apres = T.relever("2026-10-04T10:00:00Z", ["z"], { origineHors: ["z"] });
  ok(/run d'un autre compte/.test(apres.motif) && !T.inventaire.get("1").disparu_le, "un run d'un autre compte depuis le référent (même incomplet) : rien marqué");
  // 3b. Effondrement : plafond inchangé.
  const E = simulateur();
  const SOIXANTE = Array.from({ length: 60 }, (_, i) => `e${i}`);
  E.relever("2026-10-01T10:00:00Z", SOIXANTE); E.relever("2026-10-02T10:00:00Z", SOIXANTE);
  const eff = E.relever("2026-10-03T10:00:00Z", SOIXANTE.slice(0, 20));
  ok(/effondrement suspect : 40 disparition/.test(eff.motif) && eff.marques.length === 0, "effondrement (40 sur 60, plafond 24) : aucun marquage, comme avant");
  // 3c. Cas ordinaire (recoupement) : marqué tout de suite, comme avant.
  const O = simulateur();
  O.relever("2026-10-01T10:00:00Z", ["a", "b", "c", "d"]); O.relever("2026-10-02T10:00:00Z", ["a", "b", "c", "d"]);
  const ord = O.relever("2026-10-03T10:00:00Z", ["a", "b", "c"]);
  ok(!ord.motif && ord.marques.join() === "d", "vente ordinaire (recoupement) : marquée au relevé même, inchangé");
  // 3d. Report non confirmé : un disparu revu par le relevé précédent n'est pas « absent de deux relevés ».
  const R = simulateur();
  R.relever("2026-10-01T10:00:00Z", ["x", "y"]); R.relever("2026-10-02T10:00:00Z", ["x", "y"]);
  const rep1 = R.relever("2026-10-03T10:00:00Z", ["z"], { origineHors: ["z"] });   // x, y absents → report
  ok(/reporté/.test(rep1.motif), "absents une fois : reporté");
  R.relever("2026-10-04T10:00:00Z", ["x", "z"], { origineHors: ["z"] });          // x revu (recoupement) → y marqué ? y absent de 2 relevés
  ok(R.inventaire.get("y").disparu_le && !R.inventaire.get("x").disparu_le, "x revu → jamais marqué ; y absent des deux relevés → marqué");
  // 3e. Notes : seul un rodage laisse un relevé « référent » sans marquage.
  ok(runAMarqueLesDisparitions({ status: "done", erreur: null }) && runAMarqueLesDisparitions({ status: "done", erreur: "[note] disparitions non marquées — aucun run terminé en référence (première sync) : rien à marquer ce run" })
    && runAMarqueLesDisparitions({ status: "done", erreur: "[note] disparitions non marquées — changement de compte Vinted (@a → @b) : sync normale, aucune disparition marquée" })
    && !runAMarqueLesDisparitions({ status: "done", erreur: "[note] disparitions non marquées — run repris à la page 2 : …" })
    && !runAMarqueLesDisparitions({ status: "done", erreur: "[note] disparitions non marquées — effondrement suspect : 40 …" })
    && !runAMarqueLesDisparitions({ status: "incomplete", erreur: null }), "référent : marqué ou rodage seulement ; jamais un relevé incomplet, repris, effondré ou reporté");
  ok(/identité du compte Vinted inconnue/.test(choisirReferentDisparitions([{ status: "done", vinted_user_id: ID, started_at: "2026-10-01T00:00:00Z" }], null).motif), "identité inconnue : aucun marquage");
}

// ═══ 4. Le câblage dans syncDressingUnlocked ═══════════════════════════════════════════════════════════════════
{
  const sync = extraireFonctionJs(bg, "syncDressingUnlocked");
  ok(/&order=started_at\.desc&limit=30&select=id,status,vinted_user_id,vinted_login,started_at,items_vus,erreur/.test(sync), "les runs récents portent leur note (erreur), 30 au plus");
  ok(/const choix = choisirReferentDisparitions\(recents \?\? \[\], idActuel, ident\?\.login \?\? null\);/.test(sync)
    && /fenetreConnusIso = new Date\(Date\.parse\(choix\.referent\.started_at\) - 5 \* 60_000\)\.toISOString\(\);/.test(sync), "fenêtre depuis le référent choisi");
  ok(/&select=id,vinted_item_id,last_synced_at&order=id\.asc/.test(sync), "les candidats portent leur dernière vue");
  ok(/decisionMarquageDisparitions\(\{ connus: connus \?\? \[\], vus: vusCetteSync, disparus, relevePrecedent: relevePrecedentDisparitions \}\)/.test(sync)
    && /for \(const d of aMarquer\) \{/.test(sync), "gardes (d)/(e) par la fonction pure, seuls les confirmés sont datés");
  ok(/notes\.push\(`\$\{NOTE\}disparitions non marquées — \$\{motifSautDisparitions\}`\)/.test(sync), "la note que lit runAMarqueLesDisparitions est toujours écrite");
}

console.log(`dressing-referent-disparitions : OK (${n} vérifications)`);
