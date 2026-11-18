// ═══════════════════════════════════════════════════════════════════════════
// VERROU — UNE MONTÉE DE FORMULE NE FAIT PAYER QUE LA DIFFÉRENCE, ET L'ÉCRAN DIT COMBIEN (18/11/2026, lot T1, décision 4)
//   npm run selftest:montant-montee
// ═══════════════════════════════════════════════════════════════════════════
// Cas Butin d'Or (18/11, Android) : Business puis Business + Cloud remplacé en CHARGE_FULL_PRICE → deux débits pleins le
// même soir. Décision 4 de Nico : la montée passe au prorata (Google : CHARGE_PRORATED_PRICE, réglé par l'app, livré par
// OTA), et l'écran 21 dit le bon montant sur Google ET sur Apple (Apple : sa règle, prix plein − remboursement).
// Ce verrou fait tomber : un retour au prix entier hors essai, un essai prolongé par le prorata (pendant un essai : prix
// entier), un montant faux ou absent quand les prix sont lus, un client qui paierait deux fois les mêmes jours.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 600)}` : ''}`); }
};
const charger = async (p) => { try { return await import(p); } catch (e) { return { __erreur: e.message }; } };
const M = await charger('../src/lib/montantMontee.js');
const CF = await charger('../src/lib/changementFormuleBoutique.js');
const TF = await charger('../src/cloud/textesFormules.js');
const FC = await charger('../src/cloud/formulesCloud.js');
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const net = (s) => String(s ?? '').replace(ESP, ' ');
const MAINTENANT = Date.parse('2026-11-18T12:00:00Z');
const ECHEANCE = '2026-12-03T12:00:00Z';   // abonné depuis le 03/11 : 15 jours restants sur 30

console.log('1. Le calcul (pur)');
ok(typeof M.montantMontee === 'function', 'montantMontee se charge', M.__erreur);
if (typeof M.montantMontee === 'function') {
  const g = M.montantMontee({ canal: 'google', prixActuel: 29.99, prixCible: 49.99, echeance: ECHEANCE, maintenant: MAINTENANT });
  ok(g?.aujourdhui === 10 && g.joursRestants === 15 && g.joursPeriode === 30, 'Google, Pro → Pro + Cloud, 15 jours sur 30 : 10,00 € aujourd’hui (la différence)', JSON.stringify(g));
  const a = M.montantMontee({ canal: 'apple', prixActuel: 29.99, prixCible: 49.99, echeance: ECHEANCE, maintenant: MAINTENANT });
  ok(a?.preleve === 49.99 && a.rembourse === 15 && a.net === 34.99, 'Apple : 49,99 € prélevés, 15,00 € remboursés, 34,99 € de plus', JSON.stringify(a));
  // Le résultat pour le client est le même : sur la même durée de service, il paie la même chose.
  // Google : 10,00 aujourd'hui (15 j de différence) + 49,99 à l'échéance pour 30 j → 45 jours de Pro + Cloud : 59,99.
  // Apple : 34,99 aujourd'hui (30 j de Pro + Cloud, moins les 15 j de Pro déjà payés) + 49,99 × 15/30 pour les 15 j suivants.
  const googleTotal = g.aujourdhui + 49.99;
  const appleTotal = a.net + 49.99 * 15 / 30;
  ok(Math.abs(googleTotal - appleTotal) < 0.02, `même service, même prix : ${googleTotal.toFixed(2)} € (Google) = ${appleTotal.toFixed(2)} € (Apple) pour 45 jours de Pro + Cloud`);
  ok(M.montantMontee({ canal: 'google', prixActuel: 49.99, prixCible: 29.99, echeance: ECHEANCE, maintenant: MAINTENANT }) === null, 'une descente : aucun montant de montée');
  ok(M.montantMontee({ canal: 'google', prixActuel: 29.99, prixCible: 49.99, echeance: '2026-11-01T00:00:00Z', maintenant: MAINTENANT }) === null, 'échéance passée : rien (jamais un montant deviné)');
  ok(M.montantMontee({ canal: 'stripe', prixActuel: 29.99, prixCible: 49.99, echeance: ECHEANCE, maintenant: MAINTENANT }) === null, 'web : Stripe dit déjà la différence (aucun calcul ici)');
  const aff = M.montantMonteeAffiche({ canal: 'google', cleActuelle: 'pro', cleCible: 'pro_cloud', echeanceIso: ECHEANCE, prix: { pro: { montant: 29.99, devise: 'EUR' }, pro_cloud: { montant: 49.99, devise: 'EUR' } }, maintenant: MAINTENANT });
  ok(net(aff?.aujourdhui) === '10,00 €' && /3 décembre/.test(aff?.date ?? ''), 'affiché : « 10,00 € », jusqu’au « 3 décembre »', JSON.stringify(aff));
  ok(M.montantMonteeAffiche({ canal: 'google', cleActuelle: 'pro', cleCible: 'pro_cloud', echeanceIso: ECHEANCE, prix: { pro: { montant: 29.99, devise: 'USD' }, pro_cloud: { montant: 49.99, devise: 'EUR' } }, maintenant: MAINTENANT }) === null, 'deux devises : rien');
  ok(M.cleActuelleDuCompte({ founder: true, palier: 'premium' }) === null && M.cleActuelleDuCompte({ palier: 'pro' }) === 'pro' && M.cleActuelleDuCompte({ formuleActuelle: 'pro_cloud', palier: 'pro' }) === 'pro_cloud',
    'Founder : son prix réel n’est pas lu → aucun montant ; sinon sa formule ou son palier');
}

console.log('\n2. Le mode Google : la différence hors essai, le prix entier pendant un essai');
ok(typeof CF.effetBoutique === 'function', 'changementFormuleBoutique se charge', CF.__erreur);
if (typeof CF.effetBoutique === 'function') {
  const m = CF.effetBoutique({ canal: 'google', sens: 'montee' });
  ok(m.modeGoogle === 2 && m.debit === 'prorata' && m.quand === 'maintenant', 'Google, montée hors essai : CHARGE_PRORATED_PRICE (2), la différence', JSON.stringify(m));
  const e = CF.effetBoutique({ canal: 'google', sens: 'montee', essaiEnCours: true });
  ok(e.modeGoogle === 5 && e.essaiArrete === true, 'pendant un essai : le prix entier (5) — jamais un essai prolongé par le prorata');
  ok(CF.effetBoutique({ canal: 'google', sens: 'descente' }).modeGoogle === 6, 'descente : au renouvellement (6), inchangé');
  ok(CF.effetBoutique({ canal: 'apple', sens: 'montee' }).debit === 'prix_plein', 'Apple : sa règle (prix plein, remboursement par Apple)');
  // La fenêtre « Changer de formule » (Pro + Cloud payé → Business + Cloud) : la différence ET son montant.
  const compte = { idActuel: 'app.fillsell.pro.cloud', essaiEnCours: false, cloudDansFormule: true, echeance: ECHEANCE };
  const plan = CF.planChangementBoutique({ canal: 'google', compte, cible: 'business', prix: (c) => (c === 'business_cloud' ? '79,99 €' : c === 'business' ? '59,99 €' : null),
    prixMontant: (c) => ({ pro_cloud: { montant: 49.99, devise: 'EUR' }, business_cloud: { montant: 79.99, devise: 'EUR' }, business: { montant: 59.99, devise: 'EUR' } })[c] ?? null, maintenant: MAINTENANT });
  const o = plan?.options?.find((x) => x.cle === 'business_cloud');
  const t = o ? CF.textesOption(o, { canal: 'google', lang: 'fr' }) : null;
  ok(net(o?.montant?.aujourdhui) === '15,00 €', 'Pro + Cloud → Business + Cloud, 15 j sur 30 : environ 15,00 € aujourd’hui', JSON.stringify(o?.montant));
  ok(/ne prélève que la différence jusqu'à ton échéance du 3 décembre : environ 15,00 €\. Puis 79,99 € par mois, à la même date\./.test(net(t?.lignes?.join(' '))) && /Confirmer et payer la différence/.test(t?.bouton ?? ''),
    'la fenêtre dit le montant et la date ; le bouton ne promet jamais le prix entier', JSON.stringify(t));
}

console.log('\n3. L’écran 21 (la note de la carte : abonné qui ajoute le Cloud)');
if (typeof FC.texteNoteCarte === 'function' && typeof TF.textesFormules === 'function') {
  const T = TF.textesFormules('fr');
  const carte = { formule: 'pro_cloud', note: 'boutique', achetable: true };
  const mg = { canal: 'google', aujourdhui: '10,00 €', date: '3 décembre' };
  const ma = { canal: 'apple', preleve: '49,99 €', rembourse: '15,00 €', net: '34,99 €', date: '3 décembre' };
  const g = net(FC.texteNoteCarte(carte, { T, canalApp: 'google', nom: 'Pro + Cloud', prix: '49,99 €', montant: mg }));
  ok(/Google Play ne prélève que la différence jusqu'à ton échéance du 3 décembre : environ 10,00 €\. Puis 49,99 € par mois, à la même date\./.test(g), 'Android : « environ 10,00 € » aujourd’hui, puis le prix à la même date', g);
  const a = net(FC.texteNoteCarte(carte, { T, canalApp: 'apple', nom: 'Pro + Cloud', prix: '49,99 €', montant: ma }));
  ok(/Apple prélève 49,99 € et te rembourse environ 15,00 € pour les jours non utilisés de ta formule actuelle : environ 34,99 € de plus\. Ton nouveau mois commence aujourd'hui\./.test(a), 'iPhone : prélevé, remboursé, de plus — les trois montants', a);
  const sans = net(FC.texteNoteCarte(carte, { T, canalApp: 'google', nom: 'Pro + Cloud', prix: '49,99 €' }));
  ok(/ne prélève que la différence jusqu'à ton échéance, puis 49,99 € par mois/.test(sans) && !/sont prélevés aujourd'hui sur ton compte Google Play/.test(sans), 'Android sans montant lu : jamais « le prix entier aujourd’hui »', sans);
} else ok(false, 'formulesCloud / textesFormules se chargent', FC.__erreur ?? TF.__erreur);

console.log('\n4. Partout où l’app choisit le mode');
const app = lire('src/App.jsx');
ok(/let modeRemplacementGoogle=2;/.test(app) && /modeRemplacementGoogle=ch\.replacementMode\?\?2;/.test(app), 'App (formules sans Cloud) : la différence par défaut');
ok(/prixMontant:\(cle\)=>lirePrixBoutique\(\)\.prix\?\.\[cle\]\?\?null,lang,/.test(app), 'App : la fenêtre reçoit les montants lus à la boutique');
const ach = lire('src/cloud/achatFormuleCloud.js');
ok(/\? 2 : 6;/.test(ach), 'achatFormuleCloud (repli sans fenêtre) : 2 en montée, 6 en descente');
const cm = lire('src/components/ConversionModal.jsx');
ok(/montantDe=\{montantDe\}/.test(cm) && /montantMonteeAffiche\(\{/.test(cm), 'la fenêtre d’offres passe le montant aux cartes');
ok(/montant: montantMonteeAffiche\(\{ canal: canalApp/.test(lire('src/cloud/BlocFormulesReglages.jsx')), 'Réglages › Abonnement : le même montant');
const patch = lire('patches/@capgo+native-purchases+8.3.3.patch');
ok(/setSubscriptionReplacementMode\(replacementMode\)/.test(patch), 'le module natif (déjà dans les binaires en vente) applique le mode reçu : livrable par OTA, aucun binaire');

console.log(`\n${rouges ? `✗ montant-montee : ${rouges} rouge(s), ${verts} vert(s)` : `✓ montant-montee : ${verts} vert(s), 0 rouge`}`);
process.exit(rouges ? 1 : 0);
