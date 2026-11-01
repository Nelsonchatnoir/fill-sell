# Photos Vinted au-delà de 20, et exception « machine virtuelle » de Louis (01/11)

## 1. Vinted : plus de 20 photos (Jocabroc)
- **Le cas.** La fiche 1793426438309 (« Lot 16 vêtements femme DESIGUAL », quantité 1) a 24 photos. Ses deux
  publications Vinted ont échoué : ffd0c9d4 à 07:56 et df47c657 à 08:08. Message : « 20/24 confirmée(s) après 96/97 s.
  Publication interrompue AVANT le dépôt ». Jocabroc les a ensuite arrêtées dans sa file (08:05 et 08:14).
- **Ce qui se passait.** Sans choix de photos, le job porte toutes les photos de la fiche (`photosDuJob`, côté app).
  L'extension les envoyait toutes, mais Vinted n'en garde que 20. La garde `ensurePhotosLanded` attendait 24 et
  annulait la publication.
- **Limite vérifiée : 20.** Preuves :
  - la grille et l'API de Vinted se sont arrêtées à 20 sur 24, lors des deux essais ;
  - l'app affiche « Vinted : 20 photos au plus » ;
  - `republish-capture-photos` a `MAX_PHOTOS = 20`.
- **Les autres plateformes gardent toutes leurs photos.** Aucune n'annule pour trop de photos :
  - Depop : l'extension coupe déjà à 8 ;
  - Leboncoin : l'extension suit le quota gratuit lu sur la page ;
  - Beebs : note seulement (des annonces Beebs à 20 photos existent ; l'app affiche 10, non touché) ;
  - eBay : mode « observer », note seulement. La même fiche est partie sur eBay et Leboncoin avec ses 24 photos.
- **Correctif côté serveur** : get-pending-jobs v316, avec `_shared/photos-limite-plateforme.js`.
  - Chaque job Vinted servi part avec ses 20 premières photos, dans l'ordre du job (celui choisi pour Vinted).
  - Même chose pour la capture d'une recréation.
  - Le job en base garde ses 24 photos.
  - Ça marche avec l'extension 0.6.163 : aucune extension à livrer.
  - Selftest `photos-limite-vinted` : 14/14.
- **Relance** : script `scripts/reparations/20261101_jocabroc_relance_vinted_24_photos.sql`, passé à 11:16, avec
  sauvegarde et inverse.
  - UNE seule tâche relancée, df47c657, la plus récente. Les deux publiaient le même article (quantité 1), donc les
    relancer toutes les deux aurait créé deux annonces Vinted pour un seul exemplaire.
  - ffd0c9d4 reste arrêtée.

## 2. Exception « Leboncoin autorisé sur machine virtuelle » (louis-seller)
- **Où vit l'exception** : `profiles.beta_flags.lbc_machine_virtuelle_autorisee = true`.
  - C'est un booléen strict. L'app ne peut pas écrire cette colonne.
  - Elle est posée sur louis-seller@ttfamily.fr SEUL, à 11:15 :
    `scripts/reparations/20261101_louis_seller_lbc_machine_virtuelle.sql` (sauvegarde et inverse).
- **Où elle s'applique.** La garde machine virtuelle n'est appliquée qu'à un seul endroit : get-pending-jobs.
  - Aucune fonction SQL, ni update-job-status, ni handler-watch, ni l'extension ne l'évalue.
  - L'extension se contente d'obéir à `blocages.leboncoin` dans la réponse.
- **Ce que change v316** : `gardeVirtuelleLbc(rendu, beta_flags)` aux deux points de la garde.
  - Premier point : tâches, retraits, relevés, et la réponse `blocages` qui coupe la veille des ventes de l'extension.
  - Second point : l'essai de levée de pause.
  - L'exception est lue avec `platform_settings`. Si la lecture échoue, elle est absente et la garde s'applique.
  - Avec l'exception, le message « machine virtuelle » s'efface des tâches Leboncoin en attente du compte (archivé).
- **Rien d'autre ne change :**
  - Tous les autres comptes : garde identique. Selftest : compte sans exception + poste virtuel → bloqué.
  - La pause sur refus Leboncoin (`blocage_acces`) n'est pas touchée.
  - Aucune autre tâche n'a été modifiée.
- **Contrôles** :
  - selftest `lbc-machine-virtuelle-exception` : 14/14, et 15/15 avec `--prod` (exception sur louis-seller seul) ;
  - `urgence-louis-3010`, `lot-j-3110` et `postes-boutiques` restent verts.
- **Essai réel** : retrait 9aa5edb9 (« Maison Gabby », Leboncoin 3291865529).
  - Il était pending avec le message « machine virtuelle ».
  - Il est passé en processing à 11:16:48, servi par la machine virtuelle, sans relance à la main.
  - Résultat : le retrait n'a pas abouti. Deux essais automatiques, à 11:16:48 et 11:20:48, ont donné la même chose :
    Leboncoin montre l'annonce à la machine virtuelle comme à un ACHETEUR. On y voit « Acheter / Faire une offre /
    Contacter » et le vendeur affiché « Clayton, 412 annonces ».
  - Cause exacte : le navigateur de la machine virtuelle n'est pas connecté, sur cette page, au compte Leboncoin qui a
    publié l'annonce. Aucun clic n'a été fait et l'annonce est intacte.
  - L'exception n'y est pour rien. Elle a joué : tâche servie, message effacé, journaux de get-pending-jobs à 11:16:27.
  - La file a fait d'elle-même un 3e essai à 11:28:47, avec le même résultat. Elle continue seule (prochain à 11:38:47).
    Rien n'a été relancé à la main.
  - Le texte montré à Louis dit « ta connexion Leboncoin est bonne : rien à faire de ton côté ». Il vient de la règle des
    refus passagers et n'est pas juste ici. Il n'a pas été touché.
  - Pour que le retrait passe, Louis doit se connecter à Leboncoin, sur le compte de l'annonce, dans le navigateur de
    la machine virtuelle.
  - Jocabroc : df47c657 publiée sur Vinted à 11:18:48 (annonce 10616912084). Le diagnostic « 24 injectées » encore lu
    sur la tâche est celui de l'échec de 08:12 : il n'est pas réécrit quand la publication réussit.
