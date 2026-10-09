import { esc } from '../../scripts/site/lib/html.mjs';
import { TEXTES } from './textes.mjs';
import { habillage, filAriane, lignesDates, sommaire, appelFinal } from './composants.mjs';

// Gabarit « article » du blog (09/10/2026). Les articles viennent de
// src/blog/*.md, partagés avec la SPA : mêmes URL (/blog/<slug>), même texte.
// Signature « Équipe FillSell » — jamais un auteur inventé (revue B I6).
// Sommaire cliquable des h2 (collant sur ordinateur), dates de publication et
// de mise à jour visibles. Vouvoiement (le blog français l'emploie).
export function article({ site, page, corps }) {
  const t = TEXTES[page.lang];
  const avecSommaire = sommaire(corps.titres, t);
  return `<div class="page-contenu page-article">
<!--fs:contenu:debut-->
<section class="tete tete-article">
<div class="cadre">
${habillage(filAriane(page, t))}
<div class="tete-texte">
<p class="surtitre">${habillage(esc(t.blog.nom))}</p><h1>${esc(page.h1)}</h1>
<p class="chapo">${esc(page.chapo)}</p>
${lignesDates(page, t, { publie: true })}
</div>
</div>
</section>
<div class="cadre corps-page">
<div class="lecture${avecSommaire ? ' avec-sommaire' : ''}">
${avecSommaire}
<div class="prose">
${corps.html}
</div>
</div>
</div>
<!--fs:contenu:fin-->
${appelFinal(site, page, 'blog')}
</div>`;
}
