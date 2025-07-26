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


    UpdatePosition(chassisMesh) {
        console.log("UpdatePosition not implemented for", this.id);
    }

    Resize(innerWidth, innerHeight) {
        this.camera.aspect = innerWidth / innerHeight;
        this.camera.updateProjectionMatrix();
    }

    Get() {
        return this.camera;
    }
}


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
        this.cameraRadius = 18;

        const fov = 55;
        const aspect = innerWidth / innerHeight;
        const near = 0.1; // Camera frustum near plane.
        const far = 1000; // Camera frustum far plane.

        this.Init(id, new THREE.PerspectiveCamera(fov, aspect, near, far));
    }


    /**
     * Resets the camera to the Orbit one and at a default position.
     */
    Reset() {
        this.cameraTheta = Math.PI;
        this.cameraPhi = Math.PI / 6;
        this.cameraRadius = 18;
    }

    ResetLeftView() {
        this.cameraTheta = Math.PI / 2;
        this.cameraPhi = Math.PI / 3;
        this.cameraRadius = 18;
    }

    ResetRightView() {
        this.cameraTheta = -Math.PI / 2;
        this.cameraPhi = Math.PI / 3;
        this.cameraRadius = 18;
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
        this.cameraPhi = Math.max(0.1, Math.min(Math.PI / 2, this.cameraPhi));
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }


    /**
     * Updates the camera radius based on mouse wheel movement.
     */
    MouseWheel(e) {
        if (this.staticMode) return;
        this.cameraRadius += e.deltaY * 0.02;
        this.cameraRadius = Math.max(8, Math.min(40, this.cameraRadius));
    }


    /**
     * Updates the camera position based on the truck position.
     */
    UpdatePosition(chassisMesh) {
        const truckPosition = chassisMesh.position;
        const cameraTargetPosition = new THREE.Vector3(
            truckPosition.x +
            this.cameraRadius * Math.sin(this.cameraPhi) * Math.sin(this.cameraTheta),
            truckPosition.y + (this.cameraRadius * Math.cos(this.cameraPhi)) / 2,
            truckPosition.z +
            this.cameraRadius * Math.sin(this.cameraPhi) * Math.cos(this.cameraTheta),
        );
        this.camera.position.lerp(cameraTargetPosition, 0.15);
        this.camera.lookAt(truckPosition);
    }
}


class FixedCamera extends Camera {
    /**
     * Initializes the camera with default values.
     */
    Initialize(id, innerWidth, innerHeight, cameraOffset, lookAtOffset) {
        const fov = 75;
        const aspect = innerWidth / innerHeight;
        const near = 0.1; // Camera frustum near plane.
        const far = 1000; // Camera frustum far plane.
        this.Init(id, new THREE.PerspectiveCamera(fov, aspect, near, far));


        // Camera position: over the hood
        this.cameraOffset = cameraOffset;
        // Ponto para onde a câmera olha (à frente do caminhão)
        this.lookAtOffset = lookAtOffset;
    }


    /**
     * Updates the camera position based on the truck position.
     */
    UpdatePosition(chassisMesh) {
        const cameraPosition = chassisMesh.localToWorld(this.cameraOffset.clone());
        this.camera.position.copy(cameraPosition);
        const lookAtPosition = chassisMesh.localToWorld(this.lookAtOffset.clone());
        this.camera.lookAt(lookAtPosition);
    }
}


export class CameraManager {
    constructor() {
        this.cameras = {};
        this.orbitId = "orbital";
    }


    Initialize(innerWidth, innerHeight) {
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


    AddFixedCamera(id, innerWidth, innerHeight, cameraOffset, lookAtOffset) {
        this.cameras[id] = new FixedCamera();
        this.cameras[id].Initialize(id, innerWidth, innerHeight, cameraOffset, lookAtOffset);
    }


    AddHoodCamera(innerWidth, innerHeight) {
        // Camera position: over the hood
        const cameraOffset = new THREE.Vector3(0, 2.5, 2);
        // Ponto para onde a câmera olha (à frente do caminhão)
        const lookAtOffset = new THREE.Vector3(0, 1, 15);
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
        // Camera position: over the hood
        const cameraOffset = new THREE.Vector3(0, 20, 0);
        // Ponto para onde a câmera olha (à frente do caminhão)
        const lookAtOffset = new THREE.Vector3(0, 0, 0.5);
        this.AddFixedCamera("top", innerWidth, innerHeight, cameraOffset, lookAtOffset);
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
        this.cameras[this.currentCamera].Reset();
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


    UpdatePosition(chassisMesh) {
        this.cameras[this.currentCamera].UpdatePosition(chassisMesh);
    }


    Resize(innerWidth, innerHeight) {
        this.cameras[this.currentCamera].Resize(innerWidth, innerHeight);
    }


    Get() {
        return this.cameras[this.currentCamera].Get();
    }


    GetObject() {
        return this.cameras[this.currentCamera];
    }
}