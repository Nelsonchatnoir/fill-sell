// ═══════════════════════════════════════════════════════════════════════════
// UNE MACHINE VIRTUELLE NE FAIT JAMAIS LEBONCOIN (30/10, urgence Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Louis a deux comptes FillSell sur la même box : Brave sur son PC (Amiral) et un navigateur dans une machine virtuelle
// de son NAS (louis-seller, le Vinted de sa femme), connectés au MÊME compte Leboncoin. Le 30/10, Leboncoin restreint
// l'accès de toute la connexion (« un robot est sur le même réseau »). Le même jour, l'équipe Cloud a constaté que
// Leboncoin et Beebs bloquent un navigateur à rendu graphique virtuel (serveur sans puce graphique, SwiftShader).
// L'extension (0.6.161) envoie le moteur de rendu WebGL du poste au poll (rendu_graphique) ; le serveur le note sur
// le poste (extension_postes[poste].rendu) et :
//   · machine virtuelle NOMMÉE par son pilote graphique (VMware, VirtualBox, Parallels, QXL, virgl, Hyper-V, Red Hat,
//     Bochs) → aucune action ni lecture Leboncoin pour CE poste : les tâches Leboncoin du compte attendent un poste
//     réel du compte (un autre profil de navigateur sur l'ordinateur), l'extension coupe ses propres lectures
//     Leboncoin ;
//   · rendu LOGICIEL seul (SwiftShader, llvmpipe) : noté, jamais bloquant — un PC réel sans accélération matérielle
//     le montre aussi ; la décision attend la mesure sur le parc.
//   · (02/11, Dayane — recrutementgroupezk704) « Microsoft Basic Render Driver » SEUL n'est PAS une machine
//     virtuelle : c'est le pilote d'affichage de secours de Windows — celui d'un vrai PC sans pilote graphique
//     installé, d'une session en bureau à distance, comme d'une machine virtuelle sans carte graphique. Les six postes
//     du parc classés « virtuels » le 02/11 l'étaient tous par ce seul pilote ; Dayane avait publié sur Leboncoin le
//     30/10 depuis ce même poste. Règle : une plateforme ne se bloque que sur un signal SÛR de virtualisation (un
//     pilote qui NOMME la machine virtuelle), jamais sur ce pilote seul — il est noté (`pilote_de_base`), comme le
//     rendu logiciel, jamais bloquant.
// ⛔ Le poste Cloud a ses propres règles (hors de ce module).
// Pur (Deno + Node).

const VM_RE = /\b(VMware|VirtualBox|VBox|Parallels|QXL|virgl|Virtio|Hyper-V|Red Hat|Bochs)\b/i;
const LOGICIEL_RE = /\b(SwiftShader|llvmpipe|softpipe|Software Rasterizer)\b/i;
// (02/11) Le pilote d'affichage de secours de Windows : noté, jamais un signal de machine virtuelle à lui seul.
const PILOTE_DE_BASE_RE = /\bMicrosoft Basic Render Driver\b/i;

/** Le rendu graphique déclaré au poll, nettoyé, ou null. */
export function renduDuPoll(body) {
  const r = body?.rendu_graphique;
  if (!r || typeof r !== "object") return null;
  const renderer = String(r.renderer ?? "").replace(/[^\p{L}\p{N} ().,:/_+-]/gu, "").slice(0, 160);
  const vendor = String(r.vendor ?? "").replace(/[^\p{L}\p{N} ().,:/_+-]/gu, "").slice(0, 80);
  if (r.webgl === false) return { webgl: false, renderer: null, vendor: null, virtuel: false, logiciel: true };
  if (!renderer) return null;
  const texte = `${renderer} ${vendor}`;
  return {
    webgl: true, renderer, vendor: vendor || null, virtuel: VM_RE.test(texte), logiciel: LOGICIEL_RE.test(texte),
    ...(PILOTE_DE_BASE_RE.test(texte) ? { pilote_de_base: true } : {}),
  };
}

/** Le poste est-il une machine virtuelle nommée (jamais Leboncoin) ? */
export function posteVirtuel(rendu) {
  return Boolean(rendu && rendu.virtuel === true);
}

/** Le message des tâches Leboncoin retenues parce que le seul poste du compte est une machine virtuelle. */
export function messagePosteVirtuelLbc() {
  return "Leboncoin n'est jamais piloté depuis une machine virtuelle : il y restreint l'accès de toute ta connexion. " +
    "Cette tâche Leboncoin attend un navigateur de ton ordinateur où l'extension FillSell est ouverte sur CE compte " +
    "et connectée à Leboncoin. Rien n'a été touché.";
}

// ── (01/11, décision de Nico — Louis) EXCEPTION PAR COMPTE : « Leboncoin autorisé sur machine virtuelle » ─────────
// louis-seller@ttfamily.fr pilote Leboncoin depuis une machine virtuelle de son NAS et en assume le risque. La clé vit
// côté serveur dans profiles.beta_flags (jamais écrite par l'app : la colonne n'est pas ouverte en écriture au client) :
//   beta_flags.lbc_machine_virtuelle_autorisee = true   (booléen strict ; toute autre valeur = pas d'exception)
// Avec elle, CE compte passe la garde machine virtuelle partout où elle s'applique (get-pending-jobs : tâches, retraits,
// relevés, essai de levée de pause, réponse « blocages » qui coupe la veille de l'extension). Sans elle — tous les autres
// comptes —, la garde reste la règle, à l'identique. La pause sur refus de Leboncoin (blocage_acces) n'est pas touchée.
export const CLE_LBC_VIRTUEL_AUTORISE = "lbc_machine_virtuelle_autorisee";

/** Le compte a-t-il l'exception « Leboncoin autorisé sur machine virtuelle » ? (beta_flags du profil) */
export function lbcVirtuelAutorise(betaFlags) {
  return Boolean(betaFlags && typeof betaFlags === "object" && betaFlags[CLE_LBC_VIRTUEL_AUTORISE] === true);
}

/** La garde s'applique-t-elle ? Poste en machine virtuelle ET compte sans l'exception. */
export function gardeVirtuelleLbc(rendu, betaFlags) {
  return posteVirtuel(rendu) && !lbcVirtuelAutorise(betaFlags);
}
