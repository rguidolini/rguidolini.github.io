import * as THREE from 'three';

class Camera {
    Init(id, camera) {
        this.id = id;
        this.camera = camera;
    }

    Reset() {
        console.log("Reset not implemented for", this.id);
    }


    MouseDown(e) {
        console.log("MouseDown not implemented for", this.id);
    }


    MouseUp(e) {
        console.log("MouseUp not implemented for", this.id);
    }


    MouseMove(e) {
        console.log("MouseMove not implemented for", this.id);
    }


    MouseWheel(e) {
        console.log("MouseWheel not implemented for", this.id);
    }


    Update(truck) {
        console.log("Update not implemented for", this.id);
    }

    Resize(innerWidth, innerHeight) {
        this.camera.aspect = innerWidth / innerHeight;
        this.camera.updateProjectionMatrix();
    }

    Get() {
        return this.camera;
    }
}


const DEFAULT_ORBITAL_CONFIG = {
    phiMin: 0.02,
    phiMax: Math.PI / 2,
    limitTheta: false,
    thetaMin: -Math.PI,
    thetaMax: Math.PI,
    radiusMin: 6,
    radiusMax: 90,
    targetOffsetX: 0,
    targetOffsetY: 0,
    targetOffsetZ: 0,
    scaleX: 1.0,
    scaleY: 1.0,
    scaleZ: 1.0
};

class OrbitalCamera extends Camera {
    /**
     * Initializes the camera with default values.
     */
    Initialize(id, innerWidth, innerHeight) {
        this.isMouseDown = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        this.cameraTheta = Math.PI / 2;
        this.cameraPhi = Math.PI / 3;
        this.cameraRadius = 36;

        this.currentTheta = this.cameraTheta;
        this.currentPhi = this.cameraPhi;
        this.currentRadius = this.cameraRadius;

        this.config = { ...DEFAULT_ORBITAL_CONFIG };
        this.onUiSync = null;

        const fov = 28;
        const aspect = innerWidth / innerHeight;
        const near = 0.1; // Camera frustum near plane.
        const far = 1000; // Camera frustum far plane.

        this.Init(id, new THREE.PerspectiveCamera(fov, aspect, near, far));
        if (typeof document !== 'undefined') {
            const existing = document.getElementById('camera-tuner-panel');
            if (existing) existing.remove();
        }
    }


    /**
     * Resets the camera to the Orbit one and at a default position.
     */
    Reset() {
        this.cameraTheta = Math.PI;
        this.cameraPhi = Math.PI / 6;
        this.cameraRadius = 36;
        this.clampAngles();
        this.currentTheta = this.cameraTheta;
        this.currentPhi = this.cameraPhi;
        this.currentRadius = this.cameraRadius;
        if (this.onUiSync) this.onUiSync();
    }

    ResetLeftView() {
        this.cameraTheta = Math.PI / 2;
        this.cameraPhi = Math.PI / 3;
        this.cameraRadius = 36;
        this.clampAngles();
        this.currentTheta = this.cameraTheta;
        this.currentPhi = this.cameraPhi;
        this.currentRadius = this.cameraRadius;
        if (this.onUiSync) this.onUiSync();
    }

    ResetRightView() {
        this.cameraTheta = -Math.PI / 2;
        this.cameraPhi = Math.PI / 3;
        this.cameraRadius = 36;
        this.clampAngles();
        this.currentTheta = this.cameraTheta;
        this.currentPhi = this.cameraPhi;
        this.currentRadius = this.cameraRadius;
        if (this.onUiSync) this.onUiSync();
    }

    clampAngles() {
        const minP = Math.min(this.config.phiMin, this.config.phiMax);
        const maxP = Math.max(this.config.phiMin, this.config.phiMax);
        this.cameraPhi = Math.max(minP, Math.min(maxP, this.cameraPhi));

        if (this.config.limitTheta) {
            const minT = Math.min(this.config.thetaMin, this.config.thetaMax);
            const maxT = Math.max(this.config.thetaMin, this.config.thetaMax);
            this.cameraTheta = Math.max(minT, Math.min(maxT, this.cameraTheta));
        }

        const minR = Math.min(this.config.radiusMin, this.config.radiusMax);
        const maxR = Math.max(this.config.radiusMin, this.config.radiusMax);
        this.cameraRadius = Math.max(minR, Math.min(maxR, this.cameraRadius));
    }

    /**
     * Starts moving the camera in response to mouse events.
     */
    MouseDown(e) {
        if (this.staticMode) return;
        this.isMouseDown = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }


    /**
     * Stops moving the camera when the mouse button is released.
     */
    MouseUp(e) {
        if (this.staticMode) return;
        this.isMouseDown = false;
    }


    /**
     * Updates the camera position based on mouse movement.
     */
    MouseMove(e) {
        if (!this.isMouseDown) return;
        this.cameraTheta -= (e.clientX - this.lastMouseX) * 0.005;
        this.cameraPhi -= (e.clientY - this.lastMouseY) * 0.005;
        this.clampAngles();
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        if (this.onUiSync) this.onUiSync();
    }


    /**
     * Updates the camera radius based on mouse wheel movement.
     */
    MouseWheel(e) {
        if (this.staticMode) return;
        this.cameraRadius += e.deltaY * 0.04;
        this.clampAngles();
        if (this.onUiSync) this.onUiSync();
    }


    /**
     * Updates the camera position based on the truck position.
     */
    Update(truck) {
        const chassisMesh = truck.getChassisMesh();
        const localTarget = new THREE.Vector3(
            this.config.targetOffsetX,
            this.config.targetOffsetY,
            this.config.targetOffsetZ
        );
        const targetPosition = chassisMesh.localToWorld(localTarget);

        this.currentTheta += (this.cameraTheta - this.currentTheta) * 0.2;
        this.currentPhi += (this.cameraPhi - this.currentPhi) * 0.2;
        this.currentRadius += (this.cameraRadius - this.currentRadius) * 0.2;

        const safePhi = Math.max(this.config.phiMin, this.currentPhi);

        this.camera.position.set(
            targetPosition.x +
            this.currentRadius * this.config.scaleX * Math.sin(safePhi) * Math.sin(this.currentTheta),
            targetPosition.y +
            this.currentRadius * this.config.scaleY * Math.cos(safePhi),
            targetPosition.z +
            this.currentRadius * this.config.scaleZ * Math.sin(safePhi) * Math.cos(this.currentTheta),
        );
        this.camera.lookAt(targetPosition);
    }
}


class FixedCamera extends Camera {
    /**
     * Initializes the camera with default values.
     */
    Initialize(id, innerWidth, innerHeight, cameraOffset, lookAtOffset, fov = 75) {
        const aspect = innerWidth / innerHeight;
        const near = 0.1; // Camera frustum near plane.
        const far = 1000; // Camera frustum far plane.
        this.Init(id, new THREE.PerspectiveCamera(fov, aspect, near, far));


        // Camera position: over the hood
        this.cameraOffset = cameraOffset;
        // Ponto para onde a câmera olha (à frente do caminhão)
        this.lookAtOffset = lookAtOffset;

        // Estado de transição suave da câmera superior (Câmera 4) ao engatar/desengatar a carreta
        this.lastHasTrailer = null;
        this.currentZShift = 0;
        this.transitionStartZShift = 0;
        this.transitionTargetZShift = 0;
        this.transitionStartTime = 0;
        this.transitionDurationMs = 750; // 0.75s (entre 0.5s e 1.0s)
    }

    Reset(truck) {
        if (this.id === "top" && truck && typeof truck.HasTrailer === "function") {
            const hasTrailer = Boolean(truck.HasTrailer());
            this.lastHasTrailer = hasTrailer;
            this.currentZShift = hasTrailer ? -8 : 0;
            this.transitionStartZShift = this.currentZShift;
            this.transitionTargetZShift = this.currentZShift;
            this.transitionStartTime = 0;
        }
    }


    /**
     * Updates the camera position based on the truck position.
     */
    Update(truck) {
        const chassisMesh = truck.getChassisMesh();
        if (this.id === "top") {
            const forwardXZ = new THREE.Vector3(0, 0, 1).applyQuaternion(chassisMesh.quaternion);
            forwardXZ.y = 0;
            if (forwardXZ.lengthSq() > 1e-6) {
                forwardXZ.normalize();
            } else {
                forwardXZ.set(0, 0, 1);
            }

            const hasTrailer = Boolean(truck.HasTrailer());
            const targetZShift = hasTrailer ? -8 : 0;
            const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

            if (this.lastHasTrailer === null) {
                this.lastHasTrailer = hasTrailer;
                this.currentZShift = targetZShift;
                this.transitionStartZShift = targetZShift;
                this.transitionTargetZShift = targetZShift;
            } else if (hasTrailer !== this.lastHasTrailer) {
                this.lastHasTrailer = hasTrailer;
                this.transitionStartZShift = this.currentZShift;
                this.transitionTargetZShift = targetZShift;
                this.transitionStartTime = now;
            }

            if (this.currentZShift !== this.transitionTargetZShift) {
                const elapsed = Math.max(0, now - this.transitionStartTime);
                const t = Math.min(1, elapsed / this.transitionDurationMs);
                // Ease-in-out suave (smoothstep)
                const eased = t * t * (3 - 2 * t);
                this.currentZShift = THREE.MathUtils.lerp(
                    this.transitionStartZShift,
                    this.transitionTargetZShift,
                    eased
                );
                if (t >= 1) {
                    this.currentZShift = this.transitionTargetZShift;
                }
            }

            const zShift = this.currentZShift;
            const baseX = chassisMesh.position.x + forwardXZ.x * (this.cameraOffset.z + zShift);
            const baseZ = chassisMesh.position.z + forwardXZ.z * (this.cameraOffset.z + zShift);
            const lookDist = this.lookAtOffset.z - this.cameraOffset.z;

            this.camera.position.set(baseX, chassisMesh.position.y + this.cameraOffset.y, baseZ);
            this.camera.lookAt(
                baseX + forwardXZ.x * lookDist,
                chassisMesh.position.y + this.lookAtOffset.y,
                baseZ + forwardXZ.z * lookDist
            );
            return;
        }
        let positionOffset = this.cameraOffset.clone();
        let lookAtOffset = this.lookAtOffset.clone();
        const cameraPosition = chassisMesh.localToWorld(positionOffset);
        this.camera.position.copy(cameraPosition);
        const lookAtPosition = chassisMesh.localToWorld(lookAtOffset);
        this.camera.lookAt(lookAtPosition);
    }
}


export class CameraManager {
    constructor(innerWidth, innerHeight, truck) {
        this.cameras = {};
        this.truck = truck;
        this.orbitId = "orbital";
        this.AddOrbitalCamera(this.orbitId, innerWidth, innerHeight);
        this.AddHoodCamera(innerWidth, innerHeight);
        this.AddRoofCamera(innerWidth, innerHeight);
        this.AddTopCamera(innerWidth, innerHeight);
        this.AddRearCamera(innerWidth, innerHeight);
        this.AddLeftCamera(innerWidth, innerHeight);
        this.AddRightCamera(innerWidth, innerHeight);
        this.currentCamera = this.orbitId;
    }


    AddOrbitalCamera(id, innerWidth, innerHeight) {
        this.cameras[id] = new OrbitalCamera();
        this.cameras[id].Initialize(id, innerWidth, innerHeight);
    }


    AddFixedCamera(id, innerWidth, innerHeight, cameraOffset, lookAtOffset, fov = 75) {
        this.cameras[id] = new FixedCamera();
        this.cameras[id].Initialize(id, innerWidth, innerHeight, cameraOffset, lookAtOffset, fov);
    }


    AddHoodCamera(innerWidth, innerHeight) {
        // Camera position: over the hood
        const cameraOffset = new THREE.Vector3(0, 1.7, 2.8);
        // Ponto para onde a câmera olha (à frente do caminhão)
        const lookAtOffset = new THREE.Vector3(0, 1.2, 15);
        this.AddFixedCamera("hood", innerWidth, innerHeight, cameraOffset, lookAtOffset);
    }

    AddRoofCamera(innerWidth, innerHeight) {
        // Camera position: over the hood
        const cameraOffset = new THREE.Vector3(0, 8, -5);
        // Ponto para onde a câmera olha (à frente do caminhão)
        const lookAtOffset = new THREE.Vector3(0, 0, 15);
        this.AddFixedCamera("roof", innerWidth, innerHeight, cameraOffset, lookAtOffset);
    }

    AddTopCamera(innerWidth, innerHeight) {
        // Camera position: vista superior com FOV=28° e altura compensada (Y=60m) para manter a mesma área visível sem deformar o teto em relação ao chão
        const cameraOffset = new THREE.Vector3(0, 60, 0);
        // Ponto para onde a câmera olha
        const lookAtOffset = new THREE.Vector3(0, 0, 1);
        this.AddFixedCamera("top", innerWidth, innerHeight, cameraOffset, lookAtOffset, 28);
    }

    AddRearCamera(innerWidth, innerHeight) {
        // Camera position: over the hood
        const cameraOffset = new THREE.Vector3(0, 4.5, 0.5);
        // Ponto para onde a câmera olha (à frente do caminhão)
        const lookAtOffset = new THREE.Vector3(0, 0, -15);
        this.AddFixedCamera("rear", innerWidth, innerHeight, cameraOffset, lookAtOffset);
    }


    AddLeftCamera(innerWidth, innerHeight) {
        // Camera position: over the hood
        const cameraOffset = new THREE.Vector3(1.5, 0.4, 1.6);
        // Ponto para onde a câmera olha (à frente do caminhão)
        const lookAtOffset = new THREE.Vector3(0, -2.5, 15);
        this.AddFixedCamera("left", innerWidth, innerHeight, cameraOffset, lookAtOffset);
    }


    AddRightCamera(innerWidth, innerHeight) {
        // Camera position: over the hood
        const cameraOffset = new THREE.Vector3(-1.5, 0.4, 1.6);
        // Ponto para onde a câmera olha (à frente do caminhão)
        const lookAtOffset = new THREE.Vector3(0, -2.5, 15);
        this.AddFixedCamera("right", innerWidth, innerHeight, cameraOffset, lookAtOffset);
    }


    isOrbital() {
        return this.currentCamera == this.orbitId;
    }


    SwitchTo(id) {
        if ((!id) in this.cameras) {
            console.log("Camera not found: ", id);
            return;
        }
        this.currentCamera = id;
        this.Reset();
    }


    Reset() {
        this.cameras[this.currentCamera].Reset(this.truck);
    }


    MouseDown(e) {
        if (!this.isOrbital()) return;
        this.cameras[this.currentCamera].MouseDown(e);
    }


    MouseUp(e) {
        if (!this.isOrbital()) return;
        this.cameras[this.currentCamera].MouseUp(e);
    }


    MouseMove(e) {
        if (!this.isOrbital()) return;
        this.cameras[this.currentCamera].MouseMove(e);
    }


    MouseWheel(e) {
        if (!this.isOrbital()) return;
        this.cameras[this.currentCamera].MouseWheel(e);
    }


    Update() {
        this.cameras[this.currentCamera].Update(this.truck);
    }


    Resize(innerWidth, innerHeight) {
        Object.values(this.cameras).forEach((cam) => cam.Resize(innerWidth, innerHeight));
    }


    Get() {
        return this.cameras[this.currentCamera].Get();
    }


    GetObject() {
        return this.cameras[this.currentCamera];
    }
}
