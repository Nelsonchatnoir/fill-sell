// ═══════════════════════════════════════════════════════════════════════════
// REJEU SANS IA DES QUESTIONS eBAY D'UNE SEMAINE (18/10, eBay ÷ 5)
// ═══════════════════════════════════════════════════════════════════════════
//   node scripts/bancs/zero-friction/rejeu-ebay.mjs [--debut "2026-10-11 15:00"] [--fin "2026-10-18 15:00"] [--reprendre] [--liste]
// Lecture seule (deux SELECT), aucun appel IA. Bornes en heure de Paris.
// Entrées : rejeu-ebay-questions.sql (les lignes « affiche » eBay, leur suite,
// la fiche, le PRÉ-CALCUL lu dans categorie_journal, la publication eBay qui
// a suivi, les réponses de l'IA reçues avant l'affichage) et
// rejeu-ebay-aspects.sql (les aspects EXIGÉS de chaque catégorie, Taxonomy).
// Données brutes : dossier temporaire du poste, jamais dans le dépôt. Sortie :
// docs/enquetes/zero-friction-1810/rejeu-ebay.json (chiffres + identifiants
// d'articles, comptes tronqués à 8 caractères).
//
// QUATRE LECTURES DE LA MÊME SEMAINE :
//   avant      les lignes telles qu'affichées (vraies = levées par la personne
//              ou abandonnées) ;
//   rapport    la méthode du RAPPORT du 18/10 (catégorie de l'encart = celle du
//              JOB, dimensions regroupées ; le reste intact) — doit redonner 41 ;
//   aujourd'hui les règles servies depuis le web 634050b (18/10 16:33) : encart
//              sur le pré-calcul, dimensions en une question, option du texte
//              avant l'IA ; l'artefact « levée par le moteur < 20 s » (corrigé le
//              17/10) ne compte plus ;
//   après      + L1 (Longueur de la robe), L2 (valeur connue reposée), L3a (pas
//              d'icône avant le pré-calcul), L3b (icône démentie, voie API),
//              L3c (décoration murale : pas l'icône du motif).
// DEUX HYPOTHÈSES là où le journal ne dit rien (pré-calcul non journalisé —
// arbre déterministe, par exemple) :
//   central     la catégorie qui est partie (job), sinon celle de la question ;
//   pessimiste  la catégorie de la question.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ICI = path.join(RACINE, "scripts", "bancs", "zero-friction");
const TMP = path.join(os.tmpdir(), "fillsell-rejeu-ebay");
fs.mkdirSync(TMP, { recursive: true });
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1] ?? d); };
const DEBUT = arg("debut", "2026-10-11 15:00");
const FIN = arg("fin", "2026-10-18 15:00");
const REPRENDRE = process.argv.includes("--reprendre");
const LISTE = process.argv.includes("--liste");
const imp = (p) => import(pathToFileURL(path.join(RACINE, p)).href);
const { longueurDeLaRobeDuTexte, EBAY_LONGUEUR_ROBE } = await imp("src/publication/moteur/aspectsEbayAuto.js");
const { estDimensionEbay } = await imp("src/publication/moteur/regles.js");
const { deduireOptionDuTexte, textesDeLAnnonce } = await imp("src/publication/moteur/listes.js");
const { EBAY_ASPECT_LABELS } = await imp("src/publication/moteur/champsPartages.js");
const { familleJeuVideo, plateformeEbayDuJeu } = await imp("src/utils/jeuxVideo.js");
const { detectObjectKeywordDetail, titreNommeUneDecorationMurale } = await imp("src/utils/shared.js");
const { getEbayCategoryId } = await imp("src/utils/ebayCategories.js");

function sql(nom, texte) {
  const cache = path.join(TMP, `${nom}-${DEBUT}-${FIN}.json`.replace(/[: ]/g, "_"));
  if (REPRENDRE && fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, "utf8"));
  const f = path.join(TMP, `${nom}-${process.pid}.sql`);
  fs.writeFileSync(f, texte);
  try {
    const out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-f", f, "-o", "json"], { cwd: RACINE, encoding: "utf8", shell: true, maxBuffer: 512 * 1024 * 1024 });
    const rows = JSON.parse(out.slice(out.indexOf("{"))).rows ?? [];
    fs.writeFileSync(cache, JSON.stringify(rows));
    return rows;
  } finally { fs.unlinkSync(f); }
}
const gabarit = (f) => fs.readFileSync(path.join(ICI, f), "utf8");
const Q = sql("questions", gabarit("rejeu-ebay-questions.sql")
  .replaceAll("{{DEBUT}}", `${DEBUT} Europe/Paris`).replaceAll("{{FIN}}", `${FIN} Europe/Paris`));

// ── Les catégories à relire : question, pré-calcul, job, et celle que l'icône de l'IA donnerait (L3c) ──
const numero = (c) => (/^\d+$/.test(String(c ?? "")) ? String(c) : null);
const LIBELLES_PARTAGE = { Matière: "matiere", Taille: "taille", Couleur: "couleur", Marque: "marque" };
const cles = new Set();
for (const r of Q) {
  for (const c of [r.cat, r.precalc_id, r.job_cat]) if (numero(c)) cles.add(numero(c));
  if (r.icone_ia) { const c = getEbayCategoryId(r.icone_ia); if (c) cles.add(String(c)); }
}
const ASP = Object.fromEntries(sql("aspects", gabarit("rejeu-ebay-aspects.sql").replaceAll("{{CATEGORIES}}", [...cles].map((c) => `'${c}'`).join(",") || "''"))
  .map((x) => [String(x.category_id), x.requis ?? []]));

const TEXTE_AVANT_IA_EBAY = new Set(["Longueur de la robe", "Plateforme", "Style", "Type", "Matière de la couche extérieure"]);
const MARQUE_GENERIQUE_RE = /(sans\s*marque|g[ée]n[ée]rique|unbranded|no\s*brand)/i; // ListingPreviewScreen, defautAspectEbay
const libellesDe = (r) => (r.partage ? (EBAY_ASPECT_LABELS[r.partage] ?? [r.champ]) : (LIBELLES_PARTAGE[r.champ] && !numero(r.cat) ? EBAY_ASPECT_LABELS[LIBELLES_PARTAGE[r.champ]] : [r.champ]));
const exige = (cat, r) => { const req = ASP[cat]; if (!req) return null; return req.filter((a) => libellesDe(r).includes(a.name)); };
const vraieAvant = (r) => r.issue === "personne" || r.issue === "abandon";

// Les sources de catégorie qui ne dépendent d'AUCUN arbitrage de l'IA : le
// pré-calcul et le clic les calculent à l'identique (resolutionPublication,
// étape 2 « mot exact dans l'arbre », jeux vidéo, mot-clé du titre…) — le
// journal ne les écrit pas, la catégorie du job est donc celle du pré-calcul.
const SOURCES_DETERMINISTES = new Set(["mot_objet_arbre", "mot_cle_arbre", "famille_jeu_video", "machine_jeu_video", "mot_cle", "catalog_vinted", "famille_livres", "mot_objet_ia"]);
/** La catégorie de l'encart sous les règles d'aujourd'hui. */
function categorieEncart(r, hypothese) {
  if (numero(r.precalc_id)) return { cat: String(r.precalc_id), source: "precalcul", apres: Number(r.precalc_t) > Number(r.t_epoch) + 2 };
  if (r.aucune_seule || r.job_source === "icone_non_confirmee") return { cat: numero(r.cat), source: "icone_dementie" };
  if (numero(r.job_cat) && SOURCES_DETERMINISTES.has(r.job_source)) return { cat: String(r.job_cat), source: "job_deterministe" };
  if (hypothese === "central" && numero(r.job_cat)) return { cat: String(r.job_cat), source: "job" };
  return { cat: numero(r.cat), source: "question" };
}
/** Le rejeu d'UNE ligne : { garde: bool, raison } sous un jeu de règles. */
function rejouer(r, regles, hypothese, vusDims) {
  const dim = estDimensionEbay(r.champ);
  const cleArticle = `${r.user_id}|${r.inv}`;
  if (regles === "rapport") {
    if (!vraieAvant(r)) return { garde: false, raison: "pas une vraie question" };
    if (!dim) return { garde: true, raison: "inchangé (méthode du rapport)" };
    const catJob = numero(r.job_cat);
    if (catJob && ASP[catJob] && !exige(catJob, r).length) return { garde: false, raison: "dimension non exigée par la catégorie du job" };
    if (vusDims.has(cleArticle)) return { garde: false, raison: "une question « Dimensions » par article" };
    vusDims.add(cleArticle);
    return { garde: true, raison: "dimension exigée" };
  }
  if (r.issue === "moteur") return { garde: false, raison: "levée par le moteur < 20 s (artefact corrigé le 17/10)" };
  const apres = regles === "apres";
  let { cat, source, apres: precalculApres } = categorieEncart(r, hypothese);
  // L3b — l'icône démentie par la vérification, voie API : le serveur choisit et remplit.
  const voieApi = r.job_voie === "api" || r.compte_voie_api === true;
  if (apres && source === "icone_dementie" && voieApi) return { garde: false, raison: "L3b : icône démentie, voie API — le serveur choisit la catégorie" };
  // L3c — décoration murale : la passe 2 (motif de la description) ne fixe plus l'icône.
  if (apres && source === "question" && titreNommeUneDecorationMurale(r.titre ?? "")) {
    const d = detectObjectKeywordDetail(r.titre ?? "", `${r.description ?? ""} ${r.marque ?? ""}`);
    if (d?.passe === 2 && r.icone_ia) {
      const c = getEbayCategoryId(r.icone_ia);
      if (c) { cat = String(c); source = "icone_ia"; }
    }
  }
  // Le champ est-il exigé par la catégorie de l'encart ?
  const ex = cat ? exige(cat, r) : null;
  if (ex && !ex.length && !(source === "icone_ia" && dim)) {
    // L3c a déplacé l'article : ses dimensions éventuelles comptent pour une question (ci-dessous).
    if (source === "icone_ia" && (ASP[cat] ?? []).some((a) => estDimensionEbay(a.name)) && !vusDims.has(cleArticle)) {
      vusDims.add(cleArticle);
      return { garde: true, raison: "L3c : l'icône de l'IA (🖼️) exige des dimensions — une question « Dimensions »", champ: "Dimensions", cat };
    }
    // L3a — sans attente, la question s'affichait sur l'icône avant que le pré-calcul ne la retire.
    if (!apres && source === "precalcul" && precalculApres) return { garde: false, affichee: true, raison: "affichée sur l'icône puis retirée au pré-calcul" };
    return { garde: false, raison: `non exigé par la catégorie de l'encart (${cat}, ${source})` };
  }
  if (r.issue === "retiree" && apres) return { garde: false, raison: "L3a : plus d'encart sur une catégorie qui change" };
  // Dimensions : une question par article.
  if (dim) {
    if (vusDims.has(cleArticle)) return { garde: false, raison: "une question « Dimensions » par article" };
    vusDims.add(cleArticle);
  }
  const titre = r.titre ?? ""; const description = r.description ?? "";
  const asp = (ex ?? []).find((a) => a.name === r.champ) ?? null;
  // L'option que le texte nomme, avant l'IA (servi aujourd'hui).
  if (asp && TEXTE_AVANT_IA_EBAY.has(r.champ) && (asp.allowedValues ?? []).length) {
    const d = deduireOptionDuTexte({ platform: "ebay", key: r.champ, label: r.champ, allowedValues: asp.allowedValues, textes: textesDeLAnnonce({ titre, description, platformFields: {} }) });
    if (d?.valeur) return { garde: false, raison: `option du texte : ${d.valeur}` };
  }
  if (!apres) return { garde: true, raison: "reste" };
  // L1 — Longueur de la robe lue dans le texte du vendeur.
  if (r.champ === EBAY_LONGUEUR_ROBE) {
    const ch = Array.isArray(r.chemin_vinted) ? r.chemin_vinted : [];
    const d = longueurDeLaRobeDuTexte({ allowedValues: asp?.allowedValues ?? [], mode: asp?.mode ?? "FREE_TEXT",
      textes: [{ source: "titre", texte: titre }, { source: "description", texte: description }, { source: "categorie_vinted", texte: ch.length ? String(ch[ch.length - 1]) : "" }] });
    if (d?.valeur) return { garde: false, raison: `L1 : ${d.valeur} (${d.source})` };
  }
  // L2 — la valeur connue : défaut sûr (Plateforme d'un jeu, Modèle sans marque) ou réponse de l'IA déjà reçue.
  if (r.champ === "Plateforme") {
    const p = plateformeEbayDuJeu(familleJeuVideo(titre, description), titre);
    if (p && (!asp?.allowedValues?.length || asp.allowedValues.includes(p))) return { garde: false, raison: `L2 : défaut ${p}` };
  }
  if (r.champ === "Modèle" && asp?.mode !== "SELECTION_ONLY"
      && (r.famille === "livres_medias" || !String(r.marque ?? "").trim() || MARQUE_GENERIQUE_RE.test(String(r.marque ?? "")))) {
    return { garde: false, raison: "L2 : défaut « Ne s'applique pas »" };
  }
  const libelles = libellesDe(r);
  const iaConnue = (Array.isArray(r.ia) ? r.ia : []).find((x) => (!cat || String(x.cat) === String(cat) || String(x.cat) === String(numero(r.cat)))
    && libelles.some((l) => String(x.valeurs?.[l] ?? "").trim()));
  if (iaConnue) return { garde: false, raison: `L2 : réponse de l'IA déjà reçue (${libelles.map((l) => iaConnue.valeurs?.[l]).find(Boolean)})` };
  return { garde: true, raison: "reste" };
}

const resultat = {};
const restants = {};
// L'identifiant d'un compte ne sort jamais du poste (même règle que banc-ia.mjs) :
// dans le fichier du dépôt, « compte A1, A2… » ; à l'écran (--liste), ses 8 premiers caractères.
const alias = new Map();
const compteAnonyme = (u) => { if (!alias.has(u)) alias.set(u, `A${alias.size + 1}`); return alias.get(u); };
for (const regles of ["avant", "rapport", "aujourdhui", "apres"]) {
  for (const hypothese of regles === "avant" || regles === "rapport" ? ["unique"] : ["central", "pessimiste"]) {
    const vusDims = new Set();
    const t = { affichees: 0, vraies: 0, par_champ: {} };
    const liste = [];
    for (const r of Q) {
      let garde; let raison; let champ = r.champ; let affichee = false; let catR = null;
      if (regles === "avant") { garde = true; raison = "affichée"; } else {
        const x = rejouer(r, regles === "aujourdhui" ? "aujourdhui" : regles, hypothese, vusDims);
        garde = x.garde; raison = x.raison; affichee = Boolean(x.affichee); if (x.champ) champ = x.champ; catR = x.cat ?? null;
      }
      const champAff = estDimensionEbay(champ) ? "Dimensions" : champ;
      if (garde || affichee) t.affichees++;
      if (garde && vraieAvant(r)) {
        t.vraies++;
        t.par_champ[champAff] = (t.par_champ[champAff] ?? 0) + 1;
        liste.push({ champ: champAff, champ_affiche: r.champ, cat_question: r.cat, cat_rejeu: catR ?? (categorieEncart(r, hypothese === "unique" ? "central" : hypothese).cat), compte: compteAnonyme(r.user_id), poste: String(r.user_id).slice(0, 8), inventaire_id: r.inv, issue: r.issue, raison });
      }
    }
    const cle = hypothese === "unique" ? regles : `${regles}_${hypothese}`;
    resultat[cle] = { affichees: t.affichees, vraies: t.vraies, par_champ: Object.fromEntries(Object.entries(t.par_champ).sort((a, b) => b[1] - a[1])) };
    restants[cle] = liste;
  }
}
console.log(`\nSemaine du ${DEBUT} au ${FIN} (heure de Paris) — ${Q.length} questions eBay affichées\n`);
console.table(Object.fromEntries(Object.entries(resultat).map(([k, v]) => [k, { affichees: v.affichees, vraies: v.vraies, facteur_affichees_avant: (resultat.avant.affichees / Math.max(1, v.vraies)).toFixed(1) }])));
for (const k of ["aujourdhui_central", "apres_central", "apres_pessimiste"]) console.log(`${k} :`, JSON.stringify(resultat[k].par_champ));
if (LISTE) for (const k of ["aujourdhui_central", "apres_central", "apres_pessimiste"]) { console.log(`\n── ${k} : ce qui reste ──`); for (const x of restants[k]) console.log(`  ${x.champ.padEnd(28)} ${String(x.cat_rejeu ?? x.cat_question).padEnd(8)} ${x.poste} ${x.inventaire_id} ${x.issue.padEnd(8)} ${x.raison}`); }
const sansPoste = (l) => l.map(({ poste: _poste, ...x }) => x);
const dest = path.join(RACINE, "docs", "enquetes", "zero-friction-1810", "rejeu-ebay.json");
fs.writeFileSync(dest, `${JSON.stringify({ rejeu: "questions eBay de l'écran Publier, sans IA (eBay ÷ 5)", fait_le: new Date().toISOString(), semaine: { debut: DEBUT, fin: FIN, fuseau: "Europe/Paris" },
  lecture: "vraies = levées par la personne ou abandonnées ; affichées = toutes les lignes qui s'afficheraient encore",
  resultat, restants: { aujourdhui_central: sansPoste(restants.aujourdhui_central), apres_central: sansPoste(restants.apres_central), apres_pessimiste: sansPoste(restants.apres_pessimiste) } }, null, 1)}\n`);
console.log(`→ ${path.relative(RACINE, dest)}`);
