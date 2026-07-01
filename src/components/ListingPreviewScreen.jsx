import { useState, useEffect, useRef, Fragment } from "react";
import { Camera, Send, Check, ChevronLeft, ChevronRight, Mic, Images, Zap } from "lucide-react";
import ConversionModal from "./ConversionModal";
import { useTranslation } from "../i18n/useTranslation";

const TEAL  = "#3EACA0";
const PEACH = "#E8956D";
const BG    = "#F2F2EE";

const PLATFORM_LABELS   = { vinted:"Vinted", leboncoin:"Leboncoin", beebs:"Beebs", ebay:"eBay" };
const PLATFORM_COLORS   = { vinted:"#09B584", leboncoin:"#EA5B0C", beebs:"#FF6B35", ebay:"#0064D2" };
const PLATFORMS_DEFAULT = ["vinted","leboncoin","beebs","ebay"];

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

  return {
    vinted: [
      { key:"etat",      label:t("fieldConditionLabel"), type:"select", options:[condition.newWithTag, condition.newWithoutTag, condition.veryGood, condition.good, condition.satisfactory] },
      { key:"taille",    label:t("fieldSizeLabel"),      type:"select", options: size, groups: sizeGroups },
      { key:"marque",    label:t("fieldBrandLabel"),     type:"text" },
      { key:"matiere",   label:t("fieldMaterialLabel"),  type:"text" },
      { key:"categorie", label:t("fieldCategoryLabel"),  type:"text" },
    ],
    leboncoin: [
      { key:"etat",         label:t("fieldConditionLabel"),     type:"select", options:[condition.new_, condition.veryGood, condition.good, condition.correct, condition.forParts] },
      { key:"format_colis", label:t("fieldPackageFormatLabel"), type:"select", options: packageFormat },
    ],
    beebs: [
      { key:"etat",   label:t("fieldConditionLabel"), type:"select", options:[condition.new_, condition.veryGood, condition.good] },
      { key:"taille", label:t("fieldSizeLabel"),      type:"select", options: size, groups: sizeGroups },
      { key:"marque", label:t("fieldBrandLabel"),     type:"text" },
    ],
    ebay: [
      { key:"condition", label:"Condition", type:"select", options:["New","Like New","Very Good","Good","Acceptable"].map(v => ({ value:v, label:v })) },
      { key:"size",      label:"Size",      type:"select", options:["XS","S","M","L","XL","XXL","One Size"].map(v => ({ value:v, label:v })) },
      { key:"brand",     label:"Brand",     type:"text" },
      { key:"material",  label:"Material",  type:"text" },
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

function getSteps(t) {
  return [
    { id:0, label:t("stepLabelUpload"),     Icon:Camera },
    { id:1, label:t("stepLabelPhotos"),     Icon:Images },
    { id:2, label:t("stepLabelGeneration"), Icon:Zap    },
    { id:3, label:t("stepLabelPublish"),    Icon:Send   },
  ];
}

// ── QuotaLimitModal ───────────────────────────────────────────────────────────

function QuotaLimitModal({ onClose, lang }) {
  const { t } = useTranslation(lang);
  return (
    <div style={{
      position:"fixed", inset:0, zIndex:10001,
      background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"flex-end", justifyContent:"center",
    }}>
      <div style={{
        background:"#fff", borderRadius:"24px 24px 0 0", padding:"28px 24px 36px",
        width:"100%", maxWidth:480, fontFamily:"'Nunito',system-ui,sans-serif",
      }}>
        <div style={{ fontWeight:900, fontSize:18, color:"#111", marginBottom:8 }}>
          {t("quotaModalTitle")}
        </div>
        <p style={{ fontSize:13.5, color:"#6B6862", lineHeight:1.6, margin:"0 0 20px" }}>
          {t("quotaModalText")}
        </p>
        <button
          onClick={onClose}
          style={{
            width:"100%", padding:"14px", borderRadius:14, border:"none",
            background:"#111", color:"#fff", fontWeight:800, fontSize:15,
            cursor:"pointer", fontFamily:"inherit",
          }}
        >
          {t("quotaModalCloseButton")}
        </button>
      </div>
    </div>
  );
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

function Eyebrow({ n, label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
      <span style={{
        fontSize:11, fontWeight:900, color:"#fff",
        background:`linear-gradient(135deg,${TEAL},${PEACH})`,
        width:20, height:20, borderRadius:6,
        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
      }}>{n}</span>
      <span style={{ fontSize:11, fontWeight:800, color:"#9B9890", textTransform:"uppercase", letterSpacing:"0.06em" }}>
        {label}
      </span>
    </div>
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
      <Eyebrow n="1" label={t("stepUploadEyebrow")} />
      <h2 style={{ margin:"4px 0 4px", fontSize:20, fontWeight:900, color:"#111" }}>
        {t("stepUploadTitle")}
      </h2>
      <p style={{ margin:"0 0 16px", fontSize:13.5, color:"#6B6862", lineHeight:1.5 }}>
        {t("stepUploadSubtitle")}
      </p>

      {error && (
        <div style={{ padding:"10px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10, fontSize:13, color:"#B91C1C", marginBottom:12 }}>
          {error}
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
        {Array.from({ length: MAX }).map((_, i) => {
          const filled = i < count;
          const url = previews[i];
          return (
            <div
              key={i}
              onClick={() => !filled && fileRef.current?.click()}
              style={{
                aspectRatio:"1", borderRadius:14, overflow:"hidden", position:"relative",
                background: filled ? "#fff" : BG,
                border: filled ? `2px solid ${TEAL}` : "2px dashed #D9D6CC",
                display:"flex", alignItems:"center", justifyContent:"center",
                cursor: filled ? "default" : "pointer",
              }}
            >
              {filled ? (
                <>
                  <img src={url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  {removable && (
                    <button
                      onClick={e => { e.stopPropagation(); onRemove(i); }}
                      style={{
                        position:"absolute", top:4, right:4,
                        width:20, height:20, borderRadius:"50%",
                        background:"rgba(0,0,0,0.55)", border:"none",
                        color:"#fff", fontSize:12, cursor:"pointer",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        padding:0, lineHeight:1,
                      }}
                    >×</button>
                  )}
                </>
              ) : (
                <Camera size={18} color="#9B9890" />
              )}
            </div>
          );
        })}
      </div>

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

      {count > 0 && count < MAX && removable && (
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            width:"100%", padding:"10px", borderRadius:12,
            border:`1.5px dashed ${TEAL}`, background:"#fff",
            color:TEAL, fontWeight:800, fontSize:13,
            cursor:"pointer", fontFamily:"inherit", marginBottom:12,
            display:"flex", alignItems:"center", justifyContent:"center", gap:6,
          }}
        >
          + {tpl("stepUploadAddMore", { n:count, max:MAX })}
        </button>
      )}

      <div style={{ background:"#fff", borderRadius:14, padding:14, border:"1px solid #ECEAE3" }}>
        <div style={{ fontSize:11, fontWeight:800, color:"#9B9890", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>
          {t("stepUploadNotesLabel")}
        </div>
        <div style={{ position:"relative" }}>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={t("stepUploadNotesPlaceholder")}
            rows={2}
            style={{
              width:"100%", padding:"8px 44px 8px 12px",
              borderRadius:10, border:`1.5px solid ${micActive ? "#EF4444" : "rgba(0,0,0,0.1)"}`,
              fontSize:13.5, fontFamily:"inherit", resize:"none", outline:"none",
              background:"#F9FAFB", boxSizing:"border-box", lineHeight:1.5, color:"#111",
              transition:"border-color 0.15s",
            }}
          />
          <button
            onClick={toggleMic}
            style={{
              position:"absolute", right:8, bottom:8,
              width:28, height:28, borderRadius:"50%", border:"none",
              background: micActive ? "#EF4444" : "rgba(0,0,0,0.07)",
              color: micActive ? "#fff" : "#6B7280",
              cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:"all 0.15s",
              boxShadow: micActive ? "0 0 0 3px rgba(239,68,68,0.2)" : "none",
            }}
          >
            {micActive ? "⏹" : <Mic size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 1 — Photos + Retouche ────────────────────────────────────────────────

function StepPhotos({ photos, onAddPhotos, onRemovePhoto, onPhotoClick, photoOption, setPhotoOption, selected, setSelected, isPremium, isPro, onLockTap, lang }) {
  const { t, tpl } = useTranslation(lang);
  const addRef = useRef();
  const MAX = 5;

  const retouchOptions = [
    {
      id: "ia_multi",
      label: t("retouchIaMultiLabel"),
      desc: t("retouchIaMultiDesc"),
      lockedFor: isPro ? null : "pro",
    },
    {
      id: "ia_simple",
      label: t("retouchIaSimpleLabel"),
      desc: t("retouchIaSimpleDesc"),
      lockedFor: (isPremium || isPro) ? null : "premium",
    },
    {
      id: "original",
      label: t("retouchOriginalLabel"),
      desc: t("retouchOriginalDesc"),
      lockedFor: null,
    },
  ];

  return (
    <div>
      <Eyebrow n="2" label={t("stepPhotosEyebrow")} />
      <h2 style={{ margin:"4px 0 4px", fontSize:20, fontWeight:900, color:"#111" }}>
        {t("stepPhotosTitle")}
      </h2>
      <p style={{ margin:"0 0 16px", fontSize:13.5, color:"#6B6862", lineHeight:1.5 }}>
        {t("stepPhotosSubtitle")}
      </p>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:10 }}>
        {photos.map((url, i) => (
          <div
            key={i}
            onClick={() => onPhotoClick(url)}
            style={{ aspectRatio:"1", borderRadius:14, overflow:"hidden", border:`2px solid ${TEAL}`, position:"relative", cursor:"pointer" }}
          >
            <img src={url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            <button
              onClick={e => { e.stopPropagation(); onRemovePhoto(i); }}
              style={{
                position:"absolute", top:4, right:4,
                width:20, height:20, borderRadius:"50%",
                background:"rgba(0,0,0,0.55)", border:"none",
                color:"#fff", fontSize:12, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
                padding:0, lineHeight:1,
              }}
            >×</button>
          </div>
        ))}
      </div>

      {photos.length < MAX ? (
        <>
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
          <button
            onClick={() => addRef.current?.click()}
            style={{
              width:"100%", padding:"10px", borderRadius:12, marginBottom:20,
              border:`1.5px dashed ${TEAL}`, background:"#fff",
              color:TEAL, fontWeight:800, fontSize:13,
              cursor:"pointer", fontFamily:"inherit",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            }}
          >
            + {tpl("stepPhotosAddPhoto", { n:photos.length, max:MAX })}
          </button>
        </>
      ) : (
        <div style={{ marginBottom:20 }} />
      )}

      <div style={{ fontSize:11, fontWeight:800, color:"#9B9890", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>
        {t("stepPhotosStyleLabel")}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {retouchOptions.map(o => {
          const active = photoOption === o.id;
          const locked = !!o.lockedFor;
          return (
            <button
              key={o.id}
              onClick={() => { if (locked) { onLockTap(o.id); return; } setPhotoOption(o.id); }}
              style={{
                textAlign:"left", background:"#fff", borderRadius:14, padding:14,
                border: active && !locked ? `2px solid ${TEAL}` : "1px solid #ECEAE3",
                cursor:"pointer", fontFamily:"inherit", position:"relative",
                opacity: locked ? 0.75 : 1,
              }}
            >
              {locked && (
                <span style={{
                  position:"absolute", top:-8, right:12,
                  fontSize:9.5, fontWeight:800, color:"#fff",
                  background: o.lockedFor === "pro" ? "#7C3AED" : PEACH,
                  padding:"3px 8px", borderRadius:999,
                }}>
                  {o.lockedFor === "pro" ? "Pro" : "Premium"}
                </span>
              )}
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{
                  width:18, height:18, borderRadius:"50%", flexShrink:0,
                  border: active && !locked ? `5px solid ${TEAL}` : "2px solid #D9D6CC",
                  transition:"border 0.15s",
                }} />
                <div>
                  <div style={{ fontWeight:800, fontSize:14, color: locked ? "#9B9890" : "#111", display:"flex", alignItems:"center", gap:6 }}>
                    {o.label}
                    {locked && <span style={{ fontSize:12 }}>🔒</span>}
                  </div>
                  <div style={{ fontSize:12.5, color:"#6B6862", marginTop:2, lineHeight:1.4 }}>{o.desc}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop:20 }}>
        <div style={{ fontSize:11, fontWeight:800, color:"#9B9890", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>
          {t("stepPhotosPlatformsLabel")}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {PLATFORMS_DEFAULT.map(p => {
            const isOn = selected.has(p);
            const color = PLATFORM_COLORS[p];
            return (
              <button
                key={p}
                onClick={() => setSelected(prev => {
                  const s = new Set(prev);
                  s.has(p) ? s.delete(p) : s.add(p);
                  return s;
                })}
                style={{
                  display:"flex", alignItems:"center", gap:9,
                  padding:"11px 14px", borderRadius:12,
                  border: isOn ? `2px solid ${color}` : "1.5px solid #E5E3DC",
                  background: isOn ? `${color}14` : "#fff",
                  cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                  transition:"border 0.15s, background 0.15s",
                }}
              >
                <div style={{
                  width:20, height:20, borderRadius:6, flexShrink:0,
                  background: isOn ? color : "#E5E3DC",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  transition:"background 0.15s",
                }}>
                  {isOn && <Check size={12} color="#fff" strokeWidth={3} />}
                </div>
                <span style={{ fontSize:13.5, fontWeight:800, color: isOn ? color : "#9B9890", transition:"color 0.15s" }}>
                  {PLATFORM_LABELS[p]}
                </span>
              </button>
            );
          })}
        </div>
        {selected.size === 0 && (
          <p style={{ margin:"8px 0 0", fontSize:12.5, color:"#EF4444", fontWeight:700 }}>
            {t("stepPhotosSelectPlatformError")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Step 2 — Génération (phase A : loading · phase B : review éditable) ───────

function StepGeneration({ generating, generateError, platformListings, processedPhotos, selected, edited, setEdited, onPhotoClick, onRetry, lang }) {
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
      <div>
        <Eyebrow n="3" label={t("stepGenEyebrow")} />
        <h2 style={{ margin:"4px 0 4px", fontSize:20, fontWeight:900, color:"#111" }}>
          {t("stepGenLoadingTitle")}
        </h2>
        <p style={{ margin:"0 0 18px", fontSize:13.5, color:"#6B6862", lineHeight:1.5 }}>
          {t("stepGenLoadingSubtitle")}
        </p>
        <div style={{
          background:"#fff", borderRadius:16, padding:32, border:"1px solid #ECEAE3",
          display:"flex", flexDirection:"column", alignItems:"center", gap:16,
        }}>
          <div style={{
            width:48, height:48, borderRadius:"50%",
            border:`4px solid ${TEAL}33`, borderTopColor:TEAL,
            animation:"lps-spin 0.8s linear infinite",
          }} />
          <p style={{ margin:0, fontSize:13.5, color:"#374151", textAlign:"center", lineHeight:1.6, fontWeight:700, minHeight:44 }}>
            {msg}
          </p>
        </div>
      </div>
    );
  }

  // Error
  if (generateError && !platformListings) {
    return (
      <div>
        <Eyebrow n="3" label={t("stepGenEyebrow")} />
        <h2 style={{ margin:"4px 0 4px", fontSize:20, fontWeight:900, color:"#111" }}>
          {t("stepGenErrorTitle")}
        </h2>
        <div style={{ padding:"12px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:12, fontSize:13, color:"#B91C1C", marginBottom:14 }}>
          {generateError}
        </div>
        <button
          onClick={onRetry}
          style={{
            width:"100%", padding:"12px", borderRadius:12,
            border:`1.5px solid ${TEAL}`, background:"#fff",
            color:TEAL, fontWeight:800, fontSize:13.5,
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
      <Eyebrow n="3" label={t("stepGenEyebrow")} />
      <h2 style={{ margin:"4px 0 4px", fontSize:20, fontWeight:900, color:"#111" }}>
        {t("stepGenReviewTitle")}
      </h2>
      <p style={{ margin:"0 0 16px", fontSize:13.5, color:"#6B6862", lineHeight:1.5 }}>
        {t("stepGenReviewSubtitle")}
      </p>

      {processedPhotos?.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:800, color:"#9B9890", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>
            {t("stepGenEnhancedPhotosLabel")}
          </div>
          <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
            {processedPhotos.map((ph, i) => (
              <div
                key={i}
                onClick={() => onPhotoClick(ph.url ?? ph)}
                style={{ flexShrink:0, width:80, height:80, borderRadius:10, overflow:"hidden", border:`2px solid ${TEAL}`, cursor:"pointer" }}
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
            <div key={p} style={{ background:"#fff", borderRadius:16, border: isOpen ? `1.5px solid ${TEAL}` : "1px solid #ECEAE3", overflow:"hidden" }}>
              <button
                onClick={() => toggleCard(p)}
                style={{
                  width:"100%", padding:"14px 16px",
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                }}
              >
                <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0, overflow:"hidden" }}>
                  <span style={{
                    fontSize:10, fontWeight:900, color:"#fff",
                    background: isOpen ? `linear-gradient(135deg,${TEAL},${PEACH})` : "#9B9890",
                    padding:"3px 8px", borderRadius:999, flexShrink:0,
                    transition:"background 0.15s",
                  }}>
                    {PLATFORM_LABELS[p].toUpperCase()}
                  </span>
                  <span style={{ fontSize:13, color:"#374151", fontWeight: isOpen ? 700 : 500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {summaryParts.join(" · ")}
                  </span>
                </div>
                <span style={{ fontSize:18, color:"#9B9890", flexShrink:0, marginLeft:8, transition:"transform 0.15s", display:"inline-block", transform: isOpen ? "rotate(90deg)" : "none" }}>›</span>
              </button>

              {isOpen && (
                <div style={{ padding:"0 16px 16px", borderTop:"1px solid #F0EDE6" }}>
                  <div style={{ marginBottom:10, paddingTop:12 }}>
                    <div style={{ fontSize:11, color:"#9B9890", fontWeight:700, marginBottom:4 }}>{t("fieldTitleLabel")}</div>
                    <input
                      type="text"
                      value={e.title}
                      onChange={ev => setEdited(prev => ({ ...prev, [p]: { ...prev[p], title: ev.target.value } }))}
                      style={{ width:"100%", padding:"10px 12px", borderRadius:10, border:"1px solid #ECEAE3", fontSize:13.5, fontFamily:"inherit", outline:"none", background:"#F9FAFB", boxSizing:"border-box" }}
                    />
                  </div>

                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:"#9B9890", fontWeight:700, marginBottom:4 }}>{t("fieldDescriptionLabel")}</div>
                    <textarea
                      value={e.description}
                      onChange={ev => setEdited(prev => ({ ...prev, [p]: { ...prev[p], description: ev.target.value } }))}
                      rows={4}
                      style={{ width:"100%", padding:"10px 12px", borderRadius:10, border:"1px solid #ECEAE3", fontSize:13, fontFamily:"inherit", outline:"none", background:"#F9FAFB", resize:"vertical", boxSizing:"border-box", lineHeight:1.5 }}
                    />
                  </div>

                  {fieldConfigs.length > 0 && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                      {fieldConfigs.map((field, fi) => {
                        const val = e.platform_fields?.[field.key] ?? "";
                        const isLastOdd = fi === fieldConfigs.length - 1 && fieldConfigs.length % 2 !== 0;
                        const onChange = nv => setEdited(prev => ({
                          ...prev,
                          [p]: { ...prev[p], platform_fields: { ...prev[p].platform_fields, [field.key]: nv } },
                        }));
                        return (
                          <div key={field.key} style={isLastOdd ? { gridColumn:"1 / -1" } : {}}>
                            <div style={{ fontSize:11, color:"#9B9890", fontWeight:700, marginBottom:4 }}>{field.label}</div>
                            {field.type === "select" ? (
                              <select
                                value={val}
                                onChange={ev => onChange(ev.target.value)}
                                style={{ width:"100%", padding:"9px 10px", borderRadius:10, border:"1px solid #ECEAE3", fontSize:13, fontFamily:"inherit", outline:"none", background:"#F9FAFB", boxSizing:"border-box", color: val ? "#111" : "#9B9890" }}
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
                                style={{ width:"100%", padding:"9px 10px", borderRadius:10, border:"1px solid #ECEAE3", fontSize:13, fontFamily:"inherit", outline:"none", background:"#F9FAFB", boxSizing:"border-box" }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div>
                    <div style={{ fontSize:11, color:"#9B9890", fontWeight:700, marginBottom:4 }}>{t("fieldSalePriceLabel")}</div>
                    <input
                      type="number"
                      value={e.price ?? ""}
                      onChange={ev => setEdited(prev => ({ ...prev, [p]: { ...prev[p], price: ev.target.value === "" ? null : Number(ev.target.value) } }))}
                      placeholder="—"
                      style={{ width:"100%", padding:"10px 12px", borderRadius:10, border:"1px solid #ECEAE3", fontSize:14, fontWeight:700, fontFamily:"inherit", outline:"none", background:"#F9FAFB", boxSizing:"border-box" }}
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

// ── Step 3 — Publier (chips + croix) ─────────────────────────────────────────

function StepPublish({ selected, setSelected, platformListings, publishError, lang }) {
  const { t } = useTranslation(lang);
  const chips = [...selected].filter(p => platformListings?.platforms?.[p]);

  return (
    <div>
      <Eyebrow n="4" label={t("stepPublishEyebrow")} />
      <h2 style={{ margin:"4px 0 4px", fontSize:20, fontWeight:900, color:"#111" }}>
        {t("stepPublishTitle")}
      </h2>
      <p style={{ margin:"0 0 18px", fontSize:13.5, color:"#6B6862", lineHeight:1.5 }}>
        {t("stepPublishSubtitle")}
      </p>

      {publishError && (
        <div style={{ padding:"10px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10, fontSize:13, color:"#B91C1C", marginBottom:12 }}>
          {publishError}
        </div>
      )}

      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
        {chips.map(p => (
          <div
            key={p}
            style={{
              display:"inline-flex", alignItems:"center", gap:8,
              background:"#fff", border:`1.5px solid ${TEAL}`,
              borderRadius:12, padding:"10px 14px",
              fontWeight:800, fontSize:14, color:"#111",
            }}
          >
            <Check size={14} color={TEAL} strokeWidth={3} />
            {PLATFORM_LABELS[p]}
            <button
              onClick={() => setSelected(prev => { const s = new Set(prev); s.delete(p); return s; })}
              style={{
                background:"none", border:"none", padding:0,
                cursor:"pointer", color:"#9B9890", fontSize:18,
                lineHeight:1, display:"flex", alignItems:"center",
              }}
            >×</button>
          </div>
        ))}
      </div>

      {chips.length === 0 && (
        <p style={{ fontSize:13, color:"#9B9890", textAlign:"center", marginTop:16 }}>
          {t("stepPublishNoPlatformError")}
        </p>
      )}

      {chips.length > 0 && (
        <div style={{ marginTop:20, padding:"14px 16px", background:"#fff", borderRadius:14, border:"1px solid #ECEAE3" }}>
          <p style={{ margin:"0 0 8px", fontSize:13.5, fontWeight:800, color:"#374151" }}>
            {t("stepPublishReadyTitle")}
          </p>
          <p style={{ margin:"0 0 8px", fontSize:13, color:"#6B6862", lineHeight:1.65 }}>
            {t("stepPublishCronText1")}
          </p>
          <p style={{ margin:0, fontSize:12.5, color:"#9B9890", lineHeight:1.6 }}>
            {t("stepPublishCronText2")}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ListingPreviewScreen({
  inventaireId, userId, initialPhotos = [], initialListing = null, supabase, lang, onClose,
  isPremium = false, isPro = false, founderSpotsLeft = 7, onUpgrade = () => {},
}) {
  const { t, tpl } = useTranslation(lang);
  const STEPS = getSteps(t);
  const platformFieldsConfig = getPlatformFieldsConfig(t);

  const [step, setStep]         = useState(0);
  const [initializing, setInit] = useState(true);

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
    isPro ? "ia_multi" : isPremium ? "ia_simple" : "original"
  );

  // Step 2 — résultats generate-listing
  const [generatingPlatforms, setGeneratingPlatforms] = useState(false);
  const [platformError, setPlatformError]             = useState("");
  const [platformListings, setPlatformListings]       = useState(null);
  const [processedPhotos, setProcessedPhotos]         = useState([]);
  const [edited, setEdited]                           = useState({});

  // Step 3 — sélection plateformes (chips) + publication
  const [selected, setSelected]         = useState(new Set(PLATFORMS_DEFAULT));
  const [publishing, setPublishing]     = useState(false);
  const [publishError, setPublishError] = useState("");
  const [done, setDone]                 = useState(false);

  // Modal quota / tier
  const [quotaModal, setQuotaModal] = useState({
    open: false, trigger: "lens", targetTiers: ["premium"], isProCoins: false,
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from("inventaire")
      .select("prix_vente,prix_achat")
      .eq("id", inventaireId)
      .single()
      .then(({ data }) => {
        const dbPrice = data?.prix_vente ?? data?.prix_achat ?? null;
        const finalPrice = initialListing?.prix_vente_suggere ?? dbPrice;
        if (finalPrice != null) setPrice(finalPrice);
      });

    if (initialPhotos.length > 0) {
      setPhotos(initialPhotos);
      setStep(1);
      setInit(false);
      return;
    }

    supabase
      .from("cross_post_jobs")
      .select("photos")
      .eq("inventaire_id", inventaireId)
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
      const { data, error: fnErr } = await supabase.functions.invoke("generate-listing", {
        body: {
          inventaire_id: inventaireId,
          photos,
          platforms,
          photo_option: photoOption,
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
      setEdited(initialEdited);
      setPlatformListings(data);
    } catch (e) {
      setPlatformError(e.message);
    } finally {
      setGeneratingPlatforms(false);
    }
  }

  // ── Publication ───────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!selected.size) return;
    setPublishing(true);
    setPublishError("");
    try {
      const { data: quotaData, error: quotaErr } = await supabase.rpc("check_and_log_publish", {
        p_user_id:    userId,
        p_is_premium: isPremium,
        p_is_pro:     isPro,
      });
      if (quotaErr) throw new Error(t("genericError"));
      if (quotaData?.allowed === false) {
        setPublishing(false);
        setQuotaModal({
          open: true, trigger: "publish",
          targetTiers: quotaData.reason === "tier_free" ? ["premium","pro"] : ["pro"],
          isProCoins: false,
        });
        return;
      }

      const rows = [...selected].map(platform => ({
        user_id:         userId,
        inventaire_id:   inventaireId,
        platform,
        status:          "pending",
        photo_option:    photoOption,
        title:           edited[platform]?.title           ?? "",
        description:     edited[platform]?.description     ?? "",
        price:           edited[platform]?.price           ?? price,
        photos:          processedPhotos,
        platform_fields: edited[platform]?.platform_fields ?? {},
      }));
      const { error: insErr } = await supabase.from("cross_post_jobs").insert(rows);
      if (insErr) throw new Error(t("genericError"));
      if (processedPhotos?.length) {
        await supabase.from("inventaire").update({ photos: processedPhotos }).eq("id", inventaireId);
      }
      setDone(true);
    } catch (e) {
      setPublishError(e.message);
      setPublishing(false);
    }
  }

  // ── Lock retouche ─────────────────────────────────────────────────────────
  function handleStyleLockTap(optionId) {
    if (optionId === "ia_multi") {
      setQuotaModal({
        open: true, trigger: "style",
        targetTiers: isPremium ? ["pro"] : ["premium","pro"],
        isProCoins: false,
      });
    } else if (optionId === "ia_simple") {
      setQuotaModal({ open: true, trigger: "style", targetTiers: ["premium","pro"], isProCoins: false });
    }
  }

  // ── Nav ───────────────────────────────────────────────────────────────────
  const displayPreviews = pickedPreviews.length > 0 ? pickedPreviews : photos;
  const photoCount      = displayPreviews.length;
  const isLocked        = uploading || publishing || generatingPlatforms;
  const canGoBack       = step > 0 && !(step === 1 && pickedFiles.length === 0 && photos.length > 0);

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
      if (!isPremium && !isPro) {
        setQuotaModal({ open: true, trigger: "publish", targetTiers: ["premium","pro"], isProCoins: false });
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) { if (platformListings) { setStep(3); } return; }
    if (step === 3) { handlePublish(); }
  }

  // ── Render : initializing ─────────────────────────────────────────────────
  if (initializing) return (
    <div style={{ background:BG, display:"flex", alignItems:"center", justifyContent:"center", minHeight:200 }}>
      <style>{`@keyframes lps-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:36, height:36, borderRadius:"50%", border:`3px solid ${TEAL}33`, borderTopColor:TEAL, animation:"lps-spin 0.8s linear infinite" }} />
    </div>
  );

  // ── Render : done ─────────────────────────────────────────────────────────
  if (done) return (
    <div style={{ background:BG, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"60px 32px 32px", fontFamily:"'Nunito',system-ui,sans-serif", minHeight:"60vh" }}>
      <style>{`@keyframes lps-popIn{0%{transform:scale(0.4);opacity:0}80%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
      <div style={{ fontSize:72, animation:"lps-popIn 0.5s ease forwards" }}>✅</div>
      <div style={{ fontSize:22, fontWeight:900, color:"#111", textAlign:"center", marginTop:16 }}>
        {t("doneTitle")}
      </div>
      <div style={{ fontSize:14, color:"#6B6862", textAlign:"center", lineHeight:1.6, marginTop:8, maxWidth:280 }}>
        {t("doneSubtitle")}
      </div>
      <button
        onClick={onClose}
        style={{
          marginTop:28, padding:"14px 40px", borderRadius:16,
          background:`linear-gradient(135deg,${TEAL},#2DD4BF)`,
          color:"#fff", border:"none", fontSize:15, fontWeight:800,
          cursor:"pointer", fontFamily:"inherit",
          boxShadow:`0 8px 20px ${TEAL}55`,
        }}
      >
        {t("doneButton")}
      </button>
    </div>
  );

  // ── Render : stepper ──────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", width:"100%", background:BG, fontFamily:"'Nunito',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes lps-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Barre de progression */}
      <div style={{ padding:"16px 20px 6px" }}>
        <div style={{ display:"flex", alignItems:"center" }}>
          {STEPS.map((s, i) => {
            const { Icon } = s;
            const state = i < step ? "done" : i === step ? "current" : "upcoming";
            return (
              <Fragment key={s.id}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
                  <div style={{
                    width:32, height:32, borderRadius:"50%",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    background: state === "upcoming" ? "#E5E3DC" : `linear-gradient(135deg,${TEAL},${PEACH})`,
                    color: state === "upcoming" ? "#9B9890" : "#fff",
                    boxShadow: state === "current" ? `0 0 0 4px ${TEAL}33` : "none",
                    transition:"all 0.2s",
                  }}>
                    {state === "done"
                      ? <Check size={14} strokeWidth={3} />
                      : <Icon size={13} strokeWidth={2.5} />}
                  </div>
                  <span style={{ fontSize:9, fontWeight:800, color: state === "upcoming" ? "#9B9890" : "#111" }}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    flex:1, height:2, marginBottom:16,
                    background: i < step ? `linear-gradient(90deg,${TEAL},${PEACH})` : "#E5E3DC",
                    borderRadius:2,
                  }} />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {step >= 2 && (
        <div style={{ textAlign:"center", paddingBottom:2 }}>
          <button
            onClick={onClose}
            style={{
              background:"none", border:"none", padding:"4px 12px",
              fontSize:13, fontWeight:700, color:"#9B9890",
              cursor:"pointer", fontFamily:"inherit",
              display:"inline-flex", alignItems:"center", gap:4,
            }}
          >
            ← {t("annuler")}
          </button>
        </div>
      )}

      {/* Contenu de l'étape */}
      <div style={{ padding:"16px 20px 8px" }}>
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
            selected={selected}
            setSelected={setSelected}
            isPremium={isPremium}
            isPro={isPro}
            onLockTap={handleStyleLockTap}
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
          />
        )}
      </div>

      {/* Footer nav */}
      <div style={{ padding:"8px 20px 28px", display:"flex", gap:10 }}>
        {canGoBack && (
          <button
            onClick={() => !isLocked && setStep(s => s - 1)}
            disabled={isLocked}
            style={{
              flex:"0 0 52px", height:52, borderRadius:16,
              background:"#fff", border:"1px solid #E5E3DC",
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor: isLocked ? "not-allowed" : "pointer",
              opacity: isLocked ? 0.4 : 1, transition:"opacity 0.15s",
            }}
          >
            <ChevronLeft size={20} color="#111" />
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={ctaDisabled}
          style={{
            flex:1, height:52, borderRadius:16, border:"none",
            background: ctaDisabled ? "#D9D6CC" : `linear-gradient(135deg,${TEAL},#2DD4BF)`,
            color:"#fff", fontWeight:800, fontSize:15, fontFamily:"inherit",
            cursor: ctaDisabled ? "not-allowed" : "pointer",
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            boxShadow: ctaDisabled ? "none" : `0 8px 20px ${TEAL}55`,
            transition:"background 0.2s, box-shadow 0.2s",
          }}
        >
          {ctaLabel()}
          {!ctaDisabled && step < 3 && !uploading && !generatingPlatforms && <ChevronRight size={18} />}
          {!ctaDisabled && step === 3 && !publishing && <Send size={16} />}
        </button>
      </div>

      {quotaModal.open && !quotaModal.isProCoins && (
        <ConversionModal
          isOpen={true}
          onClose={() => setQuotaModal(m => ({ ...m, open: false }))}
          onUpgrade={tier => { onUpgrade(tier); setQuotaModal(m => ({ ...m, open: false })); }}
          trigger={quotaModal.trigger}
          targetTiers={quotaModal.targetTiers}
          founderSpotsLeft={founderSpotsLeft}
          lang={lang}
        />
      )}
      {quotaModal.open && quotaModal.isProCoins && (
        <QuotaLimitModal
          onClose={() => setQuotaModal(m => ({ ...m, open: false }))}
          lang={lang}
        />
      )}

      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
