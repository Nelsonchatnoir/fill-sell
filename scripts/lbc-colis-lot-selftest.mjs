// Selftest « verrou » du 19/11 (décision de Nico, compte 8ac5bbda, lot 7ff638d8 du 18/11 20:54) — Leboncoin : LA RÈGLE DU
// POIDS VAUT AUSSI EN LOT. Constat : les 15 articles des deux lots du 18/11 partis en « Petit », la parka Columbia de 2 kg
// comprise ; sur chaque fiche, attributs.format_colis_lbc = { v: "Petit", source: "manuel" } daté de la seconde du clic.
// Cause : le format choisi UNE fois pour tout le lot (bloc Livraison du lot → LotPublication.appliquerLivraison →
// moteur.poserLivraisonLbc, src/components/ListingPreviewScreen.jsx) était posé sur chaque copie avec le marqueur d'un
// choix fait sur CET article (avecFormatChoisi : « manuel », daté, au poids de l'article), puis rangé sur la fiche au clic
// Publier comme un choix à la main (ListingPreviewScreen.jsx, « LE FORMAT CHOISI SUR LA CARTE SE RANGE SUR LA FICHE ») ;
// get-pending-jobs le servait devant le poids (_shared/colis-de-la-fiche.js).
// Règle : seul un VRAI choix pour CET article passe devant le poids (réponse sur le job, carte Livraison de l'article,
// choix rangé sur la fiche qui n'est pas l'écho d'un lot) ; le format du lot ne sert qu'aux articles sans poids.
// Rouge avant : `RACINE_VERROU=<copie du dépôt d'avant> node scripts/lbc-colis-lot-selftest.mjs`.
import assert from "node:assert/strict";
import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.env.RACINE_VERROU ? resolve(process.env.RACINE_VERROU) : ICI;
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n"); } catch { return ""; } };
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
const colis = await charger("supabase/functions/_shared/colis-de-la-fiche.js");
const livraison = await charger("supabase/functions/_shared/livraison-poids.js");
const lbc = await charger("src/utils/leboncoinColis.js");
const { colisLbcAuService } = colis;
const echoDe = (attributs, jobs) => (typeof colis.choixEchoDuLot === "function" ? colis.choixEchoDuLot(attributs, jobs) : false);
let n = 0;
const ok = (m) => { n++; console.log(`  ✓ ${m}`); };

// ── Le cas réel : la parka Columbia (inventaire …0009), job cebcefbe… du lot 7ff638d8 (UTC) ───────────────────────────
const PARKA_JOB_CREE = "2026-11-18T19:54:31.758Z";
const pfDuLot = (poids, format = "Petit", le = "2026-11-18T19:54:20.000Z") => ({
  lbcPoidsGrammes: poids, format_colis: format, format_colis_source: "manuel", format_colis_choisi_le: le, format_colis_choisi_poids: poids,
  lbcTransporteurs: ["Shop2Shop by Chronopost", "Mondial Relay", "Colissimo"],
});
const ficheEcho = (poids, at, v = "Petit") => ({
  poids_g: poids, poids_change_le: "2026-11-18T19:39:04.126Z",
  attributs: { format_colis_lbc: { v, source: "manuel", at, poids_g: poids } },
});
{
  const fiche = ficheEcho(2000, "2026-11-18T19:54:34.054Z");
  const lotsDeLArticle = [{ created_at: PARKA_JOB_CREE }];
  const echo = echoDe(fiche.attributs, lotsDeLArticle);
  const pf = pfDuLot(2000);
  colisLbcAuService(pf, { ...fiche, echo_du_lot: echo }, { action: "publish", lot: true, maintenant: new Date("2026-11-18T19:54:54Z") });
  assert.equal(pf.format_colis, "Moyen", "la parka de 2 kg part en « Moyen » (règle du poids), jamais « Petit » posé pour tout le lot");
  assert.equal(echo, true, "le « Petit » de la fiche, rangé 2 s après la création du job du lot, est l'écho du lot");
  ok("cas réel : parka 2 kg du lot 7ff638d8 → « Moyen » (le « Petit » du lot et son écho sur la fiche ne passent pas devant le poids)");
  // Les 14 autres articles (500 g à 1 kg) : « Petit » par leur poids — rien d'autre ne change.
  for (const g of [500, 1000]) {
    const pfP = pfDuLot(g);
    colisLbcAuService(pfP, { ...ficheEcho(g, "2026-11-18T19:54:36.000Z"), echo_du_lot: true }, { action: "publish", lot: true });
    assert.equal(pfP.format_colis, "Petit");
  }
  ok("les 14 autres articles (500 g, 1 kg) : « Petit » par leur poids");
  // La republication suivante de la parka (pas un lot) : l'écho resté sur la fiche n'est toujours pas un choix.
  const pfR = { lbcPoidsGrammes: 2000, format_colis: "Petit", format_colis_source: "fiche" };
  colisLbcAuService(pfR, { ...fiche, echo_du_lot: echoDe(fiche.attributs, lotsDeLArticle) }, { action: "republish" });
  assert.equal(pfR.format_colis, "Moyen", "republication : « Moyen » (l'écho du lot sur la fiche est reconnu à chaque service)");
  ok("republication de la parka : « Moyen » — le cas se répare par la règle, sans écriture sur la fiche ni sur l'annonce");
}

// ── Seul un VRAI choix passe devant le poids ───────────────────────────────────────────────────────────────────────
{
  // Un choix fait sur la fiche (Stock) bien avant le lot : un vrai choix, gardé même en lot.
  const vrai = ficheEcho(2000, "2026-11-17T10:00:00.000Z", "Petit");
  vrai.poids_change_le = "2026-11-17T09:00:00.000Z";
  assert.equal(echoDe(vrai.attributs, [{ created_at: PARKA_JOB_CREE }]), false, "un choix de la veille n'est pas un écho");
  const pfV = pfDuLot(2000, "Moyen");
  colisLbcAuService(pfV, { ...vrai, echo_du_lot: false }, { action: "publish", lot: true });
  assert.equal(pfV.format_colis, "Petit", "le choix fait à la main sur la fiche (au même poids) passe devant le poids");
  // À l'unité, la carte Livraison de CET article : un vrai choix (inchangé depuis le 17/11).
  const pfC = lbc.avecFormatChoisi({ lbcPoidsGrammes: 2000 }, "Petit", new Date("2026-11-18T19:50:00Z"));
  colisLbcAuService(pfC, { poids_g: 2000, poids_change_le: "2026-11-18T19:39:04.126Z", attributs: null }, { action: "publish" });
  assert.equal(pfC.format_colis, "Petit", "à l'unité, le format choisi sur la carte de l'article reste devant le poids");
  // Une réponse à une question sur le job : devant tout.
  const pfQ = { ...pfDuLot(2000), needsUserResolved: { format_colis: "Petit" } };
  colisLbcAuService(pfQ, { ...ficheEcho(2000, "2026-11-18T19:54:34.054Z"), echo_du_lot: true }, { action: "publish", lot: true });
  assert.equal(pfQ.format_colis, "Petit");
  ok("vrais choix gardés : fiche (avant le lot), carte de l'article à l'unité, réponse à une question");
}

// ── Le format du lot sert encore aux articles SANS poids ────────────────────────────────────────────────────────────
{
  const pfS = { format_colis: "Volumineux", format_colis_source: "manuel", format_colis_choisi_le: "2026-11-18T19:54:20Z" };
  colisLbcAuService(pfS, { poids_g: null, poids_change_le: null, attributs: null }, { action: "publish", lot: true });
  assert.equal(pfS.format_colis, "Volumineux", "sans poids sur la fiche, le format du lot part (rien d'autre ne le dit)");
  const pfN = { format_colis: "Moyen", format_colis_source: "lot" };
  assert.equal(livraison.formatChoisi(pfN), true, "le marqueur « lot » n'est pas écarté comme un format deviné");
  assert.equal(livraison.ecarterFormatDevine({ ...pfN }), null);
  colisLbcAuService(pfN, { poids_g: 300, poids_change_le: "2026-11-18T19:39:04Z", attributs: null }, { action: "publish" });
  assert.equal(pfN.format_colis, "Petit", "marqueur « lot » + poids de fiche 300 g → « Petit » (le poids passe devant)");
  ok("format du lot : gardé sans poids (et jamais écarté comme deviné) ; devant un poids de fiche, le poids gagne");
}

// ── CAS 2 (Nico, 19/11) : faf5021a — toutes ses fiches ont « Petit » choisi ; en lot, le format de la FICHE part ────────
// Constat : 110 fiches avec « Petit » choisi au Stock (19/11 10:15–11:00, 100 g et 450 g) ; le bloc « Format du colis sur
// Leboncoin » de l'écran du lot s'ouvre sur « Estimé par Leboncoin » (LotPublication.jsx:902 format "") sans lire la
// fiche, et l'applique à chaque copie (LotPublication.jsx:917 → ListingPreviewScreen.jsx:13187 avecFormatChoisi(pf, "") :
// format effacé) ; le lot de 10:29 n'est parti en « Petit » que parce que « Petit » a été recliqué pour tout le lot.
// Règle : en lot comme à l'unité, le format vient de la FICHE (choisi, sinon le poids) ; jamais une valeur du lot.
{
  const choixStock = (v, g, at) => ({ poids_g: g, poids_change_le: "2026-10-05T08:11:30Z", attributs: { format_colis_lbc: { v, source: "manuel", at, poids_g: g } } });
  // a) le lot laissé sur « Estimé par Leboncoin » : la copie n'a plus de format → celui de la fiche part.
  const pfE = { lbcPoidsGrammes: 450 };
  const ficheE = choixStock("Petit", 450, "2026-11-19T09:51:10Z");
  colisLbcAuService(pfE, { ...ficheE, echo_du_lot: echoDe(ficheE.attributs, [{ created_at: "2026-11-19T10:05:00Z" }]) }, { action: "publish", lot: true });
  assert.equal(pfE.format_colis, "Petit", "lot « Estimé » : le « Petit » choisi sur la fiche part (jamais l'estimation de Leboncoin)");
  // b) un format unique cliqué pour tout le lot ne remplace pas celui de la fiche.
  const pfU = pfDuLot(1500, "Moyen", "2026-11-19T10:04:00Z");
  const ficheU = choixStock("Petit", 1500, "2026-11-19T09:52:00Z");
  colisLbcAuService(pfU, { ...ficheU, echo_du_lot: echoDe(ficheU.attributs, [{ created_at: "2026-11-19T10:05:00Z" }]) }, { action: "publish", lot: true });
  assert.equal(pfU.format_colis, "Petit", "le « Moyen » du lot ne passe pas devant le « Petit » choisi sur la fiche (1,5 kg)");
  // c) sans choix sur la fiche, son poids : 450 g → « Petit », 1,5 kg → « Moyen », quel que soit le format du lot.
  for (const [g, attendu] of [[450, "Petit"], [1500, "Moyen"]]) {
    const pfP = pfDuLot(g, attendu === "Petit" ? "Moyen" : "Petit");
    colisLbcAuService(pfP, { poids_g: g, poids_change_le: "2026-11-19T09:22:57Z", attributs: null }, { action: "publish", lot: true });
    assert.equal(pfP.format_colis, attendu);
  }
  ok("cas 2 (faf5021a) : en lot, le format de la fiche part — choisi (« Petit ») ou du poids — jamais « Estimé » ni une valeur unique du lot");
}

// ── Les marqueurs de l'écran du lot refait (Opus-1, acceptés par Nico le 19/11) ───────────────────────────────────────
{
  // Une correction d'UN article dans le lot : copie avecFormatChoisi + format_colis_par_article → un vrai choix.
  const pfA = { ...lbc.avecFormatChoisi({ lbcPoidsGrammes: 2000 }, "Petit", new Date("2026-11-19T10:04:00Z")), format_colis_par_article: true };
  colisLbcAuService(pfA, { poids_g: 2000, poids_change_le: "2026-11-19T09:22:57Z", attributs: null }, { action: "publish", lot: true });
  assert.equal(pfA.format_colis, "Petit", "format_colis_par_article : le choix fait pour CET article dans le lot passe devant le poids");
  // … et rangé sur la fiche avec geste « article » : jamais pris pour l'écho du lot.
  assert.equal(colis.GESTE_ARTICLE, "article");
  const rang = colis.choixFormatPourLaFiche("Petit", { poids_g: 2000, maintenant: new Date("2026-11-19T10:05:02Z"), geste: colis.GESTE_ARTICLE });
  assert.equal(rang.format_colis_lbc.geste, "article");
  assert.equal(echoDe(rang, [{ created_at: "2026-11-19T10:05:00Z" }]), false, "geste « article » : jamais un écho, même rangé 2 s après la création du job");
  const sansGeste = colis.choixFormatPourLaFiche("Petit", { poids_g: 2000, maintenant: new Date("2026-11-19T10:05:02Z") });
  assert.equal(sansGeste.format_colis_lbc.geste, undefined, "sans geste : l'écriture du Stock reste à l'identique");
  assert.equal(echoDe(sansGeste, [{ created_at: "2026-11-19T10:05:00Z" }]), true);
  colisLbcAuService(pfA, { poids_g: 2000, poids_change_le: "2026-11-19T09:22:57Z", attributs: rang, echo_du_lot: echoDe(rang, [{ created_at: "2026-11-19T10:05:00Z" }]) }, { action: "republish" });
  assert.equal(pfA.format_colis, "Petit", "republication : le choix de l'article rangé sur la fiche (geste « article ») reste");
  ok("marqueurs d'Opus-1 : pf.format_colis_par_article = vrai choix en lot ; attributs.format_colis_lbc.geste = « article » jamais un écho");
}


// ── get-pending-jobs : l'écho et le lot, aux deux services ──────────────────────────────────────────────────────────
{
  assert.equal(typeof colis.marquerEchosDuLot, "function", "_shared/colis-de-la-fiche.js : marquerEchosDuLot");
  const filtres = [];
  const client = { from: (t) => {
    const q = { _t: t, select: () => q, eq: (k, v) => { filtres.push(`${k}=${v}`); return q; }, not: (k, op, v) => { filtres.push(`${k} ${op} ${v}`); return q; },
      in: () => Promise.resolve({ data: [{ inventaire_id: 1795030170920009, created_at: PARKA_JOB_CREE }], error: null }) };
    return q;
  } };
  const lireParLots = async (fab, ids) => fab(ids);
  const fiches = new Map([["1795030170920009", ficheEcho(2000, "2026-11-18T19:54:34.054Z")], ["42", { poids_g: 500, poids_change_le: null, attributs: null }]]);
  const nMarques = await colis.marquerEchosDuLot(client, fiches, lireParLots);
  assert.equal(nMarques, 1);
  assert.equal(fiches.get("1795030170920009").echo_du_lot, true);
  assert.ok(filtres.includes("platform=leboncoin") && filtres.includes("action=publish") && filtres.includes("bulk_batch_id is null"), "seules les publications Leboncoin EN LOT");
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  assert.equal((gpj.match(/marquerEchosDuLot\(userClient, /g) ?? []).length, 2, "l'écho est reconnu aux deux services (republication reprise de l'annonce + passe finale)");
  assert.ok(/colisLbcAuService\(pfC, ficheC\.get\(String\(j\.inventaire_id\)\) \?\? null, \{ action: String\(j\.action \?\? "publish"\), lot: Boolean\(/.test(gpj), "la passe finale dit au service si le job est une publication en lot");
  ok("get-pending-jobs : écho du lot marqué (lecture bornée, publications Leboncoin en lot), drapeau « lot » passé au service");
}

console.log(`lbc-colis-lot : ${n} contrôles verts`);
