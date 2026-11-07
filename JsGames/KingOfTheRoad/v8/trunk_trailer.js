import * as THREE from 'three';
import { TireWheelSet } from './wheel.js';
import * as TrunkTrailerFuncs from './trunk_trailer_visual.js';
import { bakeStaticByMaterial } from './mesh_baker.js';

// Massas (kg). Forças de motor/freio e limite da suspensão foram calibradas com 3 t e são escaladas por
// MASS_SCALE para manter a mesma dirigibilidade (aceleração, frenagem e desaceleração) com o peso real.
export const TRUCK_MASS_KG = 8000;
export const TRAILER_MASS_KG = 8000;
export const MASS_SCALE = TRUCK_MASS_KG / 3000;
// Freio de estacionamento: impulso máximo por roda por passo de física (N·s).
export const PARKING_BRAKE_IMPULSE = 50 * MASS_SCALE;

// Posição vertical (y) e inclinação longitudinal (pitch em X) de equilíbrio estático exato no Cannon.js 0.6.2
// sobre o solo em y = 0.0, considerando simultaneamente o apoio dos pés dianteiros (z = +4.50 m, base local y = -2.90 m)
// e a compressão das 4 molas da suspensão traseira (z = -6.00 m e -4.80 m, k = 30 × massa do chassi por roda: no RaycastVehicle a força da mola escala com a massa,
// então este equilíbrio não depende da massa — conferido com 3 t e 8 t).
export const TRAILER_REST_Y = 2.8470685;
export const TRAILER_REST_PITCH = -0.01184814;

export class TrunkTrailer {
    Initialize(params) {
        this.log = 0;
        this.params = params;
        this.vehicle;
        this.chassisMesh;
        this.wheelMeshes = [];
        this.legMeshes = [];
        this.engaged = false;

        // 1. Física do Veículo
        const width = 2.38;
        const length = 15.0;
        const height = 3;

        const chassisBody = new CANNON.Body({
            mass: TRAILER_MASS_KG,
            linearDamping: 0.05,
            material: params.kingPinMaterial,
        });
        const trunkShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, length / 2));
        chassisBody.addShape(trunkShape);

        const chassisH = 0.85;
        const chassisL = length - 3.75;
        const chassisZ = -length / 2 + chassisL / 2;
        const chassisShape = new CANNON.Box(new CANNON.Vec3(width / 2, chassisH / 2, chassisL / 2));
        chassisBody.addShape(chassisShape, new CANNON.Vec3(0, -height / 2 - chassisH / 2, chassisZ));

        const legH = 1.40;
        const legW = 0.15;
        const legX = 0.8 / 2 + legW / 2 + 0.1;
        const legY = -height / 2 - legH / 2;
        const legZ = length / 2 - 3;
        const legLeft = new CANNON.Box(new CANNON.Vec3(legW / 2, legH / 2, legW / 2));
        chassisBody.addShape(legLeft, new CANNON.Vec3(legX, legY, legZ));
        const legRight = new CANNON.Box(new CANNON.Vec3(legW / 2, legH / 2, legW / 2));
        chassisBody.addShape(legRight, new CANNON.Vec3(-legX, legY, legZ));
        this.legMeshes.push(TrunkTrailerFuncs.CreateLegs(legH));
        this.legMeshes.push(TrunkTrailerFuncs.CreateLegs(legH));
        chassisBody.allowSleep = true;
        chassisBody.sleepSpeedLimit = 0.15;

        this.vehicle = new CANNON.RaycastVehicle({
            chassisBody: chassisBody,
            indexRightAxis: 0,
            indexUpAxis: 1,
            indexForwardAxis: 2,
        });
        this.vehicle.addToWorld(this.params.world);

        // Physics and Visual for Wheels
        const axle1 = -length / 2 + 1.5;
        const axle2 = axle1 + 1.2;
        this.chassisMesh = new THREE.Group();
        this.chassisMesh.add(new TrunkTrailerFuncs.TrunkTrailerVisual(length, axle1, axle2));
        bakeStaticByMaterial(this.chassisMesh);  // desempenho: 1 malha por material
        const axles = [axle1, axle2];
        axles.forEach(axle => {
            ["left", "right"].forEach(side => {
                this._addWheel(axle, side);
            });
        });
        this.addToScene(this.params.scene);
        this.setParkingBrake(true);

        const kingZ = length / 2 - 1;
        const kingY = -height / 2 - 0.2;
        this.KingPinPoint = new CANNON.Vec3(0, kingY, kingZ);
        const kingRadius = 0.05;
        const kingH = 0.10 * 2;
        const kingPin = new CANNON.Cylinder(kingRadius, kingRadius, kingH, 16);
        const axis = new CANNON.Vec3(1, 0, 0);
        const quaternion = new CANNON.Quaternion();
        quaternion.setFromAxisAngle(axis, Math.PI / 2);
        chassisBody.addShape(kingPin, new CANNON.Vec3(0, kingY, kingZ), quaternion);

        // Unidade de refrigeração na frente do baú (medida no modelo 3D: z 7.50..7.95, ±0.79 m, y -0.72..1.48)
        const reeferShape = new CANNON.Box(new CANNON.Vec3(0.79, 1.10, 0.225));
        chassisBody.addShape(reeferShape, new CANNON.Vec3(0, 0.38, length / 2 + 0.225));
    }

    addToScene(scene) {
        scene.add(this.chassisMesh);
        this.wheelMeshes.forEach(mesh => { scene.add(mesh) });
        scene.add(this.legMeshes[0]);
        scene.add(this.legMeshes[1]);
    }

    _addWheel(posZ, side) {
        const radius = 0.52;
        const sidePos = {
            "right": -1,
            "left": 1,
        };
        const wheelOptions = {
            radius: radius,
            chassisConnectionPointLocal: new CANNON.Vec3(),
            axleLocal: new CANNON.Vec3(-1, 0, 0),
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: 30,
            suspensionRestLength: 0.3,
            frictionSlip: 1.4,
            dampingRelaxation: 2.3,
            dampingCompression: 4.4,
            maxSuspensionForce: 100000 * MASS_SCALE,
            rollInfluence: 0.01,
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

    Freeze() {
        this.frozen = true;
        this.vehicle.chassisBody.type = CANNON.Body.STATIC;
        this.vehicle.chassisBody.velocity.set(0, 0, 0);
        this.vehicle.chassisBody.angularVelocity.set(0, 0, 0);
        this.vehicle.chassisBody.vlambda.set(0, 0, 0);
        this.vehicle.chassisBody.wlambda.set(0, 0, 0);
        this.vehicle.chassisBody.force.set(0, 0, 0);
        this.vehicle.chassisBody.torque.set(0, 0, 0);
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            this.vehicle.wheelInfos[i].deltaRotation = 0;
        }
    }

    Reset(x, y = TRAILER_REST_Y, z = 0, angle = 0) {
        this.frozen = false;
        if (this.engaged) {
            this.Engage();
        }
        this.setParkingBrake(true);
        const body = this.vehicle.chassisBody;
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        body.vlambda.set(0, 0, 0);
        body.wlambda.set(0, 0, 0);
        body.force.set(0, 0, 0);
        body.torque.set(0, 0, 0);

        const spawnY = (typeof y === 'number' && Number.isFinite(y)) ? y : TRAILER_REST_Y;
        body.position.set(x, spawnY, z);
        if (body.previousPosition) body.previousPosition.copy(body.position);
        if (body.initPosition) body.initPosition.copy(body.position);
        if (body.interpolatedPosition) body.interpolatedPosition.copy(body.position);

        const qYaw = new CANNON.Quaternion();
        qYaw.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
        const qPitch = new CANNON.Quaternion();
        qPitch.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), TRAILER_REST_PITCH);
        qYaw.mult(qPitch, body.quaternion);
        if (body.previousQuaternion) body.previousQuaternion.copy(body.quaternion);
        if (body.initQuaternion) body.initQuaternion.copy(body.quaternion);
        if (body.interpolatedQuaternion) body.interpolatedQuaternion.copy(body.quaternion);

        body.type = CANNON.Body.DYNAMIC;
        body.wakeUp();
        body.allowSleep = true;

        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            const w = this.vehicle.wheelInfos[i];
            w.deltaRotation = 0;
            w.suspensionForce = 0;
            w.suspensionRelativeVelocity = 0;
            w.sliding = false;
            this.vehicle.updateWheelTransform(i);
            this.vehicle.castRay(w);
            this.vehicle.updateWheelTransform(i);
        }
        this.Update();
    }

    Engage() {
        // Retracting/Exteding legs
        const extension = 0.6;
        this.vehicle.chassisBody.allowSleep = this.engaged;
        const moveBy = this.engaged ? -extension : extension;
        this.vehicle.chassisBody.shapeOffsets[2].y += moveBy;
        this.vehicle.chassisBody.shapeOffsets[3].y += moveBy;
        this.engaged = !this.engaged;
    }

    setParkingBrake(isOn) {
        const parkingBrakeForce = PARKING_BRAKE_IMPULSE;
        const force = isOn ? parkingBrakeForce : 0;
        for (let i = 0; i < this.wheelMeshes.length; i++) {
            this.vehicle.setBrake(force, i);
        }
    }

    Update() {
        if (this.frozen) {
            for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
                this.vehicle.wheelInfos[i].deltaRotation = 0;
            }
            return;
        }
        this.chassisMesh.position.copy(this.vehicle.chassisBody.position);
        this.chassisMesh.quaternion.copy(this.vehicle.chassisBody.quaternion);

        const legLeftOffset = this.vehicle.chassisBody.shapeOffsets[2];
        const worldLegLeftOffset = this.vehicle.chassisBody.quaternion.vmult(legLeftOffset);
        this.legMeshes[0].position.copy(this.vehicle.chassisBody.position).add(worldLegLeftOffset);
        this.legMeshes[0].quaternion.copy(this.vehicle.chassisBody.quaternion);

        const legRightOffset = this.vehicle.chassisBody.shapeOffsets[3];
        const worldLegRightOffset = this.vehicle.chassisBody.quaternion.vmult(legRightOffset);
        this.legMeshes[1].position.copy(this.vehicle.chassisBody.position).add(worldLegRightOffset);
        this.legMeshes[1].quaternion.copy(this.vehicle.chassisBody.quaternion);

        for (let i = 0; i < this.wheelMeshes.length; i++) {
            this.vehicle.updateWheelTransform(i);
            this.wheelMeshes[i].position.copy(this.vehicle.wheelInfos[i].worldTransform.position);
            this.wheelMeshes[i].quaternion.copy(this.vehicle.wheelInfos[i].worldTransform.quaternion);
        }
    }

    GetkingPin() {
        return this.KingPinPoint;
    }

    GetkingPinWorldPosition() {
        const position = new CANNON.Vec3();
        this.vehicle.chassisBody.pointToWorldFrame(this.KingPinPoint, position);
        return position;
    }
}