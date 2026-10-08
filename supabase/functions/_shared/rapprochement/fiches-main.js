// ═══════════════════════════════════════════════════════════════════════════
// FICHE CRÉÉE À LA MAIN FACE À UNE FICHE VINTED (08/10/2026 soir, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Même règle que pour les imports » :
//   · photo ET titre concordants, sans concurrent → fusion automatique ;
//   · un doute (photo proche seulement, titre ou taille contradictoires,
//     plusieurs candidats) → « à vérifier », hors du stock ;
//   · jamais la photo seule, jamais le titre seul ;
//   · les décisions de la personne restent définitives.
// Une fiche « à la main » = un article créé dans l'app (origine vide, aucune
// annonce Vinted connue : nœud `fiche`) ; une fiche Vinted = un article qui
// porte une annonce Vinted (dressing de l'extension, ou dépôt FillSell : nœud
// `vinted`). Deux fiches Vinted ne se fondent jamais (deux exemplaires).
//
// CE QUI EST GARDÉ. La fiche de la personne : son titre, son prix, son prix
// d'achat, ses photos restent ; la fiche du dressing s'y fond
// (inventaire_fusionner_pour : ce qui manque est repris, l'identité Vinted
// suit l'objet, tout est journalisé et réversible). Un doute pose la question
// « Est-ce le même article ? » (gardée = la fiche de la personne) et sort la
// fiche du dressing du stock (marqueur « à vérifier ») — jamais la fiche de la
// personne.
//
// UN SOUS-GRAPHE À PART. Seulement les nœuds `fiche` et `vinted`, sur les mêmes
// arêtes (evaluer), les mêmes concurrents et les mêmes poids de mots que le
// graphe complet : les décisions des annonces (moteur.js) ne bougent pas d'un
// iota. Les deux côtés d'une paire jugée sont actifs : leurs concurrents
// (une autre fiche à la main, une autre fiche Vinted) comptent toujours.
//
// QUI EST JUGÉ (portée) :
//   · 'nouvelles' (la passe normale) : les fiches à la main nées depuis la
//     dernière passe (`fiches_main_a_juger`) et les fiches du dressing nées
//     depuis la dernière passe (`vinted_a_juger`), chacune contre TOUT ce que
//     la personne a déjà ; seulement quand la lecture le dit
//     (`fiches_main_actif`, migration 20261008150000) ;
//   · 'toutes' (le rattrapage du stock existant, sur décision de Nico) : toutes
//     les fiches à la main.
// La base garde ses gardes à l'écriture (rapprochement_v3_appliquer) : fiche
// de la personne en stock, sans annonce Vinted, quantité 1, aucune publication
// Vinted en vol ; fiche du dressing en stock, que la personne n'a pas touchée ;
// jamais deux annonces d'une même plateforme ; une paire tranchée n'est jamais
// reposée. Une garde qui refuse la fusion pose la question à la place.
import { rapprocher, forcesDe, candidatsDe } from './moteur.js';

export const estMain = (n) => n.pf === 'fiche';
export const estVinted = (n) => n.pf === 'vinted';
const cle = (a, b) => [a, b].sort().join('|');

/** Les nœuds jugés par cette passe (ids « F… »). */
export function jugesFichesMain(donnees, NF, portee) {
  if (portee === 'toutes') return new Set(NF.filter(estMain).map((n) => n.id));
  const presents = new Set(NF.map((n) => n.id));
  const s = new Set();
  for (const id of donnees.fiches_main_a_juger ?? []) if (presents.has('F' + id)) s.add('F' + id);
  for (const id of donnees.vinted_a_juger ?? []) if (presents.has('F' + id)) s.add('F' + id);
  return s;
}

/**
 * Les preuves et refus de la personne entre deux fiches : un refus (« Non »
 * à la question) et une fusion qu'elle a défaite valent « jamais ».
 */
export function forcesFiches(donnees) {
  const out = forcesDe(donnees).filter(([a, b]) => a.startsWith('F') && b.startsWith('F'));
  const F = new Set((donnees.fiches ?? []).map((f) => String(f.id)));
  for (const x of donnees.fusions ?? []) {
    if (!x.defaite) continue;
    const a = String(x.garde), b = String(x.absorbe);
    if (F.has(a) && F.has(b) && a !== b) out.push(['F' + a, 'F' + b, 'non', 'fusion_defaite']);
  }
  return out;
}

/**
 * La règle sur un compte. `N` = les nœuds de la passe (construireNoeuds).
 * Rend { decisions, bilan } ; decisions = fusionner_fiche | fiche_a_verifier.
 */
export function fichesMain(donnees, N, { portee = 'nouvelles' } = {}) {
  const actif = portee === 'toutes' || donnees.fiches_main_actif === true;
  if (!actif) return { decisions: [], bilan: null };
  const NF = N.filter((n) => estMain(n) || estVinted(n));
  if (!NF.some(estMain) || !NF.some(estVinted)) return { decisions: [], bilan: null };
  const juges = jugesFichesMain(donnees, NF, portee);
  if (!juges.size) return { decisions: [], bilan: null };
  const t0 = Date.now();
  // les jugés, puis leurs vis-à-vis de l'autre côté (leurs concurrents comptent)
  const actifs = new Set(NF.map((n, i) => (juges.has(n.id) ? i : -1)).filter((i) => i >= 0));
  for (const [i, j] of candidatsDe(NF, new Set(actifs))) if (NF[i].pf !== NF[j].pf) { actifs.add(i); actifs.add(j); }
  const R = rapprocher(NF, { forces: forcesFiches(donnees), actifs, poidsDe: N });

  const fortes = new Map();
  for (const e of R.aretes) if (e.niveau === 'fort') fortes.set(cle(e.x.id, e.y.id), e);
  const preuves = (e) => ({
    motif: e.motif, photo: Number((e.ph?.best ?? 99).toFixed(1)), photo_niveau: e.photo, titre: Number((e.wj ?? 0).toFixed(2)),
    conflits: e.conflits ?? [], avant_stock: true, regle: 'rapprochement_v3', portee: 'fiche_main',
  });
  const bilan = { juges: juges.size, noeuds: NF.length, aretes: R.aretes.length, fusions: 0, a_verifier: 0, vendus: 0, quantite: 0, deja_pris: 0, ms: 0 };
  const decisions = [];
  const pris = new Set();
  const qte = (n) => Number(n.ref?.quantite ?? 1) || 1;

  // (a) une arête forte (photo ET titre, aucun concurrent) : un groupe = une
  //     fiche à la main + une fiche Vinted. Fusion si les deux sont en stock,
  //     d'un exemplaire ; sinon la question.
  const questions = [];
  for (const [, g] of R.membres) {
    const H = g.find(estMain), V = g.find(estVinted);
    if (!H || !V) continue;
    if (!juges.has(H.id) && !juges.has(V.id)) continue;
    const e = fortes.get(cle(H.id, V.id)); if (!e) continue;
    pris.add(H.id); pris.add(V.id);
    if (H.vendu || V.vendu) { bilan.vendus++; continue; }
    if (qte(H) > 1 || qte(V) > 1) { bilan.quantite++; questions.push({ H, V, e, motif: 'fiche_main_quantite' }); continue; }
    decisions.push({ type: 'fusionner_fiche', garde: H.id.slice(1), absorbe: V.id.slice(1), motif: 'photo_identique', preuve: preuves(e) });
    bilan.fusions++;
  }
  // (b) les doutes entre une fiche à la main et une fiche Vinted : comme pour un
  //     import, UNE question par fiche jugée — la nouvelle fiche Vinted (passe
  //     normale) ou la fiche à la main (nouvelle, ou rattrapage) — avec son
  //     meilleur candidat ; le nombre de candidats va dans les preuves. Jamais
  //     sur une paire déjà fusionnée ou une fiche déjà prise par cette passe.
  //     (Rejeu du 08/10 : sans ça, « Jean 615 » posait 4 questions et sortait
  //     4 jeans Vinted différents du stock, « Robe » 3, « Article » 3.)
  const doutes = R.aretes
    .filter((e) => e.niveau === 'doute' && ((estMain(e.x) && estVinted(e.y)) || (estVinted(e.x) && estMain(e.y))))
    .filter((e) => juges.has(e.x.id) || juges.has(e.y.id))
    .sort((a, b) => a.ph.best - b.ph.best);
  const pivotDe = (H, V) => (juges.has(V.id) ? V : H);
  const candidats = new Map();
  for (const e of doutes) {
    const H = estMain(e.x) ? e.x : e.y, V = H === e.x ? e.y : e.x;
    if (H.vendu || V.vendu) continue;
    const p = pivotDe(H, V).id; candidats.set(p, (candidats.get(p) || 0) + 1);
  }
  const questionnes = new Set();
  for (const e of doutes) {
    const H = estMain(e.x) ? e.x : e.y, V = H === e.x ? e.y : e.x;
    if (H.vendu || V.vendu) { bilan.vendus++; continue; }
    const pivot = pivotDe(H, V);
    if (questionnes.has(pivot.id)) { bilan.autres_candidats = (bilan.autres_candidats || 0) + 1; continue; }
    questionnes.add(pivot.id); // son MEILLEUR candidat seulement : s'il est déjà pris, rien (jamais un moins bon)
    if (pris.has(H.id) || pris.has(V.id)) { bilan.deja_pris++; continue; }
    pris.add(V.id);
    questions.push({ H, V, e, motif: e.motif || 'doute', candidats: candidats.get(pivot.id) || 1 });
  }
  for (const { H, V, e, motif, candidats: n } of questions) {
    decisions.push({ type: 'fiche_a_verifier', garde: H.id.slice(1), absorbe: V.id.slice(1), motif, preuves: { ...preuves(e), candidats_total: n ?? 1 } });
    bilan.a_verifier++;
  }
  bilan.ms = Date.now() - t0;
  return { decisions, bilan };
}
