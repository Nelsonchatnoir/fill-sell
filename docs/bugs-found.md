# Bugs trouvés — chasse en autonomie

Journal des bugs trouvés hors incident direct, avec statut. DRY RUN (aucune
publication réelle). Commit séparé par bug. Voir aussi
`docs/required-fields-coverage.md` (registre requis) et les mémoires.

## Round 2 — 17/07 (autonomie)

### Axe 1 — Mapping mots-clés ambigus (nouvelles familles)
Testé jouets, livres/médias, instruments, jardin, puériculture, périph high-tech
(node : detectObjectIcon + detectType + chemins plateforme). Corrigés (2 copies
detectType + OBJECT_ICON_RULES) — chaque cas publiait dans une MAUVAISE catégorie
réelle (pas le filet), sauf mention :

1. **« Lit parapluie bébé » → ☂️ Parapluies** (lit de voyage classé parapluie !)
   → ajouté `lit.?parapluie` à la règle 🚼 (puériculture, avant ☂️). Mappe
   désormais Enfants > Chambre de bébé > Lits à barreaux.
2. **« Transat bébé » → ⛱️ Parasols** (transat bébé classé parasol de jardin)
   → exclu le contexte bébé de la règle ⛱️ (`transat(?!…bébé|enfant)`) → tombe
   au filet manuel plutôt qu'en Parasols. (Adulte « transat jardin » reste ⛱️.)
3. **« Clavier arrangeur » → ⌨️ Claviers ordinateur** (clavier musique classé
   périphérique PC) → ajouté `arrangeur` à la règle 🎹 + à Musique (avant
   High-Tech). Mappe Claviers et synthétiseurs.
4. **« Table de mixage » → 🏠 Maison** (`table.?mix` ne franchit pas « table DE
   mixage ») → `table.?(?:de.?)?(?:mix|mixage)` en Musique. Type → Musique
   (icône 🎵 → filet, catégorie correcte).
5. **« Table basse » → Musique** (PRÉEXISTANT, via `\bbasse\b` = grave/basse)
   → `basse` exige désormais un contexte guitare-basse
   (`guitare.?basse|basse.?(?:élec|acoustique|N cordes|fretless|active)`). Les
   titres « Basse Fender » restent captés par la marque. Faux-amis corrigés :
   table basse → Maison, basse-cour → Autre, marée basse → Maison.

Non-régression vérifiée (parapluie adulte, parasol, transat jardin, clavier
gaming, clavier MIDI, piano, batterie électronique, basses guitares…).
audit-coverage : 0 non-mappé / 0 invalide / 52-52. 2 copies detectType identiques.

Imprécisions mineures LAISSÉES (→ filet ou catégorie valide-proche, pas un
mis-publish grave) : salon de jardin → ⛱️ Parasols (même dépt jardin), circuit
voiture Carrera → 🚗 Auto→filet, tapis d'éveil → 🟫 Maison Tapis, chaise haute /
tour de lit → Maison→filet, webcam → 📱 (défaut High-Tech), câble (accent « â »
non capté par detectType « cable » → type Autre, mais icône 🔌 OK).
