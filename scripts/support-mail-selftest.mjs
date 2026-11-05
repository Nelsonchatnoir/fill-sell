// Autotest — mails de support@fillsell.app (05/11 soir, point 6 d) — `npm run selftest:support-mail`.
// Le Worker Cloudflare n'a AUCUN secret ; il archive par la fonction support-mail, transfère TOUJOURS (même sans archive),
// note le résultat ; la fonction garde ses bornes et alerte en direct sur un transfert échoué.
import fs from "node:fs";

let ko = 0, n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const w = lire("cloudflare/email-support/worker.js");
const f = lire("supabase/functions/support-mail/index.ts");

console.log("1. Le Worker ne porte aucun secret");
ok(!/SERVICE_ROLE|RESEND|apikey|Authorization/.test(w), "aucune clé lue ni envoyée par le Worker");
ok(/env\.SUPPORT_MAIL_URL/.test(w) && /env\.DESTINATION/.test(w), "deux variables seulement : SUPPORT_MAIL_URL, DESTINATION");

console.log("\n2. Le Worker rejoué sur des faux messages");
const mod = await import(`data:text/javascript;base64,${Buffer.from(w).toString("base64")}`);
const message = (texte, forwardOk = true) => {
  const octets = new TextEncoder().encode(texte);
  const vus = { forward: [] };
  return { vus, m: {
    from: "client@exemple.fr", to: "support@fillsell.app",
    headers: new Map([["subject", "Aide"], ["from", "Client <client@exemple.fr>"], ["message-id", "<x@y>"]]),
    raw: new ReadableStream({ start(c) { c.enqueue(octets.slice(0, 5)); c.enqueue(octets.slice(5)); c.close(); } }),
    forward: async (dest) => { vus.forward.push(dest); if (!forwardOk) throw new Error("refusé"); },
  } };
};
const appels = [];
let reponse = { ok: true, json: async () => ({ id: 7 }) };
globalThis.fetch = async (url, init) => { appels.push({ url, corps: JSON.parse(init.body) }); if (reponse === "panne") throw new Error("réseau"); return reponse; };
const env = { SUPPORT_MAIL_URL: "https://exemple/functions/v1/support-mail", DESTINATION: "boite@exemple.com" };

let x = message("Bonjour, j'ai un souci avec mes ventes.");
await mod.default.email(x.m, env);
ok(appels[0]?.corps.action === "archiver" && appels[0].corps.extrait.includes("souci avec mes ventes") && appels[0].corps.a === "support@fillsell.app",
  "archive d'abord (texte reconstitué depuis plusieurs morceaux)", JSON.stringify(appels[0]?.corps));
ok(x.vus.forward[0] === "boite@exemple.com" && appels[1]?.corps.action === "noter" && appels[1].corps.transfert === "ok" && appels[1].corps.id === 7,
  "puis transfert, puis note « ok »");

appels.length = 0; reponse = "panne"; x = message("Archive en panne");
await mod.default.email(x.m, env);
ok(x.vus.forward.length === 1, "fonction injoignable : le mail est TRANSFÉRÉ quand même");

appels.length = 0; reponse = { ok: true, json: async () => ({ id: 9 }) }; x = message("Transfert refusé", false);
await mod.default.email(x.m, env);
ok(appels[1]?.corps.transfert === "echec" && appels[1].corps.id === 9 && /refusé/.test(appels[1].corps.erreur), "transfert refusé : note « echec » avec l'erreur (la fonction alerte)");

console.log("\n3. La fonction support-mail garde ses bornes");
ok(/MAX_CORPS = 120_000/.test(f) && /@fillsell\\.app/.test(f) && /MAX_PAR_HEURE = 120/.test(f), "corps borné, destinataire @fillsell.app, 120 mails par heure");
ok(/\.eq\("transfert", "en_cours"\)\.gte\("recu_le"/.test(f), "une note seulement sur un mail en cours archivé il y a moins de 15 min");
ok(/ALERTE_DIRECTE/.test(f) && !/to: \[\s*"support@fillsell\.app"/.test(f) && /MAX_ALERTES_PAR_HEURE = 5/.test(f), "alerte directe à la boîte de Nico, jamais vers support@, 5 par heure au plus");
ok(!/\.select\("\*"\)|\.from\("support_mails"\)\.select\("(?!id)/.test(f), "la fonction ne rend jamais le contenu d'un mail (seulement l'identifiant)");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — mails de support`);
process.exit(ko ? 1 : 0);
