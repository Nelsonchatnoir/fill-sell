// ═══════════════════════════════════════════════════════════════════════════
// UNE MACHINE VIRTUELLE NE FAIT JAMAIS LEBONCOIN (30/10, urgence Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Louis a deux comptes FillSell sur la même box : Brave sur son PC (Amiral) et un navigateur dans une machine virtuelle
// de son NAS (louis-seller, le Vinted de sa femme), connectés au MÊME compte Leboncoin. Le 30/10, Leboncoin restreint
// l'accès de toute la connexion (« un robot est sur le même réseau »). Le même jour, l'équipe Cloud a constaté que
// Leboncoin et Beebs bloquent un navigateur à rendu graphique virtuel (serveur sans puce graphique, SwiftShader).
// L'extension (0.6.161) envoie le moteur de rendu WebGL du poste au poll (rendu_graphique) ; le serveur le note sur
// le poste (extension_postes[poste].rendu) et :
//   · machine virtuelle NOMMÉE par son pilote graphique (VMware, VirtualBox, Parallels, QXL, virgl, Hyper-V,
//     « Microsoft Basic Render Driver ») → aucune action ni lecture Leboncoin pour CE poste : les tâches Leboncoin du
//     compte attendent un poste réel du compte (un autre profil de navigateur sur l'ordinateur), l'extension coupe ses
//     propres lectures Leboncoin ;
//   · rendu LOGICIEL seul (SwiftShader, llvmpipe) : noté, jamais bloquant — un PC réel sans accélération matérielle
//     le montre aussi ; la décision attend la mesure sur le parc.
// ⛔ Le poste Cloud a ses propres règles (hors de ce module).
// Pur (Deno + Node).

const VM_RE = /\b(VMware|VirtualBox|VBox|Parallels|QXL|virgl|Virtio|Hyper-V|Microsoft Basic Render Driver|Red Hat|Bochs)\b/i;
const LOGICIEL_RE = /\b(SwiftShader|llvmpipe|softpipe|Software Rasterizer)\b/i;

/** Le rendu graphique déclaré au poll, nettoyé, ou null. */
export function renduDuPoll(body) {
  const r = body?.rendu_graphique;
  if (!r || typeof r !== "object") return null;
  const renderer = String(r.renderer ?? "").replace(/[^\p{L}\p{N} ().,:/_+-]/gu, "").slice(0, 160);
  const vendor = String(r.vendor ?? "").replace(/[^\p{L}\p{N} ().,:/_+-]/gu, "").slice(0, 80);
  if (r.webgl === false) return { webgl: false, renderer: null, vendor: null, virtuel: false, logiciel: true };
  if (!renderer) return null;
  const texte = `${renderer} ${vendor}`;
  return { webgl: true, renderer, vendor: vendor || null, virtuel: VM_RE.test(texte), logiciel: LOGICIEL_RE.test(texte) };
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
