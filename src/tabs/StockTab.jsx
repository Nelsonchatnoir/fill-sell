import { memo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../i18n/useTranslation';
import { useIsMobile } from '../hooks/useIsMobile';
import { track } from '../analytics/analytics';
import Field from '../components/Field';
import SwipeRow from '../components/SwipeRow';
import ListingPreviewScreen, { PLATFORM_LABELS, AspectValueInput, clearStepperPersistence, readStepperHost, writeStepperHost, isRetouchedPhotoEntry } from '../components/ListingPreviewScreen';
import { FREE_STOCK_LIMIT_FALLBACK, compteArticlesQuota } from '../utils/stockLimit';
import ExtensionReminderModal, { shouldShowExtensionReminder } from '../components/ExtensionReminderModal';
import ExtensionPitchScreen from '../components/ExtensionPitchScreen';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { computeRemovalInfo } from '../utils/publicationState';
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
  PLATFORM_LOGIN_URLS, LBC_DEPOSIT_URL, humanizeJobError,
} from '../utils/shared';
import { prixAchatConnu, prixAchatNum, totalInvesti } from '../utils/comptabilite';
import { SecondaryButton, Loader } from '../components/ui';
import {
  EXT_SONDE_MS, SYNC_POLL_MS, SYNC_POLL_MAX_MS, SYNC_DEMARRAGE_MAX_MS,
  ecouterPresenceExtension, demanderSyncDressing, syncDressingVisiblePour,
  versionAuMoins, SYNC_VERSION_MIN, SYNC_CADENCE_MANUELLE_MS,
  lireDernierRunDressing, aDejaSynchroniseDressing,
  DETAIL_VERSION_MIN, demanderDetailArticleVinted, ecouterDetailArticleVinted,
  republishVisiblePour, republierArticleVinted, relancerRepublishVinted,
} from '../utils/vintedSync';

// ── Échecs actionnables (chantier onboarding 2026-07-27) ──────────────────────
// Les erreurs « connexion requise » et « brouillon LBC en cours » portent déjà
// la marche à suivre (messages humanisés côté extension) — mais elles étaient
// enfermées dans un window.alert sans lien. On y accroche l'action directe.
const CONN_ERR_RE = /connexion|se connecter|login|sign[- ]?in|identifi/i;
const DRAFT_LBC_RE = /brouillon/i;
function failJobAction(job, lang) {
  const err = job?.error || '';
  if (job?.platform === 'leboncoin' && DRAFT_LBC_RE.test(err)) {
    return { url: LBC_DEPOSIT_URL, label: lang === 'en' ? 'Open the Leboncoin draft' : 'Ouvrir le brouillon Leboncoin' };
  }
  if (CONN_ERR_RE.test(err) && PLATFORM_LOGIN_URLS[job?.platform]) {
    const name = PLATFORM_LABELS[job.platform] || job.platform;
    return { url: PLATFORM_LOGIN_URLS[job.platform], label: lang === 'en' ? `Sign in to ${name}` : `Se connecter à ${name}` };
  }
  return null;
}

// ── Design 2026 (Lens / navbar) — liste des articles en stock ──
// Maquette validée : row grid [tuile | infos | prix+actions], palette canvas/paper.
// CSS partagé avec VentesTab via buildCardCss (src/utils/shared.js).
// Les classes pa-* reprennent le langage visuel de la complétion de VentesTab
// (invitation teal, jamais une alerte) — mêmes valeurs, scope stock-v2.
const STOCK_CSS = buildCardCss('stock-v2') + `
.stock-v2 .pa-call{width:100%;display:flex;align-items:center;gap:11px;text-align:left;padding:11px 14px;border-radius:14px;cursor:pointer;font-family:inherit;background:rgba(47,158,144,.08);border:1px solid rgba(47,158,144,.28);color:#10201B;margin-bottom:12px;}
.stock-v2 .pa-call.on{background:linear-gradient(120deg,#2F9E90,#1B6E62);border-color:transparent;color:#fff;box-shadow:0 10px 22px -12px rgba(47,158,144,.55);}
.stock-v2 .pa-call .n{display:block;font-size:13.5px;font-weight:700;line-height:1.25;}
.stock-v2 .pa-call .sub{display:block;font-size:11px;font-weight:500;color:#6B7A75;margin-top:2px;line-height:1.3;}
.stock-v2 .pa-call.on .sub{color:rgba(255,255,255,.88);}
.stock-v2 .pa-line{display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap;}
.stock-v2 .pa-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;border:1px dashed rgba(47,158,144,.55);background:rgba(47,158,144,.07);color:#1B6E62;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;}
.stock-v2 .pa-input{width:82px;padding:5px 8px;border-radius:9px;border:1px solid #2F9E90;background:#fff;font-family:inherit;font-size:12.5px;font-weight:700;color:#10201B;outline:none;}
.stock-v2 .pa-ok{border:none;background:#2F9E90;color:#fff;border-radius:9px;padding:5px 9px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;line-height:1.2;}
.stock-v2 .pa-hint{font-size:9.5px;color:#8A8578;}
.stock-v2 .pa-err{font-size:10.5px;color:#B0645A;font-weight:600;}
.stock-v2 .pa-check{width:17px;height:17px;accent-color:#2F9E90;flex-shrink:0;cursor:pointer;margin:0;}
.stock-v2 .pa-ghost{border:1px solid #E7E3D8;background:#fff;color:#6B7A75;border-radius:999px;padding:4px 9px;font-size:10.5px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;}
.stock-v2 .pa-bar{position:sticky;top:0;z-index:6;background:#fff;border:1px solid #2F9E90;border-radius:14px;padding:10px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;box-shadow:0 10px 24px -14px rgba(16,32,27,.45);margin-bottom:12px;}
.stock-v2 .pa-bar .lbl{font-size:12px;font-weight:700;color:#10201B;}
.stock-v2 .pa-bar .apply{border:none;background:linear-gradient(120deg,#2F9E90,#1B6E62);color:#fff;border-radius:999px;padding:7px 13px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;}
.stock-v2 .pa-bar button:disabled{opacity:.45;cursor:default;}
`;

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

  // ── Filet symétrique pour Beebs / Vinted / Leboncoin (2026-07-22) ──────────
  // Le filet ci-dessus n'existait QUE pour eBay : les 3 autres plateformes
  // n'avaient aucun recours quand le job arrivait sans allowed_values, alors
  // que le catalogue cumulatif platform_category_aspects porte exactement cette
  // information — apprise lors des publications précédentes dans la même
  // catégorie. On la relit donc ici, best-effort : un job passé AVANT que la
  // catégorie ne soit cataloguée profite du relevé fait depuis.
  // La clé de catégorie est le chemin joint par " > ", même convention que
  // celle écrite par le background (categoryKeyOf).
  const [catalogueAllowed, setCatalogueAllowed] = useState(null);
  useEffect(() => {
    let alive = true;
    const pf = job.platform_fields ?? {};
    // ⚠️ MÊME ORDRE que categoryKeyOf (background.js:4061) : une clé calculée
    // différemment ne retrouverait tout simplement jamais la ligne écrite.
    const chemin = pf.categoryPath ?? pf.beebsCategoryPath ?? pf.lbcCategoryPath ?? null;
    const categoryKey = Array.isArray(chemin) ? chemin.join(" > ") : null;
    if (job.platform === "ebay" || !f || (Array.isArray(f.allowed_values) && f.allowed_values.length) || !categoryKey) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("platform_category_aspects")
          .select("allowed_values")
          .eq("platform", job.platform)
          .eq("category_key", categoryKey.slice(0, 300))
          .eq("field_key", String(f.field_key).slice(0, 120))
          .maybeSingle();
        const vals = Array.isArray(data?.allowed_values)
          ? data.allowed_values.filter(Boolean).map(String)
          : [];
        if (alive && vals.length) setCatalogueAllowed(vals);
      } catch { /* best-effort : on retombe sur le message « valeurs indisponibles » */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  if (!f) return null;

  const allowed = Array.isArray(f.allowed_values) && f.allowed_values.length
    ? f.allowed_values
    : (ebayAllowed ?? catalogueAllowed);
  const platformLabel = PLATFORM_LABELS[job.platform] || job.platform;

  // ── RÈGLE DU 19/07 RENDUE INCONTOURNABLE (2026-07-22) ──────────────────────
  // Un champ FERMÉ côté plateforme ne doit JAMAIS devenir une saisie libre ici.
  // Jusqu'ici la règle reposait sur une hypothèse fausse : « si le champ est
  // obligatoire, on finira par connaître ses valeurs ». Quand le relevé
  // échouait, allowed_values arrivait vide et on retombait sur du texte —
  // exactement ce que le principe interdit. Cas réel : robe Camaïeu, « Taille »
  // en input libre alors que Beebs n'accepte qu'une valeur de SA liste (les
  // listes longues à barre de recherche n'étaient jamais cataloguées).
  // Ce qu'on tape dans ce cas ne peut QUE repartir en échec : on demande donc
  // un effort à l'utilisateur pour un résultat impossible. Mieux vaut le dire.
  // ⚠️ Ne bloque QUE les champs explicitement déclarés fermés par le handler.
  // Un champ sans input_type garde le comportement historique (saisie texte
  // assistée) : les aspects eBay LIBRES (référence fabricant, dimensions…)
  // doivent rester saisissables, et un job d'avant ce correctif ne porte pas
  // la clé — on ne bloque jamais sur une absence d'information.
  const CLOSED_INPUT_TYPES = new Set(["dropdown", "select", "radio", "selection_only"]);
  const champFerme = CLOSED_INPUT_TYPES.has(String(f.input_type ?? "").toLowerCase());
  const valeursIndisponibles = champFerme && !(allowed?.length);

  // `sansValeur` (2026-07-22) : relance SANS rien écrire, pour le cas
  // « valeurs indisponibles ». Le job repart en pending avec un budget de
  // re-tentatives neuf — le prochain passage relève la liste (cf. capture des
  // panneaux à barre de recherche) et proposera enfin les vrais choix.
  const valider = async ({ sansValeur = false } = {}) => {
    if (saving) return;
    const v = String(value ?? "").trim();
    if (!v && !sansValeur) return;
    setSaving(true); setErrMsg(null);
    try {
      const pf = job.platform_fields ?? {};
      const target = (f.target && f.target.key)
        ? f.target
        : { root: NU_CHANNEL_BY_PLATFORM[job.platform] ?? null, key: f.field_key };
      const newPf = { ...pf, needsUserAttempts: 0 };
      delete newPf.needsUserField;
      if (!sansValeur) {
        if (target.root) newPf[target.root] = { ...(pf[target.root] ?? {}), [target.key]: v };
        else newPf[target.key] = v;
      }
      // Trace persistante « tranché par l'utilisateur » (2026-07-19, boucle
      // needs_user État/Beauté) : les handlers ont des gardes légitimes
      // « déjà rempli → conservé » (pré-remplissage eBay, valeur d'origine du
      // job) qui, sans ce marqueur, écartaient silencieusement la réponse.
      // Clé = cible d'écriture ("ebayAspects.Matière", "vintedAspects.condition",
      // "etat"…) ; cumulatif : chaque champ tranché reste marqué pour tous les
      // essais suivants. Les handlers font TOUJOURS primer une valeur marquée.
      // Rien à marquer quand on relance sans valeur : l'utilisateur n'a tranché
      // aucun champ, poser un needsUserResolved vide ferait primer une chaîne
      // vide sur la valeur d'origine du job dans les handlers.
      if (!sansValeur) {
        const resolvedKey = target.root ? `${target.root}.${target.key}` : String(target.key);
        newPf.needsUserResolved = { ...(pf.needsUserResolved ?? {}), [resolvedKey]: v };
      }
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
          {valeursIndisponibles
            ? (lang === "en"
              ? `${platformLabel} only accepts values from its own list for this field, and we could not read that list during the last attempt.`
              : `${platformLabel} n'accepte que des valeurs de sa propre liste pour ce champ, et nous n'avons pas réussi à lire cette liste au dernier passage.`)
            : (lang === "en"
              ? `${platformLabel} requires this field for this category. Pick a value — the listing will then resume automatically, nothing to do on ${platformLabel}.`
              : `${platformLabel} exige ce champ pour cette catégorie. Choisis une valeur — la publication repartira automatiquement, rien à faire sur ${platformLabel}.`)}
        </div>
        {valeursIndisponibles ? (
          <div style={{ fontSize:12.5, lineHeight:1.55, color:"#8A6100", background:"#FDF6E3", border:"1px solid #EBD9A8", borderRadius:12, padding:"11px 12px" }}>
            {lang === "en"
              ? "Values unavailable — a new attempt is needed. Typing free text here would be rejected by the platform, so we don't offer it. Relaunch the publication: the next attempt reads the list and will offer you the real choices."
              : "Valeurs indisponibles — une relance est nécessaire. Une saisie libre serait refusée par la plateforme, on ne te la propose donc pas. Relance la publication : le prochain passage lit la liste et te proposera les vrais choix."}
          </div>
        ) : (
          /* strict (2026-07-29, doctrine « une liste relevée est une
             SUGGESTION ») : le SELECT FERMÉ n'est plus imposé dès qu'on a une
             liste. Ces valeurs viennent d'un RELEVÉ (options du panneau, ou
             catalogue platform_category_aspects) qui peut être PARTIEL — cas
             prod du 29/07 : Beebs/Marque coupée à « Amisu », donc « Volcom »
             introuvable dans le select et l'utilisateur enfermé, sans aucun
             moyen de trancher le champ que ce modal existe précisément pour
             trancher. strict=false laisse AspectValueInput ajouter l'issue
             « Autre valeur… ». La liste reste proposée en premier : c'est une
             aide à la saisie, pas une barrière.
             La divergence assumée du 19/07 avec le stepper (« ici le select est
             FERMÉ ») tombe donc : ce qu'elle protégeait — ne pas envoyer une
             valeur que la plateforme refusera — ne vaut que si notre relevé est
             complet, et il ne l'est pas. */
          <AspectValueInput
            value={value}
            allowedValues={allowed ?? []}
            strict={false}
            onChange={setValue}
            T={NU_T}
            idBase={`nu-${job.id}`}
          />
        )}
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
            onClick={() => valider({ sansValeur: valeursIndisponibles })}
            disabled={saving || (!valeursIndisponibles && !String(value ?? "").trim())}
            style={{ flex:1.4, padding:"10px 0", borderRadius:12, border:"none", background: saving || (!valeursIndisponibles && !String(value ?? "").trim()) ? "#B9C4C0" : "#1B6E62", color:"#fff", fontSize:13, fontWeight:700, cursor: saving ? "wait" : "pointer", fontFamily:"inherit" }}
          >
            {saving
              ? (lang === "en" ? "Saving…" : "Enregistrement…")
              : valeursIndisponibles
                ? (lang === "en" ? "Retry publication" : "Relancer la publication")
                : (lang === "en" ? "Confirm & resume" : "Valider et relancer")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Retrait ciblé : état de retrait par plateforme ───────────────────────────
// computeRemovalInfo vit dans utils/publicationState.js depuis le 2026-07-25
// (S7) : le stepper en a besoin aussi, et l'importer depuis StockTab aurait
// créé un cycle (StockTab importe déjà ListingPreviewScreen).
const RM_PLATFORMS = ["vinted", "leboncoin", "beebs", "ebay"];

// ── listing_url manquant : transitoire ou définitif ? (2026-07-27) ───────────
// L'extension re-capture les listing_url manquants à chaque cycle de poll via
// « Mes annonces » (recoverMissingListingUrls, background.js) : plateformes
// leboncoin/beebs/ebay, fenêtre de 48 h après le dépôt, titre requis. Rien
// n'est écrit en base quand une tentative échoue — le seul signal fiable côté
// app est donc dérivé : publié il y a < 48 h sur une plateforme couverte
// = la récupération est en cours ou à venir (état TRANSITOIRE, prouvé en logs :
// l'URL arrive puis l'annonce redevient retirable). Au-delà, ou hors
// plateformes couvertes (vinted n'a pas de page de récupération), l'échec est
// définitif → consigne d'action manuelle. Ces deux constantes MIROIR doivent
// suivre LISTING_URL_RECOVERY_PAGES / LISTING_URL_RECOVERY_MAX_AGE_MS du
// background.
const URL_RECOVERY_PLATFORMS = ["leboncoin", "beebs", "ebay"];
const URL_RECOVERY_WINDOW_MS = 48 * 60 * 60 * 1000;

function isListingUrlRecoverable(platform, pubJob) {
  return (
    URL_RECOVERY_PLATFORMS.includes(platform) &&
    !!pubJob?.title &&
    !!pubJob?.created_at &&
    Date.now() - Date.parse(pubJob.created_at) < URL_RECOVERY_WINDOW_MS
  );
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
                  <div style={{ fontSize:11.5, lineHeight:1.45, color:"#8C2F28", marginTop:6 }}>{humanizeJobError(j, lang)}</div>
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
            // Transitoire vs définitif : tant que l'extension retente la
            // re-capture (fenêtre 48 h), pas de consigne manuelle — l'annonce
            // deviendra retirable ici même dès que l'URL est récupérée.
            const urlRecovering = noUrl && isListingUrlRecoverable(p, latestPubByPlatform[p]);
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
                    {noUrl && urlRecovering && <span style={{ color:"#8A6100", fontWeight:600 }}>⏳ {fr ? "Récupération du lien en cours…" : "Recovering listing link…"}</span>}
                    {noUrl && !urlRecovering && <span>{fr ? `Lien d'annonce introuvable — retire-la sur ${label}` : `Listing link missing — remove it on ${label}`}</span>}
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
    // Wording Web Store (2026-07-25, extension publiée) : plus de « recharge
    // dans chrome://extensions » — les installs Store se mettent à jour
    // seules, et pour les anciens installs zip le bon geste est de passer
    // à la version Store (la page /extension porte le guide de migration).
    return {
      ton: "orange",
      titre: fr ? "Extension à mettre à jour" : "Extension needs updating",
      detail: fr
        ? "Une version plus récente existe. Installe la dernière version depuis le Chrome Web Store (page Extension dans les réglages)."
        : "A newer version exists. Install the latest version from the Chrome Web Store (Extension page in settings).",
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

// ── Import du dressing Vinted (2026-08-03) ───────────────────────────────────
// Cible première : celui qui vient d'installer, dont le stock est vide, et qui
// a déjà 180 annonces en ligne. Sert aussi, une fois le stock rempli, à
// actualiser le dressing (le parent choisit l'emplacement et passe `source`
// pour le tracking). Trois choses non négociables ici :
//  1. le bouton est GRISÉ tant que l'extension n'est pas PROUVÉE présente.
//     Sans elle, la commande part dans le vide — c'est exactement le piège des
//     jobs 'pending' du 20/07 : un ordre que personne ne vient chercher est
//     indiscernable d'un travail en cours. Corollaire : même une fois lancée,
//     une sync qui ne démarre pas dans les 30 s est ANNONCÉE, jamais laissée
//     tourner en spinner éternel ;
//  2. la progression se lit en BASE (vinted_sync_runs), jamais déduite du clic.
//     La sync vit dans le service worker de l'extension : elle survit à un F5,
//     à un changement d'onglet, et peut avoir été lancée ailleurs ;
//  3. on annonce ce qu'on lit ET ce qu'on ne touche pas. Un import soupçonné de
//     republier sur Vinted, c'est la confiance perdue en un écran.
function VintedDressingSync({ lang, user, isNative, extensionStatus, source = 'stock_empty', onDone }) {
  const fr = lang !== 'en';
  const [extVue, setExtVue] = useState(false);
  // Version annoncée par l'extension (null tant qu'elle ne s'est pas annoncée).
  const [extVersion, setExtVersion] = useState(null);
  const [sondeFinie, setSondeFinie] = useState(false);
  const [run, setRun] = useState(null);
  const [dejaSync, setDejaSync] = useState(false);
  const [suivi, setSuivi] = useState(false);
  const [attente, setAttente] = useState(false);   // clic émis, run pas encore visible en base
  const [message, setMessage] = useState(null);    // ce que la base ne dit pas (commande non prise, poll abandonné)
  // Accroche extension (2026-08-05) : ouverte quand AUCUNE extension ne répond
  // dans CE navigateur — l'écran gère lui-même mobile (mailto/copie du lien)
  // vs desktop (lien /extension).
  const [showPitch, setShowPitch] = useState(false);
  const clicAtRef = useRef(0);

  // Signal immédiat de présence. Le heartbeat serveur ne se rafraîchit qu'au
  // poll de l'extension (2 min) : bien trop lent pour un bouton qu'on regarde.
  useEffect(() => {
    if (isNative) { setSondeFinie(true); return; }
    const stop = ecouterPresenceExtension((version) => { setExtVue(true); setExtVersion(version); setSondeFinie(true); });
    const t = setTimeout(() => setSondeFinie(true), EXT_SONDE_MS);
    return () => { stop(); clearTimeout(t); };
  }, [isNative]);

  // Reprise d'affichage au montage : une sync peut tourner depuis un autre
  // onglet ou depuis avant le rechargement de la page.
  useEffect(() => {
    if (!user?.id) return;
    let annule = false;
    (async () => {
      try {
        const [dernier, deja] = await Promise.all([
          lireDernierRunDressing(user.id),
          aDejaSynchroniseDressing(user.id),
        ]);
        if (annule) return;
        setRun(dernier);
        setDejaSync(deja);
        if (dernier?.status === 'running') setSuivi(true);
      } catch (e) {
        if (!annule) console.warn('[sync-dressing] lecture du dernier run :', e?.message ?? e);
      }
    })();
    return () => { annule = true; };
  }, [user?.id]);

  // Poll de progression. ⚠️ Le clearInterval du démontage n'est pas cosmétique :
  // sans lui, quitter l'onglet Stock laisse un timer interroger Supabase toutes
  // les 2 s pour toujours.
  useEffect(() => {
    if (!user?.id || !suivi) return;
    let annule = false;
    const debut = Date.now();
    const tick = async () => {
      let r = null;
      try { r = await lireDernierRunDressing(user.id); }
      catch { return; } // un 5xx passager ne doit pas tuer le suivi
      if (annule) return;
      // PIÈGE : dans les secondes qui suivent le clic, la ligne du nouveau run
      // n'existe pas encore et la requête ramène le run PRÉCÉDENT (le 'done'
      // d'hier). Le prendre pour le nôtre afficherait « terminé » avant même
      // que ça commence. On n'accepte un run TERMINÉ que s'il a démarré après
      // le clic ; un run 'running' est toujours le bon — l'extension REPREND
      // un run interrompu, dont le started_at est ancien par construction.
      const attenduDepuis = clicAtRef.current;
      // finished_at compte aussi : un run REPRIS puis clos (failed/interrupted)
      // garde son started_at d'origine, antérieur au clic — sur started_at
      // seul, sa clôture serait ignorée et on afficherait « pas démarré » à
      // tort, en cachant le vrai motif d'échec.
      const pertinent = r && (r.status === 'running' || !attenduDepuis
        || Date.parse(r.started_at) >= attenduDepuis - 5000
        || Date.parse(r.finished_at ?? 0) >= attenduDepuis - 5000);
      if (pertinent) {
        setRun(r);
        setAttente(false);
        if (r.status !== 'running') {
          setSuivi(false);
          if (r.status === 'done') { setDejaSync(true); onDone?.(); }
          return;
        }
      } else if (attenduDepuis && Date.now() - attenduDepuis > SYNC_DEMARRAGE_MAX_MS) {
        setAttente(false);
        setSuivi(false);
        setMessage({ ton: 'orange', texte: fr
          ? "L'extension n'a pas démarré la synchronisation. Vérifie qu'elle est bien installée, activée et à jour dans Chrome, puis réessaie."
          : "The extension didn't start the sync. Check that it's installed, enabled and up to date in Chrome, then try again." });
        return;
      }
      if (Date.now() - debut > SYNC_POLL_MAX_MS) {
        setSuivi(false);
        setMessage({ ton: 'orange', texte: fr
          ? "Suivi arrêté au bout de 10 minutes. La synchronisation continue peut-être en arrière-plan : recharge la page pour en avoir le cœur net."
          : "Tracking stopped after 10 minutes. The sync may still be running in the background: reload the page to check." });
      }
    };
    tick();
    const id = setInterval(tick, SYNC_POLL_MS);
    return () => { annule = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, suivi]);

  // ⚠️ LE HEARTBEAT N'AUTORISE PLUS LE CLIC (correctif 03/08) — et depuis le
  // 05/08 il ne pilote PLUS AUCUN message non plus : il prouve qu'UNE
  // extension tourne quelque part (y compris sur une autre machine), jamais
  // qu'il y en a une dans CE navigateur. Seule preuve valable ici : le signal
  // postMessage `__fillsellExt`, qui n'existe que depuis la 0.5.0 et porte la
  // version du manifest.
  const extCapable = extVue && versionAuMoins(extVersion, SYNC_VERSION_MIN);
  const enCours = attente || (suivi && run?.status === 'running');

  // ── Cadence des syncs manuelles ───────────────────────────────────────────
  // Miroir d'affichage de la borne background (qui, elle, relit la base et ne
  // se contourne pas en rechargeant la page). Seul un run DONE arme la
  // fenêtre : un échec se retente tout de suite.
  const finDernierDone = run?.status === 'done' && run?.finished_at ? Date.parse(run.finished_at) : NaN;
  const cadenceFinA = Number.isFinite(finDernierDone) ? finDernierDone + SYNC_CADENCE_MANUELLE_MS : 0;
  const [, forcerRendu] = useState(0);
  // Re-rendu périodique pendant la fenêtre : sans lui, « dans ~12 min »
  // resterait figé et le bouton ne se réactiverait qu'au prochain montage.
  useEffect(() => {
    if (!cadenceFinA || Date.now() >= cadenceFinA) return;
    const id = setInterval(() => forcerRendu((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [cadenceFinA]);
  const enCadence = !enCours && cadenceFinA > Date.now();
  const cadenceTexte = (() => {
    if (!enCadence) return null;
    const depuisMin = Math.max(0, Math.round((Date.now() - finDernierDone) / 60000));
    const dansMin = Math.max(1, Math.ceil((cadenceFinA - Date.now()) / 60000));
    // Ton neutre : c'est une cadence, pas une faute.
    if (depuisMin < 1) {
      return fr
        ? `Dressing synchronisé à l'instant — tu pourras actualiser dans ~${dansMin} min.`
        : `Closet synced just now — you can refresh in ~${dansMin} min.`;
    }
    return fr
      ? `Dressing synchronisé il y a ${depuisMin} min — tu pourras actualiser dans ~${dansMin} min.`
      : `Closet synced ${depuisMin} min ago — you can refresh in ~${dansMin} min.`;
  })();

  // ── États bloquants (refonte 2026-08-05, bug Safari iOS) ──────────────────
  // Deux vérités à ne plus jamais confondre :
  //  · le heartbeat serveur prouve qu'une extension tourne QUELQUE PART (y
  //    compris sur un autre ordinateur) — il ne dit RIEN de ce navigateur.
  //    Sur l'iPhone de Nico il fabriquait un « ton extension est trop
  //    ancienne » alors qu'aucune extension n'existe sur iOS ;
  //  · le canal postMessage (__fillsellExt) n'existe que depuis la 0.5.0 :
  //    « présente mais muette (0.4.x) » et « absente » sont INDISCERNABLES
  //    dans ce navigateur. Règle : pas de réponse au ping → accroche
  //    d'installation (ExtensionPitchScreen, qui sait parler mobile ET
  //    desktop) — JAMAIS un mot sur la version. Réponse reçue avec version
  //    insuffisante → là seulement, le message de version, SANS la promesse
  //    « elle se met à jour toute seule depuis le Chrome Web Store » (la
  //    0.5.x n'y a jamais été soumise : personne n'aurait rien reçu).
  const raisonGrisee = (() => {
    if (isNative) {
      return fr
        ? "La synchronisation lit ton dressing depuis Chrome, sur ordinateur — elle n'est pas disponible dans l'application mobile."
        : 'The sync reads your closet from Chrome on desktop — it isn\'t available in the mobile app.';
    }
    if (!sondeFinie || extCapable) return null; // tant que la sonde court, on ne conclut RIEN
    if (extVue) {
      // L'extension a répondu ICI : la version est un fait, pas une déduction.
      return fr
        ? `Ton extension FillSell${extVersion ? ` (${extVersion})` : ''} ne sait pas encore lire ton dressing — il lui faut la version ${SYNC_VERSION_MIN} ou plus récente.`
        : `Your FillSell extension${extVersion ? ` (${extVersion})` : ''} can't read your closet yet — it needs version ${SYNC_VERSION_MIN} or newer.`;
    }
    return null; // aucune réponse dans CE navigateur → bloc d'accroche dédié
  })();
  // Aucune extension n'a répondu ici : accroche d'installation (le heartbeat,
  // même vivant, ne change rien — il parle d'un autre navigateur).
  const extAbsente = sondeFinie && !extVue && !isNative && !extCapable;
  // Un état bloquant PRÉSENT prime sur le résultat d'un run PASSÉ : les deux
  // ensemble se contredisent (« synchronisé ✓ » + « impossible de lire ton
  // dressing »). Le bilan et la cadence ne s'affichent que débloqué.
  const blocage = raisonGrisee != null || extAbsente;

  const progression = (() => {
    if (attente) return fr ? 'Démarrage…' : 'Starting…';
    const vus = run?.items_vus ?? 0;
    if (run?.total_entries) return fr ? `${vus} articles sur ${run.total_entries}` : `${vus} of ${run.total_entries} items`;
    return fr ? `${vus} article${vus > 1 ? 's' : ''} lu${vus > 1 ? 's' : ''}` : `${vus} item${vus === 1 ? '' : 's'} read`;
  })();

  const lancer = () => {
    if (enCadence) return; // le bouton est désactivé ; ceinture si l'état a un tour de retard
    setMessage(null);
    clicAtRef.current = Date.now();
    setAttente(true);
    setSuivi(true);
    try { demanderSyncDressing(); }
    catch (e) {
      setAttente(false); setSuivi(false);
      setMessage({ ton: 'rouge', texte: String(e?.message ?? e) });
      return;
    }
    track('vinted_sync_dressing', { source, reprise: dejaSync });
  };

  // Bilan du dernier run terminé — affiché seulement s'il n'y a pas de sync en
  // cours (sinon deux états concurrents à l'écran).
  const bilan = (() => {
    if (enCours || !run || run.status === 'running') return null;
    if (run.status === 'done') {
      return { ton: 'vert', texte: fr
        ? `Dressing synchronisé — ${run.items_crees ?? 0} article${(run.items_crees ?? 0) > 1 ? 's' : ''} importé${(run.items_crees ?? 0) > 1 ? 's' : ''}, ${run.items_maj ?? 0} mis à jour.`
        : `Closet synced — ${run.items_crees ?? 0} item${(run.items_crees ?? 0) === 1 ? '' : 's'} imported, ${run.items_maj ?? 0} updated.` };
    }
    if (run.status === 'interrupted') {
      // Vinted a bloqué (DataDome) ou la session Vinted a expiré. Ni alarme ni
      // faute de l'utilisateur : la reprise repartira de la page courante.
      return { ton: 'orange', texte: fr
        ? `Synchronisation mise en pause par Vinted après ${run.items_vus ?? 0} article${(run.items_vus ?? 0) > 1 ? 's' : ''}. Vérifie que tu es bien connecté à Vinted dans ce navigateur, puis réessaie un peu plus tard — la reprise repart là où elle s'est arrêtée.`
        : `Vinted paused the sync after ${run.items_vus ?? 0} item${(run.items_vus ?? 0) === 1 ? '' : 's'}. Check that you're signed in to Vinted in this browser, then try again a bit later — it resumes where it stopped.` };
    }
    if (run.status === 'failed') {
      // ⚠️ Surtout pas humanizeJobError ici : son repli parle de « publication »
      // et renvoie relancer depuis la fiche article — un contresens pour une
      // sync. Les messages posés par l'extension sont déjà lisibles ; on ne
      // masque que les pavés techniques (URL, JSON, traces).
      const brut = String(run.erreur ?? '').trim();
      // Session Vinted absente/expirée : le seul échec que l'utilisateur peut
      // résoudre seul — message dédié, actionnable, sans code HTTP à l'écran.
      // Reconnu sur le texte posé par la sonde (vinted.js), qui inclut
      // « session Vinted … (HTTP 401) ».
      if (/session vinted|HTTP 401/i.test(brut)) {
        return { ton: 'orange', texte: fr
          ? "Tu n'es pas connecté à Vinted dans ce navigateur. Connecte-toi sur vinted.fr, puis relance la synchronisation."
          : "You're not signed in to Vinted in this browser. Sign in on vinted.fr, then start the sync again." };
      }
      const lisible = brut && brut.length <= 200 && !/[{}<>]|https?:\/\//.test(brut)
        ? brut
        : (fr ? "un imprévu technique — le détail est enregistré" : 'a technical issue — the detail has been recorded');
      return { ton: 'rouge', texte: fr
        ? `Synchronisation échouée : ${lisible}. Tu peux réessayer.`
        : `Sync failed: ${lisible}. You can try again.` };
    }
    return null;
  })();

  // Blocage présent ⇒ le bilan du run passé se tait (contradiction sinon) ;
  // `message` reste : c'est le retour d'un clic de CETTE session.
  const avis = message || (blocage ? null : bilan);
  const AVIS_COULEURS = {
    vert:   { bg: '#F0FDFB', bord: 'rgba(13,148,136,0.2)',  texte: '#1B6E62' },
    orange: { bg: '#FFF7ED', bord: '#FED7AA',               texte: '#9A3412' },
    rouge:  { bg: '#FEF2F2', bord: '#FECACA',               texte: '#B91C1C' },
  };

  return (
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E7E3D8",padding:"14px",display:"flex",flexDirection:"column",gap:10}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <PlatformLogo platform="vinted" size={20}/>
        <div style={{fontSize:13,fontWeight:700,color:"#10201B"}}>
          {fr?"Tu vends déjà sur Vinted ?":"Already selling on Vinted?"}
        </div>
      </div>

      <SecondaryButton disabled={!extCapable||enCours||enCadence} onClick={lancer}>
        {enCours
          ? (fr?"Synchronisation en cours…":"Syncing…")
          : dejaSync
            ? (fr?"Actualiser mon dressing":"Refresh my closet")
            : (fr?"Synchroniser mon dressing Vinted":"Sync my Vinted closet")}
      </SecondaryButton>

      {/* Jamais un bouton mort sans explication : la cadence dit quand.
          Masquée sous blocage : « tu pourras actualiser dans ~12 min » serait
          une promesse fausse dans un navigateur sans extension. */}
      {cadenceTexte&&!blocage&&(
        <div style={{fontSize:11.5,lineHeight:1.5,color:"#8A8578"}}>{cadenceTexte}</div>
      )}

      {enCours&&(
        <div style={{display:"flex",alignItems:"center",gap:10,background:"#F0FDFB",border:"1px solid rgba(13,148,136,0.18)",borderRadius:10,padding:"10px 12px"}}>
          <Loader size={18} thickness={2}/>
          <div style={{minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1B6E62"}}>{progression}</div>
            <div style={{fontSize:11,color:"#6B7A75",marginTop:2}}>
              {fr?"Tu peux fermer cet onglet : la synchronisation continue.":"You can close this tab: the sync keeps running."}
            </div>
          </div>
        </div>
      )}

      {avis&&(()=>{
        const c=AVIS_COULEURS[avis.ton]||AVIS_COULEURS.orange;
        return (
          <div style={{background:c.bg,border:`1px solid ${c.bord}`,borderRadius:10,padding:"10px 12px",fontSize:12,lineHeight:1.5,color:c.texte}}>
            {avis.texte}
          </div>
        );
      })()}

      {raisonGrisee&&(
        <div style={{fontSize:11.5,lineHeight:1.5,color:"#8A8578"}}>{raisonGrisee}</div>
      )}

      {/* Aucune extension n'a répondu DANS CE navigateur : accroche
          d'installation — l'écran de pitch sait parler mobile (s'envoyer le
          lien par mail, copier) comme desktop (lien /extension). Jamais un
          mot sur la « version » ici : sur mobile il n'y a structurellement
          aucune extension possible. */}
      {extAbsente&&(
        <div style={{background:"#F6F5F1",border:"1px solid #E7E3D8",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:12,lineHeight:1.5,color:"#5C6560",fontWeight:600}}>
            {fr
              ? "L'extension FillSell n'est pas dans ce navigateur — c'est elle qui lit ton dressing, depuis Chrome sur ordinateur."
              : "The FillSell extension isn't in this browser — it's what reads your closet, from Chrome on a computer."}
          </div>
          <button
            onClick={()=>setShowPitch(true)}
            style={{marginTop:8,width:"100%",padding:"10px 12px",borderRadius:10,border:"none",background:"linear-gradient(120deg,#2F9E90,#1B6E62)",color:"#fff",fontSize:12.5,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}
          >
            {fr ? "Installer l'extension / recevoir le lien" : 'Install the extension / get the link'}
          </button>
        </div>
      )}
      {showPitch&&(
        <ExtensionPitchScreen
          lang={lang}
          onClose={()=>setShowPitch(false)}
        />
      )}

      {/* Le contrat, en toutes lettres. La 2e ligne n'est pas un détail : sans
          elle, un vendeur qui a 400 ventes derrière lui et n'en voit revenir
          qu'une poignée conclut à une sync ratée et perd confiance — alors que
          c'est Vinted qui n'expose pas l'historique complet. */}
      <div style={{fontSize:11.5,lineHeight:1.55,color:"#8A8578"}}>
        {fr
          ? "On lit tes annonces en ligne (titre, prix, photos, vues, favoris). Rien n'est publié, modifié ni supprimé sur Vinted."
          : "We read your online listings (title, price, photos, views, favourites). Nothing is published, edited or deleted on Vinted."}
        <br/>
        {fr
          ? "Vinted n'expose pas tout l'historique de ventes : on récupère les annonces en ligne et les ventes récentes, pas l'intégralité de ton passé."
          : "Vinted doesn't expose the full sales history: we get your online listings and recent sales, not everything you've ever sold."}
        <br/>
        {fr
          ? "Les articles importés arrivent avec un prix d'achat à compléter — sans lui, aucune marge ne peut être calculée."
          : "Imported items arrive with a purchase price to fill in — without it, no margin can be computed."}
      </div>
    </div>
  );
}

// ── Feuille de prix de republication (É5, 2026-08-05 — validée par Nico) ─────
// Le prix est LA première chose visible au moment de republier. Presets en
// pourcentage ARRONDIS À L'EURO INFÉRIEUR (−10 % de 25 € → 22 €), PLANCHER
// 2 € (les articles plafonnés sont NOMMÉS dans l'aperçu) ; champ libre en
// solo (min 1 €, la garde de publication). En lot : réglage global seulement
// — l'édition par article à 30 annonces serait inutilisable.
// ── É6 : republication automatique (PRO uniquement — 2026-08-05) ─────────────
// Réglage : profiles.platform_settings.vinted.republish_auto {actif,
// age_jours, plafond_jour} — plafond RÉGLABLE par l'utilisateur (1..50).
// Écriture en lecture-fusion-écriture (platform_settings porte aussi
// l'adresse Leboncoin). À l'activation : on dit CE QUI VA SE PASSER (combien
// d'annonces éligibles aujourd'hui, à quel rythme) — pas de discours de coût,
// c'est inclus en Pro. Non-Pro : présenté comme un AVANTAGE du plan (renvoi
// vers la carte Pro), jamais un cadenas frustrant. Si le compte cesse d'être
// Pro, le background coupe proprement (arret_motif='plan_non_pro') — ce bloc
// AFFICHE ce motif.
function RepublishAutoBlock({ lang, user, isPro, openUpgradeModal }) {
  const fr = lang !== 'en';
  const [cfg, setCfg] = useState(null);          // republish_auto de platform_settings
  const [eligibles, setEligibles] = useState(null);
  const [moisCount, setMoisCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const ageJours = Math.min(365, Math.max(7, Number(cfg?.age_jours) || 30));
  const plafond = Math.min(50, Math.max(1, Number(cfg?.plafond_jour) || 10));

  useEffect(() => {
    if (!user?.id) return;
    let stale = false;
    (async () => {
      const { data } = await supabase.from('profiles').select('platform_settings').eq('id', user.id).maybeSingle();
      if (stale) return;
      setCfg(data?.platform_settings?.vinted?.republish_auto ?? {});
      const seuil = new Date(Date.now() - (Math.min(365, Math.max(7, Number(data?.platform_settings?.vinted?.republish_auto?.age_jours) || 30)) * 86_400_000)).toISOString();
      const { count } = await supabase.from('inventaire')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('statut', 'stock')
        .not('vinted_item_id', 'is', null).is('disparu_le', null)
        .lt('listed_at_guess', seuil);
      if (!stale && typeof count === 'number') setEligibles(count);
      const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0, 0, 0, 0);
      const { count: nMois } = await supabase.from('cross_post_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('action', 'republish').eq('status', 'published')
        .eq('platform_fields->>republish_source', 'auto')
        .gte('published_at', debutMois.toISOString());
      if (!stale && typeof nMois === 'number') setMoisCount(nMois);
    })();
    return () => { stale = true; };
  }, [user?.id]);

  async function ecrire(patch) {
    if (busy) return;
    setBusy(true);
    try {
      // Lecture-fusion-écriture + .select() de contrôle (leçon RLS profiles).
      const { data: cur } = await supabase.from('profiles').select('platform_settings').eq('id', user.id).maybeSingle();
      const ps = cur?.platform_settings ?? {};
      const next = { ...ps, vinted: { ...(ps.vinted ?? {}), republish_auto: { ...(ps.vinted?.republish_auto ?? {}), ...patch } } };
      const { data, error } = await supabase.from('profiles').update({ platform_settings: next }).eq('id', user.id).select('platform_settings');
      if (!error && data?.length) setCfg(data[0].platform_settings?.vinted?.republish_auto ?? {});
    } finally {
      setBusy(false);
    }
  }

  if (!isPro) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E7E3D8', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#10201B' }}>
          ✨ {fr ? 'Republication automatique' : 'Automatic reposting'}
          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, background: '#10201B', color: '#F2B48C', borderRadius: 99, padding: '2px 8px', verticalAlign: 'middle' }}>PRO</span>
        </div>
        <div style={{ fontSize: 12, color: '#5C6560', lineHeight: 1.5 }}>
          {fr
            ? 'Tes annonces qui stagnent depuis plus de 30 jours sont republiées toutes seules, au rythme humain — un avantage du plan Pro.'
            : 'Listings sitting for 30+ days get reposted on their own, at a human pace — a Pro plan perk.'}
        </div>
        <button onClick={() => openUpgradeModal?.()}
          style={{ alignSelf: 'flex-start', padding: '9px 14px', borderRadius: 999, border: 'none', background: 'linear-gradient(120deg,#E8956D,#F2B48C)', color: '#10201B', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          {fr ? 'Découvrir Pro' : 'Discover Pro'}
        </button>
      </div>
    );
  }

  const actif = cfg?.actif === true;
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E7E3D8', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#10201B' }}>
          🔁 {fr ? 'Republication automatique' : 'Automatic reposting'}
        </div>
        <button disabled={busy}
          onClick={() => ecrire(actif ? { actif: false, arrete_le: new Date().toISOString(), arret_motif: 'utilisateur' } : { actif: true, age_jours: ageJours, plafond_jour: plafond, arret_motif: null })}
          style={{ padding: '7px 14px', borderRadius: 999, border: 'none', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            background: actif ? '#FBEDEC' : 'linear-gradient(120deg,#2F9E90,#1B6E62)', color: actif ? '#8C2F28' : '#fff', opacity: busy ? 0.6 : 1 }}>
          {actif ? (fr ? 'Couper' : 'Turn off') : (fr ? 'Activer' : 'Turn on')}
        </button>
      </div>
      {cfg?.arret_motif === 'plan_non_pro' && !actif && (
        <div style={{ fontSize: 12, color: '#8C2F28', background: '#FBEDEC', border: '1px solid #EFC2BE', borderRadius: 10, padding: '8px 10px', lineHeight: 1.5 }}>
          {fr
            ? "L'automatisation s'est coupée : ton compte n'est plus Pro. Elle se réactive en un clic dès que tu repasses Pro."
            : 'Automation switched itself off: your account is no longer Pro. Re-enable it in one click once you are Pro again.'}
        </div>
      )}
      {actif ? (
        <div style={{ fontSize: 12, color: '#5C6560', lineHeight: 1.55 }}>
          {fr
            ? <>ON — {moisCount ?? '…'} republiée{(moisCount ?? 0) > 1 ? 's' : ''} ce mois. {eligibles != null ? `${eligibles} annonce${eligibles > 1 ? 's' : ''} éligible${eligibles > 1 ? 's' : ''} aujourd'hui (en ligne depuis plus de ${ageJours} j)` : '…'} — elles partiront au rythme d'au plus {plafond}/jour, une par passage de l'extension, Chrome ouvert.</>
            : <>ON — {moisCount ?? '…'} reposted this month. {eligibles != null ? `${eligibles} listing${eligibles > 1 ? 's' : ''} eligible today (live for over ${ageJours} d)` : '…'} — they will go at up to {plafond}/day, one per extension pass, with Chrome open.</>}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#5C6560', lineHeight: 1.55 }}>
          {fr
            ? `À l'activation : ${eligibles != null ? `${eligibles} annonce${eligibles > 1 ? 's' : ''} éligible${eligibles > 1 ? 's' : ''} aujourd'hui` : '…'} (en ligne depuis plus de ${ageJours} j), republiées au rythme d'au plus ${plafond}/jour — une par passage de l'extension, Chrome ouvert. Tu peux couper à tout moment.`
            : `On activation: ${eligibles != null ? `${eligibles} eligible listing${eligibles > 1 ? 's' : ''} today` : '…'} (live for over ${ageJours} d), reposted at up to ${plafond}/day — one per extension pass, with Chrome open. Turn it off anytime.`}
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5C6560', fontWeight: 600 }}>
        {fr ? 'Plafond par jour :' : 'Daily cap:'}
        <input type="number" min={1} max={50} defaultValue={plafond} disabled={busy}
          onBlur={e => { const v = Math.min(50, Math.max(1, Number(e.target.value) || 10)); e.target.value = String(v); ecrire({ plafond_jour: v }); }}
          style={{ width: 64, padding: '7px 9px', borderRadius: 9, border: '1px solid #E7E3D8', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }} />
      </label>
    </div>
  );
}

const REPUB_PLANCHER_EUR = 2;
function RepublishSheet({ lang, items, gratuit, prixUnitaire, onClose, onConfirm }) {
  const fr = lang !== 'en';
  const solo = items.length === 1;
  const [pct, setPct] = useState(0);
  const [prixLibre, setPrixLibre] = useState(solo && items[0].prixActuel != null ? String(items[0].prixActuel) : '');
  const arrondi = (p) => p == null ? null : Math.max(REPUB_PLANCHER_EUR, Math.floor(p * (1 - pct / 100)));
  const prixFinalSolo = (() => {
    if (!solo) return null;
    const libre = Number(String(prixLibre).replace(',', '.'));
    if (Number.isFinite(libre) && libre >= 1) return libre;
    return arrondi(items[0].prixActuel);
  })();
  const lotApercu = solo ? [] : items.map(({ item, prixActuel }) => ({
    titre: item.title, avant: prixActuel, apres: pct === 0 ? prixActuel : arrondi(prixActuel),
    plafonne: pct > 0 && prixActuel != null && Math.floor(prixActuel * (1 - pct / 100)) < REPUB_PLANCHER_EUR,
  }));
  const plafonnes = lotApercu.filter(a => a.plafonne);
  const cout = gratuit
    ? (fr ? 'inclus dans ton plan' : 'included in your plan')
    : `${items.length * (prixUnitaire ?? 1)} ${fr ? 'Pépite' : 'Nugget'}${items.length * (prixUnitaire ?? 1) > 1 ? 's' : ''}`;
  const confirmer = () => {
    onConfirm(items.map(({ item, prixActuel }) => {
      let prix = null; // null = garder le prix de l'annonce
      if (solo) { if (prixFinalSolo != null && prixFinalSolo !== prixActuel) prix = prixFinalSolo; }
      else if (pct > 0 && prixActuel != null) prix = arrondi(prixActuel);
      return { item, prix };
    }));
  };
  const chip = (p, label) => (
    <button key={p} onClick={() => { setPct(p); if (solo && items[0].prixActuel != null) setPrixLibre(String(p === 0 ? items[0].prixActuel : Math.max(REPUB_PLANCHER_EUR, Math.floor(items[0].prixActuel * (1 - p / 100))))); }}
      style={{ padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
        border: `1px solid ${pct === p ? '#2F9E90' : '#E7E3D8'}`, background: pct === p ? '#E7F3F0' : '#F6F5F1', color: pct === p ? '#1B6E62' : '#5C6560' }}>
      {label}
    </button>
  );
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(16,32,27,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#EDEAE0', borderRadius: '26px 26px 0 0', maxHeight: '92vh', overflowY: 'auto', padding: '18px 18px calc(env(safe-area-inset-bottom,0px) + 24px)', fontFamily: "'Space Grotesk', sans-serif" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#10201B', marginBottom: 4 }}>
          {solo
            ? (fr ? 'Republier cet article' : 'Repost this item')
            : (fr ? `Republier ${items.length} annonces` : `Repost ${items.length} listings`)}
        </div>
        <div style={{ fontSize: 12.5, color: '#5C6560', lineHeight: 1.5, marginBottom: 12 }}>
          {fr ? "Baisser un peu le prix aide l'annonce à repartir — à toi de voir." : 'A small price drop helps the listing take off again — up to you.'}
        </div>
        {solo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: '#5C6560', fontWeight: 600 }}>
              {items[0].prixActuel != null
                ? (fr ? `En ligne à ${items[0].prixActuel} €` : `Live at €${items[0].prixActuel}`)
                : (fr ? 'Prix actuel inconnu' : 'Current price unknown')}
            </span>
            <input inputMode="decimal" value={prixLibre} onChange={e => setPrixLibre(e.target.value)}
              aria-label={fr ? 'Nouveau prix' : 'New price'}
              style={{ width: 90, padding: '9px 10px', borderRadius: 10, border: '1px solid #E7E3D8', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#10201B' }}>€</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {chip(0, fr ? 'Garder' : 'Keep')}{chip(5, '−5 %')}{chip(10, '−10 %')}{chip(15, '−15 %')}
        </div>
        {!solo && pct > 0 && (
          <div style={{ background: '#F6F5F1', border: '1px solid #E7E3D8', borderRadius: 12, padding: '10px 12px', fontSize: 12, color: '#5C6560', lineHeight: 1.55, marginBottom: 12 }}>
            {lotApercu.slice(0, 3).map((a, i) => (
              <div key={i}>{(a.titre ?? '—')} : {a.avant != null ? `${a.avant} € → ${a.apres} €` : (fr ? 'prix inconnu — gardé' : 'unknown price — kept')}{a.plafonne ? (fr ? ' (plancher)' : ' (floor)') : ''}</div>
            ))}
            {lotApercu.length > 3 && <div>… {lotApercu.length - 3} {fr ? 'autres' : 'more'}</div>}
            {plafonnes.length > 0 && (
              <div style={{ marginTop: 6, color: '#9A3412', fontWeight: 600 }}>
                {fr ? `${plafonnes.length} article${plafonnes.length > 1 ? 's' : ''} au plancher de ${REPUB_PLANCHER_EUR} € : ` : `${plafonnes.length} item${plafonnes.length > 1 ? 's' : ''} at the €${REPUB_PLANCHER_EUR} floor: `}
                {plafonnes.slice(0, 3).map(a => a.titre ?? '—').join(' · ')}{plafonnes.length > 3 ? '…' : ''}
              </div>
            )}
          </div>
        )}
        <button onClick={confirmer}
          style={{ width: '100%', padding: 14, border: 'none', borderRadius: 999, background: 'linear-gradient(120deg,#2F9E90,#1B6E62)', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          {solo
            ? (fr ? `Republier${prixFinalSolo != null ? ` à ${prixFinalSolo} €` : ''} · ${cout}` : `Repost${prixFinalSolo != null ? ` at €${prixFinalSolo}` : ''} · ${cout}`)
            : (fr ? `Republier les ${items.length}${pct > 0 ? ` à −${pct} %` : ''} · ${cout}` : `Repost ${items.length}${pct > 0 ? ` at −${pct}%` : ''} · ${cout}`)}
        </button>
        <button onClick={onClose} style={{ width: '100%', marginTop: 8, padding: 10, border: 'none', background: 'none', color: '#5C6560', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          {fr ? 'Annuler' : 'Cancel'}
        </button>
      </div>
    </div>,
    document.body
  );
}

const StockTab = memo(function StockTab({
  // Config
  lang, currency, isPremium, isNative, isPro, items, user, voiceUsedToday,
  iapProduct, iapLoading, extensionStatus = null, extensionNeverSeen = null,
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
  // Optionnelle : point d'entrée explicite après un import de dressing réussi.
  // Non fournie, on retombe sur vaActions.fetchAll (déjà passé par App.jsx) —
  // les appelants existants n'ont donc rien à changer.
  onSyncDone = null,
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
  // ── Détail Vinted au clic « Publier » (2026-08-03 soir) ────────────────────
  // Un article importé du dressing a ses PHOTOS en base (la sync les écrit)
  // mais PAS sa description : la liste wardrobe ne la porte pas, elle ne vit
  // que dans /api/v2/item_upload/items/{id} — endpoint du formulaire d'édition,
  // autorisé À L'UNITÉ sur ACTION HUMAINE uniquement (décision 2 du chantier).
  // Le clic « Publier » est ce déclencheur : on demande LE détail de CET
  // article à l'extension, puis on ouvre le stepper description en place.
  // GRATUIT (aucune Pépite) : c'est la publication qui est payante, pas la
  // lecture. Extension absente/ancienne ou réponse en retard → le stepper
  // s'ouvre quand même (photos + titre déjà là) avec une note douce, jamais un
  // écran vide sans explication.
  const [extDetailOk, setExtDetailOk] = useState(false);
  useEffect(() => {
    const stop = ecouterPresenceExtension((version) => {
      setExtDetailOk(versionAuMoins(version, DETAIL_VERSION_MIN));
    });
    return stop;
  }, []);
  const [detailFetchId, setDetailFetchId] = useState(null); // item.id en cours de récupération
  const [detailNote, setDetailNote] = useState(null);       // message doux (repli), auto-effacé
  const detailNoteTimer = useRef(null);
  useEffect(() => () => { if (detailNoteTimer.current) clearTimeout(detailNoteTimer.current); }, []);
  const montrerNoteDetail = (message) => {
    setDetailNote(message);
    if (detailNoteTimer.current) clearTimeout(detailNoteTimer.current);
    detailNoteTimer.current = setTimeout(() => setDetailNote(null), 7000);
  };
  const DETAIL_TIMEOUT_MS = 12000;
  const publierAvecDetail = async (item) => {
    const doitCompleter = item.origine === 'vinted_sync' && item.vinted_item_id && !item.description;
    // Rien à compléter, ou pas d'extension capable (mobile, extension < 0.5.1) :
    // ouverture directe — on n'attend JAMAIS un canal qui n'existe pas.
    if (!doitCompleter || !extDetailOk) {
      if (doitCompleter) {
        montrerNoteDetail(lang === 'fr'
          ? "La description Vinted sera récupérée quand l'extension sera à jour — tu peux la compléter à la main en attendant."
          : "The Vinted description will be fetched once the extension is updated — you can fill it in manually meanwhile.");
      }
      ouvrirStepper(item);
      return;
    }
    if (detailFetchId) return; // une récupération à la fois — jamais de lot
    setDetailFetchId(item.id);
    const detail = await new Promise((resolve) => {
      const timer = setTimeout(() => { stop(); resolve(null); }, DETAIL_TIMEOUT_MS);
      const stop = ecouterDetailArticleVinted((d) => {
        if (String(d.vintedItemId) !== String(item.vinted_item_id)) return;
        clearTimeout(timer); stop(); resolve(d);
      });
      demanderDetailArticleVinted(item.vinted_item_id);
    });
    setDetailFetchId(null);
    if (detail?.success && detail.description) {
      // Persistée pour ne plus jamais re-demander cet article ; la sync ne
      // réécrit pas `description` (champ à l'utilisateur), elle survivra.
      await supabase.from('inventaire').update({ description: detail.description })
        .eq('id', item.id).eq('user_id', user.id).then(() => {}, () => {});
      ouvrirStepper({ ...item, description: detail.description });
    } else {
      montrerNoteDetail(lang === 'fr'
        ? "La description Vinted n'a pas pu être récupérée cette fois — les photos sont là, tu peux compléter le texte à la main."
        : "The Vinted description couldn't be fetched this time — photos are in place, you can fill in the text manually.");
      ouvrirStepper(item);
    }
  };

  // ── Prix d'annonce Vinted par article (2026-08-03 soir) ────────────────────
  // Le prix DEMANDÉ sur l'annonce vit dans vinted_listing_snapshots (relevé
  // quotidien de la sync), JAMAIS dans inventaire.prix_vente — l'upsert de
  // sync le réécrirait à chaque run et le confondrait avec le prix déclaré par
  // l'utilisateur. UNE requête pour toutes les lignes (jamais une par ligne) :
  // relevés triés du plus récent au plus ancien, premier vu = prix courant.
  // Même patron éprouvé que `propositions` (VentesTab). Le limit(1000) couvre
  // ~30 jours de relevés quotidiens pour 30 articles — largement le dernier
  // relevé de chacun.
  const [prixAnnonces, setPrixAnnonces] = useState({}); // vinted_item_id -> price | null
  useEffect(() => {
    if (!user?.id) return;
    const ids = [...new Set(items.map(i => i.vinted_item_id).filter(Boolean))]
      .filter(id => !(id in prixAnnonces));
    if (!ids.length) return;
    let annule = false;
    supabase.from('vinted_listing_snapshots')
      .select('vinted_item_id,price')
      .eq('user_id', user.id).in('vinted_item_id', ids)
      .order('captured_at', { ascending: false }).limit(1000)
      .then(({ data, error }) => {
        if (annule) return;
        // Ids sans relevé notés null — sinon l'effet re-requêterait à chaque rendu.
        setPrixAnnonces(prev => {
          const n = { ...prev };
          for (const id of ids) if (!(id in n)) n[id] = null;
          if (!error) for (const r of (data || [])) if (n[r.vinted_item_id] == null) n[r.vinted_item_id] = r.price;
          return n;
        });
      });
    return () => { annule = true; };
  }, [items, user?.id, prixAnnonces]);

  // Article en attente derrière le rappel extension : le clic « Publier » passe
  // d'abord par le modal, l'ouverture du stepper n'a lieu qu'au « Continuer ».
  const [extReminderItem, setExtReminderItem] = useState(null);
  // Accroche extension (2026-08-04) : extension JAMAIS vue → au clic Publier,
  // écran d'accroche (sync dressing + récupération du lien) AVANT le stepper,
  // à la place du simple rappel. « Préparer mon annonce » reste possible — la
  // garde de publication (stepper + RPC) prendra le relais au dernier clic.
  const [extPitchItem, setExtPitchItem] = useState(null);
  // Quota Free : même assiette que le trigger serveur (non vendus, hors
  // dressing synchronisé) et même limite (miroir 200 de
  // coin_config.free_stock_limit). L'ancien items.length comptait TOUT —
  // vendus et sync compris.
  const quotaFree = compteArticlesQuota(items);

  // ── É5 Republication Vinted (2026-08-05, masquée hors bêta) ───────────────
  // Prix lu en config (jamais en dur) ; libellé sans prix tant que la config
  // n'a pas répondu — jamais un montant faux.
  const republishActif = republishVisiblePour(user?.email) && !isNative;
  const [republishPrice, setRepublishPrice] = useState(null);
  const [repubBusy, setRepubBusy] = useState(null);          // inventaire_id en cours
  const [repubMsgs, setRepubMsgs] = useState({});            // inventaire_id → {ton, texte}
  useEffect(() => {
    if (!republishActif) return;
    let stale = false;
    supabase.from('coin_config').select('value').eq('key', 'price_republish').maybeSingle()
      .then(({ data }) => { if (!stale && Number.isFinite(data?.value)) setRepublishPrice(data.value); });
    return () => { stale = true; };
  }, [republishActif]);
  // ⚠️ repubVivants / repubEtat / repubActionnables sont déclarés PLUS BAS,
  // APRÈS le state jobsByInventaire qu'ils lisent AU RENDU — les poser ici
  // levait une TDZ (« Cannot access 'jobsByInventaire' before
  // initialization ») au montage, écran blanc en prod pour les seuls comptes
  // bêta (le ternaire republishActif court-circuitait les autres). Incident
  // Safari iOS du 05/08. Les HANDLERS, eux, peuvent vivre ici : ils ne
  // s'exécutent qu'au clic, bien après l'initialisation.

  async function lancerRepublication(item, prixRepublication = null) {
    if (repubBusy) return;
    if (extensionNeverSeen === true) { setExtPitchItem(item); return; }
    setRepubBusy(item.id);
    setRepubMsgs(m => ({ ...m, [item.id]: null }));
    try {
      const res = await republierArticleVinted(supabase, {
        userId: user.id, inventaireId: item.id, vintedItemId: item.vinted_item_id, prixRepublication,
      });
      if (!res.success) {
        const raisons = {
          capture_incomplete: lang === 'fr'
            ? `Capture incomplète (${(res.champs_manquants ?? []).slice(0, 2).join(' ; ') || 'champs manquants'}) — rien n'a été touché.`
            : `Incomplete capture (${(res.champs_manquants ?? []).slice(0, 2).join('; ') || 'missing fields'}) — nothing was touched.`,
          capture_perimee: lang === 'fr' ? 'Capture expirée — réessaie, elle sera refaite.' : 'Capture expired — try again, it will be redone.',
          republish_en_cours: lang === 'fr' ? 'Une republication est déjà en cours sur cet article.' : 'A repost is already running for this item.',
          cadence_24h: lang === 'fr' ? 'Déjà republié il y a moins de 24 h — une republication par article et par jour.' : 'Already reposted less than 24 h ago — one repost per item per day.',
          insufficient_coins: lang === 'fr' ? `Il manque des Pépites (${res.price ?? 1} nécessaire).` : `Not enough Nuggets (${res.price ?? 1} needed).`,
        };
        setRepubMsgs(m => ({ ...m, [item.id]: { ton: 'orange', texte: res.message ?? raisons[res.reason] ?? res.error ?? (lang === 'fr' ? 'Republication impossible.' : 'Repost failed.') } }));
        return;
      }
      // Patch optimiste : la carte montre l'état « en file » sans attendre le
      // poll de 20 s (même principe que la publication).
      const now = new Date().toISOString();
      setJobsByInventaire(prev => ({
        ...prev,
        [item.id]: [...(prev[item.id] ?? []), {
          id: `optimistic-repub-${item.id}-${now}`, inventaire_id: item.id, platform: 'vinted',
          action: 'republish', status: 'pending', error: null, created_at: now, listing_url: null, title: item.title,
          platform_fields: { republish_step: 'captured', vinted_item_id: String(item.vinted_item_id) },
        }],
      }));
      setRepubMsgs(m => ({ ...m, [item.id]: { ton: 'vert', texte: lang === 'fr'
        ? 'Republication en file — laisse Chrome ouvert quelques minutes, elle supprime puis recrée l\'annonce à l\'identique.'
        : 'Repost queued — keep Chrome open a few minutes; it deletes then recreates the listing identically.' } }));
    } finally {
      setRepubBusy(null);
    }
  }

  // ── Feuille de prix (2026-08-05, validée) ─────────────────────────────────
  // LE geste Vinted : baisser un peu pour remonter. Ouverte au clic Republier
  // (solo) et au lancement de lot — le prix est la première chose visible.
  // Presets ARRONDIS À L'EURO INFÉRIEUR (−10 % de 25 € = 22 €, pas 22,50) et
  // PLANCHER à 2 € (un pourcentage global sur des prix hétérogènes produirait
  // des absurdités — l'aperçu nomme les articles plafonnés). Champ libre en
  // solo : minimum 1 € (la garde de publication existante).
  const [repubSheet, setRepubSheet] = useState(null); // {items:[{item, prixActuel}]}
  const repubGratuit = isPremium || isPro;
  function ouvrirFeuilleRepublication(itemsCibles) {
    setRepubSheet({
      items: itemsCibles.map(it => ({
        item: it,
        prixActuel: prixAnnonces[it.vinted_item_id] ?? (Number(it.sell) || null),
      })),
    });
  }

  // ── É5.2 : sélection multiple (2026-08-05) — même patron que la saisie des
  // prix d'achat (toggle + Set + checkboxes + barre sticky). Seuls les
  // articles ACTIONNABLES sont cochables : les bornes (republish vivant,
  // cadence 24 h) rendent la case absente, jamais un échec après le clic.
  const [modeRepublish, setModeRepublish] = useState(false);
  const [repubSel, setRepubSel] = useState(new Set());
  const [repubLot, setRepubLot] = useState(null); // {fait, total, refus:[]} pendant/après un lot
  // (repubEtat / repubActionnables : déclarés plus bas, après jobsByInventaire
  // — cf. le commentaire TDZ au-dessus de lancerRepublication.)

  async function lancerRepublicationLot(cibles /* [{item, prix}] */) {
    if (!cibles.length || repubLot?.fait != null && repubLot.fait < repubLot.total) return;
    setRepubLot({ fait: 0, total: cibles.length, refus: [] });
    const refus = [];
    // SÉQUENTIEL : chaque capture passe par l'onglet de travail de l'extension
    // (verrou de flux) — un Promise.all se battrait pour lui. L'onglet
    // FillSell doit rester ouvert pendant la mise en file ; la file, elle,
    // vit en base et survit à tout.
    for (let i = 0; i < cibles.length; i++) {
      const { item, prix } = cibles[i];
      try {
        const res = await republierArticleVinted(supabase, {
          userId: user.id, inventaireId: item.id, vintedItemId: item.vinted_item_id, prixRepublication: prix,
        });
        if (res.success) {
          const now = new Date().toISOString();
          setJobsByInventaire(prev => ({
            ...prev,
            [item.id]: [...(prev[item.id] ?? []), {
              id: `optimistic-repub-${item.id}-${now}`, inventaire_id: item.id, platform: 'vinted',
              action: 'republish', status: 'pending', error: null, created_at: now, listing_url: null, title: item.title,
              platform_fields: { republish_step: 'captured', vinted_item_id: String(item.vinted_item_id) },
            }],
          }));
        } else {
          refus.push({ titre: item.title, raison: res.reason ?? res.error ?? 'refus' });
        }
      } catch (e) {
        refus.push({ titre: item.title, raison: String(e?.message ?? e) });
      }
      setRepubLot({ fait: i + 1, total: cibles.length, refus: [...refus] });
    }
    setRepubSel(new Set());
  }

  async function relancerRepublication(item, job) {
    if (repubBusy) return;
    setRepubBusy(item.id);
    setRepubMsgs(m => ({ ...m, [item.id]: null }));
    try {
      const res = await relancerRepublishVinted(supabase, { userId: user.id, job });
      if (!res.success) {
        setRepubMsgs(m => ({ ...m, [item.id]: { ton: 'orange', texte: res.error ?? (lang === 'fr' ? 'Relance impossible.' : 'Relaunch failed.') } }));
        return;
      }
      setJobsByInventaire(prev => ({
        ...prev,
        [item.id]: (prev[item.id] ?? []).map(j => j.id === job.id ? { ...j, status: 'pending', error: null } : j),
      }));
      setRepubMsgs(m => ({ ...m, [item.id]: { ton: 'vert', texte: res.recapture
        ? (lang === 'fr' ? 'Capture refaite, republication relancée — laisse Chrome ouvert quelques minutes.' : 'Fresh capture done, repost relaunched — keep Chrome open a few minutes.')
        : (lang === 'fr' ? 'Recréation relancée — laisse Chrome ouvert quelques minutes.' : 'Recreation relaunched — keep Chrome open a few minutes.') } }));
    } finally {
      setRepubBusy(null);
    }
  }
  const [jobsByInventaire, setJobsByInventaire] = useState({});
  // ── É5 : dérivations de RENDU qui lisent jobsByInventaire ────────────────
  // IMPÉRATIVEMENT APRÈS la déclaration du state ci-dessus : posées avant,
  // elles levaient une TDZ au montage (« Cannot access 'jobsByInventaire'
  // before initialization ») → écran blanc en prod pour les comptes bêta,
  // incident Safari iOS du 05/08. Les non-bêta étaient épargnés par le
  // court-circuit du ternaire republishActif — c'est ce qui a fait croire à
  // un bug spécifique iOS.
  const repubVivants = republishActif
    ? Object.values(jobsByInventaire).flat().filter(j => j.action === 'republish' && (j.status === 'pending' || j.status === 'processing')).length
    : 0;
  const repubEtat = (item) => {
    if (!(item.vinted_item_id && !item.disparu_le && item.statut !== 'vendu')) return 'ineligible';
    const rjobs = (jobsByInventaire[item.id] || []).filter(j => j.action === 'republish');
    let last = null;
    for (const j of rjobs) { if (!last || Date.parse(j.created_at || 0) > Date.parse(last.created_at || 0)) last = j; }
    if (last && (last.status === 'pending' || last.status === 'processing' || last.status === 'needs_user')) return 'vivant';
    if (last && last.status === 'published' && last.platform_fields?.recreated_at
      && Date.now() - Date.parse(last.platform_fields.recreated_at) < 24 * 3600 * 1000) return 'cadence';
    return 'ok';
  };
  const repubActionnables = republishActif ? stockFiltre.filter(i => repubEtat(i) === 'ok') : [];
  // Job 'needs_user' ouvert dans le mini-éditeur « À compléter » (socle
  // needs_user, 2026-07-19). null = fermé. La fermeture sans valider ne touche
  // à RIEN : le job reste needs_user, le badge reste affiché.
  const [needsUserJob, setNeedsUserJob] = useState(null);
  // Job échoué dont on montre l'erreur complète + action directe (remplace le
  // window.alert du 19/07 — chantier onboarding 2026-07-27).
  const [failJobModal, setFailJobModal] = useState(null);
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
        title: pub.title || item.title, listing_url: pub.listing_url,
        // Même drapeau que armRemovals (App.jsx) : sans URL captée, l'extension
        // cible l'annonce par son TITRE dans « Mes annonces ». ⚠️ Inatteignable
        // AUJOURD'HUI depuis ce chemin — la garde `if (!pub?.listing_url)`
        // ci-dessus refuse encore le retrait par logo quand l'URL manque, alors
        // que le bandeau de l'app, lui, sait désormais le faire. Incohérence
        // ASSUMÉE et signalée plutôt que corrigée en douce : lever cette garde
        // change un comportement visible, ça se décide, ça ne se glisse pas
        // dans un commit de propagation de drapeau.
        platform_fields: pub.listing_url ? {} : { removal_url_missing: true },
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

  // Après un import de dressing : la liste vient des props (App.jsx), rien ne la
  // relit tout seul — sans ce rafraîchissement l'écran resterait VIDE alors que
  // les articles sont en base. App ne passe pas de prop de refetch dédiée, mais
  // vaActions.fetchAll (assistant vocal) relit inventaire + ventes.
  const rafraichirApresSync = () => {
    if (onSyncDone) { onSyncDone(); return; }
    vaActions?.fetchAll?.();
  };

  // ── Prix d'achat manquants sur le STOCK (03/08 soir) ───────────────────────
  // Miroir de la complétion de VentesTab, côté inventaire : les articles
  // importés du dressing arrivent SANS prix d'achat (Vinted ne le connaît
  // pas) et n'entrent dans aucun total tant qu'il manque. Invitation, jamais
  // blocage : la ligne reste pleinement utilisable (Publier, Vendre, éditer).
  // NULL = question ouverte · valeur (0 compris) = connu · flag = « je ne
  // sais plus » (question éteinte, article hors calculs).
  const [modePrixAchat,setModePrixAchat]=useState(false);
  const [paSel,setPaSel]=useState(()=>new Set());
  const [paOpenId,setPaOpenId]=useState(null);
  const [paDraft,setPaDraft]=useState("");
  const [paErr,setPaErr]=useState(null);
  const [paBusy,setPaBusy]=useState(false);
  const [paPatchs,setPaPatchs]=useState({}); // id -> {buy} | {inconnu:true} (optimiste, en attendant le refetch)
  const [paLot,setPaLot]=useState("");

  // "" -> null (VIDE ≠ ZÉRO), virgule gérée, illisible -> NaN. Même contrat
  // que parsePrix de VentesTab.
  const parsePrixStock=(v)=>{
    const t=String(v??"").trim().replace(/[\s€]/g,"").replace(",",".");
    if(!t) return null;
    const n=parseFloat(t);
    return Number.isFinite(n)&&n>=0?n:NaN;
  };
  const paIncomplet=(i)=>!paPatchs[i.id]&&i.statut==='stock'&&!prixAchatConnu(i)&&i.prix_achat_inconnu!==true;
  const nbSansPrix=stock.filter(paIncomplet).length;
  const paSelection=modePrixAchat?stockFiltre.filter(i=>paIncomplet(i)&&paSel.has(i.id)):[];

  async function ecrirePrixAchatStock(ids,pa){
    const avant={};ids.forEach(id=>{avant[id]=paPatchs[id];});
    setPaPatchs(p=>{const n={...p};ids.forEach(id=>{n[id]={buy:pa};});return n;});
    setPaErr(null);
    let req=supabase.from('inventaire').update({prix_achat:pa,prix_achat_inconnu:false}).in('id',ids);
    if(user?.id) req=req.eq('user_id',user.id);
    const {error}=await req;
    if(error){
      setPaPatchs(p=>{const n={...p};ids.forEach(id=>{if(avant[id]===undefined)delete n[id];else n[id]=avant[id];});return n;});
      setPaErr({id:ids.length===1?ids[0]:null,message:error.message});
      return false;
    }
    rafraichirApresSync();
    return true;
  }

  async function marquerInconnuStock(ids){
    if(!ids.length) return false;
    setPaErr(null);
    let req=supabase.from('inventaire').update({prix_achat_inconnu:true}).in('id',ids);
    if(user?.id) req=req.eq('user_id',user.id);
    const {error}=await req;
    if(error){setPaErr({id:ids.length===1?ids[0]:null,message:error.message});return false;}
    setPaPatchs(p=>{const n={...p};ids.forEach(id=>{n[id]={inconnu:true};});return n;});
    rafraichirApresSync();
    return true;
  }

  function validerPaStock(item){
    const pa=parsePrixStock(paDraft);
    if(Number.isNaN(pa)){setPaErr({id:item.id,message:lang==='fr'?'Prix illisible':'Invalid price'});return;}
    setPaOpenId(null);setPaDraft("");
    if(pa!==null) ecrirePrixAchatStock([item.id],pa);
  }

  async function appliquerPaLot(){
    const pa=parsePrixStock(paLot);
    if(pa===null||Number.isNaN(pa)){setPaErr({id:null,message:lang==='fr'?'Entre un prix unitaire':'Enter a unit price'});return;}
    setPaBusy(true);
    const ok=await ecrirePrixAchatStock(paSelection.map(i=>i.id),pa);
    setPaBusy(false);
    if(ok){setPaSel(new Set());setPaLot("");}
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
      {/* Bannière déconnexion extension (2026-07-21) — avant, l'app était aveugle
          à l'état de l'extension : le diagnostic n'existait qu'au tap sur un job
          « En cours… » (invisible s'il n'y avait rien à tapoter). Ici : permanent,
          en tête, dès que l'extension est INACTIVE (>15 min sans heartbeat) ou à
          recharger. Mobile seulement — sur desktop l'utilisateur voit l'extension
          directement (« desktop c'est ok »). « Jamais vue » n'affiche rien : ce
          serait du bruit pour qui n'a pas encore installé l'extension. */}
      {isMobile && (() => {
        const seen = Date.parse(extensionStatus?.lastSeenAt ?? "");
        const dead = Number.isFinite(seen) && Date.now() - seen > EXT_MORT_MS;
        if (!dead && !extensionStatus?.outdated) return null;
        const diag = diagnostiquerExtension(extensionStatus, lang);
        const rouge = diag.ton === "rouge";
        return (
          <div style={{
            display:"flex", gap:10, alignItems:"flex-start",
            background: rouge ? "#FEF2F2" : "#FFF7ED",
            border:`1px solid ${rouge ? "#FECACA" : "#FED7AA"}`,
            borderLeft:`4px solid ${rouge ? "#DC2626" : "#EA580C"}`,
            borderRadius:14, padding:"12px 14px", marginBottom:14, width:"100%", boxSizing:"border-box",
          }}>
            <span style={{fontSize:16, lineHeight:1.2, flexShrink:0}}>⚠️</span>
            <div style={{fontSize:13, lineHeight:1.5, color:"#3f3a2e"}}>
              <div style={{fontWeight:700, marginBottom:2, color: rouge ? "#B91C1C" : "#9A3412"}}>{diag.titre}</div>
              {diag.detail}
            </div>
          </div>
        );
      })()}
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
          {!isPremium&&quotaFree>=FREE_STOCK_LIMIT_FALLBACK-2&&quotaFree<FREE_STOCK_LIMIT_FALLBACK&&(
            <div style={{background:"#FFFBEB",borderRadius:10,padding:"10px 14px",fontSize:11,color:"#92400E",border:"1px solid #FDE68A",fontWeight:600}}>
              ⚠️ {lang==='fr'?`${FREE_STOCK_LIMIT_FALLBACK-quotaFree} article${FREE_STOCK_LIMIT_FALLBACK-quotaFree>1?"s":""} restant${FREE_STOCK_LIMIT_FALLBACK-quotaFree>1?"s":""} sur ton plan gratuit`:`${FREE_STOCK_LIMIT_FALLBACK-quotaFree} item${FREE_STOCK_LIMIT_FALLBACK-quotaFree>1?"s":""} remaining on your free plan`}
            </div>
          )}
          {!isPremium&&quotaFree>=FREE_STOCK_LIMIT_FALLBACK&&!isNative
            ? <PremiumBanner userEmail={user?.email} onOpenModal={openUpgradeModal}/>
            : !isPremium&&quotaFree>=FREE_STOCK_LIMIT_FALLBACK&&isNative
            ? null
            : <button className="btn-pill-primary" onClick={addItem} disabled={!iTitle||!iBuy||(iAlreadySold&&!iSell)} style={{opacity:(!iTitle||!iBuy||(iAlreadySold&&!iSell))?0.5:1}}>
                {iSaved?(lang==='fr'?"✓ Ajouté !":"✓ Added!"):items.length===0?(lang==='fr'?"Ajoute ton premier article → vois ton bénéfice 🚀":"Add your first item → see your profit 🚀"):t('ajouterArticle')}
              </button>
          }
          {isNative&&!isPremium&&quotaFree>=FREE_STOCK_LIMIT_FALLBACK&&(
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
                  const ts=getTypeStyle(item.type);
                  const qty=item.quantite||1;
                  // Sans prix d'achat, la marge de cette vente n'existe pas : ni
                  // montant, ni pourcentage (et surtout pas 0).
                  const margeConnue=prixAchatConnu(item)&&item.margin!=null&&Number.isFinite(Number(item.margin));
                  // getMargeColor(null) rendait la couleur d'une marge nulle : le
                  // tiret s'affichait en « mauvaise marge ». Gris = pas d'avis.
                  const mc=margeConnue?getMargeColor(item.marginPct):"#A3A9A6";
                  return(
                    <SwipeRow key={item.id} onDelete={()=>delItem(item.id)} onEdit={()=>setEditItem({...item,_table:'inventaire',frais:0,sell:item.sell??""})} style={{borderLeft:`3px solid ${getCatBorder(item.type)}`}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <div style={{fontWeight:700,fontSize:14,color:"#10201B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                          {qty>1&&<span style={{background:"#1B6E62",color:"#fff",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,flexShrink:0}}>×{qty}</span>}
                          {item.marque&&<span style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #BFE0D9"}}>{marqueLabel(item.marque,lang)}</span>}
                          {item.type&&item.type!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(item.type,lang)}</span>}
                          {item.plateforme&&<span style={{background:"#EDE9FE",color:"#7C3AED",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #C4B5FD"}}>🏪 {item.plateforme}</span>}
                          {/* Prix DEMANDÉ sur l'annonce Vinted (dernier relevé) —
                              distinct du prix de vente déclaré, qui reste la
                              seule vérité d'encaissement. */}
                          {item.vinted_item_id&&prixAnnonces[item.vinted_item_id]!=null&&(
                            <span title={lang==='fr'?"Prix affiché sur l'annonce Vinted — pas le prix réellement reçu":"Asking price on the Vinted listing — not the amount actually received"}
                              style={{background:"#E7F3F0",color:"#1B6E62",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:"1px solid #BFE0D9"}}>
                              🏷️ {lang==='fr'?'Annonce':'Listing'} · {fmt(prixAnnonces[item.vinted_item_id])}
                            </span>
                          )}
                        </div>
                        {/* PIÈGE : `fmt(item.buy+(item.purchaseCosts||0))` affichait
                            « 0 € » pour un prix d'achat null (fmt lit null comme 0) —
                            l'utilisateur croyait avoir saisi 0 € au lieu de rien.
                            Inconnu → tiret. Un vrai 0 € (article gratuit) s'affiche
                            toujours 0 €. Le prix de VENTE, lui, reste affiché. */}
                        {/* Vente : même règle d'honnêteté que l'achat — un vendu
                            importé du dressing n'a PAS de prix de vente tant que
                            l'utilisateur ne l'a pas enregistré (Vinted ne le
                            communique pas). `fmt(null*qty)` affichait un faux
                            « Vente 0,00 € » ; inconnu → tiret. */}
                        <div style={{fontSize:11,color:"#A3A9A6",marginTop:4}}>{lang==='fr'?'Achat':'Bought'} {prixAchatConnu(item)?fmt(prixAchatNum(item)+(item.purchaseCosts||0)):'—'} → {lang==='fr'?'Vente':'Sold'} {item.sell!=null?fmt((item.sell||0)*qty):'—'}</div>
                      </div>
                      <div style={{textAlign:"right",minWidth:90,flexShrink:0}}>
                        {/* PIÈGE : `(item.margin||0)*qty` et `fmtp(item.marginPct)`
                            transformaient une marge inconnue en « 0 € / 0,0 % »,
                            c'est-à-dire en revente à prix coûtant — un chiffre faux
                            plutôt qu'un chiffre absent. */}
                        <div style={{fontWeight:700,fontSize:18,color:mc}}>{margeConnue?fmt(item.margin*qty):'—'}</div>
                        <div style={{fontSize:11,color:"#6B7A75",marginTop:1}}>{margeConnue&&item.marginPct!=null?fmtp(item.marginPct):'—'}</div>
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
                {!isPremium&&quotaFree>=FREE_STOCK_LIMIT_FALLBACK&&<span style={{fontSize:10,fontWeight:700,background:"#FFF4EE",color:"#F9A26C",borderRadius:99,padding:"2px 8px",border:"1px solid #F9A26C44"}}>{lang==='fr'?'Plan gratuit':'Free plan'}</span>}
                {(()=>{const _b=[...new Set(stock.filter(i=>filterType==="Tous"||i.type===filterType).map(i=>i.marque?.trim()?i.marque.trim().charAt(0).toUpperCase()+i.marque.trim().slice(1).toLowerCase():null).filter(Boolean))];if(!_b.length)return null;return(<>{!pillsExpandedStock&&(<button onClick={()=>setFilterMarque("Toutes")} style={{padding:"4px 10px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",background:filterMarque==="Toutes"?"#1B6E62":"#F2F0E9",color:filterMarque==="Toutes"?"#fff":"#6B7A75"}}>{lang==='en'?'All':'Toutes'}</button>)}<button onClick={()=>setPillsExpandedStock(v=>!v)} style={{padding:"3px 9px",borderRadius:99,fontSize:10,fontWeight:700,cursor:"pointer",border:"1px solid rgba(0,0,0,0.1)",background:"transparent",color:"#6B7A75",lineHeight:1.4,fontFamily:"inherit"}}>{pillsExpandedStock?`‹ ${lang==='en'?'Close':'Fermer'}`:`${lang==='en'?'Brands':'Marques'} (${_b.length}) ›`}</button></>);})()}
              </div>
              {(()=>{
                // Reflète le filtre actif (catégorie/marque/recherche) au lieu du total global :
                // même formule que stockQty/stockVal (App.jsx) mais appliquée à stockFiltre.
                const _fQty=stockFiltre.reduce((a,i)=>a+(i.quantite||1),0);
                // PIÈGE : `a+i.buy*(i.quantite||1)` sans même un `||0` — un seul
                // article au prix d'achat undefined produisait un NaN qui
                // contaminait TOUT le total (« NaN € »), et un null valait 0 €.
                // totalInvesti() écarte les articles au prix inconnu ; le compteur
                // d'articles (_fQty), lui, continue de tous les compter.
                const _fVal=totalInvesti(stockFiltre);
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
            {/* ── Prix d'achat manquants : compteur-invitation cliquable ──
                Même contrat que VentesTab : on n'oblige jamais, pas de rouge.
                Reste affiché à 0 quand le mode est ouvert (sinon plus de sortie). */}
            {(nbSansPrix>0||modePrixAchat)&&(
              <button className={`pa-call${modePrixAchat?" on":""}`}
                onClick={()=>{setModePrixAchat(v=>!v);setPaSel(new Set());setPaOpenId(null);setPaErr(null);}}>
                <span style={{fontSize:17,flexShrink:0}}>{modePrixAchat?"↩":"💡"}</span>
                <span style={{flex:1,minWidth:0}}>
                  <span className="n">
                    {modePrixAchat
                      ?(lang==='fr'?"Revenir à tout le stock":"Back to all stock")
                      :(lang==='fr'?`${nbSansPrix} article${nbSansPrix>1?"s":""} sans prix d'achat`
                          :`${nbSansPrix} item${nbSansPrix>1?"s":""} without purchase price`)}
                  </span>
                  <span className="sub">
                    {modePrixAchat
                      ?(nbSansPrix===0
                          ?(lang==='fr'?"Tout est complété 🎉":"All done 🎉")
                          :(lang==='fr'?"Vinted ne connaît pas ce que TU as payé — toi si. Un 0 (don, lot offert) est un prix valide."
                              :"Vinted doesn't know what YOU paid — you do. 0 (gift, free lot) is a valid price."))
                      :(lang==='fr'?"Complète-les pour qu'ils comptent dans ton total investi et tes marges"
                          :"Add them so they count in your invested total and margins")}
                  </span>
                </span>
              </button>
            )}

            {/* Barre de lot — le vide-grenier : « ces 10 articles, 2 € pièce ». */}
            {modePrixAchat&&paSelection.length>0&&(
              <div className="pa-bar">
                <span className="lbl">{lang==='fr'?`${paSelection.length} sélectionné${paSelection.length>1?"s":""}`:`${paSelection.length} selected`}</span>
                <input className="pa-input" inputMode="decimal" value={paLot}
                  onChange={e=>setPaLot(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();appliquerPaLot();}if(e.key==='Escape'){e.preventDefault();setPaSel(new Set());setPaLot("");}}}
                  placeholder={lang==='fr'?"2,50":"2.50"} aria-label={lang==='fr'?"Prix d'achat unitaire":"Unit purchase price"}/>
                <button className="apply" disabled={paBusy} onClick={appliquerPaLot}>
                  {paBusy?"…":(lang==='fr'?`Appliquer aux ${paSelection.length}`:`Apply to ${paSelection.length}`)}
                </button>
                <button className="pa-ghost" disabled={paBusy} onClick={()=>marquerInconnuStock(paSelection.map(i=>i.id)).then(ok=>{if(ok)setPaSel(new Set());})}>
                  {lang==='fr'?"Je ne sais plus":"I don't remember"}
                </button>
                <button className="pa-ghost" onClick={()=>{setPaSel(new Set());setPaLot("");}}>✕</button>
                <div style={{flexBasis:"100%",display:"flex",flexDirection:"column",gap:2}}>
                  <span className="pa-hint">{lang==='fr'?"Prix d'achat UNITAIRE, appliqué à chaque article sélectionné.":"UNIT purchase price, applied to each selected item."}</span>
                  {paErr?.id===null&&<span className="pa-err">{paErr.message}</span>}
                </div>
              </div>
            )}

            {/* ── É5.2 : republication en lot (bêta) — même patron que la
                saisie des prix d'achat. Le toggle n'apparaît que s'il y a
                quelque chose à republier ; en mode, seuls les articles
                ACTIONNABLES portent une case (bornes = pas de case, jamais un
                échec post-clic). */}
            {republishActif&&!modePrixAchat&&(repubActionnables.length>0||modeRepublish)&&(
              <button className={`pa-call${modeRepublish?" on":""}`}
                onClick={()=>{setModeRepublish(v=>!v);setRepubSel(new Set());setRepubLot(null);}}>
                <span style={{fontSize:17,flexShrink:0}}>{modeRepublish?"↩":"🔁"}</span>
                <span style={{flex:1,minWidth:0}}>
                  <span className="n">
                    {modeRepublish
                      ?(lang==='fr'?"Quitter la republication en lot":"Exit bulk repost")
                      :(lang==='fr'?`Republier en lot (${repubActionnables.length} article${repubActionnables.length>1?"s":""} possible${repubActionnables.length>1?"s":""})`
                          :`Bulk repost (${repubActionnables.length} item${repubActionnables.length>1?"s":""} available)`)}
                  </span>
                  <span className="sub">
                    {modeRepublish
                      ?(lang==='fr'?"Coche les annonces à faire remonter, puis lance — 1 Pépite par annonce."
                          :"Tick the listings to bump, then launch — 1 Nugget each.")
                      :(lang==='fr'?"Supprime puis recrée chaque annonce à l'identique pour la faire remonter dans le fil Vinted."
                          :"Deletes then recreates each listing identically to bump it in the Vinted feed.")}
                  </span>
                </span>
              </button>
            )}
            {modeRepublish&&(repubSel.size>0||repubLot)&&(
              <div className="pa-bar">
                {repubLot&&repubLot.fait<repubLot.total?(
                  <span className="lbl">
                    {lang==='fr'?`Mise en file ${repubLot.fait}/${repubLot.total}… (garde cet onglet ouvert)`:`Queuing ${repubLot.fait}/${repubLot.total}… (keep this tab open)`}
                  </span>
                ):(
                  <>
                    <span className="lbl">
                      {lang==='fr'
                        ?`${repubSel.size} sélectionné${repubSel.size>1?"s":""} · ${repubGratuit?'inclus dans ton plan':`${repubSel.size} Pépite${repubSel.size>1?"s":""}`} · ~${repubSel.size*5>=60?`${Math.ceil(repubSel.size*5/60)} h`:`${repubSel.size*5} min`}`
                        :`${repubSel.size} selected · ${repubGratuit?'included in your plan':`${repubSel.size} Nugget${repubSel.size>1?"s":""}`} · ~${repubSel.size*5>=60?`${Math.ceil(repubSel.size*5/60)} h`:`${repubSel.size*5} min`}`}
                    </span>
                    <button className="apply" disabled={repubSel.size===0}
                      onClick={()=>ouvrirFeuilleRepublication(repubActionnables.filter(i=>repubSel.has(i.id)))}>
                      {lang==='fr'?`Republier les ${repubSel.size}`:`Repost ${repubSel.size}`}
                    </button>
                    <button className="pa-ghost" onClick={()=>{setRepubSel(new Set(repubActionnables.map(i=>i.id)));}}>
                      {lang==='fr'?'Tout':'All'}
                    </button>
                    <button className="pa-ghost" onClick={()=>{setRepubSel(new Set());setRepubLot(null);}}>✕</button>
                  </>
                )}
                {repubLot&&repubLot.fait>=repubLot.total&&(
                  <div style={{flexBasis:"100%",display:"flex",flexDirection:"column",gap:2}}>
                    <span className="pa-hint">
                      {lang==='fr'
                        ?`${repubLot.total-repubLot.refus.length}/${repubLot.total} en file — ça tourne tout seul, Chrome ouvert. Reprise automatique si tu le fermes.`
                        :`${repubLot.total-repubLot.refus.length}/${repubLot.total} queued — runs on its own with Chrome open, resumes if you close it.`}
                    </span>
                    {repubLot.refus.length>0&&(
                      <span className="pa-err">
                        {lang==='fr'?`${repubLot.refus.length} refus : `:`${repubLot.refus.length} refused: `}
                        {repubLot.refus.slice(0,3).map(r=>`${r.titre??''} (${r.raison})`).join(' · ')}{repubLot.refus.length>3?'…':''}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

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
                            {/* Aperçu à données figées, mais même garde que la vraie
                                carte : nulle part un prix d'achat inconnu ne doit
                                pouvoir sortir en « 0 € ». */}
                            <div className="price">{prixAchatConnu(it)?fmt(prixAchatNum(it)*(it.quantite||1)):'—'}<span className="lbl">{lang==='fr'?'investi':'invested'}</span></div>
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
                {/* Mode « à compléter » : liste COMPLÈTE des incomplets (filtres
                    actifs respectés via stockFiltre, pas de plafond de 10). */}
                {/* É5 : estimation de durée quand la file de republication
                    grossit — jamais une promesse que le poll ne tient pas :
                    ~2 gestes espacés de 2 min + attentes 2-5 min ⇒ ~5-7 min
                    par annonce, arrondi large. */}
                {repubVivants>=3&&(
                  <div style={{background:"#EFF3F8",border:"1px solid #C7D6E5",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#334155",fontWeight:600,lineHeight:1.5,marginBottom:8}}>
                    ⏳ {lang==='fr'
                      ?`${repubVivants} republications en file — compte environ ${repubVivants*5>=60?`${Math.ceil(repubVivants*5/60)} h`:`${repubVivants*5}-${repubVivants*7} min`}, au rythme humain. Ça reprend tout seul si tu fermes Chrome.`
                      :`${repubVivants} reposts queued — expect about ${repubVivants*5>=60?`${Math.ceil(repubVivants*5/60)} h`:`${repubVivants*5}-${repubVivants*7} min`}, at a human pace. It resumes on its own if you close Chrome.`}
                  </div>
                )}
                {(modePrixAchat?stockFiltre.filter(paIncomplet):stockVisible).map(item=>{
                  const {loc:_itemLoc,rest:_itemDesc}=parseLocDesc(item.description);
                  // PIÈGE : `item.buy*qty+(purchaseCosts||0)` rendait NaN sur un
                  // prix d'achat absent et 0 € sur un null — la carte annonçait
                  // « 0 € investi » sur un article dont on ignore le coût.
                  // null ici = « on ne sait pas » ; l'affichage met un tiret.
                  const invested=prixAchatConnu(item)?prixAchatNum(item)*(item.quantite||1)+(item.purchaseCosts||0):null;
                  // Prix DEMANDÉ sur l'annonce Vinted (dernier relevé) — jamais
                  // confondu avec prix_vente, qui reste ce que l'utilisateur
                  // déclare avoir reçu.
                  const prixAnnonce=item.vinted_item_id?prixAnnonces[item.vinted_item_id]:null;
                  const jobsAll=jobsByInventaire[item.id]||[];
                  // Les jobs de retrait ciblé (action='delete') vivent à part :
                  // mélangés aux publish, un delete pending affichait « En
                  // cours… » (dépôt) et un delete failed un badge « Échec » de
                  // publication — deux mensonges.
                  // É5 (2026-08-05) : les jobs republish sortent AUSSI du flux
                  // générique — mêlés aux publish, un republish pending
                  // affichait « En cours… » (dépôt) et son needs_user ouvrait
                  // le mini-éditeur générique, qui re-pend SANS recapturer :
                  // exactement la boucle de péremption qu'on vient de fermer.
                  // Ils ont leur bloc dédié (badge + bouton) plus bas.
                  const jobs=jobsAll.filter(j=>j.action!=="delete"&&j.action!=="republish");
                  const repubLatest=(()=>{
                    let r=null;
                    for(const j of jobsAll){
                      if(j.action!=="republish")continue;
                      if(!r||Date.parse(j.created_at||0)>Date.parse(r.created_at||0))r=j;
                    }
                    return r;
                  })();
                  const repubEligible=republishActif&&item.vinted_item_id&&!item.disparu_le&&item.statut!=="vendu";
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
                  // Compteur de plateformes réellement en ligne : pilote le 3e état
                  // du bouton (4/4 = plus rien à publier).
                  const nbEnLigne=publishedActive.length;
                  const toutEnLigne=nbEnLigne>=RM_PLATFORMS.length;
                  // _table:'inventaire' — cible d'écriture explicite de la modale
                  // d'édition (les ids ventes/inventaire se chevauchent).
                  const openEdit=()=>setEditItem({...item,_table:'inventaire',frais:0,sell:item.sell??""});
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
                          {/* ── Prix d'achat manquant : saisie DANS la ligne ──
                              stopPropagation obligatoire : la carte entière
                              ouvre l'édition au clic. Le « je ne sais plus »
                              éteint l'invitation sans jamais écrire 0. */}
                          {paIncomplet(item)&&(
                            <div className="pa-line" onClick={e=>e.stopPropagation()}>
                              {modePrixAchat&&(
                                <input type="checkbox" className="pa-check" checked={paSel.has(item.id)}
                                  onChange={()=>setPaSel(prev=>{const n=new Set(prev);if(n.has(item.id))n.delete(item.id);else n.add(item.id);return n;})}
                                  aria-label={lang==='fr'?"Sélectionner cet article":"Select this item"}/>
                              )}
                              {/* É5.2 : case de republication — seulement sur
                                  les articles ACTIONNABLES (bornes = pas de
                                  case). */}
                              {modeRepublish&&repubEtat(item)==="ok"&&(
                                <input type="checkbox" className="pa-check" checked={repubSel.has(item.id)}
                                  onChange={()=>setRepubSel(prev=>{const n=new Set(prev);if(n.has(item.id))n.delete(item.id);else n.add(item.id);return n;})}
                                  aria-label={lang==='fr'?"Republier cet article":"Repost this item"}/>
                              )}
                              {paOpenId===item.id?(
                                <>
                                  <input className="pa-input" autoFocus inputMode="decimal" value={paDraft}
                                    placeholder={lang==='fr'?"12,50":"12.50"}
                                    onChange={e=>setPaDraft(e.target.value)}
                                    onKeyDown={e=>{
                                      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setPaOpenId(null);setPaDraft("");setPaErr(null);}
                                      if(e.key==='Enter'){e.preventDefault();e.stopPropagation();validerPaStock(item);}
                                    }}
                                    aria-label={lang==='fr'?"Prix d'achat":"Purchase price"}/>
                                  <button className="pa-ok" onMouseDown={e=>e.preventDefault()} onClick={()=>validerPaStock(item)}>✓</button>
                                  <button className="pa-ghost" onClick={()=>{setPaOpenId(null);setPaDraft("");marquerInconnuStock([item.id]);}}>
                                    {lang==='fr'?"je ne sais plus":"I don't remember"}
                                  </button>
                                </>
                              ):(
                                <button className="pa-chip" onClick={()=>{setPaOpenId(item.id);setPaDraft("");setPaErr(null);}}>
                                  + {lang==='fr'?"prix d'achat":"purchase price"}
                                </button>
                              )}
                              {paErr?.id===item.id&&<span className="pa-err">{paErr.message}</span>}
                            </div>
                          )}
                          {/* ── LOTS : dire ce que « Publier » fait vraiment (2026-07-22) ──
                              Un clic « Publier » sur un article à quantite > 1 ne met en
                              ligne QU'UNE unité : la RPC spend_coins_and_publish ne lit
                              jamais `quantite` et cross_post_jobs n'a aucune colonne de
                              quantité — une annonce = une pièce. Rien ne le disait, donc
                              publier un lot de 10 donnait l'impression d'avoir tout mis en
                              vente alors que 9 unités restaient en stock, sans compteur ni
                              rappel. Cette ligne rend le comportement réel visible.
                              ⚠️ AFFICHAGE SEUL — c'est le point ⑥ du plan « lots », livré
                              isolément. La gestion complète (décrément atomique à la vente,
                              ligne d'historique par unité vendue, republication manuelle de
                              l'unité suivante) touche sale-orchestration.ts et arrive APRÈS
                              la soumission : trop sensible pour la fenêtre actuelle.
                              Aucun lot n'ayant jamais été publié (41 lots, 0 job), personne
                              ne perd une fonction dont il se sert. */}
                          {(item.quantite||1)>1&&(
                            <div className="meta" style={{color:"#8A6100"}}>
                              {lang==='fr'
                                ? `Publier met 1 unité en ligne · ${(item.quantite||1)-1} restent en stock`
                                : `Publishing lists 1 unit · ${(item.quantite||1)-1} stay in stock`}
                            </div>
                          )}
                          {(enLigne||hasPending||failedJobs.length>0||needsUserJobs.length>0||item.plateforme||item.emplacement||prixAnnonce!=null)&&(
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
                                  title={j.error?humanizeJobError(j,lang):undefined}
                                  onClick={e=>{
                                    e.stopPropagation();
                                    if(j.platform_fields?.needsUserField){setNeedsUserJob(j);}
                                    else if(j.error){setFailJobModal(j);}
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
                                  title={j.error?humanizeJobError(j,lang):undefined}
                                  onClick={e=>{e.stopPropagation();if(j.error)setFailJobModal(j);}}
                                  style={{background:"#FBEDEC",border:"1px solid #EFC2BE",color:"#8C2F28",cursor:j.error?"pointer":"default"}}
                                >
                                  ⚠️ {lang==="en"?"Failed":"Échec"} {PLATFORM_LABELS[j.platform]||j.platform}
                                </div>
                              ))}
                              {!enLigne&&!hasPending&&item.plateforme&&<div className="micon ic-plateforme">🏪 {item.plateforme}</div>}
                              {/* Prix de l'ANNONCE (demandé, pas encaissé) —
                                  lu dans vinted_listing_snapshots, une seule
                                  requête pour toute la liste. */}
                              {prixAnnonce!=null&&(
                                <div className="micon ic-plateforme" title={lang==='fr'?"Prix affiché sur l'annonce Vinted — pas un prix de vente réalisé":"Asking price on the Vinted listing — not a realized sale price"}>
                                  🏷️ {lang==='fr'?'Annonce Vinted':'Vinted listing'} · {fmt(prixAnnonce)}
                                </div>
                              )}
                              {item.emplacement&&<div className="micon ic-loc">📦 {item.emplacement}</div>}
                              {/* É5 : état de la republication — badge dédié,
                                  jamais confondu avec la publication. */}
                              {repubEligible&&repubLatest&&(()=>{
                                const st=repubLatest.status;
                                const step=repubLatest.platform_fields?.republish_step??"captured";
                                if(st==="pending"&&step==="deleted")return(
                                  <div className="micon" style={{background:"#EFF3F8",border:"1px solid #C7D6E5",color:"#334155"}}>
                                    🔁 {lang==='fr'?'Republication : recréation en attente':'Repost: recreation pending'}
                                  </div>);
                                if(st==="pending"||st==="processing")return(
                                  <div className="micon" style={{background:"#EFF3F8",border:"1px solid #C7D6E5",color:"#334155"}}>
                                    🔁 {lang==='fr'?'Republication en cours…':'Reposting…'}
                                  </div>);
                                if(st==="needs_user")return(
                                  <div className="micon" title={repubLatest.error??undefined}
                                    onClick={e=>{e.stopPropagation();if(repubLatest.error)alert(repubLatest.error);}}
                                    style={{background:"#FFF6E3",border:"1px solid #EED9A6",color:"#8A6100",cursor:"pointer"}}>
                                    🔁✋ {lang==='fr'?'Republication à relancer':'Repost needs action'}
                                  </div>);
                                return null;
                              })()}
                              {repubEligible&&repubMsgs[item.id]&&(
                                <div className="micon"
                                  onClick={e=>{e.stopPropagation();setRepubMsgs(m=>({...m,[item.id]:null}));}}
                                  style={repubMsgs[item.id].ton==='vert'
                                    ?{background:"#F0FDFB",border:"1px solid rgba(13,148,136,0.25)",color:"#1B6E62",cursor:"pointer"}
                                    :{background:"#FFF7ED",border:"1px solid #FED7AA",color:"#9A3412",cursor:"pointer"}}>
                                  {repubMsgs[item.id].texte}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="right">
                          <div className="price">{invested!==null?fmt(invested):'—'}<span className="lbl">{lang==='fr'?'investi':'invested'}</span></div>
                          <div className="btn-stack">
                            {/* 3 états, une seule source de vérité : publishedActive
                                (le même calcul que la pastille « En ligne » et les
                                logos ci-dessus — une plateforme retirée/échouée/
                                annulée en sort toute seule, le bouton redevient
                                actif sans code dédié).
                                  0/4   → « Publier »
                                  1-3/4 → « Publier » AUSSI, même libellé : le stepper
                                          n'ouvrira que les plateformes MANQUANTES.
                                          « Republier » était un mensonge — FillSell ne
                                          retouche jamais une annonce déjà en ligne
                                          (relancer une plateforme published créait un
                                          SECOND job, donc une annonce en double).
                                  4/4   → inerte, « En ligne (4/4) » : plus rien à faire.

                                ⚠️ PAS DE GATE DE TIER ICI (2026-07-21). Ce bouton
                                était rendu sous `isPro`, or isPro = profiles.is_pro
                                SEUL (App.jsx) — donc ni un Free ni un Premium
                                standard ne voyaient « Publier » : le cross-post,
                                qui est LA fonction du produit, était invisible pour
                                tout le monde sauf le tier Pro. Ce n'était pas le
                                packaging voulu : tout le monde cross-poste, et la
                                différenciation se fait aux PÉPITES, côté serveur —
                                generate-listing facture déjà les non-premium en
                                pièces (402 + prix/solde) au lieu de refuser. */}
                            <button
                                className={toutEnLigne?"btn-publier is-complete":"btn-publier"}
                                disabled={toutEnLigne||detailFetchId===item.id}
                                onClick={e=>{
                                  e.stopPropagation();
                                  // Garde au niveau du HANDLER, pas seulement visuelle :
                                  // le stepper ne doit pas pouvoir s'ouvrir sans une
                                  // seule plateforme à publier.
                                  if(toutEnLigne||detailFetchId)return;
                                  if(extensionNeverSeen===true){setExtPitchItem(item);}
                                  else if(shouldShowExtensionReminder()){setExtReminderItem(item);}
                                  else{publierAvecDetail(item);}
                                }}
                              >
                                {detailFetchId===item.id
                                  ?(lang==='fr'?'Récupération…':'Fetching…')
                                  :toutEnLigne
                                  ?(lang==='fr'?`En ligne (${nbEnLigne}/${RM_PLATFORMS.length})`:`Live (${nbEnLigne}/${RM_PLATFORMS.length})`)
                                  :(lang==='fr'?'Publier':'Publish')}
                              </button>
                            <button className="btn-vendre" onClick={e=>{e.stopPropagation();markSold(item);}}>
                              {lang==='fr'?'Vendre':'Sell'}
                            </button>
                            {/* É5 : Republier — remonte l'annonce Vinted dans le
                                fil (suppression puis recréation à l'identique).
                                Le bouton dit POURQUOI il est inerte, il
                                n'échoue jamais après le clic sur une borne
                                connue (cadence 24 h, republish vivant). */}
                            {repubEligible&&(()=>{
                              const st=repubLatest?.status;
                              const vivant=st==="pending"||st==="processing"||st==="needs_user";
                              if(st==="needs_user")return(
                                <button className="btn-vendre" disabled={repubBusy===item.id}
                                  onClick={e=>{e.stopPropagation();relancerRepublication(item,repubLatest);}}
                                  style={{opacity:repubBusy===item.id?0.6:1}}>
                                  {repubBusy===item.id?(lang==='fr'?'Relance…':'Relaunching…'):(lang==='fr'?'🔁 Relancer':'🔁 Relaunch')}
                                </button>);
                              if(vivant)return(
                                <button className="btn-vendre" disabled style={{opacity:0.55,cursor:"default"}}>
                                  {lang==='fr'?'🔁 En cours':'🔁 Running'}
                                </button>);
                              if(st==="published"&&repubLatest?.platform_fields?.recreated_at
                                &&Date.now()-Date.parse(repubLatest.platform_fields.recreated_at)<24*3600*1000){
                                const restant=Math.max(1,Math.ceil((24*3600*1000-(Date.now()-Date.parse(repubLatest.platform_fields.recreated_at)))/3600000));
                                return(
                                  <button className="btn-vendre" disabled style={{opacity:0.55,cursor:"default"}}
                                    title={lang==='fr'?`Une republication par article et par 24 h — de nouveau possible dans ~${restant} h.`:`One repost per item per 24 h — available again in ~${restant} h.`}>
                                    {lang==='fr'?`🔁 Dans ~${restant} h`:`🔁 In ~${restant} h`}
                                  </button>);
                              }
                              return(
                                <button className="btn-vendre" disabled={repubBusy===item.id}
                                  onClick={e=>{
                                    e.stopPropagation();
                                    if(extensionNeverSeen===true){setExtPitchItem(item);return;}
                                    ouvrirFeuilleRepublication([item]);
                                  }}
                                  style={{opacity:repubBusy===item.id?0.6:1}}
                                  title={repubGratuit
                                    ?(lang==='fr'?"Inclus dans ton plan. Supprime puis recrée l'annonce à l'identique pour la faire remonter dans le fil Vinted.":"Included in your plan. Deletes then recreates the listing identically to bump it in the Vinted feed.")
                                    :(lang==='fr'?"Supprime puis recrée l'annonce à l'identique pour la faire remonter dans le fil Vinted.":"Deletes then recreates the listing identically to bump it in the Vinted feed.")}>
                                  {repubBusy===item.id
                                    ?(lang==='fr'?'Capture…':'Capturing…')
                                    :repubGratuit
                                    ?(lang==='fr'?'🔁 Republier':'🔁 Repost')
                                    :(lang==='fr'?`🔁 Republier${republishPrice!=null?` (${republishPrice} Pépite${republishPrice>1?'s':''})`:''}`
                                                 :`🔁 Repost${republishPrice!=null?` (${republishPrice} Nugget${republishPrice>1?'s':''})`:''}`)}
                                </button>);
                            })()}
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

            {/* Import du dressing Vinted — monté UNE seule fois, HORS du
                ternaire vide/rempli : le composant porte l'état du run (sonde
                extension, poll de progression) ; une instance par branche
                serait démontée/remontée au premier article importé, état
                perdu en plein suivi. Inventaire vide : sous les CTA de saisie,
                précédé du séparateur « OU » (une alternative, pas le chemin
                principal). Inventaire rempli : sous la liste, accès discret
                pour actualiser le dressing. */}
            {/* ⛔ MASQUAGE TEMPORAIRE (03/08) — retirer la condition
                syncDressingVisiblePour quand la 0.5.0 sera servie par le CWS
                (procédure dans vintedSync.js). Le séparateur « OU » fait
                partie du bloc : sans ça, l'état vide montrerait un « OU »
                suivi de rien. */}
            {syncDressingVisiblePour(user?.email)&&(
              <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:stock.length===0?12:0}}>
                {stock.length===0&&(
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{flex:1,height:1,background:"rgba(0,0,0,0.08)"}}/>
                    <span style={{fontSize:11,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.07em",flexShrink:0}}>
                      {lang==='fr'?'OU':'OR'}
                    </span>
                    <div style={{flex:1,height:1,background:"rgba(0,0,0,0.08)"}}/>
                  </div>
                )}
                <VintedDressingSync
                  lang={lang} user={user} isNative={isNative}
                  extensionStatus={extensionStatus}
                  source={stock.length===0?'stock_empty':'stock_liste'}
                  onDone={rafraichirApresSync}
                />
                {/* É6 : automatisation de la republication — avantage Pro,
                    réglable, arrêt propre affiché. Même masquage bêta que le
                    bouton Republier. */}
                {republishActif&&(
                  <RepublishAutoBlock lang={lang} user={user} isPro={isPro} openUpgradeModal={openUpgradeModal}/>
                )}
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
          onContinue={()=>{const it=extReminderItem;setExtReminderItem(null);publierAvecDetail(it);}}
        />
      )}
      {/* Accroche extension (2026-08-04) : remplace le rappel quand l'extension
          n'a JAMAIS été vue — le rappel supposait qu'elle pouvait être là,
          cette hypothèse est fausse ici. « Préparer mon annonce » ouvre le
          stepper normalement ; le mur réel est au clic Publier (garde stepper
          + RPC). Le bouton « vérifier » relance directement le parcours dès
          que le profil est stampé. */}
      {extPitchItem&&(
        <ExtensionPitchScreen
          lang={lang}
          onClose={()=>setExtPitchItem(null)}
          onContinue={()=>{const it=extPitchItem;setExtPitchItem(null);publierAvecDetail(it);}}
          supabase={supabase}
          userId={user?.id}
          onExtensionSeen={()=>{const it=extPitchItem;setExtPitchItem(null);publierAvecDetail(it);}}
        />
      )}
      {/* É5 : feuille de prix de republication — solo et lot passent par elle. */}
      {repubSheet&&(
        <RepublishSheet
          lang={lang}
          items={repubSheet.items}
          gratuit={repubGratuit}
          prixUnitaire={republishPrice}
          onClose={()=>setRepubSheet(null)}
          onConfirm={(cibles)=>{
            setRepubSheet(null);
            if(cibles.length===1)lancerRepublication(cibles[0].item,cibles[0].prix);
            else lancerRepublicationLot(cibles);
          }}
        />
      )}
      {/* Mini-éditeur « À compléter » (socle needs_user, 2026-07-19).
          Fermeture sans valider → aucun écrit, le job reste needs_user et le
          badge reste. Après validation : patch LOCAL immédiat (le badge
          s'éteint sans attendre le poll de 20 s), la relecture périodique
          confirme ensuite l'état réel. */}
      {/* Échec détaillé + action directe (chantier onboarding 2026-07-27).
          Portail document.body OBLIGATOIRE : StockTab vit dans le conteneur
          scroll (.wrap.page-pad) et le WKWebView iOS peint les position:fixed
          d'un scroller touch SOUS la tab bar / le FAB (même piège que la
          feuille photo Lens, fix 41c2b2d). Le message d'erreur est déjà
          humanisé côté extension ; on y ajoute le lien de connexion ou du
          brouillon LBC quand il s'applique. */}
      {/* Note douce du détail Vinted (repli) — portail à z-index supérieur au
          stepper : elle doit rester lisible PAR-DESSUS l'écran qui vient de
          s'ouvrir. Ton invitation, jamais alerte : rien n'a échoué de grave,
          il manque juste un texte que l'utilisateur peut poser à la main. */}
      {detailNote&&createPortal(
        <div style={{position:"fixed",left:"50%",bottom:24,transform:"translateX(-50%)",zIndex:12000,maxWidth:"min(92vw,420px)",background:"#fff",border:"1px solid rgba(47,158,144,0.35)",borderRadius:14,padding:"11px 16px",boxShadow:"0 12px 32px -10px rgba(16,32,27,0.35)",fontSize:12.5,lineHeight:1.5,color:"#10201B",fontFamily:"inherit"}}>
          💬 {detailNote}
        </div>,
        document.body
      )}
      {failJobModal&&createPortal(
        <div onClick={()=>setFailJobModal(null)} style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(16,32,27,0.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,padding:"24px",width:"min(92vw,440px)",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",fontFamily:"inherit"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <PlatformLogo platform={failJobModal.platform} size={24}/>
              <div style={{fontSize:16,fontWeight:700,color:"#10201B"}}>
                {(PLATFORM_LABELS[failJobModal.platform]||failJobModal.platform)} — {lang==="en"?"not published":"non publiée"}
              </div>
            </div>
            {/* humanizeJobError (2026-07-30) : la colonne error garde le
                diagnostic complet (SQL/support), la modale n'affiche que la
                phrase courte — le message technique brut (fichier, URL d'API,
                dump JSON) s'affichait ici tel quel. failJobAction, lui,
                continue de tester l'erreur BRUTE (motifs connexion/brouillon
                posés côté extension). */}
            <div style={{fontSize:14,color:"#3A443F",lineHeight:1.6,marginBottom:16,whiteSpace:"pre-wrap"}}>{humanizeJobError(failJobModal,lang)}</div>
            {(()=>{const a=failJobAction(failJobModal,lang);return a?(
              <a href={a.url} target="_blank" rel="noopener noreferrer"
                style={{display:"block",textAlign:"center",padding:"12px",borderRadius:999,background:"linear-gradient(120deg,#2F9E90,#1B6E62)",color:"#fff",fontSize:14,fontWeight:700,textDecoration:"none",marginBottom:8}}>
                {a.label} ↗
              </a>
            ):null;})()}
            <button onClick={()=>setFailJobModal(null)}
              style={{width:"100%",padding:"11px",borderRadius:999,background:"#fff",border:"1px solid #E7E3D8",fontSize:13.5,fontWeight:600,color:"#6B7A75",cursor:"pointer",fontFamily:"inherit"}}>
              {lang==="en"?"Close":"Fermer"}
            </button>
          </div>
        </div>,
        document.body
      )}
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
      {/* alreadyPublished : plateformes DÉJÀ en ligne pour cet article. Le stepper
          les exclut de la sélection et les verrouille — on ne repasse jamais sur
          une annonce publiée. Recalculé à chaque rendu (et non figé à l'ouverture)
          pour rester d'accord avec la carte si un job bascule pendant que le
          stepper est ouvert ; même calcul que le bouton (computeRemovalInfo). */}
      {publishItem&&(
        <ListingPreviewScreen
          inventaireId={publishItem.id}
          userId={user.id}
          alreadyPublished={computeRemovalInfo(jobsByInventaire[publishItem.id]||[]).publishedActive}
          initialPhotos={(Array.isArray(publishItem.photos)?publishItem.photos:[])
            // Deux formats coexistent en base : objets {type,url} (flux photos
            // retouchées) et STRINGS nues (URLs CDN Vinted écrites par la sync
            // du dressing). `p?.url` sur une string rend undefined — le filter
            // vidait donc les photos des articles importés et le stepper
            // réclamait un upload à des annonces qui ont déjà leurs photos.
            .map(p=>typeof p==='string'?p:(p?.url||p?.original||p?.enhanced||p?.bg_removed))
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
          onJobsQueued={(invId,platforms)=>{
            // Patch optimiste (2026-07-25, S6) : la relance d'une plateforme en
            // échec (et toute publication) affichait « Échec » jusqu'à 20 s
            // après le clic, faute de patch local sur CE chemin — le retrait
            // par logo et le mini-éditeur needs_user patchent déjà ainsi. Les
            // lignes synthétiques 'pending' rendent le badge « En cours… »
            // immédiat (latestByPlatform prend le job le plus récent, donc le
            // badge Échec s'éteint aussi) ; la relecture 20 s les remplace par
            // les vraies lignes.
            if(!invId||!platforms?.length)return;
            const now=new Date().toISOString();
            setJobsByInventaire(prev=>{
              const cur=[...(prev[invId]||[])];
              for(const p of platforms){
                cur.push({id:`optimistic-${invId}-${p}-${now}`,inventaire_id:invId,platform:p,
                  status:"pending",error:null,created_at:now,platform_fields:null,
                  action:"publish",listing_url:null,title:null});
              }
              return {...prev,[invId]:cur};
            });
          }}
          supabase={supabase}
          lang={lang}
          isPremium={isPremium}
          isPro={isPro}
          onUpgrade={openUpgradeModal}
          extensionNeverSeen={extensionNeverSeen}
          // Photos déjà retouchées PAR NOUS (2026-08-05) : détection par la
          // source UNIQUE isRetouchedPhotoEntry — la première version de ce
          // calcul (enhanced/bg_removed seuls) ne matchait que le schéma
          // HISTORIQUE, or le pipeline actuel écrit des {type,url} dont la
          // photo 0 retouchée garde type:'original' : l'URL /enhanced/ fait
          // foi. Calculé ICI, sur les photos BRUTES de la ligne — le stepper
          // ne reçoit que des URLs aplaties.
          alreadyRetouched={Array.isArray(publishItem.photos) &&
            publishItem.photos.some(isRetouchedPhotoEntry)}
        />
      )}
    </>
  );
});

export default StockTab;
