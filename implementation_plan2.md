# Bearing Signal Simulation Web App — Complete Build Specification

> **Purpose**: This document is a self-contained spec. Any agent can use it to build the full project from scratch without needing to read the original notebook or PDF.

## Tech Stack
- **Backend**: Python, FastAPI, WebSockets (for real-time streaming)
- **Data Science/Math**: NumPy, SciPy, Pandas
- **Frontend**: Vanilla HTML/CSS/JS (no heavy framework required, keeps it lightweight and fast)
- **Charting**: ECharts (highly optimized for rendering thousands of sensor data points in real-time)

## Project Location
```
E:\youcef admane\Simulation_Signaux_Roulement\Simulation_Signaux_Roulement\
```

## Existing Files (DO NOT MODIFY)
- `Simulation signaux-roulement PFE6.ipynb` — Original notebook (reference only)
- `chapitre2pfee (2).pdf` — Thesis chapter (reference only)
- `CWRU/` — CWRU bearing dataset (.mat, .npy files)
- `Bearing_Dataset/` — Classified fault segments (.npy files by class)
- `Website_Architecture_Guide.md` — High-level roadmap

---

## 1. PHYSICS EQUATIONS (from notebook & thesis)

### 1.1 Bearing Characteristic Frequencies (Harris Theory)
Given: `Nb` (number of balls), `d` (ball diameter, m), `D` (pitch diameter, m), `phi` (contact angle, rad), `fr` (shaft rotation frequency, Hz):

```python
BPFO = (Nb/2) * fr * (1 - d/D * cos(phi))   # Ball Pass Freq Outer Race
BPFI = (Nb/2) * fr * (1 + d/D * cos(phi))   # Ball Pass Freq Inner Race
BSF  = (D/(2*d)) * fr * (1 - (d/D * cos(phi))**2)  # Ball Spin Freq
FTF  = 0.5 * fr * (1 - d/D * cos(phi))      # Fund. Train (Cage) Freq
```

### 1.2 Default Parameters (CWRU SKF 6205 bearing)
```python
fs = 12000    # Sampling frequency (Hz)
T  = 2.0      # Signal duration (s)
Nb = 8        # Number of balls
d  = 8e-3     # Ball diameter (m)
D  = 40e-3    # Pitch diameter (m)
phi = 0       # Contact angle (rad)
fr = 30       # Shaft rotation frequency (Hz)
fn = 3000     # Structural natural frequency (Hz)
zeta = 0.02   # Damping ratio
```

With these defaults: BPFO=96Hz, BPFI=144Hz, BSF=72Hz, FTF=12Hz.

### 1.3 Impulse Response (SDOF model)
Each defect impact excites a structural resonance:
```python
wn = 2 * pi * fn
wd = wn * sqrt(1 - zeta**2)
h(t) = exp(-zeta * wn * t) * sin(wd * t)
```

### 1.4 Defect Signal Generation
Impact pulse train at characteristic frequency, convolved with impulse response:
```python
def defect_signal(f_def, t, fs, T, h, amplitude=1.0, jitter=0.0):
    impacts = zeros_like(t)
    impact_times = arange(0, T, 1/f_def)
    for ti in impact_times:
        idx = int(ti * fs + jitter * random.randn())
        if 0 <= idx < len(impacts):
            impacts[idx] += amplitude
    return signal.fftconvolve(impacts, h, mode='same')
```

### 1.5 Healthy Signal
```python
healthy = 0.05 * random.randn(len(t))  # Gaussian noise baseline
```

### 1.6 Enhanced Realism (from notebook sections 5-6)
- **Colored/structural noise**: SNR-calibrated (`snr_db` parameter)
- **Rotational harmonics**: Add `fr`, `2*fr`, `3*fr` sine components
- **AM modulation**: Amplitude modulated at `fr` for inner race faults
- **FM modulation**: Small frequency variations
- **Non-linearity**: Progressive distortion for severe faults

### 1.7 Severity Model
Severity = 0.0 to 1.0, controlling:
- `amplitude`: base_amp * (0.1 + 0.9 * severity)
- `jitter`: max_jitter * (1.0 - severity)  — less jitter = more severe/clear
- `snr_db`: decreases with severity (more noise from damage)
- Non-linearity coefficient increases with severity

### 1.8 Feature Extraction
```python
# RMS
rms = sqrt(mean(sig**2))

# Kurtosis
kurtosis = pd.Series(sig).kurtosis()

# Skewness
skewness = pd.Series(sig).skew()

# PSD (Power Spectral Density)
freqs, psd = scipy.signal.welch(sig, fs=fs, nperseg=nperseg)

# Envelope Spectrum (Hilbert Transform)
analytic = scipy.signal.hilbert(sig)
envelope = abs(analytic)
envelope -= mean(envelope)
env_fft = abs(fft.rfft(envelope))
env_freqs = fft.rfftfreq(len(envelope), 1/fs)
```

---

## 2. FILES TO CREATE

### 2.1 `core/__init__.py`
Empty file to make `core` a Python package.

### 2.2 `core/physics.py`
```
- bearing_freqs(fr, Nb, d, D, phi=0) -> dict{BPFO, BPFI, BSF, FTF}
- impulse_response(t, fn=3000, zeta=0.02) -> ndarray
- DEFAULT_PARAMS dict with all defaults from section 1.2
```

### 2.3 `core/generator.py`
```
- generate_healthy_signal(t, fr, snr_db=20) -> ndarray
    Gaussian noise + rotational harmonics (1x,2x,3x fr)
    
- generate_defect_signal(t, f_def, h, amplitude, jitter, fr, snr_db,
                         am_mod=False, fm_mod=False) -> ndarray
    Impact train → convolve with h → add AM/FM → add noise
    
- generate_signal(signal_type, params_dict) -> (t, signal)
    Factory: signal_type in ['Healthy','OuterRace','InnerRace','Ball','Cage']
    params_dict contains all parameters + severity (0.0-1.0)
```

### 2.4 `core/features.py`
```
- compute_time_stats(sig) -> dict{rms, kurtosis, skewness, crest_factor, peak_to_peak}
- compute_psd(sig, fs, nperseg=1024) -> (freqs, psd)
- compute_envelope_spectrum(sig, fs) -> (freqs, magnitudes)
- compute_all_features(sig, fs) -> dict with all above
```

### 2.5 `core/simulation_engine.py`
```
class BearingSimulator:
    def __init__(self, **params):  # accepts all params from 1.2
        self.params = {**DEFAULT_PARAMS, **params}
        self._compute_freqs()
        self._compute_impulse_response()
    
    def simulate(self, signal_type='Healthy', severity=0.0, duration=2.0):
        -> dict{time, signal, features, freqs, params}
    
    def stream_chunk(self, signal_type, severity, chunk_duration=0.1):
        -> dict{time, signal, features}  (single chunk for streaming)
```

### 2.6 `app.py` (FastAPI Backend)
```python
# FastAPI app with:

GET  /                -> serves static/index.html
GET  /api/params      -> returns DEFAULT_PARAMS + param descriptions
POST /api/simulate    -> body: {signal_type, severity, duration, ...params}
                         returns: {time[], signal[], features{}, char_freqs{}}
WS   /ws/stream       -> accepts JSON params on connect
                         streams signal chunks every 100ms
                         client can send {action:'inject_fault', type, severity}

# Mount static files: app.mount("/static", StaticFiles(directory="static"))
# CORS: allow all origins for dev
# Use uvicorn to run: uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### 2.7 `requirements.txt`
```
numpy
scipy
pandas
fastapi
uvicorn[standard]
websockets
```

### 2.8 `static/index.html`
Premium dark engineering dashboard. Structure:
```
<body>
  <!-- Top Bar: Logo + Title "Bearing Signal Simulator" + Status -->
  <header id="top-bar">...</header>
  
  <!-- Main Layout: 3-column grid -->
  <main id="dashboard">
    <!-- Left Panel: Parameter Controls -->
    <aside id="params-panel">
      - Bearing geometry inputs (Nb, d, D, phi)
      - Kinematics (fr, fs)
      - System (fn, zeta)
      - Fault type selector (radio/select)
      - Severity slider (0-100%)
      - SNR slider
      - Duration input
      - "Simulate" button (static mode)
      - "Start Stream" / "Stop Stream" buttons
      - "Inject Fault" button (during streaming)
    </aside>
    
    <!-- Center: Charts -->
    <section id="charts-panel">
      - Time-domain chart (oscilloscope style, scrolling in stream mode)
      - Frequency spectrum (PSD)
      - Envelope spectrum
    </section>
    
    <!-- Right Panel: Health Dashboard -->
    <aside id="health-panel">
      - Traffic light indicator (green/yellow/red)
      - RMS gauge
      - Kurtosis gauge
      - Crest Factor display
      - Characteristic frequencies display
      - Diagnostic message area
      - Maintenance suggestion area
    </aside>
  </main>
</body>
```

### 2.9 `static/style.css`
Design system:
```css
/* Color palette */
--bg-primary: #0a0e17;        /* Deep navy/black */
--bg-secondary: #111827;       /* Dark card bg */
--bg-glass: rgba(17,24,39,0.7); /* Glassmorphism */
--accent-primary: #3b82f6;     /* Blue */
--accent-success: #10b981;     /* Green */
--accent-warning: #f59e0b;     /* Amber */
--accent-danger: #ef4444;      /* Red */
--text-primary: #f9fafb;
--text-secondary: #9ca3af;
--border-glass: rgba(255,255,255,0.1);

/* Typography: Google Fonts Inter or Outfit */
/* Glassmorphism cards: backdrop-filter: blur(12px); border-radius: 16px; */
/* Responsive: CSS Grid with min 1024px, stack on mobile */
/* Micro-animations: transitions on hover, smooth chart updates */
/* Charts: dark background, neon-glow accent lines */
```

### 2.10 `static/app.js`
```javascript
// ECharts instances for 3 charts
// REST: fetch('/api/simulate', {method:'POST', body: paramsJSON})
// WebSocket: new WebSocket('ws://localhost:8000/ws/stream')
//   - On open: send params
//   - On message: parse chunk, append to charts, update health panel
//   - Scrolling window: keep last N seconds visible
// Health logic:
//   - Kurtosis > 6 → WARNING (yellow)
//   - Kurtosis > 15 → DANGER (red)
//   - RMS thresholds for severity estimation
// Load ECharts from CDN: https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js
// Load Inter font from Google Fonts
```

---

## 3. HEALTH DIAGNOSTIC THRESHOLDS (Basic)

| Indicator | Normal (Green) | Warning (Yellow) | Danger (Red) |
|-----------|---------------|-------------------|--------------|
| Kurtosis  | < 4           | 4 – 10            | > 10         |
| RMS       | < 0.1         | 0.1 – 0.3        | > 0.3        |
| Crest Factor | < 4        | 4 – 6             | > 6          |

Diagnostic messages:
- Green: "Bearing operating normally. No anomalies detected."
- Yellow: "Early-stage defect suspected. Schedule inspection within 30 days."
- Red: "Significant defect detected. Immediate inspection required. Plan bearing replacement."

Fault identification (from envelope spectrum peak matching):
- Peak near BPFO → "Outer race defect detected"
- Peak near BPFI → "Inner race defect detected"  
- Peak near BSF → "Ball/rolling element defect detected"
- Peak near FTF → "Cage defect detected"

---

## 4. BUILD ORDER

1. Install dependencies: `pip install -r requirements.txt`
2. Create `core/__init__.py`, `core/physics.py`, `core/generator.py`, `core/features.py`, `core/simulation_engine.py`
3. Test core: `python -c "from core.simulation_engine import BearingSimulator; s=BearingSimulator(); print(s.simulate())"`
4. Create `app.py`
5. Create `static/` directory with `index.html`, `style.css`, `app.js`
6. Run: `cd "E:\youcef admane\Simulation_Signaux_Roulement\Simulation_Signaux_Roulement" && uvicorn app:app --reload --port 8000`
7. Open: `http://localhost:8000`

---

## 5. KEY DESIGN DECISIONS

- **No ML/DL** in this iteration — threshold-based diagnostics only
- **No CWRU comparison** in this iteration — focus on simulation
- **ECharts** for charts (performance with thousands of points)
- **WebSocket chunk**: 0.1s of signal data per message
- **Severity 0-1 float** mapped to amplitude/jitter/noise parameters
- **All processing server-side** — frontend only renders
- The PDF `chapitre2pfee (2).pdf` contains the theoretical background (Harris bearing theory, McFadden & Smith single-point defect model, envelope analysis theory) that is already captured in the equations above
