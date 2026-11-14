// ═══════════════════════════════════════════════════════════════════════════
// LE TABLEAU (c) DU 13/11/2026 (dernière réponse de Nico) — « ABONNÉ QUI AJOUTE LE CLOUD », CASE PAR CASE
//     npm run selftest:abonne-ajoute-le-cloud
// ═══════════════════════════════════════════════════════════════════════════
// « c) Prouve le parcours complet « abonné qui ajoute le Cloud », pour chaque formule (Premium, Pro, Business) et chaque
// canal où la formule est payée (Stripe, Apple, Google), y compris quand le Cloud est voulu sur un autre canal que la
// formule : ce que l'écran propose ; le texte exact du montant et de la date ; ce qui est réellement prélevé ; que l'accès
// Cloud s'ouvre bien. Selftests pour toutes les cases. »
// 36 cases = 3 formules × 3 canaux de la formule × 4 voies (le pack sur le canal de la formule ; le Cloud seul sur chacun
// des 3 canaux). Chaque case exécute le VRAI code (aucune copie) :
//   1. la garde   — decisionAchat / decisionSurLectures (_shared/un-seul-abonnement.js) : permis ;
//   2. l'écran    — cartesFormulesCloud (pack : carte achetable) / blocCloudSeulCache (Cloud seul : bloc montré) ;
//   3. le texte   — texteNoteCarte + textesFormules (pack) / textesCloud, textesConnexion (Cloud seul) : montant et date ;
//   4. le prélevé — voieFormuleStripe, parametresCheckoutCloud, essaiCloudPermis (Stripe) ; groupes Apple (eligibiliteApple) ;
//                   modeRemplacement (Google, pack) ; achat du Cloud seul Android SANS oldPurchaseToken (achatCloud.js) ;
//   5. l'accès    — drapeauxDepuisStripe + miseAJourProfilDepuisStripe + drapeauxStripeAvecStores (Stripe), planAchatBoutique
//                   et ecritureCloudStore (boutiques) : is_cloud / cloud_canal / cloud_formule posés, la formule gardée, et
//                   l'événement du canal de la formule n'efface pas un Cloud tenu par un autre canal.
// Dates du test : abonnement payé jusqu'au 30 novembre, essai qui commencerait le 13/11 → fin le 20 novembre.
// VERROU_RACINE=<dossier> rejoue ce tableau sur une autre copie.
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.TZ = 'Europe/Paris';
const ROOT = process.env.VERROU_RACINE || join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 400)}` : ''}`); }
  return Boolean(c);
};
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const importer = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { ok(false, `module ${p} chargé`, e?.message ?? e); return {}; } };

const U = await importer('supabase/functions/_shared/un-seul-abonnement.js');
const F = await importer('src/cloud/formulesCloud.js');
const TF = await importer('src/cloud/textesFormules.js');
const { PRIX_WEB } = await importer('src/lib/prixBoutique.js');
const AF = await importer('src/cloud/achatFormuleCloud.js');
const { textesCloud } = await importer('src/cloud/textes.js');
const { textesConnexion } = await importer('src/cloud/textesConnexion.js');
const FS = await importer('supabase/functions/_shared/formules-serveur.js');
const C = await importer('supabase/functions/_shared/cloud-option.js');
const DC = await importer('supabase/functions/_shared/droits-canaux.js');
const EA = await importer('src/lib/eligibiliteApple.js');
const FC = await importer('supabase/functions/_shared/formules-cloud.js');

const MAINTENANT = Date.parse('2026-11-13T18:18:00+01:00');
const S = (ms) => Math.floor(ms / 1000);
const FIN = '2026-11-30T17:00:00.000Z';
const PRIX = { standard: 'price_STD', pro: 'price_PRO', business: 'price_BUS', cloud: 'price_CLOUD', premium_cloud: 'price_PC1', pro_cloud: 'price_PC2', business_cloud: 'price_PC3' };
// Les textes portent une espace insécable avant « € » (U+00A0) : comparée comme une espace.
const nb = (t) => String(t ?? '').replace(/ /g, ' ');
const FORMULES = [
  { palier: 'premium', nom: 'Premium', rang: 1, pack: 'premium_cloud', apple: 'app.fillsell.premium.standard', google: 'app.fillsell.premium.standard', meta: 'standard' },
  { palier: 'pro', nom: 'Pro', rang: 2, pack: 'pro_cloud', apple: 'app.fillsell.pro2.sub', google: 'app.fillsell.pro.sub', meta: 'pro' },
  { palier: 'business', nom: 'Business', rang: 3, pack: 'business_cloud', apple: 'app.fillsell.business.sub', google: 'app.fillsell.business.sub', meta: 'business' },
];
const CANAUX = ['stripe', 'apple', 'google'];
const NOM_CANAL = { stripe: 'Stripe', apple: 'Apple', google: 'Google' };
const drapeaux = (rang) => ({ is_premium: true, is_pro: rang >= 2, is_business: rang === 3 });
const subFormule = (f) => ({ id: 'sub_formule', status: 'active', metadata: { plan_type: f.meta }, items: { data: [{ price: { id: f.rang === 3 ? PRIX.business : f.rang === 2 ? PRIX.pro : PRIX.standard } }] }, current_period_end: S(Date.parse(FIN)) });
const subCloudEssai = { id: 'sub_cloud', status: 'trialing', metadata: { option: 'cloud' }, items: { data: [{ price: { id: PRIX.cloud } }] }, trial_start: S(MAINTENANT), trial_end: S(MAINTENANT) + 7 * 86400, current_period_end: S(MAINTENANT) + 7 * 86400 };
function compte(f, canal) {
  if (canal === 'stripe') return { profil: { stripe_customer_id: 'cus_x', ...drapeaux(f.rang) }, subs: [subFormule(f)], googleActif: null };
  if (canal === 'apple') return { profil: { apple_original_transaction_id: '700000000000001', ...drapeaux(f.rang), subscription_period_end: FIN }, subs: [], googleActif: null };
  return { profil: { google_purchase_token: 'jeton', google_product_id: f.google, ...drapeaux(f.rang), subscription_period_end: FIN }, subs: [], googleActif: true };
}
const lus = (subs) => (subs ?? []).map((s) => ({ ...C.litAbonnementStripe(s, PRIX), status: s.status }));

const Tf = TF.textesFormules?.('fr');
const T = textesCloud?.('fr');
const Tc = textesConnexion?.('fr');
const lignes = [];

for (const f of FORMULES) {
  for (const X of CANAUX) {
    const c = compte(f, X);
    const vivants = U.abonnementsVivants?.({ profil: c.profil, stripe: lus(c.subs), googleActif: c.googleActif, maintenant: MAINTENANT }) ?? [];
    // ═══ VOIE 1 : LE PACK SUR LE CANAL DE LA FORMULE ═══
    {
      const cas = `${f.nom} ${NOM_CANAL[X]} → ${f.nom} + Cloud sur ${NOM_CANAL[X]}`;
      const d = U.decisionAchat?.({ canal: X, achat: 'formule', vivants });
      ok(d?.permis === true && d?.voie === 'meme_abonnement', `${cas} : garde (le même abonnement change)`, JSON.stringify(d));
      const essaiPermis = X === 'stripe' && f.rang < 3;
      const r = F.cartesFormulesCloud?.({ palier: f.palier, canalApp: X, canalAbonnement: X, essaiPermis, essaiBoutique: () => 'non' });
      const carte = r?.cartes?.find((x) => x.formule === f.pack);
      ok(r?.voie === 'ici' && carte?.achetable === true, `${cas} : écran — la carte ${f.nom} + Cloud est achetable (Réglages › Abonnement, OffresAvecCloud)`, JSON.stringify({ voie: r?.voie, carte }));
      const nomPack = TF.NOMS_FORMULES?.[f.pack], prix = PRIX_WEB?.[f.pack]?.fr;
      const note = carte ? F.texteNoteCarte({ ...carte, canalFacture: carte.canalFacture ?? X }, { T: Tf, palierIci: TF.NOMS_PALIERS_SEULS?.[f.palier], echeance: '30 novembre', finEssai: '20 novembre', canalApp: X, nom: nomPack, prix }) : '';
      const attendu = X === 'stripe'
        ? (essaiPermis ? `Pendant 7 jours, tu ne paies que ta formule ${f.nom}. Le 20 novembre, elle devient ${f.nom} + Cloud ; la différence jusqu'à ta prochaine échéance est ajoutée à ta facture du 30 novembre.`
          : `Pas d'essai : la différence au prorata jusqu'à ta prochaine échéance du 30 novembre est prélevée aujourd'hui sur ta carte, puis ${prix}/mois.`)
        : X === 'apple' ? `Pas d'essai : le changement se fait dans ton abonnement App Store, sans second abonnement. ${prix} sont prélevés aujourd'hui sur ton compte Apple, puis chaque mois.`
          // (14/11/2026 13:00, décision 5 de Nico) Android hors essai : le prix entier aujourd'hui (CHARGE_FULL_PRICE), plus le prorata.
          : `Pas d'essai : le changement se fait dans ton abonnement Google Play, sans second abonnement. ${prix} sont prélevés aujourd'hui sur ton compte Google Play, puis chaque mois.`;
      ok(nb(note) === attendu, `${cas} : texte du montant et de la date`, note);
      // Ce qui est prélevé.
      let preleve = '';
      if (X === 'stripe') {
        const v = FS.voieFormuleStripe?.({ formule: f.pack, essaiPermis, palierStripe: { id: 'sub_formule', status: 'active', rang: f.rang, formule: null, schedule: null, pending_update: null, cancel_at_period_end: false } });
        ok(essaiPermis ? v?.voie === 'essai_abonne' : (v?.voie === 'changement_prix' && v?.prorata === 'immediat'), `${cas} : prélevé — ${essaiPermis ? 'essai d\'abonné (schedule : sa formule 7 jours, puis le pack)' : 'changement de prix always_invoice, différence tout de suite'}`, JSON.stringify(v));
        preleve = essaiPermis ? 'rien de plus 7 jours (schedule), puis la différence sur la facture du 30/11' : 'différence au prorata tout de suite (always_invoice), puis le prix du pack';
      } else if (X === 'apple') {
        ok(EA.groupeAppleDeLIdentifiant?.(FC.PRODUITS_BOUTIQUES?.[f.pack]?.apple) === 'plan' && EA.groupeAppleDeLIdentifiant?.(f.apple) === 'plan', `${cas} : prélevé — même groupe « FillSell Plan » : Apple monte le même abonnement`);
        preleve = 'Apple : le prix du pack aujourd\'hui, le reste de l\'ancienne formule remboursé au prorata (même groupe)';
      } else {
        ok(AF.modeRemplacement?.(f.google, f.pack) === 5, `${cas} : prélevé — Google remplace l'abonnement (CHARGE_FULL_PRICE, mode 5 : le prix entier, décision du 14/11)`, String(AF.modeRemplacement?.(f.google, f.pack)));
        preleve = 'Google : le prix entier du pack aujourd\'hui (mode 5), puis chaque mois';
      }
      // L'accès Cloud.
      if (X === 'stripe') {
        const sPack = { ...subFormule(f), metadata: { plan_type: f.meta, formule: f.pack }, items: { data: [{ price: { id: PRIX[f.pack] } }] } };
        const dr = C.drapeauxDepuisStripe?.([sPack], PRIX);
        const up = C.miseAJourProfilDepuisStripe?.(dr, null);
        ok(up?.is_cloud === true && up?.cloud_canal === 'stripe' && up?.cloud_formule === f.pack && up?.is_premium === true, `${cas} : accès — is_cloud, cloud_canal 'stripe', cloud_formule '${f.pack}' (stripe-webhook recomputeStripeFlags)`, JSON.stringify(up));
      } else {
        const plan = FS.planAchatBoutique?.({ produit: FC.PRODUITS_BOUTIQUES?.[f.pack]?.[X], sens: 'on' });
        ok(plan?.cloud === 'ecrire' && plan?.drapeaux?.is_premium === true && (f.rang < 2 || plan?.drapeaux?.is_pro === true) && plan?.formule === f.pack, `${cas} : accès — le webhook ${X === 'apple' ? 'apple-iap-webhook' : 'google-play-webhook / validate-google-purchase'} écrit le Cloud (ecritureCloudStore + cloud_formule) et le palier`, JSON.stringify(plan));
      }
      lignes.push([cas, carte ? `carte « ${nomPack} » achetable (cta ${carte.cta})` : '—', nb(note), preleve]);
    }
    // ═══ VOIES 2-4 : LE CLOUD SEUL SUR CHAQUE CANAL ═══
    for (const Y of CANAUX) {
      const cas = `${f.nom} ${NOM_CANAL[X]} → Cloud seul sur ${NOM_CANAL[Y]}${Y === X ? '' : ' (autre canal)'}`;
      // 1. La garde.
      if (Y === 'stripe') {
        const d = U.decisionSurLectures?.({ canal: 'stripe', achat: 'cloud_seul', profil: c.profil, stripe: lus(c.subs), googleActif: c.googleActif, maintenant: MAINTENANT });
        ok(d?.permis === true, `${cas} : garde (create-checkout-session)`, JSON.stringify(d));
        ok(FS.cloudSeulRefuse?.({ profil: c.profil, formulesOuvertes: true, formuleVivante: (U.compterFormules?.(d?.vivants)?.formules?.length ?? 0) > 0 }) === false, `${cas} : pas « offre_remplacee » (abonné)`);
      } else {
        const d = U.decisionAchat?.({ canal: Y, achat: 'cloud_seul', vivants });
        ok(d?.permis === true, `${cas} : garde (garde-abonnement)`, JSON.stringify(d));
      }
      // 2. L'écran : Réglages › Abonnement montre le bloc du Cloud seul (bouton « Essayer 7 jours gratuits » / « Ajouter »).
      ok(F.blocCloudSeulCache?.({ formulesVisibles: true, formuleActuelle: null, cloudSeulEnCours: false, canalAbonnement: X }) === false, `${cas} : écran — le bloc FillSell Cloud se montre (BlocCloudReglages, état « aucun »)`);
      // 3. Le texte (le compte n'a jamais eu le Cloud : essai si la boutique l'offre ; web : toujours).
      const texteEssai = T?.aucunNoteEssai?.('20 novembre');
      ok(nb(texteEssai) === "Carte demandée, rien n'est prélevé avant le 20 novembre. Puis 24,99 €/mois, tu l'arrêtes quand tu veux.", `${cas} : texte avec essai`, texteEssai);
      const texteSans = Tc?.noteSansSemaine;
      if (Y !== 'stripe') ok(nb(texteSans) === "Pas d'essai : 24,99 € prélevés aujourd'hui, puis chaque mois. Tu l'arrêtes quand tu veux.", `${cas} : texte sans semaine de la boutique`, texteSans);
      const pendant = T?.essaiFin?.('20 novembre', '18:18', f.nom);
      ok(typeof pendant === 'string' && nb(pendant).includes(`s'ajoutent à ta formule ${f.nom}`) && pendant.includes('20 novembre'), `${cas} : pendant l'essai, le bloc dit que 24,99 €/mois s'ajoutent à sa formule`, pendant);
      // 4. Ce qui est prélevé.
      let preleve = '';
      if (Y === 'stripe') {
        const p = C.parametresCheckoutCloud?.({ prixCloud: PRIX.cloud, essai: true, userId: 'u', maintenant: MAINTENANT });
        const permisEssai = C.essaiCloudPermis?.(c.profil, c.subs, PRIX);
        ok(p?.subscription_data?.trial_period_days === 7 && p?.subscription_data?.trial_settings?.end_behavior?.missing_payment_method === 'cancel' && p?.payment_method_collection === 'always' && permisEssai === true,
          `${cas} : prélevé — Checkout du Cloud seul, essai 7 jours (0 € aujourd'hui, 24,99 € le 20/11), un 2e abonnement Stripe à part`, JSON.stringify({ sd: p?.subscription_data, permisEssai }));
        preleve = '0 € aujourd\'hui, 24,99 € le 20/11 puis chaque mois (2e abonnement Stripe, échéance à part) ; essai déjà pris : 24,99 € aujourd\'hui';
      } else if (Y === 'apple') {
        ok(EA.groupeAppleDeLIdentifiant?.(EA.PRODUIT_CLOUD_APPLE) === 'cloud' && EA.groupeAppleDeLIdentifiant?.(f.apple) === 'plan', `${cas} : prélevé — groupe « FillSell Cloud », à part de la formule : un 2e abonnement Apple, la formule n'est pas touchée`);
        preleve = 'Apple : semaine gratuite si l\'identifiant Apple ne l\'a jamais eue dans le groupe « FillSell Cloud », puis 24,99 € ; sinon 24,99 € aujourd\'hui';
      } else {
        ok(/const r = await purchasePremium\(PRODUIT_CLOUD, user\.id\);/.test(lire('src/cloud/achatCloud.js')), `${cas} : prélevé — Android : achat du Cloud seul SANS oldPurchaseToken (un 2e abonnement, la formule Google n'est pas remplacée)`);
        preleve = 'Google : l\'offre d\'essai du Cloud (cloud-trial-3d, 7 jours) si Google la rend, puis 24,99 € ; sinon 24,99 € aujourd\'hui';
      }
      // 5. L'accès Cloud, et la formule gardée des deux côtés.
      if (Y === 'stripe') {
        const subs = [...c.subs, subCloudEssai];
        const dr = C.drapeauxDepuisStripe?.(subs, PRIX);
        const up = C.miseAJourProfilDepuisStripe?.(dr, null);
        const garde = DC.drapeauxStripeAvecStores?.(dr, c.profil, MAINTENANT);
        ok(up?.cloud_canal === 'stripe' && up?.cloud_ref === 'sub_cloud' && Boolean(up?.cloud_essai_fin) && garde?.is_premium === true && (f.rang < 2 || garde?.is_pro === true) && (f.rang < 3 || garde?.is_business === true),
          `${cas} : accès — Cloud ouvert (cloud_canal 'stripe', essai daté), palier ${f.nom} gardé (stripe-webhook : drapeauxStripeAvecStores)`, JSON.stringify({ up, garde }));
      } else {
        const lecture = { essai: true, debut: new Date(MAINTENANT).toISOString(), fin: new Date(MAINTENANT + 7 * 86400000).toISOString(), original: 'ref_cloud', renouvellementAuto: true };
        const e = C.ecritureCloudStore?.({ canal: Y, lecture, sens: 'on', ref: 'ref_cloud', profil: { ...c.profil, cloud_canal: null }, maintenant: MAINTENANT });
        ok(e?.update?.cloud_canal === Y && e?.update?.is_premium === undefined && e?.update?.is_pro === undefined, `${cas} : accès — ecritureCloudStore pose cloud_canal '${Y}' (essai daté), sans toucher au palier`, JSON.stringify(e));
        // L'événement suivant du canal de la FORMULE n'efface pas ce Cloud.
        if (X === 'stripe') {
          const up = C.miseAJourProfilDepuisStripe?.(C.drapeauxDepuisStripe?.(c.subs, PRIX), Y);
          ok(up && !('is_cloud' in up) && !('cloud_canal' in up) && up.is_premium === true, `${cas} : le renouvellement Stripe de la formule ne touche pas au Cloud ${NOM_CANAL[Y]}`, JSON.stringify(up));
        } else {
          const plan = FS.planAchatBoutique?.({ produit: f[X], sens: 'on', cloudLie: false });
          ok(plan && plan.cloud === null, `${cas} : le renouvellement ${NOM_CANAL[X]} de la formule ne touche pas au Cloud`, JSON.stringify(plan));
        }
      }
      lignes.push([cas, 'bloc FillSell Cloud : « Essayer 7 jours gratuits » / « Ajouter »', nb(`${texteEssai} | sans semaine : ${texteSans} | pendant : ${pendant}`), preleve]);
    }
  }
}

console.log(`Tableau (c) — ${lignes.length} cases :`);
for (const [cas, ecran, texte, preleve] of lignes) console.log(`  · ${cas}\n      écran : ${ecran}\n      texte : ${texte}\n      prélevé : ${preleve}`);
ok(lignes.length === 36, `36 cases (3 formules × 3 canaux × 4 voies)`, String(lignes.length));
console.log(`\n${rouges === 0 ? '✓' : '✗'} abonne-ajoute-le-cloud : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
