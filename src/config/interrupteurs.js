// ═══════════════════════════════════════════════════════════════════════════
// LES INTERRUPTEURS D'OUVERTURE, LUS SUR LE SERVEUR AU DÉMARRAGE (06/11/2026, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Le binaire soumis doit être complet dès l'installation » : plus aucun drapeau d'ouverture figé dans le bundle.
// Ouvrir le Cloud, la grille à 3 jauges ou les relevés multi-plateformes = une ligne dans coin_config, jamais une OTA
// ni un binaire. Ces clés sont lues UNE fois, au démarrage de l'app (lireInterrupteurs, appelée par main.jsx avant le
// premier rendu), en une seule requête (coin_config est lisible par tous, connecté ou non).
//
// ⛔ VALEUR SÛRE : tant que la réponse n'est pas revenue, ou si elle échoue / dépasse DELAI_MS, tout est FERMÉ
//    (interrupteurOuvert → false). Un écran qui choisit entre deux interfaces selon un interrupteur ne rend RIEN tant
//    que interrupteursConnus() est faux (jamais l'ancienne interface « en attendant » : c'était le flash du 06/11 —
//    la carte « Synchroniser mes annonces Vinted » de septembre montrée ~0,25 s à chaque ouverture du Stock, le temps
//    de lire sync_multi_ouverte). Au-delà de DELAI_MS, « fermé » devient la réponse : aucun écran ne reste bloqué.
// ⛔ Les mêmes clés gardent le SERVEUR (create-checkout-session lit cloud_offre_ouverte, quotas_etat lit
//    grille_trois_jauges) : l'app ne PROPOSE que ce que le serveur accepte.
// Aucun import : ce module (et config/cloudOffer.js qui le lit) se charge aussi sous Node, dans les selftests ; le
// client Supabase est passé par l'appelant (main.jsx).

export const CLES_OUVERTURE = Object.freeze([
  'cloud_offre_ouverte',          // le Cloud vendu à tous (sinon : témoins seulement, profiles.beta_flags.cloud)
  'grille_trois_jauges',          // la grille annonces · publications · remontées (utils/jauges.js)
  'sync_multi_ouverte',           // relevés multi-plateformes (BlocSynchro) — sinon la carte Vinted d'avant
  'republication_multi_ouverte',  // republication hors Vinted
  'descente_formule_ouverte',     // (09/11, C4) « Voir les autres formules » et descendre à la fin de la période (web)
  // (11/11, formules avec Cloud) Un interrupteur PAR CANAL (contrat _shared/formules-cloud.js, CLE_INTERRUPTEUR_FORMULES) :
  // le web peut ouvrir avant l'approbation d'Apple, Android attend la vc37. Absent = fermé.
  'cloud_formules_stripe',
  'cloud_formules_apple',
  'cloud_formules_google',
]);
export const DELAI_MS = 4000;

let valeurs = null;        // null = pas encore lues ; objet = lues (une clé absente = fermée)
let enVol = null;
const ecouteurs = new Set();

function publier(v) {
  valeurs = v;
  for (const f of ecouteurs) { try { f(v); } catch { /* un écouteur ne casse jamais la lecture */ } }
}

/** La lecture unique (rejouée seulement après un échec). Rend les valeurs ; jamais d'exception. */
export function lireInterrupteurs(client, { delaiMs = DELAI_MS } = {}) {
  if (valeurs && !valeurs.__echec) return Promise.resolve(valeurs);
  if (!client) { if (!valeurs) publier({ __echec: true }); return Promise.resolve(valeurs); }
  if (enVol) return enVol;
  enVol = (async () => {
    let lu = null;
    try {
      const requete = Promise.resolve(client.from('coin_config').select('key, value').in('key', CLES_OUVERTURE));
      const delai = new Promise((res) => setTimeout(() => res({ delai: true }), delaiMs));
      const r = await Promise.race([requete, delai]);
      if (r && !r.delai && !r.error && Array.isArray(r.data)) {
        lu = {};
        for (const ligne of r.data) lu[ligne.key] = ligne.value;
      }
    } catch { /* illisible : fermé */ }
    // Échec ou délai dépassé : FERMÉ partout, et une prochaine lecture pourra réessayer.
    publier(lu ?? { __echec: true });
    enVol = null;
    return valeurs;
  })();
  return enVol;
}

/** Vrai dès qu'une réponse (ou l'échec qui vaut « fermé ») est connue. */
export const interrupteursConnus = () => valeurs !== null;
/** L'état d'UNE clé : true seulement si le serveur a dit 1. Pas encore lu, échec, absente = false. */
export const interrupteurOuvert = (cle) => Number(valeurs?.[cle]) === 1;
/** Prévenu à chaque lecture terminée ; rend la fonction qui se désabonne. */
export function ecouterInterrupteurs(f) {
  ecouteurs.add(f);
  return () => ecouteurs.delete(f);
}
/** Pour les selftests seulement. */
export function _remettreAZero(v = null) { valeurs = v; enVol = null; ecouteurs.clear(); }
