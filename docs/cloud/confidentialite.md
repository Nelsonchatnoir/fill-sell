# FillSell Cloud — ajouts à la politique de confidentialité et aux CGV (À VALIDER par Nico)

Rien n'est publié : ces textes entrent dans `src/pages/Legal.jsx` (articles 4.x
et CGV) **après la validation de Nico**, dans le même push que la mise en ligne.
Ils sont écrits pour dire exactement ce que fait le code de la branche `feat/cloud`.

## 1. Politique de confidentialité — nouvel article « 4.8 L'option Sans ordinateur »

> **Ce que nous gardons pour faire tourner l'option.** Quand tu prends l'option
> Sans ordinateur, FillSell publie tes annonces depuis ses serveurs, dans un
> navigateur qui t'est réservé. Pour cela, nous conservons :
> - **les connexions à tes plateformes** (Vinted, Leboncoin) : les cookies de
>   session que la plateforme pose quand tu te connectes depuis l'écran « Me
>   connecter ». Nous ne voyons ni ne gardons jamais ton mot de passe : tu le
>   tapes sur la page de la plateforme. Ces cookies sont **chiffrés** (AES-256)
>   avec une clé qui ne se trouve que sur nos serveurs de navigateurs ; notre base
>   de données n'en garde qu'une version chiffrée ;
> - **une session FillSell propre à ce navigateur**, créée par nos serveurs (aucun
>   mot de passe FillSell n'est stocké) ;
> - **le profil du navigateur** (cookies, stockage local des pages), sur nos serveurs.
>
> **Où.** Les navigateurs tournent chez **Hetzner Online GmbH** (Allemagne, Union
> européenne). Ils sortent sur Internet par une **adresse IP française qui t'est
> réservée**, fournie par **IPRoyal** (UAB « Iproyal », Lituanie, Union européenne) :
> les plateformes voient une connexion française, toujours la même pour toi.
> Ton compte eBay passe par la connexion officielle d'eBay (API), jamais par ce navigateur.
>
> **Combien de temps.** Tant que l'option est active. Quand elle s'arrête (fin
> d'essai sans abonnement, arrêt, suppression du compte), nous **effaçons** le
> navigateur, son profil, tes connexions chiffrées et la session FillSell de ce
> navigateur, au plus tard 3 jours après la fin (le temps d'un premier paiement
> qui arrive en retard). L'adresse IP qui t'était réservée reste au repos 7 jours
> avant de servir à quelqu'un d'autre.
>
> **Un seul essai gratuit par personne.** Pour empêcher qu'un même essai soit
> repris plusieurs fois (intérêt légitime), nous gardons, **sous forme
> d'empreintes irréversibles** (HMAC-SHA256) et jamais en clair : un identifiant
> de l'appareil depuis lequel l'essai est demandé, l'empreinte technique de la
> carte enregistrée pour l'essai (fournie par Stripe, jamais le numéro), et
> l'identifiant des comptes de plateforme connectés pendant l'essai. Ces
> empreintes sont gardées **12 mois après la fin de l'essai**, puis effacées.
>
> **Sous-traitants ajoutés** (article 4.7) : Hetzner Online GmbH (hébergement des
> navigateurs, Allemagne), IPRoyal (adresses IP, Lituanie).

**English** (same article, « 4.8 The No computer add-on ») — à traduire mot pour
mot une fois le français validé.

## 2. CGV — l'option Sans ordinateur (nouvel article)

> **Prix.** 20 € TTC par mois, sur le web (Stripe) comme dans l'App Store et
> Google Play. L'option est indépendante de ta formule : elle se prend seule
> (plan Free compris, avec ses quotas) ou en plus de Premium, Pro ou Business.
> Arrêter ta formule n'arrête pas l'option.
>
> **Essai gratuit de 7 jours, carte demandée.** La date et l'heure de la fin de
> l'essai, et le montant prélevé ensuite (20 € par mois), te sont indiqués avant
> que tu n'enregistres ta carte. Rien n'est prélevé pendant l'essai. Un seul
> essai par personne (même compte, appareil, carte ou compte de plateforme).
> La veille de la fin de l'essai, tu reçois un rappel.
>
> **Arrêt.** Pendant l'essai : en un geste (Réglages › Abonnement), l'arrêt est
> immédiat et rien n'est facturé. Une fois payée : l'option tourne jusqu'à la fin
> de la période payée, puis s'arrête ; rien n'est prélevé ensuite. Une option
> prise dans l'App Store ou Google Play s'arrête dans les réglages d'abonnements
> de la boutique.
>
> **Ce que fait l'option.** FillSell publie, republie, retire tes annonces Vinted
> et Leboncoin et surveille leurs ventes depuis ses serveurs, même quand ton
> ordinateur est éteint. Tu restes responsable de tes annonces et du respect des
> conditions de chaque plateforme. Une plateforme peut limiter ou refuser l'accès
> depuis nos serveurs ; dans ce cas nous te le disons et l'extension sur ton
> ordinateur reste disponible gratuitement.

## 3. Ce qui reste à décider (Nico)

1. Validation des deux textes ci-dessus (ou corrections).
2. La raison sociale exacte d'IPRoyal à écrire (« IPRoyal » suffit-il ?).
3. Faut-il un consentement explicite (case à cocher) au stockage des connexions,
   en plus de l'information ? Proposition : non (l'option ne peut pas fonctionner
   sans ; base légale = exécution du contrat), mais une phrase sur l'écran
   « Me connecter » (« Tes connexions sont gardées chiffrées, effacées à l'arrêt
   de l'option ») — déjà dans l'introduction de l'écran, à compléter si tu valides.
