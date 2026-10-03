// ═══════════════════════════════════════════════════════════════════════════
// LENS PLUS RAPIDE, SANS RIEN PERDRE (03/10, décision 4 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas réel : XEWER, 5 photos de 1,7 à 3,3 Mo montées l'une après l'autre,
// 87 s d'envoi avant la moindre lecture. La règle :
//   · les photos LUES par l'IA partent à 2 048 px de côté au plus — le modèle
//     de Lens ramène lui-même toute image à 1 568 px : même image lue, mêmes
//     tokens, même coût, même quota ;
//   · trois envois à la fois, chaque photo rangée à son rang (l'ordre envoyé à
//     l'analyse est celui de la personne) ;
//   · un envoi qui échoue arrête le lot (plus rien n'est lancé, plus rien
//     n'est écrit par un envoi retardataire).
// Ce test garde la règle ET le fait qui la rend sans perte : si le modèle de
// Lens change, le côté de 2 048 px doit être remesuré — le test le dit.
import { readFileSync } from "node:fs";
import {
  LENS_PHOTOS_LUES, LENS_COTE_IA, LENS_ENVOIS_PARALLELES, envoyerEnParallele,
} from "../src/utils/photos.js";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
// photosUpload.js importe sans extension (vite) : lu comme texte, pas importé.
const upload = readFileSync(new URL("../src/utils/photosUpload.js", import.meta.url), "utf8");
const LARGEUR_MAX_UPLOAD = Number(upload.match(/export const LARGEUR_MAX_UPLOAD = (\d+);/)?.[1]);

console.log("1. LES RÉGLAGES");
ok(LENS_COTE_IA === 2048, "photos lues : 2 048 px de côté au plus");
ok(LENS_COTE_IA >= 1568, "jamais sous ce que le modèle lit (1 568 px) : aucune perte pour l'analyse");
ok(LENS_COTE_IA > LARGEUR_MAX_UPLOAD, "au-dessus des copies durables de la fiche (1 024 px) : aucune perte à la publication");
ok(LENS_ENVOIS_PARALLELES >= 2 && LENS_ENVOIS_PARALLELES <= 3, "2 à 3 envois à la fois (décision 4)");
ok(LENS_PHOTOS_LUES === 5, "l'IA lit toujours 5 photos au plus (coût d'une analyse inchangé)");

console.log("2. LE MODÈLE QUI REND LE 2 048 SANS PERTE");
const serveur = readFileSync(new URL("../supabase/functions/lens-analysis/index.ts", import.meta.url), "utf8");
const modeles = [...serveur.matchAll(/model:\s*"([^"]+)"/g)].map((m) => m[1]);
ok(modeles.length > 0 && modeles.every((m) => m.startsWith("claude-haiku-4-5")),
  "lens-analysis lit les photos avec claude-haiku-4-5 (grand côté lu : 1 568 px)",
  `modèles trouvés : ${modeles.join(", ") || "aucun"} — un autre modèle peut lire plus grand : remesurer LENS_COTE_IA`);

console.log("3. L'ENVOI EN PARALLÈLE");
{
  // Ordre gardé, jamais plus de 3 à la fois, chaque photo une seule fois.
  const rangs = new Array(5);
  let enCours = 0, pic = 0, appels = 0;
  const durees = [40, 5, 25, 5, 10];
  await envoyerEnParallele(5, 3, async (i) => {
    appels++; enCours++; pic = Math.max(pic, enCours);
    await attendre(durees[i]);
    rangs[i] = `photo-${i + 1}`;
    enCours--;
  });
  ok(appels === 5, "5 photos : 5 envois, aucun en double", `appels ${appels}`);
  ok(pic === 3, "jamais plus de 3 envois à la fois, et 3 réellement en même temps", `pic ${pic}`);
  ok(JSON.stringify(rangs) === JSON.stringify(["photo-1", "photo-2", "photo-3", "photo-4", "photo-5"]),
    "chaque photo à SON rang, quel que soit l'ordre d'arrivée");
}
{
  const t0 = Date.now();
  await envoyerEnParallele(6, 3, () => attendre(30));
  const duree = Date.now() - t0;
  ok(duree < 120, "6 envois de 30 ms à 3 de front : ~60 ms, pas 180 ms", `${duree} ms`);
}
{
  let appels = 0;
  await envoyerEnParallele(0, 3, async () => { appels++; });
  ok(appels === 0, "aucune photo : aucun envoi, aucune erreur");
  await envoyerEnParallele(2, 3, async () => { appels++; });
  ok(appels === 2, "2 photos et 3 voies : 2 envois");
}
{
  // Un échec arrête le lot : plus rien n'est lancé, l'envoi retardataire le sait.
  const lances = [];
  let retardataireAEcrit = null;
  let erreur = null;
  try {
    await envoyerEnParallele(8, 3, async (i, estArrete) => {
      lances.push(i);
      if (i === 1) { await attendre(5); throw new Error("upload refusé"); }
      await attendre(i === 0 ? 30 : 15);
      if (i === 0) retardataireAEcrit = !estArrete();
    });
  } catch (e) { erreur = e; }
  await attendre(60);
  ok(erreur?.message === "upload refusé", "la première erreur remonte telle quelle");
  ok(lances.length <= 4, "après l'échec, plus aucun envoi n'est lancé", `lancés : ${lances.join(",")}`);
  ok(retardataireAEcrit === false, "l'envoi déjà parti voit l'arrêt et n'écrit plus rien");
}

console.log("4. LE CÂBLAGE (App.jsx)");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
ok(/reduireSousLimiteIA\(brut,LENS_COTE_IA,LENS_COTE_IA,0\.92\)/.test(app), "photos lues : réduites à LENS_COTE_IA, JPEG 0,92");
ok(/await envoyerEnParallele\(n,LENS_ENVOIS_PARALLELES,async\(i,estArrete\)=>\{/.test(app), "le scan monte ses photos par envoyerEnParallele");
ok(/if\(estArrete\(\)\)return;\s*const\{data:\{publicUrl\}\}/.test(app), "un envoi retardataire n'écrit ni l'URL ni le marqueur");
ok(/urlsParRang\[i\]=publicUrl;/.test(app) && /const urls=urlsParRang\.filter\(Boolean\);/.test(app), "les URLs sont rangées par rang, jamais poussées dans l'ordre d'arrivée");
ok(!/urls\.push\(publicUrl\)/.test(app), "plus aucun urls.push dans l'ordre d'arrivée");
ok(/urls:urls\.slice\(0,LENS_PHOTOS_LUES\),\s*photos_fiche:urls,/.test(app), "l'analyse reçoit toujours les 5 premières (règle du 27/09 intacte)");

if (echecs) { console.error(`\n${echecs} échec(s)`); process.exit(1); }
console.log("\nTout est vert.");
