// ═══════════════════════════════════════════════════════════════════════════
// Selftest « une Auth indisponible n'est pas un jeton invalide » (04/11, sebastien64310, b3727bbe)
//   npm run selftest:auth-indisponible
//
// LE CAS : le 04/11 à 19:21:46 (Paris), l'Auth de Supabase a redémarré ~6 s ; /auth/v1/user rendait 521 (page HTML)
// puis 503. Nos gardes en faisaient des 401 « Token invalide ou expiré » (get-pending-jobs ×6, update-job-status ×2,
// extension-session ×1) : un redépôt Leboncoin déjà en ligne déclaré « pas pu être redéposé », une session marquée
// rejetée, des sessions d'extension purgées.
// CE QUE CE TEST PROUVE, avec le VRAI client supabase-js (getUser sur un fetch scripté) :
//   1. les réponses de la coupure (521 HTML, 503, réseau coupé, 500) → 503 « auth_indisponible » ;
//   2. les vrais refus de l'Auth (403 bad_jwt, 401, session absente) → 401 « Token invalide ou expiré », comme avant ;
//   3. les trois gardes de l'extension (get-pending-jobs, update-job-status, extension-session) décident par
//      refusAuthentification, et extension-session ne marque plus « rejetée » une session sur une Auth indisponible.
// (Le client des fonctions est supabase-js 2.117 par esm.sh, celui du poste 2.101 : mêmes classes d'erreur d'auth-js.)
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const A = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/auth-indisponible.js")).href);

let ko = 0;
const ok = (cond, nom, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// getUser() tel que nos fonctions l'appellent (jeton dans l'en-tête Authorization du client), sur une réponse donnée.
async function getUserSur(reponse) {
  const fetchScripte = async (url) => {
    if (!String(url).includes("/auth/v1/user")) throw new Error(`appel inattendu ${url}`);
    if (reponse === "reseau") throw new TypeError("fetch failed");
    return reponse();
  };
  const client = createClient("https://exemple.supabase.co", "anon", {
    global: { headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1In0.x" }, fetch: fetchScripte },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser();
  return { user: data?.user ?? null, error };
}
const json = (status, corps, entetes = {}) => () => new Response(JSON.stringify(corps), { status, headers: { "Content-Type": "application/json", ...entetes } });
const html = (status) => () => new Response("<html><body>Web server is down</body></html>", { status, headers: { "Content-Type": "text/html" } });

console.log("\n[1] la coupure du 04/11 : 503 « auth_indisponible », jamais « Token invalide »");
for (const [nom, rep] of [["521 (page HTML de la passerelle)", html(521)], ["520", html(520)], ["503", html(503)], ["502", html(502)],
  ["réseau coupé", "reseau"], ["500 JSON", json(500, { msg: "database is not accepting connections" })]]) {
  const { user, error } = await getUserSur(rep);
  const r = A.refusAuthentification(error);
  ok(!user && error && r.status === 503 && r.body.code === "auth_indisponible" && r.body.error === A.ERREUR_AUTH_INDISPONIBLE,
    `${nom} → 503`, `${error?.name} status=${error?.status} → ${JSON.stringify(r)}`);
}

console.log("\n[2] les vrais refus de l'Auth : 401 « Token invalide ou expiré », comme avant");
for (const [nom, rep] of [
  ["403 bad_jwt", json(403, { code: "bad_jwt", msg: "invalid JWT: unable to parse or verify signature" }, { "x-supabase-api-version": "2024-01-01" })],
  ["401", json(401, { msg: "JWT expired" })],
  ["403 session_not_found", json(403, { code: "session_not_found", msg: "Session from session_id claim in JWT does not exist" }, { "x-supabase-api-version": "2024-01-01" })],
  ["404 utilisateur supprimé", json(404, { code: "user_not_found", msg: "User from sub claim in JWT does not exist" }, { "x-supabase-api-version": "2024-01-01" })],
]) {
  const { user, error } = await getUserSur(rep);
  const r = A.refusAuthentification(error);
  ok(!user && error && r.status === 401 && r.body.error === "Token invalide ou expiré", `${nom} → 401`, `${error?.name} status=${error?.status} → ${JSON.stringify(r)}`);
}
ok(A.refusAuthentification(null).status === 401, "aucune erreur mais aucun utilisateur → 401");
{
  const { user, error } = await getUserSur(json(200, { id: "u1", aud: "authenticated", email: "x@y.z" }));
  ok(user?.id === "u1" && !error, "jeton accepté : l'utilisateur, aucune erreur");
}

console.log("\n[3] les trois gardes de l'extension");
for (const f of ["get-pending-jobs", "update-job-status", "extension-session"]) {
  const src = lire(`supabase/functions/${f}/index.ts`);
  ok(/import \{[^}]*refusAuthentification[^}]*\} from "\.\.\/_shared\/auth-indisponible\.js";/.test(src) && /refusAuthentification\(authErr\)/.test(src), `${f} décide par refusAuthentification`);
  ok(!/if \(authErr \|\| !user\) return json\(\{ error: "Token invalide ou expiré" \}, 401\);/.test(src), `${f} : plus de 401 sur tout échec de getUser`);
}
const es = lire("supabase/functions/extension-session/index.ts");
const iIndispo = es.indexOf("if (authErr && !jetonRefuse(authErr))");
const iStamp = es.indexOf("extension_session_rejetee_at: new Date().toISOString()");
ok(iIndispo > 0 && iStamp > iIndispo, "extension-session : l'Auth indisponible sort AVANT le marquage « session rejetée »");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ une Auth indisponible rend 503 ; seul un refus de l'Auth rend 401");
