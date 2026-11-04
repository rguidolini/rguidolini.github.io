import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeStaticByMaterial } from './mesh_baker.js';

// Cache de geometrias e materiais para evitar recriação nas 18 rodas da cena
let cachedSingleWheel = null;
let cachedDoubleWheel = null;

export class TireWheelSet {
    constructor(right, single) {
        this.outerRadius = 0.52;
        this.innerRadius = 0.29;
        this.tireWidth = 0.32;
        this.treadWidth = 0.25;
        this.treadThickness = 0.02;

        if (!TireWheelSet.materials) {
            TireWheelSet.materials = {
                tire: new THREE.MeshStandardMaterial({
                    color: 0x111111,
                    roughness: 0.9,
                    metalness: 0.0
                }),
                wheel: new THREE.MeshStandardMaterial({
                    color: 0xeef2f6,
                    metalness: 0.92,
                    roughness: 0.14,
                    side: THREE.DoubleSide
                }),
                bolt: new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    metalness: 0.98,
                    roughness: 0.08
                }),
                hubcap: new THREE.MeshStandardMaterial({
                    color: 0x1a1a1a,
                    metalness: 0.2,
                    roughness: 0.7,
                    side: THREE.DoubleSide
                }),
                newHubcap: new THREE.MeshStandardMaterial({
                    color: 0x99080c,
                    metalness: 0.65,
                    roughness: 0.25,
                })
            };
        }

        const tireMaterial = TireWheelSet.materials.tire;
        this.newHubcapMaterial = TireWheelSet.materials.newHubcap;

        this.visual = new THREE.Group();

        if (single) {
            if (!cachedSingleWheel) {
                cachedSingleWheel = this.CreateSet(true, tireMaterial);
                // Desempenho: 1 malha por material em vez de ~14 peças por roda
                bakeStaticByMaterial(cachedSingleWheel);
            }
            this.visual.add(cachedSingleWheel.clone());
        } else {
            if (!cachedDoubleWheel) {
                const doubleGroup = new THREE.Group();
                const baseSet = this.CreateSet(false, tireMaterial);
                const outer = baseSet.clone();
                const inner = baseSet.clone();
                outer.rotation.z = Math.PI;
                inner.position.y = -this.tireWidth;
                doubleGroup.add(outer);
                doubleGroup.add(inner);
                bakeStaticByMaterial(doubleGroup);
                cachedDoubleWheel = doubleGroup;
            }
            this.visual.add(cachedDoubleWheel.clone());
        }

        if (right) {
            this.visual.rotation.z = Math.PI / 2;
        } else {
            this.visual.rotation.z = -Math.PI / 2;
        }

        const wrapper = new THREE.Group();
        wrapper.add(this.visual);
        this.visual = wrapper;
    }

    CreateSet(withHubCap, tireMaterial) {
        const group = new THREE.Group();
        group.add(this.CreateTreads(tireMaterial));
        group.add(this.CreateTire(tireMaterial));
        group.add(this.CreateWheel(withHubCap));
        return group;
    }

    CreateTire(tireMaterial) {
        const tireProfile = new THREE.Shape();
        const baseOuterRadius = this.outerRadius - this.treadThickness;
        tireProfile.moveTo(this.innerRadius, -this.tireWidth / 2);
        tireProfile.quadraticCurveTo(baseOuterRadius - 0.1, -this.tireWidth / 2, baseOuterRadius, -this.treadWidth / 2);
        tireProfile.lineTo(baseOuterRadius, this.treadWidth / 2);
        tireProfile.quadraticCurveTo(baseOuterRadius - 0.1, this.tireWidth / 2, this.innerRadius, this.tireWidth / 2);
        tireProfile.lineTo(this.innerRadius, -this.tireWidth / 2);

        const tireGeometry = new THREE.LatheGeometry(tireProfile.getPoints(8), 24);
        const tireMesh = new THREE.Mesh(tireGeometry, tireMaterial);
        tireMesh.castShadow = true;
        tireMesh.receiveShadow = true;
        return tireMesh;
    }

    CreateTreads(tireMaterial) {
        const blockWidth = 0.05;
        const blockLength = 0.05;

        const treadBlockGeometry = new THREE.BoxGeometry(this.treadThickness, blockWidth, blockLength);
        const mergedBlocks = [];

        const numSegments = 48;
        const numRows = 4;
        const rowSpacing = this.treadWidth / numRows;

        const placementGroup = new THREE.Group();
        const column = new THREE.Object3D();
        column.position.x = this.outerRadius - this.treadThickness / 2;
        placementGroup.add(column);
        const blockDummy = new THREE.Object3D();
        column.add(blockDummy);

        for (let i = 0; i < numSegments; i++) {
            const angle = (i / numSegments) * Math.PI * 2;
            const zigZagAngle = (i % 2 === 0) ? -Math.PI / 24 : Math.PI / 24;
            placementGroup.rotation.y = angle;

            for (let j = 0; j < numRows; j++) {
                const yPos = (j * rowSpacing) - (this.treadWidth / 2) + (rowSpacing / 2);
                blockDummy.position.y = yPos;
                blockDummy.rotation.x = zigZagAngle;
                placementGroup.updateMatrixWorld(true);

                const geom = treadBlockGeometry.clone();
                geom.applyMatrix4(blockDummy.matrixWorld);
                mergedBlocks.push(geom);
            }
        }

        const mergedTreadGeometry = BufferGeometryUtils.mergeGeometries(mergedBlocks);
        treadBlockGeometry.dispose();
        mergedBlocks.forEach(g => g.dispose());

        const treadMesh = new THREE.Mesh(mergedTreadGeometry, tireMaterial);
        // O pneu base (CreateTire) já projeta a sombra circular; desativar nos cravos economiza milhares de vértices no Shadow Map
        treadMesh.castShadow = false;
        treadMesh.receiveShadow = true;
        return treadMesh;
    }

    CreateWheel(withHubCap) {
        const wheelParts = new THREE.Group();
        const wheelMaterial = TireWheelSet.materials.wheel;

        // Parte 1: Cilindro oco para o aro
        const rimOuterRadius = this.innerRadius;
        const rimWallThickness = 0.02;
        const rimInnerRadius = rimOuterRadius - rimWallThickness;
        const rimHeight = this.tireWidth - 0.03;

        const rimShape = new THREE.Shape();
        rimShape.absarc(0, 0, rimOuterRadius, 0, Math.PI * 2, false);

        const rimHolePath = new THREE.Path();
        rimHolePath.absarc(0, 0, rimInnerRadius, 0, Math.PI * 2, true);
        rimShape.holes.push(rimHolePath);

        const extrudeSettings = {
            steps: 1,
            depth: rimHeight,
            bevelEnabled: true,
            bevelThickness: 0.01,
            bevelSize: 0.01,
            bevelSegments: 1,
            curveSegments: 16
        };

        const rimGeometry = new THREE.ExtrudeGeometry(rimShape, extrudeSettings);
        const rim = new THREE.Mesh(rimGeometry, wheelMaterial);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = rimHeight / 2;
        rim.receiveShadow = true;
        wheelParts.add(rim);

        // Parte 2: Disco central plano
        const dishFaceY = this.tireWidth / 2;
        const centralDiscOuterRadius = this.innerRadius * 0.7;
        const centralDiscInnerRadius = centralDiscOuterRadius * 0.63;
        const centralDiscGeometry = new THREE.RingGeometry(centralDiscInnerRadius, centralDiscOuterRadius, 24);
        const centralDisc = new THREE.Mesh(centralDiscGeometry, wheelMaterial);
        centralDisc.rotation.x = -Math.PI / 2;
        centralDisc.position.y = dishFaceY;
        centralDisc.receiveShadow = true;
        wheelParts.add(centralDisc);

        // Parte 3: Cone lateral
        const coneHeight = dishFaceY;
        const coneGeometry = new THREE.CylinderGeometry(centralDiscOuterRadius, rimInnerRadius, coneHeight, 24, 1, true);
        const cone = new THREE.Mesh(coneGeometry, wheelMaterial);
        cone.position.y = coneHeight / 2;
        cone.receiveShadow = true;
        wheelParts.add(cone);

        // Parte 4: Cabeças dos parafusos (mescladas)
        const boltHeadRadius = 0.017;
        const boltHeadHeight = 0.032;
        const boltHeadGeometry = new THREE.CylinderGeometry(boltHeadRadius * 0.85, boltHeadRadius, boltHeadHeight, 6);
        const boltMaterial = TireWheelSet.materials.bolt;
        const numBolts = 10;
        const boltsCircleRadius = (centralDiscOuterRadius + centralDiscInnerRadius) / 2;
        const boltGeometries = [];

        for (let i = 0; i < numBolts; i++) {
            const angle = (i / numBolts) * Math.PI * 2;
            const x = Math.cos(angle) * boltsCircleRadius;
            const z = Math.sin(angle) * boltsCircleRadius;
            const g = boltHeadGeometry.clone();
            g.translate(x, dishFaceY, z);
            boltGeometries.push(g);
        }
        const mergedBoltsGeo = BufferGeometryUtils.mergeGeometries(boltGeometries);
        boltHeadGeometry.dispose();
        boltGeometries.forEach(g => g.dispose());

        const boltsMesh = new THREE.Mesh(mergedBoltsGeo, boltMaterial);
        boltsMesh.receiveShadow = true;
        wheelParts.add(boltsMesh);

        // Parte 5: Calota central preta
        if (withHubCap) {
            const hubcapRadius = centralDiscInnerRadius;
            const hubcapGeometry = new THREE.SphereGeometry(hubcapRadius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
            const hubcap = new THREE.Mesh(hubcapGeometry, TireWheelSet.materials.hubcap);
            hubcap.position.y = dishFaceY;
            hubcap.rotation.x = Math.PI;
            hubcap.receiveShadow = true;
            wheelParts.add(hubcap);

            // **NOVO** Parte 6: Nova calota convexa vermelha
            const newHubcapRadius = hubcapRadius / 2;
            const newHubcapGeometry = new THREE.SphereGeometry(newHubcapRadius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);

            const newHubcap = new THREE.Mesh(newHubcapGeometry, this.newHubcapMaterial);
            newHubcap.position.y = dishFaceY - newHubcapRadius + boltHeadHeight;
            newHubcap.receiveShadow = true;
            wheelParts.add(newHubcap);
        } else {
            const cube = new THREE.CylinderGeometry(centralDiscInnerRadius, centralDiscInnerRadius, this.tireWidth * 0.75, 16);
            const cubeMesh = new THREE.Mesh(cube, this.newHubcapMaterial);
            cubeMesh.position.y = dishFaceY * 0.25;
            cubeMesh.receiveShadow = true;
            wheelParts.add(cubeMesh);
        }

        return wheelParts;
    }

    Visual() {
        return this.visual;
    }
}
