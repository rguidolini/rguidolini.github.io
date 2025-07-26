import * as THREE from 'three';
import { RoundedBoxGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/geometries/RoundedBoxGeometry.js';

export function TrunkTrailerVisual(trunkL, axle1Z, axle2Z) {
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xcccccc });
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, metalness: 0.2, roughness: 0.6 });
    const chassisMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
    const reflectorMaterial = new THREE.MeshStandardMaterial({ color: 0xff4500 });
    const silverMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.3 });

    const group = new THREE.Group();
    const parts = {};

    const addPart = (name, object) => {
        object.castShadow = true;
        object.receiveShadow = true;
        group.add(object);
        parts[name] = object;
    };

    const chassiH = 0.20;
    const chassiL = trunkL;
    const chassiW = 0.8;
    const chassiY = 0;
    const chassiZ = 0;
    addPart("Chassi", new THREE.Mesh(new THREE.BoxGeometry(chassiW, chassiH, chassiL), chassisMaterial));
    parts.Chassi.position.y = chassiY;
    parts.Chassi.position.z = chassiZ;

    const trunkH = 3;
    const trunkW = 2.38;
    const trunkY = trunkH / 2 + chassiH / 2;
    const trunkGroup = new THREE.Group();

    const trunk = new THREE.Mesh(new THREE.BoxGeometry(trunkW, trunkH, trunkL), bodyMaterial);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    trunkGroup.add(trunk);
    // Panel lines
    const linesX = trunkW / 2 + 0.005;
    const linesZ = trunkL / 2;
    const topLine = trunkH / 2 - 0.2;
    for (let i = -trunkH / 2 + 0.2; i < topLine; i += 0.2) {
        const pointsSide1 = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-linesX, i, linesZ), new THREE.Vector3(-linesX, i, -linesZ)
        ]);
        trunkGroup.add(new THREE.Line(pointsSide1, lineMaterial));

        const pointsSide2 = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(linesX, i, linesZ), new THREE.Vector3(linesX, i, -linesZ)
        ]);
        trunkGroup.add(new THREE.Line(pointsSide2, lineMaterial));
    }
    // back door
    const topFrame = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-linesX, topLine, -linesZ - 0.005), new THREE.Vector3(linesX, topLine, -linesZ - 0.005)
    ]);
    trunkGroup.add(new THREE.Line(topFrame, lineMaterial));
    const doorLimit = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, trunkH / 2, -linesZ - 0.005), new THREE.Vector3(0, -trunkH / 2, -linesZ - 0.005)
    ]);
    trunkGroup.add(new THREE.Line(doorLimit, lineMaterial));

    addPart("frige", createRefrigerator(trunkW - 0.8, trunkH - 0.8, 0.3));
    parts.frige.position.set(0, trunkH + chassiH / 2 - 0.02, chassiL / 2 + 0.1);

    const numReflectors = 8;
    const reflectorsDist = trunkL / numReflectors;
    const reflectorGeo = new THREE.BoxGeometry(0.05, 0.10, 0.3);
    for (let i = 0; i < numReflectors; i += 1) {
        const reflectorR = new THREE.Mesh(reflectorGeo, reflectorMaterial);
        reflectorR.position.set(-trunkW / 2, -trunkH / 2 + 0.1, -trunkL / 2 + reflectorsDist / 2 + i * reflectorsDist);
        trunkGroup.add(reflectorR);

        const reflectorL = reflectorR.clone();
        reflectorL.position.x = trunkW / 2;
        trunkGroup.add(reflectorL);
    }
    addPart("trunk", trunkGroup);
    parts.trunk.position.y = trunkY;

    addPart("doorLockL", createDoorLockAssembly(silverMaterial, trunkH));
    parts.doorLockL.position.set(0.15, trunkY, -chassiL / 2 - 0.05);
    addPart("doorLockR", createDoorLockAssembly(silverMaterial, trunkH));
    parts.doorLockR.rotation.y = Math.PI;
    parts.doorLockR.position.set(-0.15, trunkY, -chassiL / 2 - 0.05);

    const bumperHeight = 0.85;
    addPart("bumper", createRearBumper(trunkW, bumperHeight, chassisMaterial));
    parts.bumper.position.z = -trunkL / 2;
    parts.bumper.position.y = chassiH / 2;

    addPart("sideProtectionR", createSideProtections(chassiL - 7.5, bumperHeight, chassisMaterial));
    parts.sideProtectionR.position.x = -trunkW / 2;
    parts.sideProtectionR.position.y = chassiH / 2;
    addPart("sideProtectionL", parts.sideProtectionR.clone());
    parts.sideProtectionL.position.x = trunkW / 2;
    parts.sideProtectionL.rotateY(Math.PI);


    const axleY = -0.7;
    const suspensionH = 0.7;
    addPart("suspension1", createWheelBogey(chassisMaterial, trunkW - 1.2, suspensionH));
    parts.suspension1.position.set(0, axleY, axle1Z);
    addPart("suspension2", createWheelBogey(chassisMaterial, trunkW - 1.2, suspensionH));
    parts.suspension2.position.set(0, axleY, axle2Z);

    const kingRadius = 0.05;
    const kingH = 0.10;
    const kingY = -chassiH / 2 - kingH / 2;
    const kingZ = chassiL / 2 - 1;
    const crownH = 0.03;
    const kingGroup = new THREE.Group();
    kingGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(kingRadius, kingRadius, kingH), chassisMaterial));
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(kingRadius + 0.01, kingRadius + 0.01, 0.02), chassisMaterial);
    crown.position.y = -kingH / 2 - crownH / 2;
    kingGroup.add(crown);
    addPart("KingPin", kingGroup);
    parts.KingPin.position.set(0, kingY, kingZ);

    const wrapper = new THREE.Group();
    wrapper.add(group);
    group.position.y = - trunkH / 2 - chassiH / 2;
    return wrapper;
}


export function CreateLegs(legL) {
    const chassisMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
    const legW = 0.15;
    const legGroup = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(legW, legL, legW);
    const legMesh = new THREE.Mesh(legGeo, chassisMaterial);
    legMesh.castShadow = true;
    legGroup.add(legMesh);
    const legBaseGeo = new THREE.BoxGeometry(legW + 0.1, 0.04, legW + 0.1);
    const legBase = new THREE.Mesh(legBaseGeo, chassisMaterial);
    legBase.castShadow = true;
    legBase.position.y = -legL / 2 + 0.02;
    legGroup.add(legBase);
    return legGroup;
}


function createRearBumper(width, height, bumperMaterial) {
    const bumperGroup = new THREE.Group();
    const redLightMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x880000, roughness: 0.4 });
    const bumperHeigth = 0.15;

    const verticalSupportGeo = new THREE.BoxGeometry(0.15, height, 0.2);
    const supportL = new THREE.Mesh(verticalSupportGeo, bumperMaterial);
    const supportX = width / 2 - width / 4;
    supportL.castShadow = true;
    supportL.position.x = -supportX;
    supportL.position.y = -height / 2;
    supportL.position.z = 0.1;
    bumperGroup.add(supportL);

    const supportR = supportL.clone();
    supportR.position.x = supportX;
    bumperGroup.add(supportR);

    const topWidth = width - 0.2;
    const topHorizontalBarGeo = new THREE.BoxGeometry(topWidth, bumperHeigth, 0.10);
    const topHorizontalBar = new THREE.Mesh(topHorizontalBarGeo, bumperMaterial);
    topHorizontalBar.castShadow = true;
    topHorizontalBar.position.y = -bumperHeigth / 2;
    bumperGroup.add(topHorizontalBar);

    const horizontalBarGeo = new THREE.BoxGeometry(width, bumperHeigth, 0.10);
    const horizontalBar = new THREE.Mesh(horizontalBarGeo, bumperMaterial);
    horizontalBar.castShadow = true;
    horizontalBar.position.y = -height + bumperHeigth / 2;
    bumperGroup.add(horizontalBar);

    // Light Clusters
    const lightGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16);
    lightGeo.rotateX(Math.PI / 2);
    [-topWidth / 2 + 0.1, -topWidth / 2 + 0.3, topWidth / 2 - 0.1, topWidth / 2 - 0.3].forEach(xPos => {
        [-0.35, 0, 0.35].forEach(yPos => {
            const light = new THREE.Mesh(lightGeo, redLightMaterial);
            light.position.set(xPos, -bumperHeigth / 2, -0.05);
            bumperGroup.add(light);
        });
    });
    bumperGroup.position.z = 0.05;
    const wrapper = new THREE.Group();
    wrapper.add(bumperGroup);
    return wrapper;
}


function createDoorLockAssembly(silverMaterial, height) {
    const lockGroup = new THREE.Group();

    const barGeo = new THREE.CylinderGeometry(0.025, 0.025, height, 8);
    const bar = new THREE.Mesh(barGeo, silverMaterial);
    bar.castShadow = true;
    lockGroup.add(bar);

    // Handle
    const handleGroup = new THREE.Group();
    const handleBarGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6);
    const handleBar = new THREE.Mesh(handleBarGeo, silverMaterial);
    handleBar.rotation.z = Math.PI / 2;
    handleBar.position.x = 0.25;
    handleGroup.add(handleBar);
    const handleMountGeo = new THREE.BoxGeometry(0.1, 0.2, 0.1);
    const handleMount = new THREE.Mesh(handleMountGeo, silverMaterial);
    handleGroup.add(handleMount);
    handleGroup.position.y = -height / 4 + 0.2; // Position handle lower down
    lockGroup.add(handleGroup);

    // Keepers/Mounts
    const keeperGeo = new THREE.BoxGeometry(0.13, 0.20, 0.10);
    let posY = height / 3;
    for (let i = 0; i < 3; i += 1) {
        const keeper = new THREE.Mesh(keeperGeo, silverMaterial);
        keeper.position.y = -height / 2 + (height / 3) / 2 + i * posY;
        lockGroup.add(keeper);

    }
    return lockGroup;
}

function createWheelBogey(bogeyMaterial, width, height) {
    const bogeyGroup = new THREE.Group();
    const airbagMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

    const wheelGroup = CreateSuspension(width);
    bogeyGroup.add(wheelGroup);

    [{ z: width / 2 - 0.2 }, { z: -width / 2 + 0.2 }].forEach(pos => {
        const airbagGeo = new THREE.CylinderGeometry(0.25, 0.25, height, 20);
        const airbag = new THREE.Mesh(airbagGeo, airbagMaterial);
        airbag.position.z = pos.z;
        airbag.position.y = height / 2;
        airbag.castShadow = true;
        bogeyGroup.add(airbag);

        const armGeo = new THREE.BoxGeometry(1.2, 0.2, 0.2);
        const arm = new THREE.Mesh(armGeo, bogeyMaterial);
        arm.position.set(0, 0, pos.z);
        arm.castShadow = true;
        bogeyGroup.add(arm);
    });
    bogeyGroup.rotation.y = Math.PI / 2;
    return bogeyGroup;
}

function CreateSuspension(width) {
    const group = new THREE.Group();
    const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    const axleMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });

    const axleGeo = new THREE.CylinderGeometry(0.1, 0.1, width, 8);
    const axle = new THREE.Mesh(axleGeo, axleMaterial);
    axle.rotation.x = Math.PI / 2;
    axle.castShadow = true;
    group.add(axle);

    const rimGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.6, 24);
    rimGeo.rotateX(Math.PI / 2);
    return group;
}


function createRefrigerator(width, height, length) {
    const refrigeratorGroup = new THREE.Group();

    const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4, metalness: 0.1 });
    const darkGreyMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });
    const blackPlasticMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
    const logoBlueMaterial = new THREE.MeshStandardMaterial({ color: 0x005daa, roughness: 0.5 });

    const mainBodyRadius = 0.1;
    const mainBodyGeom = new RoundedBoxGeometry(width, height, length * 2, 6, mainBodyRadius); // width, height, depth, segments, radius
    const mainBody = new THREE.Mesh(mainBodyGeom, whiteMaterial);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    mainBody.position.y = -height / 2;
    refrigeratorGroup.add(mainBody);

    const panelRadius = 0.01;
    const panelSegments = 4;
    const panelWidth = width / 2 - 0.2;
    const panelLenght = 0.02;
    const frontPanelGeom = new RoundedBoxGeometry(panelWidth, panelWidth, panelLenght * 2, panelSegments, panelRadius);
    const frontPanel1 = new THREE.Mesh(frontPanelGeom, whiteMaterial);
    frontPanel1.castShadow = true;

    const panelX = panelWidth / 2;
    const panelY = -height + panelWidth / 2 + mainBodyRadius;
    frontPanel1.position.set(panelX, panelY, length);
    refrigeratorGroup.add(frontPanel1);
    const frontPanel2 = frontPanel1.clone();
    frontPanel2.position.x = -panelX;
    refrigeratorGroup.add(frontPanel2);

    function createVentGrill(side) {
        const grillGroup = new THREE.Group();
        const grillBackGeom = new THREE.BoxGeometry(0.4, 1.1, 0.05);
        const grillBack = new THREE.Mesh(grillBackGeom, blackPlasticMaterial);
        grillBack.position.z = -0.04;
        grillGroup.add(grillBack);

        const barGeom = new THREE.BoxGeometry(0.35, 0.025, 0.02);
        for (let i = 0; i < 20; i++) {
            const bar = new THREE.Mesh(barGeom, darkGreyMaterial);
            bar.position.y = 0.47 - (i * 0.05);
            bar.castShadow = true;
            grillGroup.add(bar);
        }
        grillGroup.position.set(side * 0.40, -0.9, 0.35);
        return grillGroup;
    }
    refrigeratorGroup.add(createVentGrill(1)); // Direita
    refrigeratorGroup.add(createVentGrill(-1)); // Esquerda

    // Logo "T"
    const tLogoGroup = new THREE.Group();
    const tBarVerticalGeom = new THREE.BoxGeometry(0.05, 0.25, 0.05);
    const tBarVertical = new THREE.Mesh(tBarVerticalGeom, logoBlueMaterial);
    tLogoGroup.add(tBarVertical);
    const tBarHorizontalGeom = new THREE.BoxGeometry(0.2, 0.05, 0.05);
    const tBarHorizontal = new THREE.Mesh(tBarHorizontalGeom, logoBlueMaterial);
    tBarHorizontal.position.y = 0.1;
    tLogoGroup.add(tBarHorizontal);
    tLogoGroup.position.set(0, -0.6, 0.33);
    refrigeratorGroup.add(tLogoGroup);

    // Bloco de texto "THERMO KING"
    const textBlockGeom = new THREE.BoxGeometry(0.9, 0.07, 0.02);
    const textBlock = new THREE.Mesh(textBlockGeom, darkGreyMaterial);
    textBlock.position.set(0, -0.20, 0.3);
    refrigeratorGroup.add(textBlock);

    return refrigeratorGroup;
}


function createSideProtections(length, height, protectionMaterial) {
    const protectionGroup = new THREE.Group();
    const barWidth = 0.15;
    const barThick = 0.05;
    const numSupports = 4;

    const horizontalBarGeo = new THREE.BoxGeometry(barThick, barWidth, length);
    const horizontalBottonBar = new THREE.Mesh(horizontalBarGeo, protectionMaterial);
    horizontalBottonBar.position.x = barThick / 2;
    horizontalBottonBar.position.y = -height + barWidth / 2;
    horizontalBottonBar.castShadow = true;
    protectionGroup.add(horizontalBottonBar);

    const horizontalMiddleBar = horizontalBottonBar.clone();
    horizontalMiddleBar.position.y = -height / 2;
    protectionGroup.add(horizontalMiddleBar);

    const verticalSupportGeo = new THREE.BoxGeometry(0.05, height, 0.15);
    const support = new THREE.Mesh(verticalSupportGeo, protectionMaterial);
    const supportX = barThick;
    support.castShadow = true;
    support.position.x = supportX;
    support.position.y = -height / 2;

    const space = (length - barWidth) / (numSupports - 1);
    const start = -length / 2 + barWidth / 2;
    for (let i = 0; i < numSupports; i += 1) {
        const sup = support.clone();
        sup.position.z = start + space * i;
        protectionGroup.add(sup);
    }
    return protectionGroup;
}