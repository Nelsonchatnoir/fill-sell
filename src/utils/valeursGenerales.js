// ═══════════════════════════════════════════════════════════════════════════
// VALEUR GÉNÉRALE + EXCEPTION PAR PLATEFORME (2026-09-21, demande de XEWER)
// ═══════════════════════════════════════════════════════════════════════════
// « Je veux, comme pour le prix : Titre général, Description générale, État
//  général, appliqués à toutes les plateformes, avec exception possible au
//  crayon. Pour l'état, que FillSell traduise vers l'équivalent de chaque
//  plateforme. » — XEWER, compte Pro, qui refaisait la même modification
//  quatre fois.
//
// CE FICHIER EST LA LOGIQUE, ET RIEN QUE LA LOGIQUE. Aucune JSX, aucun style,
// aucun texte affiché : l'écran sera entièrement redessiné plus tard et cette
// mécanique doit lui survivre telle quelle (consigne « Code rangé pour la
// refonte : la logique séparée de l'affichage »).
//
// LE MODÈLE, calqué sur le prix central qui marche depuis le 14/07 :
//   · une VALEUR GÉNÉRALE par champ (titre, description, état) ;
//   · un ensemble de plateformes DISSOCIÉES par champ — celles dont la valeur
//     a été modifiée à part ;
//   · écrire la valeur générale n'écrase QUE les plateformes non dissociées.
//
// ⛔ LA RÈGLE QUI PRIME SUR TOUTES LES AUTRES : « Une valeur modifiée sur une
//    carte n'est JAMAIS écrasée par un changement ultérieur de la valeur
//    générale. » Une seule fonction écrit (`appliquerGenerale`) et elle
//    commence par sauter les dissociées — c'est le seul endroit à relire.
// ⛔ ZÉRO FRICTION : rien ici n'exige un geste. Une valeur générale déduite de
//    ce qui existe déjà (`valeurCommune`) suffit à afficher l'écran ; qui ne
//    touche à rien publie exactement comme avant, au même nombre de taps.
// ═══════════════════════════════════════════════════════════════════════════

import { etatPourPlateforme } from "../../supabase/functions/_shared/etat-plateformes.js";
import { conformerTexte } from "./texteConforme.js";

/** Les trois champs qui ont une valeur générale, en plus du prix. */
export const CHAMPS_GENERAUX = Object.freeze(["titre", "description", "etat"]);

/** Un jeu de dissociations vide — une entrée par champ. */
export const dissociationsVides = () =>
  Object.fromEntries(CHAMPS_GENERAUX.map((c) => [c, new Set()]));

/** Sérialisation pour le brouillon sessionStorage (Set → tableau). */
export const serialiserDissociations = (d) =>
  Object.fromEntries(CHAMPS_GENERAUX.map((c) => [c, [...(d?.[c] ?? [])]]));

/** Relecture d'un brouillon (tableau → Set), tolérante à une forme absente. */
export const lireDissociations = (brut) =>
  Object.fromEntries(CHAMPS_GENERAUX.map((c) => [c, new Set(Array.isArray(brut?.[c]) ? brut[c] : [])]));

/** La valeur portée par une copie, pour un champ général. */
export function lireValeur(copie, champ) {
  if (!copie) return "";
  if (champ === "titre") return String(copie.title ?? "");
  if (champ === "description") return String(copie.description ?? "");
  if (champ === "etat") return String(copie.platform_fields?.etat ?? "");
  return "";
}

/** La copie, avec la valeur du champ écrite. Ne touche à RIEN d'autre. */
function ecrireValeur(copie, champ, valeur) {
  const base = copie ?? { title: "", description: "", platform_fields: {}, price: null };
  if (champ === "titre") return { ...base, title: valeur };
  if (champ === "description") return { ...base, description: valeur };
  if (champ === "etat") return { ...base, platform_fields: { ...(base.platform_fields ?? {}), etat: valeur } };
  return base;
}

/**
 * Ce que reçoit UNE plateforme quand la valeur générale vaut `valeur`.
 *
 * · état  → l'équivalent de la plateforme, JAMAIS le meilleur (cf.
 *           `etatPourPlateforme` : la correspondance vit côté serveur, on la
 *           réutilise, on n'en écrit pas une seconde) ;
 * · texte → le même texte, mis en conformité (longueur, suites de symboles).
 *
 * @returns {{valeur: string, notes: string[], signale: string[], meilleur: boolean}}
 */
export function valeurPourPlateforme(champ, valeur, plateforme) {
  const v = String(valeur ?? "");
  if (champ === "etat") {
    const r = etatPourPlateforme(v, plateforme);
    // Pas de correspondance du tout : on ne pose rien plutôt que de poser une
    // valeur inventée — la carte gardera ce qu'elle avait.
    if (!r) return { valeur: v, notes: [], signale: [], meilleur: false };
    return { valeur: r.valeur, notes: [], signale: [], meilleur: r.meilleur };
  }
  const champTexte = champ === "titre" ? "titre" : "description";
  const c = conformerTexte(plateforme, { [champTexte]: v });
  return { valeur: c[champTexte], notes: c.notes, signale: c.signale, meilleur: false };
}

/**
 * Écrit la valeur générale sur toutes les plateformes qui la SUIVENT.
 *
 * ⛔ Les dissociées sont sautées, sans exception : c'est la garde du lot.
 * ⛔ Une plateforme absente d'`edited` n'est pas créée : la génération seule
 *    crée une copie, jamais un champ général.
 *
 * @returns {object} le nouvel `edited`
 */
export function appliquerGenerale(edited, { champ, valeur, plateformes, dissociees, copies = null }) {
  const exceptions = dissociees?.[champ] ?? new Set();
  const suivant = { ...edited };
  // ⛔ UN TITRE GÉNÉRAL VIDE N'EFFACE AUCUNE CARTE (2026-09-25, patrick giry).
  //    Quand les copies divergent, le titre général est vide (cf.
  //    valeurCommune) ; le toucher puis le vider écrivait "" sur les cinq
  //    cartes, et trois jobs sont partis sans titre (Opla, Vinted, eBay). Un
  //    titre général vide veut dire « pas de titre commun » : chaque carte qui
  //    le suivait reprend SA copie rédigée (`copies` = platformListings.
  //    platforms) ; sans copie connue, elle garde ce qu'elle a. Jamais "".
  //    Même chose pour « Rétablir » sous un titre général vide.
  if (champ === "titre" && !String(valeur ?? "").trim()) {
    for (const p of plateformes ?? []) {
      if (exceptions.has(p) || !suivant[p]) continue;
      const sienne = String(copies?.[p]?.title ?? "");
      if (sienne.trim()) suivant[p] = ecrireValeur(suivant[p], "titre", sienne);
    }
    return suivant;
  }
  for (const p of plateformes ?? []) {
    if (exceptions.has(p)) continue;
    if (!suivant[p]) continue;
    const { valeur: v } = valeurPourPlateforme(champ, valeur, p);
    suivant[p] = ecrireValeur(suivant[p], champ, v);
  }
  return suivant;
}

/** Marque une plateforme comme dissociée pour ce champ (rendu d'un nouvel objet). */
export function dissocier(dissociees, champ, plateforme) {
  const s = new Set(dissociees?.[champ] ?? []);
  s.add(plateforme);
  return { ...dissociees, [champ]: s };
}

/** Remet une plateforme sous la valeur générale (le « Rétablir » en un tap). */
export function rattacher(dissociees, champ, plateforme) {
  const s = new Set(dissociees?.[champ] ?? []);
  s.delete(plateforme);
  return { ...dissociees, [champ]: s };
}

/** Une carte suit-elle la valeur générale pour ce champ ? */
export const suitLaGenerale = (dissociees, champ, plateforme) =>
  !(dissociees?.[champ] ?? new Set()).has(plateforme);

/**
 * La valeur générale DÉDUITE des copies existantes, pour l'affichage initial.
 *
 * ⛔ À L'UNANIMITÉ SEULEMENT, et sur les seules plateformes qui suivent — même
 *    doctrine que les champs partagés (Sujet 4, 11/07) : si deux copies
 *    divergent, il n'y a pas de valeur générale, et en inventer une écraserait
 *    l'une des deux au premier rendu.
 * ⛔ Pour l'état, l'unanimité se juge sur le PALIER, pas sur le libellé :
 *    « État moyen » (Beebs) et « État satisfaisant » (Leboncoin) sont le même
 *    état, écrit dans deux vocabulaires.
 */
export function valeurCommune(edited, champ, plateformes, dissociees) {
  const exceptions = dissociees?.[champ] ?? new Set();
  const suiveuses = [...(plateformes ?? [])].filter((p) => edited?.[p] && !exceptions.has(p));
  if (!suiveuses.length) return "";
  if (champ === "etat") {
    const paliers = suiveuses.map((p) => etatPourPlateforme(lireValeur(edited[p], "etat"), p)?.tier ?? null);
    if (paliers.some((t) => !t)) return "";
    if (new Set(paliers).size !== 1) return "";
    // Rendu dans le vocabulaire de référence (celui de Vinted), pas dans celui
    // de la première plateforme croisée : c'est LUI que l'écran propose.
    return etatPourPlateforme(lireValeur(edited[suiveuses[0]], "etat"), "vinted")?.valeur ?? "";
  }
  const valeurs = suiveuses.map((p) => lireValeur(edited[p], champ));
  if (valeurs.some((v) => !v.trim())) return "";
  // Le texte général est celui qu'elles portent toutes. Une copie RACCOURCIE
  // par son plafond (eBay 80) n'est pas une divergence : on compare donc sur
  // la longueur de la plus courte, et on rend la plus LONGUE — c'est elle qui
  // porte le texte entier.
  const plusLongue = valeurs.reduce((a, b) => (b.length > a.length ? b : a), valeurs[0]);
  const memeTexte = valeurs.every((v) => plusLongue.startsWith(v.replace(/…$/, "")) || v === plusLongue);
  return memeTexte ? plusLongue : "";
}

/**
 * Les écarts de conformité d'une carte, pour la mention discrète.
 * Rend `null` quand le texte de la carte part intact.
 */
export function ecartsDeConformite(edited, plateforme, { titreGeneral, descriptionGenerale } = {}) {
  const copie = edited?.[plateforme];
  if (!copie) return null;
  const source = {
    titre: String(titreGeneral ?? "").trim() || String(copie.title ?? ""),
    description: String(descriptionGenerale ?? "").trim() || String(copie.description ?? ""),
  };
  const c = conformerTexte(plateforme, source);
  const notes = [...c.notes, ...c.signale];
  return notes.length ? notes : null;
}
