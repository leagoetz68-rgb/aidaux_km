// ==UserScript==
// @name         Ximi — bouton Aid'Aux KM
// @namespace    aidaux
// @version      1.0
// @description  Ajoute un bouton « KM » dans la barre bleue de Ximi, qui ouvre Aid'Aux KM.
// @match        https://*.xelya.io/*
// @match        https://*.xelya.fr/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  const URL_KM = 'https://aidaux-km.vercel.app';
  const ID = 'aidaux-km-btn';

  function creerBouton() {
    const a = document.createElement('a');
    a.id = ID;
    a.href = URL_KM;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = "Ouvrir Aid'Aux KM (frais kilométriques)";
    a.textContent = '🚗 KM';
    a.style.cssText = 'display:inline-flex;align-items:center;height:32px;padding:0 12px;margin:0 8px;' +
      'border-radius:6px;background:#fff;color:#2c6fb0;font-weight:700;font-size:13px;' +
      'text-decoration:none;font-family:inherit;white-space:nowrap;';
    return a;
  }

  function ajouter() {
    if (document.getElementById(ID)) return;
    // On cherche l'icône « maison » de la barre du haut et on place le bouton juste avant.
    const maison = document.querySelector('header .fa-home, nav .fa-home, .navbar .fa-home, [class*="fa-home"]');
    const li = maison && maison.closest('li, a, button');
    if (li && li.parentElement) {
      const bouton = creerBouton();
      li.parentElement.insertBefore(li.tagName === 'LI' ? Object.assign(document.createElement('li'), { style: 'display:flex;align-items:center;' }) : bouton, li);
      if (li.tagName === 'LI') li.previousSibling.appendChild(bouton);
      return;
    }
    // Sinon : bouton flottant en haut à droite, sur la barre bleue.
    const bouton = creerBouton();
    bouton.style.position = 'fixed';
    bouton.style.top = '9px';
    bouton.style.right = '330px';
    bouton.style.zIndex = '99999';
    document.body.appendChild(bouton);
  }

  // Ximi recharge des morceaux de page : on revérifie régulièrement.
  ajouter();
  setInterval(ajouter, 2000);
})();
