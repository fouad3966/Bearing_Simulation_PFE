/* ═══════════════════════════════════════════════════════════════════
   Bearing Signal Simulator — Frontend Application Logic
   ═══════════════════════════════════════════════════════════════════ */

// ── DOM Elements ─────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const btnSimulate = $("#btn-simulate");
const btnStreamStart = $("#btn-stream-start");
const btnStreamStop = $("#btn-stream-stop");
const btnInject = $("#btn-inject");
const severitySlider = $("#param-severity");
const severityDisplay = $("#severity-display");
const snrSlider = $("#param-snr");
const snrDisplay = $("#snr-display");
const connectionStatus = $("#connection-status");
const streamTimer = $("#stream-timer");

// ── State ────────────────────────────────────────────────────────────
let selectedFault = "Healthy";
let ws = null;
let isStreaming = false;
let streamStartTime = null;
let streamTimerInterval = null;

// Streaming data buffers (scrolling window)
const MAX_STREAM_POINTS = 6000;
let streamTime = [];
let streamSignal = [];

// ── ECharts Instances ────────────────────────────────────────────────
const chartTheme = {
    backgroundColor: "transparent",
    textStyle: { color: "#94a3b8", fontFamily: "'Inter', sans-serif" },
};

let chartTime, chartPSD, chartEnvelope;

function initCharts() {
    chartTime = echarts.init($("#chart-time"), null, { renderer: "canvas" });
    chartPSD = echarts.init($("#chart-psd"), null, { renderer: "canvas" });
    chartEnvelope = echarts.init($("#chart-envelope"), null, { renderer: "canvas" });

    // Time-domain oscilloscope
    chartTime.setOption({
        backgroundColor: "transparent",
        grid: { left: 55, right: 20, top: 16, bottom: 32 },
        xAxis: {
            type: "value",
            name: "Time (s)",
            nameLocation: "center",
            nameGap: 22,
            nameTextStyle: { color: "#64748b", fontSize: 10 },
            axisLine: { lineStyle: { color: "#1e293b" } },
            axisTick: { lineStyle: { color: "#1e293b" } },
            axisLabel: { color: "#64748b", fontSize: 10 },
            splitLine: { lineStyle: { color: "rgba(255,255,255,0.03)" } },
        },
        yAxis: {
            type: "value",
            name: "Amplitude",
            nameLocation: "center",
            nameGap: 40,
            nameTextStyle: { color: "#64748b", fontSize: 10 },
            axisLine: { lineStyle: { color: "#1e293b" } },
            axisTick: { lineStyle: { color: "#1e293b" } },
            axisLabel: { color: "#64748b", fontSize: 10 },
            splitLine: { lineStyle: { color: "rgba(255,255,255,0.03)" } },
        },
        series: [{
            type: "line",
            showSymbol: false,
            lineStyle: { width: 1.2, color: "#3b82f6" },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: "rgba(59,130,246,0.18)" },
                    { offset: 1, color: "rgba(59,130,246,0.0)" },
                ]),
            },
            data: [],
            animation: false,
            large: true,
            largeThreshold: 2000,
        }],
        tooltip: {
            trigger: "axis",
            backgroundColor: "rgba(13,19,33,0.9)",
            borderColor: "rgba(255,255,255,0.1)",
            textStyle: { color: "#f1f5f9", fontSize: 11 },
            formatter: (p) => `t = ${p[0].value[0].toFixed(4)}s<br/>A = ${p[0].value[1].toFixed(4)}`,
        },
    });

    // PSD
    chartPSD.setOption({
        backgroundColor: "transparent",
        grid: { left: 55, right: 20, top: 16, bottom: 32 },
        xAxis: {
            type: "value",
            name: "Frequency (Hz)",
            nameLocation: "center",
            nameGap: 22,
            nameTextStyle: { color: "#64748b", fontSize: 10 },
            axisLine: { lineStyle: { color: "#1e293b" } },
            axisTick: { lineStyle: { color: "#1e293b" } },
            axisLabel: { color: "#64748b", fontSize: 10 },
            splitLine: { lineStyle: { color: "rgba(255,255,255,0.03)" } },
        },
        yAxis: {
            type: "value",
            name: "Power (dB)",
            nameLocation: "center",
            nameGap: 40,
            nameTextStyle: { color: "#64748b", fontSize: 10 },
            axisLine: { lineStyle: { color: "#1e293b" } },
            axisTick: { lineStyle: { color: "#1e293b" } },
            axisLabel: { color: "#64748b", fontSize: 10 },
            splitLine: { lineStyle: { color: "rgba(255,255,255,0.03)" } },
        },
        series: [{
            type: "line",
            showSymbol: false,
            lineStyle: { width: 1.2, color: "#8b5cf6" },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: "rgba(139,92,246,0.18)" },
                    { offset: 1, color: "rgba(139,92,246,0.0)" },
                ]),
            },
            data: [],
            animation: false,
            large: true,
        }],
        tooltip: {
            trigger: "axis",
            backgroundColor: "rgba(13,19,33,0.9)",
            borderColor: "rgba(255,255,255,0.1)",
            textStyle: { color: "#f1f5f9", fontSize: 11 },
            formatter: (p) => `f = ${p[0].value[0].toFixed(1)} Hz<br/>P = ${p[0].value[1].toExponential(2)}`,
        },
    });

    // Envelope Spectrum
    chartEnvelope.setOption({
        backgroundColor: "transparent",
        grid: { left: 55, right: 20, top: 16, bottom: 32 },
        xAxis: {
            type: "value",
            name: "Frequency (Hz)",
            nameLocation: "center",
            nameGap: 22,
            max: 600,
            nameTextStyle: { color: "#64748b", fontSize: 10 },
            axisLine: { lineStyle: { color: "#1e293b" } },
            axisTick: { lineStyle: { color: "#1e293b" } },
            axisLabel: { color: "#64748b", fontSize: 10 },
            splitLine: { lineStyle: { color: "rgba(255,255,255,0.03)" } },
        },
        yAxis: {
            type: "value",
            name: "Magnitude",
            nameLocation: "center",
            nameGap: 40,
            nameTextStyle: { color: "#64748b", fontSize: 10 },
            axisLine: { lineStyle: { color: "#1e293b" } },
            axisTick: { lineStyle: { color: "#1e293b" } },
            axisLabel: { color: "#64748b", fontSize: 10 },
            splitLine: { lineStyle: { color: "rgba(255,255,255,0.03)" } },
        },
        series: [{
            type: "line",
            showSymbol: false,
            lineStyle: { width: 1.2, color: "#10b981" },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: "rgba(16,185,129,0.18)" },
                    { offset: 1, color: "rgba(16,185,129,0.0)" },
                ]),
            },
            data: [],
            animation: false,
            large: true,
        }],
        tooltip: {
            trigger: "axis",
            backgroundColor: "rgba(13,19,33,0.9)",
            borderColor: "rgba(255,255,255,0.1)",
            textStyle: { color: "#f1f5f9", fontSize: 11 },
            formatter: (p) => `f = ${p[0].value[0].toFixed(1)} Hz<br/>M = ${p[0].value[1].toExponential(2)}`,
        },
    });

    // Resize handler
    const resizeObserver = new ResizeObserver(() => {
        chartTime.resize();
        chartPSD.resize();
        chartEnvelope.resize();
    });
    resizeObserver.observe($("#charts-panel"));
}

// ── Collect Parameters ───────────────────────────────────────────────
function getParams() {
    return {
        signal_type: selectedFault,
        severity: parseFloat(severitySlider.value) / 100,
        duration: parseFloat($("#param-duration").value),
        fs: parseFloat($("#param-fs").value),
        Nb: parseInt($("#param-Nb").value),
        d: parseFloat($("#param-d").value) / 1000,    // mm → m
        D: parseFloat($("#param-D").value) / 1000,    // mm → m
        phi: parseFloat($("#param-phi").value) * Math.PI / 180, // deg → rad
        fr: parseFloat($("#param-fr").value),
        fn: parseFloat($("#param-fn").value),
        zeta: parseFloat($("#param-zeta").value),
        snr_db: parseFloat(snrSlider.value),
    };
}

// ── One-Shot Simulation ──────────────────────────────────────────────
async function runSimulation() {
    btnSimulate.disabled = true;
    btnSimulate.innerHTML = `<svg class="spinner" width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="30 70" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" dur="0.8s" from="0 12 12" to="360 12 12" repeatCount="indefinite"/></circle></svg> Simulating…`;

    try {
        const params = getParams();
        const resp = await fetch("/api/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
        });
        const data = await resp.json();
        updateCharts(data);
        updateHealthPanel(data.features.stats, data.char_freqs);
    } catch (err) {
        console.error("Simulation error:", err);
    } finally {
        btnSimulate.disabled = false;
        btnSimulate.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Simulate`;
    }
}

function updateCharts(data) {
    // Time domain
    const timeData = data.time.map((t, i) => [t, data.signal[i]]);
    chartTime.setOption({ series: [{ data: timeData }] });

    // PSD
    const psdData = data.features.psd.freqs.map((f, i) => [f, data.features.psd.values[i]]);
    chartPSD.setOption({ series: [{ data: psdData }] });

    // Envelope spectrum (limit to 600 Hz for readability)
    const envData = [];
    for (let i = 0; i < data.features.envelope.freqs.length; i++) {
        if (data.features.envelope.freqs[i] > 600) break;
        envData.push([data.features.envelope.freqs[i], data.features.envelope.values[i]]);
    }
    chartEnvelope.setOption({
        series: [{
            data: envData,
            markLine: buildFreqMarkLines(data.char_freqs),
        }],
    });
}

function buildFreqMarkLines(charFreqs) {
    if (!charFreqs) return { data: [] };
    const colors = {
        BPFO: "#f59e0b",
        BPFI: "#ef4444",
        BSF: "#8b5cf6",
        FTF: "#06b6d4",
    };
    return {
        silent: true,
        symbol: "none",
        lineStyle: { type: "dashed", width: 1.2 },
        label: {
            fontSize: 9,
            fontFamily: "'JetBrains Mono', monospace",
            padding: [2, 4],
            borderRadius: 3,
            position: "start",
        },
        data: Object.entries(charFreqs).filter(([, v]) => v <= 600).map(([name, val]) => ({
            xAxis: val,
            lineStyle: { color: colors[name] || "#64748b" },
            label: { formatter: `${name}`, color: colors[name] || "#64748b", backgroundColor: "rgba(10,14,23,0.85)" },
        })),
    };
}

// ── Health Panel Update ──────────────────────────────────────────────
function updateHealthPanel(stats, charFreqs) {
    // Gauge values
    $("#gauge-rms").textContent = stats.rms.toFixed(4);
    $("#gauge-kurtosis").textContent = stats.kurtosis.toFixed(2);
    $("#gauge-crest").textContent = stats.crest_factor.toFixed(2);
    $("#gauge-skewness").textContent = stats.skewness.toFixed(2);

    // Gauge bars
    setGaugeBar("bar-rms", stats.rms, 0, 0.5);
    setGaugeBar("bar-kurtosis", stats.kurtosis, 0, 20);
    setGaugeBar("bar-crest", stats.crest_factor, 0, 10);
    setGaugeBar("bar-skewness", Math.abs(stats.skewness), 0, 5);

    // Characteristic frequencies
    if (charFreqs) {
        $("#freq-bpfo").textContent = charFreqs.BPFO + " Hz";
        $("#freq-bpfi").textContent = charFreqs.BPFI + " Hz";
        $("#freq-bsf").textContent = charFreqs.BSF + " Hz";
        $("#freq-ftf").textContent = charFreqs.FTF + " Hz";
    }

    // Traffic light logic
    let level = "normal";
    if (stats.kurtosis > 10 || stats.rms > 0.3 || stats.crest_factor > 6) {
        level = "danger";
    } else if (stats.kurtosis > 4 || stats.rms > 0.1 || stats.crest_factor > 4) {
        level = "warning";
    }

    setTrafficLight(level);
    setDiagnosticMessage(level, stats, charFreqs);
}

function setGaugeBar(id, value, min, max) {
    const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
    const el = $(`#${id}`);
    el.style.width = `${pct}%`;
    if (pct > 75) el.style.background = "var(--accent-danger)";
    else if (pct > 45) el.style.background = "var(--accent-warning)";
    else el.style.background = "var(--accent-success)";
}

function setTrafficLight(level) {
    $$(".tl-light").forEach((el) => el.classList.remove("active"));
    const label = $("#health-status-label");
    label.className = "health-label";

    if (level === "danger") {
        $("#tl-red").classList.add("active");
        label.classList.add("health-danger");
        label.textContent = "DANGER";
    } else if (level === "warning") {
        $("#tl-yellow").classList.add("active");
        label.classList.add("health-warning");
        label.textContent = "WARNING";
    } else {
        $("#tl-green").classList.add("active");
        label.classList.add("health-normal");
        label.textContent = "NORMAL";
    }
}

function setDiagnosticMessage(level, stats, charFreqs) {
    const diagEl = $("#diagnostic-message");
    const maintEl = $("#maintenance-message");
    diagEl.className = "diagnostic-msg";

    if (level === "danger") {
        diagEl.classList.add("msg-danger");
        diagEl.textContent = "⚠ Significant defect detected. Immediate inspection required. Plan bearing replacement.";
        maintEl.textContent = "🔧 Schedule emergency maintenance. Replace bearing at earliest opportunity. Monitor continuously until replacement.";
    } else if (level === "warning") {
        diagEl.classList.add("msg-warning");
        diagEl.textContent = "⚡ Early-stage defect suspected. Schedule inspection within 30 days.";
        maintEl.textContent = "📋 Add to next scheduled maintenance window. Increase monitoring frequency to weekly.";
    } else {
        diagEl.classList.add("msg-normal");
        diagEl.textContent = "✓ Bearing operating normally. No anomalies detected.";
        maintEl.textContent = "Routine monitoring schedule. Next inspection per standard maintenance plan.";
    }

    // Fault type identification from selected fault (in real scenario, would analyze envelope peaks)
    if (selectedFault !== "Healthy" && level !== "normal") {
        const faultNames = {
            OuterRace: "Outer race defect detected (peak near BPFO)",
            InnerRace: "Inner race defect detected (peak near BPFI)",
            Ball: "Ball/rolling element defect detected (peak near BSF)",
            Cage: "Cage defect detected (peak near FTF)",
        };
        diagEl.textContent += "\n🔍 " + (faultNames[selectedFault] || "");
    }
}

// ── WebSocket Streaming ──────────────────────────────────────────────
function startStream() {
    const params = getParams();
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${location.host}/ws/stream`);

    ws.onopen = () => {
        ws.send(JSON.stringify({ action: "start", params }));
        isStreaming = true;
        streamTime = [];
        streamSignal = [];

        btnStreamStart.disabled = true;
        btnStreamStop.disabled = false;
        btnInject.disabled = false;
        btnSimulate.disabled = true;

        setConnectionStatus("streaming");

        streamStartTime = Date.now();
        streamTimerInterval = setInterval(updateStreamTimer, 100);
    };

    ws.onmessage = (evt) => {
        const chunk = JSON.parse(evt.data);
        appendStreamChunk(chunk);
    };

    ws.onclose = () => {
        stopStream();
    };

    ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        stopStream();
    };
}

function stopStream() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "stop" }));
        ws.close();
    }
    ws = null;
    isStreaming = false;

    btnStreamStart.disabled = false;
    btnStreamStop.disabled = true;
    btnInject.disabled = true;
    btnSimulate.disabled = false;

    setConnectionStatus("offline");
    clearInterval(streamTimerInterval);
}

function injectFault() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        action: "inject_fault",
        type: selectedFault,
        severity: parseFloat(severitySlider.value) / 100,
    }));
}

function appendStreamChunk(chunk) {
    // Append & trim buffer
    streamTime.push(...chunk.time);
    streamSignal.push(...chunk.signal);

    if (streamTime.length > MAX_STREAM_POINTS) {
        const excess = streamTime.length - MAX_STREAM_POINTS;
        streamTime.splice(0, excess);
        streamSignal.splice(0, excess);
    }

    // Downsample for chart performance
    const step = Math.max(1, Math.floor(streamTime.length / 3000));
    const chartData = [];
    for (let i = 0; i < streamTime.length; i += step) {
        chartData.push([streamTime[i], streamSignal[i]]);
    }

    chartTime.setOption({
        series: [{ data: chartData }],
        xAxis: {
            min: streamTime[0],
            max: streamTime[streamTime.length - 1],
        },
    });

    // Update PSD chart when spectral data is included
    if (chunk.psd) {
        const psdData = chunk.psd.freqs.map((f, i) => [f, chunk.psd.values[i]]);
        chartPSD.setOption({ series: [{ data: psdData }] });
    }

    // Update Envelope chart when spectral data is included
    if (chunk.envelope) {
        const envData = [];
        for (let i = 0; i < chunk.envelope.freqs.length; i++) {
            if (chunk.envelope.freqs[i] > 600) break;
            envData.push([chunk.envelope.freqs[i], chunk.envelope.values[i]]);
        }
        chartEnvelope.setOption({
            series: [{
                data: envData,
                markLine: buildFreqMarkLines(chunk.char_freqs || null),
            }],
        });
    }

    // Update health panel from chunk stats
    if (chunk.stats) {
        updateHealthPanel(chunk.stats, chunk.char_freqs || null);
    }
}

function updateStreamTimer() {
    if (!streamStartTime) return;
    const elapsed = (Date.now() - streamStartTime) / 1000;
    const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
    const secs = Math.floor(elapsed % 60).toString().padStart(2, "0");
    const tenths = Math.floor((elapsed * 10) % 10);
    streamTimer.textContent = `${mins}:${secs}.${tenths}`;
}

function setConnectionStatus(status) {
    connectionStatus.className = "status-badge";
    const dot = connectionStatus.querySelector(".status-text");
    if (status === "streaming") {
        connectionStatus.classList.add("status-streaming");
        dot.textContent = "Streaming";
    } else if (status === "connected") {
        connectionStatus.classList.add("status-connected");
        dot.textContent = "Connected";
    } else {
        connectionStatus.classList.add("status-offline");
        dot.textContent = "Offline";
    }
}

// ── Event Listeners ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    initCharts();

    // Fault selector
    $$(".fault-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            $$(".fault-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            selectedFault = btn.dataset.type;
        });
    });

    // Sliders
    severitySlider.addEventListener("input", () => {
        severityDisplay.textContent = severitySlider.value + "%";
    });
    snrSlider.addEventListener("input", () => {
        snrDisplay.textContent = snrSlider.value + " dB";
    });

    // Buttons
    btnSimulate.addEventListener("click", runSimulation);
    btnStreamStart.addEventListener("click", startStream);
    btnStreamStop.addEventListener("click", stopStream);
    btnInject.addEventListener("click", injectFault);

    // Keyboard shortcut: Enter to simulate
    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !isStreaming && !btnSimulate.disabled) {
            runSimulation();
        }
    });
});
