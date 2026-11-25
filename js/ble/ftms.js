// Smart trainer over Bluetooth: FTMS (read + ERG control),
// fallback to Cycling Power Service (read only).

// Full 128-bit UUID strings: some browsers (e.g. Bluefy on iPad) reject numeric 16-bit UUIDs.
const uuid = (n) => `0000${n.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
const FTMS = uuid(0x1826);
const INDOOR_BIKE_DATA = uuid(0x2ad2);
const CONTROL_POINT = uuid(0x2ad9);
const CPS = uuid(0x1818);
const CP_MEASUREMENT = uuid(0x2a63);

/** Turn any thrown value into a readable message, prefixed with the step that failed. */
function stepError(step, err) {
  const detail = err && (err.message || err.name) ? `${err.name ? err.name + ': ' : ''}${err.message || ''}` : String(err);
  const e = new Error(`${step} – ${detail}`);
  e.name = err?.name || 'Error';
  return e;
}

export class Trainer {
  constructor() {
    this.device = null;
    this.controlPoint = null;
    this.canControl = false;
    this.onData = () => {};
    this.onDisconnect = () => {};
    this.onStatus = () => {}; // progress messages while connecting
    this._queue = Promise.resolve();
    this._crank = null; // for CPS cadence calc
  }

  get name() {
    return this.device?.name || 'Trenažer';
  }

  async connect() {
    if (!navigator.bluetooth) throw new Error('Ta brskalnik ne podpira Bluetooth (na iPadu uporabi Bluefy).');
    const optionalServices = [FTMS, CPS];

    // 1) Show only trainers (FTMS or power). 2) If the browser rejects that, show all devices.
    this.onStatus('Odpiram seznam naprav…');
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [FTMS] }, { services: [CPS] }],
        optionalServices,
      });
    } catch (err) {
      if (err?.name === 'NotFoundError') throw err; // user closed the list
      console.warn('requestDevice with filters failed, retrying with all devices', err);
      this.onStatus('Odpiram seznam vseh naprav…');
      try {
        this.device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices });
      } catch (err2) {
        if (err2?.name === 'NotFoundError') throw err2;
        throw stepError('Seznam naprav', err2);
      }
    }
    this.device.addEventListener('gattserverdisconnected', () => this.onDisconnect());

    let server;
    try {
      this.onStatus(`Povezujem z ${this.name}…`);
      server = await this.device.gatt.connect();
    } catch (err) {
      throw stepError(`Povezava z ${this.name} (je trenažer povezan z drugo aplikacijo, npr. MyWhoosh?)`, err);
    }

    let ftms = null;
    try { ftms = await server.getPrimaryService(FTMS); } catch { /* not FTMS */ }

    if (ftms) {
      try {
        this.onStatus('Berem moč in kadenco (FTMS)…');
        const data = await ftms.getCharacteristic(INDOOR_BIKE_DATA);
        data.addEventListener('characteristicvaluechanged', (e) => this._parseIndoorBike(e.target.value));
        await data.startNotifications();
      } catch (err) {
        throw stepError('Branje podatkov FTMS', err);
      }
      try {
        this.onStatus('Prevzemam upravljanje upora (ERG)…');
        this.controlPoint = await ftms.getCharacteristic(CONTROL_POINT);
        // Indications must be enabled before writing to the control point.
        this.controlPoint.addEventListener('characteristicvaluechanged', () => {});
        await this.controlPoint.startNotifications();
        await this._writeNow([0x00]); // Request control
        await this._writeNow([0x07]); // Start / resume
        this.canControl = true;
      } catch (err) {
        console.warn('FTMS control not available', err);
        this.canControl = false;
        this.controlError = stepError('ERG', err).message;
      }
    } else {
      try {
        this.onStatus('FTMS ni na voljo, berem moč (Cycling Power)…');
        const cps = await server.getPrimaryService(CPS);
        const m = await cps.getCharacteristic(CP_MEASUREMENT);
        m.addEventListener('characteristicvaluechanged', (e) => this._parseCyclingPower(e.target.value));
        await m.startNotifications();
        this.canControl = false;
      } catch (err) {
        throw stepError('Ta naprava ni trenažer (ni FTMS ne Cycling Power)', err);
      }
    }
    this.onStatus('');
  }

  /** Write to the control point and let errors propagate (used while connecting). */
  _writeNow(bytes) {
    const buf = new Uint8Array(bytes);
    const c = this.controlPoint;
    const p = c.writeValueWithResponse ? c.writeValueWithResponse(buf) : c.writeValue(buf);
    this._queue = p.catch(() => {});
    return p;
  }

  disconnect() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
  }

  /** ERG mode: set target power in watts. */
  setTargetPower(watts) {
    if (!this.canControl) return Promise.resolve();
    const w = Math.max(0, Math.min(2000, Math.round(watts)));
    return this._write([0x05, w & 0xff, (w >> 8) & 0xff]);
  }

  _write(bytes) {
    // Serialize writes: GATT allows only one operation at a time.
    this._queue = this._queue
      .then(() => {
        const buf = new Uint8Array(bytes);
        const c = this.controlPoint;
        return c.writeValueWithResponse ? c.writeValueWithResponse(buf) : c.writeValue(buf);
      })
      .catch((err) => console.warn('FTMS write failed', err));
    return this._queue;
  }

  _parseIndoorBike(dv) {
    const flags = dv.getUint16(0, true);
    let o = 2;
    const out = {};
    if (!(flags & 0x0001)) o += 2; // instantaneous speed
    if (flags & 0x0002) o += 2; // average speed
    if (flags & 0x0004) { out.cadence = dv.getUint16(o, true) / 2; o += 2; }
    if (flags & 0x0008) o += 2; // average cadence
    if (flags & 0x0010) o += 3; // total distance
    if (flags & 0x0020) o += 2; // resistance level
    if (flags & 0x0040) { out.power = dv.getInt16(o, true); o += 2; }
    if (flags & 0x0080) o += 2; // average power
    if (flags & 0x0100) o += 5; // expended energy
    if (flags & 0x0200) { out.hr = dv.getUint8(o); o += 1; }
    if (Object.keys(out).length) this.onData(out);
  }

  _parseCyclingPower(dv) {
    const flags = dv.getUint16(0, true);
    const out = { power: dv.getInt16(2, true) };
    let o = 4;
    if (flags & 0x01) o += 1; // pedal power balance
    if (flags & 0x04) o += 2; // accumulated torque
    if (flags & 0x10) o += 6; // wheel revolution data
    if (flags & 0x20) {
      const revs = dv.getUint16(o, true);
      const time = dv.getUint16(o + 2, true); // 1/1024 s
      const prev = this._crank;
      if (prev) {
        const dRev = (revs - prev.revs + 0x10000) & 0xffff;
        const dT = ((time - prev.time + 0x10000) & 0xffff) / 1024;
        if (dT > 0) out.cadence = (dRev / dT) * 60;
        else if (performance.now() - prev.at > 3000) out.cadence = 0;
      }
      if (!prev || prev.revs !== revs) this._crank = { revs, time, at: performance.now() };
    }
    this.onData(out);
  }
}
