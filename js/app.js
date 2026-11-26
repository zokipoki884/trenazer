import { Trainer } from './ble/ftms.js';
import { HeartRate } from './ble/heartrate.js';
import { Simulator } from './ble/simulator.js';
import { SAMPLE_WORKOUTS } from './workout/samples.js';
import { MY_WORKOUTS } from './workout/my-workouts.js';
import { POLARIZED_WORKOUTS } from './workout/polarized-workouts.js';
import { totalDuration, stepAt, fractionAt, stepFraction, fmtTime, resolveWorkout, workoutStats } from './workout/model.js';
import { zoneFor, hrZoneFor } from './ui/zones.js';
import { drawChart } from './ui/chart.js';
import { encodeRideFit } from './fit/fit-encoder.js';

const pz = (cat) => POLARIZED_WORKOUTS.filter((w) => w.category === cat);
const WORKOUT_GROUPS = [
  ['Moje vaje (MyWhoosh)', MY_WORKOUTS],
  ['Polarized.cc – trde', pz('hard')],
  ['Polarized.cc – sweet spot', pz('sweetspot')],
  ['Polarized.cc – lahke (Z1/Z2)', pz('easy')],
  ['Testne vaje', SAMPLE_WORKOUTS],
];
const ALL_WORKOUTS = WORKOUT_GROUPS.flatMap(([, list]) => list);
const ERG_RELEASE_BELOW = 30; // rpm
const ERG_RESUME_ABOVE = 50; // rpm
const MIN_RIDE_RECORDS = 10; // seconds of riding before a ride can be saved

const $ = (id) => document.getElementById(id);

// ---------- Persistent settings ----------
function load(key, def) {
  try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); } catch { return def; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
}

// ---------- State ----------
const state = {
  ftp: load('ftp', 250),
  maxHr: load('maxHr', 185),
  raw: ALL_WORKOUTS.find((w) => w.id === load('workoutId', '')) || ALL_WORKOUTS[0],
  workout: null, // raw workout with watts converted to FTP fractions
  intensity: 1.0,
  elapsed: 0,
  running: false,
  finished: false,
  autoPaused: false,
  ergReleased: false, // ERG temporarily at 0 W because cadence dropped
  lastNow: performance.now(),
  trainer: null, // Trainer | Simulator
  hrDev: null,
  power: [], // [{at, w}] for 3 s average
  cadence: null,
  cadenceAt: 0,
  hr: null,
  hrAt: 0,
  actual: [], // [{t, w}] recorded each second for the chart
  lastRecorded: -1,
  lastSent: { w: null, at: 0, step: -1 },
  lastPower: null, // latest raw power sample {at, w}
  // Recorded ride for .fit export; survives page reloads via localStorage.
  ride: load('ride', null), // { name, ftp, startedAt, exported, records: [{t, power, hr, cad, step}] }
};
state.workout = resolveWorkout(state.raw, state.ftp);

// ---------- Device data ----------
function onTrainerData(d) {
  const now = performance.now();
  if (d.power != null) {
    state.power.push({ at: now, w: d.power });
    state.lastPower = { at: now, w: d.power };
    state.power = state.power.filter((p) => now - p.at <= 3000);
  }
  if (d.cadence != null) { state.cadence = d.cadence; state.cadenceAt = now; }
  if (d.hr != null && !state.hrDev && d.hr > 0) { state.hr = d.hr; state.hrAt = now; }
}
function onHrData(d) {
  state.hr = d.hr;
  state.hrAt = performance.now();
}

function avgPower() {
  const now = performance.now();
  const recent = state.power.filter((p) => now - p.at <= 3000);
  if (!recent.length) return null;
  return Math.round(recent.reduce((s, p) => s + p.w, 0) / recent.length);
}

function isMoving() {
  if (!state.trainer) return true; // no trainer: clock just runs
  const now = performance.now();
  const cadOk = state.cadence > 0 && now - state.cadenceAt < 3000;
  const pw = avgPower();
  return cadOk || (pw != null && pw > 20);
}

// ---------- Connect buttons ----------
function setDevBtn(btn, status, label) {
  btn.classList.toggle('on', status === 'on');
  btn.classList.toggle('busy', status === 'busy');
  btn.querySelector('.lbl').textContent = label;
}
function showMsg(text, kind = 'error') {
  const m = $('msg');
  m.textContent = text || '';
  m.classList.toggle('info', kind === 'info');
}
function errText(err) {
  if (!err) return 'neznana napaka';
  const name = err.name && err.name !== 'Error' ? `${err.name}: ` : '';
  return name + (err.message || String(err));
}

async function connectTrainer(dev, btn, defaultLabel) {
  showMsg('');
  setDevBtn(btn, 'busy', 'Povezujem…');
  dev.onData = onTrainerData;
  dev.onStatus = (t) => showMsg(t, 'info');
  dev.onDisconnect = () => {
    if (state.trainer === dev) state.trainer = null;
    setDevBtn(btn, 'off', defaultLabel);
    state.lastSent = { w: null, at: 0, step: -1 };
  };
  try {
    await dev.connect();
    state.trainer = dev;
    state.lastSent = { w: null, at: 0, step: -1 };
    setDevBtn(btn, 'on', dev.name + (dev.canControl ? ' · ERG' : ' · samo branje'));
    showMsg(dev.canControl || !dev.controlError ? '' : `Trenažer je povezan samo za branje. ${dev.controlError}`);
    askFtp();
  } catch (err) {
    console.error('Trainer connect failed', err);
    setDevBtn(btn, 'off', defaultLabel);
    if (err?.name === 'NotFoundError') {
      showMsg('Trenažer ni bil izbran ali najden. Zavrti pedala, da se zbudi, zapri MyWhoosh in poskusi znova.', 'info');
    } else {
      showMsg('Trenažer: ' + errText(err));
    }
  }
}

$('btnTrainer').onclick = () => {
  if (state.trainer && !(state.trainer instanceof Simulator)) { state.trainer.disconnect(); return; }
  if (state.trainer) state.trainer.disconnect();
  connectTrainer(new Trainer(), $('btnTrainer'), 'Poveži trenažer');
};
$('btnSim').onclick = () => {
  if (state.trainer instanceof Simulator) { state.trainer.disconnect(); return; }
  if (state.trainer) state.trainer.disconnect();
  connectTrainer(new Simulator(), $('btnSim'), 'Simulator');
};
$('btnHr').onclick = async () => {
  const btn = $('btnHr');
  if (state.hrDev) { state.hrDev.disconnect(); return; }
  showMsg('');
  const dev = new HeartRate();
  dev.onData = onHrData;
  dev.onDisconnect = () => {
    state.hrDev = null;
    setDevBtn(btn, 'off', 'Poveži srčni utrip');
  };
  setDevBtn(btn, 'busy', 'Povezujem…');
  try {
    await dev.connect();
    state.hrDev = dev;
    setDevBtn(btn, 'on', dev.name);
  } catch (err) {
    setDevBtn(btn, 'off', 'Poveži srčni utrip');
    if (err?.name !== 'NotFoundError') showMsg('Srčni utrip: ' + errText(err));
  }
};
if (!navigator.bluetooth) {
  showMsg('Ta brskalnik ne podpira Bluetooth. Na iPadu odpri aplikacijo v brskalniku Bluefy. Simulator deluje povsod.');
}

// ---------- Settings ----------
// Workout picker: cards with name, profile chart, duration, TSS and IF.
function selectWorkout(id) {
  const w = ALL_WORKOUTS.find((x) => x.id === id);
  if (!w) return;
  state.raw = w;
  state.workout = resolveWorkout(w, state.ftp);
  save('workoutId', w.id);
  updateWorkoutButton();
  reset();
}
function updateWorkoutButton() {
  $('workoutName').textContent = `${state.raw.name} · ${fmtTime(totalDuration(state.raw))}`;
  drawChart($('workoutMini'), state.workout, 0, [], 0, { marker: false });
}
function openPicker() {
  const list = $('pickerList');
  list.innerHTML = '';
  const cards = [];
  for (const [label, group] of WORKOUT_GROUPS) {
    if (!group.length) continue;
    const h = document.createElement('h3');
    h.textContent = label;
    const grid = document.createElement('div');
    grid.className = 'pickerGrid';
    for (const raw of group) {
      const w = resolveWorkout(raw, state.ftp);
      const st = workoutStats(w);
      const card = document.createElement('button');
      card.className = 'wCard' + (raw.id === state.raw.id ? ' selected' : '');
      card.innerHTML = `<span class="wName"></span><canvas></canvas>
        <span class="wMeta"><span>${fmtTime(totalDuration(w))}</span><span>${Math.round(st.tss)} TSS</span><span>IF ${st.ifactor.toFixed(2)}</span></span>`;
      card.querySelector('.wName').textContent = raw.name;
      card.onclick = () => {
        if (raw.id !== state.raw.id && state.elapsed > 0 && !confirm('Zamenjam vajo? Trenutni napredek se ponastavi.')) return;
        $('workoutModal').hidden = true;
        if (raw.id !== state.raw.id) selectWorkout(raw.id);
      };
      grid.appendChild(card);
      cards.push([card.querySelector('canvas'), w]);
    }
    list.append(h, grid);
  }
  $('workoutModal').hidden = false;
  // Draw after the modal is visible so canvases have their real size.
  for (const [canvas, w] of cards) drawChart(canvas, w, 0, [], 0, { marker: false });
  list.querySelector('.selected')?.scrollIntoView({ block: 'center' });
}
$('btnWorkout').onclick = openPicker;
$('pickerClose').onclick = () => { $('workoutModal').hidden = true; };
$('workoutModal').onclick = (e) => { if (e.target.id === 'workoutModal') $('workoutModal').hidden = true; };
updateWorkoutButton();

function setFtp(v) {
  if (!(v >= 50 && v <= 600)) return false;
  state.ftp = v;
  save('ftp', v);
  state.workout = resolveWorkout(state.raw, v);
  state.lastSent.step = -1;
  $('inpFtp').value = v;
  updateWorkoutButton();
  return true;
}
$('inpMaxHr').value = state.maxHr;
$('inpMaxHr').onchange = () => {
  const v = parseInt($('inpMaxHr').value, 10);
  if (v >= 100 && v <= 230) { state.maxHr = v; save('maxHr', v); }
  else $('inpMaxHr').value = state.maxHr;
};
$('inpFtp').value = state.ftp;
$('inpFtp').onchange = () => {
  if (!setFtp(parseInt($('inpFtp').value, 10))) $('inpFtp').value = state.ftp;
};

// Theme: auto (follows iPad setting) -> light -> dark.
const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'Tema: Auto', light: 'Tema: Svetla', dark: 'Tema: Temna' };
function applyTheme(t) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  $('btnTheme').textContent = THEME_LABEL[t];
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#111215' : '#f4f5f7';
}
let theme = load('theme', 'auto');
if (!THEMES.includes(theme)) theme = 'auto';
applyTheme(theme);
$('btnTheme').onclick = () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  save('theme', theme);
  applyTheme(theme);
  updateWorkoutButton();
};

// FTP dialog, shown after connecting the trainer.
function askFtp() {
  const inp = $('ftpModalInput');
  inp.value = state.ftp;
  $('ftpModal').hidden = false;
}
const bump = (d) => {
  const inp = $('ftpModalInput');
  inp.value = Math.min(600, Math.max(50, (parseInt(inp.value, 10) || state.ftp) + d));
};
$('ftpMinus').onclick = () => bump(-5);
$('ftpPlus').onclick = () => bump(5);
$('ftpOk').onclick = () => {
  if (setFtp(parseInt($('ftpModalInput').value, 10))) $('ftpModal').hidden = true;
  else $('ftpModalInput').value = state.ftp;
};
$('ftpModalInput').onkeydown = (e) => { if (e.key === 'Enter') $('ftpOk').click(); };

// ---------- Controls ----------
// Keep the screen on the whole time the page is open (Screen Wake Lock API).
// The lock is dropped by the browser when the page is hidden, so re-acquire it when it comes back.
let wakeLock = null;
function setWakeStatus(ok, detail = '') {
  const el = $('wakeStatus');
  el.classList.toggle('warn', !ok);
  el.textContent = ok
    ? '☀ Zaslon ostane prižgan'
    : '⚠ Zaslon se lahko ugasne – v nastavitvah naprave izklopi samodejno zaklepanje' + (detail ? ` (${detail})` : '');
}
async function keepAwake() {
  if (!('wakeLock' in navigator)) { setWakeStatus(false, 'brskalnik ne podpira'); return; }
  if (wakeLock && !wakeLock.released) return;
  if (document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { if (document.visibilityState === 'visible') setWakeStatus(false); });
    setWakeStatus(true);
  } catch (err) {
    setWakeStatus(false, err?.name || 'napaka');
  }
}
document.addEventListener('visibilitychange', keepAwake);
// Some browsers grant the lock only after a user gesture: retry on every tap until it holds.
document.addEventListener('pointerdown', keepAwake);
keepAwake();

function setRunning(on) {
  state.running = on;
  document.body.classList.toggle('running', on || state.elapsed > 0);
  document.body.classList.remove('showSetup');
  $('btnStart').textContent = on ? 'Pavza' : state.elapsed > 0 ? 'Nadaljuj' : 'Start';
  state.lastNow = performance.now();
  state.lastSent.step = -1; // force sending target on (re)start
  keepAwake();
}

$('btnStart').onclick = () => {
  if (state.finished) reset();
  if (!state.running && state.elapsed === 0 && !startNewRide()) return;
  setRunning(!state.running);
  if (!state.running) saveRide();
};

// ---------- Ride recording & .fit export ----------
function hasUnsavedRide() {
  return state.ride && !state.ride.exported && state.ride.records.length >= MIN_RIDE_RECORDS;
}
function startNewRide() {
  if (hasUnsavedRide() && !confirm('Prejšnja vožnja še ni shranjena (.fit). Jo zavržem in začnem novo?')) return false;
  state.ride = { name: state.raw.name, ftp: state.ftp, startedAt: Date.now(), exported: false, records: [] };
  saveRide();
  return true;
}
function saveRide() {
  save('ride', state.ride);
}
function recordSecond(stepIndex) {
  if (!state.ride || !(state.trainer || state.hrDev)) return;
  const now = performance.now();
  const p = state.lastPower && now - state.lastPower.at < 3000 ? state.lastPower.w : 0;
  const hr = state.hr != null && now - state.hrAt < 5000 ? state.hr : null;
  const cad = state.cadence != null && now - state.cadenceAt < 3000 ? Math.round(state.cadence) : 0;
  state.ride.records.push({ t: Date.now(), power: p, hr, cad, step: stepIndex });
  if (state.ride.records.length % 10 === 0) saveRide();
}

function fitFileName(ride) {
  const d = new Date(ride.startedAt);
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  const name = ride.name.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${date}_${name}.fit`;
}

async function exportFit() {
  const ride = state.ride;
  if (!ride || !ride.records.length) return;
  let bytes;
  try {
    bytes = encodeRideFit(ride.records, { ftp: ride.ftp });
  } catch (err) {
    alert('Izvoz ni uspel: ' + (err.message || err));
    return;
  }
  const name = fitFileName(ride);
  const file = new File([bytes], name, { type: 'application/octet-stream' });
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // On iPad: system share sheet -> "Shrani v Datoteke". Elsewhere: normal download.
  if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      markExported();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  markExported();
}
function markExported() {
  state.ride.exported = true;
  saveRide();
}
$('btnExport').onclick = exportFit;
$('btnReset').onclick = () => {
  if (state.elapsed > 0 && !confirm('Ponastavim vajo na začetek?')) return;
  reset();
};
$('btnMinus').onclick = () => changeIntensity(-0.05);
$('btnPlus').onclick = () => changeIntensity(0.05);
$('btnSetup').onclick = () => document.body.classList.toggle('showSetup');

function changeIntensity(d) {
  state.intensity = Math.round(Math.min(1.5, Math.max(0.5, state.intensity + d)) * 100) / 100;
  $('intensity').textContent = Math.round(state.intensity * 100) + '%';
  state.lastSent.step = -1;
}

function reset() {
  state.elapsed = 0;
  state.finished = false;
  state.actual = [];
  state.lastRecorded = -1;
  setRunning(false);
  document.body.classList.remove('running', 'paused');
}

// ---------- Main loop ----------
function targetWatts(info) {
  return Math.round(fractionAt(info.step, info.inStep) * state.ftp * state.intensity);
}

function tick() {
  const now = performance.now();
  const dt = (now - state.lastNow) / 1000;
  state.lastNow = now;
  const total = totalDuration(state.workout);

  if (state.running) {
    const moving = isMoving();
    state.autoPaused = !moving;
    if (moving) state.elapsed += dt;
    if (state.elapsed >= total) {
      state.elapsed = total;
      state.finished = true;
      setRunning(false);
      saveRide();
      $('btnStart').textContent = 'Znova';
    }
  } else {
    state.autoPaused = false;
  }

  const info = stepAt(state.workout, state.elapsed);
  const target = targetWatts(info);

  // ERG release: cadence < 30 rpm -> 0 W so you can spin up again; > 50 rpm -> back to target.
  if (state.trainer && state.cadence != null) {
    const cad = now - state.cadenceAt < 3000 ? state.cadence : 0;
    if (cad < ERG_RELEASE_BELOW) state.ergReleased = true;
    else if (cad > ERG_RESUME_ABOVE) state.ergReleased = false;
  } else {
    state.ergReleased = false;
  }

  // ERG: send target on step change / release change, on change of value (ramps) at most every 2 s.
  if (state.trainer && state.running) {
    const ls = state.lastSent;
    const sendW = state.ergReleased ? 0 : target;
    if (ls.step !== info.index || ls.released !== state.ergReleased || (sendW !== ls.w && now - ls.at >= 2000)) {
      state.trainer.setTargetPower(sendW);
      state.lastSent = { w: sendW, at: now, step: info.index, released: state.ergReleased };
    }
  }

  // Record actual power once per second of workout time.
  const sec = Math.floor(state.elapsed);
  if (state.running && !state.autoPaused && sec > state.lastRecorded) {
    const p = avgPower();
    if (p != null) state.actual.push({ t: state.elapsed, w: p });
    state.lastRecorded = sec;
    recordSecond(info.index);
  }

  render(info, target, total);
}

function render(info, target, total) {
  const n = state.ride ? state.ride.records.length : 0;
  const exp = $('btnExport');
  exp.hidden = n < MIN_RIDE_RECORDS || state.running;
  exp.textContent = state.ride?.exported ? 'Shrani znova (.fit) ✓' : `Shrani vožnjo (.fit) · ${fmtTime(n)}`;

  document.body.classList.toggle('paused', (state.running && state.autoPaused) || (!state.running && state.elapsed > 0 && !state.finished));

  const now = performance.now();
  const p = avgPower();
  const pEl = $('power');
  pEl.textContent = p == null ? '--' : p;
  const erg = state.running && !state.ergReleased;
  pEl.classList.toggle('low', p != null && erg && p < target * 0.9);
  pEl.classList.toggle('high', p != null && erg && p > target * 1.1);
  $('target').textContent = target;
  const released = state.running && state.ergReleased && !!state.trainer;
  document.body.classList.toggle('ergReleased', released);
  $('pausedTag').textContent = released ? 'ERG 0 W · zavrti nad 50 rpm' : 'PAVZA';

  const hrFresh = state.hr != null && now - state.hrAt < 5000;
  $('hr').textContent = hrFresh ? state.hr : '--';
  const hz = $('hrZone');
  hz.classList.toggle('off', !hrFresh);
  if (hrFresh) {
    const z = hrZoneFor(state.hr, state.maxHr);
    hz.style.setProperty('--hrz', z.color);
    $('hrZoneTxt').textContent = z.name;
  } else {
    $('hrZoneTxt').textContent = '–';
  }
  const cadFresh = state.cadence != null && now - state.cadenceAt < 3000;
  $('cad').textContent = cadFresh ? Math.round(state.cadence) : state.trainer ? '0' : '--';

  $('elapsed').textContent = fmtTime(state.elapsed);
  $('remainingTotal').textContent = '-' + fmtTime(total - state.elapsed);

  // Current step
  const st = info.step;
  const curF = fractionAt(st, info.inStep);
  const zone = zoneFor(stepFraction(st));
  $('curZone').textContent = zone.name;
  $('curZone').style.background = zone.color;
  $('curName').textContent = st.name;
  $('curCount').textContent = `${info.index + 1}/${state.workout.steps.length}`;
  const pctTxt = st.watts != null
    ? (st.wattsEnd != null ? `${st.watts}→${st.wattsEnd} W` : `${st.watts} W`)
    : st.powerEnd != null
    ? `${Math.round(st.power * 100)}→${Math.round(st.powerEnd * 100)}% FTP`
    : `${Math.round(curF * 100)}% FTP`;
  $('curPct').textContent = pctTxt + (state.intensity !== 1 ? ` · intenzivnost ${Math.round(state.intensity * 100)}%` : '');
  $('countdown').textContent = fmtTime(Math.ceil(info.remaining - 1e-6));
  $('countdown').classList.toggle('soon', state.running && info.remaining <= 5 && !!info.next);
  const bar = $('progress');
  bar.style.width = (info.inStep / st.duration) * 100 + '%';
  bar.style.background = zone.color;

  // Next step
  const nx = info.next;
  $('nextRow').classList.toggle('hidden', !nx);
  if (nx) {
    const nz = zoneFor(stepFraction(nx));
    $('nextZone').textContent = nz.name;
    $('nextZone').style.background = nz.color;
    $('nextW').textContent = Math.round(nx.power * state.ftp * state.intensity) +
      (nx.powerEnd != null ? '→' + Math.round(nx.powerEnd * state.ftp * state.intensity) : '');
    $('nextDur').textContent = fmtTime(nx.duration);
  }

  drawChart($('chart'), state.workout, state.elapsed, state.actual, state.ftp * state.intensity);
}

window.__trenazer = state; // for debugging from the console
setInterval(tick, 250);
window.addEventListener('resize', tick);
tick();
