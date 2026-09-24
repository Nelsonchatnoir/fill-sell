// ═══════════════════════════════════════════════════════════════════════════
// REJEU À BLANC — « LE RAYON REFUSÉ NE PART JAMAIS » (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Rejoue la résolution de publication (utils/resolutionPublication.js) sur les
// dépôts RÉELS, sans rien publier, avec DEUX versions du code :
//   · AVANT : les fichiers tels qu'au commit HEAD (git show), dans un dossier à
//     part, leurs imports relatifs réécrits vers le dépôt ;
//   · APRÈS : le dépôt tel qu'il est.
// Pour chaque dépôt : le rayon obtenu (chemin, identifiant, drapeau incertain,
// écarté avant débit ou non) par l'un et par l'autre, et celui enregistré en
// base.
//
// LES RÉPONSES DE L'IA — « l'oracle historique ». Chaque appel à
// resolve-categorie reçoit la réponse qu'il a EUE à l'époque, déduite du job
// (le chemin finalement posé, le verdict de vérification enregistré) : la
// candidate égale au chemin posé, ou le préfixe de ce chemin quand c'est une
// descente d'arbre ; null sinon ; et pour un rayon refusé, le refus lui-même.
// Les deux versions reçoivent donc EXACTEMENT les mêmes réponses : toute
// différence vient du code, jamais de l'IA.
// Seuls les appels NOUVEAUX (consigne « plus_proche », l'étape du 25/09) :
//   · mode b (non-régression) : ils ne doivent JAMAIS partir pour un dépôt hors
//     du périmètre ; l'oracle répond null s'ils partent, et le rapport les compte ;
//   · mode a (les 33) : ils partent VRAIMENT vers resolve-categorie (en prod,
//     avec `rejeu: true` — rien n'est écrit dans categorie_journal).
//
// LES DONNÉES : deux résultats SQL enregistrés tels que le serveur MCP les rend
// (jobs.raw.txt, inv.raw.txt). Les requêtes sont en bas de ce fichier.
//
//   node --import ./scripts/loader-ext.mjs scripts/rejeu-rayon-refuse.mjs <dossier> --mode=b
//   FS_CRON_SECRET=… node --import ./scripts/loader-ext.mjs scripts/rejeu-rayon-refuse.mjs <dossier> --mode=a
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.resolve(process.argv[2] ?? ".");
const MODE = (process.argv.find((a) => a.startsWith("--mode=")) ?? "--mode=b").slice(7);
const SEULEMENT = (process.argv.find((a) => a.startsWith("--jobs=")) ?? "").slice(7).split(",").filter(Boolean);
const URL_FONCTIONS = "https://tojihnuawsoohlolangc.supabase.co/functions/v1";
const ORDRE = ["vinted", "leboncoin", "beebs", "ebay", "opla"];
const REFUS = new Set(["incoherent", "refuse_hors_famille", "descente_non_confirmee"]);

// ── Les données ──────────────────────────────────────────────────────────────
function lireResultatMcp(fichier) {
  const txt = JSON.parse(fs.readFileSync(fichier, "utf8")).result;
  const m = txt.match(/<untrusted-data-[0-9a-f-]+>\n([\s\S]*?)\n<\/untrusted-data-/);
  if (!m) throw new Error(`format inattendu : ${fichier}`);
  return JSON.parse(m[1]);
}
const JOBS = lireResultatMcp(path.join(DOSSIER, "jobs.raw.txt"))[0].jobs;
const INV = new Map((lireResultatMcp(path.join(DOSSIER, "inv.raw.txt"))[0].inv ?? []).map((v) => [Number(v.i), v]));

// ── L'AVANT : les fichiers de HEAD, imports réécrits ────────────────────────
const MODIFIES = [
  "src/utils/resolutionPublication.js",
  "src/utils/categorieParMot.js",
  "src/utils/rayonPublication.js",
  "src/publication/moteur/regles.js",
];
const AVANT = path.join(DOSSIER, "avant");
function cheminDImport(depuis, spec) {
  const cible = path.resolve(path.dirname(path.join(RACINE, depuis)), spec);
  for (const suffixe of ["", ".js", ".mjs", "/index.js"]) {
    const f = cible + suffixe;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      const rel = path.relative(RACINE, f).split(path.sep).join("/");
      return MODIFIES.includes(rel) ? path.join(AVANT, rel) : f;
    }
  }
  throw new Error(`import introuvable : ${spec} depuis ${depuis}`);
}
function preparerAvant() {
  for (const rel of MODIFIES) {
    const src = execFileSync("git", ["show", `HEAD:${rel}`], { cwd: RACINE, encoding: "utf8", maxBuffer: 64 << 20 });
    const reecrit = src.replace(/(from\s+|import\s*\()(["'])(\.{1,2}\/[^"']+)\2/g, (_, avant, q, spec) =>
      `${avant}${q}${pathToFileURL(cheminDImport(rel, spec)).href}${q}`);
    const dest = path.join(AVANT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, reecrit);
  }
}

// ── Les outils de l'écran (ListingPreviewScreen.jsx), découpés tels quels ───
// resolveArticleIcon(Detail) décide de l'icône, donc des chemins d'icône : ils
// doivent être ceux de l'app, au caractère près. On les DÉCOUPE du fichier.
function preparerOutils() {
  const src = fs.readFileSync(path.join(RACINE, "src/components/ListingPreviewScreen.jsx"), "utf8").replace(/\r\n/g, "\n");
  const tranche = (debut) => {
    const i = src.indexOf(debut);
    if (i < 0) throw new Error(`introuvable dans ListingPreviewScreen.jsx : ${debut}`);
    const fin = src.indexOf("\n}\n", i);
    return src.slice(i, fin + 3);
  };
  const opla = src.match(/const OPLA_ETAT_PAR_LIBELLE = \{[\s\S]*?\n\};/)[0];
  const url = (rel) => pathToFileURL(path.join(RACINE, rel)).href;
  const code = [
    `import { detectObjectIcon, detectObjectIconKeyword, detectObjectKeywordDetail, ALL_OBJECT_ICONS, estSupportNonLivre } from "${url("src/utils/shared.js")}";`,
    `import { familleJeuVideo } from "${url("src/utils/jeuxVideo.js")}";`,
    `import { estAnglaisAvere } from "${url("supabase/functions/_shared/langue.js")}";`,
    opla,
    "const VALID_OBJECT_ICONS = new Set(ALL_OBJECT_ICONS);",
    tranche("function resolveArticleIcon(args) {"),
    tranche("function resolveArticleIconDetail({"),
    "export { OPLA_ETAT_PAR_LIBELLE, resolveArticleIcon, resolveArticleIconDetail };",
  ].join("\n");
  const dest = path.join(DOSSIER, "outils-ecran.mjs");
  fs.writeFileSync(dest, code);
  return dest;
}

// ── Les lots : les jobs d'une même publication ──────────────────────────────
function lots() {
  const parCle = new Map();
  for (const j of [...JOBS].sort((a, b) => a.t - b.t)) {
    const cle = `${j.u}|${j.a ?? `T:${String(j.ti ?? "").slice(0, 40)}`}`;
    const liste = parCle.get(cle) ?? [];
    const dernier = liste[liste.length - 1];
    if (dernier && j.t - dernier.t1 <= 90) { dernier.jobs.push(j); dernier.t1 = j.t; }
    else liste.push({ cle, t0: j.t, t1: j.t, jobs: [j] });
    parCle.set(cle, liste);
  }
  return [...parCle.values()].flat();
}

const estChemin = (c) => Array.isArray(c) && c.length > 0;
const cleC = (c) => (estChemin(c) ? c.map((s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()).join(" > ") : "");

// ── L'ORACLE HISTORIQUE ──────────────────────────────────────────────────────
function oracle(lot, { reel }) {
  const parPf = Object.fromEntries(lot.jobs.map((j) => [j.p, j]));
  const journal = { plusProche: [], appels: 0 };
  const repondre = async (corps) => {
    journal.appels++;
    if (corps?.consigne === "plus_proche") {
      journal.plusProche.push(Object.keys(corps.candidats ?? {}).join(","));
      if (reel) return reel(corps);
      return { data: { choix: {} }, error: null };
    }
    const choix = {};
    for (const [p, cands] of Object.entries(corps?.candidats ?? {})) {
      const j = parPf[p];
      if (!j || !Array.isArray(cands) || !cands.length) continue;
      const f = j.f ?? {};
      const refuse = REFUS.has(f.vv);
      const icone = estChemin(f.vi) ? cleC(f.vi) : null;
      let cible = null;
      if (refuse) {
        // Le refus d'époque, rejoué : l'IA refusait le chemin de l'icône
        // (incoherent) ou le confirmait avant que la famille ne l'écarte
        // (refuse_hors_famille). Aucune autre réponse à l'époque.
        const contientIcone = icone && cands.some((c) => cleC(c.chemin) === icone);
        if (f.vv === "refuse_hors_famille" && contientIcone) cible = f.vi;
      } else if (f.src !== "choix_humain") {
        cible = f.cp ?? null;
      }
      if (!estChemin(cible)) continue;
      const kc = cleC(cible);
      const exact = cands.find((c) => cleC(c.chemin) === kc);
      const prefixe = exact ? null : cands.find((c) => estChemin(c.chemin) && c.chemin.length < cible.length && kc.startsWith(`${cleC(c.chemin)} > `));
      const retenu = exact ?? prefixe;
      if (retenu) choix[p] = { chemin: retenu.chemin, id: retenu.id ?? null, source: "arbre" };
    }
    return { data: { choix }, error: null };
  };
  return { repondre, journal };
}

// ── LE CONTEXTE D'UNE PUBLICATION, RECONSTITUÉ ───────────────────────────────
async function contexte(lot, mods) {
  const { feuilleDepuisOrigine, genreDepuisOrigine, objetDuRayonChoisi, outilsEcran, GENERIC_ASPECTS_PF_KEY, normAspectVal } = mods;
  const plateformes = ORDRE.filter((p) => lot.jobs.some((j) => j.p === p));
  const aId = lot.jobs[0].a;
  const inv = aId != null ? INV.get(Number(aId)) : null;
  const edited = {};
  for (const j of lot.jobs) {
    const f = j.f ?? {};
    const pf = {};
    for (const k of ["genre", "univers", "taille", "etat", "marque", "couleur", "matiere", "categorie"]) {
      if (f[k] != null && f[k] !== "") pf[k] = f[k];
    }
    edited[j.p] = { title: j.ti ?? "", description: "", platform_fields: pf };
    if (f.src === "choix_humain" && estChemin(f.ch?.chemin)) {
      edited[j.p].rayon_choisi = { chemin: f.ch.chemin, id: f.ch.id ?? null, le: f.ch.le ?? null };
    }
  }
  const initialListing = inv
    ? { titre: inv.ti ?? null, description: inv.d ?? null, categorie: inv.ty || "Autre", vinted_catalog_id: inv.vc ?? null,
        marque: inv.m || "", attributs: inv.at && Object.keys(inv.at).length ? inv.at : null, origine: inv.o ?? null }
    : { titre: lot.jobs[0].ti ?? null, description: null, categorie: "Autre", marque: "" };
  const sharedFields = { taille: "", couleur: "", matiere: "", marque: "" };
  for (const k of Object.keys(sharedFields)) {
    const vals = plateformes.filter((p) => edited[p]).map((p) => String(edited[p].platform_fields?.[k] ?? "").trim());
    if (vals.length && vals.every((v) => v && v === vals[0])) sharedFields[k] = vals[0];
  }
  const premier = (cle) => lot.jobs.map((j) => j.f?.[cle]).find((v) => v != null && v !== "") ?? null;
  const activeAiIcon = premier("ic");
  const activeAiObjet = premier("ob") ?? objetDuRayonChoisi(edited) ?? null;
  // La catégorie d'origine telle que l'app la lisait AU MOMENT de publier :
  // une annonce déjà là, pas disparue, et pas née de cette publication.
  let origineCat = null;
  const idsLot = new Set(lot.jobs.map((j) => String(j.i).slice(0, 8)));
  const lignes = (inv?.or ?? [])
    .filter((o) => o.c && (o.cr ?? 0) <= lot.t0 && (!o.dis || o.dis > lot.t0) && !(o.j && idsLot.has(o.j)))
    .sort((a, b) => (b.vu ?? 0) - (a.vu ?? 0))
    .slice(0, 8);
  for (const o of lignes) {
    const feuille = await feuilleDepuisOrigine(o.p, o.c);
    if (feuille) { origineCat = { platform: o.p, chemin: feuille.chemin, id: feuille.id ?? null, genre: genreDepuisOrigine(o.c), brut: String(o.c) }; break; }
  }
  const genreLot = lot.jobs.map((j) => j.f?.genre).find((g) => ["Femme", "Homme", "Fille", "Garçon", "Bébé"].includes(g)) ?? null;
  return {
    plateformes, selected: new Set(plateformes), edited, initialListing, sharedFields, sharedOverrides: {},
    activeAiIcon, activeAiObjet, origineCat, lang: "fr", genreLot,
    outils: {
      platformFieldsConfig: {}, isConditionKey: (k) => k === "etat" || k === "condition", defaultConditionFor: () => "Très bon état",
      GENERIC_ASPECTS_PF_KEY, normAspectVal,
      resolveArticleIcon: outilsEcran.resolveArticleIcon, resolveArticleIconDetail: outilsEcran.resolveArticleIconDetail,
      OPLA_ETAT_PAR_LIBELLE: outilsEcran.OPLA_ETAT_PAR_LIBELLE,
    },
  };
}

function supabaseFactice(ctx, repondre) {
  return {
    functions: {
      invoke: async (nom, { body } = {}) => {
        if (nom === "resolve-categorie") return repondre(body);
        if (nom === "generate-listing" && body?.resolve_genre) return { data: { genre: ctx.genreLot }, error: null };
        return { data: null, error: { message: `fonction non simulée : ${nom}` } };
      },
    },
  };
}

// ── LE RAYON « TEL QU'IL PARTIRAIT » ────────────────────────────────────────
const CLE_CHEMIN = { vinted: "categoryPath", leboncoin: "lbcCategoryPath", beebs: "beebsCategoryPath", ebay: "ebayCategoryPath", opla: "oplaCategoryPath" };
const CLE_ID = { ebay: "ebayCategoryId", opla: "oplaCategoryCode" };
function rayonFinal(p, pf, exclues) {
  return {
    chemin: estChemin(pf?.[CLE_CHEMIN[p]]) ? pf[CLE_CHEMIN[p]].join(" > ") : null,
    id: CLE_ID[p] && pf?.[CLE_ID[p]] != null ? String(pf[CLE_ID[p]]) : null,
    incertain: Boolean(pf?.categorie_incertaine || pf?.lbcCategorieIncertaine),
    ecarte: exclues.includes(p),
    question: Boolean(pf?.rayon_a_choisir),
  };
}
// Égalité PROFONDE des champs du job, horodatages exclus (new Date() à chaque
// passage : ils diffèrent d'un rejeu à l'autre sans rien dire du code).
function sansHorodatages(v) {
  if (Array.isArray(v)) return v.map(sansHorodatages);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x)) continue;
      o[k] = sansHorodatages(x);
    }
    return o;
  }
  return v;
}

function diffCles(a, b) {
  const cles = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...cles].filter((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]));
}

async function main() {
  fs.mkdirSync(DOSSIER, { recursive: true });
  preparerAvant();
  const fOutils = preparerOutils();
  const imp = (rel) => import(pathToFileURL(path.join(RACINE, rel)).href);
  const impAvant = (rel) => import(pathToFileURL(path.join(AVANT, rel)).href);
  const apres = {
    resolution: await imp("src/utils/resolutionPublication.js"),
    rayon: await imp("src/utils/rayonPublication.js"),
    regles: await imp("src/publication/moteur/regles.js"),
  };
  const avant = {
    resolution: await impAvant("src/utils/resolutionPublication.js"),
    rayon: await impAvant("src/utils/rayonPublication.js"),
    regles: await impAvant("src/publication/moteur/regles.js"),
  };
  const cat = await imp("src/utils/categorieParMot.js");
  const mods = {
    feuilleDepuisOrigine: cat.feuilleDepuisOrigine, genreDepuisOrigine: cat.genreDepuisOrigine,
    objetDuRayonChoisi: apres.rayon.objetDuRayonChoisi,
    outilsEcran: await import(pathToFileURL(fOutils).href),
    GENERIC_ASPECTS_PF_KEY: (await imp("src/publication/moteur/champsPartages.js")).GENERIC_ASPECTS_PF_KEY,
    normAspectVal: (await imp("src/publication/moteur/listes.js")).normAspectVal,
  };

  let reel = null;
  if (MODE === "a") {
    const secret = process.env.FS_CRON_SECRET;
    if (!secret) throw new Error("mode a : FS_CRON_SECRET absent");
    reel = async (corps) => {
      for (let essai = 0; essai < 3; essai++) {
        try {
          const r = await fetch(`${URL_FONCTIONS}/resolve-categorie`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-cron-secret": secret },
            body: JSON.stringify({ ...corps, rejeu: true }),
          });
          const data = await r.json().catch(() => null);
          if (r.ok && data && data.motif !== "ia_indisponible") return { data, error: null };
        } catch { /* nouvel essai */ }
        await new Promise((ok) => setTimeout(ok, 1500));
      }
      return { data: null, error: { message: "injoignable" } };
    };
  }

  const tous = lots();
  const cibles = tous.filter((l) => {
    if (SEULEMENT.length) return l.jobs.some((j) => SEULEMENT.some((s) => String(j.i).startsWith(s)));
    const refuse = l.jobs.some((j) => REFUS.has(j.f?.vv));
    return MODE === "a" ? refuse : true;
  });
  // Les appels à l'IA (réels en mode a) sont des appels RÉSEAU : ils servent
  // aussi de pause naturelle. Les console.log des modules sont coupés — le
  // rapport les remplace.
  const logOrig = console.log; const warnOrig = console.warn;
  const resultats = [];
  let n = 0;
  for (const lot of cibles) {
    n++;
    const sortie = { lot: lot.cle, t0: lot.t0, jobs: [] };
    try {
      const ctxA = await contexte(lot, mods);
      const ctxB = await contexte(lot, mods);
      const oA = oracle(lot, { reel: null });
      const oB = oracle(lot, { reel });
      console.log = () => {}; console.warn = () => {};
      const argsDe = (ctx, o) => ({
        plateformes: ctx.plateformes, selected: ctx.selected, edited: ctx.edited, initialListing: ctx.initialListing,
        sharedFields: ctx.sharedFields, sharedOverrides: ctx.sharedOverrides, activeAiIcon: ctx.activeAiIcon,
        activeAiObjet: ctx.activeAiObjet, origineCat: ctx.origineCat, lang: "fr",
        supabase: supabaseFactice(ctx, o.repondre), outils: ctx.outils,
      });
      const rA = await avant.resolution.resoudrePublication(argsDe(ctxA, oA));
      const rB = await apres.resolution.resoudrePublication(argsDe(ctxB, oB));
      console.log = logOrig; console.warn = warnOrig;
      const finA = rA.refus ? {} : avant.rayon.champsAvecRayonsChoisis(rA.pfParPlateforme, ctxA.edited, ctxA.plateformes);
      const finB = rB.refus ? {} : apres.rayon.champsAvecRayonsChoisis(rB.pfParPlateforme, ctxB.edited, ctxB.plateformes);
      const lignes = (fin) => ctxA.plateformes.map((p) => ({ platform: p, platform_fields: fin[p] ?? {} }));
      const exA = rA.refus ? ctxA.plateformes : avant.regles.plateformesSansChemin(lignes(finA));
      const exB = rB.refus ? ctxB.plateformes : apres.regles.plateformesSansChemin(lignes(finB));
      for (const j of lot.jobs) {
        const a = rayonFinal(j.p, finA[j.p], exA);
        const b = rayonFinal(j.p, finB[j.p], exB);
        const f = j.f ?? {};
        const pfB = finB[j.p] ?? {};
        sortie.jobs.push({
          id: j.i, platform: j.p, status: j.s, titre: j.ti, verdict: f.vv ?? null, source: f.src ?? null,
          perimetre: REFUS.has(f.vv),
          base: { chemin: estChemin(f.cp) ? f.cp.join(" > ") : null, id: f.cid != null ? String(f.cid) : null, incertain: Boolean(f.inc || f.linc) },
          avant: a, apres: b,
          identique_rayon: JSON.stringify(a) === JSON.stringify(b),
          identique_champs: JSON.stringify(sansHorodatages(finA[j.p] ?? {})) === JSON.stringify(sansHorodatages(finB[j.p] ?? {})),
          diff_champs: diffCles(sansHorodatages(finA[j.p] ?? {}), sansHorodatages(finB[j.p] ?? {})),
          // Le verdict de la vérification AVANT que le choix du vendeur ne
          // soit reposé (appliquerRayonChoisi l'efface) : c'est lui qui dit si
          // le dépôt entre dans le périmètre de la nouvelle règle.
          verdict_rejoue_avant: rA.pfParPlateforme?.[j.p]?.categorie_verification?.verdict ?? null,
          verdict_rejoue_apres: rB.pfParPlateforme?.[j.p]?.categorie_verification?.verdict ?? null,
          choix_vendeur: Boolean(ctxA.edited[j.p]?.rayon_choisi),
          apres_refus: pfB.categorie_verification?.verdict_avant != null ? {
            verdict: pfB.categorie_verification.verdict,
            verdict_avant: pfB.categorie_verification.verdict_avant,
            refuses: (pfB.categorie_verification.chemins_refuses ?? []).map((c) => c.join(" > ")),
            paliers: pfB.categorie_verification.paliers_apres_refus ?? [],
            appels: pfB.categorie_verification.appels_apres_refus ?? 0,
            confirmation: pfB.categorie_verification.confirmation_ia ?? null,
            question: pfB.rayon_a_choisir ? {
              motif: pfB.rayon_a_choisir.motif,
              propose: estChemin(pfB.rayon_a_choisir.chemin_propose) ? pfB.rayon_a_choisir.chemin_propose.join(" > ") : null,
              candidats: (pfB.rayon_a_choisir.candidats ?? []).map((c) => c.chemin.join(" > ")),
            } : null,
          } : null,
        });
      }
      sortie.appels_plus_proche = oB.journal.plusProche.length;
      sortie.plus_proche_en_mode_b = MODE === "b" ? oB.journal.plusProche : undefined;
    } catch (e) {
      console.log = logOrig; console.warn = warnOrig;
      sortie.erreur = String(e?.stack ?? e);
    }
    resultats.push(sortie);
    if (n % 25 === 0) process.stderr.write(`  … ${n}/${cibles.length} lots\n`);
  }
  const fichier = path.join(DOSSIER, `resultats-${MODE}.json`);
  fs.writeFileSync(fichier, JSON.stringify(resultats, null, 1));
  const jobs = resultats.flatMap((r) => r.jobs ?? []);
  // Le périmètre se juge sur le verdict REJOUÉ par le code d'aujourd'hui (celui
  // d'avant le lot) : c'est lui, et lui seul, qui fait entrer un dépôt dans la
  // nouvelle étape. Un dépôt hors périmètre DOIT sortir identique.
  const refuseRejoue = (j) => REFUS.has(j.verdict_rejoue_avant);
  const hors = jobs.filter((j) => !refuseRejoue(j));
  const dans = jobs.filter(refuseRejoue);
  console.log(`\n${MODE === "a" ? "REJEU DES REFUSÉS" : "NON-RÉGRESSION"} — ${resultats.length} lot(s), ${jobs.length} dépôt(s), ${resultats.filter((r) => r.erreur).length} erreur(s)`);
  console.log(`  hors périmètre (vérification rejouée sans refus) : ${hors.length}`);
  console.log(`    rayon identique avant/après : ${hors.filter((j) => j.identique_rayon).length}/${hors.length}`);
  console.log(`    champs du job identiques    : ${hors.filter((j) => j.identique_champs).length}/${hors.length}`);
  console.log(`    appels « plus proche » partis : ${resultats.reduce((s, r) => s + (r.jobs?.some((j) => !refuseRejoue(j)) && !r.jobs?.some(refuseRejoue) ? (r.appels_plus_proche ?? 0) : 0), 0)}`);
  console.log(`  dans le périmètre (vérification rejouée = refus) : ${dans.length} (dont ${dans.filter((j) => j.perimetre).length} des 33 d'origine)`);
  const encoreRefuse = dans.filter((j) => {
    const refuses = new Set((j.apres_refus?.refuses ?? []));
    return j.apres.chemin && refuses.has(j.apres.chemin);
  });
  console.log(`    rayon refusé encore posé après : ${encoreRefuse.length}`);
  console.log(`  résultats : ${fichier}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

// ── LES DEUX REQUÊTES (serveur MCP Supabase, execute_sql) ────────────────────
// jobs.raw.txt :
//   select jsonb_agg(jsonb_build_object('i', id, 'u', left(user_id::text,8), 'a', inventaire_id,
//     'p', platform, 's', status, 't', extract(epoch from created_at)::bigint, 'ti', title,
//     'f', jsonb_strip_nulls(jsonb_build_object('genre', pf->'genre', 'univers', pf->'univers',
//       'taille', pf->'taille', 'etat', coalesce(pf->'opla_etat_libelle', pf->'etat'), 'marque', pf->'marque',
//       'couleur', pf->'couleur', 'matiere', pf->'matiere', 'categorie', pf->'categorie',
//       'ic', pf->'categorie_icone_ia', 'ob', pf->'categorie_objet_ia', 'src', pf->'categorie_source',
//       'ch', pf->'categorie_choisie', 'vv', pf->'categorie_verification'->'verdict',
//       'vi', pf->'categorie_verification'->'chemin_icone', 'vp', pf->'categorie_verification'->'chemin_propose',
//       'pl', …categorie_plausibilite (source_famille, chemin_ecarte, famille_objet)…,
//       'cp', coalesce(categoryPath, lbcCategoryPath, beebsCategoryPath, ebayCategoryPath, oplaCategoryPath),
//       'cid', coalesce(ebayCategoryId, oplaCategoryCode), 'inc', categorie_incertaine,
//       'linc', lbcCategorieIncertaine, 'ach', categorie_a_choisir))) order by created_at, id) jobs
//   from cross_post_jobs where action='publish' and created_at >= '2026-09-18'
//     and platform_fields ? 'categorie_source';
// inv.raw.txt : une ligne par article de ces jobs — titre, description, type,
//   marque, vinted_catalog_id, origine, attributs (taille, pointure,
//   classement_age, attributs_visibles.pointure), et ses annonces_plateforme
//   (plateforme, capture->>'categorie', created_at, vu_le, disparu_le,
//   capture_le, job_id).
