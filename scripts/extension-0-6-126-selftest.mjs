// Selftest — ce que la 0.6.126 ajoute (18/10, chantier « zéro orange + bordereaux ») :
//   lot 4 : les ventes Beebs lues sur la page des ventes (jamais une disparition seule) ;
//   lot 6 : la recréation Vinted relit la boutique AVANT le formulaire ; le poste dit sa boutique et ses sessions ;
//           une commande Vinted suivie d'une AUTRE boutique (403/404) n'est jamais un blocage.
//   npm run selftest:extension-0-6-126
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const BG = lire("chrome-extension/background.js");
const MS = lire("chrome-extension/messagerie.js");
let n = 0;
const cas = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
const fonction = (src, nom) => {
  const i = src.indexOf(`function ${nom}(`);
  assert.ok(i >= 0, `fonction ${nom} introuvable`);
  let j = src.indexOf("{", i), prof = 0;
  for (; j < src.length; j++) { if (src[j] === "{") prof++; else if (src[j] === "}") { prof--; if (prof === 0) break; } }
  return src.slice(i, j + 1);
};
console.log("extension-0-6-126-selftest");

await cas("lot 4 : les lignes envoyées — référence, statut brut, date, numéros de produit ; aucun nom, 10 au plus", () => {
  const lignesVentesBeebs = new Function(`${fonction(BG, "lignesVentesBeebs")}; return lignesVentesBeebs;`)();
  const commandes = Array.from({ length: 12 }, (_, i) => ({ id: `CMD${i}abcdef`, order: { id: `CMD${i}abcdef`, status: "LABEL_PRINTED", created_at: "2026-10-11T10:10:00Z",
    buyer: { first_name: "Prénom", last_name: "Nom" }, products: [{ id: 34101549 + i, title: "Veste" }] } }));
  const l = lignesVentesBeebs(commandes);
  assert.equal(l.length, 10);
  assert.deepEqual(l[0], { ref: "CMD0abcdef", statut: "LABEL_PRINTED", date: "2026-10-11T10:10:00Z", produits: ["34101549"] });
  assert.ok(!JSON.stringify(l).includes("Prénom") && !JSON.stringify(l).includes("Nom"), "aucun nom ne sort");
  assert.deepEqual(lignesVentesBeebs([{ id: "x" }]), [], "commande sans objet : rien");
});

await cas("lot 4 : la disparition d'une annonce Beebs déclenche SEULEMENT la lecture (30 min au plus) ; la vente est décidée par le serveur", () => {
  assert.ok(/if \(job\.platform === "beebs"\) ventesBeebsALire = true;/.test(BG));
  assert.ok(/if \(ventesBeebsALire\) await lireVentesBeebsSiDue\(session\)/.test(BG));
  assert.ok(/Date\.now\(\) - Number\(lu\[userId\] \?\? 0\) < 30 \* 60_000\) return;/.test(BG));
  assert.ok(/rpcMessagerie\("commandes_beebs_noter", \{/.test(BG));
  assert.ok(/if \(platform === "beebs"\) await noterVentesBeebs\(token, cmd\);/.test(BG), "le passage bêta envoie aussi");
  // La 1re lecture « unavailable » ne pose toujours AUCUN bandeau (règle du 27/09).
  assert.ok(/console\.log\(`\[background\] \$\{job\.platform\} \$\{job\.id\} : plus en ligne \(1re lecture\) — AUCUN bandeau/.test(BG));
});

await cas("lot 6 (T2) : la recréation Vinted relit la boutique AVANT le formulaire, compte à plusieurs boutiques seulement", () => {
  const corps = BG.slice(BG.indexOf("// ── (18/10, lot 6 — T2) LA BOUTIQUE DE L'ANNONCE, AVANT LE FORMULAIRE"));
  const iGarde = corps.indexOf("gardeBoutiqueRecreationVintedDuJob(accessToken, job)");
  const iForm = corps.indexOf('await updateJobStatus(accessToken, job.id, "processing", { platform_fields: pf });');
  assert.ok(iGarde > 0 && iForm > iGarde, "garde avant le passage en cours et le formulaire");
  assert.ok(/etape: "avant_recreation"/.test(corps));
  const g = fonction(BG, "gardeBoutiqueRecreationVintedDuJob");
  assert.ok(/size < 2\) return null;/.test(g), "une seule boutique : rien ne change");
  const attendue = new Function(`${fonction(BG, "boutiqueAttendueRecreationVinted")}; return boutiqueAttendueRecreationVinted;`)();
  assert.equal(attendue({ platform: "vinted", action: "republish", platform_fields: { republish_step: "deleted", vinted_account_id: "371531" } }), "371531");
  assert.equal(attendue({ platform: "vinted", action: "republish", platform_fields: { republish_step: "deleted", gardes: { garde_boutique: { boutique_article: "16389756" } } } }), "16389756");
  assert.equal(attendue({ platform: "vinted", action: "republish", platform_fields: { republish_step: "captured", vinted_account_id: "371531" } }), "", "seulement à la recréation");
  assert.equal(attendue({ platform: "leboncoin", action: "republish", platform_fields: { republish_step: "deleted" } }), "");
});

await cas("lot 6 : le poste dit au poll sa boutique Vinted et ses sessions (15 min au plus), forme attendue par le serveur", () => {
  assert.ok(/\.\.\.ceQueLePosteDitDeLui\(\),/.test(BG));
  const f = fonction(BG, "ceQueLePosteDitDeLui");
  assert.ok(/vinted_identite = \{ user_id: String\(viSonde\.user_id\), lu_le:/.test(f));
  assert.ok(/for \(const p of \["vinted", "leboncoin", "beebs", "depop", "ebay"\]\) out\.sessions_poste\[p\] = s\[p\] === true \? true : s\[p\] === false \? false : null;/.test(f));
  const P = lire("supabase/functions/_shared/poste-extension.ts");
  assert.ok(/b\.vinted_identite/.test(P) && /b\.sessions_poste/.test(P), "le serveur lit ces deux champs");
});

await cas("lot 6 (T5) : une commande Vinted SUIVIE d'une autre boutique (403/404 sans anti-robot) : on passe, jamais une pause du compte", () => {
  assert.ok(/if \(o\.suivie && \(rd\.status === 403 \|\| rd\.status === 404\)\) \{\n        const corps = await rd\.text\(\)\.catch\(\(\) => ""\);\n        if \(!\/datadome\|captcha-delivery\|geo\\\.captcha\/i\.test\(corps\.slice\(0, 4000\)\)\) continue;/.test(MS));
});

console.log(`extension-0-6-126-selftest : ${n} cas verts`);
