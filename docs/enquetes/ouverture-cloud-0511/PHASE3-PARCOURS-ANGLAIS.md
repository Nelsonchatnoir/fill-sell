# Phase 3, point 1 — la preuve : le parcours entier en anglais (à faire par Nico, sur un téléphone)

Ordre de Nico : « parcours entier sur un téléphone réglé en anglais, de l'inscription jusqu'au paiement, sans un seul
mot de français ». Claude ne crée pas de compte et ne saisit aucun mot de passe : le parcours connecté est le geste de
Nico. Tout ce qui se voit sans compte peut être relu par Claude (navigateur isolé, réglé en anglais).

## Avant
- Le web porte la traduction dès chaque push (fillsell.app) ; l'app, avec le binaire 2.9 (ou l'OTA du jour d'ouverture).
- Un téléphone en anglais SANS réglage FillSell : la langue vient du téléphone (navigator.language = en-…). Sur un
  téléphone déjà utilisé en français : Réglages › Langue › English (fs_lang). Depuis le 05/11 soir, ce choix part aussi
  dans le profil : les mails et les notifications de vente suivent.

## Le parcours (une capture par écran, à envoyer à Claude : il relit chaque mot)
1. Page d'accueil, puis « Sign up » : formulaire, code reçu par mail (le mail aussi : objet et corps).
2. Premier lancement : le parcours d'entrée (voie extension / voie Cloud selon le pays : hors de France, pas de Cloud).
3. Le Stock vide, puis « + » : Lens (photo), le résultat, la fiche, l'écran « Où publier ? ».
4. Hors de France (téléphone réglé sur les États-Unis ou le Royaume-Uni) : AUCUNE plateforme proposée tant qu'aucune
   n'est prouvée — c'est attendu (garde-fou de Nico) ; en France : les cinq plateformes.
5. La feuille des formules : prix, mentions d'abonnement, liens (Terms of Use, Terms and Conditions, Privacy Policy).
6. Le paiement (bac à sable Apple / licence de test Google / carte de test Stripe), la page de retour (« Welcome to … »).
7. Réglages : abonnement, langue, compte (suppression), aide.
8. Un mail reçu (bienvenue, « how it works ») et une notification de vente (si une vente de test arrive).

## Ce qui reste en français, VOLONTAIREMENT (relu par Claude)
- Les valeurs envoyées aux plateformes françaises ou comparées à leurs pages (catégories Leboncoin, états Vinted
  français, « Sans marque »…) : elles parlent la langue du SITE de la plateforme.
- Les consignes envoyées à l'IA (Lens) : rédigées en français, la réponse suit la langue de la plateforme.
- La télémétrie, les journaux, les colonnes de la base.
- Les conditions du Cloud : la version anglaise est une traduction POUR INFORMATION, le français fait foi.
