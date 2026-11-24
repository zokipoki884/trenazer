// Bluetooth heart rate strap / watch (Heart Rate Service 0x180D).

export class HeartRate {
  constructor() {
    this.device = null;
    this.onData = () => {};
    this.onDisconnect = () => {};
  }

  get name() {
    return this.device?.name || 'Srčni utrip';
  }

  async connect() {
    if (!navigator.bluetooth) throw new Error('Ta brskalnik ne podpira Bluetooth (na iPadu uporabi Bluefy).');
    this.device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    this.device.addEventListener('gattserverdisconnected', () => this.onDisconnect());
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    const ch = await service.getCharacteristic('heart_rate_measurement');
    ch.addEventListener('characteristicvaluechanged', (e) => {
      const dv = e.target.value;
      const flags = dv.getUint8(0);
      const hr = flags & 0x01 ? dv.getUint16(1, true) : dv.getUint8(1);
      this.onData({ hr });
    });
    await ch.startNotifications();
  }

  disconnect() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
  }
}
