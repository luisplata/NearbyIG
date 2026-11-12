import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * Estilo oscuro local del basemap. Apunta **sólo** a tile sources de
 * `tiles.openfreemap.org`, así el artefacto tiene un único host pedible.
 *
 * Por qué un estilo propio y no el `liberty` remoto invertido con CSS: liberty
 * pinta calles blancas sobre tierra casi blanca; invertido quedan negras sobre
 * negro y se pierde el contraste. Acá la calzada es 2–4× más clara que el fondo
 * y el casing la separa del terreno.
 *
 * No se declara `sprite` ni capas de íconos: menos requests y ninguna imagen
 * externa. Sin `setRTLTextPlugin` (los nombres de Buenos Aires son latinos).
 *
 * Los colores son **roles cartográficos**, no UI: `mapPalette` los documenta y
 * los ancla a `design-tokens.json` donde hay equivalente.
 */

export const mapPalette = {
  background: '#09090B', // color.bg
  water: '#101C28',
  park: '#0F1F16',
  landcover: '#0D1A13',
  building: '#13131A', // entre surface #121216 y surfaceAlt #1B1B21
  roadCasing: '#262631', // borde de color.border #2A2A33
  roadMajor: '#3A3A47',
  roadMedium: '#2F2F3A',
  roadMinor: '#24242D',
  label: '#F4F4F5', // color.text
  labelHalo: '#09090B', // color.bg
  boundary: '#3F3F4B',
} as const;

const FONT_STACK = ['Noto Sans Regular'];
/** Zoom mínimo de las capas de detalle: evita pedir tiles de ciudad de lejos. */
const CITY_ZOOM = 12;
const STREET_ZOOM = 14;

export function mapStyle(): StyleSpecification {
  const layers: LayerSpecification[] = [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': mapPalette.background },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: { 'fill-color': mapPalette.water },
    },
    {
      id: 'landcover-wood',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'],
      paint: { 'fill-color': mapPalette.landcover },
    },
    {
      id: 'park',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'park',
      paint: { 'fill-color': mapPalette.park },
    },
    {
      id: 'building',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: STREET_ZOOM,
      paint: { 'fill-color': mapPalette.building, 'fill-outline-color': mapPalette.roadCasing },
    },
    {
      id: 'boundary-country',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['<=', ['get', 'admin_level'], 4],
      paint: { 'line-color': mapPalette.boundary, 'line-width': 0.8, 'line-dasharray': [3, 2] },
    },
    {
      id: 'road-casing',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: CITY_ZOOM,
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': mapPalette.roadCasing,
        'line-width': ['interpolate', ['linear'], ['zoom'], CITY_ZOOM, 2, 16, 10],
      },
    },
    {
      id: 'road-major',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 6,
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': mapPalette.roadMajor,
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 12, 1.6, 16, 6],
      },
    },
    {
      id: 'road-medium',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 10,
      filter: ['==', ['get', 'class'], 'secondary'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': mapPalette.roadMedium,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 4],
      },
    },
    {
      id: 'road-tertiary',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 12,
      filter: ['==', ['get', 'class'], 'tertiary'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': mapPalette.roadMedium,
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 16, 3],
      },
    },
    {
      id: 'road-minor',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: STREET_ZOOM,
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'residential']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': mapPalette.roadMinor,
        'line-width': ['interpolate', ['linear'], ['zoom'], STREET_ZOOM, 0.4, 17, 2.4],
      },
    },
    {
      id: 'road-path',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 15,
      filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]],
      paint: {
        'line-color': mapPalette.roadMinor,
        'line-width': 0.6,
        'line-dasharray': [2, 2],
      },
    },
    {
      id: 'road-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      minzoom: STREET_ZOOM,
      layout: {
        'symbol-placement': 'line',
        'text-field': ['get', 'name'],
        'text-font': FONT_STACK,
        'text-size': 11,
        'text-keep-upright': true,
      },
      paint: {
        'text-color': mapPalette.label,
        'text-halo-color': mapPalette.labelHalo,
        'text-halo-width': 1.2,
      },
    },
    {
      id: 'place-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      minzoom: 10,
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'suburb', 'neighbourhood']]],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': FONT_STACK,
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 15, 14],
        'text-max-width': 8,
      },
      paint: {
        'text-color': mapPalette.label,
        'text-halo-color': mapPalette.labelHalo,
        'text-halo-width': 1.2,
      },
    },
  ];

  return {
    version: 8,
    name: 'nearbyig-dark',
    // URLs completas, literales: el artefacto auditado tiene que mostrar el
    // pedido en posición `glyphs:`/`url:` para que el gate lo vea.
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      openmaptiles: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
      },
    },
    layers,
  };
}
