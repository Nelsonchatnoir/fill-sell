// ═══════════════════════════════════════════════════════════════════════════
// LENS : AUTANT DE PHOTOS QUE LE STEPPER, L'IA N'EN LIT QUE CINQ (2026-09-27)
// ═══════════════════════════════════════════════════════════════════════════
// Preuve de la règle et de son câblage :
//   · le viseur accepte MAX_PHOTOS (le plafond du stepper), plus aucun « 5 » ;
//   · l'IA ne reçoit que les LENS_PHOTOS_LUES premières (scan ET identify) ;
//   · la fiche garde TOUTES les photos, dans l'ordre (photos_fiche), et une
//     requête sans photos_fiche (app d'avant) se comporte exactement comme
//     avant ;
//   · le plafond Leboncoin reste appliqué au job (regles.js, inchangé).
import { readFileSync } from "node:fs";
import { MAX_PHOTOS, LENS_PHOTOS_LUES } from "../src/utils/photos.js";
import { photosDeLaFiche } from "../supabase/functions/lens-analysis/photos-fiche.js";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};
const url = (i) => `https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/lens-temp/lens/u/${i}.jpg`;
const liste = (n) => Array.from({ length: n }, (_, i) => url(i + 1));

console.log("1. LES DEUX PLAFONDS");
ok(MAX_PHOTOS === 20, "le viseur Lens a le plafond du stepper (20)");
ok(LENS_PHOTOS_LUES === 5, "l'IA lit 5 photos au plus");

console.log("2. LA FICHE GARDE TOUTES LES PHOTOS (serveur)");
const toutes = liste(12);
const lues = toutes.slice(0, LENS_PHOTOS_LUES);
ok(JSON.stringify(photosDeLaFiche(toutes, lues)) === JSON.stringify(toutes), "12 photos : la fiche les garde toutes, dans l'ordre");
ok(photosDeLaFiche(undefined, lues) === lues, "app d'avant (pas de photos_fiche) : la fiche garde les photos lues, comme avant");
ok(photosDeLaFiche(lues, lues).length === 5, "5 photos : rien ne change");
ok(photosDeLaFiche(liste(21), liste(21).slice(0, 5)).length === 5, "plus que le plafond du stepper : refusé, repli sur les photos lues");
ok(photosDeLaFiche([...toutes].reverse(), lues) === lues, "réordonnée (ne commence pas par les photos lues) : refusée");
ok(photosDeLaFiche(toutes.slice(0, 3), lues) === lues, "plus courte que les photos lues : refusée (jamais une photo lue perdue)");
ok(photosDeLaFiche([...lues, 42], lues) === lues, "une entrée qui n'est pas une URL : refusée");
ok(photosDeLaFiche([...lues, "http://x/6.jpg"], lues) === lues, "une URL non https : refusée");
ok(photosDeLaFiche("nimporte", lues) === lues, "pas une liste : refusée");

console.log("3. LE CÂBLAGE");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const lens = readFileSync(new URL("../src/tabs/LensTab.jsx", import.meta.url), "utf8");
const serveur = readFileSync(new URL("../supabase/functions/lens-analysis/index.ts", import.meta.url), "utf8");
ok(/urls:urls\.slice\(0,LENS_PHOTOS_LUES\),\s*photos_fiche:urls,/.test(app), "scan : l'IA reçoit les 5 premières, photos_fiche porte la liste entière");
ok(/urls:uploadedUrls\.slice\(0,LENS_PHOTOS_LUES\)/.test(lens), "identify (parcours gratuit) : l'IA reçoit les 5 premières");
ok(!/prev\.length>=5|room=5-|limit:5\b/.test(app), "App.jsx : plus aucun plafond « 5 » sur le viseur");
ok(!/maxPhotos=\{5\}|lensPhotos\.length<5|\/5 \{lang|jusqu'à 5\)/.test(lens), "LensTab.jsx : plus aucun plafond « 5 » affiché");
ok(/limit:Math\.max\(1,MAX_PHOTOS-lensPhotos\.length\)/.test(app), "photothèque native : limit jamais 0 (0 = illimité pour pickImages)");
const nbFiche = (serveur.match(/photos: photosFiche/g) ?? []).length;
ok(nbFiche === 4, "serveur : lens_scans (réservation ×2), inventaire et fiche_annonce reçoivent photos_fiche", `trouvé ${nbFiche}`);
ok(/cleIdempotence\(userId, mode, photoUrls\)/.test(serveur), "serveur : la clé du cache reste sur les photos LUES");
ok(/preparerPhotos\(photoUrls, supabaseUrl\)/.test(serveur), "serveur : l'analyse reste sur les photos LUES");

console.log("4. LE PLAFOND LEBONCOIN RESTE AU JOB");
const regles = readFileSync(new URL("../src/publication/moteur/regles.js", import.meta.url), "utf8");
ok(/rowPhotos = photosJob\.slice\(0, quotaPhotosLbc\)/.test(regles), "regles.js plafonne toujours le job Leboncoin");

if (echecs) { console.error(`\n${echecs} échec(s)`); process.exit(1); }
console.log("\nTout est vert.");
