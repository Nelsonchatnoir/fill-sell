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
import { etatPlateforme } from "./plateformes";
import { formaterRemiseAZero } from "../reglages/quotas";
import { nombre, motJauge } from "../utils/jauges";
import { montantAnglais } from "../utils/montants";
import { vraiesPhotos } from "../utils/photos";

// ═══ (04/11/2026, grille à 3 jauges) LE COÛT AVANT PUBLICATION — maquettes 4.1 à 4.4 ════════════════════════
// Une mini-jauge : le nom, la barre (ce qu'il restera en sarcelle, la part qui va partir en ambre pâle au bout),
// « 4 sur 5 » — ou « illimité », en mot, jamais une barre pleine. Les couleurs sont celles du stepper (--fs-*),
// avec leur valeur en repli : la feuille de remontée du Stock, hors du stepper, la dessine pareil.
//   jauge : une entrée de jaugesDuCompte (plafond, restantes, illimite) · pris : ce que le geste va utiliser.
const LIBELLE_JAUGE = {
  fr: { annonces: "Annonces", publications: "Publications", remontees: "Remontées" },
  en: { annonces: "Listings", publications: "Publications", remontees: "Bumps" },
};
export function MiniJauge({ cle, jauge, pris = 0, lang = "fr" }) {
  const en = lang === "en";
  const lib = LIBELLE_JAUGE[en ? "en" : "fr"][cle] ?? cle;
  const ligne = { display: "grid", gridTemplateColumns: "96px 1fr auto", gap: 10, alignItems: "center", fontSize: 12.5 };
  const nom = <span style={{ color: "var(--fs-mute, #5C6560)", fontWeight: 600 }}>{lib}</span>;
  if (!jauge) return null;
  if (jauge.illimite) {
    return (
      <div data-mini-jauge={cle} style={ligne}>
        {nom}<span />
        <b className="num" style={{ color: "var(--fs-teal-ink, #1B6E62)", whiteSpace: "nowrap" }}>{nombre(Infinity, lang)}</b>
      </div>
    );
  }
  const total = Math.max(0, Number(jauge.plafond) || 0);
  const avant = Math.max(0, Number(jauge.restantes) || 0);
  const part = Math.min(Math.max(0, Number(pris) || 0), avant);
  const apres = avant - part;
  const pct = (v) => (total > 0 ? Math.max(0, Math.min(100, Math.round((v / total) * 100))) : 0);
  const pApres = pct(apres);
  const pPart = Math.min(100 - pApres, pct(part));
  return (
    <div data-mini-jauge={cle} style={ligne}>
      {nom}
      <div aria-hidden="true" style={{ height: 6, borderRadius: 4, background: "var(--fs-border, #E7E3D8)", overflow: "hidden", display: "flex" }}>
        <i style={{ display: "block", height: "100%", width: `${pApres}%`, borderRadius: 4, background: "linear-gradient(120deg, var(--fs-teal, #2F9E90), var(--fs-teal-deep, #1B6E62))" }} />
        <i data-part="1" style={{ display: "block", height: "100%", width: `${pPart}%`, borderRadius: "0 4px 4px 0", background: "var(--fs-amber, #E0A53C)", opacity: 0.55 }} />
      </div>
      <b className="num" style={{ whiteSpace: "nowrap", color: "var(--fs-ink, #10201B)" }}>
        {en ? `${nombre(apres, lang)} of ${nombre(total, lang)}` : `${nombre(apres, lang)} sur ${nombre(total, lang)}`}
      </b>
    </div>
  );
}

/** « Il te restera <b>4 annonces</b> et <b>47 publications</b> ce mois-ci. » : la phrase telle quelle, ses nombres en gras. */
export function ResteEnGras({ phrase, gras = [] }) {
  const morceaux = [];
  let reste = String(phrase ?? "");
  for (const g of gras) {
    const i = g ? reste.indexOf(g) : -1;
    if (i < 0) continue;
    if (i > 0) morceaux.push(reste.slice(0, i));
    morceaux.push(<b key={morceaux.length} className="num">{g}</b>);
    reste = reste.slice(i + g.length);
  }
  if (reste) morceaux.push(reste);
  return <>{morceaux}</>;
}

export default function EcranOuPublier({ m }) {
  const en = m.lang === "en";
  const [oplaModale, setOplaModale] = useState(false);
  const [photosOuvertes, setPhotosOuvertes] = useState(false);
  const photos = m.displayPreviews;
  const nb = photos.length;
  const aUneFiche = Boolean(m.platformListings);
  // (11/11/2026, décisions de Nico) Les seules photos sont des images par défaut CONNUES d'une plateforme (reconnues à
  // l'identique par le moteur : m.photosDeRemplissage) : elles ne partent pas et le bouton est retenu — une phrase
  // courte le dit (traductions de l'app, clé ouPublierVraiePhoto). Même règle que le bouton (utils/photos.js).
  const queDuRemplissage = nb > 0 && vraiesPhotos(photos, m.photosDeRemplissage).length === 0;
  // Avant le téléversement (step 0), les photos sont des aperçus locaux ; après,
  // des URLs — les deux jeux de gestes existent dans le moteur, on prend le bon.
  const gestesPhotos = m.pickedPreviews.length > 0
    ? { onAdd: m.addFiles, onRemove: m.removeFile, onReorder: m.handleReorderPreviews, removable: true }
    : { onAdd: m.handleAddMorePhotos, onRemove: m.handleRemovePhoto, onReorder: m.handleReorderPhotos, removable: true };

  // ── Les photos face au texte déjà rédigé, et le quota de retouches (01/10) ──
  const retouches = m.quotas?.retouches ?? null;
  const photosRetouchees = m.reuseRetouched || (aUneFiche && m.retoucheLivree);
  // Le texte en main a été rédigé AVEC retouche demandée, et aucune n'a été
  // livrée : on ne propose pas de recommencer en boucle, on dit ce qui part.
  const retoucheRateePourCeTexte = aUneFiche && !photosRetouchees && Boolean(m.optionRedaction) && m.optionRedaction !== "original";
  const dateRemise = formaterRemiseAZero(m.remiseAZero, m.lang);
  const MAXR = m.MAX_RETOUCHED;
  const lignesPhotos = [];
  if (photosRetouchees) {
    // rien à ajouter : « déjà retouchées ✓ » dit tout
  } else if (retoucheRateePourCeTexte) {
    lignesPhotos.push(en ? "The touch-up didn't come through for this text: your photos go out as they are." : "La retouche n'a pas abouti pour ce texte : tes photos partent telles quelles.");
  } else if (m.retouchesEpuisees) {
    if (!retouches?.plafond) {
      lignesPhotos.push(en ? "AI touch-up isn't included in your plan: your photos go out as they are." : "La retouche IA n'est pas incluse dans ta formule : tes photos partent telles quelles.");
    } else {
      lignesPhotos.push(en
        ? `No touch-ups left this month (${retouches.consommes ?? retouches.plafond} of ${retouches.plafond} used): your photos go out as they are.`
        : `Plus de retouche ce mois-ci (${retouches.consommes ?? retouches.plafond} sur ${retouches.plafond} utilisées) : tes photos partent telles quelles.`);
      lignesPhotos.push(dateRemise
        ? (en ? `Your touch-ups come back on ${dateRemise}.` : `Tes retouches reviennent le ${dateRemise}.`)
        : (en ? "They come back at your next renewal." : "Elles reviennent à ton prochain renouvellement."));
    }
  } else if (m.photoOption !== "original") {
    lignesPhotos.push(en ? "Light, sharpness and colours improved; the item and the background don't change." : "Lumière, netteté et couleurs améliorées ; l'objet et le fond ne changent pas.");
    if (m.retoucheNewCount > 0) {
      lignesPhotos.push(en ? `Only your ${m.retoucheNewCount} new photo(s) are retouched; the others stay as they are.` : `Seules tes ${m.retoucheNewCount} nouvelle(s) photo(s) sont retouchées ; les autres restent telles quelles.`);
    } else if (nb > MAXR) {
      lignesPhotos.push(en
        ? `Photos 1 to ${MAXR} are retouched; photo${nb - MAXR > 1 ? "s" : ""} ${MAXR + 1}${nb - MAXR > 1 ? ` to ${nb}` : ""} stay${nb - MAXR > 1 ? "" : "s"} as ${nb - MAXR > 1 ? "they are" : "it is"}.`
        : `Photos 1 à ${MAXR} retouchées ; ${nb - MAXR > 1 ? `photos ${MAXR + 1} à ${nb} telles quelles` : `photo ${MAXR + 1} telle quelle`}.`);
    }
    // Ce que ça compte, seulement si une rédaction va vraiment partir.
    if (!aUneFiche || m.retoucheARefaire) {
      lignesPhotos.push(en ? "Counts 1 touch-up for this listing." : "Compte 1 retouche pour cette annonce.");
    }
  }

  const titre = m.titreArticle;
  const sousTitre = [
    m.etatArticle,
    nb ? (en ? `${nb} photo${nb > 1 ? "s" : ""}` : `${nb} photo${nb > 1 ? "s" : ""}`) : (en ? "no photo" : "aucune photo"),
  ].filter(Boolean).join(" · ");

  // ── L'état de chaque plateforme, en une ligne ─────────────────────────────
  // La décision (grisée ou non, et pourquoi) vit dans ./plateformes — le
  // bouton du pied lit la même (01/10). Ici, seulement les mots et le geste.
  const lignes = (m.bilan?.etats ?? m.plateformesAffichees.map(p => etatPlateforme(p, m))).map(e => {
    const { p, support, disabled, cochee, dejaEnLigne, enCours, enAttente, attente, compteAbsent, enPause, pasEncoreOuverte, fermeeCategorie } = e;
    const session = m.platformSessions?.[p];
    const parApi = p === "ebay" && m.ebayVoieApiReelle;

    let etat = null; let ton = null; let geste = null;
    if (pasEncoreOuverte) { etat = m.motifAVenir(p); ton = "mute"; }
    // (15/10, Louis) Annonce plus vue en ligne : jamais « déjà en ligne » —
    // depuis quand, et la question qui libère la case.
    else if (dejaEnLigne && m.douteEnLigne?.[p]) {
      etat = m.motifsVerrouillage?.[p] ?? ""; ton = "geste";
      if (m.onRepondreDisparue) geste = (
        <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" data-repondre-disparue={p} onClick={() => m.onRepondreDisparue(m.douteEnLigne[p].job)}>
          {en ? "Answer" : "Répondre"}
        </button>
      );
    }
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
      else if (attente.kind === "attente_autorisation" && m.userId) geste = <BoutonMeConnecter userId={m.userId} platform={p} motif={attente.motif === "autoriser_depop" ? MOTIFS.AUTORISER_DEPOP : MOTIFS.AUTORISER_OPLA} lang={m.lang} variante="bouton" />;
      else if (attente.kind === "attente_connexion" && m.userId) geste = <BoutonMeConnecter userId={m.userId} platform={p} motif={attente.motif === "reauth_ebay" ? MOTIFS.REAUTH_EBAY : MOTIFS.CONNEXION} lang={m.lang} variante="bouton" />;
    }
    else if (compteAbsent) {
      etat = m.motifEbay; ton = "geste";
      // (25/10) boutonEbay null = compte eBay hors de France : la phrase seule, rien à paramétrer chez nous.
      geste = m.boutonEbay ? <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" onClick={m.ouvrirPanneauEbay}>{m.boutonEbay}</button> : null;
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

      {/* (01/10) Rien ne peut partir : dit D'ENTRÉE, une ligne par cas — le
          bouton du pied devient « Retour au stock ». */}
      {m.rien && (
        <Carte gravite={m.rien.attendGeste ? "geste" : "info"} titre={m.rien.titre}>
          {m.rien.lignes.map((l, i) => <div key={i} className="fsn-card-p">{l}</div>)}
        </Carte>
      )}

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
            {queDuRemplissage && <p className="fsn-small" data-photo-vraie="manque">{m.t("ouPublierVraiePhoto")}</p>}
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

      {/* (04/11/2026, grille à 3 jauges — maquette 4.1) LE COÛT, AVANT L'APPUI : « Cette publication utilisera
          1 annonce et 3 publications. », ce qu'il restera, deux mini-jauges, la règle. Recalculé à chaque case
          cochée ou décochée (m.cout, calculé par la coque sur les cases cochées). Sans la grille : m.cout absent,
          rien de neuf — et la phrase « ne coûte rien de plus », plus bas, reste. */}
      {m.cout && !m.rien && <CarteCout cout={m.cout} lang={m.lang} />}

      {/* Photos : retouche IA ou telles quelles — un réglage, plus une étape.
          (01/10) Le choix dit ce qui sera VRAIMENT fait, avec le quota de
          retouches à côté de celui des annonces. Plus de retouche ce mois-ci :
          « Telles quelles » de lui-même, la raison et la date de remise à
          zéro — la retouche reste visible, les offres s'ouvrent sur demande. */}
      {!m.rien && (
        <Carte gravite="flat" style={{ gap: 8 }}>
          <div className="fsn-row fsn-row--between fsn-row--wrap">
            <span className="fsn-small">{en ? "Photos" : "Photos"}</span>
            {photosRetouchees ? (
              <b className="fsn-small fsn-strong">{en ? "already retouched ✓" : "déjà retouchées ✓"}</b>
            ) : retoucheRateePourCeTexte ? (
              <b className="fsn-small fsn-strong">{en ? "as they are" : "telles quelles"}</b>
            ) : (
              <div className="fsn-seg" style={{ minWidth: 220 }}>
                <button type="button" className={m.photoOption !== "original" ? "on" : ""}
                  disabled={m.retouchesEpuisees} aria-disabled={m.retouchesEpuisees}
                  style={m.retouchesEpuisees ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                  onClick={m.retouchesEpuisees ? undefined : () => m.setPhotoOption("ia_light")}>{en ? "AI touch-up" : "Retouche IA"}</button>
                <button type="button" className={m.photoOption === "original" ? "on" : ""} onClick={() => m.setPhotoOption("original")}>{en ? "As they are" : "Telles quelles"}</button>
              </div>
            )}
          </div>
          {/* Le compteur de retouches juste sous le choix qu'il concerne. */}
          {retouches && retouches.plafond > 0 && !photosRetouchees && (
            <div className="fsn-row fsn-row--between">
              <span className="fsn-small">{en ? "Touch-ups this month" : "Retouches ce mois-ci"}</span>
              <b className="fsn-small fsn-strong num">
                {en ? `${retouches.restantes ?? 0} left` : `${retouches.restantes ?? 0} restante${(retouches.restantes ?? 0) > 1 ? "s" : ""}`}
                {" "}<span style={{ color: "var(--fs-mute)", fontWeight: 600 }}>/ {retouches.plafond}</span>
              </b>
            </div>
          )}
          {lignesPhotos.map((l, i) => <p key={i} className="fsn-small">{l}</p>)}
          {m.retouchesEpuisees && !photosRetouchees && (
            <div>
              <button type="button" className="fsn-lien" onClick={() => m.voirOffres("retouches", retouches ?? {})}>
                {en ? "More touch-ups: see the plans" : "Plus de retouches : voir les offres"}
              </button>
            </div>
          )}
          {/* (04/11, grille à 3 jauges) Avec la grille, le compte des annonces vit dans la carte « coût » et la
              phrase « ne coûte rien de plus » (fausse avec la jauge Publications) disparaît. */}
          {!m.cout && m.quotas?.annonces?.plafond != null && (
            <div className="fsn-row fsn-row--between">
              <span className="fsn-small">{en ? "Listings this month" : "Annonces ce mois-ci"}</span>
              <b className="fsn-small fsn-strong num">
                {en ? `${m.quotas.annonces.restantes ?? 0} left` : `${m.quotas.annonces.restantes ?? 0} restante${(m.quotas.annonces.restantes ?? 0) > 1 ? "s" : ""}`}
                {" "}<span style={{ color: "var(--fs-mute)", fontWeight: 600 }}>/ {m.quotas.annonces.plafond}</span>
              </b>
            </div>
          )}
          {!m.cout && !aUneFiche && (
            <p className="fsn-small">
              {en ? "Writing counts 1 listing, once. Publishing on several platforms costs nothing more." : "La rédaction compte 1 annonce, une seule fois. Publier sur plusieurs plateformes ne coûte rien de plus."}
            </p>
          )}
        </Carte>
      )}

      {/* Analyse des photos par l'IA (même moteur que Lens) — conservée. */}
      {nb > 0 && !m.analysisHidden && !aUneFiche && !m.rien && (
        <Carte gravite="flat" style={{ gap: 8 }}>
          {m.photoAnalysis ? (
            <div className="fsn-small">
              <b className="fsn-strong">{en ? "Photos analysed" : "Photos analysées"}</b>{" · "}
              {[m.photoAnalysis.marque, m.photoAnalysis.taille_estimee, m.photoAnalysis.matiere,
                m.photoAnalysis.prix_vente_suggere != null ? (en ? `suggested ${montantAnglais(m.photoAnalysis.prix_vente_suggere) || `€${m.photoAnalysis.prix_vente_suggere}`}` : `prix conseillé ${m.photoAnalysis.prix_vente_suggere} €`) : null,
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
      {!aUneFiche && !m.rien && (
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

// (04/11/2026, grille à 3 jauges — maquette 4.1) La carte « coût » de la publication à l'unité.
//   cout : coutPublication(besoin, jauges) + { jauges, besoin, redaction } — calculé par la coque (StepperNouveau).
// Texte déjà rédigé : aucune annonce dans la phrase. Business : « Il te restera : illimité. ». Une jauge qui ne
// suffit pas : ce qu'il en reste, sans « il te restera » (le bouton du bas le dit, avant l'appui).
function CarteCout({ cout, lang }) {
  const en = lang === "en";
  const { jauges, besoin } = cout;
  const compte = (cle, n) => `${nombre(n, lang)} ${motJauge(cle, n, lang)}`;
  let reste = cout.reste;
  const gras = [];
  if (!cout.suffit && cout.bloque) {
    const r = jauges[cout.bloque]?.restantes ?? 0;
    reste = en ? `You have ${compte(cout.bloque, r)} left this month.` : `Il te reste ${compte(cout.bloque, r)} ce mois-ci.`;
    gras.push(compte(cout.bloque, r));
  } else if (reste) {
    if (/illimité\.$|unlimited\.$/.test(reste)) gras.push(nombre(Infinity, lang));
    else for (const [cle, v] of [["annonces", cout.resteA], ["publications", cout.resteP]]) if (besoin[cle] > 0 && Number.isFinite(v)) gras.push(compte(cle, v));
  }
  return (
    <Carte gravite={null} data-cout="unite">
      {cout.utilise && <div className="fsn-card-t">{cout.utilise}</div>}
      {cout.utilise && reste && (
        <div className="fsn-card-p">
          {!cout.redaction && cout.suffit ? (en ? "Your text is already written: no listing is used. " : "Ton texte est déjà rédigé : aucune annonce n'est utilisée. ") : null}
          <ResteEnGras phrase={reste} gras={gras} />
        </div>
      )}
      <MiniJauge cle="annonces" jauge={jauges.annonces} pris={besoin.annonces} lang={lang} />
      <MiniJauge cle="publications" jauge={jauges.publications} pris={besoin.publications} lang={lang} />
      <p className="fsn-small">{en ? "1 listing for the AI writing, 1 publication per ticked platform." : "1 annonce pour la rédaction par l'IA, 1 publication par plateforme cochée."}</p>
    </Carte>
  );
}
