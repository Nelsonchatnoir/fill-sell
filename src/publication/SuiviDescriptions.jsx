// ═══════════════════════════════════════════════════════════════════════════
// LE SUIVI DES DESCRIPTIONS ET LE BANDEAU « DESCRIPTION PRÊTE » (15/11/2026, point 3 de Nico — maquette validée)
// ═══════════════════════════════════════════════════════════════════════════
// Monté UNE fois par App (il survit au changement d'onglet, au contraire du Stock). Il relit les fiches suivies
// (fermées pendant la lecture de leur description d'origine) et ne fait que changer leur état — « Lecture… »,
// « Prêt à publier », « Description introuvable » — : AUCUNE fenêtre ne s'ouvre, aucun écran ne change. Quand une
// fiche devient prête, un bandeau discret paraît au-dessus de la barre d'onglets et part seul (BANDEAU_MS) ; jamais
// par-dessus un écran de publication ou une modale (il attend qu'elle se ferme). Un TOUCHER sur le bandeau pose une
// demande (descriptionsSuivies.demanderOuverture) et amène au Stock, qui ouvre la publication déjà remplie.
// Relecture : utils/relectureBornee (jamais de setInterval qui relit la base), une boucle pour toutes les fiches,
// mêmes règles qu'avant (attenteLectureRegles.decisionReprise : description RÉELLEMENT en base, 5 min au plus).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Upload } from "lucide-react";
import { demarrerRelecture } from "../utils/relectureBornee";
import { attenteLectureOrigine, tracerRecuperation } from "./lectureOrigine";
import { decisionReprise, RELECTURE_REPRISE_MS } from "./attenteLectureRegles";
import { plateformeOrigine, texteSuffisant } from "../../supabase/functions/_shared/contenu-fiche.js";
import { signalerActionRatee } from "../utils/actionRatee";
import {
  useSuivis, lireSuivis, marquer, oublier, etatApresDecision, contenuBandeau, bandeauPermis, BANDEAU_MS, demanderOuverture, viderSuivis,
} from "./descriptionsSuivies";

const modaleOuverteMaintenant = () => typeof document !== "undefined" && document.documentElement.classList.contains("fs-modale-ouverte");

export default function SuiviDescriptions({ supabase, userId, lang = "fr", onOuvrirStock }) {
  const etat = useSuivis();
  const enLecture = etat.suivis.filter((s) => s.etat === "lecture").map((s) => s.id).join(",");

  // Un autre compte : rien de l'ancien ne reste suivi.
  const compte = useRef(userId);
  useEffect(() => {
    if (compte.current !== userId) { compte.current = userId; viderSuivis(); }
  }, [userId]);
  // Déconnexion (App ne monte le suivi qu'avec un compte) : rien ne survit pour le compte suivant.
  useEffect(() => () => viderSuivis(), []);

  // ── LA RELECTURE : une boucle bornée pour toutes les fiches « Lecture… » ──────────────────────────────────────
  useEffect(() => {
    if (!enLecture || !supabase || !userId) return undefined;
    let finie = false;
    const r = demarrerRelecture(async () => {
      if (finie) return true;
      const enCours = lireSuivis().suivis.filter((s) => s.etat === "lecture");
      let rate = false;
      for (const s of enCours) {
        const item = s.item;
        let a;
        try { a = await attenteLectureOrigine(supabase, userId, item.id); } catch { rate = true; continue; }
        let relu = item;
        let descriptionLue = false;
        if (!a) {
          const { data, error } = await supabase.from("inventaire").select("description").eq("id", item.id).eq("user_id", userId).maybeSingle();
          if (error) { rate = true; continue; }
          // (19/11/2026 soir, point 7 de Nico — compte 3f91c02e, 16:18) La FICHE N'EXISTE PLUS (supprimée par la personne
          // pendant la lecture : 16:13:10 « publier », 16:13:40 article supprimé) : plus rien à suivre ni à publier — le suivi
          // l'oublie, sans « Description introuvable » ni action ratée (avant : 5 min d'attente sur une fiche disparue, puis
          // « lecture_origine_non_aboutie », carte introuvable — une fausse panne).
          if (!data) {
            oublier(s.id);
            tracerRecuperation(supabase, userId, { issue: "reprise_fiche_supprimee", fiche: item.id, plateforme: plateformeOrigine(item) ?? null,
              duree_ms: Math.max(0, Date.now() - s.depuis), sans_ouverture: true });
            continue;
          }
          if (data && texteSuffisant(data.description)) { relu = { ...item, description: data.description }; descriptionLue = true; }
        }
        // (15/11) Rien ne s'ouvre jamais d'ici : « occupé » (un écran de publication ouvert) n'a plus d'objet — la
        // fiche devient prête, la personne la touche quand elle le veut.
        const d = decisionReprise({ attente: a, descriptionLue, ecouleMs: Date.now() - s.depuis, occupe: false });
        if (d === "attendre") continue;
        if (finie) return true;
        marquer(s.id, etatApresDecision(d), { item: relu });
        tracerRecuperation(supabase, userId, { issue: `reprise_${d}`, fiche: item.id, plateforme: a?.plateforme ?? plateformeOrigine(item) ?? null,
          duree_ms: Math.max(0, Date.now() - s.depuis), motif: a?.conclusion ?? null, sans_ouverture: true });
        if (d === "expiree") {
          signalerActionRatee({ action: "publier", motif: "lecture_origine_non_aboutie", userId,
            details: { fiche: item.id, attendu_s: Math.round((Date.now() - s.depuis) / 1000), manque: (a?.manque ?? []).join(","), carte: "introuvable" } });
        }
      }
      return !rate;
    }, { intervalleMs: RELECTURE_REPRISE_MS, maxMs: 30_000, immediat: true });
    return () => { finie = true; r.arreter(); };
  }, [enLecture, supabase, userId]);

  // ── LE BANDEAU : à chaque fiche qui devient prête, jamais par-dessus une publication ou une modale ─────────────
  const [modaleOuverte, setModaleOuverte] = useState(modaleOuverteMaintenant);
  useEffect(() => {
    if (typeof MutationObserver === "undefined" || typeof document === "undefined") return undefined;
    const o = new MutationObserver(() => setModaleOuverte(modaleOuverteMaintenant()));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => o.disconnect();
  }, []);
  const permis = bandeauPermis({ ecranPublication: etat.ecranPublication, modaleOuverte });
  // Une nouvelle fiche prête (annonce) et le droit de paraître : le bandeau se montre (état ajusté pendant le rendu,
  // comme BarreJobCarte) ; il part seul BANDEAU_MS après la DERNIÈRE fiche devenue prête.
  const [vue, setVue] = useState({ annonce: 0, montre: false });
  if (permis && etat.annonce > vue.annonce) setVue({ annonce: etat.annonce, montre: true });
  useEffect(() => {
    if (!vue.montre) return undefined;
    const t = setTimeout(() => setVue((v) => ({ ...v, montre: false })), BANDEAU_MS);
    return () => clearTimeout(t);
  }, [vue.montre, vue.annonce]);

  const contenu = vue.montre && permis ? contenuBandeau(etat.suivis, lang) : null;
  if (!contenu) return null;
  const toucher = () => {
    setVue((v) => ({ ...v, montre: false }));
    demanderOuverture(contenu.mode === "un" ? { type: "un", id: contenu.id } : { type: "voir" });
    onOuvrirStock?.();
  };
  const bandeau = (
    <div role="status" aria-live="polite" data-bandeau-description={contenu.mode} onClick={toucher} className="fs-bandeau-desc"
      style={{
        position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "var(--nav-float-bottom)", zIndex: 500,
        width: "calc(100vw - 32px)", maxWidth: 460, boxSizing: "border-box", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 12, padding: "10px 10px 10px 12px", borderRadius: 14,
        background: "#1B6E62", color: "#FFFFFF", boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        fontFamily: "'Space Grotesk',-apple-system,BlinkMacSystemFont,sans-serif",
      }}>
      <style>{"@keyframes fsBandeauDesc{from{opacity:0}to{opacity:1}}.fs-bandeau-desc{animation:fsBandeauDesc .22s ease-out}@media (prefers-reduced-motion: reduce){.fs-bandeau-desc{animation:none!important}}"}</style>
      {contenu.vignettes.length ? (
        <span aria-hidden="true" style={{ display: "flex", flexShrink: 0 }}>
          {contenu.vignettes.map((v, k) => (
            <img key={`${v}-${k}`} src={v} alt="" style={{ width: 36, height: 36, borderRadius: 9, objectFit: "cover", marginLeft: k ? -14 : 0, boxShadow: "0 0 0 2px #1B6E62", position: "relative", zIndex: contenu.vignettes.length - k, background: "#2F9E90" }} />
          ))}
        </span>
      ) : null}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, lineHeight: "18px", fontWeight: 700 }}>{contenu.titre}</span>
        <span style={{ display: "block", fontSize: 12, lineHeight: "16px", fontWeight: 500, color: "rgba(255,255,255,0.78)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contenu.sousTitre}</span>
      </span>
      <button type="button" onClick={(e) => { e.stopPropagation(); toucher(); }}
        style={{
          flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 10,
          border: "none", background: "#FFFFFF", color: "#1B6E62", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
        }}>
        {contenu.mode === "un" ? <Upload size={15} strokeWidth={2.4} aria-hidden="true" /> : null}{contenu.action}
      </button>
    </div>
  );
  try { return createPortal(bandeau, document.body); } catch { return bandeau; }
}
