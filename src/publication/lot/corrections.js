// ═══════════════════════════════════════════════════════════════════════════
// CORRIGER CE QUI PART, PLATEFORME PAR PLATEFORME (19/11/2026, refonte du lot — maquettes lot-1911 validées par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// La cliente Business (thecloset) : « pouvoir modifier tous les paramètres sur chaque plateforme, comme si je créais
// directement mon annonce sur Vinted ou eBay… me laisser la main sur tout, comme pour les photos. »
// LES RÈGLES (feu vert de Nico, 19/11, réponses aux 7 questions) :
//   · tout ce que FillSell ENVOIE DÉJÀ se corrige (titre, description, prix, état, marque, taille, couleur, matière,
//     les champs du rayon, l'univers, l'âge, le modèle…), sur la copie de CHAQUE plateforme ; ce que FillSell
//     n'envoie pas encore (style, provenance, époque Depop) viendra avec une extension ;
//   · une correction vaut, PAR DÉFAUT, pour toutes les plateformes de l'article ET s'écrit sur la fiche ;
//     « Seulement sur X » ne touche que la copie de X, et se garde sur la fiche par plateforme
//     (attributs.valeurs_plateformes — fusion par inventaire_attributs_fusion, aucune migration) ;
//   · les valeurs proposées restent celles de l'app : la personne ne fait que corriger.
// ⛔ Aucune règle du moteur n'est réécrite : chaque geste passe par ses écritures (poserValeurGenerale, modifierCarte,
//    setSharedField, poserPrixGeneral, poserChampCopie, setEdited), comme depuis les cartes de la publication à l'unité.
// Pur pour tout ce qui calcule (scripts/lot-corrections-1911-selftest.mjs) ; `appliquerCorrection` et
// `reappliquerValeursPlateformes` écrivent sur le moteur qu'on leur donne.
import { suitLaGenerale, valeurPourPlateforme } from "../../utils/valeursGenerales.js";
import { avecFormatChoisi, LBC_FORMATS } from "../../utils/leboncoinColis.js";
import { formatDeLaFiche, choixFormatPourLaFiche } from "../../../supabase/functions/_shared/colis-de-la-fiche.js";
// (20/11/2026) L'état d'une copie, là où le moteur et le serveur le lisent (champ dédié OU critère du rayon).
import { etatsDuJob } from "../../../supabase/functions/_shared/etat-correspondance.js";
import { estChampEtat } from "../moteur/listes.js";

export const CLE_VALEURS_PLATEFORMES = "valeurs_plateformes";
export const PORTEE_TOUTES = "toutes";
/** Les champs qui suivent l'article (même valeur partout, convertie pour chaque plateforme au dépôt). */
export const CHAMPS_PARTAGES = Object.freeze(["marque", "taille", "couleur", "matiere"]);
export const CHAMPS_COMMUNS = Object.freeze(["titre", "description", "prix", "etat", ...CHAMPS_PARTAGES]);
const CHAMPS_TEXTE = new Set(["titre", "description"]);
// Les champs de la copie qui ont DÉJÀ leur ligne ailleurs (rayon, colis, port) ou qui décident du rayon (genre) :
// jamais une deuxième ligne pour eux.
const HORS_LIGNES = new Set(["genre", "categorie", "depopPort", "format_colis", "etat", ...CHAMPS_PARTAGES]);
export const ETATS_ARTICLE = Object.freeze(["Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "Satisfaisant"]);

const txt = (v) => (v == null ? "" : String(v)).trim();
const norm = (v) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
const memeValeur = (a, b) => norm(a) === norm(b);

/** Une plateforme dont l'annonce n'a pas de titre (Depop : la description seule). */
export const plateformeSansTitre = (p) => p === "depop";
/** Le champ existe-t-il sur plusieurs plateformes (portée « toutes » possible) ? */
export const estCommun = (cle) => CHAMPS_COMMUNS.includes(cle);

// ── LA VALEUR DE L'ARTICLE ET CELLE DE CHAQUE COPIE ─────────────────────────────────────────────────────────────
/** La valeur de l'article (celle qui part partout tant qu'une copie n'a pas la sienne). */
export function valeurDeLArticle(m, cle) {
  if (cle === "titre" || cle === "description") return txt(m?.generales?.[cle]);
  if (cle === "etat") return txt(m?.generales?.etat || m?.etatArticle);
  if (cle === "prix") return m?.price == null || m?.price === "" ? "" : String(m.price);
  if (CHAMPS_PARTAGES.includes(cle)) return txt(m?.sharedFields?.[cle]);
  return "";
}

/** La valeur que la copie de la plateforme porte (ce qui partira). */
export function valeurDeLaCopie(m, p, cle) {
  const c = m?.edited?.[p];
  if (!c) return "";
  if (cle === "titre") return txt(c.title);
  if (cle === "description") return txt(c.description);
  // (19/11) Une copie sans prix à elle part au prix de l'article (construireJobs) : on montre celui-là, jamais « À fixer ».
  if (cle === "prix") return c.price == null || c.price === "" ? (m?.price == null || m?.price === "" ? "" : String(m.price)) : String(c.price);
  if (cle === "couleur" && p === "ebay" && Array.isArray(c.platform_fields?.colors) && c.platform_fields.colors.length) return txt(c.platform_fields.colors[0]);
  // (20/11/2026, lot « écrans » — « État demandé une seule fois ») L'état de la copie est celui que le moteur et le
  // serveur lisent (etatsDuJob : champ dédié, puis critère « condition » du rayon, puis lu sur l'annonce) — avant :
  // le champ dédié seul, et l'onglet Vinted d'un article PRÊT disait « État : À ajouter » au-dessus de son critère
  // « État : Très bon état ».
  if (cle === "etat") {
    const crit = (m?.genericRequiredStatus?.[p] ?? []).find((a) => estChampEtat(p, a?.key) && a?.state === "ok");
    return txt(c.platform_fields?.etat) || txt(etatsDuJob(c.platform_fields ?? null)[0]) || txt(crit?.value);
  }
  return txt(c.platform_fields?.[cle]);
}

/** La copie a-t-elle SA valeur, différente de celle de l'article ? (« modifié pour X ») */
export function copieAPart(m, p, cle) {
  if (!estCommun(cle)) return false;
  const a = valeurDeLArticle(m, cle);
  const c = valeurDeLaCopie(m, p, cle);
  if (!a || !c) return false;
  if (cle === "etat") return !memeValeur(valeurPourPlateforme("etat", a, p).valeur, c);
  if (cle === "prix") return Number(a) !== Number(c);
  if (cle === "description") return false; // chaque plateforme reçoit son texte mis en conformité : jamais « à part » pour ça
  return !memeValeur(a, c);
}

/**
 * Les lignes d'une plateforme : tout ce qui part, une ligne chacun, dans l'ordre d'une annonce. Les champs vides et
 * facultatifs ne prennent pas de place : ils sont rendus dans `aAjouter` (« + Ajouter : Matière, Couleur »).
 * @returns {{ lignes: Array<{cle,label,valeur,commun,options,type,aPart}>, aAjouter: Array<{cle,label,options,type}> }}
 */
export function lignesDeLaPlateforme(m, p, { libelles = {} } = {}) {
  const cfg = (m?.platformFieldsConfig?.[p] ?? []).filter((f) => f && f.key);
  const parCle = new Map(cfg.map((f) => [f.key, f]));
  const lignes = [];
  const aAjouter = [];
  const pousser = (cle, label, { type = "texte", options = [] } = {}) => {
    const valeur = valeurDeLaCopie(m, p, cle);
    const l = { cle, label, valeur, commun: estCommun(cle), options, type, aPart: copieAPart(m, p, cle) };
    if (valeur || ["titre", "description", "prix", "etat"].includes(cle)) lignes.push(l);
    else aAjouter.push(l);
  };
  if (!plateformeSansTitre(p)) pousser("titre", libelles.titre ?? "Titre", { type: "court" });
  pousser("description", libelles.description ?? "Description", { type: "long" });
  pousser("prix", libelles.prix ?? "Prix", { type: "prix" });
  const etatCfg = parCle.get("etat");
  if (etatCfg) pousser("etat", etatCfg.label ?? "État", { type: "liste", options: (etatCfg.options ?? []).map((o) => String(o.value ?? o)) });
  for (const cle of CHAMPS_PARTAGES) {
    const f = parCle.get(cle);
    if (!f) continue;
    pousser(cle, f.label ?? cle, { type: f.type === "select" ? "liste" : "texte", options: (f.options ?? []).map((o) => String(o.value ?? o)) });
  }
  for (const f of cfg) {
    if (HORS_LIGNES.has(f.key) || CHAMPS_TEXTE.has(f.key)) continue;
    pousser(f.key, f.label ?? f.key, { type: f.type === "select" ? "liste" : "texte", options: (f.options ?? []).map((o) => String(o.value ?? o)) });
  }
  return { lignes, aAjouter };
}

// ── LE GESTE : ÉCRIRE SUR LE MOTEUR ─────────────────────────────────────────────────────────────────────────────
const setEditedDe = (m) => m?.propsStepGeneration?.setEdited ?? m?.setEdited ?? null;

/** La copie avec le champ partagé posé (eBay : la couleur aussi en tête de `colors`, que lisent la garde et ebay.js). */
function copieAvec(copie, p, cle, valeur) {
  const pf = { ...(copie.platform_fields ?? {}) };
  if (valeur == null || valeur === "") delete pf[cle]; else pf[cle] = valeur;
  if (p === "ebay" && cle === "couleur" && Array.isArray(pf.colors) && pf.colors.length && valeur) pf.colors = [valeur, ...pf.colors.slice(1)];
  return { ...copie, platform_fields: pf };
}

/**
 * Applique une correction sur le moteur de l'article.
 * @param {object} m  le moteur (pilote du stepper)
 * @param {{ cle: string, valeur: string, portee: "toutes" | string, plateformes: string[] }} c
 *        portee : « toutes » ou le nom d'UNE plateforme ; plateformes : celles de l'article.
 */
export function appliquerCorrection(m, { cle, valeur, portee, plateformes = [], gardees = [] }) {
  if (!m || !cle) return false;
  const v = cle === "titre" ? txt(valeur).replace(/\s*\n+\s*/g, " ") : (cle === "description" ? String(valeur ?? "") : txt(valeur));
  const toutes = portee === PORTEE_TOUTES;
  const garde = new Set(toutes ? gardees : []);
  const setEdited = setEditedDe(m);
  if (cle === "titre" || cle === "description" || cle === "etat") {
    if (toutes) {
      m.poserValeurGenerale?.(cle, v);
      // Une copie modifiée à part reçoit aussi la correction (« toutes » veut dire toutes).
      const dis = m.propsStepGeneration?.dissociees ?? null;
      for (const p of plateformes) {
        if (garde.has(p)) continue;
        if (!suitLaGenerale(dis, cle, p)) m.modifierCarte?.(p, cle, cle === "etat" ? valeurPourPlateforme("etat", v, p).valeur : v);
      }
    } else {
      m.modifierCarte?.(portee, cle, cle === "etat" ? valeurPourPlateforme("etat", v, portee).valeur : v);
    }
    return true;
  }
  if (cle === "prix") {
    const n = Number(String(v).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return false;
    const cibles = (toutes ? plateformes : [portee]).filter((p) => !garde.has(p));
    if (toutes) m.poserPrixGeneral?.(String(n));
    setEdited?.((prev) => {
      const next = { ...prev };
      for (const p of cibles) if (next[p]) next[p] = { ...next[p], price: n };
      return next;
    });
    const setCustom = m.propsStepGeneration?.setCustomPriced;
    if (setCustom) setCustom((prev) => { const s = new Set(prev ?? []); for (const p of cibles) { if (toutes) s.delete(p); else s.add(p); } return s; });
    return true;
  }
  if (CHAMPS_PARTAGES.includes(cle) && toutes) {
    m.setSharedField?.(cle, v);
    m.noterReponseFiche?.(cle);
  }
  const cibles = (toutes ? plateformes : [portee]).filter((p) => !garde.has(p));
  // Une copie « gardée » (sa valeur à part, choisie pour elle) reprend sa valeur après la propagation de setSharedField.
  const aRemettre = toutes ? [...garde].map((p) => [p, valeurDeLaCopie(m, p, cle)]) : [];
  if (setEdited) {
    setEdited((prev) => {
      const next = { ...prev };
      for (const p of cibles) if (next[p]) next[p] = copieAvec(next[p], p, cle, v);
      for (const [p, ancienne] of aRemettre) if (next[p] && ancienne) next[p] = copieAvec(next[p], p, cle, ancienne);
      return next;
    });
  } else {
    for (const p of cibles) m.poserChampCopie?.(p, cle, v);
  }
  return true;
}

// ── CE QUI S'ÉCRIT SUR LA FICHE ─────────────────────────────────────────────────────────────────────────────────
/** Les valeurs gardées par plateforme sur la fiche ({ vinted: { prix: { v, base } } }). */
export function valeursPlateformesDeLaFiche(attributs) {
  const a = attributs && typeof attributs === "object" ? attributs[CLE_VALEURS_PLATEFORMES] : null;
  const v = a && typeof a === "object" && !Array.isArray(a) && "v" in a ? a.v : a;
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

/**
 * Ce que la fiche reçoit pour une correction : { colonnes, attributs } (objets vides = rien à écrire), à passer tels
 * quels à update() — le trigger fusionne attributs clé par clé (source « manuel », le rang le plus haut).
 * · « toutes » : la valeur de l'article (colonne ou attribut), et les valeurs gardées par plateforme pour ce champ
 *   s'effacent (elles ne repartiraient plus) ; titre et description : le moteur les écrit lui-même (retouche) ;
 * · une plateforme : la valeur se garde pour elle, avec la valeur de l'article du moment (`base`) — elle ne repart
 *   que tant que l'article garde cette valeur-là.
 */
export function patchFicheCorrection({ cle, valeur, portee, base = "", attributs = null, garderAPart = false, maintenant = new Date() }) {
  const at = maintenant.toISOString();
  const colonnes = {};
  const attrs = {};
  const v = txt(valeur);
  const gardees = valeursPlateformesDeLaFiche(attributs);
  if (portee === PORTEE_TOUTES) {
    if (cle === "prix") { const n = Number(v.replace(",", ".")); if (Number.isFinite(n) && n > 0) colonnes.prix_vente = n; }
    else if (cle === "marque" && v) { colonnes.marque = v; attrs.marque = { v, source: "manuel", at }; }
    else if ((cle === "etat" || CHAMPS_PARTAGES.includes(cle)) && v) attrs[cle] = { v, source: "manuel", at };
    const suite = {};
    let retire = false;
    for (const [p, champs] of Object.entries(gardees)) {
      if (!champs || typeof champs !== "object") continue;
      const { [cle]: ote, ...reste } = champs;
      if (ote !== undefined) retire = true;
      if (Object.keys(reste).length) suite[p] = reste;
    }
    if (retire && !garderAPart) attrs[CLE_VALEURS_PLATEFORMES] = { v: suite, source: "manuel", at };
  } else if (portee) {
    const suite = { ...gardees, [portee]: { ...(gardees[portee] ?? {}), [cle]: { v: cle === "description" ? String(valeur ?? "") : v, base: txt(base) } } };
    attrs[CLE_VALEURS_PLATEFORMES] = { v: suite, source: "manuel", at };
  }
  return { colonnes, attributs: attrs };
}

/**
 * À l'ouverture d'un article déjà corrigé : les valeurs gardées par plateforme qui valent encore (l'article a gardé
 * la valeur `base` du moment de la correction), à reposer sur les copies. [{ cle, valeur, portee }]
 */
export function valeursAReposer(m, attributs, plateformes = []) {
  const out = [];
  const gardees = valeursPlateformesDeLaFiche(attributs);
  for (const p of plateformes) {
    for (const [cle, e] of Object.entries(gardees[p] ?? {})) {
      const v = e && typeof e === "object" ? e.v : e;
      if (v == null || txt(v) === "") continue;
      const base = e && typeof e === "object" ? txt(e.base) : "";
      const article = valeurDeLArticle(m, cle);
      if (estCommun(cle) && base && article && !(cle === "prix" ? Number(base) === Number(article) : memeValeur(base, article))) continue;
      if (memeValeur(valeurDeLaCopie(m, p, cle), v)) continue;
      out.push({ cle, valeur: String(v), portee: p });
    }
  }
  return out;
}

// ── LE FORMAT DU COLIS LEBONCOIN : CELUI DE LA FICHE (décision de Nico, point c) ────────────────────────────────
// Jamais une valeur unique pour tout le lot : la copie porte le format choisi POUR CET ARTICLE (marqueur
// format_colis_par_article, reconnu par _shared/colis-de-la-fiche.js), sinon celui de la fiche (choisi, ou déduit du
// poids) — le serveur pose le même au service. Sans l'un ni l'autre : Leboncoin l'estime.
export const MARQUE_PAR_ARTICLE = "format_colis_par_article";

/** Le format qui partira : { valeur, origine: "article" | "choisi" | "poids" | "estime", poids_g }. */
export function formatColisLbc({ pf = null, fiche = null, poids_g = null } = {}) {
  const v = txt(pf?.format_colis);
  if (pf?.[MARQUE_PAR_ARTICLE] === true && LBC_FORMATS.some((f) => f.valeur === v)) return { valeur: v, origine: "article", poids_g };
  const f = formatDeLaFiche({ ...(fiche ?? {}), ...(poids_g != null ? { poids_g } : {}) });
  if (f) return { valeur: f.valeur, origine: f.origine, poids_g: f.poids_g ?? poids_g };
  return { valeur: null, origine: "estime", poids_g };
}

/** platform_fields Leboncoin avec le format choisi POUR CET ARTICLE (« » : revenir au format de la fiche). */
export function pfAvecFormatDeLArticle(pf, valeur, maintenant = new Date()) {
  const suite = avecFormatChoisi(pf, valeur || "", maintenant);
  if (valeur) suite[MARQUE_PAR_ARTICLE] = true; else delete suite[MARQUE_PAR_ARTICLE];
  return suite;
}

/** L'attribut de la fiche pour ce choix (geste « article » : jamais pris pour l'écho d'un lot). */
export function attributFormatDeLArticle(valeur, { poids_g = null, maintenant = new Date() } = {}) {
  const a = choixFormatPourLaFiche(valeur || "auto", { poids_g, maintenant });
  return { format_colis_lbc: { ...a.format_colis_lbc, geste: "article" } };
}

// ── « À VÉRIFIER » : CE QUE FILLSELL A DÉDUIT, SANS RIEN BLOQUER (réponse 1 de Nico) ────────────────────────────
/**
 * Les points à vérifier d'un article (jamais bloquants : seul « À régler » bloque l'envoi).
 * `tailleTitre` : le verdict de la règle « taille contredite par le titre » (_shared, Opus-2), ou null.
 * @returns {Array<{ cle: string, libelle: string, plateformes?: string[], valeurs?: { fiche: string, titre: string } }>}
 */
export function pointsAVerifier(m, { tailleTitre = null, poses = [], poidsDouteux = null, lang = "fr" } = {}) {
  const en = lang === "en";
  const out = [];
  if (tailleTitre && tailleTitre.taille_fiche && tailleTitre.taille_titre) {
    out.push({
      cle: "taille_titre",
      libelle: en ? `Size ${tailleTitre.taille_fiche}, title says ${tailleTitre.taille_titre}` : `Taille ${tailleTitre.taille_fiche}, le titre dit ${tailleTitre.taille_titre}`,
      valeurs: { fiche: String(tailleTitre.taille_fiche), titre: String(tailleTitre.taille_titre) },
    });
  }
  // Un poids que l'objet rend douteux (C10, ficheLue.poidsIncoherent) : la question reste sous la ligne, sans bloquer.
  if (poidsDouteux) out.push({ cle: "poids", libelle: en ? `Weight to check for ${poidsDouteux}` : `Poids à vérifier pour ${poidsDouteux}` });
  // Les réponses que la mémoire du compte a posées sur CET article (« Âge » Beebs, « Modèle » eBay…), encore telles
  // quelles (memoireCategorie.posesMemoireVisibles) : une valeur reprise d'un autre article, à un regard près.
  const pfs = [...(m?.plateformesPubliables ?? [])];
  for (const x of poses ?? []) {
    const pose = x?.pose ?? x;
    if (!pose?.plateforme || !pose?.champ || (pfs.length && !pfs.includes(pose.plateforme))) continue;
    const label = String(pose.label ?? pose.champ);
    out.push({ cle: `memoire:${pose.plateforme}|${pose.champ}`, plateformes: [pose.plateforme],
      // (20/11/2026, lot de Louis) Une valeur PROBABLE est choisie par FillSell, jamais « ta dernière réponse ».
      libelle: pose.sorte === "probable"
        ? (en ? `${label} « ${x?.valeur ?? pose.valeur} »: picked by FillSell` : `${label} « ${x?.valeur ?? pose.valeur} » : choisi par FillSell`)
        : (en ? `${label} « ${x?.valeur ?? pose.valeur} »: taken from your last answer` : `${label} « ${x?.valeur ?? pose.valeur} » : repris de ta dernière réponse`) });
  }
  return out;
}
