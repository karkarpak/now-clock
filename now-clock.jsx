// Now — meditation clock app
// Quartz second hand (1s jumps + audible tick). Radial ring of "NOW".
// In-app settings: tap the center cap to open.

const { useState, useEffect, useRef, useCallback } = React;

const DEFAULTS = /*EDITMODE-BEGIN*/{
  "word": "NOW",
  "palette": "paper",
  "hand": "red",
  "soundOn": true,
  "tickStyle": "wood",
  "volume": 0.35,
  "fontWeight": 500,
  "paused": false
}/*EDITMODE-END*/;

const PALETTES = [
  { id: "paper", bg: "#f1ece4", ink: "#1a1a1a" },
  { id: "bone",  bg: "#f6f3ee", ink: "#171717" },
  { id: "mist",  bg: "#e9eef0", ink: "#102025" },
  { id: "night", bg: "#15161a", ink: "#ebe7df" },
];
const HANDS = [
  { id: "red",   color: "#c8261d" },
  { id: "black", color: "#1a1a1a" },
  { id: "brass", color: "#b07a18" },
];
const TICK_STYLES = ["wood", "soft", "muyu"];

// ─── Persistent settings (localStorage) ──────────────────────────────────────
function useSettings(defaults) {
  const KEY = "nowclock:v1";
  const [s, setS] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
      if (parsed.tickStyle === "crisp") parsed.tickStyle = "muyu"; // migrate old value
      return parsed;
    } catch (e) { return { ...defaults }; }
  });
  const set = useCallback((k, v) => {
    setS((prev) => {
      const next = (typeof k === "object") ? { ...prev, ...k } : { ...prev, [k]: v };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
      return next;
    });
  }, []);
  const reset = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch (e) {}
    setS({ ...defaults });
  }, []);
  return [s, set, reset];
}

// ─── Audio: synthesized quartz tick ───────────────────────────────────────────
let _audioCtx = null;
function ensureAudio() {
  if (!_audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    _audioCtx = new AC();
  }
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
}

function playTick({ style = "wood", volume = 0.35 } = {}) {
  const ctx = ensureAudio();
  const t = ctx.currentTime;

  const dur = 0.045;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = Math.exp(-i / (data.length * 0.18));
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;

  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  if (style === "wood") {
    filter.type = "bandpass"; filter.frequency.value = 2200; filter.Q.value = 4.5;
    gain.gain.value = volume * 0.9;
  } else if (style === "soft") {
    filter.type = "lowpass"; filter.frequency.value = 1400; filter.Q.value = 1;
    gain.gain.value = volume * 0.7;
  } else if (style === "muyu") {
    // wooden fish (muyu): hollow, low-pitched knock
    filter.type = "bandpass"; filter.frequency.value = 520; filter.Q.value = 5;
    gain.gain.value = volume * 0.6;
  }

  src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  src.start(t);

  if (style === "wood") {
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = 880;
    og.gain.setValueAtTime(volume * 0.4, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(og).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.08);
  } else if (style === "muyu") {
    // low resonant wooden body with a downward pitch drop
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.09);
    og.gain.setValueAtTime(volume * 0.95, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(og).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.17);
  }
}

// ─── Ring of radially-arranged words ──────────────────────────────────────────
function Ring({ count = 60, word = "NOW" }) {
  const items = [];
  const letters = word.split("");
  for (let i = 0; i < count; i++) {
    const angle = i * (360 / count);
    items.push(
      <div key={i} className="slot" style={{ transform: `rotate(${angle}deg)` }}>
        <div className="word">
          {letters.map((c, j) => <span key={j}>{c}</span>)}
        </div>
      </div>
    );
  }
  return <div className="ring ring--outer">{items}</div>;
}

// ─── Quartz second hand (cumulative degrees → smooth 59→0) ────────────────────
function useQuartzSecond(onTick, paused) {
  const [deg, setDeg] = useState(() => new Date().getSeconds() * 6);
  const cbRef = useRef(onTick);
  cbRef.current = onTick;

  useEffect(() => {
    if (paused) return;
    let timer;
    setDeg((d) => {
      const turns = Math.floor(d / 360);
      return turns * 360 + new Date().getSeconds() * 6;
    });
    const step = () => {
      setDeg((d) => d + 6);
      if (cbRef.current) cbRef.current(new Date().getSeconds());
      const ms = new Date().getMilliseconds();
      timer = setTimeout(step, 1000 - ms + 2);
    };
    const ms = new Date().getMilliseconds();
    timer = setTimeout(step, 1000 - ms + 2);
    return () => clearTimeout(timer);
  }, [paused]);

  return deg;
}

// ─── Settings panel UI (matches reference Tweaks panel) ───────────────────────
function Toggle({ on, onChange }) {
  return (
    <button className="twk-toggle" data-on={on ? "1" : "0"} onClick={() => onChange(!on)}>
      <i></i>
    </button>
  );
}

function Segmented({ options, value, onChange }) {
  const i = Math.max(0, options.indexOf(value));
  const w = `calc((100% - 4px) / ${options.length})`;
  return (
    <div className="twk-seg">
      <div className="twk-seg-thumb" style={{ left: `calc(2px + ${i} * ${w})`, width: w }}></div>
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

function SettingsSheet({ s, set, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onDown = (e) => {
      // close on click outside the panel (but not when clicking the cap that opened it)
      if (panelRef.current && !panelRef.current.contains(e.target) &&
          !e.target.closest(".cap-hit")) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <React.Fragment>
      <div className="twk-scrim"></div>
      <div className="twk-panel" ref={panelRef}>
        <div className="twk-grab"></div>
        <div className="twk-hd">
          <b>Tweaks</b>
          <button className="twk-x" aria-label="Close" onClick={onClose}>✕</button>
        </div>
      <div className="twk-body">
        <div className="twk-sect">Word</div>
        <div className="twk-row">
          <div className="twk-lbl"><span>Repeat</span></div>
          <input className="twk-field" type="text" value={s.word} maxLength={6}
            onChange={(e) => set("word", (e.target.value || "").toUpperCase().slice(0, 6))}
            onBlur={(e) => { if (!e.target.value) set("word", "NOW"); }} />
        </div>
        <div className="twk-row">
          <div className="twk-lbl"><span>Weight</span><span className="twk-val">{s.fontWeight}</span></div>
          <input className="twk-slider" type="range" min={100} max={900} step={10}
            value={s.fontWeight} onChange={(e) => set("fontWeight", +e.target.value)} />
        </div>

        <div className="twk-sect">Palette</div>
        <div className="twk-row">
          <div className="twk-lbl"><span>Paper</span></div>
          <select className="twk-field" value={s.palette} onChange={(e) => set("palette", e.target.value)}>
            {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
          </select>
        </div>
        <div className="twk-row">
          <div className="twk-lbl"><span>Hand</span></div>
          <select className="twk-field" value={s.hand} onChange={(e) => set("hand", e.target.value)}>
            {HANDS.map((h) => <option key={h.id} value={h.id}>{h.id}</option>)}
          </select>
        </div>

        <div className="twk-sect">Motion</div>
        <div className="twk-row twk-row-h">
          <span>Pause clock</span>
          <Toggle on={s.paused} onChange={(v) => set("paused", v)} />
        </div>

        <div className="twk-sect">Sound</div>
        <div className="twk-row twk-row-h">
          <span>Tick</span>
          <Toggle on={s.soundOn} onChange={(v) => set("soundOn", v)} />
        </div>
        {s.soundOn && (
          <React.Fragment>
            <div className="twk-row">
              <div className="twk-lbl"><span>Style</span></div>
              <Segmented options={TICK_STYLES} value={s.tickStyle} onChange={(v) => set("tickStyle", v)} />
            </div>
            <div className="twk-row">
              <div className="twk-lbl"><span>Volume</span><span className="twk-val">{s.volume.toFixed(2)}</span></div>
              <input className="twk-slider" type="range" min={0} max={1} step={0.05}
                value={s.volume} onChange={(e) => set("volume", +e.target.value)} />
            </div>
          </React.Fragment>
        )}
        </div>
      </div>
    </React.Fragment>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [s, set, reset] = useSettings(DEFAULTS);
  const [started, setStarted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    document.body.className = `palette-${s.palette} hand-${s.hand}`;
  }, [s.palette, s.hand]);

  const onTick = () => {
    if (!started || !s.soundOn) return;
    playTick({ style: s.tickStyle, volume: s.volume });
  };
  const handDeg = useQuartzSecond(onTick, s.paused || !started);

  useEffect(() => {
    const btn = document.getElementById("start");
    const veil = document.getElementById("veil");
    const begin = () => {
      ensureAudio();
      veil.setAttribute("data-hidden", "true");
      setStarted(true);
    };
    btn.addEventListener("click", begin);
    return () => btn.removeEventListener("click", begin);
  }, []);

  const handStyle = { transform: `rotate(${handDeg}deg)` };
  const wordStyle = { "--now-weight": s.fontWeight };

  return (
    <div className="stage">
      <div className="disc"></div>

      <div style={wordStyle}>
        <Ring count={60} word={s.word} />
      </div>

      <div className="hand-layer">
        <div className="second-stem" style={handStyle}>
          <div className="second-tip"></div>
          <div className="second-tail"></div>
        </div>
        <div className="cap">
          <div className="cap-mounts">
            <i style={{ left: "12%", top: "32%" }}></i>
            <i style={{ right: "12%", top: "32%" }}></i>
          </div>
        </div>
        <button className="cap-hit" aria-label="Settings"
          onClick={() => setSettingsOpen((o) => !o)}>
          <span className="cap-halo"></span>
        </button>
      </div>

      {settingsOpen && (
        <SettingsSheet s={s} set={set} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
