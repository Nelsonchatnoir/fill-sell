// ═══════════════════════════════════════════════════════════════════════════
// REJEU DES TAILLES PUBLIÉES — ancien code contre nouveau, ligne par ligne
//   node scripts/tailles-rejeu.mjs                  compare HEAD ↔ copie de travail
//   node scripts/tailles-rejeu.mjs --figer          fige le résultat du code
//                                                   d'AVANT (rev, défaut HEAD) comme
//                                                   ATTENDU dans la fixture
//   node scripts/tailles-rejeu.mjs --ancien <rev>   compare <rev> ↔ copie de travail
//
// Fixture : scripts/fixtures/tailles-publiees-2026-09-18.json — les
// combinaisons (taille × grille relevée) des jobs publiés/vendus du 18 au
// 23/09/2026 (Vinted et Opla, là où une grille est relevée en base).
// Trois résolveurs rejoués :
//   · extension Vinted : selectTailleVinted (vinted.js, bac à sable) ;
//   · serveur Vinted : tailleAServir (republication) et
//     tailleAServirPublication (publication), _shared/vinted-taille-republication.ts ;
//   · Opla : tailleDansGrille (_shared/tailles.js).
// ═══════════════════════════════════════════════════════════════════════════
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chargerTailleVinted, panneau } from "./lib/vinted-taille-bac.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = join(ROOT, "scripts/fixtures/tailles-publiees-2026-09-18.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
const args = process.argv.slice(2);
const figer = args.includes("--figer");
const rev = args.includes("--ancien") ? args[args.indexOf("--ancien") + 1] : "HEAD";

const FICHIERS = {
  vinted: "chrome-extension/content-scripts/vinted.js",
  serveur: "supabase/functions/_shared/vinted-taille-republication.ts",
  tailles: "supabase/functions/_shared/tailles.js",
};

async function resolveurs(sources) {
  const dir = mkdtempSync(join(tmpdir(), "tailles-rejeu-"));
  const ecrire = (nom, contenu) => { const p = join(dir, nom); writeFileSync(p, contenu); return p; };
  ecrire("tailles.js", sources.tailles);
  const serveurPath = ecrire("vinted-taille-republication.ts", sources.serveur);
  const taillesPath = join(dir, "tailles.js");
  const serveur = await import(pathToFileURL(serveurPath).href);
  const tailles = await import(pathToFileURL(taillesPath).href);
  return {
    async extension(taille, options) {
      const { document, clics } = panneau([{ texte: "", groupe: 1, idDepart: 1, options }]);
      const pose = await chargerTailleVinted(sources.vinted, document).selectTailleVinted({ taille }, []);
      return pose ? clics[clics.length - 1] : null;
    },
    republication(taille, options) {
      const r = serveur.tailleAServir({ captureTaille: taille, inventaireTaille: null, options }, { ordrePrefixe: serveur.ORDRE_EXACT_D_ABORD, euCoupe: false });
      return r.valeur;
    },
    publication(taille, chemin, options) {
      const r = serveur.tailleAServirPublication({ taille, cheminCategorie: chemin, options }, { euCoupe: false });
      return r.valeur;
    },
    opla(taille, options, femmes) {
      const r = tailles.tailleDansGrille(taille, options, { tableFemme: femmes });
      return r ? r.valeur : null;
    },
  };
}

const lireGit = (chemin) => execFileSync("git", ["show", `${rev}:${chemin}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const lireDisque = (chemin) => readFileSync(join(ROOT, chemin), "utf8");

async function rejouer(r) {
  const out = [];
  for (const c of fixture.combos) {
    const ligne = { plateforme: c.plateforme, taille: c.taille, categorie: c.categorie, jobs: c.jobs };
    if (c.plateforme === "vinted") {
      ligne.extension = await r.extension(c.taille, c.options);
      ligne.republication = r.republication(c.taille, c.options);
      ligne.publication = r.publication(c.taille, c.categorie, c.options);
    } else if (c.plateforme === "opla") {
      ligne.opla = r.opla(c.taille, c.options, /women|femme/i.test(c.categorie));
    }
    out.push(ligne);
  }
  return out;
}

const courant = await resolveurs({ vinted: lireDisque(FICHIERS.vinted), serveur: lireDisque(FICHIERS.serveur), tailles: lireDisque(FICHIERS.tailles) });
const resultatsCourant = await rejouer(courant);
const ancien = await resolveurs({ vinted: lireGit(FICHIERS.vinted), serveur: lireGit(FICHIERS.serveur), tailles: lireGit(FICHIERS.tailles) });
const resultatsAncien = await rejouer(ancien);

if (figer) {
  // Le résultat ATTENDU est celui du code d'AVANT : c'est lui que les
  // selftests comparent au code courant, ligne par ligne.
  for (let i = 0; i < fixture.combos.length; i++) {
    const c = fixture.combos[i], l = resultatsAncien[i];
    if (c.plateforme === "vinted") { c.attendu_extension = l.extension; c.attendu_republication = l.republication; c.attendu_publication = l.publication; }
    else c.attendu_opla = l.opla;
  }
  fixture.fige_le = new Date().toISOString();
  fixture.fige_depuis = rev;
  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture));
  console.log(`fixture figée depuis ${rev} : ${fixture.combos.length} combinaisons (${FIXTURE_PATH})`);
  process.exit(0);
}

const cles = ["extension", "republication", "publication", "opla"];
let identiques = 0, differents = 0;
const detail = [];
for (let i = 0; i < resultatsCourant.length; i++) {
  const a = resultatsAncien[i], b = resultatsCourant[i];
  let memes = true;
  for (const k of cles) {
    if (!(k in a) && !(k in b)) continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { memes = false; detail.push(`${b.plateforme} « ${b.taille} » @ ${b.categorie} [${k}] : ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])} (${b.jobs} job(s))`); }
  }
  if (memes) identiques++; else differents++;
}
console.log(`\n[tailles-rejeu] ${rev} ↔ copie de travail : ${resultatsCourant.length} combinaisons, ${identiques} identiques, ${differents} différentes`);
for (const d of detail) console.log("  · " + d);
const parPf = {};
for (const l of resultatsCourant) { const p = parPf[l.plateforme] ??= { combos: 0, jobs: 0 }; p.combos++; p.jobs += l.jobs; }
console.log("  couverture :", Object.entries(parPf).map(([k, v]) => `${k} ${v.combos} combinaisons / ${v.jobs} jobs`).join(" · "));
