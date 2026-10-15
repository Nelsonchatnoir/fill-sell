// ═══════════════════════════════════════════════════════════════════════════
// UN DÉPÔT « MUET » SE COMPTE DEPUIS SA DERNIÈRE REMISE EN FILE (15/10 soir)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : geronimo, Beebs, « Le Livre des Louveteaux » (14887481),
// créé le 03/10, relancé le 15/10 au soir, ANNULÉ par handler-watch à 20:03
// (« restée en attente trop longtemps ») : le balayage des dépôts muets
// comptait l'âge depuis `created_at`. Seule une fermeture PRÉCÉDENTE par ce
// même balayage (`pending_muet_clos_le`) faisait repartir le compteur — une
// relance depuis l'app (`derniere_relance_manuelle`), une relance par le
// serveur ou une remise en file à la main ne le faisaient pas.
//
// LA RÈGLE : l'attente se compte depuis la DERNIÈRE REMISE EN FILE, la plus
// récente de :
//   · la création du job ;
//   · une fermeture précédente par ce balayage (`pending_muet_clos_le`) ;
//   · une remise en file posée par la base (`remis_en_file_le`, déclencheur
//     sur toute sortie de needs_user / failed / cancelled vers pending) ;
//   · une relance depuis l'app (`derniere_relance_manuelle`) ;
//   · une archive d'erreur écrite par une relance (« relance » dans `par`).
// Pur, sans import (Deno + Node).

const t = (v) => { const x = Date.parse(String(v ?? "")); return Number.isFinite(x) ? x : NaN; };

/** L'instant (ms) depuis lequel un dépôt en attente se compte. */
export function depuisDerniereRemiseEnFile(job) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const candidats = [
    t(job?.created_at),
    t(pf.pending_muet_clos_le),
    t(pf.remis_en_file_le),
    t(pf.derniere_relance_manuelle),
  ];
  for (const e of Array.isArray(pf.erreurs_archivees) ? pf.erreurs_archivees : []) {
    if (/relance/i.test(String(e?.par ?? ""))) candidats.push(t(e?.le));
  }
  const ok = candidats.filter((x) => Number.isFinite(x));
  return ok.length ? Math.max(...ok) : NaN;
}

/** Le dépôt est-il muet depuis plus de `jours` jours (pause anti-robot déduite) ? */
export function depotMuetDepuis(job, { maintenant = Date.now(), jours = 10 } = {}) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const depuis = depuisDerniereRemiseEnFile(job);
  if (!Number.isFinite(depuis)) return { muet: false, jours: 0, depuis: null };
  const pause = Math.max(0, Number(pf.antirobot_pause_cumul_ms) || 0);
  const ecoule = maintenant - depuis - pause;
  return { muet: ecoule >= jours * 86400000, jours: Math.floor(ecoule / 86400000), depuis: new Date(depuis).toISOString() };
}
