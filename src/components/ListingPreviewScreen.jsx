import { useState, useEffect, useRef, Fragment } from "react";
import { Camera, Wand2, Send, Check, ChevronLeft, ChevronRight, Mic, TrendingUp, Images, Zap } from "lucide-react";
import ConversionModal from "./ConversionModal";

const TEAL  = "#3EACA0";
const PEACH = "#E8956D";
const BG    = "#F2F2EE";

const PLATFORM_LABELS   = { vinted:"Vinted", leboncoin:"Leboncoin", beebs:"Beebs", ebay:"eBay" };
const PLATFORMS_DEFAULT = ["vinted","leboncoin","beebs","ebay"];

const STEPS = [
  { id:0, label:"Upload",     Icon:Camera     },
  { id:1, label:"Deal",       Icon:TrendingUp },
  { id:2, label:"Photos",     Icon:Images     },
  { id:3, label:"Style",      Icon:Wand2      },
  { id:4, label:"Génération", Icon:Zap        },
  { id:5, label:"Publier",    Icon:Send       },
];

// ── QuotaLimitModal ───────────────────────────────────────────────────────────

function QuotaLimitModal({ onClose, lang }) {
  const isFr = lang !== "en";
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
          {isFr ? "Limite Pro atteinte" : "Pro limit reached"}
        </div>
        <p style={{ fontSize:13.5, color:"#6B6862", lineHeight:1.6, margin:"0 0 20px" }}>
          {isFr
            ? "Tu as atteint ta limite Pro. Des crédits supplémentaires arrivent bientôt."
            : "You've reached your Pro limit. Additional credits are coming soon."}
        </p>
        <button
          onClick={onClose}
          style={{
            width:"100%", padding:"14px", borderRadius:14, border:"none",
            background:"#111", color:"#fff", fontWeight:800, fontSize:15,
            cursor:"pointer", fontFamily:"inherit",
          }}
        >
          {isFr ? "Fermer" : "Close"}
        </button>
      </div>
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

function ScoreBar({ score }) {
  const color = score >= 6.5 ? "#16A34A" : score >= 4 ? "#D97706" : "#DC2626";
  const label = score >= 6.5 ? "Bon deal" : score >= 4 ? "Mitigé" : "À éviter";
  return (
    <>
      <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:6 }}>
        <span style={{ fontSize:30, fontWeight:900, color:TEAL, letterSpacing:"-0.02em" }}>
          {Number(score).toFixed(1)}
        </span>
        <span style={{ fontSize:13, color:"#9B9890" }}>/10</span>
        <span style={{ fontSize:12.5, fontWeight:800, color }}>{label}</span>
      </div>
      <div style={{ height:6, borderRadius:99, background:"#ECEAE3", overflow:"hidden" }}>
        <div style={{
          height:"100%", width:`${(score / 10) * 100}%`,
          background:`linear-gradient(90deg,${TEAL},#2DD4BF)`,
          transition:"width 0.8s cubic-bezier(0.22,1,0.36,1)",
        }} />
      </div>
    </>
  );
}

// ── Step 0 — Upload ───────────────────────────────────────────────────────────

function StepUpload({ previews, removable, onAdd, onRemove, notes, setNotes, micActive, toggleMic, error, lang }) {
  const fileRef = useRef();
  const count = previews.length;
  const MAX = 5;
  const isFr = lang !== "en";

  return (
    <div>
      <Eyebrow n="1" label={isFr ? "Photos de l'article" : "Item photos"} />
      <h2 style={{ margin:"4px 0 4px", fontSize:20, fontWeight:900, color:"#111" }}>
        {isFr ? "Montre ton article" : "Show your item"}
      </h2>
      <p style={{ margin:"0 0 16px", fontSize:13.5, color:"#6B6862", lineHeight:1.5 }}>
        {isFr
          ? "Jusqu'à 5 photos. Plus tu en ajoutes, plus l'estimation sera précise."
          : "Up to 5 photos. More photos = better price estimate."}
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
          + {isFr ? `Ajouter (${count}/${MAX})` : `Add more (${count}/${MAX})`}
        </button>
      )}

      <div style={{ background:"#fff", borderRadius:14, padding:14, border:"1px solid #ECEAE3" }}>
        <div style={{ fontSize:11, fontWeight:800, color:"#9B9890", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>
          {isFr ? "Précisions (optionnel)" : "Notes (optional)"}
        </div>
        <div style={{ position:"relative" }}>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={isFr ? "Taille M, bon état, avec boîte…" : "Size M, good condition, includes box…"}
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

// ── Step 1 — Deal ─────────────────────────────────────────────────────────────

function StepDeal({ listing, price, lang }) {
  const isFr = lang !== "en";

  if (!listing) {
    return (
      <div>
        <Eyebrow n="2" label="Deal" />
        <h2 style={{ margin:"4px 0 16px", fontSize:20, fontWeight:900, color:"#111" }}>
          {isFr ? "Résultat de l'analyse" : "Analysis result"}
        </h2>
        <div style={{
          background:"#fff", borderRadius:16, padding:32, border:"1px solid #ECEAE3",
          display:"flex", flexDirection:"column", alignItems:"center", gap:12,
        }}>
          <p style={{ margin:0, fontSize:13, color:"#9B9890", textAlign:"center" }}>
            {isFr ? "Aucune analyse disponible." : "No analysis available."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Eyebrow n="2" label="Deal" />
      <h2 style={{ margin:"4px 0 4px", fontSize:20, fontWeight:900, color:"#111" }}>
        {isFr ? "Résultat de ton scan" : "Your scan result"}
      </h2>
      <p style={{ margin:"0 0 16px", fontSize:13.5, color:"#6B6862", lineHeight:1.5 }}>
        {isFr
          ? "Résumé de l'analyse Lens. Appuie sur Continuer pour créer ton annonce."
          : "Lens analysis summary. Tap Continue to create your listing."}
      </p>

      <div style={{ background:"#fff", borderRadius:16, padding:18, border:"1px solid #ECEAE3" }}>
        {listing.titre && (
          <div style={{ fontWeight:900, fontSize:16, color:"#111", marginBottom:10 }}>
            {listing.titre}
          </div>
        )}

        {(listing.marque || listing.categorie || listing.etat_estime) && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
            {listing.marque && (
              <span style={{ fontSize:11.5, fontWeight:700, padding:"4px 10px", borderRadius:999, background:"#F0FDF9", color:"#065F46", border:"1px solid #D1FAE5" }}>
                {listing.marque}
              </span>
            )}
            {listing.categorie && (
              <span style={{ fontSize:11.5, fontWeight:700, padding:"4px 10px", borderRadius:999, background:"#F8FAFC", color:"#475569", border:"1px solid #E2E8F0" }}>
                {listing.categorie}
              </span>
            )}
            {listing.etat_estime && (
              <span style={{ fontSize:11.5, fontWeight:700, padding:"4px 10px", borderRadius:999, background:"#F5F3FF", color:"#7C3AED", border:"1px solid #DDD6FE" }}>
                {listing.etat_estime}
              </span>
            )}
          </div>
        )}

        {listing.score != null && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#9B9890", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>
              Deal score
            </div>
            <ScoreBar score={listing.score} />
          </div>
        )}

        {(listing.prix_vente_suggere != null || listing.fourchette_min != null || price != null) && (
          <div style={{ fontSize:13, color:"#374151" }}>
            {isFr ? "Prix conseillé :" : "Suggested price:"}{" "}
            <strong style={{ color:"#111" }}>
              {listing.prix_vente_suggere != null
                ? `${listing.prix_vente_suggere}€`
                : listing.fourchette_min != null && listing.fourchette_max != null
                  ? `${listing.fourchette_min}–${listing.fourchette_max}€`
                  : price != null ? `${price}€` : "—"}
            </strong>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 2 — Photos review + platform picker ──────────────────────────────────

function StepPhotosReview({ photos, onRemovePhoto, onAddPhotos, selected, setSelected, lang }) {
  const isFr = lang !== "en";
  const addRef = useRef();
  const MAX = 5;

  return (
    <div>
      <Eyebrow n="3" label={isFr ? "Photos & plateformes" : "Photos & platforms"} />
      <h2 style={{ margin:"4px 0 4px", fontSize:20, fontWeight:900, color:"#111" }}>
        {isFr ? "Revois tes photos" : "Review your photos"}
      </h2>
      <p style={{ margin:"0 0 16px", fontSize:13.5, color:"#6B6862", lineHeight:1.5 }}>
        {isFr
          ? "Vérifie tes photos, ajoute-en si besoin, puis choisis les plateformes."
          : "Review your photos, add more if needed, then choose platforms."}
      </p>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:10 }}>
        {photos.map((url, i) => (
          <div
            key={i}
            style={{ aspectRatio:"1", borderRadius:14, overflow:"hidden", border:`2px solid ${TEAL}`, position:"relative" }}
          >
            <img src={url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            <button
              onClick={() => onRemovePhoto(i)}
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

      {photos.length < MAX && (
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
            + {isFr ? `Ajouter une photo (${photos.length}/${MAX})` : `Add photo (${photos.length}/${MAX})`}
          </button>
        </>
      )}

      {photos.length >= MAX && <div style={{ marginBottom:20 }} />}

      <div style={{ fontSize:11, fontWeight:800, color:"#9B9890", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>
        {isFr ? "Plateformes" : "Platforms"}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {PLATFORMS_DEFAULT.map(p => {
          const on = selected.has(p);
          return (
            <button
              key={p}
              onClick={() => setSelected(prev => {
                const s = new Set(prev);
                s.has(p) ? s.delete(p) : s.add(p);
                return s;
              })}
              style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                background:"#fff", borderRadius:14, padding:"14px 16px",
                border: on ? `1.5px solid ${TEAL}` : "1px solid #ECEAE3",
                cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                transition:"border 0.15s",
              }}
            >
              <span style={{ fontWeight:800, fontSize:14, color: on ? "#111" : "#9B9890" }}>
                {PLATFORM_LABELS[p]}
              </span>
              <div style={{
                width:40, height:24, borderRadius:99,
                background: on ? TEAL : "#E5E3DC",
                display:"flex", alignItems:"center",
                padding:3, transition:"background 0.2s", flexShrink:0,
              }}>
                <div style={{
                  width:18, height:18, borderRadius:"50%", background:"#fff",
                  marginLeft: on ? "auto" : 0,
                  transition:"margin 0.2s",
                  boxShadow:"0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 3 — Style ────────────────────────────────────────────────────────────

function StepStyle({ photoOption, setPhotoOption, isPremium, isPro, onLockTap, lang }) {
  const isFr = lang !== "en";
  const options = [
    {
      id: "ia_multi",
      label: isFr ? "Retouche IA avancée" : "Advanced AI retouch",
      desc: isFr
        ? "Fond nettoyé, lumière corrigée, plusieurs angles valorisés"
        : "Background cleaned, lighting corrected, multiple angles enhanced",
      tag: isFr ? "Recommandé" : "Recommended",
      lockedFor: isPro ? null : "pro",
    },
    {
      id: "ia_simple",
      label: isFr ? "Retouche IA légère" : "Light AI retouch",
      desc: isFr
        ? "Amélioration rapide de la luminosité et netteté"
        : "Quick brightness and sharpness improvement",
      tag: null,
      lockedFor: (isPremium || isPro) ? null : "premium",
    },
    {
      id: "original",
      label: isFr ? "Photos originales" : "Original photos",
      desc: isFr ? "Aucune retouche, publication telle quelle" : "No retouch, published as-is",
      tag: null,
      lockedFor: null,
    },
  ];

  return (
    <div>
      <Eyebrow n="4" label={isFr ? "Style de retouche" : "Retouch style"} />
      <h2 style={{ margin:"4px 0 4px", fontSize:20, fontWeight:900, color:"#111" }}>
        {isFr ? "Choisis le rendu" : "Choose the render"}
      </h2>
      <p style={{ margin:"0 0 18px", fontSize:13.5, color:"#6B6862", lineHeight:1.5 }}>
        {isFr
          ? "L'IA améliore la qualité photo — elle n'invente pas de nouveaux angles."
          : "AI enhances photo quality — it doesn't invent new angles."}
      </p>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {options.map(o => {
          const active = photoOption === o.id;
          const locked = !!o.lockedFor;
          return (
            <button
              key={o.id}
              onClick={() => { if (locked) { onLockTap(o.id); return; } setPhotoOption(o.id); }}
              style={{
                textAlign:"left", background:"#fff", borderRadius:14, padding:14,
                border: active ? `2px solid ${TEAL}` : "1px solid #ECEAE3",
                cursor:"pointer", fontFamily:"inherit", position:"relative",
                opacity: locked ? 0.7 : 1,
              }}
            >
              {!locked && o.tag && (
                <span style={{
                  position:"absolute", top:-8, right:12,
                  fontSize:9.5, fontWeight:800, color:"#fff",
                  background:PEACH, padding:"3px 8px", borderRadius:999,
                }}>{o.tag}</span>
              )}
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
                  <div style={{ fontWeight:800, fontSize:14.5, color: locked ? "#9B9890" : "#111", display:"flex", alignItems:"center", gap:6 }}>
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
    </div>
  );
}

// ── Step 4 — Génération ───────────────────────────────────────────────────────

function StepGeneration({ generating, generateError, platformListings, processedPhotos, selected, onRetry, lang }) {
  const isFr = lang !== "en";

  if (generating || (!platformListings && !generateError)) {
    return (
      <div>
        <Eyebrow n="5" label={isFr ? "Génération" : "Generation"} />
        <h2 style={{ margin:"4px 0 4px", fontSize:20, fontWeight:900, color:"#111" }}>
          {isFr ? "Génération des annonces…" : "Generating listings…"}
        </h2>
        <p style={{ margin:"0 0 18px", fontSize:13.5, color:"#6B6862", lineHeight:1.5 }}>
          {isFr ? "L'IA prépare le texte pour chaque plateforme." : "AI is preparing text for each platform."}
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
          <p style={{ margin:0, fontSize:13, color:"#9B9890", textAlign:"center", lineHeight:1.6 }}>
            {isFr ? "Vinted · Leboncoin · Beebs · eBay · ~10-20 sec" : "Vinted · Leboncoin · Beebs · eBay · ~10–20 sec"}
          </p>
        </div>
      </div>
    );
  }

  if (generateError && !platformListings) {
    return (
      <div>
        <Eyebrow n="5" label={isFr ? "Génération" : "Generation"} />
        <h2 style={{ margin:"4px 0 4px", fontSize:20, fontWeight:900, color:"#111" }}>
          {isFr ? "Erreur de génération" : "Generation error"}
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
          {isFr ? "Réessayer" : "Retry"}
        </button>
      </div>
    );
  }

  const platforms = [...selected].filter(p => platformListings?.platforms?.[p]);
  return (
    <div>
      <Eyebrow n="5" label={isFr ? "Génération" : "Generation"} />
      <h2 style={{ margin:"4px 0 4px", fontSize:20, fontWeight:900, color:"#111" }}>
        {isFr ? "Annonces générées ✅" : "Listings generated ✅"}
      </h2>
      <p style={{ margin:"0 0 16px", fontSize:13.5, color:"#6B6862", lineHeight:1.5 }}>
        {isFr
          ? `${platforms.length} annonce${platforms.length > 1 ? "s" : ""} prête${platforms.length > 1 ? "s" : ""} à publier.`
          : `${platforms.length} listing${platforms.length > 1 ? "s" : ""} ready to publish.`}
      </p>

      {processedPhotos?.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:800, color:"#9B9890", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>
            {isFr ? "Photos retouchées" : "Enhanced photos"}
          </div>
          <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
            {processedPhotos.map((ph, i) => (
              <div key={i} style={{ flexShrink:0, width:72, height:72, borderRadius:10, overflow:"hidden", border:`2px solid ${TEAL}` }}>
                <img src={ph.url ?? ph} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background:"#fff", borderRadius:14, padding:16, border:"1px solid #ECEAE3", display:"flex", flexDirection:"column", gap:10 }}>
        {platforms.map(p => (
          <div key={p} style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Check size={16} color="#16A34A" strokeWidth={3} />
            <span style={{ fontSize:14, fontWeight:700, color:"#111", flexShrink:0 }}>{PLATFORM_LABELS[p]}</span>
            {platformListings?.platforms?.[p]?.title && (
              <span style={{ fontSize:12, color:"#9B9890", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                — {platformListings.platforms[p].title}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 5 — Publier ──────────────────────────────────────────────────────────

function StepPublish({ selected, setSelected, publishError, lang }) {
  const isFr = lang !== "en";
  const selectedArr = [...selected];

  return (
    <div>
      <Eyebrow n="6" label={isFr ? "Publication" : "Publication"} />
      <h2 style={{ margin:"4px 0 4px", fontSize:20, fontWeight:900, color:"#111" }}>
        {isFr ? "Confirme la publication" : "Confirm publication"}
      </h2>
      <p style={{ margin:"0 0 18px", fontSize:13.5, color:"#6B6862", lineHeight:1.5 }}>
        {isFr
          ? "Appuie sur × pour retirer une plateforme avant de publier."
          : "Tap × to remove a platform before publishing."}
      </p>

      {publishError && (
        <div style={{ padding:"10px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10, fontSize:13, color:"#B91C1C", marginBottom:12 }}>
          {publishError}
        </div>
      )}

      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
        {selectedArr.map(p => (
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
      {selectedArr.length === 0 && (
        <p style={{ fontSize:13, color:"#9B9890", textAlign:"center", marginTop:16 }}>
          {isFr ? "Aucune plateforme sélectionnée." : "No platform selected."}
        </p>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ListingPreviewScreen({
  inventaireId, userId, initialPhotos = [], initialListing = null, supabase, lang, onClose,
  isPremium = false, isPro = false, founderSpotsLeft = 7, onUpgrade = () => {},
}) {
  const [step, setStep]         = useState(0);
  const [initializing, setInit] = useState(true);

  // Step 0
  const [pickedFiles, setPickedFiles]       = useState([]);
  const [pickedPreviews, setPickedPreviews] = useState([]);
  const [notes, setNotes]                   = useState("");
  const [micActive, setMicActive]           = useState(false);
  const [uploading, setUploading]           = useState(false);
  const [uploadError, setUploadError]       = useState("");
  const recognitionRef                      = useRef(null);

  // Ready URLs
  const [photos, setPhotos] = useState(initialPhotos);

  // Step 1 — pre-computed result from Lens
  const [listing, setListing] = useState(initialListing ?? null);
  const [price, setPrice]     = useState(null);

  // Step 3 — default based on tier
  const [photoOption, setPhotoOption] = useState(() =>
    isPro ? "ia_multi" : isPremium ? "ia_simple" : "original"
  );

  // Step 4 — generate-listing (per-platform content)
  const [generatingPlatforms, setGeneratingPlatforms] = useState(false);
  const [platformError, setPlatformError]             = useState("");
  const [platformListings, setPlatformListings]       = useState(null);
  const [processedPhotos, setProcessedPhotos]         = useState([]);
  const [edited, setEdited]                           = useState({});

  // Step 2 & 5 — platform selection
  const [selected, setSelected] = useState(new Set(PLATFORMS_DEFAULT));

  // Step 5 — publish
  const [publishing, setPublishing]     = useState(false);
  const [publishError, setPublishError] = useState("");
  const [done, setDone]                 = useState(false);

  // Quota / tier modal
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

  // ── Trigger platform generation on step 4 arrival ─────────────────────────
  useEffect(() => {
    if (step === 4 && !platformListings && !generatingPlatforms && !platformError) {
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

  // ── File helpers ──────────────────────────────────────────────────────────
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

  // ── Upload ────────────────────────────────────────────────────────────────
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
      if (!urls.length) throw new Error(lang === "en" ? "Upload failed" : "Échec de l'upload");
      setPhotos(urls);
      setStep(1);
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  // ── Add more photos (Step 2) ──────────────────────────────────────────────
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

  // ── Generate platform listings ────────────────────────────────────────────
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
      if (fnErr) throw new Error(fnErr.message || (lang === "en" ? "Generation error" : "Erreur de génération"));
      if (!data?.platforms) throw new Error(lang === "en" ? "No listings returned" : "Aucune annonce retournée");

      setProcessedPhotos(data.photos ?? []);
      setPrice(prev => data.price ?? prev);

      const initialEdited = {};
      for (const p of platforms) {
        initialEdited[p] = {
          title: data.platforms[p]?.title ?? "",
          description: data.platforms[p]?.description ?? "",
          platform_fields: data.platforms[p]?.platform_fields ?? {},
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

  // ── Publish ───────────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!selected.size) return;
    setPublishing(true);
    setPublishError("");
    try {
      const { data: quotaData, error: quotaErr } = await supabase.rpc("check_and_log_publish", {
        p_user_id: userId,
        p_is_premium: isPremium,
        p_is_pro: isPro,
      });
      if (quotaErr) throw new Error(quotaErr.message);
      if (quotaData?.allowed === false) {
        setPublishing(false);
        if (quotaData.reason === "tier_free") {
          setQuotaModal({ open: true, trigger: "publish", targetTiers: ["premium", "pro"], isProCoins: false });
        } else {
          setQuotaModal({ open: true, trigger: "publish", targetTiers: ["pro"], isProCoins: false });
        }
        return;
      }

      const rows = [...selected].map(platform => ({
        user_id: userId,
        inventaire_id: inventaireId,
        platform,
        status: "pending",
        photo_option: photoOption,
        title: edited[platform]?.title ?? "",
        description: edited[platform]?.description ?? "",
        price,
        photos: processedPhotos,
        platform_fields: edited[platform]?.platform_fields ?? {},
      }));
      const { error: insErr } = await supabase.from("cross_post_jobs").insert(rows);
      if (insErr) throw new Error(insErr.message);
      if (processedPhotos?.length) {
        await supabase.from("inventaire").update({ photos: processedPhotos }).eq("id", inventaireId);
      }
      setDone(true);
    } catch (e) {
      setPublishError(e.message);
      setPublishing(false);
    }
  }

  // ── Style lock tap ────────────────────────────────────────────────────────
  function handleStyleLockTap(optionId) {
    if (optionId === "ia_multi") {
      setQuotaModal({
        open: true, trigger: "style",
        targetTiers: isPremium ? ["pro"] : ["premium", "pro"],
        isProCoins: false,
      });
    } else if (optionId === "ia_simple") {
      setQuotaModal({ open: true, trigger: "style", targetTiers: ["premium", "pro"], isProCoins: false });
    }
  }

  // ── Nav helpers ───────────────────────────────────────────────────────────
  const displayPreviews = pickedPreviews.length > 0 ? pickedPreviews : photos;
  const photoCount      = displayPreviews.length;
  const isLocked        = uploading || publishing || generatingPlatforms;
  const canGoBack       = step > 0 && !(step === 1 && pickedFiles.length === 0 && photos.length > 0);

  function ctaLabel() {
    if (step === 0) {
      if (uploading)        return lang === "en" ? "Uploading…" : "Upload en cours…";
      if (photoCount === 0) return lang === "en" ? "Add at least 1 photo" : "Ajoute au moins 1 photo";
      return `${lang === "en" ? "Continue" : "Continuer"} · ${photoCount} photo${photoCount > 1 ? "s" : ""}`;
    }
    if (step === 1) return lang === "en" ? "Create listing" : "Créer l'annonce";
    if (step === 2) {
      const n = selected.size;
      if (!n) return lang === "en" ? "Select at least 1 platform" : "Sélectionne 1 plateforme";
      return `${lang === "en" ? "Continue" : "Continuer"} · ${n} plateforme${n > 1 ? "s" : ""}`;
    }
    if (step === 3) return lang === "en" ? "Generate listings" : "Générer les annonces";
    if (step === 4) {
      if (generatingPlatforms) return lang === "en" ? "Generating…" : "Génération…";
      if (platformListings)    return lang === "en" ? "Continue to publish" : "Continuer vers la publication";
      return lang === "en" ? "Generating…" : "Génération…";
    }
    if (step === 5) {
      if (publishing) return lang === "en" ? "Publishing…" : "Publication en cours…";
      const n = selected.size;
      return `${lang === "en" ? "Publish on" : "Publier sur"} ${n} plateforme${n > 1 ? "s" : ""}`;
    }
    return "";
  }

  const ctaDisabled =
    (step === 0 && (photoCount === 0 || uploading)) ||
    (step === 2 && selected.size === 0) ||
    (step === 4 && (generatingPlatforms || !platformListings)) ||
    (step === 5 && (selected.size === 0 || publishing));

  function handleNext() {
    if (step === 0) { handleUpload(); return; }
    if (step === 1) { setStep(2); return; }
    if (step === 2) { if (selected.size) setStep(3); return; }
    if (step === 3) {
      if (!isPremium && !isPro) {
        setQuotaModal({ open: true, trigger: "publish", targetTiers: ["premium", "pro"], isProCoins: false });
        return;
      }
      setStep(4);
      return;
    }
    if (step === 4) { if (platformListings) setStep(5); return; }
    if (step === 5) { handlePublish(); }
  }

  // ── Render: initializing ──────────────────────────────────────────────────
  if (initializing) return (
    <div style={{ background:BG, display:"flex", alignItems:"center", justifyContent:"center", minHeight:200 }}>
      <style>{`@keyframes lps-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:36, height:36, borderRadius:"50%", border:`3px solid ${TEAL}33`, borderTopColor:TEAL, animation:"lps-spin 0.8s linear infinite" }} />
    </div>
  );

  // ── Render: done ──────────────────────────────────────────────────────────
  if (done) return (
    <div style={{ background:BG, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"60px 32px 32px", fontFamily:"'Nunito',system-ui,sans-serif", minHeight:"60vh" }}>
      <style>{`@keyframes lps-popIn{0%{transform:scale(0.4);opacity:0}80%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
      <div style={{ fontSize:72, animation:"lps-popIn 0.5s ease forwards" }}>✅</div>
      <div style={{ fontSize:22, fontWeight:900, color:"#111", textAlign:"center", marginTop:16 }}>
        {lang === "en" ? "Listings sent!" : "Annonces envoyées !"}
      </div>
      <div style={{ fontSize:14, color:"#6B6862", textAlign:"center", lineHeight:1.6, marginTop:8, maxWidth:280 }}>
        {lang === "en"
          ? "Your Chrome extension will publish them automatically when you open it."
          : "L'extension Chrome va les publier automatiquement dès que tu l'ouvres."}
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
        {lang === "en" ? "Done" : "Terminer"}
      </button>
    </div>
  );

  // ── Render: stepper shell ─────────────────────────────────────────────────
  return (
    <div style={{
      display:"flex", flexDirection:"column", width:"100%",
      background:BG, fontFamily:"'Nunito',system-ui,sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes lps-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Stepper progress bar */}
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

      {/* Annuler link — visible from Style (step 3) onwards */}
      {step >= 3 && (
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
            ← {lang === "en" ? "Cancel" : "Annuler"}
          </button>
        </div>
      )}

      {/* Content */}
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
          <StepDeal
            listing={listing}
            price={price}
            lang={lang}
          />
        )}
        {step === 2 && (
          <StepPhotosReview
            photos={photos}
            onAddPhotos={handleAddMorePhotos}
            onRemovePhoto={handleRemovePhoto}
            selected={selected}
            setSelected={setSelected}
            lang={lang}
          />
        )}
        {step === 3 && (
          <StepStyle
            photoOption={photoOption}
            setPhotoOption={setPhotoOption}
            isPremium={isPremium}
            isPro={isPro}
            onLockTap={handleStyleLockTap}
            lang={lang}
          />
        )}
        {step === 4 && (
          <StepGeneration
            generating={generatingPlatforms}
            generateError={platformError}
            platformListings={platformListings}
            processedPhotos={processedPhotos}
            selected={selected}
            onRetry={handleGeneratePlatforms}
            lang={lang}
          />
        )}
        {step === 5 && (
          <StepPublish
            selected={selected}
            setSelected={setSelected}
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
          {!ctaDisabled && step < 5 && !uploading && !generatingPlatforms && <ChevronRight size={18} />}
          {!ctaDisabled && step === 5 && !publishing && <Send size={16} />}
        </button>
      </div>

      {/* Quota / conversion modal */}
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
    </div>
  );
}
