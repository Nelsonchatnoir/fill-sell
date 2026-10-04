import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { lireCompteursCpu, pctEntre, decider, SEUIL_PCT, FENETRE_MIN } from "../_shared/veille-cpu.js";

// ═══════════════════════════════════════════════════════════════════════════
// veille-cpu — LE CPU DE LA BASE, TOUTES LES 2 MINUTES (04/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Incident du 04/10 : base à 99 % de CPU, app et web bloqués sur le chargement
// pour tout le monde — appris par les utilisateurs. Cette veille lit les
// métriques de l'instance (API Prometheus du projet, clé de service), garde un
// échantillon par passage (veille_cpu, 3 jours) et prévient Nico par mail
// (support@fillsell.app, l'adresse de l'ops-digest) quand le CPU dépasse 70 %
// pendant 10 minutes — une fois par heure au plus — puis quand il redescend.
// Les règles : _shared/veille-cpu.js (testées, scripts/veille-cpu-selftest.mjs).
// Coût mesuré : une lecture HTTP + deux petites écritures par passage.
// Appelée par pg_cron (x-cron-secret) ; verify_jwt = false.

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const FROM = "FillSell <support@fillsell.app>";
const TO = "support@fillsell.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  const attendu = Deno.env.get("CRON_SECRET");
  if (!attendu || req.headers.get("x-cron-secret") !== attendu) return json({ error: "Non autorisé" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, cle);
  const maintenant = new Date();

  // 1. Les compteurs de l'instance.
  let compteurs: { total: number; inactif: number } | null = null;
  let connexions: number | null = null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10_000);
    const r = await fetch(`${url}/customer/v1/privileged/metrics`, {
      headers: { Authorization: `Basic ${btoa(`service_role:${cle}`)}` }, signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return json({ ok: false, metriques: `HTTP ${r.status}` });
    const texte = await r.text();
    compteurs = lireCompteursCpu(texte);
    const m = texte.match(/^pg_stat_database_num_backends\{[^}]*\}\s+([0-9.eE+]+)/m);
    connexions = m ? Math.round(Number(m[1])) : null;
  } catch (e) {
    return json({ ok: false, metriques: String((e as Error)?.message ?? e).slice(0, 120) });
  }
  if (!compteurs) return json({ ok: false, metriques: "compteurs CPU absents" });

  // 2. Le pourcentage depuis l'échantillon précédent (moins de 15 min).
  const { data: prec } = await admin.from("veille_cpu").select("le, total, inactif")
    .gte("le", new Date(maintenant.getTime() - 15 * 60_000).toISOString())
    .order("le", { ascending: false }).limit(1);
  const pct = pctEntre(prec?.[0] ?? null, compteurs);
  await admin.from("veille_cpu").insert({ le: maintenant.toISOString(), total: compteurs.total, inactif: compteurs.inactif, pct, connexions });
  // Trois jours d'historique suffisent (l'ops-digest lit les dernières 24 h).
  await admin.from("veille_cpu").delete().lt("le", new Date(maintenant.getTime() - 3 * 86400_000).toISOString());

  // 3. Prévenir ?
  const { data: recents } = await admin.from("veille_cpu").select("le, pct")
    .gte("le", new Date(maintenant.getTime() - (FENETRE_MIN + 1) * 60_000).toISOString())
    .order("le", { ascending: false }).limit(20);
  const { data: alertes } = await admin.from("veille_cpu_alertes").select("le, nature")
    .order("le", { ascending: false }).limit(10);
  const derniereAlerte = (alertes ?? []).find((a: { nature: string }) => a.nature === "alerte")?.le ?? null;
  const dernierRetabli = (alertes ?? []).find((a: { nature: string }) => a.nature === "retabli")?.le ?? null;
  const d = decider({ echantillons: recents ?? [], derniereAlerte, dernierRetabli, maintenant: maintenant.getTime() });

  let envoi: unknown = null;
  if (d.action) {
    const heure = maintenant.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
    const lignes = (recents ?? []).map((e: { le: string; pct: number | null }) =>
      `<li>${new Date(e.le).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })} — ${e.pct ?? "?"} %</li>`).join("");
    const sujet = d.action === "alerte"
      ? `🔴 Base FillSell : CPU au-dessus de ${SEUIL_PCT} % depuis ${FENETRE_MIN} min (${d.pctMin}–${d.pctMax} %)`
      : `✅ Base FillSell : CPU redescendu (${d.pctMax} % au plus sur ${FENETRE_MIN} min)`;
    const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.5">
<p><b>${sujet}</b> — ${heure} (Paris), ${connexions ?? "?"} connexions.</p>
${d.action === "alerte" ? `<p>Le 04/10, la même situation a bloqué l'app et le web sur l'écran de chargement pour tout le monde.
Premiers gestes : Dashboard Supabase → Reports (CPU, E/S disque) ; <code>pg_stat_statements</code> (requêtes les plus coûteuses) ;
mettre en pause les crons les plus lourds (<code>cron.alter_job(&lt;id&gt;, active := false)</code>).</p>` : ""}
<ul>${lignes}</ul>
<p style="color:#888">veille-cpu — une alerte par heure au plus.</p></div>`;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: FROM, to: [TO], subject: sujet, html }),
      }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) } as unknown as Response));
      envoi = { http: r.status, ok: r.ok };
      // Noté même si l'envoi échoue : jamais une rafale de tentatives toutes
      // les 2 min ; le prochain essai attend l'heure suivante.
      await admin.from("veille_cpu_alertes").insert({ le: maintenant.toISOString(), nature: d.action, pct_min: d.pctMin, pct_max: d.pctMax, envoi });
    } else {
      envoi = { erreur: "RESEND_API_KEY absente" };
    }
  }
  return json({ ok: true, pct, connexions, decision: d, envoi });
});
