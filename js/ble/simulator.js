// Fake trainer + HR for testing without hardware. Behaves like a trainer in ERG mode.

export class Simulator {
  constructor() {
    this.name = 'Simulator';
    this.canControl = true;
    this.onData = () => {};
    this.onDisconnect = () => {};
    this._target = 100;
    this._power = 0;
    this._hr = 95;
    this._timer = null;
  }

  async connect() {
    this._timer = setInterval(() => this._tick(), 1000);
  }

  disconnect() {
    clearInterval(this._timer);
    this._timer = null;
    this.onDisconnect();
  }

  setTargetPower(w) {
    this._target = w;
    return Promise.resolve();
  }

  _tick() {
    // Trainer approaches target within a few seconds, with some noise.
    this._power += (this._target - this._power) * 0.45;
    const power = Math.max(0, Math.round(this._power + (Math.random() - 0.5) * 12));
    const base = this.cadenceOverride ?? 88; // set from console to test low cadence
    const cadence = Math.max(0, Math.round(base + (Math.random() - 0.5) * 6));
    const hrTarget = 90 + this._power * 0.35;
    this._hr += (hrTarget - this._hr) * 0.05;
    this.onData({ power, cadence, hr: Math.round(this._hr) });
  }
}
