import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Cartes de partage (Open Graph / Twitter) du site vitrine (09/10/2026).
//
// Une carte 1200×630 par page et par langue, rendue en LOCAL par
// `npm run site:og` (Playwright, Chrome du poste) depuis un gabarit HTML aux
// couleurs du site, écrite dans site/medias/og/<langue>/<id>.(png|jpg) et
// COMMITÉE avec son manifeste (site/medias/og/manifeste.json). Le build ne
// fait que la publier (/assets/site/…, nom à empreinte) et la poser en
// og:image / twitter:image : aucun navigateur sur le chemin de Vercel.
//
// L'EMPREINTE d'une carte = ce qu'elle affiche (titre, surtitre, plateformes,
// langue, version du gabarit). Une page dont le titre change sans nouvelle
// carte : build local ROUGE (« npm run site:og »), simple avertissement sur
// Vercel (la carte de l'accueil de la langue sert alors de repli).

export const DOSSIER_OG = path.join('site', 'medias', 'og');
export const VERSION_GABARIT_OG = 3;

/** Ce que la carte d'une page affiche. */
export function entreeOg({ id, lang, titre, surtitre, plateformes }) {
  const donnees = { id, lang, titre, surtitre: surtitre ?? '', plateformes, v: VERSION_GABARIT_OG };
  return { ...donnees, cle: `${lang}/${id}`, empreinte: createHash('sha256').update(JSON.stringify(donnees)).digest('hex').slice(0, 16) };
}

/** Le manifeste des cartes ({ cartes: { "<lang>/<id>": { fichier, empreinte, octets } } }). */
export function lireManifesteOg(racine) {
  const f = path.join(racine, DOSSIER_OG, 'manifeste.json');
  if (!existsSync(f)) return { cartes: {} };
  return JSON.parse(readFileSync(f, 'utf8'));
}
