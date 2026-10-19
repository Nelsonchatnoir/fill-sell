// Banc « taille unique » (19/10 soir) — rejeu AVANT / APRÈS SYMÉTRIQUE, sans écrire nulle part.
//   node scripts/bancs/taille-unique/rejeu-taille-unique.mjs <dossier-avant> <dossier-données>
// <dossier-avant> : une copie du dépôt au commit d'avant (git worktree) ; l'APRÈS est ce dépôt.
// <dossier-données> : les sorties JSON (rows) des requêtes de scripts/bancs/tailles-titre/ :
//   questions-ecran.json, grilles.json, grilles-ebay.json, annonces-publiees.json (90 j),
//   questions-taille-serveur.json (ce dossier ; à défaut questions-taille-jobs.json)
// Différence avec rejeu-tailles.mjs : l'avant et l'après passent par la MÊME fonction, textes compris
// (le code d'avant sait déjà lire le titre depuis 558c29e) — seul l'effet de la règle de la taille unique se voit.
// Trois preuves :
//   1. les questions « Taille » affichées par l'écran Publier en 7 jours : combien restent avant / après ;
//   2. les annonces PUBLIÉES (90 j) : aucune taille servie ne change (jugement, job, eBay) ;
//   3. les jobs arrêtés sur une question de taille (handler-watch) : avant / après.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const [AVANT, DONNEES] = process.argv.slice(2);
if (!AVANT || !DONNEES) { console.error("usage : rejeu-taille-unique.mjs <dossier-avant> <dossier-données>"); process.exit(2); }
const imp = (racine, p) => import(pathToFileURL(path.join(racine, p)).href);
const lire = (f) => JSON.parse(fs.readFileSync(path.join(DONNEES, f), "utf8"));

const LA = await imp(AVANT, "src/publication/moteur/listes.js");
const LP = await imp(ICI, "src/publication/moteur/listes.js");
const QA = await imp(AVANT, "supabase/functions/_shared/taille-question-auto.js");
const QP = await imp(ICI, "supabase/functions/_shared/taille-question-auto.js");

const grilles = lire("grilles.json");
const grillesEbay = new Map(lire("grilles-ebay.json").map((g) => [String(g.category_id), (g.valeurs ?? []).map(String)]));
const CLE_ECRAN = { vinted: { Taille: "size" }, leboncoin: { Pointure: "shoe_size", Taille: "clothing_st" }, beebs: {} };
const grilleDe = (platform, cat, champ, cle) => grilles.find((g) => g.platform === platform && g.category_key === cat
  && (g.field_key === (cle || CLE_ECRAN[platform]?.[champ] || champ) || g.field_label === champ));
const textesDe = (q, job) => [q.titre ?? q.fiche_titre ?? "", q.description ?? q.fiche_description ?? "", job?.title ?? "", job?.description ?? ""];
const net = (v) => String(v ?? "").trim();

// La valeur que l'écran pose pour (copie v, grille, textes) avec le module L — null = la question reste.
function valeurEcran(L, { platform, key, v, vals, chemin, textes }) {
  if (platform === "ebay") {
    const exact = (x) => vals.some((a) => L.normAspectVal(a) === L.normAspectVal(x));
    const send = v.replace(/^EU\s*/i, "");
    if (v && exact(send)) return send;
    return L.tailleDansListeEbay(send, vals, { textes, champ: "Taille" }) ?? null;
  }
  if (v) { const j = L.jugerValeurContreListe({ platform, key, value: v, allowedValues: vals, cheminCategorie: chemin, textes }); return j.dans ? j.valeurListe : null; }
  return L.tailleDeduiteDuTexte({ platform, key, value: "", allowedValues: vals, cheminCategorie: chemin, textes })?.valeur ?? null;
}

// ── 1. LES QUESTIONS DE L'ÉCRAN (7 j) ──────────────────────────────────────
const questions = lire("questions-ecran.json");
const r1 = { total: questions.length, sansGrille: 0, rejouees: 0, avant: 0, apres: 0, levees: [], regressions: [], parPlateforme: {}, connues: { rejouees: 0, avant: 0, apres: 0 } };
for (const q of questions) {
  const job = q.job ?? null;
  const at = q.taille_at ? Date.parse(q.taille_at) : 0;
  const reecrite = at && at > Date.parse(q.created_at) + 5000;
  const parJournal = reecrite && q.taille_journal;
  const v = !reecrite ? net(q.taille_fiche) : parJournal ? net(q.taille_journal.avant) : net(job?.taille_saisie);
  const textes = textesDe(q, job);
  let ctx;
  if (q.platform === "ebay") {
    const vals = grillesEbay.get(String(job?.ebay_cat ?? q.cat)) ?? null;
    if (!vals?.length) { r1.sansGrille++; continue; }
    ctx = { platform: "ebay", key: "Taille", v, vals, chemin: null, textes };
  } else {
    const g = grilleDe(q.platform, q.cat, q.champ, q.cle);
    if (!g) { r1.sansGrille++; continue; }
    ctx = { platform: q.platform, key: g.field_key, v, vals: g.allowed_values, chemin: String(q.cat).split(" > "), textes };
  }
  const a = valeurEcran(LA, ctx), p = valeurEcran(LP, ctx);
  r1.rejouees++;
  const pp = (r1.parPlateforme[q.platform] ??= { rejouees: 0, avant: 0, apres: 0 });
  pp.rejouees++;
  if (!a) { r1.avant++; pp.avant++; }
  if (!p) { r1.apres++; pp.apres++; }
  const inconnue = Boolean(reecrite && !parJournal);
  if (!inconnue) { r1.connues.rejouees++; if (!a) r1.connues.avant++; if (!p) r1.connues.apres++; }
  const ligne = { quand: q.created_at, compte: q.email, plateforme: q.platform, valeur: v || null, avant: a, apres: p, choix: net(job?.ebay_taille || job?.taille) || null, titre: String(q.titre ?? "").slice(0, 80) };
  if (!a && p) r1.levees.push(ligne);
  if (a && a !== p) r1.regressions.push(ligne);
}

// ── 2. LES ANNONCES PUBLIÉES (90 j) : RIEN NE CHANGE DE CE QUI EST SERVI ────
const annonces = lire("annonces-publiees.json");
const r2 = { total: annonces.length, jugees: 0, servies: 0, changees: 0, nouvelles: 0, jobDiff: 0, ebayJugees: 0, ebayServies: 0, ebayDiff: 0, ebayNouvelles: 0, sansGrille: 0, cas: [] };
for (const a of annonces) {
  const textes = [a.fiche_titre ?? "", a.fiche_description ?? "", a.title ?? "", a.description ?? ""];
  if (a.platform === "ebay") {
    const vals = grillesEbay.get(String(a.ebay_cat)) ?? null;
    if (!vals?.length) { r2.sansGrille++; continue; }
    r2.ebayJugees++;
    const v = net(a.taille).replace(/^EU\s*/i, "");
    const av = LA.tailleDansListeEbay(v, vals, { textes, champ: "Taille" });
    const ap = LP.tailleDansListeEbay(v, vals, { textes, champ: "Taille" });
    if (av) r2.ebayServies++;
    if (av && av !== ap) { r2.ebayDiff++; r2.cas.push({ ebay: true, id: a.id, v, avant: av, apres: ap }); }
    if (!av && ap) { r2.ebayNouvelles++; r2.cas.push({ ebay: true, nouvelle: true, id: a.id, v, apres: ap, titre: String(a.title ?? "").slice(0, 70) }); }
    continue;
  }
  const rows = grilles.filter((g) => g.platform === a.platform && g.category_key === a.cle);
  if (!rows.length) { r2.sansGrille++; continue; }
  const chemin = String(a.cle).split(" > ");
  const v = net(a.taille_saisie || a.taille);
  for (const g of rows) {
    r2.jugees++;
    const ctx = { platform: a.platform, key: g.field_key, v, vals: g.allowed_values, chemin, textes };
    const av = valeurEcran(LA, ctx), ap = valeurEcran(LP, ctx);
    if (av) { r2.servies++; if (av !== ap) { r2.changees++; r2.cas.push({ id: a.id, plateforme: a.platform, v, avant: av, apres: ap }); } }
    else if (ap) { r2.nouvelles++; r2.cas.push({ nouvelle: true, id: a.id, plateforme: a.platform, v, apres: ap, titre: String(a.title ?? "").slice(0, 70) }); }
  }
  const lignes = rows.map((g) => ({ key: g.field_key, allowedValues: g.allowed_values }));
  const jA = LA.tailleDuJob({ platform: a.platform, taille: v, lignes, textes, cheminCategorie: chemin });
  const jP = LP.tailleDuJob({ platform: a.platform, taille: v, lignes, textes, cheminCategorie: chemin });
  if (jA && jA !== jP) { r2.jobDiff++; r2.cas.push({ job: true, id: a.id, plateforme: a.platform, v, avant: jA, apres: jP }); }
}

// ── 3. LES JOBS ARRÊTÉS SUR UNE QUESTION DE TAILLE (handler-watch) ──────────
// questions-taille-serveur.sql : la question est RECONSTRUITE quand elle a été levée depuis (needsUserField
// effacé à la réponse) — la clé répondue, la grille du rayon (eBay : l'aspect « Taille » de la catégorie ;
// Beebs, Vinted, Leboncoin : la grille relevée) ; la réponse de la personne retirée de la copie.
const jobs = lire(fs.existsSync(path.join(DONNEES, "questions-taille-serveur.json")) ? "questions-taille-serveur.json" : "questions-taille-jobs.json");
const CLE_SERVEUR = { ebay: "Taille", beebs: "Taille", vinted: "size", leboncoin: "clothing_st", depop: "depopTaille" };
const CHEMIN_SERVEUR = { beebs: "beebsCategoryPath", vinted: "categoryPath", leboncoin: "lbcCategoryPath" };
function questionReconstruite(j, pf) {
  if (pf.needsUserField?.allowed_values?.length) return pf.needsUserField;
  const resolue = Object.keys(pf.needsUserResolved ?? {}).find((k) => /(^|\.)(taille|size|pointure|depoptaille|clothing_st|shoe_size)$/i.test(k));
  const [root, key] = resolue?.includes(".") ? resolue.split(".") : [null, resolue ?? CLE_SERVEUR[j.platform]];
  let allowed = null;
  if (j.platform === "ebay") allowed = grillesEbay.get(String(pf.ebayCategoryId ?? "")) ?? null;
  else if (CHEMIN_SERVEUR[j.platform]) {
    const cle = Array.isArray(pf[CHEMIN_SERVEUR[j.platform]]) ? pf[CHEMIN_SERVEUR[j.platform]].join(" > ") : "";
    allowed = grilles.find((g) => g.platform === j.platform && g.category_key === cle && /^(taille|size|clothing_st|baby_age|shoe_size|pointure)$|_size$/i.test(g.field_key))?.allowed_values ?? null;
  }
  if (!allowed?.length) return null;
  if (resolue && root) { pf[root] = { ...(pf[root] ?? {}) }; delete pf[root][key]; }
  // Réponse posée à la racine (« taille ») : la valeur d'avant la réponse (handler-watch : « de » ; sinon la saisie), à défaut vide.
  else if (resolue) pf[key] = pf.taille_convertie_serveur?.de ?? pf.taille_saisie ?? "";
  return { platform: j.platform, field_key: j.platform === "ebay" ? "Taille" : (key || CLE_SERVEUR[j.platform]), field_label: "Taille",
    target: root ? { root, key } : { key: key || "taille", root: null }, allowed_values: allowed };
}
const r3 = { total: jobs.length, rejoues: 0, sansGrille: 0, avant: 0, apres: 0, diff: 0, cas: [] };
for (const j of jobs) {
  const pf = { ...(j.pf ?? {}) };
  pf.needsUserField = questionReconstruite(j, pf);
  if (!pf.needsUserField) { r3.sansGrille++; continue; }
  delete pf.taille_convertie_serveur;   // rejoué comme au moment de la question
  r3.rejoues++;
  const job = { status: "needs_user", platform: j.platform, platform_fields: pf };
  const textes = [j.fiche_titre, j.fiche_description, j.title, j.description].map((t) => String(t ?? "").slice(0, 4000));
  const av = QA.reponseTailleAuto(job, j.fiche_taille ?? null, textes);
  const ap = QP.reponseTailleAuto(job, j.fiche_taille ?? null, textes);
  if (av) r3.avant++;
  if (ap) r3.apres++;
  if (av && (!ap || ap.valeur !== av.valeur)) r3.diff++;
  r3.cas.push({ id: j.id, plateforme: j.platform, statut: j.status, champ: pf.needsUserField?.field_key, taille: pf.taille ?? null, avant: av?.valeur ?? null, apres: ap?.valeur ?? null, regle: ap?.regle ?? null, titre: String(j.fiche_titre ?? j.title ?? "").slice(0, 70) });
}

const sortie = { le: new Date().toISOString(), questionsEcran: r1, annoncesPubliees: r2, jobsQuestionTaille: r3 };
fs.writeFileSync(path.join(DONNEES, "rejeu-taille-unique.json"), JSON.stringify(sortie, null, 1));
console.log("1. Questions « Taille » de l'écran (7 j) :", JSON.stringify({ ...r1, levees: r1.levees.length, regressions: r1.regressions.length }));
for (const c of r1.levees) console.log("    levée |", c.plateforme, "|", c.valeur ?? "∅", "→", c.apres, "| choix :", c.choix, "|", c.titre);
for (const c of r1.regressions) console.log("    ⛔ RÉGRESSION |", JSON.stringify(c));
console.log("2. Annonces publiées (90 j) :", JSON.stringify({ ...r2, cas: undefined }));
for (const c of r2.cas) console.log("   ", c.nouvelle ? "nouvelle" : "⛔", JSON.stringify(c));
console.log("3. Jobs arrêtés sur la taille (7 j) :", JSON.stringify({ ...r3, cas: undefined }));
for (const c of r3.cas) console.log("   ", c.avant !== c.apres ? "≠" : "=", c.plateforme, c.champ, JSON.stringify(c.taille), "| avant :", c.avant, "| après :", c.apres, c.regle ?? "", "|", c.titre);
const rouge = r1.regressions.length || r2.changees || r2.jobDiff || r2.ebayDiff || r3.diff;
process.exit(rouge ? 1 : 0);
