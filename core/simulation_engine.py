"""
Simulation Engine — High-level orchestration for one-shot and streaming simulation.
"""

import numpy as np
from .physics import DEFAULT_PARAMS, bearing_freqs, impulse_response
from .generator import generate_signal
from .features import compute_all_features, compute_time_stats


class BearingSimulator:
    """Top-level simulator facade."""

    def __init__(self, **params):
        self.params = {**DEFAULT_PARAMS, **params}
        self._compute_freqs()
        self._compute_impulse_response()
        # streaming state
        self._stream_offset = 0.0
        self._signal_buffer = np.array([], dtype=np.float64)
        self._chunk_counter = 0
        self._spectral_interval = 5

    def _compute_freqs(self):
        p = self.params
        self.char_freqs = bearing_freqs(p["fr"], p["Nb"], p["d"], p["D"], p["phi"])

    def _compute_impulse_response(self):
        p = self.params
        fs = int(p["fs"])
        h_len = min(int(0.05 * fs), 1000)
        t_h = np.linspace(0, h_len / fs, h_len, endpoint=False)
        self.h = impulse_response(t_h, p["fn"], p["zeta"])

    def update_params(self, **params):
        self.params.update(params)
        self._compute_freqs()
        self._compute_impulse_response()

    def simulate(self, signal_type: str = "Healthy", severity: float = 0.0,
                 duration: float | None = None) -> dict:
        """Full one-shot simulation."""
        p = dict(self.params)
        if duration is not None:
            p["T"] = duration
        p["severity"] = severity

        t, sig = generate_signal(signal_type, p)
        fs = int(p["fs"])
        features = compute_all_features(sig, fs)

        # Downsample for transport (max ~4000 points for charts)
        max_points = 4000
        step = max(1, len(t) // max_points)
        t_down = t[::step].tolist()
        sig_down = sig[::step].tolist()

        return {
            "time": t_down,
            "signal": sig_down,
            "features": features,
            "char_freqs": {k: round(v, 2) for k, v in self.char_freqs.items()},
            "params": {k: v for k, v in p.items() if k != "severity"},
            "signal_type": signal_type,
            "severity": severity,
        }

    def stream_chunk(self, signal_type: str, severity: float,
                     chunk_duration: float = 0.1) -> dict:
        """Generate one streaming chunk. Every _spectral_interval chunks,
        compute PSD & envelope on the rolling buffer so all charts update live."""
        p = dict(self.params)
        fs = int(p["fs"])
        p["T"] = chunk_duration
        p["severity"] = severity

        t, sig = generate_signal(signal_type, p)
        t_shifted = t + self._stream_offset
        self._stream_offset += chunk_duration

        # Accumulate rolling buffer (keep last ~2 s of signal for spectral analysis)
        max_buf = int(fs * 2.0)
        self._signal_buffer = np.concatenate([self._signal_buffer, sig])
        if len(self._signal_buffer) > max_buf:
            self._signal_buffer = self._signal_buffer[-max_buf:]

        stats = compute_time_stats(sig)
        result = {
            "time": t_shifted.tolist(),
            "signal": sig.tolist(),
            "stats": stats,
        }

        # Every _spectral_interval chunks, compute full spectral features
        self._chunk_counter += 1
        if self._chunk_counter >= self._spectral_interval and len(self._signal_buffer) >= 2048:
            self._chunk_counter = 0
            features = compute_all_features(self._signal_buffer, fs)
            result["psd"] = features["psd"]
            result["envelope"] = features["envelope"]

        return result

    def reset_stream(self):
        self._stream_offset = 0.0
        self._signal_buffer = np.array([], dtype=np.float64)
        self._chunk_counter = 0
        self._spectral_interval = 5  # compute spectra every 5 chunks (~0.5 s)
