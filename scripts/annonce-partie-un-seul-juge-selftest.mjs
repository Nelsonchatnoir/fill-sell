// Autotest — « annonce partie » : UN SEUL JUGE (05/11, garde-fou de Nico sur la migration 20261105110000) —
// `npm run selftest:annonce-partie-un-seul-juge`.
// republication_annonce_partie() (SQL) ne juge rien : elle LIT les verdicts `annonce_disparue` écrits par le juge des
// relevés (decisionIntrouvable : handler-watch, republications en pause et annonces publiées — 7c48b8c) et par la règle
// « deux relevés complets par boutique » de get-pending-jobs. Jamais un doute (sale_signal 'unavailable'), une lecture
// seule (sonde publique), un 403, un 404 Beebs « en vérification », une pause, une annonce Vinted masquée.
// Ce test casse dès qu'un NOUVEL auteur écrit une marque que la SQL lirait sans qu'on l'ait relu, ou que la SQL se met
// à lire autre chose.
import fs from "node:fs";

let ko = 0, n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// (07/11 soir) La DERNIÈRE définition du dépôt (ordre des fichiers) : 20261105110000, puis 20261107193200 (déclaration
// « je l'ai retirée moi-même » et constat de deux relevés probants, lus eux aussi sans rien juger).
const DOSSIER = "supabase/migrations";
const FICHIERS = fs.readdirSync(new URL(`../${DOSSIER}`, import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
const MIGRATION = FICHIERS.filter((f) => lire(`${DOSSIER}/${f}`).includes("CREATE OR REPLACE FUNCTION public.republication_annonce_partie"))
  .map((f) => `${DOSSIER}/${f}`).at(-1);
const sql = lire(MIGRATION);
const debut = sql.indexOf("CREATE OR REPLACE FUNCTION public.republication_annonce_partie");
const corps = sql.slice(debut, sql.indexOf("$function$;", debut));
const code = corps.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
console.log(`(définition lue : ${MIGRATION})`);

console.log("1. La SQL lit les verdicts, rien d'autre");
ok(/LIKE 'handler-watch \(%'/.test(code), "auteurs lus : handler-watch (…) — le juge des relevés");
ok(/IN \('deux_releves_complets_par_boutique', 'deux_releves_probants'\)/.test(code),
  "auteurs lus : get-pending-jobs, deux relevés complets (par boutique Vinted, ou probants pour une republication « cible absente »)");
ok(/!~ '« \(hidden\|draft\) »'/.test(code), "une annonce Vinted masquée ou en brouillon n'est jamais « partie » (7c48b8c)");
ok(!/'unavailable'/.test(code), "jamais sur un doute : sale_signal 'unavailable' n'est pas lu", code.match(/.*unavailable.*/)?.[0]);
ok(!/unavailable_since/.test(code), "unavailable_since n'est pas lu");
ok(!/sonde publique|update-job-status|get-pending-jobs \(article/.test(code), "les marques des lectures seules ne sont pas lues");
ok(/a\.vu_le > COALESCE\(public\._ts_ou_null\(d\.v ->> 'at'\), public\._ts_ou_null\(d\.v ->> 'le'\), d\.created_at\)/.test(code),
  "un relevé qui revoit l'annonce après le verdict lève la garde (at, ou « le » pour get-pending-jobs)");
ok(/transaction_plateforme = 'sold'/.test(code) && /sale_signal' = 'sold'/.test(code), "vente prouvée : relevée vendue, ou page lue « vendue »");

console.log("\n2. Les auteurs que la SQL lit sont bien des verdicts CONFIRMÉS");
const sources = [];
const parcourir = (dir) => {
  for (const e of fs.readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) parcourir(p);
    else if (/\.(ts|js)$/.test(e.name) && !/selftest/.test(e.name)) sources.push(p);
  }
};
parcourir("supabase/functions");
const AUTEURS_CONFIRMES = new Set([
  "handler-watch (introuvable confirmé par un relevé)",            // decisionIntrouvable « confirmer » (republication en pause)
  "handler-watch (annonce publiée confirmée disparue)",           // 7c48b8c, annonce publiée
  "handler-watch (republication en pause confirmée disparue)",    // 7c48b8c, dépôts publiés d'une republication close
]);
const vus = new Set();
for (const p of sources) {
  const s = lire(p);
  // Toute chaîne « handler-watch (…) » posée comme auteur d'un verdict annonce_disparue (pose_par direct, ou posePar
  // passé au patch de 7c48b8c, ou la liste POSES_PAR_DISPARUE).
  const blocs = [
    ...[...s.matchAll(/annonce_disparue\s*=\s*\{[^}]*\}/g)].map((m) => m[0]),
    ...[...s.matchAll(/patchAnnoncePublieeDisparue\([^;]*/g)].map((m) => m[0]),
    ...[...s.matchAll(/POSES_PAR_DISPARUE\s*=\s*Object\.freeze\(\[[^\]]*\]/g)].map((m) => m[0]),
    ...[...s.matchAll(/posePar\s*=\s*'handler-watch[^']*'/g)].map((m) => m[0]),
  ];
  for (const b of blocs) for (const m of b.matchAll(/["'](handler-watch \([^"']*\))["']/g)) {
    vus.add(m[1]);
    ok(AUTEURS_CONFIRMES.has(m[1]), `${p} : « ${m[1]} » est un verdict confirmé connu`,
      "nouvel auteur : relire sa preuve (deux relevés complets, vente prouvée) avant que la SQL le lise");
    ok(/supabase\/functions\/(handler-watch\/index\.ts|_shared\/annonce-publiee-disparue\.js)$/.test(p), `${p} : seul handler-watch signe « handler-watch (…) »`);
  }
}
ok(vus.has("handler-watch (introuvable confirmé par un relevé)"), "le verdict de decisionIntrouvable est bien écrit par handler-watch");
const hw = lire("supabase/functions/handler-watch/index.ts");
const iConf = hw.indexOf('pose_par: "handler-watch (introuvable confirmé par un relevé)"');
ok(iConf > 0 && /d\.decision === "confirmer"/.test(hw.slice(Math.max(0, iConf - 400), iConf)), "… et seulement sur la décision « confirmer » du juge");

const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const occ = [...gpj.matchAll(/deux_releves_complets_par_boutique/g)];
ok(occ.length === 1, "get-pending-jobs : une seule marque « deux relevés complets par boutique »", `${occ.length} occurrences`);
const avant = occ.length ? gpj.slice(Math.max(0, occ[0].index - 2500), occ[0].index) : "";
ok(/deux\.length < 2/.test(avant) && /complet\(r\)/.test(avant), "… posée seulement après deux relevés COMPLETS par boutique");
for (const p of sources) {
  if (p.endsWith("get-pending-jobs/index.ts")) continue;
  ok(!lire(p).includes("deux_releves_complets_par_boutique"), `${p} : n'écrit pas la marque de get-pending-jobs`);
}

const occP = [...gpj.matchAll(/par: "deux_releves_probants"/g)];
ok(occP.length === 1, "get-pending-jobs : une seule marque « deux relevés probants »", `${occP.length}`);
const avantP = occP.length ? gpj.slice(Math.max(0, occP[0].index - 1500), occP[0].index) : "";
ok(/relevesVus\.length >= RELEVES_POUR_CLORE_CIBLE_ABSENTE/.test(avantP) && /v\.motif === "cible_absente_du_releve"/.test(avantP),
  "… posée seulement après deux relevés probants distincts, jamais sur un doute (deux annonces en ligne)");
for (const p of sources) {
  if (p.endsWith("get-pending-jobs/index.ts")) continue;
  ok(!lire(p).includes('"deux_releves_probants"'), `${p} : n'écrit pas la marque « deux relevés probants »`);
}

console.log("\n2 bis. (07/11 soir) Les deux constats lus en plus — confirmés, jamais un doute");
const nouveau = /constats AS \(/.test(code);
ok(!nouveau || (/x\.status = 'cancelled'/.test(code)
  && code.includes("x.error IN ('Réponse dans l''app : « je l''ai retirée moi-même » — pas une vente',")
  && code.includes("'Annonce retirée par le vendeur (confirmé dans l''app)')")),
  "la déclaration : un job « cancelled » portant EXACTEMENT un des deux libellés de la réponse de la personne");
const msgApp = /const MSG_REPONSE_RETIREE =\s*\n?\s*"([^"]+)"/.exec(lire("src/App.jsx"))?.[1] ?? "";
ok(!nouveau || (msgApp && code.includes(`'${msgApp.replace(/'/g, "''")}'`)), "… le libellé est celui que l'app écrit (src/App.jsx MSG_REPONSE_RETIREE)", msgApp);
const derniere = (re) => FICHIERS.map((f) => lire(`${DOSSIER}/${f}`)).filter((t) => re.test(t)).at(-1) ?? "";
const decl = derniere(/CREATE TRIGGER cross_post_jobs_declaration_retiree_ferme_retraits/);
ok(!nouveau || (decl.includes("Réponse dans l''app : « je l''ai retirée moi-même » — pas une vente") && decl.includes("Annonce retirée par le vendeur (confirmé dans l''app)")),
  "… les deux mêmes libellés que le déclencheur cross_post_jobs_declaration_retiree_ferme_retraits");
ok(!nouveau || (/jsonb_typeof\(x\.platform_fields -> 'absence_releves'\) = 'object'/.test(code)
  && /absence_releves,listing_id\}', ''\)\) = lid\.id/.test(code) && /absence_releves,premier\}/.test(code) && /absence_releves,second\}/.test(code)
  && /x\.inventaire_id = p_inventaire_id AND x\.platform = p_platform\s+AND jsonb_typeof\(x\.platform_fields -> 'absence_releves'\)/.test(code)),
  "le constat absence_releves : CE numéro, deux relevés nommés (premier, second), sur un dépôt de CETTE fiche (index de la fiche)");
ok(!nouveau || /a\.vu_le >= c\.depuis/.test(code), "… un relevé qui revoit l'annonce depuis le repère lève la garde");
const constater = derniere(/CREATE OR REPLACE FUNCTION public\.constater_absences_releve/);
ok(!nouveau || (/IF NOT releve_preuve_absence\(p_run\)/.test(constater) && /AND releve_preuve_absence\(s\.id\)/.test(constater)
  && /'absence_releves',jsonb_build_object\('premier',precedent\.id,'second',r\.id,'listing_id',a\.listing_id/.test(constater)),
  "… posé par constater_absences_releve seulement après DEUX relevés probants distincts (releve_preuve_absence, le sien et le précédent)");
let ecrivains = 0;
for (const p of sources) {
  const actif = lire(p).split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  if (/absence_releves\s*=(?!=)|\[\s*["']absence_releves["']\s*\]\s*=(?!=)|["']absence_releves["']\s*:|\babsence_releves\s*:/.test(actif)) {
    ecrivains++; ok(false, `${p} écrit absence_releves`, "seul constater_absences_releve (SQL) pose ce constat : relire sa preuve avant que la SQL le lise");
  }
}
ok(ecrivains === 0, `fonctions edge (${sources.length} fichiers) : aucune n'écrit le constat absence_releves`);

console.log("\n3. Les lectures seules ne signent jamais comme le juge");
const ujs = lire("supabase/functions/update-job-status/index.ts");
ok(/annonce_disparue"\] = \{ at: [^}]*par: "sonde publique serveur" \}/.test(ujs), "update-job-status : la sonde publique signe « sonde publique serveur » (non lue)");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — un seul juge`);
process.exit(ko ? 1 : 0);
