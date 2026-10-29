// ═══════════════════════════════════════════════════════════════════════════
// PREUVE : LE JOURNAL DES NOTIFICATIONS NE BLOQUE JAMAIS UN PAIEMENT (12/10, A8)
// ═══════════════════════════════════════════════════════════════════════════
// Exigence de Nico : « l'écriture dans le journal ne doit JAMAIS bloquer le
// traitement d'un paiement. Si elle échoue, le paiement est traité normalement
// et l'échec est seulement signalé. Avant de déployer les deux webhooks,
// prouve-le : un achat, un renouvellement et un passage de palier, journal OK
// et journal en panne simulée, Apple ET Google. Les droits doivent être
// identiques dans les deux cas. Zéro régression sur les paiements existants. »
//
// Ce que fait ce banc (RIEN ne part en production, aucun réseau n'est ouvert
// au code testé : le processus enfant tourne SANS --allow-net) :
//   - charge les DEUX webhooks de l'arbre de travail (apple-iap-webhook,
//     google-play-webhook) ET leur version HEAD (copie temporaire à côté de
//     l'original, effacée à la fin) ;
//   - remplace `serve` (std) et `createClient` (supabase-js) par des faux
//     (import map) : base en mémoire, chaque écriture enregistrée ; le journal
//     `stores_notifications_journal` répond ok / erreur / exception / rejet /
//     bloqué selon le mode ;
//   - remplace `fetch` : email-tunnel (le signalement) enregistré, Google OAuth
//     et subscriptionsv2 simulés (clé RSA jetable générée ici) ;
//   - Apple : notifications RÉELLES signées par Apple, lues dans le fichier
//     donné en argument (jamais dans ce fichier) — la chaîne x5c est vérifiée
//     pour de vrai, hors ligne (@peculiar/x509 réel) ;
//   - compare, pour chaque scénario, écritures de droits + RPC + réponse HTTP +
//     mails entre journal OK et journal en panne, puis entre code neuf et HEAD.
//
// Lancer (depuis la racine du dépôt) :
//   deno run --allow-read --allow-write --allow-env --allow-run \
//     scripts/preuves/preuve-webhooks-journal.ts <apple-notifications.json> [--dossier-temp=<dir>] [--verbeux] [--sans-head] [--x509=brut]
// (--x509=brut : charge l'URL x509 telle que le webhook l'écrit, sans ?bundle — cf. controleX509Brut.)
// Le fichier JSON : { achat:[{type,subtype,productId,transactionId,appAccountToken,signedPayload}], renouvellement:[…], passage:[…] }.
// Il porte des identifiants réels : il ne se commite JAMAIS, et ce banc n'en
// affiche aucun (identifiants masqués « ‹…› »).

// deno-lint-ignore-file no-explicit-any

const ENFANT = Deno.env.get("PREUVE_WEBHOOKS_ENFANT") === "1";

function cheminDepuisUrl(u: URL): string {
  let p = decodeURIComponent(u.pathname);
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
  return Deno.build.os === "windows" ? p.replaceAll("/", "\\") : p;
}
function urlDepuisChemin(p: string): string {
  const n = p.replaceAll("\\", "/");
  return n.startsWith("/") ? `file://${n}` : `file:///${n}`;
}
const RACINE = cheminDepuisUrl(new URL("../../", import.meta.url)).replace(/[\\/]$/, "");
const SEP = Deno.build.os === "windows" ? "\\" : "/";
const joindre = (...p: string[]) => p.join(SEP);

const WEBHOOKS = {
  apple: "supabase/functions/apple-iap-webhook/index.ts",
  google: "supabase/functions/google-play-webhook/index.ts",
};

// ─────────────────────────────────────────────────────────────────────────────
// LES FAUX (écrits dans le dossier temporaire, branchés par l'import map)
// ─────────────────────────────────────────────────────────────────────────────
const FAUX_SERVE = `// Faux std/http/server.ts : enregistre le handler, ne démarre aucun serveur.
export function serve(handler: (req: Request) => Response | Promise<Response>, _opts?: unknown): Promise<void> {
  const g = globalThis as any;
  g.__preuveWebhooks ??= {};
  (g.__preuveWebhooks.handlers ??= []).push(handler);
  return Promise.resolve();
}
`;

const FAUX_SUPABASE = `// Faux supabase-js : base en mémoire, chaque appel enregistré dans l'état du scénario courant.
const JOURNAL = "stores_notifications_journal";
const etat = () => {
  const e = (globalThis as any).__preuveWebhooks?.etat;
  if (!e) throw new Error("preuve : aucun scénario en cours");
  return e;
};
const copie = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

class Requete {
  table: string; op = "select"; colonnes = "*"; payload: any; filtres: any[] = []; unique: string | null = null;
  constructor(table: string) { this.table = table; }
  select(c = "*") { if (this.op === "select") this.colonnes = c; return this; }
  insert(p: unknown) {
    this.op = "insert"; this.payload = copie(p);
    if (this.table === JOURNAL) {
      const e = etat();
      if (e.modeJournal === "exception") {
        e.journal.push({ ligne: copie(p), issue: "exception" });
        throw new Error("panne simulée du journal : exception levée par le client");
      }
    }
    return this;
  }
  update(p: unknown) { this.op = "update"; this.payload = copie(p); return this; }
  upsert(p: unknown) { this.op = "upsert"; this.payload = copie(p); return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.filtres.push(["eq", c, v]); return this; }
  neq(c: string, v: unknown) { this.filtres.push(["neq", c, v]); return this; }
  in(c: string, v: unknown) { this.filtres.push(["in", c, v]); return this; }
  is(c: string, v: unknown) { this.filtres.push(["is", c, v]); return this; }
  order() { return this; }
  limit() { return this; }
  range() { return this; }
  single() { this.unique = "single"; return this; }
  maybeSingle() { this.unique = "maybeSingle"; return this; }
  then(ok: any, ko: any) { return this.executer().then(ok, ko); }
  catch(ko: any) { return this.executer().catch(ko); }
  async executer(): Promise<any> {
    const e = etat();
    if (this.table === JOURNAL && this.op === "insert") {
      const ligne = this.payload;
      switch (e.modeJournal) {
        case "ok": e.journal.push({ ligne, issue: "ok" }); return { data: null, error: null, status: 201, statusText: "Created" };
        case "erreur":
          e.journal.push({ ligne, issue: "erreur" });
          return { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.stores_notifications_journal' in the schema cache", details: null, hint: null }, status: 404, statusText: "Not Found" };
        case "rejet":
          e.journal.push({ ligne, issue: "rejet" });
          throw new TypeError("panne simulée du journal : error sending request (connexion coupée)");
        case "bloque":
          e.journal.push({ ligne, issue: "bloque" });
          return new Promise(() => {}); // ne répond jamais
        default: throw new Error("mode de journal inconnu : " + e.modeJournal);
      }
    }
    const idEq = this.filtres.find((f) => f[0] === "eq" && f[1] === "id")?.[2];
    if (this.op === "select") {
      e.lectures.push({ table: this.table, colonnes: this.colonnes, filtres: copie(this.filtres) });
      const ligne = this.table === "profiles" && idEq != null ? e.profils[idEq] : undefined;
      let data: any = null;
      if (ligne) {
        if (this.colonnes === "*") data = { ...ligne };
        else { data = {}; for (const c of this.colonnes.split(",").map((s: string) => s.trim())) data[c] = ligne[c] ?? null; }
      }
      if (this.unique === "single" && !data) return { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, status: 406 };
      if (this.unique) return { data, error: null, status: 200 };
      return { data: data ? [data] : [], error: null, status: 200 };
    }
    e.ecritures.push({ table: this.table, op: this.op, payload: this.payload, filtres: copie(this.filtres) });
    if (this.table === "profiles" && this.op === "update" && idEq != null) e.profils[idEq] = { ...(e.profils[idEq] ?? { id: idEq }), ...this.payload };
    return { data: null, error: null, status: 204 };
  }
}

const MONTANTS: Record<string, number> = { premium: 300, pro: 1000, business: 3000 };

class Client {
  from(table: string) { return new Requete(table); }
  async rpc(fn: string, args: unknown) {
    const e = etat();
    e.rpcs.push({ fn, args: copie(args) });
    if (fn === "upgrade_monthly_grant") return { data: { granted: true, amount: MONTANTS[(args as any)?.p_tier] ?? 0 }, error: null };
    if (fn === "credit_purchased_coins") return { data: { credited: true }, error: null };
    if (fn === "cloud_essai_permis") return { data: { prepare: false }, error: null };
    return { data: null, error: { message: "rpc inconnue du banc : " + fn } };
  }
}

export function createClient(_url: string, _cle: string, _opts?: unknown) { return new Client(); }
`;

// La chaîne x5c (certificats PUBLICS d'Apple) d'une notification réelle, vérifiée
// par l'URL x509 BRUTE du webhook, dans un processus à part (sans import map).
async function controleX509Brut(jsonAbs: string): Promise<string> {
  try {
    const j = JSON.parse(await Deno.readTextFile(jsonAbs));
    const sp = String(j?.achat?.[0]?.signedPayload ?? "");
    const h = sp.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const x5c = JSON.parse(atob(h.padEnd(h.length + (4 - (h.length % 4)) % 4, "="))).x5c as string[];
    const code = `import * as x509 from "https://esm.sh/@peculiar/x509@1.9.0";
const x5c = JSON.parse(Deno.env.get("PREUVE_X5C"));
try {
  const c = x5c.map((b) => new x509.X509Certificate(Uint8Array.from(atob(b), (ch) => ch.charCodeAt(0))));
  let ok = true; for (let i = 0; i < c.length - 1; i++) ok = ok && await c[i].verify({ publicKey: c[i + 1] });
  console.log(ok ? "OK (chaîne Apple vérifiée)" : "ÉCHEC (chaîne refusée)");
} catch (e) { console.log("ÉCHEC — " + e.message); }`;
    const env: Record<string, string> = { PREUVE_X5C: JSON.stringify(x5c) };
    for (const k of ["PATH", "Path", "SYSTEMROOT", "SystemRoot", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "HOME", "TEMP", "TMP", "DENO_DIR", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"]) { const v = Deno.env.get(k); if (v != null) env[k] = v; }
    const r = await new Deno.Command(Deno.execPath(), { args: ["eval", "--no-config", "--no-lock", code], clearEnv: true, env, stdout: "piped", stderr: "piped" }).output();
    const sortie = new TextDecoder().decode(r.stdout).trim().split("\n").pop() ?? "";
    return sortie || `contrôle impossible (${new TextDecoder().decode(r.stderr).replace(/\x1b\[[0-9;]*m/g, "").trim().split("\n").pop()})`;
  } catch (e) { return `contrôle impossible (${(e as Error).message})`; }
}

// ─────────────────────────────────────────────────────────────────────────────
// LANCEUR : prépare faux + import map + copies HEAD, lance l'enfant SANS réseau
// ─────────────────────────────────────────────────────────────────────────────
async function lanceur() {
  const args = Deno.args;
  const json = args.find((a) => !a.startsWith("--"));
  if (!json) {
    console.error("usage : deno run --allow-read --allow-write --allow-env --allow-run scripts/preuves/preuve-webhooks-journal.ts <apple-notifications.json> [--dossier-temp=<dir>] [--verbeux] [--sans-head]");
    Deno.exit(2);
  }
  const jsonAbs = await Deno.realPath(json);
  const optTemp = args.find((a) => a.startsWith("--dossier-temp="))?.slice("--dossier-temp=".length);
  const sansHead = args.includes("--sans-head");
  let dossier: string;
  if (optTemp) { await Deno.mkdir(optTemp, { recursive: true }); dossier = await Deno.realPath(optTemp); }
  else dossier = await Deno.makeTempDir({ prefix: "preuve-webhooks-" });

  const fichiersFaux = {
    serve: joindre(dossier, "faux-serve.ts"),
    supabase: joindre(dossier, "faux-supabase-js.ts"),
    map: joindre(dossier, "import-map.json"),
  };
  await Deno.writeTextFile(fichiersFaux.serve, FAUX_SERVE);
  await Deno.writeTextFile(fichiersFaux.supabase, FAUX_SUPABASE);
  // @peculiar/x509 RESTE le vrai (vérification de la chaîne Apple). Mais l'URL
  // brute, résolue AUJOURD'HUI par esm.sh pour Deno (cible denonext), charge
  // DEUX copies de @peculiar/asn1-schema (2.8.0 + 2.10.0, publiée le 27/09) :
  // « Cannot get schema for '…' target » → toute signature Apple refusée (403).
  // Contrôle ci-dessous (l'URL brute, sans import map) ; le banc charge ensuite
  // le MÊME x509@1.9.0 en un seul paquet (?bundle), sauf --x509=brut.
  const x509Brut = args.includes("--x509=brut");
  const etatX509 = await controleX509Brut(jsonAbs);
  await Deno.writeTextFile(fichiersFaux.map, JSON.stringify({
    imports: {
      "https://deno.land/std@0.168.0/http/server.ts": urlDepuisChemin(fichiersFaux.serve),
      "https://esm.sh/@supabase/supabase-js@2.117.0": urlDepuisChemin(fichiersFaux.supabase),
      ...(x509Brut ? {} : { "https://esm.sh/@peculiar/x509@1.9.0": "https://esm.sh/@peculiar/x509@1.9.0?bundle" }),
    },
  }, null, 2));
  console.log(`contrôle esm.sh — https://esm.sh/@peculiar/x509@1.9.0 (URL du webhook, brute) : ${etatX509}`);
  console.log(`le banc charge : ${x509Brut ? "l'URL brute (--x509=brut)" : "https://esm.sh/@peculiar/x509@1.9.0?bundle (même version, une seule copie d'asn1-schema)"}\n`);

  // Copies HEAD, à côté des originaux (les imports relatifs ../_shared résolvent).
  const copiesHead: Record<string, string> = {};
  const suffixe = crypto.randomUUID().slice(0, 8);
  const nettoyer = () => {
    for (const p of Object.values(copiesHead)) { try { Deno.removeSync(p); } catch { /* déjà parti */ } }
    for (const p of Object.values(fichiersFaux)) { try { Deno.removeSync(p); } catch { /* */ } }
    if (!optTemp) { try { Deno.removeSync(dossier, { recursive: true }); } catch { /* */ } }
  };
  const surSignal = () => { nettoyer(); Deno.exit(130); };
  try { Deno.addSignalListener("SIGINT", surSignal); } catch { /* */ }
  if (Deno.build.os === "windows") { try { Deno.addSignalListener("SIGBREAK", surSignal); } catch { /* */ } }

  let code = 1;
  try {
    if (!sansHead) {
      for (const [canal, rel] of Object.entries(WEBHOOKS)) {
        const sortie = await new Deno.Command("git", { args: ["-C", RACINE, "show", `HEAD:${rel}`], stdout: "piped", stderr: "piped" }).output();
        if (!sortie.success) throw new Error(`git show HEAD:${rel} : ${new TextDecoder().decode(sortie.stderr)}`);
        const cible = joindre(RACINE, ...rel.split("/").slice(0, -1), `__preuve_head_${suffixe}.ts`);
        await Deno.writeFile(cible, sortie.stdout, { createNew: true });
        copiesHead[canal] = cible;
      }
    }
    const passe = ["PATH", "Path", "SYSTEMROOT", "SystemRoot", "WINDIR", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "HOME", "TEMP", "TMP", "TMPDIR", "DENO_DIR", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "DENO_CERT"];
    const env: Record<string, string> = { PREUVE_WEBHOOKS_ENFANT: "1" };
    for (const k of passe) { const v = Deno.env.get(k); if (v != null) env[k] = v; }
    if (copiesHead.apple) env.PREUVE_HEAD_APPLE = copiesHead.apple;
    if (copiesHead.google) env.PREUVE_HEAD_GOOGLE = copiesHead.google;
    const enfant = new Deno.Command(Deno.execPath(), {
      args: [
        "run", "--no-config", "--no-lock", `--import-map=${fichiersFaux.map}`,
        `--allow-read=${RACINE},${dossier},${jsonAbs}`, "--allow-env",
        // PAS de --allow-net : le code testé ne peut rien envoyer hors du faux fetch.
        cheminDepuisUrl(new URL(import.meta.url)), jsonAbs, ...args.filter((a) => a === "--verbeux"),
      ],
      cwd: dossier, clearEnv: true, env, stdout: "inherit", stderr: "inherit",
    });
    code = (await enfant.output()).code;
  } finally {
    nettoyer();
    const restes = Object.values(copiesHead).filter((p) => { try { Deno.statSync(p); return true; } catch { return false; } });
    console.log(restes.length ? `⚠ copies HEAD NON effacées : ${restes.join(", ")}` : `copies HEAD temporaires effacées (${Object.keys(copiesHead).length}).`);
  }
  Deno.exit(code);
}

// ─────────────────────────────────────────────────────────────────────────────
// ENFANT : les scénarios
// ─────────────────────────────────────────────────────────────────────────────
type Mode = "ok" | "erreur" | "exception" | "rejet" | "bloque";
const MODES_PANNE: Mode[] = ["erreur", "exception", "rejet", "bloque"];
// « bloque » : le journal (2 s) puis, pour une inconnue, le signalement (2 s) sont bornés — 6 s couvrent les deux.
const DELAI_MS = 6000;

async function enfant() {
  const ecrire = console.log.bind(console);
  const verbeux = Deno.args.includes("--verbeux");
  const G = ((globalThis as any).__preuveWebhooks ??= {});
  G.handlers ??= [];

  // Capture des journaux des webhooks (jamais affichés sauf --verbeux : ils portent des identifiants réels).
  for (const niveau of ["log", "info", "warn", "error"] as const) {
    const orig = (console as any)[niveau].bind(console);
    (console as any)[niveau] = (...a: unknown[]) => {
      const texte = a.map((x) => (typeof x === "string" ? x : Deno.inspect(x))).join(" ");
      G.etat?.console.push({ niveau, texte });
      if (verbeux) orig(`    [${niveau}] ${texte.slice(0, 300)}`);
    };
  }
  globalThis.addEventListener("unhandledrejection", (ev) => {
    ev.preventDefault();
    G.etat?.rejetsNonGeres.push(String((ev as any).reason?.message ?? ev.reason));
  });

  // Environnement factice (le lanceur a vidé l'environnement : aucun vrai secret ne peut être lu).
  const paire = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"],
  ) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", paire.privateKey));
  const b64 = btoa(Array.from(pkcs8, (o) => String.fromCharCode(o)).join(""));
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  Deno.env.set("SUPABASE_URL", "https://projet-factice.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "cle-de-service-factice");
  Deno.env.set("CRON_SECRET", "secret-de-cron-factice");
  Deno.env.set("GOOGLE_SERVICE_ACCOUNT_EMAIL", "compte-factice@projet-factice.iam.gserviceaccount.com");
  Deno.env.set("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", pem);

  // Faux fetch : email-tunnel (signalement), Google OAuth, subscriptionsv2. Tout le reste est refusé et noté.
  globalThis.fetch = (async (entree: Request | URL | string, init?: RequestInit) => {
    const e = G.etat;
    const url = typeof entree === "string" ? entree : entree instanceof URL ? entree.href : entree.url;
    if (url === "https://projet-factice.supabase.co/functions/v1/email-tunnel") {
      const corps = JSON.parse(String(init?.body ?? "{}"));
      e.signalements.push(corps);
      // Mode « bloque » : le SIGNALEMENT d'une inconnue ne répond jamais non plus (le mail « paiement
      // crédité », lui, est hors sujet : inchangé depuis HEAD).
      if (e.modeJournal === "bloque" && /INCONNUE/.test(corps?.payment_alert?.erreur ?? "")) return new Promise<Response>(() => {});
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "https://oauth2.googleapis.com/token") {
      e.appelsExternes.push("google:oauth");
      return new Response(JSON.stringify({ access_token: "jeton-acces-factice", expires_in: 3600, token_type: "Bearer" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const m = url.match(/^https:\/\/androidpublisher\.googleapis\.com\/androidpublisher\/v3\/applications\/([^/]+)\/purchases\/subscriptionsv2\/tokens\/(.+)$/);
    if (m) {
      e.appelsExternes.push(`google:subscriptionsv2:${decodeURIComponent(m[2])}`);
      const r = e.reponsesGoogle?.[decodeURIComponent(m[2])];
      if (!r) return new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 });
      return new Response(JSON.stringify(r), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    e?.fetchInattendus.push(url);
    throw new TypeError(`fetch refusé par le banc : ${url}`);
  }) as typeof fetch;

  // Chargement des webhooks (chacun une seule fois).
  const charger = async (chemin: string) => {
    const avant = G.handlers.length;
    await import(urlDepuisChemin(chemin));
    if (G.handlers.length !== avant + 1) throw new Error(`le module ${chemin} n'a pas appelé serve()`);
    return G.handlers[avant] as (r: Request) => Promise<Response>;
  };
  const H: Record<string, (r: Request) => Promise<Response>> = {
    apple: await charger(joindre(RACINE, ...WEBHOOKS.apple.split("/"))),
    google: await charger(joindre(RACINE, ...WEBHOOKS.google.split("/"))),
  };
  const headApple = Deno.env.get("PREUVE_HEAD_APPLE");
  const headGoogle = Deno.env.get("PREUVE_HEAD_GOOGLE");
  if (headApple) H.apple_head = await charger(headApple);
  if (headGoogle) H.google_head = await charger(headGoogle);

  // ── Notifications Apple réelles ──
  const fichier = Deno.args.find((a) => !a.startsWith("--"))!;
  const apple = JSON.parse(await Deno.readTextFile(fichier));
  const premiere = (k: string) => {
    const n = apple?.[k]?.[0];
    if (!n?.signedPayload) throw new Error(`fichier Apple : « ${k} » absent ou sans signedPayload`);
    return n;
  };
  const A = { achat: premiere("achat"), renouvellement: premiere("renouvellement"), passage: premiere("passage") };
  const requeteApple = (n: any) => () => new Request("https://projet-factice.supabase.co/functions/v1/apple-iap-webhook", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signedPayload: n.signedPayload }),
  });

  // ── Notifications Google construites (Pub/Sub push) ──
  const UUID_G = "00000000-0000-4000-8000-0000000000aa";
  const requeteGoogle = (notif: unknown) => () => new Request("https://projet-factice.supabase.co/functions/v1/google-play-webhook", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: { data: btoa(JSON.stringify(notif)), messageId: "preuve-1", publishTime: "2026-10-11T08:00:00Z" }, subscription: "projects/projet-factice/subscriptions/preuve" }),
  });
  const notifAbo = (type: number, produit: string, jeton: string) => ({
    version: "1.0", packageName: "app.fillsell", eventTimeMillis: "1791700000000",
    subscriptionNotification: { version: "1.0", notificationType: type, purchaseToken: jeton, subscriptionId: produit },
  });
  const achatV2 = (produit: string, o: { lie?: string; etat?: string } = {}) => ({
    kind: "androidpublisher#subscriptionPurchaseV2", regionCode: "FR", startTime: "2026-10-11T08:00:00Z",
    subscriptionState: o.etat ?? "SUBSCRIPTION_STATE_ACTIVE", latestOrderId: "GPA.0000-0000-0000-00001",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    ...(o.lie ? { linkedPurchaseToken: o.lie } : {}),
    lineItems: [{ productId: produit, expiryTime: "2026-11-11T08:00:00Z", autoRenewingPlan: { autoRenewEnabled: true } }],
    externalAccountIdentifiers: { obfuscatedExternalAccountId: UUID_G },
  });

  type Scenario = {
    canal: "apple" | "google"; nom: string; libelle: string; requete: () => Request;
    reponsesGoogle?: Record<string, unknown>; profils?: Record<string, Record<string, unknown>>;
    attendu: { ecritures: Array<Record<string, unknown>>; tier: string | null; http: number; inconnue?: boolean };
    head: "identique" | "droits_differents" | "signalement_en_plus";
    pourquoiHead?: string;
  };
  const P = "app.fillsell.premium.standard";
  const scenarios: Scenario[] = [
    { canal: "apple", nom: "achat", libelle: `${A.achat.type}/${A.achat.subtype ?? "—"} · ${A.achat.productId}`, requete: requeteApple(A.achat),
      attendu: { ecritures: [{ is_premium: true, subscription_cancel_at_period_end: false }], tier: "premium", http: 200 }, head: "identique" },
    { canal: "apple", nom: "renouvellement", libelle: `${A.renouvellement.type}/${A.renouvellement.subtype ?? "—"} · ${A.renouvellement.productId}`, requete: requeteApple(A.renouvellement),
      attendu: { ecritures: [{ is_premium: true, subscription_cancel_at_period_end: false }], tier: "premium", http: 200 }, head: "identique" },
    { canal: "apple", nom: "passage de palier", libelle: `${A.passage.type}/${A.passage.subtype ?? "—"} · ${A.passage.productId}`, requete: requeteApple(A.passage),
      attendu: { ecritures: [{ is_premium: true, is_pro: true, subscription_cancel_at_period_end: false }], tier: "pro", http: 200 },
      head: "droits_differents", pourquoiHead: "HEAD ne lit pas le sous-type : « Unhandled type » → 200 skipped, aucun droit (cas Ciddjy) — écart VOULU" },
    { canal: "google", nom: "achat", libelle: `type 4 PURCHASED · ${P}`, requete: requeteGoogle(notifAbo(4, P, "jeton-factice-achat")),
      reponsesGoogle: { "jeton-factice-achat": achatV2(P) },
      attendu: { ecritures: [{ is_premium: true, google_purchase_token: "jeton-factice-achat", google_product_id: P, subscription_cancel_at_period_end: false }], tier: "premium", http: 200 }, head: "identique" },
    { canal: "google", nom: "renouvellement", libelle: `type 2 RENEWED · ${P}`, requete: requeteGoogle(notifAbo(2, P, "jeton-factice-achat")),
      reponsesGoogle: { "jeton-factice-achat": achatV2(P) }, profils: { [UUID_G]: { id: UUID_G, google_purchase_token: "jeton-factice-achat", is_premium: true } },
      attendu: { ecritures: [{ is_premium: true, google_purchase_token: "jeton-factice-achat", google_product_id: P, subscription_cancel_at_period_end: false }], tier: "premium", http: 200 }, head: "identique" },
    { canal: "google", nom: "passage de palier", libelle: "type 4 PURCHASED · app.fillsell.pro.sub (linkedPurchaseToken = ancien Premium)",
      requete: requeteGoogle(notifAbo(4, "app.fillsell.pro.sub", "jeton-factice-pro")),
      reponsesGoogle: { "jeton-factice-pro": achatV2("app.fillsell.pro.sub", { lie: "jeton-factice-achat" }) },
      profils: { [UUID_G]: { id: UUID_G, google_purchase_token: "jeton-factice-achat", is_premium: true } },
      attendu: { ecritures: [{ is_premium: true, is_pro: true, google_purchase_token: "jeton-factice-pro", google_product_id: "app.fillsell.pro.sub", subscription_cancel_at_period_end: false }], tier: "pro", http: 200 }, head: "identique" },
    { canal: "google", nom: "inconnue (type 99)", libelle: `type 99 (absent de la table) · ${P}`, requete: requeteGoogle(notifAbo(99, P, "jeton-factice-achat")),
      reponsesGoogle: { "jeton-factice-achat": achatV2(P) },
      attendu: { ecritures: [], tier: null, http: 200, inconnue: true },
      head: "signalement_en_plus", pourquoiHead: "HEAD : même absence d'effet, mais ni journal ni alerte (jetée en silence)" },
    // (29/10, boncoin59300) Un remboursement est CONNU : alerte « Remboursement » (store_remboursement), jamais
    // « INCONNUE » ni « paiement non enregistré » ; aucune écriture de droit (REVOKED / EXPIRED s'en chargent).
    { canal: "google", nom: "remboursement (voidedPurchase)", libelle: "voidedPurchaseNotification (remboursement)",
      requete: requeteGoogle({ version: "1.0", packageName: "app.fillsell", eventTimeMillis: "1791700000000", voidedPurchaseNotification: { purchaseToken: "jeton-factice-achat", orderId: "GPA.0000-0000-0000-00001", productType: 1, refundType: 1 } }),
      attendu: { ecritures: [], tier: null, http: 200 },
      head: "signalement_en_plus", pourquoiHead: "HEAD : alerte « INCONNUE » / « PAIEMENT NON ENREGISTRÉ » ; le neuf : alerte « Remboursement » — écart VOULU" },
    { canal: "google", nom: "mise en pause (type 10)", libelle: `type 10 PAUSED · ${P} (info : décision NOUVELLE)`, requete: requeteGoogle(notifAbo(10, P, "jeton-factice-achat")),
      reponsesGoogle: { "jeton-factice-achat": achatV2(P, { etat: "SUBSCRIPTION_STATE_PAUSED" }) },
      profils: { [UUID_G]: { id: UUID_G, google_purchase_token: "jeton-factice-achat", is_premium: true } },
      attendu: { ecritures: [{ is_premium: false }], tier: null, http: 200 },
      head: "droits_differents", pourquoiHead: "HEAD ignorait le type 10 (accès gardé) ; le neuf coupe le droit (PREMIUM_OFF_TYPES + 10) — écart VOULU, hors exigence « paiement »" },
  ];

  // ── Un passage ──
  const nouvelEtat = (mode: Mode, s: Scenario) => ({
    modeJournal: mode, ecritures: [] as any[], rpcs: [] as any[], journal: [] as any[], lectures: [] as any[],
    signalements: [] as any[], appelsExternes: [] as string[], fetchInattendus: [] as string[], console: [] as any[],
    rejetsNonGeres: [] as string[], reponsesGoogle: s.reponsesGoogle ?? {}, profils: JSON.parse(JSON.stringify(s.profils ?? {})),
  });
  const jouer = async (handler: (r: Request) => Promise<Response>, s: Scenario, mode: Mode) => {
    const e = nouvelEtat(mode, s);
    G.etat = e;
    let minuteur: number | undefined;
    let http: { status: number; corps: string } | null = null, exception: string | null = null, bloque = false;
    const t0 = performance.now();
    try {
      const course = await Promise.race([
        Promise.resolve().then(() => handler(s.requete())).then((r) => ({ r })),
        new Promise<"delai">((ok) => { minuteur = setTimeout(() => ok("delai"), DELAI_MS); }),
      ]);
      if (course === "delai") bloque = true;
      else http = { status: course.r.status, corps: await course.r.text() };
    } catch (err) {
      exception = (err as Error)?.message ?? String(err);
    } finally { clearTimeout(minuteur); }
    const duree = Math.round(performance.now() - t0);
    G.etat = null;
    return { ...e, http, exception, bloque, duree };
  };

  // Signature comparée : droits (écritures hors journal + RPC), réponse HTTP, mails, appels Google.
  const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
  const signature = (r: any) => stable({ ecritures: r.ecritures, rpcs: r.rpcs, http: r.http, signalements: r.signalements, appels: r.appelsExternes });
  const signatureDroits = (r: any) => stable({ ecritures: r.ecritures, rpcs: r.rpcs });
  const msgJournal = (r: any) => r.console.filter((c: any) => c.niveau === "error" && c.texte.includes("[payment-notify] journal des notifications")).length;

  const montre = (k: string, v: unknown): string => {
    if (v === null || typeof v === "boolean" || typeof v === "number") return String(v);
    if (typeof v === "string") {
      if (/period_end|expir/i.test(k)) return "‹date›";
      if (/^app\.fillsell\./.test(v) || /factice/.test(v) || ["premium", "pro", "business", "payment"].includes(v)) return v;
      return "‹…›";
    }
    return "‹obj›";
  };
  const resumeDroits = (r: any) => {
    const ec = r.ecritures.map((w: any) => `${w.table}.${w.op}{${Object.entries(w.payload ?? {}).map(([k, v]) => `${k}:${montre(k, v)}`).join(", ")}}`);
    const rp = r.rpcs.map((c: any) => `rpc ${c.fn}(${c.args?.p_tier ?? "?"}, ${c.args?.p_source ?? "?"})`);
    const mails = r.signalements.map((s: any) => (s.payment_alert?.ok ? "mail « paiement crédité »" : `ALERTE « ${String(s.payment_alert?.erreur ?? "").slice(0, 40)}… »`));
    return [...(ec.length ? ec : ["aucune écriture de droit"]), ...(rp.length ? rp : ["aucune RPC"]),
      `HTTP ${r.http?.status ?? "—"} ${r.http?.corps ?? ""}`, ...(mails.length ? mails : ["aucun mail"])].join(" · ");
  };

  let echecs = 0;

  const ko = (quoi: string) => { echecs++; ecrire(`    ✗ ${quoi}`); };

  ecrire(`PREUVE — journal des notifications de store (webhooks de l'arbre de travail${headApple ? " vs HEAD" : " — HEAD non chargé"})`);
  ecrire(`modes de panne : ${MODES_PANNE.join(", ")} (« bloque » : l'insertion — et le signalement d'une inconnue — ne répondent jamais ; réponse exigée en moins de ${DELAI_MS / 1000} s)\n`);

  for (const s of scenarios) {
    ecrire(`${s.canal.toUpperCase()} · ${s.nom} — ${s.libelle}`);
    const base = await jouer(H[s.canal], s, "ok");
    ecrire(`  droits (journal OK) : ${resumeDroits(base)}`);
    const echecsAvantBase = echecs;

    // Attendus métier sur le passage « journal OK ».
    if (base.exception || !base.http) ko(`pas de réponse HTTP (${base.exception ?? "bloqué"})`);
    if (base.http && base.http.status !== s.attendu.http) ko(`HTTP ${base.http.status} au lieu de ${s.attendu.http}`);
    const profilsEcrits = base.ecritures.filter((w: any) => w.table === "profiles");
    if (base.ecritures.length !== s.attendu.ecritures.length || profilsEcrits.length !== s.attendu.ecritures.length) ko(`${base.ecritures.length} écriture(s) au lieu de ${s.attendu.ecritures.length}`);
    s.attendu.ecritures.forEach((att, i) => {
      const w = profilsEcrits[i];
      for (const [k, v] of Object.entries(att)) if (!w || w.payload?.[k] !== v) ko(`écriture ${i} : ${k} ≠ ${String(v)}`);
      if (w && !("is_pro" in att) && "is_pro" in (w.payload ?? {})) ko(`écriture ${i} : is_pro posé à tort`);
      const id = w?.filtres?.find((f: any) => f[1] === "id")?.[2];
      const idAttendu = s.canal === "apple" ? (A as any)[s.nom === "achat" ? "achat" : s.nom === "renouvellement" ? "renouvellement" : "passage"].appAccountToken : UUID_G;
      if (w && id !== idAttendu) ko(`écriture ${i} : mauvais compte visé`);
    });
    const grants = base.rpcs.filter((c: any) => c.fn === "upgrade_monthly_grant");
    if (s.attendu.tier ? !(grants.length === 1 && grants[0].args.p_tier === s.attendu.tier && base.rpcs.length === 1) : base.rpcs.length !== 0) ko(`RPC inattendues : ${base.rpcs.map((c: any) => `${c.fn}(${c.args?.p_tier})`).join(", ") || "aucune"}`);
    if (base.journal.length !== 1) ko(`${base.journal.length} essai(s) d'écriture au journal au lieu de 1`);
    const ligne = base.journal[0]?.ligne;
    if (ligne) {
      if (ligne.canal !== s.canal) ko(`journal : canal ${ligne.canal}`);
      if (s.attendu.inconnue ? ligne.connu !== false : ligne.connu !== true) ko(`journal : connu=${ligne.connu}`);
      if (s.attendu.inconnue && !base.signalements.some((x: any) => x.payment_alert?.ok === false && /INCONNUE/.test(x.payment_alert?.erreur ?? ""))) ko("inconnue : aucune alerte envoyée à email-tunnel");
      if (!s.attendu.inconnue && base.signalements.some((x: any) => /INCONNUE/.test(x.payment_alert?.erreur ?? ""))) ko("notification connue signalée comme INCONNUE");
      if (s.canal === "apple") {
        const n = (A as any)[s.nom === "achat" ? "achat" : s.nom === "renouvellement" ? "renouvellement" : "passage"];
        if (ligne.produit !== n.productId) ko("journal Apple : produit différent de la transaction");
        if (ligne.user_id !== n.appAccountToken) ko("journal Apple : compte différent de l'appAccountToken");
      }
    }
    if (msgJournal(base) !== 0) ko("journal OK mais console.error du journal émis");
    if (base.fetchInattendus.length) ko(`fetch inattendu(s) : ${base.fetchInattendus.length}`);
    if (base.rejetsNonGeres.length) ko(`rejet(s) non géré(s) : ${base.rejetsNonGeres.join(" | ")}`);
    const jl = ligne ? `connu=${ligne.connu}, effet=${ligne.effet}, type=${ligne.type}${ligne.sous_type ? "/" + ligne.sous_type : ""}` : "—";
    const cellules: string[] = [`ok ${echecs === echecsAvantBase ? "✓" : "✗"} (${base.journal.length} ligne : ${jl}, ${base.duree} ms)`];

    // Panne du journal : tout doit être IDENTIQUE.
    for (const mode of MODES_PANNE) {
      const r = await jouer(H[s.canal], s, mode);
      const pareil = signature(r) === signature(base);
      const ok = pareil && !r.exception && !r.bloque && r.journal.length === 1 && r.journal[0].issue === mode && msgJournal(r) >= 1 && !r.rejetsNonGeres.length && !r.fetchInattendus.length;
      if (!ok) {
        ko(`journal « ${mode} » : ${!pareil ? "droits/HTTP/mails DIFFÉRENTS" : ""}${r.exception ? ` exception ${r.exception}` : ""}${r.bloque ? " bloqué" : ""}${msgJournal(r) < 1 ? " aucun console.error" : ""}${r.journal.length !== 1 ? ` ${r.journal.length} essai(s)` : ""}`);
        if (!pareil) ecrire(`      neuf/${mode} : ${resumeDroits(r)}`);
      }
      cellules.push(`${mode} ${ok ? "✓ identique + console.error" : "✗"}`);
    }

    // HEAD : zéro régression.
    const hk = `${s.canal}_head`;
    if (H[hk]) {
      const h = await jouer(H[hk], s, "ok");
      if (h.journal.length !== 0) ko("HEAD a écrit au journal ?");
      const memesDroits = signatureDroits(h) === signatureDroits(base) && stable(h.http) === stable(base.http);
      const toutPareil = signature(h) === signature(base);
      let ok = false;
      if (s.head === "identique") ok = toutPareil;
      else if (s.head === "signalement_en_plus") ok = memesDroits && h.signalements.length === base.signalements.length - 1;
      else ok = !memesDroits;
      if (!ok) { ko(`HEAD : attendu « ${s.head} »`); ecrire(`      HEAD : ${resumeDroits(h)}`); }
      cellules.push(`HEAD ${ok ? "✓" : "✗"} ${s.head === "identique" ? "identique (droits, HTTP, mails)" : s.head === "signalement_en_plus" ? "mêmes droits/HTTP, sans alerte" : "droits différents"}`);
      if (s.head !== "identique") ecrire(`  HEAD : ${resumeDroits(h)}\n         ↳ ${s.pourquoiHead}`);
    }
    ecrire(`  ${cellules.join(" | ")}`);
    ecrire("");
  }

  // Apple : notification INCONNUE — impossible de bout en bout (la signature Apple ne se forge pas) ;
  // la table, elle, la classe bien « inconnue » (même fonction que le webhook).
  const { decisionApple } = await import(urlDepuisChemin(joindre(RACINE, "supabase", "functions", "_shared", "notifications-stores.js")));
  const inconnues = [["DID_CHANGE_RENEWAL_PREF", "SOUS_TYPE_FUTUR"], ["TYPE_FUTUR", null], ["SUBSCRIBED", "SOUS_TYPE_FUTUR"]];
  const okTable = inconnues.every(([t, st]) => decisionApple(t, st).connu === false);
  if (!okTable) ko("table Apple : un type/sous-type inconnu est classé « connu »");
  ecrire(`APPLE · inconnue : bout en bout impossible (signature Apple non forgeable) ; table decisionApple → connu=false pour ${inconnues.map(([t, st]) => `${t}/${st ?? "—"}`).join(", ")} ${okTable ? "✓" : "✗"}`);

  ecrire(`\nRÉSULTAT : ${echecs === 0 ? "✓ aucune différence de droits, de RPC, de réponse ni de mail entre journal OK et journal en panne (erreur, exception, rejet, sans réponse), Apple ET Google" : `✗ ${echecs} écart(s)`}`);
  Deno.exit(echecs === 0 ? 0 : 1);
}

if (ENFANT) await enfant();
else await lanceur();
