// Popup : affiche l'état connecté/déconnecté et gère login/logout.
// Le token est capturé par content-scripts/fillsell-auth.js quand l'utilisateur
// se connecte sur fillsell.app, puis stocké dans chrome.storage.local par le background.

const els = {
  connected: document.getElementById("status-connected"),
  disconnected: document.getElementById("status-disconnected"),
  email: document.getElementById("user-email"),
  loginBtn: document.getElementById("login-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  pollNowBtn: document.getElementById("poll-now-btn"),
  lastPoll: document.getElementById("last-poll"),
};

function decodeJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

async function render() {
  const { SESSION, LAST_POLL } = FILLSELL_CONFIG.STORAGE_KEYS;
  const store = await chrome.storage.local.get([SESSION, LAST_POLL]);
  const session = store[SESSION];

  const isConnected = Boolean(session?.access_token);
  els.connected.classList.toggle("hidden", !isConnected);
  els.disconnected.classList.toggle("hidden", isConnected);
  els.loginBtn.classList.toggle("hidden", isConnected);
  els.logoutBtn.classList.toggle("hidden", !isConnected);
  els.pollNowBtn.classList.toggle("hidden", !isConnected);

  if (isConnected) {
    const payload = decodeJwtPayload(session.access_token);
    els.email.textContent = session.email || payload?.email || "utilisateur";
  }

  if (store[LAST_POLL]) {
    els.lastPoll.textContent = `Dernière vérification : ${new Date(store[LAST_POLL]).toLocaleString("fr-FR")}`;
  }
}

els.loginBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: FILLSELL_CONFIG.AUTH_URL });
  window.close();
});

els.logoutBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove(FILLSELL_CONFIG.STORAGE_KEYS.SESSION);
  render();
});

els.pollNowBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "POLL_NOW" });
  window.close();
});

// Re-render si le background stocke une session pendant que le popup est ouvert
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[FILLSELL_CONFIG.STORAGE_KEYS.SESSION]) render();
});

render();
