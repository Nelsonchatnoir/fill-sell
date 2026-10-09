import { esc } from '../../scripts/site/lib/html.mjs';
import { TEXTES } from './textes.mjs';
import { habillage, filAriane, lignesDates, appelFinal } from './composants.mjs';

// Gabarit « liste » (09/10/2026) : les pivots, aujourd'hui /blog (articles
// français) et /en/blog (articles anglais) — une paire hreflang, et chaque
// article reçoit un lien de sa liste (aucune page orpheline).
// « Lire l'article » est de l'habillage (hors empreinte des dates).
export function liste({ site, page }) {
  const t = TEXTES[page.lang];
  const cartes = page.cartes.map((c) =>
    `<li><a class="carte" href="${esc(c.chemin)}"><strong>${esc(c.titre)}</strong><span>${esc(c.texte)}</span>` +
    `<small><time datetime="${c.date}">${esc(c.dateLisible)}</time>${habillage(`<em>${esc(t.lireArticle)}</em>`)}</small></a></li>`).join('');
  return `<div class="page-contenu">
<!--fs:contenu:debut-->
<section class="tete">
<div class="cadre">
${habillage(filAriane(page, t))}
<div class="tete-texte">
<h1>${esc(page.h1)}</h1>
<p class="chapo">${esc(page.chapo)}</p>
${lignesDates(page, t, { auteur: true })}
</div>
</div>
</section>
<div class="cadre corps-page">
<ul class="cartes-blog">${cartes}</ul>
</div>
<!--fs:contenu:fin-->
${appelFinal(site, page, 'blog')}
</div>`;
}
