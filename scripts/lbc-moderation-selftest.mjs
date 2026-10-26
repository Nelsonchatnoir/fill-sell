// ═══════════════════════════════════════════════════════════════════════════
// LA MODÉRATION LEBONCOIN N'EST JAMAIS « À TOI » (26/10 nuit, point 5) — `npm run selftest:lbc-moderation`
// ═══════════════════════════════════════════════════════════════════════════
// xxewwer, 52b5ec71 « WWE 2K20 – PS4 » (25/10) : cinq dépôts identiques refusés (« Nous refusons ce type de bien ou
// service sur leboncoin.fr » · « … ne respecte pas nos règles de diffusion »), puis « Corrige le titre ou la
// description dans la fiche, puis relance » — alors que la même description est en ligne sur Vinted, eBay et Beebs.
// Décision de Nico : un refus de modération est de NOTRE fait. Vérifié ici : la décision (pause « FillSell s'en
// occupe », source lbc_moderation), l'état affiché (en pause, jamais « à toi »), la cause (nous), le classement dès
// la première remontée (update-job-status), la reprise des anciennes questions et l'alerte au support (handler-watch).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const imp = (p) => import(pathToFileURL(join(RACINE, p)).href);
const P = await imp("supabase/functions/_shared/pas-de-rouge.js");
const E = await imp("supabase/functions/_shared/etat-job.js");
const C = await imp("supabase/functions/_shared/cause-blocage.js");
const F = await imp("src/utils/fileDesJobs.js");
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };

const BRUT = "Leboncoin refuse le dépôt : « Nous refusons ce type de bien ou service sur leboncoin.fr » · « Le bien que vous essayez de vendre ne respecte pas nos règles de diffusion » — corrige l'annonce dans FillSell, puis relance la publication. — Observabilité: adsubmit HTTP 403 (champ body, body) ; /deposer-une-annonce";

console.log("1. La décision : la pause « FillSell s'en occupe », jamais « à toi »");
const d = P.decisionRefusContenuLeboncoin({ action: "publish", brut: BRUT, pf: {}, empreinte: "abcd1234", nettoyageModifie: false });
ok(d.verdict === "attente" && d.statut === "needs_user" && d.source === "lbc_moderation" && d.motif === "lbc_moderation", "52b5ec71 : en pause, source lbc_moderation", JSON.stringify({ v: d.verdict, s: d.source }));
ok(d.message.startsWith("Leboncoin a refusé cette annonce à la modération (« Nous refusons ce type de bien ou service sur leboncoin.fr »"), "les mots exacts de Leboncoin", d.message.slice(0, 120));
ok(/En pause — FillSell s'en occupe/.test(d.message) && /ta fiche ne change pas/.test(d.message) && !/Corrige|relance/i.test(d.message), "jamais « corrige la fiche », jamais « relance »");
ok(d.pf.lbc_refus_contenu.empreintes.includes("abcd1234"), "l'empreinte du texte refusé est gardée (jamais renvoyé tel quel)");
const s = P.classerEchec({ platform: "leboncoin", action: "publish", brut: BRUT, essais: 0, pf: {}, empreinteTexteServi: "abcd1234", nettoyageModifie: false });
ok(s.source === "lbc_moderation", "classerEchec (update-job-status) : la même décision");
const titre = P.decisionRefusContenuLeboncoin({ brut: "Leboncoin refuse le dépôt : « Merci de modifier votre titre. » — Observabilité: adsubmit HTTP 403 (champ subject)", pf: {}, empreinte: "x", nettoyageModifie: false });
ok(titre.source === "champ_a_choisir", "seul le TITRE refusé reste une question (un mot nommé, un geste)");

console.log("\n2. L'état affiché et la cause");
const job = { id: "52b5ec71", platform: "leboncoin", action: "publish", status: "needs_user", error: d.message, platform_fields: { needs_user_source: "lbc_moderation" } };
ok(E.attenteAutomatique(job) === "lbc_moderation", "attente automatique (en pause), jamais « à toi de jouer »");
const v = E.etatJob(job, {});
ok(v.etat === E.ETATS.EN_PAUSE && v.motif === "lbc_moderation", "état : en pause, motif lbc_moderation", JSON.stringify(v));
const sit = F.situationJob(job, { lang: "fr" });
ok(sit.groupe === "en_pause" && /FillSell s'en occupe/.test(sit.raison), "la file : « En pause — FillSell s'en occupe … »", sit.raison);
ok(/FillSell is on it/.test(F.situationJob(job, { lang: "en" }).raison), "en anglais aussi");
const c1 = C.causeDuTexte({ texte: d.message, source: "lbc_moderation", platform: "leboncoin" });
ok(c1.origine === "nous" && c1.cause === "texte_refuse_moderation", "la cause : de notre fait (source)", JSON.stringify(c1));
const c2 = C.causeDuTexte({ texte: "Leboncoin refuse le texte de cette annonce : « Nous refusons ce type de bien ou service sur leboncoin.fr ».", source: "relancer", platform: "leboncoin" });
ok(c2.origine === "nous" && c2.cause === "texte_refuse_moderation", "la cause : de notre fait (texte d'avant)", JSON.stringify(c2));

console.log("\n3. Branchements");
const UJS = lire("supabase/functions/update-job-status/index.ts");
ok(/const lbcRefusContenuAPoser = \(statutEffectif === "pending" \|\| statutEffectif === "failed" \|\| statutEffectif === "needs_user"\)\s*&& typeof body\.error === "string" && LBC_REFUS_CONTENU_RE\.test\(body\.error\)\s*&& String\(\(pfIn \?\? \{\}\)\["republish_step"\] \?\? ""\) !== "deleted";/.test(UJS),
  "update-job-status : classé dès la PREMIÈRE remontée (jamais pendant une recréation)");
ok(/empreinteTexteServi: empreinteLbcServie, nettoyageModifie: false/.test(UJS), "… avec l'empreinte du texte servi qui vient d'être refusé");
const HW = lire("supabase/functions/handler-watch/index.ts");
ok(/eq\("platform_fields->pas_de_rouge->>motif", "lbc_contenu_refuse"\)/.test(HW) && /pfN\.needs_user_source = "lbc_moderation";/.test(HW), "handler-watch : les anciennes questions « corrige la fiche » deviennent la pause");
ok(/filter\("platform_fields->>lbc_moderation_alerte_le", "is", "null"\)/.test(HW) && /lbc_moderation_alerte_le: new Date\(\)\.toISOString\(\)/.test(HW), "handler-watch : le support est prévenu, une fois par job");
const EXT = lire("chrome-extension/etat-job.js");
ok(/lbc_moderation: "lbc_moderation"/.test(EXT), "la copie de l'extension (etat-job.js) est à jour");

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
