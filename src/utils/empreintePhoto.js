// ═══════════════════════════════════════════════════════════════════════════
// EMPREINTES DE PHOTOS, CÔTÉ APP — charger, comparer, ne jamais bloquer
// (2026-09-23, chantier « comparer les photos pour rapprocher avec certitude »)
// ═══════════════════════════════════════════════════════════════════════════
// Le calcul vit dans la fonction edge `photo-empreinte` (cache
// photo_empreintes) ; ici on ne fait que DEMANDER les empreintes des quelques
// URL qu'un écran compare, et décider avec les MÊMES seuils que le serveur
// (_shared/empreinte-image.ts). Une fonction injoignable, un délai dépassé,
// une image illisible → `null` : l'écran retombe sur le texte seul, il ne
// bloque rien et n'alarme pas.

const SEUILS = Object.freeze({ identique: { dhash: 5, phash: 8 }, proche: { dhash: 10 } });
const DELAI_MS = 12_000;
const MAX_URLS = 40;

export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

/** « identique » (preuve) · « proche » (indice) · « differente ». */
export function comparerEmpreintes(a, b) {
  if (!a || !b) return { dhash: Infinity, phash: Infinity, verdict: 'differente' };
  const dh = hamming(a.dhash, b.dhash);
  const ph = hamming(a.phash, b.phash);
  const verdict = dh <= SEUILS.identique.dhash && ph <= SEUILS.identique.phash ? 'identique'
    : dh <= SEUILS.proche.dhash ? 'proche' : 'differente';
  return { dhash: dh, phash: ph, verdict };
}

/** La paire la plus proche entre deux listes d'empreintes. */
export function meilleurAppariement(listeA, listeB) {
  let meilleur = null;
  for (const x of listeA ?? []) for (const y of listeB ?? []) {
    if (!x || !y) continue;
    const c = comparerEmpreintes(x, y);
    if (!meilleur || c.dhash + c.phash < meilleur.dhash + meilleur.phash) meilleur = c;
  }
  return meilleur ?? { dhash: Infinity, phash: Infinity, verdict: 'differente' };
}

/**
 * Demande les empreintes des URL données. Rend une Map url → empreinte pour
 * celles qui ont pu être calculées ; les autres sont simplement absentes.
 * Jamais d'exception : un échec rend une Map vide.
 */
export async function chargerEmpreintes(supabase, urls) {
  const liste = [...new Set((urls ?? []).map((u) => String(u ?? '').trim()).filter((u) => /^https?:\/\//.test(u)))].slice(0, MAX_URLS);
  const out = new Map();
  if (!liste.length || !supabase?.functions?.invoke) return out;
  try {
    const invocation = supabase.functions.invoke('photo-empreinte', { body: { urls: liste } });
    const delai = new Promise((resolve) => setTimeout(() => resolve({ data: null, error: new Error('délai') }), DELAI_MS));
    const { data, error } = await Promise.race([invocation, delai]);
    if (error || !data?.empreintes) return out;
    for (const [url, e] of Object.entries(data.empreintes)) {
      if (e?.dhash && e?.phash) out.set(url, { dhash: String(e.dhash), phash: String(e.phash), couleur: String(e.couleur ?? '') });
    }
  } catch { /* fonction injoignable : on retombe sur le texte */ }
  return out;
}
