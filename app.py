"""
Bearing Signal Simulation — FastAPI Backend
"""

import asyncio
import json
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from core.physics import DEFAULT_PARAMS, PARAM_DESCRIPTIONS
from core.simulation_engine import BearingSimulator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Bearing Signal Simulator", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ───────────────────────────────────────────────────────────────────
class SimulateRequest(BaseModel):
    signal_type: str = "Healthy"
    severity: float = 0.0
    duration: float = 2.0
    fs: float = 12000
    Nb: int = 8
    d: float = 8e-3
    D: float = 40e-3
    phi: float = 0.0
    fr: float = 30.0
    fn: float = 3000.0
    zeta: float = 0.02
    snr_db: float = 20.0


# ── REST Endpoints ───────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.get("/api/params")
async def get_params():
    return {"defaults": DEFAULT_PARAMS, "descriptions": PARAM_DESCRIPTIONS}


@app.post("/api/simulate")
async def simulate(req: SimulateRequest):
    sim = BearingSimulator(
        fs=req.fs, Nb=req.Nb, d=req.d, D=req.D,
        phi=req.phi, fr=req.fr, fn=req.fn, zeta=req.zeta, snr_db=req.snr_db,
    )
    result = sim.simulate(
        signal_type=req.signal_type,
        severity=req.severity,
        duration=req.duration,
    )
    return result


# ── WebSocket Streaming ──────────────────────────────────────────────────────
@app.websocket("/ws/stream")
async def ws_stream(ws: WebSocket):
    await ws.accept()
    logger.info("WebSocket client connected")

    # Defaults
    signal_type = "Healthy"
    severity = 0.0
    sim = BearingSimulator()
    streaming = False

    try:
        while True:
            # Check for incoming messages (non-blocking)
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=0.05)
                msg = json.loads(raw)
                action = msg.get("action", "")

                if action == "start":
                    params = msg.get("params", {})
                    signal_type = params.pop("signal_type", "Healthy")
                    severity = float(params.pop("severity", 0.0))
                    sim = BearingSimulator(**{k: v for k, v in params.items() if k in DEFAULT_PARAMS})
                    sim.reset_stream()
                    streaming = True
                    logger.info(f"Streaming started: {signal_type}, severity={severity}")

                elif action == "stop":
                    streaming = False
                    logger.info("Streaming stopped")

                elif action == "inject_fault":
                    signal_type = msg.get("type", signal_type)
                    severity = float(msg.get("severity", severity))
                    logger.info(f"Fault injected: {signal_type}, severity={severity}")

                elif action == "update_params":
                    params = msg.get("params", {})
                    signal_type = params.pop("signal_type", signal_type)
                    severity = float(params.pop("severity", severity))
                    sim.update_params(**{k: v for k, v in params.items() if k in DEFAULT_PARAMS})

            except asyncio.TimeoutError:
                pass

            # Send chunk if streaming
            if streaming:
                chunk = sim.stream_chunk(signal_type, severity, chunk_duration=0.1)
                chunk["char_freqs"] = {k: round(v, 2) for k, v in sim.char_freqs.items()}
                await ws.send_text(json.dumps(chunk))
                await asyncio.sleep(0.08)  # ~12 fps

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")


# ── Static files (MUST be last) ─────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="static"), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
