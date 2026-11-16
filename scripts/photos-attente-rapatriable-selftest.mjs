// ═══════════════════════════════════════════════════════════════════════════
// LA FILE N'ATTEND QUE CE QUE LE SERVEUR SAIT RAPATRIER, ET JAMAIS SANS FIN — SELFTEST « VERROU »
// (16/11/2026, lot du matin, point 4)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateurs : « Duck Tales » (yoann.besak, job 28bce155, en file depuis le 31/10) et la caisse à vin
// (ornellaracano, job f2bd4ee7, depuis le 07/11) — républications Leboncoin « pending » jamais servies.
// get-pending-jobs les retenait à chaque appel (« en attente … du rapatriement de ses photos ») : leurs fiches
// (vinted_sync) portent 3 photos sur images1.vinted.net, la copie 2 photos déjà chez nous ; contenuAImposer
// demandait le rapatriement… que handler-watch ne fait JAMAIS pour Vinted (décision de Nico du 06/09). Attente
// sans fin, sans un mot. Rouge sur le code d'avant, vert après :
//   1. des photos Vinted (ou d'un hôte inconnu) ne font jamais attendre : la copie part avec les siennes ;
//   2. des photos rapatriables (Beebs, Leboncoin, eBay, Depop) font attendre — 24 h au plus ;
//   3. la file et le rapatriement lisent LE MÊME test d'hôte (_shared/hotes-photos.js) ;
//   4. la retenue se voit sur la tâche (marque datée + message), et s'efface quand la copie part.
import fs from "node:fs";
import { contenuAImposer, ATTENTE_PHOTOS_APRES_LECTURE_MS } from "../supabase/functions/_shared/contenu-fiche.js";

let echecs = 0;
const ok = (cond, quoi, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${quoi}${cond || !detail ? "" : `   ← ${detail}`}`);
  if (!cond) echecs++;
};
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

let hotes = null;
try { hotes = await import("../supabase/functions/_shared/hotes-photos.js"); }
catch (e) { ok(false, "le module _shared/hotes-photos.js existe", String(e?.message ?? e).slice(0, 120)); }

// Données réelles anonymisées (job 28bce155, fiche 1793442894335010, lues le 16/11).
const NOUS = (n) => `https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-images/rehosted/1793442894335010/${n}.jpg`;
const VINTED = (n) => `https://images1.vinted.net/t/01_abc${n}/f800/1730000000.jpeg?s=x`;
const JOB = {
  platform: "leboncoin", action: "republish", photo_option: "original", created_at: "2026-10-31T16:10:00Z",
  title: "Duck Tales Game Boy", description: "Jeu Duck Tales Game Boy, cartouche seule.",
  photos: [{ url: NOUS(1), type: "original" }, { url: NOUS(2), type: "original" }],
  platform_fields: { etat: "Bon état" },
};
const FICHE = (photos) => ({
  origine: "vinted_sync", titre: "Duck Tales Game Boy", description: "Jeu Duck Tales Game Boy, cartouche seule.",
  photos, attributs: { etat: { v: "Bon état", source: "vinted_sync" }, description: { v: "x", source: "vinted_sync" } },
});
const TEMPS = { contenuLe: "2026-10-31T10:40:00Z", photosLuesLe: "2026-11-14T20:55:00Z", descriptionLueLe: null, etatLuLe: null };

console.log("\n1. Photos Vinted : jamais d'attente (le serveur ne les rapatrie pas)");
{
  const r = contenuAImposer(JOB, FICHE([VINTED(1), VINTED(2), VINTED(3)]), TEMPS);
  ok(r.photos_a_rapatrier !== true, "Duck Tales : la tâche n'attend plus un rapatriement qui n'arrivera jamais", JSON.stringify(r));
  ok(r.photos === undefined, "la copie part avec SES photos (jamais une adresse de CDN)");
  ok(r.photos_gardees === "photos_non_rapatriables", "le motif est tracé", String(r.photos_gardees));
  const mixte = contenuAImposer(JOB, FICHE(["https://images.beebs.app/a.jpg", "https://images.beebs.app/b.jpg", VINTED(3)]), TEMPS);
  ok(mixte.photos_a_rapatrier !== true, "deux photos Beebs + une Vinted : pas d'attente (la Vinted ne viendra jamais)", JSON.stringify(mixte));
  const inconnu = contenuAImposer(JOB, FICHE([NOUS(1), NOUS(2), "https://exemple.org/p.jpg"]), TEMPS);
  ok(inconnu.photos_a_rapatrier !== true, "hôte inconnu (jamais rapatrié) : pas d'attente", JSON.stringify(inconnu));
}

console.log("\n2. Photos rapatriables : on attend — 24 h au plus");
{
  const fiche = FICHE(["https://images.beebs.app/a.jpg", "https://images.beebs.app/b.jpg", "https://images.beebs.app/c.jpg"]);
  ok(contenuAImposer(JOB, fiche, TEMPS).photos_a_rapatrier === true, "photos Beebs : on attend leur rapatriement (comportement d'avant)");
  const ebay = FICHE(["https://i.ebayimg.com/images/g/a/s-l1600.jpg", "https://i.ebayimg.com/images/g/b/s-l1600.jpg", "https://i.ebayimg.com/images/g/c/s-l1600.jpg"]);
  ok(contenuAImposer(JOB, ebay, TEMPS).photos_a_rapatrier === true, "photos eBay : on attend");
  const recent = new Date(Date.now() - 3600_000).toISOString();
  ok(contenuAImposer(JOB, fiche, { ...TEMPS, attentePhotosDepuis: recent }).photos_a_rapatrier === true, "attente d'une heure : on attend encore");
  const vieux = new Date(Date.now() - ATTENTE_PHOTOS_APRES_LECTURE_MS - 60_000).toISOString();
  const ep = contenuAImposer(JOB, fiche, { ...TEMPS, attentePhotosDepuis: vieux });
  ok(ep.photos_a_rapatrier !== true && ep.photos_gardees === "attente_epuisee", "au-delà de 24 h : la copie part (photo morte, rapatriement en échec)", JSON.stringify(ep));
  const chezNous = contenuAImposer(JOB, FICHE([NOUS(1), NOUS(2), NOUS(3)]), TEMPS);
  ok(Array.isArray(chezNous.photos) && chezNous.photos.length === 3, "toutes chez nous : elles partent (comportement d'avant)");
}

console.log("\n3. Un seul test d'hôte, des deux côtés");
if (hotes) {
  ok(hotes.photoRapatriableParLeServeur("https://images.beebs.app/a.jpg") === true, "Beebs rapatriable");
  ok(hotes.photoRapatriableParLeServeur("https://img.leboncoin.fr/api/v1/x.jpg") === true, "Leboncoin rapatriable");
  ok(hotes.photoRapatriableParLeServeur("https://media-photos.depop.com/b1/x.jpg") === true, "Depop rapatriable");
  ok(hotes.photoRapatriableParLeServeur(VINTED(1)) === false, "Vinted jamais (décision du 06/09)");
  ok(hotes.photoRapatriableParLeServeur("http://images.beebs.app/a.jpg") === false, "jamais en http");
  ok(hotes.photoRapatriableParLeServeur("https://x.cloudfront.net/a.jpg") === false, "cloudfront mutualisé : hôte exact seulement");
  ok(hotes.estCdnPlateforme(VINTED(1)) === true, "Vinted reste un CDN de plateforme (rien d'autre ne change)");
}
{
  const rap = lire("supabase/functions/_shared/photos-rapatriement.ts");
  ok(/from "\.\/hotes-photos\.js"/.test(rap), "photos-rapatriement.ts lit _shared/hotes-photos.js");
  ok(!/const CDN_DOMAINES_PLATEFORMES\s*=/.test(rap), "plus de seconde liste d'hôtes dans photos-rapatriement.ts");
  const cf = lire("supabase/functions/_shared/contenu-fiche.js");
  ok(/import \{ photoRapatriableParLeServeur \} from "\.\/hotes-photos\.js"/.test(cf), "contenu-fiche.js lit le même test");
}

console.log("\n3 bis. La recréation n'attend pas non plus ce qui ne viendra jamais (capture-corrigee.js)");
{
  const { photosDeLaFicheALaRecreation } = await import("../supabase/functions/_shared/capture-corrigee.js");
  const depot = { photos: [NOUS(1)], photo_option: "original", created_at: "2026-10-23T09:00:00.000Z" };
  const fV = { origine: "releve_vinted", photos: [VINTED(1), VINTED(2)] };
  ok(photosDeLaFicheALaRecreation(fV, depot, "2026-10-23T09:55:00.000Z") === null, "photos Vinted : pas d'« attendre » (le dépôt garde ses photos)");
  const fB = { origine: "releve_beebs", photos: ["https://images.beebs.app/a.jpg", "https://images.beebs.app/b.jpg"] };
  ok(photosDeLaFicheALaRecreation(fB, depot, "2026-10-23T09:55:00.000Z")?.attendre === true, "photos Beebs : on attend leur rapatriement (comportement d'avant)");
}

console.log("\n4. La retenue se voit sur la tâche, et s'efface (get-pending-jobs)");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/attentePhotosDepuis:/.test(gpj), "get-pending-jobs donne la date de l'attente à la règle");
  ok(/pfW\.attente_photos_fiche = \{ depuis:/.test(gpj), "la première retenue date l'attente sur la tâche");
  ok(/en cours de copie chez FillSell/.test(gpj), "et la dit (message sur la tâche)");
  ok(/if \(!pfW\.attente_photos_fiche\)/.test(gpj), "une seule écriture (jamais une ligne inchangée réécrite)");
  ok(/delete pfL\.attente_photos_fiche/.test(gpj), "la marque s'efface quand la copie part");
}

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ tout est vert");
if (echecs) process.exit(1);
