
const FLOAT16_BUFFER = new ArrayBuffer(4);
const FLOAT16_VIEW = new DataView(FLOAT16_BUFFER);

/**
 * Convert a float32 value to IEEE 754 float16 (half-precision).
 * Returns the raw 16-bit unsigned integer representation.
 *
 * Float16 layout: 1 sign | 5 exponent (bias 15) | 10 mantissa
 *
 * @param {number} num  Any finite float32 value.
 * @returns {number}    Unsigned 16-bit integer (0–65535).
 */
export function float32ToFloat16(num) {
    FLOAT16_VIEW.setFloat32(0, num, false);
    const raw = FLOAT16_VIEW.getUint32(0, false);

    const sign = (raw >>> 31) & 0x1;
    let exponent = ((raw >>> 23) & 0xff) - 127 + 15; // re-bias from 127 → 15
    let mantissa = (raw >>> 13) & 0x3ff;              // top 10 bits of 23-bit mantissa

    // Round to nearest even on the dropped 13 bits
    const dropped = (raw >>> 10) & 0x7;
    if (dropped > 0x4 || (dropped === 0x4 && (mantissa & 1))) {
        mantissa++;
        if (mantissa === 0x400) {
            // Mantissa overflow → bump exponent
            mantissa = 0;
            exponent++;
        }
    }

    // Overflow → ±Infinity
    if (exponent >= 0x1f) return (sign << 15) | 0x7c00;

    // Underflow → flush to zero (no denormals)
    if (exponent <= 0) return (sign << 15);

    return (sign << 15) | ((exponent & 0x1f) << 10) | mantissa;
}

/**
 * Convert a float16 integer to an {r, g, b} object via RGB565.
 * Bits 15–11 → R (5 bits), 10–5 → G (6 bits), 4–0 → B (5 bits).
 *
 * @param {number} f16  Unsigned 16-bit float16 integer.
 * @returns {{r: number, g: number, b: number}}  0–255 per channel.
 */
export function float16ToRGB(f16) {
    const r5 = (f16 >>> 11) & 0x1f;
    const g6 = (f16 >>> 5) & 0x3f;
    const b5 = f16 & 0x1f;

    // Scale 5/6-bit values to 0–255
    return {
        r: Math.round((r5 / 31) * 255),
        g: Math.round((g6 / 63) * 255),
        b: Math.round((b5 / 31) * 255),
    };
}

/**
 * Compute RMS (root mean square) of a Float32Array — proxy for loudness.
 *
 * @param {Float32Array} samples
 * @returns {number}  RMS value in 0–1 range for audio.
 */
function computeRMS(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
}

/**
 * Compute spectral centroid — weighted mean of frequencies.
 * Higher values = brighter/higher-pitched sound.
 *
 * Uses a simple DFT approximation on the raw samples.
 *
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @returns {number}  Centroid in Hz.
 */
function computeSpectralCentroid(samples, sampleRate) {
    const n = samples.length;
    let weightedSum = 0;
    let magnitudeSum = 0;

    // Cooley–Tukey FFT is overkill for a demo; use a Goertzel-style
    // magnitude scan across a handful of frequency bands.
    const numBins = 64;
    const binWidth = sampleRate / n;

    for (let k = 1; k <= numBins; k++) {
        const freq = k * binWidth * (n / (2 * numBins));
        const omega = (2 * Math.PI * k) / numBins;
        let real = 0;
        let imag = 0;

        // Sample a subset for speed (every 4th sample)
        for (let i = 0; i < n; i += 4) {
            const angle = omega * i;
            real += samples[i] * Math.cos(angle);
            imag -= samples[i] * Math.sin(angle);
        }

        const mag = Math.sqrt(real * real + imag * imag);
        weightedSum += freq * mag;
        magnitudeSum += mag;
    }

    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
}

/**
 * Encapsulates all Web Audio API state and processing logic.
 * One instance per analysis session — no module-level globals.
 */
export class AudioProcessor {
    /** @type {AudioContext|null} */
    #audioCtx = null;

    /** @type {AudioBuffer|null} decoded (mono) audio buffer */
    #audioBuffer = null;

    /** @type {ArrayBuffer|null} raw fetched bytes */
    #arrayBuffer = null;

    // ── AudioContext lifecycle ────────────────────────────────────

    /** Lazily create (or return existing) AudioContext. */
    #ensureContext() {
        if (!this.#audioCtx) {
            this.#audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.#audioCtx;
    }

    /** Resume a suspended context (required after user gesture on some browsers). */
    async resume() {
        const ctx = this.#ensureContext();
        if (ctx.state === "suspended") {
            await ctx.resume();
        }
    }

    // ── Core pipeline ────────────────────────────────────────────

    /**
     * Down-mix a decoded AudioBuffer to mono.
     * Uses OfflineAudioContext when available, with a sample-level fallback.
     *
     * @param {AudioBuffer} decodedBuffer
     * @returns {Promise<AudioBuffer>}
     */
    async #downmixToMono(decodedBuffer) {
        if (!decodedBuffer || decodedBuffer.numberOfChannels <= 1) {
            return decodedBuffer;
        }

        const OfflineCtx =
            window.OfflineAudioContext || window.webkitOfflineAudioContext;

        // Fallback: manual sample-averaging (very old browsers)
        if (!OfflineCtx) {
            const merged = this.#ensureContext().createBuffer(
                1,
                decodedBuffer.length,
                decodedBuffer.sampleRate,
            );
            const out = merged.getChannelData(0);
            const nCh = decodedBuffer.numberOfChannels;

            for (let i = 0; i < decodedBuffer.length; i++) {
                let sum = 0;
                for (let ch = 0; ch < nCh; ch++) {
                    sum += decodedBuffer.getChannelData(ch)[i];
                }
                out[i] = sum / nCh;
            }
            return merged;
        }

        // Preferred path: render through an offline graph
        const offlineCtx = new OfflineCtx(1, decodedBuffer.length, decodedBuffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = decodedBuffer;

        const splitter = offlineCtx.createChannelSplitter(decodedBuffer.numberOfChannels);
        const merger = offlineCtx.createChannelMerger(1);
        const gainPerChannel = 1 / decodedBuffer.numberOfChannels;

        source.connect(splitter);

        for (let ch = 0; ch < decodedBuffer.numberOfChannels; ch++) {
            const gain = offlineCtx.createGain();
            gain.gain.value = gainPerChannel;
            splitter.connect(gain, ch, 0);
            gain.connect(merger, 0, 0);
        }

        merger.connect(offlineCtx.destination);
        source.start(0);

        return offlineCtx.startRendering();
    }

    /**
     * Slice the mono buffer into 1-second chunks.
     * Each chunk is converted from float32 → float16 (IEEE 754 half-precision)
     * and paired with an RGB565 color derived from the 16-bit representation.
     *
     * @returns {{
     *   index:    number,
     *   samples:  number[],   // float16 integers (0–65535)
     *   rms:      number,     // loudness proxy (0–1)
     *   centroid: number,     // spectral centroid in Hz
     *   float16:  number,     // representative float16 for this chunk
     *   r: number, g: number, b: number,  // RGB565 color channels (0–255)
     *   hex: string           // CSS hex color
     * }[]>}
     */
    chunkAudioBuffer() {
        if (!this.#audioBuffer) {
            throw new Error("No audio loaded — call load() first.");
        }

        const channelData = this.#audioBuffer.getChannelData(0);
        const sampleRate = this.#audioBuffer.sampleRate;
        const totalSamples = channelData.length;
        const chunks = [];
        let index = 0;

        for (let offset = 0; offset < totalSamples; offset += sampleRate) {
            const end = Math.min(offset + sampleRate, totalSamples);
            const segment = channelData.subarray(offset, end);

            // ── Per-sample: float32 → float16 ──
            const float16Samples = Array.from(segment, float32ToFloat16);

            // ── Per-chunk features ──
            const rms = computeRMS(segment);
            const centroid = computeSpectralCentroid(segment, sampleRate);

            // ── Map RMS to a representative float16 ──
            // Scale RMS (0–1) into the full float16 range for color mapping
            const scaledRMS = rms * 2 - 1; // map 0..1 → -1..1 for float16 symmetry
            const chunkFloat16 = float32ToFloat16(scaledRMS);

            // ── float16 → RGB565 color ──
            const { r, g, b } = float16ToRGB(chunkFloat16);
            const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

            chunks.push({
                index,
                samples: float16Samples,
                rms,
                centroid,
                float16: chunkFloat16,
                r, g, b, hex,
            });

            index++;
        }

        return chunks;
    }

    // ── Public API ───────────────────────────────────────────────

    /**
     * Fetch → decode → down-mix to mono.
     * Stores the result internally and returns audio metadata.
     *
     * @param {string} url  Audio file URL (blob: or remote).
     * @returns {Promise<Object>} Metadata about the decoded audio.
     */
    async load(url) {
        this.#ensureContext();

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        this.#arrayBuffer = await response.arrayBuffer();

        const decodedBuffer = await this.#audioCtx.decodeAudioData(this.#arrayBuffer);
        this.#audioBuffer = await this.#downmixToMono(decodedBuffer);

        return this.getInfos();
    }

    /** @returns {AudioBuffer|null} The current decoded mono buffer. */
    get buffer() {
        return this.#audioBuffer;
    }

    /** @returns {ArrayBuffer|null} The raw fetched bytes. */
    get rawBuffer() {
        return this.#arrayBuffer;
    }

    /**
     * Return metadata about the currently loaded audio.
     * @returns {Object}
     */
    getInfos() {
        if (!this.#audioBuffer) {
            return null;
        }

        return {
            arr_buff: this.#arrayBuffer,
            audioBuffer: this.#audioBuffer.toString(),
            length: this.#audioBuffer.length,
            n_channels: this.#audioBuffer.numberOfChannels,
            sampleRate: this.#audioBuffer.sampleRate + "Hz",
            duration: AudioProcessor.formatDuration(this.#audioBuffer.duration),
        };
    }

    // ── Utilities ────────────────────────────────────────────────

    /**
     * Formats seconds into a human-readable timestamp.
     * @param {number} seconds
     * @returns {string}
     */
    static formatDuration(seconds) {
        if (!Number.isFinite(seconds)) {
            return "Unknown";
        }
        const minutes = Math.floor(seconds / 60);
        const remainder = Math.round(seconds % 60).toString().padStart(2, "0");
        return `${minutes}:${remainder}`;
    }
}

/* ── Re-export convenience so existing imports don't break ── */
export const formatDuration = AudioProcessor.formatDuration;

/**
 * Legacy wrapper — keeps app.js working without changes during the refactor.
 * Prefer `new AudioProcessor().load(url)` going forward.
 */
export async function getAudioInfos(url) {
    const processor = new AudioProcessor();
    return processor.load(url);
}
