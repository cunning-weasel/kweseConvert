"use strict";

let db;
let cacheName = "kwese-converter_cache-v1";
const allowedOrigin = self.location.origin; // Your domain origin

const cacheAssets = async (assets) => {
    const cache = await caches.open(cacheName);
    try {
        await cache.addAll(assets);
    } catch (error) {
        console.error("Failed to cache assets:", error);
    }
};

const putInCache = async (request, response) => {
    try {
        if (request.url.startsWith(allowedOrigin)) {
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
        console.error("Failed to fetch from network:", error);
    }
};

self.addEventListener("install", (ev) => {
    self.skipWaiting();
    ev.waitUntil(
        cacheAssets([
            "index.html",
            "index.js"
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
    ev.respondWith(assetHandler(ev.request));
    ev.waitUntil((async () => {
        const preloadResPromise = ev.preloadResponse;
        if (preloadResPromise) {
            return await preloadResPromise;
        }
    })());
});
