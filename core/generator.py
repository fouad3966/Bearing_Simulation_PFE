"""
Signal Generator — Healthy & fault signals with severity control.
"""

import numpy as np
from scipy import signal as sp_signal

from .physics import bearing_freqs, impulse_response, DEFAULT_PARAMS


def _add_noise(sig: np.ndarray, snr_db: float) -> np.ndarray:
    """Add white Gaussian noise at specified SNR."""
    sig_power = np.mean(sig ** 2)
    if sig_power == 0:
        return sig + 0.05 * np.random.randn(len(sig))
    noise_power = sig_power / (10 ** (snr_db / 10))
    noise = np.sqrt(noise_power) * np.random.randn(len(sig))
    return sig + noise


def generate_healthy_signal(t: np.ndarray, fr: float, snr_db: float = 20.0) -> np.ndarray:
    """Gaussian noise baseline + rotational harmonics (1×, 2×, 3× fr)."""
    sig = 0.05 * np.random.randn(len(t))
    for k in range(1, 4):
        sig += 0.02 * np.sin(2 * np.pi * k * fr * t + np.random.uniform(0, 2 * np.pi))
    return _add_noise(sig, snr_db)


def generate_defect_signal(
    t: np.ndarray,
    f_def: float,
    h: np.ndarray,
    amplitude: float = 1.0,
    jitter: float = 0.0,
    fr: float = 30.0,
    snr_db: float = 20.0,
    am_mod: bool = False,
    fm_mod: bool = False,
    severity: float = 0.5,
) -> np.ndarray:
    """Impact pulse train convolved with impulse response, with optional AM/FM."""
    fs = 1.0 / (t[1] - t[0])
    T = t[-1] - t[0] + 1.0 / fs

    # Impact pulse train
    impacts = np.zeros_like(t)
    impact_times = np.arange(0, T, 1.0 / f_def)
    for ti in impact_times:
        idx = int(ti * fs + jitter * np.random.randn())
        if 0 <= idx < len(impacts):
            impacts[idx] += amplitude

    # Convolve with impulse response
    sig = sp_signal.fftconvolve(impacts, h, mode="same")

    # AM modulation for inner-race faults
    if am_mod:
        modulation = 1.0 + 0.5 * severity * np.cos(2 * np.pi * fr * t)
        sig *= modulation

    # FM modulation
    if fm_mod:
        phase_mod = 0.01 * severity * np.sin(2 * np.pi * fr * t)
        sig = sig * (1 + phase_mod)

    # Rotational harmonics
    for k in range(1, 4):
        sig += 0.02 * np.sin(2 * np.pi * k * fr * t)

    # Non-linearity for severe faults
    if severity > 0.6:
        nl_coeff = (severity - 0.6) * 2.5  # 0 → 1
        sig = sig + nl_coeff * sig ** 2 * 0.1

    return _add_noise(sig, snr_db)


def generate_signal(signal_type: str, params: dict) -> tuple:
    """
    Factory function.
    signal_type: 'Healthy', 'OuterRace', 'InnerRace', 'Ball', 'Cage'
    Returns (t, signal_array)
    """
    p = {**DEFAULT_PARAMS, **params}
    fs = int(p["fs"])
    T = float(p["T"])
    fr = float(p["fr"])
    fn = float(p["fn"])
    zeta = float(p["zeta"])
    snr_db = float(p["snr_db"])
    severity = float(p.get("severity", 0.0))

    t = np.linspace(0, T, int(fs * T), endpoint=False)
    h_len = min(int(0.05 * fs), len(t))  # 50 ms impulse response window
    t_h = np.linspace(0, h_len / fs, h_len, endpoint=False)
    h = impulse_response(t_h, fn, zeta)

    if signal_type == "Healthy":
        sig = generate_healthy_signal(t, fr, snr_db)
    else:
        freqs = bearing_freqs(fr, int(p["Nb"]), float(p["d"]), float(p["D"]), float(p["phi"]))
        freq_map = {
            "OuterRace": "BPFO",
            "InnerRace": "BPFI",
            "Ball": "BSF",
            "Cage": "FTF",
        }
        f_def = freqs[freq_map[signal_type]]
        base_amp = 1.0
        amplitude = base_amp * (0.1 + 0.9 * severity)
        max_jitter = 3.0
        jitter = max_jitter * (1.0 - severity)
        sig = generate_defect_signal(
            t, f_def, h,
            amplitude=amplitude,
            jitter=jitter,
            fr=fr,
            snr_db=snr_db - severity * 5,  # noisier with severity
            am_mod=(signal_type == "InnerRace"),
            fm_mod=(severity > 0.3),
            severity=severity,
        )

    return t, sig
