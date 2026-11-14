// ═══════════════════════════════════════════════════════════════════════════
// L'ALERTE « 0 PLATEFORME CONNECTÉE 30 MIN APRÈS L'ESSAI » — règles pures (08/11/2026, urgent U5 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Constat du 08/11 (premier vrai client Cloud, web mobile + Stripe) : essai démarré, poste prêt, mais AUCUNE plateforme
// connectée — et personne ne le savait. Règle : un client FillSell Cloud (profiles.cloud_voie) dont l'essai a démarré
// (profiles.cloud_essai_debut) il y a 30 min ou plus, et qui n'a encore AUCUNE plateforme connectée (aucune ligne
// public.cloud_coffre connecte = true hors « fillsell », aucune connexion isolée platform_settings.<pf>.cloud_isole),
// déclenche UN mail à support@fillsell.app (la même adresse que l'alerte d'argent : ALERTE_CLOUD_DESTINATAIRE).
// ⛔ AUCUN MAIL AU CLIENT (ordre de Nico) : seule la boîte de FillSell est prévenue.
// GARDE-FOUS :
//   · un mail par essai : la clé est réservée dans public.cloud_mails (même registre que l'alerte d'argent ; la colonne
//     evenement n'accepte que les événements d'argent → 'essai_debut', sous une clé à part « alerte:zero_connexion: ») ;
//   · fenêtre bornée (FENETRE_MS) : un vieil essai n'alerte jamais en retard de plusieurs jours ;
//   · lots bornés (LIMITE_COMPTES), lecture seule hors du registre ; ne lève jamais (l'appelant avale tout).
// Le passage : email-tunnel, cron horaire « email-tunnel-job-relaunch-hourly » (avant la fenêtre de nuit des mails
// clients : l'alerte va à FillSell, pas au client). Délai réel : 30 à 90 min après le début de l'essai.
// Testé sans réseau : scripts/cloud-alerte-connexion-selftest.mjs.

import { ALERTE_CLOUD_DESTINATAIRE, dateParis } from './cloud-alerte-nico.js';
import { mailNico } from './alertes-nico.js';

export const DELAI_SANS_CONNEXION_MS = 30 * 60_000;
export const FENETRE_MS = 72 * 3_600_000;
export const LIMITE_COMPTES = 200;
export const EVENEMENT_REGISTRE = 'essai_debut';
export const TYPE_ALERTE_SANS_CONNEXION = 'cloud_alerte_zero_connexion';
export const PLATEFORMES_CONNEXION = Object.freeze(['vinted', 'leboncoin', 'beebs', 'depop']);
const NOMS = Object.freeze({ vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop' });
const NOM_CANAL = Object.freeze({ stripe: 'Stripe (carte, web)', apple: 'Apple (App Store)', google: 'Google Play' });

const instant = (v) => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** La clé du registre pour CET essai (un essai = un début daté). */
export function cleSansConnexion(essaiDebut) {
  const t = instant(essaiDebut);
  return `alerte:zero_connexion:${t == null ? 'inconnu' : new Date(t).toISOString()}`.slice(0, 400);
}

/** La fenêtre de lecture (ISO) : essais démarrés entre `depuis` et `jusqua`. */
export function fenetreLecture(maintenant = Date.now()) {
  return { depuis: new Date(maintenant - FENETRE_MS).toISOString(), jusqua: new Date(maintenant - DELAI_SANS_CONNEXION_MS).toISOString() };
}

/** Les plateformes connectées d'un compte (pur) : coffre connecte = true, ou connexion isolée. */
export function plateformesConnectees({ coffre = [], platformSettings = null } = {}) {
  const ok = new Set();
  for (const l of coffre ?? []) {
    if (l && l.connecte === true && PLATEFORMES_CONNEXION.includes(String(l.plateforme))) ok.add(String(l.plateforme));
  }
  for (const p of PLATEFORMES_CONNEXION) {
    if (platformSettings?.[p]?.cloud_isole?.connecte === true) ok.add(p);
  }
  return [...ok];
}

/**
 * Les comptes à alerter (pur).
 *   comptes : [{ id, email, cloud_voie, cloud_essai_debut, cloud_canal, platform_settings }]
 *   coffre  : [{ user_id, plateforme, connecte }]
 *   vus     : [{ user_id, feature, created_at }] — l'écran de connexion ouvert (cloud_me_connecter_ouvert,
 *             cloud_connexion_ouverte, cloud_connexion_auto), pour le dire dans l'alerte.
 * Rend [{ userId, email, canal, essaiDebut, minutes, choisies, ecranVu }].
 */
export function comptesSansConnexion({ comptes = [], coffre = [], vus = [], maintenant = Date.now() } = {}) {
  const sortie = [];
  for (const c of comptes ?? []) {
    if (!c?.id || c.cloud_voie !== true) continue;
    const debut = instant(c.cloud_essai_debut);
    if (debut == null) continue;
    const age = maintenant - debut;
    if (age < DELAI_SANS_CONNEXION_MS || age > FENETRE_MS) continue;
    const lignes = (coffre ?? []).filter((l) => l?.user_id === c.id);
    if (plateformesConnectees({ coffre: lignes, platformSettings: c.platform_settings ?? null }).length > 0) continue;
    const brut = c.platform_settings?.plateformes_vendeur;
    const choisies = (Array.isArray(brut) ? brut.map(String) : []).filter((p) => PLATEFORMES_CONNEXION.includes(p));
    const ecranVu = (vus ?? []).filter((v) => v?.user_id === c.id && (instant(v.created_at) ?? 0) >= debut).length;
    sortie.push({
      userId: c.id, email: typeof c.email === 'string' && c.email.includes('@') ? c.email : null,
      canal: c.cloud_canal ?? null, essaiDebut: new Date(debut).toISOString(), minutes: Math.floor(age / 60_000), choisies, ecranVu,
    });
  }
  return sortie;
}

/** Le mail (pur) : { to, sujet, html, type }. */
export function texteAlerteSansConnexion(a, maintenant = Date.now()) {
  const email = a?.email ?? '(adresse inconnue)';
  const canal = NOM_CANAL[a?.canal] ?? 'inconnu';
  const choisies = (a?.choisies ?? []).map((p) => NOMS[p] ?? p);
  const lignes = [
    ['Situation', `Aucune plateforme connectée ${a?.minutes ?? '?'} min après le début de l’essai`],
    ['Compte', `${email}${a?.userId ? ` — ${a.userId}` : ''}`],
    ['Canal', canal],
    ['Essai démarré', `${dateParis(a?.essaiDebut) ?? '?'} (heure de Paris)`],
    ['Plateformes choisies', choisies.length ? choisies.join(', ') : 'aucune choisie (toutes les plateformes du Cloud)'],
    ['Écran de connexion ouvert', a?.ecranVu > 0 ? `oui (${a.ecranVu} fois)` : 'jamais'],
    ['Lu le', `${dateParis(maintenant) ?? '?'} (heure de Paris)`],
    ['Mail au client', 'aucun (règle : seule la boîte de FillSell est prévenue)'],
  ];
  const sujet = `[FillSell Cloud] 0 plateforme connectée ${a?.minutes ?? '?'} min après l’essai — ${email}`;
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F2F2EE;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;padding:26px;">
    <h1 style="margin:0 0 14px;font-size:18px;font-family:sans-serif;color:#10201B;">FillSell Cloud — aucune plateforme connectée</h1>
    <table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:13px;">
      ${lignes.map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#6B7280;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;color:#111827;word-break:break-word;"><strong>${esc(v)}</strong></td></tr>`).join('')}
    </table>
  </div>
</body></html>`;
  return { to: ALERTE_CLOUD_DESTINATAIRE, sujet, html, type: TYPE_ALERTE_SANS_CONNEXION, lignes };
}

/**
 * Le passage (dépendances injectées ; ne lève jamais).
 * deps : lireComptes({ depuis, jusqua, limite }) ; lireCoffre(ids) ; lireVus(ids, depuis) ;
 *        reserver({ userId, evenement, cle }) → 'pris' | 'deja' | 'erreur' ; liberer(...) ; noter(...) ;
 *        envoyer({ to, subject, html, type }) → { envoye, motif? }
 * apercu : rien n'est réservé ni envoyé (on rend la cible).
 */
export async function passageSansConnexion({ deps, maintenant = Date.now(), apercu = false }) {
  const bilan = { lus: 0, a_alerter: 0, envoyes: 0, deja: 0, echecs: 0, coupes: 0, apercu, cibles: [] };
  try {
    const { depuis, jusqua } = fenetreLecture(maintenant);
    const comptes = (await deps.lireComptes({ depuis, jusqua, limite: LIMITE_COMPTES })) ?? [];
    bilan.lus = comptes.length;
    if (!comptes.length) return bilan;
    const ids = comptes.map((c) => c.id).filter(Boolean);
    const [coffre, vus] = await Promise.all([deps.lireCoffre(ids), deps.lireVus(ids, depuis).catch(() => [])]);
    const cibles = comptesSansConnexion({ comptes, coffre: coffre ?? [], vus: vus ?? [], maintenant });
    bilan.a_alerter = cibles.length;
    bilan.cibles = cibles.map((c) => ({ userId: c.userId, minutes: c.minutes, ecranVu: c.ecranVu }));
    if (apercu) return bilan;
    for (const c of cibles) {
      const cle = cleSansConnexion(c.essaiDebut);
      try {
        const r = await deps.reserver({ userId: c.userId, evenement: EVENEMENT_REGISTRE, cle });
        if (r === 'deja') { bilan.deja += 1; continue; }
        if (r !== 'pris') { bilan.echecs += 1; continue; }
        // (14/11/2026, complément 3 point 2 de Nico) « 0 plateforme connectée » n'est pas un vrai problème : la ligne
        // réservée du registre public.cloud_mails est le journal, aucun mail (_shared/alertes-nico.js).
        if (!mailNico('cloud.zero_connexion')) { bilan.coupes += 1; continue; }
        const t = texteAlerteSansConnexion(c, maintenant);
        const env = await deps.envoyer({ to: t.to, subject: t.sujet, html: t.html, type: t.type });
        if (env?.envoye) {
          bilan.envoyes += 1;
          await Promise.resolve(deps.noter?.({ userId: c.userId, evenement: EVENEMENT_REGISTRE, cle, detail: { alerte: true, zero_connexion: true, minutes: c.minutes } })).catch(() => {});
        } else {
          bilan.echecs += 1;
          await Promise.resolve(deps.liberer?.({ userId: c.userId, evenement: EVENEMENT_REGISTRE, cle })).catch(() => {});
        }
      } catch { bilan.echecs += 1; }
    }
  } catch (e) {
    bilan.erreur = String(e?.message ?? e).slice(0, 200);
  }
  return bilan;
}
