"""
Feature Extraction — Time-domain statistics, PSD, and envelope spectrum.
"""

import numpy as np
from scipy import signal as sp_signal, fft


def compute_time_stats(sig: np.ndarray) -> dict:
    """RMS, kurtosis, skewness, crest factor, peak-to-peak."""
    rms = float(np.sqrt(np.mean(sig ** 2)))
    n = len(sig)
    mean_val = np.mean(sig)
    centered = sig - mean_val
    std = np.std(sig, ddof=0)

    if std == 0:
        kurtosis = 0.0
        skewness = 0.0
    else:
        kurtosis = float(np.mean(centered ** 4) / std ** 4 - 3)  # excess kurtosis
        skewness = float(np.mean(centered ** 3) / std ** 3)

    peak = float(np.max(np.abs(sig)))
    crest_factor = peak / rms if rms > 0 else 0.0
    p2p = float(np.max(sig) - np.min(sig))

    return {
        "rms": round(rms, 6),
        "kurtosis": round(kurtosis, 4),
        "skewness": round(skewness, 4),
        "crest_factor": round(crest_factor, 4),
        "peak_to_peak": round(p2p, 6),
    }


def compute_psd(sig: np.ndarray, fs: int, nperseg: int = 1024) -> tuple:
    """Welch power spectral density."""
    freqs, psd = sp_signal.welch(sig, fs=fs, nperseg=min(nperseg, len(sig)))
    return freqs.tolist(), psd.tolist()


def compute_envelope_spectrum(sig: np.ndarray, fs: int) -> tuple:
    """Hilbert envelope spectrum for bearing fault detection."""
    analytic = sp_signal.hilbert(sig)
    envelope = np.abs(analytic)
    envelope -= np.mean(envelope)
    n = len(envelope)
    env_fft = np.abs(fft.rfft(envelope)) / n
    env_freqs = fft.rfftfreq(n, 1.0 / fs)
    return env_freqs.tolist(), env_fft.tolist()


def compute_all_features(sig: np.ndarray, fs: int) -> dict:
    """Aggregate all feature extractions."""
    stats = compute_time_stats(sig)
    psd_freqs, psd_vals = compute_psd(sig, fs)
    env_freqs, env_vals = compute_envelope_spectrum(sig, fs)
    return {
        "stats": stats,
        "psd": {"freqs": psd_freqs, "values": psd_vals},
        "envelope": {"freqs": env_freqs, "values": env_vals},
    }
