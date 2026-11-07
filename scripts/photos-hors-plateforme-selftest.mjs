// Autotest — les photos d'un job qui part AILLEURS sont chez nous, vérifiées, avant de partir — `npm run selftest:photos-hors-plateforme`
// (_shared/photos-hors-plateforme.js ; get-pending-jobs retient, handler-watch copie et vérifie). Pur, sans réseau.
// Cas relevé en base le 07/11 : job 32e12d08 (republication Leboncoin, compte de Nico, 3 photos sur
// images1.vinted.net), pré-vol « formulaire de recréation illisible » à 09:18Z — « La photo 3 de l'annonce n'a pas pu
// être téléchargée depuis la page de dépôt » ; 22 jobs ainsi en attente (5 comptes), 32 annulés en 30 jours.
import fs from "node:fs";
import {
  CLE_PHOTOS_HORS_PLATEFORME, TRACE_PHOTOS_RAPATRIEES, plateformeDuCdn, photoARapatrierPour, photosARapatrierPour,
  remplacerPhotos, typeImageDesOctets, copieVerifiee, gardePhotosHorsPlateforme, bilanCopiePhotos, aEssayerCeCycle,
  estMessagePhotosHorsPlateforme, messagePhotosHorsPlateforme, ESSAIS_VAINS_AVANT_ATTENTE,
} from "../supabase/functions/_shared/photos-hors-plateforme.js";
import { trancherPhotosMortes } from "../supabase/functions/_shared/photos-mortes.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const NOUS = "https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/";
const V1 = "https://images1.vinted.net/tc/01_01ef8_PQXcjsSwGm7eaTZgS6HuMkw4/28ba4a4f.jpeg?s=3cfe7f7b4c30fff34ea2b46fb13da732e5caf545";
const V2 = "https://images1.vinted.net/tc/02_0182c_dXx9kEAAfRd2WwQ89DtXnw8y/bad77d93.jpeg?s=6138aef2130ae872c31756aa8ecb5341d8ee667e";
const V3 = "https://images1.vinted.net/tc/06_0004c_iD1vSpf8nE7s7VEhaPKa8ZhD/d32de534.jpeg?s=e9d532cddd2b87d83519e07b5daff190973cc9d1";
const LBC = "https://img.leboncoin.fr/api/v1/lbcpb1/images/ff/ab/87/ffab870c0c702a3a6e005abc127c76b53b762b43.jpg?rule=ad-large";
const BEEBS = "https://cdn.beebs.app/f952dab5-bb76-4f39-ba2f-fe0632f33346.jpg";
const DEPOP = "https://media-photos.depop.com/r1/354133689/5142317582_56fb114b625d413b8283a9966b1cbf67/P0.jpg";
const EBAY = "https://i.ebayimg.com/images/g/ZZoAAeSwNhhq5Kh4/s-l1600.jpg";
const OPLA = "https://d2f61lx5s6m7uh.cloudfront.net/images/x/art_a/ima_b.webp";
const MAINTENANT = "2026-11-07T10:00:00.000Z";

console.log("\n1. LA LISTE FERMÉE : QUEL CDN, QUELLE PLATEFORME");
ok(plateformeDuCdn(V1) === "vinted" && plateformeDuCdn(LBC) === "leboncoin" && plateformeDuCdn(BEEBS) === "beebs"
  && plateformeDuCdn(DEPOP) === "depop" && plateformeDuCdn(EBAY) === "ebay" && plateformeDuCdn(OPLA) === "opla", "les six CDN relevés au parc");
ok(plateformeDuCdn(`${NOUS}a/b.jpg`) === null, "chez nous : aucune plateforme");
ok(plateformeDuCdn("http://images1.vinted.net/x.jpg") === null, "http (pas https) : refusé");
ok(plateformeDuCdn("https://images1.vinted.net.evil.example/x.jpg") === null && plateformeDuCdn("https://notvinted.net/x.jpg") === null,
  "un hôte qui IMITE un CDN n'en est pas un (jamais un proxy de téléchargement)");
ok(plateformeDuCdn("https://d1234.cloudfront.net/x.jpg") === null, "cloudfront.net mutualisé : seule la distribution d'Opla, nommée exactement");
ok(plateformeDuCdn("https://fillsell.app/landing/tshirt.webp") === null && plateformeDuCdn("https://files.3dsellers.com/x.avif") === null,
  "les autres hôtes du parc (vitrine, 3dsellers) ne sont pas des CDN de plateforme");
// La liste est la MÊME que celle d'estCdnPlateforme (photos-rapatriement.ts) : deux listes dériveraient.
const rap = fs.readFileSync(new URL("../supabase/functions/_shared/photos-rapatriement.ts", import.meta.url), "utf8");
const domainesTs = JSON.parse((rap.match(/const CDN_DOMAINES_PLATEFORMES = (\[[^\]]*\])/) ?? [])[1] ?? "null");
const exactsTs = JSON.parse((rap.match(/const CDN_HOTES_EXACTS = (\[[^\]]*\])/) ?? [])[1] ?? "null");
ok(Array.isArray(domainesTs) && domainesTs.every((d) => plateformeDuCdn(`https://${d}/x.jpg`) !== null && plateformeDuCdn(`https://sous.${d}/x.jpg`) !== null)
  && Array.isArray(exactsTs) && exactsTs.every((h) => plateformeDuCdn(`https://${h}/x.jpg`) !== null),
  "chaque hôte d'estCdnPlateforme est reconnu ici", JSON.stringify({ domainesTs, exactsTs }));
const dansTs = (u) => { const h = new URL(u).hostname; return exactsTs.includes(h) || domainesTs.some((d) => h === d || h.endsWith(`.${d}`)); };
ok([V1, LBC, BEEBS, DEPOP, EBAY, OPLA].every(dansTs), "et l'inverse : tout CDN reconnu ici est téléchargeable par rapatrierPhotoVerifiee (sinon un job resterait retenu pour rien)");

console.log("\n2. LA RÈGLE : UNE PHOTO D'UNE AUTRE PLATEFORME EST CHEZ NOUS AVANT DE PARTIR");
ok(photoARapatrierPour(V1, "leboncoin") === true, "Vinted → Leboncoin : à copier (le cas du 07/11)");
ok(photoARapatrierPour(V1, "beebs") && photoARapatrierPour(V1, "depop") && photoARapatrierPour(V1, "ebay"), "Vinted → Beebs, Depop, eBay : à copier");
ok(photoARapatrierPour(V1, "vinted") === false, "Vinted → Vinted : non (vinted.fr reçoit l'en-tête CORS de son CDN)");
ok(photoARapatrierPour(LBC, "leboncoin") === false && photoARapatrierPour(DEPOP, "depop") === false && photoARapatrierPour(EBAY, "ebay") === false,
  "Leboncoin, Depop, eBay chez eux : non");
ok(photoARapatrierPour(LBC, "vinted") && photoARapatrierPour(DEPOP, "leboncoin") && photoARapatrierPour(EBAY, "beebs") && photoARapatrierPour(OPLA, "leboncoin"),
  "toute autre combinaison : à copier (le CORS d'un CDN change sans prévenir)");
ok(photoARapatrierPour(BEEBS, "beebs") === true && photoARapatrierPour(BEEBS, "leboncoin") === true, "Beebs partout, même chez lui : son CDN ne sert aucun CORS (mesuré le 07/11)");
ok(photoARapatrierPour(`${NOUS}x.jpg`, "leboncoin") === false, "une photo chez nous : jamais recopiée");
const ordre = photosARapatrierPour([`${NOUS}a.jpg`, { url: V2, type: "photo_1" }, LBC, { url: V3 }], "leboncoin");
ok(ordre.length === 2 && ordre[0].index === 1 && ordre[1].index === 3 && ordre[0].cdn === "vinted", "les photos à copier, dans l'ordre de l'article, avec leur rang", JSON.stringify(ordre));

console.log("\n3. GET-PENDING-JOBS : LE JOB 32e12d08 N'EST PAS SERVI, IL EST MARQUÉ, RIEN N'EST RETIRÉ");
const job32 = {
  id: "32e12d08-eb81-449f-afe7-aa5e2d1f9a67", action: "republish", platform: "leboncoin", status: "pending", error: null,
  photos: [{ url: V1, type: "original" }, { url: V2, type: "photo_1" }, { url: V3, type: "photo_2" }],
  platform_fields: { republish_step: "captured", next_action_after: "2026-11-07T09:48:34.922Z" },
};
const g1 = gardePhotosHorsPlateforme(job32, { maintenant: MAINTENANT, retraitEngage: false });
ok(g1.servir === false && g1.aRapatrier.length === 3, "retenu : 3 photos Vinted à copier avant de partir");
const m1 = g1.ecrire?.platform_fields?.[CLE_PHOTOS_HORS_PLATEFORME];
ok(m1 && m1.restantes === 3 && m1.plateforme === "leboncoin" && m1.depuis === MAINTENANT && JSON.stringify(m1.cdns) === '["vinted"]', "la marque dit combien, d'où, pour où, depuis quand", JSON.stringify(m1));
ok(g1.ecrire.platform_fields.next_action_after === "2026-11-07T09:48:34.922Z" && g1.ecrire.platform_fields.republish_step === "captured",
  "rien d'autre n'est touché (créneau, étape)");
const msg1 = g1.ecrire.error;
ok(typeof msg1 === "string" && /hébergées chez Vinted/.test(msg1) && /page de dépôt Leboncoin ne peut pas les lire/.test(msg1)
  && /Ton annonce est toujours en ligne, rien n'a été retiré\./.test(msg1) && !/rapatrie automatiquement/.test(msg1), "la phrase dit la vérité", msg1);
ok(estMessagePhotosHorsPlateforme(msg1), "la phrase est reconnaissable (pour l'effacer, jamais celle d'une autre règle)");
const job32b = { ...job32, error: msg1, platform_fields: g1.ecrire.platform_fields };
const g2 = gardePhotosHorsPlateforme(job32b, { maintenant: "2026-11-07T10:01:00.000Z", retraitEngage: false });
ok(g2.servir === false && g2.ecrire === undefined, "poll suivant, rien n'a changé : retenu, AUCUNE écriture (jamais une ligne inchangée réécrite)");
ok(gardePhotosHorsPlateforme({ ...job32, action: "delete" }, { maintenant: MAINTENANT }).servir === true, "un retrait n'envoie aucune photo : jamais retenu");
ok(gardePhotosHorsPlateforme({ id: "v", action: "republish", platform: "vinted", photos: null, platform_fields: {} }, { maintenant: MAINTENANT }).servir === true,
  "republication Vinted (photos de la capture, job.photos vide) : servie comme avant");
ok(gardePhotosHorsPlateforme({ ...job32, platform: "vinted" }, { maintenant: MAINTENANT }).servir === true, "photos Vinted vers Vinted : servie comme avant");
const pub = gardePhotosHorsPlateforme({ ...job32, action: "publish", platform_fields: {} }, { maintenant: MAINTENANT });
ok(pub.servir === false && /La publication part toute seule/.test(pub.ecrire.error) && !/rien n'a été retiré/.test(pub.ecrire.error), "une PUBLICATION est retenue aussi, avec sa phrase", pub.ecrire.error);
const eng = gardePhotosHorsPlateforme(job32, { maintenant: MAINTENANT, retraitEngage: true });
ok(eng.servir === false && /sera recréée/.test(eng.ecrire.error) && !/toujours en ligne/.test(eng.ecrire.error), "retrait déjà engagé : la phrase ne prétend pas l'annonce en ligne", eng.ecrire.error);
const autre = gardePhotosHorsPlateforme({ ...job32, error: "En file : ta republication passera à son tour, une à la fois. Ton annonce est toujours en ligne." }, { maintenant: MAINTENANT });
ok(autre.ecrire?.error === msg1, "un message d'avant (périmé : le job allait partir) est remplacé par la vraie raison (get-pending-jobs l'archive)");

console.log("\n4. HANDLER-WATCH : COPIE VÉRIFIÉE, À SA PLACE, PUIS LE JOB PART");
const C = (n) => `${NOUS}f44b5917/rapatrie-job/1793009407689000/32e12d08_${n}_1.jpg`;
const tout = new Map([[V1, C(1)], [V2, C(2)], [V3, C(3)]]);
const b1 = bilanCopiePhotos(job32b, tout, [], { maintenant: MAINTENANT, retraitEngage: false });
ok(b1.libre === true && b1.photos.map((p) => p.url).join() === [C(1), C(2), C(3)].join(), "toutes copiées : les URL chez nous, dans l'ordre de l'article");
ok(b1.photos.map((p) => p.type).join() === "original,photo_1,photo_2", "la forme { url, type } est gardée");
ok(!(CLE_PHOTOS_HORS_PLATEFORME in b1.platform_fields) && b1.platform_fields[TRACE_PHOTOS_RAPATRIEES]?.copiees === 3, "la marque tombe, une trace reste");
ok(b1.error === null, "notre phrase s'efface (le job part)");
const g3 = gardePhotosHorsPlateforme({ ...job32b, photos: b1.photos, platform_fields: b1.platform_fields, error: null }, { maintenant: MAINTENANT });
ok(g3.servir === true && g3.ecrire === undefined, "poll suivant : SERVI, sans écriture");
const g4 = gardePhotosHorsPlateforme({ ...job32b, photos: b1.photos }, { maintenant: MAINTENANT });
ok(g4.servir === true && g4.ecrire && !(CLE_PHOTOS_HORS_PLATEFORME in g4.ecrire.platform_fields) && g4.ecrire.error === null,
  "copiées par un autre chemin, marque encore là : servi, marque et phrase effacées");
const g5 = gardePhotosHorsPlateforme({ ...job32b, photos: b1.photos, error: "Autre règle" }, { maintenant: MAINTENANT });
ok(g5.ecrire?.error === undefined, "le message d'une autre règle n'est jamais effacé");
const b2 = bilanCopiePhotos(job32b, new Map([[V1, C(1)]]), [], { maintenant: MAINTENANT, retraitEngage: false });
ok(b2.libre === false && b2.platform_fields[CLE_PHOTOS_HORS_PLATEFORME].restantes === 2 && b2.photos[0].url === C(1) && b2.photos[1].url === V2,
  "budget du cycle épuisé : la copie faite est gardée, le job reste retenu (2 restantes)");
ok(b2.platform_fields[CLE_PHOTOS_HORS_PLATEFORME].depuis === MAINTENANT, "la date de la retenue est gardée");
const dup = remplacerPhotos([V1, { url: V1, type: "x" }, `${NOUS}a.jpg`], new Map([[V1, C(1)]]));
ok(dup[0] === C(1) && dup[1].url === C(1) && dup[1].type === "x" && dup[2] === `${NOUS}a.jpg`, "chaînes nues et objets, doublons : chacun remplacé à sa place");

console.log("\n5. UNE PHOTO QUI NE SE COPIE PAS : LE JOB RESTE RETENU, ET LE DIT");
let j = job32b;
for (let i = 1; i <= ESSAIS_VAINS_AVANT_ATTENTE; i++) {
  const b = bilanCopiePhotos(j, new Map(), [{ url: V1, http: 403, motif: "HTTP 403" }], { maintenant: `2026-11-07T10:0${i}:00.000Z`, retraitEngage: false });
  j = { ...j, photos: b.photos, platform_fields: b.platform_fields, error: b.error === undefined ? j.error : b.error };
}
const mE = j.platform_fields[CLE_PHOTOS_HORS_PLATEFORME];
ok(mE.essais_vains === ESSAIS_VAINS_AVANT_ATTENTE && mE.echec && mE.prochain_essai === "2026-11-07T11:03:00.000Z", "trois cycles sans copie : en échec, un essai par heure", JSON.stringify(mE));
ok(/Vinted ne nous a pas encore laissé copier la photo 1/.test(j.error) && /FillSell réessaie tout seul/.test(j.error) && /rien n'a été retiré/.test(j.error), "la phrase dit laquelle, et que FillSell réessaie seul", j.error);
const tousLesTextes = [msg1, pub.ecrire.error, eng.ecrire.error, j.error, messagePhotosHorsPlateforme({ action: "republish", cible: "leboncoin", cdns: ["vinted"], echec: { indices: [2], mortes: [2] } })];
ok(tousLesTextes.every((t) => !/quelques minutes|toutes les heures|dans \d|d'ici|heure/i.test(t)), "aucun délai promis (règle du 16/10 : ni durée, ni heure prévue)", tousLesTextes.join(" | "));
ok(aEssayerCeCycle(j, Date.parse("2026-11-07T10:30:00.000Z")) === false && aEssayerCeCycle(j, Date.parse("2026-11-07T11:04:00.000Z")) === true, "handler-watch respecte l'attente");
ok(gardePhotosHorsPlateforme(j, { maintenant: "2026-11-07T10:30:00.000Z" }).servir === false, "⛔ en échec : jamais servi (aucune annonce retirée sans ses photos)");
const g6 = gardePhotosHorsPlateforme(j, { maintenant: "2026-11-07T10:30:00.000Z" });
ok(g6.ecrire === undefined, "en échec, le poll ne réécrit rien (la phrase d'échec est déjà la bonne)");
const reprise = bilanCopiePhotos(j, new Map([[V1, C(1)]]), [], { maintenant: "2026-11-07T11:04:00.000Z", retraitEngage: false });
ok(!reprise.platform_fields[CLE_PHOTOS_HORS_PLATEFORME].echec && !reprise.platform_fields[CLE_PHOTOS_HORS_PLATEFORME].prochain_essai
  && reprise.platform_fields[CLE_PHOTOS_HORS_PLATEFORME].essais_vains === 0 && /Copie des photos chez FillSell en cours/.test(reprise.error),
  "une copie réussit : l'échec tombe, la phrase redevient « en cours »", reprise.error);

console.log("\n6. UNE PHOTO MORTE CHEZ LA PLATEFORME (404 sur deux cycles)");
const trancher = (cible) => (photos, mortes) => trancherPhotosMortes({ photos, vivantes: new Map(), mortes, estExterne: (u) => photoARapatrierPour(u, cible) });
const jobPub = { ...job32b, action: "publish", photos: [{ url: C(1), type: "original" }, { url: V2, type: "photo_1" }, { url: C(3), type: "photo_2" }] };
const p1 = bilanCopiePhotos(jobPub, new Map(), [{ url: V2, http: 404 }], { maintenant: MAINTENANT, trancherMortes: trancher("leboncoin") });
ok(p1.libre === false && p1.photos.length === 3, "un premier 404 ne prouve rien : rien retiré");
const p2 = bilanCopiePhotos({ ...jobPub, platform_fields: p1.platform_fields, error: p1.error ?? jobPub.error }, new Map(), [{ url: V2, http: 404 }],
  { maintenant: "2026-11-07T10:03:00.000Z", trancherMortes: trancher("leboncoin") });
ok(p2.libre === true && p2.photos.length === 2 && p2.photos.every((p) => p.url.startsWith(NOUS)) && JSON.stringify(p2.mortesRetirees) === "[2]",
  "PUBLICATION : deux 404 → la photo 2 sort de la copie (règle du 29/10), la publication part", JSON.stringify(p2.photos));
ok(/la photo 2 n'existe plus chez Vinted/.test(p2.error ?? ""), "et la phrase dit laquelle manque", p2.error);
const jobRep = { ...jobPub, action: "republish" };
const r1 = bilanCopiePhotos(jobRep, new Map(), [{ url: V2, http: 404 }], { maintenant: MAINTENANT, trancherMortes: trancher("leboncoin") });
const r2 = bilanCopiePhotos({ ...jobRep, platform_fields: r1.platform_fields, error: r1.error ?? jobRep.error }, new Map(), [{ url: V2, http: 410 }],
  { maintenant: "2026-11-07T10:03:00.000Z", trancherMortes: trancher("leboncoin") });
ok(r2.libre === false && r2.photos.length === 3 && /la photo 2 n'existe plus chez Vinted/.test(r2.error) && /en pause/.test(r2.error) && /rien n'a été retiré/.test(r2.error),
  "REPUBLICATION : jamais une photo en moins que l'annonce en ligne — en pause, et elle le dit", r2.error);
const f403 = bilanCopiePhotos({ ...jobPub, platform_fields: p1.platform_fields }, new Map(), [{ url: V2, http: 403 }], { maintenant: "2026-11-07T10:03:00.000Z", trancherMortes: trancher("leboncoin") });
ok(f403.libre === false && f403.photos.length === 3, "un 403 ne prouve jamais une photo morte");

console.log("\n7. LA COPIE EST PROUVÉE PAR SES OCTETS ET RELUE");
const octets = (arr) => Uint8Array.from([...arr, ...new Array(16).fill(0)]);
ok(typeImageDesOctets(octets([0xff, 0xd8, 0xff, 0xe0])) === "image/jpeg", "JPEG");
ok(typeImageDesOctets(octets([0x89, 0x50, 0x4e, 0x47])) === "image/png", "PNG");
ok(typeImageDesOctets(octets([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])) === "image/webp", "WEBP");
ok(typeImageDesOctets(octets([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])) === "image/avif", "AVIF");
ok(typeImageDesOctets(new TextEncoder().encode("<!DOCTYPE html><html>")) === null, "une page HTML servie en « image/jpeg » n'est PAS une image");
ok(typeImageDesOctets(new Uint8Array(0)) === null, "vide : refusé");
ok(copieVerifiee({ status: 200, contentType: "image/jpeg", taille: 30957, attendus: 30957 }) === true, "relue : 200, image, même taille → vérifiée");
ok(copieVerifiee({ status: 200, contentType: "image/jpeg", taille: 0, attendus: 30957 }) === false
  && copieVerifiee({ status: 404, contentType: "image/jpeg", taille: 30957, attendus: 30957 }) === false
  && copieVerifiee({ status: 200, contentType: "text/html", taille: 30957, attendus: 30957 }) === false
  && copieVerifiee({ status: 200, contentType: "image/jpeg", taille: 100, attendus: 30957 }) === false, "tronquée, absente, pas une image : refusée");

console.log("\n8. LES PHRASES");
ok(/Vinted et Beebs/.test(messagePhotosHorsPlateforme({ action: "republish", cible: "leboncoin", cdns: ["vinted", "beebs"] })), "plusieurs CDN nommés");
ok(/la page de dépôt Depop/.test(messagePhotosHorsPlateforme({ action: "publish", cible: "depop", cdns: ["vinted"] })), "la plateforme visée nommée");

console.log("\n9. LE BRANCHEMENT (get-pending-jobs, handler-watch, photos-rapatriement)");
const gpj = fs.readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
const iGarde = gpj.indexOf("gardePhotosHorsPlateforme(j, { maintenant: maintenantPh, retraitEngage: retraitEngage(j) })");
const iResa = gpj.indexOf('admin.rpc("reserver_jobs_extension"');
ok(iGarde > 0 && iResa > iGarde, "get-pending-jobs : la garde passe AVANT la réservation (un job retenu n'est jamais réservé ni servi)");
ok(/out = out\.filter\(\(j\) => !retenusPh\.has\(String\(j\.id\)\)\);/.test(gpj), "get-pending-jobs : les jobs retenus sortent de la file");
ok(gpj.indexOf("retenusPh.add(String(j.id))") < gpj.indexOf("adminPh.from(\"cross_post_jobs\").update(majPh)"),
  "la retenue est décidée AVANT toute écriture (une écriture refusée ne sert jamais le job)");
ok(/\.update\(majPh\)\s*\n\s*\.eq\("id", String\(j\.id\)\)\.eq\("status", "pending"\)/.test(gpj), "get-pending-jobs : écriture sous condition du statut");
const hw = fs.readFileSync(new URL("../supabase/functions/handler-watch/index.ts", import.meta.url), "utf8");
const debutHw = hw.indexOf("LES PHOTOS D'UN JOB QUI PART AILLEURS : CHEZ NOUS ET VÉRIFIÉES");
const finHw = hw.indexOf("── Photos encore HORS FillSell au moment de publier (2026-08-27)");
const bloc = hw.slice(debutHw, finHw);
ok(debutHw > 0 && finHw > debutHw, "handler-watch : la file des jobs marqués passe AVANT l'ancien filet");
ok(bloc.includes("rapatrierPhotoVerifiee(supabase, src,") && !bloc.includes('.from("inventaire")'), "handler-watch : copie VÉRIFIÉE, et la fiche n'est jamais réécrite");
ok(/const JOBS_PHOTOS_MAX = 30;/.test(bloc) && /const JOBS_PHOTOS_DUREE_MS = 25_000;/.test(bloc) && /\.limit\(100\)/.test(bloc), "handler-watch : bornée (30 photos, 25 s, 100 jobs par cycle)");
ok(/JSON\.stringify\(fraisHp\.photos\) !== JSON\.stringify\(j\.photos\)/.test(bloc) && /\.update\(patchHp\)\.eq\("id", j\.id\)\.eq\("status", "pending"\)/.test(bloc),
  "handler-watch : écriture seulement si le job est encore en attente et sa copie inchangée");
ok(hw.includes(".filter((j) => !(j.status === \"pending\" && j.platform_fields?.[CLE_PHOTOS_HORS_PLATEFORME]));"), "l'ancien filet laisse les jobs marqués à la nouvelle file");
ok(/const relu = await relireCopie\(publicUrl, bytes\.byteLength\);\s*\n\s*if \(relu\.ok\) return/.test(rap), "photos-rapatriement : la copie n'est rendue qu'après relecture");
ok(/if \(!estCdnPlateforme\(src\)\) return \{ url: null/.test(rap) && /if \(resp\.url && !estCdnPlateforme\(resp\.url\)\)/.test(rap), "photos-rapatriement : liste fermée, redirection hors liste refusée");
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
ok(pkg.scripts["selftest:photos-hors-plateforme"] === "node scripts/photos-hors-plateforme-selftest.mjs", "branché dans package.json");

if (ko) { console.error(`\n✗ ${ko} contrôle(s) en échec`); process.exit(1); }
console.log("\n✓ photos hors plateforme : tous les contrôles passent");
