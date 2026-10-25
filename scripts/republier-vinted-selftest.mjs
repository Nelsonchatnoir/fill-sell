// selftest:republier-vinted — (25/10 nuit, point 2 de Nico) Une vente Vinted ANNULÉE se remet en vente par le bouton
// « Republier » de Vinted, jamais par une nouvelle annonce en plus — `npm run selftest:republier-vinted`.
// Relevé sur la vraie page (conversation du short de Nico, 25/10 00:1x, sans clic) : POST /api/v2/transactions/<n>/
// reupload ; la conversation porte actions [{ action: "reupload" }]. Relevé en base (Ornella, 17-18/10) : l'annonce née
// du « Republier » (10422167390) porte EXACTEMENT les photos de l'annonce annulée (10284273677).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const MS = lire("chrome-extension/messagerie.js");
const BG = lire("chrome-extension/background.js");
const g = {};
new Function("globalThis", "self", MS)(g, g);
const M = g.FILLSELL_MESSAGERIE;
let n = 0;
const cas = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
const fonction = (src, nom) => {
  const i = src.indexOf(`async function ${nom}(`);
  assert.ok(i >= 0, `fonction ${nom} introuvable`);
  let j = src.indexOf("{", src.indexOf(")", i)), prof = 0;
  for (; j < src.length; j++) { if (src[j] === "{") prof++; else if (src[j] === "}") { prof--; if (prof === 0) break; } }
  return src.slice(i, j + 1);
};

// Les vraies photos (Ornella, pull « côtelé blanc », annonce annulée 10284273677 puis republiée 10422167390).
const PHOTOS_PULL = [
  "https://images1.vinted.net/tc/05_010e8_y9hkZ4m9e8KXUoDGcRkanHfk/0dacefd7.jpeg?s=eb0d86d69d8fcd5fb69eac03c4abd6b95b85ec58",
  "https://images1.vinted.net/tc/05_019b2_foivuJjyBGskydHCJePh5DEv/4e90c3a1.jpeg?s=2de62ed69d35a0ac5eb7883ece407a3fc6edece1",
  "https://images1.vinted.net/tc/02_00043_eXj1RopRmrQcKGQcdFW1BsMA/8f78379c.jpeg?s=1edf91856c3ae950fdd744fb467b63808a0e9c2d",
];
const AUTRE = ["https://images1.vinted.net/tc/03_0aa11_ZZZZzzzzYYYYyyyyXXXXxxxx/1234abcd.jpeg?s=00"];

console.log("\n1. L'ANNONCE NÉE DU « REPUBLIER » : NOUVEAU NUMÉRO, MÊMES PHOTOS");
await cas("les jetons de photo ne dépendent ni de la taille ni de la signature", () => {
  const a = M.jetonsPhotoVinted(PHOTOS_PULL);
  const b = M.jetonsPhotoVinted(PHOTOS_PULL.map((u) => u.replace("/tc/", "/t/").replace(/\?s=.*$/, "?s=autre")));
  assert.equal(a.size, 3);
  assert.deepEqual([...a].sort(), [...b].sort());
  assert.equal(M.jetonsPhotoVinted(["https://exemple.com/x.jpg", null, 12]).size, 0);
});
await cas("Ornella : 10422167390 porte les photos de 10284273677 → c'est elle, seule", () => {
  const d = M.annonceRepublieeVinted({ itemAnnule: "10284273677", jetonsAnnule: M.jetonsPhotoVinted(PHOTOS_PULL),
    articles: [{ id: "10422167390", photos: PHOTOS_PULL }, { id: "10422167391", photos: AUTRE }, { id: "10200000000", photos: PHOTOS_PULL }] });
  assert.equal(d.decision, "unique");
  assert.equal(d.article.id, "10422167390");
});
await cas("jamais une annonce plus ancienne, jamais une vendue, jamais sans photo commune, jamais deux", () => {
  const j = M.jetonsPhotoVinted(PHOTOS_PULL);
  assert.equal(M.annonceRepublieeVinted({ itemAnnule: "10284273677", jetonsAnnule: j, articles: [{ id: "10284273677", photos: PHOTOS_PULL }] }).decision, "aucune");
  assert.equal(M.annonceRepublieeVinted({ itemAnnule: "10284273677", jetonsAnnule: j, articles: [{ id: "10422167390", photos: PHOTOS_PULL, vendu: true }] }).decision, "aucune");
  assert.equal(M.annonceRepublieeVinted({ itemAnnule: "10284273677", jetonsAnnule: j, articles: [{ id: "10422167390", photos: AUTRE }] }).decision, "aucune");
  assert.equal(M.annonceRepublieeVinted({ itemAnnule: "10284273677", jetonsAnnule: j,
    articles: [{ id: "10422167390", photos: PHOTOS_PULL }, { id: "10422167399", photos: [PHOTOS_PULL[1]] }] }).decision, "plusieurs");
  assert.equal(M.annonceRepublieeVinted({ itemAnnule: "10284273677", jetonsAnnule: new Set(), articles: [{ id: "10422167390", photos: PHOTOS_PULL }] }).decision, "aucune");
});

console.log("\n2. LE GESTE DE L'EXTENSION (0.6.142), SIMULÉ");
const SRC = fonction(BG, "processRepublierVintedJob");
const fabriquer = (espions) => new Function(
  "FILLSELL_MESSAGERIE", "updateJobStatus", "recordRecentResult", "executerDansOngletPlateforme", "sleep", "VO",
  "REPUBLIER_ATTENTE_MS", "REPUBLIER_ATTENTES_MAX", `${SRC}; return processRepublierVintedJob;`,
)(M, espions.updateJobStatus, async () => {}, espions.executer, async () => {}, { origineVinted: () => "https://www.vinted.fr", navigateurCourt: () => "Chrome" }, 300000, 6);
const JOB = {
  id: "job-short", platform: "vinted", action: "publish",
  platform_fields: { remise_par_republier: { transaction_id: "23532974658", conversation_id: "500459040158", item_id: "10144115529" }, hors_quota: true },
};
const lecture = ({ actions = ["reupload"], articles = [], vendeur = "250623918", moi = "250623918", itemIds = ["10144115529"] } = {}) => ({
  ok: true, lu_le: new Date().toISOString(), etapes: [], moi: { id: moi, login: "nelsonthecat" },
  conversation: { id: "500459040158", transaction: { id: "23532974658", statut: 520, item_id: "10144115529", item_ids: itemIds, vendeur, cote: "seller", photos: PHOTOS_PULL }, actions: actions.map((a) => ({ action: a })) },
  dressing: { http: 200, articles },
});
const scenario = ({ lectures, post = { envoye: true, http: 200, code: 0, cles: ["code"], item_id: null }, echecNote = false, job = JOB }) => {
  const appels = [];
  let iLecture = 0;
  const espions = {
    updateJobStatus: async (_t, id, statut, extra) => {
      appels.push({ type: "statut", statut, extra: JSON.parse(JSON.stringify(extra ?? {})) });
      if (echecNote && statut === "processing" && extra?.platform_fields?.republier?.envoye_le) throw new Error("écriture refusée");
      return {};
    },
    executer: async (_p, f) => {
      if (f === M.lireRepublierVinted) { appels.push({ type: "lecture" }); return lectures[Math.min(iLecture++, lectures.length - 1)]; }
      if (f === M.posterRepublierVinted) { appels.push({ type: "POST" }); return post; }
      throw new Error("fonction de page inattendue");
    },
  };
  return { appels, run: () => fabriquer(espions)(JSON.parse(JSON.stringify(job)), "jeton") };
};
const NOUVELLE = { id: "10450000001", titre: "Short de bain Quiksilver", photos: PHOTOS_PULL };

await cas("bouton présent : l'envoi est NOTÉ avant le POST, UN SEUL POST, l'annonce aux mêmes photos est rattachée", async () => {
  const s = scenario({ lectures: [lecture(), lecture({ actions: [], articles: [NOUVELLE] })] });
  const r = await s.run();
  assert.equal(r.status, "published");
  assert.equal(r.listingUrl, "https://www.vinted.fr/items/10450000001");
  const posts = s.appels.filter((a) => a.type === "POST");
  assert.equal(posts.length, 1);
  const iPost = s.appels.findIndex((a) => a.type === "POST");
  const iNote = s.appels.findIndex((a) => a.type === "statut" && a.statut === "processing" && a.extra.platform_fields?.republier?.envoye_le);
  assert.ok(iNote >= 0 && iNote < iPost, "envoye_le écrit AVANT le POST");
  const fin = s.appels.at(-1);
  assert.equal(fin.statut, "published");
  assert.equal(fin.extra.platform_fields.vinted_item_id, "10450000001");
  assert.equal(fin.extra.platform_fields.republier.nouvel_item.source, "dressing_memes_photos");
  assert.equal(fin.extra.platform_fields.vinted_account_proof.source, "users/current_apres_depot");
});
await cas("le numéro rendu par Vinted suffit (aucune relecture nécessaire)", async () => {
  const s = scenario({ lectures: [lecture()], post: { envoye: true, http: 200, code: 0, item_id: "10450000002" } });
  const r = await s.run();
  assert.equal(r.listingUrl, "https://www.vinted.fr/items/10450000002");
  assert.equal(s.appels.filter((a) => a.type === "lecture").length, 1);
});
await cas("POST parti, annonce pas encore visible → relecture plus tard, JAMAIS un second envoi", async () => {
  const s = scenario({ lectures: [lecture(), lecture({ actions: [] }), lecture({ actions: [] })] });
  const r = await s.run();
  assert.equal(r.status, "skipped");
  const fin = s.appels.at(-1);
  assert.equal(fin.statut, "pending");
  assert.ok(fin.extra.platform_fields.republier.envoye_le, "l'envoi reste noté");
  assert.ok(fin.extra.platform_fields.next_action_after);
  const suite = scenario({ lectures: [lecture({ actions: [], articles: [NOUVELLE] })], job: { ...JOB, platform_fields: fin.extra.platform_fields } });
  const r2 = await suite.run();
  assert.equal(r2.status, "published");
  assert.equal(suite.appels.filter((a) => a.type === "POST").length, 0);
  assert.equal(suite.appels.at(-1).extra.platform_fields.republier.nouvel_item.source, "notre_geste_relu");
});
await cas("envoi déjà noté et bouton encore là → la question, aucun POST", async () => {
  const s = scenario({ lectures: [lecture()], job: { ...JOB, platform_fields: { ...JOB.platform_fields, republier: { envoye_le: "2026-10-25T01:00:00Z" } } } });
  const r = await s.run();
  assert.equal(r.status, "needs_user");
  assert.equal(s.appels.filter((a) => a.type === "POST").length, 0);
  assert.equal(s.appels.at(-1).extra.platform_fields.needs_user_source, "republier_vinted");
  assert.equal(s.appels.at(-1).extra.platform_fields.republier.motif, "envoye_sans_effet");
});
await cas("le vendeur l'a fait lui-même (plus de bouton, annonce aux mêmes photos) → rattachée, aucun POST", async () => {
  const s = scenario({ lectures: [lecture({ actions: [], articles: [NOUVELLE] })] });
  const r = await s.run();
  assert.equal(r.status, "published");
  assert.equal(s.appels.filter((a) => a.type === "POST").length, 0);
  assert.equal(s.appels.at(-1).extra.platform_fields.republier.nouvel_item.source, "geste_du_vendeur");
});
await cas("Vinted recrée un BROUILLON → la question (publie-le depuis tes brouillons), jamais « publiée »", async () => {
  const s = scenario({ lectures: [lecture(), lecture({ actions: [], articles: [{ ...NOUVELLE, brouillon: true }] })] });
  const r = await s.run();
  assert.equal(r.status, "needs_user");
  assert.equal(s.appels.at(-1).extra.platform_fields.republier.motif, "brouillon");
  assert.ok(!s.appels.some((a) => a.statut === "published"));
});
await cas("plus de bouton, rien en ligne → la question, rien de publié", async () => {
  const s = scenario({ lectures: [lecture({ actions: [] })] });
  assert.equal((await s.run()).status, "needs_user");
  assert.equal(s.appels.filter((a) => a.type === "POST").length, 0);
  assert.equal(s.appels.at(-1).extra.platform_fields.republier.motif, "republier_indisponible");
});
await cas("autre boutique ouverte dans Chrome → attente, aucun POST", async () => {
  const s = scenario({ lectures: [lecture({ moi: "999" })] });
  assert.equal((await s.run()).status, "skipped");
  assert.equal(s.appels.filter((a) => a.type === "POST").length, 0);
  assert.equal(s.appels.at(-1).extra.platform_fields.republier.motif, "autre_boutique");
});
await cas("conversation d'une autre vente, ou lot → la question, aucun POST", async () => {
  const autre = lecture();
  autre.conversation.transaction.id = "1";
  const s1 = scenario({ lectures: [autre] });
  assert.equal((await s1.run()).status, "needs_user");
  const s2 = scenario({ lectures: [lecture({ itemIds: ["10144115529", "10144115530"] })] });
  assert.equal((await s2.run()).status, "needs_user");
  assert.equal(s1.appels.filter((a) => a.type === "POST").length + s2.appels.filter((a) => a.type === "POST").length, 0);
});
await cas("Vinted refuse → la question avec son motif, l'envoi reste noté (jamais renvoyé)", async () => {
  const s = scenario({ lectures: [lecture()], post: { envoye: true, http: 200, code: 106, erreur: "Impossible de republier" } });
  const r = await s.run();
  assert.equal(r.status, "needs_user");
  assert.match(r.error, /Impossible de republier/);
  assert.ok(s.appels.at(-1).extra.platform_fields.republier.envoye_le);
});
await cas("rien n'est parti (page pas prête) → nouvel essai, l'envoi n'est pas noté comme fait", async () => {
  const s = scenario({ lectures: [lecture()], post: { envoye: false, motif: "csrf_absent" } });
  assert.equal((await s.run()).status, "skipped");
  assert.equal(s.appels.at(-1).extra.platform_fields.republier.envoye_le, undefined);
});
await cas("la note d'envoi n'a pas pu s'écrire → AUCUN POST", async () => {
  const s = scenario({ lectures: [lecture()], echecNote: true });
  await s.run();
  assert.equal(s.appels.filter((a) => a.type === "POST").length, 0);
});

console.log("\n3. BRANCHEMENTS");
await cas("processJob envoie la remise « Republier » au geste, avant retraits et republications ; capacité déclarée", () => {
  const i = BG.indexOf("job.platform_fields?.remise_par_republier) return processRepublierVintedJob(job, accessToken)");
  assert.ok(i > 0 && i < BG.indexOf('if (job.action === "delete") return processDeleteJob(job, accessToken);'));
  assert.ok(BG.includes('"prevol_recreation_v1", "vinted_republier_v1"]'));
  assert.ok(BG.includes('if (job.action !== "delete" && !pf.remise_par_republier) {'), "la reprise d'un job figé ne le rattache jamais par son titre");
  // (25/10) Le geste existe depuis la 0.6.142 : toute version suivante le porte (0.6.143 : lot du 25/10 matin).
  const [a, b, c] = JSON.parse(lire("chrome-extension/manifest.json")).version.split(".").map(Number);
  assert.ok(a > 0 || b > 6 || (b === 6 && c >= 142), "manifest ≥ 0.6.142");
});
await cas("get-pending-jobs : mis de côté avant les publications, rendu au seul poste « vinted_republier_v1 »", () => {
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  const aCote = gpj.indexOf("const republierVinted = (out as unknown as Array<Record<string, unknown>>).filter(estRepublierVinted);");
  const rendu = gpj.indexOf("if (republierVinted.length && posteRepublier) {");
  assert.ok(aCote > 0 && rendu > aCote);
  assert.ok(aCote < gpj.indexOf("LA FILE EN PAUSE (22/10 soir"), "mis de côté avant le premier traitement");
  assert.ok(gpj.includes('const posteRepublier = capacites.includes("vinted_republier_v1");'));
});
await cas("la base : remise Vinted d'une vente annulée = job « Republier », jamais sans numéro de commande", () => {
  const m = lire("supabase/migrations/20261025010000_remise_vinted_par_republier.sql");
  assert.ok(m.includes("v_rep := jsonb_build_object('remise_par_republier'"));
  assert.ok(m.includes("v_motif := 'republier_commande_inconnue';"));
  assert.ok(m.includes("IF v_motif IS NULL AND r.platform = 'vinted' AND v_annul THEN"));
  assert.ok(m.includes("|| v_rep)"));
});

await cas("(audit N8) un diagnostic objet part tel quel en base, plus jamais « [object Object] »", () => {
  assert.ok(BG.includes('function diagnosticPourBase(d) {'));
  assert.ok(!/last_diagnostic(?::| =) String\(result\.diagnostic\)/.test(BG), "aucun String(objet) écrit dans last_diagnostic");
  const f = new Function(`${fonction(BG.replace("function diagnosticPourBase(d) {", "async function diagnosticPourBase(d) {"), "diagnosticPourBase")}; return diagnosticPourBase;`)();
  return Promise.all([f({ etape: "photos" }), f("texte")]).then(([o, t]) => { assert.deepEqual(o, { etape: "photos" }); assert.equal(t, "texte"); });
});

console.log(`\n✓ republier-vinted : ${n} contrôles`);
