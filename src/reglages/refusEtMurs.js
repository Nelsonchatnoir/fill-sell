// ═══════════════════════════════════════════════════════════════════════════
// UN REFUS DU SERVEUR → LE MUR DE SA JAUGE, OU LA PHRASE DU GARDE-FOU (04/11/2026, grille à 3 jauges)
// ═══════════════════════════════════════════════════════════════════════════
// Les hôtes de la feuille des offres (App, Stock, Lens, le stepper) et les Réglages lisent ICI ce qu'un refus
// devient, pour qu'un même refus ouvre le même mur partout. La règle d'affichage reste src/utils/jauges.js ;
// ce module ne fait que la brancher sur les refus et sur quotas_etat. Module pur : aucune lecture, aucun réseau.
//
// ⛔ TOUT EST DERRIÈRE grilleActive(quotas) : interrupteur à 0 (quotas_etat sans « grille »), chaque fonction rend
//    null et l'hôte garde son chemin d'avant, à l'identique.
// ⛔ Le garde-fou du jour n'est JAMAIS un mur : aucune offre, aucun plafond annoncé à l'avance. Il se dit avec la
//    phrase du serveur (ou, quand la fonction edge ne la relaie pas, celle de la maquette 5.6), au moment où il se
//    déclenche.
// ⛔ Jamais une date inventée : la remise à zéro vient du refus, de la page (coin_wallets.next_grant_at) ou de
//    quotas_etat — sinon le mur n'en dit aucune.
import { grilleActive, jaugesDuCompte, jaugeDuRefus, grilleDuPalier, nombre, motJauge } from '../utils/jauges';

const lu = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** Les publications qu'il reste au compte (« Il te reste N publications » sous les murs Annonces et Remontées), ou null. */
export function publicationsRestantes(quotas) {
  const p = jaugesDuCompte(quotas)?.publications;
  return p && !p.illimite && Number.isFinite(p.restantes) ? p.restantes : null;
}

/** La remise à zéro du compte telle que quotas_etat la rend (coin_wallets.next_grant_at, compte Free), ou null. */
export function remiseDuCompte(quotas) {
  return quotas?.republication?.remise_le ?? null;
}

/**
 * Le mur d'une jauge du compte, pour la feuille des offres (trigger 'quota_geste', prop quotaInfo) : la pastille de
 * l'en-tête, le lien d'une jauge vide des Réglages, le viseur Lens. Grille inactive ou jauge illimitée : null.
 *   remise : la remise à zéro déjà lue par l'hôte (ISO), sinon celle de quotas_etat.
 */
export function murDeLaJauge(cle, quotas, { remise = null } = {}) {
  const jauges = jaugesDuCompte(quotas);
  if (!jauges) return null;
  const j = cle === 'lens' ? jauges.lens : jauges[cle];
  if (!j || j.illimite) return null;
  const pubs = cle === 'annonces' || cle === 'remontees' ? publicationsRestantes(quotas) : null;
  return {
    geste: cle,
    plafond: j.plafond,
    consommes: j.consommes,
    restantes: j.restantes,
    remise_le: remise ?? remiseDuCompte(quotas) ?? null,
    ...(pubs != null ? { publications_restantes: pubs } : {}),
  };
}

/**
 * La phrase du garde-fou du jour (maquette 5.6). Le serveur l'écrit (garde_fou_jour → « message ») : elle passe
 * telle quelle. lens-analysis ne relaie que { error, plafond, consommes } : la phrase se dit alors ici, avec le
 * nombre du refus (ce qui a été fait aujourd'hui) — jamais un nombre inventé.
 */
export function messagePause(refus, lang = 'fr') {
  if (typeof refus?.message === 'string' && refus.message.trim()) return refus.message;
  const en = lang === 'en';
  const n = lu(refus?.faites ?? refus?.consommes);
  const cle = ['annonces', 'publications', 'remontees'].includes(refus?.jauge) ? refus.jauge : 'annonces';
  if (en) {
    return `${n != null ? `Safety pause until midnight: you made ${nombre(n, 'en')} ${motJauge(cle, n, 'en')} today.` : 'Safety pause until midnight.'}`
      + ' Beyond that, platforms may restrict your account: FillSell stops for safety until midnight. Nothing was counted.';
  }
  return `${n != null ? `Pause de sécurité jusqu'à minuit : tu as fait ${nombre(n, 'fr')} ${motJauge(cle, n, 'fr')} aujourd'hui.` : "Pause de sécurité jusqu'à minuit."}`
    + " Au-delà, les plateformes risquent de restreindre ton compte : FillSell s'arrête par sécurité jusqu'à minuit. Rien n'a été décompté.";
}

/**
 * Ce qu'un refus devient, avec la grille :
 *   null               → sans la grille, ou refus hors jauges : le chemin d'avant, inchangé ;
 *   { mur: quotaInfo } → la feuille des offres sur le mur de cette jauge (trigger 'quota_geste') ;
 *   { message }        → le garde-fou du jour, ou un article qui demande plus que ce qu'il reste : la phrase,
 *                        JAMAIS une modale d'offres.
 *   remise : la remise à zéro déjà lue par l'hôte (ISO), quand le refus ne la porte pas.
 * 'plafond_republication_free' rend null : il garde son chemin (trigger 'republish_cap'), qui rend déjà le mur
 * Remontées avec la grille.
 */
export function suiteDuRefus(refus, quotas, { lang = 'fr', remise = null } = {}) {
  if (!grilleActive(quotas)) return null;
  const j = jaugeDuRefus(refus);
  if (!j) return null;
  if (j.gardeFou) return { message: messagePause(refus, lang) };
  const code = refus?.reason ?? refus?.error ?? null;
  const plafond = lu(refus?.plafond);
  const remiseLe = refus?.remise_le ?? remise ?? remiseDuCompte(quotas) ?? null;
  const pubs = publicationsRestantes(quotas);

  if (code === 'quota_scan_atteint') {
    // Un scan refusé SOUS LA GRILLE : le Lens du Business (600 par mois) ou le garde-fou des annonces du jour —
    // ailleurs, le quota du mois refuse sous quota_annonces_atteint. lens-analysis ne relaie pas « jauge » : le
    // plafond du refus égal au Lens du Business dit lequel des deux.
    const lens = lu(quotas?.lens?.plafond) ?? grilleDuPalier(null, 'business').lens;
    const estLens = j.cle === 'lens' || (quotas?.palier === 'business' && plafond != null && plafond === lens);
    if (!estLens) return { message: messagePause(refus, lang) };
    return { mur: { geste: 'lens', plafond, consommes: lu(refus?.consommes), restantes: 0, remise_le: remiseLe } };
  }
  if (code === 'quota_annonces_atteint') {
    return { mur: {
      geste: 'annonces', plafond, consommes: lu(refus?.consommes), restantes: 0, remise_le: remiseLe,
      ...(pubs != null ? { publications_restantes: pubs } : {}),
    } };
  }
  if (code === 'quota_publications_atteint') {
    const consommes = lu(refus?.consommes);
    const restantes = lu(refus?.restantes) ?? (plafond != null && consommes != null ? Math.max(0, plafond - consommes) : null);
    // Il en reste, mais moins que l'article n'en demande : ce n'est pas « elles sont toutes faites ». La phrase du
    // serveur dit de décocher une plateforme ; le mur mentirait.
    if (restantes != null && restantes > 0) {
      const demandees = lu(refus?.demandees);
      return { message: typeof refus?.message === 'string' && refus.message.trim() ? refus.message
        : lang === 'en'
          ? `You have ${nombre(restantes, 'en')} ${motJauge('publications', restantes, 'en')} left this month${demandees != null ? `, and this item needs ${nombre(demandees, 'en')}` : ''}: untick a platform. Nothing was published or counted.`
          : `Il te reste ${nombre(restantes, 'fr')} ${motJauge('publications', restantes, 'fr')} ce mois-ci${demandees != null ? `, et cet article en demande ${nombre(demandees, 'fr')}` : ''} : décoche une plateforme. Rien n'a été publié ni décompté.` };
    }
    return { mur: { geste: 'publications', plafond, consommes, restantes: 0, remise_le: remiseLe } };
  }
  if (code === 'plafond_republication_mensuel') {
    return { mur: {
      geste: 'remontees', plafond, consommes: lu(refus?.faites ?? refus?.consommes), restantes: 0, remise_le: remiseLe,
      ...(pubs != null ? { publications_restantes: pubs } : {}),
    } };
  }
  return null;
}
