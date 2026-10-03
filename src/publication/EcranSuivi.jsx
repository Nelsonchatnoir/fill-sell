// ═══════════════════════════════════════════════════════════════════════════
// U4 — « C'EST PARTI » : l'état réel, lu dans la file (24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Remplace le ✅ « Annonces envoyées ! » qui ne montrait rien. Ici, chaque
// plateforme de la fournée a sa ligne et son état RÉEL (pending → en file,
// processing → en cours dans Chrome, published → en ligne avec le lien,
// needs_user → la question et le bouton « Compléter », failed → le motif), lu
// dans cross_post_jobs toutes les 5 s pendant trois minutes, puis toutes les
// 20 s. Les EXCLUSIONS du clic sont nommées (plus jamais silencieuses). La
// pastille d'extension dit si Chrome est vu ; « Tu peux fermer, ça continue »
// est dit une fois, en clair.
import { useEffect, useState } from "react";
import { etatsFournee } from "./moteur/regles";
// (01/10) LA barre de progression et la file complète des jobs : la fournée
// se lit d'un coup d'œil (article, pourcentage, une ligne par plateforme),
// et un tap sur la barre ouvre toute la file.
import BarreProgression from "../components/BarreProgression";
import FileDesJobs from "../components/FileDesJobs";
import { pisteJob, etapesJob } from "../utils/barresJobs";
import { urlPhoto } from "../utils/photos";
import { needsUserOuvrable } from "../utils/shared";
// Le texte d'un job passe TOUJOURS par humanizeJobError (24/09) — jamais le
// brut de l'extension ou du worker (« LIVE : aspect(s) … button.fake-link »).
import { humanizeJobError } from "../utils/shared";
import BoutonMeConnecter from "../components/BoutonMeConnecter";
import { MOTIFS } from "../utils/connexionPlateformes";
import { parcageDepasse } from "../utils/oplaAcces";
import { Carte, Puce, Logo } from "./composants";
import { NOM, ilYA } from "./texte";

const LIBELLE_MOTIF = {
  fr: { sans_adresse: "adresse de remise manquante", interdite: "produit refusé par la plateforme", sans_annonce: "aucune annonce rédigée", champ_manquant: "attend une réponse", sans_rayon: "aucun rayon trouvé", rayon_a_choisir: "rayon à choisir — aucun rayon sûr trouvé (rien n’a été débité)", rayon_a_reessayer: "rayon pas trouvé à l'instant — republie pour réessayer", refusee_serveur: "déjà en ligne, en file ou en attente" },
  en: { sans_adresse: "pickup address missing", interdite: "product refused by the platform", sans_annonce: "no listing written", champ_manquant: "waiting for an answer", sans_rayon: "no category found", rayon_a_choisir: "category to pick — none we were sure of (nothing was charged)", rayon_a_reessayer: "category not found just now — publish again to retry", refusee_serveur: "already online, queued or waiting" },
};

export default function EcranSuivi({ m }) {
  const en = m.lang === "en";
  const L = LIBELLE_MOTIF[en ? "en" : "fr"];
  const f = m.fournee;
  const plateformes = f?.plateformes ?? [];
  const [jobs, setJobs] = useState([]);
  const [lu, setLu] = useState(false);
  // « Chrome vu il y a … » suit la file : relu à chaque lecture, pas figé sur
  // la valeur du montage pendant que l'extension travaille justement.
  const [vueLe, setVueLe] = useState(null);
  const [fileOuverte, setFileOuverte] = useState(false);

  useEffect(() => {
    if (!f?.inventaireId || !plateformes.length || !m.supabase) return undefined;
    let vivant = true;
    const debut = Date.now();
    let timer = null;
    let derniers = [];
    const lire = async () => {
      try {
        const { data, error } = await m.supabase
          .from("cross_post_jobs")
          // (03/10, point 17) La VOIE réelle du job (trigger) : c'est elle qui dit
          // « nos serveurs » ou « ton ordinateur », et la durée — jamais un miroir.
          .select("id, platform, status, action, created_at, error, listing_url, platform_fields, voie")
          .eq("inventaire_id", f.inventaireId)
          .in("platform", plateformes)
          .gte("created_at", new Date(Date.parse(f.depuis) - 60_000).toISOString())
          .order("created_at", { ascending: false })
          .limit(50);
        if (!vivant) return;
        if (!error && Array.isArray(data)) { setJobs(data); setLu(true); derniers = data; }
        if (m.userId) {
          const { data: prof } = await m.supabase.from("profiles").select("extension_last_seen_at").eq("id", m.userId).maybeSingle();
          if (vivant && prof?.extension_last_seen_at) setVueLe(prof.extension_last_seen_at);
        }
      } catch { /* la prochaine lecture rattrapera */ }
      if (!vivant) return;
      const etats = etatsFournee(derniers, plateformes, f.depuis);
      // On continue de relire tant qu'une ligne est en file, en cours ou en
      // attente (une reprise espacée ou un retour de session la fera bouger).
      const encore = Object.values(etats).some(e => e.kind === "en_file" || e.kind === "en_cours" || e.kind === "attente");
      const cadence = Date.now() - debut < 3 * 60_000 ? 5_000 : 20_000;
      if (encore || Date.now() - debut < 30_000) timer = setTimeout(lire, cadence);
    };
    lire();
    return () => { vivant = false; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f?.inventaireId, f?.depuis]);

  const etats = etatsFournee(jobs, plateformes, f?.depuis);
  const nbEnLigne = plateformes.filter(p => etats[p]?.kind === "publiee").length;
  const nbAttente = plateformes.filter(p => String(etats[p]?.kind ?? "").startsWith("attente")).length;
  const nbRefus = plateformes.filter(p => etats[p]?.kind === "refusee").length;
  const tousFinis = plateformes.length > 0 && plateformes.every(p => !["en_file", "en_cours"].includes(etats[p]?.kind));
  const voies = m.voiesDuLot;
  const ext = m.extFraicheurPublier;

  // Leboncoin : les transporteurs / le format demandés qui n'ont PAS été posés
  // (bilan relu par l'extension, platform_fields.livraison_lbc — 24/09). Une
  // annonce en ligne avec l'estimation de Leboncoin au lieu du choix de la
  // personne ne passe plus en silence.
  const noteLivraison = (job) => {
    const b = job?.platform_fields?.livraison_lbc;
    if (!b || b.posee !== false) return null;
    const noms = (b.non_poses ?? []).map(n => n?.nom).filter(Boolean);
    const quoi = noms.length
      ? (en ? `carriers not applied: ${noms.join(", ")}` : `transporteurs non appliqués : ${noms.join(", ")}`)
      : (en ? "your delivery settings were not applied — Leboncoin's estimate is used" : "tes réglages de livraison n'ont pas été appliqués — l'estimation de Leboncoin s'applique");
    return <><br /><span style={{ color: "#92400E" }}>{quoi}</span></>;
  };

  // ── Une piste de barre par plateforme (01/10) ────────────────────────────
  // L'état vient de la MÊME lecture que les lignes (etatsFournee) ; la piste
  // (étapes réelles, état, couleur) vient de barresJobs. Les lignes gardent
  // leurs textes, leurs liens et leurs gestes d'avant, mot pour mot.
  // Opla sans autorisation connue (verdict serveur) : le serveur ne la sert
  // pas — sa ligne attend le geste, jamais « son tour ».
  const oplaAAutoriser = m.oplaVerdict === "a_autoriser";
  const ctxBarre = { lang: m.lang, extension: ext ?? null, oplaAAutoriser, texteErreur: (j) => humanizeJobError(j, en ? "en" : "fr") };
  const piste = (p) => {
    const e = etats[p] ?? { kind: "en_file" };
    // (03/10, point 17) La voie du JOB d'abord (trigger), le miroir seulement avant sa création.
    const parApi = p === "ebay" && (e.job?.voie ? e.job.voie === "api" : m.ebayVoieApiReelle);
    const voie = parApi ? "api" : "extension";
    const base = e.job
      ? pisteJob({ ...e.job, voie: e.job.voie ?? voie }, ctxBarre)
      : { etapes: etapesJob({ platform: p, action: "publish", voie }, m.lang), etape: "file", etat: "en_cours" };
    const l = ligne(p);
    const extra = { cle: p, libelle: NOM(p), icone: <Logo platform={p} size={24} />, phraseLigne: l.texte, geste: l.geste ?? null };
    switch (e.kind) {
      case "attente_champ": return { ...base, ...extra, etat: "echec", ton: "action" };
      case "attente_autorisation": return parcageDepasse(e.job, m.oplaAccesDetail)
        ? { ...base, ...extra, etat: "en_cours", etape: "file" }
        : { ...base, ...extra, etat: "echec", ton: "action" };
      case "attente_connexion": return { ...base, ...extra, etat: "echec", ton: "action" };
      case "attente": return { ...base, ...extra, etat: "pause", phrasePause: typeof l.texte === "string" ? l.texte : base.phrasePause };
      case "refusee": return { ...base, ...extra, etat: "echec", ton: "action" };
      case "annulee": return { ...base, ...extra, etat: "echec", ton: "neutre" };
      case "publiee": return { ...base, ...extra, etat: "termine" };
      default: return p === "opla" && oplaAAutoriser ? { ...base, ...extra, etat: "echec", ton: "action" } : { ...base, ...extra };
    }
  };

  const ligne = (p) => {
    const e = etats[p] ?? { kind: "en_file" };
    // (03/10, point 17) La voie du JOB d'abord (trigger), le miroir seulement avant sa création.
    const parApi = p === "ebay" && (e.job?.voie ? e.job.voie === "api" : m.ebayVoieApiReelle);
    switch (e.kind) {
      case "en_cours": return { texte: parApi ? (en ? "Publishing from our servers…" : "Publication depuis nos serveurs…") : (en ? "In progress in Chrome" : "En cours dans Chrome"), droite: <span className="fsn-spin" aria-label={en ? "in progress" : "en cours"} /> };
      case "publiee": return { texte: <>{en ? "Online" : "En ligne"}{e.url ? <> · <a href={e.url} target="_blank" rel="noopener noreferrer">{en ? "see the listing ↗" : "voir l'annonce ↗"}</a></> : null}{noteLivraison(e.job)}</>, droite: <Puce ton="ok" point>{en ? "Live" : "En ligne"}</Puce> };
      case "attente_champ": return { texte: (en ? `${NOM(p)} asks for “${e.champ}”` : `${NOM(p)} demande « ${e.champ} »`), droite: <Puce ton="geste">{en ? "Question" : "Question"}</Puce>,
        geste: m.onCompleter && e.job ? <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" onClick={() => m.onCompleter(e.job)}>{en ? "Answer and resume" : "Répondre et relancer"}</button> : null };
      // L'autorisation Opla se lit comme partout (verdict serveur, 24/09) : un
      // parcage plus ancien que la preuve d'accès du compte repart seul — on
      // ne redemande pas un geste déjà fait ; sinon, LE bouton, ici aussi.
      case "attente_autorisation": return parcageDepasse(e.job, m.oplaAccesDetail)
        ? { texte: en ? "Opla is allowed: it goes out on its own in a moment." : "Opla est autorisée : elle repart toute seule dans un instant.", droite: <Puce ton="mute">{en ? "queued" : "en file"}</Puce> }
        : { texte: en ? "Waiting for your Opla permission — it goes out on its own once granted." : "Attend ton autorisation Opla — partira toute seule une fois accordée.", droite: <Puce ton="geste">{en ? "Permission" : "Autorisation"}</Puce>,
            geste: m.userId ? <BoutonMeConnecter userId={m.userId} platform="opla" motif={MOTIFS.AUTORISER_OPLA} lang={m.lang} variante="bouton" /> : null };
      case "attente_connexion": return { texte: en ? "Waiting for you to sign in on your computer." : "Attend ta connexion sur ton ordinateur.", droite: <Puce ton="geste">{en ? "Sign in" : "Connexion"}</Puce> };
      case "attente": return { texte: (e.job?.error ? humanizeJobError(e.job, en ? "en" : "fr") : "") || (en ? "Waiting for something on your side." : "Attend quelque chose de ton côté."), droite: <Puce ton="geste">{en ? "Waiting" : "Attente"}</Puce> };
      case "refusee": return { texte: (e.job?.error ? humanizeJobError(e.job, en ? "en" : "fr") : "") || (en ? "The platform refused it." : "La plateforme a refusé."), droite: <Puce ton="refus">{en ? "Refused" : "Refusée"}</Puce> };
      // Une annulation porte sa raison quand la plateforme ne sait pas faire
      // (pas-de-rouge « info » : pas de rayon Beebs…) — on la
      // dit, au lieu d'un « Annulée. » muet.
      case "annulee": return { texte: (String(e.job?.error ?? "").trim() ? humanizeJobError(e.job, en ? "en" : "fr") : "") || (en ? "Cancelled." : "Annulée."), droite: <Puce ton="mute">{en ? "Cancelled" : "Annulée"}</Puce> };
      // Pas de rang annoncé (« 1er », « 2e ») : c'est le serveur qui ordonne la
      // file, et l'ordre observé en réel (Vinted avant Opla) n'était pas
      // celui de la fournée — on ne promet que ce qu'on sait.
      // (01/10) Opla en file SANS autorisation connue : elle ne partira pas à
      // son tour — elle attend le geste, et le bouton est là.
      default: if (p === "opla" && oplaAAutoriser) return { texte: en ? "Waiting for your Opla permission — it goes out on its own once granted." : "Attend ton autorisation Opla — partira toute seule une fois accordée.", droite: <Puce ton="geste">{en ? "Permission" : "Autorisation"}</Puce>,
        geste: m.userId ? <BoutonMeConnecter userId={m.userId} platform="opla" motif={MOTIFS.AUTORISER_OPLA} lang={m.lang} variante="bouton" /> : null };
        return { texte: parApi ? (en ? "Queued on our servers" : "Dans la file de nos serveurs") : (en ? "Queued — Chrome takes it in turn" : "Dans la file — Chrome la prend à son tour"), droite: <Puce ton="mute">{en ? "queued" : "en file"}</Puce> };
    }
  };

  // (01/10) Jamais « Terminé » quand une plateforme bloque : la barre dit
  // « 3 sur 4 », le titre dit la même chose en mots.
  const titre = tousFinis
    ? (nbRefus === 0 && nbAttente === 0
      ? (en ? "Published" : "Publié")
      : (nbEnLigne > 0 ? (en ? "Partly published" : "Publié en partie") : (en ? "Not published yet" : "Pas encore publié")))
    : (en ? "Publication started" : "Publication lancée");

  // L'article en tête de barre : la photo retenue, le titre, le prix (même
  // écriture que la carte de l'étape 3) et ce qui se passe.
  const photoArticle = urlPhoto((m.processedPhotos?.[0] ?? m.photos?.[0]) ?? null);
  const prixArticle = m.price != null && m.price !== "" && Number.isFinite(Number(m.price)) ? `${Number(m.price)} €` : null;
  const quoi = plateformes.length > 1
    ? (en ? `Listing on ${plateformes.length} platforms` : `Publication sur ${plateformes.length} plateformes`)
    : (en ? `Listing on ${NOM(plateformes[0])}` : `Publication sur ${NOM(plateformes[0])}`);
  const enLigneSur = plateformes.filter(p => etats[p]?.kind === "publiee").map(NOM);
  const pistes = plateformes.map(piste);
  // Une seule plateforme : une seule piste, sans ligne répétée sous la barre ;
  // son geste ou son lien passent sous la phrase.
  const seule = pistes.length === 1 ? pistes[0] : null;
  const urlSeule = seule && etats[plateformes[0]]?.kind === "publiee" ? etats[plateformes[0]]?.url : null;

  return (
    <>
      <div className="fsn-centre" style={{ padding: "6px 0 2px" }}>
        <h1 className="fsn-h" style={{ fontSize: 20 }}>{titre}</h1>
        <p className="fsn-lead" style={{ marginTop: 4 }}>
          {tousFinis
            ? (en ? `${nbEnLigne} online` : `${nbEnLigne} en ligne`) + (nbAttente ? (en ? ` · ${nbAttente} waiting` : ` · ${nbAttente} en attente`) : "") + (nbRefus ? (en ? ` · ${nbRefus} refused` : ` · ${nbRefus} refusée${nbRefus > 1 ? "s" : ""}`) : "")
            : (en ? `${plateformes.length} listing${plateformes.length > 1 ? "s" : ""} on their way. You can close this, it continues.` : `${plateformes.length} annonce${plateformes.length > 1 ? "s" : ""} en route. Tu peux fermer, ça continue.`)}
        </p>
      </div>

      {plateformes.length > 0 && (
        <div className="fsn-card" style={{ gap: 0 }}>
          <BarreProgression
            lang={m.lang}
            article={{ photo: photoArticle, titre: m.titreArticle || (en ? "Your item" : "Ton article"), sousTitre: [prixArticle, quoi].filter(Boolean).join(" · ") }}
            {...(seule ?? { pistes })}
            phraseFin={enLigneSur.length
              ? (en ? `Online on ${enLigneSur.join(", ")}.` : `En ligne sur ${enLigneSur.join(", ")}.`)
              : undefined}
            phrasePartielle={en
              ? `Online on ${nbEnLigne} platform${nbEnLigne > 1 ? "s" : ""} of ${plateformes.length} — the lines below say what is missing.`
              : `En ligne sur ${nbEnLigne} plateforme${nbEnLigne > 1 ? "s" : ""} sur ${plateformes.length} — les lignes ci-dessous disent ce qui manque.`}
            phraseEchec={seule
              ? (typeof seule.phraseLigne === "string" ? seule.phraseLigne : seule.phraseEchec)
              : (en ? "Nothing went out yet — each line says why." : "Rien n'est parti pour l'instant — chaque ligne dit pourquoi.")}
            onOuvrir={() => setFileOuverte(true)}
          />
          {seule && (seule.geste || urlSeule) && (
            <div className="fsn-pf-geste" style={{ marginTop: 10 }}>
              {seule.geste ?? <a href={urlSeule} target="_blank" rel="noopener noreferrer">{en ? "See the listing ↗" : "Voir l'annonce ↗"}</a>}
            </div>
          )}
          {!lu && <div className="fsn-small" style={{ paddingTop: 8 }}>{en ? "Reading the queue…" : "Lecture de la file…"}</div>}
        </div>
      )}
      {fileOuverte && (
        <FileDesJobs
          lang={m.lang}
          supabase={m.supabase}
          userId={m.userId}
          texteErreur={(j) => humanizeJobError(j, en ? "en" : "fr")}
          renderGeste={(job) => {
            if (job?.platform_fields?.needs_user_source === "opla_acces" && m.userId) {
              return <BoutonMeConnecter userId={m.userId} platform="opla" motif={MOTIFS.AUTORISER_OPLA} lang={m.lang} variante="bouton" />;
            }
            if (m.onCompleter && job?.status === "needs_user" && job?.action === "publish" && needsUserOuvrable(job)) {
              return <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" onClick={() => { setFileOuverte(false); m.onCompleter(job); }}>{en ? "Complete" : "Compléter"}</button>;
            }
            return null;
          }}
          onFermer={() => setFileOuverte(false)}
        />
      )}

      {(m.exclusionsDuClic?.length > 0 || m.publieesSansPf?.length > 0) && (
        <Carte gravite="geste" titre={en ? "Not sent this time" : "Pas parties cette fois"}>
          <ul>
            {(m.exclusionsDuClic ?? []).map(e => (
              <li key={`x:${e.platform}`}><b>{NOM(e.platform)}</b> — {e.motif === "champ_manquant" ? (en ? `waiting for: ${(e.champs ?? []).join(", ")}` : `attend : ${(e.champs ?? []).join(", ")}`) : (e.texte || L[e.motif] || e.motif)}</li>
            ))}
          </ul>
          <div className="fsn-small" style={{ color: "inherit" }}>
            {en ? "Reopen “Publish” on the item once it's fixed and it goes out too. Nothing was counted for these." : "Rouvre « Publier » sur l'article une fois réglé, et elle part aussi. Rien n'a été décompté pour celles-ci."}
          </div>
        </Carte>
      )}

      {!voies.toutServeur && ext && (
        ext.etat === "vivante" ? (
          <Carte gravite="flat" style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Puce ton="ok" point>{en ? "Extension active" : "Extension active"}</Puce>
            <span className="fsn-small">{en ? "Chrome seen " : "Chrome vu "}{ilYA(
              (Date.parse(vueLe ?? "") || 0) >= (Date.parse(m.extensionVueLe ?? "") || 0) ? (vueLe ?? m.extensionVueLe) : m.extensionVueLe, m.lang)}</span>
          </Carte>
        ) : ext.etat === "session_expiree" ? (
          <Carte gravite="geste" titre={en ? "The extension lost its connection to your account" : "L'extension a perdu sa connexion à ton compte"}>
            <div className="fsn-card-p">{en ? "On your computer, open fillsell.app in Chrome, sign in, then reload the page (F5) — it reconnects by itself. Your listings are waiting." : "Sur ton ordinateur, ouvre fillsell.app dans Chrome, connecte-toi, puis recharge la page (F5) — elle se reconnecte toute seule. Tes annonces attendent."}</div>
          </Carte>
        ) : (ext.etat === "eteinte" || ext.etat === "inactive") ? (
          <Carte gravite="geste" titre={en ? "Your computer is off" : "Ton ordinateur est éteint"}>
            <div className="fsn-card-p">{en ? `Chrome hasn't been seen for ${ext.jours ?? 1} day(s). Your listings wait and go out as soon as Chrome opens.` : `Chrome n'a pas été vu depuis ${ext.jours ?? 1} jour(s). Tes annonces attendent et partiront dès que Chrome s'ouvre.`}</div>
          </Carte>
        ) : null
      )}

      {(m.createdThisRun || (m.parcoursCreation && m.invId)) && (
        <div className="fsn-small fsn-centre" style={{ color: "var(--fs-teal-ink)", fontWeight: 600 }}>
          {m.photoOption !== "original" && !m.retoucheNonLivree ? m.t("doneAddedToStockRetouched") : m.t("doneAddedToStock")}
        </div>
      )}
    </>
  );
}
