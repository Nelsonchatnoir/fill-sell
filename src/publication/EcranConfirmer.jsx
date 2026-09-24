// ═══════════════════════════════════════════════════════════════════════════
// U3 — « CONFIRMER » : les questions, puis le geste qui engage (24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// L'écran Publier de l'ancien stepper, refait :
//   · le RAPPEL DE L'ARTICLE (photo, titre, prix, état, plateformes) — il
//     n'existait pas sur l'écran qui engage ;
//   · UNE rangée de plateformes, chacune avec son état et le geste qui
//     débloque (« Confirme la publication » dit l'état, lot 51e8835) — on peut
//     recocher ici (défaut n°5), ce qui est verrouillé dit pourquoi ;
//   · UN bloc de questions (BlocQuestions) — plus d'encarts bleus qui répètent
//     la même pointure quatre fois ;
//   · des cartes d'état à UNE couleur par gravité : information (sarcelle),
//     geste ou attente (ambre), refus (rouge) ;
//   · les EXCLUSIONS ANNONCÉES avant le clic : « Partiront : … · Ne partira
//     pas : Beebs (adresse de remise manquante) » — plus jamais silencieuses.
import BoutonMeConnecter from "../components/BoutonMeConnecter";
import { MOTIFS } from "../utils/connexionPlateformes";
import { Carte, Puce, Logo, CarteArticle } from "./composants";
import { NOM } from "./texte";
import BlocQuestions from "./BlocQuestions";

const LIBELLE_MOTIF = {
  fr: { sans_adresse: "adresse de remise manquante", interdite: "produit refusé par la plateforme", sans_annonce: "aucune annonce rédigée", champ_manquant: "attend une réponse" },
  en: { sans_adresse: "pickup address missing", interdite: "product refused by the platform", sans_annonce: "no listing written", champ_manquant: "waiting for an answer" },
};

export default function EcranConfirmer({ m }) {
  const en = m.lang === "en";
  const L = LIBELLE_MOTIF[en ? "en" : "fr"];
  const t = m.t; const tpl = m.tpl;
  const chips = [...m.selected].filter(p => m.platformListings?.platforms?.[p]);
  // Ordre STABLE : celui de « Où publier ? » (plateformesAffichees), limité
  // aux copies rédigées. Trié « cochées d'abord », une ligne changeait de
  // place sous le doigt qui venait de la toucher — et le tap suivant tombait
  // sur une autre.
  const copies = Object.keys(m.platformListings?.platforms ?? {});
  const ordre = [...(m.plateformesAffichees ?? []).filter(p => copies.includes(p)), ...copies, ...chips];
  const toutes = [...new Set(ordre)].filter(p => !m.pausedPlatforms.includes(p));
  const voies = m.voiesDuLot;
  const ex = m.exclusionsPrevues;
  const partent = ex.aPublier;
  const exclues = ex.exclues;
  const sessionsFermees = m.platformSessions ? voies.extension.filter(p => m.platformSessions[p] === false) : [];
  const sessionsOk = m.platformSessions ? voies.extension.filter(p => m.platformSessions[p] === true) : [];

  if (m.inventoryFull) {
    const n = m.stockCount ?? m.stockLimitCfg;
    return (
      <>
        <div>
          <p className="fsn-eyebrow">{en ? "Step 3 of 3" : "Étape 3 sur 3"}</p>
          <h1 className="fsn-h" style={{ marginTop: 4 }}>{en ? "Your free stock is complete" : "Ton stock gratuit est complet"}</h1>
        </div>
        <Carte titre={`${Math.min(n, m.stockLimitCfg)}/${m.stockLimitCfg} ${en ? "items" : "articles"}`}>
          <div className="fsn-card-p">
            {en
              ? `Your listings are ready — all that's missing is a stock slot. The free plan holds ${m.stockLimitCfg} active items.`
              : `Tes annonces sont prêtes — il ne manque qu'une place en stock. Le plan gratuit s'arrête à ${m.stockLimitCfg} articles actifs.`}
          </div>
          <div className="fsn-small">
            {en
              ? "Prefer to stay on the free plan? Free up a slot from the Stock tab, then come back — your listings will still be here."
              : "Tu préfères rester en gratuit ? Libère une place depuis l'onglet Stock, puis reviens — tes annonces t'attendent ici."}
          </div>
        </Carte>
      </>
    );
  }

  return (
    <>
      <div>
        <p className="fsn-eyebrow">{en ? "Step 3 of 3" : "Étape 3 sur 3"}</p>
        <h1 className="fsn-h" style={{ marginTop: 4 }}>{m.nbQuestions > 0 ? (m.nbQuestions === 1 ? (en ? "One question, then publish" : "Une question, puis on publie") : (en ? `${m.nbQuestions} questions, then publish` : `${m.nbQuestions} questions, puis on publie`)) : (en ? "Confirm the publication" : "Confirme la publication")}</h1>
      </div>

      <CarteArticle
        photo={(m.processedPhotos?.[0] ?? m.photos?.[0]) ?? null}
        titre={m.titreArticle}
        sousTitre={[m.etatArticle, partent.length ? partent.map(NOM).join(", ") : null].filter(Boolean).join(" · ")}
        prix={m.price}
        prixVide={en ? "no price" : "prix manquant"}
        lang={m.lang}
        onPhoto={m.setLightboxUrl}
      />

      {m.publishError && <Carte gravite="refus" titre={en ? "Not published" : "Pas publié"}><div className="fsn-card-p">{m.publishError}</div></Carte>}

      <BlocQuestions m={m} />

      {/* ── Les plateformes : cocher, décocher, et lire l'état de ce qui est verrouillé ── */}
      <div>
        <p className="fsn-eyebrow" style={{ marginBottom: 8 }}>{en ? "Platforms" : "Plateformes"}</p>
        <div className="fsn-stack">
          {toutes.map(p => {
            const verrouillee = m.lockedSet.has(p);
            const cochee = !verrouillee && chips.includes(p);
            const a = m.attentes?.[p];
            const exclue = exclues.find(e => e.platform === p);
            let sous = null; let ton = null; let geste = null;
            if (verrouillee) {
              sous = m.motifsVerrouillage?.[p] ?? ""; ton = a?.bloque ? "geste" : "ok";
              if (a?.bloque && m.userId && a.kind === "attente_autorisation") geste = <BoutonMeConnecter userId={m.userId} platform={p} motif={MOTIFS.AUTORISER_OPLA} lang={m.lang} variante="bouton" />;
              else if (a?.bloque && m.userId && a.kind === "attente_connexion") geste = <BoutonMeConnecter userId={m.userId} platform={p} motif={a.motif === "reauth_ebay" ? MOTIFS.REAUTH_EBAY : MOTIFS.CONNEXION} lang={m.lang} variante="bouton" />;
              else if (a?.bloque && a.kind === "attente_champ" && m.onCompleter) geste = (
                <button type="button" className="fsn-btn fsn-btn--secondary fsn-btn--sm" onClick={() => m.onCompleter(a.job)}>
                  {en ? `Complete “${a.champ}”` : `Compléter « ${a.champ} »`}
                </button>
              );
            } else if (cochee && exclue) {
              sous = (en ? "Won't go out: " : "Ne partira pas : ") + L[exclue.motif] + (exclue.motif === "champ_manquant" && exclue.champs?.length ? ` (${exclue.champs.join(", ")})` : "");
              ton = "geste";
            } else if (cochee && m.questionsParPlateforme?.[p]?.length) {
              // Retenue par une question posée au-dessus : on le dit sur SA
              // ligne, jamais « prête » avec un bouton gris.
              sous = (en ? "Waiting for an answer: " : "Attend une réponse : ") + m.questionsParPlateforme[p].join(", ");
              ton = "geste";
            } else if (cochee && a?.kind === "refusee") {
              sous = m.phraseEtat(p, a); ton = "geste";
            } else if (cochee && p === "ebay" && m.ebayVoieApiReelle) {
              sous = en ? "Goes out from our servers" : "Part de nos serveurs"; ton = "ok";
            } else if (cochee && m.platformSessions?.[p] === true) {
              sous = en ? "Signed in — ready" : "Connectée — prête"; ton = "ok";
            } else if (cochee) {
              sous = en ? "Ready" : "Prête"; ton = "ok";
            } else {
              sous = en ? "Not selected — tap to add" : "Non cochée — appuie pour l'ajouter"; ton = null;
            }
            return (
              <div key={p}>
                <button
                  type="button"
                  className={`fsn-pf${cochee ? " fsn-pf--on" : ""}${verrouillee ? " fsn-pf--dis" : ""}`}
                  disabled={verrouillee}
                  aria-pressed={verrouillee ? undefined : cochee}
                  onClick={verrouillee ? undefined : () => m.setSelected(prev => { const s = new Set(prev); if (s.has(p)) s.delete(p); else s.add(p); return s; })}
                >
                  <span className={`fsn-check${cochee ? " fsn-check--on" : ""}${verrouillee ? " fsn-check--dis" : ""}`} aria-hidden="true">{cochee ? "✓" : ""}</span>
                  <Logo platform={p} size={26} desature={verrouillee} />
                  <span className="fsn-pf-t"><b>{NOM(p)}</b>{sous ? <small>{sous}</small> : null}</span>
                  {ton ? <Puce ton={ton}>{ton === "ok" ? (verrouillee ? (en ? "Live" : "En ligne") : "✓") : "!"}</Puce> : null}
                </button>
                {geste ? <div className="fsn-pf-geste" style={{ padding: "0 4px" }}>{geste}</div> : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Les exclusions, dites AVANT le clic ── */}
      {chips.length > 0 && (
        <Carte gravite={exclues.length ? "geste" : "info"}>
          <div className="fsn-card-p">
            <b>{en ? "Will go out: " : "Partiront : "}</b>{partent.length ? partent.map(NOM).join(", ") : (en ? "nothing yet" : "rien pour l'instant")}
          </div>
          {exclues.length > 0 && (
            <ul>
              {exclues.map(e => (
                <li key={e.platform}>
                  <b>{NOM(e.platform)}</b> — {L[e.motif]}{e.motif === "champ_manquant" && e.champs?.length ? ` : ${e.champs.join(", ")}` : ""}
                  {e.motif === "champ_manquant" ? (en ? " (answer above and it goes out too)" : " (réponds ci-dessus et elle part aussi)") : ""}
                </li>
              ))}
            </ul>
          )}
          <div className="fsn-small" style={{ color: "inherit" }}>
            {voies.toutServeur
              ? t("stepPublishServeurText")
              : voies.mixte
              ? tpl("stepPublishMixteText", { extension: voies.extension.map(NOM).join(", "), serveur: voies.serveur.map(NOM).join(", ") })
              : (en ? "Publishing runs in Chrome on your computer, by itself. You can close this screen." : "La publication se fait dans Chrome sur ton ordinateur, toute seule. Tu peux fermer cet écran.")}
          </div>
        </Carte>
      )}

      {/* ── Ce qui attend un geste (ambre) ── */}
      {m.oplaAcces === false && m.selected.has("opla") && (
        <Carte gravite="geste" titre={en ? "Opla is waiting for your permission" : "Opla attend ton autorisation"}>
          <div className="fsn-card-p">
            {en
              ? "You can publish now: the Opla listing waits for the permission, then goes out on its own. The other platforms go out right away."
              : "Tu peux publier maintenant : l'annonce Opla attendra l'autorisation, puis partira toute seule. Les autres plateformes partent tout de suite."}
          </div>
          {m.userId && <div><BoutonMeConnecter userId={m.userId} platform="opla" motif={MOTIFS.AUTORISER_OPLA} lang={m.lang} variante="bouton" /></div>}
        </Carte>
      )}
      {sessionsFermees.length > 0 && (
        <Carte gravite="geste" titre={en ? "Not signed in on some platforms" : "Session fermée sur certaines plateformes"}>
          <div className="fsn-card-p">{en ? "The listing will wait until you sign in on your computer. Nothing is blocked." : "L'annonce attendra que tu te connectes sur ton ordinateur. Rien n'est bloqué."}</div>
          {sessionsFermees.map(p => (
            <div key={p} className="fsn-row fsn-row--wrap">
              <span className="fsn-grow"><b>{NOM(p)}</b></span>
              {m.userId && <BoutonMeConnecter userId={m.userId} platform={p} motif={MOTIFS.CONNEXION} lang={m.lang} variante="bouton" />}
            </div>
          ))}
        </Carte>
      )}
      {m.lbcAdresseManquante && (
        <Carte gravite="geste" titre={en
          ? `Pickup address missing — ${m.lbcAdresseManquante.plateformes.map(NOM).join(" and ")} won't be published`
          : `Adresse de remise manquante — ${m.lbcAdresseManquante.plateformes.map(NOM).join(" et ")} ne partira pas`}>
          <div className="fsn-card-p">
            {en
              ? <>These marketplaces ask for a pickup address on every listing. Open <b>Settings ⚙️ → “Leboncoin pickup address”</b>, enter your street, postal code and city, then come back and publish again.</>
              : <>Ces plateformes réclament une adresse de remise à chaque annonce. Va dans <b>Réglages ⚙️ → « Adresse de remise Leboncoin »</b>, saisis ta rue, ton code postal et ta ville, puis reviens publier.</>}
          </div>
        </Carte>
      )}
      {m.jumeaux.length > 0 && (
        <Carte gravite="geste" titre={en
          ? `A similar item is already online on ${m.jumeaux.map(j => NOM(j.platform)).join(", ")}`
          : `Un article qui ressemble est déjà en ligne sur ${m.jumeaux.map(j => NOM(j.platform)).join(", ")}`}>
          <div className="fsn-card-p">
            {en
              ? "If it is the same object, publishing here puts a second copy on sale. If you really own two of them, ignore this: nothing is blocked."
              : "Si c'est bien le même objet, publier ici en mettra un deuxième en vente. Si tu en as réellement deux exemplaires, ignore ce message : rien n'est bloqué."}
          </div>
          {m.jumeaux.map(j => (
            <div key={`${j.platform}:${j.url ?? j.titre}`} className="fsn-row">
              <span className="fsn-grow fsn-card-p">
                <b>{NOM(j.platform)}</b> · {j.titre}{j.prix != null ? ` — ${j.prix} €` : ""}
                {j.preuve === "photo" ? <span className="fsn-small" style={{ color: "inherit" }}> · {en ? "same photo" : "même photo"}</span> : null}
              </span>
              {j.url && <a href={j.url} target="_blank" rel="noopener noreferrer" style={{ whiteSpace: "nowrap" }}>{en ? "see it ↗" : "voir ↗"}</a>}
            </div>
          ))}
        </Carte>
      )}
      {m.pausedPlatforms.filter(p => NOM(p)).map(p => (
        <Carte key={p} gravite="geste" titre={NOM(p)}>
          <div className="fsn-card-p">{m.pausedReasons[p] || tpl("stepPublishMaintenanceBanner", { platform: NOM(p) })}</div>
        </Carte>
      ))}

      {/* ── Ce qu'on te dit, sans geste à faire (sarcelle) ── */}
      {m.lbcPhotoCap && (
        <Carte gravite="info" titre={en ? `Leboncoin: only ${m.lbcPhotoCap.quota} free photos in this category` : `Leboncoin : ${m.lbcPhotoCap.quota} photos gratuites seulement dans cette catégorie`}>
          <div className="fsn-card-p">
            {en
              ? `Your item is filed under “${m.lbcPhotoCap.categorie}”. Only the first ${m.lbcPhotoCap.quota} of your ${m.lbcPhotoCap.total} photos go to Leboncoin; the other platforms get them all.`
              : `Ton article est rangé en « ${m.lbcPhotoCap.categorie} ». Seules les ${m.lbcPhotoCap.quota} premières de tes ${m.lbcPhotoCap.total} photos partent sur Leboncoin ; les autres plateformes les reçoivent toutes.`}
          </div>
        </Carte>
      )}
      {m.descriptionMentions && (
        <Carte gravite="info" titre={en ? "Your description mentions another platform" : "Ta description parle d'une autre plateforme"}>
          <div className="fsn-card-p">{m.descriptionMentions.message}</div>
          <div className="fsn-small" style={{ color: "inherit" }}>{en ? "Nothing is blocked: it goes out as it is unless you edit it at the previous step." : "Rien n'est bloqué : elle part telle quelle si tu n'y touches pas — tu peux la modifier à l'étape précédente."}</div>
        </Carte>
      )}
      {sessionsOk.length > 0 && sessionsFermees.length === 0 && (
        <div className="fsn-row fsn-row--wrap" style={{ gap: 6 }}>
          {sessionsOk.map(p => <Puce key={p} ton="ok" point>{NOM(p)} {en ? "signed in" : "connectée"}</Puce>)}
        </div>
      )}
    </>
  );
}
