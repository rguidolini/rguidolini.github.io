/**
 * Síntese física procedural em tempo real do motor Caterpillar 3406B (14.6L, 6 cilindros em linha,
 * injeção mecânica, ordem de ignição 1-5-3-6-2-4) turbinado com escapamentos verticais diretos de 8"
 * (Straight-Pipe Monster Stacks) em um Kenworth W900.
 *
 * Modela individualmente os 6 cilindros no ciclo de 720°, assimetria mecânica da bomba injetora e do
 * coletor de escape, modulação por turbulência de vórtices nos dutos, carcaça da turbina, colunas de ar
 * abertas de 8", assobio aerodinâmico do turbocompressor Garrett/Schwitzer nas puxadas e trocas de marcha,
 * freio-motor Jacobs (Jake Brake) em desaceleração e válvula pneumática Westinghouse do freio estacionário.
 *
 * Funciona tanto em contextos HTTPS (AudioWorkletNode) quanto HTTP não-seguros (ScriptProcessorNode),
 * 100% em JavaScript puro sem arquivos binários externos.
 */

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

    // Guia de ondas acústico amortecido das ponteiras verticais abertas de 8" (Monster Stacks)
    const makeWideStackPipe = (delaySec, reflGain, lpfCutoffHz) => {
        const len = Math.max(8, Math.round(delaySec * fs));
        return {
            buf: new Float32Array(len),
            len,
            idx: 0,
            reflGain,
            lp: 0.0,
            lpA: 1.0 - Math.exp(-TWO_PI * lpfCutoffHz * invFs)
        };
    };

    const stepWideStackPipe = (pipe, xIn) => {
        const delayed = pipe.buf[pipe.idx];
        pipe.lp += (delayed - pipe.lp) * pipe.lpA;
        pipe.buf[pipe.idx] = xIn + pipe.reflGain * pipe.lp;
        pipe.idx = (pipe.idx + 1) % pipe.len;
        return 0.68 * xIn + 0.52 * delayed;
    };

    // Garganta da voluta da turbina (4 polos em cascata): preserva o ronco encorpado de 60-900 Hz
    // do Cat 3406B em escape direto e elimina zumbidos artificiais agudos
    const throatLp1L = makeBiquad('lp', 360.0, 1.10);
    const throatLp2L = makeBiquad('lp', 920.0, 0.74);
    const throatLp1R = makeBiquad('lp', 348.0, 1.10);
    const throatLp2R = makeBiquad('lp', 890.0, 0.74);

    // Colunas gêmeas de 8" (~3.0 m) + formantes graves e médios-graves do Cat 3406B Straight Pipe
    const stackPipeL = makeWideStackPipe(0.0114, -0.28, 440.0);
    const stackPipeR = makeWideStackPipe(0.0123, -0.28, 420.0);
    const chestBoomL = makeBiquad('peak', 68.0, 1.10, 6.2);
    const chestBoomR = makeBiquad('peak', 65.0, 1.10, 6.2);
    const catGrowlL = makeBiquad('peak', 198.0, 1.25, 5.8);
    const catGrowlR = makeBiquad('peak', 210.0, 1.25, 5.8);
    const straightBarkL = makeBiquad('peak', 475.0, 1.30, 5.0);
    const straightBarkR = makeBiquad('peak', 500.0, 1.30, 5.0);

    // Sopro turbulento de gases quentes nos tubos de 8"
    const roarLowL = makeBiquad('bp', 150.0, 0.85);
    const roarLowR = makeBiquad('bp', 158.0, 0.85);
    const roarMidL = makeBiquad('bp', 395.0, 0.95);
    const roarMidR = makeBiquad('bp', 375.0, 0.95);
    const roarCrackL = makeBiquad('bp', 960.0, 1.15);
    const roarCrackR = makeBiquad('bp', 1010.0, 1.15);

    // Batida mecânica do bloco de ferro fundido e bomba/bicos injetores mecânicos Cat 3406B
    const clatter1 = makeBiquad('bp', 580.0, 2.0);
    const clatter2 = makeBiquad('bp', 1180.0, 2.4);
    const clatter3 = makeBiquad('bp', 2150.0, 2.8);

    // Turbocompressor Garrett / Schwitzer em escape direto (fluxo pressurizado + assobio fino da turbina)
    const turboJet1 = makeBiquad('bp', 2050.0, 19.0);
    const turboJet2 = makeBiquad('bp', 4100.0, 21.0);
    const turboBoostAir = makeBiquad('bp', 1500.0, 1.05);

    // Descarga pneumática Westinghouse (freio estacionário e seletor Eaton Fuller)
    const airBrakeBp1 = makeBiquad('bp', 1850.0, 1.5);
    const airBrakeBp2 = makeBiquad('bp', 3600.0, 1.8);

    // Ordem de ignição 1-5-3-6-2-4 no ciclo de 720° com assimetria real dos dutos do coletor até o turbo central
    const cylOffsets = [0.000, 0.164, 0.335, 0.498, 0.668, 0.831];
    const cylRunnerGain = [0.76, 1.06, 1.28, 0.84, 0.93, 1.16];
    const cylPanL = [0.64, 0.40, 0.57, 0.36, 0.60, 0.43];
    const cylAmp = new Float32Array(cylRunnerGain);
    const cylPrev = new Float32Array(6);

    const rpmSmooth = 1.0 - Math.exp(-invFs / 0.045);
    const loadSmooth = 1.0 - Math.exp(-invFs / 0.032);
    const turboUpSmooth = 1.0 - Math.exp(-invFs / 0.42);
    const turboDownSmooth = 1.0 - Math.exp(-invFs / 0.85);
    const jakeSmooth = 1.0 - Math.exp(-invFs / 0.025);
    const gainSmooth = 1.0 - Math.exp(-invFs / 0.035);
    const vortexA = 1.0 - Math.exp(-TWO_PI * 125.0 * invFs);
    const turboFmA = 1.0 - Math.exp(-TWO_PI * 140.0 * invFs);
    const airBrakeDecay = Math.exp(-invFs / 0.14);
    const shiftAirDecay = Math.exp(-invFs / 0.05);
    const dcPole = Math.exp(-TWO_PI * 22.0 * invFs);
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

    let targetRpm = 595.0;
    let targetLoad = 0.18;
    let targetTurbo = 0.06;
    let targetJake = 0.0;
    let targetMasterGain = 1.0;

    // Partida autêntica do Cat 3406B (compressão pesada curta -> pega forte -> marcha lenta embaralhada)
    let startupClock = 0.0;
    let startupActive = true;

    let airBrakeEnv = 0.0;
    let shiftAirEnv = 0.0;

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
    };

    const triggerAirBrake = (intensity = 1.0) => {
        const clamped = Math.max(0.2, Math.min(1.3, intensity));
        airBrakeEnv = Math.min(1.3, airBrakeEnv + 0.95 * clamped);
    };

    const triggerShiftAir = (intensity = 1.0) => {
        shiftAirEnv = Math.min(0.9, shiftAirEnv + 0.45 * intensity);
    };

    const triggerStartup = () => {
        startupClock = 0.0;
        startupActive = true;
        curRpm = 215.0;
    };

    const renderBlock = (outL, outR) => {
        const n = outL.length;
        for (let i = 0; i < n; i++) {
            let effRpm = targetRpm;
            let effLoad = targetLoad;
            let effTurbo = targetTurbo;
            let clatterEnable = 1.0;

            if (startupActive) {
                startupClock += invFs;
                if (startupClock < 0.24) {
                    effRpm = 220.0;
                    effLoad = 0.48;
                    effTurbo = 0.03;
                    clatterEnable = startupClock > 0.16 ? (startupClock - 0.16) / 0.08 : 0.0;
                } else if (startupClock < 0.84) {
                    const p = (startupClock - 0.24) / 0.60;
                    const flare = Math.sin(p * Math.PI);
                    effRpm = 595.0 + 430.0 * flare;
                    effLoad = 0.18 + 0.64 * (1.0 - p);
                    effTurbo = 0.06 + 0.26 * flare;
                } else {
                    startupActive = false;
                }
            }

            curRpm += (effRpm - curRpm) * rpmSmooth;
            curLoad += (effLoad - curLoad) * loadSmooth;
            curTurbo += (effTurbo - curTurbo) * (effTurbo > curTurbo ? turboUpSmooth : turboDownSmooth);
            curJake += (targetJake - curJake) * jakeSmooth;
            curMasterGain += (targetMasterGain - curMasterGain) * gainSmooth;

            const rpmNorm = Math.max(0.0, Math.min(1.3, (curRpm - 580.0) / 1350.0));

            // Caça característica do governador mecânico Caterpillar na marcha lenta (~595 RPM)
            lope1 += 1.75 * invFs;
            if (lope1 >= 1.0) lope1 -= 1.0;
            lope2 += 2.95 * invFs;
            if (lope2 >= 1.0) lope2 -= 1.0;

            const idleWeight = Math.max(0.0, 1.0 - rpmNorm * 3.5) * Math.max(0.0, 1.0 - curLoad * 0.8);
            const instRpm = Math.max(
                90.0,
                curRpm + idleWeight * (13.0 * Math.sin(TWO_PI * lope1) + 6.0 * Math.sin(TWO_PI * lope2))
            );

            // Avanço do ciclo completo de 4 tempos (720° = 2 rotações do virabrequim)
            cyclePhase += (instRpm / 120.0) * invFs;
            if (cyclePhase >= 1.0) cyclePhase -= Math.floor(cyclePhase);

            const wnRaw1 = whiteNoise();
            const wnRaw2 = whiteNoise();
            const wn1 = wnRaw1 * noiseFsScale;
            const wn2 = wnRaw2 * noiseFsScale;

            vortexLpL += (wnRaw1 - vortexLpL) * vortexA;
            vortexLpR += (wnRaw2 - vortexLpR) * vortexA;

            let exhL = 0.0;
            let exhR = 0.0;
            let gasGate = 0.0;
            let clatterGate = 0.0;

            const sharp = Math.min(1.0, curLoad * 0.92 + curJake * 1.25);
            const alphaP = 24.0 + 24.0 * sharp;

            for (let k = 0; k < 6; k++) {
                let ph = cyclePhase + cylOffsets[k];
                if (ph >= 1.0) ph -= 1.0;

                if (ph < cylPrev[k]) {
                    cylAmp[k] = cylRunnerGain[k] * (1.0 + whiteNoise() * 0.12);
                }
                cylPrev[k] = ph;

                const amp = cylAmp[k];
                if (ph < 0.50) {
                    const au = alphaP * ph;
                    const eAu = fastExpNeg(au);
                    const slug = (au * (2.0 - au)) * eAu * 0.78;
                    const crackAu = 2.2 * au;
                    const crack = (crackAu * (2.0 - crackAu)) * fastExpNeg(crackAu) * (0.36 + 1.25 * sharp);
                    const waveK = amp * ((0.75 + 0.88 * curLoad + 0.85 * curJake) * slug + crack);

                    const panL = cylPanL[k];
                    exhL += waveK * panL;
                    exhR += waveK * (1.0 - panL);
                    gasGate += amp * au * eAu * 2.718;
                }

                const du = ph - 0.82;
                if (du >= 0.0 && du < 0.06 && clatterEnable > 0.0) {
                    const s = du * (1.0 / 0.06);
                    const win = 0.5 * (1.0 - Math.cos(TWO_PI * s)) * fastExpNeg(s * 3.0);
                    clatterGate += amp * win * clatterEnable;
                }
            }

            // Modulação de turbulência por vórtices no coletor de ferro fundido
            exhL *= (1.0 + 1.15 * vortexLpL);
            exhR *= (1.0 + 1.15 * vortexLpR);

            // Saturação assimétrica dos gases quentes antes das ponteiras diretas
            const drive = 1.25 + 1.75 * sharp;
            const dL = exhL * drive;
            const dR = exhR * drive;
            const satL = fastTanh(dL + 0.28 * dL * Math.abs(dL));
            const satR = fastTanh(dR + 0.28 * dR * Math.abs(dR));

            if ((filterUpdateCounter++ & 31) === 0) {
                const fc1 = 245.0 + 225.0 * rpmNorm + 350.0 * Math.pow(curLoad, 1.2) + 520.0 * curJake;
                const q1 = 1.00 + 0.45 * curLoad + 0.65 * curJake;
                const fc2 = 820.0 + 460.0 * sharp + 280.0 * rpmNorm;
                retuneBiquad(throatLp1L, fc1, q1);
                retuneBiquad(throatLp2L, fc2, 0.74);
                retuneBiquad(throatLp1R, fc1 * 0.96, q1);
                retuneBiquad(throatLp2R, fc2 * 0.97, 0.74);

                const tf = 1880.0 + 1540.0 * curTurbo;
                retuneBiquad(turboJet1, tf, 18.0 + 6.0 * curTurbo);
                retuneBiquad(turboJet2, tf * 2.0, 20.0);
            }

            const volL = stepBiquad(throatLp2L, stepBiquad(throatLp1L, satL));
            const volR = stepBiquad(throatLp2R, stepBiquad(throatLp1R, satR));

            // Rugido de massa de gás turbulento nas duas chaminés cromadas de 8"
            const roarEnv = (0.22 + 0.78 * Math.min(1.8, gasGate)) *
                (0.34 + 0.95 * curLoad + 0.75 * curJake + 0.30 * rpmNorm);
            const gasRoarL = roarEnv * (
                0.55 * stepBiquad(roarLowL, wn1) +
                0.48 * stepBiquad(roarMidL, wn1) +
                (0.18 + 0.38 * sharp) * stepBiquad(roarCrackL, wn1)
            );
            const gasRoarR = roarEnv * (
                0.55 * stepBiquad(roarLowR, wn2) +
                0.48 * stepBiquad(roarMidR, wn2) +
                (0.18 + 0.38 * sharp) * stepBiquad(roarCrackR, wn2)
            );

            const pipeInL = volL * 1.30 + gasRoarL * 0.78;
            const pipeInR = volR * 1.30 + gasRoarR * 0.78;

            const stL = stepBiquad(
                straightBarkL,
                stepBiquad(catGrowlL, stepBiquad(chestBoomL, stepWideStackPipe(stackPipeL, pipeInL)))
            );
            const stR = stepBiquad(
                straightBarkR,
                stepBiquad(catGrowlR, stepBiquad(chestBoomR, stepWideStackPipe(stackPipeR, pipeInR)))
            );

            // Clatter mecânico de injeção direta do Cat 3406B
            const clatGain = (0.52 + 0.32 * curLoad) * Math.max(0.20, 1.0 - 0.55 * rpmNorm);
            const clatExc = clatterGate * wn2 * clatGain;
            const mech =
                0.55 * stepBiquad(clatter1, clatExc) +
                0.40 * stepBiquad(clatter2, clatExc) +
                0.18 * stepBiquad(clatter3, clatExc);

            // Assobio aerodinâmico da turbina Garrett/Schwitzer no escape direto
            turboFmLp += (wnRaw1 - turboFmLp) * turboFmA;
            const tfInst = 1880.0 + 1540.0 * curTurbo + 10.0 * volL + 18.0 * turboFmLp;
            turboPhase += tfInst * invFs;
            if (turboPhase >= 1.0) turboPhase -= 1.0;

            const pulseMod = 0.74 + 0.26 * Math.min(1.4, gasGate);
            const spoolGain = Math.pow(Math.max(0.0, curTurbo), 1.4);
            const sinTurbo = Math.sin(TWO_PI * turboPhase);
            const aeroSeed = wn1 * 0.84 + 0.16 * sinTurbo;
            const turboSig = pulseMod * spoolGain * (
                0.46 * stepBiquad(turboJet1, aeroSeed) +
                0.13 * stepBiquad(turboJet2, wn2) +
                0.34 * stepBiquad(turboBoostAir, wn1) +
                0.0075 * sinTurbo
            );

            // Descarga pneumática do freio estacionário / seletor da caixa
            let pneu = 0.0;
            if (airBrakeEnv > 0.0005 || shiftAirEnv > 0.0005) {
                airBrakeEnv *= airBrakeDecay;
                shiftAirEnv *= shiftAirDecay;
                const env = airBrakeEnv + shiftAirEnv;
                pneu = env * (0.34 * stepBiquad(airBrakeBp1, wn1) + 0.22 * stepBiquad(airBrakeBp2, wn2));
            } else {
                airBrakeEnv = 0.0;
                shiftAirEnv = 0.0;
            }

            const rawL = (stL * 0.37 + stR * 0.10 + mech * 0.80 + turboSig * 0.85 + pneu) * curMasterGain;
            const rawR = (stR * 0.37 + stL * 0.10 + mech * 0.80 + turboSig * 0.85 + pneu) * curMasterGain;

            const hpL = rawL - dcInL + dcPole * dcOutL;
            dcInL = rawL;
            dcOutL = hpL;

            const hpR = rawR - dcInR + dcPole * dcOutR;
            dcInR = rawR;
            dcOutR = hpR;

            postLpL += (hpL - postLpL) * postLpA;
            postLpR += (hpR - postLpR) * postLpA;

            outL[i] = fastTanh(postLpL * 0.92) * 0.88;
            outR[i] = fastTanh(postLpR * 0.92) * 0.88;
        }
    };

    return {
        setTargets,
        triggerAirBrake,
        triggerShiftAir,
        triggerStartup,
        renderBlock
    };
}

// Escalonamento Eaton Fuller calibrado para manobras de pátio e arrancadas na pista (km/h a 1.820 RPM)
const FORWARD_GEAR_TOP_KMH = [6.5, 11.5, 18.0, 26.5, 38.0, 54.0];
const IDLE_RPM = 595.0;
const SHIFT_RPM = 1820.0;
const MAX_RPM = 1980.0;

export class W900EngineSound {
    constructor() {
        this.audioCtx = null;
        this.workletNode = null;
        this.scriptNode = null;
        this.dspCore = null;
        this.muted = false;
        this.frozen = false;
        this.started = false;
        this._initializing = false;
        this._hasPlayedStartup = false;

        this.gear = 1; // 1..6 à frente, -1 em ré
        this.rpm = IDLE_RPM;
        this.load = 0.18;
        this.turbo = 0.06;
        this.jake = 0.0;
        this.shiftTimer = 0.0;
        this.sinceLastShift = 1.0;
    }

    start() {
        if (typeof window === 'undefined') return;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        if (!this.audioCtx) {
            this.audioCtx = new AudioCtx();
            this._setupAudioGraph();
        }
        this.resume();
    }

    resume() {
        if (!this.audioCtx) {
            this.start();
            return;
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().then(() => {
                if (!this._hasPlayedStartup) {
                    this._hasPlayedStartup = true;
                    this._postCommand({ type: 'startup' });
                }
            }).catch(() => {});
        } else if (this.audioCtx.state === 'running' && !this._hasPlayedStartup) {
            this._hasPlayedStartup = true;
            this._postCommand({ type: 'startup' });
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
                                } else if (msg.type === 'airBrake') {
                                    this.core.triggerAirBrake(msg.intensity);
                                } else if (msg.type === 'shiftAir') {
                                    this.core.triggerShiftAir(msg.intensity);
                                } else if (msg.type === 'startup') {
                                    this.core.triggerStartup();
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
                node.connect(ctx.destination);
                this.workletNode = node;
                this.started = true;
                this._initializing = false;
                this._syncState();
                if (ctx.state === 'running' && !this._hasPlayedStartup) {
                    this._hasPlayedStartup = true;
                    this._postCommand({ type: 'startup' });
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
        const scriptNode = ctx.createScriptProcessor(1024, 0, 2);
        scriptNode.onaudioprocess = (audioEvent) => {
            const outL = audioEvent.outputBuffer.getChannelData(0);
            const outR = audioEvent.outputBuffer.numberOfChannels > 1
                ? audioEvent.outputBuffer.getChannelData(1)
                : outL;
            this.dspCore.renderBlock(outL, outR);
        };
        scriptNode.connect(ctx.destination);
        this.scriptNode = scriptNode;
        this.started = true;
        this._initializing = false;
        this._syncState();
        if (ctx.state === 'running' && !this._hasPlayedStartup) {
            this._hasPlayedStartup = true;
            this._postCommand({ type: 'startup' });
        }
    }

    _postCommand(msg) {
        if (this.workletNode) {
            this.workletNode.port.postMessage(msg);
        } else if (this.dspCore) {
            if (msg.type === 'params') {
                this.dspCore.setTargets(msg);
            } else if (msg.type === 'airBrake') {
                this.dspCore.triggerAirBrake(msg.intensity);
            } else if (msg.type === 'shiftAir') {
                this.dspCore.triggerShiftAir(msg.intensity);
            } else if (msg.type === 'startup') {
                this.dspCore.triggerStartup();
            }
        }
    }

    _computeMasterGain() {
        if (this.muted) return 0.0;
        if (this.frozen) return 0.28;
        return 1.0;
    }

    _syncState() {
        this._postCommand({
            type: 'params',
            rpm: this.rpm,
            load: this.load,
            turbo: this.turbo,
            jake: this.jake,
            masterGain: this._computeMasterGain()
        });
    }

    triggerAirBrakeHiss(intensity = 1.0) {
        if (this.muted) return;
        this._postCommand({ type: 'airBrake', intensity });
    }

    setFrozen(isFrozen) {
        this.frozen = Boolean(isFrozen);
        if (this.frozen) {
            this.gear = 1;
            this.shiftTimer = 0.0;
            this.rpm = IDLE_RPM;
            this.load = 0.18;
            this.turbo = 0.06;
            this.jake = 0.0;
        }
        this._syncState();
    }

    toggleMute() {
        this.muted = !this.muted;
        if (!this.muted) {
            this.resume();
        }
        this._syncState();
        return this.muted;
    }

    isMuted() {
        return this.muted;
    }

    update(deltaTime, state) {
        if (!this.started) return;

        const dt = Math.max(0.001, Math.min(0.1, deltaTime || 1 / 60));
        const speedMs = state.speedMs || 0;
        const speedKmh = Math.abs(speedMs) * 3.6;
        const throttle = state.throttle || 0;
        const absThrottle = Math.abs(throttle);
        const brake = state.brake || 0;
        const parkingBrakeOn = Boolean(state.parkingBrakeOn);
        const hasTrailer = Boolean(state.hasTrailer);

        this.sinceLastShift += dt;

        // Com freio estacionário puxado e caminhão parado, acelerar sobe o giro livre (ponto morto)
        if (parkingBrakeOn && speedKmh < 0.8) {
            this.gear = 1;
            this.shiftTimer = 0.0;
            let desiredRpm = IDLE_RPM;
            let desiredLoad = 0.18;
            let desiredJake = 0.0;

            if (absThrottle > 0.05) {
                desiredRpm = 1880.0;
                desiredLoad = 0.92;
            } else if (this.rpm > 850.0) {
                desiredLoad = 0.05;
                desiredJake = 0.28;
            }

            const rpmTau = desiredRpm > this.rpm ? 0.36 : 0.42;
            this.rpm += (desiredRpm - this.rpm) * (1.0 - Math.exp(-dt / rpmTau));
            this.load += (desiredLoad - this.load) * (1.0 - Math.exp(-dt / 0.08));
            this.jake += (desiredJake - this.jake) * (1.0 - Math.exp(-dt / 0.06));

            const rpmFactor = Math.max(0.0, (this.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM));
            const desiredTurbo = Math.max(0.06, Math.min(1.0, 0.06 + rpmFactor * (0.35 + 0.65 * this.load)));
            const turboTau = desiredTurbo > this.turbo ? 0.42 : 0.85;
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
            // Ré reduzida (velocidade máxima física de ré = 7.2 km/h -> rotação forte de trabalho)
            coupledRpm = IDLE_RPM + (speedKmh / 7.4) * (1660.0 - IDLE_RPM);
        } else {
            const topKmh = FORWARD_GEAR_TOP_KMH[this.gear - 1];
            coupledRpm = IDLE_RPM + (speedKmh / topKmh) * (SHIFT_RPM - IDLE_RPM);

            // Troca ascendente estilo caixa seca Eaton Fuller
            if (
                this.shiftTimer <= 0 &&
                throttle > 0.1 &&
                this.gear < FORWARD_GEAR_TOP_KMH.length &&
                coupledRpm > 1750.0 &&
                this.sinceLastShift > 0.60
            ) {
                this.gear += 1;
                this.shiftTimer = 0.24;
                this.sinceLastShift = 0.0;
                this._postCommand({ type: 'shiftAir', intensity: 0.65 });
                const nextTop = FORWARD_GEAR_TOP_KMH[this.gear - 1];
                coupledRpm = IDLE_RPM + (speedKmh / nextTop) * (SHIFT_RPM - IDLE_RPM);
            } else if (
                this.shiftTimer <= 0 &&
                this.gear > 1 &&
                coupledRpm < 940.0 &&
                this.sinceLastShift > 0.32
            ) {
                while (this.gear > 1) {
                    const prevTop = FORWARD_GEAR_TOP_KMH[this.gear - 2];
                    const prevRpm = IDLE_RPM + (speedKmh / prevTop) * (SHIFT_RPM - IDLE_RPM);
                    if (prevRpm < 1580.0) {
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
            // Corte de injeção na troca de marcha: estalo de escape direto + suspiro da turbina
            this.shiftTimer = Math.max(0.0, this.shiftTimer - dt);
            desiredLoad = 0.04;
            desiredJake = 0.24;
        } else if (absThrottle > 0.05) {
            const clutchBiteRpm = IDLE_RPM + absThrottle * (hasTrailer ? 430.0 : 350.0);
            desiredRpm = Math.max(desiredRpm, clutchBiteRpm);
            const trailerLoadBonus = hasTrailer ? 0.14 : 0.0;
            const lugBonus = desiredRpm < 1300.0 ? 0.16 : 0.06;
            desiredLoad = Math.min(1.0, 0.42 + 0.46 * absThrottle + trailerLoadBonus + lugBonus);
        } else if (speedKmh > 2.5) {
            desiredLoad = 0.05;
            if (brake > 0.1 && coupledRpm > 920.0) {
                // Freio-motor Jacobs (Jake Brake) estralado nas reduções fortes
                desiredJake = Math.min(0.92, 0.35 + 0.65 * ((coupledRpm - 900.0) / 850.0));
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
            0.06,
            Math.min(1.0, 0.06 + rpmFactor * (0.20 + 0.80 * this.load) + (this.load > 0.75 ? 0.14 : 0.0))
        );
        const turboTau = desiredTurbo > this.turbo ? 0.42 : 0.85;
        this.turbo += (desiredTurbo - this.turbo) * (1.0 - Math.exp(-dt / turboTau));

        this._syncState();
    }
}
