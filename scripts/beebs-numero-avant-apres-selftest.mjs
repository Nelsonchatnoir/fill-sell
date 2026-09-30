import fs from "node:fs";
import assert from "node:assert/strict";

// Numéro exact d'un dépôt Beebs (0.6.80, 30/09) : « Mes annonces » lue juste
// avant le clic, relue juste après la confirmation. Un seul nouvel identifiant
// = le numéro ; zéro ou plusieurs = aucun numéro ; jamais le titre.

const background = fs.readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8");
const beebs = fs.readFileSync(new URL("../chrome-extension/content-scripts/beebs.js", import.meta.url), "utf8");

// ── Le bloc du background, exécuté tel quel avec des doublures ──────────────
const debut = background.indexOf("function verdictIdentifiantBeebs(");
const fin = background.indexOf("// ── IDENTITÉ BEEBS DU VENDEUR (2026-09-10)", debut);
assert.ok(debut > 0 && fin > debut, "bloc avant/après introuvable dans background.js");
const bloc = background.slice(debut, fin);
assert.doesNotMatch(bloc, /\btitle\b|\btitre\b(?!\s*[,:)])/i, "le bloc de preuve ne lit aucun titre");

function charger({ lectures = [], sleeps = [] } = {}) {
  const file = [...lectures];
  const sendMessageToTab = async (_tabId, msg) => {
    assert.equal(msg.type, "BEEBS_IDS_MES_ANNONCES");
    if (!file.length) throw new Error("plus de lecture prévue");
    const l = file.shift();
    if (l instanceof Error) throw l;
    return l;
  };
  const sleep = async (ms) => { sleeps.push(ms); };
  const chrome = { runtime: { getManifest: () => ({ version: "0.6.80" }) } };
  // eslint-disable-next-line no-new-func
  return new Function("sendMessageToTab", "sleep", "chrome",
    `${bloc}\nreturn { verdictIdentifiantBeebs, lireIdsApresDepotBeebs, tracePreuveIdentifiantBeebs, BEEBS_APRES_DELAIS_MS };`,
  )(sendMessageToTab, sleep, chrome);
}

const lecture = (ids, ok = true) => ({ ok, lu_le: new Date().toISOString(), ids, pages: [] });
const AVANT = lecture(["34076808", "34076827", "33901948"]);

// ── 1. Le verdict ────────────────────────────────────────────────────────────
{
  const { verdictIdentifiantBeebs: v } = charger();
  // cas 1 : un seul nouveau, au-dessus du plancher
  const un = v(AVANT, lecture([...AVANT.ids, "34080001"]));
  assert.equal(un.ok, true);
  assert.equal(un.id, "34080001");
  assert.equal(un.plancher, "34076827");

  // cas 0 : rien de nouveau (Beebs n'a pas encore rangé le dépôt)
  const zero = v(AVANT, lecture(AVANT.ids));
  assert.equal(zero.ok, false);
  assert.equal(zero.motif, "aucun_nouvel_identifiant");

  // cas 2 : deux nouveaux (dépôt fait à la main au même moment) → aucun numéro
  const deux = v(AVANT, lecture([...AVANT.ids, "34080001", "34080002"]));
  assert.equal(deux.ok, false);
  assert.equal(deux.motif, "plusieurs_nouveaux_identifiants");
  assert.deepEqual(deux.nouveaux, ["34080001", "34080002"]);

  // une annonce plus ancienne qui réapparaît (liste « en ligne » partielle,
  // annonce remise en vérification) n'est pas un dépôt neuf : elle ne compte pas
  const reapp = v(AVANT, lecture([...AVANT.ids, "33999999", "34080001"]));
  assert.equal(reapp.ok, true);
  assert.equal(reapp.id, "34080001");
  assert.deepEqual(reapp.reapparus, ["33999999"]);
  const seulementAncienne = v(AVANT, lecture([...AVANT.ids, "33999999"]));
  assert.equal(seulementAncienne.ok, false, "une ancienne annonce seule ne devient jamais le numéro");
  assert.equal(seulementAncienne.motif, "aucun_nouvel_identifiant");

  // une annonce qui QUITTE la liste (vendue, validée) ne change rien
  assert.equal(v(AVANT, lecture(["34076808", "34080001"])).id, "34080001");

  // lectures illisibles → jamais de numéro
  assert.equal(v(lecture(AVANT.ids, false), lecture([...AVANT.ids, "34080001"])).motif, "lecture_avant_illisible");
  assert.equal(v(null, lecture(["34080001"])).motif, "lecture_avant_illisible");
  assert.equal(v(AVANT, lecture([...AVANT.ids, "34080001"], false)).motif, "lecture_apres_illisible");
  assert.equal(v(AVANT, null).motif, "lecture_apres_illisible");

  // compte vide avant : le premier dépôt se reconnaît aussi
  assert.equal(v(lecture([]), lecture(["34080001"])).id, "34080001");
  // identifiants mal formés ignorés
  assert.equal(v(lecture(["abc"]), lecture(["abc", "12", "34080001"])).id, "34080001");
}

// ── 2. La relecture après confirmation ───────────────────────────────────────
{
  // cas 1 : le dépôt apparaît à la 2e lecture, confirmé 3 s plus tard
  const sleeps = [];
  const { lireIdsApresDepotBeebs } = charger({
    sleeps,
    lectures: [lecture(AVANT.ids), lecture([...AVANT.ids, "34080001"]), lecture([...AVANT.ids, "34080001"])],
  });
  const r = await lireIdsApresDepotBeebs(7, AVANT);
  assert.equal(r.verdict.ok, true);
  assert.equal(r.verdict.id, "34080001");
  assert.equal(r.essais.length, 3);
  assert.deepEqual(sleeps, [1500, 4000, 3000]);
}
{
  // la seconde lecture montre un autre dépôt en plus → aucun numéro
  const { lireIdsApresDepotBeebs } = charger({
    lectures: [lecture([...AVANT.ids, "34080001"]), lecture([...AVANT.ids, "34080001", "34080002"])],
  });
  const r = await lireIdsApresDepotBeebs(7, AVANT);
  assert.equal(r.verdict.ok, false);
  assert.equal(r.verdict.motif, "plusieurs_nouveaux_identifiants");
}
{
  // la seconde lecture désigne un autre identifiant → aucun numéro
  const { lireIdsApresDepotBeebs } = charger({
    lectures: [lecture([...AVANT.ids, "34080001"]), lecture(["34076808", "34080003"])],
  });
  const r = await lireIdsApresDepotBeebs(7, AVANT);
  assert.equal(r.verdict.ok, false);
  assert.equal(r.verdict.motif, "seconde_lecture_differente");
  assert.equal(r.verdict.id, undefined);
}
{
  // cas 2 : deux nouveaux dès la première lecture → arrêt immédiat, aucun numéro
  const { lireIdsApresDepotBeebs } = charger({ lectures: [lecture([...AVANT.ids, "34080001", "34080002"])] });
  const r = await lireIdsApresDepotBeebs(7, AVANT);
  assert.equal(r.verdict.motif, "plusieurs_nouveaux_identifiants");
  assert.equal(r.essais.length, 1);
}
{
  // cas 0 : jamais rien de nouveau → 4 lectures, aucun numéro
  const { lireIdsApresDepotBeebs, BEEBS_APRES_DELAIS_MS } = charger({
    lectures: [lecture(AVANT.ids), lecture(AVANT.ids), lecture(AVANT.ids), lecture(AVANT.ids)],
  });
  const r = await lireIdsApresDepotBeebs(7, AVANT);
  assert.equal(r.verdict.motif, "aucun_nouvel_identifiant");
  assert.equal(r.essais.length, BEEBS_APRES_DELAIS_MS.length);
  assert.ok(BEEBS_APRES_DELAIS_MS.reduce((a, b) => a + b, 0) <= 30_000, "la relecture reste sous 30 s");
}
{
  // lecture d'avant illisible → on ne relit même pas
  const { lireIdsApresDepotBeebs } = charger({ lectures: [] });
  const r = await lireIdsApresDepotBeebs(7, lecture([], false));
  assert.equal(r.verdict.motif, "lecture_avant_illisible");
  assert.equal(r.essais.length, 0);
}
{
  // canal coupé pendant la relecture → illisible, jamais une exception
  const { lireIdsApresDepotBeebs } = charger({
    lectures: [new Error("Receiving end does not exist"), new Error("x"), new Error("x"), new Error("x")],
  });
  const r = await lireIdsApresDepotBeebs(7, AVANT);
  assert.equal(r.verdict.motif, "lecture_apres_illisible");
}

// ── 3. La trace ──────────────────────────────────────────────────────────────
{
  const { verdictIdentifiantBeebs, tracePreuveIdentifiantBeebs } = charger();
  const apres = lecture([...AVANT.ids, "34080001"]);
  const t = tracePreuveIdentifiantBeebs(AVANT, apres, verdictIdentifiantBeebs(AVANT, apres), [], "2026-09-30T10:00:00.000Z");
  assert.equal(t.methode, "mes_annonces_avant_apres");
  assert.equal(t.ok, true);
  assert.equal(t.id, "34080001");
  assert.deepEqual(t.avant.ids, AVANT.ids);
  assert.deepEqual(t.apres.ids, apres.ids);
  assert.equal(t.depot_confirme_le, "2026-09-30T10:00:00.000Z");
  assert.equal(t.extension, "0.6.80");
  const t0 = tracePreuveIdentifiantBeebs(AVANT, lecture(AVANT.ids), verdictIdentifiantBeebs(AVANT, lecture(AVANT.ids)), [], null);
  assert.equal(t0.ok, false);
  assert.equal(t0.id, undefined);
  assert.equal(t0.motif, "aucun_nouvel_identifiant");
}

// ── 4. Le câblage ───────────────────────────────────────────────────────────
// beebs.js lit « Mes annonces » AVANT le clic et rend la lecture avec le succès.
const iLectureAvant = beebs.indexOf("const beebsIdsAvant = await lireIdsMesAnnoncesBeebs()");
const iClic = beebs.indexOf("publishBtn?.click()", iLectureAvant);
assert.ok(iLectureAvant > 0 && iClic > iLectureAvant, "la lecture d'avant précède le clic « Mettre en vente »");
assert.match(beebs, /return \{ success: true, listingUrl: null, beebsIdsAvant,/, "la lecture d'avant part avec le succès");
assert.match(beebs, /msg\?\.type === "BEEBS_IDS_MES_ANNONCES"/, "le content script sert la relecture");
// La lecture de beebs.js ne lit ni titre ni prix.
const lecteur = beebs.slice(beebs.indexOf("function lirePageIdentifiantsBeebs("), beebs.indexOf("async function lireIdsMesAnnoncesBeebs("));
assert.doesNotMatch(lecteur, /job\.title|titre|prix|price/i, "la lecture des identifiants n'utilise ni titre ni prix");
assert.match(lecteur, /finale\.pathname\.replace\(\/\\\/\$\/, ""\) !== chemin/, "une page renvoyée ailleurs (connexion) est illisible");
assert.match(lecteur, /ids\.length !== cartes\.size/, "en vérification : autant de clés exactes que de cartes, sinon illisible");
// Même forme de clé RSC que le relevé de modération.
const cleReleve = background.match(/const cleCarteRsc = \/(.+)\/g;/)?.[1];
const cleDepot = beebs.match(/const BEEBS_CLE_CARTE_RSC_SRC = String\.raw`(.+)`;/)?.[1];
assert.ok(cleReleve && cleDepot && cleReleve === cleDepot, "la clé RSC du dépôt est celle du relevé, à l'octet près");

// Le background relit après la confirmation, et le numéro part avec le published.
const iRelecture = background.indexOf("await lireIdsApresDepotBeebs(tabId, avant)");
const iAttente = background.indexOf("attente_identifiant_beebs: {", iRelecture);
const iPublie = background.indexOf('await updateJobStatus(accessToken, job.id, "published", {', iRelecture);
assert.ok(iRelecture > 0 && iAttente > iRelecture && iPublie > iAttente, "relecture, puis attente ou publication");
assert.match(background.slice(iRelecture, iAttente), /if \(v\.ok\) beebsProductId = v\.id;/, "le numéro prouvé devient platform_listing_id");
assert.match(background.slice(iRelecture, iAttente), /preuve_identifiant_beebs: trace/, "la trace part avec le job");
assert.match(background.slice(iRelecture, iAttente), /motif: "desaccord_avec_la_sonde"/, "sonde et relecture en désaccord : aucun numéro");
assert.match(background.slice(iPublie, iPublie + 400), /platform_listing_id: beebsProductId \?\? undefined/, "le numéro voyage dans l'écriture du statut");

// 0.6.80 ne pose plus aucun lien Beebs trouvé par le titre.
assert.match(background, /Sans identifiant durable, jamais de balayage par titre\.[\s\S]{0,300}remaining = \[\];/,
  "la re-capture différée ne cherche jamais un dépôt Beebs par son titre");
assert.match(background, /listing_url: job\.platform === "beebs" \? undefined : dejaEnLigne/,
  "la reprise d'un job interrompu n'écrit jamais un lien Beebs trouvé par le titre");

console.log("✓ Beebs : numéro d'un dépôt par « Mes annonces » avant/après — 1 nouveau = numéro, 0 ou 2 = aucun, jamais le titre");
