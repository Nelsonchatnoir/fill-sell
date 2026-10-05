// ═══════════════════════════════════════════════════════════════════════════
// LA LIVRAISON DU LOT — POIDS, TRANSPORTEURS, FORMAT (04/10/2026, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Louis : 13 « Rangement » identiques partis sur Leboncoin, 7 en « Petit »,
// 6 en « Moyen », sans poids ni transporteurs — le format était DEVINÉ par la
// rédaction, article par article. Règle de Nico : aucun format deviné en
// silence ; sans poids, l'article est « à compléter » (regles.js, motif
// « poids ») ; le lot reçoit, AVANT l'envoi :
//   · un POIDS : une valeur pour le lot, modifiable article par article,
//     écrite sur la fiche (inventaire.poids_g, le seul champ Poids) ;
//   · les TRANSPORTEURS Leboncoin, ceux que la page propose vraiment
//     (relevé du 04/10, utils/leboncoinColis.js), retenus pour la suite ;
//   · le FORMAT Leboncoin : estimé par Leboncoin (par défaut, le même pour
//     des articles identiques), ou choisi ;
//   · (05/10, point 3, décision de Nico) le FORMAT DU COLIS VINTED, par rayon
//     Vinted du lot : la grille de CE rayon (relevée sur le formulaire
//     d'abord), « Recommandé par Vinted » par défaut — aucun choix —, le
//     format retenu pour le rayon pré-sélectionné ; le choix part sur les
//     copies Vinted du rayon et se retient (platform_settings.vinted.
//     colis_retenus). Un rayon sans grille connue : on le dit, rien n'est
//     inventé.
// Ce que chaque plateforme demande est DIT, plateforme par plateforme : rien
// ne laisse croire qu'un choix existe là où il n'existe pas.
import { useState } from "react";
import { Carte } from "../composants";
import { LBC_TRANSPORTEURS, LBC_FORMATS, transporteursPourPoids } from "../../utils/leboncoinColis";
import { plateformesAuPoids, lirePoidsSaisi } from "./regles";

const titreDe = (item) => String(item?.titre ?? item?.title ?? "").trim();

export default function LivraisonDuLot({
  en, ids, parId, moteurs, poidsDe, poserPoids, poserPoidsDuLot, livraison, poserTransporteurs, poserFormat,
  colisVinted = [], choisirColisVinted = () => {},
}) {
  const [poidsLot, setPoidsLot] = useState("");
  const plateformesDe = (id) => [...(moteurs.get(id)?.plateformesPubliables ?? [])];
  const auPoids = ids.filter((id) => plateformesAuPoids(plateformesDe(id)).length);
  const avecLbc = ids.filter((id) => plateformesDe(id).includes("leboncoin"));
  const avecVinted = ids.some((id) => plateformesDe(id).includes("vinted"));
  const avecEbay = ids.some((id) => plateformesDe(id).includes("ebay"));
  if (!auPoids.length && !avecVinted && !avecEbay) return null;
  const sansPoids = auPoids.filter((id) => poidsDe(id) == null);
  const gLot = lirePoidsSaisi(poidsLot);
  const choisis = livraison.transporteurs; // null = ceux que Leboncoin propose
  const coche = (nom) => (choisis ? choisis.includes(nom) : true);
  const basculer = (nom) => {
    const base = choisis ?? LBC_TRANSPORTEURS.map((t) => t.nom);
    const suite = base.includes(nom) ? base.filter((n) => n !== nom) : [...base, nom];
    poserTransporteurs(suite.length === LBC_TRANSPORTEURS.length ? null : suite);
  };

  return (
    <Carte titre={en ? "Shipping" : "Livraison"}>
      {auPoids.length > 0 && (
        <div className="fsn-q fsn-q--bloque">
          <div className="fsn-q-t">{en ? "Weight of each item" : "Poids de chaque article"}</div>
          <div className="fsn-q-why">{en
            ? "Leboncoin and Beebs price the parcel by weight. Without it, nothing is guessed: the item waits here. The weight is saved on the item."
            : "Leboncoin et Beebs calculent l'envoi au poids. Sans lui, rien n'est deviné : l'article attend ici. Le poids est gardé sur la fiche."}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input className="fsn-input" style={{ maxWidth: 170 }} type="text" inputMode="decimal" value={poidsLot}
              onChange={(ev) => setPoidsLot(ev.target.value)} placeholder={en ? "e.g. 650 g or 1.2 kg" : "ex. 650 g ou 1,2 kg"}
              aria-label={en ? "Weight for the batch" : "Poids pour le lot"} />
            <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" disabled={!gLot || !sansPoids.length}
              onClick={() => { if (gLot) poserPoidsDuLot(sansPoids, gLot); }}>
              {sansPoids.length
                ? (en ? `Apply to the ${sansPoids.length} without weight` : `Appliquer aux ${sansPoids.length} sans poids`)
                : (en ? "All have a weight" : "Tous ont un poids")}
            </button>
          </div>
          {auPoids.map((id) => {
            const g = poidsDe(id);
            return (
              <div key={`${id}:${g ?? ""}`} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                <span className="fsn-grow" style={{ fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {titreDe(parId.get(id)?.item) || (en ? "Untitled item" : "Article sans titre")}
                </span>
                <input className="fsn-input" style={{ maxWidth: 110 }} type="text" inputMode="decimal"
                  defaultValue={g != null ? String(g) : ""} placeholder={en ? "weight" : "poids"}
                  aria-label={en ? "Weight in grams" : "Poids en grammes"}
                  onBlur={(ev) => { const v = lirePoidsSaisi(ev.target.value); if (v && v !== g) poserPoids(id, v); }}
                  onKeyDown={(ev) => { if (ev.key === "Enter") ev.currentTarget.blur(); }} />
                <small style={{ width: 16 }}>g</small>
              </div>
            );
          })}
        </div>
      )}

      {avecLbc.length > 0 && (
        <div className="fsn-q">
          <div className="fsn-q-t">{en ? "Leboncoin carriers" : "Transporteurs Leboncoin"}</div>
          <div className="fsn-q-why">{en
            ? "The ones Leboncoin offers. Kept for your next Leboncoin listings. An item too heavy for a carrier keeps the others."
            : "Ceux que Leboncoin propose. Ton choix est gardé pour tes prochaines annonces Leboncoin. Un article trop lourd pour un transporteur garde les autres."}</div>
          {LBC_TRANSPORTEURS.map((t) => {
            const on = coche(t.nom);
            const tropLourds = avecLbc.filter((id) => { const g = poidsDe(id); return g != null && !transporteursPourPoids(g).includes(t.nom); });
            return (
              <button key={t.cle} type="button" className="fsn-pf" style={{ width: "100%", textAlign: "left", display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}
                onClick={() => basculer(t.nom)} aria-pressed={on}>
                <span className={`fsn-check${on ? " fsn-check--on" : ""}`} aria-hidden="true">{on ? "✓" : ""}</span>
                <span className="fsn-grow">
                  <b style={{ fontSize: 13.5 }}>{t.nom}</b>
                  <small style={{ display: "block" }}>{en ? `Up to ${t.kgMax} kg · ${t.remise}` : `Jusqu'à ${t.kgMax} kg · ${t.remise}`}{t.cle === "courrier_suivi" ? (en ? " · 3 cm thick max" : " · 3 cm d'épaisseur au plus") : ""}</small>
                  {on && tropLourds.length > 0 && (
                    <small style={{ display: "block", color: "#92400E" }}>{en
                      ? `Too heavy for ${tropLourds.length} item${tropLourds.length > 1 ? "s" : ""}: not ticked for ${tropLourds.length > 1 ? "them" : "it"}.`
                      : `Trop lourd pour ${tropLourds.length} article${tropLourds.length > 1 ? "s" : ""} : pas coché pour ${tropLourds.length > 1 ? "eux" : "lui"}.`}</small>
                  )}
                </span>
              </button>
            );
          })}
          <div className="fsn-q-t" style={{ marginTop: 12 }}>{en ? "Parcel size on Leboncoin" : "Format du colis sur Leboncoin"}</div>
          <div className="fsn-q-why">{en
            ? "A size, not a weight. By default Leboncoin estimates it from the category — the same for identical items."
            : "Une taille, pas un poids. Par défaut Leboncoin l'estime d'après le rayon — le même pour des articles identiques."}</div>
          <div className="fsn-choices">
            <button type="button" className={`fsn-choice${!livraison.format ? " fsn-choice--on" : ""}`} onClick={() => poserFormat("")}>
              {en ? "Estimated by Leboncoin" : "Estimé par Leboncoin"}
            </button>
            {LBC_FORMATS.map((f) => (
              <button key={f.valeur} type="button" title={f.aide} className={`fsn-choice${livraison.format === f.valeur ? " fsn-choice--on" : ""}`}
                onClick={() => poserFormat(f.valeur)}>{f.valeur}</button>
            ))}
          </div>
          {livraison.format === "Volumineux" && (
            <div className="fsn-q-why" style={{ color: "#92400E" }}>{en
              ? "Bulky: Leboncoin's \"XL parcel\" delivery, with no partner carrier — you arrange the shipping yourself."
              : "Volumineux : Leboncoin passe en « Livraison colis XL », sans transporteur partenaire — tu organises l'envoi toi-même."}</div>
          )}
        </div>
      )}

      {avecVinted && (
        <div className="fsn-q">
          <div className="fsn-q-t">{en ? "Vinted parcel size" : "Format du colis Vinted"}</div>
          <div className="fsn-q-why">{en
            ? "A size, never a weight. Nothing is guessed: without a choice, Vinted keeps the one it recommends. Your choice is kept for your next Vinted listings in the same category."
            : "Une taille, jamais un poids. Rien n'est deviné : sans choix, Vinted garde celle qu'il recommande. Ton choix est gardé pour tes prochaines annonces Vinted du même rayon."}</div>
          {colisVinted.length === 0 && (
            <div className="fsn-q-why">{en
              ? "The size is picked here once the Vinted category is known."
              : "Le format se choisit ici dès que le rayon Vinted est connu."}</div>
          )}
          {colisVinted.map((r) => (
            <div key={r.cle} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.cle}>
                {(r.chemin ?? []).slice(-2).join(" › ")}
                <small style={{ fontWeight: 400 }}>{en ? ` · ${r.nb} item${r.nb > 1 ? "s" : ""}` : ` · ${r.nb} article${r.nb > 1 ? "s" : ""}`}</small>
              </div>
              {r.grille ? (
                <div className="fsn-choices">
                  <button type="button" className={`fsn-choice${!r.choisi ? " fsn-choice--on" : ""}`} aria-pressed={!r.choisi}
                    onClick={() => choisirColisVinted(r.cle, r.chemin, 0)}>
                    {en ? "Recommended by Vinted" : "Recommandé par Vinted"}
                  </button>
                  {r.grille.map((g) => (
                    <button key={g.id} type="button" className={`fsn-choice${r.choisi === g.id ? " fsn-choice--on" : ""}`} aria-pressed={r.choisi === g.id}
                      onClick={() => choisirColisVinted(r.cle, r.chemin, g.id)}>{g.libelle}</button>
                  ))}
                </div>
              ) : (
                <div className="fsn-q-why">{en
                  ? "Vinted will offer its sizes for this category: nothing to pick here."
                  : "Vinted proposera ses tailles pour ce rayon : rien à choisir ici."}</div>
              )}
              {r.retenu && (
                <small style={{ display: "block" }}>{en ? "Your choice for this category, kept from last time." : "Ton choix pour ce rayon, gardé de la dernière fois."}</small>
              )}
              {r.parFiche > 0 && (
                <small style={{ display: "block" }}>{en
                  ? `${r.parFiche} item${r.parFiche > 1 ? "s keep" : " keeps"} the size chosen on ${r.parFiche > 1 ? "their" : "its"} card — tap a size to apply it to all.`
                  : `${r.parFiche > 1 ? `${r.parFiche} articles gardent` : "1 article garde"} le format choisi sur sa fiche — touche un format pour l'appliquer à tous.`}</small>
              )}
            </div>
          ))}
        </div>
      )}

      {avecEbay && (
        <div className="fsn-q-why" style={{ marginTop: 8 }}>{en
          ? "eBay: neither weight nor size here — shipping costs come from your eBay shipping policy."
          : "eBay : ni poids ni format ici — les frais d'envoi viennent de ta politique d'expédition eBay."}</div>
      )}
    </Carte>
  );
}
