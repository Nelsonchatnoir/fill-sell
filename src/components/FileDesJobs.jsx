// ═══════════════════════════════════════════════════════════════════════════
// LA FILE COMPLÈTE DES JOBS — ouverte d'un tap sur n'importe quelle barre de
// job (chantier clarté, 01/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Le job en cours en haut avec sa barre, puis tout ce qui attend, dans l'ordre
// où ça partira ; chaque attente dit POURQUOI (et à quelle heure, quand on le
// sait vraiment). Les jobs finis n'y sont pas.
//
// ⛔ Rien ne se RELANCE d'ici. Trois gestes seulement : le bouton du « geste à
//    faire » (il rouvre la porte existante — mini-éditeur, modale, connexion),
//    la pause de la file (22/10), et (26/10, Nico) l'ANNULATION de ce qui
//    attend : « Tout annuler » (confirmé) et, par ligne, glisser vers la gauche
//    ou la petite croix. Jamais un job en cours, jamais une republication dont
//    l'ancienne annonce est (ou a pu être) supprimée, jamais un retrait après
//    une vente — la règle et l'écriture gardée : utils/annulerFile.js.
//
// Deux façons de la nourrir :
//   · depuis le Stock : `jobs`, `fiches` et `contexte` déjà chargés (aucune
//     requête de plus) ;
//   · ailleurs (parcours de publication ouvert depuis Lens) : elle lit seule,
//     toutes les 10 s tant qu'elle est ouverte, ce dont elle a besoin.
// La limite des republications et les créneaux viennent du serveur
// (get-pending-jobs, mode plafond_only — l'appel que le Stock fait déjà, sans
// télémétrie) : jamais recalculés ici.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Monitor, Hand, Pause, ShieldCheck, X } from "lucide-react";
import { Coque, Groupe } from "./FeuilleActivite";
import BarreProgression from "./BarreProgression";
import GalleryPhoto, { premierePhoto } from "./GalleryPhoto";
import PlatformLogo from "./platform-logos/PlatformLogo";
import { lireFile, phraseCompteurs, libelleAction, libelleEtat } from "../utils/fileDesJobs";
import { pisteJob, articleDeJob } from "../utils/barresJobs";
import { fraicheurExtension } from "../utils/shared";
import { useOplaAcces } from "../utils/oplaAcces";
import { MOTIFS } from "../utils/connexionPlateformes";
import BoutonMeConnecter from "./BoutonMeConnecter";
import { boutiqueConnecteeVinted } from "../../supabase/functions/_shared/boutique-connectee.js";
import { extensionAMettreAJour } from "../utils/extensionAJour";
import ChoixBoutiqueFile, { boutiquePrevue } from "./ChoixBoutiqueFile";
import { useBoutiqueVintedParDefaut } from "../utils/boutiqueVintedParDefaut";
import { useEtatFile } from "../stock/etatFile";
import { messageFileEnPause } from "../../supabase/functions/_shared/file-pause.js";
import { jobAnnulable, bilanAnnulation, questionAnnulation, annulerJobs } from "../utils/annulerFile";

const T = {
  ink: "#10201B", mute: "#5C6560", faint: "#8A8578",
  card: "#FFFFFF", paper: "#F7F5EF", lineSoft: "#EFECE3", line: "#E7E3D8",
  tealDeep: "#1B6E62", amberInk: "#8A6100", amberFill: "#FFF6E3", amberLine: "#EED9A6",
  redInk: "#B91C1C", redFill: "#FEF2F2", redLine: "#FECACA",
};
// Largeur du panneau rouge révélé en glissant une ligne vers la gauche.
const PANNEAU_ANNULER = 92;

const COLONNES_JOB = "id, inventaire_id, platform, status, action, created_at, published_at, platform_fields, error, title, voie, listing_url";

// Lecture autonome (hors du Stock) : jobs vivants, fiches, poste, plateformes
// en pause. Tolérante : une lecture ratée garde l'état précédent.
function useLectureAutonome({ supabase, userId, actif }) {
  const [donnees, setDonnees] = useState(null);
  useEffect(() => {
    if (!actif || !supabase || !userId) return undefined;
    let vivant = true;
    const lire = async () => {
      try {
        const { data: jobs, error } = await supabase.from("cross_post_jobs").select(COLONNES_JOB)
          .eq("user_id", userId).in("status", ["pending", "processing", "needs_user"])
          .order("created_at", { ascending: true }).limit(1000);
        if (error || !Array.isArray(jobs)) return;
        const ids = [...new Set(jobs.map((j) => j.inventaire_id).filter((v) => v != null))];
        let fiches = new Map();
        if (ids.length) {
          const { data: items } = await supabase.from("inventaire").select("id, titre, photos, prix_vente, vinted_account_id").in("id", ids.slice(0, 500));
          fiches = new Map((items ?? []).map((i) => [String(i.id), { id: i.id, title: i.titre, photos: i.photos, sell: i.prix_vente, vinted_account_id: i.vinted_account_id ?? null }]));
        }
        let extension = null;
        let boutiques = null;
        let majExtension = false;
        try {
          const { data: prof } = await supabase.from("profiles").select("extension_last_seen_at, extension_build, extension_sessions, vinted_sync_pin").eq("id", userId).maybeSingle();
          extension = fraicheurExtension(prof?.extension_last_seen_at ?? null);
          majExtension = extensionAMettreAJour({ build: prof?.extension_build ?? null, lastSeenAt: prof?.extension_last_seen_at ?? null });
          // (03/10, point 16) Multi-boutiques Vinted : même règle que le serveur.
          const liste = Array.isArray(prof?.vinted_sync_pin?.boutiques) ? prof.vinted_sync_pin.boutiques : [];
          if (liste.length) {
            const { data: runs } = await supabase.from("vinted_sync_runs").select("vinted_user_id, vinted_login, started_at")
              .eq("user_id", userId).eq("kind", "dressing").not("vinted_user_id", "is", null).not("started_at", "is", null)
              .order("started_at", { ascending: false }).limit(1);
            const vu = boutiqueConnecteeVinted({ sessions: prof?.extension_sessions ?? null, run: runs?.[0] ?? null });
            const origines = new Map([...fiches.values()].map((i) => [String(i.id), i.vinted_account_id == null ? "" : String(i.vinted_account_id).trim()]));
            boutiques = { connectee: vu, liste, origines };
          }
        } catch { /* poste inconnu : on n'affirme rien */ }
        let plateformesEnPause = new Set();
        try {
          const { data: h } = await supabase.from("platform_health").select("platform").eq("paused", true);
          plateformesEnPause = new Set((h ?? []).map((x) => x.platform));
        } catch { /* rien d'affiché */ }
        if (vivant) setDonnees({ jobs, fiches, extension, plateformesEnPause, boutiques, majExtension });
      } catch { /* la prochaine lecture rattrapera */ }
    };
    lire();
    const t = setInterval(() => { if (document.visibilityState === "visible") lire(); }, 10000);
    return () => { vivant = false; clearInterval(t); };
  }, [actif, supabase, userId]);
  return donnees;
}

// Limite des republications et créneaux : l'état du SERVEUR, seulement s'il y
// a une republication qui attend. null = inconnu : aucune heure affichée.
function useRetenuesRepublication({ supabase, actif }) {
  const [etat, setEtat] = useState(null);
  useEffect(() => {
    if (!actif || !supabase) return undefined;
    let vivant = true;
    const lire = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-pending-jobs", { body: { plafond_only: true } });
        if (vivant && !error) setEtat({ plafond: data?.plafond_republish ?? null, creneaux: data?.creneaux_republish ?? null });
      } catch { /* inconnu : rien d'affiché */ }
    };
    lire();
    const t = setInterval(() => { if (document.visibilityState === "visible") lire(); }, 60000);
    return () => { vivant = false; clearInterval(t); };
  }, [actif, supabase]);
  return etat;
}

// Une icône par motif de l'état unique (_shared/etat-job.js).
const ICONES = {
  rythme: Clock, limite_jour: Clock, creneau: Clock, essai: Clock, auto_en_pause: Clock,
  retenue_serveur: ShieldCheck, releve: ShieldCheck, technique: ShieldCheck, lbc_moderation: ShieldCheck,
  file_en_pause: Pause, lecture_origine: Clock,
  boutique: Pause, boutiques_a_ouvrir: Pause, plateforme: Pause, gel: Pause, ecartee: Pause, ebay_etranger: Pause,
  ordinateur: Monitor, ordinateur_session: Monitor, mise_a_jour: Monitor,
  geste: Hand, connexion: Hand, opla: Hand, depop: Hand, pas_partie: Hand,
};

// (26/10, Nico) Une ligne annulable : glisser vers la gauche révèle « Annuler » (téléphone), et une petite croix,
// visible partout, demande une confirmation dans la ligne même. Le panneau rouge révélé EST la confirmation du
// glissement (deux gestes délibérés) ; la croix, d'un seul tap, demande « Annuler ? » avant d'écrire.
function useGlisserPourAnnuler(actif) {
  const [decalage, setDecalage] = useState(0);
  const [glisse, setGlisse] = useState(false);
  const depart = useRef(null);
  if (!actif) return { decalage: 0, ouvert: false, fermer: () => {}, handlers: {}, glisse: false };
  const handlers = {
    onTouchStart: (e) => { const t = e.touches[0]; depart.current = { x: t.clientX, y: t.clientY, base: decalage, axe: null }; },
    onTouchMove: (e) => {
      const d = depart.current; if (!d) return;
      const t = e.touches[0]; const dx = t.clientX - d.x; const dy = t.clientY - d.y;
      if (!d.axe) { if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; d.axe = Math.abs(dx) > Math.abs(dy) ? "x" : "y"; }
      if (d.axe !== "x") return;
      setGlisse(true);
      setDecalage(Math.max(-PANNEAU_ANNULER - 24, Math.min(0, d.base + dx)));
    },
    onTouchEnd: () => {
      const d = depart.current; depart.current = null; setGlisse(false);
      if (!d || d.axe !== "x") return;
      setDecalage((v) => (v <= -PANNEAU_ANNULER * 0.6 ? -PANNEAU_ANNULER : 0));
    },
  };
  return { decalage, ouvert: decalage <= -PANNEAU_ANNULER, fermer: () => setDecalage(0), handlers, glisse };
}

function LigneFile({ job, item, situation, lang, geste, boutiques = null, boutiqueDefaut = null, supabase = null, annulable = false, onAnnuler = null }) {
  const fr = lang !== "en";
  // (15/10 soir) Publication Vinted d'un compte à plusieurs boutiques : où elle part, et le changer.
  const prevue = boutiquePrevue(job, boutiques, boutiqueDefaut);
  const photo = item ? premierePhoto(item.photos) : null;
  const titre = (item?.title ?? job?.title ?? "").trim() || (lang === "en" ? "Your item" : "Ton article");
  const Icone = ICONES[situation.motif] ?? null;
  const couleur = situation.groupe === "a_toi" ? T.amberInk : T.mute;
  const peutAnnuler = annulable && typeof onAnnuler === "function";
  const glisser = useGlisserPourAnnuler(peutAnnuler);
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const annuler = async () => {
    if (envoi) return;
    setEnvoi(true);
    try { await onAnnuler(job); } finally { setEnvoi(false); setConfirmer(false); glisser.fermer(); }
  };
  const quoi = job?.action === "republish" ? (fr ? "cette republication" : "this repost") : (fr ? "cette publication" : "this listing");
  const ligne = (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10, padding: peutAnnuler ? "10px 34px 10px 10px" : "10px 10px", borderRadius: 14,
      background: T.card, border: `1px solid ${T.lineSoft}`, minWidth: 0, position: "relative",
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, overflow: "hidden", background: T.paper, border: `1px solid ${T.lineSoft}`, display: "grid", placeItems: "center" }}>
        {photo
          ? <GalleryPhoto url={photo} alt="" fallback={<PlatformLogo platform={job?.platform} size={18} />} />
          : <PlatformLogo platform={job?.platform} size={18} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {titre}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, fontSize: 11.5, color: T.mute, minWidth: 0 }}>
          <PlatformLogo platform={job?.platform} size={13} />
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{libelleAction(job, lang, prevue ? null : boutiques)}</span>
        </div>
        {prevue && <ChoixBoutiqueFile job={job} prevue={prevue} supabase={supabase} lang={lang} />}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 5, marginTop: 5, fontSize: 12, lineHeight: 1.4, color: couleur, fontWeight: situation.groupe === "a_toi" ? 600 : 500 }}>
          {Icone && <Icone size={13} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1.5 }} aria-hidden="true" />}
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{situation.raison}</span>
        </div>
        {geste && <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>{geste}</div>}
        {confirmer && (
          <div role="group" aria-label={fr ? "Confirmer l'annulation" : "Confirm cancellation"}
            style={{ marginTop: 9, padding: "8px 9px", borderRadius: 10, background: T.redFill, border: `1px solid ${T.redLine}`, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span style={{ flex: "1 1 140px", minWidth: 0, fontSize: 12, lineHeight: 1.4, fontWeight: 600, color: T.redInk }}>
              {fr ? `Annuler ${quoi} ? Rien de ce qui est en ligne ne bouge.` : `Cancel ${quoi}? Nothing online changes.`}
            </span>
            <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button type="button" onClick={() => setConfirmer(false)} disabled={envoi}
                style={{ border: `1px solid ${T.line}`, background: T.card, color: T.mute, borderRadius: 999, padding: "6px 11px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: envoi ? "default" : "pointer" }}>
                {fr ? "Garder" : "Keep"}
              </button>
              <button type="button" onClick={annuler} disabled={envoi}
                style={{ border: "none", background: T.redInk, color: "#fff", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: envoi ? "default" : "pointer", opacity: envoi ? 0.6 : 1 }}>
                {envoi ? (fr ? "Annulation…" : "Cancelling…") : (fr ? "Annuler" : "Cancel")}
              </button>
            </span>
          </div>
        )}
      </div>
      {peutAnnuler && !confirmer && (
        <button type="button" onClick={() => { glisser.fermer(); setConfirmer(true); }}
          aria-label={fr ? `Annuler ${quoi}` : `Cancel ${quoi}`} title={fr ? "Annuler" : "Cancel"}
          style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 999, border: "none", background: "transparent", color: T.faint, display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}>
          <X size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}
    </div>
  );
  if (!peutAnnuler) return ligne;
  return (
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", touchAction: "pan-y" }}>
      <button type="button" onClick={annuler} disabled={envoi} tabIndex={glisser.ouvert ? 0 : -1} aria-hidden={!glisser.ouvert}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: PANNEAU_ANNULER, border: "none", background: T.redInk, color: "#fff", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, cursor: "pointer", opacity: glisser.decalage < 0 ? 1 : 0 }}>
        <X size={17} strokeWidth={2.4} aria-hidden="true" />
        {envoi ? "…" : (fr ? "Annuler" : "Cancel")}
      </button>
      <div {...glisser.handlers}
        style={{ position: "relative", transform: `translateX(${glisser.decalage}px)`, transition: glisser.glisse ? "none" : "transform 0.22s ease" }}>
        {ligne}
      </div>
    </div>
  );
}

export default function FileDesJobs({
  lang = "fr", supabase = null, userId = null,
  jobs = null, fiches = null, contexte = null,
  renderGeste = null, texteErreur = null, formaterPrix = null,
  pied = null, onFermer, etatFile = null, onAnnules = null,
}) {
  const fr = lang !== "en";
  // (26/10) Les jobs annulés d'ici disparaissent tout de suite (la prochaine lecture confirmera).
  const [masques, setMasques] = useState(() => new Set());
  const [toutAnnuler, setToutAnnuler] = useState(null);   // null | bilan à confirmer
  const [annulationEnCours, setAnnulationEnCours] = useState(false);
  const [retourAnnulation, setRetourAnnulation] = useState(null); // { n, refuses } | { erreur }
  // (22/10 soir, point 6 — Louis) LA PAUSE DE LA FILE : l'état vient du Stock (ou se lit ici quand la feuille
  // s'ouvre ailleurs). Elle ne coupe jamais une tâche commencée ; les retraits après une vente continuent.
  const etatFileLu = useEtatFile({ supabase, userId, actif: !etatFile });
  const file_ = etatFile ?? etatFileLu;
  const autonome = useLectureAutonome({ supabase, userId, actif: jobs == null });
  const listeBrute = jobs ?? autonome?.jobs ?? null;
  const listeJobs = useMemo(() => (listeBrute && masques.size ? listeBrute.filter((j) => !masques.has(String(j.id))) : listeBrute), [listeBrute, masques]);
  const lesFiches = fiches ?? autonome?.fiches ?? new Map();
  const aRepublicationEnAttente = (listeJobs ?? []).some((j) => j.action === "republish" && j.status === "pending");
  const retenues = useRetenuesRepublication({ supabase, actif: aRepublicationEnAttente });
  // L'autorisation Opla : la MÊME lecture partagée que le Stock et le parcours.
  const aOplaEnAttente = (listeJobs ?? []).some((j) => j.platform === "opla" && j.status === "pending");
  const opla = useOplaAcces({ userId, actif: aOplaEnAttente });
  const aPublicationVinted = (listeJobs ?? []).some((j) => j.platform === "vinted" && j.action === "publish" && ["pending", "needs_user"].includes(j.status));
  const boutiqueDefaut = useBoutiqueVintedParDefaut(userId, aPublicationVinted);
  // Une horloge qui avance toutes les 30 s : une pause dont l'heure est passée
  // cesse d'en afficher une, sans attendre la prochaine lecture.
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const ctx = useMemo(() => ({
    lang, maintenant,
    filePause: contexte?.filePause ?? (file_.pause === true),
    programmation: contexte?.programmation ?? false,
    extension: contexte?.extension ?? autonome?.extension ?? null,
    plateformesEnPause: contexte?.plateformesEnPause ?? autonome?.plateformesEnPause ?? new Set(),
    plafond: retenues?.plafond ?? contexte?.plafond ?? null,
    creneaux: retenues?.creneaux ?? null,
    oplaAAutoriser: contexte?.oplaAAutoriser ?? (opla.verdict === "a_autoriser"),
    boutiques: contexte?.boutiques ?? autonome?.boutiques ?? null,
    extensionAMettreAJour: contexte?.extensionAMettreAJour ?? autonome?.majExtension ?? false,
    texteErreur,
  }), [lang, maintenant, contexte, autonome, retenues, texteErreur, opla.verdict, file_.pause]);

  const file = useMemo(() => (listeJobs ? lireFile(listeJobs, ctx) : null), [listeJobs, ctx]);
  const ficheDe = (j) => lesFiches.get?.(String(j?.inventaire_id)) ?? null;
  // (24/10, décision de Nico) Plus de limite de republication par jour : plus de phrase « limite du jour » en tête
  // de la file. La pause de respiration se dit sur chaque job (_shared/etat-job.js, motif « rythme »).

  // (16/10) Les quatre groupes portent les mots de l'état unique (_shared/etat-job.js).
  const sections = file ? [
    { cle: "en_cours", titre: libelleEtat("en_cours", lang), lignes: file.en_cours },
    { cle: "en_file", titre: libelleEtat("en_file", lang), lignes: file.en_file },
    { cle: "en_pause", titre: libelleEtat("en_pause", lang), lignes: file.en_pause },
    { cle: "a_toi", titre: libelleEtat("a_toi", lang), lignes: file.a_toi },
  ].filter((s) => s.lignes.length > 0) : [];

  // (26/10, Nico) Ce qui attend — jamais ce qui est en cours : les lignes « En cours » ne sont pas visées.
  const bilan = useMemo(() => {
    const b = bilanAnnulation(file ? [...file.en_file, ...file.en_pause, ...file.a_toi].map((l) => l.job) : []);
    return { ...b, restent: b.restent + (file?.en_cours.length ?? 0) };   // ce qui continue, « En cours » compris
  }, [file]);
  const annuler = async (cibles) => {
    if (!supabase || !userId) return;
    setAnnulationEnCours(true);
    try {
      const r = await annulerJobs(supabase, { userId, jobs: cibles, lang });
      if (r.annules.length) {
        setMasques((prev) => new Set([...prev, ...r.annules.map(String)]));
        onAnnules?.(r.annules);
      }
      setRetourAnnulation({ n: r.annules.length, refuses: r.refuses });
    } catch {
      setRetourAnnulation({ erreur: fr ? "L'annulation n'a pas pu être enregistrée. Réessaie dans un instant." : "The cancellation could not be saved. Try again in a moment." });
    } finally {
      setAnnulationEnCours(false);
      setToutAnnuler(null);
    }
  };

  return (
    <Coque
      lang={lang}
      titre={fr ? "Ta file" : "Your queue"}
      sousTitre={file ? phraseCompteurs(file.compteurs, lang) : (fr ? "Lecture de la file…" : "Reading the queue…")}
      onFermer={onFermer}
      pied={pied}
    >
      <div role="status" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "10px 12px", borderRadius: 12, background: file_.pause ? T.amberFill : T.paper, border: `1px solid ${file_.pause ? T.amberLine : T.lineSoft}` }}>
        <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Pause size={16} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1, color: file_.pause ? T.amberInk : T.mute }} aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.45, color: file_.pause ? T.amberInk : T.mute, fontWeight: file_.pause ? 700 : 500 }}>
            {file_.pause
              ? messageFileEnPause(file_.en_pause, lang)
              : (fr ? "Besoin d'une pause ? La tâche en cours va au bout, puis plus rien ne part. Les retraits après une vente continuent." : "Need a break? The current task finishes, then nothing else starts. Removals after a sale keep going.")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
          <button type="button" disabled={file_.envoi}
            onClick={() => { file_.basculer?.(!file_.pause); }}
            style={{ flexShrink: 0, border: "none", borderRadius: 999, padding: "8px 14px", cursor: file_.envoi ? "default" : "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#fff", background: file_.pause ? "linear-gradient(120deg,#2F9E90,#1B6E62)" : T.amberInk, opacity: file_.envoi ? 0.6 : 1 }}>
            {file_.pause ? (fr ? "Reprendre" : "Resume") : (fr ? "Mettre en pause" : "Pause")}
          </button>
          {bilan.annulables.length > 0 && supabase && userId && (
            <button type="button" disabled={annulationEnCours}
              onClick={() => { setRetourAnnulation(null); setToutAnnuler(bilan); }}
              style={{ flexShrink: 0, border: "none", borderRadius: 999, padding: "8px 14px", cursor: annulationEnCours ? "default" : "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#fff", background: T.redInk, opacity: annulationEnCours ? 0.6 : 1 }}>
              {fr ? "Tout annuler" : "Cancel all"}
            </button>
          )}
        </div>
      </div>
      {retourAnnulation && (
        <div role="status" style={{ fontSize: 12, lineHeight: 1.5, padding: "0 4px", color: retourAnnulation.erreur ? T.redInk : T.tealDeep, fontWeight: 600 }}>
          {retourAnnulation.erreur ?? (fr
            ? `${retourAnnulation.n} annulée${retourAnnulation.n > 1 ? "s" : ""}. Rien de ce qui est en ligne n'a bougé.${retourAnnulation.refuses > 0 ? ` ${retourAnnulation.refuses} venai${retourAnnulation.refuses > 1 ? "ent" : "t"} de commencer : ${retourAnnulation.refuses > 1 ? "elles vont" : "elle va"} au bout.` : ""}`
            : `${retourAnnulation.n} cancelled. Nothing online changed.${retourAnnulation.refuses > 0 ? ` ${retourAnnulation.refuses} had just started and will finish.` : ""}`)}
        </div>
      )}
      {file && file.total === 0 && (
        <div style={{ padding: "18px 6px 10px", textAlign: "center", fontSize: 13, lineHeight: 1.5, color: T.mute }}>
          {fr
            ? "Rien en cours ni en file. Ce qui est publié, republié ou retiré n'apparaît plus ici."
            : "Nothing in progress or queued. What is listed, reposted or removed no longer shows here."}
        </div>
      )}
      {sections.map((s) => (
        <div key={s.cle} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Groupe>{s.cle === "en_cours" ? s.titre : `${s.titre} · ${s.lignes.length}`}</Groupe>
          {s.lignes.map(({ job, situation }) => (s.cle === "en_cours" ? (
            <div key={job.id} style={{ background: T.card, border: `1px solid rgba(47,158,144,0.45)`, borderRadius: 16, padding: "12px 12px 11px" }}>
              <BarreProgression
                key={job.id}
                lang={lang}
                article={articleDeJob(job, ficheDe(job), { lang, formaterPrix })}
                {...pisteJob(job, ctx)}
              />
            </div>
          ) : (
            <LigneFile
              key={job.id}
              job={job}
              item={ficheDe(job)}
              situation={situation}
              lang={lang}
              boutiques={ctx.boutiques}
              boutiqueDefaut={boutiqueDefaut.valeur}
              supabase={supabase}
              annulable={Boolean(supabase && userId) && jobAnnulable(job)}
              onAnnuler={(j) => annuler([j])}
              geste={s.cle !== "a_toi" ? null
                : situation.motif === "opla" && userId
                  ? <BoutonMeConnecter userId={userId} platform="opla" motif={MOTIFS.AUTORISER_OPLA} lang={lang} variante="bouton" />
                  : (renderGeste ? renderGeste(job) : null)}
            />
          )))}
        </div>
      ))}
      {toutAnnuler && createPortal(
        <div onClick={() => !annulationEnCours && setToutAnnuler(null)}
          style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(16,32,27,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div role="alertdialog" aria-modal="true" aria-label={questionAnnulation(toutAnnuler, lang)} onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 20, padding: 24, width: "min(92vw,420px)", boxShadow: "0 24px 80px rgba(0,0,0,0.2)", fontFamily: "inherit" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 10, lineHeight: 1.4 }}>
              {questionAnnulation(toutAnnuler, lang)}
            </div>
            <div style={{ fontSize: 14, color: "#3A443F", lineHeight: 1.6, marginBottom: toutAnnuler.restent > 0 ? 12 : 18 }}>
              {fr
                ? "Rien de ce qui est déjà en ligne n'est retiré, et ton quota n'est pas consommé."
                : "Nothing already online is removed, and your quota is not used."}
            </div>
            {toutAnnuler.restent > 0 && (
              <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.55, marginBottom: 18, padding: "9px 11px", background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10 }}>
                {fr
                  ? `${toutAnnuler.restent} ${toutAnnuler.restent > 1 ? "tâches continuent" : "tâche continue"} : déjà commencée${toutAnnuler.restent > 1 ? "s" : ""} (une annonce retirée doit revenir en ligne), ou retrait après une vente (il évite une double vente).`
                  : `${toutAnnuler.restent} task${toutAnnuler.restent > 1 ? "s keep" : " keeps"} going: already started (a removed listing must come back online), or a removal after a sale (it prevents a double sale).`}
              </div>
            )}
            <button type="button" disabled={annulationEnCours} onClick={() => annuler(toutAnnuler.annulables)}
              style={{ display: "block", width: "100%", textAlign: "center", padding: 12, borderRadius: 999, border: "none", background: annulationEnCours ? T.redLine : T.redInk, color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: annulationEnCours ? "not-allowed" : "pointer", marginBottom: 8 }}>
              {annulationEnCours ? (fr ? "Annulation…" : "Cancelling…") : (fr ? "Tout annuler" : "Cancel all")}
            </button>
            <button type="button" disabled={annulationEnCours} onClick={() => setToutAnnuler(null)}
              style={{ display: "block", width: "100%", textAlign: "center", padding: 11, borderRadius: 999, border: `1px solid ${T.line}`, background: "transparent", color: T.mute, fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", cursor: annulationEnCours ? "not-allowed" : "pointer" }}>
              {fr ? "Garder ma file" : "Keep my queue"}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </Coque>
  );
}
