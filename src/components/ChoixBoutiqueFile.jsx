// ═══════════════════════════════════════════════════════════════════════════
// LA BOUTIQUE D'UNE PUBLICATION VINTED, DITE ET CHANGEABLE DANS LA FILE
// (15/10 soir, Louis — Nico : « la file affiche sur quelle boutique ça part et
// permet de la changer, mais rien ne bloque »)
// ═══════════════════════════════════════════════════════════════════════════
// Seulement pour une PUBLICATION Vinted d'un article SANS boutique, chez un
// compte à plusieurs boutiques confirmées. Même règle que le serveur
// (_shared/boutique-publication-vinted.js) : choix fait ici, sinon boutique
// par défaut des Réglages, sinon boutique ouverte dans le navigateur. Le
// changement s'écrit sur le job encore en file (vinted_boutique_choisie) ;
// get-pending-jobs le relit au service, l'extension relit la boutique ouverte
// avant le dépôt — jamais une boutique hors du compte.
import { useState } from "react";
import { boutiquePublicationVinted, boutiquesConfirmees, loginBoutique } from "../../supabase/functions/_shared/boutique-publication-vinted.js";

const pfDe = (j) => (j?.platform_fields && typeof j.platform_fields === "object" ? j.platform_fields : {});

/** La boutique prévue d'un job, ou null quand la ligne n'en dit rien (pure). */
export function boutiquePrevue(job, boutiques, defaut) {
  if (job?.platform !== "vinted" || job?.action !== "publish") return null;
  if (!["pending", "needs_user"].includes(job?.status)) return null;
  const liste = boutiquesConfirmees(boutiques?.liste);
  if (liste.length < 2) return null;
  const o = boutiques?.origines instanceof Map ? boutiques.origines.get(String(job.inventaire_id)) : null;
  if (o && String(o).trim()) return null; // article lié : sa boutique, rien à choisir
  const pf = pfDe(job);
  const session = boutiques?.connectee?.fraiche === false ? null : (boutiques?.connectee?.userId ?? null);
  const r = pf.vinted_account_id && !pf.vinted_boutique_auto
    ? { boutique: String(pf.vinted_account_id), source: "job" }
    : boutiquePublicationVinted({ boutiqueChoisie: pf.vinted_boutique_choisie ?? null, boutiqueDefaut: defaut ?? null, boutiqueSession: session, boutiques: liste });
  return { ...r, liste, changeable: !(pf.vinted_account_id && !pf.vinted_boutique_auto) };
}

const SOURCES = {
  fr: { choix: "choisie par toi", defaut: "ta boutique par défaut", session: "ouverte dans ton navigateur", job: "boutique de l'envoi" },
  en: { choix: "chosen by you", defaut: "your default shop", session: "open in your browser", job: "shop of this send" },
};

export default function ChoixBoutiqueFile({ job, prevue, supabase, lang = "fr", onChange = null }) {
  const fr = lang !== "en";
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState(null);
  if (!prevue) return null;
  const login = prevue.boutique ? loginBoutique(prevue.boutique, prevue.liste) : null;
  const libelle = prevue.boutique
    ? (fr ? `Part sur @${login ?? prevue.boutique} · ${SOURCES.fr[prevue.source] ?? ""}` : `Goes to @${login ?? prevue.boutique} · ${SOURCES.en[prevue.source] ?? ""}`)
    : (fr ? "Part sur la boutique ouverte dans ton navigateur au moment de l'envoi" : "Goes to the shop open in your browser when it is sent");
  const changer = async (id) => {
    if (!supabase || !id || enCours) return;
    setEnCours(true); setMsg(null);
    const b = prevue.liste.find((x) => x.user_id === id);
    const pf = { ...pfDe(job), vinted_boutique_choisie: b?.login ? `@${b.login}` : id, vinted_account_id: id,
      vinted_boutique_auto: { source: "choix", le: new Date().toISOString(), pose_par: "app (file)" } };
    const { data, error } = await supabase.from("cross_post_jobs").update({ platform_fields: pf })
      .eq("id", job.id).in("status", ["pending", "needs_user"]).select("id");
    setEnCours(false);
    if (error || !data?.length) { setMsg(fr ? "Déjà parti ou modifié entre-temps." : "Already sent or changed meanwhile."); return; }
    onChange?.(job.id, pf);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11.5, color: "#5C6560", minWidth: 0 }}>
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{libelle}</span>
      {prevue.changeable && (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{fr ? "Changer de boutique" : "Change shop"}</span>
          <select value="" disabled={enCours} onChange={(e) => changer(e.target.value)}
            style={{ fontSize: 12, fontFamily: "inherit", padding: "4px 6px", borderRadius: 8, border: "1px solid #E7E3D8", background: "#fff", color: "#1B6E62", fontWeight: 600, minHeight: 32 }}>
            <option value="" disabled>{fr ? "Changer…" : "Change…"}</option>
            {prevue.liste.map((b) => <option key={b.user_id} value={b.user_id}>{b.login ? `@${b.login}` : b.user_id}</option>)}
          </select>
        </label>
      )}
      {msg && <span style={{ color: "#8A6100" }}>{msg}</span>}
    </div>
  );
}
