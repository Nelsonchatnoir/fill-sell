// ═══════════════════════════════════════════════════════════════════════════
// UN ACHAT ANNULÉ SE VOIT DANS L'APP (22/10 soir, point 1c — décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Le mail « Vendu » part dès l'« Achat en cours » Leboncoin (comportement gardé). Si l'achat est ANNULÉ, la base
// défait tout seule (vente_transaction_annulee_leboncoin : fiche remise en stock, retraits encore en file arrêtés,
// copies déjà retirées remises en vente) et en garde la trace dans ventes_supprimees — mais l'app ne le disait
// nulle part : la vente disparaissait en silence. Désormais une ligne « À régler » (information, sans action
// exigée) le dit pendant 7 jours, masquable. ⛔ AUCUN second mail : c'est l'app qui le dit, rien d'autre.
import { useEffect, useState } from "react";
import { demarrerRelecture } from "../utils/relectureBornee";

/** Les achats annulés à montrer (pur, testé) : les 7 derniers jours, ceux que la personne n'a pas masqués. */
export function achatsAnnulesAMontrer(lignes, masques = [], maintenant = Date.now()) {
  const vus = new Set((Array.isArray(masques) ? masques : []).map(String));
  return (Array.isArray(lignes) ? lignes : [])
    .filter((l) => l && String(l.motif ?? "").startsWith("transaction_annulee"))
    .filter((l) => {
      const t = Date.parse(String(l.supprimee_le ?? ""));
      return Number.isFinite(t) && maintenant - t < 7 * 86_400_000;
    })
    .filter((l) => !vus.has(String(l.id)))
    .sort((a, b) => String(b.supprimee_le).localeCompare(String(a.supprimee_le)));
}

const CLE_MASQUES = "fs_achats_annules_vus";
export function lireMasquesAchatsAnnules() {
  try { return JSON.parse(localStorage.getItem(CLE_MASQUES) ?? "[]"); } catch { return []; }
}
export function masquerAchatAnnule(id) {
  try {
    const m = new Set(lireMasquesAchatsAnnules().map(String));
    m.add(String(id));
    localStorage.setItem(CLE_MASQUES, JSON.stringify([...m].slice(-200)));
  } catch { /* stockage indisponible : la ligne revient au prochain chargement, sans gravité */ }
}

/** Les phrases de la ligne. */
export function texteAchatAnnule(l, lang = "fr") {
  const titre = String(l?.titre ?? "").trim() || (lang === "en" ? "your item" : "ton article");
  const plateforme = l?.plateforme_code === "leboncoin" ? "Leboncoin" : String(l?.plateforme_code ?? "");
  return lang === "en"
    ? { titre: `Purchase cancelled on ${plateforme}`, texte: `“${titre}” is back in your stock: its listings elsewhere stay or go back online by themselves. Nothing to do.` }
    : { titre: `Achat annulé sur ${plateforme}`, texte: `« ${titre} » est revenu dans ton stock : ses annonces ailleurs restent ou repartent en ligne toutes seules. Rien à faire.` };
}

export function useAchatsAnnules({ supabase, userId, actif = true }) {
  const [lignes, setLignes] = useState([]);
  useEffect(() => {
    if (!actif || !supabase || !userId) return undefined;
    const r = demarrerRelecture(async () => {
      const depuis = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data, error } = await supabase.from("ventes_supprimees")
        .select("id, plateforme_code, titre, prix_vente, vendu_le, supprimee_le, motif, source")
        .eq("user_id", userId).gte("supprimee_le", depuis).like("motif", "transaction_annulee%")
        .order("supprimee_le", { ascending: false }).limit(20);
      if (error) return false;
      setLignes(Array.isArray(data) ? data : []);
      return true;
    }, { intervalleMs: 10 * 60_000, maxMs: 30 * 60_000 });
    return () => r.arreter();
  }, [actif, supabase, userId]);
  return lignes;
}
