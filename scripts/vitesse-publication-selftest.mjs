// ═══════════════════════════════════════════════════════════════════════════
// LA VITESSE DE PUBLICATION (26/10, urgence de Nico) — `npm run selftest:vitesse-publication`
// ═══════════════════════════════════════════════════════════════════════════
// Ce qui faisait attendre l'écran, prouvé le 26/10 (docs/enquetes/lenteur-2610/RAPPORT.md) :
//   1. trois rotations de textes d'exemple changeaient un état du composant App toutes les 3 à 4 s, quel que soit
//      l'onglet — un rendu complet de l'app (Stock entier, écran de publication) environ chaque seconde ;
//   2. le lot lisait les annonces Vinted UNE à la fois, 8 à 20 s d'écart (10 articles : 1 min 30 à 3 min 20) ;
//   3. la lecture de fond tenait le verrou de l'extension pendant que l'écran attendait (75 s et 97 s mesurées).
// Vérifie le code LIVRÉ (lecture du source : ces règles vivent dans des composants React).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

console.log("1. Aucun minuteur ne rend toute l'app pour rien");
{
  const app = lire("src/App.jsx");
  ok(!/setDealPlaceholderIdx/.test(app), "la rotation de l'onglet « Deal » (index lu nulle part) a disparu");
  ok(/if\(tab!==2\)return undefined;[^\n]*\n\s*const _id=setInterval\(\(\)=>\{\n\s*if\(document\.visibilityState!=='visible'\)return;\n\s*setLensPlaceholderFade\(false\);/.test(app) && /\},\[tab\]\);/.test(app),
    "Lens : la rotation ne tourne que sur l'onglet Lens, page visible");
  ok(/if\(tab!==1\|\|!voiceZoneOpen\)return undefined;[^\n]*\n\s*const t=setInterval\(\(\)=>\{if\(document\.visibilityState==='visible'\)setVoicePlaceholderIdx/.test(app) && /\},\[tab,voiceZoneOpen\]\);/.test(app),
    "saisie vocale du Stock : seulement zone ouverte, onglet Stock, page visible");
  // Tout autre setInterval du composant App doit dépendre d'une condition (bannière, onglet, attente) — jamais un
  // minuteur nu qui change un état d'App sans rien regarder. La liste ci-dessous est celle relue le 26/10.
  const intervalles = [...app.matchAll(/setInterval\(([^,]{0,80})/g)].map((m) => m[1].trim().slice(0, 40));
  ok(intervalles.length === 6, `6 setInterval dans App.jsx, chacun relu le 26/10 (${intervalles.length} trouvés)`, JSON.stringify(intervalles));
}

console.log("2. Le lot lit les annonces Vinted en parallèle");
{
  const lot = lire("src/publication/lot/LotPublication.jsx");
  ok(/const LECTURES_SIMULTANEES = 10;/.test(lot) && !/lecteurOccupe/.test(lot), "jusqu'à 10 lectures en même temps (plus « une à la fois »)");
  ok(/if \(pf === "vinted" && lecturePubliqueVinted\) return;/.test(lot), "page publique Vinted (extension ≥ 0.6.144) : aucune attente, l'extension les fait l'une après l'autre");
  ok(/const lecturePubliqueVinted = versionAuMoins\(versionExtensionIci, LECTEUR_VERSION_MIN\);/.test(lot), "la version de l'extension de CET appareil décide (inconnue → l'espacement d'avant)");
  ok(/const depart = Math\.max\(maintenant, prochainCreneau\.current\[pf\] \?\? 0\);\n\s*prochainCreneau\.current\[pf\] = depart \+ min \+ Math\.random\(\) \* \(max - min\);/.test(lot),
    "eBay et l'ancien lecteur Vinted : un créneau réservé par plateforme, espacé comme avant (jamais une rafale)");
  ok(/enLectureRef\.current\.add\(suivant\);/.test(lot) && /enLectureRef\.current\.delete\(suivant\);/.test(lot), "un article n'est jamais lu deux fois en même temps");
}

console.log("3. L'extension ne fait plus attendre l'écran derrière son travail de fond");
{
  const bg = lire("chrome-extension/background.js");
  ok(/jobFlowWaiters\+\+;/.test(bg) && /async function attendreOuCeder\(ms\)/.test(bg), "le verrou compte ceux qui l'attendent ; la lecture de fond cède");
  const i = bg.indexOf("await recoverMissingListingUrls(session)");
  ok(i > 0 && /if \(jobFlowWaiters > 0 && !majPlanifiee\) \{[\s\S]{0,400}repollApresCycle = true;\s*return;\s*\}\s*$/.test(bg.slice(i - 900, i)), "la maintenance de fond passe après une demande de l'écran");
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/let personnePublie = out\.length > 0;/.test(gpj) && /personnePublie,\n\s*\}\);/.test(gpj), "serveur : aucune lecture de fond servie pendant que la personne publie (toutes versions ≥ 0.6.144)");
}

console.log(`\n${rouges === 0 ? "✓" : "✗"} vitesse-publication : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
