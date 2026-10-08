// ═══════════════════════════════════════════════════════════════════════════
// GÉNÉRATEUR DU RÉFÉRENTIEL DEPOP — arbre, attributs, tailles (2026-10-08)
//   node scripts/gen-depop-referentiel.mjs            (écrit)
//   node scripts/gen-depop-referentiel.mjs --verifier (n'écrit rien, compare)
//
// SOURCE UNIQUE : docs/plateformes/depop/brut/*.json — les réponses des
// endpoints PUBLICS que le formulaire « Sell » de depop.com appelle lui-même,
// relevées telles quelles dans la page le 08/10 (comment, et ce qui reste à
// vérifier : docs/plateformes/depop/CARTOGRAPHIE.md). Rien n'est écrit à la
// main : un nœud qui n'a pas été relevé n'existe pas. Même garantie que
// gen-opla-catalogue.mjs et gen-arbres-feuilles.mjs.
//
// CE QU'IL PRODUIT (docs/plateformes/depop/) :
//   arbre.json     — tous les nœuds (département > groupe > type de produit),
//                    id, libellés, parent, niveau, feuille, statut, et pour
//                    chaque feuille : grille de tailles, attributs, mesures ;
//   attributs.json — état, couleur, source, âge, style, genre enfant, les 57
//                    attributs propres aux types, mesures, et la marque
//                    (compte, valeur « sans marque », marques populaires) ;
//   tailles.json   — les 52 grilles (4 régions × 13), chaque taille avec son
//                    id, son libellé et son id composite.
//
// ⛔ CE QUE DEPOP APPELLE UNE FEUILLE. Le formulaire propose, pour chaque
//    groupe actif, CHAQUE type de produit actif sous CHAQUE département du
//    groupe (322 feuilles, comptées une à une dans le DOM). L'API, elle, ne
//    rattache officiellement un type qu'à certains départements (281) — ce
//    sont les seules feuilles qui ont une grille de tailles. Les 41 autres
//    (ex. Homme > Hauts > Blouses) sont proposées SANS champ Taille (vu dans
//    l'interface le 08/10). Les deux comptes sont écrits, jamais mélangés.
// ⛔ PAS DE RÉÉCRITURE DES LIBELLÉS : les libellés français de Depop sont
//    parfois faux ou en double (« shirts » et « tshirts » tous deux
//    « T-shirts »). On les recopie tels quels et on SIGNALE les doublons entre
//    frères ; le rattachement au moteur se fait par l'id, jamais par le texte.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = "docs/plateformes/depop";
const VERIFIER = process.argv.includes("--verifier");
// Fin de ligne neutralisée : core.autocrlf peut écrire du CRLF au checkout.
const texte = (rel) => fs.readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const json = (rel) => JSON.parse(texte(rel));
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// ── Empreintes de la SOURCE (contenu, fins de ligne en LF) ──────────────────
// Reproductible : node -e "…sha256(contenu LF)…" ; si l'une bouge, la source a
// été touchée : le générateur REFUSE de tourner. Un nouveau relevé = nouvelles
// empreintes, posées ici en connaissance de cause.
const EMPREINTES = {
  [`${DOSSIER}/brut/attributes.json`]: "e3d7d66bb7f05666",
  [`${DOSSIER}/brut/attributes-groups.json`]: "72b169c2f3e58785",
  [`${DOSSIER}/brut/attributes-categories-size-mapping.json`]: "b69452d9c98c963a",
  [`${DOSSIER}/brut/search-filters-size.json`]: "fb102b35aabbcda8",
  [`${DOSSIER}/brut/search-filters-category-en-US.json`]: "c049a5da885a5796",
  [`${DOSSIER}/brut/search-filters-category-en-GB.json`]: "aea023203893d74e",
  [`${DOSSIER}/brut/selecteur-categorie-ui.json`]: "e9a23be5624e4b84",
  [`${DOSSIER}/brut/releve.json`]: "5ce27f88ad0000aa",
};

let stop = false;
for (const [f, attendue] of Object.entries(EMPREINTES)) {
  const vue = sha(texte(f));
  if (vue !== attendue) {
    console.error(`✗ ${f} : empreinte ${vue}, attendue ${attendue} — la source a changé. ARRÊT.`);
    stop = true;
  }
}
if (stop) {
  console.error("\nLe référentiel ne se régénère PAS sur une source modifiée sans décision.");
  process.exit(1);
}

const A = json(`${DOSSIER}/brut/attributes.json`);
const G = json(`${DOSSIER}/brut/attributes-groups.json`);
const M = json(`${DOSSIER}/brut/attributes-categories-size-mapping.json`);
const FS = json(`${DOSSIER}/brut/search-filters-size.json`);
const CUS = json(`${DOSSIER}/brut/search-filters-category-en-US.json`);
const CGB = json(`${DOSSIER}/brut/search-filters-category-en-GB.json`);
const UI = json(`${DOSSIER}/brut/selecteur-categorie-ui.json`);
const RELEVE = json(`${DOSSIER}/brut/releve.json`);

const erreurs = [];
const exiger = (cond, msg) => { if (!cond) erreurs.push(msg); };
const fr = (o) => o?.name_i18n?.fr ?? null;
const en = (o) => o?.name_i18n?.["en-US"] ?? o?.name_i18n?.en ?? null;
const sources = Object.fromEntries(Object.entries(EMPREINTES).map(([f, e]) => [f.replace(`${DOSSIER}/`, ""), e]));
const entete = {
  _genere: "node scripts/gen-depop-referentiel.mjs — FICHIER GÉNÉRÉ, ne pas éditer à la main",
  _sources: sources,
  releve_le: RELEVE.releve_le,
};

// ── 1. Départements ─────────────────────────────────────────────────────────
const DEPARTEMENTS = A.department.map((d) => ({
  id: d.id,
  libelle_fr: d.name_i18n?.fr ?? null,
  libelle_en: d.name_i18n?.["en-US"] ?? null,
  statut: d.status,
  // Genre : posé d'office (Homme/Femme), à choisir (Enfants : garçon, fille,
  // unisexe), absent (Tout le reste). Relevé tel quel dans `department`.
  genre: d.gender
    ? { defaut: d.gender.default, affiche: d.gender.is_displayed, obligatoire: d.gender.is_mandatory, options: d.gender.options }
    : null,
}));
const depParId = new Map(DEPARTEMENTS.map((d) => [d.id, d]));
exiger(DEPARTEMENTS.length === 4, `4 départements attendus, ${DEPARTEMENTS.length} lus`);

// ── 2. Grilles de tailles (size_sets) + ids composites (filtre de recherche) ─
// Le filtre nomme le SYSTÈME (EUR, UK, US, AU) ; size_sets nomme la RÉGION
// (IT, GB, US, AU). On relie les deux par l'id de grille, et on vérifie que
// les tailles sont les mêmes des deux côtés.
const compositeParGrille = new Map(); // id grille -> { systeme, tailles: Map(id -> composite) }
for (const dep of FS) {
  for (const famille of dep.children ?? []) {
    for (const grille of famille.children ?? []) {
      const m = new Map();
      for (const t of grille.children ?? []) m.set(t.id, { composite: t.composite_id, nom: t.name });
      compositeParGrille.set(grille.id, { systeme: grille.name, famille: famille.id, departement: dep.id, tailles: m });
    }
  }
}
const GRILLES = M.size_sets.map((s) => {
  const c = compositeParGrille.get(s.id);
  exiger(c, `grille ${s.id} absente du filtre de tailles`);
  const tailles = s.sizes.map((t) => {
    const cc = c?.tailles.get(t.id);
    exiger(cc, `taille ${s.id}.${t.id} absente du filtre`);
    exiger(!cc || cc.nom === (t.name_i18n?.en ?? t.name_i18n?.fr), `taille ${s.id}.${t.id} : libellé différent entre les deux endpoints`);
    return { id: t.id, libelle: t.name_i18n?.en ?? null, libelle_fr: t.name_i18n?.fr ?? null, position: t.position, composite_id: cc?.composite ?? null };
  });
  return { id: s.id, nom: s.name, region: s.region, systeme: c?.systeme ?? null, departement: c?.departement ?? null, libelle: s.label_i18n?.en ?? null, nombre: tailles.length, tailles };
});
const grilleParId = new Map(GRILLES.map((g) => [g.id, g]));
const REGIONS = {};
for (const g of GRILLES) {
  REGIONS[g.region] ??= g.systeme;
  exiger(REGIONS[g.region] === g.systeme, `région ${g.region} : deux systèmes (${REGIONS[g.region]} / ${g.systeme})`);
}

// ── 3. Correspondance (département, groupe, type) → grilles par région ─────
const correspondance = new Map();
for (const e of M.category_size_mapping) {
  const cle = `${e.department}/${e.group}/${e.product_type}`;
  exiger(!correspondance.has(cle), `correspondance en double : ${cle}`);
  for (const id of Object.values(e.size_set_by_region ?? {})) exiger(grilleParId.has(id), `${cle} : grille ${id} inconnue`);
  correspondance.set(cle, e);
}

// ── 4. L'arbre ──────────────────────────────────────────────────────────────
const labelGB = new Map(); // "groupe/type" -> libellé en-GB du filtre ; "groupe" -> idem
for (const dep of CGB.departments) for (const g of dep.children) labelGB.set(g.id, g.name);
for (const [gid, liste] of Object.entries(CGB.groups)) for (const p of liste) labelGB.set(`${gid}/${p.id}`, p.name);

const NOEUDS = [];
const HORS_ARBRE = [];
for (const d of DEPARTEMENTS) {
  NOEUDS.push({ id: d.id, niveau: 1, nature: "departement", parent: null, feuille: false, statut: d.statut, proposee_par_formulaire: d.statut === "active", libelle_fr: d.libelle_fr, libelle_en: d.libelle_en });
}
const BEAUTE_NEUF_SEUL = new Set(["bath-and-body", "fragrance", "hair-products", "makeup", "nails", "skincare"]); // INVALID_USED_CONDITION_PRODUCT_TYPES (bundle)
for (const g of Object.values(G)) {
  if (!g.department?.length) {
    HORS_ARBRE.push({ id: g.id, nature: "groupe", statut: g.status, libelle_fr: fr(g), libelle_en: en(g), raison: "aucun département : groupe absent du formulaire" });
    continue;
  }
  for (const depId of g.department) {
    exiger(depParId.has(depId), `groupe ${g.id} : département ${depId} inconnu`);
    const idG = `${depId}/${g.id}`;
    NOEUDS.push({ id: idG, niveau: 2, nature: "groupe", parent: depId, groupe: g.id, feuille: false, statut: g.status, proposee_par_formulaire: g.status === "active", libelle_fr: fr(g), libelle_en: en(g), libelle_en_gb: labelGB.get(g.id) ?? null });
    for (const p of g.product_types) {
      const cle = `${depId}/${g.id}/${p.id}`;
      const corr = correspondance.get(cle) ?? null;
      const active = g.status === "active" && p.status === "active";
      NOEUDS.push({
        id: cle,
        niveau: 3,
        nature: "type_produit",
        parent: idG,
        departement: depId,
        groupe: g.id,
        type_produit: p.id,
        feuille: true,
        statut: p.status,
        proposee_par_formulaire: active,
        libelle_fr: fr(p),
        libelle_en: en(p),
        libelle_en_gb: labelGB.get(`${g.id}/${p.id}`) ?? null,
        // Le type est-il OFFICIELLEMENT rattaché à ce département (API) ?
        liste_officielle: (p.department ?? []).includes(depId),
        grille_tailles: corr?.size_set_by_region ?? null,
        legacy_category_id: corr?.legacy_category_id ?? null,
        attributs: p.attribute_ids ?? [],
        mesures: p.measurements ?? [],
        genre_enfant_requis: depId === "kidswear",
        etat_neuf_seulement: BEAUTE_NEUF_SEUL.has(p.id),
      });
    }
  }
}
// Doublons de libellé français entre frères (mesurables, jamais corrigés).
const parParent = new Map();
for (const n of NOEUDS) {
  if (!n.parent || !n.libelle_fr) continue;
  const k = `${n.parent}\u0000${n.libelle_fr.trim().toLowerCase()}`;
  parParent.set(k, (parParent.get(k) ?? 0) + 1);
}
for (const n of NOEUDS) {
  if (!n.parent || !n.libelle_fr) continue;
  if (parParent.get(`${n.parent}\u0000${n.libelle_fr.trim().toLowerCase()}`) > 1) n.libelle_fr_en_double_parmi_freres = true;
}

// ── 5. Recoupement avec le DOM du formulaire (322 feuilles) ────────────────
const feuillesUI = [];
let entete2 = null;
for (const s of UI) {
  if (/ > /.test(s)) entete2 = s;
  else feuillesUI.push(`${entete2} > ${s}`);
}
const nomDep = { menswear: "Men", womenswear: "Women", kidswear: "Kids", "everything-else": "Everything else" };
const feuillesActives = NOEUDS.filter((n) => n.feuille && n.proposee_par_formulaire);
const libellesApi = new Set(feuillesActives.map((n) => `${nomDep[n.departement]} > ${G[n.groupe].name_i18n["en-US"]} > ${n.libelle_en}`));
exiger(feuillesUI.length === feuillesActives.length, `DOM ${feuillesUI.length} feuilles, API ${feuillesActives.length}`);
for (const f of feuillesUI) exiger(libellesApi.has(f), `feuille du DOM absente de l'API : ${f}`);

const compte = (pred) => NOEUDS.filter(pred).length;
const typesProduit = Object.values(G).flatMap((g) => g.product_types.map((p) => ({ g, p })));
const COMPTES = {
  catalogue: {
    departements: DEPARTEMENTS.length,
    groupes: Object.keys(G).length,
    groupes_actifs: Object.values(G).filter((g) => g.status === "active").length,
    types_produit: typesProduit.length,
    types_produit_actifs: typesProduit.filter(({ g, p }) => g.status === "active" && p.status === "active").length,
    noeuds: DEPARTEMENTS.length + Object.keys(G).length + typesProduit.length,
    feuilles: typesProduit.length,
  },
  arbre: {
    noeuds: NOEUDS.length,
    feuilles: compte((n) => n.feuille),
    noeuds_proposes_par_formulaire: compte((n) => n.proposee_par_formulaire),
    feuilles_proposees_par_formulaire: feuillesActives.length,
    feuilles_dans_le_dom: feuillesUI.length,
    feuilles_liste_officielle: feuillesActives.filter((n) => n.liste_officielle).length,
    feuilles_hors_liste_officielle: feuillesActives.filter((n) => !n.liste_officielle).length,
    feuilles_avec_grille_tailles: feuillesActives.filter((n) => n.grille_tailles).length,
    feuilles_sans_grille_tailles: feuillesActives.filter((n) => !n.grille_tailles).length,
    feuilles_inactives: compte((n) => n.feuille && !n.proposee_par_formulaire),
    libelles_fr_en_double_parmi_freres: compte((n) => n.libelle_fr_en_double_parmi_freres),
  },
};

// ── 6. Attributs ────────────────────────────────────────────────────────────
const valeur = (a) => ({
  id: a.id,
  libelle_fr: a.name_i18n?.fr ?? a.name ?? null,
  libelle_en: a.name_i18n?.["en-US"] ?? a.name_i18n?.en ?? a.name ?? null,
  ...(a.description_i18n ? { description_fr: a.description_i18n.fr ?? null } : {}),
  ...(a.hex_code ? { hex: a.hex_code } : {}),
  ...(a.department ? { departements: a.department } : {}),
  statut: a.status,
});
const liste = (x, extra = {}) => ({
  id: x.id,
  libelle_fr: x.name_i18n?.fr ?? null,
  max_selection: x.max_selection ?? null,
  obligatoire_selon_api: x.is_mandatory ?? null,
  statut: x.status,
  ...extra,
  valeurs: x.attributes.map(valeur),
});
const marquesActives = A.brand.filter((b) => b.status === "active").length;
const ATTRIBUTS = {
  ...entete,
  // Le schéma du formulaire (bundle 14izy8jozou2r.js, formSchema) exige marque
  // et état pour publier, alors que l'API les dit is_mandatory:false : c'est le
  // FORMULAIRE qui fait foi pour une publication.
  etat: liste(A.condition, { obligatoire_selon_formulaire: true, neuf_seulement_pour: [...BEAUTE_NEUF_SEUL] }),
  couleur: liste(A.colour, { obligatoire_selon_formulaire: false }),
  source: liste(A.source, { obligatoire_selon_formulaire: false }),
  age: liste(A.age, { obligatoire_selon_formulaire: false }),
  style: liste(A.style, { obligatoire_selon_formulaire: false }),
  genre_enfant: liste(A.gender, { obligatoire_selon_formulaire: "département Enfants seulement" }),
  departements: DEPARTEMENTS,
  attributs_par_type: A.generic_attributes.map((g) => liste(g, { utilise_par_types: typesProduit.filter(({ p }) => (p.attribute_ids ?? []).includes(g.id)).map(({ g: gg, p }) => `${gg.id}/${p.id}`) })),
  mesures: { unite: A.measurements_standard_unit, valeurs: A.measurements.map(valeur) },
  marque: {
    obligatoire_selon_formulaire: true,
    nombre: A.brand.length,
    actives: marquesActives,
    inactives: A.brand.length - marquesActives,
    sans_marque: { id: "unbranded", libelle: A.brand.find((b) => b.id === "unbranded")?.name ?? null, note: "useBrandOptions (bundle 3wiqv4ay_2x_q.js) : l'option « Other » envoie la valeur `unbranded`" },
    autres_absences_relevees: A.brand.filter((b) => ["no-brand"].includes(b.id)).map((b) => ({ id: b.id, libelle: b.name, statut: b.status })),
    populaires: A.popular_brands.map((b) => b.id),
    liste_complete: "brut/attributes.json, clé `brand` : [{ id, name, status }]",
  },
};
exiger(ATTRIBUTS.etat.valeurs.length === 5, "5 états attendus");
exiger(ATTRIBUTS.marque.sans_marque.libelle, "marque `unbranded` absente de la liste");

// ── 7. Tailles ──────────────────────────────────────────────────────────────
const TAILLES = {
  ...entete,
  regions: REGIONS,
  note_region: "Une feuille porte une grille PAR RÉGION (IT, GB, US, AU). IT = système EUR : c'est la grille d'un compte français (vu le 08/10 : Homme > Hauts > T-shirts propose la grille 56, 27 tailles).",
  par_departement: M.department_to_size_mapping.map((d) => ({ departement: d.department, familles: d.size_sets })),
  grilles: GRILLES,
};

// ── 8. Écriture / vérification ─────────────────────────────────────────────
if (erreurs.length) {
  for (const e of erreurs) console.error(`✗ ${e}`);
  process.exit(1);
}
const sorties = {
  [`${DOSSIER}/arbre.json`]: { ...entete, comptes: COMPTES, noeuds: NOEUDS, hors_arbre: HORS_ARBRE },
  [`${DOSSIER}/attributs.json`]: ATTRIBUTS,
  [`${DOSSIER}/tailles.json`]: TAILLES,
};
let ko = 0;
for (const [f, contenu] of Object.entries(sorties)) {
  const s = `${JSON.stringify(contenu, null, 1)}\n`;
  if (VERIFIER) {
    const surDisque = fs.existsSync(join(ROOT, f)) ? texte(f) : null;
    if (surDisque !== s) { console.error(`✗ ${f} : diffère de ce que la source produit (relancer sans --verifier)`); ko++; }
    else console.log(`✓ ${f} identique à la source`);
  } else {
    fs.writeFileSync(join(ROOT, f), s);
    console.log(`✓ ${f} écrit (${s.length} caractères)`);
  }
}
console.log(`Arbre : ${COMPTES.arbre.noeuds} nœuds, ${COMPTES.arbre.feuilles} feuilles (${COMPTES.arbre.feuilles_proposees_par_formulaire} proposées par le formulaire = ${COMPTES.arbre.feuilles_dans_le_dom} dans le DOM).`);
console.log(`Catalogue : ${COMPTES.catalogue.noeuds} nœuds, ${COMPTES.catalogue.feuilles} types de produit (${COMPTES.catalogue.types_produit_actifs} actifs).`);
process.exit(ko ? 1 : 0);
