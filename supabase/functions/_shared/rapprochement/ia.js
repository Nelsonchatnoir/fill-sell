// ═══════════════════════════════════════════════════════════════════════════
// L'IA SUR LES DOUTES DU MOTEUR DE FUSION (15/10, décision 3 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Le moteur garde ses règles. L'IA n'intervient QUE là où il poserait une
// question à la personne (« Est-ce le même article ? », inventaire_doublons
// 'proposee') ; seuls les cas où ELLE n'est pas sûre restent en question.
// Coût le plus bas, sur le modèle de la classification des catégories :
//   · Haiku seulement, réponse courte et structurée (verdict + une ligne) ;
//   · le TEXTE d'abord ; s'il suffit, aucune image n'est envoyée ;
//   · sinon des MINIATURES (256 px), jamais les photos en grand ;
//   · un verdict par paire gardé en base (rapprochement_ia_verdicts) : jamais
//     deux appels pour la même paire ;
//   · Haiku hésite → la question reste à la personne, jamais d'escalade ;
//   · plafond : 1 € par compte et par passage — au-delà, on s'arrête.
// GARDE-FOUS (appliqués APRÈS la réponse, jamais confiés au modèle) :
//   · jamais deux annonces d'une même plateforme (motifs « en double ») : hors IA ;
//   · une paire parmi plusieurs candidats : l'IA ne peut que dire « différents » ;
//   · un compte qui a déjà répondu « Non, deux exemplaires » : l'IA ne fusionne
//     jamais chez lui (vendeur à exemplaires identiques : Louis, SPGL 44…) ;
//   · une fiche vendue d'un côté : la personne décide (une fusion arme des retraits) ;
//   · R12 : jamais de fusion sur le titre seul — « même » exige une preuve PHOTO
//     (celle du moteur, ou les miniatures vues par l'IA).
// Pur (Node + Deno) : scripts/rapprochement-ia-selftest.mjs.

export const MODELE_IA_FUSION = 'claude-haiku-5-5';
// Tarif Anthropic de claude-haiku-5-5 (≤ 100 K jetons d'entrée), en $ par jeton.
export const PRIX_USD = Object.freeze({ entree: 0.10 / 1e6, sortie: 0.50 / 1e6 });
export const USD_EN_EUR = 0.93;
export const PLAFOND_EUR_PAR_COMPTE_ET_PASSAGE = 1;
export const COTE_MINIATURE = 256;
export const MINIATURES_PAR_FICHE = 2;

// Deux annonces d'une MÊME plateforme : deux exemplaires possibles — jamais l'IA.
export const MOTIFS_MEME_PLATEFORME = new Set([
  'annonce_en_double', 'deux_annonces_meme_plateforme', 'photo_meme_plateforme',
  'meme_photo_deux_annonces_meme_plateforme', 'photo_deux_annonces', 'plusieurs_exemplaires_vivants',
  'annonce_remplacee', 'remise_en_ligne_titre_court',
]);
// Liés à une vente : la personne décide (le « oui » arme des retraits).
export const MOTIFS_VENTE = new Set(['copie_non_prouvee', 'homonyme_vendu']);
// Plusieurs candidats : « différents » seulement.
export const MOTIFS_PLUSIEURS = new Set(['ambigu_plusieurs', 'plusieurs_candidats', 'trop_de_candidats', 'photo_plusieurs', 'photo_variantes', 'faisceau']);
// Le moteur a déjà une preuve photo forte (identique / quasi).
export const NIVEAUX_PHOTO_FORTE = new Set(['identique', 'quasi', 'multi', 'une']);

export function questionEligible(d) {
  if (!d || d.statut !== 'proposee') return { ok: false, raison: 'pas_ouverte' };
  if (MOTIFS_MEME_PLATEFORME.has(d.motif)) return { ok: false, raison: 'meme_plateforme' };
  if (MOTIFS_VENTE.has(d.motif)) return { ok: false, raison: 'vente' };
  return { ok: true };
}

export function clePaire(d) {
  const a = String(d.garde ?? ''), b = String(d.absorbe ?? '');
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const court = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const valeur = (x) => (x && typeof x === 'object' && 'v' in x ? x.v : x);
const attr = (f, k) => court(valeur(f?.attributs?.[k]), 60);

export function photosDe(f) {
  const p = Array.isArray(f?.photos) ? f.photos : [];
  return p.map((x) => (typeof x === 'string' ? x : x?.url)).filter((u) => typeof u === 'string' && /^https:\/\//.test(u));
}

function decrireFiche(f, nom) {
  const lignes = [
    `${nom}`,
    `- titre : ${court(f?.titre, 140) || '(vide)'}`,
    `- description : ${court(f?.description, 400) || '(vide)'}`,
  ];
  for (const [k, lib] of [['taille', 'taille'], ['couleur', 'couleur'], ['marque', 'marque'], ['etat', 'état'], ['matiere', 'matière']]) {
    const v = k === 'marque' ? (court(f?.marque, 60) || attr(f, 'marque')) : attr(f, k);
    if (v) lignes.push(`- ${lib} : ${v}`);
  }
  if (Number.isFinite(Number(f?.prix_vente))) lignes.push(`- prix : ${Number(f.prix_vente)} €`);
  if (f?.plateformes) lignes.push(`- en ligne sur : ${f.plateformes}`);
  return lignes.join('\n');
}

export const CONSIGNE = [
  "Tu compares deux fiches d'un même vendeur de seconde main (vêtements, objets) venues de plateformes différentes.",
  "Question : est-ce LA MÊME pièce physique mise en vente sur deux plateformes, ou deux pièces distinctes ?",
  "Ce qui NE distingue PAS (une même pièce est souvent décrite un peu différemment d'une plateforme à l'autre) : un titre reformulé, une description absente ou raccourcie, « neuf avec étiquette » contre « neuf sans étiquette », une taille notée autrement (« 6-9 mois / 68 cm » et « 6 mois / 68 cm », « 38 » et « M / 38 »), un prix différent de quelques euros, une couleur non précisée d'un côté.",
  "Ce qui distingue : une taille ou pointure franchement différente, une autre couleur ou un autre motif, un autre modèle, une autre quantité ou un autre contenu de lot, un autre type d'objet, d'autres dimensions.",
  'Réponses :',
  "- « different » : un détail ci-dessus les distingue nettement.",
  "- « meme » : sur les PHOTOS, c'est visiblement la même pièce (photo identique ou recadrée, même prise de vue, même fond, mêmes défauts ou plis). Sans photo à comparer, ne réponds jamais « meme » sur le seul texte.",
  "- « incertain » : textes compatibles mais rien ne prouve que c'est la même pièce (par exemple deux prises de vue différentes d'un même modèle : le vendeur peut en avoir plusieurs).",
  'Réponds UNIQUEMENT par le JSON demandé ; « raison » en une ligne, en français.',
].join('\n');

// Le message de la phase TEXTE.
export function messageTexte({ garde, absorbe, motif, preuves, avecImages = false }) {
  const photo = preuves?.photo_niveau ? `Le moteur de photos dit : ${preuves.photo_niveau === 'aucune' ? 'aucune photo commune' : `photos « ${preuves.photo_niveau} »`}.` : '';
  return [
    decrireFiche(garde, 'FICHE A'),
    '',
    decrireFiche(absorbe, 'FICHE B'),
    '',
    `Pourquoi la question est posée : ${court(motif, 60)}. ${photo}`.trim(),
    avecImages
      ? "Les miniatures des deux fiches suivent : compare-les (même pièce ? deux pièces ?)."
      : "Pas encore de photos ici : réponds « different » si un détail les distingue nettement, sinon « incertain » avec besoin_images = true.",
  ].join('\n');
}

export const SCHEMA_REPONSE = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'raison', 'besoin_images'],
  properties: {
    verdict: { type: 'string', enum: ['meme', 'different', 'incertain'] },
    raison: { type: 'string' },
    besoin_images: { type: 'boolean' },
  },
});

export function lireReponse(texte) {
  try {
    const j = JSON.parse(String(texte ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    const verdict = ['meme', 'different', 'incertain'].includes(j?.verdict) ? j.verdict : 'incertain';
    return { verdict, raison: court(j?.raison, 200) || null, besoin_images: j?.besoin_images === true };
  } catch {
    return { verdict: 'incertain', raison: 'réponse illisible', besoin_images: false };
  }
}

export function coutUsd(usage) {
  const e = Number(usage?.input_tokens) || 0;
  const s = Number(usage?.output_tokens) || 0;
  return e * PRIX_USD.entree + s * PRIX_USD.sortie;
}

// LA DÉCISION, après les garde-fous. `phase` : 'texte' | 'images'.
// Rend { decision: 'oui' | 'non' | 'question', garde_fou: string|null }.
export function appliquerGardeFous({ verdict, phase, d, garde, absorbe, compteDitNon }) {
  if (verdict === 'incertain') return { decision: 'question', garde_fou: null };
  if (verdict === 'different') return { decision: 'non', garde_fou: null };
  // verdict === 'meme'
  if (MOTIFS_PLUSIEURS.has(d?.motif) || Number(d?.preuves?.candidats_total) > 1) return { decision: 'question', garde_fou: 'plusieurs_candidats' };
  if (compteDitNon) return { decision: 'question', garde_fou: 'compte_deux_exemplaires' };
  if (garde?.statut === 'vendu' || absorbe?.statut === 'vendu') return { decision: 'question', garde_fou: 'fiche_vendue' };
  const photoMoteur = NIVEAUX_PHOTO_FORTE.has(String(d?.preuves?.photo_niveau ?? ''));
  if (phase !== 'images' && !photoMoteur) return { decision: 'question', garde_fou: 'titre_seul' };
  return { decision: 'oui', garde_fou: null };
}
