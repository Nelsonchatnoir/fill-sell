// ═══════════════════════════════════════════════════════════════════════════
// REPUBLICATION : LES PHOTOS PAR ARTICLE ET PAR PLATEFORME — SELFTEST « VERROU » (16/11/2026, point 7 — Marc)
// ═══════════════════════════════════════════════════════════════════════════
// Garanties (rouge sur le code d'avant : modules absents, feuille sans choix de photos) :
//   1. un choix est rangé sous (article, plateforme) : jamais sur un autre article, jamais sur une autre plateforme ;
//   2. il est validé contre les photos de CET article (une photo d'un autre article n'y entre jamais), sans doublon,
//      dans la limite de la plateforme ;
//   3. par défaut rien ne change : sans choix, aucune écriture, aucune photo dans la cible ;
//   4. l'écriture sur la tâche : Leboncoin, Beebs, Depop → job.photos dans l'ordre choisi ; Vinted → le choix porté
//      par la tâche ; partout photos_choisies ; jamais sur une tâche déjà capturée ou retirée, les autres clés gardées ;
//   5. Vinted : get-pending-jobs pose le choix sur la capture, une fois par capture, jamais après le retrait, et les
//      photos de la fiche ne le remplacent jamais ;
//   6. contenuAImposer ne « complète » jamais des photos choisies ;
//   7. à l'échelle d'un lot (40 articles × 3 plateformes) : chaque republication reçoit exactement SON choix ;
//   8. le câblage : la feuille, l'unité, le lot, get-pending-jobs.
import fs from "node:fs";

let echecs = 0;
const ok = (cond, quoi, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${quoi}${cond || !detail ? "" : `   ← ${detail}`}`);
  if (!cond) echecs++;
};
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

let M = null, S = null;
try { M = await import("../src/stock/photosRepublication.js"); } catch (e) { ok(false, "src/stock/photosRepublication.js existe", String(e?.message ?? e).slice(0, 100)); }
try { S = await import("../supabase/functions/_shared/photos-republication.js"); } catch (e) { ok(false, "_shared/photos-republication.js existe", String(e?.message ?? e).slice(0, 100)); }
const { contenuAImposer } = await import("../supabase/functions/_shared/contenu-fiche.js");

const U = (art, n) => `https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-images/${art}/${n}.jpg`;
const A = { id: 101, title: "Jean Levi's 501", photos: [U("a", 1), U("a", 2), U("a", 3), { url: U("a", 4), type: "photo_3" }] };
const B = { id: 202, title: "Pull Zara", photos: [U("b", 1), U("b", 2), U("b", 3)] };

if (M && S) {
  console.log("\n1. Un choix par (article, plateforme), jamais ailleurs");
  let e = M.poserChoix({}, A.id, "vinted", [U("a", 3), U("a", 1)]);
  e = M.poserChoix(e, A.id, "leboncoin", [U("a", 2)]);
  e = M.poserChoix(e, B.id, "vinted", [U("b", 2), U("b", 1)]);
  ok(JSON.stringify(M.choixPour(e, A, "vinted")) === JSON.stringify([U("a", 3), U("a", 1)]), "A / Vinted : son choix, dans son ordre");
  ok(JSON.stringify(M.choixPour(e, A, "leboncoin")) === JSON.stringify([U("a", 2)]), "A / Leboncoin : son propre choix");
  ok(M.choixPour(e, A, "beebs") === null, "A / Beebs : aucun choix → rien");
  ok(JSON.stringify(M.choixPour(e, B, "vinted")) === JSON.stringify([U("b", 2), U("b", 1)]), "B / Vinted : jamais celui de A");
  const e2 = M.poserChoix(e, A.id, "vinted", null);
  ok(M.choixPour(e2, A, "vinted") === null && JSON.stringify(M.choixPour(e2, B, "vinted")) === JSON.stringify([U("b", 2), U("b", 1)]), "retirer le choix de A / Vinted ne touche pas B");
  ok(M.choixPour(e2, A, "leboncoin") !== null, "… ni A / Leboncoin");

  console.log("\n2. Validé contre les photos de CET article");
  const mele = M.poserChoix({}, A.id, "vinted", [U("b", 1), U("a", 2), U("a", 2), U("a", 1)]);
  ok(JSON.stringify(M.choixPour(mele, A, "vinted")) === JSON.stringify([U("a", 2), U("a", 1)]), "une photo de B et un doublon : écartés", JSON.stringify(M.choixPour(mele, A, "vinted")));
  const neuf = { id: 9, photos: Array.from({ length: 12 }, (_, i) => U("n", i)) };
  ok(M.choixPour(M.poserChoix({}, 9, "depop", [...neuf.photos].reverse()), neuf, "depop")?.length === 8, "Depop : 8 photos au plus");
  ok(M.choixPour(M.poserChoix({}, A.id, "vinted", [U("a", 1), U("a", 2), U("a", 3), U("a", 4)]), A, "vinted") === null, "un « choix » identique au défaut n'est pas un choix (rien ne change)");

  console.log("\n3. Par défaut, rien ne change");
  ok(M.photosDeLaCible({}, A, ["vinted", "leboncoin"]) === null, "aucun choix → aucune photo dans la cible");
  ok(JSON.stringify(Object.keys(M.photosDeLaCible(e, A, ["vinted"]) ?? {})) === JSON.stringify(["vinted"]), "seules les plateformes ENVOYÉES portent leur choix");
  ok(M.articlesModifies(e, [A, B], () => ["vinted", "leboncoin"]).size === 2 && M.articlesModifies({}, [A, B], () => ["vinted"]).size === 0, "le repère « photos modifiées » : 2 articles, puis 0 sans choix");

  console.log("\n4. L'écriture sur la tâche fraîchement créée");
  const pfVinted = { republish_step: "a_capturer", vinted_item_id: "123", autre: "garde" };
  const wv = M.ecritureTachePhotos({ platform: "vinted", pf: pfVinted, statut: "pending", urls: [U("a", 3), U("a", 1)], photosFiche: A.photos, le: "2026-11-16T10:00:00Z" });
  ok(wv && !("photos" in wv) && wv.platform_fields.photos_choisies === true, "Vinted : rien sur job.photos (la recréation part de la capture), photos_choisies posé");
  ok(JSON.stringify(wv.platform_fields[M.CLE_PHOTOS_CHOISIES].urls) === JSON.stringify([U("a", 3), U("a", 1)]) && wv.platform_fields.autre === "garde" && wv.platform_fields.vinted_item_id === "123", "Vinted : le choix porté par la tâche, les autres clés gardées");
  const wl = M.ecritureTachePhotos({ platform: "leboncoin", pf: { republish_step: "a_capturer", republish_platform: "leboncoin" }, statut: "pending", urls: [U("a", 4), U("a", 2)], photosFiche: A.photos });
  ok(wl && JSON.stringify(wl.photos.map((p) => p.url)) === JSON.stringify([U("a", 4), U("a", 2)]), "Leboncoin : job.photos = le choix, dans l'ordre");
  ok(wl.photos[0].type === "original" && wl.photos[1].type === "photo_1" && wl.platform_fields.republish_platform === "leboncoin", "la 1ʳᵉ est la couverture ; les clés de la tâche gardées");
  ok(M.ecritureTachePhotos({ platform: "beebs", pf: {}, statut: "processing", urls: [U("a", 1)], photosFiche: A.photos }) === null, "tâche en cours : jamais touchée");
  ok(M.ecritureTachePhotos({ platform: "vinted", pf: { republish_step: "captured", capture_id: 5 }, statut: "pending", urls: [U("a", 1)], photosFiche: A.photos }) === null, "tâche déjà capturée : jamais touchée");
  ok(M.ecritureTachePhotos({ platform: "depop", pf: { republish_step: "a_capturer", deleted_at: "x" }, statut: "pending", urls: [U("a", 1)], photosFiche: A.photos }) === null, "annonce déjà retirée : jamais touchée");
  ok(M.ecritureTachePhotos({ platform: "beebs", pf: {}, statut: "pending", urls: [U("b", 1)], photosFiche: A.photos }) === null, "une photo d'un autre article : rien n'est écrit");

  console.log("\n5. appliquerPhotosChoisies : relue, puis écrite seulement si rien n'a bougé");
  const fauxSupa = (ligne, lignesMaj = 1) => {
    const journal = [];
    return {
      journal,
      from: () => {
        const q = { _f: [], select() { return q; }, eq(c, v) { q._f.push(["eq", c, v]); return q; }, is(c, v) { q._f.push(["is", c, v]); return q; },
          update(v) { q._u = v; return q; }, maybeSingle: async () => ({ data: ligne, error: null }),
          then(r) { journal.push({ maj: q._u, filtres: q._f }); return r({ data: Array.from({ length: lignesMaj }, () => ({ id: "x" })), error: null }); } };
        return q;
      },
    };
  };
  const supa = fauxSupa({ id: "j1", status: "pending", platform: "leboncoin", platform_fields: { republish_step: "a_capturer" } });
  const r1 = await M.appliquerPhotosChoisies(supa, { jobId: "j1", platform: "leboncoin", urls: [U("a", 2), U("a", 1)], photosFiche: A.photos });
  ok(r1.ok === true, "écrite sur une tâche « pending » à l'étape d'avant la capture");
  const f = supa.journal[0]?.filtres ?? [];
  ok(f.some(([o, c, v]) => o === "eq" && c === "status" && v === "pending") && f.some(([o, c, v]) => o === "eq" && c === "platform_fields->>republish_step" && v === "a_capturer"), "l'écriture est gardée sur le statut ET l'étape lus", JSON.stringify(f));
  const r2 = await M.appliquerPhotosChoisies(fauxSupa({ id: "j1", status: "pending", platform: "leboncoin", platform_fields: {} }, 0), { jobId: "j1", platform: "leboncoin", urls: [U("a", 2)], photosFiche: A.photos });
  ok(r2.ok === false, "la tâche a bougé entre-temps (0 ligne) : rien, et on le dit");
  const r3 = await M.appliquerPhotosChoisies(fauxSupa({ id: "j1", status: "pending", platform: "beebs", platform_fields: {} }), { jobId: "j1", platform: "leboncoin", urls: [U("a", 2)], photosFiche: A.photos });
  ok(r3.ok === false, "jamais le choix d'une plateforme sur la tâche d'une autre");
  ok((await M.appliquerPhotosChoisies(fauxSupa(null), { jobId: "j1", platform: "vinted", urls: null, photosFiche: A.photos })).ok === false, "aucun choix : aucune lecture, aucune écriture");

  console.log("\n6. Vinted : le choix passe sur la capture, une fois, avant le retrait");
  const jobV = { platform: "vinted", action: "republish", status: "pending", platform_fields: { republish_step: "captured", capture_id: 77, [S.CLE_PHOTOS_CHOISIES]: { urls: [U("a", 3), U("a", 1)] } } };
  ok(S.captureAReecrire(jobV) === true, "étape « captured », capture connue, choix porté : à poser");
  ok(JSON.stringify(S.photosChoisiesRepublication(jobV.platform_fields)) === JSON.stringify([U("a", 3), U("a", 1)]), "les URLs choisies, dans l'ordre");
  const apres = { ...jobV, platform_fields: S.marqueAppliquee(jobV.platform_fields, 77) };
  ok(S.captureAReecrire(apres) === false, "même capture : plus jamais");
  ok(S.captureAReecrire({ ...apres, platform_fields: { ...apres.platform_fields, capture_id: 78 } }) === true, "nouvelle capture : posé à nouveau");
  ok(S.captureAReecrire({ ...jobV, platform_fields: { ...jobV.platform_fields, deleted_at: "x" } }) === false, "retrait engagé : jamais");
  ok(S.captureAReecrire({ ...jobV, platform: "leboncoin" }) === false && S.captureAReecrire({ ...jobV, platform_fields: { republish_step: "captured", capture_id: 77 } }) === false, "hors Vinted, ou sans choix : rien");

  console.log("\n7. Des photos choisies ne sont jamais « complétées » par la fiche");
  const fiche = { origine: "vinted_sync", titre: "x", description: "d", photos: [U("a", 1), U("a", 2), U("a", 3), U("a", 4)], attributs: { description: { v: "d", source: "vinted_sync" } } };
  const jobL = { platform: "leboncoin", action: "republish", photo_option: "original", created_at: "2026-11-01T00:00:00Z", photos: [{ url: U("a", 2) }], platform_fields: { photos_choisies: true } };
  const imp = contenuAImposer(jobL, fiche, { contenuLe: "2026-11-01T00:00:00Z", photosLuesLe: "2026-11-10T00:00:00Z" });
  ok(imp.photos === undefined && imp.photos_a_rapatrier !== true, "photos_choisies : la copie garde son choix", JSON.stringify(imp));

  console.log("\n8. À l'échelle d'un lot : 40 articles × 3 plateformes, chacun SON choix");
  const arts = Array.from({ length: 40 }, (_, i) => ({ id: 1000 + i, photos: Array.from({ length: 6 }, (_, k) => U(`l${i}`, k)) }));
  let etat = {};
  const attendu = new Map();
  for (const a of arts) for (const [j, p] of ["vinted", "leboncoin", "beebs"].entries()) {
    if ((a.id + j) % 3 === 0) continue; // certains sans choix
    const urls = [a.photos[(j + 2) % 6], a.photos[j % 6]];
    etat = M.poserChoix(etat, a.id, p, urls);
    attendu.set(`${a.id}|${p}`, urls);
  }
  let justes = 0, faux = 0;
  for (const a of arts) {
    const c = M.photosDeLaCible(etat, a, ["vinted", "leboncoin", "beebs"]) ?? {};
    for (const p of ["vinted", "leboncoin", "beebs"]) {
      const voulu = attendu.get(`${a.id}|${p}`) ?? null;
      const recu = c[p] ?? null;
      if (JSON.stringify(voulu) === JSON.stringify(recu) && (recu ?? []).every((u) => u.includes(`/l${a.id - 1000}/`))) justes++; else faux++;
    }
  }
  ok(faux === 0 && justes === 120, `120 republications : ${justes} justes, ${faux} mélangées`);
}

console.log("\n9. Le câblage (lecture du code)");
{
  const st = lire("src/tabs/StockTab.jsx");
  ok(/<PhotosRepublicationLot lang=\{lang\} items=\{items\} cochees=\{cochee\} etat=\{choixPhotos\} setEtat=\{setChoixPhotos\} \/>/.test(st), "la feuille de republication montre le choix des photos (replié)");
  ok(/photosParPlateforme: photosDeLaCible\(choixPhotos, item, envoyees\)/.test(st), "le choix part avec la cible, pour les seules plateformes envoyées");
  ok(/const photosChoisies = opts\.photosParPlateforme\?\.\[platform\] \?\? null;\s*if \(photosChoisies && res\.job_id\)/.test(st), "une annonce : appliqué seulement s'il existe");
  ok(/photos: photosParPlateforme\?\.\[platform\] \?\? null/.test(st) && /if \(photosChoisies && res\.job_id\) \{\s*const ap = await appliquerPhotosChoisies/.test(st), "le lot : chaque (article, plateforme) avec SON choix");
  ok(/photosParPlateforme:cibles\[0\]\.photosParPlateforme\?\?null/.test(st), "la feuille à un article passe aussi le choix");
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/const aChoisir = out\.filter\(\(j\) => captureAReecrire\(/.test(gpj) && gpj.indexOf("const aChoisir") < gpj.indexOf("const aCorriger = out.filter"), "get-pending-jobs pose le choix sur la capture, avant la correction par la fiche");
  ok(/if \(!photosChoisiesRepublication\(pfC\) && \/\^releve_/.test(gpj), "les photos de la fiche ne remplacent jamais un choix");
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(/<PhotosPlateforme/.test(lps) && /from "\.\.\/publication\/PhotosPlateforme"/.test(lire("src/stock/PhotosRepublicationLot.jsx").replace(/'/g, '"')), "le MÊME composant que la publication (PhotosPlateforme)");
}

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ tout est vert");
if (echecs) process.exit(1);
