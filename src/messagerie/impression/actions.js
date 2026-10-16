// Les boutons d'action d'un bordereau selon l'appareil (bêta, 16/10/2026).
import { voies } from './partage';

/**
 * Les boutons et la ligne d'aide, selon ce que l'appareil sait faire
 * (partage.voies) et le format. Sur téléphone, partager et imprimer passent
 * par la MÊME feuille (ou le même aperçu) : un seul bouton, jamais deux qui
 * font la même chose. Sur ordinateur : « Télécharger » et « Imprimer ».
 *   {unique: true,  principal}            — un bouton (action 'partager') ;
 *   {unique: false, principal, second}    — 'telecharger' puis 'imprimer'.
 */
export function libellesActions(f, format, lang = 'fr') {
  const fr = lang !== 'en';
  const v = voies(f);
  const papier = format === '10x15'
    ? (fr ? 'papier 100 × 150 mm, échelle 100 %' : '100 × 150 mm paper, 100 % scale')
    : format === 'code' ? (fr ? 'échelle 100 %' : '100 % scale')
      : (fr ? 'papier A4, échelle 100 %' : 'A4 paper, 100 % scale');
  if (v.partager === 'depot') {
    const android = v.env.plateforme === 'android';
    return {
      unique: true, voies: v,
      principal: fr ? 'Ouvrir pour partager ou imprimer' : 'Open to share or print',
      aide: android
        ? (fr ? `Le bordereau s’ouvre dans Chrome : choisis « Partager » ou « Imprimer », ou l’app de ton imprimante d’étiquettes. À l’impression : ${papier}.` : `The label opens in Chrome: pick “Share” or “Print”, or your label printer’s app. When printing: ${papier}.`)
        : (fr ? `Le bordereau s’ouvre dans l’aperçu : son bouton de partage propose « Imprimer » et l’app de ton imprimante d’étiquettes. À l’impression : ${papier}.` : `The label opens in the viewer: its share button offers “Print” and your label printer’s app. When printing: ${papier}.`),
    };
  }
  if (v.partager === 'partage') {
    return {
      unique: true, voies: v,
      principal: fr ? 'Partager ou imprimer' : 'Share or print',
      aide: fr ? `La feuille de partage propose « Imprimer », « Enregistrer dans Fichiers » et l’app de ton imprimante d’étiquettes. À l’impression : ${papier}.` : `The share sheet offers “Print”, “Save to Files” and your label printer’s app. When printing: ${papier}.`,
    };
  }
  return {
    unique: false, voies: v,
    principal: fr ? 'Télécharger' : 'Download',
    second: fr ? 'Imprimer' : 'Print',
    aide: fr ? `À l’impression : ${papier}.` : `When printing: ${papier}.`,
  };
}
