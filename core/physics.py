"""
Bearing Physics — Harris-theory characteristic frequencies & impulse response.
"""

import numpy as np

# ── Default bearing parameters (CWRU SKF 6205) ──────────────────────────────
DEFAULT_PARAMS = {
    "fs": 12_000,       # Sampling frequency (Hz)
    "T": 2.0,           # Signal duration (s)
    "Nb": 8,            # Number of balls
    "d": 8e-3,          # Ball diameter (m)
    "D": 40e-3,         # Pitch diameter (m)
    "phi": 0.0,         # Contact angle (rad)
    "fr": 30.0,         # Shaft rotation frequency (Hz)
    "fn": 3000.0,       # Structural natural frequency (Hz)
    "zeta": 0.02,       # Damping ratio
    "snr_db": 20.0,     # Signal-to-noise ratio (dB)
}

PARAM_DESCRIPTIONS = {
    "fs": {"label": "Sampling Frequency", "unit": "Hz", "min": 1000, "max": 100000, "step": 1000},
    "T": {"label": "Duration", "unit": "s", "min": 0.1, "max": 10.0, "step": 0.1},
    "Nb": {"label": "Number of Balls", "unit": "", "min": 3, "max": 30, "step": 1},
    "d": {"label": "Ball Diameter", "unit": "m", "min": 0.001, "max": 0.1, "step": 0.001},
    "D": {"label": "Pitch Diameter", "unit": "m", "min": 0.01, "max": 0.5, "step": 0.001},
    "phi": {"label": "Contact Angle", "unit": "rad", "min": 0.0, "max": 1.57, "step": 0.01},
    "fr": {"label": "Shaft Speed", "unit": "Hz", "min": 1.0, "max": 500.0, "step": 1.0},
    "fn": {"label": "Natural Frequency", "unit": "Hz", "min": 500, "max": 20000, "step": 100},
    "zeta": {"label": "Damping Ratio", "unit": "", "min": 0.001, "max": 0.5, "step": 0.001},
    "snr_db": {"label": "SNR", "unit": "dB", "min": -10, "max": 60, "step": 1},
}


def bearing_freqs(fr: float, Nb: int, d: float, D: float, phi: float = 0.0) -> dict:
    """Compute the four Harris-theory characteristic frequencies."""
    cos_phi = np.cos(phi)
    ratio = d / D
    bpfo = (Nb / 2) * fr * (1 - ratio * cos_phi)
    bpfi = (Nb / 2) * fr * (1 + ratio * cos_phi)
    bsf = (D / (2 * d)) * fr * (1 - (ratio * cos_phi) ** 2)
    ftf = 0.5 * fr * (1 - ratio * cos_phi)
    return {"BPFO": bpfo, "BPFI": bpfi, "BSF": bsf, "FTF": ftf}


def impulse_response(t: np.ndarray, fn: float = 3000.0, zeta: float = 0.02) -> np.ndarray:
    """Single-degree-of-freedom impulse response h(t)."""
    wn = 2 * np.pi * fn
    wd = wn * np.sqrt(1 - zeta ** 2)
    return np.exp(-zeta * wn * t) * np.sin(wd * t)
