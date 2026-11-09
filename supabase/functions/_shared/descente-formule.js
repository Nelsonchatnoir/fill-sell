// ═══════════════════════════════════════════════════════════════════════════
// DESCENDRE DE FORMULE À LA FIN DE LA PÉRIODE — STRIPE (09/11/2026 nuit, point C4 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Voir les autres formules » : un abonné peut passer à une formule MOINS chère. Rien n'est remboursé, rien n'est
// prélevé tout de suite : la formule actuelle reste ENTIÈRE jusqu'à la fin de la période payée, puis la suivante
// commence à son prix. Annulable jusqu'à cette date.
//   · Stripe : un « subscription schedule » posé sur l'abonnement — phase 1 = la formule actuelle jusqu'à
//     current_period_end (inchangée) ; phase 2 = le prix inférieur, SA métadonnée plan_type (⛔ indispensable : pour un
//     prix Premium, litAbonnementStripe garde le plan_type de l'abonnement — sans elle, un Pro passé à 12,99 € resterait
//     Pro), sans prorata, une période, puis l'abonnement est rendu à lui-même (end_behavior release) au nouveau prix.
//   · Annuler = rendre l'abonnement à lui-même AVANT la phase 2 (release) : il continue à la formule actuelle.
//   · Monter, résilier : un abonnement tenu par un schedule refuse certaines mises à jour directes — on le rend à
//     lui-même d'abord (la montée ou la résiliation remplace la descente prévue).
// Les droits (is_premium / is_pro / is_business) ne bougent QUE quand Stripe change réellement de prix (phase 2) :
// customer.subscription.updated → drapeauxDepuisStripe, et le crédit du mois suit la facture (palierDeFacture).
// Le Cloud (abonnement à part) n'est jamais touché. Pur : testé en Node (selftest:descente-formule, banc Stripe test).

import { rangAppleVivant, rangGoogleVivant } from './droits-canaux.js';

export const RANG_FORMULE = Object.freeze({ standard: 1, pro: 2, business: 3 });

/**
 * (09/11 matin, décision de Nico : C4 pour les abonnés STRIPE seulement) Une boutique (Apple / Google) tient-elle une
 * formule VIVANTE pour ce profil (jeton + fin de période à venir, droits-canaux.js) ? Alors AUCUN parcours C4 : même
 * s'il a aussi un abonnement Stripe, une descente Stripe ne changerait rien à ce que la boutique lui ouvre — « pour lui,
 * rien ne change par rapport à aujourd'hui ». Rend 'apple' | 'google' | null.
 */
export function boutiqueVivante(p, maintenant = Date.now()) {
  if (rangAppleVivant(p, maintenant) > 0) return 'apple';
  if (rangGoogleVivant(p, maintenant) > 0) return 'google';
  return null;
}
export const FORMULES = Object.freeze(['standard', 'pro', 'business']);

/** 'premium' (nom de l'app) → 'standard' (nom Stripe) ; inconnu → null. */
export function formuleStripe(f) {
  if (f === 'premium' || f === 'standard' || f === 'founder') return 'standard';
  if (f === 'pro' || f === 'business') return f;
  return null;
}

/** La descente est-elle possible de `actuelle` vers `vers` ? (strictement plus bas, deux formules payantes) */
export function peutDescendre(actuelle, vers) {
  const a = RANG_FORMULE[formuleStripe(actuelle)];
  const v = RANG_FORMULE[formuleStripe(vers)];
  return Boolean(a && v && v < a);
}

const prixDeLArticle = (it) => (typeof it?.price === 'string' ? it.price : it?.price?.id ?? null);

/** La formule portée par un PRIX (les prix connus du canal) ; null = autre chose (Cloud, pièces…). */
export function formuleDuPrix(priceId, prix = {}) {
  if (!priceId) return null;
  if (prix.business && priceId === prix.business) return 'business';
  if (prix.pro && priceId === prix.pro) return 'pro';
  if (prix.standard && priceId === prix.standard) return 'standard';
  return null;
}

/**
 * Les paramètres de la mise à jour du schedule (POST /v1/subscription_schedules/:id) qui programme la descente.
 * schedule : le schedule CRÉÉ depuis l'abonnement (from_subscription) — sa phase 0 décrit l'abonnement tel qu'il est.
 * Rend { phases, end_behavior } ; lève si l'abonnement n'est pas descendable (jamais d'appel Stripe à moitié juste).
 */
export function parametresDescente({ abonnement, schedule, vers, prix }) {
  const cible = formuleStripe(vers);
  const prixVers = cible ? prix?.[cible] : null;
  if (!prixVers) throw new Error(`descente : prix inconnu pour « ${vers} »`);
  const phase0 = schedule?.phases?.[0];
  if (!phase0) throw new Error('descente : schedule sans phase courante');
  const fin = Number(abonnement?.current_period_end);
  if (!Number.isFinite(fin) || fin <= 0) throw new Error('descente : fin de période inconnue');
  const articles = (phase0.items ?? []).map((it) => ({ price: prixDeLArticle(it), quantity: it.quantity ?? 1 }));
  if (!articles.length || articles.some((a) => !a.price)) throw new Error('descente : articles de la phase courante illisibles');
  const metaActuelle = { ...(abonnement?.metadata ?? {}) };
  return {
    end_behavior: 'release',
    phases: [
      // Phase 1 : EXACTEMENT l'abonnement d'aujourd'hui, jusqu'à la fin de la période payée.
      { items: articles, start_date: phase0.start_date, end_date: fin, metadata: metaActuelle, proration_behavior: 'none' },
      // Phase 2 : la formule inférieure, sa métadonnée, une période, puis l'abonnement continue seul à ce prix.
      { items: [{ price: prixVers, quantity: 1 }], iterations: 1, metadata: { ...metaActuelle, plan_type: cible }, proration_behavior: 'none' },
    ],
  };
}

/**
 * La descente PRÉVUE, lue chez Stripe (source de vérité : jamais une colonne qui dériverait). subs : les abonnements
 * du client ; schedules : { [id]: schedule } pour ceux qui en portent un. Rend { formule, le (ISO), ref } ou null.
 * Seule une phase FUTURE dont le prix porte une formule PLUS BASSE que la formule payée aujourd'hui compte.
 */
export function descentePrevue(subs, schedules = {}, prix = {}, maintenant = Date.now()) {
  const nowS = Math.floor(maintenant / 1000);
  for (const s of subs ?? []) {
    if (!(s?.status === 'active' || s?.status === 'trialing')) continue;
    const idSched = typeof s.schedule === 'string' ? s.schedule : s.schedule?.id ?? null;
    if (!idSched) continue;
    const sched = schedules[idSched] ?? (typeof s.schedule === 'object' ? s.schedule : null);
    if (!sched || !(sched.status === 'active' || sched.status === 'not_started')) continue;
    const actuelle = (s.items?.data ?? []).map(prixDeLArticle).map((p) => formuleDuPrix(p, prix)).find(Boolean)
      ?? formuleStripe(s.metadata?.plan_type);
    if (!actuelle) continue;
    const future = (sched.phases ?? []).filter((ph) => Number(ph.start_date) > nowS).sort((a, b) => a.start_date - b.start_date)[0];
    if (!future) continue;
    const vers = (future.items ?? []).map(prixDeLArticle).map((p) => formuleDuPrix(p, prix)).find(Boolean);
    if (vers && RANG_FORMULE[vers] < RANG_FORMULE[actuelle]) {
      return { formule: vers, le: new Date(Number(future.start_date) * 1000).toISOString(), ref: idSched, depuis: actuelle };
    }
  }
  return null;
}

/** Ce qu'on écrit dans profiles (colonnes de la migration 20261109020000), à part des drapeaux : jamais bloquant. */
export function colonnesDescente(prevue) {
  return prevue
    ? { formule_prevue: prevue.formule === 'standard' ? 'premium' : prevue.formule, formule_prevue_le: prevue.le, formule_prevue_canal: 'stripe' }
    : { formule_prevue: null, formule_prevue_le: null, formule_prevue_canal: null };
}

/** L'abonnement de formule VIVANT d'un client (jamais le Cloud) — la cible d'une descente. */
export function abonnementDeFormule(subs, prix = {}, estCloud = () => false) {
  const vivants = (subs ?? []).filter((s) => (s?.status === 'active' || s?.status === 'trialing') && !estCloud(s));
  const rang = (s) => RANG_FORMULE[(s.items?.data ?? []).map(prixDeLArticle).map((p) => formuleDuPrix(p, prix)).find(Boolean) ?? formuleStripe(s.metadata?.plan_type)] ?? 0;
  return vivants.sort((a, b) => rang(b) - rang(a))[0] ?? null;
}
