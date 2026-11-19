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
/** Le rendu `apres` avec l'objet et la phrase d'ouverture de `avant` ({ sujet, html } tous deux). */
export function avecObjetEtOuvertureDe(apres, avant) {
  let html = String(apres.html).split(echapper(apres.sujet)).join(echapper(avant.sujet));
  const a = ouverture(html), b = ouverture(avant.html);
  if (a != null && b != null) html = html.replace(a, b);
  return { sujet: avant.sujet, html };
}
/** Le format stable de l'objet (le verrou du 19/11 l'impose à chaque plateforme). */
export const OBJET_VENTE_RE = /^(Vente (.+) — \d+ articles? vendus? 🎉|Sale (.+) — \d+ items? sold 🎉)$/;
