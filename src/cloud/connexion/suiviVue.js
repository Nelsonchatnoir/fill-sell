// ═══════════════════════════════════════════════════════════════════════════
// L'AUTOMATE DE LA PAGE DE CONNEXION — ce que l'écran fait de chaque étape du serveur (pur : ni DOM, ni réseau)
// ═══════════════════════════════════════════════════════════════════════════
// Partagé par les trois écrans qui montrent la page de connexion (MeConnecterCloud.jsx › Vue, utilisée aussi par le
// parcours d'entrée et le bandeau de reconnexion). Verrou : selftest:cloud-connexion-meme-appareil.
//
// (14/11/2026, cliente 13e274de — Vinted connecté en 40 min, Edge sur Android) LA MÊME PERSONNE NE SE COUPE JAMAIS
// ELLE-MÊME. Sa page Vinted était ouverte dans un onglet (A) ; elle quitte Edge pour lire le code de Vinted ; une
// DEUXIÈME page FillSell se charge dans le même Edge (B) ; B touche Vinted : le serveur reprend la page Vinted pour B
// (rien n'est perdu côté serveur) et dit « remplacee » à A. A, en arrière-plan, s'ARRÊTAIT pour de bon (« celle-ci
// s'arrête… ferme puis rouvre la plateforme ») : la personne qui revenait sur A trouvait une fin.
// Règle :
//   · une page remplacée PENDANT QU'ON NE LA REGARDAIT PAS (cachée, ou revenue au premier plan depuis moins de
//     VUE_STABLE_MS : une page dégelée lit ses messages en attente juste après son retour) se met en PAUSE —
//     « ta connexion continue sur ton autre écran », et « Continuer ici » la reprend là où elle en était ;
//   · jamais de reprise toute seule (09/11, cliente d813639b : deux écrans qui se reprennent l'un l'autre bouclent) :
//     seul un toucher (« Continuer ici ») remplace une page ouverte ;
//   · une page remplacée SOUS LES YEUX de la personne (deux écrans allumés) finit comme avant (« remplacee »).
import { repriseApresFermeture } from './clientConnexion.js';

export const VUE_STABLE_MS = 1500;

/** (pure) Cet évènement dit-il que le serveur a donné la page à un autre écran ? « remplacee », ou fermeture 1000 / 4409. */
export const estRemplacement = (etape, code = null) => etape === 'remplacee' || (etape === 'ferme' && !repriseApresFermeture(code));

/** (pure) La personne regardait-elle la page ? Visible, et depuis au moins VUE_STABLE_MS. */
export const regardee = (visibleDepuis, maintenant) => visibleDepuis != null && maintenant - visibleDepuis >= VUE_STABLE_MS;

/**
 * L'automate d'UNE page de connexion.
 *   finales : les étapes finales de l'écran (MeConnecterCloud.jsx, ETAPES_FINALES) ;
 *   agir    : { clavier(v), cookies(v), message(m), verifiee(), fin(etape, m), pause(par), reprendre(), fermerApres() } ;
 *   visible : la page est-elle au premier plan à l'ouverture (on vient de la toucher : oui) ;
 *   maintenant : l'horloge (injectable pour le verrou).
 * → { etape(etape, m, info), visibilite(visible), continuerIci() → bool, terminer(), finale, enPause }
 */
export function creerSuiviVue({ finales = [], agir, visible = true, maintenant = () => Date.now() }) {
  let finale = false;
  let enPause = false;
  // Ouverte par un toucher : la personne la regarde déjà (aucun délai de grâce à l'ouverture).
  let visibleDepuis = visible ? maintenant() - VUE_STABLE_MS : null;
  return {
    get finale() { return finale; },
    get enPause() { return enPause; },
    visibilite(v) { visibleDepuis = v ? maintenant() : null; },
    /** Plus rien ne se fait (reprises épuisées, fermeture par l'écran). */
    terminer() { finale = true; },
    etape(etape, m = '', info = null) {
      if (etape === 'clavier') { agir.clavier?.(m === true); return; }
      if (etape === 'cookies') { agir.cookies?.(m === true); return; }
      // En pause : ni l'« expire » qui suit « remplacee », ni la fermeture 4409 ne changent l'écran.
      if (enPause) return;
      if (estRemplacement(etape, info?.code ?? null)) {
        if (finale) return;
        const par = etape === 'ferme' ? `code_${info?.code ?? null}` : 'etape';
        if (regardee(visibleDepuis, maintenant())) { finale = true; agir.fin?.('remplacee', etape === 'ferme' ? par : m); return; }
        enPause = true;
        agir.pause?.(par);
        return;
      }
      // Une coupure (réseau, appli en arrière-plan, redémarrage du serveur) : la page se reprend, comme avant.
      if (etape === 'ferme') { if (!finale) agir.reprendre?.(); return; }
      if (m) agir.message?.(m);
      if (etape === 'verifie') agir.verifiee?.();
      if (finales.includes(etape)) { const deja = finale; finale = true; if (!deja) agir.fin?.(etape, m); }
      if (etape === 'connecte' || etape === 'resolu') agir.fermerApres?.();
    },
    /** « Continuer ici » (un toucher) : la page en pause repart. Vrai une fois ; faux hors pause ou après une fin. */
    continuerIci() {
      if (!enPause || finale) return false;
      enPause = false;
      visibleDepuis = maintenant() - VUE_STABLE_MS;
      return true;
    },
  };
}
