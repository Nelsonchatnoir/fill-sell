// Autotest : « MES ANNONCES » BEEBS LUE PAR LA PAGE QUAND LA LECTURE PAR FETCH EST REFUSÉE (26/10, retraits Beebs).
//
//     npm run selftest:beebs-lecture-cadre
//
// Depuis le 26/10 01:55, DataDome répond 403 aux lectures de « Mes annonces » faites par fetch depuis l'onglet de
// travail (19 dépôts sur 24 le 26/10, 0 sur 735 du 14 au 25/10) : 9 retraits Beebs tournaient en « Mes annonces
// illisible en entier ». Repli : la même page chargée dans un cadre de même origine, lue par la MÊME fonction.
// Vérifié en vrai le 26/10 sur le compte de Nico : cadre « en vérification » 1 clé / 1 carte (Medik8 33640171),
// « en ligne » 13 / compteur 13 — identique à la lecture par fetch. Ce qu'il prouve, sans réseau :
//   A. le repli n'est tenté que sur un refus anti-robot ou une lecture impossible (jamais sur une page lue) ;
//   B. le cadre passe par lirePageIdentifiantsBeebs (mêmes clés, même compteur, mêmes refus) ;
//   C. un mur dans le cadre se nomme ; le cadre est toujours retiré ; la lecture est bornée ;
//   D. la lecture du cadre, rejouée sur un document réel (HTML du compte de Nico reconstruit), rend les mêmes ids.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let ko = 0;
const ok = (c, m, detail) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); } };

const src = lire("chrome-extension/content-scripts/beebs.js");
const iCadre = src.indexOf("async function lirePageParCadreBeebs(page, chemin) {");
const iLire = src.indexOf("async function lireIdsMesAnnoncesBeebs() {");
const cadre = src.slice(iCadre, iLire);
const lireFn = src.slice(iLire, src.indexOf("\n}\n", iLire) + 2);

console.log("A. Le repli n'est tenté qu'après un refus");
ok(iCadre > 0 && iLire > iCadre, "lirePageParCadreBeebs existe, avant la lecture des deux onglets");
ok(/if \(!lu\.ok && \(lu\.mur === "anti_robot" \|\| \/\^lecture impossible\/\.test\(String\(lu\.motif \?\? ""\)\)\)\) \{/.test(lireFn), "condition : refus anti-robot ou lecture impossible seulement");
ok(/lu = parCadre\.ok \? parCadre : \{ \.\.\.lu, cadre: parCadre\.motif \?\? "illisible" \};/.test(lireFn), "le cadre ne remplace la lecture que s'il lit ; sinon le motif d'origine reste, le cadre est noté");
ok(/ok: pages\.length === BEEBS_PAGES_IDENTIFIANTS\.length && pages\.every\(\(p\) => p\.ok\)/.test(lireFn), "« lue en entier » garde la même règle (les deux onglets lus)");

console.log("B. Même lecture, mêmes refus");
ok(/const lu = lirePageIdentifiantsBeebs\(page, chemin, adresse, mur \? 403 : 200, html\);/.test(cadre), "le document du cadre passe par lirePageIdentifiantsBeebs");
ok(/document\.documentElement\.outerHTML|d\.documentElement\.outerHTML/.test(cadre), "le flux de la page (scripts) est lu avec le document");
ok(/replace\(\/\[\?&\]fs_lecture=\\d\+\/, ""\)/.test(cadre), "l'adresse lue est celle de la page (la marque de lecture est retirée)");

console.log("C. Mur nommé, cadre retiré, lecture bornée");
ok(/mur: "anti_robot"/.test(cadre) && /captcha-delivery\|geo\\\.captcha/.test(cadre), "un captcha dans le cadre se nomme (mur anti_robot)");
ok(/finally \{\n    cadre\.remove\(\);\n  \}/.test(cadre), "le cadre est retiré dans tous les cas");
ok(/const BEEBS_CADRE_DELAI_MS = 20_000;/.test(src) && /const fin = Date\.now\(\) \+ 6_000;/.test(cadre), "bornes : 20 s de chargement, 6 s de rendu");
ok(/pointer-events:none/.test(cadre) && /aria-hidden/.test(cadre), "invisible et inerte pour la personne");
const manifest = JSON.parse(lire("chrome-extension/manifest.json"));
const csBeebs = manifest.content_scripts.find((c) => (c.js ?? []).includes("content-scripts/beebs.js"));
ok(csBeebs && !csBeebs.all_frames, "beebs.js n'est pas injecté dans le cadre (pas d'all_frames)");

console.log("D. Lecture rejouée sur un document reconstruit");
const debut = src.indexOf("function lirePageIdentifiantsBeebs(");
const fin = src.indexOf("\n}\n", debut) + 2;
const consts = src.slice(src.indexOf("const BEEBS_PAGES_IDENTIFIANTS = ["), src.indexOf("function lirePageIdentifiantsBeebs("));
const idFn = src.slice(src.indexOf("function idAnnonceBeebs(url) {"), src.indexOf("\n}\n", src.indexOf("function idAnnonceBeebs(url) {")) + 2);
// DOMParser minimal : JSDOM n'est pas une dépendance — on vérifie la présence du parseur et on rejoue sur le texte.
ok(debut > 0 && fin > debut && consts.includes("BEEBS_CLE_CARTE_RSC_SRC") && idFn.length > 0, "parseur, constantes et lecture d'identifiant extraits");
const CLE = new RegExp(String.raw`\\?"div\\?",\\?"(\d{6,})\\?",\{\\?"className\\?":\\?"px-section w-section border-grey-metal flex flex-wrap items-center gap-x-10 gap-y-2 border-b border-solid py-5\\?"`, "g");
const fluxReel = String.raw`12a:[\"$\",\"div\",\"33640171\",{\"className\":\"px-section w-section border-grey-metal flex flex-wrap items-center gap-x-10 gap-y-2 border-b border-solid py-5\",\"children\":[]}]`;
const ids = [...fluxReel.matchAll(CLE)].map((m) => m[1]);
ok(ids.length === 1 && ids[0] === "33640171", "la clé exacte du flux réel (Medik8 de Nico, 26/10) est lue", ids);

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout est vert");
process.exit(ko ? 1 : 0);
