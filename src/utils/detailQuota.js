// ═══════════════════════════════════════════════════════════════════════════
// LE DÉTAIL DES QUOTAS — CE QUE DIT LA FEUILLE QU'OUVRE LE COMPTEUR DE L'EN-TÊTE (13/11/2026, bloc B1 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Mesuré du 06 au 13/11 : la pastille de quota de l'en-tête ouvrait la fenêtre des offres — 148 ouvertures (77 comptes),
// 115 abandons au premier écran, 2 clics sur une formule. Le geste veut dire « combien il me reste ? » : il ouvre
// désormais CE détail (components/FeuilleQuota.jsx) — ce qui est utilisé, ce qui reste, quand ça repart, ce qui compte —
// avec, en bas et sans pousser, « Besoin de plus ? Voir les offres ». Le badge Premium / Pro / Business (« Ton plan ») et
// « Voir les offres » mènent toujours aux formules.
//
// ⛔ UNE SEULE SOURCE DES CHIFFRES : quotas_etat (chargé par App.fetchAll) lu par jaugesDuCompte (utils/jauges.js) —
//    la même lecture que la pastille de l'en-tête, les Réglages (ConsommationGrille) et les murs. Aucun reste
//    recalculé ici. La date : celle que rend le serveur (quotas_etat.remise_le), sinon celle que l'hôte a lue
//    (coin_wallets.next_grant_at) ; illisible → aucune date, jamais une inventée. Dite à l'heure de Paris.
// ⛔ Les définitions de « ce qui compte » : utils/jaugesExplications.js (la source des carrés des formules).
// ⛔ Les mots : i18n/translations.js (clés quotaDetail*, fr + en). « illimité » avec le mot, jamais un faux chiffre.
// Module pur (Node + Vite) : verrou scripts/detail-quota-selftest.mjs.
import { JAUGES, jaugesDuCompte, nombre, motJauge } from './jauges.js';
import { explicationJauge, libellesExplication } from './jaugesExplications.js';
import { nomDuPalier } from '../../supabase/functions/_shared/palier.js';
import { translations } from '../i18n/translations.js';

/** L'origine des offres ouvertes par le lien du bas de la feuille. */
export const ORIGINE_DETAIL_QUOTA = 'detail_quota';
/** L'origine des offres ouvertes par le lien d'une jauge vide (« 40 par mois en Premium »), sur le mur de la jauge. */
export const ORIGINE_DETAIL_QUOTA_JAUGE = 'detail_quota_jauge';

const T = (lang) => translations[lang === 'en' ? 'en' : 'fr'];
const remplir = (s, v) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const liste = (morceaux, lang) => (morceaux.length < 2 ? morceaux.join('')
  : `${morceaux.slice(0, -1).join(', ')}${lang === 'en' ? ' and ' : ' et '}${morceaux.at(-1)}`);

/** La remise à zéro, en entier et à l'heure de Paris : « 4 décembre » / « 4 December » ; illisible → null. */
export function dateRemiseLongue(iso, lang = 'fr') {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
}

/** La même date, courte (« 04/12 »), à l'heure de Paris — celle que les jauges écrivent (« elles reviennent le 04/12 »). */
export function dateRemiseCourte(iso, lang = 'fr') {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });
}

/** La date de remise retenue : celle de quotas_etat, sinon celle lue par l'hôte, sinon l'ancienne place (Free). */
export function remiseRetenue(quotas, remiseIso = null) {
  return quotas?.remise_le ?? remiseIso ?? quotas?.republication?.remise_le ?? null;
}

/**
 * Ce que la feuille dit, depuis quotas_etat. null quand il n'y a rien à montrer (quotas absents, en erreur, ou sans
 * aucun compteur) — jamais un faux zéro.
 *   remiseIso : la date de remise déjà lue par l'hôte, quand quotas_etat ne la rend pas.
 *   palier    : celui de l'app, sinon quotas_etat.palier.
 * Rend { titre, sous, phrase (ce qui reste, ou null si tout est illimité), illimitees, repart, explications[3],
 *        offres (false pour un Business : la formule du haut), offresLibelle, fermer, ceQuiCompte, neCompteJamais }.
 */
export function resumeQuota(quotas, { lang = 'fr', remiseIso = null, palier = null } = {}) {
  if (!quotas || quotas.error) return null;
  const t = T(lang);
  const en = lang === 'en';
  const date = dateRemiseLongue(remiseRetenue(quotas, remiseIso), lang);
  const p = palier ?? quotas.palier ?? null;
  const nom = nomDuPalier(p) ?? 'Free';
  const business = nomDuPalier(p) === 'Business';

  // Les restes : jaugesDuCompte avec la grille ; sans elle (interrupteur à 0), les compteurs d'avant tels que rendus.
  const jauges = jaugesDuCompte(quotas);
  const finies = [];
  const illimitees = [];
  if (jauges) {
    for (const cle of JAUGES) {
      const j = jauges[cle];
      if (j.illimite) illimitees.push(motJauge(cle, 2, lang));
      else finies.push(`${nombre(j.restantes, lang)} ${motJauge(cle, j.restantes, lang)}`);
    }
  } else {
    const a = quotas.annonces;
    if (a?.plafond != null && Number.isFinite(Number(a.restantes))) finies.push(`${nombre(Number(a.restantes), lang)} ${motJauge('annonces', Number(a.restantes), lang)}`);
    const r = quotas.republication;
    if (r?.mode === 'illimite') illimitees.push(motJauge('remontees', 2, lang));
    else if (r?.plafond != null && Number.isFinite(Number(r.restantes))) finies.push(`${nombre(Number(r.restantes), lang)} ${motJauge('remontees', Number(r.restantes), lang)}`);
  }
  if (!finies.length && !illimitees.length) return null;

  const L = libellesExplication(lang);
  return {
    titre: t.quotaDetailTitre,
    sous: remplir(t.quotaDetailSous, { palier: nom }),
    phrase: finies.length ? remplir(date ? t.quotaDetailReste : t.quotaDetailResteMois, { liste: liste(finies, lang), date }) : null,
    illimitees: illimitees.length ? remplir(t.quotaDetailIllimitees, { liste: majuscule(liste(illimitees, lang)) }) : null,
    // La date est déjà dans la phrase (« jusqu'au 4 décembre ») : « ce jour-là » ; sans phrase (tout illimité), la date.
    repart: !date ? t.quotaDetailRepartMois : finies.length ? t.quotaDetailRepartCeJour : remplir(t.quotaDetailRepart, { date }),
    explications: JAUGES.map((cle) => ({ cle, ...explicationJauge(cle, lang) })),
    ceQuiCompte: t.quotaDetailCeQuiCompte,
    neCompteJamais: t.quotaDetailNeCompteJamais,
    compteAussi: L.compte,
    offres: !business,
    offresLibelle: t.quotaDetailOffres,
    fermer: t.quotaDetailFermer,
    grille: Boolean(jauges),
    en,
  };
}
