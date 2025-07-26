import * as THREE from 'three';
import { TireWheelSet } from './wheel.js';
import { KenworthW900Visual } from './kenworth_w900_visual.js';

export class KenworthW900 {
    constructor() {
        this.previousDirection = 0;
        this.vehicle;
        this.chassisMesh;
        this.wheelMeshes = [];

        // 1. Física do Veículo
        const chassisBody = new CANNON.Body({
            mass: 3000,
            // linearDamping: 0.05
        });

        const width = 2.30;
        const length = 7.90;
        const height = 0.5;
        const chassisShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, length / 2));
        chassisBody.addShape(chassisShape);

        const cabWidth = width;
        const cabLength = 2 + 1.18 + 1.90;
        const cabHeight = 2.38;
        const cabY = cabHeight / 2 + height / 2;
        const cabZ = length / 2 - cabLength / 2;
        const cabShape = new CANNON.Box(new CANNON.Vec3(cabWidth / 2, cabHeight / 2, cabLength / 2));
        chassisBody.addShape(cabShape, new CANNON.Vec3(0, cabY, cabZ));


        this.vehicle = new CANNON.RaycastVehicle({
            chassisBody: chassisBody,
            indexRightAxis: 0,
            indexUpAxis: 1,
            indexForwardAxis: 2,
        });

        // Modelo Visual do Caminhao
        this.chassisMesh = new THREE.Group();
        // const truckModel = createSimpleTruckModel();
        const truckModel = KenworthW900Visual();
        this.chassisMesh.add(truckModel);

        // Physics and Visual for Wheels
        const axles = ["front", "rear", "truck"];
        axles.forEach(axle => {
            ["left", "right"].forEach(side => {
                this._addWheel(axle, side);
            });
        });
    }

    setSteering(value) {
        const maxSteerVal = -0.9;  // Negative because the vehicle was created on the wrong axis
        this.vehicle.setSteeringValue(value * maxSteerVal, 0);
        this.vehicle.setSteeringValue(value * maxSteerVal, 1);
    }

    setParkingBrake(on) {
        const maxParkingBrakeForce = 50;
        if (on) {
            this.vehicle.setBrake(maxParkingBrakeForce, 0);
            this.vehicle.setBrake(maxParkingBrakeForce, 1);
            this.vehicle.setBrake(maxParkingBrakeForce, 4);
            this.vehicle.setBrake(maxParkingBrakeForce, 5);
        }
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
        const sidePos = {
            "right": -1,
            "left": 1,
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

    addToWorld(world) {
        this.vehicle.addToWorld(world);
    }

    addToScene(scene) {
        scene.add(this.chassisMesh);
        this.wheelMeshes.forEach(mesh => { scene.add(mesh) });
    }

    freeze() {
        this.vehicle.chassisBody.type = CANNON.Body.STATIC;
        this.vehicle.chassisBody.updateMassProperties();
    }

    reset(x, y, z, angle) {
        this.vehicle.chassisBody.velocity.set(0, 0, 0);
        this.vehicle.chassisBody.angularVelocity.set(0, 0, 0);
        this.vehicle.chassisBody.type = CANNON.Body.DYNAMIC;
        this.vehicle.chassisBody.updateMassProperties();
        this.vehicle.chassisBody.position.set(x, y, z);
        this.vehicle.chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
    }

    UpdatePosition() {
        this.chassisMesh.position.copy(this.vehicle.chassisBody.position);
        this.chassisMesh.quaternion.copy(this.vehicle.chassisBody.quaternion);
        for (let i = 0; i < this.wheelMeshes.length; i++) {
            this.vehicle.updateWheelTransform(i);
            this.wheelMeshes[i].position.copy(this.vehicle.wheelInfos[i].worldTransform.position);
            this.wheelMeshes[i].quaternion.copy(this.vehicle.wheelInfos[i].worldTransform.quaternion);
        }
    }

    /**
     * Returns:
     * -1 if car is moving backwards
     * 0 if car is stopped
     * 1 if car is moving forward
     */
    isMoving() {
        const threshold = 0.005;
        // Pick the only wheels that are not used for parking brakes.
        const avgSpeed =
            (this.vehicle.wheelInfos[2].deltaRotation + this.vehicle.wheelInfos[3].deltaRotation) /
            2;


        if (avgSpeed < -threshold) {
            return 1;
        }
        if (avgSpeed > threshold) {
            return -1;
        }
        return 0;
    }
}

function createSimpleTruckModel() {
    const group = new THREE.Group();
    const darkRed = new THREE.MeshStandardMaterial({
        color: 0x8b0000,
        metalness: 0.1,
        roughness: 0.7,
    });
    const chrome = new THREE.MeshStandardMaterial({
        color: 0xc0c0c0,
        metalness: 0.8,
        roughness: 0.2,
    });
    const glass = new THREE.MeshStandardMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.4,
    });


    // Cabine principal, capô, etc.
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.2, 2.4), darkRed);
    cab.position.set(0, 1.2, -0.2);
    cab.castShadow = true;
    group.add(cab);


    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 3), darkRed);
    hood.position.set(0, 0.75, 2.2);
    hood.castShadow = true;
    group.add(hood);


    const grilleMesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 0.1), chrome);
    grilleMesh.position.set(0, 0.8, 3.7);
    group.add(grilleMesh);


    const bumperMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.2), chrome);
    bumperMesh.position.set(0, 0.15, 3.8);
    group.add(bumperMesh);


    const windshieldMesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.1), glass);
    windshieldMesh.position.set(0, 1.6, 0.95);
    group.add(windshieldMesh);


    // Escapamentos e tanques
    [-1.3, 1.3].forEach((x) => {
        const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.5, 12), chrome);
        exhaust.position.set(x, 1.85, -1.5);
        exhaust.castShadow = true;
        group.add(exhaust);
    });
    return group;
}

function CreateSimpleWheel(radius) {
    const wheelGroup = new THREE.Group();

    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const wheelGeometry = new THREE.CylinderGeometry(radius, radius, 0.4, 32);
    wheelGeometry.rotateZ(Math.PI / 2);
    const tireMesh = new THREE.Mesh(wheelGeometry, wheelMaterial);
    tireMesh.castShadow = true;
    wheelGroup.add(tireMesh);

    const indicatorGeometry = new THREE.BoxGeometry(0.5, 0.1, 0.05);
    const indicatorMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const indicatorMesh = new THREE.Mesh(indicatorGeometry, indicatorMaterial);

    indicatorMesh.position.set(0, 0, 0.22); // Deslocado no eixo Z (profundidade da roda)
    wheelGroup.add(indicatorMesh);

    return wheelGroup;
}