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

// Heart-rate zones (fraction of max HR), Garmin-style colours.
export const HR_ZONES = [
  { name: 'Z1', max: 0.60, color: '#9aa7b4' },
  { name: 'Z2', max: 0.70, color: '#3b82f6' },
  { name: 'Z3', max: 0.80, color: '#22a55a' },
  { name: 'Z4', max: 0.90, color: '#f08a24' },
  { name: 'Z5', max: Infinity, color: '#e0443c' },
];

export function hrZoneFor(hr, maxHr) {
  const f = hr / maxHr;
  return HR_ZONES.find((z) => f < z.max) || HR_ZONES[HR_ZONES.length - 1];
}

export function zoneFor(fraction) {
  return ZONES.find((z) => fraction <= z.max + 1e-9) || ZONES[ZONES.length - 1];
}
