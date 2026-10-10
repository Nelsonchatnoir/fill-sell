import { esc } from '../../scripts/site/lib/html.mjs';
import { TEXTES } from './textes.mjs';
import { habillage, appelsHeros, pointsCles, etapes, lignesDates, pagesLiees, appelFinal, bandeauDemonstration } from './composants.mjs';
import { scene, bandeauPlateformes, fonctions, video, comparaisonAccueil, cartesTarifs } from './blocs.mjs';

// Gabarit « accueil » (/ et /en) — 09/10/2026, docs/seo/FORMAT-CONTENU.md § 3.
// Ordre : héros (scène : téléphone + fiches), bandeau des plateformes en texte,
// l'essentiel en 10 secondes, parcours en étapes (section sombre), cartes de
// fonctions, vidéo, texte de référence (le corps) — la comparaison courte
// est sortie de l'accueil le 10/10 (Nico) : elle vit sur le comparatif —,
// tarifs, FAQ (le corps), pages liées, appel final.
// Les CTA sont de VRAIS liens (data-cta : site.js pousse cta_click avant de
// naviguer). Aucun fil d'Ariane (c'est la racine), aucun masquage par défaut.

/** Le h1 en temps : une phrase par ligne, la dernière en couleur (signature de la marque),
 *  sous le reflet animé de l'ancienne accueil (2441cab, fsShimmer). */
export function titreEnTemps(h1) {
  const phrases = h1.match(/[^.!?]+[.!?]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [h1];
  if (phrases.length < 2) return esc(h1);
  return phrases.map((x, i) => (i === phrases.length - 1
    ? `<span class="temps temps-fin"><span class="reflet">${esc(x)}</span></span>`
    : `<span class="temps">${esc(x)}</span>`)).join(' ');
}

// Reflet des h2 de l'accueil — l'animation de TEXTE de l'ancienne accueil
// (2441cab, LandingPage.jsx) : la fin de chaque titre de section passe sous un
// dégradé teal qui balaie le texte (4,5 s). Le texte reste tel quel dans le
// HTML (un <span> de plus, rien d'autre) ; l'empreinte des dates ne lit que le
// texte. Fin du titre : après sa dernière virgule, sinon la fin nommée
// ci-dessous (titres du gabarit, textes.mjs). Questions, FAQ, « À lire
// aussi » : sans reflet, comme avant.
const FINS_REFLET = {
  fr: { 'etapes-titre': 'se passe', 'fonctions-titre': 'vendre plus vite', 'video-titre': 'en action', 'tarifs-titre': 'chaque rythme', 'appel-titre': 'vu partout.' },
  en: { 'etapes-titre': 'it goes', 'fonctions-titre': 'sell faster', 'video-titre': 'in action', 'tarifs-titre': 'every pace', 'appel-titre': 'seen everywhere.' },
};
export function refletsTitres(html, lang) {
  return html.replace(/<h2 id="([^"]+)">([^<]+)<\/h2>/g, (tout, id, texte) => {
    const nommee = FINS_REFLET[lang]?.[id];
    let i = nommee && texte.endsWith(nommee) ? texte.length - nommee.length : -1;
    if (i < 0 && !nommee) {
      const v = texte.lastIndexOf(', ');
      if (v > 0) i = v + 2;
    }
    if (i <= 0) return tout;
    return `<h2 id="${id}">${texte.slice(0, i)}<span class="reflet">${texte.slice(i)}</span></h2>`;
  });
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
  return refletsTitres(`<div class="accueil">
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
</div>`, page.lang);
}
