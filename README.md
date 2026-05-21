# 🔧 Bearing Signal Simulator — Vibration Analysis & Fault Diagnosis

A professional-grade web application for simulating rolling-element bearing vibration signals, performing real-time spectral analysis, and diagnosing mechanical faults. Built as part of a PFE (Projet de Fin d'Études) on condition monitoring using vibration analysis.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Theoretical Background](#2-theoretical-background)
3. [Architecture & Tech Stack](#3-architecture--tech-stack)
4. [Project Structure](#4-project-structure)
5. [Installation & Setup](#5-installation--setup)
6. [How to Use the Application](#6-how-to-use-the-application)
7. [Parameter Reference](#7-parameter-reference)
8. [Understanding the Charts](#8-understanding-the-charts)
9. [Health Diagnostics System](#9-health-diagnostics-system)
10. [Signal Generation Pipeline](#10-signal-generation-pipeline)
11. [API Reference](#11-api-reference)
12. [Deployment](#12-deployment)
13. [FAQ](#13-faq)

---

## 1. Project Overview

This application simulates vibration signals from rolling-element bearings under both healthy and faulty conditions. It allows users to:

- **Configure bearing geometry** (number of balls, diameters, contact angle)
- **Simulate 5 operating states**: Healthy, Outer Race fault, Inner Race fault, Ball fault, Cage fault
- **Control fault severity** from 0% (barely detectable) to 100% (catastrophic)
- **Visualize signals** in time-domain, frequency-domain (PSD), and envelope spectrum
- **Stream data in real-time** via WebSocket with live-updating charts
- **Receive automated health diagnostics** with traffic-light indicators and maintenance recommendations

The physics model is based on **Harris bearing theory** and the **McFadden & Smith single-point defect model**, as described in the thesis chapter `chapitre2pfee (2).pdf`.

---

## 2. Theoretical Background

### 2.1 What Is Vibration-Based Bearing Diagnosis?

When a bearing has a defect (crack, spall, pit) on one of its components, every time a rolling element passes over that defect, it creates a mechanical **impact**. This impact excites the bearing housing structure, causing it to "ring" at its natural frequency. By analyzing the **repetition rate** of these impacts, we can determine exactly which bearing component is damaged.

### 2.2 Bearing Characteristic Frequencies (Harris Theory)

Every bearing has four **Characteristic Defect Frequencies** that are strictly determined by its geometry and shaft speed:

| Frequency | Name | Formula | What It Means |
|-----------|------|---------|---------------|
| **BPFO** | Ball Pass Frequency Outer Race | `(Nb/2) × fr × (1 − d/D × cos(φ))` | How often a ball passes over a defect on the **outer ring** |
| **BPFI** | Ball Pass Frequency Inner Race | `(Nb/2) × fr × (1 + d/D × cos(φ))` | How often a ball passes over a defect on the **inner ring** |
| **BSF** | Ball Spin Frequency | `(D/2d) × fr × (1 − (d/D × cos(φ))²)` | How often a ball **rotates on its own axis** (defect on ball surface) |
| **FTF** | Fundamental Train Frequency | `0.5 × fr × (1 − d/D × cos(φ))` | How fast the **cage** rotates |

Where:
- `Nb` = number of rolling elements (balls)
- `fr` = shaft rotation frequency (Hz)
- `d` = ball diameter (m)
- `D` = pitch diameter (m)
- `φ` = contact angle (rad)

**Key Insight**: If a defect exists on the outer race, impacts will repeat at exactly BPFO Hz. If it's on the inner race, they repeat at BPFI Hz. This is the mathematical foundation of bearing fault diagnosis.

### 2.3 Default Bearing: SKF 6205 (CWRU Dataset)

The default parameters correspond to the SKF 6205-2RS deep groove ball bearing used in the famous **Case Western Reserve University (CWRU)** bearing dataset:

| Parameter | Value |
|-----------|-------|
| Number of balls (Nb) | 8 |
| Ball diameter (d) | 8 mm |
| Pitch diameter (D) | 40 mm |
| Contact angle (φ) | 0° |
| Shaft speed (fr) | 30 Hz (1800 RPM) |

This yields: **BPFO = 96 Hz**, **BPFI = 144 Hz**, **BSF = 72 Hz**, **FTF = 12 Hz**

### 2.4 Impulse Response Model (SDOF)

When a ball hits a defect, the bearing housing structure vibrates. This is modeled as a **Single-Degree-of-Freedom (SDOF) damped oscillator**:

```
h(t) = e^(-ζ·ωn·t) × sin(ωd·t)
```

Where:
- `ωn = 2π × fn` — natural angular frequency
- `ωd = ωn × √(1 − ζ²)` — damped natural frequency
- `fn` — natural frequency of the structure (default: 3000 Hz)
- `ζ` — damping ratio (default: 0.02)

Each impact creates a short burst of high-frequency oscillation (the "ringing") that decays exponentially. The damping ratio controls how quickly this ringing dies out.

### 2.5 Envelope Analysis (Hilbert Transform)

The raw vibration signal contains both:
1. **High-frequency content** — the structural ringing at ~3000 Hz
2. **Low-frequency content** — the repetition rate of impacts (the fault frequency)

**Envelope analysis** separates these two:
1. Apply the **Hilbert Transform** to get the analytic signal
2. Take the absolute value to get the **envelope** (the amplitude modulation)
3. Compute the FFT of the envelope to get the **envelope spectrum**

The envelope spectrum reveals peaks at the characteristic defect frequencies, enabling precise fault identification.

---

## 3. Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Params   │  │  ECharts │  │  ECharts │  │   Health     │  │
│  │  Panel    │  │  Time    │  │  PSD +   │  │   Monitor    │  │
│  │  (HTML)   │  │  Domain  │  │  Envelope│  │   Panel      │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │              │             │               │           │
│       └──────────────┴─────────────┴───────────────┘           │
│                    REST (POST) / WebSocket                      │
└───────────────────────────┬────────────────────────────────────┘
                            │
┌───────────────────────────┴────────────────────────────────────┐
│                      FastAPI Server (Python)                    │
│                                                                 │
│  POST /api/simulate ──► BearingSimulator.simulate()             │
│  WS   /ws/stream    ──► BearingSimulator.stream_chunk()         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    core/ Package                         │   │
│  │  physics.py ──► Characteristic frequencies, impulse resp │   │
│  │  generator.py ► Signal generation (healthy + faults)     │   │
│  │  features.py ── Feature extraction (stats, PSD, envelope)│   │
│  │  simulation_engine.py ► Orchestration + streaming buffer │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend | Python 3.11+ | Core simulation logic |
| Web Framework | FastAPI | REST API + WebSocket |
| Math Libraries | NumPy, SciPy, Pandas | Signal processing & FFT |
| Frontend | Vanilla HTML/CSS/JS | Dashboard UI |
| Charting | ECharts 5 (CDN) | High-performance rendering |
| Typography | Inter, JetBrains Mono | Professional typography |

---

## 4. Project Structure

```
Simulation_Signaux_Roulement/
├── core/                          # Python simulation package
│   ├── __init__.py
│   ├── physics.py                 # Harris frequencies + impulse response
│   ├── generator.py               # Signal generation engine
│   ├── features.py                # Feature extraction (RMS, PSD, envelope)
│   └── simulation_engine.py       # BearingSimulator orchestrator
├── static/                        # Frontend assets
│   ├── index.html                 # Dashboard layout
│   ├── style.css                  # Design system (dark theme)
│   └── app.js                     # Chart rendering + API integration
├── app.py                         # FastAPI server entry point
├── requirements.txt               # Python dependencies
├── README.md                      # This documentation
├── CWRU/                          # CWRU dataset files (reference)
├── Bearing_Dataset/               # Classified fault segments (reference)
├── Simulation signaux-roulement PFE6.ipynb  # Original notebook (reference)
└── chapitre2pfee (2).pdf          # Thesis chapter (reference)
```

### Module Descriptions

#### `core/physics.py`
- `bearing_freqs(fr, Nb, d, D, phi)` — Computes BPFO, BPFI, BSF, FTF
- `impulse_response(t, fn, zeta)` — SDOF damped oscillator h(t)
- `DEFAULT_PARAMS` — Dictionary of default SKF 6205 parameters
- `PARAM_DESCRIPTIONS` — UI metadata (labels, units, min/max/step)

#### `core/generator.py`
- `generate_healthy_signal(t, fr, snr_db)` — Gaussian noise + rotational harmonics
- `generate_defect_signal(t, f_def, h, ...)` — Impact train → convolution → AM/FM modulation
- `generate_signal(signal_type, params)` — Factory function that routes to the correct generator

#### `core/features.py`
- `compute_time_stats(sig)` — RMS, kurtosis, skewness, crest factor, peak-to-peak
- `compute_psd(sig, fs)` — Welch Power Spectral Density
- `compute_envelope_spectrum(sig, fs)` — Hilbert envelope spectrum
- `compute_all_features(sig, fs)` — Aggregates all features

#### `core/simulation_engine.py`
- `BearingSimulator` class — High-level facade
  - `.simulate()` — One-shot full simulation with all features
  - `.stream_chunk()` — Generate one streaming chunk with rolling buffer PSD/envelope
  - `.reset_stream()` — Reset streaming state

#### `app.py`
- `GET /` — Serves the dashboard
- `GET /api/params` — Returns default parameters
- `POST /api/simulate` — Full one-shot simulation
- `WS /ws/stream` — Real-time WebSocket streaming

---

## 5. Installation & Setup

### Prerequisites
- Python 3.10 or newer
- pip package manager
- A modern web browser (Chrome, Firefox, Edge)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/fouad3966/Bearing_Simulation_PFE.git
cd Bearing_Simulation_PFE

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Start the server
python -m uvicorn app:app --reload --port 8000

# 4. Open in your browser
# Navigate to: http://localhost:8000
```

---

## 6. How to Use the Application

### 6.1 One-Shot Simulation (Static Mode)

This is the simplest mode. You configure parameters and get a complete 2-second simulation.

1. **Set bearing parameters** in the left panel (or leave defaults for SKF 6205)
2. **Select a fault type**: Healthy, Outer Race, Inner Race, Ball, or Cage
3. **Adjust severity** using the slider (0% = barely detectable, 100% = catastrophic)
4. **Adjust SNR** (Signal-to-Noise Ratio): higher = cleaner signal, lower = more noise
5. **Click "Simulate"**
6. All 3 charts update simultaneously with the results
7. The Health Monitor panel shows diagnostic indicators

> **Tip**: Click "Simulate" multiple times — the graphs will look slightly different each time because of random noise, phase, and jitter. This is intentional and mirrors real-world sensor behavior. However, the **underlying features** (envelope spectrum peaks, characteristic frequencies) remain consistent.

### 6.2 Real-Time Streaming Mode

This simulates a continuously running sensor, as if the bearing is operating live.

1. **Configure your parameters** (fault type, severity, etc.)
2. **Click the green "Stream" button**
3. All three charts now update live:
   - **Time Domain**: Scrolls continuously (~12 fps)
   - **PSD**: Updates every ~0.5 seconds
   - **Envelope Spectrum**: Updates every ~0.5 seconds with frequency markers
4. The Health Monitor updates continuously
5. The status badge shows "Streaming" and a timer counts elapsed time

### 6.3 Fault Injection (The "Wow" Feature)

While streaming, you can simulate a sudden bearing failure:

1. Start streaming in **Healthy** mode
2. While the stream is running, select a fault type (e.g., **Outer Race**)
3. Set the desired severity
4. Click the orange **"Inject Fault"** button
5. Watch all charts instantly transition from healthy to faulty
6. The traffic light will change from green to yellow/red
7. Click **"Stop"** when finished

---

## 7. Parameter Reference

### Bearing Geometry

| Parameter | Symbol | Default | Unit | Description |
|-----------|--------|---------|------|-------------|
| Number of Balls | Nb | 8 | — | Rolling elements inside the bearing |
| Ball Diameter | d | 8 | mm | Diameter of each ball |
| Pitch Diameter | D | 40 | mm | Distance between centers of opposing balls |
| Contact Angle | φ | 0 | degrees | Angle between load line and radial plane |

These four parameters define the geometric ratios that determine the characteristic defect frequencies. Changing any of them will recalculate BPFO, BPFI, BSF, and FTF.

### Kinematics

| Parameter | Symbol | Default | Unit | Description |
|-----------|--------|---------|------|-------------|
| Shaft Speed | fr | 30 | Hz | Rotation frequency of the shaft (30 Hz = 1800 RPM) |
| Sample Rate | fs | 12000 | Hz | How many data points the sensor records per second |

The shaft speed directly affects all characteristic frequencies (they scale linearly with fr). The sample rate determines the maximum frequency you can analyze (Nyquist limit = fs/2).

### Structural System

| Parameter | Symbol | Default | Unit | Description |
|-----------|--------|---------|------|-------------|
| Natural Frequency | fn | 3000 | Hz | Resonant frequency of the bearing housing/sensor |
| Damping Ratio | ζ | 0.02 | — | How quickly the structural ringing decays (0 = no damping, 1 = critical) |

When a ball hits a defect, the structure "rings" like a bell at `fn` Hz. The damping ratio controls how long this ringing lasts. Low damping (0.01) = long ringing. High damping (0.1) = short, quickly damped ring.

### Fault Configuration

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| Fault Type | Healthy | 5 options | Which bearing component has the defect |
| Severity | 50% | 0–100% | How severe the damage is |
| SNR | 20 dB | -10 to 60 dB | Signal-to-noise ratio (noise level) |
| Duration | 2 s | 0.1–10 s | Length of the simulated signal (one-shot mode) |

#### Severity Model

Severity (0.0 to 1.0) controls multiple physical parameters simultaneously:

| Effect | Low Severity (0.1) | High Severity (0.9) |
|--------|--------------------|--------------------|
| Impact Amplitude | Very weak | Very strong |
| Timing Jitter | High (irregular impacts) | Low (very regular impacts) |
| SNR Reduction | Minimal | Significant (more noise from damage) |
| Non-linearity | None | Distortion from severe plastic deformation |
| FM Modulation | None | Present (speed fluctuations) |

---

## 8. Understanding the Charts

### 8.1 Time Domain (Oscilloscope)

**What it shows**: The raw vibration signal as recorded by an accelerometer over time.

- **X-axis**: Time in seconds
- **Y-axis**: Vibration amplitude (acceleration, arbitrary units)

**What to look for**:
- **Healthy**: Random noise with no visible pattern
- **Faulty**: Periodic bursts/spikes of vibration at regular intervals. The spacing between bursts corresponds to the characteristic frequency period (e.g., for BPFO=96 Hz, bursts appear every 1/96 ≈ 0.0104 seconds)

### 8.2 Power Spectral Density (Welch PSD)

**What it shows**: How vibration energy is distributed across frequencies. Computed using Welch's method (averaged periodogram).

- **X-axis**: Frequency in Hz (0 to fs/2)
- **Y-axis**: Power spectral density

**What to look for**:
- A dominant peak near the **natural frequency** (fn = 3000 Hz) — this is the structural resonance excited by impacts
- With faults, the resonance peak grows significantly
- The PSD alone usually cannot identify *which* component is faulty

### 8.3 Envelope Spectrum (Hilbert Transform)

**What it shows**: The modulation pattern of the signal — revealing the repetition rate of impacts.

- **X-axis**: Low frequencies (0–600 Hz)
- **Y-axis**: Envelope magnitude
- **Colored dashed lines**: Characteristic frequency markers (BPFO, BPFI, BSF, FTF)

**What to look for**: This is the **primary diagnostic tool**:
- A peak aligned with the **BPFO** (yellow) line → **Outer Race defect**
- A peak aligned with the **BPFI** (red) line → **Inner Race defect**
- A peak aligned with the **BSF** (purple) line → **Ball defect**
- A peak aligned with the **FTF** (cyan) line → **Cage defect**
- No clear peaks → **Healthy bearing**

**Why it works**: The Hilbert transform extracts the amplitude envelope (the "shape" that wraps around the signal), and its FFT reveals the repetition frequency of impacts — exactly the characteristic defect frequency.

---

## 9. Health Diagnostics System

### 9.1 Traffic Light

| Color | Status | Meaning |
|-------|--------|---------|
| 🟢 Green | NORMAL | All indicators within safe limits |
| 🟡 Yellow | WARNING | Early-stage defect suspected |
| 🔴 Red | DANGER | Significant defect — immediate action required |

### 9.2 Diagnostic Thresholds

| Indicator | Normal (Green) | Warning (Yellow) | Danger (Red) |
|-----------|---------------|-------------------|--------------|
| Kurtosis | < 4 | 4 – 10 | > 10 |
| RMS | < 0.1 | 0.1 – 0.3 | > 0.3 |
| Crest Factor | < 4 | 4 – 6 | > 6 |

### 9.3 Statistical Indicators Explained

| Indicator | What It Measures | Why It Matters |
|-----------|-----------------|----------------|
| **RMS** | Root Mean Square — overall vibration energy | Increases with fault severity; general health indicator |
| **Kurtosis** | "Peakedness" of the signal distribution | Healthy signals have kurtosis ≈ 3 (Gaussian). Impacts create sharp peaks, pushing kurtosis >> 3 |
| **Crest Factor** | Ratio of peak value to RMS | Detects sharp transient impacts hidden in the overall signal |
| **Skewness** | Asymmetry of the signal distribution | Can indicate directional fault effects |

### 9.4 Diagnostic Messages

- **Normal**: "Bearing operating normally. No anomalies detected."
- **Warning**: "Early-stage defect suspected. Schedule inspection within 30 days."
- **Danger**: "Significant defect detected. Immediate inspection required. Plan bearing replacement."

### 9.5 Fault Identification

The system identifies the fault type by correlating the selected fault mode with the envelope spectrum:
- Peak near BPFO → "Outer race defect detected"
- Peak near BPFI → "Inner race defect detected"
- Peak near BSF → "Ball/rolling element defect detected"
- Peak near FTF → "Cage defect detected"

---

## 10. Signal Generation Pipeline

The signal generation follows this pipeline:

```
                    ┌─────────────────┐
                    │   Parameters    │
                    │  (Nb, d, D, φ,  │
                    │   fr, fn, ζ)    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Compute Char.   │
                    │ Frequencies     │
                    │ BPFO,BPFI,BSF,  │
                    │ FTF             │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
     ┌────────▼────────┐          ┌─────────▼────────┐
     │    HEALTHY       │          │     FAULTY        │
     │                  │          │                    │
     │ Gaussian noise   │          │ 1. Impact train    │
     │ + rotational     │          │    at f_def Hz     │
     │   harmonics      │          │ 2. Convolve with   │
     │   (1×,2×,3× fr)  │          │    impulse resp.   │
     │ + SNR noise      │          │ 3. Add AM/FM mod.  │
     │                  │          │ 4. Add harmonics   │
     └────────┬────────┘          │ 5. Add nonlinearity│
              │                   │ 6. Add SNR noise   │
              │                   └─────────┬──────────┘
              │                             │
              └──────────────┬──────────────┘
                             │
                    ┌────────▼────────┐
                    │ Feature Extract │
                    │ RMS, Kurtosis,  │
                    │ PSD, Envelope   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Dashboard     │
                    │   Rendering     │
                    └─────────────────┘
```

### Why Do Results Change Each Time?

Even with identical parameters, each simulation produces a slightly different signal. This is **intentional** and realistic:

1. **Random Noise**: Each run generates a new Gaussian noise profile (simulating real sensor noise)
2. **Impact Jitter**: Ball impacts don't occur at perfectly exact intervals — a tiny random time offset is added
3. **Phase Randomness**: Rotational harmonics start at random phase angles

The key diagnostic features (envelope spectrum peaks, characteristic frequencies) remain **consistent** across runs — only the random noise floor changes.

---

## 11. API Reference

### REST Endpoints

#### `GET /`
Serves the dashboard HTML page.

#### `GET /api/params`
Returns default parameters and their UI metadata.

**Response**:
```json
{
  "defaults": {"fs": 12000, "T": 2.0, "Nb": 8, ...},
  "descriptions": {"fs": {"label": "Sampling Frequency", "unit": "Hz", "min": 1000, "max": 100000, "step": 1000}, ...}
}
```

#### `POST /api/simulate`
Run a one-shot simulation.

**Request Body**:
```json
{
  "signal_type": "OuterRace",
  "severity": 0.7,
  "duration": 2.0,
  "fs": 12000,
  "Nb": 8,
  "d": 0.008,
  "D": 0.04,
  "phi": 0.0,
  "fr": 30.0,
  "fn": 3000.0,
  "zeta": 0.02,
  "snr_db": 20.0
}
```

**Response**: JSON with `time[]`, `signal[]`, `features{}`, `char_freqs{}`, `params{}`

### WebSocket

#### `WS /ws/stream`

**Client → Server Messages**:
```json
{"action": "start", "params": {...}}
{"action": "stop"}
{"action": "inject_fault", "type": "InnerRace", "severity": 0.8}
{"action": "update_params", "params": {...}}
```

**Server → Client Messages** (every ~80ms):
```json
{
  "time": [...],
  "signal": [...],
  "stats": {"rms": 0.18, "kurtosis": 7.4, "crest_factor": 5.2, "skewness": 0.1, "peak_to_peak": 0.9},
  "char_freqs": {"BPFO": 96.0, "BPFI": 144.0, "BSF": 72.0, "FTF": 12.0},
  "psd": {"freqs": [...], "values": [...]},
  "envelope": {"freqs": [...], "values": [...]}
}
```

> Note: `psd` and `envelope` fields are included every 5th chunk (~0.5s intervals) to balance performance with real-time spectral updates.

---

## 12. Deployment

### Local Development
```bash
pip install -r requirements.txt
python -m uvicorn app:app --reload --port 8000
```

### Production (Render.com)
This project is configured for deployment on [Render](https://render.com). See the deployment section for instructions.

---

## 13. FAQ

### Q: Why does the signal look different every time I click "Simulate"?
**A**: The simulation uses stochastic (random) processes — Gaussian noise, impact jitter, and random phase — to model real-world sensor behavior. The underlying diagnostic features (envelope peaks, characteristic frequencies) remain consistent.

### Q: What do the dashed colored lines on the Envelope Spectrum mean?
**A**: They mark the characteristic defect frequencies:
- 🟡 Yellow = BPFO (Outer Race)
- 🔴 Red = BPFI (Inner Race)
- 🟣 Purple = BSF (Ball)
- 🔵 Cyan = FTF (Cage)

If a spectral peak aligns with one of these lines, it confirms a defect on that bearing component.

### Q: What severity should I use for a realistic demo?
**A**: 
- **20-30%**: Very early-stage fault — hard to see in time domain, but detectable in envelope spectrum
- **50-60%**: Moderate fault — visible impacts, clear envelope peaks
- **80-100%**: Severe fault — dramatic impacts, strong diagnostic indicators

### Q: Can I use this with real bearing data?
**A**: This version uses simulated signals only. The CWRU and Bearing_Dataset folders contain real bearing data for reference/comparison, but the web app currently only simulates signals.

### Q: Why is the Kurtosis around 3 for healthy signals?
**A**: A Gaussian (normal) distribution has an excess kurtosis of 0 (or standard kurtosis of 3). Healthy bearing vibration is approximately Gaussian noise, so kurtosis ≈ 3. When impacts from defects appear, the sharp peaks push the kurtosis well above 3.

---

## License

This project was developed as part of a PFE (Projet de Fin d'Études) for vibration-based bearing condition monitoring research.

## References

- Harris, T.A. (2001). *Rolling Bearing Analysis*, 4th Edition. Wiley.
- McFadden, P.D. & Smith, J.D. (1984). *Model for the vibration produced by a single point defect in a rolling element bearing*. Journal of Sound and Vibration.
- Case Western Reserve University Bearing Data Center. [https://engineering.case.edu/bearingdatacenter](https://engineering.case.edu/bearingdatacenter)
