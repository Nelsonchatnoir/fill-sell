import { useState, useEffect, useRef } from "react";

const PLATFORM_LABELS = { vinted:"Vinted", leboncoin:"Leboncoin", beebs:"Beebs", ebay:"eBay", vestiaire:"Vestiaire" };
const PLATFORM_COLORS = { vinted:"#08A05C", leboncoin:"#F56B2A", beebs:"#FF3366", ebay:"#E53238", vestiaire:"#1B1B1B" };
const PLATFORMS_DEFAULT = ["vinted","leboncoin","beebs","ebay"];

const FIELD_LABELS = {
  taille:       { fr:"Taille",       en:"Size" },
  matiere:      { fr:"Matière",      en:"Material" },
  etat:         { fr:"État",         en:"Condition" },
  marque:       { fr:"Marque",       en:"Brand" },
  format_colis: { fr:"Format colis", en:"Package" },
  categorie:    { fr:"Catégorie",    en:"Category" },
  size:         { fr:"Taille",       en:"Size" },
  material:     { fr:"Matière",      en:"Material" },
  condition:    { fr:"État",         en:"Condition" },
  brand:        { fr:"Marque",       en:"Brand" },
};

function primaryColor(p) { return PLATFORM_COLORS[p] ?? "#6366F1"; }

// Props:
//   inventaireId  – required
//   userId        – required
//   initialPhotos – optional string[] of already-uploaded URLs; skips upload step
//   supabase      – required
//   lang          – "fr" | "en"
//   onClose       – required
export default function ListingPreviewScreen({ inventaireId, userId, initialPhotos = [], supabase, lang, onClose }) {
  // "checking" | "upload" | "style-pick" | "generating" | "review" | "publishing" | "done"
  const [step, setStep] = useState("checking");
  const [error, setError] = useState("");

  // photos ready to send to generate-listing
  const [photos, setPhotos] = useState(initialPhotos);
  // photos picked in the upload UI (File objects)
  const [pickedFiles, setPickedFiles] = useState([]);
  const [pickedPreviews, setPickedPreviews] = useState([]);
  const [uploading, setUploading] = useState(false);

  const [photoOption, setPhotoOption] = useState("ia_multi");
  const [timedOut, setTimedOut] = useState(false);

  // generate-listing response
  const [processedPhotos, setProcessedPhotos] = useState([]);
  const [price, setPrice] = useState(null);

  // per-platform editable fields, keyed by platform name
  const [edited, setEdited] = useState({});
  const [selected, setSelected] = useState(new Set(PLATFORMS_DEFAULT));
  const [activePlatform, setActivePlatform] = useState(PLATFORMS_DEFAULT[0]);

  const fileRef = useRef();

  // ── Step "checking" ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialPhotos.length > 0) {
      setPhotos(initialPhotos);
      setStep("style-pick");
      return;
    }
    // Query cross_post_jobs for any existing photos for this inventaire_id
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
            setStep("style-pick");
            return;
          }
        }
        setStep("upload");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Upload helpers ───────────────────────────────────────────────────────────
  function onFilePick(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPickedFiles(prev => [...prev, ...files]);
    files.forEach(f => {
      const url = URL.createObjectURL(f);
      setPickedPreviews(prev => [...prev, url]);
    });
    e.target.value = "";
  }

  function removePicked(idx) {
    setPickedFiles(prev => prev.filter((_, i) => i !== idx));
    setPickedPreviews(prev => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function handleUploadContinue() {
    if (!pickedFiles.length) return;
    setUploading(true);
    setError("");
    try {
      const urls = [];
      const ts = Date.now();
      for (let i = 0; i < pickedFiles.length; i++) {
        const f = pickedFiles[i];
        const ext = f.type?.includes("png") ? "png" : "jpg";
        const path = `${userId}/raw/${ts}_${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("listing-photos")
          .upload(path, f, { contentType: f.type || "image/jpeg", upsert: true });
        if (!upErr) {
          urls.push(supabase.storage.from("listing-photos").getPublicUrl(path).data.publicUrl);
        }
      }
      if (!urls.length) throw new Error(lang === "en" ? "Upload failed" : "Échec de l'upload");
      setPhotos(urls);
      setStep("style-pick");
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  // ── Generate listing ─────────────────────────────────────────────────────────
  async function handleGenerate(photoOptionOverride) {
    const optionToUse = photoOptionOverride ?? photoOption;
    if (photoOptionOverride) setPhotoOption(photoOptionOverride);
    setStep("generating");
    setError("");
    setTimedOut(false);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("generate-listing", {
        body: {
          inventaire_id: inventaireId,
          photos,
          platforms: PLATFORMS_DEFAULT,
          photo_option: optionToUse,
        },
      });
      if (fnErr) throw new Error(fnErr.message || "Erreur de génération");
      if (!data?.platforms) throw new Error(lang === "en" ? "No listings returned" : "Aucune annonce retournée");

      setProcessedPhotos(data.photos ?? []);
      setPrice(data.price ?? null);

      const initialEdited = {};
      for (const p of PLATFORMS_DEFAULT) {
        initialEdited[p] = {
          title: data.platforms[p]?.title ?? "",
          description: data.platforms[p]?.description ?? "",
          platform_fields: data.platforms[p]?.platform_fields ?? {},
        };
      }
      setEdited(initialEdited);
      setStep("review");
    } catch (e) {
      const isTimeout = optionToUse === "ia_multi" &&
        /abort|timeout|failed to fetch|non-2xx/i.test(e.message ?? "");
      if (isTimeout) {
        setError(lang === "en"
          ? "Generation timed out (6 AI photos takes time). Choose a faster option below."
          : "Génération expirée (6 photos IA prend du temps). Choisis une option plus rapide.");
        setTimedOut(true);
      } else {
        setError(e.message);
      }
      setStep("style-pick");
    }
  }

  // ── Publish ──────────────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!selected.size) return;
    setStep("publishing");
    setError("");
    try {
      const rows = [...selected].map(platform => ({
        user_id: userId,
        inventaire_id: inventaireId,
        platform,
        status: "pending",
        photo_option: photoOption,
        title: edited[platform]?.title ?? "",
        description: edited[platform]?.description ?? "",
        price: price,
        photos: processedPhotos,
        platform_fields: edited[platform]?.platform_fields ?? {},
      }));
      const { error: insErr } = await supabase.from("cross_post_jobs").insert(rows);
      if (insErr) throw new Error(insErr.message);

      // Persister les photos traitées sur l'article inventaire
      if (processedPhotos?.length) {
        await supabase
          .from("inventaire")
          .update({ photos: processedPhotos })
          .eq("id", inventaireId);
      }

      setStep("done");
    } catch (e) {
      setError(e.message);
      setStep("review");
    }
  }

  function setField(platform, field, value) {
    setEdited(prev => ({ ...prev, [platform]: { ...prev[platform], [field]: value } }));
  }

  function setPlatformField(platform, key, value) {
    setEdited(prev => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        platform_fields: { ...(prev[platform]?.platform_fields ?? {}), [key]: value },
      },
    }));
  }

  function displayUrl(photo) {
    return photo.url || photo.enhanced || photo.bg_removed || photo.original || photo;
  }

  // ── Renders ──────────────────────────────────────────────────────────────────

  if (step === "checking") return (
    <div style={S.overlay}>
      <div style={S.center}>
        <div style={S.spinner} />
      </div>
    </div>
  );

  if (step === "done") return (
    <div style={S.overlay}>
      <style>{`@keyframes popIn{0%{transform:scale(0.4);opacity:0}80%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
      <div style={S.center}>
        <div style={{ fontSize:72, animation:"popIn 0.5s ease forwards" }}>✅</div>
        <div style={{ fontSize:22, fontWeight:800, color:"#111827", textAlign:"center", marginTop:16 }}>
          {lang === "en" ? "Listings sent!" : "Annonces envoyées !"}
        </div>
        <div style={{ fontSize:14, color:"#6B7280", textAlign:"center", lineHeight:1.6, marginTop:8, maxWidth:280 }}>
          {lang === "en"
            ? "Your Chrome extension will publish them automatically when you open it."
            : "L'extension Chrome va les publier automatiquement dès que tu l'ouvres."}
        </div>
        <button onClick={onClose} style={{ ...S.primaryBtn("#6366F1"), marginTop:28 }}>
          {lang === "en" ? "Done" : "Terminer"}
        </button>
      </div>
    </div>
  );

  if (step === "upload") return (
    <div style={S.overlay}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={S.header}>
        <div style={{ fontSize:17, fontWeight:800, color:"#111827" }}>
          {lang === "en" ? "Add photos" : "Ajouter des photos"}
        </div>
        <button onClick={onClose} style={S.closeBtn}>×</button>
      </div>
      <div style={{ overflowY:"auto", flex:1, padding:"20px" }}>
        {error && <div style={S.errorBox}>{error}</div>}
        {/* Photo grid */}
        {pickedPreviews.length > 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
            {pickedPreviews.map((url, i) => (
              <div key={i} style={{ position:"relative", aspectRatio:"1", borderRadius:10, overflow:"hidden", background:"#F3F4F6" }}>
                <img src={url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                <button onClick={() => removePicked(i)} style={{
                  position:"absolute", top:4, right:4, width:20, height:20, borderRadius:"50%",
                  background:"rgba(0,0,0,0.55)", border:"none", color:"#fff", fontSize:12,
                  cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                  padding:0, lineHeight:1,
                }}>×</button>
              </div>
            ))}
            {/* Add more */}
            <button onClick={() => fileRef.current?.click()} style={{
              aspectRatio:"1", borderRadius:10, border:"2px dashed #E5E7EB",
              background:"#F9FAFB", cursor:"pointer", display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:24, color:"#D1D5DB",
            }}>+</button>
          </div>
        )}
        {/* Empty state */}
        {pickedPreviews.length === 0 && (
          <button onClick={() => fileRef.current?.click()} style={{
            width:"100%", aspectRatio:"4/3", borderRadius:16, border:"2px dashed #E5E7EB",
            background:"#F9FAFB", cursor:"pointer", display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center", gap:12,
          }}>
            <div style={{ fontSize:40 }}>📷</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#6B7280" }}>
              {lang === "en" ? "Tap to add photos" : "Appuie pour ajouter des photos"}
            </div>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          style={{ display:"none" }}
          onChange={onFilePick}
        />
      </div>
      <div style={S.footer}>
        <button
          onClick={handleUploadContinue}
          disabled={uploading || pickedFiles.length === 0}
          style={{ ...S.primaryBtn("#6366F1"), opacity: uploading || pickedFiles.length === 0 ? 0.5 : 1 }}
        >
          {uploading ? (
            <span style={S.spinRow}>
              <span style={S.spinIcon} />
              {lang === "en" ? "Uploading..." : "Upload en cours..."}
            </span>
          ) : (lang === "en" ? "Continue" : "Continuer")}
        </button>
      </div>
    </div>
  );

  if (step === "style-pick") return (
    <div style={S.overlay}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={S.header}>
        <div style={{ fontSize:17, fontWeight:800, color:"#111827" }}>
          {lang === "en" ? "Photo style" : "Style photos"}
        </div>
        <button onClick={onClose} style={S.closeBtn}>×</button>
      </div>
      <div style={{ overflowY:"auto", flex:1, padding:"20px" }}>
        {error && <div style={S.errorBox}>{error}</div>}
        {timedOut && (
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            <button
              onClick={() => handleGenerate("ia_simple")}
              style={{ flex:1, padding:"10px 8px", borderRadius:12, border:"2px solid #6366F1",
                background:"#EEF2FF", color:"#4F46E5", fontWeight:700, fontSize:13,
                cursor:"pointer", fontFamily:"inherit" }}
            >
              {lang === "en" ? "🎨 Retry — 1 angle" : "🎨 Réessayer IA 1 angle"}
            </button>
            <button
              onClick={() => handleGenerate("original")}
              style={{ flex:1, padding:"10px 8px", borderRadius:12, border:"2px solid #D1D5DB",
                background:"#F9FAFB", color:"#374151", fontWeight:700, fontSize:13,
                cursor:"pointer", fontFamily:"inherit" }}
            >
              {lang === "en" ? "📸 Use originals" : "📸 Photos originales"}
            </button>
          </div>
        )}
        <div style={{ fontSize:13, color:"#6B7280", marginBottom:20, lineHeight:1.5 }}>
          {lang === "en"
            ? "Choose how your photos will be processed before generating listings."
            : "Choisis comment tes photos seront retouchées avant de générer les annonces."}
        </div>
        {[
          {
            value:"ia_multi",
            emoji:"✨",
            label: lang === "en" ? "AI — 6 angles" : "IA — 6 angles",
            desc: lang === "en" ? "Best quality. 6 shots generated by AI (front, close-up, logo, fabric, label, back)." : "Meilleure qualité. 6 visuels générés par IA (face, gros plan, logo, matière, étiquette, dos).",
          },
          {
            value:"ia_simple",
            emoji:"🎨",
            label: lang === "en" ? "AI — 1 angle" : "IA — 1 angle",
            desc: lang === "en" ? "Faster. One clean photo generated by AI from your original." : "Plus rapide. Un visuel propre généré par IA depuis ta photo originale.",
          },
          {
            value:"original",
            emoji:"📸",
            label: lang === "en" ? "Keep originals" : "Photos originales",
            desc: lang === "en" ? "No AI processing. Your photos are used as-is." : "Pas de retouche IA. Tes photos sont utilisées telles quelles.",
          },
        ].map(opt => {
          const active = photoOption === opt.value;
          return (
            <button key={opt.value} onClick={() => setPhotoOption(opt.value)} style={{
              width:"100%", padding:"14px 16px", borderRadius:14,
              border: `2px solid ${active ? "#6366F1" : "#E5E7EB"}`,
              background: active ? "#EEF2FF" : "#fff",
              cursor:"pointer", textAlign:"left", marginBottom:10,
              fontFamily:"inherit",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:22 }}>{opt.emoji}</span>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color: active ? "#4F46E5" : "#111827" }}>{opt.label}</div>
                  <div style={{ fontSize:12, color:"#6B7280", marginTop:2, lineHeight:1.45 }}>{opt.desc}</div>
                </div>
                <div style={{ marginLeft:"auto", width:18, height:18, borderRadius:"50%", border:`2px solid ${active ? "#6366F1" : "#D1D5DB"}`, background: active ? "#6366F1" : "#fff", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {active && <div style={{ width:7, height:7, borderRadius:"50%", background:"#fff" }} />}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div style={S.footer}>
        <button onClick={handleGenerate} style={S.primaryBtn("#6366F1")}>
          {lang === "en" ? "Generate listings →" : "Générer les annonces →"}
        </button>
      </div>
    </div>
  );

  if (step === "generating") return (
    <div style={S.overlay}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={S.center}>
        <div style={S.spinner} />
        <div style={{ color:"#111827", fontWeight:800, fontSize:18, marginTop:20, textAlign:"center" }}>
          {lang === "en" ? "Generating your listings..." : "Génération de tes annonces..."}
        </div>
        <div style={{ color:"#6B7280", fontSize:13, marginTop:8, textAlign:"center", lineHeight:1.6 }}>
          {photoOption === "ia_multi"
            ? (lang === "en" ? "AI photo · 6 angles · listing text\n~30-45 sec" : "Photo IA · 6 angles · texte annonce\n~30-45 sec")
            : photoOption === "ia_simple"
            ? (lang === "en" ? "AI photo · listing text\n~15-25 sec" : "Photo IA · texte annonce\n~15-25 sec")
            : (lang === "en" ? "Generating listing text\n~10 sec" : "Génération du texte\n~10 sec")}
        </div>
      </div>
    </div>
  );

  if (step === "publishing") return (
    <div style={S.overlay}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={S.center}>
        <div style={S.spinner} />
        <div style={{ color:"#111827", fontWeight:800, fontSize:16, marginTop:20 }}>
          {lang === "en" ? "Saving listings..." : "Enregistrement..."}
        </div>
      </div>
    </div>
  );

  // ── Review step ──────────────────────────────────────────────────────────────
  return (
    <div style={S.overlay}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={S.header}>
        <div style={{ fontSize:17, fontWeight:800, color:"#111827" }}>
          {lang === "en" ? "Ready to publish" : "Prêt à publier"}
        </div>
        <button onClick={onClose} style={S.closeBtn}>×</button>
      </div>

      <div style={{ overflowY:"auto", flex:1 }}>
        {error && <div style={{ padding:"0 20px", marginTop:12 }}><div style={S.errorBox}>{error}</div></div>}

        {/* Photo carousel */}
        {processedPhotos.length > 0 && (
          <div style={{ position:"relative" }}>
            <div style={{ display:"flex", overflowX:"auto", scrollSnapType:"x mandatory", WebkitOverflowScrolling:"touch" }}>
              {processedPhotos.map((p, i) => (
                <div key={i} style={{ flexShrink:0, width:"100%", aspectRatio:"1", scrollSnapAlign:"start", background:"#F3F4F6", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <img src={displayUrl(p)} alt="" style={{ width:"100%", height:"100%", objectFit:"contain" }} />
                </div>
              ))}
            </div>
            {processedPhotos.length > 1 && (
              <div style={{ position:"absolute", bottom:8, left:0, right:0, display:"flex", justifyContent:"center", gap:5 }}>
                {processedPhotos.map((_, i) => (
                  <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:"rgba(0,0,0,0.3)" }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Platform checkboxes */}
        <div style={{ padding:"16px 20px 8px" }}>
          <div style={S.sectionLabel}>{lang === "en" ? "Publish on" : "Publier sur"}</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:8 }}>
            {PLATFORMS_DEFAULT.map(p => {
              const on = selected.has(p);
              const color = primaryColor(p);
              return (
                <button key={p} onClick={() => setSelected(prev => { const s = new Set(prev); s.has(p) ? s.delete(p) : s.add(p); return s; })} style={{
                  display:"flex", alignItems:"center", gap:7,
                  padding:"7px 13px", borderRadius:20, cursor:"pointer", fontFamily:"inherit",
                  fontSize:13, fontWeight:700,
                  border:`2px solid ${on ? color : "#E5E7EB"}`,
                  background: on ? `${color}15` : "#fff",
                  color: on ? color : "#9CA3AF",
                }}>
                  <span style={{
                    width:14, height:14, borderRadius:3, flexShrink:0,
                    border:`2px solid ${on ? color : "#D1D5DB"}`,
                    background: on ? color : "#fff",
                    display:"inline-flex", alignItems:"center", justifyContent:"center",
                  }}>
                    {on && <span style={{ width:6, height:6, borderRadius:1, background:"#fff" }} />}
                  </span>
                  {PLATFORM_LABELS[p] ?? p}
                </button>
              );
            })}
          </div>
        </div>

        {/* Platform tabs */}
        <div style={{ display:"flex", overflowX:"auto", padding:"0 20px", gap:4, borderBottom:"1px solid #F3F4F6" }}>
          {PLATFORMS_DEFAULT.map(p => {
            const active = activePlatform === p;
            const color = primaryColor(p);
            return (
              <button key={p} onClick={() => setActivePlatform(p)} style={{
                flexShrink:0, padding:"10px 14px", background:"none", cursor:"pointer", fontFamily:"inherit",
                border:"none", borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
                color: active ? color : "#9CA3AF",
                fontWeight:700, fontSize:13, marginBottom:-1,
              }}>
                {PLATFORM_LABELS[p] ?? p}
              </button>
            );
          })}
        </div>

        {/* Editable fields */}
        <div style={{ padding:"16px 20px" }}>
          <div style={{ marginBottom:14 }}>
            <label style={S.fieldLabel}>{lang === "en" ? "Title" : "Titre"}</label>
            <input
              value={edited[activePlatform]?.title ?? ""}
              onChange={e => setField(activePlatform, "title", e.target.value)}
              style={S.input}
            />
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={S.fieldLabel}>{lang === "en" ? "Description" : "Description"}</label>
            <textarea
              value={edited[activePlatform]?.description ?? ""}
              onChange={e => setField(activePlatform, "description", e.target.value)}
              rows={6}
              style={{ ...S.input, resize:"vertical", lineHeight:1.55 }}
            />
          </div>
          {price != null && (
            <div style={{ marginBottom:14 }}>
              <label style={S.fieldLabel}>{lang === "en" ? "Price (€)" : "Prix (€)"}</label>
              <input
                type="number"
                value={price}
                onChange={e => setPrice(Number(e.target.value))}
                style={{ ...S.input, width:120 }}
              />
            </div>
          )}
          {/* Platform-specific fields inferred by AI */}
          {Object.entries(edited[activePlatform]?.platform_fields ?? {})
            .filter(([, v]) => v !== null && v !== "null" && v !== "")
            .map(([key, val]) => {
              const lbl = FIELD_LABELS[key]?.[lang] ?? key;
              return (
                <div key={key} style={{ marginBottom:10 }}>
                  <label style={S.fieldLabel}>{lbl}</label>
                  <input
                    value={val ?? ""}
                    onChange={e => setPlatformField(activePlatform, key, e.target.value)}
                    style={S.input}
                  />
                </div>
              );
            })}
        </div>
      </div>

      {/* Publish button */}
      <div style={S.footer}>
        <button
          onClick={handlePublish}
          disabled={selected.size === 0}
          style={{ ...S.primaryBtn("#6366F1"), opacity: selected.size === 0 ? 0.5 : 1 }}
        >
          {`${lang === "en" ? "Publish on" : "Publier sur"} ${selected.size} plateforme${selected.size > 1 ? "s" : ""} →`}
        </button>
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position:"fixed", inset:0, zIndex:9999, background:"#fff",
    display:"flex", flexDirection:"column",
  },
  center: {
    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
    flex:1, padding:"0 32px",
  },
  spinner: {
    width:44, height:44,
    border:"4px solid rgba(0,0,0,0.1)", borderTopColor:"#6366F1",
    borderRadius:"50%", animation:"spin 0.8s linear infinite",
  },
  spinIcon: {
    width:18, height:18,
    border:"3px solid rgba(255,255,255,0.4)", borderTopColor:"#fff",
    borderRadius:"50%", display:"inline-block", animation:"spin 0.8s linear infinite",
  },
  spinRow: { display:"flex", alignItems:"center", justifyContent:"center", gap:10 },
  header: {
    display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"16px 20px 12px", borderBottom:"1px solid #F3F4F6", flexShrink:0,
  },
  closeBtn: {
    background:"none", border:"none", fontSize:24, color:"#9CA3AF",
    cursor:"pointer", padding:"0 4px", lineHeight:1, fontFamily:"inherit",
  },
  sectionLabel: {
    fontSize:11, fontWeight:700, color:"#6B7280",
    textTransform:"uppercase", letterSpacing:"0.06em",
  },
  fieldLabel: {
    display:"block", fontSize:11, fontWeight:700, color:"#6B7280",
    textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:7,
  },
  input: {
    width:"100%", padding:"10px 13px", border:"1.5px solid #E5E7EB",
    borderRadius:10, fontSize:14, fontFamily:"inherit", color:"#111827",
    outline:"none", boxSizing:"border-box", background:"#fff",
  },
  footer: {
    padding:"12px 20px 20px", borderTop:"1px solid #F3F4F6",
    background:"#fff", flexShrink:0,
  },
  primaryBtn: (color) => ({
    width:"100%", padding:15, background:color, color:"#fff",
    border:"none", borderRadius:13, fontSize:15, fontWeight:800,
    cursor:"pointer", fontFamily:"inherit",
  }),
  errorBox: {
    padding:"10px 14px", background:"#FEF2F2", border:"1px solid #FECACA",
    borderRadius:10, fontSize:13, color:"#B91C1C",
  },
};
