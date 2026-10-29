// Autotest — une photo morte chez la plateforme ne bloque plus la publication — `npm run selftest:photos-mortes`
// (_shared/photos-mortes.js, handler-watch). Cas relevé en base le 29/10 : ornellaracano, « Fausse plante tropicale
// 107 cm + pot noir » (job 64da7249, Leboncoin) — photo 2 sur images1.vinted.net, 404 lu par le serveur à 07:54 et
// 07:57 (deux balayages), publication « pas abouti après plusieurs essais ».
import fs from "node:fs";
import { trancherPhotosMortes, plateformeDePhoto } from "../supabase/functions/_shared/photos-mortes.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const NOUS = "https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/";
const VINTED = "https://images1.vinted.net/tc/05_0116a_pNL8L7hD4cWoQ723qsrUMar1/1791299257.jpeg?s=069b9017126a4884b7da4c54074a2d885139b908";
const estExterne = (u) => typeof u === "string" && !u.startsWith(NOUS);
const photos = [
  { url: `${NOUS}f8aa02a5/rehosted/1791573109144011/1793253531758_0.jpg`, type: "original" },
  { url: VINTED, type: "photo_1" },
  { url: `${NOUS}f8aa02a5/rehosted/1791573109144011/1793256841553_watch_1.jpg`, type: "photo_2" },
];

console.log("\n1. ORNELLA : LA PHOTO 2 N'EXISTE PLUS CHEZ VINTED (404)");
const t = trancherPhotosMortes({ photos, vivantes: new Map(), mortes: new Map([[VINTED, 404]]), estExterne });
ok(t.verdict === "relancee", "la publication repart");
ok(t.photos.length === 2 && t.photos.every((p) => p.url.startsWith(NOUS)), "avec les 2 photos à nous, dans l'ordre", JSON.stringify(t.photos));
ok(t.photos[0].type === "original" && t.photos[1].type === "photo_2", "la forme des photos est gardée ({ url, type })");
ok(t.indices.length === 1 && t.indices[0] === 2, "la photo retirée est la n° 2");
ok(/la photo 2 n'existe plus chez Vinted/.test(t.message) && /les 2 autres photos/.test(t.message), "le message dit quelle photo manque, où, et avec quoi l'annonce part", t.message);

console.log("\n2. JAMAIS RIEN INVENTÉ, JAMAIS RIEN RETIRÉ À TORT");
ok(trancherPhotosMortes({ photos: [{ url: VINTED }], vivantes: new Map(), mortes: new Map([[VINTED, 404]]), estExterne }).verdict === "inchangee",
  "une seule photo, morte → rien ne part (aucune annonce sans photo)");
ok(trancherPhotosMortes({ photos, vivantes: new Map(), mortes: new Map(), estExterne }).verdict === "inchangee",
  "aucune photo morte prouvée (refus passager) → inchangée");
const vivante = trancherPhotosMortes({ photos, vivantes: new Map([[VINTED, `${NOUS}x/rehosted/morte_0.jpg`]]), mortes: new Map(), estExterne });
ok(vivante.verdict === "relancee" && vivante.photos.length === 3 && vivante.photos[1].url.endsWith("morte_0.jpg"), "photo encore lisible → rapatriée, les 3 gardées");
const deuxExternes = [...photos, { url: "https://cdn.beebs.app/x.jpg" }];
ok(trancherPhotosMortes({ photos: deuxExternes, vivantes: new Map(), mortes: new Map([[VINTED, 404]]), estExterne }).verdict === "inchangee",
  "une autre photo encore hors FillSell et non tranchée → inchangée (jamais un dépôt qui raterait encore)");
ok(plateformeDePhoto("https://cdn.beebs.app/a.jpg") === "Beebs" && plateformeDePhoto("https://i.ebayimg.com/a.jpg") === "eBay" && plateformeDePhoto("https://img.leboncoin.fr/a") === "Leboncoin", "le nom de la plateforme vient de l'hôte");

console.log("\n3. HANDLER-WATCH L'APPLIQUE");
const hw = fs.readFileSync(new URL("../supabase/functions/handler-watch/index.ts", import.meta.url), "utf8");
ok(hw.includes("trancherPhotosMortes({ photos: j.photos as unknown[], vivantes, mortes,"), "handler-watch tranche par la règle pure");
ok(hw.includes("else if (etat.http === 404 || etat.http === 410) mortes.set("), "seuls 404 et 410 prouvent une photo morte (jamais un 403)");
ok(hw.includes("if (pf.photos_mortes_tranchees || !(j.status === \"failed\" || j.status === \"needs_user\")) continue;"), "une seule vérification par job, seulement sur une publication en échec");
ok(/\.update\(patchM\)\.eq\("id", j\.id\)\.eq\("status", j\.status\)/.test(hw), "écriture sous condition du statut lu");

if (ko) { console.error(`\n✗ ${ko} contrôle(s) en échec`); process.exit(1); }
console.log("\n✓ photos mortes : tous les contrôles passent");
