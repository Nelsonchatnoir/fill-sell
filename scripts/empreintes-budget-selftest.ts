// selftest:empreintes-budget — (15/10, P18) Un appel d'empreintes-urls ne
// dépasse plus ses 2 s de CPU : 45 appels coupés en 24 h (journaux du 14/10
// 12:00 → 15/10 12:00 : 1 117 ms en moyenne pour 6 photos, coupés de 2 007 à
// 2 364 ms), qui perdaient leurs dernières photos.
// Règles : (1) une image trop grande est refusée AVANT d'être décodée, même
// verdict et même motif qu'après ; (2) un appel ne commence pas un décodage
// qu'il n'a plus le temps de finir — la photo est REMISE, jamais notée en
// échec (une URL en échec est « illisible » pour le moteur et fusion_photo_tick) ;
// (3) mêmes empreintes, au bit près, avec ou sans budget.
// Contrôle d'en-tête fait aussi sur 78 vraies photos (iPhone, web, PNG) le
// 15/10 : mêmes pixels que le décodage, 0 écart, WebP non lu (contrôle d'après).
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import {
  budgetDecodage, DecodageRemis, decoderEmpreinte, dimensionsEnTete, MAX_PIXELS,
} from "../supabase/functions/_shared/empreinte-telechargement.ts";

let n = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) { console.error(`  ✗ ${msg}`); Deno.exit(1); }
  n++; console.log(`  ✓ ${msg}`);
};
const lire = (p: string) => Deno.readTextFileSync(new URL(p, import.meta.url)).replace(/\r\n/g, "\n");

const photo = (w: number, h: number) => {
  const img = new Image(w, h);
  for (let y = 1; y <= h; y++) for (let x = 1; x <= w; x++) {
    img.setPixelAt(x, y, Image.rgbaToColor((x * 7) % 256, (y * 5) % 256, ((x + y) * 3) % 256, 255));
  }
  return img;
};
const jpeg = await photo(96, 64).encodeJPEG(85);
const png = await photo(40, 30).encode();

console.log("1. L'en-tête, sans décoder");
ok(JSON.stringify(dimensionsEnTete(jpeg)) === JSON.stringify({ largeur: 96, hauteur: 64 }), "JPEG : largeur et hauteur de la trame");
ok(JSON.stringify(dimensionsEnTete(png)) === JSON.stringify({ largeur: 40, hauteur: 30 }), "PNG : largeur et hauteur du bloc IHDR");
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
ok(dimensionsEnTete(webp) === null && dimensionsEnTete(new Uint8Array([1, 2, 3])) === null, "WebP ou inconnu : non lu (le contrôle d'après décodage reste)");
// Un en-tête JPEG qui annonce 3000×2500 (7,5 Mpx), suivi de rien de décodable.
const geant = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x09, 0xc4, 0x0b, 0xb8, 0x03, 0x01, 0x22, 0x00]);
ok(JSON.stringify(dimensionsEnTete(geant)) === JSON.stringify({ largeur: 3000, hauteur: 2500 }), "segment APP0 sauté, trame SOF0 lue");
let motif = "";
try { await decoderEmpreinte(geant); } catch (e) { motif = (e as Error).message; }
ok(motif === "trop de pixels (3000×2500)" && 3000 * 2500 > MAX_PIXELS, "image trop grande refusée AVANT le décodage, même motif qu'après");

console.log("2. Le budget de l'appel");
const libre = await decoderEmpreinte(jpeg);
const b = budgetDecodage(1_000);
const sous = await decoderEmpreinte(jpeg, b);
ok(JSON.stringify(libre) === JSON.stringify(sous), "mêmes empreintes, au bit près, avec ou sans budget");
ok(b.decodages === 1 && b.consommeMs > 0 && b.pixels === 96 * 64, "le décodage est mesuré (temps, pixels)");
const epuise = budgetDecodage(0);
await decoderEmpreinte(jpeg, epuise);
ok(epuise.decodages === 1, "le PREMIER décodage d'un appel part toujours (chaque appel avance)");
let remis: unknown = null;
try { await decoderEmpreinte(jpeg, epuise); } catch (e) { remis = e; }
ok(remis instanceof DecodageRemis && epuise.decodages === 1, "le suivant, hors budget, est remis sans être décodé");

console.log("3. empreintes-urls : une photo remise n'est jamais un échec");
const f = lire("../supabase/functions/empreintes-urls/index.ts");
const iRemis = f.indexOf("if (err instanceof DecodageRemis) { remise = true; restantes++; continue; }");
ok(iRemis > 0 && iRemis < f.indexOf("echecs.push({ url, motif });") && iRemis < f.indexOf('from("photo_empreintes_echecs").upsert'), "remise attrapée AVANT toute écriture d'échec");
ok(/empreinterUrl\(url, supabaseUrl, decodage\)/.test(f) && /budgetDecodage\(BUDGET_DECODAGE_MS\)/.test(f) && /const BUDGET_DECODAGE_MS = 1_000;/.test(f), "chaque appel porte un budget de 1 s de décodage");
ok(/if \(remise \|\| Date\.now\(\) - debut > BUDGET_MS\) \{ restantes\+\+; continue; \}/.test(f), "après une remise, les photos suivantes restent à faire (« restantes »)");
const t = lire("../supabase/functions/_shared/empreinte-telechargement.ts");
ok(/if \(e instanceof DecodageRemis\) throw e;/.test(t), "une remise n'essaie pas une autre version de la photo");

console.log("4. handler-watch : le filet des photos, une page par heure");
const h = lire("../supabase/functions/handler-watch/index.ts");
ok(/if \(budget > 0 && new Date\(\)\.getUTCMinutes\(\) < 3\) \{/.test(h), "une fois par heure (au lieu de toutes les 3 min)");
ok(/const page = Math\.floor\(Date\.now\(\) \/ 3_600_000\) % pages;/.test(h) && /\.order\("id", \{ ascending: true \}\)\s*\n\s*\.range\(page \* 500, page \* 500 \+ 499\);/.test(h), "à tour de rôle, triée : tout le parc importé revu en moins d'une journée");
ok(/\.eq\("photos_a_rapatrier", true\)/.test(h), "la file des nouveaux imports, elle, reste servie toutes les 3 min");

console.log(`\n✓ empreintes-budget : ${n} contrôles verts`);
