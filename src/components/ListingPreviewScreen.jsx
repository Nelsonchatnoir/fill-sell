import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { Camera, Check, ChevronLeft, Mic, Plus, X, Sparkles, Pencil, Clock, ImageOff } from "lucide-react";
import ConversionModal from "./ConversionModal";
import CoinStoreModal from "./CoinStoreModal";
import PepiteIcon from "./PepiteIcon";
import PlatformLogo from "./platform-logos/PlatformLogo";
import { useTranslation } from "../i18n/useTranslation";
import { Loader } from "./ui";
import { detectObjectIcon } from "../utils/shared";
import { getVintedCategoryPath, vintedGenreRequired } from "../utils/vintedCategories";
import { getLbcCategoryPath, getLbcBabyEquipment } from "../utils/lbcCategories";
import { getEbayCategoryPath, getEbayCategoryId, ebayGenreRequired } from "../utils/ebayCategories";
import { getBeebsCategoryPath, beebsGenreRequired } from "../utils/beebsCategories";
import { getPlatformSupport } from "../utils/platformCompat";

// Palette identique à LensTab.jsx et à la navbar (thème clair 2026).
const T = {
  canvas:   "#EDEAE0",
  paper:    "#F6F5F1",
  ink:      "#10201B",
  teal:     "#2F9E90",
  tealDeep: "#1B6E62",
  mute:     "#8A8578",
  mute2:    "#6B7A75",
  border:   "#E7E3D8",
  card:     "#FFFFFF",
  chip:     "#F2F0E9",
};

export const PLATFORM_LABELS = { vinted:"Vinted", leboncoin:"Leboncoin", beebs:"Beebs", ebay:"eBay" };
const PLATFORM_COLORS   = { vinted:"#09B584", leboncoin:"#EA5B0C", beebs:"#FF6B35", ebay:"#0064D2" };
const PLATFORMS_DEFAULT = ["vinted","leboncoin","beebs","ebay"];

// ── Champs partagés taille/couleur/matiere/marque (2026-07-11, Sujet 4) ──────
// UNE valeur source par champ (canonicalisée côté generate-listing), deux
// cartes distinctes :
// - PROPAGATION : qui reçoit la valeur répliquée — suit les schémas/handlers
//   réels (taille inclut leboncoin : leboncoin.js remplit la Pointure,
//   critère OBLIGATOIRE sur Mode>Chaussures, depuis fields.taille).
// - GARDE : qui peut BLOQUER la publication si le champ manque — décision
//   produit : jamais Leboncoin sur couleur (aucun champ structuré), et sur
//   taille SEULEMENT pour Mode>Chaussures (la Pointure y est OBLIGATOIRE —
//   "Veuillez choisir une pointure", shoe_size ; le critère taille des
//   autres catégories, clothing_st, n'est pas requis). Cette exception est
//   résolue dynamiquement dans missingSharedFields, pas dans la carte.
const SHARED_FIELD_KEYS = ["taille", "couleur", "matiere", "marque"];
const SHARED_PROPAGATION = {
  taille:  ["vinted", "beebs", "leboncoin", "ebay"],
  couleur: ["vinted", "beebs", "ebay"],
  matiere: ["vinted", "beebs", "leboncoin", "ebay"],
  marque:  ["vinted", "beebs", "leboncoin", "ebay"],
};
const SHARED_GUARD = {
  taille:  ["vinted", "beebs", "ebay"],
  couleur: ["vinted", "beebs", "ebay"],
  matiere: ["vinted", "beebs", "leboncoin", "ebay"],
  marque:  ["vinted", "beebs", "leboncoin", "ebay"],
};

// Options traduites pour l'affichage, mais `value` reste le libellé FR canonique
// envoyé aux plateformes (Vinted/Leboncoin/Beebs restent des sites francophones).
function getPlatformFieldsConfig(t) {
  const condition = {
    newWithTag:    { value:"Neuf avec étiquette", label:t("conditionNewWithTag") },
    newWithoutTag: { value:"Neuf sans étiquette",  label:t("conditionNewWithoutTag") },
    veryGood:      { value:"Très bon état",        label:t("conditionVeryGood") },
    good:          { value:"Bon état",             label:t("conditionGood") },
    satisfactory:  { value:"Satisfaisant",         label:t("conditionSatisfactory") },
    new_:          { value:"Neuf",                 label:t("conditionNew") },
    correct:       { value:"État correct",         label:t("conditionCorrect") },
    forParts:      { value:"Pour pièces",          label:t("conditionForParts") },
  };
  // Beebs écrit ses états AVEC une virgule et n'a pas de "Satisfaisant" : son
  // plus bas niveau est "État moyen" (relevés concordants du 2026-07-08 sur le
  // rayon Mode et du 2026-07-09 sur Figurines). `value` doit être le libellé
  // EXACT de la plateforme — la cascade fuzzy du handler n'est qu'un filet,
  // pas une excuse pour envoyer un libellé qui n'existe pas.
  const beebsCondition = [
    { value:"Neuf, avec étiquette",  label:t("conditionNewWithTag") },
    { value:"Neuf, sans étiquette",  label:t("conditionNewWithoutTag") },
    { value:"Très bon état",         label:t("conditionVeryGood") },
    { value:"Bon état",              label:t("conditionGood") },
    { value:"État moyen",            label:t("conditionAverage") },
  ];
  const sizeLetterOptions  = ["XS","S","M","L","XL","XXL","Unique"].map(v => ({ value:v, label:v }));
  const sizeNumericOptions = [];
  for (let n = 34; n <= 52; n += 2) sizeNumericOptions.push({ value:String(n), label:String(n) });
  const sizeShoeOptions = [];
  for (let half = 70; half <= 92; half++) {
    const label = `EU ${half / 2}`;
    sizeShoeOptions.push({ value:label, label });
  }
  const sizeGroups = [
    { groupLabel:t("sizeGroupGarmentLetter"),  options:sizeLetterOptions },
    { groupLabel:t("sizeGroupGarmentNumeric"), options:sizeNumericOptions },
    { groupLabel:t("sizeGroupShoe"),           options:sizeShoeOptions },
  ];
  const size = [...sizeLetterOptions, ...sizeNumericOptions, ...sizeShoeOptions];
  const packageFormat = [
    { value:"Lettre",           label:t("packageLetter") },
    { value:"Petit colis",      label:t("packageSmall") },
    { value:"Moyen colis",      label:t("packageMedium") },
    { value:"Grand colis",      label:t("packageLarge") },
    { value:"Très grand colis", label:t("packageXLarge") },
    { value:"Non défini",       label:t("packageUndefined") },
  ];

  // Genre : valeurs FR canoniques ("Femme"/"Homme"/…) — clés du mapping
  // catégorie Vinted (src/utils/vintedCategories.js), remplies par l'IA
  // (generate-listing) et corrigeables ici avant publication.
  const gender = [
    { value:"Femme",  label:t("genderWoman") },
    { value:"Homme",  label:t("genderMan") },
    { value:"Enfant", label:t("genderChild") },
    { value:"Mixte",  label:t("genderUnisex") },
  ];

  // Beebs range la Mode en 5 rayons RÉELS — Femme | Homme | Fille | Garçon |
  // Bébé (crawl du sélecteur, docs/beebs-categories-raw.txt : aucune entrée
  // "Enfant" ni "Mixte" dans tout l'arbre). L'ancienne config servait les 4
  // valeurs génériques ci-dessus : un article de mode enfant était donc
  // IMPOSSIBLE à publier sur Beebs — getBeebsCategoryPath ne résolvait rien
  // pour "Enfant", et le message d'erreur demandait de "choisir un genre"
  // alors que l'app n'en proposait aucun de valide (bug du 2026-07-09).
  // "Mixte" reste volontairement absent : Beebs n'a pas de rayon unisexe.
  const beebsGender = [
    { value:"Femme",  label:t("genderWoman") },
    { value:"Homme",  label:t("genderMan") },
    { value:"Fille",  label:t("genderGirl") },
    { value:"Garçon", label:t("genderBoy") },
    { value:"Bébé",   label:t("genderBaby") },
  ];

  // eBay a SEPT rayons exploitables : les 5 genrés + "Enfant : unisexe" (rayon
  // réel, d'où la clé Enfant) + "Parfums mixtes" (seul usage de Mixte, icône
  // 🌸). Le stepper n'offrait que Femme/Homme/Enfant/Mixte : six icônes
  // laissaient alors un TROU atteignable — 👗 👛 🧣 🧤 🧢 🕶️ en genre "Enfant"
  // ne résolvent aucun rayon unisexe, alors que Fille/Garçon/Bébé en ont un
  // (vérifié le 2026-07-09 sur ebayCategories.js). Les exposer ferme ces trous
  // et affine les feuilles partout ailleurs.
  const ebayGender = [
    { value:"Femme",  label:t("genderWoman") },
    { value:"Homme",  label:t("genderMan") },
    { value:"Fille",  label:t("genderGirl") },
    { value:"Garçon", label:t("genderBoy") },
    { value:"Bébé",   label:t("genderBaby") },
    { value:"Enfant", label:t("genderChild") },
    { value:"Mixte",  label:t("genderUnisex") },
  ];

  return {
    vinted: [
      { key:"etat",      label:t("fieldConditionLabel"), type:"select", options:[condition.newWithTag, condition.newWithoutTag, condition.veryGood, condition.good, condition.satisfactory] },
      { key:"taille",    label:t("fieldSizeLabel"),      type:"select", options: size, groups: sizeGroups },
      { key:"genre",     label:t("fieldGenderLabel"),    type:"select", options: gender },
      { key:"marque",    label:t("fieldBrandLabel"),     type:"text" },
      { key:"matiere",   label:t("fieldMaterialLabel"),  type:"text" },
      { key:"couleur",   label:t("fieldColorLabel"),     type:"text" },
      { key:"categorie", label:t("fieldCategoryLabel"),  type:"text" },
    ],
    leboncoin: [
      { key:"etat",         label:t("fieldConditionLabel"),     type:"select", options:[condition.new_, condition.veryGood, condition.good, condition.correct, condition.forParts] },
      // Taille indispensable pour les chaussures : la Pointure est un critère
      // OBLIGATOIRE du rayon Mode>Chaussures LBC ("Veuillez choisir une
      // pointure" bloque l'aperçu — relevé campagne 2026-07-08). Sans cette
      // entrée, mergeFieldsWithLens jette la taille générée par l'IA (même
      // piège que l'univers, documenté plus bas).
      { key:"taille",       label:t("fieldSizeLabel"),          type:"select", options: size, groups: sizeGroups },
      { key:"format_colis", label:t("fieldPackageFormatLabel"), type:"select", options: packageFormat },
      // Univers (rayon Mode LBC) : mêmes libellés que le genre Vinted, mapping
      // 1:1 vérifié (docs/leboncoin-form-survey.md) — LBC a un rayon Mixte.
      // Sans cette entrée, mergeFieldsWithLens jetait l'univers généré par
      // l'IA (aucune clé hors config ne survit) → champ obligatoire vide.
      { key:"univers",      label:t("fieldUniversLabel"),       type:"select", options: gender },
      // marque + matiere (2026-07-09) : consommés par leboncoin.js
      // (label[for$="_brand"] / [for$="_material"]) mais absents d'ici, donc
      // jetés par mergeFieldsWithLens et TOUJOURS vides. Texte libre : la
      // liste des matières LBC est par catégorie et n'a pas été crawlée.
      { key:"marque",       label:t("fieldBrandLabel"),         type:"text" },
      { key:"matiere",      label:t("fieldMaterialLabel"),      type:"text" },
    ],
    // genre indispensable : c'est lui qui résout le rayon Mode Beebs
    // (Femme/Homme/Fille/Garçon/Bébé, cf. beebsCategories.js) — sans ce champ
    // dans la config, mergeFieldsWithLens jette le genre généré par l'IA et
    // getBeebsCategoryPath ne résout jamais rien pour les articles de mode
    // (même piège que celui documenté pour l'univers Leboncoin ci-dessus).
    beebs: [
      { key:"etat",   label:t("fieldConditionLabel"), type:"select", options: beebsCondition },
      { key:"taille", label:t("fieldSizeLabel"),      type:"select", options: size, groups: sizeGroups },
      { key:"genre",  label:t("fieldGenderLabel"),    type:"select", options: beebsGender },
      { key:"marque", label:t("fieldBrandLabel"),     type:"text" },
      // matiere + couleur (2026-07-09) : consommés par beebs.js depuis
      // toujours, jamais produits → toujours vides. "Matière" apparaît SANS
      // "(facultatif)" sur « Figurines » (dry-run réel), donc potentiellement
      // bloquant. Texte libre : listes Beebs non crawlées, match fuzzy côté
      // handler.
      { key:"matiere", label:t("fieldMaterialLabel"), type:"text" },
      { key:"couleur", label:t("fieldColorLabel"),    type:"text" },
      // age (2026-07-09) : champ observé sur « Figurines », jamais rempli en
      // conditions réelles — à valider au prochain dry-run.
      { key:"age",     label:t("fieldAgeLabel"),      type:"text" },
    ],
    // eBay.fr est francophone : clés et valeurs FR canoniques, alignées sur
    // les autres plateformes ET sur ce que consomme l'extension (etat, taille,
    // genre, marque, matiere, couleur). L'ancienne config anglophone
    // (condition/size/brand/material) datait d'avant le mapping catégories —
    // ses clés n'étaient lues par personne. Genre indispensable : c'est lui
    // qui choisit le rayon eBay (Femme/Homme/Enfant passent tels quels,
    // "Enfant : unisexe" est un rayon réel ; Mixte n'a pas de rayon → blocage
    // doux à la publication comme Vinted).
    ebay: [
      { key:"etat",    label:t("fieldConditionLabel"), type:"select", options:[condition.newWithTag, condition.newWithoutTag, condition.veryGood, condition.good, condition.satisfactory] },
      { key:"taille",  label:t("fieldSizeLabel"),      type:"select", options: size, groups: sizeGroups },
      { key:"genre",   label:t("fieldGenderLabel"),    type:"select", options: ebayGender },
      { key:"marque",  label:t("fieldBrandLabel"),     type:"text" },
      { key:"matiere", label:t("fieldMaterialLabel"),  type:"text" },
      { key:"couleur", label:t("fieldColorLabel"),     type:"text" },
    ],
  };
}

const FR_TO_EBAY_CONDITION = {
  "neuf avec étiquette": "New",
  "neuf sans étiquette": "Like New",
  "neuf":                "New",
  "très bon état":       "Very Good",
  "bon état":            "Good",
  "état correct":        "Good",
  "satisfaisant":        "Acceptable",
  "pour pièces":         "Acceptable",
};

function findMatchingOption(raw, options) {
  if (!raw || raw === "null") return "";
  const n = raw.toLowerCase().trim();
  const exact = options.find(o => o.value.toLowerCase() === n);
  if (exact) return exact.value;
  const mapped = FR_TO_EBAY_CONDITION[n];
  if (mapped && options.some(o => o.value === mapped)) return mapped;
  // Match the LONGEST candidate, not the first one found: with short option values
  // like "S"/"M"/"L" (letter sizes) mixed into the same list as "EU 42" (shoe sizes),
  // a naive substring match on e.g. "EU 42 (US 9)" would wrongly hit "S" (from "US")
  // before ever considering "EU 42" — the longest match is always the more specific one.
  const candidates = options.filter(o => {
    const v = o.value.toLowerCase();
    return n.includes(v) || v.includes(n);
  });
  if (!candidates.length) return "";
  candidates.sort((a, b) => b.value.length - a.value.length);
  return candidates[0].value;
}

function mergeFieldsWithLens(platformFields, lensResult, fieldConfigs) {
  const result = {};
  for (const field of fieldConfigs) {
    const fromApi = platformFields?.[field.key];
    if (fromApi && fromApi !== "null") {
      result[field.key] = field.type === "select"
        ? (findMatchingOption(fromApi, field.options) || fromApi)
        : fromApi;
      continue;
    }
    let lensVal = null;
    switch (field.key) {
      case "etat":
      case "condition":   lensVal = lensResult?.etat_estime    ?? null; break;
      case "marque":
      case "brand":       lensVal = lensResult?.marque         ?? null; break;
      case "categorie":   lensVal = lensResult?.categorie      ?? null; break;
      case "taille":
      case "size":        lensVal = lensResult?.taille_estimee ?? null; break;
      default:            lensVal = null;
    }
    result[field.key] = lensVal
      ? (field.type === "select" ? (findMatchingOption(lensVal, field.options) || "") : lensVal)
      : "";
  }
  return result;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ url, onClose }) {
  if (!url) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position:"fixed", inset:0, zIndex:20000,
        background:"rgba(0,0,0,0.92)",
        display:"flex", alignItems:"center", justifyContent:"center",
      }}
    >
      <img
        src={url}
        alt=""
        style={{ maxWidth:"95vw", maxHeight:"90vh", objectFit:"contain", borderRadius:8 }}
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        style={{
          position:"absolute", top:16, right:16,
          background:"rgba(255,255,255,0.18)", border:"none",
          color:"#fff", width:36, height:36, borderRadius:"50%",
          fontSize:20, cursor:"pointer",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}
      >×</button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Eyebrow({ children }) {
  return (
    <p style={{ margin:"0 0 6px", fontSize:11, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.14em", color:T.mute }}>
      {children}
    </p>
  );
}

function StepProgress({ step, labels }) {
  return (
    <div style={{ padding:"16px 20px 4px" }}>
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>
        {labels.map((_, i) => (
          <div key={i} style={{ height:3, flex:1, borderRadius:999, background: i <= step ? T.teal : T.border }} />
        ))}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        {labels.map((l, i) => (
          <span key={l} style={{ fontSize:10.5, fontWeight:500, color: i === step ? T.teal : T.mute }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function PrimaryButton({ children, disabled, onClick, icon:Icon }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        width:"100%", boxSizing:"border-box", borderRadius:999, padding:"16px 0",
        display:"flex", alignItems:"center", justifyContent:"center", gap:8,
        fontSize:15, fontWeight:600, border:"none", fontFamily:"inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        background: disabled ? "#DCEEEA" : `linear-gradient(120deg,${T.teal},${T.tealDeep})`,
        color: disabled ? "#8FB5AE" : "#FFFFFF",
        boxShadow: disabled ? "none" : "0 10px 24px rgba(47,158,144,0.28)",
        transition:"background 0.2s, box-shadow 0.2s",
      }}
    >
      {Icon && <Icon size={16} strokeWidth={2.2} />}
      {children}
    </button>
  );
}

// ── Step 0 — Upload ───────────────────────────────────────────────────────────

function StepUpload({ previews, removable, onAdd, onRemove, notes, setNotes, micActive, toggleMic, error, lang }) {
  const { t, tpl } = useTranslation(lang);
  const fileRef = useRef();
  const count = previews.length;
  const MAX = 5;

  return (
    <div>
      <Eyebrow>{t("stepUploadEyebrow")}</Eyebrow>
      <h1 style={{ margin:"6px 0 8px", fontSize:24, fontWeight:600, color:T.ink }}>
        {t("stepUploadTitle")}
      </h1>
      <p style={{ margin:"0 0 20px", fontSize:13, color:T.mute2, lineHeight:1.5 }}>
        {t("stepUploadSubtitle")}
      </p>

      {error && (
        <div style={{ padding:"10px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:14, fontSize:13, color:"#B91C1C", marginBottom:12 }}>
          {error}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        style={{ display:"none" }}
        onChange={e => {
          const files = Array.from(e.target.files || []);
          if (files.length) { onAdd(files); e.target.value = ""; }
        }}
      />

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
        {previews.map((url, i) => (
          <div key={i} style={{ aspectRatio:"1", borderRadius:16, overflow:"hidden", position:"relative", background:T.card, border:`1px solid ${T.border}` }}>
            <img src={url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            {removable && (
              <button
                onClick={() => onRemove(i)}
                style={{
                  position:"absolute", top:6, right:6, width:20, height:20, borderRadius:"50%",
                  background:T.paper, border:`1px solid ${T.border}`, cursor:"pointer",
                  display:"flex", alignItems:"center", justifyContent:"center", padding:0,
                }}
              >
                <X size={11} color={T.ink} />
              </button>
            )}
          </div>
        ))}
        {count < MAX && (
          <button
            onClick={() => fileRef.current?.click()}
            style={{ aspectRatio:"1", borderRadius:16, border:"1px dashed #D8D2C4", background:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
          >
            <Plus size={20} color={T.mute} />
          </button>
        )}
      </div>

      <div style={{ position:"relative" }}>
        <input
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={t("stepUploadNotesPlaceholder")}
          style={{
            width:"100%", boxSizing:"border-box", borderRadius:16, padding:"14px 44px 14px 16px",
            fontSize:14, outline:"none", background:T.chip, color:T.ink, fontFamily:"inherit",
            border:`1px solid ${micActive ? "#EF4444" : T.border}`, transition:"border-color 0.15s",
          }}
        />
        <button
          onClick={toggleMic}
          style={{
            position:"absolute", right:8, top:"50%", transform:"translateY(-50%)",
            width:32, height:32, borderRadius:"50%", border:"none",
            background: micActive ? "rgba(239,68,68,0.12)" : T.card,
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow: micActive ? "0 0 0 3px rgba(239,68,68,0.15)" : "none",
          }}
        >
          <Mic size={14} color={micActive ? "#EF4444" : T.mute2} />
        </button>
      </div>
    </div>
  );
}

// ── Step 1 — Photos + Retouche ────────────────────────────────────────────────

function StepPhotos({ photos, onAddPhotos, onRemovePhoto, onPhotoClick, photoOption, setPhotoOption, background, setBackground, selected, setSelected, coinPrices, coinBalance, onOpenStore, platformSupport, lang }) {
  const { t, tpl } = useTranslation(lang);
  const addRef = useRef();
  const MAX = 5;

  // Système de pièces : plus de verrou par tier — chaque option affiche son
  // prix en pièces (coin_config via coinPrices, jamais hardcodé). Libellés et
  // descriptions différencient clairement les 3 niveaux.
  const retouchOptions = [
    {
      id: "ia_advanced",
      label: lang === "fr" ? "Retouche avancée" : "Advanced editing",
      desc: lang === "fr"
        ? "Rendu professionnel adapté à la catégorie, choix d'un fond pro (studio, béton, lin, parquet) et léger défroissage naturel des vêtements. L'objet reste fidèle : logo, couleurs et défauts sont conservés."
        : "Professional, category-aware result, choice of a pro background (studio, concrete, linen, parquet) and light natural de-wrinkling for clothing. The item stays true: logo, colors and flaws are preserved.",
    },
    {
      id: "ia_light",
      label: lang === "fr" ? "Retouche légère" : "Light editing",
      desc: lang === "fr"
        ? "Améliore la lumière, la netteté et les couleurs de vos photos. Le fond et l'objet restent tels quels."
        : "Improves lighting, sharpness and colors. Background and item stay as-is.",
    },
    {
      id: "original",
      label: lang === "fr" ? "Photos d'origine" : "Original photos",
      desc: lang === "fr"
        ? "Vos photos telles quelles, sans aucune retouche."
        : "Your photos as-is, no editing.",
    },
  ];

  // Choix de fond — avancé uniquement. `swatch` = aperçu de la vignette : chaque
  // valeur PRÉVISUALISE la vraie matière du fond (dégradés/textures CSS, aucun
  // asset externe). Les IDs correspondent 1:1 aux clés BACKGROUND_OPTIONS de
  // generate-listing (blanc = cyclorama, gris = microciment, beige = lin tissé,
  // bois = chêne clair veiné).
  const backgroundOptions = [
    { id: "original", label: lang === "fr" ? "Aucun"        : "None",         swatch: null },
    { id: "white",    label: lang === "fr" ? "Blanc studio" : "Studio white", swatch: "radial-gradient(120% 95% at 50% 12%, #FFFFFF 55%, #E9E9E9 100%)" },
    { id: "grey",     label: lang === "fr" ? "Gris béton"   : "Concrete grey", swatch: "radial-gradient(circle at 28% 22%, rgba(255,255,255,0.45), rgba(255,255,255,0) 42%), radial-gradient(circle at 72% 76%, rgba(0,0,0,0.08), rgba(0,0,0,0) 46%), linear-gradient(135deg,#D3D3D0,#C0C0BD)" },
    { id: "beige",    label: lang === "fr" ? "Beige lin"    : "Linen beige",  swatch: "repeating-linear-gradient(0deg, rgba(120,100,70,0.10) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(120,100,70,0.10) 0 1px, transparent 1px 3px), linear-gradient(0deg,#E7DECF,#EEE6D7)" },
    { id: "wood",     label: lang === "fr" ? "Bois clair"   : "Light wood",   swatch: "repeating-linear-gradient(92deg, rgba(120,85,45,0.00) 0 20px, rgba(120,85,45,0.26) 20px 21px), repeating-linear-gradient(92deg, rgba(120,85,45,0.08) 0 2px, transparent 2px 6px), linear-gradient(100deg,#EAD6B4,#DDC39A)" },
  ];

  return (
    <div>
      <Eyebrow>{t("stepPhotosEyebrow")}</Eyebrow>
      <h1 style={{ margin:"6px 0 8px", fontSize:24, fontWeight:600, color:T.ink }}>
        {t("stepPhotosTitle")}
      </h1>
      <p style={{ margin:"0 0 16px", fontSize:13, color:T.mute2, lineHeight:1.5 }}>
        {t("stepPhotosSubtitle")}
      </p>

      <input
        ref={addRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        style={{ display:"none" }}
        onChange={e => {
          const files = Array.from(e.target.files || []);
          if (files.length) { onAddPhotos(files); e.target.value = ""; }
        }}
      />

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
        {photos.map((url, i) => (
          <div
            key={i}
            onClick={() => onPhotoClick(url)}
            style={{ aspectRatio:"1", borderRadius:16, overflow:"hidden", border:`1px solid ${T.border}`, position:"relative", cursor:"pointer" }}
          >
            <img src={url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            <button
              onClick={e => { e.stopPropagation(); onRemovePhoto(i); }}
              style={{
                position:"absolute", top:6, right:6, width:20, height:20, borderRadius:"50%",
                background:T.paper, border:`1px solid ${T.border}`, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", padding:0,
              }}
            >
              <X size={11} color={T.ink} />
            </button>
          </div>
        ))}
        {photos.length < MAX && (
          <button
            onClick={() => addRef.current?.click()}
            style={{ aspectRatio:"1", borderRadius:16, border:"1px dashed #D8D2C4", background:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
          >
            <Plus size={20} color={T.mute} />
          </button>
        )}
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:12 }}>
        {retouchOptions.map(o => {
          const active = photoOption === o.id;
          const price = coinPrices?.[o.id] ?? null;
          const affordable = price == null || coinBalance >= price;
          return (
            <button
              key={o.id}
              onClick={() => setPhotoOption(o.id)}
              style={{
                textAlign:"left", borderRadius:16, padding:16,
                background: active ? "#E7F3F0" : T.card,
                border: `1px solid ${active ? T.teal : T.border}`,
                cursor:"pointer", fontFamily:"inherit", position:"relative",
                display:"flex", alignItems:"center", justifyContent:"space-between", gap:10,
              }}
            >
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:T.ink, display:"flex", alignItems:"center", gap:6 }}>
                  {o.label}
                </div>
                <div style={{ fontSize:12, marginTop:2, lineHeight:1.4, color:T.mute2 }}>{o.desc}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                {price != null && (
                  price === 0 ? (
                    <span style={{
                      fontSize:12, fontWeight:700, whiteSpace:"nowrap",
                      color:T.tealDeep, background:"#E7F3F0",
                      border:"1px solid #CBE5DF", padding:"3px 9px", borderRadius:999,
                    }}>
                      {lang === "fr" ? "Gratuit" : "Free"}
                    </span>
                  ) : (
                    <span style={{
                      fontSize:12, fontWeight:700, whiteSpace:"nowrap",
                      color: affordable ? T.tealDeep : "#B0645A",
                      background: affordable ? "#E7F3F0" : "#F7ECEA",
                      border: `1px solid ${affordable ? "#CBE5DF" : "#EAD4CF"}`,
                      padding:"3px 9px", borderRadius:999,
                      display:"inline-flex", alignItems:"center", gap:4,
                    }}>
                      <PepiteIcon size={13} /> {price}
                    </span>
                  )
                )}
                <div style={{
                  width:20, height:20, borderRadius:"50%", flexShrink:0,
                  background: active ? T.teal : "transparent",
                  border: active ? "none" : `1px solid ${T.mute}`,
                }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Choix de fond — retouche avancée uniquement (valeur ajoutée de l'avancé) */}
      {photoOption === "ia_advanced" && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase", color:T.mute, marginBottom:10 }}>
            {lang === "fr" ? "Fond" : "Background"}
          </div>
          <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:2 }}>
            {backgroundOptions.map(b => {
              const active = background === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setBackground(b.id)}
                  style={{ flexShrink:0, width:66, background:"none", border:"none", padding:0, cursor:"pointer", fontFamily:"inherit" }}
                >
                  <div style={{
                    width:66, height:66, borderRadius:14, boxSizing:"border-box",
                    border:`2px solid ${active ? T.teal : T.border}`,
                    background: b.id === "original" ? T.chip : b.swatch,
                    boxShadow: active ? "0 0 0 3px rgba(47,158,144,0.16)" : "none",
                    overflow:"hidden", position:"relative",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    transition:"border-color 0.15s, box-shadow 0.15s",
                  }}>
                    {b.id === "original" && (photos[0]
                      ? <img src={photos[0]} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                      : <ImageOff size={18} color={T.mute} />
                    )}
                    {active && (
                      <span style={{ position:"absolute", top:4, right:4, width:16, height:16, borderRadius:"50%", background:T.teal, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <Check size={10} color="#FFFFFF" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:10.5, fontWeight:600, color: active ? T.tealDeep : T.mute2, marginTop:5, lineHeight:1.2, textAlign:"center" }}>
                    {b.label}
                  </div>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize:11.5, color:T.mute, marginTop:8, lineHeight:1.4 }}>
            {lang === "fr"
              ? "Objet fidèle (logo, couleurs, défauts) — seul le fond change. Sur un vêtement, les faux plis sont légèrement défroissés."
              : "Item kept faithful (logo, colors, flaws) — only the background changes. On a garment, storage creases are lightly smoothed."}
          </p>
        </div>
      )}

      {/* Solde de pièces + accès au store */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24, padding:"10px 14px", borderRadius:12, background:T.chip, border:`1px solid ${T.border}` }}>
        <span style={{ fontSize:12.5, fontWeight:600, color:T.mute2, display:"inline-flex", alignItems:"center", gap:5 }}>
          {lang === 'en' ? 'Your Nuggets:' : 'Tes Pépites :'}{' '}
          <strong style={{ color:T.ink, display:"inline-flex", alignItems:"center", gap:4 }}><PepiteIcon size={15} /> {coinBalance}</strong>
        </span>
        <button
          onClick={onOpenStore}
          style={{ background:"none", border:"none", color:T.tealDeep, fontSize:12.5, fontWeight:700, cursor:"pointer", fontFamily:"inherit", textDecoration:"underline", textUnderlineOffset:3, padding:0 }}
        >
          {lang === 'en' ? '+ Get Nuggets' : '+ Recharger'}
        </button>
      </div>

      <Eyebrow>{t("stepPhotosPlatformsLabel")}</Eyebrow>
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:2 }}>
        {PLATFORMS_DEFAULT.map(p => {
          const isOn = selected.has(p);
          // Compat catégorie × plateforme (src/utils/platformCompat.js,
          // dérivée des 4 mappings) : une plateforme qui ne peut pas vendre
          // cette catégorie est GRISÉE (désactivée, non cliquable), avec le
          // motif affiché sous la rangée — pas juste décochée.
          const support = platformSupport?.[p] ?? "supported";
          const disabled = support !== "supported";
          return (
            <button
              key={p}
              disabled={disabled}
              title={disabled
                ? t(support === "unavailable" ? "platformUnavailable" : "platformUnmapped").replace("{platform}", PLATFORM_LABELS[p])
                : undefined}
              onClick={() => !disabled && setSelected(prev => {
                const s = new Set(prev);
                s.has(p) ? s.delete(p) : s.add(p);
                return s;
              })}
              style={{
                display:"flex", alignItems:"center", gap:7,
                padding:"7px 16px 7px 8px", borderRadius:999,
                background: disabled ? "#F1F1EE" : isOn ? "#E7F3F0" : T.chip,
                border: `1px solid ${disabled ? T.border : isOn ? T.teal : T.border}`,
                color: disabled ? "#B4B9B6" : isOn ? T.tealDeep : T.mute2,
                fontSize:13.5, fontWeight:600,
                cursor: disabled ? "not-allowed" : "pointer", fontFamily:"inherit",
                opacity: disabled ? 0.6 : 1,
                filter: disabled ? "grayscale(1)" : "none",
                transition:"border-color 0.15s, background 0.15s, color 0.15s",
              }}
            >
              <PlatformLogo platform={p} size={22} />
              {PLATFORM_LABELS[p]}
            </button>
          );
        })}
      </div>
      {PLATFORMS_DEFAULT.filter(p => (platformSupport?.[p] ?? "supported") !== "supported").map(p => (
        <p key={p} style={{ margin:"8px 0 0", fontSize:12, color:T.mute2, fontWeight:600, lineHeight:1.4 }}>
          {t(platformSupport[p] === "unavailable" ? "platformUnavailable" : "platformUnmapped").replace("{platform}", PLATFORM_LABELS[p])}
        </p>
      ))}
      {selected.size === 0 && (
        <p style={{ margin:"8px 0 0", fontSize:12.5, color:"#EF4444", fontWeight:600 }}>
          {t("stepPhotosSelectPlatformError")}
        </p>
      )}
    </div>
  );
}

// ── Step 2 — Génération (phase A : loading · phase B : review éditable) ───────

function StepGeneration({ generating, generateError, platformListings, processedPhotos, selected, edited, setEdited, onPhotoClick, onRetry, noteOverride, lang }) {
  const { t } = useTranslation(lang);
  const platformFieldsConfig = getPlatformFieldsConfig(t);
  const [elapsed, setElapsed] = useState(0);
  const [openCards, setOpenCards] = useState(new Set());

  useEffect(() => {
    if (platformListings) return;
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [platformListings]);

  const toggleCard = p => setOpenCards(prev => {
    const s = new Set(prev);
    s.has(p) ? s.delete(p) : s.add(p);
    return s;
  });

  // Phase A — loading
  if (generating || (!platformListings && !generateError)) {
    const msg = elapsed < 20 ? t("stepGenLoadingMsg1") : t("stepGenLoadingMsg2");
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 24px", textAlign:"center" }}>
        <Loader size={80} thickness={2} icon={Sparkles} iconSize={28} style={{ marginBottom:24 }} />
        <h1 style={{ margin:"0 0 8px", fontSize:19, fontWeight:600, color:T.ink }}>
          {msg}
        </h1>
        <p style={{ margin:0, fontSize:13, lineHeight:1.5, color:T.mute2 }}>
          {t("stepGenLoadingSubtitle")}
        </p>
      </div>
    );
  }

  // Error
  if (generateError && !platformListings) {
    return (
      <div>
        <Eyebrow>{t("stepGenEyebrow")}</Eyebrow>
        <h1 style={{ margin:"6px 0 8px", fontSize:22, fontWeight:600, color:T.ink }}>
          {t("stepGenErrorTitle")}
        </h1>
        <div style={{ padding:"12px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:14, fontSize:13, color:"#B91C1C", marginBottom:14 }}>
          {generateError}
        </div>
        <button
          onClick={onRetry}
          style={{
            width:"100%", padding:"14px 0", borderRadius:999,
            border:`1px solid ${T.teal}`, background:"none",
            color:T.teal, fontWeight:600, fontSize:14,
            cursor:"pointer", fontFamily:"inherit",
          }}
        >
          {t("stepGenRetryButton")}
        </button>
      </div>
    );
  }

  // Phase B — review with collapsible cards
  const platforms = [...selected].filter(p => platformListings?.platforms?.[p]);

  return (
    <div>
      <Eyebrow>{t("stepGenEyebrow")}</Eyebrow>
      <h1 style={{ margin:"6px 0 4px", fontSize:22, fontWeight:600, color:T.ink }}>
        {t("stepGenReviewTitle")}
      </h1>
      <p style={{ margin:"0 0 16px", fontSize:12.5, color:T.mute2, lineHeight:1.5 }}>
        {t("stepGenReviewSubtitle")}
      </p>

      {processedPhotos?.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <Eyebrow>{t("stepGenEnhancedPhotosLabel")}</Eyebrow>
          <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
            {processedPhotos.map((ph, i) => (
              <div
                key={i}
                onClick={() => onPhotoClick(ph.url ?? ph)}
                style={{ flexShrink:0, width:80, height:80, borderRadius:12, overflow:"hidden", border:`1px solid ${T.border}`, cursor:"pointer" }}
              >
                <img src={ph.url ?? ph} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {platforms.map(p => {
          const e = edited[p] ?? { title:"", description:"", platform_fields:{}, price:null };
          const isOpen = openCards.has(p);
          const fieldConfigs = platformFieldsConfig[p] ?? [];
          const etatField = fieldConfigs.find(f => f.key === "etat" || f.key === "condition");
          const etatVal = etatField ? (e.platform_fields?.[etatField.key] ?? "") : "";
          const summaryParts = [
            e.title ? (e.title.length > 32 ? e.title.slice(0, 32) + "…" : e.title) : "—",
            etatVal || null,
            e.price != null && e.price !== "" ? `${e.price}€` : null,
          ].filter(Boolean);

          return (
            <div key={p} style={{ background:T.card, borderRadius:18, border: `1px solid ${isOpen ? T.teal : T.border}`, overflow:"hidden" }}>
              <button
                onClick={() => toggleCard(p)}
                style={{
                  width:"100%", padding:16,
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                }}
              >
                <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0, overflow:"hidden" }}>
                  <PlatformLogo platform={p} size={28} />
                  <div style={{ minWidth:0, overflow:"hidden" }}>
                    <div style={{ fontSize:13.5, fontWeight:600, color:T.ink }}>
                      {PLATFORM_LABELS[p].toUpperCase()}
                    </div>
                    <div style={{ fontSize:12, color:T.mute2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {summaryParts.join(" · ")}
                    </div>
                  </div>
                </div>
                <Pencil size={15} color={T.mute} style={{ flexShrink:0, marginLeft:8 }} />
              </button>

              {isOpen && (
                <div style={{ padding:"0 16px 16px", borderTop:`1px solid ${T.border}` }}>
                  <div style={{ marginBottom:10, paddingTop:12 }}>
                    <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>{t("fieldTitleLabel")}</div>
                    <input
                      type="text"
                      value={e.title}
                      onChange={ev => setEdited(prev => ({ ...prev, [p]: { ...prev[p], title: ev.target.value } }))}
                      style={{ width:"100%", padding:"10px 12px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13.5, fontFamily:"inherit", outline:"none", background:T.chip, color:T.ink, boxSizing:"border-box" }}
                    />
                  </div>

                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>{t("fieldDescriptionLabel")}</div>
                    <textarea
                      value={e.description}
                      onChange={ev => setEdited(prev => ({ ...prev, [p]: { ...prev[p], description: ev.target.value } }))}
                      rows={4}
                      style={{ width:"100%", padding:"10px 12px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13, fontFamily:"inherit", outline:"none", background:T.chip, color:T.ink, resize:"vertical", boxSizing:"border-box", lineHeight:1.5 }}
                    />
                  </div>

                  {fieldConfigs.length > 0 && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                      {fieldConfigs.map((field, fi) => {
                        const val = e.platform_fields?.[field.key] ?? "";
                        const isLastOdd = fi === fieldConfigs.length - 1 && fieldConfigs.length % 2 !== 0;
                        const onChange = nv => {
                          // Champ partagé édité à la main sur CETTE plateforme :
                          // le lien avec la source canonique casse pour cette
                          // copie seulement (Sujet 4, override local sacré).
                          noteOverride?.(p, field.key);
                          setEdited(prev => ({
                            ...prev,
                            [p]: { ...prev[p], platform_fields: { ...prev[p].platform_fields, [field.key]: nv } },
                          }));
                        };
                        return (
                          <div key={field.key} style={isLastOdd ? { gridColumn:"1 / -1" } : {}}>
                            <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>{field.label}</div>
                            {field.type === "select" ? (
                              <select
                                value={val}
                                onChange={ev => onChange(ev.target.value)}
                                style={{ width:"100%", padding:"9px 10px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13, fontFamily:"inherit", outline:"none", background:T.chip, boxSizing:"border-box", color: val ? T.ink : T.mute }}
                              >
                                <option value="">—</option>
                                {field.groups
                                  ? field.groups.map(g => (
                                      <optgroup key={g.groupLabel} label={g.groupLabel}>
                                        {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                      </optgroup>
                                    ))
                                  : field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={val}
                                onChange={ev => onChange(ev.target.value)}
                                placeholder="—"
                                style={{ width:"100%", padding:"9px 10px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13, fontFamily:"inherit", outline:"none", background:T.chip, color:T.ink, boxSizing:"border-box" }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div>
                    <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>{t("fieldSalePriceLabel")}</div>
                    <input
                      type="number"
                      value={e.price ?? ""}
                      onChange={ev => setEdited(prev => ({ ...prev, [p]: { ...prev[p], price: ev.target.value === "" ? null : Number(ev.target.value) } }))}
                      placeholder="—"
                      style={{ width:"100%", padding:"10px 12px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:14, fontWeight:700, fontFamily:"inherit", outline:"none", background:T.chip, color:T.tealDeep, boxSizing:"border-box" }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Toggle piste + rond (teal quand ON) ──────────────────────────────────────

function StockToggle({ checked, onChange, label, hint }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"space-between", gap:12,
      background:T.card, border:`1px solid ${T.border}`, borderRadius:16,
      padding:14, marginBottom:20,
    }}>
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:600, color:T.ink }}>{label}</div>
        {hint && <div style={{ fontSize:12, color:T.mute2, marginTop:2, lineHeight:1.4 }}>{hint}</div>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink:0, width:44, height:26, borderRadius:999, border:"none", padding:3,
          background: checked ? T.teal : "#D8D2C4",
          cursor:"pointer", position:"relative", transition:"background 0.2s",
        }}
      >
        <span style={{
          display:"block", width:20, height:20, borderRadius:"50%", background:"#FFFFFF",
          transform: checked ? "translateX(18px)" : "translateX(0)",
          transition:"transform 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.25)",
        }} />
      </button>
    </div>
  );
}

// ── Step 3 — Publier (chips + croix) ─────────────────────────────────────────

function StepPublish({ selected, setSelected, platformListings, publishError, lang, canToggleStock, addToStock, setAddToStock, prixAchatSaisi, setPrixAchatSaisi, missingSharedFields = [], sharedFields = {}, onSharedFieldChange }) {
  const { t } = useTranslation(lang);
  const chips = [...selected].filter(p => platformListings?.platforms?.[p]);
  // Config des champs partagés à compléter inline (Sujet 4) : mêmes selects/
  // inputs que l'éditeur de StepGeneration — la taille réutilise les groupes
  // (lettres/numérique/pointures) de la config Vinted, le reste est texte.
  const fieldsCfg = getPlatformFieldsConfig(t);
  const sharedFieldCfg = {
    taille:  fieldsCfg.vinted.find(f => f.key === "taille"),
    couleur: { key:"couleur", label:t("fieldColorLabel"),    type:"text" },
    matiere: { key:"matiere", label:t("fieldMaterialLabel"), type:"text" },
    marque:  { key:"marque",  label:t("fieldBrandLabel"),    type:"text" },
  };

  return (
    <div>
      <Eyebrow>{t("stepPublishEyebrow")}</Eyebrow>
      <h1 style={{ margin:"6px 0 16px", fontSize:22, fontWeight:600, color:T.ink }}>
        {t("stepPublishTitle")}
      </h1>

      {canToggleStock && (
        <StockToggle
          checked={addToStock}
          onChange={setAddToStock}
          label={t("stepPublishAddToStockLabel")}
          hint={addToStock ? t("stepPublishAddToStockHintOn") : t("stepPublishAddToStockHintOff")}
        />
      )}

      {canToggleStock && addToStock && (
        <div style={{ marginTop:-10, marginBottom:20 }}>
          <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>
            {t("stepPublishBuyPriceLabel")}
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={prixAchatSaisi}
            onChange={ev => setPrixAchatSaisi(ev.target.value)}
            placeholder={t("stepPublishBuyPricePlaceholder")}
            style={{ width:"100%", padding:"10px 12px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:14, fontFamily:"inherit", outline:"none", background:T.chip, color:T.ink, boxSizing:"border-box" }}
          />
        </div>
      )}

      {publishError && (
        <div style={{ padding:"10px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:14, fontSize:13, color:"#B91C1C", marginBottom:12 }}>
          {publishError}
        </div>
      )}

      {missingSharedFields.length > 0 && (
        // Encart inline (Sujet 4) : les champs partagés manquants se
        // complètent ICI, sans quitter le step — l'écriture passe par
        // onSharedFieldChange qui met à jour la SOURCE canonique (donc
        // toutes les copies plateformes non éditées à la main d'un coup).
        <div style={{ padding:"12px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:14, marginBottom:12 }}>
          <div style={{ fontSize:13, color:"#B91C1C", fontWeight:600, marginBottom:10 }}>
            {t("stepPublishSharedMissingTitle")}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {missingSharedFields.map((key, fi) => {
              const field = sharedFieldCfg[key];
              const val = sharedFields[key] ?? "";
              const isLastOdd = fi === missingSharedFields.length - 1 && missingSharedFields.length % 2 !== 0;
              return (
                <div key={key} style={isLastOdd ? { gridColumn:"1 / -1" } : {}}>
                  <div style={{ fontSize:11, color:T.mute2, fontWeight:600, marginBottom:4 }}>{field.label}</div>
                  {field.type === "select" ? (
                    <select
                      value={val}
                      onChange={ev => onSharedFieldChange?.(key, ev.target.value)}
                      style={{ width:"100%", padding:"9px 10px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13, fontFamily:"inherit", outline:"none", background:T.chip, boxSizing:"border-box", color: val ? T.ink : T.mute }}
                    >
                      <option value="">—</option>
                      {field.groups
                        ? field.groups.map(g => (
                            <optgroup key={g.groupLabel} label={g.groupLabel}>
                              {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </optgroup>
                          ))
                        : field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={val}
                      onChange={ev => onSharedFieldChange?.(key, ev.target.value)}
                      placeholder="—"
                      style={{ width:"100%", padding:"9px 10px", borderRadius:12, border:`1px solid ${T.border}`, fontSize:13, fontFamily:"inherit", outline:"none", background:T.chip, color:T.ink, boxSizing:"border-box" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:24 }}>
        {chips.map(p => (
          <div
            key={p}
            style={{
              display:"inline-flex", alignItems:"center", gap:8,
              background:T.chip, border:`1px solid ${T.border}`,
              borderRadius:999, padding:"6px 8px 6px 6px",
            }}
          >
            <PlatformLogo platform={p} size={24} />
            <span style={{ fontSize:13.5, fontWeight:600, color:T.ink }}>{PLATFORM_LABELS[p]}</span>
            <button
              onClick={() => setSelected(prev => { const s = new Set(prev); s.delete(p); return s; })}
              style={{
                background:"none", border:"none", padding:2,
                cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
              }}
            >
              <X size={13} color={T.mute} />
            </button>
          </div>
        ))}
      </div>

      {chips.length === 0 && (
        <p style={{ fontSize:13, color:T.mute, textAlign:"center", marginTop:16 }}>
          {t("stepPublishNoPlatformError")}
        </p>
      )}

      {chips.length > 0 && (
        <>
          <div style={{ borderRadius:18, padding:16, display:"flex", gap:12, marginBottom:16, background:"#E7F3F0", border:"1px solid #BFE0D9" }}>
            <Clock size={18} color={T.tealDeep} style={{ flexShrink:0, marginTop:1 }} />
            <p style={{ margin:0, fontSize:12.5, lineHeight:1.6, color:T.tealDeep }}>
              {t("stepPublishCronText1")}
            </p>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"flex-start", padding:"0 4px" }}>
            <ImageOff size={15} color={T.mute} style={{ flexShrink:0, marginTop:1 }} />
            <p style={{ margin:0, fontSize:11.5, lineHeight:1.6, color:T.mute }}>
              {t("stepPublishCronText2")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ListingPreviewScreen({
  inventaireId, userId, initialPhotos = [], initialListing = null, supabase, lang, onClose,
  isPremium = false, isPro = false, onUpgrade = () => {},
  createStockItem = null, alreadyInStock = false,
}) {
  const { t, tpl } = useTranslation(lang);
  const stepLabels = [t("stepLabelUpload"), t("stepLabelPhotos"), t("stepLabelGeneration"), t("stepLabelPublish")];
  const platformFieldsConfig = getPlatformFieldsConfig(t);

  const [step, setStep]         = useState(0);
  const [initializing, setInit] = useState(true);

  // Ligne inventaire liée à cette annonce : peut ne pas encore exister si l'article
  // n'a pas encore été ajouté au stock (switch "Ajouter au stock" à l'étape Publier).
  const [invId, setInvId] = useState(inventaireId || null);
  const canToggleStock = typeof createStockItem === "function" && !invId && !alreadyInStock;
  const [addToStock, setAddToStock] = useState(true);
  const [prixAchatSaisi, setPrixAchatSaisi] = useState("");

  const [lightboxUrl, setLightboxUrl] = useState(null);

  // Step 0
  const [pickedFiles, setPickedFiles]       = useState([]);
  const [pickedPreviews, setPickedPreviews] = useState([]);
  const [notes, setNotes]                   = useState("");
  const [micActive, setMicActive]           = useState(false);
  const [uploading, setUploading]           = useState(false);
  const [uploadError, setUploadError]       = useState("");
  const recognitionRef                      = useRef(null);

  // Photos prêtes
  const [photos, setPhotos] = useState(initialPhotos);

  // Prix (depuis Lens ou DB)
  const [price, setPrice] = useState(null);

  // Step 1 — option de retouche
  const [photoOption, setPhotoOption] = useState(() =>
    isPro ? "ia_advanced" : isPremium ? "ia_light" : "original"
  );
  // Choix de fond — ia_advanced uniquement (voir StepPhotos). "original" = fond
  // d'origine conservé. Envoyé à generate-listing via le paramètre `background`.
  const [background, setBackground] = useState("original");

  // Step 2 — résultats generate-listing
  const [generatingPlatforms, setGeneratingPlatforms] = useState(false);
  const [platformError, setPlatformError]             = useState("");
  const [platformListings, setPlatformListings]       = useState(null);
  const [processedPhotos, setProcessedPhotos]         = useState([]);
  const [edited, setEdited]                           = useState({});
  // Champs partagés (Sujet 4) : source canonique unique + trace des copies
  // éditées à la main (sacrées : plus jamais resynchronisées).
  const [sharedFields, setSharedFields]     = useState({ taille:"", couleur:"", matiere:"", marque:"" });
  const [sharedOverrides, setSharedOverrides] = useState({}); // { [platform]: Set<fieldKey> }

  // Step 3 — sélection plateformes (chips) + publication
  const [selected, setSelected]         = useState(new Set(PLATFORMS_DEFAULT));
  const [publishing, setPublishing]     = useState(false);
  const [publishError, setPublishError] = useState("");
  const [done, setDone]                 = useState(false);

  // Compat catégorie × plateforme (source de vérité = les 4 mappings, cf.
  // platformCompat.js) : calculée dès que l'article est connu, elle GRISE les
  // checkboxes des plateformes qui ne peuvent pas vendre cette catégorie
  // (StepPhotos) et les retire de la sélection — un job qui échouerait au
  // pré-check de l'extension ne doit jamais pouvoir partir.
  const platformSupport = useMemo(() => {
    const icon = detectObjectIcon(
      initialListing?.titre,
      initialListing?.description,
      initialListing?.categorie
    );
    return getPlatformSupport(icon);
  }, [initialListing]);
  useEffect(() => {
    setSelected(prev => {
      const next = new Set([...prev].filter(p => platformSupport[p] === "supported"));
      return next.size === prev.size ? prev : next;
    });
  }, [platformSupport]);

  // Modale de conversion (solde de Pépites insuffisant pour publier)
  const [quotaModal, setQuotaModal] = useState({
    open: false, trigger: "publish", targetTiers: ["premium","pro"],
  });

  // ── Pièces : solde (coin_wallets) + grille de prix (coin_config) ──────────
  // Lecture seule côté client — tout débit passe par spend_coins_and_publish.
  const [wallet, setWallet]         = useState(null);
  const [coinPrices, setCoinPrices] = useState(null);
  const [storeOpen, setStoreOpen]   = useState(false);
  const coinBalance = (wallet?.included_balance ?? 0) + (wallet?.purchased_balance ?? 0);
  const coinPriceFor = (opt) => coinPrices?.[opt] ?? null;

  async function refreshWallet() {
    const { data: w } = await supabase
      .from("coin_wallets")
      .select("included_balance, purchased_balance")
      .eq("user_id", userId)
      .maybeSingle();
    setWallet(w ?? { included_balance: 0, purchased_balance: 0 });
  }

  useEffect(() => {
    refreshWallet();
    supabase.from("coin_config").select("key, value").then(({ data }) => {
      const p = {};
      for (const row of data ?? []) if (row.key.startsWith("price_")) p[row.key.slice(6)] = row.value;
      setCoinPrices(p);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Pas encore de ligne inventaire (article pas encore en stock) : le prix vient
    // uniquement du résultat Lens, pas de lecture DB possible.
    if (invId) {
      supabase
        .from("inventaire")
        .select("prix_vente,prix_achat")
        .eq("id", invId)
        .single()
        .then(({ data }) => {
          const dbPrice = data?.prix_vente ?? data?.prix_achat ?? null;
          const finalPrice = initialListing?.prix_vente_suggere ?? dbPrice;
          if (finalPrice != null) setPrice(finalPrice);
        });
    } else if (initialListing?.prix_vente_suggere != null) {
      setPrice(initialListing.prix_vente_suggere);
    }

    if (initialPhotos.length > 0) {
      setPhotos(initialPhotos);
      setStep(1);
      setInit(false);
      return;
    }

    if (!invId) {
      setInit(false);
      return;
    }

    supabase
      .from("cross_post_jobs")
      .select("photos")
      .eq("inventaire_id", invId)
      .eq("user_id", userId)
      .not("photos", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const existing = data?.[0]?.photos;
        if (Array.isArray(existing) && existing.length > 0) {
          const urls = existing
            .filter(p => p.type === "original" || p.url)
            .map(p => p.url || p.original || p.enhanced || p.bg_removed)
            .filter(Boolean);
          if (urls.length > 0) {
            setPhotos(urls);
            setStep(1);
          }
        }
        setInit(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Déclenche la génération à l'arrivée sur step 2 ────────────────────────
  useEffect(() => {
    if (step === 2 && !platformListings && !generatingPlatforms && !platformError) {
      handleGeneratePlatforms();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Mic ───────────────────────────────────────────────────────────────────
  function toggleMic() {
    if (micActive) {
      recognitionRef.current?.stop();
      setMicActive(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = lang === "en" ? "en-US" : "fr-FR";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = e => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      setNotes(prev => (prev ? `${prev} ${text}` : text));
    };
    r.onend = () => setMicActive(false);
    r.onerror = () => setMicActive(false);
    recognitionRef.current = r;
    r.start();
    setMicActive(true);
  }

  // ── Fichiers step 0 ───────────────────────────────────────────────────────
  function addFiles(files) {
    const toAdd = files.slice(0, 5 - pickedFiles.length);
    if (!toAdd.length) return;
    setPickedFiles(prev => [...prev, ...toAdd]);
    toAdd.forEach(f => setPickedPreviews(prev => [...prev, URL.createObjectURL(f)]));
  }

  function removeFile(idx) {
    setPickedFiles(prev => prev.filter((_, i) => i !== idx));
    setPickedPreviews(prev => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function compressImage(file, maxWidth = 1024, quality = 0.85) {
    return new Promise(resolve => {
      const img = new window.Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const sc = Math.min(1, maxWidth / img.width);
        c.width = img.width * sc;
        c.height = img.height * sc;
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => resolve(b), "image/jpeg", quality);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  // ── Upload step 0 ─────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!pickedFiles.length) return;
    setUploading(true);
    setUploadError("");
    try {
      const urls = [];
      const ts = Date.now();
      for (let i = 0; i < pickedFiles.length; i++) {
        const blob = await compressImage(pickedFiles[i]);
        const path = `${userId}/raw/${ts}_${i}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("listing-photos")
          .upload(path, blob, { contentType:"image/jpeg", upsert:true });
        if (!upErr)
          urls.push(supabase.storage.from("listing-photos").getPublicUrl(path).data.publicUrl);
      }
      if (!urls.length) throw new Error(t("stepUploadError"));
      setPhotos(urls);
      setStep(1);
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  // ── Ajouter / supprimer photos step 1 ────────────────────────────────────
  async function handleAddMorePhotos(files) {
    const toAdd = files.slice(0, 5 - photos.length);
    if (!toAdd.length) return;
    const ts = Date.now();
    const urls = [];
    for (let i = 0; i < toAdd.length; i++) {
      const blob = await compressImage(toAdd[i]);
      const path = `${userId}/raw/${ts}_extra_${i}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("listing-photos")
        .upload(path, blob, { contentType:"image/jpeg", upsert:true });
      if (!upErr)
        urls.push(supabase.storage.from("listing-photos").getPublicUrl(path).data.publicUrl);
    }
    if (urls.length) setPhotos(prev => [...prev, ...urls]);
  }

  function handleRemovePhoto(idx) {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Génération plateformes ────────────────────────────────────────────────
  async function handleGeneratePlatforms() {
    setGeneratingPlatforms(true);
    setPlatformError("");
    try {
      const platforms = [...selected];
      // Tant que l'article n'est pas en stock (invId absent), on envoie ses infos
      // directement plutôt qu'un inventaire_id qui n'existe pas encore.
      const itemData = invId ? null : {
        titre:       initialListing?.titre       || "",
        marque:      initialListing?.marque       || null,
        description: initialListing?.description || null,
        type:        initialListing?.categorie    || null,
        statut:      "stock",
        prix_vente:  price ?? initialListing?.prix_vente_suggere ?? null,
      };
      const { data, error: fnErr } = await supabase.functions.invoke("generate-listing", {
        body: {
          ...(invId ? { inventaire_id: invId } : { item_data: itemData }),
          // Champs canoniques déjà connus du client (Lens taille_estimee,
          // article) : le serveur les injecte comme contraintes dans les 4
          // prompts et les réplique après génération (Sujet 4) —
          // l'inventaire n'a pas ces colonnes, seul le client les connaît.
          canonical_fields: {
            taille:  initialListing?.taille_estimee ?? initialListing?.taille ?? null,
            couleur: initialListing?.couleur ?? null,
            matiere: initialListing?.matiere ?? null,
            marque:  initialListing?.marque  ?? null,
          },
          photos,
          platforms,
          photo_option: photoOption,
          // Fond pris en compte uniquement en ia_advanced (le backend l'ignore
          // sinon, mais on n'envoie même pas une valeur trompeuse hors avancé).
          background: photoOption === "ia_advanced" ? background : "original",
          price,
          ...(notes ? { notes } : {}),
        },
      });
      if (fnErr) throw new Error(fnErr.message || t("stepGenErrorTitle"));
      if (!data?.platforms) throw new Error(t("stepGenNoListingsError"));

      setProcessedPhotos(data.photos ?? []);
      setPrice(prev => data.price ?? prev);

      const initialEdited = {};
      for (const p of platforms) {
        initialEdited[p] = {
          title:           data.platforms[p]?.title           ?? "",
          description:     data.platforms[p]?.description     ?? "",
          platform_fields: mergeFieldsWithLens(
            data.platforms[p]?.platform_fields ?? {},
            initialListing,
            platformFieldsConfig[p] ?? []
          ),
          price: data.price ?? price ?? null,
        };
      }
      // Genre eBay/Beebs : dérivé de la même source que les autres plateformes
      // quand l'IA ne l'a pas fourni. Les prompts eBay/Beebs d'avant le
      // 2026-07-09 ne renvoyaient pas de genre (eBay renvoyait même des clés
      // anglaises que mergeFieldsWithLens jetait) → genre toujours "" et
      // ebayGenreRequired/beebsGenreRequired bloquaient systématiquement la
      // résolution de catégorie alors que l'univers Leboncoin, lui, était bien
      // rempli pour le même article. Les prompts sont corrigés (generate-listing)
      // ET ce filet transpose le genre depuis Vinted/LBC du même run de
      // génération — mêmes libellés Femme/Homme/Enfant/Mixte. Mapping par
      // plateforme : eBay a un rayon "Enfant : unisexe" et un usage Mixte
      // (parfums) → toute valeur passe telle quelle ; Beebs n'a NI Enfant NI
      // Mixte (rayons Fille/Garçon/Bébé) → seuls les libellés transposables
      // passent, sinon le champ reste vide et l'utilisateur tranche au stepper.
      const genreSource =
        initialEdited.vinted?.platform_fields?.genre ||
        initialEdited.leboncoin?.platform_fields?.univers || "";
      const GENRE_TRANSPOSABLE = {
        ebay:  ["Femme", "Homme", "Fille", "Garçon", "Bébé", "Enfant", "Mixte"],
        beebs: ["Femme", "Homme", "Fille", "Garçon", "Bébé"],
      };
      for (const [p, allowed] of Object.entries(GENRE_TRANSPOSABLE)) {
        if (initialEdited[p] && !initialEdited[p].platform_fields.genre && allowed.includes(genreSource)) {
          initialEdited[p].platform_fields.genre = genreSource;
        }
      }

      // Champs partagés (Sujet 4) : initialisés depuis les copies fraîches —
      // le serveur a déjà canonicalisé, la première copie non vide par champ
      // EST la canonique. Overrides remis à zéro : nouvelle génération =
      // nouvelles copies, plus aucune édition manuelle à protéger.
      const shared = { taille:"", couleur:"", matiere:"", marque:"" };
      for (const key of SHARED_FIELD_KEYS) {
        for (const p of SHARED_PROPAGATION[key]) {
          const v = String(initialEdited[p]?.platform_fields?.[key] ?? "").trim();
          if (v) { shared[key] = v; break; }
        }
      }
      setSharedFields(shared);
      setSharedOverrides({});

      setEdited(initialEdited);
      setPlatformListings(data);
    } catch (e) {
      setPlatformError(e.message);
    } finally {
      setGeneratingPlatforms(false);
    }
  }

  // ── Champs partagés : setter propagateur + garde générique (Sujet 4) ──────
  // Écrit la source canonique ET la propage aux copies plateformes non
  // éditées à la main (override local sacré, cf. sharedOverrides).
  function setSharedField(key, value) {
    setSharedFields(prev => ({ ...prev, [key]: value }));
    setEdited(prev => {
      const next = { ...prev };
      for (const p of SHARED_PROPAGATION[key]) {
        if (!next[p]) continue;
        if (sharedOverrides[p]?.has(key)) continue;
        next[p] = { ...next[p], platform_fields: { ...next[p].platform_fields, [key]: value } };
      }
      return next;
    });
  }
  // Édition manuelle d'UNE copie plateforme : le lien casse pour cette copie
  // seulement (les autres restent synchronisées sur la source).
  function noteSharedOverride(platform, key) {
    if (!SHARED_FIELD_KEYS.includes(key)) return;
    setSharedOverrides(prev => {
      const set = new Set(prev[platform] ?? []);
      set.add(key);
      return { ...prev, [platform]: set };
    });
  }
  // Garde générique : un champ partagé vide bloque si AU MOINS une plateforme
  // SÉLECTIONNÉE le consomme (SHARED_GUARD). Dérivé de l'état → corriger un
  // champ dans l'encart inline de StepPublish re-render ce step seulement.
  // Exception taille×Leboncoin (2026-07-11) : LBC ne bloque sur la taille
  // QUE pour Mode>Chaussures (Pointure obligatoire, shoe_size) — même
  // détection icône→getLbcCategoryPath que le bloc LBC de handlePublish.
  const missingSharedFields = useMemo(() => {
    const lbcIcon = detectObjectIcon(
      edited.leboncoin?.title,
      edited.leboncoin?.description,
      edited.leboncoin?.platform_fields?.categorie || initialListing?.categorie
    );
    const lbcPath = getLbcCategoryPath(lbcIcon);
    const lbcShoes = lbcPath?.[0] === "Mode" && lbcPath?.[1] === "Chaussures";
    const guardPlatforms = (key) =>
      key === "taille" && lbcShoes ? [...SHARED_GUARD.taille, "leboncoin"] : SHARED_GUARD[key];
    return SHARED_FIELD_KEYS.filter(key =>
      !String(sharedFields[key] ?? "").trim() &&
      [...selected].some(p => guardPlatforms(key).includes(p))
    );
  }, [sharedFields, selected, edited, initialListing]);

  // ── Publication ───────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!selected.size) return;
    setPublishing(true);
    setPublishError("");
    try {
      // ── Filet champs partagés (Sujet 4) : l'encart inline de StepPublish
      // est le chemin nominal, ce re-check attrape un état périmé ou une
      // course — même règle SHARED_GUARD, avant tout effet de bord.
      if (missingSharedFields.length) {
        const labels = {
          taille:  t("fieldSizeLabel"),
          couleur: t("fieldColorLabel"),
          matiere: t("fieldMaterialLabel"),
          marque:  t("fieldBrandLabel"),
        };
        throw new Error(tpl("stepPublishSharedFieldsMissing", {
          fields: missingSharedFields.map(k => labels[k]).join(", "),
        }));
      }

      // Switch "Ajouter au stock" ON et article pas encore en stock : on le crée
      // maintenant, juste avant de générer les jobs de publication, pour que
      // cross_post_jobs.inventaire_id pointe vers la bonne ligne dès l'insert.
      let currentInvId = invId;
      if (addToStock && !currentInvId && createStockItem) {
        currentInvId = await createStockItem(prixAchatSaisi);
        if (!currentInvId) throw new Error(t("genericError"));
        setInvId(currentInvId);
      }

      // Adresse de remise (Settings) : lue une fois par publication, injectée
      // dans platform_fields.adresse. Absente → le job part quand même,
      // l'extension le remettra en pending avec un message explicite (jamais
      // de blocage dur, le brouillon LBC persiste). Beebs exige aussi une
      // adresse (autocomplete Google Places, relevé en session réelle
      // 2026-07-08, cf. content-scripts/beebs.js) mais n'a pas de réglage
      // dédié dans l'app — on réutilise la même adresse d'expédition que
      // Leboncoin plutôt que dupliquer un champ Settings pour une seule
      // valeur physique identique.
      let lbcAddress = null;
      if (selected.has("leboncoin") || selected.has("beebs")) {
        const { data: prof } = await supabase.from("profiles")
          .select("platform_settings").eq("id", userId).maybeSingle();
        lbcAddress = prof?.platform_settings?.leboncoin?.adresse || null;
      }

      // ── Auto-résolution du genre (2026-07-09) — remplace le blocage dur ──
      // generate-listing n'est pas déterministe : sur le même article, 4
      // générations consécutives ont donné genre="Homme" puis une "Mixte"
      // (Patagonia P-6, vérifié en DB). L'ancien bandeau rouge
      // t("vintedGenreRequired") bloquait alors TOUTE la publication
      // multi-plateforme jusqu'à correction manuelle — à l'opposé de la
      // "publication automatique sans rien faire" promise au même écran.
      // Même famille de blocage côté Beebs : son arbre Mode est genré jusqu'aux
      // ACCESSOIRES (Montres vit sous Mode>Femme/Homme>Accessoires — vérifié),
      // donc une montre sans genre partait en failed à 100 % au pré-check de
      // l'extension (cas réel Casio du 2026-07-09), alors qu'eBay range déjà
      // ⌚/💍 hors rayons genrés. On tranche donc AUTOMATIQUEMENT, sans jamais
      // bloquer : genre déjà résolu sur une autre plateforme du même run
      // d'abord (cohérence, zéro appel), sinon relance IA ciblée du seul champ
      // genre (mode resolve_genre de generate-listing, prompt strict — jamais
      // Mixte), sinon défaut "Femme" (plus gros rayon Vinted/Beebs). Un genre
      // explicite (Femme/Homme/Enfant/…) n'est JAMAIS écrasé — seuls
      // vide/"Mixte" le sont, et l'utilisateur peut corriger dans les champs
      // plateforme avant de publier s'il n'est pas d'accord.
      const iconFor = (platform) => {
        const pf = edited[platform]?.platform_fields ?? {};
        return detectObjectIcon(
          edited[platform]?.title,
          edited[platform]?.description,
          pf.categorie || initialListing?.categorie
        );
      };
      const genreUnresolved = (platform) => {
        if (!selected.has(platform)) return false;
        const g = edited[platform]?.platform_fields?.genre ?? "";
        if (g && g !== "Mixte") return false; // choix explicite respecté
        const icon = iconFor(platform);
        if (platform === "vinted") return vintedGenreRequired(icon);
        // 🌸 + Mixte résout un vrai rayon eBay (Parfums mixtes) : pas touché.
        if (platform === "ebay") return ebayGenreRequired(icon) && !getEbayCategoryId(icon, g);
        if (platform === "beebs") return beebsGenreRequired(icon);
        return false;
      };
      let autoGenre = null;
      if (["vinted", "ebay", "beebs"].some(genreUnresolved)) {
        autoGenre = [
          edited.vinted?.platform_fields?.genre,
          edited.ebay?.platform_fields?.genre,
          edited.beebs?.platform_fields?.genre,
          edited.leboncoin?.platform_fields?.univers,
        ].find(g => g && g !== "Mixte" && g !== "Enfant") ?? null;
        if (!autoGenre) {
          const refP = ["vinted", "ebay", "beebs", "leboncoin"].find(p => edited[p]);
          try {
            const { data: gRes } = await supabase.functions.invoke("generate-listing", {
              body: {
                resolve_genre: true,
                item_data: {
                  titre:       edited[refP]?.title       || initialListing?.titre       || "",
                  marque:      initialListing?.marque      || null,
                  description: edited[refP]?.description || initialListing?.description || null,
                  type:        initialListing?.categorie   || null,
                },
              },
            });
            if (["Femme", "Homme", "Fille", "Garçon", "Bébé"].includes(gRes?.genre)) autoGenre = gRes.genre;
          } catch { /* IA indisponible : défaut ci-dessous */ }
        }
        if (!autoGenre) autoGenre = "Femme";
      }

      const rows = [...selected].map(platform => {
        const pf = { ...(edited[platform]?.platform_fields ?? {}) };
        if (platform === "leboncoin") {
          const icon = detectObjectIcon(
            edited[platform]?.title,
            edited[platform]?.description,
            pf.categorie || initialListing?.categorie
          );
          const lbcPath = getLbcCategoryPath(icon);
          if (lbcPath) pf.lbcCategoryPath = lbcPath;
          if (lbcAddress) pf.adresse = lbcAddress;
          // Famille > Équipement bébé : Univers* est FONCTIONNEL
          // (Alimentation/Mobilité/…) et Produit* en dépend — deux critères
          // bloquants indéductibles du genre (relevé campagne 2026-07-08).
          // On écrase l'univers genre (IA/stepper) par la valeur mappée
          // depuis l'icône, et on pose le Produit attendu par l'extension.
          const babyEquip = getLbcBabyEquipment(icon);
          if (babyEquip) {
            pf.univers = babyEquip.univers;
            pf.lbcProduit = babyEquip.produit;
          }
          // Univers obligatoire sur le rayon Mode LBC ("Veuillez choisir un
          // univers de vêtement"). Contrairement à Vinted, LBC a un rayon
          // Mixte → filet sans friction quand l'IA n'a pas tranché.
          if (!pf.univers && lbcPath?.[0] === "Mode") pf.univers = "Mixte";
        }
        if (platform === "vinted") {
          // Chemin catalogue Vinted calculé à l'insert : icône objet (mêmes
          // règles que les tuiles Stock/Ventes) + genre IA/corrigé. null →
          // pas de categoryPath → l'extension marque le job "failed" avec un
          // message explicite (fallback volontaire, cf. vintedCategories.js).
          const icon = detectObjectIcon(
            edited[platform]?.title,
            edited[platform]?.description,
            pf.categorie || initialListing?.categorie
          );
          // Genre vide/Mixte sur une catégorie qui l'exige → genre auto-résolu
          // (cf. bloc autoGenre) : le job part avec un rayon réel au lieu
          // d'être condamné au fallback.
          if (autoGenre && vintedGenreRequired(icon) && (!pf.genre || pf.genre === "Mixte")) pf.genre = autoGenre;
          const categoryPath = getVintedCategoryPath(icon, pf.genre);
          if (categoryPath) pf.categoryPath = categoryPath;
          // Flag statique lu par l'extension : permet un message d'échec
          // précis ("genre requis") quand un job sans categoryPath vient d'un
          // article de mode plutôt que d'une icône hors mapping.
          if (vintedGenreRequired(icon)) pf.vintedGenreRequired = true;
          // L'extension consomme `colors` (tableau, 2 max côté Vinted).
          // `couleur` (IA ou édité) peut être composé ("Marine et Blanc") :
          // mêmes séparateurs que la cascade extension, la dominante d'abord.
          if (pf.couleur) {
            const colors = String(pf.couleur)
              .split(/\s+et\s+|[,/&+]/i)
              .map(s => s.trim())
              .filter(Boolean)
              .slice(0, 2);
            if (colors.length) pf.colors = colors;
          }
        }
        if (platform === "ebay") {
          // Catégorie eBay posée à l'insert : categoryPath (libellés, pour
          // les messages d'erreur et la vérification post-navigation) ET
          // categoryId numérique (c'est LUI que l'extension met dans l'URL
          // /sl/list — le path ne sert jamais à naviguer). Genre : les
          // valeurs du stepper (Femme/Homme/Enfant) passent TELLES QUELLES
          // — eBay a un vrai rayon "Enfant : unisexe" (contrairement à
          // Vinted/Beebs) ; seul Mixte reste sans rayon (sauf 🌸 parfums).
          const icon = detectObjectIcon(
            edited[platform]?.title,
            edited[platform]?.description,
            pf.categorie || initialListing?.categorie
          );
          // Même auto-résolution que Vinted — sauf si le genre actuel résout
          // déjà un rayon (🌸+Mixte = Parfums mixtes, rayon réel).
          if (autoGenre && ebayGenreRequired(icon) && (!pf.genre || pf.genre === "Mixte")
              && !getEbayCategoryId(icon, pf.genre)) pf.genre = autoGenre;
          const categoryPath = getEbayCategoryPath(icon, pf.genre);
          const categoryId = getEbayCategoryId(icon, pf.genre);
          if (categoryPath) pf.ebayCategoryPath = categoryPath;
          if (categoryId) pf.ebayCategoryId = categoryId;
          if (ebayGenreRequired(icon)) pf.ebayGenreRequired = true;
          // Couleur : l'extension consomme colors[0] (les specifics eBay
          // Couleur sont mono-valeur) — même split que Vinted, dominante
          // d'abord.
          if (pf.couleur && !pf.colors) {
            const colors = String(pf.couleur)
              .split(/\s+et\s+|[,/&+]/i)
              .map(s => s.trim())
              .filter(Boolean)
              .slice(0, 2);
            if (colors.length) pf.colors = colors;
          }
        }
        if (platform === "beebs") {
          // Même contrat que Vinted/eBay : chemin catalogue calculé à
          // l'insert depuis l'icône objet + genre. beebsCategories.js gère
          // déjà lui-même le cas Enfant/Mixte/vide → null (genre Beebs a 5
          // valeurs Femme/Homme/Fille/Garçon/Bébé, pas de résolution
          // automatique depuis Enfant pour l'instant, cf. commentaire de
          // tête du fichier) — pas de blocage dur ici, comme eBay : le flag
          // beebsGenreRequired est posé pour que l'extension retourne un
          // needsUser explicite plutôt qu'un échec silencieux.
          const icon = detectObjectIcon(
            edited[platform]?.title,
            edited[platform]?.description,
            pf.categorie || initialListing?.categorie
          );
          // Même auto-résolution que Vinted/eBay. Indispensable ici : l'arbre
          // Mode Beebs est genré jusqu'aux accessoires (montres, bijoux,
          // sacs…) — sans genre, AUCUNE montre ne pouvait jamais partir
          // (pré-check extension → failed à 100 %, cas réel Casio 2026-07-09).
          if (autoGenre && beebsGenreRequired(icon) && (!pf.genre || pf.genre === "Mixte")) pf.genre = autoGenre;
          const categoryPath = getBeebsCategoryPath(icon, pf.genre);
          if (categoryPath) pf.beebsCategoryPath = categoryPath;
          if (beebsGenreRequired(icon)) pf.beebsGenreRequired = true;
          if (lbcAddress) pf.adresse = lbcAddress;
        }
        return {
          user_id:         userId,
          inventaire_id:   addToStock ? currentInvId : null,
          platform,
          status:          "pending",
          photo_option:    photoOption,
          title:           edited[platform]?.title           ?? "",
          description:     edited[platform]?.description     ?? "",
          price:           edited[platform]?.price           ?? price,
          photos:          processedPhotos,
          platform_fields: pf,
        };
      });
      // ── Aspects obligatoires eBay (2026-07-11, Phase 2 du référentiel) ──
      // ebay_item_aspects (peuplée depuis l'API Taxonomy, 237 catégories,
      // lecture ouverte à authenticated) : lecture directe client, pas
      // d'edge function. Le job eBay embarque les NOMS d'aspects
      // required=true de sa catégorie ; l'extension compare ce qu'elle a
      // réellement rempli contre cette liste (unfilledRequired du DRY_RUN).
      // Catégorie absente de la table (trous de mapping — non-feuilles
      // 20571/63514/121048 — ou id futur non re-fetché) → champ non posé,
      // comportement identique à avant : DRY_RUN non bloquant.
      const ebayRow = rows.find(r => r.platform === "ebay");
      // Objets complets {name, allowedValues, mode} gardés en LOCAL pour la
      // garde ci-dessous — jamais sur le job : la liste Marque fait ~19 000
      // entrées (relevé 15687), le payload d'insert n'a pas à la porter.
      let ebayRequiredFull = null;
      if (ebayRow?.platform_fields?.ebayCategoryId && !ebayRow.platform_fields.ebayRequiredAspects) {
        try {
          const { data: aspRow } = await supabase
            .from("ebay_item_aspects")
            .select("aspects, required_count")
            .eq("category_id", String(ebayRow.platform_fields.ebayCategoryId))
            .limit(1)
            .maybeSingle();
          const required = (aspRow?.aspects ?? [])
            .filter(a => a?.required === true && a?.name);
          if (required.length) {
            ebayRow.platform_fields.ebayRequiredAspects = required.map(a => a.name);
            ebayRequiredFull = required;
          }
        } catch { /* best-effort : table indisponible → enrichissement absent, jamais bloquant */ }
      }
      // Job régénéré portant déjà les noms (sans allowedValues re-lues) :
      // la garde retombe sur la seule vérification de présence, comme avant
      // ce patch — jamais moins stricte qu'avant.
      if (!ebayRequiredFull && ebayRow?.platform_fields?.ebayRequiredAspects) {
        ebayRequiredFull = ebayRow.platform_fields.ebayRequiredAspects.map(name => ({ name, allowedValues: [] }));
      }
      // ── Garde pré-publication eBay (2026-07-11, décision produit) ──────
      // Un aspect OBLIGATOIRE de la catégorie qui correspond à un de nos 4
      // champs connus et qui est vide → interruption AVANT le débit/insert
      // (le throw aboutit au bandeau rouge publishError de StepPublish) : ni
      // blocage silencieux, ni valeur devinée — l'utilisateur complète le
      // champ dans l'app puis relance. Cas réel déclencheur : taille=""
      // avec "Taille" required sur la catégorie, dry-run "réussi" sans
      // avertissement visible. Les obligatoires SANS mapping (Type, Longueur
      // des manches...) ne bloquent pas : ils restent sur le canal
      // unfilledRequired de l'extension (constat informatif). Uniquement
      // eBay — les règles Vinted/LBC/Beebs sont gérées ailleurs.
      if (ebayRow && ebayRequiredFull) {
        const pfE = ebayRow.platform_fields;
        // Valeurs telles que l'EXTENSION les enverra (mêmes transformations
        // que ebay.js : strip "EU " sur la taille, colors[0] prioritaire).
        const knownAspects = [
          { labels: ["Marque"], value: () => pfE.marque },
          { labels: ["Taille", "Pointure EU", "Pointure"], value: () => String(pfE.taille ?? "").replace(/^EU\s*/i, "") },
          { labels: ["Couleur"], value: () => pfE.colors?.[0] || pfE.couleur },
          { labels: ["Matière", "Matériau", "Matériaux"], value: () => pfE.matiere },
        ];
        // Même normalisation que normalizeFuzzy de ebay.js — la garde doit
        // accepter exactement ce que l'extension rapprochera au remplissage.
        const normFuzzy = s => String(s).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        // Manquant = champ vide, OU valeur hors du référentiel quand l'aspect
        // est un vrai choix fermé (patch 2026-07-11 : job dd9ac7a3,
        // couleur="Black" — non-vide mais absente des 17 valeurs FR de la
        // liste Couleur → aurait échoué en silence sur la vraie page eBay).
        //
        // « Vrai choix fermé » = liste allowedValues ≤ 200 entrées, OU
        // mode="SELECTION_ONLY" quel que soit le volume. Le seuil sépare les
        // ensembles fermés réels des listes de référence/typeahead — chiffres
        // relevés sur la catégorie 15687 : Couleur 17, Taille 55 (choix
        // fermés à valider) vs Marque 19 037 (FREE_TEXT, aide à la saisie :
        // eBay accepte une marque hors liste en saisie libre, et l'extension
        // sait la taper — bloquer "MaMarqueDeNiche123" ici refuserait une
        // publication qu'eBay aurait acceptée). FREE_TEXT + liste > 200 ou
        // liste vide → la présence suffit, comme avant ce patch.
        const CLOSED_LIST_MAX = 200;
        const missing = ebayRequiredFull.filter(aspect => {
          const known = knownAspects.find(k => k.labels.includes(aspect.name));
          if (!known) return false; // pas de mapping → canal unfilledRequired de l'extension
          const val = String(known.value() ?? "").trim();
          if (!val) return true;
          const allowed = Array.isArray(aspect.allowedValues) ? aspect.allowedValues : [];
          const closedList = allowed.length &&
            (allowed.length <= CLOSED_LIST_MAX || aspect.mode === "SELECTION_ONLY");
          if (!closedList) return false;
          return !allowed.some(v => normFuzzy(v) === normFuzzy(val));
        }).map(a => a.name);
        if (missing.length) {
          throw new Error(tpl("stepPublishEbayRequiredMissing", { fields: missing.join(", ") }));
        }
      }
      // Débit des pièces + insertion des jobs en UNE transaction serveur :
      // prix et user imposés côté serveur (coin_config + auth.uid()), insert
      // raté = zéro pièce débitée. Remplace check_publish_quota + insert +
      // log_publish pour les clients pièces.
      const { data: pubRes, error: pubErr } = await supabase.rpc("spend_coins_and_publish", {
        p_photo_option: photoOption,
        p_jobs: rows,
      });
      if (pubErr) throw new Error(t("genericError"));
      if (pubRes?.allowed === false) {
        setPublishing(false);
        if (pubRes.reason === "insufficient_coins") {
          setQuotaModal({ open: true, trigger: "publish", targetTiers: ["premium","pro"] });
          return;
        }
        throw new Error(t("genericError"));
      }
      setWallet({ included_balance: pubRes.included_after, purchased_balance: pubRes.purchased_after });
      if (addToStock && currentInvId && processedPhotos?.length) {
        await supabase.from("inventaire").update({ photos: processedPhotos }).eq("id", currentInvId);
      }
      setDone(true);
    } catch (e) {
      setPublishError(e.message);
      setPublishing(false);
    }
  }

  // ── Nav ───────────────────────────────────────────────────────────────────
  const displayPreviews = pickedPreviews.length > 0 ? pickedPreviews : photos;
  const photoCount      = displayPreviews.length;
  const isLocked        = uploading || publishing || generatingPlatforms;

  const publishChips = [...selected].filter(p => platformListings?.platforms?.[p]);

  function ctaLabel() {
    if (step === 0) {
      if (uploading)        return t("ctaUploading");
      if (photoCount === 0) return t("ctaAddAtLeastOnePhoto");
      return tpl("ctaContinuePhotos", { n:photoCount });
    }
    if (step === 1) {
      if (!photos.length) return t("ctaAddAtLeastOnePhoto");
      return t("ctaGenerateListings");
    }
    if (step === 2) {
      if (generatingPlatforms || !platformListings) return t("ctaGenerating");
      return t("ctaContinueToPublish");
    }
    if (step === 3) {
      if (publishing) return t("ctaPublishing");
      const n = publishChips.length;
      return tpl("ctaPublishOnPlatforms", { n });
    }
    return "";
  }

  const ctaDisabled =
    (step === 0 && (photoCount === 0 || uploading)) ||
    (step === 1 && (photos.length === 0 || selected.size === 0)) ||
    (step === 2 && (generatingPlatforms || !platformListings)) ||
    (step === 3 && (publishChips.length === 0 || publishing));

  function handleNext() {
    if (step === 0) { handleUpload(); return; }
    if (step === 1) {
      // Pièces : blocage doux si le solde ne couvre pas l'option choisie —
      // remplace l'ancien blocage dur Free. Le débit réel a lieu à Publier,
      // ici on évite juste de lancer une génération qu'on ne pourra pas payer.
      const price = coinPriceFor(photoOption);
      if (price != null && coinBalance < price) {
        setQuotaModal({ open: true, trigger: "publish", targetTiers: ["premium","pro"] });
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) { if (platformListings) { setStep(3); } return; }
    if (step === 3) { handlePublish(); }
  }

  // Bouton retour unique du header : retourne à l'étape précédente, ou ferme
  // le stepper si on est à la toute première étape (Upload).
  function handleBack() {
    if (isLocked) return;
    if (step === 0) { onClose(); return; }
    setStep(s => s - 1);
  }

  // ── Render : initializing ─────────────────────────────────────────────────
  if (initializing) return (
    <div style={{
      position:"fixed", inset:0, zIndex:300,
      background:T.canvas, display:"flex", alignItems:"center", justifyContent:"center",
      paddingTop:"env(safe-area-inset-top,0px)", paddingBottom:"env(safe-area-inset-bottom,0px)",
    }}>
      <Loader size={36} thickness={3} />
    </div>
  );

  // ── Render : done ─────────────────────────────────────────────────────────
  if (done) return (
    <div style={{
      position:"fixed", inset:0, zIndex:300,
      background:T.canvas, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"60px 32px 32px",
      paddingTop:"calc(env(safe-area-inset-top,0px) + 60px)", paddingBottom:"calc(env(safe-area-inset-bottom,0px) + 32px)",
    }}>
      <style>{`@keyframes lps-popIn{0%{transform:scale(0.4);opacity:0}80%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
      <div style={{ fontSize:72, animation:"lps-popIn 0.5s ease forwards" }}>✅</div>
      <div style={{ fontSize:22, fontWeight:600, color:T.ink, textAlign:"center", marginTop:16 }}>
        {t("doneTitle")}
      </div>
      <div style={{ fontSize:14, color:T.mute2, textAlign:"center", lineHeight:1.6, marginTop:8, maxWidth:280 }}>
        {t("doneSubtitle")}
      </div>
      <button
        onClick={onClose}
        style={{
          marginTop:28, padding:"14px 40px", borderRadius:999,
          background:`linear-gradient(120deg,${T.teal},${T.tealDeep})`,
          color:"#fff", border:"none", fontSize:15, fontWeight:600,
          cursor:"pointer", fontFamily:"inherit",
          boxShadow:"0 10px 24px rgba(47,158,144,0.28)",
        }}
      >
        {t("doneButton")}
      </button>
    </div>
  );

  // ── Render : stepper ──────────────────────────────────────────────────────
  return (
    <div style={{
      position:"fixed", inset:0, zIndex:300,
      display:"flex", flexDirection:"column", width:"100%", height:"100%",
      background:T.canvas, overflowY:"auto",
      paddingTop:"env(safe-area-inset-top,0px)",
    }}>
      <style>{`* { box-sizing: border-box; }`}</style>

      {/* Header : retour + progression */}
      <div style={{ padding:"12px 20px 0" }}>
        <button
          onClick={handleBack}
          disabled={isLocked}
          style={{
            width:36, height:36, borderRadius:"50%",
            background:T.chip, border:"none",
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor: isLocked ? "not-allowed" : "pointer",
            opacity: isLocked ? 0.5 : 1,
          }}
        >
          <ChevronLeft size={18} color={T.ink} />
        </button>
      </div>
      <StepProgress step={step} labels={stepLabels} />

      {/* Contenu de l'étape */}
      <div style={{ padding:"16px 20px 8px", flex:1 }}>
        {step === 0 && (
          <StepUpload
            previews={displayPreviews}
            removable={pickedPreviews.length > 0}
            onAdd={addFiles}
            onRemove={removeFile}
            notes={notes}
            setNotes={setNotes}
            micActive={micActive}
            toggleMic={toggleMic}
            error={uploadError}
            lang={lang}
          />
        )}
        {step === 1 && (
          <StepPhotos
            photos={photos}
            onAddPhotos={handleAddMorePhotos}
            onRemovePhoto={handleRemovePhoto}
            onPhotoClick={setLightboxUrl}
            photoOption={photoOption}
            setPhotoOption={setPhotoOption}
            background={background}
            setBackground={setBackground}
            selected={selected}
            setSelected={setSelected}
            coinPrices={coinPrices}
            coinBalance={coinBalance}
            onOpenStore={() => setStoreOpen(true)}
            platformSupport={platformSupport}
            lang={lang}
          />
        )}
        {step === 2 && (
          <StepGeneration
            generating={generatingPlatforms}
            generateError={platformError}
            platformListings={platformListings}
            processedPhotos={processedPhotos}
            selected={selected}
            edited={edited}
            setEdited={setEdited}
            onPhotoClick={setLightboxUrl}
            onRetry={handleGeneratePlatforms}
            noteOverride={noteSharedOverride}
            lang={lang}
          />
        )}
        {step === 3 && (
          <StepPublish
            selected={selected}
            setSelected={setSelected}
            platformListings={platformListings}
            publishError={publishError}
            lang={lang}
            canToggleStock={canToggleStock}
            addToStock={addToStock}
            setAddToStock={setAddToStock}
            prixAchatSaisi={prixAchatSaisi}
            setPrixAchatSaisi={setPrixAchatSaisi}
            missingSharedFields={missingSharedFields}
            sharedFields={sharedFields}
            onSharedFieldChange={setSharedField}
          />
        )}
      </div>

      {/* Footer CTA */}
      <div style={{ padding:"8px 20px", paddingBottom:"calc(env(safe-area-inset-bottom,0px) + 28px)" }}>
        <PrimaryButton
          disabled={ctaDisabled}
          onClick={handleNext}
          icon={step === 3 && !ctaDisabled && !publishing ? Check : undefined}
        >
          {ctaLabel()}
        </PrimaryButton>
      </div>

      {quotaModal.open && (
        <ConversionModal
          isOpen={true}
          onClose={() => setQuotaModal(m => ({ ...m, open: false }))}
          onUpgrade={tier => { setQuotaModal(m => ({ ...m, open: false })); onUpgrade(tier); }}
          trigger={quotaModal.trigger}
          targetTiers={quotaModal.targetTiers}
          lang={lang}
          isPremium={isPremium}
          isPro={isPro}
          coinBalance={coinBalance}
          coinPrice={coinPriceFor(photoOption)}
          onUseCoins={() => { setQuotaModal(m => ({ ...m, open: false })); setStoreOpen(true); }}
        />
      )}

      <CoinStoreModal
        open={storeOpen}
        onClose={() => setStoreOpen(false)}
        lang={lang}
        supabase={supabase}
        onPurchased={refreshWallet}
      />

      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
