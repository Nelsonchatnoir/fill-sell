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

