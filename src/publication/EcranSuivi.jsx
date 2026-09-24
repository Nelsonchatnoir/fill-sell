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
import { Carte, Puce, Logo } from "./composants";
import { NOM, ilYA } from "./texte";

const LIBELLE_MOTIF = {
  fr: { sans_adresse: "adresse de remise manquante", interdite: "produit refusé par la plateforme", sans_annonce: "aucune annonce rédigée", champ_manquant: "attend une réponse", sans_rayon: "aucun rayon trouvé", refusee_serveur: "déjà en ligne, en file ou en attente" },
  en: { sans_adresse: "pickup address missing", interdite: "product refused by the platform", sans_annonce: "no listing written", champ_manquant: "waiting for an answer", sans_rayon: "no category found", refusee_serveur: "already online, queued or waiting" },
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
          .select("id, platform, status, action, created_at, error, listing_url, platform_fields")
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

  const ligne = (p) => {
    const e = etats[p] ?? { kind: "en_file" };
    const parApi = p === "ebay" && m.ebayVoieApiReelle;
    switch (e.kind) {
      case "en_cours": return { texte: parApi ? (en ? "Publishing from our servers…" : "Publication depuis nos serveurs…") : (en ? "In progress in Chrome" : "En cours dans Chrome"), droite: <span className="fsn-spin" aria-label={en ? "in progress" : "en cours"} /> };
      case "publiee": return { texte: <>{en ? "Online" : "En ligne"}{e.url ? <> · <a href={e.url} target="_blank" rel="noopener noreferrer">{en ? "see the listing ↗" : "voir l'annonce ↗"}</a></> : null}{noteLivraison(e.job)}</>, droite: <Puce ton="ok" point>{en ? "Live" : "En ligne"}</Puce> };
      case "attente_champ": return { texte: (en ? `${NOM(p)} asks for “${e.champ}”` : `${NOM(p)} demande « ${e.champ} »`), droite: <Puce ton="geste">{en ? "Question" : "Question"}</Puce>,
        geste: m.onCompleter && e.job ? <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" onClick={() => m.onCompleter(e.job)}>{en ? "Answer and resume" : "Répondre et relancer"}</button> : null };
      case "attente_autorisation": return { texte: en ? "Waiting for your Opla permission — it goes out on its own once granted." : "Attend ton autorisation Opla — partira toute seule une fois accordée.", droite: <Puce ton="geste">{en ? "Permission" : "Autorisation"}</Puce> };
      case "attente_connexion": return { texte: en ? "Waiting for you to sign in on your computer." : "Attend ta connexion sur ton ordinateur.", droite: <Puce ton="geste">{en ? "Sign in" : "Connexion"}</Puce> };
      case "attente": return { texte: e.job?.error || (en ? "Waiting for something on your side." : "Attend quelque chose de ton côté."), droite: <Puce ton="geste">{en ? "Waiting" : "Attente"}</Puce> };
      case "refusee": return { texte: e.erreur || (en ? "The platform refused it." : "La plateforme a refusé."), droite: <Puce ton="refus">{en ? "Refused" : "Refusée"}</Puce> };
      // Une annulation porte sa raison quand la plateforme ne sait pas faire
      // (pas-de-rouge « info » : Vinted neuf seulement, pas de rayon…) — on la
      // dit, au lieu d'un « Annulée. » muet.
      case "annulee": return { texte: String(e.job?.error ?? "").trim() || (en ? "Cancelled." : "Annulée."), droite: <Puce ton="mute">{en ? "Cancelled" : "Annulée"}</Puce> };
      // Pas de rang annoncé (« 1er », « 2e ») : c'est le serveur qui ordonne la
      // file, et l'ordre observé en réel (Vinted avant Opla) n'était pas
      // celui de la fournée — on ne promet que ce qu'on sait.
      default: return { texte: parApi ? (en ? "Queued on our servers" : "Dans la file de nos serveurs") : (en ? "Queued — Chrome takes it in turn" : "Dans la file — Chrome la prend à son tour"), droite: <Puce ton="mute">{en ? "queued" : "en file"}</Puce> };
    }
  };

  const titre = tousFinis
    ? (nbRefus === 0 && nbAttente === 0 ? (en ? "Published" : "Publié") : (en ? "Done, with a follow-up" : "Terminé, avec une suite"))
    : (en ? "Publication started" : "Publication lancée");

  return (
    <>
      <div className="fsn-centre" style={{ padding: "6px 0 2px" }}>
        <div className="fsn-ok-rond" aria-hidden="true">{tousFinis && nbRefus === 0 && nbAttente === 0 ? "✓" : (tousFinis ? "!" : "✓")}</div>
        <h1 className="fsn-h" style={{ marginTop: 10, fontSize: 20 }}>{titre}</h1>
        <p className="fsn-lead" style={{ marginTop: 4 }}>
          {m.titreArticle ? <b style={{ color: "var(--fs-ink)" }}>{m.titreArticle}</b> : null}
          {m.titreArticle ? " · " : ""}
          {tousFinis
            ? (en ? `${nbEnLigne} online` : `${nbEnLigne} en ligne`) + (nbAttente ? (en ? ` · ${nbAttente} waiting` : ` · ${nbAttente} en attente`) : "") + (nbRefus ? (en ? ` · ${nbRefus} refused` : ` · ${nbRefus} refusée${nbRefus > 1 ? "s" : ""}`) : "")
            : (en ? `${plateformes.length} listing${plateformes.length > 1 ? "s" : ""} on their way. You can close this, it continues.` : `${plateformes.length} annonce${plateformes.length > 1 ? "s" : ""} en route. Tu peux fermer, ça continue.`)}
        </p>
      </div>

      <div className="fsn-card" style={{ gap: 0 }}>
        {plateformes.map(p => {
          const l = ligne(p);
          return (
            <div key={p} className="fsn-pfrow" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
              <div className="fsn-row">
                <Logo platform={p} size={24} />
                <span className="fsn-pf-t"><b>{NOM(p)}</b><small>{l.texte}</small></span>
                {l.droite}
              </div>
              {l.geste ? <div className="fsn-pf-geste" style={{ marginTop: 0, paddingLeft: 34 }}>{l.geste}</div> : null}
            </div>
          );
        })}
        {!lu && plateformes.length > 0 && <div className="fsn-small" style={{ paddingTop: 8 }}>{en ? "Reading the queue…" : "Lecture de la file…"}</div>}
      </div>

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
