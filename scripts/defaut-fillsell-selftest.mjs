// Autotest — une exception de NOTRE code est un défaut de chez nous (point 3,
// 02/10 soir) et une republication auto retenue par son créneau le dit (point 2).
// `npm run selftest:defaut-fillsell`
import { signatureException, defautFillsell, messageDefautFillsell, posteApresDefaut, buildMs } from "../supabase/functions/_shared/defaut-fillsell.js";
import { messageRetenueCreneau } from "../supabase/functions/_shared/retenue-creneau.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. LES SIGNATURES DU MOTEUR JAVASCRIPT");
ok(signatureException("Cannot access 'o' before initialization") === "Cannot access 'o' before initialization", "TDZ minifiée (Jonathan Rabany 6d1a1d3d)");
ok(!!signatureException("TypeError: Cannot read properties of null (reading 'click')"), "TypeError null");
ok(!!signatureException("fillTextField is not defined"), "ReferenceError");
ok(!!signatureException("e.querySelector is not a function"), "not a function");
for (const t of [
  "Beebs exige « Pointure » pour ce rayon",
  "Vinted a affiché une vérification anti-robot au lieu de ton annonce.",
  "aucune preuve positive du formulaire",
  "Connexion Beebs requise",
  "HTTP 403",
  "Le titre n'est plus au rendez-vous",
  "Timeout : pas de réponse du content script",
]) ok(signatureException(t) === null, `pas une exception : « ${t.slice(0, 50)} »`);

console.log("\n2. OÙ ON LA CHERCHE");
const pfJr = { republish_step: "captured", republish_prevol_formulaire: { at: "2026-10-02T17:00:48.270Z", verdict: "illisible", detail: "Cannot access 'o' before initialization" } };
const d = defautFillsell({ erreur: null, pf: pfJr });
ok(d?.ou === "prevol_formulaire" && /before initialization/.test(d.signature), "le pré-vol Beebs rangé « illisible » par la 0.6.85 est reconnu", JSON.stringify(d));
ok(defautFillsell({ erreur: "Cannot read properties of undefined (reading 'map')", pf: {} })?.ou === "erreur", "l'erreur du handler est reconnue");
ok(defautFillsell({ erreur: null, pf: { republish_prevol_formulaire: { verdict: "illisible", detail: "aucune preuve positive du formulaire" } } }) === null,
  "un vrai formulaire illisible reste illisible");
ok(defautFillsell({ erreur: null, pf: { republish_prevol_formulaire: { verdict: "ok", detail: "is not defined" } } }) === null, "un pré-vol OK n'est jamais requalifié");

console.log("\n3. LE MESSAGE : C'EST NOUS");
const m = messageDefautFillsell({ platform: "beebs", action: "republish" });
ok(/défaut de FillSell/.test(m) && /pas de Beebs/.test(m) && /intacte/.test(m) && /mise à jour/.test(m), "republication avant retrait : nous, annonce intacte, mise à jour", m);
ok(!/before|initialization|TypeError|undefined/.test(m), "aucun vocabulaire de développeur");
const m2 = messageDefautFillsell({ platform: "beebs", action: "republish", etapeRetiree: true });
ok(/remise en ligne/.test(m2) && /réessaie tout seuls/.test(m2) && !/intacte/.test(m2), "étape 'deleted' : on ne promet pas « intacte »", m2);

console.log("\n4. JAMAIS RENDU AU BUILD QUI A PLANTÉ");
const pfD = { defaut_fillsell: { build: "2026-10-02T09:28:31Z+6060632 · v0.6.85" } };
ok(!posteApresDefaut(pfD, "2026-10-02T09:28:31Z+6060632 · v0.6.85"), "même build : retenu");
ok(!posteApresDefaut(pfD, "2026-09-30T20:16:41Z+73c4929"), "build plus ancien : retenu");
ok(posteApresDefaut(pfD, "2026-10-02T20:00:00Z+abcdef0"), "build plus récent : servi");
ok(!posteApresDefaut(pfD, ""), "build inconnu : retenu");
ok(posteApresDefaut({ defaut_fillsell: { ...pfD.defaut_fillsell, reprise_libre: true } }, "2026-10-02T09:28:31Z+6060632"), "étape 'deleted' (reprise libre) : servi");
ok(posteApresDefaut({}, "x"), "sans défaut : servi");
ok(buildMs("2026-10-02T09:28:31Z+6060632 · v0.6.85") === Date.parse("2026-10-02T09:28:31Z"), "horodatage du build lu");

console.log("\n5. RETENUE DE CRÉNEAU (point 2) — LE JOB DIT CE QU'IL ATTEND");
const mc = messageRetenueCreneau("vinted", "2026-10-03T17:00:00+00:00");
ok(/samedi 03\/10 à 19:00/.test(mc) && /Chrome est ouvert/.test(mc) && /intacte/.test(mc), "jocabroc8 : heure de reprise, condition, annonce intacte", mc);
ok(/prochain créneau/.test(messageRetenueCreneau("vinted", null)), "reprise inconnue : « prochain créneau »");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ défaut FillSell : reconnu, nommé, jamais rendu au build qui plante ; créneau dit");
