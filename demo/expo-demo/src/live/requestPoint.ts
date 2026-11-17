/**
 * Puerta de geolocalización en web: el mismo port, sin una capa de más.
 *
 * Existe sólo para que `LiveProvider` importe `'./requestPoint'` sin extensión y
 * Metro elija el adapter correcto en cada plataforma (design A2). En web resuelve
 * acá y re-exporta la lectura del navegador tal cual: el comportamiento es el de
 * siempre, no una copia.
 */
export { requestBrowserPoint as requestPoint } from './geolocation';
