// ═══════════════════════════════════════════════════════════════════════════
// « PUBLIER » SUR UNE FICHE PAS ENCORE LUE : QUELQUES SECONDES, JAMAIS UNE IMPASSE (25/10/2026, Jocabroc)
// ═══════════════════════════════════════════════════════════════════════════
// La méthode décidée par Nico le 25/10 : « la fiche doit être COMPLÈTE dès l'import, pour qu'au clic « Publier »
// il n'y ait aucune attente » — l'extension lit chaque annonce importée en arrière-plan (lecture de fond,
// _shared/lecture-fond.js). Cet écran n'est que le DERNIER RECOURS, pour une fiche pas encore lue : il lit
// l'annonce tout de suite (page publique, extension ≥ 0.6.144 : une à deux secondes), ouvre le stepper dès
// qu'elle est lue, et ne propose jamais d'écrire à la place du vendeur — « Écrire ma description » n'existe que
// si l'annonce d'origine n'en a VRAIMENT aucune (le stepper s'ouvre alors avec cette précision).
// Avant (audit du 25/10, E1) : une bulle de 7 s puis rien — aucun écran, aucun job ; Jocabroc a cliqué
// « Publier » sur ses fiches Vinted importées le 25/10 (11:43, 13:20…) et rechargé huit fois sa page en 16 min.
// Ici :
//   · une lecture tout de suite, puis toutes les 6 s, 5 min au plus, onglet visible (utils/relectureBornee),
//     une à la fois ; la règle relue en base (lectureOrigine) ouvre le stepper dès qu'elle ne retient plus ;
//   · ce qui se passe, dit en clair (extension absente de cet appareil, page à recharger après une mise à jour) ;
//   · « Fermer » laisse la lecture continuer en arrière-plan ;
//   · chaque attente abandonnée est signalée au serveur (utils/actionRatee) — plus jamais un échec invisible.
//
// ── (26/10 nuit, point 9 — patrick giry) SANS LECTEUR, PAS D'ATTENTE : LA VÉRITÉ, PUIS TROIS ISSUES ─────────────
// Sur Android, son poste éteint depuis 17:15 et en 0.6.141, cet écran lui promettait « la lecture se fait depuis ton
// ordinateur » : rien ne pouvait la faire. L'hôte (StockTab) lit désormais le LECTEUR au clic (lectureOrigine,
// lireLecteurVinted ; règle : attenteLectureRegles.lecteurDisponible) et le passe ici :
//   · un lecteur existe (ou on ne sait pas) : l'écran d'avant, à l'identique — jamais « Écrire ma description »
//     pendant une attente qui aboutira (règle du 25/10) ;
//   · aucun lecteur : la phrase vraie (phraseSansLecteur), puis « Écrire ma description » (le principal : un champ,
//     le lien vers l'annonce Vinted pour copier son texte, la description enregistrée sur la fiche, marquée manuelle),
//     « La faire rédiger par FillSell » (le stepper rédige, la personne relit ; rien n'est écrit sur la fiche) ou
//     « Attendre mon ordinateur » (l'attente, vraie : le lecteur se relit, elle reprend dès qu'un poste à jour revient).
// Les mots et les règles vivent dans attenteLectureRegles.js (purs, testés : attente-sans-lecteur-selftest).
//
// ── (28/10, Juliette, Petite planète — 16 écrans fermés après 0 à 16 s) L'ATTENTE TIENT, PUIS A SES ISSUES ─────────
// Sur un téléphone, l'écran disait « Ferme, et publie dès qu'elle est lue » et se fermait au moindre appui à côté :
// l'ordinateur lisait pourtant la page 12 s à 2 min plus tard (Juliette 20:47:10 → lue 20:47:22, écran fermé à
// 20:47:11). Désormais : la phrase dit que l'ordinateur lit (moins de 2 min en général) et de garder l'écran ouvert ;
// seul « Fermer » ferme pendant une attente ; passé 3 min sans lecture (attenteLectureRegles.lecteurEnRetard), la
// vérité et les issues « Écrire ma description » / « La faire rédiger par FillSell » s'ajoutent — la relecture continue.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { demarrerRelecture } from "../utils/relectureBornee";
import {
  attenteLectureOrigine, messageLectureOrigine, ecrireDescriptionSansLecteur, noterChoixSansLecteur, tracerChoixSansLecteur,
} from "./lectureOrigine";
import { completerTexteDuVendeur } from "./texteDuVendeur";
import { signalerActionRatee } from "../utils/actionRatee";
import {
  depuisEnMots, RELECTURE_ATTENTE_MS, RELECTURE_ATTENTE_MAX_MS, RELECTURE_SANS_LECTEUR_MS, ATTENTE_SANS_LECTEUR_MAX_MS,
  issuesSansLecteur, phraseSansLecteur, libellesSansLecteur, texteAttenteSansLecteur, urlAnnonceVinted, descriptionEcriteSuffisante,
  lecteurEnRetard, texteAttenteParOrdinateur,
} from "./attenteLectureRegles";

export default function AttenteLectureOrigine({
  item, lang = "fr", supabase, userId, extensionVinted = false, lireEbay = null, delaiDetailMs = undefined,
  attenteInitiale = null, onPret, onFermer,
  // (26/10 nuit, point 9) Le lecteur lu au clic (null : on ne sait pas — l'écran d'avant) et de quoi le relire.
  lecteurInitial = null, lireLecteur = null,
}) {
  const en = lang === "en";
  const L = libellesSansLecteur(lang);
  const [depuis] = useState(() => Date.now());
  const [horloge, setHorloge] = useState(() => Date.now());
  const [attente, setAttente] = useState(attenteInitiale);
  const [pontMort, setPontMort] = useState(false);
  const [lecteur, setLecteur] = useState(lecteurInitial);
  // « choix » : sans lecteur, les trois issues · « ecrire » : le champ description · « attente » : la lecture attendue.
  const [mode, setMode] = useState(() => (issuesSansLecteur(lecteurInitial).length ? "choix" : "attente"));
  const [debutAttente, setDebutAttente] = useState(() => Date.now());
  const [relectureFinie, setRelectureFinie] = useState(false);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState(null);
  const fini = useRef(false);
  const enLecture = useRef(false);
  const dernierItem = useRef(item);
  const derniereNote = useRef(null);
  const lecteurRef = useRef(lecteurInitial);

  // Horloge d'AFFICHAGE seulement (aucune lecture de base).
  useEffect(() => {
    const t = setInterval(() => setHorloge(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // (26/10 nuit) Rien ne se relit pendant que la personne choisit ou écrit : la relecture est celle de l'attente.
    if (mode !== "attente") return undefined;
    if (!supabase || !userId || item?.id == null) return undefined;
    const pret = async () => {
      if (fini.current) return;
      fini.current = true;
      let relu = dernierItem.current;
      try {
        const { data } = await supabase.from("inventaire").select("description").eq("id", item.id).eq("user_id", userId).maybeSingle();
        if (data && typeof data.description === "string" && data.description.trim()) relu = { ...relu, description: data.description };
      } catch { /* le stepper relit de toute façon la fiche */ }
      onPret?.(relu, { note: derniereNote.current });
    };
    const sansLecteurAuDepart = lecteurRef.current?.disponible === false;
    const debut = Date.now();
    let tours = 0;
    let r = null;
    r = demarrerRelecture(async () => {
      if (fini.current) return true;
      tours += 1;
      if (extensionVinted && !enLecture.current) {
        enLecture.current = true;
        try {
          const res = await completerTexteDuVendeur(dernierItem.current, { supabase, userId, extensionVinted, lireEbay, delaiDetailMs });
          if (res?.item) dernierItem.current = res.item;
          derniereNote.current = res?.note ?? null;
          // (28/10, jocabroc8) Le pont suit la DERNIÈRE sonde : un « pont mort » d'un instant (page occupée) ne laisse
          // plus « recharge la page » à l'écran quand la sonde suivante a eu sa réponse.
          setPontMort(res?.note === "pont_mort");
        } catch { /* la relecture suivante réessaie */ }
        finally { enLecture.current = false; }
      }
      // (26/10 nuit) Sans lecteur : le lecteur se relit aussi (dès le 2e tour : il vient d'être lu au clic) — un poste
      // à jour qui revient, et l'attente redevient celle d'avant (relue toutes les 6 s) ; 15 min sans lui, l'écran le
      // dit et ne relit plus.
      if (lecteurRef.current?.disponible === false) {
        if (Date.now() - debut > ATTENTE_SANS_LECTEUR_MAX_MS) { setRelectureFinie(true); r?.arreter(); return true; }
        if (lireLecteur && tours > 1) {
          try {
            const l = await lireLecteur();
            if (l) {
              lecteurRef.current = l;
              setLecteur(l);
              if (l.disponible) r?.changerIntervalle(RELECTURE_ATTENTE_MS);
            }
          } catch { /* relu au tour suivant */ }
        }
      }
      let a;
      try { a = await attenteLectureOrigine(supabase, userId, item.id); } catch { return false; }
      if (!a) { await pret(); return true; }
      setAttente(a);
      return true;
    }, { intervalleMs: sansLecteurAuDepart ? RELECTURE_SANS_LECTEUR_MS : RELECTURE_ATTENTE_MS, maxMs: RELECTURE_ATTENTE_MAX_MS, immediat: true });
    return () => r.arreter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, userId, item?.id, extensionVinted, mode]);

  const ecoule = Math.max(0, horloge - depuis);
  // (28/10) Le lecteur tel que l'écran le traite : en attente depuis 3 min sans lecture, il est « en retard ».
  const lecteurVu = mode === "attente" ? lecteurEnRetard(lecteur, Math.max(0, horloge - debutAttente)) : lecteur;
  const sansLecteur = lecteurVu?.disponible === false;

  const fermer = () => {
    if (!fini.current) {
      signalerActionRatee({ action: "publier", motif: "lecture_origine_abandonnee", userId,
        details: { fiche: item?.id ?? null, attendu_s: Math.round(ecoule / 1000), pont_mort: pontMort, extension: extensionVinted, manque: (attente?.manque ?? []).join(","), note: derniereNote.current,
          sans_lecteur: sansLecteur, mode, raison: lecteurVu?.raison ?? null, ou: lecteur?.ou ?? null, en_retard: lecteurVu?.enRetard === true } });
    }
    fini.current = true;
    onFermer?.();
  };

  // ── (26/10 nuit) Les trois issues, sans lecteur ───────────────────────────────────────────────────────────────
  const trace = (choix) => tracerChoixSansLecteur(supabase, userId, { choix, fiche: item?.id ?? null, lecteur: lecteurVu, details: { plateforme: attente?.plateforme ?? "vinted" } });
  const choisir = async (cle) => {
    if (envoi) return;
    setEchec(null);
    if (cle === "ecrire") { setMode("ecrire"); return; }
    if (cle === "attendre") { trace("attendre"); setDebutAttente(Date.now()); setRelectureFinie(false); setMode("attente"); return; }
    if (cle !== "rediger") return;
    setEnvoi(true);
    const r = await noterChoixSansLecteur(supabase, userId, item?.id);
    setEnvoi(false);
    if (!r?.ok) {
      setEchec(L.echec);
      signalerActionRatee({ action: "publier", motif: "choix_sans_lecteur_non_enregistre", userId, details: { fiche: item?.id ?? null, choix: "redigee", cause: r?.motif ?? null } });
      return;
    }
    trace("redigee");
    fini.current = true;
    onPret?.(dernierItem.current, { choix: "redigee" });
  };
  const enregistrerTexte = async () => {
    if (envoi || !descriptionEcriteSuffisante(texte)) return;
    setEnvoi(true);
    setEchec(null);
    const r = await ecrireDescriptionSansLecteur(supabase, userId, item?.id, texte);
    setEnvoi(false);
    if (!r?.ok) {
      setEchec(L.echec);
      signalerActionRatee({ action: "publier", motif: "description_ecrite_non_enregistree", userId, details: { fiche: item?.id ?? null, cause: r?.motif ?? null } });
      return;
    }
    trace("ecrite");
    fini.current = true;
    onPret?.({ ...dernierItem.current, description: r.description }, { choix: "ecrite" });
  };

  const bouton = (fond, encre, bord) => ({ flex: 1, minWidth: 140, padding: "10px 14px", borderRadius: 10, border: bord ? `1px solid ${bord}` : "none", background: fond, color: encre, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" });
  // (26/10 nuit) Les issues : une principale (sarcelle de l'app), les autres secondaires ; 44 px au moins.
  const issue = (genre) => ({
    width: "100%", minHeight: 46, padding: "11px 14px", borderRadius: 12, fontSize: 14.5, fontWeight: 700, cursor: envoi ? "wait" : "pointer", fontFamily: "inherit",
    ...(genre === "principal" ? { border: "none", background: "linear-gradient(120deg,#2F9E90,#1B6E62)", color: "#fff" }
      : genre === "secondaire" ? { border: "1.5px solid #2F9E90", background: "#fff", color: "#1B6E62" }
        : { border: "1px solid #E5E7EB", background: "#fff", color: "#374151", fontWeight: 600 }),
  });
  const titreStyle = { fontSize: 16, fontWeight: 700, color: "#0D0D0D", marginBottom: 8 };
  const texteStyle = { fontSize: 13.5, lineHeight: 1.5, color: "#374151" };
  const ligneEchec = echec ? <div role="alert" style={{ fontSize: 13, color: "#9B5148", marginTop: 10 }}>{echec}</div> : null;
  const url = urlAnnonceVinted(item);
  const libelle = { ecrire: L.ecrire, rediger: L.rediger, attendre: L.attendre };

  let corps;
  if (mode === "choix") {
    corps = (
      <>
        <div style={titreStyle}>{L.titre}</div>
        <div style={texteStyle}>{phraseSansLecteur(lecteur, { lang, maintenant: horloge })}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {issuesSansLecteur(lecteur).map((x) => (
            <button key={x.cle} type="button" disabled={envoi} onClick={() => choisir(x.cle)}
              style={issue(x.principal ? "principal" : x.cle === "rediger" ? "secondaire" : "discret")}>
              {libelle[x.cle]}
            </button>
          ))}
        </div>
        {ligneEchec}
        <button type="button" onClick={fermer} style={{ display: "block", margin: "8px auto 0", minHeight: 44, padding: "0 16px", border: "none", background: "none", color: "#6B7280", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {L.fermer}
        </button>
      </>
    );
  } else if (mode === "ecrire") {
    const assez = descriptionEcriteSuffisante(texte);
    corps = (
      <>
        <div style={titreStyle}>{L.ecrireTitre}</div>
        {url ? (
          <div style={{ ...texteStyle, marginBottom: 10 }}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#1B6E62", fontWeight: 700 }}>{L.ouvrirVinted}</a> {L.pourCopier}
          </div>
        ) : null}
        {/* Le champ description, vide : 16 px (aucun zoom Safari), ouvert au clavier. */}
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={6} autoFocus
          placeholder={L.placeholder} aria-label={L.ecrireTitre}
          style={{ width: "100%", boxSizing: "border-box", minHeight: 132, padding: "11px 12px", borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 16, lineHeight: 1.4, color: "#0D0D0D", fontFamily: "inherit", resize: "vertical" }} />
        {texte.trim() && !assez ? <div style={{ fontSize: 12.5, color: "#6B7280", marginTop: 6 }}>{L.tropCourt}</div> : null}
        {ligneEchec}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          <button type="button" disabled={!assez || envoi} onClick={enregistrerTexte}
            style={{ ...issue("principal"), ...(!assez ? { background: "#E5E7EB", color: "#374151", cursor: "not-allowed" } : {}) }}>
            {envoi ? L.enregistrement : L.continuer}
          </button>
          {/* (28/10) Venu d'une lecture en retard (un lecteur existe) : retour à l'attente, toujours en retard, pas aux choix. */}
          <button type="button" disabled={envoi} onClick={() => { setEchec(null); setMode(issuesSansLecteur(lecteur).length ? "choix" : "attente"); }} style={issue("discret")}>{L.retour}</button>
        </div>
      </>
    );
  } else if (sansLecteur) {
    // « Attendre mon ordinateur » : l'attente vraie, sans promesse d'heure ; les deux autres issues restent là.
    corps = (
      <>
        <div style={titreStyle}>{L.attenteTitre}</div>
        <div style={texteStyle}>{relectureFinie ? L.attenteFinie : texteAttenteSansLecteur(lecteurVu, { lang, contexte: "stepper" })}</div>
        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 10 }}>{phraseSansLecteur(lecteurVu, { lang, maintenant: horloge })}</div>
        {!relectureFinie ? (
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
            {en ? `Waiting for ${depuisEnMots(Math.max(0, horloge - debutAttente))}.` : `En attente depuis ${depuisEnMots(Math.max(0, horloge - debutAttente))}.`}
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          <button type="button" disabled={envoi} onClick={() => choisir("ecrire")} style={issue("secondaire")}>{L.ecrire}</button>
          <button type="button" disabled={envoi} onClick={() => choisir("rediger")} style={issue("secondaire")}>{L.rediger}</button>
          <button type="button" onClick={fermer} style={issue("discret")}>{en ? "Close (reading continues)" : "Fermer (la lecture continue)"}</button>
        </div>
        {ligneEchec}
      </>
    );
  } else {
    corps = (
      <>
        <div style={titreStyle}>
          {en ? "Reading your original listing…" : "Lecture de ton annonce d'origine…"}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: "#374151" }}>
          {messageLectureOrigine(attente ?? { plateforme: "vinted" }, en ? "en" : "fr", "preparation")}
        </div>
        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 10 }}>
          {pontMort
            ? (en ? "Your extension can't be reached from this page (it was just updated): reload the page."
              : "Ton extension ne répond plus à cette page (elle vient d'être mise à jour) : recharge la page.")
            : !extensionVinted
              // (28/10) Jamais « Ferme » : l'ordinateur lit au poll suivant ; l'écran attend et s'ouvre tout seul.
              ? `${texteAttenteParOrdinateur(lang)} ${en ? `Waiting for ${depuisEnMots(ecoule)}.` : `En attente depuis ${depuisEnMots(ecoule)}.`}`
              : (en ? `In progress for ${depuisEnMots(ecoule)} — the publishing screen opens as soon as it is read.`
                : `En cours depuis ${depuisEnMots(ecoule)} — l'écran de publication s'ouvre dès qu'elle est lue.`)}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {pontMort ? (
            <button type="button" onClick={() => { try { window.location.reload(); } catch { /* rien */ } }}
              style={bouton("#ECFDF5", "#065F46", "#A7F3D0")}>
              {en ? "Reload the page" : "Recharger la page"}
            </button>
          ) : null}
          <button type="button" onClick={fermer} style={{ ...bouton("#fff", "#374151", "#E5E7EB"), fontWeight: 600 }}>
            {en ? "Close (reading continues)" : "Fermer (la lecture continue)"}
          </button>
        </div>
      </>
    );
  }

  const contenu = (
    // (28/10) Un appui à côté ne ferme que l'écran des choix : pendant une attente ou une saisie, seul « Fermer » ferme.
    <div role="dialog" aria-modal="true" onClick={mode === "choix" ? fermer : undefined}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 460, maxHeight: "calc(100dvh - 32px)", overflowY: "auto", padding: "22px 20px", boxShadow: "0 12px 40px rgba(0,0,0,0.18)", fontFamily: "inherit" }}>
        {corps}
      </div>
    </div>
  );
  try { return createPortal(contenu, document.body); } catch { return contenu; }
}
