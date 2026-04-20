importScripts("./data/all.js","./tmp/config.js","./tmp/bundle.js","./tmp/sw.js");

console.log("[SW] Loaded service worker");

let adblockEnabled = !1;
let configLoaded = !1;

const { ScramjetServiceWorker: ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const v = new UVServiceWorker();

self.addEventListener("message", e => {
  const { type, data } = e.data || {};
  console.log("[SW] Message received:", type, data);

  if (type === "ADBLOCK") {
    adblockEnabled = !!data?.enabled;
    console.log("[SW] Adblock toggled:", adblockEnabled);
  }
});

const BLOCK_RULES = [/* (keep your rules unchanged) */];

function wildcardToRegex(e){
  return new RegExp("^" + e
    .replace(/[.+?^${}()|[\]\\]/g,"\\$&")
    .replace(/\*\*/g,".*")
    .replace(/\*/g,"[^/]*") + "$","i");
}

const BLOCK_REGEX = BLOCK_RULES.map(wildcardToRegex);

function isAdRequest(url, req){
  console.log("[SW] Checking if ad:", url);

  if (BLOCK_REGEX.some(r => r.test(url))) {
    console.log("[SW] Blocked by rule:", url);
    return true;
  }

  try {
    const t = new URL(url);

    if (
      t.hostname.endsWith(".googlesyndication.com") ||
      t.hostname.endsWith(".doubleclick.net") ||
      t.hostname.endsWith(".media.net") ||
      t.hostname.endsWith(".criteo.com") ||
      t.hostname.endsWith(".adnxs.com")
    ) {
      console.log("[SW] Blocked by hostname:", t.hostname);
      return true;
    }

    if (
      req?.destination === "script" &&
      /ads|adservice|pagead|doubleclick|googlesyndication|analytics|tracker|pixel|telemetry/i.test(t.pathname)
    ) {
      console.log("[SW] Blocked script pattern:", t.pathname);
      return true;
    }

    if (req?.destination === "ping") {
      console.log("[SW] Blocked ping request");
      return true;
    }

    if (t.search && /(utm_|gclid|fbclid|ttclid|msclkid|ad|ads|tracking|pixel)/i.test(t.search)) {
      console.log("[SW] Blocked by query params:", t.search);
      return true;
    }

  } catch (err) {
    console.log("[SW] URL parse failed:", url, err);
  }

  return false;
}

async function handleFetch(e){
  const url = e.request.url;
  console.log("\n[SW] === FETCH ===");
  console.log("[SW] URL:", url);
  console.log("[SW] Destination:", e.request.destination);

  if (!configLoaded) {
    console.log("[SW] Loading config...");
    await scramjet.loadConfig();
    configLoaded = true;
    console.log("[SW] Config loaded");
  }

  // Adblock check
  if (adblockEnabled && isAdRequest(url, e.request)) {
    console.log("[SW] 🚫 Blocked request:", url);
    return new Response(null, { status: 204 });
  }

  if (/\/cdn-cgi\//i.test(url)) {
    console.log("[SW] 🚫 Blocked cdn-cgi:", url);
    return new Response(null, { status: 204 });
  }

  // Routing
  if (scramjet.route(e)) {
    console.log("[SW] ➡️ Scramjet handling:", url);
    return scramjet.fetch(e);
  }

  if (v.route(e)) {
    console.log("[SW] ➡️ UV handling:", url);
    return v.fetch(e);
  }

  console.log("[SW] 🌐 Default fetch:", url);
  return fetch(e.request);
}

self.addEventListener("fetch", e => {
  e.respondWith(handleFetch(e));
});
