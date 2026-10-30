// (30/10, lot D — diagnostic Beebs) CE QUE VOIT UN SITE du navigateur : la même expression est lue dans le navigateur
// Cloud (par CDP) et dans un vrai Chrome d'ordinateur, pour comparer signal par signal. Lecture seule, rien n'est saisi.
export const EXPRESSION_EMPREINTE = `(async () => {
  const c = document.createElement('canvas'); const gl = c.getContext('webgl');
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  let perm = null; try { perm = (await navigator.permissions.query({ name: 'notifications' })).state; } catch (e) { perm = 'erreur'; }
  return JSON.stringify({
    ua: navigator.userAgent,
    uaData: navigator.userAgentData ? { brands: navigator.userAgentData.brands.map((b) => b.brand + ' ' + b.version), platform: navigator.userAgentData.platform, mobile: navigator.userAgentData.mobile } : null,
    webdriver: navigator.webdriver, langues: navigator.languages, langue: navigator.language,
    fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone, decalage: new Date().getTimezoneOffset(),
    coeurs: navigator.hardwareConcurrency, memoire: navigator.deviceMemory, plateforme: navigator.platform,
    ecran: [screen.width, screen.height, screen.colorDepth, devicePixelRatio], fenetre: [innerWidth, innerHeight, outerWidth, outerHeight],
    webgl: dbg ? [gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL), gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)] : (gl ? 'sans debug' : 'aucun'),
    plugins: navigator.plugins.length, pdf: navigator.pdfViewerEnabled, chrome: typeof window.chrome,
    notification: { permission_api: perm, notification: typeof Notification !== 'undefined' ? Notification.permission : null },
    tactile: navigator.maxTouchPoints, connexion: navigator.connection ? navigator.connection.effectiveType : null,
  });
})()`;
