// ═══════════════════════════════════════════════════════════════════════════
// LA FENÊTRE AVANT DE CHANGER DE FORMULE PENDANT UN ESSAI, OU EN PERDANT LE CLOUD (14/11/2026, bloc F — Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Le serveur (create-checkout-session, changer-formule) n'a RIEN changé : il rend un devis exact (aperçu de facture
// Stripe). La personne voit, avant tout geste d'argent :
//   · « Ton essai gratuit s'arrête : tu seras débité maintenant de X € » (essai) ou « Tu seras débité maintenant de X € » ;
//   · si elle a le Cloud et choisit une formule sans Cloud : la même formule « + Cloud » à son vrai prix, en premier, et
//     la formule seule marquée « Sans Cloud : tu ne pourras plus publier sans ordinateur » ;
//   · « Garder ma formule » : rien ne change.
// Pur affichage : les choix remontent par onChoisir(formule) / onAnnuler(). Textes FR + EN ici (une seule fenêtre).
import { useEffect, useRef } from "react";

import { textesFenetre } from "../lib/changementFormuleTextes.js";

export default function FenetreChangementFormule({ devis, lang = "fr", occupe = false, onChoisir, onAnnuler }) {
  const T = textesFenetre(devis, lang);
  const premier = useRef(null);
  useEffect(() => { premier.current?.focus?.(); }, []);
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape" && !occupe) onAnnuler?.(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [occupe, onAnnuler]);
  if (!devis || !Number.isFinite(devis.montant_centimes)) return null;
  const bouton = { width: "100%", minHeight: 48, borderRadius: 12, fontSize: 16, fontWeight: 600, padding: "12px 14px", textAlign: "left", cursor: occupe ? "wait" : "pointer", fontFamily: "inherit" };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="fcf-titre" translate="no" className="notranslate"
      style={{ position: "fixed", inset: 0, zIndex: 10050, background: "rgba(10,12,20,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget && !occupe) onAnnuler?.(); }}>
      <div data-fenetre-changement-formule="" style={{ width: "100%", maxWidth: 480, background: "var(--fs-card, #fff)", color: "var(--fs-ink, #111)", borderRadius: "18px 18px 0 0", padding: "20px 16px calc(16px + env(safe-area-inset-bottom))", boxShadow: "0 -8px 30px rgba(0,0,0,.25)" }}>
        <h2 id="fcf-titre" style={{ margin: "0 0 8px", fontSize: 20 }}>{T.titre}</h2>
        <p data-fcf-phrase="" style={{ margin: "0 0 14px", fontSize: 16, lineHeight: 1.4 }}>{T.choixCloud ? (T.choixCloudPhrase ?? T.phrase) : T.phrase}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {T.choixCloud && (
            <button ref={premier} type="button" disabled={occupe} data-fcf-choix="cloud" onClick={() => onChoisir?.(devis.alternative.formule)}
              style={{ ...bouton, border: "none", background: "var(--fs-accent, #1f7a6d)", color: "#fff" }}>
              {T.choixCloud}
              <div style={{ fontSize: 13, fontWeight: 400, marginTop: 3, opacity: .92 }}>{T.choixCloudPourquoi}</div>
            </button>
          )}
          <button ref={T.choixCloud ? null : premier} type="button" disabled={occupe} data-fcf-choix="seule" onClick={() => onChoisir?.(devis.formule)}
            style={{ ...bouton, border: T.choixCloud ? "1px solid var(--fs-border, #ccc)" : "none", background: T.choixCloud ? "transparent" : "var(--fs-accent, #1f7a6d)", color: T.choixCloud ? "inherit" : "#fff" }}>
            {T.choixSeul}
            {T.avertissementSansCloud && <div data-fcf-sans-cloud="" style={{ fontSize: 13, fontWeight: 600, marginTop: 3, color: "var(--fs-warn, #b45309)" }}>{T.avertissementSansCloud}</div>}
          </button>
          <button type="button" disabled={occupe} data-fcf-choix="garder" onClick={() => onAnnuler?.()}
            style={{ ...bouton, border: "none", background: "transparent", color: "inherit", textAlign: "center" }}>
            {T.garder}
            <div style={{ fontSize: 13, fontWeight: 400, marginTop: 2, opacity: .8 }}>{T.garderPourquoi}</div>
          </button>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 13, opacity: .8, lineHeight: 1.4 }}>{T.pied}</p>
      </div>
    </div>
  );
}
