// ═══════════════════════════════════════════════════════════════════════════
// LE BLOC GÉNÉRAL — PRIX, TITRE, DESCRIPTION, ÉTAT (2026-09-21)
// ═══════════════════════════════════════════════════════════════════════════
// Demande de XEWER (Pro), mot pour mot : « Je voudrais, comme pour le prix,
//  un titre général, une description générale et un état général, appliqués à
//  toutes les plateformes, avec exception possible au crayon. »
// Il refaisait quatre fois la même correction — une par carte.
//
// UN SEUL BLOC, pas quatre cartes. Le prix avait déjà la sienne depuis le
// 14/07 ; les trois autres s'y rangent au lieu d'ouvrir trois encadrés de
// plus. Mêmes tokens, mêmes rayons, mêmes tailles : rien de neuf à dessiner,
// l'écran sera refait plus tard et ce bloc doit s'y fondre sans dette.
//
// ⛔ ZÉRO GESTE EN PLUS. La description est REPLIÉE sur deux lignes d'aperçu :
//    qui ne l'ouvre pas ne tape rien. Aucun champ n'est obligatoire, aucun ne
//    bloque le bouton Publier. Le compte de taps ne bouge pas (3 pour un
//    article préparé, 4 pour un article neuf).
// ⛔ AUCUNE LOGIQUE ICI. Ce fichier AFFICHE et REMONTE ; ce qu'une valeur
//    générale fait aux copies vit dans `src/utils/valeursGenerales.js`.
//    C'est la consigne « code rangé pour la refonte ».
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { ETATS_GENERAUX } from "../../supabase/functions/_shared/etat-plateformes.js";

export default function BlocValeursGenerales({
  T, t, lang = "fr",
  // Prix — inchangé, simplement rangé ici. Le bouton « Estimer » et l'analyse
  // de marché arrivent par `enfantsPrix` : ce bloc n'a pas à connaître leur
  // contenu, il leur garde seulement leur place sous le champ.
  price, onPrixChange, prixManquant,
  estimateError = "", enfantsPrix = null,
  // Les trois valeurs générales.
  titre, onTitreChange,
  description, onDescriptionChange,
  etat, onEtatChange,
  // Nombre de plateformes qui suivront (0 → on n'affiche que le prix).
  nbSuiveuses = 0,
  // ── LES VERSIONS DU TEXTE (2026-09-23, chantier 3) ─────────────────────
  // `versions` : [{ platform, titre, description, date, enLigne, url }] — ce
  // que chaque plateforme affiche EN LIGNE (relevé) ; `ficheTexte` : le texte
  // de la fiche FillSell. Sous le titre et sous la description, une rangée de
  // « Reprendre le texte de : Beebs · 19/09 · Leboncoin · 23/09 · Ma fiche »
  // n'apparaît que quand une version DIFFÈRE de ce qui est dans le champ. Un
  // tap pose ce texte comme valeur générale — la personne choisit, rien ne
  // s'écrase sans elle.
  versions = [], ficheTexte = null,
}) {
  const [descOuverte, setDescOuverte] = useState(false);
  const en = lang === "en";
  const NOMS = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", ebay: "eBay", opla: "Opla" };
  const dateCourte = (iso) => {
    const d = new Date(iso ?? "");
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString(en ? "en-GB" : "fr-FR", { day: "2-digit", month: "2-digit" }) : "";
  };
  // Les versions qui diffèrent de la valeur courante d'un champ, dédoublonnées
  // par texte (deux plateformes qui portent le même texte = une seule puce).
  const versionsPour = (champ, courante) => {
    const vues = new Set();
    const out = [];
    const cur = String(courante ?? "").trim();
    const pousser = (v) => { const t = String(v.texte ?? "").trim(); if (!t || t === cur || vues.has(t)) return; vues.add(t); out.push(v); };
    for (const v of [...(versions ?? [])].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))) {
      pousser({ cle: `${v.platform}:${v.date}`, texte: v[champ], libelle: `${NOMS[v.platform] ?? v.platform}${v.date ? ` · ${dateCourte(v.date)}` : ""}${v.enLigne ? "" : (en ? " · offline" : " · hors ligne")}`, url: v.url });
    }
    if (ficheTexte && ficheTexte[champ]) pousser({ cle: "fiche", texte: ficheTexte[champ], libelle: en ? "My item card" : "Ma fiche" });
    return out;
  };
  // Une fonction de rendu, pas un composant défini dans le rendu : un
  // composant créé ici serait recréé (et remonté) à chaque passage.
  const rangeeVersions = (champ, courante, onChoisir) => {
    const liste = versionsPour(champ, courante);
    if (!liste.length) return null;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 8 }} data-versions={champ}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.mute, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {en ? "Use the text from:" : "Reprendre le texte de :"}
        </span>
        {liste.map((v) => (
          <button
            key={v.cle} type="button" title={String(v.texte).slice(0, 300)}
            onClick={() => onChoisir(v.texte)}
            style={{
              padding: "5px 10px", borderRadius: 999, fontFamily: "inherit", fontSize: 12, fontWeight: 600,
              border: `1px solid ${T.border}`, background: T.card, color: T.ink, cursor: "pointer",
            }}
          >
            {v.libelle}
          </button>
        ))}
      </div>
    );
  };
  // Le nombre de lignes RÉELLES du texte du vendeur (\r\n compris : une
  // description venue d'un relevé peut porter des fins de ligne Windows).
  const nbLignesDescription = String(description ?? "").trim()
    ? String(description).trim().split(/\r\n|\r|\n/).length
    : 0;

  const st = {
    bloc: {
      marginBottom: 16, background: T.paper, borderRadius: 16, padding: "14px 15px",
      border: `1px solid ${prixManquant ? T.teal : T.border}`,
      boxShadow: prixManquant ? "0 0 0 3px rgba(47,158,144,0.12)" : "none",
      boxSizing: "border-box",
    },
    // 11 px / 700 sur T.mute (#8A8578 sur #F6F5F1) : même intitulé que la
    // carte Prix d'avant, contraste inchangé.
    intitule: {
      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.08em", color: T.mute, marginBottom: 6,
    },
    champ: {
      width: "100%", padding: "10px 12px", borderRadius: 12,
      border: `1px solid ${T.border}`, fontSize: 13.5, fontFamily: "inherit",
      outline: "none", background: "#fff", color: T.ink, boxSizing: "border-box",
    },
    separateur: { height: 1, background: T.border, margin: "13px 0" },
    lien: {
      background: "none", border: "none", padding: "2px 0", cursor: "pointer",
      fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, color: T.tealDeep,
    },
    // #6B7A75 sur #F6F5F1 : 4,6:1, au-dessus du seuil.
    aide: { fontSize: 11.5, color: T.mute2, marginTop: 6, lineHeight: 1.4 },
  };

  return (
    <div style={st.bloc}>
      <div style={st.intitule}>{t("fieldSalePriceLabel")}</div>
      <input
        type="number"
        inputMode="decimal"
        autoFocus={prixManquant}
        value={price ?? ""}
        onChange={(ev) => onPrixChange(ev.target.value)}
        placeholder={prixManquant ? (en ? "Your price, in €" : "Ton prix, en €") : "—"}
        style={{
          ...st.champ, padding: "12px 14px", fontSize: 17, fontWeight: 700,
          border: `1px solid ${prixManquant ? T.teal : T.border}`,
        }}
      />
      {/* Le bouton « Estimer », l'analyse de marché et l'erreur d'estimation
          restent EXACTEMENT ce qu'ils étaient : l'hôte les passe en enfants,
          ce bloc ne connaît pas leur contenu. */}
      {enfantsPrix}
      {estimateError && (
        <div style={{ fontSize: 12, fontWeight: 600, color: "#B0645A", marginTop: 8 }}>{estimateError}</div>
      )}

      {nbSuiveuses > 0 && (
        <>
          <div style={st.separateur} />
          <div style={st.intitule}>{t("generalTitleLabel")}</div>
          <input
            type="text"
            value={titre ?? ""}
            onChange={(ev) => onTitreChange(ev.target.value)}
            placeholder={t("generalTitlePlaceholder")}
            style={st.champ}
          />
          {rangeeVersions("titre", titre, (v) => onTitreChange(v))}

          <div style={st.separateur} />
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={st.intitule}>{t("generalDescriptionLabel")}</span>
            <button type="button" style={st.lien} onClick={() => setDescOuverte((v) => !v)}>
              {descOuverte ? t("generalCollapse") : t("generalEdit")}
            </button>
          </div>
          {descOuverte ? (
            <textarea
              value={description ?? ""}
              onChange={(ev) => onDescriptionChange(ev.target.value)}
              rows={6}
              placeholder={t("generalDescriptionPlaceholder")}
              style={{ ...st.champ, fontSize: 13, resize: "vertical", lineHeight: 1.5 }}
            />
          ) : (
            // ── L'APERÇU RESPECTE LES RETOURS À LA LIGNE (2026-09-21, 16:25) ──
            // 🚨 LE DÉFAUT, signalé par Louis THONET dans l'heure qui a suivi la
            //    livraison : sa description Beebs porte SIX retours à la ligne et
            //    cet aperçu la rendait TOUT SUR UNE LIGNE. Il a demandé, à juste
            //    titre, « cela va être envoyé comme ça ? ».
            //    La cause était bête et entièrement à moi : sans `white-space`,
            //    HTML écrase tout blanc consécutif — le \n devient une espace.
            //    Le texte en base n'a jamais bougé, l'envoi non plus (vérifié sur
            //    les annonces en ligne, 5 plateformes sur 5). C'est l'aperçu qui
            //    mentait, et un aperçu qui ment sur ce qui va partir est pire
            //    qu'un aperçu absent : il a failli lui faire réécrire son texte.
            // `pre-wrap` + le clamp à 2 : les deux premières VRAIES lignes.
            <div
              data-apercu-description
              onClick={() => setDescOuverte(true)}
              style={{
                fontSize: 13, color: String(description ?? "").trim() ? T.ink : T.mute,
                lineHeight: 1.45, cursor: "pointer", overflowWrap: "anywhere",
                whiteSpace: "pre-wrap",
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                overflow: "hidden", padding: "2px 0",
              }}
            >
              {String(description ?? "").trim() || t("generalDescriptionPlaceholder")}
            </div>
          )}
          {/* ── ET ON LE DIT, PLUTÔT QUE DE LE LAISSER DEVINER ────────────────
              Deux lignes d'aperçu sur une description qui en compte sept, ça
              reste ambigu : on ne voit pas ce qu'on ne voit pas. Cette ligne
              nomme ce qui est là et ce qui part. Elle n'apparaît QUE sur un
              texte à plusieurs lignes — rien à lire quand il n'y a rien à
              rassurer, et aucun geste réclamé dans aucun des deux cas. */}
          {nbLignesDescription > 1 && (
            <div style={{ ...st.aide, marginTop: 4 }}>
              {t("generalDescriptionLines").replace("{n}", String(nbLignesDescription))}
            </div>
          )}
          {rangeeVersions("description", description, (v) => { onDescriptionChange(v); setDescOuverte(true); })}

          <div style={st.separateur} />
          <div style={st.intitule}>{t("fieldConditionLabel")}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ETATS_GENERAUX.map(({ tier, libelle }) => {
              const actif = String(etat ?? "").trim() === libelle;
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => onEtatChange(actif ? "" : libelle)}
                  style={{
                    padding: "7px 11px", borderRadius: 999, fontFamily: "inherit",
                    fontSize: 12.5, cursor: "pointer", fontWeight: actif ? 700 : 600,
                    border: `1px solid ${actif ? T.tealDeep : T.border}`,
                    background: actif ? "#E8F5F3" : T.card,
                    color: actif ? T.tealDeep : T.mute2,
                  }}
                >
                  {libelle}
                </button>
              );
            })}
          </div>
          <div style={st.aide}>{t("generalAppliesToAll")}</div>
        </>
      )}
      {nbSuiveuses === 0 && (
        <div style={st.aide}>
          {en
            ? "Applied to every selected platform. Change a card's price to set it apart."
            : "Appliqué à toutes les plateformes sélectionnées. Modifie le prix d'une carte pour la dissocier."}
        </div>
      )}
    </div>
  );
}
