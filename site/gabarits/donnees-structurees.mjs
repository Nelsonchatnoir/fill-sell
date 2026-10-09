import { ORIGINE } from '../../scripts/site/lib/html.mjs';
import { langue } from '../langues.mjs';
import { TEXTES } from './textes.mjs';

// JSON-LD du site vitrine, UN @graph par page (09/10/2026, architecture § 5,
// revue B M1, docs/seo/FORMAT-CONTENU.md § 3).
//   · « / » : Organization, WebSite et SoftwareApplication — repris d'index.html
//     (mêmes @id #organization, #website, #app, mêmes sameAs : ce sont eux qui
//     distinguent FillSell de fillsell.com), l'application portant ici les
//     OFFRES de site/donnees/tarifs.yml — plus la WebPage ;
//   · /en et les pages « tarifs » : SoftwareApplication (même @id #app) avec
//     les offres, au prix affiché ;
//   · les autres pages RENVOIENT aux entités par @id, jamais une copie qui divergerait ;
//   · BreadcrumbList partout sauf à l'accueil, mêmes étapes que le fil visible ;
//   · Article (guides, trajets, plateformes, fonctions, comparatifs,
//     alternatives, classement), BlogPosting (blog) : auteur « Équipe FillSell »,
//     dates = celles affichées ;
//   · HowTo depuis les étapes VISIBLES (`etapes`), FAQPage depuis la FAQ
//     VISIBLE, DefinedTermSet depuis les termes VISIBLES du glossaire, ItemList
//     depuis le classement affiché, VideoObject là où la vidéo est montrée ;
//   · AUCUNE note ni avis (aggregateRating / review) : interdit de recopier
//     ceux des stores, et site:verifier le refuse.

const ID_ORGANISATION = `${ORIGINE}/#organization`;
const ID_SITE = `${ORIGINE}/#website`;
const ID_APP = `${ORIGINE}/#app`;

/** Base des @id d'une page : l'URL, avec le « / » de la racine. */
const baseId = (page) => (page.chemin === '/' ? `${ORIGINE}/` : page.url);
const inLanguage = (page) => langue(page.lang).hreflang;
const absolue = (u) => (u.startsWith('/') ? ORIGINE + u : u);

const TYPES_ARTICLE = ['guide', 'trajet', 'plateforme', 'fonction', 'comparatif', 'alternative', 'classement'];

function filJsonLd(page) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${baseId(page)}#fil`,
    itemListElement: page.fil.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: e.nom,
      ...(i < page.fil.length - 1 ? { item: e.url } : {}),
    })),
  };
}

function faqJsonLd(page, faq, id) {
  return {
    '@type': 'FAQPage',
    '@id': id,
    url: page.url,
    inLanguage: inLanguage(page),
    mainEntity: faq.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.reponse },
    })),
  };
}

function pageWeb(page, type = 'WebPage') {
  return {
    '@type': type,
    '@id': `${baseId(page)}#page`,
    url: page.url,
    name: page.title,
    description: page.description,
    inLanguage: inLanguage(page),
    isPartOf: { '@id': ID_SITE },
    dateModified: page.maj,
    ...(page.type !== 'accueil' ? { breadcrumb: { '@id': `${baseId(page)}#fil` } } : {}),
  };
}

/** Offres de l'application : un Offer par palier, prix mensuel affiché. */
export function offres(tarifs, lang) {
  return tarifs.paliers.map((p) => ({
    '@type': 'Offer',
    name: `FillSell ${p.nom[lang]}`,
    price: p.prix.toFixed(2),
    priceCurrency: tarifs.devise,
    url: ORIGINE + tarifs.inscription,
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: p.prix.toFixed(2),
      priceCurrency: tarifs.devise,
      billingDuration: 'P1M',
    },
  }));
}

function application(page) {
  return {
    '@type': 'SoftwareApplication',
    '@id': ID_APP,
    name: 'FillSell',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'iOS, Android, Web',
    url: ORIGINE,
    offers: offres(page.tarifs, page.lang),
  };
}

function howTo(page) {
  return {
    '@type': 'HowTo',
    '@id': `${baseId(page)}#howto`,
    name: page.h1,
    description: page.chapo,
    inLanguage: inLanguage(page),
    step: page.etapes.map((e, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: e.titre,
      text: e.texte,
      url: `${page.url}#etape-${i + 1}`,
    })),
  };
}

function videoJsonLd(page) {
  const v = page.video;
  return {
    '@type': 'VideoObject',
    '@id': `${baseId(page)}#video`,
    name: v.titre,
    description: v.description,
    thumbnailUrl: [absolue(v.affiche)],
    contentUrl: absolue(v.sources.find((s) => s.type.startsWith('video/mp4')).url),
    uploadDate: v.miseEnLigne,
    duration: v.duree,
    inLanguage: v.langueVideo,
    width: v.largeur,
    height: v.hauteur,
  };
}

function articleJsonLd(page, type = 'Article') {
  const t = TEXTES[page.lang];
  return {
    '@type': type,
    '@id': `${baseId(page)}#article`,
    headline: page.h1,
    description: page.description,
    ...(page.publie ? { datePublished: page.publie } : {}),
    dateModified: page.maj,
    inLanguage: inLanguage(page),
    mainEntityOfPage: page.url,
    image: page.ogImage,
    isPartOf: { '@id': ID_SITE },
    author: { '@type': 'Organization', name: t.auteur, url: ORIGINE },
    publisher: { '@id': ID_ORGANISATION },
    breadcrumb: { '@id': `${baseId(page)}#fil` },
  };
}

function classementJsonLd(page) {
  const c = page.classementDonnees;
  return {
    '@type': 'ItemList',
    '@id': `${baseId(page)}#classement`,
    name: page.h1,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: c.notes.length,
    itemListElement: c.notes.map((n, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.nom(n.slug),
      url: c.url(n.slug),
    })),
  };
}

function glossaireJsonLd(page, termes) {
  const id = `${baseId(page)}#glossaire`;
  return {
    '@type': 'DefinedTermSet',
    '@id': id,
    name: page.h1,
    inLanguage: inLanguage(page),
    hasDefinedTerm: termes.map((x) => ({
      '@type': 'DefinedTerm',
      '@id': `${page.url}#${x.id}`,
      name: x.terme,
      description: x.definition,
      inDefinedTermSet: { '@id': id },
    })),
  };
}

/** Les nœuds du @graph de la page. `entites` : les trois JSON-LD d'index.html. */
export function grapheJsonLd({ page, corps, entites }) {
  if (page.type === '404') return [];
  const extras = [];
  if (page.etapes?.length) extras.push(howTo(page));
  if (page.video) extras.push(videoJsonLd(page));
  if (page.type === 'accueil') {
    const accueil = { ...pageWeb(page), about: { '@id': ID_APP } };
    if (corps?.faq) extras.push(faqJsonLd(page, corps.faq, `${baseId(page)}#faq`));
    if (page.chemin === '/') {
      // Les entités viennent d'index.html (mêmes @id, logo, sameAs : ce sont eux
      // qui rattachent FillSell à CE site), mais ce qu'elles DISENT suit le texte
      // visible de la page (revue technique C-7) : la description de l'app est
      // le chapô, celle de l'éditeur le résumé du pied, la capture celle du
      // héros — jamais la coquille de l'app (quatre plateformes, vouvoiement, la
      // voix, « revendeurs français », og-image-fillsell.png et ses faux logos).
      // index.html n'est pas touché : c'est la coquille de l'app.
      const app = {
        ...entites.app,
        description: page.chapo,
        screenshot: page.hero?.repli ? absolue(page.hero.repli) : page.ogImage,
        ...(page.tarifs ? { offers: offres(page.tarifs, page.lang) } : {}),
      };
      const organisation = { ...entites.organization, description: TEXTES[page.lang].pied.resume };
      return [organisation, entites.website, app, { ...accueil, publisher: { '@id': ID_ORGANISATION } }, ...extras];
    }
    return [accueil, ...(page.tarifs ? [application(page)] : []), ...extras];
  }
  if (page.type === 'article') {
    const noeuds = [articleJsonLd(page, 'BlogPosting'), filJsonLd(page)];
    if (corps?.faq) noeuds.push(faqJsonLd(page, corps.faq, `${baseId(page)}#faq`));
    return noeuds;
  }
  if (page.type === 'liste') return [pageWeb(page, 'CollectionPage'), filJsonLd(page)];
  if (page.type === 'faq') {
    const noeud = corps?.faq
      ? { ...faqJsonLd(page, corps.faq, `${baseId(page)}#page`), ...pageWeb(page, 'FAQPage'), mainEntity: faqJsonLd(page, corps.faq).mainEntity }
      : pageWeb(page);
    return [noeud, filJsonLd(page), ...extras];
  }
  const noeuds = [pageWeb(page), filJsonLd(page)];
  if (TYPES_ARTICLE.includes(page.type)) noeuds.push(articleJsonLd(page));
  if (page.type === 'tarifs' && page.tarifs) noeuds.push(application(page));
  if (page.type === 'classement' && page.classementDonnees) noeuds.push(classementJsonLd(page));
  if (page.type === 'glossaire' && corps?.termes) noeuds.push(glossaireJsonLd(page, corps.termes));
  if (corps?.faq) noeuds.push(faqJsonLd(page, corps.faq, `${baseId(page)}#faq`));
  return [...noeuds, ...extras];
}
