// ═══════════════════════════════════════════════════════════════════════════
// LA PREMIÈRE SYNCHRO PART SEULE (26/10, Azizak Shop — règle de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Azizak Shop : inscrit à 11:27, 5 plateformes choisies, extension active à 12:05, Vinted connecté — jamais touché
// « Synchroniser » : 0 fiche, 0 annonce, un prospect chaud qui ne voit rien. Mesure du 26/10 : sur 102 inscrits des
// 15 derniers jours dont l'extension a été vue, 20 n'ont jamais eu de synchro, 14 avec une plateforme connectée.
// LA RÈGLE : dès que l'extension passe (get-pending-jobs) et qu'au moins une plateforme CHOISIE y est connectée, un
// compte récent (coin_config.premiere_synchro_auto_jours, défaut 15) qui n'a JAMAIS eu de synchro demandée reçoit SA
// première synchro, par les MÊMES demandes que le bouton (demander_sync_dressing, demander_sync_plateforme : les seuls
// déclencheurs que l'extension déjà installée importe). Une fois par compte : la demande posée est elle-même la
// marque. Interrupteur : coin_config.premiere_synchro_auto = 0 coupe tout (absent = en marche).
// Pur (Deno + Node) : scripts/premiere-synchro-selftest.mjs.

export const DECLENCHEUR_GESTE_RE = /^(bouton|bouton_distant|app)(:redemande)?$/;
export const PREMIERE_SYNCHRO_JOURS_DEFAUT = 15;

/**
 * Les plateformes dont la première synchro doit partir maintenant (vide : rien à faire).
 * @param {object} p
 * @param {string|null} p.inscritLe            profiles.created_at
 * @param {unknown} p.platformSettings          profiles.platform_settings (plateformes_vendeur)
 * @param {unknown} p.sessions                  profiles.extension_sessions ({ vinted: true, … })
 * @param {Array<{declencheur?: string|null}>} p.runs  les relevés du compte (vinted_sync_runs dressing/annonces)
 * @param {{ actif?: boolean, jours?: number }} [p.reglage]
 * @param {number} [p.maintenant]
 * @returns {string[]}
 */
export function premiereSynchroAPoser({ inscritLe, platformSettings, sessions, runs = [], reglage = {}, maintenant = Date.now() }) {
  if (reglage.actif === false) return [];
  const jours = Number(reglage.jours) > 0 ? Number(reglage.jours) : PREMIERE_SYNCHRO_JOURS_DEFAUT;
  const t = Date.parse(String(inscritLe ?? ""));
  if (!Number.isFinite(t) || maintenant - t > jours * 86_400_000) return [];
  if ((runs ?? []).some((r) => DECLENCHEUR_GESTE_RE.test(String(r?.declencheur ?? "")))) return [];
  const ps = platformSettings && typeof platformSettings === "object" ? platformSettings : {};
  const choisies = Array.isArray(ps.plateformes_vendeur) ? ps.plateformes_vendeur.map(String) : [];
  const s = sessions && typeof sessions === "object" ? sessions : {};
  const ordre = ["vinted", "leboncoin", "beebs", "depop", "ebay"];
  // Aucune plateforme choisie (étape passée) : celles où l'extension voit une session.
  return ordre.filter((pf) => (choisies.length ? choisies.includes(pf) : true) && s[pf] === true);
}
