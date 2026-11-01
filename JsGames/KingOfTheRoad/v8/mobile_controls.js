/**
 * Detecção automática Mobile / Desktop e controles multi-toque para celular e tablet (modo horizontal / landscape):
 *  - Direção deslizante (◄ / ►) no canto inferior esquerdo
 *  - Barra rápida inferior central: Botão circular Start/Stop, Botão circular Freio Estacionário (P), Engate da Carreta, Câmera de Vídeo, Buzina a Ar, Faróis, Som, Ajuda (?) e Tela Cheia
 *  - Pedais de Freio/Ré (▼) e Acelerador (▲) no canto inferior direito
 *  - Gestos multi-toque independentes no canvas 3D: 1 dedo gira a câmera orbital, 2 dedos fazem zoom de pinça
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function createEngineStartStopSvg() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'mob-engine-svg');
    svg.setAttribute('aria-hidden', 'true');

    const defs = document.createElementNS(SVG_NS, 'defs');

    const bezelGrad = document.createElementNS(SVG_NS, 'linearGradient');
    bezelGrad.setAttribute('id', 'kotr-eng-bezel');
    bezelGrad.setAttribute('x1', '12%');
    bezelGrad.setAttribute('y1', '8%');
    bezelGrad.setAttribute('x2', '88%');
    bezelGrad.setAttribute('y2', '92%');
    [
        ['0%', '#f3f4f6'],
        ['26%', '#9ca3af'],
        ['50%', '#ffffff'],
        ['76%', '#6b7280'],
        ['100%', '#d1d5db']
    ].forEach(([offset, color]) => {
        const stop = document.createElementNS(SVG_NS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        bezelGrad.appendChild(stop);
    });

    const capGrad = document.createElementNS(SVG_NS, 'radialGradient');
    capGrad.setAttribute('id', 'kotr-eng-cap');
    capGrad.setAttribute('cx', '44%');
    capGrad.setAttribute('cy', '30%');
    capGrad.setAttribute('r', '66%');
    [
        ['0%', '#2a2d32'],
        ['65%', '#17191d'],
        ['100%', '#0e1013']
    ].forEach(([offset, color]) => {
        const stop = document.createElementNS(SVG_NS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        capGrad.appendChild(stop);
    });

    defs.appendChild(bezelGrad);
    defs.appendChild(capGrad);
    svg.appendChild(defs);

    const outerBezel = document.createElementNS(SVG_NS, 'circle');
    outerBezel.setAttribute('cx', '50');
    outerBezel.setAttribute('cy', '50');
    outerBezel.setAttribute('r', '48.5');
    outerBezel.setAttribute('fill', 'url(#kotr-eng-bezel)');
    svg.appendChild(outerBezel);

    const innerGroove = document.createElementNS(SVG_NS, 'circle');
    innerGroove.setAttribute('cx', '50');
    innerGroove.setAttribute('cy', '50');
    innerGroove.setAttribute('r', '42.4');
    innerGroove.setAttribute('fill', '#0b0d10');
    svg.appendChild(innerGroove);

    const faceCap = document.createElementNS(SVG_NS, 'circle');
    faceCap.setAttribute('cx', '50');
    faceCap.setAttribute('cy', '50');
    faceCap.setAttribute('r', '40.4');
    faceCap.setAttribute('fill', 'url(#kotr-eng-cap)');
    svg.appendChild(faceCap);

    // 3 LEDs horizontais superiores (vermelhos acesos quando motor OFF; verdes acesos quando motor ON)
    [33, 50, 67].forEach((cx) => {
        const glow = document.createElementNS(SVG_NS, 'circle');
        glow.setAttribute('cx', String(cx));
        glow.setAttribute('cy', '27.5');
        glow.setAttribute('r', '7.2');
        glow.setAttribute('class', 'mob-eng-led-glow');
        svg.appendChild(glow);

        const led = document.createElementNS(SVG_NS, 'circle');
        led.setAttribute('cx', String(cx));
        led.setAttribute('cy', '27.5');
        led.setAttribute('r', '5.6');
        led.setAttribute('class', 'mob-eng-led');
        svg.appendChild(led);
    });

    const addLabel = (txt, y, fontSize, fontWeight) => {
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('x', '50');
        t.setAttribute('y', String(y));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('fill', '#ffffff');
        t.setAttribute('font-family', 'Inter, Arial, sans-serif');
        t.setAttribute('font-size', String(fontSize));
        t.setAttribute('font-weight', String(fontWeight));
        t.setAttribute('letter-spacing', '0.4');
        t.textContent = txt;
        svg.appendChild(t);
    };

    addLabel('START', 56.5, 17.5, 800);
    addLabel('STOP', 75.5, 17.5, 800);

    return svg;
}

function createParkingBrakeSvg() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'mob-park-svg');
    svg.setAttribute('aria-hidden', 'true');

    const defs = document.createElementNS(SVG_NS, 'defs');

    const bezelGrad = document.createElementNS(SVG_NS, 'linearGradient');
    bezelGrad.setAttribute('id', 'kotr-park-bezel');
    bezelGrad.setAttribute('x1', '12%');
    bezelGrad.setAttribute('y1', '8%');
    bezelGrad.setAttribute('x2', '88%');
    bezelGrad.setAttribute('y2', '92%');
    [
        ['0%', '#f3f4f6'],
        ['26%', '#9ca3af'],
        ['50%', '#ffffff'],
        ['76%', '#6b7280'],
        ['100%', '#d1d5db']
    ].forEach(([offset, color]) => {
        const stop = document.createElementNS(SVG_NS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        bezelGrad.appendChild(stop);
    });

    const capGrad = document.createElementNS(SVG_NS, 'radialGradient');
    capGrad.setAttribute('id', 'kotr-park-cap');
    capGrad.setAttribute('cx', '46%');
    capGrad.setAttribute('cy', '34%');
    capGrad.setAttribute('r', '66%');
    [
        ['0%', '#1c1f24'],
        ['65%', '#0f1115'],
        ['100%', '#07080a']
    ].forEach(([offset, color]) => {
        const stop = document.createElementNS(SVG_NS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        capGrad.appendChild(stop);
    });

    const haloGrad = document.createElementNS(SVG_NS, 'radialGradient');
    haloGrad.setAttribute('id', 'kotr-park-halo');
    haloGrad.setAttribute('cx', '50%');
    haloGrad.setAttribute('cy', '50%');
    haloGrad.setAttribute('r', '50%');
    [
        ['0%', 'rgba(255, 34, 34, 0.55)'],
        ['62%', 'rgba(220, 20, 20, 0.22)'],
        ['100%', 'rgba(220, 20, 20, 0)']
    ].forEach(([offset, color]) => {
        const stop = document.createElementNS(SVG_NS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        haloGrad.appendChild(stop);
    });

    defs.appendChild(bezelGrad);
    defs.appendChild(capGrad);
    defs.appendChild(haloGrad);
    svg.appendChild(defs);

    const outerBezel = document.createElementNS(SVG_NS, 'circle');
    outerBezel.setAttribute('cx', '50');
    outerBezel.setAttribute('cy', '50');
    outerBezel.setAttribute('r', '48.5');
    outerBezel.setAttribute('fill', 'url(#kotr-park-bezel)');
    svg.appendChild(outerBezel);

    const innerGroove = document.createElementNS(SVG_NS, 'circle');
    innerGroove.setAttribute('cx', '50');
    innerGroove.setAttribute('cy', '50');
    innerGroove.setAttribute('r', '42.4');
    innerGroove.setAttribute('fill', '#050608');
    svg.appendChild(innerGroove);

    const faceCap = document.createElementNS(SVG_NS, 'circle');
    faceCap.setAttribute('cx', '50');
    faceCap.setAttribute('cy', '50');
    faceCap.setAttribute('r', '40.4');
    faceCap.setAttribute('fill', 'url(#kotr-park-cap)');
    svg.appendChild(faceCap);

    const halo = document.createElementNS(SVG_NS, 'circle');
    halo.setAttribute('cx', '50');
    halo.setAttribute('cy', '50');
    halo.setAttribute('r', '36');
    halo.setAttribute('fill', 'url(#kotr-park-halo)');
    halo.setAttribute('class', 'mob-park-glow');
    svg.appendChild(halo);

    // Símbolo automotivo ISO (P): arcos laterais das sapatas + anel central + letra P
    const leftShoe = document.createElementNS(SVG_NS, 'path');
    leftShoe.setAttribute('d', 'M 26.87 30.59 A 30.2 30.2 0 0 0 26.87 69.41');
    leftShoe.setAttribute('fill', 'none');
    leftShoe.setAttribute('stroke-width', '6.4');
    leftShoe.setAttribute('stroke-linecap', 'butt');
    leftShoe.setAttribute('class', 'mob-park-stroke');
    svg.appendChild(leftShoe);

    const rightShoe = document.createElementNS(SVG_NS, 'path');
    rightShoe.setAttribute('d', 'M 73.13 30.59 A 30.2 30.2 0 0 1 73.13 69.41');
    rightShoe.setAttribute('fill', 'none');
    rightShoe.setAttribute('stroke-width', '6.4');
    rightShoe.setAttribute('stroke-linecap', 'butt');
    rightShoe.setAttribute('class', 'mob-park-stroke');
    svg.appendChild(rightShoe);

    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('cx', '50');
    ring.setAttribute('cy', '50');
    ring.setAttribute('r', '20.5');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke-width', '6.0');
    ring.setAttribute('class', 'mob-park-stroke');
    svg.appendChild(ring);

    const letterP = document.createElementNS(SVG_NS, 'path');
    letterP.setAttribute(
        'd',
        'M 42.2 36.8 H 52.4 C 57.5 36.8 60.8 39.8 60.8 44.6 C 60.8 49.4 57.5 52.5 52.4 52.5 H 47.6 V 63.2 H 42.2 Z ' +
        'M 47.6 41.4 V 47.9 H 51.9 C 54.1 47.9 55.4 46.7 55.4 44.6 C 55.4 42.6 54.1 41.4 51.9 41.4 Z'
    );
    letterP.setAttribute('fill-rule', 'evenodd');
    letterP.setAttribute('class', 'mob-park-fill');
    svg.appendChild(letterP);

    return svg;
}

function createTrailerHitchSvg() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'mob-hitch-svg');
    svg.setAttribute('aria-hidden', 'true');

    const defs = document.createElementNS(SVG_NS, 'defs');

    const bezelGrad = document.createElementNS(SVG_NS, 'linearGradient');
    bezelGrad.setAttribute('id', 'kotr-hitch-bezel');
    bezelGrad.setAttribute('x1', '12%');
    bezelGrad.setAttribute('y1', '8%');
    bezelGrad.setAttribute('x2', '88%');
    bezelGrad.setAttribute('y2', '92%');
    [
        ['0%', '#f3f4f6'],
        ['26%', '#9ca3af'],
        ['50%', '#ffffff'],
        ['76%', '#6b7280'],
        ['100%', '#d1d5db']
    ].forEach(([offset, color]) => {
        const stop = document.createElementNS(SVG_NS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        bezelGrad.appendChild(stop);
    });

    const capOffGrad = document.createElementNS(SVG_NS, 'radialGradient');
    capOffGrad.setAttribute('id', 'kotr-hitch-cap-off');
    capOffGrad.setAttribute('cx', '44%');
    capOffGrad.setAttribute('cy', '32%');
    capOffGrad.setAttribute('r', '68%');
    [
        ['0%', '#363b44'],
        ['62%', '#23272e'],
        ['100%', '#15181d']
    ].forEach(([offset, color]) => {
        const stop = document.createElementNS(SVG_NS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        capOffGrad.appendChild(stop);
    });

    const capOnGrad = document.createElementNS(SVG_NS, 'radialGradient');
    capOnGrad.setAttribute('id', 'kotr-hitch-cap-on');
    capOnGrad.setAttribute('cx', '50%');
    capOnGrad.setAttribute('cy', '49%');
    capOnGrad.setAttribute('r', '54%');
    [
        ['0%', '#2d9e4e'],
        ['44%', '#1f5c33'],
        ['76%', '#212929'],
        ['100%', '#1a1f23']
    ].forEach(([offset, color]) => {
        const stop = document.createElementNS(SVG_NS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        capOnGrad.appendChild(stop);
    });

    defs.appendChild(bezelGrad);
    defs.appendChild(capOffGrad);
    defs.appendChild(capOnGrad);
    svg.appendChild(defs);

    const outerBezel = document.createElementNS(SVG_NS, 'circle');
    outerBezel.setAttribute('cx', '50');
    outerBezel.setAttribute('cy', '50');
    outerBezel.setAttribute('r', '48.5');
    outerBezel.setAttribute('fill', 'url(#kotr-hitch-bezel)');
    svg.appendChild(outerBezel);

    const innerGroove = document.createElementNS(SVG_NS, 'circle');
    innerGroove.setAttribute('cx', '50');
    innerGroove.setAttribute('cy', '50');
    innerGroove.setAttribute('r', '42.4');
    innerGroove.setAttribute('fill', '#07090c');
    svg.appendChild(innerGroove);

    const faceOff = document.createElementNS(SVG_NS, 'circle');
    faceOff.setAttribute('cx', '50');
    faceOff.setAttribute('cy', '50');
    faceOff.setAttribute('r', '40.4');
    faceOff.setAttribute('fill', 'url(#kotr-hitch-cap-off)');
    faceOff.setAttribute('stroke', '#4a505b');
    faceOff.setAttribute('stroke-width', '1.0');
    svg.appendChild(faceOff);

    const faceOn = document.createElementNS(SVG_NS, 'circle');
    faceOn.setAttribute('cx', '50');
    faceOn.setAttribute('cy', '50');
    faceOn.setAttribute('r', '40.4');
    faceOn.setAttribute('fill', 'url(#kotr-hitch-cap-on)');
    faceOn.setAttribute('class', 'mob-hitch-cap-on');
    svg.appendChild(faceOn);

    const ringOn = document.createElementNS(SVG_NS, 'circle');
    ringOn.setAttribute('cx', '50');
    ringOn.setAttribute('cy', '50');
    ringOn.setAttribute('r', '39.8');
    ringOn.setAttribute('fill', 'none');
    ringOn.setAttribute('stroke', '#28f25e');
    ringOn.setAttribute('stroke-width', '2.5');
    ringOn.setAttribute('class', 'mob-hitch-ring-on');
    svg.appendChild(ringOn);

    // Cavalo mecânico perfilado voltado para a esquerda (com recorte da janela e arcos de roda)
    const tractor = document.createElementNS(SVG_NS, 'path');
    tractor.setAttribute(
        'd',
        'M 16.0 57.2 V 49.0 L 17.7 40.8 Q 22.4 38.6 28.4 37.6 V 53.0 H 42.6 L 44.2 55.2 V 57.2 ' +
        'H 41.8 A 4.2 4.2 0 0 0 33.4 57.2 H 25.8 A 4.2 4.2 0 0 0 17.4 57.2 Z ' +
        'M 18.4 42.4 L 23.6 41.9 V 47.4 H 17.4 Z'
    );
    tractor.setAttribute('fill-rule', 'evenodd');
    tractor.setAttribute('class', 'mob-hitch-fill');
    svg.appendChild(tractor);

    // Semirreboque baú à direita + longarina inferior com recortes para 1 roda dianteira + 2 rodas traseiras
    const trailerBox = document.createElementNS(SVG_NS, 'rect');
    trailerBox.setAttribute('x', '46.8');
    trailerBox.setAttribute('y', '36.8');
    trailerBox.setAttribute('width', '35.2');
    trailerBox.setAttribute('height', '16.6');
    trailerBox.setAttribute('rx', '1.3');
    trailerBox.setAttribute('class', 'mob-hitch-fill');
    svg.appendChild(trailerBox);

    const trailerSkirt = document.createElementNS(SVG_NS, 'path');
    trailerSkirt.setAttribute(
        'd',
        'M 47.4 54.6 H 81.4 V 57.2 H 80.4 A 3.9 3.9 0 0 0 72.6 57.2 ' +
        'H 71.6 A 3.9 3.9 0 0 0 63.8 57.2 H 56.7 A 3.9 3.9 0 0 0 48.9 57.2 H 47.4 Z'
    );
    trailerSkirt.setAttribute('class', 'mob-hitch-fill');
    svg.appendChild(trailerSkirt);

    // Rodas do cavalo (21.6, 37.6) e da carreta (52.8 + tandem 67.7, 76.5)
    [21.6, 37.6, 52.8, 67.7, 76.5].forEach((cx) => {
        const tire = document.createElementNS(SVG_NS, 'circle');
        tire.setAttribute('cx', String(cx));
        tire.setAttribute('cy', '57.6');
        tire.setAttribute('r', '3.05');
        tire.setAttribute('fill', 'none');
        tire.setAttribute('stroke-width', '1.5');
        tire.setAttribute('class', 'mob-hitch-stroke');
        svg.appendChild(tire);

        const hub = document.createElementNS(SVG_NS, 'circle');
        hub.setAttribute('cx', String(cx));
        hub.setAttribute('cy', '57.6');
        hub.setAttribute('r', '0.95');
        hub.setAttribute('class', 'mob-hitch-fill');
        svg.appendChild(hub);
    });

    // Seta simples (→) no estado desengatado
    const arrowOff = document.createElementNS(SVG_NS, 'path');
    arrowOff.setAttribute(
        'd',
        'M 33.4 43.5 H 39.4 V 41.1 L 44.1 45.2 L 39.4 49.3 V 46.9 H 33.4 Z'
    );
    arrowOff.setAttribute('class', 'mob-hitch-fill mob-hitch-arrow-off');
    svg.appendChild(arrowOff);

    // Setas duplas opostas (← →) no estado engatado
    const arrowOn = document.createElementNS(SVG_NS, 'path');
    arrowOn.setAttribute(
        'd',
        'M 36.9 43.7 H 33.6 V 41.5 L 29.7 45.2 L 33.6 48.9 V 46.7 H 36.9 Z ' +
        'M 38.3 43.7 H 41.6 V 41.5 L 45.5 45.2 L 41.6 48.9 V 46.7 H 38.3 Z'
    );
    arrowOn.setAttribute('class', 'mob-hitch-fill mob-hitch-arrow-on');
    svg.appendChild(arrowOn);

    return svg;
}

function createAirHornSvg() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 32 22');
    svg.setAttribute('class', 'mob-horn-svg');
    svg.setAttribute('aria-hidden', 'true');

    const mouthpiece = document.createElementNS(SVG_NS, 'rect');
    mouthpiece.setAttribute('x', '1.2');
    mouthpiece.setAttribute('y', '7.5');
    mouthpiece.setAttribute('width', '2.3');
    mouthpiece.setAttribute('height', '7.0');
    mouthpiece.setAttribute('rx', '1.15');
    mouthpiece.setAttribute('fill', 'currentColor');
    svg.appendChild(mouthpiece);

    const trumpet = document.createElementNS(SVG_NS, 'path');
    trumpet.setAttribute(
        'd',
        'M 4.7 8.7 H 12.2 C 15.8 8.7 18.7 6.8 20.9 3.3 C 21.5 2.4 22.8 2.8 22.8 3.9 ' +
        'V 18.1 C 22.8 19.2 21.5 19.6 20.9 18.7 C 18.7 15.2 15.8 13.3 12.2 13.3 ' +
        'H 4.7 C 4.2 13.3 4.0 13.0 4.0 12.5 V 9.5 C 4.0 9.0 4.2 8.7 4.7 8.7 Z'
    );
    trumpet.setAttribute('fill', 'currentColor');
    svg.appendChild(trumpet);

    const handle = document.createElementNS(SVG_NS, 'path');
    handle.setAttribute(
        'd',
        'M 7.6 13.0 V 15.5 C 7.6 16.3 8.2 16.9 9.0 16.9 H 13.8 C 14.6 16.9 15.2 16.3 15.2 15.5 V 13.1'
    );
    handle.setAttribute('fill', 'none');
    handle.setAttribute('stroke', 'currentColor');
    handle.setAttribute('stroke-width', '1.85');
    handle.setAttribute('stroke-linecap', 'round');
    handle.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(handle);

    [
        ['25.2', '7.1', '29.9', '5.0'],
        ['25.6', '11.0', '30.6', '11.0'],
        ['25.2', '14.9', '29.9', '17.0']
    ].forEach(([x1, y1, x2, y2]) => {
        const ray = document.createElementNS(SVG_NS, 'line');
        ray.setAttribute('x1', x1);
        ray.setAttribute('y1', y1);
        ray.setAttribute('x2', x2);
        ray.setAttribute('y2', y2);
        ray.setAttribute('stroke', 'currentColor');
        ray.setAttribute('stroke-width', '2.0');
        ray.setAttribute('stroke-linecap', 'round');
        svg.appendChild(ray);
    });

    return svg;
}

function createVideoCameraSvg() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'mob-cam-svg');
    svg.setAttribute('aria-hidden', 'true');

    const body = document.createElementNS(SVG_NS, 'rect');
    body.setAttribute('x', '2');
    body.setAttribute('y', '5.5');
    body.setAttribute('width', '13.5');
    body.setAttribute('height', '13');
    body.setAttribute('rx', '2.6');
    body.setAttribute('fill', 'currentColor');

    const cone = document.createElementNS(SVG_NS, 'path');
    cone.setAttribute(
        'd',
        'M16.8 10.1L22.1 6.8C22.65 6.46 23.3 6.85 23.3 7.5V16.5C23.3 17.15 22.65 17.54 22.1 17.2L16.8 13.9V10.1Z'
    );
    cone.setAttribute('fill', 'currentColor');

    svg.appendChild(body);
    svg.appendChild(cone);
    return svg;
}

export function detectMobileDevice() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const coarseNoHover = Boolean(
        window.matchMedia &&
        window.matchMedia('(pointer: coarse)').matches &&
        window.matchMedia('(hover: none)').matches
    );
    return Boolean(uaMobile || iPadOS || coarseNoHover);
}

export function tryLockLandscape() {
    if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.lock === 'function') {
        screen.orientation.lock('landscape').catch(() => {});
    }
}

export function enterFullscreenLandscape() {
    if (typeof document === 'undefined') return;
    const doc = document;
    const el = document.documentElement;
    if (!el) return;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        if (el.requestFullscreen) {
            el.requestFullscreen().then(() => tryLockLandscape()).catch(() => {});
        } else if (el.webkitRequestFullscreen) {
            el.webkitRequestFullscreen();
            tryLockLandscape();
        }
    } else {
        tryLockLandscape();
    }
}

export function adaptStartScreenForDevice(isMobile) {
    if (typeof document === 'undefined') return;
    const desktopControls = document.getElementById('desktop-controls-guide');
    const mobileControls = document.getElementById('mobile-controls-guide');
    if (isMobile) {
        document.body.classList.add('is-mobile');
        if (desktopControls) desktopControls.style.display = 'none';
        if (mobileControls) mobileControls.style.display = 'grid';
    } else {
        document.body.classList.remove('is-mobile');
        if (desktopControls) desktopControls.style.display = '';
        if (mobileControls) mobileControls.style.display = 'none';
    }
}

export class MobileControls {
    constructor({ keyboardController, camera, truck, canvas, onHitch }) {
        this.keyboardController = keyboardController;
        this.camera = camera;
        this.truck = truck;
        this.canvas = canvas;
        this.onHitch = onHitch;

        this.isMobile = detectMobileDevice();
        this.root = null;
        this.camDrawerOpen = false;

        this.steerTouches = new Map();
        this.pedalTouches = new Map();
        this.canvasTouches = new Map();
        this._padSyncCallbacks = [];
        this.hornMouseDown = false;
        this._hornActive = false;

        this.uiRefs = {};
        this._lastEngineState = null;
        this._lastParkingState = null;
        this._lastTrailerState = null;
        this._lastLightingState = null;
        this._lastMutedState = null;
        this._lastCameraId = null;
        this._lastHelpOpen = null;

        this._buildDOM();
        this._bindCanvasGestures();
        this._bindLifecycleSafety();
        this.setMobileActive(this.isMobile);
    }

    setMobileActive(active) {
        this.isMobile = Boolean(active);
        if (typeof document !== 'undefined') {
            document.body.classList.toggle('is-mobile', this.isMobile);
        }
        if (this.root) {
            this.root.style.display = this.isMobile ? 'block' : 'none';
        }
        const desktopHelpList = document.getElementById('desktop-help-list');
        const mobileHelpList = document.getElementById('mobile-help-list');
        if (desktopHelpList && mobileHelpList) {
            desktopHelpList.style.display = this.isMobile ? 'none' : 'block';
            mobileHelpList.style.display = this.isMobile ? 'block' : 'none';
        }
    }

    _unlockAudio() {
        if (this.truck && this.truck.engineSound) {
            this.truck.engineSound.resume();
        }
    }

    _setHornActive(active) {
        const next = Boolean(active);
        if (next === this._hornActive) return;
        this._hornActive = next;
        if (this.truck && typeof this.truck.setHorn === 'function') {
            this.truck.setHorn(next);
        }
        if (this.uiRefs.btnHorn) {
            this.uiRefs.btnHorn.classList.toggle('is-warn-active', next);
        }
    }

    _buildDOM() {
        if (typeof document === 'undefined') return;
        const prev = document.getElementById('mobile-controls-root');
        if (prev) prev.remove();

        const root = document.createElement('div');
        root.id = 'mobile-controls-root';
        root.style.display = 'none';

        // 1. Barra de ações rápidas (Freio de Mão, Carreta, Câmeras, Faróis, Som, Tela Cheia)
        const actionWrap = document.createElement('div');
        actionWrap.id = 'mobile-action-wrap';

        const actionBar = document.createElement('div');
        actionBar.id = 'mobile-action-bar';

        const makeActionBtn = (label, title, onTap) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mob-action-btn';
            btn.textContent = label;
            btn.setAttribute('aria-label', title);

            let lastTouchTs = 0;
            const handler = (e) => {
                if (e.type === 'touchstart') {
                    lastTouchTs = Date.now();
                } else if (e.type === 'click' && Date.now() - lastTouchTs < 500) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                this._unlockAudio();
                onTap();
                this.syncHUD();
            };
            btn.addEventListener('touchstart', handler, { passive: false });
            btn.addEventListener('click', handler);
            return btn;
        };

        const btnEngine = makeActionBtn('', 'Start or stop engine', () => {
            this.truck.toggleEngine();
        });
        btnEngine.classList.add('mob-engine-start-btn');
        btnEngine.replaceChildren(createEngineStartStopSvg());

        const btnPark = makeActionBtn('', 'Parking brake', () => {
            this.keyboardController.switchParkingBreak();
        });
        btnPark.classList.add('mob-park-brake-btn');
        btnPark.replaceChildren(createParkingBrakeSvg());

        const btnHitch = makeActionBtn('', 'Hitch or unhitch trailer', () => {
            if (typeof this.onHitch === 'function') this.onHitch();
        });
        btnHitch.classList.add('mob-hitch-btn');
        btnHitch.replaceChildren(createTrailerHitchSvg());
        const btnCam = makeActionBtn('', 'Switch camera', () => {
            this.camDrawerOpen = !this.camDrawerOpen;
            this.uiRefs.camDrawer.style.display = this.camDrawerOpen ? 'flex' : 'none';
        });
        btnCam.classList.add('mob-cam-icon-btn');
        btnCam.replaceChildren(createVideoCameraSvg());

        // Botão momentâneo de buzina (segurar mantém a buzina Columbia acionada; multi-toque isolado)
        const btnHorn = document.createElement('button');
        btnHorn.type = 'button';
        btnHorn.className = 'mob-action-btn mob-horn-icon-btn';
        btnHorn.replaceChildren(createAirHornSvg());
        btnHorn.setAttribute('aria-label', 'Horn');

        let lastHornTouchTs = 0;
        const syncHornFromTouches = (touches) => {
            let hasHornTouch = false;
            if (touches) {
                for (let i = 0; i < touches.length; i++) {
                    const t = touches[i];
                    if (t.target && btnHorn.contains(t.target)) {
                        hasHornTouch = true;
                        break;
                    }
                }
            }
            this._setHornActive(hasHornTouch || this.hornMouseDown);
        };
        this._padSyncCallbacks.push(syncHornFromTouches);

        const onHornTouch = (e) => {
            lastHornTouchTs = Date.now();
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            if (e.type === 'touchstart') {
                this._unlockAudio();
            }
            syncHornFromTouches(e.touches);
        };
        btnHorn.addEventListener('touchstart', onHornTouch, { passive: false });
        btnHorn.addEventListener('touchmove', onHornTouch, { passive: false });
        btnHorn.addEventListener('touchend', onHornTouch, { passive: false });
        btnHorn.addEventListener('touchcancel', onHornTouch, { passive: false });

        btnHorn.addEventListener('mousedown', (e) => {
            if (Date.now() - lastHornTouchTs < 500) return;
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            this._unlockAudio();
            this.hornMouseDown = true;
            this._setHornActive(true);
        });
        const stopHornMouse = () => {
            if (!this.hornMouseDown) return;
            this.hornMouseDown = false;
            this._setHornActive(false);
        };
        btnHorn.addEventListener('mouseup', stopHornMouse);
        btnHorn.addEventListener('mouseleave', stopHornMouse);
        if (typeof window !== 'undefined') {
            window.addEventListener('mouseup', stopHornMouse);
        }

        const btnLights = makeActionBtn('💡', 'Toggle lights', () => {
            this.truck.toggleHeadlights();
        });
        const btnSound = makeActionBtn('🔊', 'Mute or unmute sound', () => {
            this.truck.toggleEngineSound();
        });
        const btnHelp = makeActionBtn('?', 'Show controls helper', () => {
            const infoEl = document.getElementById('game-controls-info');
            if (infoEl) {
                infoEl.style.display = infoEl.style.display === 'block' ? 'none' : 'block';
            }
        });

        actionBar.appendChild(btnEngine);
        actionBar.appendChild(btnPark);
        actionBar.appendChild(btnHitch);
        actionBar.appendChild(btnCam);
        actionBar.appendChild(btnHorn);
        actionBar.appendChild(btnLights);
        actionBar.appendChild(btnSound);
        actionBar.appendChild(btnHelp);

        const canFullscreen = Boolean(
            document.documentElement &&
            (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)
        );
        if (canFullscreen) {
            const btnFs = makeActionBtn('⛶', 'Fullscreen', () => {
                const doc = document;
                if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
                    enterFullscreenLandscape();
                } else {
                    if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
                    else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
                }
            });
            actionBar.appendChild(btnFs);
        }

        // Gaveta horizontal compacta de seleção de câmeras
        const camDrawer = document.createElement('div');
        camDrawer.id = 'mobile-cam-drawer';
        camDrawer.style.display = 'none';

        const camOptions = [
            { id: 'orbital', label: 'Free' },
            { id: 'top', label: 'Top' },
            { id: 'rear', label: 'Rear' },
            { id: 'hood', label: 'Hood' },
            { id: 'roof', label: 'Roof' },
            { id: 'left', label: 'Left' },
            { id: 'right', label: 'Right' }
        ];
        this.uiRefs.camPills = {};

        camOptions.forEach((opt) => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'mob-cam-pill';
            pill.textContent = opt.label;
            let lastTouchTs = 0;
            const onSelect = (e) => {
                if (e.type === 'touchstart') {
                    lastTouchTs = Date.now();
                } else if (e.type === 'click' && Date.now() - lastTouchTs < 500) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                this._unlockAudio();
                this.camera.SwitchTo(opt.id);
                this.camDrawerOpen = false;
                camDrawer.style.display = 'none';
                this.syncHUD();
            };
            pill.addEventListener('touchstart', onSelect, { passive: false });
            pill.addEventListener('click', onSelect);
            this.uiRefs.camPills[opt.id] = pill;
            camDrawer.appendChild(pill);
        });

        actionWrap.appendChild(actionBar);
        actionWrap.appendChild(camDrawer);
        root.appendChild(actionWrap);

        // 2. Direção deslizante (Esquerda / Direita) no canto inferior esquerdo
        const steerPad = document.createElement('div');
        steerPad.id = 'mobile-steer-pad';

        const btnLeft = document.createElement('div');
        btnLeft.className = 'mob-drive-btn mob-steer-btn mob-steer-left-btn';
        btnLeft.textContent = '◄';

        const btnRight = document.createElement('div');
        btnRight.className = 'mob-drive-btn mob-steer-btn mob-steer-right-btn';
        btnRight.textContent = '►';

        steerPad.appendChild(btnLeft);
        steerPad.appendChild(btnRight);
        root.appendChild(steerPad);

        // 3. Pedais (Freio/Ré à esquerda + Acelerador à direita) no canto inferior direito
        const pedalPad = document.createElement('div');
        pedalPad.id = 'mobile-pedal-pad';

        const btnBrakeRev = document.createElement('div');
        btnBrakeRev.className = 'mob-drive-btn mob-brake-btn';
        const brakeIcon = document.createElement('span');
        brakeIcon.className = 'mob-pedal-arrow';
        brakeIcon.textContent = '▼';
        const brakeSub = document.createElement('span');
        brakeSub.className = 'mob-pedal-label';
        brakeSub.textContent = 'REV';
        btnBrakeRev.appendChild(brakeIcon);
        btnBrakeRev.appendChild(brakeSub);

        const btnGas = document.createElement('div');
        btnGas.className = 'mob-drive-btn mob-gas-btn';
        const gasIcon = document.createElement('span');
        gasIcon.className = 'mob-pedal-arrow';
        gasIcon.textContent = '▲';
        const gasSub = document.createElement('span');
        gasSub.className = 'mob-pedal-label';
        gasSub.textContent = 'GO';
        btnGas.appendChild(gasIcon);
        btnGas.appendChild(gasSub);

        pedalPad.appendChild(btnBrakeRev);
        pedalPad.appendChild(btnGas);
        root.appendChild(pedalPad);

        const gameContainer = document.getElementById('game-container') || document.body;
        gameContainer.appendChild(root);

        this.root = root;
        this.uiRefs.btnEngine = btnEngine;
        this.uiRefs.btnPark = btnPark;
        this.uiRefs.btnHitch = btnHitch;
        this.uiRefs.btnCam = btnCam;
        this.uiRefs.btnHorn = btnHorn;
        this.uiRefs.btnLights = btnLights;
        this.uiRefs.btnSound = btnSound;
        this.uiRefs.btnHelp = btnHelp;
        this.uiRefs.camDrawer = camDrawer;
        this.uiRefs.btnLeft = btnLeft;
        this.uiRefs.btnRight = btnRight;
        this.uiRefs.btnBrakeRev = btnBrakeRev;
        this.uiRefs.btnGas = btnGas;

        this._bindDualZonePad(
            steerPad,
            this.steerTouches,
            'ArrowLeft',
            'ArrowRight',
            btnLeft,
            btnRight
        );
        this._bindDualZonePad(
            pedalPad,
            this.pedalTouches,
            'ArrowDown',
            'ArrowUp',
            btnBrakeRev,
            btnGas
        );
    }

    _bindDualZonePad(padEl, touchMap, leftKey, rightKey, leftBtnEl, rightBtnEl) {
        const resolveKeyAtX = (clientX) => {
            const rect = padEl.getBoundingClientRect();
            const midX = rect.left + rect.width * 0.5;
            if (Math.abs(clientX - midX) < 4) return null;
            return clientX < midX ? leftKey : rightKey;
        };

        const applyActiveKeys = () => {
            let leftActive = false;
            let rightActive = false;
            for (const k of touchMap.values()) {
                if (k === leftKey) leftActive = true;
                if (k === rightKey) rightActive = true;
            }
            this.keyboardController.setVirtualKey(leftKey, leftActive);
            this.keyboardController.setVirtualKey(rightKey, rightActive);
            leftBtnEl.classList.toggle('is-pressed', leftActive);
            rightBtnEl.classList.toggle('is-pressed', rightActive);
        };

        // Filtra apenas os toques ativos que começaram dentro deste padEl específico
        const syncFromTouches = (touches) => {
            touchMap.clear();
            if (touches) {
                for (let i = 0; i < touches.length; i++) {
                    const t = touches[i];
                    if (t.target && padEl.contains(t.target)) {
                        touchMap.set(t.identifier, resolveKeyAtX(t.clientX));
                    }
                }
            }
            applyActiveKeys();
        };

        this._padSyncCallbacks.push(syncFromTouches);

        const onTouchEvent = (e) => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            if (e.type === 'touchstart') {
                this._unlockAudio();
            }
            syncFromTouches(e.touches);
        };

        padEl.addEventListener('touchstart', onTouchEvent, { passive: false });
        padEl.addEventListener('touchmove', onTouchEvent, { passive: false });
        padEl.addEventListener('touchend', onTouchEvent, { passive: false });
        padEl.addEventListener('touchcancel', onTouchEvent, { passive: false });
    }

    _bindCanvasGestures() {
        if (typeof document === 'undefined') return;

        const isInteractiveUiTarget = (el) => {
            if (!el || typeof el.closest !== 'function') return false;
            return Boolean(
                el.closest(
                    'button, a, input, select, textarea, label, ' +
                    '#mobile-steer-pad, #mobile-pedal-pad, #mobile-action-wrap, ' +
                    '#game-controls-info, #message-box, #notification-stack, ' +
                    '#close-top-info-button, #parking-brake-indicator, ' +
                    '#start-screen, #rotate-device-overlay, #structure-visibility-panel'
                )
            );
        };

        const getTwoTouches = () => {
            const pts = Array.from(this.canvasTouches.values());
            return [pts[0], pts[1]];
        };

        const onTouchStart = (e) => {
            let capturedAny = false;
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (isInteractiveUiTarget(t.target)) continue;
                this.canvasTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
                capturedAny = true;
            }
            if (!capturedAny) return;

            if (!this.isMobile) {
                this.setMobileActive(true);
            }
            this._unlockAudio();
            if (e.cancelable) e.preventDefault();
        };

        const onTouchMove = (e) => {
            if (this.canvasTouches.size === 0) return;

            let matchesCanvasTouch = false;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (this.canvasTouches.has(e.changedTouches[i].identifier)) {
                    matchesCanvasTouch = true;
                    break;
                }
            }
            if (!matchesCanvasTouch) return;
            if (e.cancelable) e.preventDefault();

            if (this.canvasTouches.size === 1) {
                for (let i = 0; i < e.changedTouches.length; i++) {
                    const t = e.changedTouches[i];
                    const prev = this.canvasTouches.get(t.identifier);
                    if (prev) {
                        const dx = t.clientX - prev.x;
                        const dy = t.clientY - prev.y;
                        this.camera.TouchOrbit(dx, dy);
                        prev.x = t.clientX;
                        prev.y = t.clientY;
                    }
                }
                return;
            }

            const [oldA, oldB] = getTwoTouches();
            const oldDist = Math.hypot(oldB.x - oldA.x, oldB.y - oldA.y);
            const oldMidX = (oldA.x + oldB.x) * 0.5;
            const oldMidY = (oldA.y + oldB.y) * 0.5;

            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                const stored = this.canvasTouches.get(t.identifier);
                if (stored) {
                    stored.x = t.clientX;
                    stored.y = t.clientY;
                }
            }

            const [newA, newB] = getTwoTouches();
            const newDist = Math.hypot(newB.x - newA.x, newB.y - newA.y);
            const newMidX = (newA.x + newB.x) * 0.5;
            const newMidY = (newA.y + newB.y) * 0.5;

            this.camera.TouchPinchZoom(oldDist, newDist);
            this.camera.TouchOrbit(newMidX - oldMidX, newMidY - oldMidY);
        };

        const onTouchEnd = (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                this.canvasTouches.delete(e.changedTouches[i].identifier);
            }
        };

        document.addEventListener('touchstart', onTouchStart, { passive: false });
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd, { passive: false });
        document.addEventListener('touchcancel', onTouchEnd, { passive: false });
    }

    _bindLifecycleSafety() {
        if (typeof window === 'undefined') return;
        const releaseAll = () => this.releaseAllInputs();
        window.addEventListener('blur', releaseAll);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) releaseAll();
        });

        // Reconciliação global em fase de captura garante que nenhum toque encerrado fique preso
        const reconcileRemainingTouches = (e) => {
            const activeTouches = e.touches;
            for (let i = 0; i < this._padSyncCallbacks.length; i++) {
                this._padSyncCallbacks[i](activeTouches);
            }
            if (this.canvasTouches.size > 0) {
                const stillDown = new Set();
                if (activeTouches) {
                    for (let i = 0; i < activeTouches.length; i++) {
                        stillDown.add(activeTouches[i].identifier);
                    }
                }
                for (const id of Array.from(this.canvasTouches.keys())) {
                    if (!stillDown.has(id)) {
                        this.canvasTouches.delete(id);
                    }
                }
            }
        };
        window.addEventListener('touchend', reconcileRemainingTouches, { capture: true, passive: true });
        window.addEventListener('touchcancel', reconcileRemainingTouches, { capture: true, passive: true });
        const checkOrientation = () => {
            if (this.isMobile && window.innerHeight > window.innerWidth) {
                this.releaseAllInputs();
                this.camDrawerOpen = false;
                if (this.uiRefs.camDrawer) this.uiRefs.camDrawer.style.display = 'none';
            }
        };
        window.addEventListener('resize', checkOrientation);
        window.addEventListener('orientationchange', checkOrientation);
        // Se um dispositivo híbrido receber um toque na tela após iniciar como desktop, ativa os controles móveis
        window.addEventListener('touchstart', () => {
            if (!this.isMobile) {
                this.setMobileActive(true);
                this.syncHUD();
            }
        }, { passive: true, once: true });
    }

    releaseAllInputs() {
        this.steerTouches.clear();
        this.pedalTouches.clear();
        this.canvasTouches.clear();
        this.hornMouseDown = false;
        this._setHornActive(false);
        this.keyboardController.resetVirtualKeys();
        if (this.uiRefs.btnLeft) this.uiRefs.btnLeft.classList.remove('is-pressed');
        if (this.uiRefs.btnRight) this.uiRefs.btnRight.classList.remove('is-pressed');
        if (this.uiRefs.btnBrakeRev) this.uiRefs.btnBrakeRev.classList.remove('is-pressed');
        if (this.uiRefs.btnGas) this.uiRefs.btnGas.classList.remove('is-pressed');
    }

    syncHUD() {
        if (!this.isMobile || !this.root) return;

        const engineOn = Boolean(this.truck && this.truck.isEngineOn && this.truck.isEngineOn());
        if (engineOn !== this._lastEngineState) {
            this._lastEngineState = engineOn;
            if (this.uiRefs.btnEngine) {
                this.uiRefs.btnEngine.classList.toggle('is-engine-on', engineOn);
                this.uiRefs.btnEngine.setAttribute('aria-pressed', engineOn ? 'true' : 'false');
            }
        }

        const pOn = Boolean(
            this.keyboardController ? this.keyboardController.parkingBrakeOn : this.truck.parkingBrakeOn
        );
        if (pOn !== this._lastParkingState) {
            this._lastParkingState = pOn;
            if (this.uiRefs.btnPark) {
                this.uiRefs.btnPark.classList.toggle('is-park-on', pOn);
                this.uiRefs.btnPark.setAttribute('aria-pressed', pOn ? 'true' : 'false');
            }
        }

        const hasTrailer = Boolean(this.truck.HasTrailer && this.truck.HasTrailer());
        if (hasTrailer !== this._lastTrailerState) {
            this._lastTrailerState = hasTrailer;
            if (this.uiRefs.btnHitch) {
                this.uiRefs.btnHitch.classList.toggle('is-hitch-on', hasTrailer);
                this.uiRefs.btnHitch.setAttribute('aria-pressed', hasTrailer ? 'true' : 'false');
            }
        }

        const lightState = this.truck.lightingState || 0;
        if (lightState !== this._lastLightingState) {
            this._lastLightingState = lightState;
            this.uiRefs.btnLights.classList.toggle('is-warn-active', lightState > 0);
        }

        const muted = Boolean(this.truck.engineSound && this.truck.engineSound.isMuted());
        if (muted !== this._lastMutedState) {
            this._lastMutedState = muted;
            this.uiRefs.btnSound.textContent = muted ? '🔇' : '🔊';
        }

        const camId = this.camera.currentCamera;
        if (camId !== this._lastCameraId) {
            this._lastCameraId = camId;
            if (this.uiRefs.camPills) {
                Object.entries(this.uiRefs.camPills).forEach(([id, el]) => {
                    el.classList.toggle('is-cam-selected', id === camId);
                });
            }
        }

        const infoEl = typeof document !== 'undefined' ? document.getElementById('game-controls-info') : null;
        const helpOpen = Boolean(infoEl && infoEl.style.display === 'block');
        if (helpOpen !== this._lastHelpOpen) {
            this._lastHelpOpen = helpOpen;
            if (this.uiRefs.btnHelp) {
                this.uiRefs.btnHelp.classList.toggle('is-info-active', helpOpen);
            }
        }
    }
}
