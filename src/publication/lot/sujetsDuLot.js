// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAPE 2 DU LOT, PAR QUESTION (26/10/2026 nuit — design B validé par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Ce qu'il reste à faire pour chaque article (les MÊMES questions que le moteur compte : clesQuestions, rayons à
// choisir, genre, description Vinted, prix d'achat ; et ce que le lot ajoute : prix de vente, poids Leboncoin, même
// article ?, port Depop, motif du bouton gris), rangé par SUJET : toutes les tailles Beebs ensemble, puis tous les
// âges… Chaque ligne d'un sujet se répond en un geste, par le même bloc que le stepper (BlocQuestions `seulement`).
// Le texte écrit par FillSell n'est PAS un sujet : un seul « Tout valider » pour le lot (decider texteValide).
// Pur : aucune lecture, aucune écriture.
// Imports à extension explicite : ce fichier se teste sous Node (selftest:lot-par-question).
import { SHARED_FIELD_KEYS, PLATFORM_LABELS, genericFieldToSharedKey } from "../moteur/champsPartages.js";
import { aspectBloquant } from "../moteur/regles.js";

const NOM = (p) => PLATFORM_LABELS[p] ?? p; // le même que texte.js

const LIBELLES_PARTAGES = {
  fr: { taille: "Taille", couleur: "Couleur", matiere: "Matière", marque: "Marque" },
  en: { taille: "Size", couleur: "Colour", matiere: "Material", marque: "Brand" },
};

/** Les plateformes qui demandent un champ partagé (taille, couleur…) à cet article. */
function plateformesDuChampPartage(m, cle) {
  const out = [];
  for (const [gp, list] of Object.entries(m?.genericRequiredStatus ?? {})) {
    if ((list ?? []).some((a) => genericFieldToSharedKey(gp, a.key) === cle && aspectBloquant(a))) out.push(gp);
  }
  if ((m?.ebayRequiredStatus ?? []).some((a) => a.sharedKey === cle && aspectBloquant(a))) out.push("ebay");
  return out.length ? out : [...(m?.plateformesPubliables ?? [])].filter((p) => p !== "opla");
}

/** Une clé de question qui est une TAILLE (le champ partagé, l'aspect taille d'une plateforme, celui d'eBay). */
function estCleTaille(m, cle) {
  if (cle === "taille") return true;
  if (cle === "ebay:Dimensions") return false;
  if (cle.startsWith("ebay:")) return (m?.ebayRequiredStatus ?? []).some((a) => `ebay:${a.name}` === cle && a.sharedKey === "taille");
  const i = cle.indexOf(":");
  return i > 0 && genericFieldToSharedKey(cle.slice(0, i), cle.slice(i + 1)) === "taille";
}

/**
 * Les questions d'UN article, une par sujet : [{ cle, sujet, libelle, plateformes, type }].
 * `type` : « moteur » (BlocQuestions seulement=cles ?? [cle]), « rayon », « prix », « poids », « jumeau », « port_depop », « cta ».
 * Deux tailles ou plus (Vinted, Beebs, eBay…) sont UNE question, comme dans le stepper (questionTaille) : `cles` les
 * porte toutes, la ligne montre la question groupée une seule fois.
 * ⛔ Un article à revoir a TOUJOURS au moins une ligne, sauf quand son seul motif est le texte à relire (le
 * « Tout valider » du lot le porte) : un motif que rien ici ne sait poser devient « À vérifier », qui ouvre sa feuille.
 * @param {object} m          le moteur de l'article (pilote du stepper)
 * @param {Array<{cle:string}>} motifs  bilanArticle(...).motifs
 * @param {{ jumeaux?: Array<{platform:string}>, lang?: string }} [opts]
 */
export function questionsDeLArticle(m, motifs = [], { jumeaux = [], lang = "fr" } = {}) {
  if (!m) return [];
  const en = lang === "en";
  const L = LIBELLES_PARTAGES[en ? "en" : "fr"];
  const out = [];
  const ajouter = (q) => { if (!out.some((x) => x.cle === q.cle)) out.push({ ...q, sujet: `${q.libelle}|${(q.plateformes ?? []).join(",")}` }); };
  const toutes = Array.isArray(m.clesQuestions) ? m.clesQuestions : [];
  const tailles = toutes.filter((cle) => estCleTaille(m, cle));
  if (tailles.length >= 2) {
    const pfs = new Set();
    for (const cle of tailles) {
      if (cle === "taille") for (const p of plateformesDuChampPartage(m, "taille")) pfs.add(p);
      else pfs.add(cle.startsWith("ebay:") ? "ebay" : cle.slice(0, cle.indexOf(":")));
    }
    ajouter({ cle: "taille", cles: tailles.includes("taille") ? tailles : ["taille", ...tailles], type: "moteur", libelle: L.taille, plateformes: [...pfs] });
  }
  for (const cle of toutes) {
    if (tailles.length >= 2 && tailles.includes(cle)) continue;
    if (SHARED_FIELD_KEYS.includes(cle)) {
      ajouter({ cle, type: "moteur", libelle: L[cle] ?? cle, plateformes: plateformesDuChampPartage(m, cle) });
    } else if (cle === "ebay:Dimensions") {
      ajouter({ cle, type: "moteur", libelle: "Dimensions", plateformes: ["ebay"] });
    } else if (cle.startsWith("ebay:")) {
      const aspect = (m.ebayRequiredStatus ?? []).find((a) => `ebay:${a.name}` === cle);
      ajouter({ cle, type: "moteur", libelle: String(aspect?.label ?? cle.slice(5)), plateformes: ["ebay"] });
    } else if (!cle.includes(":")) {
      // Une clé sans plateforme que ce fichier ne connaît pas : posée telle quelle, jamais mal découpée.
      ajouter({ cle, type: "moteur", libelle: cle, plateformes: plateformesDuChampPartage(m, cle) });
    } else {
      const i = cle.indexOf(":");
      const gp = cle.slice(0, i), key = cle.slice(i + 1);
      const ligne = (m.genericRequiredStatus?.[gp] ?? []).find((a) => a.key === key);
      ajouter({ cle, type: "moteur", libelle: String(ligne?.label ?? key), plateformes: [gp] });
    }
  }
  for (const p of ["vinted", "beebs"]) {
    if (m[`${p}GenreBlocked`]) ajouter({ cle: `genre:${p}`, type: "moteur", libelle: en ? "Who it's for" : "Pour qui", plateformes: [p] });
  }
  if (m.descriptionVideVinted) ajouter({ cle: "description", type: "moteur", libelle: "Description", plateformes: ["vinted"] });
  if (m.prixAchatManquant) ajouter({ cle: "prix_achat", type: "moteur", libelle: en ? "Purchase price" : "Prix d'achat", plateformes: [] });
  for (const p of Object.keys(m.rayonsAChoisir ?? {})) ajouter({ cle: `rayon:${p}`, type: "rayon", libelle: en ? "Category" : "Rayon", plateformes: [p] });
  const a = new Set((motifs ?? []).map((x) => x.cle));
  if (a.has("prix")) ajouter({ cle: "prix", type: "prix", libelle: en ? "Selling price" : "Prix de vente", plateformes: [] });
  if (a.has("poids")) ajouter({ cle: "poids", type: "poids", libelle: en ? "Parcel weight" : "Poids du colis", plateformes: ["leboncoin"] });
  if (a.has("jumeau")) for (const j of jumeaux ?? []) ajouter({ cle: `jumeau:${j.platform}`, type: "jumeau", libelle: en ? "Same item?" : "Le même article ?", plateformes: [j.platform], jumeau: j });
  if (a.has("port_depop")) ajouter({ cle: "port_depop", type: "port_depop", libelle: en ? "Shipping" : "Frais de port", plateformes: ["depop"] });
  // Ce que rien ci-dessus n'a posé (le bouton gris, ou un motif « questions » sans clé lisible) : « À vérifier ».
  const autreQueLeTexte = !a.size || [...a].some((c) => c !== "texte");
  if (!out.length && autreQueLeTexte) ajouter({ cle: "cta", type: "cta", libelle: en ? "To check" : "À vérifier", plateformes: [] });
  return out;
}

/**
 * Les sujets du lot : [{ sujet, libelle, plateformes, lignes: [{ id, q }] }] — les plus nombreux d'abord, puis dans
 * l'ordre où ils apparaissent. Une ligne = un article × une question.
 * @param {Array<{ id: string, questions: ReturnType<typeof questionsDeLArticle> }>} articles
 */
export function sujetsDuLot(articles) {
  const parSujet = new Map();
  let rang = 0;
  for (const { id, questions } of articles ?? []) {
    for (const q of questions ?? []) {
      if (!parSujet.has(q.sujet)) parSujet.set(q.sujet, { sujet: q.sujet, libelle: q.libelle, plateformes: q.plateformes ?? [], type: q.type, rang: rang++, lignes: [] });
      parSujet.get(q.sujet).lignes.push({ id, q });
    }
  }
  return [...parSujet.values()].sort((x, y) => (y.lignes.length - x.lignes.length) || (x.rang - y.rang));
}

/** Le titre d'un sujet : « Taille · Beebs », « Taille · Vinted, Beebs, eBay », « Prix de vente ». */
export function titreDuSujet(s) {
  const pf = (s?.plateformes ?? []).map(NOM);
  return pf.length ? `${s.libelle} · ${pf.join(", ")}` : String(s?.libelle ?? "");
}
