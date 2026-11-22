"use strict";

// GitHub Pages replaces this with the deployed commit SHA.
const revision = "LETTER_HIVE_BUILD_REVISION";
const scope = self.registration.scope;
const cachePrefix = "letter-hive:" + scope + ":";
const cacheName = cachePrefix + revision;
const index = new URL("index.html", scope).href;
const assets = new Set([
  "index.html",
  "letter-hive.css",
  "letter-hive.js",
  "favicon.svg",
  "manifest.webmanifest",
  "icons/letter-hive-180.png",
  "icons/letter-hive-192.png",
  "icons/letter-hive-512.png",
  "data/puzzles.json",
  "data/daily-rotation.json",
  "data/hints.json",
  "data/esdb/COPYRIGHT.txt",
].map((path) => new URL(path, scope).href));

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll([...assets].map((url) => new Request(url, { cache: "reload" })));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(cachePrefix) && name !== cacheName)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  url.search = "";
  const isHome = request.mode === "navigate" && (url.href === scope || url.href === index);
  const key = isHome ? index : request.url;
  if (!assets.has(key)) return;

  event.respondWith((async () => {
    const cached = await caches.match(key, { cacheName });
    return cached || fetch(request);
  })());
});
