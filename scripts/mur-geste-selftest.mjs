// Autotest — un mur qui demande un geste se montre (point 4, 02/10 soir).
// `npm run selftest:mur-geste` (_shared/mur-geste.js). Formes relevées en base.
import { jugerMurGeste, observationChallenge, messageConnexionRequise, messageVerificationAntirobot,
  messagePauseVintedGeste, CONNEXION_OBSERVATIONS_MIN, ANTIROBOT_ECART_MIN_MS } from "../supabase/functions/_shared/mur-geste.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const CHALLENGE = "CHALLENGE DATADOME : Beebs affiche une vérification anti-robot à la place du formulaire de vente. Ouvrir beebs.app dans Chrome et résoudre la vérification (l'onglet de travail est resté ouvert), le job repartira au prochain passage.";

console.log("\n1. BEEBS — 9cdr9rm4rn a6692748 : le challenge à résoudre");
const j1 = { platform: "beebs", action: "republish", error: null, platform_fields: { republish_step: "captured",
  republish_prevol_formulaire: { at: "2026-10-02T16:02:04.951Z", verdict: "illisible", detail: CHALLENGE } } };
const v1 = jugerMurGeste(j1);
ok(v1.geste === null && v1.change && v1.pf.mur_antirobot?.observations === 1, "1re observation : attente sans alarme, comptée", JSON.stringify(v1.pf.mur_antirobot));
ok(jugerMurGeste({ ...j1, platform_fields: v1.pf }).change === false, "même pré-vol relu au poll suivant : pas une 2e observation");
const j2 = { ...j1, platform_fields: { ...v1.pf, republish_prevol_formulaire: { at: "2026-10-02T16:32:30.000Z", verdict: "illisible", detail: CHALLENGE } } };
const v2 = jugerMurGeste(j2);
ok(v2.geste === "verification_antirobot" && v2.pf.needs_user_source === "verification_antirobot", "2e essai 30 min plus tard, même challenge → geste demandé", JSON.stringify(v2));
ok(/^Beebs te demande une vérification anti-robot : ouvre beebs\.app dans Chrome/.test(v2.message) && /intacte/.test(v2.message), "message court, le geste, annonce intacte", v2.message);
const j2b = { ...j1, platform_fields: { ...v1.pf, republish_prevol_formulaire: { at: "2026-10-02T16:12:00.000Z", verdict: "illisible", detail: CHALLENGE } } };
ok(jugerMurGeste(j2b).geste === null, `2e essai à 10 min (< ${ANTIROBOT_ECART_MIN_MS / 60000} min) : encore une attente`);
const j3 = { ...j1, platform_fields: { ...v1.pf, republish_prevol_formulaire: { at: "2026-10-02T16:32:30.000Z", verdict: "ok" } } };
const v3 = jugerMurGeste(j3);
ok(v3.geste === null && v3.change && !v3.pf.mur_antirobot, "le challenge s'est levé seul au 2e essai : rien à montrer, compteur effacé");
ok(observationChallenge({ republish_prevol_formulaire: { at: "2026-10-02T16:00:00Z", verdict: "illisible", detail: "aucune preuve positive du formulaire" } }) === null,
  "un formulaire simplement illisible n'est pas un mur anti-robot");

console.log("\n2. LEBONCOIN — xxewwer : connexion fermée");
const att = (n) => ({ platform: "leboncoin", action: "republish", error: "En attente de ta connexion à Leboncoin : …",
  platform_fields: { republish_step: "captured", attente_session: { depuis: "2026-10-02T06:28:17Z", derniere: "2026-10-02T06:48:00Z", observations: n, platform: "leboncoin" } } });
ok(jugerMurGeste(att(CONNEXION_OBSERVATIONS_MIN - 1)).geste === null, "vue 2 fois : on attend encore (faux « déconnecté » de Louis)");
const vC = jugerMurGeste(att(CONNEXION_OBSERVATIONS_MIN));
ok(vC.geste === "connexion" && vC.pf.needs_user_source === "connexion", "vue 3 fois : à toi");
ok(/^Connexion Leboncoin requise : /.test(vC.message), "début de phrase lu par relancer_jobs_connexion et handler-watch (relance seule)", vC.message);
const vPage = jugerMurGeste({ platform: "leboncoin", action: "republish", error: null, platform_fields: {
  republish_prevol_page: { at: "2026-10-02T07:37:46.107Z", lisible: true, mur: "vérification anti-robot sur la page de dépôt" } } });
ok(vPage.geste === null && vPage.pf.mur_antirobot?.observations === 1, "anti-robot sur la page de dépôt Leboncoin : compté, pas encore montré");

console.log("\n3. ÉTAPE 'deleted' ET VINTED");
const vDel = jugerMurGeste({ ...att(3), platform_fields: { ...att(3).platform_fields, republish_step: "deleted" } });
ok(/remise en ligne toute seule/.test(vDel.message) && !/intacte/.test(vDel.message), "annonce déjà retirée : on ne promet pas « intacte »");
ok(/vinted\.fr/.test(messagePauseVintedGeste()) && /connecte-toi/.test(messagePauseVintedGeste()) && /vérification/.test(messagePauseVintedGeste()),
  "pause Vinted > 6 h : les deux gestes possibles (connexion ou vérification)");
ok(/^Connexion Vinted requise/.test(messageConnexionRequise("vinted")) && /^Vinted te demande/.test(messageVerificationAntirobot("vinted")), "libellés par plateforme");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ murs : un geste nécessaire se montre, un retard reste une attente");
