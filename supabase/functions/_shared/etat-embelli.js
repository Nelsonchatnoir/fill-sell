// ═══════════════════════════════════════════════════════════════════════════
// UNE COPIE NE DIT JAMAIS MIEUX QUE LA FICHE (13/11, lot « zéro problème », étape 5 — décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « État jamais embelli » : une copie (le job d'une plateforme, ou la capture d'une annonce Vinted qu'on recrée) dont
// l'état DÉPASSE l'état CONFIRMÉ de la fiche est un embellissement — elle est ramenée à l'état de la fiche ; jamais
// l'inverse (cette règle ne monte rien). Mesuré le 13/11 (lecture seule, 30 jours) : cf. rapport de l'étape 5, agent H.
//   · CONFIRMÉ = l'état de la fiche vient d'une annonce, d'un relevé ou d'un choix de la personne ; jamais l'estimation
//     de la lecture des photos (source « lens ») : une estimation ne fait baisser personne.
//   · Les NIVEAUX du juge unique (etat-correspondance.js), jamais une liste de mots : « État neuf » (Leboncoin, qui ne
//     sépare pas l'étiquette) est compatible avec « Neuf avec étiquette » — une grille plus grossière ne dit pas moins
//     bien, elle dit moins précisément (93 recréations Vinted « Neuf avec étiquette » sur une fiche « État neuf » relevée
//     sur Leboncoin : rien à baisser).
// Pur (Deno + Node + Vite) : scripts/etat-copie-jamais-au-dessus-selftest.mjs.
import { niveauEtat } from "./etat-correspondance.js";

const NEUFS = ["neuf_etiquette", "neuf_sans_etiquette", "neuf"];
const RANG = Object.freeze({ neuf_etiquette: 5, neuf_sans_etiquette: 4, neuf: 4, tres_bon: 3, bon: 2, satisfaisant: 1, pieces: 0 });

/** Les sources d'un état de fiche qui le CONFIRMENT (tout sauf l'estimation de la lecture des photos). */
export function etatDeFicheConfirme(entree) {
  const e = entree && typeof entree === "object" ? entree : null;
  const v = String(e?.v ?? "").trim();
  const source = String(e?.source ?? "").trim();
  return Boolean(v) && Boolean(source) && source !== "lens";
}

/**
 * L'état de la copie dit-il MIEUX que celui de la fiche ? (niveaux du juge unique ; null/inconnu → non)
 * @param {string|null|undefined} etatCopie   le libellé de la copie (n'importe quelle plateforme, n'importe quelle langue connue)
 * @param {string|null|undefined} etatFiche   le libellé de la fiche
 * @param {{plateformeCopie?: string|null, plateformeFiche?: string|null}} [opts]
 */
export function copieAuDessusDeLaFiche(etatCopie, etatFiche, { plateformeCopie = null, plateformeFiche = null } = {}) {
  const nc = niveauEtat(etatCopie, { plateforme: plateformeCopie });
  const nf = niveauEtat(etatFiche, { plateforme: plateformeFiche });
  if (!nc || !nf) return false;
  if (NEUFS.includes(nc) && NEUFS.includes(nf)) return nc === "neuf_etiquette" && nf === "neuf_sans_etiquette";
  return RANG[nc] > RANG[nf];
}
