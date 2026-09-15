// ═══════════════════════════════════════════════════════════════════════════
// LA FICHE SURVIT À LA GÉNÉRATION — MODULE PARTAGÉ (2026-09-15)
//
// Décision Nico : à partir du moment où le quota est débité — c'est-à-dire À LA
// GÉNÉRATION — l'article EXISTE dans le stock et sa fiche est sauvegardée EN
// ENTIER. Il ferme l'app, il revient trois jours plus tard : tout est là, et
// publier ne refait ni scan ni génération.
//
// AVANT CE MODULE : la ligne inventaire naissait au clic Publier (ou par le
// bouton manuel « Modifier & ajouter au stock »), et le texte généré ne vivait
// que dans sessionStorage. Mesuré le 15/09 : 654 générations facturées sur
// 1 697 (38,5 %), 405 comptes, sans le moindre job derrière.
//
// LES DEUX PORTES l'appellent, et elles seules :
//   PORTE A — lens-analysis mode "annonce" (scan unifié) ;
//   PORTE B — generate-listing (stepper, corps item_data sans ligne encore).
// Un troisième chemin recopié divergerait au premier correctif : il n'y en a
// pas.
//
// ⛔ CE MODULE NE TOUCHE JAMAIS À LA FACTURATION. Il n'écrit aucune ligne
// usage_logs, ne lit aucun quota, ne rembourse rien. Le décompte
// (quota_annonces_consommees et sa dédup 24 h par inventaire_id) reste
// EXACTEMENT ce qu'il était : les appelants continuent de journaliser leur
// geste comme avant, sans y ajouter l'identifiant créé ici. Le faire
// activerait la dédup là où elle ne s'appliquait pas — donc modifierait le
// décompte, ce qui est interdit sans arbitrage explicite de Nico.
//
// ⛔ TOUT EST BEST-EFFORT. Une création d'article ou une écriture de fiche qui
// échoue ne fait JAMAIS tomber une génération déjà payée : on journalise et on
// sert quand même le résultat. Le pire cas est le comportement d'avant ce lot.
//
// ⛔ INERTE TANT QUE LE CLIENT NE LE DEMANDE PAS (ficheDemandee ci-dessous).
// Le web est déployé au push ; l'app NATIVE tourne sur le canal Capgo et ne
// recevra ce client qu'à la prochaine OTA. Un vieux client ne sait pas qu'une
// ligne existe déjà : il en recréerait une SECONDE au clic Publier
// (saveLensItemForListing) — le doublon pauvre que ce lot supprime, réintroduit
// pour les natifs. Le serveur ne crée donc RIEN tant que le client n'a pas
// annoncé qu'il sait vivre avec : `fiche_serveur: true` dans le corps.
// Sans le drapeau, comportement d'avant ce lot, à l'octet près.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Le client sait-il lire la fiche que le serveur s'apprête à écrire ?
 * Un `true` explicite et rien d'autre : un corps qui ne porte pas la clé vient
 * d'un client antérieur au 2026-09-15.
 */
export function ficheDemandee(body: unknown): boolean {
  return (body as { fiche_serveur?: unknown })?.fiche_serveur === true;
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Valeur texte exploitable, ou null. Même filtrage que generate-listing. */
function texte(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.toLowerCase() === "null") return null;
  return s;
}

/**
 * La marque ne se répète pas dans le titre — MÊME règle que l'app
 * (src/App.jsx stripMarque), pour que le Stock affiche « Nike · Maillot PSG »
 * et pas « Nike · Maillot PSG Nike ». Portée ici parce que la ligne est
 * désormais créée côté serveur ; si le retrait vide le titre, on garde
 * l'original (un titre vide serait pire qu'une répétition).
 */
export function stripMarque(nom: string, marque: string | null): string {
  if (!marque) return nom;
  const escaped = marque.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cleaned = nom.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "").replace(/\s+/g, " ").trim();
  return cleaned || nom;
}

/**
 * Le sac `inventaire.attributs` à partir de ce que le Lens (ou l'analyse
 * photo) a LU. Source 'lens' — la plus faible de l'échelle : la base ne laisse
 * jamais une lecture IA écraser une valeur Vinted ou une saisie (trigger de
 * fusion). Même forme que ce que le stepper écrivait déjà
 * (ListingPreviewScreen, « un article créé par Lens doit garder taille,
 * couleur, matière, état et attributs_visibles en base », arbitrage 06/09) —
 * sauf que là-bas c'était derrière `if (invId)`, donc jamais vrai pour un
 * article né du Lens.
 */
export function attributsLus(lu: Record<string, unknown>, at = new Date().toISOString()) {
  const attributs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(lu ?? {})) {
    const vide = v == null
      || (typeof v === "string" && !v.trim())
      || (typeof v === "object" && !Object.keys(v as Record<string, unknown>).length);
    if (!vide) attributs[k] = { v, source: "lens", at };
  }
  return attributs;
}

export type ArticleACreer = {
  userId: string;
  titre: string;
  marque?: string | null;
  categorie?: string | null;
  description?: string | null;
  prixVente?: number | null;
  /** URLs des photos connues à cet instant. Rattachées telles quelles. */
  photos?: string[] | null;
  /** Sac d'attributs déjà construit par attributsLus(). */
  attributs?: Record<string, unknown> | null;
};

/**
 * Crée la ligne inventaire du geste qu'on vient de facturer.
 *
 * · statut 'stock' — l'article est dans son stock, point.
 * · prix_achat NULL — VIDE ≠ ZÉRO (règle du 03/08) : on ne SAIT pas ce qu'il a
 *   payé, et écrire 0 produirait une marge de 100 % sur du vent. Le stepper le
 *   demande et le pose ensuite.
 * · origine NULL — surtout pas 'vinted_sync' : ces lignes-là sont le dressing
 *   importé, elles ont légitimement leurs photos et ne doivent jamais être
 *   confondues avec celles-ci.
 * · id — même convention que l'app (epoch ms + aléa) : la colonne est un
 *   bigint sans défaut, c'est l'appelant qui pose la valeur.
 *
 * Retourne l'id créé, ou null si l'insert a échoué (jamais d'exception : une
 * génération payée se sert même quand le stock refuse la ligne).
 */
export async function creerArticlePourFiche(admin: Admin, a: ArticleACreer): Promise<number | null> {
  const titreBrut = texte(a.titre) ?? "Article";
  const marque = texte(a.marque ?? null);
  const row: Record<string, unknown> = {
    id: Date.now() + Math.floor(Math.random() * 10000),
    user_id: a.userId,
    titre: stripMarque(titreBrut, marque),
    marque,
    type: texte(a.categorie ?? null),
    description: texte(a.description ?? null),
    prix_achat: null,
    prix_vente: Number.isFinite(Number(a.prixVente)) && Number(a.prixVente) > 0 ? Number(a.prixVente) : null,
    margin: null,
    margin_pct: null,
    statut: "stock",
    date: new Date().toISOString(),
    purchase_costs: 0,
    selling_fees: 0,
    quantite: 1,
    ...(Array.isArray(a.photos) && a.photos.length ? { photos: a.photos } : {}),
    ...(a.attributs && Object.keys(a.attributs).length ? { attributs: a.attributs } : {}),
  };
  try {
    const { data, error } = await admin.from("inventaire").insert([row]).select("id").single();
    if (error) {
      console.error("[fiche-article] ligne inventaire NON créée —", error.message);
      return null;
    }
    return (data?.id as number) ?? null;
  } catch (e) {
    console.error("[fiche-article] ligne inventaire NON créée —", (e as Error)?.message);
    return null;
  }
}

/**
 * Écrit (ou remplace) la fiche de publication d'un article.
 *
 * Une seule ligne par article : upsert sur la clé primaire inventaire_id. La
 * fiche a la MÊME forme que le brouillon sessionStorage du stepper — c'est le
 * client qui la relit et la réapplique, il n'y a donc qu'un seul contrat.
 */
export async function enregistrerFiche(
  admin: Admin,
  p: {
    userId: string; inventaireId: number; fiche: Record<string, unknown>;
    source: string; scanId?: string | null;
    /**
     * ⚠️ À NE PASSER QUE QUAND CE GESTE VIENT DE CRÉER L'ARTICLE. Un article
     * né d'une génération est un BROUILLON : il existe, mais l'utilisateur n'a
     * encore rien fait dessus. Toute autre écriture de fiche — sauvegarde du
     * stepper, régénération d'un article déjà au stock — OMET la clé : sur
     * conflit, PostgREST ne met à jour que les colonnes présentes, donc l'état
     * survit intact et un article déjà rangé ne peut pas y retomber.
     */
    brouillon?: boolean;
  },
): Promise<boolean> {
  try {
    const { error } = await admin.from("fiches_annonce").upsert({
      inventaire_id: p.inventaireId,
      user_id: p.userId,
      fiche: p.fiche ?? {},
      source: p.source,
      ...(p.scanId ? { scan_id: p.scanId } : {}),
      ...(p.brouillon === undefined ? {} : { brouillon: p.brouillon }),
      updated_at: new Date().toISOString(),
    }, { onConflict: "inventaire_id" });
    if (error) {
      console.error(`[fiche-article] fiche NON enregistrée (article ${p.inventaireId}) —`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[fiche-article] fiche NON enregistrée (article ${p.inventaireId}) —`, (e as Error)?.message);
    return false;
  }
}

/**
 * Le rattachement des photos DURABLES, quand elles arrivent après la création.
 *
 * Cas réel : le scan unifié crée l'article au débit avec les URLs du bucket de
 * scan (lens-temp, pleine définition — les seules qui existent à cet instant) ;
 * l'ouverture du stepper monte ensuite les copies compressées définitives dans
 * listing-photos. On remplace, on ne duplique pas, et on ne supprime rien.
 */
export async function rattacherPhotos(
  admin: Admin,
  p: { userId: string; inventaireId: number; photos: string[] },
): Promise<boolean> {
  if (!Array.isArray(p.photos) || !p.photos.length) return false;
  try {
    const { error } = await admin.from("inventaire")
      .update({ photos: p.photos })
      .eq("id", p.inventaireId)
      .eq("user_id", p.userId);
    if (error) {
      console.error(`[fiche-article] photos NON rattachées (article ${p.inventaireId}) —`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[fiche-article] photos NON rattachées (article ${p.inventaireId}) —`, (e as Error)?.message);
    return false;
  }
}
