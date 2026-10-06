// ═══════════════════════════════════════════════════════════════════════════
// FILLSELL CLOUD — LE MAIL DE LA VEILLE DE FIN D'ESSAI — RÈGLES PURES
// (conception du 04/10/2026 soir — branché dans email-tunnel DERRIÈRE une
// garde : rien ne part tant que les colonnes Cloud n'existent pas)
// ═══════════════════════════════════════════════════════════════════════════
// Décisions de Nico : un essai gratuit de 7 jours, carte demandée, qui devient
// payant (20 €/mois) sans geste. La personne est prévenue AVANT, par e-mail,
// par la porte unique existante (envoyerEmail, _shared/desinscription.ts).
//   · type `cloud_essai_veille` : UN par essai, donc un par personne à vie →
//     dans l'index email_logs_one_shot_unique (PROPOSITION SQL), envoi en
//     mode 'reservation' : jamais deux ;
//   · catégorie 'support' : c'est une INFORMATION DE FACTURATION, elle part
//     même chez quelqu'un qui s'est désinscrit des actualités (pas de lien de
//     désinscription, un lien pour arrêter l'essai à la place) ;
//   · elle COMPTE dans le plafond de 2 mails par 24 h (Nico) : elle cherche une
//     place libre dans son créneau, et sa ligne email_logs bloque ensuite le
//     marketing du jour (le plafond d'envoi-ponctuel compte TOUTES les lignes) ;
//     au dernier créneau elle part quand même — elle doit partir.
//
// Le cadre (vérifié le 04/10/2026) :
//   · CJUE, 5 oct. 2023, C-565/22 (Sofatutor) : le consommateur doit être
//     informé « de manière claire, compréhensible et explicite », À LA
//     CONCLUSION du contrat, que la prestation deviendra payante après la
//     période gratuite — sinon un second droit de rétractation s'ouvre au
//     passage au payant. C'est l'écran de souscription qui le porte ; ce mail
//     le rappelle.
//   · Code de la consommation, art. L215-1 (Chatel) : prévenir 1 à 3 mois
//     avant le terme d'un contrat à DURÉE DÉTERMINÉE reconduit tacitement — ne
//     s'applique pas tel quel à un essai de 7 jours. Aucun texte français
//     n'impose un rappel à J-1 : c'est une obligation de loyauté et de bonne
//     pratique, pas un délai légal.
//   · Réseaux de cartes : Visa (avril 2020) et Mastercard (septembre 2022)
//     imposent un rappel avant le premier prélèvement d'un essai ; Mastercard,
//     pour un essai de PLUS de 7 jours, entre 3 et 7 jours avant la fin. Notre
//     essai fait 7 jours tout juste : le préréglage `mastercard` est prêt si
//     l'essai s'allonge ou si la banque le demande.
// Testé : scripts/cloud-rappel-veille-selftest.mjs (npm run selftest:cloud-rappel-veille).

const HEURE_MS = 3_600_000;
const instant = (v) => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const nonVide = (v) => typeof v === 'string' && v.trim() !== '';

export const TYPE_RAPPEL = 'cloud_essai_veille';
export const CATEGORIE_RAPPEL = 'support';
export const DEDUP_RAPPEL = 'reservation';
export const PRIX_AFFICHE = '20 €';          // = CLOUD_PRIX_AFFICHE (src/utils/palier.js)
export const LIEN_APP = 'https://fillsell.app';

// Le créneau : il s'ouvre `ouvertureAvantFinH` heures avant la fin ; jusqu'à
// `forcageAvantFinH` il respecte le plafond (place libre), ensuite il part
// quoi qu'il arrive. Toujours de jour (8 h – 22 h, Paris), comme le reste du
// tunnel : entre le forçage (24 h avant) et la fin, il y a toujours au moins
// 14 heures de jour.
export const PRESETS = Object.freeze({
  veille: Object.freeze({ ouvertureAvantFinH: 48, forcageAvantFinH: 24 }),     // J-2 → J-1 (Nico)
  mastercard: Object.freeze({ ouvertureAvantFinH: 96, forcageAvantFinH: 72 }), // 3 à 7 j avant la fin
});
export const PARAMETRES_RAPPEL = Object.freeze({
  ...PRESETS.veille,
  // (06/10, Nico) Aucun mail automatique n'est retenu par un plafond de mails :
  // le rappel part dès l'ouverture de son créneau, de jour.
  plafond24h: Number.POSITIVE_INFINITY,
  heureDebut: 8,   // = RELANCE_H_DEBUT d'email-tunnel
  heureFin: 22,    // = RELANCE_H_FIN
});

/** Les essais à regarder à ce passage : fin dans ]maintenant, maintenant + ouverture]. */
export function fenetreRequete(maintenant = Date.now(), p = PARAMETRES_RAPPEL) {
  const now = instant(maintenant);
  return {
    finApres: new Date(now).toISOString(),
    finAvant: new Date(now + p.ouvertureAvantFinH * HEURE_MS).toISOString(),
  };
}

/**
 * Qui reçoit le rappel, et quand.
 *   profil     : { email, is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete }
 *   dejaEnvoye : une ligne email_logs `cloud_essai_veille` existe déjà pour ce compte
 *   mails24h   : lignes email_logs de la personne sur 24 h glissantes (tous types, comme envoi-ponctuel)
 *   heureParis : heure (0-23) à Paris ; illisible → on attend (échec fermé, comme le tunnel)
 * → { action: 'envoyer' | 'attendre' | 'rien', raison, force: boolean }
 */
export function decisionRappel({ profil, dejaEnvoye = false, mails24h = 0, heureParis, maintenant = Date.now(), p = PARAMETRES_RAPPEL }) {
  const rien = (raison) => ({ action: 'rien', raison, force: false });
  const attendre = (raison) => ({ action: 'attendre', raison, force: false });
  if (!profil || !nonVide(profil.email)) return rien('sans_adresse');
  const debut = instant(profil.cloud_essai_debut);
  const fin = instant(profil.cloud_essai_fin);
  if (debut == null || fin == null) return rien('pas_d_essai');
  if (profil.cloud_essai_arrete === true) return rien('essai_arrete');        // arrêté : rien ne sera facturé
  if (profil.is_cloud === true) return rien('deja_payant');                   // déjà payée : pas de surprise à annoncer
  if (dejaEnvoye) return rien('deja_envoye');
  const now = instant(maintenant);
  if (now >= fin) return rien('essai_fini');
  if (now < fin - p.ouvertureAvantFinH * HEURE_MS) return attendre('pas_encore');
  const h = Number(heureParis);
  if (!Number.isFinite(h) || h < p.heureDebut || h >= p.heureFin) return attendre('nuit');
  if (now >= fin - p.forcageAvantFinH * HEURE_MS) return { action: 'envoyer', raison: 'dernier_creneau', force: true };
  if ((Number(mails24h) || 0) < p.plafond24h) return { action: 'envoyer', raison: 'place_libre', force: false };
  return attendre('plafond_plein');
}

function partiesDate(iso, lang) {
  const parts = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const v = (t) => parts.find((x) => x.type === t)?.value ?? '';
  return { jour: v('weekday'), num: v('day'), mois: v('month'), h: v('hour'), m: v('minute') };
}

/** « mardi 13 octobre à 18h00 » / « Tuesday 13 October at 18:00 » — heure de Paris, sans dépendre de la version d'ICU. */
export function dateFin(iso, lang = 'fr') {
  const d = partiesDate(iso, lang);
  return lang === 'en' ? `${d.jour} ${d.num} ${d.mois} at ${d.h}:${d.m}` : `${d.jour} ${d.num} ${d.mois} à ${d.h}h${d.m}`;
}

/**
 * Le contenu du mail, en français ou en anglais (profiles.lang), prêt pour
 * renderEmail (_shared/email-template.ts). Aucun lien de désinscription :
 * c'est une information de facturation (catégorie 'support').
 * carteFin : les 4 derniers chiffres de la carte s'ils sont connus du flux de
 * paiement (Mastercard les demande) — jamais stockés par le pool.
 */
export function texteRappel({ lang = 'fr', finIso, prix = PRIX_AFFICHE, carteFin = null }) {
  const en = lang === 'en';
  const quand = dateFin(finIso, en ? 'en' : 'fr');
  const carte = /^\d{4}$/.test(String(carteFin ?? '')) ? String(carteFin) : null;
  if (en) {
    return {
      sujet: `Your Sans ordinateur trial ends on ${quand}`,
      preheader: `If you do nothing, the option continues at ${prix} a month. Stop it before then and nothing is charged.`,
      titre: 'Your free trial ends soon',
      paragraphes: [
        `Your 7-day trial of the Sans ordinateur option ends on ${quand} (Paris time).`,
        `If you do nothing, the option continues at ${prix} a month, charged to the card you saved${carte ? ` (ending in ${carte})` : ''}, from that date.`,
        'If you don\'t want to continue, stop the trial before then in Settings → Subscription. It stops straight away and nothing is charged.',
        'Your FillSell plan is not affected: only the Sans ordinateur option is.',
      ],
      bouton: { texte: 'Open FillSell', url: LIEN_APP },
      raisonEnvoi: 'You are getting this email because you started a trial of the Sans ordinateur option. It is billing information, so it is sent even if you unsubscribed from FillSell news.',
      lienDesinscription: null,
      categorie: CATEGORIE_RAPPEL,
      type: TYPE_RAPPEL,
    };
  }
  return {
    sujet: `Ton essai Sans ordinateur se termine le ${quand}`,
    preheader: `Si tu ne fais rien, l'option continue à ${prix} par mois. Arrête-la avant et rien ne sera facturé.`,
    titre: 'Ton essai gratuit se termine bientôt',
    paragraphes: [
      `Ton essai de 7 jours de l'option Sans ordinateur se termine le ${quand} (heure de Paris).`,
      `Si tu ne fais rien, l'option continue à ${prix} par mois, prélevés sur la carte que tu as enregistrée${carte ? ` (finissant par ${carte})` : ''}, à partir de cette date.`,
      'Si tu ne veux pas continuer, arrête l\'essai avant cette date dans Réglages → Abonnement : l\'arrêt est immédiat et rien n\'est facturé.',
      'Ta formule FillSell n\'est pas concernée : seule l\'option Sans ordinateur l\'est.',
    ],
    bouton: { texte: 'Ouvrir FillSell', url: LIEN_APP },
    raisonEnvoi: 'Tu reçois cet e-mail parce que tu as commencé un essai de l\'option Sans ordinateur. C\'est une information sur ta facturation : elle t\'est envoyée même si tu t\'es désinscrit des actualités de FillSell.',
    lienDesinscription: null,
    categorie: CATEGORIE_RAPPEL,
    type: TYPE_RAPPEL,
  };
}
