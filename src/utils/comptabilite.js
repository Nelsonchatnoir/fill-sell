// Règle de comptabilisation — SOURCE UNIQUE (2026-08-03).
//
// Un article dont le PRIX D'ACHAT EST INCONNU n'entre dans AUCUN calcul de
// marge, de bénéfice, de total investi ni de moyenne. Nulle part.
//
// VIDE ≠ ZÉRO, et c'est tout l'enjeu :
//   · prix d'achat NULL/absent = on ne sait pas → l'article est ÉCARTÉ ;
//   · prix d'achat 0           = gratuit assumé (don, cadeau, lot offert)
//                                → il compte normalement, marge = prix de vente.
// Écrire 0 pour dire « je ne sais pas » produit une marge de 100 % sur du vent :
// c'est ce que faisaient ~90 endroits du code avant cette date, via des
// `parseFloat(x) || 0`, `?? 0` et `Number(x ?? 0)`.
//
// Pourquoi une exclusion plutôt qu'une estimation : une marge absente se voit
// et se corrige (l'utilisateur complète le prix) ; une marge fausse se propage
// dans les stats, les conseils de l'IA et les e-mails, et personne ne la
// détecte. Marge absente > marge fausse.
//
// ⚠️ Ce module ne change AUCUNE formule existante. Les incohérences de
// dénominateur relevées le 03/08 (marge % sur prix de vente dans App.jsx, sur
// prix d'achat dans voiceEngine, sur COGS dans VoiceResultCard) restent en
// l'état, volontairement : les unifier ferait bouger des pourcentages
// aujourd'hui affichés, sans rapport avec ce chantier. Dette documentée.

/**
 * Le prix d'achat de cet objet est-il CONNU ?
 * Accepte indifféremment un article d'inventaire (buy / prix_achat) ou une
 * vente (prix_achat / buy) — les deux formes coexistent dans le code.
 * `prix_achat_inconnu` (bouton « je ne sais plus ») vaut un prix absent.
 */
export function prixAchatConnu(x) {
  if (!x) return false;
  if (x.prix_achat_inconnu === true || x.prixAchatInconnu === true) return false;
  const brut = x.buy ?? x.prix_achat ?? x.purchase_price ?? null;
  if (brut === null || brut === undefined || brut === "") return false;
  const n = typeof brut === "number" ? brut : parseFloat(String(brut).replace(",", "."));
  return Number.isFinite(n);
}

/** Le prix d'achat en nombre, ou null s'il est inconnu. JAMAIS 0 par défaut. */
export function prixAchatNum(x) {
  if (!prixAchatConnu(x)) return null;
  const brut = x.buy ?? x.prix_achat ?? x.purchase_price;
  return typeof brut === "number" ? brut : parseFloat(String(brut).replace(",", "."));
}

/** Un objet entre-t-il dans les calculs d'argent ? Alias lisible côté appelant. */
export const comptabilisable = (x) => prixAchatConnu(x);

/** Ne garde que les lignes dont le prix d'achat est connu. */
export function comptabilisables(liste) {
  return (Array.isArray(liste) ? liste : []).filter(prixAchatConnu);
}

/** Combien de lignes sont écartées faute de prix d'achat (compteurs d'UI). */
export function nbSansPrixAchat(liste) {
  return (Array.isArray(liste) ? liste : []).filter((x) => !prixAchatConnu(x)).length;
}

/**
 * Somme d'argent investi. Les articles sans prix d'achat sont ÉCARTÉS, pas
 * comptés zéro : `reduce((a,i) => a + i.buy * qty, 0)` transformait un null en
 * 0 et un undefined en NaN contagieux (App.jsx:2561, StockTab:1595).
 */
export function totalInvesti(items, { avecFrais = false } = {}) {
  return comptabilisables(items).reduce((a, i) => {
    const q = i.quantite || 1;
    const frais = avecFrais ? Number(i.purchaseCosts ?? i.purchase_costs ?? 0) || 0 : 0;
    return a + prixAchatNum(i) * q + frais;
  }, 0);
}

/**
 * Marge unitaire, ou null si le prix d'achat est inconnu.
 * Dénominateur du pourcentage : le PRIX DE VENTE (convention majoritaire du
 * dépôt — App.jsx, sale-orchestration, AnalyseMarche).
 */
export function margeUnitaire({ prixVente, prixAchat, purchaseCosts = 0, sellingFees = 0 }) {
  const pv = Number(prixVente);
  if (!Number.isFinite(pv)) return { margin: null, marginPct: null };
  if (prixAchat === null || prixAchat === undefined || !Number.isFinite(Number(prixAchat))) {
    return { margin: null, marginPct: null };
  }
  const margin = pv - Number(prixAchat) - (Number(purchaseCosts) || 0) - (Number(sellingFees) || 0);
  return { margin, marginPct: pv > 0 ? (margin / pv) * 100 : 0 };
}

/**
 * Somme de marges sur une liste de ventes. Une marge null (article sans prix
 * d'achat) est ÉCARTÉE — surtout pas lue comme 0, ce qui tirerait la moyenne
 * vers le bas et gonflerait le nombre de ventes du dénominateur.
 * Rend aussi `exclus` pour que l'UI puisse dire pourquoi le total est partiel.
 */
export function totalMarge(ventes) {
  const liste = Array.isArray(ventes) ? ventes : [];
  let total = 0, retenues = 0, exclus = 0;
  for (const v of liste) {
    const m = v?.margin ?? v?.benefice ?? null;
    if (m === null || m === undefined || !Number.isFinite(Number(m)) || !prixAchatConnu(v)) {
      exclus++;
      continue;
    }
    total += Number(m);
    retenues++;
  }
  return { total, retenues, exclus };
}

/** Chiffre d'affaires : le prix de VENTE ne dépend pas du prix d'achat — aucune exclusion ici. */
export function totalCA(ventes) {
  return (Array.isArray(ventes) ? ventes : []).reduce(
    (a, v) => a + (Number(v?.sell ?? v?.prix_vente ?? 0) || 0), 0,
  );
}
