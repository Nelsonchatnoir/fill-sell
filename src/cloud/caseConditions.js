// ═══════════════════════════════════════════════════════════════════════════
// LA CASE DES CONDITIONS DU CLOUD : SA PLACE ET LA PHRASE DE L'ESSAI (16/11/2026, lot du midi de Nico) — pur
// ═══════════════════════════════════════════════════════════════════════════
import { finEssaiSiOnCommence, FUSEAU } from './regles';

// (16/11/2026, point 1a du lot de Nico) LA CASE EST AU-DESSUS DE TOUT, parcours d'entrée (9980) et fenêtre des offres
// (9990) compris — comme la fenêtre « Changer de formule » (10050). Avant : 1250, et le parcours ne passait dessous que
// pendant l'achat du Cloud SEUL : demandée par l'essai d'une formule dans le parcours, elle s'ouvrait DERRIÈRE lui
// (d4929a4e le 15/11, rachidafarhi54 le 16/11 : la case vue une minute plus tard, sur le Tableau).
export const Z_CONDITIONS = 10060;

// (16/11/2026, point 2b de Nico) Le DERNIER écran avant la page Stripe et la feuille d'Apple / Google : quand l'essai est
// annoncé ET sûr sur ce canal (`essai`), il dit ce qui se passe vraiment — « 0 € aujourd'hui. Rien n'est prélevé avant le
// JJ/MM. Tu arrêtes en un clic depuis l'app, quand tu veux. » La date = la fin d'un essai qui commencerait maintenant
// (7 jours, heure de Paris : la règle de la feuille des formules).
export function texteEssaiAvantPaiement(lang = 'fr', maintenant = Date.now()) {
  const fin = Date.parse(finEssaiSiOnCommence(maintenant));
  const jjmm = Number.isFinite(fin) ? new Date(fin).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: '2-digit', timeZone: FUSEAU }) : null;
  if (!jjmm) return null;
  return lang === 'en'
    ? `€0 today. Nothing is charged before ${jjmm}. Stop in one tap from the app, whenever you want.`
    : `0 € aujourd'hui. Rien n'est prélevé avant le ${jjmm}. Tu arrêtes en un clic depuis l'app, quand tu veux.`;
}
