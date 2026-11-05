// (05/11 soir, lot « Ouverture du Cloud ») La page de retour de Stripe dit CE qui a été acheté — jamais « plan Premium »
// pour un Pro, un Business, un Cloud ou un pack, jamais 12,99 € comptés pour autre chose que le Premium.
import { readFileSync } from 'node:fs';
import { messageSucces } from '../src/pages/succesAchat.js';

let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const q = (s) => new URLSearchParams(s);

const cloudEssai = messageSucces(q('?produit=cloud&essai=1&session_id=cs_test_1'));
ok(cloudEssai.titre === 'Ton FillSell Cloud démarre' && /essai gratuit de 7 jours/.test(cloudEssai.texte) && /rien n'est prélevé/.test(cloudEssai.texte), 'Cloud en essai : « démarre », 7 jours, rien prélevé');
ok(cloudEssai.valeur === null, 'Cloud en essai : aucune valeur d’achat comptée');
const cloudPaye = messageSucces(q('?produit=cloud'));
ok(cloudPaye.valeur === 24.99 && /actif/.test(cloudPaye.texte), 'Cloud payé : 24,99 € comptés');
ok(!/Premium/.test(cloudEssai.titre + cloudEssai.texte + cloudPaye.titre), 'Cloud : jamais « Premium »');
ok(messageSucces(q('?produit=standard')).titre === 'Bienvenue sur le plan Premium !' && messageSucces(q('?produit=standard')).valeur === 12.99, 'Premium : son titre, 12,99 €');
ok(messageSucces(q('?produit=pro')).titre === 'Bienvenue sur le plan Pro !' && messageSucces(q('?produit=pro')).valeur === null, 'Pro : son titre, aucune valeur inventée');
ok(messageSucces(q('?produit=business')).titre === 'Bienvenue sur FillSell Business !', 'Business : son titre');
ok(messageSucces(q('?produit=pack')).titre === 'Achat confirmé !', 'pack : achat confirmé');
const neutre = messageSucces(q(''));
ok(neutre.titre === 'Paiement confirmé' && neutre.valeur === null, 'retour sans produit (ancienne session) : neutre, aucune valeur');
ok(messageSucces({ produit: 'cloud', essai: '1' }).valeur === null, 'objet simple accepté');
// Le câblage : la page lit le module, et chaque Checkout dit son produit.
const page = readFileSync(new URL('../src/pages/Success.jsx', import.meta.url), 'utf8');
ok(page.includes('messageSucces(') && !page.includes('Bienvenue sur le plan Premium !') && !/value: 12\.99/.test(page), 'Success.jsx : le message vient du module, plus de « Premium » ni de 12,99 en dur');
const ccs = readFileSync(new URL('../supabase/functions/create-checkout-session/index.ts', import.meta.url), 'utf8');
ok(ccs.includes('success?produit=pack&session_id={CHECKOUT_SESSION_ID}'), 'Checkout pack : produit=pack');
ok(ccs.includes('success?produit=cloud${essai ? "&essai=1" : ""}&session_id={CHECKOUT_SESSION_ID}'), 'Checkout Cloud : produit=cloud (+ essai)');
ok(ccs.includes('success?produit=${encodeURIComponent(planType)}&session_id={CHECKOUT_SESSION_ID}'), 'Checkout palier : produit=<palier>');
ok(!/success_url: "https:\/\/fillsell\.app\/success",/.test(ccs), 'plus aucun retour sans produit');

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
