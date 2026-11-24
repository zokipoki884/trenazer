// Lastne vaje. Vir: MyWhoosh (mywhooshinfo.com), moč v deležu FTP (0.90 = 90 %).
// Trajanje v sekundah. Za vaje z absolutnimi vati uporabi `watts` / `wattsEnd` namesto `power` / `powerEnd`.

const S = (name, duration, power, powerEnd) =>
  powerEnd == null ? { name, duration, power } : { name, duration, power, powerEnd };
const W = (d, p, pe) => S('Ogrevanje', d, p, pe);
const C = (d, p, pe) => S('Ohlajanje', d, p, pe);
const R = (d, p) => S('Počitek', d, p);
const E = (d, p) => S('Lahko', d, p);
const I = (d, p, pe) => S('Interval', d, p, pe);
/** Repeat a block n times; fn(i, n) returns the steps for repetition i (1-based). */
const rep = (n, fn) => Array.from({ length: n }, (_, k) => fn(k + 1, n)).flat();

export const MY_WORKOUTS = [
  {
    id: 'aerobic-12s-1', name: "Aerobic 12's #1",
    steps: [
      W(300, 0.45, 0.65),
      ...rep(5, (i, n) => [S(`Lahko ${i}/${n}`, 30, 0.70), S(`Interval ${i}/${n}`, 30, 0.90)]),
      R(120, 0.45), I(180, 0.90), R(60, 0.45),
      ...rep(3, (i, n) => [S(`Interval ${i}/${n}`, 720, 0.76), R(180, 0.55)]),
      C(120, 0.55, 0.45),
    ],
  },
  {
    id: 'lactate-fuel', name: 'Lactate Fuel',
    steps: [
      W(360, 0.45, 0.75), R(60, 0.50), I(60, 1.09), R(120, 0.50), I(180, 0.50, 0.90), I(240, 0.90), R(120, 0.50),
      ...rep(5, (i) => [S(`Sprint ${i}/10`, 15, 1.40), E(105, 0.65)]),
      I(300, 0.81),
      ...rep(5, (i) => [S(`Sprint ${i + 5}/10`, 15, 1.40), E(105, 0.65)]),
      I(300, 0.81),
      C(300, 0.75, 0.45),
    ],
  },
  {
    id: 'rolling-hills-1', name: 'Rolling Hills #1',
    steps: [
      W(300, 0.45, 0.75), R(60, 0.60), I(300, 0.80), E(60, 0.65),
      ...rep(5, (i, n) => [S(`Lahko ${i}/${n}`, 30, 0.75), S(`Interval ${i}/${n}`, 30, 0.90)]),
      E(120, 0.65),
      ...rep(4, (i, n) => [S(`Hrib ${i}/${n}`, 120, 0.80), R(180, 0.60)]),
      ...rep(2, (i, n) => [S(`Hrib ${i}/${n}`, 180, 0.85), R(180, 0.60)]),
      C(300, 0.65, 0.50),
    ],
  },
  {
    id: 'mitochondria-12', name: 'Mitochondria #12',
    steps: [
      W(180, 0.50), W(60, 0.60), W(60, 0.65), W(60, 0.81),
      I(60, 1.09), R(120, 0.50), I(240, 0.90), R(180, 0.50),
      ...rep(10, (i, n) => [S(`VO2 ${i}/${n}`, 120, 1.13), R(120, 0.50)]),
      C(120, 0.45),
    ],
  },
  {
    id: 'intensive-aerobic-endurance', name: 'Intensive Aerobic Endurance',
    steps: [
      W(300, 0.45, 0.75),
      I(60, 0.80), R(60, 0.50), I(60, 0.80), R(60, 0.50),
      I(60, 0.98), R(60, 0.50), I(60, 0.98), R(60, 0.50), R(120, 0.50),
      S('Interval 1/4', 600, 1.00, 0.91), R(300, 0.50),
      S('Interval 2/4', 480, 0.94, 0.85), R(240, 0.50),
      S('Interval 3/4', 360, 0.88, 0.79), R(180, 0.50),
      S('Interval 4/4', 240, 0.82, 0.73),
      C(300, 0.50),
    ],
  },
  {
    id: 'anaerobic-capacity-into-sweetspot-3', name: 'Anaerobic Capacity into Sweetspot #3',
    steps: [
      W(600, 0.25, 0.75), W(60, 0.50),
      ...rep(6, (i, n) => [S(`Napad ${i}/${n}`, 60, 1.20), S(`Sweet spot ${i}/${n}`, 300, 0.88), R(120, 0.55)]),
      C(300, 0.65, 0.50),
    ],
  },
  {
    id: 'depleting-20s', name: "Depleting 20's",
    steps: [
      W(240, 0.50),
      ...rep(5, (i, n) => [S(`Lahko ${i}/${n}`, 30, 0.65), S(`Interval ${i}/${n}`, 30, 0.85)]),
      R(60, 0.50), I(180, 0.85), R(60, 0.50), I(60, 1.02), R(120, 0.50),
      I(600, 0.65, 0.90), R(60, 0.50),
      ...rep(8, (i, n) => [S(`Sprint ${i}/${n}`, 20, 1.60), E(100, 0.65)]),
      I(600, 0.65, 0.90),
      C(300, 0.50),
    ],
  },
  {
    id: 'sweetspot-15-minute', name: 'Sweetspot 15 minute',
    steps: [
      W(180, 0.45, 0.60), W(60, 0.60), W(60, 0.65), W(60, 0.81),
      I(60, 1.09), R(120, 0.50), I(240, 0.95), R(180, 0.50),
      S('Sweet spot', 900, 0.88, 0.94), R(180, 0.50),
      ...rep(8, (i, n) => [S(`Interval ${i}/${n}`, 60, 0.98), R(120, 0.50)]),
      C(300, 0.65, 0.45),
    ],
  },
  {
    id: 'sweetspot-20-minute', name: 'Sweetspot 20 minute',
    steps: [
      W(180, 0.45, 0.60), W(60, 0.60), W(60, 0.65), W(60, 0.81),
      I(60, 1.09), R(120, 0.50), I(240, 0.95), R(180, 0.50),
      S('Sweet spot', 1200, 0.88, 0.94), R(180, 0.50),
      ...rep(5, (i, n) => [S(`Interval ${i}/${n}`, 60, 0.98), R(120, 0.50)]),
      C(300, 0.75, 0.45),
    ],
  },
  {
    id: 'sweet-spot-6', name: 'Sweet Spot 6',
    steps: [
      W(240, 0.50),
      ...rep(5, (i, n) => [S(`Lahko ${i}/${n}`, 30, 0.65), S(`Interval ${i}/${n}`, 30, 0.85)]),
      R(60, 0.50), I(180, 0.85), R(60, 0.50), I(60, 1.02), R(120, 0.50),
      S('Sweet spot 1/4', 360, 0.88, 0.95), R(180, 0.50),
      S('Sweet spot 2/4', 360, 0.95, 0.88), R(180, 0.50),
      S('Sweet spot 3/4', 360, 0.88, 0.95), R(180, 0.50),
      S('Sweet spot 4/4', 360, 0.95, 0.88),
      C(300, 0.50),
    ],
  },
  {
    id: 'climbing-fartlek-3', name: 'Climbing Fartlek #3',
    steps: [
      W(240, 0.55), W(180, 0.65), I(120, 0.80), I(120, 0.90),
      ...rep(3, (b, nb) => [
        R(180, 0.55),
        ...rep(4, (i, n) => [S(`Vzpon ${b}/${nb} · ${i}/${n}`, 120, 0.89), S(`Napad ${b}/${nb} · ${i}/${n}`, 30, 1.25)]),
      ]),
      C(240, 0.55),
    ],
  },
  {
    id: '13min-progressive-climb', name: '13min Progressive Climb',
    steps: [
      W(180, 0.45, 0.55), S('Napad', 20, 1.25),
      W(180, 0.56, 0.65), S('Napad', 20, 1.25),
      W(180, 0.66, 0.75), S('Napad', 20, 1.25),
      R(60, 0.55),
      ...rep(3, (i, n) => [
        S(`Vzpon ${i}/${n}`, 60, 0.61, 0.79),
        S(`Vzpon ${i}/${n}`, 300, 0.80),
        S(`Vzpon ${i}/${n}`, 60, 0.81, 0.94),
        S(`Vzpon ${i}/${n}`, 240, 0.95),
        S(`Vzpon ${i}/${n}`, 60, 0.96, 1.04),
        S(`Vzpon ${i}/${n}`, 60, 1.05),
        ...(i < n ? [R(240, 0.55)] : []),
      ]),
      C(300, 0.65, 0.45),
    ],
  },
  {
    id: '8min-rolling-tt', name: '8min Rolling TT',
    steps: [
      W(300, 0.45, 0.75),
      ...rep(5, (i, n) => [S(`Lahko ${i}/${n}`, 30, 0.65), S(`Interval ${i}/${n}`, 30, 0.89)]),
      R(120, 0.50), I(240, 0.81),
      ...rep(3, (b, nb) => [
        R(120, 0.50),
        S(`Start TT ${b}/${nb}`, 30, 1.10),
        ...rep(4, () => [S(`TT ${b}/${nb}`, 60, 0.92), S(`TT ${b}/${nb}`, 60, 0.97)]),
      ]),
      C(300, 0.50),
    ],
  },
  {
    id: '30-30s-anaerobic-1', name: "30/30's Anaerobic #1",
    steps: [
      W(300, 0.45, 0.75), E(60, 0.65), I(180, 0.70, 0.90), E(60, 0.65), I(60, 1.09), R(120, 0.50),
      ...rep(4, (b, nb) => [
        ...rep(4, (i, n) => [S(`30/30 ${b}/${nb} · ${i}/${n}`, 30, 1.15), R(30, 0.50)]),
        ...(b < nb ? [E(240, 0.65)] : []),
      ]),
      R(120, 0.50), I(240, 0.81),
      C(300, 0.75, 0.45),
    ],
  },
  {
    id: 'anaerobic-endurance-1', name: 'Anaerobic Endurance #1',
    steps: [
      W(360, 0.45, 0.75), R(60, 0.50), I(60, 1.09), R(120, 0.50), I(180, 0.50, 0.90), I(240, 0.90), R(180, 0.50),
      ...rep(4, (i) => [S(`Interval ${i}/8`, 60, 1.21), R(180, 0.55)]),
      R(120, 0.50),
      ...rep(4, (i) => [S(`Interval ${i + 4}/8`, 60, 1.21), R(180, 0.55)]),
      C(300, 0.55, 0.45),
    ],
  },
];
