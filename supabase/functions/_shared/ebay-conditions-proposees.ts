// ═══════════════════════════════════════════════════════════════════════════
// « CRÉER MES CONDITIONS eBAY » : LES RÉGLAGES DU VENDEUR, LUS SUR SES ANNONCES (04/11, point 4 — décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// benjamin.ployer (Pro) vend sur eBay (277 annonces en ligne) mais son compte n'a AUCUNE condition de vente sur
// EBAY_FR (livraison, paiement, retours) : l'API Inventory les exige, ses deux publications se sont arrêtées sur
// « compte pas prêt », avec un lien vers ebay.fr/bp/manage (décision du 12/10). Il a annulé, puis résilié.
// Décision de Nico (04/11, remplace celle du 12/10) : FillSell propose de CRÉER ces conditions, avec les réglages que
// le vendeur utilise déjà sur ses propres annonces eBay (transporteurs et prix, délai d'expédition, retours, code
// postal et ville) ; rien n'est créé sans son clic. Sans annonce lisible : des valeurs ordinaires (Colissimo, envoi
// sous 2 jours, retours acceptés 30 jours à la charge de l'acheteur) et un prix de livraison VIDE, à remplir — jamais
// inventé.
// Pur (Deno), sans appel : les lectures (GetMyeBaySelling, GetItem, liste des services) sont faites par ebay-account.
import { blocs, valeur } from "./ebay-trading-releve.ts";

export interface ConditionsDUneAnnonce {
  services: Array<{ code: string; frais: number | null }>;
  delai: number | null;
  retours: { acceptes: boolean; jours: number | null } | null;
  codePostal: string | null;
  ville: string | null;
}

/** Les conditions portées par UNE annonce (bloc <Item> de GetItem). */
export function conditionsDeLAnnonce(itemXml: string): ConditionsDUneAnnonce {
  const it = String(itemXml ?? "");
  const exp = valeur(it, "ShippingDetails") ?? "";
  const services = blocs(exp, "ShippingServiceOptions").map((o) => {
    const code = valeur(o, "ShippingService") ?? "";
    const gratuit = /^true$/i.test(valeur(o, "FreeShipping") ?? "");
    const cout = Number(String(valeur(o, "ShippingServiceCost") ?? "").replace(",", "."));
    return { code, frais: gratuit ? 0 : (Number.isFinite(cout) ? Math.round(cout * 100) / 100 : null) };
  }).filter((s) => s.code);
  const delai = Number(valeur(it, "DispatchTimeMax"));
  const rp = valeur(it, "ReturnPolicy");
  const optRetours = rp ? valeur(rp, "ReturnsAcceptedOption") : null;
  const jours = rp ? Number(String(valeur(rp, "ReturnsWithinOption") ?? "").replace(/\D/g, "")) : NaN;
  const cp = (valeur(it, "PostalCode") ?? "").trim();
  return {
    services,
    delai: Number.isFinite(delai) && delai > 0 ? delai : null,
    retours: optRetours ? { acceptes: /^ReturnsAccepted$/i.test(optRetours), jours: Number.isFinite(jours) && jours > 0 ? jours : null } : null,
    codePostal: /^\d{5}$/.test(cp) ? cp : null,
    ville: (valeur(it, "Location") ?? "").trim() || null,
  };
}

export interface ServiceValide { code: string; libelle: string; valide: boolean; international: boolean }
export interface PropositionConditions {
  source: "annonces" | "defauts";
  annonces_lues: number;
  livraison: { services: Array<{ code: string; libelle: string; frais: number | null }>; delai_jours: number };
  retours: { acceptes: boolean; jours: number };
  paiement: { immediat: true };
  adresse: { code_postal: string; ville: string } | null;
}

const PLUS_FREQUENT = <T,>(xs: T[]): T | null => {
  const n = new Map<string, { v: T; k: number }>();
  for (const x of xs) { const c = JSON.stringify(x); n.set(c, { v: x, k: (n.get(c)?.k ?? 0) + 1 }); }
  return [...n.values()].sort((a, b) => b.k - a.k)[0]?.v ?? null;
};

/**
 * La proposition : ce que les annonces du vendeur disent (le plus fréquent), recalé sur les services qu'eBay FR accepte
 * aujourd'hui (un service retiré par eBay ne passe pas) ; sinon les valeurs ordinaires, prix de livraison VIDE.
 * `plafond` : le nombre de services domestiques qu'eBay accepte dans une politique.
 */
export function proposerConditions(lues: ConditionsDUneAnnonce[], valides: ServiceValide[], plafond = 4): PropositionConditions {
  const domestiques = (valides ?? []).filter((s) => s.valide && !s.international);
  const libelle = (code: string) => domestiques.find((s) => s.code === code)?.libelle ?? code;
  const codesVus: string[] = [];
  const frais: Record<string, Array<number | null>> = {};
  for (const l of lues ?? []) for (const s of l.services) {
    if (!domestiques.some((d) => d.code === s.code)) continue;
    if (!codesVus.includes(s.code)) codesVus.push(s.code);
    (frais[s.code] ??= []).push(s.frais);
  }
  const delais = (lues ?? []).map((l) => l.delai).filter((d): d is number => d != null);
  const retoursLus = (lues ?? []).map((l) => l.retours).filter((r): r is { acceptes: boolean; jours: number | null } => r != null);
  const adresses = (lues ?? []).filter((l) => l.codePostal && l.ville).map((l) => ({ code_postal: l.codePostal as string, ville: l.ville as string }));
  if (codesVus.length) {
    const r = PLUS_FREQUENT(retoursLus);
    const jours = r?.jours && [14, 30, 60].includes(r.jours) ? r.jours : 30;
    return {
      source: "annonces",
      annonces_lues: lues.length,
      livraison: {
        services: codesVus.slice(0, plafond).map((code) => ({ code, libelle: libelle(code), frais: PLUS_FREQUENT(frais[code] ?? []) ?? null })),
        delai_jours: Math.min(3, Math.max(1, PLUS_FREQUENT(delais) ?? 2)),
      },
      retours: { acceptes: r ? r.acceptes : true, jours },
      paiement: { immediat: true },
      adresse: PLUS_FREQUENT(adresses),
    };
  }
  const colissimo = domestiques.find((s) => s.code === "FR_ColiposteColissimo") ?? domestiques.find((s) => /colissimo/i.test(s.libelle));
  return {
    source: "defauts",
    annonces_lues: (lues ?? []).length,
    livraison: { services: colissimo ? [{ code: colissimo.code, libelle: colissimo.libelle, frais: null }] : [], delai_jours: 2 },
    retours: { acceptes: true, jours: 30 },
    paiement: { immediat: true },
    adresse: PLUS_FREQUENT(adresses),
  };
}

/** Les identifiants des annonces actives rendues par GetMyeBaySelling (première page). */
export function identifiantsActifs(xml: string, max = 3): string[] {
  const actif = valeur(String(xml ?? ""), "ActiveList") ?? "";
  return blocs(actif, "Item").map((b) => valeur(b, "ItemID") ?? "").filter((x) => /^\d{9,15}$/.test(x)).slice(0, max);
}
