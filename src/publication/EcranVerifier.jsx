// ═══════════════════════════════════════════════════════════════════════════
// U2 — « CE QUI VA PARTIR » (24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Le texte du vendeur en carte de tête (prix, titre, description, état : le
// bloc général du 21/09, avec la rangée « Reprendre le texte de : … » du
// 23/09), puis une ligne par plateforme, repliée, avec son rayon et ce qui
// diffère — et la QUESTION manquante dite UNE fois, sur sa ligne.
// Le corps des cartes par plateforme (titre, description, état, rayon, champs
// du rayon, livraison Leboncoin / eBay, prix par plateforme) est CELUI de
// l'ancien écran, rendu par le même composant (StepGeneration, variante
// « nouvelle ») : rien n'est réécrit, tout est câblé comme aujourd'hui.
import { StepGeneration } from "../components/ListingPreviewScreen";
import { urlPhoto } from "../utils/photos";
import { Carte } from "./composants";

export default function EcranVerifier({ m }) {
  const en = m.lang === "en";
  const enCours = m.generatingPlatforms || (!m.platformListings && !m.platformError);
  const photos = m.processedPhotos?.length ? m.processedPhotos : (m.photos ?? []);
  return (
    <>
      <div>
        <p className="fsn-eyebrow">{en ? "Step 2 of 3" : "Étape 2 sur 3"}</p>
        <h1 className="fsn-h" style={{ marginTop: 4 }}>{en ? "What will go out" : "Ce qui va partir"}</h1>
        {!enCours && (
          <p className="fsn-lead" style={{ marginTop: 4 }}>
            {m.texteDuVendeur
              ? (en ? "Your text goes out as it is. Tap a platform to adjust only what differs." : "Ton texte part tel quel. Appuie sur une plateforme pour ajuster seulement ce qui diffère.")
              : (en ? "Check the text, then tap a platform to adjust only what differs." : "Vérifie le texte, puis appuie sur une plateforme pour ajuster seulement ce qui diffère.")}
          </p>
        )}
      </div>

      {!enCours && photos.length > 0 && (
        <div className="fsn-thumbs">
          {photos.map((ph, i) => (
            <div key={i} className="fsn-thumb" onClick={() => m.setLightboxUrl(urlPhoto(ph))}><img src={urlPhoto(ph)} alt="" /></div>
          ))}
        </div>
      )}

      {/* La rédaction n'a pas abouti : UNE carte (rouge = refus), le bouton du
          pied propose de réessayer — pas le bloc et le bouton de l'ancien
          écran en plus. Le message est celui du serveur, en clair. */}
      {/* Rien de coché parmi les copies rédigées (tout est en ligne, ou fermé) :
          on le dit ici, dans les mots du nouveau parcours, et on renvoie à
          l'écran d'avant — pas « l'étape des photos », qui n'existe plus. */}
      {!enCours && m.platformListings && ![...m.selected].some(p => m.platformListings.platforms?.[p]) && (
        <Carte gravite="geste" titre={en ? "No platform selected" : "Aucune plateforme cochée"}>
          <div className="fsn-card-p">
            {en
              ? "Go back to the previous screen to choose where to publish. Platforms already online for this item stay locked."
              : "Reviens à l'écran précédent pour choisir où publier. Les plateformes où cet article est déjà en ligne restent verrouillées."}
          </div>
        </Carte>
      )}
      {!enCours && !m.platformListings && m.platformError ? (
        <Carte gravite="refus" titre={en ? "The listing could not be written" : "La rédaction n'a pas abouti"}>
          <div className="fsn-card-p">{m.platformError}</div>
          <div className="fsn-small" style={{ color: "inherit" }}>
            {en ? "Nothing was counted for a failed attempt. Try again below." : "Une tentative qui échoue n'est pas décomptée. Réessaie ci-dessous."}
          </div>
        </Carte>
      ) : (
        /* Le moteur de l'ancien écran, dans la peau du nouveau : en-tête et
           bande de photos masqués (ils sont ici), puce d'état par plateforme. */
        <StepGeneration {...m.propsStepGeneration} variante="nouvelle" etatsParPlateforme={m.etatsParPlateforme} />
      )}

      {!enCours && m.nbQuestions > 0 && (
        <Carte gravite="geste">
          <div className="fsn-card-p">
            {en
              ? `${m.nbQuestions} question${m.nbQuestions > 1 ? "s" : ""} before publishing — asked once, at the next step.`
              : `${m.nbQuestions} question${m.nbQuestions > 1 ? "s" : ""} avant de publier — posée${m.nbQuestions > 1 ? "s" : ""} une fois, à l'écran suivant.`}
          </div>
        </Carte>
      )}
    </>
  );
}
