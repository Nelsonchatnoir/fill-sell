// ═══════════════════════════════════════════════════════════════════════════
// LES ARTICLES LES PLUS PROCHES D'UNE ANNONCE (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Un CLASSEMENT D'AFFICHAGE, et rien d'autre. Il ne rattache rien, ne décide
// rien, n'écrit rien : il met en haut de liste ce que l'utilisateur a le plus
// de chances de reconnaître, pour lui éviter de chercher.
//
// ⛔ IL NE REMPLACE PAS LE RAPPROCHEMENT AUTOMATIQUE et ne le modifie pas. Ce
//    que le moteur a su trancher n'arrive jamais jusqu'ici (l'annonce est déjà
//    rattachée). Ce qu'il a PROPOSÉ sans trancher (`a.proposition`, faisceau
//    du second tour) passe devant tout le reste, avec son motif : c'est le
//    seul avis qui vient du serveur, on ne le noie pas dans un tri maison.
// ⛔ AUCUN SEUIL NE CACHE UN ARTICLE. La recherche libre voit tout le stock ;
//    ce classement ne fait que l'ORDRE et la coupe des N premiers.
import { titreNorm, jumeauProbable } from '../utils/rapprochementJumeau';

const MOTS_COURTS = 2;          // « de », « la », « et » ne prouvent rien
export const MAX_CANDIDATS = 6;

const mots = (t) => new Set(titreNorm(t).split(' ').filter((m) => m.length > MOTS_COURTS));

// Recouvrement des mots significatifs, borné à [0,1]. On divise par le plus
// PETIT des deux ensembles : « tome 3 » contenu dans « tome 3 l'invité
// fantôme » doit scorer haut, alors qu'un Jaccard classique l'enterrerait.
function recouvrement(a, b) {
  const x = mots(a);
  const y = mots(b);
  if (!x.size || !y.size) return 0;
  let communs = 0;
  for (const m of x) if (y.has(m)) communs += 1;
  return communs / Math.min(x.size, y.size);
}

// Le prix ne décide jamais seul : il départage deux titres aussi proches l'un
// que l'autre. Inconnu des deux côtés → aucun effet, ni bonus ni malus.
function proximitePrix(prixAnnonce, prixArticle) {
  const a = Number(prixAnnonce);
  const b = Number(prixArticle);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 0;
  const ecart = Math.abs(a - b) / Math.max(a, b);
  if (ecart <= 0.02) return 0.25;
  if (ecart <= 0.15) return 0.12;
  return 0;
}

/**
 * Les articles du stock les plus proches d'une annonce, du plus probable au
 * moins probable. `motifServeur` marque celui que le serveur a proposé.
 *
 * @param {object} annonce  ligne d'annonces_plateforme (titre, prix, proposition)
 * @param {Array}  items    le stock tel que le Stock le tient déjà en mémoire
 * @returns {Array<{ item, score, source }>} source: 'serveur' | 'jumeau' | 'proche'
 */
export function classerCandidats(annonce, items) {
  const liste = Array.isArray(items) ? items.filter((i) => i && i.statut !== 'vendu') : [];
  if (!liste.length) return [];

  const prop = annonce?.proposition && typeof annonce.proposition === 'object' ? annonce.proposition : null;
  const idPropose = prop?.inventaire_id != null ? String(prop.inventaire_id) : null;
  const jumeau = jumeauProbable(annonce?.titre, liste);
  const idJumeau = jumeau?.id != null ? String(jumeau.id) : null;

  const notes = liste.map((item) => {
    const id = String(item.id);
    if (idPropose && id === idPropose) return { item, score: 1000, source: 'serveur' };
    if (idJumeau && id === idJumeau) return { item, score: 900, source: 'jumeau' };
    const base = recouvrement(annonce?.titre, item.title ?? item.titre);
    if (base <= 0) return null;
    return { item, score: base + proximitePrix(annonce?.prix, item.sell), source: 'proche' };
  }).filter(Boolean);

  notes.sort((a, b) => b.score - a.score);
  return notes.slice(0, MAX_CANDIDATS);
}

/** La recherche libre : tout le stock, sur le nom, sans classement ni seuil. */
export function chercherDansStock(items, requete) {
  const q = String(requete ?? '').trim().toLowerCase();
  const liste = Array.isArray(items) ? items.filter((i) => i && i.statut !== 'vendu') : [];
  if (!q) return liste.slice(0, 20);
  return liste.filter((i) => String(i.title ?? i.titre ?? '').toLowerCase().includes(q)).slice(0, 20);
}
