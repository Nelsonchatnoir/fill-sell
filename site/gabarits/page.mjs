import { esc } from '../../scripts/site/lib/html.mjs';
import { TEXTES } from './textes.mjs';
import {
  habillage, appelsHeros, pointsCles, etapes, lignesDates, filAriane, sommaire, pagesLiees, appelFinal,
  bandeauDemonstration, capture, etiquettes,
} from './composants.mjs';
import {
  capacites, trajetsDe, blocTrajet, avertissementProduit, tableauComparaison, choisir, methode,
  cartesAlternatives, blocClassement, cartesTarifs, indexGlossaire,
} from './blocs.mjs';

// Gabarit des pages de contenu (09/10/2026, docs/seo/FORMAT-CONTENU.md § 3) :
// guide, trajet, plateforme, fonction, comparatif, alternative, classement,
// tarifs, glossaire, faq. Une même charpente :
//   tête (fil d'Ariane, surtitre, h1, chapô, auteur et dates, étiquettes des
//   plateformes citées, appels, capture dans son cadre) ;
//   l'essentiel en 10 secondes ; les BLOCS DU TYPE, tirés des données ;
//   les étapes (HowTo) ; le corps avec son sommaire (collant sur ordinateur) ;
//   ce qui suit le corps (méthode des comparatifs, trajets d'une plateforme) ;
//   pages liées ; appel final.
// La région fs:contenu est le CONTENU PRINCIPAL : c'est elle, et elle seule,
// qui fait l'empreinte des dates (site/dates.lock.json).

function blocsAvant(site, page) {
  const t = TEXTES[page.lang];
  switch (page.type) {
    case 'plateforme':
      return capacites(page, page.plateformeDonnees);
    case 'trajet':
      return blocTrajet(page);
    case 'comparatif': {
      const c = page.comparatif;
      return avertissementProduit(page) +
        `<section class="bloc-comparatif" aria-labelledby="comparatif-titre"><h2 id="comparatif-titre">${esc(t.comparatifTitre(c.concurrent.nom))}</h2>` +
        tableauComparaison({ outils: c.outils, criteres: c.criteres, lang: page.lang, locale: site.locale(page.lang), legende: t.comparatifTitre(c.concurrent.nom) }) +
        `</section>${choisir(page)}`;
    }
    case 'alternative':
      return avertissementProduit(page) + cartesAlternatives(site, page);
    case 'classement':
      return avertissementProduit(page) + blocClassement(site, page);
    case 'tarifs':
      return cartesTarifs(site, page, { titre: false });
    case 'glossaire':
      return indexGlossaire(page);
    default:
      return '';
  }
}

function blocsApres(site, page) {
  switch (page.type) {
    case 'plateforme':
      return trajetsDe(page, page.plateformeDonnees);
    case 'comparatif':
    case 'alternative':
    case 'classement':
      return methode(site, page, page.dateReleve);
    default:
      return '';
  }
}

export function page({ site, page: p, corps }) {
  const t = TEXTES[p.lang];
  const surtitre = p.surtitre ? `<p class="surtitre">${esc(p.surtitre)}</p>` : '';
  const media = p.hero
    ? capture(p.hero, { url: site.url, alt: p.hero_alt, principale: true, legende: t.captureDemo, cadre: 'tete' })
    : (p.etiquettes?.length ? `<div class="tete-visuel" aria-hidden="true">${etiquettes(p.etiquettes, { classe: 'etiquettes-pile' })}</div>` : '');
  const lieu = p.id.replace(/[^a-z0-9]+/g, '_');
  const avecSommaire = sommaire(corps.titres, t);
  return `<div class="page-contenu">
<!--fs:contenu:debut-->
<section class="tete">
<div class="cadre">
${habillage(filAriane(p, t))}
<div class="tete-grille${media ? ' avec-media' : ''}">
<div class="tete-texte">
${surtitre}<h1>${esc(p.h1)}</h1>
<p class="chapo">${esc(p.chapo)}</p>
${lignesDates(p, t)}
${etiquettes(p.etiquettes)}
${appelsHeros(site, p, lieu)}
${bandeauDemonstration(p, t)}
</div>
${media}
</div>
</div>
</section>
<div class="cadre corps-page">
${pointsCles(p)}
${blocsAvant(site, p)}
</div>
${etapes(site, p)}
<div class="cadre corps-page">
<div class="lecture${avecSommaire ? ' avec-sommaire' : ''}">
${avecSommaire}
<div class="prose">
${p.type === 'glossaire' ? `<h2 class="sr">${esc(t.glossaireDefinitions)}</h2>
` : ''}${corps.html}
</div>
</div>
${blocsApres(site, p)}
${pagesLiees(p.liees, t)}
</div>
<!--fs:contenu:fin-->
${appelFinal(site, p, lieu)}
</div>`;
}
