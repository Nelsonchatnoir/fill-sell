// ═══════════════════════════════════════════════════════════════════════════
// U1 — « OÙ PUBLIER ? » (24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Un seul écran de départ à la place de « Upload » + « Photos » : l'article
// (photos comprises), une ligne par plateforme avec son ÉTAT RÉEL et le geste
// qui débloque, l'option photos, le quota. Le bouton compte juste.
// Ce que l'ancien écran faisait et qui est CONSERVÉ, câblé comme aujourd'hui :
// la case Opla (modale d'autorisation au clic, jamais bloquante), eBay grisé
// quand le compte n'est pas fini (bouton vers Réglages › Compte eBay), la
// proposition de relier eBay en voie extension, les plateformes en pause, les
// catégories fermées, « déjà en ligne / en cours / en attente », la retouche
// IA, le modèle à confirmer, l'analyse photo, l'identification en échec.
import { useState } from "react";
import GaleriePhotos from "../components/GaleriePhotos";
import BoutonMeConnecter from "../components/BoutonMeConnecter";
import OplaAutorisationModal from "../components/OplaAutorisationModal";
import { MOTIFS } from "../utils/connexionPlateformes";
import { phraseAccesOpla, parcageDepasse } from "../utils/oplaAcces";
import { Carte, Puce, Logo, CarteArticle } from "./composants";
import { NOM } from "./texte";

export default function EcranOuPublier({ m }) {
  const en = m.lang === "en";
  const [oplaModale, setOplaModale] = useState(false);
  const [photosOuvertes, setPhotosOuvertes] = useState(false);
  const photos = m.displayPreviews;
  const nb = photos.length;
  const aUneFiche = Boolean(m.platformListings);
  // Avant le téléversement (step 0), les photos sont des aperçus locaux ; après,
  // des URLs — les deux jeux de gestes existent dans le moteur, on prend le bon.
  const gestesPhotos = m.pickedPreviews.length > 0
    ? { onAdd: m.addFiles, onRemove: m.removeFile, onReorder: m.handleReorderPreviews, removable: true }
    : { onAdd: m.handleAddMorePhotos, onRemove: m.handleRemovePhoto, onReorder: m.handleReorderPhotos, removable: true };

  const titre = m.titreArticle;
  const sousTitre = [
    m.etatArticle,
    nb ? (en ? `${nb} photo${nb > 1 ? "s" : ""}` : `${nb} photo${nb > 1 ? "s" : ""}`) : (en ? "no photo" : "aucune photo"),
  ].filter(Boolean).join(" · ");

  // ── L'état de chaque plateforme, en une ligne ─────────────────────────────
  const lignes = m.plateformesAffichees.map(p => {
    const support = m.platformSupport?.[p] ?? "supported";
    const dejaEnLigne = m.publishedSet.has(p);
    const enCours = !dejaEnLigne && m.queuedSet.has(p);
    const attente = m.attentes?.[p];
    const enAttente = !dejaEnLigne && !enCours && Boolean(attente?.bloque);
    const compteAbsent = p === "ebay" && m.ebayBloque;
    const enPause = m.pausedPlatforms.includes(p);
    const pasEncoreOuverte = m.plateformesAVenir.includes(p) && !m.plateformesOuvertes.includes(p);
    const fermeeCategorie = m.categorieFermee(support);
    const disabled = pasEncoreOuverte || fermeeCategorie || dejaEnLigne || enCours || enAttente || compteAbsent || enPause;
    const cochee = !disabled && m.selected.has(p);
    const session = m.platformSessions?.[p];
    const parApi = p === "ebay" && m.ebayVoieApiReelle;

    let etat = null; let ton = null; let geste = null;
    if (pasEncoreOuverte) { etat = m.motifAVenir(p); ton = "mute"; }
    else if (dejaEnLigne) { etat = en ? "Already online for this item" : "Déjà en ligne pour cet article"; ton = "ok"; }
    else if (enCours) { etat = en ? "A publication is already under way" : "Une publication est déjà en cours"; ton = "ok"; }
    else if (enAttente && attente.kind === "attente_autorisation" && parcageDepasse(attente.job, m.oplaAccesDetail)) {
      // Parcage « Autoriser Opla » PLUS ANCIEN que la preuve d'accès du compte
      // (24/09) : le serveur le relance dès qu'un poste avec accès polle. On le
      // dit ; on ne redemande pas un geste déjà fait.
      etat = en ? "Opla is allowed: this listing goes out on its own" : "Opla est autorisée : cette annonce repart toute seule";
      ton = "ok";
    }
    else if (enAttente) {
      etat = m.motifsVerrouillage?.[p] ?? "";
      ton = "geste";
      if (attente.kind === "attente_champ" && m.onCompleter) geste = (
        <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" onClick={() => m.onCompleter(attente.job)}>
          {en ? `Complete “${attente.champ}”` : `Compléter « ${attente.champ} »`}
        </button>
      );
      else if (attente.kind === "attente_autorisation" && m.userId) geste = <BoutonMeConnecter userId={m.userId} platform={p} motif={MOTIFS.AUTORISER_OPLA} lang={m.lang} variante="bouton" />;
      else if (attente.kind === "attente_connexion" && m.userId) geste = <BoutonMeConnecter userId={m.userId} platform={p} motif={attente.motif === "reauth_ebay" ? MOTIFS.REAUTH_EBAY : MOTIFS.CONNEXION} lang={m.lang} variante="bouton" />;
    }
    else if (compteAbsent) {
      etat = m.motifEbay; ton = "geste";
      geste = <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" onClick={m.ouvrirPanneauEbay}>{m.boutonEbay}</button>;
    }
    else if (fermeeCategorie) { etat = m.motifSupport(p, support); ton = "mute"; }
    else if (enPause) { etat = m.motifPause(p); ton = "geste"; }
    else if (parApi) { etat = en ? "Goes out from our servers, no extension needed" : "Part de nos serveurs, sans l'extension"; ton = "ok"; }
    // ── OPLA : L'AUTORISATION DU COMPTE, LUE AU SERVEUR (24/09, cas Louis) ──
    // Le verdict est celui des Réglages et de l'écran de suivi (utils/oplaAcces,
    // règle _shared/acces-opla.js) — plus jamais la sonde de l'extension. Un
    // compte dont un poste a l'accès ne voit plus « Autoriser Opla ». Sans
    // aucune preuve, le bouton RESTE (garde-fou) ; tant que le verdict n'est
    // pas lu (null), rien n'est affirmé.
    else if (p === "opla" && phraseAccesOpla(m.oplaVerdict, m.lang)) {
      etat = phraseAccesOpla(m.oplaVerdict, m.lang); ton = "geste";
      if (m.userId) geste = <BoutonMeConnecter userId={m.userId} platform="opla" motif={MOTIFS.AUTORISER_OPLA} lang={m.lang} variante="bouton" />;
    }
    else if (session === false) {
      etat = en ? "Signed out — the listing will wait until you sign in" : "Session fermée — l'annonce attendra ta connexion"; ton = "geste";
      if (m.userId) geste = <BoutonMeConnecter userId={m.userId} platform={p} motif={MOTIFS.CONNEXION} lang={m.lang} variante="bouton" />;
    }
    else if (session === true) { etat = en ? "Signed in" : "Connectée"; ton = "ok"; }
    else if (p === "ebay" && !m.ebayVoieApi && m.ouvrirPanneauEbay) {
      etat = en ? "Goes through the extension (your computer must be on)" : "Part par l'extension (ordinateur allumé)"; ton = null;
    }
    // L'annonce refusée la dernière fois : on le dit, la case reste cochable.
    if (!disabled && attente?.kind === "refusee") { etat = m.phraseEtat(p, attente); ton = "geste"; }
    return { p, disabled, cochee, etat, ton, geste, pasEncoreOuverte };
  });

  // La modale au clic ne se pose que sur un refus CONNU — « je ne sais pas »
  // montre la ligne et son bouton, sans interrompre le geste.
  const basculer = (p) => {
    if (p === "opla" && !m.selected.has(p) && m.oplaVerdict === "a_autoriser") { setOplaModale(true); return; }
    m.basculer(p);
  };

  return (
    <>
      <div>
        <p className="fsn-eyebrow">{en ? "Step 1 of 3" : "Étape 1 sur 3"}</p>
        <h1 className="fsn-h" style={{ marginTop: 4 }}>{en ? "Where to publish?" : "Où publier ?"}</h1>
      </div>

      <CarteArticle
        photo={photos[0] ?? null}
        titre={titre}
        sousTitre={sousTitre}
        prix={m.price}
        prixVide={en ? "price at next step" : "prix à l'étape suivante"}
        lang={m.lang}
        onPhoto={m.setLightboxUrl}
        enfants={(
          <>
            {nb > 1 && !photosOuvertes && (
              <div className="fsn-thumbs">
                {photos.slice(0, 8).map((u, i) => (
                  <div key={i} className="fsn-thumb" onClick={() => m.setLightboxUrl(u)}><img src={u} alt="" /></div>
                ))}
              </div>
            )}
            {(photosOuvertes || nb === 0) ? (
              <div className="fsn-gallerie-wrap">
                <GaleriePhotos
                  previews={photos}
                  onAdd={gestesPhotos.onAdd}
                  onRemove={gestesPhotos.onRemove}
                  onReorder={gestesPhotos.onReorder}
                  removable={gestesPhotos.removable}
                  rappelMinimum={!aUneFiche}
                  max={m.MAX_PHOTOS}
                  lang={m.lang}
                />
                <p className="fsn-small">
                  {en ? `Up to ${m.MAX_PHOTOS} photos. ` : `Jusqu'à ${m.MAX_PHOTOS} photos. `}
                  {aUneFiche
                    ? (en ? "Your listing is already written: changing photos keeps the text." : "Ton annonce est déjà rédigée : changer les photos garde le texte.")
                    : (en ? `At least ${m.MIN_PHOTOS} to write the listing.` : `Au moins ${m.MIN_PHOTOS} pour rédiger l'annonce.`)}
                </p>
              </div>
            ) : (
              <div className="fsn-row fsn-row--wrap" style={{ gap: 8 }}>
                <button type="button" className="fsn-lien" onClick={() => setPhotosOuvertes(true)}>
                  {en ? "Add or reorder photos" : "Ajouter ou réordonner les photos"}
                </button>
              </div>
            )}
            {m.uploadError && <Carte gravite="refus"><div className="fsn-card-p">{m.uploadError}</div></Carte>}
          </>
        )}
      />

      {/* Ce que l'ancien écran Photos disait à côté de la grille — conservé. */}
      {m.identifyFailed && (
        <Carte gravite="flat"><div className="fsn-card-p" style={{ color: "var(--fs-mute)" }}>
          {en ? "Your photos could not be analysed — check the fields before publishing." : "Les photos n'ont pas pu être analysées — vérifie les champs avant de publier."}
        </div></Carte>
      )}
      {m.modeleAConfirmer && m.modelePropose && (
        <Carte gravite="geste" titre={en ? "Is this the right model?" : "C'est bien ce modèle ?"}>
          <div className="fsn-card-p">
            {en
              ? `The AI suggests "${m.modelePropose}"${m.modeleSource === "web" ? " from a web search" : ""} — it could not read it on the item itself.`
              : `L'IA propose « ${m.modelePropose} »${m.modeleSource === "web" ? " depuis une recherche web" : ""} — elle ne l'a pas lu sur l'article.`}
          </div>
          <div className="fsn-btn-row">
            <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" onClick={() => m.setModeleConfirme(true)}>{en ? "Yes, that's it" : "Oui, c'est ça"}</button>
            <button type="button" className="fsn-btn fsn-btn--ghost fsn-btn--sm" onClick={() => m.setModeleConfirme(false)}>{en ? "No / not sure" : "Non / pas sûr"}</button>
          </div>
        </Carte>
      )}

      <div>
        <p className="fsn-eyebrow" style={{ marginBottom: 8 }}>{en ? "Platforms" : "Plateformes"}</p>
        <div className="fsn-stack">
          {lignes.map(({ p, disabled, cochee, etat, ton, geste }) => (
            <div key={p}>
              <button
                type="button"
                className={`fsn-pf${cochee ? " fsn-pf--on" : ""}${disabled ? " fsn-pf--dis" : ""}`}
                disabled={disabled}
                aria-pressed={disabled ? undefined : cochee}
                onClick={disabled ? undefined : () => basculer(p)}
              >
                <span className={`fsn-check${cochee ? " fsn-check--on" : ""}${disabled ? " fsn-check--dis" : ""}`} aria-hidden="true">{cochee ? "✓" : ""}</span>
                <Logo platform={p} size={26} desature={disabled} />
                <span className="fsn-pf-t">
                  <b>{NOM(p)}</b>
                  {etat ? <small>{etat}</small> : null}
                </span>
                {ton === "ok" && (dejaOuEnCours(p, m) || (p === "ebay" && m.ebayVoieApiReelle)) ? <Puce ton="ok" point>{dejaOuEnCours(p, m) ? (en ? "Live" : "En ligne") : "API"}</Puce> : null}
              </button>
              {geste ? <div className="fsn-pf-geste" style={{ padding: "0 4px" }}>{geste}</div> : null}
            </div>
          ))}
        </div>
        {/* eBay en voie extension : la proposition, pas un mur. */}
        {!m.ebayBloque && !m.ebayVoieApi && m.selected.has("ebay") && !m.categorieFermee(m.platformSupport?.ebay) && m.ouvrirPanneauEbay && (
          <div className="fsn-row fsn-row--wrap fsn-pf-sous" style={{ marginTop: 8, justifyContent: "space-between" }}>
            <span className="fsn-grow">
              {en
                ? "Link your eBay account and your listings go out from our servers, even with your computer off."
                : "Relie ton compte eBay et tes annonces partent de nos serveurs, même ordinateur éteint."}
            </span>
            <button type="button" className="fsn-btn fsn-btn--ghost fsn-btn--sm" onClick={m.ouvrirPanneauEbay}>{en ? "Link eBay" : "Relier eBay"}</button>
          </div>
        )}
      </div>

      {/* Photos : retouche IA ou telles quelles — un réglage, plus une étape. */}
      <Carte gravite="flat" style={{ gap: 8 }}>
        <div className="fsn-row fsn-row--between fsn-row--wrap">
          <span className="fsn-small">{en ? "Photos" : "Photos"}</span>
          {m.reuseRetouched ? (
            <b className="fsn-small fsn-strong">{en ? "already retouched ✓" : "déjà retouchées ✓"}</b>
          ) : (
            <div className="fsn-seg" style={{ minWidth: 220 }}>
              <button type="button" className={m.photoOption !== "original" ? "on" : ""} onClick={() => m.setPhotoOption("ia_light")}>{en ? "AI touch-up" : "Retouche IA"}</button>
              <button type="button" className={m.photoOption === "original" ? "on" : ""} onClick={() => m.setPhotoOption("original")}>{en ? "As they are" : "Telles quelles"}</button>
            </div>
          )}
        </div>
        {!m.reuseRetouched && m.photoOption !== "original" && (
          <p className="fsn-small">
            {en
              ? `Improves light, sharpness and colours; the item and background stay as they are. Only the first ${m.MAX_RETOUCHED} photos are retouched.`
              : `Améliore la lumière, la netteté et les couleurs ; l'objet et le fond restent tels quels. Seules les ${m.MAX_RETOUCHED} premières photos sont retouchées.`}
            {m.retoucheNewCount > 0 ? (en ? ` Your ${m.retoucheNewCount} new photo(s) only — the others are kept.` : ` Tes ${m.retoucheNewCount} nouvelle(s) photo(s) seulement — les autres sont gardées.`) : ""}
          </p>
        )}
        {m.quotas?.annonces?.plafond != null && (
          <div className="fsn-row fsn-row--between">
            <span className="fsn-small">{en ? "Listings this month" : "Annonces ce mois-ci"}</span>
            <b className="fsn-small fsn-strong num">
              {en ? `${m.quotas.annonces.restantes ?? 0} left` : `${m.quotas.annonces.restantes ?? 0} restante${(m.quotas.annonces.restantes ?? 0) > 1 ? "s" : ""}`}
              {" "}<span style={{ color: "var(--fs-mute)", fontWeight: 600 }}>/ {m.quotas.annonces.plafond}</span>
            </b>
          </div>
        )}
        {!aUneFiche && (
          <p className="fsn-small">
            {en ? "Writing the listing counts one listing on your quota, once — publishing on several platforms costs nothing more." : "La rédaction compte une annonce sur ton quota, une seule fois — publier sur plusieurs plateformes ne coûte rien de plus."}
          </p>
        )}
      </Carte>

      {/* Analyse des photos par l'IA (même moteur que Lens) — conservée. */}
      {nb > 0 && !m.analysisHidden && !aUneFiche && (
        <Carte gravite="flat" style={{ gap: 8 }}>
          {m.photoAnalysis ? (
            <div className="fsn-small">
              <b className="fsn-strong">{en ? "Photos analysed" : "Photos analysées"}</b>{" · "}
              {[m.photoAnalysis.marque, m.photoAnalysis.taille_estimee, m.photoAnalysis.matiere,
                m.photoAnalysis.prix_vente_suggere != null ? (en ? `suggested ${m.photoAnalysis.prix_vente_suggere} €` : `prix conseillé ${m.photoAnalysis.prix_vente_suggere} €`) : null,
              ].filter(Boolean).join(" · ") || (en ? "fields filled in" : "champs pré-remplis")}
            </div>
          ) : (
            <>
              <div className="fsn-small">
                <b className="fsn-strong">{en ? "Let the AI read your photos" : "Laisse l'IA lire tes photos"}</b>{" — "}
                {en ? "brand, size, material and a suggested price." : "marque, taille, matière et un prix conseillé."}
              </div>
              {m.analysisError && <div className="fsn-small" style={{ color: "var(--fs-bad-ink)", fontWeight: 600 }}>{m.analysisError}</div>}
              <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" disabled={m.analyzing} onClick={m.handleAnalyzePhotos}>
                {m.analyzing ? (en ? "Analysing…" : "Analyse en cours…") : (en ? "Analyse my photos" : "Analyser mes photos")}
              </button>
            </>
          )}
        </Carte>
      )}

      {/* Une précision pour la rédaction (l'ancien champ « notes » + micro). */}
      {!aUneFiche && (
        <div className="fsn-field">
          <label className="fsn-label" htmlFor="fsn-notes">{en ? "A note for the writing (optional)" : "Une précision pour la rédaction (facultatif)"}</label>
          <div className="fsn-row">
            <input id="fsn-notes" className="fsn-input" value={m.notes} onChange={e => m.setNotes(e.target.value)}
              placeholder={en ? "e.g. never worn, gift" : "ex. jamais porté, cadeau"} />
            {/* (2026-09-25) Le micro ne s'affiche que là où l'on sait enregistrer
                (utils/dictee.js) ; « Stop » envoie à la transcription, et ce qui
                se passe ensuite se DIT sous le champ — jamais un micro muet. */}
            {m.micDisponible && (
              <button type="button" className="fsn-btn fsn-btn--ghost fsn-btn--sm" onClick={m.toggleMic} aria-pressed={m.micActive}
                disabled={m.micEtat === "transcription"}
                aria-label={m.micActive ? (en ? "Stop dictation" : "Arrêter la dictée") : (en ? "Dictate" : "Dicter")}
                style={m.micActive ? { borderColor: "var(--fs-bad)", color: "var(--fs-bad-ink)" } : undefined}>
                {m.micActive ? (en ? "Stop" : "Stop") : m.micEtat === "transcription" ? "…" : "🎙"}
              </button>
            )}
          </div>
          {(m.micEtat === "ecoute" || m.micEtat === "transcription" || m.micMessage) && (
            <div className="fsn-small" role="status" style={{ marginTop: 6, color: m.micMessage && m.micEtat === "repos" ? "var(--fs-amber-ink)" : undefined }}>
              {m.micEtat === "ecoute" ? (en ? "Listening… speak, then tap “Stop”." : "J'écoute… parle, puis touche « Stop ».")
                : m.micEtat === "transcription" ? (en ? "Transcribing…" : "Je transcris…")
                : m.micMessage}
            </div>
          )}
        </div>
      )}

      {oplaModale && (
        <OplaAutorisationModal
          lang={m.lang}
          contexte="publication"
          userId={m.userId}
          onContinuer={() => { setOplaModale(false); m.basculer("opla"); }}
          onClose={() => setOplaModale(false)}
        />
      )}
    </>
  );
}

function dejaOuEnCours(p, m) {
  return m.publishedSet.has(p) || m.queuedSet.has(p);
}
