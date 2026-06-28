import { useState } from "react";

const PLATFORM_LABELS = { vinted:"Vinted", leboncoin:"Leboncoin", beebs:"Beebs", ebay:"eBay", vestiaire:"Vestiaire" };
const PLATFORM_COLORS = { vinted:"#08A05C", leboncoin:"#F56B2A", beebs:"#FF3366", ebay:"#E53238", vestiaire:"#1B1B1B" };

function primaryColor(platform) { return PLATFORM_COLORS[platform] ?? "#6366F1"; }

export default function ListingPreviewScreen({ jobs, onClose, supabase, lang }) {
  const platforms = jobs.map(j => j.platform);
  const photoOption = jobs[0]?.photo_option ?? "standard";
  const allPhotos = jobs[0]?.photos ?? [];

  const [activePlatform, setActivePlatform] = useState(platforms[0] ?? "vinted");
  const [edited, setEdited] = useState(
    Object.fromEntries(jobs.map(j => [j.platform, { title: j.title ?? "", description: j.description ?? "" }]))
  );
  const [selected, setSelected] = useState(new Set(platforms));
  const [publishing, setPublishing] = useState(false);
  const [done, setDone] = useState(false);

  function displayUrl(photo) {
    return photoOption === "ia" ? (photo.enhanced || photo.bg_removed || photo.original) : (photo.bg_removed || photo.original);
  }

  function togglePlatform(p) {
    setSelected(prev => { const s = new Set(prev); s.has(p) ? s.delete(p) : s.add(p); return s; });
  }

  function setField(platform, field, value) {
    setEdited(prev => ({ ...prev, [platform]: { ...prev[platform], [field]: value } }));
  }

  async function handlePublish() {
    if (!selected.size || publishing) return;
    setPublishing(true);
    for (const job of jobs.filter(j => selected.has(j.platform))) {
      await supabase.from("cross_post_jobs").update({
        status: "publishing",
        title: edited[job.platform]?.title ?? job.title,
        description: edited[job.platform]?.description ?? job.description,
      }).eq("id", job.id);
    }
    setPublishing(false);
    setDone(true);
  }

  // ── Success screen ───────────────────────────────────────────────────────
  if (done) return (
    <div style={S.overlay}>
      <style>{`@keyframes popIn{0%{transform:scale(0.4);opacity:0}80%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:20, padding:"0 32px" }}>
        <div style={{ fontSize:72, animation:"popIn 0.5s ease forwards" }}>✅</div>
        <div style={{ fontSize:22, fontWeight:800, color:"#111827", textAlign:"center" }}>
          {lang==="en" ? "Listings sent!" : "Annonces envoyées !"}
        </div>
        <div style={{ fontSize:14, color:"#6B7280", textAlign:"center", lineHeight:1.6 }}>
          {lang==="en"
            ? "Your Chrome extension will publish them automatically when you open it."
            : "L'extension Chrome va les publier automatiquement dès que tu l'ouvres."}
        </div>
        <button onClick={onClose} style={S.primaryBtn("#6366F1")}>
          {lang==="en" ? "Done" : "Terminer"}
        </button>
      </div>
    </div>
  );

  const activeJob = jobs.find(j => j.platform === activePlatform);

  // ── Main screen ──────────────────────────────────────────────────────────
  return (
    <div style={S.overlay}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={S.header}>
        <div style={{ fontSize:17, fontWeight:800, color:"#111827" }}>
          {lang==="en" ? "Ready to publish" : "Prêt à publier"}
        </div>
        <button onClick={onClose} style={S.closeBtn}>×</button>
      </div>

      <div style={{ overflowY:"auto", flex:1 }}>

        {/* Photo carousel */}
        {allPhotos.length > 0 && (
          <div style={{ position:"relative" }}>
            <div style={{ display:"flex", overflowX:"auto", scrollSnapType:"x mandatory", WebkitOverflowScrolling:"touch" }}>
              {allPhotos.map((p, i) => (
                <div key={i} style={{ flexShrink:0, width:"100%", aspectRatio:"1", scrollSnapAlign:"start", background:"#F3F4F6", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <img src={displayUrl(p)} alt="" style={{ width:"100%", height:"100%", objectFit:"contain" }} />
                </div>
              ))}
            </div>
            {allPhotos.length > 1 && (
              <div style={{ position:"absolute", bottom:8, left:0, right:0, display:"flex", justifyContent:"center", gap:5 }}>
                {allPhotos.map((_, i) => (
                  <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:"rgba(0,0,0,0.3)" }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Platform checkboxes */}
        <div style={{ padding:"16px 20px 8px" }}>
          <div style={S.sectionLabel}>{lang==="en" ? "Publish on" : "Publier sur"}</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:8 }}>
            {platforms.map(p => {
              const on = selected.has(p);
              const color = primaryColor(p);
              return (
                <button key={p} onClick={() => togglePlatform(p)} style={{
                  display:"flex", alignItems:"center", gap:7,
                  padding:"7px 13px", borderRadius:20, cursor:"pointer", fontFamily:"inherit",
                  fontSize:13, fontWeight:700,
                  border: `2px solid ${on ? color : "#E5E7EB"}`,
                  background: on ? `${color}15` : "#fff",
                  color: on ? color : "#9CA3AF",
                }}>
                  <span style={{
                    width:14, height:14, borderRadius:3, flexShrink:0,
                    border: `2px solid ${on ? color : "#D1D5DB"}`,
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
          {platforms.map(p => {
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

        {/* Editable listing */}
        {activeJob && (
          <div style={{ padding:"16px 20px" }}>
            <div style={{ marginBottom:14 }}>
              <label style={S.fieldLabel}>{lang==="en" ? "Title" : "Titre"}</label>
              <input
                value={edited[activePlatform]?.title ?? ""}
                onChange={e => setField(activePlatform, "title", e.target.value)}
                style={S.input}
              />
            </div>
            <div>
              <label style={S.fieldLabel}>{lang==="en" ? "Description" : "Description"}</label>
              <textarea
                value={edited[activePlatform]?.description ?? ""}
                onChange={e => setField(activePlatform, "description", e.target.value)}
                rows={7}
                style={{ ...S.input, resize:"vertical", lineHeight:1.55 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Publish button */}
      <div style={S.footer}>
        <button
          onClick={handlePublish}
          disabled={publishing || selected.size === 0}
          style={{ ...S.primaryBtn("#6366F1"), opacity: publishing || selected.size === 0 ? 0.55 : 1 }}
        >
          {publishing ? (
            <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
              <span style={{ width:18, height:18, border:"3px solid rgba(255,255,255,0.4)", borderTopColor:"#fff", borderRadius:"50%", display:"inline-block", animation:"spin 0.8s linear infinite" }} />
              {lang==="en" ? "Sending..." : "Envoi en cours..."}
            </span>
          ) : (
            `${lang==="en" ? "Publish on" : "Publier sur"} ${selected.size} plateforme${selected.size > 1 ? "s" : ""} →`
          )}
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
};
