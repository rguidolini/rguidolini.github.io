import * as THREE from 'three';
import { TireWheelSet } from './wheel.js';
import { KenworthW900Visual } from './kenworth_w900_visual.js';

export class KenworthW900 {
    Initialize(params) {
        this.params = params;
        this.vehicle;
        this.chassisMesh;
        this.wheelMeshes = [];
        this.trailer = null;

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
        this.vehicle.addToWorld(this.params.world);

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
        this.params.scene.add(this.chassisMesh);
        this.wheelMeshes.forEach(mesh => { this.params.scene.add(mesh) });

        this.fifthWheelPoint = new CANNON.Vec3(0, height / 2 + 0.25, -length / 2 + 0.7 + 0.38);
    }

    setSteering(value) {
        const maxSteerVal = -0.6;  // Negative because the vehicle was created on the wrong axis
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
            this.params.brakeIndicator.style.display = "block";
        } else {
            this.params.brakeIndicator.style.display = "none";
        }
        if (this.trailer) {
            this.trailer.setParkingBrake(on);
        }
    }

    /**
    * Controls the vehicle acceleration based on the input.
    * @param {number} powerFraction: a percentage of the acceleration. 1 for forward, -1 for backward.
    * Returns 
    */
    Throttle(powerFraction) {
        const maxForce = -2000;  // The negative values is because the car was crated in the wrong axis
        let force = maxForce * powerFraction;

        for (let i = 2; i < 6; i++) {
            this.vehicle.applyEngineForce(force, i);
        }
    }

    showWarning(message) {
        this.params.alertText.innerText = message;
        this.params.alertOverlay.style.display = 'flex';
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

    freeze() {
        this.vehicle.chassisBody.type = CANNON.Body.STATIC;
        this.vehicle.chassisBody.updateMassProperties();
        if (this.trailer) {
            this.trailer.freeze();
        }
    }

    reset(x, y, z, angle) {
        this.setParkingBrake(true);
        this.UnhitchTrailer();
        this.vehicle.chassisBody.velocity.set(0, 0, 0);
        this.vehicle.chassisBody.angularVelocity.set(0, 0, 0);
        this.vehicle.chassisBody.type = CANNON.Body.DYNAMIC;
        this.vehicle.chassisBody.updateMassProperties();
        this.vehicle.chassisBody.position.set(x, y, z);
        this.vehicle.chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
    }

    EngageTrailer(trailer) {
        if (this.isMoving()) {
            this.showWarning("⚠ Cannot (un)hitch while moving");
            return;
        }
        if (this.trailer) {
            this.UnhitchTrailer();
            return;
        }
        const fifthWheelPosition = new CANNON.Vec3();
        this.vehicle.chassisBody.pointToWorldFrame(this.fifthWheelPoint, fifthWheelPosition);
        const distance = fifthWheelPosition.distanceTo(trailer.GetkingPinWorldPosition());
        if (distance > 1) {
            this.showWarning("⚠ Failed to hitch: Fifth wheel not engaged");
            return;
        }
        this.constraint = new CANNON.ConeTwistConstraint(this.vehicle.chassisBody, trailer.vehicle.chassisBody, {
            pivotA: this.fifthWheelPoint,
            pivotB: trailer.GetkingPin(),
            axisA: CANNON.Vec3.UNIT_Y,
            axisB: CANNON.Vec3.UNIT_Y,
            angle: Math.PI / 10,
            twistAngle: Math.PI / 2,
            collideConnected: false
        });
        this.params.world.addConstraint(this.constraint);
        trailer.Engage();
        this.trailer = trailer;
    }

    UnhitchTrailer() {
        if (!this.trailer) return;
        this.trailer.Engage();
        this.trailer = null;
        this.params.world.removeConstraint(this.constraint);
        this.constraint = null;
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
