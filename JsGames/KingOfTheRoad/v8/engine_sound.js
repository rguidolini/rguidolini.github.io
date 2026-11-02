/**
 * Sistema de áudio do Kenworth W900:
 *  - Partida e funcionamento normal do motor usando os áudios customizados `audio/start_up_engine.mp3` e
 *    `audio/regular_engine.mp3`, concatenados sample-a-sample em um único AudioBuffer contínuo com loop
 *    de fase alinhada e modulação dinâmica de RPM/carga/marchas Eaton Fuller.
 *  - Síntese física procedural em tempo real para o calço/parada do motor, válvula pneumática Westinghouse
 *    do freio estacionário, sopro do seletor de caixa, buzina a ar Columbia dupla de ferro fundido (100 PSI),
 *    efeitos Foley físicos da carreta (5ª roda e tecla T) e stingers de vitória/falha de fase.
 */

export const ENGINE_STARTUP_DURATION = 1.21;
export const DEFAULT_ENGINE_VARIANT = 6;
export const VALID_ENGINE_VARIANTS = [6, 7, 1, 2, 4, 5];
// Nível geral dos sons que não são de motor (1.0 = volume original)
export const DEFAULT_SFX_VOLUME = 1.0;
// Volumes individuais de cada efeito (1.0 = volume original/padrão)
export const SFX_KINDS = ['horn', 'air', 'hitch', 'fifthWheel', 'success', 'fail', 'alert'];
// Som de alerta (acompanha as notificações de aviso)
const ALERT_AUDIO_URL = new URL('./audio/alert.mp3', import.meta.url).href;
const ALERT_MIN_INTERVAL_MS = 600;
// Som de falha de fase (arquivo customizado); se não carregar, usa o stinger procedural antigo
const FAIL_AUDIO_URL = new URL('./audio/fail.mp3', import.meta.url).href;
// Buzina (arquivo customizado de 3 s): ataque 0..~0.6 s, tom sustentado até ~2.05 s, cauda natural até 3 s.
// Enquanto o botão é segurado, a região sustentada fica em loop (com crossfade); ao soltar, toca a cauda do arquivo.
const HORN_AUDIO_URL = new URL('./audio/horn.mp3', import.meta.url).href;
const HORN_LOOP_START_SEC = 0.75;
const HORN_LOOP_END_SEC = 2.0;
const HORN_TAIL_START_SEC = 2.0;
const HORN_LOOP_XFADE_SEC = 0.08;
const HORN_RELEASE_XFADE_SEC = 0.04;

const PROCEDURAL_STARTUP_DURATION = 2.32;
const SCANIA_GRAVE_BASE_RATE = 0.78;
const STARTUP_ENGINE_AUDIO_URL = new URL('./audio/start_up_engine.mp3', import.meta.url).href;
const REGULAR_ENGINE_AUDIO_URL = new URL('./audio/regular_engine.mp3', import.meta.url).href;
const BASE_SAMPLE_ENGINE_GAIN = 1.18;

let _rawEngineBytesPromise = null;
function fetchRawEngineAudioBytes() {
    if (_rawEngineBytesPromise) return _rawEngineBytesPromise;
    if (typeof fetch !== 'function') {
        return Promise.reject(new Error('fetch unavailable'));
    }
    _rawEngineBytesPromise = Promise.all([
        fetch(STARTUP_ENGINE_AUDIO_URL).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.arrayBuffer();
        }),
        fetch(REGULAR_ENGINE_AUDIO_URL).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.arrayBuffer();
        })
    ]).catch((err) => {
        _rawEngineBytesPromise = null;
        throw err;
    });
    return _rawEngineBytesPromise;
}

/**
 * Concatena `start_up_engine` + `regular_engine` em um único AudioBuffer contínuo
 * sem gap entre o fim da partida e o início do funcionamento normal, e constrói um
 * ponto de loop com alinhamento de fase na região estacionária (12s..31.5s) antes do fade-out final.
 */
function buildSeamlessEngineAudioBuffer(ctx, startupBuf, regularBuf) {
    const sr = startupBuf.sampleRate || ctx.sampleRate || 48000;
    const stuRaw = startupBuf.getChannelData(0);
    const regRaw = regularBuf.getChannelData(0);

    // 1. Remove o silêncio inicial (~115 ms) da partida mantendo ~4 ms de pré-roll,
    //    e descarta eventual zero-padding final de frame MP3 para emenda exata.
    let firstActiveStu = 0;
    for (let i = 0; i < stuRaw.length; i++) {
        if (Math.abs(stuRaw[i]) > 0.0006) {
            firstActiveStu = i;
            break;
        }
    }
    const preRoll = Math.round(0.004 * sr);
    const stuStart = firstActiveStu > preRoll ? firstActiveStu - preRoll : 0;

    let lastActiveStu = stuRaw.length - 1;
    for (let i = stuRaw.length - 1; i >= stuStart; i--) {
        if (Math.abs(stuRaw[i]) > 0.0008) {
            lastActiveStu = i;
            break;
        }
    }
    const stuEnd = Math.max(stuStart + 1, lastActiveStu + 1);
    const stuLen = stuEnd - stuStart;

    // 2. Descarta eventual atraso de encoder MP3 (zeros iniciais) no começo de regular_engine.
    let regStart = 0;
    const maxLeadScan = Math.min(regRaw.length, Math.round(0.08 * sr));
    for (let i = 0; i < maxLeadScan; i++) {
        if (Math.abs(regRaw[i]) > 0.0008) {
            regStart = i;
            break;
        }
    }
    const regAvail = Math.max(1, regRaw.length - regStart);

    // 3. Seleciona loopStart (~12.0s) e busca loopEnd (~30.5s..31.6s) com máxima correlação de fase
    //    em janela de 160 ms, evitando o fade-out final (49.5s..61.3s) do arquivo.
    const xfadeLen = Math.min(Math.round(0.16 * sr), Math.floor(regAvail * 0.12));
    let loopStartRel = Math.min(Math.round(12.0 * sr), Math.floor(regAvail * 0.25));
    loopStartRel = Math.max(xfadeLen + 64, loopStartRel);

    const searchMin = Math.min(regAvail - 32, Math.max(loopStartRel + xfadeLen * 2, Math.round(30.5 * sr)));
    const searchMax = Math.min(regAvail - 16, Math.max(searchMin + 16, Math.round(31.6 * sr)));

    let bestEndRel = searchMin;
    let bestCorr = 0.0;

    if (xfadeLen >= 64 && searchMax > searchMin) {
        let refEnergy = 0.0;
        for (let k = 0; k < xfadeLen; k += 8) {
            const v = regRaw[regStart + loopStartRel - xfadeLen + k];
            refEnergy += v * v;
        }
        const refNorm = Math.sqrt(refEnergy) + 1e-12;

        let coarseBest = -2.0;
        for (let cand = searchMin; cand <= searchMax; cand += 16) {
            let dot = 0.0;
            let segEnergy = 0.0;
            const baseCand = regStart + cand - xfadeLen;
            const baseRef = regStart + loopStartRel - xfadeLen;
            for (let k = 0; k < xfadeLen; k += 8) {
                const a = regRaw[baseRef + k];
                const b = regRaw[baseCand + k];
                dot += a * b;
                segEnergy += b * b;
            }
            const corr = dot / (refNorm * Math.sqrt(segEnergy) + 1e-12);
            if (corr > coarseBest) {
                coarseBest = corr;
                bestEndRel = cand;
            }
        }

        const fineLo = Math.max(searchMin, bestEndRel - 20);
        const fineHi = Math.min(searchMax, bestEndRel + 20);
        let fineRefEnergy = 0.0;
        for (let k = 0; k < xfadeLen; k += 2) {
            const v = regRaw[regStart + loopStartRel - xfadeLen + k];
            fineRefEnergy += v * v;
        }
        const fineRefNorm = Math.sqrt(fineRefEnergy) + 1e-12;

        let fineBest = -2.0;
        for (let cand = fineLo; cand <= fineHi; cand++) {
            let dot = 0.0;
            let segEnergy = 0.0;
            const baseCand = regStart + cand - xfadeLen;
            const baseRef = regStart + loopStartRel - xfadeLen;
            for (let k = 0; k < xfadeLen; k += 2) {
                const a = regRaw[baseRef + k];
                const b = regRaw[baseCand + k];
                dot += a * b;
                segEnergy += b * b;
            }
            const corr = dot / (fineRefNorm * Math.sqrt(segEnergy) + 1e-12);
            if (corr > fineBest) {
                fineBest = corr;
                bestEndRel = cand;
            }
        }
        bestCorr = Math.max(0.0, Math.min(1.0, fineBest));
    } else {
        bestEndRel = Math.min(regAvail, Math.round(48.0 * sr));
        loopStartRel = Math.min(Math.floor(bestEndRel * 0.25), Math.round(4.0 * sr));
    }

    const regKeepLen = Math.max(loopStartRel + 64, bestEndRel);
    const totalLen = stuLen + regKeepLen;
    const outBuf = ctx.createBuffer(1, totalLen, sr);
    const out = outBuf.getChannelData(0);

    // Copia start_up_engine com micro fade-in de 1 ms para evitar clique DC na largada
    for (let i = 0; i < stuLen; i++) {
        out[i] = stuRaw[stuStart + i];
    }
    const headFade = Math.min(48, stuLen);
    for (let i = 0; i < headFade; i++) {
        out[i] *= i / headFade;
    }

    // Apenda regular_engine imediatamente após start_up_engine
    for (let i = 0; i < regKeepLen; i++) {
        out[stuLen + i] = regRaw[regStart + i];
    }

    // Suaviza micro-degrau residual (< 1 ms) caso o decodificador MP3 do navegador tenha deslocamento mínimo
    if (stuLen > 0 && regKeepLen > 64) {
        const seamStep = out[stuLen - 1] - out[stuLen];
        const declickLen = 48;
        for (let k = 0; k < declickLen; k++) {
            const w = 0.5 * (1.0 + Math.cos(Math.PI * ((k + 1) / declickLen)));
            out[stuLen + k] += seamStep * w;
        }
    }

    // Crossfade de fase alinhada nos últimos 160 ms antes de loopEnd para que loopEnd -> loopStart seja 100% contínuo
    if (xfadeLen >= 32 && regKeepLen > xfadeLen + loopStartRel) {
        const dstStart = stuLen + regKeepLen - xfadeLen;
        const refStart = regStart + loopStartRel - xfadeLen;
        const tailStart = regStart + regKeepLen - xfadeLen;
        for (let k = 0; k < xfadeLen; k++) {
            const u = 0.5 * (1.0 - Math.cos(Math.PI * ((k + 1) / xfadeLen)));
            const a = regRaw[tailStart + k];
            const b = regRaw[refStart + k];
            const energyNorm = Math.sqrt((1.0 - u) * (1.0 - u) + u * u + 2.0 * u * (1.0 - u) * bestCorr);
            out[dstStart + k] = ((1.0 - u) * a + u * b) / Math.max(0.7071, energyNorm);
        }
    }

    return {
        buffer: outBuf,
        startupDurationSec: stuLen / sr,
        loopStartSec: (stuLen + loopStartRel) / sr,
        loopEndSec: (stuLen + regKeepLen) / sr
    };
}

function createW900DspCore(sampleRate) {
    const fs = sampleRate || 48000;
    const invFs = 1.0 / fs;
    const TWO_PI = Math.PI * 2.0;
    const noiseFsScale = Math.sqrt(fs / 48000.0);

    // PRNG rápido (xorshift32) para turbulência de gases e variação estocástica ciclo-a-ciclo
    let rngState = 0x9e3779b9;
    const whiteNoise = () => {
        rngState ^= rngState << 13;
        rngState ^= rngState >>> 17;
        rngState ^= rngState << 5;
        return (((rngState >>> 0) / 2147483648.0) - 1.0);
    };

    // Tabela rápida para exp(-x) em [0, 24]
    const LUT_N = 4096;
    const EXP_LUT = new Float32Array(LUT_N + 1);
    for (let i = 0; i <= LUT_N; i++) {
        EXP_LUT[i] = Math.exp((-24.0 * i) / LUT_N);
    }
    const fastExpNeg = (x) => {
        if (x >= 24.0) return 0.0;
        if (x <= 0.0) return 1.0;
        return EXP_LUT[(x * (LUT_N / 24.0)) | 0];
    };

    // Aproximação racional rápida e C^1-suave de tanh(x)
    const fastTanh = (x) => {
        if (x > 4.5) return 1.0;
        if (x < -4.5) return -1.0;
        const x2 = x * x;
        return (x * (27.0 + x2)) / (27.0 + 9.0 * x2);
    };

    // Filtro Biquad RBJ (LP, BP e Peaking EQ)
    const makeBiquad = (mode, f0, q, gainDb = 0.0) => {
        const flt = {
            mode,
            b0: 1.0, b1: 0.0, b2: 0.0,
            a1: 0.0, a2: 0.0,
            x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0
        };
        retuneBiquad(flt, f0, q, gainDb);
        return flt;
    };

    const retuneBiquad = (flt, f0, q, gainDb = 0.0) => {
        const clampedF = Math.max(18.0, Math.min(fs * 0.44, f0));
        const w0 = TWO_PI * clampedF * invFs;
        const cw = Math.cos(w0);
        const sw = Math.sin(w0);
        const alpha = sw / (2.0 * Math.max(0.15, q));
        let b0 = 1.0, b1 = 0.0, b2 = 0.0, a0 = 1.0, a1 = 0.0, a2 = 0.0;

        if (flt.mode === 'lp') {
            b0 = (1.0 - cw) * 0.5;
            b1 = 1.0 - cw;
            b2 = (1.0 - cw) * 0.5;
            a0 = 1.0 + alpha;
            a1 = -2.0 * cw;
            a2 = 1.0 - alpha;
        } else if (flt.mode === 'bp') {
            b0 = alpha;
            b1 = 0.0;
            b2 = -alpha;
            a0 = 1.0 + alpha;
            a1 = -2.0 * cw;
            a2 = 1.0 - alpha;
        } else if (flt.mode === 'peak') {
            const A = Math.pow(10.0, gainDb / 40.0);
            b0 = 1.0 + alpha * A;
            b1 = -2.0 * cw;
            b2 = 1.0 - alpha * A;
            a0 = 1.0 + alpha / A;
            a1 = -2.0 * cw;
            a2 = 1.0 - alpha / A;
        }

        const invA0 = 1.0 / a0;
        flt.b0 = b0 * invA0;
        flt.b1 = b1 * invA0;
        flt.b2 = b2 * invA0;
        flt.a1 = a1 * invA0;
        flt.a2 = a2 * invA0;
    };

    const stepBiquad = (flt, x) => {
        const y = flt.b0 * x + flt.b1 * flt.x1 + flt.b2 * flt.x2 - flt.a1 * flt.y1 - flt.a2 * flt.y2;
        flt.x2 = flt.x1;
        flt.x1 = x;
        flt.y2 = flt.y1;
        flt.y1 = y;
        return y;
    };

    // Guia de ondas acústico amortecido das ponteiras verticais abertas (suporta ajuste dinâmico sem cliques)
    const pipeCap = Math.max(64, Math.ceil(0.022 * fs));
    const makeWideStackPipe = (delaySec, reflGain, lpfCutoffHz) => {
        const initSamples = Math.max(8, Math.min(pipeCap - 3, Math.round(delaySec * fs)));
        return {
            buf: new Float32Array(pipeCap),
            cap: pipeCap,
            writeIdx: 0,
            curDelay: initSamples,
            targetDelay: initSamples,
            reflGain,
            lp: 0.0,
            lpA: 1.0 - Math.exp(-TWO_PI * lpfCutoffHz * invFs)
        };
    };

    const retuneWideStackPipe = (pipe, delaySec, reflGain, lpfCutoffHz) => {
        pipe.targetDelay = Math.max(8, Math.min(pipe.cap - 3, Math.round(delaySec * fs)));
        pipe.reflGain = reflGain;
        pipe.lpA = 1.0 - Math.exp(-TWO_PI * lpfCutoffHz * invFs);
    };

    const stepWideStackPipe = (pipe, xIn) => {
        if (pipe.curDelay !== pipe.targetDelay) {
            pipe.curDelay += (pipe.targetDelay - pipe.curDelay) * 0.0025;
            if (Math.abs(pipe.targetDelay - pipe.curDelay) < 0.005) {
                pipe.curDelay = pipe.targetDelay;
            }
        }
        const dInt = Math.floor(pipe.curDelay);
        const frac = pipe.curDelay - dInt;
        const r0 = (pipe.writeIdx - dInt + pipe.cap) % pipe.cap;
        let delayed = pipe.buf[r0];
        if (frac > 0.0) {
            const r1 = (r0 - 1 + pipe.cap) % pipe.cap;
            delayed += frac * (pipe.buf[r1] - delayed);
        }
        pipe.lp += (delayed - pipe.lp) * pipe.lpA;
        pipe.buf[pipe.writeIdx] = xIn + pipe.reflGain * pipe.lp;
        pipe.writeIdx = (pipe.writeIdx + 1) % pipe.cap;
        return 0.68 * xIn + 0.52 * delayed;
    };

    // Ressonador físico amortecido calibrado por fator de qualidade Q (tau = Q / (pi * f0)):
    // evita oscilações senoidais longas e reproduz madeira maciça (Q = 2.5..4.8) e ferro velho (Q = 4.5..10.5)
    const makeDampedMode = (f0, q) => {
        const clampedF = Math.max(24.0, Math.min(fs * 0.43, f0));
        const effQ = Math.max(0.6, q);
        const w = TWO_PI * clampedF * invFs;
        const tau = effQ / (Math.PI * clampedF);
        const r = Math.exp(-invFs / tau);
        const norm = Math.exp(Math.PI / (4.0 * effQ));
        return {
            b0: Math.sin(w) * norm,
            a1: -2.0 * r * Math.cos(w),
            a2: r * r,
            y1: 0.0,
            y2: 0.0
        };
    };

    const stepDampedMode = (m, impulse) => {
        const y = m.b0 * impulse - m.a1 * m.y1 - m.a2 * m.y2;
        m.y2 = m.y1;
        m.y1 = y;
        return y;
    };

    const resetDampedMode = (m) => {
        m.y1 = 0.0;
        m.y2 = 0.0;
    };

    // Pulso de contato elástico de Hertz (meia-senoide de área = amp em durSec segundos)
    const makeHertzHammer = () => ({ len: 4, rem: 0, amp: 0.0 });
    const fireHertzHammer = (h, durSec, amp) => {
        h.len = Math.max(2, Math.round(durSec * fs));
        h.rem = h.len;
        h.amp = amp;
    };
    const stepHertzHammer = (h) => {
        if (h.rem <= 0) return 0.0;
        const k = h.len - h.rem;
        h.rem -= 1;
        return h.amp * (Math.PI / (2.0 * h.len)) * Math.sin((Math.PI * (k + 0.5)) / h.len);
    };

    // Ordem de ignição 1-5-3-6-2-4 no ciclo de 720° com 4 perfis procedurais selecionáveis em tempo real
    // (além dos 2 perfis sampleados Scania = #6 [PADRÃO] e Scania Grave = #7):
    //  1 = Original (Cat 3406B Straight Pipe)
    //  2 = Mais rouco (maior aspereza de injeção, turbulência de vórtices no coletor e rasgado médio-grave)
    //  4 = Grave + rouco (combina subgrave encorpado com rouquidão e saturação de coletor)
    //  5 = Cummins N14 Celect Plus / ZeeMods (vídeo 11s-41s: marcha lenta eletrônica estalada, coletor 3+3, ponteiras 5" e turbina Holset HT60 cantando)
    const ENGINE_PROFILES = {
        1: {
            rpmScale: 1.00, lopeAmp: 1.00,
            cylGain: [0.76, 1.06, 1.28, 0.84, 0.93, 1.16],
            jit: 0.12, halfOrderRasp: 0.0,
            alphaBase: 24.0, alphaSharp: 24.0, slugGain: 0.78, crackBase: 0.36, crackSharp: 1.25,
            vortexHz: 125.0, vortexMod: 1.15,
            driveBase: 1.25, driveSharp: 1.75, asym: 0.28,
            fc1Base: 245.0, fc1Rpm: 225.0, fc1Load: 350.0, fc1Jake: 520.0,
            fc2Base: 820.0, fc2Sharp: 460.0, fc2Rpm: 280.0,
            pipeDelayL: 0.0114, pipeDelayR: 0.0123, pipeRefl: -0.28, pipeLpL: 440.0, pipeLpR: 420.0,
            boomFL: 68.0, boomFR: 65.0, boomQ: 1.10, boomDb: 6.2,
            growlFL: 198.0, growlFR: 210.0, growlQ: 1.25, growlDb: 5.8,
            barkFL: 475.0, barkFR: 500.0, barkQ: 1.30, barkDb: 5.0,
            ringDb: 0.0,
            roarScale: 0.78, crackRoarMul: 1.00, subPunch: 0.0,
            clatF1: 580.0, clatF2: 1180.0, clatF3: 2150.0, clatMul: 0.80, clatWin: 0.060,
            turboUpTau: 0.42, turboDownTau: 0.85,
            turboBase: 1880.0, turboSpan: 1540.0, turboQ: 18.0, turboTone: 0.0075, turboMul: 0.85,
            dcHz: 22.0, outTrim: 1.00
        },
        2: {
            rpmScale: 0.99, lopeAmp: 1.32,
            cylGain: [0.64, 1.15, 1.40, 0.72, 0.98, 1.26],
            jit: 0.23, halfOrderRasp: 0.20,
            alphaBase: 23.0, alphaSharp: 27.0, slugGain: 0.74, crackBase: 0.56, crackSharp: 1.65,
            vortexHz: 170.0, vortexMod: 1.72,
            driveBase: 1.70, driveSharp: 2.25, asym: 0.44,
            fc1Base: 265.0, fc1Rpm: 240.0, fc1Load: 380.0, fc1Jake: 560.0,
            fc2Base: 900.0, fc2Sharp: 520.0, fc2Rpm: 310.0,
            pipeDelayL: 0.0116, pipeDelayR: 0.0127, pipeRefl: -0.33, pipeLpL: 490.0, pipeLpR: 465.0,
            boomFL: 67.0, boomFR: 64.0, boomQ: 1.10, boomDb: 5.8,
            growlFL: 182.0, growlFR: 194.0, growlQ: 1.15, growlDb: 7.4,
            barkFL: 420.0, barkFR: 442.0, barkQ: 1.20, barkDb: 6.6,
            ringDb: 1.5,
            roarScale: 1.06, crackRoarMul: 1.45, subPunch: 0.0,
            clatF1: 540.0, clatF2: 1120.0, clatF3: 2050.0, clatMul: 0.92, clatWin: 0.065,
            turboUpTau: 0.42, turboDownTau: 0.85,
            turboBase: 1860.0, turboSpan: 1520.0, turboQ: 17.5, turboTone: 0.0070, turboMul: 0.82,
            dcHz: 22.0, outTrim: 0.82
        },
        4: {
            rpmScale: 0.89, lopeAmp: 1.38,
            cylGain: [0.63, 1.16, 1.42, 0.71, 0.99, 1.25],
            jit: 0.24, halfOrderRasp: 0.22,
            alphaBase: 19.5, alphaSharp: 21.5, slugGain: 0.88, crackBase: 0.46, crackSharp: 1.38,
            vortexHz: 150.0, vortexMod: 1.75,
            driveBase: 1.62, driveSharp: 2.08, asym: 0.42,
            fc1Base: 198.0, fc1Rpm: 190.0, fc1Load: 300.0, fc1Jake: 470.0,
            fc2Base: 690.0, fc2Sharp: 410.0, fc2Rpm: 250.0,
            pipeDelayL: 0.0150, pipeDelayR: 0.0162, pipeRefl: -0.38, pipeLpL: 365.0, pipeLpR: 345.0,
            boomFL: 56.0, boomFR: 54.0, boomQ: 1.05, boomDb: 8.2,
            growlFL: 142.0, growlFR: 150.0, growlQ: 1.12, growlDb: 7.8,
            barkFL: 365.0, barkFR: 384.0, barkQ: 1.18, barkDb: 5.8,
            ringDb: 1.0,
            roarScale: 1.02, crackRoarMul: 1.25, subPunch: 0.24,
            clatF1: 500.0, clatF2: 1020.0, clatF3: 1900.0, clatMul: 0.78, clatWin: 0.065,
            turboUpTau: 0.44, turboDownTau: 0.88,
            turboBase: 1680.0, turboSpan: 1420.0, turboQ: 17.5, turboTone: 0.0068, turboMul: 0.80,
            dcHz: 14.0, outTrim: 0.76
        },
        5: {
            rpmScale: 1.01, lopeAmp: 0.14,
            cylGain: [1.16, 0.86, 1.20, 0.84, 1.17, 0.88],
            jit: 0.10, halfOrderRasp: 0.10,
            alphaBase: 26.5, alphaSharp: 25.5, slugGain: 0.84, crackBase: 0.66, crackSharp: 1.75,
            vortexHz: 180.0, vortexMod: 1.32,
            driveBase: 1.55, driveSharp: 2.10, asym: 0.36,
            fc1Base: 295.0, fc1Rpm: 265.0, fc1Load: 415.0, fc1Jake: 660.0,
            fc2Base: 1020.0, fc2Sharp: 580.0, fc2Rpm: 350.0,
            pipeDelayL: 0.0094, pipeDelayR: 0.0102, pipeRefl: -0.34, pipeLpL: 620.0, pipeLpR: 590.0,
            boomFL: 64.0, boomFR: 62.0, boomQ: 1.15, boomDb: 7.2,
            growlFL: 174.0, growlFR: 184.0, growlQ: 1.30, growlDb: 6.4,
            barkFL: 540.0, barkFR: 565.0, barkQ: 1.45, barkDb: 6.8,
            ringDb: 3.6,
            roarScale: 0.88, crackRoarMul: 1.55, subPunch: 0.14,
            clatF1: 760.0, clatF2: 1560.0, clatF3: 2850.0, clatMul: 1.08, clatWin: 0.042,
            turboUpTau: 0.24, turboDownTau: 1.15,
            turboBase: 2280.0, turboSpan: 1880.0, turboQ: 25.0, turboTone: 0.0145, turboMul: 1.16,
            dcHz: 18.0, outTrim: 0.96
        }
    };

    let prof = ENGINE_PROFILES[4];

    // Garganta da voluta da turbina (4 polos em cascata): preserva o ronco encorpado de 60-900 Hz
    // do Cat 3406B em escape direto e elimina zumbidos artificiais agudos
    const throatLp1L = makeBiquad('lp', 360.0, 1.10);
    const throatLp2L = makeBiquad('lp', 920.0, 0.74);
    const throatLp1R = makeBiquad('lp', 348.0, 1.10);
    const throatLp2R = makeBiquad('lp', 890.0, 0.74);

    // Colunas gêmeas + formantes graves, médios-graves e presença metálica das ponteiras (iniciadas já no perfil #4)
    const stackPipeL = makeWideStackPipe(prof.pipeDelayL, prof.pipeRefl, prof.pipeLpL);
    const stackPipeR = makeWideStackPipe(prof.pipeDelayR, prof.pipeRefl, prof.pipeLpR);
    const chestBoomL = makeBiquad('peak', prof.boomFL, prof.boomQ, prof.boomDb);
    const chestBoomR = makeBiquad('peak', prof.boomFR, prof.boomQ, prof.boomDb);
    const catGrowlL = makeBiquad('peak', prof.growlFL, prof.growlQ, prof.growlDb);
    const catGrowlR = makeBiquad('peak', prof.growlFR, prof.growlQ, prof.growlDb);
    const straightBarkL = makeBiquad('peak', prof.barkFL, prof.barkQ, prof.barkDb);
    const straightBarkR = makeBiquad('peak', prof.barkFR, prof.barkQ, prof.barkDb);
    const stackRingL = makeBiquad('peak', 1140.0, 1.70, prof.ringDb);
    const stackRingR = makeBiquad('peak', 1190.0, 1.70, prof.ringDb);
    const subPunchLpL = makeBiquad('lp', 95.0, 0.90);
    const subPunchLpR = makeBiquad('lp', 95.0, 0.90);

    // Sopro turbulento de gases quentes nos tubos de 8"
    const roarLowL = makeBiquad('bp', 150.0, 0.85);
    const roarLowR = makeBiquad('bp', 158.0, 0.85);
    const roarMidL = makeBiquad('bp', 395.0, 0.95);
    const roarMidR = makeBiquad('bp', 375.0, 0.95);
    const roarCrackL = makeBiquad('bp', 960.0, 1.15);
    const roarCrackR = makeBiquad('bp', 1010.0, 1.15);

    // Batida mecânica do bloco de ferro fundido e bomba/bicos injetores mecânicos
    const clatter1 = makeBiquad('bp', prof.clatF1, 2.0);
    const clatter2 = makeBiquad('bp', prof.clatF2, 2.4);
    const clatter3 = makeBiquad('bp', prof.clatF3, 2.8);

    // Turbocompressor Garrett / Schwitzer em escape direto (fluxo pressurizado + assobio fino da turbina)
    const turboJet1 = makeBiquad('bp', 2050.0, 19.0);
    const turboJet2 = makeBiquad('bp', 4100.0, 21.0);
    const turboBoostAir = makeBiquad('bp', 1500.0, 1.05);

    // Descarga pneumática Westinghouse (freio estacionário e seletor Eaton Fuller)
    const airBrakeBp1 = makeBiquad('bp', 1850.0, 1.5);
    const airBrakeBp2 = makeBiquad('bp', 3600.0, 1.8);

    // Partida pesada de Kenworth W900 em escape direto (ref. nMR7jF2pGag — "Kenworth w900 startup"):
    // eixo pesado girando sob alta compressão + pulso grosso e grave saindo pelas chaminés a cada ciclo antes do rugido da pega
    const starterBodyBp = makeBiquad('bp', 142.0, 1.25);
    const starterMeshBp = makeBiquad('bp', 310.0, 1.40);
    const starterBrushBp = makeBiquad('bp', 640.0, 1.35);
    const starterHoodLp = makeBiquad('lp', 560.0, 0.82);
    const starterClickBp = makeBiquad('bp', 980.0, 1.15);
    const compPuffLp = makeBiquad('lp', 108.0, 1.18);
    const compChuffBp = makeBiquad('bp', 178.0, 1.12);
    const starterBellMode1 = makeDampedMode(84.0, 2.1);
    const starterBellMode2 = makeDampedMode(248.0, 2.3);
    const starterBellMode3 = makeDampedMode(620.0, 2.0);
    const stopMountMode1 = makeDampedMode(52.0, 3.0);
    const stopMountMode2 = makeDampedMode(96.0, 3.2);
    const solenoidHammer = makeHertzHammer();
    const startMountHammer = makeHertzHammer();
    const stopShudderHammer = makeHertzHammer();

    // Buzina a ar Columbia dupla de ferro fundido (~32 cm = 315.5 Hz e ~26 cm = 377.0 Hz, diafragmas de aço a ~100 PSI)
    const hornBodyPeak = makeBiquad('peak', 685.0, 1.45, 5.0);
    const hornIronBite = makeBiquad('peak', 1440.0, 1.85, 5.4);
    const hornPresence = makeBiquad('peak', 2680.0, 2.10, 2.8);
    const hornBellLp = makeBiquad('lp', 3650.0, 0.80);
    const hornAirJetBp = makeBiquad('bp', 2350.0, 1.35);
    const hornEchoLenL = Math.max(16, Math.round(0.046 * fs));
    const hornEchoLenR = Math.max(16, Math.round(0.068 * fs));
    const hornEchoBufL = new Float32Array(hornEchoLenL);
    const hornEchoBufR = new Float32Array(hornEchoLenR);
    let hornEchoIdxL = 0;
    let hornEchoIdxR = 0;
    let hornEchoLpL = 0.0;
    let hornEchoLpR = 0.0;
    const hornEchoLpA = 1.0 - Math.exp(-TWO_PI * 1650.0 * invFs);
    let hornEchoEnergy = 0.0;

    // Foley 1 — Porta de madeira maciça batendo no batente baseada na 2ª parte (> 3s) de dvdhcouVOtE:
    //   1) Deslocamento curto de ar na fresta (0..32 ms) + resvalo metálico sutil da língua do trinco na testa (t = 18 ms)
    //   2) Pancada encorpada e progressiva da folha inteira de madeira maciça contra o batente (t = 32..66 ms:
    //      centro da folha em 32 ms, cantos superior/inferior em 39 ms, encaixe do trinco/batente em 49 ms e acomodação em 65 ms)
    //   3) Reverberação difusa real de cômodo/corredor residencial (matriz ortogonal Householder 4x4, cauda quente ~360 ms)
    const slamGustBp1 = makeBiquad('bp', 148.0, 0.90);
    const slamGustBp2 = makeBiquad('bp', 385.0, 1.10);
    const slamSlapBp1 = makeBiquad('bp', 235.0, 0.88);
    const slamSlapBp2 = makeBiquad('bp', 515.0, 1.02);
    const slamSlapBp3 = makeBiquad('bp', 1040.0, 1.15);
    const slamSnapBp1 = makeBiquad('bp', 1780.0, 1.30);
    const slamSnapBp2 = makeBiquad('bp', 2680.0, 1.50);
    const slamWoodLp = makeBiquad('lp', 2880.0, 0.74);
    const slamWallMode = makeDampedMode(68.0, 3.6);
    const slamDoorMode1 = makeDampedMode(118.0, 4.6);
    const slamDoorMode2 = makeDampedMode(192.0, 4.4);
    const slamDoorMode3 = makeDampedMode(312.0, 3.9);
    const slamDoorMode4 = makeDampedMode(520.0, 3.4);
    const slamDoorMode5 = makeDampedMode(845.0, 2.9);
    const slamKeeperMode1 = makeDampedMode(980.0, 4.2);
    const slamKeeperMode2 = makeDampedMode(1860.0, 4.5);

    const slamHallLen0 = Math.max(16, Math.round(0.0149 * fs));
    const slamHallLen1 = Math.max(16, Math.round(0.0233 * fs));
    const slamHallLen2 = Math.max(16, Math.round(0.0337 * fs));
    const slamHallLen3 = Math.max(16, Math.round(0.0461 * fs));
    const slamHallBuf0 = new Float32Array(slamHallLen0);
    const slamHallBuf1 = new Float32Array(slamHallLen1);
    const slamHallBuf2 = new Float32Array(slamHallLen2);
    const slamHallBuf3 = new Float32Array(slamHallLen3);
    let slamHallIdx0 = 0, slamHallIdx1 = 0, slamHallIdx2 = 0, slamHallIdx3 = 0;
    let slamHallLp0 = 0.0, slamHallLp1 = 0.0, slamHallLp2 = 0.0, slamHallLp3 = 0.0;
    const slamHallLpA = 1.0 - Math.exp(-TWO_PI * 1180.0 * invFs);
    let slamHallHpIn = 0.0;
    let slamHallHpOut = 0.0;
    const slamHallHpPole = Math.exp(-TWO_PI * 115.0 * invFs);
    let slamHallEnergy = 0.0;

    // Foley 2 — Som de engate e desengate do trailer (tecla T / botão Hitch):
    // preserva integralmente o som aprovado que antes ficava na entrada do pino-rei
    // (sopro curto -> chanfro 18 ms -> batida de madeira 28 ms -> estalo da língua do trinco 56 ms).
    const hitchAirBp1 = makeBiquad('bp', 235.0, 1.10);
    const hitchAirBp2 = makeBiquad('bp', 610.0, 1.25);
    const hitchWoodSlapBp1 = makeBiquad('bp', 295.0, 1.15);
    const hitchWoodSlapBp2 = makeBiquad('bp', 780.0, 1.30);
    const hitchWoodSlapBp3 = makeBiquad('bp', 1680.0, 1.45);
    const hitchLatchBp = makeBiquad('bp', 2780.0, 1.85);
    const hitchWoodMode1 = makeDampedMode(108.0, 4.0);
    const hitchWoodMode2 = makeDampedMode(196.0, 3.6);
    const hitchWoodMode3 = makeDampedMode(355.0, 3.1);
    const hitchWoodMode4 = makeDampedMode(685.0, 2.6);
    const hitchWoodMode5 = makeDampedMode(1260.0, 2.3);
    const hitchLatchMode1 = makeDampedMode(1120.0, 4.8);
    const hitchLatchMode2 = makeDampedMode(2420.0, 5.4);
    const hitchLatchMode3 = makeDampedMode(4350.0, 4.8);

    // Reflexão inicial curtíssima de hall doméstico sem realimentação (11.5 ms L / 16.2 ms R) para o barramento Foley
    const foleyRoomLenL = Math.max(8, Math.round(0.0115 * fs));
    const foleyRoomLenR = Math.max(8, Math.round(0.0162 * fs));
    const foleyRoomBufL = new Float32Array(foleyRoomLenL);
    const foleyRoomBufR = new Float32Array(foleyRoomLenR);
    let foleyRoomIdxL = 0;
    let foleyRoomIdxR = 0;
    let foleyRoomLpL = 0.0;
    let foleyRoomLpR = 0.0;
    const foleyRoomLpA = 1.0 - Math.exp(-TWO_PI * 1850.0 * invFs);
    let foleyRoomEnergy = 0.0;

    const cylOffsets = [0.000, 0.164, 0.335, 0.498, 0.668, 0.831];
    let cylRunnerGain = prof.cylGain;
    const cylPanL = [0.64, 0.40, 0.57, 0.36, 0.60, 0.43];
    const cylAmp = new Float32Array(cylRunnerGain);
    const cylPrev = new Float32Array(6);

    const rpmSmooth = 1.0 - Math.exp(-invFs / 0.045);
    const loadSmooth = 1.0 - Math.exp(-invFs / 0.032);
    let turboUpSmooth = 1.0 - Math.exp(-invFs / prof.turboUpTau);
    let turboDownSmooth = 1.0 - Math.exp(-invFs / prof.turboDownTau);
    const jakeSmooth = 1.0 - Math.exp(-invFs / 0.025);
    const gainSmooth = 1.0 - Math.exp(-invFs / 0.035);
    let vortexA = 1.0 - Math.exp(-TWO_PI * prof.vortexHz * invFs);
    const turboFmA = 1.0 - Math.exp(-TWO_PI * 140.0 * invFs);
    const airBrakeDecay = Math.exp(-invFs / 0.14);
    const shiftAirDecay = Math.exp(-invFs / 0.05);
    const hornAtk1 = 1.0 - Math.exp(-invFs / 0.016);
    const hornRel1 = 1.0 - Math.exp(-invFs / 0.046);
    const hornAtk2 = 1.0 - Math.exp(-invFs / 0.009);
    const hornRel2 = 1.0 - Math.exp(-invFs / 0.036);
    const hornValveDecay = Math.exp(-invFs / 0.038);
    const hornJitterA = 1.0 - Math.exp(-TWO_PI * 28.0 * invFs);
    let dcPole = Math.exp(-TWO_PI * prof.dcHz * invFs);
    const postLpA = 1.0 - Math.exp(-TWO_PI * 4900.0 * invFs);

    let cyclePhase = 0.0;
    let lope1 = 0.0;
    let lope2 = 0.31;
    let vortexLpL = 0.0;
    let vortexLpR = 0.0;
    let turboPhase = 0.0;
    let turboFmLp = 0.0;

    let curRpm = 220.0;
    let curLoad = 0.45;
    let curTurbo = 0.06;
    let curJake = 0.0;
    let curMasterGain = 0.0;
    let curHornGain = 1.0;

    let targetRpm = 595.0;
    let targetLoad = 0.18;
    let targetTurbo = 0.06;
    let targetJake = 0.0;
    let targetMasterGain = 1.0;
    let targetHornGain = 1.0;

    // Volumes individuais dos efeitos (1.0 = volume original)
    let hornVol = 1.0;
    let airVol = 1.0;
    let slamVol = 1.0;
    let hitchVol = 1.0;
    let foleyDuckScale = 1.0;

    // Estado da buzina a ar Columbia dupla de ferro fundido (corneta longa 315.5 Hz + corneta curta 377.0 Hz)
    let hornGate = false;
    let hornMinHoldSamples = 0;
    let hornOnsetClock = 0.0;
    let hornEnv1 = 0.0;
    let hornEnv2 = 0.0;
    let hornPhase1 = 0.0;
    let hornPhase2 = 0.27;
    let hornValveEnv = 0.0;
    let hornJitter1 = 0.0;
    let hornJitter2 = 0.0;

    // Estado da ignição/motor:
    // Por padrão (`sampleEngineMode = true`), partida + funcionamento normal vêm dos áudios customizados
    // (`start_up_engine.mp3` + `regular_engine.mp3`), enquanto o DSP core cuida apenas do calço/parada e dos SFX
    // (buzina Columbia, freio a ar, seletor Eaton Fuller, 5ª roda e engate da carreta).
    let sampleEngineMode = true;
    let engineState = 'off'; // 'off' | 'starting' | 'running' | 'stopping'
    let engineEnv = 0.0;
    const engOnSmooth = 1.0 - Math.exp(-invFs / 0.008);
    const engOffSmooth = 1.0 - Math.exp(-invFs / 0.022);
    let startClock = 0.0;
    let stopClock = 0.0;
    let stopInitialRpm = 595.0;
    let starterPhase = 0.0;
    let crankBlowPhase = 0.0;
    let solenoidFired = false;
    let startMountFired = false;
    let stopShudderFired = false;
    const cylCatchOrder = [0, 3, 1, 4, 2, 5];

    let airBrakeEnv = 0.0;
    let shiftAirEnv = 0.0;

    // Barramento Foley dedicado (porta de casa batendo na 5ª roda + engate/desengate do trailer na tecla T)
    const foleyDuckAtk = 1.0 - Math.exp(-invFs / 0.0025);
    const foleyDuckRel = 1.0 - Math.exp(-invFs / 0.115);
    const foleyDcPole = Math.exp(-TWO_PI * 24.0 * invFs);
    const foleyLpA = 1.0 - Math.exp(-TWO_PI * 10200.0 * invFs);
    let foleyDuckHold = 0.0;
    let foleyDuckEnv = 0.0;
    let foleyDcInL = 0.0, foleyDcOutL = 0.0;
    let foleyDcInR = 0.0, foleyDcOutR = 0.0;
    let foleyLpL = 0.0, foleyLpR = 0.0;

    // Estado Foley 1: porta de madeira maciça batendo (entrada física do pino-rei na quinta roda — ref. dvdhcouVOtE > 3s)
    let slamActive = false;
    let slamClock = 0.0;
    let slamStrength = 1.0;
    let slamAirPhase = 0.0;
    let slamPreTouchFired = false;
    let slamPreSnapFired = false;
    let slamMainFired = false;
    let slamEdge2Fired = false;
    let slamKeeperFired = false;
    let slamSettleFired = false;
    const slamHammer1 = makeHertzHammer();
    const slamHammer2 = makeHertzHammer();
    const slamHammer3 = makeHertzHammer();
    const slamHammer4 = makeHertzHammer();
    const slamKeeperHammer = makeHertzHammer();

    // Estado Foley 2: som de engate e desengate do trailer (tecla T / botão Hitch)
    let hitchActive = false;
    let hitchClock = 0.0;
    let hitchStrength = 1.0;
    let hitchAirPhase = 0.0;
    let hitchBevelFired = false;
    let hitchSlamFired = false;
    let hitchRabbetFired = false;
    let hitchLatchFired = false;
    let hitchReboundFired = false;
    const hitchWoodHammer1 = makeHertzHammer();
    const hitchWoodHammer2 = makeHertzHammer();
    const hitchLatchHammer = makeHertzHammer();

    let dcInL = 0.0, dcOutL = 0.0;
    let dcInR = 0.0, dcOutR = 0.0;
    let postLpL = 0.0, postLpR = 0.0;
    let filterUpdateCounter = 0;

    const setTargets = (params) => {
        if (params.rpm !== undefined) targetRpm = params.rpm;
        if (params.load !== undefined) targetLoad = params.load;
        if (params.turbo !== undefined) targetTurbo = params.turbo;
        if (params.jake !== undefined) targetJake = params.jake;
        if (params.masterGain !== undefined) targetMasterGain = params.masterGain;
        if (params.hornGain !== undefined) targetHornGain = params.hornGain;
        if (params.hornVol !== undefined) hornVol = params.hornVol;
        if (params.airVol !== undefined) airVol = params.airVol;
        if (params.slamVol !== undefined) slamVol = params.slamVol;
        if (params.hitchVol !== undefined) hitchVol = params.hitchVol;
    };

    const setHorn = (active) => {
        const nextGate = Boolean(active);
        if (nextGate && !hornGate) {
            hornGate = true;
            hornMinHoldSamples = Math.round(0.095 * fs);
            if (hornEnv1 < 0.15 && hornEnv2 < 0.15) {
                hornOnsetClock = 0.0;
            }
            hornValveEnv = Math.min(1.0, hornValveEnv + 0.85);
        } else if (!nextGate && hornGate) {
            hornGate = false;
            if (hornEnv1 > 0.2 || hornEnv2 > 0.2) {
                hornValveEnv = Math.min(1.0, hornValveEnv + 0.42);
            }
        }
    };

    const triggerAirBrake = (intensity = 1.0) => {
        const clamped = Math.max(0.2, Math.min(1.3, intensity));
        airBrakeEnv = Math.min(1.3, airBrakeEnv + 0.95 * clamped);
    };

    const triggerShiftAir = (intensity = 1.0) => {
        shiftAirEnv = Math.min(0.9, shiftAirEnv + 0.45 * intensity);
    };

    const triggerFifthWheelCouple = (intensity = 1.0) => {
        slamStrength = Math.max(0.84, Math.min(1.22, Number(intensity) || 1.0));
        slamClock = 0.0;
        slamAirPhase = 0.0;
        slamPreTouchFired = false;
        slamPreSnapFired = false;
        slamMainFired = false;
        slamEdge2Fired = false;
        slamKeeperFired = false;
        slamSettleFired = false;
        slamHammer1.rem = 0;
        slamHammer2.rem = 0;
        slamHammer3.rem = 0;
        slamHammer4.rem = 0;
        slamKeeperHammer.rem = 0;
        slamActive = true;
        foleyDuckHold = Math.max(foleyDuckHold, 0.48);
        foleyDuckScale = slamVol;
    };

    const triggerStingerDuck = (duration = 0.70, scale = 1.0) => {
        const d = Math.max(0.1, Math.min(2.0, Number(duration) || 0.70));
        foleyDuckHold = Math.max(foleyDuckHold, d);
        foleyDuckScale = Math.max(0.0, Math.min(1.0, Number(scale)));
    };

    const triggerTrailerHitch = (intensity = 1.0) => {
        hitchStrength = Math.max(0.78, Math.min(1.22, Number(intensity) || 1.0));
        hitchClock = 0.0;
        hitchAirPhase = 0.0;
        hitchBevelFired = false;
        hitchSlamFired = false;
        hitchRabbetFired = false;
        hitchLatchFired = false;
        hitchReboundFired = false;
        hitchWoodHammer1.rem = 0;
        hitchWoodHammer2.rem = 0;
        hitchLatchHammer.rem = 0;
        hitchActive = true;
        foleyDuckHold = Math.max(foleyDuckHold, 0.14);
        foleyDuckScale = hitchVol;
    };

    const triggerTrailerLock = () => {
        triggerTrailerHitch(1.0);
    };

    const triggerTrailerUnlock = () => {
        triggerTrailerHitch(1.0);
    };

    const setVariant = (variantId) => {
        const nextProf = ENGINE_PROFILES[variantId] || ENGINE_PROFILES[4];
        prof = nextProf;
        cylRunnerGain = prof.cylGain;
        for (let k = 0; k < 6; k++) {
            cylAmp[k] = cylRunnerGain[k];
        }
        turboUpSmooth = 1.0 - Math.exp(-invFs / prof.turboUpTau);
        turboDownSmooth = 1.0 - Math.exp(-invFs / prof.turboDownTau);
        vortexA = 1.0 - Math.exp(-TWO_PI * prof.vortexHz * invFs);
        dcPole = Math.exp(-TWO_PI * prof.dcHz * invFs);

        retuneWideStackPipe(stackPipeL, prof.pipeDelayL, prof.pipeRefl, prof.pipeLpL);
        retuneWideStackPipe(stackPipeR, prof.pipeDelayR, prof.pipeRefl, prof.pipeLpR);
        retuneBiquad(chestBoomL, prof.boomFL, prof.boomQ, prof.boomDb);
        retuneBiquad(chestBoomR, prof.boomFR, prof.boomQ, prof.boomDb);
        retuneBiquad(catGrowlL, prof.growlFL, prof.growlQ, prof.growlDb);
        retuneBiquad(catGrowlR, prof.growlFR, prof.growlQ, prof.growlDb);
        retuneBiquad(straightBarkL, prof.barkFL, prof.barkQ, prof.barkDb);
        retuneBiquad(straightBarkR, prof.barkFR, prof.barkQ, prof.barkDb);
        retuneBiquad(stackRingL, 1140.0, 1.70, prof.ringDb);
        retuneBiquad(stackRingR, 1190.0, 1.70, prof.ringDb);
        retuneBiquad(clatter1, prof.clatF1, 2.0);
        retuneBiquad(clatter2, prof.clatF2, 2.4);
        retuneBiquad(clatter3, prof.clatF3, 2.8);
        filterUpdateCounter = 0;
    };

    const setSampleEngineMode = (enabled) => {
        sampleEngineMode = Boolean(enabled);
        if (sampleEngineMode && (engineState === 'starting' || engineState === 'running')) {
            // Desativa suavemente os cilindros procedurais via engOffSmooth (sem clique)
            engineState = 'off';
        }
    };

    const triggerEngineResumeRunning = () => {
        if (sampleEngineMode) return;
        solenoidFired = true;
        startMountFired = true;
        stopShudderFired = false;
        solenoidHammer.rem = 0;
        startMountHammer.rem = 0;
        stopShudderHammer.rem = 0;
        curRpm = Math.max(595.0, targetRpm || 595.0) * prof.rpmScale;
        curLoad = Math.max(0.18, targetLoad || 0.18);
        curTurbo = Math.max(0.06, targetTurbo || 0.06);
        curJake = targetJake || 0.0;
        engineState = 'running';
    };

    const triggerEngineStart = () => {
        startClock = 0.0;
        solenoidFired = false;
        startMountFired = false;
        solenoidHammer.rem = 0;
        startMountHammer.rem = 0;
        stopShudderHammer.rem = 0;
        resetDampedMode(starterBellMode1);
        resetDampedMode(starterBellMode2);
        resetDampedMode(starterBellMode3);
        resetDampedMode(stopMountMode1);
        resetDampedMode(stopMountMode2);
        if (sampleEngineMode) {
            engineState = 'off';
            engineEnv = 0.0;
            return;
        }
        // Fallback procedural apenas caso o carregamento de áudio falhe (ex.: protocolo file://)
        cyclePhase = 0.768;
        starterPhase = 0.0;
        crankBlowPhase = 0.0;
        curRpm = 68.0 * prof.rpmScale;
        curLoad = 0.54;
        curTurbo = 0.02;
        curJake = 0.0;
        engineState = 'starting';
    };

    const triggerEngineStop = () => {
        if (!sampleEngineMode && engineState === 'off') return;
        stopClock = 0.0;
        stopShudderFired = false;
        if (sampleEngineMode) {
            curRpm = Math.max(480.0, targetRpm || 595.0);
            stopInitialRpm = curRpm;
            engineEnv = 0.62;
        } else {
            stopInitialRpm = Math.max(190.0, curRpm / Math.max(0.75, prof.rpmScale));
        }
        solenoidHammer.rem = 0;
        startMountHammer.rem = 0;
        stopShudderHammer.rem = 0;
        engineState = 'stopping';
    };

    const resetEngineOff = () => {
        engineState = 'off';
        engineEnv = 0.0;
        startClock = 0.0;
        stopClock = 0.0;
        solenoidFired = false;
        startMountFired = false;
        stopShudderFired = false;
        solenoidHammer.rem = 0;
        startMountHammer.rem = 0;
        stopShudderHammer.rem = 0;
        curRpm = 0.0;
        curLoad = 0.0;
        curTurbo = 0.0;
        curJake = 0.0;
        stackPipeL.buf.fill(0.0);
        stackPipeR.buf.fill(0.0);
        stackPipeL.lp = 0.0;
        stackPipeR.lp = 0.0;
    };

    const triggerStartup = () => {
        triggerEngineStart();
    };

    const renderBlock = (outL, outR) => {
        const n = outL.length;
        for (let i = 0; i < n; i++) {
            curMasterGain += (targetMasterGain - curMasterGain) * gainSmooth;
            curHornGain += (targetHornGain - curHornGain) * gainSmooth;

            const wnRaw1 = whiteNoise();
            const wnRaw2 = whiteNoise();
            const wn1 = wnRaw1 * noiseFsScale;
            const wn2 = wnRaw2 * noiseFsScale;

            const engineActive = engineState !== 'off' || engineEnv > 0.00015;
            let stL = 0.0;
            let stR = 0.0;
            let subL = 0.0;
            let subR = 0.0;
            let mech = 0.0;
            let turboSig = 0.0;
            let starterAuxL = 0.0;
            let starterAuxR = 0.0;

            if (engineActive) {
                let effRpm = targetRpm;
                let effLoad = targetLoad;
                let effTurbo = targetTurbo;
                let clatterEnable = 1.0;
                let combustScale = 1.0;
                let compCrankScale = 0.0;
                let crankPreChuff = 0.0;
                let crankBogDepth = 0.0;
                let catchBarkEnv = 0.0;
                let starterEnv = 0.0;
                let compPumpEnv = 0.0;

                if (engineState === 'starting') {
                    startClock += invFs;
                    engineEnv += (1.0 - engineEnv) * engOnSmooth;

                    // 1) Engate seco do pinhão Bendix no volante de ferro fundido (t = 5 ms)
                    if (!solenoidFired && startClock >= 0.005) {
                        solenoidFired = true;
                        fireHertzHammer(solenoidHammer, 0.00125, 0.90);
                    }

                    if (startClock < 0.028) {
                        effRpm = 66.0;
                        effLoad = 0.50;
                        effTurbo = 0.0;
                        combustScale = 0.0;
                        compCrankScale = 0.0;
                        clatterEnable = 0.0;
                    } else if (startClock < 1.14) {
                        // 2) Giro pesado do virabrequim W900 (~4.5 ciclos cadenciados entre 0.03s e 1.14s):
                        // o eixo pesa ao subir cada compressão e dispara um sopro grosso e encorpado nos escapamentos a cada ciclo
                        const uCrank = (startClock - 0.028) / 1.112;
                        const crankRamp = Math.min(1.0, (startClock - 0.028) / 0.032);
                        const uStrokePreview = (6.0 * cyclePhase) - Math.floor(6.0 * cyclePhase);
                        const climbLoad = Math.max(0.0, -Math.sin(TWO_PI * uStrokePreview + 0.42));

                        effRpm = 78.0 + 38.0 * (0.55 * uCrank + 0.45 * uCrank * uCrank);
                        effLoad = 0.56 + 0.14 * uCrank;
                        effTurbo = 0.015 + 0.035 * uCrank;
                        combustScale = 0.0;
                        compCrankScale = crankRamp * (0.94 + 0.14 * uCrank);
                        crankPreChuff = uCrank > 0.46 ? Math.pow((uCrank - 0.46) / 0.54, 1.35) : 0.0;
                        crankBogDepth = crankRamp * (0.27 - 0.04 * uCrank);
                        clatterEnable = crankRamp * (0.10 + 0.34 * crankPreChuff);
                        starterEnv = crankRamp * (0.48 + 0.52 * climbLoad);
                        compPumpEnv = crankRamp * 0.90;
                    } else if (startClock < 2.32) {
                        // 3) Pega encorpada dos 6 cilindros em escape direto (~1.14..1.45s) + acomodação grave na lenta do W900 até 2.32s
                        if (!startMountFired && startClock >= 1.16) {
                            startMountFired = true;
                            fireHertzHammer(startMountHammer, 0.0020, 0.86);
                        }
                        const tCatch = startClock - 1.14;
                        const uCatch = Math.min(1.0, tCatch / 0.125);
                        combustScale = uCatch * uCatch * (3.0 - 2.0 * uCatch);
                        compCrankScale = Math.max(0.0, 1.0 - uCatch) * 1.05;
                        crankPreChuff = 1.0 - uCatch;
                        crankBogDepth = Math.max(0.0, 1.0 - tCatch / 0.14) * 0.20;
                        clatterEnable = 0.34 + 0.86 * Math.min(1.0, tCatch / 0.085) * (1.0 + 0.25 * fastExpNeg(tCatch * 3.5));
                        catchBarkEnv = fastExpNeg(tCatch * 3.2) * Math.min(1.0, tCatch / 0.045) * 1.35;

                        if (tCatch < 0.095) {
                            const rel = 1.0 - tCatch / 0.095;
                            starterEnv = rel * rel * 0.55;
                            compPumpEnv = rel * 0.65;
                        }

                        let govRpm;
                        let govLoad;
                        if (tCatch < 0.31) {
                            // Rugido cheio das ponteiras diretas na pega (116 RPM -> ~825 RPM)
                            const s = tCatch / 0.31;
                            const ease = 1.0 - Math.pow(1.0 - s, 2.3);
                            govRpm = 116.0 + 709.0 * ease;
                            govLoad = 0.86 - 0.32 * s;
                        } else {
                            // Governador recolhe o débito e entrega para a marcha lenta encorpada (~595 RPM)
                            const ts = tCatch - 0.31;
                            const settleEnv = fastExpNeg(ts * 3.9);
                            govRpm = 595.0 + 230.0 * settleEnv;
                            govLoad = 0.18 + 0.36 * fastExpNeg(ts * 4.8);
                        }
                        const turboBreath = 0.16 * Math.sin(Math.min(1.0, tCatch / 1.02) * Math.PI);
                        effRpm = startClock > 1.32 ? Math.max(targetRpm, govRpm) : govRpm;
                        effLoad = startClock > 1.32 ? Math.max(targetLoad, govLoad) : govLoad;
                        effTurbo = Math.max(targetTurbo, 0.05 + turboBreath);
                    } else {
                        engineState = 'running';
                    }
                } else if (engineState === 'stopping') {
                    // Corte imediato da bomba injetora: cessam os disparos de combustão e o virabrequim desacelera sob compressão
                    stopClock += invFs;
                    combustScale = 0.0;
                    clatterEnable = 0.0;
                    effLoad = 0.0;
                    effTurbo = 0.0;
                    effRpm = Math.max(38.0, stopInitialRpm * fastExpNeg(stopClock * 5.3));
                    const compWave = 0.5 * (1.0 - Math.cos(TWO_PI * 6.0 * cyclePhase));
                    compPumpEnv = Math.min(1.0, effRpm / 460.0) * (0.30 + 0.70 * compWave * compWave);

                    // Rebote final de compressão sacudindo os coxins de borracha do motor/cabine ao parar
                    if (!stopShudderFired && stopClock >= 0.33) {
                        stopShudderFired = true;
                        fireHertzHammer(stopShudderHammer, 0.0022, 0.92);
                    }
                    if (stopClock >= 0.42) {
                        const rem = Math.max(0.0, 1.0 - (stopClock - 0.42) / 0.16);
                        engineEnv = Math.min(engineEnv, rem * rem);
                    }
                    if (stopClock >= 0.58) {
                        engineState = 'off';
                        engineEnv = 0.0;
                    }
                } else if (engineState === 'running') {
                    engineEnv += (1.0 - engineEnv) * engOnSmooth;
                } else {
                    engineEnv += (0.0 - engineEnv) * engOffSmooth;
                    combustScale = 0.0;
                    clatterEnable = 0.0;
                }

                const scaledTargetRpm = effRpm * prof.rpmScale;
                const activeRpmSmooth = (engineState === 'starting' || engineState === 'stopping')
                    ? rpmSmooth * 2.4
                    : rpmSmooth;
                curRpm += (scaledTargetRpm - curRpm) * activeRpmSmooth;
                curLoad += (effLoad - curLoad) * loadSmooth;
                curTurbo += (effTurbo - curTurbo) * (effTurbo > curTurbo ? turboUpSmooth : turboDownSmooth);
                curJake += ((combustScale > 0.5 ? targetJake : 0.0) - curJake) * jakeSmooth;

                const rpmNorm = Math.max(0.0, Math.min(1.3, (curRpm - 580.0) / 1350.0));

                // Caça do governador na marcha lenta (~595 RPM no Cat 3406B; estável no Cummins N14 Celect Plus)
                lope1 += 1.75 * invFs;
                if (lope1 >= 1.0) lope1 -= 1.0;
                lope2 += 2.95 * invFs;
                if (lope2 >= 1.0) lope2 -= 1.0;

                const lopeGate = engineState === 'running'
                    ? 1.0
                    : (engineState === 'starting' && startClock > 1.65 ? Math.min(1.0, (startClock - 1.65) / 0.55) : 0.0);
                const idleWeight = lopeGate * Math.max(0.0, 1.0 - rpmNorm * 3.5) * Math.max(0.0, 1.0 - curLoad * 0.8) * prof.lopeAmp;
                const uStrokeInst = (6.0 * cyclePhase) - Math.floor(6.0 * cyclePhase);
                const crankShaftMod = crankBogDepth > 0.0
                    ? (1.0 + crankBogDepth * Math.sin(TWO_PI * uStrokeInst + 0.42))
                    : 1.0;
                const instRpm = Math.max(
                    35.0,
                    curRpm * crankShaftMod + idleWeight * (13.0 * Math.sin(TWO_PI * lope1) + 6.0 * Math.sin(TWO_PI * lope2))
                );

                // Avanço do ciclo completo de 4 tempos (720° = 2 rotações do virabrequim)
                cyclePhase += (instRpm / 120.0) * invFs;
                if (cyclePhase >= 1.0) cyclePhase -= Math.floor(cyclePhase);

                const halfMod = 1.0 + prof.halfOrderRasp * Math.sin(TWO_PI * cyclePhase);

                vortexLpL += (wnRaw1 - vortexLpL) * vortexA;
                vortexLpR += (wnRaw2 - vortexLpR) * vortexA;

                // Rotação mecânica grave do eixo/volante sob compressão + engate do arranque e batida dos coxins
                const solImp = stepHertzHammer(solenoidHammer) * (0.85 + 0.25 * wnRaw1);
                const startMntImp = stepHertzHammer(startMountHammer) * (0.86 + 0.24 * wnRaw1);
                const shudImp = stepHertzHammer(stopShudderHammer) * (0.88 + 0.22 * wnRaw2);
                let starterSig = 0.0;
                if (solenoidFired && startClock < 0.11) {
                    const solClick = startClock < 0.019
                        ? fastExpNeg((startClock - 0.005) * 280.0) * 0.28 * stepBiquad(starterClickBp, wn2)
                        : 0.0;
                    starterSig += solClick +
                        stepDampedMode(starterBellMode1, solImp) * 0.40 +
                        stepDampedMode(starterBellMode2, solImp) * 0.30 +
                        stepDampedMode(starterBellMode3, solImp) * 0.12;
                }
                if (starterEnv > 0.001) {
                    // Som grave e pesado do eixo/cremalheira vencendo a compressão a cada ciclo (sem apito agudo de motor elétrico)
                    const fShaft = Math.max(92.0, instRpm * 1.65);
                    starterPhase += fShaft * invFs;
                    if (starterPhase >= 1.0) starterPhase -= Math.floor(starterPhase);
                    const c1 = Math.sin(TWO_PI * starterPhase);
                    const c2 = Math.sin(2.0 * TWO_PI * starterPhase);
                    const shaftTorque = fastTanh((0.82 * c1 + 0.34 * c2) * 1.55) * (0.48 + 0.52 * Math.abs(wnRaw1));
                    const rawShaft = shaftTorque * 0.56 + wn1 * 0.52;
                    const underHood = stepBiquad(
                        starterHoodLp,
                        0.78 * stepBiquad(starterBodyBp, rawShaft) +
                        0.46 * stepBiquad(starterMeshBp, rawShaft * 0.70 + wn2 * 0.30) +
                        0.10 * stepBiquad(starterBrushBp, wn1)
                    );
                    starterSig += starterEnv * underHood * 0.34;
                }
                if (compPumpEnv > 0.001 && engineState === 'stopping') {
                    const compPulse = Math.pow(0.5 * (1.0 - Math.cos(TWO_PI * 6.0 * cyclePhase)), 2.6);
                    const thumpExc = (compPulse * 0.72 + 0.26 * wn1 * compPulse) * compPumpEnv;
                    starterSig +=
                        0.34 * stepBiquad(compPuffLp, thumpExc) +
                        0.18 * stepBiquad(compChuffBp, wn2 * compPulse * compPumpEnv);
                }
                if (startMountFired && startClock < 1.55) {
                    starterSig +=
                        stepDampedMode(stopMountMode1, startMntImp) * 0.36 +
                        stepDampedMode(stopMountMode2, startMntImp) * 0.26;
                }
                if (stopShudderFired && stopClock < 0.58) {
                    starterSig +=
                        stepDampedMode(stopMountMode1, shudImp) * 0.46 +
                        stepDampedMode(stopMountMode2, shudImp) * 0.34 +
                        stepDampedMode(starterBellMode1, shudImp * 0.35) * 0.16;
                }
                starterAuxL = starterSig * 0.88;
                starterAuxR = starterSig * 0.84;

                let exhL = 0.0;
                let exhR = 0.0;
                let gasGate = 0.0;
                let crankStackGate = 0.0;
                let clatterGate = 0.0;

                const sharp = Math.min(1.0, curLoad * 0.92 + curJake * 1.25 + catchBarkEnv * 0.55);
                const alphaP = prof.alphaBase + prof.alphaSharp * sharp;
                const clatWinLen = prof.clatWin;
                const invClatWin = 1.0 / clatWinLen;

                // Oscilador acústico grave (54–90 Hz) excitado a cada abertura de válvula de escape durante o giro do arranque
                let crankBlowCarrier = 0.0;
                if (compCrankScale > 0.0005) {
                    const uBlowMod = (6.0 * cyclePhase) - Math.floor(6.0 * cyclePhase);
                    const fBlow = 53.0 + 37.0 * fastExpNeg(uBlowMod * 5.2);
                    crankBlowPhase += fBlow * invFs;
                    if (crankBlowPhase >= 1.0) crankBlowPhase -= Math.floor(crankBlowPhase);
                    const b1 = Math.sin(TWO_PI * crankBlowPhase);
                    const b2 = Math.sin(2.0 * TWO_PI * crankBlowPhase + 0.45);
                    const b3 = Math.sin(3.0 * TWO_PI * crankBlowPhase + 0.90);
                    crankBlowCarrier = 1.05 * b1 + 0.70 * b2 + (0.28 + 0.40 * crankPreChuff) * b3;
                }

                if (combustScale > 0.0005 || compCrankScale > 0.0005) {
                    for (let k = 0; k < 6; k++) {
                        let ph = cyclePhase + cylOffsets[k];
                        if (ph >= 1.0) ph -= 1.0;

                        if (ph < cylPrev[k]) {
                            cylAmp[k] = cylRunnerGain[k] * (1.0 + whiteNoise() * prof.jit);
                        }
                        cylPrev[k] = ph;

                        // Na partida (t >= 1.14s), os 6 cilindros entram em sequência escalonada rápida
                        let cylComb = combustScale;
                        if (engineState === 'starting' && combustScale > 0.0 && startClock < 1.34) {
                            const tCyl = startClock - (1.135 + cylCatchOrder[k] * 0.022);
                            cylComb = tCyl <= 0.0 ? 0.0 : Math.min(1.0, tCyl / 0.048) * combustScale;
                        }
                        const cylCold = compCrankScale * (1.0 - cylComb);

                        if (ph < 0.50) {
                            let waveK = 0.0;
                            if (cylComb > 0.0005) {
                                const amp = cylAmp[k] * cylComb;
                                const au = alphaP * ph;
                                const eAu = fastExpNeg(au);
                                const slug = (au * (2.0 - au)) * eAu * prof.slugGain * (1.0 + 0.34 * catchBarkEnv);
                                const crackAu = 2.2 * au;
                                const crack = (crackAu * (2.0 - crackAu)) * fastExpNeg(crackAu) *
                                    (prof.crackBase + prof.crackSharp * sharp + 0.48 * catchBarkEnv);
                                waveK += amp * ((0.75 + 0.88 * curLoad + 0.85 * curJake) * slug + crack);
                                gasGate += amp * au * eAu * 2.718;
                            }
                            if (cylCold > 0.0005 && ph < 0.076) {
                                // Cada ciclo do eixo dispara um único pulso cheio e grosso (53–180 Hz) pelas chaminés diretas do W900,
                                // deixando um vale limpo entre um ciclo e o próximo para destacar a rotação pesada do eixo
                                const sBlow = ph * (1.0 / 0.076);
                                const blowEnv = Math.sin(Math.PI * sBlow) * fastExpNeg(sBlow * 1.10);
                                const ampCold = (0.84 + 0.16 * cylAmp[k]) * cylCold;
                                waveK += ampCold * blowEnv * crankBlowCarrier * 0.225;
                                const coldGate = ampCold * blowEnv * 0.50;
                                gasGate += coldGate;
                                crankStackGate += coldGate;
                            }

                            const panL = cylPanL[k];
                            exhL += waveK * panL;
                            exhR += waveK * (1.0 - panL);
                        }

                        const du = ph - 0.82;
                        if (du >= 0.0 && du < clatWinLen && clatterEnable > 0.0) {
                            const s = du * invClatWin;
                            const win = 0.5 * (1.0 - Math.cos(TWO_PI * s)) * fastExpNeg(s * 3.0);
                            const clatAmp = cylAmp[k] * Math.max(cylComb, cylCold * 0.45);
                            clatterGate += clatAmp * win * clatterEnable;
                        }
                    }
                }

                // Modulação de turbulência por vórtices e assimetria de meia-ordem no coletor de ferro fundido
                exhL *= (1.0 + prof.vortexMod * vortexLpL) * halfMod;
                exhR *= (1.0 + prof.vortexMod * vortexLpR) * halfMod;

                const subPunchMul = prof.subPunch + (compCrankScale > 0.01 ? 0.22 * Math.min(1.25, compCrankScale) : 0.0);
                subL = subPunchMul > 0.0 ? stepBiquad(subPunchLpL, exhL) * subPunchMul : 0.0;
                subR = subPunchMul > 0.0 ? stepBiquad(subPunchLpR, exhR) * subPunchMul : 0.0;

                // Saturação assimétrica dos gases quentes antes das ponteiras diretas
                const drive = prof.driveBase + prof.driveSharp * sharp;
                const dL = exhL * drive;
                const dR = exhR * drive;
                const satL = fastTanh(dL + prof.asym * dL * Math.abs(dL));
                const satR = fastTanh(dR + prof.asym * dR * Math.abs(dR));

                if ((filterUpdateCounter++ & 31) === 0) {
                    const fc1 = prof.fc1Base + prof.fc1Rpm * rpmNorm + prof.fc1Load * Math.pow(curLoad, 1.2) + prof.fc1Jake * curJake;
                    const q1 = 1.00 + 0.45 * curLoad + 0.65 * curJake;
                    const fc2 = prof.fc2Base + prof.fc2Sharp * sharp + prof.fc2Rpm * rpmNorm;
                    retuneBiquad(throatLp1L, fc1, q1);
                    retuneBiquad(throatLp2L, fc2, 0.74);
                    retuneBiquad(throatLp1R, fc1 * 0.96, q1);
                    retuneBiquad(throatLp2R, fc2 * 0.97, 0.74);

                    const tf = prof.turboBase + prof.turboSpan * curTurbo;
                    retuneBiquad(turboJet1, tf, prof.turboQ + 6.0 * curTurbo);
                    retuneBiquad(turboJet2, Math.min(fs * 0.44, tf * 2.0), prof.turboQ + 2.0);
                }

                const volL = stepBiquad(throatLp2L, stepBiquad(throatLp1L, satL));
                const volR = stepBiquad(throatLp2R, stepBiquad(throatLp1R, satR));

                // Rugido de massa de gás turbulento nas duas chaminés cromadas + bufada grossa de ar/compressão a cada ciclo do arranque
                const roarEnv = combustScale * (0.22 + 0.78 * Math.min(1.8, gasGate)) *
                    (0.34 + 0.95 * curLoad + 0.75 * curJake + 0.30 * rpmNorm);
                const crankPuffEnv = compCrankScale > 0.001
                    ? Math.min(1.6, crankStackGate) * (0.58 + 0.32 * crankPreChuff)
                    : 0.0;
                const crackRoarGain = (0.18 + 0.38 * sharp) * prof.crackRoarMul;
                const gasRoarL = roarEnv * (
                    0.55 * stepBiquad(roarLowL, wn1) +
                    0.48 * stepBiquad(roarMidL, wn1) +
                    crackRoarGain * stepBiquad(roarCrackL, wn1)
                ) + crankPuffEnv * (
                    0.95 * stepBiquad(compPuffLp, wn1) +
                    0.78 * stepBiquad(compChuffBp, wn1 * 0.7 + wn2 * 0.3)
                );
                const gasRoarR = roarEnv * (
                    0.55 * stepBiquad(roarLowR, wn2) +
                    0.48 * stepBiquad(roarMidR, wn2) +
                    crackRoarGain * stepBiquad(roarCrackR, wn2)
                ) + crankPuffEnv * (
                    0.95 * stepBiquad(roarLowR, wn2) +
                    0.72 * stepBiquad(roarMidR, wn2 * 0.7 + wn1 * 0.3) * (0.35 + 0.65 * crankPreChuff)
                );

                const pipeInL = volL * 1.30 + gasRoarL * prof.roarScale;
                const pipeInR = volR * 1.30 + gasRoarR * prof.roarScale;

                stL = stepBiquad(
                    straightBarkL,
                    stepBiquad(catGrowlL, stepBiquad(chestBoomL, stepWideStackPipe(stackPipeL, pipeInL)))
                );
                stR = stepBiquad(
                    straightBarkR,
                    stepBiquad(catGrowlR, stepBiquad(chestBoomR, stepWideStackPipe(stackPipeR, pipeInR)))
                );
                if (prof.ringDb > 0.0) {
                    stL = stepBiquad(stackRingL, stL);
                    stR = stepBiquad(stackRingR, stR);
                }

                // Clatter mecânico de injeção direta
                const clatGain = (0.52 + 0.32 * curLoad) * Math.max(0.20, 1.0 - 0.55 * rpmNorm);
                const clatExc = clatterGate * wn2 * clatGain;
                mech =
                    0.55 * stepBiquad(clatter1, clatExc) +
                    0.40 * stepBiquad(clatter2, clatExc) +
                    0.18 * stepBiquad(clatter3, clatExc);

                // Assobio aerodinâmico da turbina (Garrett/Schwitzer em #1..#4; Holset HT60 cantando em #5)
                turboFmLp += (wnRaw1 - turboFmLp) * turboFmA;
                const tfInst = prof.turboBase + prof.turboSpan * curTurbo + 10.0 * volL + 18.0 * turboFmLp;
                turboPhase += tfInst * invFs;
                if (turboPhase >= 1.0) turboPhase -= 1.0;

                const pulseMod = 0.74 + 0.26 * Math.min(1.4, gasGate);
                const spoolGain = Math.pow(Math.max(0.0, curTurbo), 1.4);
                const sinTurbo = Math.sin(TWO_PI * turboPhase);
                const aeroSeed = wn1 * 0.84 + 0.16 * sinTurbo;
                turboSig = pulseMod * spoolGain * (
                    0.46 * stepBiquad(turboJet1, aeroSeed) +
                    0.13 * stepBiquad(turboJet2, wn2) +
                    0.34 * stepBiquad(turboBoostAir, wn1) +
                    prof.turboTone * sinTurbo
                );
            }

            // Descarga pneumática do freio estacionário / seletor da caixa
            let pneu = 0.0;
            if (airBrakeEnv > 0.0005 || shiftAirEnv > 0.0005) {
                airBrakeEnv *= airBrakeDecay;
                shiftAirEnv *= shiftAirDecay;
                // Descarga do freio de mão: +20% e depois mais +25% (1.2 x 1.25 = 1.5x o original);
                // o sopro da troca de marcha permanece igual
                const env = airBrakeEnv * 1.5 + shiftAirEnv;
                pneu = env * (0.34 * stepBiquad(airBrakeBp1, wn1) + 0.22 * stepBiquad(airBrakeBp2, wn2));
            } else {
                airBrakeEnv = 0.0;
                shiftAirEnv = 0.0;
            }

            // Foley 1: Porta de madeira maciça batendo (acionado quando o pino-rei entra na quinta roda — ref. dvdhcouVOtE > 3s)
            // Reproduz fielmente os 2 pulsos característicos de dvdhcouVOtE após 3s:
            //   - Pulso A (14..150 ms): impacto inicial da língua do trinco / borda da porta no espelho ("CLÁCK!")
            //   - Pulso B (178..620 ms): batida cheia e encorpada da folha inteira de madeira no rebaixo ("-BÁÁÁMMMmmm...") + sala ~390 ms
            let foleyDryL = 0.0;
            let foleyDryR = 0.0;
            let slamHallSend = 0.0;
            if (slamActive) {
                slamClock += invFs;

                let gustSig = 0.0;
                if (slamClock < 0.016) {
                    const u = slamClock / 0.016;
                    const gustEnv = 0.22 + 0.78 * u;
                    gustSig = gustEnv * (
                        0.72 * stepBiquad(slamGustBp1, wn1) +
                        0.68 * stepBiquad(slamGustBp2, wn2)
                    );
                } else if (slamClock >= 0.156 && slamClock < 0.178) {
                    const u = (slamClock - 0.156) / 0.022;
                    const u4 = u * u * u * u;
                    const gustEnv = (0.16 + 0.84 * u * u) * (1.0 - u4 * u4 * u * u);
                    gustSig = gustEnv * (
                        1.15 * stepBiquad(slamGustBp1, wn1) +
                        0.92 * stepBiquad(slamGustBp2, wn2)
                    );
                }

                // Pulso A (t = 16 ms e 30 ms): língua do trinco + borda frontal atingindo o espelho/batente
                if (!slamPreTouchFired && slamClock >= 0.016) {
                    slamPreTouchFired = true;
                    fireHertzHammer(slamKeeperHammer, 0.00024, 0.92);
                    fireHertzHammer(slamHammer2, 0.00080, 0.76);
                }
                if (!slamPreSnapFired && slamClock >= 0.030) {
                    slamPreSnapFired = true;
                    fireHertzHammer(slamHammer3, 0.00095, 0.56);
                    fireHertzHammer(slamKeeperHammer, 0.00020, 0.42);
                }

                // Pulso B (t = 178..226 ms): pancada maciça e larga da folha inteira de madeira no batente + encaixe final
                if (!slamMainFired && slamClock >= 0.178) {
                    slamMainFired = true;
                    slamAirPhase = 0.0;
                    fireHertzHammer(slamHammer1, 0.00110, 1.38);
                }
                if (!slamEdge2Fired && slamClock >= 0.191) {
                    slamEdge2Fired = true;
                    fireHertzHammer(slamHammer2, 0.00095, 0.88);
                }
                if (!slamKeeperFired && slamClock >= 0.207) {
                    slamKeeperFired = true;
                    fireHertzHammer(slamHammer3, 0.00115, 0.64);
                    fireHertzHammer(slamKeeperHammer, 0.00028, 0.76);
                }
                if (!slamSettleFired && slamClock >= 0.226) {
                    slamSettleFired = true;
                    fireHertzHammer(slamHammer4, 0.00140, 0.42);
                }

                const h1 = stepHertzHammer(slamHammer1);
                const h2 = stepHertzHammer(slamHammer2);
                const h3 = stepHertzHammer(slamHammer3);
                const h4 = stepHertzHammer(slamHammer4);
                const hk = stepHertzHammer(slamKeeperHammer);
                const slamWoodImp = (h1 + h2 + h3 + h4) * (0.85 + 0.28 * wnRaw1);
                const slamHardImp = (hk + 0.30 * h1) * (0.82 + 0.32 * wnRaw2);

                let roomAirShock = 0.0;
                let flatWoodSlap = 0.0;
                if (slamMainFired) {
                    const tImp = slamClock - 0.178;
                    const fAir = 48.0 + 48.0 * fastExpNeg(tImp * 38.0);
                    slamAirPhase += fAir * invFs;
                    if (slamAirPhase >= 1.0) slamAirPhase -= 1.0;
                    const shockEnv = fastExpNeg(tImp * 17.5) * (1.0 - fastExpNeg(tImp * 920.0));
                    roomAirShock = (
                        Math.sin(TWO_PI * slamAirPhase) +
                        0.28 * Math.sin(2.0 * TWO_PI * slamAirPhase)
                    ) * (1.0 + 0.20 * vortexLpL) * shockEnv * 0.31;

                    const bodySlapEnv = fastExpNeg(tImp * 24.0) * 0.76 +
                        (slamEdge2Fired ? 0.56 * fastExpNeg((slamClock - 0.191) * 28.0) : 0.0) +
                        (slamKeeperFired ? 0.44 * fastExpNeg((slamClock - 0.207) * 34.0) : 0.0) +
                        (slamSettleFired ? 0.28 * fastExpNeg((slamClock - 0.226) * 40.0) : 0.0);
                    const crackSnapEnv = fastExpNeg(tImp * 95.0) +
                        (slamEdge2Fired ? 0.60 * fastExpNeg((slamClock - 0.191) * 115.0) : 0.0) +
                        (slamKeeperFired ? 0.40 * fastExpNeg((slamClock - 0.207) * 155.0) : 0.0);
                    flatWoodSlap =
                        bodySlapEnv * (
                            1.58 * stepBiquad(slamSlapBp1, wn1) +
                            1.98 * stepBiquad(slamSlapBp2, wn2) +
                            1.68 * stepBiquad(slamSlapBp3, wn1)
                        ) +
                        crackSnapEnv * (
                            1.85 * stepBiquad(slamSnapBp1, wn2) +
                            1.28 * stepBiquad(slamSnapBp2, wn1)
                        );
                } else if (slamPreTouchFired) {
                    const tPre = slamClock - 0.016;
                    const preBodyEnv = fastExpNeg(tPre * 38.0) * 0.54 +
                        (slamPreSnapFired ? 0.42 * fastExpNeg((slamClock - 0.030) * 42.0) : 0.0);
                    const preSnapEnv = fastExpNeg(tPre * 115.0) * 0.88 +
                        (slamPreSnapFired ? 0.54 * fastExpNeg((slamClock - 0.030) * 145.0) : 0.0);
                    flatWoodSlap =
                        preBodyEnv * (
                            0.95 * stepBiquad(slamSlapBp2, wn2) +
                            1.45 * stepBiquad(slamSlapBp3, wn1)
                        ) +
                        preSnapEnv * (
                            1.65 * stepBiquad(slamSnapBp1, wn2) +
                            1.15 * stepBiquad(slamSnapBp2, wn1)
                        );
                }

                const wallThud = stepDampedMode(slamWallMode, h1 + 0.45 * h2 + 0.35 * h3) * 0.34;
                const panelBody =
                    stepDampedMode(slamDoorMode1, slamWoodImp) * 0.48 +
                    stepDampedMode(slamDoorMode2, slamWoodImp) * 0.56 +
                    stepDampedMode(slamDoorMode3, slamWoodImp) * 0.52 +
                    stepDampedMode(slamDoorMode4, slamWoodImp) * 0.42 +
                    stepDampedMode(slamDoorMode5, slamWoodImp) * 0.28 +
                    stepDampedMode(slamKeeperMode1, slamHardImp) * 0.28 +
                    stepDampedMode(slamKeeperMode2, slamHardImp) * 0.22;

                const warmTimber = stepBiquad(slamWoodLp, flatWoodSlap + panelBody);
                const slamCore = gustSig + roomAirShock + wallThud + warmTimber;
                // 5ª roda: trim de 0.76 na entrada do barramento Foley (que satura) = ~85% do volume percebido anterior
                const SLAM_TRIM = 0.76;
                foleyDryL += slamCore * 1.03 * slamStrength * slamVol * SLAM_TRIM;
                foleyDryR += slamCore * 0.97 * slamStrength * slamVol * SLAM_TRIM;

                const hallIn = (warmTimber * 0.94 + wallThud * 0.30) * slamStrength * slamVol * SLAM_TRIM;
                const hallHp = hallIn - slamHallHpIn + slamHallHpPole * slamHallHpOut;
                slamHallHpIn = hallIn;
                slamHallHpOut = hallHp;
                slamHallSend = hallHp;

                if (slamClock >= 0.62) {
                    slamActive = false;
                    resetDampedMode(slamWallMode);
                    resetDampedMode(slamDoorMode1);
                    resetDampedMode(slamDoorMode2);
                    resetDampedMode(slamDoorMode3);
                    resetDampedMode(slamDoorMode4);
                    resetDampedMode(slamDoorMode5);
                    resetDampedMode(slamKeeperMode1);
                    resetDampedMode(slamKeeperMode2);
                }
            }

            // Reverberação difusa real de cômodo/corredor residencial (Householder FDN 4x4, RT60 ~ 390 ms como em dvdhcouVOtE)
            let slamHallL = 0.0;
            let slamHallR = 0.0;
            if (slamHallSend !== 0.0 || slamHallEnergy > 0.000025) {
                const r0 = slamHallBuf0[slamHallIdx0];
                const r1 = slamHallBuf1[slamHallIdx1];
                const r2 = slamHallBuf2[slamHallIdx2];
                const r3 = slamHallBuf3[slamHallIdx3];
                slamHallLp0 += (r0 - slamHallLp0) * slamHallLpA;
                slamHallLp1 += (r1 - slamHallLp1) * slamHallLpA;
                slamHallLp2 += (r2 - slamHallLp2) * slamHallLpA;
                slamHallLp3 += (r3 - slamHallLp3) * slamHallLpA;

                const hSum = 0.5 * (slamHallLp0 + slamHallLp1 + slamHallLp2 + slamHallLp3);
                const fbGain = 0.60;
                slamHallBuf0[slamHallIdx0] = slamHallSend + (hSum - slamHallLp0) * fbGain;
                slamHallBuf1[slamHallIdx1] = slamHallSend * 0.92 + (hSum - slamHallLp1) * fbGain;
                slamHallBuf2[slamHallIdx2] = -slamHallSend * 0.86 + (hSum - slamHallLp2) * fbGain;
                slamHallBuf3[slamHallIdx3] = slamHallSend * 0.78 + (hSum - slamHallLp3) * fbGain;

                slamHallIdx0 = (slamHallIdx0 + 1) % slamHallLen0;
                slamHallIdx1 = (slamHallIdx1 + 1) % slamHallLen1;
                slamHallIdx2 = (slamHallIdx2 + 1) % slamHallLen2;
                slamHallIdx3 = (slamHallIdx3 + 1) % slamHallLen3;

                const absOut = Math.abs(slamHallLp0) + Math.abs(slamHallLp1) + Math.abs(slamHallLp2) + Math.abs(slamHallLp3);
                slamHallEnergy = 0.9975 * slamHallEnergy + 0.0025 * (absOut + Math.abs(slamHallSend));
                slamHallL = (slamHallLp0 + slamHallLp2 * 0.85) * 0.23;
                slamHallR = (slamHallLp1 + slamHallLp3 * 0.85) * 0.23;
            } else {
                slamHallEnergy = 0.0;
            }

            // Foley 2: Som de engate e desengate do trailer (tecla T) — idêntico ao som aprovado anteriormente
            if (hitchActive) {
                hitchClock += invFs;

                // 1) Sopro curto do colchão de ar escapando pela fresta (0..28 ms)
                let airRush = 0.0;
                if (hitchClock < 0.028) {
                    const u = hitchClock / 0.028;
                    const u4 = u * u * u * u;
                    const airEnv = (0.18 + 0.82 * u * u) * (1.0 - u4 * u4 * u * u);
                    airRush = airEnv * (
                        0.95 * stepBiquad(hitchAirBp1, wn1) +
                        0.72 * stepBiquad(hitchAirBp2, wn2)
                    );
                }

                // 2) Chanfro metálico da língua do trinco resvalando na testa (t = 18 ms)
                if (!hitchBevelFired && hitchClock >= 0.018) {
                    hitchBevelFired = true;
                    fireHertzHammer(hitchLatchHammer, 0.00016, 0.42);
                }

                // 3) Batida encorpada de madeira contra o rebaixo ("TUMP!" em t = 28 ms)
                if (!hitchSlamFired && hitchClock >= 0.028) {
                    hitchSlamFired = true;
                    hitchAirPhase = 0.0;
                    fireHertzHammer(hitchWoodHammer1, 0.00095, 1.18);
                }
                if (!hitchRabbetFired && hitchClock >= 0.0308) {
                    hitchRabbetFired = true;
                    fireHertzHammer(hitchWoodHammer2, 0.00080, 0.44);
                }

                // 4) Língua do trinco impulsionada por mola saltando no espelho ("-klik!" em t = 56 ms)
                if (!hitchLatchFired && hitchClock >= 0.056) {
                    hitchLatchFired = true;
                    fireHertzHammer(hitchLatchHammer, 0.00014, 1.15);
                }
                if (!hitchReboundFired && hitchClock >= 0.065) {
                    hitchReboundFired = true;
                    fireHertzHammer(hitchLatchHammer, 0.00014, 0.30);
                }

                const woodImp = (stepHertzHammer(hitchWoodHammer1) + stepHertzHammer(hitchWoodHammer2)) *
                    (0.82 + 0.32 * wnRaw1);
                const latchImp = stepHertzHammer(hitchLatchHammer) * (0.80 + 0.34 * wnRaw2);

                let airPistonThump = 0.0;
                let woodSlapBurst = 0.0;
                if (hitchSlamFired) {
                    const tSlam = hitchClock - 0.028;
                    const fAir = 44.0 + 40.0 * fastExpNeg(tSlam * 68.0);
                    hitchAirPhase += fAir * invFs;
                    if (hitchAirPhase >= 1.0) hitchAirPhase -= 1.0;
                    const airThumpEnv = fastExpNeg(tSlam * 66.0) * (1.0 - fastExpNeg(tSlam * 950.0));
                    airPistonThump = Math.sin(TWO_PI * hitchAirPhase) * airThumpEnv * 0.32;

                    const slapEnv = fastExpNeg(tSlam * 155.0) +
                        (hitchRabbetFired ? 0.36 * fastExpNeg((hitchClock - 0.0308) * 185.0) : 0.0);
                    woodSlapBurst = slapEnv * (
                        1.85 * stepBiquad(hitchWoodSlapBp1, wn1) +
                        1.95 * stepBiquad(hitchWoodSlapBp2, wn2) +
                        1.35 * stepBiquad(hitchWoodSlapBp3, wn1)
                    );
                }

                let latchClickBurst = 0.0;
                if (hitchBevelFired && !hitchSlamFired) {
                    latchClickBurst = fastExpNeg((hitchClock - 0.018) * 280.0) * 0.85 * stepBiquad(hitchLatchBp, wn2);
                } else if (hitchLatchFired) {
                    const tLatch = hitchClock - 0.056;
                    const lEnv = fastExpNeg(tLatch * 320.0) +
                        (hitchReboundFired ? 0.28 * fastExpNeg((hitchClock - 0.065) * 380.0) : 0.0);
                    latchClickBurst = lEnv * 1.95 * stepBiquad(hitchLatchBp, wn2);
                }

                const wBody =
                    stepDampedMode(hitchWoodMode1, woodImp) * 0.44 +
                    stepDampedMode(hitchWoodMode2, woodImp) * 0.56 +
                    stepDampedMode(hitchWoodMode3, woodImp) * 0.52 +
                    stepDampedMode(hitchWoodMode4, woodImp) * 0.42 +
                    stepDampedMode(hitchWoodMode5, woodImp) * 0.28;
                const lSnap =
                    stepDampedMode(hitchLatchMode1, latchImp) * 0.46 +
                    stepDampedMode(hitchLatchMode2, latchImp) * 0.58 +
                    stepDampedMode(hitchLatchMode3, latchImp) * 0.36;

                const hitchWoodCore = airRush + airPistonThump + woodSlapBurst + wBody;
                const hitchLatchCore = latchClickBurst + lSnap;
                foleyDryL += (hitchWoodCore * 1.04 + hitchLatchCore * 0.94) * hitchStrength * hitchVol;
                foleyDryR += (hitchWoodCore * 0.96 + hitchLatchCore * 1.06) * hitchStrength * hitchVol;

                if (hitchClock >= 0.28) {
                    hitchActive = false;
                    resetDampedMode(hitchWoodMode1);
                    resetDampedMode(hitchWoodMode2);
                    resetDampedMode(hitchWoodMode3);
                    resetDampedMode(hitchWoodMode4);
                    resetDampedMode(hitchWoodMode5);
                    resetDampedMode(hitchLatchMode1);
                    resetDampedMode(hitchLatchMode2);
                    resetDampedMode(hitchLatchMode3);
                }
            }

            // Reflexão curta de hall interno (11.5 / 16.2 ms sem realimentação) + ducking suave de 65% sobre o motor
            if (foleyDuckHold > 0.0) {
                foleyDuckHold = Math.max(0.0, foleyDuckHold - invFs);
            }
            const foleyWantDuck = (slamActive || hitchActive || foleyDuckHold > 0.0) ? 1.0 : 0.0;
            foleyDuckEnv += (foleyWantDuck - foleyDuckEnv) * (foleyWantDuck > foleyDuckEnv ? foleyDuckAtk : foleyDuckRel);

            let foleyRoomL = 0.0;
            let foleyRoomR = 0.0;
            const foleyMonoSend = (foleyDryL + foleyDryR) * 0.5;
            if (foleyMonoSend !== 0.0 || foleyRoomEnergy > 0.00004) {
                const fdL = foleyRoomBufL[foleyRoomIdxL];
                const fdR = foleyRoomBufR[foleyRoomIdxR];
                foleyRoomLpL += (fdL - foleyRoomLpL) * foleyRoomLpA;
                foleyRoomLpR += (fdR - foleyRoomLpR) * foleyRoomLpA;
                foleyRoomBufL[foleyRoomIdxL] = foleyMonoSend;
                foleyRoomBufR[foleyRoomIdxR] = foleyMonoSend;
                foleyRoomIdxL = (foleyRoomIdxL + 1) % foleyRoomLenL;
                foleyRoomIdxR = (foleyRoomIdxR + 1) % foleyRoomLenR;
                foleyRoomEnergy = 0.996 * foleyRoomEnergy + 0.004 * (Math.abs(foleyRoomLpL) + Math.abs(foleyRoomLpR) + Math.abs(foleyMonoSend));
                foleyRoomL = foleyRoomLpL * 0.09;
                foleyRoomR = foleyRoomLpR * 0.09;
            } else {
                foleyRoomEnergy = 0.0;
            }

            const foleyInL = fastTanh((foleyDryL + foleyRoomL + slamHallL) * 1.32) * 0.94;
            const foleyInR = fastTanh((foleyDryR + foleyRoomR + slamHallR) * 1.32) * 0.94;
            const foleyHpL = foleyInL - foleyDcInL + foleyDcPole * foleyDcOutL;
            foleyDcInL = foleyInL;
            foleyDcOutL = foleyHpL;
            const foleyHpR = foleyInR - foleyDcInR + foleyDcPole * foleyDcOutR;
            foleyDcInR = foleyInR;
            foleyDcOutR = foleyHpR;
            foleyLpL += (foleyHpL - foleyLpL) * foleyLpA;
            foleyLpR += (foleyHpR - foleyLpR) * foleyLpA;

            // Buzina pneumática Columbia dupla de ferro fundido (~32 cm = 315.5 Hz e ~26 cm = 377.0 Hz)
            if (hornMinHoldSamples > 0) {
                hornMinHoldSamples -= 1;
            }
            const hornEffective = hornGate || hornMinHoldSamples > 0;
            let hornOutL = 0.0;
            let hornOutR = 0.0;
            let hornYardSend = 0.0;

            if (
                hornEffective ||
                hornEnv1 > 0.0001 ||
                hornEnv2 > 0.0001 ||
                hornValveEnv > 0.0002
            ) {
                if (hornEffective) {
                    hornOnsetClock += invFs;
                }
                const tgt2 = hornEffective ? 1.0 : 0.0;
                const tgt1 = hornEffective ? (hornOnsetClock >= 0.008 ? 1.0 : 0.22) : 0.0;

                hornEnv2 += (tgt2 - hornEnv2) * (tgt2 > hornEnv2 ? hornAtk2 : hornRel2);
                hornEnv1 += (tgt1 - hornEnv1) * (tgt1 > hornEnv1 ? hornAtk1 : hornRel1);
                hornValveEnv *= hornValveDecay;

                hornJitter1 += (wn1 - hornJitter1) * hornJitterA;
                hornJitter2 += (wn2 - hornJitter2) * hornJitterA;

                const f1 = 315.5 * (0.966 + 0.034 * hornEnv1) * (1.0 + 0.0032 * hornJitter1);
                const f2 = 377.0 * (0.968 + 0.032 * hornEnv2) * (1.0 + 0.0032 * hornJitter2);

                hornPhase1 += f1 * invFs;
                if (hornPhase1 >= 1.0) hornPhase1 -= 1.0;
                hornPhase2 += f2 * invFs;
                if (hornPhase2 >= 1.0) hornPhase2 -= 1.0;

                // Recorrência de Chebyshev (n = 1..8) modela o impacto metálico de cada diafragma traseiro
                const c1a = Math.cos(TWO_PI * hornPhase1);
                const c2a = 2.0 * c1a * c1a - 1.0;
                const c3a = 2.0 * c1a * c2a - c1a;
                const c4a = 2.0 * c1a * c3a - c2a;
                const c5a = 2.0 * c1a * c4a - c3a;
                const c6a = 2.0 * c1a * c5a - c4a;
                const c7a = 2.0 * c1a * c6a - c5a;
                const c8a = 2.0 * c1a * c7a - c6a;
                const tr1 = (
                    1.00 * c1a + 0.78 * c2a + 0.62 * c3a + 0.44 * c4a +
                    0.30 * c5a + 0.20 * c6a + 0.13 * c7a + 0.08 * c8a
                ) * 0.36;

                const c1b = Math.cos(TWO_PI * hornPhase2);
                const c2b = 2.0 * c1b * c1b - 1.0;
                const c3b = 2.0 * c1b * c2b - c1b;
                const c4b = 2.0 * c1b * c3b - c2b;
                const c5b = 2.0 * c1b * c4b - c3b;
                const c6b = 2.0 * c1b * c5b - c4b;
                const c7b = 2.0 * c1b * c6b - c5b;
                const c8b = 2.0 * c1b * c7b - c6b;
                const tr2 = (
                    1.00 * c1b + 0.76 * c2b + 0.60 * c3b + 0.42 * c4b +
                    0.28 * c5b + 0.19 * c6b + 0.12 * c7b + 0.07 * c8b
                ) * 0.36;

                // Onda de choque acústica não-linear na garganta das cornetas (gera batimento grave de 61.5 Hz)
                const throatMix = hornEnv1 * tr1 * 1.04 + hornEnv2 * tr2 * 0.96;
                const shock = fastTanh(1.65 * throatMix + 0.34 * throatMix * Math.abs(throatMix));
                const airJet = stepBiquad(hornAirJetBp, wn1) * (0.24 * hornValveEnv + 0.055 * (hornEnv1 + hornEnv2));

                const bell = stepBiquad(
                    hornBellLp,
                    stepBiquad(hornPresence, stepBiquad(hornIronBite, stepBiquad(hornBodyPeak, shock + airJet)))
                );

                const panSpread = (hornEnv1 * tr1 - hornEnv2 * tr2) * 0.06;
                hornOutL = bell * 0.68 + panSpread;
                hornOutR = bell * 0.68 - panSpread;
                hornYardSend = bell * 0.92;
            } else {
                hornEnv1 = 0.0;
                hornEnv2 = 0.0;
                hornValveEnv = 0.0;
            }

            // Reflexão curta de pátio aberto nos galpões (exclusiva da buzina a ar Columbia)
            const yardSend = hornYardSend;
            let yardEchoL = 0.0;
            let yardEchoR = 0.0;
            if (yardSend !== 0.0 || hornEchoEnergy > 0.00008) {
                const dlyL = hornEchoBufL[hornEchoIdxL];
                const dlyR = hornEchoBufR[hornEchoIdxR];
                hornEchoLpL += (dlyL - hornEchoLpL) * hornEchoLpA;
                hornEchoLpR += (dlyR - hornEchoLpR) * hornEchoLpA;
                hornEchoBufL[hornEchoIdxL] = yardSend + hornEchoLpR * 0.20;
                hornEchoBufR[hornEchoIdxR] = yardSend + hornEchoLpL * 0.20;
                hornEchoIdxL = (hornEchoIdxL + 1) % hornEchoLenL;
                hornEchoIdxR = (hornEchoIdxR + 1) % hornEchoLenR;
                hornEchoEnergy = 0.9985 * hornEchoEnergy + 0.0015 * (Math.abs(hornEchoLpL) + Math.abs(hornEchoLpR) + Math.abs(yardSend));
                yardEchoL = hornEchoLpL * 0.16;
                yardEchoR = hornEchoLpR * 0.16;
            } else {
                hornEchoEnergy = 0.0;
            }

            const engineDuck = (1.0 - 0.22 * hornEnv1 * curHornGain * hornVol) *
                (1.0 - 0.65 * Math.min(1.0, foleyDuckEnv) * curHornGain * foleyDuckScale);
            const engGain = curMasterGain * engineEnv * engineDuck;
            const engCoreL = (stL * 0.37 + stR * 0.10 + subL + mech * prof.clatMul + turboSig * prof.turboMul) * prof.outTrim + starterAuxL;
            const engCoreR = (stR * 0.37 + stL * 0.10 + subR + mech * prof.clatMul + turboSig * prof.turboMul) * prof.outTrim + starterAuxR;
            const pneuGain = curHornGain * airVol * engineDuck;
            const hornLevel = curHornGain * hornVol;
            const rawL = engCoreL * engGain + pneu * pneuGain + (hornOutL + yardEchoL) * hornLevel;
            const rawR = engCoreR * engGain + pneu * pneuGain + (hornOutR + yardEchoR) * hornLevel;

            const hpL = rawL - dcInL + dcPole * dcOutL;
            dcInL = rawL;
            dcOutL = hpL;

            const hpR = rawR - dcInR + dcPole * dcOutR;
            dcInR = rawR;
            dcOutR = hpR;

            postLpL += (hpL - postLpL) * postLpA;
            postLpR += (hpR - postLpR) * postLpA;

            // Volumes individuais da 5ª roda e do engate já aplicados na entrada do barramento Foley
            outL[i] = fastTanh(postLpL * 0.92 + foleyLpL * curHornGain) * 0.88;
            outR[i] = fastTanh(postLpR * 0.92 + foleyLpR * curHornGain) * 0.88;
        }
    };

    return {
        setTargets,
        setHorn,
        setVariant,
        setSampleEngineMode,
        triggerAirBrake,
        triggerShiftAir,
        triggerFifthWheelCouple,
        triggerStingerDuck,
        triggerTrailerHitch,
        triggerTrailerLock,
        triggerTrailerUnlock,
        triggerEngineStart,
        triggerEngineResumeRunning,
        triggerEngineStop,
        resetEngineOff,
        triggerStartup,
        renderBlock
    };
}

/**
 * Sintetizador estéreo procedural offline dos sons definitivos de fim de fase (opções #4 escolhidas):
 *   - Falha ('fail'): Acorde Dramático Grave de Simulador ("DUN — DUNNN...")
 *   - Sucesso ('success'): Chime Cristalino Moderno (Arpejo Luminoso Dmaj9)
 */
export function renderOutcomeStinger(kind, sampleRate = 48000) {
    const fs = Math.max(22050, Math.min(96000, Number(sampleRate) || 48000));
    const invFs = 1.0 / fs;
    const TWO_PI = Math.PI * 2.0;
    const isSuccess = kind === 'success';

    const totalSec = isSuccess ? 1.62 : 1.58;
    const N = Math.max(256, Math.round(totalSec * fs));
    const dryL = new Float32Array(N);
    const dryR = new Float32Array(N);

    let rng = (isSuccess ? 0x6d2b79f5 : 0x9e3779b9) ^ (4 * 0x85ebca6b);
    const rand = () => {
        rng ^= rng << 13;
        rng ^= rng >>> 17;
        rng ^= rng << 5;
        return (((rng >>> 0) / 2147483648.0) - 1.0);
    };

    const softSat = (x) => {
        if (x > 4.5) return 1.0;
        if (x < -4.5) return -1.0;
        const x2 = x * x;
        return (x * (27.0 + x2)) / (27.0 + 9.0 * x2);
    };

    const midiToHz = (m) => 440.0 * Math.pow(2.0, (m - 69.0) / 12.0);

    const makeBq = (mode, f0, q) => {
        const flt = { mode, b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 };
        tuneBq(flt, f0, q);
        return flt;
    };
    const tuneBq = (flt, f0, q) => {
        const fc = Math.max(24.0, Math.min(fs * 0.43, f0));
        const w0 = TWO_PI * fc * invFs;
        const cw = Math.cos(w0);
        const sw = Math.sin(w0);
        const alpha = sw / (2.0 * Math.max(0.25, q));
        let b0 = 1, b1 = 0, b2 = 0;
        const a0 = 1.0 + alpha;
        const a1 = -2.0 * cw;
        const a2 = 1.0 - alpha;
        if (flt.mode === 'lp') {
            b0 = (1.0 - cw) * 0.5;
            b1 = 1.0 - cw;
            b2 = (1.0 - cw) * 0.5;
        } else {
            b0 = alpha;
            b1 = 0.0;
            b2 = -alpha;
        }
        const invA0 = 1.0 / a0;
        flt.b0 = b0 * invA0;
        flt.b1 = b1 * invA0;
        flt.b2 = b2 * invA0;
        flt.a1 = a1 * invA0;
        flt.a2 = a2 * invA0;
    };
    const stepBq = (flt, x) => {
        const y = flt.b0 * x + flt.b1 * flt.x1 + flt.b2 * flt.x2 - flt.a1 * flt.y1 - flt.a2 * flt.y2;
        flt.x2 = flt.x1;
        flt.x1 = x;
        flt.y2 = flt.y1;
        flt.y1 = y;
        return y;
    };

    const panAdd = (idx, sig, pan, amp = 1.0) => {
        const p = Math.max(-1.0, Math.min(1.0, pan));
        const ang = (p + 1.0) * (Math.PI * 0.25);
        dryL[idx] += sig * amp * Math.cos(ang);
        dryR[idx] += sig * amp * Math.sin(ang);
    };

    const addBrassNote = ({
        t0, dur, fStart, fEnd = fStart, slideStartFrac = 0.25,
        amp = 0.35, pan = 0.0, atk = 0.018, rel = 0.085,
        brightBase = 520.0, brightSpan = 1650.0, qBell = 1.65,
        vibDepth = 0.006, vibHz = 5.4
    }) => {
        const i0 = Math.max(0, Math.round(t0 * fs));
        const i1 = Math.min(N, Math.round((t0 + dur) * fs));
        if (i1 <= i0) return;
        const bellLp = makeBq('lp', brightBase, qBell);
        const lipBp = makeBq('bp', Math.max(180.0, fStart * 2.2), 1.4);
        let ph = 0.0;
        let vibPh = 0.0;
        for (let i = i0; i < i1; i++) {
            const lt = (i - i0) * invFs;
            const rem = (i1 - i) * invFs;
            const envAtk = Math.min(1.0, lt / Math.max(0.003, atk));
            const envRel = rem < rel ? 0.5 * (1.0 - Math.cos(Math.PI * (rem / rel))) : 1.0;
            const sustain = Math.exp(-lt * 0.55);
            const env = envAtk * envRel * (0.35 + 0.65 * sustain);

            const u = lt / Math.max(0.001, dur);
            let fBase = fStart;
            if (fEnd !== fStart && u > slideStartFrac) {
                const su = Math.min(1.0, (u - slideStartFrac) / Math.max(0.01, 1.0 - slideStartFrac));
                const smoothSu = su * su * (3.0 - 2.0 * su);
                fBase = fStart * Math.pow(fEnd / fStart, smoothSu);
            }
            const scoop = 1.0 - 0.022 * Math.exp(-lt * 65.0);
            vibPh += vibHz * invFs;
            const vibAmt = vibDepth * Math.min(1.0, lt / 0.14);
            const fInst = fBase * scoop * (1.0 + vibAmt * Math.sin(TWO_PI * vibPh));

            ph += fInst * invFs;
            if (ph >= 1.0) ph -= Math.floor(ph);

            const c1 = Math.cos(TWO_PI * ph);
            const c2 = 2.0 * c1 * c1 - 1.0;
            const c3 = 2.0 * c1 * c2 - c1;
            const c4 = 2.0 * c1 * c3 - c2;
            const c5 = 2.0 * c1 * c4 - c3;
            const c6 = 2.0 * c1 * c5 - c4;
            const c7 = 2.0 * c1 * c6 - c5;
            const rawWave = (1.00 * c1 + 0.86 * c2 + 0.72 * c3 + 0.54 * c4 + 0.38 * c5 + 0.25 * c6 + 0.15 * c7) * 0.34;
            const breath = stepBq(lipBp, rand()) * (0.14 * Math.exp(-lt * 26.0) + 0.025 * env);
            const lipSig = softSat((rawWave + breath) * (1.35 + 0.65 * env));

            if (((i - i0) & 31) === 0) {
                tuneBq(bellLp, brightBase + brightSpan * env, qBell);
            }
            const out = stepBq(bellLp, lipSig) * env;
            panAdd(i, out, pan, amp);
        }
    };

    const addCrystalBell = ({ t0, dur, freq, amp = 0.28, pan = 0.0 }) => {
        const i0 = Math.max(0, Math.round(t0 * fs));
        const i1 = Math.min(N, Math.round((t0 + dur) * fs));
        if (i1 <= i0) return;
        const ratios = [1.0, 2.0, 3.008, 4.024, 5.41];
        const gains = [1.0, 0.46, 0.24, 0.14, 0.08];
        const decays = [2.6, 4.2, 6.8, 9.5, 13.5];
        const malletBp = makeBq('bp', Math.min(fs * 0.38, freq * 2.4), 1.8);
        for (let i = i0; i < i1; i++) {
            const lt = (i - i0) * invFs;
            const rem = (i1 - i) * invFs;
            const atk = Math.min(1.0, lt / 0.0025);
            const rel = rem < 0.05 ? 0.5 * (1.0 - Math.cos(Math.PI * (rem / 0.05))) : 1.0;
            let sum = 0.0;
            for (let k = 0; k < ratios.length; k++) {
                const fk = freq * ratios[k];
                if (fk < fs * 0.44) {
                    sum += gains[k] * Math.sin(TWO_PI * fk * lt) * Math.exp(-lt * decays[k]);
                }
            }
            const mallet = stepBq(malletBp, rand()) * 0.26 * Math.exp(-lt * 140.0);
            panAdd(i, (sum * 0.58 + mallet) * atk * rel, pan, amp);
        }
    };

    const addLowImpact = ({ t0, dur = 0.36, fTop = 128.0, fBot = 46.0, amp = 0.52, slap = 0.35 }) => {
        const i0 = Math.max(0, Math.round(t0 * fs));
        const i1 = Math.min(N, Math.round((t0 + dur) * fs));
        const slapBp = makeBq('bp', 340.0, 1.1);
        let ph = 0.0;
        for (let i = i0; i < i1; i++) {
            const lt = (i - i0) * invFs;
            const fInst = fBot + (fTop - fBot) * Math.exp(-lt * 34.0);
            ph += fInst * invFs;
            const thump = Math.sin(TWO_PI * ph) * Math.exp(-lt * 9.5) * Math.min(1.0, lt / 0.002);
            const hit = stepBq(slapBp, rand()) * slap * Math.exp(-lt * 48.0);
            const sig = softSat((thump + hit) * 1.4);
            dryL[i] += sig * amp;
            dryR[i] += sig * amp;
        }
    };

    const addWarmPad = ({ t0, dur, freq, amp = 0.14, pan = 0.0, atk = 0.08 }) => {
        const i0 = Math.max(0, Math.round(t0 * fs));
        const i1 = Math.min(N, Math.round((t0 + dur) * fs));
        if (i1 <= i0) return;
        const padLp = makeBq('lp', 1850.0, 0.85);
        let pA = 0.0;
        let pB = 0.37;
        for (let i = i0; i < i1; i++) {
            const lt = (i - i0) * invFs;
            const rem = (i1 - i) * invFs;
            const env = Math.min(1.0, lt / atk) *
                (rem < 0.14 ? 0.5 * (1.0 - Math.cos(Math.PI * (rem / 0.14))) : 1.0) *
                Math.exp(-lt * 0.65);
            pA += freq * 0.997 * invFs;
            pB += freq * 1.003 * invFs;
            if (pA >= 1.0) pA -= 1.0;
            if (pB >= 1.0) pB -= 1.0;
            const sawA = (2.0 * pA - 1.0) + 0.5 * Math.sin(TWO_PI * pA);
            const sawB = (2.0 * pB - 1.0) + 0.5 * Math.sin(TWO_PI * pB);
            const sig = stepBq(padLp, (sawA + sawB) * 0.35) * env;
            panAdd(i, sig, pan, amp);
        }
    };

    let wetMix = 0.34;
    const masterTrim = 0.92;

    if (!isSuccess) {
        // Som de Falha (#4): Acorde Dramático Grave de Simulador ("DUN — DUNNN...")
        wetMix = 0.34;
        addLowImpact({ t0: 0.00, dur: 0.28, fTop: 112.0, fBot: 55.0, amp: 0.44, slap: 0.22 });
        addBrassNote({ t0: 0.00, dur: 0.22, fStart: midiToHz(43), amp: 0.30, pan: -0.22, brightBase: 380, brightSpan: 950 });
        addBrassNote({ t0: 0.00, dur: 0.22, fStart: midiToHz(50), amp: 0.26, pan: 0.18, brightBase: 420, brightSpan: 1050 });
        addBrassNote({ t0: 0.00, dur: 0.22, fStart: midiToHz(55), amp: 0.24, pan: 0.05, brightBase: 460, brightSpan: 1100 });

        addLowImpact({ t0: 0.26, dur: 0.52, fTop: 96.0, fBot: 38.0, amp: 0.56, slap: 0.28 });
        const chord2 = [
            { m: 36, amp: 0.32, pan: 0.0 },
            { m: 42, amp: 0.25, pan: -0.28 },
            { m: 48, amp: 0.26, pan: 0.26 },
            { m: 51, amp: 0.24, pan: -0.15 },
            { m: 57, amp: 0.20, pan: 0.18 }
        ];
        for (const v of chord2) {
            addBrassNote({
                t0: 0.26, dur: 1.18, fStart: midiToHz(v.m), fEnd: midiToHz(v.m - 0.35),
                slideStartFrac: 0.45, amp: v.amp, pan: v.pan, atk: 0.022, rel: 0.24,
                brightBase: 340.0, brightSpan: 920.0
            });
        }
    } else {
        // Som de Sucesso (#4): Chime Cristalino Moderno (Arpejo Luminoso Dmaj9)
        wetMix = 0.36;
        const arp = [
            { t: 0.00, m: 62, p: -0.32, a: 0.32 },
            { t: 0.09, m: 66, p: 0.28, a: 0.32 },
            { t: 0.18, m: 69, p: -0.22, a: 0.34 },
            { t: 0.27, m: 73, p: 0.24, a: 0.34 },
            { t: 0.36, m: 74, p: -0.14, a: 0.36 },
            { t: 0.46, m: 78, p: 0.18, a: 0.36 },
            { t: 0.56, m: 86, p: 0.0, a: 0.40 }
        ];
        for (const n of arp) {
            addCrystalBell({ t0: n.t, dur: totalSec - n.t - 0.02, freq: midiToHz(n.m), amp: n.a, pan: n.p });
        }
        addWarmPad({ t0: 0.04, dur: 1.48, freq: midiToHz(50), amp: 0.18, pan: 0.0, atk: 0.09 });
        addWarmPad({ t0: 0.12, dur: 1.40, freq: midiToHz(57), amp: 0.15, pan: -0.26, atk: 0.10 });
        addWarmPad({ t0: 0.18, dur: 1.34, freq: midiToHz(66), amp: 0.15, pan: 0.26, atk: 0.10 });
        addWarmPad({ t0: 0.24, dur: 1.28, freq: midiToHz(73), amp: 0.13, pan: -0.14, atk: 0.12 });
    }

    // Reverberação estéreo Householder 4x4 + filtro DC + normalização musical consistente + fade-out livre de clique
    const outL = new Float32Array(N);
    const outR = new Float32Array(N);
    const d0 = Math.max(16, Math.round(0.0173 * fs));
    const d1 = Math.max(16, Math.round(0.0247 * fs));
    const d2 = Math.max(16, Math.round(0.0349 * fs));
    const d3 = Math.max(16, Math.round(0.0479 * fs));
    const b0 = new Float32Array(d0);
    const b1 = new Float32Array(d1);
    const b2 = new Float32Array(d2);
    const b3 = new Float32Array(d3);
    let idx0 = 0, idx1 = 0, idx2 = 0, idx3 = 0;
    let lp0 = 0, lp1 = 0, lp2 = 0, lp3 = 0;
    const revLpA = 1.0 - Math.exp(-TWO_PI * 2650.0 * invFs);
    const dcPole = Math.exp(-TWO_PI * 20.0 * invFs);
    let dcInL = 0, dcOutL = 0, dcInR = 0, dcOutR = 0;
    const fadeSamples = Math.max(32, Math.round(0.032 * fs));

    let peak = 0.0;
    for (let i = 0; i < N; i++) {
        const send = (dryL[i] + dryR[i]) * 0.5;
        const r0 = b0[idx0], r1 = b1[idx1], r2 = b2[idx2], r3 = b3[idx3];
        lp0 += (r0 - lp0) * revLpA;
        lp1 += (r1 - lp1) * revLpA;
        lp2 += (r2 - lp2) * revLpA;
        lp3 += (r3 - lp3) * revLpA;
        const hSum = 0.5 * (lp0 + lp1 + lp2 + lp3);
        const fb = 0.62;
        b0[idx0] = send + (hSum - lp0) * fb;
        b1[idx1] = send * 0.90 + (hSum - lp1) * fb;
        b2[idx2] = -send * 0.85 + (hSum - lp2) * fb;
        b3[idx3] = send * 0.78 + (hSum - lp3) * fb;
        idx0 = (idx0 + 1) % d0;
        idx1 = (idx1 + 1) % d1;
        idx2 = (idx2 + 1) % d2;
        idx3 = (idx3 + 1) % d3;

        const wetL = (lp0 + lp2 * 0.85) * wetMix;
        const wetR = (lp1 + lp3 * 0.85) * wetMix;
        const mixL = dryL[i] + wetL;
        const mixR = dryR[i] + wetR;

        const hpL = mixL - dcInL + dcPole * dcOutL;
        dcInL = mixL;
        dcOutL = hpL;
        const hpR = mixR - dcInR + dcPole * dcOutR;
        dcInR = mixR;
        dcOutR = hpR;

        let tailEnv = 1.0;
        const rem = N - 1 - i;
        if (rem < fadeSamples) {
            tailEnv = 0.5 * (1.0 - Math.cos(Math.PI * (rem / fadeSamples)));
        }
        const sL = softSat(hpL * masterTrim) * tailEnv;
        const sR = softSat(hpR * masterTrim) * tailEnv;
        outL[i] = sL;
        outR[i] = sR;
        const aMax = Math.max(Math.abs(sL), Math.abs(sR));
        if (aMax > peak) peak = aMax;
    }

    // Nivelamento consistente de pico (~0.78)
    if (peak > 0.001) {
        const targetPeak = 0.78;
        const gain = Math.min(2.2, targetPeak / peak);
        for (let i = 0; i < N; i++) {
            outL[i] = softSat(outL[i] * gain * 1.05) * 0.86;
            outR[i] = softSat(outR[i] * gain * 1.05) * 0.86;
        }
    }
    outL[0] = 0.0;
    outR[0] = 0.0;
    outL[N - 1] = 0.0;
    outR[N - 1] = 0.0;
    return { L: outL, R: outR, sampleRate: fs };
}


// Escalonamento longo de 4 marchas calibrado para "esticar" bem as notas do motor no pátio e na pista (km/h a 2.060 RPM)
const FORWARD_GEAR_TOP_KMH = [12.5, 24.5, 38.5, 56.0];
const IDLE_RPM = 595.0;
const SHIFT_RPM = 2060.0;
const MAX_RPM = 2180.0;

export class W900EngineSound {
    constructor() {
        this.audioCtx = null;
        this.masterBus = null;
        this.workletNode = null;
        this.scriptNode = null;
        this.dspCore = null;
        this.muted = false;
        this.frozen = false;
        this.sfxVolume = DEFAULT_SFX_VOLUME;
        this.sfxLevels = Object.fromEntries(SFX_KINDS.map((k) => [k, 1.0]));
        this._duckScale = 1.0;
        this.hornActive = false;
        this._hornInputHeld = false;
        this.engineRunning = false;
        this.started = false;
        this._initializing = false;
        this.variant = DEFAULT_ENGINE_VARIANT; // 6: Scania (padrão), 7: Scania Grave, 1, 2, 4, 5: procedurais
        this._stingerCache = new Map();
        this._activeStinger = null;
        this._stingerReqId = 0;
        this._alertBuffer = null;
        this._alertLoadPromise = null;
        this._failBuffer = null;
        this._failLoadPromise = null;
        this._hornBuffer = null;
        this._hornLoadPromise = null;
        this._hornVoice = null;
        this._dspHornOn = false;
        this._lastAlertMs = -Infinity;

        this._sampleEngineData = null;
        this._sampleEngineLoadPromise = null;
        this._sampleEngineFailed = false;
        this._activeSampleEngine = null;
        this._sampleEngineGen = 0;
        this._duckUntilMs = 0;

        this.gear = 1; // 1..4 à frente, -1 em ré
        this.rpm = 0.0;
        this.load = 0.0;
        this.turbo = 0.0;
        this.jake = 0.0;
        this.shiftTimer = 0.0;
        this.sinceLastShift = 1.0;

        if (typeof window !== 'undefined' && window.location && window.location.protocol !== 'file:') {
            fetchRawEngineAudioBytes().catch(() => {});
        }
    }

    _normalizeVariant(variantId) {
        const parsed = Number(variantId);
        return VALID_ENGINE_VARIANTS.includes(parsed) ? parsed : DEFAULT_ENGINE_VARIANT;
    }

    _isSampleVariant(variantId = this.variant) {
        return (variantId === 6 || variantId === 7) && !this._sampleEngineFailed;
    }

    _sampleProfileForVariant(variantId = this.variant) {
        if (variantId === 7) {
            // Scania Grave: pitch base mais baixo (0.78x -> ~1.45x no corte) + subgrave cheio (88 Hz / 105 Hz)
            // abrindo progressivamente até 2.35 kHz ao esticar as marchas sem perder o peso cavernoso
            return {
                baseRate: SCANIA_GRAVE_BASE_RATE,
                rateSpan: 0.64,
                idleLowDb: 8.5,
                rpmLowDb: 1.5,
                loadLowDb: 1.4,
                idleChestDb: 5.0,
                rpmChestDb: 1.0,
                loadChestDb: 1.0,
                idleMidDb: -2.5,
                rpmMidDb: 0.8,
                loadMidDb: 1.5,
                idleLpHz: 1320.0,
                redlineLpHz: 2350.0,
                gainTrim: 0.72,
                rpmGainComp: 0.10,
                loadGainBoost: 0.18
            };
        }
        // Scania (padrão): 100% puro na marcha lenta (1.00x) e esticando até ~1.82x com compensação dinâmica de
        // corpo (88/105 Hz) e controle suave de brilho em alta rotação para nunca afinar o timbre
        return {
            baseRate: 1.0,
            rateSpan: 0.78,
            idleLowDb: 0.0,
            rpmLowDb: 4.8,
            loadLowDb: 2.2,
            idleChestDb: 0.0,
            rpmChestDb: 3.4,
            loadChestDb: 0.0,
            idleMidDb: 0.0,
            rpmMidDb: -1.4,
            loadMidDb: 1.8,
            idleLpHz: 20000.0,
            redlineLpHz: 3100.0,
            gainTrim: 1.0,
            rpmGainComp: -0.06,
            loadGainBoost: 0.16
        };
    }

    getStartupDuration() {
        if (this._isSampleVariant()) {
            const baseDur = this._sampleEngineData ? this._sampleEngineData.startupDurationSec : ENGINE_STARTUP_DURATION;
            const prof = this._sampleProfileForVariant();
            return baseDur / Math.max(0.5, prof.baseRate);
        }
        return PROCEDURAL_STARTUP_DURATION;
    }

    _nowMs() {
        return (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
    }

    _requestSampleDuck(durationSec, scale = 1.0) {
        this._duckScale = Math.max(0.0, Math.min(1.0, Number(scale)));
        const dMs = Math.max(80, Math.min(2000, (Number(durationSec) || 0.4) * 1000.0));
        this._duckUntilMs = Math.max(this._duckUntilMs, this._nowMs() + dMs);
        this._updateSampleEngineParams();
    }

    _ensureSampleEngineDecoded() {
        if (this._sampleEngineData) return Promise.resolve(this._sampleEngineData);
        if (this._sampleEngineLoadPromise) return this._sampleEngineLoadPromise;
        if (!this.audioCtx || this._sampleEngineFailed) return Promise.resolve(null);

        const ctx = this.audioCtx;
        this._sampleEngineLoadPromise = fetchRawEngineAudioBytes()
            .then(([stuBytes, regBytes]) => Promise.all([
                ctx.decodeAudioData(stuBytes.slice(0)),
                ctx.decodeAudioData(regBytes.slice(0))
            ]))
            .then(([stuBuf, regBuf]) => {
                const built = buildSeamlessEngineAudioBuffer(ctx, stuBuf, regBuf);
                this._sampleEngineData = built;
                this._sampleEngineLoadPromise = null;
                return built;
            })
            .catch(() => {
                this._sampleEngineLoadPromise = null;
                this._sampleEngineFailed = true;
                this._postCommand({ type: 'sampleMode', enabled: false });
                this._postCommand({ type: 'variant', variant: this.variant });
                if (this.engineRunning) {
                    this._postCommand({ type: 'engineStart' });
                }
                return null;
            });
        return this._sampleEngineLoadPromise;
    }

    _disposeActiveSampleEngine(windDown = false) {
        const prev = this._activeSampleEngine;
        if (!prev) return;
        this._activeSampleEngine = null;
        prev.stopping = true;
        try {
            const ctx = prev.ctx;
            const now = ctx.currentTime;
            prev.src.playbackRate.cancelScheduledValues(now);
            prev.gain.gain.cancelScheduledValues(now);
            const curRate = Math.max(0.25, prev.src.playbackRate.value || 1.0);
            const curGain = Math.max(0.0001, prev.gain.gain.value || 0.0001);
            prev.src.playbackRate.setValueAtTime(curRate, now);
            prev.gain.gain.setValueAtTime(curGain, now);
            if (windDown) {
                const dur = now < prev.regularStartCtxTime ? 0.32 : 0.46;
                const stopRate = Math.max(0.28, curRate * 0.42);
                prev.src.playbackRate.exponentialRampToValueAtTime(stopRate, now + dur);
                prev.gain.gain.setValueAtTime(curGain, now + Math.min(0.05, dur * 0.12));
                prev.gain.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.02);
                prev.src.stop(now + dur + 0.04);
            } else {
                prev.gain.gain.linearRampToValueAtTime(0.0, now + 0.012);
                prev.src.stop(now + 0.016);
            }
        } catch (_err) {
            // Ignora caso o nó já tenha encerrado
        }
    }

    _launchSampleEngineNode(data, silent = false) {
        if (!this.audioCtx || !data || !this.engineRunning || !this._isSampleVariant()) return;
        const ctx = this.audioCtx;
        const now = ctx.currentTime;
        const prof = this._sampleProfileForVariant();

        const src = ctx.createBufferSource();
        src.buffer = data.buffer;
        src.loop = true;
        src.loopStart = data.loopStartSec;
        src.loopEnd = data.loopEndSec;

        const lowShelf = ctx.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 88.0;
        lowShelf.gain.value = prof.idleLowDb;
        lowShelf.frequency.setValueAtTime(88.0, now);
        lowShelf.gain.setValueAtTime(prof.idleLowDb, now);

        const chestPeak = ctx.createBiquadFilter();
        chestPeak.type = 'peaking';
        chestPeak.frequency.value = 105.0;
        chestPeak.Q.value = 1.15;
        chestPeak.gain.value = prof.idleChestDb;
        chestPeak.frequency.setValueAtTime(105.0, now);
        chestPeak.Q.setValueAtTime(1.15, now);
        chestPeak.gain.setValueAtTime(prof.idleChestDb, now);

        const midPeak = ctx.createBiquadFilter();
        midPeak.type = 'peaking';
        midPeak.frequency.value = 420.0;
        midPeak.Q.value = 0.90;
        midPeak.gain.value = prof.idleMidDb;
        midPeak.frequency.setValueAtTime(420.0, now);
        midPeak.Q.setValueAtTime(0.90, now);
        midPeak.gain.setValueAtTime(prof.idleMidDb, now);

        const highLp = ctx.createBiquadFilter();
        highLp.type = 'lowpass';
        highLp.frequency.value = prof.idleLpHz;
        highLp.Q.value = 0.72;
        highLp.frequency.setValueAtTime(prof.idleLpHz, now);
        highLp.Q.setValueAtTime(0.72, now);

        const gain = ctx.createGain();
        const initGain = BASE_SAMPLE_ENGINE_GAIN * prof.gainTrim * (this.frozen ? 0.28 : 1.0);
        gain.gain.value = 0.0001;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(initGain, now + 0.008);
        src.playbackRate.value = prof.baseRate;
        src.playbackRate.setValueAtTime(prof.baseRate, now);

        src.connect(lowShelf);
        lowShelf.connect(chestPeak);
        chestPeak.connect(midPeak);
        midPeak.connect(highLp);
        highLp.connect(gain);
        const masterOut = this._ensureMasterBus() || ctx.destination;
        gain.connect(masterOut);

        const offset = silent ? data.startupDurationSec : 0.0;
        const startupWallSec = data.startupDurationSec / Math.max(0.5, prof.baseRate);
        const regularStartCtxTime = silent ? now : now + startupWallSec;
        const handle = {
            src,
            lowShelf,
            chestPeak,
            midPeak,
            highLp,
            gain,
            ctx,
            startCtxTime: now,
            fadeInEndCtxTime: now + 0.010,
            regularStartCtxTime,
            profileRate: prof.baseRate,
            stopping: false
        };
        this._activeSampleEngine = handle;
        src.onended = () => {
            if (this._activeSampleEngine === handle) {
                this._activeSampleEngine = null;
            }
            try {
                src.disconnect();
                lowShelf.disconnect();
                chestPeak.disconnect();
                midPeak.disconnect();
                highLp.disconnect();
                gain.disconnect();
            } catch (_err) {
                // Nó já desconectado
            }
        };
        src.start(now, offset);
    }

    _startSampleEngine(silent = false) {
        if (!this.audioCtx) {
            this.start();
        }
        if (!this.audioCtx || !this._isSampleVariant()) return;
        const gen = ++this._sampleEngineGen;
        this._disposeActiveSampleEngine(false);

        if (this._sampleEngineData) {
            this._launchSampleEngineNode(this._sampleEngineData, silent);
            return;
        }
        this._ensureSampleEngineDecoded().then((data) => {
            if (!data || gen !== this._sampleEngineGen || !this.engineRunning || !this._isSampleVariant()) return;
            this._disposeActiveSampleEngine(false);
            this._launchSampleEngineNode(data, silent);
        });
    }

    _updateSampleEngineParams() {
        const h = this._activeSampleEngine;
        if (!h || h.stopping) return;
        const now = h.ctx.currentTime;
        const prof = this._sampleProfileForVariant();

        const sfxScale = this.muted ? 0.0 : this.sfxVolume;
        let duck = 1.0;
        if (this._nowMs() < this._duckUntilMs) {
            duck *= 1.0 - 0.48 * sfxScale * this._duckScale;
        }
        if (this.hornActive) {
            duck *= 1.0 - 0.18 * sfxScale * this.sfxLevels.horn;
        }
        const freezeScalar = this.frozen ? 0.28 : 1.0;

        // Durante start_up_engine ou quando congelado, mantém a taxa base e EQ de marcha lenta do perfil (Scania ou Scania Grave)
        if (now < h.regularStartCtxTime || this.frozen) {
            const tau = this.frozen ? 0.05 : 0.025;
            h.src.playbackRate.setTargetAtTime(prof.baseRate, now, tau);
            h.lowShelf.gain.setTargetAtTime(prof.idleLowDb, now, 0.03);
            h.chestPeak.gain.setTargetAtTime(prof.idleChestDb, now, 0.03);
            h.midPeak.gain.setTargetAtTime(prof.idleMidDb, now, 0.03);
            h.highLp.frequency.setTargetAtTime(prof.idleLpHz, now, 0.03);
            if (now >= h.fadeInEndCtxTime) {
                h.gain.gain.setTargetAtTime(BASE_SAMPLE_ENGINE_GAIN * prof.gainTrim * freezeScalar * duck, now, 0.028);
            }
            return;
        }

        const rpmNorm = Math.max(0.0, Math.min(1.12, (this.rpm - IDLE_RPM) / (SHIFT_RPM - IDLE_RPM)));
        const rpmCurve = Math.min(1.0, rpmNorm);
        const loadExcess = Math.max(0.0, Math.min(1.0, (this.load - 0.18) / 0.82));
        const targetRate = prof.baseRate + prof.rateSpan * Math.pow(rpmNorm, 0.88) + 0.032 * loadExcess;
        const lowDb = prof.idleLowDb + prof.rpmLowDb * rpmCurve + prof.loadLowDb * loadExcess;
        const chestDb = prof.idleChestDb + prof.rpmChestDb * rpmCurve + prof.loadChestDb * loadExcess;
        const midDb = prof.idleMidDb + prof.rpmMidDb * rpmCurve + prof.loadMidDb * loadExcess + 1.0 * Math.max(0.0, this.jake);
        const lpHz = prof.idleLpHz * Math.pow(prof.redlineLpHz / prof.idleLpHz, Math.pow(rpmCurve, 0.85));
        const shiftCut = this.shiftTimer > 0 ? 0.86 : 1.0;
        const gainMult = Math.max(0.75, 1.0 + prof.rpmGainComp * rpmCurve + prof.loadGainBoost * loadExcess);
        const targetGain = BASE_SAMPLE_ENGINE_GAIN * prof.gainTrim * gainMult * shiftCut * duck;

        h.src.playbackRate.setTargetAtTime(targetRate, now, 0.034);
        h.lowShelf.gain.setTargetAtTime(lowDb, now, 0.042);
        h.chestPeak.gain.setTargetAtTime(chestDb, now, 0.042);
        h.midPeak.gain.setTargetAtTime(midDb, now, 0.042);
        h.highLp.frequency.setTargetAtTime(lpHz, now, 0.042);
        if (now >= h.fadeInEndCtxTime) {
            h.gain.gain.setTargetAtTime(targetGain, now, 0.030);
        }
    }

    _ensureMasterBus() {
        if (!this.audioCtx) return null;
        if (!this.masterBus) {
            const bus = this.audioCtx.createGain();
            bus.gain.setValueAtTime(this.muted ? 0.0 : 1.0, this.audioCtx.currentTime);
            bus.connect(this.audioCtx.destination);
            this.masterBus = bus;
        }
        return this.masterBus;
    }

    start() {
        if (typeof window === 'undefined') return;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        if (!this.audioCtx) {
            this.audioCtx = new AudioCtx();
            this._ensureMasterBus();
            this._ensureSampleEngineDecoded();
            this._ensureAlertDecoded();
            this._ensureFailDecoded();
            this._ensureHornDecoded();
            this._setupAudioGraph();
        }
    }

    resume() {
        if (!this.audioCtx) {
            this.start();
        }
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().then(() => {
                if (this.hornActive && !this.muted) {
                    this._postCommand({ type: 'horn', active: true });
                }
            }).catch(() => {});
        }
    }

    async _setupAudioGraph() {
        if (this._initializing || this.started || !this.audioCtx) return;
        this._initializing = true;

        const ctx = this.audioCtx;
        const canTryWorklet = Boolean(
            typeof window !== 'undefined' &&
            window.isSecureContext &&
            ctx.audioWorklet &&
            typeof Blob !== 'undefined' &&
            typeof URL !== 'undefined' &&
            typeof URL.createObjectURL === 'function'
        );

        if (canTryWorklet) {
            let blobUrl = null;
            try {
                const processorSource = `
                    ${createW900DspCore.toString()}
                    class W900EngineWorkletProcessor extends AudioWorkletProcessor {
                        constructor() {
                            super();
                            this.core = createW900DspCore(sampleRate);
                            this.port.onmessage = (ev) => {
                                const msg = ev.data;
                                if (!msg) return;
                                if (msg.type === 'params') {
                                    this.core.setTargets(msg);
                                } else if (msg.type === 'variant') {
                                    this.core.setVariant(msg.variant);
                                } else if (msg.type === 'sampleMode') {
                                    this.core.setSampleEngineMode(msg.enabled);
                                } else if (msg.type === 'horn') {
                                    this.core.setHorn(msg.active);
                                } else if (msg.type === 'airBrake') {
                                    this.core.triggerAirBrake(msg.intensity);
                                } else if (msg.type === 'shiftAir') {
                                    this.core.triggerShiftAir(msg.intensity);
                                } else if (msg.type === 'fifthWheelCouple') {
                                    this.core.triggerFifthWheelCouple(msg.intensity);
                                } else if (msg.type === 'stingerDuck') {
                                    this.core.triggerStingerDuck(msg.duration, msg.scale);
                                } else if (msg.type === 'trailerHitch') {
                                    this.core.triggerTrailerHitch(msg.intensity);
                                } else if (msg.type === 'trailerLock') {
                                    this.core.triggerTrailerLock();
                                } else if (msg.type === 'trailerUnlock') {
                                    this.core.triggerTrailerUnlock();
                                } else if (msg.type === 'engineStart' || msg.type === 'startup') {
                                    this.core.triggerEngineStart();
                                } else if (msg.type === 'engineResumeRunning') {
                                    this.core.triggerEngineResumeRunning();
                                } else if (msg.type === 'engineStop') {
                                    this.core.triggerEngineStop();
                                } else if (msg.type === 'engineResetOff') {
                                    this.core.resetEngineOff();
                                }
                            };
                        }
                        process(inputs, outputs) {
                            const out = outputs[0];
                            if (out && out.length >= 2) {
                                this.core.renderBlock(out[0], out[1]);
                            } else if (out && out.length === 1) {
                                const tmpR = new Float32Array(out[0].length);
                                this.core.renderBlock(out[0], tmpR);
                            }
                            return true;
                        }
                    }
                    registerProcessor('w900-engine-processor', W900EngineWorkletProcessor);
                `;
                const blob = new Blob([processorSource], { type: 'application/javascript' });
                blobUrl = URL.createObjectURL(blob);
                await ctx.audioWorklet.addModule(blobUrl);
                URL.revokeObjectURL(blobUrl);
                blobUrl = null;

                const node = new AudioWorkletNode(ctx, 'w900-engine-processor', {
                    numberOfInputs: 0,
                    numberOfOutputs: 1,
                    outputChannelCount: [2]
                });
                const masterOut = this._ensureMasterBus() || ctx.destination;
                node.connect(masterOut);
                this.workletNode = node;
                this.started = true;
                this._initializing = false;
                const sampleEnabled = this._isSampleVariant();
                this._postCommand({ type: 'sampleMode', enabled: sampleEnabled });
                if (!sampleEnabled) {
                    this._postCommand({ type: 'variant', variant: this.variant });
                }
                this._syncState();
                if (this.hornActive && !this.muted) {
                    this._postCommand({ type: 'horn', active: true });
                }
                if (this.engineRunning) {
                    if (!sampleEnabled) {
                        this._postCommand({ type: 'engineStart' });
                    }
                } else {
                    this._postCommand({ type: 'engineResetOff' });
                }
                return;
            } catch (_err) {
                if (blobUrl) {
                    URL.revokeObjectURL(blobUrl);
                }
            }
        }

        // Fallback universal para contextos HTTP não-seguros (ex.: servidor de desenvolvimento)
        this.dspCore = createW900DspCore(ctx.sampleRate);
        const sampleEnabled = this._isSampleVariant();
        this.dspCore.setSampleEngineMode(sampleEnabled);
        if (!sampleEnabled) {
            this.dspCore.setVariant(this.variant);
        }
        const scriptNode = ctx.createScriptProcessor(1024, 0, 2);
        scriptNode.onaudioprocess = (audioEvent) => {
            const outL = audioEvent.outputBuffer.getChannelData(0);
            const outR = audioEvent.outputBuffer.numberOfChannels > 1
                ? audioEvent.outputBuffer.getChannelData(1)
                : outL;
            this.dspCore.renderBlock(outL, outR);
        };
        const masterOut = this._ensureMasterBus() || ctx.destination;
        scriptNode.connect(masterOut);
        this.scriptNode = scriptNode;
        this.started = true;
        this._initializing = false;
        this._syncState();
        if (this.hornActive && !this.muted) {
            this._postCommand({ type: 'horn', active: true });
        }
        if (this.engineRunning) {
            if (!sampleEnabled) {
                this._postCommand({ type: 'engineStart' });
            }
        } else {
            this._postCommand({ type: 'engineResetOff' });
        }
    }

    _postCommand(msg) {
        // Buzina: usa o arquivo customizado quando disponível; o DSP procedural fica só como fallback
        if (msg && msg.type === 'horn' && !msg._toDsp) {
            this._handleHornCommand(Boolean(msg.active));
            return;
        }
        if (this.workletNode) {
            this.workletNode.port.postMessage(msg);
        } else if (this.dspCore) {
            if (msg.type === 'params') {
                this.dspCore.setTargets(msg);
            } else if (msg.type === 'variant') {
                this.dspCore.setVariant(msg.variant);
            } else if (msg.type === 'sampleMode') {
                this.dspCore.setSampleEngineMode(msg.enabled);
            } else if (msg.type === 'horn') {
                this.dspCore.setHorn(msg.active);
            } else if (msg.type === 'airBrake') {
                this.dspCore.triggerAirBrake(msg.intensity);
            } else if (msg.type === 'shiftAir') {
                this.dspCore.triggerShiftAir(msg.intensity);
            } else if (msg.type === 'fifthWheelCouple') {
                this.dspCore.triggerFifthWheelCouple(msg.intensity);
            } else if (msg.type === 'stingerDuck') {
                this.dspCore.triggerStingerDuck(msg.duration, msg.scale);
            } else if (msg.type === 'trailerHitch') {
                this.dspCore.triggerTrailerHitch(msg.intensity);
            } else if (msg.type === 'trailerLock') {
                this.dspCore.triggerTrailerLock();
            } else if (msg.type === 'trailerUnlock') {
                this.dspCore.triggerTrailerUnlock();
            } else if (msg.type === 'engineStart' || msg.type === 'startup') {
                this.dspCore.triggerEngineStart();
            } else if (msg.type === 'engineResumeRunning') {
                this.dspCore.triggerEngineResumeRunning();
            } else if (msg.type === 'engineStop') {
                this.dspCore.triggerEngineStop();
            } else if (msg.type === 'engineResetOff') {
                this.dspCore.resetEngineOff();
            }
        }
    }

    _computeMasterGain() {
        if (this.muted) return 0.0;
        if (this.frozen) return 0.28;
        return 1.0;
    }

    _minTurboForVariant() {
        return this.variant === 5 ? 0.19 : 0.06;
    }

    _syncState() {
        this._postCommand({
            type: 'params',
            rpm: this.rpm,
            load: this.load,
            turbo: this.turbo,
            jake: this.jake,
            masterGain: this._computeMasterGain(),
            hornGain: this.muted ? 0.0 : this.sfxVolume,
            hornVol: this.sfxLevels.horn,
            airVol: this.sfxLevels.air,
            slamVol: this.sfxLevels.fifthWheel,
            hitchVol: this.sfxLevels.hitch
        });
        this._updateSampleEngineParams();
    }

    setSfxVolume(volume) {
        const parsed = Number(volume);
        const clamped = Number.isFinite(parsed)
            ? Math.max(0.0, Math.min(1.0, parsed))
            : DEFAULT_SFX_VOLUME;
        this.sfxVolume = clamped;
        if (this._activeStinger && this._activeStinger.gain && this._activeStinger.ctx) {
            try {
                const now = this._activeStinger.ctx.currentTime;
                const kindLevel = this.sfxLevels[this._activeStinger.kind] ?? 1.0;
                const nextGain = (this._activeStinger.baseGain ?? 0.92) * kindLevel * (this.muted ? 0.0 : clamped);
                this._activeStinger.gain.gain.cancelScheduledValues(now);
                this._activeStinger.gain.gain.setValueAtTime(this._activeStinger.gain.gain.value, now);
                this._activeStinger.gain.gain.setTargetAtTime(nextGain, now, 0.015);
            } catch (_err) {
                // Ignora caso o AudioNode já tenha encerrado
            }
        }
        this._syncState();
        return this.sfxVolume;
    }

    getSfxVolume() {
        return this.sfxVolume;
    }

    /** Ajusta o volume individual de um efeito (`kind` em SFX_KINDS; 1.0 = volume original). */
    setSfxLevel(kind, level) {
        if (!SFX_KINDS.includes(kind)) return null;
        const parsed = Number(level);
        const clamped = Number.isFinite(parsed) ? Math.max(0.0, Math.min(1.0, parsed)) : 1.0;
        this.sfxLevels[kind] = clamped;
        if (kind === 'horn') this._refreshHornVoiceGain();
        const st = this._activeStinger;
        if (st && st.kind === kind && st.gain && st.ctx) {
            try {
                const now = st.ctx.currentTime;
                st.gain.gain.cancelScheduledValues(now);
                st.gain.gain.setValueAtTime(st.gain.gain.value, now);
                st.gain.gain.setTargetAtTime((st.baseGain ?? 0.92) * clamped * (this.muted ? 0.0 : this.sfxVolume), now, 0.015);
            } catch (_err) {
                // Ignora caso o AudioNode já tenha encerrado
            }
        }
        this._syncState();
        return clamped;
    }

    _refreshHornVoiceGain() {
        const v = this._hornVoice;
        if (!v) return;
        try {
            const now = v.ctx.currentTime;
            v.gain.gain.cancelScheduledValues(now);
            v.gain.gain.setValueAtTime(v.gain.gain.value, now);
            v.gain.gain.setTargetAtTime(this._hornSampleGain(), now, 0.015);
        } catch (_err) {
            // Ignora se já encerrado
        }
    }

    getSfxLevel(kind) {
        return SFX_KINDS.includes(kind) ? this.sfxLevels[kind] : null;
    }

    getSfxLevels() {
        return { ...this.sfxLevels };
    }

    setEngineRunning(isRunning, silent = false) {
        const next = Boolean(isRunning);
        const wasRunning = this.engineRunning;
        this.engineRunning = next;

        if (next) {
            this.gear = 1;
            this.shiftTimer = 0.0;
            this.rpm = IDLE_RPM;
            this.load = 0.18;
            this.turbo = this._minTurboForVariant();
            this.jake = 0.0;
            if (!this.muted) {
                this.resume();
            }
            if (!wasRunning) {
                if (this._isSampleVariant()) {
                    this._postCommand({ type: 'sampleMode', enabled: true });
                    this._startSampleEngine(Boolean(silent));
                } else {
                    this._postCommand({ type: 'sampleMode', enabled: false });
                    this._postCommand({ type: 'variant', variant: this.variant });
                    this._postCommand({ type: silent ? 'engineResumeRunning' : 'engineStart' });
                }
            }
            this._syncState();
        } else {
            this.gear = 1;
            this.shiftTimer = 0.0;
            this.jake = 0.0;
            this._sampleEngineGen += 1;
            if (silent) {
                this.rpm = 0.0;
                this.load = 0.0;
                this.turbo = 0.0;
                this._disposeActiveSampleEngine(false);
                this._postCommand({ type: 'engineResetOff' });
            } else if (wasRunning) {
                if (!this.muted) {
                    this.resume();
                }
                this._disposeActiveSampleEngine(true);
                this._postCommand({ type: 'engineStop' });
            } else {
                this.rpm = 0.0;
                this.load = 0.0;
                this.turbo = 0.0;
                this._disposeActiveSampleEngine(false);
                this._postCommand({ type: 'engineResetOff' });
            }
            this._syncState();
        }
        return this.engineRunning;
    }

    isEngineRunning() {
        return this.engineRunning;
    }

    setEngineVariant(variantId) {
        const id = this._normalizeVariant(variantId);
        const prevId = this.variant;
        const wasSample = this._isSampleVariant(prevId);
        this.variant = id;
        const nextSample = this._isSampleVariant(id);

        if (this.engineRunning) {
            const minT = this._minTurboForVariant();
            if (this.rpm < IDLE_RPM + 40.0) {
                this.turbo = minT;
            } else if (this.turbo < minT) {
                this.turbo = minT;
            }
        }
        if (!this.muted) {
            this.resume();
        }

        if (nextSample) {
            this._postCommand({ type: 'sampleMode', enabled: true });
            if (this.engineRunning) {
                if (wasSample && this._activeSampleEngine && !this._activeSampleEngine.stopping) {
                    const h = this._activeSampleEngine;
                    const now = h.ctx.currentTime;
                    const nextProf = this._sampleProfileForVariant(id);
                    if (now < h.regularStartCtxTime && h.profileRate > 0) {
                        const rem = Math.max(0.0, h.regularStartCtxTime - now);
                        h.regularStartCtxTime = now + rem * (h.profileRate / nextProf.baseRate);
                    }
                    h.profileRate = nextProf.baseRate;
                    this._updateSampleEngineParams();
                } else {
                    // Motor já estava ligado em modo procedural: entra direto em regular_engine sem re-tocar a partida
                    this._startSampleEngine(true);
                }
            }
        } else {
            if (wasSample) {
                this._sampleEngineGen += 1;
                this._disposeActiveSampleEngine(false);
            }
            this._postCommand({ type: 'sampleMode', enabled: false });
            this._postCommand({ type: 'variant', variant: id });
            if (this.engineRunning && wasSample) {
                this._postCommand({ type: 'engineResumeRunning' });
            }
        }

        this._syncState();
        return id;
    }

    getEngineVariant() {
        return this.variant;
    }

    setHorn(isOn) {
        const held = Boolean(isOn);
        this._hornInputHeld = held;
        const effectiveActive = held && !this.muted;
        if (effectiveActive === this.hornActive) return;
        this.hornActive = effectiveActive;
        if (effectiveActive) {
            this.resume();
            this._postCommand({ type: 'horn', active: true });
        } else {
            this._postCommand({ type: 'horn', active: false });
        }
        this._updateSampleEngineParams();
    }

    triggerAirBrakeHiss(intensity = 1.0) {
        if (this.muted) return;
        this.resume();
        this._postCommand({ type: 'airBrake', intensity });
    }

    triggerFifthWheelCouple(intensity = 1.0) {
        if (this.muted) return;
        this.resume();
        if (this.sfxVolume * this.sfxLevels.fifthWheel > 0.005) {
            this._requestSampleDuck(0.48, this.sfxLevels.fifthWheel);
        }
        this._postCommand({ type: 'fifthWheelCouple', intensity });
    }

    triggerTrailerHitch(intensity = 1.0) {
        if (this.muted) return;
        this.resume();
        if (this.sfxVolume * this.sfxLevels.hitch > 0.005) {
            this._requestSampleDuck(0.20, this.sfxLevels.hitch);
        }
        this._postCommand({ type: 'trailerHitch', intensity });
    }

    triggerTrailerLock() {
        this.triggerTrailerHitch(1.0);
    }

    triggerTrailerUnlock() {
        this.triggerTrailerHitch(1.0);
    }

    playFailSound() {
        this._playOutcomeStinger('fail');
    }

    playSuccessSound() {
        this._playOutcomeStinger('success');
    }

    _ensureAlertDecoded() {
        if (this._alertBuffer) return Promise.resolve(this._alertBuffer);
        if (this._alertLoadPromise) return this._alertLoadPromise;
        if (!this.audioCtx || typeof fetch !== 'function') return Promise.resolve(null);
        const ctx = this.audioCtx;
        this._alertLoadPromise = fetch(ALERT_AUDIO_URL)
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.arrayBuffer();
            })
            .then((bytes) => ctx.decodeAudioData(bytes))
            .then((buf) => {
                this._alertBuffer = buf;
                this._alertLoadPromise = null;
                return buf;
            })
            .catch(() => {
                // Falha silenciosa (ex.: protocolo file://): o aviso visual continua funcionando
                this._alertLoadPromise = null;
                return null;
            });
        return this._alertLoadPromise;
    }

    /** Toca o som de alerta que acompanha as mensagens de aviso. */
    playAlertSound() {
        if (this.muted) return;
        const nowMs = this._nowMs();
        if (nowMs - this._lastAlertMs < ALERT_MIN_INTERVAL_MS) return;
        this._lastAlertMs = nowMs;
        if (!this.audioCtx) {
            this.start();
        }
        const ctx = this.audioCtx;
        if (!ctx) return;
        this.resume();

        this._ensureAlertDecoded().then((buf) => {
            if (!buf || this.muted) return;
            const src = ctx.createBufferSource();
            const gain = ctx.createGain();
            src.buffer = buf;
            const level = this.sfxVolume * this.sfxLevels.alert;
            gain.gain.value = level;
            gain.gain.setValueAtTime(level, ctx.currentTime);
            src.connect(gain);
            gain.connect(this._ensureMasterBus() || ctx.destination);
            src.onended = () => {
                try {
                    src.disconnect();
                    gain.disconnect();
                } catch (_err) {
                    // Nó já desconectado
                }
            };
            src.start();
        });
    }

    _stopActiveStinger(fadeSec = 0.018) {
        const prev = this._activeStinger;
        if (!prev) return;
        this._activeStinger = null;
        try {
            const ctx = prev.ctx;
            const now = ctx.currentTime;
            prev.gain.gain.cancelScheduledValues(now);
            prev.gain.gain.setValueAtTime(Math.max(0.0001, prev.gain.gain.value), now);
            prev.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSec);
            prev.src.stop(now + fadeSec + 0.006);
        } catch (_err) {
            // Ignora se o BufferSourceNode já tiver encerrado naturalmente
        }
    }

    _ensureHornDecoded() {
        if (this._hornBuffer) return Promise.resolve(this._hornBuffer);
        if (this._hornLoadPromise) return this._hornLoadPromise;
        if (!this.audioCtx || typeof fetch !== 'function') return Promise.resolve(null);
        const ctx = this.audioCtx;
        this._hornLoadPromise = fetch(HORN_AUDIO_URL)
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.arrayBuffer();
            })
            .then((bytes) => ctx.decodeAudioData(bytes))
            .then((raw) => {
                this._hornBuffer = this._buildHornLoopBuffer(ctx, raw);
                this._hornLoadPromise = null;
                return this._hornBuffer;
            })
            .catch(() => {
                this._hornLoadPromise = null;
                return null;
            });
        return this._hornLoadPromise;
    }

    /**
     * Copia o áudio da buzina aplicando um crossfade no fim da região de loop com o trecho imediatamente
     * anterior ao início do loop, para que o salto loopEnd -> loopStart seja contínuo (sem clique).
     */
    _buildHornLoopBuffer(ctx, raw) {
        const sr = raw.sampleRate;
        const out = ctx.createBuffer(raw.numberOfChannels, raw.length, sr);
        const ls = Math.round(HORN_LOOP_START_SEC * sr);
        const le = Math.min(raw.length - 1, Math.round(HORN_LOOP_END_SEC * sr));
        const xf = Math.min(Math.round(HORN_LOOP_XFADE_SEC * sr), ls, le - ls);
        for (let c = 0; c < raw.numberOfChannels; c++) {
            const src = raw.getChannelData(c);
            const dst = out.getChannelData(c);
            dst.set(src);
            for (let k = 0; k < xf; k++) {
                const w = 0.5 - 0.5 * Math.cos(Math.PI * (k / xf));
                const i = le - xf + k;
                dst[i] = src[i] * (1.0 - w) + src[ls - xf + k] * w;
            }
        }
        return out;
    }

    _hornSampleGain() {
        return this.muted ? 0.0 : this.sfxVolume * this.sfxLevels.horn;
    }

    _handleHornCommand(active) {
        if (active) {
            if (this._hornBuffer && this.audioCtx) {
                this._startHornVoice();
            } else {
                // Arquivo ainda não carregado (ou indisponível, ex.: file://): buzina procedural
                this._dspHornOn = true;
                this._postCommand({ type: 'horn', active: true, _toDsp: true });
                this._ensureHornDecoded();
            }
        } else {
            this._releaseHornVoice();
            if (this._dspHornOn) {
                this._dspHornOn = false;
                this._postCommand({ type: 'horn', active: false, _toDsp: true });
            }
        }
    }

    _startHornVoice() {
        const ctx = this.audioCtx;
        if (this._hornVoice) this._releaseHornVoice(0.012, false);
        const now = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = this._hornBuffer;
        src.loop = true;
        src.loopStart = HORN_LOOP_START_SEC;
        src.loopEnd = HORN_LOOP_END_SEC;
        const gain = ctx.createGain();
        const level = this._hornSampleGain();
        gain.gain.value = level;
        gain.gain.setValueAtTime(level, now);
        src.connect(gain);
        gain.connect(this._ensureMasterBus() || ctx.destination);
        src.onended = () => {
            try {
                src.disconnect();
                gain.disconnect();
            } catch (_err) {
                // Nó já desconectado
            }
        };
        src.start(now);
        this._hornVoice = { src, gain, ctx };
    }

    _releaseHornVoice(fadeSec = HORN_RELEASE_XFADE_SEC, playTail = true) {
        const v = this._hornVoice;
        if (!v) return;
        this._hornVoice = null;
        const ctx = v.ctx;
        const now = ctx.currentTime;
        try {
            v.gain.gain.cancelScheduledValues(now);
            v.gain.gain.setValueAtTime(v.gain.gain.value, now);
            v.gain.gain.linearRampToValueAtTime(0.0, now + fadeSec);
            v.src.stop(now + fadeSec + 0.01);
        } catch (_err) {
            // Ignora se já encerrado
        }
        const level = this._hornSampleGain();
        if (!playTail || !this._hornBuffer || level <= 0.0) return;
        // Cauda natural do arquivo (2.0 s -> 3.0 s), entrando em crossfade com o loop
        const tail = ctx.createBufferSource();
        tail.buffer = this._hornBuffer;
        const tg = ctx.createGain();
        tg.gain.value = 0.0;
        tg.gain.setValueAtTime(0.0, now);
        tg.gain.linearRampToValueAtTime(level, now + fadeSec);
        tail.connect(tg);
        tg.connect(this._ensureMasterBus() || ctx.destination);
        tail.onended = () => {
            try {
                tail.disconnect();
                tg.disconnect();
            } catch (_err) {
                // Nó já desconectado
            }
        };
        tail.start(now, HORN_TAIL_START_SEC);
    }

    _ensureFailDecoded() {
        if (this._failBuffer) return Promise.resolve(this._failBuffer);
        if (this._failLoadPromise) return this._failLoadPromise;
        if (!this.audioCtx || typeof fetch !== 'function') return Promise.resolve(null);
        const ctx = this.audioCtx;
        this._failLoadPromise = fetch(FAIL_AUDIO_URL)
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.arrayBuffer();
            })
            .then((bytes) => ctx.decodeAudioData(bytes))
            .then((buf) => {
                this._failBuffer = buf;
                this._failLoadPromise = null;
                return buf;
            })
            .catch(() => {
                this._failLoadPromise = null;
                return null;
            });
        return this._failLoadPromise;
    }

    _getOrBuildStingerBuffer(ctx, kind) {
        const sr = Math.round(ctx.sampleRate || 48000);
        const key = `${kind}:${sr}`;
        let audioBuf = this._stingerCache.get(key);
        if (!audioBuf) {
            const rendered = renderOutcomeStinger(kind, sr);
            audioBuf = ctx.createBuffer(2, rendered.L.length, rendered.sampleRate);
            audioBuf.getChannelData(0).set(rendered.L);
            audioBuf.getChannelData(1).set(rendered.R);
            this._stingerCache.set(key, audioBuf);
        }
        return audioBuf;
    }

    _playOutcomeStinger(kind) {
        if (this.muted) return;
        if (!this.audioCtx) {
            this.start();
        }
        const ctx = this.audioCtx;
        if (!ctx) return;

        const reqId = ++this._stingerReqId;
        this._stopActiveStinger(0.018);

        const launchBuffer = (fileBuf = null) => {
            if (reqId !== this._stingerReqId) return;
            if (this.muted) return;
            // Arquivo customizado toca no volume original (1.0); stinger procedural mantém o 0.92 de sempre
            const audioBuf = fileBuf || this._getOrBuildStingerBuffer(ctx, kind);
            const baseGain = fileBuf ? 1.0 : 0.92;
            const src = ctx.createBufferSource();
            const gain = ctx.createGain();
            src.buffer = audioBuf;
            const kindLevel = this.sfxLevels[kind] ?? 1.0;
            const peakGain = baseGain * kindLevel * (this.muted ? 0.0 : this.sfxVolume);
            gain.gain.value = peakGain;
            gain.gain.setValueAtTime(peakGain, ctx.currentTime);
            src.connect(gain);
            const masterOut = this._ensureMasterBus() || ctx.destination;
            gain.connect(masterOut);
            const handle = { src, gain, ctx, kind, baseGain };
            this._activeStinger = handle;
            src.onended = () => {
                if (this._activeStinger === handle) {
                    this._activeStinger = null;
                }
                try {
                    src.disconnect();
                    gain.disconnect();
                } catch (_err) {
                    // Nó já desconectado
                }
            };
            if (this.sfxVolume * kindLevel > 0.005) {
                const stingerDuckSec = Math.min(1.5, audioBuf.duration * 0.65);
                this._requestSampleDuck(stingerDuckSec, kindLevel);
                this._postCommand({ type: 'stingerDuck', duration: stingerDuckSec, scale: kindLevel });
            }
            src.start();
        };

        const launch = () => {
            if (kind === 'fail') {
                this._ensureFailDecoded().then((buf) => launchBuffer(buf));
            } else {
                launchBuffer();
            }
        };
        if (ctx.state === 'suspended') {
            ctx.resume().then(launch).catch(() => {});
        } else {
            launch();
        }
    }

    setFrozen(isFrozen) {
        this.frozen = Boolean(isFrozen);
        if (this.frozen && this.engineRunning) {
            this.gear = 1;
            this.shiftTimer = 0.0;
            this.rpm = IDLE_RPM;
            this.load = 0.18;
            this.turbo = this._minTurboForVariant();
            this.jake = 0.0;
        }
        this._syncState();
    }

    setMuted(isMuted) {
        const next = Boolean(isMuted);
        this.muted = next;
        if (this.audioCtx) {
            const bus = this._ensureMasterBus();
            if (bus) {
                const now = this.audioCtx.currentTime;
                bus.gain.cancelScheduledValues(now);
                bus.gain.setValueAtTime(bus.gain.value, now);
                bus.gain.setTargetAtTime(next ? 0.0 : 1.0, now, next ? 0.006 : 0.008);
            }
        }
        if (next) {
            this._stopActiveStinger(0.015);
            if (this.hornActive) {
                this.hornActive = false;
                this._postCommand({ type: 'horn', active: false });
            }
        } else {
            this.resume();
            if (this._hornInputHeld && !this.hornActive) {
                this.hornActive = true;
                this._postCommand({ type: 'horn', active: true });
            }
        }
        this._syncState();
        return this.muted;
    }

    toggleMute() {
        return this.setMuted(!this.muted);
    }

    isMuted() {
        return this.muted;
    }

    update(deltaTime, state) {
        if ((!this.started && !this.audioCtx) || !this.engineRunning) return;

        const dt = Math.max(0.001, Math.min(0.1, deltaTime || 1 / 60));
        const speedMs = state.speedMs || 0;
        const speedKmh = Math.abs(speedMs) * 3.6;
        const throttle = state.throttle || 0;
        const absThrottle = Math.abs(throttle);
        const brake = state.brake || 0;
        const parkingBrakeOn = Boolean(state.parkingBrakeOn);
        const hasTrailer = Boolean(state.hasTrailer);
        const minTurbo = this._minTurboForVariant();
        const turboUpTau = this.variant === 5 ? 0.24 : 0.42;
        const turboDownTau = this.variant === 5 ? 1.15 : 0.85;

        this.sinceLastShift += dt;

        // Com freio estacionário puxado e caminhão parado, acelerar sobe o giro livre até o topo (ponto morto)
        if (parkingBrakeOn && speedKmh < 0.8) {
            this.gear = 1;
            this.shiftTimer = 0.0;
            let desiredRpm = IDLE_RPM;
            let desiredLoad = 0.18;
            let desiredJake = 0.0;

            if (absThrottle > 0.05) {
                desiredRpm = 2100.0;
                desiredLoad = 0.94;
            } else if (this.rpm > 850.0) {
                desiredLoad = 0.05;
                desiredJake = 0.28;
            }

            const rpmTau = desiredRpm > this.rpm ? 0.30 : 0.38;
            this.rpm += (desiredRpm - this.rpm) * (1.0 - Math.exp(-dt / rpmTau));
            this.load += (desiredLoad - this.load) * (1.0 - Math.exp(-dt / 0.08));
            this.jake += (desiredJake - this.jake) * (1.0 - Math.exp(-dt / 0.06));

            const rpmFactor = Math.max(0.0, (this.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM));
            const desiredTurbo = Math.max(minTurbo, Math.min(1.0, minTurbo + rpmFactor * (0.35 + 0.65 * this.load)));
            const turboTau = desiredTurbo > this.turbo ? turboUpTau : turboDownTau;
            this.turbo += (desiredTurbo - this.turbo) * (1.0 - Math.exp(-dt / turboTau));

            this._syncState();
            return;
        }

        const reversing = throttle < -0.05 || speedMs < -0.18;
        if (reversing) {
            this.gear = -1;
            this.shiftTimer = 0.0;
        } else if (this.gear < 1) {
            this.gear = 1;
        }

        let coupledRpm = IDLE_RPM;
        if (this.gear === -1) {
            // Ré super-reduzida: atinge rotação cheia já aos ~5.6 km/h (limite físico da ré = 7.2 km/h),
            // subindo bastante as notas do motor mesmo em manobras lentas de doca
            const revFrac = Math.min(1.08, Math.pow(speedKmh / 5.6, 0.85));
            coupledRpm = IDLE_RPM + revFrac * (SHIFT_RPM - IDLE_RPM);
        } else {
            const topKmh = FORWARD_GEAR_TOP_KMH[this.gear - 1];
            coupledRpm = IDLE_RPM + (speedKmh / topKmh) * (SHIFT_RPM - IDLE_RPM);

            // Troca ascendente só depois de esticar bem a marcha até perto do corte (~2.015 RPM)
            if (
                this.shiftTimer <= 0 &&
                throttle > 0.1 &&
                this.gear < FORWARD_GEAR_TOP_KMH.length &&
                coupledRpm > 2015.0 &&
                this.sinceLastShift > 1.05
            ) {
                this.gear += 1;
                this.shiftTimer = 0.28;
                this.sinceLastShift = 0.0;
                if (!this.muted) {
                    this._postCommand({ type: 'shiftAir', intensity: 0.72 });
                }
                const nextTop = FORWARD_GEAR_TOP_KMH[this.gear - 1];
                coupledRpm = IDLE_RPM + (speedKmh / nextTop) * (SHIFT_RPM - IDLE_RPM);
            } else if (
                this.shiftTimer <= 0 &&
                this.gear > 1 &&
                coupledRpm < 1020.0 &&
                this.sinceLastShift > 0.40
            ) {
                while (this.gear > 1) {
                    const prevTop = FORWARD_GEAR_TOP_KMH[this.gear - 2];
                    const prevRpm = IDLE_RPM + (speedKmh / prevTop) * (SHIFT_RPM - IDLE_RPM);
                    if (prevRpm < 1760.0) {
                        this.gear -= 1;
                        coupledRpm = prevRpm;
                        this.sinceLastShift = 0.0;
                    } else {
                        break;
                    }
                }
            }
        }

        let desiredRpm = Math.min(MAX_RPM, Math.max(IDLE_RPM, coupledRpm));
        let desiredLoad = 0.18;
        let desiredJake = 0.0;

        if (this.shiftTimer > 0) {
            // Corte de injeção na troca de marcha: queda nítida de nota + suspiro da turbina
            this.shiftTimer = Math.max(0.0, this.shiftTimer - dt);
            desiredLoad = 0.04;
            desiredJake = 0.24;
        } else if (absThrottle > 0.05) {
            const biteSpan = this.gear === -1
                ? (hasTrailer ? 640.0 : 540.0)
                : (hasTrailer ? 560.0 : 460.0);
            const clutchBiteRpm = IDLE_RPM + absThrottle * biteSpan;
            desiredRpm = Math.max(desiredRpm, clutchBiteRpm);
            const trailerLoadBonus = hasTrailer ? 0.14 : 0.0;
            const lugBonus = desiredRpm < 1350.0 ? 0.16 : 0.06;
            desiredLoad = Math.min(1.0, 0.42 + 0.46 * absThrottle + trailerLoadBonus + lugBonus);
        } else if (speedKmh > 2.5) {
            desiredLoad = 0.05;
            if (brake > 0.1 && coupledRpm > 920.0) {
                // Freio-motor Jacobs (Jake Brake) estralado nas reduções fortes
                desiredJake = Math.min(0.92, 0.35 + 0.65 * ((coupledRpm - 900.0) / 950.0));
            } else if (coupledRpm > 980.0) {
                // Embalo / corte em escape direto
                desiredJake = 0.26;
            }
        }

        const rpmTau = desiredRpm > this.rpm ? 0.10 : 0.17;
        const loadTau = desiredLoad > this.load ? 0.06 : 0.12;
        this.rpm += (desiredRpm - this.rpm) * (1.0 - Math.exp(-dt / rpmTau));
        this.load += (desiredLoad - this.load) * (1.0 - Math.exp(-dt / loadTau));
        this.jake += (desiredJake - this.jake) * (1.0 - Math.exp(-dt / 0.05));

        const rpmFactor = Math.max(0.0, (this.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM));
        const desiredTurbo = Math.max(
            minTurbo,
            Math.min(1.0, minTurbo + rpmFactor * (0.20 + 0.80 * this.load) + (this.load > 0.75 ? 0.14 : 0.0))
        );
        const turboTau = desiredTurbo > this.turbo ? turboUpTau : turboDownTau;
        this.turbo += (desiredTurbo - this.turbo) * (1.0 - Math.exp(-dt / turboTau));

        this._syncState();
    }
}
