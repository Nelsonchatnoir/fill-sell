// Textes du bandeau de consentement publicitaire — SOURCE UNIQUE (09/10/2026).
//
// Lus par le bandeau React (src/components/BandeauConsentement.jsx, pages de
// l'app) ET par celui du site vitrine statique (site/js/site.js, sans React).
// Deux bandeaux pour un même consentement : leurs textes ne doivent jamais
// diverger, sinon la personne n'a pas consenti à la même chose selon la page
// où elle a répondu. Les CLÉS de stockage, elles, vivent dans consentement.js,
// importé par les deux. selftest:site-consentement vérifie les deux points.
//
// Règles de forme (bandeau du 13/09) : refuser aussi simple qu'accepter, pas de
// croix, le lien mène à la politique de confidentialité où le choix se révoque.
// L'anglais ne sert qu'aux pages /en du site vitrine ; l'app garde le français
// (le bandeau React n'a jamais été traduit).
export const TEXTES_CONSENTEMENT = {
  fr: {
    libelle: 'Consentement aux cookies publicitaires',
    texte: "On aimerait mesurer l'efficacité de nos publicités, avec un traceur Meta. Ce n'est pas nécessaire au fonctionnement du site, et tu peux refuser sans rien perdre.",
    lien: 'En savoir plus',
    lienHref: '/legal#confidentialite',
    refuser: 'Refuser',
    accepter: 'Accepter',
  },
  en: {
    libelle: 'Consent to advertising cookies',
    texte: "We'd like to measure how well our ads work, with a Meta tracker. It isn't needed for the site to work, and you can decline without losing anything.",
    // « Learn more » coûtait 8 points de SEO aux pages /en (texte de lien non
    // descriptif, revue technique M-1). L'app n'affiche jamais l'anglais : le
    // build natif ne change que de ces octets, pas de rendu (écart nommé).
    lien: 'Read our privacy policy',
    lienHref: '/legal?lang=en#confidentialite',
    refuser: 'Decline',
    accepter: 'Accept',
  },
};
