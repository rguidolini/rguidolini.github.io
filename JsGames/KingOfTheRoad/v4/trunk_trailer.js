import * as THREE from 'three';
import { TireWheelSet } from './wheel.js';
import { TrunkTrailerVisual } from './trunk_trailer_visual.js';

export class TrunkTrailer {
    constructor() {
        this.vehicle;
        this.chassisMesh;
        this.wheelMeshes = [];

        // 1. Física do Veículo
        const width = 2.43;
        const length = 15.0;
        const height = 3;

        const axle1Z = -length / 2 + 2;
        const axle2Z = axle1Z + 1.2;

        const chassisBody = new CANNON.Body({
            mass: 3000,
            linearDamping: 0.05
        });
        const chassisShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, length / 2));
        chassisBody.addShape(chassisShape);

        const legH = 1.5;
        const legW = 0.15;
        const legX = 0.8 / 2 + legW / 2 + 0.1;
        const legY = -height / 2 - legH / 2;
        const legZ = length / 2 - 4;
        const legLeft = new CANNON.Box(new CANNON.Vec3(legW / 2, legH / 2, legW / 2));
        chassisBody.addShape(legLeft, new CANNON.Vec3(legX, legY, legZ));
        const legRight = new CANNON.Box(new CANNON.Vec3(legW / 2, legH / 2, legW / 2));
        chassisBody.addShape(legRight, new CANNON.Vec3(-legX, legY, legZ));

        this.vehicle = new CANNON.RaycastVehicle({
            chassisBody: chassisBody,
            indexRightAxis: 0,
            indexUpAxis: 1,
            indexForwardAxis: 2,
        });

        // Modelo Visual do Caminhao
        // Physics and Visual for Wheels
        const axle1 = -length / 2 + 1.5;
        const axle2 = axle1 + 1.2;
        this.chassisMesh = new THREE.Group();
        this.chassisMesh.add(new TrunkTrailerVisual(length, axle1, axle2));
        const axles = [axle1, axle2];
        axles.forEach(axle => {
            ["left", "right"].forEach(side => {
                this._addWheel(axle, side);
            });
        });
    }

    addToWorld(world) {
        this.vehicle.addToWorld(world);
    }

    addToScene(scene) {
        scene.add(this.chassisMesh);
        this.wheelMeshes.forEach(mesh => { scene.add(mesh) });
    }

    _addWheel(posZ, side) {
        const radius = 0.52;
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

        const single = false;
        const rightSide = side === "right";
        const posX = sidePos[side];

        // Phisycs.
        wheelOptions.chassisConnectionPointLocal.set(posX, -2, posZ);
        this.vehicle.addWheel(wheelOptions);

        // Visual.
        this.wheelMeshes.push((new TireWheelSet(rightSide, single)).Visual());
    }

    Reset(x, y, z, angle) {
        this.vehicle.chassisBody.velocity.set(0, 0, 0);
        this.vehicle.chassisBody.angularVelocity.set(0, 0, 0);
        this.vehicle.chassisBody.type = CANNON.Body.DYNAMIC;
        this.vehicle.chassisBody.updateMassProperties();
        this.vehicle.chassisBody.position.set(x, y, z);
        this.vehicle.chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
    }

    setParkingBrake(on) {
        const maxParkingBrakeForce = 50;
        if (on) {
            for (let i = 0; i < this.wheelMeshes.length; i++) {
                this.vehicle.setBrake(maxParkingBrakeForce, i);
            }
        }
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
}