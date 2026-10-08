// ═══════════════════════════════════════════════════════════════════════════
// VENTES PROUVÉES — LA VEILLE (08/10/2026, audit de fiabilisation)
// ═══════════════════════════════════════════════════════════════════════════
// Du 28/09 16:46 au 08/10, la règle « une vente vue sur l'identifiant exact
// s'enregistre seule » n'avait PLUS AUCUN appelant, et personne ne l'a vu : les
// docs la disaient active. Désormais le cron SQL `ventes-prouvees-2min` appelle
// `ventes_prouvees_tick()` (migration 20261008233100), et cette veille lit
// `ventes_prouvees_veille()` :
//   · veille-cpu (toutes les 2 min) prévient support@ si le cron ne tourne
//     plus, si ses passages échouent, ou si une preuve « sold » attend depuis
//     plus de 30 min — une alerte par heure au plus ;
//   · l'ops-digest (quotidien) affiche la section « Ventes prouvées ».
// ⛔ CE MODULE NE LIT RIEN ET N'ÉCRIT RIEN (Deno et Node) : il décide.
// Règles testées : scripts/ventes-prouvees-selftest.mjs.

export const VENTES_PROUVEES = Object.freeze({
  CRON: "ventes-prouvees-2min",
  PERIODE_MIN: 2,
  // Le cron passe toutes les 2 min : 10 min sans passage = il ne tourne plus.
  SILENCE_MAX_MIN: 10,
  // Une preuve « sold » arrivée depuis l'armement et pas enregistrée après 30 min.
  RETARD_MIN: 30,
  ALERTE_INTERVALLE_MIN: 60,
});

const nombre = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Les anomalies de la veille (liste vide = tout va bien, ou fonction coupée).
 * veille : le jsonb rendu par public.ventes_prouvees_veille().
 */
export function anomaliesVentesProuvees(veille) {
  if (!veille || typeof veille !== "object") {
    return [{ code: "veille_illisible", grave: true, texte: "La veille des ventes prouvées est illisible (migration 20261008233100 appliquée ?)." }];
  }
  if (!veille.arme) return [];   // coupée volontairement (coin_config ventes_prouvees_auto_depuis = 0) : rien à surveiller
  const a = [];
  const silence = veille.minutes_depuis_dernier_passage;
  if (silence == null) {
    a.push({ code: "jamais_tourne", grave: true, texte: `Le cron ${VENTES_PROUVEES.CRON} n'a encore jamais tourné (armé depuis ${veille.depuis ?? "?"}).` });
  } else if (nombre(silence) > VENTES_PROUVEES.SILENCE_MAX_MIN) {
    a.push({ code: "ne_tourne_plus", grave: true, texte: `Le cron ${VENTES_PROUVEES.CRON} n'a pas tourné depuis ${nombre(silence)} min (il passe toutes les ${VENTES_PROUVEES.PERIODE_MIN} min).` });
  }
  if (veille.dernier_passage && veille.dernier_passage.issue === "erreur") {
    a.push({ code: "passage_en_erreur", grave: true, texte: "Le dernier passage des ventes prouvées a échoué (ventes_prouvees_passages.detail)." });
  }
  if (nombre(veille.en_retard) > 0) {
    a.push({ code: "ventes_en_retard", grave: true,
      texte: `${nombre(veille.en_retard)} vente${nombre(veille.en_retard) > 1 ? "s" : ""} prouvée${nombre(veille.en_retard) > 1 ? "s" : ""} « sold » non enregistrée${nombre(veille.en_retard) > 1 ? "s" : ""} depuis plus de ${VENTES_PROUVEES.RETARD_MIN} min (${nombre(veille.en_retard_comptes)} compte${nombre(veille.en_retard_comptes) > 1 ? "s" : ""}) : leurs copies restent en vente ailleurs.` });
  }
  return a;
}

/**
 * Faut-il prévenir maintenant ? Une alerte par heure au plus (jamais une rafale
 * toutes les 2 min), seulement pour une anomalie grave.
 */
export function deciderAlerteVentesProuvees({ veille, derniereAlerte = null, maintenant = Date.now() }) {
  const anomalies = anomaliesVentesProuvees(veille).filter((x) => x.grave);
  if (!anomalies.length) return { action: null, anomalies };
  const derniere = derniereAlerte ? Date.parse(derniereAlerte) : NaN;
  if (Number.isFinite(derniere) && maintenant - derniere < VENTES_PROUVEES.ALERTE_INTERVALLE_MIN * 60_000) {
    return { action: null, anomalies, retenue: "une alerte par heure au plus" };
  }
  return { action: "alerte", anomalies };
}

/** Les lignes de la section ops-digest (toujours affichée : un silence n'est jamais « tout va bien »). */
export function lignesVentesProuvees(veille) {
  if (!veille || typeof veille !== "object") return ["Veille illisible : la migration 20261008233100 est-elle appliquée ?"];
  const l = [];
  l.push(veille.arme
    ? `Armée depuis ${veille.depuis} — ${nombre(veille.passages_24h)} passage(s) en 24 h (${nombre(veille.passages_en_erreur_24h)} en erreur), ${nombre(veille.enregistrees_24h)} vente(s) enregistrée(s).`
    : "COUPÉE (coin_config ventes_prouvees_auto_depuis = 0) : les ventes prouvées attendent le clic de la personne.");
  if (veille.dernier_passage) l.push(`Dernier passage : ${veille.dernier_passage.debut} (${veille.dernier_passage.issue}, ${nombre(veille.dernier_passage.duree_ms)} ms), il y a ${nombre(veille.minutes_depuis_dernier_passage)} min.`);
  l.push(`En retard (preuve depuis l'armement, > ${VENTES_PROUVEES.RETARD_MIN} min) : ${nombre(veille.en_retard)} (${nombre(veille.en_retard_comptes)} compte(s)).`);
  l.push(`Arriéré d'avant l'armement (rattrapage sur décision de Nico) : ${nombre(veille.anterieures)} (${nombre(veille.anterieures_comptes)} compte(s)).`);
  l.push(`Dont une copie vue en ligne ailleurs depuis 3 jours : ${nombre(veille.avec_copie_vue_3j)}.`);
  const refus = veille.refus_par_raison && typeof veille.refus_par_raison === "object" ? Object.entries(veille.refus_par_raison) : [];
  l.push(`Refus mémorisés (réexaminés toutes les 6 h) : ${nombre(veille.refus_actifs)}${refus.length ? ` — ${refus.map(([k, v]) => `${v} × « ${k} »`).join(" ; ")}` : ""}.`);
  return l;
}
