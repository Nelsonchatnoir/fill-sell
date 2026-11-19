// (19/11/2026, point 6 de Nico) LES DEUX SEULS PASSAGES CHANGÉS DU MAIL DE VENTE : l'OBJET (« Vente <Plateforme> — N
// article(s) vendu(s) 🎉 », repris dans le titre du gabarit) et la PHRASE D'OUVERTURE (« … sur <Plateforme> : »).
// Pour qu'un verrou d'avant le 19/11 compare encore un mail de vente « à l'octet » à son gabarit de référence, on remet
// dans le rendu d'aujourd'hui l'objet et la phrase d'ouverture de la référence — et RIEN d'autre : tout le reste du mail
// (lignes, plateformes des lignes, boutons, pied, lien de désinscription) doit rester identique à l'octet.
const echapper = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const ouverture = (html) => {
  const i = String(html).search(/Bonne nouvelle|Good news/);
  return i < 0 ? null : html.slice(i, html.indexOf('<', i));
};
// (19/11/2026 après-midi, ordre de Nico) Chaque ligne d'une vente porte le LOGO de sa plateforme suivi de son NOM en gras
// (plateformeEnLigne, _shared/email-template.ts). Pour comparer un mail d'aujourd'hui à une référence d'avant, on remet le
// nom seul, tel qu'il s'écrivait — et RIEN d'autre : un logo dont l'alt n'est pas le nom écrit à côté reste en place (et
// la comparaison casse). Sans logo (rendu d'avant, « ailleurs ») : inchangé. Verrou selftest:mail-vente-logo-plateforme.
const RE_LOGO_VENTE = /(<img [^>]*class="fs-logo-vente"[^>]*>)&nbsp;<strong style="font-weight:700; color:#0D0D0D;">([^<]*)<\/strong>/g;
/** Le HTML d'un mail de vente sans les logos de ses lignes (le nom de la plateforme seul, comme avant). */
export function sansLogosDesVentes(html) {
  return String(html).replace(RE_LOGO_VENTE, (tout, img, nom) => (img.match(/ alt="([^"]*)"/)?.[1] === nom ? nom : tout));
}
/** Le rendu `apres` avec l'objet et la phrase d'ouverture de `avant` ({ sujet, html } tous deux) — et les logos des
 *  lignes mis à part (sansLogosDesVentes). */
export function avecObjetEtOuvertureDe(apres, avant) {
  let html = sansLogosDesVentes(apres.html).split(echapper(apres.sujet)).join(echapper(avant.sujet));
  const a = ouverture(html), b = ouverture(avant.html);
  if (a != null && b != null) html = html.replace(a, b);
  return { sujet: avant.sujet, html };
}
/** Le format stable de l'objet (le verrou du 19/11 l'impose à chaque plateforme). */
export const OBJET_VENTE_RE = /^(Vente (.+) — \d+ articles? vendus? 🎉|Sale (.+) — \d+ items? sold 🎉)$/;
