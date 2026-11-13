// ═══════════════════════════════════════════════════════════════════════════
// LES REFUS DE CADENCE DU RELEVÉ VINTED AUTOMATIQUE (13/11/2026, étape 5 du lot « zéro problème », bloc 6 P3)
// ═══════════════════════════════════════════════════════════════════════════
// L'extension refuse le relevé du dressing lancé par son alarme quotidienne (« cron ») quand le dernier relevé réussi a
// moins de 20 h (chrome-extension/background.js, SYNC_CRON_COOLDOWN_MS, garde dans syncDressingVinted). Toutes ses
// versions écrivent alors une NOTE sur ce relevé porteur (journaliserRefusCron) :
//   « [note] cadence cron : N sync 'cron' refusée(s) depuis ce run (fenêtre de 20 h), dernière le <ISO> »
// — un compteur RÉÉCRIT à chaque refus, jamais une ligne : ≈ 491 refus en 7 jours (audit du 12/11) restaient invisibles.
// Feu vert de Nico (P3) : les journaliser (usage_logs) et les compter (ops-digest). Côté SERVEUR, pour que toutes les
// versions comptent : le déclencheur cron_refus_journaliser (migration 20261113154000) lit la note avec LES MÊMES motifs
// que ce fichier (RE_COMPTEUR_SQL, RE_DERNIERE_SQL — vérifié par scripts/cron-refus-journalise-selftest.mjs) et écrit une
// ligne usage_logs « cron_refuse » par hausse du compteur. ⛔ Rien ici ne change la cadence ni la règle des 20 h.
// Pur (Deno + Node) : ops-digest, selftest.

/** Les motifs, tels que la base les écrit (regexp_match POSIX) — et leurs jumeaux JavaScript. */
export const RE_COMPTEUR_SQL = 'cadence cron :\\s*(\\d+)\\s+sync';
export const RE_DERNIERE_SQL = 'derni[eè]re le ([^ |]+)';
const RE_COMPTEUR = new RegExp(RE_COMPTEUR_SQL);
const RE_DERNIERE = new RegExp(RE_DERNIERE_SQL);

/** La note de cadence d'un relevé porteur : { compteur, derniere (ISO|null) } ; null sans segment. */
export function lireNoteCadenceCron(erreur) {
  const s = String(erreur ?? '');
  const m = s.match(RE_COMPTEUR);
  if (!m) return null;
  const compteur = Number(m[1]);
  if (!Number.isFinite(compteur) || compteur <= 0) return null;
  const d = s.match(RE_DERNIERE)?.[1] ?? null;
  return { compteur, derniere: d && Number.isFinite(Date.parse(d)) ? d : null };
}

/** Le délai entre la fin du dernier relevé réussi et le refus : < 1 h (alarme au démarrage, inoffensif), 1-12 h, 12-20 h
 *  (ceux qui coûtent un jour : la prochaine alarme est 24 h plus tard), inconnu. */
export const TRANCHES_REFUS = Object.freeze([['moins_1h', 0, 60], ['1_12h', 60, 720], ['12_20h', 720, 1200], ['plus_20h', 1200, Infinity]]);
export function trancheRefus(ageMin) {
  const a = Number(ageMin);
  if (ageMin == null || !Number.isFinite(a) || a < 0) return 'inconnu';
  return TRANCHES_REFUS.find(([, de, a2]) => a >= de && a < a2)?.[0] ?? 'inconnu';
}

const vide = () => ({ total: 0, comptes: 0, porteurs: 0, parTranche: Object.fromEntries([...TRANCHES_REFUS.map(([k]) => [k, 0]), ['inconnu', 0]]), top: [] });

/** Le compte des lignes usage_logs « cron_refuse » (une ligne = `nouveaux` refus, 1 d'ordinaire). */
export function resumerRefusCron(lignes) {
  const r = vide();
  const parCompte = new Map();
  for (const l of Array.isArray(lignes) ? lignes : []) {
    const k = Math.max(1, Number(l?.metadata?.nouveaux) || 1);
    r.total += k;
    r.parTranche[trancheRefus(l?.metadata?.age_min)] += k;
    const u = String(l?.user_id ?? '?');
    parCompte.set(u, (parCompte.get(u) ?? 0) + k);
  }
  r.comptes = parCompte.size;
  r.top = [...parCompte].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([u, k]) => [u.slice(0, 8), k]);
  return r;
}

/**
 * REPLI tant que la migration n'est pas appliquée : les notes des relevés porteurs dont le DERNIER refus tombe après
 * `depuisIso`. Le compteur est cumulé depuis le relevé porteur : c'est une BORNE HAUTE des refus de la fenêtre.
 */
export function resumerNotesPorteurs(runs, depuisIso) {
  const r = vide();
  const depuis = Date.parse(String(depuisIso ?? ''));
  const parCompte = new Map();
  for (const run of Array.isArray(runs) ? runs : []) {
    const note = lireNoteCadenceCron(run?.erreur);
    if (!note?.derniere || !(Date.parse(note.derniere) >= depuis)) continue;
    r.porteurs += 1;
    r.total += note.compteur;
    const age = Number.isFinite(Date.parse(run?.finished_at ?? '')) ? (Date.parse(note.derniere) - Date.parse(run.finished_at)) / 60000 : null;
    r.parTranche[trancheRefus(age)] += 1; // le dernier refus de chaque porteur
    const u = String(run?.user_id ?? '?');
    parCompte.set(u, (parCompte.get(u) ?? 0) + note.compteur);
  }
  r.comptes = parCompte.size;
  r.top = [...parCompte].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([u, k]) => [u.slice(0, 8), k]);
  return r;
}

/** La ligne du digest. source : 'journal' (usage_logs) | 'notes' (repli, borne haute). */
export function texteRefusCron(r, { source = 'journal' } = {}) {
  if (!r || !r.total) return source === 'notes'
    ? 'Aucun refus noté sur les relevés porteurs en 24 h.'
    : 'Aucun refus de cadence journalisé en 24 h.';
  const t = r.parTranche ?? {};
  const tranches = `< 1 h : ${t.moins_1h ?? 0} · 1-12 h : ${t['1_12h'] ?? 0} · 12-20 h : ${t['12_20h'] ?? 0}${t.inconnu ? ` · délai inconnu : ${t.inconnu}` : ''}`;
  const tete = source === 'notes'
    ? `${r.total} refus au plus (notes de ${r.porteurs} relevé${r.porteurs > 1 ? 's' : ''} porteur${r.porteurs > 1 ? 's' : ''}, compteur cumulé — migration 20261113154000 pas encore appliquée ?)`
    : `${r.total} refus en 24 h`;
  return `${tete} sur ${r.comptes} compte${r.comptes > 1 ? 's' : ''} — délai depuis le dernier relevé réussi (${source === 'notes' ? 'dernier refus de chaque porteur' : 'chaque refus'}) : ${tranches}. Comptes : ${r.top.map(([u, k]) => `${u} ×${k}`).join(', ')}.`;
}
