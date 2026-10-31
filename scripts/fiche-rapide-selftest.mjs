// ═══════════════════════════════════════════════════════════════════════════
// LA FICHE D'UN ARTICLE S'OUVRE TOUT DE SUITE (31/10) — `npm run selftest:fiche-rapide`
// ═══════════════════════════════════════════════════════════════════════════
// Mesuré sur le banc (vraie app en build de production, 2 900 articles, toucher réel, CPU d'un téléphone ×4) :
// 3,9 s entre le toucher d'une carte et l'affichage de la fiche. Deux causes, corrigées à la racine :
//   1. Ouvrir la fiche (état d'App) redessinait TOUT le Stock : 25 de ses props (des gestes d'App) étaient des
//      fonctions neuves à chaque rendu. → gestes à identité stable (src/utils/fonctionsStables.js), la feuille
//      « Plus en ligne » par un contexte (src/stock/renduVivant.js), extensionStatus mémorisé.
//   2. Chaque rendu du Stock refaisait des parcours de TOUT le stock, dont la reconnaissance de l'objet par mots-clés
//      pour chaque article (93 % du temps). → icône mémorisée (même texte → même icône), parcours mémorisés sur leurs
//      entrées, l'heure avançant par une horloge locale (transition), jamais au moment d'un geste.
// Ce selftest garde les deux : 1. le même résultat (icône mémorisée = calcul direct, sur un corpus varié) ;
// 2. aucune prop du Stock neuve à chaque rendu (pas de flèche ni d'objet écrits dans la balise) ; 3. les parcours
// mémorisés et leurs entrées ; 4. les gestes stables appellent la dernière version.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { depopRefuseLArticle } from "../src/utils/republication.js";
import { detectObjectIcon } from "../src/utils/shared.js";
import { depopInterdit } from "../src/utils/platformCompat.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

console.log("1. L'icône mémorisée rend exactement le calcul direct");
{
  const titres = ["Parfum Chanel n°5 100 ml", "Sérum anti-rides Medik8", "Robe longue Zara", "Casque moto Shark taille M", "Casque audio Sony WH-1000XM4",
    "Huile sur toile signée", "Jean Levi's 501", "Livre Harry Potter tome 1", "Console PS2 slim", "Couteau de chasse Opinel", "Poussette Yoyo Babyzen",
    "Montre Casio G-Shock", "Crème hydratante Nuxe", "Basket Nike Air Max 90", "", "T-shirt", "Décoration murale chambre"];
  const descriptions = ["", "parfum délicat", "avec un lit, un miroir et un lampadaire", "Très bon état, peu porté."];
  const types = [null, "Mode", "Beauté", "Luxe", "Autre"];
  let n = 0, ecarts = [];
  for (const titre of titres) for (const description of descriptions) for (const type of types) {
    const item = { titre, description, type };
    for (let tour = 0; tour < 2; tour++) { // le 2e tour lit la mémoire
      const direct = Boolean(depopInterdit(detectObjectIcon(titre, description, type), item));
      if (depopRefuseLArticle(item, []) !== direct) ecarts.push(`${titre} | ${description} | ${type}`);
      n++;
    }
  }
  ok(ecarts.length === 0, `${n} cas (mémoire vide puis pleine) : même verdict Depop que le calcul direct`, ecarts.slice(0, 3).join(" ; "));
  ok(depopRefuseLArticle({ titre: "x" }, [{ platform: "depop", platform_fields: { depop_interdit: true } }]) === true, "un verdict serveur (depop_interdit) prime toujours");
}

console.log("2. Le Stock ne reçoit aucune prop neuve à chaque rendu d'App");
const APP = lire("src/App.jsx");
{
  const d = APP.indexOf("        {tab===1&&(\n          <RenduPlusEnLigne.Provider value={rendrePlusEnLigne}>\n          <StockTab\n");
  const f = APP.indexOf("          />\n          </RenduPlusEnLigne.Provider>", d);
  ok(d > 0 && f > d, "le Stock est rendu sous le contexte de la feuille « Plus en ligne »");
  const balise = APP.slice(d, f);
  const fleches = balise.match(/\w+=\{\s*\(?[\w\s,]*\)?\s*=>/g) ?? [];
  const objets = balise.match(/\w+=\{\{|\w+=\{[^}\n]*\?\{/g) ?? [];
  ok(fleches.length === 0, "aucune fonction écrite dans la balise (une flèche = une fonction neuve à chaque rendu)", fleches.join(" "));
  ok(objets.length === 0, "aucun objet écrit dans la balise (un {{…}} = un objet neuf à chaque rendu)", objets.join(" "));
  for (const g of ["ouvrirModalePlafond", "ouvrirReglagesRepublication", "onRemettreVenteAnnulee", "ajouterPhotosAjout", "retirerPhotoAjout", "reordonnerPhotosAjout",
    "addItemsFromVoice", "resetVoiceFlow", "callVoiceParse", "addItem", "handleLotDistribute", "addLotToInventory", "delItem", "markSold", "handleImportFile",
    "handleExport", "handleIAPPurchase", "handleIAPRestore", "triggerCheckout", "openUpgradeModal", "onRetirerVendus", "onPlusTardVendus", "onDupliquer"]) {
    if (!new RegExp(`\\b${g}=\\{gestesStock\\.${g}\\}`).test(balise)) ok(false, `geste stable : ${g}`);
  }
  ok(/vaActions=\{vaActionsStock\}/.test(balise) && /plusEnLigne=\{plusEnLigneStock\}/.test(balise) && /extensionStatus=\{extensionStatusStock\}/.test(balise)
    && /messagerie=\{messagerieStock\}/.test(balise),
    "les 23 gestes, vaActions, plusEnLigne, extensionStatus et la messagerie (bêta) : à identité stable");
  // Les hooks d'App sont déclarés AVANT ses retours anticipés (sinon : erreur React 310 au premier chargement).
  const hooks = APP.indexOf("const gestesStock=useFonctionsStables(");
  const retour = APP.indexOf("  if(authLoading||appLoading)return(");
  ok(hooks > 0 && retour > hooks, "useFonctionsStables est appelé avant le premier retour anticipé d'App");
  const ST = lire("src/tabs/StockTab.jsx");
  ok(/<ContenuPlusEnLigne fermer=\{\(\)=>setGesteOuvert\(null\)\} repli=\{plusEnLigne\.rendre\}\/>/.test(ST), "la feuille « Plus en ligne » se dessine par le contexte (suit chaque saisie)");
}

console.log("3. Les parcours de tout le stock, mémorisés sur leurs entrées");
{
  const ST = lire("src/tabs/StockTab.jsx");
  ok(/const repubActionnables = useMemo\(/.test(ST) && /const repubActionnablesVue = useMemo\(/.test(ST)
    && /const aPublierTout = useMemo\(/.test(ST) && /const aRemonterTout = useMemo\(/.test(ST)
    && /const retardHorloge = useMemo\(\(\) => detecterRetardHorloge\(tousLesJobs\), \[tousLesJobs, minuteCourante\]\)/.test(ST),
    "à publier, à remonter, republiables, horloge du poste : mémorisés");
  ok(/\[republishActif, stock, idsBrouillons, jobsByInventaire, indexEtatTout, datesRelevees, multiOuverte, plateformesOuvertes, plateformesFermees, minuteCourante\]/.test(ST),
    "« Remonter » : toutes ses entrées (jobs, dates relevées, plateformes, minute)");
  ok(/const \[minuteCourante, setMinuteCourante\] = useState\(/.test(ST) && /startTransition\(\(\) => setMinuteCourante\(m\)\)/.test(ST) && /}, 60000\);/.test(ST),
    "l'heure avance par une horloge locale d'une minute, en transition (aucune lecture de la base)");
  ok(!/detecterRetardHorloge\(Object\.values\(jobsByInventaire\)\.flat\(\)\)/.test(ST), "l'horloge du poste n'aplatit plus tous les jobs à chaque rendu");
}

console.log("4. Un geste stable appelle toujours la dernière version");
{
  // Le hook, exécuté sans React : useRef/useMemo/useLayoutEffect minimaux, deux « rendus » successifs.
  const src = lire("src/utils/fonctionsStables.js");
  ok(/useLayoutEffect\(\(\) => \{ derniere\.current = fonctions; \}\)/.test(src), "la dernière version est posée après le rendu validé (effet de mise en page)");
  const etat = { refs: [], memos: [], effets: [], i: 0, j: 0 };
  const R = {
    useRef: (v) => (etat.refs[etat.i] ??= { current: v }, etat.refs[etat.i++]),
    useMemo: (f, deps) => { const m = etat.memos[etat.j]; if (m && m.deps.every((d, k) => d === deps[k])) { etat.j++; return m.v; } const v = f(); etat.memos[etat.j++] = { v, deps }; return v; },
    useLayoutEffect: (f) => etat.effets.push(f),
  };
  const code = src.replace(/^import .*$/m, "").replace("export function", "return function");
  const fabrique = new Function("useLayoutEffect", "useMemo", "useRef", code);
  const useFonctionsStables = fabrique(R.useLayoutEffect, R.useMemo, R.useRef);
  const rendre = (fonctions) => { etat.i = 0; etat.j = 0; etat.effets = []; const out = useFonctionsStables(fonctions); for (const e of etat.effets) e(); return out; };
  let appel = null;
  const a = rendre({ geste: (x) => { appel = `v1:${x}`; return 1; } });
  const b = rendre({ geste: (x) => { appel = `v2:${x}`; return 2; } });
  ok(a === b && a.geste === b.geste, "même objet, même relais d'un rendu à l'autre");
  const r = a.geste("ok");
  ok(appel === "v2:ok" && r === 2, "le relais appelle la DERNIÈRE version (et rend sa valeur)");
  const c = rendre({ geste: () => {}, autre: () => {} });
  ok(c !== b && typeof c.autre === "function", "une clé ajoutée : un nouvel ensemble de relais");
}

console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
if (rouges) process.exit(1);
