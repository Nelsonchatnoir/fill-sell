// VERROU DE PREUVE (19/11/2026 soir, demande de Nico avant la production) : la règle d'Opus-2 « aucune annonce ne part
// avec une seule photo » (4515207, get-pending-jobs + _shared/contenu-fiche.js uneSeulePhotoSansLecture) ne bloque QUE
// les fiches importées dont l'annonce d'origine n'a JAMAIS été lue (lecture épuisée : 3 relevés en 24 h). Un article qui
// n'a vraiment qu'une photo — annonce d'origine LUE — part normalement. Cas réel : compte cb64f482 (import eBay du 19/11
// au soir), 169 fiches à une photo, toutes à l'annonce d'origine lue (donnees_index_le) : aucune n'est retenue.
// Pas de correctif : la règle était déjà juste. Ce verrou empêche qu'elle s'élargisse sans qu'on le voie.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lectureOrigineEnAttente, uneSeulePhotoSansLecture } from "../supabase/functions/_shared/contenu-fiche.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let echecs = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };

const T = Date.parse("2026-11-19T22:00:00Z");
const ilYA = (h) => new Date(T - h * 3600_000).toISOString();
const unePhoto = ["https://i.ebayimg.com/images/g/abc/s-l1600.jpg"];
const ficheImport = (origine, extra = {}) => ({ id: 1793500000001, origine, photos: unePhoto, description: "", attributs: {}, ...extra });

console.log("1. Annonce d'origine LUE, une seule photo chez le vendeur : rien n'est retenu (la garde n'est jamais atteinte)");
{
  const ebayLue = [{ platform: "ebay", capture_le: null, detail_le: ilYA(2), disparu_le: null, photos_origine: 1 }];
  ok(lectureOrigineEnAttente(ficheImport("releve_ebay"), ebayLue, { maintenant: T }) === null,
    "eBay (détail lu par l'API, 1 photo) : la publication part normalement");
  const beebsLue = [{ platform: "beebs", capture_le: ilYA(1), disparu_le: null, photos_origine: 1 }];
  ok(lectureOrigineEnAttente(ficheImport("releve_beebs"), beebsLue, { maintenant: T }) === null,
    "Beebs (capture lue, 1 photo) : part normalement");
  const lbcLue = [{ platform: "leboncoin", capture_le: ilYA(30), disparu_le: null, photos_origine: 1 }];
  ok(lectureOrigineEnAttente(ficheImport("releve_leboncoin"), lbcLue, { maintenant: T }) === null,
    "Leboncoin (lue il y a 30 h, 1 photo) : part normalement");
  ok(lectureOrigineEnAttente(ficheImport("vinted_sync"), [], { origineLueLe: ilYA(3), maintenant: T }) === null,
    "Vinted (annonce lue) : part normalement");
  ok(lectureOrigineEnAttente({ id: 1, origine: "manuel", photos: unePhoto, description: "" }, [], { maintenant: T }) === null,
    "fiche saisie à la main (pas d'import) avec une photo : jamais retenue");
  const disparue = [{ platform: "ebay", capture_le: null, detail_le: null, disparu_le: ilYA(5), photos_origine: null }];
  ok(lectureOrigineEnAttente(ficheImport("releve_ebay"), disparue, { maintenant: T }) === null,
    "annonce d'origine disparue (vendue, terminée) : rien à lire, part normalement");
}

console.log("2. Seule l'annonce JAMAIS lue est retenue — le seul cas que la garde « une seule photo » peut toucher");
{
  const nonLue = [{ platform: "ebay", capture_le: null, detail_le: null, disparu_le: null, photos_origine: null }];
  const r = lectureOrigineEnAttente(ficheImport("releve_ebay"), nonLue, { maintenant: T });
  ok(r?.plateforme === "ebay" && r.manque.includes("photos"), "eBay jamais lue, une photo : retenue (attente de la lecture)");
  ok(uneSeulePhotoSansLecture({ photos: [{ url: unePhoto[0] }] }, { photos: unePhoto }) === true,
    "… et si la lecture est épuisée, la garde la rend à la personne (règle d'Opus-2, inchangée)");
}

console.log("3. Branchement : la garde vit SEULEMENT dans la boucle des publications retenues, lecture épuisée");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  const appels = [...gpj.matchAll(/uneSeulePhotoSansLecture\(/g)].map((m) => m.index);
  ok(appels.length === 1, "un seul appel dans get-pending-jobs");
  const avant = gpj.slice(Math.max(0, appels[0] - 900), appels[0]);
  ok(/for \(const j of candidats\)/.test(avant) && /if \(!pfR \|\| !plateformesEpuisees\.has\(pfR\)\) continue;/.test(avant)
    && /const pfR = retenusPlateforme\.get\(String\(j\.id\)\);/.test(avant),
    "appelée seulement pour une publication RETENUE (attente de lecture) dont la plateforme est épuisée");
  const srcFichiers = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? srcFichiers(path.join(d, e.name)) : (/\.(jsx?|mjs)$/.test(e.name) ? [path.join(d, e.name)] : []));
  ok(!srcFichiers("src").some((f) => lire(f).includes("uneSeulePhotoSansLecture")),
    "l'app ne bloque jamais d'elle-même un article à une photo (aucun appel dans src/)");
}

console.log(echecs ? `✗ ${echecs} échec(s) sur ${total}` : `Tout est vert (${total}).`);
process.exit(echecs ? 1 : 0);
