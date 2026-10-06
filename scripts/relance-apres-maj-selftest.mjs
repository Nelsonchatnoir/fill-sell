// ═══════════════════════════════════════════════════════════════════════════
// Selftest « relance après mise à jour » (2026-10-06, Glowik 2c38bff2)
//   node scripts/relance-apres-maj-selftest.mjs
//
// LE CAS : dépôt Leboncoin de Glowik arrêté en « relancer » par la 0.6.100
// (« Élément introuvable: input[type="file"] (même après avance du wizard
// paginé) ») ; la 0.6.101 remplit les pages avant les photos. La tâche doit
// repartir SEULE quand le poste a la 0.6.101 — et jamais avant, jamais deux
// fois, jamais pour un autre motif (les 31 « relancer » Leboncoin du parc sans
// ce motif, relevés le 06/10, ne bougent pas).
// ═══════════════════════════════════════════════════════════════════════════
import {
  RELANCES_APRES_MAJ, regleDeRelance, posteALeBuild, champsRelance, msDuBuild,
} from "../supabase/functions/_shared/relance-apres-maj.js";

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// La tâche RÉELLE de Glowik (relue en prod le 06/10, champs utiles).
const GLOWIK = {
  id: "2c38bff2-4677-4ea3-8621-4cb087ed4388",
  user_id: "869e5f03-d746-417e-b567-3f9fff438474",
  inventaire_id: 1790640030650,
  status: "needs_user",
  action: "publish",
  platform: "leboncoin",
  error: "La publication n'a pas abouti après plusieurs essais automatiques, et ton annonce n'a pas été touchée. Tu peux la relancer d'un clic ci-dessous ; si ça bloque encore, écris-nous, on regarde avec toi.",
  platform_fields: {
    needs_user_source: "relancer",
    error_technique: {
      at: "2026-10-06T13:08:32.214Z",
      brut: "Élément introuvable: input[type=\"file\"] (même après avance du wizard paginé)",
      pose_par: "update-job-status (requalification affichage G1/G4)",
    },
    lbcCategoryPath: ["Matériel professionnel", "Équipements pour commerces & marchés"],
    next_action_after: "2026-10-06T13:20:00.000Z",
    needs_user_vu_le: "2026-10-06T14:00:00.000Z",
    needsUserAttempts: 3,
  },
};
const B_0_6_100 = "2026-10-06T06:11:17Z+2b883ef";
const B_0_6_101 = "2026-10-06T15:09:44Z+3e77bae";
const B_PLUS_TARD = "2026-10-20T08:00:00Z+abcdef0";

console.log("\n[1] La tâche de Glowik est couverte par la règle « pages avant les photos »");
{
  const r = regleDeRelance(GLOWIK);
  ok("règle trouvée", r?.cle === "lbc_pages_avant_photos", JSON.stringify(r));
  ok("   build correctif = BUILD_ID 0.6.101", r?.buildMin === "2026-10-06T15:09:44Z" && r?.version === "0.6.101", JSON.stringify(r));
}

console.log("\n[2] Le poste décide : 0.6.100 attend, 0.6.101 et après relancent");
{
  const r = RELANCES_APRES_MAJ[0];
  ok("0.6.100 (2b883ef) : non", posteALeBuild(B_0_6_100, r) === false);
  ok("0.6.101 (3e77bae) : oui", posteALeBuild(B_0_6_101, r) === true);
  ok("build plus récent : oui", posteALeBuild(B_PLUS_TARD, r) === true);
  ok("build absent : non", posteALeBuild(null, r) === false && posteALeBuild("", r) === false);
  ok("build illisible (« v0.6.101 » sans horodatage) : non", posteALeBuild("v0.6.101", r) === false);
  ok("msDuBuild lit le préfixe horodaté", msDuBuild(B_0_6_101) === Date.parse("2026-10-06T15:09:44Z"));
}

console.log("\n[3] La relance = le geste « Relancer » de l'app, une fois");
{
  const r = regleDeRelance(GLOWIK);
  const pf = champsRelance(GLOWIK, r, { maintenant: "2026-10-07T09:00:00.000Z", extensionBuild: B_0_6_101 });
  ok("plus d'attente « relancer »", !("needs_user_source" in pf), JSON.stringify(pf));
  ok("   échéance et suivi d'attente levés", !("next_action_after" in pf) && !("needs_user_vu_le" in pf), JSON.stringify(pf));
  ok("   compteur d'essais à zéro", pf.needsUserAttempts === 0, String(pf.needsUserAttempts));
  ok("   marqueur posé (clé, version, build du poste, statut d'avant)",
    pf.relance_apres_maj?.cle === "lbc_pages_avant_photos" && pf.relance_apres_maj?.version === "0.6.101"
      && pf.relance_apres_maj?.build_du_poste === B_0_6_101 && pf.relance_apres_maj?.statut_avant === "needs_user",
    JSON.stringify(pf.relance_apres_maj));
  ok("   le reste de la fiche intact (rayon, motif technique)",
    pf.lbcCategoryPath?.[1] === "Équipements pour commerces & marchés" && pf.error_technique?.brut?.startsWith("Élément introuvable"),
    JSON.stringify(pf));
  ok("   la tâche d'origine n'est pas modifiée", GLOWIK.platform_fields.needs_user_source === "relancer" && !GLOWIK.platform_fields.relance_apres_maj);
  const retombee = { ...GLOWIK, platform_fields: { ...pf, needs_user_source: "relancer" } };
  ok("retombée après la relance : JAMAIS une seconde fois", regleDeRelance(retombee) === null);
}

console.log("\n[4] Rien d'autre ne bouge");
{
  const sansMotif = { ...GLOWIK, platform_fields: { needs_user_source: "relancer" } };
  ok("« relancer » sans motif technique (31 tâches Leboncoin du parc, dont patrick giry)", regleDeRelance(sansMotif) === null);
  const autreMotif = { ...GLOWIK, platform_fields: { ...GLOWIK.platform_fields, error_technique: { brut: "Timeout: pas de réponse du content script (300 s)" } } };
  ok("autre motif technique", regleDeRelance(autreMotif) === null);
  ok("autre plateforme (même texte)", regleDeRelance({ ...GLOWIK, platform: "vinted" }) === null);
  ok("republication (même texte)", regleDeRelance({ ...GLOWIK, action: "republish" }) === null);
  ok("tâche en file (pending)", regleDeRelance({ ...GLOWIK, status: "pending" }) === null);
  ok("tâche en échec (failed)", regleDeRelance({ ...GLOWIK, status: "failed" }) === null);
  const autreQuestion = { ...GLOWIK, platform_fields: { ...GLOWIK.platform_fields, needs_user_source: "champ_a_choisir" } };
  ok("question à la personne (champ_a_choisir) : on ne la contourne pas", regleDeRelance(autreQuestion) === null);
  const retire = { ...GLOWIK, platform_fields: { ...GLOWIK.platform_fields, deleted_at: "2026-10-06T13:00:00Z" } };
  ok("quelque chose a été retiré (deleted_at) : non", regleDeRelance(retire) === null);
}

console.log(ko ? `\n[selftest:relance-apres-maj] ÉCHEC — ${ko} vérification(s) en défaut.` : "\n[selftest:relance-apres-maj] OK");
process.exit(ko ? 1 : 0);
