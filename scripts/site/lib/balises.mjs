// Balises communes app ↔ site vitrine (09/10/2026, revues A I6 et C I4).
//
// Les balises de mesure (GTM, gtag Google Ads AW-16622098460, Vercel Insights,
// noscript GTM) vivent dans index.html, entre des commentaires-marqueurs
// `<!-- site:balises:<nom>:debut … -->` / `<!-- site:balises:<nom>:fin -->`.
// index.html reste la SOURCE : c'est lui que le natif et l'OTA embarquent,
// tel quel (ils ne montrent aucun bandeau).
//
// SOUS CONSENTEMENT sur le web (09/10, chantier SEO, risque CNIL) : dans un
// build Vercel, les pages vitrine ET app-shell.html ne portent plus les blocs
// gtm / gtag-aw / gtm-noscript tels quels, mais UN bloc « consentement » : le
// script en ligne site/js/balises-consentement.js, qui ne charge GTM et gtag
// AW qu'après l'accord (mode consentement de Google v2, refusé par défaut).
// Les identifiants sont LUS dans les blocs d'index.html : un conteneur changé
// là suit partout. Le bloc « insights » (Vercel Web Analytics : sans cookie,
// sur notre domaine) est recopié tel quel.
// Un bloc absent ou en double fait échouer le build : jamais une page
// vitrine partie sans ses balises (les conversions chuteraient sans
// qu'aucun code ne soit en erreur, revue A I6).
import path from 'node:path';

export const BLOCS_BALISES = ['gtm', 'insights', 'gtag-aw', 'gtm-noscript'];
// Les blocs d'une page vitrine et d'app-shell.html (build Vercel).
export const BLOCS_PAGE = ['consentement', 'insights'];

const reBloc = (nom) => new RegExp(
  `<!--\\s*site:balises:${nom}:debut[\\s\\S]*?-->([\\s\\S]*?)<!--\\s*site:balises:${nom}:fin\\s*-->`, 'g',
);
// Le bloc ENTIER, marqueurs et ligne compris (pour le remplacer ou le retirer).
const reBlocComplet = (nom) => new RegExp(
  `[ \\t]*<!--\\s*site:balises:${nom}:debut[\\s\\S]*?<!--\\s*site:balises:${nom}:fin\\s*-->[ \\t]*\\r?\\n?`, 'g',
);
// Tous les blocs, quel que soit leur nom.
export const RE_TOUS_BLOCS = /<!--\s*site:balises:([\w-]+):debut[\s\S]*?<!--\s*site:balises:\1:fin\s*-->/g;

/** Retire les commentaires HTML et les fins de ligne Windows, garde le reste. */
export function nettoyerBloc(contenu) {
  return String(contenu).replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim()).join('\n');
}

/** Forme de comparaison : espaces fusionnés (l'indentation ne compte pas). */
export const formeComparable = (contenu) => nettoyerBloc(contenu).replace(/\s+/g, ' ').trim();

/**
 * Les blocs `noms` de `html` (index.html : BLOCS_BALISES ; app-shell.html ou
 * une page vitrine : BLOCS_PAGE), nettoyés. Lève si un bloc manque ou figure
 * deux fois.
 */
export function lireBlocsBalises(html, origine, noms = BLOCS_BALISES) {
  const blocs = {};
  for (const nom of noms) {
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

/** Identifiants GTM et Google Ads, lus dans les blocs d'index.html. */
export function idsBalises(blocs) {
  const gtm = /GTM-[A-Z0-9]+/.exec(blocs.gtm ?? '')?.[0];
  const aw = /AW-\d+/.exec(blocs['gtag-aw'] ?? '')?.[0];
  if (!gtm || !aw) {
    throw new Error(`[site] index.html : identifiant ${gtm ? 'Google Ads (AW-…) introuvable dans le bloc gtag-aw' : 'GTM-… introuvable dans le bloc gtm'}`);
  }
  return { gtm, aw };
}

/** Le script EN LIGNE des balises sous consentement, `<script>…</script>`. */
export async function scriptConsentement(racine, blocs) {
  const { bundler } = await import('./bundles.mjs');
  const { gtm, aw } = idsBalises(blocs);
  const code = await bundler(path.join(racine, 'site', 'js', 'balises-consentement-lancement.js'), {
    racine, define: { __FS_GTM__: gtm, __FS_AW__: aw },
  });
  if (code.includes('</script') || code.includes('<!--')) {
    throw new Error('[site] script des balises sous consentement : « </script » ou « <!-- » dedans, impossible à mettre en ligne');
  }
  return `<script>${code}</script>`;
}

/** Les blocs d'une page vitrine : consentement (script) + insights (d'index.html). */
export function blocsSousConsentement(blocs, script) {
  return { consentement: script, insights: blocs.insights };
}

/**
 * index.html → la coquille WEB : le bloc gtm devient le bloc « consentement »
 * (même place, en tête du <head>), gtag-aw et gtm-noscript sont retirés,
 * tout le reste est intact. Joué par le plugin du site (build Vercel), jamais
 * par les builds natif / OTA.
 */
export function appliquerConsentement(html, script) {
  lireBlocsBalises(html, 'index.html'); // lève si un bloc manque ou est en double
  // Remplacement par FONCTION : le code minifié peut contenir « $' » ou « $& ».
  let sortie = String(html).replace(reBlocComplet('gtm'), () => `${blocEnPage({ consentement: script }, 'consentement')}\n`);
  for (const nom of ['gtag-aw', 'gtm-noscript']) sortie = sortie.replace(reBlocComplet(nom), () => '');
  return sortie;
}

/**
 * index.html → la coquille NATIVE (app iPhone / Android, et l'OTA qui la
 * remplace) — 10/10/2026, Nico : l'app native n'a PAS de bandeau de
 * consentement, elle ne charge donc AUCUNE balise Google. Les blocs gtm,
 * gtag-aw et gtm-noscript sont retirés ; insights (Vercel, sans cookie) et
 * tout le reste sont intacts. Joué par le plugin natif (builds hors site :
 * `npm run build`, natif, OTA), jamais par le build Vercel, qui les met sous
 * consentement (appliquerConsentement).
 */
export function sansBalisesGoogle(html) {
  lireBlocsBalises(html, 'index.html'); // lève si un bloc manque ou est en double
  let sortie = String(html);
  for (const nom of ['gtm', 'gtag-aw', 'gtm-noscript']) sortie = sortie.replace(reBlocComplet(nom), () => '');
  // La résolution DNS anticipée de Google Tag Manager n'a plus d'objet sans GTM.
  return sortie.replace(/[ \t]*<link rel="dns-prefetch" href="\/\/www\.googletagmanager\.com" ?\/?>[ \t]*\r?\n?/g, '');
}

/**
 * Traceurs tiers HORS du bloc « consentement » (une page vitrine ou
 * app-shell.html) : chaque référence trouvée est une balise qui partirait
 * avant l'accord. Le JSON-LD (profil TikTok de la marque : un lien) et le
 * dns-prefetch (aucune requête HTTP) ne comptent pas.
 */
export function traceursHorsConsentement(html) {
  const reste = String(html)
    .replace(reBlocComplet('consentement'), '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<link rel="dns-prefetch" href="\/\/www\.googletagmanager\.com" ?\/?>/g, '');
  return [...new Set(reste.match(/googletagmanager\.com|google-analytics\.com|googleadservices|doubleclick\.net|gtag\(|connect\.facebook|fbq\(|clarity\.ms|analytics\.tiktok/gi) ?? [])];
}

// Liens d'icônes et de manifeste : même parité (revue C I4, favicons Google du
// 26/07 — une icône absente d'une page = globe gris dans les résultats).
export const RELS_PARTAGES = ['icon', 'apple-touch-icon', 'manifest'];
