// Autotest — le bouton « Leboncoin remarche » promis par le message de pause existe (03/11, point 6) —
// `npm run selftest:bouton-leboncoin-remarche` (src/utils/pauseLeboncoin.js, src/components/BandeauLeboncoinPause.jsx).
import { pauseLeboncoin, patchEssaiDemande, TEXTES_PAUSE_LBC } from "../src/utils/pauseLeboncoin.js";
import { etatBlocageLbc, messageBlocageLbc } from "../supabase/functions/_shared/blocage-leboncoin.js";
import fs from "node:fs";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const DEPUIS = "2026-11-03T08:00:00.000Z";
const ps = (b) => ({ leboncoin: { rue: "x", blocage_acces: b } });

console.log("\n1. LE BANDEAU NE SE MONTRE QUE PENDANT UNE VRAIE PAUSE");
ok(pauseLeboncoin(ps({ depuis: DEPUIS, signe: "http_403", essai_apres: "2026-11-04T08:00:00Z" }))?.depuis === DEPUIS, "pause posée → bandeau");
ok(pauseLeboncoin(ps({ depuis: DEPUIS, leve_le: "2026-11-03T10:00:00Z" })) === null, "pause levée (reprise prudente) → rien");
ok(pauseLeboncoin({ leboncoin: { rue: "x" } }) === null && pauseLeboncoin(null) === null && pauseLeboncoin({}) === null, "aucune pause → rien");
ok(pauseLeboncoin(ps({ essai_demande_le: "2026-11-03T09:00:00Z" })) === null, "un « blocage » sans date de pose n'est pas une pause → rien");

console.log("\n2. LE GESTE");
const p1 = patchEssaiDemande(ps({ depuis: DEPUIS, derniere_preuve: DEPUIS }), "2026-11-03T09:00:00.000Z");
ok(JSON.stringify(p1) === JSON.stringify({ essai_demande_le: "2026-11-03T09:00:00.000Z" }), "pause en cours → essai_demande_le seul");
ok(patchEssaiDemande({ leboncoin: {} }) === null && patchEssaiDemande(ps({ depuis: DEPUIS, leve_le: DEPUIS })) === null, "⛔ jamais d'écriture sans pause en cours (créerait un blocage)");
const apres = { depuis: DEPUIS, derniere_preuve: DEPUIS, essai_apres: "2026-11-04T08:00:00.000Z", ...p1 };
ok(etatBlocageLbc(ps(apres), Date.parse("2026-11-03T09:01:00Z")).etat === "essai", "le serveur lit la demande : « essai » (une seule action Leboncoin)");
ok(etatBlocageLbc(ps({ depuis: DEPUIS, derniere_preuve: DEPUIS, essai_apres: "2026-11-04T08:00:00.000Z" }), Date.parse("2026-11-03T09:01:00Z")).etat === "bloque", "sans demande : bloqué jusqu'à l'essai du lendemain");
ok(pauseLeboncoin(ps(apres))?.demande === true, "demande pas encore tranchée → « Essai demandé », pas de second bouton");
ok(pauseLeboncoin(ps({ ...apres, derniere_preuve: "2026-11-03T09:30:00Z" }))?.demande === false, "essai refusé depuis (preuve plus récente) → le bouton revient");

console.log("\n3. LE MESSAGE ET L'APP DISENT LA MÊME CHOSE");
ok(messageBlocageLbc("Chrome", DEPUIS).includes("« Leboncoin remarche »") && TEXTES_PAUSE_LBC.fr.bouton === "Leboncoin remarche", "le bouton porte exactement le nom promis par le message");
const b = fs.readFileSync(new URL("../src/components/BandeauLeboncoinPause.jsx", import.meta.url), "utf8");
ok(b.includes("fusionnerReglages(['leboncoin', 'blocage_acces'], patch)") && b.includes("const patch = patchEssaiDemande(ps);") && b.includes("const ps = await lirePause();"),
  "écriture par platform_settings_fusionner seulement, après relecture de la ligne");
ok(!/setInterval/.test(b), "jamais de relecture en boucle");
const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
ok(app.includes("{user&&<BandeauLeboncoinPause userId={user.id} lang={lang}/>}"), "monté dans l'app (PC et téléphone)");

console.log("\n4. (07/11, Goulvenk) SESSION FERMÉE : « CONNECTE-TOI », JAMAIS « RESTREINT »");
const fermee = pauseLeboncoin(ps({ depuis: DEPUIS, derniere_preuve: DEPUIS, signe: "session_fermee" }));
ok(fermee?.sessionFermee === true, "signe « session_fermee » → bandeau de connexion");
ok(pauseLeboncoin(ps({ depuis: DEPUIS, signe: "http_403" }))?.sessionFermee === false && pauseLeboncoin(ps({ depuis: DEPUIS, signe: "datadome" }))?.sessionFermee === false,
  "une restriction (403, anti-robot) garde son bandeau");
for (const l of ["fr", "en"]) {
  const T = TEXTES_PAUSE_LBC[l];
  const txt = T.texteSession("depuis le 06/11 à 01:33");
  ok(typeof T.titreSession === "string" && !/restrei|restrict/i.test(T.titreSession + txt) && /leboncoin\.fr/.test(txt) && txt.includes(l === "fr" ? "« Leboncoin remarche »" : "“Leboncoin works again”"),
    `${l} : connexion à Leboncoin, sans « restreint », avec le bouton promis`);
}
ok(TEXTES_PAUSE_LBC.fr.titreSession === "Connecte-toi à Leboncoin sur ton ordinateur", "le titre dit exactement le circuit connexion");
ok(b.includes("pause?.sessionFermee ? T.titreSession : T.titre") && b.includes("(pause?.sessionFermee ? T.texteSession : T.texte)("), "le bandeau choisit le texte selon le signe");
ok(messageBlocageLbc("Chrome", DEPUIS, "session_fermee").includes("connecte-toi à ton compte Leboncoin"), "le message des tâches dit la même chose");

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
