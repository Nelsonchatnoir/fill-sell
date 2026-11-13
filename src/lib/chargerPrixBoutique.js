// Le CHARGEMENT des prix de la boutique (08/11/2026, refus Google Play de la vc36) — règles : lib/prixBoutique.js.
// iPhone : App Store (StoreKit) ; Android : Google Play Billing. Une lecture au démarrage de l'app, relue à la demande
// (ouverture d'un écran de prix) si elle a échoué, au plus une fois par minute. Web : rien à charger (prix Stripe).
import { Capacitor } from '@capacitor/core';
import { NativePurchases } from '@capgo/native-purchases';
import { PRODUCT_IDS } from './iap';
import { poserPrixBoutique, lirePrixBoutique, lireProduitsBoutique, avecDelai, poserEligibiliteApple } from './prixBoutique';
import { idsFormulesBoutique } from './idsFormulesBoutique';
import { eligibiliteApple } from './eligibiliteApple';

// (13/11/2026, point b de Nico) iPhone : l'historique Apple de l'identifiant du téléphone (Transaction.all de StoreKit, par
// le getPurchases du module d'achat — déjà utilisé par « Restaurer les achats »), lu avec les prix, borné à
// DELAI_LECTURE_MS ; il dit si la semaine gratuite d'Apple sera offerte (lib/eligibiliteApple.js). Échec ou délai : null
// (« inconnu » : un texte vrai dans les deux cas, jamais « 7 jours gratuits » affirmé). Ne lève jamais.
export function chargerEligibiliteApple() {
  return avecDelai(() => NativePurchases.getPurchases(), DELAI_LECTURE_MS)
    .then(({ purchases } = {}) => eligibiliteApple(purchases))
    .catch((err) => { console.warn('[prix] historique Apple illisible :', err?.message ?? err); return null; })
    .then((el) => { poserEligibiliteApple(el); return el; });
}

// Le Cloud : même identifiant Apple et Google (cloud/achatCloud.js, PRODUIT_CLOUD).
export const ID_CLOUD_BOUTIQUE = 'app.fillsell.cloud.sub';
const RELECTURE_MIN_MS = 60_000;
export const DELAI_LECTURE_MS = 8_000;
let enVol = null;
let derniereTentative = 0;
// (11/11/2026) Les produits des formules avec Cloud ne sont demandés à la boutique QUE quand les formules se montrent à ce
// compte (demanderPrixFormules) : fermées, la lecture est celle d'avant, produit pour produit.
let formulesDemandees = false;

export function idsBoutique({ formules = false } = {}) {
  const ids = { premium: PRODUCT_IDS.standard, pro: PRODUCT_IDS.pro, business: PRODUCT_IDS.business, cloud: ID_CLOUD_BOUTIQUE };
  return formules ? { ...ids, ...idsFormulesBoutique(Capacitor.getPlatform() === 'ios' ? 'apple' : 'google') } : ids;
}

/** (11/11) Les formules avec Cloud se montrent : leurs prix sont lus (une fois ; relecture forcée si déjà lus sans eux). */
export function demanderPrixFormules() {
  if (formulesDemandees) return chargerPrixBoutique();
  formulesDemandees = true;
  if (!Capacitor.isNativePlatform()) return Promise.resolve(lirePrixBoutique());
  // Une lecture d'avant (sans les formules) déjà en vol : la relecture forcée part juste après elle.
  return (enVol ?? Promise.resolve()).then(() => chargerPrixBoutique({ force: true }));
}

/** Lit les prix (natif seulement). `force` : relit même si une lecture a déjà réussi. Ne lève jamais. */
export function chargerPrixBoutique({ force = false } = {}) {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(lirePrixBoutique());
  const canal = Capacitor.getPlatform() === 'ios' ? 'apple' : 'google';
  const e = lirePrixBoutique();
  if (!force && e.canal === canal && e.statut === 'pret') return Promise.resolve(e);
  if (enVol) return enVol;
  if (!force && e.canal === canal && e.statut === 'echec' && Date.now() - derniereTentative < RELECTURE_MIN_MS) return Promise.resolve(e);
  derniereTentative = Date.now();
  if (e.canal !== canal) poserPrixBoutique({ canal, statut: 'chargement', prix: {} });
  const ids = idsBoutique({ formules: formulesDemandees });
  // (09/11, repli de l'iPhone) Une lecture qui ne répond pas en DELAI_LECTURE_MS vaut un échec : sur iPhone, l'écran
  // d'achat passe au prix de repli (lib/prixBoutique.js repliApple) au lieu de rester sur « … » sans fin.
  // Un module natif absent ou qui lève d'un coup (vieux binaire) devient un échec, jamais une exception (avecDelai).
  // (13/11) iPhone : l'historique Apple se relit à chaque lecture des prix (un achat fait entre-temps change la réponse).
  if (canal === 'apple') chargerEligibiliteApple();
  enVol = avecDelai(() => NativePurchases.getProducts({ productIdentifiers: Object.values(ids), productType: 'subs' }), DELAI_LECTURE_MS)
    .then(({ products }) => {
      const prix = lireProduitsBoutique(products, { canal, ids });
      poserPrixBoutique({ canal, statut: Object.keys(prix).length ? 'pret' : 'echec', prix });
    })
    .catch((err) => {
      console.warn('[prix] lecture des prix de la boutique impossible :', err?.message ?? err);
      const avant = lirePrixBoutique();
      poserPrixBoutique({ canal, statut: 'echec', prix: avant.canal === canal ? avant.prix : {} });
    })
    .finally(() => { enVol = null; })
    .then(() => lirePrixBoutique());
  return enVol;
}
