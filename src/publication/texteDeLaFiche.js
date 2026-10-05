// ═══════════════════════════════════════════════════════════════════════════
// LE TEXTE QUI PART EST CELUI DE LA FICHE, AU MOMENT DE L'ENVOI (04/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Louis (Business), 13 « Rangement … » publiés sur Leboncoin en lot : 6 sont
// partis avec une description de 154 à 223 caractères alors que leur fiche en
// portait 311 à 319. La cause : la copie enregistrée (fiches_annonce) est
// rouverte TELLE QUELLE — texte général compris — et rien ne la comparait à la
// fiche. Ses fiches (relevé Beebs) avaient reçu le texte récent ; la copie
// gardait celui d'avant, et c'est elle qui est partie.
//
// Règle de Nico (04/10) : le texte publié est TOUJOURS celui de la fiche au
// moment de l'envoi, sur toutes les plateformes. Trois gestes, ici décidés :
//   1. RÉOUVERTURE d'une copie enregistrée : la fiche a changé depuis →
//      elle remplace le texte général et TOUTES les cartes (une exception
//      posée sur une carte avant ce changement ne tient plus : elle portait
//      sur l'ancien texte) ;
//   2. ENVOI : la fiche est RELUE en base juste avant la création des jobs
//      (modifiée ailleurs pendant que l'écran était ouvert — un autre
//      appareil, un relevé, le lot préparé plus tôt) → elle remplace le texte
//      des cartes qui suivent le général ; une carte modifiée à la main
//      PENDANT cette publication garde son texte (c'est le geste du moment) ;
//   3. RETOUCHE du texte général dans l'écran (stepper ou lot) : c'est un
//      geste de la personne, il est ÉCRIT SUR LA FICHE (marqueur « manuel »),
//      pour que fiche et annonce disent la même chose — et qu'une réouverture
//      ne le défasse pas.
//
// ⛔ « Le texte de la fiche » = celui du VENDEUR (même liste que l'écran,
//    texteDuVendeurFiche, et que le serveur, generate-listing) : un article
//    venu d'un relevé ou du dressing, ou un texte marqué vinted / manuel /
//    releve_*. Un brouillon Lens ou vocal que personne n'a touché reste NOTRE
//    brouillon : l'IA le rédige, comme avant — il n'est pas imposé.
// Pur, sans React ni réseau (scripts/texte-de-la-fiche-selftest.mjs).

export const CHAMPS_TEXTE = Object.freeze(["titre", "description"]);

const marqueur = (attributs, cle) => {
  const c = attributs && typeof attributs === "object" ? attributs[cle] : null;
  const v = c && typeof c === "object" ? c.v : c;
  return String(v ?? "").trim().toLowerCase();
};

const assezLong = (v) => {
  const t = String(v ?? "").trim();
  return t && t.split(/\s+/).filter(Boolean).length >= 2 ? t : "";
};

/**
 * Le texte de la fiche quand c'est celui du vendeur (sinon "").
 * @param {{titre?:string, description?:string, origine?:string, attributs?:object}|null} ligne
 */
export function texteDuVendeurDe(ligne) {
  if (!ligne) return { titre: "", description: "" };
  const origine = String(ligne.origine ?? "").trim().toLowerCase();
  const venuDeSaPage = origine.startsWith("releve") || origine === "vinted_sync";
  const propre = (cle) => {
    const src = marqueur(ligne.attributs, cle);
    return src === "vinted" || src === "manuel" || src.startsWith("releve");
  };
  return {
    titre: (propre("titre_source") || venuDeSaPage) ? assezLong(ligne.titre) : "",
    description: (propre("description_source") || venuDeSaPage) ? assezLong(ligne.description) : "",
  };
}

const memeTexte = (a, b) => String(a ?? "").replace(/\r\n/g, "\n").trim() === String(b ?? "").replace(/\r\n/g, "\n").trim();

/**
 * Les champs dont le texte doit être repris de la fiche.
 * @param {{titre:string, description:string}} fiche  texteDuVendeurDe(ligne)
 * @param {{titre?:string, description?:string}} generales  le texte général de l'écran
 * @param {Iterable<string>} retouches  champs retouchés à la main pendant CETTE publication
 * @returns {{titre?:string, description?:string}}
 */
export function champsAReprendreDeLaFiche(fiche, generales, retouches = []) {
  const main = new Set(retouches);
  const patch = {};
  for (const champ of CHAMPS_TEXTE) {
    const texte = String(fiche?.[champ] ?? "").trim();
    if (!texte || main.has(champ)) continue;
    if (memeTexte(texte, generales?.[champ])) continue;
    patch[champ] = texte;
  }
  return patch;
}

/** Le correctif à écrire sur la fiche après une retouche à la main (ou null). */
export function retoucheAEcrire(ligne, generales, retouches, at = new Date().toISOString()) {
  const patch = {};
  const attributs = {};
  for (const champ of CHAMPS_TEXTE) {
    if (!new Set(retouches).has(champ)) continue;
    const texte = String(generales?.[champ] ?? "").trim();
    // ⛔ Jamais un texte vide sur la fiche : un champ général vidé veut dire
    //    « chaque carte garde sa copie », pas « effacer la fiche ».
    if (!texte || memeTexte(texte, ligne?.[champ])) continue;
    patch[champ] = texte;
    attributs[`${champ}_source`] = { v: "manuel", source: "manuel", at };
  }
  if (!Object.keys(patch).length) return null;
  return { ...patch, attributs };
}
