import { AudioProcessor, formatDuration } from "./audio.js";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ["mp3", "wav", "m4a", "flac", "ogg"];

const $ = (id) => document.getElementById(id);

const elements = {
    dropZone: $("dropZone"),
    fileInput: $("audio-file"),
    emptyState: $("upload-empty"),
    preview: $("audio-preview"),
    player: $("audio-player"),
    error: $("audio-error"),
    status: $("analysis-status"),
    analyzeButton: $("analyze-button"),
    clearButton: $("clear-file"),
    fileName: $("file-name"),
    fileMeta: $("file-meta"),
    fileSize: $("file-size"),
    fileType: $("file-type"),
    fileDuration: $("file-duration"),
};

let audioFile = null;
let previewUrl = null;
let wavesurfer = null;

const waveformContainer = $("waveform");

// ── Analyze button state ───────────────────────────────────────
const analyzeIcon  = $("analyze-icon");
const analyzeLabel = $("analyze-label");

function setAnalyzeButton(state) {
    const btn = elements.analyzeButton;
    switch (state) {
        case "idle":
            btn.disabled = true;
            btn.classList.add("opacity-50");
            analyzeIcon.className = "bx bx-analyse text-xl";
            analyzeLabel.textContent = "Start Analysis";
            break;
        case "ready":
            btn.disabled = false;
            btn.classList.remove("opacity-50");
            analyzeIcon.className = "bx bx-analyse text-xl";
            analyzeLabel.textContent = "Start Analysis";
            break;
        case "processing":
            btn.disabled = true;
            btn.classList.remove("opacity-50");
            analyzeIcon.className = "bx bx-loader-alt bx-spin text-xl";
            analyzeLabel.textContent = "Processing";
            break;
        case "done":
            btn.disabled = false;
            btn.classList.remove("opacity-50");
            analyzeIcon.className = "bx bx-check-circle text-xl";
            analyzeLabel.textContent = "Done";
            break;
    }
}

/**
 * Prevents browser navigation while a file is dragged over the page.
 */
function preventDefaults(event) {
    event.preventDefault();
    event.stopPropagation();
}

/**
 * Applies the active visual state used during drag and keyboard focus.
 */
function setDropZoneActive(isActive) {
    elements.dropZone.classList.toggle("border-cyan-200", isActive);
    elements.dropZone.classList.toggle("bg-cyan-200/[0.08]", isActive);
    elements.dropZone.classList.toggle("scale-[1.01]", isActive);
}

/**
 * Converts byte counts into a compact human-readable file size.
 */
function formatFileSize(bytes) {
    if (!bytes) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB"];
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const size = bytes / 1024 ** unitIndex;

    return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}


/**
 * Reads the extension from a filename for friendlier validation and labels.
 */
function getFileExtension(fileName) {
    return fileName.split(".").pop()?.toLowerCase() || "";
}

/**
 * Checks whether the selected file is compatible with KNA's intake.
 */
function validateAudioFile(file) {
    if (!file) {
        return "Choose an audio file to continue.";
    }

    const extension = getFileExtension(file.name);
    const hasAudioMime = file.type.startsWith("audio/");
    const hasSupportedExtension = SUPPORTED_EXTENSIONS.includes(extension);

    if (!hasAudioMime && !hasSupportedExtension) {
        return "That file does not look like supported audio. Try MP3, WAV, M4A, FLAC, or OGG.";
    }

    if (file.size > MAX_FILE_SIZE) {
        return "That audio file is over 50 MB. Try a lighter sample for this intake screen.";
    }

    return "";
}

/**
 * Updates the compact status pill in the upload panel.
 */
function setStatus(label, tone = "idle") {
    const toneClasses = {
        idle: "bg-slate-400",
        ready: "bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,.8)]",
        working: "bg-cyan-200 shadow-[0_0_14px_rgba(34,211,238,.8)]",
        error: "bg-rose-300 shadow-[0_0_14px_rgba(253,164,175,.8)]",
    };

    const statusDot = elements.status.querySelector("span");
    statusDot.className = `h-1.5 w-1.5 rounded-full ${toneClasses[tone] || toneClasses.idle}`;
    elements.status.lastChild.textContent = ` ${label}`;
}

/**
 * Shows or hides the validation error message.
 */
function setError(message) {
    elements.error.textContent = message;
    elements.error.classList.toggle("hidden", !message);
    setStatus(message ? "Needs audio" : "Waiting", message ? "error" : "idle");
}

/**
 * Tears down wavesurfer and revokes the object URL.
 */
function destroyWaveform() {
    if (wavesurfer) {
        wavesurfer.destroy();
        wavesurfer = null;
    }
    waveformContainer.classList.add("hidden");
    waveformContainer.innerHTML = "";
}

/**
 * Initializes a wavesurfer.js instance for the current preview URL.
 */
async function initWaveform(url) {
    destroyWaveform(); // clean slate

    // Dynamic import — keeps initial page load fast
    const { default: WaveSurfer } = await import(
        "https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.esm.js"
    );

    wavesurfer = WaveSurfer.create({
        container: waveformContainer,
        waveColor: "rgba(34,211,238,0.4)",
        progressColor: "rgba(34,211,238,0.85)",
        cursorColor: "rgba(16,185,129,0.9)",
        height: 64,
        barWidth: 2,
        barGap: 1,
        barRadius: 3,
        url,
    });

    waveformContainer.classList.remove("hidden");
}

/**
 * Resets the upload panel back to the empty state.
 */
function clearSelectedFile() {
    destroyWaveform();

    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
    }

    audioFile = null;
    activeProcessor = null;
    activeChunks = [];

    elements.fileInput.value = "";
    elements.player.removeAttribute("src");
    elements.player.load();
    elements.preview.classList.add("hidden");
    elements.emptyState.classList.remove("hidden");
    setAnalyzeButton("idle");
    elements.fileDuration.textContent = "N/A";
    heatmapElements.section.classList.add("hidden");
    setError("");
}

/**
 * Renders metadata and an audio preview for a validated file.
 */
function renderSelectedFile(file) {
    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
    }

    previewUrl = URL.createObjectURL(file);
    elements.player.src = previewUrl;
    elements.fileName.textContent = file.name;
    elements.fileMeta.textContent = `${formatFileSize(file.size)}`;
    elements.fileSize.textContent = formatFileSize(file.size);
    elements.fileType.textContent = file.type || getFileExtension(file.name).toUpperCase();
    elements.fileDuration.textContent = "Scanning";
    elements.emptyState.classList.add("hidden");
    elements.preview.classList.remove("hidden");
    setAnalyzeButton("ready");
    setStatus("Ready", "ready");

    initWaveform(previewUrl);
}

/**
 * Handles file selection from the picker or drag-and-drop.
 */
function handleFiles(fileList) {
    const file = fileList?.[0];
    const validationMessage = validateAudioFile(file);

    if (validationMessage) {
        clearSelectedFile();
        setError(validationMessage);
        return;
    }

    setError("");
    audioFile = file;
    renderSelectedFile(file);
}

/**
 * Wires all controls for the KNA audio upload experience.
 */
function setupAudioUpload() {
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
        document.body.addEventListener(eventName, preventDefaults);
        elements.dropZone.addEventListener(eventName, preventDefaults);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
        elements.dropZone.addEventListener(eventName, () => setDropZoneActive(true));
    });

    ["dragleave", "drop"].forEach((eventName) => {
        elements.dropZone.addEventListener(eventName, () => setDropZoneActive(false));
    });

    elements.dropZone.addEventListener("drop", (event) => {
        handleFiles(event.dataTransfer.files);
    });

    elements.dropZone.addEventListener("click", (event) => {
        if (event.target.closest("button") || event.target.closest("audio")) {
            return;
        }

        elements.fileInput.click();
    });

    elements.dropZone.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            elements.fileInput.click();
        }
    });

    elements.fileInput.addEventListener("change", (event) => {
        handleFiles(event.target.files);
    });

    elements.player.addEventListener("loadedmetadata", () => {
        elements.fileDuration.textContent = formatDuration(elements.player.duration);
    });

    elements.clearButton.addEventListener("click", (event) => {
        event.stopPropagation();
        clearSelectedFile();
    });

    elements.analyzeButton.addEventListener("click", () => {
        setAnalyzeButton("processing");
        handleAnalyseAudio();
    });
}

export function getPreviewUrl() {
    return previewUrl;
}

let activeProcessor = null;
let activeChunks = [];

// ── Heatmap rendering ─────────────────────────────────────────

const heatmapElements = {
    section:  $("heatmap-section"),
    summary:  $("heatmap-summary"),
    count:    $("heatmap-chunk-count"),
    timeline: $("heatmap-timeline"),
    ruler:    $("heatmap-ruler"),
    tooltip:  $("heatmap-tooltip"),
    swatches: $("heatmap-swatches"),
};

/**
 * Build a human-readable vibe label from RGB values.
 * Maps color temperature → emotional keyword.
 */
function getVibeLabel(r, g, b) {
    const brightness = (r + g + b) / 3;
    const warmth = (r - b) / 255; // -1 (cool/blue) → +1 (warm/red)
    const greenness = g / 255;

    if (brightness < 40)  return { label: "Dark",       emoji: "🌑" };
    if (brightness > 220) return { label: "Bright",     emoji: "✨" };
    if (warmth > 0.3)     return { label: "Energetic",  emoji: "🔥" };
    if (warmth < -0.2)    return { label: "Calm",       emoji: "🌊" };
    if (greenness > 0.6)  return { label: "Fresh",      emoji: "🌿" };
    if (warmth > 0.1)     return { label: "Warm",       emoji: "☀️" };
    return                         { label: "Mellow",     emoji: "🎵" };
}

/**
 * Compute vibe analytics from an array of chunks.
 * Returns frequency distribution + dominant / median / least-present.
 */
function computeAnalytics(chunks) {
    // Count occurrences of each vibe label
    const freq = new Map(); // label → { count, emoji, hex, r, g, b, rmsSum }

    for (const c of chunks) {
        const { label, emoji } = getVibeLabel(c.r, c.g, c.b);
        const existing = freq.get(label);
        if (existing) {
            existing.count++;
            existing.rmsSum += c.rms;
        } else {
            freq.set(label, {
                count: 1,
                emoji,
                hex: c.hex,
                r: c.r, g: c.g, b: c.b,
                rmsSum: c.rms,
            });
        }
    }

    // Sort by frequency descending
    const sorted = [...freq.entries()]
        .map(([label, data]) => ({
            label,
            ...data,
            pct: data.count / chunks.length,
            avgRms: data.rmsSum / data.count,
        }))
        .sort((a, b) => b.count - a.count);

    const dominant = sorted[0] ?? null;
    const least    = sorted[sorted.length - 1] ?? null;

    // Median: the vibe at the midpoint of the sorted-by-count list
    const midIdx = Math.floor(sorted.length / 2);
    const median = sorted[midIdx] ?? null;

    return { sorted, dominant, median, least, totalChunks: chunks.length };
}

/**
 * Render the full heatmap: timeline bar, time ruler, swatches, analytics, tooltip.
 */
function renderHeatmap(chunks) {
    activeChunks = chunks;

    // Show the section
    heatmapElements.section.classList.remove("hidden");

    // Summary
    const totalDuration = chunks[chunks.length - 1]?.index + 1 ?? 0;
    heatmapElements.summary.textContent = `${totalDuration}s of audio analyzed`; 
    heatmapElements.count.textContent = `${chunks.length} chunks`;

    // ── Timeline bar ──
    heatmapElements.timeline.innerHTML = "";
    chunks.forEach((c) => {
        const seg = document.createElement("div");
        seg.className = "h-full flex-1 transition-transform hover:scale-y-110 hover:z-10 relative";
        seg.style.backgroundColor = c.hex;
        seg.dataset.index = c.index;

        // Hover → tooltip
        seg.addEventListener("mouseenter", (e) => showTooltip(e, c));
        seg.addEventListener("mousemove", (e) => moveTooltip(e));
        seg.addEventListener("mouseleave", hideTooltip);

        heatmapElements.timeline.appendChild(seg);
    });

    // ── Time ruler ──
    heatmapElements.ruler.innerHTML = "";
    const step = totalDuration <= 30 ? 1 : totalDuration <= 120 ? 5 : 10;
    for (let s = 0; s <= totalDuration; s += step) {
        const tick = document.createElement("span");
        tick.textContent = `${s}s`;
        tick.className = "absolute";
        tick.style.left = `${(s / totalDuration) * 100}%`;
        tick.style.transform = "translateX(-50%)";
        heatmapElements.ruler.appendChild(tick);
    }

    // ── Per-chunk swatches ──
    heatmapElements.swatches.innerHTML = "";
    chunks.forEach((c) => {
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className =
            "group relative flex flex-col items-center rounded-md border border-white/10 bg-white/[0.03] p-1.5 transition hover:border-white/25 hover:bg-white/[0.06]";
        swatch.dataset.index = c.index;

        swatch.innerHTML = `
            <div class="h-6 w-full rounded-sm" style="background-color: ${c.hex}"></div>
            <span class="mt-1 text-[9px] text-slate-500 group-hover:text-slate-300">${c.index}s</span>
        `;

        swatch.addEventListener("mouseenter", (e) => showTooltip(e, c));
        swatch.addEventListener("mousemove", (e) => moveTooltip(e));
        swatch.addEventListener("mouseleave", hideTooltip);

        heatmapElements.swatches.appendChild(swatch);
    });

    // ── Analytics ──
    renderAnalytics(chunks);
}

/** Position and populate the floating tooltip. */
function showTooltip(event, chunk) {
    const { label, emoji } = getVibeLabel(chunk.r, chunk.g, chunk.b);
    heatmapElements.tooltip.innerHTML = `
        <div class="flex items-center gap-2 mb-1">
            <span class="inline-block h-3 w-3 rounded-sm" style="background:${chunk.hex}"></span>
            <span class="font-semibold text-white">${chunk.hex}</span>
            <span>${emoji} ${label}</span>
        </div>
        <div class="text-slate-400">
            <span class="text-slate-300">${chunk.index}s</span>
            &nbsp;·&nbsp; float16 <span class="text-slate-300">${chunk.float16}</span>
            &nbsp;·&nbsp; RMS <span class="text-slate-300">${chunk.rms.toFixed(4)}</span>
            &nbsp;·&nbsp; <span class="text-slate-300">${chunk.centroid.toFixed(0)}Hz</span>
        </div>
    `;
    heatmapElements.tooltip.classList.remove("hidden");
    moveTooltip(event);
}

function moveTooltip(event) {
    const tip = heatmapElements.tooltip;
    tip.style.left = `${event.clientX + 12}px`;
    tip.style.top  = `${event.clientY - 10}px`;
}

function hideTooltip() {
    heatmapElements.tooltip.classList.add("hidden");
}

// ── Analytics rendering ────────────────────────────────────────

const analyticsElements = {
    container:    $("heatmap-analytics"),
    dominantSw:   $("dominant-swatch"),
    dominantLbl:  $("dominant-label"),
    dominantPct:  $("dominant-pct"),
    medianSw:     $("median-swatch"),
    medianLbl:    $("median-label"),
    medianPct:    $("median-pct"),
    leastSw:      $("least-swatch"),
    leastLbl:     $("least-label"),
    leastPct:     $("least-pct"),
    breakdown:    $("vibe-breakdown"),
    legend:       $("vibe-legend"),
};

function renderAnalytics(chunks) {
    const { sorted, dominant, median, least, totalChunks } = computeAnalytics(chunks);

    analyticsElements.container.classList.remove("hidden");

    // Helper to fill a stat card
    function fillCard(swatch, label, pct, data) {
        if (!data) {
            swatch.style.backgroundColor = "transparent";
            label.textContent = "—";
            pct.textContent = "";
            return;
        }
        swatch.style.backgroundColor = data.hex;
        label.textContent = `${data.emoji} ${data.label}`;
        const seconds = data.count;
        pct.textContent = `${seconds} chunk${seconds !== 1 ? "s" : ""} · ${(data.pct * 100).toFixed(1)}% · avg RMS ${data.avgRms.toFixed(4)}`;
    }

    fillCard(analyticsElements.dominantSw, analyticsElements.dominantLbl, analyticsElements.dominantPct, dominant);
    fillCard(analyticsElements.medianSw,   analyticsElements.medianLbl,   analyticsElements.medianPct,   median);
    fillCard(analyticsElements.leastSw,    analyticsElements.leastLbl,    analyticsElements.leastPct,    least);

    // ── Breakdown bar ──
    analyticsElements.breakdown.innerHTML = "";
    analyticsElements.legend.innerHTML = "";

    sorted.forEach((v) => {
        // Bar segment
        const seg = document.createElement("div");
        seg.className = "h-full transition-all";
        seg.style.width = `${(v.pct * 100).toFixed(2)}%`;
        seg.style.backgroundColor = v.hex;
        seg.title = `${v.emoji} ${v.label}: ${v.count}s (${(v.pct * 100).toFixed(1)}%)`;
        analyticsElements.breakdown.appendChild(seg);

        // Legend entry
        const entry = document.createElement("span");
        entry.innerHTML = `<span class="inline-block h-2 w-2 rounded-sm align-middle" style="background:${v.hex}"></span> ${v.emoji} ${v.label} ${(v.pct * 100).toFixed(0)}%`;
        analyticsElements.legend.appendChild(entry);
    });
}

// ── Analysis handler ───────────────────────────────────────────

async function handleAnalyseAudio() {
    activeProcessor = new AudioProcessor();
    try {
        setStatus("Decoding", "working");
        const infos = await activeProcessor.load(previewUrl);
        console.log("Audio loaded:", infos);

        setStatus("Chunking", "working");
        const chunks = activeProcessor.chunkAudioBuffer();
        console.log(`Split into ${chunks.length} chunk(s):`);
        chunks.forEach((c) => {
            console.log(
                `  [${c.index}s] float16=${c.float16}  rms=${c.rms.toFixed(4)}  centroid=${c.centroid.toFixed(0)}Hz  color=${c.hex}`
            );
        });

        setStatus("Rendering", "working");
        renderHeatmap(chunks);

        setAnalyzeButton("done");
        setStatus("Done", "ready");
    } catch (err) {
        console.error(err);
        setAnalyzeButton("idle");
        setError("Failed to decode audio.");
        setStatus("Error", "error");
    }
}

setupAudioUpload();
