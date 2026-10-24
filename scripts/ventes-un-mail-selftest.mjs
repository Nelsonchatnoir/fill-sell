// selftest:ventes-un-mail — (24/10, lot « zéro blocage », A9) Les ventes d'un même compte décidées dans le même
// passage partent dans UN mail ; jamais deux mails pour une même vente, jamais une vente sans mail.
//   npm run selftest:ventes-un-mail
// Cas réel : louis-seller, 24/10 12:11 — 5 notes (4199 → 4203) décidées dans le même passage, 5 mails partis.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const { groupesDeMail } = await import(pathToFileURL(path.join(RACINE, "supabase/functions/_shared/ventes-un-mail.js")).href);
let n = 0;
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
console.log("ventes-un-mail-selftest");

const LOUIS = "447d920c-0000-0000-0000-000000000000";
const note = (id, extra = {}) => ({ id, user_id: LOUIS, email: "louis-seller@ttfamily.fr", lang: "fr", a_decider: false, plateforme: "leboncoin", ...extra });

cas("1. louis-seller : 5 notes du même passage → UN groupe, tête = la plus ancienne", () => {
  const g = groupesDeMail([note(4203), note(4199), note(4201), note(4200), note(4202)]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].map((x) => x.id), [4199, 4200, 4201, 4202, 4203]);
});

cas("2. deux comptes → deux mails ; « à confirmer » et « enregistrée » ne se mélangent jamais", () => {
  const g = groupesDeMail([note(1), note(2, { a_decider: true }), note(3, { user_id: "autre", email: "a@b.fr" }), note(4)]);
  assert.equal(g.length, 3);
  assert.deepEqual(g.map((x) => x.map((y) => y.id)), [[1, 4], [2], [3]]);
});

cas("3. une vente seule reste seule (aucun retard, aucun changement)", () => {
  const g = groupesDeMail([note(42)]);
  assert.deepEqual(g.map((x) => x.map((y) => y.id)), [[42]]);
  assert.deepEqual(groupesDeMail([]), []);
});

cas("4. push-ventes : groupes par passage, chaque vente réserve SA clé, rien de parti → tout relâché", () => {
  const p = lire("supabase/functions/push-ventes/index.ts");
  assert.ok(p.includes('import { groupesDeMail } from "../_shared/ventes-un-mail.js";'));
  assert.ok(/groupesDeMail\(notes\.filter\(\(n\) => n\.mail === true\)\)/.test(p), "les notes à mailer sont groupées");
  assert.ok(/if \(membres\.length === 1\) \{\s*const n = membres\[0\];\s*const v = await envoyerMailVente\(admin, n\)/.test(p), "une note seule : le chemin d'avant, à l'identique");
  assert.ok(/email_type: `vente:\$\{n\.id\}`/.test(p), "chaque autre vente réserve sa clé vente:<id> (index unique)");
  assert.ok(/=== "23505"\) out\.set\(n\.id, \{ statut: "deja_envoye" \}\)/.test(p), "une vente déjà servie sort du groupe");
  assert.ok(/await relacher\(reservees\);\s*for \(const n of groupe\) out\.set\(n\.id, v\);/.test(p), "rien de parti : réservations relâchées, chaque vente réessayée");
  assert.ok(/if \(v\.statut === "deja_envoye" && reservees\.length\) \{[\s\S]{0,120}file = reservees;/.test(p), "tête déjà servie : les autres repartent entre elles");
  // Les gardes d'avant restent (selftests vente-vinted-en-lot G1, ventes-prix-inconnu E2, vente-signalee-une-fois 4i).
  assert.ok(/const articles: ArticleNote\[\] = Array\.isArray\(n\.articles\) && n\.articles\.length \? n\.articles : \[n\];/.test(p));
  assert.ok(/aConfirmer: n\.a_decider === true/.test(p));
  assert.ok(/const prixVente = prixVenteConnu\(n\.prix\);/.test(p));
});

console.log(`ventes-un-mail-selftest : ${n} cas verts`);
