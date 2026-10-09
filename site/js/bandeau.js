// Bandeau de consentement du site vitrine, en HTML natif (09/10/2026).
//
// Même texte, mêmes boutons, même ordre que le bandeau React
// (src/components/BandeauConsentement.jsx) : les textes viennent du MÊME module
// (src/utils/consentementTextes.js). Fonction PURE (une chaîne HTML) : le
// selftest compare son texte à celui que rend le composant React.
// Les styles sont dans site/styles/site.css (aucun style= en ligne) ;
// position fixe en bas : aucun décalage de mise en page (CLS), et jamais de
// marge ajoutée au <body> pour lui (revue C M3).

import { ACCEPTE, REFUSE } from '../../src/utils/consentement.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function htmlBandeau(t) {
  return '<div class="consentement" role="dialog" aria-label="' + esc(t.libelle) + '">' +
    '<div class="consentement-corps">' +
    '<p>' + esc(t.texte) + ' <a href="' + esc(t.lienHref) + '">' + esc(t.lien) + '</a></p>' +
    '<div class="consentement-choix">' +
    '<button type="button" class="bouton bouton-second" data-consentement="' + REFUSE + '">' + esc(t.refuser) + '</button>' +
    '<button type="button" class="bouton bouton-premier" data-consentement="' + ACCEPTE + '">' + esc(t.accepter) + '</button>' +
    '</div></div></div>';
}
