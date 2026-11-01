import * as THREE from 'three';
import { TireWheelSet } from './wheel.js';
import { KenworthW900Visual } from './kenworth_w900_visual.js';
import { W900EngineSound, ENGINE_STARTUP_DURATION } from './engine_sound.js';

export class KenworthW900 {
    Initialize(params) {
        this.parkingBrakeOn = null;
        this._suppressBrakeHiss = false;
        this.engineOn = false;
        this._crankTimer = 0.0;
        this._crankEndMs = 0;
        this.currentThrottle = 0;
        this.currentBrake = 0;
        this.lightingState = 0; // 0: apagado, 1: luzes de posição, 2: faróis
        this.lastSpeedKmh = -1;
        this._notifications = [];
        this._forwardVec = new CANNON.Vec3(0, 0, 1);
        this._worldForwardVec = new CANNON.Vec3();
        this._tmpFifthWheelWorld = new CANNON.Vec3();
        this.params = params;
        this.vehicle;
        this.chassisMesh;
        this.wheelMeshes = [];
        this.trailer = null;
        this.worldTrailer = params.worldTrailer || null;
        this._kingPinInFifthWheel = false;
        this.engineSound = new W900EngineSound();
        this.engineSound.start();

        // 1. Física do Veículo
        const chassisBody = new CANNON.Body({
            mass: 3000,
            material: params.fifthWheelMaterial,
        });

        const width = 2.38;
        const length = 7.90;
        const height = 0.5;
        const chassisShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, length / 2));
        chassisBody.addShape(chassisShape);

        const cabWidth = width;
        const cabLength = 5;
        const cabHeight = 2.38;
        const cabY = cabHeight / 2 + height / 2;
        const cabZ = length / 2 - cabLength / 2;
        const cabShape = new CANNON.Box(new CANNON.Vec3(cabWidth / 2, cabHeight / 2, cabLength / 2));
        chassisBody.addShape(cabShape, new CANNON.Vec3(0, cabY, cabZ));
        chassisBody.allowSleep = true;
        chassisBody.sleepSpeedLimit = 0.15;
        chassisBody.sleepTimeLimit = 0.5;

        this.vehicle = new CANNON.RaycastVehicle({
            chassisBody: chassisBody,
            indexRightAxis: 0,
            indexUpAxis: 1,
            indexForwardAxis: 2,
        });
        this.vehicle.addToWorld(this.params.world);

        // Modelo Visual do Caminhao
        this.chassisMesh = new THREE.Group();
        const truckModel = KenworthW900Visual(this.wheelMeshes, {
            initialEngineVariant: this.engineSound.getEngineVariant(),
            onSelectEngineVariant: (id) => this.setEngineVariant(id)
        });
        this.truckModel = truckModel;
        this.chassisMesh.add(truckModel);

        // Physics and Visual for Wheels
        const axles = ["front", "rear", "truck"];
        axles.forEach(axle => {
            ["left", "right"].forEach(side => {
                this._addWheel(axle, side);
            });
        });
        this.params.scene.add(this.chassisMesh);
        this.wheelMeshes.forEach(mesh => { this.params.scene.add(mesh) });

        this.fifthWheelPoint = new CANNON.Vec3(0, height / 2 + 0.25, -length / 2 + 0.7 + 0.38);
        const fifthWheelY = height / 2 + 0.18;
        const fifthWheelBack = new CANNON.Box(new CANNON.Vec3(0.20 / 2, 0.1 / 2, 0.1 / 2));
        chassisBody.addShape(fifthWheelBack, new CANNON.Vec3(0, fifthWheelY, -length / 2 + 1.23));

        const fifthWheelZ = -length / 2 + 1;
        const axis = new CANNON.Vec3(0, 1, 0);
        const quaternion = new CANNON.Quaternion();
        quaternion.setFromAxisAngle(axis, -Math.PI / 10);
        const fifthWheelSideL = new CANNON.Box(new CANNON.Vec3(0.01, 0.1 / 2, 0.25));
        chassisBody.addShape(fifthWheelSideL, new CANNON.Vec3(0.15, fifthWheelY, fifthWheelZ), quaternion);

        const fifthWheelSideR = new CANNON.Box(new CANNON.Vec3(0.01, 0.1 / 2, 0.25));
        quaternion.setFromAxisAngle(axis, Math.PI / 10);
        chassisBody.addShape(fifthWheelSideR, new CANNON.Vec3(-0.15, fifthWheelY, fifthWheelZ), quaternion);
    }

    setSteering(value) {
        const maxSteerVal = -0.9;  // Negative because the vehicle was created on the wrong axis
        this.vehicle.setSteeringValue(value * maxSteerVal, 0);
        this.vehicle.setSteeringValue(value * maxSteerVal, 1);
    }

    isEngineOn() {
        return Boolean(this.engineOn);
    }

    isEngineStarting() {
        if (!this.engineOn || this._crankTimer <= 0) return false;
        if (this._crankEndMs > 0) {
            const nowMs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
                ? performance.now()
                : Date.now();
            const remSec = (this._crankEndMs - nowMs) / 1000.0;
            if (remSec <= 0) {
                this._crankTimer = 0.0;
                this._crankEndMs = 0;
                return false;
            }
            this._crankTimer = remSec;
        }
        return true;
    }

    setEngineOn(isOn, options = {}) {
        const next = Boolean(isOn);
        const silent = Boolean(options.silent);
        const changed = this.engineOn !== next;
        this.engineOn = next;

        if (next) {
            if (changed) {
                const durSec = silent ? 0.0 : ENGINE_STARTUP_DURATION;
                this._crankTimer = durSec;
                const nowMs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
                    ? performance.now()
                    : Date.now();
                this._crankEndMs = durSec > 0 ? nowMs + durSec * 1000.0 : 0;
                this.currentThrottle = 0;
                this.reverseThrottle = false;
                if (this.vehicle && this.vehicle.wheelInfos) {
                    for (let i = 2; i < 6 && i < this.vehicle.wheelInfos.length; i++) {
                        this.vehicle.applyEngineForce(0, i);
                    }
                }
            }
            if (this.engineSound) {
                this.engineSound.setEngineRunning(true, silent);
            }
            this.invalidateNotifications('engine-off-warn');
            if (changed && !silent) {
                this.showinfo("🔑 Engine started", {
                    group: 'engine-power',
                    invalidates: ['engine-off-warn', 'park-finish-hint']
                });
            }
        } else {
            this._crankTimer = 0.0;
            this._crankEndMs = 0;
            this.currentThrottle = 0;
            this.reverseThrottle = false;
            this.setReverseLights(this.isMoving() < 0);
            if (this.vehicle && this.vehicle.wheelInfos) {
                for (let i = 2; i < 6 && i < this.vehicle.wheelInfos.length; i++) {
                    this.vehicle.applyEngineForce(0, i);
                }
            }
            if (this.engineSound) {
                this.engineSound.setEngineRunning(false, silent);
            }
            if (changed && !silent) {
                this.showinfo("🔌 Engine turned off", {
                    group: 'engine-power',
                    invalidates: ['engine-off-warn', 'park-finish-hint']
                });
            }
        }
        return this.engineOn;
    }

    toggleEngine() {
        if (this.frozen) return this.engineOn;
        return this.setEngineOn(!this.engineOn);
    }

    /**
    * Controls the vehicle acceleration based on the input.
    * @param {number} powerFraction: a percentage of the acceleration. 1 for forward, -1 for backward.
    * Returns 
    */
    Throttle(powerFraction) {
        if (!this.engineOn) {
            this.currentThrottle = 0;
            this.reverseThrottle = false;
            this.setReverseLights(this.isMoving() < 0);
            for (let i = 2; i < 6; i++) {
                this.vehicle.applyEngineForce(0, i);
            }
            if (powerFraction !== 0) {
                this.showWarning("⚠ Start the engine to drive", { group: 'engine-off-warn' });
            }
            return;
        }
        if (this.isEngineStarting()) {
            this.currentThrottle = 0;
            this.reverseThrottle = false;
            this.setReverseLights(this.isMoving() < 0);
            for (let i = 2; i < 6; i++) {
                this.vehicle.applyEngineForce(0, i);
            }
            return;
        }
        this.currentThrottle = powerFraction;
        this.reverseThrottle = powerFraction < 0;
        this.setReverseLights(this.reverseThrottle || this.isMoving() < 0);
        if (powerFraction != 0) {
            if (this.parkingBrakeOn) {
                this.showWarning("⚠ Release the parking brake to drive", { group: 'parking-brake' });
            }
            this.vehicle.chassisBody.allowSleep = false;
            this.vehicle.chassisBody.wakeUp();
        }
        const maxForce = -2000;  // The negative values is because the car was crated in the wrong axis
        let force = maxForce * powerFraction;
        if (powerFraction < 0) {
            force /= 2;
            if (this.GetSpeed() < -2) force = 0;  // Do not go over 7 km/h (2m/s) in reverse
        }
        for (let i = 2; i < 6; i++) {
            this.vehicle.applyEngineForce(force, i);
        }
    }

    setBrakeLights(isBraking) {
        if (this.truckModel && this.truckModel.userData && typeof this.truckModel.userData.setBrakeLights === 'function') {
            this.truckModel.userData.setBrakeLights(isBraking);
        }
    }

    setReverseLights(isReversing) {
        if (this.truckModel && this.truckModel.userData && typeof this.truckModel.userData.setReverseLights === 'function') {
            this.truckModel.userData.setReverseLights(isReversing);
        }
    }

    setHeadlights(stateOrBool) {
        if (typeof stateOrBool === 'number') {
            this.lightingState = ((stateOrBool % 3) + 3) % 3;
        } else {
            this.lightingState = stateOrBool ? 2 : 0;
        }
        this.headlightsOn = this.lightingState > 0;
        if (this.truckModel && this.truckModel.userData) {
            if (typeof this.truckModel.userData.setLightingState === 'function') {
                this.truckModel.userData.setLightingState(this.lightingState);
            } else if (typeof this.truckModel.userData.setHeadlights === 'function') {
                this.truckModel.userData.setHeadlights(this.lightingState);
            }
        }
    }

    toggleHeadlights() {
        const nextState = ((this.lightingState || 0) + 1) % 3;
        this.setHeadlights(nextState);
        return this.lightingState;
    }

    setWorldTrailer(trailer) {
        this.worldTrailer = trailer || null;
    }

    setHorn(isOn) {
        if (!this.engineSound) return;
        this.engineSound.setHorn(Boolean(isOn));
    }

    setEngineVariant(variantId) {
        if (!this.engineSound) return 4;
        const selected = this.engineSound.setEngineVariant(variantId);
        if (this.truckModel && this.truckModel.userData && typeof this.truckModel.userData.setActiveEngineVariant === 'function') {
            this.truckModel.userData.setActiveEngineVariant(selected);
        }
        const labels = {
            1: '🔊 Motor 1: Cat 3406B (original)',
            2: '🔊 Motor 2: Mais rouco',
            3: '🔊 Motor 3: Mais grave',
            4: '🔊 Motor 4: Grave + rouco (padrão)',
            5: '🔊 Motor 5: Cummins N14 (vídeo 11s–41s)'
        };
        if (labels[selected]) {
            this.showinfo(labels[selected], { group: 'engine-variant' });
        }
        return selected;
    }

    toggleEngineSound() {
        if (!this.engineSound) return false;
        const muted = this.engineSound.toggleMute();
        this.showinfo(muted ? "🔇 Game sound muted" : "🔊 Game sound enabled", { group: 'game-sound' });
        return muted;
    }

    toggleGameSound() {
        return this.toggleEngineSound();
    }

    Brake(breakFraction) {
        this.currentBrake = breakFraction;
        this.setBrakeLights(breakFraction !== 0);
        if (breakFraction !== 0) {
            this.vehicle.chassisBody.allowSleep = true;
        }
        const maxBrakeForce = 60;
        const serviceBrakeForce = maxBrakeForce * breakFraction;
        const parkingForce = this.parkingBrakeOn ? 50 : 0;
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            const force = (i >= 2) ? Math.max(serviceBrakeForce, parkingForce) : serviceBrakeForce;
            this.vehicle.setBrake(force, i);
        }
    }

    setParkingBrake(isOn) {
        const wasInitialized = this.parkingBrakeOn !== null;
        const changed = this.parkingBrakeOn !== isOn;
        this.parkingBrakeOn = isOn;
        if (changed && wasInitialized && !this._suppressBrakeHiss && this.engineSound) {
            this.engineSound.triggerAirBrakeHiss(isOn ? 0.85 : 1.0);
        }
        const maxParkingBrakeForce = 50;
        const force = isOn ? maxParkingBrakeForce : 0;
        if (isOn) {
            this.vehicle.chassisBody.allowSleep = true;
            if (changed) {
                this.params.brakeIndicator.style.display = "block";
                this.invalidateNotifications(['park-finish-hint', 'trailer-park-brake']);
            }
        } else if (changed) {
            this.params.brakeIndicator.style.display = "none";
            this.invalidateNotifications(['parking-brake', 'park-finish-hint']);
        }
        this.vehicle.setBrake(force, 2);
        this.vehicle.setBrake(force, 3);
        this.vehicle.setBrake(force, 4);
        this.vehicle.setBrake(force, 5);
        if (this.trailer) {
            this.trailer.setParkingBrake(isOn);
        }
    }

    GetSpeed() {
        if (this.vehicle.chassisBody.sleepState == CANNON.Body.SLEEPING) return 0;
        this.vehicle.chassisBody.vectorToWorldFrame(this._forwardVec, this._worldForwardVec);
        return this.vehicle.chassisBody.velocity.dot(this._worldForwardVec);
    }

    /**
     * Returns:
     * -1 if car is moving backwards
     * 0 if car is stopped
     * 1 if car is moving forward
     */
    isMoving() {
        const threshold = 0.003;
        // Pick the only wheels that are not used for parking brakes.
        const avgSpeed =
            (this.vehicle.wheelInfos[0].deltaRotation + this.vehicle.wheelInfos[1].deltaRotation) /
            2;

        if (avgSpeed < -threshold) {
            return 1;
        }
        if (avgSpeed > threshold) {
            return -1;
        }
        return 0;
    }

    _performDomRemovalWithFlip(entriesToRemove) {
        if (!entriesToRemove || entriesToRemove.length === 0) return;
        const removeSet = new Set(entriesToRemove);

        const beforeTops = new Map();
        for (const other of this._notifications) {
            if (!removeSet.has(other) && !other.closing && other.el.isConnected) {
                beforeTops.set(other, other.el.getBoundingClientRect().top);
            }
        }

        for (const entry of removeSet) {
            if (entry.timerId) {
                clearTimeout(entry.timerId);
                entry.timerId = null;
            }
            if (entry.leaveTimerId) {
                clearTimeout(entry.leaveTimerId);
                entry.leaveTimerId = null;
            }
            const idx = this._notifications.indexOf(entry);
            if (idx !== -1) this._notifications.splice(idx, 1);
            if (entry.el.parentNode) entry.el.remove();
        }

        // Animação FLIP suave para as notificações abaixo subirem ocupando o espaço liberado
        for (const [other, prevTop] of beforeTops.entries()) {
            if (!other.el.isConnected || other.closing) continue;
            other.el.style.transition = 'none';
            other.el.style.transform = '';
            const newTop = other.el.getBoundingClientRect().top;
            const dy = prevTop - newTop;
            if (Math.abs(dy) > 0.5) {
                other.el.style.transform = `translateY(${dy}px)`;
                void other.el.offsetHeight;
                other.el.style.transition = '';
                other.el.style.transform = '';
            } else {
                other.el.style.transition = '';
            }
        }
    }

    _pushNotification(message, type, durationMs, options = {}) {
        const stackEl = this.params && this.params.notificationStack;
        if (!stackEl) return;

        const group = options.group || null;
        const invalidates = Array.isArray(options.invalidates) ? options.invalidates : [];

        // Evita duplicar a mesma notificação ativa (ex.: Throttle chamando showWarning a 60 FPS)
        const existing = this._notifications.find(
            (n) => !n.closing && n.type === type && n.message === message
        );
        if (existing) {
            clearTimeout(existing.timerId);
            existing.timerId = setTimeout(() => this._removeNotification(existing), durationMs);
            return;
        }

        // Remove imediatamente notificações conflitantes/invalidadas do mesmo grupo ou relacionadas
        if (group || invalidates.length > 0) {
            const groupsToRemove = new Set(invalidates);
            if (group) groupsToRemove.add(group);
            const conflicting = this._notifications.filter(
                (n) => n.group && groupsToRemove.has(n.group)
            );
            if (conflicting.length > 0) {
                this._performDomRemovalWithFlip(conflicting);
            }
        }

        const card = document.createElement('div');
        card.className = `notif-item notif-${type} is-entering`;

        const textSpan = document.createElement('span');
        textSpan.className = 'notif-text';
        textSpan.textContent = message;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'notif-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', 'Close notification');

        card.appendChild(textSpan);
        card.appendChild(closeBtn);
        stackEl.appendChild(card);

        void card.offsetHeight;
        requestAnimationFrame(() => {
            card.classList.remove('is-entering');
        });

        const entry = {
            el: card,
            type,
            message,
            group,
            createdAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
            closing: false,
            timerId: null,
            leaveTimerId: null
        };

        const onDismiss = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._removeNotification(entry);
        };
        closeBtn.addEventListener('touchstart', onDismiss, { passive: false });
        closeBtn.addEventListener('click', onDismiss);

        entry.timerId = setTimeout(() => this._removeNotification(entry), durationMs);
        this._notifications.push(entry);
    }

    _removeNotification(entry) {
        if (!entry || entry.closing) return;
        entry.closing = true;
        if (entry.timerId) {
            clearTimeout(entry.timerId);
            entry.timerId = null;
        }
        entry.el.classList.add('is-leaving');

        entry.leaveTimerId = setTimeout(() => {
            entry.leaveTimerId = null;
            this._performDomRemovalWithFlip([entry]);
        }, 150);
    }

    invalidateNotifications(groupOrGroups, minAgeMs = 0) {
        if (this._notifications.length === 0) return;
        const isArray = Array.isArray(groupOrGroups);
        const now = minAgeMs > 0 ? (typeof performance !== 'undefined' ? performance.now() : Date.now()) : 0;
        for (let i = 0; i < this._notifications.length; i++) {
            const n = this._notifications[i];
            if (n.closing || !n.group) continue;
            if (minAgeMs > 0 && now - n.createdAt < minAgeMs) continue;
            const matches = isArray ? groupOrGroups.includes(n.group) : n.group === groupOrGroups;
            if (matches) {
                this._removeNotification(n);
            }
        }
    }

    dismissWarnings() {
        const warnings = this._notifications.filter((n) => !n.closing && n.type === 'warning');
        warnings.forEach((n) => this._removeNotification(n));
    }

    clearNotifications() {
        for (const n of this._notifications) {
            if (n.timerId) clearTimeout(n.timerId);
            if (n.leaveTimerId) clearTimeout(n.leaveTimerId);
            if (n.el.parentNode) n.el.remove();
        }
        this._notifications.length = 0;
    }

    showWarning(message, options) {
        this._pushNotification(message, 'warning', 5000, options);
    }

    showinfo(message, options) {
        this._pushNotification(message, 'info', 3000, options);
    }

    getChassisMesh() {
        return this.chassisMesh;
    };

    _addWheel(axle, side) {
        const radius = 0.52;
        const axelPos = {
            "front": 3.21,
            "truck": -2.15,
            "rear": -3.25,
        };
        // Distância entre as extremidades externas das rodas de um mesmo eixo = 2.38m (±1.190m).
        // Como a face externa do pneu fica a +0.16m (tireWidth/2) do ponto de conexão, posX = 1.190 - 0.16 = ±1.030m.
        const sidePos = {
            "right": -1.030,
            "left": 1.030,
        };
        const wheelOptions = {
            radius: radius,
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: 30,
            suspensionRestLength: 0.3,
            frictionSlip: 1.4,
            dampingRelaxation: 2.3,
            dampingCompression: 4.4,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: new CANNON.Vec3(-1, 0, 0),
            chassisConnectionPointLocal: new CANNON.Vec3(),
            maxSuspensionTravel: 0.3,
            // This causes the wheels of the truck to slide strange when the car has a truck axle.
            // customSlidingRotationalSpeed: -30,
            // useCustomSlidingRotationalSpeed: true,
        };

        const single = axle === "front";
        const rightSide = side === "right";
        const posX = sidePos[side];
        const posZ = axelPos[axle];

        // Phisycs.
        wheelOptions.chassisConnectionPointLocal.set(posX, 0, posZ);
        this.vehicle.addWheel(wheelOptions);

        // Visual.
        this.wheelMeshes.push((new TireWheelSet(rightSide, single)).Visual());
    }

    freeze() {
        this.frozen = true;
        this.invalidateNotifications(['parking-brake', 'engine-off-warn', 'park-finish-hint', 'trailer-error', 'trailer-moving', 'trailer-park-brake']);
        this.currentThrottle = 0;
        this.currentBrake = 0;
        this.reverseThrottle = false;
        this.setBrakeLights(false);
        this.setReverseLights(false);
        if (this.engineSound) {
            this.engineSound.setFrozen(true);
        }
        this.vehicle.chassisBody.type = CANNON.Body.STATIC;
        this.vehicle.chassisBody.velocity.set(0, 0, 0);
        this.vehicle.chassisBody.angularVelocity.set(0, 0, 0);
        this.vehicle.chassisBody.vlambda.set(0, 0, 0);
        this.vehicle.chassisBody.wlambda.set(0, 0, 0);
        this.vehicle.chassisBody.force.set(0, 0, 0);
        this.vehicle.chassisBody.torque.set(0, 0, 0);
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            this.vehicle.applyEngineForce(0, i);
            this.vehicle.wheelInfos[i].deltaRotation = 0;
        }
        if (this.trailer) {
            this.trailer.Freeze();
        }
    }

    reset(x, y, z, angle) {
        this.frozen = false;
        this.setHorn(false);
        this.clearNotifications();
        this.currentThrottle = 0;
        this.currentBrake = 0;
        this.UnhitchTrailer();
        this._kingPinInFifthWheel = false;
        this.reverseThrottle = false;
        this.setBrakeLights(false);
        this.setReverseLights(false);
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            this.vehicle.applyEngineForce(0, i);
            this.vehicle.setBrake(0, i);
            this.vehicle.wheelInfos[i].deltaRotation = 0;
        }
        this.vehicle.chassisBody.type = CANNON.Body.DYNAMIC;
        this._suppressBrakeHiss = true;
        this.setParkingBrake(true);
        this._suppressBrakeHiss = false;
        this.setEngineOn(false, { silent: true });
        if (this.engineSound) {
            this.engineSound.setFrozen(false);
        }
        this.vehicle.chassisBody.wakeUp();
        this.vehicle.chassisBody.allowSleep = true;
        this.vehicle.chassisBody.velocity.set(0, 0, 0);
        this.vehicle.chassisBody.angularVelocity.set(0, 0, 0);
        this.vehicle.chassisBody.force.set(0, 0, 0);
        this.vehicle.chassisBody.torque.set(0, 0, 0);
        this.vehicle.chassisBody.position.set(x, y, z);
        this.vehicle.chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
    }

    EngageTrailer(trailer) {
        const moving = this.isMoving() !== 0 || Math.abs(this.GetSpeed()) > 0.08;
        if (moving) {
            const msg = this.parkingBrakeOn
                ? "⚠ Cannot (un)hitch while moving"
                : "⚠ Stop the truck and lock the parking brake to (un)hitch";
            this.showWarning(msg, {
                group: 'trailer-moving',
                invalidates: ['trailer-error', 'trailer-park-brake']
            });
            return;
        }
        if (!this.parkingBrakeOn) {
            this.showWarning("⚠ Lock the parking brake to (un)hitch the trailer", {
                group: 'trailer-park-brake',
                invalidates: ['trailer-error', 'trailer-moving']
            });
            return;
        }
        if (this.trailer) {
            if (this.UnhitchTrailer()) {
                this._kingPinInFifthWheel = true;
                if (this.engineSound) this.engineSound.triggerTrailerHitch();
                this.showinfo("Trailer successfully unhitched", {
                    group: 'trailer-state',
                    invalidates: ['trailer-error', 'trailer-moving', 'trailer-park-brake']
                });
            }
            return;
        }
        const fifthWheelPosition = new CANNON.Vec3();
        this.vehicle.chassisBody.pointToWorldFrame(this.fifthWheelPoint, fifthWheelPosition);
        const distance = fifthWheelPosition.distanceTo(trailer.GetkingPinWorldPosition());
        if (distance > 0.2) {
            this.showWarning("⚠ Failed to hitch: Fifth wheel not engaged", {
                group: 'trailer-error',
                invalidates: ['trailer-moving', 'trailer-park-brake']
            });
            return;
        }
        this.constraint = new CANNON.ConeTwistConstraint(this.vehicle.chassisBody, trailer.vehicle.chassisBody, {
            pivotA: this.fifthWheelPoint,
            pivotB: trailer.GetkingPin(),
            axisA: CANNON.Vec3.UNIT_Y,
            axisB: CANNON.Vec3.UNIT_Y,
            angle: Math.PI / 10,
            twistAngle: Math.PI / 1.5,
            collideConnected: false
        });
        this.params.world.addConstraint(this.constraint);
        trailer.Engage();
        this.trailer = trailer;
        this._kingPinInFifthWheel = true;
        if (this.engineSound) this.engineSound.triggerTrailerHitch();
        this.showinfo("Trailer successfully hitched", {
            group: 'trailer-state',
            invalidates: ['trailer-error', 'trailer-moving', 'trailer-park-brake']
        });
    }

    UnhitchTrailer() {
        if (!this.trailer) return false;
        this.trailer.Engage();
        this.trailer.setParkingBrake(true);
        this.trailer = null;
        this.params.world.removeConstraint(this.constraint);
        this.constraint = null;
        return true;
    }

    HasTrailer() {
        return this.trailer !== null;
    }

    Update(deltaTime) {
        if (this.frozen) {
            for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
                this.vehicle.wheelInfos[i].deltaRotation = 0;
            }
            return;
        }
        if (this._crankTimer > 0) {
            if (this._crankEndMs > 0) {
                this.isEngineStarting();
            } else {
                const dtClamped = Math.min(0.05, Math.max(0.0, deltaTime || 1 / 60));
                this._crankTimer = Math.max(0.0, this._crankTimer - dtClamped);
            }
        }
        this.chassisMesh.position.copy(this.vehicle.chassisBody.position);
        this.chassisMesh.quaternion.copy(this.vehicle.chassisBody.quaternion);
        for (let i = 0; i < this.wheelMeshes.length; i++) {
            this.vehicle.updateWheelTransform(i);
            this.wheelMeshes[i].position.copy(this.vehicle.wheelInfos[i].worldTransform.position);
            this.wheelMeshes[i].quaternion.copy(this.vehicle.wheelInfos[i].worldTransform.quaternion);
        }

        const movingDir = this.isMoving();
        this.setReverseLights(Boolean(this.reverseThrottle) || movingDir < 0);
        if (this._notifications.length > 0 && movingDir === 0) {
            this.invalidateNotifications('trailer-moving', 800);
        }

        // Detecta a entrada física do pino-rei na garganta da quinta roda durante a ré (porta de casa batendo)
        if (this.HasTrailer()) {
            this._kingPinInFifthWheel = true;
        } else if (this.worldTrailer && !this.worldTrailer.frozen) {
            this.vehicle.chassisBody.pointToWorldFrame(this.fifthWheelPoint, this._tmpFifthWheelWorld);
            const kingPinWorld = this.worldTrailer.GetkingPinWorldPosition();
            const dist = this._tmpFifthWheelWorld.distanceTo(kingPinWorld);
            if (!this._kingPinInFifthWheel && dist <= 0.20) {
                this._kingPinInFifthWheel = true;
                const tv = this.vehicle.chassisBody.velocity;
                const trv = this.worldTrailer.vehicle.chassisBody.velocity;
                const dvx = tv.x - trv.x;
                const dvy = tv.y - trv.y;
                const dvz = tv.z - trv.z;
                const relSpeed = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
                const intensity = Math.max(0.65, Math.min(1.25, 0.58 + 0.38 * relSpeed));
                if (this.engineSound) {
                    this.engineSound.triggerFifthWheelCouple(intensity);
                }
                this.invalidateNotifications('trailer-error');
            } else if (this._kingPinInFifthWheel && dist > 0.42) {
                this._kingPinInFifthWheel = false;
            }
        }

        const currentSpeedMs = this.GetSpeed();
        if (this.engineSound) {
            this.engineSound.update(deltaTime, {
                speedMs: currentSpeedMs,
                throttle: this.currentThrottle,
                brake: this.currentBrake,
                parkingBrakeOn: Boolean(this.parkingBrakeOn),
                hasTrailer: this.HasTrailer()
            });
        }

        const speedKmh = Math.floor(Math.abs(currentSpeedMs) * 3.6);
        if (speedKmh !== this.lastSpeedKmh) {
            this.lastSpeedKmh = speedKmh;
            this.params.speedometer.innerText = `${speedKmh} km/h`;
        }
    }
}
