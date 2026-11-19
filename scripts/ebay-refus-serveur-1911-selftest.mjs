// VERROU (19/11/2026 soir, point 5 de Nico) — UNE PANNE DU SERVEUR D'eBAY REPART SEULE, AVEC UN PLAFOND.
// Le cas : compte 8ac5bbda, 19/11 15:52, publication eBay refusée (HTTP 400, 25002 « Une erreur utilisateur est survenue.
// Exception du serveur de base de données. ») → needs_user « à relancer » ; relancée à la main à 16:07, publiée sans rien
// changer. La règle des refus passagers (_shared/ebay-refus-momentane.js) ne connaissait que « lieu / disponibilité
// introuvable, réessayez » : elle reconnaît maintenant la panne du serveur d'eBay (25002 qui parle de son serveur, de sa
// base, de son système ; 25001 erreur système) — même plafond de 3 essais, puis un message vrai. Jamais un 25002 qui nomme
// un champ, une règle ou une limite. Rouge sur e331f8e, vert après.
import * as R from '../supabase/functions/_shared/ebay-refus-momentane.js';

let echecs = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };
const CAS = 'Une erreur utilisateur est survenue. Exception du serveur de base de données.';
ok(R.refusMomentaneEbay({ errorId: 25002, message: CAS }) === true, '25002 « Exception du serveur de base de données » (compte 8ac5bbda, 15:52) : passager');
ok(R.refusMomentaneEbay({ errorId: '25002', message: 'A user error has occurred. Database server exception.' }) === true, 'la même en anglais : passager');
ok(R.refusMomentaneEbay({ errorId: 25001, message: 'Une erreur système s\'est produite.' }) === true, '25001 (erreur système de l\'API Inventory) : passager');
for (const [m, quoi] of [
  ['Une erreur utilisateur est survenue. Cette annonce entraînerait le dépassement du montant total de votre limite de vente.', 'plafond de vente'],
  ['Une erreur utilisateur est survenue. Le champ EAN n\'a pas été renseigné.', 'EAN'],
  ['Une erreur utilisateur est survenue. Cette annonce semble concerner un objet que vous avez déjà mis en vente sur eBay : X (1).', 'annonce identique'],
  ['Une erreur utilisateur est survenue. Spécifiez des conditions de retour valides.', 'retours'],
  ['Une erreur utilisateur est survenue. Votre compte eBay a été bloqué.', 'compte bloqué'],
]) ok(R.refusMomentaneEbay({ errorId: 25002, message: m }) === false, `un 25002 « ${quoi} » : jamais passager`);
ok(R.verdictRefusMomentane(1) === 'pending' && R.verdictRefusMomentane(2) === 'pending' && R.verdictRefusMomentane(3) === 'needs_user',
  'plafond : 3 essais en tout, puis la main à la personne');
const e1 = R.ecritureRefusMomentane({ platform_fields: {} }, { errorId: 25002, message: CAS }, { tentatives: 1, etape: 'publish', maintenant: '2026-11-19T14:52:00Z' });
ok(e1.status === 'pending' && e1.error === null, '1er refus : la tâche repart seule au passage suivant (pending, sans message)');
const e3 = R.ecritureRefusMomentane({ platform_fields: e1.platform_fields }, { errorId: 25002, message: CAS }, { tentatives: 3, etape: 'publish', maintenant: '2026-11-19T15:00:00Z' });
ok(e3.status === 'needs_user' && !/Exception|25002|Erreur de saisie/.test(e3.error) && /incident passager chez eBay/.test(e3.error),
  'épuisé : un message vrai (rien à corriger), jamais le brut d\'eBay');
const arrete = { platform: 'ebay', status: 'needs_user', action: 'publish', platform_fields: { needs_user_source: 'relancer',
  last_diagnostic: { etape: 'publish', errorId: 25002, message: CAS } } };
ok(R.refusMomentaneARearmer(arrete) === true, 'une tâche déjà arrêtée sur ce refus repart UNE fois (entretien)');
ok(R.refusMomentaneARearmer({ ...arrete, platform_fields: { ...arrete.platform_fields, [R.CLE_REFUS_MOMENTANE]: { essais: 3 } } }) === false, 'jamais deux fois (la marque)');
console.log(echecs ? `✗ ebay-refus-serveur-1911 : ${total - echecs}/${total}` : `✓ ebay-refus-serveur-1911 : ${total}/${total}`);
process.exit(echecs ? 1 : 0);
