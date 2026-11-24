// Coggan power zones (fraction of FTP) and display colours.
export const ZONES = [
  { id: 1, name: 'Z1', max: 0.55, color: '#9aa7b4' },
  { id: 2, name: 'Z2', max: 0.75, color: '#4fa3a5' },
  { id: 3, name: 'Z3', max: 0.90, color: '#e3b428' },
  { id: 4, name: 'Z4', max: 1.05, color: '#ef8a2c' },
  { id: 5, name: 'Z5', max: 1.20, color: '#e0503c' },
  { id: 6, name: 'Z6', max: 1.50, color: '#a24bc2' },
  { id: 7, name: 'Z7', max: Infinity, color: '#5b3a8c' },
];

export function zoneFor(fraction) {
  return ZONES.find((z) => fraction <= z.max + 1e-9) || ZONES[ZONES.length - 1];
}
