import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { contenuPrincipal, texteBrut, balisesOuvrantes, aujourdhuiParis } from './html.mjs';

// Dates HONNÊTES (09/10/2026, revue B I3).
//
// Google ne lit `lastmod` que s'il est « consistently and verifiably
// accurate ». Une date = date du build ferait « changer » toutes les pages à
// chaque push, et Google cesserait de la lire pour tout le site ; une date à
// la main finit oubliée. D'où :
//   · l'EMPREINTE du contenu principal de chaque page (contenuPrincipal : la
//     région <!--fs:contenu--> de la SORTIE, moins la ligne des dates et
//     l'habillage du gabarit) : son TEXTE, la cible de ses liens et ses images
//     (texte alternatif et dimensions) — ce que Google appelle une
//     modification importante. Pas le balisage ni les libellés du gabarit :
//     retoucher une classe, « À lire aussi » ou le sommaire ne « modifie »
//     aucune page (revue de la fondation I-9) ;
//   · un verrou COMMITÉ, site/dates.lock.json : { chemin: { empreinte, maj } } ;
//   · `npm run site:dater` le met à jour (seul geste qui écrit une date) ;
//   · un verrou périmé fait échouer TOUT build local (natif et OTA compris,
//     plugin controleSite) : l'échec arrive avant le push ; sur Vercel, il
//     n'est plus qu'un AVERTISSEMENT (revue de la fondation I-3 : un oubli de
//     site:dater ne doit jamais bloquer le correctif urgent de l'app) ;
//   · une seule valeur partout : texte visible, dateModified, lastmod.
// Le jour (AAAA-MM-JJ, heure de Paris) suffit : c'est une date ISO 8601
// valide, et on ne fabrique pas une heure qu'on ne connaît pas.
//
// Les routes de l'APP (/legal) n'ont PLUS de date (09/10, revue de la
// fondation I-3) : son empreinte suivait le fichier src/pages/Legal.jsx, que
// d'autres terminaux retouchent (22 commits en septembre), et le moindre
// commentaire bloquait le déploiement. Google accepte une URL sans lastmod.

// Écrit avec « / » : c'est aussi le chemin que git show attend, et celui des messages.
export const FICHIER_VERROU = 'site/dates.lock.json';
const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Une date AAAA-MM-JJ qui EXISTE (09/10, revue de la fondation M-1) :
 * « 2026-02-31 » passait Date.parse (le jour déborde en mars) et s'affichait
 * « 3 mars » sous un datetime du 31 février.
 */
export function dateValide(valeur) {
  if (typeof valeur !== 'string' || !FORME_DATE.test(valeur)) return false;
  const d = new Date(`${valeur}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valeur;
}

/** La date est-elle après aujourd'hui (Paris) ? Une date du futur n'est jamais une mise à jour. */
export const dateFuture = (valeur, aujourdhui = aujourdhuiParis()) => valeur > aujourdhui;

/** Empreinte du contenu principal d'une page, depuis son HTML de sortie. */
export function empreinteContenu(html) {
  const brut = contenuPrincipal(html);
  if (brut === null) return null;
  const liens = balisesOuvrantes(brut, 'a').map((a) => `lien ${a.attrs.href ?? ''}`);
  const images = balisesOuvrantes(brut, 'img').map((i) => `image ${i.attrs.alt ?? ''} ${i.attrs.width ?? ''}x${i.attrs.height ?? ''}`);
  const normalise = [texteBrut(brut), ...liens, ...images].join('\n');
  return createHash('sha256').update(normalise).digest('hex').slice(0, 20);
}

/**
 * Le verrou, VALIDÉ : chaque date existe et n'est pas dans le futur (Paris).
 * Une date avancée à la main n'a aucune raison d'exister — site:dater n'écrit
 * que le jour même ou une date déclarée.
 */
export function lireVerrou(racine, { aujourdhui = aujourdhuiParis() } = {}) {
  const f = path.join(racine, FICHIER_VERROU);
  if (!existsSync(f)) return { pages: {} };
  const v = JSON.parse(readFileSync(f, 'utf8'));
  if (!v || typeof v.pages !== 'object') throw new Error(`[site] ${FICHIER_VERROU} illisible (clé « pages » absente)`);
  for (const [chemin, e] of Object.entries(v.pages)) {
    if (!e || typeof e.empreinte !== 'string' || !dateValide(e.maj)) {
      throw new Error(`[site] ${FICHIER_VERROU} : ${chemin} — date « ${e?.maj} » invalide (AAAA-MM-JJ qui existe) ou empreinte absente`);
    }
    if (dateFuture(e.maj, aujourdhui)) {
      throw new Error(`[site] ${FICHIER_VERROU} : ${chemin} — date ${e.maj} dans le futur (aujourd'hui ${aujourdhui}, Paris) : verrou retouché à la main ?`);
    }
  }
  return v;
}

/** Le verrou tel qu'il est dans un commit git (null si git est illisible ou le fichier absent). */
export function verrouAuCommit(racine, reference = 'HEAD') {
  try {
    const texte = execFileSync('git', ['show', `${reference}:${FICHIER_VERROU}`], {
      cwd: racine, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(texte);
  } catch {
    return null;
  }
}

/** La branche courante (null si git ne répond pas ou HEAD détachée). */
export function brancheCourante(racine) {
  try {
    const b = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: racine, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return b && b !== 'HEAD' ? b : null;
  } catch {
    return null;
  }
}
