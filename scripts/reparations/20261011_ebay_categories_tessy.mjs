// ═══════════════════════════════════════════════════════════════════════════
// eBay — LES 3 ANNONCES DE TESSY RANGÉES HORS DE LA MODE (11/10/2026, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Publiées par la voie API AVANT le correctif 2.9.78 (e4de241, règle « un
// vêtement de mode ne part pas en sport sans que le texte le dise ») :
//   800745317785 Sac MNG camel                 → Golf › Sacs
//   800760155217 Jordan Spizike Low bébé       → Collections › Pins › Sports › Basket
//   800760163791 Adidas Tensaur Sport 2.0 CF I → Collections › Pins › Sports › Basket
// Objectif : les ranger dans la bonne catégorie SANS supprimer ni republier
// (même numéro, vues et favoris gardés). Méthode de Nico, à la lettre :
//   1. LECTURE d'abord (en ligne ? invendue ?) — rien d'écrit ;
//   2. sauvegarde de l'offre complète (getOffer + inventory item) dans
//      _backup_1110_ebay_categories_tessy AVANT toute écriture ;
//   3. catégorie cible = la règle ACTUELLE (resoudrePublication + règle
//      brancheSpecialiseeEbay, puis la résolution serveur de la voie API),
//      comme pour une nouvelle publication — jamais choisie à la main ;
//   4. updateOffer avec l'offre COMPLÈTE relue : seuls categoryId et les
//      champs exigés par la nouvelle catégorie changent ;
//   5. champs exigés : liste fermée → valeur de la liste ; texte libre → mot
//      LU dans le titre ou la description ; sinon l'annonce est laissée ;
//   6. refus d'eBay : rien d'autre (un essai, aucune suppression) ;
//   7. relecture chez eBay et comparaison avec la sauvegarde.
// Le travail eBay est fait par ebay-api-worker (action « reviser_annonce »,
// mode « rayon_regle », gardée par x-cron-secret) : jetons et appels du code
// existant. Ce script prépare la catégorie (étape 3) et pilote les étapes.
//
//   node --import ./scripts/loader-ext.mjs scripts/reparations/20261011_ebay_categories_tessy.mjs resoudre <dossier>
//   FS_CRON_SECRET=… node … lire     <dossier>   (étapes 1-3, à blanc, rien d'écrit chez eBay)
//   FS_CRON_SECRET=… node … ecrire   <dossier> <listing_id>   (une annonce, sur feu vert)
//   FS_CRON_SECRET=… node … inverse  <dossier> <listing_id>   (remet l'offre et l'article sauvegardés)
// La sauvegarde : 20261011_ebay_categories_tessy_sauvegarde.sql (écrit par « lire »).
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [, , ETAPE, DOSSIER_BRUT, LISTING] = process.argv;
const DOSSIER = path.resolve(DOSSIER_BRUT ?? ".");
const URL_FONCTIONS = "https://tojihnuawsoohlolangc.supabase.co/functions/v1";
const ANNONCES = ["800745317785", "800760155217", "800760163791"];
const UTILISATRICE = "2f8b09d2-8832-45fc-ba26-ab3dd6e9b2fa";
const TABLE_SAUVEGARDE = "_backup_1110_ebay_categories_tessy";

function sql(requete) {
  const f = path.join(DOSSIER, "requete.sql");
  fs.writeFileSync(f, requete);
  const brut = execFileSync("npx", ["supabase", "db", "query", "--linked", "--output-format", "json", "-f", f],
    { cwd: RACINE, encoding: "utf8", maxBuffer: 64 << 20, shell: process.platform === "win32" });
  return JSON.parse(brut.slice(brut.indexOf("{"))).rows;
}

// ── Les données : le job eBay, la fiche, ses annonces ────────────────────────
function lireDonnees() {
  const ids = ANNONCES.map((a) => `'${a}'`).join(",");
  return sql(`
    select j.id as job_id, j.user_id, j.inventaire_id, j.title, j.description, j.price, j.status, j.voie,
           j.platform_listing_id as listing_id, j.platform_fields as pf,
           to_jsonb(i) - 'photos' as inv,
           (select coalesce(jsonb_agg(jsonb_build_object('platform', a.platform, 'capture', a.capture,
                     'donnees_index', a.donnees_index, 'vu_le', a.vu_le, 'listing_id', a.listing_id)
                     order by a.vu_le desc nulls last), '[]'::jsonb)
              from public.annonces_plateforme a where a.inventaire_id = j.inventaire_id and a.disparu_le is null) as annonces
      from public.cross_post_jobs j join public.inventaire i on i.id = j.inventaire_id
     where j.platform = 'ebay' and j.user_id = '${UTILISATRICE}' and j.platform_listing_id in (${ids})
     order by j.platform_listing_id;`);
}

// ── Les outils de l'écran (ListingPreviewScreen.jsx), découpés tels quels ───
// (même découpe que scripts/rejeu-rayon-refuse.mjs : l'icône doit être celle
// de l'app, au caractère près).
function preparerOutils() {
  const src = fs.readFileSync(path.join(RACINE, "src/components/ListingPreviewScreen.jsx"), "utf8").replace(/\r\n/g, "\n");
  const tranche = (debut) => {
    const i = src.indexOf(debut);
    if (i < 0) throw new Error(`introuvable dans ListingPreviewScreen.jsx : ${debut}`);
    return src.slice(i, src.indexOf("\n}\n", i) + 3);
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

// ── ÉTAPE 3 : la catégorie que donne la règle ACTUELLE ───────────────────────
// La publication telle que l'app la ferait aujourd'hui depuis le Stock, sur
// eBay seul, par la voie API. Entrées = ce que l'écran lit : la fiche
// (titre, description, type, marque, attributs, catalogue Vinted relevé),
// les champs du job eBay (genre, taille, état, marque, couleur, matière),
// l'icône et l'objet de l'IA gardés sur le job, la catégorie d'origine des
// AUTRES annonces en ligne de l'article. L'annonce eBay à corriger n'entre
// pas dans l'origine : sa catégorie est justement l'erreur.
// Les appels à l'IA partent VRAIMENT (resolve-categorie, rejeu : rien n'est
// écrit dans categorie_journal).
async function resoudre() {
  fs.mkdirSync(DOSSIER, { recursive: true });
  const secret = process.env.FS_CRON_SECRET;
  if (!secret) throw new Error("FS_CRON_SECRET absent (les appels à resolve-categorie sont réels)");
  const lignes = lireDonnees();
  const imp = (rel) => import(pathToFileURL(path.join(RACINE, rel)).href);
  const resolution = await imp("src/utils/resolutionPublication.js");
  const rayon = await imp("src/utils/rayonPublication.js");
  const cat = await imp("src/utils/categorieParMot.js");
  const outilsEcran = await import(pathToFileURL(preparerOutils()).href);
  const { GENERIC_ASPECTS_PF_KEY } = await imp("src/publication/moteur/champsPartages.js");
  const { normAspectVal } = await imp("src/publication/moteur/listes.js");
  const appelsIA = [];
  const supabase = {
    functions: {
      invoke: async (nom, { body } = {}) => {
        if (nom !== "resolve-categorie") return { data: null, error: { message: `fonction non appelée ici : ${nom}` } };
        for (let essai = 0; essai < 3; essai++) {
          try {
            const r = await fetch(`${URL_FONCTIONS}/resolve-categorie`, {
              method: "POST",
              headers: { "content-type": "application/json", "x-cron-secret": secret },
              body: JSON.stringify({ ...body, rejeu: true }),
            });
            const data = await r.json().catch(() => null);
            if (r.ok && data && data.motif !== "ia_indisponible") { appelsIA.push({ demande: body, reponse: data }); return { data, error: null }; }
          } catch { /* nouvel essai */ }
          await new Promise((ok) => setTimeout(ok, 1500));
        }
        appelsIA.push({ demande: body, reponse: null });
        return { data: null, error: { message: "injoignable" } };
      },
    },
    from: () => { throw new Error("aucune lecture de base attendue (eBay seul)"); },
  };
  const sortie = [];
  for (const l of lignes) {
    const pfJob = l.pf ?? {};
    const inv = l.inv ?? {};
    const pf = {};
    for (const k of ["genre", "taille", "etat", "marque", "couleur", "matiere"]) if (pfJob[k] != null && pfJob[k] !== "") pf[k] = pfJob[k];
    const edited = { ebay: { title: l.title ?? "", description: l.description ?? "", platform_fields: pf } };
    // Le catalogue Vinted : la colonne, sinon celui que le détail Vinted a
    // relevé (attributs.categorie_vinted) — c'est ce que l'écran écrit sur la
    // fiche au clic (texteDuVendeur) avant de résoudre.
    const catVinted = inv.vinted_catalog_id ?? inv.attributs?.categorie_vinted?.v ?? null;
    const initialListing = {
      titre: inv.titre ?? null, description: inv.description ?? null, categorie: inv.type || "Autre",
      vinted_catalog_id: catVinted, marque: inv.marque || "", attributs: inv.attributs ?? null, origine: inv.origine ?? null,
    };
    let origineCat = null;
    for (const a of l.annonces ?? []) {
      if (a.platform === "ebay" && String(a.listing_id) === String(l.listing_id)) continue;
      const brut = a?.capture?.categorie ?? a?.donnees_index?.categorie;
      if (!brut || !a.platform) continue;
      const feuille = await cat.feuilleDepuisOrigine(a.platform, brut);
      if (feuille) { origineCat = { platform: a.platform, chemin: feuille.chemin, id: feuille.id ?? null, genre: cat.genreDepuisOrigine(brut), brut: String(brut) }; break; }
    }
    const debutAppels = appelsIA.length;
    const logOrig = console.log; const warnOrig = console.warn;
    const journal = [];
    console.log = (...a) => journal.push(a.join(" ")); console.warn = (...a) => journal.push(a.join(" "));
    let r;
    try {
      r = await resolution.resoudrePublication({
        plateformes: ["ebay"], selected: new Set(["ebay"]), edited, initialListing,
        sharedFields: { taille: pf.taille ?? "", couleur: pf.couleur ?? "", matiere: pf.matiere ?? "", marque: pf.marque ?? "" },
        sharedOverrides: {}, activeAiIcon: pfJob.categorie_icone_ia ?? pfJob.categorie_icone ?? null,
        activeAiObjet: pfJob.categorie_objet_ia ?? null, origineCat, lang: "fr", supabase,
        outils: {
          platformFieldsConfig: {}, isConditionKey: (k) => k === "etat" || k === "condition", defaultConditionFor: () => "Très bon état",
          GENERIC_ASPECTS_PF_KEY, normAspectVal,
          resolveArticleIcon: outilsEcran.resolveArticleIcon, resolveArticleIconDetail: outilsEcran.resolveArticleIconDetail,
          OPLA_ETAT_PAR_LIBELLE: outilsEcran.OPLA_ETAT_PAR_LIBELLE,
        },
        ebayVoieApi: true,
      });
    } finally { console.log = logOrig; console.warn = warnOrig; }
    const fin = r.refus ? {} : rayon.champsAvecRayonsChoisis(r.pfParPlateforme, edited, ["ebay"]);
    const e = fin.ebay ?? {};
    const garder = ["ebayCategoryId", "ebayCategoryPath", "categorie_source", "categorie_incertaine", "categorie_icone",
      "categorie_par_mot", "categorie_verification", "categorie_plausibilite", "categorie_branche_specialisee", "rayon_a_choisir", "rayon_a_reessayer"];
    sortie.push({
      listing_id: l.listing_id, job_id: l.job_id, titre: l.title,
      avant: { id: pfJob.ebayCategoryId ?? null, chemin: pfJob.ebayCategoryPath ?? null },
      entrees: { catalogue_vinted: catVinted, origine: origineCat, icone: pfJob.categorie_icone_ia ?? pfJob.categorie_icone ?? null, objet: pfJob.categorie_objet_ia ?? null, genre: pf.genre ?? null },
      refus: r.refus ?? null,
      pf_resolution: Object.fromEntries(garder.filter((k) => e[k] !== undefined).map((k) => [k, e[k]])),
      mot: r.motCategorie ?? null, mot_source: r.motCategorieSource ?? null,
      appels_ia: appelsIA.slice(debutAppels),
      journal: journal.filter((x) => /\[publish\]|ebay/i.test(x)).slice(0, 40),
    });
  }
  const fichier = path.join(DOSSIER, "resolution.json");
  fs.writeFileSync(fichier, JSON.stringify(sortie, null, 1));
  for (const s of sortie) {
    console.log(`\n${s.listing_id} « ${s.titre} »`);
    console.log(`  avant : ${s.avant.id} ${(s.avant.chemin ?? []).join(" > ")}`);
    console.log(`  règle : ${s.pf_resolution.ebayCategoryId ?? "∅"} ${(s.pf_resolution.ebayCategoryPath ?? []).join(" > ") || "(aucun chemin)"}` +
      `${s.pf_resolution.categorie_incertaine ? " — INCERTAINE (le serveur tranche avec les suggestions d'eBay)" : ""}` +
      `${s.pf_resolution.rayon_a_choisir ? " — QUESTION" : ""} (source ${s.pf_resolution.categorie_source ?? "?"}, mot « ${s.mot ?? ""} »)`);
    if (s.pf_resolution.categorie_branche_specialisee) console.log(`  veto : ${s.pf_resolution.categorie_branche_specialisee.motif}`);
  }
  console.log(`\nrésultats : ${fichier}`);
}

// ── Appel du worker (action gardée, jamais par le cron) ──────────────────────
async function worker(corps) {
  const secret = process.env.FS_CRON_SECRET;
  if (!secret) throw new Error("FS_CRON_SECRET absent");
  const r = await fetch(`${URL_FONCTIONS}/ebay-api-worker`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cron-secret": secret },
    body: JSON.stringify(corps),
  });
  const texte = await r.text();
  try { return { http: r.status, ...JSON.parse(texte) }; } catch { return { http: r.status, texte: texte.slice(0, 500) }; }
}

const lit = (v) => (v == null ? "null" : `'${String(typeof v === "string" ? v : JSON.stringify(v)).replace(/'/g, "''")}'`);

// ── ÉTAPES 1, 2, 3 À BLANC ───────────────────────────────────────────────────
// Le worker lit l'annonce (Browse), l'offre et l'article (jeton vendeur), passe
// la catégorie de la règle par la résolution serveur, lit les aspects et les
// états du nouveau rayon et dit ce qu'il écrirait — sans rien écrire.
// La sauvegarde (offre + article + job) est écrite en base ICI, avant toute
// écriture chez eBay.
async function lire() {
  const res = JSON.parse(fs.readFileSync(path.join(DOSSIER, "resolution.json"), "utf8"));
  const sauvegardes = [];
  for (const s of res) {
    const r = await worker({ action: "reviser_annonce", job_id: s.job_id, rayon_regle: true, rayon_actuel: s.avant.id,
      pf_resolution: s.pf_resolution, dry_run: true });
    fs.writeFileSync(path.join(DOSSIER, `lecture-${s.listing_id}.json`), JSON.stringify(r, null, 1));
    console.log(`\n${s.listing_id} « ${s.titre} » → ${r.ok ? "PRÊTE" : "LAISSÉE"} (${r.motif ?? "à blanc"})`);
    if (r.etat) console.log(`  eBay : ${JSON.stringify(r.etat)}`);
    if (r.categorie) console.log(`  catégorie : ${r.categorie.de} → ${r.categorie.vers} ${(r.categorie.chemin ?? []).join(" > ")} (${r.categorie.source})`);
    if (r.aspects) console.log(`  aspects : ${JSON.stringify(r.aspects)}`);
    if (r.condition) console.log(`  état : ${JSON.stringify(r.condition)}`);
    if (r.sauvegarde) sauvegardes.push({ s, r });
  }
  if (!sauvegardes.length) return;
  const lignes = sauvegardes.map(({ s, r }) => `(${lit(s.listing_id)}, ${lit(s.job_id)}, ${lit(r.sauvegarde.offer_id)}, ${lit(r.sauvegarde.sku)}, ` +
    `${lit(r.sauvegarde.offre)}::jsonb, ${lit(r.sauvegarde.article)}::jsonb, ${lit(r.sauvegarde.browse)}::jsonb, ${lit(r.sauvegarde.empreinte)})`);
  const requete = `-- Sauvegarde AVANT toute écriture chez eBay (11/10, 3 annonces de Tessy) — offre et article
-- tels que relus par ebay-api-worker (getOffer, getInventoryItem), annonce publique (Browse), job eBay.
create table if not exists public.${TABLE_SAUVEGARDE} (
  listing_id text primary key, job_id uuid not null, offer_id text not null, sku text not null,
  offre jsonb not null, article jsonb not null, browse jsonb, empreinte text not null,
  job_platform_fields jsonb, sauvegarde_le timestamptz not null default now());
revoke all on public.${TABLE_SAUVEGARDE} from anon, authenticated;
alter table public.${TABLE_SAUVEGARDE} enable row level security;
insert into public.${TABLE_SAUVEGARDE} (listing_id, job_id, offer_id, sku, offre, article, browse, empreinte)
values
${lignes.join(",\n")}
on conflict (listing_id) do nothing;
update public.${TABLE_SAUVEGARDE} b set job_platform_fields = j.platform_fields
  from public.cross_post_jobs j where j.id = b.job_id and b.job_platform_fields is null;
select listing_id, offer_id, sku, empreinte, job_platform_fields is not null as job_sauve from public.${TABLE_SAUVEGARDE} order by 1;
`;
  const f = path.join(RACINE, "scripts/reparations/20261011_ebay_categories_tessy_sauvegarde.sql");
  fs.writeFileSync(f, requete);
  console.log(`\nsauvegarde : ${f}`);
}

// ── ÉTAPES 4 à 7 : UNE annonce, sur feu vert ─────────────────────────────────
async function ecrire() {
  if (!/^\d{9,15}$/.test(LISTING ?? "")) throw new Error("listing_id attendu");
  const res = JSON.parse(fs.readFileSync(path.join(DOSSIER, "resolution.json"), "utf8"));
  const s = res.find((x) => x.listing_id === LISTING);
  if (!s) throw new Error("annonce hors périmètre");
  const lecture = JSON.parse(fs.readFileSync(path.join(DOSSIER, `lecture-${LISTING}.json`), "utf8"));
  if (!lecture.ok || !lecture.sauvegarde?.empreinte) throw new Error("pas de lecture à blanc prête pour cette annonce");
  const r = await worker({ action: "reviser_annonce", job_id: s.job_id, rayon_regle: true, rayon_actuel: s.avant.id,
    pf_resolution: s.pf_resolution, empreinte_attendue: lecture.sauvegarde.empreinte, categorie_attendue: lecture.categorie?.vers ?? null,
    table_sauvegarde: TABLE_SAUVEGARDE });
  fs.writeFileSync(path.join(DOSSIER, `ecriture-${LISTING}.json`), JSON.stringify(r, null, 1));
  console.log(JSON.stringify(r, null, 1));
}

async function inverse() {
  if (!/^\d{9,15}$/.test(LISTING ?? "")) throw new Error("listing_id attendu");
  const r = await worker({ action: "reviser_annonce", restaurer: true, listing_id: LISTING, table_sauvegarde: TABLE_SAUVEGARDE });
  console.log(JSON.stringify(r, null, 1));
}

const etapes = { resoudre, lire, ecrire, inverse };
if (!etapes[ETAPE]) { console.error("étape : resoudre | lire | ecrire | inverse"); process.exit(2); }
etapes[ETAPE]().catch((e) => { console.error(e); process.exit(1); });
