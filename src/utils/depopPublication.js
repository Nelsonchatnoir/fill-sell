// ═══════════════════════════════════════════════════════════════════════════
// DEPOP — LA COPIE ET LES CHAMPS DU JOB, POSÉS PAR L'APP (09/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Pur (Node + Vite) : scripts/depop-app-selftest.mjs.
//
// LA COPIE. generate-listing ne rédige pas Depop (comme Opla) : sa copie
// dérive d'une autre (Vinted d'abord). Une annonce Depop n'a PAS de titre —
// la description fait tout, 1 000 caractères au plus, 5 hashtags au plus
// (MAX_CHAR_COUNT et MAX_HASHTAGS du formulaire, relevés le 08/10). Au-delà,
// les hashtags en trop tombent (les premiers restent) et le texte est coupé au
// dernier mot entier — jamais au milieu d'un mot ; ce qui a été coupé est dit.
//
// LES CHAMPS. Mêmes identifiants que le connecteur (content-scripts/depop.js) :
//   depopCategoryPath  [département, groupe, type] — par IDENTIFIANT seulement
//                      (utils/depopCategories.js), jamais par un libellé ;
//   depopGenre         male | female | unisex — en Enfants seulement ;
//   depopEtat          brand_new… (utils/depopAttributs.js, jamais embelli) ;
//   depopCouleurs      2 au plus ; depopTaille ; depopMarque (« Sans marque »
//                      → « Other » chez Depop) ; depopPort (la personne).
// Ce que la fiche ne permet pas de poser n'est PAS inventé : le champ reste
// vide et le connecteur pose la question (needs_user), ou le rayon se choisit
// (« rayon à choisir », CarteRayon).
// ═══════════════════════════════════════════════════════════════════════════

import { getDepopCategory, DEPOP_GENRE_ENFANT } from "./depopCategories.js";
import {
  depopEtat, depopCouleurs, DEPOP_TAILLE_ENFANT, depopPointureEnfant, depopMarqueAbsente, DEPOP_ETAT_PAR_PALIER,
} from "./depopAttributs.js";
import { couperAuMot } from "./texteConforme.js";
import { lireTourDeTaille } from "../../supabase/functions/_shared/taille-de-service.js";
// (11/10) Les libellés corrigés et la trace du moteur de rayon (module partagé avec le serveur).
import { libellesRayonDepop, VERSION_RAYON_DEPOP, SOURCE_RAYON_DEPOP, CLE_QUESTION_RAYON_DEPOP } from "../../supabase/functions/_shared/depop-rayon.js";

export const DEPOP_DESCRIPTION_MAX = 1000;
export const DEPOP_HASHTAGS_MAX = 5;
// Un hashtag compté LARGE (lettres accentuées comprises) : le texte qui part
// tient sous le plafond quelle que soit la façon dont Depop les compte.
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

/** Le texte Depop d'une description : ≤ 5 hashtags, ≤ 1 000 caractères. */
export function texteDepop(brut) {
  let texte = String(brut ?? "").replace(/\r\n/g, "\n").trim();
  const notes = [];
  let n = 0;
  texte = texte.replace(HASHTAG_RE, (h) => (++n <= DEPOP_HASHTAGS_MAX ? h : ""));
  if (n > DEPOP_HASHTAGS_MAX) notes.push({ champ: "hashtags", avant: n, apres: DEPOP_HASHTAGS_MAX });
  texte = texte.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (texte.length > DEPOP_DESCRIPTION_MAX) {
    const avant = texte.length;
    texte = couperAuMot(texte, DEPOP_DESCRIPTION_MAX);
    notes.push({ champ: "description", avant, apres: texte.length });
  }
  return { texte, notes };
}

/** Combien de hashtags (compte LARGE, cf. HASHTAG_RE). */
export function compterHashtagsDepop(texte) {
  return (String(texte ?? "").match(HASHTAG_RE) ?? []).length;
}

/**
 * La copie Depop, dérivée d'une copie source (Vinted d'abord) — même contrat
 * que deriverCopieOpla (ListingPreviewScreen) : les valeurs GÉNÉRALES priment.
 * `valeur(champ, v)` traduit une valeur générale pour Depop (valeurPourPlateforme).
 */
export function deriverCopieDepop(source, { prixGeneral = null, generales = null, valeur = (_c, v) => v } = {}) {
  const pf = source?.platform_fields ?? {};
  const garder = ["etat", "taille", "genre", "marque", "couleur", "categorie"];
  const copie = {};
  for (const k of garder) if (pf[k] != null && String(pf[k]).trim() !== "") copie[k] = pf[k];
  const general = (champ, repli) => {
    const v = String(generales?.[champ] ?? "").trim();
    return v ? valeur(champ, v) : repli;
  };
  const etatGeneral = general("etat", null);
  if (etatGeneral) copie.etat = etatGeneral;
  const prix = prixGeneral === "" || prixGeneral == null ? null : Number(prixGeneral);
  const { texte } = texteDepop(general("description", String(source?.description ?? "")));
  return {
    // Le titre n'est PAS envoyé à Depop (aucun champ titre) : il ne sert qu'à
    // nommer le job dans la file et l'historique.
    title: general("titre", String(source?.title ?? "")),
    description: texte,
    platform_fields: copie,
    price: prix ?? source?.price ?? null,
  };
}

/** La taille Depop d'une fiche (canonique de l'app) pour une feuille donnée. */
export function tailleDepop(taille, chemin) {
  const t = String(taille ?? "").trim();
  if (!t) return null;
  const [dep, groupe] = Array.isArray(chemin) ? chemin : [];
  if (dep === "kidswear") {
    // Enfants : la colonne Depop des tailles canoniques (grille 101) ou la
    // pointure enfant (grille 104). Pas d'équivalent exact → la canonique
    // part telle quelle et le connecteur DEMANDE (jamais une voisine).
    const k = groupe === "footwear" ? depopPointureEnfant(t) : DEPOP_TAILLE_ENFANT[t];
    return k?.libelle ?? t;
  }
  // (24/10, point 1 — le W sur la grille Depop 62, sujet du 22/10) UN BAS ÉCRIT EN TOUR DE TAILLE. La grille
  // Depop des bas pour un compte en euros (IT : 62 homme, 24 femme) porte les TOURS DE TAILLE en pouces, sans
  // guillemet — « 24 » … « 40 » (homme), « 24 » … « 34 » (femme), créés dans l'ordre, juste après les lettres,
  // exactement comme les « 24" » … « 40" » de la grille britannique 58 — puis des tailles EU paires ajoutées plus
  // tard (42 … 56 homme, 36 … 48 femme). Un W de cette plage est donc le MÊME nombre, dans le MÊME système :
  // « W33 », « 33/34 », « W33 L34 », « W33 | FR 42 » → « 33 ». Une traduction, jamais une conversion. Au-delà
  // (W42 homme, W36 femme…), le nombre existe aussi comme taille EU : on ne tranche pas, le connecteur demande.
  if (groupe === "bottoms" && (dep === "menswear" || dep === "womenswear")) {
    const max = dep === "menswear" ? 40 : 34;
    // Les morceaux d'une étiquette composite (« W33 | FR 42 ») — jamais coupée sur « / » (« 33/34 » est UN tour).
    const morceaux = [t, ...t.split(/\s*[|·•]\s*|\s+[-–—]\s+/)].map((x) => x.trim()).filter(Boolean);
    const ws = [...new Set(morceaux.map((x) => lireTourDeTaille(x)?.w).filter((w) => Number.isFinite(w)))];
    if (ws.length === 1 && ws[0] >= 24 && ws[0] <= max) return String(ws[0]);
  }
  // Adultes : la valeur de la fiche ; le connecteur la traduit dans la grille
  // EXACTE de la feuille (règle actuelle de _shared/tailles.js : « EU 42 » →
  // « EUR 42 »), et demande hors grille.
  return t;
}

/**
 * Les champs Depop d'un job, depuis la fiche (pur).
 * @param {{ icon: string, genre: string, pf: object }} arg
 *   pf = les champs de la copie Depop (etat, taille, genre, marque, couleur, depopPort…).
 * @returns {{ champs: object, manques: string[] }} — `manques` = ce que la
 *   personne devra dire (« rayon » : la carte « rayon à choisir » ; le reste :
 *   les questions du connecteur).
 */
export function champsDepop({ icon, genre, pf = {}, rayonParMoteur = false, categorieId = null }) {
  const champs = {};
  const manques = [];
  // (11/10) `rayonParMoteur` : le rayon vient du MOTEUR (_shared/depop-rayon.js :
  // l'IA tranche dans les feuilles officielles, les garde-fous jugent) — jamais
  // de la table icône → rayon, qui faisait d'un « Short de basket » des
  // baskets. Sans identifiant rendu par le moteur : aucun rayon, la question.
  const cat = rayonParMoteur ? categorieDepuisId(categorieId, genre) : getDepopCategory(icon, genre);
  const chemin = cat ? [cat.departement, cat.groupe, cat.type_produit] : null;
  if (chemin) {
    champs.depopCategoryPath = chemin;
    champs.depopCategoryId = cat.cle;
    if (cat.genre_enfant) champs.depopGenre = cat.genre_enfant;
    else if (cat.genre_a_demander) manques.push("genre_enfant");
  } else manques.push("rayon");
  const etat = depopEtat(pf.etat, cat?.type_produit ?? null);
  if (etat.id) champs.depopEtat = etat.id;
  // Beauté d'occasion : l'état VRAI part, et le connecteur refuse pour de bon
  // en le disant (Depop n'accepte que « Nouveau ») — jamais embelli ici.
  else if (etat.refus === "etat_neuf_seulement" && etat.palier) champs.depopEtat = DEPOP_ETAT_PAR_PALIER[etat.palier];
  else manques.push("etat");
  const couleurs = depopCouleurs(pf.couleur);
  if (couleurs.ids.length) champs.depopCouleurs = couleurs.ids;
  const t = tailleDepop(pf.taille, chemin);
  if (t) champs.depopTaille = t;
  champs.depopMarque = depopMarqueAbsente(pf.marque) ? "Sans marque" : String(pf.marque).trim();
  const port = String(pf.depopPort ?? "").trim().replace(",", ".");
  if (port !== "" && Number.isFinite(Number(port)) && Number(port) >= 0 && Number(port) < 100) champs.depopPort = Math.round(Number(port) * 100) / 100;
  else manques.push("port");
  return { champs, manques };
}

/** La catégorie (même forme que getDepopCategory) d'un identifiant rendu par le
 *  moteur ; le genre enfant vient du genre de la fiche, sinon il se demande. */
function categorieDepuisId(id, genre) {
  const chemin = cheminDepopDepuisId(id);
  if (!chemin) return null;
  const [departement, groupe, type_produit] = chemin;
  const enfant = departement === "kidswear";
  const genre_enfant = enfant ? (DEPOP_GENRE_ENFANT[genre] ?? null) : null;
  return { departement, groupe, type_produit, cle: chemin.join("/"), genre_enfant, genre_a_demander: enfant && !genre_enfant };
}

/**
 * (11/10) Pose sur les champs d'un job Depop le rayon `id` et ce qui en dépend
 * (taille enfant, genre enfant, état de la beauté) — pour le serveur
 * (handler-watch : rayon recalculé avant tout départ ; get-pending-jobs :
 * réponse à la question « Rayon Depop ») comme pour l'app. Pur : rend une copie.
 * @param {object} pf  les platform_fields du job
 * @param {string} id  « département/groupe/type »
 * @param {{ source: 'ia'|'personne', trace?: object|null, par: string }} o
 */
export function appliquerRayonDepop(pf, id, { source, trace = null, par }) {
  const chemin = cheminDepopDepuisId(id);
  if (!chemin) return null;
  const sortie = { ...(pf ?? {}) };
  const cat = categorieDepuisId(id, sortie.genre ?? "");
  sortie.depopCategoryPath = chemin;
  sortie.depopCategoryId = chemin.join("/");
  sortie.depopCategoryLibelles = libellesRayonDepop(id) ?? chemin;
  if (cat?.genre_enfant) sortie.depopGenre = cat.genre_enfant;
  else if (chemin[0] !== "kidswear") delete sortie.depopGenre;
  const t = tailleDepop(sortie.taille, chemin);
  if (t) sortie.depopTaille = t;
  if (sortie.etat) {
    const etat = depopEtat(sortie.etat, chemin[2]);
    if (etat.id) sortie.depopEtat = etat.id;
    else if (etat.refus === "etat_neuf_seulement" && etat.palier) sortie.depopEtat = DEPOP_ETAT_PAR_PALIER[etat.palier];
  }
  if (source === "personne") {
    sortie.categorie_source = "choix_humain";
    sortie.categorie_choisie = { chemin: sortie.depopCategoryLibelles, id: sortie.depopCategoryId, le: new Date().toISOString() };
    sortie.depop_rayon = { version: VERSION_RAYON_DEPOP, le: new Date().toISOString(), par, id: sortie.depopCategoryId, source: "personne" };
  } else {
    sortie.categorie_source = SOURCE_RAYON_DEPOP;
    sortie.depop_rayon = trace ?? { version: VERSION_RAYON_DEPOP, le: new Date().toISOString(), par, id: sortie.depopCategoryId, source };
  }
  if (sortie.needsUserField?.field_key === CLE_QUESTION_RAYON_DEPOP) delete sortie.needsUserField;
  delete sortie.rayon_a_choisir;
  return sortie;
}

/** Le chemin [département, groupe, type] d'un identifiant « d/g/t » (ou null). */
export function cheminDepopDepuisId(id) {
  const parts = String(id ?? "").split("/");
  return parts.length === 3 && parts.every((p) => /^[a-z0-9-]+$/.test(p)) ? parts : null;
}
