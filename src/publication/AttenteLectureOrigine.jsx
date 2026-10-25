// ═══════════════════════════════════════════════════════════════════════════
// « PUBLIER » SUR UNE FICHE PAS ENCORE LUE : QUELQUES SECONDES, JAMAIS UNE IMPASSE (25/10/2026, Jocabroc)
// ═══════════════════════════════════════════════════════════════════════════
// La méthode décidée par Nico le 25/10 : « la fiche doit être COMPLÈTE dès l'import, pour qu'au clic « Publier »
// il n'y ait aucune attente » — l'extension lit chaque annonce importée en arrière-plan (lecture de fond,
// _shared/lecture-fond.js). Cet écran n'est que le DERNIER RECOURS, pour une fiche pas encore lue : il lit
// l'annonce tout de suite (page publique, extension ≥ 0.6.144 : une à deux secondes), ouvre le stepper dès
// qu'elle est lue, et ne propose jamais d'écrire à la place du vendeur — « Écrire ma description » n'existe que
// si l'annonce d'origine n'en a VRAIMENT aucune (le stepper s'ouvre alors avec cette précision).
// Avant (audit du 25/10, E1) : une bulle de 7 s puis rien — aucun écran, aucun job ; Jocabroc a cliqué
// « Publier » sur ses fiches Vinted importées le 25/10 (11:43, 13:20…) et rechargé huit fois sa page en 16 min.
// Ici :
//   · une lecture tout de suite, puis toutes les 6 s, 5 min au plus, onglet visible (utils/relectureBornee),
//     une à la fois ; la règle relue en base (lectureOrigine) ouvre le stepper dès qu'elle ne retient plus ;
//   · ce qui se passe, dit en clair (extension absente de cet appareil, page à recharger après une mise à jour) ;
//   · « Fermer » laisse la lecture continuer en arrière-plan ;
//   · chaque attente abandonnée est signalée au serveur (utils/actionRatee) — plus jamais un échec invisible.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { demarrerRelecture } from "../utils/relectureBornee";
import { attenteLectureOrigine, messageLectureOrigine } from "./lectureOrigine";
import { completerTexteDuVendeur } from "./texteDuVendeur";
import { signalerActionRatee } from "../utils/actionRatee";
import { depuisEnMots, RELECTURE_ATTENTE_MS, RELECTURE_ATTENTE_MAX_MS } from "./attenteLectureRegles";

export default function AttenteLectureOrigine({
  item, lang = "fr", supabase, userId, extensionVinted = false, lireEbay = null, delaiDetailMs = undefined,
  attenteInitiale = null, onPret, onFermer,
}) {
  const en = lang === "en";
  const [depuis] = useState(() => Date.now());
  const [horloge, setHorloge] = useState(() => Date.now());
  const [attente, setAttente] = useState(attenteInitiale);
  const [pontMort, setPontMort] = useState(false);
  const fini = useRef(false);
  const enLecture = useRef(false);
  const dernierItem = useRef(item);
  const derniereNote = useRef(null);

  // Horloge d'AFFICHAGE seulement (aucune lecture de base).
  useEffect(() => {
    const t = setInterval(() => setHorloge(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!supabase || !userId || item?.id == null) return undefined;
    const pret = async () => {
      if (fini.current) return;
      fini.current = true;
      let relu = dernierItem.current;
      try {
        const { data } = await supabase.from("inventaire").select("description").eq("id", item.id).eq("user_id", userId).maybeSingle();
        if (data && typeof data.description === "string" && data.description.trim()) relu = { ...relu, description: data.description };
      } catch { /* le stepper relit de toute façon la fiche */ }
      onPret?.(relu, { note: derniereNote.current });
    };
    const r = demarrerRelecture(async () => {
      if (fini.current) return true;
      if (extensionVinted && !enLecture.current) {
        enLecture.current = true;
        try {
          const res = await completerTexteDuVendeur(dernierItem.current, { supabase, userId, extensionVinted, lireEbay, delaiDetailMs });
          if (res?.item) dernierItem.current = res.item;
          derniereNote.current = res?.note ?? null;
          if (res?.note === "pont_mort") setPontMort(true);
        } catch { /* la relecture suivante réessaie */ }
        finally { enLecture.current = false; }
      }
      let a;
      try { a = await attenteLectureOrigine(supabase, userId, item.id); } catch { return false; }
      if (!a) { await pret(); return true; }
      setAttente(a);
      return true;
    }, { intervalleMs: RELECTURE_ATTENTE_MS, maxMs: RELECTURE_ATTENTE_MAX_MS, immediat: true });
    return () => r.arreter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, userId, item?.id, extensionVinted]);

  const ecoule = Math.max(0, horloge - depuis);

  const fermer = () => {
    if (!fini.current) {
      signalerActionRatee({ action: "publier", motif: "lecture_origine_abandonnee", userId,
        details: { fiche: item?.id ?? null, attendu_s: Math.round(ecoule / 1000), pont_mort: pontMort, extension: extensionVinted, manque: (attente?.manque ?? []).join(","), note: derniereNote.current } });
    }
    fini.current = true;
    onFermer?.();
  };

  const bouton = (fond, encre, bord) => ({ flex: 1, minWidth: 140, padding: "10px 14px", borderRadius: 10, border: bord ? `1px solid ${bord}` : "none", background: fond, color: encre, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" });
  const contenu = (
    <div role="dialog" aria-modal="true" onClick={fermer}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 460, padding: "22px 20px", boxShadow: "0 12px 40px rgba(0,0,0,0.18)", fontFamily: "inherit" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#0D0D0D", marginBottom: 8 }}>
          {en ? "Reading your original listing…" : "Lecture de ton annonce d'origine…"}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: "#374151" }}>
          {messageLectureOrigine(attente ?? { plateforme: "vinted" }, en ? "en" : "fr", "preparation")}
        </div>
        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 10 }}>
          {pontMort
            ? (en ? "Your extension can't be reached from this page (it was just updated): reload the page."
              : "Ton extension ne répond plus à cette page (elle vient d'être mise à jour) : recharge la page.")
            : !extensionVinted
              ? (en ? "The FillSell extension isn't on this device: the reading is done by your computer, in the background. Close this, and publish once it's read."
                : "L'extension FillSell n'est pas sur cet appareil : la lecture se fait depuis ton ordinateur, en arrière-plan. Ferme, et publie dès qu'elle est lue.")
              : (en ? `In progress for ${depuisEnMots(ecoule)} — the publishing screen opens as soon as it is read.`
                : `En cours depuis ${depuisEnMots(ecoule)} — l'écran de publication s'ouvre dès qu'elle est lue.`)}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {pontMort ? (
            <button type="button" onClick={() => { try { window.location.reload(); } catch { /* rien */ } }}
              style={bouton("#ECFDF5", "#065F46", "#A7F3D0")}>
              {en ? "Reload the page" : "Recharger la page"}
            </button>
          ) : null}
          <button type="button" onClick={fermer} style={{ ...bouton("#fff", "#374151", "#E5E7EB"), fontWeight: 600 }}>
            {en ? "Close (reading continues)" : "Fermer (la lecture continue)"}
          </button>
        </div>
      </div>
    </div>
  );
  try { return createPortal(contenu, document.body); } catch { return contenu; }
}
