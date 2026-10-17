// ═══════════════════════════════════════════════════════════════════════════
// ALERTES DE COMPTE — SESSION PERDUE, COMPTE RESTREINT (18/10, lot 4.2, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Session perdue ou compte restreint par une plateforme : l'utilisateur est
// prévenu tout seul. » Jusqu'ici, une session Vinted / Leboncoin / Beebs / eBay
// fermée dans Chrome ne se voyait que si un geste butait dessus (retrait bloqué,
// relevé refusé, publication en attente) : un compte dont rien n'est en file
// pouvait rester des semaines sans relevé (isereshop38 : 56 jours) sans que
// l'app ne dise rien. Et une restriction Vinted (« Compte restreint jusqu'au
// JJ/MM ») n'était lue que par le serveur, sur les publications retenues.
//
// LA RÈGLE (garde-fous de Nico : discret, réglable, masquable, regroupé) :
//   · UNE ligne dans « À régler » (jamais un bandeau), qui regroupe toutes les
//     plateformes concernées ; le tap ouvre l'écran des alertes ;
//   · « session perdue » = le verdict EXISTANT de utils/sessionsPlateformes
//     (`etatSession` : 'ko' seulement sur une sonde `false` fraîche, jamais sur
//     un 401, un 403 ou un silence ; une publication réussie de moins de 72 h
//     prouve la session) — aucune règle neuve ;
//   · « compte restreint » = la restriction Vinted lue par le serveur sur un
//     job vivant du compte (_shared/pas-de-rouge.js restrictionVinted, date de
//     fin à venir) ;
//   · masquable par plateforme (platform_settings.alertes_compte.masquees[pf]
//     = true) — le masque TOMBE de lui-même quand la session revient ('ok'), pour
//     que la prochaine perte se dise de nouveau ; une restriction se masque
//     jusqu'à sa date de fin ;
//   · réglable dans Réglages › Préférences (alertes_compte.desactivees = true :
//     plus aucune alerte de compte, nulle part).
// Pur, testé par scripts/alertes-compte-selftest.mjs.
import { restrictionVinted } from '../../supabase/functions/_shared/pas-de-rouge.js';

export const PLATEFORMES_ALERTE = ['vinted', 'leboncoin', 'beebs', 'ebay'];
export const CLE_REGLAGE_ALERTES = 'alertes_compte';

const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', depop: 'Depop' };
const ms = (v) => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : 0; };

/** La restriction Vinted la plus lointaine portée par les jobs vivants, ou null. */
export function restrictionDuCompte(jobs, maintenant = Date.now()) {
  let out = null;
  for (const j of Array.isArray(jobs) ? jobs : []) {
    if (!j || j.platform !== 'vinted' || !['pending', 'processing', 'needs_user'].includes(String(j.status ?? ''))) continue;
    const r = restrictionVinted(j.platform_fields);
    if (!r) continue;
    if (typeof r.fin === 'number' && r.fin <= maintenant) continue;
    if (!out || (typeof r.fin === 'number' && r.fin > (out.fin ?? 0))) out = r;
  }
  return out;
}

/**
 * Les alertes à montrer.
 * @param {{ etats: object|null, jobs: any[], reglage: object|null, maintenant?: number }} arg
 *   etats   : { [pf]: 'ok'|'ko'|null } (utils/sessionsPlateformes.etatSession)
 *   reglage : platform_settings.alertes_compte, tel quel
 * @returns {Array<{ platform: string, kind: 'connexion'|'restriction', jusquau?: string|null, fin?: number|null }>}
 */
export function alertesCompte({ etats, jobs, reglage, maintenant = Date.now() }) {
  const r = reglage && typeof reglage === 'object' ? reglage : {};
  if (r.desactivees === true) return [];
  const masquees = r.masquees && typeof r.masquees === 'object' ? r.masquees : {};
  const out = [];
  for (const pf of PLATEFORMES_ALERTE) {
    if (etats?.[pf] !== 'ko') continue;
    if (masquees[pf] === true) continue;
    out.push({ platform: pf, kind: 'connexion' });
  }
  const restriction = restrictionDuCompte(jobs, maintenant);
  if (restriction) {
    const masque = ms(masquees.vinted_restriction);
    if (!(masque && typeof restriction.fin === 'number' && masque >= restriction.fin)) {
      out.push({ platform: 'vinted', kind: 'restriction', jusquau: restriction.jusquau ?? null, fin: restriction.fin ?? null });
    }
  }
  return out;
}

/** Les masques à retirer : une plateforme masquée dont la session est revenue ('ok'). */
export function masquesARetirer(reglage, etats) {
  const masquees = reglage && typeof reglage === 'object' && reglage.masquees && typeof reglage.masquees === 'object' ? reglage.masquees : {};
  return PLATEFORMES_ALERTE.filter((pf) => masquees[pf] === true && etats?.[pf] === 'ok');
}

const liste = (noms, lang) => {
  if (noms.length <= 1) return noms[0] ?? '';
  return `${noms.slice(0, -1).join(', ')} ${lang === 'en' ? 'and' : 'et'} ${noms[noms.length - 1]}`;
};

/** La ligne de « À régler » : titre et détail, pour une liste d'alertes non vide. */
export function ligneAlertes(alertes, lang = 'fr') {
  const fr = lang !== 'en';
  const connexions = alertes.filter((a) => a.kind === 'connexion').map((a) => NOMS[a.platform] ?? a.platform);
  const restriction = alertes.find((a) => a.kind === 'restriction');
  const parts = [];
  if (connexions.length) {
    parts.push(fr
      ? `${liste(connexions, lang)} : connecte-toi sur ton ordinateur, FillSell ne voit plus ${connexions.length > 1 ? 'ces comptes' : 'ce compte'}`
      : `${liste(connexions, lang)}: sign in on your computer, FillSell no longer sees ${connexions.length > 1 ? 'these accounts' : 'this account'}`);
  }
  if (restriction) {
    parts.push(fr
      ? `Vinted a restreint ton compte${restriction.jusquau ? ` jusqu'au ${restriction.jusquau}` : ''} : rien ne part sur Vinted d'ici là`
      : `Vinted restricted your account${restriction.jusquau ? ` until ${restriction.jusquau}` : ''}: nothing goes out on Vinted until then`);
  }
  const titre = connexions.length && restriction
    ? (fr ? 'Connexion et compte restreint' : 'Sign-in and restricted account')
    : connexions.length
      ? (fr ? `Connecte-toi à ${liste(connexions, lang)}` : `Sign in to ${liste(connexions, lang)}`)
      : (fr ? 'Vinted a restreint ton compte' : 'Vinted restricted your account');
  return { titre, detail: parts.join(' · ') };
}
