import { oplaNoeud, oplaEnfants, oplaChemin } from './opla-catalogue.ts';

// Les anciens handlers envoyaient des nœuds non publiables. Développer leur
// sous-arbre entier, sans choisir ni tronquer : seules les feuilles sont proposées.
export function feuillesPourQuestionOpla(options) {
  const vues = new Set();
  const feuilles = [];
  function visiter(code) {
    if (vues.has(code)) return;
    vues.add(code);
    const n = oplaNoeud(code);
    if (!n) return;
    if (n.feuille) feuilles.push({ code, title: oplaChemin(code).join(' › ') });
    else for (const enfant of oplaEnfants(code)) visiter(enfant.code);
  }
  for (const o of Array.isArray(options) ? options : []) visiter(String(o?.code ?? ''));
  return feuilles;
}

export function questionOplaFinale(pf) {
  if (!pf || typeof pf !== 'object') return pf;
  const champs = [pf.needsUserField, ...(Array.isArray(pf.needsUserFields) ? pf.needsUserFields : [])];
  if (!champs.some(c => c?.field_key === 'oplaCategoryChoice')) return pf;
  const anciennes = pf.oplaCategoryAsk?.options;
  const options = feuillesPourQuestionOpla(Array.isArray(anciennes) && anciennes.length
    ? anciennes : oplaEnfants('').map(n => ({ code: n.code })));
  if (!options.length) return pf; // un code live inconnu ne se remplace pas arbitrairement
  const corriger = c => c?.field_key === 'oplaCategoryChoice'
    ? { ...c, allowed_values: options.map(o => o.title), options_completes: true, input_type: 'selection_only' } : c;
  return { ...pf, oplaCategoryAsk: { ...pf.oplaCategoryAsk, options },
    needsUserField: corriger(pf.needsUserField),
    ...(Array.isArray(pf.needsUserFields) ? { needsUserFields: pf.needsUserFields.map(corriger) } : {}) };
}
