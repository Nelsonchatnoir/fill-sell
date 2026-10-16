// ═══════════════════════════════════════════════════════════════════════════
// BORDEREAUX — TÉLÉCHARGER, PARTAGER, IMPRIMER, PARTOUT (bêta, 16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Le binaire mobile n'a NI @capacitor/share NI @capacitor/filesystem, et une
// mise à jour OTA ne peut pas en ajouter (plugin natif) : seul le web et le
// navigateur système (@capacitor/browser, présent) sont disponibles. D'où :
//   · iOS (app) : feuille de partage du système par navigator.share (fichier),
//     qui porte « Imprimer », « Enregistrer dans Fichiers » et l'app de
//     l'imprimante d'étiquettes ; si WKWebView la refuse, repli : le fichier
//     est déposé dans le dossier privé du compte (bucket `bordereaux`,
//     `<uid>/impressions/…`, effacé avec les copies) et s'ouvre dans le
//     navigateur intégré (aperçu du PDF + bouton de partage) ;
//   · Android (app) : la WebView n'a pas de partage web (navigator.share
//     absent) et ignore les téléchargements → toujours le dépôt + Chrome, qui
//     télécharge ou affiche le PDF (puis Partager / Imprimer) ;
//   · web mobile : partage du navigateur (fichier), sinon téléchargement ;
//   · ordinateur : téléchargement, impression par la fenêtre d'impression du
//     navigateur (iframe), partage seulement si le navigateur sait partager un
//     fichier.
// ⛔ navigator.share exige le geste de la personne : le fichier doit être PRÊT
//    avant l'appui (l'aperçu le fabrique d'avance) — rien n'est attendu entre
//    l'appui et l'appel.
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export function environnement() {
  let natif = false; let plateforme = 'web';
  try { natif = Capacitor.isNativePlatform(); plateforme = Capacitor.getPlatform(); } catch { /* web */ }
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent ?? '') : '';
  const ipadBureau = typeof navigator !== 'undefined' && /Macintosh/.test(ua) && Number(navigator.maxTouchPoints) > 1;
  const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || ipadBureau;
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua);
  return { natif, plateforme: natif ? plateforme : 'web', mobile, safari };
}

/** Un File (le nom compte : il devient celui du fichier partagé). */
export function fichier(octets, nom, type = 'application/pdf') {
  try { return new File([octets], nom, { type }); } catch { return null; }
}

/** Le partage d'un FICHIER est-il possible ici (feuille de partage du système) ? */
export function partageFichierPossible(f) {
  try {
    return Boolean(f) && typeof navigator !== 'undefined' && typeof navigator.share === 'function'
      && typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] });
  } catch { return false; }
}

/**
 * Ce que les boutons font ICI : {partager: 'partage'|'depot'|'telechargement',
 * imprimer: 'partage'|'depot'|'impression'|'onglet'}. Sert aux libellés.
 */
export function voies(f) {
  const env = environnement();
  const partage = partageFichierPossible(f);
  if (env.natif && env.plateforme === 'android') return { partager: 'depot', imprimer: 'depot', env };
  if (env.natif) return { partager: partage ? 'partage' : 'depot', imprimer: partage ? 'partage' : 'depot', env };
  if (env.mobile) return { partager: partage ? 'partage' : 'telechargement', imprimer: partage ? 'partage' : 'onglet', env };
  // Ordinateur : on télécharge et on imprime (Safari n'imprime pas un PDF dans un cadre : nouvel onglet).
  return { partager: 'telechargement', imprimer: env.safari ? 'onglet' : 'impression', env };
}

function telecharger(octets, nom, type) {
  const url = URL.createObjectURL(new Blob([octets], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = nom; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return { ok: true, voie: 'telechargement' };
}

let cadreImpression = null;
function imprimerDansCadre(octets, type) {
  const url = URL.createObjectURL(new Blob([octets], { type }));
  if (cadreImpression) { try { URL.revokeObjectURL(cadreImpression.dataset.url); cadreImpression.remove(); } catch { /* déjà parti */ } }
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
  f.dataset.url = url; f.src = url;
  cadreImpression = f;
  return new Promise((ok) => {
    f.onload = () => {
      try { f.contentWindow.focus(); f.contentWindow.print(); ok({ ok: true, voie: 'impression' }); }
      catch { window.open(url, '_blank', 'noopener'); ok({ ok: true, voie: 'onglet' }); }
    };
    document.body.appendChild(f);
  });
}

function ouvrirOnglet(octets, type) {
  const url = URL.createObjectURL(new Blob([octets], { type }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 300_000);
  return { ok: true, voie: 'onglet' };
}

/**
 * Le dépôt pour l'app (iOS en repli, Android toujours) : le fichier rejoint le
 * dossier privé du compte, puis s'ouvre dans le navigateur système par une
 * adresse signée (10 min). Une copie DÉJÀ déposée (`chemin`) s'ouvre sans
 * nouveau dépôt.
 */
async function deposerEtOuvrir({ supabase, octets, nom, type, chemin }) {
  const env = environnement();
  if (!supabase) return { ok: false, motif: 'session' };
  let cible = chemin ?? null;
  if (!cible) {
    const { data } = await supabase.auth.getSession();
    const uid = data?.session?.user?.id;
    if (!uid) return { ok: false, motif: 'session' };
    cible = `${uid}/impressions/${Date.now()}-${nom.replace(/[^A-Za-z0-9_.-]/g, '-')}`;
    const { error } = await supabase.storage.from('bordereaux').upload(cible, new Blob([octets], { type }), { contentType: type, upsert: false });
    if (error) return { ok: false, motif: 'depot' };
  }
  // Android : Chrome télécharge le PDF sous son nom ; iOS : l'aperçu intégré l'affiche.
  const opts = env.plateforme === 'android' ? { download: nom } : undefined;
  const { data: s, error: e2 } = await supabase.storage.from('bordereaux').createSignedUrl(cible, 600, opts);
  if (e2 || !s?.signedUrl) return { ok: false, motif: 'adresse' };
  await Browser.open({ url: s.signedUrl }).catch(() => {});
  return { ok: true, voie: 'depot', chemin: cible };
}

/**
 * PARTAGER (ou télécharger, là où le partage d'un fichier n'existe pas).
 * À appeler DIRECTEMENT dans le gestionnaire d'appui, octets déjà prêts.
 * Rend {ok, voie, annule?, motif?}.
 */
export async function partager({ octets, nom, type = 'application/pdf', titre, supabase, chemin }) {
  const f = fichier(octets, nom, type);
  const v = voies(f);
  if (v.partager === 'partage') {
    try {
      await navigator.share({ files: [f], title: titre ?? nom });
      return { ok: true, voie: 'partage' };
    } catch (e) {
      if (e?.name === 'AbortError') return { ok: false, annule: true, voie: 'partage' };
      if (!v.env.natif) return telecharger(octets, nom, type);
      return deposerEtOuvrir({ supabase, octets, nom, type, chemin });
    }
  }
  if (v.partager === 'depot') return deposerEtOuvrir({ supabase, octets, nom, type, chemin });
  return telecharger(octets, nom, type);
}

/** TÉLÉCHARGER (ordinateur) ; sur l'app, c'est la même voie que partager. */
export async function telechargerFichier({ octets, nom, type = 'application/pdf', supabase, chemin, titre }) {
  const env = environnement();
  if (env.natif) return partager({ octets, nom, type, supabase, chemin, titre });
  return telecharger(octets, nom, type);
}

/**
 * IMPRIMER : la fenêtre d'impression du navigateur sur ordinateur ; sur
 * téléphone, la feuille de partage (qui porte « Imprimer » et l'app de
 * l'imprimante), sinon l'ouverture du PDF.
 */
export async function imprimer({ octets, nom, type = 'application/pdf', titre, supabase, chemin }) {
  const f = fichier(octets, nom, type);
  const v = voies(f);
  if (v.imprimer === 'impression') return imprimerDansCadre(octets, type);
  if (v.imprimer === 'partage') return partager({ octets, nom, type, titre, supabase, chemin });
  if (v.imprimer === 'depot') return deposerEtOuvrir({ supabase, octets, nom, type, chemin });
  return ouvrirOnglet(octets, type);
}
