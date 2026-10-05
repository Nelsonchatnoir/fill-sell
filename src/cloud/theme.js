// ═══════════════════════════════════════════════════════════════════════════
// L'OPTION « SANS ORDINATEUR » — JETONS VISUELS (04/10/2026, conception)
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ AUCUNE PALETTE NEUVE. `C` est la palette de la feuille des formules
//    (components/ConversionModal.jsx), recopiée À L'IDENTIQUE — pas importée,
//    parce que ConversionModal importe les composants Cloud (un import croisé
//    tiendrait, mais se casserait au premier usage hors rendu). L'égalité des
//    deux est VÉRIFIÉE par scripts/cloud-ecrans-selftest.mjs : une teinte qui
//    bouge d'un côté fait tomber le test.
// ⛔ CONTRASTE : tout TEXTE passe 4,5:1 sur son fond. `mute` (#8A8578) et
//    `faint` (#A39D8E) ne passent pas (3,06:1 sur le canvas) : réservés aux
//    traits et aux pictos, jamais à une phrase. Le gris des phrases est
//    `mute2` (#5C6560 : 4,94:1 sur le canvas, 5,5:1 sur paper).
export const C = {
  canvas: '#EDEAE0',
  paper:  '#F6F5F1',
  ink:    '#10201B',
  teal:   '#2F9E90',
  tealDeep: '#1B6E62',
  amber:  '#E8956D',
  amberInk: '#C2410C',
  mute:   '#8A8578',
  mute2:  '#5C6560',
  faint:  '#A39D8E',
  border: '#E7E3D8',
};

// Les deux tons ajoutés existent DÉJÀ dans l'app : le fond menthe de l'encart
// « republications offertes » (ConversionModal) et le blanc des cartes (UI.card).
export const MENTHE = '#E8F5F3';
export const BLANC = '#FFFFFF';
// ⛔ LE BOUTON PLEIN : la MOITIÉ PROFONDE du dégradé de l'app. Le dégradé
//    habituel (teal #2F9E90 → tealDeep) ne donne que 3,27:1 au blanc sur son
//    bout clair (4,4:1 au centre) — sous le seuil de 4,5:1 exigé du texte,
//    mesuré par scripts/apercu/capture-cloud.mjs. Partir de tealDeep : 6,1:1
//    au pire. Même teinte, un cran plus sombre.
export const DEGRADE_TEAL = `linear-gradient(120deg,${C.tealDeep},#124C43)`;
export const POLICE = "'Space Grotesk', sans-serif";
