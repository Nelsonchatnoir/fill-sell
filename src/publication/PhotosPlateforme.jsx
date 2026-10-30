// ═══════════════════════════════════════════════════════════════════════════
// CARTE D'UNE PLATEFORME › SES PHOTOS (30/10/2026, lot E)
// ═══════════════════════════════════════════════════════════════════════════
// Toutes les photos de la fiche, et celles qui partent sur CETTE plateforme :
// choisir, retirer, réordonner (poignée, la 1ʳᵉ est la couverture), dans la
// limite de la plateforme. Replié par défaut (une ligne : « 8 photos sur 15 »),
// format mobile d'abord. Règle : publication/photosParPlateforme.js.
import { useMemo, useState } from "react";
import { X, Plus } from "lucide-react";
import { DragHandle, CoverBadge } from "../components/GaleriePhotos";
import { moveItem, usePhotoDrag } from "../utils/photosGalerie";
import { photosMaxPlateforme, photosParDefaut, choixValide, choixDifferent } from "./photosParPlateforme";

const NOMS = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay", opla: "Opla", depop: "Depop" };
const MOTS = {
  fr: {
    titre: "Photos", sur: (n, t) => `${n} photo${n > 1 ? "s" : ""} sur ${t}`, choisir: "Choisir", fermer: "Fermer",
    limite: (nom, m) => `${nom} : ${m} photos au plus`, toutes: "Revenir au choix par défaut", ajouter: "Ajouter :",
    pleine: (m) => `Limite atteinte (${m}) : retire une photo pour en ajouter une autre.`,
    lbc: "Leboncoin n'envoie que ses photos gratuites : les premières de cette liste.",
    garde: "Garde au moins une photo.", choisies: "choisies",
  },
  en: {
    titre: "Photos", sur: (n, t) => `${n} photo${n > 1 ? "s" : ""} of ${t}`, choisir: "Choose", fermer: "Close",
    limite: (nom, m) => `${nom}: ${m} photos at most`, toutes: "Back to the default choice", ajouter: "Add:",
    pleine: (m) => `Limit reached (${m}): remove a photo to add another.`,
    lbc: "Leboncoin only sends its free photos: the first ones of this list.",
    garde: "Keep at least one photo.", choisies: "chosen",
  },
};

export default function PhotosPlateforme({ platform, toutes, choix, onChange, T, lang = "fr" }) {
  const M = MOTS[lang === "en" ? "en" : "fr"];
  const max = photosMaxPlateforme(platform);
  const liste = useMemo(() => (toutes ?? []).filter(Boolean), [toutes]);
  const valide = choixValide(platform, choix, liste);
  const selection = valide ?? photosParDefaut(platform, liste);
  const perso = choixDifferent(platform, selection, liste);
  const [ouvert, setOuvert] = useState(false);
  const [alerte, setAlerte] = useState(null);
  const poser = (next) => { setAlerte(null); onChange(choixDifferent(platform, next, liste) ? next : null); };
  const drag = usePhotoDrag((from, to) => poser(moveItem(selection, from, to)));
  const restantes = liste.filter((u) => !selection.includes(u));
  if (liste.length < 2) return null; // une seule photo : rien à choisir

  const bouton = { minHeight: 36, padding: "0 12px", borderRadius: 999, fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: `1px solid ${T.border}`, background: T.chip, color: T.ink };
  const tuile = { aspectRatio: "1", borderRadius: 10, overflow: "hidden", position: "relative", background: "#fff", border: `1px solid ${T.border}` };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: T.mute2, fontWeight: 600, marginBottom: 4 }}>📷 {M.titre}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", borderRadius: 12, border: `1px solid ${T.border}`, background: T.chip }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ display: "flex" }}>
            {selection.slice(0, 4).map((u, i) => (
              <img key={u} src={u} alt="" style={{ width: 28, height: 28, borderRadius: 7, objectFit: "cover", border: "2px solid #fff", marginLeft: i ? -8 : 0 }} />
            ))}
          </div>
          <span style={{ fontSize: 13, color: T.ink, lineHeight: 1.3 }}>
            <b>{M.sur(selection.length, liste.length)}</b>{perso ? <span style={{ color: T.tealDeep }}> · {M.choisies}</span> : null}
          </span>
        </div>
        <button type="button" onClick={() => setOuvert((o) => !o)} style={bouton}>{ouvert ? M.fermer : M.choisir}</button>
      </div>
      {ouvert && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 12, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11.5, color: T.mute2, marginBottom: 8, lineHeight: 1.4 }}>
            {M.limite(NOMS[platform] ?? platform, max)}{platform === "leboncoin" ? ` — ${M.lbc}` : ""}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8 }}>
            {selection.map((u, i) => {
              const t = drag.tileProps(i);
              return (
                <div key={u} data-photo-idx={i} style={{ ...tuile, ...t.style }}>
                  <img src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                  {selection.length > 1 && <DragHandle bind={drag.handleProps(i)} />}
                  {i === 0 && selection.length > 1 && <CoverBadge lang={lang} />}
                  <button type="button" aria-label={lang === "en" ? "Remove" : "Retirer"}
                    onClick={() => (selection.length > 1 ? poser(selection.filter((x) => x !== u)) : setAlerte(M.garde))}
                    style={{ position: "absolute", top: 5, right: 5, width: 24, height: 24, borderRadius: "50%", background: "#F6F5F1", border: `1px solid ${T.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    <X size={12} color={T.ink} />
                  </button>
                </div>
              );
            })}
          </div>
          {restantes.length > 0 && (
            <>
              <div style={{ fontSize: 11.5, color: T.mute2, margin: "10px 0 6px", fontWeight: 600 }}>{M.ajouter}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))", gap: 6 }}>
                {restantes.map((u) => (
                  <button key={u} type="button" aria-label={lang === "en" ? "Add this photo" : "Ajouter cette photo"}
                    onClick={() => (selection.length < max ? poser([...selection, u]) : setAlerte(M.pleine(max)))}
                    style={{ ...tuile, padding: 0, cursor: "pointer", opacity: selection.length < max ? 1 : 0.45 }}>
                    <img src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.6, pointerEvents: "none" }} />
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Plus size={18} color={T.tealDeep} />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {alerte ? <div role="alert" style={{ fontSize: 12, color: "#B42318", fontWeight: 600, marginTop: 8 }}>{alerte}</div> : null}
          {perso ? <button type="button" onClick={() => poser(null)} style={{ ...bouton, marginTop: 10 }}>{M.toutes}</button> : null}
        </div>
      )}
    </div>
  );
}
