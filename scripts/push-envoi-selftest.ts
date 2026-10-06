// Autotest (06/10/2026) — l'envoi des notifications de vente, sans réseau.
// Apple et Google sont simulés : on vérifie le TEXTE, le verdict de chaque
// réponse (jeton mort → oublié, panne → à réessayer, clé absente → jeton
// gardé), la bascule sandbox, et qu'un appareil en panne ne retient pas les
// autres.
//
//     npm run selftest:push-envoi
import {
  type Appareil, envoyerApns, envoyerFcm, envoyerNote, formaterPrix, messageVente, oublierJetonsServeur,
  resumerPourLaBase,
} from "../supabase/functions/_shared/push-envoi.ts";

let echecs = 0;
const ok = (c: boolean, nom: string, detail?: unknown) => {
  console.log(`${c ? "  ✓" : "  ✗"} ${nom}${c ? "" : `   ← ${JSON.stringify(detail)}`}`);
  if (!c) echecs++;
};

// Clés jetables, générées ici (jamais une vraie clé).
const ec = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const rsa = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true, ["sign", "verify"],
);
const pem = (der: ArrayBuffer) =>
  `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(der))).match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
const P8 = pem(await crypto.subtle.exportKey("pkcs8", ec.privateKey));
const RSA = pem(await crypto.subtle.exportKey("pkcs8", rsa.privateKey));
const apns = { keyId: "ABC123DEFG", teamId: "BQ379Y93X3", cleP8: P8.replace(/\n/g, "\\n"), topic: "app.fillsell.app" };
const fcm = { projectId: "fillsell-test", clientEmail: "push@fillsell-test.iam.gserviceaccount.com", privateKey: RSA };

const ios: Appareil = { id: "a-ios", plateforme: "ios", jeton: "ab".repeat(32) };
const android: Appareil = { id: "a-and", plateforme: "android", jeton: "fcm-" + "x".repeat(60) };
const note = { id: 42, plateforme: "vinted", titre: "Robe Mango corail", prix: 15, devise: "EUR", inventaire_id: 1700000000001, vente_id: 9 };

type Appel = { url: string; init?: RequestInit };
const reponse = (statut: number, corps?: unknown) =>
  new Response(corps == null ? null : JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });
const simule = (regles: Array<(a: Appel) => Response | null>) => {
  const appels: Appel[] = [];
  const f = (url: string, init?: RequestInit) => {
    const a = { url, init };
    appels.push(a);
    for (const r of regles) { const x = r(a); if (x) return Promise.resolve(x); }
    return Promise.reject(new Error("réseau coupé"));
  };
  return { f, appels };
};
const oauthOk = (a: Appel) => a.url.includes("oauth2.googleapis.com") ? reponse(200, { access_token: "ya29.test", expires_in: 3600 }) : null;

console.log("Le texte :");
const m = messageVente(note);
ok(m.titre === "🎉 Vendu sur Vinted", "titre « 🎉 Vendu sur Vinted »", m.titre);
ok(m.corps === "Robe Mango corail · 15 €", "corps « Robe Mango corail · 15 € »", m.corps);
ok(m.donnees.inventaire_id === "1700000000001" && m.donnees.type === "vente", "l'appui ouvre l'article (inventaire_id en données)", m.donnees);
ok(formaterPrix(15.5, "EUR") === "15,50 €", "prix à centimes : « 15,50 € »", formaterPrix(15.5, "EUR"));
ok(messageVente({ id: 1, plateforme: null, titre: "", prix: null }).titre === "🎉 Article vendu", "plateforme inconnue : « 🎉 Article vendu »");
ok(messageVente({ id: 1, plateforme: "ebay", titre: "Livre", prix: 8 }, "en").titre === "🎉 Sold on eBay", "anglais : « 🎉 Sold on eBay »");
ok(!/promo|offre|abonn/i.test(JSON.stringify(m)), "service seulement : aucun mot marketing dans la notification");

console.log("APNs (iOS) :");
oublierJetonsServeur();
{
  const s = simule([(a) => a.url.startsWith("https://api.push.apple.com") ? reponse(200) : null]);
  const r = await envoyerApns(s.f, apns, ios, m);
  const h = new Headers(s.appels[0]?.init?.headers);
  const corps = JSON.parse(String(s.appels[0]?.init?.body ?? "{}"));
  ok(r.etat === "ok", "200 → envoyée", r);
  ok(h.get("apns-topic") === "app.fillsell.app" && h.get("apns-push-type") === "alert" && /^bearer .+\..+\..+$/.test(h.get("authorization") ?? ""),
    "en-têtes APNs (topic, alert, JWT ES256)", Object.fromEntries(h));
  ok(corps.aps?.alert?.title === m.titre && corps.inventaire_id === "1700000000001", "charge utile APNs (aps.alert + données)", corps);
  const [entete] = String(h.get("authorization")).slice(7).split(".");
  ok(JSON.parse(atob(entete.replace(/-/g, "+").replace(/_/g, "/"))).kid === "ABC123DEFG", "JWT signé avec le Key ID de la clé .p8");
}
{
  const s = simule([(a) => a.url.startsWith("https://api.push.apple.com") ? reponse(410, { reason: "Unregistered" }) : null]);
  ok((await envoyerApns(s.f, apns, ios, m)).etat === "invalide", "410 Unregistered → jeton oublié");
}
{
  const s = simule([
    (a) => a.url.startsWith("https://api.push.apple.com") ? reponse(400, { reason: "BadDeviceToken" }) : null,
    (a) => a.url.startsWith("https://api.sandbox.push.apple.com") ? reponse(200) : null,
  ]);
  const r = await envoyerApns(s.f, apns, ios, m);
  ok(r.etat === "ok" && r.env === "sandbox", "BadDeviceToken en production → essai sandbox → retenu « sandbox »", r);
}
{
  const s = simule([(a) => a.url.includes("push.apple.com") ? reponse(400, { reason: "BadDeviceToken" }) : null]);
  ok((await envoyerApns(s.f, apns, ios, m)).etat === "invalide", "BadDeviceToken sur les deux passerelles → jeton oublié");
}
{
  const s = simule([(a) => a.url.includes("push.apple.com") ? reponse(403, { reason: "InvalidProviderToken" }) : null]);
  const r = await envoyerApns(s.f, apns, ios, m);
  ok(r.etat === "config", "403 clé refusée → notre configuration, jeton GARDÉ", r);
}
{
  const s = simule([(a) => a.url.includes("push.apple.com") ? reponse(503, { reason: "ServiceUnavailable" }) : null]);
  ok((await envoyerApns(s.f, apns, ios, m)).etat === "transitoire", "503 → à réessayer");
  const r = await envoyerApns(simule([]).f, apns, ios, m);
  ok(r.etat === "transitoire", "réseau coupé → à réessayer", r);
}
{
  const s = simule([(a) => a.url.includes("push.apple.com") ? reponse(400, { reason: "DeviceTokenNotForTopic" }) : null]);
  ok((await envoyerApns(s.f, apns, ios, m)).etat === "config", "DeviceTokenNotForTopic (APNS_TOPIC faux) → jeton GARDÉ, jamais une purge du parc");
}
ok((await envoyerApns(simule([]).f, null, ios, m)).etat === "config", "clé APNs absente → « config », jeton gardé");

console.log("FCM (Android) :");
oublierJetonsServeur();
{
  const s = simule([oauthOk, (a) => a.url.includes("fcm.googleapis.com/v1/projects/fillsell-test/messages:send") ? reponse(200, { name: "x" }) : null]);
  const r = await envoyerFcm(s.f, fcm, android, m);
  const envoi = s.appels.find((a) => a.url.includes("messages:send"));
  const corps = JSON.parse(String(envoi?.init?.body ?? "{}"));
  ok(r.etat === "ok", "200 → envoyée", r);
  ok(corps.message?.android?.notification?.channel_id === "ventes" && corps.message?.android?.priority === "HIGH",
    "canal « ventes », priorité haute (app fermée)", corps.message?.android);
  ok(corps.message?.notification?.body === m.corps && corps.message?.data?.inventaire_id === "1700000000001", "charge utile FCM (notification + données texte)", corps.message);
  const jeton = s.appels.find((a) => a.url.includes("oauth2"))?.init?.body as string;
  ok(/grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=.+\..+\..+/.test(jeton), "OAuth par JWT RS256 du compte de service");
}
{
  const s = simule([oauthOk, (a) => a.url.includes("messages:send")
    ? reponse(404, { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }) : null]);
  ok((await envoyerFcm(s.f, fcm, android, m)).etat === "invalide", "UNREGISTERED → jeton oublié");
}
{
  const s = simule([oauthOk, (a) => a.url.includes("messages:send")
    ? reponse(400, { error: { status: "INVALID_ARGUMENT", message: "Invalid JSON payload received.", details: [{ errorCode: "INVALID_ARGUMENT" }] } }) : null]);
  ok((await envoyerFcm(s.f, fcm, android, m)).etat === "echec", "400 sur la charge utile (pas le jeton) → jeton GARDÉ");
}
{
  const s = simule([oauthOk, (a) => a.url.includes("messages:send")
    ? reponse(400, { error: { status: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token" } }) : null]);
  ok((await envoyerFcm(s.f, fcm, android, m)).etat === "invalide", "jeton mal formé → jeton oublié");
}
{
  const s = simule([oauthOk, (a) => a.url.includes("messages:send") ? reponse(503, { error: { status: "UNAVAILABLE" } }) : null]);
  ok((await envoyerFcm(s.f, fcm, android, m)).etat === "transitoire", "503 → à réessayer");
}
{
  const s = simule([oauthOk, (a) => a.url.includes("messages:send")
    ? reponse(404, { error: { status: "NOT_FOUND", message: "Requested entity was not found." } }) : null]);
  ok((await envoyerFcm(s.f, fcm, android, m)).etat === "config", "404 sans UNREGISTERED (projet Firebase faux) → jeton GARDÉ, jamais une purge du parc");
}
ok((await envoyerFcm(simule([]).f, null, android, m)).etat === "config", "compte de service absent → « config », jeton gardé");

console.log("Une note, plusieurs appareils :");
oublierJetonsServeur();
{
  // iOS en panne réseau, Android OK : la note part, l'iPhone n'est pas oublié.
  const s = simule([oauthOk, (a) => a.url.includes("messages:send") ? reponse(200, {}) : null]);
  const b = await envoyerNote(s.f, apns, fcm, { ...note, appareils: [ios, android] });
  ok(b.statut === "envoyee", "un appareil en panne ne retient pas l'autre", b);
  const res = resumerPourLaBase([b], [ios, android]);
  ok(res.ok.includes("a-and") && res.invalides.length === 0 && res.echecs.some((e) => e.id === "a-ios"),
    "bilan pour la base : Android ok, iPhone en échec gardé (pas oublié)", res);
}
{
  const s = simule([(a) => a.url.includes("push.apple.com") ? reponse(410, { reason: "Unregistered" }) : null, oauthOk,
    (a) => a.url.includes("messages:send") ? reponse(404, { error: { details: [{ errorCode: "UNREGISTERED" }] } }) : null]);
  const b = await envoyerNote(s.f, apns, fcm, { ...note, appareils: [ios, android] });
  const res = resumerPourLaBase([b], [ios, android]);
  ok(b.statut === "echec" && res.invalides.length === 2, "deux jetons morts → note en échec, deux appareils oubliés", res);
}
{
  const lent = (_u: string) => new Promise<Response>(() => {}); // ne répond jamais
  const t0 = Date.now();
  const b = await envoyerNote(lent as never, apns, null, { ...note, appareils: [ios] });
  ok(b.statut === "a_reessayer" && Date.now() - t0 < 12_000, "appareil muet → délai borné (10 s), note à réessayer", { statut: b.statut, ms: Date.now() - t0 });
}

console.log(echecs ? `\n✗ ${echecs} cas en échec` : "\n✓ tous les cas passent");
Deno.exit(echecs ? 1 : 0);
