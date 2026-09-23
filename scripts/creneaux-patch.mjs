#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// PATCH DU SWEEP « LE CRÉNEAU VA AU BOUT » (2026-09-24)
//   node scripts/creneaux-patch.mjs <corps-prod.sql>  [> migration.sql]
//
// Règle de Nico : une migration qui réécrit une fonction part TOUJOURS du corps
// RÉEL en prod (`pg_get_functiondef`), jamais du fichier du dépôt, et le rapport
// montre le diff. Ce script APPLIQUE deux modifications ANCRÉES au corps
// `republish_planifiee_sweep` fourni en argument (le corps live, exporté au
// moment du déploiement), REFUSE si une ancre ne tombe pas exactement une fois,
// et écrit sur stderr le diff unifié des lignes touchées. Le corps non touché
// est recopié caractère pour caractère : ce que le script ne trouve pas, il ne
// le change pas.
//
// Les DEUX changements, et pourquoi (cf. rapport) :
//   [1] anti-rafale : un job PARQUÉ pour une reprise future (next_action_after
//       dans le futur) qui n'a rien supprimé (step <> 'deleted', déjà garanti)
//       n'occupe plus le créneau — il n'est plus compté dans v_mobiles. Le job
//       à l'étape 'deleted' (annonce hors ligne) BLOQUE toujours (v_hors_ligne,
//       inchangé) : le garde-fou « jamais deux en vol, jamais supprimer sans
//       recréer » est intact.
//   [2] disjoncteur : `needs_user` (taille à choisir, champ, session) est un
//       état PARQUÉ, pas un échec anti-robot ; il ARRÊTE le comptage consécutif
//       au lieu de le grossir. Le disjoncteur ne pèse plus que les vrais
//       `failed` consécutifs (la panne anti-robot qu'il existe pour arrêter).
//
// Sortie 0 = patch appliqué proprement. Sortie 1 = une ancre a bougé (le corps
// prod a changé) : on s'arrête, on ne devine pas.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";

// ── Les ancres, RECOPIÉES du corps prod (relevé 2026-09-24, md5 du sweep
//    8dff340026d1d544002dd87ba2b9cb70). Le script vérifie qu'elles y sont
//    encore, à l'octet près, et une seule fois. ─────────────────────────────
export const ANCRES = [
  {
    nom: "anti-rafale : ne plus compter un job parqué dans v_mobiles",
    // La 2ᵉ agrégation (v_mobiles) : jobs non-'deleted' de la boutique connectée.
    cherche:
      "                                AND (v_boutique IS NULL OR NULLIF(trim(i.vinted_account_id), '') IS NULL\n" +
      "                                     OR trim(i.vinted_account_id) = v_boutique)),\n" +
      "             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'\n" +
      "                                AND v_boutique IS NOT NULL AND NULLIF(trim(i.vinted_account_id), '') IS NOT NULL",
    remplace:
      "                                AND (v_boutique IS NULL OR NULLIF(trim(i.vinted_account_id), '') IS NULL\n" +
      "                                     OR trim(i.vinted_account_id) = v_boutique)\n" +
      "                                AND COALESCE(republish_ts_safe(j.platform_fields, 'next_action_after'), now()) <= now()),  -- MODIF 2026-09-24 : un job PARQUE (reprise future : anti-robot 45 min, session 60 min) et sans suppression (step <> deleted) n'occupe pas le creneau ; il n'est plus compte en vol, le creneau continue avec un autre article, l'annonce parquee reste en ligne\n" +
      "             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'\n" +
      "                                AND v_boutique IS NOT NULL AND NULLIF(trim(i.vinted_account_id), '') IS NOT NULL",
  },
  {
    nom: "disjoncteur : needs_user arrête le comptage au lieu de le grossir",
    cherche:
      "        EXIT WHEN v_j.status = 'published';\n" +
      "        IF v_j.status IN ('failed', 'needs_user') THEN v_disj_n := v_disj_n + 1;",
    remplace:
      "        EXIT WHEN v_j.status = 'published';\n" +
      "        EXIT WHEN v_j.status = 'needs_user';  -- AJOUT 2026-09-24 : needs_user (taille a choisir, champ, session) est PARQUE en attente de l'utilisateur, pas un echec anti-robot — il arrete le comptage consecutif sans le grossir\n" +
      "        IF v_j.status = 'failed' THEN v_disj_n := v_disj_n + 1;  -- MODIF 2026-09-24 : le disjoncteur ne pese plus que les vrais failed consecutifs (la panne anti-robot qu'il existe pour arreter)",
  },
];

function diffUnifie(avant, apres) {
  // Diff localisé : les deux remplacements sont contigus, donc on montre la
  // seule tranche qui diffère (préfixe et suffixe communs retirés). Aucun
  // parcours qui puisse boucler.
  const a = avant.split("\n"), b = apres.split("\n");
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const oteesA = a.slice(p, a.length - s);
  const oteesB = b.slice(p, b.length - s);
  const out = [];
  for (const l of oteesA) out.push("- " + l);
  for (const l of oteesB) out.push("+ " + l);
  return out.length ? out.join("\n") : "(aucune ligne modifiée)";
}

export function patcher(corps) {
  let out = corps;
  const diffs = [];
  for (const anc of ANCRES) {
    const n = out.split(anc.cherche).length - 1;
    if (n !== 1) throw new Error(`Ancre « ${anc.nom} » trouvée ${n} fois (attendu : 1). Le corps prod a bougé — on s'arrête.`);
    const avant = out;
    out = out.replace(anc.cherche, anc.remplace);
    diffs.push({ nom: anc.nom, diff: diffUnifie(avant, out) });
  }
  return { corps: out, diffs };
}

// Exécution directe (pas en import de selftest).
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("creneaux-patch.mjs")) {
  const fichier = process.argv[2];
  if (!fichier) { console.error("usage : node scripts/creneaux-patch.mjs <corps-sweep-prod.sql>"); process.exit(2); }
  const corps = fs.readFileSync(fichier, "utf8").split("\r\n").join("\n");
  try {
    const { corps: patche, diffs } = patcher(corps);
    for (const d of diffs) { console.error(`\n── ${d.nom} ──`); console.error(d.diff); }
    console.error(`\n✓ 2 modifications appliquées, le reste recopié à l'identique (${corps.length} → ${patche.length} octets).`);
    process.stdout.write(patche);
    process.exit(0);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
