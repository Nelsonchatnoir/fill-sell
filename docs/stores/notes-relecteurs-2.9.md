# Notes pour les relecteurs Apple et Google — version 2.9 (à coller par Nico, mot de passe compris)

DEUX comptes (décision de Nico du 05/11 à 22:55 : « Deux comptes, Cloud jamais offert ») — Google ne peut ni acheter
ni prendre d'essai, Apple doit pouvoir acheter :
- **Apple : test@fillsell.app** (d6a9e726, déjà saisi dans App Store Connect — rien à ressaisir chez Apple). 22:12 :
  témoin Cloud (offre visible et ACHETABLE en bac à sable), 7 articles de démo ajoutés (les 60 d'avant gardés), Premium
  offert intact ; 22:13 : ajouté à COMPTES_AUTORISES de cloud-2. Script : scripts/reparations/20261105_compte_relecture_apple.sql.
- **Google : googlereview@fillsell.app** (953c1ca6, « Compte test Review » de la Play Console). 21:40 : témoin Cloud
  (visible, jamais offert), 7 articles de démo propres, Premium offert intact ; 21:41 : cloud-2. Script :
  scripts/reparations/20261105_compte_demo_relecteurs.sql.
Les mots de passe ne changent pas (Claude n'en saisit jamais) : les notes ci-dessous se collent avec le bon identifiant.

⚠ Phase 3 (Cloud en France seulement, offre masquée ailleurs) : le relecteur Apple est en général aux États-Unis. Le
compte Apple est TÉMOIN (`beta_flags.cloud`) : la règle « hors France, pas d'offre » doit le laisser voir l'offre
partout, sinon l'abonnement ne peut pas être relu (refus probable). À tenir dans le code de la phase 3, avec son test.

## Texte à coller (anglais : les relecteurs lisent l'anglais) — Apple : test@fillsell.app ; Google : googlereview@fillsell.app

Sign-in: <EMAIL> / <PASSWORD>

This demo account has the Premium plan enabled, so every feature can be tested without paying, and its stock already
holds a few sample items.

FillSell is a reseller tool: from the phone you create listings (Lens recognises an item from a photo and writes the
title, description and price), keep your stock and margins, and follow sales. The actions on the marketplaces
themselves (posting, reposting, withdrawing) are carried out either by our free Chrome extension on the seller's
computer, or by the optional FillSell Cloud subscription — so they need real marketplace accounts, which are not
required for this review.

In-app purchases to review:
- Plans (Premium, Pro, Business): auto-renewable subscriptions, from the plans sheet (tap the plan badge, or any
  "Unlock" button).
- FillSell Cloud (app.fillsell.cloud.sub): an auto-renewable monthly subscription with a 7-day free trial, separate
  from the plans. In the plans sheet, turn on "FillSell Cloud · no computer", then subscribe; in the sandbox the trial
  starts at once. Within about three minutes the app shows "Your FillSell Cloud is starting", then the "Sign in" buttons
  of the marketplaces (connecting one needs a real marketplace account; this step can be skipped).
  FillSell Cloud is offered in France only; this demo account sees the offer whatever the device region, for the
  review.

The subscription terms, the price and the renewal information are shown on the purchase screen, with links to the
Terms of Use (Apple standard EULA), our Terms and Conditions and our Privacy Policy
(https://fillsell.app/legal?lang=en).

— Variante GOOGLE (remplace le paragraphe « FillSell Cloud » ci-dessus ; le relecteur Google ne peut ni acheter ni
  prendre d'essai) :
- FillSell Cloud (app.fillsell.cloud.sub): an optional auto-renewable monthly subscription with a 7-day free trial,
  offered in France only and separate from the plans. This test account sees the offer (plans sheet, "FillSell Cloud ·
  no computer") with its price, trial and renewal terms; the service itself runs on our servers once a seller connects
  real marketplace accounts, so it is not active on this account. Every other feature is unlocked by the Premium plan.

Support: support@fillsell.app — we answer within 24 hours.
