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
//
// ── (18/10) UNE BOUTIQUE QUI N'EST PLUS SURVEILLÉE : kind 'non_surveillee' ──
// 8 couples compte × plateforme (654 annonces) dont le relevé était mort depuis
// plus de 24 h, session fermée, sans que l'app le dise : une vente là-bas ne
// retirait pas les autres annonces. La preuve est le RUN (RPC
// surveillance_releves, migration 20261018190000 : dernier relevé réussi > 24 h,
// mur de session postérieur, annonces > 0), jamais extension_sessions.
//   · UNE ligne PAR plateforme, EN TÊTE de « À régler », rouge (risque de double
//     vente), avec UN seul geste : se reconnecter (BoutonMeConnecter) ;
//   · jamais masquable par plateforme (le masque d'une session perdue ne la
//     cache pas : c'est un risque, pas une information) ; le réglage global
//     (desactivees) l'éteint comme le reste ;
//   · elle remplace l'alerte « connexion » de la même plateforme (une seule
//     ligne pour une seule cause).
// Pur, testé par scripts/alertes-compte-selftest.mjs et
// scripts/surveillance-releves-selftest.mjs.
import { restrictionVinted } from '../../supabase/functions/_shared/pas-de-rouge.js';

export const PLATEFORMES_ALERTE = ['vinted', 'leboncoin', 'beebs', 'ebay', 'depop'];
export const CLE_REGLAGE_ALERTES = 'alertes_compte';
/** Les plateformes dont le relevé peut mourir d'une session fermée (eBay relié par l'API : la RPC l'écarte). */
export const PLATEFORMES_SURVEILLANCE = ['vinted', 'leboncoin', 'beebs', 'depop', 'ebay'];
/** Les motifs de BoutonMeConnecter (miroir de MOTIFS, utils/connexionPlateformes.js — ce module reste pur). */
export const MOTIF_CONNEXION = 'connexion';
export const MOTIF_AUTORISER_DEPOP = 'autoriser_depop';
const JOUR_MS = 24 * 3600 * 1000;

const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', depop: 'Depop' };
const ms = (v) => { const t = Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : 0; };

/**
 * Les boutiques qui ne sont plus surveillées, lues dans les lignes de la RPC
 * surveillance_releves (telles que PostgREST les rend). La RPC tranche
 * (`non_surveillee`) ; ici on ne fait que la lire, sans rien deviner :
 * une ligne illisible, une plateforme inconnue ou zéro annonce → rien.
 * @returns {Array<{ platform, kind: 'non_surveillee', jours: number|null, depuis: string|null, annonces: number, marqueur: string|null, motif: string }>}
 */
export function boutiquesNonSurveillees(surveillance, maintenant = Date.now()) {
  const out = [];
  for (const l of Array.isArray(surveillance) ? surveillance : []) {
    if (!l || l.non_surveillee !== true) continue;
    const pf = String(l.platform ?? '');
    if (!PLATEFORMES_SURVEILLANCE.includes(pf)) continue;
    const annonces = Number(l.annonces_en_ligne);
    if (!(Number.isFinite(annonces) && annonces > 0)) continue;
    const depuis = ms(l.dernier_releve_le) ? new Date(ms(l.dernier_releve_le)).toISOString() : null;
    // Jours pleins depuis le dernier relevé réussi, recalculés à l'heure de
    // l'écran (la lecture peut dater de 10 min) ; au moins 1 (> 24 h par règle).
    const jours = depuis ? Math.max(1, Math.floor((maintenant - ms(depuis)) / JOUR_MS)) : null;
    const marqueur = l.dernier_mur_marqueur ? String(l.dernier_mur_marqueur) : null;
    const motif = pf === 'depop' && marqueur === 'acces_non_accorde' ? MOTIF_AUTORISER_DEPOP : MOTIF_CONNEXION;
    out.push({ platform: pf, kind: 'non_surveillee', jours, depuis, annonces, marqueur, motif });
  }
  return out;
}

/** Leboncoin, Beebs, Depop, eBay : annonces du dernier relevé écartées parce qu'un autre compte FillSell les suit. */
export function ecarteesAutreCompte(surveillance) {
  const out = [];
  for (const l of Array.isArray(surveillance) ? surveillance : []) {
    const n = Number(l?.ecartees_autre_compte);
    if (!l || !(Number.isFinite(n) && n > 0)) continue;
    out.push({ platform: String(l.platform ?? ''), n });
  }
  return out;
}

/** La ligne « n'est plus surveillée » : titre et détail (le titre + le détail = la phrase entière). */
export function ligneNonSurveillee(a, lang = 'fr') {
  const fr = lang !== 'en';
  const nom = NOMS[a?.platform] ?? a?.platform ?? '';
  const j = Number.isFinite(a?.jours) && a.jours > 0 ? a.jours : null;
  const acces = a?.motif === MOTIF_AUTORISER_DEPOP;
  const cause = fr
    ? (acces ? `FillSell n'a plus l'autorisation d'ouvrir ${nom}` : 'ta session est fermée')
    : (acces ? `FillSell is no longer allowed to open ${nom}` : 'your session is closed');
  const titre = fr
    ? `Ta boutique ${nom} n'est plus surveillée${j ? ` depuis ${j} jour${j > 1 ? 's' : ''}` : ''} : ${cause}.`
    : `Your ${nom} shop hasn't been watched${j ? ` for ${j} day${j > 1 ? 's' : ''}` : ''}: ${cause}.`;
  const detail = fr
    ? 'Une vente là-bas ne retirera pas tes autres annonces (risque de double vente).'
    : "A sale there won't remove your other listings (risk of selling twice).";
  return { titre, detail };
}

/** Le libellé du geste unique. */
export function libelleReconnexion(a, lang = 'fr') {
  if (a?.motif === MOTIF_AUTORISER_DEPOP) return null; // « Autoriser Depop » : le libellé du bouton lui-même
  return lang === 'en' ? 'Sign in again' : 'Se reconnecter';
}

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
 * @param {{ etats: object|null, jobs: any[], reglage: object|null, maintenant?: number, surveillance?: any[]|null }} arg
 *   etats        : { [pf]: 'ok'|'ko'|null } (utils/sessionsPlateformes.etatSession)
 *   reglage      : platform_settings.alertes_compte, tel quel
 *   surveillance : lignes de la RPC surveillance_releves (null = pas encore lue)
 * @returns {Array<{ platform: string, kind: 'non_surveillee'|'connexion'|'restriction', jusquau?: string|null, fin?: number|null }>}
 *   les 'non_surveillee' d'abord (une par plateforme).
 */
export function alertesCompte({ etats, jobs, reglage, maintenant = Date.now(), surveillance = null }) {
  const r = reglage && typeof reglage === 'object' ? reglage : {};
  if (r.desactivees === true) return [];
  const masquees = r.masquees && typeof r.masquees === 'object' ? r.masquees : {};
  // (18/10) La boutique qui n'est plus surveillée passe devant, et prend la
  // place de l'alerte « connexion » de sa plateforme ; aucun masque ne la cache.
  const out = boutiquesNonSurveillees(surveillance, maintenant);
  const nonSurveillees = new Set(out.map((a) => a.platform));
  for (const pf of PLATEFORMES_ALERTE) {
    if (etats?.[pf] !== 'ko') continue;
    if (masquees[pf] === true) continue;
    if (nonSurveillees.has(pf)) continue;
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
