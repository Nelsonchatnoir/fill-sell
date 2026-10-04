// Règles pures de la question « Marque » hors catalogue (03/10 nuit) — lues
// par src/annonces/QuestionMarque.jsx et par son selftest (node, sans JSX).
export const SANS_MARQUE_RE = /^\s*sans\s+marque\s*$/i;
export const comparable = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’`´]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();

export const VERSION_RECHERCHE_MARQUE = '0.6.94';

/** Le champ demandé est-il la question « marque absente du catalogue » ? */
export function estQuestionMarqueHorsCatalogue(job, f) {
  if (!f) return false;
  if (f.raison === 'marque_hors_catalogue') return true;
  // Questions posées par la 0.6.93 (avant la clé `raison`) : Vinted, champ
  // Marque, liste qui propose « Sans marque ».
  return job?.platform === 'vinted' && /^(brand|marque)$/i.test(String(f.field_key ?? ''))
    && Array.isArray(f.allowed_values) && f.allowed_values.some((v) => SANS_MARQUE_RE.test(String(v)));
}

/** La marque que la personne avait donnée (pour la phrase d'explication). */
export function marqueDemandee(job, f) {
  const pf = job?.platform_fields ?? {};
  return String(f?.demandee ?? pf.marque ?? pf.vintedAspects?.brand ?? '').trim();
}


// ── LES SUGGESTIONS DOIVENT RESSEMBLER À LA MARQUE DEMANDÉE (04/10, Louis) ──
// Louis voyait « U Collection », « Z Kids »… pour une marque sans rapport :
// l'extension range, pour la question, ce que le catalogue Vinted rend à une
// recherche sur le mot brut, son premier mot, puis ses QUATRE premières
// lettres — sans aucun tri. Ici, avant d'afficher (la saisie de la personne,
// elle, garde sa recherche libre) : on ne propose que ce qui RESSEMBLE à la
// marque demandée — même mot (3 lettres au moins), même début, ou une faute
// de frappe (distance d'édition courte) —, le plus proche d'abord. Rien de
// proche → aucune suggestion, et l'écran le dit (jamais une liste au hasard).
const mots = (s) => comparable(s).split(/[^a-z0-9]+/).filter((m) => m.length >= 3);
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}
/** Les valeurs qui ressemblent à la marque demandée, la plus proche d'abord. */
export function suggestionsProches(demandee, valeurs, max = 12) {
  const d = comparable(demandee).replace(/[^a-z0-9 ]/g, '').trim();
  if (!d) return [];
  const md = mots(demandee);
  const score = (v) => {
    const c = comparable(v).replace(/[^a-z0-9 ]/g, '').trim();
    if (!c) return 0;
    if (c === d) return 100;
    if (c.length >= 3 && (c.startsWith(d) || d.startsWith(c))) return 80;
    const mv = mots(v);
    if (mv.some((m) => md.includes(m))) return 60;
    if (distance(c, d) <= Math.max(1, Math.floor(d.length / 5))) return 50;
    if (md.some((m) => m.length >= 4 && mv.some((x) => x.length >= 3 && distance(m, x) <= 1))) return 45;
    if (md.some((m) => mv.some((x) => (x.length >= 4 && m.startsWith(x)) || (m.length >= 4 && x.startsWith(m))))) return 40;
    return 0;
  };
  return [...new Set((valeurs ?? []).map(String))]
    .map((v) => [v, score(v)]).filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, max).map(([v]) => v);
}
