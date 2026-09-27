// ── LENS : AUTANT DE PHOTOS QUE LE STEPPER, L'IA N'EN LIT QUE CINQ (2026-09-27)
//
// Lens bloquait à 5 photos : l'utilisateur ajoutait les autres après coup,
// dans le stepper. Le viseur en accepte désormais autant que le stepper
// (MAX_PHOTOS), mais deux listes voyagent dans la requête :
//   · `urls`         — les photos que l'IA LIT. L'app en envoie cinq au plus
//                      (LENS_PHOTOS_LUES) : le coût d'une analyse et le quota
//                      ne bougent pas ;
//   · `photos_fiche` — TOUTES les photos du viseur, dans l'ordre choisi. C'est
//                      ce que la fiche garde (inventaire.photos,
//                      fiches_annonce.fiche.photos) et ce que la reprise d'un
//                      scan interrompu réaffiche (lens_scans.photos).
//
// Module sans dépendance Deno : rejoué par Node
// (scripts/lens-photos-fiche-selftest.mjs).

import { MAX_PHOTOS } from "../../../src/utils/photos.js";

/**
 * Les photos que la fiche garde.
 * @param {unknown}  brut `photos_fiche` tel que reçu
 * @param {string[]} lues les photos lues par l'IA (`urls`, déjà bornée)
 * @returns {string[]} `brut` s'il est recevable, sinon `lues` — exactement le
 *   comportement d'avant (une app antérieure n'envoie pas `photos_fiche`).
 * Recevable = une liste d'URL https, pas plus longue que le plafond du stepper,
 * qui COMMENCE par les photos lues, dans le même ordre : la fiche ne peut ni
 * perdre une photo lue, ni en réordonner une.
 */
export function photosDeLaFiche(brut, lues) {
  if (!Array.isArray(brut) || !Array.isArray(lues)) return lues;
  if (brut.length < lues.length || brut.length > MAX_PHOTOS) return lues;
  if (!brut.every((u) => typeof u === "string" && u.startsWith("https://"))) return lues;
  if (!lues.every((u, i) => brut[i] === u)) return lues;
  return brut.slice();
}
