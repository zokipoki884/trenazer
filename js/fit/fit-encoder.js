// Minimal FIT activity encoder (indoor cycling) — readable by Garmin Connect.
// Messages: file_id, event(start), record x N, event(stop), lap per workout step, session, activity.

const FIT_EPOCH_OFFSET = 631065600; // seconds between 1970-01-01 and 1989-12-31 UTC

// [base type id, size, invalid value]
const ENUM = [0x00, 1, 0xff];
const UINT8 = [0x02, 1, 0xff];
const UINT16 = [0x84, 2, 0xffff];
const UINT32 = [0x86, 4, 0xffffffff];
const UINT32Z = [0x8c, 4, 0];

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
  0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];
function crc16(bytes, start = 0, end = bytes.length) {
  let crc = 0;
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc;
}

class FitWriter {
  constructor() {
    this.bytes = [];
    this.defs = {};
  }
  _int(v, size) {
    for (let i = 0; i < size; i++) this.bytes.push((v >>> (8 * i)) & 0xff);
  }
  /** fields: [[fieldNum, TYPE], ...] */
  define(local, globalNum, fields) {
    this.defs[local] = fields;
    this.bytes.push(0x40 | local, 0, 0); // header, reserved, little-endian
    this._int(globalNum, 2);
    this.bytes.push(fields.length);
    for (const [num, [type, size]] of fields) this.bytes.push(num, size, type);
  }
  write(local, values) {
    this.bytes.push(local & 0x0f);
    this.defs[local].forEach(([, [, size, invalid]], i) => {
      const v = values[i];
      this._int(v == null || Number.isNaN(v) ? invalid : Math.round(v), size);
    });
  }
  finish() {
    const data = this.bytes;
    const header = [14, 0x10, 0x34, 0x08]; // header size, protocol 1.0, profile 21.00 (2100)
    const len = data.length;
    header.push(len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff, (len >>> 24) & 0xff);
    header.push(0x2e, 0x46, 0x49, 0x54); // ".FIT"
    const hcrc = crc16(header);
    header.push(hcrc & 0xff, hcrc >> 8);
    const all = new Uint8Array(header.length + len + 2);
    all.set(header, 0);
    all.set(data, header.length);
    const fcrc = crc16(all, 0, header.length + len);
    all[all.length - 2] = fcrc & 0xff;
    all[all.length - 1] = fcrc >> 8;
    return all;
  }
}

const fitTime = (ms) => Math.round(ms / 1000) - FIT_EPOCH_OFFSET;

/** Summary statistics for a list of 1 Hz records. */
export function rideStats(recs, ftp) {
  const n = recs.length;
  const powers = recs.map((r) => r.power || 0);
  const hrs = recs.map((r) => r.hr).filter((v) => v > 0);
  const cads = recs.map((r) => r.cad).filter((v) => v > 0);
  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const max = (a) => (a.length ? Math.max(...a) : null);
  const work = powers.reduce((s, v) => s + v, 0); // joules (1 s per record)

  // Normalized power: 30 s rolling average, 4th power mean, 4th root.
  let np = avg(powers);
  if (n >= 30) {
    let sum = 0;
    let acc = 0;
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      sum += powers[i];
      if (i >= 30) sum -= powers[i - 30];
      if (i >= 29) { acc += (sum / 30) ** 4; cnt++; }
    }
    np = (acc / cnt) ** 0.25;
  }
  const ifactor = ftp > 0 && np != null ? np / ftp : null;
  const tss = ifactor != null ? ((n * np * ifactor) / (ftp * 3600)) * 100 : null;
  return {
    avgPower: avg(powers), maxPower: max(powers),
    avgHr: avg(hrs), maxHr: max(hrs),
    avgCad: avg(cads), maxCad: max(cads),
    work, kcal: work / 1000, // ~1 kcal per kJ of mechanical work
    np, ifactor, tss,
  };
}

/**
 * records: [{ t: epoch ms, power, hr, cad, step }] — one per second of riding.
 * Returns a Uint8Array with the .fit file.
 */
export function encodeRideFit(records, { ftp } = {}) {
  if (!records.length) throw new Error('Ni podatkov o vožnji.');
  const w = new FitWriter();
  const first = records[0].t;
  const last = records[records.length - 1].t;
  const elapsed = (last - first) / 1000 + 1;
  const timer = records.length;

  // file_id
  w.define(0, 0, [[0, ENUM], [1, UINT16], [2, UINT16], [3, UINT32Z], [4, UINT32]]);
  w.write(0, [4, 255, 1, (first / 1000) >>> 0, fitTime(first)]); // activity, manufacturer=development

  // event (timer start / stop_all)
  w.define(1, 21, [[253, UINT32], [0, ENUM], [1, ENUM], [4, UINT8]]);
  w.write(1, [fitTime(first), 0, 0, 0]);

  // record
  w.define(2, 20, [[253, UINT32], [3, UINT8], [4, UINT8], [7, UINT16]]);
  for (const r of records) {
    w.write(2, [fitTime(r.t), r.hr > 0 ? r.hr : null, r.cad != null ? Math.min(254, r.cad) : null, r.power ?? null]);
  }
  w.write(1, [fitTime(last), 0, 4, 0]);

  // laps: one per workout step
  const groups = [];
  for (const r of records) {
    const g = groups[groups.length - 1];
    if (g && g.step === r.step) g.recs.push(r);
    else groups.push({ step: r.step, recs: [r] });
  }
  const statFields = (s) => [
    s.avgHr, s.maxHr, s.avgCad, s.maxCad, s.avgPower, s.maxPower,
  ];
  // lap: timestamp, start_time, total_elapsed_time, total_timer_time, total_calories,
  //      avg_hr, max_hr, avg_cad, max_cad, avg_power, max_power, total_work,
  //      event, event_type, lap_trigger, sport, sub_sport, message_index
  w.define(3, 19, [
    [253, UINT32], [2, UINT32], [7, UINT32], [8, UINT32], [11, UINT16],
    [15, UINT8], [16, UINT8], [17, UINT8], [18, UINT8], [19, UINT16], [20, UINT16], [41, UINT32],
    [0, ENUM], [1, ENUM], [24, ENUM], [25, ENUM], [39, ENUM], [254, UINT16],
  ]);
  groups.forEach((g, i) => {
    const s = rideStats(g.recs, ftp);
    const gFirst = g.recs[0].t;
    const gLast = g.recs[g.recs.length - 1].t;
    w.write(3, [
      fitTime(gLast), fitTime(gFirst), ((gLast - gFirst) / 1000 + 1) * 1000, g.recs.length * 1000, s.kcal,
      ...statFields(s), s.work,
      9, 1, i === groups.length - 1 ? 0 : 1, 2, 6, i,
    ]);
  });

  // session
  const s = rideStats(records, ftp);
  w.define(4, 18, [
    [253, UINT32], [2, UINT32], [7, UINT32], [8, UINT32], [11, UINT16],
    [16, UINT8], [17, UINT8], [18, UINT8], [19, UINT8], [20, UINT16], [21, UINT16],
    [25, UINT16], [26, UINT16], [34, UINT16], [35, UINT16], [36, UINT16], [48, UINT32],
    [0, ENUM], [1, ENUM], [5, ENUM], [6, ENUM], [28, ENUM], [254, UINT16],
  ]);
  w.write(4, [
    fitTime(last), fitTime(first), elapsed * 1000, timer * 1000, s.kcal,
    ...statFields(s),
    0, groups.length, s.np, s.tss != null ? s.tss * 10 : null, s.ifactor != null ? s.ifactor * 1000 : null,
    s.work,
    8, 1, 2, 6, 0, 0,
  ]);

  // activity
  const tzOffset = -new Date(last).getTimezoneOffset() * 60;
  w.define(5, 34, [[253, UINT32], [0, UINT32], [1, UINT16], [2, ENUM], [3, ENUM], [4, ENUM], [5, UINT32]]);
  w.write(5, [fitTime(last), timer * 1000, 1, 0, 26, 1, fitTime(last) + tzOffset]);

  return w.finish();
}
