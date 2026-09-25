// ═══════════════════════════════════════════════════════════════════════════
// UNE PLATEFORME QUI FIGE NE CONFISQUE PLUS LE POSTE (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI S'EST PASSÉ (MeMiniandMove, compte Pro, Mac, extension 0.6.66).
// Huit republications Vinted attendaient depuis 00:33. Le Mac pollait — vu à
// 12:03, 13:36, 14:34 — et à chaque fois le serveur lui confiait ses retraits
// Leboncoin et Beebs, que l'extension fait passer AVANT les republications
// (rang « delete »). Chez lui, ces retraits figent : 32 min (2cfae2f2, canal
// coupé), 50 min (6f2392c7), 58 min (2cfae2f2 encore) — l'onglet de travail
// vit dans une fenêtre plein écran, en arrière-plan. Pendant ce temps le jeton
// de session du cycle expire (401 sur chaque compte rendu), le job repart en
// file « Reprise après interruption », et le poll suivant le redonne EN TÊTE.
// Les republications Vinted n'ont jamais eu leur tour : le poste ne « réclame
// pas » ses jobs parce qu'il passe ses cycles sur un retrait qui ne finit pas.
//
// LA RÈGLE, côté serveur (toutes versions d'extension) : quand un job d'une
// plateforme a FIGÉ sur ce compte dans les 3 dernières heures, les jobs de
// cette plateforme passent APRÈS les autres — ils ne sont pas servis tant que
// le même poll a quelque chose d'une AUTRE plateforme à faire. Quand il n'y a
// plus rien d'autre, ils repartent (jamais de famine), et au-delà de 3 h sans
// nouveau gel la plateforme reprend son rang.
// ⛔ Jamais une republication à l'étape 'deleted' : son annonce est hors ligne,
//    elle garde sa priorité (l'extension la borne déjà elle-même).
// ⛔ « Figé » = preuve écrite en base, jamais une supposition : l'erreur
//    « Reprise après interruption (bloqué N min… » posée par la reprise de
//    l'extension, ou un canal coupé classé par pas-de-rouge.

export const FIGE_FENETRE_MS = 3 * 3600_000;
const REPRISE_FIGEE_RE = /^Reprise après interruption \(bloqué \d+ min/;

const ms = (v) => {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? t : null;
};

/** Quand ce job a-t-il figé ? null = aucune preuve de gel. */
export function horodatageFige(job) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  const instants = [];
  if (REPRISE_FIGEE_RE.test(String(job?.error ?? ""))) {
    // Constat posé par get-pending-jobs au premier poll qui voit le gel : c'est
    // l'horodatage qui fait foi quand il existe (la fenêtre de travail ne date
    // que le DÉBUT du traitement, parfois une heure avant la reprise).
    const constat = ms(pf.fige_le);
    if (constat != null) return Math.max(constat, ms(pf.pas_de_rouge?.at) ?? 0);
    // L'erreur remplacée par la reprise est archivée à l'instant de la reprise.
    const arch = Array.isArray(pf.erreurs_archivees) ? pf.erreurs_archivees : [];
    const t = arch.map((e) => ms(e?.le)).filter((x) => x != null);
    const fen = pf.work_window_state ?? {};
    const repli = [ms(fen?.at_end?.at), ms(fen?.at_start?.at)].filter((x) => x != null);
    if (t.length) instants.push(Math.max(...t));
    else if (repli.length) instants.push(Math.max(...repli));
  }
  if (pf.pas_de_rouge?.motif === "canal_coupe") {
    const t = ms(pf.pas_de_rouge?.at);
    if (t != null) instants.push(t);
  }
  return instants.length ? Math.max(...instants) : null;
}

/** Les plateformes dont un job a figé sur ce compte il y a moins de 3 h. */
export function plateformesFigees(jobs, maintenant = Date.now()) {
  const out = new Set();
  for (const j of Array.isArray(jobs) ? jobs : []) {
    if (!j?.platform) continue;
    const t = horodatageFige(j);
    if (t != null && maintenant - t < FIGE_FENETRE_MS && t <= maintenant + 60_000) out.add(String(j.platform));
  }
  return out;
}

/** Un job qui porte la preuve d'un gel mais pas encore son constat daté. */
export function gelSansConstat(job) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  return REPRISE_FIGEE_RE.test(String(job?.error ?? "")) && ms(pf.fige_le) == null;
}

const exempt = (j) => j?.action === "republish" && j?.platform_fields?.republish_step === "deleted";

/**
 * Retire du poll les jobs des plateformes figées, SI le même poll sert
 * quelque chose d'une autre plateforme. Rend { garde, retenus }.
 */
export function rotationFiges(out, figees) {
  const liste = Array.isArray(out) ? out : [];
  if (!figees || !figees.size) return { garde: liste, retenus: [] };
  const autreChose = liste.some((j) => !figees.has(String(j?.platform)));
  if (!autreChose) return { garde: liste, retenus: [] };
  const retenus = liste.filter((j) => figees.has(String(j?.platform)) && !exempt(j));
  if (!retenus.length) return { garde: liste, retenus: [] };
  const ids = new Set(retenus.map((j) => String(j.id)));
  return { garde: liste.filter((j) => !ids.has(String(j.id))), retenus };
}
