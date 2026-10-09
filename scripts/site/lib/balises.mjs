// Balises communes app ↔ site vitrine (09/10/2026, revues A I6 et C I4).
//
// Les balises de mesure (GTM, gtag Google Ads AW-16622098460, Vercel Insights,
// noscript GTM) vivent dans index.html, entre des commentaires-marqueurs
// `<!-- site:balises:<nom>:debut … -->` / `<!-- site:balises:<nom>:fin -->`.
// Le générateur les RECOPIE dans chaque page vitrine : une balise ajoutée,
// changée ou retirée dans index.html suit sur tout le site, sans seconde copie
// à tenir. Un bloc absent ou en double fait échouer le build : jamais une page
// vitrine partie sans GTM ni sans la balise Ads (les conversions « signup_* »
// chuteraient sans qu'aucun code ne soit en erreur, revue A I6).
//
// ⚠️ Rien n'est ajouté ni retiré ici. Le gtag AW chargé sans consentement est
// un écart SIGNALÉ à Nico (revue C I3), pas une décision de ce chantier.

export const BLOCS_BALISES = ['gtm', 'insights', 'gtag-aw', 'gtm-noscript'];

const reBloc = (nom) => new RegExp(
  `<!--\\s*site:balises:${nom}:debut[\\s\\S]*?-->([\\s\\S]*?)<!--\\s*site:balises:${nom}:fin\\s*-->`, 'g',
);

/** Retire les commentaires HTML et les fins de ligne Windows, garde le reste. */
export function nettoyerBloc(contenu) {
  return String(contenu).replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim()).join('\n');
}

/** Forme de comparaison : espaces fusionnés (l'indentation ne compte pas). */
export const formeComparable = (contenu) => nettoyerBloc(contenu).replace(/\s+/g, ' ').trim();

/**
 * Les blocs de `html` (index.html, app-shell.html ou une page vitrine),
 * nettoyés. Lève si un bloc manque ou figure deux fois.
 */
export function lireBlocsBalises(html, origine) {
  const blocs = {};
  for (const nom of BLOCS_BALISES) {
    const trouves = [...String(html).matchAll(reBloc(nom))];
    if (trouves.length !== 1) {
      throw new Error(
        `[site] ${origine} : bloc de balises « ${nom} » ${trouves.length ? 'présent ' + trouves.length + ' fois' : 'introuvable'} ` +
        `(marqueurs <!-- site:balises:${nom}:debut --> … <!-- site:balises:${nom}:fin -->). ` +
        'Les pages vitrine ne peuvent pas partir sans les balises de mesure de l\'app.',
      );
    }
    const contenu = nettoyerBloc(trouves[0][1]);
    if (!contenu) throw new Error(`[site] ${origine} : bloc de balises « ${nom} » vide`);
    blocs[nom] = contenu;
  }
  return blocs;
}

/** Le bloc tel qu'il est écrit dans une page vitrine, marqueurs compris. */
export function blocEnPage(blocs, nom) {
  return `<!-- site:balises:${nom}:debut -->\n${blocs[nom]}\n<!-- site:balises:${nom}:fin -->`;
}

// Liens d'icônes et de manifeste : même parité (revue C I4, favicons Google du
// 26/07 — une icône absente d'une page = globe gris dans les résultats).
export const RELS_PARTAGES = ['icon', 'apple-touch-icon', 'manifest'];
