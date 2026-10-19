// Banc « tailles du titre » (19/10) — rejeu AVANT / APRÈS, sans écrire nulle part.
//   node scripts/bancs/tailles-titre/rejeu-tailles.mjs <dossier-avant> <dossier-données>
// <dossier-avant> : une copie du dépôt au commit d'avant (git worktree) ; l'APRÈS est ce dépôt.
// <dossier-données> : les sorties JSON (rows) des requêtes de ce dossier :
//   questions-ecran.json, grilles.json, grilles-ebay.json, annonces-publiees.json, questions-taille-jobs.json
// Trois preuves :
//   1. les questions « Taille » affichées par l'écran Publier en 7 jours, rejouées avec la fiche telle qu'elle était :
//      combien restent, et la valeur déduite face au choix de la personne (le job parti ensuite) ;
//   2. les annonces PUBLIÉES en 30 jours : aucune taille qui passait ne change (jugement, job, eBay) ;
//   3. les jobs arrêtés sur une question de taille (handler-watch) : avant / après.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const [AVANT, DONNEES] = process.argv.slice(2);
if (!AVANT || !DONNEES) { console.error("usage : rejeu-tailles.mjs <dossier-avant> <dossier-données>"); process.exit(2); }
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

// ── 1. LES QUESTIONS DE L'ÉCRAN ────────────────────────────────────────────
const questions = lire("questions-ecran.json");
const r1 = { total: questions.length, sansGrille: 0, rejouees: 0, avant: 0, apres: 0, leveesJustes: 0, leveesDifferentes: 0, leveesSansChoix: 0,
  valeurInconnue: 0, parPlateforme: {}, connues: { rejouees: 0, avant: 0, apres: 0 }, cas: [], restent: [] };
for (const q of questions) {
  const job = q.job ?? null;
  const at = q.taille_at ? Date.parse(q.taille_at) : 0;
  // La fiche telle qu'elle était à la question : une taille écrite APRÈS (la réponse recopiée) ne compte pas.
  // Réécrite après la question : la valeur d'avant se lit au journal de la fiche (attributs.taille, « avant ») ;
  // sans trace au journal, elle est inconnue — rejouée vide (le texte seul), et comptée à part.
  const reecrite = at && at > Date.parse(q.created_at) + 5000;
  const parJournal = reecrite && q.taille_journal;
  if (reecrite && !parJournal) r1.valeurInconnue++;
  const v = !reecrite ? net(q.taille_fiche) : parJournal ? net(q.taille_journal.avant) : net(job?.taille_saisie);
  const textes = textesDe(q, job);
  let avantQ, apresQ, valeurApres = null, choix = null;
  if (q.platform === "ebay") {
    const liste = grillesEbay.get(String(job?.ebay_cat ?? q.cat)) ?? null;
    if (!liste?.length) { r1.sansGrille++; continue; }
    const exact = (x) => liste.some((a) => LP.normAspectVal(a) === LP.normAspectVal(x));
    const send = v.replace(/^EU\s*/i, "");
    avantQ = !v || (!exact(send) && !LA.tailleDansListeEbay(send, liste));
    valeurApres = v && exact(send) ? send : LP.tailleDansListeEbay(send, liste, { textes, champ: q.champ });
    apresQ = !valeurApres;
    choix = net(job?.ebay_taille || job?.taille);
  } else {
    const g = grilleDe(q.platform, q.cat, q.champ, q.cle);
    if (!g) { r1.sansGrille++; continue; }
    const chemin = String(q.cat).split(" > ");
    const juger = (L, t) => L.jugerValeurContreListe({ platform: q.platform, key: g.field_key, value: v, allowedValues: g.allowed_values, cheminCategorie: chemin, textes: t });
    avantQ = !v || !juger(LA, textes).dans;
    if (v) { const j = juger(LP, textes); valeurApres = j.dans ? j.valeurListe : null; }
    else valeurApres = LP.tailleDeduiteDuTexte({ platform: q.platform, key: g.field_key, value: "", allowedValues: g.allowed_values, cheminCategorie: chemin, textes })?.valeur ?? null;
    apresQ = !valeurApres;
    choix = net(job?.taille);
  }
  r1.rejouees++;
  const pp = (r1.parPlateforme[q.platform] ??= { rejouees: 0, avant: 0, apres: 0 });
  pp.rejouees++;
  if (avantQ) { r1.avant++; pp.avant++; }
  if (apresQ) { r1.apres++; pp.apres++; }
  // La part rejouée avec la valeur EXACTE de la fiche à la question (le reste : valeur réécrite depuis, inconnue).
  const inconnue = Boolean(reecrite && !parJournal);
  if (!inconnue) { r1.connues.rejouees++; if (avantQ) r1.connues.avant++; if (apresQ) r1.connues.apres++; }
  if (avantQ && !apresQ) {
    // Un CHOIX = une réponse de la personne : la question levée par SON geste (« complete » ou « retiree »,
    // par = personne ; avant le 18/10, « complete » plus de 20 s après l'affichage). Sinon (abandonnée, levée
    // par le moteur, job parti avec la valeur de départ) : pas un choix — la valeur du job ne dit rien.
    const t0 = Date.parse(q.created_at);
    const humain = (q.issues ?? []).some((x) => (x.issue === "complete" || x.issue === "retiree")
      && (x.par === "personne" || (!x.par && x.issue === "complete" && Date.parse(x.t) - t0 >= 20000)));
    if (!humain || (choix && v && LP.normAspectVal(choix) === LP.normAspectVal(v))) choix = null;
    const juste = choix && LP.normAspectVal(choix) === LP.normAspectVal(valeurApres);
    if (!choix) r1.leveesSansChoix++; else if (juste) r1.leveesJustes++; else r1.leveesDifferentes++;
    r1.cas.push({ inconnue, quand: q.created_at, compte: q.email, plateforme: q.platform, valeur: v, deduite: valeurApres, choix: choix || null, statutJob: job?.status ?? null,
      verdict: !choix ? "sans choix" : juste ? "= choix" : "≠ choix", titre: String(q.titre ?? "").slice(0, 90) });
  }
  if (avantQ && apresQ) r1.restent.push({ plateforme: q.platform, champ: q.champ, valeur: v || null, inconnue: Boolean(reecrite && !parJournal), titre: String(q.titre ?? "").slice(0, 80) });
  if (!avantQ && apresQ) r1.cas.push({ regression: true, quand: q.created_at, plateforme: q.platform, valeur: v, titre: String(q.titre ?? "").slice(0, 90) });
}

// ── 2. LES ANNONCES PUBLIÉES : RIEN NE CHANGE DE CE QUI PASSAIT ─────────────
const annonces = lire("annonces-publiees.json");
const r2 = { total: annonces.length, jugees: 0, passaient: 0, changees: 0, nouvelles: 0, jobAvantApresDiff: 0, ebayJugees: 0, ebayDiff: 0, ebayNouvelles: 0, sansGrille: 0, cas: [] };
for (const a of annonces) {
  const textes = [a.fiche_titre ?? "", a.fiche_description ?? "", a.title ?? "", a.description ?? ""];
  if (a.platform === "ebay") {
    const liste = grillesEbay.get(String(a.ebay_cat)) ?? null;
    const v = net(a.taille).replace(/^EU\s*/i, "");
    if (!liste?.length) { r2.sansGrille++; continue; }
    r2.ebayJugees++;
    const av = v ? LA.tailleDansListeEbay(v, liste) : null;
    const ap = LP.tailleDansListeEbay(v, liste, { textes, champ: "Taille", chemin: null });
    if (av && av !== ap) { r2.ebayDiff++; r2.cas.push({ ebay: true, id: a.id, v, avant: av, apres: ap }); }
    if (!av && ap) r2.ebayNouvelles++;
    continue;
  }
  const rows = grilles.filter((g) => g.platform === a.platform && g.category_key === a.cle);
  if (!rows.length) { r2.sansGrille++; continue; }
  const chemin = String(a.cle).split(" > ");
  const v = net(a.taille_saisie || a.taille);
  for (const g of rows) {
    r2.jugees++;
    const av = v ? LA.jugerValeurContreListe({ platform: a.platform, key: g.field_key, value: v, allowedValues: g.allowed_values, cheminCategorie: chemin, textes }) : { dans: false };
    const ap = v ? LP.jugerValeurContreListe({ platform: a.platform, key: g.field_key, value: v, allowedValues: g.allowed_values, cheminCategorie: chemin, textes })
      : { dans: Boolean(LP.tailleDeduiteDuTexte({ platform: a.platform, key: g.field_key, value: "", allowedValues: g.allowed_values, cheminCategorie: chemin, textes })) };
    if (av.dans) {
      r2.passaient++;
      if (!ap.dans || ap.valeurListe !== av.valeurListe) { r2.changees++; r2.cas.push({ id: a.id, plateforme: a.platform, v, avant: av.valeurListe, apres: ap.valeurListe ?? null }); }
    } else if (ap.dans) r2.nouvelles++;
  }
  const lignes = rows.map((g) => ({ key: g.field_key, allowedValues: g.allowed_values }));
  const jA = LA.tailleDuJob({ platform: a.platform, taille: v, lignes, textes });
  const jP = LP.tailleDuJob({ platform: a.platform, taille: v, lignes, textes, cheminCategorie: chemin });
  if (jA && jA !== jP) { r2.jobAvantApresDiff++; r2.cas.push({ job: true, id: a.id, plateforme: a.platform, v, avant: jA, apres: jP }); }
}

// ── 3. LES JOBS ARRÊTÉS SUR UNE QUESTION DE TAILLE (handler-watch) ──────────
const jobs = lire("questions-taille-jobs.json");
const r3 = { total: jobs.length, ouverts: 0, avant: 0, apres: 0, diff: 0, cas: [] };
for (const j of jobs) {
  const pf = j.pf ?? {};
  if (j.status !== "needs_user" || !pf.needsUserField) continue;
  r3.ouverts++;
  const job = { status: j.status, platform: j.platform, platform_fields: pf };
  const textes = [j.fiche_titre, j.fiche_description, j.title, j.description].map((t) => String(t ?? "").slice(0, 4000));
  const av = QA.reponseTailleAuto(job, j.fiche_taille ?? null);
  const ap = QP.reponseTailleAuto(job, j.fiche_taille ?? null, textes);
  if (av) r3.avant++;
  if (ap) r3.apres++;
  if (av && (!ap || ap.valeur !== av.valeur)) r3.diff++;
  r3.cas.push({ id: j.id, plateforme: j.platform, champ: pf.needsUserField?.field_key, taille: pf.taille ?? null, avant: av?.valeur ?? null, apres: ap?.valeur ?? null, regle: ap?.regle ?? null, titre: String(j.fiche_titre ?? "").slice(0, 70) });
}

const sortie = { le: new Date().toISOString(), questionsEcran: r1, annoncesPubliees: r2, jobsQuestionTaille: r3 };
fs.writeFileSync(path.join(DONNEES, "rejeu-tailles.json"), JSON.stringify(sortie, null, 1));
console.log("1. Questions « Taille » de l'écran (7 j) :", JSON.stringify({ ...r1, cas: undefined, restent: undefined }));
for (const c of r1.cas) console.log("   ", c.regression ? "⛔ RÉGRESSION" : c.verdict, "|", c.plateforme, "|", c.valeur || "∅", "→", c.deduite, "| choix :", c.choix, "|", c.titre);
for (const c of r1.restent) console.log("    reste |", c.plateforme, c.champ, "|", c.valeur ?? "∅", c.inconnue ? "(valeur inconnue)" : "", "|", c.titre);
console.log("2. Annonces publiées (30 j) :", JSON.stringify({ ...r2, cas: undefined }));
for (const c of r2.cas) console.log("    ⛔", JSON.stringify(c));
console.log("3. Jobs arrêtés sur la taille (7 j) :", JSON.stringify({ ...r3, cas: undefined }));
for (const c of r3.cas) console.log("   ", c.plateforme, c.champ, JSON.stringify(c.taille), "| avant :", c.avant, "| après :", c.apres, c.regle ?? "", "|", c.titre);
const rouge = r1.cas.some((c) => c.regression) || r2.changees || r2.jobAvantApresDiff || r2.ebayDiff || r3.diff;
process.exit(rouge ? 1 : 0);
