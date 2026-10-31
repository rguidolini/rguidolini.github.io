/**
 * Detecção automática Mobile / Desktop e controles multi-toque para celular e tablet (modo horizontal / landscape):
 *  - Direção deslizante (◄ / ►) no canto inferior esquerdo
 *  - Barra rápida inferior central: Freio Estacionário (P), Engate da Carreta, Câmeras, Faróis, Som e Tela Cheia
 *  - Pedais de Freio/Ré (▼) e Acelerador (▲) no canto inferior direito
 *  - Gestos multi-toque independentes no canvas 3D: 1 dedo gira a câmera orbital, 2 dedos fazem zoom de pinça
 */

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

        this.uiRefs = {};
        this._lastParkingState = null;
        this._lastTrailerState = null;
        this._lastLightingState = null;
        this._lastMutedState = null;
        this._lastCameraId = null;

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

        const btnPark = makeActionBtn('(P)', 'Parking brake', () => {
            this.keyboardController.switchParkingBreak();
        });
        const btnHitch = makeActionBtn('🔗 Hitch', 'Hitch or unhitch trailer', () => {
            if (typeof this.onHitch === 'function') this.onHitch();
        });
        const btnCam = makeActionBtn('📷 Cam', 'Switch camera', () => {
            this.camDrawerOpen = !this.camDrawerOpen;
            this.uiRefs.camDrawer.style.display = this.camDrawerOpen ? 'flex' : 'none';
        });
        const btnLights = makeActionBtn('💡', 'Toggle lights', () => {
            this.truck.toggleHeadlights();
        });
        const btnSound = makeActionBtn('🔊', 'Mute or unmute engine', () => {
            this.truck.toggleEngineSound();
        });

        actionBar.appendChild(btnPark);
        actionBar.appendChild(btnHitch);
        actionBar.appendChild(btnCam);
        actionBar.appendChild(btnLights);
        actionBar.appendChild(btnSound);

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
        btnLeft.className = 'mob-drive-btn mob-steer-btn';
        btnLeft.textContent = '◄';

        const btnRight = document.createElement('div');
        btnRight.className = 'mob-drive-btn mob-steer-btn';
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
        this.uiRefs.btnPark = btnPark;
        this.uiRefs.btnHitch = btnHitch;
        this.uiRefs.btnCam = btnCam;
        this.uiRefs.btnLights = btnLights;
        this.uiRefs.btnSound = btnSound;
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

        const onStartOrMove = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._unlockAudio();
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                touchMap.set(t.identifier, resolveKeyAtX(t.clientX));
            }
            applyActiveKeys();
        };

        const onEndOrCancel = (e) => {
            e.preventDefault();
            e.stopPropagation();
            for (let i = 0; i < e.changedTouches.length; i++) {
                touchMap.delete(e.changedTouches[i].identifier);
            }
            applyActiveKeys();
        };

        padEl.addEventListener('touchstart', onStartOrMove, { passive: false });
        padEl.addEventListener('touchmove', onStartOrMove, { passive: false });
        padEl.addEventListener('touchend', onEndOrCancel, { passive: false });
        padEl.addEventListener('touchcancel', onEndOrCancel, { passive: false });
    }

    _bindCanvasGestures() {
        if (!this.canvas) return;

        const getTwoTouches = () => {
            const pts = Array.from(this.canvasTouches.values());
            return [pts[0], pts[1]];
        };

        const onTouchStart = (e) => {
            if (!this.isMobile) {
                this.setMobileActive(true);
            }
            this._unlockAudio();
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                this.canvasTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
            }
        };

        const onTouchMove = (e) => {
            if (this.canvasTouches.size === 0) return;
            e.preventDefault();

            if (this.canvasTouches.size === 1) {
                const t = e.changedTouches[0];
                const prev = this.canvasTouches.get(t.identifier);
                if (prev) {
                    const dx = t.clientX - prev.x;
                    const dy = t.clientY - prev.y;
                    this.camera.TouchOrbit(dx, dy);
                    prev.x = t.clientX;
                    prev.y = t.clientY;
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

        this.canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        this.canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
    }

    _bindLifecycleSafety() {
        if (typeof window === 'undefined') return;
        const releaseAll = () => this.releaseAllInputs();
        window.addEventListener('blur', releaseAll);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) releaseAll();
        });
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
        this.keyboardController.resetVirtualKeys();
        if (this.uiRefs.btnLeft) this.uiRefs.btnLeft.classList.remove('is-pressed');
        if (this.uiRefs.btnRight) this.uiRefs.btnRight.classList.remove('is-pressed');
        if (this.uiRefs.btnBrakeRev) this.uiRefs.btnBrakeRev.classList.remove('is-pressed');
        if (this.uiRefs.btnGas) this.uiRefs.btnGas.classList.remove('is-pressed');
    }

    syncHUD() {
        if (!this.isMobile || !this.root) return;

        const pOn = Boolean(
            this.keyboardController ? this.keyboardController.parkingBrakeOn : this.truck.parkingBrakeOn
        );
        if (pOn !== this._lastParkingState) {
            this._lastParkingState = pOn;
            this.uiRefs.btnPark.classList.toggle('is-danger-active', pOn);
            this.uiRefs.btnPark.textContent = pOn ? '(P) ON' : '(P)';
        }

        const hasTrailer = Boolean(this.truck.HasTrailer && this.truck.HasTrailer());
        if (hasTrailer !== this._lastTrailerState) {
            this._lastTrailerState = hasTrailer;
            this.uiRefs.btnHitch.classList.toggle('is-ok-active', hasTrailer);
            this.uiRefs.btnHitch.textContent = hasTrailer ? '🔗 Unhitch' : '🔗 Hitch';
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
    }
}
