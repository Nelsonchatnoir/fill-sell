import { memo, useState, useEffect, useRef } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { useIsMobile } from '../hooks/useIsMobile';
import { track } from '../analytics/analytics';
import Field from '../components/Field';
import SwipeRow from '../components/SwipeRow';
import ListingPreviewScreen, { PLATFORM_LABELS, AspectValueInput, clearStepperPersistence, readStepperHost, writeStepperHost } from '../components/ListingPreviewScreen';
import ExtensionReminderModal, { shouldShowExtensionReminder } from '../components/ExtensionReminderModal';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import VoiceResultCard from '../components/voice/VoiceResultCard';
import { Btn } from '../components/voice/VoiceKit';
import { VOICE_KIT_CSS } from '../components/voice/tokens';
import { supabase } from '../lib/supabase';
import {
  C, formatCurrency, fmtp, getMargeColor, getCatBorder,
  getTypeStyle, typeLabel, marqueLabel, parseLocDesc, detectType,
  getRotatingExamples, SKELETON_ITEMS, SKELETON_SOLD,
  CURRENCY_SYMBOLS, VOICE_FREE_LIMIT,
  getCatTileColor, catClass, detectObjectIcon, buildCardCss,
} from '../utils/shared';

// ── Design 2026 (Lens / navbar) — liste des articles en stock ──
// Maquette validée : row grid [tuile | infos | prix+actions], palette canvas/paper.
// CSS partagé avec VentesTab via buildCardCss (src/utils/shared.js).
const STOCK_CSS = buildCardCss('stock-v2');

// ── Redesign zone de saisie IA (haut StockTab) — eyebrow + toggle Écrire/Parler ──
const STOCK_TOP_CSS = `
.stock-top-v2{
  --canvas:#EDEAE0;
  --paper:#F6F5F1;
  --ink:#10201B;
  --teal:#2F9E90;
  --teal-deep:#1B6E62;
  --amber:#E8956D;
  --mute:#8A8578;
  --border:#E7E3D8;
  font-family:'Space Grotesk',sans-serif;
}
.stock-top-v2 .eyebrow{
  font-size:11px;
  font-weight:600;
  letter-spacing:0.08em;
  text-transform:uppercase;
  color:var(--mute);
}
.stock-top-v2 .eyebrow-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:2px 4px 14px;
}
.stock-top-v2 .eyebrow-status{
  display:flex;
  align-items:center;
  gap:6px;
  font-size:12px;
  font-weight:600;
  color:var(--teal-deep);
  white-space:nowrap;
}
.stock-top-v2 .status-dot{
  width:6px; height:6px;
  border-radius:50%;
  background:var(--amber);
  box-shadow:0 0 0 3px rgba(232,149,109,0.18);
  flex-shrink:0;
}
.stock-top-v2 .mode-toggle{
  display:flex;
  background:var(--canvas);
  border-radius:11px;
  padding:3px;
  margin-bottom:14px;
}
.stock-top-v2 .mode-btn{
  flex:1;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  padding:9px;
  border-radius:9px;
  border:none;
  background:transparent;
  font-family:inherit;
  font-size:12.5px;
  font-weight:600;
  color:var(--mute);
  cursor:pointer;
}
.stock-top-v2 .mode-btn.active{
  background:var(--paper);
  color:var(--ink);
  box-shadow:0 2px 6px -2px rgba(16,32,27,0.15);
}
.stock-top-v2 .voice-state{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:26px 0 18px;
  gap:14px;
}
.stock-top-v2 .voice-orb-wrap{
  position:relative;
  width:72px; height:72px;
  display:flex; align-items:center; justify-content:center;
  margin:0 auto;
}
.stock-top-v2 .pulse-ring{
  position:absolute;
  inset:0;
  border-radius:50%;
  border:1.5px solid var(--teal);
  opacity:0;
  animation:stvPulseRing 2.2s cubic-bezier(0.2,0.6,0.35,1) infinite;
  pointer-events:none;
}
.stock-top-v2 .pulse-ring:nth-child(2){ animation-delay:0.7s; }
.stock-top-v2 .pulse-ring:nth-child(3){ animation-delay:1.4s; }
@keyframes stvPulseRing{
  0%{ transform:scale(0.72); opacity:0.55; }
  100%{ transform:scale(1.55); opacity:0; }
}
.stock-top-v2 .voice-orb{
  position:relative;
  z-index:2;
  width:60px; height:60px;
  border-radius:50%;
  background:linear-gradient(155deg, var(--teal) 0%, var(--teal-deep) 100%);
  display:flex; align-items:center; justify-content:center;
  color:#fff;
  font-size:22px;
  box-shadow:0 8px 20px -6px rgba(27,110,98,0.5), inset 0 1px 1px rgba(255,255,255,0.25);
  border:none;
  cursor:pointer;
  transition:transform 0.15s ease;
}
.stock-top-v2 .voice-orb:active{ transform:scale(0.94); }
.stock-top-v2 .voice-orb.thinking{ opacity:0.85; cursor:not-allowed; }
@media (prefers-reduced-motion: reduce){
  .stock-top-v2 .pulse-ring{ animation:none !important; opacity:0; }
}
.stock-top-v2 .voice-hint{
  font-size:12.5px;
  color:var(--mute);
  font-weight:500;
}
.stock-top-v2 .hint-row{
  display:flex;
  align-items:flex-start;
  gap:7px;
  margin-bottom:16px;
}
.stock-top-v2 .hint-icon{
  color:var(--teal);
  font-size:13px;
  line-height:1.5;
  flex-shrink:0;
}
.stock-top-v2 .hint-text{
  font-size:12.5px;
  color:var(--mute);
  line-height:1.5;
}
.stock-top-v2 .cta{
  width:100%;
  padding:14px;
  border-radius:13px;
  border:none;
  font-family:inherit;
  font-weight:700;
  font-size:14.5px;
  letter-spacing:-0.005em;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  transition:all 0.15s ease;
  background:#D8D4C6;
  color:#A19C8C;
  cursor:not-allowed;
}
.stock-top-v2 .cta.active{
  background:var(--teal-deep);
  color:#fff;
  box-shadow:0 8px 20px -8px rgba(27,110,98,0.55);
  cursor:pointer;
}
.stock-top-v2 .examples-toggle{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:5px;
  padding:14px 0 2px;
  font-size:12px;
  font-weight:600;
  color:var(--mute);
  cursor:pointer;
  background:none;
  border:none;
  width:100%;
  font-family:inherit;
}
.stock-top-v2 .examples-toggle svg{ transition:transform 0.15s ease; }
.stock-top-v2 .examples-panel{
  margin-top:10px;
  display:flex;
  flex-direction:column;
  gap:6px;
}
.stock-top-v2 .example-chip{
  display:flex;
  align-items:center;
  gap:9px;
  padding:10px 12px;
  border-radius:11px;
  background:var(--canvas);
  font-size:12.5px;
  color:var(--ink);
  opacity:0.85;
  border:none;
  font-family:inherit;
  cursor:pointer;
  text-align:left;
  width:100%;
}
`;

// ── Mini-éditeur « À compléter » (socle needs_user, 2026-07-19) ──────────────
// Un job est en 'needs_user' : l'extension a identifié UN champ obligatoire
// précis que seul l'utilisateur peut trancher (platform_fields.needsUserField
// = { platform, field_key, field_label, allowed_values?, target? }).
// Règles produit NON NÉGOCIABLES :
//   · allowed_values connue → SELECT FERMÉ sur ces valeurs exactes (strict),
//     JAMAIS de texte libre — divergence assumée avec le stepper (qui reste
//     non-strict sur les listes découvertes) : ici la règle n°1 du socle prime ;
//   · aucune liste connue → saisie texte assistée, comportement existant ;
//   · TOUT se passe dans l'app : aucun lien ni instruction vers la plateforme.
// À la validation : la valeur est écrite dans platform_fields à la cible dite
// par le HANDLER (target { root, key } — l'app ne devine rien), needsUserField
// est retiré, needsUserAttempts remis à 0 (budget de re-tentatives frais), et
// le job repasse en 'pending' — il repart au prochain poll comme n'importe
// quel job. Update CONDITIONNEL .eq(status,'needs_user') + .select() :
//   · double-clic Valider → 2e update ne matche 0 ligne, aucun double effet ;
//   · job annulé/supprimé entre-temps → 0 ligne, message doux, jamais d'écrasement ;
//   · leçon RLS (profiles 2026-07-06) : sans .select(), un update bloqué par
//     la RLS échoue en silence.
const NU_T = { border:"#E7E3D8", chip:"#F2F0E9", ink:"#10201B", mute:"#8A8578" };
const NU_CHANNEL_BY_PLATFORM = { vinted:"vintedAspects", leboncoin:"lbcAspects", beebs:"beebsAspects", ebay:"ebayAspects" };

function NeedsUserModal({ job, lang, onClose, onDone }) {
  const f = job.platform_fields?.needsUserField ?? null;
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState(null);
  // eBay : les allowed_values ne transitent jamais par le job (référentiel
  // Taxonomy trop volumineux, cf. ListingPreviewScreen l.3912) — on les relit
  // d'ebay_item_aspects ici, best-effort. SELECTION_ONLY → strict de toute façon.
  const [ebayAllowed, setEbayAllowed] = useState(null);
  useEffect(() => {
    let alive = true;
    const catId = job.platform_fields?.ebayCategoryId;
    if (job.platform !== "ebay" || !f || (Array.isArray(f.allowed_values) && f.allowed_values.length) || !catId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("ebay_item_aspects")
          .select("aspects")
          .eq("category_id", String(catId))
          .maybeSingle();
        const asp = (Array.isArray(data?.aspects) ? data.aspects : [])
          .find(a => String(a?.name ?? "").toLowerCase() === String(f.field_key).toLowerCase());
        const vals = Array.isArray(asp?.allowedValues) ? asp.allowedValues.filter(Boolean).map(String) : [];
        if (alive && vals.length) setEbayAllowed(vals);
      } catch { /* best-effort, la saisie texte reste possible */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  if (!f) return null;

  const allowed = Array.isArray(f.allowed_values) && f.allowed_values.length
    ? f.allowed_values
    : ebayAllowed;
  const platformLabel = PLATFORM_LABELS[job.platform] || job.platform;

  const valider = async () => {
    if (saving) return;
    const v = String(value ?? "").trim();
    if (!v) return;
    setSaving(true); setErrMsg(null);
    try {
      const pf = job.platform_fields ?? {};
      const target = (f.target && f.target.key)
        ? f.target
        : { root: NU_CHANNEL_BY_PLATFORM[job.platform] ?? null, key: f.field_key };
      const newPf = { ...pf, needsUserAttempts: 0 };
      delete newPf.needsUserField;
      if (target.root) newPf[target.root] = { ...(pf[target.root] ?? {}), [target.key]: v };
      else newPf[target.key] = v;
      // Trace persistante « tranché par l'utilisateur » (2026-07-19, boucle
      // needs_user État/Beauté) : les handlers ont des gardes légitimes
      // « déjà rempli → conservé » (pré-remplissage eBay, valeur d'origine du
      // job) qui, sans ce marqueur, écartaient silencieusement la réponse.
      // Clé = cible d'écriture ("ebayAspects.Matière", "vintedAspects.condition",
      // "etat"…) ; cumulatif : chaque champ tranché reste marqué pour tous les
      // essais suivants. Les handlers font TOUJOURS primer une valeur marquée.
      const resolvedKey = target.root ? `${target.root}.${target.key}` : String(target.key);
      newPf.needsUserResolved = { ...(pf.needsUserResolved ?? {}), [resolvedKey]: v };
      const { data, error } = await supabase
        .from("cross_post_jobs")
        .update({ status: "pending", error: null, platform_fields: newPf })
        .eq("id", job.id)
        .eq("status", "needs_user")
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        // Job déjà repris/annulé/supprimé pendant que le modal était ouvert.
        setSaving(false);
        setErrMsg(lang === "en"
          ? "This job is no longer waiting (already resumed or cancelled)."
          : "Ce job n'est plus en attente (déjà repris ou annulé).");
        onDone?.(null);
        return;
      }
      onDone?.(job.id);
    } catch (e) {
      setSaving(false);
      setErrMsg(String(e?.message ?? e));
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(16,32,27,0.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:"#F6F5F1", borderRadius:16, border:`1px solid ${NU_T.border}`, padding:20, width:"100%", maxWidth:380, boxShadow:"0 8px 32px rgba(0,0,0,0.18)", fontFamily:"inherit" }}
      >
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:"#8A6100", marginBottom:6 }}>
          ✋ {lang === "en" ? "Action needed" : "À compléter"} — {platformLabel}
        </div>
        <div style={{ fontSize:15, fontWeight:600, color:NU_T.ink, marginBottom:4 }}>
          {f.field_label}
        </div>
        <div style={{ fontSize:12.5, lineHeight:1.5, color:"#6B7A75", marginBottom:14 }}>
          {lang === "en"
            ? `${platformLabel} requires this field for this category. Pick a value — the listing will then resume automatically, nothing to do on ${platformLabel}.`
            : `${platformLabel} exige ce champ pour cette catégorie. Choisis une valeur — la publication repartira automatiquement, rien à faire sur ${platformLabel}.`}
        </div>
        <AspectValueInput
          value={value}
          allowedValues={allowed ?? []}
          strict={Boolean(allowed?.length)}
          onChange={setValue}
          T={NU_T}
          idBase={`nu-${job.id}`}
        />
        {errMsg && (
          <div style={{ marginTop:10, fontSize:12, color:"#8C2F28", background:"#FBEDEC", border:"1px solid #EFC2BE", borderRadius:10, padding:"8px 10px" }}>
            {errMsg}
          </div>
        )}
        <div style={{ display:"flex", gap:10, marginTop:16 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ flex:1, padding:"10px 0", borderRadius:12, border:`1px solid ${NU_T.border}`, background:"#fff", color:"#6B7A75", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}
          >
            {lang === "en" ? "Later" : "Plus tard"}
          </button>
          <button
            onClick={valider}
            disabled={saving || !String(value ?? "").trim()}
            style={{ flex:1.4, padding:"10px 0", borderRadius:12, border:"none", background: saving || !String(value ?? "").trim() ? "#B9C4C0" : "#1B6E62", color:"#fff", fontSize:13, fontWeight:700, cursor: saving ? "wait" : "pointer", fontFamily:"inherit" }}
          >
            {saving
              ? (lang === "en" ? "Saving…" : "Enregistrement…")
              : (lang === "en" ? "Confirm & resume" : "Valider et relancer")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Retrait ciblé (2026-07-19) : état de retrait par plateforme ──────────────
// Le job publish reste 'published' en base même après une suppression réussie
// (l'extension le passe ensuite en 'cancelled', mais pas instantanément) :
// c'est le delete LE PLUS RÉCENT de la plateforme qui dit la vérité — à
// condition d'être POSTÉRIEUR au dernier publish 'published' (une
// republication après retrait rallume le logo, l'ancien delete ne compte plus).
//   'removing' → delete pending/processing : retrait en cours, action désarmée ;
//   'removed'  → delete 'deleted' : la plateforme n'est plus active ;
//   failed/needs_user/dry_run_completed → rien : l'annonce est toujours en
//                ligne, le retrait reste proposable.
// ⚠️ dédoublonnage published (2026-07-13) : un article REPUBLIÉ crée un NOUVEAU
// job pour la même plateforme sans clore l'ancien — deux jobs "published"
// leboncoin coexistent en base pour la même annonce (même listing_url,
// vérifié). Sans le Set, la pastille s'affichait deux fois.
// Partagé carte (logos) + RemovePlatformsModal : un seul calcul, jamais deux vérités.
const RM_PLATFORMS = ["vinted", "leboncoin", "beebs", "ebay"];
function computeRemovalInfo(jobsAll) {
  const jobs = jobsAll.filter(j => j.action !== "delete");
  const deleteJobs = jobsAll.filter(j => j.action === "delete");
  const published = [...new Set(jobs.filter(j => j.status === "published").map(j => j.platform))];
  const latestPubByPlatform = {};
  for (const j of jobs) {
    if (j.status !== "published") continue;
    const cur = latestPubByPlatform[j.platform];
    if (!cur || Date.parse(j.created_at || 0) > Date.parse(cur.created_at || 0)) latestPubByPlatform[j.platform] = j;
  }
  const latestDelByPlatform = {};
  for (const j of deleteJobs) {
    const cur = latestDelByPlatform[j.platform];
    if (!cur || Date.parse(j.created_at || 0) > Date.parse(cur.created_at || 0)) latestDelByPlatform[j.platform] = j;
  }
  const removalState = {};
  for (const p of published) {
    const pub = latestPubByPlatform[p], del = latestDelByPlatform[p];
    if (!pub || !del || Date.parse(del.created_at || 0) <= Date.parse(pub.created_at || 0)) continue;
    if (del.status === "deleted") removalState[p] = "removed";
    else if (del.status === "pending" || del.status === "processing") removalState[p] = "removing";
  }
  const publishedActive = published.filter(p => removalState[p] !== "removed");
  return { published, removalState, publishedActive, latestPubByPlatform };
}

// ── Modal de retrait ciblé (2026-07-19, remplace window.confirm) ─────────────
// Ouvert par un tap sur n'importe quel logo de plateforme d'une carte stock.
// Liste LES 4 plateformes avec leur état réel (en ligne / retrait en cours /
// retirée / pas publiée) et une action de retrait PAR LIGNE — on peut retirer
// plusieurs plateformes depuis ce seul modal, chacune restant un job delete
// individuel (la logique métier ne change pas : insert scopé, patch local,
// sortie du scan de vente côté extension).
// Confirmation INLINE par ligne, jamais de window.confirm imbriqué : premier
// tap sur « Retirer » ARME la ligne (« Retirer de X ? » + Confirmer/Annuler),
// second tap exécute. Armer une ligne désarme l'autre — une seule décision à
// la fois. Même squelette visuel que NeedsUserModal : voile ink 45 %, carte
// paper #F6F5F1, coins 16, bordure #E7E3D8, police héritée (Space Grotesk),
// poids ≤ 700 ; rouge #8C2F28/#FBEDEC réservé à l'action destructive.
// ── Panneau « où en est cette publication ? » (2026-07-20) ───────────────────
// Ouvert au tap sur le badge « En cours… ». Même squelette visuel que
// RemovePlatformsModal (voile ink 45 %, carte F6F5F1) — aucun nouveau système.
// Ne montre QUE des faits déjà en base : statut du job, ancienneté, message
// d'erreur existant. Le diagnostic global vient du heartbeat de l'extension.
// HORS SCOPE ASSUMÉ : le détail étape par étape du loader de publication
// (FILLSELL_PROGRESS, background.js:253) ne remonte JAMAIS en base — il n'est
// émis que vers le popup, et seulement sur PUBLISH_NOW. L'afficher ici
// demanderait de persister la progression à chaque étape ; reporté.
function JobStatusModal({ item, jobs, lang, pausedSet, extensionStatus, onClose }) {
  const fr = lang !== "en";
  const diag = diagnostiquerExtension(extensionStatus, lang);
  const TONS = {
    vert:   { bg:"#ECFDF5", bord:"#A7F3D0", texte:"#047857" },
    orange: { bg:"#FFF7ED", bord:"#FED7AA", texte:"#7C2D12" },
    rouge:  { bg:"#FEF2F2", bord:"#FECACA", texte:"#B91C1C" },
  };
  const ton = TONS[diag.ton];
  const LIB_STATUT = {
    pending:    fr ? "En attente"        : "Queued",
    processing: fr ? "Publication…"      : "Publishing…",
    needs_user: fr ? "À compléter"       : "Needs input",
  };
  // Un seul job par plateforme : le plus récent — même règle que les badges.
  const parPlateforme = {};
  for (const j of jobs) {
    const cur = parPlateforme[j.platform];
    if (!cur || Date.parse(j.created_at || 0) > Date.parse(cur.created_at || 0)) parPlateforme[j.platform] = j;
  }
  const lignes = Object.values(parPlateforme)
    .filter(j => ["pending", "processing", "needs_user"].includes(j.status));

  return (
    <div
      onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(16,32,27,0.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:"#F6F5F1", borderRadius:16, border:`1px solid ${NU_T.border}`, padding:20, width:"100%", maxWidth:380, boxShadow:"0 8px 32px rgba(0,0,0,0.18)", fontFamily:"inherit" }}
      >
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:NU_T.mute, marginBottom:6 }}>
          {fr ? "Où en est la publication" : "Publishing status"}
        </div>
        <div style={{ fontSize:15, fontWeight:700, color:NU_T.ink, marginBottom:14 }}>{item.title}</div>

        <div style={{ background:ton.bg, border:`1px solid ${ton.bord}`, borderRadius:12, padding:"10px 12px", marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:ton.texte, marginBottom:3 }}>{diag.titre}</div>
          <div style={{ fontSize:12.5, lineHeight:1.5, color:ton.texte }}>{diag.detail}</div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {lignes.map(j => {
            const enPause = pausedSet?.has(j.platform);
            const depuis = formatDepuis(Date.parse(j.created_at || 0), lang);
            return (
              <div key={j.platform} style={{ background:"#fff", border:`1px solid ${NU_T.border}`, borderRadius:12, padding:"10px 12px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <PlatformLogo platform={j.platform} size={18}/>
                  <span style={{ fontSize:13, fontWeight:600, color:NU_T.ink, flex:1 }}>
                    {PLATFORM_LABELS[j.platform] || j.platform}
                  </span>
                  <span style={{ fontSize:12, fontWeight:600, color:NU_T.mute }}>
                    {LIB_STATUT[j.status] || j.status}
                  </span>
                </div>
                <div style={{ fontSize:11.5, color:NU_T.mute, marginTop:4 }}>
                  {fr ? `Depuis ${depuis}` : `For ${depuis}`}
                  {enPause && (fr ? " · plateforme en pause (reprise auto)" : " · platform paused (auto-resume)")}
                </div>
                {j.error && (
                  <div style={{ fontSize:11.5, lineHeight:1.45, color:"#8C2F28", marginTop:6 }}>{j.error}</div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          style={{ marginTop:16, width:"100%", padding:"10px 14px", borderRadius:12, border:`1px solid ${NU_T.border}`, background:"#fff", color:NU_T.ink, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}
        >
          {fr ? "Fermer" : "Close"}
        </button>
      </div>
    </div>
  );
}

function RemovePlatformsModal({ item, jobsAll, lang, busyPlatform, onClose, onRemove }) {
  const [confirming, setConfirming] = useState(null);
  const [errMsg, setErrMsg] = useState(null);
  const { published, removalState, latestPubByPlatform } = computeRemovalInfo(jobsAll);
  const fr = lang !== "en";
  return (
    <div
      onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(16,32,27,0.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:"#F6F5F1", borderRadius:16, border:`1px solid ${NU_T.border}`, padding:20, width:"100%", maxWidth:380, boxShadow:"0 8px 32px rgba(0,0,0,0.18)", fontFamily:"inherit" }}
      >
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:NU_T.mute, marginBottom:6 }}>
          {fr ? "Retirer des plateformes" : "Remove from platforms"}
        </div>
        <div style={{ fontSize:15, fontWeight:700, color:NU_T.ink, marginBottom:4 }}>
          {item.title}
        </div>
        <div style={{ fontSize:12.5, lineHeight:1.5, color:"#6B7A75", marginBottom:14 }}>
          {fr
            ? "Chaque retrait supprime l'annonce sur cette plateforme uniquement — les autres ne bougent pas."
            : "Each removal deletes the listing on that platform only — the others are untouched."}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {RM_PLATFORMS.map(p => {
            const label = PLATFORM_LABELS[p] || p;
            const isPublished = published.includes(p);
            const state = removalState[p];
            const noUrl = isPublished && !state && !latestPubByPlatform[p]?.listing_url;
            const online = isPublished && !state && !noUrl;
            const busy = busyPlatform === p;
            const armed = confirming === p;
            const dimmed = !isPublished || state === "removed";
            return (
              <div key={p} style={{ display:"flex", alignItems:"center", gap:10, background:"#fff", border:`1px solid ${armed ? "#EFC2BE" : NU_T.border}`, borderRadius:12, padding:"10px 12px", minHeight:52 }}>
                <span style={{ display:"flex", flex:"0 0 auto", lineHeight:0, opacity:dimmed ? 0.3 : state === "removing" ? 0.45 : 1 }}>
                  <PlatformLogo platform={p} size={22}/>
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:dimmed ? NU_T.mute : NU_T.ink }}>{label}</div>
                  <div style={{ fontSize:11.5, lineHeight:1.35, color:NU_T.mute, display:"flex", alignItems:"center", gap:5 }}>
                    {online && !armed && (<><span style={{ width:5, height:5, borderRadius:"50%", background:"#2F9E90", flex:"0 0 auto" }}/><span style={{ color:"#1B6E62", fontWeight:600 }}>{fr ? "En ligne" : "Live"}</span></>)}
                    {online && armed && <span style={{ color:"#8C2F28", fontWeight:600 }}>{fr ? `Retirer de ${label} ?` : `Remove from ${label}?`}</span>}
                    {state === "removing" && <span style={{ color:"#8A6100", fontWeight:600 }}>⏳ {fr ? "Retrait en cours…" : "Removing…"}</span>}
                    {state === "removed" && <span>{fr ? "Retirée" : "Removed"}</span>}
                    {noUrl && <span>{fr ? `Lien d'annonce introuvable — retire-la sur ${label}` : `Listing link missing — remove it on ${label}`}</span>}
                    {!isPublished && <span>{fr ? "Pas publiée ici" : "Not listed here"}</span>}
                  </div>
                </div>
                {online && !armed && (
                  <button
                    onClick={() => { setErrMsg(null); setConfirming(p); }}
                    style={{ flex:"0 0 auto", padding:"7px 14px", borderRadius:10, border:"1px solid #EFC2BE", background:"#fff", color:"#8C2F28", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}
                  >
                    {fr ? "Retirer" : "Remove"}
                  </button>
                )}
                {online && armed && (
                  <div style={{ display:"flex", flex:"0 0 auto", gap:6 }}>
                    <button
                      onClick={() => setConfirming(null)}
                      disabled={busy}
                      style={{ padding:"7px 10px", borderRadius:10, border:`1px solid ${NU_T.border}`, background:"#fff", color:"#6B7A75", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}
                    >
                      {fr ? "Annuler" : "Cancel"}
                    </button>
                    <button
                      onClick={async () => {
                        if (busy) return;
                        setErrMsg(null);
                        const err = await onRemove(item, p);
                        if (err) setErrMsg(err);
                        setConfirming(null);
                      }}
                      disabled={busy}
                      style={{ padding:"7px 12px", borderRadius:10, border:"none", background:busy ? "#B9C4C0" : "#8C2F28", color:"#fff", fontSize:12, fontWeight:700, cursor:busy ? "wait" : "pointer", fontFamily:"inherit" }}
                    >
                      {busy ? (fr ? "Retrait…" : "Removing…") : (fr ? "Confirmer" : "Confirm")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {errMsg && (
          <div style={{ marginTop:10, fontSize:12, color:"#8C2F28", background:"#FBEDEC", border:"1px solid #EFC2BE", borderRadius:10, padding:"8px 10px" }}>
            {errMsg}
          </div>
        )}
        <button
          onClick={onClose}
          style={{ width:"100%", marginTop:16, padding:"10px 0", borderRadius:12, border:`1px solid ${NU_T.border}`, background:"#fff", color:"#6B7A75", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}
        >
          {fr ? "Fermer" : "Close"}
        </button>
      </div>
    </div>
  );
}

// ── Diagnostic « pourquoi ce job ne bouge pas » (2026-07-20) ─────────────────
// Incident fondateur : 4 jobs Patagonia restés 30 min en « En cours… » sans le
// moindre signal, extension déconnectée. Vus de la base ils étaient
// INDISCERNABLES d'une file d'attente saine — status pending, handler_build
// NULL, processing_since NULL, error NULL. Seule leur ANCIENNETÉ trahissait le
// blocage. Le heartbeat (profiles.extension_last_seen_at, écrit par
// get-pending-jobs à chaque poll) est ce qui permet enfin de trancher entre
// « ça avance » et « personne n'écoute ».
// Le poll de l'extension est à 2 min : au-delà de 15 min sans signe de vie,
// elle ne tourne plus. Entre les deux, on ne conclut pas.
const EXT_FRAIS_MS = 5 * 60 * 1000;
const EXT_MORT_MS = 15 * 60 * 1000;

function diagnostiquerExtension(extensionStatus, lang) {
  const fr = lang !== "en";
  const seen = Date.parse(extensionStatus?.lastSeenAt ?? "");
  if (!Number.isFinite(seen)) {
    return {
      ton: "rouge",
      titre: fr ? "Extension jamais vue" : "Extension never seen",
      detail: fr
        ? "Reconnecte-toi sur fillsell.app pour réactiver l'extension."
        : "Sign in again on fillsell.app to reactivate the extension.",
    };
  }
  const age = Date.now() - seen;
  if (age > EXT_MORT_MS) {
    return {
      ton: "rouge",
      titre: fr ? "Extension inactive" : "Extension inactive",
      detail: fr
        ? `Aucun signe de vie depuis ${formatDepuis(seen, lang)}. Ouvre Chrome, et reconnecte-toi sur fillsell.app si ça ne repart pas.`
        : `No sign of life for ${formatDepuis(seen, lang)}. Open Chrome, and sign in again on fillsell.app if it doesn't resume.`,
    };
  }
  if (extensionStatus?.outdated) {
    return {
      ton: "orange",
      titre: fr ? "Extension à recharger" : "Extension needs reloading",
      detail: fr
        ? "Une version plus récente existe. Recharge l'extension dans chrome://extensions."
        : "A newer version exists. Reload the extension in chrome://extensions.",
    };
  }
  if (age <= EXT_FRAIS_MS) {
    return {
      ton: "vert",
      titre: fr ? "En file d'attente" : "Queued",
      detail: fr
        ? "L'extension tourne — la publication part au prochain passage (toutes les 2 min)."
        : "The extension is running — publishing starts on the next pass (every 2 min).",
    };
  }
  return {
    ton: "orange",
    titre: fr ? "Extension silencieuse" : "Extension quiet",
    detail: fr
      ? `Dernier signe de vie il y a ${formatDepuis(seen, lang)}. Laisse-lui un instant, ou ouvre Chrome.`
      : `Last seen ${formatDepuis(seen, lang)} ago. Give it a moment, or open Chrome.`,
  };
}

// « il y a 3 min », « il y a 2 h » — sans dépendance externe.
function formatDepuis(ts, lang) {
  const fr = lang !== "en";
  const ms = Math.max(0, Date.now() - ts);
  // Seuil sur les MILLISECONDES, pas sur les minutes arrondies : Math.round(30 s)
  // vaut 1 et affichait « 1 min » pour une demi-minute.
  if (ms < 60000) return fr ? "moins d'une minute" : "less than a minute";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return fr ? `${h} h` : `${h}h`;
  const j = Math.floor(h / 24);
  return fr ? `${j} j` : `${j}d`;
}

const StockTab = memo(function StockTab({
  // Config
  lang, currency, isPremium, isNative, isPro, items, user, voiceUsedToday,
  iapProduct, iapLoading, extensionStatus = null,
  // Computed lists
  stock, sold, stockFiltre, soldFiltre, stockVisible, soldVisible, stockVal, stockQty, soldQty,
  // Voice/AI state
  voiceStep, setVoiceStep, voiceParsed, setVoiceParsed,
  voiceZoneResults, setVoiceZoneResults, voiceZoneOpen, setVoiceZoneOpen,
  vaActions, vaStep,
  voiceText, setVoiceText, voiceLoading, voicePlaceholderIdx, voiceError,
  // Manual form state
  showManualForm, setShowManualForm, manualMode, setManualMode,
  iTitle, setITitle, iQuantite, setIQuantite, iMarque, setIMarque,
  iType, setIType, iBuy, setIBuy, iPurchaseCosts, setIPurchaseCosts,
  iAlreadySold, setIAlreadySold, iSell, setISell,
  iSellingFees, setISellingFees, iRememberSellingFees, setIRememberSellingFees,
  iDesc, setIDesc, iEmplacement, setIEmplacement, iPlateforme, setIPlateforme, iSaved, firstItemAdded,
  // Lot state
  lotManualTotal, setLotManualTotal, lotManualItems, setLotManualItems,
  lotDistributed, setLotDistributed, lotDistributing,
  // Filter state
  filterType, setFilterType, filterMarque, setFilterMarque,
  filterMarqueSold, setFilterMarqueSold,
  search, setSearch, soldShowAll, setSoldShowAll,
  showAllStock, setShowAllStock,
  pillsExpandedSold, setPillsExpandedSold, pillsExpandedStock, setPillsExpandedStock,
  importMsg,
  // Handlers
  addItemsFromVoice, resetVoiceFlow, callVoiceParse, addItem,
  handleLotDistribute, addLotToInventory, delItem, markSold, setEditItem,
  handleImportFile, handleExport, handleIAPPurchase, handleIAPRestore,
  triggerCheckout,
  // Refs
  importRef, listRef, scrollRef, fabTriggerRef,
  // Injected components (defined in App.jsx)
  PremiumBanner, IAPUpgradeBlock,
  openUpgradeModal, onStepperOpenChange,
}) {
  const { t, tpl } = useTranslation(lang);
  const isMobile = useIsMobile(); // P4 : réactif (grille desktop ↔ liste mobile)
  const fmt = (amount, dec=null) => formatCurrency(amount, currency, dec);
  const [zoneEdits, setZoneEdits] = useState({});
  const [publishItem, setPublishItem] = useState(null);
  // Ouverture du stepper : purge tout brouillon précédent puis pose le blob
  // hôte (sessionStorage) qui permettra de le REMONTER après un remount
  // (reload d'onglet Chrome ou navigation interne).
  const ouvrirStepper = (item) => {
    clearStepperPersistence();
    writeStepperHost({ source: 'stock', itemId: item.id });
    setPublishItem(item);
    onStepperOpenChange?.(true);
  };
  // Reprise après remount : on retrouve la ligne inventaire dans items (chargés
  // en async par App) et on rouvre le stepper — son état interne revient du
  // brouillon sessionStorage propre au stepper.
  const stepperRestaureRef = useRef(false);
  useEffect(() => {
    if (stepperRestaureRef.current || publishItem) return;
    const h = readStepperHost('stock');
    if (!h) return;
    const item = (items || []).find(i => i.id === h.itemId);
    if (!item) return;
    stepperRestaureRef.current = true;
    setPublishItem(item);
    onStepperOpenChange?.(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  // Article en attente derrière le rappel extension : le clic « Publier » passe
  // d'abord par le modal, l'ouverture du stepper n'a lieu qu'au « Continuer ».
  const [extReminderItem, setExtReminderItem] = useState(null);
  const [jobsByInventaire, setJobsByInventaire] = useState({});
  // Job 'needs_user' ouvert dans le mini-éditeur « À compléter » (socle
  // needs_user, 2026-07-19). null = fermé. La fermeture sans valider ne touche
  // à RIEN : le job reste needs_user, le badge reste affiché.
  const [needsUserJob, setNeedsUserJob] = useState(null);
  const [voiceInputMode, setVoiceInputMode] = useState('write');
  const [examplesOpen, setExamplesOpen] = useState(false);

  // ⚠️ RAFRAÎCHISSEMENT (2026-07-13) — sans lui, le Stock MENTAIT.
  // La publication est faite par l'EXTENSION, dans son coin, plusieurs minutes
  // après le clic : elle passe les jobs en "published" en base, mais cette liste
  // n'était lue QU'UNE FOIS, au montage (deps [user?.id]). Rien ne la relisait
  // jamais — l'article restait affiché comme non publié jusqu'au prochain
  // rechargement complet de l'app (bug remonté par Nico : « Publier » toujours
  // actif alors que les 4 plateformes étaient en ligne).
  // On relit donc : au retour sur l'onglet (le cas réel — on part surveiller la
  // publication ailleurs, on revient), et à intervalle régulier tant que l'app
  // est visible. Pas de realtime : le projet n'en utilise nulle part, et une
  // relecture de quelques lignes toutes les 20 s est sans effet mesurable.
  //
  // "processing" est dans le filtre, et ce n'est pas un détail : c'est le statut
  // porté PENDANT la publication. Sans lui, l'article ne montrait NI « En
  // cours… » ni ses plateformes tant que l'extension travaillait — il avait
  // simplement l'air de n'avoir jamais été publié.
  useEffect(() => {
    if (!user?.id) return;
    let annule = false;

    const relire = async () => {
      // "failed" est dans le filtre (2026-07-19, contrat « jamais d'état
      // flou ») : sans lui, un job échoué disparaissait SILENCIEUSEMENT de la
      // carte — ni « En cours… », ni pastille, ni erreur : la plateforme avait
      // simplement l'air de n'avoir jamais été incluse, indistinguable d'un
      // article jamais publié. `error` et `created_at` servent au badge Échec
      // (message associé + « seul le job le plus récent de la plateforme
      // compte » : un échec régénéré puis reparti en pending ne doit plus
      // s'afficher en échec).
      // "needs_user" est dans le filtre (2026-07-19, socle needs_user) : un
      // champ précis attend une décision de l'utilisateur — badge dédié
      // « ✋ À compléter », distinct de l'Échec. `platform_fields` est lu pour
      // needsUserField (libellé du champ, valeurs possibles, cible d'écriture)
      // que consomme le mini-éditeur.
      // Les jobs action='delete' sont AUSSI relus (retrait ciblé par logo,
      // 2026-07-19) : ils portent l'état visuel du logo — retrait en cours,
      // ou plateforme retirée — car le job publish d'origine, lui, RESTE
      // 'published' en base après une suppression réussie (seul le flux vente
      // annule les publish côté serveur). D'où 'deleted' dans le filtre.
      // listing_url + title servent à armer un delete depuis le logo — jamais
      // de delete sans le listing_url du job publish LUI-MÊME (leçon
      // listing_url croisée : tout repli supprime l'annonce d'un autre article).
      const { data } = await supabase
        .from("cross_post_jobs")
        .select("id, inventaire_id, platform, status, error, created_at, platform_fields, action, listing_url, title")
        .eq("user_id", user.id)
        .in("status", ["pending", "processing", "published", "failed", "needs_user", "deleted"]);
      if (annule || !data) return;
      const map = {};
      for (const job of data) {
        if (!map[job.inventaire_id]) map[job.inventaire_id] = [];
        map[job.inventaire_id].push(job);
      }
      setJobsByInventaire(map);
    };

    relire();
    const onVisible = () => { if (document.visibilityState === "visible") relire(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") relire();
    }, 20000);

    return () => {
      annule = true;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [user?.id]);

  // Mode dégradé (Phase B) : plateformes en pause → badge « En pause » sur les
  // jobs en attente concernés. Lecture TOLÉRANTE, jamais bloquante.
  const [pausedPlatforms, setPausedPlatforms] = useState([]);
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const lire = async () => {
      try {
        const { data } = await supabase.from("platform_health").select("platform").eq("paused", true);
        if (alive) setPausedPlatforms((data ?? []).map(h => h.platform));
      } catch { /* jamais bloquant */ }
    };
    lire();
    const timer = setInterval(() => { if (document.visibilityState === "visible") lire(); }, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [user?.id]);
  const pausedSet = new Set(pausedPlatforms);

  // action !== "delete" : un retrait ciblé en attente n'est pas un dépôt.
  const pendingTotal = Object.values(jobsByInventaire).flat()
    .filter(j => j.status === "pending" && j.action !== "delete").length;

  // ── Retrait ciblé par plateforme (2026-07-19) ──────────────────────────────
  // Tap sur un logo de plateforme → RemovePlatformsModal (les 4 plateformes,
  // état réel + action par ligne, confirmation inline) → armRemoveJob : UN job
  // action='delete' pour la plateforme confirmée (même mécanisme que
  // armRemovals côté vente, mais scopé à une seule annonce). Les autres
  // plateformes ne sont pas touchées : aucun job créé, aucune donnée modifiée.
  // Insert direct (RLS "Users manage own cross_post_jobs"), aucune Pépite
  // débitée — ce n'est pas une publication. L'extension exécute au prochain
  // cycle ; la ligne passe en « retrait en cours… » (optimiste, via le job
  // inséré rendu dans jobsByInventaire) puis « retirée » quand le job atteint
  // 'deleted'. Retourne un message d'erreur (affiché DANS le modal) ou null.
  const [removeModalItem, setRemoveModalItem] = useState(null);
  // Tap sur « En cours… » → panneau de diagnostic (2026-07-20).
  const [jobStatusItem, setJobStatusItem] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(null);
  async function armRemoveJob(item, platform) {
    if (removeBusy) return null;
    // Le delete cible le job publish 'published' LE PLUS RÉCENT de la
    // plateforme — son listing_url et rien d'autre (leçon listing_url croisée).
    let pub = null;
    for (const j of jobsByInventaire[item.id] || []) {
      if (j.action === "delete" || j.platform !== platform || j.status !== "published") continue;
      if (!pub || Date.parse(j.created_at || 0) > Date.parse(pub.created_at || 0)) pub = j;
    }
    // Le modal désarme la ligne quand l'URL manque — ceci n'est que le filet.
    if (!pub?.listing_url) {
      const label = PLATFORM_LABELS[platform] || platform;
      return lang === 'fr'
        ? `Impossible de retirer de ${label} : le lien de l'annonce est introuvable.`
        : `Can't remove from ${label}: the listing link is missing.`;
    }
    setRemoveBusy(platform);
    try {
      const { data, error } = await supabase.from('cross_post_jobs').insert({
        user_id: user.id, inventaire_id: item.id, platform,
        action: 'delete', status: 'pending', photo_option: 'original',
        title: pub.title || item.title, listing_url: pub.listing_url, platform_fields: {},
      }).select("id, inventaire_id, platform, status, error, created_at, platform_fields, action, listing_url, title").single();
      if (error) {
        console.error('[armRemoveJob] insert:', error.message);
        return lang === 'fr' ? `Le retrait n'a pas pu être lancé (${error.message}).` : `Removal could not be started (${error.message}).`;
      }
      // Patch local immédiat : la ligne du modal et le logo de la carte passent
      // en « retrait… » sans attendre le prochain poll (20 s).
      setJobsByInventaire(prev => ({ ...prev, [item.id]: [...(prev[item.id] || []), data] }));
      track('remove_single_platform', { platform });
      return null;
    } finally {
      setRemoveBusy(null);
    }
  }

  function replaceZoneResult(idx, patch) {
    setVoiceZoneResults(prev => prev.map((r, i) => i === idx ? {...r, ...patch} : r));
  }

  return (
    <>
      <style>{STOCK_TOP_CSS}</style>
      <style>{VOICE_KIT_CSS}</style>
      <div className="stock-top-v2">
        <div className="eyebrow-row">
          <div className="eyebrow">{lang==='en'?'AI Stock':'Stock IA'}</div>
          {pendingTotal>0&&(
            <div className="eyebrow-status">
              <span className="status-dot"/>
              {lang==='en'?`${pendingTotal} being posted`:`${pendingTotal} en cours de dépôt`}
            </div>
          )}
        </div>
      </div>
      <div style={!isMobile?{display:"grid",gridTemplateColumns:"300px 1fr",gap:20,alignItems:"start",width:"100%"}:{display:"flex",flexDirection:"column",gap:16,width:"100%",boxSizing:"border-box"}}>
        <div className="stock-top-v2" style={{background:"#fff",borderRadius:12,padding:20,display:"flex",flexDirection:"column",gap:12,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
          {/* ── Voice Capture (collapsible) ── */}
          {voiceZoneOpen&&(<>
          {voiceStep==="done"&&voiceZoneResults.length>0?(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* ⚠️ Ces cartes étaient dupliquées ici (~570 lignes) avec des styles
                  divergents de celles du drawer. Elles montent désormais LE composant
                  partagé VoiceResultCard — même rendu, même logique, une seule source
                  de vérité (unification du 2026-07-14). */}
              {voiceZoneResults.map((r,idx)=>(
                <VoiceResultCard
                  key={idx}
                  result={r}
                  idx={idx}
                  allResults={voiceZoneResults}
                  ctx={{
                    lang, currency, items,
                    actions:vaActions,
                    replaceResult:replaceZoneResult,
                    edits:zoneEdits,
                    setEdits:setZoneEdits,
                  }}
                />
              ))}
              <Btn kind="ghost" onClick={resetVoiceFlow} style={{width:"100%"}}>
                {lang==='fr'?"Recommencer":"Start over"}
              </Btn>
            </div>
          ):voiceStep==="error"?(
            <div style={{display:"flex",flexDirection:"column",gap:10,alignItems:"center",padding:"8px 0"}}>
              <div style={{fontSize:13,color:"#B0645A",fontWeight:600,textAlign:"center"}}>{voiceError}</div>
              <button onClick={resetVoiceFlow} style={{padding:"10px 20px",background:"#F3E6E3",color:"#B0645A",border:"1px solid #D9A69C",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {lang==='fr'?"Réessayer":"Try again"}
              </button>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column"}}>
              <div className="mode-toggle">
                <button type="button" className={"mode-btn"+(voiceInputMode==="write"?" active":"")} onClick={()=>setVoiceInputMode("write")}>
                  ✎ {lang==='fr'?"Écrire":"Write"}
                </button>
                <button type="button" className={"mode-btn"+(voiceInputMode==="speak"?" active":"")} onClick={()=>setVoiceInputMode("speak")}>
                  🎙 {lang==='fr'?"Parler":"Speak"}
                </button>
              </div>

              {voiceInputMode==="write"?(<>
                {voiceStep==="parsing"&&<div style={{fontSize:12,fontWeight:700,color:"#6B7A75",textAlign:"center",lineHeight:1.4,marginBottom:8}}>{lang==='fr'?"🧠 Analyse en cours...":"🧠 Analyzing..."}</div>}
                <textarea value={voiceText} onChange={e=>setVoiceText(e.target.value)} disabled={voiceLoading}
                  placeholder={getRotatingExamples(currency,lang)[voicePlaceholderIdx]?.text}
                  rows={3} style={{width:"100%",padding:"10px 14px",borderRadius:12,border:`1.5px solid ${voiceText?C.teal:"rgba(0,0,0,0.1)"}`,fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",background:"#fff",transition:"border-color 0.15s",boxSizing:"border-box",lineHeight:1.5,color:C.text}}/>
              </>):(
                <div className="voice-state">
                  <div className="voice-orb-wrap">
                    <span className="pulse-ring"/>
                    <span className="pulse-ring"/>
                    <span className="pulse-ring"/>
                    <button type="button"
                      className={"voice-orb"+(vaStep==="thinking"?" thinking":"")}
                      onClick={()=>fabTriggerRef?.current?.()}
                      disabled={vaStep==="thinking"}
                    >
                      {vaStep==="thinking"?"⏳":"🎙"}
                    </button>
                  </div>
                  <div className="voice-hint">
                    {vaStep==="recording"?(lang==='fr'?"Je t'écoute…":"Listening…")
                      :vaStep==="thinking"?(lang==='fr'?"Je réfléchis…":"Thinking…")
                      :(lang==='fr'?"Appuie et parle":"Tap and speak")}
                  </div>
                </div>
              )}

              <div className="hint-row">
                <span className="hint-icon">✦</span>
                <span className="hint-text">{lang==='fr'?"Plus tu détailles, plus l'IA est précise.":"The more you detail, the more accurate the AI is."}</span>
              </div>

              {voiceInputMode==="write"&&!isPremium&&(()=>{const r=VOICE_FREE_LIMIT-voiceUsedToday;return r<=2&&r>0?(<div style={{textAlign:'center',padding:'4px 10px',borderRadius:20,fontSize:12,fontWeight:700,background:r===1?'#FEE2E2':'#FEF3C7',color:r===1?'#DC2626':'#D97706',marginBottom:12}}>{r===1?(lang==='fr'?'⚠️ Dernière analyse vocale du jour !':'⚠️ Last voice analysis today!'):(lang==='fr'?`🎙️ Il vous reste ${r} analyses vocales`:`🎙️ ${r} voice analyses left`)}</div>):r===0?(<div style={{textAlign:'center',padding:'4px 10px',borderRadius:20,fontSize:12,fontWeight:700,background:'#FEE2E2',color:'#DC2626',marginBottom:12}}>{lang==='fr'?'🔒 Limite atteinte · Passer Premium':'🔒 Limit reached · Go Premium'}</div>):null;})()}

              {voiceInputMode==="write"&&(
                <button className={"cta"+((!voiceText.trim()||voiceLoading)?"":" active")} onClick={()=>callVoiceParse(voiceText)} disabled={!voiceText.trim()||voiceLoading}>
                  ✦ {lang==='fr'?"Analyser":"Analyze"}
                </button>
              )}

              <div className="examples-toggle" onClick={()=>setExamplesOpen(v=>!v)}>
                {lang==='fr'?"Voir des exemples":"See examples"}
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{transform:examplesOpen?"rotate(180deg)":"rotate(0deg)"}}>
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              {examplesOpen&&(()=>{
                const FIXED_EX=lang==='fr'?[
                  {text:"Veste Zara M, 8€",icon:"➕"},
                  {text:"Vendu mes Air Max 90, 45€",icon:"💰"},
                  {text:"Mes articles les plus rentables ?",icon:"📊"},
                ]:[
                  {text:"Zara jacket M, £8",icon:"➕"},
                  {text:"Sold my Air Max 90, £45",icon:"💰"},
                  {text:"My most profitable items?",icon:"📊"},
                ];
                return(
                  <div className="examples-panel">
                    {FIXED_EX.map((ex,i)=>(
                      <button key={i} type="button" className="example-chip" onClick={()=>{setVoiceText(ex.text);setVoiceInputMode("write");setExamplesOpen(false);}}>
                        <span>{ex.icon}</span>
                        <span>{ex.text}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
          </>)}
          {/* ── Toggle formulaire manuel ── */}
          <button onClick={()=>setShowManualForm(v=>!v)}
            style={{width:"100%",padding:"10px 14px",background:"transparent",border:"1px solid rgba(0,0,0,0.1)",borderRadius:10,fontSize:13,fontWeight:700,color:"#6B7A75",cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="#F9FAFB"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}
          >
            {showManualForm?(lang==='fr'?"− Fermer le formulaire ▴":"− Close form ▴"):(lang==='fr'?"+ Ajouter manuellement ▾":"+ Add manually ▾")}
          </button>
          {showManualForm&&(<>
          {/* ── Mode toggle ── */}
          <div style={{display:"flex",background:"rgba(0,0,0,0.05)",borderRadius:99,padding:3}}>
            <button onClick={()=>{setManualMode("single");setLotDistributed(null);}} style={{flex:1,padding:"7px 12px",borderRadius:99,border:"none",fontSize:13,fontWeight:700,cursor:"pointer",background:manualMode==="single"?"#1B6E62":"transparent",color:manualMode==="single"?"#fff":"#6B7A75",transition:"all 0.15s",fontFamily:"inherit"}}>
              {lang==='fr'?"Article seul":"Single item"}
            </button>
            <button onClick={()=>setManualMode("lot")} style={{flex:1,padding:"7px 12px",borderRadius:99,border:"none",fontSize:13,fontWeight:700,cursor:"pointer",background:manualMode==="lot"?"#1B6E62":"transparent",color:manualMode==="lot"?"#fff":"#6B7A75",transition:"all 0.15s",fontFamily:"inherit"}}>
              Lot
            </button>
          </div>
          {manualMode==="single"&&(<>
          {items.length===0?(
            <div style={{textAlign:"center",padding:"6px 0 10px",animation:"fadeIn 0.4s ease"}}>
              <div style={{width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#0E7C5F,#34D399)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 12px",boxShadow:"0 4px 16px rgba(29,158,117,0.3)"}}>📦</div>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>{lang==='en'?'Add your first item':'Ajoute ton premier article'}</div>
              <div style={{fontSize:12,color:C.sub,lineHeight:1.6,maxWidth:220,margin:"0 auto"}}>{lang==='en'?'Name + buy price is enough to start tracking your profit.':'Nom + prix d\'achat suffit pour commencer à suivre tes marges.'}</div>
            </div>
          ):(
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>{t('ajouterTitre')}</div>
          )}
          <div>
            <Field label={t('fieldNom')} value={iTitle} set={setITitle} placeholder="Ex: Air Max 90, Jean slim, Lot vêtements..." icon="🏷️"/>
            {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>{t('fieldNomHint')}</div>}
          </div>
          <div>
            <Field label={lang==='fr'?"Quantité":"Quantity"} value={String(iQuantite)} set={v=>setIQuantite(Math.max(1,parseInt(v)||1))} placeholder="1" type="number" icon="🔢"/>
          </div>
          <div>
            <Field label={lang==='fr'?"Marque (optionnel)":"Brand (optional)"} value={iMarque} set={setIMarque} placeholder={lang==='en'?"Ex: Nike, Zara, H&M, Unbranded...":"Ex: Nike, Zara, H&M, Sans marque..."} icon="✏️"/>
          </div>
          <div>
            <select value={iType} onChange={e=>setIType(e.target.value)}
              style={{background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:14,padding:"0 16px",height:58,fontSize:15,fontWeight:600,color:iType?"#10201B":"#A3A9A6",width:"100%",cursor:"pointer",fontFamily:"inherit",outline:"none",appearance:"auto"}}>
              <option value="">{(iTitle||iMarque)?(lang==='fr'?`🤖 Détecté : ${detectType(iTitle,iMarque)}`:`🤖 Detected: ${typeLabel(detectType(iTitle,iMarque),lang)}`):(lang==='fr'?'🤖 Détection automatique':'🤖 Auto-detection')}</option>
              <option value="Mode">👗 {typeLabel('Mode',lang)}</option>
              <option value="High-Tech">📱 High-Tech</option>
              <option value="Maison">🏠 {typeLabel('Maison',lang)}</option>
              <option value="Électroménager">⚡ {typeLabel('Électroménager',lang)}</option>
              <option value="Jouets">🧸 {typeLabel('Jouets',lang)}</option>
              <option value="Livres">📚 {typeLabel('Livres',lang)}</option>
              <option value="Sport">⚽ Sport</option>
              <option value="Auto-Moto">🚗 {typeLabel('Auto-Moto',lang)}</option>
              <option value="Beauté">💄 {typeLabel('Beauté',lang)}</option>
              <option value="Musique">🎵 {typeLabel('Musique',lang)}</option>
              <option value="Collection">🏆 Collection</option>
              <option value="Multimédia">📺 {typeLabel('Multimédia',lang)}</option>
              <option value="Jardin">🌿 {typeLabel('Jardin',lang)}</option>
              <option value="Bricolage">🔧 {typeLabel('Bricolage',lang)}</option>
              <option value="Autre">📦 {typeLabel('Autre',lang)}</option>
            </select>
          </div>
          <div>
            <Field label={lang==='fr'?"Prix d'achat":"Purchase price"} value={iBuy} set={setIBuy} placeholder="0,00" type="number" icon="🛒" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
            {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>{lang==='fr'?"Prix auquel tu as acheté l'article":"Price you paid for the item"}</div>}
          </div>
          <div>
            <Field label={lang==='fr'?"Frais d'achat (optionnel)":"Purchase fees (optional)"} value={iPurchaseCosts} set={setIPurchaseCosts} placeholder={lang==='fr'?"Livraison fournisseur, réparation...":"Supplier shipping, repair..."} type="number" icon="🛍️" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
            {items.length===0&&<div style={{fontSize:11,color:C.label,marginTop:4,paddingLeft:4}}>{lang==='fr'?"Frais liés à l'achat : livraison, réparation...":"Purchase-side costs: shipping, repair..."}</div>}
          </div>
          <div>
            <label onClick={()=>setIAlreadySold(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"12px 14px",background:iAlreadySold?"#E7F3F0":"#F9FAFB",borderRadius:12,border:`1.5px solid ${iAlreadySold?"#1B6E62":"rgba(0,0,0,0.1)"}`,transition:"all 0.2s",userSelect:"none"}}>
              <div style={{width:36,height:20,borderRadius:10,background:iAlreadySold?"#1B6E62":"#D1D5DB",transition:"background 0.2s",position:"relative",flexShrink:0}}>
                <div style={{position:"absolute",top:2,left:iAlreadySold?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
              </div>
              <span style={{fontSize:13,fontWeight:700,color:iAlreadySold?"#1B6E62":"#6B7A75"}}>{lang==='fr'?'Déjà vendu ?':'Already sold?'}</span>
            </label>
          </div>
          {iAlreadySold&&(
            <>
              <div>
                <Field label={lang==='fr'?"Prix de vente":"Sell price"} value={iSell} set={setISell} placeholder="0,00" type="number" icon="💰" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
              </div>
              <div>
                <Field label={lang==='fr'?"Frais de vente (optionnel)":"Selling fees (optional)"} value={iSellingFees} set={setISellingFees} placeholder={lang==='fr'?"Commission Vinted, livraison client...":"Vinted fee, shipping to buyer..."} type="number" icon="📬" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
                <label style={{display:"flex",alignItems:"center",gap:8,marginTop:8,cursor:"pointer"}}>
                  <input type="checkbox" checked={iRememberSellingFees} onChange={e=>setIRememberSellingFees(e.target.checked)} style={{width:14,height:14,accentColor:C.teal,cursor:"pointer"}}/>
                  <span style={{fontSize:12,color:"#6B7A75",userSelect:"none"}}>{lang==='fr'?'Mémoriser ces frais de vente':'Remember selling fees'}</span>
                </label>
              </div>
            </>
          )}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:6}}>📝 {lang==='fr'?"Description (optionnel)":"Description (optional)"}</div>
            <textarea
              value={iDesc}
              onChange={e=>setIDesc(e.target.value.slice(0,200))}
              placeholder={lang==='fr'?"Ex: Lot de 3 pièces, taille M, état neuf...":"Ex: Bundle of 3, size M, brand new..."}
              maxLength={200}
              rows={2}
              style={{width:"100%",padding:"10px 14px",borderRadius:14,border:`1.5px solid ${iDesc?C.teal:"rgba(0,0,0,0.12)"}`,fontSize:13,color:C.text,fontFamily:"inherit",resize:"none",outline:"none",background:"#fff",transition:"border-color 0.15s",boxSizing:"border-box",lineHeight:1.5}}
              onFocus={e=>e.currentTarget.style.borderColor=C.teal}
              onBlur={e=>e.currentTarget.style.borderColor=iDesc?C.teal:"rgba(0,0,0,0.12)"}
            />
            <div style={{fontSize:10,color:C.label,textAlign:"right",marginTop:2}}>{iDesc.length}/200</div>
          </div>
          <div>
            <Field label={lang==='fr'?"Emplacement (optionnel)":"Storage location (optional)"} value={iEmplacement} set={setIEmplacement} placeholder={lang==='fr'?"Ex: Tiroir 45A, Portant 3, Étagère B...":"Ex: Drawer 45A, Rack 3, Shelf B..."} icon="📦"/>
          </div>
          <div>
            <Field label={lang==='fr'?"Plateforme de vente (optionnel)":"Resale platform (optional)"} value={iPlateforme} set={setIPlateforme} placeholder={lang==='fr'?"Ex: Vinted, eBay, Depop, Leboncoin...":"Ex: Vinted, eBay, Depop, Leboncoin..."} icon="🏪"/>
          </div>
          {items.length>0&&(
            <div style={{background:C.rowBg,borderRadius:10,padding:"10px 14px",fontSize:11,color:C.sub,border:"1px solid rgba(0,0,0,0.06)",lineHeight:1.6}}>
              💡 {t('prixHint')}
            </div>
          )}
          {!isPremium&&items.length>=18&&items.length<20&&(
            <div style={{background:"#FFFBEB",borderRadius:10,padding:"10px 14px",fontSize:11,color:"#92400E",border:"1px solid #FDE68A",fontWeight:600}}>
              ⚠️ {lang==='fr'?`${20-items.length} article${20-items.length>1?"s":""} restant${20-items.length>1?"s":""} sur ton plan gratuit`:`${20-items.length} item${20-items.length>1?"s":""} remaining on your free plan`}
            </div>
          )}
          {!isPremium&&items.length>=20&&!isNative
            ? <PremiumBanner userEmail={user?.email} onOpenModal={openUpgradeModal}/>
            : !isPremium&&items.length>=20&&isNative
            ? null
            : <button className="btn-pill-primary" onClick={addItem} disabled={!iTitle||!iBuy||(iAlreadySold&&!iSell)} style={{opacity:(!iTitle||!iBuy||(iAlreadySold&&!iSell))?0.5:1}}>
                {iSaved?(lang==='fr'?"✓ Ajouté !":"✓ Added!"):items.length===0?(lang==='fr'?"Ajoute ton premier article → vois ton bénéfice 🚀":"Add your first item → see your profit 🚀"):t('ajouterArticle')}
              </button>
          }
          {isNative&&!isPremium&&items.length>=20&&(
            <IAPUpgradeBlock lang={lang} iapProduct={iapProduct} iapLoading={iapLoading} onPurchase={openUpgradeModal} onRestore={handleIAPRestore}/>
          )}
          {items.length===0&&!iSaved&&!(iTitle&&iBuy)&&(
            <div style={{textAlign:"center",fontSize:12,color:C.label,marginTop:-4}}>
              {lang==='fr'?'Tu es à 1 étape de voir tes premiers profits 💰':'You are 1 step away from seeing your first profits 💰'}
            </div>
          )}
          {items.length===0&&!iSaved&&iTitle&&iBuy&&(
            <div style={{textAlign:"center",fontSize:12,color:C.teal,fontWeight:600,marginTop:-4}}>
              {lang==='fr'?'✓ Prêt ! Clique pour ajouter et voir ton bénéfice instantanément':'✓ Ready! Click to add and see your profit instantly'}
            </div>
          )}
          {firstItemAdded&&(
            <div style={{background:C.greenLight,borderRadius:10,padding:"10px 14px",fontSize:12,color:C.green,border:"1px solid #C6F6D5",fontWeight:600,textAlign:"center"}}>
              {lang==='fr'?'✅ Article ajouté ! Tu peux maintenant enregistrer une vente.':'✅ Item added! You can now record a sale.'}
            </div>
          )}
          </>)}
          {manualMode==="lot"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:6}}>🛍️ {lang==='fr'?"Prix total du lot (€)":"Total lot price (€)"}</div>
                <div className="inp" style={{background:"#fff",borderRadius:14,padding:"0 16px",height:58,border:lotManualTotal?`1px solid ${C.teal}55`:"1px solid rgba(0,0,0,0.08)",display:"flex",alignItems:"center",gap:12,boxShadow:lotManualTotal?`0 0 0 3px ${C.teal}11`:"0 2px 8px rgba(0,0,0,0.04)"}}>
                  <span style={{fontSize:20,flexShrink:0,opacity:0.7}}>💰</span>
                  <input type="number" value={lotManualTotal} onChange={e=>setLotManualTotal(e.target.value)} placeholder="0,00" inputMode="decimal" style={{background:"transparent",border:"none",outline:"none",color:C.text,fontSize:16,fontWeight:600,flex:1,fontFamily:"inherit"}}/>
                  <span style={{color:C.label,fontSize:13,fontWeight:600}}>€</span>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {lotManualItems.map((lotItem,i)=>(
                  <div key={i} style={{display:"flex",flexDirection:"column",gap:4}}>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <input value={lotItem.nom} onChange={e=>{const v=e.target.value;setLotManualItems(prev=>prev.map((it,idx)=>idx===i?{...it,nom:v}:it));setLotDistributed(null);}}
                        placeholder={lang==='fr'?`Article ${i+1}`:`Item ${i+1}`}
                        style={{flex:1,padding:"10px 14px",borderRadius:10,border:"1px solid rgba(0,0,0,0.1)",fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff",color:C.text,transition:"border-color 0.15s"}}
                        onFocus={e=>e.currentTarget.style.borderColor=C.teal}
                        onBlur={e=>e.currentTarget.style.borderColor="rgba(0,0,0,0.1)"}
                      />
                      {lotManualItems.length>2&&(
                        <button onClick={()=>{setLotManualItems(prev=>prev.filter((_,idx)=>idx!==i));setLotDistributed(null);}} style={{background:"#F3E6E3",color:"#B0645A",border:"1px solid #D9A69C",borderRadius:8,padding:"8px 10px",fontSize:13,cursor:"pointer",fontFamily:"inherit",flexShrink:0,lineHeight:1}}>×</button>
                      )}
                    </div>
                    {lotDistributed?.items?.[i]&&(
                      <div style={{display:"flex",alignItems:"center",gap:8,paddingLeft:4,animation:"fadeIn 0.3s ease"}}>
                        <input type="number" value={lotDistributed.items[i].prix_estime_lot} onChange={e=>{const v=parseFloat(e.target.value)||0;setLotDistributed(prev=>({...prev,items:prev.items.map((it,idx)=>idx===i?{...it,prix_estime_lot:v}:it)}));}} style={{width:64,border:"1px solid #CBD5E0",borderRadius:6,padding:"2px 6px",fontSize:16,fontFamily:"inherit",outline:"none",fontWeight:700,color:C.green}}/>
                        <span style={{fontSize:12,color:C.label}}>€</span>
                        {lotDistributed.items[i].categorie&&(()=>{const ts=getTypeStyle(lotDistributed.items[i].categorie);return <span style={{background:ts.bg,color:ts.color,border:`1px solid ${ts.border}`,borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700}}>{ts.emoji} {typeLabel(lotDistributed.items[i].categorie,lang)}</span>;})()}
                        {lotDistributed.items[i].marque&&<span style={{fontSize:11,color:"#6B7A75",fontWeight:600}}>{lotDistributed.items[i].marque}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={()=>{setLotManualItems(prev=>[...prev,{nom:""}]);setLotDistributed(null);}} style={{padding:"8px",background:"transparent",border:"1px dashed rgba(0,0,0,0.2)",borderRadius:10,fontSize:13,fontWeight:700,color:"#6B7A75",cursor:"pointer",fontFamily:"inherit",width:"100%",transition:"all 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="#F9FAFB"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}
              >+ {lang==='fr'?"Ajouter un article":"Add item"}</button>
              <button onClick={handleLotDistribute} disabled={lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())}
                style={{width:"100%",padding:"14px",background:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"#DCEEEA":"linear-gradient(120deg,#2F9E90,#1B6E62)",color:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"#8FB5AE":"#fff",border:"none",borderRadius:999,fontSize:14,fontWeight:600,cursor:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"not-allowed":"pointer",boxShadow:lotDistributing||!lotManualTotal||lotManualItems.some(it=>!it.nom.trim())?"none":"0 10px 24px -8px rgba(47,158,144,0.28)",transition:"all 0.2s",fontFamily:"inherit"}}>
                {lotDistributing?(lang==='fr'?"⏳ Répartition en cours...":"⏳ Distributing..."):(lang==='fr'?"✨ Répartir automatiquement":"✨ Auto distribute")}
              </button>
              {lotDistributed&&(
                <>
                  <div style={{fontSize:12,color:"#6B7A75",textAlign:"center",fontStyle:"italic"}}>{lang==='fr'?"Répartition estimée — modifiable":"Estimated split — editable"}</div>
                  <button onClick={addLotToInventory} style={{width:"100%",padding:"14px",background:"linear-gradient(120deg,#2F9E90,#1B6E62)",color:"#fff",border:"none",borderRadius:999,fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 10px 24px -8px rgba(47,158,144,0.28)",fontFamily:"inherit"}}>{lang==='fr'?"✓ Ajouter le lot à l'inventaire":"✓ Add lot to inventory"}</button>
                </>
              )}
            </div>
          )}
          </>)}
        </div>

        <div ref={listRef} className="stock-v2" style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:16}}>
          <style>{STOCK_CSS}</style>

          {/* ── Barre Import / Export ── */}
          {isPremium?(
            <div style={{background:"#fff",borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{flex:1,fontSize:13,fontWeight:700,color:C.text}}>{t('outilsPremium')}</div>
              <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={handleImportFile}/>
              <button onClick={()=>importRef.current?.click()} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:"#E7F3F0",color:"#1B6E62",border:"1px solid #2F9E9044",borderRadius:99,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap"}}
                onMouseEnter={e=>e.currentTarget.style.background="#DCEEEA"}
                onMouseLeave={e=>e.currentTarget.style.background="#E7F3F0"}
              >📥 {t('importer')}</button>
              <button onClick={handleExport} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:"#F2F0E9",color:"#6B7A75",border:"1px solid #E7E3D8",borderRadius:99,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap"}}
                onMouseEnter={e=>e.currentTarget.style.background="#EAE7DD"}
                onMouseLeave={e=>e.currentTarget.style.background="#F2F0E9"}
              >📤 {t('exporter')}</button>
              {importMsg&&<div style={{width:"100%",fontSize:12,color:C.green,fontWeight:600,marginTop:2}}>{importMsg}</div>}
            </div>
          ):(
            <div onClick={()=>{if(!isNative){track('premium_click',{source:'import_export'});openUpgradeModal();}}}
              style={{background:"linear-gradient(135deg,#1B6E6208,#E8956D08)",borderRadius:14,padding:"16px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:10,textAlign:"center",border:"1px solid rgba(232,149,109,0.22)",boxShadow:"0 2px 10px rgba(0,0,0,0.05)",cursor:!isNative?"pointer":"default"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#111827"}}>{t('importExcel')}</div>
              <div style={{fontSize:11,color:"#6B7A75",opacity:0.8,lineHeight:1.5}}>{t('importDesc')}</div>
              {!isNative&&<PremiumBanner userEmail={user?.email} compact/>}
            </div>
          )}

          {/* ── Barre de recherche + Filtres type ── */}
          <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:12,padding:"10px 16px"}}>
            <span style={{fontSize:14,flexShrink:0}}>🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder={lang==='fr'?"Rechercher...":"Search..."}
              style={{flex:1,border:"none",outline:"none",fontSize:14,background:"transparent",fontFamily:"inherit",color:"#10201B"}}/>
            {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#A3A9A6",flexShrink:0,padding:0,lineHeight:1}}>✕</button>}
          </div>
          {(()=>{
            // Basé uniquement sur stock (pas sold) : les pills de catégorie filtrent la
            // section EN STOCK ci-dessous (VENDUS est masqué dans Stock IA) — une catégorie
            // sans article en stock ne doit plus s'afficher, même si elle a des ventes passées.
            const presentTypes=["Tous","Mode","High-Tech","Maison","Électroménager","Jouets","Livres","Sport","Auto-Moto","Beauté","Musique","Collection","Multimédia","Jardin","Bricolage","Autre"].filter(tp=>tp==="Tous"||stock.some(i=>i.type===tp));
            return presentTypes.length>1&&(
              <div className="cat-filters">
                {presentTypes.map(tp=>{
                  const isActive=filterType===tp;
                  return(
                    <button key={tp} className={`fpill${isActive?" active":""}`} onClick={()=>setFilterType(tp)}>
                      <span className="fdot" style={{background:tp==="Tous"?"linear-gradient(155deg,#2F9E90,#1B6E62)":getCatTileColor(tp)}}/>
                      {tp==="Tous"?(lang==='en'?'All':'Tous'):typeLabel(tp,lang)}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* ── VENDUS — masqués dans Stock IA (visible dans Ventes) ── */}
          {false&&<div style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{fontSize:13,fontWeight:700,color:"#10201B"}}>{t('vendus')}</div>
                {isMobile&&(()=>{const _b=[...new Set(sold.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];return _b.length>0&&(<button onClick={()=>setPillsExpandedSold(v=>!v)} style={{padding:"3px 9px",borderRadius:99,fontSize:10,fontWeight:700,cursor:"pointer",border:"1px solid rgba(0,0,0,0.1)",background:"transparent",color:"#6B7A75",lineHeight:1.4,fontFamily:"inherit"}}>{pillsExpandedSold?`‹ ${lang==='en'?'Close':'Fermer'}`:`${lang==='en'?'Brands':'Marques'} (${_b.length}) ›`}</button>);})()}
              </div>
              <div style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{tpl('venteLabel',{n:soldQty??sold.length})}</div>
            </div>
            {(()=>{
              const _slAll=[...new Set(sold.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];
              const marquesFiltreesParType=["Toutes",..._slAll.filter(b=>b.toLowerCase()!=="sans marque"),..._slAll.filter(b=>b.toLowerCase()==="sans marque")];
              if(marquesFiltreesParType.length<=1) return null;
              const _mob=isMobile;
              const _open=!_mob||pillsExpandedSold;
              return(
                <div style={{marginBottom:12}}>
                  {!_open&&(
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>setFilterMarqueSold("Toutes")} style={{padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",background:filterMarqueSold==="Toutes"?"#1B6E62":"#F2F0E9",color:filterMarqueSold==="Toutes"?"#fff":"#6B7A75"}}>
                        {filterMarqueSold==="Toutes"?(lang==='en'?'All':'Toutes'):marqueLabel(filterMarqueSold,lang)}
                      </button>
                    </div>
                  )}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",maxHeight:_open?"300px":"0",overflow:"hidden",opacity:_open?1:0,transition:"max-height 0.25s ease, opacity 0.2s ease"}}>
                    {marquesFiltreesParType.map(m=>(
                      <button key={m} onClick={()=>setFilterMarqueSold(m)}
                        style={{padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",transition:"all 0.15s",
                          background:filterMarqueSold===m?"#1B6E62":"#F2F0E9",
                          color:filterMarqueSold===m?"#fff":"#6B7A75"}}>
                        {m==="Toutes"?(lang==='en'?'All':'Toutes'):marqueLabel(m,lang)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {sold.length===0?(
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",top:-6,right:0,background:"#F2F0E9",color:"#8A8578",fontSize:9,fontWeight:700,borderRadius:99,padding:"2px 8px",letterSpacing:"0.06em",textTransform:"uppercase",zIndex:2,border:"1px solid #E7E3D8"}}>
                  {lang==='en'?'Preview':'Exemple'}
                </span>
                <div style={{display:"flex",flexDirection:"column",gap:8,opacity:0.55,pointerEvents:"none",userSelect:"none"}}>
                  {SKELETON_SOLD.map((sk,i)=>{
                    const ts=getTypeStyle(sk.type);
                    return(
                      <div key={i} className="skeleton-item-row" style={{background:"#fff",borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",borderLeft:`3px solid ${getCatBorder(sk.type)}`}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <div style={{fontWeight:700,fontSize:14,color:"#10201B"}}>{sk.title}</div>
                            <span style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,border:"1px solid #BFE0D9"}}>{sk.marque}</span>
                            <span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(sk.type,lang)}</span>
                          </div>
                          <div style={{fontSize:11,color:"#A3A9A6",marginTop:2}}>{t('skeletonAchat')} {fmt(sk.buy)} → {t('skeletonVente')} {fmt(sk.sell)}</div>
                        </div>
                        <div style={{textAlign:"right",minWidth:90,flexShrink:0}}>
                          <div style={{fontWeight:700,fontSize:18,color:getMargeColor(sk.marginPct)}}>+{fmt(sk.margin)}</div>
                          <div style={{fontSize:11,color:"#6B7A75",marginTop:1}}>{Math.round(sk.marginPct)}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {soldVisible.map(item=>{
                  const mc=getMargeColor(item.marginPct);
                  const ts=getTypeStyle(item.type);
                  const qty=item.quantite||1;
                  return(
                    <SwipeRow key={item.id} onDelete={()=>delItem(item.id)} onEdit={()=>setEditItem({...item,frais:0,sell:item.sell??""})} style={{borderLeft:`3px solid ${getCatBorder(item.type)}`}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <div style={{fontWeight:700,fontSize:14,color:"#10201B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                          {qty>1&&<span style={{background:"#1B6E62",color:"#fff",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,flexShrink:0}}>×{qty}</span>}
                          {item.marque&&<span style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #BFE0D9"}}>{marqueLabel(item.marque,lang)}</span>}
                          {item.type&&item.type!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(item.type,lang)}</span>}
                          {item.plateforme&&<span style={{background:"#EDE9FE",color:"#7C3AED",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #C4B5FD"}}>🏪 {item.plateforme}</span>}
                        </div>
                        <div style={{fontSize:11,color:"#A3A9A6",marginTop:4}}>{lang==='fr'?'Achat':'Bought'} {fmt(item.buy+(item.purchaseCosts||0))} → {lang==='fr'?'Vente':'Sold'} {fmt((item.sell||0)*qty)}</div>
                      </div>
                      <div style={{textAlign:"right",minWidth:90,flexShrink:0}}>
                        <div style={{fontWeight:700,fontSize:18,color:mc}}>{fmt((item.margin||0)*qty)}</div>
                        <div style={{fontSize:11,color:"#6B7A75",marginTop:1}}>{fmtp(item.marginPct)}</div>
                      </div>
                    </SwipeRow>
                  );
                })}
                {soldFiltre.length>10&&!soldShowAll&&(
                  <button onClick={()=>setSoldShowAll(true)} style={{width:"100%",padding:"10px",background:"#F2F0E9",border:"none",borderRadius:10,fontSize:12,fontWeight:700,color:"#6B7A75",cursor:"pointer",marginTop:4}}>
                    {lang==='fr'?`Voir plus (${soldFiltre.length-10} articles)`:`Show more (${soldFiltre.length-10} items)`}
                  </button>
                )}
                <div style={{height:24}}/>
              </div>
            )}
          </div>}

          {/* ── EN STOCK ── */}
          <div style={{background:"#F6F5F1",borderRadius:16,padding:16,border:"1px solid #E7E3D8"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{fontSize:13,fontWeight:700,color:"#10201B"}}>{t('enStockLabel')}</div>
                {!isPremium&&items.length>=20&&<span style={{fontSize:10,fontWeight:700,background:"#FFF4EE",color:"#F9A26C",borderRadius:99,padding:"2px 8px",border:"1px solid #F9A26C44"}}>{lang==='fr'?'Plan gratuit':'Free plan'}</span>}
                {(()=>{const _b=[...new Set(stock.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];if(!_b.length)return null;return(<>{!pillsExpandedStock&&(<button onClick={()=>setFilterMarque("Toutes")} style={{padding:"4px 10px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",background:filterMarque==="Toutes"?"#1B6E62":"#F2F0E9",color:filterMarque==="Toutes"?"#fff":"#6B7A75"}}>{lang==='en'?'All':'Toutes'}</button>)}<button onClick={()=>setPillsExpandedStock(v=>!v)} style={{padding:"3px 9px",borderRadius:99,fontSize:10,fontWeight:700,cursor:"pointer",border:"1px solid rgba(0,0,0,0.1)",background:"transparent",color:"#6B7A75",lineHeight:1.4,fontFamily:"inherit"}}>{pillsExpandedStock?`‹ ${lang==='en'?'Close':'Fermer'}`:`${lang==='en'?'Brands':'Marques'} (${_b.length}) ›`}</button></>);})()}
              </div>
              {(()=>{
                // Reflète le filtre actif (catégorie/marque/recherche) au lieu du total global :
                // même formule que stockQty/stockVal (App.jsx) mais appliquée à stockFiltre.
                const _fQty=stockFiltre.reduce((a,i)=>a+(i.quantite||1),0);
                const _fVal=stockFiltre.reduce((a,i)=>a+i.buy*(i.quantite||1),0);
                return <div style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:20,padding:"4px 12px",fontSize:11,fontWeight:700}}>{_fQty} {lang==='fr'?'art.':'items'} · {fmt(_fVal)}</div>;
              })()}
            </div>
            {(()=>{
              const _sbAll=[...new Set(stock.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];
              const marquesStockFiltreesParType=["Toutes",..._sbAll.filter(b=>b.toLowerCase()!=="sans marque"),..._sbAll.filter(b=>b.toLowerCase()==="sans marque")];
              if(marquesStockFiltreesParType.length<=1) return null;
              const _open=pillsExpandedStock;
              return(
                <div style={{marginBottom:12}}>

                  <div style={{display:"flex",gap:6,flexWrap:"wrap",maxHeight:_open?"2000px":"0",overflow:"hidden",opacity:_open?1:0,transition:"max-height 0.3s ease, opacity 0.2s ease"}}>
                    {marquesStockFiltreesParType.map(m=>(
                      <button key={m} onClick={()=>setFilterMarque(m)}
                        style={{padding:"4px 12px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",transition:"all 0.15s",
                          background:filterMarque===m?"#1B6E62":"#F2F0E9",
                          color:filterMarque===m?"#fff":"#6B7A75"}}>
                        {m==="Toutes"?(lang==='en'?'All':'Toutes'):marqueLabel(m,lang)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {stock.length===0?(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>

                {/* 1. Bannière */}
                <div style={{background:"#F0FDFB",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(13,148,136,0.15)"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>
                        {lang==='fr'?'APERÇU DE TON FUTUR STOCK':'PREVIEW OF YOUR FUTURE STOCK'}
                      </div>
                      <div style={{fontSize:13,fontWeight:600,color:"#10201B",lineHeight:1.3,fontFamily:"inherit"}}>
                        {lang==='fr'?"L'IA classe tout automatiquement":"AI classifies everything automatically"}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,flexShrink:0}}>
                      <div style={{background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:10,padding:"8px 12px",textAlign:"center"}}>
                        <div style={{fontSize:17,fontWeight:700,color:"#10201B",lineHeight:1}}>{SKELETON_ITEMS.length}</div>
                        <div style={{fontSize:9,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.05em",marginTop:3}}>{lang==='fr'?'articles':'items'}</div>
                      </div>
                      <div style={{background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:10,padding:"8px 12px",textAlign:"center"}}>
                        <div style={{fontSize:17,fontWeight:700,color:"#F9A26C",lineHeight:1}}>{fmt(SKELETON_ITEMS.reduce((a,s)=>a+s.buy,0))}</div>
                        <div style={{fontSize:9,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.05em",marginTop:3}}>{lang==='fr'?'investi':'invested'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Séparateur */}
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,height:1,background:"rgba(0,0,0,0.08)"}}/>
                  <span style={{fontSize:11,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.07em",whiteSpace:"nowrap",flexShrink:0}}>
                    {lang==='fr'?"EXEMPLES D'ARTICLES EN STOCK":"EXAMPLE STOCK ITEMS"}
                  </span>
                  <div style={{flex:1,height:1,background:"rgba(0,0,0,0.08)"}}/>
                </div>

                {/* 3. Liste enrichie — badge EXEMPLE conservé */}
                <div style={{position:"relative"}}>
                  <span style={{position:"absolute",top:-6,right:0,background:"#F2F0E9",color:"#8A8578",fontSize:9,fontWeight:700,borderRadius:99,padding:"2px 8px",letterSpacing:"0.06em",textTransform:"uppercase",zIndex:2,border:"1px solid #E7E3D8"}}>
                    {lang==='en'?'Preview':'Exemple'}
                  </span>
                  <div style={{display:"flex",flexDirection:"column",gap:8,opacity:0.72,pointerEvents:"none",userSelect:"none"}}>
                    {[
                      {nom:"Veste Zara oversize",  marque:"Zara",    categorie:"Mode",       buy:12,  quantite:1,  description:"Taille M, noir, très bon état, acheté à Vide-grenier",                       emplacement:"Étagère salon"},
                      {nom:"Lot Pokémon",          marque:"Pokémon", categorie:"Collection", buy:8,   quantite:20, description:"Cartes communes + 2 rares, sous pochette, acheté à Brocante",                emplacement:"Boîte à cartes"},
                      {nom:"iPhone 12 64Go",       marque:"Apple",   categorie:"High-Tech",  buy:180, quantite:1,  description:"Écran fissuré, fonctionne parfaitement, acheté à Leboncoin",                  emplacement:"Portant 1"},
                      {nom:"Sac Kelly Hermès",     marque:"Hermès",  categorie:"Mode",       buy:125, quantite:1,  description:"Authentique, sangles légèrement usées, acheté à Dépôt-vente",                emplacement:"Vitrine luxe"},
                      {nom:"Jean Levis 501",       marque:"Levis",   categorie:"Mode",       buy:15,  quantite:1,  description:"Taille 32, bleu délavé, vintage 90s, acheté à Facebook Marketplace",          emplacement:"Étagère bureau"},
                    ].map((it,i)=>{
                      const {loc:_loc,rest:_desc}=parseLocDesc(it.description);
                      return(
                        <div key={i} className="row">
                          <div className={`cat-tile ${catClass(it.categorie)}`}>{detectObjectIcon(it.nom,it.description,it.categorie)}</div>
                          <div className="left">
                            <div className="title-line">
                              <span className="title">{it.nom}</span>
                              {it.marque&&(<><span className="brand-dot"/><span className="brandname">{it.marque}</span></>)}
                              {it.quantite>1&&<span className="qty-badge">×{it.quantite}</span>}
                            </div>
                            <div className="meta">
                              {(_desc||_loc)&&(<><span className="hl">{_desc||_loc}</span>{" · "}</>)}
                              {typeLabel(it.categorie,lang)}
                            </div>
                            {it.emplacement&&(
                              <div className="icons">
                                <div className="micon ic-loc">📦 {it.emplacement}</div>
                              </div>
                            )}
                          </div>
                          <div className="right">
                            <div className="price">{fmt(it.buy*(it.quantite||1))}<span className="lbl">{lang==='fr'?'investi':'invested'}</span></div>
                            <div className="btn-stack">
                              <div className="btn-publier">{lang==='fr'?'Publier':'Publish'}</div>
                              <div className="btn-vendre">{lang==='fr'?'Vendre':'Sell'}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. CTA */}
                <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:4}}>
                  <button
                    onClick={()=>scrollRef.current?.scrollTo({top:0,behavior:"smooth"})}
                    style={{width:"100%",padding:"14px",background:"linear-gradient(120deg,#2F9E90,#1B6E62)",color:"#fff",border:"none",borderRadius:999,fontSize:14,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit",boxShadow:"0 10px 24px -8px rgba(47,158,144,0.28)"}}
                    onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"}
                    onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
                    onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
                  >
                    🎙️ {lang==='fr'?'Ajouter avec la voix':'Add with voice'}
                  </button>
                  <button
                    onClick={()=>{setShowManualForm(true);scrollRef.current?.scrollTo({top:0,behavior:"smooth"});}}
                    style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#6B7A75",padding:"4px",fontFamily:"inherit",textDecoration:"underline",textDecorationColor:"rgba(107,114,128,0.35)"}}
                  >
                    + {lang==='fr'?'Ajouter manuellement':'Add manually'}
                  </button>
                </div>

              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {stockVisible.map(item=>{
                  const {loc:_itemLoc,rest:_itemDesc}=parseLocDesc(item.description);
                  const invested=item.buy*(item.quantite||1)+(item.purchaseCosts||0);
                  const jobsAll=jobsByInventaire[item.id]||[];
                  // Les jobs de retrait ciblé (action='delete') vivent à part :
                  // mélangés aux publish, un delete pending affichait « En
                  // cours… » (dépôt) et un delete failed un badge « Échec » de
                  // publication — deux mensonges.
                  const jobs=jobsAll.filter(j=>j.action!=="delete");
                  // "processing" = publication en cours côté extension : même
                  // affichage « En cours… » que pending (pour le vendeur, c'est
                  // le même moment ; la nuance est purement interne).
                  const hasPending=jobs.some(j=>j.status==="pending"||j.status==="processing");
                  // Job en attente sur une plateforme EN PAUSE (maintenance) :
                  // badge dédié « reprise auto » plutôt que le simple « En cours ».
                  const hasPausedPending=jobs.some(j=>(j.status==="pending"||j.status==="processing")&&pausedSet.has(j.platform));
                  // Échec = le job LE PLUS RÉCENT de la plateforme est "failed"
                  // (2026-07-19). Pas « il existe un job failed » : après une
                  // régénération, le nouveau job pending/published de la même
                  // plateforme doit ÉTEINDRE le badge — seul l'état courant
                  // compte. À l'inverse, un échec de REPUBLICATION coexiste
                  // avec la pastille published de l'ancienne annonce toujours
                  // en ligne : les deux sont vrais, les deux s'affichent.
                  const latestByPlatform={};
                  for(const j of jobs){
                    const cur=latestByPlatform[j.platform];
                    if(!cur||Date.parse(j.created_at||0)>Date.parse(cur.created_at||0)) latestByPlatform[j.platform]=j;
                  }
                  const failedJobs=Object.values(latestByPlatform).filter(j=>j.status==="failed");
                  // « À compléter » (socle needs_user, 2026-07-19) : même règle
                  // que l'Échec — seul le job LE PLUS RÉCENT de la plateforme
                  // compte. Dès que le job repart en pending (valeur fournie)
                  // ou se conclut (published/failed), le badge s'éteint.
                  const needsUserJobs=Object.values(latestByPlatform).filter(j=>j.status==="needs_user");
                  // État de retrait par plateforme : calcul partagé avec le
                  // modal de retrait (computeRemovalInfo, en tête de fichier) —
                  // un seul calcul, jamais deux vérités carte/modal.
                  const {removalState,publishedActive}=computeRemovalInfo(jobsAll);
                  const enLigne=publishedActive.length>0;
                  const openEdit=()=>setEditItem({...item,frais:0,sell:item.sell??""});
                  return(
                    // Swipe gauche = supprimer (conservé) ; tap sur la carte = éditer.
                    <SwipeRow key={item.id} onDelete={()=>delItem(item.id)} style={{borderRadius:16,border:"1px solid #E7E3D8",boxShadow:"none"}}>
                      {/* Tap sur la carte = éditer (l'icône crayon a été retirée le
                          2026-07-14 : toute la ligne est cliquable, l'affordance
                          était redondante et venait coller le prix). */}
                      <div className="row in-swipe" onClick={openEdit}>
                        <div className={`cat-tile ${catClass(item.type)}`}>{detectObjectIcon(item.title,item.description,item.type)}</div>
                        <div className="left">
                          <div className="title-line">
                            <span className="title">{item.title}</span>
                            {item.marque&&(<><span className="brand-dot"/><span className="brandname">{marqueLabel(item.marque,lang)}</span></>)}
                            {(item.quantite||1)>1&&<span className="qty-badge">×{item.quantite}</span>}
                          </div>
                          <div className="meta">
                            {(_itemDesc||_itemLoc)&&(<><span className="hl">{_itemDesc||_itemLoc}</span>{" · "}</>)}
                            {typeLabel(item.type||"Autre",lang)}
                          </div>
                          {(enLigne||hasPending||failedJobs.length>0||needsUserJobs.length>0||item.plateforme||item.emplacement)&&(
                            <div className="icons">
                              {/* Statut explicite : les pastilles de plateformes disaient OÙ,
                                  jamais QUE l'article est en ligne — d'où la confusion avec
                                  un article jamais publié. */}
                              {enLigne&&<div className="micon ic-online"><span className="dot"/>{lang==="en"?"Live":"En ligne"}</div>}
                              {/* LOGOS, pas les noms écrits : « Leboncoin » + « Beebs » en
                                  toutes lettres débordaient la carte en largeur mobile, quel
                                  que soit le CSS. Un logo carré de 18 px règle le problème à
                                  la racine. title= garde le nom accessible au survol/lecteur
                                  d'écran. */}
                              {/* Cliquables (retrait ciblé, 2026-07-19) : tap sur UN
                                  logo → RemovePlatformsModal (toutes les plateformes,
                                  action de retrait par ligne, confirmation inline).
                                  stopPropagation : ne pas ouvrir l'édition.
                                  Estompé = retrait en cours. */}
                              {publishedActive.map(p=>{
                                const removing=removalState[p]==="removing";
                                return(
                                  <span key={p} className="plogo"
                                    title={removing?(lang==="en"?`Removing from ${PLATFORM_LABELS[p]||p}…`:`Retrait de ${PLATFORM_LABELS[p]||p} en cours…`):(lang==="en"?`${PLATFORM_LABELS[p]||p} — tap to manage`:`${PLATFORM_LABELS[p]||p} — toucher pour gérer`)}
                                    style={{cursor:"pointer",...(removing?{opacity:.35}:{})}}
                                    onClick={e=>{e.stopPropagation();setRemoveModalItem(item);}}>
                                    <PlatformLogo platform={p} size={18}/>
                                  </span>
                                );
                              })}
                              {hasPending&&!hasPausedPending&&(
                                <div
                                  className="micon ic-pending"
                                  role="button"
                                  tabIndex={0}
                                  title={lang==="en"?"See status":"Voir le statut"}
                                  onClick={e=>{e.stopPropagation();setJobStatusItem(item);}}
                                  onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.stopPropagation();setJobStatusItem(item);}}}
                                  style={{cursor:"pointer"}}
                                >
                                  ⏳ {lang==="en"?"Posting…":"En cours…"}
                                </div>
                              )}
                              {/* Maintenance (Phase B) : plateforme en pause,
                                  ton neutre, rassurant, aucune action requise. */}
                              {hasPausedPending&&<div className="micon" style={{background:"#EFF3F8",border:"1px solid #C7D6E5",color:"#334155"}}>⏸ {t("stockJobPausedBadge")}</div>}
                              {/* Échec explicite par plateforme (2026-07-19) : le message
                                  d'erreur complet (déjà humanisé côté extension) est porté
                                  par title= (survol desktop / lecteur d'écran) et par un
                                  tap → alert (mobile n'a pas de survol). stopPropagation :
                                  le tap sur le badge ne doit pas ouvrir l'édition. */}
                              {/* « ✋ À compléter » (socle needs_user, 2026-07-19) :
                                  un champ précis attend la décision de l'utilisateur.
                                  Ambre (action attendue), PAS rouge (ce n'est pas un
                                  échec définitif). Tap → mini-éditeur DANS l'app :
                                  jamais de renvoi vers la plateforme externe. */}
                              {needsUserJobs.map(j=>(
                                <div
                                  key={"nu-"+j.platform}
                                  className="micon"
                                  title={j.error||undefined}
                                  onClick={e=>{
                                    e.stopPropagation();
                                    if(j.platform_fields?.needsUserField){setNeedsUserJob(j);}
                                    else if(j.error){window.alert(`${PLATFORM_LABELS[j.platform]||j.platform} — ${j.error}`);}
                                  }}
                                  style={{background:"#FFF6E3",border:"1px solid #EED9A6",color:"#8A6100",cursor:"pointer"}}
                                >
                                  ✋ {lang==="en"?"Action needed":"À compléter"} {PLATFORM_LABELS[j.platform]||j.platform}
                                </div>
                              ))}
                              {failedJobs.map(j=>(
                                <div
                                  key={"fail-"+j.platform}
                                  className="micon"
                                  title={j.error||undefined}
                                  onClick={e=>{e.stopPropagation();if(j.error)window.alert(`${PLATFORM_LABELS[j.platform]||j.platform} — ${j.error}`);}}
                                  style={{background:"#FBEDEC",border:"1px solid #EFC2BE",color:"#8C2F28",cursor:j.error?"pointer":"default"}}
                                >
                                  ⚠️ {lang==="en"?"Failed":"Échec"} {PLATFORM_LABELS[j.platform]||j.platform}
                                </div>
                              ))}
                              {!enLigne&&!hasPending&&item.plateforme&&<div className="micon ic-plateforme">🏪 {item.plateforme}</div>}
                              {item.emplacement&&<div className="micon ic-loc">📦 {item.emplacement}</div>}
                            </div>
                          )}
                        </div>
                        <div className="right">
                          <div className="price">{fmt(invested)}<span className="lbl">{lang==='fr'?'investi':'invested'}</span></div>
                          <div className="btn-stack">
                            {/* Déjà en ligne : le bouton reste (on peut vouloir ajouter une
                                plateforme) mais il ne dit plus « Publier » — il disait à
                                l'utilisateur qu'il RESTAIT quelque chose à faire, alors que
                                l'annonce était en ligne. */}
                            {isPro&&(
                              <button className={enLigne?"btn-publier is-online":"btn-publier"} onClick={e=>{e.stopPropagation();if(shouldShowExtensionReminder()){setExtReminderItem(item);}else{ouvrirStepper(item);}}}>
                                {enLigne?(lang==='fr'?'Republier':'Republish'):(lang==='fr'?'Publier':'Publish')}
                              </button>
                            )}
                            <button className="btn-vendre" onClick={e=>{e.stopPropagation();markSold(item);}}>
                              {lang==='fr'?'Vendre':'Sell'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </SwipeRow>
                  );})}
                {stockFiltre.length>10&&!showAllStock&&(
                  <button onClick={()=>setShowAllStock(true)} style={{width:"100%",padding:"10px",background:"#F2F0E9",border:"none",borderRadius:10,fontSize:12,fontWeight:700,color:"#6B7A75",cursor:"pointer",marginTop:4}}>
                    {lang==='fr'?`Voir plus (${stockFiltre.length-10} articles)`:`Show more (${stockFiltre.length-10} items)`}
                  </button>
                )}
                <div style={{height:24}}/>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* initialListing depuis la ligne inventaire : sans lui, platformSupport
          calculait detectObjectIcon(undefined) → 📦 → 4 plateformes "unmapped",
          chips grisées et CTA "Générer" mort (bug du 2026-07-11). Mêmes clés que
          le lensResult du flux Lens ; les champs Lens absents (prix_vente_suggere,
          taille_estimee, etat_estime…) restent undefined → les fallbacks invId du
          stepper (prix DB…) s'appliquent comme avant. initialPhotos : photos déjà
          connues de l'article (format inventaire.photos [{type,url}], mêmes
          fallbacks que la relecture cross_post_jobs du stepper) — vide → étape
          upload comme avant. */}
      {extReminderItem&&(
        <ExtensionReminderModal
          lang={lang}
          onClose={()=>setExtReminderItem(null)}
          onContinue={()=>{const it=extReminderItem;setExtReminderItem(null);ouvrirStepper(it);}}
        />
      )}
      {/* Mini-éditeur « À compléter » (socle needs_user, 2026-07-19).
          Fermeture sans valider → aucun écrit, le job reste needs_user et le
          badge reste. Après validation : patch LOCAL immédiat (le badge
          s'éteint sans attendre le poll de 20 s), la relecture périodique
          confirme ensuite l'état réel. */}
      {needsUserJob&&(
        <NeedsUserModal
          job={needsUserJob}
          lang={lang}
          onClose={()=>setNeedsUserJob(null)}
          onDone={(jobId)=>{
            setNeedsUserJob(null);
            if(jobId){
              setJobsByInventaire(prev=>{
                const next={};
                for(const [inv,list] of Object.entries(prev)){
                  next[inv]=list.map(j=>j.id===jobId?{...j,status:"pending",error:null}:j);
                }
                return next;
              });
            }
          }}
        />
      )}
      {/* Modal de retrait ciblé (2026-07-19). jobsAll relu à CHAQUE rendu
          depuis jobsByInventaire : le patch local post-insert et le poll de
          20 s font vivre les lignes (En ligne → Retrait en cours… → Retirée)
          pendant que le modal est ouvert. Fermeture = aucune action. */}
      {removeModalItem&&(
        <RemovePlatformsModal
          item={removeModalItem}
          jobsAll={jobsByInventaire[removeModalItem.id]||[]}
          lang={lang}
          busyPlatform={removeBusy}
          onClose={()=>setRemoveModalItem(null)}
          onRemove={armRemoveJob}
        />
      )}
      {jobStatusItem&&(
        <JobStatusModal
          item={jobStatusItem}
          jobs={(jobsByInventaire[jobStatusItem.id]||[]).filter(j=>j.action!=="delete")}
          lang={lang}
          pausedSet={pausedSet}
          extensionStatus={extensionStatus}
          onClose={()=>setJobStatusItem(null)}
        />
      )}
      {publishItem&&(
        <ListingPreviewScreen
          inventaireId={publishItem.id}
          userId={user.id}
          initialPhotos={(Array.isArray(publishItem.photos)?publishItem.photos:[])
            .map(p=>p?.url||p?.original||p?.enhanced||p?.bg_removed)
            .filter(Boolean)}
          initialListing={{
            titre:       publishItem.titre       ?? null,
            description: publishItem.description ?? null,
            categorie:   publishItem.type        ?? null,
            marque:      publishItem.marque      ?? null,
            // Prix connu de la ligne inventaire (2026-07-13, job 3d194668) :
            // pré-remplissage SYNCHRONE de la carte — le fallback DB du
            // stepper existe mais arrive en async, et surtout il ne couvre
            // pas ce que la ligne sait déjà. prix_vente est désormais tenu à
            // jour à chaque publication (fix bd9a516).
            prix_vente_suggere: publishItem.prix_vente ?? publishItem.prix_achat ?? null,
          }}
          onClose={()=>{clearStepperPersistence();setPublishItem(null);onStepperOpenChange?.(false);}}
          supabase={supabase}
          lang={lang}
          isPremium={isPremium}
          isPro={isPro}
          onUpgrade={openUpgradeModal}
        />
      )}
    </>
  );
});

export default StockTab;
