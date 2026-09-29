// `npm run selftest:vinted-antirobot`
import {
  MOTIF_ANTIROBOT_VINTED_403,
  episodeAntirobotVinted403,
  observation403Vinted,
  preuveSonde403Vinted,
} from "../supabase/functions/_shared/vinted-antirobot.ts";

let erreurs = 0;
const verifier = (nom: string, condition: boolean) => {
  console.log(`  ${condition ? "✓" : "✗"} ${nom}`);
  if (!condition) erreurs++;
};
const maintenant = Date.parse("2026-09-29T10:00:00.000Z");
const session = (http: number, at: string, etat: boolean | null = null) => ({
  vinted: etat,
  http: { vinted: http },
  checked_at_par_plateforme: { vinted: at },
});

console.log("\n1. La sonde ne prouve l'anti-robot que par un 403 frais et daté");
verifier("403 frais", preuveSonde403Vinted(session(403, "2026-09-29T09:50:00.000Z"), maintenant)?.source === "courante");
verifier("401 reste le mur de session", preuveSonde403Vinted(session(401, "2026-09-29T09:50:00.000Z", false), maintenant) === null);
verifier("200 vivant lève le 403 précédent", preuveSonde403Vinted({
  ...session(200, "2026-09-29T09:55:00.000Z", true),
  previous: session(403, "2026-09-29T09:50:00.000Z"),
}, maintenant) === null);
verifier("403 vieux de plus de 20 min expiré", preuveSonde403Vinted(session(403, "2026-09-29T09:39:59.000Z"), maintenant) === null);
verifier("preuve sans date refusée", preuveSonde403Vinted({ vinted: null, http: { vinted: 403 } }, maintenant) === null);
verifier("date future refusée", preuveSonde403Vinted(session(403, "2026-09-29T10:02:00.000Z"), maintenant) === null);
verifier("403 précédent accepté seulement sans observation courante plus récente", preuveSonde403Vinted({
  vinted: null, http: { vinted: null },
  previous: session(403, "2026-09-29T09:50:00.000Z"),
}, maintenant)?.source === "precedente");

console.log("\n2. Un job doit porter HTTP 403, pas seulement le mot anti-robot");
const job = (v: unknown) => ({ platform_fields: v });
verifier("capture structurée 403", observation403Vinted(job({ capture_echec: {
  http: 403, at: "2026-09-29T09:45:00.000Z", motif: "refus",
} }), maintenant)?.source === "capture_echec");
verifier("ancien relevé exact HTTP 403", observation403Vinted(job({ capture_echec: {
  at: "2026-09-29T09:45:00.000Z", motif: "protection anti-robot (HTTP 403)",
} }), maintenant) != null);
verifier("texte anti-robot sans HTTP refusé", observation403Vinted(job({ capture_echec: {
  at: "2026-09-29T09:45:00.000Z", motif: "protection anti-robot",
} }), maintenant) === null);
verifier("HTTP 401 structuré prime sur un ancien texte 403", observation403Vinted(job({ capture_echec: {
  http: 401, at: "2026-09-29T09:45:00.000Z", motif: "HTTP 403",
} }), maintenant) === null);
verifier("observation vieille de 6 h expirée", observation403Vinted(job({ blocage_antirobot: {
  http: 403, derniere: "2026-09-29T03:59:59.000Z",
} }), maintenant) === null);

console.log("\n3. Seul le motif canonique maintient un épisode déjà ouvert");
verifier("marqueur canonique", episodeAntirobotVinted403(job({ attente_antirobot_compte: {
  motif: MOTIF_ANTIROBOT_VINTED_403, http: 403, preuve_403_le: "2026-09-29T09:50:00.000Z",
} })));
verifier("ancien marqueur large insuffisant", !episodeAntirobotVinted403(job({ attente_antirobot_compte: {
  http: 403, pose_le: "2026-09-25T06:46:00.000Z",
} })));

if (erreurs) {
  console.error(`\n❌ anti-robot Vinted : ${erreurs} défaut(s)`);
  Deno.exit(1);
}
console.log("\n✅ anti-robot Vinted : 403 exact, daté et périssable");
