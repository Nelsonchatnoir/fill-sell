// ═══════════════════════════════════════════════════════════════════════════
// PAIEMENT DU MÊME PALIER = CYCLE NEUF ; REMONTÉES PREMIUM / PRO = FAITES OU EN COURS (03/11)
//     npm run selftest:cycle-et-remontees
// ═══════════════════════════════════════════════════════════════════════════
// nadegemarcelin78 (Premium, Stripe) bloquée à 1 500 remontées le 29/10 : son paiement du 16/10, reçu 4 jours avant
// l'échéance interne, avait reporté l'échéance au 16/11 sans remettre le cycle à zéro (cycle de 48 jours). Et le
// compteur Premium / Pro comptait les remontées annulées sans jamais avoir été publiées (alizeed48 : 974 pour 301).
// Sans réseau ni base, sur les fichiers des deux migrations ; la preuve sur base jetable est
// scripts/quotas/preuve-cycle-remontees.mjs (PREUVE_PG=embarque).
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };
const fonction = (sql, nom) => {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  return i < 0 ? "" : sql.slice(i, sql.indexOf("$function$;", i));
};

console.log("1. Un paiement du même palier ouvre un cycle neuf (20261103233000)");
const m1 = lire("supabase/migrations/20261103233000_paiement_meme_palier_cycle_neuf.sql");
const up = fonction(m1, "upgrade_monthly_grant");
const iNeuf = up.indexOf("if v_old_tier is not distinct from p_tier and p_source = 'payment'");
ok(iNeuf > 0, "la branche existe : même palier ET paiement");
ok(/and p_period_end > v_wallet\.next_grant_at \+ interval '2 days' then/.test(up), "… seulement si la fin de période prolonge l'échéance de plus de 2 jours (proration, rejeu : rien)");
ok(/update coin_wallets set next_grant_at = now\(\) where user_id = p_user_id;\n\s+v_res := grant_monthly_coins\(p_user_id, p_tier, p_period_end, p_source\);/.test(up), "… le grant passe par grant_monthly_coins (une seule façon de créditer)");
ok(/update coin_wallets set next_grant_at = p_period_end, updated_at = now\(\) where user_id = p_user_id;\n\s+return v_res \|\| jsonb_build_object\('cycle_neuf', false\);/.test(up), "… rien d'écrit : l'échéance comme avant le correctif");
ok(iNeuf < up.indexOf("-- Montant fixé à la main"), "… avant le montant fixé à la main (un paiement ouvre son cycle quel que soit le montant)");
ok(up.indexOf("v_old_tier := coalesce(v_old_tier, 'free');") < iNeuf, "… le palier du cycle est lu avant");
ok(/'reason', 'no_upgrade_needed'/.test(up) && /'grant_upgrade', v_ref,/.test(up), "le même palier sans nouvelle période et la montée de palier : inchangés");
const rattrapage = m1.slice(m1.indexOf("WITH cible AS ("));
ok(/AND COALESCE\(p\.is_comped, false\) = false/.test(rattrapage) && /p\.stripe_customer_id IS NOT NULL OR p\.apple_original_transaction_id IS NOT NULL\n\s+OR p\.google_purchase_token IS NOT NULL/.test(rattrapage) && /palier_de\(w\.user_id\) <> 'free'/.test(rattrapage), "recalcul : comptes payants seulement (canal de paiement, non offerts, palier payant)");
ok(/WHERE c\.paye_le > c\.cycle_avant \+ interval '2 days'\n\s+AND c\.paye_le <= now\(\)/.test(rattrapage), "… dont la période payée a commencé après le dernier grant");
ok(/SELECT c\.user_id, 0, c\.included_balance, c\.purchased_balance, 'grant_monthly',/.test(rattrapage) && !/UPDATE public\.coin_wallets/.test(rattrapage), "… une ligne datée du paiement, delta 0, aucun solde touché");
ok(/ON CONFLICT \(ref\) WHERE ref IS NOT NULL DO NOTHING;/.test(rattrapage), "… rejouée : rien de plus");
ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(rattrapage) && !/@/.test(rattrapage), "… par la règle : aucun compte nommé dans le SQL (ni identifiant ni adresse)");

console.log("2. Remontées Premium / Pro : faites ou en cours (20261103234000)");
const m2 = lire("supabase/migrations/20261103234000_remontees_faites_ou_en_cours.sql");
const h = m2.slice(m2.indexOf("CREATE OR REPLACE FUNCTION public.remontees_du_cycle("), m2.indexOf("$function$;", m2.indexOf("remontees_du_cycle(")));
ok(/j\.created_at >= p_depuis/.test(h), "créées dans le cycle (sous-ensemble de l'ancien compte : aucun compteur ne monte)");
ok(/\(j\.published_at IS NOT NULL OR j\.status IN \('published', 'sold', 'pending', 'processing', 'needs_user'\)\)/.test(h), "faites (même remplacées depuis) ou en cours ; jamais une annulée ou une échouée sans publication");
ok(/\?\| ARRAY\['opla_sortie', 'hors_quota'\]/.test(h) && /\(sync-dressing\|releve-annonces\)/.test(h), "jamais hors_quota, sortie d'Opla, synchro");
ok(!/SECURITY DEFINER/.test(h) && /REVOKE ALL ON FUNCTION public\.remontees_du_cycle\(uuid, timestamptz\) FROM PUBLIC, anon, authenticated;/.test(m2), "fermée aux clients");
const appels = { quotas_etat: "v_crep := remontees_du_cycle(v_user, v_cycle);", spend_coins_and_republish: "v_faits := remontees_du_cycle(v_user, v_cycle);",
  remise_en_vente_place: "SELECT remontees_du_cycle(p_user, v_depuis)", republish_planifiee_etat: "v_faits_mois := remontees_du_cycle(v_user, v_cycle);" };
for (const [nom, appel] of Object.entries(appels)) {
  const f = fonction(m2, nom);
  ok(f.split(appel).length - 1 === 1, `${nom} : lit remontees_du_cycle`);
  ok(!/action = 'republish' AND (c\.|j\.)?created_at >= v_(cycle|depuis)/.test(f), `${nom} : plus aucun compte brut des remontées du cycle`);
}
ok(!/FUNCTION public\.quota_republication_free_etat/.test(m2), "Free : sa fonction n'est pas touchée");
for (const [nom, sql] of [["20261103233000", m1], ["20261103234000", m2]]) {
  ok(!/(update|insert into|delete from)\s+(public\.)?coin_config/i.test(sql), `${nom} : aucune clé de coin_config écrite`);
  ok(!/republish_plafond|plafond_jour'\s*,\s*\d/.test(sql.replace(/v_regl ->> 'plafond_jour'/g, "")), `${nom} : aucun plafond par jour réintroduit`);
}
ok(existsSync(path.join(RACINE, "scripts/quotas/preuve-cycle-remontees.mjs")) && /20261103233000/.test(lire("scripts/quotas/preuve-cycle-remontees.mjs")) && /20261103234000/.test(lire("scripts/quotas/preuve-cycle-remontees.mjs")), "la preuve sur base jetable joue les deux migrations");

console.log(`\n${rouges === 0 ? "✓" : "✗"} cycle-et-remontees : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
