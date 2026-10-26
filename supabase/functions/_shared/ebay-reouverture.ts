// ═══════════════════════════════════════════════════════════════════════════
// UN CHANGEMENT DE COMPTE eBAY ROUVRE, UNE FOIS, CE QUE L'ANCIEN COMPTE A FERMÉ (26/10/2026 nuit, point 7)
// ═══════════════════════════════════════════════════════════════════════════
// Cas : Elodie82 (echaouat, Premium), 25/10. Cinq publications eBay closes « ton compte eBay est sur eBay
// États-Unis » (@echa_5, lu quatre fois US : la détection était juste) ; à 18:23 elle a relié @aelevy.-86, inscrit
// sur eBay France. Rien ne rouvrait les cinq : le ré-armement eBay (ebay-voie.ts) ne lit que les PAUSES, et une
// clôture « hors France » est définitive par construction. La règle (pure, _shared/ebay-hors-france.js,
// reouvertureEbayHorsFrance) dit QUAND une clôture se rouvre ; ce module lit et écrit :
//   · appelé par ebay-oauth-callback juste après l'écriture du compte (site lu à l'instant) ;
//   · et par handler-watch, en filet borné, pour un compte dont le site France a été lu APRÈS la clôture.
// La publication rouverte repart « compte à finir » (needs_user, la phrase de ebay-voie.ts) ; le ré-armement
// existant la publie dès que le compte est prêt (tout de suite s'il l'est déjà). hors_quota est gardé : elle n'a
// jamais été comptée. Les déclencheurs refus_relance_article_vendu / refus_relance_jumelle_en_ligne restent la
// dernière garde contre un doublon (une écriture refusée laisse la clôture telle quelle).
// Best-effort intégral : jamais une exception qui remonte.
// deno-lint-ignore-file no-explicit-any
import { reouvertureEbayHorsFrance, ecritureReouvertureEbayHorsFrance, SITE_EBAY_FRANCE, REOUVERTURE_EBAY_JOURS } from "./ebay-hors-france.js";
import { etatCompteEbayApi, messageEbayCompteAFinir, rearmerJobsEbayConnexionSiUtilisable } from "./ebay-voie.ts";
import { archiverErreur } from "./erreurs-archivees.js";

const VIVANTS = ["pending", "processing", "needs_user"];

/** Rouvre les publications eBay closes « hors France » d'un compte maintenant relié à eBay France. Rend le nombre rouvert. */
export async function rouvrirPublicationsEbayHorsFrance(admin: any, userId: string, { par = "serveur" }: { par?: string } = {}): Promise<number> {
  try {
    const { data: compte } = await admin.from("ebay_accounts")
      .select("ebay_user_id, ebay_site, ebay_site_lu_le, revoked_at").eq("user_id", userId).maybeSingle();
    if (!compte || compte.revoked_at != null || String(compte.ebay_site ?? "") !== SITE_EBAY_FRANCE) return 0;
    const depuis = new Date(Date.now() - REOUVERTURE_EBAY_JOURS * 86_400_000).toISOString();
    const { data: closes } = await admin.from("cross_post_jobs")
      .select("id, user_id, inventaire_id, action, status, error, published_at, platform_listing_id, listing_url, platform_fields")
      .eq("user_id", userId).eq("platform", "ebay").eq("action", "publish").eq("status", "cancelled")
      .not("platform_fields->ebay_hors_france", "is", null)
      .filter("platform_fields->ebay_hors_france_rouverte", "is", "null")
      .gte("created_at", depuis).limit(50);
    const candidats = (closes ?? []) as any[];
    if (!candidats.length) return 0;
    const invIds = [...new Set(candidats.map((j) => j.inventaire_id).filter((x) => x != null))];
    const [{ data: fiches }, { data: autres }] = await Promise.all([
      invIds.length ? admin.from("inventaire").select("id, statut, quantite, fusionne_dans").in("id", invIds) : Promise.resolve({ data: [] }),
      invIds.length
        ? admin.from("cross_post_jobs").select("id, inventaire_id, status, action, platform_listing_id")
          .eq("user_id", userId).eq("platform", "ebay").in("inventaire_id", invIds)
          .in("status", [...VIVANTS, "published"]).limit(400)
        : Promise.resolve({ data: [] }),
    ]);
    const ficheDe = new Map(((fiches ?? []) as any[]).map((f) => [String(f.id), f]));
    const autresDe = new Map<string, any[]>();
    for (const a of (autres ?? []) as any[]) {
      const k = String(a.inventaire_id); const l = autresDe.get(k) ?? []; l.push(a); autresDe.set(k, l);
    }
    const etat = await etatCompteEbayApi(admin, userId);
    const message = messageEbayCompteAFinir(etat.aFinir);
    let n = 0;
    const dejaRouverte = new Set<string>(); // une fiche, une seule publication rouverte
    for (const j of candidats) {
      const k = String(j.inventaire_id);
      const lies = (autresDe.get(k) ?? []).filter((a) => String(a.id) !== String(j.id));
      const d = reouvertureEbayHorsFrance(j, {
        siteActuel: compte.ebay_site, siteLuLe: compte.ebay_site_lu_le, fiche: ficheDe.get(k) ?? null,
        autresEbayVivants: lies.filter((a) => VIVANTS.includes(String(a.status))).length + (dejaRouverte.has(k) ? 1 : 0),
        annonceEbayLiee: lies.some((a) => String(a.status) === "published" && String(a.platform_listing_id ?? "").trim() !== ""),
      });
      if (!d.rouvrir) continue;
      const w = ecritureReouvertureEbayHorsFrance(j, {
        site: compte.ebay_site, compte: compte.ebay_user_id ?? null, message, par, archiver: archiverErreur,
      });
      const { data: maj, error } = await admin.from("cross_post_jobs")
        .update({ status: w.status, error: w.error, platform_fields: w.platform_fields })
        .eq("id", j.id).eq("status", "cancelled").select("id");
      if (error) { console.warn(`[ebay-reouverture] ${String(j.id).slice(0, 8)} non rouverte : ${error.message}`); continue; }
      if (maj?.length) { n++; dejaRouverte.add(k); }
    }
    if (n) {
      console.log(`[ebay-reouverture] ${n} publication(s) eBay rouverte(s) pour ${userId.slice(0, 8)} (compte @${compte.ebay_user_id ?? "?"} sur eBay France, ${par})`);
      await rearmerJobsEbayConnexionSiUtilisable(admin, userId);
    }
    return n;
  } catch (e) {
    console.warn("[ebay-reouverture] réouverture non aboutie :", (e as Error)?.message ?? e);
    return 0;
  }
}
