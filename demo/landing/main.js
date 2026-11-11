/**
 * Hidrata la landing desde el contrato generado.
 *
 * El HTML no contiene texto visible ni colores: sólo claves (`data-copy`) y
 * variables CSS. El datasetId, el schemaVersion y el catálogo de copy llegan
 * desde `generated/dataset.js`, que produce el sync del contrato compartido.
 * Así la landing no puede divergir de las dos demos (SC-2, SC-8).
 */
(() => {
  'use strict';

  const dataset = window.NEARBYIG_DATASET;

  if (!dataset || typeof dataset !== 'object') {
    console.warn('NearbyIG: falta generated/dataset.js (corré el sync del contrato).');
    return;
  }

  const copy = dataset.copy ?? {};

  const fmt = (key, params = {}) => {
    const raw = copy[key];
    if (typeof raw !== 'string') {
      return `[${key}]`;
    }
    return Object.entries(params).reduce(
      (out, [name, value]) => out.split(`{${name}}`).join(value),
      raw,
    );
  };

  for (const element of document.querySelectorAll('[data-copy]')) {
    element.textContent = fmt(element.dataset.copy);
  }

  for (const element of document.querySelectorAll('[data-copy-alt]')) {
    element.setAttribute('alt', fmt(element.dataset.copyAlt));
  }

  for (const element of document.querySelectorAll('[data-dataset-id]')) {
    element.textContent = String(dataset.datasetId ?? '');
  }

  for (const element of document.querySelectorAll('[data-schema-version]')) {
    element.textContent = String(dataset.schemaVersion ?? '');
  }

  document.title = fmt('landing.documentTitle');
})();
