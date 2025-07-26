import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

export class TireWheelSet {
    constructor(right, single) {
        this.outerRadius = 0.52;
        this.innerRadius = 0.29;
        this.tireWidth = 0.32;
        this.treadWidth = 0.25;
        this.treadThickness = 0.02;

        this.physic = null;
        this.visual = new THREE.Group();

        this.newHubcapMaterial = new THREE.MeshStandardMaterial({
            color: 0xcc0000,
            metalness: 0.6,
            roughness: 0.4,
        });

        if (single) {
            this.visual.add(this.CreateSet(true));
        } else {
            const outer = this.CreateSet(false);
            this.visual.add(outer);
            const inner = this.CreateSet(false);
            this.visual.add(inner);
            outer.rotation.z = Math.PI;
            inner.position.y = -this.tireWidth;
        }

        if (right) {
            this.visual.rotation.z = Math.PI / 2;
        } else {
            this.visual.rotation.z = -Math.PI / 2;
        }
    }

    CreateSet(withHubCap) {
        const group = new THREE.Group();
        group.add(this.CreateTreads());
        group.add(this.CreateTire());
        group.add(this.CreateWheel(withHubCap));
        return group;
    }

    CreateTire() {
        const tireProfile = new THREE.Shape();
        const baseOuterRadius = this.outerRadius - this.treadThickness;
        tireProfile.moveTo(this.innerRadius, -this.tireWidth / 2);
        tireProfile.quadraticCurveTo(baseOuterRadius - 0.1, -this.tireWidth / 2, baseOuterRadius, -this.treadWidth / 2);
        tireProfile.lineTo(baseOuterRadius, this.treadWidth / 2);
        tireProfile.quadraticCurveTo(baseOuterRadius - 0.1, this.tireWidth / 2, this.innerRadius, this.tireWidth / 2);
        tireProfile.lineTo(this.innerRadius, -this.tireWidth / 2);

        const tireGeometry = new THREE.LatheGeometry(tireProfile.getPoints(20), 64);
        const tireMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.9,
            metalness: 0.0
        });
        const tireMesh = new THREE.Mesh(tireGeometry, tireMaterial);
        tireMesh.castShadow = true;
        tireMesh.receiveShadow = true;
        return tireMesh;
    }

    CreateTreads() {
        const blockWidth = 0.05;
        const blockLength = 0.05;

        const treadGroup = new THREE.Group();
        const treadMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.9,
            metalness: 0.0
        });

        const treadBlockGeometry = new THREE.BoxGeometry(this.treadThickness, blockWidth, blockLength);

        const numSegments = 72;
        const numRows = 4;
        const rowSpacing = this.treadWidth / numRows;

        for (let i = 0; i < numSegments; i++) {
            const angle = (i / numSegments) * Math.PI * 2;
            const zigZagAngle = (i % 2 === 0) ? -Math.PI / 24 : Math.PI / 24;
            const column = new THREE.Object3D();

            for (let j = 0; j < numRows; j++) {
                const treadBlock = new THREE.Mesh(treadBlockGeometry, treadMaterial);
                const yPos = (j * rowSpacing) - (this.treadWidth / 2) + (rowSpacing / 2);
                treadBlock.position.y = yPos;
                treadBlock.rotation.x = zigZagAngle;
                treadBlock.castShadow = true;
                column.add(treadBlock);
            }

            column.position.x = this.outerRadius - this.treadThickness / 2;

            const placementGroup = new THREE.Group();
            placementGroup.rotation.y = angle;
            placementGroup.add(column);

            treadGroup.add(placementGroup);
        }
        return treadGroup;
    }

    CreateWheel(withHubCap) {
        const wheelParts = new THREE.Group();
        const wheelMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.5,
            roughness: 0.35,
            side: THREE.DoubleSide
        });

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
            bevelSegments: 2
        };

        const rimGeometry = new THREE.ExtrudeGeometry(rimShape, extrudeSettings);
        const rim = new THREE.Mesh(rimGeometry, wheelMaterial);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = rimHeight / 2;
        rim.castShadow = true;
        rim.receiveShadow = true;
        wheelParts.add(rim);

        // Parte 2: Disco central plano
        const dishFaceY = this.tireWidth / 2;
        const centralDiscOuterRadius = this.innerRadius * 0.7;
        const centralDiscInnerRadius = centralDiscOuterRadius * 0.63;
        const centralDiscGeometry = new THREE.RingGeometry(centralDiscInnerRadius, centralDiscOuterRadius, 64);
        const centralDisc = new THREE.Mesh(centralDiscGeometry, wheelMaterial);
        centralDisc.rotation.x = -Math.PI / 2;
        centralDisc.position.y = dishFaceY;
        centralDisc.castShadow = true;
        centralDisc.receiveShadow = true;
        wheelParts.add(centralDisc);

        // Parte 3: Cone lateral
        const coneHeight = dishFaceY;
        const coneGeometry = new THREE.CylinderGeometry(centralDiscOuterRadius, rimInnerRadius, coneHeight, 64, 1, true);
        const cone = new THREE.Mesh(coneGeometry, wheelMaterial);
        cone.position.y = coneHeight / 2;
        cone.castShadow = true;
        cone.receiveShadow = true;
        wheelParts.add(cone);

        // Parte 4: Cabeças dos parafusos
        const boltHeadRadius = 0.02;
        const boltHeadHeight = 0.03;
        const boltHeadGeometry = new THREE.CylinderGeometry(boltHeadRadius, boltHeadRadius, boltHeadHeight, 6);
        const boltMaterial = new THREE.MeshStandardMaterial({
            color: 0x888888,
            metalness: 0.95,
            roughness: 0.2
        });
        const numBolts = 10;
        const boltsCircleRadius = (centralDiscOuterRadius + centralDiscInnerRadius) / 2;

        for (let i = 0; i < numBolts; i++) {
            const angle = (i / numBolts) * Math.PI * 2;
            const bolt = new THREE.Mesh(boltHeadGeometry, boltMaterial);
            const x = Math.cos(angle) * boltsCircleRadius;
            const z = Math.sin(angle) * boltsCircleRadius;
            bolt.position.set(x, dishFaceY, z);
            bolt.castShadow = true;
            bolt.receiveShadow = true;
            wheelParts.add(bolt);
        }

        // Parte 5: Calota central preta
        if (withHubCap) {
            const hubcapRadius = centralDiscInnerRadius;
            const hubcapGeometry = new THREE.SphereGeometry(hubcapRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
            const hubcapMaterial = new THREE.MeshStandardMaterial({
                color: 0x1a1a1a,
                metalness: 0.0,
                roughness: 1.0,
                side: THREE.DoubleSide
            });
            const hubcap = new THREE.Mesh(hubcapGeometry, hubcapMaterial);
            hubcap.position.y = dishFaceY;
            hubcap.rotation.x = Math.PI;
            hubcap.castShadow = true;
            hubcap.receiveShadow = true;
            wheelParts.add(hubcap);

            // **NOVO** Parte 6: Nova calota convexa vermelha
            const newHubcapRadius = hubcapRadius / 2;
            const newHubcapGeometry = new THREE.SphereGeometry(newHubcapRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);

            const newHubcap = new THREE.Mesh(newHubcapGeometry, this.newHubcapMaterial);
            newHubcap.position.y = dishFaceY - newHubcapRadius + boltHeadHeight;
            newHubcap.castShadow = true;
            newHubcap.receiveShadow = true;
            wheelParts.add(newHubcap);
        } else {
            const cube = new THREE.CylinderGeometry(centralDiscInnerRadius, centralDiscInnerRadius, this.tireWidth*0.75);
            const cubeMesh = new THREE.Mesh(cube, this.newHubcapMaterial);
            cubeMesh.position.y = dishFaceY*0.25;
            cubeMesh.castShadow = true;
            cubeMesh.receiveShadow = true;
            wheelParts.add(cubeMesh);
        }

        return wheelParts;
    }

    Visual() {
        return this.visual;
    }
}
