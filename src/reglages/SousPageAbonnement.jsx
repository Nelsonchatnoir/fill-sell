// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES › ABONNEMENT (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// Tout ce qui touche à l'argent au même endroit : la formule, la consommation
// du mois, les gestes (comparer, factures, restaurer, résilier), et le renvoi
// vers la boutique quand c'est elle qui facture.
//
// CE QUI CHANGE (et rien d'autre) :
//   · l'encart Apple/Google devient une BANDE D'INFORMATION en bas de page,
//     avec un lien clair — au lieu d'un pavé perdu au milieu de la pop-up ;
//   · chaque compteur affiche LE RESTE (« 97 annonces restantes ») et la page
//     dit la date de remise à zéro ;
//   · « Mes factures » (ajout du lot) : chez Apple et Google, l'historique
//     d'achats de la boutique ; sur le web, le portail de facturation Stripe.
//
// ⛔ AUCUN PRIX DE LA FORMULE EN COURS. Les comptes Founder paient un tarif
//    legacy (9,99 €) : afficher le prix courant serait faux pour eux. C'est la
//    règle de PlanDetailsModal, elle vaut ici.
// ⛔ La résiliation reste handleCancelSubscription (App.jsx) : même appel,
//    même confirmation en deux temps, même message. Rien n'est réécrit.
import { useEffect, useState } from 'react';
import { Receipt, ListOrdered, RefreshCw } from 'lucide-react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import PlanBadge from '../components/PlanBadge';
import { R } from './theme';
import { Groupe, Carte, Ligne, Jauge, JaugeRepublication, BandeInfo, Bouton, Note } from './ReglagesUI';
import { consommationVisible } from './quotas';

// Point d'entrée tracé, dans le vocabulaire du tunnel (App.jsx) : sans lui,
// `premium_cta_click` et `offers_modal_open` retombent sur 'non_precisee' et
// on ne sait plus d'où viennent les conversions.
// ⛔ UNE CHAÎNE, jamais l'événement du clic : `onClick={c.ouvrirOffres}` passe
//    le SyntheticEvent en premier argument, il finit dans le metadata du log,
//    et JSON.stringify le refuse (le fibre React qu'il porte est circulaire).
//    postgrest-js sérialise le corps SYNCHRONEMENT dans `then()` : l'exception
//    remonte donc dans openUpgradeModal AVANT l'ouverture, et la modale ne
//    s'ouvre jamais. C'est exactement ce qui rendait cette ligne muette.
const ORIGINE = 'reglages_abonnement';

const LIEN_APPLE = 'https://apps.apple.com/account/subscriptions';
const LIEN_APPLE_ACHATS = 'https://reportaproblem.apple.com/';
const LIEN_GOOGLE = 'https://play.google.com/store/account/subscriptions?sku=app.fillsell.premium.sub&package=app.fillsell.app';
const LIEN_GOOGLE_ACHATS = 'https://play.google.com/store/account/orderhistory';

export default function SousPageAbonnement({ c, T }) {
  // Client Stripe : sa présence dit qu'il y a des factures à montrer. Absent
  // (jamais payé par le web, ou payé par une boutique) → pas de ligne.
  const [clientStripe, setClientStripe] = useState(null);
  const [facturesEnCours, setFacturesEnCours] = useState(false);
  const [facturesRepli, setFacturesRepli] = useState(false);

  useEffect(() => {
    if (!c.user?.id || c.natif) return;
    let mort = false;
    supabase.from('profiles').select('stripe_customer_id').eq('id', c.user.id).maybeSingle()
      .then(({ data }) => { if (!mort) setClientStripe(data?.stripe_customer_id ?? null); })
      .catch(() => { /* illisible : la ligne ne s'affiche pas, jamais un bouton mort */ });
    return () => { mort = true; };
  }, [c.user?.id, c.natif]);

  // Portail de facturation Stripe — une session à usage unique, créée par
  // l'edge function (la clé secrète ne descend jamais dans le client). Si le
  // portail refuse, on ne laisse pas un bouton muet : on dit où sont les
  // factures (Stripe les envoie par e-mail à chaque prélèvement).
  const ouvrirFactures = async () => {
    setFacturesEnCours(true);
    setFacturesRepli(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/stripe-portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ retour: window.location.origin }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) throw new Error(json?.error ?? `HTTP ${res.status}`);
      window.open(json.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.warn('[reglages] portail de facturation indisponible —', e?.message ?? e);
      setFacturesRepli(true);
    } finally {
      setFacturesEnCours(false);
    }
  };

  const q = c.quotas;
  const compteurs = consommationVisible(q) ? q : null;

  return (
    <>
      {/* ── LA FORMULE — une carte de la page, pas un aplat sombre ───────
          Le bandeau vert foncé plein cadre était le seul élément de ce genre
          dans toute l'app : plus sombre, plus massif que ses voisines, et son
          contenu touchait le bord haut. Même carte blanche à bord fin, même
          rayon, même respiration que les cartes voisines — et le palier se
          signale par le badge doré qu'on a déjà sur la carte d'identité.
          ⛔ AUCUN PRIX ICI : les comptes Founder paient un tarif legacy
             (9,99 €), afficher le prix courant serait faux pour eux. Règle
             de PlanDetailsModal, elle vaut ici. */}
      <Carte style={{
        display: 'flex', flexDirection: 'column', gap: 12, padding: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {c.isPremium
            ? <PlanBadge isPremium={c.isPremium} isPro={c.isPro} isBusiness={c.isBusiness} />
            : <strong style={{ fontSize: 17, fontWeight: 700, color: R.ink, letterSpacing: '-0.02em' }}>{T.formuleGratuite}</strong>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 14.5, fontWeight: 500, color: R.ink, lineHeight: 1.45 }}>
            {!c.isPremium
              ? T.gratuitIntro
              : c.resiliation.resilie
                ? T.abonnementResilie(c.resiliation.finLe)
                : T.abonnementActif}
          </span>
          {/* Le prochain prélèvement, et SEULEMENT quand c'en est un : abonné
              actif, non résilié, avec un canal de paiement connu (client
              Stripe côté web, boutique côté natif). Un compte gratuit ou
              offert porte la même échéance en base — ancrée sur sa date
              d'inscription — et l'appeler « prélèvement » serait faux. */}
          {c.isPremium && !c.resiliation.resilie && c.prochainPrelevement && (clientStripe || c.natif) && (
            <span style={{ fontSize: 13.5, color: R.texteSecondaire, lineHeight: 1.45 }}>
              {T.prochainPrelevement(c.prochainPrelevement)}
            </span>
          )}
        </div>
      </Carte>

      {/* ── Consommation du mois, avec le RESTE ───────────────────────── */}
      {compteurs && (
        <Groupe intitule={T.consommation} appoint={c.remiseAZero ? T.remiseAZeroLe(c.remiseAZero) : null}>
          <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {compteurs.annonces?.plafond != null && (
              <Jauge
                libelle={T.annoncesCreees}
                consomme={compteurs.annonces.consommes}
                plafond={compteurs.annonces.plafond}
                reste={compteurs.annonces.restantes}
                sous={compteurs.annonces.restantes != null ? T.restantes(compteurs.annonces.restantes, T.motAnnonces) : null}
              />
            )}
            {compteurs.retouches?.plafond != null && compteurs.retouches.plafond > 0 && (
              <Jauge
                libelle={T.retouchesIA}
                consomme={compteurs.retouches.consommes}
                plafond={compteurs.retouches.plafond}
                reste={compteurs.retouches.restantes}
                sous={compteurs.retouches.restantes != null ? T.restantes(compteurs.retouches.restantes, T.motRetouches) : null}
              />
            )}
            <JaugeRepublication repub={compteurs.republication} T={T} />
          </Carte>
        </Groupe>
      )}

      {/* ── Gérer ─────────────────────────────────────────────────────── */}
      <Groupe intitule={T.gerer}>
        <Carte>
          <Ligne
            icone={ListOrdered}
            libelle={c.isPremium ? T.comparerFormules : T.voirOffres}
            onClick={() => c.ouvrirOffres(ORIGINE)}
          />
          {!c.natif && clientStripe && (
            <Ligne
              icone={Receipt}
              libelle={T.mesFactures}
              valeur={facturesEnCours ? T.facturesOuverture : null}
              onClick={ouvrirFactures}
            />
          )}
          {c.natif && c.plateforme === 'ios' && (
            <Ligne icone={Receipt} libelle={T.mesFactures} href={LIEN_APPLE_ACHATS} cible="_blank" />
          )}
          {c.natif && c.plateforme === 'android' && (
            <Ligne icone={Receipt} libelle={T.mesFactures} href={LIEN_GOOGLE_ACHATS} cible="_blank" />
          )}
          {/* Restaurer les achats — iOS/Android non premium, comme avant. */}
          {c.natif && !c.isPremium && (
            <Ligne
              icone={RefreshCw}
              libelle={c.restauration.enCours ? T.restaurationEnCours : T.restaurerAchats}
              onClick={c.restauration.lancer}
              chevron={false}
            />
          )}
        </Carte>
        {facturesRepli && <Note>{T.facturesParMail(c.user?.email ?? '')}</Note>}
      </Groupe>

      {/* ── Résiliation — web seulement : une boutique gère la sienne ── */}
      {c.isPremium && !c.natif && (
        <Groupe>
          {c.resiliation.resilie ? (
            <BandeInfo>{c.resiliation.message || T.abonnementResilie(c.resiliation.finLe)}</BandeInfo>
          ) : c.resiliation.etape === 0 ? (
            <Bouton ton="danger-creux" onClick={() => c.resiliation.setEtape(1)} style={{ width: '100%', minHeight: 50 }}>
              {T.seDesabonner}
            </Bouton>
          ) : (
            <Carte pad style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: R.ink }}>{T.confirmerResiliation}</div>
                <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, color: R.texteSecondaire }}>{T.resiliationDetail}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Bouton ton="danger-plein" onClick={c.resiliation.lancer} enCours={c.resiliation.enCours}>
                  {c.resiliation.enCours ? '…' : T.confirmer}
                </Bouton>
                <Bouton ton="creux" onClick={() => c.resiliation.setEtape(0)} disabled={c.resiliation.enCours}>{T.annuler}</Bouton>
              </div>
            </Carte>
          )}
        </Groupe>
      )}

      {/* ── C'est la boutique qui facture : on le dit, et on y mène ──── */}
      {c.isPremium && c.plateforme === 'ios' && (
        <BandeInfo lien={LIEN_APPLE} libelleLien={T.appleLien}>{T.appleGere}</BandeInfo>
      )}
      {c.isPremium && c.plateforme === 'android' && (
        <BandeInfo lien={LIEN_GOOGLE} libelleLien={T.googleLien}>{T.googleGere}</BandeInfo>
      )}
    </>
  );
}
