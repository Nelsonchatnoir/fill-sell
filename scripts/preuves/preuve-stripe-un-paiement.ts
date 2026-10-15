// ═══════════════════════════════════════════════════════════════════════════
// PREUVE : UN PAIEMENT STRIPE = UNE ÉCRITURE ET UNE NOTIFICATION (15/10, lot D)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur — DeadRoz (14/10 01:20, passage en Business, UN prélèvement de
// 59,99 €) : deux lignes grant_upgrade (« premium » puis « business ») et deux
// « Paiement reçu » à la seconde. invoice.paid, traité AVANT
// checkout.session.completed, retrouvait le compte par l'ANCIEN identifiant
// Stripe (client qui revient) et lisait le palier sur des drapeaux à false.
//
// Ce banc joue des ÉVÉNEMENTS SIMULÉS (aucun compte Stripe touché, aucun
// réseau : le processus enfant tourne SANS --allow-net) contre le webhook de
// l'arbre de travail ET sa version HEAD :
//   - faux `serve`, faux supabase-js (profils, portefeuille, grand livre en
//     mémoire ; upgrade_monthly_grant et grant_monthly_coins rejoués fidèlement
//     à leur définition EN PROD du 15/10, montants coin_config du 15/10), faux
//     SDK Stripe (constructEventAsync rend l'événement, abonnements et
//     factures servis par le scénario), faux fetch (email-tunnel enregistré) ;
//   - pour chaque scénario : crédits (lignes du grand livre), mails, réponse.
//
// Lancer depuis la racine du dépôt :
//   deno run --allow-read --allow-write --allow-env --allow-run scripts/preuves/preuve-stripe-un-paiement.ts [--verbeux]
// deno-lint-ignore-file no-explicit-any

const ENFANT = Deno.env.get("PREUVE_STRIPE_ENFANT") === "1";

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
const WEBHOOK = "supabase/functions/stripe-webhook/index.ts";

// ─────────────────────────────────────────────────────────────────────────────
// LES FAUX
// ─────────────────────────────────────────────────────────────────────────────
const FAUX_SERVE = `export function serve(handler: (req: Request) => Response | Promise<Response>, _o?: unknown): Promise<void> {
  const g = globalThis as any; g.__preuveStripe ??= {}; (g.__preuveStripe.handlers ??= []).push(handler);
  return Promise.resolve();
}
`;

const FAUX_SUPABASE = `// Faux supabase-js : profils, portefeuilles et grand livre en mémoire.
const e = () => { const s = (globalThis as any).__preuveStripe?.etat; if (!s) throw new Error("aucun scénario"); return s; };
const copie = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const GRANT: Record<string, number> = { free: 50, premium: 400, pro: 1200, business: 3000 };
const JOUR = 86400000;
const jourIso = (t: number) => new Date(t).toISOString().slice(0, 10);

function portefeuille(s: any, u: string) { return (s.portefeuilles[u] ??= { included: 0, purchased: 0, next: null }); }
// grant_monthly_coins — définition EN PROD du 15/10 (p_source 'payment').
function grantMonthly(s: any, u: string, tier: string, periodEnd: number | null, source: string) {
  const amount = GRANT[tier]; if (amount == null) return { granted: false, reason: "grant_not_configured" };
  const w = portefeuille(s, u); const due = w.next; const now = s.maintenant;
  if (due != null) {
    if (source === "payment") { if (due > now + 2 * JOUR) return { granted: false, reason: "already_granted" }; }
    else if (due > now) return { granted: false, reason: "already_granted" };
  }
  const nouveau = amount; const delta = nouveau - w.included;
  const next = periodEnd != null && periodEnd > now ? periodEnd : now + 30 * JOUR;
  const ref = "grant_monthly:" + u + ":" + jourIso(due ?? now);
  w.included = nouveau; w.next = next;                       // (prod : le portefeuille bouge AVANT l'insertion)
  if (s.grandLivre.some((l: any) => l.ref === ref)) return { granted: false, reason: "already_granted", ref };
  s.grandLivre.push({ user: u, kind: "grant_monthly", tier, delta, ref });
  return { granted: true, amount: delta };
}
// upgrade_monthly_grant — définition EN PROD du 15/10.
function upgradeMonthly(s: any, u: string, tier: string, periodEnd: number | null, source: string) {
  if (!["free", "premium", "pro", "business"].includes(tier)) return { granted: false, reason: "invalid_tier" };
  const w = portefeuille(s, u); const now = s.maintenant;
  if (w.next == null || w.next <= now || (source === "payment" && w.next <= now + 2 * JOUR)) return grantMonthly(s, u, tier, periodEnd, source);
  const dernier = [...s.grandLivre].reverse().find((l: any) => l.user === u && (l.kind === "grant_monthly" || l.kind === "grant_upgrade"));
  const ancien = dernier?.tier ?? "free";
  const montant = GRANT[tier];
  if (ancien === tier) { if (periodEnd != null && periodEnd > now) w.next = periodEnd; return { granted: false, reason: "no_upgrade_needed", from_tier: ancien, tier }; }
  const cap = montant * 2; const nouveau = Math.max(w.included, Math.min(w.included + montant, cap)); const delta = nouveau - w.included;
  if (delta <= 0) return { granted: false, reason: "cap_reached" };
  const ref = "grant_upgrade:" + u + ":" + jourIso(w.next ?? now) + ":" + tier;
  w.included = nouveau; if (periodEnd != null && periodEnd > now) w.next = periodEnd;
  if (s.grandLivre.some((l: any) => l.ref === ref)) return { granted: false, reason: "already_granted", ref };
  s.grandLivre.push({ user: u, kind: "grant_upgrade", tier, from_tier: ancien, delta, ref });
  return { granted: true, topup: true, amount: delta, from_tier: ancien, tier };
}

class Requete {
  table: string; op = "select"; colonnes = "*"; payload: any; filtres: any[] = []; unique = false; lim: number | null = null;
  constructor(t: string) { this.table = t; }
  select(c = "*") { if (this.op === "select") this.colonnes = c; return this; }
  update(p: unknown) { this.op = "update"; this.payload = copie(p); return this; }
  insert(p: unknown) { this.op = "insert"; this.payload = copie(p); return this; }
  eq(c: string, v: unknown) { this.filtres.push([c, v]); return this; }
  order() { return this; } range() { return this; } like() { return this; } in() { return this; } not() { return this; } is() { return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.unique = true; return this; } single() { this.unique = true; return this; }
  then(ok: any, ko: any) { return this.exec().then(ok, ko); }
  async exec(): Promise<any> {
    const s = e();
    if (this.table !== "profiles") { s.autres.push({ table: this.table, op: this.op }); return { data: this.unique ? null : [], error: null }; }
    const lignes = s.profils.filter((p: any) => this.filtres.every(([c, v]: any) => p[c] === v));
    if (this.op === "update") { for (const p of lignes) Object.assign(p, this.payload); s.majProfils.push({ filtres: copie(this.filtres), payload: this.payload }); return { data: null, error: null }; }
    if (this.op !== "select") return { data: null, error: null };
    const proj = (p: any) => { if (this.colonnes === "*") return { ...p }; const o: any = {}; for (const c of this.colonnes.split(",").map((x) => x.trim())) o[c] = p[c] ?? null; return o; };
    const l = (this.lim != null ? lignes.slice(0, this.lim) : lignes).map(proj);
    return { data: this.unique ? (l[0] ?? null) : l, error: null };
  }
}
class Client {
  from(t: string) { return new Requete(t); }
  async rpc(fn: string, a: any) {
    const s = e(); s.rpcs.push({ fn, args: copie(a) });
    const pe = a?.p_period_end ? Date.parse(a.p_period_end) : null;
    if (fn === "upgrade_monthly_grant") return { data: upgradeMonthly(s, a.p_user_id, a.p_tier, pe, a.p_source ?? "auto"), error: null };
    if (fn === "credit_purchased_coins") return { data: { credited: true }, error: null };
    if (fn === "increment_founder_slots") return { data: null, error: null };
    if (fn === "cloud_essai_noter_carte") return { data: { ok: true }, error: null };
    return { data: null, error: { message: "rpc inconnue du banc : " + fn } };
  }
}
export function createClient(_u: string, _k: string, _o?: unknown) { return new Client(); }
`;

const FAUX_STRIPE = `// Faux SDK Stripe : l'événement est rendu tel quel ; abonnements et factures viennent du scénario.
const e = () => (globalThis as any).__preuveStripe.etat;
const introuvable = (id: string) => Object.assign(new Error("No such object: " + id), { code: "resource_missing" });
export default class Stripe {
  static createFetchHttpClient() { return {}; }
  static createSubtleCryptoProvider() { return {}; }
  webhooks = { constructEventAsync: async (body: string) => JSON.parse(body), constructEvent: (body: string) => JSON.parse(body) };
  subscriptions = {
    retrieve: async (id: string) => { const s = e().stripe.abonnements[id]; if (!s) throw introuvable(id); return JSON.parse(JSON.stringify(s)); },
    list: async (p: any) => ({ data: Object.values(e().stripe.abonnements).filter((s: any) => s.customer === p?.customer) }),
    update: async (id: string, p: any) => { e().stripeEcritures.push({ quoi: "subscriptions.update", id, p }); return e().stripe.abonnements[id]; },
    cancel: async (id: string) => { e().stripeEcritures.push({ quoi: "subscriptions.cancel", id }); return e().stripe.abonnements[id]; },
  };
  invoices = { retrieve: async (id: string) => { const f = e().stripe.factures[id]; if (!f) throw introuvable(id); return JSON.parse(JSON.stringify(f)); } };
  paymentIntents = { retrieve: async (id: string) => { const p = e().stripe.paiements[id]; if (!p) throw introuvable(id); return p; } };
  customers = { retrieve: async (id: string) => ({ id, invoice_settings: {} }) };
  constructor(_cle: string, _o?: unknown) {}
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// LANCEUR
// ─────────────────────────────────────────────────────────────────────────────
async function lanceur() {
  const dossier = await Deno.makeTempDir({ prefix: "preuve-stripe-" });
  const f = { serve: joindre(dossier, "faux-serve.ts"), supabase: joindre(dossier, "faux-supabase.ts"), stripe: joindre(dossier, "faux-stripe.ts"), map: joindre(dossier, "import-map.json") };
  await Deno.writeTextFile(f.serve, FAUX_SERVE);
  await Deno.writeTextFile(f.supabase, FAUX_SUPABASE);
  await Deno.writeTextFile(f.stripe, FAUX_STRIPE);
  await Deno.writeTextFile(f.map, JSON.stringify({ imports: {
    "https://deno.land/std@0.168.0/http/server.ts": urlDepuisChemin(f.serve),
    "https://esm.sh/@supabase/supabase-js@2.117.0": urlDepuisChemin(f.supabase),
    "https://esm.sh/stripe@12.18.0?target=deno&no-check": urlDepuisChemin(f.stripe),
  } }, null, 2));
  const suffixe = crypto.randomUUID().slice(0, 8);
  const head = joindre(RACINE, ...WEBHOOK.split("/").slice(0, -1), `__preuve_head_${suffixe}.ts`);
  let code = 1;
  try {
    const s = await new Deno.Command("git", { args: ["-C", RACINE, "show", `HEAD:${WEBHOOK}`], stdout: "piped", stderr: "piped" }).output();
    if (!s.success) throw new Error(new TextDecoder().decode(s.stderr));
    await Deno.writeFile(head, s.stdout, { createNew: true });
    const env: Record<string, string> = { PREUVE_STRIPE_ENFANT: "1", PREUVE_HEAD: head };
    for (const k of ["PATH", "Path", "SYSTEMROOT", "SystemRoot", "WINDIR", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "HOME", "TEMP", "TMP", "TMPDIR", "DENO_DIR", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "DENO_CERT"]) { const v = Deno.env.get(k); if (v != null) env[k] = v; }
    Object.assign(env, {
      SUPABASE_URL: "https://banc.invalid", SUPABASE_SERVICE_ROLE_KEY: "cle-du-banc", STRIPE_SECRET_KEY: "sk_banc", STRIPE_WEBHOOK_SECRET: "whsec_banc",
      STRIPE_PRICE_STANDARD: "price_std", STRIPE_PRICE_PRO: "price_pro", STRIPE_PRICE_BUSINESS: "price_biz", STRIPE_PRICE_CLOUD: "price_cloud", CRON_SECRET: "cron-du-banc",
    });
    const r = await new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-config", "--no-lock", `--import-map=${f.map}`, `--allow-read=${RACINE},${dossier}`, "--allow-env",
        cheminDepuisUrl(new URL(import.meta.url)), ...Deno.args.filter((a) => a === "--verbeux")],
      cwd: dossier, clearEnv: true, env, stdout: "inherit", stderr: "inherit",
    }).output();
    code = r.code;
  } finally {
    try { Deno.removeSync(head); } catch { /* */ }
    try { Deno.removeSync(dossier, { recursive: true }); } catch { /* */ }
  }
  Deno.exit(code);
}

// ─────────────────────────────────────────────────────────────────────────────
// ENFANT : les scénarios
// ─────────────────────────────────────────────────────────────────────────────
const JOUR = 86400000;
const MAINTENANT = Date.parse("2026-10-14T23:20:30Z");
const S = (t: number) => Math.floor(t / 1000);

function profil(o: Record<string, unknown>) {
  return { id: "u1", email: "client@banc.invalid", stripe_customer_id: null, is_premium: false, is_pro: false, is_business: false, cloud_canal: null, is_cloud: false, ...o };
}
function etatInitial(o: { profils: any[]; portefeuilles?: any; grandLivre?: any[]; abonnements?: any; factures?: any }) {
  return {
    maintenant: MAINTENANT, profils: o.profils, portefeuilles: o.portefeuilles ?? {}, grandLivre: o.grandLivre ?? [],
    stripe: { abonnements: o.abonnements ?? {}, factures: o.factures ?? {}, paiements: {} },
    rpcs: [] as any[], mails: [] as any[], majProfils: [] as any[], stripeEcritures: [] as any[], autres: [] as any[], console: [] as any[],
  };
}
const ev = (type: string, objet: any) => ({ id: `evt_${type}_${Math.random().toString(36).slice(2, 8)}`, type, data: { object: objet } });
const factureCreation = (id: string, sub: string, cus: string, prix: string, montant: number, raison = "subscription_create", metadata: any = {}) => ({
  id, object: "invoice", customer: cus, billing_reason: raison, amount_paid: montant, currency: "eur", metadata, status: "paid",
  parent: { subscription_details: { subscription: sub } },
  lines: { data: [{ amount: montant, pricing: { price_details: { price: prix } }, period: { end: S(MAINTENANT + 31 * JOUR) } }] },
});
const abonnement = (id: string, cus: string, prix: string, plan: string, statut = "active") => ({
  id, object: "subscription", customer: cus, status: statut, metadata: { plan_type: plan, fillsell_user_id: "u1" },
  items: { data: [{ price: { id: prix } }] }, current_period_end: S(MAINTENANT + 31 * JOUR), cancel_at_period_end: false, pending_update: null,
});
const session = (id: string, cus: string, sub: string, plan: string, montant: number, email = "client@banc.invalid") => ({
  id, object: "checkout.session", mode: "subscription", customer: cus, subscription: sub, amount_total: montant, currency: "eur",
  customer_details: { email }, metadata: { plan_type: plan, fillsell_user_id: "u1" },
});

type Scenario = { nom: string; attendu: string; etat: () => any; evenements: () => any[] };
const SCENARIOS: Scenario[] = [
  {
    nom: "client qui REVIENT → Business (DeadRoz) : invoice.paid AVANT checkout",
    attendu: "1 crédit business (3 000), 1 mail",
    etat: () => etatInitial({
      profils: [profil({ stripe_customer_id: "cus_R" })],
      portefeuilles: { u1: { included: 50, purchased: 0, next: Date.parse("2026-11-11T08:15:00Z") } },
      grandLivre: [{ user: "u1", kind: "grant_monthly", tier: "free", delta: -3000, ref: "grant_monthly:u1:2026-10-12" }],
      abonnements: { sub_B: abonnement("sub_B", "cus_R", "price_biz", "business") },
    }),
    evenements: () => [
      ev("invoice.paid", factureCreation("in_B", "sub_B", "cus_R", "price_biz", 5999)),
      ev("customer.subscription.updated", abonnement("sub_B", "cus_R", "price_biz", "business")),
      ev("checkout.session.completed", session("cs_B", "cus_R", "sub_B", "business", 5999)),
    ],
  },
  {
    nom: "client qui revient → Business : checkout AVANT invoice.paid",
    attendu: "1 crédit business, 1 mail",
    etat: () => etatInitial({
      profils: [profil({ stripe_customer_id: "cus_R" })],
      portefeuilles: { u1: { included: 50, purchased: 0, next: Date.parse("2026-11-11T08:15:00Z") } },
      grandLivre: [{ user: "u1", kind: "grant_monthly", tier: "free", delta: -3000, ref: "grant_monthly:u1:2026-10-12" }],
      abonnements: { sub_B: abonnement("sub_B", "cus_R", "price_biz", "business") },
    }),
    evenements: () => [
      ev("checkout.session.completed", session("cs_B", "cus_R", "sub_B", "business", 5999)),
      ev("invoice.paid", factureCreation("in_B", "sub_B", "cus_R", "price_biz", 5999)),
    ],
  },
  {
    nom: "client qui revient → Pro : invoice.paid AVANT checkout",
    attendu: "1 crédit pro (1 200), 1 mail",
    etat: () => etatInitial({
      profils: [profil({ stripe_customer_id: "cus_R" })],
      portefeuilles: { u1: { included: 50, purchased: 0, next: Date.parse("2026-11-11T08:15:00Z") } },
      grandLivre: [{ user: "u1", kind: "grant_monthly", tier: "free", delta: -1150, ref: "grant_monthly:u1:2026-10-12" }],
      abonnements: { sub_P: abonnement("sub_P", "cus_R", "price_pro", "pro") },
    }),
    evenements: () => [
      ev("invoice.paid", factureCreation("in_P", "sub_P", "cus_R", "price_pro", 2999)),
      ev("checkout.session.completed", session("cs_P", "cus_R", "sub_P", "pro", 2999)),
    ],
  },
  {
    nom: "PREMIER abonnement (nouveau client) → Pro",
    attendu: "1 crédit pro, 1 mail",
    etat: () => etatInitial({
      profils: [profil({})],
      abonnements: { sub_N: abonnement("sub_N", "cus_N", "price_pro", "pro") },
    }),
    evenements: () => [
      ev("invoice.paid", factureCreation("in_N", "sub_N", "cus_N", "price_pro", 2999)),
      ev("checkout.session.completed", session("cs_N", "cus_N", "sub_N", "pro", 2999)),
    ],
  },
  {
    nom: "PREMIER abonnement → Premium",
    attendu: "1 crédit premium (400), 1 mail",
    etat: () => etatInitial({ profils: [profil({})], abonnements: { sub_S: abonnement("sub_S", "cus_S", "price_std", "standard") } }),
    evenements: () => [
      ev("checkout.session.completed", session("cs_S", "cus_S", "sub_S", "standard", 1299)),
      ev("invoice.paid", factureCreation("in_S", "sub_S", "cus_S", "price_std", 1299)),
    ],
  },
  {
    nom: "RENOUVELLEMENT Business (échéance demain)",
    attendu: "1 crédit mensuel business, 1 mail — identique à HEAD",
    etat: () => etatInitial({
      profils: [profil({ stripe_customer_id: "cus_A", is_premium: true, is_pro: true, is_business: true })],
      portefeuilles: { u1: { included: 812, purchased: 0, next: MAINTENANT + JOUR } },
      grandLivre: [{ user: "u1", kind: "grant_monthly", tier: "business", delta: 3000, ref: "grant_monthly:u1:2026-09-15" }],
      abonnements: { sub_A: abonnement("sub_A", "cus_A", "price_biz", "business") },
    }),
    evenements: () => [ev("invoice.paid", factureCreation("in_R1", "sub_A", "cus_A", "price_biz", 5999, "subscription_cycle"))],
  },
  {
    nom: "RENOUVELLEMENT Premium + REJEU du même événement",
    attendu: "1 crédit, 1 mail (le rejeu ne crédite ni n'écrit) — identique à HEAD",
    etat: () => etatInitial({
      profils: [profil({ stripe_customer_id: "cus_A", is_premium: true })],
      portefeuilles: { u1: { included: 12, purchased: 0, next: MAINTENANT + JOUR } },
      grandLivre: [{ user: "u1", kind: "grant_monthly", tier: "premium", delta: 400, ref: "grant_monthly:u1:2026-09-15" }],
      abonnements: { sub_A: abonnement("sub_A", "cus_A", "price_std", "standard") },
    }),
    evenements: () => { const x = ev("invoice.paid", factureCreation("in_R2", "sub_A", "cus_A", "price_std", 1299, "subscription_cycle")); return [x, x]; },
  },
  {
    nom: "PASSAGE DE PALIER Pro → Business (facture de différence)",
    attendu: "1 crédit business, 1 mail — identique à HEAD",
    etat: () => etatInitial({
      profils: [profil({ stripe_customer_id: "cus_A", is_premium: true, is_pro: true })],
      portefeuilles: { u1: { included: 900, purchased: 0, next: MAINTENANT + 20 * JOUR } },
      grandLivre: [{ user: "u1", kind: "grant_monthly", tier: "pro", delta: 1200, ref: "grant_monthly:u1:2026-10-04" }],
      abonnements: { sub_A: abonnement("sub_A", "cus_A", "price_biz", "business") },
    }),
    evenements: () => {
      const f = factureCreation("in_U", "sub_A", "cus_A", "price_biz", 2000, "subscription_update", { fillsell_upgrade_vers: "business" });
      f.lines.data = [
        { amount: -1000, pricing: { price_details: { price: "price_pro" } }, period: { end: S(MAINTENANT + 20 * JOUR) } },
        { amount: 3000, pricing: { price_details: { price: "price_biz" } }, period: { end: S(MAINTENANT + 20 * JOUR) } },
      ] as any;
      return [ev("invoice.paid", f)];
    },
  },
  {
    nom: "ÉCHEC de paiement d'un renouvellement (deux événements sur la facture)",
    attendu: "aucun crédit ; signalements identiques à HEAD",
    etat: () => {
      const s = etatInitial({
        profils: [profil({ stripe_customer_id: "cus_A", is_premium: true, is_pro: true })],
        portefeuilles: { u1: { included: 30, purchased: 0, next: MAINTENANT + JOUR } },
        abonnements: { sub_A: abonnement("sub_A", "cus_A", "price_pro", "pro", "past_due") },
        factures: { in_F: { ...factureCreation("in_F", "sub_A", "cus_A", "price_pro", 0, "subscription_cycle"), status: "open", amount_due: 2999, attempt_count: 1, payment_intent: "pi_F" } },
      });
      s.stripe.paiements.pi_F = { id: "pi_F", status: "requires_payment_method", last_payment_error: { code: "card_declined", decline_code: "insufficient_funds", payment_method: { type: "card" } } };
      return s;
    },
    evenements: () => {
      const f = { ...factureCreation("in_F", "sub_A", "cus_A", "price_pro", 0, "subscription_cycle"), status: "open", amount_due: 2999, attempt_count: 1, payment_intent: "pi_F" };
      return [ev("invoice.payment_failed", f), ev("invoice.payment_action_required", f)];
    },
  },
  {
    nom: "adresse de paiement DIFFÉRENTE de celle du compte (nouveau client Pro)",
    attendu: "1 crédit pro, 1 mail (HEAD : rien crédité, aucune alerte)",
    etat: () => etatInitial({ profils: [profil({ email: "compte@banc.invalid" })], abonnements: { sub_X: abonnement("sub_X", "cus_X", "price_pro", "pro") } }),
    evenements: () => [ev("checkout.session.completed", session("cs_X", "cus_X", "sub_X", "pro", 2999, "autre-adresse@banc.invalid"))],
  },
];

async function enfant() {
  const ecrire = console.log.bind(console);
  const verbeux = Deno.args.includes("--verbeux");
  const G = ((globalThis as any).__preuveStripe ??= {});
  G.handlers ??= [];
  for (const niveau of ["log", "info", "warn", "error"] as const) {
    const orig = (console as any)[niveau].bind(console);
    (console as any)[niveau] = (...a: unknown[]) => {
      const t = a.map((x) => (typeof x === "string" ? x : Deno.inspect(x))).join(" ");
      G.etat?.console.push({ niveau, t });
      if (verbeux) orig(`    [${niveau}] ${t.slice(0, 240)}`);
    };
  }
  globalThis.fetch = (async (entree: any, init?: any) => {
    const url = String(entree?.url ?? entree);
    if (url.includes("/functions/v1/email-tunnel")) {
      const corps = JSON.parse(String(init?.body ?? "{}"));
      G.etat?.mails.push(corps.payment_alert ? { quoi: corps.payment_alert.ok === false ? "alerte_non_credite" : "paiement_recu", tier: corps.payment_alert.produit, montant: corps.payment_alert.montant } : { quoi: Object.keys(corps)[0] ?? "?" });
      return new Response("{}", { status: 200 });
    }
    throw new Error("réseau interdit dans le banc : " + url);
  }) as typeof fetch;

  const charger = async (chemin: string) => {
    const avant = G.handlers.length;
    await import(urlDepuisChemin(chemin) + `?v=${crypto.randomUUID()}`);
    if (G.handlers.length !== avant + 1) throw new Error("le webhook n'a pas appelé serve() : " + chemin);
    return G.handlers[G.handlers.length - 1];
  };
  const neuf = await charger(joindre(RACINE, ...WEBHOOK.split("/")));
  const ancien = await charger(Deno.env.get("PREUVE_HEAD")!);

  const jouer = async (h: any, sc: Scenario) => {
    G.etat = sc.etat();
    const codes: number[] = [];
    for (const x of sc.evenements()) {
      const r = await h(new Request("https://banc.invalid/stripe-webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=banc" }, body: JSON.stringify(x) }));
      codes.push(r.status);
    }
    const s = G.etat; G.etat = null;
    const credits = s.grandLivre.filter((l: any) => !l.ref.endsWith("2026-10-12") && !l.ref.endsWith("2026-09-15") && !l.ref.endsWith("2026-10-04"));
    return {
      credits: credits.map((l: any) => `${l.kind}:${l.tier}${l.delta >= 0 ? "+" : ""}${l.delta}`),
      mails: s.mails.map((m: any) => m.quoi + (m.tier ? `(${m.tier}${m.montant ? " " + m.montant : ""})` : "")),
      codes, solde: s.portefeuilles.u1?.included ?? null,
    };
  };

  let rouges = 0;
  ecrire("PREUVE — un paiement Stripe = une écriture et une notification (événements SIMULÉS, aucun réseau)\n");
  for (const sc of SCENARIOS) {
    const n = await jouer(neuf, sc);
    const a = await jouer(ancien, sc);
    const nbPaye = n.mails.filter((m: string) => m.startsWith("paiement_recu")).length;
    const unSeul = n.credits.length <= 1 && nbPaye === n.credits.length && n.codes.every((c: number) => c === 200);
    const pareil = JSON.stringify(n) === JSON.stringify(a);
    ecrire(`${unSeul ? "✓" : "✗"} ${sc.nom}`);
    ecrire(`    attendu : ${sc.attendu}`);
    ecrire(`    NEUF    : crédits [${n.credits.join(", ") || "aucun"}] · mails [${n.mails.join(", ") || "aucun"}] · solde ${n.solde} · HTTP ${n.codes.join("/")}`);
    ecrire(`    HEAD    : crédits [${a.credits.join(", ") || "aucun"}] · mails [${a.mails.join(", ") || "aucun"}] · solde ${a.solde} · HTTP ${a.codes.join("/")}${pareil ? "   (identique)" : "   (DIFFÉRENT)"}`);
    if (!unSeul) rouges++;
  }
  ecrire(`\n${rouges ? "✗" : "✓"} ${SCENARIOS.length - rouges}/${SCENARIOS.length} scénarios : au plus une écriture et une notification par paiement`);
  Deno.exit(rouges ? 1 : 0);
}

if (ENFANT) await enfant(); else await lanceur();
