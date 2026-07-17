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

### Axe 2 — Cohérence 2 copies detectType : ✅ identiques (30/30 + batteries)
Après tous les fixes, shared.js et la copie locale d'App.jsx restent strictement
identiques. OBJECT_ICON_RULES/detectObjectIcon n'existent QUE dans shared.js
(pas de copie App.jsx) → pas de dérive possible.

### Axe 3 — Crashs React : ✅ rien de nouveau
- eslint react-hooks/rules-of-hooks : PROPRE sur tout src/ (SwipeRow était le
  seul, corrigé au round précédent).
- Effets fetch/résolution du stepper (genericAspectsCatalog, resolve_aspects) :
  gardés par `genericResolvedFor` (useRef, 1 tentative par plateforme×catégorie)
  + deps par signature JSON → pas de boucle. Vérifié.
- Note mineure : StatsTab a un effet cache IA avec deps manquantes (exhaustive-deps)
  → risque de cache périmé (PAS un crash ni une boucle). Non bloquant.

### Axe 4 — Imports relatifs edge périmés : 1 seul cas (déjà connu)
- **check-listing-status v11** bundle `_shared/sale-orchestration.ts` → vérifié
  À JOUR (déployé 07-13 > dernier commit orchestration 07-12 ; priceOverride/
  pending_removal/matching par inventaire_id présents au déployé). Sale flow OK.
- update-job-status n'importe PAS l'orchestration. lens/deal/voice-intent/
  tiktok/voice-parse/lot-distribute : self-contained (aucun import relatif).
- generate-listing bundle un shared.js PÉRIMÉ (déjà documenté, impact = famille
  de retouche photo uniquement).

### Axe 5 — Paiement / Pépites : ✅ BILAN CLEAN (aucun bug financier)
Vérifié en base (pg_get_functiondef) :
- `spend_coins_and_publish` / `spend_coins_for_lens` : `SELECT … FOR UPDATE`
  (verrou de ligne) → sérialise, pas de race/double-débit concurrent ; check
  « insuffisant » avant décrément ; débit + jobs/ledger/usage_log dans UNE
  transaction (tout-ou-rien).
- `refund_coins` : gardé par `paidWithCoins > 0` dans lens-analysis (positif
  seulement après spend réussi, dans le catch) → pas d'exploit pépites gratuites,
  pas de perte, pas de double-refund.
- `credit_purchased_coins` : idempotent — insert ledger avec `ref` UNIQUE
  (index `coin_ledger_ref_unique`) dans `EXCEPTION WHEN unique_violation THEN
  RETURN already_credited` AVANT l'update wallet → un webhook Stripe rejoué ne
  crédite JAMAIS deux fois.
- Grille confirmée : publish **3 / 12 / 35** (original/ia_light/ia_advanced),
  Lens **6** (price_lens_overflow). ⚠️ Nico parlait de « 9 Lens » → c'est **6**
  en réalité (config + code). À confirmer si un changement était voulu.
- Résidu mineur : double-clic SÉQUENTIEL sur Publier pourrait créer 2 lots
  (2 transactions valides distinctes) — gardé côté client par l'état `publishing`
  (CTA désactivé). Pas de faille système.

### Axe 6 — Onboarding / Auth : ✅ SOLIDE
- `handle_new_user` : insert profil `ON CONFLICT (id) DO NOTHING` (idempotent) +
  welcome email via email-tunnel (x-cron-secret correct).
- Fermeture app pendant OAuth : le profil est créé côté SERVEUR par le trigger
  (sur insert auth.users) indépendamment de l'app → pas d'état cassé, la prochaine
  connexion le lit.
- Double inscription même email : bloquée par l'unicité auth Supabase + trigger
  idempotent par id.
- Défauts profiles corrects : is_premium/is_pro/is_founder = **false**, currency
  = **'EUR'**, tokens IAP = null → nouvel utilisateur bien « gratuit, EUR ».
