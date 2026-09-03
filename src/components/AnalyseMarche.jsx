import { useState } from "react";
import { formatCurrency } from "../utils/shared";

// ── AnalyseMarche — LE rendu de l'analyse de marché, partout (2026-07-31) ────
//
// UNE SEULE SOURCE : la réponse lens-analysis DÉJÀ PAYÉE (6 unités), passée
// en prop. Ce composant n'appelle rien, ne recalcule aucun prix, ne relance
// aucun scan — il présente. Deux variantes :
//   · variant="verdict"     → écran de résultat Lens : c'est LE contenu.
//   · variant="publication" → stepper : une ligne repliée sous le champ prix.
//
// POURQUOI CE COMPOSANT EXISTE (chantier 30/07) : l'écran Lens déversait tout
// ce que le modèle produit au même niveau — prix, prix d'achat conseillé,
// fourchette basse/moyenne/haute, annonces, vitesse, plateformes, 3 conseils,
// deal score, description. Ça se lisait comme un rapport, pas comme une
// réponse. Et le stepper, lui, ne montrait RIEN de cette analyse : 6 unités
// de contenu réduites à une ligne. Un seul composant règle les deux.
//
// HIÉRARCHIE (validée par Nico le 30/07) :
//   1. réponse principale = prix conseillé, puis verdict avec la marge en clair
//   2. deuxième ligne     = la FIABILITÉ seule (sur combien d'annonces)
//   3. replié             = annonces, fourchette, vitesse, plateformes,
//                           conseils, description, notes
//   supprimés : deal score ; prix d'achat conseillé quand l'achat est saisi ;
//   « meilleures plateformes » comme section de plein droit.
//
// ⚠️ DEAL SCORE SUPPRIMÉ, définitivement. Le schéma de lens-analysis demande
// `"score":number` SANS échelle, sans barème, sans exemple — un nombre demandé
// à un modèle sans calibration régresse vers le centre, d'où le 4-6/10
// permanent constaté. Il n'est persisté nulle part, donc pas ré-étalonnable, et
// il dérive de la MÊME marge que le verdict : deux indicateurs de la même
// grandeur finissent par se contredire. Le verdict, lui, a des seuils
// explicites. Ne pas le réintroduire sans définir son échelle d'abord.

// Annonces réellement exploitables (titre + prix numérique) et niveau de
// confiance qui en découle. Exporté : le CTA de l'écran Lens en dépend (un
// écran qui ne connaît pas le prix ne propose pas de publier).
export function analyseFiabilite(result) {
  const annonces = Array.isArray(result?.annonces_marche)
    ? result.annonces_marche.filter((a) => a?.titre && Number.isFinite(a?.prix))
    : [];
  const count = annonces.length;
  return {
    annonces,
    count,
    // solide = une vraie fourchette ; fragile = un POINT isolé, pas un marché ;
    // aucune = le modèle a produit un prix sans la moindre source.
    niveau: count >= 2 ? "solide" : count === 1 ? "fragile" : "aucune",
  };
}

// Seuils du prompt lens-analysis, appliqués ICI à la marge réelle.
// ⚠️ On n'affiche JAMAIS result.verdict tel quel : il est calculé par le
// modèle, et rien ne garantit qu'il s'accorde avec le prix d'achat que
// l'utilisateur a saisi de son côté — on a vu un « Excellent » possible à
// côté d'une perte. Dériver le verdict de la marge qu'on AFFICHE rend la
// contradiction impossible par construction.
function verdictDepuisMarge(marge, prix) {
  if (!Number.isFinite(marge) || !Number.isFinite(prix) || prix <= 0) return null;
  const pct = (marge / prix) * 100;
  if (pct > 40) return "excellent";
  if (pct > 20) return "bon";
  if (pct > 0) return "moyen";
  return "eviter";
}

const VERDICT_STYLE = {
  excellent: { fr: "Excellent", en: "Excellent", bg: "#ECFDF5", bd: "#A7F3D0", fg: "#047857" },
  bon:       { fr: "Bon deal",  en: "Good deal", bg: "#ECFDF5", bd: "#A7F3D0", fg: "#047857" },
  moyen:     { fr: "Moyen",     en: "Average",   bg: "#FFFBEB", bd: "#FDE68A", fg: "#92400E" },
  eviter:    { fr: "À éviter",  en: "Avoid",     bg: "#FEF2F2", bd: "#FECACA", fg: "#B91C1C" },
};

const VITESSE_LABEL = {
  rapide: { fr: "Rapide", en: "Fast" },
  moyen:  { fr: "Moyenne", en: "Average" },
  lent:   { fr: "Lente",   en: "Slow" },
};

// Marge et verdict à partir du prix d'achat RÉELLEMENT saisi.
// prixAchat absent = mode CHINE : aucun verdict n'est produit — celui du
// modèle reposerait sur prix_achat_suggere, qu'il a lui-même choisi pour que
// la marge soit bonne. Circulaire, donc favorable par construction. On rend à
// la place la seule chose actionnable en boutique : le prix plafond.
function calculeMarge(result, prixAchat) {
  const prix = Number(result?.prix_vente_suggere);
  const achat = Number.parseFloat(prixAchat);
  const aAchat = Number.isFinite(achat) && achat > 0;
  if (!aAchat || !Number.isFinite(prix)) return { prix, aAchat: false, marge: null, pct: null, verdict: null };
  const marge = prix - achat;
  return {
    prix,
    aAchat: true,
    marge,
    pct: prix > 0 ? Math.round((marge / prix) * 100) : null,
    verdict: verdictDepuisMarge(marge, prix),
  };
}

const C = {
  ink: "#10201B", mute: "#6B7A75", mute2: "#8A8578", teal: "#1B6E62",
  rule: "#EDF0EE", border: "#E4E9E7",
  warnBg: "#FFFBEB", warnBd: "#FDE68A", warnFg: "#92400E",
  buyBg: "#F5F3FF", buyBd: "#DDD6FE", buyFg: "#6D28D9",
};

export default function AnalyseMarche({
  result,
  prixAchat = null,
  lang = "fr",
  currency = "EUR",
  variant = "verdict",
  // `notes` est aussi rendue par LensIdentite (11/08), en encart « une photo de
  // plus affinerait l'analyse » — c'est là qu'elle est exploitable. Ce drapeau
  // évite de l'écrire deux fois sur le même écran. Défaut `false` : tous les
  // autres appelants, stepper compris, gardent le comportement d'origine.
  masquerNotes = false,
}) {
  const [ouvert, setOuvert] = useState(false);
  if (!result || result.prix_vente_suggere == null) return null;

  const en = lang === "en";
  const { annonces, count, niveau } = analyseFiabilite(result);
  const { prix, aAchat, marge, pct, verdict } = calculeMarge(result, prixAchat);
  const prixTxt = formatCurrency(prix ?? 0, currency);
  const bornes = annonces.length
    ? { min: Math.min(...annonces.map((a) => a.prix)), max: Math.max(...annonces.map((a) => a.prix)) }
    : null;

  // ── Ligne de fiabilité — la deuxième chose qu'on lit, et la seule ─────────
  // La vitesse de vente n'a AUCUNE source vérifiable : elle est descendue au
  // replié (arbitrage Nico du 30/07). La deuxième ligne ne porte que du solide.
  const fiabiliteTexte = () => {
    if (niveau === "solide") {
      return en
        ? `based on ${count} listings (${formatCurrency(bornes.min, currency)} – ${formatCurrency(bornes.max, currency)})`
        : `basé sur ${count} annonces (${formatCurrency(bornes.min, currency)} – ${formatCurrency(bornes.max, currency)})`;
    }
    const a = annonces[0];
    if (niveau === "fragile") {
      return en
        ? `Single comparable listing found — not a market range: "${a.titre}" at ${formatCurrency(a.prix, currency)}${a.plateforme ? ` on ${a.plateforme}` : ""}. Double-check the price.`
        : `Une seule annonce comparable trouvée — pas une fourchette de marché : « ${a.titre} » à ${formatCurrency(a.prix, currency)}${a.plateforme ? ` sur ${a.plateforme}` : ""}. Vérifie le prix.`;
    }
    // ZÉRO ANNONCE — écrit comme une RÉPONSE, pas comme une excuse (Nico) :
    // ce qu'on ne sait pas, puis ce que l'utilisateur peut faire à la place.
    return en
      ? `No comparable listing found for this item. The price above is the model's estimate, not a market reading — set your own price, then publish.`
      : `Aucune annonce comparable trouvée pour cet article. Le prix ci-dessus est une estimation du modèle, pas un relevé — fixe ton prix, puis publie.`;
  };

  // ── Contenu replié, commun aux deux variantes ────────────────────────────
  const details = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
      {/* Marge : rappelée ici quand elle est déjà en tête, utile au contrôle. */}
      {aAchat && (
        <Ligne
          label={en ? `Margin on ${formatCurrency(Number(prixAchat), currency)} paid` : `Marge sur ${formatCurrency(Number(prixAchat), currency)} d'achat`}
          valeur={`${marge >= 0 ? "+" : "−"}${formatCurrency(Math.abs(marge), currency)}${pct != null ? ` (${marge >= 0 ? "+" : "−"}${Math.abs(pct)} %)` : ""}`}
        />
      )}
      {/* Fourchette bas/moyen/haut : MASQUÉE à zéro annonce — elle dérive d'un
          prix sans source, l'afficher habillerait une supposition en analyse. */}
      {niveau !== "aucune" && result.fourchette_marche && (
        <Ligne
          label={en ? "Market range" : "Fourchette marché"}
          valeur={["bas", "moyen", "haut"]
            .map((k) => (result.fourchette_marche[k] != null ? formatCurrency(result.fourchette_marche[k], currency) : "—"))
            .join(" · ")}
        />
      )}
      {result.vitesse_vente && (
        <Ligne
          label={en ? "Sale speed" : "Vitesse de vente"}
          valeur={(VITESSE_LABEL[result.vitesse_vente] ?? VITESSE_LABEL.moyen)[en ? "en" : "fr"]}
        />
      )}
      {/* « Meilleures plateformes » n'est plus une section : l'app publie sur
          les 4 en un clic, l'information n'appelle aucune action. */}
      {result.plateformes?.length > 0 && (
        <Ligne label={en ? "Best platforms" : "Meilleures plateformes"} valeur={result.plateformes.join(", ")} />
      )}

      {annonces.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 9, display: "flex", flexDirection: "column", gap: 5 }}>
          {annonces.slice(0, 5).map((a, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: C.mute2, lineHeight: 1.4 }}>
              <span>{a.titre}{a.plateforme ? ` · ${a.plateforme}` : ""}</span>
              <span style={{ fontWeight: 700, color: C.ink, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {formatCurrency(a.prix, currency)}
              </span>
            </div>
          ))}
          {annonces.length > 5 && (
            <div style={{ fontSize: 12, color: "#A3A9A6" }}>
              {en ? `+ ${annonces.length - 5} more listings` : `+ ${annonces.length - 5} autres annonces`}
            </div>
          )}
        </div>
      )}

      {result.conseils?.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 9, display: "flex", flexDirection: "column", gap: 5 }}>
          {result.conseils.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 7, fontSize: 12, color: "#374151", lineHeight: 1.45 }}>
              <span style={{ color: C.teal, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}

      {(result.description || (result.notes && !masquerNotes)) && (
        <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 9, display: "flex", flexDirection: "column", gap: 6 }}>
          {result.description && <div style={{ fontSize: 12.5, color: "#374151", lineHeight: 1.55 }}>{result.description}</div>}
          {result.notes && !masquerNotes && <div style={{ fontSize: 11.5, color: C.mute2, fontStyle: "italic", lineHeight: 1.45 }}>{result.notes}</div>}
        </div>
      )}
    </div>
  );

  // ── Variante PUBLICATION : une ligne sous le champ prix, repliée ──────────
  // Dans le parcours de publication, l'analyse ne réclame pas l'écran : elle
  // se signale, et se déplie pour qui veut vérifier. Aucun CTA (le parcours en
  // a déjà un), aucun grand chiffre (le champ prix est juste au-dessus).
  if (variant === "publication") {
    const alerte = niveau === "aucune" || niveau === "fragile";
    // Même règle que la variante verdict : un objet déduit ne porte pas de
    // badge de deal. La pastille est plus discrète ici, mais elle dit la même
    // chose et se lit comme une validation.
    const vs = result.objet_source === "deduit" || !verdict ? null : VERDICT_STYLE[verdict];
    return (
      <div style={{
        border: `1px solid ${alerte ? C.warnBd : C.border}`,
        background: alerte ? C.warnBg : "transparent",
        borderRadius: 12, padding: "10px 12px", marginTop: 8,
      }}>
        <button
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          style={{
            width: "100%", background: "none", border: "none", padding: 0, fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", cursor: "pointer",
            fontSize: 12.5, color: alerte ? C.warnFg : C.mute, textAlign: "left",
          }}
        >
          <span style={{ color: alerte ? C.warnFg : "#A3A9A6", flexShrink: 0 }}>{ouvert ? "▾" : "▸"}</span>
          <span style={{ fontWeight: 600 }}>{en ? "Lens analysis" : "Analyse Lens"}</span>
          <span style={{ fontWeight: 700, color: alerte ? C.warnFg : C.teal, fontVariantNumeric: "tabular-nums" }}>{prixTxt}</span>
          <span>
            {niveau === "solide"
              ? (en ? `· ${count} listings` : `· ${count} annonces`)
              : niveau === "fragile"
                ? (en ? "· 1 listing only" : "· 1 seule annonce")
                : (en ? "· no comparable listing" : "· aucune annonce comparable")}
          </span>
          {vs && niveau !== "aucune" && (
            <span style={{ padding: "2px 8px", borderRadius: 9, fontSize: 11, fontWeight: 700, background: vs.bg, border: `1px solid ${vs.bd}`, color: vs.fg }}>
              {en ? vs.en : vs.fr}
            </span>
          )}
        </button>
        {ouvert && details}
      </div>
    );
  }

  // ── Variante VERDICT : l'écran Lens ──────────────────────────────────────
  // Taille du prix = solidité de ses sources (règle transverse) : plein
  // calibre sur une vraie fourchette, réduit sur un point isolé, minimal
  // quand aucune annonce ne le soutient.
  const taillePrix = niveau === "solide" ? 46 : niveau === "fragile" ? 30 : 25;
  const couleurPrix = niveau === "solide" ? C.teal : niveau === "fragile" ? C.ink : "#4A5B55";
  // ── « ACHÈTE EN DESSOUS DE 0,00 € » (bouilloire, 11/08 15:32) ────────────
  // Le serveur mettait bien prix_achat_suggere à null (objet déduit), et la
  // garde ci-dessous était censée masquer l'encart. Elle ne l'a pas fait :
  //     Number(null) === 0   →   Number.isFinite(0) === true
  // `Number()` ne rend NaN que sur une chaîne non numérique ; sur null, sur ""
  // et sur false il rend 0. Un plafond d'achat à 0 € est le pire conseil
  // possible — il dit « n'achète jamais » avec l'autorité d'un chiffre calculé.
  // C'est la même famille de piège que `isNaN(null) === false` (CLAUDE.md) :
  // le test de finitude ne remplace pas le test de PRÉSENCE.
  // On teste donc la présence D'ABORD, sans conversion, et sans repli.
  // ── Objet DÉDUIT : ni plafond d'achat, ni verdict (11/08) ────────────────
  // Le serveur met déjà prix_achat_suggere, verdict et score à null — mais ce
  // composant n'a JAMAIS lu result.verdict (cf. plus haut : il le RECALCULE
  // depuis le prix d'achat réellement saisi, pour qu'il ne puisse pas
  // contredire la marge affichée). Nuller le champ côté serveur était donc
  // sans effet ici : un « Excellent » continuait de sortir sur un objet
  // deviné, dès que l'utilisateur avait saisi son prix d'achat. Le verdict
  // porte sur un prix de vente qui porte lui-même sur un objet non établi :
  // il tombe avec lui.
  // Le drapeau entre AUSSI dans la garde du plafond, en plus du null serveur :
  // une réponse resservie du cache identify 24 h, ou produite par une version
  // antérieure de la fonction, ne doit pas pouvoir rouvrir l'encart.
  const objetDeduit = result.objet_source === "deduit";
  const vs = objetDeduit || !verdict ? null : VERDICT_STYLE[verdict];
  const achatSuggere = result.prix_achat_suggere;
  const plafond = !aAchat && !objetDeduit
    && achatSuggere != null && Number.isFinite(Number(achatSuggere)) && Number(achatSuggere) > 0
    ? Number(achatSuggere) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontSize: taillePrix, fontWeight: 700, color: couleurPrix, letterSpacing: "-0.025em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {niveau === "aucune" ? `≈ ${prixTxt}` : prixTxt}
        </div>
        <div style={{ fontSize: 11.5, color: C.mute2 }}>
          {niveau === "solide"
            ? (result.fourchette_min != null && result.fourchette_max != null
                ? (en ? `range ${formatCurrency(result.fourchette_min, currency)} – ${formatCurrency(result.fourchette_max, currency)}`
                      : `fourchette ${formatCurrency(result.fourchette_min, currency)} – ${formatCurrency(result.fourchette_max, currency)}`)
                : (en ? "suggested sell price" : "prix de vente conseillé"))
            : niveau === "fragile"
              ? (en ? "indicative price" : "prix indicatif")
              : (en ? "estimate with no market data" : "estimation sans donnée de marché")}
        </div>
      </div>

      {/* Verdict — ou prix plafond en chine. RIEN à zéro annonce : verdict et
          fourchette dérivent tous deux d'un prix sans source (arbitrage du
          30/07), et un badge favorable sur une supposition est exactement ce
          que ce chantier supprime. */}
      {niveau !== "aucune" && vs && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", background: vs.bg, border: `1px solid ${vs.bd}`, borderRadius: 12, padding: "11px 13px" }}>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: vs.fg }}>
            {en ? vs.en : vs.fr}
          </span>
          <span style={{ fontSize: 13, fontWeight: 650, color: vs.fg, fontVariantNumeric: "tabular-nums" }}>
            {marge >= 0
              ? (en ? `margin +${formatCurrency(marge, currency)}` : `marge +${formatCurrency(marge, currency)}`)
              : (en ? `loss −${formatCurrency(Math.abs(marge), currency)}` : `perte −${formatCurrency(Math.abs(marge), currency)}`)}
            {pct != null ? ` (${marge >= 0 ? "+" : "−"}${Math.abs(pct)} %)` : ""}
          </span>
        </div>
      )}
      {niveau !== "aucune" && !vs && plafond != null && (
        <div style={{ background: C.buyBg, border: `1px solid ${C.buyBd}`, borderRadius: 12, padding: "11px 13px" }}>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: C.buyFg }}>
            {en ? `Buy below ${formatCurrency(plafond, currency)}` : `Achète en dessous de ${formatCurrency(plafond, currency)}`}
          </span>
        </div>
      )}

      {/* Fiabilité : ligne sobre quand c'est solide, encart d'alerte sinon. */}
      {niveau === "solide" ? (
        <div style={{ fontSize: 12.5, color: "#4A5B55", display: "flex", gap: 7 }}>
          <span style={{ color: C.teal, fontWeight: 700 }}>•</span>
          <span>{fiabiliteTexte()}</span>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: C.warnFg, background: C.warnBg, border: `1px solid ${C.warnBd}`, borderRadius: 10, padding: "9px 11px", display: "flex", gap: 7, lineHeight: 1.45 }}>
          <span style={{ color: "#B45309", fontWeight: 700 }}>•</span>
          <span>{fiabiliteTexte()}</span>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 10 }}>
        <button
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.mute }}
        >
          <span style={{ color: "#A3A9A6" }}>{ouvert ? "▾" : "▸"}</span>
          {en ? "Details" : "Détails"}
          {!ouvert && (
            <span style={{ fontWeight: 400, color: "#A3A9A6", fontSize: 12 }}>
              {en ? "listings, range, sale speed, tips" : "annonces, fourchette, vitesse, conseils"}
            </span>
          )}
        </button>
        {ouvert && details}
      </div>
    </div>
  );
}

function Ligne({ label, valeur }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: C.mute, fontVariantNumeric: "tabular-nums" }}>
      <span>{label}</span>
      <span style={{ color: C.ink, fontWeight: 600, textAlign: "right" }}>{valeur}</span>
    </div>
  );
}
