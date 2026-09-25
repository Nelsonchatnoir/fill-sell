// ═══════════════════════════════════════════════════════════════════════════
// UNE REPUBLICATION RETIRÉE NE S'ARRÊTE JAMAIS — CONTRÔLE (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le module LIVRÉ (supabase/functions/_shared/republication-hors-ligne.js,
// celui qu'importe update-job-status) sur le cas réel des Petites Fioles
// (job fb358c75) et sur les cas qui doivent GARDER la main.
//
//   node scripts/republication-hors-ligne-selftest.mjs

import { decisionRecreationHorsLigne, PALIERS_REPRISE_MIN, REPRISE_MAX_MIN, ANTIROBOT_MIN } from "../supabase/functions/_shared/republication-hors-ligne.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const T0 = Date.parse("2026-09-25T10:33:24.000Z");
const BRUT_FIOLES = "Ton annonce a été retirée de Leboncoin et n'a pas pu être redéposée automatiquement : " +
  "Timeout: pas de réponse du content script. Rien n'est perdu : titre, description, photos et champs sont " +
  "sauvegardés. Clique « Republier maintenant » depuis la fiche de l'article.";
const pfFioles = () => ({
  republish_step: "deleted",
  deleted_at: "2026-09-25T09:44:47.543Z",
  needsUserAttempts: 2,
  needs_user_source: "relancer",
  republish_snapshot: { titre: "🎄Calendrier de l’Avent chaussettes à paillettes personnalisé", photos: 2 },
  work_window_state: { at_end: { fill_step: "description", tab_url: "https://www.leboncoin.fr/deposer-une-annonce" } },
});

console.log("1. Le cas réel : needs_user « Republier maintenant » après le retrait → reprise automatique");
{
  const d = decisionRecreationHorsLigne({
    action: "republish", platform: "leboncoin", statut: "needs_user",
    pf: pfFioles(), pfEnBase: pfFioles(), brut: BRUT_FIOLES,
    reecrit: "L'opération n'a pas pu aboutir sur ton ordinateur. Relance-la depuis la fiche de l'article quand tu veux.",
    maintenant: T0,
  });
  ok(d && d.statut === "pending", "statut pending (jamais needs_user après un retrait)");
  ok(d && d.n === 1 && d.dansMinutes === PALIERS_REPRISE_MIN[0], "premier palier : 5 min");
  ok(d && d.pf.next_action_after === new Date(T0 + 5 * 60_000).toISOString(), "échéance posée à +5 min");
  ok(d && d.pf.republish_step === "deleted", "étape conservée : la recréation repart directement");
  ok(d && !("needsUserAttempts" in d.pf) && !("needs_user_source" in d.pf), "budget utilisateur et « relancer » retirés");
  ok(d && !d.pf.verifier_doublon_avant_publication, "arrêt à la description : rien n'est parti, pas de vérification imposée");
  ok(d && /retirée de Leboncoin/.test(d.message) && /vers 12:38/.test(d.message), "le message dit l'état réel et l'heure de Paris (12:38)");
  ok(d && !/relance|clique|republier maintenant/i.test(d.message), "le message ne demande AUCUN geste");
  ok(d && /titre, description, photos et champs sont conservés/.test(d.message), "le message dit que rien n'est perdu");
  ok(d && d.pf.republish_snapshot?.photos === 2, "copie de dépôt conservée telle quelle");
}

console.log("2. Deux écritures de la même tentative (failed puis needs_user) comptent une fois");
{
  const d1 = decisionRecreationHorsLigne({ action: "republish", platform: "leboncoin", statut: "failed",
    pf: pfFioles(), pfEnBase: pfFioles(), brut: "Timeout: pas de réponse du content script", maintenant: T0 });
  const enBase = { ...d1.pf };
  const d2 = decisionRecreationHorsLigne({ action: "republish", platform: "leboncoin", statut: "needs_user",
    pf: pfFioles(), pfEnBase: enBase, brut: BRUT_FIOLES, maintenant: T0 + 800 });
  ok(d1 && d2 && d2.n === 1, "palier inchangé (n = 1)");
  ok(d2 && d2.pf.next_action_after === d1.pf.next_action_after, "même échéance");
  const d3 = decisionRecreationHorsLigne({ action: "republish", platform: "leboncoin", statut: "needs_user",
    pf: pfFioles(), pfEnBase: enBase, brut: BRUT_FIOLES, maintenant: T0 + 10 * 60_000 });
  ok(d3 && d3.n === 2 && d3.dansMinutes === PALIERS_REPRISE_MIN[1], "tentative suivante : palier 2 (10 min)");
}

console.log("3. Les paliers s'arrêtent à 4 h, jamais un arrêt");
{
  const enBase = { ...pfFioles(), recreation_reprises: 12, recreation_reprise: { at: new Date(T0 - 3_600_000).toISOString(), n: 12 } };
  const d = decisionRecreationHorsLigne({ action: "republish", platform: "beebs", statut: "needs_user",
    pf: pfFioles(), pfEnBase: enBase, brut: "Timeout: pas de réponse du content script", maintenant: T0 });
  ok(d && d.statut === "pending" && d.dansMinutes === REPRISE_MAX_MIN, "13e reprise : toutes les 4 h, toujours pending");
  ok(d && /retirée de Beebs/.test(d.message), "le message nomme la bonne plateforme");
}

console.log("3 bis. Anti-robot : jamais moins de 45 min entre deux essais");
{
  const d = decisionRecreationHorsLigne({ action: "republish", platform: "vinted", statut: "needs_user",
    pf: pfFioles(), pfEnBase: pfFioles(), brut: "CHALLENGE datadome à la recréation", maintenant: T0 });
  ok(d && d.statut === "pending" && d.dansMinutes === ANTIROBOT_MIN, "premier essai après un anti-robot : 45 min");
}

console.log("4. Dépôt peut-être parti → vérification anti-doublon avant de redéposer");
{
  const pf = { ...pfFioles(), work_window_state: { at_end: { fill_step: "depot", tab_url: "https://www.leboncoin.fr/deposer-une-annonce" } } };
  const d = decisionRecreationHorsLigne({ action: "republish", platform: "leboncoin", statut: "needs_user",
    pf, pfEnBase: pf, brut: BRUT_FIOLES, maintenant: T0 });
  ok(d && d.pf.verifier_doublon_avant_publication === true, "étape « depot » : verifier_doublon_avant_publication posé");
  const pf2 = { ...pfFioles(), work_window_state: { at_end: { fill_step: null, tab_url: "https://www.leboncoin.fr/deposer-une-annonce/options" } } };
  const d2 = decisionRecreationHorsLigne({ action: "republish", platform: "leboncoin", statut: "failed",
    pf: pf2, pfEnBase: pf2, brut: "canal coupé", maintenant: T0 });
  ok(d2 && d2.pf.verifier_doublon_avant_publication === true, "écran /options atteint : vérification posée");
}

console.log("5. Ce qui GARDE la main (aucune reprise ne peut aboutir sans eux)");
{
  const base = { action: "republish", platform: "leboncoin", statut: "needs_user", maintenant: T0 };
  ok(decisionRecreationHorsLigne({ ...base, pf: { ...pfFioles(), needsUserField: { field_key: "condition", field_label: "État" } }, pfEnBase: pfFioles(), brut: "champ" }) === null,
    "une question (needsUserField) reste une question");
  ok(decisionRecreationHorsLigne({ ...base, pf: { ...pfFioles(), needsUserFields: [{ field_key: "a" }] }, pfEnBase: pfFioles(), brut: "x" }) === null,
    "plusieurs champs demandés : question");
  ok(decisionRecreationHorsLigne({ ...base, pf: { ...pfFioles(), needs_user_source: "connexion" }, pfEnBase: pfFioles(), brut: "x" }) === null,
    "mur de connexion (relancé seul à la reconnexion)");
  ok(decisionRecreationHorsLigne({ ...base, pf: pfFioles(), pfEnBase: pfFioles(), brut: "Connexion Leboncoin requise : ton navigateur n'est plus connecté" }) === null,
    "texte « Connexion Leboncoin requise »");
  ok(decisionRecreationHorsLigne({ ...base, pf: pfFioles(), pfEnBase: pfFioles(), brut: "Ton annonce a été retirée de Leboncoin et sa copie de dépôt est introuvable sur le job" }) === null,
    "impasse : copie de dépôt introuvable");
  ok(decisionRecreationHorsLigne({ ...base, platform: "vinted", pf: pfFioles(), pfEnBase: pfFioles(), brut: "Republication en pause : plusieurs annonces identiques sont en ligne sur Vinted" }) === null,
    "impasse : plusieurs annonces identiques (jamais un troisième exemplaire)");
  ok(decisionRecreationHorsLigne({ ...base, platform: "vinted", pf: pfFioles(), pfEnBase: pfFioles(), brut: "Annonce supprimée sur Vinted, capture introuvable ou invalide pour la recréation" }) === null,
    "impasse : capture introuvable");
}

console.log("6. Hors périmètre : rien ne change");
{
  ok(decisionRecreationHorsLigne({ action: "republish", platform: "leboncoin", statut: "needs_user",
    pf: { ...pfFioles(), republish_step: "captured" }, pfEnBase: { republish_step: "captured" }, brut: BRUT_FIOLES, maintenant: T0 }) === null,
    "étape 'captured' (annonce encore en ligne)");
  ok(decisionRecreationHorsLigne({ action: "publish", platform: "leboncoin", statut: "needs_user",
    pf: pfFioles(), pfEnBase: pfFioles(), brut: BRUT_FIOLES, maintenant: T0 }) === null, "une publication");
  ok(decisionRecreationHorsLigne({ action: "delete", platform: "leboncoin", statut: "failed",
    pf: pfFioles(), pfEnBase: pfFioles(), brut: BRUT_FIOLES, maintenant: T0 }) === null, "un retrait");
  ok(decisionRecreationHorsLigne({ action: "republish", platform: "leboncoin", statut: "pending",
    pf: pfFioles(), pfEnBase: pfFioles(), brut: BRUT_FIOLES, maintenant: T0 }) === null, "un pending (déjà une reprise)");
  ok(decisionRecreationHorsLigne({ action: "republish", platform: "leboncoin", statut: "cancelled",
    pf: pfFioles(), pfEnBase: pfFioles(), brut: "Leboncoin ne propose aucune option gratuite", maintenant: T0 }) === null,
    "un cancelled (limite vérifiée de la plateforme)");
  ok(decisionRecreationHorsLigne({ action: "republish", platform: "leboncoin", statut: "published",
    pf: pfFioles(), pfEnBase: pfFioles(), maintenant: T0 }) === null, "un published");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout passe");
process.exit(ko ? 1 : 0);
