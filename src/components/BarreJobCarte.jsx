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
import { attendConnexion } from "../utils/fileDesJobs";

const DUREE_FIN_MS = 5000;
const COURT = { vinted: "Vinted", leboncoin: "LBC", beebs: "Beebs", ebay: "eBay", opla: "Opla", depop: "Depop" };

function phrasesCourtes(piste, job, lang, ctx) {
  const fr = lang !== "en";
  // Le geste attendu, en deux mots : autoriser, se connecter, compléter.
  const geste = job.status === "pending" && job.platform === "opla" && ctx?.oplaAAutoriser
    ? (fr ? "À autoriser" : "To allow")
    : attendConnexion(job) ? (fr ? "À connecter" : "Sign in") : (fr ? "À compléter" : "To complete");
  const pf = COURT[job.platform] ?? job.platform;
  const court = piste.etapes?.find((e) => e.cle === piste.etape)?.court ?? "";
  const fin = job.action === "delete" ? (fr ? "Retirée" : "Removed")
    : job.action === "republish" ? (fr ? "De retour en ligne" : "Back online")
    : (fr ? "En ligne" : "Online");
  return {
    phrase: `${pf} · ${court}`,
    phraseFin: `${pf} · ${fin}`,
    phrasePause: `${pf} · ${fr ? "En attente" : "Waiting"}`,
    phraseEchec: `${pf} · ${piste.ton === "neutre" ? (fr ? "Annulée" : "Cancelled") : geste}`,
  };
}

// Une piste par plateforme × action, jamais par identifiant de job : les
// lignes posées au clic (« optimistic-… ») sont remplacées par les vraies au
// poll suivant, et une clé qui changerait ferait repartir la barre de zéro.
const cleDe = (j) => `${j.platform}|${j.action}`;
const union = (a, b) => [...new Set([...(a ? a.split(",") : []), ...(b ? b.split(",") : [])])].join(",");

/**
 * jobs : les jobs de l'article EN TRAVAIL (vide = pas de barre) ;
 * tous : tous les jobs de l'article (pour relire l'état des pistes finies).
 */
export default function BarreJobCarte({ jobs, tous, lang = "fr", ctx, onOuvrir, animationsReduites }) {
  const cle = (jobs ?? []).map(cleDe).join(",");
  const [vus, setVus] = useState("");
  // La SÉANCE : toutes les pistes vues en travail depuis que la barre a paru.
  // Une plateforme qui finit avant les autres y reste (à 100 %) : la barre
  // d'ensemble ne recule jamais quand une ligne sort du travail.
  const [seance, setSeance] = useState("");
  const [finis, setFinis] = useState(null);
  // État dérivé (motif React documenté) : quand le travail cesse, on garde
  // la séance à l'écran le temps de finir en douceur.
  if (cle !== vus) {
    setVus(cle);
    if (cle) { setSeance(union(seance, cle)); setFinis(null); }
    else { setFinis(seance || vus ? (seance || vus).split(",") : null); setSeance(""); }
  }
  useEffect(() => {
    if (!finis) return undefined;
    const t = setTimeout(() => setFinis(null), DUREE_FIN_MS);
    return () => clearTimeout(t);
  }, [finis]);

  const ids = cle ? union(seance, cle).split(",") : (finis ?? []);
  if (!ids.length) return null;
  // Le job le plus récent de chaque clé (l'état final se relit pendant la fin).
  const parCle = new Map();
  for (const j of [...(tous ?? []), ...(jobs ?? [])]) {
    const k = cleDe(j);
    const vu = parCle.get(k);
    if (!vu || Date.parse(j.created_at ?? 0) >= Date.parse(vu.created_at ?? 0)) parCle.set(k, j);
  }
  for (const j of jobs ?? []) parCle.set(cleDe(j), j);
  const affiches = ids.map((k) => parCle.get(k)).filter(Boolean);
  if (!affiches.length) return null;
  // L'ordinateur ne fait qu'un job à la fois : celui qui tourne d'abord.
  affiches.sort((a, b) => (a.status === "processing" ? 0 : 1) - (b.status === "processing" ? 0 : 1));
  const pistes = affiches.map((j) => {
    const p = pisteJob(j, { ...ctx, lang });
    return { ...p, ...phrasesCourtes(p, j, lang, ctx), cle: cleDe(j) };
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
