# Lot « check du 02/11 » — quatre comptes, quatre causes

Ordre de Nico, 02/11 matin. Pour chaque point, la cause est d'abord établie dans les données et le code. Ensuite, la
RÈGLE est corrigée. Rien n'est réparé à la main en base. Heures de Paris.

## 1. XEWER (xxewwer@gmail.com) : 7 lots de livres Barbie retirés de Vinted le 01/11, jamais recréés

Nico en comptait 6 ; il y en a 7 : ed4ece26, c61cd88f, 29b19c93, 6718095c, 80b88be1, a6cde870 et ddb5a34d.

**Cause.**
- Les 7 refus disent la même chose : 400 `language_book`, « Sélectionne une langue pour continuer ».
  - ed4ece26 réclamait aussi des photos, sur un essai.
  - Leur `server_required_fields` ne porte que ce champ.
- « Français » était bien dans `vintedAspects.language_book`, venu de la réponse rangée.
- Mais l'extension (vinted.js) n'armait AUCUNE pose au POST pour une langue fournie : elle comptait sur le formulaire.
- Or l'ISBN d'origine, `0000000000000`, est remis tel quel. Le lookup livre de Vinted ne retombe jamais sur cette
  valeur, et le champ « Langue » n'apparaît donc pas. L'étape « Attributs » a cherché ce champ 24 s pour rien.
- La porte de la langue relisait `#isbn` après l'étape ISBN. Aucun des onze diagnostics ne porte de note de langue :
  la porte ne s'ouvrait pas non plus.
- En base sur 60 jours : la pose de la langue au POST marche (6 relevés « language_book POSÉ dans le corps par la
  sonde »). La note « langue … fournie » n'apparaît jamais.

**Correctif : la règle de Nico, « un attribut exigé et connu part dans l'envoi ».**
- Extension 0.6.166 (d2ed09b) :
  - le libellé de la langue devient son identifiant, relevé en base sur les captures réelles : « Français » 6436
    (1 151 annonces), « Anglais » 6435 (36). Aucun autre identifiant n'est sûr, aucun n'est deviné ;
  - la porte de la langue s'ouvre aussi sur l'étape ISBN qui a trouvé le champ, ou sur une langue fournie ;
  - toute valeur connue que le formulaire n'a pas posée part par son identifiant, résolu sur la config de la catégorie
    (une seule option de ce libellé, sinon rien) ;
  - la sonde ne remplit qu'un code laissé vide par la page.
- Garde-fous respectés : la pose de l'ISBN n'a pas changé (valeur d'origine remise telle quelle) ; `republish_step` et
  `erreurs_archivees` sont conservés.
- Serveur, dans `_shared/recreation-bloquee.js` et handler-watch :
  - le message nomme le champ exigé au refus ;
  - une valeur connue est présentée comme un défaut de notre envoi ;
  - plus jamais « vérifie ton compte ».
- Cause `vinted_attribut_connu_non_pose` : la tâche est relancée UNE fois dès que le poste a le build 0.6.166
  (2026-11-02T08:48:22Z). D'ici là, le message dit qu'elle repartira seule.

**Preuve.**
- Selftest `vinted-attributs-connus` (40/40).
- La suite complète, 519 selftests, est verte.

**Ce qui reste.**
- L'essai réel, c'est-à-dire la relance des 7 tâches. Elle part seule dès que le poste de XEWER a la 0.6.166, ce qui
  suppose le passage au Chrome Web Store.
- La relancer à la main en 0.6.165 retomberait sur le même mur, donc ce n'est pas fait.

## 2. Dayane (recrutementgroupezk704) : son Leboncoin pris pour une machine virtuelle depuis 08:00

**Cause.**
- `VM_RE` comptait « Microsoft Basic Render Driver » parmi les pilotes de machine virtuelle.
- C'est le pilote d'affichage de secours de Windows. On le trouve sur un vrai PC sans pilote graphique, en bureau à
  distance, ou dans une machine virtuelle sans carte graphique. Il ne suffit donc pas à conclure.
- Dayane avait publié sur Leboncoin le 30/10 depuis ce même poste.

**Postes classés « virtuels » par ce seul pilote le 02/11 :**

| Compte | Ce que la garde a fait |
|---|---|
| recrutementgroupezk704 (Dayane) | Sa tâche en attente a été retenue. Journal : 33 passages retenus entre 08:01 et 09:05. |
| louis-seller | Tâche retenue le 01/11 entre 10:52 et 11:14, avant l'exception, puis la délégation. |
| vicsicot | Relevés Leboncoin coupés, aucune tâche retenue. |
| alexisrenaudin1 | Relevés Leboncoin coupés, aucune tâche retenue. |
| louisonthom | Relevés Leboncoin coupés, aucune tâche retenue. |
| ritthik2003 | Relevés Leboncoin coupés, aucune tâche retenue. |

**Correctif.**
- Ce pilote seul est noté (`pilote_de_base`) et ne bloque jamais.
- La garde reste entière pour un pilote qui NOMME la machine virtuelle : VMware, VirtualBox, Parallels, QXL, virgl,
  Virtio, Hyper-V, Red Hat, Bochs.
- Le poste Cloud garde ses propres règles.
- La machine virtuelle de louis-seller ne fait toujours pas Leboncoin : la délégation l'en exclut, sans passer par ce
  signal.
- Le message « machine virtuelle » s'efface, avec archivage, des tâches servies à un poste réel.

**Preuve.**
- Selftests `lbc-machine-virtuelle-exception` (16/16) et `urgence-louis-3010` (82/82).
- La tâche de Dayane repart seule à son prochain passage. Le constat est dans l'état de prod.

## 3. tiblancdeshaut : 73 republications « passera à son tour » depuis le 26/10

**Cause.**
- La file est EN PAUSE à la demande de la personne : `platform_settings.file_pause`, `par: app`, active depuis le
  30/10 à 14:59:02, soit 7 s après une reprise.
- La RPC prend la valeur explicite `p_pause` : ce n'est pas une bascule automatique.
- get-pending-jobs le dit à chaque passage : « file EN PAUSE (geste de la personne) → 73 … gardée(s) ».
- La file tournait jusqu'au 30/10 : ce jour-là, 96 publications Leboncoin et 87 retraits Vinted.
- Rien d'autre ne la retient. Le retrait Vinted en `boutique_etrangere` (needs_user) ne bloque rien.
- Le seul défaut : les lignes disaient « En file : passera à son tour » au lieu de « En pause à ta demande ».

**Correctif.** Pendant la pause, get-pending-jobs réécrit en « En pause à ta demande » une republication retenue qui
porte encore ce texte. Seules ces lignes sont touchées ; la reprise les remet « En file ». La pause n'est pas touchée.

**Preuve.** Le selftest `lot-f-3110` (77/77) est vert.

**Ce qui reste.** La file repart quand la personne la reprend.

## 4. gjehly : 2 publications entre 05:22 et 08:18, 79 en file

**Rythme voulu, aucun frein.**
- La publication programmée tourne avec le créneau du soir, 8 places par jour, tous les jours.
- Hors créneau, aucune nouvelle place. Le journal le dit : « 91 retenue(s) (creneau) ».
- Les 2 publications du matin étaient déjà servies la veille dans le créneau :
  - eed435a3, servie à 21:10, publiée à 05:22 ;
  - 64d51931, servie à 21:34, publiée à 08:18.
  Elles ont été rejouées après le mur de la page muette (reprises techniques espacées).
- À 8 par jour, la file (79 Vinted, 12 Leboncoin, 6 eBay) se vide en environ 12 jours.
- Ce soir à 19:00, le tour strict (get-pending-jobs v321, ebay-api-worker v105) servira Vinted, Leboncoin, eBay,
  Vinted, Leboncoin, eBay, Vinted, Leboncoin.

**Rappel, hors de ce lot.** Le 01/11 entre 21:14 et 22:59, 88 publications eBay programmées sont parties sans plafond.
C'était avant ebay-api-worker v104 (23:00), qui applique désormais le même créneau et le même plafond.
