// Autotest du MAIL DE LA VEILLE de fin d'essai FillSell Cloud (04/10/2026 soir).
//
//     npm run selftest:cloud-rappel-veille   (node scripts/cloud-rappel-veille-selftest.mjs)
//
// Ce qu'il prouve, sans réseau : qui reçoit le rappel (jamais un essai arrêté,
// déjà payé, fini, ni deux fois), quand (créneau J-2 → J-1, de jour, une place
// libre dans le plafond de 2 mails par 24 h, puis il part quoi qu'il arrive au
// dernier créneau, toujours avant la fin), le texte fr / en (date de Paris,
// prix, comment arrêter, aucune désinscription : information de facturation),
// et qu'il dit la même chose que l'app (prix) et que la proposition SQL (le
// type entre dans l'index one-shot) et qu'email-tunnel l'envoie bien comme ça.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  TYPE_RAPPEL, CATEGORIE_RAPPEL, DEDUP_RAPPEL, PRIX_AFFICHE, PRESETS, PARAMETRES_RAPPEL,
  fenetreRequete, decisionRappel, dateFin, texteRappel,
} from '../supabase/functions/_shared/cloud-rappel-veille.js';
import { CLOUD_PRIX_AFFICHE } from '../src/utils/palier.js';

let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const titre = (t) => console.log(`\n${t}`);
const H = 3_600_000;
const FIN = Date.parse('2026-10-13T16:00:00Z');            // mardi 13 octobre, 18h00 à Paris
const iso = (t) => new Date(t).toISOString();
const profil = (o = {}) => ({ email: 'marie@exemple.fr', cloud_essai_debut: iso(FIN - 7 * 24 * H), cloud_essai_fin: iso(FIN), ...o });
const dec = (o) => decisionRappel({ profil: profil(), heureParis: 10, mails24h: 0, ...o });

titre('0. Le contrat');
ok(TYPE_RAPPEL === 'cloud_essai_veille' && CATEGORIE_RAPPEL === 'support' && DEDUP_RAPPEL === 'reservation', 'type cloud_essai_veille, catégorie support (facturation), envoi en réservation (un seul)');
ok(PRIX_AFFICHE === CLOUD_PRIX_AFFICHE, `prix = CLOUD_PRIX_AFFICHE de l'app (${CLOUD_PRIX_AFFICHE})`);
ok(PARAMETRES_RAPPEL.ouvertureAvantFinH === 48 && PARAMETRES_RAPPEL.forcageAvantFinH === 24, 'créneau par défaut : J-2 → J-1 (décision de Nico)');
ok(PRESETS.mastercard.ouvertureAvantFinH === 96 && PRESETS.mastercard.forcageAvantFinH === 72, 'préréglage Mastercard prêt : 3 à 7 jours avant la fin');
ok(PARAMETRES_RAPPEL.plafond24h === 2, 'plafond : 2 mails par 24 h, comme envoi-ponctuel');
const sql = readFileSync(fileURLToPath(new URL('../supabase/migrations/PROPOSITION_20261004_cloud_option_et_pool_ip.sql.txt', import.meta.url)), 'utf8');
ok(sql.includes(`'cloud_essai_veille'::text`) && sql.includes('email_logs_one_shot_unique'), 'la PROPOSITION SQL ajoute cloud_essai_veille à l\'index one-shot');
const tunnel = readFileSync(fileURLToPath(new URL('../supabase/functions/email-tunnel/index.ts', import.meta.url)), 'utf8');
ok(/from "\.\.\/_shared\/cloud-rappel-veille\.js"/.test(tunnel), 'email-tunnel utilise ce module (aucune règle recopiée)');
ok(/categorie:\s*CATEGORIE_RAPPEL/.test(tunnel) && /dedup:\s*DEDUP_RAPPEL/.test(tunnel) && /type:\s*TYPE_RAPPEL/.test(tunnel), 'email-tunnel envoie par la porte unique avec ce type, cette catégorie, cette dédup');
ok(/cloud_essai_arrete/.test(tunnel) && /garde/i.test(tunnel), 'email-tunnel lit les colonnes Cloud par une lecture SÉPARÉE, derrière une garde');

titre('1. Qui reçoit le rappel');
ok(dec({ profil: null }).action === 'rien' && dec({ profil: profil({ email: '' }) }).raison === 'sans_adresse', 'sans adresse → rien');
ok(dec({ profil: profil({ cloud_essai_debut: null }) }).raison === 'pas_d_essai', 'pas d\'essai → rien');
ok(dec({ profil: profil({ cloud_essai_arrete: true }), maintenant: FIN - 30 * H }).raison === 'essai_arrete', 'essai ARRÊTÉ → rien (rien ne sera facturé)');
ok(dec({ profil: profil({ is_cloud: true }), maintenant: FIN - 30 * H }).raison === 'deja_payant', 'déjà payée → rien');
ok(dec({ dejaEnvoye: true, maintenant: FIN - 30 * H }).raison === 'deja_envoye', 'déjà envoyé → jamais deux');
ok(dec({ maintenant: FIN }).raison === 'essai_fini' && dec({ maintenant: FIN + H }).raison === 'essai_fini', 'essai fini → trop tard, rien');

titre('2. Quand — le créneau, la place libre, le dernier créneau');
ok(dec({ maintenant: FIN - 49 * H }).raison === 'pas_encore', '49 h avant la fin → pas encore');
ok(dec({ maintenant: FIN - 47 * H }).action === 'envoyer' && dec({ maintenant: FIN - 47 * H }).raison === 'place_libre', '47 h avant, aucun mail aujourd\'hui → il part (place libre)');
ok(dec({ maintenant: FIN - 47 * H, mails24h: 1 }).action === 'envoyer', '1 mail déjà reçu dans les 24 h → il part (2e place)');
ok(dec({ maintenant: FIN - 47 * H, mails24h: 2 }).raison === 'plafond_plein', '2 mails déjà reçus → il ATTEND une place (il compte dans le plafond)');
const force = dec({ maintenant: FIN - 23 * H, mails24h: 5 });
ok(force.action === 'envoyer' && force.force === true && force.raison === 'dernier_creneau', 'à moins de 24 h de la fin : il part QUOI QU\'IL ARRIVE (information de facturation)');
ok(dec({ maintenant: FIN - 30 * H, heureParis: 3 }).raison === 'nuit' && dec({ maintenant: FIN - 23 * H, heureParis: 23 }).raison === 'nuit', 'la nuit (avant 8 h, à partir de 22 h) → il attend, même forcé');
ok(dec({ maintenant: FIN - 30 * H, heureParis: Number.NaN }).raison === 'nuit', 'heure illisible → il attend (échec fermé, comme le tunnel)');
ok(dec({ maintenant: FIN - 30 * H, heureParis: 8 }).action === 'envoyer' && dec({ maintenant: FIN - 30 * H, heureParis: 22 }).action === 'attendre', 'bornes : 8 h oui, 22 h non');
// Garantie : chaque passage horaire de jour entre le forçage et la fin envoie ; il y a au moins 14 h de jour entre les deux.
{
  let premier = null;
  for (let t = FIN - 24 * H; t < FIN; t += H) {
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)));
    if (decisionRappel({ profil: profil(), heureParis: h, mails24h: 9, maintenant: t }).action === 'envoyer') { premier = t; break; }
  }
  ok(premier != null && FIN - premier >= 10 * H, `plafond toujours plein : il part au premier passage de jour du dernier créneau, ${Math.round((FIN - premier) / H)} h avant la fin`);
}
{
  const q = fenetreRequete(FIN - 47 * H);
  ok(Date.parse(q.finApres) === FIN - 47 * H && Date.parse(q.finAvant) === FIN + H, 'requête du passage : les essais dont la fin tombe dans les 48 h');
}
ok(decisionRappel({ profil: profil(), heureParis: 10, mails24h: 2, maintenant: FIN - 80 * H, p: { ...PARAMETRES_RAPPEL, ...PRESETS.mastercard } }).action === 'attendre'
  && decisionRappel({ profil: profil(), heureParis: 10, mails24h: 0, maintenant: FIN - 80 * H, p: { ...PARAMETRES_RAPPEL, ...PRESETS.mastercard } }).action === 'envoyer', 'préréglage Mastercard : le créneau s\'ouvre 4 jours avant');

titre('3. Le texte — fr / en, heure de Paris, aucune désinscription');
ok(dateFin(iso(FIN), 'fr') === 'mardi 13 octobre à 18h00' && dateFin(iso(FIN), 'en') === 'Tuesday 13 October at 18:00', 'date de fin en heure de Paris (« mardi 13 octobre à 18h00 »)');
ok(dateFin('2026-12-01T07:05:00Z', 'fr') === 'mardi 1 décembre à 08h05', 'heure d\'hiver comprise (UTC+1)');
const fr = texteRappel({ lang: 'fr', finIso: iso(FIN) });
ok(fr.sujet === 'Ton essai Sans ordinateur se termine le mardi 13 octobre à 18h00', `sujet : « ${fr.sujet} »`);
ok(fr.paragraphes.some((p) => p.includes('20 € par mois')) && fr.paragraphes.some((p) => p.includes('Réglages → Abonnement')) && fr.paragraphes.some((p) => p.includes('rien n\'est facturé')),
  'le prix, comment arrêter (Réglages → Abonnement), et qu\'un arrêt ne coûte rien');
ok(fr.lienDesinscription === null && fr.categorie === 'support' && /facturation/.test(fr.raisonEnvoi) && /désinscrit/.test(fr.raisonEnvoi), 'aucun lien de désinscription : information de facturation, dit pourquoi');
ok(!/pépite/i.test(JSON.stringify(fr)), 'aucun « pépite » (vocabulaire : quotas)');
const en = texteRappel({ lang: 'en', finIso: iso(FIN), carteFin: '4242' });
ok(en.sujet.startsWith('Your Sans ordinateur trial ends on Tuesday 13 October') && en.paragraphes.some((p) => p.includes('ending in 4242')), 'anglais, et les 4 derniers chiffres de la carte quand le flux de paiement les donne');
ok(!JSON.stringify(texteRappel({ lang: 'fr', finIso: iso(FIN), carteFin: 'abcd' })).includes('abcd'), 'chiffres de carte illisibles → jamais affichés');
ok(texteRappel({ lang: 'de', finIso: iso(FIN) }).sujet === fr.sujet, 'langue inconnue → français');

console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
