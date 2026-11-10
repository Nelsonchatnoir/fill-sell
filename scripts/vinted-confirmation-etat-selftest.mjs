// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT CONFIRMÉ QUAND VINTED LE DEMANDE (10/11/2026, point 6 de Nico — extension 0.6.186)
//     npm run selftest:vinted-confirmation-etat
// ═══════════════════════════════════════════════════════════════════════════
// Relevé en réel (compte de Nico, 10/11, rayon 2942) : choisir « Neuf sans étiquette » ouvre la fenêtre
// `new-without-tags-education-modal` — « Conserver « Neuf sans étiquette » » / « Passer à « Très bon état » ». Non
// confirmée, l'état n'entre pas dans le POST (400 « Le champ État doit être renseigné ») ; confirmée, le corps porte
// item_attributes [{ code: "condition", ids: [1] }]. Ce test EXÉCUTE les fonctions de l'extension (extraites de
// vinted.js, jamais recopiées) sur une fenêtre simulée à l'identique du relevé.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(join(ROOT, "chrome-extension/content-scripts/vinted.js"), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 600)}` : ""}`); } };

const selMatch = src.match(/const SEL_CONFIRMATION_ETAT = ('[^']+');/);
ok(Boolean(selMatch) && selMatch[1].includes('new-without-tags-education-modal'), "le sélecteur vise la fenêtre relevée (new-without-tags-education-modal)");
const code = [
  extraireFonctionJs(src, "texteComparable"),
  `const SEL_CONFIRMATION_ETAT = ${selMatch?.[1] ?? "''"};`,
  extraireFonctionJs(src, "boutonConserverEtat"),
  extraireFonctionJs(src, "confirmerEtatVinted"),
  "return { texteComparable, boutonConserverEtat, confirmerEtatVinted };",
].join("\n");

// Un DOM minimal : la fenêtre (ou rien), ses deux boutons ; un clic sur « Conserver » ferme la fenêtre (comme Vinted).
function monde({ fenetre = true, fermeAuClic = true, boutons = ["Conserver « Neuf sans étiquette »", "Passer à « Très bon état »"] } = {}) {
  const etat = { ouverte: fenetre, clics: [] };
  const btns = boutons.map((t) => ({ textContent: t, click() { etat.clics.push(t); if (fermeAuClic && /^Conserver/.test(t)) etat.ouverte = false; } }));
  const modale = { querySelectorAll: (s) => (s === "button" ? btns : []) };
  const document = { querySelector: (s) => (s.includes("education-modal") && etat.ouverte ? modale : null) };
  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5)));
  const humanPause = () => sleep(1);
  const f = new Function("document", "sleep", "humanPause", code)(document, sleep, humanPause);
  return { etat, f, modale };
}

console.log("A. La confirmation");
{
  const { etat, f } = monde();
  const w = [];
  const r = await f.confirmerEtatVinted("Neuf sans étiquette", w, { attenteMs: 20 });
  ok(r === true && etat.clics.length === 1 && etat.clics[0] === "Conserver « Neuf sans étiquette »" && !etat.ouverte,
    "« Neuf sans étiquette » posé : « Conserver « Neuf sans étiquette » » cliqué, la fenêtre se ferme", JSON.stringify({ r, etat, w }));
  ok(w.some((x) => /confirmé/.test(x)), "la confirmation se trace dans les avertissements du dépôt", JSON.stringify(w));
}
{
  const { etat, f } = monde({ fenetre: false });
  const w = [];
  const r = await f.confirmerEtatVinted("Très bon état", w, { attenteMs: 20 });
  ok(r === true && !etat.clics.length && !w.length, "aucune fenêtre (les autres états) : rien cliqué, rien dit — comportement d'avant", JSON.stringify({ r, etat, w }));
}
{
  const { etat, f } = monde();
  const w = [];
  const r = await f.confirmerEtatVinted("Très bon état", w, { attenteMs: 20 });
  ok(r === false && !etat.clics.length, "jamais un autre état : une fenêtre qui ne nomme pas l'état posé → rien cliqué, état dit non posé", JSON.stringify({ r, etat, w }));
}
{
  const { etat, f } = monde({ boutons: ["Passer à « Très bon état »"] });
  const w = [];
  const r = await f.confirmerEtatVinted("Neuf sans étiquette", w, { attenteMs: 20 });
  ok(r === false && !etat.clics.length, "jamais « Passer à … » : sans bouton « Conserver », rien n'est cliqué", JSON.stringify({ r, etat }));
}
{
  const { etat, f } = monde({ fermeAuClic: false });
  const w = [];
  const r = await f.confirmerEtatVinted("Neuf sans étiquette", w, { attenteMs: 20 });
  ok(r === false && w.some((x) => /reste ouverte/.test(x)), "fenêtre qui ne se ferme pas : l'état est dit non posé (jamais un faux succès)", JSON.stringify({ r, w }));
}
{
  const { f, modale } = monde({ boutons: ["Keep “New without tags”", "Change to “Very good”"] });
  ok(f.boutonConserverEtat(modale, "New without tags")?.textContent === "Keep “New without tags”", "page en anglais : « Keep … » qui nomme l'état");
}

console.log("B. Branchée sur les trois voies de pose de l'état");
const safe = extraireFonctionJs(src, "selectClosedOptionSafe");
ok(/match\.el\.click\(\);\s*await humanPause\(\);[\s\S]{0,400}if \(\/condition\/\.test\(String\(triggerSelector\)\) && !\(await confirmerEtatVinted\(match\.label, warnings\)\)\) \{[\s\S]{0,120}return false;/.test(safe),
  "par libellé (et réponse de la personne, vintedAspects.condition) : confirmation juste après le clic, échec = champ non posé");
const parId = extraireFonctionJs(src, "selectEtatParId");
ok(/el\.click\(\);\s*await humanPause\(\);[\s\S]{0,300}confirmerEtatVinted\(titreId \|\| null, warnings\)/.test(parId), "par identifiant (page non française) : la même confirmation");
ok(/"version": "0\.6\.186"/.test(fs.readFileSync(join(ROOT, "chrome-extension/manifest.json"), "utf8")), "manifest 0.6.186");

console.log(`\n${rouges === 0 ? "✓" : "✗"} vinted-confirmation-etat : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
