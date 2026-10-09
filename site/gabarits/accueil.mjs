import { esc } from '../../scripts/site/lib/html.mjs';
import { TEXTES } from './textes.mjs';
import { habillage, appelsHeros, pointsCles, etapes, lignesDates, pagesLiees, appelFinal, bandeauDemonstration } from './composants.mjs';
import { scene, bandeauPlateformes, fonctions, video, comparaisonAccueil, cartesTarifs } from './blocs.mjs';

// Gabarit « accueil » (/ et /en) — 09/10/2026, docs/seo/FORMAT-CONTENU.md § 3.
// Ordre : héros (scène : téléphone + fiches), bandeau des plateformes en texte,
// l'essentiel en 10 secondes, parcours en étapes (section sombre), cartes de
// fonctions, vidéo, comparaison courte, texte de référence (le corps),
// tarifs, FAQ (le corps), pages liées, appel final.
// Les CTA sont de VRAIS liens (data-cta : site.js pousse cta_click avant de
// naviguer). Aucun fil d'Ariane (c'est la racine), aucun masquage par défaut.

/** Le h1 en temps : une phrase par ligne, la dernière en couleur (signature de la marque). */
export function titreEnTemps(h1) {
  const phrases = h1.match(/[^.!?]+[.!?]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [h1];
  if (phrases.length < 2) return esc(h1);
  return phrases.map((x, i) => `<span class="temps${i === phrases.length - 1 ? ' temps-fin' : ''}">${esc(x)}</span>`).join(' ');
}

/** Sépare le corps en texte de référence et FAQ (au premier titre qui ouvre la FAQ). */
export function separerFaq(html) {
  const i = html.indexOf('<details class="faq-item"');
  if (i < 0) return { avant: html, faq: '' };
  const titre = html.lastIndexOf('<h2', i);
  const coupe = titre >= 0 ? titre : i;
  return { avant: html.slice(0, coupe), faq: html.slice(coupe) };
}

export function accueil({ site, page, corps }) {
  const t = TEXTES[page.lang];
  const { avant, faq } = separerFaq(corps.html);
  const surtitre = page.surtitre ? `<p class="surtitre">${esc(page.surtitre)}</p>` : '';
  return `<div class="accueil">
<!--fs:contenu:debut-->
<section class="heros heros-accueil">
<div class="cadre heros-grille">
<div class="heros-texte">
${surtitre}<h1>${titreEnTemps(page.h1)}</h1>
<p class="chapo">${esc(page.chapo)}</p>
${appelsHeros(site, page, 'hero')}
${lignesDates(page, t, { auteur: false })}
${bandeauDemonstration(page, t)}
</div>
${page.hero ? scene(site, page) : ''}
</div>
</section>
${bandeauPlateformes(site, page)}
${page.points_cles ? `<div class="cadre">${pointsCles(page)}</div>` : ''}
${etapes(site, page, { sombre: true })}
${fonctions(site, page)}
${video(site, page)}
${comparaisonAccueil(site, page)}
${avant.trim() ? `<section class="bloc-texte"><div class="cadre"><div class="prose">${avant}</div></div></section>` : ''}
${page.tarifs ? habillage(cartesTarifs(site, page)) : ''}
${faq ? `<section class="bloc-faq"><div class="cadre"><div class="prose">${faq}</div></div></section>` : ''}
${page.liees?.length ? `<div class="cadre">${pagesLiees(page.liees, t)}</div>` : ''}
<!--fs:contenu:fin-->
${appelFinal(site, page, 'accueil')}
</div>`;
}
