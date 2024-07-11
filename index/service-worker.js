"use strict";

let db;
let cacheName = "kweseConvert_cache-v1";
const allowedOrigin = self.location.origin;
const endpoint = "https://v6.exchangerate-api.com/v6/226c5a3e79c312d8ff7bc68a/latest/USD";

const cacheAssets = async (assets) => {
    const cache = await caches.open(cacheName);
    try {
        await cache.addAll(assets);
    } catch (error) {
        console.error("Failed to add static cache assets:", error);
    }
};

const putInCache = async (request, response) => {
    try {
        if (request.url.startsWith(allowedOrigin || request.url === endpoint)) {
            const cache = await caches.open(cacheName);
            await cache.put(request, response);
        }
    } catch (err) {
        console.error("Failed to put in cache:", err);
    }
};

const enableNavPreload = async () => {
    if (self.registration) {
        await self.registration.navigationPreload.enable();
    }
};

const deleteOldCaches = async () => {
    const names = await caches.keys();
    await Promise.all(names.map(name => {
        if (name !== cacheName) {
            return caches.delete(name);
        }
    }));
};

// offline-first strategy
const assetHandler = async (request, preloadResponsePromise) => {
    const cachedRes = await caches.match(request);
    if (cachedRes) {
        return cachedRes;
    }

    const preloadRes = await preloadResponsePromise;
    if (preloadRes) {
        putInCache(request, preloadRes.clone());
        return preloadRes;
    }

    try {
        const networkRes = await fetch(request);
        putInCache(request, networkRes.clone());
        return networkRes;
    } catch (error) {
        console.error("assetHander err:", error);
    }
};

// only call api every 24hrs
const endpointHandler = async (request) => {
    const cache = await caches.open(cacheName);
    const lastCallResponse = await cache.match("last-api-call-timestamp");
    let lastCallTimestamp = lastCallResponse ? await lastCallResponse.json() : null;
    let currentTimestamp = Date.now();
    // console.log(`currentTimestamp: ${currentTimestamp}, lastCallTimestamp: ${lastCallTimestamp}`);

    if (lastCallTimestamp && (currentTimestamp - lastCallTimestamp < 24 * 60 * 60 * 1000)) {
        const cachedRes = await caches.match(request);
        if (cachedRes) {
            return cachedRes;
        }
    }

    const networkRes = await fetch(request);
    if (networkRes.ok) {
        cache.put("last-api-call-timestamp", new Response(JSON.stringify(currentTimestamp)));
        cache.put(request, networkRes.clone());
    }
    return networkRes;
}

self.addEventListener("install", (ev) => {
    self.skipWaiting();
    ev.waitUntil(
        cacheAssets([
            "index.html",
            "index.js",
        ]),
    );
});

self.addEventListener("activate", (ev) => {
    ev.waitUntil(
        Promise.all([
            enableNavPreload(),
            deleteOldCaches()
        ])
    );
});

self.addEventListener("fetch", (ev) => {
    if (ev.request.url === endpoint) {
        ev.respondWith(endpointHandler(ev.request));
    } else {
        ev.respondWith(assetHandler(ev.request));
    }
    ev.waitUntil((async () => {
        const preloadResPromise = ev.preloadResponse;
        if (preloadResPromise) {
            return await preloadResPromise;
        }
    })());
});
