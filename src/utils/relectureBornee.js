// ═══════════════════════════════════════════════════════════════════════════
// RELECTURE BORNÉE — LA SEULE FAÇON DE RELIRE LA BASE EN BOUCLE (04/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Incident du 04/10 (base à 99 % de CPU, app bloquée sur le chargement pour
// tout le monde) : chaque écran relisait la base à cadence fixe — 7 requêtes
// toutes les 30 s pour « Mes annonces en ligne », tout l'historique des jobs
// toutes les 20 s pour le Stock, 7 requêtes par minute pour l'accès Opla —
// y compris onglet caché, et SANS ralentir quand la base peinait : plus elle
// ralentissait, plus les lectures s'empilaient.
//
// La règle, tenue ici et nulle part ailleurs :
//   · on ne relit QUE si l'onglet est visible ; au retour, une lecture si la
//     dernière est plus vieille que l'intervalle ;
//   · une seule lecture à la fois, jamais deux en vol ;
//   · une lecture en ERREUR, ou LENTE (au-delà de `lentMs`), DOUBLE l'attente
//     suivante, jusqu'à `maxMs` ; une lecture saine la ramène à l'intervalle ;
//   · minuterie en chaîne (setTimeout), jamais setInterval : l'attente se
//     calcule APRÈS la réponse, pas pendant.
// `lire` rend une promesse ; elle échoue (throw) ou rend `false` pour dire
// « raté ». Tout autre retour vaut succès.

/** L'attente suivante, pure (testée : scripts/relecture-bornee-selftest.mjs). */
export function attenteSuivante(attenteActuelle, { intervalleMs, maxMs, rate, dureeMs, lentMs }) {
  const base = Math.max(1000, Number(intervalleMs) || 60_000);
  const plafond = Math.max(base, Number(maxMs) || 10 * 60_000);
  const mauvais = rate === true || (Number.isFinite(dureeMs) && Number.isFinite(lentMs) && dureeMs > lentMs);
  if (!mauvais) return base;
  const actuelle = Math.max(base, Number(attenteActuelle) || base);
  return Math.min(plafond, actuelle * 2);
}

/**
 * Démarre une relecture bornée. Rend { arreter, relireMaintenant, changerIntervalle }.
 * @param {() => Promise<unknown>} lire
 * @param {{ intervalleMs: number, maxMs?: number, lentMs?: number, immediat?: boolean }} opts
 */
export function demarrerRelecture(lire, { intervalleMs, maxMs = 10 * 60_000, lentMs = 4000, immediat = true } = {}) {
  let arrete = false;
  let enVol = false;
  let minuterie = null;
  let intervalle = intervalleMs;
  let attente = intervalleMs;
  let derniere = 0;
  const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

  const planifier = (ms) => {
    if (arrete) return;
    if (minuterie) clearTimeout(minuterie);
    minuterie = setTimeout(tour, ms);
  };

  async function tour() {
    minuterie = null;
    if (arrete) return;
    // Onglet caché : on ne relit pas, et on ne se replanifie pas — le retour
    // de visibilité relancera.
    if (!visible()) return;
    if (enVol) { planifier(attente); return; }
    enVol = true;
    const t0 = Date.now();
    let rate = false;
    try {
      const r = await lire();
      if (r === false) rate = true;
    } catch {
      rate = true;
    } finally {
      enVol = false;
    }
    derniere = Date.now();
    attente = attenteSuivante(attente, { intervalleMs: intervalle, maxMs, rate, dureeMs: derniere - t0, lentMs });
    planifier(attente);
  }

  const surVisibilite = () => {
    if (arrete || !visible()) return;
    if (enVol || minuterie) return;
    const ecoule = Date.now() - derniere;
    planifier(ecoule >= attente ? 0 : attente - ecoule);
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', surVisibilite);

  if (immediat) planifier(0); else { derniere = Date.now(); planifier(attente); }

  return {
    arreter() {
      arrete = true;
      if (minuterie) clearTimeout(minuterie);
      minuterie = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', surVisibilite);
    },
    /** Un geste de la personne : on relit tout de suite et l'attente revient à l'intervalle. */
    relireMaintenant() {
      if (arrete) return;
      attente = intervalle;
      planifier(0);
    },
    /** Nouvelle cadence (ex. un relevé démarre) — appliquée dès le prochain tour. */
    changerIntervalle(ms) {
      if (!Number.isFinite(ms) || ms === intervalle) return;
      const raccourci = ms < intervalle;
      intervalle = ms;
      attente = ms;
      if (raccourci && minuterie && !enVol) planifier(ms);
    },
  };
}
