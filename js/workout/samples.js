// Built-in test workouts. Power is a fraction of FTP.

function repeat(n, makeSteps) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(...makeSteps(i, n));
  return out;
}

export const SAMPLE_WORKOUTS = [
  {
    id: 'sweetspot-4x8',
    name: 'Sweet spot 4×8',
    steps: [
      { name: 'Ogrevanje', duration: 600, power: 0.45, powerEnd: 0.70 },
      ...repeat(4, (i, n) => [
        { name: `Steady 90% ${i}/${n}`, duration: 480, power: 0.90 },
        ...(i < n ? [{ name: 'Počitek', duration: 120, power: 0.55 }] : []),
      ]),
      { name: 'Ohlajanje', duration: 300, power: 0.60, powerEnd: 0.40 },
    ],
  },
  {
    id: 'vo2-5x3',
    name: 'VO2max 5×3',
    steps: [
      { name: 'Ogrevanje', duration: 480, power: 0.50, powerEnd: 0.75 },
      { name: 'Aktivacija', duration: 60, power: 1.0 },
      { name: 'Lahko', duration: 120, power: 0.55 },
      ...repeat(5, (i, n) => [
        { name: `VO2 ${i}/${n}`, duration: 180, power: 1.15 },
        { name: 'Počitek', duration: 180, power: 0.50 },
      ]),
      { name: 'Ohlajanje', duration: 300, power: 0.55, powerEnd: 0.40 },
    ],
  },
  {
    id: 'test-short',
    name: 'Kratek test (3 min)',
    steps: [
      { name: 'Ogrevanje', duration: 40, power: 0.5, powerEnd: 0.7 },
      { name: 'Steady 90%', duration: 30, power: 0.9 },
      { name: 'Počitek', duration: 20, power: 0.55 },
      { name: 'Prag', duration: 30, power: 1.0 },
      { name: 'Sprint', duration: 15, power: 1.4 },
      { name: 'Ohlajanje', duration: 45, power: 0.6, powerEnd: 0.4 },
    ],
  },
];
