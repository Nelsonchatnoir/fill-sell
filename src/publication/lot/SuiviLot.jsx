// ═══════════════════════════════════════════════════════════════════════════
// LE SUIVI D'UN LOT — ce qui demande un geste d'abord, puis le reste
// ═══════════════════════════════════════════════════════════════════════════
// Une ligne par ARTICLE (ses plateformes en pastilles), dans l'ordre : à faire,
// en cours, dans la file, pas parties, en ligne, arrêtées. Lecture seule, sauf
// deux gestes : « Retirer du lot » (un article) et « Arrêter ce qui n'est pas
// parti » (tout le lot) — jamais un dépôt déjà commencé, et c'est dit.
// Les données sont celles du Stock (relues toutes les 20 s) : aucune requête
// de plus, le suivi survit à un rechargement (identifiant du lot sur les jobs).
import { useEffect, useMemo, useRef, useState } from "react";
import { Coque } from "../../components/FeuilleActivite";
import GalleryPhoto, { premierePhoto } from "../../components/GalleryPhoto";
import PlatformLogo from "../../components/platform-logos/PlatformLogo";
import BarreProgression from "../../components/BarreProgression";
import { NOM } from "../texte";
import { suiviDuLot, depotArretable } from "./regles";
import { arreterDepots, reArreter } from "./arretLot";

const GROUPES = {
  fr: { geste: "À faire", en_cours: "En cours", file: "Dans la file", pas_parties: "Pas parties", en_ligne: "En ligne", arretees: "Arrêtées à ta demande" },
  en: { geste: "To do", en_cours: "Under way", file: "In the queue", pas_parties: "Not sent", en_ligne: "Live", arretees: "Stopped by you" },
};
const ETAT_PASTILLE = {
  fr: { en_ligne: "en ligne", en_cours: "en cours", file: "dans la file", geste: "attend un geste", pas_partie: "pas partie", arretee: "arrêtée" },
  en: { en_ligne: "live", en_cours: "under way", file: "queued", geste: "needs you", pas_partie: "not sent", arretee: "stopped" },
};

/**
 * @param lot        { id, le }
 * @param jobs       les jobs du lot (lus par le Stock)
 * @param articles   Map String(id) → article (forme mapItem)
 * @param renderGeste (job) => bouton du geste (le même que la file des jobs du Stock)
 * @param arretesIci ids arrêtés depuis cet appareil ; onArretes(ids) les ajoute
 */
export default function SuiviLot({ lang, lot, jobs, articles, renderGeste, userId, supabase, onFermer, arretesIci, onArretes, onPatchJobs }) {
  const en = lang === "en";
  const G = GROUPES[en ? "en" : "fr"];
  const E = ETAT_PASTILLE[en ? "en" : "fr"];
  const suivi = useMemo(() => suiviDuLot(jobs), [jobs]);
  const [confirmerTout, setConfirmerTout] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState(null);

  // Le filet du trou serveur (cf. arretLot.js) : un dépôt arrêté ici que
  // l'écriture tardive d'une ancienne boucle de l'extension a fait revenir
  // est refermé, sans geste.
  const reArretVu = useRef(new Set());
  useEffect(() => {
    const revenus = (jobs ?? []).filter((j) => (arretesIci ?? []).includes(j.id) && (j.status === "pending" || j.status === "needs_user") && !reArretVu.current.has(`${j.id}:${j.status}`));
    if (!revenus.length) return;
    for (const j of revenus) reArretVu.current.add(`${j.id}:${j.status}`);
    reArreter(supabase, { userId, jobs: revenus, arretesIci }).then((ids) => {
      if (ids.length) onPatchJobs?.(ids.map((id) => ({ id, status: "cancelled", arret: true })));
    });
  }, [jobs, arretesIci, supabase, userId, onPatchJobs]);

  const arretablesTout = (jobs ?? []).filter(depotArretable);
  const enVolTout = (jobs ?? []).filter((j) => j.status === "processing").length;

  async function arreter(cibles, cle) {
    if (!cibles.length || occupe) return;
    setOccupe(cle);
    setMessage(null);
    try {
      const { arretes, enVol } = await arreterDepots(supabase, { userId, jobs: cibles });
      if (arretes.length) {
        onArretes?.(arretes);
        onPatchJobs?.(arretes.map((id) => ({ id, status: "cancelled", arret: true })));
      }
      setMessage(en
        ? `${arretes.length} listing${arretes.length > 1 ? "s" : ""} stopped — nothing was published for ${arretes.length > 1 ? "them" : "it"}.${enVol ? ` ${enVol} already under way will finish.` : ""}`
        : `${arretes.length} annonce${arretes.length > 1 ? "s" : ""} arrêtée${arretes.length > 1 ? "s" : ""} — rien n'a été publié pour ${arretes.length > 1 ? "elles" : "elle"}.${enVol ? ` ${enVol > 1 ? `${enVol} déjà en cours iront` : "1 déjà en cours ira"} au bout.` : ""}`);
    } catch (e) {
      setMessage(en ? "Couldn't stop them right now: try again in a moment." : "Impossible d'arrêter pour l'instant : réessaie dans un instant.");
      console.warn("[lot] arrêt :", e?.message ?? e);
    } finally {
      setOccupe(false);
      setConfirmerTout(false);
    }
  }

  const d = new Date(lot?.le ?? "");
  const quand = Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(en ? "en-GB" : "fr-FR", { day: "numeric", month: "long" }) + ", " + d.toLocaleTimeString(en ? "en-GB" : "fr-FR", { hour: "2-digit", minute: "2-digit" });
  const fraction = suivi.annonces ? suivi.annoncesEnLigne / suivi.annonces : 0;

  const pied = (
    <>
      {message && <div style={{ fontSize: 12.5, color: "#1B6E62", lineHeight: 1.45 }}>{message}</div>}
      {arretablesTout.length > 0 && (
        confirmerTout ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12.5, color: "#3A4742", lineHeight: 1.45 }}>
              {en
                ? `${arretablesTout.length} listing${arretablesTout.length > 1 ? "s" : ""} not started will be stopped. What's online stays online${enVolTout ? `; ${enVolTout} under way will finish` : ""}.`
                : `${arretablesTout.length} annonce${arretablesTout.length > 1 ? "s" : ""} pas encore commencée${arretablesTout.length > 1 ? "s" : ""} ${arretablesTout.length > 1 ? "seront arrêtées" : "sera arrêtée"}. Ce qui est en ligne reste en ligne${enVolTout ? ` ; ${enVolTout > 1 ? `${enVolTout} en cours iront` : "1 en cours ira"} au bout` : ""}.`}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => arreter(arretablesTout, "tout")} disabled={Boolean(occupe)}
                style={{ flex: 1, minHeight: 44, borderRadius: 999, border: "1px solid #EBC9C2", background: "#FBEFEC", color: "#9B5148", fontWeight: 700, fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
                {occupe === "tout" ? (en ? "Stopping…" : "Arrêt…") : (en ? "Stop them" : "Arrêter")}
              </button>
              <button type="button" onClick={() => setConfirmerTout(false)}
                style={{ flex: 1, minHeight: 44, borderRadius: 999, border: "1px solid #E7E3D8", background: "#fff", color: "#3A4742", fontWeight: 600, fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
                {en ? "Let it run" : "Laisser continuer"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmerTout(true)}
            style={{ minHeight: 44, borderRadius: 999, border: "1px solid #E7E3D8", background: "#fff", color: "#3A4742", fontWeight: 600, fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
            {en ? `Stop what hasn't started (${arretablesTout.length})` : `Arrêter ce qui n'est pas parti (${arretablesTout.length})`}
          </button>
        )
      )}
    </>
  );

  let groupeCourant = null;
  return (
    <Coque lang={lang} onFermer={onFermer}
      titre={en ? `Batch of ${quand}` : `Lot du ${quand}`}
      sousTitre={en
        ? `${suivi.articles} item${suivi.articles > 1 ? "s" : ""} · ${suivi.annoncesEnLigne} of ${suivi.annonces} listings live`
        : `${suivi.articles} article${suivi.articles > 1 ? "s" : ""} · ${suivi.annoncesEnLigne} annonce${suivi.annoncesEnLigne > 1 ? "s" : ""} en ligne sur ${suivi.annonces}`}
      enTete={<div style={{ marginTop: 8 }}><BarreProgression seulePiste fraction={fraction} pas={suivi.annonces ? 1 / suivi.annonces : 1} etat={suivi.fini ? "termine" : "en_cours"} lang={lang} /></div>}
      pied={pied}>
      {suivi.lignes.map((l) => {
        const item = articles?.get?.(String(l.inventaireId)) ?? null;
        const titreGroupe = l.groupe !== groupeCourant ? G[l.groupe] : null;
        groupeCourant = l.groupe;
        const arretables = l.pastilles.map((p) => p.job).filter(depotArretable);
        const gestes = l.pastilles.filter((p) => p.etat === "geste");
        const raisons = l.pastilles.filter((p) => p.etat === "pas_partie" && p.job?.error).map((p) => `${NOM(p.platform)} : ${String(p.job.error).split(" — ")[0]}`);
        return (
          <div key={l.inventaireId}>
            {titreGroupe && <div className="fsl-groupe-t">{titreGroupe} · {suivi.compte[l.groupe]}</div>}
            <div style={{ background: "#fff", border: `1px solid ${l.groupe === "geste" ? "#EED9A6" : "#E7E3D8"}`, borderRadius: 14, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "#F2F0E9" }}>
                  <GalleryPhoto url={premierePhoto(item?.photos)} alt="" fallback={<span aria-hidden="true">📦</span>} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#10201B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item?.title ?? item?.titre ?? (en ? "Item" : "Article")}</div>
                  <div style={{ fontSize: 11.5, color: "#5C6560" }}>
                    {l.pastilles.map((p) => `${NOM(p.platform)} ${E[p.etat] ?? ""}`).join(" · ")}
                  </div>
                </div>
                <div className="fsl-pastilles" aria-hidden="true">
                  {l.pastilles.map((p) => (
                    <span key={p.platform} className={`fsl-pastille fsl-pastille--${p.etat}`} title={`${NOM(p.platform)} — ${E[p.etat] ?? ""}`}>
                      <PlatformLogo platform={p.platform} size={14} />
                    </span>
                  ))}
                </div>
              </div>
              {raisons.length > 0 && <div style={{ fontSize: 12, color: "#5C6560", lineHeight: 1.45 }}>{raisons.join(" · ")}</div>}
              {gestes.map((p) => (
                <div key={`g:${p.platform}`} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "#8A6100", lineHeight: 1.4 }}>{NOM(p.platform)} : {String(p.job?.error ?? (en ? "waiting for you" : "attend un geste de ta part")).split(" — ")[0]}</span>
                  {renderGeste ? renderGeste(p.job) : null}
                </div>
              ))}
              {arretables.length > 0 && (
                <button type="button" className="fsl-retirer" style={{ alignSelf: "flex-start" }} disabled={Boolean(occupe)}
                  onClick={() => arreter(arretables, l.inventaireId)}>
                  {occupe === l.inventaireId ? (en ? "Stopping…" : "Arrêt…") : (en ? "Remove from the batch" : "Retirer du lot")}
                </button>
              )}
            </div>
          </div>
        );
      })}
      {!suivi.lignes.length && <div style={{ fontSize: 13, color: "#5C6560", padding: 12 }}>{en ? "Nothing in this batch yet." : "Rien dans ce lot pour l'instant."}</div>}
    </Coque>
  );
}
