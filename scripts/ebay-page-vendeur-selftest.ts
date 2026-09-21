// Selftest : reconnaître la page d'inscription VENDEUR eBay.
//   deno run scripts/ebay-page-vendeur-selftest.ts
//
// Ce que ce test protège (21/09, job 7678a1ed, adamchocho13) : un compte eBay
// jamais activé pour vendre est détourné vers onboardweb.ebay.fr au clic
// « Mettre en vente ». Tant que cette adresse-là n'était pas reconnue, le job
// mourait sur une erreur technique (canal coupé), le serveur la prenait pour
// une mise en veille de Chrome, et la personne lisait « rien à faire de ton
// côté » pendant que ses reprises se consommaient contre un mur.
//
// Les adresses ci-dessous ne sont pas inventées : les 12 premières « non »
// sont les adresses de fin RELEVÉES en base (work_window_state.at_end.tab_url)
// sur les 408 jobs qui en portent une. Aucune ne doit matcher — un faux
// positif arrêterait un job qui n'a rien à voir avec le mur.

import { estPageInscriptionVendeurEbay } from "../supabase/functions/_shared/ebay-page-vendeur.ts";

let ko = 0;
const ok = (attendu: boolean, u: unknown, pourquoi: string) => {
  const rendu = estPageInscriptionVendeurEbay(u);
  const bon = rendu === attendu;
  if (!bon) ko++;
  console.log(`  ${bon ? "ok  " : "⚠ KO"} ${String(u) || "(vide)"} → ${rendu} — ${pourquoi}`);
};

console.log("=== 1. LE MUR : on l'arrête là ===");
ok(true, "https://onboardweb.ebay.fr/onboard-revamped/", "RELEVÉ en prod, job 7678a1ed");
ok(true, "https://onboardweb.ebay.fr/onboard-revamped/?flow=sell", "même hôte, avec paramètres");
ok(true, "https://onboardweb.ebay.com/onboard-revamped/", "même hôte, .com");
ok(true, "https://reg.ebay.fr/reg/PartialReg", "hôte d'inscription eBay");
ok(true, "https://www.ebay.fr/sellerregistration", "chemin d'inscription vendeur");
ok(true, "https://www.ebay.fr/sell/onboarding/start", "chemin d'activation vendeur");
ok(true, "https://www.ebay.co.uk/sl/reg", "domaine à deux niveaux");

console.log("=== 2. LES ADRESSES DE FIN RELEVÉES EN BASE : aucune ne matche ===");
ok(false, "https://www.ebay.fr/lstng?mode=AddItem", "le formulaire de dépôt eBay lui-même");
ok(false, "https://www.ebay.fr/lstng/error", "erreur de dépôt générique — cause indécidable");
ok(false, "https://www.ebay.fr/", "accueil eBay");
ok(false, "https://www.ebay.fr/sh/lst/active", "Seller Hub, page normale d'un retrait");
ok(false, "https://signin.ebay.fr/ws/eBayISAPI.dll", "mur de CONNEXION : déjà nommé REAUTH VENTE");
ok(false, "https://www.ebay.fr/verifyidentity", "vérification d'IDENTITÉ : autre cause, autre message");
ok(false, "https://www.ebay.fr/sh/acc/verification", "vérification d'IDENTITÉ");
ok(false, "https://www.vinted.fr/items/new", "dépôt Vinted");
ok(false, "https://www.vinted.fr/member/register/select_type", "mur Vinted : hors de ce lot");
ok(false, "https://www.beebs.app/fr/auth", "mur Beebs : hors de ce lot");
ok(false, "https://www.leboncoin.fr/deposer-une-annonce", "dépôt Leboncoin");
ok(false, "https://www.opla.co/sell/create", "dépôt Opla");

console.log("=== 3. CE QUI IMITE eBAY SANS EN ÊTRE ===");
ok(false, "https://onboardweb.ebay.fr.exemple.com/onboard-revamped/", "sous-domaine trompeur");
ok(false, "https://notebay.fr/sellerregistration", "domaine qui se termine par 'ebay.fr' sans point");
ok(false, "https://www.ebay.fr/sellerregistrations-autre-chose", "chemin voisin, pas le même");

console.log("=== 4. RIEN DU TOUT ===");
ok(false, "pas une url", "chaîne qui n'est pas une adresse");
ok(false, "", "chaîne vide");
ok(false, null, "null");
ok(false, undefined, "absent");
ok(false, 42, "pas une chaîne");

console.log(ko ? `\n⚠ ${ko} CAS EN ECHEC` : "\n✓ TOUS LES CAS PASSENT");
if (ko) Deno.exit(1);
