// Selftest du récapitulatif des ventes (_shared/ventes-a-annoncer.ts, 25/09).
// deno run --allow-read scripts/ventes-a-annoncer-selftest.ts
//
// Faux client Supabase EN MÉMOIRE : il ne connaît que les appels que le
// récapitulatif fait réellement (select/eq/gte/in/or/order/range, count head,
// insert). Chaque cas rejoue une situation mesurée en prod le 25/09.
import { annoncerVentes, TYPE_VENTES } from "../supabase/functions/_shared/ventes-a-annoncer.ts";

type Ligne = Record<string, any>;
function fauxClient(tables: Record<string, Ligne[]>) {
  const from = (table: string) => {
    const filtres: Array<(l: Ligne) => boolean> = [];
    let compte = false;
    let debut = 0, fin = Infinity;
    const q: any = {
      select(_c: string, o?: { count?: string; head?: boolean }) { compte = !!o?.head; return q; },
      eq(c: string, v: unknown) { filtres.push((l) => l[c] === v); return q; },
      neq(c: string, v: unknown) { filtres.push((l) => l[c] !== v); return q; },
      gte(c: string, v: string) { filtres.push((l) => String(l[c]) >= v); return q; },
      in(c: string, v: unknown[]) { filtres.push((l) => v.includes(l[c])); return q; },
      or(expr: string) {
        // Seule forme utilisée : email.is.null,email.neq."adresse"
        const m = expr.match(/^email\.is\.null,email\.neq\."(.*)"$/);
        if (!m) throw new Error(`or() non géré: ${expr}`);
        filtres.push((l) => l.email == null || l.email !== m[1]);
        return q;
      },
      order() { return q; },
      range(a: number, b: number) { debut = a; fin = b; return q; },
      insert(l: Ligne) { tables[table].push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...l }); return Promise.resolve({ error: null }); },
      then(ok: (r: unknown) => void) {
        const rows = (tables[table] ?? []).filter((l) => filtres.every((f) => f(l)));
        ok(compte ? { count: rows.length, error: null } : { data: rows.slice(debut, fin + 1), error: null });
      },
    };
    return q;
  };
  return { from } as any;
}

const T = Date.parse("2026-09-25T12:00:00Z");
const iso = (minAvant: number) => new Date(T - minAvant * 60_000).toISOString();
let echecs = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) echecs++; };

function scenario() {
  const note = (user: string, min: number, titre: string, benefice: number | null = null) => ({
    id: crypto.randomUUID(), user_id: user, feature: "vente_a_annoncer", created_at: iso(min),
    metadata: { job_id: crypto.randomUUID(), plateforme: "vinted", titre, prix_vente: 6, benefice, retraits_a_cliquer: 0, retrait_beebs_auto: 0 },
  });
  return {
    usage_logs: [
      // Petites Fioles : 14 ventes confirmées en 2 minutes, il y a 25 min.
      ...Array.from({ length: 14 }, (_, i) => note("fioles", 27 - i * 0.15, `Chaussettes ${i + 1}`)),
      // Rafale en cours : dernière vente il y a 3 min.
      note("rafale", 3, "Robe"),
      // Déjà un ancien « Vendu ! » (relance_manuelle, SANS user_id) il y a 5 h.
      note("ancien", 60, "Sac"),
      // Deux mails reçus aujourd'hui (welcome + extension_link).
      note("plafond", 60, "Jean"),
      // Une note déjà annoncée hier.
      note("annonce", 60, "Pull"),
    ],
    email_logs: [
      { id: 1, user_id: null, email: "ancien@x.fr", email_type: "relance_manuelle", sent_at: iso(300) },
      { id: 2, user_id: "plafond", email: "plafond@x.fr", email_type: "welcome", sent_at: iso(400) },
      { id: 3, user_id: "plafond", email: null, email_type: "extension_link", sent_at: iso(500) },
      // Trace de désinscription : ce n'est pas un mail, elle ne compte pas.
      { id: 5, user_id: "fioles", email: "fioles@x.fr", email_type: "marketing_optout", sent_at: iso(90) },
      { id: 6, user_id: "fioles", email: "fioles@x.fr", email_type: "welcome", sent_at: iso(95) },
      { id: 4, user_id: "fioles", email: "fioles@x.fr", email_type: "welcome", sent_at: iso(60 * 30) }, // > 24 h
    ],
    profiles: ["fioles", "rafale", "ancien", "plafond", "annonce"].map((u) => ({ id: u, email: `${u}@x.fr`, lang: "fr" })),
  };
}

// Cas 1 — le vrai passage horaire
{
  const tables = scenario();
  const dejaNote = tables.usage_logs.find((n) => n.user_id === "annonce")!;
  tables.usage_logs.push({ id: "a1", user_id: "annonce", feature: "ventes_annoncees", created_at: iso(600), metadata: { notes: [dejaNote.id] } });
  const envois: any[] = [];
  const envoyer = async (o: any) => { envois.push(o); tables.email_logs.push({ id: 99, user_id: o.userId, email: o.to, email_type: o.type, sent_at: new Date(T).toISOString() }); return { envoye: true, to: o.to, type: o.type, categorie: "support" } as any; };
  const r = await annoncerVentes(fauxClient(tables), envoyer, { dryRun: false, maintenant: T });
  ok(envois.length === 1, `un seul mail part (reçu ${envois.length})`);
  ok(envois[0]?.to === "fioles@x.fr" && envois[0]?.type === TYPE_VENTES, "il part chez les Petites Fioles, type ventes_du_jour");
  ok(envois[0]?.subject === "14 articles vendus 🎉", `les 14 ventes dans UN mail (sujet « ${envois[0]?.subject} »)`);
  ok((envois[0]?.html.match(/Chaussettes \d+/g) ?? []).length === 14, "les 14 articles sont listés");
  ok(envois[0]?.categorie === "support" && envois[0]?.userId === "fioles", "catégorie support, user_id passé");
  const motif = (u: string) => r.attendent.find((a) => a.user_id === u)?.motif;
  ok(motif("rafale") === "rafale_en_cours", "une rafale en cours attend qu'elle finisse");
  ok(motif("ancien") === "deja_annonce_24h", "un ancien « Vendu ! » SANS user_id compte dans le un-par-jour");
  ok(motif("plafond") === "plafond_24h", "2 mails reçus en 24 h (dont une ligne sans adresse) → plafond");
  ok(!r.envoyes.some((e) => e.user_id === "annonce") && !r.attendent.some((a) => a.user_id === "annonce"), "une note déjà annoncée ne repart jamais");
  const journal = tables.usage_logs.filter((l) => l.feature === "ventes_annoncees" && l.user_id === "fioles");
  ok(journal.length === 1 && journal[0].metadata.notes.length === 14, "l'annonce est journalisée avec ses 14 notes");

  // Cas 2 — l'heure suivante : rien ne repart chez les Fioles
  const avant = envois.length;
  await annoncerVentes(fauxClient(tables), envoyer, { dryRun: false, maintenant: T + 3_600_000 });
  ok(envois.filter((e) => e.to === "fioles@x.fr").length === 1, "l'heure suivante, rien ne repart chez les Fioles");
  ok(envois.length - avant === 1 && envois[envois.length - 1].to === "rafale@x.fr", "la rafale finie part à son tour, seule");

  // Cas 3 — une nouvelle vente des Fioles dans les 24 h attend le lendemain
  tables.usage_logs.push({ id: "n2", user_id: "fioles", feature: "vente_a_annoncer", created_at: new Date(T + 2 * 3_600_000).toISOString(), metadata: { plateforme: "beebs", titre: "Bonnet", prix_vente: 5, benefice: 2 } });
  const r3 = await annoncerVentes(fauxClient(tables), envoyer, { dryRun: false, maintenant: T + 3 * 3_600_000 });
  ok(r3.attendent.find((a) => a.user_id === "fioles")?.motif === "deja_annonce_24h", "une 2e vente le même jour attend le récapitulatif suivant");
}

// Cas 4 — dry run : rien ne part, rien n'est journalisé
{
  const tables = scenario();
  let n = 0;
  await annoncerVentes(fauxClient(tables), async () => { n++; return { envoye: true } as any; }, { dryRun: true, maintenant: T });
  ok(n === 0 && !tables.usage_logs.some((l) => l.feature === "ventes_annoncees"), "dry run : aucun envoi, aucune journalisation");
}

// Cas 5 — Resend refuse : la vente reste à annoncer
{
  const tables = scenario();
  const r = await annoncerVentes(fauxClient(tables), async () => ({ envoye: false, motif: "resend_echec" }) as any, { dryRun: false, maintenant: T });
  ok(r.echecs.some((e) => e.user_id === "fioles") && !tables.usage_logs.some((l) => l.feature === "ventes_annoncees"), "envoi refusé → rien de journalisé, la vente repartira");
}

if (echecs) { console.error(`\n${echecs} échec(s)`); Deno.exit(1); }
console.log("\nTout est vert.");
