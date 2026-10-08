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

console.log("\n[5] (08/10 soir) Tâche mise de côté « sans démarrage » (Jonathan Rabany, Carla) : repart avec la 0.6.104");
{
  // La tâche RÉELLE de Jonathan (3363b2d2, relue en prod le 08/10, champs utiles).
  const JONATHAN = {
    id: "3363b2d2-b754-474a-9006-82aba4e795d9", status: "needs_user", action: "republish", platform: "vinted",
    error: "Cette republication n'arrive pas à démarrer sur ton ordinateur depuis le 8 octobre : FillSell la met de côté pour laisser passer le reste de ta file.",
    platform_fields: {
      needs_user_source: "tache_sans_demarrage",
      tache_sans_demarrage: { depuis: "2026-10-08T10:47:36.81177+00:00", le: "2026-10-08T12:47:36.821Z", pose_par: "get-pending-jobs", servie_n: 61 },
      republish_step: "captured", republish_copie_servie: { capture_id: 12159, etape: "captured" },
    },
  };
  const r = regleDeRelance(JONATHAN);
  ok("règle trouvée (vinted / republication / tache_sans_demarrage)", r?.cle === "vinted_republish_tache_sans_demarrage", JSON.stringify(r));
  ok("   build correctif = BUILD_ID 0.6.104 (0cec9e6)", r?.buildMin === "2026-10-08T14:53:27Z" && r?.version === "0.6.104", JSON.stringify(r));
  ok("poste en 0.6.102 (b230ebe, le sien) : pas encore", posteALeBuild("2026-10-06T18:38:36Z+b230ebe", r) === false);
  ok("poste en 0.6.103 (jamais téléversée) : pas encore", posteALeBuild("2026-10-07T22:58:10Z+008995b", r) === false);
  ok("poste en 0.6.104 : oui", posteALeBuild("2026-10-08T14:53:27Z+0cec9e6", r) === true);
  const pf = champsRelance(JONATHAN, r, { maintenant: "2026-10-08T15:00:00Z", extensionBuild: "2026-10-08T14:53:27Z+0cec9e6" });
  ok("relancée : le motif de mise de côté levé, marquée une fois", !pf.needs_user_source && pf.relance_apres_maj?.cle === r.cle && pf.needsUserAttempts === 0);
  ok("   la copie servie et l'étape sont gardées (republication reprise là où elle était)", pf.republish_step === "captured" && pf.republish_copie_servie?.capture_id === 12159);
  ok("déjà relancée une fois : jamais une seconde", regleDeRelance({ ...JONATHAN, platform_fields: { ...JONATHAN.platform_fields, relance_apres_maj: { le: "x" } } }) === null);
  ok("republication déjà retirée (étape deleted) : non", regleDeRelance({ ...JONATHAN, platform_fields: { ...JONATHAN.platform_fields, republish_step: "deleted" } }) === null);
  ok("publication Leboncoin sans démarrage : couverte aussi", regleDeRelance({ ...JONATHAN, platform: "leboncoin", action: "publish" })?.cle === "leboncoin_publish_tache_sans_demarrage");
  ok("retrait (jamais mis de côté) : non", regleDeRelance({ ...JONATHAN, action: "delete" }) === null);
  ok("Opla : non (pas de script du manifeste)", regleDeRelance({ ...JONATHAN, platform: "opla" }) === null);
  ok("« relancer » sans motif technique : toujours rien", regleDeRelance({ ...JONATHAN, platform_fields: { needs_user_source: "relancer" } }) === null);
  const muet = RELANCES_APRES_MAJ.filter((x) => /content_script_muet$/.test(x.cle));
  ok("content script muet : 4 plateformes, build 0.6.104 (la 0.6.103 n'a jamais été téléversée)", muet.length === 4 && muet.every((x) => x.buildMin === "2026-10-08T14:53:27Z"));
}

console.log(ko ? `\n[selftest:relance-apres-maj] ÉCHEC — ${ko} vérification(s) en défaut.` : "\n[selftest:relance-apres-maj] OK");
process.exit(ko ? 1 : 0);
