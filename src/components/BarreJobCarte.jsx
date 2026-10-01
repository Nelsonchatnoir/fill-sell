// ═══════════════════════════════════════════════════════════════════════════
// LA BARRE COMPACTE D'UNE CARTE DU STOCK (chantier clarté, 01/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// UNE barre par job, en bas de la carte qui porte déjà la photo et le titre :
// pas de vignette ici. Le Stock décide QUAND elle paraît (mêmes conditions
// qu'avant : un travail réel, jamais une attente déguisée) ; elle, dit OÙ en
// est le job, en mots courts, et un tap ouvre la file complète.
// Quand le travail se termine, elle reste quelques secondes pour finir en
// douceur jusqu'à 100 % et la coche — puis la pastille de la carte reprend.
import { useEffect, useState } from "react";
import BarreProgression from "./BarreProgression";
import { pisteJob } from "../utils/barresJobs";

const DUREE_FIN_MS = 5000;
const COURT = { vinted: "Vinted", leboncoin: "LBC", beebs: "Beebs", ebay: "eBay", opla: "Opla" };

function phrasesCourtes(piste, job, lang) {
  const fr = lang !== "en";
  const pf = COURT[job.platform] ?? job.platform;
  const court = piste.etapes?.find((e) => e.cle === piste.etape)?.court ?? "";
  const fin = job.action === "delete" ? (fr ? "Retirée" : "Removed")
    : job.action === "republish" ? (fr ? "De retour en ligne" : "Back online")
    : (fr ? "En ligne" : "Online");
  return {
    phrase: `${pf} · ${court}`,
    phraseFin: `${pf} · ${fin}`,
    phrasePause: `${pf} · ${fr ? "En attente" : "Waiting"}`,
    phraseEchec: `${pf} · ${piste.ton === "neutre" ? (fr ? "Annulée" : "Cancelled") : (fr ? "À compléter" : "To complete")}`,
  };
}

/**
 * jobs : les jobs de l'article EN TRAVAIL (vide = pas de barre) ;
 * tous : tous les jobs de l'article (pour relire l'état final pendant la fin).
 */
export default function BarreJobCarte({ jobs, tous, lang = "fr", ctx, onOuvrir, animationsReduites }) {
  const cle = (jobs ?? []).map((j) => j.id).join(",");
  const [vus, setVus] = useState("");
  const [finis, setFinis] = useState(null);
  // État dérivé (motif React documenté) : quand le travail cesse, on garde
  // les mêmes jobs à l'écran le temps de finir.
  if (cle !== vus) {
    setVus(cle);
    setFinis(!cle && vus ? vus.split(",") : null);
  }
  useEffect(() => {
    if (!finis) return undefined;
    const t = setTimeout(() => setFinis(null), DUREE_FIN_MS);
    return () => clearTimeout(t);
  }, [finis]);

  const ids = cle ? cle.split(",") : (finis ?? []);
  if (!ids.length) return null;
  const parId = new Map((tous ?? []).map((j) => [String(j.id), j]));
  for (const j of jobs ?? []) parId.set(String(j.id), j);
  const affiches = ids.map((id) => parId.get(id)).filter(Boolean);
  if (!affiches.length) return null;
  // L'ordinateur ne fait qu'un job à la fois : celui qui tourne d'abord.
  affiches.sort((a, b) => (a.status === "processing" ? 0 : 1) - (b.status === "processing" ? 0 : 1));
  const pistes = affiches.map((j) => {
    const p = pisteJob(j, { ...ctx, lang });
    return { ...p, ...phrasesCourtes(p, j, lang) };
  });
  const seule = pistes.length === 1 ? pistes[0] : null;
  return (
    <div className="gjobbar">
      <BarreProgression
        compact
        lang={lang}
        animationsReduites={animationsReduites}
        onOuvrir={onOuvrir}
        {...(seule ?? { pistes })}
      />
    </div>
  );
}
