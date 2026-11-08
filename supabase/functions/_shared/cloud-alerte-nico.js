// ═══════════════════════════════════════════════════════════════════════════
// L'ALERTE À NICO À CHAQUE ÉVÉNEMENT D'ARGENT DU CLOUD — règles pures (08/11/2026, jour J, ajout de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Recevoir un mail à chaque événement d'argent du Cloud, quel que soit le canal (Stripe, Apple, Google) » :
//   · début d'essai (nouveau client)            → evenement 'essai_debut' ;
//   · paiement réussi (1er mois, renouvellements, début payant) → 'paiement' ;
//   · arrêt (pendant l'essai, ou programmé après) → 'arret_essai', 'arret_programme'.
// Les ÉVÉNEMENTS sont ceux des mails clients (_shared/cloud-mails.js : evenementsBoutique, evenementDebutStripe,
// evenementPaiementStripe, evenementArretStripe), au même point de passage (_shared/cloud-mails-envoi.ts, mailsCloud) :
// les quatre fonctions qui écrivent le Cloud (stripe-webhook, cancel-subscription, apple-iap-webhook,
// google-play-webhook) le préviennent sans rien changer à leur code.
// Contenu : compte, canal, palier FillSell (palier.js, jamais un drapeau seul), montant LU À LA SOURCE (paiement : le
// montant payé de l'événement ; essai : le prix de la prochaine échéance, lu par l'appelant) — sans montant si la
// source se tait —, date en heure de Paris.
// Destinataire : ALERTE_CLOUD_DESTINATAIRE = la même adresse que l'alerte des IP en pause (orchestrateur
// serveur-cloud/src/alertes.js, ALERTES_DESTINATAIRE relu sur cloud-2 le 08/11 : support@fillsell.app).
// GARDE-FOUS :
//   · UN mail par événement : la clé est réservée dans le MÊME registre que les mails clients (public.cloud_mails,
//     migration 20261108090000), sous une clé à part (« alerte: » + la clé de l'événement) — l'alerte et le mail client
//     ne se gênent jamais, une notification rejouée ne refait rien ; registre illisible = rien (échec fermé) ;
//   · ne lève JAMAIS : un échec d'envoi ne bloque ni un paiement, ni l'ouverture d'une place (appelée après
//     l'écriture du profil, tout est avalé) ; l'envoi raté libère la clé (renvoyable au prochain rejeu) ;
//   · les mails clients ne changent pas (cloud-mails.js n'est pas touché ; cette alerte part à côté).
// Testé sans réseau : scripts/cloud-alerte-nico-selftest.mjs.

import { formatPrix, prixValide } from './cloud-prix.js';
import { nomDuPalier, palierDuProfil } from './palier.js';

export const ALERTE_CLOUD_DESTINATAIRE = 'support@fillsell.app';
export const EVENEMENTS_ALERTE = Object.freeze(['essai_debut', 'paiement', 'arret_essai', 'arret_programme']);
export const PREFIXE_CLE_ALERTE = 'alerte:';
/** La clé de l'alerte dans public.cloud_mails : à part de celle du mail client (même événement, autre ligne). */
export const cleAlerte = (cle) => `${PREFIXE_CLE_ALERTE}${String(cle ?? '')}`.slice(0, 400);
/** Le type écrit dans email_logs (adresse = la boîte de FillSell, jamais le client). */
export const typeAlerte = (evenement) => `cloud_alerte_${evenement}`;

const NOM_CANAL = Object.freeze({ stripe: 'Stripe (carte, web)', apple: 'Apple (App Store)', google: 'Google Play', inconnu: 'inconnu' });
const COURT_CANAL = Object.freeze({ stripe: 'Stripe', apple: 'Apple', google: 'Google Play', inconnu: 'canal inconnu' });
const SOURCE = Object.freeze({ stripe: 'Stripe', apple: 'Apple', google: 'Google Play', inconnu: 'la boutique' });
const CONTEXTE_PAIEMENT = Object.freeze({ fin_essai: 'premier mois (fin d’essai)', renouvellement: 'renouvellement', debut: 'début payant (sans essai)' });

const instant = (v) => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
/** « dimanche 8 novembre 2026 à 13:05 » en heure de Paris, ou null. */
export function dateParis(v) {
  const t = instant(v);
  if (t == null) return null;
  const f = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(t));
  const x = (k) => f.find((p) => p.type === k)?.value ?? '';
  return `${x('weekday')} ${x('day')} ${x('month')} ${x('year')} à ${x('hour')}:${x('minute')}`;
}
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const canalLu = (c) => (Object.prototype.hasOwnProperty.call(NOM_CANAL, c) ? c : 'inconnu');

/**
 * Le contenu de l'alerte (pur). evenement : EVENEMENTS_ALERTE ; canal ; faits (ceux de l'événement) ;
 * prix : essai_debut = prochaine échéance lue à la source (null → sans montant) ; profil : { email, is_premium, … } ;
 * maintenant : l'instant de l'événement chez nous.
 * Rend { sujet, lignes: [[libellé, valeur]], html, type } ou null (événement hors alerte).
 * @param {{ evenement: string, canal?: string | null, faits?: any, prix?: any, userId?: string | null, profil?: any,
 *           cle?: string | null, maintenant?: number, test?: boolean }} p
 * @returns {{ sujet: string, lignes: Array<[string, string]>, html: string, type: string } | null}
 */
export function texteAlerteCloud({ evenement, canal = null, faits = {}, prix = null, userId = null, profil = null, cle = null, maintenant = Date.now(), test = false }) {
  if (!EVENEMENTS_ALERTE.includes(evenement)) return null;
  if (evenement === 'arret_essai' && faits?.aucunPrelevement !== true) return null;   // seulement l'arrêt CONFIRMÉ
  const c = canalLu(canal);
  const email = typeof profil?.email === 'string' && profil.email.includes('@') ? profil.email : null;
  const palier = nomDuPalier(palierDuProfil(profil ?? {})) ?? 'Gratuit';
  const compte = `${email ?? '(adresse inconnue)'}${userId ? ` — ${userId}` : ''}`;
  const lignes = [];
  let quoi, sujetQuoi;
  let montant = null;
  if (evenement === 'essai_debut') {
    quoi = 'Nouvel essai FillSell Cloud (nouveau client)';
    sujetQuoi = 'Nouvel essai';
    montant = formatPrix(prixValide(prix), 'fr');
  } else if (evenement === 'paiement') {
    const ctx = Object.prototype.hasOwnProperty.call(CONTEXTE_PAIEMENT, faits?.contexte) ? faits.contexte : 'renouvellement';
    quoi = `Paiement réussi — ${CONTEXTE_PAIEMENT[ctx]}`;
    montant = formatPrix(prixValide(faits?.montant), 'fr');
    sujetQuoi = `Paiement ${montant ?? '(montant non communiqué)'} — ${CONTEXTE_PAIEMENT[ctx]}`;
  } else if (evenement === 'arret_essai') {
    quoi = 'Arrêt pendant l’essai — aucun prélèvement (confirmé par la boutique)';
    sujetQuoi = 'Arrêt pendant l’essai';
  } else {
    const j = dateParis(faits?.finIso);
    quoi = `Arrêt programmé${j ? ` — FillSell Cloud continue jusqu’au ${j}` : ' — à la fin de la période payée'}`;
    sujetQuoi = 'Arrêt programmé';
  }
  lignes.push(['Événement', quoi]);
  lignes.push(['Compte', compte]);
  lignes.push(['Canal', NOM_CANAL[c]]);
  lignes.push(['Palier FillSell', palier]);
  if (evenement === 'essai_debut' || evenement === 'paiement') {
    lignes.push(['Montant', montant
      ? `${montant}${evenement === 'essai_debut' ? ' (prochaine échéance, après l’essai)' : ''} — lu chez ${SOURCE[c]}`
      : `non communiqué par ${SOURCE[c]}`]);
  }
  lignes.push(['Date', `${dateParis(maintenant) ?? '?'} (heure de Paris)`]);
  if (evenement === 'essai_debut' && dateParis(faits?.finIso)) lignes.push(['Fin de l’essai', `${dateParis(faits.finIso)} (heure de Paris)`]);
  if (evenement === 'paiement' && dateParis(faits?.prochaineIso)) lignes.push(['Prochaine échéance', `${dateParis(faits.prochaineIso)} (heure de Paris)`]);
  if (evenement === 'arret_essai' && dateParis(faits?.arreteIso)) lignes.push(['Arrêté le', `${dateParis(faits.arreteIso)} (heure de Paris)`]);
  if (cle) lignes.push(['Référence', String(cle).length > 60 ? `${String(cle).slice(0, 57)}…` : String(cle)]);
  const sujet = `${test ? '[TEST] ' : ''}[FillSell Cloud] ${sujetQuoi} — ${email ?? 'compte sans adresse'} — ${COURT_CANAL[c]}`;
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#F2F2EE;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;padding:26px;">
    <h1 style="margin:0 0 14px;font-size:18px;font-family:sans-serif;color:#10201B;">${test ? '[TEST] ' : ''}FillSell Cloud — ${esc(sujetQuoi)}</h1>
    <table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:13px;">
      ${lignes.map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#6B7280;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;color:#111827;word-break:break-word;"><strong>${esc(v)}</strong></td></tr>`).join('')}
    </table>
    ${test ? '<p style="margin:14px 0 0;font-family:sans-serif;font-size:12px;color:#9CA3AF;">Envoi de test : aucun client, aucun paiement, rien écrit.</p>' : ''}
  </div>
</body></html>`;
  return { sujet, lignes, html, type: typeAlerte(evenement) };
}

/**
 * L'envoi : une alerte par événement (dépendances injectées).
 * deps :
 *   reserver({ userId, evenement, cle, canal }) → 'pris' | 'deja' | 'erreur'   (INSERT dans public.cloud_mails, clé « alerte: »)
 *   liberer({ userId, evenement, cle })  ;  noter({ userId, evenement, cle, detail })
 *   lireProfil() → Promise<profil | null>                                     (email + drapeaux du palier)
 *   lirePrix(evenement) → Promise<prix | null>                                 (essai_debut : prochaine échéance)
 *   envoyer({ to, subject, html, type }) → { envoye, motif? }
 * Ne lève JAMAIS.
 * @param {{ evenements?: any[], userId: string, canal?: string | null, deps: any, maintenant?: number }} p
 */
export async function envoyerAlertesCloud({ evenements = [], userId, canal = null, deps, maintenant = Date.now() }) {
  const bilan = [];
  const aAlerter = (evenements ?? []).filter((e) => EVENEMENTS_ALERTE.includes(e?.evenement));
  if (!userId || aAlerter.length === 0) return bilan;
  let profil = null;
  try { profil = (await deps.lireProfil?.()) ?? null; } catch { profil = null; }
  for (const e of aAlerter) {
    const ligne = { evenement: e.evenement, cle: e.cle, resultat: 'rien' };
    bilan.push(ligne);
    try {
      if (!e.cle) { ligne.resultat = 'evenement_invalide'; continue; }
      const cn = e.canal ?? canal;
      const k = cleAlerte(e.cle);
      if (!texteAlerteCloud({ evenement: e.evenement, canal: cn, faits: e.faits ?? {}, userId, profil, cle: e.cle, maintenant })) { ligne.resultat = 'sans_alerte'; continue; }
      const r = await deps.reserver({ userId, evenement: e.evenement, cle: k, canal: cn });
      if (r !== 'pris') { ligne.resultat = r === 'deja' ? 'deja_envoye' : 'registre_illisible'; continue; }
      let prix = null;
      if (e.evenement === 'essai_debut' && typeof deps.lirePrix === 'function') {
        try { prix = prixValide(await deps.lirePrix(e.evenement)); } catch { prix = null; }
      }
      const t = texteAlerteCloud({ evenement: e.evenement, canal: cn, faits: e.faits ?? {}, prix, userId, profil, cle: e.cle, maintenant });
      const env = await deps.envoyer({ to: ALERTE_CLOUD_DESTINATAIRE, subject: t.sujet, html: t.html, type: t.type });
      if (env?.envoye) {
        ligne.resultat = 'envoye';
        await Promise.resolve(deps.noter?.({ userId, evenement: e.evenement, cle: k, detail: { alerte: true, envoye: true } })).catch(() => {});
      } else {
        ligne.resultat = `envoi_${env?.motif ?? 'echec'}`;
        await Promise.resolve(deps.liberer?.({ userId, evenement: e.evenement, cle: k })).catch(() => {});
      }
    } catch (err) {
      ligne.resultat = `erreur:${String(err?.message ?? err).slice(0, 120)}`;
    }
  }
  return bilan;
}
