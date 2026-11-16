// selftest:ebay-offres-brouillon — VERROU du point 8 de Nico (16/11/2026, extension 0.6.192) : le refus automatique des
// offres qu'eBay ne peut pas appliquer est coupé DANS le brouillon (voie clic).
//   npm run selftest:ebay-offres-brouillon
// Cas : compte d5531b8e, 15/11, « Assiette vintage (1960-70) » à 1,20 € — eBay refuse la publication : « il manque le Montant de
// refus automatique » (préférences d'offres du COMPTE héritées par le brouillon). La voie clic ne touchait jamais aux
// offres (docs/enquetes/lot-1611-1-matin/RAPPORT.md § 1.3).
// Forme RELEVÉE le 16/11 sur le compte eBay de Nico (brouillon de test à 999 €, jamais publié, supprimé) : switch
// input[name=bestOfferEnabled], « Offre minimale » input[name=autoDeclineAmount] ; la page, en vidant « Offre minimale »,
// envoie PUT /lstng/api/listing_draft/{id} {"autoDecline":false,"autoDeclineAmount":0,"bestOfferEnabled":true} ; sans
// bestOfferEnabled:true, eBay répond 200 et GARDE le refus (essayé).
// ROUGE sur le code d'avant : refusAutomatiqueOffresCoupe absente, aucun PUT des offres.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EB = fs.readFileSync(path.join(RACINE, "chrome-extension/content-scripts/ebay.js"), "utf8").replace(/\r\n/g, "\n");
let n = 0, echecs = 0;
const cas = async (nom, f) => {
  try { await f(); n++; console.log(`  ✓ ${nom}`); } catch (e) { echecs++; console.log(`  ✗ ${nom}\n      ${String(e?.message ?? e).split("\n")[0].slice(0, 300)}`); }
};
const fonction = (src, nom) => {
  const i = src.search(new RegExp(`(?:async )?function ${nom}\\(`));
  assert.ok(i >= 0, `fonction ${nom} introuvable`);
  let j = src.indexOf("{", src.indexOf(")", i)), prof = 0;
  for (; j < src.length; j++) { if (src[j] === "{") prof++; else if (src[j] === "}") { prof--; if (prof === 0) break; } }
  return src.slice(i, j + 1);
};

// La page /lstng simulée : le switch, la case « Offre minimale », le jeton srt, l'adresse du brouillon ; chaque PUT noté.
const env = { dom: {}, puts: [], reponse: null, jette: false };
const charger = () => new Function("env", `
  const document = {
    querySelector: (s) => { const m = /name="([^"]+)"/.exec(s); return m ? (env.dom[m[1]] ?? null) : null; },
    getElementById: (id) => id === "csrf-data" && env.dom.csrf !== false
      ? { getAttribute: () => JSON.stringify({ "/lstng/api/listing_draft/:draftId(\\\\d+)": "jeton-srt-essai" }) } : null,
  };
  const location = { search: "?draftId=5330454132720&mode=AddItem" };
  const fetchBorne = async (url, init) => {
    env.puts.push({ url, init, corps: JSON.parse(init.body) });
    if (env.jette) throw new Error("réseau coupé");
    const t = env.reponse ?? '{"bestOffer":{"name":"bestOfferEnabled","value":true},"autoDecline":{"name":"autoDecline","value":false,"label":{}}}';
    return { ok: true, status: 200, text: async () => t };
  };
  ${fonction(EB, "contexteBrouillonApi")}
  ${fonction(EB, "putChampBrouillon")}
  ${fonction(EB, "refusAutomatiqueOffresCoupe")}
  return refusAutomatiqueOffresCoupe;`)(env);
const page = ({ offres = true, minimale = "", csrf = true } = {}) => {
  env.dom = { bestOfferEnabled: offres == null ? null : { checked: offres }, autoDeclineAmount: offres ? { value: minimale } : null, ...(csrf ? {} : { csrf: false }) };
  env.puts = []; env.reponse = null; env.jette = false;
};

console.log("ebay-offres-brouillon-selftest");
let couper;
await cas("1. la fonction existe et part après le prix (filet prix/format), avant la description", () => {
  couper = charger();
  const i = EB.indexOf("const filet = await filetPrixFormatParApi(job, warnings);");
  const j = EB.indexOf("const offres = await refusAutomatiqueOffresCoupe(job, warnings);");
  const k = EB.indexOf('etape("description");');
  assert.ok(i > 0 && j > i && k > j, `ordre : prix ${i}, offres ${j}, description ${k}`);
});
await cas("2. cas du 15/11 (assiette à 1,20 €) : offres autorisées, « Offre minimale » vide, 1,20 € → UN PUT de la forme relevée, relu dans la réponse", async () => {
  page({ offres: true, minimale: "" });
  const w = [];
  const tr = await couper({ price: 1.2 }, w);
  assert.equal(env.puts.length, 1);
  const p = env.puts[0];
  assert.equal(p.url, "/lstng/api/listing_draft/5330454132720?mode=AddItem");
  assert.equal(p.init.method, "PUT");
  assert.equal(p.init.headers.srt, "jeton-srt-essai");
  const { requestId, ...corps } = p.corps;
  assert.ok(requestId);
  assert.deepEqual(corps, { removedFields: [], autoDecline: false, autoDeclineAmount: 0, bestOfferEnabled: true });
  assert.equal(tr.put, "pose_et_relu");
  assert.ok(w.some((x) => /refus automatique coupé/.test(x)));
});
await cas("3. jamais la forme qu'eBay ignore ({autoDecline:false} sans bestOfferEnabled:true)", () => {
  assert.ok(!/\{\s*autoDecline:\s*false\s*\}/.test(fonction(EB, "refusAutomatiqueOffresCoupe")));
});
await cas("4. offres FERMÉES (switch décoché) ou section absente → aucun PUT (on n'allume jamais les offres)", async () => {
  page({ offres: false });
  assert.equal((await couper({ price: 1.2 }, [])).put, null);
  page({ offres: null });
  await couper({ price: 1.2 }, []);
  assert.equal(env.puts.length, 0);
});
await cas("5. une offre minimale fixée et applicable (0,90 € < 1,20 €) est GARDÉE", async () => {
  page({ offres: true, minimale: "0,90" });
  const tr = await couper({ price: 1.2 }, []);
  assert.equal(env.puts.length, 0);
  assert.equal(tr.offre_minimale, "0,90");
});
await cas("6. une offre minimale ≥ au prix (5,00 € pour 1,20 €) refuserait toute offre → coupée", async () => {
  page({ offres: true, minimale: "5,00" });
  await couper({ price: 1.2 }, []);
  assert.equal(env.puts.length, 1);
});
await cas("7. un 200 sans la relecture, un réseau coupé, un jeton absent : dits, jamais une exception (le dépôt continue)", async () => {
  page({ offres: true });
  env.reponse = '{"autoDecline":{"name":"autoDecline","value":true}}';
  const w = [];
  assert.equal((await couper({ price: 3 }, w)).put, "200_sans_relecture");
  assert.ok(w.some((x) => /relecture/.test(x)));
  page({ offres: true }); env.jette = true;
  assert.equal((await couper({ price: 3 }, [])).put, "exception");
  page({ offres: true, csrf: false });
  assert.equal((await couper({ price: 3 }, [])).put, "contexte_absent");
});

console.log(echecs ? `\nROUGE : ${echecs} échec(s), ${n} vert(s)` : `\nVERT : ${n} contrôles`);
process.exit(echecs ? 1 : 0);
