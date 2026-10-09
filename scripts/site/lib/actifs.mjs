import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Fichiers statiques du site vitrine (09/10/2026, revues A I4 et C I7).
//
// TOUT ce que le site publie (police, images, site.js) vit sous
// /assets/site/, avec un nom à EMPREINTE de contenu :
//   · /assets/ est exclu des rewrites de l'app : un fichier manquant répond
//     un vrai 404, jamais la coquille HTML en 200 (qu'un `nosniff` ferait
//     refuser en silence comme script, et que Cloudflare garderait une heure) ;
//   · nom à empreinte : un fichier retouché change de nom, aucun visiteur ne
//     garde l'ancien. Cache d'UNE HEURE (must-revalidate), comme l'app, et non
//     `immutable` d'un an (09/10, revue de la fondation I-8) : si Vercel pose
//     l'en-tête de vercel.json sur un 404 — ce que l'incident du 01/10 laisse
//     penser (Cloudflare a gardé le 404 de l'entrée exactement le max-age de
//     la règle) —, un 404 pris pendant une bascule serait gardé jusqu'au
//     prochain changement d'empreinte. Une heure borne le dégât. Retour à
//     `immutable` seulement après la preuve sur la prévisualisation (curl -sI
//     d'un /assets/site/absent.js : aucun Cache-Control long sur le 404).
// Jamais d'écriture hors du dossier de sortie.

export const PREFIXE = '/assets/site/';

export function empreinteOctets(octets) {
  return createHash('sha256').update(octets).digest('hex').slice(0, 10);
}

// Empreinte d'une SOURCE (médias) : un SVG est du texte, et un poste Windows en
// core.autocrlf le sert en CRLF quand Vercel le lit en LF — sans cette
// normalisation, le build de Vercel croirait la source modifiée.
export function empreinteSource(fichier, octets) {
  if (/\.svg$/i.test(fichier)) return empreinteOctets(Buffer.from(octets.toString('utf8').replace(/\r\n/g, '\n')));
  return empreinteOctets(octets);
}

export function creerActifs(dossierSortie) {
  const cible = path.join(dossierSortie, 'assets', 'site');
  const publies = new Map(); // nom à empreinte → url
  let pret = null;
  const preparer = () => (pret ??= mkdir(cible, { recursive: true }));

  async function publierOctets(nom, octets) {
    await preparer();
    const ext = path.extname(nom);
    const base = path.basename(nom, ext);
    const final = `${base}.${empreinteOctets(octets)}${ext}`;
    if (!publies.has(final)) {
      await writeFile(path.join(cible, final), octets);
      publies.set(final, PREFIXE + final);
    }
    return PREFIXE + final;
  }

  return {
    publierOctets,
    async publierFichier(source) {
      return publierOctets(path.basename(source), await readFile(source));
    },
    liste: () => [...publies.values()],
  };
}
