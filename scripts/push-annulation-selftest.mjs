// selftest:push-annulation — (25/10, point 3 de Nico) NOTIFICATION PUSH « VENTE ANNULÉE — <titre> : REMETTRE EN VENTE ? »
// Une annulation = UNE notification, seulement une annulation NEUVE (après l'armement, < 24 h), jamais une proposition
// acceptée ou close, jamais un mail ; texte FR/EN ; données lisibles par l'app ; envoi par le même module que les ventes.
//   npm run selftest:push-annulation
// Sans réseau ni base : le texte (module pur), l'envoi APNs/FCM SIMULÉ (clés jetables générées ici), les sources de
// push-ventes, de la migration 20261025040000 et de son inverse. La base se prouve par l'essai à blanc
// (scripts/essais/20261025040000_essai.sql, ROLLBACK).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const importer = (p) => import(pathToFileURL(path.join(RACINE, p)).href);
const { messageAnnulation, langueNotif } = await importer("supabase/functions/_shared/push-annulation.js");
const P = await importer("supabase/functions/_shared/push-envoi.ts");
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
console.log("push-annulation-selftest");

// ── A. Le texte ─────────────────────────────────────────────────────────────
const short = { id: 7, plateforme: "vinted", titre: "Short de bain Quiksilver taille M orange", inventaire_id: 1785871917724004, vente_id: 274921, nb_articles: 1 };
const fr = messageAnnulation(short, "fr");
ok(fr.titre === "Vente annulée sur Vinted" && fr.corps === "Short de bain Quiksilver taille M orange : remettre en vente ?",
  `A1. « ${fr.titre} » / « ${fr.corps} »`);
const en = messageAnnulation(short, "en");
ok(en.titre === "Sale cancelled on Vinted" && en.corps === "Short de bain Quiksilver taille M orange: list it again?", `A2. anglais : « ${en.titre} » / « ${en.corps} »`);
ok(messageAnnulation({ ...short, nb_articles: 3 }).corps === "Short de bain Quiksilver taille M orange et 2 autres articles : les remettre en vente ?"
  && messageAnnulation({ ...short, nb_articles: 2 }).corps === "Short de bain Quiksilver taille M orange et 1 autre article : les remettre en vente ?"
  && messageAnnulation({ ...short, nb_articles: 3 }, "en").corps === "Short de bain Quiksilver taille M orange and 2 other items: list them again?",
  "A3. une commande en lot : UNE notification qui compte ses articles");
ok(messageAnnulation({ id: 1, plateforme: "leboncoin", titre: "Lampe" }).titre === "Vente annulée sur Leboncoin"
  && messageAnnulation({ id: 1, plateforme: null, titre: "" }).titre === "Vente annulée"
  && messageAnnulation({ id: 1, plateforme: "inconnue", titre: "  " }).corps === "Un de tes articles : remettre en vente ?"
  && messageAnnulation({ id: 1 }, "en").corps === "One of your items: list it again?",
  "A4. plateforme inconnue, titre vide : un texte lisible, jamais « undefined »");
const long = messageAnnulation({ id: 1, plateforme: "vinted", titre: `Robe   ${"x".repeat(200)}` });
ok(long.corps.startsWith("Robe xxx") && long.corps.length === 120 + " : remettre en vente ?".length, "A5. titre resserré et borné à 120 caractères");
ok(langueNotif("en") === "en" && langueNotif("EN-gb") === "en" && langueNotif("fr") === "fr" && langueNotif(null) === "fr"
  && langueNotif("de") === "fr" && messageAnnulation(short, "en-US").titre === "Sale cancelled on Vinted",
  "A6. langue du profil (profiles.lang) : « en… » → anglais, tout le reste → français");
ok(!/promo|offre|abonn|premium|gratuit|%/i.test(JSON.stringify([fr, en])), "A7. service seulement : aucun mot marketing");

// ── B. Les données (lues par l'app) ─────────────────────────────────────────
const d = fr.donnees;
ok(Object.values(d).every((v) => typeof v === "string"), "B1. données : des chaînes seulement (FCM refuse le reste)");
ok(d.type === "vente_annulee" && d.inventaire_id === "1785871917724004" && d.vente_id === "274921" && d.plateforme === "vinted",
  `B2. type « vente_annulee », inventaire_id, vente_id, plateforme : ${JSON.stringify(d)}`);
ok(d.note_id === "annulation-7" && P.messageVente({ id: 7, plateforme: "vinted", titre: "x", prix: 5 }).donnees.note_id === "7",
  "B3. note_id « annulation-7 » : l'étiquette Android (vente-<note_id>) ne remplace jamais la notification de la vente n° 7");
ok(messageAnnulation({ ...short, nb_articles: 3 }).donnees.nb_articles === "3" && !("nb_articles" in d), "B4. nb_articles seulement pour un lot");
const pv = lire("src/notifications/pushVentes.js");
ok(/donnees\.type !== 'vente'\) return;/.test(pv) || /TYPES_OUVERTS = new Set\(\['vente', 'vente_annulee'\]\)/.test(pv),
  "B5. l'app d'avant n'ouvre que type « vente » (l'annulation : l'app s'ouvre, sans plus) ; l'app d'après mène à « Ventes annulées »");

// ── C. L'envoi : le même module que les ventes, le message de l'annulation (APNs et FCM simulés) ────────────────
const ec = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const rsa = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pem = (der) => `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString("base64").match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----`;
const apns = { keyId: "ABC123DEFG", teamId: "BQ379Y93X3", cleP8: pem(await crypto.subtle.exportKey("pkcs8", ec.privateKey)), topic: "app.fillsell.app" };
const fcm = { projectId: "fillsell-test", clientEmail: "push@fillsell-test.iam.gserviceaccount.com", privateKey: pem(await crypto.subtle.exportKey("pkcs8", rsa.privateKey)) };
const appels = [];
const f = async (url, init) => {
  appels.push({ url, corps: init?.body ? String(init.body) : "" });
  if (url.includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }), { status: 200 });
  return new Response(null, { status: 200 });
};
const appareils = [{ id: "a-ios", plateforme: "ios", jeton: "ab".repeat(32) }, { id: "a-and", plateforme: "android", jeton: `fcm-${"x".repeat(60)}` }];
P.oublierJetonsServeur();
const bilan = await P.envoyerNote(f, apns, fcm, { id: 7, appareils }, "fr", Date.now(), fr);
ok(bilan.statut === "envoyee" && bilan.resultat.length === 2 && bilan.resultat.every((r) => r.etat === "ok"), "C1. envoyée aux deux téléphones");
const corpsApns = JSON.parse(appels.find((a) => a.url.includes("/3/device/")).corps);
ok(corpsApns.aps.alert.title === "Vente annulée sur Vinted" && corpsApns.aps.alert.body === fr.corps && corpsApns.type === "vente_annulee"
  && corpsApns.inventaire_id === "1785871917724004", "C2. iOS : titre, texte et données de l'annulation");
const corpsFcm = JSON.parse(appels.find((a) => a.url.includes("messages:send")).corps).message;
ok(corpsFcm.notification.title === "Vente annulée sur Vinted" && corpsFcm.data.type === "vente_annulee"
  && corpsFcm.android.notification.tag === "vente-annulation-7" && corpsFcm.android.notification.channel_id === "ventes",
  "C3. Android : même texte, données, étiquette « vente-annulation-7 », canal « ventes »");
appels.length = 0;
await P.envoyerNote(f, apns, fcm, { id: 8, appareils: [appareils[0]], plateforme: "vinted", titre: "Robe", prix: 15 }, "fr");
ok(JSON.parse(appels.find((a) => a.url.includes("/3/device/")).corps).aps.alert.title === "🎉 Vendu sur Vinted",
  "C4. sans message fourni, envoyerNote envoie la VENTE comme avant (aucune régression)");
const sansCle = await P.envoyerNote(f, null, null, { id: 9, appareils }, "fr", Date.now(), fr);
ok(sansCle.statut === "echec" && sansCle.resultat.every((r) => r.etat === "config"), "C5. clés APNs/FCM absentes (la prod du 25/10) : « echec » config, jeton gardé, rien d'envoyé");

// ── D. push-ventes : la source « annulation », après les ventes, sans mail ──────────────────────────────────────
const pvx = lire("supabase/functions/push-ventes/index.ts");
ok(pvx.includes('import { langueNotif, messageAnnulation } from "../_shared/push-annulation.js";'), "D1. push-ventes importe le texte pur");
const corpsFn = pvx.slice(pvx.indexOf("async function pousserAnnulations("), pvx.indexOf("const json = (b: unknown"));
ok(corpsFn.length > 200 && /admin\.rpc\("push_annulations_a_envoyer", \{ p_limite: 20 \}\)/.test(corpsFn)
  && /admin\.rpc\("push_annulations_resultat", \{ p: resume \}\)/.test(corpsFn)
  && /envoyerNote\(fetch, cfgApns, cfgFcm, \{ id: n\.id, appareils: n\.appareils \?\? \[\] \}, lang, Date\.now\(\), messageAnnulation\(n, lang\)\)/.test(corpsFn),
  "D2. la base décide et réserve, push-ventes envoie le message de l'annulation et rend le verdict");
ok(!/envoyerEmail|mailVentes|email_logs|envoyerMailVente/.test(corpsFn), "D3. ⛔ AUCUN MAIL sur le chemin de l'annulation");
ok(/const fonctionAbsente = \(e: \{ code\?: string \} \| null \| undefined\) => e\?\.code === "PGRST202" \|\| e\?\.code === "42883";/.test(pvx)
  && /if \(!fonctionAbsente\(error\)\) bilan\.erreur/.test(corpsFn), "D4. base d'avant la migration : rien, aucune erreur (déploiement dans n'importe quel ordre)");
const iBoucle = pvx.lastIndexOf("if (finirApres) break;");
const iAnnul = pvx.indexOf("rapport.annulations = await pousserAnnulations(admin, cfgApns, cfgFcm);");
ok(iBoucle > 0 && iAnnul > iBoucle && /if \(Date\.now\(\) < fin - 8_000\) \{\s*try \{/.test(pvx.slice(iBoucle)),
  "D5. les annulations APRÈS les ventes, dans le temps qui reste, sous try/catch : jamais elles ne retardent une vente");
const sim = pvx.slice(pvx.indexOf('if (corps?.simulation === "annulations") {'), pvx.indexOf("const fin = Date.now() + 55_000;"));
ok(sim.length > 100 && /admin\.rpc\("push_annulations_apercu", \{ p_user: user \}\)/.test(sim) && !/envoyerNote|envoyerApns|envoyerFcm|push_annulations_a_envoyer/.test(sim),
  "D6. la simulation lit l'aperçu et rend les messages : rien n'est envoyé ni réservé");
ok(/aConfirmer: n\.a_decider === true/.test(pvx) && /const prixVente = prixVenteConnu\(n\.prix\);/.test(pvx)
  && /groupesDeMail\(notes\.filter\(\(n\) => n\.mail === true\)\)/.test(pvx), "D7. les ventes et leurs mails : inchangés");
const envoi = lire("supabase/functions/_shared/push-envoi.ts");
ok(/message\?: Message,\n\): Promise<BilanNote> \{\n  const m = message \?\? messageVente\(note, lang\);/.test(envoi), "D8. push-envoi : un message fourni, sinon la vente (défaut inchangé)");

// ── E. La base (migration 20261025040000, non appliquée tant que Nico n'a pas dit « feu vert ») ─────────────────
const mig = lire("supabase/migrations/20261025040000_push_vente_annulee.sql");
ok(/CONSTRAINT push_annulations_une_par_annulation UNIQUE \(user_id, cle\)/.test(mig) && /ON CONFLICT \(user_id, cle\) DO NOTHING;/.test(mig),
  "E1. UNE note par annulation (clé unique), jamais deux — même avec deux appels simultanés");
ok(/'commande:' \|\| public\.push_annulation_plateforme\(p_marque\) \|\| ':'/.test(mig) && /THEN 'vente:' \|\| \(p_marque ->> 'vente'\)/.test(mig),
  "E2. la clé : la commande (un lot = une notification), sinon la vente");
ok(/WHERE r\.statut = 'proposee'/.test(mig) && />= p_depuis/.test(mig) && /> now\(\) - interval '24 hours'/.test(mig)
  && /<= now\(\) - interval '6 minutes'/.test(mig), "E3. seulement une annulation NEUVE : proposée, après l'armement, < 24 h, 6 min de calme");
ok(/motif = 'plus_proposee'/.test(mig) && /ix\.statut = 'stock' AND ix\.fusionne_dans IS NULL/.test(mig) && /statut = 'sans_appareil'/.test(mig),
  "E4. relue avant l'envoi : acceptée, close, plus en stock → rien ; sans téléphone → rien");
ok(/INSERT INTO public\.coin_config \(key, value\) VALUES \('push_annulations_depuis', extract\(epoch FROM now\(\)\)::integer\)\nON CONFLICT \(key\) DO NOTHING;/.test(mig),
  "E5. armement à l'application : aucune annulation d'avant n'est notifiée ; 0 = coupé");
const sansCron = mig.slice(0, mig.indexOf("-- 10. Le réveil")).replace(/--[^\n]*/g, "");   // le CODE, sans les commentaires
ok(!/email_logs|envoyer_mail|push_ventes \(|INSERT INTO push_ventes|UPDATE remises_en_vente|UPDATE inventaire|UPDATE cross_post_jobs|net\.http_post/i.test(sansCron),
  "E6. ni mail, ni note de vente, ni proposition, fiche ou dépôt modifiés par la notification");
ok(/cron\.schedule\('push-annulations-1min', '\* \* \* \* \*'/.test(mig) && /public\.cron_secret\(\)/.test(mig)
  && /WHERE public\.push_annulations_en_attente\(\);/.test(mig) && !/push-ventes-1min|alter_job/.test(mig.replace(/--[^\n]*/g, "")),
  "E7. un cron À PART (secret lu, jamais écrit ; réveil seulement si une annulation attend) ; le cron 34 des ventes intact");
ok(/EXCEPTION WHEN OTHERS THEN\n  RETURN false;/.test(mig), "E8. le réveil ne lève jamais d'erreur");
ok((mig.match(/REVOKE ALL ON FUNCTION public\.push_annulations_\w+\([^)]*\) FROM PUBLIC, anon, authenticated;/g) ?? []).length === 5
  && (mig.match(/GRANT EXECUTE ON FUNCTION public\.push_annulations_\w+\([^)]*\) TO service_role;/g) ?? []).length === 5,
  "E9. fonctions réservées au rôle de service");
ok(/'jeton', a\.jeton/.test(mig) && !/'jeton'/.test(mig.slice(mig.indexOf("FUNCTION public.push_annulations_apercu"))), "E10. l'aperçu ne rend jamais un jeton");
const inv = lire("supabase/rollbacks/20261025040000_push_vente_annulee_INVERSE.sql");
ok(/cron\.unschedule\(jobid\) FROM cron\.job WHERE jobname = 'push-annulations-1min'/.test(inv) && /DROP TABLE IF EXISTS public\.push_annulations;/.test(inv)
  && /_backup_2510_push_annulations/.test(inv) && /DELETE FROM public\.coin_config WHERE key = 'push_annulations_depuis';/.test(inv),
  "E11. l'inverse retire tout (cron, fonctions, index, table sauvegardée, clé)");
const essai = lire("scripts/essais/20261025040000_essai.sql");
ok(/^begin;$/m.test(essai) && /^rollback;$/m.test(essai) && !/cron\.schedule/.test(essai) && !/^commit;?$/im.test(essai),
  "E12. l'essai à blanc : une transaction ANNULÉE, sans cron");

console.log(`push-annulation-selftest : ${n} contrôles verts`);
