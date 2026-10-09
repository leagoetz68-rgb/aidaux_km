// Service worker minimal : rend l'application installable (écran d'accueil / menu Démarrer).
// Aucune mise en cache : tout passe par le réseau, les données restent toujours à jour.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
