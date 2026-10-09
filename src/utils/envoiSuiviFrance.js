// ═══════════════════════════════════════════════════════════════════════════
// ENVOI SUIVI EN FRANCE — LA GRILLE DE LA FEUILLE « FRAIS DE PORT DEPOP »
// ═══════════════════════════════════════════════════════════════════════════
// PRIX RÉELS SEULEMENT, lus le 09/10/2026 sur les grilles OFFICIELLES (aucun
// comparateur, aucun montant de mémoire). Prix TTC pour un particulier,
// France métropolitaine, suivi inclus. Affichés comme « prix indicatifs ».
//
//   · Colissimo France, livraison à domicile — La Poste, PDF « Particuliers
//     France métropolitaine », « Tarifs applicables à partir du 1 avril 2026 »
//     (mêmes chiffres sur laposte.fr/tarif-colissimo, « à partir du 1er
//     janvier 2026 ») ; même prix au guichet, à l'automate et en ligne.
//   · Mondial Relay, dépôt et livraison en Point Relais® ou Locker — achat en
//     ligne, « Tarifs applicables au 15 juin 2026 pour les envois en France ».
//
// ⚠️ À REVOIR au 01/01/2027 : La Poste annonce +4,1 % en moyenne sur les
//    Colissimo des particuliers (service-public.gouv.fr, 28/07/2026) — la
//    grille 2027 n'était pas publiée le 09/10/2026.
// ═══════════════════════════════════════════════════════════════════════════

export const ENVOI_SUIVI_LU_LE = '2026-10-09';

export const TRANSPORTEURS_SUIVI = Object.freeze([
  {
    cle: 'colissimo',
    nom: 'Colissimo',
    mode: { fr: 'à domicile', en: 'home delivery' },
    source: {
      url: 'https://www.laposte.fr/tarif-colissimo',
      validite: { fr: 'tarifs La Poste au 1er avril 2026', en: 'La Poste rates as of 1 April 2026' },
    },
  },
  {
    cle: 'mondial_relay',
    nom: 'Mondial Relay',
    mode: { fr: 'en Point Relais', en: 'to a pickup point' },
    source: {
      url: 'https://www.mondialrelay.fr/envoi-de-colis/tarifs-expeditions/',
      validite: { fr: 'tarifs au 15 juin 2026', en: 'rates as of 15 June 2026' },
    },
  },
]);

// Une ligne par taille de colis : le poids MAXIMAL de la tranche, et le prix
// de chaque transporteur pour cette tranche (lu, jamais calculé).
export const GRILLE_ENVOI_SUIVI = Object.freeze([
  { cle: 'tres_petit', taille: { fr: 'Très petit', en: 'Extra small' }, poids: { fr: 'jusqu’à 250 g', en: 'up to 250 g' }, exemple: { fr: 'bijou, accessoire', en: 'jewellery, accessory' }, prix: { colissimo: 5.49, mondial_relay: 4.15 } },
  { cle: 'petit',      taille: { fr: 'Petit',      en: 'Small' },       poids: { fr: 'jusqu’à 500 g', en: 'up to 500 g' }, exemple: { fr: 't-shirt, top', en: 'T-shirt, top' }, prix: { colissimo: 7.59, mondial_relay: 4.15 } },
  { cle: 'moyen',      taille: { fr: 'Moyen',      en: 'Medium' },      poids: { fr: 'jusqu’à 1 kg',  en: 'up to 1 kg' },  exemple: { fr: 'jean, pull', en: 'jeans, jumper' }, prix: { colissimo: 9.59, mondial_relay: 5.99 } },
  { cle: 'grand',      taille: { fr: 'Grand',      en: 'Large' },       poids: { fr: 'jusqu’à 2 kg',  en: 'up to 2 kg' },  exemple: { fr: 'chaussures, manteau', en: 'shoes, coat' }, prix: { colissimo: 11.19, mondial_relay: 7.99 } },
  { cle: 'tres_grand', taille: { fr: 'Très grand', en: 'Extra large' }, poids: { fr: 'jusqu’à 5 kg',  en: 'up to 5 kg' },  exemple: { fr: 'lot, sac de voyage', en: 'bundle, travel bag' }, prix: { colissimo: 17.39, mondial_relay: 15.99 } },
]);

/** 7.59 → « 7,59 € » (fr) / « €7.59 » (en). */
export function prixAffiche(n, lang = 'fr') {
  const s = Number(n).toFixed(2);
  return lang === 'en' ? `€${s}` : `${s.replace('.', ',')} €`;
}
