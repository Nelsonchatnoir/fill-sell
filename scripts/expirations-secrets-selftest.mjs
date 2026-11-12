// VERROU (12/11/2026, urgence de Nico) : LE SECRET « SE CONNECTER AVEC APPLE » DU WEB SE RENOUVELLE SEUL, ET TOUTE CLÉ OU
// CERTIFICAT QUI EXPIRE EST ANNONCÉ 30 JOURS AVANT.
//
//     npm run selftest:expirations-secrets
//
// Preuve (journaux auth, essais chez Apple) : depuis le 11/11 21:56, /callback → « oauth2: invalid_client — Unable to
// exchange external code » ; chez Apple, un secret EXPIRÉ de la même clé donne exactement « invalid_client », un neuf est
// accepté. Le secret client (JWT ES256, 6 mois au plus) n'était ni renouvelé ni surveillé.
//   A. Le secret : JWT ES256 vérifiable par la clé publique, iss/sub/aud/kid justes, 180 jours au plus.
//   B. Le renouvellement : dès que le secret a plus de 30 jours (un par mois) ; échéance inconnue = renouveler.
//   C. Les alertes : 30 jours avant, redites tous les 7 jours ; un échec de renouvellement, chaque jour.
//   D. La fonction : garde x-cron-secret, ne change QUE external_apple_secret, .p8 lue en secret serveur, mail à support.
//   E. Aucune clé privée dans le dépôt.
//   F. La migration sur un Postgres JETABLE : table, échéances, cron ; rejouable ; l'inverse retire tout.
import fs from "node:fs";
import { generateKeyPairSync, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const existe = (p) => fs.existsSync(join(ROOT, p));
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 400)}`}`); } };
const JOUR = 86_400_000;

let E = null;
try { E = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/expirations-secrets.js")).href); } catch { /* absent avant */ }

console.log("A. Le secret client Apple");
ok(!!E, "_shared/expirations-secrets.js existe");
if (E) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const p8 = privateKey.export({ type: "pkcs8", format: "pem" });
  const t0 = Date.UTC(2026, 10, 12, 17, 33, 25);
  const { jwt, iat, exp } = await E.secretClientApple({ p8, keyId: "TESTKEY123", teamId: "BQ379Y93X3", clientId: "app.fillsell.web", maintenantMs: t0 });
  const [h, c, s] = jwt.split(".");
  const dec = (x) => JSON.parse(Buffer.from(x, "base64url").toString("utf8"));
  const tete = dec(h), corps = dec(c);
  ok(verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")), "signature ES256 vérifiée par la clé publique");
  ok(tete.alg === "ES256" && tete.kid === "TESTKEY123", "en-tête : ES256 et kid de la clé", tete);
  ok(corps.iss === "BQ379Y93X3" && corps.sub === "app.fillsell.web" && corps.aud === "https://appleid.apple.com", "charge : Team ID, Services ID, aud Apple", corps);
  ok(exp - iat === 180 * 86_400 && iat === Math.floor(t0 / 1000), "180 jours (Apple : 6 mois au plus)");
  const long = await E.secretClientApple({ p8, keyId: "K", teamId: "T", clientId: "C", maintenantMs: t0, dureeJours: 400 });
  ok(long.exp - long.iat === 180 * 86_400, "une durée demandée plus longue est ramenée à 180 jours");
}

console.log("B. Le renouvellement");
if (E) {
  const now = Date.UTC(2026, 11, 13);
  ok(E.doitRenouveler(new Date(now + 149 * JOUR).toISOString(), now) && !E.doitRenouveler(new Date(now + 179 * JOUR).toISOString(), now),
    "plus de 30 jours d'âge (moins de 150 jours restants) → un neuf ; à 1 jour d'âge → rien");
  ok(E.doitRenouveler(null, now) && E.doitRenouveler("illisible", now), "échéance inconnue → renouveler");
  ok(E.doitRenouveler(new Date(now - JOUR).toISOString(), now), "secret déjà expiré → renouveler (la panne du 11/11)");
}

console.log("C. Les alertes");
if (E) {
  const now = Date.UTC(2027, 2, 20);
  const l = (o) => ({ nom: "x", libelle: "X", ...o });
  ok(E.alertesDuJour([l({ expire_le: new Date(now + 29 * JOUR).toISOString() })], now).length === 1, "échéance à 29 jours → alerte");
  ok(E.alertesDuJour([l({ expire_le: new Date(now + 31 * JOUR).toISOString() })], now).length === 0, "échéance à 31 jours → rien");
  ok(E.alertesDuJour([l({ expire_le: new Date(now + 10 * JOUR).toISOString(), alerte_envoyee_le: new Date(now - 3 * JOUR).toISOString() })], now).length === 0
    && E.alertesDuJour([l({ expire_le: new Date(now + 10 * JOUR).toISOString(), alerte_envoyee_le: new Date(now - 8 * JOUR).toISOString() })], now).length === 1,
    "redite tous les 7 jours, pas chaque jour");
  const echec = E.alertesDuJour([l({ expire_le: new Date(now + 140 * JOUR).toISOString(), dernier_echec: "HTTP 401", echec_le: new Date(now - 3600_000).toISOString(), alerte_envoyee_le: new Date(now - JOUR / 2).toISOString() })], now);
  ok(echec.length === 1 && echec[0].motif === "echec", "un renouvellement raté → alerte le jour même, même loin de l'échéance", echec);
}

console.log("D. La fonction expirations-secrets");
const FN = "supabase/functions/expirations-secrets/index.ts";
const fn = existe(FN) ? lire(FN) : "";
ok(/req\.headers\.get\("x-cron-secret"\) !== attendu\) return json\(\{ error: "Non autorisé" \}, 401\)/.test(fn), "garde x-cron-secret (appelée par pg_cron, verify_jwt = false)");
const fnCode = fn.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
ok(/body: JSON\.stringify\(\{ external_apple_secret: jwt \}\)/.test(fnCode) && (fnCode.match(/external_/g) ?? []).length === 1 && (fnCode.match(/method: "PATCH"/g) ?? []).length === 1,
  "ne change QUE external_apple_secret dans la configuration auth (identifiants clients, redirections, autres fournisseurs intouchés)");
ok(/Deno\.env\.get\("APPLE_SIWA_P8"\)/.test(fn) && /Deno\.env\.get\("GESTION_SUPABASE_JETON"\)/.test(fn), ".p8 et jeton de l'API de gestion lus en secrets serveur");
const iSonde = fnCode.indexOf('fetch("https://appleid.apple.com/auth/token"'), iPatch = fnCode.indexOf('method: "PATCH"');
ok(iSonde > 0 && iPatch > iSonde && /if \(!\/invalid_grant\/\.test\(reponseApple\)\) throw new Error\(/.test(fnCode),
  "le secret neuf est présenté à Apple AVANT d'être posé ; refusé → rien n'est posé (la connexion Apple ne casse jamais par lui)");
ok(/const TO = "support@fillsell\.app";/.test(fn) && /to: \[TO\]/.test(fn) && !/\.email\b|profiles/.test(fn), "le mail part à support@ seulement, jamais à un client");
const cfg = lire("supabase/config.toml");
ok(/\[functions\.expirations-secrets\]\s*\n(#[^\n]*\n)*verify_jwt = false/.test(cfg), "config.toml : verify_jwt = false (appelant sans session)");

console.log("E. Aucune clé privée dans le dépôt");
const fichiers = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f && !/^node_modules\//.test(f) && /\.(js|mjs|ts|json|sql|md|p8|pem|txt|toml|ya?ml|env)$/.test(f));
// Une VRAIE clé = l'en-tête suivi de son corps base64 (le code qui enlève ou fabrique un en-tête PEM n'en est pas une).
const VRAIE_CLE = /-----BEGIN (EC )?PRIVATE KEY-----(\\n|\s)*[A-Za-z0-9+/]{40,}/;
const avecCle = fichiers.filter((f) => { try { return VRAIE_CLE.test(fs.readFileSync(join(ROOT, f), "utf8")); } catch { return false; } });
ok(avecCle.length === 0 && !fichiers.some((f) => /AuthKey_|\.p8$/.test(f)), "aucune clé privée (en-tête + corps) ni fichier .p8 suivi par git", avecCle);

console.log("F. La migration sur un Postgres jetable");
const MIG = "supabase/migrations/20261112190000_expirations_secrets.sql", INV = "supabase/rollbacks/20261112190000_expirations_secrets_INVERSE.sql";
ok(existe(MIG) && existe(INV), "la migration et son inverse existent");
if (existe(MIG) && existe(INV)) {
  const pg = (await import("pg")).default;
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const port = 57000 + Math.floor(Math.random() * 1500);
  const dossier = mkdtempSync(join(tmpdir(), "fillsell-banc-expirations-"));
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: "postgres", password: "banc", port, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: () => {}, onError: () => {} });
  await base.initialise(); await base.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on("notice", () => {});
  try {
    await c.query(`DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE SCHEMA cron; CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, jobname text UNIQUE, schedule text, command text);
      CREATE FUNCTION cron.schedule(n text, s text, cmd text) RETURNS bigint LANGUAGE sql AS $f$ INSERT INTO cron.job (jobname, schedule, command) VALUES (n, s, cmd) RETURNING jobid $f$;
      CREATE FUNCTION cron.unschedule(n text) RETURNS boolean LANGUAGE sql AS $f$ DELETE FROM cron.job WHERE jobname = n RETURNING true $f$;
      CREATE SCHEMA net; CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}', headers jsonb DEFAULT '{}', timeout_milliseconds integer DEFAULT 5000) RETURNS bigint LANGUAGE sql AS $f$ SELECT 1::bigint $f$;
      CREATE FUNCTION public.cron_secret() RETURNS text LANGUAGE sql AS $f$ SELECT 'secret-d-essai'::text $f$;`);
    await c.query(lire(MIG));
    const lignes = (await c.query("SELECT nom, renouvellement, expire_le FROM public.expirations_secrets ORDER BY nom")).rows;
    const job = (await c.query("SELECT schedule, command FROM cron.job WHERE jobname = 'expirations-secrets-jour'")).rows[0];
    const apple = lignes.find((l) => l.nom === "apple_siwa_secret_web");
    ok(lignes.length === 8 && apple?.renouvellement === "automatique" && new Date(apple.expire_le).toISOString() === "2027-05-11T18:33:25.000Z", "8 échéances, le secret Apple en automatique (11/05/2027 19:33 Paris)", lignes.map((l) => l.nom));
    ok(job?.schedule === "10 6 * * *" && /functions\/v1\/expirations-secrets/.test(job.command) && /x-cron-secret/.test(job.command), "cron quotidien 06:10 UTC vers expirations-secrets, avec le secret du cron", job);
    const droits = (await c.query("SELECT relrowsecurity rls, has_table_privilege('anon','public.expirations_secrets','SELECT') anon FROM pg_class WHERE relname = 'expirations_secrets'")).rows[0];
    ok(droits.rls === true && droits.anon === false, "RLS sans policy, rien pour anon / authenticated", droits);
    await c.query(lire(MIG));
    ok(Number((await c.query("SELECT count(*) n FROM cron.job WHERE jobname = 'expirations-secrets-jour'")).rows[0].n) === 1 && Number((await c.query("SELECT count(*) n FROM public.expirations_secrets")).rows[0].n) === 8, "rejouable : un seul cron, aucune ligne en double");
    await c.query(lire(INV));
    const reste = (await c.query("SELECT to_regclass('public.expirations_secrets') t, (SELECT count(*) FROM cron.job WHERE jobname = 'expirations-secrets-jour') j")).rows[0];
    ok(reste.t === null && Number(reste.j) === 0, "l'inverse retire le cron et la table", reste);
    await c.query(lire(MIG));
    ok(Number((await c.query("SELECT count(*) n FROM public.expirations_secrets")).rows[0].n) === 8, "migration rejouée après l'inverse : de nouveau en place");
  } finally { await c.end().catch(() => {}); await base.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ } }
}

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
