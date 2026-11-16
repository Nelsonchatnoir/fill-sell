// ═══════════════════════════════════════════════════════════════════════════
// LA PHRASE DE FILLSELL SUR LA PAGE STRIPE D'UN ESSAI (16/11/2026, point 2a du lot de Nico) — pur, Deno + Node + Vite
// ═══════════════════════════════════════════════════════════════════════════
// Constat (annexe p6 du 16/11 matin) : la page Stripe d'un essai Cloud ne portait AUCUN texte de FillSell (custom_text
// vide) ; les 3 personnes du 15/11 ont hésité puis quitté la page sans rien tenter. La carte reste obligatoire (décision de
// Nico) ; la page dit, sous le bouton, ce qui se passe vraiment : « 0 € aujourd'hui. Rien n'est prélevé avant le JJ/MM. Tu
// arrêtes en un clic depuis l'app FillSell, quand tu veux. » La date = la fin de l'essai (trial_period_days, heure de
// Paris) ; la même phrase est dite dans l'app juste avant (cloud/ConditionsCloudModale.jsx, texteEssaiAvantPaiement).
// Le logo : l'icône FillSell posée sur le compte Stripe (Adaptation à votre marque, 16/11), jamais un paramètre de session
// (l'API 2023-10-16 de create-checkout-session ne le garantit pas).
const JOUR_MS = 86_400_000;

/** « JJ/MM » de la fin d'un essai de `jours` jours commencé `maintenant` (heure de Paris). */
export function dateFinEssaiCourte(maintenant = Date.now(), jours = 7) {
  const fin = new Date(Number(maintenant) + jours * JOUR_MS);
  return fin.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });
}

/** La phrase sous le bouton de la page Stripe d'un essai (≤ 1 200 caractères, règle de Stripe). */
export function texteSousBoutonEssai({ lang = 'fr', maintenant = Date.now(), jours = 7 } = {}) {
  const jjmm = dateFinEssaiCourte(maintenant, jours);
  return lang === 'en'
    ? `€0 today. Nothing is charged before ${jjmm} (day/month). Stop in one tap from the FillSell app, whenever you want.`
    : `0 € aujourd'hui. Rien n'est prélevé avant le ${jjmm}. Tu arrêtes en un clic depuis l'app FillSell, quand tu veux.`;
}

/** Le `custom_text` d'une session Checkout d'essai (aucun pour une page payée tout de suite). */
export function customTextEssai({ essai, lang = 'fr', maintenant = Date.now(), jours = 7 } = {}) {
  return essai ? { custom_text: { submit: { message: texteSousBoutonEssai({ lang, maintenant, jours }) } } } : {};
}
